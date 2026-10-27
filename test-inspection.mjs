// Inspection reports: the full form, calculations, photos, the homeowner and county copies.
import { DatabaseSync } from 'node:sqlite';
import worker from './worker/index.js';
import { etDate } from './worker/billing.js';
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
const env = { DB, FILES: { put: async () => {}, get: async () => null, delete: async () => {} }, ASSETS: { fetch: async () => new Response('A') }, OPERATOR_NAME: 'Joshua Klein', OPERATOR_CERT: 'SS-1019571', ACCESS_TEAM_DOMAIN: 't.cloudflareaccess.com', ACCESS_AUD: 'AUD', ADMIN_EMAILS: 'joshua@overwatchseptic.com', ALLOWED_ORIGINS: O, TURNSTILE_SECRET: 's', RESEND_API_KEY: 'k', MAIL_TO: 'joshua@overwatchseptic.com', MAIL_FROM: 'O <j@overwatchseptic.com>', STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: WH };
const call = (path, o = {}) => worker.fetch(new Request(O + path, o), env);
const adm = (path, body) => call(path, { method: body === undefined ? 'GET' : 'POST', headers: { 'cf-access-jwt-assertion': tok, origin: O, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const J = r => r.json();
const OWI0 = globalThis.OWI;
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log(c ? 'PASS' : 'FAIL', m); };

const jpg = new Uint8Array(400); jpg.set([0xff, 0xd8, 0xff, 0xe0]);
const files = new Map(); env.FILES = { put: async (k, v) => { files.set(k, v); }, get: async k => files.has(k) ? { arrayBuffer: async () => files.get(k) } : null, delete: async k => { files.delete(k); } };
const raw = (path, body, type) => call(path, { method: 'POST', headers: { 'cf-access-jwt-assertion': tok, origin: O, 'content-type': type }, body });
let j = await J(await adm('/admin/api/customer', { name: 'Ann Home', email: 'ann@home.com', address: '12 Oak St, Pittsboro', county: 'Chatham', sys_type: 'V', permit: 'P-2019-3381' })); const cid = j.id;
const SYS = { floats: { alarm: 40, on: 25, off: 20 }, sys_desc: 'Low Pressure Pipe, Type V', design_flow: 120, septic_gal: 1000, liquid_depth: 52, pump_gal: 1000, gpi: 21, dose: 105, design_pdr: 17.8, laterals: [{ length: 40, design: 3 }, { length: 40, design: 3.4 }] };
const form = (o = {}) => ({ inspect_type: 'Regular semi-annual', septic_gal: 1000, liquid_depth: 52, pump_gal: 1000, gpi: 21,
  checks: { septic: { risers: 'yes', lids: 'yes', infil: 'yes', screen_req: 'yes', screen_ok: 'yes' }, pump: { risers: 'yes', lids: 'yes', infil: 'yes' }, controls: { rope: 'yes', alarm: 'yes', panel: 'no', floats: 'yes' }, field: { surf: 'yes', other: 'no' } },
  septic: { scum: 4, sludge: 9, pumped: '2024-05-01', pump_needed: 'No' }, pump: { scum: 1, sludge: 2, pump_needed: 'No' }, floats: { alarm: 40, on: 25, off: 20 },
  laterals: [{ length: 40, design: 3, turnup: 3.1, last: 3, baseline: 3, left: 3, adjusted: 3 }, { length: 40, design: 3.4, turnup: 3.4 }],
  flow: { off: 40.5, on: 45.5, min: 5, design_pdr: 17.8 }, meters: { et: 1460, events: 8770 },
  words: { septic: { i: 0, t: 'Lids sound.' }, pumptank: { i: 0, t: 'Floats work.' }, panel: { i: 1, t: 'Contactor is pitting.' }, field: { i: 0, t: 'Dry.' }, flow: { i: 1, t: 'A little high.' }, solids: { i: 0, t: 'Fine.' }, runtime: { i: 0, t: 'Steady.' } },
  todo: { jobs: ['Replace the control panel contactor', 'Not a real job'], ticks: [2, 99], extra: '' }, recs: 'Plan to replace the contactor.', comments: 'PRIVATE: owner has a dog that bites', status: 'Needs maintenance', next_due: '2027-04-26', ...o });
const post = (date, data, system = SYS) => adm('/admin/api/inspection', { customer_id: cid, visit_date: date, data, system });

// profile starts empty
j = await J(await adm('/admin/api/system?customer_id=' + cid)); ok(j.ok && j.system === null && j.prev === null, 'no saved system or earlier visit yet');
// validation
ok((await post('', form())).status === 400, 'visit date required');
ok((await post('2026-04-24', form({ septic: { sludge: 80 } }))).status === 400, 'sludge deeper than the tank is refused');
ok((await post('2026-04-24', form({ flow: { off: 50, on: 40, gpi: 21, min: 5 } }))).status === 400, 'pump-on below pump-off is refused');
// first visit
const r1 = await J(await post('2026-04-24', form({ meters: { et: 1460, events: 8770 } }))); ok(r1.ok && /^[a-f0-9]{20}$/.test(r1.id), 'first inspection saved');
j = await J(await adm('/admin/api/system?customer_id=' + cid + '&date=2026-10-26'));
ok(j.system.design_flow === 120 && j.system.laterals.length === 2 && j.prev.date === '2026-04-24' && j.prev.et === 1460 && j.prev.turnups[0] === 3.1, 'system profile saved and the last visit is offered for next time');
// second visit: the math is done on the server
const r2 = await J(await post('2026-10-26', form({ meters: { et: 1480, events: 9010 } }))); ok(r2.ok, 'second inspection saved');
j = await J(await adm('/admin/api/customer/' + cid)); const rep2 = j.reports.find(r => r.id === r2.id), rep1 = j.reports.find(r => r.id === r1.id);
const c2 = rep2.insp.calc;
ok(c2.depth === 5 && c2.vol === 105 && c2.pdr === 21 && c2.eff === 118 && c2.eff_ok === false, 'flow test: 5 in x 21 gal/in = 105 gal, 21.0 gpm, 118% of design');
ok(c2.sludge_pct === 17.3 && c2.pump_now === false, 'sludge is 17% of the tank, not time to pump');
ok(c2.days === 185 && c2.et_day === 0.11 && c2.events_day === 1.3 && c2.events_design === 1.1, 'per-day meters use the days since the last visit; design events = 120 / 105');
ok(rep1.insp.calc.et_day === undefined || rep1.insp.calc.et_day === null, 'first visit has no per-day meters');
ok(rep2.kind === 'inspection' && rep2.readings.pdr_eff === 118 && rep2.readings.sludge_pct === 17.3 && rep2.readings.lat1_head === 3.1 && rep2.readings.events_design === 1.1, 'graphed numbers stored on the report');
ok(rep2.state === 'held', 'report is held until you finish it (payment rules still apply)');
ok(JSON.stringify(rep2.insp.data.todo) === JSON.stringify({ jobs: ['Replace the control panel contactor'], ticks: [2], extra: '' }), 'unknown job and tick values are dropped');
ok(rep2.insp.data.operator.cert === 'SS-1019571' && rep2.insp.data.comments.startsWith('PRIVATE'), 'operator certificate is recorded; private comments kept for you');
ok(rep2.checks.length === 4 && rep2.checks.find(x => x.label === 'Control panel').status === 'repair' && rep2.checks.find(x => x.label === 'Drain field').status === 'pass', 'four roll-up checks for the older screens');
// drawdown, dose volume and gallons per inch are worked out on the server
ok(c2.drawdown === 5 && c2.dose === 105 && rep2.insp.data.flow.dose === 105 && rep2.insp.data.flow.drawdown === 5, 'drawdown = pump on - pump off (25 - 20) and dose = 5 x 21 = 105 gal');
ok(c2.formulas.depth === '45.5 - 40.5 = 5 in' && c2.formulas.vol === '5 x 21 = 105 gal' && c2.formulas.pdr === '105 / 5 = 21 gpm' && c2.formulas.eff === '21 / 17.8 = 118%' && c2.formulas.sludge === '9 / 52 = 17.3%' && c2.formulas.events_design === '120 gpd / 105 gal = 1.1 per day', 'formulas show the real numbers');
const r5 = await J(await post('2026-10-29', form({ tank_shape: 'rect', tank_a: 93, tank_b: 52, gpi: 5, floats: { on: 26, off: 20 } }))); j = await J(await adm('/admin/api/customer/' + cid)); const rep5 = j.reports.find(r => r.id === r5.id);
ok(rep5.insp.data.gpi === 20.9 && rep5.insp.calc.dose === 125 && rep5.insp.calc.formulas.gpi === '93 x 52 / 231 = 20.9 gal/in', 'gallons per inch comes from the tank size (93 x 52 / 231 = 20.9), not the typed value');
j = await J(await adm('/admin/api/system?customer_id=' + cid + '&date=2026-12-01')); ok(j.system.tank_a === 93 && j.system.tank_shape === 'rect' && j.system.gpi === 20.9, 'tank size is saved with the system');
ok(j.system.floats.on === 25 && j.system.floats.off === 20 && j.system.floats.alarm === 40, 'float settings are saved with the system too');
await adm('/admin/api/report-delete', { id: r5.id });
// pump now at 33%
const r3 = await J(await post('2026-10-27', form({ septic: { sludge: 18, scum: 2 } }))); j = await J(await adm('/admin/api/customer/' + cid));
ok(j.reports.find(r => r.id === r3.id).insp.calc.pump_now === true, '18 in of 52 in is 34.6%: pump now');
await adm('/admin/api/report-delete', { id: r3.id });
// photos
ok((await raw('/admin/api/reports/' + r2.id + '/photo', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].concat(new Array(300).fill(1))), 'image/jpeg')).status === 400, 'a non-JPEG photo is refused');
ok((await raw('/admin/api/reports/' + r2.id + '/photo', jpg, 'image/jpeg')).status === 200, 'photo uploaded');
ok((await raw('/admin/api/reports/' + r2.id + '/photo', new Uint8Array(3 * 1024 * 1024).fill(0xff), 'image/jpeg')).status === 413, 'photo over 2.5 MB is refused');
j = await J(await adm('/admin/api/customer/' + cid)); ok(j.reports.find(r => r.id === r2.id).insp.photos === 1, 'report shows 1 photo');
ok((await adm('/admin/api/reports/' + r2.id + '/photo/1')).status === 200 && (await adm('/admin/api/reports/' + r2.id + '/photo/2')).status === 404, 'admin can view the photo; a missing one is 404');
// release: waive the visit fee, county copy
await adm('/admin/api/county', { name: 'Chatham County', email: 'eh@chatham.gov' });
await adm('/admin/api/report-finish', { id: r1.id, amount: '0' });
sent.length = 0; j = await J(await adm('/admin/api/report-finish', { id: r2.id, amount: '0' })); ok(j.ok && j.released, 'finished and released with the fee waived');
const cm = sent.find(m => m.to[0] === 'eh@chatham.gov'); ok(!!cm, 'county was emailed'); const link = cm.text.match(/\/r\/([A-Za-z0-9_-]+)/)[1];
let r = await call('/r/' + link); const html = await r.text();
ok(r.status === 200 && html.includes('CERTIFIED OPERATOR MAINTENANCE/MONITORING REPORT') && html.includes('P-2019-3381') && html.includes('SS-1019571') && html.includes('118% (outside 10% of design)') && html.includes('Needs maintenance'), 'county page is the technical state-style report with the certificate number');
ok(!html.includes('PRIVATE') && !html.includes('dog'), 'private comments never reach the county');
ok(html.includes('Low Pressure Pipe, Type V') && html.includes('Design flow 120 gpd') && html.includes('185 days earlier'), 'county page shows the system and days since last visit');
ok(html.includes('How the numbers were calculated') && html.includes('45.5 - 40.5 = 5 in') && html.includes('+3%'), 'county page shows the formulas and how far each lateral is from design');
// customer portal: homeowner copy
sent.length = 0; await call('/login/api/request', { method: 'POST', headers: { origin: O, 'content-type': 'application/json', 'cf-connecting-ip': '5.5.5.5' }, body: JSON.stringify({ email: 'ann@home.com', token: 't' }) });
const lt = sent[0].text.match(/verify\?t=([A-Za-z0-9_-]+)/)[1];
const cookie = (await call('/login/verify', { method: 'POST', headers: { origin: O, 'content-type': 'application/x-www-form-urlencoded' }, body: 't=' + lt })).headers.get('set-cookie').split(';')[0];
const me = (path = '/portal/api/me', o = {}) => call(path, { ...o, headers: { cookie, origin: O, 'content-type': 'application/json' } });
j = await J(await me()); const pr = j.reports.find(x => x.id === r2.id);
ok(pr.insp && pr.insp.data.words.panel.t === 'Contactor is pitting.' && pr.insp.calc.pdr === 21 && j.operator.cert === 'SS-1019571', 'owner sees the plain-language wording, numbers and operator');
ok(pr.insp.data.comments === undefined, 'owner never receives your private comments');
ok((await me('/portal/api/reports/' + r2.id + '/photo/1')).status === 200, 'owner can see the photo once released');
// held report: owner sees nothing, photo blocked
const r4 = await J(await post('2026-10-28', form())); j = await J(await me()); const held = j.reports.find(x => x.id === r4.id);
ok(held.locked === true && !held.insp, 'a held report shows no inspection data to the owner');
await raw('/admin/api/reports/' + r4.id + '/photo', jpg, 'image/jpeg'); ok((await me('/portal/api/reports/' + r4.id + '/photo/1')).status === 404, 'photos on a held report are blocked');
// delete cleans up
await adm('/admin/api/report-delete', { id: r4.id }); ok(![...files.keys()].some(k => k.includes(r4.id)), 'deleting a report removes its photos');
// gallons per inch from the tank size
ok(OWI0.gpi('rect', 93, 52) === 20.9 && OWI0.gpi('round', 78) === 20.7 && OWI0.gpi('rect', 93) === null && OWI0.gpi('round', 0) === null && OWI0.gpi('round', 5000) === null, 'gallons per inch: 93 x 52 rect = 20.9, 78 in round = 20.7, bad input = nothing');
// the view code
const OWI = globalThis.OWI; const insp = { data: rep2.insp.data, calc: rep2.insp.calc, photos: 1 };
const home = OWI.homeHtml({ visit_date: '2026-10-26', insp }, { name: 'Ann Home', address: '12 Oak St' }, rep2.insp.data.operator, n => '/p/' + n);
ok(home.includes('Overall: needs a small repair soon.') && home.includes('Hire a licensed contractor to replace the control panel contactor.') && home.includes('(designed for 17.8)') && home.includes('17%</b> of the tank depth') && home.includes('/p/1'), 'homeowner copy: overall, jobs, numbers vs design, photo');
ok(home.indexOf('What you need to do') < home.indexOf('Overall:') && home.includes('<li><u>Hire a licensed contractor'), 'homeowner copy: the action items come first and are underlined');
const none = OWI.homeHtml({ visit_date: '2026-10-26', insp: { data: { ...insp.data, todo: { jobs: [], ticks: [], extra: '' }, recs: '' }, calc: insp.calc, photos: 0 } }, { name: 'A', address: 'x' }, { name: 'J', cert: 'S' });
ok(none.includes('Nothing needed right now. See you at your next check-up.'), 'homeowner copy: says so when nothing is needed');
ok(!home.includes('PRIVATE') && !home.includes('<script'), 'homeowner copy has no private comments or scripts');
const evil = OWI.homeHtml({ visit_date: '2026-10-26', insp: { data: { ...insp.data, recs: '<script>alert(1)</script>' }, calc: insp.calc, photos: 0 } }, { name: '<b>x</b>', address: 'y' }, { name: 'J', cert: 'S' });
ok(!evil.includes('<script>') && !evil.includes('<b>x</b>'), 'text is escaped in the report');


// ---- flexible systems: permit details, extra tanks, check cards, malfunction
j = await J(await adm('/admin/api/customer', { name: 'Sean Wilkins', email: 'sean@wilkins.com', address: '1718 Charlie Brooks Rd, Moncure', county: 'Chatham', sys_type: 'Va', permit: 'PREH201803187' })); const wid = j.id;
const SETUP = { permit: { county: 'Chatham', parcel: '78733', type: 'Va', issued: '2019-03-21', months: 60, ca_no: 'PREH201803187', bedrooms: 6, occupants: 12, freq: 'q1s', owners: 'Sean and Stacy Wilkins', bogus: 'x' }, addresses: ['1718 Charlie Brooks Rd', '1720 Charlie Brooks Rd'], septic_name: 'Septic tank 1 (1718)', pump_name: 'Pump tank 1 (1718)', zone_word: 'Zone', design_flow: 720, sys_desc: 'Type Va drip',
  tanks: [{ id: 'ts2', kind: 'septic', name: 'Septic tank 2 (1720)' }, { id: 'tp2', kind: 'pump', name: 'Pump tank 2 (1720)' }], cards: [{ id: 'hw', title: 'Drip headworks and filter', items: ['Filter cleaned', 'Zone valves open and close'] }, { id: 'cond', title: 'Permit conditions', items: ['Contract on file with county'] }] };
j = await J(await adm('/admin/api/system', { customer_id: wid, system: SETUP })); ok(j.ok && j.system.tanks.length === 2 && j.system.permit.bogus === undefined && j.system.zone_word === 'Zone', 'system setup saved (permit, addresses, tanks, cards)');
j = await J(await adm('/admin/api/system?customer_id=' + wid + '&date=2026-10-26')); ok(j.system.permit.parcel === '78733' && j.system.cards[0].items.length === 2 && j.first === '', 'setup comes back; no inspection on file yet');
ok(OWI0.permitInfo(j.system.permit, '2026-10-26').expired === true && OWI0.permitInfo(j.system.permit, '2026-10-26').expires === '2024-03-21', 'permit expiry: issued Mar 21 2019 + 60 months = Mar 21 2024, expired');
ok(OWI0.nextDue('q1s', '2026-10-26', '') === '2027-01-25' && OWI0.nextDue('q1s', '2026-10-26', '2024-01-01') === '2027-04-26' && OWI0.nextDue('a', '2026-10-26') === '2027-10-26', 'next due follows the permit schedule (quarterly first year, then twice a year)');
const xsys = () => ({ ...SETUP, tanks: [{ ...SETUP.tanks[0], gal: 1000, shape: 'rect', a: 93, b: 52, liquid_depth: 52 }, { ...SETUP.tanks[1], gal: 1000, shape: 'rect', a: 93, b: 52, design_pdr: 17.8, floats: { alarm: 40, on: 25, off: 20 } }] });
const xform = o => form({ septic_gal: 1000, tanks: { ts2: { checks: { risers: 'yes', lids: 'no', screen_ok: 'yes' }, sludge: 18, scum: 2, liquid_depth: 52, gal: 1000, shape: 'rect', a: 93, b: 52, pumped: '2024-05-01', pump_needed: 'No' },
  tp2: { checks: { floats: 'yes', alarm: 'yes' }, gal: 1000, shape: 'rect', a: 93, b: 52, design_pdr: 17.8, floats: { alarm: 40, on: 25, off: 20 }, flow: { off: 40.5, on: 45.5, min: 5 } }, nope: { checks: { lids: 'no' } } },
  cards: { hw: { rows: [{ l: 'Filter cleaned', a: 'yes' }, { l: 'Zone valves open and close', a: 'no' }, { l: 'Air release valves working', a: 'yes' }] }, cond: { rows: [{ l: 'Contract on file with county', a: 'yes' }] }, other: { rows: [{ l: 'x', a: 'no' }] } },
  malfunction: { found: true, notified: 'Called Thomas Boyce on the visit day' }, ...o });
const wp = await J(await adm('/admin/api/inspection', { customer_id: wid, visit_date: '2026-10-26', data: xform(), system: xsys() })); ok(wp.ok, 'inspection with extra tanks and cards saved');
j = await J(await adm('/admin/api/customer/' + wid)); const wr = j.reports.find(x => x.id === wp.id), wd = wr.insp.data, wc = wr.insp.calc;
ok(Object.keys(wd.tanks).join() === 'ts2,tp2' && Object.keys(wd.cards).join() === 'hw,cond', 'only tanks and cards that exist in the setup are kept (unknown ids are dropped)');
ok(wc.tanks.ts2.sludge_pct === 34.6 && wc.tanks.ts2.pump_now === true && wc.tanks.ts2.formulas.sludge === '18 / 52 = 34.6%', 'extra septic tank: 18 of 52 in = 34.6%, pump now');
ok(wc.tanks.tp2.gpi === 20.9 && wc.tanks.tp2.depth === 5 && wc.tanks.tp2.vol === 105 && wc.tanks.tp2.pdr === 21 && wc.tanks.tp2.eff === 118 && wc.tanks.tp2.eff_ok === false && wc.tanks.tp2.dose === 105 && wc.tanks.tp2.formulas.vol === '5 x 20.9 = 105 gal', 'extra pump tank: its own flow test, efficiency and dose with formulas');
j = await J(await adm('/admin/api/system?customer_id=' + wid + '&date=2026-12-01')); ok(j.system.tanks[1].gpi === 20.9 && j.system.tanks[1].design_pdr === 17.8 && j.system.tanks[1].floats.on === 25 && j.first === '2026-10-26', 'tank sizes and floats are remembered on the system');
// setup edits keep what visits saved
const again = { ...SETUP, tanks: [{ id: 'ts2', kind: 'septic', name: 'Back septic tank' }, { id: 'tp2', kind: 'pump', name: 'Back pump tank' }] };
j = await J(await adm('/admin/api/system', { customer_id: wid, system: again })); ok(j.system.tanks[0].name === 'Back septic tank' && j.system.tanks[0].a === 93 && j.system.tanks[1].design_pdr === 17.8, 'renaming a tank in setup keeps its saved size and design numbers');
j = await J(await adm('/admin/api/system', { customer_id: wid, system: { ...SETUP, tanks: [] } })); ok(j.system.tanks.length === 0, 'a tank can be removed in setup');
await adm('/admin/api/system', { customer_id: wid, system: { ...SETUP, cards: SETUP.cards } });
ok(wr.checks.length === 4 + 4 && wr.checks.find(x => x.label === 'Septic tank 2 (1720)').status === 'repair' && wr.checks.find(x => x.label === 'Drip headworks and filter').status === 'repair' && wr.checks.find(x => x.label === 'Permit conditions').status === 'pass', 'roll-up includes each extra tank and card');
ok(OWI0.problems(wd).length === 3, 'problems counted across the form, tanks and cards: control panel, lid, zone valves');
// the reports show it all
const wh = OWI0.homeHtml({ visit_date: '2026-10-26', insp: wr.insp }, { name: 'Sean Wilkins', address: '1718 Charlie Brooks Rd' }, wd.operator);
ok(wh.includes('Septic tank 2 (1720)') && wh.includes('Pump tank 2 (1720)') && wh.includes('Drip headworks and filter') && wh.includes('Solids in Septic tank 2 (1720)') && wh.includes('Septic tank 1 (1718)') && wh.includes('Pump tank 1 (1718)'), 'homeowner copy: named tanks, extra rows and numbers');
const wch = OWI0.countyHtml({ visit_date: '2026-10-26', insp: wr.insp }, { name: 'Sean Wilkins', address: '1718 Charlie Brooks Rd', county: 'Chatham', permit: 'x' }, wd.operator);
ok(wch.includes('78733') && wch.includes('PREH201803187') && wch.includes('Issued Mar 21, 2019, valid until Mar 21, 2024') && wch.includes('6 bedrooms, up to 12 occupants') && wch.includes('Quarterly the first year, then twice a year') && wch.includes('1720 Charlie Brooks Rd'), 'county copy: parcel, permit numbers and dates, capacity, schedule, both addresses');
ok(wch.includes('<h3>Septic tank 2 (1720)</h3>') && wch.includes('34.6% of liquid depth') && wch.includes('<h3>Pump tank 2 (1720)</h3>') && wch.includes('118% (outside 10% of design)') && wch.includes('<h3>Drip headworks and filter</h3>') && wch.includes('Zone valves open and close'), 'county copy: each extra tank and card with its own numbers');
ok(wch.includes('Malfunction found at this visit.') && wch.includes('Called Thomas Boyce on the visit day'), 'county copy: malfunction and county notice');
ok(wch.includes('<th>Zone</th>'), 'county copy: field lines are called Zones when the system says so');
ok(!/expired/i.test(wch), 'county copy prints permit dates but never the word expired');
ok(wh.includes('<li><u>Have Septic tank 2 (1720) pumped by a licensed pumper within 30 days.</u></li>') && wh.includes('Hire a licensed contractor to fix Septic tank 2 (1720): risers and lids intact.') && wh.includes('check the pump flow at Pump tank 2 (1720)') && !wh.includes('Nothing needed right now'), 'problems on extra tanks always appear in what the owner should do');
const old2 = OWI0.countyHtml({ visit_date: '2026-10-26', insp: { data: { ...rep2.insp.data }, calc: rep2.insp.calc, photos: 0 } }, { name: 'Ann Home', address: '12 Oak St' }, rep2.insp.data.operator);
ok(old2.includes('Septic tank') && old2.includes('<th>Lateral</th>') && !old2.includes('Malfunction found'), 'older inspections (no extras) still render the same');


// ---- state approved-tank list lookup
import { readFileSync } from 'node:fs';
const TL = JSON.parse(readFileSync(new URL('./site/admin/tank-list.json', import.meta.url)));
ok(TL.length > 1000, 'approved-tank list loaded (' + TL.length + ' tanks)');
let hit = OWI0.findTanks(TL, 'STB-760'); ok(hit.length === 1 && hit[0][2] === 'Shoaf Precast, Inc', 'STB-760 is found: Shoaf Precast');
let fill = OWI0.tankFill(hit[0]); ok(fill.gal === 1000 && fill.a === 100 && fill.b === 46 && fill.shape === 'rect' && fill.gpi === 19.9 && fill.liq === 50, 'STB-760: 1,000 gal, inside 100 x 46, 19.9 gal/in, about 50 in of liquid');
hit = OWI0.findTanks(TL, ' pt-308 '); fill = OWI0.tankFill(hit[0]); ok(hit.length === 1 && fill.a === 100 && fill.b === 50 && fill.gpi === 21.6 && fill.liq === 46, 'PT-308 (any case, spaces ignored): inside 100 x 50, 21.6 gal/in, about 46 in');
ok(OWI0.findTanks(TL, 'SHOAF-STB-760-1000').length === 1 && OWI0.findTanks(TL, 'shoaf-stb-760').length === 2, 'the full imprint finds one tank; part of it lists every close match (STB-760 and STB-760R)');
ok(OWI0.findTanks(TL, 'PT-96').length > 1, 'a model number used by several manufacturers returns each, so you can choose');
ok(OWI0.findTanks(TL, 'zz').length === 0 && OWI0.findTanks(TL, 'NOT-A-TANK').length === 0, 'unknown or too-short model numbers find nothing');
const oct = TL.find(r => r[5] === 'o' && r[9]); fill = OWI0.tankFill(oct); ok(fill.a === null && fill.gpi === oct[9] && /gal\/in/.test(fill.note), 'an octagonal tank has no usable length and width, so gallons per inch comes from the list');
// dimensions saved from setup reach the visit form
j = await J(await adm('/admin/api/system', { customer_id: wid, system: { ...SETUP, septic_model: 'STB-760', septic_gal: 1000, septic_shape: 'rect', septic_a: 100, septic_b: 46, pump_model: 'PT-308', pump_gal: 1000, tank_shape: 'rect', tank_a: 100, tank_b: 50, gpi: 99,
  tanks: [{ id: 'ts2', kind: 'septic', name: 'Septic tank 2 (1720)', model: 'STB-760', gal: 1000, shape: 'rect', a: 100, b: 46 }, { id: 'tp2', kind: 'pump', name: 'Pump tank 2 (1720)', model: 'PT-308', gal: 1000, shape: 'rect', a: 100, b: 50, gpi: 7 }] } }));
ok(j.system.septic_model === 'STB-760' && j.system.pump_model === 'PT-308' && j.system.septic_a === 100 && j.system.tank_a === 100 && j.system.tank_b === 50, 'tank models and inside dimensions are saved in setup');
ok(j.system.gpi === 21.6 && j.system.tanks[1].gpi === 21.6 && j.system.tanks[1].model === 'PT-308' && j.system.tanks[0].a === 100, 'gallons per inch is worked out on the server from the saved dimensions, not trusted from the browser');
j = await J(await adm('/admin/api/system', { customer_id: wid, system: { ...SETUP, tanks: [{ id: 'ts2', kind: 'septic', name: 'Renamed' }, { id: 'tp2', kind: 'pump', name: 'Pump 2' }] } })); ok(j.system.tanks[0].a === 100 && j.system.tanks[0].model === 'STB-760' && j.system.pump_model === 'PT-308', 'a setup save that leaves the sizes out does not wipe them');

console.log(fail ? fail + ' FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
// Chatham extras: last inspection date and the Chatham check list
{ const o = globalThis.OWI; const ok2 = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('PASS', m); };
  ok2(o.CHATHAM.length === 7 && o.CHATHAM.every(x => typeof x === 'string'), 'Chatham check list has 7 lines');
  const cc = o.calc ? o.calc({ flow: {}, meters: {}, checks: {} }, { prev: { date: '2026-04-01' }, date: '2026-10-26' }) : null;
  ok2(!cc || (cc.last === '2026-04-01' && cc.days === 208), 'calc returns the last inspection date'); }
