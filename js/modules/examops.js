/* ==========================================================================
   EXAM OPERATIONS — পরীক্ষা ও ফলাফল
   · অনলাইন পরীক্ষা (QZ): tests built from the question bank; timing, answers and grading on the server
     (server/quiz.js). Learners never receive the answer key before the test closes.
   · পরীক্ষার হাজিরা (XA): present / absent per exam, paper (routine slot) and room → DB.s.examAttendance;
     an absent student without marks shows "অনুপস্থিত" in results (DB.result, js/db.js).
   · নম্বর তোলার শিট (MS): printable offline mark-entry sheet with chosen, ordered columns (Print.show).
   · ওএমআর মূল্যায়ন (OMR): reads scanned / photographed OMR sheets in the browser (corner markers →
     perspective correction → bubble darkness), compares with the answer key of each set, review, save.
     Only bubbles are read: handwriting is not recognised.
   Load after students.js (StaffMarks) and qbuilder.js (QB).
   ========================================================================== */

DB.addSeeder('quizzes', () => []);
DB.addSeeder('examAttendance', () => []);

const XO = {
  staff() { return !!App.session && !['TEACHER', 'STUDENT', 'GUARDIAN'].includes(App.session.role); },
  teacher() { return App.session?.role === 'TEACHER'; },
  canEdit() { return App.perm('exams', 'edit') || App.has?.('ADMIN'); },
  classes() { return this.teacher() ? Teacher.myClasses() : DB.classesIn().map(c => c.id); },
  subjects(cls) { if (!cls) return []; return this.teacher() ? Teacher.mySubjects(cls) : DB.classSubjects(cls).map(s => s.id); },
  exams() { return [...DB.s.exams].sort((a, b) => String(b.start).localeCompare(String(a.start))); },
  sel(id, label, opts, on) { return `<div class="min-w-0"><label class="label" for="${id}">${label}</label><select id="${id}" class="select" onchange="${on}">${opts}</select></div>`; },
  opts(list, cur, empty) { return (empty ? `<option value="">${empty}</option>` : '') + list.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join(''); },
  pad(n) { return String(n).padStart(2, '0'); },
  local(iso) { const d = new Date(iso); return isNaN(d) ? '' : `${d.getFullYear()}-${this.pad(d.getMonth() + 1)}-${this.pad(d.getDate())}T${this.pad(d.getHours())}:${this.pad(d.getMinutes())}`; },
  dt(iso) { const d = new Date(iso); return isNaN(d) ? '—' : `${U.fmtDate(`${d.getFullYear()}-${this.pad(d.getMonth() + 1)}-${this.pad(d.getDate())}`)} ${U.bn(`${this.pad(d.getHours())}:${this.pad(d.getMinutes())}`)}`; },
  num(v, d = 1) { const n = +v; return Number.isFinite(n) ? bnNum(Math.round(n * 10 ** d) / 10 ** d) : '—'; },
  clone(x) { return JSON.parse(JSON.stringify(x)); },
};

/* ==========================================================================
   1. ONLINE TESTS
   ========================================================================== */
const QZ = {
  TYPES: [['mcq', 'বহুনির্বাচনি — এক উত্তর'], ['mcqm', 'বহুনির্বাচনি — একাধিক উত্তর'], ['tf', 'সত্য / মিথ্যা'], ['one', 'এক কথায় উত্তর'], ['fill', 'শূন্যস্থান পূরণ'], ['num', 'সংখ্যাভিত্তিক উত্তর']],
  POLICY: [['instant', 'জমা দিলেই নম্বর, উত্তর পরীক্ষা শেষে'], ['close', 'পরীক্ষা শেষ হলে নম্বর ও উত্তর'], ['manual', 'শিক্ষক প্রকাশ করলে']],
  L: ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ'],
  all() { return DB.s.quizzes || (DB.s.quizzes = []); },
  attempts() { return DB.s.quizAttempts || []; },
  quiz(id) { return this.all().find(q => q.id === id); },
  total(q) { return Array.isArray(q.questions) ? U.sum(q.questions, x => +x.marks || 0) : +q.total || 0; },
  count(q) { return Array.isArray(q.questions) ? q.questions.length : +q.qCount || 0; },
  phase(q, t = Date.now()) { if (q.status !== 'published') return 'draft'; if (t < Date.parse(q.start)) return 'soon'; if (t <= Date.parse(q.end)) return 'live'; return 'over'; },
  phaseBadge(q) { const p = this.phase(q); return badge({ draft: 'খসড়া', soon: 'নির্ধারিত', live: 'চলমান', over: 'শেষ' }[p], { draft: 'slate', soon: 'blue', live: 'green', over: 'violet' }[p]); },
  mine(q) { return XO.staff() ? XO.canEdit() : q.by === App.session?.userId || Teacher.mySubjects(q.classId).includes(q.subjectId); },

  /* ---------- staff / teacher list ---------- */
  render() {
    const cls = new Set(XO.classes()), list = this.all().filter(q => cls.has(q.classId)).sort((a, b) => String(b.start).localeCompare(String(a.start)));
    const att = id => this.attempts().filter(a => a.quizId === id);
    const head = pageHeader('অনলাইন পরীক্ষা', '', XO.canEdit() ? `<button class="btn btn-primary" onclick="QZ.edit()">${icon('plus')} নতুন অনলাইন পরীক্ষা</button>` : '');
    if (!list.length) return head + `<div class="card p-6">${emptyState('কোনো অনলাইন পরীক্ষা নেই।', 'monitor-check')}</div>`;
    return head + `<div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">${list.map(q => {
      const a = att(q.id), done = a.filter(x => x.status === 'submitted'), sts = new Set(a.map(x => x.studentId)).size;
      return `<div class="card p-4 flex flex-col gap-3"><div class="flex items-start gap-3"><div class="w-10 h-10 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">${icon('monitor-check', 'w-5 h-5')}</div>
        <div class="flex-1 min-w-0"><div class="font-semibold truncate">${esc(q.title)}</div><div class="text-slate-500">${esc(DB.className(q.classId))} · ${esc(DB.subject(q.subjectId)?.name || '')}</div><div class="flex flex-wrap gap-1 mt-1">${this.phaseBadge(q)}${q.push?.examId ? badge('গ্রেডবুকে যুক্ত', 'amber') : ''}</div></div></div>
        <div class="grid grid-cols-2 gap-2"><div><div class="text-slate-500">শুরু</div><div class="font-semibold">${XO.dt(q.start)}</div></div><div><div class="text-slate-500">শেষ</div><div class="font-semibold">${XO.dt(q.end)}</div></div>
          <div><div class="text-slate-500">প্রশ্ন · নম্বর</div><div class="font-semibold">${bnNum(this.count(q))} · ${XO.num(this.total(q))}</div></div><div><div class="text-slate-500">অংশগ্রহণ</div><div class="font-semibold">${bnNum(sts)} জন · জমা ${bnNum(done.length)}</div></div></div>
        <div class="flex flex-wrap gap-2 mt-auto pt-2 border-t border-slate-100">${this.mine(q) ? `<button class="btn btn-ghost btn-sm" onclick="QZ.edit('${q.id}')">${icon('pencil')} সম্পাদনা</button>` : ''}<button class="btn btn-primary btn-sm" onclick="QZ.results('${q.id}')">${icon('chart-column')} ফলাফল</button><span class="flex-1"></span>${this.mine(q) && !a.length ? `<button class="btn btn-ghost btn-sm text-red-600" aria-label="মুছুন" title="মুছুন" onclick="QZ.remove('${q.id}')">${icon('trash-2')}</button>` : ''}</div></div>`;
    }).join('')}</div>`;
  },
  remove(id) {
    if (this.attempts().some(a => a.quizId === id)) return toast('অংশগ্রহণ হয়েছে এমন পরীক্ষা মোছা যায় না।', 'error');
    if (!confirm('এই অনলাইন পরীক্ষাটি মুছে ফেলবেন?')) return;
    DB.s.quizzes = this.all().filter(q => q.id !== id); DB.audit('QUIZ_DELETE', 'exams', id); DB.save(); App.refresh();
  },

  /* ---------- editor ---------- */
  blankQ(type = 'mcq') { const q = { id: 'z' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type, text: '', marks: 1, opts: [], ans: '' }; if (type === 'mcq' || type === 'mcqm') { q.opts = ['', '', '', '']; q.ans = type === 'mcq' ? 0 : []; } if (type === 'tf') q.ans = 'T'; return q; },
  edit(id) {
    const q = id ? this.quiz(id) : null;
    if (q && !this.mine(q)) return toast('এই পরীক্ষা সম্পাদনার অনুমতি নেই।', 'error');
    const cls = XO.classes()[0] || '', start = new Date(Date.now() + 3600e3); start.setMinutes(0, 0, 0);
    App.ui.qzd = q ? XO.clone(q) : { id: '', title: '', classId: cls, subjectId: XO.subjects(cls)[0] || '', status: 'draft', start: start.toISOString(), end: new Date(+start + 86400e3).toISOString(), duration: 30, attempts: 1, negative: 0, shuffle: true, shuffleOpts: true, resultPolicy: 'close', released: false, questions: [], push: null };
    App.openDetail({ title: q ? `অনলাইন পরীক্ষা · ${q.title}` : 'নতুন অনলাইন পরীক্ষা', render: () => this.editHtml(), mount: () => App.icons() });
  },
  d() { return App.ui.qzd; },
  f(k, v) { const d = this.d(); if (['duration', 'attempts', 'negative'].includes(k)) v = Math.max(0, +v || 0); if (k === 'start' || k === 'end') v = v ? new Date(v).toISOString() : ''; d[k] = v; if (k === 'classId') { d.subjectId = XO.subjects(v)[0] || ''; App.refresh(); } if (k === 'subjectId') App.refresh(); },
  pushF(k, v) { const d = this.d(); d.push = { ...(d.push || { comp: 'mcq' }), [k]: v }; if (!d.push.examId) d.push = null; App.refresh(); },
  qf(i, k, v) { const q = this.d().questions[i]; if (k === 'marks') v = Math.max(0, +v || 0); q[k] = v; },
  opt(i, k, v) { this.d().questions[i].opts[k] = v; },
  ansM(i, k, on) { const q = this.d().questions[i], s = new Set(q.ans || []); on ? s.add(k) : s.delete(k); q.ans = [...s].sort(); },
  addOpt(i) { const q = this.d().questions[i]; if (q.opts.length < 6) q.opts.push(''); App.refresh(); },
  delOpt(i) { const q = this.d().questions[i]; if (q.opts.length <= 2) return; q.opts.pop(); if (q.type === 'mcq' && +q.ans >= q.opts.length) q.ans = 0; if (q.type === 'mcqm') q.ans = (q.ans || []).filter(a => a < q.opts.length); App.refresh(); },
  setType(i, t) { const old = this.d().questions[i], q = this.blankQ(t); q.id = old.id; q.text = old.text; q.marks = old.marks; if ((t === 'mcq' || t === 'mcqm') && old.opts?.length) q.opts = old.opts; this.d().questions[i] = q; App.refresh(); },
  addQ() { this.d().questions.push(this.blankQ($('#qz-newtype')?.value || 'mcq')); App.refresh(); },
  delQ(i) { this.d().questions.splice(i, 1); App.refresh(); },
  moveQ(i, k) { const a = this.d().questions, j = i + k; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; App.refresh(); },
  editHtml() {
    const d = this.d(); if (!d) return '';
    const classes = XO.classes(), subs = XO.subjects(d.classId), exams = XO.exams().filter(e => DB.examTakes(e, d.classId, d.subjectId));
    const inp = (k, label, type, val, extra = '') => `<div class="min-w-0"><label class="label" for="qz-${k}">${label}</label><input id="qz-${k}" class="input" type="${type}" value="${esc(val)}" ${extra} onchange="QZ.f('${k}',this.value)"></div>`;
    const set = `<div class="card p-4 mb-4"><div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <div class="sm:col-span-2"><label class="label" for="qz-title">শিরোনাম</label><input id="qz-title" class="input" value="${esc(d.title)}" oninput="QZ.f('title',this.value)"></div>
      ${XO.sel('qz-cls', 'শ্রেণি', XO.opts(classes.map(c => [c, DB.className(c)]), d.classId), "QZ.f('classId',this.value)")}
      ${XO.sel('qz-sub', 'বিষয়', XO.opts(subs.map(s => [s, DB.subject(s)?.name || s]), d.subjectId), "QZ.f('subjectId',this.value)")}
      ${inp('start', 'শুরু', 'datetime-local', XO.local(d.start))}${inp('end', 'শেষ', 'datetime-local', XO.local(d.end))}
      ${inp('duration', 'সময় (মিনিট)', 'number', d.duration, 'min="1"')}${inp('attempts', 'সর্বোচ্চ চেষ্টা', 'number', d.attempts, 'min="1" max="10"')}
      ${inp('negative', 'ভুল উত্তরে কাটা নম্বর', 'number', d.negative, 'min="0" step="0.05"')}
      ${XO.sel('qz-pol', 'ফলাফল দেখানো', XO.opts(this.POLICY, d.resultPolicy), "QZ.f('resultPolicy',this.value)")}
      <label class="flex items-center gap-2 pt-6"><input type="checkbox" class="w-5 h-5" ${d.shuffle ? 'checked' : ''} onchange="QZ.f('shuffle',this.checked)"> প্রশ্নের ক্রম এলোমেলো</label>
      <label class="flex items-center gap-2 pt-6"><input type="checkbox" class="w-5 h-5" ${d.shuffleOpts ? 'checked' : ''} onchange="QZ.f('shuffleOpts',this.checked)"> বিকল্পের ক্রম এলোমেলো</label>
      ${XO.sel('qz-pex', 'গ্রেডবুকে যুক্ত করুন (ঐচ্ছিক)', XO.opts(exams.map(e => [e.id, e.name]), d.push?.examId || '', 'যুক্ত নয়'), "QZ.pushF('examId',this.value)")}
      ${d.push?.examId ? XO.sel('qz-pcomp', 'অংশ', XO.opts([['mcq', 'বহুনির্বাচনি'], ['cq', 'সৃজনশীল / লিখিত'], ['pr', 'ব্যবহারিক']], d.push.comp || 'mcq'), "QZ.pushF('comp',this.value)") : ''}</div></div>`;
    const qs = d.questions.map((q, i) => this.qHtml(q, i, d.questions.length)).join('');
    const bar = `<div class="card p-4 mb-4 flex flex-wrap items-end gap-2"><div class="font-semibold mr-auto">প্রশ্ন ${bnNum(d.questions.length)}টি · মোট ${XO.num(this.total(d))} নম্বর</div>
      <select id="qz-newtype" class="select !w-auto" aria-label="প্রশ্নের ধরন">${XO.opts(this.TYPES, 'mcq')}</select><button type="button" class="btn btn-ghost" onclick="QZ.addQ()">${icon('plus')} প্রশ্ন যোগ</button><button type="button" class="btn btn-ghost" onclick="QZ.bank()">${icon('library')} প্রশ্ন ব্যাংক থেকে</button></div>`;
    const acts = `<div class="flex flex-wrap gap-2 sticky bottom-0 bg-[var(--surface)] py-3 border-t border-slate-100"><span class="flex-1"></span><button type="button" class="btn btn-ghost" onclick="App.closeDetail()">বাতিল</button><button type="button" class="btn btn-ghost" onclick="QZ.save('draft')">${icon('save')} খসড়া</button><button type="button" class="btn btn-primary" onclick="QZ.save('published')">${icon('send')} প্রকাশ করুন</button></div>`;
    return set + bar + `<div class="space-y-3 mb-4">${qs || `<div class="card p-6">${emptyState('এখনো কোনো প্রশ্ন নেই।', 'list-checks')}</div>`}</div>` + acts;
  },
  qHtml(q, i, n) {
    const L = this.L, multi = q.type === 'mcqm';
    let body = '';
    if (q.type === 'mcq' || multi) body = `<div class="space-y-2">${q.opts.map((o, k) => `<div class="flex items-center gap-2"><input type="${multi ? 'checkbox' : 'radio'}" class="w-5 h-5 shrink-0" name="qa-${q.id}" ${multi ? ((q.ans || []).includes(k) ? 'checked' : '') : (+q.ans === k ? 'checked' : '')} aria-label="সঠিক উত্তর ${L[k]}" onchange="${multi ? `QZ.ansM(${i},${k},this.checked)` : `QZ.qf(${i},'ans',${k})`}"><span class="font-semibold w-6">${L[k]}</span><input class="input" value="${esc(o)}" oninput="QZ.opt(${i},${k},this.value)" aria-label="বিকল্প ${L[k]}"></div>`).join('')}
      <div class="flex gap-2"><button type="button" class="btn btn-ghost btn-sm" onclick="QZ.addOpt(${i})" ${q.opts.length >= 6 ? 'disabled' : ''}>${icon('plus')} বিকল্প</button><button type="button" class="btn btn-ghost btn-sm" onclick="QZ.delOpt(${i})" ${q.opts.length <= 2 ? 'disabled' : ''}>${icon('minus')} বিকল্প</button></div></div>`;
    else if (q.type === 'tf') body = `<div class="max-w-xs"><label class="label">সঠিক উত্তর</label><select class="select" onchange="QZ.qf(${i},'ans',this.value)">${XO.opts([['T', 'সত্য'], ['F', 'মিথ্যা']], q.ans)}</select></div>`;
    else body = `<div><label class="label">সঠিক উত্তর (একাধিক গ্রহণযোগ্য হলে | দিয়ে আলাদা)</label><input class="input" value="${esc(q.ans || '')}" oninput="QZ.qf(${i},'ans',this.value)"></div>`;
    return `<div class="card p-4 space-y-3"><div class="flex flex-wrap items-end gap-2"><div class="font-bold w-8">${bnNum(i + 1)}.</div>
      <div class="min-w-0 flex-1"><label class="label">ধরন</label><select class="select" onchange="QZ.setType(${i},this.value)">${XO.opts(this.TYPES, q.type)}</select></div>
      <div class="w-24"><label class="label">নম্বর</label><input class="input" type="number" min="0" step="0.5" value="${q.marks}" onchange="QZ.qf(${i},'marks',this.value)"></div>
      <div class="flex gap-1"><button type="button" class="btn btn-ghost btn-sm" aria-label="ওপরে" title="ওপরে" onclick="QZ.moveQ(${i},-1)" ${i ? '' : 'disabled'}>${icon('arrow-up')}</button><button type="button" class="btn btn-ghost btn-sm" aria-label="নিচে" title="নিচে" onclick="QZ.moveQ(${i},1)" ${i < n - 1 ? '' : 'disabled'}>${icon('arrow-down')}</button><button type="button" class="btn btn-ghost btn-sm text-red-600" aria-label="মুছুন" title="মুছুন" onclick="QZ.delQ(${i})">${icon('trash-2')}</button></div></div>
      <div><label class="label">প্রশ্ন</label><textarea class="input" rows="2" oninput="QZ.qf(${i},'text',this.value)">${esc(q.text)}</textarea></div>${body}</div>`;
  },
  /** Pick objective / short questions of this class and subject from the question bank. */
  bank() {
    const d = this.d(), ok = new Set(['mcq', 'mcqm', 'tf', 'one', 'fill']);
    const rows = (DB.s.qbank || []).filter(b => b.subjectId === d.subjectId && (!b.classId || b.classId === d.classId) && ok.has(b.type));
    Modal.open({ title: 'প্রশ্ন ব্যাংক থেকে বাছাই', size: 'lg', body: rows.length ? `<form id="qz-bank" class="space-y-2">${rows.slice(0, 300).map(b => `<label class="card p-3 flex gap-3 cursor-pointer"><input type="checkbox" class="w-5 h-5 mt-1 shrink-0" name="b" value="${b.id}"><div class="min-w-0"><div class="flex flex-wrap gap-1 mb-1">${badge(QB.TYPES[b.type]?.[0] || b.type, 'blue')}${b.chapter ? badge(b.chapter, 'violet') : ''}${badge(bn(b.diff || 'medium'), 'slate')}</div><div>${esc((b.q.text || '').slice(0, 300))}</div></div></label>`).join('')}
      <button class="btn btn-primary w-full">${icon('plus')} নির্বাচিত প্রশ্ন যোগ করুন</button></form>` : emptyState('এই শ্রেণি ও বিষয়ের উপযুক্ত কোনো প্রশ্ন ব্যাংকে নেই।', 'library') });
    $('#qz-bank')?.addEventListener('submit', ev => {
      ev.preventDefault();
      const ids = $$('#qz-bank input[name=b]:checked').map(x => x.value);
      ids.forEach(id => {
        const b = DB.s.qbank.find(x => x.id === id); if (!b) return;
        const s = b.q, q = this.blankQ(b.type === 'one' || b.type === 'fill' ? b.type : b.type);
        q.text = s.text || ''; q.marks = +s.marks || 1;
        if (b.type === 'mcq' || b.type === 'mcqm') { q.opts = [...(s.opts || [])]; q.ans = b.type === 'mcq' ? +s.ans || 0 : [...(s.ans || [])]; }
        else if (b.type === 'tf') q.ans = s.ans === 'F' ? 'F' : 'T';
        else q.ans = String(s.model || s.ans || '').trim();
        this.d().questions.push(q);
      });
      Modal.close(); toast(`${bnNum(ids.length)}টি প্রশ্ন যোগ হয়েছে।`, 'success'); App.refresh();
    });
  },
  problems(d) {
    const e = [];
    if (!d.title.trim()) e.push('শিরোনাম দিন');
    if (!d.classId || !d.subjectId) e.push('শ্রেণি ও বিষয় বাছুন');
    if (!(Date.parse(d.start) < Date.parse(d.end))) e.push('শেষের সময় শুরুর পরে হতে হবে');
    if (!(+d.duration > 0)) e.push('সময় (মিনিট) দিন');
    if (!d.questions.length) e.push('অন্তত একটি প্রশ্ন যোগ করুন');
    d.questions.forEach((q, i) => {
      const n = bnNum(i + 1);
      if (!String(q.text).trim()) e.push(`প্রশ্ন ${n}: লেখা নেই`);
      if (q.type === 'mcq' || q.type === 'mcqm') { if (q.opts.filter(o => String(o).trim()).length < 2 || q.opts.some(o => !String(o).trim())) e.push(`প্রশ্ন ${n}: সব বিকল্প পূরণ করুন`); if (q.type === 'mcqm' && !(q.ans || []).length) e.push(`প্রশ্ন ${n}: সঠিক উত্তর বাছুন`); }
      if (['one', 'fill', 'num'].includes(q.type) && !String(q.ans || '').trim()) e.push(`প্রশ্ন ${n}: সঠিক উত্তর লিখুন`);
      if (!(+q.marks > 0)) e.push(`প্রশ্ন ${n}: নম্বর দিন`);
    });
    return e;
  },
  save(status) {
    const d = this.d(); d.title = String(d.title || '').trim();
    if (status === 'published') { const e = this.problems(d); if (e.length) return toast(e.slice(0, 3).join(' · '), 'error'); }
    else if (!d.title) return toast('শিরোনাম দিন।', 'error');
    if (d.id && this.attempts().some(a => a.quizId === d.id) && !confirm('এই পরীক্ষায় অংশগ্রহণ হয়েছে। পরিবর্তন করলে "পুনঃমূল্যায়ন" চালাতে হবে। সংরক্ষণ করবেন?')) return;
    d.status = status;
    if (d.id) { const i = this.all().findIndex(q => q.id === d.id); this.all()[i] = { ...XO.clone(d), by: this.all()[i].by }; }
    else { d.id = DB.id('QZ'); d.by = App.session.userId; d.createdAt = new Date().toISOString(); this.all().push(XO.clone(d)); }
    DB.audit(status === 'published' ? 'QUIZ_PUBLISH' : 'QUIZ_SAVE', 'exams', `${d.id} · ${d.title} · ${d.classId} · ${d.subjectId} · ${d.questions.length} প্রশ্ন`); DB.save();
    toast(status === 'published' ? 'অনলাইন পরীক্ষা প্রকাশিত হয়েছে।' : 'খসড়া সংরক্ষিত হয়েছে।', 'success'); App.closeDetail();
  },

  /* ---------- results & analytics ---------- */
  async results(id, regrade = false) {
    try { const r = await DB.api(`quiz/${encodeURIComponent(id)}/results`, { regrade }); App.ui.qzr = { id, attempts: r.attempts || [] }; }
    catch (e) { return toast('ফলাফল আনা যায়নি।', 'error'); }
    if (regrade) { toast('পুনঃমূল্যায়ন সম্পন্ন।', 'success'); await DB.pull(); return App.refresh(); }
    const q = this.quiz(id);
    App.openDetail({ title: `ফলাফল · ${q?.title || ''}`, render: () => this.resultsHtml(), mount: () => App.icons() });
  },
  /** Best submitted attempt per student. */
  best(atts) { const m = new Map(); atts.filter(a => a.status === 'submitted').forEach(a => { const b = m.get(a.studentId); if (!b || a.score > b.score) m.set(a.studentId, a); }); return m; },
  stats(q, atts) {
    const done = atts.filter(a => a.status === 'submitted');
    return (q.questions || []).map((x, i) => {
      const d = done.map(a => a.detail?.[x.id]).filter(Boolean), right = d.filter(v => v.ok === true).length, wrong = d.filter(v => v.ok === false).length, skip = done.length - right - wrong;
      const pct = done.length ? right / done.length * 100 : null;
      return { i, x, right, wrong, skip, pct, level: pct === null ? '—' : pct >= 70 ? 'সহজ' : pct >= 40 ? 'মাঝারি' : 'কঠিন' };
    });
  },
  resultsHtml() {
    const R = App.ui.qzr, q = this.quiz(R?.id); if (!q) return emptyState('পরীক্ষাটি পাওয়া যায়নি।');
    const atts = R.attempts, best = this.best(atts), roster = DB.studentsIn(q.classId), open = atts.filter(a => a.status === 'open').length;
    const scores = [...best.values()].map(a => a.score), max = this.total(q), avg = scores.length ? U.sum(scores) / scores.length : null;
    const tile = (l, v) => `<div class="card p-4"><div class="text-slate-500">${l}</div><div class="text-xl font-bold">${v}</div></div>`;
    const tools = `<div class="flex flex-wrap gap-2 mb-4">${this.mine(q) ? `<button class="btn btn-ghost" onclick="QZ.results('${q.id}',true)">${icon('refresh-cw')} পুনঃমূল্যায়ন</button>` : ''}${this.mine(q) && q.resultPolicy === 'manual' ? `<button class="btn btn-ghost" onclick="QZ.release('${q.id}')">${icon(q.released ? 'eye-off' : 'eye')} ${q.released ? 'ফলাফল লুকান' : 'ফলাফল প্রকাশ করুন'}</button>` : ''}<span class="flex-1"></span>${this.mine(q) && q.push?.examId ? `<button class="btn btn-primary" onclick="QZ.push('${q.id}')">${icon('table-2')} গ্রেডবুকে পাঠান</button>` : ''}</div>`;
    const rows = roster.map(st => { const a = best.get(st.id), n = atts.filter(x => x.studentId === st.id).length; return `<tr><td>${bnNum(st.roll)}</td><td class="font-semibold">${esc(pn(st))}</td><td>${a ? `<b>${XO.num(a.score, 2)}</b> / ${XO.num(a.max, 2)}` : n ? badge('চলমান', 'blue') : badge('অংশ নেয়নি', 'slate')}</td><td>${a ? `${bnNum(a.correct)} / ${bnNum(a.wrong)} / ${bnNum(a.empty)}` : '—'}</td><td>${bnNum(n)}</td><td>${a ? XO.dt(a.submittedAt) + (a.auto ? ' ' + badge('সময় শেষে', 'amber') : '') : '—'}</td></tr>`; }).join('');
    const an = this.stats(q, atts).map(s => `<tr><td>${bnNum(s.i + 1)}</td><td class="min-w-[12rem]">${esc(String(s.x.text).slice(0, 120))}</td><td>${bnNum(s.right)}</td><td>${bnNum(s.wrong)}</td><td>${bnNum(s.skip)}</td><td>${s.pct === null ? '—' : XO.num(s.pct) + '%'}</td><td>${s.pct === null ? '—' : badge(s.level, s.level === 'সহজ' ? 'green' : s.level === 'মাঝারি' ? 'amber' : 'red')}</td></tr>`).join('');
    return tools + `<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">${tile('জমা দিয়েছে', `${bnNum(best.size)} / ${bnNum(roster.length)}`)}${tile('গড় নম্বর', avg === null ? '—' : `${XO.num(avg)} / ${XO.num(max)}`)}${tile('সর্বোচ্চ', scores.length ? XO.num(Math.max(...scores)) : '—')}${tile('চলমান', bnNum(open))}</div>
      <div class="card scroll-x mb-4"><div class="px-4 py-3 border-b border-slate-100 font-semibold">শিক্ষার্থীভিত্তিক ফলাফল</div><table class="table"><thead><tr><th>রোল</th><th>নাম</th><th>নম্বর</th><th>সঠিক / ভুল / ফাঁকা</th><th>চেষ্টা</th><th>জমা</th></tr></thead><tbody>${rows || `<tr><td colspan="6">${emptyState('কোনো শিক্ষার্থী নেই।')}</td></tr>`}</tbody></table></div>
      <div class="card scroll-x"><div class="px-4 py-3 border-b border-slate-100 font-semibold">প্রশ্নভিত্তিক বিশ্লেষণ</div><table class="table"><thead><tr><th>#</th><th>প্রশ্ন</th><th>সঠিক</th><th>ভুল</th><th>ফাঁকা</th><th>সঠিকের হার</th><th>কাঠিন্য</th></tr></thead><tbody>${an}</tbody></table></div>`;
  },
  release(id) { const q = this.quiz(id); q.released = !q.released; DB.audit('QUIZ_RELEASE', 'exams', `${id} → ${q.released ? 'released' : 'hidden'}`); DB.save(); App.refresh(); },
  /** Best score of each student → the chosen component of the exam's marks, scaled to that component's full marks. */
  push(id) {
    const q = this.quiz(id), R = App.ui.qzr, ex = DB.exam(q?.push?.examId); if (!q || !ex) return toast('গ্রেডবুকের পরীক্ষা পাওয়া যায়নি।', 'error');
    const comp = q.push.comp || 'mcq', cfg = Grade.cfg(ex, q.subjectId), full = +cfg[comp + 'Max'] || 0;
    if (!full) return toast(`${ex.name}-এ এই বিষয়ের নির্বাচিত অংশের পূর্ণমান ০।`, 'error');
    const best = this.best(R.attempts); if (!best.size) return toast('এখনো কেউ জমা দেয়নি।', 'warn');
    if (!confirm(`${bnNum(best.size)} জনের নম্বর ${ex.name}-এর ${comp === 'mcq' ? 'বহুনির্বাচনি' : comp === 'cq' ? 'সৃজনশীল' : 'ব্যবহারিক'} অংশে (পূর্ণমান ${bnNum(full)}) বসবে। চালিয়ে যাবেন?`)) return;
    best.forEach((a, sid) => {
      let m = DB.s.marks.find(x => x.examId === ex.id && x.studentId === sid && x.subjectId === q.subjectId);
      if (!m) DB.s.marks.push(m = { examId: ex.id, studentId: sid, subjectId: q.subjectId, cq: 0, mcq: 0, pr: 0 });
      delete m.absent; m[comp] = a.max ? Math.round(a.score / a.max * full * 10) / 10 : 0;
    });
    q.pushedAt = new Date().toISOString();
    DB.audit('QUIZ_PUSH', 'marks', `${q.id} → ${ex.id} · ${q.subjectId} · ${comp}: ${best.size} জন`); DB.save(); toast('নম্বর গ্রেডবুকে বসানো হয়েছে।', 'success');
  },

  /* ---------- learners ---------- */
  kid() { return App.session?.role === 'STUDENT' ? Student.me() : Guardian.child(); },
  learnerRender() {
    const k = this.kid(), G = App.session?.role === 'GUARDIAN';
    let html = pageHeader('অনলাইন পরীক্ষা', '') + (G ? Guardian.switcher() : '');
    if (!k) return html + `<div class="card p-6">${emptyState('কোনো শিক্ষার্থী সংযুক্ত নেই।')}</div>`;
    const list = this.all().filter(q => q.classId === k.classId && q.status === 'published').sort((a, b) => String(b.start).localeCompare(String(a.start)));
    if (!list.length) return html + `<div class="card p-6">${emptyState('কোনো অনলাইন পরীক্ষা নেই।', 'monitor-check')}</div>`;
    return html + `<div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">${list.map(q => {
      const a = this.attempts().filter(x => x.quizId === q.id && x.studentId === k.id), p = this.phase(q), open = a.find(x => x.status === 'open'), left = Math.max(0, (+q.attempts || 1) - a.length);
      const last = a.filter(x => x.status === 'submitted').sort((x, y) => (y.score ?? -1) - (x.score ?? -1))[0];
      const btn = p === 'live' && open ? `<button class="btn btn-primary" onclick="QZ.take('${q.id}')">${icon('play')} চালিয়ে যান</button>` : p === 'live' && left ? `<button class="btn btn-primary" onclick="QZ.take('${q.id}')">${icon('play')} শুরু করুন</button>` : '';
      return `<div class="card p-4 flex flex-col gap-3"><div><div class="font-semibold">${esc(q.title)}</div><div class="text-slate-500">${esc(DB.subject(q.subjectId)?.name || '')}</div><div class="mt-1">${this.phaseBadge(q)}</div></div>
        <div class="grid grid-cols-2 gap-2"><div><div class="text-slate-500">শুরু</div><div class="font-semibold">${XO.dt(q.start)}</div></div><div><div class="text-slate-500">শেষ</div><div class="font-semibold">${XO.dt(q.end)}</div></div>
          <div><div class="text-slate-500">সময়</div><div class="font-semibold">${bnNum(q.duration)} মিনিট</div></div><div><div class="text-slate-500">প্রশ্ন · নম্বর</div><div class="font-semibold">${bnNum(this.count(q))} · ${XO.num(this.total(q))}</div></div></div>
        ${last ? `<div class="rounded-lg bg-slate-50 p-3">${last.score !== undefined ? `প্রাপ্ত নম্বর <b>${XO.num(last.score, 2)} / ${XO.num(last.max, 2)}</b>` : 'জমা হয়েছে — ফলাফল পরে দেখা যাবে'}</div>` : ''}
        <div class="flex flex-wrap gap-2 mt-auto">${btn}${a.some(x => x.status === 'submitted') ? `<button class="btn btn-ghost" onclick="QZ.review('${q.id}')">${icon('eye')} ফলাফল ও উত্তর</button>` : ''}<span class="flex-1"></span><span class="text-slate-500 self-center">চেষ্টা বাকি ${bnNum(left)}</span></div></div>`;
    }).join('')}</div>`;
  },
  ERR: { not_open: 'পরীক্ষা এখনো শুরু হয়নি।', closed: 'পরীক্ষার সময় শেষ।', no_attempts: 'আর কোনো চেষ্টা বাকি নেই।', not_eligible: 'এই পরীক্ষা তোমার শ্রেণির নয়।', time_up: 'সময় শেষ — উত্তর জমা হয়ে গেছে।', submitted: 'উত্তর আগেই জমা হয়েছে।', forbidden: 'অনুমতি নেই।', not_found: 'পরীক্ষাটি পাওয়া যায়নি।' },
  err(e) { toast(this.ERR[e?.message] || 'সার্ভারে সংযোগ করা যায়নি।', 'error'); },
  async take(id) {
    const k = this.kid(); if (!k) return;
    let r; try { r = await DB.api(`quiz/${encodeURIComponent(id)}/start`, { studentId: k.id }); } catch (e) { return this.err(e); }
    App.ui.qzt = { id, title: r.title, attempt: r.attempt, questions: r.questions, answers: { ...(r.attempt.answers || {}) }, off: Date.parse(r.now) - Date.now(), done: false };
    App.openDetail({ title: r.title, render: () => this.takeHtml(), mount: () => this.takeMount() });
  },
  left() { const T = App.ui.qzt; return Math.max(0, Date.parse(T.attempt.deadline) - (Date.now() + T.off)); },
  takeHtml() {
    const T = App.ui.qzt; if (!T) return '';
    const L = this.L, A = T.answers;
    const q = (x, i) => {
      let body = '';
      if (x.type === 'mcq' || x.type === 'mcqm') { const m = x.type === 'mcqm'; body = `<div class="grid sm:grid-cols-2 gap-2">${x.opts.map((o, k) => `<label class="flex items-center gap-3 rounded-lg border border-slate-200 p-3 cursor-pointer"><input type="${m ? 'checkbox' : 'radio'}" class="w-5 h-5 shrink-0" name="t-${x.id}" value="${o.i}" ${m ? ((A[x.id] || []).includes(o.i) ? 'checked' : '') : (A[x.id] === o.i ? 'checked' : '')} onchange="QZ.pick('${x.id}',${o.i},${m},this.checked)"><span><b>${L[k]}.</b> ${esc(o.t)}</span></label>`).join('')}</div>`; }
      else if (x.type === 'tf') body = `<div class="flex flex-wrap gap-2">${[['T', 'সত্য'], ['F', 'মিথ্যা']].map(([v, l]) => `<label class="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-3 cursor-pointer"><input type="radio" class="w-5 h-5" name="t-${x.id}" ${A[x.id] === v ? 'checked' : ''} onchange="QZ.pick('${x.id}','${v}')"> ${l}</label>`).join('')}</div>`;
      else body = `<input class="input" value="${esc(A[x.id] || '')}" ${x.type === 'num' ? 'inputmode="decimal"' : ''} oninput="QZ.pick('${x.id}',this.value)" aria-label="উত্তর">`;
      return `<div class="card p-4 space-y-3"><div class="flex gap-2"><b class="shrink-0">${bnNum(i + 1)}.</b><div class="flex-1 whitespace-pre-line">${esc(x.text)}</div><span class="text-slate-500 shrink-0">${XO.num(x.marks)}</span></div>${x.img ? `<img src="${esc(x.img)}" alt="" class="max-h-64 mx-auto">` : ''}${body}</div>`;
    };
    return `<div class="card p-4 mb-4 flex flex-wrap items-center gap-3 sticky top-0 z-10"><div class="font-semibold mr-auto">${bnNum(T.questions.length)}টি প্রশ্ন</div><div class="flex items-center gap-2 text-xl font-bold" aria-live="polite">${icon('timer', 'w-5 h-5')}<span id="qz-timer">—</span></div><span id="qz-saved" class="text-slate-500"></span></div>
      <div class="space-y-3 mb-4">${T.questions.map(q).join('')}</div>
      <div class="flex flex-wrap gap-2 sticky bottom-0 bg-[var(--surface)] py-3 border-t border-slate-100"><span class="flex-1"></span><button class="btn btn-primary" onclick="QZ.submit()">${icon('send')} উত্তর জমা দিন</button></div>`;
  },
  takeMount() {
    clearInterval(this._tick);
    const tick = () => {
      const T = App.ui.qzt, el = $('#qz-timer');
      if (!T || T.done || !el) { clearInterval(this._tick); return; }
      const ms = this.left(), s = Math.ceil(ms / 1000);
      el.textContent = U.bn(`${XO.pad(Math.floor(s / 60))}:${XO.pad(s % 60)}`); el.classList.toggle('text-red-600', s <= 60);
      if (ms <= 0) { clearInterval(this._tick); this.submit(true); }
    };
    this._tick = setInterval(tick, 1000); tick();
  },
  pick(qid, v, multi, on) {
    const T = App.ui.qzt; if (!T || T.done) return;
    if (multi) { const s = new Set(T.answers[qid] || []); on ? s.add(v) : s.delete(v); T.answers[qid] = [...s].sort(); } else T.answers[qid] = v;
    clearTimeout(this._save); this._save = setTimeout(() => this.flush(), 700);
  },
  async flush() {
    const T = App.ui.qzt; if (!T || T.done) return;
    try { await DB.api(`quiz/attempt/${T.attempt.id}/save`, { answers: T.answers }); const el = $('#qz-saved'); if (el) el.textContent = 'সংরক্ষিত'; }
    catch (e) { if (e.message === 'time_up' || e.message === 'submitted') { T.done = true; this.err(e); App.closeDetail(); DB.pull(); } }
  },
  async submit(auto) {
    const T = App.ui.qzt; if (!T || T.done) return;
    if (!auto && !confirm('উত্তর জমা দেবে? জমা দেওয়ার পরে আর পরিবর্তন করা যাবে না।')) return;
    clearTimeout(this._save); T.done = true; clearInterval(this._tick);
    try {
      const r = await DB.api(`quiz/attempt/${T.attempt.id}/submit`, { answers: T.answers }), a = r.attempt || {};
      toast(a.score !== undefined ? `জমা হয়েছে — প্রাপ্ত নম্বর ${XO.num(a.score, 2)} / ${XO.num(a.max, 2)}` : 'জমা হয়েছে — ফলাফল পরে দেখা যাবে।', 'success');
    } catch (e) { this.err(e); }
    App.closeDetail(); await DB.pull(); App.refresh();
  },
  async review(id) {
    const k = this.kid(); if (!k) return;
    let r; try { r = await DB.api(`quiz/${encodeURIComponent(id)}/review`, { studentId: k.id }); } catch (e) { return this.err(e); }
    const q = this.quiz(id), L = this.L, sub = r.attempts.filter(a => a.status === 'submitted');
    const att = sub.map(a => `<div class="card p-3 flex flex-wrap gap-3"><b>চেষ্টা ${bnNum(a.no)}</b><span>${XO.dt(a.submittedAt)}</span><span class="flex-1"></span>${a.score !== undefined ? `<b>${XO.num(a.score, 2)} / ${XO.num(a.max, 2)}</b> <span class="text-slate-500">সঠিক ${bnNum(a.correct)} · ভুল ${bnNum(a.wrong)} · ফাঁকা ${bnNum(a.empty)}</span>` : '<span class="text-slate-500">ফলাফল এখনো প্রকাশিত হয়নি</span>'}</div>`).join('');
    const a = [...sub].sort((x, y) => (y.score ?? 0) - (x.score ?? 0))[0];
    const show = v => v === undefined || v === null || v === '' ? '—' : Array.isArray(v) ? v.map(i => L[i]).join(', ') : typeof v === 'number' ? L[v] : v === 'T' ? 'সত্য' : v === 'F' ? 'মিথ্যা' : String(v);
    const keyTxt = x => x.type === 'mcq' ? L[+x.ans] : x.type === 'mcqm' ? (x.ans || []).map(i => L[i]).join(', ') : x.type === 'tf' ? (x.ans === 'F' ? 'মিথ্যা' : 'সত্য') : String(x.ans || '').split('|').join(' / ');
    const qs = r.questions ? `<div class="space-y-2 mt-3">${r.questions.map((x, i) => { const d = a?.detail?.[x.id]; return `<div class="card p-3"><div class="flex gap-2"><b>${bnNum(i + 1)}.</b><div class="flex-1 whitespace-pre-line">${esc(x.text)}</div>${d ? badge(d.ok === true ? 'সঠিক' : d.ok === false ? 'ভুল' : 'ফাঁকা', d.ok === true ? 'green' : d.ok === false ? 'red' : 'slate') : ''}</div>${x.opts?.length ? `<div class="text-slate-600 mt-1">${x.opts.map((o, k) => `${L[k]}. ${esc(o)}`).join(' · ')}</div>` : ''}<div class="mt-1">তোমার উত্তর: <b>${esc(show(a?.answers?.[x.id]))}</b> · সঠিক উত্তর: <b class="text-emerald-700">${esc(keyTxt(x))}</b></div></div>`; }).join('')}</div>` : '';
    Modal.open({ title: `ফলাফল · ${q?.title || ''}`, size: 'lg', body: `<div class="space-y-2">${att || emptyState('কোনো জমা নেই।')}</div>${qs}` });
  },
};

/* ==========================================================================
   2. EXAM ATTENDANCE
   ========================================================================== */
Object.assign(DB, {
  /** Marked absent on the exam attendance sheet for that paper? */
  examAbsent(examId, studentId, subjectId) { return (this.s.examAttendance || []).some(r => r.examId === examId && r.studentId === studentId && r.subjectId === subjectId && r.status === 'A'); },
});
const XA = {
  st() {
    const ui = App.ui.xa || (App.ui.xa = { tab: 'mark' });
    const exams = XO.exams().filter(e => (e.schedule || []).length);
    if (!exams.some(e => e.id === ui.exam)) ui.exam = (exams.find(e => (e.schedule || []).some(r => r.date >= U.today())) || exams[0])?.id;
    const ex = DB.exam(ui.exam), slots = (ex?.schedule || []).map((r, i) => ({ ...r, i }));
    if (!slots.some(s => s.i === +ui.slot)) ui.slot = (slots.find(s => s.date >= U.today()) || slots[0])?.i;
    const slot = slots.find(s => s.i === +ui.slot), mine = new Set(XO.classes());
    const cls = slot ? DB.examClasses(ex).filter(c => mine.has(c.id) && (!slot.classIds?.length || slot.classIds.includes(c.id)) && DB.examTakes(ex, c.id, slot.subjectId)).map(c => c.id) : [];
    if (!cls.includes(ui.cls)) ui.cls = cls[0];
    if (ui.room === undefined || ui._slot !== `${ui.exam}|${ui.slot}`) { ui.room = slot?.room || ''; ui._slot = `${ui.exam}|${ui.slot}`; }
    return { ui, exams, ex, slots, slot, cls };
  },
  rows() { return DB.s.examAttendance || (DB.s.examAttendance = []); },
  roster(ex, slot, cls, sec) { return DB.studentsIn(cls).filter(s => (!sec || s.section === sec) && (typeof SubjectSets === 'undefined' || SubjectSets.takes(s.id, slot.subjectId))).sort((a, b) => (a.section || '').localeCompare(b.section || '') || (+a.roll - +b.roll)); },
  rec(examId, subjectId, studentId) { return this.rows().find(r => r.examId === examId && r.subjectId === subjectId && r.studentId === studentId); },
  slotLabel(s) { return `${U.fmtDate(s.date)} · ${DB.subject(s.subjectId)?.name || ''} · ${U.bn(s.start || '')}`; },
  render() {
    const { ui, exams, ex, slots, slot, cls } = this.st();
    const head = pageHeader('পরীক্ষার হাজিরা', '') + pills([['mark', 'হাজিরা নিন', 'user-check'], ['report', 'সারসংক্ষেপ', 'chart-column']], ui.tab, id => `App.ui.xa.tab='${id}';App.refresh()`);
    if (!exams.length) return head + `<div class="card p-6">${emptyState('রুটিনসহ কোনো পরীক্ষা নেই।', 'calendar-x')}</div>`;
    const exSel = XO.sel('xa-ex', 'পরীক্ষা', XO.opts(exams.map(e => [e.id, e.name]), ui.exam), "App.ui.xa.exam=this.value;App.refresh()");
    if (ui.tab === 'report') return head + `<div class="card p-4 mb-4 grid sm:grid-cols-3 gap-3 items-end">${exSel}<div></div><div class="flex sm:justify-end"><button class="btn btn-primary" onclick="Print.show('examAttSummary','${ex.id}')">${icon('printer')} সারসংক্ষেপ মুদ্রণ</button></div></div>` + this.reportHtml(ex);
    const secs = ui.cls ? DB.cls(ui.cls)?.sections || [] : [];
    if (!secs.includes(ui.sec)) ui.sec = '';
    const bar = `<div class="card p-4 mb-4 grid sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">${exSel}
      ${XO.sel('xa-slot', 'পত্র (রুটিন)', XO.opts(slots.map(s => [String(s.i), this.slotLabel(s)]), String(ui.slot)), "App.ui.xa.slot=this.value;App.refresh()")}
      ${XO.sel('xa-cls', 'শ্রেণি', XO.opts(cls.map(c => [c, DB.className(c)]), ui.cls), "App.ui.xa.cls=this.value;App.refresh()")}
      ${secs.length > 1 ? XO.sel('xa-sec', 'শাখা', XO.opts(secs.map(s => [s, s]), ui.sec, 'সকল শাখা'), "App.ui.xa.sec=this.value;App.refresh()") : ''}
      <div class="min-w-0"><label class="label" for="xa-room">কক্ষ</label><input id="xa-room" class="input" value="${esc(ui.room)}" onchange="App.ui.xa.room=this.value"></div></div>`;
    if (!slot || !ui.cls) return head + bar + `<div class="card p-6">${emptyState('এই পত্রে আপনার কোনো শ্রেণি নেই।', 'circle-slash')}</div>`;
    const list = this.roster(ex, slot, ui.cls, ui.sec), ab = list.filter(s => this.rec(ex.id, slot.subjectId, s.id)?.status === 'A').length, saved = list.filter(s => this.rec(ex.id, slot.subjectId, s.id)).length;
    return head + bar + `<div class="card scroll-x"><div class="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2"><div class="font-semibold mr-auto">${esc(DB.subject(slot.subjectId)?.name || '')} · ${esc(DB.className(ui.cls))}</div>${badge(`মোট ${bnNum(list.length)}`, 'slate')}${badge(`অনুপস্থিত ${bnNum(ab)}`, ab ? 'red' : 'slate')}${saved ? badge('সংরক্ষিত', 'green') : badge('এখনো নেওয়া হয়নি', 'amber')}
        <button class="btn btn-ghost btn-sm" onclick="XA.all(true)">${icon('check-check')} সবাই উপস্থিত</button><button class="btn btn-ghost btn-sm" onclick="XA.print()">${icon('printer')} হাজিরা শিট</button></div>
      <table class="table" id="xa-table"><thead><tr><th>রোল</th><th>নাম</th><th>আইডি</th>${secs.length > 1 ? '<th>শাখা</th>' : ''}<th>উপস্থিত</th></tr></thead><tbody>
      ${list.map(s => { const r = this.rec(ex.id, slot.subjectId, s.id); return `<tr data-st="${s.id}"><td>${bnNum(s.roll)}</td><td class="font-semibold">${esc(pn(s))}</td><td class="font-mono">${esc(s.id)}</td>${secs.length > 1 ? `<td>${esc(s.section || '')}</td>` : ''}<td><input type="checkbox" class="w-5 h-5" name="p" ${r?.status === 'A' ? '' : 'checked'} aria-label="উপস্থিত"></td></tr>`; }).join('') || `<tr><td colspan="5">${emptyState('কোনো শিক্ষার্থী নেই।')}</td></tr>`}</tbody></table>
      <div class="p-4 border-t border-slate-100 flex justify-end">${XO.canEdit() || XO.teacher() ? `<button class="btn btn-primary" onclick="XA.save()">${icon('save')} হাজিরা সংরক্ষণ করুন</button>` : ''}</div></div>`;
  },
  all(on) { $$('#xa-table input[name=p]').forEach(x => (x.checked = on)); },
  save() {
    const { ui, ex, slot } = this.st(); if (!slot) return;
    const room = String($('#xa-room')?.value ?? ui.room).trim(); ui.room = room;
    let n = 0, a = 0;
    $$('#xa-table tr[data-st]').forEach(tr => {
      const sid = tr.dataset.st, status = tr.querySelector('[name=p]').checked ? 'P' : 'A';
      let r = this.rec(ex.id, slot.subjectId, sid);
      if (!r) this.rows().push(r = { id: `XA-${ex.id}-${slot.subjectId}-${sid}`, examId: ex.id, subjectId: slot.subjectId, studentId: sid });
      Object.assign(r, { classId: ui.cls, date: slot.date, room, status, by: App.session.userId, at: new Date().toISOString() });
      n++; if (status === 'A') a++;
    });
    DB.audit('EXAM_ATTENDANCE', 'exams', `${ex.id} · ${slot.subjectId} · ${ui.cls}${room ? ' · ' + room : ''}: ${n} জন, অনুপস্থিত ${a}`); DB.save();
    toast(`হাজিরা সংরক্ষিত — অনুপস্থিত ${bnNum(a)} জন।`, 'success'); App.refresh();
  },
  print() { const { ui, ex, slot } = this.st(); if (slot) Print.show('examAttSheet', ex.id, slot.i, ui.cls, String($('#xa-room')?.value ?? ui.room), ui.sec || ''); },
  /** Per paper and class: total, present, absent; plus the absentee list. */
  summary(ex) {
    const mine = new Set(XO.classes()), out = [];
    (ex.schedule || []).forEach(slot => DB.examClasses(ex).filter(c => mine.has(c.id) && (!slot.classIds?.length || slot.classIds.includes(c.id)) && DB.examTakes(ex, c.id, slot.subjectId)).forEach(c => {
      const list = this.roster(ex, slot, c.id), recs = list.map(s => this.rec(ex.id, slot.subjectId, s.id)).filter(Boolean);
      out.push({ slot, cls: c.id, total: list.length, taken: recs.length, absent: list.filter(s => this.rec(ex.id, slot.subjectId, s.id)?.status === 'A'), rooms: [...new Set(recs.map(r => r.room).filter(Boolean))] });
    }));
    return out;
  },
  reportHtml(ex) {
    const S = this.summary(ex), taken = S.filter(x => x.taken), tot = U.sum(taken, x => x.total), ab = U.sum(taken, x => x.absent.length);
    const tile = (l, v) => `<div class="card p-4"><div class="text-slate-500">${l}</div><div class="text-xl font-bold">${v}</div></div>`;
    return `<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">${tile('হাজিরা নেওয়া পত্র', `${bnNum(taken.length)} / ${bnNum(S.length)}`)}${tile('মোট পরীক্ষার্থী', bnNum(tot))}${tile('অনুপস্থিত', bnNum(ab))}${tile('উপস্থিতির হার', tot ? XO.num((tot - ab) / tot * 100) + '%' : '—')}</div>
      <div class="card scroll-x"><table class="table"><thead><tr><th>তারিখ</th><th>বিষয়</th><th>শ্রেণি</th><th>কক্ষ</th><th>মোট</th><th>উপস্থিত</th><th>অনুপস্থিত</th><th>অনুপস্থিতদের রোল</th></tr></thead><tbody>
      ${S.map(x => `<tr><td class="whitespace-nowrap">${U.fmtDate(x.slot.date)}</td><td class="font-semibold">${esc(DB.subject(x.slot.subjectId)?.name || '')}</td><td>${esc(DB.className(x.cls))}</td><td>${esc(x.rooms.join(', ') || '—')}</td><td>${bnNum(x.total)}</td><td>${x.taken ? bnNum(x.total - x.absent.length) : '—'}</td><td>${x.taken ? (x.absent.length ? badge(bnNum(x.absent.length), 'red') : bnNum(0)) : badge('নেওয়া হয়নি', 'amber')}</td><td>${esc(x.absent.map(s => U.bn(String(s.roll))).join(', ')) || '—'}</td></tr>`).join('') || `<tr><td colspan="8">${emptyState('এই পরীক্ষার রুটিনে আপনার কোনো পত্র নেই।')}</td></tr>`}</tbody></table></div>`;
  },
};

/* ==========================================================================
   3. OFFLINE MARK-ENTRY SHEET
   ========================================================================== */
const MS = {
  COLS: [['sl', 'ক্রম'], ['roll', 'রোল'], ['id', 'আইডি'], ['name', 'নাম'], ['sec', 'শাখা'], ['att', 'উপস্থিতি'], ['cq', 'সৃজনশীল / লিখিত'], ['mcq', 'বহুনির্বাচনি'], ['pr', 'ব্যবহারিক'], ['xc', 'অন্যান্য মূল্যায়ন অংশ'], ['total', 'মোট'], ['grade', 'গ্রেড'], ['remarks', 'মন্তব্য'], ['sig', 'শিক্ষার্থীর স্বাক্ষর'], ['blank', 'অতিরিক্ত কলাম']],
  DEF: ['sl', 'roll', 'name', 'id', 'cq', 'mcq', 'pr', 'xc', 'total', 'remarks'],
  KEY: 'dhee.markSheetCols',
  load() { try { const v = JSON.parse(localStorage.getItem(this.KEY) || 'null'); if (Array.isArray(v?.on) && Array.isArray(v?.order)) return v; } catch (e) { /* storage blocked */ } return { on: [...this.DEF], order: this.COLS.map(c => c[0]) }; },
  keep(v) { try { localStorage.setItem(this.KEY, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
  st() {
    const ui = App.ui.ms || (App.ui.ms = { ...this.load(), prefill: false });
    const exams = XO.exams(); if (!exams.some(e => e.id === ui.exam)) ui.exam = exams[0]?.id;
    const ex = DB.exam(ui.exam), cls = ex ? XO.classes().filter(c => DB.examTakes(ex, c)) : [];
    if (!cls.includes(ui.cls)) ui.cls = cls[0];
    const subs = XO.subjects(ui.cls).filter(s => ex && DB.examTakes(ex, ui.cls, s)); if (!subs.includes(ui.sub)) ui.sub = subs[0];
    const secs = ui.cls ? DB.cls(ui.cls)?.sections || [] : []; if (!secs.includes(ui.sec)) ui.sec = '';
    this.COLS.forEach(c => { if (!ui.order.includes(c[0])) ui.order.push(c[0]); });
    return { ui, exams, ex, cls, subs, secs };
  },
  render() {
    const { ui, exams, ex, cls, subs, secs } = this.st(), lab = Object.fromEntries(this.COLS);
    const head = pageHeader('নম্বর তোলার শিট', '');
    if (!exams.length) return head + `<div class="card p-6">${emptyState('কোনো পরীক্ষা নেই।', 'clipboard-list')}</div>`;
    const bar = `<div class="card p-4 mb-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">${XO.sel('ms-ex', 'পরীক্ষা', XO.opts(exams.map(e => [e.id, e.name]), ui.exam), "App.ui.ms.exam=this.value;App.refresh()")}
      ${XO.sel('ms-cls', 'শ্রেণি', XO.opts(cls.map(c => [c, DB.className(c)]), ui.cls), "App.ui.ms.cls=this.value;App.refresh()")}
      ${XO.sel('ms-sub', 'বিষয়', XO.opts(subs.map(s => [s, DB.subject(s)?.name || s]), ui.sub), "App.ui.ms.sub=this.value;App.refresh()")}
      ${secs.length > 1 ? XO.sel('ms-sec', 'শাখা', XO.opts(secs.map(s => [s, s]), ui.sec, 'সকল শাখা'), "App.ui.ms.sec=this.value;App.refresh()") : '<div></div>'}</div>`;
    if (!ui.cls || !ui.sub) return head + bar + `<div class="card p-6">${emptyState('এই পরীক্ষায় আপনার কোনো শ্রেণি বা বিষয় নেই।', 'circle-slash')}</div>`;
    const comps = Grade.comps(ex, ui.sub), lab2 = { ...lab, ...Object.fromEntries(comps.filter(c => ['cq', 'mcq', 'pr'].includes(c.k)).map(c => [c.k, c.label])) };
    const rows = ui.order.map((k, i) => { const off = this.off(k, comps); const lab = lab2; return `<li class="flex items-center gap-2 py-2 border-t border-slate-100 ${off ? 'opacity-50' : ''}"><label class="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"><input type="checkbox" class="w-5 h-5" ${ui.on.includes(k) ? 'checked' : ''} ${off ? 'disabled' : ''} onchange="MS.tog('${k}',this.checked)"> <span>${esc(lab[k])}</span></label><button class="btn btn-ghost btn-sm" aria-label="ওপরে" title="ওপরে" onclick="MS.move(${i},-1)" ${i ? '' : 'disabled'}>${icon('arrow-up')}</button><button class="btn btn-ghost btn-sm" aria-label="নিচে" title="নিচে" onclick="MS.move(${i},1)" ${i < ui.order.length - 1 ? '' : 'disabled'}>${icon('arrow-down')}</button></li>`; }).join('');
    return head + bar + `<div class="grid lg:grid-cols-2 gap-4"><div class="card p-4"><div class="font-semibold mb-2">কলাম</div><ul>${rows}</ul><div class="flex flex-wrap gap-2 pt-3"><button class="btn btn-ghost btn-sm" onclick="MS.reset()">${icon('rotate-ccw')} ডিফল্ট</button></div></div>
      <div class="card p-4 space-y-3 self-start"><div class="font-semibold">মুদ্রণ</div><div>${esc(DB.subject(ui.sub)?.name || '')} · ${esc(DB.className(ui.cls))}${ui.sec ? '-' + esc(ui.sec) : ''} · ${bnNum(this.list(ui).length)} জন</div>
        <label class="flex items-center gap-3"><input type="checkbox" class="w-5 h-5" ${ui.prefill ? 'checked' : ''} onchange="App.ui.ms.prefill=this.checked"> দেওয়া নম্বর বসিয়ে দিন</label>
        <button class="btn btn-primary w-full" onclick="MS.print()">${icon('printer')} A4 মুদ্রণ</button></div></div>`;
  },
  /** A marks column the subject has no component for (cq / mcq / pr not configured, no other components). */
  off(k, comps) { return (['cq', 'mcq', 'pr'].includes(k) && !comps.some(c => c.k === k)) || (k === 'xc' && !comps.some(c => !['cq', 'mcq', 'pr'].includes(c.k))); },
  list(ui) { return DB.studentsIn(ui.cls).filter(s => (!ui.sec || s.section === ui.sec) && (typeof SubjectSets === 'undefined' || SubjectSets.takes(s.id, ui.sub))).sort((a, b) => (a.section || '').localeCompare(b.section || '') || (+a.roll - +b.roll)); },
  tog(k, on) { const ui = App.ui.ms; ui.on = on ? [...new Set([...ui.on, k])] : ui.on.filter(x => x !== k); this.keep({ on: ui.on, order: ui.order }); },
  move(i, d) { const o = App.ui.ms.order, j = i + d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; this.keep({ on: App.ui.ms.on, order: o }); App.refresh(); },
  reset() { Object.assign(App.ui.ms, { on: [...this.DEF], order: this.COLS.map(c => c[0]) }); this.keep({ on: App.ui.ms.on, order: App.ui.ms.order }); App.refresh(); },
  print() {
    const { ui, ex } = this.st(); if (!ui.cls || !ui.sub) return;
    const comps = Grade.comps(ex, ui.sub), cols = ui.order.filter(k => ui.on.includes(k) && !this.off(k, comps));
    if (!cols.length) return toast('অন্তত একটি কলাম বাছুন।', 'warn');
    Print.show('markSheet', ex.id, ui.cls, ui.sub, ui.sec || '', cols.join(','), ui.prefill ? 1 : 0);
  },
};

/* ---------- printable documents (Print.show) ---------- */
Object.assign(Print.doc, {
  /** Offline mark-entry sheet: chosen columns in the chosen order, A4. */
  markSheet(examId, classId, subjectId, sec, colStr, prefill) {
    const ex = DB.exam(examId); if (!ex) return { empty: 'পরীক্ষাটি পাওয়া যায়নি।' };
    // marks columns follow the subject's configured components: cq / mcq / pr when configured, "xc" = every other component
    const cfg = Grade.cfg(ex, subjectId), comps = Grade.comps(ex, subjectId), has = k => comps.some(c => c.k === k), campus = DB.campusOf(classId);
    const cols = String(colStr || '').split(',').filter(Boolean).flatMap(k => k === 'xc' ? comps.filter(c => !['cq', 'mcq', 'pr'].includes(c.k)).map(c => 'x:' + c.k) : ['cq', 'mcq', 'pr'].includes(k) && !has(k) ? [] : [k]);
    const list = MS.list({ cls: classId, sec, sub: subjectId }), lab = Object.fromEntries(MS.COLS), comp = k => comps.find(c => c.k === k);
    const W = { sl: 9, roll: 12, id: 24, sec: 12, att: 16, cq: 20, mcq: 20, pr: 20, total: 15, grade: 13, remarks: 30, sig: 28, blank: 20 };
    const head = k => ['cq', 'mcq', 'pr'].includes(k) || k.startsWith('x:') ? `${esc(comp(k.replace('x:', ''))?.label || k)}<br>(${bnNum(comp(k.replace('x:', ''))?.max ?? 0)})` : k === 'total' ? `মোট<br>(${bnNum(cfg.full)})` : esc(lab[k] || k);
    const val = (k, s, i) => {
      const m = +prefill ? DB.s.marks.find(x => x.examId === examId && x.studentId === s.id && x.subjectId === subjectId) : null;
      if (k === 'sl') return bnNum(i + 1); if (k === 'roll') return bnNum(s.roll); if (k === 'id') return esc(s.id); if (k === 'name') return esc(pn(s)); if (k === 'sec') return esc(s.section || '');
      if (!m) return ''; if (m.absent) return k === cols.find(c => ['cq', 'mcq', 'pr'].includes(c) || c.startsWith('x:')) || k === 'total' ? 'অনুপস্থিত' : '';
      const v = DB.markVals(m, ex, subjectId, s.id);
      if (['cq', 'mcq', 'pr'].includes(k) || k.startsWith('x:')) return bnNum(v[k.replace('x:', '')] ?? '');
      const g = Grade.of(v.cq, v.mcq, ex, campus, v.pr, subjectId, v);
      if (k === 'total') return bnNum(g.total);
      if (k === 'grade') return esc(g.letter);
      return '';
    };
    const per1 = 24, per = 30, pages = []; for (let i = 0; i === 0 || i < list.length; i += pages.length ? per : per1) { pages.push(list.slice(i, i + (pages.length ? per : per1))); if (i + (pages.length > 1 ? per : per1) >= list.length) break; }
    let k0 = 0;
    const sheets = pages.map((rows, p) => {
      const start = k0; k0 += rows.length;
      return `${Print.sheet({}, 'padded')}${p === 0 ? `${Print.header('নম্বর তোলার শিট')}<div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:2mm;font-size:10.5pt;margin-bottom:3mm"><b>${esc(ex.name)}</b><span>শ্রেণি: ${esc(DB.className(classId))}${sec ? '-' + esc(sec) : ''}</span><span>বিষয়: ${esc(DB.subject(subjectId)?.name || '')}</span><span>শিক্ষাবর্ষ: ${esc(U.bn(ex.session || ''))}</span></div>` : `<div style="font-size:9.5pt;color:#475569;margin-bottom:3mm">${esc(ex.name)} · ${esc(DB.className(classId))} · ${esc(DB.subject(subjectId)?.name || '')} (চলমান)</div>`}
        <table class="ms-table" style="width:100%;table-layout:fixed;font-size:10pt"><thead><tr>${cols.map(k => `<th style="${W[k] ? `width:${W[k]}mm;` : ''}text-align:center">${head(k)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((s, i) => `<tr style="height:8mm">${cols.map(k => `<td style="${k === 'name' ? '' : 'text-align:center;'}overflow:hidden">${val(k, s, start + i)}</td>`).join('')}</tr>`).join('')}</tbody></table>
        ${p === pages.length - 1 ? `<div style="display:flex;justify-content:space-between;margin-top:14mm;font-size:9.5pt"><div style="width:55mm;border-top:.25mm solid #0f172a;text-align:center;padding-top:1mm">পরীক্ষকের স্বাক্ষর ও তারিখ</div><div style="width:55mm;border-top:.25mm solid #0f172a;text-align:center;padding-top:1mm">নিরীক্ষকের স্বাক্ষর</div></div>` : ''}
        <div style="position:absolute;bottom:8mm;right:14mm;font-size:8pt;color:#64748b">পৃষ্ঠা ${bnNum(p + 1)}/${bnNum(pages.length)}</div></div>`;
    });
    return { title: `নম্বর তোলার শিট — ${DB.subject(subjectId)?.name || ''}`, sheets };
  },
  /** Attendance sheet of one paper, class (and section) and room: roll, name, ID, signature. */
  examAttSheet(examId, slotIdx, classId, room, sec) {
    const ex = DB.exam(examId), slot = (ex?.schedule || [])[+slotIdx]; if (!slot) return { empty: 'পত্রটি পাওয়া যায়নি।' };
    const list = XA.roster(ex, slot, classId, sec), per = 26, pages = [];
    for (let i = 0; i === 0 || i < list.length; i += per) pages.push(list.slice(i, i + per));
    const sheets = pages.map((rows, p) => `${Print.sheet({}, 'padded')}${p === 0 ? Print.header('পরীক্ষার হাজিরা শিট') : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1mm 6mm;font-size:10.5pt;margin-bottom:3mm"><div><b>${esc(ex.name)}</b></div><div>বিষয়: <b>${esc(DB.subject(slot.subjectId)?.name || '')}</b></div><div>শ্রেণি: ${esc(DB.className(classId))}${sec ? '-' + esc(sec) : ''}</div><div>তারিখ: ${U.fmtDate(slot.date)} · ${U.bn(slot.start || '')}–${U.bn(slot.end || '')}</div><div>কক্ষ: ${esc(U.bn(room || slot.room || ''))}</div><div>মোট পরীক্ষার্থী: ${bnNum(list.length)}</div></div>
      <table class="ms-table" style="width:100%;table-layout:fixed;font-size:10pt"><thead><tr><th style="width:10mm">ক্রম</th><th style="width:14mm">রোল</th><th style="width:26mm">আইডি</th><th>নাম</th><th style="width:22mm">উপস্থিতি</th><th style="width:40mm">স্বাক্ষর</th></tr></thead>
      <tbody>${rows.map((s, i) => { const r = XA.rec(examId, slot.subjectId, s.id); return `<tr style="height:8.5mm"><td style="text-align:center">${bnNum(p * per + i + 1)}</td><td style="text-align:center">${bnNum(s.roll)}</td><td style="text-align:center">${esc(s.id)}</td><td>${esc(pn(s))}</td><td style="text-align:center">${r ? (r.status === 'A' ? 'অনুপস্থিত' : 'উপস্থিত') : ''}</td><td></td></tr>`; }).join('')}</tbody></table>
      ${p === pages.length - 1 ? `<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:12mm;font-size:9.5pt"><div>উপস্থিত: ________ &nbsp; অনুপস্থিত: ________</div><div style="width:60mm;border-top:.25mm solid #0f172a;text-align:center;padding-top:1mm">কক্ষ পরিদর্শকের স্বাক্ষর</div></div>` : ''}
      <div style="position:absolute;bottom:8mm;right:14mm;font-size:8pt;color:#64748b">পৃষ্ঠা ${bnNum(p + 1)}/${bnNum(pages.length)}</div></div>`);
    return { title: 'পরীক্ষার হাজিরা শিট', sheets };
  },
  /** Exam attendance summary: every paper × class with the absentees. */
  examAttSummary(examId) {
    const ex = DB.exam(examId); if (!ex) return { empty: 'পরীক্ষাটি পাওয়া যায়নি।' };
    const S = XA.summary(ex), per = 22, pages = [];
    for (let i = 0; i === 0 || i < S.length; i += per) pages.push(S.slice(i, i + per));
    const sheets = pages.map((rows, p) => `${Print.sheet({}, 'padded')}${p === 0 ? `${Print.header('পরীক্ষার হাজিরা — সারসংক্ষেপ')}<div style="font-size:11pt;margin-bottom:3mm"><b>${esc(ex.name)}</b> · শিক্ষাবর্ষ ${esc(U.bn(ex.session || ''))}</div>` : ''}
      <table class="ms-table" style="width:100%;font-size:9.5pt"><thead><tr><th>তারিখ</th><th>বিষয়</th><th>শ্রেণি</th><th>কক্ষ</th><th>মোট</th><th>উপস্থিত</th><th>অনুপস্থিত</th><th>অনুপস্থিতদের রোল</th></tr></thead>
      <tbody>${rows.map(x => `<tr><td>${U.fmtDate(x.slot.date)}</td><td>${esc(DB.subject(x.slot.subjectId)?.name || '')}</td><td>${esc(DB.className(x.cls))}</td><td>${esc(x.rooms.join(', ') || '—')}</td><td style="text-align:center">${bnNum(x.total)}</td><td style="text-align:center">${x.taken ? bnNum(x.total - x.absent.length) : '—'}</td><td style="text-align:center">${x.taken ? bnNum(x.absent.length) : 'নেওয়া হয়নি'}</td><td>${esc(x.absent.map(s => U.bn(String(s.roll))).join(', '))}</td></tr>`).join('')}</tbody></table>
      <div style="position:absolute;bottom:8mm;right:14mm;font-size:8pt;color:#64748b">পৃষ্ঠা ${bnNum(p + 1)}/${bnNum(pages.length)}</div></div>`);
    return { title: 'পরীক্ষার হাজিরা — সারসংক্ষেপ', sheets };
  },
});

/* ==========================================================================
   4. OMR — sheet layout (shared by the printed sheet and the reader) and evaluation
   ========================================================================== */
const OMR = {
  /* Geometry in mm on an A4 sheet (origin top-left). Four solid corner markers (8 mm) and one orientation
     mark (5 mm) right of the top-left marker. Bubbles: Ø 4.6 mm, red outline (dropped by reading the red channel). */
  MK: [[14, 14], [196, 14], [14, 283], [196, 283]], MK_SIZE: 8, ORIENT: [30, 14], ORIENT_SIZE: 5,
  BUB: 4.6, MAXQ: 100,
  roll(c, d) { return [122 + c * 7, 66 + d * 6]; },          // 6 columns × digits 0–9
  set(k) { return [176, 66 + k * 6]; },                       // set code ক–ঘ
  ans(q, k) { const c = Math.floor(q / 20), r = q % 20; return [24 + c * 37 + k * 6.2, 140 + r * 6.8]; },   // question q (0-based), option k
  L: ['ক', 'খ', 'গ', 'ঘ'],

  /* ---------- printed sheet (replaces QB.omrSheets) ---------- */
  sheetHtml(p, ex) {
    const s = DB.s.school, n = Math.min(this.MAXQ, Math.max(1, this.key(p, 0).length)), sets = Math.max(1, Math.min(4, +p.content?.sets || 1));
    const at = (x, y, html, extra = '') => `<div style="position:absolute;left:${x}mm;top:${y}mm;${extra}">${html}</div>`;
    const bub = (x, y, t) => at(x - this.BUB / 2, y - this.BUB / 2, t, `width:${this.BUB}mm;height:${this.BUB}mm;box-sizing:border-box;border:.3mm solid #dc2626;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:6.5pt;line-height:1;color:#dc2626`);
    const sq = ([x, y], w) => at(x - w / 2, y - w / 2, '', `width:${w}mm;height:${w}mm;background:#000`);
    let h = this.MK.map(m => sq(m, this.MK_SIZE)).join('') + sq(this.ORIENT, this.ORIENT_SIZE);
    h += at(40, 9, `<div style="display:flex;align-items:center;gap:3mm;width:130mm">${Print.logo(11)}<div style="flex:1;text-align:center"><div style="font-size:14pt;font-weight:700">${esc(s.nameBn || s.name)}</div><div style="font-size:10.5pt;font-weight:700;color:#b91c1c">বহুনির্বাচনি অভীক্ষার উত্তরপত্র</div></div></div>`);
    h += at(14, 30, `<div style="width:96mm;font-size:9.5pt;line-height:1.9">${esc(ex.name)}<br>${esc(DB.className(p.classId))} · ${esc(DB.subject(p.subjectId)?.name || '')}${['পরীক্ষার্থীর নাম', 'শাখা', 'তারিখ'].map(x => `<div style="display:flex;gap:2mm"><span style="white-space:nowrap">${x}:</span><span style="flex:1;border-bottom:.25mm dotted #0f172a"></span></div>`).join('')}
      <div style="margin-top:2mm;font-size:8.5pt;line-height:1.5;border:.25mm solid #b91c1c;padding:1.5mm 2mm;color:#7f1d1d">কালো বলপয়েন্ট কলম দিয়ে বৃত্ত সম্পূর্ণ ভরাট করো। রোল নম্বর বাম দিক থেকে লিখে নিচের ঘরে ভরাট করো। ভাঁজ করবে না, কোণের কালো চিহ্নে দাগ দেবে না।</div>
      <div style="display:flex;justify-content:space-between;margin-top:8mm;font-size:8.5pt"><div style="width:44mm;border-top:.25mm solid #0f172a;text-align:center">পরীক্ষার্থীর স্বাক্ষর</div><div style="width:44mm;border-top:.25mm solid #0f172a;text-align:center">পরিদর্শকের স্বাক্ষর</div></div></div>`);
    h += at(118.5, 50, '<b style="font-size:9pt">রোল নম্বর</b>');
    for (let c = 0; c < 6; c++) { const [x] = this.roll(c, 0); h += at(x - 3, 56, '', 'width:6mm;height:5.5mm;border:.3mm solid #0f172a;box-sizing:border-box'); for (let d = 0; d < 10; d++) h += bub(...this.roll(c, d), bnNum(d)); }
    if (sets > 1) { h += at(170, 50, '<b style="font-size:9pt">সেট কোড</b>'); for (let k = 0; k < sets; k++) h += bub(...this.set(k), this.L[k]); }
    h += at(14, 128, `<div style="width:182mm;border-top:.4mm solid #b91c1c;padding-top:1mm;font-weight:700;font-size:9.5pt">উত্তর (প্রশ্ন ${bnNum(n)}টি)</div>`);
    for (let q = 0; q < n; q++) { const [x, y] = this.ans(q, 0); h += at(x - 10.5, y - 2.2, bnNum(q + 1), 'width:7mm;text-align:right;font-size:8.5pt;font-weight:700'); for (let k = 0; k < 4; k++) h += bub(...this.ans(q, k), this.L[k]); }
    h += at(14, 287, `<div style="font-size:7pt;color:#64748b">${esc(p.id)} · ${esc(ex.name)} · ${esc(DB.subject(p.subjectId)?.name || '')}</div>`);
    return [`<div class="sheet" style="position:relative;width:210mm;height:297mm;overflow:hidden;color:#0f172a">${h}</div>`];
  },

  /** Answer key of set k: the objective (MCQ) questions in sheet order → { ans, multi, marks }. */
  key(p, k) {
    const c = QB.variant(p, k), out = [];
    (c.sections || []).forEach(s => s.qs.forEach(q => { if (q.type === 'mcq' || q.type === 'mcqm') out.push({ ans: q.type === 'mcq' ? [+q.ans] : [...(q.ans || [])].map(Number).sort(), multi: q.type === 'mcqm', marks: +q.marks || 1 }); }));
    return out;
  },

  /* ---------- reader ---------- */
  /** 3×3 homography mapping src points → dst points (4 pairs). */
  homography(src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) { const [x, y] = src[i], [u, v] = dst[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v); }
    for (let c = 0; c < 8; c++) {                         // Gaussian elimination with partial pivoting
      let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      if (Math.abs(A[c][c]) < 1e-12) return null;
      for (let r = 0; r < 8; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; if (!f) continue; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
    }
    const h = b.map((v, i) => v / A[i][i]);
    return (x, y) => { const w = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]; };
  },
  /** Red channel of the image, scaled so the long side is at most `max` px (red ink of the bubbles drops out). */
  pixels(src, max = 1800) {
    const w0 = src.naturalWidth || src.width, h0 = src.naturalHeight || src.height, f = Math.min(1, max / Math.max(w0, h0));
    const W = Math.max(1, Math.round(w0 * f)), H = Math.max(1, Math.round(h0 * f)), cv = document.createElement('canvas');
    cv.width = W; cv.height = H; const cx = cv.getContext('2d', { willReadFrequently: true }); cx.fillStyle = '#fff'; cx.fillRect(0, 0, W, H); cx.drawImage(src, 0, 0, W, H);
    const d = cx.getImageData(0, 0, W, H).data, g = new Uint8Array(W * H);
    for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = d[i];
    return { g, W, H };
  },
  otsu(g) {
    const hist = new Array(256).fill(0); for (let i = 0; i < g.length; i++) hist[g[i]]++;
    let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sB = 0, wB = 0, best = 0, t = 128;
    for (let i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; const wF = g.length - wB; if (!wF) break; sB += i * hist[i]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; t = i; } }
    return t;
  },
  /** Solid square blobs (corner-marker candidates): { x, y (centroid), size, area }. */
  blobs({ g, W, H }, thr) {
    const seen = new Uint8Array(W * H), out = [], m = Math.min(W, H), minA = (m / 120) ** 2, maxA = (m / 8) ** 2, stack = new Int32Array(W * H);
    for (let s = 0; s < g.length; s++) {
      if (seen[s] || g[s] >= thr) continue;
      let top = 0, area = 0, sx = 0, sy = 0, x0 = W, x1 = 0, y0 = H, y1 = 0; stack[top++] = s; seen[s] = 1;
      while (top) {
        const p = stack[--top], x = p % W, y = (p - x) / W; area++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (area > maxA * 1.5) continue;
        if (x > 0 && !seen[p - 1] && g[p - 1] < thr) { seen[p - 1] = 1; stack[top++] = p - 1; }
        if (x < W - 1 && !seen[p + 1] && g[p + 1] < thr) { seen[p + 1] = 1; stack[top++] = p + 1; }
        if (y > 0 && !seen[p - W] && g[p - W] < thr) { seen[p - W] = 1; stack[top++] = p - W; }
        if (y < H - 1 && !seen[p + W] && g[p + W] < thr) { seen[p + W] = 1; stack[top++] = p + W; }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1, fill = area / (bw * bh), ar = bw / bh;
      if (area >= minA && area <= maxA && ar > .6 && ar < 1.65 && fill > .6) out.push({ x: sx / area, y: sy / area, size: Math.sqrt(area), area, fill });
    }
    return out;
  },
  /** Mean darkness of a disc (radius r mm) around (x, y) mm relative to a ring just outside the bubble: 0 = blank, 1 = solid. */
  probe(img, map, x, y, r = 1.55) {
    const at = (u, v) => { const [px, py] = map(u, v), i = Math.round(py) * img.W + Math.round(px); return px < 0 || py < 0 || px >= img.W || py >= img.H ? 255 : img.g[i]; };
    let s = 0, n = 0; for (let dy = -r; dy <= r; dy += .4) for (let dx = -r; dx <= r; dx += .4) if (dx * dx + dy * dy <= r * r) { s += at(x + dx, y + dy); n++; }
    const inner = s / n; let b = 0, m = 0;
    for (let a = 0; a < 24; a++) { const t = a / 24 * 2 * Math.PI; b += at(x + 2.95 * Math.cos(t), y + 2.95 * Math.sin(t)); m++; }
    const bg = Math.max(60, b / m);
    return Math.max(0, Math.min(1, (bg - inner) / bg));
  },
  T: .4, LOW: .2, HIGH: .55,
  /** Classify one row of bubbles: { on: [indexes filled], conf: 'high'|'low', v: [darkness] }. */
  pick(v) {
    const on = v.map((x, i) => [x, i]).filter(([x]) => x >= this.T).map(([, i]) => i);
    const amb = v.some(x => x >= this.LOW && x < this.HIGH);
    return { on, v, conf: amb ? 'low' : 'high' };
  },
  /** Read one sheet image: { ok, error?, roll, rollConf, set, setConf, answers: [{on, v, conf}], map, img }. */
  read(src, n, sets = 1) {
    const img = this.pixels(src), thr = Math.min(this.otsu(img.g), 150), B = this.blobs(img, thr);
    if (B.length < 4) return { ok: false, error: 'কোণের চারটি কালো চিহ্ন পাওয়া যায়নি' };
    const C = [[0, 0], [img.W, 0], [0, img.H], [img.W, img.H]], diag = Math.hypot(img.W, img.H);
    const pickC = c => B.reduce((best, b) => { const d = Math.hypot(b.x - c[0], b.y - c[1]); return d < best.d ? { b, d } : best; }, { b: null, d: Infinity });
    const corners = C.map(pickC);
    if (corners.some(c => !c.b || c.d > diag * .4) || new Set(corners.map(c => c.b)).size < 4) return { ok: false, error: 'কোণের চারটি কালো চিহ্ন পাওয়া যায়নি' };
    const pts = corners.map(c => [c.b.x, c.b.y]);
    // the sheet may be upside down or turned: try the four rotations, keep the one whose orientation mark is dark
    const rot = [[0, 1, 2, 3], [2, 0, 3, 1], [3, 2, 1, 0], [1, 3, 0, 2]];
    let best = null;
    for (const r of rot) {
      const map = this.homography(this.MK, r.map(i => pts[i])); if (!map) continue;
      const o = this.probe(img, map, ...this.ORIENT, 1.6), e = this.probe(img, map, 46, 14, 1.6);
      if (!best || o - e > best.s) best = { map, s: o - e };
    }
    if (!best || best.s < .3) return { ok: false, error: 'শিটের দিক নির্ণয় করা যায়নি' };
    const map = best.map, P = (x, y) => this.probe(img, map, x, y);
    const rollCols = Array.from({ length: 6 }, (_, c) => this.pick(Array.from({ length: 10 }, (_, d) => P(...this.roll(c, d)))));
    let roll = '', rollConf = 'high';
    rollCols.forEach(c => { if (c.on.length === 1) roll += c.on[0]; else if (c.on.length > 1) rollConf = 'low'; if (c.conf === 'low') rollConf = 'low'; });
    let set = 0, setConf = 'high';
    if (sets > 1) { const s = this.pick(Array.from({ length: sets }, (_, k) => P(...this.set(k)))); if (s.on.length === 1) set = s.on[0]; else setConf = 'low'; if (s.conf === 'low') setConf = 'low'; }
    const answers = Array.from({ length: n }, (_, q) => this.pick(Array.from({ length: 4 }, (_, k) => P(...this.ans(q, k)))));
    return { ok: true, roll: roll.replace(/^0+(?=\d)/, ''), rollConf, set, setConf, answers, map, img };
  },
  /** Score answers against the key of their set. */
  score(answers, key) {
    let score = 0, right = 0, wrong = 0, blank = 0;
    key.forEach((k, q) => {
      const on = (answers[q]?.on || []).slice().sort();
      if (!on.length) { blank++; return; }
      const ok = on.length === k.ans.length && on.every((v, i) => v === k.ans[i]);
      if (ok) { right++; score += k.marks; } else wrong++;
    });
    return { score, right, wrong, blank, max: U.sum(key, k => k.marks) };
  },

  /* ---------- evaluation page ---------- */
  st() {
    const ui = App.ui.omr || (App.ui.omr = { sheets: [] });
    const exams = XO.exams(); if (!exams.some(e => e.id === ui.exam)) ui.exam = exams[0]?.id;
    const ex = DB.exam(ui.exam), cls = ex ? XO.classes().filter(c => DB.examTakes(ex, c)) : [];
    if (!cls.includes(ui.cls)) ui.cls = cls[0];
    const subs = XO.subjects(ui.cls).filter(s => ex && DB.examTakes(ex, ui.cls, s)); if (!subs.includes(ui.sub)) ui.sub = subs[0];
    const paper = ex && ui.cls && ui.sub ? ExamHub.paper('question', ex.id, ui.cls, ui.sub) : null;
    const ctx = `${ui.exam}|${ui.cls}|${ui.sub}`; if (ui.ctx !== ctx) { ui.ctx = ctx; ui.sheets = []; }
    return { ui, exams, ex, cls, subs, paper: paper?.mode === 'build' ? paper : null };
  },
  render() {
    const { ui, exams, ex, cls, subs, paper } = this.st();
    const head = pageHeader('ওএমআর মূল্যায়ন', '');
    if (!exams.length) return head + `<div class="card p-6">${emptyState('কোনো পরীক্ষা নেই।', 'clipboard-list')}</div>`;
    const bar = `<div class="card p-4 mb-4 grid sm:grid-cols-3 gap-3 items-end">${XO.sel('omr-ex', 'পরীক্ষা', XO.opts(exams.map(e => [e.id, e.name]), ui.exam), "App.ui.omr.exam=this.value;App.refresh()")}
      ${XO.sel('omr-cls', 'শ্রেণি', XO.opts(cls.map(c => [c, DB.className(c)]), ui.cls), "App.ui.omr.cls=this.value;App.refresh()")}
      ${XO.sel('omr-sub', 'বিষয়', XO.opts(subs.map(s => [s, DB.subject(s)?.name || s]), ui.sub), "App.ui.omr.sub=this.value;App.refresh()")}</div>`;
    if (!ui.cls || !ui.sub) return head + bar + `<div class="card p-6">${emptyState('এই পরীক্ষায় আপনার কোনো শ্রেণি বা বিষয় নেই।', 'circle-slash')}</div>`;
    if (!paper) return head + bar + `<div class="card p-6">${emptyState('এই বিষয়ের প্রশ্নপত্র প্রশ্ন তৈরির মাধ্যমে বানানো হয়নি — উত্তরমালা নেই।', 'file-x')}</div>`;
    const n = this.key(paper, 0).length, sets = Math.max(1, +paper.content.sets || 1), cfg = Grade.cfg(ex, ui.sub);
    if (!n) return head + bar + `<div class="card p-6">${emptyState('প্রশ্নপত্রে কোনো বহুনির্বাচনি প্রশ্ন নেই।', 'file-x')}</div>`;
    const info = `<div class="card p-4 mb-4 flex flex-wrap items-center gap-3"><div class="mr-auto"><b>${bnNum(n)}টি</b> বহুনির্বাচনি প্রশ্ন · ${bnNum(sets)}টি সেট · পূর্ণমান ${XO.num(this.key(paper, 0).reduce((s, k) => s + k.marks, 0))} (মানবণ্টনে ${bnNum(cfg.mcqMax)})</div>
      <button class="btn btn-ghost" onclick="QB.print('${paper.id}','omr')">${icon('printer')} ওএমআর শিট</button>
      <label class="btn btn-primary cursor-pointer">${icon('upload')} স্ক্যান / ছবি যোগ করুন<input type="file" accept="image/*" multiple class="sr-only" onchange="OMR.files(this.files);this.value=''"></label></div>`;
    return head + bar + info + this.tableHtml(ex, paper);
  },
  tableHtml(ex, paper) {
    const { ui } = this.st(), S = ui.sheets, roster = DB.studentsIn(ui.cls);
    if (!S.length) return `<div class="card p-6">${emptyState('এখনো কোনো উত্তরপত্র যোগ করা হয়নি।', 'scan-line')}</div>`;
    const rows = S.map((s, i) => {
      if (!s.r) return `<tr><td>${esc(s.name)}</td><td colspan="5">${s.busy ? badge('পড়া হচ্ছে…', 'blue') : badge('পড়া যায়নি', 'red') + ' ' + esc(s.error || '')}</td><td><button class="btn btn-ghost btn-sm text-red-600" aria-label="বাদ দিন" title="বাদ দিন" onclick="OMR.drop(${i})">${icon('x')}</button></td></tr>`;
      const sc = this.score(s.r.answers, this.key(paper, s.set)), low = s.r.answers.filter(a => a.conf === 'low' && !a.fixed).length + (s.r.rollConf === 'low' && !s.rollFixed ? 1 : 0) + (s.r.setConf === 'low' && !s.setFixed ? 1 : 0);
      const opts = `<option value="">— শিক্ষার্থী —</option>` + roster.map(st => `<option value="${st.id}" ${st.id === s.sid ? 'selected' : ''}>${bnNum(st.roll)} · ${esc(pn(st))}${st.section ? ' (' + esc(st.section) + ')' : ''}</option>`).join('');
      return `<tr><td class="max-w-[10rem] truncate">${esc(s.name)}</td><td><input class="grid-input !w-24" value="${esc(s.roll)}" aria-label="রোল" onchange="OMR.setRoll(${i},this.value)">${s.r.rollConf === 'low' && !s.rollFixed ? ' ' + badge('যাচাই', 'amber') : ''}</td>
        <td><select class="select !w-auto" aria-label="শিক্ষার্থী" onchange="OMR.setSt(${i},this.value)">${opts}</select></td>
        <td>${+paper.content.sets > 1 ? `<select class="select !w-auto" aria-label="সেট" onchange="OMR.setSet(${i},this.value)">${Array.from({ length: +paper.content.sets }, (_, k) => `<option value="${k}" ${k === s.set ? 'selected' : ''}>${QB.L[k]}</option>`).join('')}</select>` : QB.L[0]}</td>
        <td><b>${XO.num(sc.score)}</b> / ${XO.num(sc.max)} <span class="text-slate-500">(${bnNum(sc.right)}/${bnNum(sc.wrong)}/${bnNum(sc.blank)})</span></td>
        <td>${low ? badge(`${bnNum(low)}টি যাচাই বাকি`, 'amber') : badge('ঠিক আছে', 'green')}</td>
        <td class="whitespace-nowrap"><button class="btn btn-ghost btn-sm" onclick="OMR.reviewSheet(${i})">${icon('scan-eye')} পর্যালোচনা</button><button class="btn btn-ghost btn-sm text-red-600" aria-label="বাদ দিন" title="বাদ দিন" onclick="OMR.drop(${i})">${icon('x')}</button></td></tr>`;
    }).join('');
    const ready = S.filter(s => s.r && s.sid).length;
    return `<div class="card scroll-x"><table class="table"><thead><tr><th>ফাইল</th><th>রোল</th><th>শিক্ষার্থী</th><th>সেট</th><th>নম্বর (সঠিক/ভুল/ফাঁকা)</th><th>অবস্থা</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      <div class="p-4 border-t border-slate-100 flex flex-wrap items-center gap-2"><span class="mr-auto">${bnNum(ready)} / ${bnNum(S.length)}টি শিট শিক্ষার্থীর সঙ্গে মিলেছে</span>${XO.canEdit() || XO.teacher() ? `<button class="btn btn-primary" onclick="OMR.save()" ${ready ? '' : 'disabled'}>${icon('save')} বহুনির্বাচনির নম্বর সংরক্ষণ</button>` : ''}</div></div>`;
  },
  match(roll) { const { ui } = this.st(), c = DB.studentsIn(ui.cls).filter(s => String(s.roll) === String(+roll)); return c.length === 1 ? c[0].id : ''; },
  async files(list) {
    const { ui, paper } = this.st(); if (!paper) return;
    const n = this.key(paper, 0).length, sets = Math.max(1, +paper.content.sets || 1);
    for (const f of [...list]) {
      const s = { name: f.name, busy: true, set: 0, roll: '', sid: '' }; ui.sheets.push(s); App.refresh();
      try {
        const url = URL.createObjectURL(f), im = new Image();
        await new Promise((ok, no) => { im.onload = ok; im.onerror = no; im.src = url; });
        this.load(s, im, n, sets); URL.revokeObjectURL(url);
      } catch (e) { s.error = 'ছবিটি খোলা যায়নি'; }
      s.busy = false; App.refresh();
    }
  },
  /** Read one image into a sheet entry (also used by tests with a canvas). */
  load(s, src, n, sets) {
    const r = this.read(src, n, sets);
    if (!r.ok) { s.error = r.error; s.r = null; return s; }
    s.r = r; s.set = r.set; s.roll = r.roll; s.sid = this.match(r.roll);
    s.thumb = this.preview(r, n, sets);
    return s;
  },
  /** Small picture of the corrected sheet with the detected marks (for the review screen). */
  preview(r, n, sets) {
    const S = 2.4, cv = document.createElement('canvas'); cv.width = 210 * S; cv.height = 297 * S;
    const cx = cv.getContext('2d'), id = cx.createImageData(cv.width, cv.height);
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) { const [px, py] = r.map(x / S, y / S), v = px < 0 || py < 0 || px >= r.img.W || py >= r.img.H ? 255 : r.img.g[Math.round(py) * r.img.W + Math.round(px)], i = (y * cv.width + x) * 4; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    cx.putImageData(id, 0, 0);
    const ring = ([x, y], c) => { cx.strokeStyle = c; cx.lineWidth = 2; cx.beginPath(); cx.arc(x * S, y * S, 3 * S, 0, 7); cx.stroke(); };
    r.answers.forEach((a, q) => a.v.forEach((v, k) => { if (a.on.includes(k)) ring(this.ans(q, k), a.conf === 'low' ? '#d97706' : '#16a34a'); else if (v >= this.LOW) ring(this.ans(q, k), '#d97706'); }));
    return cv.toDataURL('image/jpeg', .8);
  },
  setRoll(i, v) { const s = this.st().ui.sheets[i]; s.roll = U.asciiDigits(v).replace(/\D/g, ''); s.rollFixed = true; s.sid = this.match(s.roll) || s.sid; App.refresh(); },
  setSt(i, v) { const s = this.st().ui.sheets[i]; s.sid = v; s.rollFixed = true; App.refresh(); },
  setSet(i, v) { const s = this.st().ui.sheets[i]; s.set = +v; s.setFixed = true; App.refresh(); },
  drop(i) { this.st().ui.sheets.splice(i, 1); App.refresh(); },
  reviewSheet(i) {
    const { ui, paper } = this.st(), s = ui.sheets[i]; if (!s?.r) return;
    const key = this.key(paper, s.set), L = this.L;
    const row = (a, q) => `<tr class="${a.conf === 'low' && !a.fixed ? 'bg-amber-50' : ''}"><td>${bnNum(q + 1)}</td><td>${a.v.map((v, k) => `<label class="inline-flex items-center gap-1 mr-3"><input type="checkbox" class="w-5 h-5" ${a.on.includes(k) ? 'checked' : ''} onchange="OMR.fix(${i},${q},${k},this.checked)"> ${L[k]} <span class="text-slate-500">${bnNum(Math.round(v * 100))}</span></label>`).join('')}</td><td>${key[q] ? key[q].ans.map(k => L[k]).join(', ') : '—'}</td><td>${a.conf === 'low' && !a.fixed ? badge('যাচাই', 'amber') : ''}</td></tr>`;
    const order = s.r.answers.map((a, q) => [a, q]).sort((x, y) => ((y[0].conf === 'low' && !y[0].fixed) - (x[0].conf === 'low' && !x[0].fixed)) || x[1] - y[1]);
    Modal.open({ title: `পর্যালোচনা · ${s.name}`, size: 'xl', body: `<div class="grid lg:grid-cols-2 gap-4"><div>${s.thumb ? `<img src="${s.thumb}" alt="সংশোধিত উত্তরপত্র" class="w-full border border-slate-200 rounded-lg">` : ''}</div>
      <div class="scroll-x"><table class="table"><thead><tr><th>#</th><th>ভরাট (গাঢ়ত্ব %)</th><th>উত্তরমালা</th><th></th></tr></thead><tbody>${order.map(([a, q]) => row(a, q)).join('')}</tbody></table>
      <button class="btn btn-primary w-full mt-3" onclick="OMR.confirm(${i})">${icon('check')} যাচাই সম্পন্ন</button></div></div>` });
  },
  fix(i, q, k, on) { const a = this.st().ui.sheets[i].r.answers[q], s = new Set(a.on); on ? s.add(k) : s.delete(k); a.on = [...s].sort(); a.fixed = true; },
  confirm(i) { const s = this.st().ui.sheets[i]; s.r.answers.forEach(a => (a.fixed = true)); s.rollFixed = s.setFixed = true; Modal.close(); App.refresh(); },
  save() {
    const { ui, ex, paper } = this.st(), cfg = Grade.cfg(ex, ui.sub), ok = ui.sheets.filter(s => s.r && s.sid);
    if (!ok.length) return;
    const pending = ok.filter(s => s.r.answers.some(a => a.conf === 'low' && !a.fixed) || (s.r.rollConf === 'low' && !s.rollFixed));
    if (pending.length && !confirm(`${bnNum(pending.length)}টি শিটে যাচাই বাকি আছে। তবুও সংরক্ষণ করবেন?`)) return;
    const dup = ok.map(s => s.sid).filter((v, i, a) => a.indexOf(v) !== i); if (dup.length) return toast('একই শিক্ষার্থীর একাধিক শিট আছে — একটি বাদ দিন।', 'error');
    ok.forEach(s => {
      const sc = this.score(s.r.answers, this.key(paper, s.set));
      let m = DB.s.marks.find(x => x.examId === ex.id && x.studentId === s.sid && x.subjectId === ui.sub);
      if (!m) DB.s.marks.push(m = { examId: ex.id, studentId: s.sid, subjectId: ui.sub, cq: 0, mcq: 0, pr: 0 });
      delete m.absent; m.mcq = Math.min(+cfg.mcqMax || sc.score, sc.score);
    });
    DB.audit('OMR_MARKS', 'marks', `${ex.id} · ${ui.cls} · ${ui.sub}: ওএমআর থেকে ${ok.length} জনের বহুনির্বাচনি নম্বর`); DB.save();
    toast(`${bnNum(ok.length)} জনের বহুনির্বাচনি নম্বর সংরক্ষিত হয়েছে।`, 'success');
  },
};
QB.omrSheets = (p, ex) => OMR.sheetHtml(p, ex);

/* ==========================================================================
   5. PAGES: the পরীক্ষা ও ফলাফল sidebar group; old ids redirect
   ========================================================================== */
(() => {
  const G = 'পরীক্ষা ও ফলাফল';
  const staffPages = [
    { id: 'online-tests', label: 'অনলাইন পরীক্ষা', icon: 'monitor-check', module: 'exams', render: () => QZ.render(), mount: () => { } },
    { id: 'exam-attendance', label: 'পরীক্ষার হাজিরা', icon: 'user-check', module: 'exams', render: () => XA.render(), mount: () => { } },
    { id: 'mark-sheet', label: 'নম্বর তোলার শিট', icon: 'file-spreadsheet', module: 'exams', render: () => MS.render(), mount: () => { } },
    { id: 'omr', label: 'ওএমআর মূল্যায়ন', icon: 'scan-line', module: 'exams', render: () => OMR.render(), mount: () => { } },
  ];
  const redirect = (P, id, to, label) => {
    if (P.pages.some(p => p.id === id)) return;
    P.pages.push({ id, label: label || id, icon: 'arrow-right', hidden: true, render: q => { const pt = App.route.portal; App.route.page = to; App.replaceUrl(App.href(pt, to)); return App.portals[pt]?.pages.find(p => p.id === to)?.render(q) || ''; }, mount: q => App.portals[App.route.portal]?.pages.find(p => p.id === to)?.mount?.(q) });
  };
  ['admin', 'principal', 'teacher'].forEach(portal => {
    const P = App.portals[portal]; if (!P) return;
    const gb = portal === 'teacher' ? 'gradebook' : 'marks-entry';
    const me = P.pages.find(p => p.id === gb); if (me) { me.label = 'নম্বরপত্র ও গ্রেডবুক'; me.icon = 'table-2'; }
    let after = me ? gb : P.pages.some(p => p.id === 'exams') ? 'exams' : undefined;
    staffPages.forEach(pg => { if (P.pages.some(p => p.id === pg.id)) return; App.addPage(portal, { ...pg, group: G }, after); after = pg.id; });
    // old / other-portal ids
    redirect(P, portal === 'teacher' ? 'marks-entry' : 'gradebook', gb, 'নম্বরপত্র ও গ্রেডবুক');
    redirect(P, 'quiz', 'online-tests'); redirect(P, 'quizzes', 'online-tests'); redirect(P, 'omr-eval', 'omr'); redirect(P, 'exam-att', 'exam-attendance'); redirect(P, 'marksheet-print', 'mark-sheet');
  });
  ['student', 'guardian'].forEach(portal => {
    const P = App.portals[portal]; if (!P || P.pages.some(p => p.id === 'online-test')) return;
    App.addPage(portal, { id: 'online-test', label: 'অনলাইন পরীক্ষা', icon: 'monitor-check', group: 'পড়াশোনা', render: () => QZ.learnerRender(), mount: () => { } }, P.pages.some(p => p.id === 'exams') ? 'exams' : undefined);
    redirect(P, 'online-tests', 'online-test'); redirect(P, 'quiz', 'online-test');
  });
})();
