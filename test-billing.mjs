// Payments: Stripe checkout and webhook, the 3 business day hold, locking and release, and the unpaid sequence with a movable clock.
import { DatabaseSync } from 'node:sqlite';
import worker from './worker/index.js';
import { addBusinessDays, addDays, etDate, runDaily, verifyStripe, sendNotice } from './worker/billing.js';
const sql = new DatabaseSync(':memory:');
const mk = (q, args = []) => ({ bind: (...a) => mk(q, a), all: async () => ({ results: sql.prepare(q).all(...args) }), first: async () => sql.prepare(q).get(...args) ?? null, run: async () => { const r = sql.prepare(q).run(...args); return { meta: { changes: Number(r.changes) } }; } });
const DB = { prepare: q => mk(q), batch: async st => { for (const s of st) await s.run(); return []; } };
const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k1' };
const b = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const h = b({ alg: 'RS256', kid: 'k1' }), p = b({ iss: 'https://t.cloudflareaccess.com', aud: ['AUD'], exp: Math.floor(Date.now() / 1000) + 3600, email: 'joshua@overwatchseptic.com' });
const tok = `${h}.${p}.${Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(h + '.' + p))).toString('base64url')}`;
const sent = [], stripeCalls = [];
globalThis.fetch = async (u, o) => {
  u = String(u);
  if (u.includes('resend')) { sent.push(JSON.parse(o.body)); return { ok: true, json: async () => ({}) }; }
  if (u.includes('turnstile')) return { ok: true, json: async () => ({ success: true }) };
  if (u.includes('api.stripe.com')) { stripeCalls.push({ u, body: String(o.body), auth: o.headers.authorization }); return { ok: true, json: async () => ({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }) }; }
  return { ok: true, json: async () => ({ keys: [jwk] }) };
};
const O = 'https://overwatchseptic.com', WH = 'whsec_test';
const env = { DB, FILES: { put: async () => {}, get: async () => null, delete: async () => {} }, ASSETS: { fetch: async () => new Response('A') }, ACCESS_TEAM_DOMAIN: 't.cloudflareaccess.com', ACCESS_AUD: 'AUD', ADMIN_EMAILS: 'joshua@overwatchseptic.com', ALLOWED_ORIGINS: O, TURNSTILE_SECRET: 's', RESEND_API_KEY: 'k', MAIL_TO: 'joshua@overwatchseptic.com', MAIL_FROM: 'O <j@overwatchseptic.com>', STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: WH };
const call = (path, o = {}) => worker.fetch(new Request(O + path, o), env);
const adm = (path, body) => call(path, { method: body === undefined ? 'GET' : 'POST', headers: { 'cf-access-jwt-assertion': tok, origin: O, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const J = r => r.json();
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log(c ? 'PASS' : 'FAIL', m); };
const hook = async (type, obj, goodSig = true) => {
  const raw = JSON.stringify({ type, data: { object: obj } }), t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(goodSig ? WH : 'wrong'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${raw}`))).toString('hex');
  return call('/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${mac}` }, body: raw });
};
const day0 = new Date(`${etDate()}T16:00:00Z`), at = n => new Date(day0.getTime() + n * 864e5);
const invs = async () => (await J(await adm('/admin/api/invoices'))).invoices;
const emailsTo = a => sent.filter(m => m.to[0] === a);

// business days
ok(addBusinessDays('2026-10-23', 3) === '2026-10-28', 'Fri + 3 business days = Wed');
ok(addBusinessDays('2026-11-09', 3) === '2026-11-13', 'skips Veterans Day (Nov 11)');
ok(addBusinessDays('2026-11-24', 3) === '2026-11-30', 'skips Thanksgiving and the weekend');
ok(addBusinessDays('2026-12-23', 3) === '2026-12-29', 'skips Christmas');
ok(addBusinessDays('2027-07-01', 3) === '2027-07-07', 'skips observed July 4 (Sunday, so Monday July 5)');
ok(addBusinessDays('2027-12-30', 1) === '2028-01-03', 'skips observed New Year (Fri Dec 31, 2027) and the weekend');
// signature checker
ok(!(await verifyStripe('{}', 't=1,v1=ab', 'x')), 'old or bad signature refused');

// setup customer and contract with an origination fee
let j = await J(await adm('/admin/api/customer', { name: 'Ann Home', email: 'ann@home.com', address: '12 Oak St, Pittsboro', county: 'Chatham', sys_type: 'V', permit: 'P-1' })); const cid = j.id;
const terms = { contractor_name: 'Overwatch Septic, LLC', contractor_address: 'PO Box 1', health_dept: 'Chatham County EH', annual_fee: '500', origination_fee: '100' };
ok((await adm('/admin/api/contract', { customer_id: cid, terms: { ...terms, origination_fee: 'abc' } })).status === 400, 'origination fee must be numeric');
sent.length = 0; await adm('/admin/api/contract', { customer_id: cid, terms });
const t1 = sent[0].text.match(/\/c\/([A-Za-z0-9_-]+)/)[1];
await call('/api/contract/' + t1 + '/sign', { method: 'POST', headers: { origin: O, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Ann Home', agree: true }) });
j = await J(await adm('/admin/api/customer/' + cid)); const kid = j.contracts[0].id;
sent.length = 0; ok((await adm('/admin/api/contract-sign', { id: kid, name: 'Joshua Klein' })).status === 200, 'countersigned');
let list = await invs(); const i1 = list[0];
ok(list.length === 1 && i1.kind === 'origination' && i1.amount_cents === 10000 && i1.status === 'open', 'origination invoice created for $100');
ok(emailsTo('ann@home.com').length === 1 && emailsTo('ann@home.com')[0].text.includes('/pay/' + i1.id) && !/portal.*signed copy.*now/.test(emailsTo('ann@home.com')[0].text), 'customer gets the invoice, not the signed copy');
j = await J(await call('/api/contract/' + t1)); ok(j.contract.locked === true && j.contract.text === null && j.contract.status === 'complete', 'signing link no longer shows the completed copy while unpaid');

// customer portal
sent.length = 0; await call('/login/api/request', { method: 'POST', headers: { origin: O, 'content-type': 'application/json', 'cf-connecting-ip': '5.5.5.5' }, body: JSON.stringify({ email: 'ann@home.com', token: 't' }) });
const lt = sent[0].text.match(/verify\?t=([A-Za-z0-9_-]+)/)[1];
const cookie = (await call('/login/verify', { method: 'POST', headers: { origin: O, 'content-type': 'application/x-www-form-urlencoded' }, body: 't=' + lt })).headers.get('set-cookie').split(';')[0];
const me = (path = '/portal/api/me', o = {}) => call(path, { ...o, headers: { cookie, origin: O, 'content-type': 'application/json' } });
j = await J(await me()); ok(j.contracts[0].locked && j.contracts[0].text === null && j.invoices.length === 1 && j.invoices[0].amount_cents === 10000, 'portal shows locked agreement and the open invoice');
j = await J(await me('/portal/api/invoices/' + i1.id + '/pay', { method: 'POST', body: '{}' })); ok(j.ok && j.url.startsWith('https://checkout.stripe.com/'), 'portal Pay now opens Stripe checkout');
ok(stripeCalls.at(-1).body.includes('unit_amount%5D=10000') && stripeCalls.at(-1).body.includes('client_reference_id=' + i1.id) && stripeCalls.at(-1).auth === 'Bearer sk_test_x', 'Stripe asked for $100.00 with the invoice id');
let r = await call('/pay/' + i1.id); ok(r.status === 303 && r.headers.get('location').startsWith('https://checkout.stripe.com/'), 'emailed pay link redirects to Stripe');
ok((await call('/pay/aaaaaaaaaaaaaaaaaaaa')).status === 404, 'unknown pay link 404');

// webhook and hold
ok((await hook('checkout.session.completed', { client_reference_id: i1.id, payment_status: 'paid', payment_intent: 'pi_1' }, false)).status === 400, 'webhook with wrong signature refused');
sent.length = 0; ok((await hook('checkout.session.completed', { client_reference_id: i1.id, payment_status: 'paid', payment_intent: 'pi_1' })).status === 200, 'webhook accepted');
list = await invs(); const paid1 = list.find(x => x.id === i1.id);
const expectRelease = addBusinessDays(etDate(), 3);
ok(paid1.status === 'paid' && paid1.release_date === expectRelease && !paid1.released, 'paid, hold set to 3 business days: ' + expectRelease);
ok(emailsTo('ann@home.com').some(m => /Payment received/.test(m.subject)), 'receipt emailed');
await hook('checkout.session.completed', { client_reference_id: i1.id, payment_status: 'paid', payment_intent: 'pi_1' }); ok(emailsTo('ann@home.com').filter(m => /Payment received/.test(m.subject)).length === 1, 'duplicate webhook does nothing');
sent.length = 0; await runDaily(env, new Date(`${addDays(expectRelease, -1)}T16:00:00Z`));
j = await J(await me()); ok(j.contracts[0].locked, 'still locked the day before release');
await runDaily(env, new Date(`${expectRelease}T16:00:00Z`));
j = await J(await me()); ok(!j.contracts[0].locked && j.contracts[0].text && j.contracts[0].text.title, 'released on the release day: customer can read the signed agreement');
ok(emailsTo('ann@home.com').some(m => /signed agreement is available/.test(m.subject)), 'customer told it is available');
j = await J(await call('/api/contract/' + t1)); ok(j.contract.locked === false && j.contract.text, 'signing link shows the copy after release');

// refund during the hold stops release
const rep = async (date, amount) => { const x = await J(await adm('/admin/api/report', { customer_id: cid, visit_date: date, readings: { pump_min: 4.2, sludge_in: 9 }, checks: [{ label: 'Alarm', status: 'pass' }] })); return { id: x.id, fin: await J(await adm('/admin/api/report-finish', { id: x.id, amount })) }; };
const rA = await rep('2026-10-20', '250'); ok(rA.fin.ok && rA.fin.invoice, 'report finished: $250 invoice');
j = await J(await me()); ok(j.reports.find(x => x.id === rA.id).locked === true && !j.reports.find(x => x.id === rA.id).readings, 'portal: report is locked, no readings leaked');
ok((await me('/portal/api/reports/' + rA.id + '/pdf')).status === 404, 'locked report PDF refused');
ok((await adm('/admin/api/report-notify', { id: rA.id })).status === 400, 'admin cannot email a held report');
ok((await adm('/admin/api/report-finish', { id: rA.id, amount: '250' })).status === 409, 'cannot finish twice');
await hook('checkout.session.completed', { client_reference_id: rA.fin.invoice, payment_status: 'paid', payment_intent: 'pi_2' });
sent.length = 0; await hook('charge.refunded', { payment_intent: 'pi_2' });
ok(emailsTo('joshua@overwatchseptic.com').some(m => /refunded/.test(m.subject)), 'you are alerted to the refund');
await runDaily(env, new Date(`${addBusinessDays(etDate(), 5)}T16:00:00Z`));
ok(!(await invs()).find(x => x.id === rA.fin.invoice).released, 'refunded payment is not released');
// manual override
ok((await adm('/admin/api/invoice-release', { id: rA.fin.invoice })).status === 200, 'you can release it yourself');

// county copy
{ const cs = (await J(await adm('/admin/api/counties'))).counties.map(c => c.name + ' ' + c.email).join(';');
  ok(cs.includes('harnett khinson@harnett.org') && cs.includes('randolph eh-info@randolphcountync.gov') && cs.includes('wake ominspect@wake.gov') && cs.includes('chatham brad.jones@chathamcountync.gov'), 'county report addresses are filled in'); }
await adm('/admin/api/county', { name: 'chatham', remove: true });
const rB = await rep('2026-10-21', '250'); sent.length = 0;
await adm('/admin/api/invoice-paid', { id: rB.fin.invoice });
await runDaily(env, new Date(`${addBusinessDays(etDate(), 3)}T16:00:00Z`));
ok(emailsTo('joshua@overwatchseptic.com').some(m => /County email missing/.test(m.subject)), 'no county email: you are told, customer still released');
ok((await adm('/admin/api/county', { name: 'Chatham County', email: 'eh@chatham.gov' })).status === 200, 'county saved');
sent.length = 0; j = await J(await adm('/admin/api/report-county-send', { id: rB.id })); ok(j.ok, 'county copy sent on demand');
const cm = emailsTo('eh@chatham.gov')[0]; const link = cm.text.match(/\/r\/([A-Za-z0-9_-]+)/)[1];
r = await call('/r/' + link); const html = await r.text(); ok(r.status === 200 && html.includes('12 Oak St') && html.includes('Pump run time'), 'county page shows the report');
ok((await call('/r/aaaaaaaaaaaaaaaaaaaaaaaa')).status === 404, 'bad county link 404');

// waive
const rC = await rep('2026-10-22', '250'); sent.length = 0;
ok((await adm('/admin/api/invoice-waive', { id: rC.fin.invoice })).status === 200, 'waive');
j = await J(await me()); ok(!j.reports.find(x => x.id === rC.id).locked, 'waived: released at once, no hold');
ok(emailsTo('eh@chatham.gov').length === 1, 'waived: county copy sent at once');
const rD = await rep('2026-10-23', '0'); ok(rD.fin.released, 'amount 0 releases immediately');

// the unpaid sequence
const rE = await rep('2026-10-24', '250'); const ie = rE.fin.invoice; sent.length = 0;
let count = 0;
for (let d = 1; d <= 14; d++) { await runDaily(env, at(d)); }
const rem = emailsTo('ann@home.com').filter(m => /Reminder: your septic invoice/.test(m.subject)); ok(rem.length === 7, 'seven daily reminders on days 1 to 7 (got ' + rem.length + ')');
await runDaily(env, at(14)); ok(emailsTo('ann@home.com').length === 7, 'no emails on days 8 to 14');
await runDaily(env, at(15)); await runDaily(env, at(15)); ok(emailsTo('ann@home.com').filter(m => /due on/.test(m.subject)).length === 1, 'one plain reminder on day 15, not repeated');
for (let d = 16; d <= 29; d++) await runDaily(env, at(d)); ok((await invs()).find(x => x.id === ie).notice_state === 'none', 'nothing happens before day 30');
sent.length = 0; await runDaily(env, at(30));
ok((await invs()).find(x => x.id === ie).notice_state === 'drafted' && emailsTo('joshua@overwatchseptic.com').some(m => /ready for your OK/.test(m.subject)), 'day 30: notice drafted, you are alerted');
ok(emailsTo('eh@chatham.gov').length === 0 && emailsTo('ann@home.com').length === 0, 'nothing sent to owner or county without your OK');
j = await J(await adm('/admin/api/invoice-letter?id=' + ie + '&kind=notice')); ok(j.ok && /30\) days|thirty \(30\)/.test(j.owner.body) && j.county.body.includes('12 Oak St'), 'letters drafted for owner and county');
await adm('/admin/api/county', { name: 'chatham', remove: true });
ok((await adm('/admin/api/invoice-notice', { id: ie })).status === 400, 'cannot send notice without a county email');
await adm('/admin/api/county', { name: 'Chatham', email: 'eh@chatham.gov' });
sent.length = 0; ok((await sendNotice(env, 'joshua@overwatchseptic.com', ie, 'notice', '9407 1000 0000', at(30))).ok, 'you approve: notice sent (the admin button calls this)');
ok(emailsTo('ann@home.com').length === 1 && emailsTo('eh@chatham.gov').length === 1, 'owner and county both notified');
let ine = (await invs()).find(x => x.id === ie); ok(ine.notice_state === 'sent' && ine.term_date === addDays(etDate(at(30)), 30) && ine.tracking === '9407 1000 0000', 'termination date is 30 days out: ' + ine.term_date);
ok((await adm('/admin/api/invoice-notice', { id: ie })).status === 400, 'cannot send the notice twice');
sent.length = 0; await runDaily(env, at(44)); ok(emailsTo('ann@home.com').length === 1, 'weekly reminder while the notice runs');
sent.length = 0; await runDaily(env, at(60));
ok((await invs()).find(x => x.id === ie).notice_state === 'final_drafted' && emailsTo('joshua@overwatchseptic.com').some(m => /Final notice ready/.test(m.subject)), 'day 60: final notice drafted for your OK');
ok(emailsTo('eh@chatham.gov').length === 0, 'county not told until you approve');
sent.length = 0; ok((await adm('/admin/api/invoice-final', { id: ie })).status === 200, 'you approve the final notice');
ok(emailsTo('eh@chatham.gov').length === 1 && emailsTo('ann@home.com').length === 1, 'final: owner and county told');
j = await J(await adm('/admin/api/customer/' + cid)); ok(j.contracts[0].status === 'terminated', 'agreement marked terminated');

// pause and paid-after-notice
const rF = await rep('2026-10-25', '250'); const iF = rF.fin.invoice; await adm('/admin/api/invoice-pause', { id: iF, paused: true }); sent.length = 0;
await runDaily(env, at(3)); ok(emailsTo('ann@home.com').length === 0, 'paused invoice gets no reminders');
await adm('/admin/api/invoice-pause', { id: iF, paused: false });
const rG = await rep('2026-10-26', '250'); const iG = rG.fin.invoice; await runDaily(env, at(30)); sent.length = 0;
await hook('checkout.session.completed', { client_reference_id: iG, payment_status: 'paid', payment_intent: 'pi_9' });
ok(emailsTo('joshua@overwatchseptic.com').some(m => /Paid after notice/.test(m.subject)), 'paid after the notice was drafted: you are told');
// bank payment not yet confirmed
const rH = await rep('2026-10-27', '250'); await hook('checkout.session.completed', { client_reference_id: rH.fin.invoice, payment_status: 'unpaid', payment_intent: 'pi_10' });
ok((await invs()).find(x => x.id === rH.fin.invoice).status === 'open', 'bank payment started but unconfirmed stays open');
await hook('checkout.session.async_payment_succeeded', { client_reference_id: rH.fin.invoice, payment_status: 'paid', payment_intent: 'pi_10' });
ok((await invs()).find(x => x.id === rH.fin.invoice).status === 'paid', 'bank payment confirmed later marks paid');
// Stripe not set up
const saved = env.STRIPE_SECRET_KEY; delete env.STRIPE_SECRET_KEY; r = await call('/pay/' + rE.fin.invoice); ok(r.status === 503, 'pay link says payments are unavailable when Stripe is not set up'); env.STRIPE_SECRET_KEY = saved;
console.log(fail ? fail + ' FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
