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
    { k: 'pump_min', t: 'Pump run time', u: 'minutes per cycle', col: '--c1' },
    { k: 'sludge_in', t: 'Sludge depth', u: 'inches in tank', col: '--c2' },
    { k: 'water_gpd', t: 'Water use', u: 'gallons per day', col: '--c3' }
  ];
  function chart(def, pts) {
    var W = 300, H = 150, L = 38, R = 10, T = 12, B = 26;
    var vs = pts.map(function (p) { return p.v; }), mx = Math.max.apply(null, vs), mn = Math.min(0, Math.min.apply(null, vs));
    if (mx === mn) mx = mn + 1; mx = mx + (mx - mn) * 0.12;
    var n = pts.length, x = function (i) { return n === 1 ? (L + W - R) / 2 : L + i * (W - L - R) / (n - 1); }, y = function (v) { return T + (1 - (v - mn) / (mx - mn)) * (H - T - B); };
    var g = ''; [mn, (mn + mx) / 2, mx].forEach(function (t) { g += '<line class="axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t) + '" y2="' + y(t) + '"/><text class="lab" x="' + (L - 5) + '" y="' + (y(t) + 4) + '" text-anchor="end">' + (Math.round(t * 10) / 10) + '</text>'; });
    var step = Math.ceil(n / 5), lx = pts.map(function (p, i) { return (i % step === 0 || i === n - 1) ? '<text class="lab" x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="' + (n > 1 && i === n - 1 ? 'end' : 'middle') + '">' + OW.esc(new Date(p.d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })) + '</text>' : ''; }).join('');
    var line = n > 1 ? '<polyline points="' + pts.map(function (p, i) { return x(i) + ',' + y(p.v); }).join(' ') + '" fill="none" stroke="var(' + def.col + ')" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' : '';
    var dots = pts.map(function (p, i) { return '<circle cx="' + x(i) + '" cy="' + y(p.v) + '" r="' + (i === n - 1 ? 4.5 : 3) + '" fill="var(' + def.col + ')"><title>' + OW.esc(OW.date(p.d)) + ': ' + p.v + '</title></circle>'; }).join('');
    var last = pts[n - 1];
    return '<div class="ch"><h3>' + def.t + '</h3><small>' + def.u + '</small><svg class="c" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + def.t + ', latest ' + last.v + ' ' + def.u + '">' + g + line + dots + lx + '<text class="lab" x="' + x(n - 1) + '" y="' + (y(last.v) - 9) + '" text-anchor="' + (n > 1 ? 'end' : 'middle') + '" style="font-weight:600">' + last.v + '</text></svg></div>';
  }
  OW.charts = function (reports) {
    var out = OW.READINGS.map(function (def) {
      var pts = reports.filter(function (r) { return r.readings && r.readings[def.k] != null; }).map(function (r) { return { d: r.visit_date, v: Number(r.readings[def.k]) }; }).sort(function (a, b) { return a.d < b.d ? -1 : 1; });
      return pts.length ? chart(def, pts) : '';
    }).join('');
    return out || '<p class="mute">Graphs appear after the first visit report with readings.</p>';
  };

  // ---- PDFs (built in the browser with pdf-lib so the Worker stays light)
  function layout(PDFLib, title) {
    var doc, fonts = {}, page, y, M = 56, W = 612, H = 792, f, fb, fi;
    return PDFLib.PDFDocument.create().then(function (d) {
      doc = d; return Promise.all([doc.embedFont(PDFLib.StandardFonts.TimesRoman), doc.embedFont(PDFLib.StandardFonts.TimesRomanBold), doc.embedFont(PDFLib.StandardFonts.TimesRomanItalic)]);
    }).then(function (F) {
      f = F[0]; fb = F[1]; fi = F[2]; doc.setTitle(title); doc.setAuthor('Overwatch Septic Systems');
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
          lines.forEach(function (ln) { L.need(lead); page.drawText(ln, { x: M + ind + (o.center ? (maxw - font.widthOfTextAtSize(ln, size)) / 2 : 0), y: y - size, size: size, font: font, color: PDFLib.rgb(0.1, 0.1, 0.1) }); y -= lead; });
          y -= o.after == null ? 5 : o.after;
        },
        gap: function (n) { y -= n; },
        rule: function () { L.need(10); page.drawLine({ start: { x: M, y: y }, end: { x: W - M, y: y }, thickness: 0.6, color: PDFLib.rgb(0.7, 0.65, 0.55) }); y -= 10; },
        save: function () {
          var pages = doc.getPages();
          pages.forEach(function (p, i) { p.drawText('Overwatch Septic Systems  |  page ' + (i + 1) + ' of ' + pages.length, { x: M, y: 30, size: 8, font: f, color: PDFLib.rgb(0.45, 0.4, 0.33) }); });
          return doc.save();
        }
      };
      L.add(); return L;
    });
  }
  OW.contractPdf = function (c) {
    var t = c.text;
    return layout(window.PDFLib, t.title).then(function (L) {
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
      L.gap(8); L.text('Overwatch Septic Systems provides inspection and maintenance. Repairs and pumping are done by licensed contractors.', { size: 9, italic: true });
      return L.save();
    });
  };
  OW.download = function (bytes, name) { var u = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })); var a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); };
})();
