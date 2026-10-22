/* ==========================================================================
   Dhee SMS — Bulk Printing Studio engine
   Every generator returns one or more <div class="sheet"> A4 pages laid out
   in millimetres, so the on-screen preview and the printed page match.
   ========================================================================== */

const Print = {
  /** Paper sizes in mm (portrait). Generators wrap pages with Print.sheet(opts) so preview & print match. */
  PAPERS: { A4: [210, 297], Letter: [215.9, 279.4], Legal: [215.9, 355.6] },
  PAPER_BN: { A4: 'এ৪', Letter: 'লেটার', Legal: 'লিগ্যাল' },
  /** Bangla display labels for signature / sign-off roles (the English label stays the key). */
  ROLE_BN: {
    Principal: 'অধ্যক্ষ', Headmaster: 'প্রধান শিক্ষক', 'Head Teacher': 'প্রধান শিক্ষক', Director: 'পরিচালক', Chairman: 'সভাপতি',
    'Exam Controller': 'পরীক্ষা নিয়ন্ত্রক', 'Accounts Officer': 'হিসাবরক্ষণ কর্মকর্তা', Accountant: 'হিসাবরক্ষক', 'Class Teacher': 'শ্রেণিশিক্ষক',
    Cashier: 'ক্যাশিয়ার', 'Prepared by': 'প্রস্তুতকারী', 'Checked by': 'যাচাইকারী', 'Checked by (Accounts)': 'যাচাইকারী (হিসাব)', 'Approved by': 'অনুমোদনকারী',
    'Prepared by (Accounts)': 'প্রস্তুতকারী (হিসাব)', "Employee's signature": 'কর্মচারীর স্বাক্ষর', "Guardian's signature": 'অভিভাবকের স্বাক্ষর',
    "Candidate's signature": 'পরীক্ষার্থীর স্বাক্ষর', "Student's signature": 'শিক্ষার্থীর স্বাক্ষর', 'Attendance Officer': 'উপস্থিতি কর্মকর্তা',
    'Vice Principal': 'উপাধ্যক্ষ', 'Assistant Headmaster': 'সহকারী প্রধান শিক্ষক', 'Admission Committee': 'ভর্তি কমিটি', 'Chair, Admission Committee': 'সভাপতি, ভর্তি কমিটি',
  },
  roleBn(label) { return this.ROLE_BN[label] || label; },
  /** "এ৪ পোর্ট্রেট" style paper label for display. */
  paperBn(opts = {}) { return `${this.PAPER_BN[opts.paper || 'A4'] || opts.paper} ${opts.orientation === 'landscape' ? 'ল্যান্ডস্কেপ' : 'পোর্ট্রেট'}`; },
  /** Display names on a certificate record (Bangla when the record or the student has one). */
  certNames(cert) {
    const st = cert.studentId ? DB.student(cert.studentId) : null;
    return { name: cert.studentNameBn || st?.nameBn || cert.studentName || '', father: cert.fatherNameBn || st?.fatherNameBn || cert.fatherName || '—' };
  },
  dims(opts = {}) { const [w, h] = this.PAPERS[opts.paper || 'A4'] || this.PAPERS.A4; return opts.orientation === 'landscape' ? [h, w] : [w, h]; },
  /** Opening tag for one page of the given paper/orientation. */
  sheet(opts = {}, cls = '', style = '') { const [w, h] = this.dims(opts); return `<div class="sheet ${cls}" style="width:${w}mm;height:${h}mm;${style}">`; },
  /* ---------- Stable print view: /print/<id> ----------
     A document opens as an in-app route (no pop-up window, no about:blank). Only its recipe is kept in
     sessionStorage — title, paper, the module it came from and a re-build call [global function path, ...args] —
     never the HTML, so a reload re-renders the document from current data.
     Callers pass opts.re = ['Module.method', arg1, …]: re-running it either returns {title, sheets, opts} / an
     array of sheets, or calls Print.preview again (captured, not navigated). Print.show(type, …args) covers the
     common documents registered in Print.doc. */
  KEY: 'dhee.print.',
  _mem: {},
  _recs: {},
  preview(title, sheets, opts = {}) {
    if (this._cap) { this._cap.push({ title, sheets, opts }); return; }
    const mod = App.session ? App.currentModule() : null;
    if (mod && !App.perm(mod, 'print')) return toast('এই মডিউলে মুদ্রণের অনুমতি আপনার ভূমিকায় নেই।', 'error');
    if (!sheets || !sheets.length) return toast('মুদ্রণযোগ্য কিছু নেই।', 'warn');
    const { re, ...o } = opts, id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const onPrint = location.pathname.startsWith('/print/');
    const rec = { title: String(title || ''), opts: { paper: this.PAPERS[o.paper] ? o.paper : 'A4', orientation: o.orientation === 'landscape' ? 'landscape' : 'portrait' }, re: Array.isArray(re) && typeof re[0] === 'string' ? re : null, mod, from: onPrint ? (this._cur?.rec.from || '') : App.loc(), at: Date.now() };
    this._mem = { [id]: sheets }; this._recs[id] = rec;
    try { sessionStorage.setItem(this.KEY + id, JSON.stringify(rec)); this.prune(); } catch (e) { }
    // keep the detail pages we leave, so "ফিরে যান" returns to the same place
    if (!onPrint) this._back = { hash: App.loc(), details: App.details.filter(d => !d.static) };
    DB.audit('PRINT_PREVIEW', 'documents', `${rec.title} · ${sheets.length} sheet(s) · ${rec.opts.paper} ${rec.opts.orientation}`); DB.save();
    try { if ($('#modal-root')?.children.length) Modal.close(); } catch (e) { }
    App.nav('/print/' + id);
  },
  /** Open a registered document: Print.show('receipt', payId). */
  show(type, ...args) {
    const f = this.doc[type]; if (!f) return;
    let r = null; try { r = f.apply(this.doc, args); } catch (e) { console.error(e); }
    if (!r || !r.sheets?.length) return toast(r?.empty || 'নথিটি পাওয়া যায়নি।', 'error');
    this.preview(r.title, r.sheets, { ...(r.opts || {}), re: ['Print.doc.' + type, ...args] });
  },
  /** Re-buildable documents used from many places (each returns {title, sheets, opts}). */
  doc: {
    admissionReceipt(id) { const a = DB.s.admissions.find(x => x.id === id); return a && { title: 'ভর্তির রসিদ', sheets: Print.admissionReceipt(a) }; },
    receipt(id) { const p = DB.s.payments.find(x => x.id === id); return p && { title: 'টাকার রসিদ', sheets: Print.receipt(p) }; },
    voucher(id) { const v = DB.s.journal.find(x => x.id === id); return v && { title: 'ভাউচার', sheets: Print.voucher(v) }; },
    installment(id) { const p = (DB.s.installmentPlans || []).find(x => x.id === id); return p && { title: 'কিস্তি পরিকল্পনা', sheets: Print.installmentSchedule(p) }; },
    marksheet(sid, examId, title) { const st = DB.student(sid); return st && DB.exam(examId) && { title: title || 'নম্বরপত্র', sheets: Print.marksheet(st, examId) }; },
    idCards(ids, orient = 'h', kind = 'student', title) {
      const list = (ids || []).map(id => kind === 'employee' ? DB.emp(id) : DB.student(id)).filter(Boolean);
      return list.length && { title: title || (kind === 'employee' ? 'কর্মচারী আইডি' : 'আইডি কার্ড'), sheets: Print.idCards(list, orient === 'v' ? 'v' : 'h', { kind }) };
    },
    certificate(serial) { const c = DB.s.certificates.find(x => x.serial === serial); return c && { title: 'সনদ', sheets: Print.certificate(c) }; },
    progress(sid, session) { const st = DB.student(sid); return st && typeof PrintStudio !== 'undefined' && { title: 'অগ্রগতি প্রতিবেদন', sheets: PrintStudio.gen.progressReport(st, session || DB.session()) }; },
    transcript(sid, session) { const st = DB.student(sid); return st && typeof PrintStudio !== 'undefined' && { title: 'ট্রান্সক্রিপ্ট', sheets: PrintStudio.gen.transcript(st, session || DB.session()) }; },
    tabulation(classId, examId) { return typeof PrintStudio !== 'undefined' && { title: 'টেবুলেশন শিট', sheets: PrintStudio.gen.tabulation(classId, examId), opts: { orientation: 'landscape' } }; },
  },
  /** Keep at most 30 recipes in this tab. */
  prune() {
    try { const ks = Object.keys(sessionStorage).filter(k => k.startsWith(this.KEY)); if (ks.length > 30) ks.map(k => [k, JSON.parse(sessionStorage.getItem(k) || '{}').at || 0]).sort((a, b) => a[1] - b[1]).slice(0, ks.length - 30).forEach(([k]) => sessionStorage.removeItem(k)); } catch (e) { }
  },
  rec(id) { if (this._recs[id]) return this._recs[id]; try { const r = JSON.parse(sessionStorage.getItem(this.KEY + id) || 'null'); if (r) this._recs[id] = r; return r; } catch (e) { return null; } },
  /** Run a recipe's re-build call and collect the sheets it produces. */
  rebuild(rec) {
    const [path, ...args] = rec.re || [];
    if (!/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*){0,3}$/.test(path || '')) return null;
    const parts = path.split('.'); let obj = null, fn;
    try { fn = new Function(`return typeof ${parts[0]} === 'undefined' ? undefined : ${parts[0]}`)(); } catch (e) { return null; }
    for (const p of parts.slice(1)) { obj = fn; fn = fn?.[p]; }
    if (typeof fn !== 'function') return null;
    this._cap = []; let out, cap;
    try { out = fn.apply(obj, args); } catch (e) { console.error(e); } finally { cap = this._cap; this._cap = null; }
    if (out && Array.isArray(out.sheets)) return { title: out.title || rec.title, sheets: out.sheets, opts: { ...rec.opts, ...(out.opts || {}) } };
    if (Array.isArray(out) && out.length && typeof out[0] === 'string') return { title: rec.title, sheets: out, opts: rec.opts };
    const c = cap[cap.length - 1]; return c ? { title: c.title, sheets: c.sheets, opts: { ...rec.opts, ...(c.opts || {}) } } : null;
  },
  /** Route renderer for /print/<id> (called by App.render). */
  route(id) {
    const view = $('#view'), top = $('#topbar'), rec = this.rec(id), school = DB.s.school.nameBn || DB.s.school.name;
    if (top) top.innerHTML = '';
    let doc = null;
    if (rec && rec.mod && App.session && !App.perm(rec.mod, 'print')) doc = null;
    else if (rec && this._mem[id]) doc = { title: rec.title, sheets: this._mem[id], opts: rec.opts };
    else if (rec && rec.re) { doc = this.rebuild(rec); if (doc) this._mem = { [id]: doc.sheets }; }
    const back = `<button class="btn btn-ghost btn-sm" onclick="Print.back()">${icon('arrow-left')} ফিরে যান</button>`;
    if (!doc || !doc.sheets?.length) {
      this._cur = null; document.title = `মুদ্রণ — ${school}`;
      view.innerHTML = `<div class="min-h-[70vh] flex items-center justify-center p-4"><div class="card max-w-md w-full p-6 text-center"><div class="mx-auto w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mb-3">${icon('file-x', 'w-6 h-6')}</div>
        <h2 class="text-lg font-bold">নথিটি আর দেখানো যাচ্ছে না</h2><p class="text-slate-500 mt-1 mb-4">${rec ? 'নথিটি নতুন করে তৈরি করা যায়নি। আগের পাতায় ফিরে আবার মুদ্রণ খুলুন।' : 'এই মুদ্রণ-লিংকটি শুধু যে ট্যাবে খোলা হয়েছিল সেখানেই কাজ করে।'}</p>${back}</div></div>`;
      return App.icons();
    }
    this._cur = { id, rec, sheets: doc.sheets, opts: doc.opts, title: doc.title };
    document.title = `${doc.title} — ${school}`;
    const n = doc.sheets.length;
    view.innerHTML = `<div class="pv-bar"><div class="pv-in">${back}<div class="pv-t"><div class="font-bold truncate">${esc(doc.title)}</div><div class="text-slate-500">${bnNum(n)} পৃষ্ঠা · ${this.paperBn(doc.opts)}</div></div>
        <div class="pv-acts"><button class="btn btn-primary btn-sm" onclick="Print.go()">${icon('printer')} মুদ্রণ / পিডিএফ হিসেবে সংরক্ষণ</button></div></div></div>
      <div class="pv-stage"><div id="print-preview" class="flex flex-col items-center gap-6"></div></div>`;
    this.css();
    const [wmm, hmm] = this.dims(doc.opts); this.fill(doc.sheets, wmm, hmm);
    App.icons();
  },
  css() {
    if ($('#print-view-style')) return;
    const st = document.createElement('style'); st.id = 'print-view-style';
    st.textContent = `.pv-bar{position:sticky;top:0;z-index:30;background:var(--surface,#fff);border-bottom:1px solid #cbd5e1;padding:.6rem 1rem}
      .pv-in{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem;max-width:80rem;margin:0 auto}.pv-t{flex:1;min-width:10rem}.pv-acts{display:flex;flex-wrap:wrap;gap:.5rem}
      .pv-stage{background:#e2e8f0;padding:1.5rem 1rem;min-height:80vh;overflow-x:hidden}
      html[data-mode="dark"] .pv-stage{background:#1e293b}@media (max-width:640px){.pv-stage{padding:1rem .5rem}.pv-acts{width:100%}.pv-acts .btn{flex:1;justify-content:center}}`;
    document.head.appendChild(st);
  },
  fill(sheets, wmm, hmm) {
    const host = $('#print-preview'); if (!host) return;
    const pxW = wmm * 3.7795, pxH = hmm * 3.7795, scale = Math.min(1, Math.min(host.clientWidth || 800, 1100) / pxW);
    host.innerHTML = sheets.map(s => `<div style="width:${pxW * scale}px;height:${pxH * scale}px;flex-shrink:0;overflow:hidden;background:#fff" class="shadow-xl"><div style="width:${pxW}px;transform:scale(${scale});transform-origin:top left">${s}</div></div>`).join('');
  },
  /** Leave the print view: back to the page (and detail page) it was opened from. */
  back() {
    const rec = this._cur?.rec || this.rec((location.pathname.match(/^\/print\/([\w-]+)/) || [])[1]), b = this._back;
    const from = rec?.from ? App.clean(rec.from) : '';
    const target = from && !from.startsWith('/print/') ? from : (App.session ? App.href(ROLES[App.session.role]?.portal || 'public') : '/');
    this._cur = null; this._mem = {};
    App.nav(target);
    if (b && b.hash === target && b.details.length && $('#page-host')) { App.details = b.details; App.showDetail(true); }
    this._back = null;
  },
  /* No direct "PDF download" button: html2canvas (1.4.1) + jsPDF was tried and it misplaces Bangla glyphs
     vertically (text slides onto rules and underlines), so PDFs are made with the browser's own
     "Save as PDF" in the print dialog, which keeps the exact layout and shaping. */
  /** Put the sheets into #print-root with the exact @page size (no browser margins), so the print dialog
      needs no settings. Also runs on Ctrl+P while the print view is open (beforeprint). */
  stage(list, o = {}) {
    let st = $('#page-size'); if (!st) { st = document.createElement('style'); st.id = 'page-size'; document.head.appendChild(st); }
    st.textContent = `@page { size: ${this.PAPERS[o.paper] ? o.paper : 'A4'} ${o.orientation === 'landscape' ? 'landscape' : 'portrait'}; margin: 0; } @media print { html, body { margin: 0 !important; padding: 0 !important; } }`;
    $('#print-root').innerHTML = list.join('');
  },
  go(sheets) {
    const cur = this._cur || {}, list = sheets || cur.sheets || [], o = cur.opts || {};
    this.stage(list, o);
    DB.audit('PRINT', 'documents', `Printed ${list.length} sheet(s) on ${o.paper || 'A4'} ${o.orientation || 'portrait'}`); DB.save();
    setTimeout(() => window.print(), 60);
  },

  /* ---------- shared fragments ---------- */
  logo(mm = 16) {
    const s = DB.s.school;
    return s.logo ? `<img src="${s.logo}" style="width:${mm}mm;height:${mm}mm;object-fit:contain">` : `<div style="width:${mm}mm;height:${mm}mm;border-radius:50%;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:${mm * .62}pt;box-shadow:0 0 0 .6mm #fff,0 0 0 1mm var(--accent)">${esc(s.shortName.slice(0, 3))}</div>`;
  },
  header(subtitle) {
    const s = DB.s.school;
    return `<div style="display:flex;align-items:center;gap:5mm;border-bottom:.6mm solid var(--brand);padding-bottom:3mm;margin-bottom:5mm">
      ${this.logo(16)}
      <div style="flex:1;text-align:center"><div class="doc-title" style="font-size:18pt;font-weight:700;color:var(--brand-ink)">${esc(s.nameBn || s.name)}</div>${s.nameBn ? `<div style="font-size:11pt;color:var(--brand)">${esc(s.name)}</div>` : ''}
      <div style="font-size:8.5pt;color:#475569">${[esc(s.address || ''), s.eiin ? 'ইআইআইএন ' + bnNum(s.eiin) : '', s.founded ? 'স্থাপিত ' + bnNum(s.founded) : '', esc(s.phone || '')].filter(Boolean).join(' · ')}</div>
      ${subtitle ? `<div style="display:inline-block;font-size:10pt;font-weight:700;margin-top:1.5mm;letter-spacing:.06em;text-transform:uppercase;color:#fff;background:var(--brand);padding:.6mm 4mm;border-radius:1mm">${subtitle}</div>` : ''}</div><div style="width:16mm"></div></div>`;
  },
  /** Signature block. Principal labels use the principal's signature; Director/Chairman labels use the director's;
      other roles (Accountant, Exam Controller…) get a blank line to sign by hand. */
  signature(label = 'Principal') {
    const s = DB.s.school, director = /Director|Chairman|পরিচালক|^সভাপতি$/i.test(label), principal = /Principal|অধ্যক্ষ/i.test(label);
    const img = director ? s.directorSignature : principal ? s.signature : null, name = director ? (s.directorNameBn || s.directorName) : principal ? (s.principalNameBn || s.principalName) : '';
    const sig = img ? `<img src="${img}" style="height:12mm;display:block;margin:0 auto">` : name ? `<div style="font-family:'Brush Script MT',cursive;font-size:16pt;color:#1e3a8a;height:12mm;line-height:12mm;white-space:nowrap;overflow:hidden">${esc(name)}</div>` : '<div style="height:12mm"></div>';
    return `<div style="text-align:center;width:50mm">${sig}<div style="border-top:.25mm solid #0f172a;font-size:8pt;padding-top:1mm">${name ? esc(name) + '<br>' : ''}${this.roleBn(label)}</div></div>`;
  },
  stamp() { if (DB.s.school.stampImage) return `<img src="${DB.s.school.stampImage}" style="width:26mm;height:26mm;object-fit:contain;opacity:.9;transform:rotate(-8deg)">`; return `<div style="width:24mm;height:24mm;border:.6mm double #b91c1c;border-radius:50%;color:#b91c1c;display:flex;align-items:center;justify-content:center;text-align:center;font-size:5.5pt;font-weight:800;transform:rotate(-12deg);padding:2mm;box-sizing:border-box;opacity:.85">${esc(DB.s.school.stampText)}</div>`; },
  photo(st, w, h) {
    const inner = st.photo ? `<img src="${st.photo}">` : `<span style="font-size:${Math.round(h * 1.2)}pt">${esc(U.initials(st.name))}</span>`;
    return `<div class="photo" style="width:${w}mm;height:${h}mm;border-radius:1.5mm;background:${st.photo ? '#e2e8f0' : U.color(st.name)}">${inner}</div>`;
  },

  /* ---------- CR80 ID cards (student & employee) on any paper, optional duplex back side ---------- */
  /** Fit fixed-size items (W × H mm) on a page inside the margins; `per` caps the count per sheet. */
  fit(W, H, o = {}) {
    const [PW, PH] = this.dims(o), M = o.margin == null || o.margin === '' ? 8 : Math.max(0, +o.margin), gap = o.gap ?? 6, foot = o.footMm ?? 6;
    const cols = Math.max(1, Math.floor((PW - 2 * M + gap) / (W + gap))), rows = Math.max(1, Math.floor((PH - 2 * M - foot + gap) / (H + gap)));
    const cap = cols * rows, per = Math.max(1, Math.min(+o.per || cap, cap)), c = Math.min(cols, per), r = Math.ceil(per / c);
    const left = (PW - (c * W + (c - 1) * gap)) / 2, top = M + (PH - 2 * M - foot - (r * H + (r - 1) * gap)) / 2;
    return { PW, PH, cols: c, rows: r, cap, per, pos: k => [left + (k % c) * (W + gap), top + Math.floor(k / c) * (H + gap)] };
  },
  /** opts: {kind:'student'|'employee', paper, orientation, perSheet, margin, back, validTill, crop}. Back sheets are mirrored for long-edge duplex. */
  idCards(people, orientation = 'h', opts = {}) {
    const v = orientation === 'v', W = v ? 53.98 : 85.6, H = v ? 85.6 : 53.98, o = { paper: opts.paper || 'A4', orientation: opts.orientation === 'landscape' ? 'landscape' : 'portrait' };
    const g = this.fit(W, H, { ...o, margin: opts.margin, per: opts.perSheet }), kind = opts.kind === 'employee' ? 'employee' : 'student', n = Math.ceil(people.length / g.per), sheets = [];
    this._layout = { per: g.per, cap: g.cap, sheets: n * (opts.back ? 2 : 1) };
    const cls = `cr80 idc ${v ? 'v' : 'h'}`, crop = (x, y) => opts.crop === false ? '' : this.cropMarks(x, y, W, H);
    const foot = (i, back) => `<div style="position:absolute;bottom:3mm;left:0;right:0;text-align:center;font-size:7pt;color:#94a3b8">${esc(DB.s.school.nameBn || DB.s.school.name)} · ${kind === 'employee' ? 'কর্মচারী' : 'শিক্ষার্থী'} পরিচয়পত্র${back ? ' · পেছনের পিঠ' : ''} · শিট ${bnNum(i + 1)} / ${bnNum(n)}</div>`;
    for (let i = 0, p = 0; i < people.length; i += g.per, p++) {
      let f = '', b = '';
      people.slice(i, i + g.per).forEach((x, k) => {
        const [cx, cy] = g.pos(k), bx = g.PW - cx - W;
        f += `<div class="${cls}" style="left:${cx}mm;top:${cy}mm">${this.idCard(x, { ...opts, kind, orient: v ? 'v' : 'h' })}</div>${crop(cx, cy)}`;
        if (opts.back) b += `<div class="${cls}" style="left:${bx}mm;top:${cy}mm">${this.idBack(x, { ...opts, kind, orient: v ? 'v' : 'h' })}</div>${crop(bx, cy)}`;
      });
      sheets.push(`${this.sheet(o)}${f}${foot(p)}</div>`);
      if (opts.back) sheets.push(`${this.sheet(o)}${b}${foot(p, true)}</div>`);
    }
    return sheets;
  },
  /** Normalised content for a student or employee card. Values are escaped HTML. */
  idModel(p, kind) {
    const s = DB.s.school, mono = t => `<span style="font-family:Inter,system-ui,sans-serif;letter-spacing:.02em">${esc(t)}</span>`;
    if (kind === 'employee') {
      const t = p.kind === 'Teacher', camp = DB.campus(p.campusId), dept = p.dept || p.type || '';
      return { title: t ? 'শিক্ষক পরিচয়পত্র' : 'কর্মচারী পরিচয়পত্র', band: 'var(--brand-ink)', name: pn(p) || p.name || '', nameEn: pn(p) !== p.name ? p.name || '' : '', role: bn(p.designation || (t ? 'Teacher' : 'Staff')),
        rows: [['আইডি', mono(p.id)], ['মোবাইল', esc(U.bn(p.phone || '—'))], dept || !multiCampus() ? ['বিভাগ', dept ? esc(bn(dept)) : '—'] : ['ক্যাম্পাস', esc(camp?.short || camp?.name || '—')]],
        blood: p.blood, code: p.id, qr: verifyUrl('employee', p.id), emergency: [p.emergencyName || 'জরুরি যোগাযোগ', p.emergency || p.phone || s.phone],
        rules: ['প্রতিষ্ঠানে দায়িত্ব পালনকালে কার্ডটি দৃশ্যমানভাবে পরিধান করুন।', 'কার্ডটি হস্তান্তরযোগ্য নয়; অন্য কেউ ব্যবহার করতে পারবেন না।', 'হারিয়ে গেলে অবিলম্বে প্রশাসনিক দপ্তরকে জানান।', 'চাকরি শেষে বা মেয়াদ উত্তীর্ণ হলে কার্ডটি ফেরত দিন।'] };
    }
    const c = DB.cls(p.classId) || {}, g = DB.guardiansOf(p.id)[0];
    return { title: 'শিক্ষার্থী পরিচয়পত্র', band: 'var(--brand)', name: pn(p) || p.name || '', nameEn: pn(p) !== p.name ? p.name || '' : '', role: '',
      chips: [['শ্রেণি', esc(c.name || '—')], ['শাখা', esc(p.section || '—')], ['রোল', bnNum(p.roll)]],
      rows: [['আইডি', mono(p.id)], ['অভিভাবক', esc(U.bn(g?.phone || p.emergency || '—'))], ...(p.dob ? [['জন্মতারিখ', U.fmtDate(p.dob)]] : [])],
      blood: p.blood, code: p.regNo || p.id, qr: verifyUrl('student', p.id),
      emergency: [g ? pn(g) : (p.fatherNameBn || p.fatherName || 'অভিভাবক'), g?.phone || p.emergency || ''],
      rules: ['প্রতিষ্ঠানে অবস্থানকালে কার্ডটি সবসময় সঙ্গে রাখতে হবে।', 'কার্ডটি হস্তান্তরযোগ্য নয়; অন্য কেউ ব্যবহার করতে পারবে না।', 'হারিয়ে গেলে দ্রুত অফিসে জানাতে হবে; নতুন কার্ডের জন্য নির্ধারিত ফি প্রযোজ্য।', 'প্রতিষ্ঠান ত্যাগের সময় কার্ডটি ফেরত দিতে হবে।'] };
  },
  /** Barcode stretched into an exact box (mm). */
  bar(code, w, h) {
    let svg = barcode(String(code || '-'), { height: 40, width: 1.4, displayValue: false });
    if (!/^<svg/.test(svg)) return `<div style="width:${w}mm;height:${h}mm;overflow:hidden;font:6pt monospace">${esc(code)}</div>`;
    const vw = (svg.match(/^<svg[^>]*?\swidth="([\d.]+)/) || [])[1], vh = (svg.match(/^<svg[^>]*?\sheight="([\d.]+)/) || [])[1];
    if (vw && vh && !/^<svg[^>]*viewBox/.test(svg)) svg = svg.replace('<svg ', `<svg viewBox="0 0 ${vw} ${vh}" `);
    return `<div style="width:${w}mm;height:${h}mm;overflow:hidden">${svg.replace('<svg ', `<svg preserveAspectRatio="none" style="width:${w}mm;height:${h}mm;display:block" `)}</div>`;
  },
  qrMm(text, mm) { return qr(text, Math.round(mm * 3.7795)); },
  /** Logo on a white disc (for coloured bands). */
  logoDisc(mm) { return `<div style="width:${mm}mm;height:${mm}mm;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden">${this.logo(+(mm - 1.1).toFixed(2))}</div>`; },
  idPhoto(p, w, h) {
    const inner = p.photo ? `<img src="${p.photo}" style="width:100%;height:100%;object-fit:cover;display:block">` : `<span style="font-family:Inter,system-ui,sans-serif;font-size:${Math.round(h * .9)}pt">${esc(U.initials(p.name))}</span>`;
    return `<div style="width:${w}mm;height:${h}mm;border-radius:1.6mm;overflow:hidden;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;background:${p.photo ? '#e2e8f0' : U.color(p.name)};border:.45mm solid #fff;box-shadow:0 0 0 .35mm var(--brand);box-sizing:border-box;flex-shrink:0">${inner}</div>`;
  },
  /** Small principal signature for cards. */
  miniSig(hMm = 4.6, fs = 4.8, label = 'অধ্যক্ষ') {
    const s = DB.s.school, name = s.principalNameBn || s.principalName || '';
    const img = s.signature ? `<img src="${s.signature}" style="height:${hMm}mm;max-width:100%;display:block;margin:0 auto;object-fit:contain">` : `<div style="height:${hMm}mm;line-height:${hMm}mm;font-family:'Brush Script MT',cursive;font-size:${(hMm * (name.length > 14 ? 1.2 : 1.5)).toFixed(1)}pt;color:#1e3a8a;white-space:nowrap;overflow:hidden">${esc(name)}</div>`;
    return `<div style="text-align:center">${img}<div style="border-top:.2mm solid #334155;font-size:${fs}pt;line-height:1.3;color:#334155">${label}</div></div>`;
  },
  idNameFs(t, base) { const n = String(t || '').length; return +(base * (n > 28 ? .7 : n > 22 ? .8 : n > 16 ? .9 : 1)).toFixed(2); },
  /* ---------- ID card templates (Root User → Print Studio → কার্ডের নকশা; DB.s.config.idCard.{student,employee}) ---------- */
  ID_TPLS: {
    classic: ['ক্লাসিক', 'রঙিন শিরোনাম-ব্যান্ড, অ্যাকসেন্ট ফিতা ও তথ্যের ঘর'],
    modern: ['আধুনিক', 'গ্রেডিয়েন্ট পাশ-প্যানেল, গোল ছবি ও পরিচ্ছন্ন তথ্য'],
    minimal: ['মিনিমাল', 'সাদা পটভূমি, সরু রেখা, শুধু প্রয়োজনীয় তথ্য'],
    board: ['বোর্ড ধাঁচ', 'শিক্ষা বোর্ডের মতো দ্বৈত সীমানা, সবুজ-লাল রং ও সারণি'],
    ribbon: ['রিবন', 'তির্যক রঙিন ফিতা ও ওপরে ভাসমান ছবি'],
    elegant: ['এলিগ্যান্ট', 'গাঢ় পটভূমি ও সোনালি অ্যাকসেন্ট'],
  },
  /** Default colours of templates that have their own palette (otherwise the theme's brand / accent). */
  ID_DEF: { board: ['#006a4e', '#da291c'], elegant: ['#1e3a5f', '#c9a227'] },
  ID_FONTS: [['', 'থিমের ফন্ট'], ["'Noto Serif Bengali'", 'নোটো সেরিফ বাংলা'], ["'Hind Siliguri'", 'হিন্দ শিলিগুড়ি'], ["'Noto Sans Bengali'", 'নোটো স্যান্স বাংলা'], ["'Tiro Bangla'", 'তিরো বাংলা']],
  /** Card design for a kind ('student' | 'employee'); `over` = unsaved values from the live preview. */
  idCfg(kind, over) {
    const all = DB.s.config?.idCard || {}, c = { ...(all[kind === 'employee' ? 'employee' : 'student'] || {}), ...(over || {}) };
    const tpl = this.ID_TPLS[c.tpl] ? c.tpl : 'classic', d = this.ID_DEF[tpl] || [], hex = x => (/^#[0-9a-f]{6}$/i.test(x || '') ? x : '');
    return { tpl, primary: hex(c.primary) || d[0] || '', accent: hex(c.accent) || d[1] || '', font: this.ID_FONTS.some(f => f[0] && f[0] === c.font) ? c.font : '' };
  },
  mixHex(a, b, t) { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); },
  /** CSS variables that re-colour a card (brand, ink, tint, accent, font). */
  idVars(cfg) {
    const v = [];
    if (cfg.primary) v.push(`--brand:${cfg.primary}`, `--brand-ink:${this.mixHex(cfg.primary, '#000000', .28)}`, `--brand-50:${this.mixHex(cfg.primary, '#ffffff', .9)}`);
    if (cfg.accent) v.push(`--accent:${cfg.accent}`);
    if (cfg.font) v.push(`--font-sans:${cfg.font},system-ui,sans-serif`);
    return v.join(';');
  },
  idWrap(html, cfg) { const v = this.idVars(cfg); return v ? `<div style="position:absolute;left:0;top:0;right:0;bottom:0;${v}">${html}</div>` : html; },
  /** Photo box with a chosen corner radius and ring colour. */
  idPic(p, w, h, r = '1.6mm', ring = 'var(--brand)') {
    const inner = p.photo ? `<img src="${p.photo}" style="width:100%;height:100%;object-fit:cover;display:block">` : `<span style="font-family:Inter,system-ui,sans-serif;font-size:${Math.round(Math.min(w, h) * .8)}pt">${esc(U.initials(p.name))}</span>`;
    return `<div style="width:${w}mm;height:${h}mm;border-radius:${r};overflow:hidden;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;background:${p.photo ? '#e2e8f0' : U.color(p.name)};border:.5mm solid #fff;box-shadow:0 0 0 .35mm ${ring};box-sizing:border-box;flex-shrink:0">${inner}</div>`;
  },
  /** Front of a CR80 card in the configured template. o: {kind, orient:'h'|'v', validTill, qr, photo, cfg}. */
  idCard(p, o = {}) {
    const cfg = this.idCfg(o.kind, o.cfg);
    return this.idWrap(cfg.tpl === 'classic' ? this.idClassic(p, o) : this.idTpl(p, o, cfg), cfg);
  },
  /** The five designed templates (the classic one is idClassic). */
  idTpl(p, o, cfg) {
    const m = this.idModel(p, o.kind), s = DB.s.school, v = o.orient === 'v', t = cfg.tpl, valid = U.fmtDate(o.validTill || `${new Date().getFullYear()}-12-31`);
    const ell = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis', mono = 'font-family:Inter,system-ui,sans-serif';
    const schName = s.nameBn || s.name || '', sch = esc(schName), schFs = schName.length > 34 ? 6.2 : schName.length > 24 ? 6.9 : 7.6;
    const showQr = o.qr !== false, photoOn = o.photo !== false, dark = t === 'elegant';
    const ink = dark ? '#f8fafc' : '#0f172a', muted = dark ? '#cbd5e1' : '#64748b', hi = dark ? 'var(--accent)' : 'var(--brand-ink)';
    const lines = [...(m.chips ? [['শ্রেণি', `${m.chips[0][1]} · শাখা ${m.chips[1][1]} · রোল ${m.chips[2][1]}`]] : []), ...m.rows];
    const rows = (fs, n, table) => lines.slice(0, n).map(([k, val]) => `<div style="display:flex;gap:1.2mm;font-size:${fs}pt;line-height:1.5;min-width:0;${table ? 'border-bottom:.2mm dotted #94a3b8' : ''}"><span style="color:${muted};flex-shrink:0;${table ? 'width:12mm' : ''}">${k}${table ? '' : ':'}</span><b style="${ell};color:${ink};font-weight:700">${val}</b></div>`).join('');
    const blood = m.blood ? `<span style="display:inline-block;background:${dark ? 'rgba(255,255,255,.14)' : '#fee2e2'};color:${dark ? '#fecaca' : '#b91c1c'};border-radius:1mm;padding:0 1mm;font-size:5.2pt;line-height:1.6;white-space:nowrap">রক্ত <b style="${mono};font-size:6.2pt">${esc(m.blood)}</b></span>` : '';
    const name = (fs, center) => `<div style="font-size:${this.idNameFs(m.name, fs)}pt;font-weight:700;color:${hi};line-height:1.25;${ell}${center ? ';text-align:center' : ''}">${esc(m.name)}</div>${m.nameEn ? `<div style="${mono};font-size:${(fs * .52).toFixed(1)}pt;color:${muted};text-transform:uppercase;letter-spacing:.05em;${ell}${center ? ';text-align:center' : ''}">${esc(m.nameEn)}</div>` : ''}${m.role ? `<div style="font-size:${(fs * .7).toFixed(1)}pt;font-weight:700;color:${dark ? '#e2e8f0' : 'var(--brand)'};${ell}${center ? ';text-align:center' : ''}">${esc(m.role)}</div>` : ''}`;
    const qrBox = mm => (showQr ? `<div style="background:#fff;padding:.5mm;border-radius:.8mm;line-height:0;flex-shrink:0;align-self:flex-start">${this.qrMm(m.qr, mm)}</div>` : '');
    const bar = (w, h) => `<div style="line-height:1;min-width:0"><div style="background:#fff;display:inline-block;padding:${dark ? '.4mm' : '0'};border-radius:.6mm">${this.bar(m.code, w, h)}</div><div style="${mono};font-size:4.3pt;color:${muted};letter-spacing:.06em;margin-top:.2mm">${esc(m.code)}</div></div>`;
    const validity = (right) => `<div style="line-height:1.2;white-space:nowrap;${right ? 'text-align:right' : ''}"><div style="font-size:4.6pt;color:${muted}">মেয়াদ</div><div style="font-size:6pt;font-weight:700;color:${hi}">${valid}</div></div>`;
    const sig = w => `<div style="width:${w}mm;${dark ? 'background:#fff;border-radius:.8mm;padding:.3mm .6mm;box-sizing:border-box' : ''}">${this.miniSig(3.6, 4.5)}</div>`;
    const root = bg => `position:absolute;left:0;top:0;right:0;bottom:0;overflow:hidden;display:flex;flex-direction:column;font-family:var(--font-sans,'Noto Serif Bengali',system-ui,sans-serif);color:${ink};background:${bg}`;
    const title = (bg, fg) => `<span style="display:inline-block;background:${bg};color:${fg};font-size:5.2pt;font-weight:700;border-radius:.8mm;padding:0 1.4mm;line-height:1.7;white-space:nowrap">${m.title}</span>`;
    const darkBg = 'linear-gradient(135deg,var(--brand) 0%,var(--brand-ink) 100%)';

    if (t === 'minimal') {
      const head = `<div style="height:1.2mm;flex-shrink:0;background:var(--brand)"></div>`;
      if (!v) return `<div style="${root('#fff')}">${head}
        <div style="display:flex;align-items:center;gap:1.8mm;padding:1.6mm 3mm 1.2mm;border-bottom:.2mm solid #e2e8f0">${this.logo(6.4)}<div style="flex:1;min-width:0;font-size:${schFs}pt;font-weight:700;color:var(--brand-ink);${ell}">${sch}</div><div style="font-size:5pt;color:${muted};white-space:nowrap">${m.title}</div></div>
        <div style="flex:1;min-height:0;display:flex;gap:2.6mm;padding:2mm 3mm 1mm">${photoOn ? `<div style="display:flex;flex-direction:column;align-items:center;gap:.8mm">${this.idPic(p, 17, 21, '1.2mm', '#cbd5e1')}${blood}</div>` : ''}
          <div style="flex:1;min-width:0">${name(9.2)}<div style="margin-top:1mm">${rows(5.9, 4)}</div></div>${qrBox(12)}</div>
        <div style="height:7mm;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:2mm;padding:0 3mm;border-top:.2mm solid #e2e8f0">${showQr ? `<div style="${mono};font-size:5.2pt;color:${muted};letter-spacing:.06em">${esc(m.code)}</div>` : bar(26, 3.2)}${validity(true)}${sig(14)}</div></div>`;
      return `<div style="${root('#fff')}">${head}
        <div style="display:flex;flex-direction:column;align-items:center;gap:.8mm;padding:2mm 2.6mm 1.4mm;border-bottom:.2mm solid #e2e8f0;text-align:center">${this.logo(7)}<div style="font-size:${Math.min(schFs, 6.8)}pt;font-weight:700;color:var(--brand-ink);line-height:1.2;max-height:5.6mm;overflow:hidden">${sch}</div><div style="font-size:4.8pt;color:${muted}">${m.title}</div></div>
        <div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;gap:1mm;padding:2mm 3mm 1mm;width:100%;box-sizing:border-box">${photoOn ? this.idPic(p, 19, 23, '1.2mm', '#cbd5e1') : ''}<div style="width:100%;text-align:center">${name(8.6, true)}</div>${blood}<div style="width:100%">${rows(5.6, 3)}</div>
          <div style="width:100%;margin-top:auto;display:flex;align-items:flex-end;justify-content:space-between;gap:1.5mm">${validity()}${sig(15)}${qrBox(10.5)}</div></div></div>`;
    }

    if (t === 'board') {
      const frame = `<div style="position:absolute;left:1mm;top:1mm;right:1mm;bottom:1mm;border:.25mm solid var(--accent);border-radius:1.2mm;pointer-events:none"></div>`;
      const disc = `<div style="position:absolute;left:50%;top:56%;width:${v ? 30 : 26}mm;height:${v ? 30 : 26}mm;margin:-${v ? 15 : 13}mm 0 0 -${v ? 15 : 13}mm;border-radius:50%;background:var(--accent);opacity:.06"></div>`;
      const headTxt = `<div style="font-size:${schFs}pt;font-weight:700;color:var(--brand);line-height:1.2;${ell}">${sch}</div><div style="font-size:4.6pt;color:#334155">${[s.eiin ? 'ইআইআইএন ' + bnNum(s.eiin) : '', esc(s.address || '')].filter(Boolean).join(' · ')}</div><div style="margin-top:.4mm"><span style="font-size:5.8pt;font-weight:700;color:var(--accent);border-bottom:.3mm solid var(--accent)">${m.title}</span></div>`;
      const outer = root('#fff') + ';border:.7mm solid var(--brand);border-radius:2.4mm;box-sizing:border-box';
      if (!v) return `<div style="${outer}">${frame}${disc}
        <div style="display:flex;align-items:center;gap:2mm;padding:2mm 3mm .8mm;position:relative">${this.logo(8)}<div style="flex:1;min-width:0;text-align:center;line-height:1.3">${headTxt}</div><div style="width:8mm"></div></div>
        <div style="flex:1;min-height:0;display:flex;gap:2.4mm;padding:.8mm 3mm 0;position:relative">${photoOn ? `<div style="display:flex;flex-direction:column;align-items:center;gap:.6mm">${this.idPic(p, 16, 19.5, '0', '#334155')}${blood}</div>` : ''}
          <div style="flex:1;min-width:0">${[['নাম', `<span style="color:var(--brand)">${esc(m.name)}</span>`], ...lines].slice(0, 5).map(([k, val]) => `<div style="display:flex;gap:1mm;font-size:5.8pt;line-height:1.5;border-bottom:.2mm dotted #94a3b8;min-width:0"><span style="color:#475569;width:11mm;flex-shrink:0">${k}</span><b style="${ell}">${val}</b></div>`).join('')}</div>${qrBox(11.5)}</div>
        <div style="display:flex;align-items:flex-end;justify-content:space-between;padding:0 3.4mm 2.2mm;position:relative">${validity()}${showQr ? '' : bar(24, 3)}${sig(15)}</div></div>`;
      return `<div style="${outer}">${frame}${disc}
        <div style="display:flex;flex-direction:column;align-items:center;padding:2.2mm 2.6mm .6mm;text-align:center;line-height:1.3;position:relative">${this.logo(7.5)}<div style="width:100%;margin-top:.5mm">${headTxt}</div></div>
        <div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;gap:1mm;padding:.8mm 3mm 0;position:relative">${photoOn ? this.idPic(p, 18, 22, '0', '#334155') : ''}${blood}
          <div style="width:100%">${[['নাম', `<span style="color:var(--brand)">${esc(m.name)}</span>`], ...lines].slice(0, 4).map(([k, val]) => `<div style="display:flex;gap:1mm;font-size:5.6pt;line-height:1.5;border-bottom:.2mm dotted #94a3b8;min-width:0"><span style="color:#475569;width:10mm;flex-shrink:0">${k}</span><b style="${ell}">${val}</b></div>`).join('')}</div></div>
        <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:1mm;padding:0 3mm 2.4mm;position:relative">${validity()}${sig(14)}${qrBox(10)}</div></div>`;
    }

    if (t === 'ribbon' && !v) {
      return `<div style="${root('#fff')}">
        <div style="height:15mm;flex-shrink:0;background:linear-gradient(100deg,var(--brand) 0%,var(--brand) 64%,var(--accent) 64%,var(--accent) 67%,var(--brand-ink) 67%);color:#fff;display:flex;align-items:center;gap:2mm;padding:0 27mm 0 3mm">${this.logoDisc(8.4)}<div style="min-width:0;line-height:1.25"><div style="font-size:${schFs}pt;font-weight:700;${ell}">${sch}</div><div style="font-size:5pt;opacity:.9">${m.title}</div></div></div>
        ${photoOn ? `<div style="position:absolute;right:4mm;top:5mm">${this.idPic(p, 19, 23, '1.6mm', 'var(--accent)')}</div>` : ''}
        ${showQr ? `<div style="position:absolute;right:5.5mm;top:30mm">${qrBox(11.5)}</div>` : ''}
        <div style="flex:1;min-height:0;display:flex;flex-direction:column;padding:1.8mm 27mm 1mm 3mm">${name(9.4)}<div style="margin:.6mm 0">${blood}</div>${rows(5.8, 3)}
          <div style="margin-top:auto;display:flex;align-items:flex-end;gap:2mm">${bar(24, 3)}${sig(13)}</div></div>
        <div style="height:4.6mm;flex-shrink:0;background:linear-gradient(90deg,var(--accent),var(--brand));color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 3mm;font-size:5pt"><span>${esc(s.shortName || '')}</span><span>মেয়াদ <b>${valid}</b></span></div></div>`;
    }

    // modern / elegant (and ribbon, vertical): a panel with logo + photo, then the details
    const panelBg = t === 'ribbon' ? 'linear-gradient(170deg,var(--brand) 0%,var(--brand) 70%,var(--accent) 70%,var(--accent) 74%,var(--brand-ink) 74%)' : dark ? 'transparent' : darkBg;
    const ring = t === 'modern' ? '#fff' : 'var(--accent)', shape = t === 'ribbon' ? '1.6mm' : '50%';
    if (!v) return `<div style="${root(dark ? darkBg : '#fff')}">${dark ? `<div style="position:absolute;left:0;top:0;right:0;height:.9mm;background:var(--accent)"></div><div style="position:absolute;left:0;bottom:0;right:0;height:.9mm;background:var(--accent)"></div>` : ''}
      <div style="flex:1;min-height:0;display:flex">
        <div style="width:28mm;flex-shrink:0;background:${panelBg};color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.4mm;padding:2mm;box-sizing:border-box;${dark ? 'border-right:.3mm solid var(--accent)' : ''}">${this.logoDisc(7)}${photoOn ? this.idPic(p, 19.5, 19.5, '50%', ring) : ''}${blood}</div>
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;padding:2.4mm 2.8mm 2mm">
          <div style="font-size:${schFs}pt;font-weight:700;color:${hi};line-height:1.2;${ell}">${sch}</div>
          <div style="display:flex;align-items:center;gap:1.2mm;margin-top:.6mm"><div style="width:7mm;height:.6mm;background:var(--accent)"></div>${title(dark ? 'rgba(255,255,255,.12)' : 'var(--brand-50,#edf7f4)', dark ? '#f8fafc' : 'var(--brand-ink)')}</div>
          <div style="flex:1;min-height:0;display:flex;gap:2mm;margin-top:1.4mm"><div style="flex:1;min-width:0">${name(9.2)}<div style="margin-top:.8mm">${rows(5.7, 4)}</div></div>${qrBox(11.5)}</div>
          <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:1.5mm">${bar(22, 3)}${validity(true)}${sig(12.5)}</div></div></div></div>`;
    return `<div style="${root(dark ? darkBg : '#fff')}">${dark ? `<div style="position:absolute;left:0;top:0;bottom:0;width:.9mm;background:var(--accent)"></div>` : ''}
      <div style="height:25mm;flex-shrink:0;background:${panelBg};color:#fff;display:flex;flex-direction:column;align-items:center;padding:2mm 2.6mm 0;text-align:center;${dark ? 'border-bottom:.3mm solid var(--accent)' : ''}">${this.logoDisc(6.6)}
        <div style="font-size:${Math.min(schFs, 6.8)}pt;font-weight:700;line-height:1.2;margin-top:.7mm;max-height:5.6mm;overflow:hidden;color:${dark ? 'var(--accent)' : '#fff'}">${sch}</div><div style="font-size:5pt;opacity:.9">${m.title}</div></div>
      <div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;gap:.8mm;padding:0 3mm 2mm;position:relative">
        ${photoOn ? `<div style="margin-top:-8mm">${this.idPic(p, 20, t === 'ribbon' ? 24 : 20, shape, ring)}</div>` : '<div style="height:2mm"></div>'}
        <div style="width:100%">${name(8.6, true)}</div>${blood}<div style="width:100%">${rows(5.5, 3)}</div>
        <div style="width:100%;display:flex;align-items:flex-end;justify-content:space-between;gap:1mm">${validity()}${sig(14)}</div>
        <div style="width:100%;margin-top:auto;display:flex;align-items:flex-end;justify-content:space-between;gap:1.5mm">${bar(showQr ? 26 : 40, 3)}${qrBox(10.5)}</div></div></div>`;
  },
  /** Front of the classic card. */
  idClassic(p, o = {}) {
    const m = this.idModel(p, o.kind), s = DB.s.school, v = o.orient === 'v', valid = o.validTill || `${new Date().getFullYear()}-12-31`;
    const sch = esc(s.nameBn || s.name), schFs = (s.nameBn || s.name || '').length > 34 ? (v ? 6.2 : 7) : (v ? 7 : 8.2), showQr = o.qr !== false;
    const ell = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    const blood = m.blood ? `<div style="display:inline-flex;align-items:center;gap:.6mm;background:#fee2e2;color:#b91c1c;border:.2mm solid #fca5a5;border-radius:1mm;padding:0 1mm;font-size:5.4pt;line-height:1.5;white-space:nowrap">রক্ত <b style="font-family:Inter,system-ui,sans-serif;font-size:6.4pt">${esc(m.blood)}</b></div>` : '';
    const chips = m.chips ? `<div style="display:grid;grid-template-columns:1.5fr 1fr 1fr;gap:.8mm;margin:.9mm 0">${m.chips.map(([k, val]) => `<div style="border:.2mm solid #cbd5e1;border-radius:1mm;padding:.2mm .9mm;background:#f8fafc;min-width:0"><div style="font-size:4.8pt;color:#64748b;line-height:1.2">${k}</div><div style="font-size:7pt;font-weight:700;line-height:1.3;${ell}">${val}</div></div>`).join('')}</div>` : '';
    const rows = (list, fs) => list.map(([k, val]) => `<div style="display:flex;gap:1.2mm;font-size:${fs}pt;line-height:1.5;white-space:nowrap;min-width:0"><span style="color:#64748b;flex-shrink:0">${k}:</span><b style="overflow:hidden;text-overflow:ellipsis;color:#0f172a">${val}</b></div>`).join('');
    const strip = `<div style="height:3.4mm;flex-shrink:0;background:var(--accent);color:#fff;font-size:${v ? 5.8 : 6.2}pt;font-weight:700;display:flex;align-items:center;justify-content:center;letter-spacing:.03em">${m.title}</div>`;
    const foot = (bw) => `<div style="height:6.4mm;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:1.5mm;padding:0 ${v ? 2.4 : 3}mm;background:var(--brand-50,#edf7f4);border-top:.35mm solid var(--brand)">
        <div style="line-height:1">${this.bar(m.code, bw, 3.5)}<div style="font-family:Inter,system-ui,sans-serif;font-size:4.4pt;color:#475569;margin-top:.3mm;letter-spacing:.06em">${esc(m.code)}</div></div>
        <div style="text-align:right;line-height:1.2;white-space:nowrap"><div style="font-size:4.6pt;color:#64748b">মেয়াদ</div><div style="font-size:6pt;font-weight:700;color:var(--brand-ink)">${U.fmtDate(valid)}</div></div></div>`;
    const wm = `<div style="position:absolute;right:${v ? 2 : 16}mm;bottom:${v ? 8 : 7}mm;font-family:Inter,system-ui,sans-serif;font-size:${v ? 30 : 34}pt;font-weight:800;color:var(--brand);opacity:.05;pointer-events:none;line-height:1">${esc(s.shortName || '')}</div>`;
    const root = `position:absolute;left:0;top:0;right:0;bottom:0;display:flex;flex-direction:column;font-family:var(--font-sans,'Noto Serif Bengali',system-ui,sans-serif);color:#0f172a;background:linear-gradient(180deg,#fff 55%,#f8fafc)`;
    if (!v) return `<div style="${root}">
      <div style="height:12mm;flex-shrink:0;background:${m.band};color:#fff;display:flex;align-items:center;gap:2mm;padding:0 3mm">${this.logoDisc(8.6)}
        <div style="min-width:0;flex:1;line-height:1.2"><div style="font-size:${schFs}pt;font-weight:700;${ell}">${sch}</div>
          <div style="font-size:5pt;opacity:.88;${ell}">${[s.eiin ? 'ইআইআইএন ' + bnNum(s.eiin) : '', esc(s.address || '')].filter(Boolean).join(' · ')}</div></div></div>
      ${strip}
      <div style="flex:1;min-height:0;display:flex;gap:2.4mm;padding:1.8mm 3mm 1mm;position:relative">${wm}
        <div style="display:flex;flex-direction:column;align-items:center;gap:1mm;flex-shrink:0">${o.photo === false ? '' : this.idPhoto(p, 18.5, 22.6)}${blood}</div>
        <div style="flex:1;min-width:0;position:relative">
          <div style="font-size:${this.idNameFs(m.name, 9.6)}pt;font-weight:700;color:var(--brand-ink);line-height:1.25;${ell}">${esc(m.name)}</div>
          ${m.nameEn ? `<div style="font-family:Inter,system-ui,sans-serif;font-size:5pt;color:#64748b;text-transform:uppercase;letter-spacing:.05em;${ell}">${esc(m.nameEn)}</div>` : ''}
          ${m.role ? `<div style="font-size:6.8pt;font-weight:700;color:var(--brand);margin-top:.5mm;${ell}">${esc(m.role)}</div>` : ''}
          ${chips}<div style="${m.chips ? '' : 'margin-top:1mm'}">${rows(m.rows.slice(0, m.chips ? 3 : 3), 6)}</div></div>
        <div style="width:${showQr ? 14 : 13}mm;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:space-between">${showQr ? this.qrMm(m.qr, 13.6) : '<div></div>'}<div style="width:13.5mm">${this.miniSig(4.4, 4.8)}</div></div>
      </div>${foot(30)}</div>`;
    return `<div style="${root}">
      <div style="height:18.5mm;flex-shrink:0;background:${m.band};color:#fff;display:flex;flex-direction:column;align-items:center;padding:1.8mm 2.5mm 0;text-align:center">${this.logoDisc(7.4)}
        <div style="font-size:${schFs}pt;font-weight:700;line-height:1.2;margin-top:.8mm;max-height:5.9mm;overflow:hidden">${sch}</div>
        ${s.eiin ? `<div style="font-size:4.6pt;opacity:.88">ইআইআইএন ${bnNum(s.eiin)}</div>` : ''}</div>
      ${strip}
      <div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;padding:2mm 2.6mm 1mm;position:relative;text-align:center">${wm}
        <div style="position:relative">${o.photo === false ? '<div style="height:4mm"></div>' : this.idPhoto(p, 19, 23.4)}${m.blood ? `<div style="position:absolute;right:-4mm;bottom:-1mm">${blood}</div>` : ''}</div>
        <div style="font-size:${this.idNameFs(m.name, 9)}pt;font-weight:700;color:var(--brand-ink);line-height:1.25;margin-top:1.4mm;max-width:100%;${ell}">${esc(m.name)}</div>
        ${m.nameEn ? `<div style="font-family:Inter,system-ui,sans-serif;font-size:4.8pt;color:#64748b;text-transform:uppercase;letter-spacing:.05em;max-width:100%;${ell}">${esc(m.nameEn)}</div>` : ''}
        ${m.role ? `<div style="font-size:6.4pt;font-weight:700;color:var(--brand);max-width:100%;${ell}">${esc(m.role)}</div>` : ''}
        <div style="width:100%">${chips}</div>
        <div style="width:100%;display:flex;gap:1.5mm;align-items:flex-end;margin-top:auto;text-align:left">
          <div style="flex:1;min-width:0">${rows(m.rows.slice(0, m.chips ? 2 : 3), 5.8)}<div style="width:18mm;margin-top:.6mm">${this.miniSig(3.8, 4.6)}</div></div>
          ${showQr ? `<div style="flex-shrink:0">${this.qrMm(m.qr, 12.4)}</div>` : ''}</div>
      </div>${foot(24)}</div>`;
  },
  /** Back of a CR80 card: rules, emergency contact and return address. */
  idBack(p, o = {}) {
    const cfg = this.idCfg(o.kind, o.cfg);
    return this.idWrap(this.idBackFace(p, o, cfg), cfg);
  },
  idBackFace(p, o, cfg) {
    const m = { ...this.idModel(p, o.kind) }, s = DB.s.school, v = o.orient === 'v', t = cfg.tpl;
    if (t === 'minimal') m.band = 'var(--brand-ink)';
    if (t === 'modern' || t === 'elegant' || t === 'ribbon') m.band = 'linear-gradient(135deg,var(--brand),var(--brand-ink))';
    if (t === 'board') m.band = 'var(--brand)';
    const root = `position:absolute;left:0;top:0;right:0;bottom:0;display:flex;flex-direction:column;font-family:var(--font-sans,'Noto Serif Bengali',system-ui,sans-serif);color:#0f172a;background:#fff${t === 'board' ? ';border:.7mm solid var(--brand);border-radius:2.4mm;box-sizing:border-box;overflow:hidden' : ''}`;
    const rules = `<div style="font-size:7pt;font-weight:700;color:var(--brand-ink);margin-bottom:.6mm">ব্যবহারের নিয়মাবলি</div><ol style="margin:0;padding-left:3.2mm;font-size:6.1pt;line-height:1.45;list-style:bengali">${m.rules.map(r => `<li>${r}</li>`).join('')}</ol>`;
    const emer = `<div style="border:.25mm solid #fca5a5;background:#fef2f2;border-radius:1.2mm;padding:.8mm 1.4mm;font-size:5.4pt;line-height:1.35"><div style="color:#b91c1c;font-weight:700">জরুরি প্রয়োজনে যোগাযোগ</div><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(m.emergency[0] || '')}</div><b style="font-size:6.4pt">${esc(U.bn(m.emergency[1] || '—'))}</b></div>`;
    const ret = `<div style="border-top:.25mm dashed #94a3b8;padding-top:1mm;font-size:5.3pt;line-height:1.35;text-align:center;color:#334155">কার্ডটি কুড়িয়ে পেলে অনুগ্রহ করে নিচের ঠিকানায় ফেরত দিন<div style="font-size:6.6pt;font-weight:700;color:var(--brand-ink)">${esc(s.nameBn || s.name)}</div>${esc(s.address || '')}<br>ফোন: ${esc(U.bn(s.phone || ''))}${s.email ? ` · <span style="font-family:Inter,system-ui,sans-serif">${esc(s.email)}</span>` : ''}</div>`;
    const band = `<div style="height:${v ? 6 : 5.4}mm;flex-shrink:0;background:${m.band};color:#fff;display:flex;align-items:center;justify-content:center;font-size:6pt;font-weight:700;border-bottom:.8mm solid var(--accent)">${m.title} · ${esc(s.shortName || '')}</div>`;
    const end = `<div style="height:3mm;flex-shrink:0;background:${m.band}"></div>`;
    if (!v) return `<div style="${root}">${band}<div style="flex:1;min-height:0;display:flex;flex-direction:column;gap:1.2mm;padding:1.6mm 3mm 1.2mm">
        <div style="display:flex;gap:2.4mm;min-height:0"><div style="flex:1;min-width:0">${rules}</div><div style="width:27mm;flex-shrink:0;display:flex;flex-direction:column;gap:1mm">${emer}<div style="font-size:5pt;color:#64748b;text-align:center">প্রদানের তারিখ<br><b style="color:#0f172a;font-size:5.8pt">${U.fmtDate(o.issued || U.today())}</b></div></div></div>
        <div style="margin-top:auto">${ret}</div></div>${end}</div>`;
    return `<div style="${root}">${band}<div style="flex:1;min-height:0;display:flex;flex-direction:column;gap:1.6mm;padding:2mm 2.6mm 1.4mm">${rules}${emer}
        <div style="font-size:5pt;color:#64748b;text-align:center">প্রদানের তারিখ: <b style="color:#0f172a">${U.fmtDate(o.issued || U.today())}</b></div><div style="margin-top:auto">${ret}</div></div>${end}</div>`;
  },
  cropMarks(x, y, w, h) {
    const L = 2.5, off = 0.5, t = 0.075;
    let m = '';
    [[x, y, -1, -1], [x + w, y, 1, -1], [x, y + h, -1, 1], [x + w, y + h, 1, 1]].forEach(([cx, cy, dx, dy]) => {
      m += `<div class="crop hz" style="width:${L}mm;left:${dx < 0 ? cx - off - L : cx + off}mm;top:${cy - t}mm"></div>`;
      m += `<div class="crop vt" style="height:${L}mm;top:${dy < 0 ? cy - off - L : cy + off}mm;left:${cx - t}mm"></div>`;
    });
    return m;
  },
  /** Student card faces (used by the ID-card maker and the dossier preview). */
  cardH(st, o = {}) { return this.idCard(st, { ...o, kind: 'student', orient: 'h' }); },  cardV(st, o = {}) { return this.idCard(st, { ...o, kind: 'student', orient: 'v' }); },

  /* ---------- Exam seat plan ---------- */
  seatPlan(plan, exam) {
    return plan.map(room => `<div class="sheet padded">${this.header(`আসন বিন্যাস — ${esc(exam)}`)}
      <div style="display:flex;justify-content:space-between;font-size:10pt;margin-bottom:3mm"><b>কক্ষ ${esc(room.room)}</b><span>${bnNum(room.rows)} সারি × ${bnNum(room.cols)} বেঞ্চ · ${bnNum(room.filled)} জন পরীক্ষার্থী</span></div>
      <div style="text-align:center;font-size:8pt;color:#64748b;border:.25mm dashed #94a3b8;padding:1.5mm;margin-bottom:3mm">পরিদর্শকের টেবিল / বোর্ড</div>
      <table class="seat-print">${room.grid.map((row, r) => `<tr>${row.map((cell, c) => `<td style="background:${cell ? (cell.grade % 2 ? '#eff6ff' : '#fef3c7') : '#f8fafc'}">${cell ? `<b>${esc(pn(DB.student(cell.id)) || cell.name)}</b><br>শ্রেণি ${bnNum(cell.grade)} · রোল ${bnNum(cell.roll)}<br><span style="color:#64748b">${String.fromCharCode(65 + r)}${c + 1}</span>` : `<span style="color:#cbd5e1">${String.fromCharCode(65 + r)}${c + 1}<br>খালি</span>`}</td>`).join('')}</tr>`).join('')}</table>
      <div style="margin-top:4mm;font-size:8pt;color:#475569">আসনগুলো শ্রেণি অনুযায়ী পর্যায়ক্রমে সাজানো, ফলে পাশাপাশি বা সামনে-পেছনে বসা কোনো দুজন পরীক্ষার্থী একই বিষয়ের পরীক্ষা দেয় না। নীল = বিজোড় শ্রেণি, হলুদ = জোড় শ্রেণি।</div>
      <div style="position:absolute;bottom:16mm;right:14mm">${this.signature('Exam Controller')}</div></div>`);
  },

  /* ---------- Fee-gated admit cards: 1/2/4/6/8 per sheet, any paper & orientation ---------- */
  admitCards(students, exam, opts = {}) { return this.admitSheets(students, exam, { perSheet: 4, ...opts }); },
  ADMIT_GRID: { portrait: { 1: [1, 1], 2: [1, 2], 4: [2, 2], 6: [2, 3], 8: [2, 4] }, landscape: { 1: [1, 1], 2: [2, 1], 4: [2, 2], 6: [3, 2], 8: [4, 2] } },
  ADMIT_RULES: [
    'প্রতিটি পরীক্ষায় এই প্রবেশপত্র ও শিক্ষার্থী পরিচয়পত্র সঙ্গে আনতে হবে।',
    'পরীক্ষা শুরুর অন্তত ৩০ মিনিট আগে পরীক্ষার কক্ষে উপস্থিত হতে হবে।',
    'মোবাইল ফোন, স্মার্টওয়াচসহ যেকোনো ইলেকট্রনিক যন্ত্র সম্পূর্ণ নিষিদ্ধ।',
    'কেবল কালো বলপয়েন্ট কলম ব্যবহার করা যাবে; অনুমোদিত বিষয়ে সাধারণ ক্যালকুলেটর চলবে।',
    'যেকোনো অসদুপায় অবলম্বন করলে সংশ্লিষ্ট পরীক্ষা বাতিল বলে গণ্য হবে।',
    'প্রবেশপত্রে কোনো কিছু লেখা বা পরিবর্তন করা যাবে না; হারালে অফিস থেকে দ্বিতীয় কপি নিতে হবে।',
  ],
  /** Card box for an admit layout. `ok` is false when the cards would be too small (< 80 × 58 mm). */
  admitLayout(o = {}) {
    const per = [1, 2, 4, 6, 8].includes(+o.perSheet) ? +o.perSheet : 4, land = o.orientation === 'landscape', [PW, PH] = this.dims({ paper: o.paper, orientation: land ? 'landscape' : 'portrait' });
    const M = o.margin == null || o.margin === '' ? 8 : U.clamp(+o.margin, 0, 30), gap = o.cut === false ? 4 : 6, foot = 5, [cols, rows] = this.ADMIT_GRID[land ? 'landscape' : 'portrait'][per];
    const w = (PW - 2 * M - (cols - 1) * gap) / cols, h = (PH - 2 * M - foot - (rows - 1) * gap) / rows;
    return { per, cols, rows, w, h, M, gap, PW, PH, foot, ok: w >= 80 && h >= 58 };
  },
  /** Exam routine rows for a class (rows may carry classIds[]; otherwise filtered by the class's subjects). */
  admitRoutine(exam, classId) {
    const subs = new Set((DB.classSubjects ? DB.classSubjects(classId) : DB.s.subjects).map(s => s.id));
    return (exam.schedule || []).filter(r => r.date && (r.classIds?.length ? r.classIds.includes(classId) : !r.subjectId || subs.has(r.subjectId)))
      .sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
  },
  /** "10:00" → "সকাল ১০:০০" */
  clock(t, part = true) {
    if (!t) return ''; const [H, M] = String(t).split(':').map(Number); if (isNaN(H)) return esc(t);
    const h12 = ((H + 11) % 12) + 1, pre = part ? (H < 12 ? 'সকাল ' : H < 15 ? 'দুপুর ' : H < 18 ? 'বিকেল ' : 'সন্ধ্যা ') : '';
    return `${pre}${U.bn(`${h12}:${String(M || 0).padStart(2, '0')}`)}`;
  },
  /** opts: {paper, orientation, perSheet, margin, photo, qr, routine, rules, cut}. Falls back to fewer cards when the requested count does not fit. */
  admitSheets(students, exam, opts = {}) {
    let L = this.admitLayout(opts);
    if (!L.ok) { const alt = [8, 6, 4, 2, 1].filter(n => n < L.per).map(n => this.admitLayout({ ...opts, perSheet: n })).find(x => x.ok); if (alt) L = { ...alt, fellBack: L.per }; }
    const o = { paper: opts.paper || 'A4', orientation: opts.orientation === 'landscape' ? 'landscape' : 'portrait' }, n = Math.ceil(students.length / L.per), sheets = [];
    this._layout = { per: L.per, sheets: n, fellBack: L.fellBack || 0, w: L.w, h: L.h };
    const cut = () => {
      if (opts.cut === false) return '';
      let out = '';
      for (let c = 1; c < L.cols; c++) out += `<div style="position:absolute;left:${L.M + c * (L.w + L.gap) - L.gap / 2}mm;top:${L.M - 3}mm;bottom:${L.M + L.foot - 3}mm;border-left:.25mm dashed #94a3b8"></div><div style="position:absolute;left:${L.M + c * (L.w + L.gap) - L.gap / 2 - 1.6}mm;top:${L.M - 6.5}mm;font-size:8pt;color:#94a3b8">✂</div>`;
      for (let r = 1; r < L.rows; r++) out += `<div style="position:absolute;top:${L.M + r * (L.h + L.gap) - L.gap / 2}mm;left:${L.M - 3}mm;right:${L.M - 3}mm;border-top:.25mm dashed #94a3b8"></div><div style="position:absolute;top:${L.M + r * (L.h + L.gap) - L.gap / 2 - 2.3}mm;left:${L.M - 6.5}mm;font-size:8pt;color:#94a3b8">✂</div>`;
      return out;
    };
    for (let i = 0, p = 0; i < students.length; i += L.per, p++) {
      const out = students.slice(i, i + L.per).map((st, k) => `<div style="position:absolute;left:${L.M + (k % L.cols) * (L.w + L.gap)}mm;top:${L.M + Math.floor(k / L.cols) * (L.h + L.gap)}mm;width:${L.w}mm;height:${L.h}mm">${this.admitCard(st, exam, L.w, L.h, opts)}</div>`).join('');
      sheets.push(`${this.sheet(o)}${cut()}${out}<div style="position:absolute;bottom:3mm;left:0;right:0;text-align:center;font-size:6.5pt;color:#94a3b8">${esc(exam.name)} · প্রতি শিটে ${bnNum(L.per)}টি প্রবেশপত্র · শিট ${bnNum(p + 1)} / ${bnNum(n)}</div></div>`);
    }
    return sheets;
  },
  /** One admit card that adapts its content to the box (w × h mm). */
  admitCard(st, exam, w, h, o = {}) {
    const s = DB.s.school, c = DB.cls(st.classId) || {}, camp = DB.campus(c.campusId) || {}, P = .3528;
    const k = U.clamp(Math.min(w / 95, h / 72), .85, 1.15), fs = +(8.4 * k).toFixed(2), ln = f => f * P * 1.5;
    const photoOn = o.photo !== false, qrOn = o.qr !== false, ell = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    const due = typeof DB.duesBefore === 'function' ? DB.duesBefore(st.id, exam.start) : 0;
    const routine = this.admitRoutine(exam, st.classId), last = routine.length ? routine[routine.length - 1].date : '';
    // --- fixed blocks (heights in mm) ---
    const hdrH = 4 + ln(fs + 3) + ln(fs - 2.2), barH = ln(fs + .8) + 2, signH = 7.5 * k + ln(fs - 1.6) + .8, pad = 2.6 * k;
    const phW = U.clamp(w * .2, 18, 30), phH = +(phW * 1.25).toFixed(1), qrMm = U.clamp(w * .17, 15, 26);
    const g = DB.guardiansOf ? DB.guardiansOf(st.id)[0] : null, father = st.fatherNameBn || st.fatherName || (g ? pn(g) : ''), mother = st.motherNameBn || st.motherName || '';
    const info = [['পরীক্ষার্থী', `<b style="font-size:${fs + 1.8}pt;color:var(--brand-ink)">${esc(pn(st))}</b>`, ln(fs + 1.8)]];
    const room = Math.max(photoOn ? phH : 0, qrOn ? qrMm + ln(fs - 2) + 1 : 0);
    const extra = [['পিতা', esc(father || '—')], ['মাতা', esc(mother || '—')]].filter(x => x[1] !== '—');
    const base = [...(w < 120 ? [['শ্রেণি', `${esc(c.name || '—')} · শাখা ${esc(st.section || '—')}`], ['রোল', `<b>${bnNum(st.roll)}</b>`]] : [['শ্রেণি', `${esc(c.name || '—')} · শাখা ${esc(st.section || '—')} · রোল <b>${bnNum(st.roll)}</b>`]]),['নিবন্ধন নম্বর', `<span style="font-family:Inter,system-ui,sans-serif">${esc(st.regNo || st.id)}</span>`], ['পরীক্ষাকেন্দ্র', esc(camp.name || '—')]];
    base.forEach(r => info.push([...r, ln(fs)]));
    if (h >= 80) info.splice(1, 0, ...extra.map(r => [...r, ln(fs)]));
    const bodyH = Math.max(room, info.reduce((a, r) => a + r[2], 0));
    let avail = h - 1 - hdrH - barH - bodyH - signH - 2 * pad - 1.5;
    // --- routine table ---
    const rfs = +(fs - 1.1).toFixed(2), rH = ln(rfs) + .4, split = w >= 150 && routine.length > 3, nRows = split ? Math.ceil(routine.length / 2) : routine.length;
    let routineHtml = '';
    if (o.routine !== false && routine.length) {
      const need = ln(fs) + rH * (nRows + 1) + 1.5 + .5;
      if (avail >= need) {
        const th = `<tr>${['তারিখ ও বার', 'সময়', 'বিষয়'].map(x => `<th style="background:var(--brand-50,#edf7f4);color:var(--brand-ink);border:.2mm solid #cbd5e1;padding:.3mm 1mm;font-weight:700;text-align:left">${x}</th>`).join('')}</tr>`;
        const td = x => `<td style="border:.2mm solid #cbd5e1;padding:.3mm 1mm;${ell};max-width:0">${x}</td>`;
        const tbl = list => `<table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:${rfs}pt;line-height:1.3"><colgroup><col style="width:27%"><col style="width:33%"><col></colgroup><thead>${th}</thead><tbody>${list.map(r => `<tr>${td(`${U.bn(`${r.date.slice(8, 10)}/${r.date.slice(5, 7)}`)} ${U.dayBn(r.date)}`)}${td(`${this.clock(r.start)}${r.end ? '–' + this.clock(r.end, false) : ''}`)}${td(esc(DB.s.subjects.find(x => x.id === r.subjectId)?.name || r.subjectId || '—'))}</tr>`).join('')}</tbody></table>`;
        routineHtml = `<div style="flex-shrink:0"><div style="font-size:${fs}pt;font-weight:700;color:var(--brand-ink);margin-bottom:.6mm">পরীক্ষার সময়সূচি</div>${split ? `<div style="display:flex;gap:2.5mm"><div style="flex:1;min-width:0">${tbl(routine.slice(0, nRows))}</div><div style="flex:1;min-width:0">${tbl(routine.slice(nRows))}</div></div>` : tbl(routine)}</div>`;
        avail -= need;
      } else if (avail >= ln(fs - 1)) { routineHtml = `<div style="font-size:${fs - 1}pt;color:#475569;flex-shrink:0">পরীক্ষার পূর্ণ সময়সূচি (${bnNum(routine.length)}টি পত্র) নোটিশ বোর্ড ও ওয়েবসাইটে দেখুন।</div>`; avail -= ln(fs - 1) + 1; }
    }
    // --- instructions: as many rules as fit ---
    let rulesHtml = '';
    if (o.rules !== false) {
      const ifs = +(fs - 1.4).toFixed(2), lineMm = ifs * P * 1.42, perLine = Math.max(20, (w - 2 * pad - 5) / (ifs * P * .52)), picked = [];
      let used = ln(fs - .6) + 3.7;
      for (const r of this.ADMIT_RULES) { const need = Math.ceil(r.length / perLine) * lineMm; if (used + need > avail) break; picked.push(r); used += need; }
      if (picked.length) rulesHtml = `<div style="flex-shrink:0;border:.25mm solid #e2e8f0;border-left:.9mm solid var(--accent);border-radius:1.2mm;padding:.8mm 1.6mm;background:#fffbfb"><div style="font-size:${fs - .6}pt;font-weight:700;color:#9f1239">পরীক্ষার্থীর প্রতি নির্দেশনা</div><ol style="margin:.3mm 0 0;padding-left:4mm;font-size:${ifs}pt;line-height:1.42;list-style:bengali">${picked.map(r => `<li>${r}</li>`).join('')}</ol></div>`;
      else if (avail >= ln(fs - 1.5)) rulesHtml = `<div style="font-size:${fs - 1.5}pt;color:#475569;flex-shrink:0">${this.ADMIT_RULES[0]} ইলেকট্রনিক যন্ত্র নিষিদ্ধ।</div>`;
    }
    const sigImg = 7.5 * k, sname = s.principalNameBn || s.principalName || '', lfs = +(fs - 1.6).toFixed(2);
    const line = label => `<div style="text-align:center;min-width:0;flex:1;max-width:46mm"><div style="height:${sigImg}mm"></div><div style="border-top:.25mm solid #0f172a;font-size:${lfs}pt;padding-top:.5mm">${label}</div></div>`;
    const prin = `<div style="text-align:center;min-width:0;flex:1;max-width:46mm">${s.signature ? `<img src="${s.signature}" style="height:${sigImg}mm;max-width:100%;display:block;margin:0 auto;object-fit:contain">` : `<div style="height:${sigImg}mm;line-height:${sigImg}mm;font-family:'Brush Script MT',cursive;font-size:${(sigImg * 1.7).toFixed(1)}pt;color:#1e3a8a;${ell}">${esc(sname)}</div>`}<div style="border-top:.25mm solid #0f172a;font-size:${lfs}pt;padding-top:.5mm;${ell}">${sname ? esc(sname) + ', ' : ''}অধ্যক্ষ</div></div>`;
    const dates = exam.start ? `${U.fmtDate(exam.start)}${last && last !== exam.start ? ` – ${U.fmtDate(last)}` : ''}` : '';
    return `<div style="position:absolute;inset:0;border:.5mm solid var(--brand-ink);border-radius:3mm;overflow:hidden;display:flex;flex-direction:column;background:#fff;font-size:${fs}pt;color:#0f172a">
      <div style="height:${hdrH}mm;flex-shrink:0;background:var(--brand);color:#fff;display:flex;align-items:center;gap:2.5mm;padding:0 ${pad + 1}mm;box-sizing:border-box">${this.logoDisc(+(hdrH - 3.2).toFixed(1))}
        <div style="flex:1;min-width:0;line-height:1.25"><div style="font-size:${fs + 3}pt;font-weight:700;${ell}">${esc(s.nameBn || s.name)}</div><div style="font-size:${fs - 2.2}pt;opacity:.9;${ell}">${[s.eiin ? 'ইআইআইএন ' + bnNum(s.eiin) : '', esc(s.address || '')].filter(Boolean).join(' · ')}</div></div>
        <div style="flex-shrink:0;background:#fff;color:var(--brand-ink);font-weight:700;font-size:${fs + 1.2}pt;padding:.6mm 2.6mm;border-radius:1.4mm;box-shadow:0 0 0 .4mm var(--accent)">প্রবেশপত্র</div></div>
      <div style="height:${barH}mm;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:2mm;padding:0 ${pad + 1}mm;background:var(--brand-50,#edf7f4);border-bottom:.3mm solid var(--brand);box-sizing:border-box">
        <b style="font-size:${fs + .8}pt;color:var(--brand-ink);${ell}">${esc(exam.name)}</b>${dates ? `<span style="font-size:${fs - 1.2}pt;color:#334155;white-space:nowrap">${dates}</span>` : ''}</div>
      <div style="flex:1;min-height:0;display:flex;flex-direction:column;gap:1.5mm;padding:${pad}mm ${pad + 1}mm">
        <div style="display:flex;gap:3mm;flex-shrink:0">
          ${photoOn ? this.idPhoto(st, phW, phH) : ''}
          <div style="flex:1;min-width:0">${info.map(([kk, vv]) => `<div style="display:flex;gap:1.5mm;line-height:1.5;border-bottom:.2mm dotted #cbd5e1;min-width:0"><span style="color:#64748b;flex-shrink:0;min-width:${(fs * 2.2).toFixed(1)}mm">${kk}</span><span style="flex:1;min-width:0;${ell}">${vv}</span></div>`).join('')}</div>
          ${qrOn ? `<div style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:.6mm">${this.qrMm(verifyUrl('admit', st.regNo + '|' + exam.id), qrMm)}<span style="font-size:${fs - 2}pt;font-weight:700;color:${due ? '#b45309' : '#059669'};white-space:nowrap">${due ? 'বিশেষ অনুমতিপ্রাপ্ত' : 'ফি পরিশোধিত ✓'}</span></div>` : ''}
        </div>
        ${routineHtml}${rulesHtml}
        <div style="margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;gap:4mm;flex-shrink:0">${line('পরীক্ষার্থীর স্বাক্ষর')}${w >= 120 ? line('শ্রেণিশিক্ষক') : ''}${prin}</div>
      </div></div>`;
  },

  /** Marksheet design (school.msDesign, edited in ফলাফল → মার্কশিট ডিজাইন) with every block on by default. */
  msDesign() {
    const d = DB.s.school?.msDesign || {};
    return { template: 'classic', title: '', accent: '', logo: true, gradeTable: false, ...d, blocks: { guardian: true, dob: true, regNo: true, qr: true, summary: true, rules: true, remarks: true, watermark: true, stamp: true, signClass: true, signPrincipal: true, signController: false, subTotal: true, subGrade: true, ...(d.blocks || {}) } };
  },
  /* ---------- Official marksheet ---------- */
  marksheet(st, examId) {
    const ex = DB.s.exams.find(e => e.id === examId), c = DB.cls(st.classId), res = DB.result(st.id, examId);
    // Final result: this exam alone, or combined with earlier exams when Exam setup → "আগের পরীক্ষার ফলাফল যোগ" is set.
    const comb = DB.combinedResult ? DB.combinedResult(st.id, examId) : { ...res, combined: false }, fin = comb.combined ? comb : res;
    const g = DB.guardiansOf(st.id)[0], code = `${st.regNo}_${examId}`, letterOnly = res.scale === 'letter';
    const opt = { position: true, points: true, remarks: true, average: true, highest: false, ...(ex.sheet || {}) }, showPts = opt.points && !letterOnly;
    // component columns: every component configured for any subject, in first-seen order
    const cols = []; res.rows.forEach(r => (r.parts || []).forEach(p => { if (!cols.some(c => c.k === p.k)) cols.push({ k: p.k, label: p.k === 'cq' && !res.rows.some(x => (x.parts || []).some(y => y.k === 'mcq')) ? 'লিখিত' : p.label }); }));
    const comp = Math.max(1, cols.length);
    const highest = sid => Math.max(0, ...DB.s.marks.filter(m => m.examId === examId && m.subjectId === sid && DB.student(m.studentId)?.classId === st.classId).map(m => { const v = DB.markVals(m, ex, sid, m.studentId); return Grade.of(v.cq, v.mcq, ex, null, v.pr, sid, v).total; }));
    const mx = (v, m) => `${bnNum(v)}<span style="color:#94a3b8;font-size:7.5pt">/${bnNum(m)}</span>`;
    const f1 = v => v === null || v === undefined || isNaN(v) ? '—' : bnNum(Math.round(v * 10) / 10);
    // Averages: the student's average marks per subject, and the class average of every subject / of the whole exam.
    const avg = sid => opt.average && DB.classAverage ? DB.classAverage(examId, st.classId, sid) : null;
    const n = res.rows.length || 1, avgSum = U.sum(res.rows, r => avg(r.subject.id)?.avg || 0), clsPct = opt.average && DB.classAverage ? DB.classAverage(examId, st.classId)?.pct : null;
    const bands = Grade.bands(DB.campusOf(st.classId), ex.session, ex);
    const scale = bands.map((b, i) => `${b.letter} ${i === 0 ? `≥${bnNum(b.min)}` : `${bnNum(b.min)}–${bnNum(bands[i - 1].min - 1)}`}%${b.point !== null ? ` (${bnNum(b.point.toFixed(2))})` : ''}`).join(' · ');
    // Class & section position by the final (combined when set) result, across all sections of the class.
    const peers = DB.examRanking ? DB.examRanking(examId, st.classId) : DB.studentsIn(st.classId).map(x => ({ st: x, c: DB.result(x.id, examId) })).filter(x => x.c.rows.length).sort((a, b) => ((b.c.gpa ?? b.c.pct / 20) - (a.c.gpa ?? a.c.pct / 20)) || b.c.total - a.c.total);
    const pos = peers.findIndex(p => p.st.id === st.id) + 1, secPeers = peers.filter(p => p.st.section === st.section), secPos = secPeers.findIndex(p => p.st.id === st.id) + 1;
    const remark = DB.s.examRemarks?.[examId]?.[st.id] || (fin.passed ? (fin.pct >= 80 ? 'চমৎকার ফলাফল — এই ধারা অব্যাহত রাখো।' : fin.pct >= 60 ? 'ভালো ফলাফল; নিয়মিত প্রচেষ্টায় আরও ভালো ফল আসবে।' : 'সন্তোষজনক; আরও অনুশীলন প্রয়োজন।') : 'উল্লেখযোগ্য উন্নতি প্রয়োজন; অনুগ্রহ করে শ্রেণিশিক্ষকের সঙ্গে সাক্ষাৎ করুন।');
    const ct = DB.teacher(c.classTeacherId);
    const big = comb.combined && res.rows.length > 6, tight = comb.combined && !big;   // many subjects → combined breakdown on a second page
    const rule = { redistribute: 'যে বিষয় কোনো আগের পরীক্ষায় ছিল না, তার ভার বাকি পরীক্ষাগুলোতে আনুপাতিক হারে পুনর্বণ্টিত', zero: 'যে পরীক্ষায় বিষয়টি ছিল না সেখানে ০% ধরা হয়েছে', self: 'যে বিষয় কোনো আগের পরীক্ষায় ছিল না, তাতে শুধু এই পরীক্ষার নম্বর গণ্য' }[comb.rule] || '';
    const cmbHtml = comb.combined ? `<div style="margin-top:${tight ? 3 : 5}mm;font-size:10pt;font-weight:700;color:var(--brand-ink)">সমন্বিত (চূড়ান্ত) ফলাফল <span style="font-weight:400;font-size:8pt;color:#475569">— বিষয়ের সমন্বিত শতকরা = Σ(শতকরা × ভার) ÷ Σ ভার; ${rule}।</span></div>
      <table class="ms-table ${tight ? 'ms-tight' : ''}" style="font-size:${tight ? 8.5 : 10}pt;margin-top:1.5mm"><thead><tr><th>বিষয়</th>${comb.parts.map(p => `<th>${esc(p.exam.name)}<br><span style="font-weight:400">ভার ${bnNum(p.weight)}%</span></th>`).join('')}<th>সমন্বিত %</th><th>সমন্বিত নম্বর</th><th>লেটার গ্রেড</th>${showPts ? '<th>গ্রেড পয়েন্ট</th>' : ''}</tr></thead>
      <tbody>${comb.rows.map(r => `<tr><td>${esc(r.subject.name)}</td>${r.items.map(i => `<td>${i.pct === null ? (i.zero ? '০%' : '—') : bnNum(i.pct.toFixed(1)) + '%'}${r.missing ? `<br><span style="font-size:7pt;color:#64748b">গণ্য ভার ${bnNum(Math.round(i.share))}%</span>` : ''}</td>`).join('')}<td><b>${bnNum(r.pct.toFixed(1))}%</b></td><td>${f1(r.total)}/${bnNum(r.max)}</td><td style="color:${r.failed ? '#dc2626' : '#0f172a'};font-weight:700">${esc(r.letter)}</td>${showPts ? `<td>${r.point === null ? '—' : bnNum(r.point.toFixed(2))}</td>` : ''}</tr>`).join('')}</tbody>
      <tfoot><tr><th>সর্বমোট</th><th colspan="${comb.parts.length}"></th><th>${bnNum(comb.pct.toFixed(1))}%</th><th>${f1(comb.total)}/${bnNum(comb.max)}</th><th>${esc(comb.letter)}</th>${showPts ? `<th>জিপিএ ${gpaFmt(comb.gpa)}</th>` : ''}</tr></tfoot></table>` : '';
    // design (ফলাফল → মার্কশিট ডিজাইন): template, title, blocks, logo, signatures, colours, grading table
    const D = this.msDesign(), B = D.blocks, acc = D.accent || 'var(--brand)', ST = B.subTotal !== false, SG = B.subGrade !== false;
    const tpl = D.template === 'modern' ? `<style>.ms-d .ms-table th{background:${acc};color:#fff}.ms-d .ms-band{background:${acc};color:#fff;padding:2mm 3mm;border-radius:2mm;margin-bottom:3mm;font-weight:700}</style>` : D.template === 'compact' ? '<style>.ms-d .ms-table th,.ms-d .ms-table td{padding:.6mm 1.5mm;font-size:9pt}.ms-d table{line-height:1.4 !important}</style>' : `<style>.ms-d .ms-table th{color:${D.accent || 'inherit'}}</style>`;
    const lg0 = this.logo; if (!D.logo) this.logo = mm => `<div style="width:${mm}mm"></div>`;
    let head; try { head = this.header(esc(D.title || 'একাডেমিক ট্রান্সক্রিপ্ট / নম্বরপত্র')); } finally { this.logo = lg0; }
    const gradeTable = D.gradeTable ? `<table class="ms-table" style="margin-top:3mm;font-size:8pt"><thead><tr><th>শতকরা</th>${bands.map(b => `<th>${esc(b.letter)}</th>`).join('')}</tr></thead><tbody><tr><td>ন্যূনতম %</td>${bands.map(b => `<td>${bnNum(b.min)}</td>`).join('')}</tr>${showPts ? `<tr><td>পয়েন্ট</td>${bands.map(b => `<td>${b.point === null ? '—' : bnNum(b.point.toFixed(2))}</td>`).join('')}</tr>` : ''}</tbody></table>` : '';
    return [`<div class="sheet padded ms-d">${tpl}${B.watermark ? `<div class="watermark">${esc(DB.s.school.shortName)}</div>` : ''}
      ${head}${D.template === 'modern' ? `<div class="ms-band">${esc(ex.name)} · ${esc(pn(st))}</div>` : ''}
      <div style="display:flex;gap:6mm;margin-bottom:${tight ? 3 : 5}mm">
        <table style="flex:1;font-size:10pt;line-height:${tight ? 1.45 : 1.7}">
          <tr><td style="width:38mm;color:#475569">শিক্ষার্থীর নাম</td><td><b>${esc(pn(st))}</b></td></tr>
          ${B.guardian ? `<tr><td style="color:#475569">পিতা / অভিভাবক</td><td>${esc(st.fatherNameBn || st.fatherName || pn(g) || '—')}</td></tr>` : ''}
          <tr><td style="color:#475569">শ্রেণি / শাখা</td><td>${esc(c.name)} / ${esc(st.section)}${multiCampus() ? ' · ' + esc(DB.campus(c.campusId)?.name || '') : ''}</td></tr>
          <tr><td style="color:#475569">${B.regNo ? 'রোল · নিবন্ধন' : 'রোল'}</td><td>${bnNum(st.roll)}${B.regNo ? ` · ${esc(st.regNo || '')}` : ''}</td></tr>
          <tr><td style="color:#475569">পরীক্ষা</td><td>${esc(ex.name)} (${esc(bn(ex.type))})</td></tr>
          ${B.dob ? `<tr><td style="color:#475569">জন্মতারিখ</td><td>${U.fmtDate(st.dob)}</td></tr>` : ''}
        </table>
        ${B.qr ? `<div style="text-align:center">${qr(verifyUrl('marksheet', code), tight ? 80 : 100)}<div style="font-size:7pt;color:#64748b;margin-top:1mm">যাচাই করতে স্ক্যান করুন<br>${code}</div></div>` : ''}
      </div>
      ${tight ? '<style>.ms-tight th,.ms-tight td{padding:.6mm 1.5mm;line-height:1.3}</style>' : ''}<table class="ms-table ${tight ? 'ms-tight' : ''}" ${tight ? 'style="font-size:9pt"' : ''}><thead><tr><th>বিষয়</th>${cols.map(c => `<th>${esc(c.label)}</th>`).join('') || '<th></th>'}${ST ? '<th>মোট</th>' : ''}${opt.average ? '<th>শ্রেণির গড়</th>' : ''}${opt.highest ? '<th>সর্বোচ্চ</th>' : ''}${SG ? `<th>লেটার গ্রেড</th>${showPts ? '<th>গ্রেড পয়েন্ট</th>' : ''}` : ''}</tr></thead>
      <tbody>${res.rows.map(r => `<tr><td>${esc(r.subject.name)}</td>${r.absent ? `<td colspan="${comp}">অনুপস্থিত</td>` : cols.map(c => { const p = (r.parts || []).find(x => x.k === c.k); return `<td>${p ? mx(p.v, p.max) : '—'}</td>`; }).join('') || '<td></td>'}${ST ? `<td><b>${mx(r.total, r.max)}</b></td>` : ''}${opt.average ? `<td>${f1(avg(r.subject.id)?.avg)}</td>` : ''}${opt.highest ? `<td>${bnNum(highest(r.subject.id))}</td>` : ''}${SG ? `<td style="color:${r.failed ? '#dc2626' : '#0f172a'};font-weight:700">${esc(r.letter)}</td>${showPts ? `<td>${bnNum(r.point.toFixed(2))}</td>` : ''}` : ''}</tr>`).join('')}</tbody>
      <tfoot><tr><th>সর্বমোট${comb.combined ? ' (এই পরীক্ষা)' : ''}</th><th colspan="${comp}" style="text-align:right">${ST ? '' : `${bnNum(res.total)}/${bnNum(res.max)}`}${SG ? '' : ` · ${esc(res.letter)}${showPts ? ` · জিপিএ ${gpaFmt(res.gpa)}` : ''}`}</th>${ST ? `<th>${bnNum(res.total)}/${bnNum(res.max)}</th>` : ''}${opt.average ? `<th>${f1(avgSum)}</th>` : ''}${opt.highest ? '<th></th>' : ''}${SG ? `<th>${esc(res.letter)}</th>${showPts ? `<th>জিপিএ ${gpaFmt(res.gpa)}</th>` : ''}` : ''}</tr>
      ${opt.average ? `<tr><th>গড় নম্বর (বিষয়প্রতি)</th><th colspan="${comp}"></th>${ST ? `<th>${f1(res.total / n)}</th>` : ''}<th>${f1(avgSum / n)}</th>${opt.highest ? '<th></th>' : ''}${SG ? `<th colspan="${showPts ? 2 : 1}">${bnNum(res.pct.toFixed(1))}%${clsPct != null ? ` · শ্রেণির গড় ${bnNum(clsPct.toFixed(1))}%` : ''}</th>` : ''}</tr>` : ''}</tfoot></table>
      ${big ? '' : cmbHtml}
      ${gradeTable}
      <div style="display:${B.summary || B.rules ? 'flex' : 'none'};gap:5mm;margin-top:${tight ? 3 : 4}mm;font-size:${tight ? 9 : 10}pt">
        <div style="${B.summary ? '' : 'display:none;'}flex:1;border:.3mm solid #cbd5e1;border-radius:2mm;padding:${tight ? 2 : 3}mm"><b>${comb.combined ? 'চূড়ান্ত ফলাফল' : 'ফলাফল'}:</b> <span style="color:${fin.passed ? '#059669' : '#dc2626'};font-weight:800">${fin.passed ? 'উত্তীর্ণ' : 'অনুত্তীর্ণ'}</span>${comb.combined ? ` · ${showPts ? `জিপিএ ${gpaFmt(fin.gpa)} · ` : ''}${esc(fin.letter)}` : ''}${opt.position && pos ? `<br><b>শ্রেণিতে অবস্থান:</b> ${bnNum(peers.length)} জনের মধ্যে ${bnNum(pos)} · <b>শাখা:</b> ${bnNum(secPeers.length)} জনের মধ্যে ${bnNum(secPos)}` : ''}<br><b>শতকরা হার:</b> ${bnNum(fin.pct.toFixed(1))}%${opt.average ? ` · <b>গড় নম্বর:</b> ${f1(res.total / n)} (বিষয়প্রতি)` : ''}</div>
        <div style="${B.rules ? '' : 'display:none;'}flex:1;border:.3mm solid #cbd5e1;border-radius:2mm;padding:${tight ? 2 : 3}mm;font-size:${tight ? 7.5 : 8}pt">${esc(bn(ex.type))} · ভার ${bnNum(ex.weight)}% · স্কেল: ${esc(scale)}। পাসের নিয়ম: ${ex.passRule === 'total' ? `বিষয়ের মোট নম্বর ≥ ${bnNum(ex.passPct ?? 33)}%` : 'প্রতিটি অংশে নির্ধারিত পাস নম্বর আবশ্যক'}${ex.failRule === 'average' ? ' · জিপিএ = পয়েন্টের গড়' : ' · যেকোনো F ⇒ জিপিএ ০'}।${comb.combined ? ` সমন্বয়: ${comb.parts.map(p => `${esc(p.exam.name)} ${bnNum(p.weight)}%`).join(' + ')}।` : ''}</div>
      </div>
      ${opt.remarks && B.remarks ? `<div style="margin-top:${tight ? 3 : 4}mm;border:.3mm solid #cbd5e1;border-radius:2mm;padding:${tight ? 2 : 3}mm;font-size:9.5pt"><b>শ্রেণিশিক্ষকের মন্তব্য:</b> ${esc(remark)}</div>` : ''}
      <div style="position:absolute;bottom:22mm;left:14mm;right:14mm;display:flex;justify-content:space-between;align-items:flex-end">
        ${B.signClass ? `<div style="text-align:center;width:50mm">${ct?.signature ? `<img src="${ct.signature}" style="height:12mm;display:block;margin:0 auto">` : '<div style="height:12mm"></div>'}<div style="border-top:.25mm solid #0f172a;font-size:8pt;padding-top:1mm">${esc(ct ? pn(DB.user(ct.userId)) : '')}<br>শ্রেণিশিক্ষক</div></div>` : '<span></span>'}${B.stamp ? this.stamp() : ''}${B.signController ? this.signature('Exam Controller') : ''}${B.signPrincipal ? this.signature('Principal') : ''}</div>
      <div style="position:absolute;bottom:12mm;left:14mm;font-size:7.5pt;color:#64748b">প্রদানের তারিখ ${U.fmtDate(U.today())} · Dhee SMS দ্বারা ডিজিটালভাবে প্রস্তুত — কিউআর কোডের মাধ্যমে যাচাই করুন।</div></div>`]
      .concat(big ? [`<div class="sheet padded"><div class="watermark">${esc(DB.s.school.shortName)}</div>${this.header('সমন্বিত ফলাফল')}
        <div style="font-size:10.5pt;line-height:1.7"><b>${esc(pn(st))}</b> · ${esc(c.name)} / ${esc(st.section)} · রোল ${bnNum(st.roll)} · ${st.regNo}<br>${esc(ex.name)} · চূড়ান্ত ফলাফল: <b style="color:${fin.passed ? '#059669' : '#dc2626'}">${fin.passed ? 'উত্তীর্ণ' : 'অনুত্তীর্ণ'}</b>${showPts ? ` · জিপিএ ${gpaFmt(fin.gpa)}` : ''} · ${esc(fin.letter)}</div>${cmbHtml}
        <div style="position:absolute;bottom:22mm;left:14mm;right:14mm;display:flex;justify-content:space-between;align-items:flex-end"><span></span>${this.stamp()}${this.signature('Principal')}</div></div>`] : []);
  },

  /* ---------- Money receipt ---------- */
  receipt(pay) {
    const st = DB.student(pay.studentId), invs = DB.s.invoices.filter(i => pay.invoiceIds.includes(i.id));
    return [`<div class="sheet padded">${this.header('টাকা প্রাপ্তির রসিদ')}
      <div style="display:flex;justify-content:space-between;font-size:10pt;margin-bottom:4mm"><div><b>রসিদ নম্বর:</b> ${pay.id}<br><b>তারিখ:</b> ${U.fmtDate(pay.date)}<br><b>পদ্ধতি:</b> ${esc(bn(pay.method))} · <b>লেনদেন:</b> ${esc(pay.txn)}</div>
      <div style="text-align:center">${qr(verifyUrl('receipt', pay.id), 84)}<div style="font-size:7pt;color:#64748b">কিউআর-যাচাইকৃত</div></div></div>
      <div style="font-size:10pt;margin-bottom:3mm"><b>প্রাপ্তি যার নিকট থেকে:</b> ${esc(pn(st))} · ${esc(DB.cls(st.classId).name)} · রোল ${bnNum(st.roll)} · আইডি ${st.id}</div>
      <table class="ms-table"><thead><tr><th>বিবরণ</th><th>বিল</th><th>পরিমাণ</th></tr></thead><tbody>${invs.map(i => `<tr><td>${esc(i.item)}</td><td>${i.id}</td><td>${U.money(i.amount)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th>মোট পরিশোধিত</th><th></th><th>${U.money(pay.amount)}</th></tr></tfoot></table>
      <div style="font-size:8.5pt;color:#475569;margin-top:3mm">মাধ্যম: ${esc(bn(pay.channel || 'Online'))}${pay.verified === false ? ' · <b style="color:#b45309">ট্রানজ্যাকশন আইডি (TrxID) এমএফএস মিলিয়ে দেখার অপেক্ষায়</b>' : ''} · নিরাপত্তা কোড: <span style="font-family:monospace">${esc((pay.sig || U.hash([pay.id, pay.amount, pay.txn, pay.date, pay.studentId].join('|'))).slice(0, 12).toUpperCase())}</span></div>
      ${pay.teller ? `<div style="margin-top:6mm;display:inline-block;border:.5mm solid var(--accent);color:var(--accent);border-radius:2mm;padding:2mm 4mm;font-size:9pt;font-weight:700;transform:rotate(-3deg)">কাউন্টারে পরিশোধিত · ${U.fmtDate(pay.date)}<br><span style="font-weight:500">গ্রহণকারী: ${esc(pay.teller)}</span></div>` : ''}
      <div style="margin-top:14mm;display:flex;justify-content:space-between;align-items:flex-end">${this.stamp()}${this.signature('Accounts Officer')}</div></div>`];
  },
  admissionReceipt(a) {
    const c = DB.cls(a.classId);
    return [`<div class="sheet padded">${this.header('ভর্তির আবেদনের রসিদ')}
      <div style="display:flex;justify-content:space-between;font-size:10.5pt;line-height:1.8"><div>
        <b>আবেদনের রেফারেন্স:</b> ${a.id}<br><b>আবেদনকারী:</b> ${esc(a.studentNameBn || a.studentName)}<br><b>আবেদনকৃত শ্রেণি:</b> ${esc(c.name)}<br><b>অভিভাবক:</b> ${esc(a.guardianNameBn || a.guardianName)} · ${esc(a.guardianPhone)}<br>
        <b>জমাদানের সময়:</b> ${U.fmtTime(a.submittedAt)}</div><div style="text-align:center">${qr(verifyUrl('application', a.id), 100)}<div style="font-size:7pt;color:#64748b">অবস্থা জানুন</div></div></div>
      <table class="ms-table" style="margin-top:5mm"><tbody>
        <tr><td>ভর্তি / আবেদন ফি</td><td>${U.money(a.fee)}</td></tr>
        <tr><td>ছাড় ${a.coupon ? `(${esc(a.coupon)} — ${bnNum(a.discountPct)}%)` : ''}</td><td>− ${U.money(a.fee - a.netPaid)}</td></tr>
        <tr><th>${a.payment?.txn ? `${esc(bn(a.payment.method))}-এর মাধ্যমে নিট পরিশোধ (লেনদেন ${esc(a.payment.txn)})` : 'নিট পরিশোধ (অফিসে পরিশোধযোগ্য)'}</th><th>${U.money(a.payment?.txn ? a.netPaid : (a.feeDue ?? a.netPaid ?? 0))}</th></tr></tbody></table>
      <p style="font-size:9pt;color:#475569;margin-top:5mm">পাবলিক পোর্টালে আবেদনের অবস্থা জানতে এই রেফারেন্সটি সংরক্ষণ করুন। আবেদনসমূহ অধ্যক্ষ কর্তৃক পর্যালোচনা করা হয়; সিদ্ধান্ত গৃহীত হলে অভিভাবকের ফোনে এসএমএস পাঠানো হবে।</p>
      <div style="margin-top:20mm;display:flex;justify-content:flex-end">${this.stamp()}</div></div>`];
  },
  /** Payment / receipt / journal voucher with debit-credit lines and approval boxes. */
  voucher(v) {
    const b = DB.balances(), title = { PV: 'পরিশোধ ভাউচার', RV: 'প্রাপ্তি ভাউচার', JV: 'জাবেদা ভাউচার' }[v.kind || 'JV'];
    const tot = U.sum(v.lines, l => l.dr);
    return [`<div class="sheet padded">${this.header(title)}
      <div style="display:flex;justify-content:space-between;font-size:10pt;line-height:1.8"><div><b>ভাউচার নম্বর:</b> ${v.id}<br><b>তারিখ:</b> ${U.fmtDate(v.date)}<br>${v.payee ? `<b>${v.kind === 'RV' ? 'প্রাপ্তি যার নিকট থেকে' : 'প্রাপক'}:</b> ${esc(v.payee)}<br>` : ''}<b>ব্যয়কেন্দ্র:</b> ${esc(v.campusId ? DB.campus(v.campusId).name : 'প্রতিষ্ঠানব্যাপী')}</div><div>${qr(verifyUrl('voucher', v.id), 80)}</div></div>
      <div style="font-size:10pt;margin:4mm 0"><b>বিবরণ:</b> ${esc(v.memo)}</div>
      <table class="ms-table"><thead><tr><th>হিসাব খাত</th><th>ডেবিট (৳)</th><th>ক্রেডিট (৳)</th></tr></thead><tbody>${v.lines.map(l => `<tr><td>${l.acct} · ${esc(b[l.acct]?.name || '')}</td><td>${l.dr ? bnNum(l.dr, true) : ''}</td><td>${l.cr ? bnNum(l.cr, true) : ''}</td></tr>`).join('')}</tbody><tfoot><tr><th>মোট</th><th>${bnNum(tot, true)}</th><th>${bnNum(tot, true)}</th></tr></tfoot></table>
      <div style="margin-top:26mm;display:flex;justify-content:space-between;font-size:9pt;text-align:center">${['প্রস্তুতকারী', 'যাচাইকারী (হিসাব)', 'অনুমোদনকারী'].map(x => `<div style="width:50mm;border-top:.25mm solid #0f172a;padding-top:1mm">${x}</div>`).join('')}</div></div>`];
  },
  installmentSchedule(plan) {
    const st = DB.student(plan.studentId), invs = plan.invoiceIds.map(id => DB.s.invoices.find(i => i.id === id));
    return [`<div class="sheet padded">${this.header('কিস্তিতে পরিশোধের পরিকল্পনা')}
      <div style="font-size:10.5pt;line-height:1.8"><b>পরিকল্পনা:</b> ${plan.id} · ${esc(plan.title)}<br><b>শিক্ষার্থী:</b> ${esc(pn(st))} · ${esc(DB.className(st.classId))} · রোল ${bnNum(st.roll)} · ${st.id}<br><b>মোট:</b> ${U.money(plan.total)} — ${bnNum(plan.count)}টি ${esc(bn(plan.frequency))} কিস্তিতে · <b>কারণ:</b> ${esc(plan.reason || '—')}</div>
      <table class="ms-table" style="margin-top:5mm"><thead><tr><th>#</th><th>পরিশোধের শেষ তারিখ</th><th>পরিমাণ</th><th>অবস্থা</th></tr></thead><tbody>${invs.map((i, k) => `<tr><td>${bnNum(k + 1)}</td><td>${U.fmtDate(i.due)}</td><td>${U.money(i.amount)}</td><td>${esc(bn(i.status))}</td></tr>`).join('')}</tbody></table>
      <p style="font-size:9pt;color:#475569;margin-top:5mm">প্রতিটি পরিশোধের শেষ তারিখের ৩ দিন আগে অভিভাবককে স্বয়ংক্রিয় এসএমএস অনুস্মারক পাঠানো হয়। যে কিস্তির সময় এখনো হয়নি, তার জন্য প্রবেশপত্র আটকানো হয় না।</p>
      <div style="margin-top:22mm;display:flex;justify-content:space-between;align-items:flex-end"><div style="width:55mm;border-top:.25mm solid #0f172a;text-align:center;font-size:9pt;padding-top:1mm">অভিভাবকের স্বাক্ষর</div>${this.signature('Principal')}</div></div>`];
  },
  /** Transfer certificate (ছাড়পত্র) in formal certificate Bangla. */
  certificate(cert) {
    const { name, father } = this.certNames(cert);
    return [`<div class="sheet padded" style="border:3mm double var(--brand-ink)">${this.header(esc(bn(cert.type || 'Transfer Certificate')))}
      <div style="text-align:right;font-size:9pt;margin-top:4mm">ক্রমিক নম্বর: <b>${esc(cert.serial)}</b><br>তারিখ: ${U.fmtDate(cert.issueDate)}</div>
      <div style="font-size:12pt;line-height:2;margin-top:10mm;text-align:justify">এই মর্মে প্রত্যয়ন করা যাচ্ছে যে, <b>${esc(name)}</b>, পিতা: <b>${esc(father)}</b>, এই প্রতিষ্ঠানের একজন নিয়মিত শিক্ষার্থী ছিল এবং <b>${esc(cert.classLeft)}</b> (রোল ${bnNum(cert.roll)}) থেকে প্রতিষ্ঠান ত্যাগ করেছে।
      প্রতিষ্ঠান ত্যাগের কারণ: ${esc(cert.reason)}। প্রতিষ্ঠানে অধ্যয়নকালে তার আচরণ ও চরিত্র <b>${esc(bn(cert.conduct))}</b> ছিল। ${cert.duesCleared ? 'তার নিকট প্রতিষ্ঠানের সকল পাওনা পরিশোধিত হয়েছে।' : 'তার নিকট প্রতিষ্ঠানের পাওনা বকেয়া রয়েছে।'}
      আমি তার জীবনের সর্বাঙ্গীণ উন্নতি ও সাফল্য কামনা করি।</div>
      <div style="margin-top:12mm;display:flex;justify-content:space-between;align-items:flex-end"><div style="text-align:center">${qr(verifyUrl('tc', cert.serial), 90)}<div style="font-size:8pt">ক্রমিক নম্বর ${esc(cert.serial)}<br>প্রদানের তারিখ ${U.fmtDate(cert.issueDate)}</div></div>${this.stamp()}${this.signature('Principal')}</div></div>`];
  },
};
/* Ctrl+P on the print view prints the document; elsewhere nothing stale is left in #print-root. */
window.addEventListener('beforeprint', () => { if (location.pathname.startsWith('/print/') && Print._cur?.sheets) Print.stage(Print._cur.sheets, Print._cur.opts); });
window.addEventListener('afterprint', () => { const r = document.getElementById('print-root'); if (r) r.innerHTML = ''; });
