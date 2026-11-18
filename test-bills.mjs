// Invoices to anyone (INV-00101…): seeds, drafts, send with PDF, pay link, reminders, paid, void.
import { DatabaseSync } from 'node:sqlite';
import { runDaily } from "./worker/billing.js";
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
let fail = 0, r2; const ok = (c, m) => { if (!c) fail++; console.log(c ? 'PASS' : 'FAIL', m); };
const J = async r => r.json();
const pdf = Buffer.from('%PDF-1.4 test').toString('base64');
// seeds: Jack Harman and his draft
let L = await J(await adm('/admin/api/bills'));
const jack = L.contacts.find(c => c.name === 'Jack Harman');
ok(jack && jack.email === 'jackharman53@gmail.com' && jack.address === '2112 White Oak Road, Raleigh, NC 27608', 'Jack Harman is in Contacts with his address');
const draft = L.bills.find(b => b.no === 'INV-00101');
ok(draft && draft.state === 'draft' && draft.total_cents === 250000 && draft.greet === 'Jack' && draft.lines.length === 3 && draft.contact_id === jack.id, 'his $2,500 invoice INV-00101 is waiting as a draft');
ok(L.next_no === 'INV-00102', 'the next invoice is INV-00102');
const kc = await J(await adm('/admin/api/contacts'));
ok(kc.kinds.includes('Engineer') && kc.contacts.find(c => c.name === 'Jack Harman').kind === 'Engineer', 'Jack is filed as an Engineer');
// validation
ok((await adm('/admin/api/bill', { bill_name: '', bill_email: 'a@b.com', lines: [{ desc: 'x' }], total: 10 })).status === 400, 'needs a name');
ok((await adm('/admin/api/bill', { bill_name: 'A', bill_email: 'nope', lines: [{ desc: 'x' }], total: 10 })).status === 400, 'needs a valid email');
ok((await adm('/admin/api/bill', { bill_name: 'A', bill_email: 'a@b.com', lines: [], total: 10 })).status === 400, 'needs a line');
ok((await adm('/admin/api/bill', { bill_name: 'A', bill_email: 'a@b.com', lines: [{ desc: 'x' }], total: '' })).status === 400, 'needs a total');
ok((await adm('/admin/api/bill', { bill_name: 'A', bill_email: 'a@b.com', lines: [{ desc: 'x', amount: '' }], per_line: true })).status === 400, 'priced lines need amounts');
ok((await adm('/admin/api/bill', { bill_name: 'A', bill_email: 'a@b.com', lines: [{ desc: 'x' }], total: 10, pay_online: false, pay_check: false })).status === 400, 'needs a way to pay');
// send Jack's
ok((await adm('/admin/api/bill-send', { id: draft.id, pdf: '' })).status === 400, 'no PDF, no send');
sent.length = 0;
let r = await J(await adm('/admin/api/bill-send', { id: draft.id, pdf }));
const m = sent.find(x => x.to[0] === 'jackharman53@gmail.com');
ok(r.ok && m && m.attachments[0].filename === 'INV-00101.pdf' && m.attachments[0].content === pdf, 'emailed to Jack with INV-00101.pdf attached');
ok(m.text.startsWith('Hello Jack,') && m.text.includes('$2,500.00') && m.text.includes('/pay/' + draft.id) && m.text.includes('check payable to Overwatch Septic, LLC') && m.html.includes('Pay online'), 'the email has the amount, Pay link and check instructions');
ok(sent.some(x => x.to[0] === 'joshua@overwatchseptic.com' && x.subject.startsWith('[Copy] Invoice INV-00101')), 'you get a copy');
const inv = sql.prepare('SELECT * FROM invoices WHERE id = ?').get(draft.id);
ok(inv && inv.kind === 'bill' && inv.customer_id === '' && inv.amount_cents === 250000 && inv.status === 'open', 'an open invoice now exists');
ok((await adm('/admin/api/bill', { id: draft.id, bill_name: 'X', bill_email: 'a@b.com', lines: [{ desc: 'x' }], total: 1 })).status === 409, "a sent invoice can't be edited");
let rows = (await J(await adm('/admin/api/invoices'))).invoices, row = rows.find(i => i.id === draft.id);
ok(row && row.customer_name === 'John R. Harman, P.E.' && row.inv_no === 'INV-00101' && row.due_date, 'it shows in the Invoices list');
const pay = await call('/pay/' + draft.id);
ok(pay.status === 503 && (await pay.text()).includes('not set up'), 'the pay link reaches the payment step (Stripe not set in tests)');
// resend
sent.length = 0; r = await J(await adm('/admin/api/bill-send', { id: draft.id, pdf }));
ok(r.ok && sent.filter(x => x.to[0] === 'jackharman53@gmail.com').length === 1, 'resend emails it again');
// daily: reminder at 15 days, alert when past due, never the county
const sentAt = new Date(inv.created_at), day = n => new Date(sentAt.getTime() + n * 864e5);
sent.length = 0; await runDaily(env, day(5));
ok(!sent.some(x => x.to[0] === 'jackharman53@gmail.com'), 'no reminder in the first two weeks');
await runDaily(env, day(15));
ok(sent.filter(x => x.to[0] === 'jackharman53@gmail.com' && x.subject.startsWith('Reminder: invoice INV-00101')).length === 1, 'one reminder at 15 days');
sent.length = 0; await runDaily(env, day(16)); await runDaily(env, day(25));
ok(!sent.length, 'only one reminder');
await runDaily(env, day(31));
ok(sent.length === 1 && sent[0].to[0] === 'joshua@overwatchseptic.com' && sent[0].subject.includes('INV-00101 past due'), 'past due: only you are told');
sent.length = 0; await runDaily(env, day(45));
ok(!sent.length, 'and only once; nothing to the county, ever');
// paid by check
sent.length = 0; r = await J(await adm('/admin/api/invoice-paid', { id: draft.id }));
const ty = sent.find(x => x.to[0] === 'jackharman53@gmail.com');
ok(r.ok && ty && ty.text.startsWith('Hello Jack,') && ty.text.includes('invoice INV-00101') && ty.text.includes('Thank you for your business'), 'recording the check thanks Jack');
ok(sql.prepare('SELECT released_at FROM invoices WHERE id = ?').get(draft.id).released_at, 'a paid invoice is done right away (nothing held)');
rows = (await J(await adm('/admin/api/invoices'))).invoices; ok(!rows.find(i => i.id === draft.id), 'and leaves the open list');
let bb = (await J(await adm('/admin/api/bill/' + draft.id))).bill; ok(bb.status === "paid", "the invoice shows paid");
// a new person, priced lines, Save to Contacts, no reminders, check only; then void
r = await J(await adm('/admin/api/bill', { bill_name: 'Pat Lee', bill_company: 'Lee Builders', bill_email: 'pat@lee.com', bill_address: '5 Oak St, Pittsboro, NC', job: 'Lot 7', per_line: true, lines: [{ date: 'Nov 20', desc: 'Pump check', amount: '150' }, { desc: 'Filter', amount: '45.50' }], terms: 15, pay_online: false, reminders: 'none', save_contact: true }));
ok(r.ok && r.no === 'INV-00102', 'next is INV-00102');
bb = (await J(await adm("/admin/api/bill/" + r.id))).bill;
ok(bb.total_cents === 19550 && bb.greet === "Pat" && bb.contact_id, 'priced lines add up; greeting from the first name');
L = await J(await adm('/admin/api/bills')); const pat = L.contacts.find(c => c.name === 'Pat Lee');
ok(pat && pat.address === '5 Oak St, Pittsboro, NC' && pat.company === 'Lee Builders', 'saved to Contacts with the address');
sent.length = 0; await adm('/admin/api/bill-send', { id: r.id, pdf });
const pm = sent.find(x => x.to[0] === 'pat@lee.com');
ok(pm && !pm.text.includes('/pay/') && pm.text.includes('Please mail a check') && pm.text.includes('due ') , 'check only: no Pay link');
const pinv = sql.prepare('SELECT * FROM invoices WHERE id = ?').get(r.id), pAt = new Date(pinv.created_at);
sent.length = 0; await runDaily(env, new Date(pAt.getTime() + 15 * 864e5));
ok(!sent.some(x => x.to[0] === 'pat@lee.com'), 'reminders off: none to Pat');
r2 = await J(await adm('/admin/api/bill-void', { id: r.id }));
ok(r2.ok && sql.prepare('SELECT status FROM invoices WHERE id = ?').get(r.id).status === 'waived' && (await call('/pay/' + r.id).then(x => x.text())).includes('No payment needed'), 'void stops the pay link');
ok(!(await J(await adm('/admin/api/invoices'))).invoices.find(i => i.id === r.id), 'a voided invoice leaves the open list');
// saving a new person's draft twice makes one contact
r = await J(await adm('/admin/api/bill', { bill_name: 'Sam Roe', bill_email: 'sam@roe.com', lines: [{ desc: 'x' }], total: 5, save_contact: true }));
await adm('/admin/api/bill', { id: r.id, contact_id: r.contact_id, bill_name: 'Sam Roe', bill_email: 'sam@roe.com', bill_address: '9 Elm', lines: [{ desc: 'x' }], total: 5, save_contact: true });
ok(sql.prepare("SELECT COUNT(*) AS n FROM contacts WHERE name = 'Sam Roe'").get().n === 1, 'one contact, not two');
// a draft can be deleted
r = await J(await adm('/admin/api/bill', { bill_name: 'Temp', bill_email: 't@t.com', lines: [{ desc: 'x' }], total: 5 }));
await adm('/admin/api/bill-void', { id: r.id }); ok(!(await adm('/admin/api/bill/' + r.id)).ok, 'deleting a draft removes it');

console.log(fail ? fail + ' FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
