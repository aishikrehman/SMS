/* ==========================================================================
   TEACHER PRESENCE GATE · HOMEWORK EVALUATION POLICY · ASSIGNMENT WIRING
   (load after school.js — the last module before App.boot())

   1. A teacher whose presence is not recorded by the biometric / RFID device today
      may take roll-call only after the Principal (or a delegated confirmer) confirms
      the teacher is present. Switchable; exception list; delegated confirmers.
        DB.s.config.staffGate = { on, exempt:[teacherId], confirmers:[userId] }
        DB.s.staffConfirms    = [{id, teacherId, date, by, at, prevMark}]   (also marks the staff register 'P')
        DB.s.staffConfirmReqs = [{id, teacherId, date, at, status:'Pending'|'Done'}]
   2. Homework evaluation policy (HwEval in teacher.js): Principal dashboard card + Root User settings,
      student homework desk / feedback and a guardian homework page show marks and/or grade.
   3. Teaching assignments (Teacher.pairs): syllabus tracker + class → subject lists in teacher forms.
   ========================================================================== */

const StaffGate = {
  cfg() { const c = DB.s.config || (DB.s.config = {}); const g = c.staffGate || (c.staffGate = { on: false, exempt: [], confirmers: [] }); g.exempt = g.exempt || []; g.confirmers = g.confirmers || []; return g; },
  on() { return !!this.cfg().on; },
  exempt(tid) { return this.cfg().exempt.includes(tid); },
  confirms() { return DB.s.staffConfirms || (DB.s.staffConfirms = []); },
  requests() { return DB.s.staffConfirmReqs || (DB.s.staffConfirmReqs = []); },
  pendingReq(tid, date = U.today()) { return this.requests().find(r => r.teacherId === tid && r.date === date && r.status === 'Pending') || null; },
  /** Presence of a teacher today: biometric check-in → confirmation → register mark. */
  status(t, date = U.today()) {
    if (!t) return { ok: true, kind: 'none' };
    const io = Attendance.biometricIn(t.id, date); if (io) return { ok: true, kind: 'bio', io };
    const c = Attendance.confirmOf(t.id, date); if (c) return { ok: true, kind: 'confirmed', c };
    const m = Attendance.staffMark(t.id, date);
    if (m === 'P' || m === 'L') return { ok: true, kind: 'register', m };
    return { ok: false, kind: 'none', m };
  },
  /** Is roll-call locked for this teacher right now? */
  locked(t = typeof Teacher !== 'undefined' ? Teacher.me() : null) { if (!this.on() || !t || this.exempt(t.id)) return false; return !this.status(t).ok; },
  isBoss(uid = App.session?.userId) { const r = uid ? DB.roles(uid) : []; return r.includes('PRINCIPAL') || r.includes('ADMIN'); },
  canConfirm(uid = App.session?.userId) { return !!uid && (this.isBoss(uid) || this.cfg().confirmers.includes(uid)); },
  /** Users who may confirm (for messages): principals + delegated confirmers. */
  confirmerUsers() { return [...new Set([...DB.s.userRoles.filter(r => r.role === 'PRINCIPAL').map(r => r.userId), ...this.cfg().confirmers])].map(id => DB.user(id)).filter(u => u?.active !== false && u); },
  teachersToday(campus = DB.campusId()) { return DB.teachersIn(campus).filter(t => t.status !== 'Resigned'); },
  onLeave(tid, date = U.today()) { return DB.s.leaves.find(l => l.teacherId === tid && l.status === 'Approved' && date >= l.from && date <= l.to); },

  /* ---- actions ---- */
  confirm(tid) {
    const t = DB.teacher(tid), date = U.today();
    if (!t || !this.canConfirm()) return toast('উপস্থিতি নিশ্চিত করার অনুমতি আপনার নেই।', 'error');
    if (t.userId === App.session.userId && !this.isBoss()) return toast('নিজের উপস্থিতি নিজে নিশ্চিত করা যায় না।', 'error');
    if (Attendance.confirmOf(tid, date)) return toast('ইতোমধ্যে নিশ্চিত করা হয়েছে।');
    const prev = Attendance.staffMark(tid, date);
    this.confirms().push({ id: DB.id('SC'), teacherId: tid, date, by: App.session.userId, at: new Date().toISOString(), prevMark: prev });
    if (prev !== 'P' && prev !== 'L') Attendance.setStaffMark(tid, date, 'P');
    this.requests().filter(r => r.teacherId === tid && r.date === date && r.status === 'Pending').forEach(r => { r.status = 'Done'; r.doneBy = App.session.userId; });
    const u = DB.user(t.userId); if (u?.phone) DB.sms(u.phone, `${DB.s.school.shortName}: আজ (${U.fmtDate(date)}) আপনার উপস্থিতি নিশ্চিত করা হয়েছে — এখন শ্রেণির হাজিরা নিতে পারবেন।`, 'Push');
    DB.audit('STAFF_PRESENCE_CONFIRM', 'staff_attendance', `${DB.teacherName(tid)} ${date}: উপস্থিতি নিশ্চিত করেছেন ${pn(App.user())}`); DB.save();
    toast(`${DB.teacherName(tid)}-এর উপস্থিতি নিশ্চিত হয়েছে; কর্মী রেজিস্টারে উপস্থিত চিহ্নিত।`, 'success'); App.refresh();
  },
  undo(tid) {
    const date = U.today(), c = Attendance.confirmOf(tid, date); if (!c || !this.canConfirm()) return;
    if (!confirm(`${DB.teacherName(tid)}-এর আজকের নিশ্চিতকরণ বাতিল করবেন? কর্মী রেজিস্টারের আগের চিহ্ন ফিরে আসবে।`)) return;
    DB.s.staffConfirms = this.confirms().filter(x => x !== c);
    Attendance.setStaffMark(tid, date, c.prevMark || null);
    DB.audit('STAFF_PRESENCE_UNDO', 'staff_attendance', `${DB.teacherName(tid)} ${date}: নিশ্চিতকরণ বাতিল করেছেন ${pn(App.user())}`); DB.save();
    toast('নিশ্চিতকরণ বাতিল করা হয়েছে।', 'warn'); App.refresh();
  },
  request() {
    const t = Teacher.me(), date = U.today(); if (!t) return;
    const old = this.pendingReq(t.id, date);
    if (old) old.at = new Date().toISOString(); else this.requests().push({ id: DB.id('SCR'), teacherId: t.id, date, at: new Date().toISOString(), status: 'Pending' });
    this.confirmerUsers().filter(u => u.id !== t.userId).forEach(u => u.phone && DB.sms(u.phone, `${DB.s.school.shortName}: ${DB.teacherName(t.id)} আজ (${U.fmtDate(date)}) উপস্থিত আছেন বলে জানিয়েছেন — বায়োমেট্রিক রেকর্ড নেই। অনুগ্রহ করে "শিক্ষক উপস্থিতি নিশ্চিতকরণ" পাতায় নিশ্চিত করুন।`, 'Push'));
    DB.audit('STAFF_PRESENCE_REQUEST', 'staff_attendance', `${DB.teacherName(t.id)} ${date}: নিশ্চিতকরণের অনুরোধ${old ? ' (পুনরায়)' : ''}`); DB.save();
    toast(old ? 'অনুরোধটি আবার পাঠানো হয়েছে।' : 'নিশ্চিতকরণের অনুরোধ পাঠানো হয়েছে।', 'success'); App.refresh();
  },
  saveCfg(form) {
    if (!this.isBoss()) return toast('কেবল অধ্যক্ষ বা রুট ব্যবহারকারী এই নিয়ম পরিবর্তন করতে পারেন।', 'error');
    const g = this.cfg(), here = new Set(this.teachersToday().map(t => t.id)), hereU = new Set(this.teachersToday().map(t => t.userId));
    const pick = n => $$(`input[name="${n}"]:checked`, form).map(i => i.value);
    g.on = form.querySelector('[name=gateOn]').value === 'on';
    g.exempt = [...g.exempt.filter(id => !here.has(id)), ...pick('exempt')];
    g.confirmers = [...g.confirmers.filter(id => !hereU.has(id)), ...pick('confirmer')];
    DB.audit('STAFF_GATE_SETTINGS', 'staff_attendance', `নিয়ম ${g.on ? 'চালু' : 'বন্ধ'} · ব্যতিক্রম ${g.exempt.length} জন · নিশ্চিতকারী ${g.confirmers.length} জন`); DB.save();
    toast('শিক্ষক উপস্থিতি নিশ্চিতকরণের সেটিংস সংরক্ষিত হয়েছে।', 'success'); App.refresh();
  },
  saveHw(form) {
    if (!this.isBoss()) return toast('কেবল অধ্যক্ষ বা রুট ব্যবহারকারী এই নীতি পরিবর্তন করতে পারেন।', 'error');
    const d = formData(form), c = HwEval.cfg();
    if (HwEval.MODES.some(m => m[0] === d.hwMode)) c.mode = d.hwMode;
    if (+d.hwFull > 0) c.full = Math.min(1000, +d.hwFull);
    DB.audit('HOMEWORK_POLICY', 'homework', `মূল্যায়ন: ${HwEval.label(c.mode)} · পূর্ণমান ${c.full}`); DB.save();
    toast('বাড়ির কাজ মূল্যায়ন নীতি সংরক্ষিত হয়েছে।', 'success'); App.refresh();
  },

  /* ---- UI ---- */
  bioText(t, date = U.today()) {
    const io = Attendance.biometricIn(t.id, date);
    return io ? badge(`বায়োমেট্রিক প্রবেশ ${U.bn(io.in)}`, Attendance.isLate(io.in, 'staff', t) ? 'amber' : 'green') : badge('বায়োমেট্রিক রেকর্ড নেই', 'slate');
  },
  confirmerNames() { return this.confirmerUsers().map(u => pn(u)).join(', ') || 'অধ্যক্ষ'; },
  lockHtml() {
    const t = Teacher.me(), st = this.status(t), req = this.pendingReq(t.id);
    return pageHeader('হাজিরা খাতা', '')
      + `<div class="card p-6 border-amber-300 bg-amber-50 text-amber-900 max-w-2xl"><div class="flex items-start gap-3">${icon('lock', 'w-8 h-8 shrink-0')}<div class="space-y-2">
        <h2 class="text-lg font-bold">হাজিরা খাতা আপাতত বন্ধ আছে</h2>
        <p>আজ (${U.fmtDate(U.today())}) বায়োমেট্রিক ডিভাইসে আপনার উপস্থিতি রেকর্ড হয়নি।</p>
        ${st.m === 'A' || st.m === 'E' ? `<p class="font-semibold">কর্মী রেজিস্টারে আজ আপনাকে “${Attendance.LABEL[st.m]}” হিসেবে চিহ্নিত করা আছে।</p>` : ''}
        <p>নিশ্চিত করতে পারেন: <b>${esc(this.confirmerNames())}</b></p>
        <div class="flex flex-wrap items-center gap-2 pt-1"><button class="btn btn-primary" onclick="StaffGate.request()">${icon('send')} ${req ? 'আবার অনুরোধ পাঠান' : 'নিশ্চিতকরণের অনুরোধ পাঠান'}</button>${req ? badge(`অনুরোধ পাঠানো হয়েছে ${U.bn(U.fmtTime(req.at).split(' ').pop())}`, 'blue') : ''}<button class="btn btn-ghost" onclick="App.refresh()">${icon('refresh-cw')} অবস্থা হালনাগাদ করুন</button></div></div></div></div>`;
  },
  /** Banner on the teacher's "আমার দিন" page. */
  teacherBanner() {
    const t = Teacher.me(); if (!t) return '';
    let h = '';
    if (this.locked(t)) h += `<div class="card p-4 mb-4 border-amber-300 bg-amber-50 text-amber-900 flex flex-wrap items-center gap-3">${icon('lock', 'w-5 h-5')}<div class="flex-1 min-w-[200px]">বায়োমেট্রিকে আজ আপনার উপস্থিতি রেকর্ড হয়নি — নিশ্চিত না হওয়া পর্যন্ত হাজিরা নেওয়া যাবে না।</div><button class="btn btn-primary btn-sm" onclick="StaffGate.request()">${icon('send')} ${this.pendingReq(t.id) ? 'আবার অনুরোধ পাঠান' : 'নিশ্চিতকরণের অনুরোধ পাঠান'}</button></div>`;
    if (this.canConfirm() && !this.isBoss()) {
      const n = this.waiting().length;
      if (n) h += `<div class="card p-4 mb-4 border-blue-200 bg-blue-50 text-blue-900 flex flex-wrap items-center gap-3">${icon('user-check', 'w-5 h-5')}<div class="flex-1 min-w-[200px]">${bnNum(n)} জন শিক্ষকের আজকের উপস্থিতি নিশ্চিতকরণের অপেক্ষায়।</div><button class="btn btn-ghost btn-sm" onclick="App.go('teacher','staff-confirm')">${icon('arrow-right')} নিশ্চিত করুন</button></div>`;
    }
    return h;
  },
  /** Teachers of the campus still without biometric / confirmation today (requests first). */
  waiting(campus = DB.campusId()) { return this.teachersToday(campus).filter(t => !this.exempt(t.id) && !this.status(t).ok && !this.onLeave(t.id)).sort((a, b) => !!this.pendingReq(b.id) - !!this.pendingReq(a.id)); },
  row(t) {
    const u = DB.user(t.userId), st = this.status(t), req = this.pendingReq(t.id), lv = this.onLeave(t.id), self = t.userId === App.session.userId && !this.isBoss();
    const by = st.kind === 'confirmed' ? DB.user(st.c.by) : null;
    const act = st.kind === 'confirmed' ? `${badge('নিশ্চিত', 'green')}<span class="text-slate-500">${esc(pn(by) || '')} · ${U.bn(U.fmtTime(st.c.at).split(' ').pop())}</span><button class="btn btn-ghost btn-sm" onclick="StaffGate.undo('${t.id}')">${icon('undo-2')} বাতিল</button>`
      : st.kind === 'bio' ? `<span class="text-emerald-700">${icon('check-circle-2', 'w-4 h-4 inline')} নিশ্চিতকরণের প্রয়োজন নেই</span>`
      : self ? '<span class="text-slate-500">নিজের উপস্থিতি নিজে নিশ্চিত করা যায় না</span>'
      : `<button class="btn btn-primary btn-sm" onclick="StaffGate.confirm('${t.id}')">${icon('check')} উপস্থিত — নিশ্চিত করুন</button>${st.kind === 'register' ? `<span class="text-slate-500">(রেজিস্টারে ${Attendance.LABEL[st.m]})</span>` : ''}`;
    return `<div class="px-4 py-3 flex flex-wrap items-center gap-3 ${req && !st.ok ? 'bg-amber-50' : ''}">${avatar(u, 36)}<div class="flex-1 min-w-[180px]"><div class="font-semibold">${esc(pn(u))}</div><div class="text-slate-500">${esc(bn(t.designation))} · ${esc(Teacher.assignSummary(t))}</div>
      <div class="flex flex-wrap gap-1.5 mt-1">${this.bioText(t)}${this.exempt(t.id) ? badge('ব্যতিক্রম — নিয়ম প্রযোজ্য নয়', 'violet') : ''}${lv ? badge(`অনুমোদিত ${bn(lv.type)}`, 'violet') : ''}${st.m === 'A' || st.m === 'E' ? badge(`রেজিস্টারে ${Attendance.LABEL[st.m]}`, 'red') : ''}${req && !st.ok ? badge(`অনুরোধ পাঠিয়েছেন ${U.bn(U.fmtTime(req.at).split(' ').pop())}`, 'amber') : ''}</div></div>
      <div class="flex flex-wrap items-center gap-2">${act}</div></div>`;
  },
  settingsHtml() {
    const g = this.cfg(), ts = this.teachersToday();
    const chk = (name, val, on, label) => `<label class="flex items-center gap-2 py-1 cursor-pointer"><input type="checkbox" class="w-5 h-5 accent-[var(--brand)]" name="${name}" value="${val}" ${on ? 'checked' : ''}> ${esc(label)}</label>`;
    return `<form class="card p-5 space-y-4" onsubmit="StaffGate.saveCfg(this);return false"><div class="font-semibold">${icon('settings-2', 'w-5 h-5 inline')} নিয়মের সেটিংস · ${esc(DB.campus().name)}</div>
      <div><label class="label">নিয়মটি</label><select class="select" name="gateOn"><option value="on" ${g.on ? 'selected' : ''}>চালু — বায়োমেট্রিক না থাকলে নিশ্চিতকরণ লাগবে</option><option value="off" ${g.on ? '' : 'selected'}>বন্ধ — সবাই সরাসরি হাজিরা নিতে পারবেন</option></select></div>
      <div class="grid sm:grid-cols-2 gap-4"><div><div class="label">ব্যতিক্রম (এঁদের জন্য নিয়ম প্রযোজ্য নয়)</div><div class="max-h-72 overflow-y-auto border border-slate-200 rounded-lg px-3 py-1">${ts.map(t => chk('exempt', t.id, g.exempt.includes(t.id), DB.teacherName(t.id))).join('')}</div></div>
        <div><div class="label">নিশ্চিত করার দায়িত্বপ্রাপ্ত (অধ্যক্ষ ছাড়াও)</div><div class="max-h-72 overflow-y-auto border border-slate-200 rounded-lg px-3 py-1">${ts.filter(t => !DB.roles(t.userId).includes('PRINCIPAL')).map(t => chk('confirmer', t.userId, g.confirmers.includes(t.userId), DB.teacherName(t.id))).join('')}</div></div></div>
      <button class="btn btn-primary">${icon('save')} সেটিংস সংরক্ষণ করুন</button></form>`;
  },
  pageRender() {
    const ui = App.ui.sg || (App.ui.sg = { f: 'all' }), ts = this.teachersToday(), today = U.today();
    const stat = ts.map(t => ({ t, st: this.status(t) }));
    const bio = stat.filter(x => x.st.kind === 'bio').length, conf = stat.filter(x => x.st.kind === 'confirmed').length, wait = this.waiting(), reqs = ts.filter(t => this.pendingReq(t.id) && !this.status(t).ok).length;
    const rank = t => { const s = this.status(t); return this.pendingReq(t.id) && !s.ok ? 0 : !s.ok ? 1 : s.kind === 'confirmed' ? 2 : s.kind === 'register' ? 3 : 4; };
    const list = (ui.f === 'wait' ? wait : ts).slice().sort((a, b) => rank(a) - rank(b) || DB.teacherName(a.id).localeCompare(DB.teacherName(b.id)));
    return pageHeader('শিক্ষক উপস্থিতি নিশ্চিতকরণ', `${esc(DB.campus().name)} · ${U.dayBn(new Date())} ${U.fmtDate(today)}`,this.on() ? badge('নিয়ম চালু', 'green') : badge('নিয়ম বন্ধ', 'slate'))
      + (U.isSchoolDay(today, null, DB.campusId()) ? '' : `<div class="card p-4 mb-4 bg-amber-50 border-amber-200 text-amber-800">আজ এই ক্যাম্পাসে কার্যদিবস নয়।</div>`)
      + `<div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">${kpi('শিক্ষক', bnNum(ts.length), esc(DB.campus().name), 'users', 'blue')}${kpi('বায়োমেট্রিকে উপস্থিত', bnNum(bio), 'ডিভাইসের রেকর্ড', 'scan-line', 'green')}${kpi('নিশ্চিত করা হয়েছে', bnNum(conf), 'আজ', 'badge-check', 'violet')}${kpi('অপেক্ষমাণ', bnNum(wait.length), `${bnNum(reqs)}টি অনুরোধ`, 'hourglass', 'amber')}</div>
      <div class="mb-3">${pills([['all', 'সকল শিক্ষক', 'users'], ['wait', `অপেক্ষমাণ (${bnNum(wait.length)})`, 'hourglass']], ui.f, id => `App.ui.sg.f='${id}';App.refresh()`)}</div>
      <div class="card mb-5"><div class="divide-y divide-slate-100">${list.map(t => this.row(t)).join('') || emptyState(ui.f === 'wait' ? 'কেউ অপেক্ষমাণ নেই।' : 'কোনো শিক্ষক নেই।', 'user-check')}</div></div>`
      + (this.isBoss() ? this.settingsHtml() : '');
  },
  page(portal) {
    return {
      id: 'staff-confirm', label: 'শিক্ষক উপস্থিতি নিশ্চিতকরণ', icon: 'badge-check', module: 'attendance',
      group: portal === 'teacher' ? 'আমার দিন' : 'উপস্থিতি',
      when: portal === 'teacher' ? () => StaffGate.canConfirm() : undefined,
      count: () => (StaffGate.on() && StaffGate.canConfirm() ? StaffGate.waiting().filter(t => StaffGate.pendingReq(t.id)).length : 0) || '',
      render() { return StaffGate.pageRender(); },
    };
  },
  /** Cards on the Principal's overview: today's confirmations + homework evaluation policy. */
  principalCards() {
    const wait = this.waiting(), c = HwEval.cfg();
    return `<div class="grid lg:grid-cols-2 gap-5 mt-5">
      <div class="card"><div class="px-5 py-3 border-b border-slate-100 font-semibold flex flex-wrap items-center gap-2">শিক্ষক উপস্থিতি নিশ্চিতকরণ ${this.on() ? badge('নিয়ম চালু', 'green') : badge('নিয়ম বন্ধ', 'slate')}<a href="${App.href('principal', 'staff-confirm')}" class="ml-auto text-brand-600">সব দেখুন ও সেটিংস</a></div>
        <div class="divide-y divide-slate-100">${wait.slice(0, 5).map(t => `<div class="px-5 py-3 flex flex-wrap items-center gap-3"><div class="flex-1 min-w-[160px]"><div class="font-semibold">${esc(DB.teacherName(t.id))}</div><div class="flex flex-wrap gap-1 mt-1">${this.bioText(t)}${this.pendingReq(t.id) ? badge('অনুরোধ পাঠিয়েছেন', 'amber') : ''}</div></div><button class="btn btn-primary btn-sm" onclick="StaffGate.confirm('${t.id}')">${icon('check')} নিশ্চিত করুন</button></div>`).join('') || emptyState('আজ সকল শিক্ষকের উপস্থিতি রেকর্ড বা নিশ্চিত আছে।', 'user-check')}</div></div>
      <form class="card p-5 space-y-3 self-start" onsubmit="StaffGate.saveHw(this);return false"><div class="font-semibold">বাড়ির কাজ মূল্যায়ন নীতি</div>        <div class="grid sm:grid-cols-2 gap-3"><div><label class="label">মূল্যায়ন পদ্ধতি</label><select class="select" name="hwMode">${HwEval.MODES.map(([v, l]) => `<option value="${v}" ${v === HwEval.mode() ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div><label class="label">ডিফল্ট পূর্ণমান</label><input class="input" type="number" min="1" max="1000" name="hwFull" value="${HwEval.full()}"></div></div>
        <button class="btn btn-primary">${icon('save')} নীতি সংরক্ষণ করুন</button></form></div>`;
  },
};

/* ---------- pages ---------- */
App.addPage('principal', StaffGate.page('principal'), 'staff-attendance');
App.addPage('admin', StaffGate.page('admin'), 'staff-attendance');
App.addPage('teacher', StaffGate.page('teacher'), 'today');

/* ---------- Root User settings (Settings → বৈশিষ্ট্য ও সেটিংস) ---------- */
if (typeof FeatureCfg !== 'undefined') {
  FeatureCfg.PARAMS['শিক্ষক উপস্থিতি নিশ্চিতকরণ'] = [
    { k: 'sgOn', label: 'বায়োমেট্রিক না থাকলে হাজিরার আগে নিশ্চিতকরণ', type: 'select', options: [['off', 'বন্ধ'], ['on', 'চালু']], get: () => StaffGate.on() ? 'on' : 'off', set: v => (StaffGate.cfg().on = v === 'on') },
  ];
  FeatureCfg.PARAMS['বাড়ির কাজ মূল্যায়ন'] = [
    { k: 'hwMode', label: 'মূল্যায়ন পদ্ধতি', type: 'select', options: HwEval.MODES, get: () => HwEval.mode(), set: v => { if (HwEval.MODES.some(m => m[0] === v)) HwEval.cfg().mode = v; } },
    { k: 'hwFull', label: 'ডিফল্ট পূর্ণমান', type: 'number', get: () => HwEval.full(), set: v => { if (+v > 0) HwEval.cfg().full = Math.min(1000, +v); } },
  ];
}

/* ---------- Student: homework desk + feedback show marks / grade per policy ---------- */
if (typeof Student !== 'undefined') {
  Student.viewFeedback = function (subId) {
    const s = DB.s.submissions.find(x => x.id === subId), hw = DB.s.homework.find(h => h.id === s.homeworkId);
    Modal.open({ title: `মূল্যায়ন মন্তব্য · ${esc(hw.title)}`, size: 'lg', body: `<div class="flex flex-wrap items-center gap-2 mb-3">${badge(HwEval.fmt(s, hw), 'green')}<span class="text-slate-600">${esc(s.feedback || '')}</span></div>${s.annotatedUrl ? `<img src="${s.annotatedUrl}" class="w-full rounded-xl border" alt="মূল্যায়িত খাতা">` : '<p class="text-slate-500">কোনো চিহ্নিত ছবি নেই।</p>'}` });
  };
  const hwPage = App.portals.student?.pages.find(p => p.id === 'homework');
  if (hwPage) hwPage.render = function () {
    const st = Student.me(); if (!st) return emptyState('এই অ্যাকাউন্টের সঙ্গে কোনো শিক্ষার্থীর তথ্য সংযুক্ত নেই।');
    const list = DB.s.homework.filter(h => h.classId === st.classId).sort((a, b) => b.due.localeCompare(a.due));
    return pageHeader('ডিজিটাল বাড়ির কাজ জমাদান ডেস্ক', '')
      + `<div class="grid md:grid-cols-2 gap-4">${list.map(h => {
        const sub = DB.s.submissions.find(s => s.homeworkId === h.id && s.studentId === st.id), late = h.due < U.today();
        return `<div class="card p-5"><div class="flex items-start gap-2"><div class="flex-1"><div class="font-semibold">${esc(h.title)}</div><div class="text-slate-500">${DB.subject(h.subjectId)?.name || ''} · ${esc(DB.teacherName(h.teacherId))} · জমার শেষ তারিখ ${U.fmtDate(h.due)}${HwEval.usesMarks() ? ` · পূর্ণমান ${bnNum(HwEval.full(h))}` : ''}</div></div>${sub ? statusBadge(sub.status) : late ? badge('সময়োত্তীর্ণ', 'red') : badge('অপেক্ষমাণ', 'amber')}</div>
          <p class="text-slate-600 mt-2">${esc(h.instructions || '')}</p>${h.attachment?.dataUrl ? `<a class="btn btn-ghost btn-sm mt-2" href="${h.attachment.dataUrl}" download="${esc(h.attachment.fileName)}" target="_blank">${icon('paperclip')} ${esc(h.attachment.fileName)}</a>` : ''}
          ${sub?.status === 'Graded' ? `<div class="mt-3 card p-3 bg-emerald-50 border-emerald-200 flex flex-wrap items-center gap-3"><div class="text-2xl font-extrabold text-emerald-700">${esc(HwEval.fmt(sub, h))}</div><div class="flex-1 min-w-[120px]">${esc(sub.feedback || 'মূল্যায়িত')}</div><button class="btn btn-ghost btn-sm" onclick="Student.viewFeedback('${sub.id}')">${icon('eye')} দেখুন</button></div>`
            : `<label class="dropzone mt-3 p-5 flex flex-col items-center justify-center text-center cursor-pointer" data-hw="${h.id}">${icon('upload-cloud', 'w-7 h-7 text-slate-400')}<div class="font-semibold mt-1">${sub ? 'জমাকৃত ফাইল পরিবর্তন করুন' : 'ফাইল এখানে ছাড়ুন অথবা আপলোড করতে ক্লিক করুন'}</div><div class="text-slate-400">JPG, PNG অথবা পিডিএফ${sub ? ` · বর্তমান: ${esc(sub.fileName)}` : ''}</div><input type="file" accept="image/*,application/pdf" class="hidden"></label>`}</div>`;
      }).join('') || emptyState('এখনও কোনো বাড়ির কাজ নেই।')}</div>`;
  };
}

/* ---------- Guardian: the child's homework with marks / grade ---------- */
if (App.portals.guardian && typeof Guardian !== 'undefined') App.addPage('guardian', {
  id: 'homework', label: 'বাড়ির কাজ ও মূল্যায়ন', icon: 'clipboard-check', module: 'academics', flag: 'homework',
  render() {
    const c = Guardian.child(); if (!c) return pageHeader('বাড়ির কাজ ও মূল্যায়ন') + emptyState('আপনার অ্যাকাউন্টের সঙ্গে কোনো শিক্ষার্থী যুক্ত নেই।', 'users');
    const list = DB.s.homework.filter(h => h.classId === c.classId).sort((a, b) => b.due.localeCompare(a.due));
    const subOf = h => DB.s.submissions.find(s => s.homeworkId === h.id && s.studentId === c.id);
    const graded = list.map(h => [h, subOf(h)]).filter(([, s]) => s?.status === 'Graded'), withMarks = graded.filter(([, s]) => HwEval.hasMarks(s));
    const avg = withMarks.length ? U.sum(withMarks, ([h, s]) => s.marks / (s.fullMarks || HwEval.full(h)) * 100) / withMarks.length : null;
    const pending = list.filter(h => !subOf(h) && h.due >= U.today()).length, missed = list.filter(h => !subOf(h) && h.due < U.today()).length;
    return pageHeader('বাড়ির কাজ ও মূল্যায়ন', `${esc(pn(c))} · ${esc(DB.className(c.classId))} · মূল্যায়ন পদ্ধতি: ${HwEval.label()}`) + Guardian.switcher()
      + `<div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">${kpi('মোট বাড়ির কাজ', bnNum(list.length), '', 'clipboard-list', 'blue')}${kpi('মূল্যায়িত', bnNum(graded.length), '', 'clipboard-check', 'green')}${kpi('গড় নম্বর', avg === null ? '—' : bnNum(avg.toFixed(0)) + '%', `${bnNum(withMarks.length)}টি নম্বরপ্রাপ্ত কাজ`, 'percent', 'violet')}${kpi('জমা বাকি', bnNum(pending), `${bnNum(missed)}টি সময়োত্তীর্ণ`, 'hourglass', 'amber')}</div>
      <div class="card divide-y divide-slate-100">${list.map(h => { const s = subOf(h); return `<div class="px-5 py-3 flex flex-wrap items-center gap-3"><div class="flex-1 min-w-[200px]"><div class="font-semibold">${esc(h.title)}</div><div class="text-slate-500">${DB.subject(h.subjectId)?.name || ''} · ${esc(DB.teacherName(h.teacherId))} · জমার শেষ তারিখ ${U.fmtDate(h.due)}</div>${s?.status === 'Graded' && s.feedback ? `<div class="text-slate-700 mt-1">“${esc(s.feedback)}”</div>` : ''}</div>
        ${s?.status === 'Graded' ? `<div class="text-xl font-extrabold text-emerald-700">${esc(HwEval.fmt(s, h))}</div>${s.annotatedUrl ? `<button class="btn btn-ghost btn-sm" onclick="Student.viewFeedback('${s.id}')">${icon('eye')} খাতা দেখুন</button>` : ''}` : s ? statusBadge(s.status) : h.due < U.today() ? badge('জমা দেয়নি', 'red') : badge('জমা বাকি', 'amber')}</div>`; }).join('') || emptyState('এখনও কোনো বাড়ির কাজ নেই।')}</div>`;
  },
}, 'academics');

/* ---------- Teaching assignments: syllabus tracker per assigned class × subject ---------- */
(() => {
  const syl = App.portals.teacher.pages.find(p => p.id === 'syllabus');
  if (!syl || typeof Academics === 'undefined') return;
  syl.render = function () {
    const t = Teacher.me(), view = App.ui.sylView || 'full';
    const list = Teacher.pairs(t).map(a => Academics.ensure(t.id, a.classId, a.subjectId)).sort((a, b) => DB.cls(a.classId).grade - DB.cls(b.classId).grade || String(a.subjectId).localeCompare(b.subjectId));
    return pageHeader('পাঠ্যসূচি ও পাঠদানের অগ্রগতি', '')
      + `<div class="flex flex-wrap gap-2 mb-4">${Academics.views.map(([k, l]) => `<button class="btn btn-sm ${k === view ? 'btn-primary' : 'btn-ghost'}" onclick="App.ui.sylView='${k}';App.refresh()">${l}</button>`).join('')}<span class="text-slate-500 self-center ml-2">চলতি টার্ম: ${esc(Academics.currentExam()?.name || '—')}</span></div>`
      + (list.map(sy => Academics.tracker(sy, view, true)).join('') || `<div class="card p-6">${emptyState('আপনাকে কোনো শ্রেণি-বিষয় বরাদ্দ করা হয়নি।', 'book-check')}</div>`);
  };
  // material upload: subjects follow the chosen class
  const up0 = Academics.upload.bind(Academics);
  Academics.upload = function () { const r = up0(...arguments); const f = $('#mat'); if (f?.classId) f.classId.dispatchEvent(new Event('change', { bubbles: true })); return r; };
})();

/* In teacher forms (homework, study material, lesson planner) the subject list follows the selected class. */
document.addEventListener('change', e => {
  const sel = e.target;
  if (!sel.matches?.('select[name=classId]') || App.route.portal !== 'teacher' || typeof Teacher === 'undefined') return;
  const f = sel.form; if (!f || !['mat', 'hw-form', 'lp-form'].includes(f.id)) return;
  const ss = f.querySelector('select[name=subjectId]'); if (!ss) return;
  const ids = Teacher.mySubjects(sel.value), cur = ss.value;
  ss.innerHTML = subjectOptions(ids.includes(cur) ? cur : ids[0], ids);
});
