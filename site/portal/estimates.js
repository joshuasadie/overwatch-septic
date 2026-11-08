// Customer portal: "Your estimates". Prices only. Accept (typed name), decline, or ask a question.
(function () {
  var $ = OW.$, E = OW.esc, L = [], cust = {}, openId = null, mode = '';
  var ST = { sent: ['Waiting for your answer', 'warn'], accepted: ['Accepted', 'good'], declined: ['Declined', 'mute'], invoiced: ['Accepted', 'good'] };
  function load() { return OW.api('/portal/api/estimates').then(function (j) { if (!j.ok) return; L = j.estimates; cust = j.customer; draw(); }); }
  function draw() {
    var box = $('ests'); if (!box) return; box.hidden = !L.length; if (!L.length) return;
    var e = L.filter(function (x) { return x.id === openId; })[0];
    box.innerHTML = '<h2>Your estimates</h2><ul class="list">' + L.map(function (x) {
      var st = x.expired ? ['Expired', 'mute'] : ST[x.status] || [x.status, 'mute'];
      return '<li><span><span class="cno">' + E(x.no) + '</span> <b>' + E(x.title) + '</b><small>' + OW.d2(x.total) + (x.pending ? ' + items pending' : '') + (x.valid_until && x.status === 'sent' ? ' · good until ' + E(OW.date(x.valid_until)) : '') + '</small></span><span class="row"><span class="pill ' + st[1] + '">' + st[0] + '</span><button class="b' + (x.status === 'sent' && !x.expired ? '' : ' alt') + '" data-estv="' + x.id + '">' + (x.status === 'sent' && !x.expired ? 'Review' : 'View') + '</button></span></li>';
    }).join('') + '</ul>' + (e ? '<div style="margin-top:14px">' + OW.estimateHtml(e, cust) +
      '<div class="row" style="margin-top:10px">' + (e.status === 'sent' && !e.expired ? '<button class="b" data-esta="accept">Accept</button><button class="b alt" data-esta="decline">Decline</button>' : '') + '<button class="b alt" data-esta="ask">Ask a question</button><button class="b alt" data-esta="pdf">Download PDF</button><button class="b alt" data-esta="close">Close</button></div>' +
      (mode === 'accept' ? '<form id="esf" novalidate style="margin-top:10px"><label for="es_nm">Type your full name to accept this estimate</label><input id="es_nm" autocomplete="name" maxlength="100"><p class="mute" style="font-size:14px;margin:6px 0">By accepting, you approve the work listed for ' + OW.d2(e.total) + '. We will contact you to schedule it, and you will get an invoice.</p><button class="b" type="submit">Accept estimate</button><div class="msg" id="esm" role="status"></div></form>' : '') +
      (mode === 'decline' ? '<form id="esf" novalidate style="margin-top:10px"><label for="es_rs">Reason (optional)</label><textarea id="es_rs" maxlength="1000"></textarea><button class="b" type="submit" style="margin-top:8px">Decline estimate</button><div class="msg" id="esm" role="status"></div></form>' : '') +
      (mode === 'ask' ? '<form id="esf" novalidate style="margin-top:10px"><label for="es_q">Your question</label><textarea id="es_q" maxlength="4000"></textarea><button class="b" type="submit" style="margin-top:8px">Send question</button><div class="msg" id="esm" role="status"></div></form>' : '') + '</div>' : '');
    var f = $('esf'); if (!f) return;
    var inp = $('es_nm') || $('es_rs') || $('es_q'); inp.focus();
    f.onsubmit = function (ev) {
      ev.preventDefault(); var btn = f.querySelector('button'); btn.disabled = true;
      var url = '/portal/api/estimate-' + (mode === 'ask' ? 'question' : mode), body = { id: e.id, name: mode === 'accept' ? inp.value : undefined, reason: mode === 'decline' ? inp.value : undefined, body: mode === 'ask' ? inp.value : undefined };
      OW.api(url, body).then(function (j) {
        btn.disabled = false; if (!j.ok) { $('esm').className = 'msg err'; $('esm').textContent = j.error; return; }
        OW.toast(mode === 'accept' ? 'Thank you. Estimate accepted.' : mode === 'decline' ? 'Estimate declined.' : 'Question sent. You will see our answer under Your requests.');
        mode = ''; load(); if (window.OWP && OWP.reloadCases) OWP.reloadCases();
      });
    };
  }
  document.addEventListener('click', function (ev) {
    var v = ev.target.closest('[data-estv]'); if (v) { openId = v.getAttribute('data-estv'); mode = ''; draw(); $('ests').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    var a = ev.target.closest('[data-esta]'); if (!a) return; var k = a.getAttribute('data-esta'), e = L.filter(function (x) { return x.id === openId; })[0];
    if (k === 'close') { openId = null; mode = ''; return draw(); }
    if (k === 'pdf') return void OW.estimatePdf(e, cust).then(function (b) { OW.download(b, e.no + '.pdf'); });
    mode = mode === k ? '' : k; draw();
  });
  load();
})();
