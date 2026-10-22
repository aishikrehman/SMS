/* ==========================================================================
   SEMESTERS, CREDITS, COURSE REGISTRATION, SUPPLEMENTARY EXAMS & RETAKES
   (সেমিস্টার, ক্রেডিট, কোর্স রেজিস্ট্রেশন, সাপ্লিমেন্টারি / পুনঃপরীক্ষা, রিটেক / ক্যারি-ওভার, মানোন্নয়ন)

   Annual schools are untouched: everything here acts only where a level or class is set to a
   semester / trimester / term structure (প্রতিষ্ঠানের সেটিংস → সেমিস্টার ও সাপ্লিমেন্টারি), or where
   supplementary exams are switched on.

   Stored data (values in English):
     academicStructure  { levels: { LV: { mode, perYear, total } }, classes: { C: { mode, perYear, total } },
                          courses: { C: { SUBJECT: { credit, code } } }, creditLimit,
                          retakeRule: 'latest' | 'best' | 'both', improvement, improvementRule: 'best' | 'latest',
                          supp: { enabled, rule: 'replace' | 'best' | 'cap', capPoint, perSubject } }
                          mode: 'annual' | 'semester' | 'trimester' | 'term'
     semesters    [{ id, name, session, no, start, end, regStart, regEnd, classIds: [], offer: { C: [SUBJECT] } }]
     courseRegs   [{ id, studentId, semesterId, subjectId, classId (class the course is taken with),
                     kind: 'regular' | 'retake' | 'improvement', retakeOf (semester of the first attempt), credit, status, date, by }]
     suppRegs     [{ id, studentId, examId (original), suppExamId (the sitting), classId, subjectIds: [], mode: 'supp' | 'next',
                     invoiceId, status, date, by, promotedAt }]
     exams[].semesterId — the exam belongs to a semester · exams[].suppOf — a supplementary sitting (type 'Supplementary')

   Hooks (small wrappers, like examhub.js): DB.result, DB.combinedResult, DB.sessionGpa, DB.cgpa,
   DB.studentsIn (inside the teacher gradebook only), Print.marksheet, Learner.transcript, ExamHub.resultsTab /
   myResult, Exams.setupHtml / readDraft, the teacher gradebook page. Load after examhub.js.
   ========================================================================== */

const SEM_MODES = [['annual', 'বার্ষিক', 1], ['semester', 'সেমিস্টার', 2], ['trimester', 'ট্রাইমেস্টার', 3], ['term', 'টার্ম', 2]];
const SEM_ORD = ['প্রথম', 'দ্বিতীয়', 'তৃতীয়', 'চতুর্থ', 'পঞ্চম', 'ষষ্ঠ', 'সপ্তম', 'অষ্টম', 'নবম', 'দশম', 'একাদশ', 'দ্বাদশ'];
const SEM_RULES = {
  retake: { latest: 'সর্বশেষ প্রচেষ্টার গ্রেড গণ্য (আগেরটি বাদ)', best: 'সর্বোচ্চ গ্রেডটি গণ্য', both: 'সব প্রচেষ্টাই গণ্য' },
  supp: { replace: 'সাপ্লিমেন্টারির গ্রেড মূল গ্রেডের জায়গায় বসে', best: 'দুটির মধ্যে ভালো গ্রেডটি গণ্য', cap: 'সাপ্লিমেন্টারির গ্রেড, তবে নির্ধারিত সর্বোচ্চ সীমা পর্যন্ত' },
};

/* Structural defaults only (no records). */
DB.addSeeder('academicStructure', () => ({ levels: {}, classes: {}, courses: {}, creditLimit: 24, retakeRule: 'latest', improvement: false, improvementRule: 'best', supp: { enabled: false, rule: 'replace', capPoint: 2, perSubject: true } }));
DB.addSeeder('semesters', () => []);
DB.addSeeder('courseRegs', () => []);
DB.addSeeder('suppRegs', () => []);

const Sem = {
  /* ---------- settings ---------- */
  A() { return (DB.s && DB.s.academicStructure) || {}; },
  suppCfg() { return { enabled: false, rule: 'replace', capPoint: 2, perSubject: true, ...(this.A().supp || {}) }; },
  suppOn() { return !!this.A().supp?.enabled; },
  /** Structure of a class: its own setting, else its level's, else annual. */
  of(classId) {
    const a = this.A(), c = DB.cls(classId); if (!c) return { mode: 'annual' };
    const o = a.classes?.[classId]; if (o?.mode) return o;
    const l = c.level && a.levels?.[c.level]; return l?.mode ? l : { mode: 'annual' };
  },
  isSem(classId) { const m = this.of(classId).mode; return !!m && m !== 'annual'; },
  anySem() { return (DB.s?.classes || []).some(c => this.isSem(c.id)); },
  semClasses(campus = DB.campusId()) { return DB.classesIn(campus).filter(c => this.isSem(c.id)); },
  modeName(mode) { return (SEM_MODES.find(m => m[0] === mode) || SEM_MODES[0])[1]; },
  perYear(classId) { const o = this.of(classId); return +o.perYear || (SEM_MODES.find(m => m[0] === o.mode) || [])[2] || 1; },
  /** Course code and credit of a subject in a class (code falls back to the subject's code). */
  course(classId, subjectId) { const o = this.A().courses?.[classId]?.[subjectId] || {}, s = DB.subject(subjectId); return { credit: +o.credit > 0 ? +o.credit : null, code: o.code || s?.code || subjectId }; },
  hasCredits(classId) { return Object.values(this.A().courses?.[classId] || {}).some(x => +x.credit > 0); },

  /* ---------- semesters & registrations ---------- */
  semesters() { return DB.s.semesters || []; },
  semester(id) { return this.semesters().find(s => s.id === id) || null; },
  byStart: (a, b) => String(a.start || '').localeCompare(String(b.start || '')) || String(a.id).localeCompare(String(b.id)),
  semestersFor(classId) { return this.semesters().filter(s => !s.classIds?.length || s.classIds.includes(classId)).sort(this.byStart); },
  regOpen(s) { const t = U.today(); return !!s?.regStart && t >= s.regStart && t <= (s.regEnd || s.regStart); },
  offered(sem, classId) { const l = sem?.offer?.[classId], subs = DB.classSubjects(classId); return l?.length ? subs.filter(s => l.includes(s.id)) : subs; },
  regs(studentId, semesterId) { return (DB.s.courseRegs || []).filter(r => r.studentId === studentId && (!semesterId || r.semesterId === semesterId) && r.status !== 'dropped'); },
  examsOf(semId) { return DB.s.exams.filter(e => e.semesterId === semId && !e.suppOf).sort((a, b) => a.start.localeCompare(b.start)); },
  /** The exam whose (combined) result is the semester's result: the latest published major exam, else the latest published one. */
  finalExam(semId, published = true) { const l = this.examsOf(semId).filter(e => !published || e.published); return [...l].reverse().find(e => MAJOR_EXAMS.includes(e.type)) || l[l.length - 1] || null; },

  /* ---------- results ---------- */
  /** Graded rows for an explicit list of subjects (registered courses / supplementary subjects); same rules as DB.result. */
  rowsFor(studentId, ex, items) {
    const campus = DB.campusOf(DB.student(studentId)?.classId), seen = new Set();
    return items.map(it => {
      const sub = DB.subject(it.subjectId); if (!sub || seen.has(sub.id) || !Grade.included(ex, sub.id)) return null;
      if (it.classId && !DB.examTakes(ex, it.classId, sub.id)) return null;
      const m = DB.s.marks.find(x => x.examId === ex.id && x.studentId === studentId && x.subjectId === sub.id); if (!m) return null;
      seen.add(sub.id);
      return { subject: sub, cq: m.cq, mcq: m.mcq, pr: m.pr || 0, cfg: Grade.cfg(ex, sub.id), ...Grade.of(m.cq, m.mcq, ex, campus, m.pr, sub.id), reg: it.reg || null };
    }).filter(Boolean);
  },
  agg(rows, ex, st) { return this.creditify({ exam: ex, ...DB.examAggregate(rows, ex, DB.campusOf(st.classId)) }, st); },
  /** Semester classes with credits: GPA = Σ(point × credit) ÷ Σ credit (an F counts 0 with its credits). Other students: unchanged. */
  creditify(r, st) {
    if (!r || !st || !r.rows || !this.isSem(st.classId)) return r;
    r.rows.forEach(x => { const c = this.course(x.reg?.classId || st.classId, x.subject.id); x.credit = x.reg?.credit ?? c.credit; x.code = c.code; });
    const cr = r.rows.filter(x => x.credit > 0);
    if (r.scale === 'letter' || !cr.length || cr.some(x => x.point === null)) return r;
    const W = U.sum(cr, x => x.credit), g = Math.min(+r.scale || 5, U.sum(cr, x => x.point * x.credit) / W);
    return { ...r, gpa: g, letter: Grade.letterForGpa(g, Grade.bands(DB.campusOf(st.classId), r.exam?.session, r.exam)), credits: W, earned: U.sum(cr.filter(x => !x.failed), x => x.credit), creditBased: true };
  },
  /** DB.result before the supplementary outcome: a supplementary sitting shows only its subjects; a semester exam the registered courses. */
  core(studentId, examId) {
    const ex = DB.exam(examId), st = DB.student(studentId);
    if (ex && st && ex.suppOf) { const g = this.suppRegOf(studentId, ex.suppOf); if (g && g.suppExamId === ex.id) return this.agg(this.rowsFor(studentId, ex, g.subjectIds.map(id => ({ subjectId: id }))), ex, st); }
    if (ex && st && this.isSem(st.classId)) {
      const regs = ex.semesterId ? this.regs(studentId, ex.semesterId) : [];
      return regs.length ? this.agg(this.rowsFor(studentId, ex, regs.map(g => ({ subjectId: g.subjectId, classId: g.classId, reg: g }))), ex, st) : this.creditify(this._r0(studentId, examId), st);
    }
    return this._r0(studentId, examId);
  },
  /* ---------- supplementary ---------- */
  suppRegOf(studentId, examId) { return (DB.s.suppRegs || []).find(r => r.studentId === studentId && r.examId === examId && r.status !== 'cancelled') || null; },
  suppExam(origId) { return DB.s.exams.find(e => e.suppOf === origId) || null; },
  /** The final result of an exam once a published supplementary sitting exists (rule: replace / best / cap). */
  applySupp(studentId, ex, r) {
    if (!ex || ex.suppOf || !r?.rows?.length) return r;
    const reg = this.suppRegOf(studentId, ex.id); if (!reg) return r;
    const sx = DB.exam(reg.suppExamId); if (!sx || !sx.published) return r;
    const st = DB.student(studentId), campus = DB.campusOf(st?.classId), cfg = this.suppCfg(), rule = cfg.rule, bands = Grade.bands(campus, ex.session, ex);
    let n = 0;
    const rows = r.rows.map(r0 => {
      if (!reg.subjectIds.includes(r0.subject.id)) return r0;
      const m = DB.s.marks.find(x => x.examId === sx.id && x.studentId === studentId && x.subjectId === r0.subject.id); if (!m) return r0;
      const r1 = { subject: r0.subject, cq: m.cq, mcq: m.mcq, pr: m.pr || 0, cfg: Grade.cfg(sx, r0.subject.id), ...Grade.of(m.cq, m.mcq, sx, campus, m.pr, r0.subject.id) };
      let fin = r1, capped = false;
      if (rule === 'best') { const v = x => (x.point ?? 0) * 1000 + x.pct; fin = v(r1) > v(r0) ? r1 : r0; }
      if (rule === 'cap' && !r1.failed && r1.point !== null && r1.point > +cfg.capPoint) {
        const b = bands.filter(x => x.point !== null && x.point <= +cfg.capPoint).sort((x, y) => y.point - x.point)[0];
        if (b) { fin = { ...r1, letter: b.letter, point: b.point }; capped = true; }
      }
      n++;
      return { ...fin, credit: r0.credit, code: r0.code, reg: r0.reg, supp: { orig: r0, sit: r1, rule, examId: sx.id, used: fin === r0 ? 'orig' : 'supp', capped } };
    });
    if (!n) return r;
    return this.creditify({ ...r, ...DB.examAggregate(rows, ex, campus), exam: r.exam, suppApplied: { reg, exam: sx, rule } }, st);
  },

  /* ---------- transcript: semesters, SGPA, running CGPA, attempts ---------- */
  /** Weighted GPA of course rows (weight = credit, or 1 when no course carries credits). */
  gp(rows) { const use = rows.filter(r => r.has && r.point !== null && r.w > 0), W = U.sum(use, r => r.w); return W ? U.sum(use, r => r.point * r.w) / W : null; },
  /** The attempts that count, per course, under the retake / improvement settings. */
  pick(rows) {
    const A = this.A(), rule = A.retakeRule || 'latest', groups = {}, use = [];
    rows.forEach(r => (groups[r.key] = groups[r.key] || []).push(r));
    Object.values(groups).forEach(g => {
      const done = g.filter(r => r.has && r.point !== null); if (!done.length) return;
      if (done.length === 1 || rule === 'both') { use.push(...done); return; }
      const how = g.some(r => r.kind === 'improvement') ? (A.improvementRule || 'best') : rule;
      use.push(how === 'best' ? done.reduce((b, x) => (x.point >= b.point ? x : b)) : done[done.length - 1]);
    });
    return use;
  },
  transcript(studentId) {
    const cache = DB._xc ? DB._xc() : {}, ck = `semT|${studentId}`; if (cache[ck]) return cache[ck];
    const st = DB.student(studentId), out = { st, sems: [], cgpa: null, earned: 0, attempted: 0, history: [] };
    if (!st) return out;
    [...this.semesters()].sort(this.byStart).forEach(sem => {
      const regs = this.regs(studentId, sem.id), fx = this.finalExam(sem.id);
      if (!regs.length && (!fx || !DB.examTakes(fx, st.classId))) return;
      const res = fx ? DB.combinedResult(studentId, fx.id) : null, base = res ? (res.base || res) : null;
      if (!regs.length && !res?.rows.length) return;
      const byS = new Map((res?.rows || []).map(x => [x.subject.id, x])), sup = new Map((base?.rows || []).filter(x => x.supp).map(x => [x.subject.id, x.supp]));
      const items = regs.length ? regs.map(g => ({ subjectId: g.subjectId, reg: g, classId: g.classId || st.classId })) : res.rows.map(x => ({ subjectId: x.subject.id, reg: null, classId: st.classId }));
      const rows = items.map(it => {
        const x = byS.get(it.subjectId), co = this.course(it.classId, it.subjectId), kind = it.reg?.kind || 'regular';
        return { sem, subjectId: it.subjectId, name: DB.subject(it.subjectId)?.name || it.subjectId, code: co.code, credit: it.reg?.credit ?? co.credit, kind, reg: it.reg,
          key: kind === 'regular' ? `${sem.id}|${it.subjectId}` : `${it.reg.retakeOf || sem.id}|${it.subjectId}`,
          has: !!x, letter: x ? x.letter : null, point: x ? x.point : null, failed: x ? !!x.failed : null, supp: sup.get(it.subjectId) || null };
      });
      out.sems.push({ sem, exam: fx, res, rows, sgpa: res && res.rows.length ? res.gpa : null });
    });
    const all = out.sems.flatMap(s => s.rows), credit = all.some(r => r.credit > 0);
    all.forEach(r => { r.w = credit ? (r.credit || 0) : 1; });
    out.creditBased = credit;
    out.sems.forEach((s, i) => {
      const upto = out.sems.slice(0, i + 1).flatMap(x => x.rows);
      s.cgpa = this.gp(this.pick(upto)); s.no = i + 1;
      s.attempted = U.sum(s.rows.filter(r => r.has), r => r.credit || 0); s.earned = U.sum(s.rows.filter(r => r.has && !r.failed), r => r.credit || 0);
    });
    const fin = new Set(this.pick(all)), groups = {};
    all.forEach(r => { r.counted = fin.has(r); (groups[r.key] = groups[r.key] || []).push(r); });
    Object.values(groups).forEach(g => { g.forEach((r, i) => { r.attempt = i + 1; r.superseded = r.has && !r.counted && g.length > 1; }); if (g.length > 1 || g.some(r => r.supp)) out.history.push(g); });
    out.cgpa = this.gp([...fin]);
    out.earned = U.sum([...fin].filter(r => !r.failed), r => r.credit || 0);
    out.attempted = U.sum([...fin], r => r.credit || 0);
    return (cache[ck] = out);
  },
  /** Students of a gradebook (exam × class × subject): supplementary candidates or the registered students; null = the class list as before. */
  gbStudents(ex, classId, subjectId) {
    if (!ex) return null;
    const list = ids => [...new Set(ids)].map(id => DB.student(id)).filter(s => s && s.status === 'active').sort((a, b) => (a.classId === classId ? 0 : 1) - (b.classId === classId ? 0 : 1) || String(a.section).localeCompare(String(b.section)) || a.roll - b.roll);
    if (ex.suppOf && this.suppOn()) return list((DB.s.suppRegs || []).filter(r => r.suppExamId === ex.id && r.status !== 'cancelled' && r.classId === classId && (!subjectId || r.subjectIds.includes(subjectId))).map(r => r.studentId));
    if (ex.semesterId && this.isSem(classId)) {
      const regs = (DB.s.courseRegs || []).filter(r => r.semesterId === ex.semesterId && r.classId === classId && r.status !== 'dropped');
      if (!regs.length) return null;
      return list(regs.filter(r => !subjectId || r.subjectId === subjectId).map(r => r.studentId));
    }
    return null;
  },
  /** Earlier courses a student may re-register in a semester: failed or incomplete (retake / carry-over) and, when allowed, passed ones (improvement). */
  candidates(studentId, semId) {
    const sem = this.semester(semId), t = this.transcript(studentId), out = { retake: [], improve: [] };
    if (!sem) return out;
    const groups = {};
    t.sems.filter(s => s.sem.id !== semId && this.byStart(s.sem, sem) < 0).forEach(s => s.rows.forEach(r => (groups[r.key] = groups[r.key] || []).push(r)));
    const maxPt = Math.max(0, ...Grade.bands(DB.campusOf(DB.student(studentId)?.classId)).map(b => b.point || 0));
    Object.entries(groups).forEach(([key, g]) => {
      const last = g[g.length - 1], first = g[0], done = g.filter(r => r.has), best = done.length ? done.reduce((b, x) => (x.point >= b.point ? x : b)) : null;
      const item = { key, subjectId: first.subjectId, name: first.name, code: first.code, credit: first.credit, classId: first.reg?.classId || DB.student(studentId)?.classId, retakeOf: first.reg?.retakeOf || first.sem.id, last, best };
      const incomplete = !last.has && (last.sem.end || '') < U.today();
      if ((best && best.failed) || incomplete) out.retake.push(item);
      else if (this.A().improvement && best && !best.failed && best.point !== null && best.point < maxPt) out.improve.push(item);
    });
    return out;
  },

  /* ---------- small display helpers ---------- */
  kindBadge(r) { return r.kind === 'retake' ? badge('রিটেক', 'amber') : r.kind === 'improvement' ? badge('মানোন্নয়ন', 'violet') : ''; },
  f2: v => (v === null || v === undefined || isNaN(v) ? '—' : U.bn((+v).toFixed(2))),
  cr: v => (v === null || v === undefined || v === '' ? '—' : bnNum(+v)),
  canEdit() { return App.perm('exams', 'edit'); },
  note(html) { return `<div class="card p-4 mb-4 text-slate-600 flex gap-2">${icon('info', 'w-5 h-5 shrink-0 text-brand-600')}<div>${html}</div></div>`; },
};
Sem._r0 = DB.result.bind(DB);

/* ==========================================================================
   Hooks into the existing result engine
   ========================================================================== */
DB.result = function (studentId, examId) {
  const r = Sem.core(studentId, examId);
  return Sem.suppOn() ? Sem.applySupp(studentId, DB.exam(examId), r) : r;
};
(() => {
  const cmb0 = DB.combinedResult.bind(DB), sg0 = DB.sessionGpa.bind(DB), cg0 = DB.cgpa.bind(DB), sIn0 = DB.studentsIn.bind(DB);
  /* combined results of semester students: credit-weighted as well */
  DB.combinedResult = function (studentId, examId) {
    const r = cmb0(studentId, examId); if (!r.combined) return r;
    const st = DB.student(studentId); if (!st || !Sem.isSem(st.classId)) return r;
    r.rows.forEach(x => { x.reg = x.reg || r.base?.rows.find(b => b.subject.id === x.subject.id)?.reg || null; });
    return Sem.creditify(r, st);
  };
  /* session GPA and CGPA of semester students: credit-weighted over courses (retake rule applied) */
  DB.sessionGpa = function (studentId, session = DB.session()) {
    const st = DB.student(studentId);
    if (st && Sem.isSem(st.classId)) { const rows = Sem.transcript(studentId).sems.filter(s => s.sem.session === session).flatMap(s => s.rows); if (rows.some(r => r.has)) return Sem.gp(Sem.pick(rows)); }
    return sg0(studentId, session);
  };
  DB.cgpa = function (studentId) {
    const st = DB.student(studentId);
    if (st && Sem.isSem(st.classId)) { const t = Sem.transcript(studentId); if (t.sems.some(s => s.rows.some(r => r.has))) return t.cgpa; }
    return cg0(studentId);
  };
  /* the teacher gradebook lists registered students (semester exams) / supplementary candidates */
  DB.studentsIn = function (classId, section) {
    if (Sem._gbOn && (section == null || section === '')) { const g = App.ui.gb; if (g && g.cls === classId) { const l = Sem.gbStudents(DB.exam(g.exam), classId, g.subj); if (l) return l; } }
    return sIn0(classId, section);
  };
})();

/* ---------- teacher gradebook ---------- */
(() => {
  const gb = App.portals.teacher?.pages.find(p => p.id === 'gradebook'); if (!gb) return;
  const r0 = gb.render;
  gb.render = function (q) {
    Sem._gbOn = true;
    let html; try { html = r0.call(this, q); } finally { Sem._gbOn = false; }
    const ui = App.ui.gb, ex = ui && DB.exam(ui.exam); if (!ex || ui._skip) return html;
    let note = '';
    if (ex.suppOf && Sem.suppOn()) note = `<b>সাপ্লিমেন্টারি পরীক্ষা</b> (${esc(DB.exam(ex.suppOf)?.name || '')}) — শুধু নিবন্ধিত শিক্ষার্থী।`;
    else if (ex.semesterId && Sem.isSem(ui.cls)) {
      const regs = (DB.s.courseRegs || []).filter(r => r.semesterId === ex.semesterId && r.classId === ui.cls && r.subjectId === ui.subj && r.status !== 'dropped');
      if (regs.length) {
        note = `${esc(Sem.semester(ex.semesterId)?.name || '')} — এই কোর্সে নিবন্ধিত ${bnNum(regs.length)} জন শিক্ষার্থী (রিটেক / মানোন্নয়নসহ)।`;
        regs.filter(r => r.kind !== 'regular').forEach(r => { html = html.replace(new RegExp(`(<tr data-st="${r.studentId}">[\\s\\S]*?<td class="font-semibold">[^<]*)`), `$1 ${Sem.kindBadge(r)}`); });
      }
    }
    return note ? html.replace('<div class="card scroll-x"><table class="table" id="gb-table">', Sem.note(note) + '<div class="card scroll-x"><table class="table" id="gb-table">') : html;
  };
})();

/* ---------- exam setup: link an exam to a semester; keep a supplementary exam's own type ---------- */
(() => {
  const h0 = Exams.setupHtml, d0 = Exams.readDraft;
  Exams.setupHtml = function (id) {
    let html = h0.call(this, id); const e = App.ui.exDraft;
    if (e && !EXAM_TYPES.includes(e.type)) html = html.replace('<select class="select" name="type">', `<select class="select" name="type"><option value="${esc(e.type)}" selected>${esc(bn(e.type))}</option>`);
    if (!Sem.anySem() || e?.suppOf) return html;
    const list = Sem.semesters().filter(s => s.session === e.session || s.id === e.semesterId).sort(Sem.byStart);
    if (!list.length && !e.semesterId) return html;
    const card = `<div class="card p-5"><div class="font-semibold mb-2">সেমিস্টার</div>
      <select class="select max-w-md" name="semesterId"><option value="">— কোনো সেমিস্টার নয় —</option>${list.map(s => `<option value="${s.id}" ${s.id === e.semesterId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>`;
    const at = html.indexOf('<div class="card p-5"><div class="font-semibold">২ ·');
    return at < 0 ? html : html.slice(0, at) + card + html.slice(at);
  };
  Exams.readDraft = function () {
    const out = d0.apply(this, arguments), f = $('#ex-setup');
    if (f && f.semesterId) App.ui.exDraft.semesterId = f.semesterId.value || null;
    return out;
  };
})();

/* ---------- official marksheet: supplementary and semester details ---------- */
(() => {
  const m0 = Print.marksheet.bind(Print);
  Print.marksheet = function (st, examId) {
    const out = m0(st, examId), ex = DB.exam(examId);
    const r = DB.result(st.id, examId), semx = ex?.semesterId && Sem.isSem(st.classId);
    if (!r.suppApplied && !semx && !ex?.suppOf) return out;
    const f2 = Sem.f2, parts = [];
    if (ex?.suppOf) parts.push(`<div style="margin-top:3mm;border:.3mm solid #f59e0b;background:#fffbeb;border-radius:2mm;padding:2mm 3mm;font-size:9pt"><b>সাপ্লিমেন্টারি পরীক্ষা</b> — ${esc(DB.exam(ex.suppOf)?.name || '')}-এর পুনঃপরীক্ষা। চূড়ান্ত ফলাফল মূল পরীক্ষার নম্বরপত্রে দেখানো হয়।</div>`);
    if (r.suppApplied) {
      const rows = r.rows.filter(x => x.supp);
      parts.push(`<div style="margin-top:3mm;font-size:10pt;font-weight:700;color:#b45309">সাপ্লিমেন্টারি পরীক্ষার ফলাফল <span style="font-weight:400;font-size:8pt;color:#475569">— নিয়ম: ${esc(SEM_RULES.supp[r.suppApplied.rule] || '')}${r.suppApplied.rule === 'cap' ? ` (সর্বোচ্চ পয়েন্ট ${f2(Sem.suppCfg().capPoint)})` : ''}। ওপরের সারণিতে (সা) চিহ্নিত বিষয়ে চূড়ান্ত গ্রেড দেখানো হয়েছে।</span></div>
        <table class="ms-table" style="font-size:9pt;margin-top:1mm"><thead><tr><th>বিষয়</th><th>মূল পরীক্ষা</th><th>সাপ্লিমেন্টারি (${esc(r.suppApplied.exam.name)})</th><th>চূড়ান্ত গ্রেড</th></tr></thead><tbody>${rows.map(x => `<tr><td>${esc(x.subject.name)}</td><td>${bnNum(x.supp.orig.total)}/${bnNum(x.supp.orig.max)} · <b style="color:#dc2626">${esc(x.supp.orig.letter)}</b></td><td>${bnNum(x.supp.sit.total)}/${bnNum(x.supp.sit.max)} · <b>${esc(x.supp.sit.letter)}</b></td><td><b style="color:${x.failed ? '#dc2626' : '#059669'}">${esc(x.letter)}</b>${x.point !== null ? ` (${f2(x.point)})` : ''}${x.supp.capped ? ' · সীমিত' : ''}</td></tr>`).join('')}</tbody></table>`);
    }
    if (semx) {
      const t = Sem.transcript(st.id), s = t.sems.find(x => x.sem.id === ex.semesterId);
      parts.push(`<div style="margin-top:3mm;border:.3mm solid #cbd5e1;border-radius:2mm;padding:2mm 3mm;font-size:9.5pt"><b>${esc(Sem.semester(ex.semesterId)?.name || '')}</b>${r.creditBased ? ` · নিবন্ধিত ক্রেডিট ${Sem.cr(r.credits)} · অর্জিত ক্রেডিট ${Sem.cr(r.earned)} · জিপিএ ক্রেডিটভিত্তিক` : ''}${s && s.exam?.id === ex.id ? ` · <b>এসজিপিএ ${f2(s.sgpa)}</b> · সিজিপিএ ${f2(s.cgpa)}` : ''}</div>`);
    }
    let first = out[0];
    r.rows.filter(x => x.supp).forEach(x => { first = first.replace(`<tr><td>${esc(x.subject.name)}</td>`, `<tr><td>${esc(x.subject.name)} <span style="color:#b45309;font-weight:700">(সা)</span></td>`); });
    const extra = parts.join(''), at = first.indexOf('<div style="display:flex;gap:5mm;margin-top:');
    if (at >= 0 && r.rows.length + r.rows.filter(x => x.supp).length <= 12) first = first.slice(0, at) + extra + first.slice(at);
    else return [first, ...out.slice(1), `<div class="sheet padded">${Print.header('নম্বরপত্র — সংযুক্তি')}<div style="font-size:10.5pt"><b>${esc(pn(st))}</b> · ${esc(DB.className(st.classId))} · রোল ${bnNum(st.roll)} · ${esc(st.regNo)} · ${esc(ex.name)}</div>${extra}</div>`];
    return [first, ...out.slice(1)];
  };
})();

/* ==========================================================================
   Transcript (screen + print)
   ========================================================================== */
Object.assign(Sem, {
  marks(r) { return [r.kind === 'retake' ? 'R' : r.kind === 'improvement' ? 'I' : '', r.supp ? 'S' : '', r.superseded ? '†' : ''].join(' ').trim(); },
  legend() { return `R = রিটেক / ক্যারি-ওভার · I = মানোন্নয়ন · S = সাপ্লিমেন্টারি পরীক্ষার ফল যুক্ত · † = অন্য প্রচেষ্টার কারণে সিজিপিএ-তে গণ্য নয় · সিজিপিএ-তে পুনরাবৃত্ত কোর্স: ${SEM_RULES.retake[this.A().retakeRule || 'latest']}।`; },
  ord(n) { return bnNum(n) + ({ 1: 'ম', 2: 'য়', 3: 'য়', 4: 'র্থ', 6: 'ষ্ঠ' }[n] || 'ম'); },
  historyText(g) { const parts = []; g.forEach((r, i) => { if (r.supp) parts.push(`${this.ord(i + 1)} প্রচেষ্টা ${r.supp.orig.letter} → সাপ্লিমেন্টারি ${r.supp.sit.letter} (${r.sem.name})`); else parts.push(`${this.ord(i + 1)} প্রচেষ্টা ${r.has ? r.letter : 'ফল অপেক্ষমাণ'} (${r.sem.name})`); }); return parts.join(' → '); },
  /** On-screen transcript (student, guardian, dossier, Exam Centre). */
  transcriptHtml(st, opts = {}) {
    const t = this.transcript(st.id), f2 = this.f2, cr = t.creditBased;
    if (!t.sems.length) return `<div class="card p-6 mb-4">${emptyState('এখনো কোনো সেমিস্টারের ফলাফল বা নিবন্ধন নেই।', 'scroll-text')}</div>`;
    const head = `<div class="card p-4 mb-4 flex flex-wrap gap-4 items-center"><div><div class="label">সিজিপিএ (সেমিস্টারভিত্তিক)</div><div class="text-2xl font-extrabold">${f2(t.cgpa)}</div></div>${cr ? `<div class="border-l border-slate-200 pl-4"><div class="label">অর্জিত ক্রেডিট</div><div class="text-xl font-bold">${this.cr(t.earned)}</div></div>` : ''}<div class="border-l border-slate-200 pl-4"><div class="label">সেমিস্টার</div><div class="text-xl font-bold">${bnNum(t.sems.length)}${this.of(st.classId).total ? `/${bnNum(this.of(st.classId).total)}` : ''}</div></div><span class="flex-1"></span>${App.perm('exams', 'print') || App.session?.role === 'STUDENT' || App.session?.role === 'GUARDIAN' ? `<button class="btn btn-primary" onclick="Sem.printTranscript(['${st.id}'])">${icon('printer')} ট্রান্সক্রিপ্ট মুদ্রণ</button>` : ''}</div>`;
    const sems = t.sems.map(s => `<div class="card mb-4"><div class="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2"><div class="font-semibold w-full sm:w-auto sm:flex-1">${esc(s.sem.name)} <span class="text-slate-500 font-normal">· শিক্ষাবর্ষ ${esc(U.bn(s.sem.session))}</span></div><span>এসজিপিএ <b>${f2(s.sgpa)}</b></span><span class="text-slate-500">সিজিপিএ ${f2(s.cgpa)}</span>${cr ? `<span class="text-slate-500">ক্রেডিট ${this.cr(s.earned)}/${this.cr(s.attempted)}</span>` : ''}</div>
      <div class="scroll-x"><table class="table"><thead><tr><th>কোড</th><th>কোর্স</th>${cr ? '<th>ক্রেডিট</th>' : ''}<th>গ্রেড</th><th>পয়েন্ট</th><th></th></tr></thead><tbody>${s.rows.map(r => `<tr class="${r.superseded ? 'opacity-60' : ''}"><td class="font-mono whitespace-nowrap">${esc(r.code)}</td><td class="font-semibold">${esc(r.name)}</td>${cr ? `<td>${this.cr(r.credit)}</td>` : ''}<td>${r.has ? (r.failed ? badge(r.letter, 'red') : esc(r.letter)) : '<span class="text-slate-400">অপেক্ষমাণ</span>'}</td><td>${r.has ? f2(r.point) : '—'}</td><td class="whitespace-nowrap">${this.kindBadge(r)}${r.supp ? ' ' + badge(`সাপ্লি. ${r.supp.orig.letter}→${r.supp.sit.letter}`, 'amber') : ''}${r.superseded ? ' ' + badge('গণ্য নয়', 'slate') : ''}</td></tr>`).join('')}</tbody></table></div></div>`).join('');
    const hist = t.history.length ? `<div class="card p-4 mb-4"><div class="font-semibold mb-2">একাধিক প্রচেষ্টার ইতিহাস</div><ul class="space-y-1">${t.history.map(g => `<li><b>${esc(g[0].code)} ${esc(g[0].name)}:</b> ${esc(this.historyText(g))}</li>`).join('')}</ul></div>` : '';
    return head + sems + hist + `<p class="text-slate-500 mb-4">${esc(this.legend())}</p>`;
  },
  printTranscript(ids) {
    const sheets = ids.map(id => DB.student(id)).filter(Boolean).flatMap(st => this.transcriptSheets(st));
    if (!sheets.length) return toast('মুদ্রণের মতো কোনো ট্রান্সক্রিপ্ট নেই।', 'error');
    Print.preview('সেমিস্টার ট্রান্সক্রিপ্ট', sheets, { re: ['Sem.printTranscript', ids] });
  },
  transcriptSheets(st) {
    const t = this.transcript(st.id); if (!t.sems.length) return [];
    const c = DB.cls(st.classId), f2 = this.f2, cr = t.creditBased, cols = cr ? 6 : 5;
    const fx = t.sems.find(s => s.exam)?.exam, bands = Grade.bands(DB.campusOf(st.classId), fx?.session, fx);
    const scale = bands.map((b, i) => `${b.letter} ${i === 0 ? `≥${bnNum(b.min)}` : `${bnNum(b.min)}–${bnNum(bands[i - 1].min - 1)}`}%${b.point !== null ? ` (${bnNum(b.point.toFixed(2))})` : ''}`).join(' · ');
    const blocks = t.sems.map(s => ({ lines: s.rows.length + 3, html: `<div style="margin-bottom:3mm"><div style="display:flex;justify-content:space-between;gap:3mm;font-weight:700;font-size:10pt;color:var(--brand-ink);border-bottom:.4mm solid var(--brand);padding-bottom:.5mm;margin-bottom:1mm"><span>${bnNum(s.no)} · ${esc(s.sem.name)}</span><span style="font-weight:400;font-size:8.5pt">${U.fmtDate(s.sem.start)} – ${U.fmtDate(s.sem.end)}</span></div>
      <table class="ms-table" style="font-size:8.8pt"><thead><tr><th style="width:22mm">কোড</th><th>কোর্সের নাম</th>${cr ? '<th style="width:16mm">ক্রেডিট</th>' : ''}<th style="width:20mm">লেটার গ্রেড</th><th style="width:20mm">গ্রেড পয়েন্ট</th><th style="width:16mm">চিহ্ন</th></tr></thead>
      <tbody>${s.rows.map(r => `<tr${r.superseded ? ' style="color:#64748b"' : ''}><td>${esc(r.code)}</td><td style="text-align:left">${esc(r.name)}</td>${cr ? `<td>${this.cr(r.credit)}</td>` : ''}<td style="font-weight:700;color:${r.failed ? '#dc2626' : '#0f172a'}">${r.has ? esc(r.letter) : '—'}</td><td>${r.has ? f2(r.point) : '—'}</td><td>${esc(this.marks(r))}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th colspan="${cols}" style="text-align:left">এসজিপিএ ${f2(s.sgpa)}${cr ? ` · নিবন্ধিত ক্রেডিট ${this.cr(s.attempted)} · অর্জিত ক্রেডিট ${this.cr(s.earned)}` : ''} · ক্রমযোজিত সিজিপিএ ${f2(s.cgpa)}</th></tr></tfoot></table></div>` }));
    const hist = t.history.map(g => `<div>• <b>${esc(g[0].code)} ${esc(g[0].name)}:</b> ${esc(this.historyText(g))}</div>`).join('');
    const tail = `<div style="border:.3mm solid #cbd5e1;border-radius:2mm;padding:2mm 3mm;font-size:9.5pt;margin-top:2mm"><b>সিজিপিএ ${f2(t.cgpa)}</b>${cr ? ` · মোট অর্জিত ক্রেডিট ${this.cr(t.earned)}` : ''} · সেমিস্টার ${bnNum(t.sems.length)}</div>
      ${hist ? `<div style="font-size:8.5pt;line-height:1.5;margin-top:2mm"><b>একাধিক প্রচেষ্টার ইতিহাস</b>${hist}</div>` : ''}
      <div style="font-size:7.8pt;color:#475569;line-height:1.5;margin-top:2mm"><b>চিহ্ন:</b> ${esc(this.legend())}<br><b>গ্রেড স্কেল:</b> ${esc(scale)}${cr ? '<br><b>জিপিএ:</b> Σ(গ্রেড পয়েন্ট × ক্রেডিট) ÷ Σ ক্রেডিট; অকৃতকার্য কোর্স ০ পয়েন্ট হিসেবে ক্রেডিটসহ গণ্য।' : ''}</div>`;
    const tailLines = 6 + t.history.length;
    const info = `<div style="display:flex;gap:5mm;margin-bottom:4mm"><table style="flex:1;font-size:10pt;line-height:1.6">
        <tr><td style="width:36mm;color:#475569">শিক্ষার্থীর নাম</td><td><b>${esc(pn(st))}</b></td></tr>
        <tr><td style="color:#475569">শ্রেণি / প্রোগ্রাম</td><td>${esc(c?.name || '')} · ${esc(this.modeName(this.of(st.classId).mode))}ভিত্তিক${this.of(st.classId).total ? ` (মোট ${bnNum(this.of(st.classId).total)}টি)` : ''}</td></tr>
        <tr><td style="color:#475569">আইডি · নিবন্ধন</td><td>${esc(st.id)} · ${esc(st.regNo)}</td></tr>
        <tr><td style="color:#475569">ভর্তির তারিখ</td><td>${U.fmtDate(st.admissionDate || st.joinDate || '')}</td></tr></table>
      <div style="text-align:center">${qr(verifyUrl('transcript', st.regNo + '|SEM'), 80)}<div style="font-size:6.5pt;color:#64748b">${esc(st.regNo)}</div></div></div>`;
    const pages = [[]]; let left = 30;
    blocks.forEach(b => { if (b.lines > left && pages[pages.length - 1].length) { pages.push([]); left = 40; } left -= b.lines; pages[pages.length - 1].push(b.html); });
    const lastFits = left >= tailLines; if (!lastFits) pages.push([]);
    const sig = `<div style="position:absolute;bottom:20mm;left:14mm;right:14mm;display:flex;justify-content:space-between;align-items:flex-end">${Print.signature('Exam Controller')}${Print.stamp()}${Print.signature('Principal')}</div>`;
    return pages.map((p, i) => `<div class="sheet padded"><div class="watermark">${esc(DB.s.school.shortName)}</div>${i === 0 ? Print.header('সেমিস্টারভিত্তিক ট্রান্সক্রিপ্ট') + info : `<div style="font-size:9.5pt;color:#475569;margin-bottom:3mm">${esc(pn(st))} · ${esc(st.regNo)} — ট্রান্সক্রিপ্ট (চলমান)</div>`}${p.join('')}${i === pages.length - 1 ? tail + sig : ''}
      <div style="position:absolute;bottom:10mm;left:14mm;right:14mm;display:flex;justify-content:space-between;font-size:7.5pt;color:#64748b"><span>প্রদানের তারিখ ${U.fmtDate(U.today())}</span><span>পৃষ্ঠা ${bnNum(i + 1)}/${bnNum(pages.length)}</span></div></div>`);
  },
});

/* the learner transcript (student, guardian, dossier) gets the semester transcript on top */
(() => {
  if (typeof Learner === 'undefined') return;
  const t0 = Learner.transcript.bind(Learner);
  Learner.transcript = function (st) {
    if (!st || !Sem.isSem(st.classId)) return t0(st);
    return `<div class="font-semibold mb-2">সেমিস্টারভিত্তিক ট্রান্সক্রিপ্ট</div>${Sem.transcriptHtml(st)}<div class="font-semibold mb-2">পরীক্ষাভিত্তিক ফলাফল</div>${t0(st)}`;
  };
})();

/* Exam Centre → ফলাফল: semester summary, supplementary hints; learners: SGPA / CGPA and supplementary details */
(() => {
  const rt0 = ExamHub.resultsTab, my0 = ExamHub.myResult;
  ExamHub.resultsTab = function (ex, cls) {
    const html = rt0.call(this, ex, cls); if (this.isLearner()) return html;
    return html + Sem.hubExtras(ex, cls);
  };
  ExamHub.myResult = function (ex, st) {
    const html = my0.call(this, ex, st); if (!st || !ex.published) return html;
    let add = '';
    const r = DB.result(st.id, ex.id);
    if (r.suppApplied) add += `<div class="card scroll-x mt-4"><div class="px-5 py-3 border-b border-slate-100 font-semibold">সাপ্লিমেন্টারি পরীক্ষার ফলাফল <span class="font-normal text-slate-500">· ${esc(SEM_RULES.supp[r.suppApplied.rule])}</span></div><table class="table"><thead><tr><th>বিষয়</th><th>মূল পরীক্ষা</th><th>সাপ্লিমেন্টারি</th><th>চূড়ান্ত</th></tr></thead><tbody>${r.rows.filter(x => x.supp).map(x => `<tr><td class="font-semibold">${esc(x.subject.name)}</td><td>${badge(x.supp.orig.letter, 'red')}</td><td>${esc(x.supp.sit.letter)}</td><td>${x.failed ? badge(x.letter, 'red') : `<b>${esc(x.letter)}</b>`}</td></tr>`).join('')}</tbody></table></div>`;
    if (Sem.isSem(st.classId)) { const t = Sem.transcript(st.id), s = ex.semesterId && t.sems.find(x => x.sem.id === ex.semesterId); add += `<div class="card p-4 mt-4 flex flex-wrap items-center gap-4">${s ? `<div><div class="label">${esc(s.sem.name)} · এসজিপিএ</div><div class="text-xl font-bold">${Sem.f2(s.sgpa)}</div></div>` : ''}<div><div class="label">সিজিপিএ</div><div class="text-xl font-bold">${Sem.f2(t.cgpa)}</div></div><span class="flex-1"></span><button class="btn btn-primary" onclick="Sem.printTranscript(['${st.id}'])">${icon('printer')} ট্রান্সক্রিপ্ট</button></div>`; }
    return html + add;
  };
})();

/* ==========================================================================
   Settings → সেমিস্টার ও সাপ্লিমেন্টারি
   ========================================================================== */
Object.assign(Sem, {
  modeSelect(name, val, inherit) { return `<select class="select" name="${name}">${inherit ? `<option value="" ${!val ? 'selected' : ''}>${esc(inherit)}</option>` : ''}${SEM_MODES.map(([k, l]) => `<option value="${k}" ${k === val ? 'selected' : ''}>${l}</option>`).join('')}</select>`; },
  settingsHtml() {
    const A = this.A(), S = this.suppCfg(), can = App.perm('settings', 'edit'), lv = DB.s.levels || [], cls = DB.classesIn(), head = (DB.s.feeHeads || []).find(h => h.id === 'FH-SUP');
    const num = (n, v, extra = '') => `<input type="number" class="input !w-24" name="${n}" value="${v ?? ''}" ${extra}>`;
    const radio = (n, k, label, cur) => `<label class="flex items-start gap-2"><input type="radio" name="${n}" value="${k}" ${cur === k ? 'checked' : ''} class="mt-1.5"><span>${label}</span></label>`;
    return `<form id="sem-set" class="space-y-5 max-w-5xl" onsubmit="Sem.saveSettings(this);return false">
      <div class="card scroll-x"><div class="px-5 py-3 border-b border-slate-100 font-semibold">স্তর / প্রোগ্রামভিত্তিক একাডেমিক কাঠামো</div><table class="table"><thead><tr><th>স্তর</th><th>কাঠামো</th><th>বছরে কয়টি</th><th>প্রোগ্রামে মোট</th></tr></thead><tbody>
        ${lv.map(l => { const o = A.levels?.[l.id] || {}; return `<tr><td class="font-semibold">${esc(l.name)}</td><td>${this.modeSelect(`lv_${l.id}`, o.mode || 'annual')}</td><td>${num(`lvp_${l.id}`, o.perYear, 'min="1" max="6" placeholder="ডিফল্ট"')}</td><td>${num(`lvt_${l.id}`, o.total, 'min="1" max="24" placeholder="—"')}</td></tr>`; }).join('') || `<tr><td colspan="4">${emptyState('কোনো স্তর নেই।')}</td></tr>`}</tbody></table></div>
      <div class="card scroll-x"><div class="px-5 py-3 border-b border-slate-100"><div class="font-semibold">শ্রেণিভিত্তিক ব্যতিক্রম — ${esc(DB.campus()?.name || '')}</div></div><table class="table"><thead><tr><th>শ্রেণি</th><th>কাঠামো</th><th>বছরে কয়টি</th><th>প্রোগ্রামে মোট</th></tr></thead><tbody>
        ${cls.map(c => { const o = A.classes?.[c.id] || {}, lvm = c.level && A.levels?.[c.level]?.mode; return `<tr><td class="font-semibold">${esc(c.name)}</td><td>${this.modeSelect(`cl_${c.id}`, o.mode, `স্তর অনুযায়ী (${this.modeName(lvm || 'annual')})`)}</td><td>${num(`clp_${c.id}`, o.perYear, 'min="1" max="6" placeholder="—"')}</td><td>${num(`clt_${c.id}`, o.total, 'min="1" max="24" placeholder="—"')}</td></tr>`; }).join('')}</tbody></table></div>
      <div class="card p-5 space-y-3"><div class="font-semibold">রিটেক, ক্যারি-ওভার ও মানোন্নয়ন</div>
        <div class="flex flex-wrap items-center gap-2"><label for="sem-limit">প্রতি সেমিস্টারে সর্বোচ্চ ক্রেডিট (০ = সীমা নেই)</label>${num('creditLimit', A.creditLimit ?? 24, 'id="sem-limit" min="0" step="0.5"')}</div>
        <div class="font-semibold pt-1">একই কোর্স একাধিকবার নেওয়া হলে সিজিপিএ-তে কোন গ্রেড গণ্য হবে</div>
        ${Object.entries(SEM_RULES.retake).map(([k, l]) => radio('retakeRule', k, l, A.retakeRule || 'latest')).join('')}
        <label class="flex items-center gap-2 pt-1"><input type="checkbox" name="improvement" ${A.improvement ? 'checked' : ''}> মানোন্নয়ন পরীক্ষা চালু</label>
        <div class="pl-6 space-y-1">${radio('improvementRule', 'best', 'মানোন্নয়নে দুটির মধ্যে ভালো গ্রেড গণ্য', A.improvementRule || 'best')}${radio('improvementRule', 'latest', 'মানোন্নয়নে সর্বশেষ গ্রেড গণ্য', A.improvementRule || 'best')}</div></div>
      <div class="card p-5 space-y-3"><div class="font-semibold">সাপ্লিমেন্টারি / পুনঃপরীক্ষা</div>
        <label class="flex items-center gap-2"><input type="checkbox" name="suppOn" ${S.enabled ? 'checked' : ''}> সাপ্লিমেন্টারি পরীক্ষা চালু</label>
        <div class="font-semibold pt-1">মূল ফলাফলে সাপ্লিমেন্টারির ফল কীভাবে যুক্ত হবে</div>
        ${Object.entries(SEM_RULES.supp).map(([k, l]) => radio('suppRule', k, l, S.rule)).join('')}
        <div class="flex flex-wrap items-center gap-2 pl-6"><label for="sem-cap">সর্বোচ্চ গ্রেড পয়েন্ট</label>${num('capPoint', S.capPoint, 'id="sem-cap" min="0" max="5" step="0.25"')}</div>
        <div class="grid sm:grid-cols-2 gap-3 pt-1"><div><label class="label" for="sem-fee">ফি (৳, ০ = ফি নেই)</label><input type="number" min="0" class="input" id="sem-fee" name="suppFee" value="${head?.amount ?? 0}"></div>
          <label class="flex items-center gap-2 sm:pt-7"><input type="checkbox" name="perSubject" ${S.perSubject !== false ? 'checked' : ''}> ফি প্রতি বিষয়ে</label></div></div>
      ${can ? `<div class="flex justify-end"><button class="btn btn-primary">${icon('save')} সংরক্ষণ করুন</button></div>` : ''}</form>`;
  },
  saveSettings(f) {
    if (!App.perm('settings', 'edit')) return toast('সেটিংস পরিবর্তনের অনুমতি নেই।', 'error');
    const d = formData(f), A = DB.s.academicStructure || (DB.s.academicStructure = {}), n = v => (v === '' || v === undefined ? undefined : +v || undefined);
    const lv = {}; (DB.s.levels || []).forEach(l => { const m = d[`lv_${l.id}`]; if (m && m !== 'annual') lv[l.id] = JSON.parse(JSON.stringify({ mode: m, perYear: n(d[`lvp_${l.id}`]), total: n(d[`lvt_${l.id}`]) })); });
    const cl = { ...(A.classes || {}) };
    DB.classesIn().forEach(c => { const m = d[`cl_${c.id}`]; if (m) cl[c.id] = JSON.parse(JSON.stringify({ mode: m, perYear: n(d[`clp_${c.id}`]), total: n(d[`clt_${c.id}`]) })); else delete cl[c.id]; });
    Object.assign(A, { levels: lv, classes: cl, courses: A.courses || {}, creditLimit: Math.max(0, +d.creditLimit || 0), retakeRule: d.retakeRule || 'latest', improvement: !!f.improvement.checked, improvementRule: d.improvementRule || 'best',
      supp: { enabled: !!f.suppOn.checked, rule: d.suppRule || 'replace', capPoint: d.capPoint === '' ? 2 : +d.capPoint, perSubject: !!f.perSubject.checked } });
    const fee = Math.max(0, +d.suppFee || 0), heads = DB.s.feeHeads || (DB.s.feeHeads = []), h = heads.find(x => x.id === 'FH-SUP');
    if (h) h.amount = fee; else if (fee > 0) heads.push({ id: 'FH-SUP', name: 'সাপ্লিমেন্টারি পরীক্ষার ফি', type: 'One-time', frequency: 'Once', account: '4200', amount: fee });
    DB.audit('ACADEMIC_STRUCTURE', 'settings', `levels ${JSON.stringify(lv)} · classes ${Object.keys(cl).length} · retake ${A.retakeRule} · supp ${A.supp.enabled ? A.supp.rule : 'off'} fee ${fee}`); DB.save();
    toast('একাডেমিক কাঠামো সংরক্ষিত হয়েছে।', 'success'); App.refresh();
  },
});
/** Settings tab (customize.js re-defines Settings.TABS later, so it is added at boot). */
Sem.addSettingsTab = () => {
  if (typeof Settings === 'undefined' || !Settings.TABS || Settings.TABS.some(t => t[0] === 'semester')) return;
  const i = Settings.TABS.findIndex(t => t[0] === 'policy');
  Settings.TABS.splice(i < 0 ? Settings.TABS.length : i + 1, 0, ['semester', 'সেমিস্টার ও সাপ্লিমেন্টারি', 'calendar-range']);
  Settings.semester = () => Sem.settingsHtml();
};

/* ==========================================================================
   Page: সেমিস্টার ও কোর্স (Root User, Principal) — semesters, courses & credits,
   registration, supplementary exams, transcripts
   ========================================================================== */
Object.assign(Sem, {
  ui() { return App.ui.semP || (App.ui.semP = { tab: null, ses: DB.session() }); },
  tabs() {
    return [this.anySem() && ['sems', 'সেমিস্টার', 'calendar-range'], this.anySem() && ['courses', 'কোর্স ও ক্রেডিট', 'book-marked'], this.anySem() && ['reg', 'কোর্স রেজিস্ট্রেশন', 'list-checks'],
      this.suppOn() && ['supp', 'সাপ্লিমেন্টারি', 'rotate-ccw'], this.anySem() && ['transcript', 'ট্রান্সক্রিপ্ট', 'scroll-text']].filter(Boolean);
  },
  page() {
    const ui = this.ui(), T = this.tabs();
    if (!T.some(t => t[0] === ui.tab)) ui.tab = T[0]?.[0];
    const set = `<a class="btn btn-ghost" href="${App.href(App.route.portal, 'settings')}" onclick="App.ui.setTab='semester'">${icon('settings')} কাঠামো ও নিয়ম</a>`;
    const ses = `<select class="select !w-auto" aria-label="শিক্ষাবর্ষ" onchange="Sem.ui().ses=this.value;App.refresh()">${sessionOptions(ui.ses)}</select>`;
    let html = pageHeader('সেমিস্টার ও কোর্স', '', ses + set);
    if (!T.length) return html + `<div class="card p-6">${emptyState('কোনো স্তর বা শ্রেণি সেমিস্টারভিত্তিক নয় এবং সাপ্লিমেন্টারি পরীক্ষা বন্ধ — প্রতিষ্ঠানের সেটিংস → সেমিস্টার ও সাপ্লিমেন্টারি থেকে চালু করুন।', 'calendar-range')}</div>`;
    html += pills(T, ui.tab, id => `Sem.ui().tab='${id}';App.refresh()`);
    return html + (ui.tab === 'sems' ? this.semsTab() : ui.tab === 'courses' ? this.coursesTab() : ui.tab === 'reg' ? this.regTab() : ui.tab === 'supp' ? this.suppTab() : this.transcriptTab());
  },

  /* ---------- সেমিস্টার ---------- */
  semsTab() {
    const ui = this.ui(), list = this.semesters().filter(s => s.session === ui.ses).sort(this.byStart), can = this.canEdit(), here = new Set(this.semClasses().map(c => c.id));
    const shown = list.filter(s => !s.classIds?.length || s.classIds.some(c => here.has(c)));
    return (can ? `<div class="flex flex-wrap gap-2 mb-4"><button class="btn btn-primary" onclick="Sem.generate()">${icon('wand-2')} শিক্ষাবর্ষের সেমিস্টার তৈরি করুন</button><button class="btn btn-ghost" onclick="Sem.editSem()">${icon('plus')} একটি সেমিস্টার যোগ করুন</button></div>` : '')
      + `<div class="card scroll-x"><table class="table"><thead><tr><th>সেমিস্টার</th><th>সময়কাল</th><th>রেজিস্ট্রেশন</th><th>শ্রেণি</th><th>পরীক্ষা</th><th>নিবন্ধিত</th><th></th></tr></thead><tbody>
      ${shown.map(s => { const ex = this.examsOf(s.id), n = new Set((DB.s.courseRegs || []).filter(r => r.semesterId === s.id && r.status !== 'dropped').map(r => r.studentId)).size, open = this.regOpen(s);
        return `<tr><td class="font-semibold">${esc(s.name)}</td><td class="whitespace-nowrap">${U.fmtDate(s.start)} – ${U.fmtDate(s.end)}</td><td class="whitespace-nowrap">${s.regStart ? `${U.fmtDate(s.regStart)} – ${U.fmtDate(s.regEnd)} ${open ? badge('চলছে', 'green') : ''}` : '—'}</td><td>${s.classIds?.length ? esc(s.classIds.map(id => DB.cls(id)?.name || id).join(', ')) : 'সকল সেমিস্টারভিত্তিক শ্রেণি'}</td>
          <td>${ex.map(e => `<div>${esc(e.name)} ${e.published ? badge('প্রকাশিত', 'green') : badge('অপ্রকাশিত', 'slate')}</div>`).join('') || '<span class="text-slate-400">নেই</span>'}</td><td>${bnNum(n)} জন</td>
          <td><div class="flex flex-wrap gap-1">${can ? `<button class="btn btn-ghost btn-sm" onclick="Sem.editSem('${s.id}')">${icon('pencil')} সম্পাদনা</button><button class="btn btn-ghost btn-sm" onclick="Sem.newFinal('${s.id}')">${icon('plus')} চূড়ান্ত পরীক্ষা</button>${!n && !ex.length ? `<button class="btn btn-ghost btn-sm text-red-600" title="মুছে ফেলুন" onclick="Sem.delSem('${s.id}')">${icon('trash-2')}</button>` : ''}` : ''}</div></td></tr>`; }).join('') || `<tr><td colspan="7">${emptyState('এই শিক্ষাবর্ষে কোনো সেমিস্টার নেই।', 'calendar-range')}</td></tr>`}</tbody></table></div>`;
  },
  generate() {
    if (!this.canEdit()) return;
    const ui = this.ui(), cls = this.semClasses(), per = cls.length ? this.perYear(cls[0].id) : 2, mode = cls.length ? this.of(cls[0].id).mode : 'semester';
    App.openDetail({ title: 'শিক্ষাবর্ষের সেমিস্টার তৈরি', render: () => `<form id="sem-gen" class="card p-5 space-y-4 max-w-3xl">
      <div class="grid sm:grid-cols-3 gap-3"><div><label class="label">শিক্ষাবর্ষ</label><select class="select" name="session">${sessionOptions(ui.ses)}</select></div><div><label class="label">কয়টি</label><input type="number" class="input" name="count" min="1" max="6" value="${per}"></div><div><label class="label">প্রথমটি শুরু</label><input type="date" class="input" name="start" value="${esc(ui.ses)}-01-01"></div></div>
      <div><label class="label">নামের ধরন</label><select class="select" name="mode">${SEM_MODES.slice(1).map(([k, l]) => `<option value="${k}" ${k === mode ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><div class="label">শ্রেণি</div><div class="flex flex-wrap gap-x-4 gap-y-1">${cls.map(c => `<label class="flex items-center gap-1.5"><input type="checkbox" name="cl" value="${c.id}" checked> ${esc(c.name)}</label>`).join('') || '<span class="text-slate-400">এই ক্যাম্পাসে কোনো সেমিস্টারভিত্তিক শ্রেণি নেই।</span>'}</div></div>      <div class="flex justify-end gap-2"><button type="button" class="btn btn-ghost" onclick="App.closeDetail()">বাতিল</button><button class="btn btn-primary">${icon('check')} তৈরি করুন</button></div></form>`,
    mount: () => $('#sem-gen').addEventListener('submit', ev => {
      ev.preventDefault(); const f = ev.target, d = formData(f), n = Math.max(1, Math.min(6, +d.count || 2)), classIds = $$('input[name=cl]:checked', f).map(x => x.value), months = Math.floor(12 / n);
      if (!classIds.length) return toast('অন্তত একটি শ্রেণি বাছুন।', 'error');
      const list = DB.s.semesters || (DB.s.semesters = []);
      for (let i = 0; i < n; i++) {
        const start = U.iso(U.addMonths(d.start, i * months)), end = U.iso(U.addDays(U.addMonths(d.start, (i + 1) * months), -1));
        list.push({ id: DB.id('SEM'), name: `${SEM_ORD[i]} ${this.modeName(d.mode)} ${U.bn(d.session)}`, session: d.session, no: i + 1, start, end, regStart: U.iso(U.addDays(start, -14)), regEnd: U.iso(U.addDays(start, 14)), classIds, offer: {} });
      }
      DB.audit('SEMESTER_CREATE', 'exams', `${d.session}: ${n} ${d.mode} for ${classIds.join(',')}`); DB.save(); this.ui().ses = d.session; toast(`${bnNum(n)}টি ${this.modeName(d.mode)} তৈরি হয়েছে।`, 'success'); App.closeDetail();
    }) });
  },
  editSem(id) {
    if (!this.canEdit()) return;
    const s0 = id ? this.semester(id) : null, ui = this.ui();
    const s = s0 ? JSON.parse(JSON.stringify(s0)) : { name: '', session: ui.ses, start: `${ui.ses}-01-01`, end: `${ui.ses}-06-30`, regStart: '', regEnd: '', classIds: this.semClasses().map(c => c.id), offer: {} };
    const cls = this.semClasses().concat((s.classIds || []).map(c => DB.cls(c)).filter(c => c && c.campusId !== DB.campusId()));
    App.openDetail({ title: id ? `সেমিস্টার · ${s.name}` : 'নতুন সেমিস্টার', render: () => `<form id="sem-ed" class="space-y-4 max-w-4xl"><div class="card p-5 grid sm:grid-cols-2 gap-3">
        <div class="sm:col-span-2"><label class="label">নাম</label><input class="input" name="name" value="${esc(s.name)}" required placeholder="যেমন: প্রথম সেমিস্টার ২০২৬"></div>
        <div><label class="label">শিক্ষাবর্ষ</label><select class="select" name="session">${sessionOptions(s.session)}</select></div><div><label class="label">ক্রম</label><input type="number" class="input" name="no" min="1" value="${s.no || ''}"></div>
        <div><label class="label">শুরু</label><input type="date" class="input" name="start" value="${s.start}" required></div><div><label class="label">শেষ</label><input type="date" class="input" name="end" value="${s.end}" required></div>
        <div><label class="label">রেজিস্ট্রেশন শুরু</label><input type="date" class="input" name="regStart" value="${s.regStart || ''}"></div><div><label class="label">রেজিস্ট্রেশন শেষ</label><input type="date" class="input" name="regEnd" value="${s.regEnd || ''}"></div></div>
      <div class="card p-5"><div class="font-semibold mb-3">শ্রেণি ও এই সেমিস্টারের কোর্স</div>
        <div class="grid sm:grid-cols-2 gap-3">${cls.map(c => { const on = !s.classIds?.length || s.classIds.includes(c.id), off = s.offer?.[c.id]; return `<div class="border border-slate-200 rounded-lg p-3"><label class="flex items-center gap-2 font-semibold"><input type="checkbox" name="cl" value="${c.id}" ${on ? 'checked' : ''}> ${esc(DB.className(c.id))}</label>
          <div class="flex flex-wrap gap-x-3 gap-y-1 mt-2 pl-6">${DB.classSubjects(c.id).map(sb => `<label class="flex items-center gap-1.5"><input type="checkbox" name="of_${c.id}" value="${sb.id}" ${!off?.length || off.includes(sb.id) ? 'checked' : ''}> ${esc(this.course(c.id, sb.id).code)} ${esc(sb.name)}</label>`).join('')}</div></div>`; }).join('') || emptyState('কোনো সেমিস্টারভিত্তিক শ্রেণি নেই।')}</div></div>
      <div class="flex justify-end gap-2"><button type="button" class="btn btn-ghost" onclick="App.closeDetail()">বাতিল</button><button class="btn btn-primary">${icon('save')} সংরক্ষণ করুন</button></div></form>`,
    mount: () => $('#sem-ed').addEventListener('submit', ev => {
      ev.preventDefault(); const f = ev.target, d = formData(f);
      if (d.end < d.start) return toast('শেষের তারিখ শুরুর আগে হতে পারে না।', 'error');
      if (d.regStart && d.regEnd && d.regEnd < d.regStart) return toast('রেজিস্ট্রেশনের শেষ তারিখ শুরুর আগে হতে পারে না।', 'error');
      const classIds = $$('input[name=cl]:checked', f).map(x => x.value); if (!classIds.length) return toast('অন্তত একটি শ্রেণি বাছুন।', 'error');
      const offer = {}; classIds.forEach(c => { const all = DB.classSubjects(c).map(x => x.id), on = $$(`input[name="of_${c}"]:checked`, f).map(x => x.value); if (on.length && on.length < all.length) offer[c] = on; });
      const rec = { name: d.name, session: d.session, no: +d.no || null, start: d.start, end: d.end, regStart: d.regStart || '', regEnd: d.regEnd || d.regStart || '', classIds, offer };
      if (s0) Object.assign(s0, rec); else (DB.s.semesters || (DB.s.semesters = [])).push({ id: DB.id('SEM'), ...rec });
      DB.audit(s0 ? 'SEMESTER_EDIT' : 'SEMESTER_CREATE', 'exams', `${d.name} (${d.start}–${d.end})`); DB.save(); toast('সেমিস্টার সংরক্ষিত হয়েছে।', 'success'); App.closeDetail();
    }) });
  },
  delSem(id) { if (!this.canEdit() || !confirm('এই সেমিস্টারটি মুছে ফেলবেন?')) return; DB.s.semesters = this.semesters().filter(s => s.id !== id); DB.audit('SEMESTER_DELETE', 'exams', id); DB.save(); App.refresh(); },
  /** A final exam for the semester (type Semester, weight 0), then its setup page. */
  newFinal(semId) {
    const s = this.semester(semId); if (!s || !this.canEdit()) return;
    const e = { id: `SF${(DB.s.exams.length + 1)}-${s.session}`, name: `${s.name} — চূড়ান্ত পরীক্ষা`, type: 'Semester', session: s.session, start: U.iso(U.addDays(s.end, -20)), weight: 0, published: false, semesterId: s.id, cqMax: 70, mcqMax: 30, prMax: 0, cqPass: 23, mcqPass: 10, prPass: 0, subjects: {}, gradeSource: 'default', passRule: 'component', passPct: 33, failRule: 'anyF', sheet: { position: true, points: true, remarks: true, highest: false } };
    if (s.classIds?.length) e.classes = [...s.classIds];
    while (DB.exam(e.id)) e.id += 'X';
    DB.s.exams.push(e); DB.audit('EXAM_CREATE', 'exams', `${e.name} (semester ${s.id})`); DB.save(); toast('চূড়ান্ত পরীক্ষা তৈরি হয়েছে — নম্বর বণ্টন ও নিয়ম ঠিক করুন।', 'success');
    App.ui.exSes = s.session; Exams.setup(e.id);
  },

  /* ---------- কোর্স ও ক্রেডিট ---------- */
  coursesTab() {
    const ui = this.ui(), cls = this.semClasses(); if (!cls.some(c => c.id === ui.cCls)) ui.cCls = cls[0]?.id;
    if (!ui.cCls) return `<div class="card p-6">${emptyState('এই ক্যাম্পাসে কোনো সেমিস্টারভিত্তিক শ্রেণি নেই।')}</div>`;
    const subs = DB.classSubjects(ui.cCls), can = this.canEdit(), m = this.A().courses?.[ui.cCls] || {};
    return `<div class="card p-4 mb-4 flex flex-wrap gap-3 items-end"><div><label class="label">শ্রেণি / প্রোগ্রাম</label><select class="select" onchange="Sem.ui().cCls=this.value;App.refresh()">${cls.map(c => `<option value="${c.id}" ${c.id === ui.cCls ? 'selected' : ''}>${esc(DB.className(c.id))}</option>`).join('')}</select></div><div class="text-slate-600">${esc(this.modeName(this.of(ui.cCls).mode))}ভিত্তিক · মোট ক্রেডিট <b id="crs-total">${this.cr(U.sum(subs, s => this.course(ui.cCls, s.id).credit || 0))}</b></div></div>
      <form id="crs" onsubmit="Sem.saveCourses(this);return false" class="card scroll-x"><table class="table"><thead><tr><th>বিষয়</th><th>কোর্স কোড</th><th>ক্রেডিট আওয়ার</th></tr></thead><tbody>
      ${subs.map(s => `<tr><td class="font-semibold">${esc(s.name)}</td><td><input class="input !w-36" name="code_${s.id}" value="${esc(m[s.id]?.code || '')}" placeholder="${esc(s.code || s.id)}" ${can ? '' : 'disabled'}></td><td><input type="number" class="input !w-24" min="0" max="12" step="0.5" name="cr_${s.id}" value="${m[s.id]?.credit ?? ''}" placeholder="—" ${can ? '' : 'disabled'} oninput="$('#crs-total').textContent=bnNum($$('#crs input[name^=cr_]').reduce((a,x)=>a+(+x.value||0),0))"></td></tr>`).join('') || `<tr><td colspan="3">${emptyState('এই শ্রেণিতে কোনো বিষয় নেই।')}</td></tr>`}</tbody></table>
      ${can && subs.length ? `<div class="p-4 border-t border-slate-100 flex justify-end"><button class="btn btn-primary">${icon('save')} সংরক্ষণ করুন</button></div>` : ''}</form>`;
  },
  saveCourses(f) {
    if (!this.canEdit()) return;
    const ui = this.ui(), d = formData(f), A = DB.s.academicStructure || (DB.s.academicStructure = {}), courses = A.courses || (A.courses = {}), m = {};
    DB.classSubjects(ui.cCls).forEach(s => { const code = (d[`code_${s.id}`] || '').trim(), credit = +d[`cr_${s.id}`] || 0; if (code || credit > 0) m[s.id] = credit > 0 ? (code ? { code, credit } : { credit }) : { code }; });
    courses[ui.cCls] = m;
    DB.audit('COURSE_CREDITS', 'exams', `${ui.cCls}: ${Object.entries(m).map(([k, v]) => `${v.code || k}=${v.credit || 0}`).join(' ')}`); DB.save(); toast('কোর্স কোড ও ক্রেডিট সংরক্ষিত হয়েছে।', 'success'); App.refresh();
  },

  /* ---------- কোর্স রেজিস্ট্রেশন ---------- */
  regState() {
    const ui = this.ui(), here = new Set(this.semClasses().map(c => c.id));
    const sems = this.semesters().filter(s => s.session === ui.ses && (!s.classIds?.length || s.classIds.some(c => here.has(c)))).sort(this.byStart);
    if (!sems.some(s => s.id === ui.rSem)) ui.rSem = (sems.find(s => this.regOpen(s)) || sems.find(s => s.end >= U.today()) || sems[sems.length - 1])?.id;
    const sem = this.semester(ui.rSem), cls = sem ? this.semClasses().filter(c => !sem.classIds?.length || sem.classIds.includes(c.id)) : [];
    if (!cls.some(c => c.id === ui.rCls)) ui.rCls = cls[0]?.id;
    return { ui, sems, sem, cls };
  },
  regTab() {
    const { ui, sems, sem, cls } = this.regState(), can = this.canEdit(), lim = +this.A().creditLimit || 0;
    if (!sem) return `<div class="card p-6">${emptyState('এই শিক্ষাবর্ষে কোনো সেমিস্টার নেই — আগে “সেমিস্টার” ট্যাবে তৈরি করুন।', 'calendar-range')}</div>`;
    const bar = `<div class="card p-4 mb-4 flex flex-wrap gap-3 items-end"><div class="min-w-0 max-w-full"><label class="label">সেমিস্টার</label><select class="select" onchange="Sem.ui().rSem=this.value;App.refresh()">${sems.map(s => `<option value="${s.id}" ${s.id === sem.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
      <div><label class="label">শ্রেণি</label><select class="select" onchange="Sem.ui().rCls=this.value;App.refresh()">${cls.map(c => `<option value="${c.id}" ${c.id === ui.rCls ? 'selected' : ''}>${esc(DB.className(c.id))}</option>`).join('')}</select></div><span class="flex-1"></span>
      <div class="text-slate-600">রেজিস্ট্রেশন: ${sem.regStart ? `${U.fmtDate(sem.regStart)} – ${U.fmtDate(sem.regEnd)} ${this.regOpen(sem) ? badge('চলছে', 'green') : badge('বন্ধ', 'slate')}` : 'সময়সীমা নির্ধারিত নয়'} · সর্বোচ্চ ${lim ? `${bnNum(lim)} ক্রেডিট` : 'সীমা নেই'}</div></div>`;
    if (!ui.rCls) return bar + `<div class="card p-6">${emptyState('এই সেমিস্টারে কোনো শ্রেণি নেই।')}</div>`;
    const list = DB.studentsIn(ui.rCls), offered = this.offered(sem, ui.rCls);
    const extra = [...new Set((DB.s.courseRegs || []).filter(r => r.semesterId === sem.id && r.classId === ui.rCls && r.status !== 'dropped').map(r => r.studentId))].filter(id => !list.some(s => s.id === id)).map(id => DB.student(id)).filter(Boolean);
    const row = (st, guest) => { const regs = this.regs(st.id, sem.id), c = U.sum(regs, r => r.credit || 0), rt = regs.filter(r => r.kind === 'retake').length, im = regs.filter(r => r.kind === 'improvement').length;
      return `<tr><td>${bnNum(st.roll)}${st.section ? `-${esc(st.section)}` : ''}</td><td class="font-semibold">${esc(pn(st))}${guest ? ` <span class="text-slate-500">(${esc(DB.className(st.classId))})</span>` : ''}</td><td>${regs.length ? `${bnNum(regs.length)}টি` : badge('নিবন্ধন হয়নি', 'amber')}${rt ? ' ' + badge(`রিটেক ${bnNum(rt)}`, 'amber') : ''}${im ? ' ' + badge(`মানোন্নয়ন ${bnNum(im)}`, 'violet') : ''}</td><td>${this.cr(c)}${lim && c > lim ? ' ' + badge('সীমার বেশি', 'red') : ''}</td><td>${can ? `<button class="btn btn-ghost btn-sm" onclick="Sem.regForm('${st.id}','${sem.id}')">${icon('list-checks')} কোর্স নির্বাচন</button>` : ''}</td></tr>`; };
    return bar + this.note(`নিয়মিত কোর্স: ${offered.map(s => esc(this.course(ui.rCls, s.id).code)).join(', ') || '—'}`)
      + (can ? `<div class="flex flex-wrap gap-2 mb-3"><button class="btn btn-primary" onclick="Sem.bulkRegular('${sem.id}','${ui.rCls}')">${icon('users')} নিবন্ধনহীন সবাইকে নিয়মিত কোর্সে নিবন্ধন</button></div>` : '')
      + `<div class="card scroll-x"><table class="table"><thead><tr><th>রোল</th><th>শিক্ষার্থী</th><th>নিবন্ধিত কোর্স</th><th>ক্রেডিট</th><th></th></tr></thead><tbody>${list.map(st => row(st)).join('')}${extra.map(st => row(st, true)).join('')}${list.length + extra.length ? '' : `<tr><td colspan="5">${emptyState('এই শ্রেণিতে কোনো সক্রিয় শিক্ষার্থী নেই।')}</td></tr>`}</tbody></table></div>`;
  },
  newReg(st, semId, subjectId, classId, kind, retakeOf) {
    const c = this.course(classId, subjectId);
    return { id: DB.id('CR'), studentId: st.id, semesterId: semId, subjectId, classId, kind, ...(retakeOf ? { retakeOf } : {}), credit: c.credit, status: 'registered', date: U.today(), by: App.session?.userId || null };
  },
  bulkRegular(semId, classId) {
    if (!this.canEdit()) return;
    const sem = this.semester(semId), subs = this.offered(sem, classId), list = DB.studentsIn(classId).filter(st => !this.regs(st.id, semId).length), lim = +this.A().creditLimit || 0;
    const total = U.sum(subs, s => this.course(classId, s.id).credit || 0);
    if (!list.length) return toast('সবার নিবন্ধন আগেই হয়েছে।', 'warn');
    if (lim && total > lim) return toast(`নিয়মিত কোর্সের মোট ক্রেডিট (${bnNum(total)}) সীমার (${bnNum(lim)}) বেশি — সেমিস্টারের কোর্স বা সীমা ঠিক করুন।`, 'error');
    if (!confirm(`${bnNum(list.length)} জন শিক্ষার্থীকে ${bnNum(subs.length)}টি নিয়মিত কোর্সে নিবন্ধন করবেন?`)) return;
    const regs = DB.s.courseRegs || (DB.s.courseRegs = []);
    list.forEach(st => subs.forEach(s => regs.push(this.newReg(st, semId, s.id, classId, 'regular'))));
    DB.audit('COURSE_REG_BULK', 'exams', `${semId} · ${classId}: ${list.length} students × ${subs.length} courses`); DB.save(); toast(`${bnNum(list.length)} জনের নিবন্ধন সম্পন্ন।`, 'success'); App.refresh();
  },
  regForm(studentId, semId) {
    App.openDetail({ title: `কোর্স নির্বাচন · ${pn(DB.student(studentId))}`, render: () => this.regFormHtml(studentId, semId), mount: () => this.regFormMount(studentId, semId) });
  },
  regFormHtml(studentId, semId) {
    const st = DB.student(studentId), sem = this.semester(semId), regs = this.regs(studentId, semId), lim = +this.A().creditLimit || 0;
    const homeCls = regs.find(r => r.kind === 'regular')?.classId || st.classId, offered = this.offered(sem, homeCls), cand = this.candidates(studentId, semId);
    const on = (kind, sid) => regs.some(r => r.subjectId === sid && (kind === 'regular' ? r.kind === 'regular' : r.kind === kind));
    const line = (name, value, cr, checked, label, extra = '') => `<label class="flex flex-wrap items-center gap-2 py-2 border-b border-slate-100"><input type="checkbox" name="${name}" value="${value}" data-cr="${cr || 0}" ${checked ? 'checked' : ''}><span class="flex-1 min-w-[10rem]">${label}</span>${extra}<span class="text-slate-600">${this.cr(cr)} ক্রেডিট</span></label>`;
    return `<form id="reg-f" class="space-y-4 max-w-4xl"><div class="card p-4 flex flex-wrap gap-x-6 gap-y-1"><span><b>শিক্ষার্থী:</b> ${esc(pn(st))} · ${esc(DB.className(st.classId))} · রোল ${bnNum(st.roll)}</span><span><b>সেমিস্টার:</b> ${esc(sem.name)}</span><span>${this.regOpen(sem) ? badge('রেজিস্ট্রেশন চলছে', 'green') : badge('রেজিস্ট্রেশনের সময়সীমার বাইরে (অফিস থেকে নিবন্ধন)', 'amber')}</span></div>
      <div class="card p-5"><div class="font-semibold mb-1">নিয়মিত কোর্স — ${esc(DB.className(homeCls))}</div>${offered.map(s => { const c = this.course(homeCls, s.id); return line('reg', s.id, c.credit, on('regular', s.id) || !regs.length, `<span class="font-mono">${esc(c.code)}</span> ${esc(s.name)}`); }).join('') || '<div class="text-slate-400">এই সেমিস্টারে কোনো কোর্স নেই।</div>'}</div>
      <div class="card p-5"><div class="font-semibold mb-1">রিটেক / ক্যারি-ওভার</div>${cand.retake.map(c => line('retake', c.key, c.credit, regs.some(r => r.kind === 'retake' && r.subjectId === c.subjectId && (r.retakeOf || '') === c.retakeOf), `<span class="font-mono">${esc(c.code)}</span> ${esc(c.name)} <span class="text-slate-500">· ${esc(c.last.sem.name)}: ${c.last.has ? esc(c.last.letter) : 'অসম্পূর্ণ'}</span>`, DB.cls(c.classId) && c.classId !== homeCls ? badge(`${DB.cls(c.classId).name}-এর সঙ্গে`, 'slate') : '')).join('') || '<div class="text-slate-400">কোনো অকৃতকার্য বা অসম্পূর্ণ কোর্স নেই।</div>'}</div>
      ${this.A().improvement ? `<div class="card p-5"><div class="font-semibold mb-1">মানোন্নয়ন</div>${cand.improve.map(c => line('improve', c.key, c.credit, regs.some(r => r.kind === 'improvement' && r.subjectId === c.subjectId && (r.retakeOf || '') === c.retakeOf), `<span class="font-mono">${esc(c.code)}</span> ${esc(c.name)} <span class="text-slate-500">· বর্তমান গ্রেড ${esc(c.best.letter)}</span>`)).join('') || '<div class="text-slate-400">মানোন্নয়নের মতো কোনো কোর্স নেই।</div>'}</div>` : ''}
      <div class="flex flex-wrap items-center gap-2 sticky bottom-0 bg-[var(--surface)] py-3"><span>মোট <b id="reg-sum">—</b> ক্রেডিট${lim ? ` / সর্বোচ্চ ${bnNum(lim)}` : ''}</span><span class="flex-1"></span><button type="button" class="btn btn-ghost" onclick="App.closeDetail()">বাতিল</button><button class="btn btn-primary">${icon('save')} নিবন্ধন সংরক্ষণ করুন</button></div></form>`;
  },
  regFormMount(studentId, semId) {
    const f = $('#reg-f'), lim = +this.A().creditLimit || 0;
    const sum = () => U.sum($$('input[type=checkbox]:checked', f), x => +x.dataset.cr || 0);
    const upd = () => { const s = sum(), el = $('#reg-sum'); el.textContent = bnNum(s); el.className = lim && s > lim ? 'text-red-600' : ''; };
    f.addEventListener('change', upd); upd();
    f.addEventListener('submit', ev => {
      ev.preventDefault(); if (!this.canEdit()) return;
      if (lim && sum() > lim) return toast(`মোট ক্রেডিট সর্বোচ্চ সীমা (${bnNum(lim)}) ছাড়িয়ে গেছে।`, 'error');
      const st = DB.student(studentId), regs = this.regs(studentId, semId), homeCls = regs.find(r => r.kind === 'regular')?.classId || st.classId, cand = this.candidates(studentId, semId);
      const want = [
        ...$$('input[name=reg]:checked', f).map(x => ({ kind: 'regular', subjectId: x.value, classId: homeCls, retakeOf: null })),
        ...$$('input[name=retake]:checked', f).map(x => { const c = cand.retake.find(y => y.key === x.value); return c && { kind: 'retake', subjectId: c.subjectId, classId: c.classId, retakeOf: c.retakeOf }; }),
        ...$$('input[name=improve]:checked', f).map(x => { const c = cand.improve.find(y => y.key === x.value); return c && { kind: 'improvement', subjectId: c.subjectId, classId: c.classId, retakeOf: c.retakeOf }; }),
      ].filter(Boolean);
      if (new Set(want.map(w => w.subjectId)).size < want.length) return toast('একই কোর্স একই সেমিস্টারে দুবার নেওয়া যায় না।', 'error');
      const same = (r, w) => r.kind === w.kind && r.subjectId === w.subjectId && (r.retakeOf || null) === (w.retakeOf || null);
      const keep = regs.filter(r => want.some(w => same(r, w))), add = want.filter(w => !regs.some(r => same(r, w))).map(w => this.newReg(st, semId, w.subjectId, w.classId, w.kind, w.retakeOf));
      const drop = new Set(regs.filter(r => !keep.includes(r)).map(r => r.id));
      DB.s.courseRegs = (DB.s.courseRegs || []).filter(r => !drop.has(r.id)).concat(add);
      DB.audit('COURSE_REG', 'exams', `${studentId} · ${semId}: ${want.map(w => `${w.subjectId}${w.kind === 'regular' ? '' : '(' + w.kind + ')'}`).join(', ')}`); DB.save();
      toast('কোর্স নিবন্ধন সংরক্ষিত হয়েছে।', 'success'); App.closeDetail();
    });
  },

  /* ---------- সাপ্লিমেন্টারি ---------- */
  suppState() {
    const ui = this.ui(), list = DB.examsOf(ui.ses).filter(e => e.published && !e.suppOf);
    if (!list.some(e => e.id === ui.sExam)) ui.sExam = (list.filter(e => MAJOR_EXAMS.includes(e.type)).pop() || list[list.length - 1])?.id;
    const ex = DB.exam(ui.sExam), cls = ex ? DB.examClasses(ex).filter(c => c.campusId === DB.campusId()) : [];
    if (!cls.some(c => c.id === ui.sCls)) ui.sCls = cls[0]?.id;
    return { ui, list, ex, cls };
  },
  /** Students of a class with one or more failed subjects in an exam (the original result), plus anyone already registered. */
  failing(ex, classId) {
    const regd = (DB.s.suppRegs || []).filter(r => r.examId === ex.id && r.classId === classId && r.status !== 'cancelled').map(r => r.studentId);
    const ids = [...new Set([...DB.studentsIn(classId).map(s => s.id), ...regd])];
    return ids.map(id => { const st = DB.student(id), r = Sem.core(id, ex.id); return { st, r, failed: r.rows.filter(x => x.failed), reg: this.suppRegOf(id, ex.id) }; }).filter(x => x.st && (x.failed.length || x.reg)).sort((a, b) => String(a.st.section).localeCompare(String(b.st.section)) || a.st.roll - b.st.roll);
  },
  suppTab() {
    const { ui, list, ex, cls } = this.suppState(), can = this.canEdit(), S = this.suppCfg();
    if (!ex) return `<div class="card p-6">${emptyState('এই শিক্ষাবর্ষে কোনো প্রকাশিত পরীক্ষা নেই।', 'hourglass')}</div>`;
    const sx = this.suppExam(ex.id), rows = ui.sCls ? this.failing(ex, ui.sCls) : [], fee = (DB.s.feeHeads || []).find(h => h.id === 'FH-SUP')?.amount || 0;
    const bar = `<div class="card p-4 mb-4 flex flex-wrap gap-3 items-end"><div class="min-w-0 max-w-full"><label class="label">প্রকাশিত পরীক্ষা</label><select class="select" onchange="Sem.ui().sExam=this.value;App.refresh()">${list.map(e => `<option value="${e.id}" ${e.id === ex.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></div>
      <div><label class="label">শ্রেণি</label><select class="select" onchange="Sem.ui().sCls=this.value;App.refresh()">${cls.map(c => `<option value="${c.id}" ${c.id === ui.sCls ? 'selected' : ''}>${esc(DB.className(c.id))}</option>`).join('')}</select></div><span class="flex-1"></span>
      <div class="text-slate-600">নিয়ম: ${esc(SEM_RULES.supp[S.rule])}${S.rule === 'cap' ? ` (সর্বোচ্চ ${this.f2(S.capPoint)})` : ''} · ফি ${fee ? `${U.money(fee)}${S.perSubject ? ' / বিষয়' : ''}` : 'নেই'}</div></div>`;
    const sxCard = `<div class="card p-4 mb-4 flex flex-wrap items-center gap-3">${icon('rotate-ccw', 'w-5 h-5 text-amber-600')}<div class="flex-1 min-w-[12rem]">${sx ? `<b>${esc(sx.name)}</b> · ${U.fmtDate(sx.start)} · ${sx.published ? badge('ফল প্রকাশিত', 'green') : badge('ফল অপ্রকাশিত', 'slate')}` : '<b>সাপ্লিমেন্টারি পরীক্ষা এখনো তৈরি হয়নি</b>'}</div>
      ${can ? (sx ? `<button class="btn btn-ghost" onclick="App.ui.exSes='${ex.session}';Exams.setup('${sx.id}')">${icon('sliders-horizontal')} সেটআপ</button><button class="btn btn-ghost" onclick="Exams.schedule('${sx.id}')">${icon('calendar-clock')} রুটিন</button><button class="btn ${sx.published ? 'btn-success' : 'btn-primary'}" onclick="Exams.togglePublish('${sx.id}')">${icon(sx.published ? 'eye-off' : 'send')} ${sx.published ? 'প্রকাশ বাতিল' : 'ফল প্রকাশ করুন'}</button>`
        : `<input type="date" class="input !w-auto" id="sx-date" aria-label="পরীক্ষার তারিখ" value="${U.iso(U.addDays(new Date(), 14))}"><button class="btn btn-primary" onclick="Sem.createSuppExam('${ex.id}',$('#sx-date').value);App.refresh()">${icon('plus')} তৈরি করুন</button>`) : ''}</div>`;
    const pending = rows.filter(x => !x.reg && x.failed.length);
    const table = `<div class="card scroll-x"><div class="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2"><div class="font-semibold flex-1">অকৃতকার্য শিক্ষার্থী — ${bnNum(rows.length)} জন</div>${can && pending.length ? `<button class="btn btn-primary btn-sm" onclick="Sem.bulkSupp('${ex.id}','${ui.sCls}')">${icon('users')} নিবন্ধনহীন সবাইকে নিবন্ধন (${bnNum(pending.length)})</button>` : ''}</div>
      <table class="table"><thead><tr><th>রোল</th><th>শিক্ষার্থী</th><th>অকৃতকার্য বিষয় (মূল)</th><th>নিবন্ধন</th><th>ফলাফল</th><th></th></tr></thead><tbody>
      ${rows.map(x => this.suppRow(ex, x, can)).join('') || `<tr><td colspan="6">${emptyState('এই শ্রেণিতে কেউ অকৃতকার্য নয়।', 'party-popper')}</td></tr>`}</tbody></table></div>`;
    return bar + sxCard + table;
  },
  suppRow(ex, x, can) {
    const { st, reg } = x, fin = DB.result(st.id, ex.id), sit = reg && DB.exam(reg.suppExamId);
    let status = '—', act = '';
    if (reg) {
      const subs = reg.subjectIds.map(id => fin.rows.find(r => r.subject.id === id)).filter(Boolean), inv = reg.invoiceId && DB.s.invoices.find(i => i.id === reg.invoiceId);
      status = `${badge(reg.mode === 'next' ? `পরবর্তী পরীক্ষায়: ${sit?.name || ''}` : 'সাপ্লিমেন্টারি', reg.mode === 'next' ? 'violet' : 'amber')}${inv ? ` ${badge(`ফি ${U.money(inv.amount)} · ${bn(inv.status)}`, inv.status === 'paid' ? 'green' : 'red')}` : ''}<div class="text-slate-500">${esc(reg.subjectIds.map(id => DB.subject(id)?.name || id).join(', '))}</div>`;
      const done = sit?.published && subs.some(r => r.supp);
      act = done ? `${subs.map(r => `<div>${esc(r.subject.name)}: ${r.supp ? `${esc(r.supp.orig.letter)} → ${esc(r.supp.sit.letter)} ⇒ <b>${esc(r.letter)}</b>` : 'নম্বর নেই'}</div>`).join('')}<div class="mt-1">${fin.passed ? badge('চূড়ান্তভাবে উত্তীর্ণ', 'green') : badge('অনুত্তীর্ণ', 'red')}</div>` : `<span class="text-slate-500">${sit?.published ? 'নম্বর এখনো দেওয়া হয়নি' : 'ফল অপেক্ষমাণ'}</span>`;
      const promoted = this.promotedAfter(st, reg);
      return `<tr><td>${bnNum(st.roll)}${st.section ? `-${esc(st.section)}` : ''}</td><td class="font-semibold">${esc(pn(st))}</td><td>${x.failed.map(r => badge(`${r.subject.name} ${r.letter}`, 'red')).join(' ')}</td><td>${status}</td><td>${act}</td>
        <td><div class="flex flex-wrap gap-1">${App.perm('exams', 'print') ? `<button class="btn btn-ghost btn-sm" onclick="Print.show('marksheet','${st.id}','${ex.id}')">${icon('file-text')} নম্বরপত্র</button>` : ''}${can && done && fin.passed && !promoted ? `<button class="btn btn-success btn-sm" onclick="Sem.promote('${st.id}','${ex.id}')">${icon('arrow-up-wide-narrow')} উন্নীত করুন</button>` : ''}${promoted ? badge('উন্নীত', 'green') : st.promotionEligible?.examId === ex.id ? badge('উন্নয়নের যোগ্য', 'green') : ''}${can && !done ? `<button class="btn btn-ghost btn-sm text-red-600" onclick="Sem.cancelSupp('${reg.id}')">${icon('x')} বাতিল</button>` : ''}</div></td></tr>`;
    }
    return `<tr><td>${bnNum(st.roll)}${st.section ? `-${esc(st.section)}` : ''}</td><td class="font-semibold">${esc(pn(st))}</td><td>${x.failed.map(r => badge(`${r.subject.name} ${r.letter}`, 'red')).join(' ')}</td><td>${badge('নিবন্ধন হয়নি', 'slate')}</td><td>—</td><td>${can ? `<button class="btn btn-primary btn-sm" onclick="Sem.suppForm('${st.id}','${ex.id}')">${icon('user-plus')} নিবন্ধন</button>` : ''}</td></tr>`;
  },
  createSuppExam(origId, date) {
    const o = DB.exam(origId); if (!o) return null;
    const have = this.suppExam(origId); if (have) return have;
    const keys = ['cqMax', 'mcqMax', 'prMax', 'cqPass', 'mcqPass', 'prPass', 'subjects', 'gradeSource', 'schemeId', 'customBands', 'customScale', 'passRule', 'passPct', 'failRule', 'classes', 'classSubjects'];
    const policy = JSON.parse(JSON.stringify(Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]))));
    const x = { id: `SP-${o.id}`, name: `${o.name} — সাপ্লিমেন্টারি`, type: 'Supplementary', session: o.session, start: date || U.iso(U.addDays(new Date(), 14)), weight: 0, published: false, suppOf: o.id, ...policy, sheet: { ...(o.sheet || {}), position: false } };
    DB.s.exams.push(x); DB.audit('EXAM_CREATE', 'exams', `${x.name} (supplementary of ${o.id})`); DB.save();
    return x;
  },
  suppFee(n) { const h = (DB.s.feeHeads || []).find(x => x.id === 'FH-SUP'), a = +h?.amount || 0; return a * (this.suppCfg().perSubject !== false ? n : 1); },
  suppForm(studentId, examId) {
    const st = DB.student(studentId), ex = DB.exam(examId), failed = Sem.core(studentId, examId).rows.filter(x => x.failed);
    const later = DB.s.exams.filter(e => !e.suppOf && e.id !== ex.id && e.start > ex.start && DB.examTakes(e, st.classId)).sort((a, b) => a.start.localeCompare(b.start));
    Modal.open({ title: `সাপ্লিমেন্টারি নিবন্ধন · ${pn(st)}`, size: 'md', body: `<form id="sp-f" class="space-y-3"><p class="text-slate-600">${esc(ex.name)} · ${esc(DB.className(st.classId))} · রোল ${bnNum(st.roll)}</p>
      <div><div class="label">বিষয়</div>${failed.map(r => `<label class="flex items-center gap-2 py-1"><input type="checkbox" name="sub" value="${r.subject.id}" checked> ${esc(r.subject.name)} <span class="text-slate-500">(${bnNum(r.total)}/${bnNum(r.max)} · ${esc(r.letter)})</span></label>`).join('')}</div>
      <div><div class="label">কোথায় পরীক্ষা দেবে</div><label class="flex items-start gap-2 py-1"><input type="radio" name="mode" value="supp" checked class="mt-1.5"><span>সাপ্লিমেন্টারি পরীক্ষায় ${this.suppExam(ex.id) ? `(${esc(this.suppExam(ex.id).name)})` : '(স্বয়ংক্রিয়ভাবে তৈরি হবে)'}</span></label>
        <label class="flex items-start gap-2 py-1"><input type="radio" name="mode" value="next" ${later.length ? '' : 'disabled'} class="mt-1.5"><span>পরবর্তী চূড়ান্ত পরীক্ষায় বিষয়টি আবার দেবে ${later.length ? `<select class="select mt-1" name="next">${later.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select>` : '<span class="text-slate-400">(পরবর্তী কোনো পরীক্ষা নেই)</span>'}</span></label></div>
      ${this.suppFee(1) > 0 ? `<label class="flex items-center gap-2"><input type="checkbox" name="bill" checked> ফি বিল করুন: <b id="sp-fee">${U.money(this.suppFee(failed.length))}</b></label>` : ''}
      <button class="btn btn-primary w-full">${icon('save')} নিবন্ধন করুন</button></form>` });
    const f = $('#sp-f'); f.addEventListener('change', () => { const el = $('#sp-fee'); if (el) el.textContent = U.money(this.suppFee($$('input[name=sub]:checked', f).length)); });
    f.addEventListener('submit', ev => {
      ev.preventDefault(); const d = formData(f), subs = $$('input[name=sub]:checked', f).map(x => x.value);
      if (!subs.length) return toast('অন্তত একটি বিষয় বাছুন।', 'error');
      this.registerSupp(studentId, examId, subs, d.mode === 'next' ? d.next : null, !!f.bill?.checked);
      Modal.close(); toast('সাপ্লিমেন্টারি নিবন্ধন সম্পন্ন।', 'success'); App.refresh();
    });
  },
  registerSupp(studentId, examId, subjectIds, nextExamId, bill) {
    if (!this.canEdit()) return null;
    const st = DB.student(studentId), ex = DB.exam(examId), sx = nextExamId ? DB.exam(nextExamId) : (this.suppExam(examId) || this.createSuppExam(examId));
    if (!st || !ex || !sx || this.suppRegOf(studentId, examId)) return null;
    const reg = { id: DB.id('SR'), studentId, examId, suppExamId: sx.id, classId: st.classId, subjectIds, mode: nextExamId ? 'next' : 'supp', status: 'registered', date: U.today(), by: App.session?.userId || null };
    const amt = bill ? this.suppFee(subjectIds.length) : 0;
    if (amt > 0) { const h = DB.s.feeHeads.find(x => x.id === 'FH-SUP'), inv = DB.bill(studentId, { item: `সাপ্লিমেন্টারি পরীক্ষার ফি — ${ex.name} (${bnNum(subjectIds.length)}টি বিষয়)`, amount: amt, kind: 'exam', incomeAcct: h?.account || '4200', ref: reg.id, by: App.session?.userId }); reg.invoiceId = inv?.id || null; }
    (DB.s.suppRegs || (DB.s.suppRegs = [])).push(reg);
    DB.audit('SUPP_REG', 'exams', `${studentId} · ${examId} → ${sx.id}: ${subjectIds.join(',')}${reg.invoiceId ? ` · invoice ${reg.invoiceId}` : ''}`); DB.save();
    return reg;
  },
  bulkSupp(examId, classId) {
    const ex = DB.exam(examId), list = this.failing(ex, classId).filter(x => !x.reg && x.failed.length), bill = this.suppFee(1) > 0;
    if (!list.length || !confirm(`${bnNum(list.length)} জন শিক্ষার্থীকে তাদের অকৃতকার্য সব বিষয়ে সাপ্লিমেন্টারি পরীক্ষায় নিবন্ধন করবেন?${bill ? ' প্রত্যেকের ফি বিল হবে।' : ''}`)) return;
    list.forEach(x => this.registerSupp(x.st.id, examId, x.failed.map(r => r.subject.id), null, bill));
    toast(`${bnNum(list.length)} জনের নিবন্ধন সম্পন্ন।`, 'success'); App.refresh();
  },
  cancelSupp(regId) {
    const r = (DB.s.suppRegs || []).find(x => x.id === regId); if (!r || !this.canEdit() || !confirm('এই সাপ্লিমেন্টারি নিবন্ধন বাতিল করবেন?')) return;
    r.status = 'cancelled'; r.cancelledAt = U.today();
    const inv = r.invoiceId && DB.s.invoices.find(i => i.id === r.invoiceId);
    DB.audit('SUPP_CANCEL', 'exams', `${r.studentId} · ${r.examId}`); DB.save();
    toast(inv && inv.status === 'unpaid' ? 'নিবন্ধন বাতিল হয়েছে — অপরিশোধিত ফি বিলটি ফি ও বিল পাতা থেকে সমন্বয় করুন।' : 'নিবন্ধন বাতিল হয়েছে।', 'success'); App.refresh();
  },
  /** After passing: hand the student to the promotion engine (academics.js) when it offers a one-student call; otherwise flag as eligible. */
  promote(studentId, examId) {
    const st = DB.student(studentId), reg = this.suppRegOf(studentId, examId); if (!st || !reg || !this.canEdit()) return;
    if (!DB.result(studentId, examId).passed) return toast('চূড়ান্ত ফলাফলে এখনো অকৃতকার্য।', 'error');
    st.promotionEligible = { examId, date: U.today(), reason: 'supplementary', by: App.session?.userId || null };
    DB.audit('SUPP_ELIGIBLE', 'students', `${studentId}: eligible for promotion after ${examId} supplementary`); DB.save();
    // academics.js: Promo.form(studentId) opens the one-student promotion (provisional / immediate) form
    if (typeof Promo !== 'undefined' && typeof Promo.form === 'function') return Promo.form(studentId);
    toast('উন্নয়নের যোগ্য হিসেবে চিহ্নিত হয়েছে — “শ্রেণি উন্নয়ন” পাতায় এই পরীক্ষা বাছলে শিক্ষার্থীটি উত্তীর্ণ দেখাবে।', 'success'); App.refresh();
  },
  /** Promoted after the supplementary? (class changed since registration, or a provisional promotion is pending) */
  promotedAfter(st, reg) { return st.classId !== reg.classId || (typeof Promo !== 'undefined' && typeof Promo.pending === 'function' && !!Promo.pending(st.id)); },

  /* ---------- ট্রান্সক্রিপ্ট ---------- */
  transcriptTab() {
    const ui = this.ui(), cls = this.semClasses(); if (!cls.some(c => c.id === ui.tCls)) ui.tCls = cls[0]?.id;
    if (!ui.tCls) return `<div class="card p-6">${emptyState('এই ক্যাম্পাসে কোনো সেমিস্টারভিত্তিক শ্রেণি নেই।')}</div>`;
    const list = DB.studentsIn(ui.tCls); if (ui.tSt && !list.some(s => s.id === ui.tSt)) ui.tSt = null;
    const st = ui.tSt && DB.student(ui.tSt), pr = App.perm('exams', 'print');
    const bar = `<div class="card p-4 mb-4 flex flex-wrap gap-3 items-end"><div><label class="label">শ্রেণি</label><select class="select" onchange="Sem.ui().tCls=this.value;Sem.ui().tSt=null;App.refresh()">${cls.map(c => `<option value="${c.id}" ${c.id === ui.tCls ? 'selected' : ''}>${esc(DB.className(c.id))}</option>`).join('')}</select></div><span class="flex-1"></span>${pr && list.length ? `<button class="btn btn-ghost" onclick="Sem.printTranscript(DB.studentsIn('${ui.tCls}').map(s=>s.id))">${icon('printer')} শ্রেণির সকল ট্রান্সক্রিপ্ট</button>` : ''}</div>`;
    if (st) return bar + `<div class="flex flex-wrap items-center gap-2 mb-3"><button class="btn btn-ghost btn-sm" onclick="Sem.ui().tSt=null;App.refresh()">${icon('arrow-left')} তালিকা</button><b>${esc(pn(st))}</b> · রোল ${bnNum(st.roll)}</div>` + this.transcriptHtml(st);
    return bar + `<div class="card scroll-x"><table class="table"><thead><tr><th>রোল</th><th>শিক্ষার্থী</th><th>সেমিস্টার</th><th>অর্জিত ক্রেডিট</th><th>সিজিপিএ</th><th></th></tr></thead><tbody>
      ${list.map(s => { const t = this.transcript(s.id); return `<tr><td>${bnNum(s.roll)}${s.section ? `-${esc(s.section)}` : ''}</td><td class="font-semibold">${esc(pn(s))}</td><td>${bnNum(t.sems.length)}</td><td>${t.creditBased ? this.cr(t.earned) : '—'}</td><td><b>${this.f2(t.cgpa)}</b></td><td><div class="flex flex-wrap gap-1"><button class="btn btn-ghost btn-sm" onclick="Sem.ui().tSt='${s.id}';App.refresh()">${icon('eye')} দেখুন</button>${pr ? `<button class="btn btn-ghost btn-sm" onclick="Sem.printTranscript(['${s.id}'])">${icon('printer')}</button>` : ''}</div></td></tr>`; }).join('') || `<tr><td colspan="6">${emptyState('কোনো সক্রিয় শিক্ষার্থী নেই।')}</td></tr>`}</tbody></table></div>`;
  },

  /* ---------- Exam Centre additions (staff and teachers) ---------- */
  hubExtras(ex, cls) {
    let out = '';
    const pr = App.perm('exams', 'print');
    if (ex.suppOf) out += this.note(`এটি <b>${esc(DB.exam(ex.suppOf)?.name || '')}</b>-এর সাপ্লিমেন্টারি পরীক্ষা।`);
    else if (this.suppOn() && ex.published && cls) {
      const n = DB.studentsIn(cls).filter(s => Sem.core(s.id, ex.id).rows.some(x => x.failed)).length;
      if (n) out += `<div class="card p-4 mt-4 flex flex-wrap items-center gap-3">${icon('rotate-ccw', 'w-5 h-5 text-amber-600')}<div class="flex-1 min-w-[12rem]"><b>${bnNum(n)} জন</b> এক বা একাধিক বিষয়ে অকৃতকার্য — সাপ্লিমেন্টারি পরীক্ষায় নিবন্ধন করা যায়।</div>${this.isStaffPortal() ? `<button class="btn btn-primary" onclick="Object.assign(Sem.ui(),{tab:'supp',ses:'${ex.session}',sExam:'${ex.id}',sCls:'${cls}'});App.go(App.route.portal,'semester')">${icon('arrow-right')} সাপ্লিমেন্টারি</button>` : ''}</div>`;
    }
    if (ex.semesterId && cls && this.isSem(cls)) {
      const sem = this.semester(ex.semesterId), ids = [...new Set([...DB.studentsIn(cls).map(s => s.id), ...(DB.s.courseRegs || []).filter(r => r.semesterId === ex.semesterId && r.classId === cls && r.status !== 'dropped').map(r => r.studentId)])];
      const rows = ids.map(id => DB.student(id)).filter(Boolean).map(st => ({ st, t: this.transcript(st.id) })).map(x => ({ ...x, s: x.t.sems.find(y => y.sem.id === ex.semesterId) }));
      out += `<div class="card scroll-x mt-4"><div class="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2"><div class="font-semibold flex-1">${esc(sem?.name || '')} — এসজিপিএ ও সিজিপিএ</div>${pr ? `<button class="btn btn-ghost btn-sm" onclick="Sem.printTranscript(['${ids.join("','")}'])">${icon('printer')} সকল ট্রান্সক্রিপ্ট</button>` : ''}</div>
        <table class="table"><thead><tr><th>রোল</th><th>শিক্ষার্থী</th><th>কোর্স</th><th>ক্রেডিট (অর্জিত/নিবন্ধিত)</th><th>এসজিপিএ</th><th>সিজিপিএ</th><th></th></tr></thead><tbody>${rows.map(x => `<tr><td>${bnNum(x.st.roll)}</td><td class="font-semibold">${esc(pn(x.st))}${x.st.classId !== cls ? ` <span class="text-slate-500">(${esc(DB.className(x.st.classId))})</span>` : ''}</td><td>${x.s ? bnNum(x.s.rows.length) : '—'}${x.s?.rows.some(r => r.kind !== 'regular') ? ' ' + badge('রিটেক', 'amber') : ''}</td><td>${x.s ? `${this.cr(x.s.earned)}/${this.cr(x.s.attempted)}` : '—'}</td><td><b>${this.f2(x.s?.exam?.id === ex.id ? x.s.sgpa : null)}</b></td><td>${this.f2(x.t.cgpa)}</td><td>${pr ? `<button class="btn btn-ghost btn-sm" onclick="Sem.printTranscript(['${x.st.id}'])">${icon('scroll-text')} ট্রান্সক্রিপ্ট</button>` : ''}</td></tr>`).join('')}</tbody></table>
        <div class="px-5 py-3 text-slate-500">${esc(this.legend())}</div></div>`;
    }
    return out;
  },
  isStaffPortal() { return ['admin', 'principal'].includes(App.route.portal) && !!App.portals[App.route.portal]?.pages.some(p => p.id === 'semester'); },
});

/* ---------- register the page (Root User, Principal); visible only when a semester class exists or supplementary is on ---------- */
(() => {
  const page = () => ({ id: 'semester', label: 'সেমিস্টার ও কোর্স', icon: 'calendar-range', module: 'exams', when: () => Sem.anySem() || Sem.suppOn(), render: () => Sem.page(), mount() { } });
  ['admin', 'principal'].forEach(portal => { const P = App.portals[portal]; if (P && !P.pages.some(p => p.id === 'semester')) App.addPage(portal, page(), 'exams'); });
  const boot0 = App.boot.bind(App);
  App.boot = function () {
    Sem.addSettingsTab();
    // same sidebar group as the Exam Centre (examhub.js puts it under প্রতিষ্ঠান in the Root User portal)
    ['admin', 'principal'].forEach(portal => { const P = App.portals[portal], p = P?.pages.find(x => x.id === 'semester'), e = P?.pages.find(x => x.id === 'exams'); const g = portal === 'admin' && P?.groupOrder?.includes('প্রতিষ্ঠান') ? 'প্রতিষ্ঠান' : e?.group; if (p && g) p.group = g; });
    return boot0();
  };
})();
