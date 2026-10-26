/* Admin: the inspection report form (modeled on the certified operator maintenance/monitoring report) and the report previews. */
(function () {
  var $ = OW.$, E = OW.esc, A = window.OWA, OWI = window.OWI;
  var D = null, ctx = null, draftKey = '', timer = null, photos = [];

  var tri = function (s, k) { return '<span class="tri" data-s="' + s + '" data-i="' + k + '"><button type="button" data-v="yes" aria-pressed="false">Yes</button><button type="button" data-v="no" aria-pressed="false">No</button><button type="button" data-v="na" aria-pressed="false">N/A</button></span>'; };
  var fld = function (id, label, extra, cls) { return '<div><label for="' + id + '">' + label + '</label><input id="' + id + '" ' + (extra || '') + (cls ? ' class="' + cls + '"' : '') + '></div>'; };
  var dec = 'inputmode="decimal" autocomplete="off"';
  var auto = function (id, label) { return fld(id, label, 'readonly tabindex="-1"', 'auto'); };
  var val = function (id) { var e = $(id); return e ? e.value.trim() : ''; };
  var num = function (id) { return OWI.n(val(id)); };
  var det = function (title, body, open, id) { return '<details class="fcard"' + (open ? ' open' : '') + '><summary><h3>' + title + '</h3><span class="pill mute" id="' + id + '"></span></summary><div class="fbody">' + body + '</div></details>'; };
  var today = function () { return new Date().toISOString().slice(0, 10); };
  var addDays = function (iso, n) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  function checklist(sec) { return sec.items.map(function (it) { return '<div class="item"><span>' + E(it[1]) + '</span>' + tri(sec.k, it[0]) + '</div>'; }).join(''); }
  function latRow(i, l) {
    l = l || {}; var f = function (k, v, c) { return '<td><input id="lat_' + k + '_' + i + '" ' + dec + (c ? ' class="' + c + '"' : '') + ' value="' + E(v == null ? '' : v) + '" aria-label="Lateral ' + (i + 1) + ' ' + k + '"></td>'; };
    return '<tr data-lat="' + i + '"><td>' + (i + 1) + '</td>' + f('len', l.length) + f('des', l.design) + f('tu', '') + f('last', l.last) + f('base', l.baseline) + f('left', '') + f('adj', '') + '</tr>';
  }

  function build(sys, prev) {
    sys = sys || {}; var h = '<h2>New inspection</h2><p class="mute" style="margin:0 0 6px">Blue boxes fill in by themselves. Your answers are saved on this device as you go.</p><div class="row" style="justify-content:space-between"><span class="pill good" id="saved">Not saved yet</span><span class="pill warn" id="needs">0 items need attention</span></div><form id="inf" novalidate>';
    h += det('1. System and visit', '<div class="two">' + fld('i_date', 'Date of inspection', 'type="date" value="' + today() + '"') + '<div><label for="i_type">Type of inspection</label><select id="i_type">' + OWI.TYPES.map(function (t) { return '<option>' + t + '</option>'; }).join('') + '</select></div>' +
      fld('s_desc', 'Type of system', 'value="' + E(sys.sys_desc || (D.customer.sys_type ? 'Type ' + D.customer.sys_type : '')) + '"') + fld('s_flow', 'Design flow (gpd)', dec + ' value="' + E(sys.design_flow == null ? '' : sys.design_flow) + '"') +
      fld('s_sgal', 'Septic tank (gal)', dec + ' value="' + E(sys.septic_gal == null ? '' : sys.septic_gal) + '"') + fld('s_ld', 'Liquid depth (in)', dec + ' value="' + E(sys.liquid_depth == null ? '' : sys.liquid_depth) + '"') +
      fld('s_pgal', 'Pump tank (gal)', dec + ' value="' + E(sys.pump_gal == null ? '' : sys.pump_gal) + '"') + fld('s_gpi', 'Pump tank gallons per inch', dec + ' value="' + E(sys.gpi == null ? '' : sys.gpi) + '"') +
      fld('s_dose', 'Dose volume (gal)', dec + ' value="' + E(sys.dose == null ? '' : sys.dose) + '"') + fld('s_dpdr', 'Design PDR, pump delivery rate (gpm)', dec + ' value="' + E(sys.design_pdr == null ? '' : sys.design_pdr) + '"') + '</div>' +
      '<p class="mute sm">Owner, permit and system details come from the customer. Tank sizes, design numbers and laterals are saved here after your first report, so you type them once.</p>' +
      '<div class="two">' + auto('a_days', 'Days since last inspection') + auto('a_last', 'Last inspection') + '</div>', true, 'c1');
    h += det('2. Septic tank', checklist(OWI.SECTIONS[0]) + '<div class="three">' + fld('i_sc', 'Scum (in)', dec) + fld('i_sl', 'Sludge (in)', dec) + auto('i_slp', 'Sludge, % of liquid depth') + '</div><p id="slw" class="mute sm"></p><div class="two">' + fld('i_spd', 'Date of last pumpout', 'type="date"') + '<div><label for="i_spn">Pumping needed?</label><select id="i_spn"><option>No</option><option>Yes</option></select></div></div>', false, 'c2');
    h += det('3. Pump tank', checklist(OWI.SECTIONS[1]) + '<div class="two">' + fld('i_psc', 'Scum (in)', dec) + fld('i_psl', 'Sludge (in)', dec) + fld('i_ppd', 'Date of last pumpout', 'type="date"') + '<div><label for="i_ppn">Pumping needed?</label><select id="i_ppn"><option>No</option><option>Yes</option></select></div></div>', false, 'c3');
    h += det('4. Pump, piping and controls', checklist(OWI.SECTIONS[2]) + '<h4>Float settings (inches above tank bottom)</h4><div class="three">' + fld('i_fa', 'Alarm', dec) + fld('i_fon', 'Pump on', dec) + fld('i_foff', 'Pump off', dec) + '</div>', false, 'c4');
    var lats = (sys.laterals && sys.laterals.length ? sys.laterals : [{}, {}, {}, {}]).map(function (l, i) { var t = prev && prev.turnups && prev.turnups[i]; return latRow(i, { length: l.length, design: l.design, last: t == null ? '' : t }); }).join('');
    h += det('5. Lateral field', checklist(OWI.SECTIONS[3]) + '<h4>Lateral head readings</h4><div class="tw"><table class="lat"><thead><tr><th>Lateral</th><th>Length</th><th>Design head</th><th>Turnup height</th><th>Head last time</th><th>Baseline head</th><th>Valves left at</th><th>Adjusted to</th></tr></thead><tbody id="latb">' + lats + '</tbody></table></div><button type="button" class="b alt" id="addLat" style="margin-top:6px">Add lateral</button>', false, 'c5');
    h += det('6. Flow test and meters', '<div class="two">' + fld('f_dose', 'Dose volume (gal)', dec) + fld('f_draw', 'Drawdown (in)', dec) + '</div><h4>Pump rate test</h4><div class="calc">' +
      calcRow('f_off', 'Water level, pump off (start)', 'in', false) + calcRow('f_on', 'Water level, pump on (after run)', 'in', false) + calcRow('f_dp', 'Depth pumped', 'in', true) + calcRow('f_gpi', 'Times gallons per inch', 'gal/in', false) + calcRow('f_vol', 'Volume pumped', 'gal', true) + calcRow('f_min', 'Divided by minutes', 'min', false) + calcRow('f_pdr', 'Measured PDR (pump delivery rate)', 'gpm', true) + calcRow('f_dpdr', 'Design PDR', 'gpm', true) + calcRow('f_eff', 'PDR efficiency', '%', true) + '</div>' +
      '<p class="note" id="pdrwarn" hidden></p><p class="mute sm">A warning shows when PDR efficiency is more than 10% above or below design.</p><h4>Meter readings</h4><div class="tw"><table><thead><tr><th></th><th>Today</th><th>Last time</th><th>Used</th><th>Per day</th><th>Design per day</th></tr></thead><tbody>' +
      '<tr><td>ET (elapsed time) hours</td><td><input id="m_et" ' + dec + ' aria-label="ET hours today"></td><td><input id="m_etl" class="auto" readonly tabindex="-1"></td><td><input id="m_etu" class="auto" readonly tabindex="-1"></td><td><input id="m_etd" class="auto" readonly tabindex="-1"></td><td><input id="m_etg" class="auto" readonly tabindex="-1"></td></tr>' +
      '<tr><td>Events</td><td><input id="m_ev" ' + dec + ' aria-label="Events today"></td><td><input id="m_evl" class="auto" readonly tabindex="-1"></td><td><input id="m_evu" class="auto" readonly tabindex="-1"></td><td><input id="m_evd" class="auto" readonly tabindex="-1"></td><td><input id="m_evg" class="auto" readonly tabindex="-1"></td></tr></tbody></table></div>', true, 'c6');
    h += det('7. Homeowner wording', '<p class="mute sm">Pick the closest canned response for each part. The sentence appears on the homeowner report. You can edit it, or choose Custom to write your own.</p>' + OWI.WORDS.map(function (w) {
      return '<div class="wd"><div class="row" style="justify-content:space-between"><label for="w_s_' + w.k + '">' + E(w.t) + '</label><span class="pill" id="w_p_' + w.k + '"></span></div><select id="w_s_' + w.k + '" data-w="' + w.k + '">' + w.o.map(function (o, i) { return '<option value="' + i + '">' + E(o[0]) + '</option>'; }).join('') + '</select><textarea id="w_t_' + w.k + '" maxlength="600" aria-label="Wording for ' + E(w.t) + '"></textarea></div>';
    }).join('') +
      '<h4>What the owner should do</h4><div class="item"><label class="ck"><input type="checkbox" id="job_on"> Hire a licensed contractor to</label><select id="job_s" style="flex:1 1 240px;min-width:0">' + OWI.JOBS.map(function (j) { return '<option>' + E(j) + '</option>'; }).join('') + '</select></div><div id="job_more"></div><button type="button" class="b alt" id="addJob" style="margin:4px 0 8px">Add another contractor job</button>' +
      OWI.TICKS.map(function (t, i) { return '<label class="ck"><input type="checkbox" class="tick" data-i="' + i + '"> ' + E(t) + '</label>'; }).join('') + '<label for="t_extra">Anything else for the owner (optional)</label><textarea id="t_extra" maxlength="400"></textarea>', false, 'c7');
    h += det('8. Finish', '<label for="i_recs">Recommendations for owner</label><textarea id="i_recs" maxlength="1500"></textarea><label for="i_com">Comments (private to you, never shown to the owner or county)</label><textarea id="i_com" maxlength="1500"></textarea>' +
      '<div class="two"><div><label for="i_status">Status of system</label><select id="i_status">' + OWI.STATUS.map(function (t) { return '<option>' + t + '</option>'; }).join('') + '</select></div>' + fld('i_next', 'Next inspection due', 'type="date" value="' + addDays(today(), 180) + '"') + '</div>' +
      '<label for="i_photos">Photos (optional, up to 8)</label><input id="i_photos" type="file" accept="image/*" multiple><div id="pthumbs" class="row" style="margin-top:6px"></div>' +
      '<label for="i_sign">Certified operator signature</label><input id="i_sign" class="auto" readonly tabindex="-1" value="' + E(A.cfg.operator.name + ', ' + A.cfg.operator.cert) + '">' +
      '<label for="i_amt">Invoice amount ($). Use 0 to waive it</label><input id="i_amt" ' + dec + ' value="' + E(A.LS.get('ow_visit') || (A.cfg && A.cfg.defaults.visit) || '0') + '"><p class="mute sm">With an invoice, the owner and the county get nothing until it is paid and 3 business days have passed. With 0, both get the report right away.</p>' +
      '<div class="row" style="margin-top:10px"><button class="b" type="submit">Save report</button><button class="b alt" type="button" id="clearDraft">Clear form</button></div><div class="msg" id="im" role="status"></div>', true, 'c8');
    return h + '</form>';
  }
  function calcRow(id, label, unit, isAuto) { return '<div class="cl"><label for="' + id + '">' + label + '</label><input id="' + id + '" ' + (isAuto ? 'class="auto" readonly tabindex="-1"' : dec) + '><span class="u">' + unit + '</span></div>'; }

  // ---- reading the form
  function collect() {
    var d = { inspect_type: val('i_type'), septic_gal: num('s_sgal'), liquid_depth: num('s_ld'), pump_gal: num('s_pgal'), gpi: num('s_gpi'), checks: {}, words: {}, laterals: [] };
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
    return d;
  }
  function system() { var lat = []; document.querySelectorAll('#latb tr').forEach(function (tr) { var i = tr.getAttribute('data-lat'); lat.push({ length: num('lat_len_' + i), design: num('lat_des_' + i) }); }); return { sys_desc: val('s_desc'), design_flow: num('s_flow'), septic_gal: num('s_sgal'), liquid_depth: num('s_ld'), pump_gal: num('s_pgal'), gpi: num('s_gpi'), dose: num('s_dose'), design_pdr: num('s_dpdr'), laterals: lat }; }
  function setv(id, v) { var e = $(id); if (e) e.value = v == null ? '' : v; }
  function fmt(x) { return x === null || x === undefined ? '' : x; }

  // ---- live numbers
  function recalc() {
    var d = collect(), date = val('i_date') || today(), sys = system();
    // keep the flow-test copies in step with the system boxes unless typed over
    ['f_dose:s_dose', 'f_gpi:s_gpi'].forEach(function (p) { var a = p.split(':'), e = $(a[0]); if (!e.dataset.own) e.value = val(a[1]); });
    d.flow.dose = num('f_dose'); d.flow.gpi = num('f_gpi');
    var c = OWI.calc(d, { design_flow: sys.design_flow, design_pdr: sys.design_pdr, dose: sys.dose, prev: ctx.prev ? { date: ctx.prev.date, et: ctx.prev.et, events: ctx.prev.events } : null, date: date });
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
    var bad = OWI.problems(d).length; $('needs').textContent = bad + (bad === 1 ? ' item needs' : ' items need') + ' attention'; $('needs').className = 'pill ' + (bad ? 'bad' : 'warn');
    var counts = {}; OWI.SECTIONS.forEach(function (sec, i) { counts[sec.k] = [Object.keys(d.checks[sec.k]).length, sec.items.length]; });
    ['septic:c2', 'pump:c3', 'controls:c4', 'field:c5'].forEach(function (z) { var a = z.split(':'); $(a[1]).textContent = counts[a[0]][0] + ' of ' + counts[a[0]][1] + ' answered'; });
    return d;
  }
  function suggest(k, idx) { var s = $('w_s_' + k); if (idx === null || s.dataset.touched) return; if (Number(s.value) !== idx) { s.value = idx; setWord(k); } }
  function setWord(k, keepText) {
    var def = OWI.WORDS.filter(function (q) { return q.k === k; })[0], o = def.o[Number($('w_s_' + k).value)], p = $('w_p_' + k);
    if (!keepText) $('w_t_' + k).value = o[2]; p.textContent = o[1] === 'c' ? 'Custom' : OWI.TONE[o[1]]; p.style.color = { g: 'var(--good)', w: 'var(--warn)', b: 'var(--bad)', c: 'var(--mute)' }[o[1]];
  }

  // ---- draft saved on this device
  function save() { clearTimeout(timer); timer = setTimeout(function () { if (!$('inf')) return; var d = collect(); try { localStorage.setItem(draftKey, JSON.stringify({ at: Date.now(), form: snapshot() })); $('saved').textContent = 'Saved on this device ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); $('saved').className = 'pill good'; } catch (e) { $('saved').textContent = 'Could not save on this device'; $('saved').className = 'pill warn'; } }, 400); }
  // raw values of every field, so a draft restores exactly
  function snapshot() { var o = { v: {}, tri: {}, ck: {}, own: {}, touched: {} }; document.querySelectorAll('#inf input:not([type=file]):not([type=checkbox]), #inf textarea, #inf select').forEach(function (e) { if (e.id) o.v[e.id] = e.value; if (e.dataset && e.dataset.own) o.own[e.id] = 1; if (e.dataset && e.dataset.touched) o.touched[e.id] = 1; }); document.querySelectorAll('.tri').forEach(function (t) { var b = t.querySelector('[aria-pressed="true"]'); if (b) o.tri[t.getAttribute('data-s') + '|' + t.getAttribute('data-i')] = b.getAttribute('data-v'); }); document.querySelectorAll('#inf input[type=checkbox]').forEach(function (c, i) { if (c.checked) o.ck[i] = 1; }); o.lats = document.querySelectorAll('#latb tr').length; o.jobs = [].slice.call(document.querySelectorAll('#job_more select')).map(function (s) { return s.value; }); return o; }
  function restore(o) {
    while (document.querySelectorAll('#latb tr').length < (o.lats || 0)) addLat();
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
      ctx = { prev: j.prev };
      $('panel').innerHTML = build(j.system, j.prev);
      OWI.WORDS.forEach(function (w) { $('w_s_' + w.k).value = w.d; setWord(w.k); });
      var raw = ''; try { raw = localStorage.getItem(draftKey) || ''; } catch (e) {}
      if (raw) { try { var dr = JSON.parse(raw); restore(dr.form); OW.toast('Restored your unsaved draft.'); } catch (e) {} }
      recalc(); wire();
    });
  };
  function wire() {
    var f = $('inf');
    f.addEventListener('input', function (e) { if (e.target.id === 'f_dose' || e.target.id === 'f_gpi') e.target.dataset.own = 1; recalc(); save(); });
    f.addEventListener('change', function (e) { var t = e.target; if (t.dataset && t.dataset.w) { t.dataset.touched = 1; setWord(t.dataset.w); } recalc(); save(); });
    f.addEventListener('click', function (e) {
      var b = e.target.closest('.tri button'); if (b) { var t = b.parentNode, v = b.getAttribute('data-v'); pressTri(t, b.getAttribute('aria-pressed') === 'true' ? '' : v); recalc(); save(); return; }
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
