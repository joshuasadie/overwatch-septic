// Estimates (EST-00101…): priced lines for repair work. Your cost and markup stay private; the customer sees prices only.
// The customer accepts (typed name) or declines in the portal; an accepted estimate becomes a 'repair' invoice.
import { clean, id, siteOrigin, sendMail } from './lib.js';
import { createInvoice } from './billing.js';
import { portalComment, portalRequest } from './cases.js';

export const EST_DEFAULTS = { rate: 150, contract_rate: 125, markup: 30, valid_days: 30 };
export const BUSINESS = { name: 'Overwatch Septic, LLC', address: '374 Hubert Herndon Rd, Chapel Hill, NC 27516' };
const TYPES = ['part', 'labor', 'other', 'free'];
const STATUS = ['draft', 'sent', 'accepted', 'declined', 'invoiced', 'void'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const pad = n => String(n).padStart(5, '0');
export const estNo = n => `EST-${pad(n)}`;
const num = (v, max = 1e6) => { const x = Number(String(v ?? '').replace(/[$,%\s]/g, '')); return Number.isFinite(x) && x >= 0 ? Math.min(x, max) : 0; };
const r2 = x => Math.round(x * 100) / 100;
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const today = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);

// Clean and price the lines. unit = what the customer pays per unit.
export function priceLines(raw) {
  const lines = (Array.isArray(raw) ? raw : []).slice(0, 40).map(l => {
    const type = TYPES.includes(l && l.type) ? l.type : 'other';
    const o = { type, desc: clean(l.desc, 240), qty: r2(num(l.qty, 10000)) || (type === 'free' ? 1 : 0) };
    if (type === 'part') { o.cost = r2(num(l.cost)); o.markup = r2(num(l.markup, 1000)); o.unit = r2(o.cost * (1 + o.markup / 100)); }
    else if (type === 'labor') { o.rate = r2(num(l.rate)); o.unit = o.rate; }
    else if (type === 'other') o.unit = r2(num(l.unit));
    else o.unit = 0;
    o.amount = r2(o.qty * o.unit);
    return o;
  }).filter(l => l.desc);
  return lines;
}
export function totals(lines, taxOn, taxRate) {
  const sub = r2(lines.reduce((s, l) => s + l.amount, 0));
  const parts = r2(lines.filter(l => l.type === 'part').reduce((s, l) => s + l.amount, 0));
  const tax = taxOn ? r2(parts * num(taxRate, 20) / 100) : 0;
  return { subtotal: sub, tax, total: r2(sub + tax) };
}
async function nextNum(env) { const r = await env.DB.prepare("UPDATE counters SET next = next + 1 WHERE name = 'est' RETURNING next").first(); return Number(r.next) - 1; }
const hasContract = async (env, customerId) => !!(await env.DB.prepare("SELECT 1 AS x FROM contracts WHERE customer_id = ? AND status = 'complete'").bind(customerId).first());
export async function estimateDefaults(env, customerId) {
  const c = await hasContract(env, customerId);
  return { rate: c ? EST_DEFAULTS.contract_rate : EST_DEFAULTS.rate, under_contract: c, markup: EST_DEFAULTS.markup, valid_until: addDays(today(), EST_DEFAULTS.valid_days) };
}
function row(e, full) {
  const lines = JSON.parse(e.lines || '[]');
  const out = { id: e.id, num: e.num, no: estNo(e.num), customer_id: e.customer_id, customer_name: e.customer_name, contact_id: e.contact_id, contact_name: e.contact_name || '', case_id: e.case_id, case_no: e.case_num ? `OWS-${pad(e.case_num)}` : '', title: e.title, status: e.status, valid_until: e.valid_until, notes: e.notes, tax_on: !!e.tax_on, tax_rate: e.tax_rate, created_at: e.created_at, sent_at: e.sent_at, accepted_at: e.accepted_at, accepted_name: e.accepted_name, declined_at: e.declined_at, decline_reason: e.decline_reason, invoice_id: e.invoice_id, expired: e.status === 'sent' && e.valid_until && e.valid_until < today() };
  out.lines = full ? lines : lines.map(l => ({ type: l.type, desc: l.desc, qty: l.qty, unit: l.unit, amount: l.amount }));
  Object.assign(out, totals(lines, !!e.tax_on, e.tax_rate));
  return out;
}
const SEL = "SELECT e.*, c.name AS customer_name, p.name AS contact_name, k.num AS case_num FROM estimates e JOIN customers c ON c.id = e.customer_id LEFT JOIN customer_contacts p ON p.id = e.contact_id LEFT JOIN cases k ON k.id = e.case_id";

// ---- admin
export async function listEstimates(env, customerId) {
  return (await env.DB.prepare(`${SEL} WHERE e.customer_id = ? ORDER BY e.num DESC`).bind(customerId).all()).results.map(e => row(e, true));
}
export async function getEstimate(env, eid) { const e = await env.DB.prepare(`${SEL} WHERE e.id = ?`).bind(eid).first(); return e ? row(e, true) : null; }
export async function saveEstimate(env, who, b) {
  const now = new Date().toISOString();
  const lines = priceLines(b.lines);
  const f = { title: clean(b.title, 160), valid_until: DATE.test(String(b.valid_until || '')) ? b.valid_until : '', notes: clean(b.notes, 3000), tax_on: b.tax_on ? 1 : 0, tax_rate: b.tax_rate == null || b.tax_rate === '' ? '7' : String(r2(num(b.tax_rate, 20))) };
  if (!f.title) return { error: 'Give the estimate a title.' };
  if (!lines.length) return { error: 'Add at least one line.' };
  let cur = null, customerId;
  if (b.id) {
    cur = await env.DB.prepare('SELECT * FROM estimates WHERE id = ?').bind(String(b.id)).first();
    if (!cur) return { status: 404, error: 'Not found.' };
    if (!['draft', 'sent'].includes(cur.status)) return { status: 409, error: `This estimate is ${cur.status} and can't be changed. Make a new one.` };
    customerId = cur.customer_id;
  } else {
    const c = await env.DB.prepare('SELECT id FROM customers WHERE id = ?').bind(String(b.customer_id || '')).first();
    if (!c) return { status: 404, error: 'Customer not found.' };
    customerId = c.id;
    if (!f.valid_until) f.valid_until = addDays(today(), EST_DEFAULTS.valid_days);
  }
  const p = b.contact_id ? await env.DB.prepare('SELECT id FROM customer_contacts WHERE id = ? AND customer_id = ?').bind(String(b.contact_id), customerId).first() : null;
  const k = b.case_id ? await env.DB.prepare('SELECT id FROM cases WHERE id = ? AND customer_id = ?').bind(String(b.case_id), customerId).first() : null;
  if (b.case_id && !k) return { error: 'That case is not on this account.' };
  if (cur) {
    await env.DB.prepare('UPDATE estimates SET contact_id = ?, case_id = ?, title = ?, valid_until = ?, notes = ?, tax_on = ?, tax_rate = ?, lines = ?, updated_at = ? WHERE id = ?')
      .bind(p ? p.id : cur.contact_id, k ? k.id : (b.case_id === '' ? '' : cur.case_id), f.title, f.valid_until, f.notes, f.tax_on, f.tax_rate, JSON.stringify(lines), now, cur.id).run();
    return { ok: true, id: cur.id, no: estNo(cur.num) };
  }
  const eid = id(), n = await nextNum(env);
  await env.DB.prepare("INSERT INTO estimates (id, num, customer_id, contact_id, case_id, title, status, valid_until, notes, tax_on, tax_rate, lines, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)")
    .bind(eid, n, customerId, p ? p.id : '', k ? k.id : '', f.title, f.valid_until, f.notes, f.tax_on, f.tax_rate, JSON.stringify(lines), now, now).run();
  return { ok: true, id: eid, no: estNo(n) };
}
async function caseNote(env, caseId, body) {
  if (!caseId) return;
  const seq = Number(((await env.DB.prepare('SELECT MAX(seq) AS m FROM case_comments WHERE case_id = ?').bind(caseId).first()) || {}).m || 0) + 1, now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO case_comments (id, case_id, seq, kind, visibility, channel, who, at, body, minutes, emailed, created_at) VALUES (?, ?, ?, 'event', 'private', 'system', '', ?, ?, 0, 0, ?)").bind(id(), caseId, seq, now, body, now).run();
}
export async function sendEstimate(env, who, b) {
  const e = await env.DB.prepare(`${SEL} WHERE e.id = ?`).bind(String(b.id || '')).first();
  if (!e) return { status: 404, error: 'Not found.' };
  if (!['draft', 'sent'].includes(e.status)) return { status: 409, error: `This estimate is ${e.status}.` };
  const c = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(e.customer_id).first();
  const p = e.contact_id ? await env.DB.prepare('SELECT name, email FROM customer_contacts WHERE id = ?').bind(e.contact_id).first() : null;
  const to = (p && p.email) || c.email, name = (p && p.name) || c.name, t = row(e, false);
  const subject = `Estimate ${t.no}: ${e.title}`;
  const text = [`Hello ${name},`, '', `Here is estimate ${t.no} from Overwatch Septic for ${e.title}. The total is $${t.total.toFixed(2)}${e.valid_until ? `, and it is good until ${e.valid_until}` : ''}.`, '', `To read it, and to accept or decline it, sign in to your customer portal: ${siteOrigin(env)}/login/`, '', 'Nothing is done without your approval. If you have a question, reply to this email.', '', 'Overwatch Septic, LLC'].join('\n');
  const ok = await sendMail(env, to, subject, text, env.MAIL_TO);
  if (!ok) return { status: 502, error: 'The email did not send. Try again.' };
  if (env.MAIL_TO && to.toLowerCase() !== String(env.MAIL_TO).toLowerCase()) await sendMail(env, env.MAIL_TO, `[Copy] ${subject} (sent to ${name})`, [`Sent to ${name} <${to}>.`, '', '----- What they received -----', '', text].join('\n'));
  await env.DB.prepare("UPDATE estimates SET status = 'sent', sent_at = ?, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), new Date().toISOString(), e.id).run();
  await caseNote(env, e.case_id, `${t.no} sent to ${name} ($${t.total.toFixed(2)})`);
  return { ok: true, to };
}
export async function voidEstimate(env, who, b) {
  const e = await env.DB.prepare('SELECT * FROM estimates WHERE id = ?').bind(String(b.id || '')).first();
  if (!e) return { status: 404, error: 'Not found.' };
  if (e.status === 'invoiced') return { status: 409, error: 'This estimate has an invoice. Waive the invoice instead.' };
  await env.DB.prepare("UPDATE estimates SET status = 'void', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), e.id).run();
  return { ok: true };
}
export async function invoiceEstimate(env, who, b) {
  const e = await env.DB.prepare('SELECT * FROM estimates WHERE id = ?').bind(String(b.id || '')).first();
  if (!e) return { status: 404, error: 'Not found.' };
  if (e.status !== 'accepted') return { status: 409, error: e.status === 'invoiced' ? 'Already invoiced.' : 'Only an accepted estimate can be invoiced.' };
  const t = totals(JSON.parse(e.lines || '[]'), !!e.tax_on, e.tax_rate), cents = Math.round(t.total * 100);
  if (cents <= 0) return { error: 'This estimate totals $0.00, so there is nothing to invoice.' };
  const c = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(e.customer_id).first();
  const r = await createInvoice(env, who, c, 'repair', e.id, cents);
  await env.DB.prepare("UPDATE estimates SET status = 'invoiced', invoice_id = ?, updated_at = ? WHERE id = ?").bind(r.id, new Date().toISOString(), e.id).run();
  await caseNote(env, e.case_id, `${estNo(e.num)} invoiced ($${t.total.toFixed(2)})`);
  return { ok: true, invoice: r.id, emailed: r.emailed };
}

// ---- customer portal: prices only, never cost or markup
export async function portalEstimates(env, customerId) {
  return (await env.DB.prepare(`${SEL} WHERE e.customer_id = ? AND e.status IN ('sent', 'accepted', 'declined', 'invoiced') ORDER BY e.num DESC`).bind(customerId).all()).results.map(e => row(e, false));
}
export async function portalRespond(env, customer, b, accept) {
  const e = await env.DB.prepare('SELECT * FROM estimates WHERE id = ? AND customer_id = ?').bind(String(b.id || ''), customer.id).first();
  if (!e) return { status: 404, error: 'Not found.' };
  if (e.status !== 'sent') return { status: 409, error: `This estimate is already ${e.status}.` };
  const now = new Date().toISOString(), no = estNo(e.num);
  if (accept) {
    if (e.valid_until && e.valid_until < today()) return { status: 409, error: 'This estimate has expired. Please ask us for an updated one.' };
    const name = clean(b.name, 100); if (name.length < 2) return { error: 'Type your full name to accept.' };
    await env.DB.prepare("UPDATE estimates SET status = 'accepted', accepted_at = ?, accepted_name = ?, updated_at = ? WHERE id = ?").bind(now, name, now, e.id).run();
    await caseNote(env, e.case_id, `${no} accepted by ${name} in the portal`);
    if (env.MAIL_TO) await sendMail(env, env.MAIL_TO, `[${no}] Accepted by ${name}`, [`${name} accepted estimate ${no}, ${e.title}, on ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}.`, '', `Open the admin portal to schedule the work and create the invoice: ${siteOrigin(env)}/admin/`].join('\n'), customer.email);
    return { ok: true };
  }
  const reason = clean(b.reason, 1000);
  await env.DB.prepare("UPDATE estimates SET status = 'declined', declined_at = ?, decline_reason = ?, updated_at = ? WHERE id = ?").bind(now, reason, now, e.id).run();
  await caseNote(env, e.case_id, `${no} declined by ${customer.name}${reason ? ': ' + reason : ''}`);
  if (env.MAIL_TO) await sendMail(env, env.MAIL_TO, `[${no}] Declined by ${customer.name}`, [`${customer.name} declined estimate ${no}, ${e.title}.`, reason ? `Reason: ${reason}` : 'No reason given.'].join('\n'), customer.email);
  return { ok: true };
}
export async function portalQuestion(env, customer, b) {
  const e = await env.DB.prepare('SELECT * FROM estimates WHERE id = ? AND customer_id = ?').bind(String(b.id || ''), customer.id).first();
  if (!e || e.status === 'draft' || e.status === 'void') return { status: 404, error: 'Not found.' };
  const body = clean(b.body, 4000); if (!body) return { error: 'Write your question first.' };
  const no = estNo(e.num), k = e.case_id ? await env.DB.prepare('SELECT id FROM cases WHERE id = ?').bind(e.case_id).first() : null;
  if (k) return portalComment(env, customer, { case_id: k.id, body: `About ${no}: ${body}` });
  const r = await portalRequest(env, customer, { title: `Question about ${no}`, body: `About ${no}, ${e.title}: ${body}` });
  if (r.ok && r.id) await env.DB.prepare('UPDATE estimates SET case_id = ? WHERE id = ?').bind(r.id, e.id).run();
  return r;
}
