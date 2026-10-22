/* ==========================================================================
   FINAL WIRING (loaded last)
   RBAC module tags & feature flags for pages defined before RBAC existed ·
   public menu order · user management (create any user type / delete) ·
   daily automated jobs · public notice filtering · seed fix-ups.
   ========================================================================== */

/* ---------- RBAC module + feature-flag tags for every page ---------- */
const PAGE_TAGS = {
  principal: { overview: 'dashboard', dossier: 'students', staff: 'hr', admissions: 'admissions', routine: 'academics', risk: 'students', sos: 'comms', proxy: ['hr', 'proxy'], faculty: 'hr', exams: 'exams', calendar: 'academics', clone: 'settings', accounts: 'accounts', installments: ['fees', 'installments'], services: ['services', 'onlineServices'] },
  teacher: { today: 'dashboard', attendance: 'attendance', gradebook: 'exams', planner: ['academics', 'aiPlanner'], homework: ['academics', 'homework'], syllabus: 'academics', conduct: 'students', leave: 'hr', calendar: 'academics' },
  admin: { system: 'system', audit: 'system', users: 'system', accounts: 'accounts', ledger: 'accounts', coa: 'accounts', reconcile: 'accounts', installments: ['fees', 'installments'], clone: 'settings', calendar: 'academics' },
  student: { dashboard: 'dashboard', timetable: 'academics', homework: ['academics', 'homework'], idcard: 'students', attendance: 'attendance', calendar: 'academics', services: ['services', 'onlineServices'] },
  guardian: { overview: 'dashboard', fees: 'fees', ptc: 'academics', conduct: 'students', academics: 'exams', idcards: 'students', calendar: 'academics', services: ['services', 'onlineServices'] },
  public: { services: [null, 'onlineServices'] },
};
Object.entries(PAGE_TAGS).forEach(([portal, map]) => Object.entries(map).forEach(([id, tag]) => {
  const p = App.portals[portal]?.pages.find(x => x.id === id); if (!p) return;
  const [module, flag] = Array.isArray(tag) ? tag : [tag];
  if (module && !p.module) p.module = module; if (flag && !p.flag) p.flag = flag;
}));

/* ---------- Public menu: one canonical order ---------- */
(() => {
  const order = [['home', 'হোম'], ['about', 'পরিচিতি'], ['programs', 'শিক্ষা কার্যক্রম'], ['prospectus', 'প্রসপেক্টাস'], ['admissions', 'ভর্তি'], ['notices', 'নোটিশ'], ['calendar', 'ক্যালেন্ডার'], ['faculty', 'শিক্ষকমণ্ডলী'], ['gallery', 'গ্যালারি'], ['results', 'ফলাফল'], ['contact', 'যোগাযোগ']];   // Track & Verify, Services, Careers and Privacy live in the footer
  const nav = App.portals.public.nav;
  nav.splice(0, nav.length, ...order.filter(([id]) => App.portals.public.pages.some(p => p.id === id)));
})();

/* ---------- Public notices: honour expiry, "Website" channel and the new categories; attachments download ---------- */
const PublicNotices = {
  visible() { const t = U.today(); return DB.s.notices.filter(n => (!n.expires || n.expires >= t) && (!n.channels || n.channels.includes('Website')) && (!n.audience || ['Everyone', 'Guardians', 'Students'].includes(n.audience) || n.audience.startsWith('Campus:'))); },
};
Pub.noticeCard = n => {
  const tone = { Academic: 'blue', Exam: 'violet', Holiday: 'green', Admission: 'pink', Fees: 'amber', General: 'slate' }[n.category] || 'slate';
  const dl = n.date ? U.dateLine(n.date, 'notices') : [];   // ফিচার ও সেটিংস → তারিখ প্রদর্শন
  return `<article class="card pub-card p-5 flex flex-col gap-2 hover:shadow-md transition">
    <div class="flex flex-wrap items-center gap-2">${badge(bn(n.category), tone)}${n.pinned ? badge('পিন করা', 'red') : ''}<span class="text-slate-500 ml-auto text-right">${dl.length ? dl.map(esc).join('<br>') : U.fmtDate(n.date)}</span></div>
    <h3 class="font-semibold text-slate-900 leading-snug">${esc(n.title)}</h3><p class="text-sm text-slate-600 line-clamp-3">${esc(n.body)}</p>
    <button class="btn btn-ghost btn-sm self-start mt-1" onclick="${typeof Comms !== 'undefined' ? `Comms.download('${n.id}')` : `Pub.noticePdf('${n.id}')`}">${icon(n.attachment ? 'paperclip' : 'file-down')} ${n.attachment ? esc(n.attachment.fileName) : 'পিডিএফ ডাউনলোড'}</button></article>`;
};
Object.assign(App.portals.public.pages.find(p => p.id === 'notices'), {
  render() {
    const cat = App.ui.noticeCat || 'All', all = PublicNotices.visible();
    const list = all.filter(n => cat === 'All' || n.category === cat).sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date));
    return Pub.wrap(Pub.hero('নোটিশ বোর্ড ও সার্কুলার', 'বিদ্যালয় প্রশাসনের দাপ্তরিক ঘোষণা।') + Pub.section('সার্কুলার', '', `
      <div class="flex flex-wrap gap-2 mb-5">${['All', 'Academic', 'Exam', 'Holiday', 'Admission', 'Fees', 'General'].map(c => `<button class="btn btn-sm ${c === cat ? 'btn-primary' : 'btn-ghost'}" onclick="App.ui.noticeCat='${c}';App.refresh()">${c === 'All' ? 'সকল' : bn(c)} <span class="opacity-60">${bnNum(c === 'All' ? all.length : all.filter(n => n.category === c).length)}</span></button>`).join('')}</div>
      <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">${list.map(Pub.noticeCard).join('') || emptyState('এই শ্রেণিবিভাগে কোনো নোটিশ নেই।')}</div>`));
  },
});

/* ---------- User management: create any user type, delete accounts ---------- */
const Users = {
  create() {
    // Root User → every account type; Principal → teachers, students, guardians and custom types the Root User allows
    const isRoot = App.has('ADMIN'), isPrin = App.has('PRINCIPAL');
    if (!isRoot && !isPrin) return toast('শুধু রুট ব্যবহারকারী ও অধ্যক্ষ নতুন ব্যবহারকারী যোগ করতে পারেন।', 'error');
    const custom = (DB.s.customRoles || []).filter(r => isRoot || r.principalCreates).map(r => r.key);
    // student / guardian accounts can be switched off (ফিচার ও সেটিংস → লগইন ও পাসওয়ার্ড)
    const acctOn = k => typeof Accounts === 'undefined' || Accounts.on(k);
    const roles = [...(isRoot ? ['PRINCIPAL', 'ADMIN'] : []), 'TEACHER', ...(acctOn('student') ? ['STUDENT'] : []), ...(acctOn('guardian') ? ['GUARDIAN'] : []), ...custom].filter(r => ROLES[r]);
    Modal.open({ title: 'ব্যবহারকারীর অ্যাকাউন্ট তৈরি করুন', size: 'lg', body: `<form id="cu" class="grid sm:grid-cols-2 gap-3"><div><label class="label">অ্যাকাউন্টের ধরন</label><select class="select" name="role">${roles.map(r => `<option value="${r}">${ROLES[r].label}</option>`).join('')}</select>${isRoot ? `<button type="button" class="text-brand-700 underline mt-1" onclick="CustomRoles.open()">প্রয়োজনীয় ধরন নেই? নতুন ধরন তৈরি করুন</button>` : ''}</div><div><label class="label">পূর্ণ নাম</label><input class="input" name="name" required></div>${People.fields()}
      <div><label class="label">ব্যবহারকারীর নাম</label><input class="input" name="username" pattern="[a-z0-9_.]{3,20}" required></div><div><label class="label">মোবাইল</label><input class="input" name="phone" pattern="01[3-9][0-9]{8}" required></div><div class="sm:col-span-2"><label class="label">ই-মেইল</label><input type="email" class="input" name="email"></div>
      <div id="cu-extra" class="sm:col-span-2 grid sm:grid-cols-3 gap-3"></div><button class="btn btn-primary sm:col-span-2">${icon('user-plus')} অ্যাকাউন্ট তৈরি করুন</button></form>` });
    const f = $('#cu'), extra = () => {
      const r = f.role.value;
      $('#cu-extra').innerHTML = r === 'STUDENT' ? `<div><label class="label">শ্রেণি</label><select class="select" name="classId">${classOptions('', false, 'ALL')}</select></div><div><label class="label">জন্মতারিখ</label><input type="date" class="input" name="dob" required></div><div><label class="label">অভিভাবকের মোবাইল</label><input class="input" name="guardianPhone" pattern="01[3-9][0-9]{8}" required></div>`
        : r === 'TEACHER' ? `<div><label class="label">ক্যাম্পাস</label><select class="select" name="campusId">${campusOptions(DB.campusId())}</select></div><div><label class="label">বিষয়</label><select class="select" name="subject">${subjectOptions()}</select></div><div><label class="label">বেতন গ্রেড</label><select class="select" name="grade">${Object.keys(DB.s.salaryGrades).map(g => `<option value="${g}">${U.bn(g)}</option>`).join('')}</select></div>`
        : r === 'GUARDIAN' ? `<div class="sm:col-span-3"><label class="label">শিক্ষার্থীর আইডির সঙ্গে সংযুক্ত করুন (কমা দিয়ে আলাদা করুন, ঐচ্ছিক)</label><input class="input" name="students" placeholder="S0012, S0013"></div>` : '';
    };
    f.role.addEventListener('change', extra); extra();
    f.addEventListener('submit', e => {
      e.preventDefault(); const d = formData(f);
      if (DB.s.users.some(u => u.username === d.username)) return toast('এই ব্যবহারকারীর নামটি আগে থেকেই আছে।', 'error');
      const temp = U.tempPw();
      const u = { id: DB.id('U'), name: d.name, username: d.username, email: d.email || '', phone: d.phone, pwHash: U.pw(temp), active: true, createdAt: new Date().toISOString(), createdBy: App.session.userId, photo: null };
      DB.s.users.push(u); DB.s.userRoles.push({ userId: u.id, role: d.role });
      if (d.role === 'TEACHER') { const t = { id: DB.id('T'), userId: u.id, campusId: d.campusId, dept: 'অনির্ধারিত', designation: 'সহকারী শিক্ষক', salaryGrade: d.grade, baseSalary: DB.s.salaryGrades[d.grade], isHead: false, subjects: [d.subject], joinDate: U.today(), status: 'Probation', payoutMethod: 'Bank', payoutAccount: '', qualification: '', showContact: true, overtimeHours: {} }; DB.s.teachers.push(t); DB.s.teacherAbsences[t.id] = {}; }
      if (d.role === 'STUDENT') {
        const c = DB.cls(d.classId), roll = Math.max(0, ...DB.studentsIn(c.id).map(s => s.roll)) + 1;
        const st = { id: DB.id('S'), userId: u.id, name: d.name, classId: c.id, section: c.sections[0] || '', shift: c.shift || '', roll, regNo: `${DB.session()}${c.campusId === 'MAIN' ? 'M' : 'N'}${U.pad(c.grade)}${U.pad(roll, 3)}${U.randStr(1, '0123456789')}`, dob: d.dob, gender: '', blood: '', medical: 'None', emergency: d.guardianPhone, admissionDate: U.today(), previousSchool: '', status: 'active', photo: null, fatherName: '', motherName: '', scholarshipPct: 0 };
        DB.s.students.push(st); DB.s.attendance[st.id] = {};
        let g = DB.s.users.find(x => x.phone === d.guardianPhone && DB.roles(x.id).includes('GUARDIAN'));
        if (!g && !acctOn('guardian')) { st.guardianPhone = d.guardianPhone; } else if (!g) { g = { id: DB.id('U'), name: `Guardian of ${d.name}`, nameBn: `${d.nameBn || d.name}-এর অভিভাবক`, username: `g${d.guardianPhone.slice(-6)}`, email: '', phone: d.guardianPhone, pwHash: U.pw(temp), active: true, createdAt: new Date().toISOString(), createdBy: App.session.userId }; DB.s.users.push(g); DB.s.userRoles.push({ userId: g.id, role: 'GUARDIAN' }); }
        if (g) DB.s.guardianLinks.push({ guardianUserId: g.id, studentId: st.id, relation: 'Guardian' });
      }
      if (d.role === 'GUARDIAN' && d.students) d.students.split(',').map(x => x.trim().toUpperCase()).filter(id => DB.student(id)).forEach(id => DB.s.guardianLinks.push({ guardianUserId: u.id, studentId: id, relation: 'Guardian' }));
      DB.audit('USER_CREATE', 'users', `${d.username} (${bn(d.role)}) তৈরি করা হয়েছে`); DB.save();
      // the login-ID policy (applied by DB.save) may have set the standard ID / password of a student or guardian
      const nu = DB.user(u.id) || u, nst = DB.studentByUser(u.id), shownPw = nu.loginPolicy === 'v1' ? (nst ? String(nst.regNo) : nu.phone) : temp;
      Modal.body(`<div class="text-center space-y-2"><div class="text-emerald-600 font-bold">${icon('check-circle-2', 'w-8 h-8 mx-auto')} ${ROLES[d.role].label} অ্যাকাউন্ট তৈরি করা হয়েছে</div><p class="text-sm"><b>@${esc(nu.username)}</b>-এর এককালীন পাসওয়ার্ড (প্রথম লগইনে বদলাতে হবে)</p><code class="text-lg bg-slate-100 px-3 py-1 rounded">${esc(shownPw)}</code><p class="text-xs text-slate-500">শুধু একবার দেখানো হবে — নিরাপদে পৌঁছে দিন।</p></div>`);
      App.refresh();
    });
  },
  /** Delete a login. Linked records (student/teacher history, payments, audit) are kept for accountability; the account and its roles go. */
  remove(userId) {
    if (!App.perm('system', 'delete')) return toast('আপনার ভূমিকা অ্যাকাউন্ট মুছে ফেলতে পারে না।', 'error');
    const u = DB.user(userId), roles = DB.roles(userId);
    if (userId === App.session.userId) return toast('আপনি নিজের অ্যাকাউন্ট মুছে ফেলতে পারবেন না।', 'error');
    if (roles.includes('ADMIN') && DB.s.userRoles.filter(r => r.role === 'ADMIN').length <= 1) return toast('একমাত্র রুট অ্যাকাউন্ট মুছে ফেলা যাবে না।', 'error');
    if ((roles.includes('PRINCIPAL') || roles.includes('ADMIN')) && !App.has('SUPERADMIN') && !App.has('ADMIN')) return toast('শুধু রুট ব্যবহারকারী অধ্যক্ষ / রুট ব্যবহারকারীর অ্যাকাউন্ট মুছে ফেলতে পারেন।', 'error');
    const st = DB.studentByUser(userId), t = DB.teacherByUser(userId);
    if (!confirm(`@${u.username} (${roles.map(bn).join(', ')}) অ্যাকাউন্টটি স্থায়ীভাবে মুছে ফেলবেন?\n\n${st ? 'শিক্ষার্থীর রেকর্ড সংরক্ষণাগারে রাখা হবে (অবস্থা "মুছে ফেলা"); ফি, ফলাফল ও অডিট লগ অক্ষুণ্ণ থাকবে।' : t ? 'শিক্ষকের রেকর্ড পদত্যাগকৃত হিসেবে চিহ্নিত হবে এবং ভবিষ্যৎ রুটিন থেকে বাদ যাবে; বেতন-ভাতার ইতিহাস সংরক্ষিত থাকবে।' : 'অভিভাবকের সংযোগগুলো অপসারণ করা হবে।'}\n\nএটি আর পূর্বাবস্থায় ফেরানো যাবে না।`)) return;
    DB.s.userRoles = DB.s.userRoles.filter(r => r.userId !== userId);
    DB.s.guardianLinks = DB.s.guardianLinks.filter(l => l.guardianUserId !== userId);
    if (st) st.status = 'deleted';
    if (t) t.status = 'Resigned';
    DB.s.users = DB.s.users.filter(x => x.id !== userId);
    DB.audit('USER_DELETE', 'users', `${u.username} (${roles.map(bn).join(', ')}) মুছে ফেলা হয়েছে`); DB.save(); toast('অ্যাকাউন্ট মুছে ফেলা হয়েছে।', 'success'); App.refresh();
  },
};
// Deleted accounts may leave dangling references (e.g. teacherName on old routine slots); keep lookups safe.
const _teacherName = DB.teacherName.bind(DB);
DB.teacherName = id => { const t = DB.teacher(id); return t && DB.user(t.userId) ? _teacherName(id) : (t ? 'সাবেক শিক্ষক' : '—'); };

/* ---------- Seed fix-ups & daily automation ---------- */
DB.addSeeder('leaveStages', s => { s.serviceRequests.filter(r => r.type === 'Leave' && r.status === 'Pending' && !r.stage).forEach(r => { const st = s.students.find(x => x.id === r.studentId); r.stage = s.classes.find(c => c.id === st.classId)?.classTeacherId ? 'Class Teacher' : 'Principal'; }); return true; });
const _boot = App.boot.bind(App);
App.boot = function () {
  _boot();
  if (DB.s.featureFlags.lateFines !== false && DB.s.meta.lastLateFineRun !== U.today()) { Fees.applyLateFines(true); }
  // Student & teacher dashboards: upcoming exam papers from the exam timetable.
};

/* Upcoming exam papers on student & teacher dashboards */
['student', 'teacher'].forEach(portal => {
  const page = App.portals[portal].pages.find(p => p.id === (portal === 'student' ? 'dashboard' : 'today')), r0 = page.render;
  page.render = function (q) {
    const html = r0.call(this, q), cls = portal === 'student' ? Student.me()?.classId : null;
    const up = Exams.upcoming(45).filter(x => !cls || !x.classIds || x.classIds.includes(cls)).slice(0, 6);
    return up.length ? html + `<div class="card mt-5"><div class="px-5 py-3 border-b border-slate-100 font-semibold flex items-center gap-2">${icon('calendar-clock', 'w-4 h-4 text-brand-600')} আসন্ন পরীক্ষার বিষয়সমূহ</div><div class="divide-y divide-slate-100">${up.map(x => `<div class="px-5 py-2.5 text-sm flex flex-wrap gap-3"><b class="w-28">${U.fmtDate(x.date)}</b><span>${U.bn(x.start)}–${U.bn(x.end)}</span><span class="font-semibold">${DB.subject(x.subjectId)?.name || ''}</span><span class="text-slate-500">${esc(x.exam.name)} · ${esc(x.room)}</span></div>`).join('')}</div></div>` : html;
  };
});

/* ---------- Sidebar groups (collapsible) ----------
   Staff dashboards (Root User and Principal) share one set of groups. Pages added later by other modules
   are placed by id (map), else by their old group name (ALIAS), else in the portal's fallback group.
   Settings → Menus & URLs can still rename, reorder, hide and regroup every page. */
const STAFF_NAV = {
  order: ['ড্যাশবোর্ড', 'প্রতিষ্ঠানের সেটিংস', 'শিক্ষা কার্যক্রম', 'শিক্ষার্থী ব্যবস্থাপনা', 'শিক্ষক ব্যবস্থাপনা', 'পরীক্ষা ও ফলাফল', 'প্রশাসন', 'অর্থ ও হিসাব', 'মানবসম্পদ', 'অন্যান্য পরিষেবা', 'সিস্টেম', 'ওয়েবসাইট'],
  fallback: 'প্রতিষ্ঠানের সেটিংস',
  map: {
    onboarding: 'ড্যাশবোর্ড', system: 'সিস্টেম', overview: 'ড্যাশবোর্ড', mis: 'ড্যাশবোর্ড', finance: 'অর্থ ও হিসাব',
    // শিক্ষার্থী ব্যবস্থাপনা — in this order in the sidebar (old ids are hidden redirects, students.js)
    admission: 'শিক্ষার্থী ব্যবস্থাপনা', 'admission-test': 'শিক্ষার্থী ব্যবস্থাপনা', promotion: 'শিক্ষার্থী ব্যবস্থাপনা', students: 'শিক্ষার্থী ব্যবস্থাপনা', 'student-analytics': 'শিক্ষার্থী ব্যবস্থাপনা', biometric: 'শিক্ষার্থী ব্যবস্থাপনা',
    dossier: 'শিক্ষার্থী ব্যবস্থাপনা', admissions: 'শিক্ষার্থী ব্যবস্থাপনা', risk: 'শিক্ষার্থী ব্যবস্থাপনা', 'attendance-analytics': 'শিক্ষার্থী ব্যবস্থাপনা',
    services: 'প্রশাসন',
    routine: 'শিক্ষা কার্যক্রম', curriculum: 'শিক্ষা কার্যক্রম', 'subject-pick': 'শিক্ষা কার্যক্রম', 'syllabus-monitor': 'শিক্ষা কার্যক্রম', 'syllabus-book': 'শিক্ষা কার্যক্রম', clone: 'শিক্ষা কার্যক্রম',
    // শিক্ষক ব্যবস্থাপনা — teacher list, assignments, advisors, proxy, presence confirmation, performance
    faculty: 'শিক্ষক ব্যবস্থাপনা', advisors: 'শিক্ষক ব্যবস্থাপনা', proxy: 'শিক্ষক ব্যবস্থাপনা', 'staff-confirm': 'শিক্ষক ব্যবস্থাপনা', performance: 'শিক্ষক ব্যবস্থাপনা',
    calendar: 'প্রশাসন',
    // পরীক্ষা ও ফলাফল — in this order in the sidebar (old ids are hidden redirects, examplan.js)
    exams: 'পরীক্ষা ও ফলাফল', 'exam-syllabus': 'পরীক্ষা ও ফলাফল', 'seat-plan': 'পরীক্ষা ও ফলাফল', qbank: 'পরীক্ষা ও ফলাফল', 'online-tests': 'পরীক্ষা ও ফলাফল', papers: 'পরীক্ষা ও ফলাফল', 'exam-attendance': 'পরীক্ষা ও ফলাফল', omr: 'পরীক্ষা ও ফলাফল', 'exam-results': 'পরীক্ষা ও ফলাফল', 'marks-entry': 'পরীক্ষা ও ফলাফল', 'mark-sheet': 'পরীক্ষা ও ফলাফল', semester: 'পরীক্ষা ও ফলাফল', results: 'পরীক্ষা ও ফলাফল', 'public-results': 'পরীক্ষা ও ফলাফল', pubresult: 'পরীক্ষা ও ফলাফল',
    accounts: 'অর্থ ও হিসাব', 'fee-structure': 'অর্থ ও হিসাব', fees: 'অর্থ ও হিসাব', ledger: 'অর্থ ও হিসাব', statements: 'অর্থ ও হিসাব', coa: 'অর্থ ও হিসাব', reconcile: 'অর্থ ও হিসাব', installments: 'অর্থ ও হিসাব',
    staff: 'মানবসম্পদ', 'support-staff': 'মানবসম্পদ', recruitment: 'মানবসম্পদ', payroll: 'মানবসম্পদ', 'staff-attendance': 'মানবসম্পদ',
    notices: 'প্রশাসন', library: 'অন্যান্য পরিষেবা', transport: 'অন্যান্য পরিষেবা', hostel: 'অন্যান্য পরিষেবা',
    messaging: 'সিস্টেম', messages: 'সিস্টেম', gateways: 'সিস্টেম', sos: 'সিস্টেম',
    website: 'ওয়েবসাইট',
    'set-basic': 'প্রতিষ্ঠানের সেটিংস', 'set-design': 'প্রতিষ্ঠানের সেটিংস', 'set-academic': 'প্রতিষ্ঠানের সেটিংস', 'set-subjects': 'প্রতিষ্ঠানের সেটিংস', 'set-rooms': 'প্রতিষ্ঠানের সেটিংস','set-features': 'প্রতিষ্ঠানের সেটিংস', 'set-access': 'প্রতিষ্ঠানের সেটিংস', 'set-achievements': 'প্রতিষ্ঠানের সেটিংস',
    settings: 'প্রতিষ্ঠানের সেটিংস', 'inst-achievements': 'প্রতিষ্ঠানের সেটিংস', 'print-studio': 'প্রতিষ্ঠানের সেটিংস',
    'user-admin': 'সিস্টেম', database: 'সিস্টেম', audit: 'সিস্টেম', maintenance: 'সিস্টেম',
  },
};
const NAV_GROUPS = {
  admin: STAFF_NAV,
  principal: STAFF_NAV,
  teacher: { order: ['আমার দিন', 'শ্রেণিকক্ষ', 'পরীক্ষা ও ফলাফল', 'আরও'], fallback: 'আরও',
    map: { today: 'আমার দিন', 'staff-confirm': 'আমার দিন', 'my-students': 'আমার দিন', 'my-class': 'আমার দিন', 'my-attendance': 'আমার দিন', 'my-profile': 'আমার দিন', attendance: 'শ্রেণিকক্ষ', homework: 'শ্রেণিকক্ষ', materials: 'শ্রেণিকক্ষ', syllabus: 'শ্রেণিকক্ষ', 'curriculum-edit': 'শ্রেণিকক্ষ', 'syllabus-book': 'শ্রেণিকক্ষ', planner: 'শ্রেণিকক্ষ', conduct: 'শ্রেণিকক্ষ', gradebook: 'পরীক্ষা ও ফলাফল', exams: 'পরীক্ষা ও ফলাফল', 'online-tests': 'পরীক্ষা ও ফলাফল', 'exam-attendance': 'পরীক্ষা ও ফলাফল', 'mark-sheet': 'পরীক্ষা ও ফলাফল', omr: 'পরীক্ষা ও ফলাফল', 'recheck-review': 'পরীক্ষা ও ফলাফল', calendar: 'আরও', admissions: 'আরও', leave: 'আরও', 'fee-structure': 'আরও' } },
  student: { order: ['আমার পাতা', 'পড়াশোনা', 'ফি ও সেবা'], fallback: 'পড়াশোনা',
    map: { dashboard: 'আমার পাতা', profile: 'আমার পাতা', idcard: 'আমার পাতা', attendance: 'আমার পাতা', timetable: 'পড়াশোনা', homework: 'পড়াশোনা', materials: 'পড়াশোনা', 'syllabus-book': 'পড়াশোনা', exams: 'পড়াশোনা', 'online-test': 'পড়াশোনা', recheck: 'পড়াশোনা', calendar: 'পড়াশোনা', fees: 'ফি ও সেবা', 'fee-structure': 'ফি ও সেবা', services: 'ফি ও সেবা', logistics: 'ফি ও সেবা' } },
  guardian: { order: ['সন্তান', 'পড়াশোনা', 'ফি ও সেবা', 'যোগাযোগ'], fallback: 'পড়াশোনা',
    map: { overview: 'সন্তান', profile: 'সন্তান', idcards: 'সন্তান', conduct: 'সন্তান', academics: 'পড়াশোনা', homework: 'পড়াশোনা', 'syllabus-book': 'পড়াশোনা', exams: 'পড়াশোনা', 'online-test': 'পড়াশোনা', recheck: 'পড়াশোনা', materials: 'পড়াশোনা', calendar: 'পড়াশোনা', fees: 'ফি ও সেবা', 'fee-structure': 'ফি ও সেবা', services: 'ফি ও সেবা', logistics: 'ফি ও সেবা', ptc: 'যোগাযোগ', feedback: 'যোগাযোগ' } },
};
/** Old built-in group names → the new ones (pages added by modules beside an old neighbour, saved menu settings). */
const NAV_ALIAS = { 'প্রতিষ্ঠান': 'প্রতিষ্ঠানের সেটিংস', 'প্রতিষ্ঠান ও সেটিংস': 'প্রতিষ্ঠানের সেটিংস', 'সারসংক্ষেপ': 'ড্যাশবোর্ড', 'শুরু করুন': 'ড্যাশবোর্ড', 'ভর্তি': 'শিক্ষার্থী ব্যবস্থাপনা', 'শিক্ষার্থী': 'শিক্ষার্থী ব্যবস্থাপনা', 'অর্থ ও ফি': 'অর্থ ও হিসাব', 'অর্থ': 'অর্থ ও হিসাব', 'মানবসম্পদ ও বেতন-ভাতা': 'মানবসম্পদ', 'কর্মী ও মানবসম্পদ': 'মানবসম্পদ', 'উপস্থিতি': 'মানবসম্পদ', 'মুদ্রণ': 'প্রতিষ্ঠানের সেটিংস', 'সিস্টেম ও নিরাপত্তা': 'সিস্টেম', 'একাডেমিক': 'শিক্ষা কার্যক্রম', 'ক্যাম্পাস সেবা': 'প্রশাসন', 'যোগাযোগ': 'প্রশাসন', 'শিক্ষক': 'শিক্ষক ব্যবস্থাপনা' };
/** Sidebar group of a page in a portal (built-in default; menu settings may override it). */
function navGroupOf(portal, p) {
  const g = NAV_GROUPS[portal]; if (!g) return p.group;
  if (g.map[p.id]) return g.map[p.id];
  const old = p._group0 || p.group;
  if (old && g.order.includes(old)) return old;
  if (old && NAV_ALIAS[old] && g.order.includes(NAV_ALIAS[old])) return NAV_ALIAS[old];
  return g.fallback;
}
/** Root User = everything: every Principal page is also on the Root User's dashboard (no duplicates).
    Runs once, after every module has registered its pages (Menus.snapshot, first render). */
function navMergeRoot() {
  const A = App.portals.admin, P = App.portals.principal; if (!A || !P || A._merged) return; A._merged = true;
  P.pages.forEach(p => { if (!A.pages.some(x => x.id === p.id)) A.pages.push(p); });
}
Object.entries(NAV_GROUPS).forEach(([portal, g]) => {
  const P = App.portals[portal]; if (!P) return; P.groupOrder = [...g.order];
  P.pages.forEach(p => { if (p._group0 === undefined) p._group0 = p.group || null; p.group = navGroupOf(portal, p); });
});