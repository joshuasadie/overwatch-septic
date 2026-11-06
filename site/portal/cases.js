// Customer portal: "Your requests" (OWS cases). The customer sees their own cases, the exact status and public comments only.
(function () {
  var $ = OW.$, E = OW.esc, L = [], openId = null;
  var when = function (iso) { return iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; };
  var pill = function (s) { return '<span class="pill" style="color:' + (s === 'Done' ? 'var(--good)' : s === 'Duplicate' ? 'var(--mute)' : s === 'Open' ? 'var(--ink)' : 'var(--warn)') + '">' + E(s) + '</span>'; };
  function load() { return OW.api('/portal/api/cases').then(function (j) { if (!j.ok) return; L = j.cases; draw(); }); }
  function draw() {
    var box = $('reqs'); if (!box) return;
    var k = L.filter(function (x) { return x.id === openId; })[0];
    box.innerHTML = '<h2>Your requests</h2><ul class="list">' + (L.map(function (x) {
      return '<li class="pickreq" data-req="' + x.id + '" style="cursor:pointer"><span><span class="cno">' + E(x.no) + '</span> <b>' + E(x.title) + '</b><small>' + (x.dup_of ? 'Duplicate of ' + E(x.dup_of.no) + ' · <a href="#" class="pickreq" data-req="' + x.dup_of.id + '" style="color:var(--brz)">view ' + E(x.dup_of.no) + '</a>' : x.status === 'Done' ? 'Closed ' + E(OW.date(x.closed_at)) : 'Opened ' + E(OW.date(x.created_at)) + ' · updated ' + E(OW.date(x.updated_at))) + '</small></span>' + pill(x.status) + '</li>';
    }).join('') || '<li class="mute">No requests yet.</li>') + '</ul>' +
      (k ? '<div style="margin-top:14px"><h3 style="margin:0 0 2px"><span class="cno">' + E(k.no) + '</span> ' + E(k.title) + '</h3><p class="mute" style="margin:0 0 6px">Status: ' + E(k.status) + (k.dup_of ? ' of <a href="#" class="pickreq" data-req="' + k.dup_of.id + '" style="color:var(--brz)">' + E(k.dup_of.no) + '</a>' : '') + '</p>' +
        (k.comments.map(function (c) { return '<div class="cv-c" style="grid-template-columns:1fr"><div><div class="cv-hd"><b>' + (c.from === 'you' ? 'You' : 'Overwatch Septic') + '</b><span class="mute">' + E(when(c.at)) + (c.how ? ' · ' + E(c.how) : '') + '</span></div><p>' + E(c.body) + '</p></div></div>'; }).join('') || '<p class="mute">No messages yet.</p>') +
        (k.status === 'Duplicate' ? '<p class="mute">This request is a duplicate. Updates continue on ' + E(k.dup_of ? k.dup_of.no : 'the other request') + '.</p>' : k.status === 'Done' ? '<p class="mute">This request is closed. Open a new request if you need anything else.</p>' : '<form id="rqf" novalidate><label for="rq_b">Write a message</label><textarea id="rq_b" maxlength="4000"></textarea><div class="row" style="margin-top:8px"><button class="b" type="submit">Send</button></div><div class="msg" id="rqm" role="status"></div></form>') + '</div>' : '') +
      '<div class="row" style="margin-top:12px"><button class="b alt" id="rqNew">New request</button></div><div id="rqNewBox"></div>';
    if ($('rqf')) $('rqf').onsubmit = function (e) {
      e.preventDefault(); var m = $('rqm');
      OW.api('/portal/api/case-comment', { case_id: k.id, body: $('rq_b').value }).then(function (j) { if (!j.ok) { m.className = 'msg err'; m.textContent = j.error; return; } OW.toast('Message sent.'); load(); });
    };
  }
  document.addEventListener('click', function (e) {
    var p = e.target.closest('a.pickreq') || e.target.closest('.pickreq'); if (p) { e.preventDefault(); var rid = p.getAttribute('data-req'); openId = p.tagName === 'A' ? rid : (openId === rid ? null : rid); return void draw(); }
    if (e.target.id === 'rqNew') {
      $('rqNewBox').innerHTML = '<form id="rqn" novalidate style="margin-top:10px"><label for="rqn_t">What do you need help with?</label><input id="rqn_t" maxlength="160" placeholder="Alarm going off"><label for="rqn_b">Details</label><textarea id="rqn_b" maxlength="4000" placeholder="What you noticed and when"></textarea><p class="mute" style="font-size:14px;margin:6px 0 0">If sewage is backing up into your home, call us as well.</p><div class="row" style="margin-top:8px"><button class="b" type="submit">Send request</button></div><div class="msg" id="rqnm" role="status"></div></form>';
      $('rqn_t').focus();
      $('rqn').onsubmit = function (ev) {
        ev.preventDefault(); var m = $('rqnm');
        OW.api('/portal/api/case', { title: $('rqn_t').value, body: $('rqn_b').value }).then(function (j) { if (!j.ok) { m.className = 'msg err'; m.textContent = j.error; return; } OW.toast('Request ' + j.no + ' sent.'); openId = j.id; load(); });
      };
    }
  });
  load();
})();
