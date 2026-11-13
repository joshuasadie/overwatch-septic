// View-only logins (e.g. a mentor): they sign in with an emailed link and see only the systems you tick.
// Never shown: contacts, customer phone or email, private case notes, time, costs, estimates, invoices. Nothing is editable.
// Sessions reuse the portal's login_tokens and sessions tables with customer_id = 'v:<viewer id>', so a viewer
// session can never open the customer portal (that lookup finds no customer) and a customer session never opens this.
import { reply, clean, sha, rand, isoIn, siteOrigin, originOk, getCookie, sendMail, EMAIL, ensureSchema, id } from './lib.js';
import { operatorOf, attachInspections, servePhoto } from './inspection.js';
import { portalCases } from './cases.js';

const COOKIE = '__Host-ow_session', INVITE_DAYS = 7;
const jparse = (s, d) => { try { return JSON.parse(s) ?? d; } catch { return d; } };

// ---- admin
export async function listViewers(env) {
  const viewers = (await env.DB.prepare('SELECT * FROM viewers ORDER BY name').all()).results;
  const links = (await env.DB.prepare('SELECT viewer_id, customer_id FROM viewer_systems').all()).results;
  const customers = (await env.DB.prepare('SELECT c.id, c.name, c.address, c.sys_type, s.data FROM customers c LEFT JOIN systems s ON s.customer_id = c.id ORDER BY c.name').all()).results
    .map(c => { const d = jparse(c.data, {}); return { id: c.id, name: c.name, address: c.address, sys: (d.permit && d.permit.type) || c.sys_type || '', zones: (d.laterals || []).length, zone_word: d.zone_word || '' }; });
  for (const v of viewers) v.customer_ids = links.filter(l => l.viewer_id === v.id).map(l => l.customer_id);
  return { viewers, customers };
}
export async function saveViewer(env, who, b) {
  const name = clean(b.name, 100), email = clean(b.email, 254).toLowerCase();
  if (!name) return { error: 'Enter a name.' };
  if (!EMAIL.test(email)) return { error: 'Enter a valid email address.' };
  if (await env.DB.prepare('SELECT 1 AS x FROM customers WHERE email = ?').bind(email).first()) return { error: 'That email belongs to a customer. Use a different address for a view-only login.' };
  const dup = await env.DB.prepare('SELECT id FROM viewers WHERE email = ?').bind(email).first();
  let vid = b.id ? String(b.id) : '';
  if (dup && dup.id !== vid) return { error: 'There is already a view-only login for that email.' };
  const now = new Date().toISOString();
  if (vid) {
    const cur = await env.DB.prepare('SELECT id FROM viewers WHERE id = ?').bind(vid).first(); if (!cur) return { status: 404, error: 'Not found.' };
    await env.DB.prepare('UPDATE viewers SET name = ?, email = ? WHERE id = ?').bind(name, email, vid).run();
  } else { vid = id(); await env.DB.prepare('INSERT INTO viewers (id, name, email, created_at, last_login) VALUES (?, ?, ?, ?, ?)').bind(vid, name, email, now, '').run(); }
  const ids = [...new Set((Array.isArray(b.customer_ids) ? b.customer_ids : []).map(String))].slice(0, 200);
  const ok = ids.length ? (await env.DB.prepare(`SELECT id FROM customers WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results.map(r => r.id) : [];
  await env.DB.batch([env.DB.prepare('DELETE FROM viewer_systems WHERE viewer_id = ?').bind(vid), ...ok.map(cid => env.DB.prepare('INSERT INTO viewer_systems (viewer_id, customer_id) VALUES (?, ?)').bind(vid, cid))]);
  let emailed = false;
  if (b.invite) emailed = await invite(env, { id: vid, name, email });
  return { ok: true, id: vid, emailed };
}
async function invite(env, v) {
  const token = rand();
  await env.DB.prepare('INSERT INTO login_tokens (hash, customer_id, expires_at, used) VALUES (?, ?, ?, 0)').bind(await sha(token), 'v:' + v.id, isoIn(INVITE_DAYS * 864e5)).run();
  return sendMail(env, v.email, 'Josh Klein shared septic systems with you', [`Hello ${v.name},`, '', 'Josh Klein of Overwatch Septic has shared view-only access to some septic systems with you.', '', `Use this link within ${INVITE_DAYS} days to sign in:`, `${siteOrigin(env)}/login/verify?t=${token}`, '', `Later, you can get a new link any time at ${siteOrigin(env)}/login/ with this email address.`, '', 'Overwatch Septic, LLC'].join('\n'), env.MAIL_TO);
}
export async function deleteViewer(env, who, b) {
  const vid = String(b.id || '');
  await env.DB.batch([env.DB.prepare('DELETE FROM viewer_systems WHERE viewer_id = ?').bind(vid), env.DB.prepare('DELETE FROM sessions WHERE customer_id = ?').bind('v:' + vid), env.DB.prepare('DELETE FROM login_tokens WHERE customer_id = ?').bind('v:' + vid), env.DB.prepare('DELETE FROM viewers WHERE id = ?').bind(vid)]);
  return { ok: true };
}
export async function viewerLog(env, vid) { return (await env.DB.prepare('SELECT at, what FROM viewer_log WHERE viewer_id = ? ORDER BY at DESC LIMIT 50').bind(String(vid)).all()).results; }

// ---- sign-in hooks used by portal.js
export const viewerByEmail = (env, email) => env.DB.prepare('SELECT id, name FROM viewers WHERE email = ?').bind(email).first();
export const isViewerKey = k => typeof k === 'string' && k.startsWith('v:');
export async function touchViewer(env, key) { await env.DB.prepare('UPDATE viewers SET last_login = ? WHERE id = ?').bind(new Date().toISOString(), key.slice(2)).run(); }

// ---- the viewer's own API: /view/api/*
async function session(request, env) {
  const tok = getCookie(request, COOKIE);
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(tok)) return null;
  const h = await sha(tok), row = await env.DB.prepare('SELECT customer_id, expires_at FROM sessions WHERE hash = ?').bind(h).first();
  if (!row || row.expires_at < new Date().toISOString() || !isViewerKey(row.customer_id)) return null;
  const v = await env.DB.prepare('SELECT id, name, email FROM viewers WHERE id = ?').bind(row.customer_id.slice(2)).first();
  return v ? { viewer: v, hash: h } : null;
}
const allowed = (env, vid, cid) => env.DB.prepare('SELECT 1 AS x FROM viewer_systems WHERE viewer_id = ? AND customer_id = ?').bind(vid, cid).first();
const log = (env, vid, what) => env.DB.prepare('INSERT INTO viewer_log (viewer_id, at, what) VALUES (?, ?, ?)').bind(vid, new Date().toISOString(), what).run();

export async function viewerApi(request, env, path) {
  if (!env.DB) return reply({ ok: false, error: 'Unavailable.' }, 503);
  try { await ensureSchema(env); } catch { return reply({ ok: false, error: 'Unavailable.' }, 503); }
  const s = await session(request, env);
  if (!s) return reply({ ok: false, error: 'Please sign in.' }, 401);
  const v = s.viewer, method = request.method;
  if (path === '/view/api/logout' && method === 'POST') {
    if (!originOk(request, env)) return reply({ ok: false, error: 'Request not allowed.' }, 403);
    await env.DB.prepare('DELETE FROM sessions WHERE hash = ?').bind(s.hash).run();
    return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'set-cookie': `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`, 'cache-control': 'no-store' } });
  }
  if (method !== 'GET') return reply({ ok: false, error: 'View only.' }, 405, { allow: 'GET' });
  if (path === '/view/api/systems') {
    const rows = (await env.DB.prepare('SELECT c.id, c.name, c.address, c.sys_type, s.data, (SELECT MAX(visit_date) FROM reports r WHERE r.customer_id = c.id) AS last_visit FROM viewer_systems x JOIN customers c ON c.id = x.customer_id LEFT JOIN systems s ON s.customer_id = c.id WHERE x.viewer_id = ? ORDER BY c.name').bind(v.id).all()).results;
    return reply({ ok: true, viewer: { name: v.name }, systems: rows.map(c => { const d = jparse(c.data, {}); return { id: c.id, name: c.name, address: c.address, sys: (d.permit && d.permit.type) || c.sys_type || '', zones: (d.laterals || []).length, zone_word: d.zone_word || '', last_visit: c.last_visit || '' }; }) });
  }
  let m = /^\/view\/api\/system\/([a-f0-9]{20})$/.exec(path);
  if (m) {
    const cid = m[1]; if (!(await allowed(env, v.id, cid))) return reply({ ok: false, error: 'Not found.' }, 404);
    const c = await env.DB.prepare('SELECT id, name, address, county, sys_type, permit FROM customers WHERE id = ?').bind(cid).first();
    const srow = await env.DB.prepare('SELECT data FROM systems WHERE customer_id = ?').bind(cid).first();
    const sys = srow ? jparse(srow.data, {}) : {};
    if (sys.permit) delete sys.permit.mail; // the owner's mailing address stays private
    const reports = (await env.DB.prepare('SELECT id, visit_date, kind, readings, checks, notes FROM reports WHERE customer_id = ? ORDER BY visit_date DESC').bind(cid).all()).results;
    await attachInspections(env, reports, true);
    const cases = (await portalCases(env, cid)).filter(k => !['Done', 'Duplicate'].includes(k.status));
    await log(env, v.id, `opened ${c.name}`);
    return reply({ ok: true, customer: { id: c.id, name: c.name, address: c.address, county: c.county, sys_type: c.sys_type, permit: c.permit }, system: sys, reports, cases, operator: operatorOf(env) });
  }
  m = /^\/view\/api\/system\/([a-f0-9]{20})\/photo\/([a-f0-9]{20})\/(\d{1,2})$/.exec(path);
  if (m) {
    if (!(await allowed(env, v.id, m[1]))) return reply({ ok: false, error: 'Not found.' }, 404);
    const r = await env.DB.prepare('SELECT id FROM reports WHERE id = ? AND customer_id = ?').bind(m[2], m[1]).first();
    if (!r) return reply({ ok: false, error: 'Not found.' }, 404);
    return servePhoto(env, m[2], Number(m[3]));
  }
  return reply({ ok: false, error: 'Not found.' }, 404);
}
