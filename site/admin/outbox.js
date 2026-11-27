// The outbox: what you save is written to this phone first, then sent.
// With no signal (or an expired sign-in) it waits here and sends when it can. Nothing is dropped:
// an entry leaves the outbox only once the server has it, or when you discard it.
(function () {
  var $ = OW.$, E = OW.esc, DB = null, busy = false, handlers = {}, listeners = [];
  var STORE = 'items';
  function open() {
    if (DB) return Promise.resolve(DB);
    return new Promise(function (ok, no) {
      var r; try { r = indexedDB.open('ow-outbox', 1); } catch (e) { return no(e); }
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE, { keyPath: 'id' }); };
      r.onsuccess = function () { DB = r.result; ok(DB); }; r.onerror = function () { no(r.error); };
    });
  }
  function tx(mode, fn) { return open().then(function (db) { return new Promise(function (ok, no) { var t = db.transaction(STORE, mode), s = t.objectStore(STORE), out = fn(s); t.oncomplete = function () { ok(out && out.result !== undefined ? out.result : out); }; t.onerror = function () { no(t.error); }; }); }); }
  var put = function (x) { return tx('readwrite', function (s) { s.put(x); }); };
  var del = function (id) { return tx('readwrite', function (s) { s.delete(id); }); };
  var all = function () { return tx('readonly', function (s) { return s.getAll(); }).then(function (l) { return (l || []).sort(function (a, b) { return a.created < b.created ? -1 : 1; }); }); };
  var uid = function () { var a = new Uint8Array(16); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); };

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

  function runOne(x) {
    var h = handlers[x.kind]; if (!h) return Promise.resolve('error');
    x.state = 'sending'; x.error = '';
    return put(x).then(function () { return h(x); }).then(function () { return del(x.id).then(function () { emit('sent', x); return 'sent'; }); }, function (e) {
      if (e && e.fatal) { x.state = 'error'; x.error = e.fatal; } else { x.state = 'waiting'; x.why = (e && e.wait) || 'offline'; x.error = WHY[x.why]; }
      x.tries = (x.tries || 0) + 1; x.last = new Date().toISOString();
      return put(x).then(function () { return x.state === 'error' ? 'error' : x.why; });
    });
  }
  // send what is waiting, oldest first. Stops at the first one that cannot go yet (no signal, signed out).
  function run() {
    if (busy) return Promise.resolve(); busy = true;
    return all().then(function (l) {
      return l.filter(function (x) { return x.state !== 'error'; }).reduce(function (p, x) { return p.then(function (stop) { if (stop) return stop; return runOne(x).then(function (r) { return r === 'offline' || r === 'signin' ? r : null; }); }); }, Promise.resolve(null));
    }).catch(function () {}).then(function () { busy = false; draw(); });
  }
  function emit(ev, x) { listeners.forEach(function (f) { try { f(ev, x); } catch (e) {} }); draw(); }

  // add an entry and try to send it at once. Resolves 'sent', 'offline', 'signin', 'server' or 'error' (with x.error).
  function add(kind, fields, label) {
    var x = Object.assign({ id: uid(), kind: kind, label: label, created: new Date().toISOString(), state: 'waiting', photosDone: 0, photos: [] }, fields);
    return put(x).then(function () {
      draw();
      if (busy) return { result: 'queued', item: x };
      busy = true;
      return runOne(x).then(function (r) { busy = false; draw(); if (r === 'sent') run(); return { result: r, item: x }; });
    }, function () { return { result: 'nostore', item: x }; });
  }

  // ---- the pill in the top bar, and the list behind it
  function draw() {
    var pill = $('sync'); if (!pill) return;
    all().then(function (l) {
      var bad = l.filter(function (x) { return x.state === 'error'; }).length, wait = l.length - bad, off = !navigator.onLine;
      pill.className = 'sync ' + (bad ? 'bad' : wait || off ? 'warn' : 'good');
      pill.textContent = bad ? bad + ' need attention' : wait ? (off ? 'Offline · ' : '') + wait + ' waiting to send' : off ? 'Offline · all saved' : 'All saved';
      var p = $('obox'); if (!p || p.hidden) return;
      p.innerHTML = '<div class="row" style="justify-content:space-between"><h3 style="margin:0">Saved on this phone</h3><button class="b alt" type="button" id="obX">Close</button></div>' +
        (l.length ? '<p class="mute" style="margin:4px 0 8px">These are on this phone and have not reached the server yet. Keep the app until they send.</p><ul class="obl">' + l.map(function (x) {
          return '<li><span><b>' + E(x.label) + '</b><small>Saved ' + E(new Date(x.created).toLocaleString()) + (x.photos.length ? ' · ' + x.photosDone + ' of ' + x.photos.length + ' photos sent' : '') + '</small>' +
            (x.error ? '<small class="' + (x.state === 'error' ? 'bad' : 'warn') + '">' + E(x.error) + '</small>' : '') + '</span><span class="row">' +
            (x.why === 'signin' && x.state !== 'error' ? '<a class="b" href="/admin/">Sign in</a>' : '') + '<button class="b alt" type="button" data-ob="retry">Retry</button>' +
            '<button class="b alt" type="button" data-ob="del" data-id="' + E(x.id) + '">Discard</button></span></li>';
        }).join('') + '</ul>' : '<p class="mute">Nothing is waiting. Everything you saved has reached the server.</p>');
    }).catch(function () { pill.className = 'sync bad'; pill.textContent = 'Phone storage is off'; });
  }
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t.id === 'sync') { var p = $('obox'); p.hidden = !p.hidden; draw(); if (!p.hidden) p.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (t.id === 'obX') { $('obox').hidden = true; return; }
    var b = t.closest && t.closest('[data-ob]'); if (!b) return;
    if (b.getAttribute('data-ob') === 'retry') { all().then(function (l) { return Promise.all(l.map(function (x) { if (x.state === 'error') { x.state = 'waiting'; x.error = ''; return put(x); } })); }).then(run); return; }
    // discarding takes two taps: it is the one way something you entered is thrown away
    if (b.getAttribute('data-armed') !== '1') { b.setAttribute('data-armed', '1'); b.textContent = 'Tap again to discard'; b.classList.add('red'); return; }
    del(b.getAttribute('data-id')).then(function () { OW.toast('Discarded from this phone.'); draw(); });
  });
  window.addEventListener('online', run);
  window.addEventListener('offline', draw);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') run(); });
  setInterval(run, 60000);
  // keep this phone's storage from being cleared to make room
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
  window.OWQ = { add: add, run: run, all: all, draw: draw, discard: function (id) { return del(id).then(draw); }, on: function (f) { listeners.push(f); }, WHY: WHY };
  setTimeout(run, 1500);
})();
