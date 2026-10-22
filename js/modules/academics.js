/* ==========================================================================
   ACADEMIC MANAGEMENT
   Syllabus & lesson progress (topic statuses stamped with the date they were
   marked — no pre-set deadlines; Past / Exam-based / Current term / Upcoming /
   Full year views; "taught in class" during roll-call) · Study materials ·
   Class promotion engine.
   ========================================================================== */

const TOPIC_STATUSES = ['Not started', 'Ongoing', 'Done', 'Revision', 'Rework'];
const TOPIC_TONE = { 'Not started': 'slate', Ongoing: 'blue', Done: 'green', Revision: 'violet', Rework: 'amber' };
const TOPIC_PARTS = ['ধারণা ও সংজ্ঞা', 'সমাধানকৃত উদাহরণ', 'অনুশীলনী'];


const Academics = {
  /* ---------- syllabus ---------- */
  progress(sy) { const all = sy.chapters.flatMap(c => c.topics), done = all.filter(t => t.status === 'Done' || t.status === 'Revision').length; return { done, total: all.length, pct: all.length ? done / all.length * 100 : 0 }; },
  lastActivity(sy) { const h = sy.chapters.flatMap(c => c.topics.flatMap(t => t.history)); return h.length ? h.map(x => x.date).sort().pop() : null; },
  chapterStatus(c) { const st = c.topics.map(t => t.status); if (st.every(x => x === 'Done' || x === 'Revision')) return 'Done'; if (st.every(x => x === 'Not started')) return 'Not started'; if (st.includes('Rework')) return 'Rework'; return 'Ongoing'; },
  currentExam() { return DB.examsOf().filter(e => MAJOR_EXAMS.includes(e.type) && !e.published).sort((a, b) => a.start.localeCompare(b.start))[0] || DB.latestExam(); },
  setTopic(syId, ci, ti, status) {
    const sy = DB.s.syllabus.find(x => x.id === syId), t = sy.chapters[ci].topics[ti];
    t.status = status; t.history.push({ status, date: U.today(), by: Teacher.me()?.id || App.session.userId });
    DB.audit('SYLLABUS_TOPIC', 'syllabus', `${sy.classId} ${sy.subjectId}: “${t.name}” → ${bn(status)}`); DB.save(); App.refresh();
  },
  addChapter(syId) {
    const sy = DB.s.syllabus.find(x => x.id === syId), name = prompt('অধ্যায়ের নাম:'); if (!name) return;
    const topics = (prompt('বিষয়বস্তু (কমা দিয়ে পৃথক করুন):', TOPIC_PARTS.join(', ')) || '').split(',').map(x => x.trim()).filter(Boolean);
    sy.chapters.push({ name, examId: this.currentExam()?.id || null, topics: (topics.length ? topics : TOPIC_PARTS).map(n => ({ name: n, status: 'Not started', history: [] })) });
    DB.audit('SYLLABUS_CHAPTER', 'syllabus', `${sy.classId} ${sy.subjectId}: + ${name}`); DB.save(); App.refresh();
  },
  setExamTag(syId, ci, examId) { const sy = DB.s.syllabus.find(x => x.id === syId); sy.chapters[ci].examId = examId || null; DB.save(); App.refresh(); },
  ensure(teacherId, classId, subjectId) {
    let sy = DB.s.syllabus.find(x => x.teacherId === teacherId && x.classId === classId && x.subjectId === subjectId);
    if (!sy) { sy = { id: DB.id('SYL'), teacherId, classId, subjectId, chapters: [] }; DB.s.syllabus.push(sy); DB.save(); }
    return sy;
  },
  /** Renders a tracker with one of five views; `editable` shows status controls. */
  tracker(sy, view, editable) {
    const cur = this.currentExam(), exams = Object.fromEntries(DB.s.exams.map(e => [e.id, e]));
    let chapters = sy.chapters.map((c, ci) => ({ c, ci, st: this.chapterStatus(c) }));
    if (view === 'past') chapters = chapters.filter(x => x.st === 'Done');
    if (view === 'current') chapters = chapters.filter(x => (typeof chExams === 'function' ? chExams(x.c) : [x.c.examId]).includes(cur?.id));
    if (view === 'upcoming') chapters = chapters.filter(x => x.st === 'Not started');
    const groups = view === 'exam' ? [...new Set(chapters.map(x => x.c.examId || ''))].map(id => [id, chapters.filter(x => (x.c.examId || '') === id)]) : [['', chapters]];
    const p = this.progress(sy);
    return `<div class="card mb-5"><div class="px-5 py-3 border-b border-slate-100"><div class="flex flex-wrap items-center gap-2"><div class="font-semibold mr-auto">${DB.subject(sy.subjectId).name} · ${esc(DB.className(sy.classId))} <span class="text-xs text-slate-400 font-normal">${esc(DB.teacherName(sy.teacherId))}</span></div>${badge(`${bnNum(p.done)}/${bnNum(p.total)}টি বিষয়বস্তু`, 'green')}${this.lastActivity(sy) ? `<span class="text-xs text-slate-500">সর্বশেষ আপডেট ${U.fmtDate(this.lastActivity(sy))}</span>` : ''}${editable ? `<button class="btn btn-ghost btn-sm" onclick="Academics.addChapter('${sy.id}')">${icon('plus')} অধ্যায়</button>` : ''}</div><div class="mt-2">${progressBar(p.pct, 'bg-brand-600')}</div></div>
      ${groups.map(([eid, list]) => `${view === 'exam' ? `<div class="px-5 py-2 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">${eid ? esc(exams[eid]?.name || eid) : 'কোনো পরীক্ষার সঙ্গে যুক্ত নয়'}</div>` : ''}
        ${list.map(({ c, ci, st }) => `<details class="border-t border-slate-100" ${st === 'Ongoing' || st === 'Rework' ? 'open' : ''}><summary class="px-5 py-2.5 flex items-center gap-2 cursor-pointer text-sm"><span class="font-semibold flex-1">${esc(c.name)}</span>${badge(bn(st), TOPIC_TONE[st])}${editable ? `<select class="select !py-0.5 !text-xs !w-auto" onclick="event.stopPropagation()" onchange="Academics.setExamTag('${sy.id}',${ci},this.value)"><option value="">পরীক্ষা নেই</option>${DB.examsOf().map(e => `<option value="${e.id}" ${e.id === c.examId ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select>` : (c.examId ? `<span class="text-xs text-slate-400">${esc(exams[c.examId]?.name || '')}</span>` : '')}</summary>
          <div class="pb-2">${c.topics.map((t, ti) => { const last = t.history[t.history.length - 1]; return `<div class="px-5 pl-9 py-1.5 flex flex-wrap items-center gap-2 text-sm"><span class="flex-1 min-w-[180px]">${esc(t.name)}</span>${last ? `<span class="text-xs text-slate-400" title="${esc(t.history.map(h => `${bn(h.status)} · ${U.fmtDate(h.date)}`).join('\n'))}">${U.fmtDate(last.date)} তারিখে ${esc(bn(last.status))}${t.history.length > 1 ? ` · ${bnNum(t.history.length)}টি আপডেট` : ''}</span>` : '<span class="text-xs text-slate-300">কোনো আপডেট নেই</span>'}
            ${editable ? `<select class="select !py-0.5 !text-xs !w-auto" onchange="Academics.setTopic('${sy.id}',${ci},${ti},this.value)">${TOPIC_STATUSES.map(s => `<option value="${s}" ${s === t.status ? 'selected' : ''}>${bn(s)}</option>`).join('')}</select>` : badge(bn(t.status), TOPIC_TONE[t.status])}</div>`; }).join('')}</div></details>`).join('') || `<div class="px-5 py-4 text-sm text-slate-400 border-t border-slate-100">এই প্রদর্শনে কিছু নেই।</div>`}`).join('')}</div>`;
  },
  views: [['full', 'পূর্ণ বছর'], ['current', 'চলতি টার্ম'], ['exam', 'পরীক্ষাভিত্তিক'], ['past', 'বিগত (সম্পন্ন)'], ['upcoming', 'আসন্ন']],
  /** Roll-call panel: tick topics taught in this period (stamped with today's date). */
  topicPanel(classId) {
    const t = Teacher.me(); if (!t) return '';
    const subs = Teacher.mySubjects(classId);
    const rows = subs.map(sj => { const sy = DB.s.syllabus.find(x => x.teacherId === t.id && x.classId === classId && x.subjectId === sj); if (!sy) return ''; const open = sy.chapters.flatMap((c, ci) => c.topics.map((tp, ti) => ({ c, ci, tp, ti }))).filter(x => x.tp.status === 'Ongoing' || x.tp.status === 'Not started' || x.tp.status === 'Rework').slice(0, 6);
      return `<div class="px-4 py-2"><div class="text-xs font-bold text-slate-500 uppercase mb-1">${DB.subject(sj).name}</div>${open.map(x => `<label class="flex items-center gap-2 text-sm py-0.5"><input type="checkbox" onchange="if(this.checked)Academics.setTopic('${sy.id}',${x.ci},${x.ti},'Done')"> ${esc(x.tp.name)} <span class="text-xs text-slate-400">${bn(x.tp.status)}</span></label>`).join('') || '<div class="text-xs text-slate-400">সকল বিষয়বস্তু সম্পন্ন।</div>'}</div>`; }).join('');
    return rows ? `<div class="card mt-4"><div class="px-4 py-2.5 border-b border-slate-100 font-semibold text-sm flex items-center gap-2">${icon('book-check', 'w-4 h-4 text-brand-600')} আজ ক্লাসে পাঠদানকৃত</div>${rows}</div>` : '';
  },

  /* ---------- study materials ---------- */
  open(id) {
    const m = DB.s.materials.find(x => x.id === id); if (!m) return;
    if (!m.dataUrl) return toast('এই উপকরণের সঙ্গে কোনো ফাইল সংরক্ষিত নেই।', 'warn');
    m.downloads = (m.downloads || 0) + 1; DB.save();
    const a = document.createElement('a'); a.href = m.dataUrl; a.download = m.fileName || m.title; a.target = '_blank'; a.click();
  },
  remove(id) { if (!confirm('এই পাঠ-উপকরণটি অপসারণ করবেন?')) return; DB.s.materials = DB.s.materials.filter(x => x.id !== id); DB.audit('MATERIAL_REMOVE', 'materials', id); DB.save(); App.refresh(); },
  materialsList(list, canRemove) {
    return `<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">${list.map(m => `<div class="card p-4 flex gap-3"><div class="w-10 h-10 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">${icon(m.fileType === 'application/pdf' ? 'file-text' : 'file-image', 'w-5 h-5')}</div><div class="min-w-0 flex-1"><div class="font-semibold text-sm">${esc(m.title)}</div><div class="text-xs text-slate-500">${esc(bn(m.type))} · ${esc(DB.subject(m.subjectId)?.name || '—')} · ${esc(DB.className(m.classId))}</div><div class="text-xs text-slate-400">${esc(DB.teacherName(m.teacherId))} · ${U.fmtDate(m.date)} · ${bnNum(m.downloads || 0)} বার ডাউনলোড</div>
      <div class="flex gap-1 mt-2"><button class="btn btn-primary btn-sm" onclick="Academics.open('${m.id}')">${icon('download')} খুলুন</button>${canRemove ? `<button class="btn btn-ghost btn-sm" onclick="Academics.remove('${m.id}')" title="অপসারণ করুন">${icon('trash-2')}</button>` : ''}</div></div></div>`).join('') || emptyState('এখনও কোনো পাঠ-উপকরণ শেয়ার করা হয়নি।', 'folder-open')}</div>`;
  },

  /* ---------- class promotion engine ---------- */
  nextClass(classId) {
    const c = DB.cls(classId), same = DB.classesIn(c.campusId).find(x => x.grade === c.grade + 1);
    if (same) return same.id;
    const other = DB.s.classes.filter(x => x.campusId !== c.campusId && x.grade === c.grade + 1)[0];
    return other ? other.id : null;    // null → graduates
  },
  promotionRows(classId, examId, minAtt) {
    return DB.studentsIn(classId).map(st => {
      const r = DB.result(st.id, examId), att = DB.attendanceStats(st.id).pct;
      const ok = r.rows.length > 0 && r.passed && att >= minAtt, next = this.nextClass(classId);
      return { st, r, att, decision: ok ? (next ? 'Promote' : 'Graduate') : 'Retain', next };
    }).sort((a, b) => ((b.r.gpa ?? b.r.pct / 20) - (a.r.gpa ?? a.r.pct / 20)) || (b.r.total - a.r.total));
  },
  applyPromotion(classId) {
    const ui = App.ui.promo, rows = this.promotionRows(classId, ui.exam, +ui.minAtt);
    const decisions = Object.fromEntries($$('[data-promo]').map(s => [s.dataset.promo, s.value]));
    const next = this.nextClass(classId), counts = { Promote: 0, Retain: 0, Graduate: 0 };
    // provisional mode: promote into the NEXT session's class; the move happens when that session is activated
    if (ui.mode === 'provisional') return Promo.bulkProvisional(classId, next, rows.filter(({ st }) => (decisions[st.id] || 'Retain') === 'Promote').map(x => x.st), ui);
    if (!confirm(`${DB.className(classId)}-এর জন্য শ্রেণি উন্নয়ন কার্যকর করবেন? উন্নীত শিক্ষার্থীরা মেধাভিত্তিক নতুন রোল নম্বরসহ ${next ? DB.className(next) : '— (শিক্ষা সমাপ্তি)'}-এ স্থানান্তরিত হবে।`)) return;
    let roll = Math.max(0, ...(next ? DB.studentsIn(next).map(s => s.roll) : [0]));
    const ses = DB.exam(ui.exam)?.session || DB.session();   // the session the class was studied in (marksheets of that session keep this class)
    rows.forEach(({ st, r }) => {
      const d = decisions[st.id] || 'Retain'; counts[d]++;
      (st.classHistory = st.classHistory || []).push({ session: ses, classId, section: st.section, roll: st.roll, result: r.letter, gpa: r.gpa, decision: d, kind: 'annual', date: U.today() });
      if (d !== 'Retain') Promo.dropPending(st, 'বার্ষিক শ্রেণি উন্নয়ন চূড়ান্তভাবে কার্যকর হয়েছে');
      if (d === 'Promote' && next) { st.classId = next; st.roll = ++roll; st.section = DB.cls(next).sections?.[0] || ''; DB.guardiansOf(st.id).forEach(g => DB.sms(g.phone, `${DB.s.school.shortName}: অভিনন্দন! ${pn(st)} ${DB.className(next)}-এ উন্নীত হয়েছে, রোল ${bnNum(st.roll)}।`)); }
      if (d === 'Graduate') { st.status = 'graduated'; st.leftOn = U.today(); }
    });
    DB.s.promotions.push({ id: DB.id('PRM'), classId, to: next, exam: ui.exam, minAtt: +ui.minAtt, counts, by: App.session.userId, ts: new Date().toISOString() });
    DB.audit('CLASS_PROMOTION', 'students', `${classId} → ${next || 'graduation'}: ${JSON.stringify(counts)}`); DB.save();
    toast(`উন্নীত ${bnNum(counts.Promote)} জন, পুনরাবৃত্তি ${bnNum(counts.Retain)} জন, শিক্ষা সমাপ্ত ${bnNum(counts.Graduate)} জন।`, 'success'); App.refresh();
  },
};

/* ------------------------------------------------------------- pages --- */
// Teacher syllabus page: rendered per teaching assignment by js/modules/staffgate.js.
Object.assign(App.portals.teacher.pages.find(p => p.id === 'syllabus'), { module: 'academics' });

App.addPage('principal', {
  id: 'syllabus-monitor', label: 'পাঠ্যক্রম পর্যবেক্ষণ', icon: 'book-check', module: 'academics',
  render() {
    const view = App.ui.sylView || 'full', list = DB.s.syllabus.filter(sy => DB.campusOf(sy.classId) === DB.campusId() && sy.chapters.length);
    const open = App.ui.sylOpen;
    return pageHeader('পাঠ্যসূচি অগ্রগতি পর্যবেক্ষণ', '')
      + `<div class="card scroll-x mb-5"><table class="table"><thead><tr><th>শিক্ষক</th><th>শ্রেণি</th><th>বিষয়</th><th>অগ্রগতি</th><th>চলতি টার্ম</th><th>সর্বশেষ আপডেট</th><th></th></tr></thead><tbody>${list.map(sy => { const p = Academics.progress(sy), cur = Academics.currentExam(); const curT = sy.chapters.filter(c => (typeof chExams === 'function' ? chExams(c) : [c.examId]).includes(cur?.id)).flatMap(c => c.topics), curDone = curT.filter(t => t.status === 'Done' || t.status === 'Revision').length; const last = Academics.lastActivity(sy), stale = last && (Date.now() - U.d(last)) > 14 * 864e5;
        return `<tr><td class="font-semibold">${esc(DB.teacherName(sy.teacherId))}</td><td>${esc(DB.className(sy.classId))}</td><td>${DB.subject(sy.subjectId).name}</td><td class="w-48"><div class="text-xs mb-1">${bnNum(p.done)}/${bnNum(p.total)} · ${bnNum(p.pct.toFixed(0))}%</div>${progressBar(p.pct)}</td><td class="text-xs">${curT.length ? `${bnNum(curDone)}/${bnNum(curT.length)}` : '—'}</td><td class="text-xs ${stale ? 'text-red-600 font-semibold' : ''}">${last ? U.fmtDate(last) : '—'}${stale ? ' (দীর্ঘদিন আপডেট হয়নি)' : ''}</td><td><button class="btn btn-ghost btn-sm" title="দেখুন" onclick="App.ui.sylOpen='${sy.id}';App.refresh()">${icon('eye')}</button></td></tr>`; }).join('')}</tbody></table></div>`
      + (open ? `<div class="flex flex-wrap gap-2 mb-3">${Academics.views.map(([k, l]) => `<button class="btn btn-sm ${k === view ? 'btn-primary' : 'btn-ghost'}" onclick="App.ui.sylView='${k}';App.refresh()">${l}</button>`).join('')}</div>${Academics.tracker(DB.s.syllabus.find(x => x.id === open), view, false)}` : '');
  },
}, 'routine');

App.addPage('teacher', {
  id: 'materials', label: 'পাঠ-উপকরণ', icon: 'folder-open', module: 'academics', flag: 'studyMaterials',
  render() { const t = Teacher.me(); if (!t) return pageHeader('পাঠ-উপকরণ') + emptyState('এই অ্যাকাউন্টের সঙ্গে কোনো শিক্ষকের রেকর্ড যুক্ত নেই।', 'folder-open'); return pageHeader('পাঠ-উপকরণ', '',`<button class="btn btn-primary" onclick="Academics.upload()">${icon('upload')} উপকরণ শেয়ার করুন</button>`) + Academics.materialsList(DB.s.materials.filter(m => m.teacherId === t.id), true); },
}, 'homework');
const learnerMaterials = who => ({
  id: 'materials', label: 'পাঠ-উপকরণ', icon: 'folder-open', module: 'academics', flag: 'studyMaterials',
  render() {
    const st = who === 'student' ? Student.me() : Guardian.child(); if (!st) return emptyState('কোনো শিক্ষার্থী সংযুক্ত নেই।');
    const subj = App.ui.matSubj || '', list = DB.s.materials.filter(m => m.classId === st.classId && (!subj || m.subjectId === subj));
    return pageHeader('পাঠ-উপকরণ', esc(DB.className(st.classId))) + (who === 'guardian' ? Guardian.switcher() : '')
      + `<div class="mb-4"><select class="select !w-auto" onchange="App.ui.matSubj=this.value;App.refresh()"><option value="">সকল বিষয়</option>${subjectOptions(subj)}</select></div>` + Academics.materialsList(list, false);
  },
});
App.addPage('student', learnerMaterials('student'), 'homework');
App.addPage('guardian', learnerMaterials('guardian'), 'academics');

App.addPage('principal', {
  id: 'promotion', label: 'উন্নয়ন ও স্থানান্তর', icon: 'arrow-up-wide-narrow', module: 'students', flag: 'promotion',
  render() {
    const DEC = { Promote: 'উন্নীত', Retain: 'পুনরাবৃত্তি', Graduate: 'শিক্ষা সমাপ্ত' };   // display labels; stored decisions stay English
    const ptab = Promo.TABS.some(t => t[0] === App.ui.promoTab) ? App.ui.promoTab : 'annual';
    if (ptab !== 'annual') return Promo.page(ptab);
    if (!DB.classesIn().length) return Promo.head('annual') + `<div class="card p-6">${emptyState('এই ক্যাম্পাসে এখনো কোনো শ্রেণি নেই — প্রতিষ্ঠানের সেটিংস → কাঠামো থেকে শ্রেণি যোগ করুন।', 'building-2')}</div>`;
    const ui = App.ui.promo || (App.ui.promo = { cls: DB.classesIn()[0]?.id, exam: (DB.latestExam() || DB.s.exams[0])?.id, minAtt: 60, mode: 'final' });
    if (!DB.classesIn().some(c => c.id === ui.cls)) ui.cls = DB.classesIn()[0]?.id;
    const rows = Academics.promotionRows(ui.cls, ui.exam, +ui.minAtt), next = Academics.nextClass(ui.cls), nses = Promo.nextSession();
    const hist = DB.s.promotions.filter(p => p.counts && DB.campusOf(p.classId) === DB.campusId()).slice(-5).reverse();
    return Promo.head('annual')
      + `<div class="card p-4 mb-4 flex flex-wrap gap-3 items-end"><div><label class="label">কার্যকর হবে</label><select class="select" onchange="App.ui.promo.mode=this.value;App.refresh()"><option value="final" ${ui.mode !== 'provisional' ? 'selected' : ''}>এখনই (চূড়ান্ত)</option><option value="provisional" ${ui.mode === 'provisional' ? 'selected' : ''} ${nses ? '' : 'disabled'}>অস্থায়ী — শিক্ষাবর্ষ ${nses ? esc(U.bn(nses.id)) : '(পরের বছর যোগ করুন)'} শুরু হলে</option></select></div><div><label class="label">শ্রেণি</label><select class="select" onchange="App.ui.promo.cls=this.value;App.refresh()">${classOptions(ui.cls)}</select></div>
        <div><label class="label">বার্ষিক পরীক্ষা</label><select class="select" onchange="App.ui.promo.exam=this.value;App.refresh()">${DB.s.exams.filter(e => e.published).sort((a, b) => b.start.localeCompare(a.start)).map(e => `<option value="${e.id}" ${e.id === ui.exam ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></div>
        <div><label class="label">ন্যূনতম উপস্থিতি %</label><input type="number" class="input !w-24" value="${ui.minAtt}" onchange="App.ui.promo.minAtt=+this.value;App.refresh()"></div>
        <div class="text-sm">→ ${next ? `<b>${esc(DB.className(next))}</b>` : '<b>শিক্ষা সমাপ্তি</b> (সর্বোচ্চ শ্রেণি)'}</div><div class="flex-1"></div>
        <div class="flex gap-1">${['Promote', 'Retain', 'Graduate'].map(d => badge(`${DEC[d]}: ${bnNum(rows.filter(r => r.decision === d).length)}`, { Promote: 'green', Retain: 'red', Graduate: 'violet' }[d])).join('')}</div><button class="btn btn-primary" onclick="Academics.applyPromotion('${ui.cls}')" ${rows.length ? '' : 'disabled'}>${icon('arrow-up-wide-narrow')} ${ui.mode === 'provisional' ? 'অস্থায়ী উন্নয়ন করুন' : 'কার্যকর করুন'}</button></div>
      <div class="card scroll-x"><table class="table"><thead><tr><th>মেধাক্রম</th><th>শিক্ষার্থী</th><th>রোল</th><th>ফলাফল</th><th>উপস্থিতি</th><th>সিদ্ধান্ত</th></tr></thead><tbody>${rows.map((x, i) => `<tr><td>${bnNum(i + 1)}</td><td class="font-semibold">${esc(pn(x.st))} ${Promo.badge(x.st)}</td><td>${bnNum(x.st.roll)}</td><td>${x.r.gpa !== null ? gpaFmt(x.r.gpa) + ' · ' : ''}${esc(x.r.letter)} ${x.r.passed ? '' : badge('অকৃতকার্য', 'red')}</td><td class="${x.att < ui.minAtt ? 'text-red-600 font-semibold' : ''}">${bnNum(x.att.toFixed(1))}%</td>
        <td><select class="select !py-1 !w-36" data-promo="${x.st.id}">${(next ? ['Promote', 'Retain'] : ['Graduate', 'Retain']).map(d => `<option value="${d}" ${d === x.decision ? 'selected' : ''}>${DEC[d]}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>${rows.length ? '' : emptyState('এই শ্রেণিতে কোনো সক্রিয় শিক্ষার্থী নেই।')}</div>
      ${hist.length ? `<div class="card mt-5"><div class="px-5 py-3 border-b border-slate-100 font-semibold">সাম্প্রতিক শ্রেণি উন্নয়ন</div><div class="divide-y divide-slate-100 text-sm">${hist.map(p => `<div class="px-5 py-2.5">${esc(DB.className(p.classId))} → ${p.to ? esc(DB.className(p.to)) : 'শিক্ষা সমাপ্তি'} · ${Object.entries(p.counts).map(([k, v]) => `${DEC[k] || k} ${bnNum(v)}`).join(', ')} <span class="text-xs text-slate-400">${U.fmtTime(p.ts)}</span></div>`).join('')}</div></div>` : ''}`;
  },
}, 'syllabus-monitor');

/* ==========================================================================
   PROVISIONAL (EARLY) PROMOTION · MID-YEAR TRANSFER · CLASS HISTORY
   · Provisional: promote a student into a class of the NEXT session before it
     starts. Until then the student stays in the current class for this
     session's attendance, exams and fees, shows in the next session's class
     list with an "অস্থায়ী" badge and can be billed next-session fees.
     Activating that session (Clone.activate) finalises it automatically;
     "চূড়ান্ত করুন" / "বাতিল করুন" do it by hand.
   · Transfer: class / section / roll change within the current session, at once.
   · st.classHistory = the class a student was in BEFORE each change
     { session, classId, section, roll, kind, date, promotionId }. Results,
     rankings, class averages and old marksheets use the class of the exam's
     time (Promo.classAt), so past marksheets keep the old class.
   Records live in DB.s.promotions with `kind` ('provisional' | 'transfer');
   the annual engine's batch records (with `counts`) share the list.
   ========================================================================== */
Object.assign(BN_LABELS, { Provisional: 'অস্থায়ী', Final: 'চূড়ান্ত', Reverted: 'প্রত্যাহারকৃত', provisional: 'অস্থায়ী উন্নয়ন', transfer: 'শ্রেণি / শাখা পরিবর্তন', annual: 'বার্ষিক উন্নয়ন' });

const Promo = {
  TABS: [['annual', 'বার্ষিক উন্নয়ন', 'arrow-up-wide-narrow'], ['provisional', 'অস্থায়ী উন্নয়ন ও স্থানান্তর', 'hourglass'], ['next', 'পরের শিক্ষাবর্ষের তালিকা', 'list-ordered']],
  STATUS_TONE: { Provisional: 'amber', Final: 'green', Cancelled: 'slate', Reverted: 'red' },
  list() { return DB.s.promotions || (DB.s.promotions = []); },
  recs() { return this.list().filter(p => p.kind === 'provisional' || p.kind === 'transfer'); },
  get(id) { return this.list().find(p => p.id === id); },
  pending(studentId) { return (DB.s.promotions || []).find(p => p.kind === 'provisional' && p.status === 'Provisional' && p.studentId === studentId) || null; },
  nextSession() { const cur = +DB.session(); return (DB.s.sessions || []).filter(s => +s.id > cur).sort((a, b) => +a.id - +b.id)[0] || null; },
  canEdit() { return App.perm('students', 'edit') && (App.has('PRINCIPAL') || App.has('ADMIN')); },
  approvers() { return DB.s.users.filter(u => u.active !== false && DB.roles(u.id).some(r => r === 'PRINCIPAL' || r === 'ADMIN')); },
  who(uid) { const u = DB.user(uid); return u ? pn(u) : '—'; },
  cn(classId, section) { return `${DB.className(classId)}${section ? '-' + section : ''}`; },
  now() { return new Date().toISOString(); },
  badge(st) { const p = st && this.pending(st.id); return p ? badge(`অস্থায়ী → ${this.cn(p.to.classId, p.to.section)} (${U.bn(p.to.session)})`, 'amber') : ''; },

  /* ----- the class a student was in at an exam ----- */
  /** Is a history entry's change AFTER this moment? Annual / provisional changes happen at the end of entry.session, a transfer on entry.date. */
  after(h, S, D) { return +h.session > S || (+h.session === S && (h.kind !== 'transfer' || !D || D < h.date)); },
  /** { classId, section, roll } of a student at an exam (or any { session, start }). */
  classAt(st, ex) {
    const cur = { classId: st.classId, section: st.section, roll: st.roll };
    if (!ex || !st.classHistory?.length) return cur;
    const S = +ex.session, D = ex.start || '';
    const hit = st.classHistory.filter(h => h.classId && !h.reverted).sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))).find(h => this.after(h, S, D));
    return hit ? { classId: hit.classId, section: hit.section || cur.section, roll: hit.roll ?? cur.roll } : cur;
  },
  /** Does any student's history reach back over this exam? (otherwise nothing to adjust) */
  touches(ex) { const S = +ex.session, D = ex.start || ''; return DB.s.students.some(st => st.classHistory?.some(h => h.classId && !h.reverted && this.after(h, S, D))); },
  /** Students who were in a class at an exam — copies carrying the class / section / roll of that time. */
  studentsAt(classId, ex, section) {
    const sat = new Set(DB.s.marks.filter(m => m.examId === ex.id).map(m => m.studentId));
    return DB.s.students.filter(st => st.status === 'active' || sat.has(st.id)).map(st => ({ st, at: this.classAt(st, ex) }))
      .filter(x => x.at.classId === classId && (section == null || section === '' || x.at.section === section))
      .map(x => ({ ...x.st, ...x.at })).sort((a, b) => (a.section > b.section ? 1 : a.section < b.section ? -1 : 0) || a.roll - b.roll);
  },
  /** Run fn with the student placed in another class for the duration of the (synchronous) call; always restored. */
  withClass(st, at, fn) {
    if (!st || !at || (at.classId === st.classId && at.section === st.section && at.roll === st.roll)) return fn();
    const k = [st.classId, st.section, st.roll]; st.classId = at.classId; st.section = at.section; st.roll = at.roll;
    try { return fn(); } finally { [st.classId, st.section, st.roll] = k; }
  },

  /* ----- rolls ----- */
  freeRoll(classId, session, exceptId) {
    const pend = this.list().filter(p => p.kind === 'provisional' && p.status === 'Provisional' && p.to.classId === classId && p.to.session === session && p.studentId !== exceptId).map(p => +p.to.roll || 0);
    const here = DB.studentsIn(classId).filter(s => s.id !== exceptId && (session === DB.session() || !this.pending(s.id))).map(s => +s.roll || 0);
    return Math.max(0, ...(session === DB.session() ? here : [...pend, ...here])) + 1;
  },
  rollTaken(classId, section, roll, exceptId) { return DB.studentsIn(classId, section).some(s => s.id !== exceptId && +s.roll === +roll); },

  /* ----- single student: form (in-page detail) ----- */
  form(studentId, mode) {
    if (!this.canEdit()) return toast('শ্রেণি উন্নয়ন বা পরিবর্তনের অনুমতি শুধু অধ্যক্ষ ও রুট ব্যবহারকারীর।', 'error');
    const st = DB.student(studentId); if (!st) return;
    if (st.status !== 'active') return toast('শুধু সক্রিয় শিক্ষার্থীর শ্রেণি পরিবর্তন করা যায়।', 'error');
    const nses = this.nextSession(), m = mode || (nses ? 'provisional' : 'transfer');
    const w = { mode: m, classId: m === 'provisional' ? (Academics.nextClass(st.classId) || st.classId) : st.classId, approvedBy: this.approvers().some(u => u.id === App.session.userId) ? App.session.userId : '', date: U.today(), reason: '' };
    App.openDetail({ title: `শ্রেণি উন্নয়ন / পরিবর্তন · ${pn(st)}`, render: () => this.formHtml(st, w), mount: () => this.formMount(st, w) });
  },
  formHtml(st, w) {
    const nses = this.nextSession(), prov = w.mode === 'provisional', ses = prov ? nses?.id : DB.session(), c = DB.cls(w.classId) || DB.cls(st.classId);
    const sec = c.sections.includes(w.section) ? w.section : (c.id === st.classId ? st.section : c.sections[0]);
    const roll = w.roll || (c.id === st.classId && sec === st.section && !prov ? st.roll : this.freeRoll(c.id, ses, st.id));
    const pend = this.pending(st.id);
    const opt = (v, l, on, dis) => `<label class="pill cursor-pointer ${on ? 'pill-on' : ''} ${dis ? 'opacity-50' : ''}"><input type="radio" name="mode" value="${v}" class="sr-only" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''}>${l}</label>`;
    return `<form id="promo-form" class="space-y-4 max-w-3xl">
      <div class="card p-4"><div class="font-semibold text-lg">${esc(pn(st))}</div><div class="text-slate-600">বর্তমান: ${esc(this.cn(st.classId, st.section))} · রোল ${bnNum(st.roll)} · শিক্ষাবর্ষ ${esc(U.bn(DB.session()))}</div>${pend ? `<div class="mt-2">${this.badge(st)} <span class="text-slate-600">— নতুন অস্থায়ী উন্নয়ন দিলে আগেরটি বাতিল হবে।</span></div>` : ''}</div>
      <div class="card p-4 space-y-3"><div class="label">ধরন</div><div class="flex flex-wrap gap-2" role="radiogroup">${opt('provisional', `অস্থায়ী উন্নয়ন — পরের শিক্ষাবর্ষে${nses ? ` (${esc(U.bn(nses.id))})` : ''}`, prov, !nses)}${opt('transfer', 'এখনই শ্রেণি / শাখা পরিবর্তন (চলতি শিক্ষাবর্ষ)', !prov)}</div></div>
      <div class="card p-4 grid sm:grid-cols-2 gap-3">
        <div><label class="label" for="pf-cls">${prov ? `শিক্ষাবর্ষ ${esc(U.bn(nses?.id || ''))}-এর শ্রেণি` : 'নতুন শ্রেণি'}</label><select id="pf-cls" class="select" name="classId">${classOptions(c.id, false, 'ALL')}</select></div>
        <div><label class="label" for="pf-sec">শাখা</label><select id="pf-sec" class="select" name="section">${c.sections.map(x => `<option value="${esc(x)}" ${x === sec ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
        <div><label class="label" for="pf-roll">রোল</label><input id="pf-roll" class="input" type="number" min="1" name="roll" value="${esc(roll)}" required></div>
        <div><label class="label" for="pf-date">${prov ? 'সিদ্ধান্তের তারিখ' : 'কার্যকর তারিখ'}</label><input id="pf-date" class="input" type="date" name="date" value="${esc(w.date)}" required></div>
        <div class="sm:col-span-2"><label class="label" for="pf-app">অনুমোদনকারী</label><select id="pf-app" class="select" name="approvedBy" required><option value="">— বেছে নিন —</option>${this.approvers().map(u => `<option value="${u.id}" ${u.id === w.approvedBy ? 'selected' : ''}>${esc(pn(u))} (${esc(DB.roles(u.id).filter(r => r === 'PRINCIPAL' || r === 'ADMIN').map(r => ROLES[r]?.label || bn(r)).join(', '))})</option>`).join('')}</select></div>
        <div class="sm:col-span-2"><label class="label" for="pf-why">কারণ</label><textarea id="pf-why" class="textarea" name="reason" rows="2" required placeholder="যেমন: বার্ষিক পরীক্ষার ফলাফলের ভিত্তিতে আগাম উন্নয়ন / অভিভাবকের আবেদনে শাখা পরিবর্তন">${esc(w.reason)}</textarea></div></div>
      <div class="flex flex-wrap gap-2"><button class="btn btn-primary">${icon('check')} ${prov ? 'অস্থায়ী উন্নয়ন সংরক্ষণ করুন' : 'এখনই কার্যকর করুন'}</button><button type="button" class="btn btn-ghost" onclick="App.closeDetail()">বাতিল</button></div></form>`;
  },
  formMount(st, w) {
    const f = $('#promo-form'); if (!f) return;
    const sync = () => { const d = formData(f); Object.assign(w, { classId: d.classId, section: d.section, roll: d.roll, date: d.date, approvedBy: d.approvedBy, reason: d.reason }); };
    $$('[name=mode]', f).forEach(r => r.addEventListener('change', () => { sync(); w.mode = r.value; w.classId = r.value === 'provisional' ? (Academics.nextClass(st.classId) || st.classId) : st.classId; w.section = null; w.roll = null; App.refresh(); }));
    f.classId.addEventListener('change', () => {
      const c = DB.cls(f.classId.value); if (!c) return;
      f.section.innerHTML = c.sections.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
      f.roll.value = this.freeRoll(c.id, w.mode === 'provisional' ? this.nextSession()?.id : DB.session(), st.id);
    });
    f.addEventListener('submit', e => { e.preventDefault(); sync(); if (this.create(st.id, w)) App.closeDetail(); });
  },
  /** Save a provisional promotion or an immediate transfer. Returns true when saved. */
  create(studentId, d) {
    const st = DB.student(studentId), c = DB.cls(d.classId), nses = this.nextSession(), fail = m => { toast(m, 'error'); return false; };
    if (!this.canEdit()) return fail('শ্রেণি উন্নয়ন বা পরিবর্তনের অনুমতি শুধু অধ্যক্ষ ও রুট ব্যবহারকারীর।');
    if (!st || st.status !== 'active') return fail('শুধু সক্রিয় শিক্ষার্থীর শ্রেণি পরিবর্তন করা যায়।');
    if (!c) return fail('শ্রেণি বেছে নিন।');
    const section = c.sections.includes(d.section) ? d.section : (c.sections[0] || ''), roll = parseInt(U.asciiDigits ? U.asciiDigits(String(d.roll)) : d.roll, 10), reason = String(d.reason || '').trim();
    if (!(roll > 0)) return fail('সঠিক রোল নম্বর লিখুন।');
    if (!reason) return fail('কারণ লিখুন।');
    if (!d.approvedBy || !this.approvers().some(u => u.id === d.approvedBy)) return fail('অনুমোদনকারী বেছে নিন।');
    const from = { session: DB.session(), classId: st.classId, section: st.section, roll: st.roll }, by = App.session.userId, apName = DB.user(d.approvedBy)?.username || d.approvedBy;
    if (d.mode === 'provisional') {
      if (!nses) return fail('পরের শিক্ষাবর্ষ যোগ করা হয়নি — প্রতিষ্ঠানের সেটিংস → কাঠামো থেকে যোগ করুন।');
      if (this.list().some(p => p.kind === 'provisional' && p.status === 'Provisional' && p.studentId !== st.id && p.to.session === nses.id && p.to.classId === c.id && p.to.section === section && +p.to.roll === roll)) return fail(`${this.cn(c.id, section)}-এ রোল ${bnNum(roll)} আগেই অস্থায়ীভাবে অন্য শিক্ষার্থীকে দেওয়া হয়েছে।`);
      this.dropPending(st, 'নতুন অস্থায়ী উন্নয়ন দিয়ে প্রতিস্থাপিত');
      const p = { id: DB.id('PRV'), kind: 'provisional', studentId: st.id, status: 'Provisional', from, to: { session: nses.id, classId: c.id, section, roll }, reason, approvedBy: d.approvedBy, approvedOn: d.date || U.today(), by, ts: this.now() };
      this.list().push(p);
      DB.audit('PROMOTION_PROVISIONAL', 'students', `${st.id} ${pn(st)}: ${from.classId}-${from.section} রোল ${from.roll} → ${c.id}-${section} রোল ${roll}, শিক্ষাবর্ষ ${nses.id} (অস্থায়ী ${p.id}) · অনুমোদন: ${apName} · কারণ: ${reason}`);
      DB.save(); toast(`${pn(st)} অস্থায়ীভাবে ${this.cn(c.id, section)}-এ উন্নীত — শিক্ষাবর্ষ ${U.bn(nses.id)} সক্রিয় হলে চূড়ান্ত হবে।`, 'success');
      return true;
    }
    if (c.id === st.classId && section === st.section && roll === +st.roll) return fail('নতুন শ্রেণি, শাখা ও রোল বর্তমানটির মতোই।');
    if (this.rollTaken(c.id, section, roll, st.id)) return fail(`${this.cn(c.id, section)}-এ রোল ${bnNum(roll)} আগে থেকেই আছে।`);
    const date = d.date || U.today(), p = { id: DB.id('TRF'), kind: 'transfer', studentId: st.id, status: 'Final', from, to: { session: DB.session(), classId: c.id, section, roll }, reason, approvedBy: d.approvedBy, approvedOn: date, effective: date, by, ts: this.now(), finalizedAt: this.now(), finalizedBy: by };
    (st.classHistory = st.classHistory || []).push({ session: DB.session(), classId: from.classId, section: from.section, roll: from.roll, kind: 'transfer', decision: 'Transfer', promotionId: p.id, date });
    Object.assign(st, { classId: c.id, section, roll });
    this.list().push(p);
    DB.audit('CLASS_TRANSFER', 'students', `${st.id} ${pn(st)}: ${from.classId}-${from.section} রোল ${from.roll} → ${c.id}-${section} রোল ${roll}, কার্যকর ${date} (${p.id}) · অনুমোদন: ${apName} · কারণ: ${reason}`);
    DB.save(); toast(`${pn(st)} এখন ${this.cn(c.id, section)}, রোল ${bnNum(roll)}।`, 'success');
    return true;
  },
  /** Cancel a student's pending provisional promotion (used when it is replaced or the annual promotion runs). */
  dropPending(st, why) {
    const p = this.pending(st.id); if (!p) return;
    Object.assign(p, { status: 'Cancelled', cancelledAt: this.now(), cancelledBy: App.session?.userId || null, cancelReason: why });
    DB.audit('PROMOTION_PROVISIONAL_CANCEL', 'students', `${st.id} ${pn(st)}: অস্থায়ী উন্নয়ন ${p.id} বাতিল — ${why}`);
  },

  /* ----- bulk provisional (from the annual tab in "অস্থায়ী" mode) ----- */
  bulkProvisional(classId, next, students, ui) {
    const nses = this.nextSession();
    if (!this.canEdit()) return toast('শ্রেণি উন্নয়নের অনুমতি শুধু অধ্যক্ষ ও রুট ব্যবহারকারীর।', 'error');
    if (!nses) return toast('পরের শিক্ষাবর্ষ যোগ করা হয়নি — প্রতিষ্ঠানের সেটিংস → কাঠামো থেকে যোগ করুন।', 'error');
    if (!next) return toast('এটি সর্বোচ্চ শ্রেণি — অস্থায়ী উন্নয়ন প্রযোজ্য নয়।', 'warn');
    if (!students.length) return toast('“উন্নীত” সিদ্ধান্তের কোনো শিক্ষার্থী নেই।', 'warn');
    const reason = prompt(`${bnNum(students.length)} জন শিক্ষার্থীকে শিক্ষাবর্ষ ${U.bn(nses.id)}-এর ${DB.className(next)}-এ অস্থায়ীভাবে উন্নীত করা হবে (মেধাক্রম অনুযায়ী রোল)।\nতারা এ বছর বর্তমান শ্রেণিতেই থাকবে; নতুন শিক্ষাবর্ষ সক্রিয় হলে চূড়ান্ত হবে।\n\nকারণ:`, `${DB.exam(ui.exam)?.name || 'বার্ষিক পরীক্ষা'}-এর ফলাফলের ভিত্তিতে আগাম উন্নয়ন`);
    if (reason === null) return;
    if (!reason.trim()) return toast('কারণ লিখুন।', 'error');
    const c = DB.cls(next), by = App.session.userId, approver = this.approvers().some(u => u.id === by) ? by : this.approvers()[0]?.id;
    let n = 0;
    students.forEach(st => {
      const old = this.pending(st.id); if (old && old.to.classId === next && old.to.session === nses.id) return;
      this.dropPending(st, 'নতুন অস্থায়ী উন্নয়ন দিয়ে প্রতিস্থাপিত');
      const roll = this.freeRoll(next, nses.id, st.id), p = { id: DB.id('PRV'), kind: 'provisional', studentId: st.id, status: 'Provisional', from: { session: DB.session(), classId: st.classId, section: st.section, roll: st.roll }, to: { session: nses.id, classId: next, section: c.sections[0], roll }, reason: reason.trim(), approvedBy: approver, approvedOn: U.today(), by, ts: this.now(), exam: ui.exam || null };
      this.list().push(p); n++;
      DB.audit('PROMOTION_PROVISIONAL', 'students', `${st.id} ${pn(st)}: ${st.classId}-${st.section} → ${next}-${c.sections[0]} রোল ${roll}, শিক্ষাবর্ষ ${nses.id} (অস্থায়ী ${p.id}, একযোগে) · কারণ: ${reason.trim()}`);
    });
    DB.audit('PROMOTION_PROVISIONAL_BATCH', 'students', `${classId} → ${next} (শিক্ষাবর্ষ ${nses.id}): ${n} জন অস্থায়ীভাবে উন্নীত`); DB.save();
    toast(`${bnNum(n)} জন শিক্ষার্থী অস্থায়ীভাবে ${DB.className(next)}-এ উন্নীত (শিক্ষাবর্ষ ${U.bn(nses.id)})।`, 'success'); App.refresh();
  },

  /* ----- finalise / cancel / revert ----- */
  finalize(id, auto) {
    const p = this.get(id); if (!p || p.kind !== 'provisional' || p.status !== 'Provisional') return false;
    const st = DB.student(p.studentId), c = DB.cls(p.to.classId), by = App.session?.userId || null;
    const stop = why => { Object.assign(p, { status: 'Cancelled', cancelledAt: this.now(), cancelledBy: by, cancelReason: why }); DB.audit('PROMOTION_PROVISIONAL_CANCEL', 'students', `${p.studentId}: অস্থায়ী উন্নয়ন ${p.id} বাতিল — ${why}`); return false; };
    if (!st || st.status !== 'active') return stop('শিক্ষার্থী আর সক্রিয় নেই');
    if (!c) return stop('লক্ষ্য শ্রেণিটি আর নেই');
    const section = c.sections.includes(p.to.section) ? p.to.section : c.sections[0];
    let roll = +p.to.roll, note = '';
    if (this.rollTaken(c.id, section, roll, st.id)) { roll = this.freeRoll(c.id, DB.session(), st.id); note = ` (রোল ${p.to.roll} আগে থেকে থাকায় নতুন রোল ${roll})`; }
    const old = `${st.classId}-${st.section} রোল ${st.roll}`;
    (st.classHistory = st.classHistory || []).push({ session: p.from.session, classId: st.classId, section: st.section, roll: st.roll, kind: 'provisional', decision: 'Promote', promotionId: p.id, date: U.today() });
    Object.assign(st, { classId: c.id, section, roll });
    Object.assign(p, { status: 'Final', finalizedAt: this.now(), finalizedBy: by, auto: !!auto, to: { ...p.to, section, roll } });
    DB.guardiansOf(st.id).forEach(g => DB.sms(g.phone, `${DB.s.school.shortName}: অভিনন্দন! ${pn(st)} ${DB.className(c.id)}-এ উন্নীত হয়েছে, রোল ${bnNum(roll)}।`));
    DB.audit('PROMOTION_FINALIZE', 'students', `${st.id} ${pn(st)}: ${old} → ${c.id}-${section} রোল ${roll} (${p.id})${auto ? ' — শিক্ষাবর্ষ সক্রিয় হওয়ায় স্বয়ংক্রিয়' : ''}${note}`);
    return true;
  },
  /** Finalise every provisional promotion whose session has started. Returns how many moved. */
  finalizeDue(auto) {
    const ses = +DB.session(), due = (DB.s.promotions || []).filter(p => p.kind === 'provisional' && p.status === 'Provisional' && +p.to.session <= ses);
    if (!due.length) return 0;
    const n = due.filter(p => this.finalize(p.id, auto)).length;
    DB.audit('PROMOTION_FINALIZE_BATCH', 'students', `শিক্ষাবর্ষ ${DB.session()}: ${n} জনের অস্থায়ী উন্নয়ন চূড়ান্ত${due.length - n ? `, ${due.length - n}টি বাতিল` : ''}`); DB.save();
    return n;
  },
  finalizeOne(id) {
    const p = this.get(id), st = p && DB.student(p.studentId); if (!p || !st) return;
    if (!this.canEdit()) return toast('অনুমতি নেই।', 'error');
    if (!confirm(`${pn(st)}-কে এখনই ${this.cn(p.to.classId, p.to.section)}-এ (রোল ${bnNum(p.to.roll)}) সরানো হবে।${+p.to.session > +DB.session() ? `\n\nসতর্কতা: শিক্ষাবর্ষ ${U.bn(p.to.session)} এখনো শুরু হয়নি — এ বছরের বাকি হাজিরা, পরীক্ষা ও ফি নতুন শ্রেণিতে যাবে।` : ''}\n\nচূড়ান্ত করবেন?`)) return;
    const ok = this.finalize(id, false); DB.save();
    toast(ok ? `${pn(st)}-এর শ্রেণি উন্নয়ন চূড়ান্ত হয়েছে।` : 'চূড়ান্ত করা যায়নি — রেকর্ডটি বাতিল হয়েছে।', ok ? 'success' : 'warn'); App.refresh();
  },
  finalizeAll() {
    const due = (DB.s.promotions || []).filter(p => p.kind === 'provisional' && p.status === 'Provisional' && +p.to.session <= +DB.session());
    if (!this.canEdit() || !due.length || !confirm(`${bnNum(due.length)}টি অস্থায়ী উন্নয়ন চূড়ান্ত করবেন?`)) return;
    const n = this.finalizeDue(false); toast(`${bnNum(n)} জনের শ্রেণি উন্নয়ন চূড়ান্ত হয়েছে।`, 'success'); App.refresh();
  },
  cancel(id) {
    const p = this.get(id), st = p && DB.student(p.studentId); if (!p || p.status !== 'Provisional') return;
    if (!this.canEdit()) return toast('অনুমতি নেই।', 'error');
    const why = prompt(`${pn(st)}-এর অস্থায়ী উন্নয়ন (${this.cn(p.to.classId, p.to.section)}, শিক্ষাবর্ষ ${U.bn(p.to.session)}) বাতিল করবেন?\nরেকর্ডটি ইতিহাসে থাকবে। কারণ:`); if (why === null) return;
    if (!why.trim()) return toast('কারণ লিখুন।', 'error');
    Object.assign(p, { status: 'Cancelled', cancelledAt: this.now(), cancelledBy: App.session.userId, cancelReason: why.trim() });
    const bills = DB.s.invoices.filter(i => i.promotionId === p.id && i.status === 'unpaid');
    DB.audit('PROMOTION_PROVISIONAL_CANCEL', 'students', `${p.studentId} ${pn(st)}: অস্থায়ী উন্নয়ন ${p.id} বাতিল — ${why.trim()}${bills.length ? ` · ${bills.length}টি অগ্রিম বিল অপরিশোধিত রয়ে গেছে` : ''}`); DB.save();
    toast(`অস্থায়ী উন্নয়ন বাতিল হয়েছে।${bills.length ? ` পরের শিক্ষাবর্ষের ${bnNum(bills.length)}টি অপরিশোধিত বিল রয়ে গেছে — প্রয়োজনে প্রোফাইলের “ফি পরিবর্তন” থেকে মওকুফ করুন।` : ''}`, bills.length ? 'warn' : 'success'); App.refresh();
  },
  /** Undo a finalised promotion / transfer: back to the old class (history kept: a dated entry records the time spent in the other class). */
  revert(id) {
    const p = this.get(id), st = p && DB.student(p.studentId); if (!p || p.status !== 'Final' || !st) return;
    if (!this.canEdit()) return toast('অনুমতি নেই।', 'error');
    if (st.classId !== p.to.classId) return toast(`${pn(st)} এখন ${DB.className(st.classId)}-এ — এই রেকর্ডটি আর ফেরানো যায় না।`, 'error');
    const why = prompt(`${pn(st)}-কে আবার ${this.cn(p.from.classId, p.from.section)}-এ (রোল ${bnNum(p.from.roll)}) ফেরানো হবে। ইতিহাস রাখা হবে।\nকারণ:`); if (why === null) return;
    if (!why.trim()) return toast('কারণ লিখুন।', 'error');
    const c = DB.cls(p.from.classId); if (!c) return toast('আগের শ্রেণিটি আর নেই।', 'error');
    const section = c.sections.includes(p.from.section) ? p.from.section : c.sections[0];
    let roll = +p.from.roll; if (this.rollTaken(c.id, section, roll, st.id)) roll = this.freeRoll(c.id, DB.session(), st.id);
    (st.classHistory = st.classHistory || []).push({ session: DB.session(), classId: st.classId, section: st.section, roll: st.roll, kind: 'transfer', decision: 'Revert', promotionId: p.id, date: U.today() });
    Object.assign(st, { classId: c.id, section, roll });
    Object.assign(p, { status: 'Reverted', revertedAt: this.now(), revertedBy: App.session.userId, revertReason: why.trim() });
    DB.audit('PROMOTION_REVERT', 'students', `${st.id} ${pn(st)}: ${p.id} প্রত্যাহার — ${p.to.classId}-${p.to.section} → ${c.id}-${section} রোল ${roll} · কারণ: ${why.trim()}`); DB.save();
    toast(`${pn(st)} আবার ${this.cn(c.id, section)}-এ।`, 'success'); App.refresh();
  },

  /* ----- next-session class list & advance billing ----- */
  roster(classId, session) {
    return (DB.s.promotions || []).filter(p => p.kind === 'provisional' && p.status === 'Provisional' && p.to.classId === classId && p.to.session === session)
      .map(p => ({ p, st: DB.student(p.studentId) })).filter(x => x.st).sort((a, b) => (a.p.to.section > b.p.to.section ? 1 : a.p.to.section < b.p.to.section ? -1 : 0) || a.p.to.roll - b.p.to.roll);
  },
  amountNext(hid, classId, session) {
    const f = DB.fees(classId, session);
    if (hid === 'FH-TUI') return f.tuition; if (hid === 'FH-EXM') return f.examFee; if (hid === 'FH-ADM') return f.admissionFee;
    const o = DB.s.feeStructure.find(x => x.session === session && x.classId === classId && x.headId === hid) || DB.s.feeStructure.find(x => x.session === DB.session() && x.classId === classId && x.headId === hid);
    return o ? o.amount : (Fees.head(hid)?.amount || 0);
  },
  billNext() {
    const f = $('#promo-bill'); if (!f) return;
    if (!App.perm('fees', 'edit')) return toast('ফি বিল প্রস্তুতের অনুমতি নেই।', 'error');
    const nses = this.nextSession(), classId = App.ui.promoNext, month = f.month.value, heads = $$('input[name=head]:checked', f).map(x => x.value);
    if (!nses || !classId || !month || !heads.length) return toast('মাস ও অন্তত একটি ফি খাত বেছে নিন।', 'error');
    const list = this.roster(classId, nses.id); if (!list.length) return toast('এই শ্রেণিতে কোনো অস্থায়ী শিক্ষার্থী নেই।', 'warn');
    if (!confirm(`${DB.className(classId)} (শিক্ষাবর্ষ ${U.bn(nses.id)})-এর ${bnNum(list.length)} জন অস্থায়ী শিক্ষার্থীর জন্য ${U.monthName(month)} মাসের অগ্রিম বিল প্রস্তুত করবেন?`)) return;
    let n = 0, total = 0;
    list.forEach(({ p, st }) => heads.forEach(hid => {
      const h = Fees.head(hid); if (!h) return;
      if (h.optIn && !(st.optHeads || []).includes(hid)) return;
      const tag = `${hid}|${month}`;
      if (DB.s.invoices.some(i => i.studentId === st.id && (i.tag === tag || (hid === 'FH-TUI' && i.kind === 'tuition' && i.month === month)))) return;
      let amt = this.amountNext(hid, classId, nses.id); if (hid === 'FH-TUI' && st.scholarshipPct) amt = Math.round(amt * (1 - st.scholarshipPct / 100));
      const inv = DB.bill(st.id, { item: `${h.name} — ${U.monthName(month)} (শিক্ষাবর্ষ ${U.bn(nses.id)}, ${DB.className(classId)})`, amount: amt, due: `${month}-10`, kind: hid === 'FH-TUI' ? 'tuition' : hid === 'FH-EXM' ? 'exam' : hid === 'FH-ADM' ? 'admission' : 'other', incomeAcct: h.account, month, by: App.session.userId });
      if (inv) { Object.assign(inv, { tag, headId: hid, session: nses.id, promotionId: p.id }); n++; total += inv.amount; }
    }));
    DB.audit('BULK_BILLING_NEXT', 'invoices', `${classId} শিক্ষাবর্ষ ${nses.id} (অস্থায়ী উন্নীত) ${month}: ${n}টি বিল, ${total} টাকা (${heads.join(', ')})`); DB.save();
    toast(n ? `${bnNum(n)}টি অগ্রিম বিল · ${U.money(total)}` : 'নতুন কোনো বিল হয়নি — এগুলো আগেই করা আছে অথবা পরিমাণ শূন্য।', n ? 'success' : 'warn'); App.refresh();
  },

  /* ----- page parts ----- */
  head(tab) {
    if (typeof Help !== 'undefined' && !Help.T.promotion) Help.add('promotion', 'শ্রেণি উন্নয়ন', `<p><b>বার্ষিক উন্নয়ন:</b> ফলাফল ও উপস্থিতি দেখে পুরো শ্রেণিকে একসঙ্গে উন্নীত করুন — “এখনই” অথবা “অস্থায়ী” (পরের শিক্ষাবর্ষ শুরু হলে কার্যকর)।</p>
      <p><b>অস্থায়ী উন্নয়ন:</b> শিক্ষার্থী এ বছরের হাজিরা, পরীক্ষা ও ফির জন্য বর্তমান শ্রেণিতেই থাকে; পরের শিক্ষাবর্ষের তালিকায় “অস্থায়ী” চিহ্নসহ দেখা যায় এবং সেই বছরের অগ্রিম বিল করা যায়। “কপি ও আমদানি” থেকে নতুন শিক্ষাবর্ষ সক্রিয় করলে নিজে থেকেই চূড়ান্ত হয়।</p>
      <p><b>এখনই শ্রেণি / শাখা পরিবর্তন:</b> বছরের মাঝখানে শ্রেণি, শাখা বা রোল বদলায়। আগের পরীক্ষার নম্বরপত্রে পুরোনো শ্রেণিই থাকে।</p><p>প্রতিটি কাজ অডিট লগে লেখা থাকে; বাতিল বা প্রত্যাহার করলেও ইতিহাস মুছে যায় না।</p>`);
    return pageHeader('উন্নয়ন ও স্থানান্তর', '',typeof Help !== 'undefined' ? Help.btn('promotion') : '')
      + pills(this.TABS, tab, id => `App.ui.promoTab='${id}';App.refresh()`);
  },
  page(tab) { return this.head(tab) + (tab === 'next' ? this.nextHtml() : this.recsHtml()); },
  recRow(p) {
    const st = DB.student(p.studentId), can = this.canEdit();
    const acts = !can ? '' : p.status === 'Provisional' ? `<button class="btn btn-success btn-sm" onclick="Promo.finalizeOne('${p.id}')">${icon('check')} চূড়ান্ত করুন</button><button class="btn btn-ghost btn-sm" onclick="Promo.cancel('${p.id}')">${icon('x')} বাতিল করুন</button>`
      : p.status === 'Final' ? `<button class="btn btn-ghost btn-sm" onclick="Promo.revert('${p.id}')">${icon('undo-2')} প্রত্যাহার</button>` : '';
    const meta = [p.reason ? esc(p.reason) : '', `অনুমোদন: ${esc(this.who(p.approvedBy))}, ${U.fmtDate(p.approvedOn)}`, p.status === 'Final' && p.finalizedAt ? `চূড়ান্ত ${U.fmtDate(p.finalizedAt.slice(0, 10))}${p.auto ? ' (স্বয়ংক্রিয়)' : ''}` : '', p.cancelReason ? `বাতিলের কারণ: ${esc(p.cancelReason)}` : '', p.revertReason ? `প্রত্যাহারের কারণ: ${esc(p.revertReason)}` : ''].filter(Boolean).join(' · ');
    return `<tr><td>${st ? `<button class="font-semibold hover:underline text-left" onclick="Dossier.open('${st.id}','history')">${esc(pn(st))}</button><div class="text-slate-500">${esc(st.id)}</div>` : esc(p.studentId)}</td><td>${esc(bn(p.kind))}</td>
      <td class="whitespace-nowrap">${esc(this.cn(p.from.classId, p.from.section))} · রোল ${bnNum(p.from.roll)}<div class="text-slate-500">শিক্ষাবর্ষ ${esc(U.bn(p.from.session))}</div></td>
      <td class="whitespace-nowrap">${esc(this.cn(p.to.classId, p.to.section))} · রোল ${bnNum(p.to.roll)}<div class="text-slate-500">শিক্ষাবর্ষ ${esc(U.bn(p.to.session))}</div></td>
      <td>${badge(bn(p.status), this.STATUS_TONE[p.status])}</td><td class="min-w-[14rem]">${meta}</td><td><div class="flex flex-wrap gap-1">${acts}</div></td></tr>`;
  },
  recsHtml() {
    const flt = App.ui.promoFlt || 'Provisional', cp = DB.campusId(), nses = this.nextSession();
    const mine = this.recs().filter(p => DB.campusOf(p.from.classId) === cp || DB.campusOf(p.to.classId) === cp);
    const list = mine.filter(p => flt === 'all' || p.status === flt).sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    const due = mine.filter(p => p.kind === 'provisional' && p.status === 'Provisional' && +p.to.session <= +DB.session());
    const cnt = s => mine.filter(p => s === 'all' || p.status === s).length;
    return `${this.canEdit() ? `<div class="card p-4 mb-4"><div class="font-semibold mb-3">একজন শিক্ষার্থী</div><div class="max-w-xl">${studentPicker('promoSt', '', { campus: cp, onPick: 'if(id)Promo.form(id)' })}</div></div>` : ''}
      ${due.length ? `<div class="card p-4 mb-4 bg-amber-50 border-amber-200 flex flex-wrap items-center gap-3"><span class="flex-1 min-w-[12rem]">${icon('triangle-alert', 'w-4 h-4 inline -mt-1 text-amber-600')} ${bnNum(due.length)}টি অস্থায়ী উন্নয়নের শিক্ষাবর্ষ শুরু হয়ে গেছে, কিন্তু এখনো চূড়ান্ত হয়নি।</span>${this.canEdit() ? `<button class="btn btn-primary btn-sm" onclick="Promo.finalizeAll()">${icon('check-check')} সব চূড়ান্ত করুন</button>` : ''}</div>` : ''}
      ${pills([['Provisional', `অস্থায়ী (${bnNum(cnt('Provisional'))})`], ['Final', `চূড়ান্ত (${bnNum(cnt('Final'))})`], ['Cancelled', `বাতিল (${bnNum(cnt('Cancelled'))})`], ['Reverted', `প্রত্যাহারকৃত (${bnNum(cnt('Reverted'))})`], ['all', `সব (${bnNum(cnt('all'))})`]], flt, id => `App.ui.promoFlt='${id}';App.refresh()`)}
      <div class="card scroll-x"><table class="table"><thead><tr><th>শিক্ষার্থী</th><th>ধরন</th><th>আগে</th><th>পরে</th><th>অবস্থা</th><th>বিবরণ</th><th></th></tr></thead><tbody>${list.map(p => this.recRow(p)).join('')}</tbody></table>${list.length ? '' : emptyState('এই তালিকায় কিছু নেই।', 'hourglass')}</div>`;
  },
  nextHtml() {
    const nses = this.nextSession();
    if (!nses) return `<div class="card p-6">${emptyState('পরের শিক্ষাবর্ষ এখনো যোগ করা হয়নি। প্রতিষ্ঠানের সেটিংস → ক্যাম্পাস, শ্রেণি ও স্তর → “শিক্ষাবর্ষ যোগ করুন”।', 'calendar-plus')}</div>`;
    const classes = DB.classesIn(); if (!classes.length) return `<div class="card p-6">${emptyState('এই ক্যাম্পাসে কোনো শ্রেণি নেই।', 'building-2')}</div>`;
    const counts = Object.fromEntries(classes.map(c => [c.id, this.roster(c.id, nses.id).length]));
    const cur = classes.some(c => c.id === App.ui.promoNext) ? App.ui.promoNext : (classes.find(c => counts[c.id]) || classes[0]).id;
    App.ui.promoNext = cur;
    const list = this.roster(cur, nses.id), canBill = App.perm('fees', 'edit') && typeof Fees !== 'undefined';
    const heads = canBill ? DB.s.feeHeads.filter(h => !['FH-TRN', 'FH-HST', 'FH-LATE'].includes(h.id)) : [];
    return `<div class="card p-4 mb-4 flex flex-wrap items-end gap-3"><div><label class="label" for="pn-cls">শিক্ষাবর্ষ ${esc(U.bn(nses.id))}-এর শ্রেণি</label><select id="pn-cls" class="select" onchange="App.ui.promoNext=this.value;App.refresh()">${classes.map(c => `<option value="${c.id}" ${c.id === cur ? 'selected' : ''}>${esc(c.name)} (${bnNum(counts[c.id])})</option>`).join('')}</select></div></div>
      <div class="card scroll-x mb-5"><div class="px-5 py-3 border-b border-slate-100 font-semibold">${esc(DB.className(cur))} · শিক্ষাবর্ষ ${esc(U.bn(nses.id))} <span class="font-normal text-slate-500">— ${bnNum(list.length)} জন</span></div><table class="table"><thead><tr><th>শাখা</th><th>রোল</th><th>শিক্ষার্থী</th><th>এ বছরের শ্রেণি</th><th>অবস্থা</th><th>অগ্রিম বিল</th></tr></thead><tbody>
        ${list.map(({ p, st }) => { const inv = DB.s.invoices.filter(i => i.promotionId === p.id); return `<tr><td>${esc(p.to.section)}</td><td>${bnNum(p.to.roll)}</td><td><button class="font-semibold hover:underline text-left" onclick="Dossier.open('${st.id}','history')">${esc(pn(st))}</button></td><td>${esc(this.cn(st.classId, st.section))} · রোল ${bnNum(st.roll)}</td><td>${badge('অস্থায়ী', 'amber')}</td><td>${inv.length ? `${bnNum(inv.length)}টি · ${U.money(U.sum(inv, i => i.amount))}` : '—'}</td></tr>`; }).join('')}</tbody></table>${list.length ? '' : emptyState('এই শ্রেণিতে এখনো কেউ অস্থায়ীভাবে উন্নীত হয়নি।', 'list-ordered')}</div>
      ${canBill && list.length ? `<form id="promo-bill" class="card p-5 space-y-4 max-w-3xl" onsubmit="Promo.billNext();return false"><div class="font-semibold text-lg">শিক্ষাবর্ষ ${esc(U.bn(nses.id))}-এর অগ্রিম বিল</div>        <div class="grid sm:grid-cols-2 gap-3"><div><label class="label" for="pb-m">বিলের মাস</label><input id="pb-m" type="month" class="input" name="month" value="${esc(nses.id)}-01" required></div></div>
        <div><div class="label">ফি খাত</div><div class="grid sm:grid-cols-2 gap-2">${heads.map(h => `<label class="flex items-center gap-2 card p-2"><input type="checkbox" name="head" value="${h.id}" ${h.id === 'FH-TUI' ? 'checked' : ''}> ${esc(h.name)} <span class="ml-auto text-slate-500">${U.money(this.amountNext(h.id, cur, nses.id))}</span></label>`).join('')}</div></div>
        <button class="btn btn-primary">${icon('files')} অগ্রিম বিল প্রস্তুত করুন</button></form>` : ''}`;
  },

  /* ----- student profile (dossier) block ----- */
  dossierBlock() {
    const host = $('#dossier'), st = host && DB.student(Dossier.sid); if (!st || !host.firstElementChild) return;
    const ro = Dossier.ro?.(), p = this.pending(st.id), can = !ro && this.canEdit() && st.status === 'active';
    const recs = this.recs().filter(x => x.studentId === st.id).sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    const hist = (st.classHistory || []).filter(h => h.classId);
    if (ro && !p && !recs.length) return;
    const line = x => `<li class="py-1.5">${badge(bn(x.status), this.STATUS_TONE[x.status])} ${esc(bn(x.kind))}: ${esc(this.cn(x.from.classId, x.from.section))} → ${esc(this.cn(x.to.classId, x.to.section))} · রোল ${bnNum(x.to.roll)} · শিক্ষাবর্ষ ${esc(U.bn(x.to.session))} <span class="text-slate-500">(${U.fmtDate(x.approvedOn)}${x.reason ? ' · ' + esc(x.reason) : ''})</span>${can && x.status === 'Final' && st.classId === x.to.classId ? ` <button class="btn btn-ghost btn-sm" onclick="Promo.revert('${x.id}')">${icon('undo-2')} প্রত্যাহার</button>` : ''}</li>`;
    const html = `<section class="card p-4 mb-4" aria-label="শ্রেণি উন্নয়ন ও পরিবর্তন"><div class="flex flex-wrap items-center gap-2"><div class="font-semibold flex-1 min-w-[12rem]">${icon('arrow-up-wide-narrow', 'w-4 h-4 inline -mt-1 text-brand-600')} শ্রেণি উন্নয়ন ও পরিবর্তন</div>
        ${can ? `<button class="btn btn-primary btn-sm" onclick="Promo.form('${st.id}')">${icon('arrow-up-right')} উন্নয়ন / শ্রেণি পরিবর্তন</button>` : ''}
        ${can && p ? `<button class="btn btn-success btn-sm" onclick="Promo.finalizeOne('${p.id}')">${icon('check')} চূড়ান্ত করুন</button><button class="btn btn-ghost btn-sm" onclick="Promo.cancel('${p.id}')">${icon('x')} বাতিল করুন</button>` : ''}</div>
      ${p ? `<p class="mt-2">${badge('অস্থায়ী', 'amber')} শিক্ষাবর্ষ ${esc(U.bn(p.to.session))}-এ <b>${esc(this.cn(p.to.classId, p.to.section))}</b>, রোল ${bnNum(p.to.roll)} — অনুমোদন: ${esc(this.who(p.approvedBy))}, ${U.fmtDate(p.approvedOn)}</p>` : ''}
      ${recs.length || hist.length ? `<details class="mt-2"><summary class="cursor-pointer text-brand-700 font-semibold">ইতিহাস (${bnNum(recs.length + hist.filter(h => !h.promotionId).length)})</summary><ul class="mt-2 divide-y divide-slate-100">${recs.map(line).join('')}
        ${hist.filter(h => !h.promotionId).map(h => `<li class="py-1.5">${esc(bn(h.kind || 'annual'))}: শিক্ষাবর্ষ ${esc(U.bn(h.session))}-এ ${esc(this.cn(h.classId, h.section))} · রোল ${bnNum(h.roll)}${h.decision ? ` · ${esc({ Promote: 'উন্নীত', Retain: 'পুনরাবৃত্তি', Graduate: 'শিক্ষা সমাপ্ত' }[h.decision] || h.decision)}` : ''} <span class="text-slate-500">(${U.fmtDate(h.date)})</span></li>`).join('')}</ul></details>` : ''}</section>`;
    host.firstElementChild.insertAdjacentHTML('afterend', html); App.icons();
  },
};

/* Student profile: the promotion block under the header. */
if (typeof Dossier !== 'undefined') { const dr0 = Dossier.render; Dossier.render = function () { dr0.apply(this, arguments); try { Promo.dossierBlock(); } catch (e) { console.error(e); } }; }
/* Activating a session (Copy & import page) finalises the provisional promotions into it. */
if (typeof Clone !== 'undefined') {
  const a0 = Clone.activate;
  Clone.activate = function (ses) {
    const before = DB.session(); a0.call(this, ses);
    if (DB.session() === before) return;
    const n = Promo.finalizeDue(true);
    if (n) { toast(`শিক্ষাবর্ষ ${U.bn(DB.session())} সক্রিয় · ${bnNum(n)} জন শিক্ষার্থীর অস্থায়ী শ্রেণি উন্নয়ন চূড়ান্ত হয়েছে।`, 'success'); App.render(); }
  };
}
/* Results, rankings, class averages and marksheets use the class of the exam's time.
   Installed at start-up so these wrap every module's own version (exam centre etc.). */
(() => {
  const b0 = App.boot;
  App.boot = function () {
    const r0 = DB.result;
    DB.result = function (studentId, examId) {
      const st = this.student(studentId), ex = st?.classHistory?.length && this.exam(examId);
      return ex ? Promo.withClass(st, Promo.classAt(st, ex), () => r0.call(this, studentId, examId)) : r0.call(this, studentId, examId);
    };
    ['examRanking', 'classAverage'].forEach(fn => {
      const f0 = DB[fn]; if (typeof f0 !== 'function') return;
      DB[fn] = function (examId, classId, ...rest) {
        const ex = this.exam(examId); if (!ex || !Promo.touches(ex)) return f0.call(this, examId, classId, ...rest);
        const si = this.studentsIn;
        this.studentsIn = function (cid, sec) { return cid === classId ? Promo.studentsAt(cid, ex, sec) : si.call(this, cid, sec); };
        try { return f0.call(this, examId, classId, ...rest); } finally { this.studentsIn = si; }
      };
    });
    if (typeof Print !== 'undefined' && Print.marksheet) { const m0 = Print.marksheet; Print.marksheet = function (st, examId) { const ex = DB.exam(examId); return m0.call(this, st && ex ? { ...st, ...Promo.classAt(st, ex) } : st, examId); }; }
    if (typeof PrintStudio !== 'undefined' && PrintStudio.gen?.transcript) { const t0 = PrintStudio.gen.transcript; PrintStudio.gen.transcript = function (st, session = DB.session(), opts) { return t0.call(this, st ? { ...st, ...Promo.classAt(st, { session, start: '9999-12-31' }) } : st, session, opts); }; }
    const out = b0.apply(this, arguments);
    // a session activated elsewhere (another device / restore): finalise what is due when the Root User or Principal opens the app
    try { if (App.session && (App.has('ADMIN') || App.has('PRINCIPAL')) && App.perm('students', 'edit')) { const n = Promo.finalizeDue(true); if (n) toast(`${bnNum(n)} জন শিক্ষার্থীর অস্থায়ী শ্রেণি উন্নয়ন চূড়ান্ত হয়েছে।`, 'success'); } } catch (e) { console.error(e); }
    return out;
  };
})();
