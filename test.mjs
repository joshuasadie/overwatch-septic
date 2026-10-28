import worker from './worker/index.js';
const sent = []; let tsOk = true;
globalThis.fetch = async (u, o) => {
  u = String(u);
  if (u.includes('turnstile')) return { json: async () => ({ success: tsOk }) };
  if (u.includes('resend.com')) { sent.push(JSON.parse(o.body)); return { ok: true }; }
  throw new Error('unexpected ' + u);
};
const env = { ASSETS: { fetch: async () => new Response('asset') }, TURNSTILE_SECRET: 's', RESEND_API_KEY: 'k', MAIL_TO: 'j@overwatchseptic.com', MAIL_FROM: 'O <j@overwatchseptic.com>', ALLOWED_ORIGINS: 'https://overwatchseptic.com' };
const post = (b, origin = 'https://overwatchseptic.com') => worker.fetch(new Request('https://overwatchseptic.com/api/request', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(b) }), env);
const good = { name: 'Ann Home', address: '12 Oak St, Pittsboro', need: 'alarm', phone: '919-555-1111', email: 'ann@h.com', consent: true, token: 't' };
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log(c ? 'PASS' : 'FAIL', m); };
ok((await worker.fetch(new Request('https://overwatchseptic.com/'), env)).status === 200, 'static passthrough');
ok((await post(good, 'https://evil.com')).status === 403, 'wrong origin refused');
ok((await post({ ...good, need: 'x' })).status === 400, 'bad need');
ok((await post({ ...good, address: 'Oak' })).status === 400, 'address needs number');
ok((await post({ ...good, consent: false })).status === 400, 'consent required');
ok((await post({ ...good, website: 'bot' })).status === 200 && sent.length === 0, 'honeypot silent');
tsOk = false; ok((await post(good)).status === 400 && sent.length === 0, 'turnstile failure refused'); tsOk = true;
const r = await post(good); ok(r.status === 200 && sent.length === 2, 'valid request sends 2 emails');
ok(sent[0].subject.startsWith('[ALARM]') && sent[0].reply_to === 'ann@h.com' && sent[0].text.includes('12 Oak St'), 'owner email has details and reply-to');
ok(sent[1].to[0] === 'ann@h.com' && sent[1].reply_to === 'j@overwatchseptic.com', 'homeowner confirmation');
// call button: the number only comes back after a passed security check
const ph = (b, e = env, origin = 'https://overwatchseptic.com') => worker.fetch(new Request('https://overwatchseptic.com/api/phone', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(b) }), e);
ok((await ph({ token: 't' })).status === 503, 'phone: unavailable without PHONE_NUMBER');
const envP = { ...env, PHONE_NUMBER: '919-525-1455' };
ok((await ph({ token: 't' }, envP, 'https://evil.com')).status === 403, 'phone: wrong origin refused');
tsOk = false; { const r = await ph({ token: 't' }, envP); ok(r.status === 400 && !(await r.text()).includes('525'), 'phone: failed check gets no number'); } tsOk = true;
{ const j = await (await ph({ token: 't' }, envP)).json(); ok(j.ok && j.phone === '919-525-1455' && j.tel === '+19195251455', 'phone: passed check gets the number'); }
{ const html = (await import('node:fs')).readFileSync('site/index.html', 'utf8'); ok(!/525|1455/.test(html) && /data-call/.test(html), 'phone: number is not in the page'); }
console.log(fail ? fail + ' FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
