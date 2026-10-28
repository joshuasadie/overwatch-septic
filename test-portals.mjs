// End-to-end API test for the admin portal, signing page and customer portal, using an in-memory SQLite stand-in for D1.
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
const env = { DB, FILES, ASSETS: { fetch: async r => { const p = new URL(r.url).pathname; return p === '/c/index.html' ? new Response(null, { status: 307, headers: { location: '/c/' } }) : new Response('A:' + p); } }, ACCESS_TEAM_DOMAIN: 't.cloudflareaccess.com', ACCESS_AUD: 'AUD', ADMIN_EMAILS: 'joshua@overwatchseptic.com', ALLOWED_ORIGINS: O, TURNSTILE_SECRET: 's', RESEND_API_KEY: 'k', MAIL_TO: 'joshua@overwatchseptic.com', MAIL_FROM: 'O <joshua@overwatchseptic.com>' };
const call = (path, o = {}) => worker.fetch(new Request(O + path, o), env);
const tok = await mkTok('Joshua@overwatchseptic.com');
const adm = (path, body, extra = {}) => call(path, { method: body === undefined ? 'GET' : 'POST', headers: { 'cf-access-jwt-assertion': tok, origin: O, 'content-type': 'application/json', ...extra }, body: body === undefined ? undefined : (body instanceof ArrayBuffer ? body : JSON.stringify(body)) });
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log(c ? 'PASS' : 'FAIL', m); };
const J = async r => r.json();

// access control
ok((await call('/admin/api/customers')).status === 401, 'admin refuses no Access token');
ok((await call('/admin/api/customers', { headers: { 'cf-access-jwt-assertion': await mkTok('evil@x.com') } })).status === 401, 'admin refuses other email');
ok((await call('/admin/api/customers', { headers: { 'cf-access-jwt-assertion': await mkTok('joshua@overwatchseptic.com', 'OTHER') } })).status === 401, 'admin refuses wrong audience');
ok((await adm('/admin/api/customer', { name: 'X', email: 'x@y.com', address: '1 Oak St' }, { origin: 'https://evil.com' })).status === 403, 'admin POST refuses foreign origin');

// customers
let r = await adm('/admin/api/customer', { name: 'Ann Home', email: 'Ann@Home.com', phone: '919-555-1111', address: '12 Oak St, Pittsboro', county: 'Chatham', sys_type: 'V', permit: 'P-1' });
let j = await J(r); ok(j.ok && j.id, 'customer created'); const cid = j.id;
ok((await adm('/admin/api/customer', { name: 'Dup', email: 'ann@home.com', address: '9 Oak St' })).status === 409, 'duplicate email refused');
ok((await adm('/admin/api/customer', { name: '', email: 'q@q.com', address: '9 Oak St' })).status === 400, 'name required');
j = await J(await adm('/admin/api/customers')); ok(j.customers.length === 1 && j.customers[0].email === 'ann@home.com' && j.customers[0].contract === 'none', 'listed, email lowercased');

// contract send
const terms = { contractor_name: 'Overwatch Septic, LLC', contractor_address: 'PO Box 1, Pittsboro NC', health_dept: 'Chatham County Environmental Health', annual_fee: '500', maintenance: ['Check the pump'] };
ok((await adm('/admin/api/contract', { customer_id: cid, terms: { ...terms, annual_fee: '' } })).status === 400, 'fee required');
ok((await adm('/admin/api/contract', { customer_id: cid, terms: { ...terms, annual_fee: 'abc' } })).status === 400, 'fee must be numeric');
ok((await adm('/admin/api/contract', { customer_id: cid, terms: { ...terms, annual_fee: '', inspection_fee: 'abc', visits: '2' } })).status === 400, 'per-inspection fee must be numeric');
ok((await adm('/admin/api/contract', { customer_id: cid, terms: { ...terms, annual_fee: '', inspection_fee: '250', visits: '3' } })).status === 400, 'inspections per year must be a permit choice');
ok((await adm('/admin/api/contract', { customer_id: cid, terms: { ...terms, rule_set: '18X' } })).status === 400, 'rule set must be 18A or 18E');
{ const ct = await import('./site/contract-text.js'), base = { ...terms, owner_name: 'Ann', county: 'Chatham', sys_type: 'IIIb', date: '2026-10-01' };
  const p2 = v => ct.contractText({ ...base, annual_fee: String(ct.annualFrom(250, v)), inspection_fee: '250', visits: v }).sections[1].p[0];
  ok(/\$250\.00 per inspection for the two \(2\) inspections per year required by the Operation Permit, for a total of \$500\.00 per year/.test(p2('2')), 'twice a year: $250 each, $500 a year');
  ok(/four \(4\) in the first year and two \(2\) per year thereafter, for a total of \$1,000\.00 in the first year and \$500\.00 per year thereafter/.test(p2('q1s')), 'quarterly first year: $1,000 then $500');
  ok(/beyond those required by the Operation Permit will be billed/.test(p2('2')), 'extra visits billed separately');
  ok(ct.ruleSetFor('2024-01-01') === '18E' && ct.ruleSetFor('2023-12-31') === '18A' && ct.ruleSetFor('') === '', 'rules follow the permit date');
  { const e = JSON.stringify(ct.contractText({ ...base, rule_set: '18E' })); ok(/within thirty \(30\) days of the inspection, as required by 15A N\.C\. Administrative Code 18E \.1304\(c\)/.test(e) && !/18A/.test(e), '18E agreement: 30-day reports, no 18A citations'); }
  ok(JSON.stringify(ct.contractText({ ...base, rule_set: '18A' })) === JSON.stringify(ct.contractText({ ...base })), '18A agreement matches the original wording');
  ok(ct.annualFrom(250, 'q1s') === 500 && ct.annualFrom(250, '4') === 1000, 'annual fee is the steady yearly total');
  ok(ct.contractText({ ...base }).sections[1].p[0].startsWith('a) The Owner shall pay to the Contractor the sum of $500 per year for periodic'), 'older agreements keep their exact wording'); }
sent.length = 0; j = await J(await adm('/admin/api/contract', { customer_id: cid, terms: { ...terms, annual_fee: '', inspection_fee: '250', visits: 'q1s', rule_set: '18E' } })); ok(j.ok && j.emailed, 'contract sent (priced per inspection, 18E)');
{ const k = (await J(await adm('/admin/api/customer/' + cid))).contracts[0]; ok(k.terms.annual_fee === '500' && k.terms.inspection_fee === '250' && k.terms.visits === 'q1s', 'stored: $250 per inspection, annual fee $500');
  ok(k.terms.rule_set === '18E' && /18E \.1303\(b\)/.test(k.terms.cite) && /Table XXXII/.test(JSON.stringify(k.text)) && !/Table V/.test(JSON.stringify(k.text)), 'stored 18E agreement cites 18E and Table XXXII'); }
const link = sent[0].text.match(/https:\/\/overwatchseptic\.com\/c\/([A-Za-z0-9_-]+)/); ok(!!link && sent[0].to[0] === 'ann@home.com', 'email has unique link');
const t1 = link[1];
ok((await call('/c/' + t1)).status === 200 && (await (await call('/c/' + t1)).text()) === 'A:/c/', 'signing page served for token path (no redirect that would drop the token)');
j = await J(await call('/api/contract/' + t1)); ok(j.ok && j.contract.status === 'sent' && /Overwatch Septic, LLC/.test(JSON.stringify(j.contract.text)) && /\$500/.test(JSON.stringify(j.contract.text)), 'token shows contract with fee');
ok(!JSON.stringify(j).includes(t1), 'token not echoed');
ok((await call('/api/contract/aaaaaaaaaaaaaaaaaaaaaaaa')).status === 404, 'bad token 404');
const sign = (name, agree = true, origin = O) => call('/api/contract/' + t1 + '/sign', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ name, agree }) });
ok((await sign('Ann Home', true, 'https://evil.com')).status === 403, 'sign refuses foreign origin');
ok((await sign('Ann Home', false)).status === 400, 'must agree');
ok((await sign('A')).status === 400, 'name too short');
sent.length = 0; ok((await sign('Ann Home')).status === 200, 'owner signs');
ok(sent.some(m => m.to[0] === 'joshua@overwatchseptic.com' && /Sign now/.test(m.subject)), 'you are told to countersign');
ok((await sign('Ann Home')).status === 400, 'cannot sign twice');
// countersign
j = await J(await adm('/admin/api/customer/' + cid)); const kid = j.contracts[0].id; ok(j.contracts[0].status === 'owner_signed', 'status owner_signed');
ok((await adm('/admin/api/contract-void', { id: kid }).then(J)).ok, 'void allowed before complete (then re-create)');
j = await J(await adm('/admin/api/contract', { customer_id: cid, terms })); const t2 = sent[sent.length - 1].text.match(/\/c\/([A-Za-z0-9_-]+)/)[1];
await call('/api/contract/' + t2 + '/sign', { method: 'POST', headers: { origin: O, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Ann Home', agree: true }) });
j = await J(await adm('/admin/api/customer/' + cid)); const k2 = j.contracts.find(c => c.status === 'owner_signed').id;
sent.length = 0; r = await adm('/admin/api/contract-sign', { id: k2, name: 'Joshua Klein' }); ok((await J(r)).ok, 'countersigned');
ok(sent[0].to[0] === 'ann@home.com', 'customer told it is complete');
ok((await adm('/admin/api/contract-void', { id: k2 })).status === 400, 'complete cannot be voided');
ok((await adm('/admin/api/contract-sign', { id: k2, name: 'Joshua Klein' })).status === 400, 'cannot countersign twice');
ok((await adm('/admin/api/customer-delete', { id: cid })).status === 400, 'customer with signed contract cannot be deleted');

// reports
ok((await adm('/admin/api/report', { customer_id: cid, visit_date: 'bad' })).status === 400, 'report date required');
j = await J(await adm('/admin/api/report', { customer_id: cid, visit_date: '2026-04-04', readings: { pump_min: '4.1', sludge_in: '8', water_gpd: 'x' }, checks: [{ label: 'Alarm', status: 'pass' }, { label: 'Drain field', status: 'bogus' }], notes: 'ok' })); const rid = j.id; ok(j.ok, 'report saved');
await adm('/admin/api/report-finish', { id: rid, amount: '0' });
let r2 = await J(await adm('/admin/api/report', { customer_id: cid, visit_date: '2026-10-03', readings: { pump_min: 4.3, sludge_in: 13, water_gpd: 215 }, checks: [{ label: 'Alarm', status: 'repair' }] })); await adm('/admin/api/report-finish', { id: r2.id, amount: '0' });
j = await J(await adm('/admin/api/customer/' + cid)); const rp = j.reports.find(x => x.id === rid);
ok(rp.readings.pump_min === 4.1 && rp.readings.water_gpd === undefined && rp.checks[1].status === 'na', 'readings validated, bad status becomes n/a');
const pdf = new TextEncoder().encode('%PDF-1.4\n' + 'x'.repeat(200)).buffer;
ok((await call('/admin/api/reports/' + rid + '/pdf', { method: 'POST', headers: { 'cf-access-jwt-assertion': tok, origin: O, 'content-type': 'application/pdf' }, body: new TextEncoder().encode('not a pdf ' + 'x'.repeat(200)) })).status === 400, 'non-PDF refused');
ok((await call('/admin/api/reports/' + rid + '/pdf', { method: 'POST', headers: { 'cf-access-jwt-assertion': tok, origin: O, 'content-type': 'application/pdf' }, body: pdf })).status === 200, 'PDF uploaded');
sent.length = 0; ok((await J(await adm('/admin/api/report-notify', { id: rid }))).ok && sent[0].to[0] === 'ann@home.com', 'report notification emailed');

// customer sign-in
const lreq = (email, ip = '2.2.2.2') => call('/login/api/request', { method: 'POST', headers: { origin: O, 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify({ email, token: 't' }) });
sent.length = 0; r = await lreq('stranger@x.com'); j = await J(r); ok(r.status === 200 && j.ok && sent.length === 0, 'unknown email: same answer, no email');
r = await lreq('ANN@home.com'); ok(r.status === 200 && sent.length === 1, 'customer gets sign-in email (case-insensitive)');
const lt = sent[0].text.match(/verify\?t=([A-Za-z0-9_-]+)/)[1];
r = await call('/login/verify?t=' + lt); ok(r.status === 200 && /<form method="POST"/.test(await r.text()), 'GET shows confirm button only');
r = await call('/login/verify?t=' + lt); ok(r.status === 200, 'GET does not consume the link');
ok((await call('/portal/api/me')).status === 401, 'portal needs session');
const vpost = (t, extra = {}) => call('/login/verify', { method: 'POST', headers: { origin: O, 'content-type': 'application/x-www-form-urlencoded', ...extra }, body: 't=' + t });
ok((await vpost(lt, { origin: 'https://evil.com' })).status === 403, 'verify refuses foreign origin');
r = await vpost(lt); const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
ok(r.status === 303 && /^__Host-ow_session=/.test(cookie) && /HttpOnly/.test(r.headers.get('set-cookie')) && /Secure/.test(r.headers.get('set-cookie')), 'POST signs in with secure cookie');
ok((await vpost(lt)).status === 400, 'link works once');
const me = (path = '/portal/api/me', o = {}) => call(path, { ...o, headers: { cookie, origin: O, 'content-type': 'application/json', ...(o.headers || {}) } });
j = await J(await me()); ok(j.ok && j.customer.name === 'Ann Home' && j.contracts.length === 1 && j.reports.length === 2, 'portal data: contracts + reports');
ok(j.contracts.every(c => c.status !== 'void'), 'void contracts hidden');
ok(!JSON.stringify(j).includes('owner_token') && !JSON.stringify(j).includes('notes":"private'), 'no secrets in portal data');
r = await me('/portal/api/reports/' + rid + '/pdf'); ok(r.status === 200 && r.headers.get('content-type') === 'application/pdf', 'customer downloads own PDF');

// another customer cannot see it
j = await J(await adm('/admin/api/customer', { name: 'Bob', email: 'bob@x.com', address: '5 Elm St' }));
sent.length = 0; await lreq('bob@x.com', '3.3.3.3'); const bt = sent[0].text.match(/verify\?t=([A-Za-z0-9_-]+)/)[1];
const bc = (await vpost(bt)).headers.get('set-cookie').split(';')[0];
const bme = (path, o = {}) => call(path, { ...o, headers: { cookie: bc, origin: O, 'content-type': 'application/json' } });
j = await J(await bme('/portal/api/me')); ok(j.contracts.length === 0 && j.reports.length === 0, 'other customer sees nothing of Ann');
ok((await bme('/portal/api/reports/' + rid + '/pdf')).status === 404, 'other customer cannot fetch Ann PDF');
// portal signing of own pending contract
j = await J(await adm('/admin/api/contract', { customer_id: (await J(await adm('/admin/api/customers'))).customers.find(c => c.name === 'Bob').id, terms: { ...terms, county: 'Orange', sys_type: 'V' } }));
const bobK = (await J(await bme('/portal/api/me'))).contracts[0].id;
ok((await bme('/portal/api/contracts/' + bobK + '/sign', { method: 'POST', body: JSON.stringify({ name: 'Bob Smith', agree: true }) })).status === 200, 'customer signs from portal');
ok((await me('/portal/api/contracts/' + bobK + '/sign', { method: 'POST', body: JSON.stringify({ name: 'Ann Home', agree: true }) })).status === 404, 'cannot sign another customer contract');
// logout
r = await me('/portal/api/logout', { method: 'POST', body: '{}' }); ok(r.status === 200, 'logout');
ok((await me()).status === 401, 'session gone after logout');
// rate limit
for (let i = 0; i < 6; i++) r = await lreq('ann@home.com', '9.9.9.' + i);
ok(r.status === 429, 'sign-in requests rate limited per email');
// delete report
ok((await J(await adm('/admin/api/report-delete', { id: rid }))).ok && !store.has('reports/' + rid + '.pdf'), 'report deleted with its PDF');
// existing form still works
r = await call('/api/request', { method: 'POST', headers: { origin: O, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Z', address: '1 Oak', need: 'alarm', phone: '919-555-1111', email: 'z@z.com', consent: true, token: 't' }) }); ok(r.status === 200, 'public request form still works');
// test customers: deletable even when signed, with the name typed
j = await J(await adm('/admin/api/customer/' + cid)); const cu = j.customer;
ok(j.customer.test === false, 'customer is not a test customer by default');
ok((await J(await adm('/admin/api/customer', { id: cid, name: cu.name, email: cu.email, phone: cu.phone, address: cu.address, county: cu.county, sys_type: cu.sys_type, permit: cu.permit, notes: cu.notes, test: true }))).ok, 'mark as test customer');
ok((await J(await adm('/admin/api/customers'))).customers.find(c => c.id === cid).test === true, 'list shows the test flag');
ok((await adm('/admin/api/customer-delete', { id: cid })).status === 400, 'test customer with signed contract needs the name typed');
ok((await adm('/admin/api/customer-delete', { id: cid, confirm: 'Someone Else' })).status === 400, 'wrong name refused');
ok((await J(await adm('/admin/api/customer-delete', { id: cid, confirm: ' ' + cu.name.toUpperCase() + ' ' }))).ok, 'right name deletes a signed test customer');
ok(!(await J(await adm('/admin/api/customers'))).customers.some(c => c.id === cid), 'test customer is gone');
ok(sql.prepare("SELECT COUNT(*) AS n FROM contracts WHERE customer_id = ?").get(cid).n === 0 && sql.prepare("SELECT COUNT(*) AS n FROM test_customers WHERE customer_id = ?").get(cid).n === 0, 'its contracts and flag are removed');
ok(sql.prepare("SELECT COUNT(*) AS n FROM audit WHERE action = 'test-customer-deleted'").get().n === 1, 'deletion is logged');
console.log(fail ? fail + ' FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
