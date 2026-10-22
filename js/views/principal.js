/* ==========================================================================
   B. PRINCIPAL / SUPERVISOR COMMAND DESK
   ========================================================================== */

/* ---------- Early academic & well-being risk engine ---------- */
const Risk = {
  compute() {
    const s = DB.s.school, ex = DB.latestExam(), prev = DB.previousExam();
    return DB.activeStudents().map(st => {
      const att = DB.attendanceStats(st.id), gpa = ex ? DB.result(st.id, ex.id).gpa : null, prevGpa = prev ? DB.result(st.id, prev.id).gpa : null;
      const flags = [];
      if (att.pct < s.minAttendance) flags.push({ k: 'attendance', label: `উপস্থিতি ${bnNum(att.pct.toFixed(0))}%`, tone: 'red' });
      if (gpa !== null && gpa < s.passGpa) flags.push({ k: 'gpa', label: `জিপিএ ${gpaFmt(gpa)} < ${bnNum(s.passGpa.toFixed(1))}`, tone: 'red' });
      if (gpa !== null && prevGpa !== null && prevGpa - gpa >= 1) flags.push({ k: 'drop', label: `জিপিএ হ্রাস ${bnNum((prevGpa - gpa).toFixed(2))}`, tone: 'amber' });
      if (att.L >= s.lateThreshold) flags.push({ k: 'late', label: `বিলম্ব ×${bnNum(att.L)}`, tone: 'amber' });
      return { st, att, gpa, prevGpa, flags, score: flags.length * 10 + (s.minAttendance - att.pct) / 5 };
    }).filter(x => x.flags.length).sort((a, b) => b.score - a.score);
  },
  summon(studentId, silent) {
    const st = DB.student(studentId), gs = DB.guardiansOf(studentId);
    gs.forEach(g => DB.sms(g.phone, `${DB.s.school.shortName}: সম্মানিত ${pn(g)}, ${pn(st)} (${DB.cls(st.classId).name}, রোল ${bnNum(st.roll)})-এর বিষয়ে ৩ কর্মদিবসের মধ্যে অধ্যক্ষের সঙ্গে সাক্ষাৎ করার জন্য আপনাকে অনুরোধ করা হচ্ছে।`));
    (DB.s.summons = DB.s.summons || []).push({ studentId, ts: new Date().toISOString(), by: App.session.userId });
    DB.audit('SUMMON_GUARDIAN', 'students', `${pn(st)}-এর অভিভাবককে তলব করা হয়েছে`); DB.save();
    if (!silent) toast(`${gs.map(g => g.phone).join(', ')} নম্বরে এসএমএস পাঠানো হয়েছে`, 'success');
  },
};

const Principal = {
  /* ----- Admissions ----- */
  /** Enrol an applicant. opts: {classId, section, roll, shift, concessionPct} chosen by staff (defaults: applied class, A, next roll). */
  approve(appId, opts = {}) {
    const a = DB.s.admissions.find(x => x.id === appId);
    if (opts.classId) a.classId = opts.classId;
    // a class may have no section and no shift: both are then stored as '' (never undefined)
    const section = opts.section || DB.cls(a.classId).sections?.[0] || '';
    const roll = +opts.roll || Math.max(0, ...DB.studentsIn(a.classId, section).map(s => s.roll)) + 1;
    const secTxt = `${DB.className(a.classId)}${section ? '-' + section : ''}`;
    if (DB.studentsIn(a.classId, section).some(s => s.roll === roll)) return toast(`${secTxt}-এ রোল ${bnNum(roll)} ইতোমধ্যে বরাদ্দ রয়েছে।`, 'error');
    const grade = DB.cls(a.classId).grade, y = new Date().getFullYear();
    // student / guardian sign-in can be switched off (ফিচার ও সেটিংস → লগইন ও পাসওয়ার্ড): then no account is created
    const acctOn = k => typeof Accounts === 'undefined' || Accounts.on(k);
    const temp = U.tempPw();
    const uname = `s${grade}${U.pad(roll)}${U.randStr(2, 'abcdefghjkmnpqrstuvwxyz23456789')}`;
    const su = acctOn('student') ? { id: DB.id('U'), name: a.studentName, username: uname, email: '', phone: a.guardianPhone, pwHash: U.pw(temp), active: true, createdAt: new Date().toISOString(), createdBy: App.session.userId, photo: null } : null;
    if (su) { DB.s.users.push(su); DB.s.userRoles.push({ userId: su.id, role: 'STUDENT' }); }
    const st = { id: DB.id('S'), userId: su ? su.id : null, name: a.studentName, classId: a.classId, section, roll, shift: opts.shift ?? DB.cls(a.classId).shift ?? '', guardianName: a.guardianName || '', guardianPhone: a.guardianPhone || '', guardianRelation: a.guardianRelation || 'Father', regNo: `${y}${DB.campusOf(a.classId) === 'MAIN' ? 'M' : 'N'}${U.pad(grade)}${U.pad(roll, 3)}${U.randStr(1, '0123456789')}`, dob: a.dob, gender: a.gender, blood: a.blood || '', medical: 'None', emergency: a.guardianPhone, admissionDate: U.today(), previousSchool: a.previousSchool, status: 'active', photo: null, fatherName: a.fatherName || '', motherName: a.motherName || '', birthRegNo: a.birthRegNo || '', fatherNid: a.fatherNid || '', motherNid: a.motherNid || '', address: a.address || '', scholarshipPct: +opts.concessionPct || 0, admissionRef: a.id, testScore: a.score ?? null, meritRank: a.meritRank ?? null };
    DB.s.students.push(st);
    // Move application documents into the student's document vault.
    (a.docs || []).forEach(d => DB.s.documents.push({ id: DB.id('DOC'), studentId: st.id, kind: d.kind, fileName: d.fileName, fileType: d.fileType || 'image/jpeg', dataUrl: d.dataUrl || null, uploadedAt: a.submittedAt, by: 'APPLICANT', verified: false }));
    const photo = (a.docs || []).find(d => d.kind === 'Student Photo' && d.dataUrl && d.fileType !== 'application/pdf');
    if (photo) { st.photo = photo.dataUrl; if (su) su.photo = photo.dataUrl; }
    // Reuse an existing guardian login (sibling linking) when the phone number matches.
    let g = DB.s.users.find(u => u.phone === a.guardianPhone && DB.roles(u.id).includes('GUARDIAN'));
    let gTemp = null;
    if (!g && acctOn('guardian') && a.guardianPhone) {
      gTemp = U.tempPw();
      const gname = `g${a.guardianPhone.slice(-6)}`;
      g = { id: DB.id('U'), name: a.guardianName, username: gname, email: a.guardianEmail || '', phone: a.guardianPhone, pwHash: U.pw(gTemp), active: true, createdAt: new Date().toISOString(), createdBy: App.session.userId, photo: null };
      DB.s.users.push(g); DB.s.userRoles.push({ userId: g.id, role: 'GUARDIAN' });
    }
    if (g) DB.s.guardianLinks.push({ guardianUserId: g.id, studentId: st.id, relation: a.guardianRelation || 'Father' });
    DB.s.attendance[st.id] = {};
    const mk = U.monthKey(new Date());
    DB.s.invoices.push({ id: DB.id('INV'), studentId: st.id, month: mk, item: `মাসিক বেতন — ${U.monthName(mk)}${opts.concessionPct ? ` (−${bnNum(opts.concessionPct)}% ছাড়)` : ''}`, amount: Math.round(DB.fees(a.classId).tuition * (1 - (+opts.concessionPct || 0) / 100)), status: 'unpaid', due: `${mk}-10`, kind: 'tuition' });
    if (a.netPaid > 0) DB.postJournal(`ভর্তি ${a.id} অনুমোদিত — জমাকৃত অর্থ আয় হিসেবে গৃহীত`, [{ acct: '2200', dr: a.netPaid, cr: 0 }, { acct: '4100', dr: 0, cr: a.netPaid }], a.id, App.session.userId, null, { campusId: DB.campusOf(a.classId) });
    Object.assign(a, { status: 'Approved', decidedAt: new Date().toISOString(), studentId: st.id, note: `বরাদ্দ: ${secTxt}, রোল ${bnNum(roll)}` });
    DB.sms(a.guardianPhone, `${DB.s.school.shortName}: অভিনন্দন! ${a.studentNameBn || a.studentName} ${secTxt}-এ ভর্তি হয়েছে, রোল ${bnNum(roll)}। শিক্ষার্থী আইডি ${st.id}।`);
    DB.audit('ADMISSION_APPROVE', 'admissions', `${a.id} → ${st.id} (${secTxt}, রোল ${bnNum(roll)})`); DB.save();
    Modal.open({
      title: 'আবেদনকারী ভর্তিকৃত', size: 'md',
      body: `<div class="space-y-3 text-sm"><div class="flex items-center gap-3">${avatar(st, 48)}<div><div class="font-bold">${esc(pn(st))}</div><div class="text-slate-500">${esc(secTxt)} · রোল ${bnNum(roll)} · ${st.id}</div></div></div>
        <div class="card p-3 bg-amber-50 border-amber-200"><div class="font-semibold text-amber-800 mb-1">এককালীন লগইন তথ্য — নিরাপদে হস্তান্তর করুন</div>
        ${su ? `<div>শিক্ষার্থীর লগইন: <code>${esc(uname)}</code> / <code>${esc(temp)}</code></div>` : '<div>শিক্ষার্থী অ্যাকাউন্ট বন্ধ — কোনো লগইন তৈরি হয়নি।</div>'}${gTemp ? `<div>অভিভাবকের লগইন: <code>${esc(g.username)}</code> / <code>${esc(gTemp)}</code></div>` : g ? `<div>বিদ্যমান অভিভাবক অ্যাকাউন্টের সঙ্গে যুক্ত <b>@${esc(g.username)}</b> (সহোদর)।</div>` : '<div>অভিভাবক অ্যাকাউন্ট বন্ধ — কোনো লগইন তৈরি হয়নি।</div>'}</div></div>`,
      footer: `<button class="btn btn-primary" onclick="Modal.close()">সম্পন্ন</button>`,
    });
    App.refresh();
  },
  decline(appId) {
    Modal.open({
      title: `${appId} প্রত্যাখ্যান করুন`, size: 'sm',
      body: `<form id="dec-form" class="space-y-3"><div><label class="label">কারণ (অভিভাবকের নিকট পাঠানো হবে)</label><textarea class="textarea" name="note" rows="3" required>আবেদনকৃত শ্রেণিতে আসন পূর্ণ হয়ে গেছে।</textarea></div><label class="flex items-center gap-2 text-sm"><input type="checkbox" name="refund" checked> আবেদনের পরিশোধিত অর্থ ফেরত দিন</label><button class="btn btn-danger w-full">আবেদন প্রত্যাখ্যান করুন</button></form>`,
    });
    $('#dec-form').addEventListener('submit', e => {
      e.preventDefault(); const f = formData(e.target); const a = DB.s.admissions.find(x => x.id === appId);
      Object.assign(a, { status: 'Declined', decidedAt: new Date().toISOString(), note: f.note });
      if (f.refund && a.netPaid > 0) DB.postJournal(`ফেরত — প্রত্যাখ্যাত আবেদন ${a.id}`, [{ acct: '2200', dr: a.netPaid, cr: 0 }, { acct: DB.mfsAccount(a.payment.method), dr: 0, cr: a.netPaid }], a.id, App.session.userId, null, { kind: 'PV', payee: a.guardianName });
      DB.sms(a.guardianPhone, `${DB.s.school.shortName}: ${a.studentNameBn || a.studentName}-এর আবেদন ${a.id} অনুমোদিত হয়নি। ${f.note}${f.refund && a.netPaid ? ' আপনার পরিশোধিত অর্থ ৭ দিনের মধ্যে ফেরত দেওয়া হবে।' : ''}`);
      DB.audit('ADMISSION_DECLINE', 'admissions', `${a.id} প্রত্যাখ্যাত: ${f.note}`); DB.save();
      Modal.close(); toast('আবেদন প্রত্যাখ্যাত হয়েছে; অভিভাবককে অবহিত করা হয়েছে।', 'warn'); App.refresh();
    });
  },

  /* ----- Staff ----- */
  onboard() {
    Modal.open({
      title: 'নতুন শিক্ষক যুক্ত করুন', size: 'lg',
      body: `<form id="ob-form" class="grid sm:grid-cols-2 gap-3">
        <div><label class="label">পূর্ণ নাম</label><input class="input" name="name" required></div>${People.fields()}
        <div><label class="label">ব্যবহারকারীর নাম</label><input class="input" name="username" pattern="[a-z0-9_.]{3,20}" title="৩–২০টি ছোট হাতের অক্ষর, অঙ্ক, _ অথবা ." required></div>
        <div><label class="label">ই-মেইল</label><input class="input" type="email" name="email" required></div>
        <div><label class="label">মোবাইল</label><input class="input" name="phone" pattern="01[3-9][0-9]{8}" required></div>
        <div><label class="label">বিভাগ</label><select class="select" name="dept"><option value="Science">বিজ্ঞান</option><option value="Humanities">মানবিক</option><option value="Commerce">ব্যবসায় শিক্ষা</option><option value="Physical Education">শারীরিক শিক্ষা</option></select></div>
        <div><label class="label">পদবি</label><select class="select" name="designation"><option value="Assistant Teacher">সহকারী শিক্ষক</option><option value="Senior Teacher">জ্যেষ্ঠ শিক্ষক</option><option value="Lecturer">প্রভাষক</option></select></div>
        <div><label class="label">বিষয় বরাদ্দ</label><select class="select" name="subject">${subjectOptions()}</select></div>
        <div><label class="label">বেতন গ্রেড</label><select class="select" name="grade">${Object.entries(DB.s.salaryGrades).map(([g, v]) => `<option value="${g}">${g} — ${U.money(v)}</option>`).join('')}</select></div>
        <label class="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="head"> বিভাগীয় প্রধান হিসেবে নিযুক্ত করুন</label>
        <div class="sm:col-span-2"><button class="btn btn-primary w-full">${icon('user-plus')} শিক্ষকের অ্যাকাউন্ট তৈরি করুন</button></div></form>`,
    });
    $('#ob-form').addEventListener('submit', e => {
      e.preventDefault(); const f = formData(e.target);
      if (DB.s.users.some(u => u.username === f.username)) return toast('এই ব্যবহারকারীর নাম ইতোমধ্যে ব্যবহৃত হয়েছে।', 'error');
      const temp = U.tempPw();
      const u = { id: DB.id('U'), name: f.name, username: f.username, email: f.email, phone: f.phone, pwHash: U.pw(temp), active: true, createdAt: new Date().toISOString(), createdBy: App.session.userId, photo: null };
      DB.s.users.push(u); DB.s.userRoles.push({ userId: u.id, role: 'TEACHER' });
      DB.s.teachers.push({ id: DB.id('T'), userId: u.id, campusId: DB.campusId(), dept: f.dept, designation: f.designation, salaryGrade: f.grade, baseSalary: DB.s.salaryGrades[f.grade], isHead: !!f.head, subjects: [f.subject], joinDate: U.today(), status: 'Probation', payoutMethod: 'Bank', payoutAccount: '' });
      DB.s.teacherAbsences[DB.s.teachers[DB.s.teachers.length - 1].id] = {};
      DB.audit('PROVISION_TEACHER', 'users', `অধ্যক্ষ ${f.username}-কে যুক্ত করেছেন (${f.subject}, ${f.grade})`); DB.save();
      Modal.body(`<div class="text-center space-y-2"><div class="text-emerald-600 font-bold">${icon('check-circle-2', 'w-8 h-8 mx-auto')} শিক্ষক যুক্ত হয়েছেন</div><p class="text-sm">অস্থায়ী পাসওয়ার্ড — <b>@${esc(f.username)}</b>:</p><code class="text-lg bg-slate-100 px-3 py-1 rounded">${esc(temp)}</code><p class="text-xs text-slate-500">একবারই দেখানো হবে। প্রথম লগইনের সময় শিক্ষক এটি পরিবর্তন করবেন।</p></div>`);
      App.refresh();
    });
  },
  setTeacher(id, field, value) {
    const t = DB.teacher(id), name = pn(DB.user(t.userId));
    if (field === 'subject') t.subjects = [value];
    if (field === 'grade') { t.salaryGrade = value; t.baseSalary = DB.s.salaryGrades[value]; }
    if (field === 'head') t.isHead = value;
    DB.audit({ subject: 'SUBJECT_ALLOC', grade: 'SALARY_GRADE', head: 'DEPT_HEAD' }[field], 'teachers', `${name} → ${value}`); DB.save();
    toast('কর্মীর তথ্য আপডেট করা হয়েছে।', 'success');
  },
  decideLeave(id, status) {
    const l = DB.s.leaves.find(x => x.id === id); l.status = status; l.decidedBy = App.session.userId;
    const t = DB.teacher(l.teacherId), u = DB.user(t.userId);
    if (status === 'Approved') { const mk = l.from.slice(0, 7); const days = Math.round((new Date(l.to) - new Date(l.from)) / 864e5) + 1; const rec = DB.s.teacherAbsences[t.id][mk] || (DB.s.teacherAbsences[t.id][mk] = { unexcused: 0, excused: 0 }); rec.excused += days; }
    DB.sms(u.phone, `${DB.s.school.shortName}: আপনার ${bn(l.type)} (${U.fmtDate(l.from)}–${U.fmtDate(l.to)}) ${status === 'Approved' ? 'অনুমোদিত' : 'প্রত্যাখ্যাত'} হয়েছে।`);
    DB.audit('LEAVE_' + status.toUpperCase(), 'leaves', `${pn(u)}: ${l.from}→${l.to}`); DB.save();
    toast(status === 'Approved' ? 'ছুটি অনুমোদিত হয়েছে।' : 'ছুটি প্রত্যাখ্যাত হয়েছে।', status === 'Approved' ? 'success' : 'warn'); App.refresh();
  },

  /* ----- Routine builder: replaced at load time by js/modules/routine.js (conflicts, allConflicts, editSlot, page render) ----- */
  conflicts(slot, ignoreId, set = DB.routineSet(App.ui.rtSes || DB.session())) {
    const out = [];
    set.forEach(r => {
      if (r.id === ignoreId || r.day !== slot.day || +r.period !== +slot.period) return;
      if (r.classId === slot.classId && r.section === slot.section) return;     // the cell itself
      if (r.teacherId === slot.teacherId) out.push(`${U.dayBn(r.day)} ${bnNum(r.period)} নং পিরিয়ডে ${DB.teacherName(r.teacherId)} ইতোমধ্যে ${DB.className(r.classId)}-এ পাঠদান করছেন`);
      if (r.room && r.room === slot.room) out.push(`${U.dayBn(r.day)} ${bnNum(r.period)} নং পিরিয়ডে কক্ষ ${U.bn(r.room)} ${DB.className(r.classId)}-এর জন্য বরাদ্দ রয়েছে`);
    });
    return out;
  },
  allConflicts(set = DB.routineSet(App.ui.rtSes || DB.session())) {
    const seen = new Set(), list = [];
    set.forEach(r => this.conflicts(r, r.id, set).forEach(msg => { const k = [r.day, r.period, msg].join('|'); if (!seen.has(k)) { seen.add(k); list.push({ r, msg }); } }));
    return list;
  },
  editSlot(classId, day, period) {
    const set = DB.routineSet(App.ui.rtSes || DB.session()), campus = DB.campusOf(classId);
    // a campus may have no teacher, room or subject yet: start empty instead of failing
    if (!DB.teachersIn(campus).length) return toast('রুটিনে পিরিয়ড বসাতে আগে এই ক্যাম্পাসে শিক্ষক যোগ করুন।', 'warn');
    const cur = set.find(r => r.classId === classId && r.day === day && +r.period === +period) || { classId, section: DB.cls(classId)?.sections?.[0] || '', day, period, subjectId: DB.classSubjects(classId)[0]?.id || '', teacherId: DB.teachersIn(campus)[0]?.id || '', room: DB.rooms(campus)[0] || '' };
    Modal.open({
      title: `${DB.cls(classId).name} · ${U.dayBn(day)} · পিরিয়ড ${bnNum(period)}`, size: 'sm',
      body: `<form id="slot-form" class="space-y-3">
        <div><label class="label">বিষয়</label><select class="select" name="subjectId">${subjectOptions(cur.subjectId)}</select></div>
        <div><label class="label">শিক্ষক</label><select class="select" name="teacherId">${DB.teachersIn(campus).map(t => `<option value="${t.id}" ${t.id === cur.teacherId ? 'selected' : ''}>${esc(pn(DB.user(t.userId)))} — ${Teacher.mySubjects(classId, t).map(x => DB.subject(x)?.name || x).join(', ')}</option>`).join('')}</select></div>
        <div><label class="label">কক্ষ</label><select class="select" name="room">${[...new Set([...DB.rooms(campus), cur.room])].map(r => `<option value="${esc(r)}" ${r === cur.room ? 'selected' : ''}>${esc(U.bn(r))}</option>`).join('')}</select></div>
        <div id="slot-conf" class="text-sm"></div>
        <div class="flex gap-2"><button type="button" class="btn btn-ghost" id="slot-clear">খালি পিরিয়ড</button><button class="btn btn-primary flex-1" id="slot-save">পিরিয়ড সংরক্ষণ করুন</button></div></form>`,
    });
    const f = $('#slot-form');
    const check = () => {
      const slot = { ...cur, ...formData(f) };
      const c = this.conflicts(slot, cur.id);
      $('#slot-conf').innerHTML = c.length ? `<div class="card p-3 bg-red-50 border-red-200 text-red-700">${icon('triangle-alert', 'w-4 h-4 inline')} <b>সংঘাত শনাক্ত হয়েছে</b><ul class="list-disc ml-5 mt-1">${c.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : `<div class="text-emerald-600">${icon('check-circle-2', 'w-4 h-4 inline')} কোনো সংঘাত নেই</div>`;
      $('#slot-save').disabled = c.length > 0; App.icons();
    };
    f.addEventListener('change', check); check();
    f.addEventListener('submit', e => {
      e.preventDefault(); const v = formData(f);
      if (this.conflicts({ ...cur, ...v }, cur.id).length) return;
      if (cur.id) Object.assign(cur, v); else set.push({ id: DB.id('RT'), ...cur, ...v });
      DB.audit('ROUTINE_EDIT', 'routine', `[${App.ui.rtSes || DB.session()}] ${classId} ${day} P${period} → ${v.subjectId} / ${DB.teacherName(v.teacherId)} / ${v.room}`); DB.save();
      Modal.close(); toast('পিরিয়ড সংরক্ষিত হয়েছে — কোনো সংঘাত নেই।', 'success'); App.refresh();
    });
    $('#slot-clear').addEventListener('click', () => { if (cur.id) set.splice(set.indexOf(cur), 1); DB.audit('ROUTINE_EDIT', 'routine', `${classId} ${day} P${period} খালি করা হয়েছে`); DB.save(); Modal.close(); App.refresh(); });
  },

  /* ----- SOS broadcast ----- */
  TEMPLATES: {
    'Weather closure': 'প্রতিকূল আবহাওয়ার কারণে আগামীকাল বিদ্যালয় বন্ধ থাকবে। রুটিন অনুযায়ী অনলাইন ক্লাস চলবে। নিরাপদে থাকুন।',
    'Security alert': 'নিরাপত্তা সতর্কতা: সতর্কতামূলক ব্যবস্থা হিসেবে ক্যাম্পাস লকডাউন করা হয়েছে। শিক্ষার্থীরা শ্রেণিকক্ষে নিরাপদে আছে। পরবর্তী নোটিশ না দেওয়া পর্যন্ত ক্যাম্পাসে আসবেন না।',
    'Early dismissal': 'আজ সকাল ১১:৩০টায় বিদ্যালয় আগাম ছুটি হবে। অভিভাবকদের সন্তানকে নিয়ে যাওয়ার ব্যবস্থা করার অনুরোধ করা হচ্ছে।',
    'Exam postponed': 'আজকের পরীক্ষা স্থগিত করা হয়েছে। সংশোধিত সময়সূচি নোটিশ বোর্ডে প্রকাশ করা হবে।',
    'Custom': '',
  },
  /** Display names for the template keys above (the keys stay English — they are stored in broadcast history). */
  TEMPLATE_LABELS: { 'Weather closure': 'দুর্যোগজনিত বন্ধ', 'Security alert': 'নিরাপত্তা সতর্কতা', 'Early dismissal': 'আগাম ছুটি', 'Exam postponed': 'পরীক্ষা স্থগিত', 'Custom': 'নিজস্ব' },
  /** Display label for a stored audience key ('Everyone', 'Campus:MAIN', 'Class:C10' …). */
  audienceLabel(a) {
    if (a.startsWith('Class:')) return DB.className(a.slice(6)) + ' (শিক্ষার্থী + অভিভাবক)';
    if (a.startsWith('Campus:')) return 'শুধু ' + DB.campus(a.slice(7)).name;
    return { Everyone: multiCampus() ? 'সকলে — সকল ক্যাম্পাস' : 'সকলে', Guardians: 'অভিভাবকগণ', Staff: 'কর্মী', Students: 'শিক্ষার্থী' }[a] || a;
  },
  audience(kind) {
    const users = DB.s.users.filter(u => u.active);
    const has = (u, r) => DB.roles(u.id).includes(r);
    if (kind === 'Everyone') return users;
    if (kind.startsWith('Campus:')) {
      const cp = kind.slice(7), sts = DB.activeStudents(cp);
      return [...new Set([...sts.flatMap(s => [s.userId, ...DB.guardiansOf(s.id).map(g => g.id)]), ...DB.teachersIn(cp).map(t => t.userId)])].map(id => DB.user(id)).filter(u => u?.active);
    }
    if (kind === 'Guardians') return users.filter(u => has(u, 'GUARDIAN'));
    if (kind === 'Staff') return users.filter(u => has(u, 'TEACHER') || has(u, 'PRINCIPAL') || has(u, 'ADMIN'));
    if (kind === 'Students') return users.filter(u => has(u, 'STUDENT'));
    const cls = kind.replace('Class:', '');
    const sts = DB.s.students.filter(s => s.classId === cls);
    return [...new Set(sts.flatMap(s => [s.userId, ...DB.guardiansOf(s.id).map(g => g.id)]))].map(id => DB.user(id));
  },
};

App.register('principal', {
  title: 'কমান্ড ডেস্ক',
  pages: [
    /* ---------------- Overview ---------------- */
    {
      id: 'overview', label: 'সারসংক্ষেপ', icon: 'layout-dashboard',
      render() {
        const sts = DB.activeStudents();
        const lastDay = [...new Set(sts.flatMap(s => Object.keys(DB.s.attendance[s.id] || {})))].sort().pop();
        const presentToday = sts.filter(s => ['P', 'L'].includes(DB.s.attendance[s.id]?.[lastDay])).length;
        const dues = U.sum(sts, s => DB.dues(s.id));
        const pending = DB.s.admissions.filter(a => a.status === 'Pending').length;
        const risk = Risk.compute();
        const leaves = DB.s.leaves.filter(l => l.status === 'Pending');
        const byClass = DB.classesIn().map(c => { const list = DB.studentsIn(c.id); const pct = U.sum(list, s => DB.attendanceStats(s.id).pct) / (list.length || 1); const gpa = U.sum(list, s => (DB.latestExam() ? DB.result(s.id, DB.latestExam().id).gpa : 0) || 0) / (list.length || 1); return { c, pct, gpa, n: list.length }; });
        return pageHeader(`শুভ ${new Date().getHours() < 12 ? 'সকাল' : 'অপরাহ্ণ'}, ${esc(pn(App.user()).split(' ').slice(-1)[0])}`, `${multiCampus() ? esc(DB.campus().name) + ' · ' : ''}শিক্ষাবর্ষ ${esc(U.bn(DB.session()))} · ${U.fmtDate(U.today())}${DB.holiday(new Date(), DB.campusId()) ? ` · ${badge(DB.holiday(new Date(), DB.campusId()).name, 'violet')}` : ''}`, `<button class="btn btn-danger" onclick="App.go('principal','sos')">${icon('siren')} জরুরি সম্প্রচার (SOS)</button>`)
          + `<div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
            ${kpi('ভর্তিকৃত শিক্ষার্থী', bnNum(sts.length), `${bnNum(DB.classesIn().length)}টি শ্রেণি`, 'users', 'blue')}
            ${kpi('উপস্থিত (সর্বশেষ কর্মদিবস)', `${bnNum(Math.round(presentToday / (sts.length || 1) * 100))}%`, `${U.fmtDate(lastDay)} তারিখে ${bnNum(presentToday)}/${bnNum(sts.length)}`, 'calendar-check', 'green')}
            ${kpi('বকেয়া', U.money(dues), `${bnNum(sts.filter(s => DB.dues(s.id)).length)} জন শিক্ষার্থী`, 'wallet', 'amber')}
            ${kpi('ঝুঁকিপূর্ণ শিক্ষার্থী', bnNum(risk.length), `${bnNum(pending)}টি ভর্তি · ${bnNum(leaves.length)}টি ছুটির আবেদন অপেক্ষমাণ`, 'triangle-alert', 'red')}</div>
          <div class="grid xl:grid-cols-3 gap-5">
            <div class="card p-5 xl:col-span-2"><div class="font-semibold mb-4">শ্রেণিভিত্তিক ফলাফলের সারচিত্র</div><div class="space-y-4">${byClass.map(x => `<div class="grid grid-cols-12 items-center gap-3 text-sm"><div class="col-span-3 sm:col-span-2 font-semibold">${x.c.name}</div><div class="col-span-6 sm:col-span-7">${progressBar(x.pct)}</div><div class="col-span-3 text-right text-slate-600">${bnNum(x.pct.toFixed(1))}% · জিপিএ ${bnNum(x.gpa.toFixed(2))}</div></div>`).join('')}</div><div class="text-xs text-slate-400 mt-3">দণ্ড = গড় উপস্থিতি; জিপিএ ${esc(DB.latestExam()?.name || 'প্রকাশিত ফল')} থেকে।</div></div>
            <div class="card"><div class="px-5 py-3 border-b border-slate-100 font-semibold flex justify-between">প্রধান ঝুঁকি-সংকেত <a href="${App.href('principal', 'risk')}" class="text-sm text-brand-600">সব দেখুন</a></div>
              <div class="divide-y divide-slate-100">${risk.slice(0, 5).map(r => `<button class="w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-slate-50" onclick="Dossier.open('${r.st.id}')">${avatar(r.st, 32)}<div class="min-w-0 flex-1"><div class="text-sm font-semibold truncate">${esc(pn(r.st))}</div><div class="flex flex-wrap gap-1 mt-0.5">${r.flags.map(f => badge(f.label, f.tone)).join('')}</div></div></button>`).join('') || emptyState('কোনো শিক্ষার্থী চিহ্নিত হয়নি।')}</div></div>
          </div>
          <div class="grid lg:grid-cols-2 gap-5 mt-5">
            <div class="card"><div class="px-5 py-3 border-b border-slate-100 font-semibold flex justify-between">ভর্তির আবেদন <a href="${App.href('principal', 'admissions')}" class="text-sm text-brand-600">তালিকা খুলুন</a></div><div class="divide-y divide-slate-100">${DB.s.admissions.filter(a => a.status === 'Pending').slice(0, 4).map(a => `<div class="px-5 py-3 flex items-center justify-between text-sm"><div><div class="font-semibold">${esc(a.studentNameBn || a.studentName)}</div><div class="text-slate-500 text-xs">${a.id} · ${DB.cls(a.classId).name}</div></div><button class="btn btn-ghost btn-sm" onclick="Principal.viewApplication('${a.id}')">পর্যালোচনা করুন</button></div>`).join('') || emptyState('তালিকায় কোনো অপেক্ষমাণ আবেদন নেই।')}</div></div>
            <div class="card"><div class="px-5 py-3 border-b border-slate-100 font-semibold">সাম্প্রতিক কার্যক্রম</div><div class="divide-y divide-slate-100 text-sm">${DB.s.audit.slice(-6).reverse().map(a => `<div class="px-5 py-2.5"><span class="font-mono text-xs text-slate-400">${U.fmtTime(a.ts)}</span> · <b>${a.action}</b> <span class="text-slate-600">${esc(a.detail)}</span></div>`).join('')}</div></div>
          </div>` + (typeof StaffGate !== 'undefined' ? StaffGate.principalCards() : '');
      },
    },
    /* ---------------- 360° Dossier search ---------------- */
    {
      id: 'dossier', label: 'শিক্ষার্থীর পূর্ণাঙ্গ নথি', icon: 'folder-search',
      render() {
        const ui = App.ui.dos || (App.ui.dos = { q: '', cls: '' });
        const q = ui.q.toLowerCase(), all = DB.activeStudents(), L = 'students.dossier', minAtt = DB.s.school.minAttendance;
        const uniq = f => [...new Set(all.map(f).filter(Boolean))];
        const secs = uniq(s => (!ui.cls || s.classId === ui.cls) && s.section), groups = uniq(s => s.stream), shifts = uniq(s => s.shift);
        // filters the user switched off do not filter; a filter with one possible value is not offered
        const F = new Set(ListPrefs.filters(L, [{ k: 'cls', label: 'শ্রেণি' }, { k: 'section', label: 'শাখা', when: secs.length > 1 }, { k: 'group', label: 'বিভাগ / গ্রুপ', when: groups.length > 1 }, { k: 'shift', label: 'শিফট', on: false, when: shifts.length > 1 }, { k: 'gender', label: 'লিঙ্গ', on: false }, { k: 'dues', label: 'বকেয়া', on: false }, { k: 'att', label: 'উপস্থিতি', on: false }]).map(d => d.k));
        const v = k => (F.has(k) ? ui[k] || '' : '');
        const list = all.filter(s => (!v('cls') || s.classId === v('cls')) && (!v('section') || s.section === v('section')) && (!v('group') || s.stream === v('group')) && (!v('shift') || s.shift === v('shift')) && (!v('gender') || s.gender === v('gender'))
          && (!v('dues') || (v('dues') === 'due') === DB.dues(s.id) > 0) && (!v('att') || (v('att') === 'low') === DB.attendanceStats(s.id).pct < minAtt)
          && (!q || s.name.toLowerCase().includes(q) || (s.nameBn || '').includes(ui.q) || String(s.roll) === q || s.id.toLowerCase() === q || String(s.regNo || '').toLowerCase().includes(q)));
        const C = ListPrefs.cols(L, [
          { k: 'st', label: 'শিক্ষার্থী', lock: true, td: s => `<div class="flex items-center gap-2.5">${avatar(s, 30)}<div><div class="font-semibold">${esc(pn(s))}</div><div class="text-xs text-slate-400">${s.id}</div></div></div>` },
          { k: 'cls', label: 'শ্রেণি', td: s => `${esc(DB.cls(s.classId)?.name || '')}${s.section ? '-' + esc(s.section) : ''} · ${bnNum(s.roll)}` },
          { k: 'reg', label: 'নিবন্ধন নম্বর', on: false, td: s => `<span class="font-mono">${esc(s.regNo || '—')}</span>` },
          { k: 'group', label: 'বিভাগ / গ্রুপ', on: false, when: groups.length > 0, td: s => esc(s.stream || '—') },
          { k: 'att', label: 'উপস্থিতি', td: s => { const a = DB.attendanceStats(s.id); return `<span class="${a.pct < minAtt ? 'text-red-600 font-semibold' : ''}">${bnNum(a.pct.toFixed(1))}%</span>`; } },
          { k: 'gpa', label: 'সিজিপিএ', td: s => gpaFmt(DB.cgpa(s.id)) },
          { k: 'dues', label: 'বকেয়া', td: s => { const d = DB.dues(s.id); return `<span class="${d ? 'text-red-600 font-semibold' : 'text-slate-400'}">${d ? U.money(d) : '—'}</span>`; } },
          { k: 'blood', label: 'রক্তের গ্রুপ', td: s => esc(s.blood || '—') },
          { k: 'medical', label: 'স্বাস্থ্যগত তথ্য', td: s => `<span class="${s.medical && s.medical !== 'None' ? 'text-red-600' : 'text-slate-400'}">${!s.medical || s.medical === 'None' ? 'নেই' : esc(s.medical)}</span>` },
          { k: 'gender', label: 'লিঙ্গ', on: false, td: s => esc(bn(s.gender) || '—') },
          { k: 'dob', label: 'জন্মতারিখ', on: false, td: s => (s.dob ? U.fmtDate(s.dob) : '—') },
          { k: 'guardian', label: 'অভিভাবক', on: false, td: s => { const g = typeof GuardianCard !== 'undefined' ? GuardianCard.primary(s.id) : DB.guardiansOf(s.id)[0]; return g ? `${esc(pn(g))} <span class="text-slate-500">(${esc(GuardianCard?.rel?.(g.relation) || bn(g.relation))})</span>` : '<span class="text-slate-400">—</span>'; } },
          { k: 'phone', label: 'অভিভাবকের মোবাইল', on: false, td: s => esc(U.bn(DB.guardiansOf(s.id)[0]?.phone || s.emergency || '—')) },
          { k: 'adm', label: 'ভর্তির তারিখ', on: false, td: s => (s.admissionDate ? U.fmtDate(s.admissionDate) : '—') },
          { k: 'act', label: '', lock: true, td: s => `<button class="btn btn-ghost btn-sm" onclick="Dossier.open('${s.id}')">${icon('eye')} পরিদর্শন করুন</button>` },
        ]);
        const sel = (k, label, opts) => F.has(k) ? `<select data-f="${k}" class="select sm:w-44" aria-label="${label}">${opts}</select>` : '';
        const o = (k, items, allLabel) => `<option value="">${allLabel}</option>` + items.map(([val, l]) => `<option value="${esc(val)}" ${ui[k] === val ? 'selected' : ''}>${esc(l)}</option>`).join('');
        return pageHeader('৩৬০° শিক্ষার্থী নথি', '',ListPrefs.button(L))
          + `<div class="card p-4 mb-4 flex flex-wrap gap-3"><div class="relative flex-1 min-w-[12rem]"><span class="absolute left-3 top-2.5 text-slate-400">${icon('search')}</span><input id="dos-q" class="input pl-9" placeholder="নাম, রোল, আইডি অনুসন্ধান করুন…" value="${esc(ui.q)}"></div>
            ${F.has('cls') ? `<select data-f="cls" class="select sm:w-48" aria-label="শ্রেণি">${classOptions(ui.cls, true)}</select>` : ''}${sel('section', 'শাখা', o('section', secs.map(x => [x, x]), 'সকল শাখা'))}${sel('group', 'বিভাগ', o('group', groups.map(x => [x, x]), 'সকল বিভাগ'))}${sel('shift', 'শিফট', o('shift', shifts.map(x => [x, bn((DB.s.school.shifts || []).find(h => h.id === x)?.name || x)]), 'সকল শিফট'))}${sel('gender', 'লিঙ্গ', o('gender', [['Male', bn('Male')], ['Female', bn('Female')]], 'সকল লিঙ্গ'))}${sel('dues', 'বকেয়া', o('dues', [['due', 'বকেয়া আছে'], ['clear', 'বকেয়ামুক্ত']], 'বকেয়া — সকল'))}${sel('att', 'উপস্থিতি', o('att', [['low', `${bnNum(minAtt)}%-এর কম`], ['ok', `${bnNum(minAtt)}% বা বেশি`]], 'উপস্থিতি — সকল'))}</div>
          <div class="text-slate-500 mb-2">${bnNum(list.length)} জন শিক্ষার্থী</div>
          <div class="card scroll-x"><table class="table"><thead><tr>${C.map(c => `<th>${c.label}</th>`).join('')}</tr></thead><tbody>
          ${list.map(s => `<tr>${C.map(c => `<td>${c.td(s)}</td>`).join('')}</tr>`).join('')}
          </tbody></table>${list.length ? '' : emptyState('কোনো শিক্ষার্থী মেলেনি।')}</div>`;
      },
      mount() {
        let t; $('#dos-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { App.ui.dos.q = e.target.value; App.refresh(); const el = $('#dos-q'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 200); });
        $$('[data-f]', $('#page-host')).forEach(el => el.addEventListener('change', e => { App.ui.dos[e.target.dataset.f] = e.target.value; if (e.target.dataset.f === 'cls') App.ui.dos.section = ''; App.refresh(); }));
      },
    },
    /* ---------------- Staff ---------------- */
    {
      id: 'staff', label: 'কর্মী ও ছুটি', icon: 'contact', count: () => DB.s.leaves.filter(l => l.status === 'Pending').length || '',
      render() {
        const leaves = DB.s.leaves.filter(l => DB.teacher(l.teacherId)?.campusId === DB.campusId()).sort((a, b) => (a.status === 'Pending' ? -1 : 1) - (b.status === 'Pending' ? -1 : 1));
        const L = 'teachers.staff', K = 'stfF', all = DB.teachersIn(), uq = f => [...new Set(all.map(f).filter(Boolean))];
        const FD = ListPrefs.filters(L, [{ k: 'dept', label: 'বিভাগ', opts: uq(t => t.dept).map(d => [d, bn(d)]), when: uq(t => t.dept).length > 1 }, { k: 'desig', label: 'পদবি', opts: uq(t => t.designation).map(d => [d, bn(d)]), when: uq(t => t.designation).length > 1 }, { k: 'status', label: 'চাকরির অবস্থা', on: false, opts: uq(t => t.status || 'Confirmed').map(s => [s, bn(s)]), when: uq(t => t.status || 'Confirmed').length > 1 }, { k: 'subj', label: 'বিষয়', on: false, opts: uq(t => (t.subjects || [])[0] && t.subjects).flat().filter((x, i, a) => a.indexOf(x) === i).map(s => [s, DB.subject(s)?.name || s]) }]);
        const fv = k => ListPrefs.val(L, K, k), q = String((App.ui[K] || {}).q || '').toLowerCase();
        const list = all.filter(t => { const u = DB.user(t.userId) || {}; return (!fv('dept') || t.dept === fv('dept')) && (!fv('desig') || t.designation === fv('desig')) && (!fv('status') || (t.status || 'Confirmed') === fv('status')) && (!fv('subj') || (t.subjects || []).includes(fv('subj'))) && (!q || `${u.name} ${u.nameBn || ''} ${u.username} ${t.id}`.toLowerCase().includes(q)); });
        const C = ListPrefs.cols(L, [
          { k: 't', label: 'শিক্ষক', lock: true, td: t => { const u = DB.user(t.userId) || {}; return `<div class="flex items-center gap-2.5">${avatar(u, 30)}<div><div class="font-semibold"><a class="hover:underline" href="${Faculty.url(t.id)}">${esc(pn(u))}</a> ${t.status === 'Probation' ? badge('শিক্ষানবিশকাল', 'amber') : ''}</div><div class="text-xs text-slate-400">@${esc(u.username)} · ${esc(U.bn(u.phone || ''))}</div></div></div>`; } },
          { k: 'dept', label: 'বিভাগ', td: t => esc(bn(t.dept)) },
          { k: 'desig', label: 'পদবি', td: t => esc(bn(t.designation)) },
          { k: 'subj', label: 'বিষয়সমূহ', cls: 'min-w-[200px]', td: t => `<div>${esc(Teacher.assignSummary(t)) || '—'}</div><a class="btn btn-ghost btn-sm mt-1" href="${Faculty.url(t.id, 'assign')}">${icon('grid-3x3')} বিষয় ও শ্রেণি বরাদ্দ</a>` },
          { k: 'grade', label: 'গ্রেড', td: t => `<select class="select !py-1 !text-xs" aria-label="বেতন গ্রেড" onchange="Principal.setTeacher('${t.id}','grade',this.value)">${Object.keys(DB.s.salaryGrades).map(g => `<option value="${g}" ${g === t.salaryGrade ? 'selected' : ''}>${g}</option>`).join('')}</select>` },
          { k: 'head', label: 'বিভাগীয় প্রধান', td: t => `<input type="checkbox" aria-label="বিভাগীয় প্রধান" ${t.isHead ? 'checked' : ''} onchange="Principal.setTeacher('${t.id}','head',this.checked)">` },
          { k: 'roles', label: 'ভূমিকা', td: t => DB.roles(t.userId).map(r => badge(bn(r), 'blue')).join(' ') },
          { k: 'status', label: 'চাকরির অবস্থা', on: false, td: t => badge(bn(t.status || 'Confirmed'), { Probation: 'amber', Confirmed: 'green', Resigned: 'red' }[t.status] || 'slate') },
          { k: 'qual', label: 'শিক্ষাগত যোগ্যতা', on: false, td: t => esc(t.qualification || '—') },
          { k: 'join', label: 'যোগদান', on: false, td: t => (t.joinDate ? U.fmtDate(t.joinDate) : '—') },
          { k: 'email', label: 'ই-মেইল', on: false, td: t => esc(DB.user(t.userId)?.email || '—') },
          { k: 'id', label: 'কর্মচারী আইডি', on: false, td: t => `<span class="font-mono">${esc(t.id)}</span>` },
        ]);
        return pageHeader('কর্মী তালিকা', '',`${ListPrefs.button(L)}<button class="btn btn-primary" onclick="Principal.onboard()">${icon('user-plus')} শিক্ষক যুক্ত করুন</button>`)
          + `<div class="card p-3 mb-3 flex flex-wrap gap-2"><input class="input flex-1 min-w-[12rem]" placeholder="নাম, ইউজার আইডি বা কর্মচারী আইডি…" value="${esc((App.ui[K] || {}).q || '')}" onchange="ListPrefs.set('${K}','q',this.value)">${ListPrefs.selects(FD, K)}</div>
          <div class="card scroll-x mb-6"><table class="table"><thead>${ListPrefs.head(C)}</thead><tbody>
          ${list.map(t => ListPrefs.row(C, t)).join('')}</tbody></table>${list.length ? '' : emptyState('কোনো শিক্ষক মেলেনি।', 'users')}</div>
          <div class="card"><div class="px-5 py-3 border-b border-slate-100 font-semibold">ছুটির আবেদন</div><div class="scroll-x"><table class="table"><thead><tr><th>শিক্ষক</th><th>ধরন</th><th>তারিখ</th><th>কারণ</th><th>অবস্থা</th><th></th></tr></thead><tbody>
          ${leaves.map(l => `<tr><td>${esc(DB.teacherName(l.teacherId))}</td><td>${bn(l.type)}</td><td>${U.fmtDate(l.from)} → ${U.fmtDate(l.to)}</td><td class="text-slate-600">${esc(l.reason)}</td><td>${badge(bn(l.status), { Pending: 'amber', Approved: 'green', Rejected: 'red' }[l.status] || 'slate')}</td><td>${l.status === 'Pending' ? `<div class="flex gap-1"><button class="btn btn-success btn-sm" onclick="Principal.decideLeave('${l.id}','Approved')">অনুমোদন করুন</button><button class="btn btn-ghost btn-sm" onclick="Principal.decideLeave('${l.id}','Rejected')">প্রত্যাখ্যান করুন</button></div>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
      },
    },
    /* ---------------- Routine builder ---------------- */
    {
      id: 'routine', label: 'রুটিন প্রস্তুতকারী', icon: 'calendar-range',
      render() {
        const campusClasses = DB.classesIn();
        if (!campusClasses.length) return pageHeader('রুটিন প্রস্তুতকারী', '') + `<div class="card p-6">${emptyState('রুটিন তৈরির আগে এই ক্যাম্পাসে শ্রেণি যোগ করুন।', 'calendar-range')}<div class="text-center"><button class="btn btn-primary" onclick="App.ui.setTab='structure';App.go(App.route.portal,'settings')">${icon('plus')} প্রথম শ্রেণি যোগ করুন</button></div></div>`;
        const cls = campusClasses.some(c => c.id === App.ui.rtCls) ? App.ui.rtCls : campusClasses[campusClasses.length - 1].id;
        const ses = App.ui.rtSes || DB.session(), set = DB.routineSet(ses);
        const all = Principal.allConflicts();
        const cell = (day, p) => {
          const r = set.find(x => x.classId === cls && x.day === day && x.period === p.n);
          const bad = r && Principal.conflicts(r, r.id).length;
          return `<td class="p-1"><button class="w-full text-left rounded-lg p-2 border ${bad ? 'border-red-400 bg-red-50' : r ? 'border-slate-200 bg-white hover:border-brand-400' : 'border-dashed border-slate-300 text-slate-400 hover:border-brand-400'}" onclick="Principal.editSlot('${cls}','${day}',${p.n})">${r ? `<div class="text-xs font-bold" style="color:${U.color(r.subjectId)}">${esc(DB.subject(r.subjectId)?.name || r.subjectId || '—')}</div><div class="text-[11px] text-slate-600 truncate">${esc(DB.teacherName(r.teacherId))}</div><div class="text-[10px] text-slate-400">কক্ষ ${esc(U.bn(r.room))}</div>` : '<div class="text-xs py-2">+ খালি</div>'}</button></td>`;
        };
        return pageHeader('সংঘাতমুক্ত রুটিন প্রস্তুতকারী', '',`<select class="select !w-auto" onchange="App.ui.rtSes=this.value;App.refresh()">${sessionOptions(ses)}</select><select class="select !w-auto" onchange="App.ui.rtCls=this.value;App.refresh()">${classOptions(cls)}</select><a class="btn btn-ghost" href="${App.href(App.route.portal === 'admin' ? 'admin' : 'principal', 'clone')}" title="${multiCampus() ? 'শিক্ষাবর্ষ ও ক্যাম্পাসের মধ্যে রুটিন কপি করুন' : 'শিক্ষাবর্ষের মধ্যে রুটিন কপি করুন'}">${icon('copy')} কপি করুন</a>`)
          + (ses !== DB.session() ? `<div class="card p-3 mb-3 bg-blue-50 border-blue-200 text-blue-800 text-sm">${icon('info', 'w-4 h-4 inline')} এডিট চলছে: <b>${esc(U.bn(ses))}</b> খসড়া সময়সূচি (${bnNum(set.length)}টি পিরিয়ড)। চলমান সময়সূচি শিক্ষাবর্ষ ${esc(U.bn(DB.session()))}-এর।</div>` : '')
          + `<div class="card p-3 mb-4 flex items-center gap-2 text-sm ${all.length ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}">${icon(all.length ? 'triangle-alert' : 'shield-check')} ${all.length ? `সম্পূর্ণ সময়সূচিতে ${bnNum(all.length)}টি সংঘাত: ${all.slice(0, 3).map(x => esc(x.msg)).join('; ')}` : `শিক্ষাবর্ষ ${esc(U.bn(ses))}-এর জন্য ${multiCampus() ? 'সকল ক্যাম্পাস' : 'সম্পূর্ণ সময়সূচি'} যাচাই করা হয়েছে — শিক্ষক বা কক্ষের কোনো সংঘাত নেই।`}</div>
          <div class="card scroll-x p-2"><table class="w-full min-w-[760px]"><thead><tr><th class="text-xs text-slate-500 p-2 w-16">দিন</th>${PERIODS.map(p => `<th class="text-xs text-slate-500 p-2">পিরিয়ড ${bnNum(p.n)}<div class="font-normal">${U.bn(p.start)}–${U.bn(p.end)}</div></th>`).join('')}</tr></thead>
          <tbody>${DAYS.map(d => `<tr><td class="text-sm font-bold text-slate-600 p-2">${U.dayBn(d, true)}</td>${PERIODS.map(p => cell(d, p)).join('')}</tr>`).join('')}</tbody></table></div>`;
      },
    },
    /* ---------------- Risk engine ---------------- */
    {
      id: 'risk', label: 'ঝুঁকি শনাক্তকরণ ব্যবস্থা', icon: 'radar',
      render() {
        const s = DB.s.school, list = Risk.compute();
        const summoned = new Set((DB.s.summons || []).filter(x => Date.now() - new Date(x.ts) < 7 * 864e5).map(x => x.studentId));
        return pageHeader('শিক্ষা ও সুস্থতা-সংক্রান্ত আগাম ঝুঁকি শনাক্তকরণ', `নিয়ম: উপস্থিতি &lt; ${bnNum(s.minAttendance)}% · জিপিএ &lt; ${bnNum(s.passGpa.toFixed(1))} · দুই টার্মের মধ্যে জিপিএ হ্রাস ≥ ১.০ · বিলম্ব ≥ ${bnNum(s.lateThreshold)} বার।`, list.length ? `<button class="btn btn-danger" onclick="if(confirm('চিহ্নিত ${bnNum(list.length)} জন শিক্ষার্থীর সকল অভিভাবকের নিকট তলবের এসএমএস পাঠাবেন?')){Risk.compute().forEach(r=>Risk.summon(r.st.id,true));toast('তলবনামা পাঠানো হয়েছে','success');App.refresh()}">${icon('send')} সকলকে তলব করুন (${bnNum(list.length)})</button>` : '')
          + `<div class="grid sm:grid-cols-4 gap-3 mb-5">${[['attendance', 'স্বল্প উপস্থিতি', 'calendar-x', 'red'], ['gpa', 'জিপিএ সীমার নিচে', 'trending-down', 'red'], ['drop', 'জিপিএ-র তীব্র হ্রাস', 'activity', 'amber'], ['late', 'নিয়মিত বিলম্ব', 'alarm-clock', 'amber']].map(([k, l, i, t]) => kpi(l, bnNum(list.filter(r => r.flags.some(f => f.k === k)).length), '', i, t)).join('')}</div>
          <div class="card scroll-x"><table class="table"><thead><tr><th>শিক্ষার্থী</th><th>শ্রেণি</th><th>উপস্থিতি</th><th>জিপিএ (পূর্ববর্তী → বর্তমান)</th><th>সংকেত</th><th></th></tr></thead><tbody>
          ${list.map(r => `<tr><td><button class="flex items-center gap-2.5 text-left" onclick="Dossier.open('${r.st.id}')">${avatar(r.st, 30)}<span class="font-semibold hover:underline">${esc(pn(r.st))}</span></button></td><td>${DB.cls(r.st.classId).name} · ${bnNum(r.st.roll)}</td><td>${bnNum(r.att.pct.toFixed(1))}% <span class="text-xs text-slate-400">(${bnNum(r.att.L)} বার বিলম্ব)</span></td><td>${gpaFmt(r.prevGpa)} → <b>${gpaFmt(r.gpa)}</b></td><td><div class="flex flex-wrap gap-1">${r.flags.map(f => badge(f.label, f.tone)).join('')}</div></td>
            <td>${summoned.has(r.st.id) ? badge('তলবকৃত', 'violet') : `<button class="btn btn-ghost btn-sm" onclick="Risk.summon('${r.st.id}');App.refresh()">${icon('message-square-warning')} অভিভাবককে তলব করুন</button>`}</td></tr>`).join('')}</tbody></table>${list.length ? '' : emptyState('কোনো অস্বাভাবিকতা শনাক্ত হয়নি।', 'shield-check')}</div>`;
      },
    },
    /* ---------------- SOS broadcast ---------------- */
    {
      id: 'sos', label: 'জরুরি সম্প্রচার', icon: 'siren',
      render() {
        const audiences = ['Everyone', ...(multiCampus() ? DB.s.campuses.map(c => `Campus:${c.id}`) : []), 'Guardians', 'Staff', 'Students', ...DB.classesIn().map(c => `Class:${c.id}`)];
        return pageHeader('এক-স্পর্শে জরুরি সম্প্রচার কেন্দ্র', '')
          + `<div class="grid lg:grid-cols-5 gap-5"><form id="sos-form" class="card p-5 lg:col-span-3 space-y-4 border-red-200">
            <div><div class="label">টেমপ্লেট</div><div class="flex flex-wrap gap-2">${Object.keys(Principal.TEMPLATES).map((t, i) => `<label class="cursor-pointer"><input type="radio" name="template" value="${t}" class="peer sr-only" ${i === 0 ? 'checked' : ''}><span class="btn btn-ghost btn-sm peer-checked:bg-red-600 peer-checked:text-white peer-checked:border-red-600">${Principal.TEMPLATE_LABELS[t] || t}</span></label>`).join('')}</div></div>
            <div><label class="label">বার্তা</label><textarea class="textarea" name="message" rows="4" maxlength="480" required>${Principal.TEMPLATES['Weather closure']}</textarea><div class="text-xs text-slate-400 text-right" id="sos-len"></div></div>
            <div class="grid sm:grid-cols-2 gap-4"><div><label class="label">প্রাপক</label><select class="select" name="audience">${audiences.map(a => `<option value="${a}">${esc(Principal.audienceLabel(a))}</option>`).join('')}</select></div>
            <div><div class="label">মাধ্যম</div><div class="flex gap-3 text-sm pt-2">${['SMS', 'Email', 'Push'].map(c => `<label class="flex items-center gap-1.5"><input type="checkbox" name="ch" value="${c}" checked> ${bn(c)}</label>`).join('')}</div></div></div>
            <div id="sos-count" class="text-sm text-slate-600"></div>
            <button class="btn btn-danger w-full text-base py-3">${icon('siren', 'w-5 h-5')} জরুরি সম্প্রচার পাঠান</button></form>
            <div class="lg:col-span-2 card"><div class="px-5 py-3 border-b border-slate-100 font-semibold">সম্প্রচারের ইতিহাস</div><div class="divide-y divide-slate-100">${[...DB.s.broadcasts].reverse().map(b => `<div class="px-5 py-3 text-sm"><div class="flex justify-between"><b>${esc(Principal.TEMPLATE_LABELS[b.template] || b.template)}</b><span class="text-xs text-slate-400">${U.fmtTime(b.ts)}</span></div><div class="text-slate-600 mt-1">${esc(b.message)}</div><div class="text-xs text-slate-400 mt-1">${b.channels.map(c => bn(c)).join(' + ')} · ${esc(Principal.audienceLabel(b.audience))} · ${bnNum(b.recipients, true)} জন প্রাপক</div></div>`).join('')}</div></div></div>`;
      },
      mount() {
        const f = $('#sos-form');
        const upd = () => { const n = Principal.audience(f.audience.value).length; $('#sos-count').innerHTML = `${icon('users', 'w-4 h-4 inline')} <b>${bnNum(n)}</b> জন নিবন্ধিত প্রাপক × ${bnNum($$('input[name=ch]:checked', f).length)}টি মাধ্যম`; $('#sos-len').textContent = `${bnNum(f.message.value.length)}/৪৮০`; App.icons(); };
        $$('input[name=template]', f).forEach(r => r.addEventListener('change', () => { if (Principal.TEMPLATES[r.value]) f.message.value = Principal.TEMPLATES[r.value]; upd(); }));
        f.addEventListener('input', upd); upd();
        f.addEventListener('submit', e => {
          e.preventDefault(); const d = formData(f); const ch = $$('input[name=ch]:checked', f).map(x => x.value);
          if (!ch.length) return toast('অন্তত একটি মাধ্যম নির্বাচন করুন।', 'error');
          const users = Principal.audience(d.audience);
          if (!confirm(`${ch.map(c => bn(c)).join(', ')}-এর মাধ্যমে ${bnNum(users.length)} জন প্রাপকের নিকট এই জরুরি বার্তা পাঠাবেন?`)) return;
          const msg = `[${DB.s.school.shortName} জরুরি] ${d.message}`;
          users.forEach(u => ch.forEach(c => DB.sms(c === 'Email' ? u.email : u.phone, msg, c)));
          DB.s.broadcasts.push({ id: DB.id('BC'), ts: new Date().toISOString(), template: d.template, message: d.message, channels: ch, audience: d.audience, recipients: users.length, by: App.session.userId });
          DB.audit('SOS_BROADCAST', 'broadcasts', `${d.template} → ${d.audience} (${users.length}) via ${ch.join('/')}`); DB.save();
          toast(`${bnNum(users.length)} জন প্রাপকের নিকট সম্প্রচার পাঠানো হয়েছে।`, 'success'); App.refresh();
        });
      },
    },
  ],
});
