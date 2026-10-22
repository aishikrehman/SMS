/* ==========================================================================
   C. TEACHER ACADEMIC WORKSPACE
   ========================================================================== */

/** Homework evaluation policy (set by the Principal / Root User): marks, grade, marks + grade, or remarks only. */
const HwEval = {
  MODES: [['marks', 'শুধু নম্বর'], ['grade', 'শুধু গ্রেড'], ['both', 'নম্বর ও গ্রেড'], ['remarks', 'শুধু মন্তব্য']],
  cfg() { const c = DB.s.config || (DB.s.config = {}); return c.hwEval || (c.hwEval = { mode: 'both', full: 10 }); },
  mode() { return this.cfg().mode || 'both'; },
  label(m = this.mode()) { return (this.MODES.find(x => x[0] === m) || this.MODES[2])[1]; },
  usesMarks(m = this.mode()) { return m === 'marks' || m === 'both'; },
  usesGrade(m = this.mode()) { return m === 'grade' || m === 'both'; },
  /** Full marks of a homework (its own value, else the default). */
  full(hw) { return +hw?.fullMarks > 0 ? +hw.fullMarks : +this.cfg().full > 0 ? +this.cfg().full : 10; },
  gradeOf(pct) { return pct >= 80 ? 'A+' : pct >= 70 ? 'A' : pct >= 60 ? 'A-' : pct >= 50 ? 'B' : pct >= 40 ? 'C' : pct >= 33 ? 'D' : 'F'; },
  hasMarks(sub) { return sub?.marks !== undefined && sub?.marks !== null && sub?.marks !== ''; },
  /** Result text per the current policy, e.g. "৮/১০ · A+" (older records fall back to whatever they hold). */
  fmt(sub, hw) {
    if (!sub) return '';
    const m = this.mode(), hm = this.hasMarks(sub), p = [];
    if (hm && (this.usesMarks(m) || !sub.grade)) p.push(`${bnNum(sub.marks)}/${bnNum(sub.fullMarks || this.full(hw || DB.s.homework.find(h => h.id === sub.homeworkId)))}`);
    if (sub.grade && (this.usesGrade(m) || !hm)) p.push(sub.grade);
    return p.join(' · ') || 'মূল্যায়িত';
  },
};

/* Teaching assignments seeded once from the running routine (class × subject pairs). */
DB.addSeeder('teachAssignSeeded', s => {
  s.teachers.forEach(t => {
    if (t.assignments?.length) return;
    const seen = new Set();
    t.assignments = (s.routine || []).filter(r => RT.hasT(r, t.id)).flatMap(r => RT.pairs(r)).filter(a => { const k = a.classId + '|' + a.subjectId; if (seen.has(k)) return false; seen.add(k); return true; });
    if (t.assignments.length) t.subjects = [...new Set([...(t.subjects || []), ...t.assignments.map(a => a.subjectId)])];
  });
  return true;
});

const Teacher = {
  me() { return App.session ? DB.teacherByUser(App.session.userId) : null; },   // null before sign-in has loaded (direct page links)
  /** Teaching assignments [{classId, subjectId}] — set per teacher in the Faculty profile; without them the routine is used. */
  pairs(t = this.me()) {
    if (!t) return [];
    if (t.assignments?.length) return t.assignments.filter(a => DB.cls(a.classId) && DB.subject(a.subjectId));
    const seen = new Set();
    return DB.s.routine.filter(r => RT.hasT(r, t.id) && DB.cls(r.classId)).flatMap(r => RT.pairs(r)).filter(a => { const k = a.classId + '|' + a.subjectId; if (seen.has(k)) return false; seen.add(k); return true; });
  },
  byGrade(ids) { return [...new Set(ids)].filter(c => DB.cls(c)).sort((a, b) => DB.cls(a).grade - DB.cls(b).grade); },
  myClasses(t = this.me()) { return this.byGrade(this.pairs(t).map(a => a.classId)); },
  /** Subjects of the teacher (in one class): assignments → routine → teacher.subjects. */
  mySubjects(classId, t = this.me()) {
    if (!t) return [];
    const s = [...new Set(this.pairs(t).filter(a => !classId || a.classId === classId).map(a => a.subjectId))]; if (s.length) return s;
    const r = [...new Set(DB.s.routine.filter(x => RT.hasT(x, t.id) && (!classId || x.classId === classId)).flatMap(x => RT.subs(x)))];
    return r.length ? r : (t.subjects || []);
  },
  /** Classes the teacher may take roll-call for: assigned + scheduled in the routine + own homeroom. */
  rollClasses(t = this.me()) { return this.byGrade([...this.myClasses(t), ...DB.s.routine.filter(r => RT.hasT(r, t.id)).map(r => r.classId), ...DB.s.classes.filter(c => c.classTeacherId === t.id).map(c => c.id)]); },
  /** "গণিত (নবম, দশম) · বিজ্ঞান (দশম)" */
  assignSummary(t = this.me()) {
    const by = {}; this.pairs(t).forEach(a => (by[a.subjectId] = by[a.subjectId] || []).push(a.classId));
    const parts = Object.entries(by).map(([s, cs]) => `${DB.subject(s)?.name || s} (${this.byGrade(cs).map(c => DB.cls(c).name).join(', ')})`);
    return parts.join(' · ') || (t?.subjects || []).map(s => DB.subject(s)?.name || s).join(', ');
  },
  classSelect(id, val, onchange, list = this.myClasses()) { return `<select class="select !w-auto" id="${id}" onchange="${onchange}">${list.map(c => `<option value="${c}" ${c === val ? 'selected' : ''}>${DB.cls(c).name}</option>`).join('')}</select>`; },
  scheduleFor(dateObj) {
    const t = this.me(); return t ? RT.ofTeacher(t.id, dateObj) : [];
  },
  nextSchoolDay() { let d = new Date(); const c = this.me()?.campusId; for (let i = 0; i < 30 && !U.isSchoolDay(d, null, c); i++) d = U.addDays(d, 1); return d; },

  /* ---------- Attendance ---------- */
  /** Root User setting: 'period' (one register per period) or 'daily' (one mark per day). */
  periodMode() { return (DB.s.school.attendanceMode || 'daily') === 'period'; },
  saveRegister() {
    if (typeof StaffGate !== 'undefined' && StaffGate.locked()) return toast('আপনার আজকের উপস্থিতি এখনো নিশ্চিত হয়নি — হাজিরা নেওয়া যাবে না।', 'error');
    const ui = App.ui.att, list = DB.studentsIn(ui.cls);
    let absent = 0;
    list.forEach(st => {
      const v = ui.marks[st.id] || 'P';
      if (Teacher.periodMode()) {
        // period-wise: keep this period's mark; the day's mark = present if present in any period, absent only if absent in all
        const day = ((DB.s.periodAttendance = DB.s.periodAttendance || {})[st.id] = DB.s.periodAttendance[st.id] || {})[ui.date] = DB.s.periodAttendance[st.id][ui.date] || {};
        day[ui.period] = v;
        const ms = Object.values(day), daily = ms.includes('P') ? 'P' : ms.includes('L') ? 'L' : ms.every(x => x === 'E') ? 'E' : 'A';
        (DB.s.attendance[st.id] = DB.s.attendance[st.id] || {})[ui.date] = daily;
      } else (DB.s.attendance[st.id] = DB.s.attendance[st.id] || {})[ui.date] = v;
      if (v === 'A') {
        absent++;
        DB.guardiansOf(st.id).forEach(g => DB.sms(g.phone, `${DB.s.school.shortName}: ${pn(st)} (${DB.cls(st.classId).name}, রোল ${bnNum(st.roll)}) ${U.fmtDate(ui.date)} তারিখে ${Teacher.periodMode() ? bnNum(ui.period) + ' নম্বর পিরিয়ডে ' : ''}অনুপস্থিত ছিল। এটি অপ্রত্যাশিত হলে অনুগ্রহ করে শ্রেণিশিক্ষকের সঙ্গে যোগাযোগ করুন।`));
      }
    });
    DB.audit('ATTENDANCE_SAVE', 'attendance', `${DB.cls(ui.cls).name} ${ui.date}${Teacher.periodMode() ? ' P' + ui.period : ''}: ${list.length - absent}/${list.length} জন উপস্থিত, ${absent} জন অনুপস্থিত — এসএমএস পাঠানো হয়েছে`); DB.save();
    toast(`হাজিরা খাতা সংরক্ষিত হয়েছে। ${absent ? `অভিভাবকদের কাছে ${bnNum(absent)}টি অনুপস্থিতির এসএমএস সতর্কবার্তা পাঠানো হয়েছে।` : 'শতভাগ উপস্থিতি!'}`, 'success');
    App.refresh();
  },

  /* ---------- Gradebook ---------- */
  saveMarks() {
    const ui = App.ui.gb; let n = 0, bad = 0;   // components and their full marks from Exam setup
    $$('#gb-table tr[data-st]').forEach(tr => {
      const st0 = tr.dataset.st, ab = !!tr.querySelector('[name=ab]')?.checked, m0 = DB.s.marks.find(x => x.examId === ui.exam && x.studentId === st0 && x.subjectId === ui.subj);
      if (ab) { if (!m0) DB.s.marks.push({ examId: ui.exam, studentId: st0, subjectId: ui.subj, cq: 0, mcq: 0, pr: 0, absent: true }); else { Object.assign(m0, { cq: 0, mcq: 0, pr: 0, absent: true }); delete m0.x; } n++; return; }
      const ins = $$('input[data-k]', tr), filled = ins.filter(i => i.value !== '' && i.dataset.k !== 'att');
      if (m0?.absent) { delete m0.absent; if (!filled.length) { DB.s.marks = DB.s.marks.filter(x => x !== m0); n++; return; } }
      if (!filled.length) return;
      if (ins.some(i => i.value !== '' && (+i.value < 0 || +i.value > +i.max))) { bad++; return; }
      const m = DB.setMark(ui.exam, st0, ui.subj, Object.fromEntries(ins.map(i => [i.dataset.k, i.value === '' ? '' : +i.value])));
      if (m) n++;
    });
    if (bad) return toast(`${bnNum(bad)}টি সারির নম্বর পূর্ণমানের সীমার বাইরে।`, 'error');
    DB.audit('MARKS_SAVE', 'marks', `${ui.exam} · ${DB.cls(ui.cls).name} · ${ui.subj}: ${n}টি সারি`); DB.save();
    toast(`${bnNum(n)} জন শিক্ষার্থীর নম্বর সংরক্ষিত হয়েছে।`, 'success');
  },

  /* ---------- Lesson-plan template: a fixed 45-minute structure filled with the teacher's topic (no AI, no external service) ---------- */
  generatePlan(topic, cls, subj) {
    const T = topic.trim();
    const obj = [`${T}-এর মূল ধারণা ব্যাখ্যা করা`, `বাস্তব জীবনের একটি সমাধানকৃত উদাহরণে ${T} প্রয়োগ করা`, `${T} সম্পর্কে প্রচলিত ভুল ধারণা মূল্যায়ন করা`];
    const segments = [
      [5, 'আগ্রহ সৃষ্টি ও পূর্বপাঠ স্মরণ', `গতকালের পাঠের সঙ্গে ${T}-এর সংযোগ স্থাপনকারী একটি দ্রুত প্রশ্ন দিয়ে শুরু করুন। তিনজন শিক্ষার্থীকে নাম ধরে জিজ্ঞাসা করুন।`],
      [10, 'সরাসরি পাঠদান', `বোর্ডে চিত্রের সাহায্যে ${T} পরিচিত করান। উচ্চস্বরে চিন্তা প্রকাশ করে একটি পূর্ণাঙ্গ সমাধানকৃত উদাহরণ দেখান।`],
      [12, 'নির্দেশিত অনুশীলন', `জোড়ায় জোড়ায় শিক্ষার্থীরা ${T} বিষয়ে দুটি ক্রমোচ্চ সমস্যা সমাধান করবে; শ্রেণিকক্ষে ঘুরে ঘুরে তাৎক্ষণিকভাবে ভুল ধারণা সংশোধন করুন।`],
      [10, 'দলগত কাজ', `চারজনের দল স্থানীয় প্রেক্ষাপটে (ঢাকার যানজট, বাজারদর, নদীর তথ্য…) ${T} প্রয়োগ করে এক স্লাইডের সারসংক্ষেপ বা পোস্টার তৈরি করবে।`],
      [5, 'তাৎক্ষণিক কুইজ', 'পাঁচ প্রশ্নের কুইজ (নিচে) — নিজে মূল্যায়ন, প্রতিটি উত্তরের জন্য হাত তুলবে।'],
      [3, 'সমাপনী মূল্যায়ন ও বাড়ির কাজ', `প্রত্যেক শিক্ষার্থী ${T} সম্পর্কে একটি শেখা বিষয় ও একটি প্রশ্ন লিখবে। পাঠ্যবই থেকে অনুশীলনী দিন।`],
    ];
    const quiz = [
      [`কোন বক্তব্যটি ${T}-কে সবচেয়ে ভালোভাবে সংজ্ঞায়িত করে?`, [`আজকের পাঠে শেখানো ${T}-এর মূল ধারণা`, 'একটি সম্পর্কহীন ঐতিহাসিক ঘটনা', 'একটি বানানের নিয়ম', 'এগুলোর কোনোটিই নয়'], 0],
      [`${T} সবচেয়ে বেশি কাজে লাগে যখন আমাদের প্রয়োজন:`, ['সংশ্লিষ্ট একটি বাস্তব সমস্যার সমাধান বা ব্যাখ্যা করা', 'তারিখ মুখস্থ করা', 'অনুশীলন এড়িয়ে যাওয়া', 'উদাহরণ এড়িয়ে চলা'], 0],
      [`${T} শেখার সময় একটি সাধারণ ভুল কোনটি?`, ['সমাধানের ধাপগুলো বাদ দেওয়া', 'উত্তর যাচাই করা', 'প্রশ্ন করা', 'চিত্র আঁকা'], 0],
      [`${T} সম্পর্কে নিজের বোঝাপড়া যাচাইয়ের সর্বোত্তম উপায় হলো:`, ['সহপাঠীকে বুঝিয়ে বলা', 'শুধু নোট কপি করা', 'মতামত উপেক্ষা করা', 'আন্দাজ করা'], 0],
      [`এখানে ${T} কোন বিষয়ের অন্তর্ভুক্ত?`, [DB.subject(subj)?.name || 'এই বিষয়', 'শারীরিক শিক্ষা', 'সংগীত', 'চারুকলা'], 0],
    ];
    // shuffle answer options deterministically so the right answer isn't always A
    const qz = quiz.map(([q, opts, ans], i) => { const rot = (i * 2 + T.length) % opts.length; const o = opts.map((_, k) => opts[(k + rot) % opts.length]); return { q, opts: o, ans: o.indexOf(opts[ans]) }; });
    return { id: DB.id('LP'), topic: T, classId: cls, subjectId: subj, objectives: obj, segments, quiz: qz, materials: ['হোয়াইটবোর্ড ও মার্কার', 'মাল্টিমিডিয়া প্রজেক্টর', 'মুদ্রিত কার্যপত্র (প্রতি জোড়ায় ১টি)', 'রঙিন চার্ট পেপার'], createdAt: new Date().toISOString(), teacherId: this.me().id };
  },
  planHtml(p) {
    let t = 0;
    return `<div class="space-y-4"><div class="flex flex-wrap items-center gap-2"><h3 class="font-bold text-lg">${esc(p.topic)}</h3>${badge(DB.cls(p.classId).name, 'blue')}${badge(DB.subject(p.subjectId).name, 'violet')}${badge('৪৫ মিনিট', 'green')}</div>
      <div><div class="label">শিখনফল</div><ul class="list-disc ml-5 text-sm space-y-1">${p.objectives.map(o => `<li>${esc(o)}</li>`).join('')}</ul></div>
      <div><div class="label">পাঠদানের রূপরেখা</div><div class="space-y-2">${p.segments.map(([m, h, d]) => { const s = t; t += m; return `<div class="flex gap-3 text-sm"><div class="w-20 shrink-0 font-mono text-xs text-slate-500 pt-0.5">${U.bn(String(s).padStart(2, '0'))}–${U.bn(String(t).padStart(2, '0'))} মিনিট</div><div><b>${h}।</b> ${esc(d)}</div></div>`; }).join('')}</div></div>
      <div><div class="label">উপকরণ</div><div class="flex flex-wrap gap-1">${p.materials.map(m => badge(m)).join('')}</div></div>
      <div><div class="label">৫ প্রশ্নের তাৎক্ষণিক কুইজ</div><ol class="space-y-3" id="quiz">${p.quiz.map((q, i) => `<li class="card p-3"><div class="text-sm font-semibold">${bnNum(i + 1)}. ${esc(q.q)}</div><div class="grid sm:grid-cols-2 gap-1.5 mt-2">${q.opts.map((o, k) => `<button class="text-left text-sm rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50" data-q="${i}" data-k="${k}" data-ans="${q.ans}">${'কখগঘ'[k]}. ${esc(o)}</button>`).join('')}</div></li>`).join('')}</ol></div></div>`;
  },
  bindQuiz(root) {
    $$('[data-q]', root).forEach(b => b.addEventListener('click', () => {
      const right = +b.dataset.k === +b.dataset.ans;
      $$(`[data-q="${b.dataset.q}"]`, root).forEach(x => { x.disabled = true; if (+x.dataset.k === +x.dataset.ans) x.classList.add('bg-emerald-100', 'border-emerald-400'); });
      if (!right) b.classList.add('bg-red-100', 'border-red-400');
    }));
  },

  /* ---------- Homework annotation canvas ---------- */
  openCanvas(subId) {
    const sub = DB.s.submissions.find(s => s.id === subId), st = DB.student(sub.studentId), hw = DB.s.homework.find(h => h.id === sub.homeworkId);
    if (sub.fileType === 'application/pdf' && !sub.annotatedUrl) {
      Modal.open({ title: `${esc(pn(st))} · ${esc(sub.fileName)}`, size: 'md', body: `<a class="btn btn-ghost mb-4" href="${sub.dataUrl}" target="_blank" rel="noopener">${icon('external-link')} পিডিএফ খুলুন</a>${this.gradeForm(sub)}` });
      return this.bindGradeForm(sub, null);
    }
    if (!sub.annotatedUrl && !sub.dataUrl) {
      Modal.open({ title: `${esc(pn(st))} · ${esc(hw.title)}`, size: 'md', body: `<p class="text-sm text-slate-600 mb-3">${icon('file-x', 'w-4 h-4 inline')} এই জমার সঙ্গে কোনো ফাইল নেই।</p>${this.gradeForm(sub)}` });
      return this.bindGradeForm(sub, null);
    }
    const src = sub.annotatedUrl || sub.dataUrl;
    Modal.open({
      title: `মূল্যায়ন ক্যানভাস · ${esc(pn(st))} · ${esc(hw.title)}`, size: 'full',
      body: `<div class="flex flex-col lg:flex-row gap-4"><div class="flex-1 min-w-0">
          <div class="flex flex-wrap items-center gap-1.5 mb-2" id="cv-tools">
            ${[['pen', 'pen-line', 'লাল কালি'], ['hl', 'highlighter', 'হাইলাইটার'], ['check', 'check', 'টিক চিহ্ন'], ['cross', 'x', 'ক্রস চিহ্ন'], ['text', 'type', 'লেখা'], ['stamp', 'stamp', 'গ্রেড সিল']].map(([k, i, l], n) => `<button class="btn btn-sm ${n === 0 ? 'btn-primary' : 'btn-ghost'}" data-tool="${k}" title="${l}">${icon(i)} <span class="hidden sm:inline">${l}</span></button>`).join('')}
            <select id="cv-stamp" class="select !w-auto !py-1 text-sm">${['A+', 'A', 'A-', 'B', 'C', 'D', 'F', '★ চমৎকার', 'দেখা করো'].map(g => `<option value="${g}">${g}</option>`).join('')}</select>
            <input type="range" id="cv-size" min="2" max="14" value="4" class="w-24" title="কলমের আকার">
            <span class="flex-1"></span><button class="btn btn-ghost btn-sm" id="cv-undo">${icon('undo-2')} পূর্বাবস্থায় ফেরান</button><button class="btn btn-ghost btn-sm" id="cv-reset">${icon('rotate-ccw')} মূল কপি</button></div>
          <div class="bg-slate-200 rounded-xl p-2 overflow-auto max-h-[70vh] flex justify-center"><canvas id="annot" class="annot-canvas shadow"></canvas></div></div>
        <div class="lg:w-72 shrink-0">${this.gradeForm(sub)}</div></div>`,
    });
    const cv = $('#annot'), ctx = cv.getContext('2d');
    const img = new Image();
    const history = [];
    let tool = 'pen', drawing = false, last = null;
    const snap = () => { history.push(ctx.getImageData(0, 0, cv.width, cv.height)); if (history.length > 30) history.shift(); };
    const load = url => { const im = new Image(); im.onload = () => { const k = Math.min(1, 1000 / im.width); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k); ctx.drawImage(im, 0, 0, cv.width, cv.height); history.length = 0; }; im.src = url; };
    load(src);
    const pos = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; };
    const size = () => +$('#cv-size').value;
    cv.addEventListener('pointerdown', e => {
      const p = pos(e); snap();
      if (tool === 'pen' || tool === 'hl') { drawing = true; last = p; cv.setPointerCapture(e.pointerId); return; }
      ctx.save(); ctx.strokeStyle = ctx.fillStyle = '#dc2626'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (tool === 'check') { const s = size() * 6; ctx.lineWidth = size() * 1.4; ctx.beginPath(); ctx.moveTo(p.x - s * .6, p.y); ctx.lineTo(p.x - s * .15, p.y + s * .5); ctx.lineTo(p.x + s * .8, p.y - s * .7); ctx.stroke(); }
      if (tool === 'cross') { const s = size() * 4; ctx.lineWidth = size() * 1.4; ctx.beginPath(); ctx.moveTo(p.x - s, p.y - s); ctx.lineTo(p.x + s, p.y + s); ctx.moveTo(p.x + s, p.y - s); ctx.lineTo(p.x - s, p.y + s); ctx.stroke(); }
      if (tool === 'text') { const t = prompt('মন্তব্যের লেখা:'); if (t) { ctx.font = `${12 + size() * 2}px "Segoe Print", "Comic Sans MS", cursive`; ctx.fillText(t, p.x, p.y); } else history.pop(); }
      if (tool === 'stamp') {
        const g = $('#cv-stamp').value, r = 30 + size() * 4;
        ctx.translate(p.x, p.y); ctx.rotate(-0.2); ctx.globalAlpha = .85; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, r - 7, 0, Math.PI * 2); ctx.stroke();
        ctx.font = `bold ${g.length > 2 ? r * .36 : r * .8}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(g, 0, 2);
        ctx.font = `bold ${r * .16}px Inter`; ctx.fillText(DB.s.school.shortName, 0, r * .62);
        if (/^[A-F][+-]?$/.test(g) && $('#gf-grade')) $('#gf-grade').value = g;
      }
      ctx.restore();
    });
    cv.addEventListener('pointermove', e => {
      if (!drawing) return; const p = pos(e);
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (tool === 'hl') { ctx.globalAlpha = .25; ctx.strokeStyle = '#facc15'; ctx.lineWidth = size() * 5; } else { ctx.strokeStyle = '#dc2626'; ctx.lineWidth = size(); }
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.restore(); last = p;
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => cv.addEventListener(ev, () => drawing = false));
    $$('#cv-tools [data-tool]').forEach(b => b.addEventListener('click', () => { tool = b.dataset.tool; $$('#cv-tools [data-tool]').forEach(x => x.className = `btn btn-sm ${x === b ? 'btn-primary' : 'btn-ghost'}`); }));
    $('#cv-undo').addEventListener('click', () => { const h = history.pop(); if (h) ctx.putImageData(h, 0, 0); });
    $('#cv-reset').addEventListener('click', () => { if (confirm('সকল চিহ্ন বাতিল করে মূল জমাকৃত কাজটি পুনরায় লোড করবেন?')) load(sub.dataUrl || src); });
    this.bindGradeForm(sub, cv);
  },
  gradeForm(sub) {
    const hw = DB.s.homework.find(h => h.id === sub.homeworkId), m = HwEval.mode(), full = HwEval.full(hw);
    return `<form id="gf" class="space-y-3">${badge('মূল্যায়ন পদ্ধতি: ' + HwEval.label(m), 'violet')}
      ${HwEval.usesMarks(m) ? `<div><label class="label">প্রাপ্ত নম্বর</label><div class="flex items-center gap-2"><input class="input" type="number" inputmode="decimal" id="gf-marks" name="marks" min="0" max="${full}" step="0.5" value="${sub.marks ?? ''}" required><span class="whitespace-nowrap font-semibold">/ ${bnNum(full)}</span></div></div>` : ''}
      ${HwEval.usesGrade(m) ? `<div><label class="label">গ্রেড</label><select class="select" id="gf-grade" name="grade">${['', 'A+', 'A', 'A-', 'B', 'C', 'D', 'F'].map(g => `<option ${g === (sub.grade || '') ? 'selected' : ''} value="${g}">${g || (m === 'both' ? '— স্বয়ংক্রিয় —' : '— নির্বাচন করুন —')}</option>`).join('')}</select></div>` : ''}
      <div><label class="label">লিখিত মূল্যায়ন মন্তব্য${m === 'remarks' ? ' (আবশ্যক)' : ''}</label><textarea class="textarea" name="feedback" rows="5">${esc(sub.feedback || '')}</textarea></div>
      <div class="text-slate-500">জমাদান ${U.fmtTime(sub.submittedAt)} · ${esc(sub.fileName)}</div>
      <button class="btn btn-primary w-full">${icon('save')} সংরক্ষণ করে শিক্ষার্থীকে ফেরত দিন</button></form>`;
  },
  bindGradeForm(sub, cv) {
    $('#gf').addEventListener('submit', e => {
      e.preventDefault(); const f = formData(e.target), hw = DB.s.homework.find(h => h.id === sub.homeworkId), m = HwEval.mode(), full = HwEval.full(hw);
      let marks = null, grade = f.grade || '';
      if (HwEval.usesMarks(m)) {
        if (f.marks === undefined || f.marks === '') return toast('প্রাপ্ত নম্বর লিখুন।', 'error');
        marks = +f.marks; if (!(marks >= 0 && marks <= full)) return toast(`নম্বর ০ থেকে ${bnNum(full)}-এর মধ্যে হতে হবে।`, 'error');
        if (m === 'both' && !grade) grade = HwEval.gradeOf(marks / full * 100);
      }
      if (m === 'grade' && !grade) return toast('প্রথমে একটি গ্রেড নির্বাচন করুন।', 'error');
      if (m === 'remarks' && !(f.feedback || '').trim()) return toast('মূল্যায়ন মন্তব্য লিখুন।', 'error');
      if (cv) sub.annotatedUrl = cv.toDataURL('image/jpeg', 0.8);
      Object.assign(sub, { marks, fullMarks: marks === null ? null : full, grade: HwEval.usesGrade(m) ? grade || null : null, feedback: f.feedback, evalMode: m, status: 'Graded', gradedAt: new Date().toISOString() });
      const res = HwEval.fmt(sub, hw);
      { const st = DB.student(sub.studentId); DB.guardiansOf(st.id).forEach(g => DB.sms(g.phone, `${DB.s.school.shortName}: ${pn(st)}-এর বাড়ির কাজ "${hw.title}" মূল্যায়ন করা হয়েছে — ${res}।`, 'Push')); const su = DB.user(st.userId); if (su?.phone) DB.sms(su.phone, `তোমার বাড়ির কাজ "${hw.title}" মূল্যায়ন করা হয়েছে — ${res}।`, 'Push'); }
      DB.audit('HOMEWORK_GRADE', 'submissions', `${sub.id} → ${res}`);
      if (!DB.save()) { sub.annotatedUrl = null; DB.save(); toast('চিহ্নিত ছবিটি সংরক্ষণের জন্য অত্যধিক বড়; ছবি ছাড়াই গ্রেড সংরক্ষিত হয়েছে।', 'warn'); }
      Modal.close(); toast('মূল্যায়ন মন্তব্য শিক্ষার্থীর কাছে ফেরত পাঠানো হয়েছে।', 'success'); App.refresh();
    });
  },
};

App.register('teacher', {
  title: 'শিক্ষণ কর্মক্ষেত্র',
  pages: [
    /* ---------------- Today ---------------- */
    {
      id: 'today', label: 'আমার দিন', icon: 'sun',
      render() {
        const t = Teacher.me(), u = DB.user(t.userId), d = Teacher.nextSchoolDay(), sched = Teacher.scheduleFor(d);
        const pend = DB.s.submissions.filter(s => s.status === 'Submitted' && DB.s.homework.find(h => h.id === s.homeworkId)?.teacherId === t.id);
        const syl = DB.s.syllabus.filter(s => s.teacherId === t.id);
        const sylPct = syl.length ? U.sum(syl, s => s.chapters.filter(c => c.done).length / s.chapters.length * 100) / syl.length : 0;
        const proxies = DB.s.proxies.filter(p => p.proxyTeacherId === t.id && p.date >= U.today()).sort((a, b) => (a.date + a.period).localeCompare(b.date + b.period));
        const hol = DB.holiday(new Date(), t.campusId);
        return pageHeader(`শুভেচ্ছা, ${esc(u.nameBn ? pn(u) : u.name.split(' ')[0])}`, `${esc(t.designation)} · ${esc(t.dept)} · ${esc(Teacher.assignSummary(t))} · ${esc(DB.campus(t.campusId).name)}`)
          + (typeof StaffGate !== 'undefined' ? StaffGate.teacherBanner() : '')
          + (hol ? `<div class="card p-3 mb-4 bg-violet-50 border-violet-200 text-violet-800 text-sm">${icon('party-popper', 'w-4 h-4 inline')} আজ: <b>${esc(hol.name)}</b>${hol.type === 'Exam' ? ' (পরীক্ষাকালীন সময়)' : ''}</div>` : '')
          + (proxies.length ? `<div class="card mb-5 border-amber-300"><div class="px-5 py-3 border-b border-amber-200 bg-amber-50 font-semibold text-amber-900 flex items-center gap-2">${icon('user-round-check')} আপনাকে অর্পিত বদলি দায়িত্ব</div><div class="divide-y divide-slate-100">${proxies.map(p => `<div class="px-5 py-2.5 text-sm flex flex-wrap gap-3"><b>${U.fmtDate(p.date)} · পিরিয়ড ${bnNum(p.period)}${RT.time(p.classId, U.dayName(p.date), p.period).start ? ` (${U.bn(RT.time(p.classId, U.dayName(p.date), p.period).start)})` : ''}</b><span>${esc(RT.subName(p))} · ${esc(DB.className(p.classId))}${p.room ? ` · কক্ষ ${esc(U.bn(p.room))}` : ''}</span><span class="text-slate-500">${esc(DB.teacherName(p.absentTeacherId))}-এর পরিবর্তে</span></div>`).join('')}</div></div>` : '')
          + `<div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">${kpi(U.isSchoolDay(new Date()) ? 'আজকের পিরিয়ড' : `${U.dayBn(d)}-এর পিরিয়ড`, bnNum(sched.length), '', 'clock', 'blue')}${kpi('পাঠদানকৃত শ্রেণি', bnNum(Teacher.myClasses().length), '', 'users', 'violet')}${kpi('মূল্যায়নের অপেক্ষায়', bnNum(pend.length), 'জমাকৃত বাড়ির কাজ', 'clipboard-check', 'amber')}${kpi('পাঠ্যসূচি সম্পন্ন', bnNum(sylPct.toFixed(0)) + '%', 'সকল শ্রেণির গড়', 'book-check', 'green')}</div>
          <div class="grid lg:grid-cols-3 gap-5"><div class="card lg:col-span-2"><div class="px-5 py-3 border-b border-slate-100 font-semibold">${U.isSchoolDay(new Date()) ? 'আজ' : 'পরবর্তী কর্মদিবস'} · ${U.dayBn(d)} ${U.fmtDate(U.iso(d))}</div>
            <div class="divide-y divide-slate-100">${sched.map(r => { const p = RT.range(r), co = RT.tchs(r).filter(x => x !== t.id); return `<div class="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1"><div class="w-32 font-mono text-slate-600">${p.start ? `${U.bn(p.start)}–${U.bn(p.end)}` : ''}</div><div class="w-1.5 h-9 rounded-full" style="background:${U.color(RT.subs(r)[0] || '')}"></div><div class="flex-1 min-w-0"><div class="font-semibold">${esc(RT.subName(r))} · ${esc(DB.cls(r.classId)?.name || '')}${r.section ? '-' + esc(r.section) : ''}${r.supp ? ' ' + badge('সাপ্লিমেন্টারি', 'violet') : ''}${r._ov?.length ? ' ' + badge(RT.ovNote(r), 'amber') : ''}</div><div class="text-slate-500">${RT.periodText(r)}${r.room ? ` · কক্ষ ${esc(U.bn(r.room))}` : ''}${co.length ? ` · সঙ্গে ${esc(co.map(x => DB.teacherName(x)).join(', '))}` : ''}</div></div><button class="btn btn-ghost btn-sm" onclick="App.ui.att={cls:'${r.classId}',date:U.today(),period:${r.period},marks:null};App.go('teacher','attendance')">${icon('list-checks')} হাজিরা নিন</button></div>`; }).join('') || emptyState('কোনো পিরিয়ড নির্ধারিত নেই।', 'coffee')}</div></div>
            <div class="card"><div class="px-5 py-3 border-b border-slate-100 font-semibold">মূল্যায়নের অপেক্ষায়</div><div class="divide-y divide-slate-100">${pend.slice(0, 6).map(s => { const st = DB.student(s.studentId); return `<button class="w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-slate-50" onclick="Teacher.openCanvas('${s.id}')">${avatar(st, 30)}<div class="min-w-0"><div class="text-sm font-semibold truncate">${esc(pn(st))}</div><div class="text-xs text-slate-500 truncate">${esc(DB.s.homework.find(h => h.id === s.homeworkId).title)}</div></div></button>`; }).join('') || emptyState('সব কাজ সম্পন্ন!', 'party-popper')}</div></div></div>`;
      },
    },
    /* ---------------- Attendance register ---------------- */
    {
      id: 'attendance', label: 'হাজিরা খাতা', icon: 'list-checks',
      render() {
        if (typeof StaffGate !== 'undefined' && StaffGate.locked()) return StaffGate.lockHtml();
        const classes = Teacher.rollClasses();
        if (!classes.length) return pageHeader('হাজিরা খাতা', '') + `<div class="card p-6">${emptyState('আপনাকে কোনো শ্রেণি বরাদ্দ করা হয়নি।', 'users')}</div>`;
        const ui = App.ui.att || (App.ui.att = { cls: classes[0], date: U.today(), period: 1, marks: null });
        if (!classes.includes(ui.cls)) ui.cls = classes[0];
        const list = DB.studentsIn(ui.cls);
        const pm = Teacher.periodMode(), mk = ui.cls + ui.date + (pm ? 'P' + ui.period : '');
        if (!ui.marks || ui.marksKey !== mk) { ui.marks = {}; list.forEach(st => ui.marks[st.id] = (pm ? DB.s.periodAttendance?.[st.id]?.[ui.date]?.[ui.period] : null) || DB.s.attendance[st.id]?.[ui.date] || 'P'); ui.marksKey = mk; }
        const c = { P: 0, A: 0, L: 0, E: 0 }; list.forEach(st => c[ui.marks[st.id]]++);
        const saved = list.some(st => pm ? DB.s.periodAttendance?.[st.id]?.[ui.date]?.[ui.period] : DB.s.attendance[st.id]?.[ui.date]);
        return pageHeader(pm ? 'পিরিয়ডভিত্তিক হাজিরা খাতা' : 'দৈনিক হাজিরা খাতা', '')
          + `<div class="card p-4 mb-4 flex flex-wrap gap-3 items-end"><div><label class="label">শ্রেণি</label>${Teacher.classSelect('att-cls', ui.cls, "App.ui.att.cls=this.value;App.refresh()", classes)}</div>
            <div><label class="label">তারিখ</label><input type="date" class="input" value="${ui.date}" max="${U.today()}" onchange="App.ui.att.date=this.value;App.refresh()"></div>
            ${pm ? `<div><label class="label">পিরিয়ড</label><select class="select" onchange="App.ui.att.period=+this.value;App.refresh()">${RT.plan(ui.cls, U.dayName(ui.date), ui.date).periods.map(p => `<option value="${p.n}" ${p.n === ui.period ? 'selected' : ''}>পিরিয়ড ${bnNum(p.n)}${p.start ? ' · ' + U.bn(p.start) : ''}</option>`).join('')}</select></div>` : ''}
            <div class="flex-1"></div><div class="flex flex-wrap gap-1.5">${badge(`${bn('Present')} ${bnNum(c.P)}`, 'green')}${badge(`${bn('Absent')} ${bnNum(c.A)}`, 'red')}${badge(`${bn('Late')} ${bnNum(c.L)}`, 'amber')}${badge(`${bn('Excused')} ${bnNum(c.E)}`, 'violet')}${saved ? badge('পূর্বে সংরক্ষিত', 'blue') : ''}</div></div>
          ${U.isSchoolDay(ui.date, null, DB.campusOf(ui.cls)) ? '' : `<div class="card p-3 mb-4 bg-amber-50 border-amber-200 text-amber-800 text-sm">${icon('calendar-off', 'w-4 h-4 inline')} ${U.fmtDate(ui.date)} ${DB.holiday(ui.date, DB.campusOf(ui.cls)) ? `ছুটির দিন — <b>${esc(DB.holiday(ui.date, DB.campusOf(ui.cls)).name)}</b>` : 'সাপ্তাহিক ছুটির দিন'}</div>`}
          <div class="card"><div class="px-4 py-2 border-b border-slate-100 flex gap-2"><button class="btn btn-ghost btn-sm" onclick="DB.studentsIn(App.ui.att.cls).forEach(s=>App.ui.att.marks[s.id]='P');App.refresh()">${icon('check-check')} সকলকে উপস্থিত চিহ্নিত করুন</button></div>
            <div class="divide-y divide-slate-100">${list.map(st => { const att = DB.attendanceStats(st.id); return `<div class="px-4 py-2.5 flex items-center gap-3"><div class="w-8 text-center font-mono text-sm text-slate-500">${bnNum(st.roll)}</div>${avatar(st, 32)}<div class="flex-1 min-w-0"><div class="font-semibold text-sm truncate">${esc(pn(st))}</div><div class="text-xs ${att.pct < DB.s.school.minAttendance ? 'text-red-500' : 'text-slate-400'}">টার্ম ${bnNum(att.pct.toFixed(0))}%</div></div>
              <div class="flex gap-1">${['P', 'A', 'L', 'E'].map(v => `<button class="att-btn ${ui.marks[st.id] === v ? 'on-' + v : ''}" title="${bn({ P: 'Present', A: 'Absent', L: 'Late', E: 'Excused' }[v])}" onclick="App.ui.att.marks['${st.id}']='${v}';App.refresh()">${bn(v)}</button>`).join('')}</div></div>`; }).join('')}</div>
            <div class="p-4 border-t border-slate-100 flex justify-end"><button class="btn btn-primary" onclick="Teacher.saveRegister()">${icon('save')} ${c.A ? `হাজিরা খাতা সংরক্ষণ করুন ও ${bnNum(c.A)} জন অভিভাবককে জানান` : 'হাজিরা খাতা সংরক্ষণ করুন'}</button></div></div>${typeof Academics !== 'undefined' ? Academics.topicPanel(ui.cls) : ''}`;
      },
    },
    /* ---------------- Gradebook ---------------- */
    {
      id: 'gradebook', label: 'নম্বরপত্র ও গ্রেডবুক', icon: 'table-2',
      render() {
        const classes = Teacher.myClasses();
        const ui = App.ui.gb || (App.ui.gb = { exam: DB.examsOf().find(e => !e.published)?.id || DB.latestExam()?.id, cls: classes[0], subj: null });
        if (!classes.includes(ui.cls)) ui.cls = classes[0];
        if (!classes.length) return pageHeader('নম্বরপত্র ও গ্রেডবুক', '') + `<div class="card p-6">${emptyState('আপনাকে এখনো কোনো শ্রেণি বা বিষয় বরাদ্দ করা হয়নি।', 'table-2')}</div>`;
        const subs = Teacher.mySubjects(ui.cls); if (!subs.includes(ui.subj)) ui.subj = subs[0];
        const ex0 = DB.exam(ui.exam) || DB.latestExam() || DB.examsOf()[0] || DB.s.exams[0];
        if (!ex0 || !ui.subj) return pageHeader('নম্বরপত্র ও গ্রেডবুক', '') + `<div class="card p-6">${emptyState(ex0 ? 'এই শ্রেণিতে আপনার কোনো বিষয় নেই।' : 'এখনো কোনো পরীক্ষা তৈরি করা হয়নি। পরীক্ষা কেন্দ্রে পরীক্ষা যোগ হলে এখানে নম্বর দেওয়া যাবে।', 'table-2')}</div>`;
        ui.exam = ex0.id;
        // only students who take this subject (বিভাগ / শাখা / ঐচ্ছিক বিষয় — SubjectSets in js/modules/students.js)
        const list = DB.studentsIn(ui.cls).filter(st => typeof SubjectSets === 'undefined' || SubjectSets.takes(st.id, ui.subj)), ex = Grade.cfg(ex0, ui.subj);   // this subject's distribution & pass marks
        if (!Grade.included(ex0, ui.subj)) return pageHeader('নম্বরপত্র ও গ্রেডবুক', '') + `<div class="card p-6">${emptyState(`${DB.subject(ui.subj).name} বিষয়টি ${esc(ex0.name)}-এর অন্তর্ভুক্ত নয় (দেখুন পরীক্ষা → সেটআপ)।`, 'circle-slash')}<div class="text-center"><select class="select !w-auto" onchange="App.ui.gb.exam=this.value;App.refresh()">${[...DB.s.exams].sort((a, b) => b.start.localeCompare(a.start)).map(e => `<option value="${e.id}" ${e.id === ui.exam ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></div></div>`;
        const comps = Grade.comps(ex0, ui.subj);
        return pageHeader('নম্বরপত্র ও গ্রেডবুক', `${esc(bn(ex.type))} · ${comps.map(c => `${esc(c.label)} /${bnNum(c.max)} (পাস ${bnNum(c.pass)})`).join(' + ')} · ভার ${bnNum(ex.weight)}% · গ্রেডিং: ${esc(DB.scheme(DB.campusOf(ui.cls), ex.session)?.name || 'এনসিটিবি')}`)
          + `<div class="card p-4 mb-4 flex flex-wrap gap-3 items-end">
            <div><label class="label">পরীক্ষা</label><select class="select" onchange="App.ui.gb.exam=this.value;App.refresh()">${[...DB.s.exams].sort((a, b) => b.start.localeCompare(a.start)).map(e => `<option value="${e.id}" ${e.id === ui.exam ? 'selected' : ''}>${esc(e.name)} · ${esc(bn(e.type))}${e.published ? ' (প্রকাশিত)' : ''}</option>`).join('')}</select></div>
            <div><label class="label">শ্রেণি</label>${Teacher.classSelect('gb-cls', ui.cls, "App.ui.gb.cls=this.value;App.refresh()")}</div>
            <div><label class="label">বিষয়</label><select class="select" onchange="App.ui.gb.subj=this.value;App.refresh()">${subjectOptions(ui.subj, subs)}</select></div>
            <div class="flex-1"></div><div id="gb-summary" class="text-sm text-slate-600"></div></div>
          <div class="card scroll-x"><table class="table" id="gb-table"><thead><tr><th>রোল</th><th>শিক্ষার্থী</th>${comps.map(c => `<th>${esc(c.label)} /${bnNum(c.max)}</th>`).join('')}<th>অনুপস্থিত</th><th>মোট</th><th>গ্রেড</th><th>পয়েন্ট</th></tr></thead><tbody>
          ${list.map(st => { const m0 = DB.s.marks.find(x => x.examId === ui.exam && x.studentId === st.id && x.subjectId === ui.subj), ab = m0 ? !!m0.absent : !!DB.examAbsent?.(ui.exam, st.id, ui.subj), m = m0 && !m0.absent ? m0 : null; return `<tr data-st="${st.id}"><td class="font-mono">${bnNum(st.roll)}</td><td class="font-semibold">${esc(pn(st))}</td>${comps.map(c => { const val = !m ? '' : ['cq', 'mcq', 'pr'].includes(c.k) ? (m[c.k] ?? '') : (m.x?.[c.k] ?? ''); const auto = c.k === 'att' ? Grade.attMarks(DB.attendanceStats(st.id).pct, c) : ''; return `<td><input class="grid-input" data-k="${c.k}" type="number" min="0" max="${c.max}" step="0.5" value="${val}" ${auto !== '' ? `placeholder="${auto}"` : ''} ${ab ? 'disabled' : ''} aria-label="${esc(c.label)}"></td>`; }).join('')}<td class="text-center"><input type="checkbox" class="w-5 h-5" name="ab" ${ab ? 'checked' : ''} aria-label="অনুপস্থিত"></td><td class="font-bold" data-o="total"></td><td data-o="letter"></td><td data-o="point"></td></tr>`; }).join('')}
          </tbody></table><div class="p-4 border-t border-slate-100 flex justify-end gap-2"><button class="btn btn-primary" onclick="Teacher.saveMarks()">${icon('save')} নম্বর সংরক্ষণ করুন</button></div></div>`;
      },
      mount() {
        if (!$('#gb-table')) return;
        const ex0 = DB.exam(App.ui.gb.exam), subj = App.ui.gb.subj, campus = DB.campusOf(App.ui.gb.cls);
        const recalc = () => {
          const pts = [];
          $$('#gb-table tr[data-st]').forEach(tr => {
            const ins = $$('input[data-k]', tr), v = {}; let any = false;
            ins.forEach(i => { const mx = +i.max, s = i.value; i.classList.toggle('bad', s !== '' && (+s < 0 || +s > mx)); if (s !== '') { v[i.dataset.k] = +s; if (i.dataset.k !== 'att') any = true; } else if (i.placeholder !== '') v[i.dataset.k] = +i.placeholder; });
            const o = k => tr.querySelector(`[data-o=${k}]`), ab = !!tr.querySelector('[name=ab]')?.checked;
            ins.forEach(x => { x.disabled = ab; });
            if (ab) { o('total').textContent = 'অনুপস্থিত'; o('letter').innerHTML = badge('অনুপস্থিত', 'red'); o('point').textContent = '—'; return; }
            if (!any) { o('total').textContent = o('letter').textContent = o('point').textContent = '—'; return; }
            const g = Grade.of(v.cq, v.mcq, ex0, campus, v.pr, subj, v); if (g.point !== null) pts.push(g.point);
            o('total').textContent = bnNum(g.total); o('letter').innerHTML = g.failed ? badge(g.letter, 'red') : `<b>${g.letter}</b>`; o('point').textContent = g.point === null ? '—' : gpaFmt(g.point);
          });
          const avg = pts.length ? U.sum(pts) / pts.length : 0;
          $('#gb-summary').innerHTML = `${bnNum(pts.length)}টি মূল্যায়িত · শ্রেণির গড় পয়েন্ট <b>${gpaFmt(avg)}</b> · ${bnNum(pts.filter(p => p === 5).length)}টি A+ · <span class="text-red-600">${bnNum(pts.filter(p => p === 0).length)}টি F</span>`;
        };
        $('#gb-table').addEventListener('input', recalc); $('#gb-table').addEventListener('change', recalc); recalc();
      },
    },
    /* ---------------- Lesson-plan template ---------------- */
    {
      id: 'planner', label: 'পাঠ পরিকল্পনা টেমপ্লেট', icon: 'notebook-pen', when: () => DB.s.featureFlags.aiPlanner,
      render() {
        const ui = App.ui.lp || (App.ui.lp = { plan: null }), me = Teacher.me();
        if (!me || !Teacher.myClasses().length) return pageHeader('পাঠ পরিকল্পনা টেমপ্লেট', '') + `<div class="card p-6">${emptyState('আপনাকে কোনো শ্রেণি বা বিষয় বরাদ্দ করা হলে এখানে পাঠ পরিকল্পনা তৈরি করা যাবে।', 'notebook-pen')}</div>`;
        const saved = (DB.s.lessonPlans || []).filter(p => p.teacherId === me.id).slice(-6).reverse();
        return pageHeader('পাঠ পরিকল্পনা টেমপ্লেট', '')
          + `<div class="grid lg:grid-cols-3 gap-5"><div class="space-y-5"><form id="lp-form" class="card p-5 space-y-3">
              <div><label class="label">বিষয়বস্তু</label><input class="input" name="topic" required placeholder="যেমন: দ্বিঘাত সমীকরণ" value="${esc(ui.plan?.topic || '')}"></div>
              <div><label class="label">শ্রেণি</label><select class="select" name="classId">${classOptions(ui.plan?.classId || Teacher.myClasses()[0])}</select></div>
              <div><label class="label">বিষয়</label><select class="select" name="subjectId">${(c => subjectOptions(ui.plan?.subjectId || Teacher.mySubjects(c)[0], Teacher.mySubjects(c)))(ui.plan?.classId || Teacher.myClasses()[0])}</select></div>
              <button class="btn btn-primary w-full">${icon('notebook-pen')} খসড়া তৈরি করুন</button></form>
            <div class="card"><div class="px-5 py-3 border-b border-slate-100 font-semibold text-sm">সংরক্ষিত পরিকল্পনা</div><div class="divide-y divide-slate-100">${saved.map(p => `<button class="w-full text-left px-5 py-2.5 text-sm hover:bg-slate-50" onclick="App.ui.lp.plan=(DB.s.lessonPlans||[]).find(x=>x.id==='${p.id}');App.refresh()"><b>${esc(p.topic)}</b><div class="text-xs text-slate-400">${DB.cls(p.classId).name} · ${U.fmtDate(p.createdAt.slice(0, 10))}</div></button>`).join('') || emptyState('এখনও কিছু নেই')}</div></div></div>
            <div class="lg:col-span-2 card p-5" id="lp-out">${ui.plan ? Teacher.planHtml(ui.plan) + `<div class="flex flex-wrap gap-2 mt-5"><button class="btn btn-ghost" onclick="Teacher.savePlan()">${icon('bookmark')} সংগ্রহে সংরক্ষণ করুন</button><button class="btn btn-ghost" onclick="Teacher.printPlan()">${icon('printer')} মুদ্রণ</button></div>` : emptyState('আপনার তৈরি পরিকল্পনা এখানে প্রদর্শিত হবে।', 'notebook-pen')}</div></div>`;
      },
      mount() {
        if (!$('#lp-form')) return;
        $('#lp-form').addEventListener('submit', e => { e.preventDefault(); const f = formData(e.target); App.ui.lp.plan = Teacher.generatePlan(f.topic, f.classId, f.subjectId); App.refresh(); });
        Teacher.bindQuiz($('#lp-out'));
      },
    },
    /* ---------------- Homework & canvas ---------------- */
    {
      id: 'homework', label: 'বাড়ির কাজ মূল্যায়ন ক্যানভাস', icon: 'pen-tool',
      count: () => { const t = Teacher.me(); return DB.s.submissions.filter(s => s.status === 'Submitted' && DB.s.homework.find(h => h.id === s.homeworkId)?.teacherId === t.id).length || ''; },
      render() {
        const t = Teacher.me(), hws = DB.s.homework.filter(h => h.teacherId === t.id).sort((a, b) => b.due.localeCompare(a.due));
        return pageHeader('ডিজিটাল বাড়ির কাজ মূল্যায়ন ক্যানভাস', '', `<button class="btn btn-primary" onclick="Teacher.newHomework()">${icon('plus')} নতুন বাড়ির কাজ</button>`)
          + hws.map(h => { const subs = DB.s.submissions.filter(s => s.homeworkId === h.id), n = DB.studentsIn(h.classId).length; return `<div class="card mb-4"><div class="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2"><div class="flex-1 min-w-0"><div class="font-semibold">${esc(h.title)}</div><div class="text-xs text-slate-500">${DB.cls(h.classId).name} · ${DB.subject(h.subjectId).name} · জমার শেষ তারিখ ${U.fmtDate(h.due)}${HwEval.usesMarks() ? ` · পূর্ণমান ${bnNum(HwEval.full(h))}` : ''}</div></div>${badge(`${bnNum(subs.length)}/${bnNum(n)} জমা পড়েছে`, 'blue')}${badge(`${bnNum(subs.filter(s => s.status === 'Graded').length)}টি মূল্যায়িত`, 'green')}${(ms => ms.length && HwEval.usesMarks() ? badge(`গড় নম্বর ${bnNum(+(U.sum(ms, s => s.marks / (s.fullMarks || HwEval.full(h)) * HwEval.full(h)) / ms.length).toFixed(1))}/${bnNum(HwEval.full(h))}`, 'violet') : '')(subs.filter(s => s.status === 'Graded' && HwEval.hasMarks(s)))}</div>
            <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">${subs.map(s => { const st = DB.student(s.studentId); return `<button class="card p-3 text-left hover:border-brand-400 flex items-center gap-3" onclick="Teacher.openCanvas('${s.id}')">${avatar(st, 36)}<div class="min-w-0 flex-1"><div class="text-sm font-semibold truncate">${esc(pn(st))}</div><div class="text-xs text-slate-400 truncate">${esc(s.fileName)}</div></div>${s.status === 'Graded' ? badge(HwEval.fmt(s, h), 'green') : badge('নতুন', 'amber')}</button>`; }).join('') || `<div class="text-sm text-slate-400">এখনও কোনো জমা পড়েনি।</div>`}</div></div>`; }).join('');
      },
    },
    /* ---------------- Syllabus — rendered per teaching assignment by js/modules/staffgate.js ---------------- */
    { id: 'syllabus', label: 'পাঠ্যসূচি অগ্রগতি', icon: 'book-check', render() { return ''; } },
    /* ---------------- Conduct log ---------------- */
    {
      id: 'conduct', label: 'আচরণ লগ', icon: 'clipboard-pen',
      render() {
        const mine = DB.s.incidents.filter(i => i.by === App.session.userId).sort((a, b) => b.date.localeCompare(a.date));
        const sts = Teacher.myClasses().flatMap(c => DB.studentsIn(c));
        return pageHeader('আচরণগত ঘটনা লগ', '')
          + `<div class="grid lg:grid-cols-3 gap-5"><form id="inc-form" class="card p-5 space-y-3"><div><label class="label">শিক্ষার্থী</label>${studentPicker('studentId', '', { campus: Teacher.me().campusId, required: true })}</div>
            <div><label class="label">ধরন</label><select class="select" name="type">${['Commendation', 'Disciplinary', 'Counselor'].map(x => `<option value="${x}">${bn(x)}</option>`).join('')}</select></div>
            <div><label class="label">মন্তব্য</label><textarea class="textarea" name="note" rows="4" required></textarea></div><label class="flex items-center gap-2 text-sm"><input type="checkbox" name="notify" checked> অভিভাবককে এসএমএস পাঠান</label><button class="btn btn-primary w-full">${icon('save')} ঘটনা লিপিবদ্ধ করুন</button></form>
            <div class="card lg:col-span-2"><div class="px-5 py-3 border-b border-slate-100 font-semibold">আমার এন্ট্রি</div><div class="divide-y divide-slate-100">${mine.map(i => `<div class="px-5 py-3 text-sm flex gap-3"><div class="w-28 shrink-0">${statusBadge(i.type)}<div class="text-xs text-slate-400 mt-1">${U.fmtDate(i.date)}</div></div><div><b>${esc(pn(DB.student(i.studentId)))}</b> — ${esc(i.note)}</div></div>`).join('') || emptyState('এখনও কোনো এন্ট্রি নেই।')}</div></div></div>`;
      },
      mount() {
        $('#inc-form').addEventListener('submit', e => {
          e.preventDefault(); const f = formData(e.target), st = DB.student(f.studentId); if (!st) return toast('অনুসন্ধান তালিকা থেকে একজন শিক্ষার্থী নির্বাচন করুন।', 'error');
          DB.s.incidents.push({ id: DB.id('INC'), studentId: f.studentId, type: f.type, note: f.note, by: App.session.userId, date: U.today() });
          if (f.notify) DB.guardiansOf(st.id).forEach(g => DB.sms(g.phone, `${DB.s.school.shortName}: ${pn(st)} সম্পর্কে ${bn(f.type)} মন্তব্য: ${f.note}`));
          DB.audit('INCIDENT_LOG', 'incidents', `${pn(st)}-এর জন্য ${bn(f.type)}`); DB.save(); toast('ঘটনাটি লিপিবদ্ধ করা হয়েছে।', 'success'); App.refresh();
        });
      },
    },
    /* ---------------- Leave desk ---------------- */
    {
      id: 'leave', label: 'ছুটি ডেস্ক', icon: 'plane',
      render() {
        const t = Teacher.me(), mine = DB.s.leaves.filter(l => l.teacherId === t.id).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
        const mk = U.monthKey(new Date()), abs = DB.s.teacherAbsences[t.id]?.[mk] || { unexcused: 0, excused: 0 };
        return pageHeader('ছুটির আবেদন ডেস্ক', '')
          + `<div class="grid lg:grid-cols-3 gap-5"><form id="lv-form" class="card p-5 space-y-3"><div><label class="label">ছুটির ধরন</label><select class="select" name="type">${['Casual', 'Medical', 'Earned', 'Duty'].map(x => `<option value="${x}">${bn(x)}</option>`).join('')}</select></div>
            <div class="grid grid-cols-2 gap-3"><div><label class="label">হতে</label><input type="date" class="input" name="from" min="${U.today()}" required></div><div><label class="label">পর্যন্ত</label><input type="date" class="input" name="to" min="${U.today()}" required></div></div>
            <div><label class="label">কারণ</label><textarea class="textarea" name="reason" rows="3" required></textarea></div><button class="btn btn-primary w-full">${icon('send')} অধ্যক্ষের কাছে জমা দিন</button>
            <div class="text-xs text-slate-500">এ মাসে: ${bnNum(abs.excused)}টি অনুমোদিত · ${bnNum(abs.unexcused)}টি অননুমোদিত অনুপস্থিতি</div></form>
            <div class="card lg:col-span-2 scroll-x"><table class="table"><thead><tr><th>ধরন</th><th>তারিখসমূহ</th><th>কারণ</th><th>অবস্থা</th></tr></thead><tbody>${mine.map(l => `<tr><td>${esc(bn(l.type))}</td><td>${U.fmtDate(l.from)} → ${U.fmtDate(l.to)}</td><td>${esc(l.reason)}</td><td>${statusBadge(l.status)}</td></tr>`).join('')}</tbody></table>${mine.length ? '' : emptyState('কোনো ছুটির আবেদন নেই।')}</div></div>`;
      },
      mount() {
        $('#lv-form').addEventListener('submit', e => {
          e.preventDefault(); const f = formData(e.target);
          if (f.to < f.from) return toast('শেষের তারিখ শুরুর তারিখের আগে হতে পারে না।', 'error');
          DB.s.leaves.push({ id: DB.id('LV'), teacherId: Teacher.me().id, ...f, status: 'Pending', submittedAt: new Date().toISOString() });
          DB.audit('LEAVE_REQUEST', 'leaves', `${bn(f.type)} ${f.from}→${f.to}`); DB.save(); toast('ছুটির আবেদন জমা দেওয়া হয়েছে।', 'success'); App.refresh();
        });
      },
    },
  ],
});

Object.assign(Teacher, {
  savePlan() { const p = App.ui.lp.plan; DB.s.lessonPlans = DB.s.lessonPlans || []; if (!DB.s.lessonPlans.some(x => x.id === p.id)) DB.s.lessonPlans.push(p); DB.save(); toast('পাঠ পরিকল্পনা সংরক্ষিত হয়েছে।', 'success'); App.refresh(); },
  printPlan(id) {
    const p = id ? (DB.s.lessonPlans || []).find(x => x.id === id) : App.ui.lp?.plan; let t = 0;
    if (!p) return toast('পাঠ পরিকল্পনাটি পাওয়া যায়নি।', 'error');
    Print.preview('পাঠ পরিকল্পনা', [`<div class="sheet padded">${Print.header('পাঠ পরিকল্পনা · ৪৫ মিনিট')}<div style="font-size:10pt"><b>বিষয়বস্তু:</b> ${esc(p.topic)} · <b>শ্রেণি:</b> ${DB.cls(p.classId).name} · <b>বিষয়:</b> ${DB.subject(p.subjectId).name} · <b>শিক্ষক:</b> ${esc(pn(App.user()))}</div>
      <h3 style="margin:5mm 0 2mm;font-weight:700">উদ্দেশ্য</h3><ul style="font-size:10pt;margin-left:6mm;list-style:disc">${p.objectives.map(o => `<li>${esc(o)}</li>`).join('')}</ul>
      <h3 style="margin:5mm 0 2mm;font-weight:700">রূপরেখা</h3><table class="ms-table">${p.segments.map(([m, h, d]) => { const s = t; t += m; return `<tr><td style="width:22mm">${bnNum(s)}–${bnNum(t)} মিনিট</td><td style="text-align:left"><b>${h}</b> — ${esc(d)}</td></tr>`; }).join('')}</table>
      <h3 style="margin:5mm 0 2mm;font-weight:700">তাৎক্ষণিক কুইজ</h3><ol style="font-size:10pt;margin-left:6mm;list-style:decimal">${p.quiz.map(q => `<li style="margin-bottom:2mm">${esc(q.q)}<br>${q.opts.map((o, k) => `${'কখগঘ'[k]}. ${esc(o)}`).join('&nbsp;&nbsp;&nbsp;')}</li>`).join('')}</ol>
      <div style="font-size:8pt;color:#64748b;margin-top:4mm">উত্তরমালা: ${p.quiz.map((q, i) => `${bnNum(i + 1)}-${'কখগঘ'[q.ans]}`).join(', ')}</div></div>`], (DB.s.lessonPlans || []).some(x => x.id === p.id) ? { re: ['Teacher.printPlan', p.id] } : {});
  },
  newHomework() {
    const cls = Teacher.myClasses(), subs = Teacher.mySubjects(cls[0]);
    if (!cls.length) return toast('আপনাকে কোনো শ্রেণি বরাদ্দ করা হয়নি।', 'error');
    Modal.open({
      title: 'নতুন বাড়ির কাজ', size: 'md',
      body: `<form id="hw-form" class="space-y-3"><div><label class="label">শিরোনাম</label><input class="input" name="title" required></div><div class="grid sm:grid-cols-2 gap-3"><div><label class="label">শ্রেণি</label><select class="select" name="classId">${cls.map(c => `<option value="${c}">${DB.cls(c).name}</option>`).join('')}</select></div><div><label class="label">বিষয়</label><select class="select" name="subjectId">${subjectOptions(subs[0], subs)}</select></div></div>
        <div class="grid sm:grid-cols-2 gap-3"><div><label class="label">জমার শেষ তারিখ</label><input type="date" class="input" name="due" min="${U.today()}" required></div>${HwEval.usesMarks() ? `<div><label class="label">পূর্ণমান</label><input type="number" class="input" name="fullMarks" min="1" max="1000" value="${HwEval.full()}" required></div>` : ''}</div><div><label class="label">নির্দেশনা</label><textarea class="textarea" name="instructions" rows="3"></textarea></div><div><label class="label">কার্যপত্র (ঐচ্ছিক)</label><input type="file" name="attach" accept="application/pdf,image/*" class="input"></div><button class="btn btn-primary w-full">প্রকাশ করুন ও অভিভাবকদের জানান</button></form>`,
    });
    $('#hw-form').addEventListener('submit', e => {
      e.preventDefault(); const f = formData(e.target);
      const file = e.target.attach?.files?.[0];
      const save = attachment => { DB.s.homework.push({ id: DB.id('HW'), ...f, fullMarks: +f.fullMarks > 0 ? +f.fullMarks : HwEval.full(), attach: undefined, attachment, section: DB.cls(f.classId)?.sections[0] || 'ক', teacherId: Teacher.me().id, createdAt: U.today() }); DB.studentsIn(f.classId).forEach(st => DB.guardiansOf(st.id).forEach(g => DB.sms(g.phone, `${DB.s.school.shortName}: ${pn(st)}-এর জন্য নতুন বাড়ির কাজ — "${f.title}", জমার শেষ তারিখ ${U.fmtDate(f.due)}।`, 'Push'))); };
      if (file) { readUpload(file, 1400).then(dataUrl => { save({ fileName: file.name, fileType: file.type === 'application/pdf' ? 'application/pdf' : 'image/jpeg', dataUrl }); DB.save(); App.refresh(); }).catch(err => toast(err.message, 'error')); } else save(null);
      DB.audit('HOMEWORK_CREATE', 'homework', `${f.title} → ${f.classId}`); DB.save(); Modal.close(); toast('বাড়ির কাজ প্রকাশিত হয়েছে।', 'success'); App.refresh();
    });
  },
});
