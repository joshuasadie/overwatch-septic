// Lets the admin app open and work with no signal.
// Pages, scripts and the data you last loaded are kept on the phone. With signal, the network always wins,
// so you never see stale data while connected; with none, the last copy is used.
// Saving does not go through here: that is the outbox (outbox.js), which keeps your entries until the server has them.
importScripts('/admin/outbox-core.js');
var CACHE = 'ow-admin-v2';
var SHELL = ['/admin/', '/admin/admin.js', '/admin/outbox.js', '/admin/outbox-core.js', '/admin/inspection.js', '/admin/cases.js', '/admin/estimates.js', '/admin/viewers.js', '/admin/bills.js', '/admin/tank-list.json',
  '/ow.js', '/ow.css', '/inspect-core.js', '/inspect-view.js', '/vendor/pdf-lib.min.js', '/favicon.svg', '/logo-pdf.png', '/icons/app-192.png'];
var WAIT = 6000; // on a weak signal, give up on the network after this and use the copy on the phone

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(SHELL.map(function (u) { return fetch(u, { credentials: 'same-origin', redirect: 'manual' }).then(function (r) { if (r.ok && r.type === 'basic') return c.put(u, r); }).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});

// the same data for any day: the form's "date=" only shapes which visit counts as the last one
function key(url) { var u = new URL(url); if (u.pathname === '/admin/api/system') u.searchParams.delete('date'); return u.toString(); }

function fresh(req, k) {
  return new Promise(function (ok, no) {
    var done = false, t = setTimeout(function () { if (!done) { done = true; no(new Error('slow')); } }, WAIT);
    fetch(req).then(function (r) {
      if (!done) { done = true; clearTimeout(t); ok(r); }
      // keep a copy only of a real answer for a signed-in page, never of a sign-in redirect or an error
      if (r.ok && r.type === 'basic' && !r.redirected) { var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(k, copy); }); }
    }, function (err) { if (!done) { done = true; clearTimeout(t); no(err); } });
  });
}
function fallback(k) { return caches.open(CACHE).then(function (c) { return c.match(k); }); }

self.addEventListener('fetch', function (e) {
  var req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== self.location.origin) return;
  // pages: the network first (so a sign-in redirect still reaches you), the app's own page when offline
  if (req.mode === 'navigate') {
    if (!u.pathname.startsWith('/admin/')) return;
    e.respondWith(fresh(req, '/admin/').catch(function () { return fallback('/admin/').then(function (r) { return r || Response.error(); }); }));
    return;
  }
  // photos are large and not needed offline
  if (/\/photo\//.test(u.pathname)) return;
  var k = key(req.url), api = u.pathname.startsWith('/admin/api/');
  // a data request turned away to the sign-in page means the sign-in expired: say so, instead of looking offline
  var net = api ? fresh(new Request(req, { redirect: 'manual' }), k).then(function (r) { return r.type === 'opaqueredirect' ? new Response(JSON.stringify({ ok: false, signin: true, error: 'Your sign-in has expired. Close and reopen the app to sign in again.' }), { status: 401, headers: { 'content-type': 'application/json' } }) : r; }) : fresh(req, k);
  e.respondWith(net.catch(function () {
    return fallback(k).then(function (r) {
      if (r) return r;
      if (api) return new Response(JSON.stringify({ ok: false, offline: true, error: 'No signal, and this has not been opened on this phone before.' }), { status: 503, headers: { 'content-type': 'application/json' } });
      return Response.error();
    });
  }));
});

// background sending (Android Chrome): the phone wakes this when signal returns, even with the app closed.
// If something is still waiting because there is no signal or the server did not answer, ask to be woken again.
self.addEventListener('sync', function (e) {
  if (e.tag !== 'ow-outbox') return;
  e.waitUntil(self.OWQC.run().then(function (o) { if (o && o.left && o.stop !== 'signin') throw new Error('still waiting'); }));
});
