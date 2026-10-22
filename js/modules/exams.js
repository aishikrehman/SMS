/* ==========================================================================
   DYNAMIC EXAMINATION, GRADING & MULTI-TIER WEIGHTAGE
   Exam types (Class Test / Tutorial / Term), marks & pass marks per
   component, weightage per session, and editable grading schemes per
   campus + session. Session GPA = weighted mean of exam GPAs.
   ========================================================================== */

const Exams = {
  togglePublish(id) { const e = DB.exam(id); e.published = !e.published; DB.audit('EXAM_PUBLISH', 'exams', `${e.name} → ${e.published ? 'published' : 'hidden'}`); DB.save(); App.refresh(); },
  saveBands(schemeId) {
    const sc = DB.s.gradingSchemes.find(g => g.id === schemeId);
    const rows = $$(`[data-scheme="${schemeId}"] tr[data-band]`).map(tr => ({ min: +tr.querySelector('[name=min]').value, letter: tr.querySelector('[name=letter]').value.trim(), point: sc.scale === 'letter' ? null : +tr.querySelector('[name=point]').value }));
    if (!rows.some(r => r.min === 0)) return toast('একটি গ্রেড-সীমা অবশ্যই ০% থেকে শুরু হতে হবে (অকৃতকার্য সীমা)।', 'error');
    if (new Set(rows.map(r => r.min)).size !== rows.length) return toast('প্রতিটি গ্রেড-সীমার ন্যূনতম মান ভিন্ন হতে হবে।', 'error');
    sc.bands = rows.sort((a, b) => b.min - a.min);
    sc.name = $(`[data-scheme="${schemeId}"] [name=sname]`).value;
    DB.audit('GRADING_SCHEME', 'grading_schemes', `${sc.id} bands: ${sc.bands.map(b => `${b.letter}≥${b.min}`).join(' ')}`); DB.save(); toast('গ্রেডিং পদ্ধতি সংরক্ষিত হয়েছে — সকল জিপিএ তাৎক্ষণিকভাবে পুনর্গণনা হবে।', 'success'); App.refresh();
  },
  newScheme() {
    const ses = App.ui.exSes || DB.session(), base = DB.scheme(DB.campusId(), ses);
    const id = `GS-${DB.campusId()}-${ses}-${Date.now().toString().slice(-4)}`;
    DB.s.gradingSchemes.push({ id, name: `${DB.campus().short} ক্যাম্পাস স্কেল ${U.bn(ses)}`, session: ses, campusId: DB.campusId(), bands: (base ? base.bands : NCTB_BANDS).map(b => ({ ...b })) });
    DB.audit('GRADING_SCHEME_CREATE', 'grading_schemes', id); DB.save(); App.refresh();
  },
  /** Switch a scheme to a preset scale: GPA 5.00 (NCTB), CGPA 4.00 or letter-only (no GPA — pre-school/KG). */
  applyPreset(schemeId, key) {
    const sc = DB.s.gradingSchemes.find(g => g.id === schemeId), p = SCALE_PRESETS[key];
    if (!confirm(`"${sc.name}"-এর গ্রেড-সীমাগুলো ${bn(p.label)} ডিফল্ট স্কেল দিয়ে প্রতিস্থাপন করবেন?`)) return;
    sc.scale = key; sc.bands = p.bands.map(b => ({ ...b }));
    DB.audit('GRADING_SCHEME', 'grading_schemes', `${sc.id} → preset ${p.label}`); DB.save(); toast(`${bn(p.label)} প্রয়োগ করা হয়েছে।`, 'success'); App.refresh();
  },
  /** Exam timetable (in-page editor): rows of {date, start, end, subjectId, classIds[], room}; empty classIds = every
      participating class. Shown in the Exam Centre, on dashboards, the calendar and admit cards. */
  schedule(examId) {
    App.openDetail({ title: `পরীক্ষার রুটিন · ${DB.exam(examId).name}`, render: () => this.scheduleHtml(examId), mount: () => this.scheduleMount(examId) });
  },
  /** Subjects sat by at least one participating class. */
  examSubjectIds(e) { const cls = DB.examClasses(e); return DB.s.subjects.filter(s => cls.some(c => DB.examTakes(e, c.id, s.id))).map(s => s.id); },
  scheduleRow(e, r = {}) {
    const on = r.classIds || [], cls = DB.examClasses(e).filter(c => c.campusId === DB.campusId() || on.includes(c.id));
    return `<div class="sch-row card p-3 grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
      <div><label class="label">তারিখ</label><input type="date" class="input" name="date" value="${r.date || e.start}"></div>
      <div><label class="label">শুরু</label><input type="time" class="input" name="start" value="${r.start || '10:00'}"></div>
      <div><label class="label">শেষ</label><input type="time" class="input" name="end" value="${r.end || '13:00'}"></div>
      <div><label class="label">বিষয়</label><select class="select" name="subjectId">${subjectOptions(r.subjectId, this.examSubjectIds(e))}</select></div>
      <div class="col-span-2"><label class="label">কক্ষ</label><input class="input" name="room" value="${esc(r.room || 'আসনবিন্যাস অনুযায়ী')}"></div>
      <details class="col-span-2 sm:col-span-6"><summary class="cursor-pointer text-slate-600">শ্রেণি: <b data-sum>${on.length ? esc(on.map(id => DB.className(id)).join(', ')) : 'অংশগ্রহণকারী সকল শ্রেণি'}</b></summary>
        <div class="flex flex-wrap gap-x-4 gap-y-1 pt-2">${cls.map(c => `<label class="flex items-center gap-1.5"><input type="checkbox" name="cl" value="${c.id}" ${on.includes(c.id) ? 'checked' : ''}> ${esc(DB.className(c.id))}</label>`).join('')}</div></details>
      <div class="col-span-2 sm:col-span-6 flex justify-end"><button type="button" class="btn btn-ghost btn-sm text-red-600" data-del>${icon('trash-2')} সারি মুছুন</button></div></div>`;
  },
  scheduleHtml(examId) {
    const e = DB.exam(examId), rows = e.schedule?.length ? e.schedule : this.examSubjectIds(e).map((s, i) => ({ subjectId: s, date: U.iso(U.addDays(e.start, i + Math.floor(i / 5) * 2)) }));
    return `<form id="sch" class="space-y-3">
      <div id="sch-rows" class="space-y-3">${rows.map(r => this.scheduleRow(e, r)).join('')}</div>
      <div class="flex flex-wrap items-center gap-3 sticky bottom-0 bg-[var(--surface)] py-3"><button type="button" class="btn btn-ghost" id="sch-add">${icon('plus')} পত্র যোগ করুন</button><label class="flex items-center gap-2"><input type="checkbox" name="notify"> অভিভাবকদের এসএমএসে রুটিন জানান</label><span class="flex-1"></span><button type="button" class="btn btn-ghost" onclick="App.closeDetail()">বাতিল</button><button class="btn btn-primary">${icon('save')} রুটিন প্রকাশ করুন</button></div></form>`;
  },
  scheduleMount(examId) {
    const e = DB.exam(examId), f = $('#sch');
    $('#sch-add').addEventListener('click', () => $('#sch-rows').insertAdjacentHTML('beforeend', this.scheduleRow(e)) || App.icons());
    f.addEventListener('click', ev => { const b = ev.target.closest('[data-del]'); if (b) b.closest('.sch-row').remove(); });
    f.addEventListener('change', ev => { if (ev.target.name !== 'cl') return; const row = ev.target.closest('.sch-row'), on = $$('input[name=cl]:checked', row).map(x => DB.className(x.value)); row.querySelector('[data-sum]').textContent = on.length ? on.join(', ') : 'অংশগ্রহণকারী সকল শ্রেণি'; });
    f.addEventListener('submit', ev => {
      ev.preventDefault();
      e.schedule = $$('.sch-row', f).map(r => { const classIds = $$('input[name=cl]:checked', r).map(x => x.value); return { date: r.querySelector('[name=date]').value, start: r.querySelector('[name=start]').value, end: r.querySelector('[name=end]').value, subjectId: r.querySelector('[name=subjectId]').value, room: r.querySelector('[name=room]').value, ...(classIds.length ? { classIds } : {}) }; }).filter(r => r.date && r.subjectId).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
      if (f.notify.checked) Principal.audience('Guardians').forEach(u => DB.sms(u.phone, `${DB.s.school.shortName}: ${e.name} শুরু হবে ${U.fmtDate(e.schedule[0]?.date || e.start)} তারিখে। পূর্ণ রুটিন পোর্টালের পরীক্ষা কেন্দ্রে দেখুন।`));
      DB.audit('EXAM_TIMETABLE', 'exams', `${e.name}: ${e.schedule.length}টি পত্র`); DB.save(); toast('পরীক্ষার রুটিন প্রকাশিত হয়েছে।', 'success'); App.closeDetail();
    });
  },
  /** Upcoming exam papers (used on student/teacher dashboards). */
  upcoming(days = 45) { const t = U.today(), lim = U.iso(U.addDays(new Date(), days)); return DB.s.exams.flatMap(e => (e.schedule || []).map(r => ({ ...r, exam: e }))).filter(r => r.date >= t && r.date <= lim).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)); },
};

/* The principal's former "Exams & grading" page is now the Exam Centre (js/modules/examhub.js); same page id, so links keep working. */
App.addPage('principal', {
  id: 'exams', label: 'পরীক্ষা কেন্দ্র', icon: 'clipboard-list', module: 'exams',
  render(q) { return ExamHub.render(q); }, mount(q) { ExamHub.mount(q); },
}, 'risk');

Object.assign(Exams, {
  /** Exam structure of one session (Exam Centre → পরীক্ষাসমূহ). `editable`: publish / timetable / setup controls. */
  listHtml(ses, editable) {
    const list = DB.examsOf(ses), wsum = U.sum(list, e => e.weight);
    const cls = e => e.classes?.length ? `${bnNum(e.classes.length)}টি শ্রেণি` : 'সকল শ্রেণি';
    return `<div class="card scroll-x mb-5"><div class="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2"><div class="font-semibold">শিক্ষাবর্ষ ${esc(U.bn(ses))}-এর পরীক্ষা কাঠামো</div><span class="ml-auto">${badge(`শিক্ষাবর্ষের জিপিএ-তে মোট ভার ${bnNum(wsum)}%`, wsum === 100 ? 'green' : 'amber')}</span></div>
        <table class="table"><thead><tr><th>পরীক্ষা</th><th>ধরন</th><th>শুরু</th><th>শ্রেণি</th><th>পূর্ণমান</th><th>ভার</th><th>সমন্বয়</th><th>নম্বর প্রদানকৃত</th><th>ফলাফল</th>${editable ? '<th></th>' : ''}</tr></thead><tbody>
        ${list.map(e => `<tr><td class="font-semibold">${esc(e.name)}</td><td>${badge(bn(e.type), MAJOR_EXAMS.includes(e.type) ? 'blue' : e.type === 'Tutorial' ? 'violet' : 'slate')}</td><td class="whitespace-nowrap">${U.fmtDate(e.start)}</td><td>${cls(e)}</td><td>${bnNum(Grade.cfg(e).full)}</td><td>${bnNum(e.weight)}%</td><td>${e.combine?.length ? badge(`${bnNum(e.combine.length)}টি আগের পরীক্ষা যুক্ত`, 'violet') : '—'}</td><td>${bnNum(new Set(DB.s.marks.filter(m => m.examId === e.id).map(m => m.studentId)).size)} জন</td>
          <td>${editable ? `<button class="btn btn-sm ${e.published ? 'btn-success' : 'btn-ghost'}" onclick="Exams.togglePublish('${e.id}')">${e.published ? 'প্রকাশিত' : 'অপ্রকাশিত'}</button>` : badge(e.published ? 'প্রকাশিত' : 'অপ্রকাশিত', e.published ? 'green' : 'slate')}</td>${editable ? `<td class="whitespace-nowrap"><button class="btn btn-ghost btn-sm" title="রুটিন" onclick="Exams.schedule('${e.id}')">${icon('calendar-clock')} ${e.schedule?.length ? bnNum(e.schedule.length) : ''}</button><button class="btn btn-ghost btn-sm" onclick="Exams.setup('${e.id}')">${icon('sliders-horizontal')} সেটআপ</button></td>` : ''}</tr>`).join('') || `<tr><td colspan="10">${emptyState('কোনো পরীক্ষা নির্ধারিত নেই — নতুন একটি তৈরি করুন অথবা অন্য শিক্ষাবর্ষ থেকে কাঠামো কপি করুন।')}</td></tr>`}</tbody></table></div>`;
  },
  /** Grading schemes of one session (editable bands & presets). */
  schemesHtml(ses) {
    const schemes = DB.s.gradingSchemes.filter(g => g.session === ses), active = DB.scheme(DB.campusId(), ses);
    return `<div class="flex flex-wrap items-center gap-2 mb-3"><div class="font-semibold">গ্রেডিং পদ্ধতি · শিক্ষাবর্ষ ${esc(U.bn(ses))}</div><span class="text-slate-500">${typeof multiCampus === 'function' && !multiCampus() ? 'বর্তমানে ব্যবহৃত' : esc(DB.campus().name) + ' বর্তমানে ব্যবহার করছে'} <b>${esc(active?.name || 'ডিফল্ট এনসিটিবি')}</b></span><button class="btn btn-ghost btn-sm ml-auto" onclick="Exams.newScheme()">${icon('plus')} ${typeof multiCampus === 'function' && !multiCampus() ? 'নতুন গ্রেডিং পদ্ধতি' : 'ক্যাম্পাসভিত্তিক পদ্ধতি'}</button></div>
      <div class="grid lg:grid-cols-2 gap-5">${schemes.map(sc => `<div class="card" data-scheme="${sc.id}"><div class="px-4 py-3 border-b border-slate-100 flex items-center gap-2"><input class="input !py-1 font-semibold" name="sname" value="${esc(sc.name)}">${badge(sc.campusId ? DB.campus(sc.campusId).short + ' ক্যাম্পাস' : 'সকল ক্যাম্পাস', sc.campusId ? 'violet' : 'blue')}</div><div class="px-4 py-2 border-b border-slate-100 flex flex-wrap gap-1 items-center"><span class="text-slate-500 mr-1">স্কেল:</span>${Object.entries(SCALE_PRESETS).map(([k, p]) => `<button class="btn btn-sm ${(sc.scale || '5') === k ? 'btn-primary' : 'btn-ghost'}" onclick="Exams.applyPreset('${sc.id}','${k}')">${esc(bn(p.label))}</button>`).join('')}</div>
        <table class="table"><thead><tr><th>ন্যূনতম %</th><th>লেটার গ্রেড</th><th>গ্রেড পয়েন্ট</th></tr></thead><tbody>${[...sc.bands].sort((a, b) => b.min - a.min).map(b => `<tr data-band><td><input class="grid-input !w-24" name="min" type="number" min="0" max="100" value="${b.min}" aria-label="ন্যূনতম %"></td><td><input class="grid-input !w-28 font-semibold" name="letter" maxlength="12" value="${esc(b.letter)}" aria-label="লেটার গ্রেড"></td><td>${(sc.scale || '5') === 'letter' ? '<span class="text-slate-400">জিপিএ নেই</span>' : `<input class="grid-input !w-24" name="point" type="number" step="0.05" min="0" max="5" value="${b.point}" aria-label="গ্রেড পয়েন্ট">`}</td></tr>`).join('')}</tbody></table>
        <div class="p-3 border-t border-slate-100 flex justify-end"><button class="btn btn-primary btn-sm" onclick="Exams.saveBands('${sc.id}')">${icon('save')} পদ্ধতি সংরক্ষণ করুন</button></div></div>`).join('') || `<div class="card p-6">${emptyState('এই শিক্ষাবর্ষের জন্য কোনো গ্রেডিং পদ্ধতি নেই — কপি ও আমদানি ব্যবস্থা থেকে একটি কপি করুন।', 'copy')}</div>`}</div>`;
  },
});

/* ==========================================================================
   EXAM SETUP (in place, per exam): mark distribution per subject, grading
   scale (session default / chosen scheme / custom bands), pass & fail rules,
   marksheet options, and "apply this setup to other exams".
   Teachers' gradebooks and all marksheets follow this setup.
   ========================================================================== */
Object.assign(Exams, {
  setup(id) {
    const ses = App.ui.exSes || DB.session();
    const e = id ? DB.exam(id) : { id: '', name: '', type: 'Class Test', session: ses, cqMax: 20, mcqMax: 0, prMax: 0, cqPass: 7, mcqPass: 0, prPass: 0, weight: 10, published: false, start: U.today(), subjects: {}, gradeSource: 'default', passRule: 'component', passPct: 33, failRule: 'anyF', sheet: { position: true, points: true, remarks: true, highest: false } };
    const d = App.ui.exDraft = JSON.parse(JSON.stringify(e));
    // older exams keep CQ / MCQ / practical fields: turn them into the component list (exam default + per-subject overrides)
    if (!d.comps?.length) d.comps = Grade.comps(d).map(c => ({ k: c.k, label: c.label, max: c.max, pass: c.pass }));
    Object.entries(d.subjects || {}).forEach(([sid, o]) => { if (!o.comps && ['cqMax', 'mcqMax', 'prMax', 'cqPass', 'mcqPass', 'prPass'].some(k => o[k] !== undefined)) { const t = { ...d, comps: undefined }; o.comps = Grade.comps(t, sid).map(c => ({ k: c.k, label: c.label, max: c.max, pass: c.pass })); } });
    App.openDetail({ title: id ? `পরীক্ষা সেটআপ · ${e.name}` : 'নতুন পরীক্ষা সেটআপ', render: () => this.setupHtml(id), mount: () => this.setupMount(id) });
  },
  setupHtml(id) {
    const e = App.ui.exDraft, sh = e.sheet || {}, src = e.gradeSource || 'default';
    const num = (n, v, extra = '') => `<input type="number" min="0" class="grid-input !w-16" name="${n}" value="${v ?? ''}" ${extra}>`;
    const sch = Grade.scheme(DB.campusId(), e.session, e.gradeSource === 'default' ? null : e);
    const bands = e.gradeSource === 'custom' ? (e.customBands || NCTB_BANDS) : (sch?.bands || NCTB_BANDS);
    const others = DB.s.exams.filter(x => x.id !== id).sort((a, b) => b.start.localeCompare(a.start));
    return `<form id="ex-setup" class="space-y-5">
      <div class="card p-5"><div class="font-semibold mb-3">১ · মৌলিক তথ্য</div><div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="lg:col-span-2"><label class="label">পরীক্ষার নাম</label><input class="input" name="name" value="${esc(e.name)}" required placeholder="যেমন: শ্রেণি পরীক্ষা ৩ — ${esc(U.bn(e.session))}"></div>
        <div><label class="label">ধরন</label><select class="select" name="type">${EXAM_TYPES.map(t => `<option value="${t}" ${t === e.type ? 'selected' : ''}>${bn(t)}</option>`).join('')}</select></div>
        <div><label class="label">শিক্ষাবর্ষ</label><select class="select" name="session">${sessionOptions(e.session)}</select></div>
        <div><label class="label">শুরুর তারিখ</label><input type="date" class="input" name="start" value="${e.start}" required></div>
        <div><label class="label">শিক্ষাবর্ষের জিপিএ-তে ভার (%)</label><input type="number" min="0" max="100" class="input" name="weight" value="${e.weight}"></div>
        <label class="flex items-center gap-2 text-sm pt-6"><input type="checkbox" name="published" ${e.published ? 'checked' : ''}> প্রকাশিত (ফলাফল দৃশ্যমান)</label></div></div>
      ${this.classesHtml(e)}
      ${this.compsHtml(e)}
      <div class="grid xl:grid-cols-2 gap-5"><div class="card p-5 space-y-3"><div class="font-semibold">৪ · এই পরীক্ষার গ্রেডিং স্কেল</div>
          <div class="flex flex-wrap gap-1.5">${[['default', 'শিক্ষাবর্ষ / ক্যাম্পাসের ডিফল্ট'], ['scheme', 'নির্দিষ্ট একটি পদ্ধতি'], ['custom', 'নিজস্ব গ্রেড-সীমা']].map(([k, l]) => `<label class="pill ${src === k ? 'pill-on' : ''} cursor-pointer"><input type="radio" name="gradeSource" value="${k}" class="sr-only" ${src === k ? 'checked' : ''}>${l}</label>`).join('')}</div>
          ${src === 'scheme' ? `<select class="select" name="schemeId">${DB.s.gradingSchemes.map(g => `<option value="${g.id}" ${g.id === e.schemeId ? 'selected' : ''}>${esc(g.name)} · ${U.bn(g.session)}${g.campusId ? ' · ' + DB.campus(g.campusId).short : ''}</option>`).join('')}</select>` : ''}
          ${src === 'custom' ? `<div class="flex flex-wrap gap-1.5 text-xs"><span class="text-slate-500 self-center">শুরু করুন:</span>${Object.entries(SCALE_PRESETS).map(([k, p]) => `<button type="button" class="btn btn-ghost btn-sm" onclick="Exams.presetDraft('${k}')">${esc(bn(p.label))}</button>`).join('')}</div>` : ''}
          <table class="table"><thead><tr><th>ন্যূনতম %</th><th>লেটার গ্রেড</th><th>পয়েন্ট</th></tr></thead><tbody>${[...bands].sort((a, b) => b.min - a.min).map((b, i) => `<tr><td>${src === 'custom' ? `<input class="grid-input" name="bmin_${i}" type="number" value="${b.min}">` : bnNum(b.min)}</td><td>${src === 'custom' ? `<input class="grid-input !w-28" name="blet_${i}" value="${esc(b.letter)}">` : esc(b.letter)}</td><td>${src === 'custom' ? `<input class="grid-input" name="bpt_${i}" type="number" step="0.05" value="${b.point ?? ''}" placeholder="—">` : bnNum(b.point ?? '—')}</td></tr>`).join('')}</tbody></table></div>
        <div class="space-y-5"><div class="card p-5 space-y-3"><div class="font-semibold">৫ · পাস ও ফেল নীতি</div>
            <label class="flex items-start gap-2 text-sm"><input type="radio" name="passRule" value="component" ${e.passRule !== 'total' ? 'checked' : ''} class="mt-1"><span><b>প্রতিটি অংশে আলাদা পাস</b></span></label>
            <label class="flex items-start gap-2 text-sm"><input type="radio" name="passRule" value="total" ${e.passRule === 'total' ? 'checked' : ''} class="mt-1"><span><b>সম্মিলিত পাস (মোট নম্বরে)</b> — ন্যূনতম <input type="number" min="0" max="100" class="grid-input !w-16 inline" name="passPct" value="${e.passPct ?? 33}" aria-label="সম্মিলিত পাসের ন্যূনতম শতাংশ">%</span></label>
            <hr class="border-slate-100"><label class="flex items-start gap-2 text-sm"><input type="radio" name="failRule" value="anyF" ${e.failRule !== 'average' ? 'checked' : ''} class="mt-1"><span><b>যেকোনো F → জিপিএ ০.০০</b> (সামগ্রিকভাবে অকৃতকার্য)।</span></label>
            <label class="flex items-start gap-2 text-sm"><input type="radio" name="failRule" value="average" ${e.failRule === 'average' ? 'checked' : ''} class="mt-1"><span><b>গ্রেড পয়েন্টের গড়</b> — অকৃতকার্য বিষয় ০ ধরে গড়</span></label></div>
          <div class="card p-5 space-y-2"><div class="font-semibold">৬ · নম্বরপত্রের বিকল্প</div>
            ${[['position', 'শ্রেণি ও শাখায় অবস্থান দেখান'], ['points', 'গ্রেড পয়েন্ট / জিপিএ দেখান'], ['remarks', 'শ্রেণিশিক্ষকের মন্তব্য দেখান'], ['average', 'গড় নম্বর দেখান (শিক্ষার্থীর গড় ও বিষয়ভিত্তিক শ্রেণির গড়)'], ['highest', 'বিষয়ভিত্তিক শ্রেণির সর্বোচ্চ নম্বর দেখান']].map(([k, l]) => `<label class="flex items-center gap-2 text-sm"><input type="checkbox" name="sh_${k}" ${sh[k] !== false && (k !== 'highest' || sh[k]) ? 'checked' : ''}> ${l}</label>`).join('')}</div></div></div>
      ${this.combineHtml(e)}
      <div class="card p-5"><div class="font-semibold mb-1">৮ · এই সেটআপ অন্যান্য পরীক্ষায় প্রয়োগ করুন</div>
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm">${others.map(x => `<label class="flex items-center gap-1.5"><input type="checkbox" name="copyTo" value="${x.id}"> ${esc(x.name)} <span class="text-xs text-slate-400">${U.bn(x.session)}</span></label>`).join('') || '<span class="text-slate-400">অন্য কোনো পরীক্ষা নেই।</span>'}</div></div>
      <div class="flex flex-wrap gap-2 sticky bottom-0 bg-[var(--surface)] py-3">${id && !DB.s.marks.some(m => m.examId === id) ? `<button type="button" class="btn btn-ghost text-red-600" onclick="Exams.removeExam('${id}')">${icon('trash-2')} পরীক্ষা মুছে ফেলুন</button>` : ''}<span class="flex-1"></span><button type="button" class="btn btn-ghost" onclick="App.closeDetail()">বাতিল</button><button class="btn btn-primary">${icon('save')} পরীক্ষা সেটআপ সংরক্ষণ করুন</button></div></form>`;
  },
  /** Read the form into the draft (so re-rendering for a radio change keeps edits). */
  readDraft() {
    const f = $('#ex-setup'), d = formData(f), e = App.ui.exDraft, n = v => v === '' || v === undefined ? undefined : +v;
    Object.assign(e, { name: d.name, type: d.type, session: d.session, start: d.start, weight: +d.weight || 0, published: !!f.published.checked });
    void n; this.readComps(f, e);
    e.gradeSource = d.gradeSource || 'default'; if (d.schemeId) e.schemeId = d.schemeId;
    if (e.gradeSource === 'custom') { const bands = []; for (let i = 0; d[`bmin_${i}`] !== undefined; i++) bands.push({ min: +d[`bmin_${i}`], letter: d[`blet_${i}`], point: d[`bpt_${i}`] === '' ? null : +d[`bpt_${i}`] }); if (bands.length) { e.customBands = bands; e.customScale = bands.some(b => b.point === null) ? 'letter' : (Math.max(...bands.map(b => b.point)) > 4.5 ? '5' : '4'); } }
    e.passRule = d.passRule; e.passPct = +d.passPct || 33; e.failRule = d.failRule;
    e.sheet = { position: !!f.sh_position.checked, points: !!f.sh_points.checked, remarks: !!f.sh_remarks.checked, average: !!f.sh_average.checked, highest: !!f.sh_highest.checked };
    // participating classes (classes of other campuses keep their previous choice) & subjects per class
    const here = DB.classesIn(), hereIds = new Set(here.map(c => c.id)), prev = e.classes?.length ? e.classes : DB.s.classes.map(c => c.id);
    const cls = [...prev.filter(c => !hereIds.has(c)), ...here.filter(c => f[`cl_${c.id}`]?.checked).map(c => c.id)];
    if (cls.length === DB.s.classes.length) delete e.classes; else e.classes = cls;
    e.classSubjects = { ...(e.classSubjects || {}) };
    here.forEach(c => { const subs = DB.classSubjects(c.id), on = subs.filter(s => f[`cs_${c.id}_${s.id}`]?.checked).map(s => s.id); if (on.length === subs.length) delete e.classSubjects[c.id]; else e.classSubjects[c.id] = on; });
    if (!Object.keys(e.classSubjects).length) delete e.classSubjects;
    // results of earlier exams carried into this one
    e.combine = DB.s.exams.filter(x => x.id !== e.id && f[`cmb_${x.id}`]?.checked).map(x => ({ examId: x.id, weight: +d[`cmbw_${x.id}`] || 0 }));
    if (!e.combine.length) delete e.combine;
    e.combineSelf = d.cmbSelf === '' || d.cmbSelf === undefined ? undefined : +d.cmbSelf; e.combineRule = d.combineRule || 'redistribute';
    return $$('input[name=copyTo]:checked', f).map(x => x.value);
  },
  /** Setup card 2: which classes sit this exam and which subjects per class (default: all). */
  classesHtml(e) {
    // Excel-like grid: rows = classes (grouped by level), columns = union of their subjects. The inputs keep the
    // old names (cl_<class>, cs_<class>_<subject>) so readSetup() and the stored shape are unchanged.
    const cls = DB.classesIn(), on = c => !e.classes?.length || e.classes.includes(c);
    const subMap = new Map(cls.map(c => [c.id, DB.classSubjects(c.id)])), ids = new Set(cls.flatMap(c => subMap.get(c.id).map(s => s.id)));
    const subs = DB.s.subjects.filter(s => ids.has(s.id));
    const lv = DB.s.levels || [], groups = [...lv.map(l => ({ id: l.id, name: l.name, cls: cls.filter(c => c.level === l.id) })), { id: '_', name: 'অন্যান্য', cls: cls.filter(c => !lv.some(l => l.id === c.level)) }].filter(g => g.cls.length);
    const long = cls.length > 8, n = subs.length + 2;
    const tog = (name, checked, label, cls2 = '') => `<label class="cg-c ${cls2}"><input type="checkbox" class="sr-only" name="${name}" aria-label="${esc(label)}" ${checked ? 'checked' : ''}><span aria-hidden="true"></span></label>`;
    const row = c => { const cs = e.classSubjects?.[c.id], mine = new Set(subMap.get(c.id).map(s => s.id)), nm = DB.className(c.id);
      return `<tr data-cg="${c.id}" data-lv="${esc(c.level || '_')}"><th scope="row"><div class="flex items-center gap-2">${tog(`cl_${c.id}`, on(c.id), `${nm} অংশ নেবে`, 'cg-row')}<span class="font-semibold">${esc(nm)}</span></div></th>
        <td class="text-center"><button type="button" class="cg-b" aria-label="${esc(nm)}: সব বিষয় চালু/বন্ধ" onclick="ExCG.row('${c.id}')">সব</button></td>
        ${subs.map(s => mine.has(s.id) ? `<td class="text-center">${tog(`cs_${c.id}_${s.id}`, !cs || cs.includes(s.id), `${nm} · ${s.name}`)}</td>` : '<td class="cg-na" aria-label="প্রযোজ্য নয়"></td>').join('')}</tr>`; };
    const css = `<style>${typeof XG_CSS !== 'undefined' ? XG_CSS : ''}
      .cg tbody tr:nth-child(even) td,.cg tbody tr:nth-child(even) th{background:var(--xg-zebra,rgba(148,163,184,.08))}
      .cg th[scope=row]{position:sticky;left:0;z-index:2;background:var(--xg-bg,#fff);min-width:10rem;text-align:left}
      .cg thead th{position:sticky;top:0;z-index:3}.cg thead th:first-child{left:0;z-index:4}
      .cg-c{display:inline-flex;cursor:pointer}.cg-c span{width:1.6rem;height:1.6rem;border:1px solid var(--xg-bd,#cbd5e1);border-radius:.35rem;display:inline-flex;align-items:center;justify-content:center;background:var(--xg-bg,#fff)}
      .cg-c input:checked+span{background:var(--brand-600,#15803d);border-color:var(--brand-600,#15803d)}.cg-c input:checked+span::after{content:'';width:.45rem;height:.8rem;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg) translate(-1px,-1px)}
      .cg-c input:focus-visible+span{outline:2px solid var(--brand-600,#15803d);outline-offset:2px}
      .cg tr:has(.cg-row input:not(:checked)) td .cg-c{opacity:.35}
      .cg-na{background:repeating-linear-gradient(135deg,transparent 0 6px,rgba(148,163,184,.18) 6px 7px) !important}
      .cg-b{font-size:1rem;padding:.1rem .5rem;border:1px solid var(--xg-bd,#cbd5e1);border-radius:.35rem;white-space:nowrap}.cg-b:hover{background:var(--xg-chip,rgba(148,163,184,.15))}
      .cg-lv th{text-align:left;background:var(--xg-chip,rgba(148,163,184,.15)) !important}.cg-sub{writing-mode:horizontal-tb;white-space:nowrap}</style>`;
    return css + `<div class="card p-5"><div class="font-semibold">২ · অংশগ্রহণকারী শ্রেণি ও বিষয়</div>
      <div class="flex flex-wrap gap-2 mt-3 mb-3"><button type="button" class="btn btn-ghost btn-sm" onclick="ExCG.all(true)">${icon('check-check')} সব</button><button type="button" class="btn btn-ghost btn-sm" onclick="ExCG.all(false)">${icon('x')} কোনোটি না</button></div>
      ${subs.length ? `<div class="xg-wrap" style="max-height:70vh"><table class="xg cg w-full" style="min-width:${14 + subs.length * 7}rem"><thead><tr><th>শ্রেণি</th><th class="text-center">সারি</th>${subs.map(s => `<th class="text-center"><button type="button" class="cg-b cg-sub" aria-label="${esc(s.name)}: সব শ্রেণিতে চালু/বন্ধ" onclick="ExCG.col('${s.id}')">${esc(s.name)}</button></th>`).join('')}</tr></thead>
        <tbody>${groups.map(g => (groups.length > 1 ? `<tr class="cg-lv"><th scope="row" colspan="2">${long ? `<button type="button" class="flex items-center gap-1 font-semibold" aria-expanded="true" onclick="ExCG.lv(this,'${esc(g.id)}')">${icon('chevron-down', 'w-4 h-4')} ${esc(g.name)}</button>` : `<b>${esc(g.name)}</b>`}</th><td colspan="${n - 2}"></td></tr>` : '') + g.cls.map(row).join('')).join('')}</tbody></table></div>` : emptyState('কোনো বিষয় নেই।')}</div>`;
  },
  /** Setup card 7: carry results of earlier exams into this one (weighted), with the rule for subjects an earlier exam did not have. */
  combineHtml(e) {
    const others = DB.s.exams.filter(x => x.id !== e.id && x.session === e.session).sort((a, b) => a.start.localeCompare(b.start));
    const w = Object.fromEntries((e.combine || []).map(c => [c.examId, c.weight])), rule = e.combineRule || 'redistribute';
    const radio = (k, t, d) => `<label class="flex items-start gap-2"><input type="radio" name="combineRule" value="${k}" ${rule === k ? 'checked' : ''} class="mt-1.5"><span><b>${t}</b> — ${d}</span></label>`;
    return `<div class="card p-5 space-y-3"><div class="font-semibold">৭ · আগের পরীক্ষার ফলাফল যোগ (সমন্বিত ফলাফল)</div>      <div class="space-y-2">${others.map(x => `<label class="flex flex-wrap items-center gap-2"><input type="checkbox" name="cmb_${x.id}" ${w[x.id] != null ? 'checked' : ''}><span class="flex-1 min-w-[10rem]">${esc(x.name)} <span class="text-slate-400">${U.fmtDate(x.start)}${x.published ? '' : ' · অপ্রকাশিত'}</span></span>ভার <input type="number" min="0" max="100" class="grid-input !w-20" name="cmbw_${x.id}" value="${w[x.id] ?? ''}"> %</label>`).join('') || '<div class="text-slate-400">এই শিক্ষাবর্ষে অন্য কোনো পরীক্ষা নেই।</div>'}</div>
      <div class="flex flex-wrap items-center gap-2"><b>এই পরীক্ষার নিজস্ব ভার</b><input type="number" min="0" max="100" class="grid-input !w-20" name="cmbSelf" value="${e.combineSelf ?? ''}" placeholder="বাকি"> % <span id="cmb-sum" class="text-slate-500"></span></div>
      <div class="font-semibold pt-1">কোনো বিষয় আগের কোনো পরীক্ষায় ছিল না, কিন্তু এই পরীক্ষায় আছে — তখন কী হবে?</div>
      ${radio('redistribute', 'ভার পুনর্বণ্টন (প্রস্তাবিত)', 'যেসব পরীক্ষায় বিষয়টি ছিল সেগুলোর ভার ১০০%-এ রূপান্তর')}
      ${radio('zero', 'অনুপস্থিত = ০', 'না থাকা পরীক্ষায় ০% ধরা হয়')}
      ${radio('self', 'শুধু এই পরীক্ষা', 'সেই বিষয়ে কেবল এই পরীক্ষার নম্বর গণ্য')}</div>`;
  },
  presetDraft(k) { this.readDraft(); const e = App.ui.exDraft; e.customBands = SCALE_PRESETS[k].bands.map(b => ({ ...b })); e.customScale = k; App.refresh(); },
  setupMount(id) {
    const f = $('#ex-setup'), tot = () => $$('[data-ctot]', f).forEach(el => { el.textContent = bnNum(U.sum($$(`[data-cscope="${el.dataset.ctot}"] input[name$="_max"]`, f), x => +x.value || 0)); });
    const cmb = () => { const el = $('#cmb-sum'); if (!el) return; const ws = $$('input[name^=cmb_]:checked', f).map(x => +f[`cmbw_${x.name.slice(4)}`].value || 0), s = U.sum(ws), own = f.cmbSelf.value === '' ? Math.max(0, 100 - s) : +f.cmbSelf.value; el.innerHTML = ws.length ? `মোট ভার ${bnNum(s + own)}% (এই পরীক্ষা ${bnNum(own)}% + আগের ${bnNum(s)}%)${s + own === 100 ? '' : ' — মোট ১০০ না হলেও আনুপাতিক হারে হিসাব হবে'}` : 'কোনো আগের পরীক্ষা যুক্ত নয়।'; };
    f.addEventListener('input', () => { tot(); cmb(); }); f.addEventListener('change', cmb); tot(); cmb();
    $$('input[name=gradeSource]', f).forEach(r => r.addEventListener('change', () => { this.readDraft(); App.refresh(); }));
    f.addEventListener('submit', ev => {
      ev.preventDefault(); const copyTo = this.readDraft(), e = App.ui.exDraft;
      if (e.classes && !e.classes.length) return toast('অন্তত একটি শ্রেণি বাছাই করুন।', 'error');
      const noSub = DB.classesIn().filter(c => (!e.classes || e.classes.includes(c.id)) && e.classSubjects?.[c.id]?.length === 0);
      if (noSub.length) return toast(`এই শ্রেণিগুলোর কোনো বিষয় বাছাই করা হয়নি: ${noSub.map(c => c.name).join(', ')}`, 'error');
      if (e.combine?.some(c => !(c.weight > 0))) return toast('যুক্ত করা প্রতিটি আগের পরীক্ষার ভার ০-এর বেশি দিন।', 'error');
      if (e.combine && e.combineSelf === undefined) e.combineSelf = Math.max(0, 100 - U.sum(e.combine, c => c.weight));
      const bad = DB.campusSubjects().filter(s => { const c = Grade.cfg(e, s.id); return c.cqPass > c.cqMax || c.mcqPass > c.mcqMax || c.prPass > c.prMax; });
      if (bad.length) return toast(`যেসব বিষয়ে পাস নম্বর পূর্ণমানের বেশি: ${bad.map(s => s.name).join(', ')}`, 'error');
      if (id && DB.s.marks.some(m => { if (m.examId !== id) return false; const c = Grade.cfg(e, m.subjectId); return m.cq > c.cqMax || m.mcq > c.mcqMax || (m.pr || 0) > c.prMax; })) return toast('প্রদত্ত কিছু নম্বর নতুন পূর্ণমানের চেয়ে বেশি — আগে সেই নম্বরগুলো কমান।', 'error');
      const policy = ({ cqMax, mcqMax, prMax, cqPass, mcqPass, prPass, subjects, gradeSource, schemeId, customBands, customScale, passRule, passPct, failRule, sheet }) => JSON.parse(JSON.stringify({ cqMax, mcqMax, prMax, cqPass, mcqPass, prPass, subjects, gradeSource, schemeId, customBands, customScale, passRule, passPct, failRule, sheet }));
      if (id) { const t = DB.exam(id); ['classes', 'classSubjects', 'combine', 'combineSelf'].forEach(k => delete t[k]); Object.assign(t, e); } else { e.id = (MAJOR_EXAMS.includes(e.type) ? 'TM' : e.type === 'Tutorial' ? 'TU' : 'CT') + (DB.s.exams.length + 1) + '-' + e.session; DB.s.exams.push(e); }
      copyTo.forEach(x => Object.assign(DB.exam(x), policy(e)));
      DB.audit(id ? 'EXAM_SETUP' : 'EXAM_CREATE', 'exams', `${e.name}: ${e.cqMax}+${e.mcqMax}+${e.prMax}, ${Object.keys(e.subjects).length} subject override(s), grading ${e.gradeSource}, pass ${e.passRule}${copyTo.length ? `; copied to ${copyTo.join(', ')}` : ''}`); DB.save();
      toast(copyTo.length ? `পরীক্ষা সেটআপ সংরক্ষিত হয়েছে এবং অন্য ${bnNum(copyTo.length)}টি পরীক্ষায় প্রয়োগ করা হয়েছে।` : 'পরীক্ষা সেটআপ সংরক্ষিত হয়েছে।', 'success'); App.closeDetail();
    });
  },
  /* ---------- setup card 3: assessment components (মানবণ্টন) ---------- */
  compRows(list, scope) {
    const used = new Set(list.map(c => c.k)), add = Object.entries(COMP_KINDS).filter(([k]) => !used.has(k));
    return `<div data-cscope="${scope}" class="space-y-2">${list.map((c, i) => `<div class="flex flex-wrap items-end gap-2">
        <input type="hidden" name="cm_${scope}_${i}_k" value="${esc(c.k)}">
        <div class="min-w-[9rem] flex-1"><label class="label">অংশ</label><input class="input" name="cm_${scope}_${i}_label" value="${esc(c.label || COMP_KINDS[c.k] || c.k)}"></div>
        <div class="w-24"><label class="label">পূর্ণমান</label><input class="input" type="number" min="0" step="0.5" name="cm_${scope}_${i}_max" value="${+c.max || 0}"></div>
        <div class="w-24"><label class="label">পাস নম্বর</label><input class="input" type="number" min="0" step="0.5" name="cm_${scope}_${i}_pass" value="${+c.pass || 0}"></div>
        ${c.k === 'att' ? `<div class="min-w-[12rem] flex-1"><label class="label">উপস্থিতি % : পূর্ণমানের %</label><input class="input" name="cm_${scope}_${i}_scale" value="${esc((c.scale || ATT_SCALE).map(s => `${s.min}:${s.pct}`).join(', '))}"></div>` : ''}
        <button type="button" class="btn btn-ghost text-red-600" aria-label="অংশ বাদ দিন" title="অংশ বাদ দিন" onclick="Exams.delComp('${scope}',${i})">${icon('x')}</button></div>`).join('')}
      <div class="flex flex-wrap items-center gap-2 pt-1"><select class="select !w-auto" aria-label="নতুন অংশ" onchange="Exams.addComp('${scope}',this.value)"><option value="">+ অংশ যোগ করুন</option>${add.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}<option value="custom">নিজস্ব অংশ</option></select><span class="ml-auto">মোট <b data-ctot="${scope}">${bnNum(U.sum(list, c => +c.max || 0))}</b></span></div></div>`;
  },
  compsHtml(e) {
    const subs = DB.campusSubjects();
    return `<div class="card p-5 space-y-4"><div class="font-semibold">৩ · মানবণ্টন (মূল্যায়নের অংশ)</div>
      <div class="rounded-lg border border-slate-200 p-3"><div class="font-semibold mb-2">ডিফল্ট — সকল বিষয়</div>${this.compRows(e.comps || [], 'def')}</div>
      <div class="space-y-2">${subs.map(s => { const o = e.subjects?.[s.id] || {}, own = Array.isArray(o.comps); return `<div class="rounded-lg border border-slate-200 p-3"><div class="flex flex-wrap items-center gap-3"><b class="flex-1 min-w-[8rem]">${esc(s.name)}</b>
        <label class="flex items-center gap-2"><input type="checkbox" class="w-5 h-5" name="inc_${s.id}" ${o.included !== false ? 'checked' : ''}> অন্তর্ভুক্ত</label>
        <label class="flex items-center gap-2"><input type="checkbox" class="w-5 h-5" name="own_${s.id}" ${own ? 'checked' : ''} onchange="Exams.ownComps('${s.id}',this.checked)"> নিজস্ব বণ্টন</label></div>
        ${own ? `<div class="mt-3">${this.compRows(o.comps, s.id)}</div>` : ''}</div>`; }).join('')}</div></div>`;
  },
  parseComps(f, scope) {
    const out = [];
    for (let i = 0; f[`cm_${scope}_${i}_k`]; i++) {
      const k = f[`cm_${scope}_${i}_k`].value, c = { k, label: f[`cm_${scope}_${i}_label`].value.trim() || COMP_KINDS[k] || k, max: Math.max(0, +f[`cm_${scope}_${i}_max`].value || 0), pass: Math.max(0, +f[`cm_${scope}_${i}_pass`].value || 0) };
      const sc = f[`cm_${scope}_${i}_scale`];
      if (sc) { const list = sc.value.split(/[,،\n]+/).map(p => p.split(':').map(x => +U.asciiDigits(x.trim()))).filter(p => p.length === 2 && p.every(Number.isFinite)).map(([min, pct]) => ({ min, pct })); if (list.length) c.scale = list.sort((a, b) => b.min - a.min); }
      out.push(c);
    }
    return out;
  },
  /** Components from the form into the draft; CQ / MCQ / practical are mirrored into cqMax… for older readers. */
  readComps(f, e) {
    e.comps = this.parseComps(f, 'def');
    const mirror = (o, list) => ['cq', 'mcq', 'pr'].forEach(k => { const c = list.find(x => x.k === k); o[k + 'Max'] = c ? c.max : 0; o[k + 'Pass'] = c ? c.pass : 0; });
    mirror(e, e.comps);
    const prev = e.subjects || {}; e.subjects = {};
    DB.campusSubjects().forEach(s => {
      const o = {}, inc = f[`inc_${s.id}`], own = f[`own_${s.id}`];
      if (inc && !inc.checked) o.included = false;
      if (own?.checked) { o.comps = f[`cm_${s.id}_0_k`] ? this.parseComps(f, s.id) : (prev[s.id]?.comps || e.comps.map(c => ({ ...c }))); mirror(o, o.comps); }
      // per-subject pass rule (set on মানবণ্টন) survives a setup save
      if (prev[s.id]?.passRule) { o.passRule = prev[s.id].passRule; if (prev[s.id].passPct != null) o.passPct = prev[s.id].passPct; }
      if (Object.keys(o).length) e.subjects[s.id] = o;
    });
  },
  addComp(scope, k) {
    if (!k) return;
    this.readDraft(); const e = App.ui.exDraft, list = scope === 'def' ? e.comps : e.subjects[scope].comps;
    if (k === 'custom') { const label = (prompt('অংশের নাম') || '').trim(); if (!label) return App.refresh(); k = 'x_' + Date.now().toString(36); list.push({ k, label, max: 10, pass: 0 }); }
    else list.push({ k, label: COMP_KINDS[k], max: k === 'att' ? 5 : 10, pass: 0, ...(k === 'att' ? { scale: ATT_SCALE.map(s => ({ ...s })) } : {}) });
    App.refresh();
  },
  delComp(scope, i) { this.readDraft(); const e = App.ui.exDraft, list = scope === 'def' ? e.comps : e.subjects[scope].comps; list.splice(i, 1); App.refresh(); },
  ownComps(sid, on) {
    this.readDraft(); const e = App.ui.exDraft; e.subjects = e.subjects || {};
    if (on) { e.subjects[sid] = { ...(e.subjects[sid] || {}), comps: e.comps.map(c => ({ ...c })) }; } else if (e.subjects[sid]) delete e.subjects[sid].comps;
    App.refresh();
  },
  removeExam(id) { if (!confirm('এই পরীক্ষাটি মুছে ফেলবেন?')) return; DB.s.exams = DB.s.exams.filter(x => x.id !== id); DB.audit('EXAM_DELETE', 'exams', id); DB.save(); App.closeDetail(); },
});

/* Setup card 2 grid toggles (work on the form's checkboxes; saved with the setup). */
const ExCG = {
  box(sel) { return $$(sel, $('#ex-setup') || document); },
  flip(list) { const on = !list.every(x => x.checked); list.forEach(x => { x.checked = on; }); return on; },
  row(cid) { const on = this.flip(this.box(`[name^="cs_${cid}_"]`)); const r = this.box(`[name="cl_${cid}"]`)[0]; if (r && on) r.checked = true; },
  col(sid) { const L = this.box('[name^="cs_"]').filter(x => x.name.endsWith('_' + sid)); const on = this.flip(L); if (on) L.forEach(x => { const r = this.box(`[name="cl_${x.name.split('_')[1]}"]`)[0]; if (r) r.checked = true; }); },
  all(on) { this.box('[name^="cl_"],[name^="cs_"]').forEach(x => { x.checked = on; }); },
  lv(btn, id) { const open = btn.getAttribute('aria-expanded') !== 'true'; btn.setAttribute('aria-expanded', open); $$(`tr[data-lv="${id}"]`, btn.closest('table')).forEach(r => { r.hidden = !open; }); },
};
