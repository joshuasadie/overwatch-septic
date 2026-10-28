/* Inspection report definitions and math, shared by the browser and the Worker (loaded as a plain script, exposes globalThis.OWI). */
(function (g) {
  var OWI = {};
  var YN = ['yes', 'no', 'na'];
  // [key, label, flag] flag: i = information only (a "no" is not a problem), x = a "yes" needs a note
  OWI.SECTIONS = [
    { k: 'septic', t: 'Septic tank', items: [['risers', 'Access risers present'], ['lids', 'Risers and lids intact'], ['infil', 'Tank free of infiltration'], ['screen_req', 'Effluent screen required', 'i'], ['screen_ok', 'Effluent screen present and cleaned']] },
    { k: 'pump', t: 'Pump tank', items: [['risers', 'Access riser present'], ['lids', 'Riser and lid intact'], ['infil', 'Tank free of infiltration'], ['clear', 'Effluent appears clear']] },
    { k: 'controls', t: 'Pump, piping and controls', items: [['pumps', 'Required pumps present and cycling properly'], ['rope', 'Pump lift rope intact'], ['qd', 'Quick disconnect present'], ['iso', 'Isolation valve present'], ['check', 'Check valve present'], ['siphon', 'Anti-siphon or air release'], ['leaks', 'Discharge assembly free of leaks'], ['mounted', 'Floats securely mounted'], ['floats', 'Floats functioning properly'], ['alarm', 'Audible and visual alarm functioning'], ['panel', 'Control panel watertight'], ['switches', 'Control switches tested'], ['meter', 'Panel meter data recorded']] },
    { k: 'field', t: 'Lateral field', items: [['surf', 'Free of surfacing effluent'], ['cover', 'Adequate soil cover'], ['water', 'Surface water diverted'], ['prot', 'Turnups, valves, cleanouts protected'], ['veg', 'Vegetation maintained'], ['traffic', 'Protected from traffic'], ['rep_des', 'Repair area designated'], ['rep_prot', 'Repair area protected'], ['flush', 'Laterals flushed'], ['dist_acc', 'Distribution devices accessible'], ['dist_ok', 'Distribution devices working properly'], ['ponding', 'Minimal ponding in trenches'], ['standing', 'No effluent standing in lower laterals'], ['other', 'Other (describe in comments)', 'x']] },
    { k: 'facility', t: 'Facility', items: [['permit', 'Type, size and flow per permit'], ['softener', 'Water softener in use', 'i'], ['additive', 'Septic tank additive in use', 'i']] }
  ];
  // reports list Facility first, as the county forms do
  OWI.REPORT_SECTIONS = function () { return OWI.SECTIONS.filter(function (s) { return s.k === 'facility'; }).concat(OWI.SECTIONS.filter(function (s) { return s.k !== 'facility'; })); };
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
    var fon = n(d.floats && d.floats.on), foff = n(d.floats && d.floats.off);
    o.drawdown = fon !== null && foff !== null && fon >= foff ? r1(fon - foff) : null;
    var gpid = n(d.gpi) || gpi;
    o.dose = o.drawdown !== null && gpid ? Math.round(o.drawdown * gpid) : null;
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
    o.days = days > 0 ? days : null; o.last = o.days ? prev.date : '';
    var et = n(m.et), ev = n(m.events);
    o.et_used = et !== null && n(prev.et) !== null ? r2(et - n(prev.et)) : null;
    o.ev_used = ev !== null && n(prev.events) !== null ? ev - n(prev.events) : null;
    o.et_day = o.et_used !== null && o.days ? r2(o.et_used / o.days) : null;
    o.events_day = o.ev_used !== null && o.days ? r1(o.ev_used / o.days) : null;
    // flow meter: gallons since the last visit, and the 7-day and 30-day totals the permit asks for
    var fm = n(m.flow);
    o.flow_used = fm !== null && n(prev.flow) !== null && fm >= n(prev.flow) ? Math.round(fm - n(prev.flow)) : null;
    o.flow_day = o.flow_used !== null && o.days ? Math.round(o.flow_used / o.days) : null;
    o.flow7_day = n(m.flow7) !== null ? Math.round(n(m.flow7) / 7) : null;
    o.flow30_day = n(m.flow30) !== null ? Math.round(n(m.flow30) / 30) : null;
    // average daily flow, as on the county forms: run hours x 60 x pump rate / days
    var rate = o.pdr !== null ? o.pdr : dpdr;
    o.gpd_gal = o.et_used !== null && rate ? Math.round(o.et_used * 60 * rate) : null;
    o.gpd_avg = o.gpd_gal !== null && o.days ? Math.round(o.gpd_gal / o.days) : null;
    var dose = o.dose || n(f.dose) || n(ctx.dose), dflow = n(ctx.design_flow);
    o.events_design = dose && dflow ? r1(dflow / dose) : null;
    o.et_design = o.events_design !== null && dpdr ? r2(o.events_design * (dose / dpdr) / 60) : null;
    return o;
  };


  OWI.latPct = function (l) { var de = n(l && l.design), t = n(l && l.turnup); return de && t !== null ? Math.round((t - de) / de * 100) : null; };
  // the arithmetic behind each calculated number, with the real values: shown under the boxes and on the county report
  OWI.formulas = function (d, c, ctx) {
    ctx = ctx || {}; var f = d.flow || {}, m = d.meters || {}, fl = d.floats || {}, F = {}, p = ctx.prev || {};
    var gpi = n(f.gpi) || n(d.gpi), dpdr = n(f.design_pdr) || n(ctx.design_pdr), nn = function (x) { return x === null || x === undefined ? null : x; };
    if (c.drawdown !== null) F.drawdown = fl.on + ' - ' + fl.off + ' = ' + c.drawdown + ' in';
    if (c.dose !== null) F.dose = c.drawdown + ' x ' + (n(d.gpi) || gpi) + ' = ' + c.dose + ' gal';
    if (c.depth !== null) F.depth = f.on + ' - ' + f.off + ' = ' + c.depth + ' in';
    if (c.vol !== null) F.vol = c.depth + ' x ' + gpi + ' = ' + c.vol + ' gal';
    if (c.pdr !== null) F.pdr = c.vol + ' / ' + f.min + ' = ' + c.pdr + ' gpm';
    if (c.eff !== null) F.eff = c.pdr + ' / ' + dpdr + ' = ' + c.eff + '%';
    if (c.sludge_pct !== null) F.sludge = d.septic.sludge + ' / ' + d.liquid_depth + ' = ' + c.sludge_pct + '%';
    if (c.days !== null) F.days = ctx.date + ' minus ' + p.date + ' = ' + c.days + ' days';
    if (c.et_day !== null) F.et = m.et + ' - ' + p.et + ' = ' + c.et_used + ' hours; ' + c.et_used + ' / ' + c.days + ' days = ' + c.et_day + ' per day';
    if (c.events_day !== null) F.events = m.events + ' - ' + p.events + ' = ' + c.ev_used + ' events; ' + c.ev_used + ' / ' + c.days + ' days = ' + c.events_day + ' per day';
    if (c.flow_day != null) F.flow = 'Flow meter ' + m.flow + ' - ' + p.flow + ' = ' + c.flow_used + ' gal / ' + c.days + ' days = ' + c.flow_day + ' gpd';
    if (c.flow7_day != null) F.flow7 = '7-day flow ' + m.flow7 + ' gal / 7 = ' + c.flow7_day + ' gpd';
    if (c.flow30_day != null) F.flow30 = '30-day flow ' + m.flow30 + ' gal / 30 = ' + c.flow30_day + ' gpd';
    if (c.gpd_avg !== null) F.gpd = c.et_used + ' hours x 60 x ' + (c.pdr !== null ? c.pdr : dpdr) + ' gpm = ' + c.gpd_gal + ' gal / ' + c.days + ' days = ' + c.gpd_avg + ' gpd';
    var dose = c.dose || n(f.dose) || n(ctx.dose);
    if (c.events_design !== null) F.events_design = ctx.design_flow + ' gpd / ' + dose + ' gal = ' + c.events_design + ' per day';
    if (c.et_design !== null) F.et_design = c.events_design + ' x (' + dose + ' gal / ' + dpdr + ' gpm / 60) = ' + c.et_design + ' hours per day';
    return F;
  };
  OWI.gpiFormula = function (shape, a, b) { var g = OWI.gpi(shape, a, b); if (g === null) return ''; return shape === 'round' ? '3.1416 x (' + a + ' / 2)^2 / 231 = ' + g + ' gal/in' : a + ' x ' + b + ' / 231 = ' + g + ' gal/in'; };

  // the numbers that get graphed, one value per visit
  OWI.readings = function (d, c) {
    var o = {}, lat = (d.laterals || [])[0], h = lat ? n(lat.turnup) : null;
    [['pdr', c.pdr], ['pdr_eff', c.eff], ['sludge_pct', c.sludge_pct], ['et_day', c.et_day], ['events_day', c.events_day], ['events_design', c.events_design], ['gpd_avg', c.gpd_avg], ['flow_day', c.flow_day], ['lat1_head', h]].forEach(function (p) { if (p[1] !== null && p[1] !== undefined) o[p[0]] = p[1]; });
    return o;
  };
  OWI.problems = function (d) {
    var out = [];
    OWI.SECTIONS.forEach(function (s) { s.items.forEach(function (it) { var a = (d.checks && d.checks[s.k] || {})[it[0]]; if ((a === 'no' && !it[2]) || (a === 'yes' && it[2] === 'x')) out.push({ s: s.t, label: it[1] }); }); });
    Object.keys(d.tanks || {}).forEach(function (id) { var t = d.tanks[id]; (OWI.TANK_ITEMS[t.kind] || []).forEach(function (it) { if ((t.checks || {})[it[0]] === 'no' && it[2] !== 'i') out.push({ s: t.name, label: it[1] }); }); });
    Object.keys(d.cards || {}).forEach(function (id) { (d.cards[id].rows || []).forEach(function (r) { if (r.a === 'no') out.push({ s: d.cards[id].title, label: r.l }); }); });
    return out;
  };
  // roll the canned answers up into the four pass/repair rows the older screens use
  OWI.rollup = function (d, c) {
    var w = d.words || {}, map = [['septic', 'Septic tank'], ['pumptank', 'Pump tank, floats, alarm'], ['panel', 'Control panel'], ['field', 'Drain field']];
    return map.map(function (p) { var x = w[p[0]]; var def = OWI.WORDS.filter(function (q) { return q.k === p[0]; })[0]; var tone = x && def.o[x.i] ? def.o[x.i][1] : 'g'; return { label: p[1], status: tone === 'g' || tone === 'c' ? 'pass' : 'repair' }; })
      .concat(c || d.tanks || d.cards ? (function () { var e = OWI.extras(d, c || {}); return e.tanks.concat(e.cards).map(function (x) { return { label: x.name || x.title, status: x.bad ? 'repair' : 'pass' }; }); })() : []);
  };
  OWI.overall = function (status) {
    return { 'Compliant': ['g', 'Overall: good.', 'Your system is working as it should and nothing needs to be done right now.'], 'Needs maintenance': ['w', 'Overall: needs a small repair soon.', 'Your system is working and nothing is leaking out. Something is wearing or needs attention. It is not an emergency, but it should be handled in the next month or two.'], 'Non-compliant': ['b', 'Overall: needs attention now.', 'Your system does not meet the county requirements right now. Please read what to do below and act soon.'], 'Malfunctioning': ['b', 'Overall: needs attention now.', 'Part of your system is not working properly. Please read what to do below and act soon.'], 'Incomplete inspection': ['w', 'Overall: inspection not finished.', 'We could not finish the inspection on this visit. We will schedule the rest.'] }[status] || ['w', 'Overall: see below.', ''];
  };
  OWI.wordRow = function (d, k) { var def = OWI.WORDS.filter(function (q) { return q.k === k; })[0], x = (d.words || {})[k]; if (!x || !def.o[x.i]) return null; return { label: def.o[x.i][0] === 'Custom' ? 'See note' : OWI.TONE[def.o[x.i][1]], tone: def.o[x.i][1], text: x.t || '' }; };
  OWI.actions = function (d, c) {
    var t = d.todo || {}, out = [];
    (t.jobs || []).forEach(function (j) { if (j) out.push('Hire a licensed contractor to ' + j.charAt(0).toLowerCase() + j.slice(1) + '.'); });
    (t.ticks || []).forEach(function (i) { if (OWI.TICKS[i]) out.push(OWI.TICKS[i]); });
    if (t.extra) out.push(t.extra);
    // problems found on extra tanks and cards always make the list, so "nothing needed" is never wrong
    if (c) { var X = OWI.extras(d, c); X.tanks.concat(X.cards).forEach(function (x) {
      if (!x.bad) return; var nm = x.name || x.title;
      if (x.kind === 'septic' && x.k.pump_now) out.push('Have ' + nm + ' pumped by a licensed pumper within 30 days.');
      if (x.badl.length) out.push('Hire a licensed contractor to fix ' + nm + ': ' + x.badl.join('; ').toLowerCase() + '.');
      else if (x.k && x.k.eff_ok === false) out.push('Hire a licensed contractor to check the pump flow at ' + nm + '.');
    }); }
    return out;
  };

  // ---- flexible systems: extra tanks, check cards, permit details
  OWI.TANK_ITEMS = { septic: OWI.SECTIONS[0].items, pump: OWI.SECTIONS[1].items.concat([['floats', 'Floats functioning properly'], ['alarm', 'Audible and visual alarm functioning']]) };
  OWI.TEMPLATES = [
    { k: 'gravity', t: 'Septic tank with gravity field', zone: 'Lateral', cards: [] },
    { k: 'pump', t: 'Pump to field', zone: 'Lateral', cards: [] },
    { k: 'drip', t: 'Drip irrigation (Type V)', zone: 'Zone', cards: [{ title: 'Drip headworks and filter', items: ['Filter cleaned', 'Zone valves open and close', 'Air release valves working', 'Field flushed'] }] },
    { k: 'treat', t: 'Treatment unit (AdvanTex, E-Z Treat)', zone: 'Lateral', cards: [{ title: 'Treatment unit', items: ['Unit running normally', 'Blower or pump working', 'Alarm working', 'Filter or media checked', 'Discharge clear'] }] },
    { k: 'blank', t: 'Blank', zone: 'Lateral', cards: [] }
  ];
  OWI.CHATHAM = ['Type, size and flow match the permit', 'No water softener', 'No septic tank additive used', 'Effluent appears clear', 'No ponding in the trenches', 'Distribution devices accessible and working', 'No effluent standing in the lower laterals'];
  OWI.CONDITIONS = ['Contract on file with county', 'Annual monitoring fee paid', 'Grass cover and trench lines settled', 'Repair area kept clear', 'Water supply and well distance checked'];
  OWI.FREQ = [['', 'Not set'], ['q1s', 'Quarterly the first year, then twice a year'], ['q', 'Quarterly'], ['s', 'Twice a year'], ['a', 'Once a year']];
  var DAY = 86400000, isoDay = /^\d{4}-\d{2}-\d{2}$/;
  var addDays = function (iso, k) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
  OWI.addDays = addDays;
  OWI.permitInfo = function (p, today) {
    p = p || {}; var mo = n(p.months);
    if (!isoDay.test(p.issued || '') || !mo || mo < 1 || mo > 240) return { expires: '', expired: null, days: null };
    var d = new Date(p.issued + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + mo); var exp = d.toISOString().slice(0, 10);
    return { expires: exp, expired: exp < today, days: Math.round((Date.parse(exp + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / DAY) };
  };
  // suggested next check-up from the permit's schedule; first = date of the earliest inspection on file
  OWI.nextDue = function (freq, visit, first) {
    var days = { q: 91, s: 182, a: 365 }[freq] || 182;
    if (freq === 'q1s') days = !first || (Date.parse(visit + 'T12:00:00Z') - Date.parse(first + 'T12:00:00Z')) / DAY < 365 ? 91 : 182;
    return addDays(visit, days);
  };
  OWI.calcTank = function (t, kind) {
    var o = { formulas: {} };
    if (kind === 'septic') {
      var ld = n(t.liquid_depth), sl = n(t.sludge);
      o.sludge_pct = sl !== null && ld ? r1(sl / ld * 100) : null; o.pump_now = o.sludge_pct !== null && o.sludge_pct >= OWI.PUMP_AT;
      if (o.sludge_pct !== null) o.formulas.sludge = sl + ' / ' + ld + ' = ' + o.sludge_pct + '%';
      return o;
    }
    var g = OWI.gpi(t.shape, t.a, t.b), fromDims = g !== null; if (g === null) g = n(t.gpi);
    var fl = t.flow || {}, pd = { gpi: g, flow: { on: fl.on, off: fl.off, min: fl.min, gpi: g, design_pdr: t.design_pdr }, floats: t.floats || {}, meters: {} };
    var c = OWI.calc(pd, { design_pdr: t.design_pdr }); c.formulas = OWI.formulas(pd, c, { design_pdr: t.design_pdr });
    if (fromDims) c.formulas.gpi = OWI.gpiFormula(t.shape, t.a, t.b);
    c.gpi = g; return c;
  };
  // state approved-tank list rows: [model, imprint, maker, county, gallons, shape r|c|o, inside length, inside width, inside height, gal/in]
  var squash = function (x) { return String(x == null ? '' : x).toUpperCase().replace(/\s+/g, ''); };
  OWI.findTanks = function (list, q) {
    q = squash(q); if (q.length < 3) return [];
    var hit = (list || []).filter(function (r) { return r[0] === q || squash(r[1]) === q; });
    if (hit.length || q.length < 6) return hit;
    hit = (list || []).filter(function (r) { return squash(r[1]).indexOf(q) >= 0; });
    return hit.length <= 8 ? hit : [];
  };
  OWI.tankFill = function (r) {
    var o = { gal: r[4], shape: r[5] === 'c' ? 'round' : 'rect', a: null, b: null, gpi: null, h: r[8] || null, maker: r[2], county: r[3], imprint: r[1] };
    if (r[5] === 'r' && r[6] && r[7]) { o.a = r[6]; o.b = r[7]; } else if (r[5] === 'c' && r[6]) o.a = r[6];
    o.gpi = o.a ? OWI.gpi(o.shape, o.a, o.b) : null; if (o.gpi === null) o.gpi = r[9] || null;
    o.liq = o.gpi ? Math.round(o.gal / o.gpi) : null;
    o.note = r[2] + ' (' + r[3] + '). ' + o.gal.toLocaleString('en-US') + ' gal. ' + (r[5] === 'r' && r[6] && r[7] ? 'Inside ' + r[6] + ' x ' + r[7] + ' in' + (r[8] ? ', ' + r[8] + ' in tall' : '') + '. ' : r[5] === 'o' ? 'Octagonal or hexagonal: the list gives ' + (r[9] || '?') + ' gal/in and no usable length and width, so gallons per inch comes from the list. ' : 'The list gives no inside size for this tank. Measure it. ') + (o.liq ? 'About ' + o.liq + ' in of liquid holds the full ' + o.gal.toLocaleString('en-US') + ' gal. Measure the real liquid depth at the outlet.' : '');
    return o;
  };

  // the extra tanks and check cards of one report, ready to show (shared by the web pages and the PDFs)
  OWI.extras = function (d, c) {
    var out = { tanks: [], cards: [], malfunction: d.malfunction && d.malfunction.found ? d.malfunction : null }, ct = (c && c.tanks) || {};
    Object.keys(d.tanks || {}).forEach(function (id) {
      var t = d.tanks[id], k = ct[id] || {}, items = OWI.TANK_ITEMS[t.kind] || [];
      var checks = items.map(function (it) { var a = (t.checks || {})[it[0]]; return { l: it[1], a: a || '', bad: a === 'no' && it[2] !== 'i' }; });
      var badl = checks.filter(function (x) { return x.bad; }).map(function (x) { return x.l; });
      var bad = badl.length > 0 || !!k.pump_now || k.eff_ok === false;
      out.tanks.push({ id: id, kind: t.kind, name: t.name || (t.kind === 'pump' ? 'Pump tank' : 'Septic tank'), t: t, k: k, checks: checks, bad: bad, badl: badl });
    });
    Object.keys(d.cards || {}).forEach(function (id) {
      var cd = d.cards[id], rows = (cd.rows || []).map(function (r) { return { l: r.l, a: r.a, bad: r.a === 'no' }; });
      out.cards.push({ id: id, title: cd.title, rows: rows, bad: rows.some(function (r) { return r.bad; }), badl: rows.filter(function (r) { return r.bad; }).map(function (r) { return r.l; }) });
    });
    return out;
  };
  // plain-language line for one extra tank or card: [label, tone, text]
  OWI.plainExtra = function (x) {
    var W = function (k, i) { return OWI.WORDS.filter(function (q) { return q.k === k; })[0].o[i][2]; };
    if (x.kind === 'septic') {
      if (x.k.pump_now) return ['Fix now', 'b', W('solids', 2)];
      if (x.bad) return ['Fix soon', 'w', 'Needs attention: ' + x.badl.join('; ') + '.'];
      return ['Good', 'g', 'Lids, risers and filter were checked and are sound.' + (x.k.sludge_pct != null ? ' Solids are ' + Math.round(x.k.sludge_pct) + '% of the tank, below the one-third pumping point.' : '')];
    }
    if (x.kind === 'pump') {
      if (x.k.eff_ok === false) return ['Fix soon', 'w', W('flow', x.k.eff > 100 ? 1 : 2)];
      if (x.bad) return ['Fix soon', 'w', 'Needs attention: ' + x.badl.join('; ') + '.'];
      return ['Good', 'g', 'The floats, alarm and pump were tested and work.' + (x.k.pdr != null ? ' The pump moves ' + x.k.pdr + ' gallons per minute.' : '')];
    }
    return x.bad ? ['Fix soon', 'w', 'Needs attention: ' + x.badl.join('; ') + '.'] : ['Good', 'g', 'Everything checked here was fine.'];
  };

  // cap and clean what comes in so a bad request cannot store junk
  OWI.sanitize = function (b, sys) {
    var S = function (v, m) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, m); };
    var N = function (v) { var x = n(v); return x !== null && x >= 0 && x < 1e6 ? x : null; };
    var s = b || {}, d = { checks: {}, words: {}, laterals: [] };
    d.inspect_type = OWI.TYPES.indexOf(s.inspect_type) >= 0 ? s.inspect_type : OWI.TYPES[0];
    ['septic_gal', 'liquid_depth', 'pump_gal', 'gpi'].forEach(function (k) { d[k] = N(s[k]); });
    d.tank_shape = s.tank_shape === 'round' ? 'round' : 'rect'; d.tank_a = N(s.tank_a); d.tank_b = N(s.tank_b);
    OWI.SECTIONS.forEach(function (sec) { d.checks[sec.k] = {}; sec.items.forEach(function (it) { var a = s.checks && s.checks[sec.k] && s.checks[sec.k][it[0]]; if (YN.indexOf(a) >= 0) d.checks[sec.k][it[0]] = a; }); });
    ['septic', 'pump'].forEach(function (k) { var x = s[k] || {}; d[k] = { scum: N(x.scum), sludge: N(x.sludge), pumped: /^\d{4}-\d{2}-\d{2}$/.test(x.pumped || '') ? x.pumped : '', pump_needed: x.pump_needed === 'Yes' ? 'Yes' : 'No' }; });
    var fl = s.floats || {}; d.floats = { alarm: N(fl.alarm), on: N(fl.on), off: N(fl.off), timed: N(fl.timed) }; d.amps = N(s.amps);
    (Array.isArray(s.laterals) ? s.laterals : []).slice(0, 12).forEach(function (l, i) { l = l || {}; d.laterals.push({ n: i + 1, length: N(l.length), design: N(l.design), turnup: N(l.turnup), last: N(l.last), baseline: N(l.baseline), left: N(l.left), adjusted: N(l.adjusted) }); });
    var f = s.flow || {}; d.flow = { dose: N(f.dose), drawdown: N(f.drawdown), off: N(f.off), on: N(f.on), gpi: N(f.gpi), min: N(f.min), design_pdr: N(f.design_pdr), design_head: N(f.design_head) };
    var m = s.meters || {}; d.meters = { et: N(m.et), events: N(m.events), flow: N(m.flow), flow7: N(m.flow7), flow30: N(m.flow30) };
    OWI.WORDS.forEach(function (w) { var x = s.words && s.words[w.k]; var i = x && Number.isInteger(x.i) && x.i >= 0 && x.i < w.o.length ? x.i : w.d; d.words[w.k] = { i: i, t: S(x && x.t, 600) }; });
    var t = s.todo || {}; d.todo = { jobs: (Array.isArray(t.jobs) ? t.jobs : []).slice(0, 6).filter(function (j) { return OWI.JOBS.indexOf(j) >= 0; }), ticks: (Array.isArray(t.ticks) ? t.ticks : []).filter(function (i) { return Number.isInteger(i) && i >= 0 && i < OWI.TICKS.length; }), extra: S(t.extra, 400) };
    d.recs = S(s.recs, 1500); d.comments = S(s.comments, 1500);
    d.status = OWI.STATUS.indexOf(s.status) >= 0 ? s.status : 'Incomplete inspection';
    d.next_due = /^\d{4}-\d{2}-\d{2}$/.test(s.next_due || '') ? s.next_due : '';
    // extra tanks and check cards come from the saved system, so only known ids are kept
    sys = sys || {}; var D = function (v) { return isoDay.test(v || '') ? v : ''; };
    d.tanks = {}; (sys.tanks || []).forEach(function (t) {
      var x = s.tanks && s.tanks[t.id]; if (!x) return; var k = t.kind === 'pump' ? 'pump' : 'septic', o = { kind: k, name: S(t.name, 60), checks: {} };
      OWI.TANK_ITEMS[k].forEach(function (it) { var a = x.checks && x.checks[it[0]]; if (YN.indexOf(a) >= 0) o.checks[it[0]] = a; });
      o.scum = N(x.scum); o.sludge = N(x.sludge); o.pumped = D(x.pumped); o.pump_needed = x.pump_needed === 'Yes' ? 'Yes' : 'No';
      o.liquid_depth = N(x.liquid_depth); o.gal = N(x.gal); o.shape = x.shape === 'round' ? 'round' : 'rect'; o.a = N(x.a); o.b = N(x.b); o.gpi = N(x.gpi); o.design_pdr = N(x.design_pdr);
      var fl = x.floats || {}; o.floats = { alarm: N(fl.alarm), on: N(fl.on), off: N(fl.off), timed: N(fl.timed) }; o.amps = k === 'pump' ? N(x.amps) : null; var fw = x.flow || {}; o.flow = { off: N(fw.off), on: N(fw.on), min: N(fw.min) };
      d.tanks[t.id] = o;
    });
    d.cards = {}; (sys.cards || []).forEach(function (cd) {
      var x = s.cards && s.cards[cd.id]; if (!x) return;
      d.cards[cd.id] = { title: S(cd.title, 60), rows: (Array.isArray(x.rows) ? x.rows : []).slice(0, 30).map(function (r) { r = r || {}; return { l: S(r.l, 120), a: YN.indexOf(r.a) >= 0 ? r.a : '' }; }).filter(function (r) { return r.l; }) };
    });
    var mf = s.malfunction || {}; d.malfunction = { found: mf.found === true, notified: S(mf.notified, 200) };
    return d;
  };
  g.OWI = OWI;
})(typeof globalThis !== 'undefined' ? globalThis : this);
