/* ==========================================================================
   STUDENTS — one "শিক্ষার্থী ব্যবস্থাপনা" area and everything around it
   · StudentHub: one page with tabs — শিক্ষার্থী তালিকা · ভর্তি আবেদন · সরাসরি ভর্তি ·
     ভর্তি পরীক্ষা (only when a class requires a test) · উন্নয়ন ও স্থানান্তর ·
     আমদানি / রপ্তানি. The old pages (dossier, admissions, promotion) stay as
     hidden redirects, so old links and bookmarks keep working.
   · Accounts: student / guardian sign-in can be switched off (featureFlags
     studentAccounts / guardianAccounts; the server refuses those sign-ins too).
   · SubjectSets: subjects per বিভাগ / শাখা and elective groups (choose one;
     চতুর্থ বিষয় with NCTB GPA: points above 2 are added). Classes without these
     settings give exactly the same results as before.
   · StaffMarks: Root User / Principal enter marks for any class and subject
     (the teacher gradebook, with every class), plus CSV import of marks.
   · CSV specs (js/modules/csvkit.js): students, teachers, support staff, marks;
     column-chooser exports for students, teachers, invoices and marks.
   · Public: application form print, lost-form recovery (server look-up
     'appRecover', rate-limited), student ID-card verification by ID / reg. no.
   · Madrasah institution types with class presets; empty shift / section;
     crash guards for teacher pages without a teacher record.
   Load after people.js / school.js (needs Admissions, Settings, Subjects, DataIO, CSVKit).
   ========================================================================== */

/* ---------------- student / guardian accounts on/off ---------------- */
const Accounts = {
  on(kind) { const f = (DB.s && DB.s.featureFlags) || {}; return f[kind === 'guardian' ? 'guardianAccounts' : 'studentAccounts'] !== false; },
};
(FLAG_GROUPS['লগইন ও পাসওয়ার্ড'] = FLAG_GROUPS['লগইন ও পাসওয়ার্ড'] || {}).studentAccounts = 'শিক্ষার্থী অ্যাকাউন্ট চালু';
FLAG_GROUPS['লগইন ও পাসওয়ার্ড'].guardianAccounts = 'অভিভাবক অ্যাকাউন্ট চালু';
if (FeatureCfg.PARAMS['লগইন ও পাসওয়ার্ড']) FeatureCfg.PARAMS['লগইন ও পাসওয়ার্ড'].push({ k: 'acctNote', type: 'note', label: 'শিক্ষার্থী বা অভিভাবক অ্যাকাউন্ট বন্ধ থাকলে ভর্তি, সিএসভি আমদানি বা নতুন ব্যবহারকারী তৈরিতে তাঁদের কোনো লগইন তৈরি হয় না, আর আগের অ্যাকাউন্টগুলো দিয়েও লগইন করা যায় না। আবার চালু করলে আগের অ্যাকাউন্টগুলো আবার কাজ করবে। নতুন অ্যাকাউন্টের প্রাথমিক পাসওয়ার্ড সহজ (শিক্ষার্থী: রেজিস্ট্রেশন নম্বর, অভিভাবক: মোবাইল নম্বর, অন্যরা: ৬ অঙ্কের সংখ্যা) — তবে প্রথম লগইনেই তা বদলাতে হয়।' });
Object.assign(BN_LABELS, { 'ID Card Replacement': 'আইডি কার্ড পুনঃইস্যু', Islam: 'ইসলাম' });
/* Login dialog: no student / guardian hint when those accounts are off. */
(() => {
  const s0 = App.showLogin.bind(App);
  App.showLogin = function (...a) {
    const r = s0(...a), st = Accounts.on('student'), g = Accounts.on('guardian');
    if (!st || !g) {
      const i = $('#login-form [name=username]'); if (i) i.placeholder = ['ইউজারনেম', st ? 'স্টুডেন্ট আইডি / রেজিস্ট্রেশন নম্বর' : '', g ? 'মোবাইল নম্বর' : ''].filter(Boolean).join(' / ');
      const p = $('#login-form')?.nextElementSibling; if (p && p.tagName === 'P') { if (!st && !g) p.remove(); else p.textContent = `${st ? 'শিক্ষার্থীরা' : 'অভিভাবকেরা'} প্রতিষ্ঠান থেকে দেওয়া ইউজার আইডি ও পাসওয়ার্ড দিয়ে লগইন করবেন। লগইনে সমস্যা হলে প্রতিষ্ঠানের অফিসে যোগাযোগ করুন।`; }
    }
    return r;
  };
})();

/* ---------------- shift / section may be empty: stored as '' (never undefined) ---------------- */
(() => {
  const s0 = DB.save.bind(DB);
  DB.save = function () {
    if (this.s?.students) this.s.students.forEach(st => { if (st && st.section == null) st.section = ''; if (st && st.shift === undefined) st.shift = ''; });
    if (this.s?.classes) this.s.classes.forEach(c => { if (c && !Array.isArray(c.sections)) c.sections = []; });
    return s0();
  };
})();
/** "দশম শ্রেণি-ক" or just "দশম শ্রেণি" when the class has no section. */
function classSec(classId, section) { return `${DB.className(classId)}${section ? '-' + section : ''}`; }

/* ==========================================================================
   SUBJECT SETS — per বিভাগ / শাখা, elective groups, চতুর্থ বিষয়
   class.subjectRules = { SUBJ: { streams: [..], sections: [..] } }   (empty list = everyone)
   class.electives   = [{ id, name, subjects: [..], fourth: bool, streams: [..] }]   (pick one)
   student.electives = { groupId: subjectId }
   ========================================================================== */
const SubjectSets = {
  _ctx: null,
  cls0(classId) { return SubjectSets.cs0 ? SubjectSets.cs0(classId) : DB.classSubjects(classId); },
  groups(c) { return (c?.electives || []).filter(g => g && (g.subjects || []).length); },
  active(classId) {
    const c = DB.cls(classId); if (!c) return false;
    return Object.values(c.subjectRules || {}).some(r => (r.streams || []).length || (r.sections || []).length) || this.groups(c).length > 0;
  },
  groupFor(g, st) { return !(g.streams || []).length || g.streams.includes(st.stream); },
  REL: { Islam: /ইসলাম|islam/i, Hinduism: /হিন্দু|hindu/i, Buddhism: /বৌদ্ধ|buddh/i, Christianity: /খ্রিস্ট|খ্রিষ্ট|christ/i },
  /** Religion-based group (ধর্ম শিক্ষা): the subject that matches the student's religion. */
  relPick(g, st) { const re = this.REL[st?.religion]; return re ? (g.subjects || []).find(id => { const s = DB.subject(id); return s && (re.test(s.name || '') || re.test(s.nameEn || '')); }) || null : null; },
  /** The student's choice in a group: own choice, else (religion group) the religion's subject. */
  choice(g, st) { const ch = st.electives?.[g.id]; return ch && (g.subjects || []).includes(ch) ? ch : (g.religion ? this.relPick(g, st) : null); },
  /** Subject ids a student takes (examId: an elective not yet chosen counts when it has marks in that exam). */
  ids(st, examId) {
    const c = DB.cls(st.classId), rules = c?.subjectRules || {};
    let list = this.cls0(st.classId).map(s => s.id).filter(id => { const r = rules[id]; return !r || ((!(r.streams || []).length || r.streams.includes(st.stream)) && (!(r.sections || []).length || r.sections.includes(st.section))); });
    this.groups(c).forEach(g => {
      if (!this.groupFor(g, st)) { list = list.filter(id => !g.subjects.includes(id)); return; }
      const ch = this.choice(g, st);
      if (ch) list = list.filter(id => !g.subjects.includes(id) || id === ch);
      else if (examId) list = list.filter(id => !g.subjects.includes(id) || DB.s.marks.some(m => m.examId === examId && m.studentId === st.id && m.subjectId === id));
    });
    return list;
  },
  takes(studentId, subjectId) { const st = DB.student(studentId); if (!st || !this.active(st.classId)) return true; return this.ids(st).includes(subjectId); },
  fourth(st) {
    const g = this.groups(DB.cls(st.classId)).find(x => x.fourth && this.groupFor(x, st));
    return g ? this.choice(g, st) : null;
  },
  /** NCTB: GPA = (Σ points of the main subjects + max(0, 4th-subject point − 2)) / number of main subjects, capped at the scale;
      the 4th subject never fails the student. */
  applyFourth(r, st) {
    const f = this.fourth(st); if (!f || !r || !r.rows?.length || r.scale === 'letter') return r;
    const row = r.rows.find(x => x.subject.id === f); if (!row) return r;
    const main = r.rows.filter(x => x !== row), pts = main.map(x => x.point), ex = r.exam;
    if (!main.length || pts.some(p => p === null || p === undefined)) return r;
    const gpa = ex?.failRule !== 'average' && pts.some(p => p === 0) ? 0 : Math.min(+r.scale || 5, (U.sum(pts) + Math.max(0, (+row.point || 0) - 2)) / main.length);
    const campus = DB.campusOf(st.classId), bands = Grade.bands(campus, ex?.session, ex), failed = main.some(x => x.failed);
    const rows = r.rows.map(x => x === row ? { ...x, fourth: true, subject: { ...x.subject, name: `${x.subject.name} (চতুর্থ বিষয়)` } } : x);
    return { ...r, rows, gpa, letter: Grade.letterForGpa(gpa, bands), passed: ex?.failRule === 'average' ? gpa > 0 : !failed, fourthSubject: f };
  },
  /* ----- editing (Settings → বিষয়সমূহ) ----- */
  can() { return typeof Settings !== 'undefined' && Settings.canEdit ? Settings.canEdit() : App.perm('settings', 'edit'); },
  setRule(classId, sid, kind, value, on) {
    const c = DB.cls(classId); if (!c) return;
    const R = c.subjectRules || (c.subjectRules = {}), r = R[sid] || (R[sid] = { streams: [], sections: [] });
    r[kind] = on ? [...new Set([...(r[kind] || []), value])] : (r[kind] || []).filter(x => x !== value);
    if (!r.streams.length && !r.sections.length) delete R[sid];
    DB.audit('CLASS_SUBJECT_RULES', 'classes', `${classId} ${sid} ${kind}=${(R[sid]?.[kind] || []).join(',') || 'সকল'}`); DB.save(); App.refresh();
  },
  addGroup(classId) {
    const c = DB.cls(classId); if (!c) return;
    const n = (c.electives || []).length + 1, fourth = !(c.electives || []).some(g => g.fourth);
    (c.electives || (c.electives = [])).push({ id: DB.id('EG'), name: fourth ? 'চতুর্থ বিষয়' : `ঐচ্ছিক গুচ্ছ ${U.bn(n)}`, subjects: [], fourth, streams: [] });
    DB.save(); App.refresh();
  },
  setGroup(classId, gid, prop, value, on) {
    const g = (DB.cls(classId)?.electives || []).find(x => x.id === gid); if (!g) return;
    if (prop === 'subjects' || prop === 'streams') g[prop] = on ? [...new Set([...(g[prop] || []), value])] : (g[prop] || []).filter(x => x !== value);
    else if (prop === 'fourth') g.fourth = !!value;
    else g[prop] = String(value || '').trim() || g[prop];
    DB.audit('CLASS_ELECTIVES', 'classes', `${classId} ${g.name}: ${prop}`); DB.save(); App.refresh();
  },
  delGroup(classId, gid) {
    const c = DB.cls(classId); if (!c || !confirm('এই ঐচ্ছিক গুচ্ছটি মুছে ফেলবেন? শিক্ষার্থীদের বেছে নেওয়া বিষয়ও মুছে যাবে।')) return;
    c.electives = (c.electives || []).filter(g => g.id !== gid);
    DB.s.students.filter(s => s.classId === classId && s.electives?.[gid]).forEach(s => delete s.electives[gid]);
    DB.save(); App.refresh();
  },
  choose(studentId, gid, subjectId) {
    const st = DB.student(studentId); if (!st) return;
    st.electives = { ...(st.electives || {}) }; if (subjectId) st.electives[gid] = subjectId; else delete st.electives[gid];
    DB.audit('STUDENT_ELECTIVE', 'students', `${st.id}: ${gid}=${subjectId || '—'}`); DB.save(); toast('বিষয় নির্বাচন সংরক্ষিত হয়েছে।', 'success');
  },
  setStream(studentId, v) { const st = DB.student(studentId); if (!st) return; st.stream = v || null; DB.audit('STUDENT_STREAM', 'students', `${st.id}: ${v || '—'}`); DB.save(); toast('বিভাগ সংরক্ষিত হয়েছে।', 'success'); if (typeof Dossier !== 'undefined' && $('#dossier')) Dossier.render(); },
  editor() {
    const cls = DB.classesIn(); if (!cls.length) return '';
    const c = cls.find(x => x.id === App.ui.ssCls) || cls.find(x => (x.streams || []).length) || cls[0], can = this.can(), dis = can ? '' : 'disabled';
    const subs = this.cls0(c.id), streams = c.streams || [], secs = c.sections || [], R = c.subjectRules || {};
    const chk = (on, js, label) => `<label class="inline-flex items-center gap-1.5 mr-3"><input type="checkbox" class="w-4 h-4" ${on ? 'checked' : ''} ${dis} onchange="${js}">${esc(label)}</label>`;
    return `<div class="card mt-5"><div class="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2"><div class="font-semibold mr-auto">বিভাগ / শাখাভিত্তিক ও ঐচ্ছিক বিষয়</div><label class="sr-only" for="ss-cls">শ্রেণি</label><select id="ss-cls" class="select !w-auto" onchange="App.ui.ssCls=this.value;App.refresh()">${cls.map(x => `<option value="${x.id}" ${x.id === c.id ? 'selected' : ''}>${esc(x.name)}${SubjectSets.active(x.id) ? ' · নির্ধারিত' : ''}</option>`).join('')}</select></div>      <div class="scroll-x"><table class="table"><thead><tr><th>বিষয়</th><th>${esc(c.streamLabel || 'বিভাগ')}</th><th>শাখা</th></tr></thead><tbody>${subs.map(s => `<tr><td class="font-semibold">${esc(s.name)}</td><td>${streams.length ? streams.map(x => chk((R[s.id]?.streams || []).includes(x), `SubjectSets.setRule('${c.id}','${s.id}','streams','${esc(x)}',this.checked)`, x)).join('') : '<span class="text-slate-400">বিভাগ নেই</span>'}</td><td>${secs.length > 1 ? secs.map(x => chk((R[s.id]?.sections || []).includes(x), `SubjectSets.setRule('${c.id}','${s.id}','sections','${esc(x)}',this.checked)`, x)).join('') : '<span class="text-slate-400">একটিমাত্র শাখা</span>'}</td></tr>`).join('') || `<tr><td colspan="3">${emptyState('এই শ্রেণির কোনো বিষয় নেই।')}</td></tr>`}</tbody></table></div>
      <div class="p-5 border-t border-slate-100 space-y-3"><div class="flex flex-wrap items-center gap-2"><div class="font-semibold mr-auto">ঐচ্ছিক গুচ্ছ (একটি বেছে নিতে হয়)</div>${can ? `<button class="btn btn-ghost btn-sm" onclick="SubjectSets.addGroup('${c.id}')">${icon('plus')} গুচ্ছ যোগ করুন</button>` : ''}</div>
        ${(c.electives || []).map(g => `<div class="border border-slate-200 rounded-lg p-3 space-y-2"><div class="flex flex-wrap items-center gap-2"><label class="sr-only" for="eg-${g.id}">গুচ্ছের নাম</label><input id="eg-${g.id}" class="input !py-1 !w-56" value="${esc(g.name)}" ${dis} onchange="SubjectSets.setGroup('${c.id}','${g.id}','name',this.value)">${chk(g.fourth, `SubjectSets.setGroup('${c.id}','${g.id}','fourth',this.checked)`, 'চতুর্থ বিষয়')}${can ? `<button class="btn btn-ghost btn-sm ml-auto text-red-600" onclick="SubjectSets.delGroup('${c.id}','${g.id}')">${icon('trash-2')} মুছুন</button>` : ''}</div>
          <div><span class="text-slate-500 mr-2">বিষয়:</span>${subs.map(s => chk((g.subjects || []).includes(s.id), `SubjectSets.setGroup('${c.id}','${g.id}','subjects','${s.id}',this.checked)`, s.name)).join('')}</div>
          ${streams.length ? `<div><span class="text-slate-500 mr-2">শুধু এই ${esc(c.streamLabel || 'বিভাগ')}ের জন্য:</span>${streams.map(x => chk((g.streams || []).includes(x), `SubjectSets.setGroup('${c.id}','${g.id}','streams','${esc(x)}',this.checked)`, x)).join('')}</div>` : ''}</div>`).join('') || '<p class="text-slate-400">কোনো ঐচ্ছিক গুচ্ছ নেই।</p>'}</div></div>`;
  },
  /** Student profile card: বিভাগ and elective choices (staff edit; students / guardians see them). */
  studentCard(st) {
    const c = DB.cls(st.classId); if (!c) return '';
    const groups = this.groups(c).filter(g => this.groupFor(g, st)), streams = c.streams || [];
    if (!groups.length && !streams.length) return '';
    const can = !['STUDENT', 'GUARDIAN'].includes(App.session?.role) && (App.perm('students', 'edit') || App.has('ADMIN')), dis = can ? '' : 'disabled';
    const mine = this.ids(st).map(id => DB.subject(id)?.name).filter(Boolean), f = this.fourth(st);
    return `<div class="card p-4 mt-5" id="dos-subjects"><div class="font-semibold mb-3 flex items-center gap-2">${icon('book-marked', 'w-4 h-4 text-brand-600')} বিভাগ ও বিষয় নির্বাচন</div><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      ${streams.length ? `<div><label class="label" for="dos-stream">${esc(c.streamLabel || 'বিভাগ')}</label><select id="dos-stream" class="select" ${dis} onchange="SubjectSets.setStream('${st.id}',this.value)"><option value="">— নির্ধারিত নয় —</option>${streams.map(x => `<option ${x === st.stream ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>` : ''}
      ${groups.map(g => `<div><label class="label" for="dos-eg-${g.id}">${esc(g.name)}${g.fourth ? ' (চতুর্থ বিষয়)' : ''}</label><select id="dos-eg-${g.id}" class="select" ${dis} onchange="SubjectSets.choose('${st.id}','${g.id}',this.value);Dossier.render()"><option value="">— বেছে নেওয়া হয়নি —</option>${g.subjects.map(id => `<option value="${id}" ${SubjectSets.choice(g, st) === id ? 'selected' : ''}>${esc(DB.subject(id)?.name || id)}</option>`).join('')}</select></div>`).join('')}</div>
      <p class="text-slate-600 mt-3">এই শিক্ষার্থীর বিষয়: ${esc(mine.join(', ') || '—')}${f ? ` · চতুর্থ বিষয়: <b>${esc(DB.subject(f)?.name || f)}</b>` : ''}</p></div>`;
  },
};
/* Results use the student's own subject set; classes without settings are unchanged. */
(() => {
  const cs0 = DB.classSubjects.bind(DB); SubjectSets.cs0 = cs0;
  DB.classSubjects = function (classId) { const out = cs0(classId), x = SubjectSets._ctx; return x && x.cls === classId ? out.filter(s => x.ids.has(s.id)) : out; };
  const r0 = DB.result;
  DB.result = function (studentId, examId) {
    const st = this.student(studentId);
    if (!st || !SubjectSets.active(st.classId)) return r0.call(this, studentId, examId);
    const prev = SubjectSets._ctx; SubjectSets._ctx = { cls: st.classId, ids: new Set(SubjectSets.ids(st, examId)) };
    try { return SubjectSets.applyFourth(r0.call(this, studentId, examId), st); } finally { SubjectSets._ctx = prev; }
  };
  // combined (carried-forward) results follow the same চতুর্থ বিষয় rule as a single exam
  if (DB.combinedResult) {
    const c0 = DB.combinedResult;
    DB.combinedResult = function (studentId, examId) {
      const r = c0.call(this, studentId, examId), st = this.student(studentId);
      if (!r?.combined || !st || !SubjectSets.active(st.classId)) return r;
      const out = SubjectSets.applyFourth({ ...r, exam: r.exam || this.exam(examId) }, st);
      return out === r ? r : { ...out, combined: true };
    };
  }
  if (typeof Subjects !== 'undefined') { const e0 = Subjects.editor.bind(Subjects); Subjects.editor = function () { return e0() + SubjectSets.editor(); }; }
  if (typeof Dossier !== 'undefined') {
    const d0 = Dossier.render;
    Dossier.render = function () {
      d0.apply(this, arguments);
      try { const st = DB.student(this.sid), host = $('#dossier'); if (st && host && this.tab === 'personal' && !$('#dos-guardians')) { host.insertAdjacentHTML('beforeend', GuardianCard.html(st)); App.icons(); } } catch (e) { console.error(e); }
      try { const st = DB.student(this.sid), host = $('#dossier'); if (st && host && this.tab === 'personal' && !$('#dos-subjects')) { host.insertAdjacentHTML('beforeend', SubjectSets.studentCard(st)); App.icons(); } } catch (e) { console.error(e); }
    };
  }
})();

/* ==========================================================================
   GUARDIAN CARD — অভিভাবক section of the student profile. Data: guardianLinks
   { guardianUserId, studentId, relation, primary } + users. Staff with students: edit
   change it through /api/guardian/* (server/guardian.js); students / guardians read only.
   ========================================================================== */
const GuardianCard = {
  REL: [['Father', 'পিতা'], ['Mother', 'মাতা'], ['Guardian', 'অভিভাবক'], ['Other', 'অন্যান্য']],
  rel(r) { return (this.REL.find(x => x[0] === r) || [, bn(r) || 'অভিভাবক'])[1]; },
  links(sid) { return DB.s.guardianLinks.filter(l => l.studentId === sid); },
  primary(sid) { const L = this.links(sid), l = L.find(x => x.primary) || L[0], u = l && DB.user(l.guardianUserId); return u ? { ...u, relation: l.relation } : null; },
  can() { return !['STUDENT', 'GUARDIAN', 'TEACHER'].includes(App.session?.role) && (App.has('ADMIN') || App.has('PRINCIPAL') || App.perm('students', 'edit')); },
  login(u) {
    if (!Accounts.on('guardian')) return badge('অভিভাবক অ্যাকাউন্ট বন্ধ', 'slate');
    if (!u.active) return badge('লগইন নেই', 'slate');
    return u.mustChange || u.pwDefault ? badge('প্রথম লগইন বাকি', 'amber') : badge('লগইন সক্রিয়', 'green');
  },
  ERR: { name: 'নাম লিখুন।', phone: 'সঠিক মোবাইল নম্বর লিখুন (01XXXXXXXXX)।', email: 'ই-মেইল ঠিক নেই।', nid: 'জাতীয় পরিচয়পত্র নম্বর ১০, ১৩ বা ১৭ অঙ্কের হতে হবে।', phone_taken: 'এই মোবাইল নম্বরে আরেকটি অ্যাকাউন্ট আছে।', not_guardian: 'এই অ্যাকাউন্টটি অভিভাবকের নয়।', forbidden: 'অনুমতি নেই।', not_found: 'পাওয়া যায়নি।', student_not_found: 'শিক্ষার্থীর রেকর্ড সার্ভারে পাওয়া যায়নি — পাতাটি আবার লোড করুন।', user_not_found: 'ব্যবহারকারীর অ্যাকাউন্ট সার্ভারে পাওয়া যায়নি — পাতাটি আবার লোড করুন।', link_not_found: 'এই অভিভাবক-সংযোগ আর নেই — পাতাটি আবার লোড করুন।', mode: 'অপসারণের ধরন সঠিক নয়।', self: 'নিজের অ্যাকাউন্টে এটি করা যায় না।', same: 'একই অভিভাবক বেছে নেওয়া হয়েছে।' },
  /** Server-side search (full data, Bangla digits normalised): kind 'users' | 'students'; results in App.ui.lk[key]. */
  async find(kind, key, q, redraw) {
    const L = App.ui.lk || (App.ui.lk = {}); L[key] = { q, items: (L[key] || {}).items || [] };
    if (String(q || '').trim().length < (kind === 'users' ? 2 : 1)) { L[key].items = []; return redraw(); }
    try { const r = await DB.api(`lookup/${kind}?q=${encodeURIComponent(q)}`, undefined, 'GET'); if (L[key].q === q) { L[key].items = r.items || []; redraw(); } }
    catch (e) { toast(e.status === 403 ? 'অনুমতি নেই।' : 'খোঁজা যায়নি — আবার চেষ্টা করুন।', 'error'); }
  },
  hits(key, q) { const x = App.ui.lk?.[key]; return x && x.q === q ? x.items : []; },
  /** Search box: keeps focus and cursor across the redraw. */
  searchBox(id, key, kind, label, redrawJs) {
    const q = App.ui.lk?.[key]?.q || '';
    return `<label class="label" for="${id}">${label}</label><input id="${id}" class="input" type="search" value="${esc(q)}" oninput="clearTimeout(window.__lkT);const v=this.value;window.__lkT=setTimeout(()=>GuardianCard.find('${kind}','${key}',v,()=>{${redrawJs};const i=$('#${id}');i&&(i.focus(),i.setSelectionRange(i.value.length,i.value.length))}),300)">`;
  },
  roleTxt(u) { return (u.roles || DB.roles(u.id)).map(bn).join(', ') || '—'; },
  async call(path, body, ok) {
    // unsaved changes first (a student or account created a moment ago must exist on the server)
    try { await DB.flush?.(); const r = await DB.api('guardian/' + path, body); await DB.reloadRemote?.(); toast(ok, 'success'); App.ui.gdEdit = null; App.ui.gdAdd = false; App.ui.gdRep = null; App.ui.gdInfo = null; this.redraw(); return r; }
    catch (e) { toast(this.ERR[e.message] || 'সংরক্ষণ করা যায়নি — আবার চেষ্টা করুন।', 'error'); }
  },
  /** Re-draw whichever guardian view is open (student card or user profile). */
  redraw() { if (typeof Dossier !== 'undefined' && $('#dossier')) Dossier.render(); else if ($('#up-host')) UserProfile.redraw(); else App.refresh(); },
  /** Mirror of the server rule: guardian-only accounts → guardian desk; other accounts → Root / users: edit. */
  canInfo(uid) { const r = DB.roles(uid); if (r.includes('ADMIN') && !App.has('ADMIN')) return false; return r.every(x => x === 'GUARDIAN') ? this.can() : (App.has('ADMIN') || App.perm('users', 'edit')); },
  infoForm(uid) {
    const u = DB.user(uid), v = x => esc(u?.[x] || ''), inp = (n, lab, extra = '') => `<div><label class="label" for="gi-${uid}-${n}">${lab}</label><input id="gi-${uid}-${n}" class="input" name="${n}" value="${v(n)}" ${extra}></div>`;
    return `<form id="gi-form-${uid}" class="grid sm:grid-cols-2 gap-3 p-3 rounded-lg border border-slate-200 mt-2" onsubmit="GuardianCard.saveInfo('${uid}');return false">
      ${inp('nameBn', 'নাম (বাংলায়)')}${inp('name', 'নাম (ইংরেজিতে)')}${inp('phone', 'মোবাইল', 'required inputmode="tel"')}${inp('email', 'ই-মেইল', 'type="email"')}${inp('nid', 'জাতীয় পরিচয়পত্র', 'inputmode="numeric"')}${inp('occupation', 'পেশা')}
      <div class="sm:col-span-2"><label class="label" for="gi-${uid}-address">ঠিকানা</label><input id="gi-${uid}-address" class="input" name="address" value="${v('address')}"></div>
      <div class="sm:col-span-2 flex flex-wrap gap-2"><button class="btn btn-primary btn-sm">${icon('save')} সংরক্ষণ</button><button type="button" class="btn btn-ghost btn-sm" onclick="App.ui.gdInfo=null;GuardianCard.redraw()">বাতিল</button></div></form>`;
  },
  saveInfo(uid) { const f = $(`#gi-form-${uid}`); if (!f) return; const d = formData(f); return this.call('info', { userId: uid, ...d }, 'অভিভাবকের তথ্য সংরক্ষিত হয়েছে।'); },
  setRel(sid, uid, rel) { return this.call('relation', { studentId: sid, userId: uid, relation: rel }, 'সম্পর্ক সংরক্ষিত হয়েছে।'); },
  unlinkWarn(sid, uid) {
    const last = this.links(sid).filter(l => l.guardianUserId !== uid).length === 0, st = DB.student(sid);
    if (!confirm(`${pn(st)}-কে এই অভিভাবক থেকে বিচ্ছিন্ন করবেন?${last ? '\n\nসতর্কতা: এরপর শিক্ষার্থীর কোনো অভিভাবক যুক্ত থাকবে না।' : ''}`)) return;
    return this.call('unlink', { studentId: sid, userId: uid }, 'বিচ্ছিন্ন করা হয়েছে।');
  },
  /** অভিভাবক বদল: pick an existing account or enter a new guardian; relation and primary are kept. */
  replaceUi(sid, oldId) {
    const linked = new Set(this.links(sid).map(l => l.guardianUserId));
    const found = this.hits('gr', App.ui.lk?.gr?.q || '').filter(u => !linked.has(u.id));
    const inp = (n, lab, extra = '') => `<div><label class="label" for="gr-${n}">${lab}</label><input id="gr-${n}" class="input" name="${n}" ${extra}></div>`;
    return `<div class="p-3 rounded-lg border border-amber-300 mt-2 space-y-3"><div class="font-semibold">অভিভাবক বদল</div>
      <div>${this.searchBox('gr-q', 'gr', 'users', 'বিদ্যমান ব্যবহারকারী খুঁজুন (মোবাইল, ইউজার আইডি, নাম বা আইডি)', 'GuardianCard.redraw()')}</div>
      ${found.map(u => `<div class="flex items-center gap-2">${avatar(u, 28)}<span class="flex-1 min-w-0 truncate">${esc(pn(u))} · @${esc(u.username || '')}${u.phone ? ' · ' + esc(U.bn(u.phone)) : ''}</span><button class="btn btn-primary btn-sm" onclick="GuardianCard.doReplace('${sid}','${oldId}','${u.id}')">${icon('repeat')} বদলান</button></div>`).join('')}
      <form id="gr-form" class="grid sm:grid-cols-2 gap-3" onsubmit="GuardianCard.doReplace('${sid}','${oldId}',null);return false"><div class="sm:col-span-2 text-slate-500">অথবা নতুন অভিভাবক</div>${inp('nameBn', 'নাম (বাংলায়)')}${inp('name', 'নাম (ইংরেজিতে)')}${inp('phone', 'মোবাইল', 'required inputmode="tel"')}${inp('email', 'ই-মেইল', 'type="email"')}
        <div class="sm:col-span-2 flex flex-wrap gap-2"><button class="btn btn-primary btn-sm">${icon('repeat')} নতুন অভিভাবক দিয়ে বদলান</button><button type="button" class="btn btn-ghost btn-sm" onclick="App.ui.gdRep=null;GuardianCard.redraw()">বাতিল</button></div></form></div>`;
  },
  doReplace(sid, oldId, newId) {
    const body = { studentId: sid, oldUserId: oldId };
    if (newId) { const u = this.hits('gr', App.ui.lk?.gr?.q || '').find(x => x.id === newId) || DB.user(newId); Object.assign(body, { userId: newId }); if (!confirm(`${pn(DB.user(oldId) || {})}-এর জায়গায় ${pn(u || {})}-কে অভিভাবক করবেন?`)) return; }
    else Object.assign(body, formData($('#gr-form')));
    if (App.ui.lk) delete App.ui.lk.gr; return this.call('replace', body, 'অভিভাবক বদলানো হয়েছে।');
  },
  /** অপসারণ: every child unlinked, then the GUARDIAN role removed (other roles kept) or the account deactivated / deleted. */
  /** Opens the in-page confirmation (removePanel); the choice there calls doRemove. */
  remove(uid) { App.ui.gdRm = App.ui.gdRm === uid ? null : uid; this.redraw(); },
  removePanel(uid) {
    const u = DB.user(uid), only = DB.roles(uid).every(r => r === 'GUARDIAN'), L = DB.s.guardianLinks.filter(l => l.guardianUserId === uid);
    const alone = L.filter(l => !DB.s.guardianLinks.some(x => x.studentId === l.studentId && x.guardianUserId !== uid)).length;
    return `<div class="p-3 rounded-lg border border-red-300 mt-2 space-y-2" role="alertdialog" aria-label="অভিভাবক অপসারণ"><div class="font-semibold">${esc(pn(u))}-কে অভিভাবক হিসেবে অপসারণ</div>
      <p>${L.length ? `${bnNum(L.length)} জন সন্তান বিচ্ছিন্ন হবে।` : 'কোনো সন্তান যুক্ত নেই।'}${only ? '' : ' শুধু অভিভাবক ভূমিকা সরানো হবে; অন্য ভূমিকা ও পাসওয়ার্ড অপরিবর্তিত থাকবে।'}</p>
      ${alone ? `<p class="text-red-700 font-semibold">${icon('triangle-alert', 'w-4 h-4 inline')} ${bnNum(alone)} জন শিক্ষার্থীর আর কোনো অভিভাবক থাকবে না।</p>` : ''}
      <div class="flex flex-wrap gap-2">${only ? `<button class="btn btn-ghost btn-sm" onclick="GuardianCard.doRemove('${uid}','deactivate')">${icon('user-x')} নিষ্ক্রিয় করুন</button><button class="btn btn-sm bg-red-600 text-white hover:bg-red-700" onclick="GuardianCard.doRemove('${uid}','delete')">${icon('trash-2')} মুছে ফেলুন</button>` : `<button class="btn btn-sm bg-red-600 text-white hover:bg-red-700" onclick="GuardianCard.doRemove('${uid}','role')">${icon('user-minus')} অভিভাবক ভূমিকা সরান</button>`}<button class="btn btn-ghost btn-sm" onclick="App.ui.gdRm=null;GuardianCard.redraw()">বাতিল</button></div></div>`;
  },
  doRemove(uid, mode) {
    App.ui.gdRm = null;
    return this.call('remove', { userId: uid, mode }, mode === 'delete' ? 'অ্যাকাউন্ট মুছে রিসাইকেল বিনে রাখা হয়েছে।' : mode === 'deactivate' ? 'অভিভাবক অপসারণ ও অ্যাকাউন্ট নিষ্ক্রিয় হয়েছে।' : 'অভিভাবক ভূমিকা সরানো হয়েছে।').then(r => { if (r && mode === 'delete') App.closeDetail?.(); });
  },
  relSel(sid, uid, rel, dis) { return `<select class="select !py-1 !w-auto" aria-label="সম্পর্ক" ${dis ? 'disabled' : ''} onchange="GuardianCard.setRel('${sid}','${uid}',this.value)">${this.REL.map(([r, b]) => `<option value="${r}" ${r === rel ? 'selected' : ''}>${b}</option>`).join('')}</select>`; },
  primTog(sid, uid, on, dis) { return `<label class="inline-flex items-center gap-1.5"><input type="radio" class="w-4 h-4" name="gp-${sid}" ${on ? 'checked' : ''} ${dis || on ? 'disabled' : ''} onchange="GuardianCard.setPrimary('${sid}','${uid}')" aria-label="প্রধান যোগাযোগ">${on ? 'প্রধান' : ''}</label>`; },
  save(sid, uid) {
    const f = $(`#gd-form-${uid || 'new'}`); if (!f) return; const d = formData(f);
    return this.call('save', { studentId: sid, userId: uid || undefined, name: d.name, nameBn: d.nameBn, phone: d.phone, email: d.email, nid: d.nid, occupation: d.occupation, address: d.address, relation: d.relation, primary: !!f.primary?.checked }, uid ? 'অভিভাবকের তথ্য সংরক্ষিত হয়েছে।' : 'অভিভাবক যুক্ত হয়েছে।');
  },
  link(sid, uid) { if (App.ui.lk) delete App.ui.lk.gd; return this.call('save', { studentId: sid, userId: uid, relation: $('#gd-link-rel')?.value || 'Guardian' }, 'অভিভাবক যুক্ত হয়েছে।'); },
  unlink(sid, uid) { if (!confirm('এই অভিভাবককে শিক্ষার্থী থেকে বিচ্ছিন্ন করবেন? তাঁর অ্যাকাউন্ট থেকে যাবে।')) return; return this.call('unlink', { studentId: sid, userId: uid }, 'বিচ্ছিন্ন করা হয়েছে।'); },
  setPrimary(sid, uid) { return this.call('primary', { studentId: sid, userId: uid }, 'প্রধান অভিভাবক নির্ধারিত হয়েছে।'); },
  form(sid, u, l) {
    const k = u?.id || 'new', v = x => esc(u?.[x] || ''), inp = (n, lab, extra = '') => `<div><label class="label" for="gd-${k}-${n}">${lab}</label><input id="gd-${k}-${n}" class="input" name="${n}" value="${v(n)}" ${extra}></div>`;
    return `<form id="gd-form-${k}" class="grid sm:grid-cols-2 gap-3 p-3 rounded-lg border border-slate-200 mt-2" onsubmit="GuardianCard.save('${sid}',${u ? `'${u.id}'` : 'null'});return false">
      ${inp('nameBn', 'নাম (বাংলায়)')}${inp('name', 'নাম (ইংরেজিতে)')}${inp('phone', 'মোবাইল', 'required inputmode="tel" pattern="(01|০১)[0-9০-৯]{9}"')}${inp('email', 'ই-মেইল', 'type="email"')}${inp('nid', 'জাতীয় পরিচয়পত্র (ঐচ্ছিক)', 'inputmode="numeric"')}${inp('occupation', 'পেশা')}${inp('address', 'ঠিকানা')}
      <div><label class="label" for="gd-${k}-rel">সম্পর্ক</label><select id="gd-${k}-rel" class="select" name="relation">${this.REL.map(([r, b]) => `<option value="${r}" ${(l?.relation || 'Guardian') === r ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
      <label class="inline-flex items-center gap-2"><input type="checkbox" name="primary" class="w-4 h-4" ${l?.primary ? 'checked' : ''}> প্রধান যোগাযোগ</label>
      <div class="sm:col-span-2 flex flex-wrap gap-2"><button class="btn btn-primary btn-sm">${icon('save')} সংরক্ষণ</button><button type="button" class="btn btn-ghost btn-sm" onclick="App.ui.gdEdit=null;App.ui.gdAdd=false;Dossier.render()">বাতিল</button></div></form>`;
  },
  html(st) {
    const can = this.can(), L = this.links(st.id), ui = App.ui, prim = this.primary(st.id);
    const rows = L.map(l => { const u = DB.user(l.guardianUserId); if (!u) return ''; const isP = prim?.id === u.id;
      return `<div class="py-3"><div class="flex flex-wrap items-center gap-2">${avatar(u, 36)}<div class="flex-1 min-w-0"><div class="font-semibold">${esc(pn(u))} <span class="text-slate-500 font-normal">· ${esc(this.rel(l.relation))}</span> ${isP ? badge('প্রধান যোগাযোগ', 'blue') : ''}</div>
        <div class="text-slate-600">${u.phone ? `<a class="text-brand-700" href="tel:${esc(u.phone)}">${esc(U.bn(u.phone))}</a>` : '—'}${u.email ? ` · ${esc(u.email)}` : ''}${u.nid ? ` · এনআইডি ${esc(U.bn(u.nid))}` : ''}</div></div>${this.login(u)}</div>
        ${can ? `<div class="flex flex-wrap items-center gap-2 mt-2">${this.relSel(st.id, u.id, l.relation)}${this.primTog(st.id, u.id, isP)}${this.canInfo(u.id) ? `<button class="btn btn-ghost btn-sm" onclick="App.ui.gdInfo='${u.id}';App.ui.gdRep=null;Dossier.render()">${icon('pencil')} তথ্য সম্পাদনা</button>` : ''}<button class="btn btn-ghost btn-sm" onclick="App.ui.gdRep='${st.id}|${u.id}';App.ui.gdInfo=null;Dossier.render()">${icon('repeat')} অভিভাবক বদল</button>${Accounts.on('guardian') && u.active && typeof PwDesk !== 'undefined' ? `<button class="btn btn-ghost btn-sm" onclick="PwDesk.reset('${u.id}')">${icon('key-round')} পাসওয়ার্ড রিসেট</button>` : ''}<button class="btn btn-ghost btn-sm" onclick="UserProfile.open('${u.id}')">${icon('user-round')} প্রোফাইল</button><button class="btn btn-ghost btn-sm text-red-600" onclick="GuardianCard.unlinkWarn('${st.id}','${u.id}')">${icon('unlink')} বিচ্ছিন্ন</button></div>` : ''}
        ${can && ui.gdInfo === u.id ? this.infoForm(u.id) : ''}${can && ui.gdRep === `${st.id}|${u.id}` ? this.replaceUi(st.id, u.id) : ''}</div>`; }).join('');
    const linked = new Set(L.map(l => l.guardianUserId)), q = App.ui.lk?.gd?.q || '';
    const found = this.hits('gd', q).filter(u => !linked.has(u.id));
    const add = can ? `<div class="border-t border-slate-100 pt-3 mt-1"><div class="flex flex-wrap items-end gap-2"><div class="flex-1 min-w-[12rem]">${this.searchBox('gd-q', 'gd', 'users', 'বিদ্যমান ব্যবহারকারী খুঁজুন (মোবাইল, ইউজার আইডি, নাম বা আইডি)', 'GuardianCard.redraw()')}</div>
        <div><label class="label" for="gd-link-rel">সম্পর্ক</label><select id="gd-link-rel" class="select !w-auto">${this.REL.map(([r, b]) => `<option value="${r}">${b}</option>`).join('')}</select></div>
        <button class="btn btn-ghost" onclick="App.ui.gdAdd=!App.ui.gdAdd;App.ui.gdEdit=null;Dossier.render()">${icon('user-plus')} নতুন অভিভাবক</button></div>
        ${found.length ? `<div class="divide-y divide-slate-100 mt-2">${found.map(u => `<div class="py-2 flex items-center gap-2">${avatar(u, 28)}<span class="flex-1 min-w-0 truncate">${esc(pn(u))} · @${esc(u.username || '')}${u.phone ? ' · ' + esc(U.bn(u.phone)) : ''} <span class="text-slate-500">(${esc(this.roleTxt(u))})</span></span><button class="btn btn-ghost btn-sm" onclick="GuardianCard.link('${st.id}','${u.id}')">${icon('link')} যুক্ত করুন</button></div>`).join('')}</div>` : q.trim().length >= 2 && App.ui.lk?.gd?.items ? '<p class="text-slate-500 mt-2">কাউকে পাওয়া যায়নি।</p>' : ''}
        ${ui.gdAdd ? this.form(st.id, null, { relation: 'Guardian', primary: !L.length }) : ''}</div>` : '';
    const par = (l, a, b) => `<div><div class="text-slate-500">${l}</div><div class="font-semibold">${esc(st[b] || st[a] || '—')}</div></div>`;
    return `<div class="card p-4 mt-5" id="dos-guardians"><div class="font-semibold mb-3 flex items-center gap-2">${icon('users', 'w-4 h-4 text-brand-600')} অভিভাবক</div>
      <div class="grid sm:grid-cols-2 gap-3 pb-3 border-b border-slate-100">${par('পিতার নাম', 'fatherName', 'fatherNameBn')}${par('মাতার নাম', 'motherName', 'motherNameBn')}</div>
      <div class="divide-y divide-slate-100">${rows || '<p class="py-3 text-slate-500">কোনো অভিভাবক যুক্ত নেই।</p>'}</div>${add}</div>`;
  },
};

/** ব্যবহারকারী ব্যবস্থাপনা → a user's name opens their profile: student → dossier, teacher → teacher profile,
    support staff → HR profile, everyone else (and anyone with several profiles) → a basic user profile with
    links to each specific profile and the linked children. Links show only where the viewer may look. */
const UserProfile = {
  kinds(uid) {
    const out = [], st = DB.studentByUser?.(uid), t = DB.teacherByUser?.(uid), sf = (DB.s.staff || []).find(x => x.userId === uid);
    if (st && (App.perm('students', 'view') || App.has('ADMIN'))) out.push(['student', 'শিক্ষার্থীর নথি', 'folder-search', `Dossier.open('${st.id}')`, st.id]);
    if (t && typeof Faculty !== 'undefined' && (App.perm('hr', 'view') || App.has('ADMIN') || App.has('PRINCIPAL'))) out.push(['teacher', 'শিক্ষকের প্রোফাইল', 'id-card-lanyard', `Faculty.profile('${t.id}')`, t.id]);
    if (sf && typeof HR !== 'undefined' && (App.perm('hr', 'view') || App.has('ADMIN') || App.has('PRINCIPAL'))) out.push(['staff', 'কর্মীর প্রোফাইল', 'id-card', `HR.staffProfile('${sf.id}')`, sf.id]);
    return out;
  },
  open(uid) {
    const u = DB.user(uid); if (!u) return toast('ব্যবহারকারী পাওয়া যায়নি।', 'error');
    const K = this.kinds(uid), roles = DB.roles(uid), kids = DB.s.guardianLinks.some(l => l.guardianUserId === uid);
    // one specific profile and nothing else to show → open it directly
    if (K.length === 1 && roles.length === 1 && !kids) { const [k, , , , id] = K[0]; return k === 'student' ? Dossier.open(id) : k === 'teacher' ? Faculty.profile(id) : HR.staffProfile(id); }
    App.openDetail({ title: `প্রোফাইল · ${pn(u)}`, render: () => `<div id="up-host" data-uid="${esc(uid)}">${this.html(uid)}</div>` });
  },
  redraw() { const h = $('#up-host'); if (!h) return; if (!DB.user(h.dataset.uid)) { h.innerHTML = emptyState('ব্যবহারকারী পাওয়া যায়নি।'); return; } h.innerHTML = this.html(h.dataset.uid); App.icons(); },
  /** Children of a guardian: child | relation | primary | actions (one compact table). */
  kidsTable(uid) {
    const kids = DB.s.guardianLinks.filter(l => l.guardianUserId === uid).map(l => ({ l, s: DB.student(l.studentId) })).filter(x => x.s);
    const can = GuardianCard.can(), see = App.perm('students', 'view') || App.has('ADMIN') || App.has('PRINCIPAL');
    if (!kids.length) return '<p class="text-slate-500">কেউ যুক্ত নেই।</p>';
    const prim = sid => GuardianCard.primary(sid)?.id === uid;
    return `<div class="scroll-x"><table class="table"><thead><tr><th>সন্তান</th><th>সম্পর্ক</th><th>প্রধান</th>${can ? '<th></th>' : ''}</tr></thead><tbody>${kids.map(({ l, s }) => `<tr><td><div class="flex items-center gap-2">${avatar(s, 30)}<div class="min-w-0">${see ? `<a href="#" class="font-semibold text-brand-700 hover:underline" onclick="event.preventDefault();Dossier.open('${s.id}')">${esc(pn(s))}</a>` : `<span class="font-semibold">${esc(pn(s))}</span>`}<div class="text-slate-500">${esc(classSec(s.classId, s.section))} · রোল ${bnNum(s.roll)}</div></div></div></td>
      <td>${can ? GuardianCard.relSel(s.id, uid, l.relation) : esc(GuardianCard.rel(l.relation))}</td><td>${GuardianCard.primTog(s.id, uid, prim(s.id), !can)}</td>
      ${can ? `<td><div class="flex flex-wrap gap-1 justify-end"><button class="btn btn-ghost btn-sm" onclick="App.ui.gdRep='${s.id}|${uid}';UserProfile.redraw()">${icon('repeat')} অভিভাবক বদল</button><button class="btn btn-ghost btn-sm text-red-600" onclick="GuardianCard.unlinkWarn('${s.id}','${uid}')">${icon('unlink')} বিচ্ছিন্ন</button></div></td>` : ''}</tr>
      ${can && App.ui.gdRep === `${s.id}|${uid}` ? `<tr><td colspan="4">${GuardianCard.replaceUi(s.id, uid)}</td></tr>` : ''}`).join('')}</tbody></table></div>`;
  },
  html(uid) {
    const u = DB.user(uid), K = this.kinds(uid), roles = DB.roles(uid), by = u.createdBy && DB.user(u.createdBy);
    const kids = DB.s.guardianLinks.filter(l => l.guardianUserId === uid).map(l => ({ l, s: DB.student(l.studentId) })).filter(x => x.s);
    const last = (DB.s.audit || []).filter(a => a.userId === uid).map(a => a.ts).sort().pop();
    const row = (k, v) => `<div class="flex flex-wrap justify-between gap-2 py-2"><span class="text-slate-500">${k}</span><span class="font-semibold">${v}</span></div>`;
    return `<div class="grid lg:grid-cols-3 gap-5 items-start"><div class="card p-5 lg:col-span-1"><div class="flex items-center gap-3 mb-3">${avatar(u, 56)}<div class="min-w-0"><div class="font-bold text-lg">${esc(pn(u))}</div><div class="text-slate-500">@${esc(u.username || '')}</div></div></div>
        <div class="flex flex-wrap gap-1 mb-3">${roles.map(r => badge(ROLES[r]?.label || bn(r), 'blue')).join('')}${u.active ? badge('সক্রিয়', 'green') : badge('নিষ্ক্রিয়', 'slate')}</div>
        <div class="divide-y divide-slate-100">${row('মোবাইল', u.phone ? `<a class="text-brand-700" href="tel:${esc(u.phone)}">${esc(U.bn(u.phone))}</a>` : '—')}${row('ই-মেইল', esc(u.email || '—'))}${row('তৈরি করেছেন', esc(by ? pn(by) : 'সিস্টেম'))}${row('তৈরির তারিখ', u.createdAt ? U.fmtDate(u.createdAt.slice(0, 10)) : '—')}${last ? row('সর্বশেষ কার্যক্রম', `${U.fmtDate(last.slice(0, 10))}`) : ''}</div></div>
      <div class="lg:col-span-2 space-y-5">${K.length ? `<div class="card p-5"><div class="font-semibold mb-3">প্রোফাইল</div><div class="flex flex-wrap gap-2">${K.map(k => `<button class="btn btn-ghost" onclick="${k[3]}">${icon(k[2])} ${k[1]}</button>`).join('')}</div></div>` : ''}
        ${roles.includes('GUARDIAN') || kids.length ? `<div class="card p-5"><div class="font-semibold mb-3 flex flex-wrap items-center gap-2">${icon('users', 'w-4 h-4 text-brand-600')} সন্তান<span class="ml-auto flex flex-wrap gap-1">${GuardianCard.canInfo(uid) && GuardianCard.can() ? `<button class="btn btn-ghost btn-sm" onclick="App.ui.gdInfo=App.ui.gdInfo==='${uid}'?null:'${uid}';UserProfile.redraw()">${icon('pencil')} তথ্য সম্পাদনা</button>` : ''}${GuardianCard.can() ? `<button class="btn btn-ghost btn-sm" onclick="ChildLink.open('${uid}')">${icon('link')} সন্তান যুক্ত করুন</button>` : ''}${GuardianCard.can() && roles.includes('GUARDIAN') && uid !== App.session?.userId ? `<button class="btn btn-ghost btn-sm text-red-600" onclick="GuardianCard.remove('${uid}')">${icon('user-minus')} অপসারণ</button>` : ''}</span></div>
          ${App.ui.gdRm === uid && GuardianCard.can() ? GuardianCard.removePanel(uid) : ''}${App.ui.gdInfo === uid && GuardianCard.canInfo(uid) ? GuardianCard.infoForm(uid) : ''}${(u.address || u.occupation) ? `<div class="text-slate-600 mb-2">${u.occupation ? `পেশা: ${esc(u.occupation)}` : ''}${u.occupation && u.address ? ' · ' : ''}${u.address ? `ঠিকানা: ${esc(u.address)}` : ''}</div>` : ''}${this.kidsTable(uid)}</div>` : ''}</div></div>`;
  },
};

/** ব্যবহারকারী ব্যবস্থাপনা → "সন্তান যুক্ত করুন": link students to any account (it gets the GUARDIAN role). */
const ChildLink = {
  open(uid) {
    const u = DB.user(uid) || { id: uid, name: uid }; if (App.ui.lk) delete App.ui.lk.cl;
    App.openDetail({ title: `সন্তান যুক্ত করুন · ${pn(u)}`, render: () => `<div id="cl-host">${this.html(uid)}</div>` });
  },
  redraw(uid) { const h = $('#cl-host'); if (h) { h.innerHTML = this.html(uid); App.icons(); } },
  html(uid) {
    const u = DB.user(uid) || { id: uid, username: '' }, q = App.ui.lk?.cl?.q || '';
    const mine = DB.s.guardianLinks.filter(l => l.guardianUserId === uid), has = new Set(mine.map(l => l.studentId));
    const found = GuardianCard.hits('cl', q).filter(s => !has.has(s.id));
    return `<div class="card p-5 space-y-4 max-w-3xl"><div class="flex items-center gap-3">${avatar(u, 40)}<div><div class="font-semibold">${esc(pn(u))}</div><div class="text-slate-500">@${esc(u.username || '')} · ${esc(DB.roles(uid).map(bn).join(', '))}</div></div></div>
      <div><div class="font-semibold mb-2">যুক্ত সন্তান</div>${mine.map(l => { const s = DB.student(l.studentId); return s ? `<div class="py-1.5 flex items-center gap-2">${avatar(s, 28)}<span class="flex-1">${esc(pn(s))} · ${esc(classSec(s.classId, s.section))} · রোল ${bnNum(s.roll)}</span><span class="text-slate-500">${esc(GuardianCard.rel(l.relation))}</span></div>` : ''; }).join('') || '<p class="text-slate-500">কেউ যুক্ত নেই।</p>'}</div>
      <div class="flex flex-wrap items-end gap-2"><div class="flex-1 min-w-[12rem]">${GuardianCard.searchBox('cl-q', 'cl', 'students', 'শিক্ষার্থী খুঁজুন (আইডি, রোল, নিবন্ধন বা নাম)', `ChildLink.redraw('${uid}')`)}</div>
        <div><label class="label" for="cl-rel">সম্পর্ক</label><select id="cl-rel" class="select !w-auto">${GuardianCard.REL.map(([r, b]) => `<option value="${r}">${b}</option>`).join('')}</select></div></div>
      ${found.length ? `<div class="divide-y divide-slate-100">${found.map(s => `<div class="py-2 flex items-center gap-2">${avatar(s, 28)}<span class="flex-1 min-w-0 truncate">${esc(pn(s))} · ${esc(s.id)} · ${esc(classSec(s.classId, s.section))} · রোল ${bnNum(s.roll)}</span><button class="btn btn-ghost btn-sm" onclick="ChildLink.link('${uid}','${s.id}')">${icon('link')} যুক্ত করুন</button></div>`).join('')}</div>` : q ? '<p class="text-slate-500">কাউকে পাওয়া যায়নি।</p>' : ''}</div>`;
  },
  async link(uid, sid) {
    const u = DB.user(uid);
    try { void u; await DB.flush?.(); await DB.api('guardian/save', { studentId: sid, userId: uid, relation: $('#cl-rel')?.value || 'Guardian' }); await DB.reloadRemote?.(); toast('সন্তান যুক্ত হয়েছে।', 'success'); this.redraw(uid); }
    catch (e) { toast(GuardianCard.ERR[e.message] || 'যুক্ত করা যায়নি — আবার চেষ্টা করুন।', 'error'); }
  },
};

/* ==========================================================================
   SUBJECT PICK —শিক্ষার্থীর বিষয় নির্বাচন: one class, every student's বিভাগ and
   group choices in a grid, with bulk set for the ticked students.
   ========================================================================== */
const SubjectPick = {
  sel: new Set(),
  can() { return App.perm('students', 'edit') || App.has('ADMIN'); },
  cls() { const L = DB.classesIn(); return L.find(c => c.id === App.ui.spCls) || L.find(c => SubjectSets.groups(c).length || (c.streams || []).length) || L[0]; },
  list(c) { return DB.studentsIn(c.id).sort((a, b) => String(a.section || '').localeCompare(String(b.section || '')) || (+a.roll || 0) - (+b.roll || 0)); },
  setStream(id, v) { const st = DB.student(id); if (!st) return; st.stream = v || null; DB.audit('STUDENT_STREAM', 'students', `${id}: ${v || '—'}`); DB.save(); App.refresh(); },
  choose(id, gid, sid) { const st = DB.student(id); if (!st) return; st.electives = { ...(st.electives || {}) }; if (sid) st.electives[gid] = sid; else delete st.electives[gid]; DB.audit('STUDENT_ELECTIVE', 'students', `${id}: ${gid}=${sid || '—'}`); DB.save(); App.refresh(); },
  tick(id, on) { on ? this.sel.add(id) : this.sel.delete(id); App.refresh(); },
  tickAll(on) { const c = this.cls(); this.sel = new Set(on && c ? this.list(c).map(s => s.id) : []); App.refresh(); },
  bulk() {
    const c = this.cls(), ids = [...this.sel].filter(id => DB.student(id)?.classId === c?.id); if (!ids.length) return toast('কোনো শিক্ষার্থী বাছাই করা হয়নি।', 'warn');
    const what = $('#sp-b-what')?.value || '', val = $('#sp-b-val')?.value ?? ''; if (!what) return toast('কী বদলাবেন তা বেছে নিন।', 'warn');
    ids.forEach(id => { const st = DB.student(id); if (what === 'stream') st.stream = val || null; else { st.electives = { ...(st.electives || {}) }; if (val) st.electives[what] = val; else delete st.electives[what]; } });
    DB.audit('STUDENT_ELECTIVE_BULK', 'students', `${c.id} ${what}=${val || '—'} × ${ids.length}`); DB.save(); toast(`${bnNum(ids.length)} জন শিক্ষার্থীর জন্য সংরক্ষিত হয়েছে।`, 'success'); App.refresh();
  },
  bulkVals(what) {
    const c = this.cls(); if (!c) return '';
    const opts = what === 'stream' ? (c.streams || []).map(x => [x, x]) : (SubjectSets.groups(c).find(g => g.id === what)?.subjects || []).map(id => [id, DB.subject(id)?.name || id]);
    return `<option value="">— কোনোটি নয় —</option>${opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}`;
  },
  page() {
    const L = DB.classesIn(); if (!L.length) return pageHeader('শিক্ষার্থীর বিষয় নির্বাচন') + `<div class="card p-6">${emptyState('কোনো শ্রেণি নেই।')}</div>`;
    const c = this.cls(), can = this.can(), dis = can ? '' : 'disabled', streams = c.streams || [], G = SubjectSets.groups(c), S = this.list(c), sl = esc(c.streamLabel || 'বিভাগ');
    const all = S.length && S.every(s => this.sel.has(s.id));
    const row = st => {
      const mine = SubjectSets.ids(st), f = SubjectSets.fourth(st);
      return `<tr><td class="text-center">${can ? `<input type="checkbox" class="w-4 h-4" aria-label="${esc(pn(st))} বাছাই" ${this.sel.has(st.id) ? 'checked' : ''} onchange="SubjectPick.tick('${st.id}',this.checked)">` : ''}</td>
        <td><button class="font-semibold text-left hover:underline" onclick="Dossier.open('${st.id}')">${esc(pn(st))}</button><div class="text-slate-500">${st.section ? esc(st.section) + ' · ' : ''}রোল ${bnNum(st.roll || '—')}</div></td>
        ${streams.length ? `<td><select class="xg-edit" aria-label="${sl}" ${dis} onchange="SubjectPick.setStream('${st.id}',this.value)"><option value="">—</option>${streams.map(x => `<option ${x === st.stream ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></td>` : ''}
        ${G.map(g => { if (!SubjectSets.groupFor(g, st)) return '<td class="text-slate-400 text-center">—</td>'; const ch = SubjectSets.choice(g, st); return `<td><select class="xg-edit" aria-label="${esc(g.name)}" ${dis} onchange="SubjectPick.choose('${st.id}','${g.id}',this.value)"><option value="">— বেছে নেওয়া হয়নি —</option>${g.subjects.map(id => `<option value="${id}" ${ch === id ? 'selected' : ''}>${esc(DB.subject(id)?.name || id)}</option>`).join('')}</select></td>`; }).join('')}
        <td class="sp-subs">${mine.map(id => `<span class="sg-chip${id === f ? ' sp-4th' : ''}">${esc(DB.subject(id)?.name || id)}${id === f ? ' (৪র্থ)' : ''}</span>`).join('') || '—'}</td></tr>`;
    };
    const bulkOpts = [...(streams.length ? [['stream', c.streamLabel || 'বিভাগ']] : []), ...G.map(g => [g.id, g.name])];
    return `<style>${typeof XG_CSS !== 'undefined' ? XG_CSS : ''}.sp-subs{white-space:normal !important;min-width:22rem}.sg-chip{display:inline-flex;background:var(--xg-chip);border:1px solid var(--xg-bd);border-radius:999px;padding:.05rem .6rem;margin:.1rem .15rem .1rem 0;white-space:nowrap}.sp-4th{font-weight:600}</style>`
      + pageHeader('শিক্ষার্থীর বিষয় নির্বাচন')
      + `<div class="card p-4 mb-4 flex flex-wrap items-end gap-3"><div><label class="label" for="sp-cls">শ্রেণি</label><select id="sp-cls" class="select !w-auto" onchange="App.ui.spCls=this.value;SubjectPick.sel=new Set();App.refresh()">${L.map(x => `<option value="${x.id}" ${x.id === c.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
        ${can && bulkOpts.length ? `<div><label class="label" for="sp-b-what">একসাথে বদল (${bnNum([...this.sel].filter(id => DB.student(id)?.classId === c.id).length)} জন)</label><select id="sp-b-what" class="select !w-auto" onchange="$('#sp-b-val').innerHTML=SubjectPick.bulkVals(this.value)"><option value="">— বেছে নিন —</option>${bulkOpts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></div><div><label class="label" for="sp-b-val">মান</label><select id="sp-b-val" class="select !w-auto"><option value="">—</option></select></div><button class="btn btn-primary" onclick="SubjectPick.bulk()">${icon('check-check')} প্রয়োগ করুন</button>` : ''}</div>`
      + (!S.length ? `<div class="card p-6">${emptyState('এই শ্রেণিতে কোনো শিক্ষার্থী নেই।')}</div>`
        : `<div class="xg-wrap"><table class="xg w-full" style="min-width:${30 + (streams.length ? 10 : 0) + G.length * 12}rem"><thead><tr><th class="text-center">${can ? `<input type="checkbox" class="w-4 h-4" aria-label="সবাইকে বাছাই" ${all ? 'checked' : ''} onchange="SubjectPick.tickAll(this.checked)">` : ''}</th><th>শিক্ষার্থী</th>${streams.length ? `<th>${sl}</th>` : ''}${G.map(g => `<th>${esc(g.name)}${g.fourth ? ' (চতুর্থ)' : ''}</th>`).join('')}<th>পঠিত বিষয়সমূহ</th></tr></thead><tbody>${S.map(row).join('')}</tbody></table></div>`);
  },
};
(() => {
  const pg = { id: 'subject-pick', label: 'শিক্ষার্থীর বিষয় নির্বাচন', icon: 'list-checks', module: 'students', render() { return SubjectPick.page(); } };
  ['principal', 'admin'].forEach(p => { if (App.portals[p] && !App.portals[p].pages.some(x => x.id === pg.id)) App.addPage(p, { ...pg }); });
})();

/* ==========================================================================
   CURRICULUM — পাঠ্যক্রম (কারিকুলাম): the syllabus book and the syllabus monitor
   as tabs of one page, plus the public-website switch (config.publicSite.syllabus,
   the same switch as Settings → পাবলিক কনটেন্ট). Old ids redirect here.
   ========================================================================== */
const Curriculum = {
  orig: {},
  TABS: [['edit', 'পাঠ্যক্রম তৈরি', null], ['book', 'পাঠ্যসূচি বুকলেট', 'syllabus-book'], ['monitor', 'পাঠ্যসূচি পর্যবেক্ষণ', 'syllabus-monitor']],
  can() { return typeof Settings !== 'undefined' && Settings.canEdit ? Settings.canEdit() : App.has('ADMIN'); },
  pub() { return !!DB.s.config?.publicSite?.syllabus; },
  setPub(on) {
    const c = DB.s.config || (DB.s.config = {}), p = c.publicSite || (c.publicSite = {}); p.syllabus = !!on;
    DB.audit('PUBLIC_SYLLABUS', 'config', on ? 'পাঠ্যক্রম ওয়েবসাইটে প্রকাশিত' : 'পাঠ্যক্রম ওয়েবসাইট থেকে সরানো'); DB.save(); toast('সংরক্ষিত হয়েছে।', 'success'); App.refresh();
  },
  tab() { return this.TABS.find(t => t[0] === App.ui.curTab) || this.TABS[0]; },
  render(q) {
    const t = this.tab(), sub = this.orig[t[2]], can = this.can();
    const head = pageHeader('পাঠ্যক্রম (কারিকুলাম)')
      + `<div class="card p-4 mb-4 flex flex-wrap items-center gap-3"><div class="flex flex-wrap gap-2 mr-auto">${this.TABS.filter(x => !x[2] || this.orig[x[2]]).map(x => `<button class="pill ${x === t ? 'pill-on' : ''}" aria-pressed="${x === t}" onclick="App.ui.curTab='${x[0]}';App.refresh()">${esc(x[1])}</button>`).join('')}</div>
        <label class="inline-flex items-center gap-2"><input type="checkbox" class="w-4 h-4" ${this.pub() ? 'checked' : ''} ${can ? '' : 'disabled'} onchange="Curriculum.setPub(this.checked)">${icon('globe', 'w-4 h-4')} পাবলিক ওয়েবসাইটে দেখান</label>
        ${this.pub() ? `<a class="btn btn-ghost btn-sm" href="${App.href('public', 'syllabus')}" target="_blank" rel="noopener">${icon('external-link')} দেখুন</a>` : ''}</div>`;
    let body = '';
    try { body = t[0] === 'edit' ? CurEd.render() : sub ? StudentHub.demote(sub.render(q)) : emptyState('এই অংশটি পাওয়া যায়নি।'); } catch (e) { console.error(e); body = `<div class="card p-6">${emptyState('এই অংশটি দেখানো যায়নি — পাতাটি আবার লোড করুন।', 'triangle-alert')}</div>`; }
    return head + body;
  },
  mount(q) { const sub = this.tab()[2] && this.orig[this.tab()[2]]; try { sub?.mount?.(q); } catch (e) { console.error(e); } },
};
(() => {
  ['principal', 'admin'].forEach(portal => {
    const P = App.portals[portal]; if (!P) return;
    Curriculum.TABS.forEach(([k, , id]) => {
      const p = P.pages.find(x => x.id === id); if (!p) return;
      if (!Curriculum.orig[id]) Curriculum.orig[id] = { render: p.render.bind(p), mount: p.mount ? p.mount.bind(p) : null };
      Object.assign(p, { hidden: true, render(q) { App.ui.curTab = k; App.route.page = 'curriculum'; App.replaceUrl(App.href(App.route.portal, 'curriculum')); return Curriculum.render(q); }, mount: q => Curriculum.mount(q) });
    });
    if (!P.pages.some(x => x.id === 'curriculum')) App.addPage(portal, { id: 'curriculum', label: 'পাঠ্যক্রম (কারিকুলাম)', icon: 'book-open-text', module: 'academics', render: q => Curriculum.render(q), mount: q => Curriculum.mount(q) });
  });
  // teachers: the editor for their own subjects
  const T = App.portals.teacher;
  if (T && !T.pages.some(x => x.id === 'curriculum-edit')) App.addPage('teacher', { id: 'curriculum-edit', label: 'পাঠ্যক্রম তৈরি', icon: 'book-open-text', module: 'academics', render: () => pageHeader('পাঠ্যক্রম তৈরি') + CurEd.render() }, 'syllabus');
})();

/** Chapter → exam ids (chips); `examId` stays the first one for older readers. */
function chExams(c) { return Array.isArray(c?.examIds) && c.examIds.length ? c.examIds : (c?.examId ? [c.examId] : []); }

/* ==========================================================================
   CURRICULUM EDITOR — পাঠ্যক্রম তৈরি. Works on DB.s.syllabus (the same records the
   booklet, monitor, teacher tracker and exam syllabus read):
   { id, teacherId, classId, subjectId, session?, public?, chapters: [{ no, name, topics: [{ name, status, history }],
     outcomes, periods, month, examIds, examId, book }] }
   ========================================================================== */
const CurEd = {
  FIELDS: [['no', 'নং'], ['name', 'অধ্যায়ের নাম'], ['topics', 'বিষয়বস্তু / পাঠ (প্রতি লাইনে একটি)'], ['outcomes', 'শিখনফল'], ['periods', 'পিরিয়ড / সপ্তাহ'], ['month', 'মাস / সময়কাল'], ['exams', 'পরীক্ষা'], ['book', 'পাঠ্যবই / সহায়িকা']],
  ui() { return App.ui.ced || (App.ui.ced = {}); },
  isT() { return App.session?.role === 'TEACHER' || App.route.portal === 'teacher'; },
  classes() { if (this.isT()) { const ids = Teacher.myClasses(); return DB.classesIn().filter(c => ids.includes(c.id)); } return DB.classesIn(); },
  subjects(cid) { return this.isT() ? Teacher.mySubjects(cid).map(id => DB.subject(id)).filter(Boolean) : (SubjectSets.cls0(cid) || []); },
  can(cid, sid) { if (this.isT()) return Teacher.mySubjects(cid).includes(sid) && App.perm('academics', 'edit') !== false; return App.has('ADMIN') || App.has('PRINCIPAL') || App.perm('academics', 'edit'); },
  ses() { return this.ui().ses || DB.session(); },
  recs(cid, sid) { const s = this.ses(); return DB.s.syllabus.filter(x => x.classId === cid && x.subjectId === sid && (!x.session || x.session === s)); },
  rec() { const u = this.ui(), L = this.recs(u.cls, u.sub); return L.find(x => x.id === u.rec) || L[0] || null; },
  teacherFor(cid, sid) {
    if (this.isT()) return Teacher.me()?.id || null;
    const t = DB.s.teachers.find(x => (x.assignments || []).some(a => a.classId === cid && a.subjectId === sid)) || DB.s.teachers.find(x => (DB.s.routine || []).some(r => r.classId === cid && r.subjectId === sid && r.teacherId === x.id));
    return t?.id || null;
  },
  ensure() {
    const u = this.ui(); let sy = this.rec(); if (sy) return sy;
    sy = { id: DB.id('SYL'), teacherId: this.teacherFor(u.cls, u.sub), classId: u.cls, subjectId: u.sub, session: this.ses(), chapters: [] };
    DB.s.syllabus.push(sy); u.rec = sy.id; return sy;
  },
  save(msg, detail, refresh = true) { const sy = this.rec(); DB.audit('CURRICULUM', 'syllabus', `${sy?.classId} ${sy?.subjectId}: ${detail}`); DB.save(); if (msg) toast(msg, 'success'); if (refresh) App.refresh(); },
  newCh(o = {}) { return { no: '', name: '', topics: [], outcomes: '', periods: '', month: '', examIds: [], examId: null, book: '', ...o }; },
  topicsFrom(text, old = []) { return String(text || '').split(/\r?\n|;/).map(x => x.trim()).filter(Boolean).map(n => old.find(t => t.name === n) || { name: n, status: 'Not started', history: [] }); },
  add() { const sy = this.ensure(); sy.chapters.push(this.newCh({ no: String(sy.chapters.length + 1) })); this.save('', 'add'); },
  del(i) { const sy = this.rec(); if (!sy || !confirm('এই অধ্যায়টি মুছে ফেলবেন? এর অগ্রগতির তথ্যও মুছে যাবে।')) return; sy.chapters.splice(i, 1); this.save('', `del ${i}`); },
  move(i, d) { const sy = this.rec(), j = i + d; if (!sy || j < 0 || j >= sy.chapters.length) return; [sy.chapters[i], sy.chapters[j]] = [sy.chapters[j], sy.chapters[i]]; this.save('', `move ${i}→${j}`); },
  set(i, k, v) {
    const c = this.rec()?.chapters[i]; if (!c) return;
    if (k === 'topics') c.topics = this.topicsFrom(v, c.topics || []); else c[k] = String(v || '').trim();
    this.save('', `${i}.${k}`, false);
  },
  exam(i, eid) { const c = this.rec()?.chapters[i]; if (!c) return; const L = chExams(c); c.examIds = L.includes(eid) ? L.filter(x => x !== eid) : [...L, eid]; c.examId = c.examIds[0] || null; this.save('', `${i} exam ${eid}`); },
  setPublic(on) { const sy = this.ensure(); sy.public = !!on; this.save('সংরক্ষিত হয়েছে।', `public=${on}`); },
  copyFrom(srcId) {
    const src = DB.s.syllabus.find(x => x.id === srcId); if (!src) return;
    const sy = this.ensure(); if (sy.chapters.length && !confirm('বর্তমান অধ্যায়গুলোর জায়গায় কপি বসবে। চালিয়ে যাবেন?')) return;
    sy.chapters = src.chapters.map(c => this.newCh({ no: c.no || '', name: c.name, outcomes: c.outcomes || '', periods: c.periods || '', month: c.month || '', book: c.book || '', examIds: src.classId === sy.classId ? chExams(c) : [], topics: (c.topics || []).map(t => ({ name: t.name, status: 'Not started', history: [] })) }));
    sy.chapters.forEach(c => { c.examId = c.examIds[0] || null; });
    this.save(`${bnNum(sy.chapters.length)}টি অধ্যায় কপি হয়েছে।`, `copy ${srcId}`);
  },
  /** Rows (from CSV or an Excel paste): [no, name, topics, outcomes, periods, month, book] */
  addRows(rows) {
    const sy = this.ensure(); let n = 0;
    rows.forEach(r => { if (!r.name) return; sy.chapters.push(this.newCh({ no: r.no || String(sy.chapters.length + 1), name: r.name, topics: this.topicsFrom(r.topics), outcomes: r.outcomes || '', periods: r.periods || '', month: r.month || '', book: r.book || '' })); n++; });
    return n;
  },
  paste() {
    const t = $('#ced-paste')?.value || ''; if (!t.trim()) return toast('আগে এক্সেল থেকে সারিগুলো পেস্ট করুন।', 'warn');
    const grid = CSVKit.parse(t), K = ['no', 'name', 'topics', 'outcomes', 'periods', 'month', 'book'];
    const head = grid[0] && /অধ্যায়|name|chapter/i.test(grid[0].join(' ')) ? grid.slice(1) : grid;
    const n = this.addRows(head.map(r => Object.fromEntries(K.map((k, i) => [k, String(r[i] ?? '').trim()])))); this.ui().paste = false;
    this.save(`${bnNum(n)}টি অধ্যায় যুক্ত হয়েছে।`, `paste ${n}`);
  },
  exportCsv() {
    const sy = this.rec(); if (!sy) return;
    CSVKit.download(`curriculum-${sy.classId}-${sy.subjectId}.csv`, [['নং', 'অধ্যায়ের নাম', 'বিষয়বস্তু', 'শিখনফল', 'পিরিয়ড', 'মাস', 'পাঠ্যবই', 'পরীক্ষা'], ...sy.chapters.map(c => [c.no || '', c.name, (c.topics || []).map(t => t.name).join('; '), c.outcomes || '', c.periods || '', c.month || '', c.book || '', chExams(c).map(e => DB.exam(e)?.name || e).join('; ')])]);
  },
  render() {
    const u = this.ui(), cls = this.classes();
    if (!cls.length) return `<div class="card p-6">${emptyState('কোনো শ্রেণি নেই।')}</div>`;
    if (!cls.some(c => c.id === u.cls)) u.cls = cls[0].id;
    const subs = this.subjects(u.cls); if (!subs.some(s => s.id === u.sub)) u.sub = subs[0]?.id;
    const recs = u.sub ? this.recs(u.cls, u.sub) : [], sy = this.rec(), can = u.sub && this.can(u.cls, u.sub), dis = can ? '' : 'disabled';
    const exams = DB.s.exams.filter(e => e.session === this.ses() && (!e.classes?.length || e.classes.includes(u.cls)));
    const sel = (id, label, opts, js) => `<div><label class="label" for="${id}">${label}</label><select id="${id}" class="select !w-auto" onchange="${js}">${opts}</select></div>`;
    const pickers = `<div class="card p-4 mb-4 flex flex-wrap items-end gap-3">
      ${sel('ced-ses', 'শিক্ষাবর্ষ', sessionOptions(this.ses()), "App.ui.ced.ses=this.value;App.ui.ced.rec=null;App.refresh()")}
      ${sel('ced-cls', 'শ্রেণি', cls.map(c => `<option value="${c.id}" ${c.id === u.cls ? 'selected' : ''}>${esc(c.name)}</option>`).join(''), "App.ui.ced.cls=this.value;App.ui.ced.rec=null;App.refresh()")}
      ${subs.length ? sel('ced-sub', 'বিষয়', subs.map(s => `<option value="${s.id}" ${s.id === u.sub ? 'selected' : ''}>${esc(s.name)}</option>`).join(''), "App.ui.ced.sub=this.value;App.ui.ced.rec=null;App.refresh()") : ''}
      ${recs.length > 1 ? sel('ced-rec', 'শিক্ষক', recs.map(r => `<option value="${r.id}" ${r === sy ? 'selected' : ''}>${esc(DB.teacherName(r.teacherId))}</option>`).join(''), "App.ui.ced.rec=this.value;App.refresh()") : ''}
      ${u.sub ? `<label class="inline-flex items-center gap-2 pb-2"><input type="checkbox" class="w-4 h-4" ${sy?.public !== false ? 'checked' : ''} ${dis} onchange="CurEd.setPublic(this.checked)">${icon('globe', 'w-4 h-4')} পাবলিক</label>` : ''}</div>`;
    if (!u.sub) return pickers + `<div class="card p-6">${emptyState('এই শ্রেণির কোনো বিষয় নেই।')}</div>`;
    const sources = DB.s.syllabus.filter(x => x !== sy && (x.chapters || []).length && DB.cls(x.classId));
    const tools = can ? `<div class="flex flex-wrap items-center gap-2 mb-3">
      <button class="btn btn-primary btn-sm" onclick="CurEd.add()">${icon('plus')} অধ্যায় যোগ</button>
      <select class="select !w-auto !py-1" aria-label="অন্য শ্রেণি / বিষয় / শিক্ষাবর্ষ থেকে কপি" onchange="if(this.value)CurEd.copyFrom(this.value)"><option value="">${'কপি করুন…'}</option>${sources.map(x => `<option value="${x.id}">${esc(DB.className(x.classId))} · ${esc(DB.subject(x.subjectId)?.name || x.subjectId)}${x.session ? ' · ' + esc(U.bn(DB.s.sessions.find(s => s.id === x.session)?.name || x.session)) : ''} (${bnNum(x.chapters.length)})</option>`).join('')}</select>
      <button class="btn btn-ghost btn-sm" onclick="App.ui.ced.paste=!App.ui.ced.paste;App.ui.ced.csv=false;App.refresh()">${icon('clipboard-paste')} এক্সেল থেকে পেস্ট</button>
      <button class="btn btn-ghost btn-sm" onclick="App.ui.ced.csv=!App.ui.ced.csv;App.ui.ced.paste=false;App.refresh()">${icon('upload')} সিএসভি আমদানি</button>
      ${sy?.chapters.length ? `<button class="btn btn-ghost btn-sm" onclick="CurEd.exportCsv()">${icon('download')} সিএসভি রপ্তানি</button>` : ''}</div>
      ${u.paste ? `<div class="card p-3 mb-3"><label class="label" for="ced-paste">নং · অধ্যায় · বিষয়বস্তু · শিখনফল · পিরিয়ড · মাস · পাঠ্যবই</label><textarea id="ced-paste" class="input" rows="5"></textarea><button class="btn btn-primary btn-sm mt-2" onclick="CurEd.paste()">${icon('check')} যুক্ত করুন</button></div>` : ''}
      ${u.csv ? `<div class="card p-3 mb-3">${CSVKit.panel('curriculum', { cls: u.cls, sub: u.sub })}</div>` : ''}` : '';
    const ta = (i, k, v, rows = 2) => `<textarea class="xg-edit ced-ta" rows="${rows}" aria-label="${k}" ${dis} onchange="CurEd.set(${i},'${k}',this.value)">${esc(v || '')}</textarea>`;
    const inp = (i, k, v, w) => `<input class="xg-edit" style="min-width:${w}rem" aria-label="${k}" value="${esc(v || '')}" ${dis} onchange="CurEd.set(${i},'${k}',this.value)">`;
    const rows = (sy?.chapters || []).map((c, i) => `<tr>
      <td class="text-center whitespace-nowrap">${can ? `<button class="cg-b" aria-label="ওপরে" onclick="CurEd.move(${i},-1)" ${i ? '' : 'disabled'}>${icon('arrow-up', 'w-4 h-4')}</button><button class="cg-b" aria-label="নিচে" onclick="CurEd.move(${i},1)" ${i < sy.chapters.length - 1 ? '' : 'disabled'}>${icon('arrow-down', 'w-4 h-4')}</button>` : ''}</td>
      <td>${inp(i, 'no', c.no, 3)}</td><td>${inp(i, 'name', c.name, 12)}</td>
      <td>${ta(i, 'topics', (c.topics || []).map(t => t.name).join('\n'), Math.max(2, Math.min(6, (c.topics || []).length)))}</td>
      <td>${ta(i, 'outcomes', c.outcomes)}</td><td>${inp(i, 'periods', c.periods, 5)}</td><td>${inp(i, 'month', c.month, 8)}</td>
      <td class="ced-ex">${exams.map(e => { const on = chExams(c).includes(e.id); return `<button type="button" class="pill ${on ? 'pill-on' : ''}" aria-pressed="${on}" ${dis} onclick="CurEd.exam(${i},'${e.id}')">${esc(e.name)}</button>`; }).join('') || '—'}</td>
      <td>${inp(i, 'book', c.book, 10)}</td>
      <td class="text-center">${can ? `<button class="btn btn-ghost btn-sm text-red-600" aria-label="মুছুন" onclick="CurEd.del(${i})">${icon('trash-2')}</button>` : ''}</td></tr>`).join('');
    const css = `<style>${typeof XG_CSS !== 'undefined' ? XG_CSS : ''}.ced tbody tr:nth-child(even) td{background:var(--xg-zebra,rgba(148,163,184,.08))}.ced-ta{min-width:14rem;resize:vertical;white-space:pre-wrap}.ced-ex{min-width:14rem;white-space:normal !important}.ced-ex .pill{margin:.1rem}.cg-b{padding:.15rem .3rem;border:1px solid var(--xg-bd,#cbd5e1);border-radius:.35rem;margin:0 .1rem}.cg-b:disabled{opacity:.35}</style>`;
    return css + pickers + tools + (rows ? `<div class="xg-wrap"><table class="xg ced w-full" style="min-width:86rem"><thead><tr><th>ক্রম</th>${this.FIELDS.map(f => `<th>${f[1]}</th>`).join('')}<th>মুছুন</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="card p-6">${emptyState('এই বিষয়ে কোনো অধ্যায় নেই।', 'book-open')}</div>`);
  },
};
CSVKit.register('curriculum', {
  label: 'পাঠ্যক্রম', icon: 'book-open-text',
  can: ctx => CurEd.can(ctx.cls, ctx.sub),
  fields: [
    { k: 'no', label: 'নং', en: 'no', example: '১' },
    { k: 'name', label: 'অধ্যায়ের নাম', en: 'chapter', required: true, aliases: ['অধ্যায়', 'name'], example: 'বাস্তব সংখ্যা' },
    { k: 'topics', label: 'বিষয়বস্তু', en: 'topics', aliases: ['পাঠ', 'lessons'], example: 'সংজ্ঞা; উদাহরণ; অনুশীলনী' },
    { k: 'outcomes', label: 'শিখনফল', en: 'outcomes' },
    { k: 'periods', label: 'পিরিয়ড', en: 'periods', aliases: ['সপ্তাহ', 'weeks'] },
    { k: 'month', label: 'মাস', en: 'month', aliases: ['সময়কাল'] },
    { k: 'book', label: 'পাঠ্যবই', en: 'book', aliases: ['সহায়িকা', 'reference'] },
  ],
  commit(rows, ctx) { App.ui.ced = { ...(App.ui.ced || {}), cls: ctx.cls, sub: ctx.sub }; const n = CurEd.addRows(rows.map(r => r.val)); CurEd.save('', `csv ${n}`, false); setTimeout(() => App.refresh(), 600); return `${bnNum(n)}টি অধ্যায় যুক্ত হয়েছে।`; },
});

/* ==========================================================================
   STUDENT HUB — শিক্ষার্থী ব্যবস্থাপনা
   ========================================================================== */
const StudentHub = {
  /** The original page objects (dossier list, promotion) — their ids now redirect to this hub. */
  orig: {},
  sub(portal, id) { return this.orig[id] || App.portals.principal.pages.find(p => p.id === id) || null; },
  canAdm(a = 'view') { return App.perm('admissions', a) || App.has('ADMIN'); },
  canStu(a = 'view') { return App.perm('students', a) || App.has('ADMIN'); },
  canAtt() { return App.perm('attendance', 'view') || App.has('ADMIN'); },
  /** A sub-page's own big heading becomes a section heading inside the hub. */
  demote(h) { return String(h || '').replace(/<h1 class="text-xl sm:text-2xl/g, '<h2 class="text-lg sm:text-xl').replace(/<\/h1>/g, '</h2>'); },
  locked(title) { return pageHeader(title, '') + `<div class="card p-6">${emptyState('এই অংশ দেখার অনুমতি আপনার নেই।', 'lock')}</div>`; },
  safe(fn) { try { return fn(); } catch (e) { console.error(e); return `<div class="card p-6">${emptyState('এই অংশটি দেখানো যায়নি — পাতাটি আবার লোড করুন।', 'triangle-alert')}</div>`; } },
  pending() { return DB.s.admissions.filter(a => a.status === 'Pending' && (a.campusId || DB.campusOf(a.classId)) === DB.campusId()).length; },
  /** Open another page of this area (same portal), e.g. for old ?tab= links. */
  goLater(page) { const portal = App.route.portal; setTimeout(() => App.go(portal, page), 0); return ''; },

  /* ---------- page: শিক্ষার্থীর তালিকা (students) ---------- */
  render(q = {}) {
    if (!this.canStu()) return this.locked('শিক্ষার্থীর তালিকা');
    const mv = { apps: ['admission', 'apps'], direct: ['admission', 'direct'], test: ['admission-test'], promo: ['promotion'] }[q.tab];
    if (mv) { if (mv[1]) App.ui.admHubTab = mv[1]; return this.goLater(mv[0]); }
    if (q.tab === 'io') { App.ui.stuIO = 'import'; hubDropQuery(App.route.portal, 'students'); }
    const pg = this.sub('principal', 'dossier'), n = DB.activeStudents().length, io = App.ui.stuIO === 'import' && this.canStu('edit');
    const acts = `${this.canAdm('edit') ? `<button class="btn btn-primary" onclick="App.ui.admHubTab='direct';App.go(App.route.portal,'admission')">${icon('user-plus')} নতুন ভর্তি</button>` : ''}
      ${this.canStu('edit') ? `<button class="btn btn-ghost" aria-pressed="${io}" onclick="App.ui.stuIO=App.ui.stuIO==='import'?'':'import';App.refresh()">${icon('file-up')} সিএসভি আমদানি</button>` : ''}
      <button class="btn btn-ghost" onclick="StudentHub.exportStudents(StudentHub.filtered(),'students-list')">${icon('download')} সিএসভি রপ্তানি</button>
      <button class="btn btn-ghost" onclick="StudentHub.printCards()">${icon('id-card')} আইডি কার্ড মুদ্রণ</button>`;
    const panel = io ? `<div class="card mb-5"><div class="px-5 py-3 border-b border-slate-100 flex items-center gap-2"><div class="font-semibold mr-auto flex items-center gap-2">${icon('file-up', 'w-5 h-5 text-brand-600')} সিএসভি আমদানি</div><button class="btn btn-ghost btn-sm" aria-label="বন্ধ করুন" onclick="App.ui.stuIO='';App.refresh()">${icon('x')}</button></div><div class="p-4">${this.safe(() => CSVKit.panel('students'))}</div></div>` : '';
    return pageHeader('শিক্ষার্থীর তালিকা', `${esc(DB.campus()?.name || '')} · ${bnNum(n)} জন সক্রিয় শিক্ষার্থী`, acts)
      + panel + `<div class="fade-in">${pg ? this.safe(() => this.demote(pg.render())) : ''}</div>`;
  },
  mount(q) { try { if (this.canStu()) this.sub('principal', 'dossier')?.mount?.(q); } catch (e) { console.error(e); } },

  /* ---------- page: নতুন ভর্তি (admission) ---------- */
  admTabs() {
    return [['direct', 'সরাসরি ভর্তি', 'user-plus', this.canAdm('edit')], ['apps', 'আবেদনসমূহ', 'inbox', this.canAdm()], ['rules', 'যোগ্যতা, আসন ও পরীক্ষার নিয়ম', 'scale', this.canAdm()]]
      .filter(t => t[3]).map(t => t.slice(0, 3));
  },
  admRender(q = {}) {
    const T = this.admTabs(); if (!T.length || typeof admissionsPage === 'undefined') return this.locked('নতুন ভর্তি');
    if (q.tab) { if (T.some(t => t[0] === q.tab)) App.ui.admHubTab = q.tab; hubDropQuery(App.route.portal, 'admission'); }
    const t = T.some(x => x[0] === App.ui.admHubTab) ? App.ui.admHubTab : T[0][0]; App.ui.admHubTab = t;
    const pend = this.pending();
    return pageHeader('নতুন ভর্তি', `শিক্ষাবর্ষ ${esc(bnNum(Pub.admSession()))} · ${esc(DB.campus()?.name || '')}${pend ? ` · ${bnNum(pend)}টি আবেদন অপেক্ষমাণ` : ''}`, `<a class="btn btn-ghost" href="${App.href('public', 'admissions')}" target="_blank" rel="noopener">${icon('external-link')} পাবলিক ভর্তি ফরম</a>`)
      + tabs('admHubTab', T, t) + `<div class="fade-in">${this.safe(() => this[t]())}</div>`;
  },
  /* ---------- page: ভর্তি পরীক্ষা (admission-test) ---------- */
  testRender() {
    if (!this.canAdm() || typeof admissionsPage === 'undefined') return this.locked('ভর্তি পরীক্ষা');
    return pageHeader('ভর্তি পরীক্ষা', `শিক্ষাবর্ষ ${esc(bnNum(Pub.admSession()))} · ${esc(DB.campus()?.name || '')}`) + `<div class="fade-in">${this.safe(() => admissionsPage.merit(this.canAdm('edit')))}</div>`;
  },
  testMount() { try { if (typeof admissionsPage !== 'undefined') admissionsPage.mount(); } catch (e) { console.error(e); } },
  /* ---------- page: পরিসংখ্যান ও বিশ্লেষণ (student-analytics) ---------- */
  anaTabs() { return [['risk', 'ঝুঁকি শনাক্তকরণ ব্যবস্থা', 'radar', this.canStu() && !!this.sub('principal', 'risk')], ['att', 'উপস্থিতি বিশ্লেষণ', 'bar-chart-3', this.canAtt() && !!this.sub('principal', 'attendance-analytics')]].filter(t => t[3]).map(t => t.slice(0, 3)); },
  anaRender(q = {}) {
    const T = this.anaTabs(); if (!T.length) return this.locked('পরিসংখ্যান ও বিশ্লেষণ');
    if (q.tab) { if (T.some(t => t[0] === q.tab)) App.ui.anaTab = q.tab; hubDropQuery(App.route.portal, 'student-analytics'); }
    const t = T.some(x => x[0] === App.ui.anaTab) ? App.ui.anaTab : T[0][0]; App.ui.anaTab = t;
    const pg = this.sub('principal', t === 'risk' ? 'risk' : 'attendance-analytics');
    return pageHeader('পরিসংখ্যান ও বিশ্লেষণ', esc(DB.campus()?.name || '')) + tabs('anaTab', T, t) + `<div class="fade-in">${this.safe(() => this.demote(pg.render()))}</div>`;
  },
  anaMount(q) { try { const pg = this.sub('principal', App.ui.anaTab === 'att' ? 'attendance-analytics' : 'risk'); pg?.mount?.(q); } catch (e) { console.error(e); } },
  /* --- tab: list --- */
  filtered() {
    const ui = App.ui.dos || {}, q = String(ui.q || '').toLowerCase();
    return DB.activeStudents().filter(s => (!ui.cls || s.classId === ui.cls) && (!ui.section || s.section === ui.section) && (!ui.group || s.stream === ui.group) && (!ui.shift || s.shift === ui.shift) && (!ui.gender || s.gender === ui.gender)
      && (!q || s.name.toLowerCase().includes(q) || (s.nameBn || '').includes(ui.q) || String(s.roll) === q || s.id.toLowerCase() === q || String(s.regNo || '').toLowerCase().includes(q)));
  },
  printCards() {
    const list = this.filtered(); if (!list.length) return toast('তালিকায় কোনো শিক্ষার্থী নেই।', 'warn');
    if (list.length > 300 && !confirm(`${U.bn(list.length)} জনের আইডি কার্ড তৈরি হবে — চালিয়ে যাবেন? (শ্রেণি বেছে নিলে তালিকা ছোট হয়)`)) return;
    Print.show('idCards', list.map(s => s.id), 'h');
  },
  /* --- admission tab: applications --- */
  apps() {
    if (App.ui.admF === 'Draft') App.ui.admF = 'Pending';
    // office / drafts buttons live in the সরাসরি ভর্তি tab
    return admissionsPage.apps(this.canAdm('edit')).replace(/<div class="flex flex-wrap items-center gap-2 mb-3">[\s\S]*?<\/div>/, '');
  },
  /* --- admission tab: eligibility, seats and test rules, with the application form builder --- */
  rules() {
    const sub = App.ui.admRuleTab === 'form' ? 'form' : 'rules'; App.ui.admRuleTab = sub;
    return pills([['rules', 'যোগ্যতা, আসন ও পরীক্ষা', 'scale'], ['form', 'আবেদন ফরম নির্মাতা', 'layout-list']], sub, id => `App.ui.admRuleTab='${id}';App.refresh()`) + admissionsPage[sub](this.canAdm('edit'));
  },
  /* --- tab: direct admission (office) + drafts --- */
  direct() {
    const drafts = DB.s.admissions.filter(a => a.status === 'Draft' && (a.campusId || DB.campusOf(a.classId)) === DB.campusId());
    return `<div class="grid lg:grid-cols-3 gap-5"><div class="card p-5 space-y-3"><div class="font-semibold flex items-center gap-2">${icon('user-plus', 'w-5 h-5 text-brand-600')} অফিস থেকে সরাসরি ভর্তি</div><button class="btn btn-primary w-full" onclick="Admissions.office()">${icon('user-plus')} নতুন ভর্তি ফরম</button>${this.canStu('edit') ? `<button class="btn btn-ghost w-full" onclick="App.ui.stuIO='import';App.go(App.route.portal,'students')">${icon('file-up')} অনেক শিক্ষার্থী একসঙ্গে (সিএসভি)</button>` : ''}</div>
      <div class="card lg:col-span-2"><div class="px-5 py-3 border-b border-slate-100 font-semibold">খসড়াসমূহ (${bnNum(drafts.length)})</div><div class="divide-y divide-slate-100">${drafts.map(a => `<button class="w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-slate-50" onclick="Admissions.edit('${a.id}')">${icon('file-pen-line', 'w-5 h-5 text-slate-400')}<span class="flex-1 min-w-0"><b>${esc(a.studentNameBn || a.studentName || '(নামহীন খসড়া)')}</b><span class="block text-slate-500">${esc(a.id)} · ${esc(DB.className(a.classId))} · শুরু ${U.fmtTime(a.submittedAt)}</span></span>${badge('খসড়া', 'slate')}</button>`).join('') || emptyState('কোনো খসড়া নেই।', 'file-pen-line')}</div></div></div>`;
  },
  /* --- exports (column chooser) --- */
  studentCols() {
    const g = s => DB.guardiansOf(s.id)[0] || {}, shift = s => bn((DB.s.school.shifts || []).find(h => h.id === s.shift)?.name || s.shift || '');
    return [
      { k: 'id', label: 'শিক্ষার্থী আইডি', en: 'studentId', get: s => s.id }, { k: 'name', label: 'নাম (ইংরেজি)', en: 'name' }, { k: 'nameBn', label: 'নাম (বাংলা)', en: 'nameBn' },
      { k: 'class', label: 'শ্রেণি', en: 'class', get: s => DB.cls(s.classId)?.name || '' }, { k: 'classId', label: 'শ্রেণি আইডি', en: 'classId', on: false }, { k: 'section', label: 'শাখা', en: 'section' }, { k: 'shift', label: 'শিফট', en: 'shift', get: shift },
      { k: 'stream', label: 'বিভাগ', en: 'stream' }, { k: 'roll', label: 'রোল', en: 'roll' }, { k: 'regNo', label: 'রেজিস্ট্রেশন নম্বর', en: 'regNo' }, { k: 'dob', label: 'জন্মতারিখ', en: 'dob' },
      { k: 'gender', label: 'লিঙ্গ', en: 'gender', get: s => bn(s.gender) }, { k: 'blood', label: 'রক্তের গ্রুপ', en: 'blood' }, { k: 'religion', label: 'ধর্ম', en: 'religion', on: false, get: s => bn(s.religion || '') },
      { k: 'birthRegNo', label: 'জন্মনিবন্ধন নম্বর', en: 'birthRegNo', on: false }, { k: 'fatherName', label: 'পিতার নাম', en: 'fatherName' }, { k: 'motherName', label: 'মাতার নাম', en: 'motherName' },
      { k: 'guardianName', label: 'অভিভাবকের নাম', en: 'guardianName', get: s => pn(g(s)) || s.guardianName || '' }, { k: 'guardianPhone', label: 'অভিভাবকের মোবাইল', en: 'guardianPhone', get: s => g(s).phone || s.guardianPhone || s.emergency || '' },
      { k: 'address', label: 'ঠিকানা', en: 'address', on: false }, { k: 'admissionDate', label: 'ভর্তির তারিখ', en: 'admissionDate', on: false }, { k: 'campus', label: 'ক্যাম্পাস', en: 'campus', on: false, get: s => DB.campus(DB.campusOf(s.classId))?.name || '' },
      { k: 'status', label: 'অবস্থা', en: 'status', on: false, get: s => bn(s.status) },
    ];
  },
  exportStudents(rows, base = 'students') { CSVKit.exportDialog({ title: 'শিক্ষার্থী রপ্তানি', filename: `${base}-${U.today()}.csv`, rows, cols: this.studentCols() }); },
  exportTeachers(rows) {
    CSVKit.exportDialog({ title: 'শিক্ষক রপ্তানি', filename: `teachers-${U.today()}.csv`, rows, cols: [
      { k: 'id', label: 'কর্মচারী আইডি', en: 'id' }, { k: 'name', label: 'নাম', en: 'name', get: t => DB.user(t.userId)?.name || '' }, { k: 'nameBn', label: 'নাম (বাংলা)', en: 'nameBn', get: t => DB.user(t.userId)?.nameBn || '' },
      { k: 'username', label: 'ইউজারনেম', en: 'username', get: t => DB.user(t.userId)?.username || '' }, { k: 'phone', label: 'মোবাইল', en: 'phone', get: t => DB.user(t.userId)?.phone || '' }, { k: 'email', label: 'ই-মেইল', en: 'email', get: t => DB.user(t.userId)?.email || '' },
      { k: 'campus', label: 'ক্যাম্পাস', en: 'campus', on: false, get: t => DB.campus(t.campusId)?.name || '' }, { k: 'dept', label: 'বিভাগ', en: 'dept', get: t => bn(t.dept) }, { k: 'designation', label: 'পদবি', en: 'designation', get: t => bn(t.designation) },
      { k: 'subjects', label: 'বিষয়', en: 'subjects', get: t => (t.subjects || []).map(x => DB.subject(x)?.name || x).join('; ') }, { k: 'salaryGrade', label: 'বেতন গ্রেড', en: 'salaryGrade', on: false }, { k: 'baseSalary', label: 'মূল বেতন', en: 'baseSalary', on: false },
      { k: 'status', label: 'চাকরির অবস্থা', en: 'status', get: t => bn(t.status || '') }, { k: 'joinDate', label: 'যোগদান', en: 'joinDate', on: false },
    ] });
  },
  exportInvoices(rows) {
    CSVKit.exportDialog({ title: 'ফি-র বিল রপ্তানি', filename: `invoices-${U.today()}.csv`, rows, cols: [
      { k: 'id', label: 'বিল নম্বর', en: 'id' }, { k: 'studentId', label: 'শিক্ষার্থী আইডি', en: 'studentId' }, { k: 'student', label: 'শিক্ষার্থী', en: 'studentName', get: i => pn(DB.student(i.studentId)) },
      { k: 'class', label: 'শ্রেণি', en: 'class', get: i => { const s = DB.student(i.studentId); return s ? classSec(s.classId, s.section) : ''; } }, { k: 'roll', label: 'রোল', en: 'roll', on: false, get: i => DB.student(i.studentId)?.roll ?? '' },
      { k: 'month', label: 'মাস', en: 'month' }, { k: 'item', label: 'বিবরণ', en: 'item' }, { k: 'kind', label: 'ধরন', en: 'kind', get: i => bn(i.kind || '') }, { k: 'amount', label: 'পরিমাণ (৳)', en: 'amount' },
      { k: 'status', label: 'অবস্থা', en: 'status', get: i => bn(i.status) }, { k: 'due', label: 'শেষ তারিখ', en: 'due' }, { k: 'paymentId', label: 'রসিদ নম্বর', en: 'paymentId', on: false },
    ] });
  },
};

/* শিক্ষার্থী ব্যবস্থাপনা pages in the Principal and Root User portals (sidebar group: wiring.js NAV_GROUPS);
   old pages (dossier, admissions, risk, attendance-analytics) become hidden redirects. */
const STU_GROUP = 'শিক্ষার্থী ব্যবস্থাপনা';
(() => {
  const H = StudentHub, pages = [
    { id: 'admission', label: 'নতুন ভর্তি', icon: 'user-plus', module: 'admissions', count: () => H.pending() || '', render: q => H.admRender(q), mount: () => { } },
    { id: 'admission-test', label: 'ভর্তি পরীক্ষা', icon: 'list-ordered', module: 'admissions', render: () => H.testRender(), mount: () => H.testMount() },
    { id: 'students', label: 'শিক্ষার্থীর তালিকা', icon: 'graduation-cap', module: 'students', render: q => H.render(q), mount: q => H.mount(q) },
    { id: 'student-analytics', label: 'পরিসংখ্যান ও বিশ্লেষণ', icon: 'chart-pie', when: () => H.anaTabs().length > 0, render: q => H.anaRender(q), mount: q => H.anaMount(q) },
  ];
  const mk = (portal, beside) => {
    const P = App.portals[portal]; if (!P) return;
    let after = P.pages.some(p => p.id === beside) ? beside : undefined;
    pages.forEach(pg => { if (P.pages.some(p => p.id === pg.id)) return; App.addPage(portal, { ...pg, group: STU_GROUP }, after); after = pg.id; });
    // links and bookmarks to the old pages open the new page (and tab)
    const redirect = (id, to, ui) => {
      const i = P.pages.findIndex(p => p.id === id); if (i < 0) return;
      if (!H.orig[id]) H.orig[id] = { ...P.pages[i] };   // keep the original render / mount for the new pages' tabs
      // a new object per portal: a page object may be shared by several portals (admissionsPage)
      const old = P.pages[i] = { ...P.pages[i], hidden: true, count: undefined };
      const target = () => App.portals[App.route.portal]?.pages.find(p => p.id === to);
      old.render = q => {
        if (ui) App.ui[ui[0]] = ui[1];
        const pt = App.route.portal; App.route.page = to;
        App.replaceUrl(App.href(pt, to));
        return target()?.render(q) || '';
      };
      old.mount = q => target()?.mount?.(q);
    };
    redirect('dossier', 'students'); redirect('admissions', 'admission', ['admHubTab', 'apps']);
    redirect('risk', 'student-analytics', ['anaTab', 'risk']); redirect('attendance-analytics', 'student-analytics', ['anaTab', 'att']);
  };
  mk('principal', 'dossier');
  mk('admin', 'admissions');
})();

/* ==========================================================================
   STAFF MARKS ENTRY — Root User and Principal, any class and subject
   (the teacher gradebook with every class of the campus; the server lets staff
   with exams:edit write marks — server/access.js rulesFor 'marks', staff branch)
   ========================================================================== */
const StaffMarks = {
  gb() { return App.portals.teacher?.pages.find(p => p.id === 'gradebook'); },
  allClasses() { return DB.classesIn().map(c => c.id); },
  withAll(fn) {
    const mc = Teacher.myClasses, ms = Teacher.mySubjects;
    Teacher.myClasses = () => this.allClasses();
    Teacher.mySubjects = classId => (classId ? DB.classSubjects(classId) : DB.campusSubjects()).map(s => s.id);
    try { return fn(); } finally { Teacher.myClasses = mc; Teacher.mySubjects = ms; }
  },
  can() { return App.perm('exams', 'edit') || App.has('ADMIN'); },
  page() {
    return {
      id: 'marks-entry', label: 'নম্বর প্রদান', icon: 'table-2', module: 'exams',
      render: q => {
        if (!DB.classesIn().length) return pageHeader('নম্বর প্রদান', '') + `<div class="card p-6">${emptyState('এই ক্যাম্পাসে এখনো কোনো শ্রেণি নেই।', 'table-2')}</div>`;
        if (!this.can()) return pageHeader('নম্বর প্রদান', '') + `<div class="card p-6">${emptyState('নম্বর দেওয়ার অনুমতি (পরীক্ষা: সম্পাদনা) আপনার নেই।', 'lock')}</div>`;
        const g = this.gb(); if (!g) return '';
        const h = this.withAll(() => g.render(q));
        return h;
      },
      mount: q => { const g = this.gb(); if (g?.mount) this.withAll(() => g.mount(q)); },
    };
  },
  /** Buttons under the gradebook (teacher and staff). */
  tools() {
    const ui = App.ui.gb || {}; if (!ui.exam || !ui.cls || !ui.subj) return '';
    return `<div class="card p-4 mt-4 flex flex-wrap items-center gap-2"><span class="font-semibold mr-auto">${icon('file-spreadsheet', 'w-4 h-4 inline -mt-0.5')} সিএসভি</span><button class="btn btn-ghost btn-sm" onclick="CSVKit.template('marks','bn',{examId:App.ui.gb.exam,classId:App.ui.gb.cls,subjectId:App.ui.gb.subj})">${icon('download')} এই শ্রেণির নমুনা ফাইল</button><button class="btn btn-ghost btn-sm" onclick="StaffMarks.exportMarks()">${icon('file-down')} নম্বর রপ্তানি</button><button class="btn btn-primary btn-sm" onclick="CSVKit.open('marks',{examId:App.ui.gb.exam,classId:App.ui.gb.cls,subjectId:App.ui.gb.subj})">${icon('file-up')} সিএসভি থেকে নম্বর আমদানি</button></div>`;
  },
  roster(ctx) { return DB.studentsIn(ctx.classId).filter(st => SubjectSets.takes(st.id, ctx.subjectId)); },
  exportMarks() {
    const ui = App.ui.gb, ex = DB.exam(ui.exam), cfg = Grade.cfg(ex, ui.subj), campus = DB.campusOf(ui.cls);
    const m = st => DB.s.marks.find(x => x.examId === ui.exam && x.studentId === st.id && x.subjectId === ui.subj);
    const cols = [{ k: 'id', label: 'শিক্ষার্থী আইডি', en: 'studentId', get: s => s.id }, { k: 'roll', label: 'রোল', en: 'roll' }, { k: 'section', label: 'শাখা', en: 'section' }, { k: 'name', label: 'নাম', en: 'name', get: s => pn(s) },
      { k: 'cq', label: cfg.mcqMax ? 'সৃজনশীল' : 'লিখিত', en: 'cq', get: s => m(s)?.cq ?? '' }, ...(cfg.mcqMax ? [{ k: 'mcq', label: 'বহুনির্বাচনি', en: 'mcq', get: s => m(s)?.mcq ?? '' }] : []), ...(cfg.prMax ? [{ k: 'pr', label: 'ব্যবহারিক', en: 'pr', get: s => m(s)?.pr ?? '' }] : []),
      { k: 'total', label: 'মোট', en: 'total', get: s => { const x = m(s); return x ? (+x.cq || 0) + (+x.mcq || 0) + (+x.pr || 0) : ''; } }, { k: 'grade', label: 'গ্রেড', en: 'grade', get: s => { const x = m(s); return x ? Grade.of(x.cq, x.mcq, ex, campus, x.pr, ui.subj).letter : ''; } }];
    CSVKit.exportDialog({ title: `নম্বর রপ্তানি — ${DB.subject(ui.subj)?.name || ''}`, filename: `marks-${ui.exam}-${ui.cls}-${ui.subj}.csv`, rows: this.roster({ classId: ui.cls, subjectId: ui.subj }), cols });
  },
};
(() => {
  const g = StaffMarks.gb();
  if (g) {
    const r0 = g.render;
    g.render = function (q) { const h = r0.call(this, q); return h.includes('id="gb-table"') ? h + StaffMarks.tools() : h; };
  }
  [['principal', 'exams'], ['admin', 'exams']].forEach(([portal, after]) => {
    const P = App.portals[portal]; if (!P || P.pages.some(p => p.id === 'marks-entry')) return;
    const nb = P.pages.find(p => p.id === after), pg = StaffMarks.page();
    Object.defineProperty(pg, 'group', { enumerable: true, configurable: true, get() { return P.pages.find(p => p.id === after)?.group; }, set(v) { Object.defineProperty(this, 'group', { value: v, writable: true, enumerable: true, configurable: true }); } });
    App.addPage(portal, pg, nb ? after : undefined);
  });
})();

/* ==========================================================================
   CSV SPECS — students, teachers, support staff, marks
   ========================================================================== */
(() => {
  const BN_GENDER = { 'ছেলে': 'Male', 'পুরুষ': 'Male', 'বালক': 'Male', 'মেয়ে': 'Female', 'মহিলা': 'Female', 'বালিকা': 'Female', 'নারী': 'Female' };
  const BN_REL = { 'পিতা': 'Father', 'বাবা': 'Father', 'মাতা': 'Mother', 'মা': 'Mother', 'অভিভাবক': 'Legal guardian', 'আইনগত অভিভাবক': 'Legal guardian' };
  const RELIGION = [['Islam', 'ইসলাম', 'muslim'], ['Hinduism', 'হিন্দু', 'hindu', 'সনাতন'], ['Buddhism', 'বৌদ্ধ', 'buddhist'], ['Christianity', 'খ্রিস্টান', 'christian'], ['Other', 'অন্যান্য']];
  CSVKit.register('students', {
    label: 'শিক্ষার্থী', icon: 'graduation-cap',
    can: () => App.perm('students', 'edit') || App.has('ADMIN'),
    notes: 'শ্রেণি = শ্রেণির নাম (যেমন “ষষ্ঠ শ্রেণি”), আইডি (যেমন C6) বা শুধু সংখ্যা (৬)। রোল ফাঁকা থাকলে পরের খালি রোল দেওয়া হয়। শাখা ও শিফট ফাঁকা থাকলে শ্রেণির প্রথম শাখা / শ্রেণির শিফট (শ্রেণিতে শাখা বা শিফট না থাকলে ফাঁকাই থাকে)। অভিভাবকের মোবাইল আগের কোনো অভিভাবকের সঙ্গে মিললে তাঁর সঙ্গে যুক্ত হয় (ভাইবোন)।',
    fields: [
      { k: 'name', label: 'শিক্ষার্থীর নাম (ইংরেজি)', en: 'name', required: true, selfCheck: true, aliases: ['studentname', 'fullname', 'নাম', 'শিক্ষার্থীর নাম'], example: 'Nusaiba Karim' },
      { k: 'nameBn', label: 'শিক্ষার্থীর নাম (বাংলা)', en: 'nameBn', aliases: ['বাংলা নাম', 'namebangla'], example: 'নুসাইবা করিম' },
      { k: 'class', label: 'শ্রেণি', en: 'class', required: true, selfCheck: true, aliases: ['classid', 'classname'], example: '6' },
      { k: 'section', label: 'শাখা', en: 'section', example: '' },
      { k: 'shift', label: 'শিফট', en: 'shift', example: '' },
      { k: 'stream', label: 'বিভাগ', en: 'stream', aliases: ['group', 'গ্রুপ'], example: '' },
      { k: 'campus', label: 'ক্যাম্পাস', en: 'campus', aliases: ['campusid', 'branch'], example: '' },
      { k: 'roll', label: 'রোল', en: 'roll', selfCheck: true, aliases: ['rollno'], example: '' },
      { k: 'regNo', label: 'রেজিস্ট্রেশন নম্বর', en: 'regNo', aliases: ['registration', 'registrationno', 'নিবন্ধন নম্বর'], example: '' },
      { k: 'dob', label: 'জন্মতারিখ', en: 'dob', required: true, selfCheck: true, aliases: ['dateofbirth', 'birthdate'], example: '2014-04-12' },
      { k: 'gender', label: 'লিঙ্গ', en: 'gender', required: true, selfCheck: true, aliases: ['sex'], example: 'মেয়ে' },
      { k: 'blood', label: 'রক্তের গ্রুপ', en: 'blood', selfCheck: true, aliases: ['bloodgroup'], example: 'B+' },
      { k: 'religion', label: 'ধর্ম', en: 'religion', type: 'enum', options: RELIGION, example: 'ইসলাম' },
      { k: 'birthRegNo', label: 'জন্মনিবন্ধন নম্বর', en: 'birthRegNo', aliases: ['brn', 'birthregistration'], example: '' },
      { k: 'guardianName', label: 'অভিভাবকের নাম', en: 'guardianName', selfCheck: true, aliases: ['guardian'], example: 'Rezaul Karim' },
      { k: 'guardianPhone', label: 'অভিভাবকের মোবাইল', en: 'guardianPhone', required: true, selfCheck: true, aliases: ['guardianmobile', 'mobile', 'phone', 'মোবাইল', 'ফোন'], example: '01712345678' },
      { k: 'guardianRelation', label: 'অভিভাবকের সম্পর্ক', en: 'guardianRelation', selfCheck: true, aliases: ['relation', 'সম্পর্ক'], example: 'পিতা' },
      { k: 'fatherName', label: 'পিতার নাম', en: 'fatherName', selfCheck: true, aliases: ['father'], example: 'Rezaul Karim' },
      { k: 'fatherNameBn', label: 'পিতার নাম (বাংলা)', en: 'fatherNameBn', example: '' },
      { k: 'motherName', label: 'মাতার নাম', en: 'motherName', selfCheck: true, aliases: ['mother'], example: 'Salma Begum' },
      { k: 'motherNameBn', label: 'মাতার নাম (বাংলা)', en: 'motherNameBn', example: '' },
      { k: 'address', label: 'ঠিকানা', en: 'address', example: '' },
      { k: 'previousSchool', label: 'পূর্ববর্তী প্রতিষ্ঠান', en: 'previousSchool', example: '' },
      { k: 'admissionDate', label: 'ভর্তির তারিখ', en: 'admissionDate', type: 'date', example: '' },
    ],
    validate(rows) {
      rows.forEach(r => {
        const x = r.raw;
        if (x.gender && BN_GENDER[x.gender.trim()]) x.gender = BN_GENDER[x.gender.trim()];
        if (x.guardianRelation) x.guardianRelation = BN_REL[x.guardianRelation.trim()] || ({ father: 'Father', mother: 'Mother' }[x.guardianRelation.trim().toLowerCase()] || x.guardianRelation);
        if (x.class && /^[০-৯0-9]+$/.test(x.class)) x.class = U.asciiDigits(x.class);
      });
      DataIO.check_students(rows);
      const regs = new Set(DB.s.students.map(s => String(s.regNo || '').toUpperCase()));
      rows.forEach(r => {
        const x = r.raw, v = r.val, c = v.classId && DB.cls(v.classId); if (!c) return;
        const secs = c.sections || [];
        if (x.section) { const s = secs.find(y => y.toLowerCase() === x.section.toLowerCase()); if (s) v.section = s; else r.errors.push(`শাখা “${x.section}” ${c.name}-এ নেই${secs.length ? ` (${secs.join(', ')})` : ''}`); }
        else v.section = secs[0] || '';
        if (x.shift) { const n = CSVKit.norm(x.shift), sh = (DB.s.school.shifts || []).find(h => [h.id, h.name, bn(h.name)].some(y => CSVKit.norm(y) === n)); if (sh) v.shift = sh.id; else r.errors.push(`শিফট “${x.shift}” পাওয়া যায়নি`); }
        else v.shift = c.shift || '';
        if (x.stream) { const s = (c.streams || []).find(y => y === x.stream.trim()); if (s) v.stream = s; else r.errors.push(`বিভাগ “${x.stream}” ${c.name}-এ নেই`); }
        if (x.regNo) { const k = x.regNo.toUpperCase(); if (regs.has(k)) r.errors.push(`রেজিস্ট্রেশন নম্বর ${x.regNo} আগে থেকেই আছে`); else { regs.add(k); v.regNo = x.regNo; } }
        if (x.birthRegNo) { const b = x.birthRegNo.replace(/\D/g, ''); if (b.length !== 17) r.warnings.push('জন্মনিবন্ধন নম্বর ১৭ অঙ্কের নয়'); v.birthRegNo = b; }
        ['nameBn', 'fatherNameBn', 'motherNameBn', 'address', 'previousSchool'].forEach(k => { if (x[k]) v[k] = x[k]; });
      });
    },
    commit(ok, ctx, meta) { const s = DataIO.commitRows('students', ok, meta.fileName, meta.skipped); return s ? `${bnNum(s.imported)} জন শিক্ষার্থী যুক্ত হয়েছে${Accounts.on('student') ? '' : ' (শিক্ষার্থী অ্যাকাউন্ট বন্ধ — লগইন তৈরি হয়নি)'}।` : ''; },
  });
  const fromKind = (kind, labels) => (DataIO.KINDS[kind]?.cols || []).map(k => ({ k, en: k, label: labels[k] || k, required: (DataIO.KINDS[kind].required || []).includes(k), selfCheck: true, example: (DataIO.KINDS[kind].sample?.[0] || [])[(DataIO.KINDS[kind].cols || []).indexOf(k)] ?? '' }));
  CSVKit.register('teachers', {
    label: 'শিক্ষক', icon: 'presentation', can: () => App.perm('hr', 'edit') || App.has('ADMIN'),
    notes: 'বিষয় = বিষয়ের কোড বা নাম, ; দিয়ে আলাদা (যেমন MATH;ICT)। বেতন গ্রেড অথবা মূল বেতন দিন। ইউজারনেম না দিলে নিজে থেকে তৈরি হয়; প্রত্যেকের ৬ অঙ্কের এককালীন পাসওয়ার্ড তৈরি হয়, প্রথম লগইনে বদলাতে হয়।',
    fields: fromKind('teachers', { name: 'নাম', username: 'ইউজারনেম', phone: 'মোবাইল', email: 'ই-মেইল', campus: 'ক্যাম্পাস', dept: 'বিভাগ', designation: 'পদবি', subjects: 'বিষয়', salaryGrade: 'বেতন গ্রেড', baseSalary: 'মূল বেতন' }),
    validate(rows) { DataIO.check_teachers(rows); },
    commit(ok, ctx, meta) { const s = DataIO.commitRows('teachers', ok, meta.fileName, meta.skipped); return s ? `${bnNum(s.imported)} জন শিক্ষক যুক্ত হয়েছে।` : ''; },
  });
  CSVKit.register('staff', {
    label: 'সহায়ক কর্মী', icon: 'hard-hat', can: () => App.perm('hr', 'edit') || App.has('ADMIN'), notes: DataIO.KINDS.staff?.notes || '',
    fields: fromKind('staff', { name: 'নাম', type: 'ধরন', designation: 'পদবি', campus: 'ক্যাম্পাস', phone: 'মোবাইল', baseSalary: 'মূল বেতন', salaryGrade: 'বেতন গ্রেড', payoutMethod: 'বেতন প্রদানের মাধ্যম' }),
    validate(rows) { DataIO.check_staff(rows); },
    commit(ok, ctx, meta) { const s = DataIO.commitRows('staff', ok, meta.fileName, meta.skipped); return s ? `${bnNum(s.imported)} জন কর্মী যুক্ত হয়েছে।` : ''; },
  });
  /* Marks of one exam × class × subject. Students are matched by Student ID, registration no. or roll (+ section). */
  CSVKit.register('marks', {
    label: 'পরীক্ষার নম্বর', icon: 'table-2',
    can: ctx => {
      if (App.perm('exams', 'edit') && ['ADMIN', 'PRINCIPAL'].some(r => App.has(r)) && App.session?.role !== 'TEACHER') return true;
      return App.session?.role === 'TEACHER' && App.perm('exams', 'edit') && !!ctx.classId && Teacher.mySubjects(ctx.classId).includes(ctx.subjectId);
    },
    notes: 'শিক্ষার্থী আইডি থাকলে আইডি দিয়ে, না থাকলে শ্রেণি + রোল দিয়ে মেলানো হয় (শাখা লাগে না)। নম্বরের ঘরে “অনুপস্থিত” বা AB লিখলে অনুপস্থিত ধরা হয়; ফাঁকা সারি বাদ যায়। আগের নম্বর থাকলে নতুনটি দিয়ে বদলে যায়।',
    get fields() {
      const ctx = CSVKit._tplCtx || (CSVKit.cur?.id === 'marks' ? CSVKit.cur.ctx : {}), comps = Grade.comps(DB.s ? DB.exam(ctx.examId) : null, ctx.subjectId);
      const AL = { cq: ['written', 'লিখিত', 'সৃজনশীল', 'cqmarks'], mcq: ['বহুনির্বাচনী', 'objective'], pr: ['practical'] };
      return [
        { k: 'student', label: 'শিক্ষার্থী আইডি', en: 'studentId', aliases: ['id', 'regno', 'রেজিস্ট্রেশন নম্বর', 'আইডি'], example: '' },
        { k: 'roll', label: 'রোল', en: 'roll', type: 'int', min: 1, aliases: ['rollno'] },
        { k: 'name', label: 'নাম', en: 'name', aliases: ['শিক্ষার্থী', 'studentname'], help: 'শুধু মিলিয়ে দেখার জন্য' },
        { k: 'subject', label: 'বিষয়', en: 'subject', aliases: ['subjectid', 'subjectname', 'বিষয়ের নাম'], help: 'শুধু মিলিয়ে দেখার জন্য' },
        ...comps.map(c => ({ k: c.k, label: c.label, en: c.k, selfCheck: true, aliases: AL[c.k] || [] })),
      ];
    },
    context(ctx) {
      const isT = App.session?.role === 'TEACHER', classes = isT ? Teacher.myClasses() : DB.classesIn().map(c => c.id);
      if (!classes.includes(ctx.classId)) ctx.classId = classes[0];
      const subs = ctx.classId ? (isT ? Teacher.mySubjects(ctx.classId) : DB.classSubjects(ctx.classId).map(s => s.id)) : [];
      if (!subs.includes(ctx.subjectId)) ctx.subjectId = subs[0];
      const exams = [...DB.s.exams].sort((a, b) => String(b.start).localeCompare(String(a.start)));
      if (!exams.some(e => e.id === ctx.examId)) ctx.examId = exams[0]?.id;
      return `<div><label class="label" for="cmk-ex">পরীক্ষা</label><select id="cmk-ex" class="select" onchange="CSVKit.setCtx('examId',this.value)">${exams.map(e => `<option value="${e.id}" ${e.id === ctx.examId ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></div>
        <div><label class="label" for="cmk-cls">শ্রেণি</label><select id="cmk-cls" class="select" onchange="CSVKit.setCtx('classId',this.value)">${classes.map(c => `<option value="${c}" ${c === ctx.classId ? 'selected' : ''}>${esc(DB.className(c))}</option>`).join('')}</select></div>
        <div><label class="label" for="cmk-sub">বিষয়</label><select id="cmk-sub" class="select" onchange="CSVKit.setCtx('subjectId',this.value)">${subs.map(s => `<option value="${s}" ${s === ctx.subjectId ? 'selected' : ''}>${esc(DB.subject(s)?.name || s)}</option>`).join('')}</select></div>`;
    },
    ready(ctx) {
      if (!DB.s.exams.length) return 'এখনো কোনো পরীক্ষা তৈরি হয়নি।';
      if (!ctx.classId || !ctx.subjectId) return 'শ্রেণি ও বিষয় বেছে নিন।';
      if (!Grade.included(DB.exam(ctx.examId), ctx.subjectId)) return 'এই বিষয়টি নির্বাচিত পরীক্ষার অন্তর্ভুক্ত নয় (পরীক্ষা → সেটআপ)।';
      return '';
    },
    templateRows(ctx) { const sub = DB.subject(ctx.subjectId)?.name || ''; return StaffMarks.roster(ctx).map(st => ({ student: st.id, roll: st.roll, name: pn(st), subject: sub, ...Object.fromEntries(Grade.comps(DB.exam(ctx.examId), ctx.subjectId).map(c => [c.k, ''])) })); },
    validate(rows, ctx) {
      const list = StaffMarks.roster(ctx), all = DB.studentsIn(ctx.classId), seen = new Set(), cfg = Grade.cfg(DB.exam(ctx.examId), ctx.subjectId), sub = DB.subject(ctx.subjectId);
      const AB = /^(অনুপস্থিত|অনু|অ|ab|abs|absent|a)$/i;
      rows.forEach(r => {
        const x = r.raw, v = r.val; let st = null;
        // 1) Student ID (or registration no.) — unique, so no section is needed; 2) else class + roll
        if (x.student) {
          const k = U.asciiDigits(x.student).trim().toUpperCase(), any = DB.s.students.find(s => s.id.toUpperCase() === k || String(s.regNo || '').toUpperCase() === k);
          if (!any) return r.errors.push(`আইডি “${x.student}”-এর কোনো শিক্ষার্থী নেই`);
          if (any.classId !== ctx.classId) return r.errors.push(`${pn(any)} ${DB.className(any.classId)}-এর শিক্ষার্থী, ${DB.className(ctx.classId)}-এর নয়`);
          st = any;
          if (v.roll && +st.roll !== v.roll) r.warnings.push(`রোল মেলেনি — রেকর্ডে ${bnNum(st.roll)}`);
        } else if (v.roll) {
          const cand = all.filter(s => +s.roll === v.roll);
          if (cand.length > 1) return r.errors.push(`রোল ${bnNum(v.roll)} এই শ্রেণির একাধিক শিক্ষার্থীর — শিক্ষার্থী আইডি দিন`);
          st = cand[0]; if (!st) return r.errors.push(`রোল ${bnNum(v.roll)}-এর কোনো শিক্ষার্থী নেই`);
        } else return r.errors.push('শিক্ষার্থী আইডি বা রোল দিন');
        if (!list.includes(st)) return r.errors.push(`${pn(st)} এই বিষয় নেয়নি (বিভাগ / ঐচ্ছিক বিষয়)`);
        if (seen.has(st.id)) return r.errors.push(`${pn(st)}-এর নম্বর ফাইলে একাধিকবার আছে`); seen.add(st.id);
        v.studentId = st.id;
        if (x.name && !`${st.name} ${st.nameBn || ''}`.toLowerCase().includes(x.name.toLowerCase().split(/\s+/)[0])) r.warnings.push(`নাম মেলেনি — রেকর্ডে “${pn(st)}”`);
        if (x.subject && sub && ![sub.id, sub.name, sub.nameEn, sub.code].filter(Boolean).some(y => CSVKit.norm(y) === CSVKit.norm(x.subject))) r.errors.push(`বিষয় “${x.subject}” নির্বাচিত বিষয় ${sub.name} নয়`);
        const cl = Grade.comps(DB.exam(ctx.examId), ctx.subjectId), comps = cl.map(c => c.k), max = Object.fromEntries(cl.map(c => [c.k, c.max]));
        if (comps.some(k => AB.test(String(x[k] || '').trim()))) { v.absent = true; return; }
        v.vals = {};
        for (const k of comps) {
          const s = U.asciiDigits(String(x[k] ?? '')).trim(); if (s === '') continue;
          const n = Number(s); if (!Number.isFinite(n)) return r.errors.push(`“${x[k]}” সংখ্যা নয়`);
          if (n < 0 || n > max[k]) return r.errors.push(`${bnNum(n)} সীমার বাইরে (০–${bnNum(max[k])})`);
          v.vals[k] = n;
        }
        void cfg;
        if (!Object.keys(v.vals).length) r.errors.push('কোনো নম্বর নেই — অনুপস্থিত হলে “অনুপস্থিত” লিখুন');
        if (DB.s.marks.some(m => m.examId === ctx.examId && m.studentId === st.id && m.subjectId === ctx.subjectId)) r.warnings.push('আগের নম্বর বদলে যাবে');
      });
    },
    commit(ok, ctx) {
      let n = 0;
      ok.forEach(r => {
        const v = r.val;
        if (v.absent) { const m = DB.setMark(ctx.examId, v.studentId, ctx.subjectId, { cq: 0, mcq: 0, pr: 0 }); delete m.x; m.absent = true; }
        else DB.setMark(ctx.examId, v.studentId, ctx.subjectId, v.vals || {});
        n++;
      });
      DB.audit('MARKS_IMPORT', 'marks', `${ctx.examId} · ${DB.className(ctx.classId)} · ${ctx.subjectId}: সিএসভি থেকে ${n}টি সারি`); DB.save();
      return `${DB.exam(ctx.examId)?.name || ''} · ${DB.className(ctx.classId)} · ${DB.subject(ctx.subjectId)?.name || ''}: ${bnNum(n)} জনের নম্বর সংরক্ষিত হয়েছে।`;
    },
  });
  /* The Root User's "ইমপোর্ট / এক্সপোর্ট ও ব্যাকআপ" page uses the same kit. */
  DataIO.renderImport = function () {
    const K = [['students', 'শিক্ষার্থী', 'graduation-cap'], ['teachers', 'শিক্ষক', 'presentation'], ['staff', 'সহায়ক কর্মী', 'hard-hat']];
    const k = K.some(x => x[0] === App.ui.dataKind) ? App.ui.dataKind : 'students';
    return pills(K, k, id => `App.ui.dataKind='${id}';App.refresh()`) + CSVKit.panel(k);
  };
  const scoped = list => list.filter(x => DataIO.inScope(x));
  DataIO.exportStudents = () => StudentHub.exportStudents(DB.s.students.filter(s => DataIO.inScope(DB.campusOf(s.classId))), `students-${DataIO.scope().toLowerCase()}`);
  DataIO.exportTeachers = () => StudentHub.exportTeachers(DB.s.teachers.filter(t => DataIO.inScope(t.campusId)));
  DataIO.exportInvoices = () => StudentHub.exportInvoices(DB.s.invoices.filter(i => DataIO.inScope(DB.campusOf(DB.student(i.studentId)?.classId))));
  void scoped;
})();

/* ==========================================================================
   PUBLIC — application form print, lost-form recovery, ID-card verification
   ========================================================================== */
const AppForm = {
  rec(id) { return DB.s.admissions.find(a => a.id === id) || (this.found || []).find(a => a.id === id) || null; },
  html(a) {
    const F = (typeof Admissions !== 'undefined' ? Admissions.form().fields : []).filter(f => f.enabled && !['birthRegNo', 'fatherNid', 'motherNid'].includes(f.key));
    const c = DB.cls(a.classId), photo = a.photoUrl || (a.docs || []).find(d => d.kind === 'Student Photo' && d.dataUrl && d.fileType !== 'application/pdf')?.dataUrl;
    const val = f => { const v = a[f.key]; if (v === undefined || v === null || v === '') return '—'; if (f.type === 'date') return U.fmtDate(v); if (f.type === 'batch') return (c?.batches || []).find(b => b.id === v)?.name || v; if (f.type === 'shift') return bn((DB.s.school.shifts || []).find(s => s.id === v || s.name === v)?.name || v); return bn(v); };
    const brn = a.birthRegNoMasked || (a.birthRegNo ? String(a.birthRegNo).replace(/^(\d{4})\d+(\d{3})$/, (m, x, y) => x + '•'.repeat(10) + y) : '');
    const grp = g => F.filter(f => f.group === g).map(f => [f.label, String(val(f))]);
    // A4 portrait, 14 mm margins: rows are laid out by estimated height and continue on the next page, never clipped.
    const sections = [['শিক্ষার্থীর তথ্য', [...(brn ? [['জন্মনিবন্ধন নম্বর', brn]] : []), ...grp('student')]], ['অভিভাবকের তথ্য', grp('guardian')],
      ['ফি', [['ভর্তি / আবেদন ফি', U.money(a.fee || 0)], ['পরিশোধ', typeof Admissions !== 'undefined' ? Admissions.payText(a).replace(/<[^>]+>/g, '') : '']]]].filter(s => s[1].length);
    const td = 'border:.2mm solid #cbd5e1;padding:1mm 2mm;vertical-align:top';
    const tbl = rows => `<table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:9.5pt;line-height:1.45">${rows.map(([k, v]) => `<tr><td style="${td};width:38%;color:#475569">${esc(k)}</td><td style="${td};word-break:break-word"><b>${esc(v)}</b></td></tr>`).join('')}</table>`;
    const rowH = ([k, v]) => Math.max(Math.ceil(String(k).length / 26), Math.ceil(String(v).length / 44), 1) * 4.9 + 2.2;
    const decl = typeof Admissions !== 'undefined' ? Admissions.form().declaration || '' : '';
    const tailH = (decl ? Math.ceil(decl.length / 95) * 4.2 + 4 : 0) + 26, LIMIT = 297 - 28 - 8;
    const top = `${Print.header('ভর্তির আবেদন ফরম')}
      <div style="display:flex;gap:6mm;align-items:flex-start;font-size:10.5pt;line-height:1.7"><div style="flex:1;min-width:0"><b>আবেদন নম্বর:</b> <span style="font-family:monospace;font-size:13pt">${esc(a.id)}</span><br><b>আবেদনকৃত শ্রেণি:</b> ${esc(c?.name || '—')}${a.campusId && DB.s.campuses.length > 1 ? ` · ${esc(DB.campus(a.campusId)?.name || '')}` : ''}<br><b>জমাদান:</b> ${a.submittedAt ? U.fmtTime(a.submittedAt) : '—'}<br><b>অবস্থা:</b> ${esc(bn(a.status === 'Approved' ? 'Enrolled' : a.status))}${a.testRoll ? ` · <b>পরীক্ষার রোল:</b> ${esc(a.testRoll)}` : ''}</div>
        <div style="width:28mm;height:34mm;flex-shrink:0;border:.3mm solid #94a3b8;display:flex;align-items:center;justify-content:center;overflow:hidden">${photo ? `<img src="${photo}" alt="" style="width:100%;height:100%;object-fit:cover">` : '<span style="font-size:9pt;color:#94a3b8">ছবি</span>'}</div>
        <div style="text-align:center;flex-shrink:0">${qr(verifyUrl('application', a.id), 80)}<div style="font-size:8pt;color:#64748b">অবস্থা জানুন</div></div></div>`;
    const pages = [[top]]; let used = 70;
    const room = h => { if (used + h > LIMIT) { pages.push([`<div style="font-size:9pt;color:#475569;border-bottom:.3mm solid #cbd5e1;padding-bottom:1.5mm;margin-bottom:3mm">ভর্তির আবেদন ফরম · ${esc(a.id)} (চলমান)</div>`]); used = 10; } };
    sections.forEach(([title, rows]) => {
      let buf = [], cont = false;
      const flush = () => { if (buf.length) pages[pages.length - 1].push(`<div style="font-weight:700;margin:3.5mm 0 1mm">${title}${cont ? ' (চলমান)' : ''}</div>${tbl(buf)}`); buf = []; };
      room(8 + rowH(rows[0])); used += 8;
      rows.forEach(r => { const h = rowH(r); if (used + h > LIMIT) { flush(); cont = true; room(LIMIT); used += 8; } buf.push(r); used += h; });
      flush();
    });
    room(tailH);
    pages[pages.length - 1].push(`${decl ? `<p style="font-size:9pt;color:#475569;margin-top:4mm;line-height:1.5">${esc(decl)}</p>` : ''}
      <div style="margin-top:14mm;display:flex;justify-content:space-between;gap:8mm;font-size:9pt;text-align:center">${['অভিভাবকের স্বাক্ষর', 'গ্রহণকারী (অফিস)'].map(x => `<div style="width:60mm;border-top:.25mm solid #0f172a;padding-top:1mm">${x}</div>`).join('')}</div>`);
    return pages.map((p, i) => `<div class="sheet padded">${p.join('')}${pages.length > 1 ? `<div style="position:absolute;bottom:7mm;left:14mm;right:14mm;text-align:right;font-size:8pt;color:#64748b">পৃষ্ঠা ${bnNum(i + 1)}/${bnNum(pages.length)}</div>` : ''}</div>`);
  },
  print(id) { const a = this.rec(id); if (!a) return toast('আবেদনটি পাওয়া যায়নি।', 'error'); Print.preview('ভর্তির আবেদন ফরম', this.html(a), { re: ['AppForm.print', id] }); },
  /** লস্ট ফর্ম উদ্ধার: server look-up by mobile + date of birth, or by birth registration number. */
  async recover(form) {
    const d = formData(form), body = { kind: 'appRecover', phone: U.asciiDigits(d.phone || ''), dob: d.dob || '', brn: U.asciiDigits(d.brn || '').replace(/\D/g, '') };
    if (!body.brn && !(body.phone && body.dob)) return toast('মোবাইল নম্বর ও জন্মতারিখ দিন — অথবা ১৭ অঙ্কের জন্মনিবন্ধন নম্বর।', 'error');
    if (body.brn && body.brn.length !== 17) return toast('জন্মনিবন্ধন নম্বর ১৭ অঙ্কের হতে হবে।', 'error');
    const btn = form.querySelector('button'); if (btn) btn.disabled = true;
    try {
      const r = await DB.api('public/lookup', body);
      this.found = (r.hydrate?.admissions || []); this.searched = true;
      if (!this.found.length) toast('এই তথ্যে কোনো আবেদন পাওয়া যায়নি।', 'warn');
    } catch (e) { this.found = []; this.searched = true; toast(e.status === 429 ? 'অনেকবার চেষ্টা করা হয়েছে — কিছুক্ষণ পর আবার চেষ্টা করুন।' : 'সার্ভারের সঙ্গে যোগাযোগ করা যায়নি — আবার চেষ্টা করুন।', 'error'); }
    finally { if (btn) btn.disabled = false; }
    const host = $('#app-rec-out'); if (host) { host.innerHTML = this.results(); App.icons(); }
  },
  results() {
    if (!this.searched) return '';
    return (this.found || []).map(a => `<div class="card p-4 flex flex-wrap items-center gap-3"><div class="flex-1 min-w-0"><div class="font-semibold">${esc(a.studentNameBn || a.studentName || '')}</div><div class="text-slate-500"><span class="font-mono">${esc(a.id)}</span> · ${esc(DB.className(a.classId))} · ${a.submittedAt ? U.fmtDate(a.submittedAt) : ''} · ${esc(bn(a.status === 'Approved' ? 'Enrolled' : a.status))}</div></div><button class="btn btn-primary btn-sm" onclick="AppForm.print('${esc(a.id)}')">${icon('printer')} ফরম প্রিন্ট / ডাউনলোড</button><button class="btn btn-ghost btn-sm" onclick="App.go('public','verify',{type:'application',code:'${esc(a.id)}'})">${icon('search')} অবস্থা দেখুন</button></div>`).join('') || `<div class="card p-4 text-red-700">কোনো আবেদন পাওয়া যায়নি। তথ্য মিলিয়ে আবার চেষ্টা করুন, অথবা অফিসে যোগাযোগ করুন।</div>`;
  },
  recoverHtml() {
    return `<div class="card p-5 space-y-3" id="app-rec-card"><div class="font-semibold flex items-center gap-2">${icon('file-search', 'w-5 h-5 text-brand-600')} লস্ট ফর্ম উদ্ধার — ভর্তির আবেদন খুঁজে আবার প্রিন্ট করুন</div><p class="text-slate-600">আবেদন নম্বর হারিয়ে গেলে অভিভাবকের মোবাইল নম্বর ও শিক্ষার্থীর জন্মতারিখ দিন — অথবা জন্মনিবন্ধন নম্বর দিন।</p>
      <form id="app-rec" class="grid sm:grid-cols-3 gap-3 items-end" novalidate onsubmit="event.preventDefault();AppForm.recover(this)"><div><label class="label" for="ar-phone">অভিভাবকের মোবাইল</label><input id="ar-phone" class="input" name="phone" inputmode="tel" placeholder="01XXXXXXXXX" maxlength="14"></div><div><label class="label" for="ar-dob">জন্মতারিখ</label><input id="ar-dob" class="input" type="date" name="dob"></div><div><label class="label" for="ar-brn">অথবা জন্মনিবন্ধন নম্বর</label><input id="ar-brn" class="input font-mono" name="brn" inputmode="numeric" maxlength="17" placeholder="১৭ অঙ্ক"></div><div class="sm:col-span-3"><button class="btn btn-primary">${icon('search')} আবেদন খুঁজুন</button></div></form>
      <div id="app-rec-out" class="space-y-2">${this.results()}</div></div>`;
  },
};
(() => {
  /* after a public submission: print the full application form */
  if (typeof Pub !== 'undefined') {
    const s0 = Pub.submitAdmission;
    Pub.submitAdmission = function (...args) {
      const out = s0.apply(this, args), a = DB.s.admissions[DB.s.admissions.length - 1];
      try { const b = [...$$('#modal-root button')].find(x => /admissionReceipt/.test(x.getAttribute('onclick') || '')); if (a && b) { b.insertAdjacentHTML('beforebegin', `<button class="btn btn-ghost" onclick="AppForm.print(DB.s.admissions[DB.s.admissions.length-1].id)">${icon('printer')} আবেদন ফরম প্রিন্ট</button>`); App.icons(); } } catch (e) { console.error(e); }
      return out;
    };
  }
  if (typeof Admissions !== 'undefined') {
    const p0 = Admissions.publicStatus.bind(Admissions);
    Admissions.publicStatus = a => p0(a).replace('<div class="flex flex-wrap gap-2 mt-4">', `<div class="flex flex-wrap gap-2 mt-4"><button class="btn btn-ghost btn-sm" onclick="AppForm.print('${esc(a.id)}')">${icon('printer')} আবেদন ফরম</button>`);
  }
  /* verify page: student ID card by Student ID or registration number, manual entry, lost-form recovery */
  if (typeof Site !== 'undefined') { const d0 = Site.detect.bind(Site); Site.detect = code => /^\d{4}[A-Z]\d{5,}$/i.test(String(code).trim()) ? 'student' : d0(code); }
  const pv = App.portals.public.pages.find(p => p.id === 'verify'); if (!pv) return;
  const v0 = pv.render, m0 = pv.mount;
  pv.render = function (q = {}) {
    const code = String(q.code || App.ui.verCode || q.ref || App.ui.trackTerm || '').trim(), type = q.type || (code && typeof Site !== 'undefined' ? Site.detect(code) : null);
    if (type === 'student' && code && !DB.student(code.toUpperCase())) {
      const s = DB.s.students.find(x => String(x.regNo || '').toUpperCase() === code.toUpperCase());
      if (s) { q = { ...q, code: s.id, type: 'student' }; App.ui.verCode = s.id; }
    }
    let h = v0.call(this, q).replace('শনাক্তকৃত: <b>student</b>', 'শনাক্তকৃত: <b>শিক্ষার্থীর পরিচয়পত্র</b>').replace('শনাক্তকৃত: <b>employee</b>', 'শনাক্তকৃত: <b>কর্মচারীর পরিচয়পত্র</b>').replace('শনাক্তকৃত: <b>invoice</b>', 'শনাক্তকৃত: <b>ফি বিল</b>');
    const extra = `<form id="sid-ver" class="card p-5 space-y-3" onsubmit="event.preventDefault();const v=U.asciiDigits(this.code.value).trim();if(v){App.ui.verCode=v;App.go('public','verify',{type:'student',code:v})}"><div class="font-semibold flex items-center gap-2">${icon('id-card', 'w-5 h-5 text-brand-600')} শিক্ষার্থীর আইডি কার্ড যাচাই</div><p class="text-slate-600">কার্ডের কিউআর কোড স্ক্যান করলে নিজে থেকেই যাচাই হয়। হাতে যাচাই করতে কার্ডে ছাপা শিক্ষার্থী আইডি বা রেজিস্ট্রেশন নম্বর লিখুন।</p><div class="flex flex-col sm:flex-row gap-3"><label class="sr-only" for="sid-code">শিক্ষার্থী আইডি বা রেজিস্ট্রেশন নম্বর</label><input id="sid-code" class="input" name="code" placeholder="যেমন S0389 বা 2026M100013" required><button class="btn btn-primary">${icon('badge-check')} যাচাই করুন</button></div></form>` + AppForm.recoverHtml();
    const i = h.lastIndexOf('</section>');
    return i > 0 ? h.slice(0, i) + extra + h.slice(i) : h + extra;
  };
  pv.mount = function (q) { try { m0?.call(this, q); } catch (e) { console.error(e); } };
})();

/* ---------------- service desk: pay online only when it is possible, else at the office ---------------- */
if (typeof Services !== 'undefined') {
  const f0 = Services.form.bind(Services);
  Services.form = function (studentId, ctx) {
    let h = f0(studentId, ctx);
    const live = typeof PayGw !== 'undefined' && PayGw.live && PayGw.live(), merch = Object.values(DB.s.school.merchant || {}).some(v => String(v || '').trim());
    if (!live && !merch && h.includes('name="mode" value="Online"')) {
      h = h.replace(/<label class="flex items-center gap-2"><input type="radio" name="mode" value="Online" checked>[^<]*<\/label>/, '').replace('name="mode" value="Counter">', 'name="mode" value="Counter" checked>')
        .replace('<button class="btn btn-primary w-full">', `<p class="text-amber-800 bg-amber-50 rounded-lg px-3 py-2">${icon('info', 'w-4 h-4 inline -mt-0.5')} অনলাইন পেমেন্ট চালু নেই — আবেদন জমা দিয়ে ফি অফিসে পরিশোধ করুন।</p><button class="btn btn-primary w-full">`);
    }
    return h;
  };
}
/* default service fees are part of the settings out of the box (Features → service desk fees) */
DB.addSeeder('serviceFeesV1', s => { const c = s.config || (s.config = {}); c.serviceFees = { ...SERVICE_FEES, ...(c.serviceFees || {}) }; return true; });

/* ==========================================================================
   MADRASAH TYPES & CLASS PRESETS
   ========================================================================== */
const LEGACY_MADRASAH = 'মাদ্রাসা (দাখিল/আলিম)';
const MADRASAH_TYPES = ['ইবতেদায়ি মাদ্রাসা', 'দাখিল মাদ্রাসা', 'আলিম মাদ্রাসা', 'ফাজিল / কামিল মাদ্রাসা', 'কওমি মাদ্রাসা'];
(() => {
  const i = INSTITUTION_TYPES.indexOf(LEGACY_MADRASAH);
  if (i >= 0) INSTITUTION_TYPES.splice(i, 1);
  MADRASAH_TYPES.slice().reverse().forEach(t => { const j = INSTITUTION_TYPES.indexOf(t); if (j >= 0) INSTITUTION_TYPES.splice(j, 1); INSTITUTION_TYPES.splice(1, 0, t); });
  BN_LABELS[LEGACY_MADRASAH] = 'মাদ্রাসা (দাখিল/আলিম) — পুরোনো ধরন';
  // packs that offered the old type now also offer the new ones
  if (typeof ClassPresets !== 'undefined') ClassPresets.list.forEach(p => {
    if (p.types.includes(LEGACY_MADRASAH) || p.types.includes('আলিয়া মাদ্রাসা')) MADRASAH_TYPES.slice(0, 4).forEach(t => { if (!p.types.includes(t)) p.types.push(t); });
  });
  // a saved old value stays selectable (Settings → identity)
  const b0 = App.boot;
  App.boot = function (...a) { const out = b0.apply(this, a); try { instTypes().forEach(t => { if (!INSTITUTION_TYPES.includes(t)) INSTITUTION_TYPES.push(t); }); } catch (e) { } return out; };
})();
const CLASS_SETS = {
  'সাধারণ বিদ্যালয়': { level: 'মাধ্যমিক', classes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(g => ({ g, n: CLASS_BN[g], lv: g <= 5 ? 'প্রাথমিক' : g <= 8 ? 'নিম্ন মাধ্যমিক' : 'মাধ্যমিক', streams: g >= 9 ? ['বিজ্ঞান', 'মানবিক', 'ব্যবসায় শিক্ষা'] : null })) },
  'কিন্ডারগার্টেন': { classes: [{ g: 0, n: 'প্লে', lv: 'প্রাক-প্রাথমিক' }, { g: 0, n: 'নার্সারি', lv: 'প্রাক-প্রাথমিক' }, { g: 0, n: 'কেজি', lv: 'প্রাক-প্রাথমিক' }, ...[1, 2, 3, 4, 5].map(g => ({ g, n: CLASS_BN[g], lv: 'প্রাথমিক' }))] },
  'উচ্চ মাধ্যমিক কলেজ': { classes: [{ g: 11, n: 'একাদশ শ্রেণি', lv: 'উচ্চ মাধ্যমিক', streams: ['বিজ্ঞান', 'মানবিক', 'ব্যবসায় শিক্ষা'] }, { g: 12, n: 'দ্বাদশ শ্রেণি', lv: 'উচ্চ মাধ্যমিক', streams: ['বিজ্ঞান', 'মানবিক', 'ব্যবসায় শিক্ষা'] }] },
  'ইবতেদায়ি মাদ্রাসা': { classes: [{ g: 0, n: 'শিশু শ্রেণি', lv: 'ইবতেদায়ি' }, ...[1, 2, 3, 4, 5].map(g => ({ g, n: `ইবতেদায়ি ${CLASS_BN[g]}`, lv: 'ইবতেদায়ি' }))] },
  'দাখিল মাদ্রাসা': { classes: [...[1, 2, 3, 4, 5].map(g => ({ g, n: `ইবতেদায়ি ${CLASS_BN[g]}`, lv: 'ইবতেদায়ি' })), ...[6, 7, 8, 9, 10].map(g => ({ g, n: `দাখিল ${CLASS_BN[g]}`, lv: 'দাখিল', streams: g >= 9 ? ['বিজ্ঞান', 'সাধারণ', 'মুজাব্বিদ'] : null }))] },
  'আলিম মাদ্রাসা': { classes: [...[6, 7, 8, 9, 10].map(g => ({ g, n: `দাখিল ${CLASS_BN[g]}`, lv: 'দাখিল', streams: g >= 9 ? ['বিজ্ঞান', 'সাধারণ', 'মুজাব্বিদ'] : null })), { g: 11, n: 'আলিম ১ম বর্ষ', lv: 'আলিম', streams: ['বিজ্ঞান', 'সাধারণ', 'মুজাব্বিদ'] }, { g: 12, n: 'আলিম ২য় বর্ষ', lv: 'আলিম', streams: ['বিজ্ঞান', 'সাধারণ', 'মুজাব্বিদ'] }] },
  'ফাজিল / কামিল মাদ্রাসা': { classes: [{ g: 11, n: 'আলিম ১ম বর্ষ', lv: 'আলিম' }, { g: 12, n: 'আলিম ২য় বর্ষ', lv: 'আলিম' }, { g: 13, n: 'ফাজিল ১ম বর্ষ', lv: 'ফাজিল' }, { g: 14, n: 'ফাজিল ২য় বর্ষ', lv: 'ফাজিল' }, { g: 15, n: 'ফাজিল ৩য় বর্ষ', lv: 'ফাজিল' }, { g: 16, n: 'কামিল ১ম বর্ষ', lv: 'কামিল', streams: ['হাদিস', 'তাফসির', 'ফিকহ', 'আদব'] }, { g: 17, n: 'কামিল ২য় বর্ষ', lv: 'কামিল', streams: ['হাদিস', 'তাফসির', 'ফিকহ', 'আদব'] }] },
  'কওমি মাদ্রাসা': { classes: [{ g: 0, n: 'নূরানী', lv: 'নূরানী ও হিফজ' }, { g: 0, n: 'নাজেরা', lv: 'নূরানী ও হিফজ' }, { g: 0, n: 'হিফজুল কুরআন', lv: 'নূরানী ও হিফজ' }, { g: 1, n: 'ইবতেদাইয়্যাহ', lv: 'কিতাব বিভাগ' }, { g: 6, n: 'মুতাওয়াসসিতাহ', lv: 'কিতাব বিভাগ' }, { g: 9, n: 'সানাবিয়া আম্মাহ', lv: 'কিতাব বিভাগ' }, { g: 11, n: 'সানাবিয়া উলইয়া', lv: 'কিতাব বিভাগ' }, { g: 13, n: 'ফযিলত', lv: 'কিতাব বিভাগ' }, { g: 15, n: 'তাকমিল (দাওরায়ে হাদিস)', lv: 'কিতাব বিভাগ' }] },
};
CLASS_SETS['স্কুল ও কলেজ'] = { classes: [...CLASS_SETS['সাধারণ বিদ্যালয়'].classes, ...CLASS_SETS['উচ্চ মাধ্যমিক কলেজ'].classes] };
CLASS_SETS['আলিয়া মাদ্রাসা'] = { classes: [...CLASS_SETS['দাখিল মাদ্রাসা'].classes, ...CLASS_SETS['আলিম মাদ্রাসা'].classes.filter(c => c.g > 10)] };
CLASS_SETS[LEGACY_MADRASAH] = CLASS_SETS['আলিয়া মাদ্রাসা'];
CLASS_SETS['হাফেজিয়া মাদ্রাসা'] = { classes: CLASS_SETS['কওমি মাদ্রাসা'].classes.slice(0, 3) };
const ClassSets = {
  /** '__mine' = every selected institution type together (school and college, school and madrasah …), no class twice. */
  set(type = '__mine') {
    if (type !== '__mine') return CLASS_SETS[type] || null;
    const seen = new Set(), classes = instTypes().flatMap(t => (CLASS_SETS[t] || {}).classes || []).filter(c => !seen.has(c.n) && seen.add(c.n));
    return classes.length ? { classes } : null;
  },
  missing(type) { const s = this.set(type); if (!s) return []; const have = new Set(DB.classesIn().map(c => c.name)); return s.classes.filter(c => !have.has(c.n)); },
  card() {
    const can = typeof Settings !== 'undefined' && Settings.canEdit && Settings.canEdit(); if (!can) return '';
    const mineT = instTypes().filter(t => CLASS_SETS[t]), types = [...(mineT.length ? ['__mine'] : []), ...Object.keys(CLASS_SETS).filter(t => t !== LEGACY_MADRASAH)], cur = types.includes(App.ui.csType) ? App.ui.csType : types[0];
    const miss = this.missing(cur), lab = t => t === '__mine' ? `আমার প্রতিষ্ঠান (${mineT.map(bn).join(' + ')})` : t;
    return `<div class="card p-5 mb-5"><div class="font-semibold flex items-center gap-2 mb-3">${icon('wand-2', 'w-5 h-5 text-brand-600')} প্রতিষ্ঠানের ধরন অনুযায়ী প্রস্তুত শ্রেণি তালিকা</div>
      <div class="flex flex-wrap items-end gap-3"><div><label class="label" for="cs-type">ধরন</label><select id="cs-type" class="select" onchange="App.ui.csType=this.value;App.refresh()">${types.map(t => `<option value="${esc(t)}" ${t === cur ? 'selected' : ''}>${esc(lab(t))}</option>`).join('')}</select></div><button class="btn btn-primary" ${miss.length ? '' : 'disabled'} onclick="ClassSets.create('${esc(cur)}')">${icon('plus')} ${miss.length ? `${bnNum(miss.length)}টি শ্রেণি তৈরি করুন` : 'সব শ্রেণি আগে থেকেই আছে'}</button></div>
      <div class="flex flex-wrap gap-1.5 mt-3">${(this.set(cur)?.classes || []).map(c => badge(c.n, miss.includes(c) ? 'blue' : 'slate')).join('')}</div></div>`;
  },
  create(type) {
    const list = this.missing(type); if (!list.length) return;
    if (!confirm(`${DB.campus().name}-এ ${U.bn(list.length)}টি শ্রেণি তৈরি হবে। চালিয়ে যাবেন?`)) return;
    const levels = DB.s.levels || (DB.s.levels = []), campus = DB.campusId();
    list.forEach(x => {
      let lv = x.lv ? levels.find(l => l.name === x.lv) : null;
      if (x.lv && !lv) levels.push(lv = { id: DB.id('LV'), name: x.lv });
      let id = `C${x.g}${campus === 'MAIN' ? '' : '-' + campus}`; if (DB.cls(id)) id = DB.id('C');
      DB.s.classes.push({ id, campusId: campus, name: x.n, grade: x.g, level: lv?.id || null, sections: ['ক'], sectionTeachers: {}, shift: DB.s.school.shifts?.[0]?.id || '', capacity: DB.s.school.sectionCapacity || 40, classTeacherId: null, streams: x.streams ? [...x.streams] : [], streamLabel: x.streams ? 'বিভাগ' : null, batches: [], mentors: [] });
      if (!DB.s.feeConfigs.some(f => f.classId === id && f.session === DB.session())) DB.s.feeConfigs.push({ session: DB.session(), campusId: campus, classId: id, tuition: 0, admissionFee: 0, examFee: 0 });
    });
    DB.audit('CLASS_PRESET', 'classes', `${type}: ${list.length}টি শ্রেণি তৈরি`); DB.save();
    toast(`${bnNum(list.length)}টি শ্রেণি তৈরি হয়েছে — ফি কাঠামো ও বিষয় ঠিক করে নিন।`, 'success'); App.refresh();
  },
};
if (typeof Settings !== 'undefined' && Settings.structure) { const st0 = Settings.structure.bind(Settings); Settings.structure = function (...a) { return ClassSets.card() + st0(...a); }; }

/* ==========================================================================
   CRASH GUARDS — teacher pages for an account without a teacher record
   ========================================================================== */
(() => {
  const b0 = App.boot;
  App.boot = function (...a) {
    const P = App.portals.teacher;
    if (P && !P._guarded) {
      P._guarded = true;
      const free = new Set(['account', 'exams', 'calendar', 'notices', 'onboarding']);
      P.pages.forEach(p => {
        if (free.has(p.id) || typeof p.render !== 'function') return;
        const r0 = p.render, m0 = p.mount;
        p.render = function (...x) { if (App.session && !Teacher.me()) return pageHeader(p.label || 'শিক্ষক', '') + `<div class="card p-6">${emptyState('আপনার অ্যাকাউন্টের সঙ্গে কোনো শিক্ষকের তথ্য যুক্ত নেই। অধ্যক্ষ বা রুট ব্যবহারকারীকে “কর্মী ও ছুটি” থেকে শিক্ষক হিসেবে যুক্ত করতে বলুন।', 'user-x')}</div>`; return r0.apply(this, x); };
        if (m0) p.mount = function (...x) { if (App.session && !Teacher.me()) return; return m0.apply(this, x); };
      });
    }
    return b0.apply(this, a);
  };
})();
