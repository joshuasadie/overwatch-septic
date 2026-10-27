// Inspection reports: the full state-style form, the system profile saved per customer, and the photos.
import { reply, clean, id } from './lib.js';
import '../site/inspect-core.js';
import '../site/inspect-view.js';
const OWI = globalThis.OWI;
export { OWI };

export const operatorOf = env => ({ name: env.OPERATOR_NAME || 'Joshua Klein', cert: env.OPERATOR_CERT || '', phone: env.OPERATOR_PHONE || '919-525-1455' });
const jparse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const num = v => { const n = OWI.n(v); return n !== null && n >= 0 && n < 1e6 ? n : null; };

const day = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '';
const rid = v => /^[a-z0-9]{2,8}$/.test(v || '') ? v : Math.random().toString(36).slice(2, 8);
const cleanTank = t => { t = t || {}; const fl = t.floats || {}; return { id: rid(t.id), kind: t.kind === 'pump' ? 'pump' : 'septic', name: clean(t.name, 60), model: clean(t.model, 60), gal: num(t.gal), shape: t.shape === 'round' ? 'round' : 'rect', a: num(t.a), b: num(t.b), gpi: num(t.gpi), liquid_depth: num(t.liquid_depth), design_pdr: num(t.design_pdr), unit: clean(t.unit, 60), floats: { alarm: num(fl.alarm), on: num(fl.on), off: num(fl.off), timed: num(fl.timed) } }; };
export function cleanSystem(b) {
  b = b || {}; const p = b.permit || {};
  return { sys_desc: clean(b.sys_desc, 80), tank_shape: b.tank_shape === 'round' ? 'round' : 'rect', tank_a: num(b.tank_a), tank_b: num(b.tank_b), design_flow: num(b.design_flow), septic_gal: num(b.septic_gal), liquid_depth: num(b.liquid_depth), pump_gal: num(b.pump_gal), gpi: num(b.gpi), dose: num(b.dose), design_pdr: num(b.design_pdr),
    floats: { alarm: num(b.floats && b.floats.alarm), on: num(b.floats && b.floats.on), off: num(b.floats && b.floats.off), timed: num(b.floats && b.floats.timed) }, septic_unit: clean(b.septic_unit, 60), pump_unit: clean(b.pump_unit, 60), laterals: (Array.isArray(b.laterals) ? b.laterals : []).slice(0, 12).map(l => ({ length: num(l && l.length), design: num(l && l.design) })),
    septic_name: clean(b.septic_name, 60), pump_name: clean(b.pump_name, 60), septic_model: clean(b.septic_model, 60), pump_model: clean(b.pump_model, 60), septic_shape: b.septic_shape === 'round' ? 'round' : 'rect', septic_a: num(b.septic_a), septic_b: num(b.septic_b), zone_word: b.zone_word === 'Zone' ? 'Zone' : 'Lateral',
    permit: { county: clean(p.county, 40), parcel: clean(p.parcel, 40), type: clean(p.type, 60), issued: day(p.issued), months: num(p.months), ca_no: clean(p.ca_no, 40), ip_no: clean(p.ip_no, 40), other_no: clean(p.other_no, 60), bedrooms: num(p.bedrooms), occupants: num(p.occupants), freq: OWI.FREQ.some(f => f[0] === p.freq) ? p.freq : '', owners: clean(p.owners, 120) },
    addresses: (Array.isArray(b.addresses) ? b.addresses : []).slice(0, 4).map(a => clean(a, 120)).filter(Boolean),
    tanks: (Array.isArray(b.tanks) ? b.tanks : []).slice(0, 8).map(cleanTank),
    cards: (Array.isArray(b.cards) ? b.cards : []).slice(0, 8).map(c => ({ id: rid(c && c.id), title: clean(c && c.title, 60) || 'Other checks', items: (Array.isArray(c && c.items) ? c.items : []).slice(0, 30).map(i => clean(i, 120)).filter(Boolean) })) };
}

// the setup screen: permit, addresses, names, tanks and check cards. Sizes and readings already saved are kept.
export async function saveSystem(env, who, c, b) {
  const row = await env.DB.prepare('SELECT data FROM systems WHERE customer_id = ?').bind(c.id).first(), cur = row ? jparse(row.data, {}) : {};
  const old = new Map((cur.tanks || []).map(t => [t.id, t]));
  const merged = { ...cur, design_flow: b.design_flow !== undefined ? b.design_flow : cur.design_flow, sys_desc: b.sys_desc !== undefined ? b.sys_desc : cur.sys_desc, permit: b.permit, addresses: b.addresses, septic_name: b.septic_name, pump_name: b.pump_name, zone_word: b.zone_word, cards: b.cards,
    ...Object.fromEntries(['septic_model', 'pump_model', 'septic_unit', 'pump_unit', 'septic_shape', 'septic_a', 'septic_b', 'septic_gal', 'pump_gal', 'tank_shape', 'tank_a', 'tank_b', 'gpi'].filter(k => b[k] !== undefined).map(k => [k, b[k]])),
    tanks: (Array.isArray(b.tanks) ? b.tanks : []).slice(0, 8).map(t => { const o = old.get(t && t.id); const x = Object.fromEntries(['id', 'kind', 'name', 'model', 'unit', 'gal', 'shape', 'a', 'b', 'gpi'].filter(k => t && t[k] !== undefined).map(k => [k, t[k]])); return o ? { ...o, ...x } : x; }) };
  const sys = cleanSystem(merged), now = new Date().toISOString();
  { const g = OWI.gpi(sys.tank_shape, sys.tank_a, sys.tank_b); if (g !== null) sys.gpi = g; for (const t of sys.tanks) { const q = OWI.gpi(t.shape, t.a, t.b); if (q !== null) t.gpi = q; } }
  await env.DB.batch([
    env.DB.prepare('INSERT INTO systems (customer_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(customer_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at').bind(c.id, JSON.stringify(sys), now),
    env.DB.prepare('INSERT INTO audit (at, who, action, target, detail) VALUES (?, ?, ?, ?, ?)').bind(now, who, 'system-saved', c.id, c.name)
  ]);
  return { ok: true, system: sys };
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
  const f = await env.DB.prepare("SELECT MIN(r.visit_date) AS d FROM reports r JOIN inspections i ON i.report_id = r.id WHERE r.customer_id = ?").bind(cid).first();
  return { system: row ? jparse(row.data, {}) : null, prev: await previous(env, cid, date || '9999-12-31'), first: (f && f.d) || '' };
}

export async function createInspection(env, who, c, b) {
  const date = String(b.visit_date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Please choose the visit date.' };
  const sys = cleanSystem(b.system), d = OWI.sanitize(b.data, sys), op = operatorOf(env);
  if (!op.cert) return { error: 'The operator certificate number is not set up.', status: 500 };
  if (d.septic.sludge !== null && d.liquid_depth && d.septic.sludge > d.liquid_depth) return { error: 'Sludge depth is deeper than the liquid depth. Please check both numbers.' };
  if (d.flow.on !== null && d.flow.off !== null && d.flow.on < d.flow.off) return { error: 'The pump-on water level should be higher than the pump-off level. Please check the flow test.' };
  const prev = await previous(env, c.id, date);
  const g = OWI.gpi(d.tank_shape, d.tank_a, d.tank_b); if (g !== null) { d.gpi = g; d.flow.gpi = g; sys.gpi = g; }
  const cx = { design_flow: sys.design_flow, design_pdr: d.flow.design_pdr, dose: d.flow.dose, prev, date };
  const calc = OWI.calc(d, cx); calc.formulas = OWI.formulas(d, calc, cx);
  if (g !== null) calc.formulas.gpi = OWI.gpiFormula(d.tank_shape, d.tank_a, d.tank_b);
  // extra tanks: same math, own readings; what was typed is remembered on the system
  calc.tanks = {};
  for (const t of sys.tanks) {
    const x = d.tanks[t.id]; if (!x) continue;
    const k = OWI.calcTank(x, x.kind); calc.tanks[t.id] = k; if (x.kind === 'pump' && k.gpi != null) x.gpi = k.gpi;
    if (x.kind === 'pump' && k.drawdown != null) x.drawdown = k.drawdown, x.dose = k.dose;
    x.unit = t.unit || '';
    Object.assign(t, { gal: x.gal, shape: x.shape, a: x.a, b: x.b, gpi: x.gpi, liquid_depth: x.liquid_depth, design_pdr: x.design_pdr, floats: x.floats });
  }
  d.sysinfo = { permit: sys.permit, addresses: sys.addresses, names: { septic: sys.septic_name, pump: sys.pump_name }, zone_word: sys.zone_word, units: { septic: sys.septic_unit || '', pump: sys.pump_unit || '' } };
  if (calc.drawdown !== null) d.flow.drawdown = calc.drawdown;
  if (calc.dose !== null) d.flow.dose = calc.dose;
  d.operator = op; sys.tank_shape = d.tank_shape; sys.tank_a = d.tank_a; sys.tank_b = d.tank_b;
  const rid = id(), now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO reports (id, customer_id, visit_date, kind, readings, checks, notes, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(rid, c.id, date, 'inspection', JSON.stringify(OWI.readings(d, calc)), JSON.stringify(OWI.rollup(d, calc)), d.recs.slice(0, 2000), now, who),
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
  const body = OWI.countyHtml({ visit_date: r.visit_date, insp: x }, { name: c.name, phone: c.phone, address: c.address, county: c.county, permit: c.permit, sys_type: c.sys_type, sys_desc: sys.sys_desc, design_flow: sys.design_flow }, x.data.operator || operatorOf(env));
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Septic inspection report</title><style>body{margin:0;padding:18px;background:#f3f3f3}${OWI.CSS}</style></head><body>${body}</body></html>`;
}
