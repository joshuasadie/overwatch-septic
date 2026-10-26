/* Renders the two inspection reports as HTML. Used in the browser and in the Worker (county link page). Needs inspect-core.js first. */
(function (g) {
  var OWI = g.OWI;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var dt = function (iso) { if (!iso) return ''; var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); if (!m) return iso; return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1]; };
  var v = function (x, u) { return x === null || x === undefined || x === '' ? '-' : x + (u ? ' ' + u : ''); };
  OWI.esc = esc; OWI.dt = dt;
  OWI.CSS = '.rp{font:15px/1.5 Georgia,"Times New Roman",serif;color:#111;background:#fff;border:1px solid #ccc;border-radius:6px;padding:18px 20px;max-width:760px}.rp h2{font:700 22px Georgia,serif;margin:0 0 4px}.rp h3{font:700 16px Georgia,serif;margin:16px 0 4px}.rp p{margin:4px 0}.rp table{width:100%;border-collapse:collapse;font-size:14px;margin:4px 0}.rp th,.rp td{text-align:left;padding:4px 6px;border-bottom:1px solid #ccc;vertical-align:top}.rp th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#444}.rp .g{color:#1f6b3f}.rp .w{color:#a14a05}.rp .b{color:#a31f18}.rp .c{color:#444}.rp .ov{border:2px solid;border-radius:6px;padding:10px 12px;margin:10px 0}.rp .ov.g{border-color:#1f6b3f}.rp .ov.w{border-color:#a14a05}.rp .ov.b{border-color:#a31f18}.rp .ov.todo{border-color:#a14a05}.rp .ov.todo u{text-decoration-thickness:1.5px;text-underline-offset:3px}.rp .grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 16px}.rp .sm{font-size:12px;color:#444}.rp .tw{overflow-x:auto}.rp ol{margin:4px 0;padding-left:22px}.rp .ph{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0}.rp .ph img{width:150px;height:110px;object-fit:cover;border-radius:4px;border:1px solid #ccc}@media(max-width:560px){.rp .grid{grid-template-columns:1fr}}';
  var yn = function (a) { return a === 'yes' ? 'Yes' : a === 'no' ? 'No' : a === 'na' ? 'N/A' : '-'; };
  var info = function (d) { return d.sysinfo || {}; };
  var nm = function (d, k, dflt) { var n = info(d).names; return (n && n[k]) || dflt; };
  var zone = function (d) { return info(d).zone_word || 'Lateral'; };
  // two columns of check / answer pairs; a "no" is bold
  var pairs = function (rows) {
    var half = Math.ceil(rows.length / 2), h = '<div class="tw"><table><tbody>';
    for (var i = 0; i < half; i++) { var a = rows[i], b = rows[i + half]; h += '<tr><td>' + esc(a.l) + '</td><td>' + (a.bad ? '<b>No</b>' : yn(a.a)) + '</td>' + (b ? '<td>' + esc(b.l) + '</td><td>' + (b.bad ? '<b>No</b>' : yn(b.a)) + '</td>' : '<td></td><td></td>') + '</tr>'; }
    return h + '</tbody></table></div>';
  };
  // permit and system details at the top of the county copy
  var permitRows = function (d, cust) {
    var p = info(d).permit || {}, pi = OWI.permitInfo(p, '0000-00-00'), r = [];
    var nos = [p.ca_no && 'Construction auth. ' + p.ca_no, p.ip_no && 'Improvement permit ' + p.ip_no, p.other_no].filter(Boolean).join('; ');
    if (p.parcel) r.push(['Parcel', p.parcel]); if (nos) r.push(['Permit numbers', nos]);
    if (p.issued) r.push(['Operation permit', 'Issued ' + dt(p.issued) + (pi.expires ? ', valid until ' + dt(pi.expires) : '')]);
    if (p.bedrooms || p.occupants) r.push(['Design capacity', [p.bedrooms && p.bedrooms + ' bedrooms', p.occupants && 'up to ' + p.occupants + ' occupants'].filter(Boolean).join(', ')]);
    var fr = OWI.FREQ.filter(function (f) { return f[0] === p.freq; })[0]; if (fr && fr[0]) r.push(['Inspection frequency', fr[1]]);
    var ad = info(d).addresses; if (ad && ad.length > 1) r.push(['System addresses', ad.join('; ')]);
    return r;
  };

  // rep: { visit_date, insp: { data, calc, photos } }, cust: { name, address, county, permit, sys_type }, op: { name, cert }
  OWI.homeHtml = function (rep, cust, op, photoUrl) {
    var d = rep.insp.data, c = rep.insp.calc, ov = OWI.overall(d.status), h = '';
    h += '<div class="rp"><h2>Your septic system check-up</h2><p>' + esc(cust.name) + ', ' + esc(cust.address) + '. Checked ' + esc(dt(rep.visit_date)) + ' by ' + esc(op.name) + ', certified operator, Overwatch Septic, LLC.</p>';
    var acts = OWI.actions(d, c);
    h += '<div class="ov todo"><b class="w">What you need to do</b>';
    if (acts.length) {
      h += '<ol>' + acts.map(function (a) { return '<li><u>' + esc(a) + '</u></li>'; }).join('') + '</ol>';
      if (d.recs) h += '<p>' + esc(d.recs) + '</p>';
      h += '<p class="sm">Overwatch does not do repairs or pumping. We can tell you what to ask the contractor for, and we will confirm the fix at your next visit.</p>';
    } else { h += '<p><u>Nothing needed right now. See you at your next check-up.</u></p>' + (d.recs ? '<p>' + esc(d.recs) + '</p>' : ''); }
    h += '</div><div class="ov ' + ov[0] + '"><b class="' + ov[0] + '">' + esc(ov[1]) + '</b><br>' + esc(ov[2]) + '</div>';
    h += '<h3>What we checked</h3><div class="tw"><table><thead><tr><th>Part</th><th>Result</th><th>What this means for you</th></tr></thead><tbody>';
    var X = OWI.extras(d, c);
    ['septic', 'pumptank', 'panel', 'field'].forEach(function (k) { var r = OWI.wordRow(d, k), def = OWI.WORDS.filter(function (q) { return q.k === k; })[0]; if (r) h += '<tr><td>' + esc(k === 'septic' ? nm(d, 'septic', def.t) : k === 'pumptank' ? nm(d, 'pump', def.t) : def.t) + '</td><td class="' + r.tone + '"><b>' + esc(r.label) + '</b></td><td>' + esc(r.text) + '</td></tr>'; });
    X.tanks.concat(X.cards).forEach(function (x) { var q = OWI.plainExtra(x); h += '<tr><td>' + esc(x.name || x.title) + '</td><td class="' + q[1] + '"><b>' + esc(q[0]) + '</b></td><td>' + esc(q[2]) + '</td></tr>'; });
    h += '</tbody></table></div><h3>Your numbers, in plain terms</h3><div class="tw"><table><thead><tr><th>Measure</th><th>Your system</th><th>What it tells us</th></tr></thead><tbody>';
    var f = OWI.wordRow(d, 'flow'), s = OWI.wordRow(d, 'solids'), t = OWI.wordRow(d, 'runtime');
    if (f) h += '<tr><td>Pump flow</td><td>' + (c.pdr !== null ? '<b>' + c.pdr + '</b> gallons per minute' + (d.flow.design_pdr ? '<br>(designed for ' + d.flow.design_pdr + ')' : '') : '-') + '</td><td>' + esc(f.text) + '</td></tr>';
    if (s) h += '<tr><td>Solids in the septic tank</td><td>' + (c.sludge_pct !== null ? '<b>' + Math.round(c.sludge_pct) + '%</b> of the tank depth<br>(' + v(d.septic.sludge) + ' in of ' + v(d.liquid_depth) + ' in)' : '-') + '</td><td>' + esc(s.text) + '</td></tr>';
    if (t) h += '<tr><td>How often the pump runs</td><td>' + (c.events_day !== null ? '<b>' + c.events_day + '</b> times a day' + (c.events_design !== null ? '<br>(designed for ' + c.events_design + ')' : '') : '-') + '</td><td>' + esc(t.text) + '</td></tr>';
    X.tanks.forEach(function (x) {
      if (x.kind === 'pump' && x.k.pdr != null) h += '<tr><td>' + esc(x.name) + ' flow</td><td><b>' + x.k.pdr + '</b> gallons per minute' + (x.t.design_pdr ? '<br>(designed for ' + x.t.design_pdr + ')' : '') + '</td><td>' + esc(x.k.eff_ok === false ? OWI.plainExtra(x)[2] : 'About what it was designed to move.') + '</td></tr>';
      if (x.kind === 'septic' && x.k.sludge_pct != null) h += '<tr><td>Solids in ' + esc(x.name) + '</td><td><b>' + Math.round(x.k.sludge_pct) + '%</b> of the tank depth<br>(' + v(x.t.sludge) + ' in of ' + v(x.t.liquid_depth) + ' in)</td><td>' + esc(x.k.pump_now ? OWI.plainExtra(x)[2] : 'Below one third of the tank, so no pumping is needed yet.') + '</td></tr>';
    });
    h += '</tbody></table></div>';
    if (photoUrl && rep.insp.photos) { h += '<h3>Photos</h3><div class="ph">'; for (var i = 1; i <= rep.insp.photos; i++) h += '<a href="' + esc(photoUrl(i)) + '" target="_blank" rel="noopener"><img src="' + esc(photoUrl(i)) + '" alt="Photo ' + i + ' from the visit" loading="lazy"></a>'; h += '</div>'; }
    h += '<p style="margin-top:10px"><b>Next check-up due:</b> ' + esc(dt(d.next_due) || 'to be scheduled') + '. Your portal shows each number over time.</p>';
    h += '<p class="sm"><i>' + esc(op.name) + ', certified operator, certificate ' + esc(op.cert) + '. A technical copy of this report is filed with the county.</i></p></div>';
    return h;
  };

  OWI.countyHtml = function (rep, cust, op) {
    var d = rep.insp.data, c = rep.insp.calc, lat = d.laterals || [], h = '';
    h += '<div class="rp"><h2 style="text-align:center">CERTIFIED OPERATOR MAINTENANCE/MONITORING REPORT</h2><div class="grid">';
    [['Owner', cust.name], ['Permit #', cust.permit], ['Location', cust.address + (cust.county ? '. ' + cust.county + ' County' : '')], ['Date of inspection', dt(rep.visit_date)], ['System', (cust.sys_desc || (cust.sys_type ? 'Type ' + cust.sys_type : '')) + (cust.design_flow ? '. Design flow ' + cust.design_flow + ' gpd' : '')], ['Last inspection', c.days ? c.days + ' days earlier' : '-'], ['Operator (ORC)', op.name + ', ' + op.cert + ', Overwatch Septic, LLC'], ['Type of inspection', d.inspect_type]].concat(permitRows(d, cust)).forEach(function (p) { h += '<span><b>' + esc(p[0]) + ':</b> ' + esc(p[1] || '-') + '</span>'; });
    h += '</div>';
    OWI.SECTIONS.forEach(function (sec) {
      h += '<h3>' + esc(sec.k === 'septic' ? nm(d, 'septic', sec.t) : sec.k === 'pump' ? nm(d, 'pump', sec.t) : sec.t) + '</h3><div class="tw"><table><tbody>';
      var cs = d.checks[sec.k] || [], items = sec.items, half = Math.ceil(items.length / 2);
      for (var i = 0; i < half; i++) { var a = items[i], b = items[i + half]; h += '<tr><td>' + esc(a[1]) + '</td><td>' + (cs[a[0]] === 'no' && a[2] !== 'i' ? '<b>' + yn(cs[a[0]]) + '</b>' : yn(cs[a[0]])) + '</td>' + (b ? '<td>' + esc(b[1]) + '</td><td>' + (cs[b[0]] === 'no' && b[2] !== 'i' ? '<b>No</b>' : yn(cs[b[0]])) + '</td>' : '<td></td><td></td>') + '</tr>'; }
      h += '</tbody></table></div>';
      if (sec.k === 'septic' || sec.k === 'pump') { var x = d[sec.k]; h += '<p>Tank ' + v(sec.k === 'septic' ? d.septic_gal : d.pump_gal, 'gal') + (sec.k === 'septic' ? ', liquid depth ' + v(d.liquid_depth, 'in') : ', ' + v(d.gpi, 'gal/in')) + '. Scum ' + v(x.scum, 'in') + ', sludge ' + v(x.sludge, 'in') + (sec.k === 'septic' && c.sludge_pct !== null ? ' (' + c.sludge_pct + '% of liquid depth)' : '') + '. Last pumpout ' + esc(dt(x.pumped) || '-') + '. Pumping needed: ' + esc(x.pump_needed) + '.</p>'; }
      if (sec.k === 'controls') h += '<p>Float settings, inches above tank bottom: alarm ' + v(d.floats.alarm) + ', pump on ' + v(d.floats.on) + ', pump off ' + v(d.floats.off) + '.</p>';
    });
    if (lat.length) {
      h += '<div class="tw"><table><thead><tr><th>' + zone(d) + '</th><th>Length</th><th>Design head</th><th>Turnup height</th><th>Last time</th><th>Baseline</th><th>Off design</th><th>Valves left at</th><th>Adjusted to</th></tr></thead><tbody>' + lat.map(function (l) { var pc = OWI.latPct(l); return '<tr><td>' + l.n + '</td><td>' + v(l.length) + '</td><td>' + v(l.design) + '</td><td>' + v(l.turnup) + '</td><td>' + v(l.last) + '</td><td>' + v(l.baseline) + '</td><td>' + (pc === null ? '-' : (pc > 0 ? '+' : '') + pc + '%') + '</td><td>' + v(l.left) + '</td><td>' + v(l.adjusted) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    }
    h += '<h3>Flow test and meters</h3><div class="tw"><table><tbody>';
    h += '<tr><td>Water level, pump off (start)</td><td>' + v(d.flow.off, 'in') + '</td><td>Dose volume</td><td>' + v(d.flow.dose, 'gal') + '</td></tr>';
    h += '<tr><td>Water level, pump on (after run)</td><td>' + v(d.flow.on, 'in') + '</td><td>Drawdown</td><td>' + v(d.flow.drawdown, 'in') + '</td></tr>';
    h += '<tr><td>Depth pumped</td><td>' + v(c.depth, 'in') + '</td><td>Run time of test</td><td>' + v(d.flow.min, 'min') + '</td></tr>';
    h += '<tr><td>Volume pumped (depth x ' + v(d.flow.gpi || d.gpi) + ' gal/in)</td><td>' + v(c.vol, 'gal') + '</td><td>Measured PDR (pump delivery rate)</td><td>' + v(c.pdr, 'gpm') + '</td></tr>';
    h += '<tr><td>Design PDR</td><td>' + v(d.flow.design_pdr, 'gpm') + '</td><td>PDR efficiency</td><td>' + (c.eff === null ? '-' : (c.eff_ok ? c.eff + '%' : '<b>' + c.eff + '% (outside 10% of design)</b>')) + '</td></tr>';
    h += '<tr><td>ET (elapsed time) hours</td><td>' + v(d.meters.et) + (c.et_used !== null ? ' (used ' + c.et_used + ', ' + v(c.et_day) + ' per day)' : '') + '</td><td>Events</td><td>' + v(d.meters.events) + (c.ev_used !== null ? ' (used ' + c.ev_used + ', ' + v(c.events_day) + ' per day, design ' + v(c.events_design) + ')' : '') + '</td></tr>';
    h += '</tbody></table></div>';
    var X = OWI.extras(d, c);
    X.tanks.forEach(function (x) {
      var t = x.t, k = x.k; h += '<h3>' + esc(x.name) + '</h3>' + pairs(x.checks);
      if (x.kind === 'septic') h += '<p>Tank ' + v(t.gal, 'gal') + ', liquid depth ' + v(t.liquid_depth, 'in') + '. Scum ' + v(t.scum, 'in') + ', sludge ' + v(t.sludge, 'in') + (k.sludge_pct != null ? ' (' + k.sludge_pct + '% of liquid depth)' : '') + '. Last pumpout ' + esc(dt(t.pumped) || '-') + '. Pumping needed: ' + esc(t.pump_needed) + '.</p>';
      else {
        h += '<p>Tank ' + v(t.gal, 'gal') + ', ' + v(k.gpi, 'gal/in') + '. Float settings, inches above tank bottom: alarm ' + v(t.floats.alarm) + ', pump on ' + v(t.floats.on) + ', pump off ' + v(t.floats.off) + '.</p><div class="tw"><table><tbody>';
        h += '<tr><td>Water level, pump off (start)</td><td>' + v(t.flow.off, 'in') + '</td><td>Dose volume</td><td>' + v(k.dose, 'gal') + '</td></tr><tr><td>Water level, pump on (after run)</td><td>' + v(t.flow.on, 'in') + '</td><td>Drawdown</td><td>' + v(k.drawdown, 'in') + '</td></tr>';
        h += '<tr><td>Depth pumped</td><td>' + v(k.depth, 'in') + '</td><td>Run time of test</td><td>' + v(t.flow.min, 'min') + '</td></tr><tr><td>Volume pumped</td><td>' + v(k.vol, 'gal') + '</td><td>Measured PDR (pump delivery rate)</td><td>' + v(k.pdr, 'gpm') + '</td></tr><tr><td>Design PDR</td><td>' + v(t.design_pdr, 'gpm') + '</td><td>PDR efficiency</td><td>' + (k.eff == null ? '-' : (k.eff_ok ? k.eff + '%' : '<b>' + k.eff + '% (outside 10% of design)</b>')) + '</td></tr></tbody></table></div>';
      }
      var fx = Object.keys(k.formulas || {}).map(function (q) { return k.formulas[q]; }); if (fx.length) h += '<p class="sm">' + fx.map(esc).join('; ') + '</p>';
    });
    X.cards.forEach(function (x) { h += '<h3>' + esc(x.title) + '</h3>' + pairs(x.rows); });
    var fm = c.formulas || {}, fl = [['Depth pumped', fm.depth], ['Volume pumped', fm.vol], ['Measured PDR', fm.pdr], ['PDR efficiency', fm.eff], ['Sludge, % of liquid depth', fm.sludge], ['Days since last inspection', fm.days], ['ET (elapsed time)', fm.et], ['Events', fm.events], ['Design events per day', fm.events_design], ['Dose volume', fm.dose], ['Gallons per inch', fm.gpi]].filter(function (x) { return x[1]; });
    if (fl.length) h += '<p class="sm"><b>How the numbers were calculated</b></p><ul class="sm" style="margin:2px 0;padding-left:20px">' + fl.map(function (x) { return '<li>' + esc(x[0]) + ': ' + esc(x[1]) + '</li>'; }).join('') + '</ul>';
    if (X.malfunction) h += '<p><b>Malfunction found at this visit.</b> County notified: ' + esc(X.malfunction.notified || 'not yet recorded') + '.</p>';
    h += '<p><b>Status of system:</b> ' + esc(d.status) + '. <b>Next inspection due:</b> ' + esc(dt(d.next_due) || '-') + '.</p>';
    if (d.recs) h += '<p><b>Recommendations for owner:</b> ' + esc(d.recs) + '</p>';
    h += '<p class="sm"><i>Certified operator: ' + esc(op.name) + ', ' + esc(op.cert) + ', ' + esc(dt(rep.visit_date)) + '. Repairs and pumping are performed by licensed contractors.</i></p></div>';
    return h;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
