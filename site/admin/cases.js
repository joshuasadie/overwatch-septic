// Cases in the admin portal: the open-cases list, a customer's cases, and the case page
// (Case Manager with parts, RMAs and time; comments with public/private notes and time; status and description).
(function () {
  var $ = OW.$, E = OW.esc, A = window.OWA, C = { meta: null, cur: null, tab: 'comments', filter: 'All', open: [] };
  var CH = { overwatch: 'From Overwatch', phone_in: 'Phone call incoming', phone_out: 'Phone call outgoing', customer: 'From customer', portal: 'From customer · portal' };
  var today = function () { return new Date().toISOString().slice(0, 10); };
  var hm = function (m) { m = Number(m) || 0; return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); };
  var when = function (iso) { return iso ? new Date(iso).toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; };
  var localNow = function () { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  var me = function () { var o = A.cfg && A.cfg.operator; return (o && o.name ? String(o.name).split(' ')[0] : '') || 'Overwatch'; };
  var dueTone = function (d, done) { if (!d || done) return ''; return d < today() ? 'bad' : (d <= new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10) ? 'warn' : 'good'); };
  var pill = function (s) { var c = s === 'Done' ? 'var(--good)' : s === 'Open' ? 'var(--ink)' : 'var(--warn)'; return '<span class="pill" style="color:' + c + '">' + E(s) + '</span>'; };
  var itemPill = function (it) { return '<span class="pill" style="color:' + (it.open ? 'var(--warn)' : 'var(--good)') + '">' + E(it.status) + '</span>'; };
  var opt = function (list, v) { return list.map(function (x) { return '<option' + (x === v ? ' selected' : '') + '>' + E(x) + '</option>'; }).join(''); };
  var fld = function (id, label, v, extra) { return '<div><label for="' + id + '">' + label + '</label><input id="' + id + '" value="' + E(v || '') + '" ' + (extra || '') + '></div>'; };
  function msg(id, text, bad) { var m = $(id); if (m) { m.className = 'msg' + (bad ? ' err' : ''); m.textContent = text || ''; } }

  // ---- the open-cases list on the home page
  function loadOpen() {
    return OW.api('/admin/api/cases').then(function (j) { if (!j.ok) return; C.meta = j.meta; C.open = j.cases; drawOpen(); });
  }
  function drawOpen() {
    var L = C.open, t = today(), over = L.filter(function (k) { return k.due_date && k.due_date < t; });
    var groups = [['All', L.length], ['Overdue', over.length]].concat((C.meta ? C.meta.status : []).filter(function (s) { return s !== 'Done'; }).map(function (s) { return [s, L.filter(function (k) { return k.status === s; }).length]; }));
    $('casesN').textContent = L.length ? '(' + L.length + ')' : '';
    $('casesF').innerHTML = groups.filter(function (g) { return g[0] === 'All' || g[1]; }).map(function (g) { return '<button class="b' + (C.filter === g[0] ? '' : ' alt') + '" data-cf="' + E(g[0]) + '" style="padding:3px 10px;font-size:13px">' + E(g[0]) + ' ' + g[1] + '</button>'; }).join('');
    var show = L.filter(function (k) { return C.filter === 'All' || (C.filter === 'Overdue' ? k.due_date && k.due_date < t : k.status === C.filter); });
    $('casesL').innerHTML = show.map(function (k) {
      var tone = dueTone(k.due_date);
      return '<li class="pickcase" data-case="' + k.id + '" data-cid="' + k.customer_id + '" style="cursor:pointer"><span><span class="cno">' + E(k.no) + '</span> <b>' + E(k.title) + '</b><small>' + E(k.customer_name) + ' · ' + E(k.status) + (k.open_items.length ? ' · ' + k.open_items.length + ' open part/RMA' : '') + '</small></span>' +
        (k.due_date ? '<span class="' + tone + '" style="font-weight:600;font-size:14px">' + (tone === 'bad' ? 'Overdue · ' : 'Due ') + E(OW.date(k.due_date)) + '</span>' : '') + '</li>';
    }).join('') || '<li class="mute">No open cases.</li>';
  }

  // ---- a customer's cases (left card on the customer page)
  A.casesList = function (d) {
    var L = d.cases || [];
    return '<h3 style="margin:16px 0 4px">Cases</h3><ul class="list">' + (L.map(function (k) {
      return '<li class="pickcase" data-case="' + k.id + '" style="cursor:pointer"><span><span class="cno">' + E(k.no) + '</span> <b>' + E(k.title) + '</b><small>' + E(k.type) + (k.due_date && k.status !== 'Done' ? ' · due ' + E(OW.date(k.due_date)) : '') + (k.open_items.length ? ' · ' + E(k.open_items.join(', ')) + ' open' : '') + '</small></span>' + pill(k.status) + '</li>';
    }).join('') || '<li class="mute">None yet.</li>') + '</ul><div class="row" style="margin-top:8px"><button class="b alt" id="caseNew">New case</button></div>';
  };
  A.afterDetail = function () { if (C.cur && A.S.d && C.cur.customer_id === A.S.d.customer.id) openCase(C.cur.id, true); };

  function newCase() {
    var v = $('caseView'); if (!v) return;
    v.innerHTML = '<section class="card"><h2>New case for ' + E(A.S.d.customer.name) + '</h2><form id="ncf" novalidate><div class="two">' + fld('nc_title', 'Title', '', 'maxlength="160" placeholder="Zone 3 pressure low"') +
      '<div><label for="nc_type">Type</label><select id="nc_type">' + opt(C.meta ? C.meta.types : ['Repair follow-up'], 'Repair follow-up') + '</select></div>' + fld('nc_due', 'Due date', '', 'type="date"') + fld('nc_contact', 'Contact', '', 'maxlength="100" placeholder="Stacy Wilkins"') +
      '</div><label for="nc_desc">Description</label><textarea id="nc_desc" maxlength="4000" placeholder="What the problem is and where it came from"></textarea>' +
      '<div class="row" style="margin-top:10px"><button class="b" type="submit">Open case</button><button class="b alt" type="button" id="ncX">Cancel</button></div><div class="msg" id="ncm" role="status"></div></form></section>';
    v.scrollIntoView({ behavior: 'smooth' }); $('nc_title').focus();
    $('ncX').onclick = function () { v.innerHTML = ''; };
    $('ncf').onsubmit = function (e) {
      e.preventDefault();
      OW.api('/admin/api/case', { customer_id: A.S.d.customer.id, title: $('nc_title').value, type: $('nc_type').value, due_date: $('nc_due').value, contact: $('nc_contact').value, description: $('nc_desc').value }).then(function (j) {
        if (!j.ok) return msg('ncm', j.error, true);
        OW.toast(j.no + ' opened.'); C.tab = 'comments'; openCase(j.id); A.refresh(); loadOpen();
      });
    };
  }

  // ---- the case page
  function openCase(id, quiet) {
    return OW.api('/admin/api/case/' + id).then(function (j) {
      if (!j.ok) return A.fail(j);
      C.cur = j.case; C.meta = j.meta; draw();
      if (!quiet) $('caseView').scrollIntoView({ behavior: 'smooth' });
    });
  }
  function draw() {
    var k = C.cur, v = $('caseView'), cu = A.S.d && A.S.d.customer || {}; if (!v || !k) return;
    var parts = k.items.filter(function (i) { return i.kind === 'part'; }), rmas = k.items.filter(function (i) { return i.kind === 'rma'; }), openItems = k.items.filter(function (i) { return i.open; });
    var timed = k.comments.filter(function (c) { return Number(c.minutes) > 0; });
    var flags = [];
    if (k.county_done) flags.push(['good', '✓', 'County notified ' + OW.date(k.county_done)]);
    else if (k.county_due) flags.push([dueTone(k.county_due) || 'warn', '!', 'County notice due ' + OW.date(k.county_due)]);
    if (k.owner_due && k.status !== 'Done') flags.push([dueTone(k.owner_due) || 'warn', '!', 'Owner proof of repair due ' + OW.date(k.owner_due)]);
    if (openItems.length) flags.push(['warn', '!', openItems.length + ' open: ' + openItems.map(function (i) { return i.no; }).join(', ')]);
    if (k.due_date && k.status !== 'Done' && k.due_date < today()) flags.push(['bad', '!', 'Case overdue since ' + OW.date(k.due_date)]);
    var mini = function (list) { return list.map(function (i) { return '<div class="cv-li" data-goitem="' + i.id + '"><span class="cno">' + E(i.no) + '</span><span>' + (i.kind === 'part' && i.qty > 1 ? i.qty + ' × ' : '') + E(i.title) + '</span><span class="' + (i.open ? 'warn' : 'good') + '" style="font-weight:600">' + E(i.status) + '</span></div>'; }).join('') || '<div class="cv-li mute" style="grid-template-columns:1fr">None</div>'; };
    v.innerHTML = '<section class="card cv">' +
      '<div class="cv-top"><div class="row" style="gap:10px;align-items:flex-start"><div class="cv-ico">OW</div><div><small class="mute">Case</small><h2 style="margin:0">' + E(k.title) + '</h2></div></div>' +
      '<div class="cv-acts"><button data-cv="edit">Edit</button>' + (k.status === 'Done' ? '<button data-cv="reopen">Reopen</button>' : '<button data-cv="close">Close Case</button>') + '<button data-cv="email">Email Owner</button><button data-cv="x" aria-label="Close this case view">×</button></div></div>' +
      '<div class="cv-hl"><div><small>Case Number</small><b class="cno" style="font-size:15px">' + E(k.no) + '</b></div><div><small>Account</small><b>' + E(k.customer_name) + '</b></div>' + (k.contact ? '<div><small>Contact</small><b>' + E(k.contact) + '</b></div>' : '') +
      '<div><small>System</small><b>' + E(cu.sys_type ? 'Type ' + cu.sys_type : '—') + '</b></div>' + (cu.permit ? '<div><small>Permit</small><b>' + E(cu.permit) + '</b></div>' : '') + '<div><small>Case Owner</small><b>' + E(me()) + '</b></div></div>' +
      (flags.length ? '<div class="cv-flags">' + flags.map(function (f) { return '<div><span class="cv-dot ' + f[0] + '">' + (f[0] === 'good' && f[1] === '!' ? 'i' : f[1]) + '</span>' + E(f[2]) + '</div>'; }).join('') + '</div>' : '') + '</section>' +
      '<div class="cv-cols">' +
      '<section class="card"><h3 style="margin:0 0 6px">Case Manager</h3>' +
        '<details class="cv-g" open><summary>Parts (' + parts.length + ')</summary>' + mini(parts) + '</details>' +
        '<details class="cv-g" open><summary>RMAs (' + rmas.length + ')</summary>' + mini(rmas) + '</details>' +
        '<details class="cv-g" open><summary>Time (' + hm(k.minutes) + ')</summary>' + (timed.map(function (c) { return '<div class="cv-li"><span>#' + c.seq + '</span><span>' + E(c.body.slice(0, 40)) + '</span><span>' + hm(c.minutes) + '</span></div>'; }).join('') || '<div class="cv-li mute" style="grid-template-columns:1fr">No time yet. Add it on a comment.</div>') + '</details>' +
        (k.status === 'Done' ? '' : '<div class="row" style="margin-top:8px"><button class="b alt sm2" data-cv="addpart">+ Part</button><button class="b alt sm2" data-cv="addrma">+ RMA</button></div>') + '</section>' +
      '<section class="card"><div class="cv-tabs">' + [['comments', 'Comments'], ['details', 'Details'], ['part', 'Parts'], ['rma', 'RMA']].map(function (t) { return '<button data-tab="' + t[0] + '" class="' + (C.tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div><div id="cvBody"></div></section>' +
      '<div><section class="card"><div class="cv-kv"><div style="grid-column:1/-1"><small>Status</small><select id="cvStatus" style="width:100%">' + opt(C.meta.status, k.status) + '</select></div><div><small>Type</small><b>' + E(k.type) + '</b></div>' +
        '<div><small>Due</small><b>' + E(k.due_date ? OW.date(k.due_date) : '—') + '</b></div><div><small>Opened</small><b>' + E(OW.date(k.created_at)) + '</b></div>' +
        '<div><small>Started from</small><b>' + E(k.source || 'Manual') + '</b></div><div><small>Visible to customer</small><b>Yes</b></div></div><div class="msg" id="cvsm" role="status"></div></section>' +
        '<section class="card" style="margin-top:14px"><h3 style="margin:0 0 6px">Description</h3><p style="margin:0;font-size:14.5px;white-space:pre-wrap">' + (E(k.description) || '<span class="mute">None.</span>') + '</p></section></div>' +
      '</div>';
    drawTab();
  }
  function drawTab() {
    var b = $('cvBody'), k = C.cur; if (!b) return;
    if (C.tab === 'details') return void detailsTab(b, k);
    if (C.tab === 'part' || C.tab === 'rma') return void itemsTab(b, k, C.tab);
    commentsTab(b, k);
  }
  function commentsTab(b, k) {
    var cu = A.S.d && A.S.d.customer || {}, people = [me(), cu.name, k.contact].filter(Boolean);
    b.innerHTML = (k.status === 'Done' ? '' : '<form id="ccf" class="cv-comp" novalidate><b style="font-size:14px">New comment</b><div class="cv-f">' +
      '<div><label>Visibility</label><div class="cv-seg" role="group" aria-label="Visibility"><button type="button" data-vis="public" class="on">Public</button><button type="button" data-vis="private">Private</button></div></div>' +
      '<div><label for="cc_ch">Type</label><select id="cc_ch">' + ['overwatch', 'phone_in', 'phone_out', 'customer'].map(function (c) { return '<option value="' + c + '">' + CH[c] + '</option>'; }).join('') + '</select></div>' +
      '<div><label for="cc_who">Who</label><input id="cc_who" list="cc_people" value="' + E(me()) + '" maxlength="100" style="width:150px"><datalist id="cc_people">' + people.map(function (p) { return '<option value="' + E(p) + '">'; }).join('') + '</datalist></div>' +
      '<div><label for="cc_at">Date and time</label><input id="cc_at" type="datetime-local" value="' + localNow() + '"></div></div>' +
      '<label for="cc_body" class="sr">Comment</label><textarea id="cc_body" maxlength="8000" placeholder="Comment…" style="min-height:70px"></textarea>' +
      '<div class="cv-f"><div><label>Time spent (private)</label><span class="row" style="gap:4px"><input id="cc_h" inputmode="numeric" value="0" style="width:50px" aria-label="Hours"> h <input id="cc_m" inputmode="numeric" value="0" style="width:56px" aria-label="Minutes"> min</span></div>' +
      '<div><label>Quick add</label><span class="row" style="gap:4px"><button type="button" class="cv-q" data-add="15">+15m</button><button type="button" class="cv-q" data-add="30">+30m</button><button type="button" class="cv-q" data-add="60">+1h</button></span></div>' +
      '<label class="cv-chk" id="cc_emw"><input type="checkbox" id="cc_em" checked> Email to customer</label><button class="b" type="submit" style="margin-left:auto">Save comment</button></div>' +
      '<p class="mute" style="font-size:12.5px;margin:6px 0 0">Time is never shown to the customer, even on a public comment.</p><div class="msg" id="ccm" role="status"></div></form>') +
      '<input id="cc_q" placeholder="Search comments…" aria-label="Search comments" style="margin:10px 0 4px"><div id="ccList"></div>';
    var vis = 'public';
    var syncEmail = function () { var w = $('cc_emw'); if (w) w.hidden = !(vis === 'public' && $('cc_ch').value === 'overwatch'); };
    if ($('ccf')) {
      b.querySelectorAll('[data-vis]').forEach(function (x) { x.onclick = function () { vis = x.getAttribute('data-vis'); b.querySelectorAll('[data-vis]').forEach(function (y) { y.classList.toggle('on', y === x); }); syncEmail(); }; });
      $('cc_ch').onchange = function () { var c = $('cc_ch').value; if ((c === 'customer' || c === 'phone_in') && $('cc_who').value === me()) $('cc_who').value = k.contact || cu.name || ''; if ((c === 'overwatch' || c === 'phone_out') && $('cc_who').value !== me()) $('cc_who').value = me(); syncEmail(); };
      b.querySelectorAll('[data-add]').forEach(function (x) { x.onclick = function () { var t = (Number($('cc_h').value) || 0) * 60 + (Number($('cc_m').value) || 0) + Number(x.getAttribute('data-add')); $('cc_h').value = Math.floor(t / 60); $('cc_m').value = t % 60; }; });
      syncEmail();
      $('ccf').onsubmit = function (e) {
        e.preventDefault();
        var at = $('cc_at').value ? new Date($('cc_at').value).toISOString() : '', mins = (Number($('cc_h').value) || 0) * 60 + (Number($('cc_m').value) || 0);
        msg('ccm', 'Saving…');
        OW.api('/admin/api/case-comment', { case_id: k.id, visibility: vis, channel: $('cc_ch').value, who: $('cc_who').value, at: at, body: $('cc_body').value, minutes: mins, email: vis === 'public' && $('cc_ch').value === 'overwatch' && $('cc_em').checked }).then(function (j) {
          if (!j.ok) return msg('ccm', j.error, true);
          OW.toast(j.emailed ? 'Saved and emailed to the customer.' : 'Comment saved.'); openCase(k.id, true); loadOpen();
        });
      };
    }
    var list = function (q) {
      q = (q || '').toLowerCase();
      $('ccList').innerHTML = k.comments.filter(function (c) { return !q || (c.body + ' ' + c.who).toLowerCase().indexOf(q) >= 0; }).map(function (c) {
        if (c.kind === 'event') return '<div class="cv-sys"><span>' + c.seq + '.</span><span>' + E(c.body) + ' on ' + E(when(c.at)) + '</span></div>';
        var ini = (c.who || '?').split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
        return '<div class="cv-c' + (c.visibility === 'private' ? ' pv' : '') + '"><span class="cv-n">' + c.seq + '.</span><span class="cv-av">' + E(ini) + '</span><div><div class="cv-hd"><b>' + E(c.who) + '</b><span>' + E(when(c.at)) + '</span><span class="cv-vis ' + (c.visibility === 'public' ? 'pub">PUBLIC' : 'pri">PRIVATE') + '</span><span class="mute">' + E(CH[c.channel] || '') + (c.emailed ? ' · emailed' : '') + '</span>' + (Number(c.minutes) ? '<span class="cv-tm">⏱ ' + hm(c.minutes) + '</span>' : '') + '</div><p>' + E(c.body) + '</p></div></div>';
      }).join('') || '<p class="mute">No comments yet.</p>';
    };
    list(); $('cc_q').oninput = function () { list($('cc_q').value); };
  }
  function detailsTab(b, k) {
    b.innerHTML = '<form id="cdf" novalidate><div class="two">' + fld('cd_title', 'Title', k.title, 'maxlength="160"') + '<div><label for="cd_type">Type</label><select id="cd_type">' + opt(C.meta.types, k.type) + '</select></div>' +
      fld('cd_due', 'Due date', k.due_date, 'type="date"') + fld('cd_contact', 'Contact', k.contact, 'maxlength="100"') +
      fld('cd_cdue', 'County notice due', k.county_due, 'type="date"') + fld('cd_cdone', 'County notified on', k.county_done, 'type="date"') + fld('cd_odue', 'Owner proof of repair due', k.owner_due, 'type="date"') + '</div>' +
      '<label for="cd_desc">Description</label><textarea id="cd_desc" maxlength="4000" style="min-height:100px">' + E(k.description) + '</textarea>' +
      '<div class="row" style="margin-top:10px"><button class="b" type="submit">Save details</button></div><div class="msg" id="cdm" role="status"></div></form>';
    $('cdf').onsubmit = function (e) {
      e.preventDefault();
      OW.api('/admin/api/case', { id: k.id, title: $('cd_title').value, type: $('cd_type').value, due_date: $('cd_due').value, contact: $('cd_contact').value, county_due: $('cd_cdue').value, county_done: $('cd_cdone').value, owner_due: $('cd_odue').value, description: $('cd_desc').value }).then(function (j) {
        if (!j.ok) return msg('cdm', j.error, true); OW.toast('Case saved.'); openCase(k.id, true); A.refresh(); loadOpen();
      });
    };
  }
  function itemForm(kind, it) {
    it = it || {}; var P = 'it_' + (it.id || 'new') + '_';
    var f = kind === 'part'
      ? fld(P + 'title', 'Part', it.title, 'maxlength="160"') + fld(P + 'qty', 'Quantity', it.qty || 1, 'type="number" min="1" max="9999" step="1" inputmode="numeric"') + fld(P + 'vendor', 'Vendor', it.vendor, 'maxlength="120"') + fld(P + 'part_no', 'Part no.', it.part_no, 'maxlength="120"') + fld(P + 'po', 'PO', it.po, 'maxlength="120"') + fld(P + 'cost', 'Cost ($)', it.cost, 'maxlength="30" inputmode="decimal"') + fld(P + 'eta', 'Expected', it.eta, 'type="date"')
      : fld(P + 'title', 'What is being returned', it.title, 'maxlength="160"') + fld(P + 'vendor', 'Vendor', it.vendor, 'maxlength="120"') + fld(P + 'rma_no', 'Vendor RMA no.', it.rma_no, 'maxlength="120"') + fld(P + 'tracking', 'Tracking', it.tracking, 'maxlength="120"') + fld(P + 'credit', 'Replacement or credit', it.credit, 'maxlength="60" placeholder="Credit $85 / replacement"') + fld(P + 'eta', 'Expected back', it.eta, 'type="date"');
    return '<form class="cv-item" data-kind="' + kind + '" data-id="' + E(it.id || '') + '" data-p="' + P + '" novalidate><div class="two">' + f + '<div><label for="' + P + 'status">Status</label><select id="' + P + 'status">' + opt(C.meta.item_status[kind], it.status || C.meta.item_status[kind][0]) + '</select></div></div>' +
      '<label for="' + P + 'notes">Notes</label><textarea id="' + P + 'notes" maxlength="1000" style="min-height:50px">' + E(it.notes || '') + '</textarea>' +
      '<div class="row" style="margin-top:8px"><button class="b" type="submit">' + (it.id ? 'Save ' + E(it.no) : (kind === 'part' ? 'Add part' : 'Add RMA')) + '</button>' + (it.id ? '' : '<button class="b alt" type="button" data-cv="cancelitem">Cancel</button>') + '</div><div class="msg" role="status"></div></form>';
  }
  function itemsTab(b, k, kind, adding) {
    var L = k.items.filter(function (i) { return i.kind === kind; });
    b.innerHTML = (adding ? itemForm(kind) : '') + (L.map(function (i) {
      return '<details class="cv-g" ' + (C.focus === i.id ? 'open' : '') + '><summary><span class="cno">' + E(i.no) + '</span> <b>' + (i.kind === 'part' && i.qty > 1 ? i.qty + ' × ' : '') + E(i.title) + '</b> ' + itemPill(i) + '<small class="mute" style="display:block;margin-left:16px">' + E([i.vendor, i.part_no && 'part ' + i.part_no, i.po && 'PO ' + i.po, i.cost && '$' + i.cost, i.rma_no && 'RMA ' + i.rma_no, i.tracking && 'tracking ' + i.tracking, i.credit, i.eta && 'expected ' + OW.date(i.eta)].filter(Boolean).join(' · ')) + '</small></summary>' + itemForm(kind, i) + '</details>';
    }).join('') || (adding ? '' : '<p class="mute">None yet.</p>')) + (adding || k.status === 'Done' ? '' : '<div class="row" style="margin-top:10px"><button class="b alt" data-cv="' + (kind === 'part' ? 'addpart' : 'addrma') + '">' + (kind === 'part' ? '+ Part' : '+ RMA') + '</button></div>');
    C.focus = null;
    b.querySelectorAll('form.cv-item').forEach(function (f) {
      f.onsubmit = function (e) {
        e.preventDefault(); var P = f.getAttribute('data-p'), g = function (n) { var x = document.getElementById(P + n); return x ? x.value : ''; };
        OW.api('/admin/api/case-item', { id: f.getAttribute('data-id') || undefined, case_id: k.id, kind: f.getAttribute('data-kind'), title: g('title'), qty: g('qty') || undefined, vendor: g('vendor'), part_no: g('part_no'), po: g('po'), cost: g('cost'), eta: g('eta'), rma_no: g('rma_no'), tracking: g('tracking'), credit: g('credit'), status: g('status'), notes: g('notes') }).then(function (j) {
          var m = f.querySelector('.msg'); if (!j.ok) { m.className = 'msg err'; m.textContent = j.error; return; }
          OW.toast(j.no ? j.no + ' added.' : 'Saved.'); openCase(k.id, true); A.refresh(); loadOpen();
        });
      };
    });
  }
  function setStatus(s) {
    OW.api('/admin/api/case', { id: C.cur.id, status: s }).then(function (j) {
      if (!j.ok) { msg('cvsm', j.error, true); if ($('cvStatus')) $('cvStatus').value = C.cur.status; return; }
      OW.toast(s === 'Done' ? C.cur.no + ' closed.' : 'Status: ' + s); openCase(C.cur.id, true); A.refresh(); loadOpen();
    });
  }

  document.addEventListener('change', function (e) { if (e.target.id === 'cvStatus') setStatus(e.target.value); });
  document.addEventListener('click', function (e) {
    var t = e.target;
    var cf = t.closest('[data-cf]'); if (cf) { C.filter = cf.getAttribute('data-cf'); return void drawOpen(); }
    var pk = t.closest('.pickcase');
    if (pk) { var id = pk.getAttribute('data-case'), cid = pk.getAttribute('data-cid'); C.tab = 'comments'; if (cid && (!A.S.d || A.S.d.customer.id !== cid)) { C.cur = { id: id, customer_id: cid }; return void A.select(cid); } return void openCase(id); }
    if (t.id === 'caseNew') return void newCase();
    var tb = t.closest('[data-tab]'); if (tb && C.cur) { C.tab = tb.getAttribute('data-tab'); $('caseView').querySelectorAll('[data-tab]').forEach(function (x) { x.classList.toggle('on', x === tb); }); return void drawTab(); }
    var gi = t.closest('[data-goitem]'); if (gi && C.cur) { var it = C.cur.items.filter(function (x) { return x.id === gi.getAttribute('data-goitem'); })[0]; if (it) { C.tab = it.kind; C.focus = it.id; draw(); } return; }
    var a = t.closest('[data-cv]'); if (!a || !C.cur) return;
    var act = a.getAttribute('data-cv');
    if (act === 'x') { C.cur = null; $('caseView').innerHTML = ''; return; }
    if (act === 'edit') { C.tab = 'details'; return void draw(); }
    if (act === 'close') return void setStatus('Done');
    if (act === 'reopen') return void setStatus('Open');
    if (act === 'email') { C.tab = 'comments'; draw(); var bd = $('cc_body'); if (bd) { bd.focus(); bd.scrollIntoView({ behavior: 'smooth', block: 'center' }); } return; }
    if (act === 'addpart' || act === 'addrma') { C.tab = act === 'addpart' ? 'part' : 'rma'; draw(); return void itemsTab($('cvBody'), C.cur, C.tab, true); }
    if (act === 'cancelitem') return void drawTab();
  });
  loadOpen();
  A.reloadCases = loadOpen;
})();
