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
const env = { OPERATOR_NAME: 'Joshua Klein', OPERATOR_CERT: 'SS-1019571', DB, FILES, ASSETS: { fetch: async r => { const p = new URL(r.url).pathname; return p === '/c/index.html' ? new Response(null, { status: 307, headers: { location: '/c/' } }) : new Response('A:' + p); } }, ACCESS_TEAM_DOMAIN: 't.cloudflareaccess.com', ACCESS_AUD: 'AUD', ADMIN_EMAILS: 'joshua@overwatchseptic.com', ALLOWED_ORIGINS: O, TURNSTILE_SECRET: 's', RESEND_API_KEY: 'k', MAIL_TO: 'joshua@overwatchseptic.com', MAIL_FROM: 'O <joshua@overwatchseptic.com>' };
const call = (path, o = {}) => worker.fetch(new Request(O + path, o), env);
const tok = await mkTok('Joshua@overwatchseptic.com');
const adm = (path, body, extra = {}) => call(path, { method: body === undefined ? 'GET' : 'POST', headers: { 'cf-access-jwt-assertion': tok, origin: O, 'content-type': 'application/json', ...extra }, body: body === undefined ? undefined : (body instanceof ArrayBuffer ? body : JSON.stringify(body)) });
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log(c ? 'PASS' : 'FAIL', m); };

const J = async r => r.json();
// ---- cases: numbering, parts and RMAs, comments with time, closing rules, auto-case from a visit, portal view
const mkC = async (name, email) => (await J(await adm('/admin/api/customer', { name, email, address: '1 Main St, Moncure, NC', county: 'Chatham', sys_type: 'Vd' }))).id;
const ann = await mkC('Ann Smith', 'ann@home.com'), bob = await mkC('Bob Jones', 'bob@home.com');
const peopleOf = async cid => (await J(await adm('/admin/api/customer/' + cid))).people;
let ppl = await peopleOf(ann); ok(ppl.length === 1 && ppl[0].primary && ppl[0].name === 'Ann Smith' && ppl[0].email === 'ann@home.com', 'a new customer gets a primary contact');
const annC = ppl[0].id, bobC = (await peopleOf(bob))[0].id;
let jp = await J(await adm('/admin/api/customer-contact', { customer_id: ann, name: 'Stacy Smith', role: 'Co-owner', phone: '919-555-0123', address: 'PO Box 9, Pittsboro, NC' }));
ok(jp.ok, 'add a contact with an optional address'); const stacy = jp.id;
ok((await adm('/admin/api/customer-contact', { customer_id: ann, name: '' })).status === 400, 'a contact needs a name');
ok((await adm('/admin/api/case', { customer_id: ann, title: 'No contact' })).status === 400, 'a case needs a contact');
ok((await adm('/admin/api/case', { customer_id: ann, title: 'Wrong account', contact_id: bobC })).status === 400, "a case can't use another account's contact");
let j = await J(await adm('/admin/api/case', { customer_id: ann, contact_id: stacy, title: 'Zone 3 pressure low', type: 'County action item', due_date: '2026-11-06', description: 'From county report' }));
ok(j.ok && j.no === 'OWS-00101', 'first case is OWS-00101');
const k1 = j.id;
{ const kk = (await J(await adm('/admin/api/case/' + k1))).case; ok(kk.person && kk.person.name === 'Stacy Smith' && kk.contact === 'Stacy Smith' && kk.comments.some(c => /opened by .* for Stacy Smith/.test(c.body)), 'the case is opened in the contact\'s name');
  await adm('/admin/api/case', { id: k1, due_date: '' }); ok((await J(await adm('/admin/api/case/' + k1))).case.due_date === '', 'a due date can be removed');
  await adm('/admin/api/case', { id: k1, due_date: '2026-11-06' });
  ok((await adm('/admin/api/customer-contact', { id: stacy, remove: true })).status === 409, "a contact on a case can't be removed");
  await adm('/admin/api/customer-contact', { id: stacy, name: 'Stacy L. Smith', role: 'Co-owner', primary: true }); const pp = await peopleOf(ann);
  ok(pp[0].name === 'Stacy L. Smith' && pp[0].primary && pp.filter(x => x.primary).length === 1 && (await J(await adm('/admin/api/case/' + k1))).case.contact === 'Stacy L. Smith', 'one primary at a time; renaming updates the case'); 
  await adm('/admin/api/customer-contact', { id: annC, name: 'Ann Smith', role: 'Owner', email: 'ann@home.com', primary: true }); }
j = await J(await adm('/admin/api/case', { customer_id: bob, contact_id: bobC, title: 'Callback' })); ok(j.no === 'OWS-00102', 'numbers count up across customers');
ok((await adm('/admin/api/case', { customer_id: ann, contact_id: annC, title: '' })).status === 400, 'a case needs a title');
j = await J(await adm('/admin/api/case-item', { case_id: k1, kind: 'part', title: 'Pressure regulator', qty: 2, vendor: 'Perc-Rite', eta: '2026-11-05', status: 'Ordered' }));
ok(j.ok && j.no === 'P-000101', 'first part is P-000101'); const p1 = j.id;
{ let kk = (await J(await adm('/admin/api/case/' + k1))).case; ok(kk.items.find(i => i.id === p1).qty === 2 && kk.comments.some(c => /P-000101 created by .*: 2 × Pressure regulator/.test(c.body)), 'a part keeps its quantity');
  await adm('/admin/api/case-item', { id: p1, qty: 3 }); kk = (await J(await adm('/admin/api/case/' + k1))).case; ok(kk.items.find(i => i.id === p1).qty === 3, 'quantity can be changed'); }
j = await J(await adm('/admin/api/case-item', { case_id: k1, kind: 'rma', title: 'Zone valve', status: 'Shipped', tracking: '1Z' }));
ok(j.ok && j.no === 'RMA-0000101', 'first RMA is RMA-0000101'); const r1 = j.id;
j = await J(await adm('/admin/api/case-item', { case_id: k1, kind: 'part', title: 'Float' })); ok(j.no === 'P-000102', 'parts count up on their own');
const p2 = j.id;
// comments: public emailed, private, phone, time
sent.length = 0;
j = await J(await adm('/admin/api/case-comment', { case_id: k1, visibility: 'public', channel: 'overwatch', body: 'The part is on order.', minutes: 45, email: true }));
ok(j.ok && j.emailed && sent.length === 1 && sent[0].to[0] === 'ann@home.com' && sent[0].subject === '[OWS-00101] Zone 3 pressure low' && !/45/.test(sent[0].text), 'public comment emailed with the case number; time not in the email');
await adm('/admin/api/case-comment', { case_id: k1, visibility: 'private', channel: 'phone_out', who: 'Josh', body: 'RMA approved. Do not bill the valve.', minutes: 30 });
await adm('/admin/api/case-comment', { case_id: k1, visibility: 'public', channel: 'phone_in', who: 'Stacy', body: 'Approved the repair.', minutes: 15, at: '2026-11-02T10:18' });
sent.length = 0; j = await J(await adm('/admin/api/case-comment', { case_id: k1, visibility: 'private', body: 'note', email: true })); ok(j.ok && !j.emailed && sent.length === 0, 'private comments are never emailed');
ok((await adm('/admin/api/case-comment', { case_id: k1, body: '' })).status === 400, 'an empty comment is refused');
let k = (await J(await adm('/admin/api/case/' + k1))).case;
ok(k.minutes === 90 && k.items.length === 3 && k.comments[0].seq > k.comments[1].seq, 'time totals from comments; comments newest first');
ok(k.comments.some(c => c.kind === 'event' && /P-000101 created/.test(c.body)) && k.comments.some(c => c.channel === 'phone_in' && c.visibility === 'public'), 'events logged; phone notes can be public');
// closing rules
j = await J(await adm('/admin/api/case', { id: k1, status: 'Done' })); ok(!j.ok && /Can't close yet: P-000101 and RMA-0000101 and P-000102 are open/.test(j.error), 'cannot close with open parts or RMAs');
await adm('/admin/api/case-item', { id: p1, status: 'Installed' }); await adm('/admin/api/case-item', { id: r1, status: 'Credited' }); await adm('/admin/api/case-item', { id: p2, status: 'Cancelled' });
j = await J(await adm('/admin/api/case', { id: k1, status: 'Waiting on vendor' })); ok(j.ok, 'status changes');
k = (await J(await adm('/admin/api/case/' + k1))).case; ok(k.comments.some(c => /Status changed from Open to Waiting on vendor/.test(c.body)), 'status change logged');
// lists
j = await J(await adm('/admin/api/cases')); ok(j.cases.length === 2 && j.meta.status.includes('Waiting on county'), 'open cases list covers every account');
j = await J(await adm('/admin/api/customer/' + ann)); ok(j.cases.length === 1 && j.cases[0].no === 'OWS-00101', 'customer page lists its cases');
// auto-case from a visit with a repair
let rep = await J(await adm('/admin/api/report', { customer_id: ann, visit_date: '2026-10-30', readings: { pump_min: 4 }, checks: [{ label: 'Alarm', status: 'repair' }, { label: 'Lid', status: 'pass' }] }));
await adm('/admin/api/report-finish', { id: rep.id, amount: '0' });
j = await J(await adm('/admin/api/cases?customer_id=' + ann)); const auto = j.cases.find(c => c.source === 'Inspection');
ok(auto && auto.county_due === '2026-11-01' && auto.owner_due === '2026-11-29' && /Alarm/.test(auto.description) && !/Lid/.test(auto.description), 'a repair on a visit opens a case with the 48-hour and 30-day deadlines');
rep = await J(await adm('/admin/api/report', { customer_id: bob, visit_date: '2026-10-30', readings: { pump_min: 4 }, checks: [{ label: 'Alarm', status: 'pass' }] }));
await adm('/admin/api/report-finish', { id: rep.id, amount: '0' });
ok(!(await J(await adm('/admin/api/cases?customer_id=' + bob))).cases.some(c => c.source === 'Inspection'), 'a clean visit opens no case');
// portal
const signIn = async email => { sent.length = 0; await call('/login/api/request', { method: 'POST', headers: { origin: O, 'content-type': 'application/json', 'cf-connecting-ip': '3.3.3.' + email.length }, body: JSON.stringify({ email, token: 't' }) }); const t = sent[0].text.match(/verify\?t=([A-Za-z0-9_-]+)/)[1]; const r = await call('/login/verify', { method: 'POST', headers: { origin: O, 'content-type': 'application/x-www-form-urlencoded' }, body: 't=' + t }); const ck = r.headers.get('set-cookie').split(';')[0]; return (p, o = {}) => call(p, { ...o, headers: { cookie: ck, origin: O, 'content-type': 'application/json' } }); };
const annP = await signIn('ann@home.com'), bobP = await signIn('bob@home.com');
j = await J(await annP('/portal/api/cases')); const pc = j.cases.find(c => c.no === 'OWS-00101'), raw = JSON.stringify(j);
ok(pc && pc.status === 'Waiting on vendor' && pc.comments.length === 2, 'customer sees the exact status and public comments only');
ok(!/RMA approved|P-000101|RMA-0000101|minutes|Perc-Rite|"event"/.test(raw), 'no private notes, parts, RMAs, time or events in the portal');
ok(!JSON.stringify(await J(await bobP('/portal/api/cases'))).includes('OWS-00101'), "another customer can't see Ann's cases");
sent.length = 0; ok((await J(await annP('/portal/api/case-comment', { method: 'POST', body: JSON.stringify({ case_id: k1, body: 'When will you be back?' }) }))).ok && sent.some(m => /\[OWS-00101\] New message from Ann Smith/.test(m.subject)), 'customer reply lands on the case and alerts you');
ok((await bobP('/portal/api/case-comment', { method: 'POST', body: JSON.stringify({ case_id: k1, body: 'hi' }) })).status === 404, "a customer can't post to someone else's case");
k = (await J(await adm('/admin/api/case/' + k1))).case; ok(k.comments[0].channel === 'portal' && k.comments[0].visibility === 'public' && k.comments[0].who === 'Ann Smith', 'portal reply shows as public, from customer');
sent.length = 0; j = await J(await annP('/portal/api/case', { method: 'POST', body: JSON.stringify({ title: 'Alarm going off', body: 'Beeping since this morning.' }) }));
ok(j.ok && /^OWS-001\d\d$/.test(j.no) && sent.some(m => m.subject.startsWith('[' + j.no + '] New request from Ann Smith')), 'customer can open a new request; you are alerted');
ok((await J(await adm('/admin/api/case/' + j.id))).case.person.name === 'Ann Smith', 'a portal request is opened in the name of the contact who signed in');
// duplicates
{ const a1 = await J(await adm('/admin/api/case', { customer_id: ann, contact_id: annC, title: 'Broken lids and missing pump support block' }));
  const a2 = await J(await adm('/admin/api/case', { customer_id: ann, contact_id: annC, title: 'Broken lids' }));
  const bo = await J(await adm('/admin/api/case', { customer_id: bob, contact_id: bobC, title: 'Bob thing' }));
  ok((await adm('/admin/api/case', { id: a2.id, status: 'Duplicate', dup_of: bo.no })).status === 400, "can't point to another account's case");
  ok((await adm('/admin/api/case', { id: a2.id, status: 'Duplicate', dup_of: a2.no })).status === 400, "can't be a duplicate of itself");
  const pt = await J(await adm('/admin/api/case-item', { case_id: a2.id, kind: 'part', title: 'Lid' }));
  let jd = await J(await adm('/admin/api/case', { id: a2.id, status: 'Duplicate', dup_of: a1.no })); ok(!jd.ok && /mark it a duplicate yet/.test(jd.error), 'open parts block marking a duplicate');
  await adm('/admin/api/case-item', { id: pt.id, status: 'Cancelled' });
  jd = await J(await adm('/admin/api/case', { id: a2.id, status: 'Duplicate', dup_of: a1.no.slice(4) })); ok(jd.ok, 'marked duplicate (number alone works)');
  let d2 = (await J(await adm('/admin/api/case/' + a2.id))).case, d1 = (await J(await adm('/admin/api/case/' + a1.id))).case;
  ok(d2.dup_of && d2.dup_of.id === a1.id && d2.comments.some(c => c.visibility === 'public' && c.body.includes('duplicate of ' + a1.no + ', Broken lids and missing pump support block')) && d2.closed_at, 'duplicate links, adds the public explanation, and counts as closed');
  ok(d1.duplicates.length === 1 && d1.duplicates[0].id === a2.id && d1.comments.some(c => c.kind === 'event' && c.body.includes(a2.no + ' marked as a duplicate')), 'the other case lists it and logs it');
  ok(!(await J(await adm('/admin/api/cases'))).cases.some(c => c.id === a2.id), 'duplicates leave the open list');
  ok((await adm('/admin/api/case-item', { case_id: a2.id, kind: 'part', title: 'x' })).status === 400, 'no new parts on a duplicate');
  ok((await adm('/admin/api/case', { id: a1.id, status: 'Duplicate', dup_of: a2.no })).status === 400, "can't point to a case that is itself a duplicate");
  const pc2 = (await J(await annP('/portal/api/cases'))).cases.find(c => c.id === a2.id);
  ok(pc2.status === 'Duplicate' && pc2.dup_of.no === a1.no && pc2.comments.some(c => /opened twice by mistake/.test(c.body)), 'customer sees the duplicate, the link and the explanation');
  ok((await annP('/portal/api/case-comment', { method: 'POST', body: JSON.stringify({ case_id: a2.id, body: 'hi' }) })).status === 409, 'customer is pointed to the real case instead of replying on a duplicate');
  jd = await J(await adm('/admin/api/case', { id: a2.id, status: 'Open' })); d2 = (await J(await adm('/admin/api/case/' + a2.id))).case; d1 = (await J(await adm('/admin/api/case/' + a1.id))).case;
  ok(jd.ok && !d2.dup_of && d2.closed_at === '' && d1.duplicates.length === 0 && d1.comments.some(c => /no longer a duplicate/.test(c.body)), 'changing the status to Open undoes the duplicate'); }
// closing once items are done; customer delete removes cases
j = await J(await adm('/admin/api/case', { id: k1, status: 'Done' })); ok(j.ok, 'closes once parts and RMAs are done');
j = await J(await adm('/admin/api/cases')); ok(!j.cases.some(c => c.id === k1), 'closed cases leave the open list');
await adm('/admin/api/customer-delete', { id: bob }); ok(!(await J(await adm('/admin/api/cases'))).cases.some(c => c.customer_id === bob), "deleting a customer removes their cases");
// one-time setup: Sean Wilkins cases from the Oct 1 county report
{ const { SCHEMA } = await import('./worker/lib.js');
  const before = (await J(await adm('/admin/api/cases'))).cases.length;
  const sean = await mkC('Sean Wilkins', 'srw134@wilkinshouse.com');
  const rerun = () => DB.batch(SCHEMA.map(q => DB.prepare(q)));
  await rerun(); await rerun();
  const L = (await J(await adm('/admin/api/cases?customer_id=' + sean))).cases;
  ok(L.length === 2 && L.every(c => /^OWS-001\d\d$/.test(c.no)) && L[0].num !== L[1].num, "Sean's two cases are created once, with the next case numbers");
  const nx = await J(await adm('/admin/api/case', { customer_id: sean, contact_id: (await peopleOf(sean))[0].id, title: 'after' })); ok(Number(nx.no.slice(4)) === Math.max(...L.map(c => c.num)) + 1, 'the counter moves past them');
  const k = (await J(await adm('/admin/api/case/' + L.find(c => /County action items/.test(c.title)).id))).case;
  ok(k.comments.filter(c => c.visibility === 'public' && /^Action item/.test(c.body)).length === 4 && k.comments.some(c => c.visibility === 'private' && /re-measure/.test(c.body)) && k.comments.some(c => c.kind === 'event' && /OWS-001\d\d opened/.test(c.body)), 'action items are public comments, the zone note is private');
  ok(L.every(c => c.contact === 'Sean Wilkins' && c.contact_id) && (await peopleOf(sean)).some(p => p.name === 'Stacy L. Wilkins' && p.role === 'Co-owner'), 'Sean is the contact on both; Stacy is added as co-owner');
  const es = (await J(await adm('/admin/api/customer/' + sean))).estimates;
  ok(es.length === 1 && es[0].status === 'draft' && es[0].title === 'Repairs from Oct 1 county report' && es[0].case_id === L.find(c => /Broken lids/.test(c.title)).id && es[0].contact_name === 'Sean Wilkins' && es[0].total === 735.15 && es[0].pending === 3 && es[0].lines.length === 13, "Sean's draft estimate is created once, linked to the lids case, not sent");
  const ne = await J(await adm('/admin/api/estimate', { customer_id: sean, title: 'next', lines: [{ type: 'other', desc: 'x', qty: 1, unit: 1 }] })); ok(Number(ne.no.slice(4)) === es[0].num + 1, 'the estimate counter moves past it');
  ok(es[0].view === 'summary' && es[0].scope.startsWith('Remount the alarm reset') && es[0].scope.split('\n').length === 6, "Sean's estimate gets the approved scope of work and shows as a summary");
  ok(!sent.some(m => /EST-/.test(m.subject)), 'nothing was emailed');
  const tb = (await J(await adm('/admin/api/contacts'))).contacts.filter(c => c.name === 'Tim Barbee');
  ok(tb.length === 1 && tb[0].phone === '704-589-0595' && tb[0].email === 'tbarbee5@carolina.rr.com' && tb[0].company === "Driller's Service Inc., Wastewater Division" && tb[0].customer_id === sean && /PO Box 1407/.test(tb[0].notes), 'Tim Barbee is added once as a contact, linked to the Wilkins account');
}
console.log(fail ? fail + ' FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
