// The outbox: what you save is written to this phone first, then sent.
// With no signal (or an expired sign-in) it waits here and sends when it can. Nothing is dropped:
// an entry leaves the outbox only once the server has it, or when you discard it.
(function () {
  var $ = OW.$, E = OW.esc, Q = window.OWQC, WHY = Q.WHY, listeners = [];
  var put = Q.put, del = Q.del, all = Q.all;
  // ask the phone to send in the background once signal is back (Android Chrome), even with the app closed
  function later() { if ('serviceWorker' in navigator) navigator.serviceWorker.ready.then(function (r) { if (r.sync) return r.sync.register('ow-outbox'); }).catch(function () {}); }
  function run() { return Q.run().then(function (o) { if (o && o.left) later(); }).catch(function () {}).then(draw); }
  function emit(ev, x) { listeners.forEach(function (f) { try { f(ev, x); } catch (e) {} }); draw(); }

  // add an entry and try to send it at once. Resolves { result: 'sent'|'offline'|'signin'|'server'|'error'|'nostore', item }.
  function add(kind, fields, label) {
    var x = Object.assign({ id: Q.uid(), kind: kind, label: label, created: new Date().toISOString(), state: 'waiting', photosDone: 0, photos: [] }, fields);
    return put(x).then(function () {
      draw();
      return Q.lock(function () { return Q.runOne(x.id); }).then(function (r) {
        return Q.get(x.id).then(function (y) {
          if (r === 'sent') { emit('sent', x); run(); } else if (r !== 'error') later();
          draw(); return { result: r, item: y || x };
        });
      });
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
