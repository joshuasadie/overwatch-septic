// View-only page: the systems shared with this person. Nothing here can change anything.
(function () {
  var $ = OW.$, E = OW.esc, D = null, S = null;
  $('brand').innerHTML = OW.brand('/');
  var RO = '<span class="ro">View only</span>';
  function tr(k, v) { return v == null || v === '' ? '' : '<tr><td style="width:38%">' + E(k) + '</td><td>' + E(v) + '</td></tr>'; }
  function gpm(x) { return x == null ? 'not on file' : x + ' gpm'; }

  function list() {
    $('sys').hidden = true; $('list').hidden = false;
    $('list').innerHTML = '<div class="row" style="justify-content:space-between"><h2 style="margin:0">Systems shared with you</h2>' + RO + '</div><p class="mute sm">Shared by Josh Klein, Overwatch Septic.</p><ul class="list">' +
      (D.systems.map(function (s) { return '<li><span><b>' + E(s.name) + '</b><small>' + E([s.address, s.sys ? s.sys + (s.zone_word === 'Zone' && s.zones ? ', ' + s.zones + ' zones' : '') : '', s.last_visit ? 'last visit ' + OW.date(s.last_visit) : 'no visits yet'].filter(Boolean).join(' · ')) + '</small></span><button class="b alt" data-open="' + s.id + '">Open</button></li>'; }).join('') || '<li class="mute">Nothing is shared with you right now.</li>') + '</ul>';
  }

  function system() {
    var c = S.customer, y = S.system || {}, p = y.permit || {}, h = '';
    h += '<div class="row" style="justify-content:space-between;align-items:flex-start"><div><a href="#" data-back="1" class="sm">‹ Systems shared with you</a><h2 style="margin:4px 0 0">' + E(c.name) + '</h2><span class="mute">' + E((y.addresses && y.addresses.length ? y.addresses.join(' / ') : c.address) || '') + '</span></div>' + RO + '</div>';
    var permit = tr('System', [p.type || c.sys_type, y.sys_desc].filter(Boolean).join(', ')) + tr('Design flow', y.design_flow ? y.design_flow + ' gallons per day' : '') + tr('County', p.county || c.county) + tr('Bedrooms', p.bedrooms) + tr('Permit issued', p.issued ? OW.date(p.issued) : '') + tr('Permit numbers', [p.ca_no && 'CA ' + p.ca_no, p.ip_no && 'IP ' + p.ip_no, p.other_no].filter(Boolean).join(' · ')) + tr('Installer', y.installer && y.installer.name);
    if (permit) h += '<h3>Permit</h3><table class="vt"><tbody>' + permit + '</tbody></table>';
    var zw = y.zone_word || 'Lateral', zs = y.laterals || [];
    if (zs.length) h += '<h3>' + E(zw) + 's</h3><div class="tw"><table class="vt"><thead><tr><th>' + E(zw) + '</th><th>Length</th>' + (zw === 'Zone' ? '<th>Design dose</th><th>Design flush</th><th>Baseline (in / out psi)</th>' : '<th>Design head</th>') + '</tr></thead><tbody>' +
      zs.map(function (l, i) { return '<tr><td>' + (i + 1) + '</td><td>' + (l.length != null ? E(l.length) + ' ft' : '-') + '</td>' + (zw === 'Zone' ? '<td>' + E(gpm(l.dose_gpm)) + '</td><td>' + E(gpm(l.flush_gpm)) + '</td><td>' + (l.base_in != null ? E(l.base_in + ' / ' + (l.base_out == null ? '-' : l.base_out)) : 'set at first test') + '</td>' : '<td>' + (l.design != null ? E(l.design) : '-') + '</td>') + '</tr>'; }).join('') + '</tbody></table></div>';
    var eq = (y.tanks || []).map(function (t) { return tr(t.name || (t.kind === 'pump' ? 'Pump tank' : 'Septic tank'), [t.gal ? t.gal + ' gal' : '', t.model, t.unit].filter(Boolean).join(' · ') || ' '); }).join('');
    if (eq) h += '<h3>Equipment</h3><table class="vt"><tbody>' + eq + '</tbody></table>';
    var R = S.reports || [];
    h += '<h3>Inspection reports</h3>' + (R.length ? '<table class="vt"><thead><tr><th>Date</th><th>Report</th><th>Result</th></tr></thead><tbody>' + R.map(function (r) {
      var pr = r.insp ? OWI.problems(r.insp.data) : [];
      return '<tr><td>' + E(OW.date(r.visit_date)) + '</td><td>' + (r.insp ? '<a href="#" data-rep="' + r.id + '">County copy</a> · <a href="#" data-pdf="' + r.id + '">PDF</a>' + (r.insp.photos ? ' · ' + r.insp.photos + ' photo' + (r.insp.photos > 1 ? 's' : '') : '') : 'Summary only') + '</td><td>' + (r.insp ? (pr.length ? 'Needs attention: ' + E(pr.map(function (x) { return x.label; }).join('; ')) : 'No problems found') : '') + '</td></tr><tr hidden id="rv_' + r.id + '"><td colspan="3"></td></tr>'; }).join('') + '</tbody></table>' : '<p class="mute">No reports yet. Reports appear here after each visit.</p>');
    h += '<h3>Readings over time</h3>' + (R.length ? '<div class="charts">' + OW.charts(R) + '</div>' : '<p class="mute">Charts fill in from the visits.</p>');
    var K = S.cases || [];
    h += '<h3>Open cases</h3>' + (K.length ? '<table class="vt"><thead><tr><th>Case</th><th>Title</th><th>Status</th></tr></thead><tbody>' + K.map(function (k) {
      return '<tr><td><a href="#" data-case="' + k.id + '">' + E(k.no) + '</a></td><td>' + E(k.title) + '</td><td>' + E(k.status) + '</td></tr><tr hidden id="kv_' + k.id + '"><td colspan="3">' + (k.comments.map(function (m) { return '<div style="padding:6px 0;border-bottom:1px dashed var(--line)"><span class="mute sm">' + E(new Date(m.at).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' })) + ' · ' + E(m.from === 'you' ? 'Customer' : 'Overwatch') + (m.how ? ' · ' + E(m.how) : '') + '</span><div style="white-space:pre-wrap">' + E(m.body) + '</div></div>'; }).join('') || '<span class="mute">No public notes yet.</span>') + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="mute">No open cases.</p>');
    h += '<p class="mute sm" style="margin-top:16px;border-top:1px solid var(--line);padding-top:10px">View only. Nothing on this page can be changed from here.</p>';
    $('sys').innerHTML = h; $('sys').hidden = false; $('list').hidden = true; window.scrollTo(0, 0);
  }
  function rep(id) { return S.reports.filter(function (x) { return x.id === id; })[0]; }
  function cust() { var c = S.customer; return { name: c.name, address: c.address, county: c.county, sys_type: c.sys_type, permit: c.permit }; }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-open],[data-back],[data-rep],[data-pdf],[data-case]'); if (!t) return; e.preventDefault();
    if (t.hasAttribute('data-open')) return void OW.api('/view/api/system/' + t.getAttribute('data-open')).then(function (j) { if (!j.ok) return OW.toast(j.error); S = j; system(); });
    if (t.hasAttribute('data-back')) return list();
    if (t.hasAttribute('data-case')) { var row = $('kv_' + t.getAttribute('data-case')); row.hidden = !row.hidden; return; }
    var r = rep(t.getAttribute('data-rep') || t.getAttribute('data-pdf'));
    if (t.hasAttribute('data-rep')) {
      var box = $('rv_' + r.id); if (!box.hidden) { box.hidden = true; return; }
      var ph = ''; for (var n = 1; n <= (r.insp.photos || 0); n++) ph += '<a href="/view/api/system/' + S.customer.id + '/photo/' + r.id + '/' + n + '" target="_blank" rel="noopener"><img alt="Photo ' + n + '" loading="lazy" src="/view/api/system/' + S.customer.id + '/photo/' + r.id + '/' + n + '"></a>';
      box.firstChild.innerHTML = '<style>' + OWI.CSS + '</style>' + OWI.countyHtml(r, cust(), S.operator) + (ph ? '<div class="ph">' + ph + '</div>' : ''); box.hidden = false; return;
    }
    OW.inspCountyPdf(r, cust(), S.operator, S.system).then(function (b) { OW.download(b, 'county-report-' + r.visit_date + '.pdf'); });
  });
  $('out').onclick = function () { OW.api('/view/api/logout', {}).then(function () { location.href = '/login/'; }); };
  OW.api('/view/api/systems').then(function (j) {
    if (j.status === 401) { location.href = '/login/'; return; }
    if (!j.ok) { $('list').innerHTML = '<p class="mute">' + E(j.error) + '</p>'; return; }
    D = j; $('who').textContent = j.viewer.name + ' · view only'; $('out').hidden = false; list();
  });
})();
