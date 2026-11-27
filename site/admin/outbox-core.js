// The outbox's sending, shared by the app page and its service worker, so waiting entries can send
// from either: from the page while it is open, and in the background (Android Chrome) once signal returns.
// Both take the same lock, so an entry is never sent by both at once; resending is safe anyway.
(function (G) {
  var DB = null, STORE = 'items', handlers = {};
  function open() {
    if (DB) return Promise.resolve(DB);
    return new Promise(function (ok, no) {
      var r; try { r = indexedDB.open('ow-outbox', 1); } catch (e) { return no(e); }
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE, { keyPath: 'id' }); };
      r.onsuccess = function () { DB = r.result; DB.onversionchange = function () { DB.close(); DB = null; }; ok(DB); }; r.onerror = function () { no(r.error); };
    });
  }
  function tx(mode, fn) { return open().then(function (db) { return new Promise(function (ok, no) { var t = db.transaction(STORE, mode), s = t.objectStore(STORE), out = fn(s); t.oncomplete = function () { ok(out && out.result !== undefined ? out.result : out); }; t.onerror = function () { no(t.error); }; }); }); }
  var put = function (x) { return tx('readwrite', function (s) { s.put(x); }); };
  var del = function (id) { return tx('readwrite', function (s) { s.delete(id); }); };
  var get = function (id) { return tx('readonly', function (s) { return s.get(id); }); };
  var all = function () { return tx('readonly', function (s) { return s.getAll(); }).then(function (l) { return (l || []).sort(function (a, b) { return a.created < b.created ? -1 : 1; }); }); };
  var uid = function () { var a = new Uint8Array(16); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); };
  var busy = false;
  // one sender at a time across the page and the service worker
  function lock(fn) {
    if (G.navigator && navigator.locks && navigator.locks.request) return navigator.locks.request('ow-outbox', fn);
    if (busy) return Promise.resolve('busy'); busy = true;
    return Promise.resolve().then(fn).then(function (r) { busy = false; return r; }, function (e) { busy = false; throw e; });
  }

  // one request. Anything but a clear answer from the server is "try again later", never a loss.
  //   resolves the parsed answer; rejects {wait: 'offline'|'signin'|'server'} or {fatal: message}
  function send(url, body, type) {
    var init = { method: 'POST', credentials: 'same-origin', redirect: 'manual', headers: { 'content-type': type || 'application/json' }, body: type ? body : JSON.stringify(body) };
    return fetch(url, init).catch(function () { throw { wait: 'offline' }; }).then(function (r) {
      if (r.type === 'opaqueredirect' || r.status === 0 || r.status === 401 || r.status === 403) throw { wait: 'signin' };
      return r.json().catch(function () { return null; }).then(function (j) {
        if (!j) throw { wait: r.status >= 500 ? 'server' : 'signin' };
        if (r.ok && j.ok) return j;
        if (r.status >= 500 || r.status === 429) throw { wait: 'server', msg: j.error };
        throw { fatal: j.error || 'The server did not accept this.' };
      });
    });
  }
  var WHY = { offline: 'No signal. It will send when you have one.', signin: 'Your sign-in has expired. Sign in again to send it.', server: 'The server did not answer. It will try again.' };

  // an inspection: the form, then its photos one at a time. Each step is remembered, so a resend picks up where it stopped.
  handlers.inspection = function (x) {
    var step = x.rid ? Promise.resolve() : send('/admin/api/inspection', { client_id: x.id, customer_id: x.customer_id, visit_date: x.visit_date, data: x.data, system: x.system }).then(function (j) { x.rid = j.id; return put(x); });
    return step.then(function next() {
      if (x.photosDone >= x.photos.length) return;
      return send('/admin/api/reports/' + x.rid + '/photo?n=' + (x.photosDone + 1), x.photos[x.photosDone], 'image/jpeg').then(function () { x.photosDone++; return put(x).then(next); });
    });
  };

  // send one entry, read fresh (the other sender may have sent it meanwhile).
  // resolves 'sent', 'offline', 'signin', 'server' or 'error'
  function runOne(id) {
    return get(id).then(function (x) {
      if (!x) return 'sent';
      var h = handlers[x.kind]; if (!h) return 'error';
      x.state = 'sending'; x.error = '';
      return put(x).then(function () { return h(x); }).then(function () { return del(x.id).then(function () { return 'sent'; }); }, function (e) {
        if (e && e.fatal) { x.state = 'error'; x.error = e.fatal; } else { x.state = 'waiting'; x.why = (e && e.wait) || 'offline'; x.error = WHY[x.why]; }
        x.tries = (x.tries || 0) + 1; x.last = new Date().toISOString();
        return put(x).then(function () { return x.state === 'error' ? 'error' : x.why; });
      });
    });
  }
  // send what is waiting, oldest first; stops at the first that cannot go yet. Resolves { stop, left }.
  function run() {
    return lock(function () {
      return all().then(function (l) {
        return l.filter(function (x) { return x.state !== 'error'; }).reduce(function (p, x) { return p.then(function (stop) { if (stop) return stop; return runOne(x.id).then(function (r) { return r === 'offline' || r === 'signin' || r === 'server' ? r : null; }); }); }, Promise.resolve(null));
      }).then(function (stop) { return all().then(function (l) { return { stop: stop, left: l.filter(function (x) { return x.state !== 'error'; }).length }; }); });
    });
  }
  G.OWQC = { put: put, del: del, get: get, all: all, uid: uid, lock: lock, runOne: runOne, run: run, WHY: WHY };
})(self);
