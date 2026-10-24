(function () {
  var f = document.getElementById('rf'); if (!f) return;
  var st = document.getElementById('st'), btn = document.getElementById('send');
  var v = function (id) { return document.getElementById(id).value.trim(); };
  var say = function (m, c) { st.textContent = m; st.className = c || ''; };
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var tok = (f.querySelector('[name="cf-turnstile-response"]') || {}).value || '';
    if (!v('n')) return say('Please enter your name.', 'err');
    if (!v('a') || !/\d/.test(v('a'))) return say('Please enter the property address, with the house number.', 'err');
    if ((v('p').match(/\d/g) || []).length < 7) return say('Please enter a phone number.', 'err');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('e'))) return say('Please enter a valid email address.', 'err');
    if (!document.getElementById('c').checked) return say('Please confirm you have read the privacy policy.', 'err');
    if (!tok) return say('Please wait for the security check to finish, then try again.', 'err');
    btn.disabled = true; say('Sending...');
    fetch('/api/request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: v('n'), address: v('a'), need: v('t'), phone: v('p'), email: v('e'), website: v('w'), consent: true, token: tok }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return [r, j]; }); })
      .then(function (x) {
        if (x[0].ok && x[1].ok) { f.reset(); say('Thank you. We got your request and sent you a confirmation email.', 'done'); }
        else say(x[1].error || 'Something went wrong. Please try again.', 'err');
      }, function () { say('We could not reach the server. Please try again.', 'err'); })
      .then(function () { btn.disabled = false; if (window.turnstile) try { turnstile.reset(); } catch (_) {} });
  });
})();
