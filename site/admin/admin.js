(function () {
  var $ = OW.$, E = OW.esc, S = { list: [], sel: null, d: null, cfg: null, editing: null };
  $('brand').innerHTML = OW.brand('/');
  var LS = { get: function (k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  window.OWA = { S: S, LS: LS, fail: fail, get cfg() { return S.cfg; }, refresh: function () { return refresh(); } };
  function fail(j) { OW.toast(j.error || 'Something went wrong.'); }

  function loadList() {
    return OW.api('/admin/api/customers').then(function (j) {
      if (j.status === 401) { $('ct').innerHTML = '<tr><td colspan="4" class="bad">You are not signed in. Reload this page and sign in through Cloudflare Access.</td></tr>'; return; }
      if (!j.ok) { $('ct').innerHTML = '<tr><td colspan="4" class="bad">' + E(j.error) + '</td></tr>'; return; }
      S.list = j.customers;
      $('ct').innerHTML = j.customers.map(function (c) { return '<tr class="pick' + (c.id === S.sel ? ' sel' : '') + '" data-id="' + c.id + '" tabindex="0"><td><b>' + E(c.name) + '</b>' + (c.test ? ' <span class="pill mute">Test</span>' : '') + '<br><span class="mute">' + E(c.address) + '</span></td><td>' + (c.sys_type ? 'Type ' + E(c.sys_type) : '') + '</td><td>' + OW.pill(c.contract) + '</td><td>' + E(OW.date(c.last_report) || 'None yet') + '</td></tr>'; }).join('') || '<tr><td colspan="4" class="mute">No customers yet. Add the first one.</td></tr>';
    });
  }
  function stateText(i) {
    if (i.status === 'waived') return ['Waived', 'good'];
    if (i.status === 'paid') return i.flag ? ['Paid, ' + i.flag + '. Held', 'bad'] : i.released ? ['Released', 'good'] : ['Paid, release ' + OW.date(i.release_date), 'warn'];
    if (i.notice_state === 'final_drafted') return ['Final notice ready for your OK', 'bad'];
    if (i.notice_state === 'sent') return ['Notice sent, ends ' + OW.date(i.term_date), 'bad'];
    if (i.notice_state === 'drafted') return ['Unpaid day ' + i.age + ', notice ready for your OK', 'bad'];
    return ['Unpaid, day ' + i.age + (i.paused ? ' (paused)' : ''), i.age >= 15 ? 'bad' : 'warn'];
  }
  function loadInvoices() {
    return OW.api('/admin/api/invoices').then(function (j) {
      if (!j.ok) return; var rows = j.invoices;
      $('alerts').innerHTML = (S.cfg && !S.cfg.stripe ? '<div class="alert"><span><b>Online payment is not set up yet.</b><br><span class="mute">Invoices are created and emailed, but the Pay button will not work until the Stripe keys are added. See the README.</span></span></div>' : '') +
        rows.filter(function (i) { return i.notice_state === 'drafted' || i.notice_state === 'final_drafted'; }).map(function (i) { return '<div class="alert bad"><span><b>' + (i.notice_state === 'drafted' ? 'A notice is ready for your OK.' : 'A final notice is ready for your OK.') + '</b><br><span class="mute">' + E(i.customer_name) + ', ' + E(OW.invFor(i)) + ', ' + OW.money(i.amount_cents) + ' unpaid ' + i.age + ' days.</span></span><button class="b" data-rv="' + i.id + '" data-kind="' + (i.notice_state === 'drafted' ? 'notice' : 'final') + '">Review and send</button></div>'; }).join('');
      $('it').innerHTML = rows.map(function (i) {
        var st = stateText(i), b = '';
        if (i.status === 'open') b += '<button class="b alt" data-iv="waive" data-id="' + i.id + '">Waive fee</button><button class="b alt" data-iv="paid" data-id="' + i.id + '">Mark paid</button><button class="b alt" data-iv="pause" data-id="' + i.id + '" data-p="' + (i.paused ? 0 : 1) + '">' + (i.paused ? 'Resume' : 'Pause') + '</button>';
        if (i.status === 'paid' && !i.released) b += '<button class="b alt" data-iv="release" data-id="' + i.id + '">Release now</button>';
        if (i.notice_state === 'drafted' || i.notice_state === 'final_drafted') b += '<button class="b" data-rv="' + i.id + '" data-kind="' + (i.notice_state === 'drafted' ? 'notice' : 'final') + '">Review notice</button>';
        return '<tr><td><b class="pickc" data-cid="' + i.customer_id + '" style="cursor:pointer">' + E(i.customer_name) + '</b></td><td>' + E(OW.invFor(i)) + '</td><td>' + OW.money(i.amount_cents) + '</td><td><span class="pill ' + st[1] + '">' + E(st[0]) + '</span>' + (i.note ? '<br><small class="mute">' + E(i.note) + '</small>' : '') + '</td><td><span class="row">' + b + '</span></td></tr>';
      }).join('') || '<tr><td colspan="5" class="mute">No open invoices.</td></tr>';
    });
  }
  function loadCounties() {
    return OW.api('/admin/api/counties').then(function (j) { if (j.ok) $('cty').innerHTML = j.counties.map(function (c) { return '<li><span><b>' + E(c.name.replace(/\b\w/g, function (x) { return x.toUpperCase(); })) + ' County</b><small>' + E(c.email) + '</small></span><button class="b danger" data-cdel="' + E(c.name) + '">Remove</button></li>'; }).join('') || '<li class="mute">No counties yet. Add one so reports and notices can reach it.</li>'; });
  }
  // ---- contacts
  var K = { list: [], kinds: [], kind: 'All', q: '', edit: '', toCustomer: '' };
  function loadContacts() {
    return OW.api('/admin/api/contacts').then(function (j) {
      if (!j.ok) return;
      K.list = j.contacts; K.kinds = j.kinds;
      if (!$('k_kind').options.length) $('k_kind').innerHTML = K.kinds.map(function (k) { return '<option>' + E(k) + '</option>'; }).join('');
      drawContacts();
    });
  }
  function drawContacts() {
    var today = new Date().toISOString().slice(0, 10), soon = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    var due = K.list.filter(function (c) { return c.next_date && c.next_date <= soon; });
    $('kdue').innerHTML = due.length ? '<div style="background:var(--note);color:var(--noteink);border-radius:10px;padding:10px 14px;margin:6px 0"><b>Follow up this week (' + due.length + ')</b><br>' + due.map(function (c) { return E(c.name) + (c.company ? ', ' + E(c.company) : '') + ': ' + E(c.next_step || 'follow up') + ', ' + (c.next_date < today ? '<b>overdue ' + E(OW.date(c.next_date)) + '</b>' : E(OW.date(c.next_date))); }).join('<br>') + '</div>' : '';
    var counts = { All: K.list.length }; K.list.forEach(function (c) { counts[c.kind] = (counts[c.kind] || 0) + 1; });
    $('kchips').innerHTML = ['All'].concat(K.kinds.filter(function (k) { return counts[k]; })).map(function (k) { return '<button type="button" class="b' + (K.kind === k ? '' : ' alt') + '" data-kkind="' + E(k) + '" style="padding:4px 12px;min-height:0;font-size:14px">' + E(k) + ' ' + counts[k] + '</button>'; }).join('');
    var q = K.q.toLowerCase(), rows = K.list.filter(function (c) { return (K.kind === 'All' || c.kind === K.kind) && (!q || [c.name, c.company, c.county, c.email, c.notes].join(' ').toLowerCase().indexOf(q) >= 0); });
    $('kt').innerHTML = rows.map(function (c) {
      var reach = [c.phone && '<a href="tel:' + E(c.phone.replace(/[^\d+x]/g, '')) + '">' + E(c.phone) + '</a>', c.email && '<a href="mailto:' + E(c.email) + '">' + E(c.email) + '</a>'].filter(Boolean).join('<br>') || '-';
      return '<tr><td><b>' + E(c.name) + '</b>' + (c.notes ? '<br><small class="mute">' + E(c.notes) + '</small>' : '') + '</td><td>' + E([c.company, c.county && c.county + ' County'].filter(Boolean).join(' · ') || '-') + '</td><td><span class="pill mute">' + E(c.kind) + '</span></td><td>' + reach + '</td><td>' + E(c.next_step || '-') + (c.next_date ? '<br><small class="mute">' + E(OW.date(c.next_date)) + '</small>' : '') + '</td><td><span class="row" style="gap:6px"><button class="b alt" type="button" data-kedit="' + E(c.id) + '">Edit</button>' + (c.kind === 'Lead' && !c.customer_id ? '<button class="b" type="button" data-kcust="' + E(c.id) + '">Make customer</button>' : '') + '<button class="b danger" type="button" data-kdel="' + E(c.id) + '">Remove</button></span></td></tr>';
    }).join('') || '<tr><td colspan="6" class="mute">No contacts match.</td></tr>';
  }
  function contactForm(c) {
    K.edit = c ? c.id : ''; $('kfT').textContent = c ? 'Edit ' + c.name : 'Add a contact'; $('kX').hidden = !c; $('km2').textContent = '';
    $('k_name').value = c ? c.name : ''; $('k_company').value = c ? c.company : ''; $('k_kind').value = c ? c.kind : 'Installer'; $('k_county').value = c ? c.county : '';
    $('k_phone').value = c ? c.phone : ''; $('k_email').value = c ? c.email : ''; $('k_next').value = c ? c.next_step : ''; $('k_date').value = c ? c.next_date : ''; $('k_notes').value = c ? c.notes : '';
    if (c) $('kf').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('kq').addEventListener('input', function () { K.q = this.value; drawContacts(); });
  $('kX').onclick = function () { contactForm(null); };
  $('kf').addEventListener('submit', function (e) {
    e.preventDefault(); var old = K.list.filter(function (x) { return x.id === K.edit; })[0] || {};
    OW.api('/admin/api/contact', { id: K.edit || undefined, name: $('k_name').value, company: $('k_company').value, kind: $('k_kind').value, county: $('k_county').value, phone: $('k_phone').value, email: $('k_email').value, next_step: $('k_next').value, next_date: $('k_date').value, notes: $('k_notes').value, customer_id: old.customer_id || '' }).then(function (j) {
      if (!j.ok) { $('km2').className = 'msg err'; $('km2').textContent = j.error; return; }
      OW.toast('Contact saved.'); contactForm(null); loadContacts();
    });
  });
  $('contacts').addEventListener('click', function (e) {
    var t = e.target, g = function (a) { var x = t.closest('[' + a + ']'); return x && x.getAttribute(a); }, c, k;
    if ((k = g('data-kkind'))) { K.kind = k; return void drawContacts(); }
    if ((k = g('data-kedit'))) return void contactForm(K.list.filter(function (x) { return x.id === k; })[0]);
    if ((k = g('data-kdel'))) { c = K.list.filter(function (x) { return x.id === k; })[0]; if (c && confirm('Remove ' + c.name + ' from contacts?')) OW.api('/admin/api/contact', { id: k, remove: true }).then(loadContacts); return; }
    if ((k = g('data-kcust'))) {
      c = K.list.filter(function (x) { return x.id === k; })[0]; if (!c) return;
      editCustomer(null); K.toCustomer = c.id;
      $('c_name').value = c.name; $('c_email').value = c.email; $('c_phone').value = c.phone; $('c_county').value = c.county;
      var addr = /^Property: (.+)/m.exec(c.notes || ''); if (addr) $('c_address').value = addr[1];
      $('c_notes').value = c.notes || '';
    }
  });
  function review(id, kind) {
    OW.api('/admin/api/invoice-letter?id=' + id + '&kind=' + kind).then(function (j) {
      if (!j.ok) return fail(j); var r = $('review'); r.hidden = false;
      r.innerHTML = '<h2>' + (kind === 'notice' ? 'Notice of intent to terminate' : 'Final notice') + '</h2><p class="mute" style="margin:0">Nothing is sent until you press Send. Your agreement requires notice by certified or registered mail, so print the owner letter and mail it too.</p><h3 style="margin:12px 0 0;font-size:19px">To the owner, ' + E(j.name) + '</h3><pre class="letter">' + E(j.owner.body) + '</pre><h3 style="font-size:19px">To ' + E(j.county_name) + ' County Environmental Health</h3><pre class="letter">' + E(j.county.body) + '</pre>' +
        (kind === 'notice' ? '<label for="trk">Certified mail tracking number (optional, can add later)</label><input id="trk" maxlength="80">' : '') +
        '<div class="row" style="margin-top:10px"><button class="b alt" id="prt">Print owner letter</button><button class="b" id="snd">Send to owner and county</button><button class="b alt" id="rvx">Close</button></div><div class="msg" id="rvm" role="status"></div>';
      r.scrollIntoView({ behavior: 'smooth' });
      $('prt').onclick = function () { $('printArea').innerHTML = '<p>Overwatch Septic, LLC<br>' + E(S.cfg && S.cfg.me || '') + '</p><p>' + E(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })) + '</p><p>' + E(j.name) + '<br>' + E(j.address) + '</p><p><b>' + E(j.owner.subject) + '</b></p><p style="white-space:pre-wrap">' + E(j.owner.body) + '</p>'; window.print(); };
      $('rvx').onclick = function () { r.hidden = true; };
      $('snd').onclick = function () { $('snd').disabled = true; OW.api('/admin/api/invoice-' + kind, { id: id, tracking: kind === 'notice' ? $('trk').value : '' }).then(function (x) { if (!x.ok) { $('snd').disabled = false; $('rvm').className = 'msg err'; $('rvm').textContent = x.error; return; } r.hidden = true; OW.toast('Sent to the owner and the county.'); refresh(); }); };
    });
  }
  function select(id) { S.sel = id; S.editing = null; $('editor').hidden = true; loadList(); return OW.api('/admin/api/customer/' + id).then(function (j) { if (!j.ok) return fail(j); S.d = j; renderDetail(); $('detail').scrollIntoView({ behavior: 'smooth' }); }); }
  function refresh() { return (S.sel ? OW.api('/admin/api/customer/' + S.sel).then(function (j) { if (j.ok) { S.d = j; renderDetail(); } }).then(loadList) : loadList()).then(loadInvoices).then(loadCounties); }

  function renderDetail() {
    var d = S.d, c = d.customer, open = d.contracts.filter(function (x) { return x.status === 'sent' || x.status === 'owner_signed'; }).length;
    var h = '<div class="grid2"><section class="card"><h2>' + E(c.name) + (c.test ? ' <span class="pill mute">Test</span>' : '') + '</h2><p class="mute" style="margin:0 0 10px">' + [c.email, c.phone, c.county && c.county + ' County', c.permit && 'Permit ' + c.permit].filter(Boolean).map(E).join(' &middot; ') + '<br>' + E(c.address) + '</p>' + (c.notes ? '<p class="mute" style="font-size:14px">' + E(c.notes) + '</p>' : '') +
      '<div class="row"><button class="b" id="bSend"' + (open ? ' title="An agreement is already open"' : '') + '>Send contract</button><button class="b" id="bInsp">New inspection</button><button class="b alt" id="bSetup">System setup</button><button class="b alt" id="bRep">Upload a report PDF</button><button class="b alt" id="bEdit">Edit</button></div>' +
      '<h3 style="margin:16px 0 4px">Contracts</h3><ul class="list">' + (d.contracts.map(function (x) {
        var btns = '<button class="b alt" data-act="view" data-id="' + x.id + '">View</button>';
        if (x.status === 'sent') btns += '<button class="b alt" data-act="resend" data-id="' + x.id + '">Resend link</button>';
        if (x.status === 'owner_signed') btns += '<button class="b" data-act="cs" data-id="' + x.id + '">Sign now</button>';
        if (x.status !== 'complete' && x.status !== 'void') btns += '<button class="b danger" data-act="void" data-id="' + x.id + '">Cancel</button>';
        if (x.status === 'complete') btns += '<button class="b alt" data-act="pdf" data-id="' + x.id + '">PDF</button>';
        return '<li><span><b>Inspection and Maintenance Agreement</b><small>Sent ' + E(OW.date(x.created_at)) + (x.owner.signed_at ? ' &middot; customer signed ' + E(OW.date(x.owner.signed_at)) : '') + (x.contractor.signed_at ? ' &middot; you signed ' + E(OW.date(x.contractor.signed_at)) : '') + '</small></span><span class="row">' + OW.pill(x.status) + btns + '</span></li>';
      }).join('') || '<li class="mute">None yet.</li>') + '</ul>' +
      '<h3 style="margin:16px 0 4px">Reports</h3><ul class="list">' + (d.reports.map(function (r) {
        return '<li><span><b>' + (r.kind === 'inspection' ? 'Inspection report, ' : 'Visit report, ') + E(OW.date(r.visit_date)) + '</b><small>' + (r.kind === 'upload' ? 'Uploaded PDF' : r.kind === 'inspection' ? E(r.insp ? r.insp.data.status : 'Inspection') + (r.insp && r.insp.calc.pump_now ? ' &middot; time to pump' : '') : 'Entered in form') + (r.notes ? ' &middot; ' + E(r.notes.slice(0, 60)) : '') + (r.state === 'held' ? '' : r.county_sent_at ? ' &middot; county copy sent' : ' &middot; county copy not sent') + '</small></span><span class="row">' + (r.state === 'held' ? '<span class="pill warn">Held until paid</span>' : (r.county_sent_at ? '' : '<button class="b alt" data-county-send="' + r.id + '">Send county copy</button>')) + '' + (r.kind === 'inspection' && r.insp ? '<button class="b alt" data-rep="view" data-id="' + r.id + '">View</button><button class="b alt" data-rep="pdf" data-id="' + r.id + '">Homeowner PDF</button><button class="b alt" data-rep="cpdf" data-id="' + r.id + '">County PDF</button>' : '<button class="b alt" data-rep="pdf" data-id="' + r.id + '">PDF</button>') + '<button class="b alt" data-rep="mail" data-id="' + r.id + '">Email customer</button><button class="b danger" data-rep="del" data-id="' + r.id + '">Delete</button></span></li>';
      }).join('') || '<li class="mute">None yet.</li>') + '</ul></section>' +
      '<section class="card" id="panel"><h2>Next step</h2><p class="mute">Choose Send contract or New inspection.</p></section></div>' +
      '<section class="card"><h2>' + E(c.name) + ': readings over time</h2><div class="charts">' + OW.charts(d.reports) + '</div></section>' +
      '<div class="row"><button class="b danger" id="bDel">Delete customer</button></div><div id="delBox"></div>';
    $('detail').innerHTML = h;
  }

  function field(id, label, val, extra) { return '<div><label for="' + id + '">' + label + '</label><input id="' + id + '" value="' + E(val || '') + '" ' + (extra || '') + '></div>'; }
  function maintDefault(c) {
    var l = ['Inspect the septic tank, including the baffles, effluent filter, and sludge and scum levels', 'Inspect the pump tank, pump, floats and alarm', 'Check the control panel and alarm', 'Check the drain field for ponding, wet spots and surfacing effluent', 'Clean the effluent filter', 'Review the permit conditions', 'Give the owner a written report of findings'];
    if (/^v/i.test(String(c.sys_type || '').trim())) l.splice(4, 0, 'Check zone pressures and flow against the design', 'Clean the headworks filter and flush the field');
    return E(l.join('\n'));
  }
  // Inspections per year, as set by the permit (keep in step with VISITS in site/contract-text.js).
  var VISITS = [['2', '2 (twice a year)'], ['4', '4 (quarterly)'], ['q1s', '4 the first year, then 2 a year'], ['1', '1 (once a year)']];
  var FREQ_VISITS = { s: '2', q: '4', q1s: 'q1s', a: '1' };
  // Permits issued on or after January 1, 2024 fall under 15A NCAC 18E (keep in step with ruleSetFor in site/contract-text.js).
  function ruleSetFor(issued) { return /^\d{4}-\d{2}-\d{2}$/.test(issued || '') ? (issued >= '2024-01-01' ? '18E' : '18A') : ''; }
  function usd(n) { return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function feeTotal(fee, v) {
    var f = Number(String(fee).replace(/,/g, ''));
    if (!(f > 0)) return 'Enter the fee per inspection to see the annual total.';
    if (v === 'q1s') return 'Agreement total: ' + usd(f * 4) + ' the first year (' + usd(f) + ' × 4), then ' + usd(f * 2) + ' a year (' + usd(f) + ' × 2).';
    return 'Annual total in the agreement: ' + usd(f * Number(v)) + ' (' + usd(f) + ' × ' + v + ').';
  }
  // Default visit invoice: the per-inspection fee in the customer's signed agreement (older agreements: annual fee ÷ 2).
  function contractVisitFee(d) {
    var k = d && (d.contracts || []).filter(function (x) { return x.status === 'complete' || x.status === 'owner_signed'; })[0], t = k && k.terms;
    if (!t) return '';
    if (t.inspection_fee) return String(t.inspection_fee);
    var a = Number(t.annual_fee); return a > 0 ? String(Math.round(a / 2 * 100) / 100) : '';
  }
  OWA.visitFee = function () { return contractVisitFee(S.d); };
  function contractForm() {
    var c = S.d.customer, today = new Date().toISOString().slice(0, 10);
    $('panel').innerHTML = '<h2>New contract</h2><p class="mute" style="margin:0 0 4px">The text is the state sample, except that paragraph 2(a) prices it per inspection and permits from 2024 on cite the 18E rules. These fields fill its blanks.</p><form id="kf" novalidate><div class="two">' +
      field('k_contractor', 'Contractor name', LS.get('ow_cn') || 'Overwatch Septic, LLC') + field('k_per', 'Fee per inspection ($)', LS.get('ow_per') || (S.cfg && S.cfg.defaults.visit) || '250', 'inputmode="decimal"') +
      '<div><label for="k_visits">Inspections per year, per the permit</label><select id="k_visits">' + VISITS.map(function (v) { return '<option value="' + v[0] + '">' + v[1] + '</option>'; }).join('') + '</select></div>' + field('k_orig', 'Origination fee, billed when you countersign ($, 0 for none)', LS.get('ow_orig') || (S.cfg && S.cfg.defaults.origination) || '100', 'inputmode="decimal"') +
      field('k_caddr', 'Contractor address', LS.get('ow_ca')) + field('k_health', 'Local health department', LS.get('ow_hd_' + (c.county || '')) || (c.county ? c.county + ' County Environmental Health' : '')) +
      field('k_date', 'Agreement date', today, 'type="date"') + field('k_resp', 'Response time (hours)', '48') + '</div>' +
      '<p id="k_tot" role="status" style="background:var(--note);color:var(--noteink);border-radius:10px;padding:10px 14px;margin:14px 0 0;font-weight:600"></p><p class="mute" style="margin:4px 0 0;font-size:14px">Each inspection is billed at this fee when you upload its report. Extra visits are billed at your normal fees.</p>' +
      '<label for="k_rs">Rules that apply</label><select id="k_rs"><option value="">Choose…</option><option value="18E">15A NCAC 18E (permit issued January 1, 2024 or later)</option><option value="18A">15A NCAC 18A .1900 (permit issued before 2024)</option></select>' +
      '<p id="k_rsw" style="background:var(--note);color:var(--noteink);border-radius:10px;padding:10px 14px;margin:8px 0 0;font-weight:600">Checking System setup for the permit date…</p>' +
      '<label for="k_maint">Routine maintenance (one per line)</label><textarea id="k_maint" style="min-height:120px">' + maintDefault(c) + '</textarea>' +
      '<div class="row" style="margin-top:10px"><button class="b" type="submit">Email signing link to ' + E(c.name.split(' ')[0]) + '</button></div><div class="msg" id="km" role="status"></div></form>';
    var showTotal = function () { $('k_tot').textContent = feeTotal($('k_per').value, $('k_visits').value); };
    $('k_per').addEventListener('input', showTotal); $('k_visits').addEventListener('change', showTotal); showTotal();
    OW.api('/admin/api/system?customer_id=' + c.id + '&date=' + today).then(function (j) {
      var pm = (j && j.ok && j.system && j.system.permit) || {}, f = FREQ_VISITS[pm.freq], rs = ruleSetFor(pm.issued);
      if (f && $('k_visits')) { $('k_visits').value = f; showTotal(); }
      if (!$('k_rs')) return;
      if (rs) {
        var said = 'Set from System setup: permit issued ' + OW.date(pm.issued) + '.';
        $('k_rs').value = rs; $('k_rsw').textContent = said;
        $('k_rs').addEventListener('change', function () { $('k_rsw').textContent = $('k_rs').value === rs ? said : 'This does not match the permit date in System setup (' + OW.date(pm.issued) + '). Check the permit before sending.'; });
      }
      else $('k_rsw').textContent = 'No permit date in System setup. Check the permit and choose the rules that apply.';
    });
    $('kf').addEventListener('submit', function (e) {
      e.preventDefault(); var v = function (i) { return $(i).value.trim(); };
      var per = v('k_per').replace(/,/g, '');
      if (!v('k_rs')) { $('km').className = 'msg err'; $('km').textContent = 'Choose which rules apply. Check the permit date.'; return; }
      if (!/^\d+(\.\d{1,2})?$/.test(per) || Number(per) <= 0) { $('km').className = 'msg err'; $('km').textContent = 'Enter the fee per inspection, like 250.'; return; }
      $('km').className = 'msg'; $('km').textContent = 'Sending...';
      OW.api('/admin/api/contract', { customer_id: c.id, terms: { contractor_name: v('k_contractor'), contractor_address: v('k_caddr'), health_dept: v('k_health'), inspection_fee: per, visits: v('k_visits'), origination_fee: v('k_orig'), date: v('k_date'), response_hours: v('k_resp'), rule_set: v('k_rs'), maintenance: v('k_maint').split('\n') } }).then(function (j) {
        if (!j.ok) { $('km').className = 'msg err'; $('km').textContent = j.error; return; }
        LS.set('ow_cn', v('k_contractor')); LS.set('ow_per', per); LS.set('ow_orig', v('k_orig')); LS.set('ow_ca', v('k_caddr')); LS.set('ow_hd_' + (c.county || ''), v('k_health'));
        OW.toast(j.emailed ? 'Signing link emailed.' : 'Saved, but the email did not send. Use Resend link.'); refresh();
      });
    });
  }
  function reportForm() {
    var today = new Date().toISOString().slice(0, 10);
    $('panel').innerHTML = '<h2>Upload a report PDF</h2><p class="mute" style="margin:0 0 4px">For an older report or one made in another tool. It is stored with the customer, not graphed. For a new visit, use New inspection.</p><form id="rf" novalidate><label for="r_date">Visit date</label><input id="r_date" type="date" value="' + today + '">' +
      '<label for="r_notes">Notes for the customer</label><textarea id="r_notes" maxlength="1000"></textarea>' +
      '<label for="r_pdf">PDF report</label><input id="r_pdf" type="file" accept="application/pdf">' +
      '<label for="r_amt">Invoice amount ($). Use 0 to waive it</label><input id="r_amt" inputmode="decimal" value="' + E(contractVisitFee(S.d) || LS.get('ow_visit') || (S.cfg && S.cfg.defaults.visit) || '250') + '"><p class="mute" style="margin:4px 0 0;font-size:14px">' + (contractVisitFee(S.d) ? 'The per-inspection fee from the signed agreement. For an extra visit, enter your normal fee. ' : '') + 'With an invoice, the customer and the county get nothing until it is paid and 3 business days have passed. With 0, both get the report right away.</p>' +
      '<div class="row" style="margin-top:10px"><button class="b" type="submit">Save report</button></div><div class="msg" id="rm" role="status"></div></form>';
    $('rf').addEventListener('submit', function (e) {
      e.preventDefault(); var m = $('rm'); m.className = 'msg'; m.textContent = 'Saving...';
      var file = $('r_pdf').files[0];
      if (!file) { m.className = 'msg err'; m.textContent = 'Choose the PDF to upload.'; return; }
      if (file && file.size > 6 * 1024 * 1024) { m.className = 'msg err'; m.textContent = 'That PDF is over 6 MB.'; return; }
      OW.api('/admin/api/report', { customer_id: S.sel, visit_date: $('r_date').value, kind: 'upload', readings: {}, notes: $('r_notes').value, checks: [] }).then(function (j) {
        if (!j.ok) { m.className = 'msg err'; m.textContent = j.error; return; }
        var up = file ? file.arrayBuffer().then(function (b) { return OW.api('/admin/api/reports/' + j.id + '/pdf', b, { raw: true, type: 'application/pdf' }); }) : Promise.resolve({ ok: true });
        return up.then(function (u) {
          if (!u.ok) { m.className = 'msg err'; m.textContent = 'Report saved, but the PDF did not upload: ' + u.error + ' It stays held. Delete it and try again.'; refresh(); return; }
          return OW.api('/admin/api/report-finish', { id: j.id, amount: $('r_amt').value }).then(function (f) {
            if (!f.ok) { m.className = 'msg err'; m.textContent = f.error; refresh(); return; }
            LS.set('ow_visit', $('r_amt').value);
            OW.toast(f.released ? 'Saved and released to the customer and county.' : (f.emailed ? 'Saved. Invoice emailed; the report is held until paid.' : 'Saved, but the invoice email did not send.')); refresh();
          });
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
    if (t.id === 'bInsp') return void OWA.inspect();
    if (t.id === 'bSetup') return void OWA.setup();
    if (t.id === 'bDel') {
      var cu = S.d.customer;
      if (cu.test) { $('delBox').innerHTML = '<div class="card" style="border-color:var(--bad)"><h3 style="margin:0 0 6px">Delete test customer</h3><p class="mute" style="margin:0 0 8px">This removes ' + E(cu.name) + ', including any signed agreement, invoices and reports. It cannot be undone. Stripe payments are not touched. Type the name to confirm.</p><input id="delName" autocomplete="off" aria-label="Type the customer name" placeholder="' + E(cu.name) + '"><div class="row" style="margin-top:8px"><button class="b danger" id="delGo" disabled>Delete for good</button><button class="b alt" id="delNo">Cancel</button></div></div>'; $('delName').focus(); return; }
      if (confirm('Delete ' + cu.name + ' and all their reports?')) OW.api('/admin/api/customer-delete', { id: S.sel }).then(function (j) { if (!j.ok) return fail(j); S.sel = null; S.d = null; $('detail').innerHTML = ''; loadList(); OW.toast('Customer deleted.'); }); return;
    }
    if (t.id === 'delNo') { $('delBox').innerHTML = ''; return; }
    if (t.id === 'delGo') { OW.api('/admin/api/customer-delete', { id: S.sel, confirm: $('delName').value }).then(function (j) { if (!j.ok) return fail(j); S.sel = null; S.d = null; $('detail').innerHTML = ''; loadList(); OW.toast('Test customer deleted.'); }); return; }
    var rv = t.closest('[data-rv]'); if (rv) return void review(rv.getAttribute('data-rv'), rv.getAttribute('data-kind'));
    var pc = t.closest('.pickc'); if (pc) return void select(pc.getAttribute('data-cid'));
    var cd = t.closest('[data-cdel]'); if (cd) { if (confirm('Remove this county?')) OW.api('/admin/api/county', { name: cd.getAttribute('data-cdel'), remove: true }).then(loadCounties); return; }
    var iv = t.closest('[data-iv]');
    if (iv) {
      var act = iv.getAttribute('data-iv'), iid = iv.getAttribute('data-id');
      if (act === 'waive' && !confirm('Waive this fee? Whatever is locked is released to the customer right away.')) return;
      if (act === 'paid' && !confirm('Mark this invoice paid (for a check or cash)? The 3 business day hold starts now.')) return;
      return void OW.api('/admin/api/invoice-' + act, { id: iid, paused: iv.getAttribute('data-p') === '1' }).then(function (j) { j.ok ? OW.toast('Done.') : fail(j); refresh(); });
    }
    var cs = t.closest('[data-county-send]'); if (cs) return void OW.api('/admin/api/report-county-send', { id: cs.getAttribute('data-county-send') }).then(function (j) { j.ok ? OW.toast('County copy sent.') : fail(j); refresh(); });
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
      if (k === 'view') return void OWA.view(rep, 'home');
      if (k === 'cpdf') return void OWA.pdf(rep, 'county');
      if (k === 'pdf' && rep.kind === 'inspection') return void OWA.pdf(rep, 'home');
      if (k === 'pdf') { if (rep.has_pdf) window.open('/admin/api/reports/' + rid + '/pdf', '_blank', 'noopener'); else OW.reportPdf(rep, S.d.customer).then(function (b) { OW.download(b, 'report-' + rep.visit_date + '.pdf'); }); }
      if (k === 'mail') OW.api('/admin/api/report-notify', { id: rid }).then(function (j) { j.ok ? OW.toast('Email sent.') : fail(j); });
      if (k === 'del' && confirm('Delete this report? The customer will no longer see it.')) OW.api('/admin/api/report-delete', { id: rid }).then(function (j) { j.ok ? OW.toast('Deleted.') : fail(j); refresh(); });
    }
  });
  document.addEventListener('input', function (e) { if (e.target.id === 'delName') $('delGo').disabled = e.target.value.trim().toLowerCase() !== S.d.customer.name.trim().toLowerCase(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Enter') { var tr = e.target.closest && e.target.closest('tr.pick'); if (tr) select(tr.getAttribute('data-id')); } });

  var FIELDS = ['name', 'email', 'phone', 'county', 'address', 'sys', 'permit', 'notes'], KEYS = { sys: 'sys_type' };
  function editCustomer(c) {
    S.editing = c ? c.id : ''; K.toCustomer = ''; $('editor').hidden = false; $('edT').textContent = c ? 'Edit customer' : 'Add customer'; $('cm').textContent = '';
    FIELDS.forEach(function (f) { $('c_' + f).value = c ? c[KEYS[f] || f] || '' : ''; });
    $('c_test').checked = !!(c && c.test);
    $('editor').scrollIntoView({ behavior: 'smooth' });
  }
  $('edX').onclick = function () { $('editor').hidden = true; };
  $('cf').addEventListener('submit', function (e) {
    e.preventDefault(); var body = { id: S.editing || undefined }; FIELDS.forEach(function (f) { body[KEYS[f] || f] = $('c_' + f).value; }); body.test = $('c_test').checked;
    OW.api('/admin/api/customer', body).then(function (j) { if (!j.ok) { $('cm').className = 'msg err'; $('cm').textContent = j.error; return; } $('editor').hidden = true; OW.toast('Saved.'); S.sel = j.id; select(j.id); if (K.toCustomer && !S.editing) { var lc = K.list.filter(function (x) { return x.id === K.toCustomer; })[0]; K.toCustomer = ''; if (lc) OW.api('/admin/api/contact', Object.assign({}, lc, { kind: 'Customer', customer_id: j.id, next_step: '', next_date: '' })).then(loadContacts); } });
  });
  $('cyf').addEventListener('submit', function (e) { e.preventDefault(); OW.api('/admin/api/county', { name: $('cy_n').value, email: $('cy_e').value }).then(function (j) { if (!j.ok) { $('cym').className = 'msg err'; $('cym').textContent = j.error; return; } $('cym').textContent = ''; $('cy_n').value = ''; $('cy_e').value = ''; OW.toast('County saved.'); loadCounties(); }); });
  OW.api('/admin/api/config').then(function (j) { if (j.ok) { S.cfg = j; if (j.operator && j.operator.phone) OW.CONTACT.phone = j.operator.phone; $('who').textContent = 'Admin portal · ' + j.me; } }).then(function () { loadList(); loadInvoices(); loadCounties(); loadContacts(); });
})();
