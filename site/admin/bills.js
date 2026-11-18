// Invoices to anyone (INV-00101…): an engineer, a contractor, a property manager, or a customer for one-off work.
// Draft → Send (the PDF is made here with pdf-lib and attached to the email) → Pay link or check → Record payment.
(function () {
  var $ = OW.$, E = OW.esc, d2 = OW.d2, L = { bills: [], contacts: [], customers: [], next_no: '' }, cur = null;
  var TERMS = { 30: 'Net 30', 15: 'Net 15', 0: 'Due on receipt' };
  function msg(t, bad) { var m = $('blm'); if (m) { m.className = 'msg' + (bad ? ' err' : ''); m.textContent = t; } }
  function today() { return new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10); }
  function dueOf(b) { if (b.due_date) return b.due_date; var d = new Date(today() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + Number(b.terms || 0)); return d.toISOString().slice(0, 10); }
  function money(c) { return d2((c || 0) / 100); }
  function iso(v) {
    v = String(v || '').trim(); if (!v || /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    var y = +today().slice(0, 4), d = new Date(v + (/\d{4}/.test(v) ? '' : ' ' + y)); if (isNaN(d)) return '';
    var out = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    if (!/\d{4}/.test(v) && out > today()) out = (y - 1) + out.slice(4);
    return out;
  }
  function shown(v) { return /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? OW.date(v) : v || ''; }
  function load() { return OW.api('/admin/api/bills').then(function (j) { if (!j.ok) return; L = j; if (!cur) draw(); }); }
  function blank() { return { id: '', no: L.next_no, state: 'draft', who: 'other', bill_name: '', greet: '', bill_company: '', bill_email: '', bill_address: '', contact_id: '', customer_id: '', job: '', lines: [{ date: today(), desc: '', amount: '' }], per_line: false, total: '', terms: 30, pay_online: true, pay_check: true, reminders: 'one', notes: '', save_contact: true }; }
  function fromBill(b) { var c = JSON.parse(JSON.stringify(b)); c.who = b.customer_id ? 'customer' : 'other'; c.total = (b.total_cents / 100).toFixed(2); c.lines = b.lines.map(function (l) { return { date: iso(l.date), desc: l.desc, amount: l.cents == null ? '' : (l.cents / 100).toFixed(2) }; }); c.save_contact = false; return c; }

  function draw() {
    var box = $('billBox'); if (!box) return;
    if (!cur) {
      var drafts = L.bills.filter(function (b) { return b.state === 'draft'; }), done = L.bills.filter(function (b) { return b.state !== 'draft'; });
      box.innerHTML = (drafts.length ? '<h3 style="margin:14px 0 4px">Drafts</h3><ul class="list">' + drafts.map(function (b) { return '<li><span><b>' + E(b.no) + ' &middot; ' + E(b.bill_name) + '</b><small>' + money(b.total_cents) + (b.job ? ' &middot; ' + E(b.job) : '') + '</small></span><button class="b alt" data-bill="' + b.id + '">Open</button></li>'; }).join('') + '</ul>' : '') +
        '<div class="row" style="margin-top:10px"><button class="b" id="billNew">New invoice</button></div>' +
        (done.length ? '<details style="margin-top:10px"><summary class="sm" style="cursor:pointer">Invoices you wrote (' + done.length + ')</summary><ul class="list">' + done.map(function (b) { return '<li><span><b>' + E(b.no) + ' &middot; ' + E(b.bill_name) + '</b><small>' + money(b.total_cents) + ' &middot; ' + E(stateOf(b)) + '</small></span><button class="b alt" data-bill="' + b.id + '">Open</button></li>'; }).join('') + '</ul></details>' : '');
      $('billNew').onclick = function () { cur = blank(); draw(); };
      return;
    }
    if (cur.state !== 'draft') return drawSent();
    var c = cur, who = c.who === 'customer';
    box.innerHTML = '<form id="blf" novalidate style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px"><h3 style="margin:0 0 8px">' + (c.id ? 'Draft invoice ' : 'New invoice ') + '<span class="mute">' + E(c.no) + '</span></h3>' +
      '<label>Bill to</label><div class="row" style="gap:0"><button type="button" class="b' + (who ? '' : ' alt') + '" data-who="customer" style="border-radius:8px 0 0 8px">A customer</button><button type="button" class="b' + (who ? ' alt' : '') + '" data-who="other" style="border-radius:0 8px 8px 0">Someone else</button></div>' +
      (who ? '<label for="bl_cust">Customer</label><select id="bl_cust"><option value="">Choose…</option>' + L.customers.map(function (x) { return '<option value="' + x.id + '"' + (x.id === c.customer_id ? ' selected' : '') + '>' + E(x.name) + '</option>'; }).join('') + '</select><p class="mute sm" style="margin:4px 0 0">Fills in their name, email and address. Use this for one-off work outside their agreement.</p>'
        : '<label for="bl_k">From your contacts</label><select id="bl_k"><option value="">New person…</option>' + L.contacts.map(function (x) { return '<option value="' + x.id + '"' + (x.id === c.contact_id ? ' selected' : '') + '>' + E(x.name) + (x.company ? ' (' + E(x.company) + ')' : '') + '</option>'; }).join('') + '</select><p class="mute sm" style="margin:4px 0 0">They don\'t get a portal login.</p>') +
      '<div class="two"><div><label for="bl_n">Name on the invoice</label><input id="bl_n" maxlength="120" value="' + E(c.bill_name) + '"></div><div><label for="bl_g">Greeting (Hello …)</label><input id="bl_g" maxlength="60" value="' + E(c.greet) + '" placeholder="First name"></div>' +
      '<div><label for="bl_co">Company or title</label><input id="bl_co" maxlength="120" value="' + E(c.bill_company) + '"></div><div><label for="bl_e">Email (the invoice goes here)</label><input id="bl_e" type="email" maxlength="254" value="' + E(c.bill_email) + '"></div></div>' +
      '<label for="bl_a">Mailing address</label><input id="bl_a" maxlength="240" value="' + E(c.bill_address) + '">' +
      (who ? '' : '<label class="chk" style="display:flex;gap:8px;align-items:center;font-weight:400;margin-top:6px"><input type="checkbox" id="bl_sc" style="width:auto;min-height:0"' + (c.save_contact ? ' checked' : '') + '> ' + (c.contact_id ? 'Save this address to their contact' : 'Save to Contacts') + '</label>') +
      '<label for="bl_j">Job or project</label><input id="bl_j" maxlength="200" value="' + E(c.job) + '" placeholder="Property, permit or job name">' +
      '<label style="margin-top:10px">Work</label><div class="tw"><table><thead><tr><th style="width:20%;min-width:150px">Date</th><th>Description</th>' + (c.per_line ? '<th style="width:16%">Amount</th>' : '') + '<th style="width:1%"></th></tr></thead><tbody>' +
      c.lines.map(function (l, i) { return '<tr><td><input type="date" data-l="' + i + '" data-f="date" value="' + E(iso(l.date)) + '"></td><td><input data-l="' + i + '" data-f="desc" maxlength="300" value="' + E(l.desc) + '"></td>' + (c.per_line ? '<td><input data-l="' + i + '" data-f="amount" inputmode="decimal" value="' + E(l.amount) + '" style="text-align:right"></td>' : '') + '<td>' + (c.lines.length > 1 ? '<button type="button" class="b alt" data-ldel="' + i + '" aria-label="Remove line">&times;</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="row" style="gap:12px;margin-top:6px;align-items:center"><button type="button" class="b alt" id="bl_add">Add line</button><label style="display:flex;gap:8px;align-items:center;font-weight:400;margin:0"><input type="checkbox" id="bl_pl" style="width:auto;min-height:0"' + (c.per_line ? ' checked' : '') + '> Price each line separately</label></div>' +
      '<div class="two"><div><label for="bl_t">Total</label><input id="bl_t" inputmode="decimal" value="' + E(c.per_line ? '' : c.total) + '"' + (c.per_line ? ' disabled placeholder="Adds up the lines"' : ' placeholder="2500"') + '></div><div><label for="bl_terms">Due</label><select id="bl_terms">' + [30, 15, 0].map(function (t) { return '<option value="' + t + '"' + (Number(c.terms) === t ? ' selected' : '') + '>' + TERMS[t] + '</option>'; }).join('') + '</select></div></div>' +
      '<label style="margin-top:10px">How they can pay</label><label style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" id="bl_po" style="width:auto;min-height:0"' + (c.pay_online ? ' checked' : '') + '> Online (card or bank) with a Pay link</label><label style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" id="bl_pc" style="width:auto;min-height:0"' + (c.pay_check ? ' checked' : '') + '> Check payable to Overwatch Septic, LLC</label>' +
      '<label style="margin-top:10px">Reminders</label><label style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="radio" name="bl_r" value="one" style="width:auto;min-height:0"' + (c.reminders !== 'none' ? ' checked' : '') + '> One polite reminder at 15 days, then tell me if it\'s past due</label><label style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="radio" name="bl_r" value="none" style="width:auto;min-height:0"' + (c.reminders === 'none' ? ' checked' : '') + '> No reminders to them (still tell me if it\'s past due)</label>' +
      '<label for="bl_no">Note on the invoice (optional)</label><textarea id="bl_no" maxlength="1000">' + E(c.notes) + '</textarea>' +
      '<div class="row" style="margin-top:12px;gap:8px"><button class="b" type="submit">Send invoice</button><button class="b alt" type="button" id="bl_pv">Preview PDF</button><button class="b alt" type="button" id="bl_sv">Save draft</button>' + (c.id ? '<button class="b danger" type="button" id="bl_del">Delete draft</button>' : '') + '<button class="b alt" type="button" id="bl_x">Cancel</button></div><div class="msg" id="blm" role="status"></div></form>';
    wire();
  }
  function grab() {
    var c = cur; if (!$('blf')) return c;
    ['bill_name:bl_n', 'greet:bl_g', 'bill_company:bl_co', 'bill_email:bl_e', 'bill_address:bl_a', 'job:bl_j', 'notes:bl_no'].forEach(function (p) { p = p.split(':'); c[p[0]] = $(p[1]).value; });
    if (!c.per_line) c.total = $('bl_t').value;
    c.terms = Number($('bl_terms').value); c.pay_online = $('bl_po').checked; c.pay_check = $('bl_pc').checked;
    var r = document.querySelector('input[name="bl_r"]:checked'); c.reminders = r ? r.value : 'one';
    if ($('bl_sc')) c.save_contact = $('bl_sc').checked;
    [].forEach.call(document.querySelectorAll('#blf [data-l]'), function (x) { c.lines[+x.getAttribute('data-l')][x.getAttribute('data-f')] = x.value; });
    return c;
  }
  function wire() {
    $('blf').onsubmit = function (e) { e.preventDefault(); send(); };
    [].forEach.call(document.querySelectorAll('#blf [data-who]'), function (x) { x.onclick = function () { grab(); cur.who = x.getAttribute('data-who'); if (cur.who === 'other') cur.customer_id = ''; else cur.contact_id = ''; draw(); }; });
    if ($('bl_cust')) $('bl_cust').onchange = function () { grab(); var x = L.customers.filter(function (k) { return k.id === this.value; }, this)[0]; cur.customer_id = this.value; if (x) { cur.bill_name = x.name; cur.greet = x.name.split(/[\s,]+/)[0]; cur.bill_email = x.email; cur.bill_address = x.address; cur.bill_company = ''; } draw(); };
    if ($('bl_k')) $('bl_k').onchange = function () { grab(); var x = L.contacts.filter(function (k) { return k.id === this.value; }, this)[0]; cur.contact_id = this.value; if (x) { cur.bill_name = x.name; cur.greet = x.name.split(/[\s,]+/)[0]; cur.bill_email = x.email; cur.bill_address = x.address; cur.bill_company = x.company; cur.save_contact = !x.address; } draw(); };
    $('bl_add').onclick = function () { grab(); cur.lines.push({ date: today(), desc: '', amount: '' }); draw(); };
    $('bl_pl').onchange = function () { grab(); cur.per_line = this.checked; draw(); };
    [].forEach.call(document.querySelectorAll('#blf [data-ldel]'), function (x) { x.onclick = function () { grab(); cur.lines.splice(+x.getAttribute('data-ldel'), 1); draw(); }; });
    $('bl_x').onclick = function () { cur = null; load().then(draw); };
    $('bl_sv').onclick = function () { save().then(function (j) { if (j) { OW.toast('Draft ' + j.no + ' saved.'); cur = null; load(); } }); };
    $('bl_pv').onclick = function () { save().then(function (j) { if (!j) return; return OW.api('/admin/api/bill/' + j.id).then(function (k) { if (k.ok) return OW.billPdf(k.bill).then(function (bytes) { OW.download(bytes, k.bill.no + '-preview.pdf'); }); }); }); };
    if ($('bl_del')) $('bl_del').onclick = function () { if (!confirm('Delete this draft?')) return; OW.api('/admin/api/bill-void', { id: cur.id }).then(function () { OW.toast('Draft deleted.'); cur = null; load(); }); };
  }
  function body() {
    var c = grab();
    return { id: c.id || undefined, bill_name: c.bill_name, greet: c.greet, bill_company: c.bill_company, bill_email: c.bill_email, bill_address: c.bill_address, contact_id: c.who === 'other' ? c.contact_id : '', customer_id: c.who === 'customer' ? c.customer_id : '', job: c.job, per_line: c.per_line, total: c.total, terms: c.terms, pay_online: c.pay_online, pay_check: c.pay_check, reminders: c.reminders, notes: c.notes, save_contact: c.who === 'other' && c.save_contact, lines: c.lines.map(function (l) { return { date: l.date, desc: l.desc, amount: l.amount }; }) };
  }
  // Save the draft; resolves with { id, no } or null (and shows the problem).
  function save() {
    return OW.api('/admin/api/bill', body()).then(function (j) { if (!j.ok) { msg(j.error, true); return null; } cur.id = j.id; cur.no = j.no; if (cur.who === 'other' && j.contact_id) { cur.contact_id = j.contact_id; cur.save_contact = false; } return j; });
  }
  function b64(bytes) { var s = ''; for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
  function sendNow(b, again) {
    return OW.billPdf(b).then(function (bytes) { return OW.api('/admin/api/bill-send', { id: b.id, pdf: b64(bytes) }); }).then(function (j) {
      if (!j.ok) { msg(j.error, true); OW.toast(j.error); return; }
      OW.toast(again ? 'Sent again to ' + b.bill_email + '.' : b.no + ' sent to ' + b.bill_email + '.'); cur = null; load(); if (OWA && OWA.refresh) OWA.refresh();
    });
  }
  function send() {
    save().then(function (j) {
      if (!j) return;
      return OW.api('/admin/api/bill/' + j.id).then(function (k) {
        if (!k.ok) return msg(k.error, true);
        var b = k.bill;
        if (!confirm('Send ' + b.no + ' for ' + money(b.total_cents) + ' to ' + b.bill_name + ' <' + b.bill_email + '>? It is due ' + (Number(b.terms) === 0 ? 'on receipt' : OW.date(dueOf(b))) + '.')) return;
        msg('Sending…'); return sendNow(b, false);
      });
    });
  }
  function stateOf(b) {
    if (b.state === 'void' || b.note === 'Voided') return 'Voided';
    if (b.status === 'paid') return 'Paid ' + OW.date(b.paid_at);
    if (b.state === 'sent') return (b.due_date && b.due_date < today() ? 'Past due since ' : 'Sent, due ') + OW.date(b.due_date);
    return 'Draft';
  }
  function drawSent() {
    var b = cur, open = b.state === 'sent' && b.status === 'open';
    $('billBox').innerHTML = '<div style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px"><h3 style="margin:0 0 4px">' + E(b.no) + ' &middot; ' + E(b.bill_name) + ' <span class="pill ' + (b.status === 'paid' ? 'good' : open && b.due_date < today() ? 'bad' : open ? 'warn' : 'mute') + '">' + E(stateOf(b)) + '</span></h3>' +
      '<p class="mute sm" style="margin:0 0 8px">' + E([b.job, money(b.total_cents), 'sent ' + OW.date(b.sent_date) + ' to ' + b.bill_email].filter(Boolean).join(' · ')) + '</p>' +
      '<ul class="list">' + b.lines.map(function (l) { return '<li><span>' + (l.date ? '<b>' + E(shown(l.date)) + ':</b> ' : '') + E(l.desc) + '</span>' + (b.per_line ? '<span>' + money(l.cents) + '</span>' : '') + '</li>'; }).join('') + '</ul>' +
      '<div class="row" style="gap:8px;margin-top:10px">' + (open ? '<button class="b" id="bs_paid">Record check payment</button>' : '') + '<button class="b alt" id="bs_pdf">Download PDF</button>' + (open ? '<button class="b alt" id="bs_re">Resend</button>' + (b.pay_online ? '<button class="b alt" id="bs_link">Copy pay link</button>' : '') + '<button class="b danger" id="bs_void">Void</button>' : '') + '<button class="b alt" id="bs_x">Close</button></div><div class="msg" id="blm" role="status"></div></div>';
    $('bs_x').onclick = function () { cur = null; draw(); };
    $('bs_pdf').onclick = function () { OW.billPdf(b).then(function (bytes) { OW.download(bytes, b.no + '.pdf'); }); };
    if (!open) return;
    $('bs_paid').onclick = function () { if (!confirm('Record ' + b.no + ' as paid (check or cash)? ' + b.bill_name + ' gets a thank-you email.')) return; OW.api('/admin/api/invoice-paid', { id: b.id }).then(function (j) { j.ok ? OW.toast('Recorded as paid.') : OW.toast(j.error); cur = null; load(); if (OWA && OWA.refresh) OWA.refresh(); }); };
    $('bs_re').onclick = function () { if (confirm('Email ' + b.no + ' to ' + b.bill_email + ' again?')) sendNow(b, true); };
    if ($('bs_link')) $('bs_link').onclick = function () { var u = location.origin + b.pay_url; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { OW.toast('Pay link copied.'); }, function () { prompt('Pay link', u); }); };
    $('bs_void').onclick = function () { if (!confirm('Void ' + b.no + '? The pay link stops working. ' + b.bill_name + ' is not emailed.')) return; OW.api('/admin/api/bill-void', { id: b.id }).then(function (j) { j.ok ? OW.toast(b.no + ' voided.') : OW.toast(j.error); cur = null; load(); if (OWA && OWA.refresh) OWA.refresh(); }); };
  }
  document.addEventListener('click', function (e) {
    var o = e.target.closest('[data-bill]'); if (!o) return; e.preventDefault();
    OW.api('/admin/api/bill/' + o.getAttribute('data-bill')).then(function (j) { if (!j.ok) return OW.toast(j.error); cur = j.bill.state === 'draft' ? fromBill(j.bill) : j.bill; draw(); var bx = $('billBox'); if (bx) bx.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  });
  load();
})();
