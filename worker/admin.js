// Admin API (Cloudflare Access protected): customers, contracts, reports.
import { reply, clean, id, EMAIL, siteOrigin, sendMail, readJson, originOk, verifyAccess, ensureSchema } from './lib.js';
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

  if (path === '/admin/api/config' && method === 'GET') return reply({ ok: true, me: email, readings: READINGS });
  if (path === '/admin/api/customers' && method === 'GET') {
    const rows = (await env.DB.prepare('SELECT * FROM customers ORDER BY name COLLATE NOCASE').all()).results;
    const cs = (await env.DB.prepare('SELECT customer_id, status, created_at FROM contracts WHERE status != ? ORDER BY created_at').bind('void').all()).results;
    const rs = (await env.DB.prepare('SELECT customer_id, MAX(visit_date) AS last FROM reports GROUP BY customer_id').all()).results;
    const lastC = new Map(cs.map(c => [c.customer_id, c.status])), lastR = new Map(rs.map(r => [r.customer_id, r.last]));
    return reply({ ok: true, customers: rows.map(r => ({ ...r, contract: lastC.get(r.id) || 'none', last_report: lastR.get(r.id) || '' })) });
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
      return reply({ ok: true, id: cur.id });
    }
    if (existing) return reply({ ok: false, error: 'A customer with that email already exists.' }, 409);
    const cid = id();
    await env.DB.batch([env.DB.prepare('INSERT INTO customers (id, created_at, name, email, phone, address, county, sys_type, permit, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(cid, new Date().toISOString(), f.name, f.email, f.phone, f.address, f.county, f.sys_type, f.permit, f.notes), audit(env, email, 'customer-added', cid, f.name)]);
    return reply({ ok: true, id: cid });
  }
  m = /^\/admin\/api\/customer\/([a-f0-9]{20})$/.exec(path);
  if (m && method === 'GET') {
    const c = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(m[1]).first();
    if (!c) return reply({ ok: false, error: 'Not found.' }, 404);
    const contracts = (await env.DB.prepare('SELECT * FROM contracts WHERE customer_id = ? ORDER BY created_at DESC').bind(c.id).all()).results.map(x => ({ ...publicView(x, c), terms: JSON.parse(x.terms) }));
    const reports = (await env.DB.prepare('SELECT id, visit_date, kind, readings, checks, notes, pdf_key, created_at FROM reports WHERE customer_id = ? ORDER BY visit_date DESC').bind(c.id).all()).results.map(r => ({ ...r, readings: JSON.parse(r.readings), checks: JSON.parse(r.checks), has_pdf: !!r.pdf_key, pdf_key: undefined }));
    return reply({ ok: true, customer: c, contracts, reports });
  }
  if (path === '/admin/api/customer-delete' && method === 'POST') {
    const j = await readJson(request); if (j.res) return j.res;
    const cid = String(j.body.id || '');
    const c = await env.DB.prepare('SELECT name FROM customers WHERE id = ?').bind(cid).first();
    if (!c) return reply({ ok: false, error: 'Not found.' }, 404);
    const signed = await env.DB.prepare("SELECT COUNT(*) AS n FROM contracts WHERE customer_id = ? AND status IN ('owner_signed','complete')").bind(cid).first();
    if (signed.n) return reply({ ok: false, error: 'This customer has a signed agreement. Signed agreements are kept as records, so the customer cannot be deleted here.' }, 400);
    const reps = (await env.DB.prepare('SELECT pdf_key FROM reports WHERE customer_id = ?').bind(cid).all()).results;
    if (env.FILES) for (const r of reps) if (r.pdf_key) await env.FILES.delete(r.pdf_key);
    await env.DB.batch([env.DB.prepare('DELETE FROM reports WHERE customer_id = ?').bind(cid), env.DB.prepare('DELETE FROM contracts WHERE customer_id = ?').bind(cid), env.DB.prepare('DELETE FROM sessions WHERE customer_id = ?').bind(cid), env.DB.prepare('DELETE FROM login_tokens WHERE customer_id = ?').bind(cid), env.DB.prepare('DELETE FROM customers WHERE id = ?').bind(cid), audit(env, email, 'customer-deleted', cid, c.name)]);
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
    await env.DB.batch([env.DB.prepare('INSERT INTO reports (id, customer_id, visit_date, kind, readings, checks, notes, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(rid, c.id, b.visit_date, kind, JSON.stringify(readings), JSON.stringify(checks), clean(b.notes, 2000), new Date().toISOString(), email), audit(env, email, 'report-added', rid, c.name)]);
    return reply({ ok: true, id: rid });
  }
  if (path === '/admin/api/report-notify' && method === 'POST') {
    const j = await readJson(request); if (j.res) return j.res;
    const r = await env.DB.prepare('SELECT customer_id, visit_date, pdf_key FROM reports WHERE id = ?').bind(String(j.body.id || '')).first();
    if (!r) return reply({ ok: false, error: 'Not found.' }, 404);
    const c = await env.DB.prepare('SELECT name, email FROM customers WHERE id = ?').bind(r.customer_id).first();
    const sent = await sendMail(env, c.email, 'Your septic visit report is ready', [`Hello ${c.name},`, '', `The report from your visit on ${r.visit_date} is ready. Sign in to your customer portal to see it: ${siteOrigin(env)}/login/`, '', 'Overwatch Septic Systems'].join('\n'), env.MAIL_TO);
    if (!sent) return reply({ ok: false, error: 'The email could not be sent. Try again.' }, 502);
    await audit(env, email, 'report-notified', j.body.id, c.name).run();
    return reply({ ok: true });
  }
  if (path === '/admin/api/report-delete' && method === 'POST') {
    const j = await readJson(request); if (j.res) return j.res;
    const r = await env.DB.prepare('SELECT pdf_key FROM reports WHERE id = ?').bind(String(j.body.id || '')).first();
    if (!r) return reply({ ok: false, error: 'Not found.' }, 404);
    if (r.pdf_key && env.FILES) await env.FILES.delete(r.pdf_key);
    await env.DB.batch([env.DB.prepare('DELETE FROM reports WHERE id = ?').bind(String(j.body.id)), audit(env, email, 'report-deleted', String(j.body.id))]);
    return reply({ ok: true });
  }
  return reply({ ok: false, error: 'Not found.' }, 404);
}
