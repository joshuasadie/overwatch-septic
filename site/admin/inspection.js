/* Admin: the inspection report form (modeled on the certified operator maintenance/monitoring report) and the report previews. */
(function () {
  var $ = OW.$, E = OW.esc, A = window.OWA, OWI = window.OWI;
  var D = null, ctx = null, draftKey = '', timer = null, photos = [], secN = 0;

  var tri = function (s, k) { return '<span class="tri" data-s="' + s + '" data-i="' + k + '"><button type="button" data-v="yes" aria-pressed="false">Yes</button><button type="button" data-v="no" aria-pressed="false">No</button><button type="button" data-v="na" aria-pressed="false">N/A</button></span>'; };
  var fld = function (id, label, extra, cls) { return '<div><label for="' + id + '">' + label + '</label><input id="' + id + '" ' + (extra || '') + (cls ? ' class="' + cls + '"' : '') + '></div>'; };
  var dec = 'inputmode="decimal" autocomplete="off"';
  var fm = function (id) { return '<div class="fm" id="FM_' + id + '"></div>'; };
  var auto = function (id, label) { return '<div><label for="' + id + '">' + label + '</label><input id="' + id + '" readonly tabindex="-1" class="auto">' + fm(id) + '</div>'; };
  var val = function (id) { var e = $(id); return e ? e.value.trim() : ''; };
  var num = function (id) { return OWI.n(val(id)); };
  var det = function (title, body, open, id) { return '<details class="fcard"' + (open ? ' open' : '') + '><summary><h3>' + (++secN) + '. ' + title + '</h3><span class="pill mute" id="' + id + '"></span></summary><div class="fbody">' + body + '</div></details>'; };
  var today = function () { return new Date().toISOString().slice(0, 10); };
  var addDays = function (iso, n) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  function checklist(sec) { return sec.items.map(function (it) { return '<div class="item"><span>' + E(it[1]) + '</span>' + tri(sec.k, it[0]) + '</div>'; }).join(''); }
  function latRow(i, l) {
    l = l || {}; var f = function (k, v, c) { return '<td><input id="lat_' + k + '_' + i + '" ' + dec + (c ? ' class="' + c + '"' : '') + ' value="' + E(v == null ? '' : v) + '" aria-label="Lateral ' + (i + 1) + ' ' + k + '"></td>'; };
    return '<tr data-lat="' + i + '"><td>' + (i + 1) + '</td>' + f('len', l.length) + f('des', l.design) + f('tu', '') + f('last', l.last) + f('base', l.baseline) + f('left', '') + f('adj', '') + '<td id="lat_pc_' + i + '" class="sm"></td></tr>';
  }

  function permitBanner(sys) {
    var pi = OWI.permitInfo(sys.permit, today()); if (pi.expired) return '<div class="note" role="alert"><b>The operation permit expired ' + E(OW.date(pi.expires)) + '.</b> Ask the owner and the county about renewal (the owner applies within 30 days of expiry). This shows on every visit until the permit date is updated in System setup.</div>';
    if (pi.days !== null && pi.days <= 90) return '<div class="note"><b>The operation permit expires ' + E(OW.date(pi.expires)) + ' (in ' + pi.days + ' days).</b> Remind the owner to apply for renewal.</div>';
    return '';
  }
  function tankBody(t) {
    var id = t.id, f = function (k, label, v, extra) { return fld('x_' + id + '_' + k, label, dec + ' value="' + E(v == null ? '' : v) + '"' + (extra || '')); }, fl = t.floats || {};
    var h = OWI.TANK_ITEMS[t.kind].map(function (it) { return '<div class="item"><span>' + E(it[1]) + '</span>' + tri('t_' + id, it[0]) + '</div>'; }).join('');
    h += '<h4>Tank details (saved for next time)</h4><div class="two">' + f('gal', 'Tank size (gal)', t.gal) + '<div><label for="x_' + id + '_shape">Shape</label><select id="x_' + id + '_shape"><option value="rect"' + (t.shape === 'round' ? '' : ' selected') + '>Rectangular</option><option value="round"' + (t.shape === 'round' ? ' selected' : '') + '>Round</option></select></div>' + f('a', 'Inside length or diameter (in)', t.a) + '<div id="x_' + id + '_bw">' + f('b', 'Inside width (in)', t.b) + '</div></div>';
    if (t.kind === 'septic') return h + '<div class="two">' + f('ld', 'Liquid depth (in)', t.liquid_depth) + '</div><div class="three">' + fld('x_' + id + '_sc', 'Scum (in)', dec) + fld('x_' + id + '_sl', 'Sludge (in)', dec) + auto('x_' + id + '_slp', 'Sludge, % of liquid depth') + '</div><div class="two">' + fld('x_' + id + '_pd', 'Date of last pumpout', 'type="date"') + '<div><label for="x_' + id + '_pn">Pumping needed?</label><select id="x_' + id + '_pn"><option>No</option><option>Yes</option></select></div></div>';
    return h + '<div class="two"><div><label for="x_' + id + '_gpi">Gallons per inch</label><input id="x_' + id + '_gpi" ' + dec + ' value="' + E(t.gpi == null ? '' : t.gpi) + '">' + fm('x_' + id + '_gpi') + '</div>' + f('dpdr', 'Design PDR, pump delivery rate (gpm)', t.design_pdr) + '</div>' +
      '<h4>Float settings (inches above tank bottom)</h4><div class="three">' + f('fa', 'Alarm', fl.alarm) + f('fon', 'Pump on', fl.on) + f('foff', 'Pump off', fl.off) + '</div><div class="two">' + auto('x_' + id + '_draw', 'Drawdown (in)') + auto('x_' + id + '_dose', 'Dose volume (gal)') + '</div>' +
      '<h4>Pump rate test</h4><div class="calc">' + calcRow('x_' + id + '_off', 'Water level, pump off (start)', 'in', false) + calcRow('x_' + id + '_on', 'Water level, pump on (after run)', 'in', false) + calcRow('x_' + id + '_dp', 'Depth pumped', 'in', true) + calcRow('x_' + id + '_vol', 'Volume pumped', 'gal', true) + calcRow('x_' + id + '_min', 'Divided by minutes', 'min', false) + calcRow('x_' + id + '_pdr', 'Measured PDR (pump delivery rate)', 'gpm', true) + calcRow('x_' + id + '_eff', 'PDR efficiency', '%', true) + '</div><p class="note" id="x_' + id + '_warn" hidden></p>';
  }
  function cardRow(l, i, extra) { return '<div class="item" data-row="' + i + '"' + (extra ? ' data-new="1"' : '') + '><span class="rl">' + E(l) + '</span>' + tri('k_' + cardRow.cid, i) + '</div>'; }
  function cardBody(cd) {
    cardRow.cid = cd.id;
    return '<div data-card="' + E(cd.id) + '" class="kcard">' + (cd.items || []).map(function (l, i) { return cardRow(l, i); }).join('') + '</div><div class="row" style="margin-top:8px"><input id="kn_' + E(cd.id) + '" maxlength="120" placeholder="Add a check for this system" aria-label="New check for ' + E(cd.title) + '" style="flex:1 1 220px"><button type="button" class="b alt" data-addrow="' + E(cd.id) + '">Add check</button></div><p class="mute sm">A check you add is kept for this system\'s future visits. Remove it in System setup.</p>';
  }
  function build(sys, prev) {
    sys = sys || {}; secN = 0; var h = '<h2>New inspection</h2><p class="mute" style="margin:0 0 6px">Blue boxes fill in by themselves. Your answers are saved on this device as you go.</p><div class="row" style="justify-content:space-between"><span class="pill good" id="saved">Not saved yet</span><span class="pill warn" id="needs">0 items need attention</span></div>' + permitBanner(sys) + '<form id="inf" novalidate>';
    h += det('System and visit', '<div class="two">' + fld('i_date', 'Date of inspection', 'type="date" value="' + today() + '"') + '<div><label for="i_type">Type of inspection</label><select id="i_type">' + OWI.TYPES.map(function (t) { return '<option>' + t + '</option>'; }).join('') + '</select></div>' +
      fld('s_desc', 'Type of system', 'value="' + E(sys.sys_desc || (D.customer.sys_type ? 'Type ' + D.customer.sys_type : '')) + '"') + fld('s_flow', 'Design flow (gpd)', dec + ' value="' + E(sys.design_flow == null ? '' : sys.design_flow) + '"') +
      fld('s_sgal', 'Septic tank (gal)', dec + ' value="' + E(sys.septic_gal == null ? '' : sys.septic_gal) + '"') + fld('s_ld', 'Liquid depth (in)', dec + ' value="' + E(sys.liquid_depth == null ? '' : sys.liquid_depth) + '"') +
      fld('s_pgal', 'Pump tank (gal)', dec + ' value="' + E(sys.pump_gal == null ? '' : sys.pump_gal) + '"') + '<div><label for="s_shape">Pump tank shape</label><select id="s_shape"><option value="rect"' + (sys.tank_shape === 'rect' || !sys.tank_shape ? ' selected' : '') + '>Rectangular</option><option value="round"' + (sys.tank_shape === 'round' ? ' selected' : '') + '>Round</option></select></div>' +
      fld('s_a', 'Inside length or diameter (in)', dec + ' value="' + E(sys.tank_a == null ? '' : sys.tank_a) + '"') + '<div id="s_bw">' + fld('s_b', 'Inside width (in)', dec + ' value="' + E(sys.tank_b == null ? '' : sys.tank_b) + '"') + '</div>' +
      '<div><label for="s_gpi">Pump tank gallons per inch</label><input id="s_gpi" ' + dec + ' value="' + E(sys.gpi == null ? '' : sys.gpi) + '">' + fm('s_gpi') + '</div>' + fld('s_dpdr', 'Design PDR, pump delivery rate (gpm)', dec + ' value="' + E(sys.design_pdr == null ? '' : sys.design_pdr) + '"') + '</div>' +
      '<p class="mute sm">Owner, permit and system details come from the customer. Tank sizes, design numbers and laterals are saved here after your first report, so you type them once.</p>' +
      '<div class="two">' + auto('a_days', 'Days since last inspection') + auto('a_last', 'Last inspection') + '</div>' +
      '<h4>Malfunction</h4><label class="ck"><input type="checkbox" id="mf_on"> Malfunction found at this visit</label><div id="mf_box" hidden>' + fld('mf_note', 'County notified (date and how)', 'maxlength="200" placeholder="e.g. called the health department on the visit day"') + '<p class="mute sm" id="mf_due"></p></div>', true, 'c1');
    h += det(E(sys.septic_name || 'Septic tank'), checklist(OWI.SECTIONS[0]) + '<div class="three">' + fld('i_sc', 'Scum (in)', dec) + fld('i_sl', 'Sludge (in)', dec) + auto('i_slp', 'Sludge, % of liquid depth') + '</div><p id="slw" class="mute sm"></p><div class="two">' + fld('i_spd', 'Date of last pumpout', 'type="date"') + '<div><label for="i_spn">Pumping needed?</label><select id="i_spn"><option>No</option><option>Yes</option></select></div></div>', false, 'c2');
    h += det(E(sys.pump_name || 'Pump tank'), checklist(OWI.SECTIONS[1]) + '<div class="two">' + fld('i_psc', 'Scum (in)', dec) + fld('i_psl', 'Sludge (in)', dec) + fld('i_ppd', 'Date of last pumpout', 'type="date"') + '<div><label for="i_ppn">Pumping needed?</label><select id="i_ppn"><option>No</option><option>Yes</option></select></div></div>', false, 'c3');
    h += det('Pump, piping and controls', checklist(OWI.SECTIONS[2]) + '<h4>Float settings (inches above tank bottom)</h4><div class="three">' + fld('i_fa', 'Alarm', dec + ' value="' + E((sys.floats || {}).alarm == null ? '' : sys.floats.alarm) + '"') + fld('i_fon', 'Pump on', dec + ' value="' + E((sys.floats || {}).on == null ? '' : sys.floats.on) + '"') + fld('i_foff', 'Pump off', dec + ' value="' + E((sys.floats || {}).off == null ? '' : sys.floats.off) + '"') + '</div>', false, 'c4');
    var lats = (sys.laterals && sys.laterals.length ? sys.laterals : [{}, {}, {}, {}]).map(function (l, i) { var t = prev && prev.turnups && prev.turnups[i]; return latRow(i, { length: l.length, design: l.design, last: t == null ? '' : t }); }).join('');
    h += det('Lateral field', checklist(OWI.SECTIONS[3]) + '<h4>Lateral head readings</h4><div class="tw"><table class="lat"><thead><tr><th>Lateral</th><th>Length</th><th>Design head</th><th>Turnup height</th><th>Head last time</th><th>Baseline head</th><th>Valves left at</th><th>Adjusted to</th><th>Off design</th></tr></thead><tbody id="latb">' + lats + '</tbody></table></div><button type="button" class="b alt" id="addLat" style="margin-top:6px">Add lateral</button>', false, 'c5');
    (sys.tanks || []).forEach(function (t) { h += det(E(t.name || (t.kind === 'pump' ? 'Pump tank' : 'Septic tank')), tankBody(t), false, 'cx_' + t.id); });
    (sys.cards || []).forEach(function (cd) { h += det(E(cd.title), cardBody(cd), false, 'ck_' + cd.id); });
    h += det('Flow test and meters', '<div class="two">' + auto('f_draw', 'Drawdown (in)') + auto('f_dose', 'Dose volume (gal)') + '</div><h4>Pump rate test</h4><div class="calc">' +
      calcRow('f_off', 'Water level, pump off (start)', 'in', false) + calcRow('f_on', 'Water level, pump on (after run)', 'in', false) + calcRow('f_dp', 'Depth pumped', 'in', true) + calcRow('f_gpi', 'Times gallons per inch', 'gal/in', true) + calcRow('f_vol', 'Volume pumped', 'gal', true) + calcRow('f_min', 'Divided by minutes', 'min', false) + calcRow('f_pdr', 'Measured PDR (pump delivery rate)', 'gpm', true) + calcRow('f_dpdr', 'Design PDR', 'gpm', true) + calcRow('f_eff', 'PDR efficiency', '%', true) + '</div>' +
      '<p class="note" id="pdrwarn" hidden></p><p class="mute sm">A warning shows when PDR efficiency is more than 10% above or below design.</p><h4>Meter readings</h4><div class="tw"><table><thead><tr><th></th><th>Today</th><th>Last time</th><th>Used</th><th>Per day</th><th>Design per day</th></tr></thead><tbody>' +
      '<tr><td>ET (elapsed time) hours</td><td><input id="m_et" ' + dec + ' aria-label="ET hours today"></td><td><input id="m_etl" class="auto" readonly tabindex="-1"></td><td><input id="m_etu" class="auto" readonly tabindex="-1"></td><td><input id="m_etd" class="auto" readonly tabindex="-1"></td><td><input id="m_etg" class="auto" readonly tabindex="-1"></td></tr>' +
      '<tr><td>Events</td><td><input id="m_ev" ' + dec + ' aria-label="Events today"></td><td><input id="m_evl" class="auto" readonly tabindex="-1"></td><td><input id="m_evu" class="auto" readonly tabindex="-1"></td><td><input id="m_evd" class="auto" readonly tabindex="-1"></td><td><input id="m_evg" class="auto" readonly tabindex="-1"></td></tr></tbody></table></div><div class="fm" id="FM_meters"></div>', true, 'c6');
    h += det('Homeowner wording', '<p class="mute sm">Pick the closest canned response for each part. The sentence appears on the homeowner report. You can edit it, or choose Custom to write your own.</p>' + OWI.WORDS.map(function (w) {
      return '<div class="wd"><div class="row" style="justify-content:space-between"><label for="w_s_' + w.k + '">' + E(w.t) + '</label><span class="pill" id="w_p_' + w.k + '"></span></div><select id="w_s_' + w.k + '" data-w="' + w.k + '">' + w.o.map(function (o, i) { return '<option value="' + i + '">' + E(o[0]) + '</option>'; }).join('') + '</select><textarea id="w_t_' + w.k + '" maxlength="600" aria-label="Wording for ' + E(w.t) + '"></textarea></div>';
    }).join('') +
      '<h4>What the owner should do</h4><div class="item"><label class="ck"><input type="checkbox" id="job_on"> Hire a licensed contractor to</label><select id="job_s" style="flex:1 1 240px;min-width:0">' + OWI.JOBS.map(function (j) { return '<option>' + E(j) + '</option>'; }).join('') + '</select></div><div id="job_more"></div><button type="button" class="b alt" id="addJob" style="margin:4px 0 8px">Add another contractor job</button>' +
      OWI.TICKS.map(function (t, i) { return '<label class="ck"><input type="checkbox" class="tick" data-i="' + i + '"> ' + E(t) + '</label>'; }).join('') + '<label for="t_extra">Anything else for the owner (optional)</label><textarea id="t_extra" maxlength="400"></textarea>', false, 'c7');
    h += det('Finish', '<label for="i_recs">Recommendations for owner</label><textarea id="i_recs" maxlength="1500"></textarea><label for="i_com">Comments (private to you, never shown to the owner or county)</label><textarea id="i_com" maxlength="1500"></textarea>' +
      '<div class="two"><div><label for="i_status">Status of system</label><select id="i_status">' + OWI.STATUS.map(function (t) { return '<option>' + t + '</option>'; }).join('') + '</select></div>' + fld('i_next', 'Next inspection due', 'type="date" value="' + OWI.nextDue((sys.permit || {}).freq, today(), ctx && ctx.first) + '"') + '</div><p class="mute sm" id="stw"></p>' +
      '<label for="i_photos">Photos (optional, up to 8)</label><input id="i_photos" type="file" accept="image/*" multiple><div id="pthumbs" class="row" style="margin-top:6px"></div>' +
      '<label for="i_sign">Certified operator signature</label><input id="i_sign" class="auto" readonly tabindex="-1" value="' + E(A.cfg.operator.name + ', ' + A.cfg.operator.cert) + '">' +
      '<label for="i_amt">Invoice amount ($). Use 0 to waive it</label><input id="i_amt" ' + dec + ' value="' + E(A.LS.get('ow_visit') || (A.cfg && A.cfg.defaults.visit) || '0') + '"><p class="mute sm">With an invoice, the owner and the county get nothing until it is paid and 3 business days have passed. With 0, both get the report right away.</p>' +
      '<div class="row" style="margin-top:10px"><button class="b" type="submit">Save report</button><button class="b alt" type="button" id="clearDraft">Clear form</button></div><div class="msg" id="im" role="status"></div>', true, 'c8');
    return h + '</form>';
  }
  function calcRow(id, label, unit, isAuto) { return '<div class="cl"><label for="' + id + '">' + label + '</label><input id="' + id + '" ' + (isAuto ? 'class="auto" readonly tabindex="-1"' : dec) + '><span class="u">' + unit + '</span></div>' + (isAuto ? fm(id) : ''); }

  // ---- reading the form
  function collect() {
    var d = { inspect_type: val('i_type'), septic_gal: num('s_sgal'), liquid_depth: num('s_ld'), pump_gal: num('s_pgal'), gpi: num('s_gpi'), tank_shape: val('s_shape'), tank_a: num('s_a'), tank_b: num('s_b'), checks: {}, words: {}, laterals: [] };
    OWI.SECTIONS.forEach(function (sec) { d.checks[sec.k] = {}; sec.items.forEach(function (it) { var b = document.querySelector('.tri[data-s="' + sec.k + '"][data-i="' + it[0] + '"] button[aria-pressed="true"]'); if (b) d.checks[sec.k][it[0]] = b.getAttribute('data-v'); }); });
    d.septic = { scum: num('i_sc'), sludge: num('i_sl'), pumped: val('i_spd'), pump_needed: val('i_spn') }; d.pump = { scum: num('i_psc'), sludge: num('i_psl'), pumped: val('i_ppd'), pump_needed: val('i_ppn') };
    d.floats = { alarm: num('i_fa'), on: num('i_fon'), off: num('i_foff') };
    document.querySelectorAll('#latb tr').forEach(function (tr) { var i = tr.getAttribute('data-lat'), g = function (k) { return num('lat_' + k + '_' + i); }; d.laterals.push({ length: g('len'), design: g('des'), turnup: g('tu'), last: g('last'), baseline: g('base'), left: g('left'), adjusted: g('adj') }); });
    d.flow = { dose: num('f_dose'), drawdown: num('f_draw'), off: num('f_off'), on: num('f_on'), gpi: num('f_gpi'), min: num('f_min'), design_pdr: num('s_dpdr') };
    d.meters = { et: num('m_et'), events: num('m_ev') };
    OWI.WORDS.forEach(function (w) { d.words[w.k] = { i: Number(val('w_s_' + w.k)), t: $('w_t_' + w.k).value }; });
    var jobs = []; if ($('job_on').checked) jobs.push(val('job_s')); document.querySelectorAll('#job_more select').forEach(function (s, i) { if (document.querySelectorAll('#job_more input')[i].checked) jobs.push(s.value); });
    d.todo = { jobs: jobs, ticks: [].slice.call(document.querySelectorAll('.tick')).filter(function (c) { return c.checked; }).map(function (c) { return Number(c.getAttribute('data-i')); }), extra: $('t_extra').value };
    d.recs = $('i_recs').value; d.comments = $('i_com').value; d.status = val('i_status'); d.next_due = val('i_next');
    d.tanks = {}; (ctx.sys.tanks || []).forEach(function (t) { d.tanks[t.id] = tankData(t); });
    d.cards = {}; (ctx.sys.cards || []).forEach(function (cd) { d.cards[cd.id] = { title: cd.title, rows: cardRows(cd.id) }; });
    d.malfunction = { found: $('mf_on').checked, notified: val('mf_note') };
    return d;
  }
  function tankData(t) {
    var id = t.id, g = function (k) { return num('x_' + id + '_' + k); }, o = { kind: t.kind, name: t.name, checks: {} };
    OWI.TANK_ITEMS[t.kind].forEach(function (it) { var b = document.querySelector('.tri[data-s="t_' + id + '"][data-i="' + it[0] + '"] button[aria-pressed="true"]'); if (b) o.checks[it[0]] = b.getAttribute('data-v'); });
    o.gal = g('gal'); o.shape = val('x_' + id + '_shape'); o.a = g('a'); o.b = g('b'); o.gpi = g('gpi');
    if (t.kind === 'septic') { o.liquid_depth = g('ld'); o.scum = g('sc'); o.sludge = g('sl'); o.pumped = val('x_' + id + '_pd'); o.pump_needed = val('x_' + id + '_pn'); }
    else { o.design_pdr = g('dpdr'); o.floats = { alarm: g('fa'), on: g('fon'), off: g('foff') }; o.flow = { off: g('off'), on: g('on'), min: g('min') }; }
    return o;
  }
  function cardRows(id) {
    return [].slice.call(document.querySelectorAll('.kcard[data-card="' + id + '"] .item[data-row]')).map(function (r) { var b = r.querySelector('.tri button[aria-pressed="true"]'); return { l: r.querySelector('.rl').textContent, a: b ? b.getAttribute('data-v') : '' }; });
  }
  function addCardRow(id, label, quiet) {
    var box = document.querySelector('.kcard[data-card="' + id + '"]'); label = String(label || '').trim().slice(0, 120); if (!box || !label) return false;
    var n = box.querySelectorAll('.item').length; if (n >= 30) return false; cardRow.cid = id; box.insertAdjacentHTML('beforeend', cardRow(label, n, true)); return true;
  }
  function system() {
    var lat = []; document.querySelectorAll('#latb tr').forEach(function (tr) { var i = tr.getAttribute('data-lat'); lat.push({ length: num('lat_len_' + i), design: num('lat_des_' + i) }); });
    var b = JSON.parse(JSON.stringify(ctx.sys || {}));
    Object.assign(b, { sys_desc: val('s_desc'), design_flow: num('s_flow'), septic_gal: num('s_sgal'), liquid_depth: num('s_ld'), pump_gal: num('s_pgal'), gpi: num('s_gpi'), tank_shape: val('s_shape'), tank_a: num('s_a'), tank_b: num('s_b'), floats: { alarm: num('i_fa'), on: num('i_fon'), off: num('i_foff') }, dose: num('f_dose'), design_pdr: num('s_dpdr'), laterals: lat });
    b.tanks = (ctx.sys.tanks || []).map(function (t) { var x = tankData(t); return { id: t.id, kind: t.kind, name: t.name, model: t.model, gal: x.gal, shape: x.shape, a: x.a, b: x.b, gpi: x.gpi, liquid_depth: x.liquid_depth, design_pdr: x.design_pdr, floats: x.floats }; });
    b.cards = (ctx.sys.cards || []).map(function (cd) { return { id: cd.id, title: cd.title, items: cardRows(cd.id).map(function (r) { return r.l; }) }; });
    return b;
  }
  function setv(id, v) { var e = $(id); if (e) e.value = v == null ? '' : v; }
  function fmt(x) { return x === null || x === undefined ? '' : x; }

  // ---- live numbers
  function recalc() {
    // gallons per inch comes from the tank size when it is entered
    var g = OWI.gpi(val('s_shape'), val('s_a'), val('s_b')), sg = $('s_gpi'); $('s_bw').hidden = val('s_shape') === 'round';
    if (g !== null) { sg.value = g; sg.readOnly = true; sg.classList.add('auto'); } else { sg.readOnly = false; sg.classList.remove('auto'); }
    setv('f_gpi', val('s_gpi'));
    var d = collect(), date = val('i_date') || today(), sys = system();
    var cx = { design_flow: sys.design_flow, design_pdr: sys.design_pdr, dose: null, prev: ctx.prev ? { date: ctx.prev.date, et: ctx.prev.et, events: ctx.prev.events } : null, date: date };
    var c = OWI.calc(d, cx); setv('f_draw', fmt(c.drawdown)); setv('f_dose', fmt(c.dose)); d.flow.drawdown = c.drawdown; d.flow.dose = c.dose;
    var F = OWI.formulas(d, c, cx); F.gpi = g === null ? '' : OWI.gpiFormula(val('s_shape'), val('s_a'), val('s_b'));
    [['a_days', F.days], ['f_draw', F.drawdown], ['f_dose', F.dose], ['f_dp', F.depth], ['f_vol', F.vol], ['f_pdr', F.pdr], ['f_eff', F.eff], ['i_slp', F.sludge], ['s_gpi', F.gpi], ['f_gpi', F.gpi], ['meters', [F.et, F.events, F.events_design && 'Design events: ' + F.events_design, F.et_design && 'Design ET: ' + F.et_design].filter(Boolean).join(' | ')]].forEach(function (z) { var e = $('FM_' + z[0]); if (e) e.textContent = z[1] || ''; });
    document.querySelectorAll('#latb tr').forEach(function (tr) { var i = tr.getAttribute('data-lat'), pc = OWI.latPct({ design: num('lat_des_' + i), turnup: num('lat_tu_' + i) }); $('lat_pc_' + i).textContent = pc === null ? '' : (pc > 0 ? '+' : '') + pc + '% vs design'; });
    var sp = $('i_spn'); if (!sp.dataset.touched && c.sludge_pct !== null) sp.value = c.pump_now ? 'Yes' : 'No';
    setv('a_days', c.days == null ? '' : c.days); setv('a_last', ctx.prev ? OW.date(ctx.prev.date) : 'No earlier inspection');
    setv('f_dp', fmt(c.depth)); setv('f_vol', fmt(c.vol)); setv('f_pdr', fmt(c.pdr)); setv('f_dpdr', fmt(sys.design_pdr)); setv('f_eff', fmt(c.eff));
    var w = $('pdrwarn'); w.hidden = c.eff_ok !== false; if (c.eff_ok === false) w.textContent = 'PDR efficiency is ' + c.eff + '%. Design is 90% to 110%. Check the pump, filter and discharge line, and add a note in Recommendations.';
    $('f_eff').style.color = c.eff_ok === false ? 'var(--bad)' : '';
    setv('i_slp', c.sludge_pct == null ? '' : Math.round(c.sludge_pct) + '%'); $('i_slp').style.color = c.pump_now ? 'var(--bad)' : '';
    var sw = $('slw'); sw.textContent = c.sludge_pct == null ? '' : c.pump_now ? Math.round(c.sludge_pct) + '% of the tank. At or over one third: time to pump.' : Math.round(c.sludge_pct) + '% of the tank. Pumping is due at 33% (one third).'; sw.style.color = c.pump_now ? 'var(--bad)' : ''; sw.style.fontWeight = c.pump_now ? '600' : '';
    var p = ctx.prev || {};
    setv('m_etl', fmt(p.et)); setv('m_evl', fmt(p.events)); setv('m_etu', fmt(c.et_used)); setv('m_evu', fmt(c.ev_used)); setv('m_etd', fmt(c.et_day)); setv('m_evd', fmt(c.events_day)); setv('m_etg', fmt(c.et_design)); setv('m_evg', fmt(c.events_design));
    // suggest wording from the numbers until you pick one yourself
    suggest('solids', c.sludge_pct == null ? null : c.pump_now ? 2 : 0); suggest('flow', c.eff == null ? null : c.eff_ok ? 0 : (c.eff > 100 ? 1 : 2));
    var xbad = false;
    (ctx.sys.tanks || []).forEach(function (t) { if (extraCalc(t)) xbad = true; });
    (ctx.sys.cards || []).forEach(function (cd) { var rows = cardRows(cd.id), a = rows.filter(function (r) { return r.a; }).length; $('ck_' + cd.id).textContent = a + ' of ' + rows.length + ' answered'; });
    var mf = $('mf_on').checked; $('mf_box').hidden = !mf; $('mf_due').textContent = mf ? 'Notify the county within 48 hours of the visit, by ' + OW.date(addDays(date, 2)) + '.' : '';
    var bad = OWI.problems(d).length; $('needs').textContent = bad + (bad === 1 ? ' item needs' : ' items need') + ' attention'; $('needs').className = 'pill ' + (bad ? 'bad' : 'warn');
    var counts = {}; OWI.SECTIONS.forEach(function (sec, i) { counts[sec.k] = [Object.keys(d.checks[sec.k]).length, sec.items.length]; });
    ['septic:c2', 'pump:c3', 'controls:c4', 'field:c5'].forEach(function (z) { var a = z.split(':'); $(a[1]).textContent = counts[a[0]][0] + ' of ' + counts[a[0]][1] + ' answered'; });
    var answered = 0; OWI.SECTIONS.forEach(function (sec) { answered += counts[sec.k][0]; }); Object.keys(d.tanks).forEach(function (id) { answered += Object.keys(d.tanks[id].checks).length; }); Object.keys(d.cards).forEach(function (id) { d.cards[id].rows.forEach(function (r) { if (r.a) answered++; }); }); if (mf) answered++; var ck = d.checks.controls || {};
    var sug = !answered ? 'Incomplete inspection' : (mf || ck.alarm === 'no' || ck.floats === 'no') ? 'Malfunctioning' : (bad || xbad || c.eff_ok === false || c.pump_now) ? 'Needs maintenance' : 'Compliant', st = $('i_status');
    if (!st.dataset.touched && answered) st.value = sug; $('stw').textContent = answered ? 'Suggested from your answers: ' + sug + '. You can change it.' : '';
    return d;
  }
  // numbers for one extra tank; returns true when something about it needs attention
  function extraCalc(t) {
    var id = t.id, x = tankData(t), P = 'x_' + id + '_', q = function (k, v) { setv(P + k, fmt(v)); }, F = function (k, v) { var e = $('FM_' + P + k); if (e) e.textContent = v || ''; };
    $(P + 'bw').hidden = x.shape === 'round';
    var g = OWI.gpi(x.shape, x.a, x.b);
    var k = OWI.calcTank(x, t.kind), items = OWI.TANK_ITEMS[t.kind], done = items.filter(function (it) { return x.checks[it[0]]; }).length;
    $('cx_' + id).textContent = done + ' of ' + items.length + ' answered';
    var bad = items.some(function (it) { return x.checks[it[0]] === 'no' && it[2] !== 'i'; });
    if (t.kind === 'septic') {
      q('slp', k.sludge_pct == null ? '' : Math.round(k.sludge_pct) + '%'); $(P + 'slp').style.color = k.pump_now ? 'var(--bad)' : ''; F('slp', k.formulas.sludge);
      var sp = $(P + 'pn'); if (!sp.dataset.touched && k.sludge_pct !== null) sp.value = k.pump_now ? 'Yes' : 'No';
      return bad || !!k.pump_now;
    }
    var gi = $(P + 'gpi'); if (g !== null) { gi.value = g; gi.readOnly = true; gi.classList.add('auto'); } else { gi.readOnly = false; gi.classList.remove('auto'); }
    q('draw', k.drawdown); q('dose', k.dose); q('dp', k.depth); q('vol', k.vol); q('pdr', k.pdr); q('eff', k.eff);
    F('gpi', k.formulas.gpi); F('draw', k.formulas.drawdown); F('dose', k.formulas.dose); F('dp', k.formulas.depth); F('vol', k.formulas.vol); F('pdr', k.formulas.pdr); F('eff', k.formulas.eff);
    var w = $(P + 'warn'); w.hidden = k.eff_ok !== false; if (k.eff_ok === false) w.textContent = 'PDR efficiency is ' + k.eff + '%. Design is 90% to 110%.';
    $(P + 'eff').style.color = k.eff_ok === false ? 'var(--bad)' : '';
    return bad || k.eff_ok === false;
  }
  function suggest(k, idx) { var s = $('w_s_' + k); if (idx === null || s.dataset.touched) return; if (Number(s.value) !== idx) { s.value = idx; setWord(k); } }
  function setWord(k, keepText) {
    var def = OWI.WORDS.filter(function (q) { return q.k === k; })[0], o = def.o[Number($('w_s_' + k).value)], p = $('w_p_' + k);
    if (!keepText) $('w_t_' + k).value = o[2]; p.textContent = o[1] === 'c' ? 'Custom' : OWI.TONE[o[1]]; p.style.color = { g: 'var(--good)', w: 'var(--warn)', b: 'var(--bad)', c: 'var(--mute)' }[o[1]];
  }

  // ---- draft saved on this device
  function save() { clearTimeout(timer); timer = setTimeout(function () { if (!$('inf')) return; var d = collect(); try { localStorage.setItem(draftKey, JSON.stringify({ at: Date.now(), form: snapshot() })); $('saved').textContent = 'Saved on this device ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); $('saved').className = 'pill good'; } catch (e) { $('saved').textContent = 'Could not save on this device'; $('saved').className = 'pill warn'; } }, 400); }
  // raw values of every field, so a draft restores exactly
  function snapshot() { var o = { v: {}, tri: {}, ck: {}, own: {}, touched: {} }; document.querySelectorAll('#inf input:not([type=file]):not([type=checkbox]), #inf textarea, #inf select').forEach(function (e) { if (e.id) o.v[e.id] = e.value; if (e.dataset && e.dataset.own) o.own[e.id] = 1; if (e.dataset && e.dataset.touched) o.touched[e.id] = 1; }); document.querySelectorAll('.tri').forEach(function (t) { var b = t.querySelector('[aria-pressed="true"]'); if (b) o.tri[t.getAttribute('data-s') + '|' + t.getAttribute('data-i')] = b.getAttribute('data-v'); }); document.querySelectorAll('#inf input[type=checkbox]').forEach(function (c, i) { if (c.checked) o.ck[i] = 1; }); o.rows = {}; document.querySelectorAll('.kcard').forEach(function (k) { var id = k.getAttribute('data-card'), l = [].slice.call(k.querySelectorAll('.item[data-new]')).map(function (r) { return r.querySelector('.rl').textContent; }); if (l.length) o.rows[id] = l; }); o.lats = document.querySelectorAll('#latb tr').length; o.jobs = [].slice.call(document.querySelectorAll('#job_more select')).map(function (s) { return s.value; }); return o; }
  function restore(o) {
    while (document.querySelectorAll('#latb tr').length < (o.lats || 0)) addLat();
    Object.keys(o.rows || {}).forEach(function (id) { o.rows[id].forEach(function (l) { addCardRow(id, l); }); });
    (o.jobs || []).forEach(function (j) { addJob(j); });
    Object.keys(o.v).forEach(function (id) { var e = $(id); if (e && !e.readOnly) e.value = o.v[id]; });
    Object.keys(o.own || {}).forEach(function (id) { if ($(id)) $(id).dataset.own = 1; }); Object.keys(o.touched || {}).forEach(function (id) { if ($(id)) $(id).dataset.touched = 1; });
    Object.keys(o.tri).forEach(function (k) { var a = k.split('|'), t = document.querySelector('.tri[data-s="' + a[0] + '"][data-i="' + a[1] + '"]'); if (t) pressTri(t, o.tri[k]); });
    document.querySelectorAll('#inf input[type=checkbox]').forEach(function (c, i) { c.checked = !!(o.ck && o.ck[i]); });
    OWI.WORDS.forEach(function (w) { setWord(w.k, true); });
  }
  function pressTri(t, v) { t.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === v)); }); }
  function addLat() { var n = document.querySelectorAll('#latb tr').length; if (n >= 12) return; $('latb').insertAdjacentHTML('beforeend', latRow(n, {})); }
  function addJob(sel) { var n = document.querySelectorAll('#job_more select').length; if (n >= 5) return; $('job_more').insertAdjacentHTML('beforeend', '<div class="item"><label class="ck"><input type="checkbox" checked> Hire a licensed contractor to</label><select style="flex:1 1 240px;min-width:0" aria-label="Another contractor job">' + OWI.JOBS.map(function (j) { return '<option' + (j === sel ? ' selected' : '') + '>' + E(j) + '</option>'; }).join('') + '</select></div>'); }

  // ---- photos: shrink on the phone before sending
  function shrink(file) {
    return new Promise(function (res, rej) {
      var img = new Image(), u = URL.createObjectURL(file);
      img.onload = function () { var s = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); c.toBlob(function (b) { b ? res(b) : rej(); }, 'image/jpeg', 0.82); };
      img.onerror = function () { URL.revokeObjectURL(u); rej(); }; img.src = u;
    });
  }
  function thumbs() { $('pthumbs').innerHTML = photos.map(function (b, i) { return '<span class="pill">Photo ' + (i + 1) + ' (' + Math.round(b.size / 1024) + ' KB) <button type="button" class="x" data-px="' + i + '" aria-label="Remove photo ' + (i + 1) + '">x</button></span>'; }).join(''); }

  A.inspect = function () {
    D = A.S.d; draftKey = 'ow_insp_' + D.customer.id; photos = [];
    $('panel').classList.add('wide'); $('panel').innerHTML = '<h2>New inspection</h2><p class="mute">Loading the system details...</p>'; $('panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    OW.api('/admin/api/system?customer_id=' + D.customer.id + '&date=' + today()).then(function (j) {
      if (!j.ok) return A.fail(j);
      ctx = { prev: j.prev, sys: j.system || {}, first: j.first || '' };
      $('panel').innerHTML = build(j.system, j.prev);
      OWI.WORDS.forEach(function (w) { $('w_s_' + w.k).value = w.d; setWord(w.k); });
      var raw = ''; try { raw = localStorage.getItem(draftKey) || ''; } catch (e) {}
      if (raw) { try { var dr = JSON.parse(raw); restore(dr.form); OW.toast('Restored your unsaved draft.'); } catch (e) {} }
      recalc(); wire();
    });
  };
  function wire() {
    var f = $('inf');
    f.addEventListener('input', function (e) { recalc(); save(); });
    f.addEventListener('change', function (e) { var t = e.target; if (t.id === 'i_spn' || t.id === 'i_status' || /^x_.*_pn$/.test(t.id)) t.dataset.touched = 1; if (t.dataset && t.dataset.w) { t.dataset.touched = 1; setWord(t.dataset.w); } recalc(); save(); });
    f.addEventListener('click', function (e) {
      var b = e.target.closest('.tri button'); if (b) { var t = b.parentNode, v = b.getAttribute('data-v'); pressTri(t, b.getAttribute('aria-pressed') === 'true' ? '' : v); recalc(); save(); return; }
      var ar = e.target.closest('[data-addrow]'); if (ar) { var cid = ar.getAttribute('data-addrow'), inp = $('kn_' + cid); if (addCardRow(cid, inp.value)) { inp.value = ''; recalc(); save(); } return; }
      if (e.target.id === 'addLat') { addLat(); save(); } if (e.target.id === 'addJob') { addJob(); save(); }
      var px = e.target.closest('[data-px]'); if (px) { photos.splice(Number(px.getAttribute('data-px')), 1); thumbs(); }
      if (e.target.id === 'clearDraft' && confirm('Clear everything you entered on this form?')) { try { localStorage.removeItem(draftKey); } catch (x) {} A.inspect(); }
    });
    $('i_photos').addEventListener('change', function (e) {
      var files = [].slice.call(e.target.files), left = 8 - photos.length; e.target.value = '';
      files.slice(0, Math.max(0, left)).reduce(function (p, file) { return p.then(function () { return shrink(file).then(function (b) { if (b.size > 2.5 * 1024 * 1024) OW.toast('One photo was too large to use.'); else photos.push(b); }).catch(function () { OW.toast('One photo could not be read.'); }); }); }, Promise.resolve()).then(thumbs);
    });
    f.addEventListener('submit', function (e) {
      e.preventDefault(); var m = $('im'); m.className = 'msg'; m.textContent = 'Saving...';
      var d = collect(), amt = val('i_amt');
      if (!val('i_date')) { m.className = 'msg err'; m.textContent = 'Please choose the date of inspection.'; return; }
      OW.api('/admin/api/inspection', { customer_id: D.customer.id, visit_date: val('i_date'), data: d, system: system() }).then(function (j) {
        if (!j.ok) { m.className = 'msg err'; m.textContent = j.error; return; }
        var up = photos.reduce(function (p, b) { return p.then(function (ok) { return ok && OW.api('/admin/api/reports/' + j.id + '/photo', b, { raw: true, type: 'image/jpeg' }).then(function (r) { return r.ok; }); }); }, Promise.resolve(true));
        return up.then(function (ok) {
          if (!ok) { m.className = 'msg err'; m.textContent = 'The report was saved, but a photo did not upload. It stays held. Delete it and try again.'; A.refresh(); return; }
          return OW.api('/admin/api/report-finish', { id: j.id, amount: amt }).then(function (r) {
            if (!r.ok) { m.className = 'msg err'; m.textContent = r.error; A.refresh(); return; }
            clearTimeout(timer); A.LS.set('ow_visit', amt); try { localStorage.removeItem(draftKey); } catch (x) {}
            OW.toast(r.released ? 'Saved and released to the owner and county.' : (r.emailed ? 'Saved. Invoice emailed; the report is held until paid.' : 'Saved, but the invoice email did not send.')); A.refresh();
          });
        });
      });
    });
  }

  // ---- System setup: permit, addresses, names, tanks and check cards (tank sizes and readings are entered during visits)
  var SU = null, TANKS = null;
  var rid = function () { return Math.random().toString(36).slice(2, 8); };
  // the state's approved-tank list, loaded the first time a model number is typed
  function tankList() { if (TANKS) return Promise.resolve(TANKS); return fetch('/admin/tank-list.json', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; }).then(function (l) { TANKS = l; return l; }); }
  // one tank's fields: name, model number from the permit or the tank, size, and inside dimensions
  function tankBlock(P, t, label, rm) {
    var f = function (k, l, v, x) { return fld(P + k, l, 'value="' + E(v == null ? '' : v) + '" ' + (x || '')); };
    return '<div class="item" style="display:block" data-tb="' + P + '"><div class="row" style="justify-content:space-between"><b>' + E(label) + '</b>' + (rm === undefined ? '' : '<button type="button" class="b danger" data-rmtank="' + rm + '">Remove</button>') + '</div>' +
      '<div class="two">' + f('name', 'Name', t.name, 'maxlength="60"') + f('model', 'Tank model number (e.g. STB-760 or PT-308)', t.model, 'maxlength="60" autocomplete="off"') + '</div><div class="msg" id="' + P + 'pick" hidden></div><p class="mute sm" id="' + P + 'note"></p>' +
      '<div class="three">' + f('gal', 'Size (gal)', t.gal, dec) + '<div><label for="' + P + 'shape">Shape</label><select id="' + P + 'shape"><option value="rect"' + (t.shape === 'round' ? '' : ' selected') + '>Rectangular</option><option value="round"' + (t.shape === 'round' ? ' selected' : '') + '>Round</option></select></div><div></div>' + f('a', 'Inside length or diameter (in)', t.a, dec) + f('b', 'Inside width (in)', t.b, dec) + '<div><label for="' + P + 'gpi">Gallons per inch</label><input id="' + P + 'gpi" class="auto" readonly tabindex="-1" value="' + E(t.gpi == null ? '' : t.gpi) + '"></div></div></div>';
  }
  function readTank(P, t) {
    var g = function (k) { return num(P + k); }; t.name = val(P + 'name'); t.model = val(P + 'model'); t.gal = g('gal'); t.shape = val(P + 'shape'); t.a = g('a'); t.b = g('b');
    var q = OWI.gpi(t.shape, t.a, t.b); t.gpi = q !== null ? q : (t.gpi_list || t.gpi || null); $(P + 'gpi').value = t.gpi == null ? '' : t.gpi;
  }
  function setupHtml() {
    var p = SU.permit, pi = OWI.permitInfo(p, today()), f = function (id, label, v, extra) { return fld(id, label, 'value="' + E(v == null ? '' : v) + '" ' + (extra || '')); };
    var h = '<h2>System setup</h2><p class="mute">' + E(D.customer.name) + '. Fill this in once. Every visit form is built from it. Type a tank model number and the size and inside dimensions fill in from the state approved-tank list.</p><div class="msg" id="sm" role="status"></div>';
    h += '<div class="fcard" style="padding:12px 14px"><h3>Start from a template</h3><p class="mute sm">A template only sets which check cards start on the list. You can add or remove anything afterward.</p><div class="row">' + OWI.TEMPLATES.map(function (t) { return '<button type="button" class="b alt" data-tpl="' + t.k + '">' + E(t.t) + '</button>'; }).join('') + '</div></div>';
    h += '<div class="fcard" style="padding:12px 14px"><h3>Permit and county details</h3><div class="two">' + f('su_county', 'County', p.county) + f('su_parcel', 'Parcel number', p.parcel) + f('su_type', 'System type', p.type) + f('su_desc', 'Description of system', SU.sys_desc) +
      f('su_issued', 'Operation permit issued', p.issued, 'type="date"') + f('su_months', 'Valid for (months)', p.months, dec) + '<div><label for="su_exp">Expires</label><input id="su_exp" class="auto" readonly tabindex="-1" value="' + E(pi.expires ? OW.date(pi.expires) : '') + '"></div>' +
      f('su_ca', 'Construction authorization no.', p.ca_no) + f('su_ip', 'Improvement permit no.', p.ip_no) + f('su_other', 'Other permit or approval no.', p.other_no) + f('su_flow', 'Design flow (gallons per day)', SU.design_flow, dec) + f('su_bed', 'Bedrooms', p.bedrooms, dec) + f('su_occ', 'Max occupants', p.occupants, dec) +
      '<div><label for="su_freq">Inspection frequency</label><select id="su_freq">' + OWI.FREQ.map(function (q) { return '<option value="' + q[0] + '"' + (q[0] === p.freq ? ' selected' : '') + '>' + E(q[1]) + '</option>'; }).join('') + '</select></div></div><p class="note" id="su_warn"' + (pi.expired ? '' : ' hidden') + '>The permit date entered is past its expiry. The visit form will show a warning until a new permit date is saved.</p></div>';
    h += '<div class="fcard" style="padding:12px 14px"><h3>Owners and addresses</h3>' + f('su_owners', 'Owner(s)', p.owners) + (SU.addresses.length ? SU.addresses : ['']).map(function (a, i) { return f('su_addr' + i, 'System address ' + (i + 1), a); }).join('') + '<button type="button" class="b alt" id="suAddr" style="margin-top:6px">Add another address</button></div>';
    h += '<div class="fcard" style="padding:12px 14px"><h3>Tanks</h3><p class="mute sm">Add a card for each extra tank. Each gets its own checks, numbers and calculations. Float settings and liquid depth are entered during a visit.</p>' +
      tankBlock('su_s_', SU.sep, 'First septic tank') + tankBlock('su_p_', SU.pmp, 'First pump tank') + SU.tanks.map(function (t, i) { return tankBlock('su_t' + i + '_', t, (t.kind === 'pump' ? 'Pump tank' : 'Septic tank') + ' ' + (i + 2), i); }).join('') +
      '<div class="row" style="margin-top:8px"><button type="button" class="b alt" data-addtank="septic">Add septic tank</button><button type="button" class="b alt" data-addtank="pump">Add pump tank</button></div>' +
      '<div style="margin-top:10px"><label for="su_zone">Field lines are called</label><select id="su_zone"><option' + (SU.zone_word === 'Zone' ? '' : ' selected') + '>Lateral</option><option' + (SU.zone_word === 'Zone' ? ' selected' : '') + '>Zone</option></select></div></div>';
    h += '<div class="fcard" style="padding:12px 14px"><h3>Check cards</h3><p class="mute sm">Each card is a list of yes/no checks on every visit: drip headworks, a treatment unit, permit conditions. One check per line.</p>' +
      SU.cards.map(function (c, i) { return '<div class="item" style="display:block"><div class="row"><input id="su_ct' + i + '" value="' + E(c.title) + '" maxlength="60" aria-label="Card title" style="flex:1 1 220px"><button type="button" class="b danger" data-rmcard="' + i + '">Remove</button></div><textarea id="su_ci' + i + '" aria-label="Checks for ' + E(c.title) + '" style="min-height:90px">' + E(c.items.join('\n')) + '</textarea></div>'; }).join('') +
      '<div class="row" style="margin-top:8px"><button type="button" class="b alt" id="suCard">Add a check card</button><button type="button" class="b alt" id="suCond">Add permit conditions card</button><button type="button" class="b alt" id="suChat">Add Chatham County checks</button></div></div>';
    return h + '<div class="row" style="margin-top:12px"><button type="button" class="b" id="suSave">Save setup</button><button type="button" class="b alt" id="suCancel">Close</button></div>';
  }
  function tankFor(P) { if (P === 'su_s_') return SU.sep; if (P === 'su_p_') return SU.pmp; var m = /^su_t(\d+)_$/.exec(P); return m ? SU.tanks[Number(m[1])] : null; }
  function readSetup() {
    if (!$('su_county')) return;
    var p = SU.permit; p.county = val('su_county'); p.parcel = val('su_parcel'); p.type = val('su_type'); p.issued = val('su_issued'); p.months = num('su_months'); p.ca_no = val('su_ca'); p.ip_no = val('su_ip'); p.other_no = val('su_other'); p.bedrooms = num('su_bed'); p.occupants = num('su_occ'); p.freq = val('su_freq'); p.owners = val('su_owners');
    SU.sys_desc = val('su_desc'); SU.design_flow = num('su_flow'); SU.zone_word = val('su_zone');
    SU.addresses = []; for (var i = 0; $('su_addr' + i); i++) if (val('su_addr' + i)) SU.addresses.push(val('su_addr' + i));
    readTank('su_s_', SU.sep); readTank('su_p_', SU.pmp); SU.tanks.forEach(function (t, i) { readTank('su_t' + i + '_', t); });
    SU.cards.forEach(function (c, i) { c.title = val('su_ct' + i); c.items = $('su_ci' + i).value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean); });
  }
  function showSetup(keepMsg) { var m = keepMsg && $('sm') ? $('sm').textContent : ''; $('panel').innerHTML = setupHtml(); if (m) $('sm').textContent = m; }
  // a model number was typed: look it up and fill the size and inside dimensions
  function lookupModel(P) {
    var t = tankFor(P); if (!t) return; var q = val(P + 'model'), note = $(P + 'note'), pick = $(P + 'pick'); pick.hidden = true; pick.innerHTML = ''; note.textContent = '';
    if (q.replace(/\s/g, '').length < 3) return;
    tankList().then(function (list) {
      if (val(P + 'model') !== q) return; var hits = OWI.findTanks(list, q);
      if (!hits.length) { note.textContent = list.length ? 'Not found in the state approved-tank list. Enter the size and inside dimensions yourself.' : 'The tank list could not be loaded. Enter the size and inside dimensions yourself.'; return; }
      var apply = function (r) { var o = OWI.tankFill(r); $(P + 'gal').value = o.gal; $(P + 'shape').value = o.shape; $(P + 'a').value = o.a == null ? '' : o.a; $(P + 'b').value = o.b == null ? '' : o.b; t.gpi_list = o.gpi; $(P + 'gpi').value = o.gpi == null ? '' : o.gpi; note.textContent = o.note; recalcGpi(P); };
      if (hits.length === 1) return apply(hits[0]);
      pick.hidden = false; pick.innerHTML = '<label for="' + P + 'sel">More than one manufacturer uses ' + E(q.toUpperCase()) + '. Which one?</label><select id="' + P + 'sel"><option value="">Choose...</option>' + hits.map(function (r, i) { return '<option value="' + i + '">' + E(r[2] + ' (' + r[3] + '), ' + r[4] + ' gal') + '</option>'; }).join('') + '</select>';
      $(P + 'sel').onchange = function () { if (this.value !== '') apply(hits[Number(this.value)]); };
    });
  }
  function recalcGpi(P) { var t = tankFor(P); if (!t) return; var g = OWI.gpi(val(P + 'shape'), val(P + 'a'), val(P + 'b')); $(P + 'gpi').value = g !== null ? g : (t.gpi_list || ''); }
  A.setup = function () {
    D = A.S.d; $('panel').classList.add('wide'); $('panel').innerHTML = '<h2>System setup</h2><p class="mute">Loading...</p>'; $('panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    OW.api('/admin/api/system?customer_id=' + D.customer.id + '&date=' + today()).then(function (j) {
      if (!j.ok) return A.fail(j); var s = j.system || {}, pm = s.permit || {};
      SU = { sys_desc: s.sys_desc || '', design_flow: s.design_flow == null ? null : s.design_flow, zone_word: s.zone_word || 'Lateral', addresses: (s.addresses || []).slice(),
        sep: { name: s.septic_name || '', model: s.septic_model || '', gal: s.septic_gal, shape: s.septic_shape || 'rect', a: s.septic_a, b: s.septic_b, gpi: null },
        pmp: { name: s.pump_name || '', model: s.pump_model || '', gal: s.pump_gal, shape: s.tank_shape || 'rect', a: s.tank_a, b: s.tank_b, gpi: s.gpi },
        tanks: (s.tanks || []).map(function (t) { return { id: t.id, kind: t.kind, name: t.name, model: t.model || '', gal: t.gal, shape: t.shape || 'rect', a: t.a, b: t.b, gpi: t.gpi }; }),
        cards: (s.cards || []).map(function (c) { return { id: c.id, title: c.title, items: (c.items || []).slice() }; }),
        permit: { county: pm.county || D.customer.county || '', parcel: pm.parcel || '', type: pm.type || (D.customer.sys_type ? 'Type ' + D.customer.sys_type : ''), issued: pm.issued || '', months: pm.months == null ? null : pm.months, ca_no: pm.ca_no || '', ip_no: pm.ip_no || '', other_no: pm.other_no || '', bedrooms: pm.bedrooms == null ? null : pm.bedrooms, occupants: pm.occupants == null ? null : pm.occupants, freq: pm.freq || '', owners: pm.owners || D.customer.name || '' } };
      if (!SU.addresses.length && D.customer.address) SU.addresses = [D.customer.address];
      showSetup(); wireSetup();
    });
  };
  function wireSetup() {
    var P = $('panel');
    P.oninput = function (e) { var id = e.target.id; if (id === 'su_issued' || id === 'su_months') { var pi = OWI.permitInfo({ issued: val('su_issued'), months: num('su_months') }, today()); $('su_exp').value = pi.expires ? OW.date(pi.expires) : ''; $('su_warn').hidden = !pi.expired; } var m = /^(su_(?:s|p|t\d+)_)(shape|a|b)$/.exec(id); if (m) recalcGpi(m[1]); };
    P.onchange = function (e) { var m = /^(su_(?:s|p|t\d+)_)model$/.exec(e.target.id); if (m) lookupModel(m[1]); };
    P.onclick = function (e) {
      var t = e.target, g = function (a) { var b = t.closest('[' + a + ']'); return b ? b.getAttribute(a) : null; };
      if (!$('suSave')) return;
      if (t.id === 'suCancel') { A.refresh(); return; }
      if (g('data-tpl')) { readSetup(); var tp = OWI.TEMPLATES.filter(function (x) { return x.k === g('data-tpl'); })[0]; SU.zone_word = tp.zone; tp.cards.forEach(function (c) { if (!SU.cards.some(function (x) { return x.title === c.title; })) SU.cards.push({ id: rid(), title: c.title, items: c.items.slice() }); }); showSetup(); return; }
      if (t.id === 'suAddr') { readSetup(); if (SU.addresses.length < 4) SU.addresses.push(''); showSetup(); return; }
      if (g('data-addtank')) { readSetup(); if (SU.tanks.length < 8) { var k = g('data-addtank'), n = SU.tanks.filter(function (x) { return x.kind === k; }).length + 2; SU.tanks.push({ id: rid(), kind: k, name: (k === 'pump' ? 'Pump tank ' : 'Septic tank ') + n, model: '', gal: null, shape: 'rect', a: null, b: null, gpi: null }); } showSetup(); return; }
      if (g('data-rmtank') !== null) { readSetup(); SU.tanks.splice(Number(g('data-rmtank')), 1); showSetup(); return; }
      if (t.id === 'suCard') { readSetup(); if (SU.cards.length < 8) SU.cards.push({ id: rid(), title: 'Other checks', items: [] }); showSetup(); return; }
      if (t.id === 'suChat') { readSetup(); if (SU.cards.length < 8) SU.cards.push({ id: rid(), title: 'Chatham County checks', items: OWI.CHATHAM.slice() }); showSetup(); return; }
      if (t.id === 'suCond') { readSetup(); if (SU.cards.length < 8) SU.cards.push({ id: rid(), title: 'Permit conditions', items: OWI.CONDITIONS.slice() }); showSetup(); return; }
      if (g('data-rmcard') !== null) { readSetup(); SU.cards.splice(Number(g('data-rmcard')), 1); showSetup(); return; }
      if (t.id === 'suSave') {
        readSetup(); var m = $('sm'); m.className = 'msg'; m.textContent = 'Saving...';
        var S = SU, body = { permit: S.permit, addresses: S.addresses, sys_desc: S.sys_desc, design_flow: S.design_flow, zone_word: S.zone_word, cards: S.cards, tanks: S.tanks.map(function (x) { return { id: x.id, kind: x.kind, name: x.name, model: x.model, gal: x.gal, shape: x.shape, a: x.a, b: x.b, gpi: x.gpi }; }),
          septic_name: S.sep.name, septic_model: S.sep.model, septic_gal: S.sep.gal, septic_shape: S.sep.shape, septic_a: S.sep.a, septic_b: S.sep.b, pump_name: S.pmp.name, pump_model: S.pmp.model, pump_gal: S.pmp.gal, tank_shape: S.pmp.shape, tank_a: S.pmp.a, tank_b: S.pmp.b, gpi: S.pmp.gpi };
        OW.api('/admin/api/system', { customer_id: D.customer.id, system: body }).then(function (j) { if (!j.ok) { m.className = 'msg err'; m.textContent = j.error || 'Could not save.'; return; } OW.toast('System setup saved.'); m.className = 'msg'; m.textContent = 'Saved.'; });
      }
    };
  }

  // ---- previews and PDFs for saved inspections
  function repCtx(rep) { return { cust: A.S.d.customer, op: (rep.insp.data.operator || A.cfg.operator) }; }
  A.view = function (rep, which) {
    var x = repCtx(rep), photo = function (n) { return '/admin/api/reports/' + rep.id + '/photo/' + n; };
    $('panel').innerHTML = '<div class="row" style="justify-content:space-between"><h2>' + (which === 'county' ? 'County copy' : 'Homeowner copy') + '</h2><span class="row"><button class="b alt" id="vSwap">Show ' + (which === 'county' ? 'homeowner' : 'county') + ' copy</button></span></div><style>' + OWI.CSS + '</style>' + (which === 'county' ? OWI.countyHtml(rep, x.cust, x.op) : OWI.homeHtml(rep, x.cust, x.op, photo));
    $('vSwap').onclick = function () { A.view(rep, which === 'county' ? 'home' : 'county'); };
  };
  A.pdf = function (rep, which) {
    var x = repCtx(rep);
    if (which === 'county') return OW.api('/admin/api/system?customer_id=' + x.cust.id + '&date=9999-12-30').then(function (j) { return OW.inspCountyPdf(rep, x.cust, x.op, j.system); }).then(function (b) { OW.download(b, 'county-report-' + rep.visit_date + '.pdf'); });
    var getp = []; for (var i = 1; i <= (rep.insp.photos || 0); i++) getp.push(fetch('/admin/api/reports/' + rep.id + '/photo/' + i, { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.arrayBuffer() : null; }).catch(function () { return null; }));
    return Promise.all(getp).then(function (ph) { return OW.inspHomePdf(rep, x.cust, x.op, ph.filter(Boolean)); }).then(function (b) { OW.download(b, 'septic-check-up-' + rep.visit_date + '.pdf'); });
  };
})();
