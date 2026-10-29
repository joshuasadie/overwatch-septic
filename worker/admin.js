// Admin API (Cloudflare Access protected): customers, contracts, reports.
import { reply, clean, id, EMAIL, siteOrigin, sendMail, readJson, originOk, verifyAccess, ensureSchema } from './lib.js';
import { createInvoice, markPaid, releaseInvoice, releaseReport, sendCountyReport, sendNotice, noticeDrafts, toCents, etDate, daysBetween } from './billing.js';
import { operatorOf, systemInfo, createInspection, saveSystem, attachInspections, uploadPhoto, servePhoto, deleteInspectionFiles } from './inspection.js';
import { createContract, resendContract, voidContract, countersign, publicView } from './contracts.js';

export const READINGS = { pump_min: 'Pump run time (minutes per cycle)', sludge_in: 'Sludge depth (inches in tank)', water_gpd: 'Water use (gallons per day)' };
const CHECK_STATUS = ['pass', 'repair', 'na'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PDF_MAX = 6 * 1024 * 1024;
const num = v => { const n = Number(String(v).replace(/,/g, '')); return v !== '' && v !== null && v !== undefined && Number.isFinite(n) && n >= 0 && n < 1e6 ? n : null; };

function customerFields(b) {
  const f = { name: clean(b.name, 100), email: clean(b.email, 254).toLowerCase(), phone: clean(b.phone, 30), address: clean(b.address, 200), county: clean(b.county, 40), sys_type: clean(b.sys_type, 20), permit: clean(b.permit, 40), notes: clean(b.notes, 1000) };
  if (!f.name) return { error: 'Please enter a name.' };
  if (!EMAIL.test(f.email)) return { error: 'Please enter a valid email address.' };
  if (f.address.length < 5) return { error: 'Please enter the property address.' };
  return { f };
}
const audit = (env, who, action, target, detail = '') => env.DB.prepare('INSERT INTO audit (at, who, action, target, detail) VALUES (?, ?, ?, ?, ?)').bind(new Date().toISOString(), who, action, target, detail);
const out = r => r.error ? reply({ ok: false, error: r.error }, r.status || 400) : reply(r);


async function invoiceRows(env, where, bind) {
  const rows = (await env.DB.prepare(`SELECT i.*, c.name AS customer_name, c.county AS customer_county, r.visit_date AS visit_date FROM invoices i JOIN customers c ON c.id = i.customer_id LEFT JOIN reports r ON (i.kind = 'visit' AND r.id = i.ref_id) WHERE ${where} ORDER BY i.created_at DESC`).bind(...bind).all()).results;
  const today = etDate();
  return rows.map(i => ({ id: i.id, customer_id: i.customer_id, customer_name: i.customer_name, county: i.customer_county, kind: i.kind, ref_id: i.ref_id, visit_date: i.visit_date || '', amount_cents: i.amount_cents, status: i.status, flag: i.flag, paused: !!i.paused, created_date: i.created_date, age: daysBetween(i.created_date, today), release_date: i.release_date, released: !!i.released_at, notice_state: i.notice_state, term_date: i.term_date, tracking: i.tracking, note: i.note, reminders: i.reminders }));
}

export const CONTACT_KINDS = ['Installer', 'County', 'Realtor', 'Builder', 'Inspector', 'Referral', 'Lead', 'Customer', 'Other'];
function cleanContact(b) {
  const c = { name: clean(b.name, 100), company: clean(b.company, 120), kind: CONTACT_KINDS.includes(b.kind) ? b.kind : 'Other', county: clean(b.county, 40), phone: clean(b.phone, 40), email: clean(b.email, 254), next_step: clean(b.next_step, 200), next_date: /^\d{4}-\d{2}-\d{2}$/.test(b.next_date || '') ? b.next_date : '', notes: clean(b.notes, 2000), customer_id: clean(b.customer_id, 40) };
  if (!c.name) return { error: 'Enter a name.' };
  if (c.email && !EMAIL.test(c.email)) return { error: 'That email address does not look right.' };
  return c;
}
const savePrefs = (env, cid, b) => b.repair_prefs === undefined ? null : env.DB.prepare('INSERT INTO contact_extra (contact_id, repair_prefs) VALUES (?, ?) ON CONFLICT(contact_id) DO UPDATE SET repair_prefs = excluded.repair_prefs').bind(cid, clean(b.repair_prefs, 2000)).run();
const setTest = (env, cid, on) => on ? env.DB.prepare('INSERT OR IGNORE INTO test_customers (customer_id) VALUES (?)').bind(cid).run() : env.DB.prepare('DELETE FROM test_customers WHERE customer_id = ?').bind(cid).run();
export async function adminApi(request, env, path) {
  const who = await verifyAccess(request, env);
  if (who === 'unconfigured') return reply({ ok: false, error: 'The admin area is not set up yet.' }, 503);
  if (who.fail) return reply({ ok: false, error: 'Not signed in.', reason: who.fail }, 401);
  if (!env.DB) return reply({ ok: false, error: 'The database is not connected.' }, 503);
  try { await ensureSchema(env); } catch { return reply({ ok: false, error: 'Database error.' }, 500); }
  const email = who.email, method = request.method;
  if (method !== 'GET' && !originOk(request, env)) return reply({ ok: false, error: 'Request not allowed.' }, 403);

  // raw PDF upload for a report
  let m = /^\/admin\/api\/reports\/([a-f0-9]{20})\/pdf$/.exec(path);
  if (m && method === 'POST') {
    if (!env.FILES) return reply({ ok: false, error: 'File storage is not connected.' }, 503);
    if (!(request.headers.get('content-type') || '').includes('application/pdf')) return reply({ ok: false, error: 'Please upload a PDF.' }, 415);
    const rep = await env.DB.prepare('SELECT id FROM reports WHERE id = ?').bind(m[1]).first();
    if (!rep) return reply({ ok: false, error: 'Not found.' }, 404);
    const buf = await request.arrayBuffer();
    if (buf.byteLength < 100 || buf.byteLength > PDF_MAX) return reply({ ok: false, error: 'The PDF must be under 6 MB.' }, 413);
    if (new TextDecoder().decode(buf.slice(0, 5)) !== '%PDF-') return reply({ ok: false, error: 'That file is not a PDF.' }, 400);
    await env.FILES.put(`reports/${rep.id}.pdf`, buf, { httpMetadata: { contentType: 'application/pdf' } });
    await env.DB.prepare('UPDATE reports SET pdf_key = ? WHERE id = ?').bind(`reports/${rep.id}.pdf`, rep.id).run();
    return reply({ ok: true });
  }
  if (m && method === 'GET') {
    const rep = await env.DB.prepare('SELECT pdf_key, visit_date FROM reports WHERE id = ?').bind(m[1]).first();
    const obj = rep && rep.pdf_key && env.FILES ? await env.FILES.get(rep.pdf_key) : null;
    if (!obj) return reply({ ok: false, error: 'No PDF for this report.' }, 404);
    return new Response(await obj.arrayBuffer(), { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="report-${rep.visit_date}.pdf"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
  }

  if (path === '/admin/api/config' && method === 'GET') return reply({ ok: true, me: email, operator: operatorOf(env), readings: READINGS, stripe: !!(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET), defaults: (env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET) ? { origination: '100', visit: '250' } : { origination: '0', visit: '0' } });
  if (path === '/admin/api/customers' && method === 'GET') {
    const rows = (await env.DB.prepare('SELECT * FROM customers ORDER BY name COLLATE NOCASE').all()).results;
    const cs = (await env.DB.prepare('SELECT customer_id, status, created_at FROM contracts WHERE status != ? ORDER BY created_at').bind('void').all()).results;
    const rs = (await env.DB.prepare('SELECT customer_id, MAX(visit_date) AS last FROM reports GROUP BY customer_id').all()).results;
    const tests = new Set((await env.DB.prepare('SELECT customer_id FROM test_customers').all()).results.map(r => r.customer_id));
    const lastC = new Map(cs.map(c => [c.customer_id, c.status])), lastR = new Map(rs.map(r => [r.customer_id, r.last]));
    return reply({ ok: true, customers: rows.map(r => ({ ...r, test: tests.has(r.id), contract: lastC.get(r.id) || 'none', last_report: lastR.get(r.id) || '' })) });
  }
  if (path === '/admin/api/customer' && method === 'POST') {
    const j = await readJson(request); if (j.res) return j.res;
    const { f, error } = customerFields(j.body); if (error) return reply({ ok: false, error }, 400);
    const existing = await env.DB.prepare('SELECT id FROM customers WHERE email = ?').bind(f.email).first();
    if (j.body.id) {
      const cur = await env.DB.prepare('SELECT id FROM customers WHERE id = ?').bind(String(j.body.id)).first();
      if (!cur) return reply({ ok: false, error: 'Not found.' }, 404);
      if (existing && existing.id !== cur.id) return reply({ ok: false, error: 'Another customer already has that email.' }, 409);
      await env.DB.batch([env.DB.prepare('UPDATE customers SET name=?, email=?, phone=?, address=?, county=?, sys_type=?, permit=?, notes=? WHERE id=?').bind(f.name, f.email, f.phone, f.address, f.county, f.sys_type, f.permit, f.notes, cur.id), audit(env, email, 'customer-updated', cur.id, f.name)]);
      if (j.body.test !== undefined) await setTest(env, cur.id, !!j.body.test);
      return reply({ ok: true, id: cur.id });
    }
    if (existing) return reply({ ok: false, error: 'A customer with that email already exists.' }, 409);
    const cid = id();
    await env.DB.batch([env.DB.prepare('INSERT INTO customers (id, created_at, name, email, phone, address, county, sys_type, permit, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(cid, new Date().toISOString(), f.name, f.email, f.phone, f.address, f.county, f.sys_type, f.permit, f.notes), audit(env, email, 'customer-added', cid, f.name)]);
    if (j.body.test) await setTest(env, cid, true);
    return reply({ ok: true, id: cid });
  }
  m = /^\/admin\/api\/customer\/([a-f0-9]{20})$/.exec(path);
  if (m && method === 'GET') {
    const c = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(m[1]).first();
    if (!c) return reply({ ok: false, error: 'Not found.' }, 404);
    c.test = !!(await env.DB.prepare('SELECT 1 AS x FROM test_customers WHERE customer_id = ?').bind(c.id).first());
    const contracts = (await env.DB.prepare('SELECT * FROM contracts WHERE customer_id = ? ORDER BY created_at DESC').bind(c.id).all()).results.map(x => ({ ...publicView(x, c), terms: JSON.parse(x.terms) }));
    const reports = (await env.DB.prepare('SELECT id, visit_date, kind, readings, checks, notes, pdf_key, created_at FROM reports WHERE customer_id = ? ORDER BY visit_date DESC').bind(c.id).all()).results.map(r => ({ ...r, readings: JSON.parse(r.readings), checks: JSON.parse(r.checks), has_pdf: !!r.pdf_key, pdf_key: undefined }));
    const states = new Map((await env.DB.prepare('SELECT report_id, released_at, county_sent_at, county_to FROM report_state WHERE report_id IN (SELECT id FROM reports WHERE customer_id = ?)').bind(c.id).all()).results.map(x => [x.report_id, x]));
    for (const r of reports) { const st = states.get(r.id); r.state = st ? (st.released_at ? 'released' : 'held') : 'released'; r.county_sent_at = st ? st.county_sent_at : ''; r.sent_owner = st && st.released_at ? st.released_at : ''; r.county_to = st ? st.county_to : ''; }
    await attachInspections(env, reports, false);
    let installer = null;
    { const sr = await env.DB.prepare('SELECT data FROM systems WHERE customer_id = ?').bind(c.id).first(); let si = null; try { si = sr && JSON.parse(sr.data).installer; } catch { si = null; }
      if (si && (si.id || si.name)) {
        const k = si.id ? await env.DB.prepare('SELECT c.*, x.repair_prefs FROM contacts c LEFT JOIN contact_extra x ON x.contact_id = c.id WHERE c.id = ?').bind(si.id).first() : null;
        installer = { id: si.id || '', name: k ? k.name : si.name, company: k ? k.company : '', phone: k ? k.phone : '', email: k ? k.email : '', repair_prefs: k ? (k.repair_prefs || '') : '', date: si.date || '' };
      } }
    return reply({ ok: true, customer: c, installer, contracts, reports, invoices: await invoiceRows(env, 'i.customer_id = ?', [c.id]) });
  }
  if (path === '/admin/api/customer-delete' && method === 'POST') {
    const j = await readJson(request); if (j.res) return j.res;
    const cid = String(j.body.id || '');
    const c = await env.DB.prepare('SELECT name FROM customers WHERE id = ?').bind(cid).first();
    if (!c) return reply({ ok: false, error: 'Not found.' }, 404);
    const signed = await env.DB.prepare("SELECT COUNT(*) AS n FROM contracts WHERE customer_id = ? AND status IN ('owner_signed','complete')").bind(cid).first();
    const isTest = !!(await env.DB.prepare('SELECT 1 AS x FROM test_customers WHERE customer_id = ?').bind(cid).first());
    if (signed.n && isTest && String(j.body.confirm || '').trim().toLowerCase() !== c.name.trim().toLowerCase()) return reply({ ok: false, error: 'Type the customer\'s name exactly to delete a test customer with a signed agreement.' }, 400);
    if (signed.n && !isTest) return reply({ ok: false, error: 'This customer has a signed agreement. Signed agreements are kept as records, so the customer cannot be deleted here. Only customers marked as test customers can be deleted.' }, 400);
    const reps = (await env.DB.prepare('SELECT pdf_key FROM reports WHERE customer_id = ?').bind(cid).all()).results;
    if (env.FILES) for (const r of reps) if (r.pdf_key) await env.FILES.delete(r.pdf_key);
    await deleteInspectionFiles(env, (await env.DB.prepare('SELECT id FROM reports WHERE customer_id = ?').bind(cid).all()).results.map(x => x.id));
    await env.DB.batch([env.DB.prepare('DELETE FROM inspections WHERE report_id IN (SELECT id FROM reports WHERE customer_id = ?)').bind(cid), env.DB.prepare('DELETE FROM systems WHERE customer_id = ?').bind(cid), env.DB.prepare('DELETE FROM report_state WHERE report_id IN (SELECT id FROM reports WHERE customer_id = ?)').bind(cid), env.DB.prepare('DELETE FROM invoices WHERE customer_id = ?').bind(cid), env.DB.prepare('DELETE FROM reports WHERE customer_id = ?').bind(cid), env.DB.prepare('DELETE FROM contracts WHERE customer_id = ?').bind(cid), env.DB.prepare('DELETE FROM sessions WHERE customer_id = ?').bind(cid), env.DB.prepare('DELETE FROM login_tokens WHERE customer_id = ?').bind(cid), env.DB.prepare('DELETE FROM test_customers WHERE customer_id = ?').bind(cid), env.DB.prepare('DELETE FROM customers WHERE id = ?').bind(cid), audit(env, email, isTest ? 'test-customer-deleted' : 'customer-deleted', cid, c.name)]);
    return reply({ ok: true });
  }

  if (path === '/admin/api/contract' && method === 'POST') {
    const j = await readJson(request, 32768); if (j.res) return j.res;
    const c = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(String(j.body.customer_id || '')).first();
    if (!c) return reply({ ok: false, error: 'Not found.' }, 404);
    return out(await createContract(env, email, c, j.body.terms));
  }
  if (method === 'POST' && ['contract-resend', 'contract-void', 'contract-sign'].includes(path.split('/').pop())) {
    const j = await readJson(request); if (j.res) return j.res;
    const cid = String(j.body.id || '');
    if (path.endsWith('contract-resend')) return out(await resendContract(env, email, cid));
    if (path.endsWith('contract-void')) return out(await voidContract(env, email, cid));
    return out(await countersign(env, email, cid, j.body.name));
  }

  if (path === '/admin/api/system' && method === 'GET') {
    const sp = new URL(request.url).searchParams, cid = sp.get('customer_id') || '';
    if (!(await env.DB.prepare('SELECT 1 AS x FROM customers WHERE id = ?').bind(cid).first())) return reply({ ok: false, error: 'Not found.' }, 404);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.get('date') || '') ? sp.get('date') : etDate();
    return reply({ ok: true, ...(await systemInfo(env, cid, date)) });
  }
  if (path === '/admin/api/units' && method === 'GET') {
    // pump and filter names already used at any site, offered as suggestions so spellings stay the same
    const pump = new Set(), filter = new Set();
    for (const r of (await env.DB.prepare('SELECT data FROM systems').all()).results) {
      let s = {}; try { s = JSON.parse(r.data); } catch {}
      for (const u of [s.pump_unit, ...(s.tanks || []).filter(t => t.kind === 'pump').map(t => t.unit)]) if (u) pump.add(u);
      for (const u of [s.septic_unit, ...(s.tanks || []).filter(t => t.kind !== 'pump').map(t => t.unit)]) if (u) filter.add(u);
    }
    return reply({ ok: true, pump: [...pump].sort(), filter: [...filter].sort() });
  }
  if (path === '/admin/api/system' && method === 'POST') {
    const j = await readJson(request, 65536); if (j.res) return j.res;
    const c = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(String(j.body.customer_id || '')).first();
    if (!c) return reply({ ok: false, error: 'Not found.' }, 404);
    const sb = j.body.system || {}, ins = sb.installer || {};
    const iname = clean(ins.name, 120);
    if (iname && !clean(ins.id, 40)) {
      const hit = await env.DB.prepare("SELECT id FROM contacts WHERE kind = 'Installer' AND (lower(name) = lower(?) OR lower(company) = lower(?))").bind(iname, iname).first();
      if (hit) ins.id = hit.id;
      else { ins.id = id(); const now = new Date().toISOString(); await env.DB.prepare("INSERT INTO contacts (id, name, company, kind, county, phone, email, next_step, next_date, notes, customer_id, created_at, updated_at) VALUES (?, ?, '', 'Installer', ?, '', '', '', '', ?, '', ?, ?)").bind(ins.id, iname, c.county || '', 'Added from System setup for ' + c.name, now, now).run(); }
      sb.installer = ins;
    }
    return out(await saveSystem(env, email, c, sb));
  }
  if (path === '/admin/api/inspection' && method === 'POST') {
    const j = await readJson(request, 65536); if (j.res) return j.res;
    const c = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(String(j.body.customer_id || '')).first();
    if (!c) return reply({ ok: false, error: 'Not found.' }, 404);
    return out(await createInspection(env, email, c, j.body));
  }
  m = /^\/admin\/api\/reports\/([a-f0-9]{20})\/photo(?:\/(\d{1,2}))?$/.exec(path);
  if (m && method === 'POST' && !m[2]) return out(await uploadPhoto(env, request, m[1]));
  if (m && method === 'GET' && m[2]) return servePhoto(env, m[1], Number(m[2]));
  if (path === '/admin/api/report' && method === 'POST') {
    const j = await readJson(request, 32768); if (j.res) return j.res;
    const b = j.body, c = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(String(b.customer_id || '')).first();
    if (!c) return reply({ ok: false, error: 'Not found.' }, 404);
    if (!DATE.test(String(b.visit_date || ''))) return reply({ ok: false, error: 'Please choose the visit date.' }, 400);
    const kind = b.kind === 'upload' ? 'upload' : 'form';
    const readings = {};
    for (const k of Object.keys(READINGS)) { const n = num(b.readings && b.readings[k]); if (n !== null) readings[k] = n; }
    const checks = (Array.isArray(b.checks) ? b.checks : []).slice(0, 30).map(x => ({ label: clean(x && x.label, 80), status: CHECK_STATUS.includes(x && x.status) ? x.status : 'na' })).filter(x => x.label);
    const rid = id();
    await env.DB.batch([env.DB.prepare('INSERT INTO reports (id, customer_id, visit_date, kind, readings, checks, notes, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(rid, c.id, b.visit_date, kind, JSON.stringify(readings), JSON.stringify(checks), clean(b.notes, 2000), new Date().toISOString(), email), audit(env, email, 'report-added', rid, c.name), env.DB.prepare("INSERT INTO report_state (report_id, released_at) VALUES (?, '')").bind(rid)]);
    return reply({ ok: true, id: rid });
  }
  if (path === '/admin/api/report-notify' && method === 'POST') {
    const j = await readJson(request); if (j.res) return j.res;
    const r = await env.DB.prepare('SELECT customer_id, visit_date, pdf_key FROM reports WHERE id = ?').bind(String(j.body.id || '')).first();
    if (!r) return reply({ ok: false, error: 'Not found.' }, 404);
    const lock = await env.DB.prepare("SELECT released_at FROM report_state WHERE report_id = ?").bind(String(j.body.id)).first();
    if (lock && !lock.released_at) return reply({ ok: false, error: 'This report is still held until payment clears or you waive the fee.' }, 400);
    const c = await env.DB.prepare('SELECT name, email FROM customers WHERE id = ?').bind(r.customer_id).first();
    const sent = await sendMail(env, c.email, 'Your septic visit report is ready', [`Hello ${c.name},`, '', `The report from your visit on ${r.visit_date} is ready. Sign in to your customer portal to see it: ${siteOrigin(env)}/login/`, '', 'Overwatch Septic, LLC'].join('\n'), env.MAIL_TO);
    if (!sent) return reply({ ok: false, error: 'The email could not be sent. Try again.' }, 502);
    await audit(env, email, 'report-notified', j.body.id, c.name).run();
    return reply({ ok: true });
  }
  if (path === '/admin/api/report-delete' && method === 'POST') {
    const j = await readJson(request); if (j.res) return j.res;
    const r = await env.DB.prepare('SELECT pdf_key FROM reports WHERE id = ?').bind(String(j.body.id || '')).first();
    if (!r) return reply({ ok: false, error: 'Not found.' }, 404);
    if (r.pdf_key && env.FILES) await env.FILES.delete(r.pdf_key);
    await deleteInspectionFiles(env, [String(j.body.id)]);
    await env.DB.batch([env.DB.prepare('DELETE FROM inspections WHERE report_id = ?').bind(String(j.body.id)), env.DB.prepare('DELETE FROM report_state WHERE report_id = ?').bind(String(j.body.id)), env.DB.prepare("DELETE FROM invoices WHERE kind = 'visit' AND ref_id = ?").bind(String(j.body.id)), env.DB.prepare('DELETE FROM reports WHERE id = ?').bind(String(j.body.id)), audit(env, email, 'report-deleted', String(j.body.id))]);
    return reply({ ok: true });
  }

  // ---- payments
  if (path === '/admin/api/report-finish' && method === 'POST') {
    const j = await readJson(request); if (j.res) return j.res;
    const rid = String(j.body.id || ''), cents = toCents(j.body.amount);
    const rep = await env.DB.prepare('SELECT id, customer_id FROM reports WHERE id = ?').bind(rid).first();
    if (!rep) return reply({ ok: false, error: 'Not found.' }, 404);
    if (cents === null) return reply({ ok: false, error: 'Enter the invoice amount, like 250. Use 0 to waive it.' }, 400);
    const st = await env.DB.prepare('SELECT released_at FROM report_state WHERE report_id = ?').bind(rid).first();
    if (!st || st.released_at || await env.DB.prepare("SELECT 1 AS x FROM invoices WHERE kind = 'visit' AND ref_id = ?").bind(rid).first()) return reply({ ok: false, error: 'This report was already finished.' }, 409);
    const c = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(rep.customer_id).first();
    if (cents === 0) { await releaseReport(env, rid, c); await audit(env, email, 'report-waived', rid, c.name).run(); return reply({ ok: true, released: true }); }
    const inv = await createInvoice(env, email, c, 'visit', rid, cents);
    return reply({ ok: true, invoice: inv.id, emailed: inv.emailed });
  }
  if (path === '/admin/api/invoices' && method === 'GET') return reply({ ok: true, invoices: await invoiceRows(env, "i.status = 'open' OR i.released_at = '' OR i.notice_state != 'none'", []) });
  m = /^\/admin\/api\/invoice-(waive|paid|pause|release|notice|final)$/.exec(path);
  if (m && method === 'POST') {
    const j = await readJson(request); if (j.res) return j.res;
    const inv = await env.DB.prepare('SELECT * FROM invoices WHERE id = ?').bind(String(j.body.id || '')).first();
    if (!inv) return reply({ ok: false, error: 'Not found.' }, 404);
    const act = m[1];
    if (act === 'waive') {
      if (inv.status !== 'open') return reply({ ok: false, error: 'Only an unpaid invoice can be waived.' }, 400);
      await env.DB.prepare("UPDATE invoices SET status = 'waived', note = 'Waived' WHERE id = ?").bind(inv.id).run();
      await audit(env, email, 'invoice-waived', inv.id, String(inv.amount_cents)).run(); await releaseInvoice(env, inv, email); return reply({ ok: true });
    }
    if (act === 'paid') { if (!(await markPaid(env, inv, email))) return reply({ ok: false, error: 'This invoice is not open.' }, 400); await env.DB.prepare("UPDATE invoices SET note = 'Marked paid by you' WHERE id = ?").bind(inv.id).run(); return reply({ ok: true }); }
    if (act === 'pause') { await env.DB.prepare('UPDATE invoices SET paused = ? WHERE id = ?').bind(j.body.paused ? 1 : 0, inv.id).run(); await audit(env, email, j.body.paused ? 'invoice-paused' : 'invoice-resumed', inv.id).run(); return reply({ ok: true }); }
    if (act === 'release') { if (inv.status === 'open') return reply({ ok: false, error: 'Not paid yet. Waive it or mark it paid first.' }, 400); return reply({ ok: true, released: await releaseInvoice(env, inv, email) }); }
    return out(await sendNotice(env, email, inv.id, act === 'notice' ? 'notice' : 'final', j.body.tracking));
  }
  if (path === '/admin/api/invoice-letter' && method === 'GET') {
    const u = new URL(request.url), inv = await env.DB.prepare('SELECT * FROM invoices WHERE id = ?').bind(u.searchParams.get('id') || '').first();
    const kind = u.searchParams.get('kind') === 'final' ? 'final' : 'notice';
    if (!inv) return reply({ ok: false, error: 'Not found.' }, 404);
    const d = await noticeDrafts(env, inv, kind);
    return reply({ ok: true, kind, owner: d.owner, county: d.county, address: d.customer.address, name: d.customer.name, county_name: d.customer.county, term: d.term });
  }
  if (path === '/admin/api/counties' && method === 'GET') return reply({ ok: true, counties: (await env.DB.prepare('SELECT name, email FROM counties ORDER BY name').all()).results });
  // ---- contacts: installers, county staff, referrals and leads
  if (path === '/admin/api/contacts' && method === 'GET') {
    const list = (await env.DB.prepare("SELECT c.*, COALESCE(x.repair_prefs, '') AS repair_prefs FROM contacts c LEFT JOIN contact_extra x ON x.contact_id = c.id ORDER BY CASE WHEN c.next_date = '' THEN 1 ELSE 0 END, c.next_date, c.name").all()).results;
    const built = new Map();
    for (const r of (await env.DB.prepare('SELECT s.data, c.id AS cid, c.name AS cname, c.address AS caddr FROM systems s JOIN customers c ON c.id = s.customer_id').all()).results) {
      let si = null; try { si = JSON.parse(r.data).installer; } catch { si = null; }
      if (si && si.id) { if (!built.has(si.id)) built.set(si.id, []); built.get(si.id).push({ id: r.cid, name: r.cname, address: r.caddr }); }
    }
    for (const k of list) k.systems = built.get(k.id) || [];
    return reply({ ok: true, kinds: CONTACT_KINDS, contacts: list });
  }
  if (path === '/admin/api/contact' && method === 'POST') {
    const j = await readJson(request, 8192); if (j.res) return j.res; const b = j.body || {};
    if (b.remove) { await env.DB.batch([env.DB.prepare('DELETE FROM contacts WHERE id = ?').bind(clean(b.id, 40)), env.DB.prepare('DELETE FROM contact_extra WHERE contact_id = ?').bind(clean(b.id, 40))]); await audit(env, email, 'contact-removed', clean(b.id, 40)).run(); return reply({ ok: true }); }
    const c = cleanContact(b); if (c.error) return reply({ ok: false, error: c.error }, 400);
    const now = new Date().toISOString(), cid = clean(b.id, 40);
    if (cid) {
      const r = await env.DB.prepare('UPDATE contacts SET name=?, company=?, kind=?, county=?, phone=?, email=?, next_step=?, next_date=?, notes=?, customer_id=?, updated_at=? WHERE id=?').bind(c.name, c.company, c.kind, c.county, c.phone, c.email, c.next_step, c.next_date, c.notes, c.customer_id, now, cid).run();
      if (!r.meta || !r.meta.changes) return reply({ ok: false, error: 'Not found.' }, 404);
      await savePrefs(env, cid, b);
      return reply({ ok: true, id: cid });
    }
    const nid = id();
    await env.DB.batch([env.DB.prepare('INSERT INTO contacts (id, name, company, kind, county, phone, email, next_step, next_date, notes, customer_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(nid, c.name, c.company, c.kind, c.county, c.phone, c.email, c.next_step, c.next_date, c.notes, c.customer_id, now, now), audit(env, email, 'contact-added', nid, c.name)]);
    await savePrefs(env, nid, b);
    return reply({ ok: true, id: nid });
  }
  if (path === '/admin/api/county' && method === 'POST') {
    const j = await readJson(request); if (j.res) return j.res;
    const name = clean(j.body.name, 40).toLowerCase().replace(/\s+county$/, ''), mail = clean(j.body.email, 254).toLowerCase();
    if (!name) return reply({ ok: false, error: 'Enter the county name.' }, 400);
    if (j.body.remove) { await env.DB.prepare('DELETE FROM counties WHERE name = ?').bind(name).run(); return reply({ ok: true }); }
    if (!EMAIL.test(mail)) return reply({ ok: false, error: 'Enter a valid email address for the county.' }, 400);
    await env.DB.prepare('INSERT INTO counties (name, email) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET email = excluded.email').bind(name, mail).run();
    await audit(env, email, 'county-saved', name, mail).run(); return reply({ ok: true });
  }
  if (path === '/admin/api/report-county-send' && method === 'POST') {
    const j = await readJson(request); if (j.res) return j.res;
    const st = await env.DB.prepare('SELECT released_at FROM report_state WHERE report_id = ?').bind(String(j.body.id || '')).first();
    if (st && !st.released_at) return reply({ ok: false, error: 'This report is still held.' }, 400);
    const rep = await env.DB.prepare('SELECT customer_id FROM reports WHERE id = ?').bind(String(j.body.id || '')).first();
    if (!rep) return reply({ ok: false, error: 'Not found.' }, 404);
    const ok = await sendCountyReport(env, String(j.body.id), await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(rep.customer_id).first());
    return ok ? reply({ ok: true }) : reply({ ok: false, error: 'The county copy could not be sent. Check that the county has an email under Counties.' }, 400);
  }
  return reply({ ok: false, error: 'Not found.' }, 404);
}
