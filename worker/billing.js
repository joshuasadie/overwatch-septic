// Billing: invoices, Stripe Checkout, the 3 business day hold, release of contracts and reports, and the daily unpaid sequence.
import { reply, clean, id, rand, sha, siteOrigin, sendMail, esc, ensureSchema } from './lib.js';

export const HOLD_DAYS = 3, NOTICE_DAYS = 30;
export const money = c => '$' + (c / 100).toFixed(2);
export const toCents = v => { const n = Number(String(v ?? '').replace(/[$,]/g, '')); return Number.isFinite(n) && n >= 0 && n < 100000 ? Math.round(n * 100) : null; };

// ---- dates (all business rules use the Eastern date)
export const etDate = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const utcNoon = s => new Date(s + 'T12:00:00Z');
const fmt = d => d.toISOString().slice(0, 10);
export const addDays = (s, n) => fmt(new Date(utcNoon(s).getTime() + n * 864e5));
export const daysBetween = (a, b) => Math.round((utcNoon(b) - utcNoon(a)) / 864e5);
const nthWeekday = (y, m, wd, n) => { const d = new Date(Date.UTC(y, m, 1, 12)); d.setUTCDate(1 + ((wd - d.getUTCDay() + 7) % 7) + (n - 1) * 7); return fmt(d); };
const lastMonday = (y, m) => { const d = new Date(Date.UTC(y, m + 1, 0, 12)); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return fmt(d); };
export function holidays(y) {
  const fixed = [[0, 1], [5, 19], [6, 4], [10, 11], [11, 25]].map(([m, d]) => {
    const dt = new Date(Date.UTC(y, m, d, 12)), wd = dt.getUTCDay();
    if (wd === 6) dt.setUTCDate(d - 1); else if (wd === 0) dt.setUTCDate(d + 1);
    return fmt(dt);
  });
  return new Set([...fixed, nthWeekday(y, 0, 1, 3), nthWeekday(y, 1, 1, 3), lastMonday(y, 4), nthWeekday(y, 8, 1, 1), nthWeekday(y, 9, 1, 2), nthWeekday(y, 10, 4, 4)]);
}
export function addBusinessDays(s, n) {
  let cur = s;
  while (n > 0) {
    cur = addDays(cur, 1);
    const wd = utcNoon(cur).getUTCDay();
    if (wd !== 0 && wd !== 6 && !holidays(+cur.slice(0, 4)).has(cur) && !holidays(+cur.slice(0, 4) + 1).has(cur)) n--;
  }
  return cur;
}
const niceDate = s => new Date(s + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

const audit = (env, who, action, target, detail = '') => env.DB.prepare('INSERT INTO audit (at, who, action, target, detail) VALUES (?, ?, ?, ?, ?)').bind(new Date().toISOString(), who, action, target, detail).run();
export const label = (inv, ref) => inv.kind === 'origination' ? 'origination fee for your Inspection and Maintenance Agreement' : `septic visit on ${niceDate(ref || inv.created_date)}`;
async function refDate(env, inv) { if (inv.kind !== 'visit') return ''; const r = await env.DB.prepare('SELECT visit_date FROM reports WHERE id = ?').bind(inv.ref_id).first(); return r ? r.visit_date : ''; }
const payLink = (env, inv) => `${siteOrigin(env)}/pay/${inv.id}`;
const getCounty = async (env, name) => { const r = await env.DB.prepare('SELECT email FROM counties WHERE name = ?').bind(String(name || '').trim().toLowerCase()).first(); return r ? r.email : ''; };

// ---- invoices
export async function createInvoice(env, who, customer, kind, refId, cents, now = new Date()) {
  const iid = id(), date = etDate(now);
  await env.DB.prepare('INSERT INTO invoices (id, customer_id, kind, ref_id, amount_cents, created_at, created_date) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(iid, customer.id, kind, refId, cents, now.toISOString(), date).run();
  await audit(env, who, 'invoice-created', iid, `${customer.name} ${kind} ${money(cents)}`);
  const inv = { id: iid, kind, created_date: date, amount_cents: cents, ref_id: refId };
  const what = label(inv, await refDate(env, inv));
  const note = kind === 'origination' ? 'Your signed agreement will be available in your customer portal once payment has cleared.' : 'Your visit report will be available in your customer portal once payment has cleared.';
  const emailed = await sendMail(env, customer.email, `Invoice: ${money(cents)} for your septic ${kind === 'origination' ? 'agreement' : 'visit'}`, [`Hello ${customer.name},`, '', `Your invoice for the ${what} is ${money(cents)}.`, '', `Pay here: ${payLink(env, inv)}`, '', note, 'Payment is confirmed about three business days after you pay.', '', 'Overwatch Septic Systems'].join('\n'), env.MAIL_TO);
  return { id: iid, emailed };
}

// Stripe Checkout: a hosted payment page, so card details never reach this site.
export async function checkoutUrl(env, inv, customer) {
  if (!env.STRIPE_SECRET_KEY) return { error: 'Online payment is not set up yet. Please contact Overwatch Septic.' };
  const o = siteOrigin(env), body = new URLSearchParams({
    mode: 'payment', client_reference_id: inv.id, customer_email: customer.email, success_url: `${o}/pay/done/?ok=1`, cancel_url: `${o}/pay/done/?ok=0`,
    'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': 'usd', 'line_items[0][price_data][unit_amount]': String(inv.amount_cents),
    'line_items[0][price_data][product_data][name]': inv.kind === 'origination' ? 'Origination fee: Inspection and Maintenance Agreement' : 'Septic inspection and maintenance visit',
    'metadata[invoice_id]': inv.id, 'payment_intent_data[metadata][invoice_id]': inv.id,
  });
  try {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' }, body });
    const j = await r.json();
    if (!r.ok || !j.url) return { error: 'The payment page could not be opened. Please try again in a moment.' };
    await env.DB.prepare('UPDATE invoices SET stripe_session = ? WHERE id = ?').bind(j.id, inv.id).run();
    return { url: j.url };
  } catch { return { error: 'The payment page could not be opened. Please try again in a moment.' }; }
}
export async function payRedirect(request, env, invId) {
  const page = (t, m, s) => new Response(`<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(t)}</title><body style="font:17px/1.6 system-ui,sans-serif;max-width:520px;margin:40px auto;padding:0 20px"><h1>${esc(t)}</h1><p>${esc(m)}</p><p><a href="/login/">Customer sign-in</a></p>`, { status: s, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  if (!env.DB) return page('Unavailable', 'Please try again later.', 503);
  if (!/^[a-f0-9]{20}$/.test(invId)) return page('Invoice not found', 'This payment link is not valid.', 404);
  const inv = await env.DB.prepare('SELECT * FROM invoices WHERE id = ?').bind(invId).first();
  if (!inv) return page('Invoice not found', 'This payment link is not valid.', 404);
  if (inv.status !== 'open') return page(inv.status === 'waived' ? 'No payment needed' : 'Already paid', inv.status === 'waived' ? 'This fee was waived. Nothing is due.' : 'This invoice has been paid. Thank you.', 200);
  const c = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(inv.customer_id).first();
  const r = await checkoutUrl(env, inv, c);
  if (r.error) return page('Payment unavailable', r.error, 503);
  return new Response(null, { status: 303, headers: { location: r.url, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
}

// ---- Stripe webhook
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
export async function verifyStripe(raw, header, secret, nowSec = Math.floor(Date.now() / 1000)) {
  const parts = Object.fromEntries(String(header || '').split(',').map(p => p.split('=')).filter(p => p.length === 2));
  const sigs = String(header || '').split(',').filter(p => p.startsWith('v1=')).map(p => p.slice(3));
  if (!parts.t || !sigs.length || Math.abs(nowSec - Number(parts.t)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${parts.t}.${raw}`)));
  return sigs.some(s => s.length === mac.length && [...s].reduce((a, ch, i) => a | (ch.charCodeAt(0) ^ mac.charCodeAt(i)), 0) === 0);
}
export async function stripeWebhook(request, env, now = new Date()) {
  if (request.method !== 'POST') return reply({ ok: false, error: 'Method not allowed.' }, 405, { allow: 'POST' });
  if (!env.STRIPE_WEBHOOK_SECRET || !env.DB) return reply({ ok: false, error: 'Not configured.' }, 503);
  const raw = await request.text();
  if (!(await verifyStripe(raw, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET))) return reply({ ok: false, error: 'Bad signature.' }, 400);
  let ev; try { ev = JSON.parse(raw); } catch { return reply({ ok: false, error: 'Bad body.' }, 400); }
  const o = ev.data && ev.data.object || {};
  const byId = async iid => iid ? env.DB.prepare('SELECT * FROM invoices WHERE id = ?').bind(String(iid)).first() : null;
  const byPi = async pi => pi ? env.DB.prepare('SELECT * FROM invoices WHERE stripe_pi = ?').bind(String(pi)).first() : null;
  if (ev.type === 'checkout.session.completed' || ev.type === 'checkout.session.async_payment_succeeded') {
    const inv = await byId(o.client_reference_id || (o.metadata && o.metadata.invoice_id));
    if (inv) {
      if (o.payment_intent) await env.DB.prepare('UPDATE invoices SET stripe_pi = ? WHERE id = ?').bind(String(o.payment_intent), inv.id).run();
      if (o.payment_status === 'paid') await markPaid(env, { ...inv, stripe_pi: o.payment_intent || inv.stripe_pi }, 'stripe', now);
      else await env.DB.prepare("UPDATE invoices SET note = 'Bank payment started, not confirmed yet' WHERE id = ?").bind(inv.id).run();
    }
  } else if (ev.type === 'checkout.session.async_payment_failed') {
    const inv = await byId(o.client_reference_id);
    if (inv) { await env.DB.prepare("UPDATE invoices SET note = 'Bank payment failed' WHERE id = ?").bind(inv.id).run(); await alertOwner(env, 'Payment failed', `A bank payment for invoice ${inv.id} failed. The invoice is still open.`); }
  } else if (ev.type === 'charge.refunded' || ev.type === 'charge.dispute.created') {
    const inv = await byPi(o.payment_intent);
    if (inv) {
      const flag = ev.type === 'charge.refunded' ? 'refunded' : 'disputed';
      await env.DB.prepare("UPDATE invoices SET flag = ?, release_date = CASE WHEN released_at = '' THEN '' ELSE release_date END WHERE id = ?").bind(flag, inv.id).run();
      await audit(env, 'stripe', 'invoice-' + flag, inv.id);
      await alertOwner(env, `Payment ${flag}`, inv.released_at ? `A payment that was already released was ${flag}. Invoice ${inv.id}.` : `A payment was ${flag} during the hold, so the release is stopped. Open the admin portal to decide. Invoice ${inv.id}.`);
    }
  }
  return reply({ ok: true });
}
const alertOwner = (env, subject, text) => sendMail(env, env.MAIL_TO, '[Overwatch] ' + subject, text + `\n\n${siteOrigin(env)}/admin/`);

export async function markPaid(env, inv, who, now = new Date()) {
  if (inv.status !== 'open') return false;
  const nowIso = now.toISOString(), rel = addBusinessDays(etDate(now), HOLD_DAYS);
  const r = await env.DB.prepare("UPDATE invoices SET status = 'paid', paid_at = ?, release_date = ?, flag = '', note = '' WHERE id = ? AND status = 'open'").bind(nowIso, rel, inv.id).run();
  if (!r.meta || r.meta.changes !== 1) return false;
  await audit(env, who, 'invoice-paid', inv.id, money(inv.amount_cents));
  const c = await env.DB.prepare('SELECT name, email FROM customers WHERE id = ?').bind(inv.customer_id).first();
  const what = label(inv, await refDate(env, inv));
  await sendMail(env, c.email, 'Payment received. Thank you', [`Hello ${c.name},`, '', `We received your payment of ${money(inv.amount_cents)} for the ${what}.`, `It is released after the payment has cleared, on ${niceDate(rel)}. We will email you when it is available in your customer portal.`, '', 'Overwatch Septic Systems'].join('\n'), env.MAIL_TO);
  if (inv.notice_state === 'sent' || inv.notice_state === 'final_drafted' || inv.notice_state === 'drafted') await alertOwner(env, 'Paid after notice', `${c.name} paid ${money(inv.amount_cents)} after the unpaid sequence reached "${inv.notice_state}". If a notice already went to the county, you may want to tell them the agreement continues.`);
  return true;
}

// ---- release: unlock the item for the customer, and send the county its copy
export async function releaseInvoice(env, inv, who, now = new Date()) {
  const nowIso = now.toISOString();
  const r = await env.DB.prepare("UPDATE invoices SET released_at = ? WHERE id = ? AND released_at = ''").bind(nowIso, inv.id).run();
  if (!r.meta || r.meta.changes !== 1) return false;
  await audit(env, who, 'released', inv.id, inv.kind);
  const c = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(inv.customer_id).first();
  if (inv.kind === 'origination') {
    await sendMail(env, c.email, 'Your signed agreement is available', [`Hello ${c.name},`, '', 'Your fully signed Inspection and Maintenance Agreement is now available. Sign in to your customer portal to read and download it:', '', `${siteOrigin(env)}/login/`, '', 'Overwatch Septic Systems'].join('\n'), env.MAIL_TO);
  } else await releaseReport(env, inv.ref_id, c, nowIso);
  return true;
}
export async function releaseReport(env, reportId, customer, nowIso = new Date().toISOString()) {
  await env.DB.prepare("INSERT INTO report_state (report_id, released_at) VALUES (?, ?) ON CONFLICT(report_id) DO UPDATE SET released_at = excluded.released_at").bind(reportId, nowIso).run();
  const rep = await env.DB.prepare('SELECT visit_date FROM reports WHERE id = ?').bind(reportId).first();
  if (!rep) return;
  await sendMail(env, customer.email, 'Your septic visit report is ready', [`Hello ${customer.name},`, '', `The report from your visit on ${rep.visit_date} is ready. Sign in to your customer portal to see it: ${siteOrigin(env)}/login/`, '', 'Overwatch Septic Systems'].join('\n'), env.MAIL_TO);
  await sendCountyReport(env, reportId, customer);
}
export async function sendCountyReport(env, reportId, customer) {
  const to = await getCounty(env, customer.county);
  if (!to) { await alertOwner(env, 'County email missing', `The report for ${customer.name} was released, but there is no email saved for ${customer.county || 'their county'} County, so the county copy was not sent. Add it under Counties in the admin portal and press "Send county copy" on the report.`); return false; }
  const rep = await env.DB.prepare('SELECT visit_date FROM reports WHERE id = ?').bind(reportId).first();
  const token = rand(24), exp = new Date(Date.now() + 90 * 864e5).toISOString();
  await env.DB.prepare("INSERT INTO report_state (report_id, token_hash, token_exp) VALUES (?, ?, ?) ON CONFLICT(report_id) DO UPDATE SET token_hash = excluded.token_hash, token_exp = excluded.token_exp").bind(reportId, await sha(token), exp).run();
  const ok = await sendMail(env, to, `Septic inspection report: ${customer.address}`, [`${customer.county} County Environmental Health,`, '', `Overwatch Septic Systems submits the inspection report for the system at ${customer.address}${customer.permit ? ' (Permit ' + customer.permit + ')' : ''}, Owner ${customer.name}, visit date ${rep.visit_date}.`, '', `View the report (link valid 90 days): ${siteOrigin(env)}/r/${token}`, '', 'Reply to this email with any questions.', '', 'Overwatch Septic Systems'].join('\n'), env.MAIL_TO);
  if (ok) await env.DB.prepare('UPDATE report_state SET county_sent_at = ?, county_to = ? WHERE report_id = ?').bind(new Date().toISOString(), to, reportId).run();
  return ok;
}
// The county's page: a plain read-only report.
export async function countyReportPage(request, env, token, wantPdf) {
  const bad = new Response('This link is not valid or has expired.', { status: 404, headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } });
  if (!env.DB || !/^[A-Za-z0-9_-]{20,60}$/.test(token)) return bad;
  const st = await env.DB.prepare('SELECT report_id, token_exp FROM report_state WHERE token_hash = ?').bind(await sha(token)).first();
  if (!st || st.token_exp < new Date().toISOString()) return bad;
  const r = await env.DB.prepare('SELECT * FROM reports WHERE id = ?').bind(st.report_id).first();
  const c = r && await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(r.customer_id).first();
  if (!r) return bad;
  if (wantPdf) {
    const obj = r.pdf_key && env.FILES ? await env.FILES.get(r.pdf_key) : null;
    return obj ? new Response(await obj.arrayBuffer(), { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="inspection-${r.visit_date}.pdf"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } }) : bad;
  }
  const rd = JSON.parse(r.readings), ck = JSON.parse(r.checks), L = { pump_min: 'Pump run time (minutes per cycle)', sludge_in: 'Sludge depth (inches in tank)', water_gpd: 'Water use (gallons per day)' }, S = { pass: 'Pass', repair: 'Needs repair (by a licensed contractor)', na: 'Not applicable' };
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Septic inspection report</title><style>body{font:16px/1.55 Georgia,serif;max-width:640px;margin:30px auto;padding:0 18px;color:#111}h1{font-size:24px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ccc;padding:6px;text-align:left}small{color:#555}</style></head><body><h1>Septic inspection report</h1><p>Overwatch Septic Systems<br>Owner: ${esc(c.name)}<br>Property: ${esc(c.address)}${c.permit ? '<br>Permit: ' + esc(c.permit) : ''}${c.sys_type ? '<br>System: Type ' + esc(c.sys_type) : ''}<br>Visit date: ${esc(r.visit_date)}</p><h2>Readings</h2><table>${Object.keys(rd).map(k => `<tr><td>${esc(L[k] || k)}</td><td>${esc(rd[k])}</td></tr>`).join('') || '<tr><td>None recorded</td></tr>'}</table><h2>Checks</h2><table>${ck.map(x => `<tr><td>${esc(x.label)}</td><td>${esc(S[x.status])}</td></tr>`).join('') || '<tr><td>None recorded</td></tr>'}</table>${r.notes ? `<h2>Notes</h2><p>${esc(r.notes)}</p>` : ''}${r.pdf_key ? `<p><a href="/r/${esc(token)}/pdf">Open the full report (PDF)</a></p>` : ''}<p><small>Repairs and pumping are performed by licensed contractors.</small></p></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex, nofollow', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'" } });
}

// ---- locks: what the customer may see
export const contractLocked = async (env, contractId) => !!(await env.DB.prepare("SELECT 1 AS x FROM invoices WHERE kind = 'origination' AND ref_id = ? AND released_at = ''").bind(contractId).first());
export const reportLocked = async (env, reportId) => { const s = await env.DB.prepare('SELECT released_at FROM report_state WHERE report_id = ?').bind(reportId).first(); return !!(s && !s.released_at); };

// ---- the unpaid notices (drafts need the owner's OK before anything reaches the owner or the county)
export async function noticeDrafts(env, inv, kind, now = new Date()) {
  const c = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(inv.customer_id).first();
  const what = label(inv, await refDate(env, inv)), amt = money(inv.amount_cents);
  const today = etDate(now), term = kind === 'notice' ? addDays(today, NOTICE_DAYS) : inv.term_date;
  const sig = '\nOverwatch Septic Systems';
  if (kind === 'notice') return {
    term, customer: c,
    owner: { subject: `Notice of intent to terminate your agreement on ${niceDate(term)}`, body: `Hello ${c.name},\n\nWe have not received payment of ${amt} for the ${what} within thirty (30) days of billing. Under paragraph 3(d)(1) of your Inspection and Maintenance Agreement, this is cause for termination.\n\nThis is written notice that Overwatch Septic Systems intends to terminate the agreement on ${niceDate(term)}, thirty (30) days from the date of this notice. A copy is being sent to ${c.county} County Environmental Health. If payment is received before that date, the agreement continues in effect.\n\nPay here: ${siteOrigin(env)}/pay/${inv.id}\n${sig}` },
    county: { subject: `Notice of intent to terminate agreement, ${c.address}`, body: `${c.county} County Environmental Health,\n\nOverwatch Septic Systems gives notice under paragraph 3(d)(1) of the Inspection and Maintenance Agreement that it intends to terminate the agreement for the system at ${c.address}${c.permit ? ' (Permit ' + c.permit + ')' : ''}, Owner ${c.name}, effective ${niceDate(term)}, for nonpayment. The owner was sent written notice on ${niceDate(today)}. A final notice will follow if the agreement ends.\n${sig}` },
  };
  return {
    term, customer: c,
    owner: { subject: 'Your septic agreement has ended', body: `Hello ${c.name},\n\nWe did not receive payment of ${amt} for the ${what} by ${niceDate(term)}, the date given in our notice. Your Inspection and Maintenance Agreement with Overwatch Septic Systems has ended.\n\nYour system at ${c.address} no longer has an operation and maintenance contract with us. Please arrange a new management entity with ${c.county} County Environmental Health.\n${sig}` },
    county: { subject: `Agreement ended for nonpayment, ${c.address}`, body: `${c.county} County Environmental Health,\n\nThe Inspection and Maintenance Agreement between Overwatch Septic Systems and ${c.name} for the system at ${c.address}${c.permit ? ' (Permit ' + c.permit + ')' : ''} ended on ${niceDate(term)} after written notice of intent to terminate for nonpayment. The system is now without an operation and maintenance contract with us.\n${sig}` },
  };
}
export async function sendNotice(env, who, invId, kind, tracking, now = new Date()) {
  const inv = await env.DB.prepare('SELECT * FROM invoices WHERE id = ?').bind(invId).first();
  if (!inv) return { status: 404, error: 'Not found.' };
  const want = kind === 'notice' ? 'drafted' : 'final_drafted';
  if (inv.status !== 'open' || inv.notice_state !== want) return { status: 400, error: 'This notice is not ready to send.' };
  const d = await noticeDrafts(env, inv, kind, now), to = await getCounty(env, d.customer.county);
  if (!to) return { status: 400, error: `Add an email for ${d.customer.county || 'this'} County under Counties first. The county must be told.` };
  const o = await sendMail(env, d.customer.email, d.owner.subject, d.owner.body, env.MAIL_TO), k = await sendMail(env, to, d.county.subject, d.county.body, env.MAIL_TO);
  if (!o || !k) return { status: 502, error: 'An email could not be sent. Nothing was recorded. Try again.' };
  const nowIso = now.toISOString(), today = etDate(now);
  if (kind === 'notice') await env.DB.prepare("UPDATE invoices SET notice_state = 'sent', notice_sent_at = ?, term_date = ?, tracking = ?, last_reminder_date = ? WHERE id = ?").bind(nowIso, d.term, clean(tracking, 80), today, inv.id).run();
  else {
    await env.DB.batch([env.DB.prepare("UPDATE invoices SET notice_state = 'final_sent' WHERE id = ?").bind(inv.id), env.DB.prepare("UPDATE contracts SET status = 'terminated' WHERE customer_id = ? AND status = 'complete'").bind(inv.customer_id)]);
  }
  await audit(env, who, kind === 'notice' ? 'notice-sent' : 'final-sent', inv.id, d.customer.name);
  return { ok: true };
}

// ---- daily automation (cron). `now` is injectable so tests can move the clock.
export async function runDaily(env, now = new Date()) {
  const today = etDate(now); let acted = 0;
  await ensureSchema(env);
  // 1. release what has cleared
  const due = (await env.DB.prepare("SELECT * FROM invoices WHERE status = 'paid' AND released_at = '' AND flag = '' AND release_date != '' AND release_date <= ?").bind(today).all()).results;
  for (const inv of due) if (await releaseInvoice(env, inv, 'automatic', now)) acted++;
  // 2. the unpaid sequence
  const open = (await env.DB.prepare("SELECT * FROM invoices WHERE status = 'open' AND paused = 0").all()).results;
  for (const inv of open) {
    const age = daysBetween(inv.created_date, today), c = await env.DB.prepare('SELECT name, email FROM customers WHERE id = ?').bind(inv.customer_id).first();
    if (!c) continue;
    const what = label(inv, await refDate(env, inv)), link = payLink(env, inv), amt = money(inv.amount_cents);
    const remind = async (subject, lines, set) => { await sendMail(env, c.email, subject, [`Hello ${c.name},`, '', ...lines, '', `Pay here: ${link}`, '', 'If you already paid, or have a question, reply to this email.', '', 'Overwatch Septic Systems'].join('\n'), env.MAIL_TO); await env.DB.prepare(`UPDATE invoices SET ${set}, last_reminder_date = ? WHERE id = ?`).bind(today, inv.id).run(); acted++; };
    if (inv.notice_state === 'none') {
      if (age >= 30) { await env.DB.prepare("UPDATE invoices SET notice_state = 'drafted' WHERE id = ?").bind(inv.id).run(); await alertOwner(env, 'Notice ready for your OK', `${c.name}'s ${amt} invoice is unpaid 30 days. The notice of intent to terminate is drafted for the owner and the county. Review and send it in the admin portal. Your agreement requires written notice by certified mail, so print the letter and mail it too.`); acted++; }
      else if (age >= 15 && !inv.d15_sent) await remind(`Your invoice is due on ${niceDate(addDays(inv.created_date, 30))}`, [`Your invoice of ${amt} for the ${what} has not been paid. If it is still unpaid thirty days after billing, on ${niceDate(addDays(inv.created_date, 30))}, we will send a written notice that your agreement may be terminated, with a copy to your county health department.`], 'd15_sent = 1');
      else if (age >= 1 && age <= 7 && inv.last_reminder_date !== today && inv.reminders < 7) await remind(`Reminder: your septic invoice (${amt})`, [`Your invoice of ${amt} for the ${what} has not been paid yet.`, inv.kind === 'origination' ? 'Your signed agreement is available after payment clears.' : 'Your visit report is available after payment clears.'], 'reminders = reminders + 1');
    } else if (inv.notice_state === 'sent') {
      if (inv.term_date && today >= inv.term_date) { await env.DB.prepare("UPDATE invoices SET notice_state = 'final_drafted' WHERE id = ?").bind(inv.id).run(); await alertOwner(env, 'Final notice ready for your OK', `${c.name}'s agreement reaches its termination date (${niceDate(inv.term_date)}) unpaid. Review and send the final notice in the admin portal. Sending it cancels the agreement and tells the county.`); acted++; }
      else if (inv.last_reminder_date !== today && daysBetween(inv.last_reminder_date || inv.notice_sent_at.slice(0, 10), today) >= 7) await remind(`Reminder: agreement ends ${niceDate(inv.term_date)}`, [`Your invoice of ${amt} for the ${what} is still unpaid. Your agreement will end on ${niceDate(inv.term_date)} unless we receive payment before then.`], 'reminders = reminders');
    }
  }
  return acted;
}
