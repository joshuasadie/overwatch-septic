// Call buttons. The phone number is not in the page: a tap runs a Turnstile check and asks /api/phone for it.
// Without JavaScript the buttons go to the request form.
(function () {
  var links = document.querySelectorAll('[data-call]'); if (!links.length) return;
  var box = document.getElementById('callTs'), msg = document.getElementById('callMsg'), lbl = document.getElementById('callLbl');
  var KEY = '0x4AAAAAAFX7ZOT4oVVptMDK', state = 'idle', wid = null;
  var say = function (m) { if (msg) { msg.textContent = m || ''; msg.hidden = !m; } };
  var label = function (t) { if (lbl) lbl.textContent = t; };
  function fail(m) { state = 'idle'; label('Call us'); say(m || 'That did not work. Please try again, or use the request form below.'); }
  function shown(j) {
    state = 'done'; say('');
    links.forEach(function (a) { a.href = 'tel:' + j.tel; var n = a.querySelector('[data-num]'); if (n) n.textContent = n.getAttribute('data-num') + j.phone; });
    label(j.phone);
  }
  function ask(token) {
    fetch('/api/phone', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: token }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.ok) shown(j); else fail(j && j.error); })
      .catch(function () { fail(); });
  }
  function withTurnstile(fn, tries) {
    if (window.turnstile) return fn();
    if ((tries || 0) > 50) return fail('The security check did not load. Please use the request form below.');
    setTimeout(function () { withTurnstile(fn, (tries || 0) + 1); }, 200);
  }
  function start(e) {
    if (state === 'done') return; // the link is now tel:, so let the tap place the call
    e.preventDefault();
    if (state === 'busy') return;
    state = 'busy'; label('Checking…'); say('');
    withTurnstile(function () {
      try {
        if (wid === null) wid = turnstile.render(box, { sitekey: KEY, appearance: 'interaction-only', theme: 'auto', callback: ask, 'error-callback': function () { fail(); }, 'expired-callback': function () {} });
        else turnstile.reset(wid);
      } catch (_) { fail(); }
    });
  }
  links.forEach(function (a) { a.addEventListener('click', start); });
})();
