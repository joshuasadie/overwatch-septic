// Customer portal: emailed sign-in link (no passwords), then contracts, reports, and readings for that customer only.
import { reply, clean, sha, rand, isoIn, siteOrigin, originOk, getCookie, sendMail, turnstileOk, readJson, esc, EMAIL, ensureSchema } from './lib.js';
import { publicView, signAsOwner } from './contracts.js';
import { checkoutUrl, reportLocked, etDate } from './billing.js';

const COOKIE = '__Host-ow_session', LINK_MIN = 15, SESSION_DAYS = 30;
const sessionCookie = (v, maxAge) => `${COOKIE}=${v}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
const HTML_HEAD = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex, nofollow', 'strict-transport-security': 'max-age=31536000', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" };
const page = (title, body, status = 200) => new Response(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="light dark"><title>${esc(title)} | Overwatch Septic</title><style>:root{--bg:#f4efe5;--ink:#241e17;--btn:#f4efe5}@media(prefers-color-scheme:dark){:root{--bg:#15110d;--ink:#f1e7d3;--btn:#15110d}}body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.6 system-ui,sans-serif}.w{max-width:520px;margin:0 auto;padding:40px 20px}h1{font-size:28px;line-height:1.2;margin:0 0 10px}button{font:600 17px system-ui,sans-serif;background:var(--ink);color:var(--btn);border:0;border-radius:8px;padding:12px 26px;cursor:pointer}a{color:inherit}</style></head><body><div class="w"><h1>${esc(title)}</h1>${body}</div></body></html>`, { status, headers: HTML_HEAD });

async function getSession(request, env) {
  const tok = getCookie(request, COOKIE);
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(tok)) return null;
  const h = await sha(tok);
  const row = await env.DB.prepare('SELECT customer_id, expires_at FROM sessions WHERE hash = ?').bind(h).first();
  if (!row || row.expires_at < new Date().toISOString()) return null;
  const c = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(row.customer_id).first();
  return c ? { customer: c, hash: h } : null;
}

export async function loginRequest(request, env) {
  if (request.method !== 'POST') return reply({ ok: false, error: 'Method not allowed.' }, 405, { allow: 'POST' });
  if (!originOk(request, env)) return reply({ ok: false, error: 'Request not allowed.' }, 403);
  if (!env.DB || !env.TURNSTILE_SECRET || !env.RESEND_API_KEY || !env.MAIL_FROM) return reply({ ok: false, error: 'Sign-in is not available right now. Please email us instead.' }, 503);
  const j = await readJson(request, 4096); if (j.res) return j.res;
  const email = clean(j.body.email, 254).toLowerCase();
  if (!EMAIL.test(email)) return reply({ ok: false, error: 'Please enter a valid email address.' }, 400);
  if (!(await turnstileOk(env, j.body.token))) return reply({ ok: false, error: 'The security check did not pass. Please try again.' }, 400);
  try { await ensureSchema(env); } catch { return reply({ ok: false, error: 'Sign-in is not available right now.' }, 503); }
  const now = new Date().toISOString(), eh = await sha('e:' + email), ih = await sha('i:' + (request.headers.get('cf-connecting-ip') || '')), since = isoIn(-3600e3);
  const ec = (await env.DB.prepare('SELECT COUNT(*) AS c FROM login_log WHERE eh = ? AND at > ?').bind(eh, since).first()).c;
  const ic = (await env.DB.prepare('SELECT COUNT(*) AS c FROM login_log WHERE ih = ? AND at > ?').bind(ih, since).first()).c;
  if (ec >= 5 || ic >= 10) return reply({ ok: false, error: 'Too many sign-in requests. Please wait an hour and try again.' }, 429);
  await env.DB.batch([env.DB.prepare('INSERT INTO login_log (at, eh, ih) VALUES (?, ?, ?)').bind(now, eh, ih), env.DB.prepare('DELETE FROM login_log WHERE at < ?').bind(isoIn(-864e5)), env.DB.prepare('DELETE FROM login_tokens WHERE expires_at < ?').bind(now), env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now)]);
  // The answer is the same whether or not the address is a customer, so the form cannot be used to look up who is one.
  const c = await env.DB.prepare('SELECT id, name FROM customers WHERE email = ?').bind(email).first();
  if (c) {
    const token = rand();
    await env.DB.prepare('INSERT INTO login_tokens (hash, customer_id, expires_at, used) VALUES (?, ?, ?, 0)').bind(await sha(token), c.id, isoIn(LINK_MIN * 60e3)).run();
    await sendMail(env, email, 'Your Overwatch Septic sign-in link', ['Hello,', '', `Use this link within ${LINK_MIN} minutes to sign in to your Overwatch Septic customer portal:`, '', `${siteOrigin(env)}/login/verify?t=${token}`, '', 'If you did not ask for this, you can ignore this email.', '', 'Overwatch Septic, LLC'].join('\n'));
  }
  return reply({ ok: true });
}

export async function loginVerify(request, env) {
  const url = new URL(request.url);
  if (!env.DB) return page('Sign-in unavailable', '<p>Please try again later.</p>', 503);
  try { await ensureSchema(env); } catch { return page('Sign-in unavailable', '<p>Please try again later.</p>', 503); }
  const expired = () => page('This link has expired', '<p>Sign-in links work once and last 15 minutes. <a href="/login/">Request a new link</a>.</p>', 400);
  if (request.method === 'GET') {
    const t = url.searchParams.get('t') || '';
    if (!/^[A-Za-z0-9_-]{30,80}$/.test(t)) return expired();
    const row = await env.DB.prepare('SELECT customer_id FROM login_tokens WHERE hash = ? AND used = 0 AND expires_at > ?').bind(await sha(t), new Date().toISOString()).first();
    if (!row) return expired();
    return page('Sign in', `<p>Confirm to sign in to your customer portal.</p><form method="POST" action="/login/verify"><input type="hidden" name="t" value="${esc(t)}"><button type="submit">Sign in</button></form>`);
  }
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, POST' } });
  if (!originOk(request, env) && request.headers.get('sec-fetch-site') !== 'same-origin') return page('Request not allowed', '<p>Please open the link from your email again.</p>', 403);
  let t = ''; try { t = String((await request.formData()).get('t') || ''); } catch { return expired(); }
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(t)) return expired();
  const h = await sha(t), now = new Date().toISOString();
  const row = await env.DB.prepare('SELECT customer_id FROM login_tokens WHERE hash = ? AND used = 0 AND expires_at > ?').bind(h, now).first();
  if (!row) return expired();
  const used = await env.DB.prepare('UPDATE login_tokens SET used = 1 WHERE hash = ? AND used = 0').bind(h).run();
  if (!used.meta || used.meta.changes !== 1) return expired();
  const sess = rand();
  await env.DB.prepare('INSERT INTO sessions (hash, customer_id, expires_at, created_at) VALUES (?, ?, ?, ?)').bind(await sha(sess), row.customer_id, isoIn(SESSION_DAYS * 864e5), now).run();
  return new Response(null, { status: 303, headers: { location: '/portal/', 'set-cookie': sessionCookie(sess, SESSION_DAYS * 86400), 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
}

export async function portalApi(request, env, path) {
  if (!env.DB) return reply({ ok: false, error: 'Unavailable.' }, 503);
  try { await ensureSchema(env); } catch { return reply({ ok: false, error: 'Unavailable.' }, 503); }
  const s = await getSession(request, env);
  if (!s) return reply({ ok: false, error: 'Please sign in.' }, 401);
  const c = s.customer, method = request.method;
  if (method !== 'GET' && !originOk(request, env)) return reply({ ok: false, error: 'Request not allowed.' }, 403);
  if (path === '/portal/api/me' && method === 'GET') {
    const inv = (await env.DB.prepare('SELECT * FROM invoices WHERE customer_id = ? ORDER BY created_at DESC').bind(c.id).all()).results;
    const held = new Set(inv.filter(i => !i.released_at).map(i => i.ref_id));
    const contracts = (await env.DB.prepare("SELECT * FROM contracts WHERE customer_id = ? AND status != 'void' ORDER BY created_at DESC").bind(c.id).all()).results.map(x => publicView(x, c, held.has(x.id)));
    const states = new Map((await env.DB.prepare('SELECT report_id, released_at FROM report_state WHERE report_id IN (SELECT id FROM reports WHERE customer_id = ?)').bind(c.id).all()).results.map(x => [x.report_id, x.released_at]));
    const reports = (await env.DB.prepare('SELECT id, visit_date, kind, readings, checks, notes, pdf_key FROM reports WHERE customer_id = ? ORDER BY visit_date DESC').bind(c.id).all()).results.map(r => states.has(r.id) && !states.get(r.id) ? { id: r.id, visit_date: r.visit_date, locked: true } : { id: r.id, visit_date: r.visit_date, kind: r.kind, readings: JSON.parse(r.readings), checks: JSON.parse(r.checks), notes: r.notes, has_pdf: !!r.pdf_key });
    const today = etDate();
    const invoices = inv.filter(i => i.status === 'open' || !i.released_at).map(i => ({ id: i.id, kind: i.kind, amount_cents: i.amount_cents, status: i.status, created_date: i.created_date, release_date: i.release_date, flag: i.flag, notice_state: i.notice_state, term_date: i.term_date, visit_date: i.kind === 'visit' ? (reports.find(r => r.id === i.ref_id) || {}).visit_date || '' : '', overdue_days: Math.max(0, Math.round((new Date(today + 'T12:00:00Z') - new Date(i.created_date + 'T12:00:00Z')) / 864e5)) }));
    return reply({ ok: true, customer: { name: c.name, email: c.email, address: c.address, sys_type: c.sys_type }, contracts, reports, invoices, stripe: !!env.STRIPE_SECRET_KEY });
  }
  if (path === '/portal/api/logout' && method === 'POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE hash = ?').bind(s.hash).run();
    return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'set-cookie': sessionCookie('', 0), 'cache-control': 'no-store' } });
  }
  let m = /^\/portal\/api\/contracts\/([a-f0-9]{20})\/sign$/.exec(path);
  if (m && method === 'POST') {
    const j = await readJson(request, 2048); if (j.res) return j.res;
    const row = await env.DB.prepare('SELECT * FROM contracts WHERE id = ? AND customer_id = ?').bind(m[1], c.id).first();
    if (!row) return reply({ ok: false, error: 'Not found.' }, 404);
    const r = await signAsOwner(env, request, row, j.body.name, j.body.agree);
    return r.error ? reply({ ok: false, error: r.error }, r.status || 400) : reply(r);
  }
  m = /^\/portal\/api\/invoices\/([a-f0-9]{20})\/pay$/.exec(path);
  if (m && method === 'POST') {
    const i = await env.DB.prepare("SELECT * FROM invoices WHERE id = ? AND customer_id = ? AND status = 'open'").bind(m[1], c.id).first();
    if (!i) return reply({ ok: false, error: 'This invoice is not open.' }, 404);
    const r = await checkoutUrl(env, i, c);
    return r.error ? reply({ ok: false, error: r.error }, 503) : reply({ ok: true, url: r.url });
  }
  m = /^\/portal\/api\/reports\/([a-f0-9]{20})\/pdf$/.exec(path);
  if (m && method === 'GET') {
    const r = await env.DB.prepare('SELECT pdf_key, visit_date FROM reports WHERE id = ? AND customer_id = ?').bind(m[1], c.id).first();
    const obj = r && r.pdf_key && env.FILES && !(await reportLocked(env, m[1])) ? await env.FILES.get(r.pdf_key) : null;
    if (!obj) return reply({ ok: false, error: 'Not found.' }, 404);
    return new Response(await obj.arrayBuffer(), { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="report-${r.visit_date}.pdf"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
  }
  return reply({ ok: false, error: 'Not found.' }, 404);
}
