// Estimates on the customer page: list, editor (your cost and markup stay private), preview, send, PDF, invoice.
(function () {
  var A = window.OWA, $ = OW.$, E = OW.esc, d2 = OW.d2, cur = null;
  var TYPES = { part: 'Part', labor: 'Labor', other: 'Other', free: 'No charge' };
  var NOTE = 'Repairs are done only with your approval. You may choose who does the work. Prices for parts may change if a supplier raises them before the work is done.';
  var ST = { draft: ['Draft', 'mute'], sent: ['Sent', 'warn'], accepted: ['Accepted', 'good'], declined: ['Declined', 'bad'], invoiced: ['Invoiced', 'good'], void: ['Void', 'mute'] };
  function msg(id, t, bad) { var m = $(id); if (m) { m.className = 'msg' + (bad ? ' err' : ''); m.textContent = t; } }
  function r2(x) { return Math.round(x * 100) / 100; }
  function price(l) { var q = Number(l.qty) || 0; l.unit = l.type === 'part' ? r2((Number(l.cost) || 0) * (1 + (Number(l.markup) || 0) / 100)) : l.type === 'labor' ? r2(Number(l.rate) || 0) : l.type === 'other' ? r2(Number(l.unit) || 0) : 0; l.amount = r2(q * l.unit); return l; }
  function sums(e) { var sub = 0, parts = 0; e.lines.forEach(function (l) { price(l); sub += l.amount; if (l.type === 'part') parts += l.amount; }); var tax = e.tax_on ? r2(parts * (Number(e.tax_rate) || 0) / 100) : 0; e.subtotal = r2(sub); e.tax = tax; e.total = r2(sub + tax); return e; }

  A.estList = function (d) {
    var L = d.estimates || [];
    return '<h3 style="margin:16px 0 4px">Estimates</h3><ul class="list">' + (L.map(function (e) {
      var st = ST[e.status] || [e.status, 'mute'];
      return '<li><span><b>' + E(e.no) + ' ' + E(e.title) + '</b><small>' + d2(e.total) + (e.case_no ? ' &middot; ' + E(e.case_no) : '') + (e.status === 'accepted' ? ' &middot; accepted by ' + E(e.accepted_name) + ' ' + E(OW.date(e.accepted_at)) : e.status === 'declined' ? ' &middot; declined ' + E(OW.date(e.declined_at)) + (e.decline_reason ? ': ' + E(e.decline_reason) : '') : e.sent_at ? ' &middot; sent ' + E(OW.date(e.sent_at)) : '') + (e.expired ? ' &middot; <span class="bad">expired</span>' : '') + '</small></span><span class="row"><span class="pill ' + st[1] + '">' + st[0] + '</span><button class="b alt" data-est="' + e.id + '">' + (e.status === 'draft' || e.status === 'sent' ? 'Open' : 'View') + '</button></span></li>';
    }).join('') || '<li class="mute">None yet.</li>') + '</ul><div class="row" style="margin-top:6px"><button class="b alt" type="button" data-est-new="1">New estimate</button></div>';
  };
  function blank(caseId) {
    var d = A.S.d, def = d.est_defaults || { rate: 150, markup: 30, valid_until: '' }, prim = (d.people || []).filter(function (p) { return p.primary; })[0] || {};
    var k = caseId && (d.cases || []).filter(function (x) { return x.id === caseId; })[0];
    return { id: '', no: 'New estimate', status: 'draft', title: k ? k.title : '', contact_id: prim.id || '', case_id: caseId || '', valid_until: def.valid_until, notes: NOTE, tax_on: false, tax_rate: '7', created_at: new Date().toISOString(), lines: [{ type: 'part', desc: '', qty: 1, cost: '', markup: def.markup }, { type: 'labor', desc: '', qty: 1, rate: def.rate }] };
  }
  A.newEstimate = function (caseId) { cur = blank(caseId); draw(); };
  function open(id) { OW.api('/admin/api/estimate/' + id).then(function (j) { if (!j.ok) return OW.toast(j.error); cur = j.estimate; draw(); }); }
  function editable() { return cur.status === 'draft' || cur.status === 'sent'; }
  function lineRow(l, i) {
    var ro = !editable(), dis = ro ? ' disabled' : '', inp = function (k, v, cls, ph) { return '<input class="' + (cls || 'n') + '" data-l="' + i + '" data-k="' + k + '" value="' + E(v == null ? '' : v) + '" inputmode="decimal"' + (ph ? ' placeholder="' + ph + '"' : '') + dis + '>'; };
    var mid = l.type === 'part' ? '<td>' + inp('cost', l.cost, 'n', '0.00') + '</td><td>' + inp('markup', l.markup, 'n') + '</td>' : l.type === 'labor' ? '<td>' + inp('rate', l.rate, 'n') + '</td><td class="mute" style="font-size:13px">$/h</td>' : l.type === 'other' ? '<td>' + inp('unit', l.unit, 'n', '0.00') + '</td><td></td>' : '<td></td><td></td>';
    return '<tr><td><select data-l="' + i + '" data-k="type"' + dis + '>' + Object.keys(TYPES).map(function (t) { return '<option value="' + t + '"' + (t === l.type ? ' selected' : '') + '>' + TYPES[t] + '</option>'; }).join('') + '</select></td><td><textarea data-l="' + i + '" data-k="desc" maxlength="240" aria-label="Description" placeholder="Description"' + dis + '>' + E(l.desc) + '</textarea></td><td>' + (l.type === 'free' ? '' : inp('qty', l.qty)) + '</td>' + mid + '<td class="r" data-amt="' + i + '">' + (l.type === 'free' ? 'No charge' : d2(l.amount)) + '</td><td>' + (ro ? '' : '<button class="b alt" type="button" data-ldel="' + i + '" aria-label="Remove line" style="padding:2px 9px;min-height:0">×</button>') + '</td></tr>';
  }
  function totalsHtml() { return '<div class="esttot"><div><span>Subtotal</span><b>' + d2(cur.subtotal) + '</b></div><div style="align-items:center"><span style="display:flex;align-items:center;gap:6px;white-space:nowrap"><input type="checkbox" id="es_tax" style="width:auto;min-height:0;margin:0"' + (cur.tax_on ? ' checked' : '') + (editable() ? '' : ' disabled') + '><label for="es_tax" style="margin:0;font-weight:400">Sales tax on parts</label><input id="es_rate" aria-label="Tax rate percent" inputmode="decimal" style="width:52px;min-height:28px;padding:2px 4px" value="' + E(cur.tax_rate) + '"' + (editable() ? '' : ' disabled') + '>%</span><b>' + d2(cur.tax) + '</b></div><div style="font-size:18px"><b>Total</b><b>' + d2(cur.total) + '</b></div></div>'; }
  function draw() {
    var v = $('estView'), d = A.S.d; if (!v) return; sums(cur);
    var ro = !editable(), dis = ro ? ' disabled' : '', st = ST[cur.status] || [cur.status, 'mute'];
    var people = (d.people || []).map(function (p) { return '<option value="' + E(p.id) + '"' + (p.id === cur.contact_id ? ' selected' : '') + '>' + E(p.name) + (p.email ? '' : ' (no email)') + '</option>'; }).join('');
    var cases = '<option value="">None</option>' + (d.cases || []).map(function (k) { return '<option value="' + E(k.id) + '"' + (k.id === cur.case_id ? ' selected' : '') + '>' + E(k.no + ' ' + k.title) + '</option>'; }).join('');
    v.innerHTML = '<section class="card" id="estCard"><div class="row" style="justify-content:space-between"><h2 style="margin:0"><span style="font-family:ui-monospace,monospace;font-size:17px">' + E(cur.no) + '</span> ' + E(cur.title || 'Estimate') + '</h2><span class="pill ' + st[1] + '">' + st[0] + '</span></div>' +
      (cur.status === 'sent' ? '<p class="mute" style="margin:6px 0 0;font-size:14px">Sent ' + E(OW.date(cur.sent_at)) + '. You can still change it; press Send again so the customer gets the new total.</p>' : '') +
      '<div class="two" style="margin-top:8px"><div><label for="es_title">Title</label><input id="es_title" maxlength="160" value="' + E(cur.title) + '" placeholder="Repairs from Oct 1 county report"' + dis + '></div><div><label for="es_valid">Valid until</label><input id="es_valid" type="date" value="' + E(cur.valid_until) + '"' + dis + '></div>' +
      '<div><label for="es_contact">Contact (gets the email)</label><select id="es_contact"' + dis + '>' + people + '</select></div><div><label for="es_case">Case</label><select id="es_case"' + dis + '>' + cases + '</select></div></div>' +
      '<div class="tw" style="margin-top:10px"><table class="estlines"><thead><tr><th>Type</th><th>Description</th><th>Qty / hrs</th><th>Cost / rate</th><th>Markup %</th><th class="r">Total</th><th></th></tr></thead><tbody id="es_lines">' + cur.lines.map(lineRow).join('') + '</tbody></table></div>' +
      (ro ? '' : '<div class="row" style="gap:6px;margin:8px 0">' + Object.keys(TYPES).map(function (t) { return '<button class="b alt" type="button" data-ladd="' + t + '" style="padding:3px 12px;min-height:0;font-size:14px">+ ' + TYPES[t] + '</button>'; }).join('') + '</div>') +
      '<div id="es_tot">' + totalsHtml() + '</div>' +
      '<label for="es_notes">Notes to the customer</label><textarea id="es_notes" maxlength="3000" style="min-height:70px"' + dis + '>' + E(cur.notes) + '</textarea>' +
      '<p class="mute" style="font-size:13px;margin:4px 0 10px">Your cost and markup stay private. The customer sees only the price.' + (d.est_defaults && d.est_defaults.under_contract ? ' Labor defaults to $' + d.est_defaults.rate + '/h because this customer has a signed agreement.' : '') + '</p>' +
      (cur.status === 'accepted' ? '<div class="alert good"><span><b>Accepted by ' + E(cur.accepted_name) + '</b> on ' + E(new Date(cur.accepted_at).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' })) + '.<br><span class="mute">The invoice uses the total and goes out with a pay link, like your other invoices.</span></span><button class="b" type="button" id="es_inv">Create invoice from estimate</button></div>' : '') +
      (cur.status === 'invoiced' ? '<div class="alert good"><span><b>Invoiced.</b> Accepted by ' + E(cur.accepted_name) + ' on ' + E(OW.date(cur.accepted_at)) + '. The invoice is in your Invoices list.</span></div>' : '') +
      (cur.status === 'declined' ? '<div class="alert bad"><span><b>Declined</b> ' + E(OW.date(cur.declined_at)) + (cur.decline_reason ? ': ' + E(cur.decline_reason) : '') + '</span></div>' : '') +
      '<div class="row">' + '<button class="b alt" type="button" id="es_prev">Preview</button>' + (ro ? '' : '<button class="b" type="button" id="es_send">' + (cur.status === 'sent' ? 'Send again' : 'Send to customer') + '</button><button class="b alt" type="button" id="es_save">Save draft</button>') + '<button class="b alt" type="button" id="es_pdf">Download PDF</button>' + (cur.id && cur.status !== 'invoiced' && cur.status !== 'void' ? '<button class="b danger" type="button" id="es_void">Void</button>' : '') + '<button class="b alt" type="button" id="es_x">Close</button></div><div class="msg" id="esm" role="status"></div><div id="es_pv"></div></section>';
    wire(); v.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function read() {
    if (!editable()) return;
    cur.title = $('es_title').value; cur.valid_until = $('es_valid').value; cur.contact_id = $('es_contact').value; cur.case_id = $('es_case').value; cur.notes = $('es_notes').value;
    cur.tax_on = $('es_tax').checked; cur.tax_rate = $('es_rate').value;
  }
  function refreshTotals() { sums(cur); cur.lines.forEach(function (l, i) { var c = document.querySelector('[data-amt="' + i + '"]'); if (c) c.textContent = l.type === 'free' ? 'No charge' : d2(l.amount); }); $('es_tot').innerHTML = totalsHtml(); wireTax(); }
  function wireTax() { $('es_tax').onchange = function () { cur.tax_on = this.checked; refreshTotals(); }; $('es_rate').oninput = function () { cur.tax_rate = this.value; refreshTotals(); $('es_rate').focus(); }; }
  function payload() { read(); return { id: cur.id || undefined, customer_id: A.S.d.customer.id, contact_id: cur.contact_id, case_id: cur.case_id, title: cur.title, valid_until: cur.valid_until, notes: cur.notes, tax_on: cur.tax_on, tax_rate: cur.tax_rate, lines: cur.lines }; }
  function save() { return OW.api('/admin/api/estimate', payload()).then(function (j) { if (!j.ok) { msg('esm', j.error, true); return null; } cur.id = j.id; cur.no = j.no; return j; }); }
  function reload(then) { OW.api('/admin/api/customer/' + A.S.d.customer.id).then(function (x) { if (x.ok) { A.S.d.estimates = x.estimates; A.S.d.cases = x.cases; } A.refresh().then(function () { if (then) then(); }); }); }
  function wire() {
    var tb = $('es_lines');
    tb.oninput = function (e) { var t = e.target, i = t.getAttribute('data-l'), k = t.getAttribute('data-k'); if (i == null || k === 'type') return; cur.lines[i][k] = t.value; if (k !== 'desc') refreshTotals(); };
    tb.onchange = function (e) { var t = e.target; if (t.getAttribute('data-k') !== 'type') return; read(); var l = cur.lines[t.getAttribute('data-l')], def = A.S.d.est_defaults || {}; l.type = t.value; if (l.type === 'part' && l.markup == null) l.markup = def.markup; if (l.type === 'labor' && l.rate == null) l.rate = def.rate; draw(); };
    tb.onclick = function (e) { var b = e.target.closest('[data-ldel]'); if (!b) return; read(); cur.lines.splice(+b.getAttribute('data-ldel'), 1); draw(); };
    document.querySelectorAll('[data-ladd]').forEach(function (b) { b.onclick = function () { read(); var t = b.getAttribute('data-ladd'), def = A.S.d.est_defaults || {}; cur.lines.push(t === 'part' ? { type: t, desc: '', qty: 1, cost: '', markup: def.markup } : t === 'labor' ? { type: t, desc: '', qty: 1, rate: def.rate } : t === 'other' ? { type: t, desc: '', qty: 1, unit: '' } : { type: t, desc: '', qty: 1 }); draw(); var ds = document.querySelectorAll('#es_lines textarea'); if (ds.length) ds[ds.length - 1].focus(); }; });
    wireTax();
    $('es_x').onclick = function () { $('estView').innerHTML = ''; cur = null; };
    $('es_prev').onclick = function () { read(); sums(cur); var pv = $('es_pv'); if (pv.innerHTML) { pv.innerHTML = ''; return; } var k = (A.S.d.cases || []).filter(function (x) { return x.id === cur.case_id; })[0]; cur.case_no = k ? k.no : ''; pv.innerHTML = '<h3 style="margin:14px 0 6px">What the customer sees</h3>' + OW.estimateHtml(cur, A.S.d.customer); };
    $('es_pdf').onclick = function () { read(); sums(cur); OW.estimatePdf(cur, A.S.d.customer).then(function (b) { OW.download(b, (cur.no === 'New estimate' ? 'estimate' : cur.no) + '.pdf'); }); };
    if ($('es_save')) $('es_save').onclick = function () { save().then(function (j) { if (j) { OW.toast('Saved ' + j.no + '.'); reload(function () { open(j.id); }); } }); };
    if ($('es_send')) $('es_send').onclick = function () {
      var b = this; b.disabled = true;
      save().then(function (j) { if (!j) { b.disabled = false; return; } return OW.api('/admin/api/estimate-send', { id: j.id }).then(function (x) { b.disabled = false; if (!x.ok) return msg('esm', x.error, true); OW.toast(j.no + ' sent to ' + x.to + '.'); reload(function () { open(j.id); }); }); });
    };
    if ($('es_void')) $('es_void').onclick = function () { if (!confirm('Void ' + cur.no + '? The customer will no longer see it.')) return; OW.api('/admin/api/estimate-void', { id: cur.id }).then(function (x) { if (!x.ok) return msg('esm', x.error, true); OW.toast(cur.no + ' voided.'); reload(); $('estView').innerHTML = ''; }); };
    if ($('es_inv')) $('es_inv').onclick = function () { var b = this; b.disabled = true; OW.api('/admin/api/estimate-invoice', { id: cur.id }).then(function (x) { b.disabled = false; if (!x.ok) return msg('esm', x.error, true); OW.toast('Invoice created' + (x.emailed ? ' and emailed.' : '. The email did not send.')); reload(function () { open(cur.id); }); }); };
  }
  document.addEventListener('click', function (e) {
    var o = e.target.closest('[data-est]'); if (o) { e.preventDefault(); return open(o.getAttribute('data-est')); }
    var n = e.target.closest('[data-est-new]'); if (n) { e.preventDefault(); A.newEstimate(n.getAttribute('data-est-case') || ''); }
  });
})();
