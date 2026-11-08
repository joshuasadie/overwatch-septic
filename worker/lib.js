// Shared helpers: responses, hashing, email, Cloudflare Access sign-in check, database schema.
export const JSON_HEAD = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
export const reply = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { ...JSON_HEAD, ...extra } });
export const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
export const list = s => (s || '').split(',').map(x => x.trim()).filter(Boolean);
export const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
export const rand = (n = 32) => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(n)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const id = () => [...crypto.getRandomValues(new Uint8Array(10))].map(b => b.toString(16).padStart(2, '0')).join('');
export const isoIn = ms => new Date(Date.now() + ms).toISOString();
export const siteOrigin = env => list(env.ALLOWED_ORIGINS)[0] || 'https://overwatchseptic.com';
export const originOk = (request, env) => { const o = request.headers.get('origin'); return !!o && list(env.ALLOWED_ORIGINS).includes(o); };
export const getCookie = (request, name) => { for (const p of (request.headers.get('cookie') || '').split(/;\s*/)) { const i = p.indexOf('='); if (i > 0 && p.slice(0, i) === name) return p.slice(i + 1); } return ''; };

// extra: { html, attachments: [{ filename, content (base64) }] }
export async function sendMail(env, to, subject, text, replyTo, extra = {}) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: env.MAIL_FROM, to: [to], ...(replyTo ? { reply_to: replyTo } : {}), subject, text, ...(extra.html ? { html: extra.html } : {}), ...(extra.attachments && extra.attachments.length ? { attachments: extra.attachments } : {}) }) });
    return r.ok;
  } catch { return false; }
}

export async function turnstileOk(env, token) {
  const ts = new FormData(); ts.append('secret', env.TURNSTILE_SECRET); ts.append('response', clean(token, 2048));
  try { return (await (await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: ts })).json()).success === true; } catch { return false; }
}

// Reads a JSON body with a size limit. Returns { body } or { res } (an error response).
export async function readJson(request, max = 16384) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) return { res: reply({ ok: false, error: 'Unsupported request.' }, 415) };
  const raw = await request.text();
  if (raw.length > max) return { res: reply({ ok: false, error: 'Request too large.' }, 413) };
  try { const body = JSON.parse(raw); if (body && typeof body === 'object') return { body }; } catch { /* below */ }
  return { res: reply({ ok: false, error: 'Invalid request.' }, 400) };
}

// ---- Cloudflare Access (the /admin area is also blocked at the edge by an Access application)
const b64u = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); s += '='.repeat((4 - (s.length % 4)) % 4); return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
const keyCache = new Map();
async function accessKeys(team, force) {
  const c = keyCache.get(team);
  if (!force && c && Date.now() - c.at < 600000) return c.keys;
  const r = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error('certs');
  const keys = (await r.json()).keys || [];
  keyCache.set(team, { at: Date.now(), keys });
  return keys;
}
export async function verifyAccess(request, env) {
  const team = env.ACCESS_TEAM_DOMAIN, auds = list(env.ACCESS_AUD), admins = list(env.ADMIN_EMAILS).map(s => s.toLowerCase());
  if (!team || !auds.length || !admins.length || /REPLACE/.test([team, ...auds, ...admins].join())) return 'unconfigured';
  const tok = request.headers.get('cf-access-jwt-assertion');
  if (!tok) return { fail: 'no_access_token' };
  const parts = tok.split('.');
  if (parts.length !== 3) return { fail: 'malformed_token' };
  try {
    const dec = new TextDecoder();
    const head = JSON.parse(dec.decode(b64u(parts[0]))), pay = JSON.parse(dec.decode(b64u(parts[1])));
    if (head.alg !== 'RS256') return { fail: 'bad_algorithm' };
    let jwk = (await accessKeys(team)).find(k => k.kid === head.kid);
    if (!jwk) jwk = (await accessKeys(team, true)).find(k => k.kid === head.kid);
    if (!jwk) return { fail: 'unknown_signing_key' };
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1])))) return { fail: 'bad_signature' };
    const now = Math.floor(Date.now() / 1000);
    if (pay.iss !== `https://${team}`) return { fail: 'wrong_team_domain' };
    if (![].concat(pay.aud || []).some(x => auds.includes(x))) return { fail: 'wrong_audience' };
    if (!pay.exp || pay.exp < now - 30 || (pay.nbf && pay.nbf > now + 30)) return { fail: 'expired' };
    const email = String(pay.email || '').toLowerCase();
    return admins.includes(email) ? { email } : { fail: 'email_not_allowed' };
  } catch { return { fail: 'could_not_verify' }; }
}

// ---- database
export const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', address TEXT NOT NULL, county TEXT NOT NULL DEFAULT '', sys_type TEXT NOT NULL DEFAULT '', permit TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '')",
  'CREATE UNIQUE INDEX IF NOT EXISTS customers_email ON customers (email)',
  "CREATE TABLE IF NOT EXISTS contracts (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL, terms TEXT NOT NULL, text_hash TEXT NOT NULL, owner_token TEXT NOT NULL, expires_at TEXT NOT NULL, owner_name TEXT NOT NULL DEFAULT '', owner_signed_at TEXT NOT NULL DEFAULT '', owner_ip TEXT NOT NULL DEFAULT '', op_name TEXT NOT NULL DEFAULT '', op_signed_at TEXT NOT NULL DEFAULT '', op_by TEXT NOT NULL DEFAULT '')",
  'CREATE INDEX IF NOT EXISTS contracts_customer ON contracts (customer_id)',
  "CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, visit_date TEXT NOT NULL, kind TEXT NOT NULL, readings TEXT NOT NULL DEFAULT '{}', checks TEXT NOT NULL DEFAULT '[]', notes TEXT NOT NULL DEFAULT '', pdf_key TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, created_by TEXT NOT NULL DEFAULT '')",
  'CREATE INDEX IF NOT EXISTS reports_customer ON reports (customer_id, visit_date)',
  'CREATE TABLE IF NOT EXISTS inspections (report_id TEXT PRIMARY KEY, data TEXT NOT NULL, calc TEXT NOT NULL, photos INTEGER NOT NULL DEFAULT 0)',
  "CREATE TABLE IF NOT EXISTS systems (customer_id TEXT PRIMARY KEY, data TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL)",
  'CREATE TABLE IF NOT EXISTS login_tokens (hash TEXT PRIMARY KEY, customer_id TEXT NOT NULL, expires_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0)',
  'CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, customer_id TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS login_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, eh TEXT NOT NULL, ih TEXT NOT NULL)',
  "CREATE TABLE IF NOT EXISTS invoices (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, kind TEXT NOT NULL, ref_id TEXT NOT NULL, amount_cents INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL, created_date TEXT NOT NULL, paid_at TEXT NOT NULL DEFAULT '', release_date TEXT NOT NULL DEFAULT '', released_at TEXT NOT NULL DEFAULT '', stripe_session TEXT NOT NULL DEFAULT '', stripe_pi TEXT NOT NULL DEFAULT '', flag TEXT NOT NULL DEFAULT '', paused INTEGER NOT NULL DEFAULT 0, reminders INTEGER NOT NULL DEFAULT 0, last_reminder_date TEXT NOT NULL DEFAULT '', d15_sent INTEGER NOT NULL DEFAULT 0, notice_state TEXT NOT NULL DEFAULT 'none', notice_sent_at TEXT NOT NULL DEFAULT '', term_date TEXT NOT NULL DEFAULT '', tracking TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '')",
  'CREATE INDEX IF NOT EXISTS invoices_customer ON invoices (customer_id)',
  'CREATE INDEX IF NOT EXISTS invoices_ref ON invoices (ref_id)',
  "CREATE TABLE IF NOT EXISTS report_state (report_id TEXT PRIMARY KEY, released_at TEXT NOT NULL DEFAULT '', county_sent_at TEXT NOT NULL DEFAULT '', county_to TEXT NOT NULL DEFAULT '', token_hash TEXT NOT NULL DEFAULT '', token_exp TEXT NOT NULL DEFAULT '')",
  'CREATE INDEX IF NOT EXISTS report_state_token ON report_state (token_hash)',
  // cases (see cases.js)
  'CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, next INTEGER NOT NULL)',
  "INSERT OR IGNORE INTO counters (name, next) VALUES ('ows', 101), ('p', 101), ('rma', 101)",
  // estimates (see estimates.js)
  "INSERT OR IGNORE INTO counters (name, next) VALUES ('est', 101)",
  "CREATE TABLE IF NOT EXISTS estimates (id TEXT PRIMARY KEY, num INTEGER NOT NULL UNIQUE, customer_id TEXT NOT NULL, contact_id TEXT NOT NULL DEFAULT '', case_id TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', valid_until TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', tax_on INTEGER NOT NULL DEFAULT 0, tax_rate TEXT NOT NULL DEFAULT '7.5', lines TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sent_at TEXT NOT NULL DEFAULT '', accepted_at TEXT NOT NULL DEFAULT '', accepted_name TEXT NOT NULL DEFAULT '', declined_at TEXT NOT NULL DEFAULT '', decline_reason TEXT NOT NULL DEFAULT '', invoice_id TEXT NOT NULL DEFAULT '')",
  'CREATE INDEX IF NOT EXISTS estimates_customer ON estimates (customer_id)',
  "CREATE TABLE IF NOT EXISTS cases (id TEXT PRIMARY KEY, num INTEGER NOT NULL UNIQUE, customer_id TEXT NOT NULL, title TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'Repair follow-up', status TEXT NOT NULL DEFAULT 'Open', due_date TEXT NOT NULL DEFAULT '', county_due TEXT NOT NULL DEFAULT '', county_done TEXT NOT NULL DEFAULT '', owner_due TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', source_ref TEXT NOT NULL DEFAULT '', contact TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, closed_at TEXT NOT NULL DEFAULT '')",
  'CREATE INDEX IF NOT EXISTS cases_customer ON cases (customer_id)',
  "CREATE TABLE IF NOT EXISTS case_items (id TEXT PRIMARY KEY, case_id TEXT NOT NULL, kind TEXT NOT NULL, num INTEGER NOT NULL, title TEXT NOT NULL, vendor TEXT NOT NULL DEFAULT '', part_no TEXT NOT NULL DEFAULT '', po TEXT NOT NULL DEFAULT '', cost TEXT NOT NULL DEFAULT '', eta TEXT NOT NULL DEFAULT '', rma_no TEXT NOT NULL DEFAULT '', tracking TEXT NOT NULL DEFAULT '', credit TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (kind, num))",
  'CREATE INDEX IF NOT EXISTS case_items_case ON case_items (case_id)',
  "CREATE TABLE IF NOT EXISTS case_comments (id TEXT PRIMARY KEY, case_id TEXT NOT NULL, seq INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT 'note', visibility TEXT NOT NULL DEFAULT 'private', channel TEXT NOT NULL DEFAULT 'overwatch', who TEXT NOT NULL DEFAULT '', at TEXT NOT NULL, body TEXT NOT NULL, minutes INTEGER NOT NULL DEFAULT 0, emailed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)",
  'CREATE INDEX IF NOT EXISTS case_comments_case ON case_comments (case_id, seq)',
  // quantity on a part (kept beside case_items so the live table needs no ALTER)
  'CREATE TABLE IF NOT EXISTS case_item_qty (item_id TEXT PRIMARY KEY, qty INTEGER NOT NULL DEFAULT 1)',
  // people on a customer account (cases are opened in a contact's name)
  "CREATE TABLE IF NOT EXISTS customer_contacts (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'Owner', email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', is_primary INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
  'CREATE INDEX IF NOT EXISTS customer_contacts_customer ON customer_contacts (customer_id)',
  'CREATE TABLE IF NOT EXISTS case_contact (case_id TEXT PRIMARY KEY, contact_id TEXT NOT NULL)',
  // a case marked Duplicate points at the case that carries on (same account)
  'CREATE TABLE IF NOT EXISTS case_dup (case_id TEXT PRIMARY KEY, dup_of TEXT NOT NULL)',
  // when a signed agreement was sent, and to whom (the Send signed copy button)
  "CREATE TABLE IF NOT EXISTS contract_sends (id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, sent_at TEXT NOT NULL, who TEXT NOT NULL DEFAULT '', recipients TEXT NOT NULL DEFAULT '[]')",
  // every account has a primary contact: existing customers get one from their own name, email and phone
  "INSERT INTO customer_contacts (id, customer_id, name, role, email, phone, address, notes, is_primary, created_at, updated_at) SELECT lower(hex(randomblob(10))), c.id, c.name, 'Owner', c.email, c.phone, '', '', 1, c.created_at, c.created_at FROM customers c WHERE NOT EXISTS (SELECT 1 FROM customer_contacts x WHERE x.customer_id = c.id)",
  "CREATE TABLE IF NOT EXISTS report_owner_sent (report_id TEXT PRIMARY KEY, sent_at TEXT NOT NULL DEFAULT '')",
  'CREATE TABLE IF NOT EXISTS counties (name TEXT PRIMARY KEY, email TEXT NOT NULL)',
  // County addresses for operator reports, from each county's reply (Oct 2026). Added once; edits and removals in the admin portal stick.
  'CREATE TABLE IF NOT EXISTS seeds (k TEXT PRIMARY KEY)',
  "INSERT OR IGNORE INTO counties (name, email) SELECT 'chatham', 'brad.jones@chathamcountync.gov' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'counties-2026-10')",
  "INSERT OR IGNORE INTO counties (name, email) SELECT 'harnett', 'khinson@harnett.org' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'counties-2026-10')",
  "INSERT OR IGNORE INTO counties (name, email) SELECT 'randolph', 'eh-info@randolphcountync.gov' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'counties-2026-10')",
  "INSERT OR IGNORE INTO counties (name, email) SELECT 'wake', 'ominspect@wake.gov' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'counties-2026-10')",
  "INSERT OR IGNORE INTO seeds (k) VALUES ('counties-2026-10')",
  "INSERT OR IGNORE INTO counties (name, email) SELECT 'lee', 'envhealth@leecountync.gov' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'counties-2026-10-lee')",
  "INSERT OR IGNORE INTO seeds (k) VALUES ('counties-2026-10-lee')",
  "INSERT OR IGNORE INTO counties (name, email) SELECT 'orange', 'ehapplications@orangecountync.gov' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'counties-2026-10-orange')",
  "INSERT OR IGNORE INTO seeds (k) VALUES ('counties-2026-10-orange')",
  "INSERT OR IGNORE INTO counties (name, email) SELECT 'durham', 'healthinspector@dconc.gov' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'counties-2026-10-durham')",
  "INSERT OR IGNORE INTO seeds (k) VALUES ('counties-2026-10-durham')",
  "INSERT OR IGNORE INTO counties (name, email) SELECT 'alamance', 'eh.admin@alamancecountync.gov' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'counties-2026-10-alamance')",
  "INSERT OR IGNORE INTO seeds (k) VALUES ('counties-2026-10-alamance')",
  // contacts: installers, county staff, referrals and leads that are not customers yet
  'CREATE TABLE IF NOT EXISTS contacts (id TEXT PRIMARY KEY, name TEXT NOT NULL, company TEXT NOT NULL DEFAULT \'\', kind TEXT NOT NULL DEFAULT \'Other\', county TEXT NOT NULL DEFAULT \'\', phone TEXT NOT NULL DEFAULT \'\', email TEXT NOT NULL DEFAULT \'\', next_step TEXT NOT NULL DEFAULT \'\', next_date TEXT NOT NULL DEFAULT \'\', notes TEXT NOT NULL DEFAULT \'\', customer_id TEXT NOT NULL DEFAULT \'\', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)',
  "INSERT OR IGNORE INTO contacts (id, name, company, kind, county, phone, email, next_step, next_date, notes, created_at, updated_at) SELECT 'seed00', 'Hunter', 'Lloyd''s Excavation', 'Installer', 'Alamance', '336-338-3287', 'lloydexcavationnc@gmail.com', 'Follow-up email drafted; wants you at start-up', '', '', '2026-10-29T15:00:00Z', '2026-10-29T15:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'contacts-2026-10')",
  "INSERT OR IGNORE INTO contacts (id, name, company, kind, county, phone, email, next_step, next_date, notes, created_at, updated_at) SELECT 'seed01', 'Christy', 'Bobby Davis Septic', 'Installer', 'Durham', '919-481-6929', 'bdjrseptic@gmail.com', 'Call to follow up', '2026-11-04', 'Spoke Oct 28; follow-up email sent', '2026-10-29T15:00:00Z', '2026-10-29T15:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'contacts-2026-10')",
  "INSERT OR IGNORE INTO contacts (id, name, company, kind, county, phone, email, next_step, next_date, notes, created_at, updated_at) SELECT 'seed02', 'Cory', 'Brantley Septic (David Brantley & Sons)', 'Installer', 'Wake', '919-404-9511', 'Cory@brantleyseptic.com', 'Not contacted yet', '', 'Installs; also lists maintenance and inspections', '2026-10-29T15:00:00Z', '2026-10-29T15:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'contacts-2026-10')",
  "INSERT OR IGNORE INTO contacts (id, name, company, kind, county, phone, email, next_step, next_date, notes, created_at, updated_at) SELECT 'seed03', 'Brad Jones', 'Chatham County Environmental Health', 'County', 'Chatham', '919-545-8375', 'brad.jones@chathamcountync.gov', 'Waiting on zone 3 design question (Wilkins)', '', 'Monitoring program specialist', '2026-10-29T15:00:00Z', '2026-10-29T15:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'contacts-2026-10')",
  "INSERT OR IGNORE INTO contacts (id, name, company, kind, county, phone, email, next_step, next_date, notes, created_at, updated_at) SELECT 'seed04', 'Solomon Rosenbluth', 'Durham County Environmental Health', 'County', 'Durham', '984-227-2915', 'srosenbluth@dconc.gov', 'Send contracts and reports to healthinspector@dconc.gov, Attn: Solomon', '', 'Monitoring program specialist; supervisor Patrick Eaton 919-560-7812', '2026-10-29T15:00:00Z', '2026-10-29T15:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'contacts-2026-10')",
  "INSERT OR IGNORE INTO contacts (id, name, company, kind, county, phone, email, next_step, next_date, notes, created_at, updated_at) SELECT 'seed05', 'Ryan Langley', 'Alamance County Environmental Health', 'County', 'Alamance', '336-570-6367 x10330', 'ryan.langley@alamancecountync.gov', 'Send contracts too; reports to eh.admin@alamancecountync.gov', '', 'On-site wastewater supervisor; refers owners to the DEQ contract operator list', '2026-10-29T15:00:00Z', '2026-10-29T15:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'contacts-2026-10')",
  "INSERT OR IGNORE INTO contacts (id, name, company, kind, county, phone, email, next_step, next_date, notes, created_at, updated_at) SELECT 'seed06', 'Bryan Davis', 'Randolph County Environmental Health', 'County', 'Randolph', '336-318-6292', 'bryan.davis@randolphcountync.gov', 'Send signed contracts; reports to him or eh-info@randolphcountync.gov', '', 'Added you to their operator list', '2026-10-29T15:00:00Z', '2026-10-29T15:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'contacts-2026-10')",
  "INSERT OR IGNORE INTO contacts (id, name, company, kind, county, phone, email, next_step, next_date, notes, created_at, updated_at) SELECT 'seed07', 'Andrew Currin', 'Lee County Environmental Health', 'County', 'Lee', '919-718-4641 x5388', 'ancurrin@leecountync.gov', 'Contracts and reports to envhealth@leecountync.gov', '', 'Environmental Health Supervisor', '2026-10-29T15:00:00Z', '2026-10-29T15:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'contacts-2026-10')",
  "INSERT OR IGNORE INTO contacts (id, name, company, kind, county, phone, email, next_step, next_date, notes, created_at, updated_at) SELECT 'seed08', 'Kathryn', 'Orange County Environmental Health', 'County', 'Orange', '', 'khobby@orangecountync.gov', 'Sending the state report template', '', 'Program specialist; contracts and reports to ehapplications@orangecountync.gov', '2026-10-29T15:00:00Z', '2026-10-29T15:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'contacts-2026-10')",
  "INSERT OR IGNORE INTO contacts (id, name, company, kind, county, phone, email, next_step, next_date, notes, created_at, updated_at) SELECT 'seed09', 'Kelley Hinson', 'Harnett County Environmental Health', 'County', 'Harnett', '910-893-7547', 'khinson@harnett.org', 'Reports to her', '', 'Harnett keeps no operator list', '2026-10-29T15:00:00Z', '2026-10-29T15:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'contacts-2026-10')",
  "INSERT OR IGNORE INTO contacts (id, name, company, kind, county, phone, email, next_step, next_date, notes, created_at, updated_at) SELECT 'seed10', 'Ryan', 'Homes Built Bright', 'Referral', 'Chatham', '', 'ryan@homesbuiltbright.com', '', '', 'Neighbor and friend; said he''ll send jobs your way', '2026-10-29T15:00:00Z', '2026-10-29T15:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'contacts-2026-10')",
  "INSERT OR IGNORE INTO seeds (k) VALUES ('contacts-2026-10')",
  "INSERT OR IGNORE INTO contacts (id, name, company, kind, county, phone, email, next_step, next_date, notes, created_at, updated_at) SELECT 'inst00', 'TG Backhoe', 'TG Backhoe, Siler City', 'Installer', 'Chatham', '336-944-1445', 'info@tgbackhoe.com', 'Call to introduce Overwatch', '2026-11-02', 'Installs in Chatham; has a public email', '2026-10-29T17:15:00Z', '2026-10-29T17:15:00Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'contacts-2026-10-installers')",
  "INSERT OR IGNORE INTO contacts (id, name, company, kind, county, phone, email, next_step, next_date, notes, created_at, updated_at) SELECT 'inst01', 'Ricky Holland', 'Precision Septic Systems, Angier', 'Installer', 'Harnett', '919-909-4389', '', 'Call to introduce Overwatch', '2026-11-02', 'Owner; also a licensed plumber; installs and replacements; realtors recommend him', '2026-10-29T17:15:00Z', '2026-10-29T17:15:00Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'contacts-2026-10-installers')",
  "INSERT OR IGNORE INTO contacts (id, name, company, kind, county, phone, email, next_step, next_date, notes, created_at, updated_at) SELECT 'inst02', 'Steven', 'Busy Beez Construction, Zebulon', 'Installer', 'Wake', '919-896-4460', '', 'Call to introduce Overwatch', '2026-11-03', 'Installs new systems, including a Wake pump system with a T&J panel', '2026-10-29T17:15:00Z', '2026-10-29T17:15:00Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'contacts-2026-10-installers')",
  "INSERT OR IGNORE INTO contacts (id, name, company, kind, county, phone, email, next_step, next_date, notes, created_at, updated_at) SELECT 'inst03', 'Jay Adcock', 'Adcock Excavating, Fuquay-Varina', 'Installer', 'Wake', '919-552-6724', '', 'Call to introduce Overwatch', '2026-11-03', 'Installs new systems', '2026-10-29T17:15:00Z', '2026-10-29T17:15:00Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'contacts-2026-10-installers')",
  "INSERT OR IGNORE INTO contacts (id, name, company, kind, county, phone, email, next_step, next_date, notes, created_at, updated_at) SELECT 'inst04', 'EZ Septic Repair & Installation', 'EZ Septic Repair & Installation, Mebane', 'Installer', 'Alamance', '336-639-3554', '', 'Call to introduce Overwatch', '2026-11-04', '', '2026-10-29T17:15:00Z', '2026-10-29T17:15:00Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'contacts-2026-10-installers')",
  "INSERT OR IGNORE INTO contacts (id, name, company, kind, county, phone, email, next_step, next_date, notes, created_at, updated_at) SELECT 'inst05', 'McPherson Septic Tank Systems', 'McPherson Septic Tank Systems, Graham', 'Installer', 'Alamance', '336-226-1918', '', 'Call to introduce Overwatch', '2026-11-04', '', '2026-10-29T17:15:00Z', '2026-10-29T17:15:00Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'contacts-2026-10-installers')",
  "INSERT OR IGNORE INTO contacts (id, name, company, kind, county, phone, email, next_step, next_date, notes, created_at, updated_at) SELECT 'inst06', 'Ingle Dirtworks', 'Ingle Dirtworks, Snow Camp', 'Installer', 'Alamance', '336-269-0369', '', 'Call to introduce Overwatch', '2026-11-05', 'Snow Camp, on the Chatham line', '2026-10-29T17:15:00Z', '2026-10-29T17:15:00Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'contacts-2026-10-installers')",
  "INSERT OR IGNORE INTO contacts (id, name, company, kind, county, phone, email, next_step, next_date, notes, created_at, updated_at) SELECT 'inst07', 'B & L Construction & Septic', 'B & L Construction & Septic Service, Coats', 'Installer', 'Harnett', '910-309-0146', '', 'Call to introduce Overwatch', '2026-11-05', '', '2026-10-29T17:15:00Z', '2026-10-29T17:15:00Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'contacts-2026-10-installers')",
  "INSERT OR IGNORE INTO contacts (id, name, company, kind, county, phone, email, next_step, next_date, notes, created_at, updated_at) SELECT 'inst08', 'Charlie Perrin', 'Charlie Perrin Grading & Septic, Asheboro', 'Installer', 'Randolph', '336-953-7045', '', 'Call to introduce Overwatch', '2026-11-06', '', '2026-10-29T17:15:00Z', '2026-10-29T17:15:00Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'contacts-2026-10-installers')",
  "INSERT OR IGNORE INTO contacts (id, name, company, kind, county, phone, email, next_step, next_date, notes, created_at, updated_at) SELECT 'inst09', 'Rob Hartsell', 'Rob''s Backhoe Services, Aberdeen', 'Installer', 'Moore', '910-638-5519', '', 'Call to introduce Overwatch', '2026-11-06', 'Strong reviews; works closely with county health departments', '2026-10-29T17:15:00Z', '2026-10-29T17:15:00Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'contacts-2026-10-installers')",
  "INSERT OR IGNORE INTO contacts (id, name, company, kind, county, phone, email, next_step, next_date, notes, created_at, updated_at) SELECT 'inst10', 'Clean Septic Tank Services', 'Clean Septic Tank Services, Hillsborough', 'Installer', 'Orange', '919-291-6412', '', 'Call to introduce Overwatch', '2026-11-06', 'Mostly replacements', '2026-10-29T17:15:00Z', '2026-10-29T17:15:00Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'contacts-2026-10-installers')",
  "INSERT OR IGNORE INTO seeds (k) VALUES ('contacts-2026-10-installers')",
  // extra contact fields kept beside the contacts table (repair preferences for installers)
  "CREATE TABLE IF NOT EXISTS contact_extra (contact_id TEXT PRIMARY KEY, repair_prefs TEXT NOT NULL DEFAULT '')",
  'CREATE TABLE IF NOT EXISTS test_customers (customer_id TEXT PRIMARY KEY)',
  "CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, who TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '')",
  // one time: Sean Wilkins cases from Brad Jones's Oct 1, 2026 county report
  "INSERT OR IGNORE INTO cases (id, num, customer_id, title, type, status, due_date, county_due, county_done, owner_due, source, source_ref, contact, description, created_at, updated_at) SELECT '5e1a7c0d2b9f4e6a8c31', (SELECT next FROM counters WHERE name = 'ows'), (SELECT id FROM customers WHERE lower(email) = 'srw134@wilkinshouse.com' LIMIT 1), 'County action items from Oct 1 report', 'County action item', 'Open', '', '', '', '', 'County report', '', '', 'Brad Jones (Chatham EH) monitoring report, Oct 1, 2026. Compliance status: Needs Maintenance. Brad measured a 3.9 gpm dose with all zones off in the panel, so some or all headworks zone valves are stuck open. Zones 1 and 2 measured below design (4.1 vs 5.93 gpm and 3.7 vs 6.3 gpm), which Brad thinks is misleading. Zone 3 was not measured because its field valves could not be found.', '2026-11-02T21:35:00.000Z', '2026-11-02T21:35:00.000Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'cases-wilkins-2026-11') AND (SELECT id FROM customers WHERE lower(email) = 'srw134@wilkinshouse.com' LIMIT 1) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cases WHERE id = '5e1a7c0d2b9f4e6a8c31')",
  "UPDATE counters SET next = next + 1 WHERE name = 'ows' AND NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'cases-wilkins-2026-11') AND EXISTS (SELECT 1 FROM cases WHERE id = '5e1a7c0d2b9f4e6a8c31') AND next = (SELECT num FROM cases WHERE id = '5e1a7c0d2b9f4e6a8c31')",
  "INSERT OR IGNORE INTO case_comments (id, case_id, seq, kind, visibility, channel, who, at, body, minutes, emailed, created_at) SELECT '5e1a7c0d2b9f4e6a8c31e', '5e1a7c0d2b9f4e6a8c31', 1, 'event', 'private', 'system', 'Joshua', '2026-11-02T21:35:00.000Z', 'OWS-' || printf('%05d', (SELECT num FROM cases WHERE id = '5e1a7c0d2b9f4e6a8c31')) || ' opened by Joshua from county report', 0, 0, '2026-11-02T21:35:00.000Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'cases-wilkins-2026-11') AND EXISTS (SELECT 1 FROM cases WHERE id = '5e1a7c0d2b9f4e6a8c31')",
  "INSERT OR IGNORE INTO case_comments (id, case_id, seq, kind, visibility, channel, who, at, body, minutes, emailed, created_at) SELECT '5e1a7c0d2b9f4e6a8c31c0', '5e1a7c0d2b9f4e6a8c31', 2, 'note', 'public', 'overwatch', 'Joshua', '2026-11-02T21:35:00.000Z', 'Action item 1: Open and flush all of the headworks solenoid valves (all zone valves, field flush and filter flush) so each one closes completely when dosing, with no bypass.', 0, 0, '2026-11-02T21:35:00.000Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'cases-wilkins-2026-11') AND EXISTS (SELECT 1 FROM cases WHERE id = '5e1a7c0d2b9f4e6a8c31')",
  "INSERT OR IGNORE INTO case_comments (id, case_id, seq, kind, visibility, channel, who, at, body, minutes, emailed, created_at) SELECT '5e1a7c0d2b9f4e6a8c31c1', '5e1a7c0d2b9f4e6a8c31', 3, 'note', 'public', 'overwatch', 'Joshua', '2026-11-02T21:35:00.000Z', 'Action item 2: Add soil to the eroded area around the headworks valve box to stabilize the components.', 0, 0, '2026-11-02T21:35:00.000Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'cases-wilkins-2026-11') AND EXISTS (SELECT 1 FROM cases WHERE id = '5e1a7c0d2b9f4e6a8c31')",
  "INSERT OR IGNORE INTO case_comments (id, case_id, seq, kind, visibility, channel, who, at, body, minutes, emailed, created_at) SELECT '5e1a7c0d2b9f4e6a8c31c2', '5e1a7c0d2b9f4e6a8c31', 4, 'note', 'public', 'overwatch', 'Joshua', '2026-11-02T21:35:00.000Z', 'Action item 3: Locate and flag the zone 3 field valves for maintenance and inspection.', 0, 0, '2026-11-02T21:35:00.000Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'cases-wilkins-2026-11') AND EXISTS (SELECT 1 FROM cases WHERE id = '5e1a7c0d2b9f4e6a8c31')",
  "INSERT OR IGNORE INTO case_comments (id, case_id, seq, kind, visibility, channel, who, at, body, minutes, emailed, created_at) SELECT '5e1a7c0d2b9f4e6a8c31c3', '5e1a7c0d2b9f4e6a8c31', 5, 'note', 'public', 'overwatch', 'Joshua', '2026-11-02T21:35:00.000Z', 'Action item 4: Submit a current maintenance report to the county. The last report on file is from October 2022.', 0, 0, '2026-11-02T21:35:00.000Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'cases-wilkins-2026-11') AND EXISTS (SELECT 1 FROM cases WHERE id = '5e1a7c0d2b9f4e6a8c31')",
  "INSERT OR IGNORE INTO case_comments (id, case_id, seq, kind, visibility, channel, who, at, body, minutes, emailed, created_at) SELECT '5e1a7c0d2b9f4e6a8c31c4', '5e1a7c0d2b9f4e6a8c31', 6, 'note', 'private', 'overwatch', 'Joshua', '2026-11-02T21:35:00.000Z', 'After the valves close properly, re-measure all three zones against design (zone 1 5.93 gpm, zone 2 6.3 gpm, zone 3 unknown) and record flush flows. Sean''s renewal form says the headworks solenoids were changed out before. Operation permit renewal is done: new permit issued Oct 19, 2026.', 0, 0, '2026-11-02T21:35:00.000Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'cases-wilkins-2026-11') AND EXISTS (SELECT 1 FROM cases WHERE id = '5e1a7c0d2b9f4e6a8c31')",
  "INSERT OR IGNORE INTO cases (id, num, customer_id, title, type, status, due_date, county_due, county_done, owner_due, source, source_ref, contact, description, created_at, updated_at) SELECT '5e1a7c0d2b9f4e6a8c32', (SELECT next FROM counters WHERE name = 'ows'), (SELECT id FROM customers WHERE lower(email) = 'srw134@wilkinshouse.com' LIMIT 1), 'Broken lids and missing pump support block', 'Repair follow-up', 'Open', '', '', '', '', 'County report', '', '', 'From Brad Jones''s Oct 1, 2026 county report. 1720 lift tank: lid handle broken; no support block under the pump. 1718 septic tank: both lids have 2 broken corners. Field dosing tank: one lid corner broken, marked OK for now.', '2026-11-02T21:35:00.000Z', '2026-11-02T21:35:00.000Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'cases-wilkins-2026-11') AND (SELECT id FROM customers WHERE lower(email) = 'srw134@wilkinshouse.com' LIMIT 1) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cases WHERE id = '5e1a7c0d2b9f4e6a8c32')",
  "UPDATE counters SET next = next + 1 WHERE name = 'ows' AND NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'cases-wilkins-2026-11') AND EXISTS (SELECT 1 FROM cases WHERE id = '5e1a7c0d2b9f4e6a8c32') AND next = (SELECT num FROM cases WHERE id = '5e1a7c0d2b9f4e6a8c32')",
  "INSERT OR IGNORE INTO case_comments (id, case_id, seq, kind, visibility, channel, who, at, body, minutes, emailed, created_at) SELECT '5e1a7c0d2b9f4e6a8c32e', '5e1a7c0d2b9f4e6a8c32', 1, 'event', 'private', 'system', 'Joshua', '2026-11-02T21:35:00.000Z', 'OWS-' || printf('%05d', (SELECT num FROM cases WHERE id = '5e1a7c0d2b9f4e6a8c32')) || ' opened by Joshua from county report', 0, 0, '2026-11-02T21:35:00.000Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'cases-wilkins-2026-11') AND EXISTS (SELECT 1 FROM cases WHERE id = '5e1a7c0d2b9f4e6a8c32')",
  "INSERT OR IGNORE INTO case_comments (id, case_id, seq, kind, visibility, channel, who, at, body, minutes, emailed, created_at) SELECT '5e1a7c0d2b9f4e6a8c32c0', '5e1a7c0d2b9f4e6a8c32', 2, 'note', 'public', 'overwatch', 'Joshua', '2026-11-02T21:35:00.000Z', 'Items found on the county''s Oct 1 inspection: the 1720 lift tank lid handle is broken, there is no support block under the 1720 lift tank pump, both 1718 septic tank lids have two broken corners, and one field dosing tank lid corner is broken. Repairs are done by a contractor you choose, with your approval.', 0, 0, '2026-11-02T21:35:00.000Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'cases-wilkins-2026-11') AND EXISTS (SELECT 1 FROM cases WHERE id = '5e1a7c0d2b9f4e6a8c32')",
  "INSERT OR IGNORE INTO customer_contacts (id, customer_id, name, role, email, phone, address, notes, is_primary, created_at, updated_at) SELECT '5e1a7c0d2b9f4e6a8c3s', (SELECT id FROM customers WHERE lower(email) = 'srw134@wilkinshouse.com' LIMIT 1), 'Stacy L. Wilkins', 'Co-owner', '', '', '', 'Named with Sean on the Oct 19, 2026 Operation Permit', 0, '2026-11-02T21:35:00.000Z', '2026-11-02T21:35:00.000Z' WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'cases-wilkins-2026-11') AND (SELECT id FROM customers WHERE lower(email) = 'srw134@wilkinshouse.com' LIMIT 1) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM customer_contacts WHERE customer_id = (SELECT id FROM customers WHERE lower(email) = 'srw134@wilkinshouse.com' LIMIT 1) AND name LIKE 'Stacy%')",
  "INSERT OR IGNORE INTO case_contact (case_id, contact_id) SELECT '5e1a7c0d2b9f4e6a8c31', (SELECT id FROM customer_contacts WHERE customer_id = (SELECT id FROM customers WHERE lower(email) = 'srw134@wilkinshouse.com' LIMIT 1) ORDER BY is_primary DESC, created_at LIMIT 1) WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'cases-wilkins-2026-11') AND EXISTS (SELECT 1 FROM cases WHERE id = '5e1a7c0d2b9f4e6a8c31') AND (SELECT id FROM customer_contacts WHERE customer_id = (SELECT id FROM customers WHERE lower(email) = 'srw134@wilkinshouse.com' LIMIT 1) ORDER BY is_primary DESC, created_at LIMIT 1) IS NOT NULL",
  "UPDATE cases SET contact = (SELECT name FROM customer_contacts WHERE id = (SELECT contact_id FROM case_contact WHERE case_id = '5e1a7c0d2b9f4e6a8c31')) WHERE id = '5e1a7c0d2b9f4e6a8c31' AND NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'cases-wilkins-2026-11') AND EXISTS (SELECT 1 FROM case_contact WHERE case_id = '5e1a7c0d2b9f4e6a8c31')",
  "INSERT OR IGNORE INTO case_contact (case_id, contact_id) SELECT '5e1a7c0d2b9f4e6a8c32', (SELECT id FROM customer_contacts WHERE customer_id = (SELECT id FROM customers WHERE lower(email) = 'srw134@wilkinshouse.com' LIMIT 1) ORDER BY is_primary DESC, created_at LIMIT 1) WHERE NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'cases-wilkins-2026-11') AND EXISTS (SELECT 1 FROM cases WHERE id = '5e1a7c0d2b9f4e6a8c32') AND (SELECT id FROM customer_contacts WHERE customer_id = (SELECT id FROM customers WHERE lower(email) = 'srw134@wilkinshouse.com' LIMIT 1) ORDER BY is_primary DESC, created_at LIMIT 1) IS NOT NULL",
  "UPDATE cases SET contact = (SELECT name FROM customer_contacts WHERE id = (SELECT contact_id FROM case_contact WHERE case_id = '5e1a7c0d2b9f4e6a8c32')) WHERE id = '5e1a7c0d2b9f4e6a8c32' AND NOT EXISTS (SELECT 1 FROM seeds WHERE k = 'cases-wilkins-2026-11') AND EXISTS (SELECT 1 FROM case_contact WHERE case_id = '5e1a7c0d2b9f4e6a8c32')",
  "INSERT OR IGNORE INTO seeds (k) SELECT 'cases-wilkins-2026-11' WHERE EXISTS (SELECT 1 FROM cases WHERE id = '5e1a7c0d2b9f4e6a8c32')",
];
const ready = new WeakMap();
export function ensureSchema(env) {
  if (!ready.has(env.DB)) {
    const p = env.DB.batch(SCHEMA.map(q => env.DB.prepare(q))).catch(e => { ready.delete(env.DB); throw e; });
    ready.set(env.DB, p);
  }
  return ready.get(env.DB);
}
