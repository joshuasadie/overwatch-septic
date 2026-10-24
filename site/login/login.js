(function () {
  var $ = OW.$; $('top').innerHTML = OW.brand('/');
  $('f').addEventListener('submit', function (e) {
    e.preventDefault(); var m = $('msg'); m.className = 'msg';
    var em = $('em').value.trim(), tok = ($('f').querySelector('[name="cf-turnstile-response"]') || {}).value || '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { m.className = 'msg err'; m.textContent = 'Please enter a valid email address.'; return; }
    if (!tok) { m.className = 'msg err'; m.textContent = 'Please wait for the security check to finish, then try again.'; return; }
    $('go').disabled = true; m.textContent = 'Sending...';
    OW.api('/login/api/request', { email: em, token: tok }).then(function (j) {
      if (j.ok) { $('f').hidden = true; m.className = 'msg ok'; m.textContent = ''; var d = document.createElement('p'); d.innerHTML = '<b>Check your email.</b> If that address belongs to a customer, a sign-in link is on its way. It works once and lasts 15 minutes.'; $('f').parentNode.appendChild(d); return; }
      $('go').disabled = false; m.className = 'msg err'; m.textContent = j.error; if (window.turnstile) try { turnstile.reset(); } catch (x) {}
    });
  });
})();
