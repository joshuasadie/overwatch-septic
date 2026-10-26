// Overwatch Septic: static site plus one endpoint, POST /api/request, which emails the request to the owner
// and a confirmation to the homeowner. Nothing is stored.
const JSON_HEAD = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const reply = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { ...JSON_HEAD, ...extra } });
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
const list = s => (s || '').split(',').map(x => x.trim()).filter(Boolean);
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const NEED = { alarm: 'Alarm', operator: 'Septic contract with a subsurface operator' };
const oneLine = s => String(s).replace(/[\r\n]+/g, ' ');

async function send(env, to, subject, text, replyTo) {
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [to], ...(replyTo ? { reply_to: replyTo } : {}), subject, text }),
    });
    return r.ok;
  } catch { return false; }
}

export async function request(req, env) {
  if (req.method !== 'POST') return reply({ ok: false, error: 'Method not allowed.' }, 405, { allow: 'POST' });
  const origin = req.headers.get('origin');
  if (!origin || !list(env.ALLOWED_ORIGINS).includes(origin)) return reply({ ok: false, error: 'Request not allowed.' }, 403);
  if (!(req.headers.get('content-type') || '').includes('application/json')) return reply({ ok: false, error: 'Unsupported request.' }, 415);
  if (!env.TURNSTILE_SECRET || !env.RESEND_API_KEY || !env.MAIL_TO || !env.MAIL_FROM) return reply({ ok: false, error: 'The form is not available right now. Please try again later.' }, 503);
  const raw = await req.text();
  if (raw.length > 4096) return reply({ ok: false, error: 'Message too long.' }, 413);
  let d; try { d = JSON.parse(raw); } catch { return reply({ ok: false, error: 'Invalid request.' }, 400); }
  if (!d || typeof d !== 'object') return reply({ ok: false, error: 'Invalid request.' }, 400);
  if (d.website) return reply({ ok: true }); // honeypot

  const name = clean(d.name, 100), email = clean(d.email, 254), phone = clean(d.phone, 30), address = clean(d.address, 200);
  if (!name) return reply({ ok: false, error: 'Please enter your name.' }, 400);
  if (address.length < 5 || !/\d/.test(address)) return reply({ ok: false, error: 'Please enter the property address, with the house number.' }, 400);
  if (!NEED[d.need]) return reply({ ok: false, error: 'Please choose what you need.' }, 400);
  if (!/^[0-9+().\-\s]{7,30}$/.test(phone) || (phone.match(/\d/g) || []).length < 7) return reply({ ok: false, error: 'Please enter a valid phone number.' }, 400);
  if (!EMAIL.test(email)) return reply({ ok: false, error: 'Please enter a valid email address.' }, 400);
  if (d.consent !== true) return reply({ ok: false, error: 'Please confirm you have read the privacy policy.' }, 400);

  const ts = new FormData(); ts.append('secret', env.TURNSTILE_SECRET); ts.append('response', clean(d.token, 2048));
  let ok = false;
  try { ok = (await (await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: ts })).json()).success === true; } catch { /* failed */ }
  if (!ok) return reply({ ok: false, error: 'The security check did not pass. Please try again.' }, 400);

  const need = NEED[d.need];
  const owner = await send(env, env.MAIL_TO, `[${d.need === 'alarm' ? 'ALARM' : 'Request'}] ${oneLine(name)}`, ['New request from overwatchseptic.com', '', 'Need: ' + need, 'Name: ' + name, 'Phone: ' + phone, 'Email: ' + email, 'Address: ' + address, '', 'Received: ' + new Date().toISOString()].join('\n'), email);
  if (!owner) return reply({ ok: false, error: 'Your request could not be sent. Please try again in a few minutes.' }, 502);
  await send(env, email, 'We received your request', [`Hello ${name},`, '', 'Thank you. Overwatch Septic received your request' + (d.need === 'alarm' ? ' for an alarm' : '') + ' and will contact you.', '', 'If your plans change, reply to this email.', '', 'Overwatch Septic Systems'].join('\n'), env.MAIL_TO);
  return reply({ ok: true });
}

import { adminApi } from './admin.js';
import { loginRequest, loginVerify, portalApi } from './portal.js';
import { tokenApi } from './contracts.js';
import { ensureSchema, originOk, readJson } from './lib.js';

const NO_STORE = r => { const h = new Headers(r.headers); h.set('cache-control', 'no-store'); h.set('x-robots-tag', 'noindex, nofollow'); return new Response(r.body, { status: r.status, headers: h }); };

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    if (pathname === '/api/request') return request(req, env);
    if (pathname.startsWith('/admin/api/')) return adminApi(req, env, pathname);
    if (pathname === '/login/api/request') return loginRequest(req, env);
    if (pathname === '/login/verify') return loginVerify(req, env);
    if (pathname.startsWith('/portal/api/')) return portalApi(req, env, pathname);
    if (pathname.startsWith('/api/contract/')) {
      if (!env.DB) return reply({ ok: false, error: 'Unavailable.' }, 503);
      try { await ensureSchema(env); } catch { return reply({ ok: false, error: 'Unavailable.' }, 503); }
      const r = await tokenApi(req, env, pathname);
      if (r instanceof Response) return r;
      if (!originOk(req, env)) return reply({ ok: false, error: 'Request not allowed.' }, 403);
      const j = await readJson(req, 2048); if (j.res) return j.res;
      const x = await r.sign(j.body.name, j.body.agree);
      return x.error ? reply({ ok: false, error: x.error }, x.status || 400) : reply(x);
    }
    // /c/<token> is the signing page; the page reads the token from its own address.
    if (/^\/c\/[A-Za-z0-9_-]+\/?$/.test(pathname)) return NO_STORE(await env.ASSETS.fetch(new Request(new URL('/c/', req.url), req)));
    return env.ASSETS.fetch(req);
  },
};
