// Inspection reports: the full state-style form, the system profile saved per customer, and the photos.
import { reply, clean, id } from './lib.js';
import '../site/inspect-core.js';
import '../site/inspect-view.js';
const OWI = globalThis.OWI;
export { OWI };

export const operatorOf = env => ({ name: env.OPERATOR_NAME || 'Joshua Klein', cert: env.OPERATOR_CERT || '' });
const jparse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const num = v => { const n = OWI.n(v); return n !== null && n >= 0 && n < 1e6 ? n : null; };

export function cleanSystem(b) {
  b = b || {};
  return { sys_desc: clean(b.sys_desc, 80), design_flow: num(b.design_flow), septic_gal: num(b.septic_gal), liquid_depth: num(b.liquid_depth), pump_gal: num(b.pump_gal), gpi: num(b.gpi), dose: num(b.dose), design_pdr: num(b.design_pdr),
    laterals: (Array.isArray(b.laterals) ? b.laterals : []).slice(0, 12).map(l => ({ length: num(l && l.length), design: num(l && l.design) })) };
}

// the newest earlier inspection: the "last time" column and the per-day meter math start from it
async function previous(env, cid, date) {
  const r = await env.DB.prepare("SELECT r.visit_date, i.data FROM reports r JOIN inspections i ON i.report_id = r.id WHERE r.customer_id = ? AND r.visit_date < ? ORDER BY r.visit_date DESC, r.created_at DESC LIMIT 1").bind(cid, date).first();
  if (!r) return null;
  const d = jparse(r.data, {});
  return { date: r.visit_date, et: d.meters && d.meters.et, events: d.meters && d.meters.events, turnups: (d.laterals || []).map(l => l.turnup), septic_pumped: d.septic && d.septic.pumped };
}

export async function systemInfo(env, cid, date) {
  const row = await env.DB.prepare('SELECT data FROM systems WHERE customer_id = ?').bind(cid).first();
  return { system: row ? jparse(row.data, {}) : null, prev: await previous(env, cid, date || '9999-12-31') };
}

export async function createInspection(env, who, c, b) {
  const date = String(b.visit_date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Please choose the visit date.' };
  const d = OWI.sanitize(b.data), sys = cleanSystem(b.system), op = operatorOf(env);
  if (!op.cert) return { error: 'The operator certificate number is not set up.', status: 500 };
  if (d.septic.sludge !== null && d.liquid_depth && d.septic.sludge > d.liquid_depth) return { error: 'Sludge depth is deeper than the liquid depth. Please check both numbers.' };
  if (d.flow.on !== null && d.flow.off !== null && d.flow.on < d.flow.off) return { error: 'The pump-on water level should be higher than the pump-off level. Please check the flow test.' };
  const prev = await previous(env, c.id, date);
  const calc = OWI.calc(d, { design_flow: sys.design_flow, design_pdr: d.flow.design_pdr, dose: d.flow.dose, prev, date });
  d.operator = op;
  const rid = id(), now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO reports (id, customer_id, visit_date, kind, readings, checks, notes, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(rid, c.id, date, 'inspection', JSON.stringify(OWI.readings(d, calc)), JSON.stringify(OWI.rollup(d)), d.recs.slice(0, 2000), now, who),
    env.DB.prepare('INSERT INTO inspections (report_id, data, calc, photos) VALUES (?, ?, ?, 0)').bind(rid, JSON.stringify(d), JSON.stringify(calc)),
    env.DB.prepare('INSERT INTO systems (customer_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(customer_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at').bind(c.id, JSON.stringify(sys), now),
    env.DB.prepare('INSERT INTO audit (at, who, action, target, detail) VALUES (?, ?, ?, ?, ?)').bind(now, who, 'inspection-added', rid, c.name),
    env.DB.prepare("INSERT INTO report_state (report_id, released_at) VALUES (?, '')").bind(rid)
  ]);
  return { ok: true, id: rid };
}

// attach the stored form to report rows. Owners never see the private comments.
export async function attachInspections(env, reports, forOwner) {
  const ids = reports.filter(r => r.kind === 'inspection' && !r.locked).map(r => r.id);
  if (!ids.length) return;
  const rows = (await env.DB.prepare(`SELECT report_id, data, calc, photos FROM inspections WHERE report_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results;
  const m = new Map(rows.map(x => [x.report_id, x]));
  for (const r of reports) {
    const x = m.get(r.id); if (!x) continue;
    const d = jparse(x.data, {}); if (forOwner) delete d.comments;
    r.insp = { data: d, calc: jparse(x.calc, {}), photos: x.photos };
  }
}

const PHOTO_MAX = 2.5 * 1024 * 1024, PHOTO_CAP = 8;
const jpeg = u8 => u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff;
export async function uploadPhoto(env, request, rid) {
  if (!env.FILES) return { error: 'File storage is not connected.', status: 503 };
  const i = await env.DB.prepare("SELECT photos FROM inspections WHERE report_id = ?").bind(rid).first();
  if (!i) return { error: 'Not found.', status: 404 };
  if (i.photos >= PHOTO_CAP) return { error: 'A report can have up to ' + PHOTO_CAP + ' photos.' };
  const buf = await request.arrayBuffer();
  if (buf.byteLength < 200 || buf.byteLength > PHOTO_MAX) return { error: 'Each photo must be under 2.5 MB.', status: 413 };
  if (!jpeg(new Uint8Array(buf, 0, 3))) return { error: 'Photos must be JPEG images.', status: 400 };
  const n = i.photos + 1;
  await env.FILES.put(`reports/${rid}/p${n}.jpg`, buf, { httpMetadata: { contentType: 'image/jpeg' } });
  await env.DB.prepare('UPDATE inspections SET photos = ? WHERE report_id = ?').bind(n, rid).run();
  return { ok: true, n };
}
export async function servePhoto(env, rid, n) {
  const i = await env.DB.prepare('SELECT photos FROM inspections WHERE report_id = ?').bind(rid).first();
  const obj = i && n >= 1 && n <= i.photos && env.FILES ? await env.FILES.get(`reports/${rid}/p${n}.jpg`) : null;
  if (!obj) return reply({ ok: false, error: 'Not found.' }, 404);
  return new Response(await obj.arrayBuffer(), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'content-disposition': 'inline' } });
}
export async function deleteInspectionFiles(env, rids) {
  for (const rid of rids) {
    const i = await env.DB.prepare('SELECT photos FROM inspections WHERE report_id = ?').bind(rid).first();
    if (i && env.FILES) for (let n = 1; n <= i.photos; n++) await env.FILES.delete(`reports/${rid}/p${n}.jpg`);
  }
}

// the county's technical copy as a standalone page (used by the emailed link)
export async function countyInspectionHtml(env, r, c) {
  const rows = [{ id: r.id, kind: r.kind }]; await attachInspections(env, rows, false);
  const x = rows[0].insp; if (!x) return null;
  const sysRow = await env.DB.prepare('SELECT data FROM systems WHERE customer_id = ?').bind(c.id).first(), sys = sysRow ? jparse(sysRow.data, {}) : {};
  const body = OWI.countyHtml({ visit_date: r.visit_date, insp: x }, { name: c.name, address: c.address, county: c.county, permit: c.permit, sys_type: c.sys_type, sys_desc: sys.sys_desc, design_flow: sys.design_flow }, x.data.operator || operatorOf(env));
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Septic inspection report</title><style>body{margin:0;padding:18px;background:#f3f3f3}${OWI.CSS}</style></head><body>${body}</body></html>`;
}
