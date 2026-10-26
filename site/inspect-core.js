/* Inspection report definitions and math, shared by the browser and the Worker (loaded as a plain script, exposes globalThis.OWI). */
(function (g) {
  var OWI = {};
  var YN = ['yes', 'no', 'na'];
  // [key, label, flag] flag: i = information only (a "no" is not a problem), x = a "yes" needs a note
  OWI.SECTIONS = [
    { k: 'septic', t: 'Septic tank', items: [['risers', 'Access risers present'], ['lids', 'Risers and lids intact'], ['infil', 'Tank free of infiltration'], ['screen_req', 'Effluent screen required', 'i'], ['screen_ok', 'Effluent screen present and cleaned']] },
    { k: 'pump', t: 'Pump tank', items: [['risers', 'Access riser present'], ['lids', 'Riser and lid intact'], ['infil', 'Tank free of infiltration']] },
    { k: 'controls', t: 'Pump, piping and controls', items: [['rope', 'Pump lift rope intact'], ['qd', 'Quick disconnect present'], ['iso', 'Isolation valve present'], ['check', 'Check valve present'], ['siphon', 'Anti-siphon or air release'], ['leaks', 'Discharge assembly free of leaks'], ['mounted', 'Floats securely mounted'], ['floats', 'Floats functioning properly'], ['alarm', 'Audible and visual alarm functioning'], ['panel', 'Control panel watertight'], ['switches', 'Control switches tested'], ['meter', 'Panel meter data recorded']] },
    { k: 'field', t: 'Lateral field', items: [['surf', 'Free of surfacing effluent'], ['cover', 'Adequate soil cover'], ['water', 'Surface water diverted'], ['prot', 'Turnups, valves, cleanouts protected'], ['veg', 'Vegetation maintained'], ['traffic', 'Protected from traffic'], ['rep_des', 'Repair area designated'], ['rep_prot', 'Repair area protected'], ['flush', 'Laterals flushed'], ['other', 'Other (describe in comments)', 'x']] }
  ];
  OWI.STATUS = ['Compliant', 'Non-compliant', 'Malfunctioning', 'Needs maintenance', 'Incomplete inspection'];
  OWI.TYPES = ['Regular semi-annual', 'Alarm response', 'Complaint', 'Pre-sale', 'Follow-up'];
  OWI.TONE = { g: 'Good', w: 'Fix soon', b: 'Fix now', c: 'See note' };
  // canned homeowner wording: [name, tone, text]
  OWI.WORDS = [
    { k: 'septic', t: 'Septic tank', d: 0, o: [['Good', 'g', 'Lids and risers are sound, no groundwater is leaking in, and the filter was cleaned. The filter catches solids before they reach your drain field.'], ['Damaged lid or riser', 'w', 'A lid or riser is cracked or loose. It is a safety hazard and lets water and debris in. Have a contractor repair it soon.'], ['Groundwater leaking in', 'w', 'Groundwater is getting into the tank, which overloads the system. A contractor should find and seal the entry point.'], ['Filter needs service', 'w', 'The filter was clogged. We cleaned it, but heavy clogging often means wipes, grease or too much laundry water are reaching the tank.'], ['Custom', 'c', '']] },
    { k: 'pumptank', t: 'Pump tank, floats, alarm', d: 0, o: [['Good', 'g', 'The floats start and stop the pump, and the alarm warns you of trouble. We tested all of them and they work.'], ['Alarm not working', 'b', 'The alarm did not work when tested. It is your only warning of a failure, so it needs repair right away.'], ['Float loose or sticking', 'w', 'A float is loose or not switching reliably. A bad float can leave the pump running too long or not at all. A contractor should replace it soon.'], ['Custom', 'c', '']] },
    { k: 'panel', t: 'Control panel', d: 0, o: [['Good', 'g', 'The panel is dry and working normally. It is the brain of the pump system, and yours is in good shape.'], ['Wear, fix soon', 'w', 'The panel is not fully watertight, and the contactor shows wear. Moisture and wear are the most common reasons a pump panel fails.'], ['Failing, fix now', 'b', 'The panel is failing. The pump may stop soon. Have a licensed contractor repair it within days.'], ['Custom', 'c', '']] },
    { k: 'field', t: 'Drain field', d: 0, o: [['Good', 'g', 'No wet spots or odors on the surface, and the soil cover is good. This is where the soil cleans your wastewater, so it is the most expensive part to replace.'], ['Wet spot on surface', 'b', 'We saw wastewater at the surface. Keep children and pets away. A contractor needs to find the cause soon.'], ['Soil cover thin or washed out', 'w', 'Soil over the pipes is thin in places. Pipes can freeze or crack. Add soil and grass cover.'], ['Vehicle or heavy traffic', 'w', 'There are signs of vehicles or heavy loads on the field. They crush the pipes. Please keep them off.'], ['Custom', 'c', '']] },
    { k: 'flow', t: 'Pump flow (PDR)', d: 0, o: [['Within 10% of design', 'g', 'Your pump moves about what it was designed to. That means the pump and pipes are working as intended.'], ['Above design', 'w', 'Your pump moves more than designed. We allow 10% either way. A little high can mean the pump or a fitting is wearing, so we will watch it.'], ['Below design', 'w', 'Your pump moves less than designed. This often means a clog, a worn pump or a partly closed valve. A contractor should look at it.'], ['Custom', 'c', '']] },
    { k: 'solids', t: 'Solids in the septic tank', d: 0, o: [['Under 33%, no pumping needed', 'g', 'Sludge is below one third of the tank, so no pumping is needed yet. We will tell you when to schedule it.'], ['Plan pumping this year', 'w', 'Solids are building up. Plan to have a licensed pumper service the tank in the next several months.'], ['Pump now (33% or more)', 'b', 'Sludge has reached one third of the tank or more. It is time to pump. Have the tank pumped by a licensed pumper within 30 days.'], ['Custom', 'c', '']] },
    { k: 'runtime', t: 'How often the pump runs', d: 0, o: [['Steady', 'g', 'Your pump turns on about as often as it was designed to. Much more than designed would mean extra water is entering the system, such as a leaking toilet, which we would flag.'], ['Higher than before', 'w', 'The pump is running more than on past visits. Check toilets and faucets for leaks and spread laundry over the week.'], ['Lower than before', 'w', 'The pump is running less than before. If the house is occupied, that is unusual and we will check it next visit.'], ['Custom', 'c', '']] }
  ];
  OWI.JOBS = ['Replace the control panel contactor', 'Repair the control panel (make it watertight)', 'Repair or replace the damaged lid or riser', 'Repair the alarm', 'Replace a float', 'Repair or replace the pump', 'Repair a leaking discharge line, valve or fitting', 'Find and seal groundwater leaking into the tank', 'Repair the wet spot on the drain field', 'Add soil cover over the drain field', 'Other (see the note)'];
  OWI.TICKS = ['Have the septic tank pumped by a licensed pumper.', 'Repair or replace the damaged lid or riser.', 'Keep wipes, grease and paint out of the drains.', 'Keep cars and heavy equipment off the drain field.', 'Fix leaking toilets and faucets.', 'Spread laundry over the week instead of one day.', 'Add soil and grass cover over the drain field.'];

  var n = function (v) { if (v === '' || v === null || v === undefined) return null; var x = Number(String(v).replace(/,/g, '')); return isFinite(x) ? x : null; };
  var r1 = function (x) { return x === null ? null : Math.round(x * 10) / 10; };
  var r2 = function (x) { return x === null ? null : Math.round(x * 100) / 100; };
  OWI.n = n;
  OWI.PUMP_AT = 100 / 3;
  // gallons per inch of depth from the inside size of the tank: 1 gallon = 231 cubic inches
  OWI.gpi = function (shape, a, b) { a = n(a); b = n(b); if (!a || a <= 0 || a > 1000) return null; if (shape === 'round') return r1(Math.PI * Math.pow(a / 2, 2) / 231); if (!b || b <= 0 || b > 1000) return null; return r1(a * b / 231); };

  // ctx: { design_flow, design_pdr, dose, prev: {date, et, events, heads:{n:head}}, date }
  OWI.calc = function (d, ctx) {
    ctx = ctx || {}; var f = d.flow || {}, m = d.meters || {}, o = {};
    var off = n(f.off), on = n(f.on), gpi = n(f.gpi) || n(d.gpi), min = n(f.min), dpdr = n(f.design_pdr) || n(ctx.design_pdr);
    o.depth = off !== null && on !== null ? r1(on - off) : null;
    o.vol = o.depth !== null && gpi ? Math.round(o.depth * gpi) : null;
    o.pdr = o.vol !== null && min ? r1(o.vol / min) : null;
    o.eff = o.pdr !== null && dpdr ? Math.round(o.pdr / dpdr * 100) : null;
    o.eff_ok = o.eff === null ? null : Math.abs(o.eff - 100) <= 10;
    var ld = n(d.liquid_depth), sl = n(d.septic && d.septic.sludge);
    o.sludge_pct = sl !== null && ld ? r1(sl / ld * 100) : null;
    o.pump_now = o.sludge_pct !== null && o.sludge_pct >= OWI.PUMP_AT;
    var prev = ctx.prev || {}, days = null;
    if (prev.date && ctx.date) days = Math.round((Date.parse(ctx.date + 'T12:00:00Z') - Date.parse(prev.date + 'T12:00:00Z')) / 86400000);
    o.days = days > 0 ? days : null;
    var et = n(m.et), ev = n(m.events);
    o.et_used = et !== null && n(prev.et) !== null ? r2(et - n(prev.et)) : null;
    o.ev_used = ev !== null && n(prev.events) !== null ? ev - n(prev.events) : null;
    o.et_day = o.et_used !== null && o.days ? r2(o.et_used / o.days) : null;
    o.events_day = o.ev_used !== null && o.days ? r1(o.ev_used / o.days) : null;
    var dose = n(f.dose) || n(ctx.dose), dflow = n(ctx.design_flow);
    o.events_design = dose && dflow ? r1(dflow / dose) : null;
    o.et_design = o.events_design !== null && dpdr ? r2(o.events_design * (dose / dpdr) / 60) : null;
    return o;
  };

  // the numbers that get graphed, one value per visit
  OWI.readings = function (d, c) {
    var o = {}, lat = (d.laterals || [])[0], h = lat ? n(lat.turnup) : null;
    [['pdr', c.pdr], ['pdr_eff', c.eff], ['sludge_pct', c.sludge_pct], ['et_day', c.et_day], ['events_day', c.events_day], ['events_design', c.events_design], ['lat1_head', h]].forEach(function (p) { if (p[1] !== null && p[1] !== undefined) o[p[0]] = p[1]; });
    return o;
  };
  OWI.problems = function (d) {
    var out = [];
    OWI.SECTIONS.forEach(function (s) { s.items.forEach(function (it) { var a = (d.checks && d.checks[s.k] || {})[it[0]]; if ((a === 'no' && it[2] !== 'i') || (a === 'yes' && it[2] === 'x')) out.push({ s: s.t, label: it[1] }); }); });
    return out;
  };
  // roll the canned answers up into the four pass/repair rows the older screens use
  OWI.rollup = function (d) {
    var w = d.words || {}, map = [['septic', 'Septic tank'], ['pumptank', 'Pump tank, floats, alarm'], ['panel', 'Control panel'], ['field', 'Drain field']];
    return map.map(function (p) { var x = w[p[0]]; var def = OWI.WORDS.filter(function (q) { return q.k === p[0]; })[0]; var tone = x && def.o[x.i] ? def.o[x.i][1] : 'g'; return { label: p[1], status: tone === 'g' || tone === 'c' ? 'pass' : 'repair' }; });
  };
  OWI.overall = function (status) {
    return { 'Compliant': ['g', 'Overall: good.', 'Your system is working as it should and nothing needs to be done right now.'], 'Needs maintenance': ['w', 'Overall: needs a small repair soon.', 'Your system is working and nothing is leaking out. Something is wearing or needs attention. It is not an emergency, but it should be handled in the next month or two.'], 'Non-compliant': ['b', 'Overall: needs attention now.', 'Your system does not meet the county requirements right now. Please read what to do below and act soon.'], 'Malfunctioning': ['b', 'Overall: needs attention now.', 'Part of your system is not working properly. Please read what to do below and act soon.'], 'Incomplete inspection': ['w', 'Overall: inspection not finished.', 'We could not finish the inspection on this visit. We will schedule the rest.'] }[status] || ['w', 'Overall: see below.', ''];
  };
  OWI.wordRow = function (d, k) { var def = OWI.WORDS.filter(function (q) { return q.k === k; })[0], x = (d.words || {})[k]; if (!x || !def.o[x.i]) return null; return { label: def.o[x.i][0] === 'Custom' ? 'See note' : OWI.TONE[def.o[x.i][1]], tone: def.o[x.i][1], text: x.t || '' }; };
  OWI.actions = function (d) {
    var t = d.todo || {}, out = [];
    (t.jobs || []).forEach(function (j) { if (j) out.push('Hire a licensed contractor to ' + j.charAt(0).toLowerCase() + j.slice(1) + '.'); });
    (t.ticks || []).forEach(function (i) { if (OWI.TICKS[i]) out.push(OWI.TICKS[i]); });
    if (t.extra) out.push(t.extra);
    return out;
  };

  // cap and clean what comes in so a bad request cannot store junk
  OWI.sanitize = function (b) {
    var S = function (v, m) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, m); };
    var N = function (v) { var x = n(v); return x !== null && x >= 0 && x < 1e6 ? x : null; };
    var s = b || {}, d = { checks: {}, words: {}, laterals: [] };
    d.inspect_type = OWI.TYPES.indexOf(s.inspect_type) >= 0 ? s.inspect_type : OWI.TYPES[0];
    ['septic_gal', 'liquid_depth', 'pump_gal', 'gpi'].forEach(function (k) { d[k] = N(s[k]); });
    OWI.SECTIONS.forEach(function (sec) { d.checks[sec.k] = {}; sec.items.forEach(function (it) { var a = s.checks && s.checks[sec.k] && s.checks[sec.k][it[0]]; if (YN.indexOf(a) >= 0) d.checks[sec.k][it[0]] = a; }); });
    ['septic', 'pump'].forEach(function (k) { var x = s[k] || {}; d[k] = { scum: N(x.scum), sludge: N(x.sludge), pumped: /^\d{4}-\d{2}-\d{2}$/.test(x.pumped || '') ? x.pumped : '', pump_needed: x.pump_needed === 'Yes' ? 'Yes' : 'No' }; });
    var fl = s.floats || {}; d.floats = { alarm: N(fl.alarm), on: N(fl.on), off: N(fl.off) };
    (Array.isArray(s.laterals) ? s.laterals : []).slice(0, 12).forEach(function (l, i) { l = l || {}; d.laterals.push({ n: i + 1, length: N(l.length), design: N(l.design), turnup: N(l.turnup), last: N(l.last), baseline: N(l.baseline), left: N(l.left), adjusted: N(l.adjusted) }); });
    var f = s.flow || {}; d.flow = { dose: N(f.dose), drawdown: N(f.drawdown), off: N(f.off), on: N(f.on), gpi: N(f.gpi), min: N(f.min), design_pdr: N(f.design_pdr) };
    var m = s.meters || {}; d.meters = { et: N(m.et), events: N(m.events) };
    OWI.WORDS.forEach(function (w) { var x = s.words && s.words[w.k]; var i = x && Number.isInteger(x.i) && x.i >= 0 && x.i < w.o.length ? x.i : w.d; d.words[w.k] = { i: i, t: S(x && x.t, 600) }; });
    var t = s.todo || {}; d.todo = { jobs: (Array.isArray(t.jobs) ? t.jobs : []).slice(0, 6).filter(function (j) { return OWI.JOBS.indexOf(j) >= 0; }), ticks: (Array.isArray(t.ticks) ? t.ticks : []).filter(function (i) { return Number.isInteger(i) && i >= 0 && i < OWI.TICKS.length; }), extra: S(t.extra, 400) };
    d.recs = S(s.recs, 1500); d.comments = S(s.comments, 1500);
    d.status = OWI.STATUS.indexOf(s.status) >= 0 ? s.status : 'Incomplete inspection';
    d.next_due = /^\d{4}-\d{2}-\d{2}$/.test(s.next_due || '') ? s.next_due : '';
    return d;
  };
  g.OWI = OWI;
})(typeof globalThis !== 'undefined' ? globalThis : this);
