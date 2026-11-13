// View-only logins: name, email, and a tick for each system they may see. No contacts, no billing, nothing editable.
(function () {
  var $ = OW.$, E = OW.esc, L = { viewers: [], customers: [] }, cur = null;
  function load() { return OW.api('/admin/api/viewers').then(function (j) { if (!j.ok) return; L = j; $('vwN').textContent = L.viewers.length ? '(' + L.viewers.length + ')' : ''; draw(); }); }
  function when(t) { return t ? new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }) : 'never'; }
  function draw() {
    var b = $('vwBody'); if (!b) return;
    if (!cur) {
      b.innerHTML = '<p class="mute" style="margin:0 0 6px">People who can sign in and look, never change anything. They see only the systems you tick: system details, reports, readings and open cases with public notes. Never your contacts, customer phone or email, private notes, time, costs, estimates or invoices.</p><ul class="list">' +
        (L.viewers.map(function (v) { return '<li><span><b>' + E(v.name) + '</b><small>' + E(v.email) + ' &middot; ' + v.customer_ids.length + ' system' + (v.customer_ids.length === 1 ? '' : 's') + ' &middot; last signed in ' + E(when(v.last_login)) + '</small></span><button class="b alt" data-vw="' + v.id + '">Open</button></li>'; }).join('') || '<li class="mute">None yet.</li>') +
        '</ul><div class="row" style="margin-top:8px"><button class="b alt" id="vwNew">New view-only login</button></div>';
      $('vwNew').onclick = function () { cur = { id: '', name: '', email: '', customer_ids: [] }; draw(); };
      return;
    }
    var first = (cur.name || 'they').split(' ')[0];
    b.innerHTML = '<form id="vwf" novalidate><div class="two"><div><label for="vw_n">Name</label><input id="vw_n" maxlength="100" value="' + E(cur.name) + '"></div><div><label for="vw_e">Email (they sign in with a link sent here)</label><input id="vw_e" type="email" maxlength="254" value="' + E(cur.email) + '"></div></div>' +
      '<label style="margin-top:10px">Systems ' + E(cur.name ? first : 'they') + ' can see</label><div id="vw_list">' +
      (L.customers.map(function (c) { return '<label style="display:flex;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line);font-weight:400"><input type="checkbox" value="' + c.id + '" style="width:auto;min-height:0"' + (cur.customer_ids.indexOf(c.id) >= 0 ? ' checked' : '') + '><span><b>' + E(c.name) + '</b>' + (c.address ? ' &middot; ' + E(c.address) : '') + (c.sys ? ' &middot; ' + E(c.sys) : '') + (c.zone_word === 'Zone' && c.zones ? ', ' + c.zones + ' zones' : '') + '</span></label>'; }).join('') || '<p class="mute">No customers yet.</p>') + '</div>' +
      '<div class="row" style="margin-top:12px"><button class="b" type="submit" data-inv="1">' + (cur.id ? 'Save' : 'Save and email ' + E(cur.name ? first : 'them') + ' a sign-in link') + '</button>' + (cur.id ? '<button class="b alt" type="button" id="vwInv">Save and email a new sign-in link</button><button class="b danger" type="button" id="vwDel">Remove access</button>' : '') + '<button class="b alt" type="button" id="vwX">Cancel</button></div><div class="msg" id="vwm" role="status"></div>' +
      (cur.id ? '<p class="mute sm">Last signed in: ' + E(when(cur.last_login)) + '.</p><details><summary class="sm" style="cursor:pointer">What they opened</summary><ul class="list" id="vwLog"><li class="mute">Loading…</li></ul></details>' : '') + '</form>';
    $('vw_n').oninput = function () { cur.name = this.value; };
    function save(inv) {
      var body = { id: cur.id || undefined, name: $('vw_n').value, email: $('vw_e').value, customer_ids: [].slice.call(document.querySelectorAll('#vw_list input:checked')).map(function (x) { return x.value; }), invite: inv };
      OW.api('/admin/api/viewer', body).then(function (j) { if (!j.ok) { $('vwm').className = 'msg err'; $('vwm').textContent = j.error; return; } OW.toast('Saved' + (inv ? (j.emailed ? ' and emailed a sign-in link.' : '. The email did not send.') : '.')); cur = null; load(); });
    }
    $('vwf').onsubmit = function (e) { e.preventDefault(); save(!cur.id); };
    $('vwX').onclick = function () { cur = null; draw(); };
    if ($('vwInv')) $('vwInv').onclick = function () { save(true); };
    if ($('vwDel')) $('vwDel').onclick = function () { if (!confirm('Remove ' + cur.name + "'s access? They are signed out right away.")) return; OW.api('/admin/api/viewer-delete', { id: cur.id }).then(function () { OW.toast('Access removed.'); cur = null; load(); }); };
    if (cur.id) OW.api('/admin/api/viewer-log/' + cur.id).then(function (j) { var u = $('vwLog'); if (u && j.ok) u.innerHTML = j.log.map(function (x) { return '<li><span>' + E(x.what) + '<small>' + E(when(x.at)) + '</small></span></li>'; }).join('') || '<li class="mute">Nothing yet.</li>'; });
  }
  document.addEventListener('click', function (e) { var o = e.target.closest('[data-vw]'); if (!o) return; var v = L.viewers.filter(function (x) { return x.id === o.getAttribute('data-vw'); })[0]; if (v) { cur = JSON.parse(JSON.stringify(v)); draw(); } });
  load();
})();
