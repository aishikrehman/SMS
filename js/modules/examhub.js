/* ==========================================================================
   EXAM CENTRE (পরীক্ষা কেন্দ্র) — every exam task in one place:
   exams & setup · routine · exam-based syllabus · question papers ·
   mark distribution · solutions · results (publish, averages, combined).
   One page shared by the principal, Root User, teacher, student and guardian
   portals; each role sees only the tabs and actions it may use.
   Also: class/subject participation per exam (DB.result respects it),
   combined results across exams (DB.combinedResult) and class averages.
   Load after exams.js and academics.js.
   ========================================================================== */

Object.assign(BN_LABELS, { submitted: 'জমা হয়েছে', approved: 'অনুমোদিত', draft: 'খসড়া', question: 'প্রশ্নপত্র', solution: 'সমাধান' });

/* ---------- participation, combined results, averages ---------- */
Object.assign(DB, {
  /** Classes sitting an exam (exam.classes empty/absent = every class). */
  examClasses(ex) { ex = typeof ex === 'string' ? this.exam(ex) : ex; return this.s.classes.filter(c => !ex?.classes?.length || ex.classes.includes(c.id)); },
  /** Does a class — and optionally one of its subjects — take part in an exam? (exam.classes, exam.classSubjects, per-subject "included") */
  examTakes(ex, classId, subjectId) {
    ex = typeof ex === 'string' ? this.exam(ex) : ex; if (!ex) return false;
    if (ex.classes?.length && !ex.classes.includes(classId)) return false;
    if (!subjectId) return true;
    if (!Grade.included(ex, subjectId)) return false;
    const l = ex.classSubjects?.[classId]; return !l || l.includes(subjectId);
  },
  examSubjects(ex, classId) { return this.classSubjects(classId).filter(s => this.examTakes(ex, classId, s.id)); },
  /** GPA / letter / totals / pass for a set of graded subject rows (same rules as DB.result). */
  examAggregate(rows, ex, campus) {
    const scale = Grade.scale(campus, ex?.session, ex), bands = Grade.bands(campus, ex?.session, ex);
    const gpa = Grade.gpaFrom(rows.map(x => x.point), scale, ex?.failRule);
    const max = U.sum(rows, x => x.max), total = U.sum(rows, x => x.total), pct = max ? total / max * 100 : 0, failed = rows.some(x => x.failed);
    const letter = scale === 'letter' ? Grade.letterForPct(pct, bands) : Grade.letterForGpa(gpa, bands);
    return { rows, gpa, scale, letter, total, max, pct, passed: rows.length > 0 && (ex?.failRule === 'average' ? (gpa ?? pct / 20) > 0 && !rows.every(x => x.failed) : !failed) };
  },
  /** Final result of an exam that carries earlier exams forward (Exam setup → card 7).
      Per subject of THIS exam: pct = Σ(pct_i × w_i) / Σ w_i over this exam (own weight) + the chosen earlier exams.
      Subject missing from an earlier exam → exam.combineRule: 'redistribute' (default: only exams that had it, weights re-scaled),
      'zero' (missing counts 0 %, weights unchanged), 'self' (only this exam's marks for that subject).
      Returns the plain result (+ combined:false) when nothing is combined. */
  combinedResult(studentId, examId) {
    const ex = this.exam(examId), base = this.result(studentId, examId);
    const src = (ex?.combine || []).map(c => ({ exam: this.exam(c.examId), weight: +c.weight || 0 })).filter(c => c.exam && c.weight > 0);
    if (!src.length) return { ...base, combined: false, base };
    const own = ex.combineSelf ?? Math.max(0, 100 - U.sum(src, c => c.weight)), rule = ex.combineRule || 'redistribute';
    const parts = [{ exam: ex, weight: own, res: base, self: true }, ...src.map(c => ({ ...c, res: this.result(studentId, c.exam.id) }))];
    const campus = this.campusOf(this.student(studentId)?.classId), bands = Grade.bands(campus, ex.session, ex), fail = bands[bands.length - 1];
    const rows = base.rows.map(row => {
      const items = parts.map(p => { const r = p.res.rows.find(x => x.subject.id === row.subject.id); return { exam: p.exam, weight: p.weight, pct: r ? r.pct : null, total: r ? r.total : null, max: r ? r.max : null }; });
      const missing = items.some(i => i.pct === null);
      const used = rule === 'zero' ? items.map(i => ({ ...i, pct: i.pct ?? 0 })) : rule === 'self' && missing ? [items[0]] : items.filter(i => i.pct !== null);
      const W = U.sum(used, i => i.weight), pct = W ? U.sum(used, i => i.pct * i.weight) / W : row.pct;
      items.forEach(i => { const u = used.find(x => x.exam === i.exam); i.share = u && W ? u.weight / W * 100 : 0; if (rule === 'zero' && i.pct === null) i.zero = true; });
      const g = bands.find(b => pct >= b.min) || fail;
      return { subject: row.subject, items, missing, pct, max: row.max, total: Math.round(pct * row.max) / 100, letter: g.letter, point: g.point, failed: g === fail && bands.length > 1 };
    });
    return { ...this.examAggregate(rows, ex, campus), exam: ex, combined: true, rule, parts: parts.map(p => ({ exam: p.exam, weight: p.weight, self: !!p.self, gpa: p.res.gpa, pct: p.res.pct })), base };
  },
  /** Short-lived cache for heavy per-class figures (cleared every ~1.5 s, so edits show at once). */
  _xc() { if (Date.now() - (this._xcT || 0) > 1500) { this._xcache = {}; this._xcT = Date.now(); } return this._xcache; },
  /** Class average: of one subject → { avg (marks), pct, max (highest), n, pass (rate %) }; of the whole exam → { pct, gpa, total, n }. */
  classAverage(examId, classId, subjectId) {
    const c = this._xc(), key = `avg|${examId}|${classId}|${subjectId || ''}`; if (key in c) return c[key];
    const ex = this.exam(examId), list = this.studentsIn(classId), ids = new Set(list.map(s => s.id));
    let out = null;
    if (subjectId) {
      const ms = this.s.marks.filter(m => m.examId === examId && m.subjectId === subjectId && ids.has(m.studentId) && !m.absent), cfg = Grade.cfg(ex, subjectId), full = cfg.full, campus = this.campusOf(classId);
      const gs = ms.map(m => { const v = this.markVals(m, ex, subjectId, m.studentId); return Grade.of(v.cq, v.mcq, ex, campus, v.pr, subjectId, v); }), tot = gs.map(g => g.total);
      if (tot.length) { const avg = U.sum(tot) / tot.length; out = { avg, pct: full ? avg / full * 100 : 0, full, max: Math.max(...tot), n: tot.length, pass: gs.filter(g => !g.failed).length / tot.length * 100 }; }
    } else {
      const rs = list.map(s => this.result(s.id, examId)).filter(r => r.rows.length), gs = rs.map(r => r.gpa).filter(g => g !== null);
      if (rs.length) out = { pct: U.sum(rs, r => r.pct) / rs.length, total: U.sum(rs, r => r.total) / rs.length, gpa: gs.length ? U.sum(gs) / gs.length : null, n: rs.length };
    }
    return (c[key] = out);
  },
  /** Students of a class with marks in an exam, ranked by the final (combined when set) result. Items: { st, r (this exam), c (final), pos }. */
  examRanking(examId, classId) {
    const c = this._xc(), key = `rank|${examId}|${classId}`; if (c[key]) return c[key];
    const list = this.studentsIn(classId).map(st => { const f = this.combinedResult(st.id, examId); return { st, r: f.base, c: f }; }).filter(x => x.r.rows.length);
    list.sort((a, b) => ((b.c.gpa ?? b.c.pct / 20) - (a.c.gpa ?? a.c.pct / 20)) || (b.c.total - a.c.total));
    list.forEach((x, i) => x.pos = i + 1);
    return (c[key] = list);
  },
  /** Routine slot of one paper (null when not scheduled). */
  paperSlot(ex, classId, subjectId) { return (ex?.schedule || []).find(r => r.subjectId === subjectId && (!r.classIds?.length || r.classIds.includes(classId))) || null; },
});

/* DB.result honours class participation and per-class subjects (exam.classes / exam.classSubjects). */
const _examResult = DB.result.bind(DB);
DB.result = function (studentId, examId) {
  const r = _examResult(studentId, examId), ex = r.exam, cls = DB.student(studentId)?.classId;
  if (!ex || (!ex.classes?.length && !ex.classSubjects?.[cls])) return r;
  const rows = r.rows.filter(x => DB.examTakes(ex, cls, x.subject.id));
  return rows.length === r.rows.length ? r : { ...r, ...DB.examAggregate(rows, ex, DB.campusOf(cls)) };
};

/* ---------- structural: empty collections ---------- */
DB.addSeeder('examPapers', () => []);
DB.addSeeder('examSyllabus', () => []);

/* ---------- the Exam Centre ---------- */
const ExamHub = {
  TABS: [['list', 'মৌলিক সেটিংস', 'settings-2'], ['routine', 'রুটিন', 'calendar-clock'], ['syllabus', 'পাঠ্যসূচি', 'book-open'], ['papers', 'প্রশ্নপত্র', 'file-text'], ['marks', 'মানবণ্টন', 'scale'], ['solutions', 'সমাধান', 'file-check'], ['results', 'ফলাফল', 'award']],
  role() { return App.session?.role; },
  isStaff() { return ['ADMIN', 'PRINCIPAL'].includes(this.role()); },
  canManage() { return this.isStaff() && App.perm('exams', 'edit'); },
  isTeacher() { return this.role() === 'TEACHER'; },
  isLearner() { return ['STUDENT', 'GUARDIAN'].includes(this.role()); },
  kid() { return this.role() === 'STUDENT' ? Student.me() : this.role() === 'GUARDIAN' ? Guardian.child() : null; },
  tabs() { return this.TABS.filter(([id]) => !this.isLearner() || !['list', 'marks'].includes(id)); },
  /** A teacher's own class + subject (routine-based). */
  mine(classId, subjectId) { return this.isTeacher() && Teacher.myClasses().includes(classId) && Teacher.mySubjects(classId).includes(subjectId); },
  /** May the current user write (syllabus note, question paper, solution) for this class & subject? */
  canWrite(classId, subjectId) { return App.perm('exams', 'edit') && (this.isStaff() || this.mine(classId, subjectId)); },
  exams() {
    if (this.isLearner()) { const k = this.kid(); return k ? DB.s.exams.filter(e => DB.examTakes(e, k.classId)).sort((a, b) => b.start.localeCompare(a.start)) : []; }
    return DB.examsOf(App.ui.exSes || DB.session());
  },
  classes(ex) {
    if (this.isLearner()) { const k = this.kid(); return k && DB.examTakes(ex, k.classId) ? [DB.cls(k.classId)] : []; }
    const list = DB.examClasses(ex).filter(c => c.campusId === DB.campusId());
    return this.isTeacher() ? list.filter(c => Teacher.myClasses().includes(c.id)) : list;
  },
  state() {
    const ui = App.ui.xh || (App.ui.xh = { tab: this.isLearner() ? 'routine' : 'list' });
    if (!this.tabs().some(t => t[0] === ui.tab)) ui.tab = this.tabs()[0][0];
    const list = this.exams();
    if (!list.some(e => e.id === ui.exam)) { const cur = Academics.currentExam(); ui.exam = (list.find(e => e.id === cur?.id) || list.find(e => !e.published) || list[0])?.id; }
    const ex = DB.exam(ui.exam), cls = ex ? this.classes(ex) : [];
    if (!cls.some(c => c.id === ui.cls)) ui.cls = cls[0]?.id;
    return { ui, ex, cls };
  },
  render() {
    const { ui, ex, cls } = this.state(), L = this.isLearner();
    const sub = L ? 'পরীক্ষার রুটিন, পাঠ্যসূচি, প্রকাশিত প্রশ্নপত্র ও সমাধান এবং ফলাফল — এক জায়গায়।'
      : this.isTeacher() ? 'রুটিন, পাঠ্যসূচি ও মানবণ্টন দেখুন; নিজের বিষয়ের প্রশ্নপত্র ও সমাধান জমা দিন; ফলাফল দেখুন।'
      : 'পরীক্ষা সেটআপ, রুটিন, পাঠ্যসূচি, প্রশ্নপত্র, মানবণ্টন, সমাধান ও ফলাফল প্রকাশ — সব এক জায়গায়।';
    const actions = (L ? '' : `<select class="select !w-auto" onchange="App.ui.exSes=this.value;App.refresh()" aria-label="শিক্ষাবর্ষ">${sessionOptions(App.ui.exSes || DB.session())}</select>`);
    let html = pageHeader('পরীক্ষা কেন্দ্র', sub, actions) + (this.role() === 'GUARDIAN' ? Guardian.switcher() : '') + pills(this.tabs(), ui.tab, id => `App.ui.xh.tab='${id}';App.refresh()`);
    if (L && !this.kid()) return html + `<div class="card p-6">${emptyState('কোনো শিক্ষার্থী সংযুক্ত নেই।')}</div>`;
    if (ui.tab === 'list') return html + this.listTab();
    if (!ex) return html + `<div class="card p-6">${emptyState('কোনো পরীক্ষা পাওয়া যায়নি।')}</div>`;
    html += this.filterBar(ex, cls, ui);
    if (!ui.cls && ui.tab !== 'routine') return html + `<div class="card p-6">${emptyState(L ? 'এই পরীক্ষায় তোমার শ্রেণি অংশ নিচ্ছে না।' : 'এই ক্যাম্পাসে আপনার কোনো শ্রেণি এই পরীক্ষায় অংশ নিচ্ছে না।', 'circle-slash')}</div>`;
    const t = ui.tab;
    return html + (t === 'routine' ? this.routineTab(ex, ui.cls) : t === 'syllabus' ? this.syllabusTab(ex, ui.cls) : t === 'papers' ? this.papersTab(ex, ui.cls, 'question') : t === 'solutions' ? this.papersTab(ex, ui.cls, 'solution') : t === 'marks' ? this.marksTab(ex, ui.cls) : this.resultsTab(ex, ui.cls));
  },
  mount() { },
  filterBar(ex, cls, ui) {
    const list = this.exams();
    return `<div class="card p-4 mb-4 flex flex-wrap gap-3 items-end"><div class="min-w-0 max-w-full"><label class="label">পরীক্ষা</label><select class="select" onchange="App.ui.xh.exam=this.value;App.refresh()">${list.map(e => `<option value="${e.id}" ${e.id === ex.id ? 'selected' : ''}>${esc(e.name)}${e.published ? '' : ' (ফলাফল অপ্রকাশিত)'}</option>`).join('')}</select></div>
      ${this.isLearner() ? '' : `<div><label class="label">শ্রেণি</label><select class="select" onchange="App.ui.xh.cls=this.value;App.refresh()">${cls.map(c => `<option value="${c.id}" ${c.id === ui.cls ? 'selected' : ''}>${esc(DB.className(c.id))}</option>`).join('') || '<option value="">কোনো শ্রেণি নেই</option>'}</select></div>`}
      <div class="flex-1"></div><div class="text-slate-600">${esc(bn(ex.type))} · শুরু ${U.fmtDate(ex.start)} · ${ex.classes?.length ? `${bnNum(DB.examClasses(ex).length)}টি শ্রেণি` : 'সকল শ্রেণি'}${ex.combine?.length ? ' · আগের পরীক্ষার ফল যুক্ত' : ''}</div></div>`;
  },
  note(html) { return `<div class="card p-4 mb-4 text-slate-600 flex gap-2">${icon('info', 'w-5 h-5 shrink-0 text-brand-600')}<div>${html}</div></div>`; },
  f1(v) { return v === null || v === undefined || isNaN(v) ? '—' : bnNum(Math.round(v * 10) / 10); },

  /* ---------- মৌলিক সেটিংস: exam cards (one setup entry each) and the session's grading schemes ---------- */
  listTab() {
    const ses = App.ui.exSes || DB.session(), m = this.canManage(), sub = m && App.ui.xhList === 'grading' ? 'grading' : 'exams';
    const list = DB.examsOf(ses), wsum = U.sum(list, e => +e.weight || 0);
    const head = `<div class="flex flex-wrap items-center gap-2 mb-4">${m ? pills([['exams', 'পরীক্ষার তালিকা', 'clipboard-list'], ['grading', 'গ্রেডিং পদ্ধতি', 'scale']], sub, id => `App.ui.xhList='${id}';App.refresh()`) : ''}<span class="flex-1"></span>
      ${sub === 'exams' ? `${badge(`মোট ভার ${bnNum(wsum)}%`, wsum === 100 ? 'green' : 'amber')}${m ? `<button class="btn btn-primary" onclick="Exams.setup()">${icon('plus')} নতুন পরীক্ষা</button>` : ''}` : ''}</div>`;
    if (sub === 'grading') return head + Exams.schemesHtml(ses);
    if (!list.length) return head + `<div class="card p-6">${emptyState('এই শিক্ষাবর্ষে কোনো পরীক্ষা নেই।', 'clipboard-list')}</div>`;
    const marked = new Map(); DB.s.marks.forEach(x => { if (!marked.has(x.examId)) marked.set(x.examId, new Set()); marked.get(x.examId).add(x.studentId); });
    const card = e => {
      const full = Grade.cfg(e).full, papers = (e.schedule || []).length, n = marked.get(e.id)?.size || 0;
      const stat = (label, v) => `<div class="min-w-0"><div class="text-slate-500">${label}</div><div class="font-semibold">${v}</div></div>`;
      return `<div class="card p-4 flex flex-col gap-3"><div class="flex items-start gap-3"><div class="w-10 h-10 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">${icon('clipboard-list', 'w-5 h-5')}</div>
        <div class="flex-1 min-w-0"><div class="font-semibold truncate">${esc(e.name)}</div><div class="flex flex-wrap gap-1 mt-1">${badge(bn(e.type), MAJOR_EXAMS.includes(e.type) ? 'blue' : e.type === 'Tutorial' ? 'violet' : 'slate')}${badge(e.published ? 'ফলাফল প্রকাশিত' : 'অপ্রকাশিত', e.published ? 'green' : 'slate')}${e.combine?.length ? badge('সমন্বিত', 'violet') : ''}</div></div></div>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">${stat('শুরু', U.fmtDate(e.start))}${stat('শ্রেণি', e.classes?.length ? `${bnNum(e.classes.length)}টি` : 'সকল')}${stat('পূর্ণমান', bnNum(full))}${stat('ভার', `${bnNum(e.weight)}%`)}${stat('রুটিনে পত্র', bnNum(papers))}${stat('নম্বর পেয়েছে', `${bnNum(n)} জন`)}</div>
        ${m ? `<div class="flex flex-wrap gap-2 mt-auto pt-2 border-t border-slate-100"><button class="btn btn-primary btn-sm" onclick="Exams.setup('${e.id}')">${icon('sliders-horizontal')} সেটআপ</button><button class="btn btn-ghost btn-sm" onclick="Exams.schedule('${e.id}')">${icon('calendar-clock')} রুটিন</button><span class="flex-1"></span><button class="btn btn-sm ${e.published ? 'btn-success' : 'btn-ghost'}" onclick="Exams.togglePublish('${e.id}')">${icon(e.published ? 'eye' : 'eye-off')} ${e.published ? 'প্রকাশিত' : 'প্রকাশ করুন'}</button></div>` : ''}</div>`;
    };
    return head + `<div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">${list.map(card).join('')}</div>`;
  },

  /* ---------- রুটিন ---------- */
  routineRows(ex, cls) { return (ex.schedule || []).filter(r => !cls || ((!r.classIds?.length || r.classIds.includes(cls)) && DB.examTakes(ex, cls, r.subjectId))); },
  classLabel(r) { return r.classIds?.length ? r.classIds.map(id => DB.className(id)).join(', ') : 'সকল অংশগ্রহণকারী শ্রেণি'; },
  routineTab(ex, cls) {
    const L = this.isLearner(), all = !L && (App.ui.xh.rAll || !cls), rows = this.routineRows(ex, all ? null : cls), now = U.today();
    const tools = `<div class="flex flex-wrap gap-2 items-start">${L ? '' : pills([['one', 'নির্বাচিত শ্রেণি', 'filter'], ['all', 'সকল শ্রেণি', 'layers']], all ? 'all' : 'one', id => `App.ui.xh.rAll=${id === 'all'};App.refresh()`)}<span class="flex-1"></span>${this.canManage() ? `<button class="btn btn-ghost" onclick="Exams.schedule('${ex.id}')">${icon('pencil')} রুটিন সম্পাদনা</button>` : ''}${rows.length ? `<button class="btn btn-primary" onclick="ExamHub.printRoutine('${ex.id}', ${all ? 'null' : `'${cls}'`})">${icon('printer')} মুদ্রণ</button>` : ''}</div>`;
    if (!rows.length) return tools + `<div class="card p-6">${emptyState('এই পরীক্ষার রুটিন এখনো প্রকাশিত হয়নি।', 'calendar-x')}${this.canManage() ? `<div class="text-center"><button class="btn btn-primary" onclick="Exams.schedule('${ex.id}')">${icon('plus')} রুটিন তৈরি করুন</button></div>` : ''}</div>`;
    return tools + `<div class="card scroll-x"><table class="table"><thead><tr><th>তারিখ</th><th>বার</th><th>সময়</th><th>বিষয়</th>${all ? '<th>শ্রেণি</th>' : ''}<th>কক্ষ</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr class="${r.date < now ? 'opacity-60' : ''}"><td class="whitespace-nowrap font-semibold">${U.fmtDate(r.date)}</td><td>${U.dayBn(new Date(r.date))}</td><td class="whitespace-nowrap">${U.bn(r.start)}–${U.bn(r.end)}</td><td class="font-semibold">${esc(DB.subject(r.subjectId)?.name || '')}</td>${all ? `<td>${esc(this.classLabel(r))}</td>` : ''}<td>${esc(U.bn(r.room || ''))}</td><td>${r.date < now ? badge('সম্পন্ন', 'slate') : r.date === now ? badge('আজ', 'blue') : ''}</td></tr>`).join('')}</tbody></table></div>`;
  },
  printRoutine(examId, cls) {
    const ex = DB.exam(examId), rows = this.routineRows(ex, cls), per = 22, sheets = [];
    for (let i = 0; i === 0 || i < rows.length; i += per) {
      const last = i + per >= rows.length;
      sheets.push(`${Print.sheet({}, 'padded')}${Print.header('পরীক্ষার রুটিন')}<div style="display:flex;justify-content:space-between;font-size:11pt;margin-bottom:4mm"><b>${esc(ex.name)}</b><span>${cls ? esc(DB.className(cls)) : 'সকল শ্রেণি'} · শিক্ষাবর্ষ ${esc(U.bn(ex.session))}</span></div>
        <table class="ms-table"><thead><tr><th>তারিখ</th><th>বার</th><th>সময়</th><th>বিষয়</th>${cls ? '' : '<th>শ্রেণি</th>'}<th>কক্ষ</th></tr></thead><tbody>${rows.slice(i, i + per).map(r => `<tr><td>${U.fmtDate(r.date)}</td><td>${U.dayBn(new Date(r.date))}</td><td>${U.bn(r.start)}–${U.bn(r.end)}</td><td><b>${esc(DB.subject(r.subjectId)?.name || '')}</b></td>${cls ? '' : `<td>${esc(this.classLabel(r))}</td>`}<td>${esc(U.bn(r.room || ''))}</td></tr>`).join('')}</tbody></table>
        ${last ? `<div style="margin-top:5mm;font-size:9pt;color:#475569;line-height:1.6">• পরীক্ষা শুরুর ৩০ মিনিট আগে প্রবেশপত্রসহ উপস্থিত থাকতে হবে। • ইলেকট্রনিক যন্ত্র নিষিদ্ধ। • রুটিন পরিবর্তন হলে নোটিশ ও পোর্টালে জানানো হবে।</div><div style="position:absolute;bottom:18mm;right:14mm">${Print.signature('Exam Controller')}</div>` : ''}</div>`);
    }
    Print.preview('পরীক্ষার রুটিন', sheets, { re: ['ExamHub.printRoutine', examId, cls || null] });
  },

  /* ---------- পাঠ্যসূচি (exam-based syllabus) ---------- */
  /** Chapters tagged with this exam in the chapter tracker (curriculum) + the free-text note added here. */
  syllabusData(ex, cls) {
    return DB.examSubjects(ex, cls).map(s => {
      const seen = new Set(), chapters = [];
      DB.s.syllabus.filter(sy => sy.classId === cls && sy.subjectId === s.id).forEach(sy => sy.chapters.filter(c => (typeof chExams === 'function' ? chExams(c) : [c.examId]).includes(ex.id)).forEach(c => {
        if (seen.has(c.name)) return; seen.add(c.name);
        chapters.push({ name: c.name, topics: (c.topics || []).map(t => t.name.startsWith(c.name + ':') ? t.name.slice(c.name.length + 1).trim() : t.name), status: Academics.chapterStatus(c) });
      }));
      return { subject: s, chapters, note: (DB.s.examSyllabus || []).find(n => n.examId === ex.id && n.classId === cls && n.subjectId === s.id) };
    });
  },
  syllabusTab(ex, cls) {
    const data = this.syllabusData(ex, cls), staffView = !this.isLearner();
    return this.note(`পরীক্ষাভিত্তিক পাঠ্যসূচি = পাঠ্যক্রমের যে অধ্যায়গুলো শিক্ষক <b>পাঠ্যসূচি অগ্রগতি</b>-তে এই পরীক্ষার সঙ্গে যুক্ত করেছেন, সঙ্গে এখানে যোগ করা অতিরিক্ত নির্দেশনা।${this.isTeacher() ? ` <button class="btn btn-ghost btn-sm" onclick="App.go('teacher','syllabus')">${icon('link')} অধ্যায় যুক্ত করুন</button>` : ''}`)
      + `<div class="flex flex-wrap gap-2 mb-4"><span class="flex-1"></span><button class="btn btn-primary" onclick="ExamHub.printSyllabus('${ex.id}','${cls}')">${icon('printer')} পাঠ্যসূচি মুদ্রণ</button></div>
      <div class="grid lg:grid-cols-2 gap-4">${data.map(d => `<div class="card"><div class="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2"><div class="font-semibold flex-1">${esc(d.subject.name)}</div>${badge(`${bnNum(d.chapters.length)}টি অধ্যায়`, 'blue')}${this.canWrite(cls, d.subject.id) ? `<button class="btn btn-ghost btn-sm" onclick="ExamHub.editNote('${ex.id}','${cls}','${d.subject.id}')">${icon('pencil')} নির্দেশনা</button>` : ''}</div>
        <div class="px-5 py-3 space-y-2">${d.chapters.length ? `<ol class="list-decimal ml-5 space-y-1.5">${d.chapters.map(c => `<li><b>${esc(c.name)}</b>${staffView ? ` <span class="ml-1">${badge(bn(c.status), TOPIC_TONE[c.status] || 'slate')}</span>` : ''}${c.topics.length ? `<div class="text-slate-500">${esc(c.topics.join(' · '))}</div>` : ''}</li>`).join('')}</ol>` : '<div class="text-slate-400">এই পরীক্ষার সঙ্গে কোনো অধ্যায় যুক্ত করা হয়নি।</div>'}
          ${d.note ? `<div class="rounded-lg bg-amber-50 border border-amber-200 p-3 whitespace-pre-line"><b>অতিরিক্ত নির্দেশনা:</b>\n${esc(d.note.text)}</div>` : ''}</div></div>`).join('') || `<div class="card p-6">${emptyState('এই শ্রেণির কোনো বিষয় এই পরীক্ষায় নেই।')}</div>`}</div>`;
  },
  editNote(examId, cls, sid) {
    if (!this.canWrite(cls, sid)) return toast('এই বিষয়ের পাঠ্যসূচি পরিবর্তনের অনুমতি নেই।', 'error');
    const list = DB.s.examSyllabus || (DB.s.examSyllabus = []), n = list.find(x => x.examId === examId && x.classId === cls && x.subjectId === sid);
    Modal.open({ title: `অতিরিক্ত নির্দেশনা · ${DB.subject(sid).name}`, size: 'md', body: `<form id="xs-note" class="space-y-3"><p class="text-slate-500">${esc(DB.exam(examId).name)} · ${esc(DB.className(cls))} — অধ্যায় তালিকার বাইরে যা পরীক্ষায় আসবে (যেমন: রচনা, পত্রলিখন, ব্যাকরণের নির্দিষ্ট অংশ, ব্যবহারিক)।</p><textarea class="input" name="text" rows="8">${esc(n?.text || '')}</textarea><button class="btn btn-primary w-full">${icon('save')} সংরক্ষণ করুন</button></form>` });
    $('#xs-note').addEventListener('submit', ev => {
      ev.preventDefault(); const text = ev.target.text.value.trim();
      if (!text) DB.s.examSyllabus = list.filter(x => x !== n);
      else if (n) Object.assign(n, { text, by: App.session.userId, updated: U.today() });
      else list.push({ examId, classId: cls, subjectId: sid, text, by: App.session.userId, updated: U.today() });
      DB.audit('EXAM_SYLLABUS', 'exams', `${examId} · ${cls} · ${sid}: অতিরিক্ত নির্দেশনা ${text ? 'হালনাগাদ' : 'মুছে ফেলা'}`); DB.save(); Modal.close(); toast('পাঠ্যসূচি সংরক্ষিত হয়েছে।', 'success'); App.refresh();
    });
  },
  printSyllabus(examId, cls) {
    const ex = DB.exam(examId), data = this.syllabusData(ex, cls), pages = [[]];
    let left = 40;   // rough line budget per page (first page carries the header)
    data.forEach(d => {
      const noteLines = d.note ? d.note.text.split('\n').reduce((a, l) => a + Math.max(1, Math.ceil(l.length / 80)), 0) + 1 : 0, lines = 3 + Math.max(1, d.chapters.length * 2) + noteLines;
      if (lines > left && pages[pages.length - 1].length) { pages.push([]); left = 48; }
      left -= lines;
      pages[pages.length - 1].push(`<div style="border:.3mm solid #cbd5e1;border-radius:2mm;margin-bottom:4mm;overflow:hidden"><div style="background:#eef2ff;padding:1.5mm 3mm;font-weight:700;font-size:11pt;display:flex;justify-content:space-between"><span>${esc(d.subject.name)}</span><span style="font-weight:400;font-size:9pt">${bnNum(d.chapters.length)}টি অধ্যায় · পূর্ণমান ${bnNum(Grade.cfg(ex, d.subject.id).full)}</span></div>
        ${d.chapters.length ? `<ol style="margin:0;padding:2mm 3mm 2mm 9mm;font-size:10pt;line-height:1.45">${d.chapters.map(c => `<li><b>${esc(c.name)}</b>${c.topics.length ? `<div style="color:#475569;font-size:8.5pt">${esc(c.topics.join(' · '))}</div>` : ''}</li>`).join('')}</ol>` : '<div style="padding:2mm 3mm;color:#94a3b8;font-size:9.5pt">অধ্যায় এখনো নির্ধারিত হয়নি।</div>'}
        ${d.note ? `<div style="padding:0 3mm 2mm;font-size:9.5pt;white-space:pre-line"><b>অতিরিক্ত:</b> ${esc(d.note.text)}</div>` : ''}</div>`);
    });
    const sheets = pages.map((p, i) => `${Print.sheet({}, 'padded')}${i === 0 ? `${Print.header('পরীক্ষার পাঠ্যসূচি')}<div style="display:flex;justify-content:space-between;font-size:11pt;margin-bottom:4mm"><b>${esc(ex.name)}</b><span>${esc(DB.className(cls))} · শিক্ষাবর্ষ ${esc(U.bn(ex.session))}</span></div>` : `<div style="font-size:10pt;color:#475569;margin-bottom:4mm">${esc(ex.name)} · ${esc(DB.className(cls))} — পাঠ্যসূচি (চলমান)</div>`}${p.join('')}
      <div style="position:absolute;bottom:10mm;left:14mm;right:14mm;display:flex;justify-content:space-between;font-size:7.5pt;color:#64748b"><span>প্রস্তুতের তারিখ ${U.fmtDate(U.today())}</span><span>পৃষ্ঠা ${bnNum(i + 1)}/${bnNum(pages.length)}</span></div></div>`);
    Print.preview('পরীক্ষার পাঠ্যসূচি', sheets, { re: ['ExamHub.printSyllabus', examId, cls] });
  },

  /* ---------- প্রশ্নপত্র ও সমাধান ---------- */
  papers() { return DB.s.examPapers || (DB.s.examPapers = []); },
  paper(kind, examId, cls, sid) { return this.papers().find(p => p.kind === kind && p.examId === examId && p.classId === cls && p.subjectId === sid); },
  /** Has that paper's sitting ended? (routine date + end time; no routine row → once the exam's results are published) */
  paperOver(ex, cls, sid) {
    const slot = DB.paperSlot(ex, cls, sid); if (!slot) return !!ex.published;
    const d = new Date(); return `${U.today()} ${U.pad(d.getHours())}:${U.pad(d.getMinutes())}` >= `${slot.date} ${slot.end || '23:59'}`;
  },
  canSee(p) {
    if (this.isStaff()) return true;
    if (this.isTeacher()) return this.mine(p.classId, p.subjectId);
    const k = this.kid(); return !!k && k.classId === p.classId && p.status === 'approved' && p.published && this.paperOver(DB.exam(p.examId), p.classId, p.subjectId);
  },
  papersTab(ex, cls, kind) {
    const subs = DB.examSubjects(ex, cls), word = kind === 'question' ? 'প্রশ্নপত্র' : 'সমাধান';
    if (this.isLearner()) {
      return this.note(`${word} প্রকাশিত হলে সংশ্লিষ্ট বিষয়ের পরীক্ষা শেষ হওয়ার পরে এখানে দেখা যাবে।`) + `<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">${subs.map(s => {
        const p = this.paper(kind, ex.id, cls, s.id), ok = p && this.canSee(p), slot = DB.paperSlot(ex, cls, s.id);
        return `<div class="card p-4 flex gap-3"><div class="w-10 h-10 rounded-lg ${ok ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-400'} flex items-center justify-center shrink-0">${icon(ok ? (kind === 'question' ? 'file-text' : 'file-check') : 'lock', 'w-5 h-5')}</div><div class="min-w-0 flex-1"><div class="font-semibold">${esc(s.name)}</div><div class="text-slate-500">${slot ? `${U.fmtDate(slot.date)} · ${U.bn(slot.start)}–${U.bn(slot.end)}` : 'রুটিনে তারিখ নেই'}</div>
          ${ok ? `<button class="btn btn-primary btn-sm mt-2" onclick="ExamHub.openPaper('${p.id}')">${icon('eye')} দেখুন</button>` : `<div class="text-slate-400 mt-1">এখনো দেখা যাবে না</div>`}</div></div>`;
      }).join('') || emptyState('কোনো বিষয় নেই।')}</div>`;
    }
    const rows = subs.filter(s => this.isStaff() || this.mine(cls, s.id)), m = this.canManage(), T = this.isTeacher();
    const all = rows.map(s => this.paper(kind, ex.id, cls, s.id)).filter(Boolean), cnt = st => all.filter(p => p.status === st).length;
    const tone = { draft: 'amber', submitted: 'blue', approved: 'green' };
    return this.note(`ধাপ: শিক্ষক নিজের বিষয়ের ${word} আপলোড (পিডিএফ/ছবি) বা লিখে <b>জমা দেন</b> → অধ্যক্ষ / রুট ব্যবহারকারী <b>অনুমোদন</b> করেন (প্রয়োজনে মন্তব্যসহ ফেরত পাঠান) → <b>প্রকাশ</b> করলে শিক্ষার্থী ও অভিভাবকরা সংশ্লিষ্ট পত্রের পরীক্ষা শেষ হওয়ার পরে দেখতে পান।`)
      + `<div class="flex flex-wrap items-center gap-2 mb-3">${badge(`জমা হয়েছে ${bnNum(cnt('submitted'))}`, 'blue')}${badge(`অনুমোদিত ${bnNum(cnt('approved'))}`, 'green')}${badge(`প্রকাশিত ${bnNum(all.filter(p => p.published).length)}`, 'violet')}${badge(`বাকি ${bnNum(rows.length - all.length)}`, 'slate')}<span class="flex-1"></span>${m && all.some(p => p.status === 'approved' && !p.published) ? `<button class="btn btn-ghost" onclick="ExamHub.publishAll('${kind}','${ex.id}','${cls}')">${icon('send')} অনুমোদিত সব প্রকাশ করুন</button>` : ''}</div>
      <div class="card scroll-x"><table class="table"><thead><tr><th>বিষয়</th><th>পরীক্ষার সময়</th><th>অবস্থা</th><th>শিক্ষার্থীদের জন্য</th><th></th></tr></thead><tbody>
      ${rows.map(s => {
        const p = this.paper(kind, ex.id, cls, s.id), slot = DB.paperSlot(ex, cls, s.id), w = this.canWrite(cls, s.id), over = this.paperOver(ex, cls, s.id);
        const btn = (cls2, onclick, ic, label) => `<button class="btn ${cls2} btn-sm" onclick="${onclick}">${icon(ic)} ${label}</button>`;
        const acts = [
          p ? btn('btn-ghost', `ExamHub.openPaper('${p.id}')`, 'eye', 'দেখুন') : '',
          w && (!p || m || p.status === 'draft') ? btn(p ? 'btn-ghost' : 'btn-primary', `ExamHub.editPaper('${kind}','${ex.id}','${cls}','${s.id}')`, p ? 'pencil' : 'upload', p ? 'সম্পাদনা' : `${word} যোগ করুন`) : '',
          T && w && p?.status === 'draft' ? btn('btn-primary', `ExamHub.setStatus('${p.id}','submitted')`, 'send', 'জমা দিন') : '',
          m && p?.status === 'submitted' ? btn('btn-success', `ExamHub.setStatus('${p.id}','approved')`, 'check', 'অনুমোদন') + btn('btn-ghost', `ExamHub.sendBack('${p.id}')`, 'undo-2', 'ফেরত') : '',
          m && p?.status === 'approved' ? btn(p.published ? 'btn-ghost' : 'btn-primary', `ExamHub.togglePaper('${p.id}')`, p.published ? 'eye-off' : 'send', p.published ? 'প্রকাশ বাতিল' : 'প্রকাশ করুন') : '',
          m && p ? `<button class="btn btn-ghost btn-sm text-red-600" title="মুছে ফেলুন" onclick="ExamHub.removePaper('${p.id}')">${icon('trash-2')}</button>` : '',
        ].join('');
        return `<tr><td class="font-semibold">${esc(s.name)}</td><td class="whitespace-nowrap">${slot ? `${U.fmtDate(slot.date)} · ${U.bn(slot.start)}–${U.bn(slot.end)}` : '<span class="text-slate-400">রুটিনে নেই</span>'}</td>
          <td>${p ? badge(bn(p.status), tone[p.status]) : badge('জমা হয়নি', 'slate')}${p?.note && p.status === 'draft' ? `<div class="text-amber-700">ফেরতের কারণ: ${esc(p.note)}</div>` : ''}${p ? `<div class="text-slate-500">${esc(pn(DB.user(p.by)) || '')}${p.updatedAt ? ' · ' + U.fmtDate(p.updatedAt) : ''}</div>` : ''}</td>
          <td>${p?.published ? (over ? badge('দৃশ্যমান', 'green') : badge('প্রকাশিত · পরীক্ষার পরে দৃশ্যমান', 'violet')) : '—'}</td><td><div class="flex flex-wrap gap-1">${acts}</div></td></tr>`;
      }).join('') || `<tr><td colspan="5">${emptyState(T ? 'এই শ্রেণিতে এই পরীক্ষায় আপনার কোনো বিষয় নেই।' : 'কোনো বিষয় নেই।')}</td></tr>`}</tbody></table></div>`;
  },
  editPaper(kind, examId, cls, sid) {
    if (!this.canWrite(cls, sid)) return toast('এই বিষয়ের পত্র জমা দেওয়ার অনুমতি নেই।', 'error');
    const word = kind === 'question' ? 'প্রশ্নপত্র' : 'সমাধান';
    App.openDetail({ title: `${word} · ${DB.subject(sid).name} · ${DB.className(cls)}`, render: () => this.paperFormHtml(kind, examId, cls, sid), mount: () => this.paperFormMount(kind, examId, cls, sid) });
  },
  paperFormHtml(kind, examId, cls, sid) {
    const p = this.paper(kind, examId, cls, sid), ex = DB.exam(examId), mode = p?.mode || 'file', slot = DB.paperSlot(ex, cls, sid), c = Grade.cfg(ex, sid);
    return `<form id="xp-form" class="space-y-4"><div class="card p-4 flex flex-wrap gap-x-6 gap-y-1"><span><b>পরীক্ষা:</b> ${esc(ex.name)}</span><span><b>শ্রেণি:</b> ${esc(DB.className(cls))}</span><span><b>বিষয়:</b> ${esc(DB.subject(sid).name)}</span><span><b>পূর্ণমান:</b> ${bnNum(c.full)}</span><span><b>সময়:</b> ${slot ? `${U.fmtDate(slot.date)} · ${U.bn(slot.start)}–${U.bn(slot.end)}` : 'রুটিনে নেই'}</span>${p ? `<span><b>অবস্থা:</b> ${esc(bn(p.status))}${p.published ? ' · প্রকাশিত' : ''}</span>` : ''}</div>
      <div class="card p-4 space-y-3"><div class="flex flex-wrap gap-1.5">${[['file', 'ফাইল আপলোড (পিডিএফ / ছবি)', 'upload'], ['text', 'লিখে দিন', 'type']].map(([k, l, ic]) => `<label class="pill ${mode === k ? 'pill-on' : ''} cursor-pointer"><input type="radio" name="mode" value="${k}" class="sr-only" ${mode === k ? 'checked' : ''}>${icon(ic, 'w-4 h-4')}${l}</label>`).join('')}</div>
        <div data-mode="file" class="${mode === 'file' ? '' : 'hidden'}"><label class="label">ফাইল (পিডিএফ বা ছবি, সর্বোচ্চ ১.৫ এমবি)</label><input type="file" name="file" accept="application/pdf,image/*" class="input">${p?.mode === 'file' && p.fileName ? `<div class="text-slate-500 mt-1">বর্তমান ফাইল: ${esc(p.fileName)} — নতুন ফাইল না দিলে এটিই থাকবে।</div>` : ''}</div>
        <div data-mode="text" class="${mode === 'text' ? '' : 'hidden'}"><label class="label">${kind === 'question' ? 'প্রশ্ন' : 'সমাধান / উত্তরমালা'}</label><textarea class="input font-mono" name="text" rows="16" placeholder="প্রতিটি প্রশ্ন নতুন লাইনে লিখুন…">${esc(p?.text || '')}</textarea></div></div>
      <div class="flex flex-wrap gap-2 sticky bottom-0 bg-[var(--surface)] py-3"><span class="flex-1"></span><button type="button" class="btn btn-ghost" onclick="App.closeDetail()">বাতিল</button>
        <button class="btn btn-ghost" value="draft">${icon('save')} খসড়া সংরক্ষণ</button>${this.canManage() ? `<button class="btn btn-primary" value="approved">${icon('check')} সংরক্ষণ ও অনুমোদন</button>` : `<button class="btn btn-primary" value="submitted">${icon('send')} সংরক্ষণ ও জমা দিন</button>`}</div></form>`;
  },
  paperFormMount(kind, examId, cls, sid) {
    const f = $('#xp-form');
    $$('input[name=mode]', f).forEach(r => r.addEventListener('change', () => { $$('[data-mode]', f).forEach(x => x.classList.toggle('hidden', x.dataset.mode !== r.value)); $$('label.pill', f).forEach(l => l.classList.toggle('pill-on', l.querySelector('input').checked)); }));
    f.addEventListener('submit', async ev => {
      ev.preventDefault();
      const status = ev.submitter?.value || 'draft', mode = f.querySelector('input[name=mode]:checked').value, file = f.file.files[0], text = f.text.value.trim();
      let p = this.paper(kind, examId, cls, sid);
      if (mode === 'text' && !text) return toast('লেখা খালি — কিছু লিখুন।', 'error');
      if (mode === 'file' && !file && !(p?.mode === 'file' && p.fileName)) return toast('একটি পিডিএফ বা ছবি বেছে নিন।', 'error');
      let up = null;
      if (mode === 'file' && file) { try { up = { dataUrl: await readUpload(file, 1600), fileName: file.name, fileType: file.type === 'application/pdf' ? 'application/pdf' : 'image/jpeg' }; } catch (err) { return toast(err.message, 'error'); } }
      const before = p ? { ...p } : null, isNew = !p;
      if (isNew) this.papers().push(p = { id: DB.id('XP'), kind, examId, classId: cls, subjectId: sid, published: false, createdAt: U.today() });
      Object.assign(p, { mode, status, by: App.session.userId, updatedAt: U.today(), note: status === 'draft' ? (p.note || '') : '' });
      if (mode === 'text') Object.assign(p, { text, dataUrl: null, fileName: null, fileType: null }); else Object.assign(p, up || {}, { text: '' });
      if (status === 'approved') Object.assign(p, { approvedBy: App.session.userId, approvedAt: U.today() });
      DB.audit('EXAM_PAPER_SAVE', 'exams', `${kind} ${examId} · ${cls} · ${sid} → ${status}`);
      if (!DB.save()) { if (isNew) DB.s.examPapers = this.papers().filter(x => x !== p); else Object.assign(p, before); DB.save(); return toast('সংরক্ষণস্থান পূর্ণ — ছোট আকারের ফাইল দিয়ে চেষ্টা করুন।', 'error'); }
      toast(status === 'submitted' ? 'জমা দেওয়া হয়েছে — অনুমোদনের অপেক্ষায়।' : status === 'approved' ? 'সংরক্ষিত ও অনুমোদিত।' : 'খসড়া সংরক্ষিত হয়েছে।', 'success'); App.closeDetail();
    });
  },
  setStatus(id, status) {
    const p = this.papers().find(x => x.id === id); if (!p) return;
    if (status === 'approved' && !this.canManage()) return toast('শুধু অধ্যক্ষ বা রুট ব্যবহারকারী অনুমোদন করতে পারেন।', 'error');
    if (status === 'submitted' && !this.canWrite(p.classId, p.subjectId)) return toast('অনুমতি নেই।', 'error');
    p.status = status; p.note = ''; if (status === 'approved') Object.assign(p, { approvedBy: App.session.userId, approvedAt: U.today() });
    DB.audit('EXAM_PAPER_STATUS', 'exams', `${p.kind} ${p.examId} · ${p.classId} · ${p.subjectId} → ${status}`); DB.save(); toast(status === 'approved' ? 'অনুমোদিত হয়েছে।' : 'জমা দেওয়া হয়েছে।', 'success'); App.refresh();
  },
  sendBack(id) {
    const p = this.papers().find(x => x.id === id); if (!p || !this.canManage()) return;
    const why = prompt('ফেরত পাঠানোর কারণ (শিক্ষক দেখতে পাবেন):', ''); if (why === null) return;
    Object.assign(p, { status: 'draft', note: why.trim() || 'সংশোধন প্রয়োজন', published: false });
    DB.audit('EXAM_PAPER_RETURN', 'exams', `${p.kind} ${p.examId} · ${p.classId} · ${p.subjectId}: ${p.note}`); DB.save(); toast('শিক্ষকের কাছে ফেরত পাঠানো হয়েছে।', 'success'); App.refresh();
  },
  togglePaper(id) {
    const p = this.papers().find(x => x.id === id); if (!p || !this.canManage() || p.status !== 'approved') return;
    p.published = !p.published; DB.audit('EXAM_PAPER_PUBLISH', 'exams', `${p.kind} ${p.examId} · ${p.classId} · ${p.subjectId} → ${p.published ? 'published' : 'hidden'}`); DB.save(); App.refresh();
  },
  publishAll(kind, examId, cls) {
    if (!this.canManage()) return;
    const list = this.papers().filter(p => p.kind === kind && p.examId === examId && p.classId === cls && p.status === 'approved' && !p.published);
    list.forEach(p => p.published = true); DB.audit('EXAM_PAPER_PUBLISH', 'exams', `${kind} ${examId} · ${cls}: ${list.length}টি প্রকাশিত`); DB.save(); toast(`${bnNum(list.length)}টি প্রকাশিত হয়েছে।`, 'success'); App.refresh();
  },
  removePaper(id) {
    if (!this.canManage() || !confirm('এই পত্রটি মুছে ফেলবেন?')) return;
    DB.s.examPapers = this.papers().filter(x => x.id !== id); DB.audit('EXAM_PAPER_DELETE', 'exams', id); DB.save(); App.refresh();
  },
  openPaper(id) {
    const p = this.papers().find(x => x.id === id); if (!p || !this.canSee(p)) return toast('এই পত্রটি এখন দেখা যাবে না।', 'error');
    if (p.mode === 'file' && p.dataUrl) { const a = document.createElement('a'); a.href = p.dataUrl; a.download = p.fileName || 'paper'; a.target = '_blank'; a.click(); return; }
    const ex = DB.exam(p.examId), c = Grade.cfg(ex, p.subjectId), slot = DB.paperSlot(ex, p.classId, p.subjectId), word = p.kind === 'question' ? 'প্রশ্নপত্র' : 'সমাধান';
    const lines = (p.mode === 'file' ? `ফাইল: ${p.fileName || '—'} (ফাইল নেই)` : p.text || '').split('\n'), pages = [[]];
    let left = 34; lines.forEach(l => { const h = Math.max(1, Math.ceil(l.length / 85)); if (h > left) { pages.push([]); left = 44; } left -= h; pages[pages.length - 1].push(l); });
    const sheets = pages.map((pg, i) => `${Print.sheet({}, 'padded')}${i === 0 ? `${Print.header(word)}<div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:2mm;font-size:10.5pt;border-bottom:.3mm solid #cbd5e1;padding-bottom:2mm;margin-bottom:4mm"><b>${esc(ex.name)}</b><span>${esc(DB.className(p.classId))} · ${esc(DB.subject(p.subjectId)?.name || '')}</span><span>পূর্ণমান ${bnNum(c.full)}${slot ? ` · ${U.fmtDate(slot.date)} · ${U.bn(slot.start)}–${U.bn(slot.end)}` : ''}</span></div>` : ''}
      <div style="font-size:11pt;line-height:1.75;white-space:pre-wrap">${esc(pg.join('\n'))}</div><div style="position:absolute;bottom:10mm;left:14mm;right:14mm;display:flex;justify-content:space-between;font-size:7.5pt;color:#64748b"><span>${esc(ex.name)} · ${esc(DB.subject(p.subjectId)?.name || '')}</span><span>পৃষ্ঠা ${bnNum(i + 1)}/${bnNum(pages.length)}</span></div></div>`);
    Print.preview(`${word} — ${DB.subject(p.subjectId)?.name || ''}`, sheets, { re: ['ExamHub.openPaper', id] });
  },

  /* ---------- মানবণ্টন ---------- */
  marksTab(ex, cls) {
    const subs = DB.examSubjects(ex, cls), sch = Grade.scheme(DB.campusOf(cls), ex.session, ex), can = this.canManage(), dis = can ? '' : 'disabled';
    const exRule = ex.passRule === 'total' ? 'total' : 'component';
    const ruleSel = (val, js, withInherit) => `<select class="select !py-1 !w-auto" ${dis} aria-label="পাসের নিয়ম" onchange="${js}">${withInherit ? `<option value="" ${val ? '' : 'selected'}>পরীক্ষার নিয়ম অনুযায়ী</option>` : ''}<option value="component" ${val === 'component' ? 'selected' : ''}>প্রতিটি অংশে আলাদা পাস</option><option value="total" ${val === 'total' ? 'selected' : ''}>সম্মিলিত পাস (মোট নম্বরে)</option></select>`;
    const pctIn = (val, js) => `<input type="number" min="0" max="100" class="input !py-1 !w-20" ${dis} aria-label="ন্যূনতম শতাংশ" value="${val}" onchange="${js}">`;
    const hc = App.ui.passHc || {}, hs = subs.find(s => s.id === hc.sid) || subs[0];
    const hcHtml = hs ? (() => { const list = Grade.comps(ex, hs.id), vals = hc.v || {}, ex1 = Object.fromEntries(list.filter(c => !['cq', 'mcq', 'pr'].includes(c.k)).map(c => [c.k, vals[c.k]]));
      const g = Grade.of(vals.cq, vals.mcq, ex, DB.campusOf(cls), vals.pr, hs.id, ex1), r = PassRule.rule(ex, hs.id);
      return `<div class="card p-4 mb-4"><div class="font-semibold mb-2 flex items-center gap-2">${icon('calculator', 'w-4 h-4 text-brand-600')} হাতে যাচাই</div><div class="flex flex-wrap items-end gap-3">
        <div><label class="label" for="phc-s">বিষয়</label><select id="phc-s" class="select !w-auto" onchange="App.ui.passHc={sid:this.value,v:{}};App.refresh()">${subs.map(s => `<option value="${s.id}" ${s.id === hs.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
        ${list.map(c => `<div><label class="label" for="phc-${c.k}">${esc(c.label)} (${bnNum(c.max)})</label><input id="phc-${c.k}" type="number" min="0" max="${c.max}" class="input !w-24" value="${vals[c.k] ?? ''}" onchange="App.ui.passHc={sid:'${hs.id}',v:{...(App.ui.passHc?.v||{}),'${c.k}':this.value===''?undefined:+this.value}};App.refresh()"></div>`).join('')}
        <div class="pb-2">${badge(g.failed ? 'অকৃতকার্য' : `উত্তীর্ণ · ${g.letter}`, g.failed ? 'red' : 'green')} <span class="text-slate-600">মোট ${bnNum(g.total)}/${bnNum(g.max)} · ${r === 'total' ? `সম্মিলিত, ন্যূনতম ${bnNum(PassRule.pct(ex, hs.id))}%` : 'প্রতিটি অংশে আলাদা পাস'}</span></div></div></div>`; })() : '';
    return `<div class="flex flex-wrap gap-2 mb-3"><span class="flex-1"></span>${can ? `<button class="btn btn-ghost" onclick="Exams.setup('${ex.id}')">${icon('sliders-horizontal')} সেটআপে পরিবর্তন করুন</button>` : ''}<button class="btn btn-primary" onclick="ExamHub.printMarks('${ex.id}','${cls}')">${icon('printer')} মুদ্রণ</button></div>
      <div class="card p-4 mb-4"><div class="font-semibold mb-2">পাসের নিয়ম</div><div class="flex flex-wrap items-center gap-3"><span>এই পরীক্ষা:</span>${ruleSel(exRule, `PassRule.set('${ex.id}',null,'passRule',this.value)`)}${exRule === 'total' ? `<span>ন্যূনতম</span>${pctIn(ex.passPct ?? 33, `PassRule.set('${ex.id}',null,'passPct',this.value)`)}<span>%</span>` : ''}</div>
        <div class="scroll-x mt-3"><table class="table"><thead><tr><th>বিষয়</th><th>পাসের নিয়ম</th><th>ন্যূনতম %</th></tr></thead><tbody>${subs.map(s => { const o = ex.subjects?.[s.id]?.passRule || '', r = PassRule.rule(ex, s.id);
          return `<tr><td>${esc(s.name)}</td><td>${ruleSel(o, `PassRule.set('${ex.id}','${s.id}','passRule',this.value)`, true)}</td><td>${r === 'total' ? (o ? pctIn(PassRule.pct(ex, s.id), `PassRule.set('${ex.id}','${s.id}','passPct',this.value)`) : bnNum(PassRule.pct(ex, s.id)) + '%') : '—'}</td></tr>`; }).join('')}</tbody></table></div></div>
      ${hcHtml}
      <div class="card scroll-x mb-4">${this.marksTable(ex, subs, false)}</div>
      <div class="card p-4 space-y-1 text-slate-600">${this.rulesHtml(ex, sch).map(x => `<div>• ${x}</div>`).join('')}</div>`;
  },
  rulesHtml(ex, sch) {
    const ov = Object.entries(ex.subjects || {}).filter(([, o]) => o.passRule);
    return [`পাসের নিয়ম: ${ex.passRule === 'total' ? `সম্মিলিত পাস — বিষয়ের মোট নম্বর ≥ ${bnNum(ex.passPct ?? 33)}%` : 'প্রতিটি অংশে (সৃজনশীল/লিখিত, বহুনির্বাচনি, ব্যবহারিক) আলাদাভাবে পাস নম্বর আবশ্যক'}।`,
      ...(ov.length ? [`বিষয়ভিত্তিক ব্যতিক্রম: ${ov.map(([sid, o]) => `${esc(DB.subject(sid)?.name || sid)} — ${o.passRule === 'total' ? `সম্মিলিত ${bnNum(o.passPct ?? ex.passPct ?? 33)}%` : 'প্রতিটি অংশে আলাদা'}`).join('; ')}।`] : []),
      `জিপিএ: ${ex.failRule === 'average' ? 'গ্রেড পয়েন্টের গড় (অকৃতকার্য বিষয় ০ হিসেবে)' : 'যেকোনো বিষয়ে F হলে জিপিএ ০.০০'} · গ্রেডিং: ${esc(sch?.name || 'এনসিটিবি')}।`,
      `শিক্ষাবর্ষের জিপিএ-তে এই পরীক্ষার ভার ${bnNum(ex.weight)}%।`,
      ...(ex.combine?.length ? [`চূড়ান্ত ফলাফলে আগের পরীক্ষা যুক্ত: ${[`এই পরীক্ষা ${bnNum(ex.combineSelf ?? Math.max(0, 100 - U.sum(ex.combine, c => c.weight)))}%`, ...ex.combine.map(c => `${esc(DB.exam(c.examId)?.name || c.examId)} ${bnNum(c.weight)}%`)].join(' + ')} · ${{ redistribute: 'আগের পরীক্ষায় না থাকা বিষয়ের ভার পুনর্বণ্টিত হয়', zero: 'আগের পরীক্ষায় না থাকা বিষয় ০ ধরা হয়', self: 'আগের পরীক্ষায় না থাকা বিষয়ে শুধু এই পরীক্ষা গণ্য' }[ex.combineRule || 'redistribute']}।`] : [])];
  },
  marksTable(ex, subs, print) {
    // columns: every assessment component configured for any of these subjects (exam.comps / subjects[sid].comps)
    const cols = []; subs.forEach(s => Grade.comps(ex, s.id).forEach(k => { if (!cols.some(x => x.k === k.k)) cols.push({ k: k.k, label: k.label }); }));
    const part = k => k ? `${bnNum(k.max)} <span style="color:#64748b">(পাস ${bnNum(k.pass)})</span>` : '—';
    return `<table class="${print ? 'ms-table' : 'table'}"><thead><tr><th>বিষয়</th>${cols.map(k => `<th>${esc(k.label)}</th>`).join('')}<th>পূর্ণমান</th><th>পাসের নিয়ম</th></tr></thead><tbody>
      ${subs.map(s => { const list = Grade.comps(ex, s.id), full = Grade.cfg(ex, s.id).full, r = PassRule.rule(ex, s.id); return `<tr><td><b>${esc(s.name)}</b></td>${cols.map(k => `<td>${part(list.find(x => x.k === k.k))}</td>`).join('')}<td><b>${bnNum(full)}</b></td><td>${r === 'total' ? `সম্মিলিত · মোট ${bnNum(Math.ceil(full * PassRule.pct(ex, s.id) / 100))}` : 'প্রতিটি অংশে আলাদা'}</td></tr>`; }).join('') || `<tr><td colspan="6">${print ? '—' : emptyState('কোনো বিষয় নেই।')}</td></tr>`}</tbody></table>`;
  },
  printMarks(examId, cls) {
    const ex = DB.exam(examId), subs = DB.examSubjects(ex, cls), sch = Grade.scheme(DB.campusOf(cls), ex.session, ex);
    Print.preview('মানবণ্টন', [`${Print.sheet({}, 'padded')}${Print.header('মানবণ্টন')}<div style="display:flex;justify-content:space-between;font-size:11pt;margin-bottom:4mm"><b>${esc(ex.name)}</b><span>${esc(DB.className(cls))}</span></div>${this.marksTable(ex, subs, true)}
      <div style="margin-top:5mm;font-size:9.5pt;line-height:1.7">${this.rulesHtml(ex, sch).map(x => `• ${x}`).join('<br>')}</div><div style="position:absolute;bottom:18mm;right:14mm">${Print.signature('Exam Controller')}</div></div>`], { re: ['ExamHub.printMarks', examId, cls] });
  },

  /* ---------- ফলাফল ---------- */
  gradebook(examId, cls) { App.ui.gb = { exam: examId, cls, subj: null }; App.go('teacher', 'gradebook'); },
  printAll(examId, cls) {
    const list = DB.examRanking(examId, cls); if (!list.length) return toast('কোনো নম্বর লিপিবদ্ধ নেই।', 'error');
    Print.preview(`নম্বরপত্র — ${DB.exam(examId).name} · ${DB.className(cls)}`, [...list].sort((a, b) => (a.st.section > b.st.section ? 1 : a.st.section < b.st.section ? -1 : 0) || a.st.roll - b.st.roll).flatMap(x => Print.marksheet(x.st, examId)), { re: ['ExamHub.printAll', examId, cls] });
  },
  resultsTab(ex, cls) {
    if (this.isLearner()) return this.myResult(ex, this.kid());
    const list = DB.examRanking(ex.id, cls), cmb = !!ex.combine?.length, subs = DB.examSubjects(ex, cls), all = DB.studentsIn(cls).length, f1 = v => this.f1(v), clsAvg = DB.classAverage(ex.id, cls);
    const head = `<div class="card p-4 mb-4 flex flex-wrap items-center gap-3"><div class="flex-1 min-w-[12rem]"><div class="font-semibold">${esc(ex.name)} · ${esc(DB.className(cls))}</div><div class="text-slate-500">${bnNum(list.length)}/${bnNum(all)} জনের নম্বর লিপিবদ্ধ${cmb ? ' · চূড়ান্ত ফলাফলে আগের পরীক্ষা যুক্ত' : ''} · শিক্ষার্থী ও অভিভাবকরা ফলাফল দেখতে পান শুধু প্রকাশের পরে।</div></div>
      ${this.canManage() ? `<button class="btn ${ex.published ? 'btn-success' : 'btn-primary'}" onclick="Exams.togglePublish('${ex.id}')">${icon(ex.published ? 'eye-off' : 'send')} ${ex.published ? 'প্রকাশিত — প্রকাশ বাতিল করুন' : 'ফলাফল প্রকাশ করুন'}</button>` : badge(ex.published ? 'প্রকাশিত' : 'অপ্রকাশিত', ex.published ? 'green' : 'slate')}
      ${this.isTeacher() ? `<button class="btn btn-ghost" onclick="ExamHub.gradebook('${ex.id}','${cls}')">${icon('table-2')} গ্রেডবুকে নম্বর দিন</button>` : ''}${list.length && App.perm('exams', 'print') ? `<button class="btn btn-ghost" onclick="ExamHub.printAll('${ex.id}','${cls}')">${icon('printer')} সকল নম্বরপত্র</button>` : ''}</div>`;
    if (!list.length) return head + `<div class="card p-6">${emptyState('এই শ্রেণির এই পরীক্ষার কোনো নম্বর এখনো লিপিবদ্ধ হয়নি।')}</div>`;
    const kpis = `<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">${kpi('শ্রেণির গড় শতকরা', `${f1(clsAvg?.pct)}%`, `গড় মোট নম্বর ${f1(clsAvg?.total)}`, 'percent', 'blue')}${kpi('শ্রেণির গড় জিপিএ', gpaFmt(clsAvg?.gpa), 'এই পরীক্ষা', 'award', 'violet')}${kpi('উত্তীর্ণ', `${bnNum(list.filter(x => x.c.passed).length)}/${bnNum(list.length)}`, cmb ? 'চূড়ান্ত (সমন্বিত) ফলাফল অনুযায়ী' : 'এই পরীক্ষা', 'check-circle-2', 'green')}${kpi('সর্বোচ্চ', esc(pn(list[0].st)), cmb ? `জিপিএ ${gpaFmt(list[0].c.gpa)} (সমন্বিত)` : `জিপিএ ${gpaFmt(list[0].c.gpa)}`, 'trophy', 'amber')}</div>`;
    const table = `<div class="card scroll-x mb-4"><table class="table"><thead><tr><th>অবস্থান</th><th>রোল</th><th>শিক্ষার্থী</th><th>মোট</th><th>গড় নম্বর</th><th>শতকরা</th><th>জিপিএ</th>${cmb ? '<th>সমন্বিত %</th><th>সমন্বিত জিপিএ</th>' : ''}<th>ফলাফল</th><th></th></tr></thead><tbody>
      ${list.map(x => `<tr><td class="font-bold">${bnNum(x.pos)}</td><td>${bnNum(x.st.roll)}${x.st.section ? `-${esc(x.st.section)}` : ''}</td><td class="font-semibold">${esc(pn(x.st))}</td><td>${bnNum(x.r.total)}/${bnNum(x.r.max)}</td><td>${f1(x.r.total / x.r.rows.length)}</td><td>${f1(x.r.pct)}%</td><td>${gpaFmt(x.r.gpa)} <span class="text-slate-500">${esc(x.r.letter)}</span></td>${cmb ? `<td>${f1(x.c.pct)}%</td><td><b>${gpaFmt(x.c.gpa)}</b> <span class="text-slate-500">${esc(x.c.letter)}</span></td>` : ''}<td>${x.c.passed ? badge('উত্তীর্ণ', 'green') : badge('অনুত্তীর্ণ', 'red')}</td><td>${App.perm('exams', 'print') ? `<button class="btn btn-ghost btn-sm" onclick="Print.show('marksheet','${x.st.id}','${ex.id}')">${icon('file-text')} নম্বরপত্র</button>` : ''}</td></tr>`).join('')}</tbody>
      <tfoot><tr class="bg-slate-50 font-semibold"><td colspan="3">শ্রেণির গড়</td><td>${f1(U.sum(list, x => x.r.total) / list.length)}</td><td>${f1(U.sum(list, x => x.r.total / x.r.rows.length) / list.length)}</td><td>${f1(clsAvg?.pct)}%</td><td>${gpaFmt(clsAvg?.gpa)}</td>${cmb ? `<td>${f1(U.sum(list, x => x.c.pct) / list.length)}%</td><td>${(g => gpaFmt(g.length ? U.sum(g) / g.length : null))(list.map(x => x.c.gpa).filter(g => g !== null))}</td>` : ''}<td colspan="2"></td></tr></tfoot></table></div>`;
    const bySub = `<div class="card scroll-x"><div class="px-5 py-3 border-b border-slate-100 font-semibold">বিষয়ভিত্তিক গড়</div><table class="table"><thead><tr><th>বিষয়</th><th>পরীক্ষার্থী</th><th>গড় নম্বর</th><th>গড় শতকরা</th><th>সর্বোচ্চ</th><th>পাসের হার</th></tr></thead><tbody>
      ${subs.map(s => { const a = DB.classAverage(ex.id, cls, s.id); return `<tr><td class="font-semibold">${esc(s.name)}</td>${a ? `<td>${bnNum(a.n)}</td><td>${f1(a.avg)}/${bnNum(a.full)}</td><td>${f1(a.pct)}%</td><td>${bnNum(a.max)}</td><td><div class="w-24 inline-block align-middle">${progressBar(a.pass)}</div> ${f1(a.pass)}%</td>` : '<td colspan="5" class="text-slate-400">নম্বর নেই</td>'}</tr>`; }).join('')}</tbody></table></div>`;
    return head + kpis + table + bySub;
  },
  /** A student's / guardian's own result card (published exams only). */
  myResult(ex, st) {
    if (!ex.published) return `<div class="card p-6">${emptyState('এই পরীক্ষার ফলাফল এখনো প্রকাশিত হয়নি।', 'hourglass')}</div>`;
    const c = DB.combinedResult(st.id, ex.id), r = c.base, f1 = v => this.f1(v);
    if (!r.rows.length) return `<div class="card p-6">${emptyState('এই পরীক্ষার কোনো নম্বর পাওয়া যায়নি।')}</div>`;
    const rank = DB.examRanking(ex.id, st.classId), me = rank.find(x => x.st.id === st.id), cls = DB.classAverage(ex.id, st.classId);
    const kpis = `<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">${kpi(c.combined ? 'চূড়ান্ত জিপিএ (সমন্বিত)' : 'জিপিএ', gpaFmt(c.gpa), `${esc(c.letter)} · ${c.passed ? 'উত্তীর্ণ' : 'অনুত্তীর্ণ'}`, 'award', c.passed ? 'green' : 'red')}${kpi('শতকরা', `${f1(c.pct)}%`, `শ্রেণির গড় ${f1(cls?.pct)}%`, 'percent', 'blue')}${kpi('গড় নম্বর', f1(r.total / r.rows.length), 'বিষয়প্রতি (এই পরীক্ষা)', 'calculator', 'violet')}${kpi('শ্রেণিতে অবস্থান', me ? `${bnNum(me.pos)}<span class="text-base text-slate-400">/${bnNum(rank.length)}</span>` : '—', esc(DB.className(st.classId)), 'trophy', 'amber')}</div>`;
    const main = `<div class="card scroll-x mb-4"><div class="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2"><div class="font-semibold flex-1">${esc(ex.name)}${c.combined ? ' — এই পরীক্ষার নম্বর' : ''}</div>${App.perm('exams', 'print') ? `<button class="btn btn-primary btn-sm" onclick="Print.show('marksheet','${st.id}','${ex.id}')">${icon('download')} নম্বরপত্র</button>` : ''}</div>
      <table class="table"><thead><tr><th>বিষয়</th><th>প্রাপ্ত নম্বর</th><th>শ্রেণির গড়</th><th>শ্রেণির সর্বোচ্চ</th><th>গ্রেড</th><th>পয়েন্ট</th></tr></thead><tbody>${r.rows.map(x => { const a = DB.classAverage(ex.id, st.classId, x.subject.id); return `<tr><td class="font-semibold">${esc(x.subject.name)}</td><td>${bnNum(x.total)}/${bnNum(x.max)}</td><td>${f1(a?.avg)}</td><td>${a ? bnNum(a.max) : '—'}</td><td>${x.failed ? badge(x.letter, 'red') : esc(x.letter)}</td><td>${gpaFmt(x.point)}</td></tr>`; }).join('')}</tbody>
      <tfoot><tr class="bg-slate-50 font-semibold"><td>মোট · গড়</td><td>${bnNum(r.total)}/${bnNum(r.max)} · গড় ${f1(r.total / r.rows.length)}</td><td>${f1(U.sum(r.rows, x => DB.classAverage(ex.id, st.classId, x.subject.id)?.avg || 0) / r.rows.length)}</td><td></td><td>${esc(r.letter)}</td><td>${gpaFmt(r.gpa)}</td></tr></tfoot></table></div>`;
    return kpis + main + (c.combined ? this.combinedCard(c) : '');
  },
  combinedCard(c) {
    const f1 = v => this.f1(v);
    return `<div class="card scroll-x"><div class="px-5 py-3 border-b border-slate-100"><div class="font-semibold">সমন্বিত (চূড়ান্ত) ফলাফল</div><div class="text-slate-500">বিষয়ের সমন্বিত শতকরা = Σ(শতকরা × ভার) ÷ Σ ভার · ${{ redistribute: 'আগের পরীক্ষায় না থাকা বিষয়ের ভার পুনর্বণ্টিত', zero: 'আগের পরীক্ষায় না থাকা বিষয় ০% ধরা', self: 'আগের পরীক্ষায় না থাকা বিষয়ে শুধু এই পরীক্ষা গণ্য' }[c.rule]}</div></div>
      <table class="table"><thead><tr><th>বিষয়</th>${c.parts.map(p => `<th>${esc(p.exam.name)} <span class="font-normal text-slate-500">(${bnNum(p.weight)}%)</span></th>`).join('')}<th>সমন্বিত %</th><th>গ্রেড</th><th>পয়েন্ট</th></tr></thead><tbody>
      ${c.rows.map(r => `<tr><td class="font-semibold">${esc(r.subject.name)}</td>${r.items.map(i => `<td>${i.pct === null ? (i.zero ? '০%' : '—') : f1(i.pct) + '%'}${r.missing ? `<div class="text-slate-500">গণ্য ভার ${bnNum(Math.round(i.share))}%</div>` : ''}</td>`).join('')}<td><b>${f1(r.pct)}%</b></td><td>${r.failed ? badge(r.letter, 'red') : esc(r.letter)}</td><td>${gpaFmt(r.point)}</td></tr>`).join('')}</tbody>
      <tfoot><tr class="bg-slate-50 font-semibold"><td>চূড়ান্ত</td><td colspan="${c.parts.length}"></td><td>${f1(c.pct)}%</td><td>${esc(c.letter)}</td><td>${gpaFmt(c.gpa)}</td></tr></tfoot></table></div>`;
  },
};

/* ---------- register the page in every portal ---------- */
(() => {
  const page = () => ({ id: 'exams', label: 'পরীক্ষা কেন্দ্র', icon: 'clipboard-list', module: 'exams', render: q => ExamHub.render(q), mount: q => ExamHub.mount(q) });
  [['admin', 'calendar'], ['teacher', 'gradebook'], ['student', 'syllabus-book'], ['guardian', 'academics']].forEach(([portal, after]) => { if (App.portals[portal] && !App.portals[portal].pages.some(p => p.id === 'exams')) App.addPage(portal, page(), after); });
  // Sidebar groups are assigned later (wiring.js); place the new pages once every script has loaded.
  const boot0 = App.boot.bind(App);
  App.boot = function () {
    [['admin', 'প্রতিষ্ঠান'], ['teacher', 'শ্রেণিকক্ষ']].forEach(([portal, g]) => { const P = App.portals[portal], p = P?.pages.find(x => x.id === 'exams'); if (p && (!P.groupOrder || P.groupOrder.includes(g))) p.group = g; });
    return boot0();
  };
})();

/* ---------- teacher gradebook: respect class/subject participation; show the class average ---------- */
(() => {
  const gb = App.portals.teacher?.pages.find(p => p.id === 'gradebook'); if (!gb) return;
  const r0 = gb.render, m0 = gb.mount;
  gb.render = function (q) {
    const html = r0.call(this, q), ui = App.ui.gb, ex = ui && DB.exam(ui.exam);
    ui && (ui._skip = !!ex && !DB.examTakes(ex, ui.cls, ui.subj));
    if (!ui?._skip) return html;
    const why = !DB.examTakes(ex, ui.cls) ? `${DB.className(ui.cls)} এই পরীক্ষায় অংশ নিচ্ছে না।` : `${DB.subject(ui.subj)?.name || ''} বিষয়টি ${DB.className(ui.cls)}-এর এই পরীক্ষায় নেই।`;
    return pageHeader('নম্বরপত্র ও গ্রেডবুক', '') + `<div class="card p-4 mb-4 flex flex-wrap gap-3 items-end"><div><label class="label">পরীক্ষা</label><select class="select" onchange="App.ui.gb.exam=this.value;App.refresh()">${[...DB.s.exams].sort((a, b) => b.start.localeCompare(a.start)).map(e => `<option value="${e.id}" ${e.id === ui.exam ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></div><div><label class="label">শ্রেণি</label>${Teacher.classSelect('gb-cls', ui.cls, 'App.ui.gb.cls=this.value;App.refresh()')}</div><div><label class="label">বিষয়</label><select class="select" onchange="App.ui.gb.subj=this.value;App.refresh()">${subjectOptions(ui.subj, Teacher.mySubjects(ui.cls))}</select></div></div>
      <div class="card p-6">${emptyState(`${esc(why)} (দেখুন পরীক্ষা কেন্দ্র → পরীক্ষাসমূহ → সেটআপ)`, 'circle-slash')}</div>`;
  };
  gb.mount = function (q) {
    const ui = App.ui.gb; if (ui?._skip) return;
    m0?.call(this, q);
    const box = $('#gb-summary'), t = $('#gb-table'); if (!box || !t) return;
    box.insertAdjacentHTML('afterend', '<div id="gb-avg" class="w-full text-right text-slate-600"></div>');
    const full = Grade.cfg(DB.exam(ui.exam), ui.subj).full;
    const upd = () => {
      // every component input of a row (an empty attendance input counts its computed value); absent rows are left out
      const tot = $$('tr[data-st]', t).map(tr => { const ins = $$('input[data-k]', tr); if (tr.querySelector('[name=ab]')?.checked || !ins.some(i => i.value !== '' && i.dataset.k !== 'att')) return null; return U.sum(ins, i => +(i.value !== '' ? i.value : i.placeholder) || 0); }).filter(x => x !== null);
      const a = tot.length ? U.sum(tot) / tot.length : null;
      $('#gb-avg').innerHTML = a === null ? '' : `শ্রেণির গড় নম্বর <b>${ExamHub.f1(a)}</b>/${bnNum(full)} (${ExamHub.f1(a / full * 100)}%) · সর্বোচ্চ ${bnNum(Math.max(...tot))} · সর্বনিম্ন ${bnNum(Math.min(...tot))}`;
    };
    t.addEventListener('input', upd); t.addEventListener('change', upd); upd();
    MarkLock.apply(ui.exam, t);
  };
})();

/* ---------- pass rule per exam, per-subject override (exam.subjects[sid].passRule / passPct; Grade.of reads them) ---------- */
const PassRule = {
  rule(ex, sid) { return (ex?.subjects?.[sid]?.passRule || ex?.passRule) === 'total' ? 'total' : 'component'; },
  pct(ex, sid) { const o = ex?.subjects?.[sid]; return +(o?.passRule && o.passPct != null ? o.passPct : ex?.passPct ?? 33); },
  set(examId, sid, k, v) {
    const ex = DB.exam(examId); if (!ex || !ExamHub.canManage()) return;
    if (k === 'passPct') { v = Math.max(0, Math.min(100, +v || 0)); }
    if (!sid) ex[k] = v;
    else {
      const S = ex.subjects || (ex.subjects = {}), o = S[sid] || (S[sid] = {});
      if (k === 'passRule' && !v) { delete o.passRule; delete o.passPct; } else { o[k] = v; if (k === 'passRule' && v === 'total' && o.passPct == null) o.passPct = +(ex.passPct ?? 33); }
      if (!Object.keys(o).length) delete S[sid];
    }
    DB.audit('EXAM_PASS_RULE', 'exams', `${ex.name}${sid ? ' · ' + sid : ''}: ${k}=${v || '—'}`); DB.save(); App.refresh();
  },
};

/* ---------- marks of a published result are locked (server/access.js enforces it) ---------- */
const MarkLock = {
  open() { return App.has('ADMIN') || App.has('SUPERADMIN') || (App.has('PRINCIPAL') && DB.s.featureFlags?.publishedMarksPrincipal === true); },
  locked(examId) { return !!DB.exam(examId)?.published && !this.open(); },
  banner() { return `<div class="card p-3 mb-3 flex items-center gap-2 mk-lock" role="status">${icon('lock', 'w-5 h-5 text-amber-600')}<b>ফলাফল প্রকাশিত — নম্বর লক করা আছে।</b><span class="text-slate-600">প্রকাশ বাতিল করলে আবার সম্পাদনা করা যাবে।</span></div>`; },
  apply(examId, t) {
    if (!t || !this.locked(examId)) return;
    $$('input, select', t).forEach(i => { i.disabled = true; });
    const card = t.closest('.card'); $$('button', card).forEach(b => { if (/saveMarks|save/i.test(b.getAttribute('onclick') || '')) b.disabled = true; });
    card?.insertAdjacentHTML('beforebegin', this.banner()); App.icons?.();
  },
};
(() => {
  if (typeof Teacher !== 'undefined' && Teacher.saveMarks) { const s0 = Teacher.saveMarks.bind(Teacher); Teacher.saveMarks = function () { if (MarkLock.locked(App.ui.gb?.exam)) return toast('ফলাফল প্রকাশিত — নম্বর লক করা আছে।', 'error'); return s0(); }; }
  const sm = DB.setMark; if (sm) DB.setMark = function (examId, ...a) { if (MarkLock.locked(examId)) { toast('ফলাফল প্রকাশিত — নম্বর লক করা আছে।', 'error'); return null; } return sm.call(this, examId, ...a); };
})();
