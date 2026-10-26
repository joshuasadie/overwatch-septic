(function () {
  var $ = OW.$, E = OW.esc, S = { list: [], sel: null, d: null, cfg: null, editing: null };
  $('brand').innerHTML = OW.brand('/');
  var LS = { get: function (k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  var CHECKS = ['Pump and float switches', 'Alarm and control panel', 'Drain field', 'Tank condition'];
  function fail(j) { OW.toast(j.error || 'Something went wrong.'); }

  function loadList() {
    return OW.api('/admin/api/customers').then(function (j) {
      if (j.status === 401) { $('ct').innerHTML = '<tr><td colspan="4" class="bad">You are not signed in. Reload this page and sign in through Cloudflare Access.</td></tr>'; return; }
      if (!j.ok) { $('ct').innerHTML = '<tr><td colspan="4" class="bad">' + E(j.error) + '</td></tr>'; return; }
      S.list = j.customers;
      $('ct').innerHTML = j.customers.map(function (c) { return '<tr class="pick' + (c.id === S.sel ? ' sel' : '') + '" data-id="' + c.id + '" tabindex="0"><td><b>' + E(c.name) + '</b><br><span class="mute">' + E(c.address) + '</span></td><td>' + (c.sys_type ? 'Type ' + E(c.sys_type) : '') + '</td><td>' + OW.pill(c.contract) + '</td><td>' + E(OW.date(c.last_report) || 'None yet') + '</td></tr>'; }).join('') || '<tr><td colspan="4" class="mute">No customers yet. Add the first one.</td></tr>';
    });
  }
  function select(id) { S.sel = id; S.editing = null; $('editor').hidden = true; loadList(); return OW.api('/admin/api/customer/' + id).then(function (j) { if (!j.ok) return fail(j); S.d = j; renderDetail(); $('detail').scrollIntoView({ behavior: 'smooth' }); }); }
  function refresh() { return S.sel ? OW.api('/admin/api/customer/' + S.sel).then(function (j) { if (j.ok) { S.d = j; renderDetail(); } }).then(loadList) : loadList(); }

  function renderDetail() {
    var d = S.d, c = d.customer, open = d.contracts.filter(function (x) { return x.status === 'sent' || x.status === 'owner_signed'; }).length;
    var h = '<div class="grid2"><section class="card"><h2>' + E(c.name) + '</h2><p class="mute" style="margin:0 0 10px">' + [c.email, c.phone, c.county && c.county + ' County', c.permit && 'Permit ' + c.permit].filter(Boolean).map(E).join(' &middot; ') + '<br>' + E(c.address) + '</p>' + (c.notes ? '<p class="mute" style="font-size:14px">' + E(c.notes) + '</p>' : '') +
      '<div class="row"><button class="b" id="bSend"' + (open ? ' title="An agreement is already open"' : '') + '>Send contract</button><button class="b alt" id="bRep">Add visit report</button><button class="b alt" id="bEdit">Edit</button></div>' +
      '<h3 style="margin:16px 0 4px">Contracts</h3><ul class="list">' + (d.contracts.map(function (x) {
        var btns = '<button class="b alt" data-act="view" data-id="' + x.id + '">View</button>';
        if (x.status === 'sent') btns += '<button class="b alt" data-act="resend" data-id="' + x.id + '">Resend link</button>';
        if (x.status === 'owner_signed') btns += '<button class="b" data-act="cs" data-id="' + x.id + '">Sign now</button>';
        if (x.status !== 'complete' && x.status !== 'void') btns += '<button class="b danger" data-act="void" data-id="' + x.id + '">Cancel</button>';
        if (x.status === 'complete') btns += '<button class="b alt" data-act="pdf" data-id="' + x.id + '">PDF</button>';
        return '<li><span><b>Inspection and Maintenance Agreement</b><small>Sent ' + E(OW.date(x.created_at)) + (x.owner.signed_at ? ' &middot; customer signed ' + E(OW.date(x.owner.signed_at)) : '') + (x.contractor.signed_at ? ' &middot; you signed ' + E(OW.date(x.contractor.signed_at)) : '') + '</small></span><span class="row">' + OW.pill(x.status) + btns + '</span></li>';
      }).join('') || '<li class="mute">None yet.</li>') + '</ul>' +
      '<h3 style="margin:16px 0 4px">Reports</h3><ul class="list">' + (d.reports.map(function (r) {
        return '<li><span><b>Visit report, ' + E(OW.date(r.visit_date)) + '</b><small>' + (r.kind === 'upload' ? 'Uploaded PDF' : 'Entered in form') + (r.notes ? ' &middot; ' + E(r.notes.slice(0, 60)) : '') + '</small></span><span class="row"><button class="b alt" data-rep="pdf" data-id="' + r.id + '">PDF</button><button class="b alt" data-rep="mail" data-id="' + r.id + '">Email customer</button><button class="b danger" data-rep="del" data-id="' + r.id + '">Delete</button></span></li>';
      }).join('') || '<li class="mute">None yet.</li>') + '</ul></section>' +
      '<section class="card" id="panel"><h2>Next step</h2><p class="mute">Choose Send contract or Add visit report.</p></section></div>' +
      '<section class="card"><h2>' + E(c.name) + ': readings over time</h2><div class="charts">' + OW.charts(d.reports) + '</div></section>' +
      '<div class="row"><button class="b danger" id="bDel">Delete customer</button></div>';
    $('detail').innerHTML = h;
  }

  function field(id, label, val, extra) { return '<div><label for="' + id + '">' + label + '</label><input id="' + id + '" value="' + E(val || '') + '" ' + (extra || '') + '></div>'; }
  function contractForm() {
    var c = S.d.customer, today = new Date().toISOString().slice(0, 10);
    $('panel').innerHTML = '<h2>New contract</h2><p class="mute" style="margin:0 0 4px">The text is the state sample, unchanged. These fields fill its blanks.</p><form id="kf" novalidate><div class="two">' +
      field('k_contractor', 'Contractor name', LS.get('ow_cn') || 'Overwatch Septic, LLC') + field('k_fee', 'Annual fee ($)', LS.get('ow_fee') || '', 'inputmode="decimal"') +
      field('k_caddr', 'Contractor address', LS.get('ow_ca')) + field('k_health', 'Local health department', LS.get('ow_hd_' + (c.county || '')) || (c.county ? c.county + ' County Environmental Health' : '')) +
      field('k_date', 'Agreement date', today, 'type="date"') + field('k_resp', 'Response time (hours)', '48') + '</div>' +
      '<label for="k_cite">Rule citation (check the current rule number)</label><input id="k_cite" value="15A N.C. Administrative Code 18A.1961"><label for="k_rules">Rules reference</label><input id="k_rules" value="15A N.C. Administrative Code 18A.1900 et seq.">' +
      '<label for="k_maint">Routine maintenance (one per line)</label><textarea id="k_maint" style="min-height:80px">Check the pump and float switches\nCheck the alarm and control panel\nCheck the drain field</textarea>' +
      '<div class="row" style="margin-top:10px"><button class="b" type="submit">Email signing link to ' + E(c.name.split(' ')[0]) + '</button></div><div class="msg" id="km" role="status"></div></form>';
    $('kf').addEventListener('submit', function (e) {
      e.preventDefault(); var v = function (i) { return $(i).value.trim(); };
      var fee = v('k_fee'); if (!fee) { $('km').className = 'msg err'; $('km').textContent = 'Please enter the annual fee.'; return; }
      $('km').className = 'msg'; $('km').textContent = 'Sending...';
      OW.api('/admin/api/contract', { customer_id: c.id, terms: { contractor_name: v('k_contractor'), contractor_address: v('k_caddr'), health_dept: v('k_health'), annual_fee: fee, date: v('k_date'), response_hours: v('k_resp'), cite: v('k_cite'), rules: v('k_rules'), maintenance: v('k_maint').split('\n') } }).then(function (j) {
        if (!j.ok) { $('km').className = 'msg err'; $('km').textContent = j.error; return; }
        LS.set('ow_cn', v('k_contractor')); LS.set('ow_fee', fee); LS.set('ow_ca', v('k_caddr')); LS.set('ow_hd_' + (c.county || ''), v('k_health'));
        OW.toast(j.emailed ? 'Signing link emailed.' : 'Saved, but the email did not send. Use Resend link.'); refresh();
      });
    });
  }
  function reportForm() {
    var today = new Date().toISOString().slice(0, 10);
    $('panel').innerHTML = '<h2>Add visit report</h2><form id="rf" novalidate><label for="r_date">Visit date</label><input id="r_date" type="date" value="' + today + '">' +
      '<h3 style="margin:12px 0 0;font-size:18px">Readings (graphed)</h3><div class="two">' + OW.READINGS.map(function (d) { return '<div><label for="r_' + d.k + '">' + d.t + ' (' + d.u + ')</label><input id="r_' + d.k + '" inputmode="decimal"></div>'; }).join('') + '</div>' +
      '<h3 style="margin:12px 0 0;font-size:18px">Checks</h3>' + CHECKS.map(function (k, i) { return '<div class="row" style="justify-content:space-between;padding:4px 0"><span>' + E(k) + '</span><select id="r_c' + i + '" style="width:auto"><option value="pass">Pass</option><option value="repair">Needs repair</option><option value="na">N/A</option></select></div>'; }).join('') +
      '<label for="r_notes">Notes for the customer</label><textarea id="r_notes" maxlength="1000"></textarea>' +
      '<label for="r_pdf">Or attach a PDF report (stored, not graphed)</label><input id="r_pdf" type="file" accept="application/pdf">' +
      '<label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" id="r_mail" checked> Email the customer when saved</label>' +
      '<div class="row" style="margin-top:10px"><button class="b" type="submit">Save report</button></div><div class="msg" id="rm" role="status"></div></form>';
    $('rf').addEventListener('submit', function (e) {
      e.preventDefault(); var m = $('rm'); m.className = 'msg'; m.textContent = 'Saving...';
      var file = $('r_pdf').files[0], readings = {}; OW.READINGS.forEach(function (d) { readings[d.k] = $('r_' + d.k).value.trim(); });
      if (file && file.size > 6 * 1024 * 1024) { m.className = 'msg err'; m.textContent = 'That PDF is over 6 MB.'; return; }
      OW.api('/admin/api/report', { customer_id: S.sel, visit_date: $('r_date').value, kind: file ? 'upload' : 'form', readings: readings, notes: $('r_notes').value, checks: file ? [] : CHECKS.map(function (k, i) { return { label: k, status: $('r_c' + i).value }; }) }).then(function (j) {
        if (!j.ok) { m.className = 'msg err'; m.textContent = j.error; return; }
        var up = file ? file.arrayBuffer().then(function (b) { return OW.api('/admin/api/reports/' + j.id + '/pdf', b, { raw: true, type: 'application/pdf' }); }) : Promise.resolve({ ok: true });
        return up.then(function (u) {
          if (!u.ok) { m.className = 'msg err'; m.textContent = 'Report saved, but the PDF did not upload: ' + u.error; refresh(); return; }
          var mail = $('r_mail').checked ? OW.api('/admin/api/report-notify', { id: j.id }) : Promise.resolve({ ok: true });
          return mail.then(function (n) { OW.toast(n.ok ? 'Report saved.' : 'Saved, but the email did not send.'); refresh(); });
        });
      });
    });
  }
  function viewContract(x) {
    $('panel').innerHTML = '<h2>Agreement</h2><div class="doc" tabindex="0">' + OW.contractHtml(x.text) + '</div><div class="sigs"><div class="sig"><b>Owner</b><div class="n">' + E(x.owner.name || '') + '&nbsp;</div></div><div class="sig"><b>Contractor</b><div class="n">' + E(x.contractor.signed_at ? x.contractor.name : '') + '&nbsp;</div></div></div>';
  }
  function countersign(x) {
    $('panel').innerHTML = '<h2>Sign as contractor</h2><p class="mute">' + E(x.owner.name) + ' signed ' + E(OW.date(x.owner.signed_at)) + '. Read it once more, then type your name.</p><div class="doc" tabindex="0">' + OW.contractHtml(x.text) + '</div><form id="sf" novalidate><label for="s_nm">Your full name</label><input id="s_nm" value="' + E(x.contractor.name || '') + '"><div class="row" style="margin-top:10px"><button class="b" type="submit">Sign agreement</button></div><div class="msg" id="sm" role="status"></div></form>';
    $('sf').addEventListener('submit', function (e) { e.preventDefault(); OW.api('/admin/api/contract-sign', { id: x.id, name: $('s_nm').value }).then(function (j) { if (!j.ok) { $('sm').className = 'msg err'; $('sm').textContent = j.error; return; } OW.toast('Signed. The customer was emailed.'); refresh(); }); });
  }

  document.addEventListener('click', function (e) {
    var t = e.target, tr = t.closest('tr.pick'); if (tr && !t.closest('button')) return void select(tr.getAttribute('data-id'));
    if (t.id === 'addC') return void editCustomer(null);
    if (t.id === 'bEdit') return void editCustomer(S.d.customer);
    if (t.id === 'bSend') return void contractForm();
    if (t.id === 'bRep') return void reportForm();
    if (t.id === 'bDel') { if (confirm('Delete ' + S.d.customer.name + ' and all their reports?')) OW.api('/admin/api/customer-delete', { id: S.sel }).then(function (j) { if (!j.ok) return fail(j); S.sel = null; S.d = null; $('detail').innerHTML = ''; loadList(); OW.toast('Customer deleted.'); }); return; }
    var a = t.closest('[data-act]'), r = t.closest('[data-rep]');
    if (a) {
      var id = a.getAttribute('data-id'), x = S.d.contracts.filter(function (k) { return k.id === id; })[0], act = a.getAttribute('data-act');
      if (act === 'view') return void viewContract(x);
      if (act === 'cs') return void countersign(x);
      if (act === 'pdf') return void OW.contractPdf(x).then(function (b) { OW.download(b, 'septic-agreement-' + S.d.customer.name.replace(/\W+/g, '-') + '.pdf'); });
      if (act === 'resend') return void OW.api('/admin/api/contract-resend', { id: id }).then(function (j) { j.ok ? OW.toast(j.emailed ? 'New link emailed.' : 'Link made, but the email did not send.') : fail(j); refresh(); });
      if (act === 'void' && confirm('Cancel this agreement? The customer can no longer sign it.')) return void OW.api('/admin/api/contract-void', { id: id }).then(function (j) { j.ok ? OW.toast('Cancelled.') : fail(j); refresh(); });
    }
    if (r) {
      var rid = r.getAttribute('data-id'), k = r.getAttribute('data-rep'), rep = S.d.reports.filter(function (z) { return z.id === rid; })[0];
      if (k === 'pdf') { if (rep.has_pdf) window.open('/admin/api/reports/' + rid + '/pdf', '_blank', 'noopener'); else OW.reportPdf(rep, S.d.customer).then(function (b) { OW.download(b, 'report-' + rep.visit_date + '.pdf'); }); }
      if (k === 'mail') OW.api('/admin/api/report-notify', { id: rid }).then(function (j) { j.ok ? OW.toast('Email sent.') : fail(j); });
      if (k === 'del' && confirm('Delete this report? The customer will no longer see it.')) OW.api('/admin/api/report-delete', { id: rid }).then(function (j) { j.ok ? OW.toast('Deleted.') : fail(j); refresh(); });
    }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Enter') { var tr = e.target.closest && e.target.closest('tr.pick'); if (tr) select(tr.getAttribute('data-id')); } });

  var FIELDS = ['name', 'email', 'phone', 'county', 'address', 'sys', 'permit', 'notes'], KEYS = { sys: 'sys_type' };
  function editCustomer(c) {
    S.editing = c ? c.id : ''; $('editor').hidden = false; $('edT').textContent = c ? 'Edit customer' : 'Add customer'; $('cm').textContent = '';
    FIELDS.forEach(function (f) { $('c_' + f).value = c ? c[KEYS[f] || f] || '' : ''; });
    $('editor').scrollIntoView({ behavior: 'smooth' });
  }
  $('edX').onclick = function () { $('editor').hidden = true; };
  $('cf').addEventListener('submit', function (e) {
    e.preventDefault(); var body = { id: S.editing || undefined }; FIELDS.forEach(function (f) { body[KEYS[f] || f] = $('c_' + f).value; });
    OW.api('/admin/api/customer', body).then(function (j) { if (!j.ok) { $('cm').className = 'msg err'; $('cm').textContent = j.error; return; } $('editor').hidden = true; OW.toast('Saved.'); S.sel = j.id; select(j.id); });
  });
  OW.api('/admin/api/config').then(function (j) { if (j.ok) { S.cfg = j; $('who').textContent = 'Admin portal · ' + j.me; } });
  loadList();
})();
