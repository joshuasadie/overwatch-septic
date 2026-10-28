// Contracts: the owner signs from an emailed link (or from the customer portal); the contractor countersigns in /admin.
import { contractText, REQUIRED, DEFAULT_TERMS, VISITS, annualFrom, R18E } from '../site/contract-text.js';
import { reply, clean, sha, rand, id, isoIn, siteOrigin, sendMail, EMAIL } from './lib.js';
import { createInvoice, contractLocked, toCents, money } from './billing.js';

const TOKEN = /^[A-Za-z0-9_-]{20,60}$/;
export const LINK_DAYS = 14;
const TERM_KEYS = ['date', 'owner_name', 'owner_address', 'county', 'system_address', 'permit', 'sys_type', 'rules', 'cite', 'contractor_name', 'contractor_address', 'health_dept', 'response_hours', 'annual_fee', 'increase_pct', 'interest_pct', 'repair_days', 'origination_fee', 'inspection_fee', 'visits', 'rule_set'];

export function normalizeTerms(input, customer) {
  const t = { ...DEFAULT_TERMS, owner_name: customer.name, owner_address: customer.address, system_address: customer.address, county: customer.county, sys_type: customer.sys_type, permit: customer.permit, date: new Date().toISOString().slice(0, 10) };
  for (const k of TERM_KEYS) if (input && input[k] !== undefined && input[k] !== null) t[k] = clean(input[k], 300);
  t.maintenance = (Array.isArray(input && input.maintenance) ? input.maintenance : DEFAULT_TERMS.maintenance).map(m => clean(m, 200)).filter(Boolean).slice(0, 8);
  return t;
}
export function missingTerms(t) { return REQUIRED.filter(k => !String(t[k] ?? '').trim()); }
export const textHash = async t => sha(JSON.stringify(contractText(t)));

const publicView = (c, customer, locked = false) => {
  const terms = JSON.parse(c.terms), hide = locked && c.status === 'complete';
  return { locked: hide, id: c.id, status: c.status, created_at: c.created_at, text: hide ? null : contractText(terms), owner: { name: c.owner_name, signed_at: c.owner_signed_at }, contractor: { name: c.op_name || terms.contractor_name, signed_at: c.op_signed_at }, owner_label: customer ? customer.name : terms.owner_name, contractor_label: terms.contractor_name, expires_at: c.expires_at };
};

export async function createContract(env, who, customer, termsIn) {
  const terms = normalizeTerms(termsIn, customer);
  // Per-inspection pricing: the annual fee is the fee times the inspections per year the permit requires.
  const per = String(terms.inspection_fee ?? '').replace(/,/g, '').trim();
  if (per) {
    if (!/^\d+(\.\d{1,2})?$/.test(per) || Number(per) <= 0) return { status: 400, error: 'The fee per inspection must be a number, like 250.' };
    if (!VISITS.some(v => v[0] === terms.visits)) return { status: 400, error: 'Choose how many inspections per year the permit requires.' };
    terms.inspection_fee = per; terms.annual_fee = String(annualFrom(per, terms.visits));
  } else { delete terms.inspection_fee; delete terms.visits; }
  // Rules that govern the agreement: 18E for permits issued on or after January 1, 2024, 18A .1900 for older ones.
  if (terms.rule_set === '18E') { terms.cite = R18E.contract; terms.rules = R18E.rules; }
  else if (terms.rule_set && terms.rule_set !== '18A') return { status: 400, error: 'Choose which rules apply: 18E or 18A.' };
  else if (!terms.rule_set) delete terms.rule_set;
  const miss = missingTerms(terms);
  if (miss.length) return { status: 400, error: 'Please fill in: ' + miss.join(', ') + '.' };
  if (!/^\d+(\.\d{1,2})?$/.test(terms.annual_fee.replace(/,/g, ''))) return { status: 400, error: 'The annual fee must be a number, like 500.' };
  terms.annual_fee = terms.annual_fee.replace(/,/g, '');
  const fee = String(terms.origination_fee ?? '').trim();
  if (fee && toCents(fee) === null) return { status: 400, error: 'The origination fee must be a number, like 100.' };
  terms.origination_fee = fee;
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
  return sendMail(env, customer.email, 'Please review and sign your septic agreement', [`Hello ${customer.name},`, '', 'Your Inspection and Maintenance Agreement with Overwatch Septic is ready. Please read it and sign it here. The link works for ' + LINK_DAYS + ' days:', '', link, '', 'Signing is done by typing your name. After you sign, we sign, and you can see the signed agreement in your customer portal.', '', 'Overwatch Septic, LLC'].join('\n'), env.MAIL_TO);
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
    return reply({ ok: true, expired: c.status === 'sent' && c.expires_at < new Date().toISOString(), contract: publicView(c, null, await contractLocked(env, c.id)) });
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
