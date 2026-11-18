// Invoices to anyone (INV-00101…): an engineer, a contractor, a property manager, or a customer for one-off work.
// A draft lives only in `bills`. Sending creates the matching `invoices` row (kind 'bill', no customer_id), so the
// Pay link, Stripe, "Mark paid" and the daily run work the same way as every other invoice.
// The bill-to person never gets a portal login; a customer chosen as the bill-to only fills in the name, email and address.
import { clean, id, EMAIL, siteOrigin, sendMail, esc } from './lib.js';
import { etDate, addDays, money, toCents } from './billing.js';
import { BUSINESS } from './estimates.js';

export const invNo = n => `INV-${String(n).padStart(5, '0')}`;
export const TERMS = [0, 15, 30];
const SIG = ['Joshua Klein', 'Overwatch Septic, LLC | Septic O&M', 'Joshua@OverwatchSeptic.com | 919-525-1455', 'https://overwatchseptic.com/'];
const niceDate = s => new Date(s + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const audit = (env, who, action, target, detail = '') => env.DB.prepare('INSERT INTO audit (at, who, action, target, detail) VALUES (?, ?, ?, ?, ?)').bind(new Date().toISOString(), who, action, target, detail).run();

function fields(b) {
  const f = {
    bill_name: clean(b.bill_name, 120), greet: clean(b.greet, 60), bill_company: clean(b.bill_company, 120), bill_email: clean(b.bill_email, 254), bill_address: clean(b.bill_address, 240),
    contact_id: clean(b.contact_id, 40), customer_id: clean(b.customer_id, 40), job: clean(b.job, 200), per_line: b.per_line ? 1 : 0,
    terms: TERMS.includes(Number(b.terms)) ? Number(b.terms) : 30, pay_online: b.pay_online === false ? 0 : 1, pay_check: b.pay_check === false ? 0 : 1,
    reminders: b.reminders === 'none' ? 'none' : 'one', notes: clean(b.notes, 1000),
  };
  f.lines = (Array.isArray(b.lines) ? b.lines : []).slice(0, 30).map(l => ({ date: clean(l && l.date, 20), desc: clean(l && l.desc, 300), cents: f.per_line ? toCents(l && l.amount) : null })).filter(l => l.desc);
  if (!f.bill_name) return { error: 'Enter who the invoice is to.' };
  if (!EMAIL.test(f.bill_email)) return { error: 'Enter a valid email address for the invoice.' };
  if (!f.lines.length) return { error: 'Add at least one line describing the work.' };
  if (f.per_line && f.lines.some(l => l.cents === null)) return { error: 'Enter an amount on every line, like 450.' };
  f.total_cents = f.per_line ? f.lines.reduce((s, l) => s + l.cents, 0) : toCents(b.total);
  if (!f.total_cents) return { error: 'Enter the invoice total, like 2500.' };
  if (!f.pay_online && !f.pay_check) return { error: 'Choose at least one way to pay.' };
  if (!f.greet) f.greet = f.bill_name.split(/[\s,]+/)[0];
  return f;
}
const COLS = ['bill_name', 'greet', 'bill_company', 'bill_email', 'bill_address', 'contact_id', 'customer_id', 'job', 'lines', 'per_line', 'total_cents', 'terms', 'pay_online', 'pay_check', 'reminders', 'notes'];
const vals = f => COLS.map(k => k === 'lines' ? JSON.stringify(f.lines) : f[k]);

function row(b) {
  if (!b) return null;
  return { id: b.invoice_id, num: b.num, no: invNo(b.num), state: b.state, bill_name: b.bill_name, greet: b.greet, bill_company: b.bill_company, bill_email: b.bill_email, bill_address: b.bill_address, contact_id: b.contact_id, customer_id: b.customer_id, job: b.job, lines: JSON.parse(b.lines || '[]'), per_line: !!b.per_line, total_cents: b.total_cents, terms: b.terms, due_date: b.due_date, pay_online: !!b.pay_online, pay_check: !!b.pay_check, reminders: b.reminders, notes: b.notes, sent_at: b.sent_at, sent_date: b.sent_at ? etDate(new Date(b.sent_at)) : '', created_at: b.created_at, pay_url: '/pay/' + b.invoice_id, status: b.status || '', paid_at: b.paid_at || '', note: b.inote || '' };
}
const SEL = 'SELECT b.*, i.status AS status, i.paid_at AS paid_at, i.note AS inote FROM bills b LEFT JOIN invoices i ON i.id = b.invoice_id';
export const getBill = async (env, bid) => row(await env.DB.prepare(`${SEL} WHERE b.invoice_id = ?`).bind(String(bid)).first());

export async function listBills(env) {
  const bills = (await env.DB.prepare(`${SEL} ORDER BY b.num DESC LIMIT 100`).all()).results.map(row);
  const contacts = (await env.DB.prepare("SELECT k.id, k.name, k.company, k.email, COALESCE(a.address, '') AS address FROM contacts k LEFT JOIN contact_addr a ON a.contact_id = k.id ORDER BY k.name").all()).results;
  const customers = (await env.DB.prepare('SELECT id, name, email, address FROM customers ORDER BY name').all()).results;
  const next = await env.DB.prepare("SELECT next FROM counters WHERE name = 'inv'").first();
  return { ok: true, bills, contacts, customers, next_no: invNo(next ? next.next : 101) };
}

// Save to Contacts: a new contact, or the bill-to address (and a missing email) on an existing one.
async function saveContact(env, f) {
  const now = new Date().toISOString();
  let k = f.contact_id ? await env.DB.prepare('SELECT id, email FROM contacts WHERE id = ?').bind(f.contact_id).first() : null;
  if (k) { if (!k.email) await env.DB.prepare('UPDATE contacts SET email = ?, updated_at = ? WHERE id = ?').bind(f.bill_email, now, k.id).run(); }
  else {
    k = { id: id() };
    await env.DB.prepare("INSERT INTO contacts (id, name, company, kind, email, notes, created_at, updated_at) VALUES (?, ?, ?, 'Other', ?, ?, ?, ?)").bind(k.id, f.bill_name, f.bill_company, f.bill_email, 'Added from an invoice.', now, now).run();
  }
  if (f.bill_address) await env.DB.prepare('INSERT INTO contact_addr (contact_id, address) VALUES (?, ?) ON CONFLICT(contact_id) DO UPDATE SET address = excluded.address').bind(k.id, f.bill_address).run();
  return k.id;
}

export async function saveBill(env, who, b) {
  const f = fields(b); if (f.error) return f;
  const now = new Date().toISOString();
  if (f.customer_id && !(await env.DB.prepare('SELECT 1 AS x FROM customers WHERE id = ?').bind(f.customer_id).first())) f.customer_id = '';
  if (f.contact_id && !(await env.DB.prepare('SELECT 1 AS x FROM contacts WHERE id = ?').bind(f.contact_id).first())) f.contact_id = '';
  if (b.save_contact && !f.customer_id) f.contact_id = await saveContact(env, f);
  if (b.id) {
    const cur = await env.DB.prepare('SELECT state, num FROM bills WHERE invoice_id = ?').bind(String(b.id)).first();
    if (!cur) return { status: 404, error: 'Not found.' };
    if (cur.state !== 'draft') return { status: 409, error: 'This invoice was already sent. Void it and make a new one to change it.' };
    await env.DB.prepare(`UPDATE bills SET ${COLS.map(k => k + ' = ?').join(', ')}, updated_at = ? WHERE invoice_id = ?`).bind(...vals(f), now, String(b.id)).run();
    return { ok: true, id: String(b.id), no: invNo(cur.num), contact_id: f.contact_id };
  }
  const n = Number((await env.DB.prepare("UPDATE counters SET next = next + 1 WHERE name = 'inv' RETURNING next").first()).next) - 1, bid = id();
  await env.DB.prepare(`INSERT INTO bills (invoice_id, num, state, ${COLS.join(', ')}, created_at, updated_at) VALUES (?, ?, 'draft', ${COLS.map(() => '?').join(', ')}, ?, ?)`).bind(bid, n, ...vals(f), now, now).run();
  await audit(env, who, 'bill-draft', bid, `${invNo(n)} ${f.bill_name} ${money(f.total_cents)}`);
  return { ok: true, id: bid, no: invNo(n), contact_id: f.contact_id };
}

function mail(env, bl, kind) {
  const no = invNo(bl.num), amt = money(bl.total_cents), link = `${siteOrigin(env)}/pay/${bl.invoice_id}`, today = etDate();
  const due = bl.terms === 0 ? 'It is due on receipt.' : `It is due ${niceDate(bl.due_date)}.`;
  const check = `${bl.pay_online ? 'Or mail' : 'Please mail'} a check payable to ${BUSINESS.name}, ${BUSINESS.address}, with the invoice number.`;
  let first;
  if (kind === 'reminder') first = `A friendly reminder that invoice ${no} for ${amt}${bl.job ? ` (${bl.job})` : ''} ${bl.due_date > today ? `is due ${niceDate(bl.due_date)}` : bl.due_date === today ? 'is due today' : 'is past due'}. A copy is attached.`;
  else first = `Attached is invoice ${no} for ${amt}${bl.job ? ` for ${bl.job}` : ''}. ${due}`;
  const text = [`Hello ${bl.greet || bl.bill_name},`, '', first, '', ...(bl.pay_online ? [`Pay online: ${link}`, ''] : []), ...(bl.pay_check ? [check, ''] : []), 'If you have any questions, reply to this email or call 919-525-1455.', '', 'Thank you,', ...SIG].join('\n');
  const html = `<div style="font:15px/1.55 Arial,sans-serif;color:#241e17;max-width:560px"><p>Hello ${esc(bl.greet || bl.bill_name)},</p><p>${esc(first)}</p>${bl.pay_online ? `<p><a href="${esc(link)}" style="display:inline-block;background:#a8741f;color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:6px">Pay online</a></p>` : ''}${bl.pay_check ? `<p style="color:#51463a">${esc(check)}</p>` : ''}<p>If you have any questions, reply to this email or call 919-525-1455.</p><p>Thank you,<br><b>Joshua Klein</b><br>Overwatch Septic, LLC | Septic O&amp;M<br>Joshua@OverwatchSeptic.com | 919-525-1455<br><a href="https://overwatchseptic.com/">https://overwatchseptic.com/</a></p></div>`;
  const subject = kind === 'reminder' ? `Reminder: invoice ${no} (${amt})` : `Invoice ${no} from Overwatch Septic${bl.job ? ' – ' + bl.job.slice(0, 80) : ''}`;
  return { subject, text, html };
}
// The email to the bill-to person, with the PDF attached, then a copy to you.
export async function mailBill(env, bl, kind, pdf) {
  const m = mail(env, bl, kind), extra = { html: m.html, ...(pdf ? { attachments: [{ filename: `${invNo(bl.num)}.pdf`, content: pdf }] } : {}) };
  const ok = await sendMail(env, bl.bill_email, m.subject, m.text, env.MAIL_TO, extra);
  if (ok && env.MAIL_TO && bl.bill_email.toLowerCase() !== String(env.MAIL_TO).toLowerCase()) await sendMail(env, env.MAIL_TO, `[Copy] ${m.subject} (sent to ${bl.bill_name})`, [`Sent to ${bl.bill_name} <${bl.bill_email}> on ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}.`, '', '----- What they received -----', '', m.text].join('\n'), '', pdf ? { attachments: extra.attachments } : {});
  return ok;
}

const PDF = /^[A-Za-z0-9+/]+={0,2}$/;
export async function sendBill(env, who, b, now = new Date()) {
  const bl = await env.DB.prepare('SELECT * FROM bills WHERE invoice_id = ?').bind(String(b.id || '')).first();
  if (!bl) return { status: 404, error: 'Not found.' };
  const pdf = typeof b.pdf === 'string' && b.pdf.length < 1.5e6 && PDF.test(b.pdf) ? b.pdf : '';
  if (!pdf) return { error: 'The PDF could not be made. Reload the page and try again.' };
  if (bl.state === 'void') return { status: 409, error: 'This invoice was voided.' };
  if (bl.state === 'sent') {
    const inv = await env.DB.prepare('SELECT status FROM invoices WHERE id = ?').bind(bl.invoice_id).first();
    if (!inv || inv.status !== 'open') return { status: 409, error: 'This invoice is already paid.' };
    if (!(await mailBill(env, bl, 'invoice', pdf))) return { status: 502, error: 'The email did not send. Try again.' };
    await audit(env, who, 'bill-resent', bl.invoice_id, invNo(bl.num));
    return { ok: true, emailed: true };
  }
  const nowIso = now.toISOString(), date = etDate(now), due = addDays(date, bl.terms);
  const sent = { ...bl, due_date: due };
  if (!(await mailBill(env, sent, 'invoice', pdf))) return { status: 502, error: 'The email did not send, so nothing was recorded. Try again.' };
  await env.DB.batch([
    env.DB.prepare("INSERT INTO invoices (id, customer_id, kind, ref_id, amount_cents, created_at, created_date) VALUES (?, '', 'bill', ?, ?, ?, ?)").bind(bl.invoice_id, bl.invoice_id, bl.total_cents, nowIso, date),
    env.DB.prepare("UPDATE bills SET state = 'sent', sent_at = ?, due_date = ?, updated_at = ? WHERE invoice_id = ?").bind(nowIso, due, nowIso, bl.invoice_id),
  ]);
  await audit(env, who, 'invoice-created', bl.invoice_id, `${invNo(bl.num)} ${bl.bill_name} ${money(bl.total_cents)}`);
  return { ok: true, emailed: true, due_date: due };
}

export async function voidBill(env, who, b) {
  const bl = await env.DB.prepare('SELECT * FROM bills WHERE invoice_id = ?').bind(String(b.id || '')).first();
  if (!bl) return { status: 404, error: 'Not found.' };
  if (bl.state === 'draft') { await env.DB.prepare('DELETE FROM bills WHERE invoice_id = ?').bind(bl.invoice_id).run(); await audit(env, who, 'bill-draft-deleted', bl.invoice_id, invNo(bl.num)); return { ok: true, deleted: true }; }
  if (bl.state === 'void') return { ok: true };
  const r = await env.DB.prepare("UPDATE invoices SET status = 'waived', note = 'Voided', released_at = ?, notice_state = 'none' WHERE id = ? AND status = 'open'").bind(new Date().toISOString(), bl.invoice_id).run();
  if (!r.meta || r.meta.changes !== 1) return { status: 409, error: 'Only an unpaid invoice can be voided.' };
  await env.DB.prepare("UPDATE bills SET state = 'void', updated_at = ? WHERE invoice_id = ?").bind(new Date().toISOString(), bl.invoice_id).run();
  await audit(env, who, 'bill-voided', bl.invoice_id, invNo(bl.num));
  return { ok: true };
}
