(function () {
  var $ = OW.$, D = null, cur = null;
  $('brand').innerHTML = OW.brand('/');
  function render() {
    var c = D.customer;
    $('who').textContent = c.email; $('out').hidden = false;
    $('hello').innerHTML = '<h2>Welcome, ' + OW.esc(c.name.split(' ')[0]) + '</h2><p class="mute" style="margin:0">' + OW.esc(c.address) + (c.sys_type ? ' &middot; Type ' + OW.esc(c.sys_type) + ' system' : '') + '</p>';
    var need = D.contracts.filter(function (x) { return x.status === 'sent'; });
    $('todo').innerHTML = need.map(function (x) { return '<div class="alert"><span><b>One agreement needs your signature.</b><br><span class="mute">Inspection and Maintenance Agreement, sent ' + OW.esc(OW.date(x.created_at)) + '</span></span><button class="b" data-open="' + x.id + '">Review and sign</button></div>'; }).join('');
    $('cl').innerHTML = D.contracts.map(function (x) { return '<li><span><b>Inspection and Maintenance Agreement</b><small>' + (x.owner.signed_at ? 'Signed by you ' + OW.esc(OW.date(x.owner.signed_at)) : 'Sent ' + OW.esc(OW.date(x.created_at))) + (x.contractor.signed_at ? ' &middot; by us ' + OW.esc(OW.date(x.contractor.signed_at)) : '') + '</small></span><span class="row">' + OW.pill(x.status, true) + '<button class="b alt" data-open="' + x.id + '">' + (x.status === 'sent' ? 'Sign' : 'View') + '</button></span></li>'; }).join('') || '<li class="mute">No agreements yet.</li>';
    $('rl').innerHTML = D.reports.map(function (r) {
      var bad = (r.checks || []).filter(function (k) { return k.status === 'repair'; }).length;
      return '<li><span><b>Visit report, ' + OW.esc(OW.date(r.visit_date)) + '</b><small>' + (bad ? bad + ' item' + (bad > 1 ? 's' : '') + ' need a licensed contractor' : (r.checks || []).length ? 'All checks passed' : 'Report') + '</small></span><button class="b alt" data-rep="' + r.id + '">PDF</button></li>';
    }).join('') || '<li class="mute">Reports from your visits will show up here.</li>';
    $('ch').innerHTML = OW.charts(D.reports);
  }
  function openContract(id) {
    cur = D.contracts.filter(function (x) { return x.id === id; })[0]; if (!cur) return;
    $('viewer').hidden = false; $('doc').innerHTML = OW.contractHtml(cur.text);
    $('sigs').innerHTML = '<div class="sig"><b>Owner</b><div class="n">' + (cur.owner.name ? OW.esc(cur.owner.name) : '&nbsp;') + '</div><small class="mute">' + OW.esc(cur.owner_label) + (cur.owner.signed_at ? ' &middot; ' + OW.esc(OW.date(cur.owner.signed_at)) : '') + '</small></div><div class="sig"><b>Contractor</b><div class="n">' + (cur.contractor.signed_at ? OW.esc(cur.contractor.name) : '&nbsp;') + '</div><small class="mute">' + OW.esc(cur.contractor_label) + (cur.contractor.signed_at ? ' &middot; ' + OW.esc(OW.date(cur.contractor.signed_at)) : '') + '</small></div>' + '<div class="row"><button class="b alt" id="cpdf">Download PDF</button></div>';
    $('cpdf').onclick = function () { OW.contractPdf(cur).then(function (b) { OW.download(b, 'septic-agreement.pdf'); }); };
    $('sf').hidden = cur.status !== 'sent'; $('msg').textContent = '';
    $('viewer').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  document.addEventListener('click', function (e) {
    var o = e.target.closest('[data-open]'); if (o) return openContract(o.getAttribute('data-open'));
    var r = e.target.closest('[data-rep]'); if (!r) return;
    var rep = D.reports.filter(function (x) { return x.id === r.getAttribute('data-rep'); })[0];
    if (rep.has_pdf) { window.open('/portal/api/reports/' + rep.id + '/pdf', '_blank', 'noopener'); return; }
    OW.reportPdf(rep, D.customer).then(function (b) { OW.download(b, 'report-' + rep.visit_date + '.pdf'); });
  });
  $('close').onclick = function () { $('viewer').hidden = true; };
  $('out').onclick = function () { OW.api('/portal/api/logout', {}).then(function () { location.href = '/login/'; }); };
  $('sf').addEventListener('submit', function (e) {
    e.preventDefault(); var m = $('msg'); m.className = 'msg';
    if ($('nm').value.trim().length < 3) { m.className = 'msg err'; m.textContent = 'Please type your full name.'; return; }
    if (!$('ag').checked) { m.className = 'msg err'; m.textContent = 'Please confirm that you have read and agree.'; return; }
    $('go').disabled = true; m.textContent = 'Signing...';
    OW.api('/portal/api/contracts/' + cur.id + '/sign', { name: $('nm').value.trim(), agree: true }).then(function (j) {
      $('go').disabled = false;
      if (!j.ok) { m.className = 'msg err'; m.textContent = j.error; return; }
      OW.toast('Signed. Thank you.'); load(cur.id);
    });
  });
  function load(reopen) {
    OW.api('/portal/api/me').then(function (j) {
      if (j.status === 401) { location.href = '/login/'; return; }
      if (!j.ok) { $('hello').innerHTML = '<p class="bad">' + OW.esc(j.error) + '</p>'; return; }
      D = j; render(); if (reopen) openContract(reopen); else $('viewer').hidden = true;
    });
  }
  load();
})();
