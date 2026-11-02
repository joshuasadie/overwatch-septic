// Cases (OWS-00101…) with parts (P-000101…), RMAs (RMA-0000101…), public/private comments and private time.
// Customers see only their own cases, the case status and public comments. Parts, RMAs, time and private comments stay internal.
import { clean, id, siteOrigin, sendMail } from './lib.js';

// The tables live in SCHEMA in lib.js (counters, cases, case_items, case_comments).

export const CASE_STATUS = ['Open', 'Waiting on owner', 'Waiting on vendor', 'Waiting on county', 'Done'];
export const CASE_TYPES = ['Repair follow-up', 'County action item', 'Owner request', 'Callback', 'Permit condition', 'Other'];
export const CHANNELS = { overwatch: 'From Overwatch', phone_in: 'Phone call incoming', phone_out: 'Phone call outgoing', customer: 'From customer', portal: 'From customer · portal' };
export const ITEM_STATUS = { part: ['Needed', 'Ordered', 'Received', 'Installed', 'Cancelled'], rma: ['Requested', 'Approved', 'Shipped', 'Replacement received', 'Credited', 'Cancelled'] };
const ITEM_DONE = new Set(['Installed', 'Cancelled', 'Replacement received', 'Credited']);
export const itemOpen = it => !ITEM_DONE.has(it.status);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateOr = v => (DATE.test(String(v || '')) ? String(v) : '');
const pad = (n, w) => String(n).padStart(w, '0');
export const caseNo = n => `OWS-${pad(n, 5)}`;
export const itemNo = (kind, n) => (kind === 'part' ? `P-${pad(n, 6)}` : `RMA-${pad(n, 7)}`);
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function nextNum(env, name) {
  const r = await env.DB.prepare('UPDATE counters SET next = next + 1 WHERE name = ? RETURNING next').bind(name).first();
  return Number(r.next) - 1;
}
async function addComment(env, caseId, c) {
  const seq = Number(((await env.DB.prepare('SELECT MAX(seq) AS m FROM case_comments WHERE case_id = ?').bind(caseId).first()) || {}).m || 0) + 1;
  const now = new Date().toISOString(), cid = id();
  await env.DB.prepare('INSERT INTO case_comments (id, case_id, seq, kind, visibility, channel, who, at, body, minutes, emailed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(cid, caseId, seq, c.kind || 'note', c.visibility || 'private', c.channel || 'overwatch', c.who || '', c.at || now, c.body, c.minutes || 0, c.emailed ? 1 : 0, now).run();
  await env.DB.prepare('UPDATE cases SET updated_at = ? WHERE id = ?').bind(now, caseId).run();
  return { id: cid, seq };
}
const event = (env, caseId, who, body) => addComment(env, caseId, { kind: 'event', visibility: 'private', channel: 'system', who, body });
const whoName = who => (String(who || '').split('@')[0] || 'Overwatch').replace(/^./, ch => ch.toUpperCase());

function caseRow(r) {
  return { id: r.id, num: r.num, no: caseNo(r.num), customer_id: r.customer_id, customer_name: r.customer_name, title: r.title, type: r.type, status: r.status, due_date: r.due_date, county_due: r.county_due, county_done: r.county_done, owner_due: r.owner_due, source: r.source, source_ref: r.source_ref, contact: r.contact, description: r.description, created_at: r.created_at, updated_at: r.updated_at, closed_at: r.closed_at };
}
function itemRow(r) { return { ...r, no: itemNo(r.kind, r.num), open: itemOpen(r) }; }

// ---- admin
export async function listCases(env, customerId) {
  const q = customerId
    ? env.DB.prepare('SELECT k.*, c.name AS customer_name FROM cases k JOIN customers c ON c.id = k.customer_id WHERE k.customer_id = ? ORDER BY (k.status = \'Done\'), k.num DESC').bind(customerId)
    : env.DB.prepare("SELECT k.*, c.name AS customer_name FROM cases k JOIN customers c ON c.id = k.customer_id WHERE k.status != 'Done' ORDER BY CASE WHEN k.due_date = '' THEN 1 ELSE 0 END, k.due_date, k.num");
  const rows = (await q.all()).results.map(caseRow);
  if (!rows.length) return rows;
  const items = (await env.DB.prepare(`SELECT case_id, kind, num, status FROM case_items WHERE case_id IN (${rows.map(() => '?').join(',')})`).bind(...rows.map(r => r.id)).all()).results;
  for (const r of rows) { const mine = items.filter(i => i.case_id === r.id); r.open_items = mine.filter(itemOpen).map(i => itemNo(i.kind, i.num)); }
  return rows;
}
export async function getCase(env, caseId) {
  const r = await env.DB.prepare('SELECT k.*, c.name AS customer_name FROM cases k JOIN customers c ON c.id = k.customer_id WHERE k.id = ?').bind(caseId).first();
  if (!r) return null;
  const k = caseRow(r);
  k.items = (await env.DB.prepare('SELECT i.*, COALESCE(q.qty, 1) AS qty FROM case_items i LEFT JOIN case_item_qty q ON q.item_id = i.id WHERE i.case_id = ? ORDER BY i.kind, i.num').bind(caseId).all()).results.map(itemRow);
  k.comments = (await env.DB.prepare('SELECT * FROM case_comments WHERE case_id = ? ORDER BY seq DESC').bind(caseId).all()).results;
  k.minutes = k.comments.reduce((s, c) => s + (Number(c.minutes) || 0), 0);
  return k;
}
function caseFields(b, cur = {}) {
  const f = {
    title: b.title !== undefined ? clean(b.title, 160) : cur.title,
    type: b.type !== undefined ? (CASE_TYPES.includes(b.type) ? b.type : 'Other') : cur.type || 'Repair follow-up',
    status: b.status !== undefined ? (CASE_STATUS.includes(b.status) ? b.status : 'Open') : cur.status || 'Open',
    due_date: b.due_date !== undefined ? dateOr(b.due_date) : cur.due_date || '',
    county_due: b.county_due !== undefined ? dateOr(b.county_due) : cur.county_due || '',
    county_done: b.county_done !== undefined ? dateOr(b.county_done) : cur.county_done || '',
    owner_due: b.owner_due !== undefined ? dateOr(b.owner_due) : cur.owner_due || '',
    contact: b.contact !== undefined ? clean(b.contact, 100) : cur.contact || '',
    description: b.description !== undefined ? clean(b.description, 4000) : cur.description || '',
  };
  if (!f.title) return { error: 'Give the case a title.' };
  return { f };
}
export async function saveCase(env, who, b) {
  const now = new Date().toISOString();
  if (b.id) {
    const cur = await env.DB.prepare('SELECT * FROM cases WHERE id = ?').bind(String(b.id)).first();
    if (!cur) return { status: 404, error: 'Not found.' };
    const { f, error } = caseFields(b, cur); if (error) return { error };
    if (f.status === 'Done' && cur.status !== 'Done') {
      const open = (await env.DB.prepare('SELECT kind, num, status FROM case_items WHERE case_id = ?').bind(cur.id).all()).results.filter(itemOpen);
      if (open.length) return { status: 409, error: `Can't close yet: ${open.map(i => itemNo(i.kind, i.num)).join(' and ')} ${open.length > 1 ? 'are' : 'is'} open.` };
    }
    await env.DB.prepare('UPDATE cases SET title = ?, type = ?, status = ?, due_date = ?, county_due = ?, county_done = ?, owner_due = ?, contact = ?, description = ?, updated_at = ?, closed_at = ? WHERE id = ?')
      .bind(f.title, f.type, f.status, f.due_date, f.county_due, f.county_done, f.owner_due, f.contact, f.description, now, f.status === 'Done' ? (cur.closed_at || now) : '', cur.id).run();
    if (f.status !== cur.status) await event(env, cur.id, who, `Status changed from ${cur.status} to ${f.status} by ${whoName(who)}`);
    if (f.county_done && !cur.county_done) await event(env, cur.id, who, `County notified (${f.county_done}), recorded by ${whoName(who)}`);
    return { ok: true, id: cur.id };
  }
  const c = await env.DB.prepare('SELECT id FROM customers WHERE id = ?').bind(String(b.customer_id || '')).first();
  if (!c) return { status: 404, error: 'Customer not found.' };
  const { f, error } = caseFields(b); if (error) return { error };
  return createCase(env, who, c.id, { ...f, source: clean(b.source, 40) || 'Manual', source_ref: clean(b.source_ref, 60) });
}
export async function createCase(env, who, customerId, f) {
  const now = new Date().toISOString(), cid = id(), num = await nextNum(env, 'ows');
  await env.DB.prepare('INSERT INTO cases (id, num, customer_id, title, type, status, due_date, county_due, county_done, owner_due, source, source_ref, contact, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(cid, num, customerId, f.title, f.type || 'Repair follow-up', f.status || 'Open', f.due_date || '', f.county_due || '', f.county_done || '', f.owner_due || '', f.source || '', f.source_ref || '', f.contact || '', f.description || '', now, now).run();
  await event(env, cid, who, `${caseNo(num)} opened by ${whoName(who)}${f.source && f.source !== 'Manual' ? ' from ' + f.source.toLowerCase() : ''}`);
  return { ok: true, id: cid, no: caseNo(num) };
}
export async function saveComment(env, who, b) {
  const k = await env.DB.prepare('SELECT k.*, c.name AS cname, c.email AS cemail FROM cases k JOIN customers c ON c.id = k.customer_id WHERE k.id = ?').bind(String(b.case_id || '')).first();
  if (!k) return { status: 404, error: 'Not found.' };
  const body = clean(b.body, 8000); if (!body) return { error: 'Write the comment first.' };
  const visibility = b.visibility === 'public' ? 'public' : 'private';
  const channel = CHANNELS[b.channel] && b.channel !== 'portal' ? b.channel : 'overwatch';
  const minutes = Math.max(0, Math.min(24 * 60, Math.round(Number(b.minutes) || 0)));
  const at = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(b.at || '')) ? new Date(b.at).toISOString() : new Date().toISOString();
  const whoTxt = clean(b.who, 100) || whoName(who);
  let emailed = false;
  if (visibility === 'public' && channel === 'overwatch' && b.email && k.cemail) {
    emailed = await sendMail(env, k.cemail, `[${caseNo(k.num)}] ${k.title}`, [`Hello ${k.cname},`, '', body, '', `You can read and reply to this request in your customer portal: ${siteOrigin(env)}/login/`, '', 'Overwatch Septic, LLC'].join('\n'), env.MAIL_TO);
  }
  const r = await addComment(env, k.id, { visibility, channel, who: whoTxt, at, body, minutes, emailed });
  return { ok: true, id: r.id, seq: r.seq, emailed };
}
export async function saveItem(env, who, b) {
  const now = new Date().toISOString();
  const s = (k, n = 120) => clean(b[k], n);
  const qty = Math.max(1, Math.min(9999, Math.round(Number(b.qty) || 1)));
  const setQty = iid => env.DB.prepare('INSERT INTO case_item_qty (item_id, qty) VALUES (?, ?) ON CONFLICT(item_id) DO UPDATE SET qty = excluded.qty').bind(iid, qty).run();
  if (b.id) {
    const cur = await env.DB.prepare('SELECT * FROM case_items WHERE id = ?').bind(String(b.id)).first();
    if (!cur) return { status: 404, error: 'Not found.' };
    const status = ITEM_STATUS[cur.kind].includes(b.status) ? b.status : cur.status;
    const title = s('title', 160) || cur.title;
    await env.DB.prepare('UPDATE case_items SET title = ?, vendor = ?, part_no = ?, po = ?, cost = ?, eta = ?, rma_no = ?, tracking = ?, credit = ?, notes = ?, status = ?, updated_at = ? WHERE id = ?')
      .bind(title, s('vendor'), s('part_no'), s('po'), s('cost', 30), dateOr(b.eta), s('rma_no'), s('tracking'), s('credit', 60), s('notes', 1000), status, now, cur.id).run();
    if (cur.kind === 'part' && b.qty !== undefined) await setQty(cur.id);
    if (status !== cur.status) await event(env, cur.case_id, who, `${itemNo(cur.kind, cur.num)} changed from ${cur.status} to ${status} by ${whoName(who)}`);
    return { ok: true, id: cur.id };
  }
  const kind = b.kind === 'rma' ? 'rma' : 'part';
  const k = await env.DB.prepare('SELECT id, status FROM cases WHERE id = ?').bind(String(b.case_id || '')).first();
  if (!k) return { status: 404, error: 'Case not found.' };
  if (k.status === 'Done') return { error: 'This case is closed. Reopen it first.' };
  const title = s('title', 160); if (!title) return { error: kind === 'part' ? 'Name the part.' : 'Name what is being returned.' };
  const status = ITEM_STATUS[kind].includes(b.status) ? b.status : ITEM_STATUS[kind][0];
  const num = await nextNum(env, kind === 'part' ? 'p' : 'rma'), iid = id();
  await env.DB.prepare('INSERT INTO case_items (id, case_id, kind, num, title, vendor, part_no, po, cost, eta, rma_no, tracking, credit, notes, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(iid, k.id, kind, num, title, s('vendor'), s('part_no'), s('po'), s('cost', 30), dateOr(b.eta), s('rma_no'), s('tracking'), s('credit', 60), s('notes', 1000), status, now, now).run();
  if (kind === 'part') await setQty(iid);
  await event(env, k.id, who, `${itemNo(kind, num)} created by ${whoName(who)}: ${kind === 'part' && qty > 1 ? qty + ' × ' : ''}${title}`);
  return { ok: true, id: iid, no: itemNo(kind, num) };
}
// After a visit is finished: a case for anything marked "needs repair", with the 48-hour county and 30-day owner deadlines.
export async function caseFromReport(env, who, report) {
  if (await env.DB.prepare("SELECT 1 AS x FROM cases WHERE source = 'Inspection' AND source_ref = ?").bind(report.id).first()) return null;
  let checks = []; try { checks = JSON.parse(report.checks || '[]'); } catch { checks = []; }
  const bad = checks.filter(x => x && x.status === 'repair').map(x => clean(x.label, 120)).filter(Boolean);
  if (!bad.length) return null;
  const v = DATE.test(report.visit_date || '') ? report.visit_date : new Date().toISOString().slice(0, 10);
  return createCase(env, who, report.customer_id, {
    title: `Repairs needed from ${v} visit`, type: 'Repair follow-up', status: 'Open', due_date: addDays(v, 2), county_due: addDays(v, 2), owner_due: addDays(v, 30),
    source: 'Inspection', source_ref: report.id, description: `Found on the ${v} inspection: ${bad.join('; ')}. Tell the county within 48 hours. The owner has 30 days to repair or show proof.`,
  });
}
export async function deleteCasesFor(env, customerId) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM case_comments WHERE case_id IN (SELECT id FROM cases WHERE customer_id = ?)').bind(customerId),
    env.DB.prepare('DELETE FROM case_item_qty WHERE item_id IN (SELECT i.id FROM case_items i JOIN cases k ON k.id = i.case_id WHERE k.customer_id = ?)').bind(customerId),
    env.DB.prepare('DELETE FROM case_items WHERE case_id IN (SELECT id FROM cases WHERE customer_id = ?)').bind(customerId),
    env.DB.prepare('DELETE FROM cases WHERE customer_id = ?').bind(customerId),
  ]);
}

// ---- customer portal: own cases, exact status, public comments only
export async function portalCases(env, customerId) {
  const rows = (await env.DB.prepare('SELECT * FROM cases WHERE customer_id = ? ORDER BY (status = \'Done\'), num DESC').bind(customerId).all()).results;
  const out = [];
  for (const r of rows) {
    const comments = (await env.DB.prepare("SELECT seq, channel, who, at, body FROM case_comments WHERE case_id = ? AND kind = 'note' AND visibility = 'public' ORDER BY seq DESC").bind(r.id).all()).results
      .map(c => ({ seq: c.seq, from: c.channel === 'portal' || c.channel === 'customer' ? 'you' : 'overwatch', who: c.who, at: c.at, body: c.body, how: c.channel === 'phone_in' || c.channel === 'phone_out' ? 'Phone call' : '' }));
    out.push({ id: r.id, no: caseNo(r.num), title: r.title, status: r.status, created_at: r.created_at, updated_at: r.updated_at, closed_at: r.closed_at, comments });
  }
  return out;
}
export async function portalComment(env, customer, b) {
  const k = await env.DB.prepare('SELECT * FROM cases WHERE id = ? AND customer_id = ?').bind(String(b.case_id || ''), customer.id).first();
  if (!k) return { status: 404, error: 'Not found.' };
  const body = clean(b.body, 4000); if (!body) return { error: 'Write a message first.' };
  await addComment(env, k.id, { visibility: 'public', channel: 'portal', who: customer.name, body });
  if (env.MAIL_TO) await sendMail(env, env.MAIL_TO, `[${caseNo(k.num)}] New message from ${customer.name}`, [`${customer.name} wrote on ${caseNo(k.num)}, ${k.title}:`, '', body, '', `Open the admin portal to reply: ${siteOrigin(env)}/admin/`].join('\n'), customer.email);
  return { ok: true };
}
export async function portalRequest(env, customer, b) {
  const title = clean(b.title, 160), body = clean(b.body, 4000);
  if (!title) return { error: 'Give your request a short title.' };
  if (!body) return { error: 'Tell us what is going on.' };
  const r = await createCase(env, customer.name, customer.id, { title, type: 'Owner request', status: 'Open', source: 'Portal', contact: customer.name });
  await addComment(env, r.id, { visibility: 'public', channel: 'portal', who: customer.name, body });
  if (env.MAIL_TO) await sendMail(env, env.MAIL_TO, `[${r.no}] New request from ${customer.name}: ${title}`, [`${customer.name} opened ${r.no} in the customer portal.`, '', body, '', `Open the admin portal to reply: ${siteOrigin(env)}/admin/`].join('\n'), customer.email);
  return { ok: true, id: r.id, no: r.no };
}
