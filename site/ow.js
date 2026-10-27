/* Shared helpers for the signing page, customer portal and admin portal. Exposed as window.OW. */
(function () {
  var OW = window.OW = {};
  OW.$ = function (id) { return document.getElementById(id); };
  OW.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  OW.date = function (iso) { if (!iso) return ''; var d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
  OW.api = function (url, body, opts) {
    opts = opts || {};
    var init = { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: {} };
    if (body !== undefined) { if (opts.raw) { init.body = body; init.headers['content-type'] = opts.type; } else { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; } }
    return fetch(url, init).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j.status = r.status; if (!r.ok && !j.error) j.error = 'Something went wrong. Please try again.'; return j; }); }).catch(function () { return { ok: false, error: 'Could not reach the server. Check your connection and try again.' }; });
  };
  var tt; OW.toast = function (m) { var t = document.getElementById('toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); } t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(function () { t.hidden = true; }, 3500); };
  OW.money = function (c) { return '$' + (c / 100).toFixed(2); };
  OW.invFor = function (i) { return i.kind === 'origination' ? 'Origination fee' : 'Visit ' + OW.date(i.visit_date); };
  OW.STATUS = { terminated: ['Cancelled for nonpayment', 'bad'], sent: ['Waiting on customer', 'warn'], owner_signed: ['Needs your signature', 'warn'], complete: ['Signed', 'good'], void: ['Cancelled', 'mute'], none: ['Not sent', 'bad'] };
  OW.pill = function (s, forCustomer) { var x = OW.STATUS[s] || OW.STATUS.none; var label = x[0]; if (forCustomer) label = { sent: 'Needs your signature', owner_signed: 'Signed by you, waiting on us', complete: 'Signed', terminated: 'Cancelled for nonpayment', void: 'Cancelled' }[s] || label; return '<span class="pill ' + x[1] + '">' + OW.esc(label) + '</span>'; };
  OW.LOGO = '<svg width="40" height="40" viewBox="0 0 100 100" fill="none" stroke="var(--brz)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="50" cy="50" r="47" fill="var(--slate)"/><g stroke="var(--onslate)"><path d="M30 23 50 11 70 23Z"/><path d="M38 23V34M62 23V34"/><path d="M38 34 31 62M62 34 69 62M36 54 64 40M64 54 36 40" stroke-width="2.2"/></g><path d="M40 29Q50 21 60 29Q50 37 40 29Z" stroke-width="2"/><circle cx="50" cy="29" r="2.4" fill="var(--brz)" stroke="none"/><rect x="26" y="62" width="48" height="12" rx="6"/><path d="M42 62v-3M58 62v-3M16 68h10M74 68h10M30 81h40M36 87h28M41 93h18" stroke-width="2.2"/></svg>';
  OW.CONTACT = { phone: '919-525-1455', email: 'Joshua@overwatchseptic.com', site: 'overwatchseptic.com' };
  OW.brand = function (href) { return '<a class="brand" href="' + (href || '/') + '">' + OW.LOGO + '<span><b>OVERWATCH</b><i>SEPTIC SYSTEMS</i></span></a>'; };

  // ---- contract text as HTML
  OW.contractHtml = function (t) {
    var h = '<h1>' + OW.esc(t.title) + '</h1>';
    t.intro.forEach(function (p) { h += '<p>' + OW.esc(p) + '</p>'; });
    t.sections.forEach(function (s) { h += '<h2>' + OW.esc(s.h) + '</h2>'; s.p.forEach(function (p) { h += '<p>' + OW.esc(p) + '</p>'; }); });
    return h + '<p>' + OW.esc(t.closing) + '</p>';
  };

  // ---- charts: one small line chart per reading, oldest to newest
  OW.READINGS = [
    { k: 'pdr_eff', t: 'Pump flow compared with design', u: 'percent of design. Within 10% of 100 is normal', col: '--c1', band: [90, 110], w: 'Why it matters: the pump rate compared with what the system was designed for. Staying within 10% of 100% means the pump and pipes work as intended. Outside that range needs attention.' },
    { k: 'pdr', t: 'Pump delivery rate (PDR)', u: 'gallons per minute', col: '--c2', w: 'Why it matters: how fast the pump moves water to the drain field. A slow climb or drop over several visits shows wear, a clog or a leak before the system fails.' },
    { k: 'sludge_pct', t: 'Sludge, share of tank depth', u: 'percent of the liquid depth. Pump at 33% or more', col: '--c3', th: 100 / 3, w: 'Why it matters: solids settle in the tank over time. At one third of the tank depth or more they can carry over into the drain field and ruin it. At 33% the line turns red and it is time to pump.' },
    { k: 'events_day', t: 'Dose events per day', u: 'times the pump turns on per day', col: '--c2', ds: 'events_design', w: 'Why it matters: how many times a day the pump turns on, compared with the design (design flow divided by dose volume). Much higher than design means more water is entering than the system was built for, such as a leak. Much lower can mean a stuck float or little use.' },
    { k: 'et_day', t: 'Elapsed time (ET), hours per day', u: 'hours the pump ran per day', col: '--c1', w: 'Why it matters: how many hours a day the pump runs. A sudden rise can mean a leaking toilet or a failing float. A steady line means steady water use.' },
    { k: 'lat1_head', t: 'Lateral 1 head', u: 'feet of pressure at the end of the pipe', col: '--c3', w: 'Why it matters: the water pressure at the end of a drain field pipe. Even pressure means the pipes spread effluent evenly. A drop can mean a clog, and a rise can mean a blocked or crushed pipe.' },
    { k: 'pump_min', t: 'Pump run time', u: 'minutes per cycle', col: '--c1' },
    { k: 'sludge_in', t: 'Sludge depth', u: 'inches in tank', col: '--c2' },
    { k: 'water_gpd', t: 'Water use', u: 'gallons per day', col: '--c3' }
  ];
  function chart(def, pts, extra) {
    var W = 300, H = 150, L = 38, R = 10, T = 12, B = 26, ex = extra || [];
    var vs = pts.map(function (p) { return p.v; }).concat(ex.map(function (e) { return e.v; })), mx = Math.max.apply(null, vs), mn = Math.min(0, Math.min.apply(null, vs));
    if (mx === mn) mx = mn + 1; mx = mx + (mx - mn) * 0.12;
    var n = pts.length, x = function (i) { return n === 1 ? (L + W - R) / 2 : L + i * (W - L - R) / (n - 1); }, y = function (v) { return T + (1 - (v - mn) / (mx - mn)) * (H - T - B); };
    var g = ''; [mn, (mn + mx) / 2, mx].forEach(function (t) { g += '<line class="axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t) + '" y2="' + y(t) + '"/><text class="lab" x="' + (L - 5) + '" y="' + (y(t) + 4) + '" text-anchor="end">' + (Math.round(t * 10) / 10) + '</text>'; });
    ex.forEach(function (e) { g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(e.v) + '" y2="' + y(e.v) + '" stroke="var(' + e.col + ')" stroke-width="1.5" stroke-dasharray="5 4"/><text class="lab" x="' + (e.right ? W - R : L + 4) + '" y="' + (y(e.v) + (e.below ? 13 : -4)) + '" text-anchor="' + (e.right ? 'end' : 'start') + '" style="fill:var(' + e.col + ');font-weight:600">' + OW.esc(e.label) + '</text>'; });
    var step = Math.ceil(n / 5), lx = pts.map(function (p, i) { return (i % step === 0 || i === n - 1) ? '<text class="lab" x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="' + (n > 1 && i === n - 1 ? 'end' : 'middle') + '">' + OW.esc(new Date(p.d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })) + '</text>' : ''; }).join('');
    var line = n > 1 ? '<polyline points="' + pts.map(function (p, i) { return x(i) + ',' + y(p.v); }).join(' ') + '" fill="none" stroke="var(' + def.col + ')" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' : '';
    var dots = pts.map(function (p, i) { return '<circle cx="' + x(i) + '" cy="' + y(p.v) + '" r="' + (i === n - 1 ? 4.5 : 3) + '" fill="var(' + def.col + ')"><title>' + OW.esc(OW.date(p.d)) + ': ' + p.v + '</title></circle>'; }).join('');
    var last = pts[n - 1];
    return '<div class="ch"><h3>' + def.t + '</h3><small>' + def.u + '</small><svg class="c" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + def.t + ', latest ' + last.v + ' ' + def.u + '">' + g + line + dots + lx + '<text class="lab" x="' + x(n - 1) + '" y="' + (y(last.v) - 9) + '" text-anchor="' + (n > 1 ? 'end' : 'middle') + '" style="font-weight:600">' + last.v + '</text></svg>' + (def.w ? '<p class="why">' + OW.esc(def.w) + '</p>' : '') + '</div>';
  }
  OW.charts = function (reports) {
    var out = OW.READINGS.map(function (def) {
      var rs = reports.filter(function (r) { return r.readings && r.readings[def.k] != null; }).sort(function (a, b) { return a.visit_date < b.visit_date ? -1 : 1; });
      var pts = rs.map(function (r) { return { d: r.visit_date, v: Number(r.readings[def.k]) }; });
      if (!pts.length) return '';
      var ex = [];
      if (def.th) ex.push({ v: def.th, col: '--bad', label: 'Pump at 33%', right: true });
      if (def.band) { ex.push({ v: def.band[1], col: '--good', label: '110%', right: true }); ex.push({ v: def.band[0], col: '--good', label: '90%', right: true, below: true }); }
      if (def.ds) { var dv = rs[rs.length - 1].readings[def.ds]; if (dv != null) ex.push({ v: Number(dv), col: '--good', label: 'Design ' + dv, below: true }); }
      return chart(def, pts, ex);
    }).join('');
    return out || '<p class="mute">Graphs appear after the first visit report with readings.</p>';
  };

  // ---- PDFs (built in the browser with pdf-lib so the Worker stays light)
  function layout(PDFLib, title) {
    var doc, fonts = {}, page, y, M = 56, W = 612, H = 792, f, fb, fi;
    return PDFLib.PDFDocument.create().then(function (d) {
      doc = d; return Promise.all([doc.embedFont(PDFLib.StandardFonts.TimesRoman), doc.embedFont(PDFLib.StandardFonts.TimesRomanBold), doc.embedFont(PDFLib.StandardFonts.TimesRomanItalic)]);
    }).then(function (F) {
      f = F[0]; fb = F[1]; fi = F[2]; doc.setTitle(title); doc.setAuthor('Overwatch Septic, LLC');
      var L = {
        add: function () { page = doc.addPage([W, H]); y = H - M; },
        need: function (h) { if (y - h < M) L.add(); },
        // Standard fonts only cover WinAnsi; replace anything outside it so a stray character cannot break the PDF.
        safe: function (s) { return String(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '?'); },
        text: function (s, o) {
          o = o || {}; var font = o.bold ? fb : o.italic ? fi : f, size = o.size || 11, lead = size * 1.38, ind = o.indent || 0;
          var words = L.safe(s).split(/\s+/), line = '', lines = [], maxw = W - 2 * M - ind;
          words.forEach(function (w) { var t = line ? line + ' ' + w : w; if (font.widthOfTextAtSize(t, size) > maxw && line) { lines.push(line); line = w; } else line = t; });
          if (line) lines.push(line);
          lines.forEach(function (ln) { L.need(lead); var lx = M + ind + (o.center ? (maxw - font.widthOfTextAtSize(ln, size)) / 2 : 0); page.drawText(ln, { x: lx, y: y - size, size: size, font: font, color: PDFLib.rgb(0.1, 0.1, 0.1) }); if (o.underline) page.drawLine({ start: { x: lx, y: y - size - 1.8 }, end: { x: lx + font.widthOfTextAtSize(ln, size), y: y - size - 1.8 }, thickness: 0.9, color: PDFLib.rgb(0.1, 0.1, 0.1) }); y -= lead; });
          y -= o.after == null ? 5 : o.after;
        },
        gap: function (n) { y -= n; },
        image: function (bytes) { return doc.embedJpg(bytes).then(function (img) { var sc = Math.min(250 / img.width, 180 / img.height, 1), w = img.width * sc, h = img.height * sc; L.need(h + 8); page.drawImage(img, { x: M, y: y - h, width: w, height: h }); y -= h + 8; }); },
        letterhead: function (lines) {
          var h = 48, tx = M + (L.logo ? h + 10 : 0);
          if (L.logo) page.drawImage(L.logo, { x: M, y: y - h, width: h, height: h });
          page.drawText('OVERWATCH', { x: tx, y: y - 22, size: 18, font: fb, color: PDFLib.rgb(0.12, 0.1, 0.08) });
          page.drawText('SEPTIC, LLC', { x: tx, y: y - 36, size: 9, font: fb, color: PDFLib.rgb(0.66, 0.45, 0.12) });
          (lines || []).forEach(function (t, i) { var tt = L.safe(t), w = f.widthOfTextAtSize(tt, 9); page.drawText(tt, { x: W - M - w, y: y - 11 - i * 11, size: 9, font: f, color: PDFLib.rgb(0.25, 0.22, 0.18) }); });
          y -= h + 8; L.rule(); y -= 2;
        },
        rule: function () { L.need(10); page.drawLine({ start: { x: M, y: y }, end: { x: W - M, y: y }, thickness: 0.6, color: PDFLib.rgb(0.7, 0.65, 0.55) }); y -= 10; },
        save: function () {
          var pages = doc.getPages();
          pages.forEach(function (p, i) { p.drawText('Overwatch Septic, LLC  |  page ' + (i + 1) + ' of ' + pages.length, { x: M, y: 30, size: 8, font: f, color: PDFLib.rgb(0.45, 0.4, 0.33) }); });
          return doc.save();
        }
      };
      L.add();
      return fetch('/logo-pdf.png', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.arrayBuffer() : null; }).then(function (b) { return b ? doc.embedPng(b) : null; }).catch(function () { return null; }).then(function (img) { L.logo = img; return L; });
    });
  }
  OW.contractPdf = function (c) {
    var t = c.text;
    return layout(window.PDFLib, t.title).then(function (L) {
      L.letterhead([OW.CONTACT.phone, OW.CONTACT.email, OW.CONTACT.site]);
      L.text(t.title, { bold: true, size: 15, center: true, after: 10 });
      t.intro.forEach(function (p) { L.text(p, {}); });
      t.sections.forEach(function (s) { L.gap(4); L.text(s.h, { bold: true }); s.p.forEach(function (p) { L.text(p, { indent: /^([a-z]\)|\d\))/.test(p) ? 14 : 0 }); }); });
      L.gap(6); L.text(t.closing, {}); L.gap(8);
      function sig(role, who, name, when) {
        L.need(90); L.text(role, { bold: true, after: 2 });
        L.text(name ? name : '(not yet signed)', { italic: true, size: 16, after: 1 });
        L.rule();
        L.text(who + (when ? '   Signed electronically on ' + OW.date(when) : ''), { size: 9.5, after: 12 });
      }
      sig('OWNER', c.owner_label, c.owner.name, c.owner.signed_at);
      sig('CONTRACTOR', c.contractor_label, c.contractor.signed_at ? c.contractor.name : '', c.contractor.signed_at);
      L.text('Each signature above was entered by the named person typing their name in this agreement\'s secure signing page.', { size: 9, italic: true });
      return L.save();
    });
  };
  OW.reportPdf = function (r, cust) {
    return layout(window.PDFLib, 'Septic visit report').then(function (L) {
      L.letterhead([OW.CONTACT.phone, OW.CONTACT.email, OW.CONTACT.site]);
      L.text('SEPTIC VISIT REPORT', { bold: true, size: 15, center: true, after: 10 });
      L.text('Customer: ' + cust.name, {}); L.text('Property: ' + cust.address, {}); if (cust.sys_type) L.text('System: Type ' + cust.sys_type, {});
      L.text('Visit date: ' + OW.date(r.visit_date), { after: 8 }); L.rule();
      var any = false; L.text('Readings', { bold: true });
      OW.READINGS.forEach(function (d) { if (r.readings && r.readings[d.k] != null) { any = true; L.text(d.t + ': ' + r.readings[d.k] + ' ' + d.u, { indent: 10, after: 2 }); } });
      if (!any) L.text('None recorded.', { indent: 10 });
      L.gap(6); L.text('Checks', { bold: true });
      var lab = { pass: 'Pass', repair: 'Needs repair (by a licensed contractor)', na: 'Not applicable' };
      (r.checks || []).forEach(function (c) { L.text(c.label + ': ' + lab[c.status], { indent: 10, after: 2 }); });
      if (!(r.checks || []).length) L.text('None recorded.', { indent: 10 });
      if (r.notes) { L.gap(6); L.text('Notes', { bold: true }); L.text(r.notes, { indent: 10 }); }
      L.gap(8); L.text('Overwatch Septic, LLC provides inspection and maintenance. Repairs and pumping are done by licensed contractors.', { size: 9, italic: true });
      return L.save();
    });
  };

  // ---- inspection reports: the homeowner copy and the county copy
  function v(x, u) { return x === null || x === undefined || x === '' ? '-' : x + (u ? ' ' + u : ''); }
  function permitLines(d) {
    var p = (d.sysinfo && d.sysinfo.permit) || {}, pi = OWI.permitInfo(p, '0000-00-00'), r = [];
    var nos = [p.ca_no && 'Construction auth. ' + p.ca_no, p.ip_no && 'Improvement permit ' + p.ip_no, p.other_no].filter(Boolean).join('; ');
    if (p.parcel) r.push(['Parcel', p.parcel]); if (nos) r.push(['Permit numbers', nos]);
    if (p.issued) r.push(['Operation permit', 'Issued ' + OW.date(p.issued) + (pi.expires ? ', valid until ' + OW.date(pi.expires) : '')]);
    if (p.bedrooms || p.occupants) r.push(['Design capacity', [p.bedrooms && p.bedrooms + ' bedrooms', p.occupants && 'up to ' + p.occupants + ' occupants'].filter(Boolean).join(', ')]);
    var fr = OWI.FREQ.filter(function (f) { return f[0] === p.freq; })[0]; if (fr && fr[0]) r.push(['Inspection frequency', fr[1]]);
    var ad = d.sysinfo && d.sysinfo.addresses; if (ad && ad.length > 1) r.push(['System addresses', ad.join('; ')]);
    return r;
  }
  OW.inspHomePdf = function (rep, cust, op, photos) {
    var d = rep.insp.data, c = rep.insp.calc, ov = OWI.overall(d.status);
    return layout(window.PDFLib, 'Your septic system check-up').then(function (L) {
      L.letterhead([op.name + ', certified operator', op.cert, OW.CONTACT.phone, OW.CONTACT.email, OW.CONTACT.site]);
      L.text('YOUR SEPTIC SYSTEM CHECK-UP', { bold: true, size: 16, center: true, after: 6 });
      L.text(cust.name + ', ' + cust.address + '. Checked ' + OW.date(rep.visit_date) + '.', { center: true, after: 8 });
      var acts = OWI.actions(d, c);
      L.text('WHAT YOU NEED TO DO', { bold: true, size: 13, after: 3 });
      if (acts.length) {
        acts.forEach(function (a, i) { L.text((i + 1) + '. ' + a, { indent: 10, after: 3, underline: true }); });
        if (d.recs) L.text(d.recs, { indent: 10 });
        L.text('Overwatch does not do repairs or pumping. We can tell you what to ask the contractor for, and we will confirm the fix at your next visit.', { italic: true, size: 9.5 });
      } else {
        L.text('Nothing needed right now. See you at your next check-up.', { indent: 10, underline: true, after: 3 });
        if (d.recs) L.text(d.recs, { indent: 10 });
      }
      L.gap(4); L.rule(); L.text(ov[1], { bold: true, size: 13, after: 2 }); L.text(ov[2], { after: 8 });
      L.gap(4); L.text('What we checked', { bold: true, size: 13 });
      var nmz = (d.sysinfo && d.sysinfo.names) || {}, X = OWI.extras(d, c);
      [['septic', nmz.septic || 'Septic tank'], ['pumptank', nmz.pump || 'Pump tank, floats, alarm'], ['panel', 'Control panel'], ['field', 'Drain field']].forEach(function (p) {
        var r = OWI.wordRow(d, p[0]); if (!r) return; L.text(p[1] + ': ' + r.label, { bold: true, indent: 10, after: 1 }); L.text(r.text, { indent: 20, after: 6 });
      });
      X.tanks.concat(X.cards).forEach(function (x) { var q = OWI.plainExtra(x); L.text((x.name || x.title) + ': ' + q[0], { bold: true, indent: 10, after: 1 }); L.text(q[2], { indent: 20, after: 6 }); });
      L.text('Your numbers, in plain terms', { bold: true, size: 13 });
      var f = OWI.wordRow(d, 'flow'), s = OWI.wordRow(d, 'solids'), t = OWI.wordRow(d, 'runtime');
      if (f) { L.text('Pump flow: ' + (c.pdr !== null ? c.pdr + ' gallons per minute' + (d.flow.design_pdr ? ' (designed for ' + d.flow.design_pdr + ')' : '') : '-'), { bold: true, indent: 10, after: 1 }); L.text(f.text, { indent: 20, after: 6 }); }
      if (s) { L.text('Solids in the septic tank: ' + (c.sludge_pct !== null ? Math.round(c.sludge_pct) + '% of the tank depth (' + v(d.septic.sludge) + ' in of ' + v(d.liquid_depth) + ' in)' : '-'), { bold: true, indent: 10, after: 1 }); L.text(s.text, { indent: 20, after: 6 }); }
      if (t) { L.text('How often the pump runs: ' + (c.events_day !== null ? c.events_day + ' times a day' + (c.events_design !== null ? ' (designed for ' + c.events_design + ')' : '') : '-'), { bold: true, indent: 10, after: 1 }); L.text(t.text, { indent: 20, after: 6 }); }
      X.tanks.forEach(function (x) {
        if (x.kind === 'pump' && x.k.pdr != null) { L.text(x.name + ' flow: ' + x.k.pdr + ' gallons per minute' + (x.t.design_pdr ? ' (designed for ' + x.t.design_pdr + ')' : ''), { bold: true, indent: 10, after: 1 }); L.text(x.k.eff_ok === false ? OWI.plainExtra(x)[2] : 'About what it was designed to move.', { indent: 20, after: 6 }); }
        if (x.kind === 'septic' && x.k.sludge_pct != null) { L.text('Solids in ' + x.name + ': ' + Math.round(x.k.sludge_pct) + '% of the tank depth (' + v(x.t.sludge) + ' in of ' + v(x.t.liquid_depth) + ' in)', { bold: true, indent: 10, after: 1 }); L.text(x.k.pump_now ? OWI.plainExtra(x)[2] : 'Below one third of the tank, so no pumping is needed yet.', { indent: 20, after: 6 }); }
      });
      L.text('Next check-up due: ' + (d.next_due ? OW.date(d.next_due) : 'to be scheduled'), { bold: true });
      var chain = Promise.resolve();
      if (photos && photos.length) { chain = chain.then(function () { L.gap(4); L.text('Photos from the visit', { bold: true, size: 13 }); }); photos.forEach(function (b) { chain = chain.then(function () { return L.image(b); }); }); }
      return chain.then(function () { L.gap(6); L.text(op.name + ', certified operator, certificate ' + op.cert + '. A technical copy of this report is filed with the county. Overwatch Septic, LLC provides inspection and maintenance. Repairs and pumping are done by licensed contractors.', { size: 9, italic: true }); return L.save(); });
    });
  };
  OW.inspCountyPdf = function (rep, cust, op, sys) {
    var d = rep.insp.data, c = rep.insp.calc, yn = { yes: 'Yes', no: 'No', na: 'N/A' };
    return layout(window.PDFLib, 'Certified operator maintenance/monitoring report').then(function (L) {
      L.letterhead([op.name + ', certified operator', op.cert, OW.CONTACT.phone, OW.CONTACT.email, OW.CONTACT.site]);
      L.text('CERTIFIED OPERATOR MAINTENANCE/MONITORING REPORT', { bold: true, size: 13, center: true, after: 8 });
      [['Owner', cust.name], ['Permit #', cust.permit], ['Location', cust.address + (cust.county ? '. ' + cust.county + ' County' : '')], ['System', ((sys && sys.sys_desc) || (cust.sys_type ? 'Type ' + cust.sys_type : '')) + (sys && sys.design_flow ? '. Design flow ' + sys.design_flow + ' gpd' : '')], ['Date of inspection', OW.date(rep.visit_date)], ['Last inspection', c.last ? OW.date(c.last) + ' (' + c.days + ' days earlier)' : '-'], ['Owner phone', cust.phone], ['Type of inspection', d.inspect_type], ['Operator (ORC)', op.name + ', ' + op.cert + ', Overwatch Septic, LLC, ' + OW.CONTACT.phone]].concat(permitLines(d)).forEach(function (p) { L.text(p[0] + ': ' + (p[1] || '-'), { size: 10, after: 1 }); });
      var X = OWI.extras(d, c), nmz = (d.sysinfo && d.sysinfo.names) || {}, zw = (d.sysinfo && d.sysinfo.zone_word) || 'Lateral';
      L.gap(4); L.rule();
      OWI.SECTIONS.forEach(function (sec) {
        L.text(sec.k === 'septic' ? (nmz.septic || sec.t) : sec.k === 'pump' ? (nmz.pump || sec.t) : sec.t, { bold: true, after: 2 });
        sec.items.forEach(function (it) { var a = (d.checks[sec.k] || {})[it[0]]; L.text(it[1] + ': ' + (yn[a] || '-'), { size: 10, indent: 10, after: 0, bold: a === 'no' && it[2] !== 'i' }); });
        if (sec.k === 'septic' || sec.k === 'pump') { var x = d[sec.k]; L.text('Tank ' + v(sec.k === 'septic' ? d.septic_gal : d.pump_gal, 'gal') + (sec.k === 'septic' ? ', liquid depth ' + v(d.liquid_depth, 'in') : ', ' + v(d.gpi, 'gal/in')) + '. Scum ' + v(x.scum, 'in') + ', sludge ' + v(x.sludge, 'in') + (sec.k === 'septic' && c.sludge_pct !== null ? ' (' + c.sludge_pct + '% of liquid depth)' : '') + '. Last pumpout ' + (x.pumped ? OW.date(x.pumped) : '-') + '. Pumping needed: ' + x.pump_needed + '.' + (sec.k === 'septic' && d.sysinfo && d.sysinfo.units && d.sysinfo.units.septic ? ' Effluent filter: ' + d.sysinfo.units.septic + '.' : ''), { size: 10, indent: 10 }); }
        if (sec.k === 'controls') L.text('Float settings (inches above tank bottom): alarm ' + v(d.floats.alarm) + ', pump on ' + v(d.floats.on) + ', pump off ' + v(d.floats.off) + (d.floats.timed != null ? ', timed float ' + v(d.floats.timed) : '') + '.' + (d.sysinfo && d.sysinfo.units && d.sysinfo.units.pump ? ' Pump: ' + d.sysinfo.units.pump + '.' : '') + (d.amps != null ? ' Pump running amps: ' + v(d.amps) + '.' : ''), { size: 10, indent: 10 });
        L.gap(3);
      });
      if ((d.laterals || []).length) { L.text(zw + ' readings', { bold: true, after: 2 }); d.laterals.forEach(function (l) { L.text(zw + ' ' + l.n + ': length ' + v(l.length) + ', design head ' + v(l.design) + ', turnup height ' + v(l.turnup) + ', last time ' + v(l.last) + ', baseline ' + v(l.baseline) + ', valves left at ' + v(l.left) + ', off design ' + (OWI.latPct(l) === null ? '-' : OWI.latPct(l) + '%') + ', adjusted to ' + v(l.adjusted), { size: 10, indent: 10, after: 1 }); }); L.gap(3); }
      L.text('Flow test and meters', { bold: true, after: 2 });
      [['Water level, pump off (start)', v(d.flow.off, 'in')], ['Water level, pump on (after run)', v(d.flow.on, 'in')], ['Depth pumped', v(c.depth, 'in')], ['Volume pumped (depth x ' + v(d.flow.gpi || d.gpi) + ' gal/in)', v(c.vol, 'gal')], ['Run time of test', v(d.flow.min, 'min')], ['Measured PDR (pump delivery rate)', v(c.pdr, 'gpm')], ['Design PDR', v(d.flow.design_pdr, 'gpm')], ['PDR efficiency', c.eff === null ? '-' : c.eff + '%' + (c.eff_ok ? '' : ' (outside 10% of design)')], ['Dose volume / drawdown', v(d.flow.dose, 'gal') + ' / ' + v(d.flow.drawdown, 'in')], ['ET (elapsed time) hours', v(d.meters.et) + (c.et_used !== null ? ' (used ' + c.et_used + ', ' + v(c.et_day) + ' per day)' : '')], ['Events', v(d.meters.events) + (c.ev_used !== null ? ' (used ' + c.ev_used + ', ' + v(c.events_day) + ' per day, design ' + v(c.events_design) + ')' : '')]].forEach(function (p) { L.text(p[0] + ': ' + p[1], { size: 10, indent: 10, after: 0 }); });
      X.tanks.forEach(function (x) {
        var t = x.t, k = x.k; L.gap(3); L.text(x.name, { bold: true, after: 2 });
        x.checks.forEach(function (q) { L.text(q.l + ': ' + (yn[q.a] || '-'), { size: 10, indent: 10, after: 0, bold: q.bad }); });
        if (x.kind === 'septic') L.text('Tank ' + v(t.gal, 'gal') + ', liquid depth ' + v(t.liquid_depth, 'in') + '. Scum ' + v(t.scum, 'in') + ', sludge ' + v(t.sludge, 'in') + (k.sludge_pct != null ? ' (' + k.sludge_pct + '% of liquid depth)' : '') + '. Last pumpout ' + (t.pumped ? OW.date(t.pumped) : '-') + '. Pumping needed: ' + t.pump_needed + '.' + (t.unit ? ' Effluent filter: ' + t.unit + '.' : ''), { size: 10, indent: 10 });
        else {
          L.text('Tank ' + v(t.gal, 'gal') + ', ' + v(k.gpi, 'gal/in') + '. Floats (in): alarm ' + v(t.floats.alarm) + ', on ' + v(t.floats.on) + ', off ' + v(t.floats.off) + (t.floats.timed != null ? ', timed ' + v(t.floats.timed) : '') + '.' + (t.unit ? ' Pump: ' + t.unit + '.' : '') + (t.amps != null ? ' Pump running amps: ' + v(t.amps) + '.' : ''), { size: 10, indent: 10, after: 1 });
          L.text('Water level off ' + v(t.flow.off, 'in') + ', on ' + v(t.flow.on, 'in') + '; depth pumped ' + v(k.depth, 'in') + '; volume ' + v(k.vol, 'gal') + '; run time ' + v(t.flow.min, 'min') + '; PDR ' + v(k.pdr, 'gpm') + ' (design ' + v(t.design_pdr, 'gpm') + '); efficiency ' + (k.eff == null ? '-' : k.eff + '%' + (k.eff_ok ? '' : ' (outside 10% of design)')) + '; dose ' + v(k.dose, 'gal') + ', drawdown ' + v(k.drawdown, 'in') + '.', { size: 10, indent: 10 });
        }
        Object.keys(k.formulas || {}).forEach(function (q) { L.text(k.formulas[q], { size: 9, indent: 10, after: 0 }); });
      });
      X.cards.forEach(function (x) { L.gap(3); L.text(x.title, { bold: true, after: 2 }); x.rows.forEach(function (q) { L.text(q.l + ': ' + (yn[q.a] || '-'), { size: 10, indent: 10, after: 0, bold: q.bad }); }); });
      var fm = c.formulas || {}, fl = [['Depth pumped', fm.depth], ['Volume pumped', fm.vol], ['Measured PDR', fm.pdr], ['PDR efficiency', fm.eff], ['Sludge, % of liquid depth', fm.sludge], ['Days since last inspection', fm.days], ['ET (elapsed time)', fm.et], ['Events', fm.events], ['Design events per day', fm.events_design], ['Dose volume', fm.dose], ['Gallons per inch', fm.gpi]].filter(function (x) { return x[1]; });
      if (fl.length) { L.gap(3); L.text('How the numbers were calculated', { bold: true, size: 10, after: 1 }); fl.forEach(function (x) { L.text(x[0] + ': ' + x[1], { size: 9, indent: 10, after: 0 }); }); }
      if (X.malfunction) { L.gap(4); L.text('Malfunction found at this visit. County notified: ' + (X.malfunction.notified || 'not yet recorded') + '.', { bold: true }); }
      L.gap(5); L.text('Status of system: ' + d.status + '.  Next inspection due: ' + (d.next_due ? OW.date(d.next_due) : '-'), { bold: true });
      if (d.recs) L.text('Recommendations for owner: ' + d.recs);
      L.gap(4); L.text('Certified operator: ' + op.name + ', ' + op.cert + ', ' + OW.date(rep.visit_date) + '. Repairs and pumping are performed by licensed contractors.', { size: 9, italic: true });
      return L.save();
    });
  };
  OW.download = function (bytes, name) { var u = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })); var a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); };
})();
