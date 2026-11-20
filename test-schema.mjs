// A bad setup statement must not take the whole site down: the rest apply, admin still loads, and the problem is reported.
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA } from './worker/lib.js';
SCHEMA.push('INSERT INTO no_such_table (x) VALUES (1)');
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
const r = await adm('/admin/api/customers'); ok(r.status === 200, 'admin loads even with a bad setup step');
const h = await (await adm('/admin/api/health')).json(); ok(h.schema_problems.length === 1 && /no_such_table/.test(h.schema_problems[0].sql), 'the bad step is reported');
const k = await (await adm('/admin/api/contacts')).json(); ok(k.contacts.some(c => c.name === 'John Moon'), 'the other setup steps still ran');
SCHEMA.pop();
console.log(fail ? fail + ' FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
