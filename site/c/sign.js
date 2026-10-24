(function () {
  var $ = OW.$, token = location.pathname.replace(/^\/c\//, '').replace(/\/$/, ''), c = null;
  $('top').innerHTML = OW.brand('/');
  function show(c) {
    $('state').hidden = true; $('docCard').hidden = false;
    $('doc').innerHTML = OW.contractHtml(c.text);
    $('sigs').innerHTML = '<div class="sig"><b>Owner</b><div class="n">' + (c.owner.name ? OW.esc(c.owner.name) : '&nbsp;') + '</div><small class="mute">' + OW.esc(c.owner_label) + (c.owner.signed_at ? ' &middot; ' + OW.date(c.owner.signed_at) : '') + '</small></div>' +
      '<div class="sig"><b>Contractor</b><div class="n">' + (c.contractor.signed_at ? OW.esc(c.contractor.name) : '&nbsp;') + '</div><small class="mute">' + OW.esc(c.contractor_label) + (c.contractor.signed_at ? ' &middot; ' + OW.date(c.contractor.signed_at) : '') + '</small></div>';
    $('signCard').hidden = c.status !== 'sent';
    if (c.status !== 'sent') done(c);
  }
  function done(c) {
    var a = $('after'); a.hidden = false;
    a.innerHTML = '<h2>' + (c.status === 'complete' ? 'This agreement is fully signed' : c.status === 'void' ? 'This agreement was cancelled' : 'Thank you, you have signed') + '</h2>' +
      (c.status === 'owner_signed' ? '<p>Overwatch Septic will sign next. You will get an email when it is done, and the signed copy will be in your customer portal.</p>' : '') +
      '<div class="row">' + (c.status !== 'void' ? '<button class="b alt" id="pdf">Download PDF</button>' : '') + '<a class="b" href="/login/">Go to your customer portal</a></div>';
    var p = $('pdf'); if (p) p.onclick = function () { OW.contractPdf(c).then(function (b) { OW.download(b, 'septic-agreement.pdf'); }); };
  }
  OW.api('/api/contract/' + encodeURIComponent(token)).then(function (j) {
    if (!j.ok) { $('state').innerHTML = '<h2>This link did not work</h2><p>' + OW.esc(j.error || 'Please ask us to send a new one.') + '</p><p><a href="/#request">Contact Overwatch Septic</a></p>'; return; }
    if (j.expired) { $('state').innerHTML = '<h2>This link has expired</h2><p>Please ask us to send a new one. If you already have a customer portal account you can <a href="/login/">sign in</a>.</p>'; return; }
    c = j.contract; show(c);
  });
  $('f').addEventListener('submit', function (e) {
    e.preventDefault(); var m = $('msg'); m.className = 'msg'; m.textContent = '';
    if ($('nm').value.trim().length < 3) { m.className = 'msg err'; m.textContent = 'Please type your full name.'; return; }
    if (!$('ag').checked) { m.className = 'msg err'; m.textContent = 'Please confirm that you have read and agree.'; return; }
    $('go').disabled = true; m.textContent = 'Signing...';
    OW.api('/api/contract/' + encodeURIComponent(token) + '/sign', { name: $('nm').value.trim(), agree: true }).then(function (j) {
      if (!j.ok) { $('go').disabled = false; m.className = 'msg err'; m.textContent = j.error; return; }
      OW.api('/api/contract/' + encodeURIComponent(token)).then(function (g) { if (g.ok) { c = g.contract; show(c); $('signCard').hidden = true; window.scrollTo(0, 0); } });
    });
  });
})();
