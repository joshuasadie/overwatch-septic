// Contracts: the owner signs from an emailed link (or from the customer portal); the contractor countersigns in /admin.
import { contractText, REQUIRED, DEFAULT_TERMS, VISITS, annualFrom, R18E, dateParts } from '../site/contract-text.js';
import { reply, clean, sha, rand, id, isoIn, siteOrigin, sendMail, EMAIL } from './lib.js';
import { createInvoice, contractLocked, toCents, money } from './billing.js';
import { fmtPhone } from './inspection.js';

const TOKEN = /^[A-Za-z0-9_-]{20,60}$/;
export const LINK_DAYS = 14;
export const MAX_MAINT = 20; // routine maintenance lines in an agreement
const TERM_KEYS = ['date', 'owner_name', 'owner_address', 'county', 'system_address', 'permit', 'sys_type', 'rules', 'cite', 'contractor_name', 'contractor_address', 'health_dept', 'response_hours', 'annual_fee', 'increase_pct', 'interest_pct', 'repair_days', 'origination_fee', 'inspection_fee', 'visits', 'rule_set', 'health_addr', 'approval_no', 'health_contact', 'permit_issued', 'emergency_fee'];

// The permit as entered in System setup is the source for the agreement; the customer record fills anything left blank there.
export function permitTerms(sys, customer) {
  const p = (sys && sys.permit) || {}, s = v => String(v ?? '').trim();
  const list = ((sys && sys.addresses) || []).map(s).filter(Boolean);
  const addr = list.length ? (list.length === 1 ? list[0] : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1]) : s(customer.address), parcel = s(p.parcel);
  return {
    owner_name: s(p.owners) || customer.name, owner_address: s(p.mail) || customer.address,
    system_address: addr && parcel && !addr.includes(parcel) ? `${addr} (Parcel No. ${parcel})` : addr,
    county: s(p.county) || customer.county, sys_type: s(p.type).replace(/^type\s+/i, '') || customer.sys_type,
    permit: customer.permit, permit_issued: /^\d{4}-\d{2}-\d{2}$/.test(s(p.issued)) ? s(p.issued) : '', approval_no: s(p.other_no),
  };
}
export function normalizeTerms(input, customer, pm) {
  const t = { ...DEFAULT_TERMS, ...permitTerms(pm, customer), date: new Date().toISOString().slice(0, 10) };
  for (const k of ['permit_issued', 'approval_no']) if (!t[k]) delete t[k];
  for (const k of TERM_KEYS) if (input && input[k] !== undefined && input[k] !== null && !((k === 'permit_issued' || k === 'approval_no') && !String(input[k]).trim())) t[k] = clean(input[k], 300);
  const all = (Array.isArray(input && input.maintenance) ? input.maintenance : DEFAULT_TERMS.maintenance).map(m => clean(m, 200)).filter(Boolean);
  if (all.length > MAX_MAINT) t.maint_over = all.length;
  t.maintenance = all.slice(0, MAX_MAINT);
  return t;
}
export function missingTerms(t) { return REQUIRED.filter(k => !String(t[k] ?? '').trim()); }
export const textHash = async t => sha(JSON.stringify(contractText(t)));

const publicView = (c, customer, locked = false) => {
  const terms = JSON.parse(c.terms), hide = locked && c.status === 'complete';
  return { locked: hide, id: c.id, status: c.status, created_at: c.created_at, text: hide ? null : contractText(terms), owner: { name: c.owner_name, signed_at: c.owner_signed_at }, contractor: { name: c.op_name || terms.contractor_name, signed_at: c.op_signed_at }, owner_label: customer ? customer.name : terms.owner_name, contractor_label: terms.contractor_name, expires_at: c.expires_at };
};

// Builds the exact terms an agreement would be sent with: used by both the preview and the send, so the preview is what is sent.
export async function buildTerms(env, customer, termsIn) {
  let pm = null;
  try { const row = await env.DB.prepare('SELECT data FROM systems WHERE customer_id = ?').bind(customer.id).first(); pm = row ? JSON.parse(row.data) : null; } catch { pm = null; }
  const terms = normalizeTerms(termsIn, customer, pm);
  // Per-inspection pricing: the annual fee is the fee times the inspections per year the permit requires.
  const per = String(terms.inspection_fee ?? '').replace(/,/g, '').trim();
  if (per) {
    if (!/^\d+(\.\d{1,2})?$/.test(per) || Number(per) <= 0) return { status: 400, error: 'The fee per inspection must be a number, like 250.' };
    if (!VISITS.some(v => v[0] === terms.visits)) return { status: 400, error: 'Choose how many inspections per year the permit requires.' };
    terms.inspection_fee = per; terms.annual_fee = String(annualFrom(per, terms.visits));
  } else { delete terms.inspection_fee; delete terms.visits; }
  // Rules that govern the agreement: 18E for permits issued on or after January 1, 2024, 18A .1900 for older ones.
  if (!terms.rule_set) terms.rule_set = '18E'; // the current rules, unless 18A is chosen
  if (terms.rule_set === '18E') { terms.cite = R18E.contract; terms.rules = R18E.rules; }
  else if (terms.rule_set && terms.rule_set !== '18A') return { status: 400, error: 'Choose which rules apply: 18E or 18A.' };
  else if (!terms.rule_set) delete terms.rule_set;
  // agreement version 2: report, repair, operator, price and notice wording requested by owners (Oct 2026)
  terms.v = 4; // 4: notices may also be sent by email
  terms.owner_email = customer.email || ''; terms.contractor_email = env.MAIL_TO || '';
  try { const r = await env.DB.prepare('SELECT email FROM counties WHERE name = ?').bind(String(terms.county || '').trim().toLowerCase()).first(); terms.health_email = r ? r.email : ''; } catch { terms.health_email = ''; }
  const op = { name: env.OPERATOR_NAME || '', cert: env.OPERATOR_CERT || '' }; if (op.name && op.cert) { terms.operator_name = op.name; terms.operator_cert = op.cert; }
  if (terms.maint_over) return { status: 400, error: `The routine maintenance list has ${terms.maint_over} lines. The most an agreement can hold is ${MAX_MAINT}. Combine or remove some.` };
  const miss = missingTerms(terms);
  if (miss.length) return { status: 400, error: 'Please fill in: ' + miss.join(', ') + '.' };
  if (!/^\d+(\.\d{1,2})?$/.test(terms.annual_fee.replace(/,/g, ''))) return { status: 400, error: 'The annual fee must be a number, like 500.' };
  terms.annual_fee = terms.annual_fee.replace(/,/g, '');
  const fee = String(terms.origination_fee ?? '').trim();
  if (fee && toCents(fee) === null) return { status: 400, error: 'The origination fee must be a number, like 100.' };
  terms.origination_fee = fee;
  return { terms, sys: pm };
}
export async function previewContract(env, customer, termsIn) {
  const b = await buildTerms(env, customer, termsIn); if (b.error) return b;
  const t = b.terms, p = (b.sys && b.sys.permit) || {}, warn = [];
  if (!String(t.permit || '').trim()) warn.push(t.permit_issued ? `No Operation Permit number, so the agreement says "the Operation Permit issued ${(d => `${d.month} ${d.day.replace(/\D+$/, '')}, ${d.year}`)(dateParts(t.permit_issued))}".` : 'No Operation Permit number or issue date. Add the issue date in System setup.');
  if (!t.approval_no) warn.push('No Provisional or Innovative Approval number. Leave it blank only if the system has none.');
  if (!t.health_email) warn.push(`No email saved for ${t.county || 'this'} County, so the notice section lists no county email.`);
  if (!p.owners) warn.push('No owners in System setup, so the customer record name is used.');
  if (!t.health_contact) warn.push('No health department contact name.');
  const from = [p.owners && 'owners', (b.sys && (b.sys.addresses || []).length) && `addresses (${b.sys.addresses.length})`, p.parcel && `parcel ${p.parcel}`, p.type && p.type, /^\d{4}-\d{2}-\d{2}$/.test(p.issued || '') && `issued ${(d => `${d.month.slice(0, 3)} ${d.day.replace(/\D+$/, '')}, ${d.year}`)(dateParts(p.issued))}`, p.other_no && `approval ${p.other_no}`].filter(Boolean);
  return { ok: true, text: contractText(t), terms: t, to: customer.email, copy: env.MAIL_TO || '', from_setup: from, warnings: warn };
}
export async function createContract(env, who, customer, termsIn) {
  const b = await buildTerms(env, customer, termsIn); if (b.error) return b;
  const terms = b.terms;
  const token = rand(24), cid = id(), now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO contracts (id, customer_id, created_at, status, terms, text_hash, owner_token, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(cid, customer.id, now, 'sent', JSON.stringify(terms), await textHash(terms), await sha(token), isoIn(LINK_DAYS * 864e5)),
    env.DB.prepare('INSERT INTO audit (at, who, action, target, detail) VALUES (?, ?, ?, ?, ?)').bind(now, who, 'contract-sent', cid, customer.name),
  ]);
  const sent = await mailOwner(env, customer, token);
  return { ok: true, id: cid, emailed: sent };
}
async function mailOwner(env, customer, token) {
  const link = `${siteOrigin(env)}/c/${token}`;
  const text = l => [`Hello ${customer.name},`, '', 'Your Inspection and Maintenance Agreement with Overwatch Septic is ready. Please read it and sign it here. The link works for ' + LINK_DAYS + ' days:', '', l, '', 'Signing is done by typing your name. After you sign, we sign, and you can see the signed agreement in your customer portal.', '', 'Overwatch Septic, LLC'].join('\n');
  const sent = await sendMail(env, customer.email, 'Please review and sign your septic agreement', text(link), env.MAIL_TO);
  // your copy, so you know it went out. The signing link is left out so only the owner can sign.
  if (sent && env.MAIL_TO) await sendMail(env, env.MAIL_TO, `[Copy] Agreement sent to ${customer.name}`, [`Sent to ${customer.email} on ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}.`, '', '----- What they received -----', '', text('(signing link: sent only to the owner)')].join('\n'));
  return sent;
}
export async function resendContract(env, who, cid) {
  const c = await env.DB.prepare('SELECT * FROM contracts WHERE id = ?').bind(cid).first();
  if (!c) return { status: 404, error: 'Not found.' };
  if (c.status !== 'sent') return { status: 400, error: 'Only an unsigned agreement can be sent again.' };
  const customer = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(c.customer_id).first();
  const token = rand(24);
  await env.DB.prepare('UPDATE contracts SET owner_token = ?, expires_at = ? WHERE id = ?').bind(await sha(token), isoIn(LINK_DAYS * 864e5), cid).run();
  await env.DB.prepare('INSERT INTO audit (at, who, action, target, detail) VALUES (?, ?, ?, ?, ?)').bind(new Date().toISOString(), who, 'contract-resent', cid, customer.name).run();
  return { ok: true, emailed: await mailOwner(env, customer, token) };
}
export async function voidContract(env, who, cid) {
  const c = await env.DB.prepare('SELECT status FROM contracts WHERE id = ?').bind(cid).first();
  if (!c) return { status: 404, error: 'Not found.' };
  if (c.status === 'complete') return { status: 400, error: 'A fully signed agreement cannot be voided here.' };
  await env.DB.batch([env.DB.prepare("UPDATE contracts SET status = 'void' WHERE id = ?").bind(cid), env.DB.prepare('INSERT INTO audit (at, who, action, target, detail) VALUES (?, ?, ?, ?, ?)').bind(new Date().toISOString(), who, 'contract-voided', cid, '')]);
  return { ok: true };
}

// Owner signs. `byToken` is the emailed link; the portal passes the contract row it already authorized.
async function ownerSign(env, request, c, name, agree) {
  const typed = clean(name, 100);
  if (c.status !== 'sent') return { status: 400, error: c.status === 'void' ? 'This agreement was cancelled.' : 'This agreement is already signed.' };
  if (c.expires_at < new Date().toISOString()) return { status: 410, error: 'This link has expired. Please ask us to send a new one.' };
  if (typed.length < 3) return { status: 400, error: 'Please type your full name.' };
  if (agree !== true) return { status: 400, error: 'Please confirm that you have read and agree to the agreement.' };
  const now = new Date().toISOString(), ip = await sha('i:' + (request.headers.get('cf-connecting-ip') || ''));
  const r = await env.DB.prepare("UPDATE contracts SET status = 'owner_signed', owner_name = ?, owner_signed_at = ?, owner_ip = ? WHERE id = ? AND status = 'sent'").bind(typed, now, ip, c.id).run();
  if (!r.meta || r.meta.changes !== 1) return { status: 409, error: 'This agreement was just signed.' };
  const customer = await env.DB.prepare('SELECT name FROM customers WHERE id = ?').bind(c.customer_id).first();
  await env.DB.prepare('INSERT INTO audit (at, who, action, target, detail) VALUES (?, ?, ?, ?, ?)').bind(now, typed, 'contract-owner-signed', c.id, customer ? customer.name : '').run();
  await sendMail(env, env.MAIL_TO, `[Sign now] ${customer ? customer.name : 'A customer'} signed the agreement`, `${typed} signed the Inspection and Maintenance Agreement. Open ${siteOrigin(env)}/admin/ to countersign it.`);
  return { ok: true };
}

export async function tokenApi(request, env, path) {
  const m = /^\/api\/contract\/([^/]+)(\/sign)?$/.exec(path);
  if (!m || !TOKEN.test(m[1])) return reply({ ok: false, error: 'Not found.' }, 404);
  const c = await env.DB.prepare('SELECT * FROM contracts WHERE owner_token = ?').bind(await sha(m[1])).first();
  if (!c) return reply({ ok: false, error: 'This link is not valid. Please ask us to send a new one.' }, 404);
  if (!m[2]) {
    if (request.method !== 'GET') return reply({ ok: false, error: 'Method not allowed.' }, 405);
    return reply({ ok: true, phone: fmtPhone(env.PHONE_NUMBER || env.OPERATOR_PHONE), expired: c.status === 'sent' && c.expires_at < new Date().toISOString(), contract: publicView(c, null, await contractLocked(env, c.id)) });
  }
  if (request.method !== 'POST') return reply({ ok: false, error: 'Method not allowed.' }, 405);
  return { contract: c, sign: (name, agree) => ownerSign(env, request, c, name, agree) };
}
export const signAsOwner = ownerSign;

export async function countersign(env, who, cid, name) {
  const c = await env.DB.prepare('SELECT * FROM contracts WHERE id = ?').bind(cid).first();
  if (!c) return { status: 404, error: 'Not found.' };
  if (c.status !== 'owner_signed') return { status: 400, error: c.status === 'sent' ? 'The customer has not signed yet.' : 'This agreement cannot be signed now.' };
  const typed = clean(name, 100);
  if (typed.length < 3) return { status: 400, error: 'Please type your full name.' };
  const now = new Date().toISOString();
  const r = await env.DB.prepare("UPDATE contracts SET status = 'complete', op_name = ?, op_signed_at = ?, op_by = ? WHERE id = ? AND status = 'owner_signed'").bind(typed, now, who, cid).run();
  if (!r.meta || r.meta.changes !== 1) return { status: 409, error: 'Already signed.' };
  const customer = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(c.customer_id).first();
  await env.DB.prepare('INSERT INTO audit (at, who, action, target, detail) VALUES (?, ?, ?, ?, ?)').bind(now, who, 'contract-complete', cid, customer.name).run();
  const origin = siteOrigin(env), cents = toCents(JSON.parse(c.terms).origination_fee);
  if (cents) { const inv = await createInvoice(env, who, customer, 'origination', cid, cents); return { ok: true, emailed: inv.emailed, invoice: inv.id }; }
  const emailed = await sendMail(env, customer.email, 'Your septic agreement is fully signed', [`Hello ${customer.name},`, '', 'Overwatch Septic has signed your Inspection and Maintenance Agreement. It is now in effect.', '', `You can see and download the signed copy in your customer portal: ${origin}/login/`, '', 'Overwatch Septic, LLC'].join('\n'), env.MAIL_TO);
  return { ok: true, emailed };
}

export const contractForPortal = publicView;
export { publicView };

// ---- Send signed copy: once the origination fee is paid (or waived, or there was none), email the signed PDF
// to the county, you, the customer and any other account contact you pick.
const PAID = new Set(['paid', 'waived']);
export async function signedSendInfo(env, contractId, customer) {
  const inv = await env.DB.prepare("SELECT status FROM invoices WHERE kind = 'origination' AND ref_id = ? ORDER BY created_at DESC").bind(contractId).first();
  const paid = !inv || PAID.has(inv.status);
  const county = await env.DB.prepare('SELECT email FROM counties WHERE name = ?').bind(String(customer.county || '').trim().toLowerCase()).first();
  const people = (await env.DB.prepare("SELECT name, email FROM customer_contacts WHERE customer_id = ? AND email != '' ORDER BY is_primary DESC, name").bind(customer.id).all()).results;
  const opts = [];
  if (county && county.email) opts.push({ kind: 'county', label: `${customer.county} County`, email: county.email, on: true });
  if (env.MAIL_TO) opts.push({ kind: 'you', label: 'You', email: env.MAIL_TO, on: true });
  const seen = new Set(opts.map(o => o.email.toLowerCase()));
  const add = (label, email, on) => { if (email && !seen.has(email.toLowerCase())) { seen.add(email.toLowerCase()); opts.push({ kind: 'customer', label, email, on }); } };
  add(customer.name, customer.email, true);
  for (const p of people) add(p.name, p.email, false);
  const sends = (await env.DB.prepare('SELECT sent_at, recipients FROM contract_sends WHERE contract_id = ? ORDER BY sent_at DESC').bind(contractId).all()).results.map(r => ({ sent_at: r.sent_at, recipients: JSON.parse(r.recipients || '[]') }));
  return { paid, invoice_status: inv ? inv.status : 'none', options: opts, sends };
}
export async function sendSigned(env, who, b) {
  const c = await env.DB.prepare('SELECT * FROM contracts WHERE id = ?').bind(String(b.id || '')).first();
  if (!c) return { status: 404, error: 'Not found.' };
  if (c.status !== 'complete') return { status: 400, error: 'Only a fully signed agreement can be sent.' };
  const customer = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(c.customer_id).first();
  const info = await signedSendInfo(env, c.id, customer);
  if (!info.paid) return { status: 409, error: 'Available once the origination fee is paid.' };
  const want = new Set((Array.isArray(b.to) ? b.to : []).map(x => String(x).toLowerCase()));
  const to = info.options.filter(o => want.has(o.email.toLowerCase()));
  if (!to.length) return { error: 'Choose at least one person to send it to.' };
  const pdf = String(b.pdf || '');
  if (!/^[A-Za-z0-9+/=]+$/.test(pdf) || pdf.length < 200 || pdf.length > 6e6 || !atob(pdf.slice(0, 8)).startsWith('%PDF')) return { error: 'The signed PDF could not be made. Try again.' };
  const t = JSON.parse(c.terms), addr = t.system_address || customer.address;
  const permit = t.permit ? `Operation Permit Number ${t.permit}` : t.permit_issued ? `the Operation Permit issued ${(d => `${d.month} ${d.day.replace(/\D+$/, '')}, ${d.year}`)(dateParts(t.permit_issued))}` : 'the Operation Permit';
  const fname = `Signed-agreement-${customer.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/-+$/, '')}.pdf`, att = [{ filename: fname, content: pdf }];
  const subject = `Signed O&M agreement: ${addr}`;
  const body = o => o.kind === 'county'
    ? [`${customer.county} County Environmental Health,`, '', `Attached is the signed Maintenance and Inspection Agreement between ${t.owner_name || customer.name} and ${t.contractor_name || 'Overwatch Septic, LLC'} for the ${t.sys_type ? 'Type ' + t.sys_type + ' ' : ''}system at ${addr}, as required by ${permit}.`, '', 'Please file it with the system record. Reply to this email with any questions.', '', 'Overwatch Septic, LLC']
    : o.kind === 'you'
      ? [`Signed agreement for ${customer.name}, sent ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} to: ${to.map(x => x.label + ' <' + x.email + '>').join(', ')}.`]
      : [`Hello ${o.label},`, '', `Attached is your fully signed Maintenance and Inspection Agreement with Overwatch Septic for ${addr}. ${to.some(x => x.kind === 'county') ? `A copy has also been sent to ${customer.county} County Environmental Health. ` : ''}Please keep it with your septic records.`, '', 'Overwatch Septic, LLC'];
  const sent = [];
  for (const o of to) if (await sendMail(env, o.email, o.kind === 'you' ? `[Copy] ${subject}` : subject, body(o).join('\n'), env.MAIL_TO, { attachments: att })) sent.push({ label: o.label, email: o.email });
  if (!sent.length) return { status: 502, error: 'The email did not send. Try again.' };
  await env.DB.prepare('INSERT INTO contract_sends (id, contract_id, sent_at, who, recipients) VALUES (?, ?, ?, ?, ?)').bind(id(), c.id, new Date().toISOString(), String(who || ''), JSON.stringify(sent)).run();
  return { ok: true, sent };
}
