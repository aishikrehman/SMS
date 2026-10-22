/* ==========================================================================
   QUESTION BUILDER (প্রশ্ন তৈরি) & QUESTION BANK (প্রশ্ন ব্যাংক) — part of the Exam Centre
   · A structured question paper is an examPapers record with mode 'build' and `content`:
       { time, instr, sets, sections: [{ id, title, instr, any, comp: 'cq'|'mcq'|'pr', time, qs: [question] }] }
     question = { id, type, text, img, marks, opts[], ans, pairs[[l, r]], parts[{ t, m, a }], model, chapter, tags, diff }
   · Totals are checked against the exam's mark distribution for the subject (Grade.cfg: CQ / MCQ / practical).
   · The answer key / solution is built from the MCQ answers and the model answers; "সমাধানে পাঠান" stores it as
     the subject's solution record (kind 'solution', mode 'key'), so it follows the usual approval and
     visibility rules (learners see it only after approval, publishing and the end of the sitting).
   · MCQ sets ক/খ/গ/ঘ shuffle the order of objective questions and their options (deterministic per paper).
   · Prints (js/print.js route /print/<id>): board-style paper, answer key, OMR answer sheet.
   · Question bank: DB.s.qbank — per subject / class / chapter with tags and difficulty; teachers see and write
     only their own subjects (server/access.js), the Principal and Root User see everything, learners nothing.
   Load after examhub.js.
   ========================================================================== */

Object.assign(BN_LABELS, { easy: 'সহজ', medium: 'মাঝারি', hard: 'কঠিন' });
DB.addSeeder('qbank', () => []);

const QB = {
  TYPES: {
    cq: ['সৃজনশীল (সিকিউ)', 'layers'], mcq: ['বহুনির্বাচনি — এক উত্তর', 'list-checks'], mcqm: ['বহুনির্বাচনি — একাধিক উত্তর', 'check-check'],
    match: ['মিলকরণ', 'arrow-left-right'], short: ['সংক্ষিপ্ত উত্তর', 'text'], essay: ['রচনামূলক / বর্ণনামূলক', 'align-left'],
    fill: ['শূন্যস্থান পূরণ', 'pencil-line'], tf: ['সত্য / মিথ্যা', 'toggle-left'], one: ['এক কথায় উত্তর', 'minus'],
    trans: ['অনুবাদ', 'languages'], explain: ['ব্যাখ্যা', 'quote'], map: ['মানচিত্র / চিত্রভিত্তিক', 'map'],
  },
  OBJ: ['mcq', 'mcqm', 'match'],
  L: ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ'],
  DIFF: [['easy', 'সহজ'], ['medium', 'মাঝারি'], ['hard', 'কঠিন']],
  COMP: [['cq', 'সৃজনশীল / লিখিত'], ['mcq', 'বহুনির্বাচনি'], ['pr', 'ব্যবহারিক']],
  DEF_MARKS: { mcq: 1, mcqm: 1, match: 4, short: 2, essay: 10, fill: 1, tf: 1, one: 1, trans: 5, explain: 5, map: 5 },

  uid() { return 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },
  clone(x) { return JSON.parse(JSON.stringify(x)); },
  blank(type) {
    const q = { id: this.uid(), type, text: '', img: '', marks: this.DEF_MARKS[type] || 0, model: '', chapter: '', tags: '', diff: 'medium' };
    if (type === 'cq') q.parts = [1, 2, 3, 4].map(m => ({ t: '', m, a: '' }));
    if (type === 'mcq' || type === 'mcqm') { q.opts = ['', '', '', '']; q.ans = type === 'mcq' ? 0 : []; }
    if (type === 'match') q.pairs = [['', ''], ['', ''], ['', ''], ['', '']];
    if (type === 'tf') q.ans = 'T';
    return q;
  },
  marks(q) { return q.type === 'cq' ? U.sum(q.parts || [], p => +p.m || 0) : +q.marks || 0; },
  secTotal(s) { const m = s.qs.map(q => this.marks(q)).sort((a, b) => b - a), n = +s.any || 0; return U.sum(n > 0 && n < m.length ? m.slice(0, n) : m); },
  totals(c) { const t = { cq: 0, mcq: 0, pr: 0 }; c.sections.forEach(s => { t[s.comp in t ? s.comp : 'cq'] += this.secTotal(s); }); return t; },
  need(ex, sid) { const g = Grade.cfg(ex, sid); return { cq: +g.cqMax || 0, mcq: +g.mcqMax || 0, pr: +g.prMax || 0 }; },
  mm(a, b) { const d = U.d(`2000-01-01T${b}`) - U.d(`2000-01-01T${a}`); return isNaN(d) ? 0 : Math.round(d / 60000); },
  dur(min) { if (!min || min < 0) return ''; const h = Math.floor(min / 60), m = min % 60; return [h ? `${bnNum(h)} ঘণ্টা` : '', m ? `${bnNum(m)} মিনিট` : ''].filter(Boolean).join(' '); },
  /** A fresh paper laid out from the exam's mark distribution. */
  defaults(ex, cls, sid) {
    const need = this.need(ex, sid), slot = DB.paperSlot(ex, cls, sid), sections = [];
    if (need.cq) sections.push({ id: this.uid(), title: need.mcq ? 'ক বিভাগ — সৃজনশীল' : 'লিখিত অংশ', instr: 'ডান পাশের সংখ্যা প্রশ্নের পূর্ণমান জ্ঞাপক।', any: 0, comp: 'cq', time: '', qs: [] });
    if (need.mcq) sections.push({ id: this.uid(), title: need.cq ? 'খ বিভাগ — বহুনির্বাচনি' : 'বহুনির্বাচনি অংশ', instr: 'সঠিক উত্তরের বৃত্তটি বলপয়েন্ট কলম দিয়ে সম্পূর্ণ ভরাট করো।', any: 0, comp: 'mcq', time: '', qs: [] });
    if (!sections.length) sections.push({ id: this.uid(), title: 'প্রশ্নপত্র', instr: '', any: 0, comp: 'cq', time: '', qs: [] });
    return { time: slot ? this.dur(this.mm(slot.start, slot.end)) : '', instr: '', sets: 1, sections };
  },
  /** Plain text of a structured paper (kept in `text` so search and older readers still have something). */
  plain(c) { return c.sections.map(s => `${s.title}\n` + s.qs.map((q, i) => `${i + 1}. ${q.text}`).join('\n')).join('\n\n').slice(0, 20000); },

  /* ---------- the builder page ---------- */
  st() { return App.ui.qb; },
  open(examId, cls, sid) {
    if (!ExamHub.canWrite(cls, sid)) return toast('এই বিষয়ের প্রশ্নপত্র তৈরির অনুমতি নেই।', 'error');
    const ex = DB.exam(examId), p = ExamHub.paper('question', examId, cls, sid);
    if (p && p.status === 'approved' && !ExamHub.canManage()) return toast('প্রশ্নপত্রটি অনুমোদিত — আর পরিবর্তন করা যাবে না।', 'error');
    if (p && p.status === 'submitted' && ExamHub.isTeacher() && !confirm('প্রশ্নপত্রটি জমা দেওয়া আছে। সম্পাদনা করলে আবার জমা দিতে হবে। চালিয়ে যাবেন?')) return;
    const c = p?.mode === 'build' && p.content ? this.clone(p.content) : this.defaults(ex, cls, sid);
    App.ui.qb = { examId, cls, sid, c };
    App.openDetail({ title: `প্রশ্ন তৈরি · ${DB.subject(sid)?.name || ''} · ${DB.className(cls)}`, render: () => this.html(), mount: () => App.icons() });
  },
  html() {
    const S = this.st(); if (!S) return emptyState('কোনো প্রশ্নপত্র খোলা নেই।');
    const ex = DB.exam(S.examId), c = S.c, need = this.need(ex, S.sid), got = this.totals(c), slot = DB.paperSlot(ex, S.cls, S.sid), p = ExamHub.paper('question', S.examId, S.cls, S.sid);
    const chk = (k, label) => need[k] || got[k] ? `<div class="rounded-lg border px-3 py-2 ${got[k] === need[k] ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}"><div class="font-semibold">${label}</div><div>${bnNum(got[k])} / ${bnNum(need[k])} ${got[k] === need[k] ? icon('check', 'w-4 h-4 inline') : got[k] > need[k] ? '(বেশি)' : '(কম)'}</div></div>` : '';
    const ok = ['cq', 'mcq', 'pr'].every(k => got[k] === need[k]);
    const head = `<div class="card p-4 mb-4 space-y-3"><div class="flex flex-wrap gap-x-6 gap-y-1"><span><b>পরীক্ষা:</b> ${esc(ex.name)}</span><span><b>শ্রেণি:</b> ${esc(DB.className(S.cls))}</span><span><b>বিষয়:</b> ${esc(DB.subject(S.sid)?.name || '')}</span><span><b>পরীক্ষার দিন:</b> ${slot ? `${U.fmtDate(slot.date)} · ${U.bn(slot.start)}–${U.bn(slot.end)}` : 'রুটিনে নেই'}</span>${p ? `<span><b>অবস্থা:</b> ${esc(bn(p.status))}${p.published ? ' · প্রকাশিত' : ''}</span>` : ''}</div>
      <div class="grid sm:grid-cols-3 gap-3"><div><label class="label" for="qb-time">সময়</label><input id="qb-time" class="input" value="${esc(c.time || '')}" placeholder="যেমন: ২ ঘণ্টা ৩০ মিনিট" oninput="QB.st().c.time=this.value"></div>
        <div><label class="label" for="qb-sets">বহুনির্বাচনির সেট</label><select id="qb-sets" class="select" onchange="QB.st().c.sets=+this.value;App.refresh()">${[1, 2, 3, 4].map(n => `<option value="${n}" ${+c.sets === n ? 'selected' : ''}>${n === 1 ? 'একটি সেট' : `${bnNum(n)}টি সেট (${this.L.slice(0, n).join(', ')})`}</option>`).join('')}</select></div>
        <div><label class="label">পূর্ণমান (মানবণ্টন অনুযায়ী)</label><div class="input bg-slate-50">${bnNum(need.cq + need.mcq + need.pr)}</div></div>
        <div class="sm:col-span-3"><label class="label" for="qb-instr">সাধারণ নির্দেশনা (ঐচ্ছিক)</label><input id="qb-instr" class="input" value="${esc(c.instr || '')}" oninput="QB.st().c.instr=this.value"></div></div>
      <div class="flex flex-wrap gap-2 items-stretch">${chk('cq', 'সৃজনশীল / লিখিত')}${chk('mcq', 'বহুনির্বাচনি')}${chk('pr', 'ব্যবহারিক')}<div class="rounded-lg border px-3 py-2 ${ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200'}"><div class="font-semibold">মোট</div><div>${bnNum(got.cq + got.mcq + got.pr)} / ${bnNum(need.cq + need.mcq + need.pr)}</div></div></div>
      ${ok ? '' : `<div class="text-amber-800">${icon('alert-triangle', 'w-4 h-4 inline')} প্রশ্নের নম্বর এই পরীক্ষার মানবণ্টনের সঙ্গে মিলছে না। প্রতিটি বিভাগের "অংশ" ঠিক আছে কি না দেখুন।</div>`}</div>`;
    const secs = c.sections.map((s, i) => this.secHtml(s, i, c.sections.length)).join('');
    const acts = `<div class="flex flex-wrap gap-2 sticky bottom-0 bg-[var(--surface)] py-3 border-t border-slate-100">
      <button type="button" class="btn btn-ghost" onclick="QB.addSec()">${icon('plus')} নতুন বিভাগ</button><span class="flex-1"></span>
      <button type="button" class="btn btn-ghost" onclick="QB.preview('paper')">${icon('eye')} প্রিভিউ</button>
      <button type="button" class="btn btn-ghost" onclick="QB.save('draft')">${icon('save')} খসড়া সংরক্ষণ</button>
      ${ExamHub.canManage() ? `<button type="button" class="btn btn-primary" onclick="QB.save('approved')">${icon('check')} সংরক্ষণ ও অনুমোদন</button>` : `<button type="button" class="btn btn-primary" onclick="QB.save('submitted')">${icon('send')} সংরক্ষণ ও জমা দিন</button>`}</div>`;
    const tools = p?.mode === 'build' ? `<div class="card p-4 mb-4 flex flex-wrap gap-2 items-center"><div class="font-semibold flex-1 min-w-[12rem]">সংরক্ষিত প্রশ্নপত্রের মুদ্রণ ও সমাধান</div>
      ${Array.from({ length: Math.max(1, +p.content?.sets || 1) }, (_, k) => `<button type="button" class="btn btn-ghost btn-sm" onclick="QB.print('${p.id}','paper',${k})">${icon('printer')} প্রশ্নপত্র${+p.content?.sets > 1 ? ` (সেট ${this.L[k]})` : ''}</button>`).join('')}
      <button type="button" class="btn btn-ghost btn-sm" onclick="QB.print('${p.id}','key')">${icon('key-round')} উত্তরমালা</button><button type="button" class="btn btn-ghost btn-sm" onclick="QB.print('${p.id}','omr')">${icon('scan-line')} ওএমআর শিট</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="QB.toSolution('${p.id}')">${icon('file-check')} সমাধানে পাঠান</button></div>` : '';
    return head + tools + secs + acts;
  },
  secHtml(s, i, n) {
    const tone = { cq: 'blue', mcq: 'violet', pr: 'amber' }[s.comp] || 'slate';
    const rows = s.qs.map((q, k) => `<div class="flex flex-wrap items-start gap-2 py-2 border-t border-slate-100"><div class="font-bold w-8 shrink-0">${bnNum(k + 1)}.</div>
        <div class="flex-1 min-w-[12rem]"><div class="flex flex-wrap gap-1 mb-1">${badge(this.TYPES[q.type]?.[0] || q.type, tone)}${q.chapter ? badge(q.chapter, 'slate') : ''}${q.img ? badge('ছবি', 'slate') : ''}</div><div class="line-clamp-2">${esc((q.text || '').slice(0, 220)) || '<span class="text-slate-400">(লেখা নেই)</span>'}</div></div>
        <div class="font-semibold whitespace-nowrap">${bnNum(this.marks(q))} নম্বর</div>
        <div class="flex flex-wrap gap-1"><button type="button" class="btn btn-ghost btn-sm" title="সম্পাদনা" aria-label="সম্পাদনা" onclick="QB.editQ(${i},${k})">${icon('pencil')}</button><button type="button" class="btn btn-ghost btn-sm" title="ওপরে" aria-label="ওপরে" onclick="QB.moveQ(${i},${k},-1)" ${k ? '' : 'disabled'}>${icon('arrow-up')}</button><button type="button" class="btn btn-ghost btn-sm" title="নিচে" aria-label="নিচে" onclick="QB.moveQ(${i},${k},1)" ${k < s.qs.length - 1 ? '' : 'disabled'}>${icon('arrow-down')}</button><button type="button" class="btn btn-ghost btn-sm" title="প্রশ্ন ব্যাংকে রাখুন" aria-label="প্রশ্ন ব্যাংকে রাখুন" onclick="QB.toBank(${i},${k})">${icon('library')}</button><button type="button" class="btn btn-ghost btn-sm text-red-600" title="মুছুন" aria-label="মুছুন" onclick="QB.delQ(${i},${k})">${icon('trash-2')}</button></div></div>`).join('');
    return `<div class="card p-4 mb-4"><div class="grid sm:grid-cols-6 gap-3 items-end">
        <div class="sm:col-span-2"><label class="label">বিভাগের শিরোনাম</label><input class="input" value="${esc(s.title)}" oninput="QB.st().c.sections[${i}].title=this.value"></div>
        <div class="sm:col-span-2"><label class="label">অংশ (মানবণ্টন)</label><select class="select" onchange="QB.st().c.sections[${i}].comp=this.value;App.refresh()">${this.COMP.map(([k, l]) => `<option value="${k}" ${s.comp === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="sm:col-span-1"><label class="label">যেকোনো কয়টি</label><input class="input" type="number" min="0" value="${+s.any || 0}" title="০ = সবগুলো" onchange="QB.st().c.sections[${i}].any=Math.max(0,+this.value||0);App.refresh()"></div>
        <div class="sm:col-span-1"><label class="label">বিভাগের সময়</label><input class="input" value="${esc(s.time || '')}" placeholder="ঐচ্ছিক" oninput="QB.st().c.sections[${i}].time=this.value"></div>
        <div class="sm:col-span-6"><label class="label">নির্দেশনা</label><input class="input" value="${esc(s.instr || '')}" oninput="QB.st().c.sections[${i}].instr=this.value"></div></div>
      <div class="flex flex-wrap items-center gap-2 mt-3"><span class="font-semibold">${bnNum(s.qs.length)}টি প্রশ্ন · মান ${bnNum(this.secTotal(s))}${+s.any && +s.any < s.qs.length ? ` (যেকোনো ${bnNum(s.any)}টি)` : ''}</span><span class="flex-1"></span>
        <button type="button" class="btn btn-ghost btn-sm" onclick="QB.moveSec(${i},-1)" ${i ? '' : 'disabled'} aria-label="বিভাগ ওপরে">${icon('arrow-up')}</button><button type="button" class="btn btn-ghost btn-sm" onclick="QB.moveSec(${i},1)" ${i < n - 1 ? '' : 'disabled'} aria-label="বিভাগ নিচে">${icon('arrow-down')}</button><button type="button" class="btn btn-ghost btn-sm text-red-600" onclick="QB.delSec(${i})" aria-label="বিভাগ মুছুন">${icon('trash-2')}</button></div>
      <div class="mt-2">${rows || `<div class="text-slate-500 py-2">এই বিভাগে এখনো কোনো প্রশ্ন নেই।</div>`}</div>
      <div class="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100"><select class="select !w-auto max-w-full" id="qb-type-${i}" aria-label="প্রশ্নের ধরন">${Object.entries(this.TYPES).map(([k, [l]]) => `<option value="${k}" ${(s.comp === 'mcq' ? k === 'mcq' : k === 'cq') ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button type="button" class="btn btn-primary btn-sm" onclick="QB.addQ(${i},document.getElementById('qb-type-${i}').value)">${icon('plus')} প্রশ্ন যোগ</button><button type="button" class="btn btn-ghost btn-sm" onclick="QB.bankPick(${i})">${icon('library')} প্রশ্ন ব্যাংক থেকে</button></div></div>`;
  },
  addSec() { this.st().c.sections.push({ id: this.uid(), title: `${this.L[this.st().c.sections.length] || ''} বিভাগ`, instr: '', any: 0, comp: 'cq', time: '', qs: [] }); App.refresh(); },
  delSec(i) { const s = this.st().c.sections[i]; if (s.qs.length && !confirm(`"${s.title}" বিভাগ ও এর ${bnNum(s.qs.length)}টি প্রশ্ন মুছে ফেলবেন?`)) return; this.st().c.sections.splice(i, 1); App.refresh(); },
  moveSec(i, d) { const a = this.st().c.sections, j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; App.refresh(); },
  moveQ(i, k, d) { const a = this.st().c.sections[i].qs, j = k + d; if (j < 0 || j >= a.length) return; [a[k], a[j]] = [a[j], a[k]]; App.refresh(); },
  delQ(i, k) { if (!confirm('প্রশ্নটি মুছে ফেলবেন?')) return; this.st().c.sections[i].qs.splice(k, 1); App.refresh(); },
  /** Save the paper (draft / submitted / approved) through the normal Exam Centre workflow. */
  save(status) {
    const S = this.st(), ex = DB.exam(S.examId);
    if (!ExamHub.canWrite(S.cls, S.sid)) return toast('অনুমতি নেই।', 'error');
    if (status === 'approved' && !ExamHub.canManage()) return toast('শুধু অধ্যক্ষ বা রুট ব্যবহারকারী অনুমোদন করতে পারেন।', 'error');
    const n = U.sum(S.c.sections, s => s.qs.length);
    if (!n) return toast('অন্তত একটি প্রশ্ন যোগ করুন।', 'error');
    const need = this.need(ex, S.sid), got = this.totals(S.c);
    if (status !== 'draft' && !['cq', 'mcq', 'pr'].every(k => got[k] === need[k]) && !confirm('প্রশ্নের মোট নম্বর মানবণ্টনের সঙ্গে মিলছে না। তবুও সংরক্ষণ করবেন?')) return;
    let p = ExamHub.paper('question', S.examId, S.cls, S.sid);
    if (p && p.status === 'approved' && !ExamHub.canManage()) return toast('প্রশ্নপত্রটি অনুমোদিত — আর পরিবর্তন করা যাবে না।', 'error');
    const before = p ? this.clone(p) : null, isNew = !p;
    if (isNew) ExamHub.papers().push(p = { id: DB.id('XP'), kind: 'question', examId: S.examId, classId: S.cls, subjectId: S.sid, published: false, createdAt: U.today() });
    Object.assign(p, { mode: 'build', content: this.clone(S.c), text: this.plain(S.c), dataUrl: null, fileName: null, fileType: null, status, by: p.by && !isNew && ExamHub.canManage() ? p.by : App.session.userId, updatedAt: U.today(), note: status === 'draft' ? (p.note || '') : '' });
    if (status === 'approved') Object.assign(p, { approvedBy: App.session.userId, approvedAt: U.today() });
    DB.audit('EXAM_PAPER_SAVE', 'exams', `question (built) ${S.examId} · ${S.cls} · ${S.sid} → ${status} · ${n} questions`);
    if (!DB.save()) { if (isNew) DB.s.examPapers = ExamHub.papers().filter(x => x !== p); else Object.assign(p, before); DB.save(); return toast('সংরক্ষণস্থান পূর্ণ — ছবির আকার কমিয়ে আবার চেষ্টা করুন।', 'error'); }
    toast(status === 'submitted' ? 'জমা দেওয়া হয়েছে — অনুমোদনের অপেক্ষায়।' : status === 'approved' ? 'সংরক্ষিত ও অনুমোদিত।' : 'খসড়া সংরক্ষিত হয়েছে।', 'success');
    App.refresh();
  },
  /** Unsaved builder content → print view (re-built from the saved paper after a reload). */
  preview(what) {
    const S = this.st(), p = ExamHub.paper('question', S.examId, S.cls, S.sid);
    const paper = { ...(p || { id: 'draft', kind: 'question', examId: S.examId, classId: S.cls, subjectId: S.sid }), content: this.clone(S.c) };
    const r = this.build(paper, what, 0);
    if (!r.sheets.length) return toast('মুদ্রণযোগ্য কিছু নেই।', 'warn');
    Print.preview(r.title + ' (প্রিভিউ)', r.sheets, p?.mode === 'build' ? { re: ['QB.print', p.id, what, 0] } : {});
  },

  /* ---------- question editor (in-place page) ---------- */
  addQ(i, type) { const q = this.blank(this.TYPES[type] ? type : 'short'); if (this.st().c.sections[i]?.comp === 'mcq' && !this.OBJ.includes(q.type)) q.marks = 1; App.ui.qbq = { i, k: -1, q }; this.editPage(); },
  editQ(i, k) { App.ui.qbq = { i, k, q: this.clone(this.st().c.sections[i].qs[k]) }; this.editPage(); },
  editPage() { App.openDetail({ title: App.ui.qbq.k < 0 ? 'নতুন প্রশ্ন' : 'প্রশ্ন সম্পাদনা', render: () => this.qFormHtml(), mount: () => this.qFormMount() }); },
  chapters() {
    const S = this.st() || {}, set = new Set();
    DB.s.syllabus.filter(sy => sy.classId === S.cls && sy.subjectId === S.sid).forEach(sy => (sy.chapters || []).forEach(c => c.name && set.add(c.name)));
    (DB.s.qbank || []).filter(b => b.subjectId === S.sid && b.chapter).forEach(b => set.add(b.chapter));
    return [...set];
  },
  qFormHtml() {
    const { q } = App.ui.qbq, t = q.type, L = this.L;
    const area = (name, label, val, rows = 3, ph = '') => `<div><label class="label" for="qf-${name}">${label}</label><textarea id="qf-${name}" class="input" name="${name}" rows="${rows}" placeholder="${ph}">${esc(val || '')}</textarea></div>`;
    let body = '';
    if (t === 'cq') body = `<div class="space-y-3">${q.parts.map((p, k) => `<div class="rounded-lg border border-slate-200 p-3 space-y-2"><div class="flex flex-wrap gap-2 items-end"><div class="font-bold w-8">(${L[k]})</div><div class="flex-1 min-w-[12rem]"><label class="label" for="qf-pt${k}">প্রশ্ন</label><input id="qf-pt${k}" class="input" name="pt${k}" value="${esc(p.t)}"></div><div class="w-24"><label class="label" for="qf-pm${k}">নম্বর</label><input id="qf-pm${k}" class="input" type="number" min="0" step="0.5" name="pm${k}" value="${+p.m}"></div></div>
        <div><label class="label" for="qf-pa${k}">নমুনা উত্তর (ঐচ্ছিক)</label><textarea id="qf-pa${k}" class="input" name="pa${k}" rows="2">${esc(p.a || '')}</textarea></div></div>`).join('')}</div>`;
    else if (t === 'mcq' || t === 'mcqm') body = `<div class="space-y-2"><div class="label">বিকল্প ও সঠিক উত্তর (${t === 'mcq' ? 'একটি বেছে নিন' : 'সবগুলো সঠিক উত্তরে টিক দিন'})</div>${q.opts.map((o, k) => `<div class="flex items-center gap-2"><input type="${t === 'mcq' ? 'radio' : 'checkbox'}" name="${t === 'mcq' ? 'ans' : 'ansm'}" value="${k}" class="w-5 h-5 shrink-0" aria-label="সঠিক উত্তর ${L[k]}" ${t === 'mcq' ? (+q.ans === k ? 'checked' : '') : ((q.ans || []).includes(k) ? 'checked' : '')}><span class="font-bold w-6">${L[k]}</span><input class="input" name="o${k}" value="${esc(o)}" aria-label="বিকল্প ${L[k]}"></div>`).join('')}</div>`;
    else if (t === 'match') body = `<div class="space-y-2"><div class="label">বাম পাশ ও তার সঠিক মিল (মুদ্রণে ডান পাশ এলোমেলো হয়ে যাবে)</div>${q.pairs.map((pr, k) => `<div class="grid grid-cols-[2rem_1fr_1fr] gap-2 items-center"><span class="font-bold">${bnNum(k + 1)}.</span><input class="input" name="pl${k}" value="${esc(pr[0])}" aria-label="বাম ${bnNum(k + 1)}"><input class="input" name="pr${k}" value="${esc(pr[1])}" aria-label="মিল ${bnNum(k + 1)}"></div>`).join('')}
        <div class="flex gap-2"><button type="button" class="btn btn-ghost btn-sm" onclick="QB.qPairs(1)" ${q.pairs.length >= 8 ? 'disabled' : ''}>${icon('plus')} সারি যোগ</button><button type="button" class="btn btn-ghost btn-sm" onclick="QB.qPairs(-1)" ${q.pairs.length <= 2 ? 'disabled' : ''}>${icon('minus')} সারি কমান</button></div></div>`;
    else if (t === 'tf') body = `<div><div class="label">সঠিক উত্তর</div><div class="flex gap-4">${[['T', 'সত্য'], ['F', 'মিথ্যা']].map(([v, l]) => `<label class="flex items-center gap-2"><input type="radio" name="tf" value="${v}" class="w-5 h-5" ${q.ans === v ? 'checked' : ''}>${l}</label>`).join('')}</div></div>`;
    const model = t === 'mcq' || t === 'mcqm' || t === 'match' || t === 'cq' ? '' : area('model', t === 'fill' || t === 'one' ? 'সঠিক উত্তর' : 'নমুনা উত্তর / উত্তরের মূল বিষয়', q.model, t === 'essay' ? 6 : 3);
    return `<form id="qf" class="space-y-4" onsubmit="event.preventDefault();QB.qSave()"><div class="card p-4 space-y-3">
      <div class="grid sm:grid-cols-3 gap-3"><div><label class="label" for="qf-type">প্রশ্নের ধরন</label><select id="qf-type" class="select" name="type" onchange="QB.qType(this.value)">${Object.entries(this.TYPES).map(([k, [l]]) => `<option value="${k}" ${k === t ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div><label class="label" for="qf-chapter">অধ্যায়</label><input id="qf-chapter" class="input" name="chapter" list="qf-chlist" value="${esc(q.chapter || '')}"><datalist id="qf-chlist">${this.chapters().map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
        <div><label class="label" for="qf-diff">কাঠিন্য</label><select id="qf-diff" class="select" name="diff">${this.DIFF.map(([k, l]) => `<option value="${k}" ${q.diff === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="sm:col-span-2"><label class="label" for="qf-tags">ট্যাগ (কমা দিয়ে আলাদা করুন)</label><input id="qf-tags" class="input" name="tags" value="${esc(q.tags || '')}"></div>
        ${t === 'cq' ? `<div><label class="label">মোট নম্বর</label><div class="input bg-slate-50">${bnNum(this.marks(q))}</div></div>` : `<div><label class="label" for="qf-marks">নম্বর</label><input id="qf-marks" class="input" type="number" min="0" step="0.5" name="marks" value="${+q.marks || 0}"></div>`}</div>
      ${area('text', t === 'cq' ? 'উদ্দীপক' : t === 'fill' ? 'প্রশ্ন (শূন্যস্থানের জায়গায় ___ লিখুন)' : t === 'trans' ? 'অনুবাদের জন্য অনুচ্ছেদ' : t === 'map' ? 'প্রশ্ন / নির্দেশনা' : 'প্রশ্ন', q.text, t === 'cq' || t === 'trans' ? 5 : 3)}
      <div><div class="label">ছবি ${t === 'map' ? '(মানচিত্র বা চিত্র)' : '(ঐচ্ছিক)'}</div><div class="flex flex-wrap items-center gap-3">${q.img ? `<img src="${q.img}" alt="প্রশ্নের ছবি" class="max-h-40 rounded border border-slate-200"><button type="button" class="btn btn-ghost btn-sm text-red-600" onclick="QB.qImg(null)">${icon('x')} ছবি সরান</button>` : ''}<label class="btn btn-ghost btn-sm cursor-pointer">${icon('image')} ${q.img ? 'ছবি বদলান' : 'ছবি যোগ করুন'}<input type="file" accept="image/*" class="hidden" onchange="QB.qImg(this.files[0])"></label></div></div>
      ${body}${model}
      <label class="flex items-center gap-2"><input type="checkbox" name="bank" class="w-5 h-5" ${App.ui.qbq.bank ? 'checked' : ''}> প্রশ্নটি প্রশ্ন ব্যাংকেও রাখুন</label></div>
      <div class="flex flex-wrap gap-2 sticky bottom-0 bg-[var(--surface)] py-3"><span class="flex-1"></span><button type="button" class="btn btn-ghost" onclick="App.closeDetail()">বাতিল</button><button class="btn btn-primary">${icon('save')} প্রশ্ন সংরক্ষণ</button></div></form>`;
  },
  qFormMount() { App.icons(); },
  /** Copy the form into App.ui.qbq.q (before any re-render). */
  qRead() {
    const f = $('#qf'), q = App.ui.qbq?.q; if (!f || !q) return q;
    const v = n => f.elements[n]?.value ?? '';
    Object.assign(q, { text: v('text').trim(), chapter: v('chapter').trim(), diff: v('diff') || 'medium', tags: v('tags').trim() });
    App.ui.qbq.bank = !!f.elements.bank?.checked;
    if (f.elements.marks) q.marks = Math.max(0, +v('marks') || 0);
    if (f.elements.model) q.model = v('model').trim();
    if (q.type === 'cq') q.parts = q.parts.map((p, k) => ({ t: v(`pt${k}`).trim(), m: Math.max(0, +v(`pm${k}`) || 0), a: v(`pa${k}`).trim() }));
    if (q.type === 'mcq' || q.type === 'mcqm') {
      q.opts = q.opts.map((o, k) => v(`o${k}`).trim());
      q.ans = q.type === 'mcq' ? +(f.querySelector('input[name=ans]:checked')?.value ?? 0) : $$('input[name=ansm]:checked', f).map(x => +x.value);
    }
    if (q.type === 'match') q.pairs = q.pairs.map((p, k) => [v(`pl${k}`).trim(), v(`pr${k}`).trim()]);
    if (q.type === 'tf') q.ans = f.querySelector('input[name=tf]:checked')?.value || 'T';
    return q;
  },
  qType(type) {
    const old = this.qRead(), q = this.blank(type);
    Object.assign(q, { id: old.id, text: old.text, img: old.img, chapter: old.chapter, tags: old.tags, diff: old.diff, model: old.model });
    App.ui.qbq.q = q; App.refresh();
  },
  qPairs(d) { const q = this.qRead(); if (d > 0 && q.pairs.length < 8) q.pairs.push(['', '']); if (d < 0 && q.pairs.length > 2) q.pairs.pop(); App.refresh(); },
  async qImg(file) {
    const q = this.qRead();
    if (!file) { q.img = ''; return App.refresh(); }
    if (!file.type.startsWith('image/')) return toast('শুধু ছবি (JPG/PNG) দেওয়া যাবে।', 'error');
    try { q.img = await readUpload(file, 900); App.refresh(); } catch (e) { toast(e.message, 'error'); }
  },
  qSave() {
    const q = this.qRead(), { i, k } = App.ui.qbq, s = this.st()?.c.sections[i]; if (!s) return App.closeDetail();
    if (!q.text && q.type !== 'cq' && !q.img) return toast('প্রশ্ন লিখুন।', 'error');
    if (q.type === 'cq' && (!q.text && !q.img || q.parts.some(p => !p.t))) return toast('উদ্দীপক এবং ক–ঘ চারটি প্রশ্নই লিখুন।', 'error');
    if ((q.type === 'mcq' || q.type === 'mcqm') && q.opts.filter(Boolean).length < q.opts.length) return toast('চারটি বিকল্পই লিখুন।', 'error');
    if (q.type === 'mcqm' && !q.ans.length) return toast('অন্তত একটি সঠিক উত্তর চিহ্নিত করুন।', 'error');
    if (q.type === 'match' && q.pairs.some(p => !p[0] || !p[1])) return toast('মিলকরণের প্রতিটি সারির দুই পাশই লিখুন।', 'error');
    if (k < 0) s.qs.push(q); else s.qs[k] = q;
    if (App.ui.qbq.bank) this.bankAdd(q);
    App.ui.qbq = null; App.closeDetail();
  },

  /* ---------- question bank ---------- */
  bank() { return DB.s.qbank || (DB.s.qbank = []); },
  /** Subjects whose bank the current user may use (teachers: the subjects they teach). */
  mySubjects() {
    if (ExamHub.isStaff()) return DB.s.subjects.filter(s => s.active !== false).map(s => s.id);
    if (!ExamHub.isTeacher()) return [];
    return [...new Set(Teacher.myClasses().flatMap(c => Teacher.mySubjects(c)))];
  },
  bankRows() { const subs = new Set(this.mySubjects()), uid = App.session?.userId; return this.bank().filter(b => ExamHub.isStaff() || subs.has(b.subjectId) || b.by === uid); },
  bankAdd(q, subjectId, classId) {
    const S = this.st() || {}, sid = subjectId || S.sid, cls = classId || S.cls;
    if (!this.mySubjects().includes(sid)) return toast('এই বিষয়ের প্রশ্ন ব্যাংকে লেখার অনুমতি নেই।', 'error');
    const body = this.clone(q); delete body.id;
    if (this.bank().some(b => b.subjectId === sid && b.classId === cls && JSON.stringify(b.q) === JSON.stringify(body))) return toast('প্রশ্নটি আগে থেকেই ব্যাংকে আছে।', 'warn');
    this.bank().push({ id: DB.id('QB'), subjectId: sid, classId: cls, chapter: q.chapter || '', tags: String(q.tags || '').split(',').map(x => x.trim()).filter(Boolean), diff: q.diff || 'medium', type: q.type, q: body, by: App.session.userId, at: U.today() });
    DB.audit('QBANK_ADD', 'exams', `${sid} · ${cls} · ${q.type}`); DB.save(); toast('প্রশ্ন ব্যাংকে রাখা হয়েছে।', 'success');
  },
  toBank(i, k) { this.bankAdd(this.st().c.sections[i].qs[k]); },
  bankDel(id) {
    const b = this.bank().find(x => x.id === id); if (!b) return;
    if (!ExamHub.isStaff() && b.by !== App.session?.userId) return toast('শুধু নিজের যোগ করা প্রশ্ন মুছতে পারবেন।', 'error');
    if (!confirm('প্রশ্নটি ব্যাংক থেকে মুছে ফেলবেন?')) return;
    DB.s.qbank = this.bank().filter(x => x.id !== id); DB.audit('QBANK_DELETE', 'exams', id); DB.save(); App.refresh();
  },
  bankFilter(f) {
    const q = String(f.q || '').toLowerCase();
    return this.bankRows().filter(b => (!f.sid || b.subjectId === f.sid) && (!f.cls || b.classId === f.cls) && (!f.type || b.type === f.type) && (!f.diff || b.diff === f.diff)
      && (!f.ch || b.chapter === f.ch) && (!q || [b.q.text, b.chapter, ...(b.tags || [])].join(' ').toLowerCase().includes(q)));
  },
  bankFilters(f, on) {
    const subs = this.mySubjects(), chs = [...new Set(this.bankRows().filter(b => !f.sid || b.subjectId === f.sid).map(b => b.chapter).filter(Boolean))];
    const sel = (k, label, opts) => `<div class="min-w-0"><label class="label" for="qbf-${k}">${label}</label><select id="qbf-${k}" class="select" onchange="${on}('${k}',this.value)">${opts}</select></div>`;
    return `<div class="card p-4 mb-4 grid grid-cols-2 lg:grid-cols-6 gap-3 items-end">
      ${sel('sid', 'বিষয়', `<option value="">সব বিষয়</option>` + subs.map(id => `<option value="${id}" ${f.sid === id ? 'selected' : ''}>${esc(DB.subject(id)?.name || id)}</option>`).join(''))}
      ${sel('cls', 'শ্রেণি', `<option value="">সব শ্রেণি</option>` + DB.s.classes.map(c => `<option value="${c.id}" ${f.cls === c.id ? 'selected' : ''}>${esc(DB.className(c.id))}</option>`).join(''))}
      ${sel('ch', 'অধ্যায়', `<option value="">সব অধ্যায়</option>` + chs.map(c => `<option value="${esc(c)}" ${f.ch === c ? 'selected' : ''}>${esc(c)}</option>`).join(''))}
      ${sel('type', 'ধরন', `<option value="">সব ধরন</option>` + Object.entries(this.TYPES).map(([k, [l]]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${l}</option>`).join(''))}
      ${sel('diff', 'কাঠিন্য', `<option value="">সব</option>` + this.DIFF.map(([k, l]) => `<option value="${k}" ${f.diff === k ? 'selected' : ''}>${l}</option>`).join(''))}
      <div class="col-span-2 lg:col-span-1 min-w-0"><label class="label" for="qbf-q">খুঁজুন</label><input id="qbf-q" class="input" value="${esc(f.q || '')}" onchange="${on}('q',this.value)"></div></div>`;
  },
  bankCard(b, pick) {
    const own = ExamHub.isStaff() || b.by === App.session?.userId;
    return `<div class="card p-4 flex gap-3">${pick ? `<input type="checkbox" class="w-5 h-5 mt-1 shrink-0" name="pick" value="${b.id}" aria-label="নির্বাচন">` : ''}<div class="flex-1 min-w-0">
      <div class="flex flex-wrap gap-1 mb-1">${badge(this.TYPES[b.type]?.[0] || b.type, 'blue')}${badge(DB.subject(b.subjectId)?.name || b.subjectId, 'slate')}${badge(DB.className(b.classId), 'slate')}${b.chapter ? badge(b.chapter, 'violet') : ''}${badge(bn(b.diff), b.diff === 'hard' ? 'red' : b.diff === 'easy' ? 'green' : 'amber')}${(b.tags || []).map(t => badge('#' + t, 'slate')).join('')}</div>
      <div class="whitespace-pre-line">${esc((b.q.text || '').slice(0, 400))}</div>${b.q.type === 'cq' ? `<ol class="mt-1 text-slate-600">${b.q.parts.map((p, k) => `<li>(${this.L[k]}) ${esc(p.t)} — ${bnNum(p.m)}</li>`).join('')}</ol>` : ''}${b.q.opts ? `<div class="mt-1 text-slate-600">${b.q.opts.map((o, k) => `(${this.L[k]}) ${esc(o)}`).join(' · ')}</div>` : ''}
      <div class="text-slate-500 mt-1">${bnNum(this.marks(b.q))} নম্বর · ${esc(pn(DB.user(b.by)) || '')} · ${U.fmtDate(b.at)}</div></div>
      ${!pick && own ? `<button type="button" class="btn btn-ghost btn-sm text-red-600 self-start" aria-label="মুছুন" title="মুছুন" onclick="QB.bankDel('${b.id}')">${icon('trash-2')}</button>` : ''}</div>`;
  },
  /** Exam Centre → প্রশ্ন ব্যাংক tab. */
  bankTab() {
    const f = App.ui.qbf || (App.ui.qbf = {}), list = this.bankFilter(f);
    return this.bankFilters(f, 'QB.bankF') + `<div class="mb-2 text-slate-600">${bnNum(list.length)}টি প্রশ্ন</div><div class="space-y-3">${list.slice(0, 200).map(b => this.bankCard(b)).join('') || `<div class="card p-6">${emptyState('প্রশ্ন ব্যাংকে কোনো প্রশ্ন পাওয়া যায়নি।', 'library')}</div>`}</div>`;
  },
  bankF(k, v) { (App.ui.qbf || (App.ui.qbf = {}))[k] = v; if (k === 'sid') App.ui.qbf.ch = ''; App.refresh(); },
  /** Pick questions from the bank into section i of the open paper. */
  bankPick(i) {
    const S = this.st(); App.ui.qbp = { i, f: { sid: S.sid, cls: S.cls } };
    App.openDetail({ title: 'প্রশ্ন ব্যাংক থেকে বাছাই', render: () => this.pickHtml(), mount: () => App.icons() });
  },
  pickF(k, v) { App.ui.qbp.f[k] = v; App.refresh(); },
  pickHtml() {
    const { f } = App.ui.qbp, list = this.bankFilter(f);
    return this.bankFilters(f, 'QB.pickF') + `<form id="qbp" class="space-y-3" onsubmit="event.preventDefault();QB.pickAdd()">${list.slice(0, 200).map(b => this.bankCard(b, true)).join('') || `<div class="card p-6">${emptyState('মিলে যায় এমন কোনো প্রশ্ন নেই।', 'library')}</div>`}
      <div class="flex flex-wrap gap-2 sticky bottom-0 bg-[var(--surface)] py-3"><span class="flex-1"></span><button type="button" class="btn btn-ghost" onclick="App.closeDetail()">বাতিল</button><button class="btn btn-primary">${icon('plus')} নির্বাচিত প্রশ্ন যোগ করুন</button></div></form>`;
  },
  pickAdd() {
    const ids = $$('#qbp input[name=pick]:checked').map(x => x.value), s = this.st()?.c.sections[App.ui.qbp.i];
    if (!ids.length) return toast('অন্তত একটি প্রশ্ন বেছে নিন।', 'warn');
    ids.forEach(id => { const b = this.bank().find(x => x.id === id); if (b) s.qs.push({ ...this.clone(b.q), id: this.uid(), chapter: b.chapter, diff: b.diff, tags: (b.tags || []).join(', ') }); });
    toast(`${bnNum(ids.length)}টি প্রশ্ন যোগ হয়েছে।`, 'success'); App.closeDetail();
  },

  /* ---------- solution ---------- */
  /** Store the answer key + model answers as the subject's solution (kind 'solution', mode 'key'). */
  toSolution(pid) {
    const qp = ExamHub.papers().find(x => x.id === pid); if (!qp || qp.mode !== 'build') return;
    if (!ExamHub.canWrite(qp.classId, qp.subjectId)) return toast('অনুমতি নেই।', 'error');
    let s = ExamHub.paper('solution', qp.examId, qp.classId, qp.subjectId);
    if (s && s.status === 'approved' && !ExamHub.canManage()) return toast('এই বিষয়ের সমাধান অনুমোদিত — আর পরিবর্তন করা যাবে না।', 'error');
    if (s && s.mode !== 'key' && !confirm('এই বিষয়ের আগের সমাধানটি প্রশ্নপত্রের উত্তরমালা দিয়ে বদলে যাবে। চালিয়ে যাবেন?')) return;
    const status = ExamHub.canManage() ? 'approved' : 'submitted', isNew = !s;
    if (isNew) ExamHub.papers().push(s = { id: DB.id('XP'), kind: 'solution', examId: qp.examId, classId: qp.classId, subjectId: qp.subjectId, published: false, createdAt: U.today() });
    Object.assign(s, { mode: 'key', src: qp.id, content: this.clone(qp.content), text: '', dataUrl: null, fileName: null, fileType: null, status, by: isNew || !ExamHub.canManage() ? App.session.userId : s.by, updatedAt: U.today(), note: '' });
    if (status === 'approved') Object.assign(s, { approvedBy: App.session.userId, approvedAt: U.today() });
    DB.audit('EXAM_PAPER_SAVE', 'exams', `solution (answer key) ${qp.examId} · ${qp.classId} · ${qp.subjectId} → ${status}`); DB.save();
    toast(status === 'approved' ? 'সমাধান সংরক্ষিত ও অনুমোদিত — সমাধান ট্যাব থেকে প্রকাশ করুন।' : 'সমাধান জমা দেওয়া হয়েছে — অনুমোদনের অপেক্ষায়।', 'success'); App.refresh();
  },

  /* ---------- sets ---------- */
  rng(seed) { let a = [...String(seed)].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261); return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; },
  shuffle(a, r) { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; },
  /** Set k of a paper: objective questions (MCQ sections) in a shuffled order, MCQ options permuted. Set 0 = as written. */
  variant(p, k) {
    const c = this.clone(p.content || { sections: [] }); if (!k) return c;
    const r = this.rng(`${p.id}|${k}`);
    c.sections.forEach(s => {
      if (s.comp === 'mcq' || s.qs.every(q => this.OBJ.includes(q.type))) s.qs = this.shuffle(s.qs, r);
      s.qs.forEach(q => {
        if (q.type !== 'mcq' && q.type !== 'mcqm') return;
        const order = this.shuffle(q.opts.map((_, i) => i), r);
        q.opts = order.map(i => q.opts[i]);
        q.ans = q.type === 'mcq' ? order.indexOf(+q.ans) : (q.ans || []).map(a => order.indexOf(a)).sort();
      });
    });
    return c;
  },
  /** Right-hand column order of a matching question (fixed per question, so the key and the paper agree). */
  matchOrder(q) {
    const o = this.shuffle(q.pairs.map((_, i) => i), this.rng(q.id || q.text));
    return o.every((v, i) => v === i) && o.length > 1 ? [...o.slice(1), o[0]] : o;   // never print the pairs already matched
  },

  /* ---------- printing ---------- */
  /** Print a built paper: what = 'paper' | 'key' | 'omr'; set = 0…3. Re-built on reload of the print view. */
  print(pid, what = 'paper', set = 0) {
    const p = ExamHub.papers().find(x => x.id === pid);
    if (!p || !p.content) return toast('প্রশ্নপত্রটি পাওয়া যায়নি।', 'error');
    if (!ExamHub.canSee(p)) return toast('এই পত্রটি এখন দেখা যাবে না।', 'error');
    if (ExamHub.isLearner() && p.kind === 'question' && what !== 'paper') return toast('এই পত্রটি এখন দেখা যাবে না।', 'error');
    const r = this.build(p, p.kind === 'solution' ? 'key' : what, +set || 0);
    if (!r.sheets.length) return toast('মুদ্রণযোগ্য কিছু নেই।', 'warn');
    Print.preview(r.title, r.sheets, { re: ['QB.print', pid, what, +set || 0] });
  },
  build(p, what, set) {
    const ex = DB.exam(p.examId), subj = DB.subject(p.subjectId)?.name || '';
    if (what === 'omr') return { title: `ওএমআর উত্তরপত্র — ${subj}`, sheets: this.omrSheets(p, ex) };
    if (what === 'key') return { title: `উত্তরমালা ও সমাধান — ${subj}`, sheets: this.keySheets(p, ex) };
    return { title: `প্রশ্নপত্র — ${subj}${+p.content.sets > 1 ? ` · সেট ${this.L[set]}` : ''}`, sheets: this.paperSheets(p, ex, set) };
  },
  /** Height (mm) of each html block at the given width, measured in the page with the print fonts. */
  measure(blocks) {
    const box = document.createElement('div');
    box.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;font-family:var(--font-sans,"Noto Serif Bengali",serif);color:#0f172a';
    box.innerHTML = blocks.map(b => `<div style="width:${b.w}mm;display:flow-root">${b.html}</div>`).join('');
    document.body.appendChild(box);
    const out = [...box.children].map(el => el.getBoundingClientRect().height / 3.7795 + .6);
    box.remove(); return out;
  },
  /** Lay blocks onto A4 pages (182 × H mm content). Blocks with col:true flow in two columns, left then right. */
  pack(blocks, H) {
    const W = 182, CW = (W - 8) / 2;
    const hs = this.measure(blocks.map(b => ({ html: b.html, w: b.col ? CW : W })));
    blocks.forEach((b, i) => (b.h = hs[i]));
    const pages = [[]]; let y = 0, i = 0;
    const newPage = () => { pages.push([]); y = 0; };
    while (i < blocks.length) {
      const b = blocks[i];
      if (!b.col) {
        if (y > 0 && (y + b.h > H || (b.keep && y + b.h + (blocks[i + 1]?.h || 0) > H))) newPage();
        pages[pages.length - 1].push(b.html); y += b.h; i++; continue;
      }
      const run = []; while (i < blocks.length && blocks[i].col) run.push(blocks[i++]);
      let k = 0;
      while (k < run.length) {
        if (H - y < run[k].h) newPage();
        const avail = H - y, rest = U.sum(run.slice(k), b => b.h), target = rest <= 2 * avail ? rest / 2 : avail;
        const Lc = [], Rc = []; let hl = 0, hr = 0;
        while (k < run.length && hl + run[k].h <= avail && (hl < target - .5 || !Lc.length)) { Lc.push(run[k].html); hl += run[k].h; k++; }
        while (k < run.length && hr + run[k].h <= avail) { Rc.push(run[k].html); hr += run[k].h; k++; }
        pages[pages.length - 1].push(`<div style="display:flex;gap:8mm"><div style="width:${CW}mm;flex-shrink:0">${Lc.join('')}</div><div style="width:${CW}mm;flex-shrink:0">${Rc.join('')}</div></div>`);
        y += Math.max(hl, hr);
        if (k < run.length) newPage();
      }
    }
    return pages.filter(p => p.length);
  },
  txt(s) { return esc(s || '').replace(/_{3,}/g, '<span style="display:inline-block;min-width:22mm;border-bottom:.25mm solid #0f172a"></span>').replace(/\n/g, '<br>'); },
  img(src, max = 70) { return src ? `<img src="${src}" alt="" style="display:block;max-width:100%;max-height:${max}mm;margin:1.5mm auto;object-fit:contain">` : ''; },
  /** One question as print html. */
  qHtml(q, n) {
    const L = this.L, m = this.marks(q), num = `<b style="display:inline-block;min-width:7mm">${bnNum(n)}.</b>`, right = v => `<span style="float:right;font-weight:700;padding-left:3mm">${bnNum(v)}</span>`;
    const box = inner => `<div style="font-size:11pt;line-height:1.55;padding:1.2mm 0 1.6mm;break-inside:avoid">${inner}</div>`;
    if (q.type === 'cq') return box(`<div>${num}${q.text ? `<span>${this.txt(q.text)}</span>` : ''}</div>${this.img(q.img)}<div style="padding-left:7mm">${q.parts.map((p, k) => `<div style="display:flow-root">${right(p.m)}(${L[k]}) ${this.txt(p.t)}</div>`).join('')}</div>`);
    if (q.type === 'mcq' || q.type === 'mcqm') {
      const long = q.opts.some(o => String(o).length > 22);
      return box(`<div style="display:flow-root">${q.type === 'mcqm' || m !== 1 ? right(m) : ''}${num}${this.txt(q.text)}</div>${this.img(q.img, 45)}<div style="display:grid;grid-template-columns:${long ? '1fr' : '1fr 1fr'};gap:0 4mm;padding-left:7mm">${q.opts.map((o, k) => `<div>(${L[k]}) ${this.txt(o)}</div>`).join('')}</div>`);
    }
    if (q.type === 'match') {
      const ord = this.matchOrder(q);
      return box(`<div style="display:flow-root">${right(m)}${num}${this.txt(q.text) || 'বাম পাশের সঙ্গে ডান পাশ মিলাও:'}</div><table style="margin:1mm 0 0 7mm;border-collapse:collapse;font-size:10.5pt">${q.pairs.map((p, k) => `<tr><td style="padding:.4mm 6mm .4mm 0">${bnNum(k + 1)}. ${this.txt(p[0])}</td><td style="padding:.4mm 0">(${L[k]}) ${this.txt(q.pairs[ord[k]][1])}</td></tr>`).join('')}</table>`);
    }
    return box(`<div style="display:flow-root">${right(m)}${num}${this.txt(q.text)}${q.type === 'tf' ? ' <span style="white-space:nowrap">(সত্য / মিথ্যা)</span>' : ''}</div>${this.img(q.img, q.type === 'map' ? 95 : 70)}`);
  },
  head(p, ex, set, sub) {
    const s = DB.s.school, c = p.content, sets = +c.sets > 1, need = this.need(ex, p.subjectId), slot = DB.paperSlot(ex, p.classId, p.subjectId);
    const full = sub ? '' : `পূর্ণমান: ${bnNum(need.cq + need.mcq + need.pr || U.sum(c.sections, x => this.secTotal(x)))}`;
    return `<div style="position:relative;text-align:center;line-height:1.35">
      ${sets && !sub ? `<div style="position:absolute;right:0;top:0;border:.5mm solid #0f172a;padding:1mm 3mm;font-weight:700;font-size:12pt">সেট: ${this.L[set]}</div>` : ''}
      <div style="display:flex;align-items:center;justify-content:center;gap:3mm">${Print.logo(13)}<div><div style="font-size:16pt;font-weight:700">${esc(s.nameBn || s.name)}</div><div style="font-size:8.5pt;color:#334155">${esc(s.address || '')}</div></div></div>
      <div style="font-size:12.5pt;font-weight:700;margin-top:1.5mm">${esc(ex.name)}${sub ? ` — ${sub}` : ''}</div>
      <div style="font-size:11pt">শ্রেণি: ${esc(DB.className(p.classId))} · বিষয়: ${esc(DB.subject(p.subjectId)?.name || '')}${slot ? ` · তারিখ: ${U.fmtDate(slot.date)}` : ''}</div>
      <div style="display:flex;justify-content:space-between;border-top:.4mm solid #0f172a;border-bottom:.4mm solid #0f172a;padding:.8mm 0;margin-top:1.5mm;font-weight:700;font-size:10.5pt"><span>${sub ? '' : `সময়: ${esc(c.time || '—')}`}</span><span>${full}</span></div>
      ${!sub && c.instr ? `<div style="font-size:9.5pt;margin-top:1mm;font-style:italic">${esc(c.instr)}</div>` : ''}</div>`;
  },
  secHead(s, sub) {
    const any = +s.any && +s.any < s.qs.length;
    return `<div style="margin-top:4mm;padding-bottom:1mm;break-after:avoid"><div style="text-align:center;font-weight:700;font-size:12pt">${esc(s.title)}</div>
      ${sub ? '' : `<div style="display:flex;justify-content:space-between;font-size:10pt"><span>${s.time ? `সময়: ${esc(s.time)}` : ''}</span><span>মান: ${bnNum(this.secTotal(s))}</span></div>`}
      ${!sub && (s.instr || any) ? `<div style="text-align:center;font-size:9.5pt;font-style:italic">${esc(s.instr || '')}${any ? ` [যেকোনো ${bnNum(s.any)}টি প্রশ্নের উত্তর দাও]` : ''}</div>` : ''}</div>`;
  },
  frame(pages, p, ex, label) {
    const subj = DB.subject(p.subjectId)?.name || '';
    return pages.map((pg, i) => `<div class="sheet padded">${pg.join('')}<div style="position:absolute;bottom:7mm;left:14mm;right:14mm;display:flex;justify-content:space-between;font-size:8pt;color:#64748b"><span>${esc(ex.name)} · ${esc(subj)}${label ? ' · ' + label : ''}</span><span>পৃষ্ঠা ${bnNum(i + 1)}/${bnNum(pages.length)}</span></div></div>`);
  },
  paperSheets(p, ex, set) {
    const c = this.variant(p, set), blocks = [{ html: this.head(p, ex, set) }];
    c.sections.forEach(s => {
      blocks.push({ html: this.secHead(s), keep: true });
      const two = s.qs.length > 3 && s.qs.every(q => this.OBJ.includes(q.type) || ['tf', 'one', 'fill'].includes(q.type));
      s.qs.forEach((q, k) => blocks.push({ html: this.qHtml(q, k + 1), col: two }));
    });
    return this.frame(this.pack(blocks, 297 - 28 - 8), p, ex, +p.content.sets > 1 ? `সেট ${this.L[set]}` : '');
  },
  /** Answer key of every set + model answers of the written questions. */
  keySheets(p, ex) {
    const n = Math.max(1, +p.content.sets || 1), L = this.L, blocks = [{ html: this.head(p, ex, 0, 'উত্তরমালা ও সমাধান') }];
    const ansOf = q => q.type === 'mcq' ? L[+q.ans] : q.type === 'mcqm' ? (q.ans || []).map(a => L[a]).join(', ') : q.type === 'match' ? (o => q.pairs.map((_, k) => `${bnNum(k + 1)}-${L[o.indexOf(k)]}`).join(', '))(this.matchOrder(q)) : '';
    for (let k = 0; k < n; k++) {
      const c = this.variant(p, k), rows = [];
      c.sections.forEach(s => s.qs.forEach((q, i) => { if (this.OBJ.includes(q.type)) rows.push([s, i + 1, ansOf(q)]); }));
      if (!rows.length) break;
      blocks.push({ html: `<div style="margin-top:4mm;font-weight:700;font-size:12pt">বহুনির্বাচনির উত্তর${n > 1 ? ` — সেট ${L[k]}` : ''}</div>`, keep: true });
      const bySec = [...new Set(rows.map(r => r[0]))];
      bySec.forEach(s => blocks.push({ html: `${bySec.length > 1 ? `<div style="font-size:10pt;font-weight:700;margin-top:1.5mm">${esc(s.title)}</div>` : ''}<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:0;border-top:.2mm solid #cbd5e1;border-left:.2mm solid #cbd5e1;font-size:10pt">${rows.filter(r => r[0] === s).map(r => `<div style="border-right:.2mm solid #cbd5e1;border-bottom:.2mm solid #cbd5e1;padding:.6mm 1.5mm">${bnNum(r[1])}. <b>${esc(r[2])}</b></div>`).join('')}</div>` }));
    }
    const written = [];
    p.content.sections.forEach(s => s.qs.forEach((q, i) => { if (!this.OBJ.includes(q.type)) written.push([s, i + 1, q]); }));
    if (written.length) {
      blocks.push({ html: `<div style="margin-top:5mm;font-weight:700;font-size:12pt">লিখিত প্রশ্নের নমুনা উত্তর</div>`, keep: true });
      let last = null;
      written.forEach(([s, i, q]) => {
        if (s !== last && p.content.sections.length > 1) blocks.push({ html: `<div style="font-size:10.5pt;font-weight:700;margin-top:2mm">${esc(s.title)}</div>`, keep: true });
        last = s;
        const tf = q.type === 'tf' ? `<b>${q.ans === 'F' ? 'মিথ্যা' : 'সত্য'}</b>` : '';
        const body = q.type === 'cq' ? q.parts.map((pt, k) => `<div>(${L[k]}) ${pt.a ? this.txt(pt.a) : '<span style="color:#94a3b8">নমুনা উত্তর দেওয়া হয়নি</span>'}</div>`).join('') : (tf || (q.model ? this.txt(q.model) : '<span style="color:#94a3b8">নমুনা উত্তর দেওয়া হয়নি</span>'));
        blocks.push({ html: `<div style="font-size:10.5pt;line-height:1.55;padding:1mm 0;border-bottom:.2mm dotted #cbd5e1"><b>${bnNum(i)}.</b> <span style="color:#475569">${esc((q.text || '').slice(0, 90))}${(q.text || '').length > 90 ? '…' : ''}</span><div style="padding-left:6mm">${body}</div></div>` });
      });
    }
    return this.frame(this.pack(blocks, 297 - 28 - 8), p, ex, 'উত্তরমালা');
  },
  /** OMR-style answer sheet: name, roll (bubbles), set code and one row of bubbles per objective question. */
  omrSheets(p, ex) {
    const s = DB.s.school, L = this.L, count = U.sum(p.content.sections, x => x.qs.filter(q => q.type === 'mcq' || q.type === 'mcqm').length) || 0;
    const opts = 4, n = Math.max(count, 1), per = 25, cols = Math.min(4, Math.ceil(n / per));
    const bub = (t, on) => `<span style="display:inline-flex;width:4.6mm;height:4.6mm;border:.3mm solid #b91c1c;border-radius:50%;align-items:center;justify-content:center;font-size:6.5pt;color:#b91c1c;margin:0 .5mm${on ? ';background:#0f172a' : ''}">${t}</span>`;
    const roll = `<div style="display:flex;gap:1mm">${Array.from({ length: 6 }, () => `<div style="display:flex;flex-direction:column;align-items:center;gap:.4mm"><div style="width:5mm;height:5.5mm;border:.3mm solid #0f172a"></div>${Array.from({ length: 10 }, (_, d) => bub(bnNum(d))).join('')}</div>`).join('')}</div>`;
    const setBox = +p.content.sets > 1 ? `<div><div style="font-weight:700;font-size:9pt;margin-bottom:1mm">সেট কোড</div><div style="display:flex;flex-direction:column;gap:.6mm">${L.slice(0, +p.content.sets).map(l => bub(l)).join('')}</div></div>` : '';
    const col = c => `<div style="flex:1"><table style="border-collapse:collapse;font-size:8.5pt">${Array.from({ length: per }, (_, r) => c * per + r + 1).filter(k => k <= n).map(k => `<tr><td style="padding:.45mm 1.5mm .45mm 0;text-align:right;font-weight:700;width:7mm">${bnNum(k)}</td><td style="padding:.45mm 0">${L.slice(0, opts).map(l => bub(l)).join('')}</td></tr>`).join('')}</table></div>`;
    return [`<div class="sheet padded" style="border:0">
      <div style="border:.6mm solid #b91c1c;padding:4mm;height:100%;box-sizing:border-box;color:#0f172a;position:relative">
        <div style="display:flex;align-items:center;gap:3mm;border-bottom:.4mm solid #b91c1c;padding-bottom:2mm">${Print.logo(12)}<div style="flex:1;text-align:center"><div style="font-size:15pt;font-weight:700">${esc(s.nameBn || s.name)}</div><div style="font-size:11pt;font-weight:700;color:#b91c1c">বহুনির্বাচনি অভীক্ষার উত্তরপত্র</div><div style="font-size:9.5pt">${esc(ex.name)} · ${esc(DB.className(p.classId))} · ${esc(DB.subject(p.subjectId)?.name || '')}</div></div><div style="width:12mm"></div></div>
        <div style="display:flex;gap:5mm;margin-top:3mm;align-items:flex-start">
          <div style="flex:1;font-size:10pt;line-height:2.1">${['পরীক্ষার্থীর নাম', 'শ্রেণি ও শাখা', 'পরীক্ষার তারিখ'].map(x => `<div style="display:flex;gap:2mm"><span style="white-space:nowrap">${x}:</span><span style="flex:1;border-bottom:.25mm dotted #0f172a"></span></div>`).join('')}
            <div style="margin-top:2mm;font-size:8.5pt;line-height:1.5;border:.25mm solid #b91c1c;padding:1.5mm 2mm;color:#7f1d1d">শুধু কালো বলপয়েন্ট কলম দিয়ে সঠিক উত্তরের বৃত্তটি সম্পূর্ণ ভরাট করো, যেমন: ${bub('', true)}। একটি প্রশ্নে একাধিক বৃত্ত ভরাট করলে উত্তর বাতিল হবে। উত্তরপত্র ভাঁজ করবে না।</div>
            <div style="display:flex;justify-content:space-between;margin-top:6mm;font-size:9pt"><div style="width:48mm;border-top:.25mm solid #0f172a;text-align:center">পরীক্ষার্থীর স্বাক্ষর</div><div style="width:48mm;border-top:.25mm solid #0f172a;text-align:center">কক্ষ পরিদর্শকের স্বাক্ষর</div></div></div>
          <div><div style="font-weight:700;font-size:9pt;margin-bottom:1mm">রোল নম্বর</div>${roll}</div>${setBox}</div>
        <div style="margin-top:4mm;border-top:.4mm solid #b91c1c;padding-top:2mm;font-weight:700;font-size:10pt">উত্তর (প্রশ্ন ${bnNum(n)}টি)</div>
        <div style="display:flex;gap:4mm;margin-top:1.5mm">${Array.from({ length: cols }, (_, c) => col(c)).join('')}</div>
        ${count ? '' : '<div style="margin-top:3mm;font-size:9pt;color:#64748b">এই প্রশ্নপত্রে কোনো বহুনির্বাচনি প্রশ্ন নেই।</div>'}</div></div>`];
  },
};

/* ---------- Exam Centre hooks: builder button, bank tab, built papers in openPaper and the paper form ---------- */
(() => {
  ExamHub.TABS.splice(ExamHub.TABS.findIndex(t => t[0] === 'solutions') + 1, 0, ['bank', 'প্রশ্ন ব্যাংক', 'library']);
  const tabs0 = ExamHub.tabs.bind(ExamHub);
  ExamHub.tabs = function () { return tabs0().filter(([id]) => id !== 'bank' || (!this.isLearner() && (this.isStaff() || this.isTeacher()))); };
  const r0 = ExamHub.render.bind(ExamHub);
  ExamHub.render = function (q) {
    const ui = App.ui.xh;
    if (ui?.tab === 'bank' && this.tabs().some(t => t[0] === 'bank')) {
      const sub = this.isTeacher() ? 'রুটিন, পাঠ্যসূচি ও মানবণ্টন দেখুন; নিজের বিষয়ের প্রশ্নপত্র ও সমাধান জমা দিন; ফলাফল দেখুন।' : 'পরীক্ষা সেটআপ, রুটিন, পাঠ্যসূচি, প্রশ্নপত্র, মানবণ্টন, সমাধান ও ফলাফল প্রকাশ — সব এক জায়গায়।';
      return pageHeader('পরীক্ষা কেন্দ্র', sub, '') + pills(this.tabs(), 'bank', id => `App.ui.xh.tab='${id}';App.refresh()`) + QB.bankTab();
    }
    return r0(q);
  };
  const o0 = ExamHub.openPaper.bind(ExamHub);
  ExamHub.openPaper = function (id) {
    const p = this.papers().find(x => x.id === id);
    if (p && (p.mode === 'build' || p.mode === 'key') && p.content) return QB.print(id, p.mode === 'key' ? 'key' : 'paper', 0);
    return o0(id);
  };
  // the papers table: a "প্রশ্ন তৈরি" button next to upload / text
  const t0 = ExamHub.papersTab.bind(ExamHub);
  ExamHub.papersTab = function (ex, cls, kind) {
    let html = t0(ex, cls, kind);
    if (kind !== 'question' || this.isLearner()) return html;
    DB.examSubjects(ex, cls).forEach(s => {
      const p = this.paper('question', ex.id, cls, s.id);
      if (!this.canWrite(cls, s.id) || (p && !this.canManage() && p.status === 'approved')) return;
      const btn = `<button class="btn ${p?.mode === 'build' ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="QB.open('${ex.id}','${cls}','${s.id}')">${icon('file-plus-2')} ${p?.mode === 'build' ? 'প্রশ্ন নির্মাতা' : 'প্রশ্ন তৈরি'}</button>`;
      const key = p ? `ExamHub.openPaper('${p.id}')` : `ExamHub.editPaper('question','${ex.id}','${cls}','${s.id}')`;
      const at = html.indexOf(`onclick="${key}"`);
      if (at < 0) return;
      const start = html.lastIndexOf('<button', at);
      html = html.slice(0, start) + btn + html.slice(start);
    });
    return html;
  };
  // the upload / text form: a built paper is edited in the builder; a solution can come from the built question paper
  const f0 = ExamHub.paperFormHtml.bind(ExamHub);
  ExamHub.paperFormHtml = function (kind, examId, cls, sid) {
    const html = f0(kind, examId, cls, sid), p = this.paper(kind, examId, cls, sid), qp = this.paper('question', examId, cls, sid);
    const note = kind === 'question'
      ? `<div class="card p-4 flex flex-wrap items-center gap-3">${icon('file-plus-2', 'w-5 h-5 text-brand-600')}<div class="flex-1 min-w-[12rem]">${p?.mode === 'build' ? '<b>এই প্রশ্নপত্রটি প্রশ্ন নির্মাতায় তৈরি।</b> পরিবর্তন করতে প্রশ্ন নির্মাতা খুলুন; ফাইল বা লেখা জমা দিলে সেটি বদলে যাবে।' : 'ধাপে ধাপে কাঠামোবদ্ধ প্রশ্নপত্র (সৃজনশীল, বহুনির্বাচনি, সংক্ষিপ্ত, মিলকরণ ইত্যাদি) তৈরি করতে চাইলে প্রশ্ন নির্মাতা ব্যবহার করুন।'}</div><button type="button" class="btn btn-primary btn-sm" onclick="App.closeDetail();QB.open('${examId}','${cls}','${sid}')">${icon('file-plus-2')} প্রশ্ন নির্মাতা খুলুন</button></div>`
      : qp?.mode === 'build' ? `<div class="card p-4 flex flex-wrap items-center gap-3">${icon('key-round', 'w-5 h-5 text-brand-600')}<div class="flex-1 min-w-[12rem]">${p?.mode === 'key' ? '<b>বর্তমান সমাধান = প্রশ্নপত্রের উত্তরমালা ও নমুনা উত্তর।</b>' : 'প্রশ্নপত্রটি প্রশ্ন নির্মাতায় তৈরি — এর বহুনির্বাচনির উত্তর ও নমুনা উত্তর থেকে সমাধান তৈরি করা যায়।'}</div><button type="button" class="btn btn-primary btn-sm" onclick="QB.toSolution('${qp.id}');App.closeDetail()">${icon('file-check')} উত্তরমালা থেকে সমাধান</button></div>` : '';
    return note ? html.replace('<form id="xp-form" class="space-y-4">', `<form id="xp-form" class="space-y-4">${note}`) : html;
  };
})();
