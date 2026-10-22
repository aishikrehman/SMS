/* ==========================================================================
   PRINT & DOCUMENT OUTPUT STUDIO  (RBAC module: print)
   One hub page with 16 official documents. Every generator returns an array
   of <div class="sheet"> HTML strings laid out in millimetres so that the
   on-screen preview and the printed page match (A4 / Letter / Legal,
   portrait or landscape). Generators are exposed as PrintStudio.gen.* so
   other modules can reuse them.
   ========================================================================== */

const PrintStudio = {
  CERT_PREFIX: { 'Transfer Certificate': 'TC', 'Testimonial': 'TST', 'Character Certificate': 'CC' },
  CASH_ACCTS: ['1000', '1010', '1020'],
  ATT: { P: ['উপস্থিত', '#059669'], A: ['অনুপস্থিত', '#dc2626'], L: ['বিলম্ব', '#d97706'], E: ['অনুমোদিত ছুটি', '#2563eb'] },
  /** Achievement levels for display (stored in English). */
  LEVEL_BN: { School: 'প্রতিষ্ঠান', Upazila: 'উপজেলা', District: 'জেলা', Division: 'বিভাগীয়', Divisional: 'বিভাগীয়', National: 'জাতীয়', International: 'আন্তর্জাতিক' },

  /* ======================================================================
     Shared layout helpers (millimetre based)
     ====================================================================== */
  css() {
    if (document.getElementById('ps-style')) return;
    const st = document.createElement('style'); st.id = 'ps-style';
    st.textContent = `
      .ms-table.ps-c{font-size:8pt}.ms-table.ps-c th,.ms-table.ps-c td{padding:.7mm 1.2mm}
      .ms-table.ps-xs{font-size:6.8pt}.ms-table.ps-xs th,.ms-table.ps-xs td{padding:.45mm .7mm}
      .ms-table .ps-n{max-width:58mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left}
      .ms-table .ps-r{text-align:right}.ms-table .ps-l{text-align:left}
      .ps-h2{font-size:10pt;font-weight:800;color:var(--brand-ink);margin:1mm 0 1.5mm;text-transform:uppercase;letter-spacing:.04em}
      .ps-box{border:.3mm solid #cbd5e1;border-radius:2mm;padding:2.5mm 3mm;box-sizing:border-box}`;
    document.head.appendChild(st);
  },
  opts(d, defOrient = 'portrait') { return { paper: ['A4', 'Letter', 'Legal'].includes(d.paper) ? d.paper : 'A4', orientation: (d.orientation || defOrient) === 'landscape' ? 'landscape' : 'portrait' }; },
  foot(i, n) {
    return `<div style="position:absolute;bottom:5mm;left:14mm;right:14mm;display:flex;justify-content:space-between;font-size:6.5pt;color:#94a3b8"><span>${esc(DB.s.school.nameBn || DB.s.school.name)} · Dhee SMS প্রিন্ট স্টুডিও · প্রস্তুতের তারিখ ${U.fmtDate(U.today())}</span><span>পৃষ্ঠা ${bnNum(i + 1)} / ${bnNum(n)}</span></div>`;
  },
  /** Photo or coloured initials, fully inline-styled (works outside .cr80). */
  ph(p, w, h) {
    const inner = p.photo ? `<img src="${p.photo}" style="width:100%;height:100%;object-fit:cover">` : `<span style="font-size:${Math.round(h * 1.1)}pt">${esc(U.initials(p.name))}</span>`;
    return `<div style="width:${w}mm;height:${h}mm;flex-shrink:0;border-radius:1.5mm;overflow:hidden;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;background:${p.photo ? '#e2e8f0' : U.color(p.name)}">${inner}</div>`;
  },
  /** Key/value grid. Values must already be escaped HTML. */
  kv(pairs, cols = 2, fs = 9) {
    return `<div style="display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:1mm 6mm;font-size:${fs}pt;margin-bottom:4mm">${pairs.map(([k, v]) => `<div style="display:flex;gap:2mm;border-bottom:.2mm dotted #cbd5e1;padding-bottom:.6mm;min-width:0"><span style="color:#64748b;flex-shrink:0;min-width:26mm">${k}</span><b style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v}</b></div>`).join('')}</div>`;
  },
  kvMm(pairs, cols = 2) { return Math.ceil(pairs.length / cols) * 5.6 + 4; },
  chips(items) {
    return `<div style="display:flex;gap:3mm;margin-bottom:4mm">${items.map(([l, v, c]) => `<div class="ps-box" style="flex:1;text-align:center;padding:1.8mm"><div style="font-size:6.5pt;color:#64748b;text-transform:uppercase;letter-spacing:.05em">${l}</div><div style="font-size:11.5pt;font-weight:800;color:${c || '#0f172a'}">${v}</div></div>`).join('')}</div>`;
  },
  signs(labels, mt = 14) {
    return `<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:${mt}mm;gap:6mm">${labels.map(l => l === 'Principal' ? `<div style="flex-shrink:0">${PrintStudio.sig('Principal')}</div>` : l === 'STAMP' ? `<div style="flex-shrink:0">${Print.stamp()}</div>` : `<div style="width:45mm;border-top:.25mm solid #0f172a;text-align:center;font-size:8pt;padding-top:1mm">${esc(Print.roleBn(l))}</div>`).join('')}</div>`;
  },
  /**
   * Flow layout engine: places blocks onto as many sheets as needed.
   * items: {html, mm} (atomic) or {table:{title, head, headMm, rows[], rowH, foot, footMm, cls}} (splits across pages, header repeated).
   */
  flow(opts, subtitle, items) {
    const [, H] = Print.dims(opts), cap = H - 28 - 31 - 5;
    const pages = []; let cur = [], used = 0;
    const push = () => { pages.push(cur); cur = []; used = 0; };
    items.filter(Boolean).forEach(it => {
      if (!it.table) { if (used + it.mm > cap && cur.length) push(); cur.push(it.html); used += it.mm; return; }
      const t = it.table, headMm = t.headMm ?? (t.rowH + 1.5), titleMm = t.title ? 7 : 0, footMm = t.foot ? (t.footMm ?? t.rowH + 1.5) : 0;
      const rows = t.rows.slice();
      if (!rows.length) {
        const html = `${t.title ? `<div class="ps-h2">${t.title}</div>` : ''}<div class="ps-box" style="font-size:9pt;color:#64748b;margin-bottom:4mm">${t.empty || 'কোনো তথ্য নেই।'}</div>`;
        if (used + titleMm + 14 > cap && cur.length) push();
        cur.push(html); used += titleMm + 14; return;
      }
      let first = true;
      while (rows.length) {
        const avail = cap - used - headMm - titleMm - 4;
        let n = Math.floor(avail / t.rowH);
        if (n < Math.min(3, rows.length) && cur.length) { push(); continue; }
        n = Math.max(1, n);
        const chunk = rows.splice(0, n);
        if (!rows.length && footMm && chunk.length * t.rowH + footMm > avail && chunk.length > 1) rows.unshift(chunk.pop());
        const last = !rows.length;
        cur.push(`${t.title ? `<div class="ps-h2">${t.title}${first ? '' : ' <span style="font-weight:400;text-transform:none">(চলমান)</span>'}</div>` : ''}<table class="ms-table ${t.cls || 'ps-c'}" style="margin-bottom:4mm">${t.head}<tbody>${chunk.join('')}</tbody>${last && t.foot ? t.foot : ''}</table>`);
        used += titleMm + headMm + chunk.length * t.rowH + (last ? footMm : 0) + 4;
        first = false;
        if (rows.length) push();
      }
    });
    if (cur.length || !pages.length) push();
    return pages.map((p, i) => `${Print.sheet(opts, 'padded')}${Print.header(subtitle)}${p.join('')}${this.foot(i, pages.length)}</div>`);
  },
  /** Bangla number words 0–99. */
  W99: 'শূন্য এক দুই তিন চার পাঁচ ছয় সাত আট নয় দশ এগারো বারো তেরো চৌদ্দ পনেরো ষোলো সতেরো আঠারো উনিশ বিশ একুশ বাইশ তেইশ চব্বিশ পঁচিশ ছাব্বিশ সাতাশ আটাশ ঊনত্রিশ ত্রিশ একত্রিশ বত্রিশ তেত্রিশ চৌত্রিশ পঁয়ত্রিশ ছত্রিশ সাঁইত্রিশ আটত্রিশ ঊনচল্লিশ চল্লিশ একচল্লিশ বিয়াল্লিশ তেতাল্লিশ চুয়াল্লিশ পঁয়তাল্লিশ ছেচল্লিশ সাতচল্লিশ আটচল্লিশ ঊনপঞ্চাশ পঞ্চাশ একান্ন বায়ান্ন তিপ্পান্ন চুয়ান্ন পঞ্চান্ন ছাপ্পান্ন সাতান্ন আটান্ন ঊনষাট ষাট একষট্টি বাষট্টি তেষট্টি চৌষট্টি পঁয়ষট্টি ছেষট্টি সাতষট্টি আটষট্টি ঊনসত্তর সত্তর একাত্তর বাহাত্তর তিয়াত্তর চুয়াত্তর পঁচাত্তর ছিয়াত্তর সাতাত্তর আটাত্তর ঊনআশি আশি একাশি বিরাশি তিরাশি চুরাশি পঁচাশি ছিয়াশি সাতাশি আটাশি ঊননব্বই নব্বই একানব্বই বিরানব্বই তিরানব্বই চুরানব্বই পঁচানব্বই ছিয়ানব্বই সাতানব্বই আটানব্বই নিরানব্বই'.split(' '),
  /** Amount in Bangla words (কোটি / লক্ষ / হাজার / শত grouping): 12500 → "বারো হাজার পাঁচশত". */
  bnWords(n) {
    n = Math.round(Math.abs(+n || 0)); if (!n) return this.W99[0];
    const W = this.W99, cr = Math.floor(n / 1e7), lk = Math.floor(n / 1e5) % 100, th = Math.floor(n / 1e3) % 100, h = Math.floor(n / 100) % 10, r = n % 100;
    return [cr ? (cr > 99 ? this.bnWords(cr) : W[cr]) + ' কোটি' : '', lk ? W[lk] + ' লক্ষ' : '', th ? W[th] + ' হাজার' : '', h ? W[h] + 'শত' : '', r ? W[r] : ''].filter(Boolean).join(' ');
  },
  words(n) { return this.bnWords(n); },
  /** Principal signature (core fragment) kept on one line. */
  sig(label) { return Print.signature(label).replace('line-height:12mm"', 'line-height:12mm;white-space:nowrap"'); },
  /** Amount in words for receipts, invoices and pay slips: "বারো হাজার পাঁচশত টাকা মাত্র". */
  taka(n) { return `${this.bnWords(n)} টাকা মাত্র`; },

  /* ---------- data helpers ---------- */
  stuOf(classId, campus = DB.campusId()) {
    return DB.s.students.filter(s => s.status === 'active' && (classId ? s.classId === classId : (campus === 'ALL' || DB.campusOf(s.classId) === campus)))
      .sort((a, b) => String(DB.campusOf(a.classId)).localeCompare(String(DB.campusOf(b.classId))) || ((DB.cls(a.classId)?.grade || 0) - (DB.cls(b.classId)?.grade || 0)) || String(a.section || '').localeCompare(String(b.section || '')) || a.roll - b.roll);
  },
  /** Competition ranking (1,2,2,4): GPA then `second` (total|pct); falls back to percentage when GPA is null (letter-only scales). */
  rank(list, second = 'total') {
    const key = x => x.res.gpa !== null && x.res.gpa !== undefined ? [x.res.gpa, second === 'pct' ? x.res.pct : x.res.total] : [x.res.pct, x.res.total];
    const sorted = [...list].sort((a, b) => { const ka = key(a), kb = key(b); return (kb[0] - ka[0]) || (kb[1] - ka[1]); });
    sorted.forEach((x, i) => { const k = key(x), p = sorted[i - 1]; x.pos = p && key(p)[0] === k[0] && key(p)[1] === k[1] ? p.pos : i + 1; });
    return sorted;
  },
  results(students, examId) { return students.map(st => ({ st, res: DB.result(st.id, examId) })).filter(x => x.res.rows.length); },
  pct(n) { return U.bn((Math.round(n * 10) / 10).toFixed(1)) + '%'; },
  sessionAtt(stId, session) {
    const rec = DB.s.attendance[stId] || {}, keys = Object.keys(rec).filter(k => !session || k.startsWith(String(session)));
    const c = { P: 0, A: 0, L: 0, E: 0 }; keys.forEach(k => c[rec[k]] = (c[rec[k]] || 0) + 1);
    const counted = keys.length - c.E;
    return { ...c, days: keys.length, pct: counted ? (c.P + c.L) / counted * 100 : null };
  },
  latestDate(rec) { let m = ''; Object.values(rec || {}).forEach(r => Object.keys(r || {}).forEach(k => { if (k > m && k <= U.today()) m = k; })); return m || U.today(); },

  /* ======================================================================
     GENERATORS — each returns an array of sheet HTML strings
     ====================================================================== */
  gen: {
    /* 1–2. Student CR80 ID cards (engine in print.js). opts: {paper, orientation, perSheet, margin, back, validTill, photo, qr} */
    studentCards(students, orientation = 'h', opts = {}) { return Print.idCards(students, orientation === 'v' ? 'v' : 'h', { ...opts, kind: 'student' }); },

    /* 3. Teacher & employee CR80 ID cards (same engine, employee model) */
    employeeCards(emps, orientation = 'h', opts = {}) { return Print.idCards(emps, orientation === 'v' ? 'v' : 'h', { ...opts, kind: 'employee' }); },

    /* 4. Multi-up admit cards (1/2/4/6/8 per sheet). Caller is responsible for fee-gating (see PrintStudio.admitSplit). */
    admitCards(students, exam, opts = {}) { return Print.admitSheets(students, exam, opts); },

    /* 5b. Desk labels: 3 × 8 (63.5 × 33.9 mm) per A4 from a seat plan */
    deskLabels(plan, examName) {
      const labels = [];
      plan.forEach(room => room.grid.forEach((row, r) => row.forEach((cell, c) => { if (cell) labels.push({ cell, room: room.room, seat: `${String.fromCharCode(65 + r)}${c + 1}` }); })));
      const W = 63.5, H = 33.9, left = (210 - (3 * W + 2 * 2.5)) / 2, top = (297 - 8 * H) / 2, sheets = [], s = DB.s.school;
      for (let i = 0; i < labels.length; i += 24) {
        const out = labels.slice(i, i + 24).map((L, k) => {
          const st = DB.student(L.cell.id) || {}, x = left + (k % 3) * (W + 2.5), y = top + Math.floor(k / 3) * H;
          return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${W}mm;height:${H}mm;box-sizing:border-box;padding:2.2mm 3mm;border:.2mm dashed #cbd5e1;border-radius:2mm;overflow:hidden;font-size:7pt;line-height:1.3">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:2mm">
              <div style="font-size:5.5pt;color:#64748b;line-height:1.2;min-width:0">${esc(s.shortName)} · ${esc(examName)}</div>
              <div style="text-align:right;line-height:1;flex-shrink:0"><div style="font-size:15pt;font-weight:800;color:var(--brand-ink)">${L.seat}</div><div style="font-size:6pt;font-weight:700">কক্ষ ${esc(L.room)}</div></div></div>
            <div style="font-size:9pt;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:-1mm;max-width:44mm">${esc(pn(DB.student(L.cell.id)) || L.cell.name)}</div>
            <div>${esc(DB.className(st.classId))} · শাখা ${esc(st.section || '')} · রোল <b>${bnNum(L.cell.roll)}</b></div>
            <div style="position:absolute;left:3mm;bottom:1.6mm;height:8.5mm;overflow:hidden">${barcode(st.regNo || L.cell.id, { height: 18, width: 1, fontSize: 8 })}</div></div>`;
        }).join('');
        sheets.push(`<div class="sheet">${out}</div>`);
      }
      return sheets;
    },

    /* 6b. Session transcript with weighted GPA */
    transcript(st, session = DB.session(), opts = {}) {
      const o = PrintStudio.opts(opts), P = PrintStudio, c = DB.cls(st.classId), campus = DB.campusOf(st.classId);
      const list = DB.examsOf(session).filter(e => e.published).map(e => ({ e, r: DB.result(st.id, e.id) })).filter(x => x.r.rows.length);
      const sg = DB.sessionGpa(st.id, session), cg = DB.cgpa(st.id), w = U.sum(list, x => x.e.weight || 0);
      const wPct = w ? U.sum(list, x => x.r.pct * (x.e.weight || 0)) / w : null;
      const scale = Grade.scale(campus, session), bands = Grade.bands(campus, session);
      const sessLetter = scale === 'letter' ? (wPct !== null ? Grade.letterForPct(wPct, bands) : '—') : (sg !== null ? Grade.letterForGpa(sg, bands) : '—');
      const info = [['শিক্ষার্থী', `${esc(pn(st))}`], ['শিক্ষার্থী আইডি', esc(st.id)], ['শ্রেণি / শাখা', `${esc(c.name)} / ${esc(st.section)}`], ['রোল · নিবন্ধন নম্বর', `${bnNum(st.roll)} · ${esc(st.regNo)}`], ['পিতা', esc(st.fatherNameBn || st.fatherName || '—')], ['জন্মতারিখ', U.fmtDate(st.dob)], ['শিক্ষাবর্ষ', esc(U.bn(session))], ...(multiCampus() ? [['ক্যাম্পাস', esc(DB.campus(campus).name)]] : [])];
      const subs = DB.s.subjects.filter(sub => list.some(x => x.r.rows.some(r => r.subject.id === sub.id)));
      return P.flow(o, 'একাডেমিক ট্রান্সক্রিপ্ট', [
        { html: `<div style="display:flex;gap:5mm"><div style="flex:1">${P.kv(info, 2)}</div><div style="text-align:center">${qr(verifyUrl('transcript', st.regNo + '|' + session), 80)}<div style="font-size:6.5pt;color:#64748b">${esc(st.regNo)}|${esc(session)}</div></div></div>`, mm: Math.max(P.kvMm(info, 2), 28) },
        { table: { title: 'শিক্ষাবর্ষের পরীক্ষাসমূহ', rowH: 6, empty: 'এই শিক্ষাবর্ষে কোনো প্রকাশিত ফলাফল নেই।', head: `<thead><tr><th>পরীক্ষা</th><th>ধরন</th><th>ভার</th><th>নম্বর</th><th>%</th><th>জিপিএ</th><th>লেটার গ্রেড</th><th>ফলাফল</th></tr></thead>`,
          rows: list.map(x => `<tr><td class="ps-n">${esc(x.e.name)}</td><td>${esc(bn(x.e.type))}</td><td>${bnNum(x.e.weight || 0)}%</td><td>${bnNum(x.r.total)} / ${bnNum(x.r.max)}</td><td>${P.pct(x.r.pct)}</td><td>${gpaFmt(x.r.gpa)}</td><td><b>${esc(x.r.letter)}</b></td><td style="color:${x.r.passed ? '#059669' : '#dc2626'};font-weight:700">${x.r.passed ? 'উত্তীর্ণ' : 'অনুত্তীর্ণ'}</td></tr>`),
          foot: list.length ? `<tfoot><tr><th colspan="2">শিক্ষাবর্ষের ভারযুক্ত ফলাফল</th><th>${bnNum(w)}%</th><th></th><th>${wPct !== null ? P.pct(wPct) : '—'}</th><th>${gpaFmt(sg)}</th><th>${esc(sessLetter)}</th><th></th></tr></tfoot>` : '' } },
        subs.length ? { table: { title: 'বিষয়ভিত্তিক নম্বর (মোট · লেটার গ্রেড)', rowH: 6, head: `<thead><tr><th>বিষয়</th>${list.map(x => `<th>${esc(x.e.id)}<div style="font-weight:400;font-size:6pt">পূর্ণমান ${bnNum(Grade.cfg(x.e).full)}</div></th>`).join('')}</tr></thead>`, headMm: 9,
          rows: subs.map(sub => `<tr><td>${esc(sub.name)}</td>${list.map(x => { const r = x.r.rows.find(y => y.subject.id === sub.id); return `<td>${r ? `${bnNum(r.total)} · <b style="color:${r.letter === 'F' ? '#dc2626' : '#0f172a'}">${esc(r.letter)}</b>` : '—'}</td>`; }).join('')}</tr>`) } } : null,
        { html: `<div class="ps-box" style="font-size:9pt;display:flex;justify-content:space-between;margin-top:2mm"><span><b>শিক্ষাবর্ষের জিপিএ (ভারযুক্ত):</b> ${gpaFmt(sg)} · <b>লেটার গ্রেড:</b> ${esc(sessLetter)}</span><span><b>ক্রমযোজিত জিপিএ:</b> ${gpaFmt(cg)}</span></div><div style="font-size:7.5pt;color:#64748b;margin-top:2mm">শিক্ষাবর্ষের জিপিএ = Σ(পরীক্ষার জিপিএ × ভার) ÷ প্রকাশিত পরীক্ষাসমূহের Σ ভার। অনুত্তীর্ণ পরীক্ষার জিপিএ ০ ধরা হয়। স্কেল: ${esc(SCALE_PRESETS[scale]?.label || scale)}।</div>`, mm: 20 },
        { html: P.signs(['Prepared by', 'Exam Controller', 'Principal']), mm: 34 },
      ]);
    },

    /* 7. Tabulation sheet (class × exam) */
    tabulation(classId, examId, opts = {}) {
      const o = PrintStudio.opts(opts, 'landscape'), P = PrintStudio, ex = DB.exam(examId), c = DB.cls(classId);
      const list = P.rank(P.results(P.stuOf(classId), examId)).sort((a, b) => String(a.st.section).localeCompare(String(b.st.section)) || a.st.roll - b.st.roll);
      const subs = DB.s.subjects.filter(sub => list.some(x => x.res.rows.some(r => r.subject.id === sub.id)));
      const passed = list.filter(x => x.res.passed).length, max = Grade.cfg(ex).full;
      const top = list.find(x => x.pos === 1);
      const head = `<thead><tr><th rowspan="2">রোল</th><th rowspan="2" class="ps-l">নাম</th>${subs.map(s => `<th colspan="2">${esc(s.code || s.name)}</th>`).join('')}<th rowspan="2">মোট<div style="font-weight:400">/${bnNum(max * subs.length)}</div></th><th rowspan="2">%</th><th rowspan="2">জিপিএ</th><th rowspan="2">এলজি</th><th rowspan="2">ফলাফল</th><th rowspan="2">অবস্থান</th></tr>
        <tr>${subs.map(() => `<th>মোট</th><th>এলজি</th>`).join('')}</tr></thead>`;
      const rows = list.map(x => `<tr><td>${x.st.section !== 'A' ? esc(x.st.section) + '-' : ''}${bnNum(x.st.roll)}</td><td class="ps-n" style="max-width:42mm">${esc(pn(x.st))}</td>${subs.map(s => { const r = x.res.rows.find(y => y.subject.id === s.id); return r ? `<td>${bnNum(r.total)}</td><td style="color:${r.letter === 'F' ? '#dc2626' : 'inherit'};font-weight:700">${esc(r.letter)}</td>` : '<td>—</td><td>—</td>'; }).join('')}<td><b>${bnNum(x.res.total)}</b></td><td>${P.pct(x.res.pct)}</td><td>${gpaFmt(x.res.gpa)}</td><td><b>${esc(x.res.letter)}</b></td><td style="color:${x.res.passed ? '#059669' : '#dc2626'}">${x.res.passed ? 'পাস' : 'ফেল'}</td><td><b>${bnNum(x.pos)}</b></td></tr>`);
      return P.flow(o, `টেবুলেশন শিট — ${esc(c.name)}`, [
        { html: P.chips([['পরীক্ষা', esc(ex.name)], ['শ্রেণি', esc(DB.className(classId))], ['অংশগ্রহণকারী', bnNum(list.length)], ['উত্তীর্ণ', `${bnNum(passed)} (${bnNum(list.length ? Math.round(passed / list.length * 100) : 0)}%)`, '#059669'], ['সর্বোচ্চ', top ? `${esc(pn(top.st).split(' ')[0])} · ${gpaFmt(top.res.gpa)}` : '—']]), mm: 18 },
        { table: { head, headMm: 10, rows, rowH: 4.9, cls: 'ps-xs', empty: 'এই শ্রেণি ও পরীক্ষার জন্য কোনো নম্বর প্রবেশ করানো হয়নি।' } },
        { html: `<div style="font-size:7pt;color:#64748b">মোট = বিষয়ের মোট নম্বর (${bnNum(max)}-এর মধ্যে); এলজি = লেটার গ্রেড; অবস্থান = জিপিএ, এরপর সর্বমোট নম্বর অনুযায়ী শ্রেণিতে অবস্থান (স্কেলে জিপিএ না থাকলে শতকরা হার)। পাস নম্বর: ${ex.mcqMax ? `সৃজনশীল ${bnNum(ex.cqPass)}, বহুনির্বাচনি ${bnNum(ex.mcqPass)}` : `লিখিত ${bnNum(ex.cqPass)}`}।</div>`, mm: 6 },
        { html: P.signs(['Class Teacher', 'Exam Controller', 'Principal'], 8), mm: 28 },
      ]);
    },

    /* 8. Merit list & position sheet */
    meritList(students, examId, opts = {}) {
      const o = PrintStudio.opts(opts), P = PrintStudio, ex = DB.exam(examId), wide = opts.scope === 'campus';
      let list = P.rank(P.results(students, examId), wide ? 'pct' : 'total');
      const topN = +opts.top || 0; if (topN) list = list.filter(x => x.pos <= topN);
      const medal = p => p === 1 ? '#fef3c7' : p === 2 ? '#f1f5f9' : p === 3 ? '#ffedd5' : '';
      return P.flow(o, `মেধাতালিকা — ${wide ? esc(DB.campus(opts.campus || DB.campusId()).name) : esc(DB.className(opts.classId))}`, [
        { html: P.chips([['পরীক্ষা', esc(ex.name)], ['পরিসর', wide ? campusText('ক্যাম্পাসব্যাপী') : 'শ্রেণিভিত্তিক'], ['ক্রমভুক্ত', bnNum(list.length)], ['সর্বোচ্চ জিপিএ', list[0] ? gpaFmt(list[0].res.gpa) : '—', '#059669']]), mm: 18 },
        { table: { rowH: 5.6, empty: 'কোনো ফলাফল পাওয়া যায়নি।', head: `<thead><tr><th>অবস্থান</th><th>রোল</th><th class="ps-l">নাম</th>${wide ? '<th>শ্রেণি</th>' : ''}<th>মোট</th><th>%</th><th>জিপিএ</th><th>লেটার গ্রেড</th><th>ফলাফল</th></tr></thead>`,
          rows: list.map(x => `<tr style="background:${medal(x.pos)}"><td><b>${bnNum(x.pos)}</b></td><td>${bnNum(x.st.roll)}</td><td class="ps-n">${esc(pn(x.st))}</td>${wide ? `<td>${esc(DB.className(x.st.classId))}</td>` : ''}<td>${bnNum(x.res.total)} / ${bnNum(x.res.max)}</td><td>${P.pct(x.res.pct)}</td><td><b>${gpaFmt(x.res.gpa)}</b></td><td>${esc(x.res.letter)}</td><td style="color:${x.res.passed ? '#059669' : '#dc2626'}">${x.res.passed ? 'উত্তীর্ণ' : 'অনুত্তীর্ণ'}</td></tr>`) } },
        { html: `<div style="font-size:7pt;color:#64748b">জিপিএ, এরপর ${wide ? 'শতকরা হার' : 'সর্বমোট নম্বর'} অনুযায়ী ক্রম নির্ধারিত (গ্রেডিং স্কেলে জিপিএ না থাকলে শতকরা হার)। সমান নম্বরপ্রাপ্তরা একই অবস্থান পায়।</div>`, mm: 6 },
        { html: P.signs(['Exam Controller', 'STAMP', 'Principal'], 8), mm: 30 },
      ]);
    },

    /* 9a. Official fee invoice / demand note */
    feeInvoice(st, opts = {}) {
      const o = PrintStudio.opts(opts), P = PrintStudio, today = U.today(), s = DB.s.school;
      const unpaid = DB.unpaid(st.id).sort((a, b) => a.due.localeCompare(b.due)), total = U.sum(unpaid, i => i.amount), overdue = U.sum(unpaid.filter(i => i.due < today), i => i.amount);
      const g = DB.guardiansOf(st.id)[0], no = `FI-${st.id}-${today.replace(/-/g, '')}`, bank = DB.s.accounts.find(a => a.code === '1010');
      const info = [['বিল নম্বর', esc(no)], ['প্রদানের তারিখ', U.fmtDate(today)], ['শিক্ষার্থী', esc(pn(st))], ['শিক্ষার্থী আইডি', esc(st.id)], ['শ্রেণি / রোল', `${esc(DB.className(st.classId))} / ${bnNum(st.roll)}`], ['অভিভাবক', esc(g ? `${pn(g)} · ${g.phone}` : '—')]];
      const merchants = Object.entries(s.merchant || {}).map(([k, v]) => `<div style="display:flex;justify-content:space-between;border-bottom:.2mm dotted #cbd5e1;padding:.6mm 0"><b>${esc(bn(k))}</b><span>${esc(v)} <span style="color:#64748b">(মার্চেন্ট · “পেমেন্ট”)</span></span></div>`).join('');
      return P.flow(o, 'ফি-র বিল / চাহিদাপত্র', [
        { html: `<div style="display:flex;gap:5mm"><div style="flex:1">${P.kv(info, 2)}</div><div style="text-align:center">${qr(verifyUrl('invoice', st.id), 80)}<div style="font-size:6.5pt;color:#64748b">দেখতে / পরিশোধ করতে স্ক্যান করুন</div></div></div>`, mm: 30 },
        { table: { rowH: 6, empty: 'কোনো বকেয়া নেই — এই হিসাব সম্পূর্ণ পরিশোধিত। ধন্যবাদ।', head: `<thead><tr><th>#</th><th>বিল</th><th class="ps-l">বিবরণ</th><th>মাস</th><th>পরিশোধের শেষ তারিখ</th><th>অবস্থা</th><th class="ps-r">পরিমাণ</th></tr></thead>`,
          rows: unpaid.map((i, k) => `<tr><td>${bnNum(k + 1)}</td><td>${esc(i.id)}</td><td class="ps-n">${esc(i.item)}</td><td>${i.month ? esc(U.monthName(i.month)) : '—'}</td><td>${U.fmtDate(i.due)}</td><td style="color:${i.due < today ? '#dc2626' : '#d97706'};font-weight:700">${i.due < today ? 'মেয়াদোত্তীর্ণ' : 'বকেয়া'}</td><td class="ps-r">${U.money(i.amount)}</td></tr>`),
          foot: unpaid.length ? `<tfoot><tr><th colspan="6">মোট প্রদেয়${overdue ? ` (যার মধ্যে মেয়াদোত্তীর্ণ ${U.money(overdue)})` : ''}</th><th class="ps-r">${U.money(total)}</th></tr></tfoot>` : '' } },
        unpaid.length ? { html: `<div style="font-size:9pt;margin-bottom:3mm"><b>কথায়:</b> ${esc(P.taka(total))}</div>`, mm: 7 } : null,
        { html: `<div style="display:flex;gap:4mm;font-size:8.5pt;margin-bottom:3mm"><div class="ps-box" style="flex:1"><div class="ps-h2" style="font-size:8.5pt">মোবাইল আর্থিক সেবার মাধ্যমে পরিশোধ</div>${merchants || '<div>—</div>'}<div style="margin-top:1.5mm">রেফারেন্স: <b>${esc(st.id)}</b>। এরপর অভিভাবক পোর্টালে ট্রানজ্যাকশন আইডি (TrxID) লিখুন (অথবা অফিসে এসএমএসটি দেখান)।</div></div>
          <div class="ps-box" style="flex:1"><div class="ps-h2" style="font-size:8.5pt">পরিশোধের অন্যান্য উপায়</div><div>• অনলাইন: অভিভাবক পোর্টাল → ফি (বিকাশ · নগদ · রকেট · কার্ড)</div><div>• ব্যাংক: ${esc(bank?.name || 'প্রতিষ্ঠানের ব্যাংক হিসাব')} — শিক্ষার্থী আইডি উল্লেখসহ জমা স্লিপ</div><div>• নগদ অর্থ: প্রতিষ্ঠানের হিসাব কাউন্টার, রবি–বৃহস্পতি ৮:০০–১৪:০০</div><div style="margin-top:1.5mm;color:#b91c1c">পরিশোধের শেষ তারিখের পর বকেয়া থাকলে বিলম্ব জরিমানা আরোপ হতে পারে এবং প্রবেশপত্র আটকে যেতে পারে।</div></div></div>`, mm: 44 },
        { html: `<div style="border-top:.3mm dashed #64748b;margin-top:4mm;padding-top:3mm;font-size:8.5pt;display:flex;justify-content:space-between;gap:4mm"><div><b>পরিশোধ স্লিপ — অফিস / ব্যাংক কপি</b><br>${esc(s.nameBn || s.name)} · বিল ${esc(no)}<br>শিক্ষার্থী: <b>${esc(pn(st))}</b> · আইডি ${esc(st.id)} · ${esc(DB.className(st.classId))} · রোল ${bnNum(st.roll)}</div><div style="text-align:right">পরিমাণ: <b>${U.money(total)}</b><br>পদ্ধতি / ট্রানজ্যাকশন আইডি: ____________________<br><br>গ্রহণকারী: ____________________</div></div>`, mm: 26 },
      ]);
    },

    /* 10. Pay slips (1 or 2 per sheet) from payroll rows */
    payslips(rows, opts = {}) {
      const o = PrintStudio.opts(opts), P = PrintStudio, [, PH] = Print.dims(o), per = +opts.perSheet === 1 ? 1 : 2, s = DB.s.school;
      const slipH = per === 1 ? PH - 28 - 6 : (PH - 28 - 10) / 2;
      const mask = a => a ? (String(a).length > 4 ? '•••• ' + String(a).slice(-4) : String(a)) : '—';
      const slip = row => {
        const e = DB.emp(row.empId) || { id: row.empId, name: row.empId, designation: '' }, other = Math.max(0, row.gross - row.net - (row.lop || 0) - (row.pf || 0));
        const earn = [['মূল বেতন', row.base], ['বাড়িভাড়া ভাতা', row.hra], ['চিকিৎসা ভাতা', row.medical], [`অতিরিক্ত কাজ (ওভারটাইম)${row.overtimeHours ? ` (${bnNum(row.overtimeHours)} ঘণ্টা)` : ''}`, row.overtime], ['অন্যান্য ভাতা', row.allowance]];
        const ded = [[`বেতন কর্তন (অনুপস্থিতি)${row.unexcused ? ` (${bnNum(row.unexcused)} দিন)` : ''}`, row.lop], ['ভবিষ্য তহবিল (১০%)', row.pf], ['অন্যান্য কর্তন', other]];
        const tbl = (title, list, totLabel, tot) => `<table class="ms-table ps-c" style="flex:1"><thead><tr><th>${title}</th><th class="ps-r">টাকা</th></tr></thead><tbody>${list.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="ps-r">${bnNum(+v || 0, true)}</td></tr>`).join('')}</tbody><tfoot><tr><th>${totLabel}</th><th class="ps-r">${bnNum(+tot || 0, true)}</th></tr></tfoot></table>`;
        return `<div style="height:${slipH}mm;box-sizing:border-box;position:relative;overflow:hidden;padding:1mm 0">
          <div style="display:flex;align-items:center;gap:3mm;border-bottom:.5mm solid var(--brand);padding-bottom:2mm;margin-bottom:3mm">${Print.logo(11)}<div style="flex:1"><div class="doc-title" style="font-size:13pt;font-weight:700;color:var(--brand-ink)">${esc(s.nameBn || s.name)}</div><div style="font-size:7.5pt;color:#475569">${[esc(DB.campus(e.campusId)?.name || ''), s.eiin ? 'ইআইআইএন ' + bnNum(s.eiin) : ''].filter(Boolean).join(' · ')}</div></div>
            <div style="text-align:right"><div style="background:var(--brand);color:#fff;font-weight:800;font-size:9pt;padding:.8mm 3mm;border-radius:1mm">বেতন স্লিপ · ${esc(U.monthName(row.month))}</div><div style="font-size:7pt;color:#64748b;margin-top:.8mm">স্লিপ ${esc(row.id)} · ${esc(bn(row.status || ''))}</div></div></div>
          ${P.kv([['কর্মচারী', esc(pn(e))], ['কর্মচারী আইডি', esc(e.id)], ['পদবি', esc(e.designation || bn(e.type) || '—')], ['শ্রেণিবিভাগ', esc(bn(e.kind) || '—')], ['বেতন প্রদানের মাধ্যম', `${esc(bn(e.payoutMethod || row.payouts?.[0]?.method || '—'))} ${esc(mask(e.payoutAccount))}`], ['বেতন গ্রেড', esc(U.bn(e.salaryGrade || '—'))]], 3, 8)}
          <div style="display:flex;gap:4mm;align-items:flex-start">${tbl('আয়', earn, 'মোট আয়', row.gross)}${tbl('কর্তন', ded, 'মোট কর্তন', row.gross - row.net)}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;background:var(--brand-50);border:.3mm solid var(--brand);border-radius:2mm;padding:2mm 3mm;margin-top:3mm"><div style="font-size:8pt"><b>কথায় নিট বেতন:</b> ${esc(P.taka(row.net))}</div><div style="font-size:14pt;font-weight:800;color:var(--brand-ink)">${U.money(row.net)}</div></div>
          ${(row.payouts || []).length ? `<div style="font-size:7.5pt;color:#475569;margin-top:2mm">${row.payouts.map(p => `কিস্তি ${bnNum(p.n)}: ${U.fmtDate(p.date)} তারিখে ${esc(bn(p.method))}${p.account ? ` ${esc(mask(p.account))}` : ''}-এর মাধ্যমে ${bnNum(+p.amount || 0, true)} টাকা · রেফারেন্স ${esc(p.ref || '—')}`).join('<br>')}</div>` : ''}
          <div style="position:absolute;left:0;right:0;bottom:3mm;display:flex;justify-content:space-between;font-size:7.5pt;text-align:center">${['প্রস্তুতকারী (হিসাব)', 'কর্মচারীর স্বাক্ষর', 'অধ্যক্ষ'].map(x => `<div style="width:45mm;border-top:.25mm solid #0f172a;padding-top:.8mm">${x}</div>`).join('')}</div></div>`;
      };
      const sheets = [];
      for (let i = 0; i < rows.length; i += per) {
        const parts = rows.slice(i, i + per).map(slip);
        sheets.push(`${Print.sheet(o, 'padded')}${parts.join(`<div style="border-top:.3mm dashed #94a3b8;margin:2mm 0;position:relative"><span style="position:absolute;left:50%;top:-2.2mm;background:#fff;padding:0 2mm;font-size:6.5pt;color:#94a3b8;transform:translateX(-50%)">✂ এখানে কাটুন</span></div>`)}<div style="position:absolute;bottom:4mm;left:0;right:0;text-align:center;font-size:6.5pt;color:#94a3b8">কম্পিউটারে প্রস্তুত বেতন স্লিপ · Dhee SMS · শিট ${bnNum(sheets.length + 1)}</div></div>`);
      }
      return sheets;
    },

    /* 11. Student ledger with running balance */
    ledger(st, opts = {}) {
      const o = PrintStudio.opts(opts), P = PrintStudio;
      const inv = DB.invoices(st.id).filter(i => !['cancelled', 'rescheduled'].includes(i.status)).map(i => ({ date: i.date || (i.month && i.month + '-01' <= i.due ? i.month + '-01' : i.due), ref: i.id, desc: i.item, dr: i.amount, cr: 0, k: 0 }));
      const pays = DB.s.payments.filter(p => p.studentId === st.id).map(p => ({ date: p.date, ref: p.id, desc: `পরিশোধ — ${bn(p.method)}${p.txn ? ` (${p.txn})` : ''}`, dr: 0, cr: p.amount, k: 1 }));
      const lines = [...inv, ...pays].sort((a, b) => a.date.localeCompare(b.date) || a.k - b.k);
      let bal = 0; lines.forEach(l => { bal += l.dr - l.cr; l.bal = bal; });
      const tDr = U.sum(lines, l => l.dr), tCr = U.sum(lines, l => l.cr);
      const info = [['শিক্ষার্থী', esc(pn(st))], ['শিক্ষার্থী আইডি', esc(st.id)], ['শ্রেণি / রোল', `${esc(DB.className(st.classId))} / ${bnNum(st.roll)}`], ['নিবন্ধন নম্বর', esc(st.regNo)], ['বিবরণীর তারিখ', U.fmtDate(U.today())], ['বৃত্তি', `${bnNum(st.scholarshipPct || 0)}%`]];
      const fmt = n => n ? bnNum(n, true) : '';
      return P.flow(o, 'শিক্ষার্থীর ফি লেজার', [
        { html: P.kv(info, 2), mm: P.kvMm(info, 2) },
        { html: P.chips([['মোট বিল', U.money(tDr)], ['মোট পরিশোধিত', U.money(tCr), '#059669'], ['বকেয়া স্থিতি', U.money(bal), bal > 0 ? '#dc2626' : '#059669']]), mm: 18 },
        { table: { rowH: 5.6, empty: 'কোনো লেনদেন নেই।', head: `<thead><tr><th>তারিখ</th><th>রেফারেন্স</th><th class="ps-l">বিবরণ</th><th class="ps-r">ডেবিট (টাকা)</th><th class="ps-r">ক্রেডিট (টাকা)</th><th class="ps-r">স্থিতি (টাকা)</th></tr></thead>`,
          rows: lines.map(l => `<tr><td>${U.fmtDate(l.date)}</td><td>${esc(l.ref)}</td><td class="ps-n" style="max-width:70mm">${esc(l.desc)}</td><td class="ps-r">${fmt(l.dr)}</td><td class="ps-r" style="color:#059669">${fmt(l.cr)}</td><td class="ps-r"><b>${bnNum(l.bal, true)}${l.bal > 0 ? ' ডেবিট' : l.bal < 0 ? ' ক্রেডিট' : ''}</b></td></tr>`),
          foot: lines.length ? `<tfoot><tr><th colspan="3">মোট / সমাপনী স্থিতি</th><th class="ps-r">${bnNum(tDr, true)}</th><th class="ps-r">${bnNum(tCr, true)}</th><th class="ps-r">${bnNum(bal, true)}</th></tr></tfoot>` : '' } },
        { html: `<div style="font-size:7pt;color:#64748b">বাতিল ও পুনর্নির্ধারিত বিল এখানে অন্তর্ভুক্ত নয় (পুনর্নির্ধারিত অর্থ কিস্তির বিল হিসেবে দেখানো হয়)। ডেবিট = শিক্ষার্থীর নিকট পাওনা অর্থ।</div>`, mm: 6 },
        { html: P.signs(['Accounts Officer', 'STAMP', 'Principal'], 8), mm: 30 },
      ]);
    },

    /* 12. Daily cash transaction report */
    dailyCash(date, campus = DB.campusId(), opts = {}) {
      const o = PrintStudio.opts(opts), P = PrintStudio, A = P.CASH_ACCTS;
      const inScope = v => campus === 'ALL' || !v.campusId || v.campusId === campus;
      const pays = DB.s.payments.filter(p => p.date === date && (campus === 'ALL' || DB.campusOf(DB.student(p.studentId)?.classId) === campus)).sort((a, b) => a.id.localeCompare(b.id));
      const vouchers = DB.s.journal.filter(v => v.date === date && inScope(v) && v.lines.some(l => A.includes(l.acct)));
      const open = DB.balances(v => v.date < date && inScope(v)), names = DB.balances(() => false);
      const vLines = []; vouchers.forEach(v => v.lines.filter(l => A.includes(l.acct)).forEach(l => vLines.push({ v, l })));
      const summ = A.map(a => { const inn = U.sum(vLines.filter(x => x.l.acct === a), x => x.l.dr), out = U.sum(vLines.filter(x => x.l.acct === a), x => x.l.cr), op = open[a]?.balance || 0; return { a, name: names[a]?.name || a, op, inn, out, close: op + inn - out }; });
      const byMethod = {}; pays.forEach(p => byMethod[p.method] = (byMethod[p.method] || 0) + p.amount);
      const fmt = n => n ? bnNum(+n, true) : '', num = n => bnNum(+n || 0, true);
      return P.flow(o, `দৈনিক নগদ লেনদেন প্রতিবেদন — ${U.fmtDate(date)}`, [
        { html: P.chips([...(multiCampus() ? [['পরিসর', campus === 'ALL' ? 'সকল ক্যাম্পাস' : esc(DB.campus(campus).short)]] : []), ['ফি-র রসিদ', bnNum(pays.length)], ['আদায়কৃত', U.money(U.sum(pays, p => p.amount)), '#059669'], ...Object.entries(byMethod).slice(0, 3).map(([m, v]) => [esc(bn(m)), U.money(v)])]), mm: 18 },
        { table: { title: 'ফি আদায়', rowH: 5.4, empty: 'এই তারিখে কোনো ফি-র রসিদ নেই।', head: `<thead><tr><th>রসিদ</th><th class="ps-l">শিক্ষার্থী</th><th>শ্রেণি</th><th>পদ্ধতি</th><th>মাধ্যম</th><th>ট্রানজ্যাকশন আইডি</th><th class="ps-r">পরিমাণ</th></tr></thead>`,
          rows: pays.map(p => { const st = DB.student(p.studentId); return `<tr><td>${esc(p.id)}</td><td class="ps-n">${esc(pn(st) || p.studentId)}</td><td>${esc(DB.className(st?.classId))}</td><td>${esc(bn(p.method))}</td><td>${esc(bn(p.channel || ''))}</td><td style="font-family:monospace">${esc(p.txn || '')}</td><td class="ps-r">${fmt(p.amount)}</td></tr>`; }),
          foot: pays.length ? `<tfoot><tr><th colspan="6">মোট ফি আদায়</th><th class="ps-r">${fmt(U.sum(pays, p => p.amount))}</th></tr></tfoot>` : '' } },
        { table: { title: 'নগদান বই — নগদ অর্থ, ব্যাংক ও এমএফএস সংশ্লিষ্ট ভাউচার', rowH: 5.4, empty: 'এই তারিখে নগদ অর্থ / ব্যাংক / এমএফএস সংশ্লিষ্ট কোনো ভাউচার নেই।', head: `<thead><tr><th>ভাউচার</th><th>ধরন</th><th class="ps-l">বিবরণ</th><th>হিসাব খাত</th><th class="ps-r">আগম (ডেবিট)</th><th class="ps-r">নির্গম (ক্রেডিট)</th></tr></thead>`,
          rows: vLines.map(({ v, l }) => `<tr><td>${esc(v.id)}</td><td>${esc(bn(v.kind || 'JV'))}</td><td class="ps-n" style="max-width:75mm">${esc(v.memo)}</td><td>${l.acct}</td><td class="ps-r">${fmt(l.dr)}</td><td class="ps-r">${fmt(l.cr)}</td></tr>`),
          foot: vLines.length ? `<tfoot><tr><th colspan="4">মোট</th><th class="ps-r">${fmt(U.sum(vLines, x => x.l.dr))}</th><th class="ps-r">${fmt(U.sum(vLines, x => x.l.cr))}</th></tr></tfoot>` : '' } },
        { table: { title: 'হিসাবের সারসংক্ষেপ', rowH: 5.6, head: `<thead><tr><th class="ps-l">হিসাব খাত</th><th class="ps-r">প্রারম্ভিক</th><th class="ps-r">আগম</th><th class="ps-r">নির্গম</th><th class="ps-r">সমাপনী</th></tr></thead>`,
          rows: summ.map(x => `<tr><td>${x.a} · ${esc(x.name)}</td><td class="ps-r">${num(x.op)}</td><td class="ps-r">${num(x.inn)}</td><td class="ps-r">${num(x.out)}</td><td class="ps-r"><b>${num(x.close)}</b></td></tr>`),
          foot: `<tfoot><tr><th>মোট তরল তহবিল</th><th class="ps-r">${num(U.sum(summ, x => x.op))}</th><th class="ps-r">${num(U.sum(summ, x => x.inn))}</th><th class="ps-r">${num(U.sum(summ, x => x.out))}</th><th class="ps-r">${num(U.sum(summ, x => x.close))}</th></tr></tfoot>` } },
        { html: `<div style="font-size:7pt;color:#64748b">${campus === 'ALL' ? '' : 'প্রতিষ্ঠানব্যাপী ভাউচার (ব্যয়কেন্দ্রবিহীন) অন্তর্ভুক্ত। '}ফি-র রসিদ প্রাপ্তি ভাউচার (RV) হিসেবে লিপিবদ্ধ হয়, তাই এগুলো নগদান বইতেও দেখা যায়।</div>`, mm: 6 },
        { html: P.signs(['Cashier', 'Accounts Officer', 'Principal'], 8), mm: 30 },
      ]);
    },

    /* 13. Daily teacher & staff attendance */
    staffDaily(date, campus = DB.campusId(), opts = {}) {
      if (!opts.own && typeof AttendanceReports !== 'undefined' && typeof AttendanceReports.staffDaily === 'function') {
        try { const r = AttendanceReports.staffDaily(date, campus, PrintStudio.opts(opts)); if (Array.isArray(r) && r.length && typeof r[0] === 'string') return r; } catch (e) { console.warn('AttendanceReports.staffDaily failed, using Print Studio fallback', e); }
      }
      const o = PrintStudio.opts(opts), P = PrintStudio, emps = DB.employees(campus).sort((a, b) => (a.kind > b.kind ? 1 : a.kind < b.kind ? -1 : 0) || a.name.localeCompare(b.name));
      const logs = (DB.s.gateLogs || []).filter(g => g.personType === 'staff' && g.date === date);
      const rows = emps.map(e => ({ e, st: DB.s.staffAttendance?.[e.id]?.[date] || '', g: logs.find(l => l.personId === e.id) }));
      const cnt = k => rows.filter(r => r.st === k).length, unmarked = rows.filter(r => !r.st).length;
      const hol = DB.holiday(date, campus === 'ALL' ? null : campus), school = U.isSchoolDay(date, null, campus === 'ALL' ? null : campus);
      return P.flow(o, `কর্মীদের দৈনিক উপস্থিতি — ${U.fmtDate(date)}`, [
        { html: P.chips([['দিন', `${U.dayBn(date)}${school ? '' : ' (বন্ধ)'}`], ['কর্মী', bnNum(rows.length)], ['উপস্থিত', bnNum(cnt('P')), '#059669'], ['বিলম্ব', bnNum(cnt('L')), '#d97706'], ['অনুপস্থিত', bnNum(cnt('A')), '#dc2626'], ['ছুটি', bnNum(cnt('E')), '#2563eb'], ['চিহ্নিত হয়নি', bnNum(unmarked), '#64748b']]), mm: 18 },
        hol ? { html: `<div class="ps-box" style="font-size:9pt;margin-bottom:3mm;background:#fef3c7">ক্যালেন্ডার: <b>${esc(hol.name)}</b> (${esc(bn(hol.type))})</div>`, mm: 10 } : null,
        { table: { rowH: 5.6, head: `<thead><tr><th>#</th><th>আইডি</th><th class="ps-l">নাম</th><th class="ps-l">পদবি</th><th>শ্রেণিবিভাগ</th><th>অবস্থা</th><th>প্রবেশ</th><th>প্রস্থান</th><th>পদ্ধতি</th><th>মন্তব্য</th></tr></thead>`,
          rows: rows.map((r, i) => `<tr><td>${bnNum(i + 1)}</td><td>${esc(r.e.id)}</td><td class="ps-n">${esc(pn(r.e))}</td><td class="ps-n" style="max-width:40mm">${esc(r.e.designation || bn(r.e.type) || '')}</td><td>${esc(bn(r.e.kind))}</td><td style="color:${P.ATT[r.st]?.[1] || '#64748b'};font-weight:700">${r.st ? P.ATT[r.st][0] : 'চিহ্নিত হয়নি'}</td><td>${esc(U.bn(r.g?.in || ''))}</td><td>${esc(U.bn(r.g?.out || ''))}</td><td>${esc(bn(r.g?.method || ''))}</td><td style="min-width:22mm"></td></tr>`) } },
        { html: P.signs(['Attendance Officer', 'Vice Principal', 'Principal'], 8), mm: 30 },
      ]);
    },

    /* 14a. Student daily attendance (one class or all classes of a campus) */
    studentDaily(date, classId, opts = {}) {
      const campus = opts.campus || DB.campusId();
      if (!opts.own && typeof AttendanceReports !== 'undefined' && typeof AttendanceReports.studentDaily === 'function') {
        try { const r = (classId ? [classId] : DB.classesIn(campus).map(c => c.id)).flatMap(id => AttendanceReports.studentDaily(id, date, PrintStudio.opts(opts)) || []); if (r.length && typeof r[0] === 'string') return r; } catch (e) { console.warn('AttendanceReports.studentDaily failed, using Print Studio fallback', e); }
      }
      const o = PrintStudio.opts(opts), P = PrintStudio, classes = classId ? [DB.cls(classId)] : DB.classesIn(campus);
      const all = P.stuOf(classId, campus), stat = s => DB.s.attendance[s.id]?.[date] || '';
      const cnt = k => all.filter(s => stat(s) === k).length;
      const hol = DB.holiday(date, campus);
      const items = [
        { html: P.chips([['তারিখ', `${U.dayBn(date)} ${U.fmtDate(date)}`], ['শিক্ষার্থী', bnNum(all.length)], ['উপস্থিত', bnNum(cnt('P')), '#059669'], ['বিলম্ব', bnNum(cnt('L')), '#d97706'], ['অনুপস্থিত', bnNum(cnt('A')), '#dc2626'], ['অনুমোদিত ছুটি', bnNum(cnt('E')), '#2563eb'], ['হার', all.length ? P.pct((cnt('P') + cnt('L')) / Math.max(1, all.length - cnt('E') - all.filter(s => !stat(s)).length) * 100) : '—']]), mm: 18 },
        hol ? { html: `<div class="ps-box" style="font-size:9pt;margin-bottom:3mm;background:#fef3c7">ক্যালেন্ডার: <b>${esc(hol.name)}</b> (${esc(bn(hol.type))})</div>`, mm: 10 } : null,
      ];
      classes.forEach(c => {
        const list = P.stuOf(c.id), k = x => bnNum(list.filter(s => stat(s) === x).length);
        items.push({ table: { title: `${esc(DB.className(c.id))} — উপস্থিত ${k('P')} · বিলম্ব ${k('L')} · অনুপস্থিত ${k('A')} · ছুটি ${k('E')}`, rowH: 5.2, empty: 'কোনো শিক্ষার্থী নেই।', head: `<thead><tr><th>রোল</th><th class="ps-l">শিক্ষার্থী</th><th>আইডি</th><th>অবস্থা</th><th class="ps-l">অভিভাবকের ফোন</th></tr></thead>`,
          rows: list.map(s => `<tr><td>${bnNum(s.roll)}</td><td class="ps-n">${esc(pn(s))}</td><td>${esc(s.id)}</td><td style="color:${P.ATT[stat(s)]?.[1] || '#64748b'};font-weight:700">${stat(s) ? P.ATT[stat(s)][0] : 'চিহ্নিত হয়নি'}</td><td class="ps-l">${stat(s) === 'A' ? esc(s.emergency || '') : ''}</td></tr>`) } });
      });
      items.push({ html: P.signs(['Class Teacher', 'STAMP', 'Principal'], 8), mm: 30 });
      return P.flow(o, `শিক্ষার্থীদের দৈনিক উপস্থিতি — ${U.fmtDate(date)}`, items);
    },

    /* 14b. Student monthly attendance register (students × school days) */
    studentMonthly(month, classId, opts = {}) {
      const campus = opts.campus || DB.campusId();
      if (!opts.own && typeof AttendanceReports !== 'undefined' && typeof AttendanceReports.studentMonthly === 'function') {
        try { const r = (classId ? [classId] : DB.classesIn(campus).map(c => c.id)).flatMap(id => AttendanceReports.studentMonthly(id, month, PrintStudio.opts(opts, 'landscape')) || []); if (r.length && typeof r[0] === 'string') return r; } catch (e) { console.warn('AttendanceReports.studentMonthly failed, using Print Studio fallback', e); }
      }
      const o = PrintStudio.opts(opts, 'landscape'), P = PrintStudio, [y, m] = month.split('-').map(Number), n = new Date(y, m, 0).getDate();
      const days = Array.from({ length: n }, (_, i) => `${month}-${U.pad(i + 1)}`).filter(d => U.isSchoolDay(d, null, campus));
      const classes = classId ? [DB.cls(classId)] : DB.classesIn(campus);
      const items = [{ html: P.chips([['মাস', esc(U.monthName(month))], ['বিদ্যালয় খোলার দিন', bnNum(days.length)], ['শ্রেণি', bnNum(classes.length)], ['সংকেত', '<span style="font-size:8pt">উ = উপস্থিত · <span style="color:#dc2626">অ = অনুপস্থিত</span> · <span style="color:#d97706">বি = বিলম্ব</span> · <span style="color:#2563eb">ছু = ছুটি</span></span>']]), mm: 18 }];
      const days0 = days;
      classes.forEach(c => {
        const list = P.stuOf(c.id), days = days0.filter(d => !DB.classOffDay?.(c.id, d));   // exam days without class attendance are not working days
        items.push({ table: { title: esc(DB.className(c.id)), rowH: 4.8, cls: 'ps-xs', headMm: 8, empty: 'কোনো শিক্ষার্থী নেই।',
          head: `<thead><tr><th>রোল</th><th class="ps-l">নাম</th>${days.map(d => `<th style="padding:.3mm">${bnNum(+d.slice(8))}<div style="font-weight:400;font-size:5pt">${U.dayBn(d, true)}</div></th>`).join('')}<th>উ</th><th>বি</th><th>অ</th><th>ছু</th><th>%</th></tr></thead>`,
          rows: list.map(s => {
            const rec0 = DB.s.attendance[s.id] || {}, rec = Object.fromEntries(Object.entries(rec0).filter(([d]) => !DB.examOffFor?.(s, d))), c2 = { P: 0, A: 0, L: 0, E: 0 }; days.forEach(d => { if (rec[d]) c2[rec[d]]++; });
            const counted = c2.P + c2.A + c2.L, pc = counted ? (c2.P + c2.L) / counted * 100 : null;
            return `<tr><td>${bnNum(s.roll)}</td><td class="ps-n" style="max-width:34mm">${esc(pn(s))}</td>${days.map(d => `<td style="padding:.3mm;color:${P.ATT[rec[d]]?.[1] || '#cbd5e1'};font-weight:${rec[d] && rec[d] !== 'P' ? 800 : 400}">${rec[d] ? bn(rec[d]) : '·'}</td>`).join('')}<td>${bnNum(c2.P)}</td><td>${bnNum(c2.L)}</td><td>${bnNum(c2.A)}</td><td>${bnNum(c2.E)}</td><td style="color:${pc !== null && pc < (DB.s.school.minAttendance || 75) ? '#dc2626' : 'inherit'};font-weight:700">${pc === null ? '—' : bnNum(Math.round(pc))}</td></tr>`;
          }) } });
      });
      items.push({ html: `<div style="font-size:7pt;color:#64748b">% = (উপস্থিত + বিলম্ব) ÷ অনুমোদিত ছুটি বাদে চিহ্নিত দিন। ${bnNum(DB.s.school.minAttendance || 75)}%-এর নিচে লাল রঙে চিহ্নিত। সাপ্তাহিক ছুটি ও ছুটির দিন বাদ দেওয়া হয়েছে।</div>`, mm: 6 });
      items.push({ html: P.signs(['Class Teacher', 'Principal'], 6), mm: 28 });
      return P.flow(o, `মাসিক উপস্থিতি রেজিস্টার — ${esc(U.monthName(month))}`, items);
    },

    /* 15. Yearly student progress report */
    progressReport(st, session = DB.session(), opts = {}) {
      const o = PrintStudio.opts(opts), P = PrintStudio, c = DB.cls(st.classId), campus = DB.campusOf(st.classId);
      const list = DB.examsOf(session).filter(e => e.published).map(e => ({ e, r: DB.result(st.id, e.id) })).filter(x => x.r.rows.length);
      const scale = Grade.scale(campus, session), maxP = scale === '4' ? 4 : 5, useGpa = scale !== 'letter';
      const sg = DB.sessionGpa(st.id, session), att = P.sessionAtt(st.id, session);
      const inc = (DB.s.incidents || []).filter(i => i.studentId === st.id && (!i.date || String(i.date).startsWith(session))).sort((a, b) => String(b.date).localeCompare(String(a.date)));
      const ach = (DB.s.achievements || []).filter(a => a.studentId === st.id).sort((a, b) => String(b.date).localeCompare(String(a.date)));
      const remarks = list.map(x => ({ e: x.e, t: DB.s.examRemarks?.[x.e.id]?.[st.id] })).filter(x => x.t);
      const rt = t => typeof t === 'string' ? t : (t?.text || t?.remark || t?.note || '');
      const info = [['শিক্ষার্থী', esc(pn(st))], ['শ্রেণি / শাখা', `${esc(c.name)} / ${esc(st.section)}`], ['রোল · আইডি', `${bnNum(st.roll)} · ${esc(st.id)}`], ['শিক্ষাবর্ষ', esc(U.bn(session))], ['পিতা', esc(st.fatherNameBn || st.fatherName || '—')], ...(multiCampus() ? [['ক্যাম্পাস', esc(DB.campus(campus).name)]] : [])];
      const bars = list.length ? `<div style="display:flex;align-items:flex-end;gap:4mm;height:38mm;border-bottom:.3mm solid #94a3b8;border-left:.3mm solid #94a3b8;padding:0 3mm">${list.map(x => {
        const v = useGpa ? (x.r.gpa || 0) / maxP : x.r.pct / 100, lbl = useGpa ? gpaFmt(x.r.gpa) : P.pct(x.r.pct);
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%"><div style="font-size:7pt;font-weight:700">${lbl}</div><div style="width:70%;max-width:14mm;height:${Math.max(2, v * 30)}mm;background:${x.r.passed ? 'var(--brand)' : '#dc2626'};border-radius:1mm 1mm 0 0"></div></div>`;
      }).join('')}</div><div style="display:flex;gap:4mm;padding:0 3mm;margin-top:1mm">${list.map(x => `<div style="flex:1;text-align:center;font-size:6.5pt;color:#475569">${esc(x.e.id)}</div>`).join('')}</div>` : '<div style="font-size:9pt;color:#64748b">এখনো কোনো ফলাফল প্রকাশিত হয়নি।</div>';
      const subs = DB.s.subjects.filter(sub => list.some(x => x.r.rows.some(r => r.subject.id === sub.id)));
      const subPct = (x, sub) => { const r = x.r.rows.find(y => y.subject.id === sub.id); if (!r) return null; const mx = r.max || Grade.cfg(x.e, sub.id).full; return mx ? r.total / mx * 100 : null; };
      const summ = `<div style="display:flex;gap:5mm;margin-bottom:4mm"><div style="flex:1.1"><div class="ps-h2">পরীক্ষাভিত্তিক ফলাফল</div><table class="ms-table ps-c"><thead><tr><th>পরীক্ষা</th><th>ভার</th><th>%</th><th>জিপিএ</th><th>লেটার গ্রেড</th><th>মেধাক্রম</th></tr></thead><tbody>${list.map(x => { const rk = DB.sectionRank(st.id, x.e.id); return `<tr><td class="ps-n" style="max-width:38mm">${esc(x.e.name)}</td><td>${bnNum(x.e.weight || 0)}%</td><td>${P.pct(x.r.pct)}</td><td>${gpaFmt(x.r.gpa)}</td><td><b>${esc(x.r.letter)}</b></td><td>${bnNum(rk.rank)}/${bnNum(rk.of)}</td></tr>`; }).join('') || '<tr><td colspan="6">—</td></tr>'}</tbody></table></div>
        <div style="flex:1"><div class="ps-h2">${useGpa ? 'পরীক্ষাভিত্তিক জিপিএ' : 'পরীক্ষাভিত্তিক শতকরা হার'}</div>${bars}</div></div>`;
      const trendTbl = subs.length ? `<div class="ps-h2">বিষয়ভিত্তিক প্রবণতা (পূর্ণমানের %)</div><table class="ms-table ps-c" style="margin-bottom:4mm"><thead><tr><th>বিষয়</th>${list.map(x => `<th>${esc(x.e.id)}</th>`).join('')}<th>প্রবণতা</th></tr></thead><tbody>${subs.map(sub => {
        const v = list.map(x => subPct(x, sub)), f = v.find(x => x !== null), l = [...v].reverse().find(x => x !== null), d = f !== undefined && l !== undefined ? l - f : 0;
        return `<tr><td>${esc(sub.name)}</td>${v.map(x => `<td>${x === null ? '—' : bnNum(Math.round(x))}</td>`).join('')}<td style="font-weight:800;color:${d > 2 ? '#059669' : d < -2 ? '#dc2626' : '#64748b'}">${d > 2 ? '▲' : d < -2 ? '▼' : '■'} ${d > 0 ? '+' : ''}${bnNum(Math.round(d))}</td></tr>`;
      }).join('')}</tbody></table>` : '';
      const conduct = `<div style="display:flex;gap:4mm;margin-bottom:4mm;font-size:8pt">
        <div class="ps-box" style="flex:0 0 42mm;text-align:center"><div style="font-size:6.5pt;color:#64748b;text-transform:uppercase">উপস্থিতি ${esc(U.bn(session))}</div><div style="font-size:18pt;font-weight:800;color:${att.pct !== null && att.pct < (DB.s.school.minAttendance || 75) ? '#dc2626' : 'var(--brand-ink)'}">${att.pct === null ? '—' : bnNum(Math.round(att.pct)) + '%'}</div><div>উ ${bnNum(att.P)} · বি ${bnNum(att.L)} · অ ${bnNum(att.A)} · ছু ${bnNum(att.E)}</div></div>
        <div class="ps-box" style="flex:1;min-width:0"><b>আচরণ ও শৃঙ্খলা</b> — ${bnNum(inc.filter(i => i.type === 'Commendation').length)}টি প্রশংসা, ${bnNum(inc.filter(i => i.type === 'Disciplinary').length)}টি শৃঙ্খলাজনিত নোট<div style="margin-top:1mm;line-height:1.45">${inc.filter(i => i.type !== 'Counselor').slice(0, 4).map(i => `<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><span style="color:${i.type === 'Commendation' ? '#059669' : '#dc2626'};font-weight:700">${i.type === 'Commendation' ? '★' : '!'}</span> ${U.fmtDate(i.date)} — ${esc(i.note)}</div>`).join('') || '<span style="color:#64748b">কোনো ঘটনা লিপিবদ্ধ নেই — আচরণ সন্তোষজনক।</span>'}</div></div>
        <div class="ps-box" style="flex:1;min-width:0"><b>অর্জনসমূহ</b><div style="margin-top:1mm;line-height:1.45">${ach.slice(0, 4).map(a => `<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">• ${esc(a.title)} <span style="color:#64748b">(${esc(P.LEVEL_BN[a.level] || bn(a.level || ''))})</span></div>`).join('') || '<span style="color:#64748b">—</span>'}</div></div></div>`;
      const rem = `<div class="ps-box" style="font-size:8.5pt;margin-bottom:2mm;min-height:16mm"><b>শ্রেণিশিক্ষকের মন্তব্য</b><div style="margin-top:1mm;line-height:1.5">${remarks.length ? remarks.slice(-2).map(x => `<div><span style="color:#64748b">${esc(x.e.name)}:</span> ${esc(rt(x.t))}</div>`).join('') : '<div style="border-bottom:.2mm dotted #94a3b8;height:5mm"></div><div style="border-bottom:.2mm dotted #94a3b8;height:5mm"></div>'}</div></div>`;
      return P.flow(o, `বার্ষিক অগ্রগতি প্রতিবেদন — শিক্ষাবর্ষ ${esc(U.bn(session))}`, [
        { html: `<div style="display:flex;gap:5mm">${P.ph(st, 24, 30)}<div style="flex:1">${P.kv(info, 2)}<div style="font-size:9pt"><b>শিক্ষাবর্ষের জিপিএ (ভারযুক্ত):</b> ${gpaFmt(sg)} · <b>ক্রমযোজিত জিপিএ:</b> ${gpaFmt(DB.cgpa(st.id))}</div></div></div>`, mm: 36 },
        { html: summ, mm: Math.max(52, 14 + list.length * 6) },
        trendTbl ? { html: trendTbl, mm: 12 + subs.length * 5.6 } : null,
        { html: conduct, mm: 32 },
        { html: rem, mm: 22 },
        { html: P.signs(['Class Teacher', "Guardian's signature", 'Principal'], 8), mm: 30 },
      ]);
    },

    /* 16. Certificates: TC uses the core template; testimonial & character certificates get type-specific wording */
    certificate(cert) {
      if (!cert.type || cert.type === 'Transfer Certificate') return Print.certificate(cert);
      const testimonial = cert.type === 'Testimonial', { name, father } = Print.certNames(cert);
      const body = testimonial
        ? `এই মর্মে প্রত্যয়ন করা যাচ্ছে যে, <b>${esc(name)}</b>, পিতা: <b>${esc(father)}</b>, এই প্রতিষ্ঠানের <b>${esc(cert.classLeft)}</b> (রোল ${bnNum(cert.roll)})-এর একজন নিয়মিত শিক্ষার্থী ছিল/আছে। ${esc(cert.reason)}। অধ্যয়নকালে তার আচরণ ও চরিত্র <b>${esc(bn(cert.conduct))}</b> পাওয়া গেছে। আমার জানামতে সে রাষ্ট্র বা শৃঙ্খলাবিরোধী কোনো কার্যকলাপে জড়িত ছিল না। আমি তার জীবনের সর্বাঙ্গীণ সাফল্য কামনা করি।`
        : `এই মর্মে প্রত্যয়ন করা যাচ্ছে যে, <b>${esc(name)}</b>, পিতা: <b>${esc(father)}</b>, এই প্রতিষ্ঠানের <b>${esc(cert.classLeft)}</b> (রোল ${bnNum(cert.roll)})-এর একজন শিক্ষার্থী ছিল/আছে। আমার জানামতে সে উত্তম নৈতিক চরিত্রের অধিকারী এবং রাষ্ট্র বা শৃঙ্খলাবিরোধী কোনো কার্যকলাপে জড়িত ছিল না। তার আচরণ: <b>${esc(bn(cert.conduct))}</b>। সনদ প্রদানের উদ্দেশ্য: ${esc(cert.reason)}। আমি তার উত্তরোত্তর সাফল্য কামনা করি।`;
      return [`<div class="sheet padded" style="border:3mm double var(--brand-ink)">${Print.header(esc(bn(cert.type)))}
        <div style="text-align:right;font-size:9pt;margin-top:4mm">ক্রমিক নম্বর: <b>${esc(cert.serial)}</b><br>তারিখ: ${U.fmtDate(cert.issueDate)}</div>
        <div style="font-size:12pt;line-height:2;margin-top:10mm;text-align:justify">${body}</div>
        <div style="margin-top:16mm;display:flex;justify-content:space-between;align-items:flex-end"><div style="text-align:center">${qr(verifyUrl('tc', cert.serial), 90)}<div style="font-size:8pt">ক্রমিক নম্বর ${esc(cert.serial)}<br>প্রতিষ্ঠানের ওয়েবসাইটে যাচাই করুন</div></div>${Print.stamp()}${PrintStudio.sig('Principal')}</div></div>`];
    },
  },

  /* ======================================================================
     Actions
     ====================================================================== */
  /** Card-layout options from a Studio form (checkboxes post "0"/"1" via a hidden twin). */
  cardOpts(d) {
    const b = (v, def = true) => v === undefined ? def : v === '1';
    return { ...(d.tpl && Print.ID_TPLS[d.tpl] ? { cfg: { tpl: d.tpl } } : {}), perSheet: d.perSheet || '', margin: d.margin, back: b(d.back, false), validTill: d.valid || undefined, photo: b(d.photo), qr: b(d.qr), routine: b(d.routine), rules: b(d.rules), cut: b(d.cut) };
  },
  /** The live preview only needs the first sheet or two. */
  liveCut(list, d) { return d._live ? list.slice(0, 20) : list; },
  LIVE: ['idh', 'idv', 'emp', 'admit'],
  liveSoon(form) { if (!form) return; clearTimeout(this._lt); this._lt = setTimeout(() => this.live(form), 160); },
  /** Render a miniature of the first sheet (and its back side) inside the form. */
  live(form) {
    const host = form.querySelector('[data-live]'), cap = form.querySelector('[data-live-cap]'); if (!host || !document.body.contains(form)) return;
    const d = formData(form), doc = form.dataset.doc;
    if (doc === 'admit') this.perSheetState(form);
    let r = null; try { r = this.docs[doc].call(this, { ...d, _live: true }, form); } catch (e) { console.error(e); }
    if (!r || !r.sheets || !r.sheets.length) { host.innerHTML = `<div class="text-slate-500 text-center py-10 px-2">${esc(r?.empty || 'প্রিভিউ দেখানোর মতো কিছু নেই।')}</div>`; cap.innerHTML = ''; return; }
    const L = Print._layout || {}, back = doc !== 'admit' && d.back === '1', shown = r.sheets.slice(0, back ? 2 : 1);
    const [wmm, hmm] = Print.dims(r.opts), pxW = wmm * 3.7795, pxH = hmm * 3.7795, avail = Math.max(200, host.clientWidth || 300), each = back ? (avail - 10) / 2 : avail;
    const sc = Math.min(each / pxW, 470 / pxH);
    host.innerHTML = `<div class="flex gap-2 justify-center">${shown.map((s, i) => `<div><div style="width:${(pxW * sc).toFixed(1)}px;height:${(pxH * sc).toFixed(1)}px;overflow:hidden;background:#fff;box-shadow:0 4px 14px rgba(15,23,42,.18);border-radius:2px"><div style="width:${pxW}px;height:${pxH}px;transform:scale(${sc});transform-origin:top left">${s}</div></div>${back ? `<div class="text-center text-slate-600 mt-1">${i ? 'পেছনের পিঠ' : 'সামনের পিঠ'}</div>` : ''}</div>`).join('')}</div>`;
    const per = L.per || 1, total = Math.ceil((r.count ?? 0) / per) * (back ? 2 : 1);
    cap.innerHTML = `<b>${esc(Print.paperBn(r.opts))}</b> · প্রতি শিটে ${bnNum(per)}টি · মোট ${bnNum(r.count ?? 0)}টি → ${bnNum(total)} পৃষ্ঠা${L.fellBack ? `<div class="text-amber-700 mt-1">এই কাগজ ও দিকবিন্যাসে প্রতি শিটে ${bnNum(L.fellBack)}টি ধরে না, তাই ${bnNum(per)}টি করে বসানো হয়েছে।</div>` : ''}`;
  },
  /** Mark admit "per sheet" choices that do not fit the chosen paper/orientation/margin. */
  perSheetState(form) {
    const el = form.elements; if (!el.perSheet) return;
    [...el.perSheet.options].forEach(op => { const ok = Print.admitLayout({ paper: el.paper?.value, orientation: el.orientation?.value, margin: el.margin?.value, perSheet: op.value }).ok; op.textContent = `প্রতি শিটে ${bnNum(op.value)}টি${ok ? '' : ' (ধরে না)'}`; });
  },
  admitSplit(classId, examId) {
    const ex = DB.exam(examId); if (!ex) return { ok: [], blocked: [] };
    const all = this.stuOf(classId), ok = [], blocked = [];
    all.forEach(st => { const due = DB.duesBefore(st.id, ex.start), pass = DB.admitCleared(st.id, ex); (pass ? ok : blocked).push(pass ? st : { st, due }); });
    return { ok, blocked, exam: ex };
  },
  issueCert(form) {
    const d = formData(form), st = DB.student(d.student);
    if (!st) return toast('একজন শিক্ষার্থী নির্বাচন করুন।', 'error');
    if (!d.reason) return toast('কারণ / উদ্দেশ্য লিখুন।', 'error');
    const type = this.CERT_PREFIX[d.ctype] ? d.ctype : 'Transfer Certificate', pre = this.CERT_PREFIX[type], y = new Date().getFullYear();
    const re = new RegExp(`^${pre}-${y}-(\\d+)$`);
    let n = Math.max(0, ...DB.s.certificates.map(c => +((String(c.serial).match(re) || [])[1] || 0))) + 1, serial;
    do { serial = `${pre}-${y}-${String(n++).padStart(5, '0')}`; } while (DB.s.certificates.some(c => c.serial === serial));
    const dues = DB.dues(st.id);
    if (type === 'Transfer Certificate' && dues > 0 && !confirm(`${pn(st)}-এর ${U.money(dues)} বকেয়া রয়েছে। তবুও ছাড়পত্র (টিসি) প্রদান করবেন? (সনদে বকেয়া থাকার বিষয়টি উল্লেখ থাকবে)`)) return;
    const g0 = DB.guardiansOf(st.id)[0];
    const cert = { serial, type, studentName: st.name, studentNameBn: st.nameBn || '', fatherName: st.fatherName || g0?.name || '—', fatherNameBn: st.fatherNameBn || (st.fatherName ? '' : g0?.nameBn) || '', classLeft: DB.className(st.classId), roll: st.roll, issueDate: U.today(), reason: d.reason, conduct: d.conduct || 'Good', duesCleared: dues === 0, studentId: st.id, issuedBy: App.session?.userId || null, campusId: DB.campusOf(st.classId) };
    DB.s.certificates.push(cert);
    let extra = '';
    if (type === 'Transfer Certificate' && d.markTransferred) { st.status = 'transferred'; st.leftOn = U.today(); extra = ' · student marked transferred'; }
    DB.audit('CERT_ISSUE', 'certificates', `${serial} ${type} issued for ${st.name} (${st.id})${extra}`); DB.save();
    App.refresh();
    toast(`${bn(type)} ${serial} প্রদান করা হয়েছে — পাবলিক ওয়েবসাইটে যাচাইযোগ্য।`, 'success');
    Print.preview(`${bn(type)} ${serial}`, this.gen.certificate(cert), { re: ['PrintStudio.reprint', serial] });
  },
  reprint(serial) { const c = DB.s.certificates.find(x => x.serial === serial); if (!c) return toast('সনদ পাওয়া যায়নি।', 'error'); Print.preview(`${bn(c.type)} ${c.serial}`, this.gen.certificate(c), { re: ['PrintStudio.reprint', serial] }); },

  /** Build {title, sheets, opts} for a card and open the preview. The form values travel with the print
      recipe (/print/<id>), so the document is re-built from them after a reload (PrintStudio.redo). */
  run(key, form) {
    try {
      const d = formData(form);
      if (key === 'seat') d.sclass = $$('input[name=sclass]:checked', form).map(x => x.value);
      const r = this.docs[key].call(this, d, form);
      if (!r) return;
      if (!r.sheets || !r.sheets.length) return toast(r.empty || 'এই নির্বাচনে মুদ্রণযোগ্য কিছু নেই।', 'warn');
      if (r.warn) toast(r.warn, 'warn');
      Print.preview(r.title, r.sheets, { ...(r.opts || { paper: 'A4', orientation: 'portrait' }), re: ['PrintStudio.redo', key, d] });
    } catch (e) { console.error(e); toast(`নথি প্রস্তুত করা যায়নি: ${e.message}`, 'error'); }
  },
  redo(key, d) { if (key === 'cert' || !this.docs[key]) return null; const r = this.docs[key].call(this, d || {}, null); return r && r.sheets ? r : null; },
  docs: {
    idh(d) { return this.docs.idCards.call(this, d, 'h'); },
    idv(d) { return this.docs.idCards.call(this, d, 'v'); },
    idCards(d, orient) {
      const list = (d.student ? [DB.student(d.student)] : this.stuOf(d.cls)).filter(Boolean), o = this.opts(d);
      return { title: `শিক্ষার্থী পরিচয়পত্র (${orient === 'v' ? 'খাড়া' : 'আড়াআড়ি'}) · ${bnNum(list.length)}`, count: list.length, sheets: this.gen.studentCards(this.liveCut(list, d), orient, { ...o, ...this.cardOpts(d) }), opts: o };
    },
    emp(d) {
      const list = (d.emp ? [DB.emp(d.emp)] : DB.employees().filter(e => !d.kind || e.kind === d.kind)).filter(Boolean), o = this.opts(d);
      return { title: `কর্মচারী পরিচয়পত্র · ${bnNum(list.length)}`, count: list.length, sheets: this.gen.employeeCards(this.liveCut(list, d), d.layout === 'v' ? 'v' : 'h', { ...o, ...this.cardOpts(d) }), opts: o, empty: 'এই নির্বাচনে কোনো কর্মচারী নেই।' };
    },
    admit(d) {
      const { ok, blocked, exam } = this.admitSplit(d.cls, d.exam); if (!exam) return d._live ? null : toast('একটি পরীক্ষা নির্বাচন করুন।', 'error');
      const o = this.opts(d);
      return { title: `প্রবেশপত্র — ${exam.name} · ${bnNum(ok.length)} জন ছাড়প্রাপ্ত`, count: ok.length, sheets: this.gen.admitCards(this.liveCut(ok, d), exam, { ...o, ...this.cardOpts(d) }), opts: o, warn: blocked.length ? `অপরিশোধিত বকেয়ার কারণে ${bnNum(blocked.length)} জন শিক্ষার্থীর প্রবেশপত্র স্থগিত রাখা হয়েছে।` : '', empty: 'এই নির্বাচনে ফি পরিশোধকারী কোনো শিক্ষার্থী নেই।' };
    },
    seat(d, form) {
      const classes = Array.isArray(d.sclass) ? d.sclass : $$('input[name=sclass]:checked', form).map(x => x.value), rooms = String(d.rooms || '').split(',').map(x => x.trim()).filter(Boolean);
      if (!classes.length || !rooms.length) return toast('অন্তত একটি শ্রেণি ও একটি কক্ষ নির্বাচন করুন।', 'error');
      if (typeof Admin === 'undefined' || !Admin.buildSeatPlan) return toast('আসন বিন্যাস ইঞ্জিন পাওয়া যাচ্ছে না।', 'error');
      const res = Admin.buildSeatPlan(classes, rooms, U.clamp(+d.rows || 5, 1, 12), U.clamp(+d.cols || 6, 1, 10)), ex = DB.exam(d.exam), name = ex ? ex.name : 'পরীক্ষা';
      const sheets = [...(d.output !== 'labels' ? Print.seatPlan(res.plan, name) : []), ...(d.output !== 'plan' ? this.gen.deskLabels(res.plan, name) : [])];
      return { title: `আসন বিন্যাস ও ডেস্ক লেবেল — ${name}`, sheets, opts: { paper: 'A4' }, warn: res.unseated ? `${bnNum(res.unseated)} জন পরীক্ষার্থীর আসন সংকুলান হয়নি — কক্ষ বা বেঞ্চ যোগ করুন।` : '' };
    },
    marks(d) {
      const o = this.opts(d);
      if (d.mode === 'transcript') {
        const list = d.student ? [DB.student(d.student)] : this.stuOf(d.cls);
        return { title: `ট্রান্সক্রিপ্ট — শিক্ষাবর্ষ ${U.bn(d.session)}`, sheets: list.flatMap(st => this.gen.transcript(st, d.session, o)), opts: o };
      }
      const ex = DB.exam(d.exam); if (!ex) return toast('একটি পরীক্ষা নির্বাচন করুন।', 'error');
      const list = (d.student ? [DB.student(d.student)] : this.stuOf(d.cls)).filter(st => DB.result(st.id, ex.id).rows.length);
      return { title: `নম্বরপত্র — ${ex.name} · ${bnNum(list.length)}`, sheets: list.flatMap(st => Print.marksheet(st, ex.id)), opts: { paper: 'A4' }, empty: 'এই নির্বাচনে কোনো নম্বর লিপিবদ্ধ নেই।' };
    },
    tab(d) { if (!d.cls) return toast('একটি শ্রেণি নির্বাচন করুন।', 'error'); const o = this.opts(d, 'landscape'); return { title: `টেবুলেশন শিট — ${DB.className(d.cls)}`, sheets: this.gen.tabulation(d.cls, d.exam, o), opts: o }; },
    merit(d) {
      const o = this.opts(d), wide = d.scope === 'campus';
      if (!wide && !d.cls) return toast('একটি শ্রেণি নির্বাচন করুন অথবা ক্যাম্পাসব্যাপী বেছে নিন।', 'error');
      return { title: 'মেধাতালিকা', sheets: this.gen.meritList(this.stuOf(wide ? '' : d.cls), d.exam, { ...o, scope: d.scope, classId: d.cls, top: d.top, campus: DB.campusId() }), opts: o };
    },
    fee(d) {
      const o = this.opts(d);
      if (d.doc === 'invoice') {
        const list = d.student ? [DB.student(d.student)] : this.stuOf(d.cls).filter(st => DB.dues(st.id) > 0);
        return { title: `ফি-র বিল${list.length > 1 ? ` · ${bnNum(list.length)}` : ''}`, sheets: list.flatMap(st => this.gen.feeInvoice(st, o)), opts: o, empty: 'এই নির্বাচনে বকেয়া আছে এমন কোনো শিক্ষার্থী নেই।' };
      }
      let pays;
      if (d.receipt) pays = DB.s.payments.filter(p => p.id.toUpperCase() === d.receipt.toUpperCase());
      else if (d.student) pays = DB.s.payments.filter(p => p.studentId === d.student).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
      else return toast('একজন শিক্ষার্থী নির্বাচন করুন অথবা রসিদ নম্বর লিখুন।', 'error');
      if (d.doc === 'last') pays = pays.slice(0, 1);
      return { title: `টাকা প্রাপ্তির রসিদ${pays.length > 1 ? ` · ${bnNum(pays.length)}` : ''}`, sheets: pays.flatMap(p => Print.receipt(p)), opts: { paper: 'A4' }, empty: 'মিলে যায় এমন কোনো পরিশোধ নেই।' };
    },
    pay(d) {
      const o = this.opts(d), camp = DB.campusId();
      const rows = DB.s.payroll.filter(r => r.month === d.month && (d.emp ? r.empId === d.emp : DB.emp(r.empId)?.campusId === camp)).sort((a, b) => (DB.emp(a.empId)?.name || '').localeCompare(DB.emp(b.empId)?.name || ''));
      return { title: `বেতন স্লিপ — ${U.monthName(d.month)} · ${bnNum(rows.length)}`, sheets: this.gen.payslips(rows, { ...o, perSheet: d.layout }), opts: o, empty: 'ওই মাস / কর্মচারীর জন্য বেতন-ভাতার কোনো তথ্য নেই। আগে বেতন-ভাতা প্রস্তুত করুন।' };
    },
    ledger(d) { const st = DB.student(d.student); if (!st) return toast('একজন শিক্ষার্থী নির্বাচন করুন।', 'error'); const o = this.opts(d); return { title: `লেজার — ${pn(st)}`, sheets: this.gen.ledger(st, o), opts: o }; },
    cash(d) { const o = this.opts(d); return { title: `দৈনিক নগদ প্রতিবেদন — ${U.fmtDate(d.date)}`, sheets: this.gen.dailyCash(d.date || U.today(), d.scope === 'ALL' ? 'ALL' : DB.campusId(), o), opts: o }; },
    staff(d) { const o = this.opts(d); return { title: `কর্মীদের উপস্থিতি — ${U.fmtDate(d.date)}`, sheets: this.gen.staffDaily(d.date || U.today(), DB.campusId(), o), opts: o }; },
    satt(d) {
      if (d.report === 'monthly') { const o = this.opts(d, 'landscape'); return { title: `মাসিক উপস্থিতি — ${U.monthName(d.month)}`, sheets: this.gen.studentMonthly(d.month, d.cls, o), opts: o }; }
      const o = this.opts(d); return { title: `দৈনিক উপস্থিতি — ${U.fmtDate(d.date)}`, sheets: this.gen.studentDaily(d.date || U.today(), d.cls, o), opts: o };
    },
    prog(d) { const list = d.student ? [DB.student(d.student)] : this.stuOf(d.cls); const o = this.opts(d); return { title: `অগ্রগতি প্রতিবেদন${list.length > 1 ? ` · ${bnNum(list.length)}` : ''} — ${U.bn(d.session)}`, sheets: list.flatMap(st => this.gen.progressReport(st, d.session, o)), opts: o }; },
    cert(d, form) { this.issueCert(form); return null; },
  },

  /* ======================================================================
     ID card design (Root User): template, colours and font per card kind,
     saved in DB.s.config.idCard.{student, employee}; every ID card print uses it.
     ====================================================================== */
  canDesign() { return App.has('ADMIN'); },
  tplState() {
    const ui = App.ui.idt || (App.ui.idt = { kind: 'student', orient: 'h', draft: null });
    return { ui, cfg: Print.idCfg(ui.kind, ui.draft) };
  },
  /** A real person for the preview (photo preferred), or a neutral sample. */
  tplSample(kind) {
    if (kind === 'employee') { const l = DB.employees(DB.campusId()); return l.find(e => e.photo) || l[0] || { id: 'T-0001', name: 'Sample Teacher', nameBn: 'নমুনা শিক্ষক', kind: 'Teacher', designation: 'Assistant Teacher', phone: '01700000000', blood: 'O+' }; }
    const l = DB.activeStudents(DB.campusId()); return l.find(s => s.photo) || l[0] || { id: 'S-0001', name: 'Sample Student', nameBn: 'নমুনা শিক্ষার্থী', classId: DB.s.classes[0]?.id, section: 'ক', roll: 1, regNo: '2026000001', blood: 'B+' };
  },
  /** One card face scaled to `px` wide. */
  tplFace(p, o, px, back) {
    const v = o.orient === 'v', wmm = v ? 53.98 : 85.6, hmm = v ? 85.6 : 53.98, k = px / (wmm * 3.7795);
    return `<div style="width:${px}px;height:${(hmm * 3.7795 * k).toFixed(1)}px;position:relative;flex-shrink:0"><div class="cr80 ${v ? 'v' : 'h'}" style="left:0;top:0;transform:scale(${k.toFixed(4)});transform-origin:top left;box-shadow:0 6px 18px rgba(15,23,42,.18)">${back ? Print.idBack(p, o) : Print.idCard(p, o)}</div></div>`;
  },
  themeHex(name) { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return /^#[0-9a-f]{6}$/i.test(v) ? v : name === '--accent' ? '#f42a41' : '#006a4e'; },
  designHtml() {
    const { ui, cfg } = this.tplState(), p = this.tplSample(ui.kind), saved = Print.idCfg(ui.kind);
    const kinds = [['student', 'শিক্ষার্থী', 'graduation-cap'], ['employee', 'শিক্ষক ও কর্মী', 'badge']];
    const tiles = Object.entries(Print.ID_TPLS).map(([k, [n, d]]) => `<button type="button" class="card p-2 text-left flex flex-col gap-2 items-center ${cfg.tpl === k ? 'ring-2 ring-brand-600' : ''}" onclick="PrintStudio.tplSet('tpl','${k}')" aria-pressed="${cfg.tpl === k}">
        ${this.tplFace(p, { kind: ui.kind, orient: ui.orient, cfg: { ...cfg, tpl: k, ...(ui.draft?.tpl === k || saved.tpl === k ? {} : { primary: '', accent: '' }) } }, ui.orient === 'v' ? 110 : 170)}
        <div class="w-full"><div class="font-semibold">${esc(n)}${saved.tpl === k ? ` ${badge('চালু', 'green')}` : ''}</div><div class="text-slate-500">${esc(d)}</div></div></button>`).join('');
    const prim = cfg.primary || this.themeHex('--brand'), acc = cfg.accent || this.themeHex('--accent');
    return `<div class="card p-4 space-y-4">
      <div class="flex items-start gap-3"><div class="rounded-xl p-2.5 bg-brand-50 text-brand-700 shrink-0">${icon('palette', 'w-5 h-5')}</div><div class="min-w-0"><div class="font-bold text-slate-900">পরিচয়পত্রের নকশা</div><div class="text-slate-500">ছয়টি তৈরি নকশা থেকে একটি বেছে নিন, রং ও ফন্ট ঠিক করুন। সংরক্ষণ করলে শিক্ষার্থী বা শিক্ষক-কর্মচারীর সব পরিচয়পত্র (সামনে ও পেছনে) এই নকশায় ছাপা হবে।</div></div></div>
      <div class="flex flex-wrap gap-2">${pills(kinds, ui.kind, id => `App.ui.idt.kind='${id}';App.ui.idt.draft=null;App.refresh()`)}<span class="flex-1"></span>${pills([['h', 'আড়াআড়ি', 'rectangle-horizontal'], ['v', 'খাড়া', 'rectangle-vertical']], ui.orient, id => `App.ui.idt.orient='${id}';App.refresh()`)}</div>
      <div class="grid grid-cols-2 lg:grid-cols-3 gap-3">${tiles}</div>
      <div class="grid sm:grid-cols-3 gap-3 items-end">
        <div><label class="label" for="idt-p">প্রধান রং</label><input id="idt-p" type="color" class="input h-11 p-1" value="${prim}" oninput="PrintStudio.tplSet('primary',this.value)"></div>
        <div><label class="label" for="idt-a">অ্যাকসেন্ট রং</label><input id="idt-a" type="color" class="input h-11 p-1" value="${acc}" oninput="PrintStudio.tplSet('accent',this.value)"></div>
        <div><label class="label" for="idt-f">ফন্ট</label><select id="idt-f" class="select" onchange="PrintStudio.tplSet('font',this.value)">${this.opt(Print.ID_FONTS, cfg.font)}</select></div></div>
      <div class="rounded-xl bg-slate-100 border border-slate-200 p-3"><div class="font-semibold text-slate-700 mb-2 flex items-center gap-2">${icon('eye', 'w-4 h-4')} সরাসরি প্রিভিউ — সামনে ও পেছনে</div>
        <div id="idt-live" class="flex flex-wrap gap-4 justify-center">${this.tplLiveHtml()}</div></div>
      <div class="flex flex-wrap gap-2"><button type="button" class="btn btn-ghost" onclick="App.ui.idt.draft={tpl:'${cfg.tpl}'};App.refresh()">${icon('rotate-ccw')} নকশার নিজস্ব রং</button><span class="flex-1"></span>${ui.draft ? `<button type="button" class="btn btn-ghost" onclick="App.ui.idt.draft=null;App.refresh()">বাতিল</button>` : ''}<button type="button" class="btn btn-primary" onclick="PrintStudio.tplSave()">${icon('save')} নকশা সংরক্ষণ করুন</button></div></div>`;
  },
  tplLiveHtml() {
    const { ui, cfg } = this.tplState(), p = this.tplSample(ui.kind), o = { kind: ui.kind, orient: ui.orient, cfg };
    const w = Math.min(ui.orient === 'v' ? 230 : 360, Math.max(240, (($('#idt-live')?.clientWidth || window.innerWidth - 80) - 20) / (window.innerWidth < 900 ? 1 : 2)));
    return [0, 1].map(b => `<div class="text-center">${this.tplFace(p, o, Math.round(w), !!b)}<div class="text-slate-600 mt-1">${b ? 'পেছনের পিঠ' : 'সামনের পিঠ'}</div></div>`).join('');
  },
  tplSet(key, val) {
    const { ui, cfg } = this.tplState();
    ui.draft = { tpl: cfg.tpl, primary: cfg.primary, accent: cfg.accent, font: cfg.font, ...(ui.draft || {}) };
    if (key === 'tpl') { ui.draft = { tpl: val, font: ui.draft.font }; return App.refresh(); }
    ui.draft[key] = val;
    clearTimeout(this._tt); this._tt = setTimeout(() => { const h = $('#idt-live'); if (h) h.innerHTML = this.tplLiveHtml(); }, 80);
  },
  tplSave() {
    if (!this.canDesign()) return toast('শুধু রুট ব্যবহারকারী নকশা বদলাতে পারেন।', 'error');
    const { ui, cfg } = this.tplState(), d = Print.ID_DEF[cfg.tpl] || [];
    const keep = (x, def) => (x && x !== def ? x : '');
    DB.s.config = DB.s.config || {};
    DB.s.config.idCard = { ...(DB.s.config.idCard || {}), [ui.kind]: { tpl: cfg.tpl, primary: keep(cfg.primary, d[0]), accent: keep(cfg.accent, d[1]), font: cfg.font } };
    DB.audit('ID_CARD_DESIGN', 'settings', `${ui.kind}: ${cfg.tpl}${cfg.primary ? ' ' + cfg.primary : ''}${cfg.accent ? ' / ' + cfg.accent : ''}`); DB.save();
    ui.draft = null; toast('পরিচয়পত্রের নকশা সংরক্ষিত হয়েছে।', 'success'); App.refresh();
  },

  /* ======================================================================
     UI
     ====================================================================== */
  examOpts(sel) { return [...DB.s.exams].sort((a, b) => b.start.localeCompare(a.start)).map(e => `<option value="${esc(e.id)}" ${e.id === sel ? 'selected' : ''}>${esc(e.name)}${e.published ? '' : ' (অপ্রকাশিত)'}</option>`).join(''); },
  opt(list, sel) { return list.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(l)}</option>`).join(''); },
  /** Re-populate dependent fields when a class / student / exam select changes. */
  sync(form, src) {
    const el = form.elements;
    if (src === 'cls' && el.student) { const box = form.querySelector('[data-sp]'); if (box) StudentPicker.pick(box, ''); }
    const doc = form.dataset.doc;
    if (doc === 'admit') {
      const { ok, blocked } = this.admitSplit(el.cls.value, el.exam.value), box = form.querySelector('[data-blocked]');
      if (box) box.innerHTML = `<div class="text-xs"><span class="font-semibold text-emerald-700">${bnNum(ok.length)} জন ছাড়প্রাপ্ত</span> · <span class="font-semibold ${blocked.length ? 'text-red-600' : 'text-slate-500'}">বকেয়ার কারণে ${bnNum(blocked.length)} জন আটকানো</span></div>${blocked.length ? `<div class="mt-1 max-h-24 overflow-y-auto text-xs divide-y divide-red-100 bg-red-50 rounded-lg px-2">${blocked.map(b => `<div class="py-1 flex justify-between gap-2"><span class="truncate">${esc(pn(b.st))} <span class="text-slate-400">${esc(DB.className(b.st.classId))} · রোল ${bnNum(b.st.roll)}</span></span><b class="text-red-600 shrink-0">${U.money(b.due)}</b><button type="button" class="shrink-0 text-[11px] font-semibold text-brand-700 underline" onclick="AdmitWaiver.grant('${b.st.id}','${el.exam.value}',()=>PrintStudio.sync(this.closest('form'),'exam'))">অনুমতি দিন</button></div>`).join('')}</div>` : ''}`;
    }
    if (doc === 'fee') {
      const box = form.querySelector('[data-pays]'), sid = el.student.value;
      if (box) { const pays = sid ? DB.s.payments.filter(p => p.studentId === sid).sort((a, b) => b.date.localeCompare(a.date)) : []; box.innerHTML = sid ? `<div class="text-xs text-slate-500">বকেয়া ${U.money(DB.dues(sid))} · ${bnNum(pays.length)}টি পরিশোধ${pays[0] ? ` · সর্বশেষ ${esc(pays[0].id)}, ${U.fmtDate(pays[0].date)}` : ''}</div>` : `<div class="text-xs text-slate-500">নির্বাচনে বকেয়াসহ ${bnNum(this.stuOf(el.cls.value).filter(s => DB.dues(s.id) > 0).length)} জন শিক্ষার্থী</div>`; }
    }
    if (doc === 'satt') { const m = el.report.value === 'monthly'; form.querySelector('[data-f=date]').classList.toggle('hidden', m); form.querySelector('[data-f=month]').classList.toggle('hidden', !m); if (src === 'report') el.orientation.value = m ? 'landscape' : 'portrait'; }
    if (doc === 'merit') { el.cls.disabled = el.scope.value === 'campus'; }
    if (this.LIVE.includes(doc)) this.liveSoon(form);
  },
  filter(q) { q = String(q || '').toLowerCase(); $$('[data-ps-card]').forEach(c => c.classList.toggle('hidden', !!q && !c.dataset.psCard.includes(q))); },

  render() {
    this.css();
    const camp = DB.campusId(), classes = DB.classesIn(camp), c0 = classes[0]?.id || '', today = U.today(), year = new Date().getFullYear();
    const latest = DB.latestExam()?.id || DB.s.exams[0]?.id, upcoming = [...DB.s.exams].filter(e => e.start >= today).sort((a, b) => a.start.localeCompare(b.start))[0]?.id || latest;
    const months = Array.from({ length: 12 }, (_, k) => U.monthKey(U.addMonths(today.slice(0, 7) + '-01', -k)));
    const payMonths = [...new Set(DB.s.payroll.map(r => r.month))].sort().reverse();
    const lastPayDate = DB.s.payments.filter(p => p.date <= today && DB.campusOf(DB.student(p.studentId)?.classId) === camp).map(p => p.date).sort().pop() || today;
    const lastAtt = this.latestDate(Object.fromEntries(DB.activeStudents(camp).slice(0, 30).map(s => [s.id, DB.s.attendance[s.id]])));
    const lastStaff = this.latestDate(DB.s.staffAttendance || {});
    const emps = DB.employees(camp);

    const W = (label, inner, cls = '') => `<div class="${cls}"><label class="label">${label}</label>${inner}</div>`;
    const sel = (name, label, options, cls = '', on = '') => W(label, `<select class="select" name="${name}" ${on ? `onchange="${on}"` : ''}>${options}</select>`, cls);
    const sync = n => `PrintStudio.sync(this.form,'${n}')`;
    const F = {
      cls: (all = true, def = all ? '' : c0) => sel('cls', 'শ্রেণি', classOptions(def, all), '', sync('cls')),
      student: (clsId, all = true) => W('শিক্ষার্থী', studentPicker('student', '', { scope: 'cls', campus: DB.campusId(), allowEmpty: all, emptyLabel: 'নির্বাচিত শ্রেণির সকল শিক্ষার্থী', onPick: `PrintStudio.sync(this.form,'student')` }), 'col-span-2'),
      exam: (def = latest, on = '') => sel('exam', 'পরীক্ষা', this.examOpts(def), 'col-span-2', on),
      session: () => sel('session', 'শিক্ষাবর্ষ', sessionOptions(DB.session())),
      paper: () => sel('paper', 'কাগজ', this.opt([['A4', 'এ৪'], ['Letter', 'লেটার'], ['Legal', 'লিগ্যাল']], 'A4')),
      orient: (def = 'portrait') => sel('orientation', 'দিকবিন্যাস', this.opt([['portrait', 'পোর্ট্রেট (খাড়া)'], ['landscape', 'ল্যান্ডস্কেপ (আড়াআড়ি)']], def)),
      date: (val, name = 'date', label = 'তারিখ', attr = '') => `<div ${attr}><label class="label">${label}</label><input type="date" class="input" name="${name}" value="${val}"></div>`,
      per: (list, def) => sel('perSheet', 'প্রতি শিটে', this.opt(list, def)),
      idPer: () => F.per([['', 'যতগুলো ধরে (স্বয়ংক্রিয়)'], ...[1, 2, 4, 6, 8].map(n => [n, `সর্বোচ্চ ${bnNum(n)}টি`])], ''),
      margin: (def = '8') => sel('margin', 'মার্জিন', this.opt([['5', '৫ মিমি'], ['8', '৮ মিমি'], ['10', '১০ মিমি'], ['15', '১৫ মিমি'], ['20', '২০ মিমি']], def)),
      chk: (name, label, on = true) => `<label class="flex items-center gap-2 py-1 cursor-pointer"><input type="hidden" name="${name}" value="0"><input type="checkbox" name="${name}" value="1" ${on ? 'checked' : ''} class="w-4 h-4 shrink-0"><span>${label}</span></label>`,
      toggles: items => `<div class="col-span-2"><label class="label">ঐচ্ছিক অংশ</label><div class="flex flex-wrap gap-x-5">${items.join('')}</div></div>`,
    };
    const idOpts = (kind = 'student') => sel('tpl', 'নকশা', this.opt([['', `সংরক্ষিত নকশা (${Print.ID_TPLS[Print.idCfg(kind).tpl][0]})`], ...Object.entries(Print.ID_TPLS).map(([k, [n]]) => [k, n])], ''), 'col-span-2')
      + (this.canDesign() ? `<div class="col-span-2"><button type="button" class="btn btn-ghost btn-sm" onclick="App.ui.psDoc='idtpl';App.ui.idt={kind:'${kind}',orient:'h',draft:null};App.refresh()">${icon('palette')} রং, ফন্ট ও নকশা ঠিক করুন</button></div>` : '')
      + F.date(`${year}-12-31`, 'valid', 'মেয়াদ') + F.paper() + F.orient() + F.idPer() + F.margin() + F.toggles([F.chk('photo', 'ছবি'), F.chk('qr', 'কিউআর কোড'), F.chk('back', 'পেছনের পিঠ (নিয়মাবলি ও ঠিকানা)', false)]);
    const cards = [
      { k: 'idh', n: 1, t: 'শিক্ষার্থী পরিচয়পত্র — আড়াআড়ি', ic: 'id-card', d: 'CR80 আড়াআড়ি কার্ড (৮৫.৬ × ৫৩.৯৮ মিমি): ছবি, বাংলা ও ইংরেজি নাম, শ্রেণি-শাখা-রোল, রক্তের গ্রুপ, অভিভাবকের ফোন, কিউআর, বারকোড ও স্বাক্ষর; ক্রপ চিহ্নসহ, চাইলে পেছনের পিঠসহ।', f: F.cls() + `<div></div>` + F.student('', true) + idOpts() },
      { k: 'idv', n: 2, t: 'শিক্ষার্থী পরিচয়পত্র — খাড়া', ic: 'contact-round', d: 'CR80 খাড়া কার্ড (৫৩.৯৮ × ৮৫.৬ মিমি), একই তথ্য ও নকশা; ক্রপ চিহ্নসহ, চাইলে পেছনের পিঠসহ।', f: F.cls() + `<div></div>` + F.student('', true) + idOpts() },
      { k: 'emp', n: 3, t: 'শিক্ষক ও কর্মচারী পরিচয়পত্র', ic: 'badge', d: `ছবি, পদবি, রক্তের গ্রুপ, বারকোড ও কিউআরসহ CR80 কার্ড · ${multiCampus() ? 'ক্যাম্পাসে' : 'মোট'} ${bnNum(emps.length)} জন কর্মচারী।`,
        f: sel('kind', 'শ্রেণিবিভাগ', this.opt([['', 'শিক্ষক ও কর্মী'], ['Teacher', 'কেবল শিক্ষক'], ['Staff', 'কেবল সহায়ক কর্মী']], '')) + sel('layout', 'কার্ডের দিক', this.opt([['h', 'আড়াআড়ি'], ['v', 'খাড়া']], 'h'))
          + sel('emp', 'কর্মচারী', `<option value="">এই শ্রেণিবিভাগের সকলে</option>` + emps.map(e => `<option value="${esc(e.id)}">${esc(pn(e))} · ${esc(bn(e.designation || e.type || e.kind))}</option>`).join(''), 'col-span-2') + idOpts('employee') },
      { k: 'admit', n: 4, t: 'পরীক্ষার প্রবেশপত্র (ফি পরিশোধসাপেক্ষ)', ic: 'ticket', d: 'পরীক্ষা শুরুর তারিখে বা তার আগে যাদের কোনো বকেয়া নেই, কেবল তাদের প্রবেশপত্র মুদ্রিত হয় — তবে অধ্যক্ষ / রুট ইউজার বকেয়াসহ কোনো শিক্ষার্থীকে অনুমতি দিতে পারেন। পরীক্ষার সময়সূচি প্রকাশিত থাকলে প্রবেশপত্রে শ্রেণির রুটিনও ছাপা হয়।',
        f: F.cls() + F.per([1, 2, 4, 6, 8].map(n => [n, `প্রতি শিটে ${bnNum(n)}টি`]), '4') + F.exam(upcoming, sync('exam')) + F.paper() + F.orient() + F.margin()
          + F.toggles([F.chk('photo', 'ছবি'), F.chk('qr', 'কিউআর কোড'), F.chk('routine', 'পরীক্ষার রুটিন'), F.chk('rules', 'নির্দেশনা'), F.chk('cut', 'কাটার দাগ')]) + `<div class="col-span-2" data-blocked></div>` },
      { k: 'seat', n: 5, t: 'আসন বিন্যাস ও ডেস্ক লেবেল তালিকা', ic: 'armchair', d: 'প্রতি কক্ষে পর্যায়ক্রমিক শ্রেণিভিত্তিক আসন বিন্যাস এবং আসন কোড ও বারকোডসহ ৩ × ৮ ডেস্ক লেবেল (এ৪)।',
        f: F.exam(upcoming) + `<div class="col-span-2"><label class="label">শ্রেণি</label><div class="flex flex-wrap gap-x-3 gap-y-1 text-sm">${classes.map((c, i) => `<label class="flex items-center gap-1"><input type="checkbox" name="sclass" value="${esc(c.id)}" ${i < 2 ? 'checked' : ''}>${esc(c.name)}</label>`).join('')}</div></div>`
          + W('কক্ষ (কমা দিয়ে আলাদা করুন)', `<input class="input" name="rooms" value="${esc(DB.rooms(camp).slice(0, 3).join(', '))}">`, 'col-span-2') + W('সারি', `<input type="number" min="1" max="12" class="input" name="rows" value="5">`) + W('বেঞ্চ / সারি', `<input type="number" min="1" max="10" class="input" name="cols" value="6">`)
          + sel('output', 'আউটপুট', this.opt([['both', 'আসন বিন্যাস + ডেস্ক লেবেল'], ['plan', 'কেবল আসন বিন্যাস'], ['labels', 'কেবল ডেস্ক লেবেল']], 'both'), 'col-span-2') },
      { k: 'marks', n: 6, t: 'সাময়িক নম্বরপত্র ও ট্রান্সক্রিপ্ট', ic: 'file-badge', d: 'একজন শিক্ষার্থী বা পুরো শ্রেণির দাপ্তরিক নম্বরপত্র, অথবা ভারযুক্ত জিপিএসহ শিক্ষাবর্ষের ট্রান্সক্রিপ্ট।',
        f: sel('mode', 'নথি', this.opt([['marksheet', 'নম্বরপত্র (একটি পরীক্ষা)'], ['transcript', 'শিক্ষাবর্ষের ট্রান্সক্রিপ্ট']], 'marksheet')) + F.cls(false) + F.student(c0, true) + F.exam(latest) + F.session() + F.paper() },
      { k: 'tab', n: 7, t: 'টেবুলেশন শিট', ic: 'table', d: 'শ্রেণি × পরীক্ষা: প্রতিটি বিষয়ের মোট নম্বর ও লেটার গ্রেড, সর্বমোট, জিপিএ, লেটার গ্রেড ও অবস্থান।', f: F.cls(false) + F.paper() + F.exam(latest) + F.orient('landscape') },
      { k: 'merit', n: 8, t: 'মেধাতালিকা ও অবস্থান শিট', ic: 'trophy', d: campusText('জিপিএ ও এরপর মোট নম্বর অনুযায়ী ক্রম, শ্রেণিভিত্তিক বা ক্যাম্পাসব্যাপী।'),
        f: sel('scope', 'পরিসর', this.opt([['class', 'শ্রেণিভিত্তিক'], ['campus', campusText('ক্যাম্পাসব্যাপী')]], 'class'), '', sync('scope')) + F.cls(false) + F.exam(latest) + sel('top', 'প্রদর্শন', this.opt([['0', 'সকলে'], ['10', 'শীর্ষ ১০'], ['20', 'শীর্ষ ২০'], ['50', 'শীর্ষ ৫০']], '0')) + F.paper() },
      { k: 'fee', n: 9, t: 'ফি-র বিল ও পরিশোধের রসিদ', ic: 'receipt', d: 'পরিশোধের শেষ তারিখ, এমএফএস মার্চেন্ট নম্বর ও কিউআরসহ চাহিদাপত্র — অথবা টাকা প্রাপ্তির রসিদ পুনর্মুদ্রণ।',
        f: sel('doc', 'নথি', this.opt([['invoice', 'ফি-র বিল / চাহিদাপত্র'], ['last', 'সর্বশেষ টাকা প্রাপ্তির রসিদ'], ['all', 'সকল টাকা প্রাপ্তির রসিদ']], 'invoice')) + F.cls(false) + F.student(c0, true) + W('…অথবা রসিদ নম্বর', `<input class="input" name="receipt" placeholder="PAY0123">`) + F.paper() + `<div class="col-span-2" data-pays></div>` },
      { k: 'pay', n: 10, t: 'বেতন স্লিপ — শিক্ষক ও কর্মী', ic: 'banknote', d: 'বেতন-ভাতা রেজিস্টার থেকে আয়, কর্তন, কথায় নিট বেতন ও প্রদানের কিস্তিসমূহ।',
        f: sel('month', 'মাস', this.opt(payMonths.map(m => [m, U.monthName(m)]), payMonths[0])) + sel('layout', 'প্রতি শিটে', this.opt([['2', 'প্রতি শিটে ২টি'], ['1', 'প্রতি শিটে ১টি']], '2'))
          + sel('emp', 'কর্মচারী', `<option value="">${multiCampus() ? 'ক্যাম্পাসের ' : ''}সকল কর্মচারী</option>` + emps.map(e => `<option value="${esc(e.id)}">${esc(pn(e))} · ${esc(bn(e.kind))}</option>`).join(''), 'col-span-2') + F.paper() },
      { k: 'ledger', n: 11, t: 'শিক্ষার্থীর লেজার প্রতিবেদন', ic: 'book-open-text', d: 'চলমান স্থিতিসহ তারিখানুক্রমিক বিল (ডেবিট) ও পরিশোধ (ক্রেডিট)।', f: F.cls(false) + F.paper() + F.student(c0, false) },
      { k: 'cash', n: 12, t: 'দৈনিক নগদ লেনদেন প্রতিবেদন', ic: 'wallet', d: 'ফি-র রসিদ, নগদ/ব্যাংক/এমএফএস ভাউচার এবং প্রতিটি হিসাবের প্রারম্ভিক → সমাপনী স্থিতি।',
        f: F.date(lastPayDate) + (multiCampus() ? sel('scope', 'পরিসর', this.opt([['campus', DB.campus(camp).short + ' ক্যাম্পাস'], ['ALL', 'সকল ক্যাম্পাস']], 'campus')) : '') + F.paper() + F.orient() },
      { k: 'staff', n: 13, t: 'শিক্ষকদের দৈনিক উপস্থিতি প্রতিবেদন', ic: 'user-check', d: `প্রত্যেক কর্মচারীর অবস্থা, গেটে প্রবেশ/প্রস্থান ও পদ্ধতি${typeof AttendanceReports !== 'undefined' ? ' (উপস্থিতি মডিউলের প্রতিবেদন)' : ''}।`, f: F.date(lastStaff) + F.paper() },
      { k: 'satt', n: 14, t: 'শিক্ষার্থীদের দৈনিক ও মাসিক উপস্থিতি', ic: 'calendar-check', d: 'শ্রেণিভিত্তিক দৈনিক হাজিরা, অথবা মাসিক রেজিস্টার (শিক্ষার্থী × বিদ্যালয় খোলার দিন)।',
        f: sel('report', 'প্রতিবেদন', this.opt([['daily', 'দৈনিক প্রতিবেদন'], ['monthly', 'মাসিক রেজিস্টার']], 'daily'), '', sync('report')) + F.cls(true) + F.date(lastAtt, 'date', 'তারিখ', 'data-f="date"') + `<div data-f="month" class="hidden"><label class="label">মাস</label><select class="select" name="month">${this.opt(months.map(m => [m, U.monthName(m)]), months[0])}</select></div>` + F.paper() + F.orient() },
      { k: 'prog', n: 15, t: 'শিক্ষার্থীর বার্ষিক অগ্রগতি প্রতিবেদন', ic: 'trending-up', d: 'জিপিএ চার্ট, বিষয়ভিত্তিক প্রবণতা, উপস্থিতি, আচরণ, অর্জন ও মন্তব্যসহ শিক্ষাবর্ষের সকল পরীক্ষা।', f: F.cls(false) + F.session() + F.student(c0, true) + F.paper() },
    ];
    const certs = [...DB.s.certificates].sort((a, b) => String(b.issueDate).localeCompare(String(a.issueDate)));
    const livePane = `<div class="rounded-xl bg-slate-100 border border-slate-200 p-3 min-w-0"><div class="font-semibold text-slate-700 mb-2 flex items-center gap-2">${icon('eye', 'w-4 h-4')} সরাসরি প্রিভিউ (প্রথম শিট)</div><div data-live class="min-h-[12rem]"><div class="text-slate-500 text-center py-10">প্রিভিউ তৈরি হচ্ছে…</div></div><div data-live-cap class="text-slate-600 mt-2 text-center"></div></div>`;
    const card = c => { const lv = this.LIVE.includes(c.k); return `<form class="card p-4 flex flex-col gap-3" data-doc="${c.k}" data-ps-card="${esc((c.t + ' ' + c.d).toLowerCase())}" onsubmit="event.preventDefault();PrintStudio.run('${c.k}',this)"${lv ? ' oninput="PrintStudio.liveSoon(this)" onchange="PrintStudio.liveSoon(this)"' : ''}>
        <div class="flex items-start gap-3"><div class="rounded-xl p-2.5 bg-brand-50 text-brand-700 shrink-0">${icon(c.ic, 'w-5 h-5')}</div><div class="min-w-0"><div class="font-bold text-slate-900 leading-tight"><span class="text-slate-400 font-semibold">${bnNum(c.n)}.</span> ${esc(c.t)}</div><div class="${lv ? 'text-slate-500' : 'text-xs text-slate-500'} mt-0.5">${esc(c.d)}</div></div></div>
        ${lv ? `<div class="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] gap-4 items-start"><div class="grid grid-cols-2 gap-2 content-start min-w-0">${c.f}</div>${livePane}</div>` : `<div class="grid grid-cols-2 gap-2">${c.f}</div>`}
        <button class="btn btn-primary btn-sm mt-auto">${icon('printer')} ${lv ? 'পূর্ণ মাপে খুলুন ও মুদ্রণ করুন' : 'প্রিভিউ ও মুদ্রণ'}</button></form>`; };
    const certCard = `<form class="card p-4 flex flex-col gap-3 md:col-span-2 xl:col-span-1" data-doc="cert" data-ps-card="transfer certificate testimonial character certificate tc ছাড়পত্র প্রশংসাপত্র চারিত্রিক সনদ টিসি" onsubmit="event.preventDefault();PrintStudio.run('cert',this)">
        <div class="flex items-start gap-3"><div class="rounded-xl p-2.5 bg-brand-50 text-brand-700 shrink-0">${icon('scroll', 'w-5 h-5')}</div><div class="min-w-0"><div class="font-bold text-slate-900 leading-tight"><span class="text-slate-400 font-semibold">১৬.</span> ছাড়পত্র (টিসি), প্রশংসাপত্র ও চারিত্রিক সনদ</div><div class="text-xs text-slate-500 mt-0.5">ক্রমিক নম্বরযুক্ত সনদ প্রদান করুন (পাবলিক যাচাই রেজিস্টারে যুক্ত হবে) অথবা বিদ্যমান সনদ পুনর্মুদ্রণ করুন।</div></div></div>
        <div class="grid grid-cols-2 gap-2">${sel('ctype', 'ধরন', this.opt(Object.keys(this.CERT_PREFIX).map(t => [t, bn(t)]), 'Transfer Certificate'))}${F.cls(false)}${F.student(c0, false)}
          ${W('কারণ / উদ্দেশ্য', `<input class="input" name="reason" placeholder="যেমন: পরিবারের চট্টগ্রামে স্থানান্তর">`, 'col-span-2')}
          ${sel('conduct', 'আচরণ', this.opt(['Excellent', 'Very Good', 'Good', 'Satisfactory'].map(x => [x, bn(x)]), 'Excellent'))}
          <label class="flex items-end gap-2 text-xs pb-2"><input type="checkbox" name="markTransferred" value="1"> শিক্ষার্থীকে স্থানান্তরিত হিসেবে চিহ্নিত করুন (টিসি)</label></div>
        <button class="btn btn-accent btn-sm">${icon('stamp')} প্রদান ও প্রিভিউ</button>
        <div class="border-t border-slate-100 pt-2"><div class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">প্রদত্ত সনদ (${bnNum(certs.length)})</div>
          <div class="max-h-44 overflow-y-auto divide-y divide-slate-100">${certs.map(c => `<div class="py-1.5 flex items-center gap-2 text-sm"><div class="min-w-0 flex-1"><div class="font-semibold truncate">${esc(Print.certNames(c).name)}</div><div class="text-xs text-slate-500">${esc(c.serial)} · ${esc(bn(c.type))} · ${U.fmtDate(c.issueDate)}</div></div><button type="button" class="btn btn-ghost btn-sm" onclick="PrintStudio.reprint('${esc(c.serial)}')">${icon('printer')}</button></div>`).join('') || emptyState('এখনো কোনো সনদ প্রদান করা হয়নি।', 'scroll')}</div></div></form>`;
    // One document at a time, chosen from grouped pills (no grid, no scrolling).
    const design = this.canDesign();
    const all = [...cards, { k: 'cert', n: 16, t: 'টিসি, প্রশংসাপত্র ও চারিত্রিক সনদ', ic: 'scroll' }, ...(design ? [{ k: 'idtpl', t: 'কার্ডের নকশা', ic: 'palette' }] : [])];
    const groups = [['পরিচয়পত্র', ['idh', 'idv', 'emp', ...(design ? ['idtpl'] : [])]], ['পরীক্ষা', ['admit', 'seat', 'marks', 'tab', 'merit', 'prog']], ['অর্থ ও মানবসম্পদ', ['fee', 'pay', 'ledger', 'cash']], ['উপস্থিতি', ['staff', 'satt']], ['সনদ', ['cert']]];
    const curK = all.some(c => c.k === App.ui.psDoc) ? App.ui.psDoc : 'idh', cur = all.find(c => c.k === curK);
    const body = curK === 'cert' ? certCard.replace('md:col-span-2 xl:col-span-1', '') : curK === 'idtpl' ? this.designHtml() : card(cur);
    return pageHeader('মুদ্রণ ও নথি প্রস্তুত স্টুডিও', `<b>${esc(DB.campus(camp).name)}</b>-এর জন্য ১৬টি দাপ্তরিক নথি · এ৪ / লেটার / লিগ্যাল কাগজে প্রকৃত মাপে, কিউআর যাচাইসহ।`)
      + `<div class="card p-4 mb-5 space-y-3">${groups.map(([g, ks]) => `<div class="flex flex-wrap items-center gap-1.5"><span class="text-[11px] font-bold uppercase tracking-wide text-slate-400 w-28 shrink-0">${g}</span>${ks.map(k => { const c = all.find(x => x.k === k); return `<button class="pill ${k === curK ? 'pill-on' : ''}" onclick="App.ui.psDoc='${k}';App.refresh()">${icon(c.ic, 'w-4 h-4')}${c.n ? `<span class="opacity-60">${bnNum(c.n)}.</span> ` : ''}${esc(c.t)}</button>`; }).join('')}</div>`).join('')}</div>
      <div class="${this.LIVE.includes(curK) || curK === 'idtpl' ? 'max-w-6xl' : 'max-w-3xl'}">${body}</div>`;
  },
  mount() { $$('form[data-doc]').forEach(f => { if (['admit', 'fee', 'satt', 'merit'].includes(f.dataset.doc)) this.sync(f); else if (this.LIVE.includes(f.dataset.doc)) this.liveSoon(f); }); },
};

const printStudioPage = {
  id: 'print-studio', label: 'প্রিন্ট স্টুডিও', icon: 'printer', module: 'print',
  render() { return PrintStudio.render(); },
  mount() { PrintStudio.mount(); },
};
App.addPage('admin', printStudioPage, 'system');
App.addPage('principal', printStudioPage, 'risk');
PrintStudio.css();
