// View-only logins: only ticked systems, nothing private, nothing editable, separate from the customer portal.
import { DatabaseSync } from 'node:sqlite';
import worker from './worker/index.js';
const sql = new DatabaseSync(':memory:');
const mk = (q, args = []) => ({ bind: (...a) => mk(q, a), all: async () => ({ results: sql.prepare(q).all(...args) }), first: async () => sql.prepare(q).get(...args) ?? null, run: async () => { const r = sql.prepare(q).run(...args); return { meta: { changes: Number(r.changes) } }; } });
const DB = { prepare: q => mk(q), batch: async st => { for (const s of st) await s.run(); return []; } };
const store = new Map();
const FILES = { put: async (k, v) => store.set(k, v), get: async k => store.has(k) ? { arrayBuffer: async () => store.get(k) } : null, delete: async k => store.delete(k) };
const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k1' };
const b = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const mkTok = async (email, aud = 'AUD') => { const h = b({ alg: 'RS256', kid: 'k1' }), p = b({ iss: 'https://t.cloudflareaccess.com', aud: [aud], exp: Math.floor(Date.now() / 1000) + 600, email }); return `${h}.${p}.${Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(h + '.' + p))).toString('base64url')}`; };
const sent = [];
globalThis.fetch = async (u, o) => {
  u = String(u);
  if (u.includes('resend')) { sent.push(JSON.parse(o.body)); return { ok: true, json: async () => ({}) }; }
  if (u.includes('turnstile')) return { ok: true, json: async () => ({ success: true }) };
  return { ok: true, json: async () => ({ keys: [jwk] }) };
};
const O = 'https://overwatchseptic.com';
const env = { OPERATOR_NAME: 'Joshua Klein', OPERATOR_CERT: 'SS-1019571', DB, FILES, ASSETS: { fetch: async r => { const p = new URL(r.url).pathname; return p === '/c/index.html' ? new Response(null, { status: 307, headers: { location: '/c/' } }) : new Response('A:' + p); } }, ACCESS_TEAM_DOMAIN: 't.cloudflareaccess.com', ACCESS_AUD: 'AUD', ADMIN_EMAILS: 'joshua@overwatchseptic.com', ALLOWED_ORIGINS: O, TURNSTILE_SECRET: 's', RESEND_API_KEY: 'k', MAIL_TO: 'joshua@overwatchseptic.com', MAIL_FROM: 'O <joshua@overwatchseptic.com>' };
const call = (path, o = {}) => worker.fetch(new Request(O + path, o), env);
const tok = await mkTok('Joshua@overwatchseptic.com');
const adm = (path, body, extra = {}) => call(path, { method: body === undefined ? 'GET' : 'POST', headers: { 'cf-access-jwt-assertion': tok, origin: O, 'content-type': 'application/json', ...extra }, body: body === undefined ? undefined : (body instanceof ArrayBuffer ? body : JSON.stringify(body)) });
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log(c ? 'PASS' : 'FAIL', m); };
const J = async r => r.json();
const mkC = async (name, email) => (await J(await adm('/admin/api/customer', { name, email, phone: '919-555-0100', address: '1 Main St, Moncure, NC', county: 'Chatham', sys_type: 'Vd' }))).id;
const sean = await mkC('Sean Wilkins', 'srw@home.com'), bob = await mkC('Bob Jones', 'bob@home.com');
const reqLink = async email => { sent.length = 0; await call('/login/api/request', { method: 'POST', headers: { origin: O, 'content-type': 'application/json', 'cf-connecting-ip': '4.4.4.' + email.length }, body: JSON.stringify({ email, token: 't' }) }); const m = sent[0] && sent[0].text.match(/verify\?t=([A-Za-z0-9_-]+)/); return m ? m[1] : null; };
const verify = async t => { const r = await call('/login/verify', { method: 'POST', headers: { origin: O, 'content-type': 'application/x-www-form-urlencoded' }, body: 't=' + t }); return { loc: r.headers.get('location'), ck: (r.headers.get('set-cookie') || '').split(';')[0] }; };
const as = ck => (p, o = {}) => call(p, { ...o, headers: { cookie: ck, origin: O, 'content-type': 'application/json' } });

// admin: create Jack, tick Sean only
let j = await J(await adm('/admin/api/viewer', { name: 'Jack Harman', email: 'jack@example.com', customer_ids: [sean], invite: true }));
ok(j.ok && j.emailed && sent.some(m => m.to.includes('jack@example.com') && /verify\?t=/.test(m.text) && /7 days/.test(m.text)), 'save and invite emails a 7-day sign-in link');
const jid = j.id;
ok((await adm('/admin/api/viewer', { name: 'X', email: 'srw@home.com', customer_ids: [] })).status === 400, "a customer's email can't be a view-only login");
ok((await adm('/admin/api/viewer', { name: 'Y', email: 'jack@example.com', customer_ids: [] })).status === 400, 'no duplicate viewer emails');
let L = await J(await adm('/admin/api/viewers')); ok(L.viewers.length === 1 && L.viewers[0].customer_ids.join() === sean && L.customers.length === 2, 'admin lists viewers with their ticked systems');
// sign in from /login/ with his email
const t = await reqLink('jack@example.com'); ok(!!t, '/login/ sends a viewer a link too');
const v = await verify(t); ok(v.loc === '/view/' && v.ck, 'a viewer lands on /view/, not the portal');
const jack = as(v.ck);
ok((await jack('/portal/api/me')).status === 401, "a viewer session can't open the customer portal");
j = await J(await jack('/view/api/systems')); ok(j.ok && j.systems.length === 1 && j.systems[0].name === 'Sean Wilkins', 'he sees only the ticked system');
ok((await J(await adm('/admin/api/viewers'))).viewers[0].last_login !== '', 'last sign-in is recorded');
// case with public and private notes
const pid = (await J(await adm('/admin/api/customer/' + sean))).people[0].id;
const k = await J(await adm('/admin/api/case', { customer_id: sean, contact_id: pid, title: 'Broken lids' }));
await adm('/admin/api/case-comment', { case_id: k.id, body: 'Ordering lids this week.', visibility: 'public', channel: 'note', minutes: 30 });
await adm('/admin/api/case-comment', { case_id: k.id, body: 'PRIVATE cost note $45', visibility: 'private', channel: 'note' });
await adm('/admin/api/estimate', { customer_id: sean, title: 'Lids', lines: [{ type: 'part', desc: 'Lid', qty: 4, cost: 45, markup: 30 }] });
ok((await J(await adm('/admin/api/case/' + k.id))).case.comments.some(c => c.visibility === 'private' && /PRIVATE/.test(c.body)), 'test setup: the private note exists');
j = await J(await jack('/view/api/system/' + sean)); const raw = JSON.stringify(j);
ok(j.ok && j.customer.name === 'Sean Wilkins' && j.cases.length === 1 && j.cases[0].comments.some(c => /Ordering lids/.test(c.body)), 'system page: details and open cases with public notes');
ok(!/PRIVATE|srw@home\\.com|919-555-0100|"minutes"|estimate|invoice|"cost"/.test(raw) && !('email' in j.customer) && !('phone' in j.customer), 'no private notes, customer email or phone, time, estimates, invoices or costs');
ok((await jack('/view/api/system/' + bob)).status === 404, "an unticked system is not found");
ok((await jack('/view/api/system/' + bob + '/photo/' + 'a'.repeat(20) + '/1')).status === 404, "no photos from unticked systems");
ok((await jack('/view/api/systems', { method: 'POST', body: '{}' })).status === 405 && (await jack('/portal/api/case', { method: 'POST', body: JSON.stringify({ title: 'x', body: 'y' }) })).status === 401, 'view only: nothing can be posted');
ok((await J(await adm('/admin/api/viewer-log/' + jid))).log.some(x => /opened Sean Wilkins/.test(x.what)), 'what he opened is logged for you');
// a customer can't use the viewer API
const st = await reqLink('srw@home.com'), sv = await verify(st); ok(sv.loc === '/portal/' && (await as(sv.ck)('/view/api/systems')).status === 401, "a customer session can't open the viewer page");
// change ticks, then remove access
await adm('/admin/api/viewer', { id: jid, name: 'Jack Harman', email: 'jack@example.com', customer_ids: [bob] });
j = await J(await jack('/view/api/systems')); ok(j.systems.length === 1 && j.systems[0].name === 'Bob Jones' && (await jack('/view/api/system/' + sean)).status === 404, 'unticking takes effect right away');
await adm('/admin/api/viewer-delete', { id: jid });
ok((await jack('/view/api/systems')).status === 401 && !(await reqLink('jack@example.com')), 'remove access signs him out and stops new links');
await adm('/admin/api/customer-delete', { id: bob }); ok(true, 'customer delete with viewer links runs');
console.log(fail ? fail + ' FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
