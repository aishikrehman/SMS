/* ==========================================================================
   ATTENDANCE — biometric / RFID gate integration, staff attendance,
   analytics and printable reports (RBAC module key `attendance`).

   Shared data shapes owned here (other modules may read them):
     DB.s.staffAttendance[empId]['YYYY-MM-DD'] = 'P'|'A'|'L'|'E'
     DB.s.gateLogs = [{id, personType:'student'|'staff', personId, date, in, out, device, method}]
     DB.s.devices  = [{id, name, location, type:'RFID'|'Fingerprint'|'Face', campusId, status, lastSync}]
   Public helpers: Attendance (engine), AttendanceReports (print sheets), AttendanceUI (profile widgets).
   ========================================================================== */

/* ---------- seeders (structural: empty collections) ---------- */
DB.addSeeder('devices', () => []);
DB.addSeeder('gateLogs', () => []);

/* ---------- engine ---------- */
const Attendance = {
  LABEL: { P: 'উপস্থিত', A: 'অনুপস্থিত', L: 'বিলম্ব', E: 'অনুমোদিত ছুটি' },
  HEX: { P: '#10b981', L: '#f59e0b', A: '#ef4444', E: '#8b5cf6' },
  TONE: { P: 'green', A: 'red', L: 'amber', E: 'violet' },

  toMin(hm) { const [h, m] = String(hm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); },
  hm(min) { min = Math.max(0, Math.round(min)); return `${U.pad(Math.floor(min / 60) % 24)}:${U.pad(min % 60)}`; },
  now() { const d = new Date(); return `${U.pad(d.getHours())}:${U.pad(d.getMinutes())}`; },
  /* --- lateness: check-in later than the shift start + N minutes (school.lateMinutes) ---
     Students use their own shift, else their class's shift; staff use their own shift (employee.shift), else the
     staff default (school.staffShift = a shift id, or school.staffStart = a clock time). Without shifts the
     first shift / 08:00 is used. The old fixed clock time school.lateAfter is read as minutes after the default shift. */
  shifts() { return DB.s.school.shifts || []; },
  defaultShift() { return this.shifts()[0] || null; },
  lateMinutes() {
    const s = DB.s.school;
    if (s.lateMinutes !== undefined && s.lateMinutes !== null && s.lateMinutes !== '' && !isNaN(+s.lateMinutes)) return Math.max(0, +s.lateMinutes);
    if (s.lateAfter) return Math.max(0, this.toMin(s.lateAfter) - this.toMin(this.defaultShift()?.start || '08:00'));   // migration of the old clock time
    return 10;
  },
  shiftOf(type, person) {
    const S = this.shifts(), byId = id => (id ? S.find(x => x.id === id || x.name === id) : null) || null;
    if (!person) return this.defaultShift();
    if (type === 'student') return byId(person.shift) || byId(DB.cls(person.classId)?.shift) || this.defaultShift();
    return byId(person.shift) || byId(DB.s.school.staffShift) || (DB.s.school.staffStart ? null : this.defaultShift());
  },
  /** Start time (HH:MM) for a person: their shift's start, or the staff default start time. */
  startFor(type, person) {
    const sh = this.shiftOf(type, person);
    if (sh?.start) return sh.start;
    return (type !== 'student' && DB.s.school.staffStart) || this.defaultShift()?.start || '08:00';
  },
  /** The clock time after which a check-in is late, for this person (no person: the default shift). */
  lateAfter(type, person) { return this.hm(this.toMin(this.startFor(type, person)) + this.lateMinutes()); },
  isLate(hm, type, person) { return this.toMin(hm) > this.toMin(this.lateAfter(type, person)); },
  /** The rule in words, e.g. "শিফট শুরুর ১০ মিনিট পরে". */
  lateRule() { return `শিফট শুরুর ${bnNum(this.lateMinutes())} মিনিট পরে`; },
  /** "প্রভাতি ০৭:৩০ · দিবা ১২:৩০" — every shift's start and its late time. */
  shiftSummary() { const S = this.shifts(), m = this.lateMinutes(); return S.length ? S.map(s => `${bn(s.name)} ${U.bn(s.start)} (বিলম্ব ${U.bn(this.hm(this.toMin(s.start) + m))}-এর পরে)`).join(' · ') : `বিলম্ব ${U.bn(this.lateAfter())}-এর পরে`; },
  /** Is this gate-log time late for the log's person? (t defaults to the check-in time) */
  isLateLog(l, t = l.in) { return this.isLate(t, l.personType, l.personType === 'student' ? DB.student(l.personId) : DB.emp(l.personId)); },
  /** Staff: "দায়িত্ব শুরু HH:MM" for the default staff start. */
  staffStart() { return this.startFor('staff', {}); },
  /** The office attendance desk: a USB / camera QR scanner or typed IDs — no device record needed. */
  DESK: { id: 'DESK', name: 'হাজিরা ডেস্ক', type: 'QR', status: 'Online' },

  logs() { return DB.s.gateLogs || (DB.s.gateLogs = []); },
  devices(campusId) { return (DB.s.devices || []).filter(d => !campusId || campusId === 'ALL' || d.campusId === campusId); },
  device(id) { return (DB.s.devices || []).find(d => d.id === id); },
  /** Display name of an employee (teachers keep their Bangla name on the user record). */
  ename(e) { return e ? e.nameBn || (e.userId && DB.user(e.userId)?.nameBn) || e.name : ''; },
  deviceName(id) { return this.device(id)?.name || (id === 'DESK' ? this.DESK.name : id) || '—'; },
  logsOn(personId, date) { return this.logs().filter(l => l.personId === personId && l.date === date); },
  /** First check-in and last check-out of a person on a date. */
  inOut(personId, date) {
    const ls = this.logsOn(personId, date).sort((a, b) => a.in.localeCompare(b.in));
    if (!ls.length) return null;
    const outs = ls.map(l => l.out).filter(Boolean).sort();
    return { in: ls[0].in, out: ls[ls.length - 1].out ? outs[outs.length - 1] : null, device: ls[0].device, method: ls[0].method, taps: ls.length };
  },
  staffMark(empId, date) { return DB.s.staffAttendance?.[empId]?.[date] || null; },
  /** Biometric / RFID check-in of an employee on a date (null = no device record). */
  biometricIn(empId, date = U.today()) { return this.inOut(empId, date); },
  /** Manual presence confirmation (teacher-presence gate, see staffgate.js): DB.s.staffConfirms = [{id, teacherId, date, by, at, prevMark}] */
  confirmOf(empId, date = U.today()) { return (DB.s.staffConfirms || []).find(c => c.teacherId === empId && c.date === date) || null; },
  /** Set (mark) or clear (null) one employee's register entry and keep payroll absences in step. */
  setStaffMark(empId, date, mark) {
    const rec = (DB.s.staffAttendance = DB.s.staffAttendance || {})[empId] || (DB.s.staffAttendance[empId] = {});
    if (mark) rec[date] = mark; else delete rec[date];
    this.recomputeAbsences([empId], date.slice(0, 7));
  },
  studentMark(stId, date) { return DB.s.attendance[stId]?.[date] || null; },

  /** Resolve a scan / typed value: student ID, registration no., employee id, or ID-card QR `DHEE|EIIN|studentId|regNo`. */
  resolve(raw) {
    let v = String(raw || '').trim();
    if (!v) return { error: 'কিছুই স্ক্যান করা হয়নি।' };
    if (/^DHEE\|/i.test(v)) {
      const p = v.split('|');
      if (p[1] && p[1] !== DB.s.school.eiin) return { error: `কার্ডটি অন্য প্রতিষ্ঠানের (ইআইআইএন ${bnNum(p[1])})।` };
      const st = DB.student(p[2]) || DB.s.students.find(x => x.regNo === p[3]);
      return st ? this.wrapStudent(st) : { error: 'কার্ডটি শনাক্ত করা যায়নি।' };
    }
    const u = v.toUpperCase();
    const st = DB.s.students.find(x => x.id.toUpperCase() === u || String(x.regNo).toUpperCase() === u);
    if (st) return this.wrapStudent(st);
    const e = DB.emp(u) || DB.employees('ALL').find(x => x.id.toUpperCase() === u);
    if (e) return { type: 'staff', id: e.id, name: this.ename(e), sub: `${e.designation || bn(e.type || e.kind)} · ${e.id}`, campusId: e.campusId, person: e };
    return { error: `“${v}”-এর সঙ্গে কোনো শিক্ষার্থী বা কর্মচারী মেলেনি।` };
  },
  wrapStudent(st) {
    if (st.status !== 'active') return { error: `${pn(st)} সক্রিয় শিক্ষার্থী নয় (${bn(st.status)})।` };
    return { type: 'student', id: st.id, name: pn(st), sub: `${DB.className(st.classId)} · রোল ${bnNum(st.roll)} · ${st.id}`, campusId: DB.campusOf(st.classId), person: st };
  },
  personLabel(type, id) {
    if (type === 'student') { const st = DB.student(id); return st ? { name: pn(st), sub: `${DB.className(st.classId)} · রোল ${bnNum(st.roll)}`, person: st } : { name: id, sub: '' }; }
    const e = DB.emp(id); return e ? { name: this.ename(e), sub: e.designation || bn(e.type || e.kind), person: e } : { name: id, sub: '' };
  },

  /* --- guardian notifications --- */
  notifyLate(st, time, date) {
    DB.guardiansOf(st.id).forEach(g => DB.sms(g.phone, `${DB.s.school.shortName}: ${pn(st)} (${DB.cls(st.classId).name}, রোল ${bnNum(st.roll)}) ${U.fmtDate(date)} তারিখে ${U.bn(time)}-এ বিলম্বে উপস্থিত হয়েছে (শিফট শুরু ${U.bn(this.startFor('student', st))})।`));
  },
  notifyAbsent(st, date) {
    DB.guardiansOf(st.id).forEach(g => DB.sms(g.phone, `${DB.s.school.shortName}: ${pn(st)} (${DB.cls(st.classId).name}, রোল ${bnNum(st.roll)}) আজ, ${U.fmtDate(date)}, অনুপস্থিত — ফটকে কোনো প্রবেশ রেকর্ড হয়নি। অপ্রত্যাশিত হলে অনুগ্রহ করে শ্রেণিশিক্ষকের সঙ্গে যোগাযোগ করুন।`));
  },

  /** Recompute payroll absence counters for one month from the staff register. */
  recomputeAbsences(empIds, mk) {
    DB.s.teacherAbsences = DB.s.teacherAbsences || {};
    empIds.forEach(id => {
      const vals = Object.entries(DB.s.staffAttendance[id] || {}).filter(([k]) => k.startsWith(mk)).map(([, v]) => v);
      (DB.s.teacherAbsences[id] = DB.s.teacherAbsences[id] || {})[mk] = { unexcused: vals.filter(v => v === 'A').length, excused: vals.filter(v => v === 'E').length };
    });
  },

  /** Record a check-in, auto-marking attendance only when no mark exists for the day. Returns the resulting mark info. */
  checkIn(who, date, time, dev, schoolDay) {
    const log = { id: DB.id('GL'), personType: who.type, personId: who.id, date, in: time, out: null, device: dev.id, method: dev.type };
    this.logs().push(log);
    const res = { log, mark: null, kept: null };
    if (!schoolDay) return res;
    const mark = this.isLate(time, who.type, who.person) ? 'L' : 'P';
    if (who.type === 'student') {
      const rec = DB.s.attendance[who.id] || (DB.s.attendance[who.id] = {});
      if (rec[date]) res.kept = rec[date];
      else { rec[date] = mark; res.mark = mark; if (mark === 'L') this.notifyLate(who.person, time, date); }
    } else {
      DB.s.staffAttendance = DB.s.staffAttendance || {};
      const rec = DB.s.staffAttendance[who.id] || (DB.s.staffAttendance[who.id] = {});
      if (rec[date]) res.kept = rec[date];
      else { rec[date] = mark; res.mark = mark; }
    }
    return res;
  },

  /** Record one scan: first = check-in, the next = check-out, further scans alternate (re-entry).
      → { error } · { who, kind: 'IN' | 'OUT' | 'DUP', msg, late } */
  record(raw, dev, time, date = U.today()) {
    const who = this.resolve(raw);
    if (who.error) return who;
    const schoolDay = U.isSchoolDay(date, null, who.campusId);
    const mine = this.logsOn(who.id, date).sort((a, b) => a.in.localeCompare(b.in)), lastLog = mine[mine.length - 1];
    if (mine.some(l => l.in === time || l.out === time)) return { who, kind: 'DUP', msg: `${who.name}: ${U.bn(time)}-এর এন্ট্রি আগেই আছে।` };
    let msg, kind;
    if (lastLog && !lastLog.out) {
      if (this.toMin(time) < this.toMin(lastLog.in)) return { error: `প্রস্থানের সময় ${U.bn(time)} প্রবেশের সময় ${U.bn(lastLog.in)}-এর আগে হতে পারে না।` };
      lastLog.out = time; kind = 'OUT';
      msg = `${who.name} ${U.bn(time)}-এ প্রস্থান করেছেন।`;
    } else {
      const r = this.checkIn(who, date, time, dev, schoolDay); kind = 'IN';
      msg = `${who.name} ${U.bn(time)}-এ ${lastLog ? 'পুনরায় প্রবেশ' : 'প্রবেশ'} করেছেন` + (!schoolDay ? ' (বিদ্যালয়ের কার্যদিবস নয় — উপস্থিতি চিহ্নিত করা হয়নি)।' : r.mark ? ` — ${this.LABEL[r.mark]} হিসেবে চিহ্নিত${r.mark === 'L' && who.type === 'student' ? ', অভিভাবককে এসএমএসে জানানো হয়েছে' : ''}।` : r.kept ? ` — বিদ্যমান চিহ্ন “${this.LABEL[r.kept]}” বহাল রাখা হয়েছে।` : '।');
    }
    if (dev !== this.DESK) dev.lastSync = new Date().toISOString();
    DB.audit('GATE_TAP', 'gate_logs', `${dev.name}: ${who.type} ${who.id} ${kind} ${time}`);
    return { who, kind, msg, late: kind === 'IN' && this.isLate(time, who.type, who.person) && schoolDay };
  },
  /** Attendance desk / terminal form: one scan or typed ID. */
  tap(raw, deviceId, clock) {
    const ui = App.ui.bio || (App.ui.bio = {});
    const dev = deviceId ? this.device(deviceId) : this.DESK;
    const fail = msg => { ui.last = { ok: false, msg }; toast(msg, 'error'); App.refresh(); return false; };
    if (!dev) return fail('টার্মিনালটি পাওয়া যায়নি।');
    if (dev.status !== 'Online') return fail(`${dev.name} অফলাইনে আছে — এন্ট্রি গ্রহণ করা হয়নি।`);
    const time = /^\d{2}:\d{2}$/.test(clock || '') ? clock : this.now();
    const r = this.record(raw, dev, time);
    if (r.error) return fail(r.error);
    DB.save();
    ui.last = { ok: true, kind: r.kind === 'DUP' ? 'IN' : r.kind, msg: r.msg, name: r.who.name, sub: r.who.sub, type: r.who.type, id: r.who.id, time, late: r.kind !== 'OUT' && this.isLate(time, r.who.type, r.who.person) };
    toast(r.msg, r.kind === 'DUP' || r.late ? 'warn' : 'success');
    App.refresh();
    return true;
  },

  /** Pull today's events from the campus devices that have a connector URL (set when the device is registered).
      The URL answers GET …?date=YYYY-MM-DD with JSON [{ code, time: 'HH:MM', date? }], where code is the card QR,
      student ID, registration number or employee ID. Without a connector nothing is fetched or invented. */
  async sync(campusId = DB.campusId()) {
    const devs = this.devices(campusId).filter(d => d.endpoint && d.status === 'Online');
    if (!devs.length) return toast('ডিভাইস সংযুক্ত নেই — এই ক্যাম্পাসের কোনো ডিভাইসে সংযোগ-ঠিকানা (এপিআই ইউআরএল) দেওয়া হয়নি। হাজিরা ডেস্কে কার্ড স্ক্যান করুন বা আইডি লিখুন।', 'warn');
    const today = U.today(), failed = [];
    let ins = 0, outs = 0, bad = 0;
    for (const d of devs) {
      let events;
      try {
        const r = await fetch(d.endpoint + (d.endpoint.includes('?') ? '&' : '?') + 'date=' + today, { headers: { Accept: 'application/json' }, cache: 'no-store' });
        if (!r.ok) throw new Error('http_' + r.status);
        events = await r.json();
      } catch (e) { failed.push(d.name); continue; }
      (Array.isArray(events) ? events : []).filter(ev => ev && (ev.date || today) === today && /^\d{2}:\d{2}$/.test(ev.time || '')).sort((a, b) => a.time.localeCompare(b.time)).forEach(ev => {
        const r = this.record(ev.code, d, ev.time, today);
        if (r.error) bad++; else if (r.kind === 'IN') ins++; else if (r.kind === 'OUT') outs++;
      });
      d.lastSync = new Date().toISOString();
    }
    const cutoff = U.iso(U.addDays(new Date(), -120));   // keep about one term of gate data
    if (this.logs().some(l => l.date < cutoff)) DB.s.gateLogs = this.logs().filter(l => l.date >= cutoff);
    DB.audit('BIOMETRIC_SYNC', 'gate_logs', `${DB.campus(campusId).name}: ${ins} check-ins, ${outs} check-outs, ${bad} unmatched${failed.length ? `, unreachable: ${failed.join(', ')}` : ''}`); DB.save();
    toast(`সিঙ্ক: ${bnNum(ins)}টি প্রবেশ, ${bnNum(outs)}টি প্রস্থান${bad ? `, ${bnNum(bad)}টি অচেনা কোড` : ''}।${failed.length ? ` সংযোগ হয়নি: ${failed.join(', ')}।` : ''}`, failed.length ? 'warn' : 'success');
    App.refresh();
  },

  /** Day end: students with no tap and no mark → Absent + guardian SMS. */
  closeDay(campusId = DB.campusId()) {
    const today = U.today();
    if (!U.isSchoolDay(today, null, campusId)) return toast('আজ এই ক্যাম্পাসে বিদ্যালয়ের কার্যদিবস নয়।', 'warn');
    const list = DB.activeStudents(campusId).filter(st => !this.studentMark(st.id, today) && !this.logsOn(st.id, today).length);
    const staffMissing = DB.employees(campusId).filter(e => !this.staffMark(e.id, today) && !this.logsOn(e.id, today).length).length;
    if (!list.length) return toast(`বন্ধ করার কিছু নেই — প্রত্যেক শিক্ষার্থীর চিহ্ন অথবা ফটকে প্রবেশের রেকর্ড আছে।${staffMissing ? ` ${bnNum(staffMissing)} জন কর্মী অচিহ্নিত (কর্মী উপস্থিতি রেজিস্টার ব্যবহার করুন)।` : ''}`);
    if (!confirm(`${DB.campus(campusId).name}-এর জন্য দিনটি বন্ধ করবেন?\n\nফটকে প্রবেশের রেকর্ডবিহীন ${bnNum(list.length)} জন শিক্ষার্থীকে অনুপস্থিত হিসেবে চিহ্নিত করা হবে এবং তাদের অভিভাবকগণ এসএমএস পাবেন।`)) return;
    list.forEach(st => { (DB.s.attendance[st.id] = DB.s.attendance[st.id] || {})[today] = 'A'; this.notifyAbsent(st, today); });
    DB.audit('ATTENDANCE_CLOSE_DAY', 'attendance', `${DB.campus(campusId).name} ${today}: ${list.length} marked absent from gate data, guardians notified`); DB.save();
    toast(`${bnNum(list.length)} জন শিক্ষার্থীকে অনুপস্থিত চিহ্নিত করা হয়েছে; অভিভাবকদের জানানো হয়েছে।${staffMissing ? ` ${bnNum(staffMissing)} জন কর্মী এখনো অচিহ্নিত।` : ''}`, 'success');
    App.refresh();
  },

  toggleDevice(id) {
    const d = this.device(id); if (!d) return;
    d.status = d.status === 'Online' ? 'Offline' : 'Online';
    if (d.status === 'Online') d.lastSync = new Date().toISOString();
    DB.audit('DEVICE_STATUS', 'devices', `${d.name} → ${d.status}`); DB.save(); App.refresh();
  },
  addDevice() {
    Modal.open({
      title: 'উপস্থিতি ডিভাইস নিবন্ধন', size: 'sm',
      body: `<form id="dv-form" class="space-y-3"><div><label class="label">নাম</label><input class="input" name="name" required placeholder="যেমন: গ্রন্থাগারের আরএফআইডি রিডার"></div>
        <div><label class="label">অবস্থান</label><input class="input" name="location" required></div>
        <div class="grid grid-cols-2 gap-3"><div><label class="label">ধরন</label><select class="select" name="type">${['RFID', 'Fingerprint', 'Face'].map(t => `<option value="${t}">${bn(t)}</option>`).join('')}</select></div>
        <div><label class="label">ক্যাম্পাস</label><select class="select" name="campusId">${campusOptions(DB.campusId())}</select></div></div>
        <div><label class="label">সিরিয়াল নম্বর</label><input class="input" name="serial"></div>
        <div><label class="label">সংযোগ-ঠিকানা (ঐচ্ছিক)</label><input class="input font-mono" name="endpoint" type="url" placeholder="https://…"><p class="text-xs text-slate-500 mt-1">ডিভাইস বা তার সফটওয়্যারের এপিআই, যা দিনের প্রবেশ-প্রস্থান JSON আকারে দেয়। না থাকলে হাজিরা ডেস্ক ব্যবহার করুন।</p></div>
        <button class="btn btn-primary w-full">${icon('plus')} ডিভাইস নিবন্ধন করুন</button></form>`,
    });
    $('#dv-form').addEventListener('submit', e => {
      e.preventDefault(); const f = formData(e.target);
      const d = { id: DB.id('DV'), name: f.name, location: f.location, type: f.type, campusId: f.campusId, status: 'Online', lastSync: null, serial: f.serial, endpoint: (f.endpoint || '').trim() || null };
      (DB.s.devices = DB.s.devices || []).push(d);
      DB.audit('DEVICE_ADD', 'devices', `${d.id} ${d.name} (${d.type}, ${d.campusId})`); DB.save(); Modal.close(); App.refresh();
    });
  },

  /** SMS guardians of every student marked absent on a date (campus). */
  smsAbsentees(campusId = DB.campusId(), date = U.today()) {
    const list = DB.activeStudents(campusId).filter(st => this.studentMark(st.id, date) === 'A');
    if (!list.length) return toast('ওই তারিখে কোনো শিক্ষার্থী অনুপস্থিত হিসেবে চিহ্নিত নেই।');
    if (!confirm(`${bnNum(list.length)} জন শিক্ষার্থীর অভিভাবকদের অনুপস্থিতির এসএমএস পাঠাবেন?`)) return;
    list.forEach(st => this.notifyAbsent(st, date));
    DB.audit('ABSENCE_SMS', 'attendance', `${DB.campus(campusId).name} ${date}: absence SMS to guardians of ${list.length} student(s)`); DB.save();
    toast(`${bnNum(list.length)}টি অনুপস্থিতি সতর্কবার্তা পাঠানো হয়েছে।`, 'success'); App.refresh();
  },
  warnChronic(stId) {
    const st = DB.student(stId), a = DB.attendanceStats(stId);
    DB.guardiansOf(stId).forEach(g => DB.sms(g.phone, `${DB.s.school.shortName}: উপস্থিতি সতর্কবার্তা — এই টার্মে ${pn(st)} (${DB.cls(st.classId).name})-এর উপস্থিতি ${bnNum(a.pct.toFixed(0))}% (${bnNum(a.A)} দিন অনুপস্থিত), যা আবশ্যক ${bnNum(DB.s.school.minAttendance)}%-এর কম। অনুগ্রহ করে শ্রেণিশিক্ষকের সঙ্গে সাক্ষাৎ করুন।`));
    DB.audit('CHRONIC_ABSENCE_SMS', 'attendance', `${st.name} (${st.id}) ${a.pct.toFixed(0)}%`); DB.save();
    toast('অভিভাবককে জানানো হয়েছে।', 'success'); App.refresh();
  },

  /* --- staff register --- */
  saveStaff() {
    const ui = App.ui.sta, emps = DB.employees(ui.campus);
    DB.s.staffAttendance = DB.s.staffAttendance || {};
    let n = 0;
    emps.forEach(e => { const v = ui.marks[e.id]; if (!v) return; (DB.s.staffAttendance[e.id] = DB.s.staffAttendance[e.id] || {})[ui.date] = v; n++; });
    if (!n) return toast('অন্তত একজন কর্মচারী চিহ্নিত করুন।', 'error');
    this.recomputeAbsences(emps.map(e => e.id), ui.date.slice(0, 7));
    const c = { P: 0, A: 0, L: 0, E: 0 }; emps.forEach(e => ui.marks[e.id] && c[ui.marks[e.id]]++);
    DB.audit('STAFF_ATTENDANCE_SAVE', 'staff_attendance', `${DB.campus(ui.campus).name} ${ui.date}: P${c.P} L${c.L} A${c.A} E${c.E} — absences recomputed for ${U.monthName(ui.date.slice(0, 7))}`); DB.save();
    toast(`কর্মী উপস্থিতি রেজিস্টার সংরক্ষিত হয়েছে (${bnNum(n)} জন চিহ্নিত)। ${U.monthName(ui.date.slice(0, 7))}-এর বেতন-ভাতার অনুপস্থিতি আপডেট করা হয়েছে।`, 'success');
    App.refresh();
  },
  staffFromGate() {
    const ui = App.ui.sta;
    DB.employees(ui.campus).forEach(e => { const io = this.inOut(e.id, ui.date); if (io) ui.marks[e.id] = this.isLate(io.in, 'staff', e) ? 'L' : 'P'; });
    App.refresh();
  },

  /* --- stats --- */
  count(vals) { const c = { P: 0, A: 0, L: 0, E: 0 }; vals.forEach(v => { if (c[v] !== undefined) c[v]++; }); c.n = c.P + c.A + c.L; c.pct = c.n ? (c.P + c.L) / c.n * 100 : null; return c; },
  classMonth(classId, mk) { return this.count(DB.studentsIn(classId).flatMap(st => Object.entries(DB.s.attendance[st.id] || {}).filter(([k]) => k.startsWith(mk)).map(([, v]) => v))); },
  heatColor(pct) {
    if (pct === null || pct === undefined) return 'background:#f8fafc;color:#94a3b8';
    const t = U.clamp((pct - 60) / 40, 0, 1), hue = Math.round(t * 130);
    return `background:hsl(${hue} 70% ${t > .5 ? 82 : 86}%);color:hsl(${hue} 60% 25%)`;
  },
  /** Last n school days (≤ today) that have attendance data for a campus. */
  recentDays(campusId, n = 30) {
    const sts = DB.activeStudents(campusId), out = [];
    for (let d = new Date(), i = 0; out.length < n && i < n * 3; d = U.addDays(d, -1), i++) {
      const k = U.iso(d);
      if (!U.isSchoolDay(k, null, campusId)) continue;
      if (sts.some(st => DB.s.attendance[st.id]?.[k])) out.unshift(k);
    }
    return out;
  },
  isSmsAttendance(m) { return /\b(ABSENT|LATE)\b/.test(m) || /\babsen(t|ce)\b|attendance alert/i.test(m) || /অনুপস্থিত|বিলম্বে উপস্থিত|উপস্থিতি সতর্কবার্তা/.test(m); },
  isSmsLate(m) { return /\bLATE\b|বিলম্বে উপস্থিত/.test(m); },
};

/* ---------- printable reports ---------- */
const AttendanceReports = {
  chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out.length ? out : [[]]; },
  meta(pairs) { return `<div style="display:flex;flex-wrap:wrap;gap:2mm 8mm;font-size:9.5pt;margin-bottom:4mm">${pairs.map(([k, v]) => `<div><b>${esc(k)}:</b> ${esc(v)}</div>`).join('')}</div>`; },
  footer(page, pages, sig) { return `<div style="position:absolute;left:14mm;right:14mm;bottom:9mm;display:flex;justify-content:space-between;align-items:flex-end;font-size:7.5pt;color:#64748b"><div>প্রস্তুতকাল ${esc(U.fmtTime(Date.now()))} · Dhee SMS · পৃষ্ঠা ${bnNum(page)}/${bnNum(pages)}</div>${page === pages ? `<div style="display:flex;gap:12mm;align-items:flex-end;color:#0f172a"><div style="width:45mm;text-align:center"><div style="height:12mm"></div><div style="border-top:.25mm solid #0f172a;font-size:8pt;padding-top:1mm">${esc(sig || 'শ্রেণিশিক্ষক')}</div></div>${Print.signature('Principal')}</div>` : ''}</div>`; },
  mark(v) { return v ? `<b style="color:${Attendance.HEX[v]}">${bn(v)}</b>` : '—'; },

  studentDaily(classId, date, opts = {}) {
    opts = { paper: 'A4', orientation: 'portrait', ...opts };
    const c = DB.cls(classId), cp = c.campusId, list = DB.studentsIn(classId);
    const rows = list.map(st => ({ st, v: Attendance.studentMark(st.id, date), io: Attendance.inOut(st.id, date) }));
    const cnt = Attendance.count(rows.map(r => r.v)), unmarked = rows.filter(r => !r.v).length;
    const hol = DB.holiday(date, cp), pages = this.chunk(rows, 26);
    return pages.map((chunk, i) => `${Print.sheet(opts, 'padded')}${Print.header('দৈনিক উপস্থিতি প্রতিবেদন')}
      ${this.meta([['শ্রেণি', c.name], ...(multiCampus() ? [['ক্যাম্পাস', DB.campus(cp).name]] : []), ['তারিখ', `${U.dayBn(date)}, ${U.fmtDate(date)}`], ['শিফট শুরু', U.bn(Attendance.startFor('student', { classId }))], ['বিলম্ব', Attendance.lateRule()]])}
      ${!U.isSchoolDay(date, null, cp) ? `<div style="font-size:9pt;color:#b45309;margin-bottom:3mm">দ্রষ্টব্য: ${hol ? esc(hol.name) : 'সাপ্তাহিক ছুটি'} — নিয়মিত কার্যদিবস নয়।</div>` : ''}
      <table class="ms-table"><thead><tr><th style="width:12mm">রোল</th><th>শিক্ষার্থী</th><th>আইডি</th><th>অবস্থা</th><th>ফটকে প্রবেশ</th><th>ফটক থেকে প্রস্থান</th><th>মন্তব্য</th></tr></thead><tbody>
      ${chunk.map(r => `<tr><td>${bnNum(r.st.roll)}</td><td>${esc(pn(r.st))}</td><td>${r.st.id}</td><td>${r.v ? `${this.mark(r.v)} ${Attendance.LABEL[r.v]}` : 'চিহ্নিত করা হয়নি'}</td><td>${r.io?.in ? U.bn(r.io.in) : '—'}</td><td>${r.io?.out ? U.bn(r.io.out) : '—'}</td><td style="font-size:8pt">${r.io ? esc(Attendance.deviceName(r.io.device)) : ''}</td></tr>`).join('')}</tbody></table>
      ${i === pages.length - 1 ? `<table class="ms-table" style="margin-top:5mm;width:60%"><tbody><tr><th>ভর্তিকৃত</th><th>উপস্থিত</th><th>বিলম্ব</th><th>অনুপস্থিত</th><th>অনুমোদিত ছুটি</th><th>চিহ্নিত করা হয়নি</th><th>উপস্থিতি</th></tr>
        <tr><td style="text-align:center">${bnNum(list.length)}</td><td>${bnNum(cnt.P)}</td><td>${bnNum(cnt.L)}</td><td>${bnNum(cnt.A)}</td><td>${bnNum(cnt.E)}</td><td>${bnNum(unmarked)}</td><td><b>${cnt.pct === null ? '—' : bnNum(cnt.pct.toFixed(1)) + '%'}</b></td></tr></tbody></table>` : ''}
      ${this.footer(i + 1, pages.length)}</div>`);
  },

  studentMonthly(classId, monthKey, opts = {}) {
    opts = { paper: 'A4', orientation: 'landscape', ...opts };
    const c = DB.cls(classId), cp = c.campusId, list = DB.studentsIn(classId);
    const [y, m] = monthKey.split('-').map(Number), nDays = new Date(y, m, 0).getDate();
    const days = Array.from({ length: nDays }, (_, i) => { const k = `${monthKey}-${U.pad(i + 1)}`; return { k, d: i + 1, school: U.isSchoolDay(k, null, cp) && !DB.classOffDay?.(classId, k), dn: U.dayBn(k, true) }; });
    // an exam day without class attendance (exam setting) is not a working day for the class / section / shift sitting it
    const rows = list.map(st => { const rec = DB.s.attendance[st.id] || {}; const vals = days.map(x => (DB.examOffFor?.(st, x.k) ? null : rec[x.k] || null)); return { st, vals, c: Attendance.count(vals) }; });
    const schoolDays = days.filter(x => x.school).length;
    const pages = this.chunk(rows, opts.orientation === 'landscape' ? 20 : 30);
    const style = `<style>.att-m th,.att-m td{padding:.7mm .35mm !important;font-size:6.8pt}.att-m td.nm,.att-m th.nm{text-align:left;padding-left:1.5mm !important;white-space:nowrap;max-width:42mm;overflow:hidden}.att-m .off{background:#f1f5f9}</style>`;
    return pages.map((chunk, i) => `${Print.sheet(opts, 'padded')}${style}${Print.header(`মাসিক উপস্থিতি রেজিস্টার — ${esc(U.monthName(monthKey))}`)}
      ${this.meta([['শ্রেণি', c.name], ...(multiCampus() ? [['ক্যাম্পাস', DB.campus(cp).name]] : []), ['মাস', U.monthName(monthKey)], ['কার্যদিবস', bnNum(schoolDays)], ['ন্যূনতম আবশ্যক', bnNum(DB.s.school.minAttendance) + '%']])}
      <table class="ms-table att-m"><thead><tr><th>রোল</th><th class="nm">শিক্ষার্থী</th>${days.map(x => `<th class="${x.school ? '' : 'off'}">${bnNum(x.d)}<br><span style="font-weight:400;color:#64748b">${x.dn}</span></th>`).join('')}<th>${bn('P')}</th><th>${bn('L')}</th><th>${bn('A')}</th><th>${bn('E')}</th><th>%</th></tr></thead><tbody>
      ${chunk.map(r => `<tr><td>${bnNum(r.st.roll)}</td><td class="nm">${esc(pn(r.st))}</td>${r.vals.map((v, k) => `<td class="${days[k].school ? '' : 'off'}">${v ? this.mark(v) : days[k].school ? '' : '·'}</td>`).join('')}<td>${bnNum(r.c.P)}</td><td>${bnNum(r.c.L)}</td><td>${bnNum(r.c.A)}</td><td>${bnNum(r.c.E)}</td><td style="${r.c.pct !== null && r.c.pct < DB.s.school.minAttendance ? 'color:#dc2626;font-weight:700' : 'font-weight:700'}">${r.c.pct === null ? '—' : bnNum(r.c.pct.toFixed(0))}</td></tr>`).join('')}</tbody>
      ${i === pages.length - 1 ? `<tfoot><tr><th></th><th class="nm">দৈনিক উপস্থিত</th>${days.map(x => { const n = rows.filter(r => ['P', 'L'].includes(r.vals[x.d - 1])).length; return `<th class="${x.school ? '' : 'off'}">${x.school && rows.some(r => r.vals[x.d - 1]) ? bnNum(n) : ''}</th>`; }).join('')}<th>${bnNum(U.sum(rows, r => r.c.P))}</th><th>${bnNum(U.sum(rows, r => r.c.L))}</th><th>${bnNum(U.sum(rows, r => r.c.A))}</th><th>${bnNum(U.sum(rows, r => r.c.E))}</th><th>${(() => { const t = Attendance.count(rows.flatMap(r => r.vals)); return t.pct === null ? '—' : bnNum(t.pct.toFixed(0)); })()}</th></tr></tfoot>` : ''}</table>
      <div style="font-size:7.5pt;color:#475569;margin-top:2mm">${bn('P')} = উপস্থিত · ${bn('L')} = বিলম্ব (${U.bn(Attendance.lateAfter('student', { classId }))}-এর পরে, ${Attendance.lateRule()}) · ${bn('A')} = অনুপস্থিত · ${bn('E')} = অনুমোদিত ছুটি (শিক্ষার্থীর বিপক্ষে গণ্য নয়) · ছায়াযুক্ত = সাপ্তাহিক ছুটি / ছুটির দিন · % = (${bn('P')} + ${bn('L')}) ÷ (${bn('P')} + ${bn('L')} + ${bn('A')})</div>
      ${this.footer(i + 1, pages.length)}</div>`);
  },

  staffDaily(date, campusId, opts = {}) {
    opts = { paper: 'A4', orientation: 'portrait', ...opts };
    campusId = campusId || DB.campusId();
    const emps = DB.employees(campusId).sort((a, b) => (a.kind > b.kind ? 1 : a.kind < b.kind ? -1 : 0) || a.name.localeCompare(b.name));
    const rows = emps.map(e => ({ e, v: Attendance.staffMark(e.id, date), io: Attendance.inOut(e.id, date) }));
    const cnt = Attendance.count(rows.map(r => r.v)), pages = this.chunk(rows, 26);
    return pages.map((chunk, i) => `${Print.sheet(opts, 'padded')}${Print.header('কর্মী উপস্থিতি — দৈনিক')}
      ${this.meta([...(multiCampus() ? [['ক্যাম্পাস', DB.campus(campusId).name]] : []), ['তারিখ', `${U.dayBn(date)}, ${U.fmtDate(date)}`], ['দায়িত্ব শুরু', U.bn(Attendance.staffStart())], ['বিলম্ব', Attendance.lateRule()]])}
      <table class="ms-table"><thead><tr><th>কর্মচারী আইডি</th><th>নাম</th><th>পদবি</th><th>অবস্থা</th><th>প্রবেশ</th><th>প্রস্থান</th><th>ডিভাইস</th></tr></thead><tbody>
      ${chunk.map(r => `<tr><td>${r.e.id}</td><td>${esc(Attendance.ename(r.e))}</td><td style="font-size:8.5pt">${esc(r.e.designation || bn(r.e.type || ''))}</td><td>${r.v ? `${this.mark(r.v)} ${Attendance.LABEL[r.v]}` : 'চিহ্নিত করা হয়নি'}</td><td>${r.io?.in ? U.bn(r.io.in) : '—'}</td><td>${r.io?.out ? U.bn(r.io.out) : '—'}</td><td style="font-size:8pt">${r.io ? esc(bn(r.io.method)) : ''}</td></tr>`).join('')}</tbody></table>
      ${i === pages.length - 1 ? `<div style="margin-top:4mm;font-size:9.5pt"><b>সারসংক্ষেপ:</b> ${bnNum(emps.length)} জন কর্মচারী · উপস্থিত ${bnNum(cnt.P)} · বিলম্ব ${bnNum(cnt.L)} · অনুপস্থিত ${bnNum(cnt.A)} · অনুমোদিত ছুটি ${bnNum(cnt.E)} · অচিহ্নিত ${bnNum(rows.filter(r => !r.v).length)}</div>` : ''}
      ${this.footer(i + 1, pages.length, 'অফিস সুপারিনটেনডেন্ট')}</div>`);
  },

  preview(kind, a, b) {
    const re = ['AttendanceReports.preview', kind, a, b];
    if (kind === 'daily') return Print.preview(`দৈনিক উপস্থিতি — ${DB.cls(a).name} — ${U.fmtDate(b)}`, this.studentDaily(a, b), { paper: 'A4', orientation: 'portrait', re });
    if (kind === 'monthly') return Print.preview(`মাসিক রেজিস্টার — ${DB.cls(a).name} — ${U.monthName(b)}`, this.studentMonthly(a, b), { paper: 'A4', orientation: 'landscape', re });
    if (kind === 'staff') return Print.preview(`কর্মী উপস্থিতি — ${U.fmtDate(a)}`, this.staffDaily(a, b), { paper: 'A4', orientation: 'portrait', re });
  },
};

/* ---------- reusable widgets (student profile / dossier) ---------- */
const AttendanceUI = {
  /** Full-year GitHub-style heatmap of a student's attendance for the active session year. */
  heatmap(studentId) {
    const st = DB.student(studentId); if (!st) return emptyState('শিক্ষার্থী পাওয়া যায়নি।');
    const rec = DB.s.attendance[studentId] || {}, cp = DB.campusOf(st.classId), today = U.today();
    const year = +DB.session() || new Date().getFullYear(), jan1 = new Date(year, 0, 1), dec31 = `${year}-12-31`;
    let d = U.addDays(jan1, -jan1.getDay());
    const cols = [], labels = [];
    let lastMonth = -1;
    for (let w = 0; w < 54; w++) {
      const cells = [];
      let label = '';
      for (let i = 0; i < 7; i++) {
        const k = U.iso(d), inYear = d.getFullYear() === year;
        if (inYear && d.getMonth() !== lastMonth && d.getDate() <= 7) { label = d.toLocaleString('bn-BD', { month: 'short' }); lastMonth = d.getMonth(); }
        let bg = 'transparent', title = '';
        if (inYear) {
          const v = rec[k], hol = DB.holiday(k, cp), wk = DB.s.calendar.weekends.includes(d.getDay());
          if (v) { bg = Attendance.HEX[v]; title = Attendance.LABEL[v]; }
          else if (k > today) { bg = '#f1f5f9'; title = 'আসন্ন'; }
          else if (hol && hol.type !== 'Exam') { bg = '#fbcfe8'; title = hol.name; }
          else if (wk) { bg = '#f8fafc'; title = 'সাপ্তাহিক ছুটি'; }
          else { bg = '#e2e8f0'; title = hol ? hol.name : 'কোনো রেকর্ড নেই'; }
        }
        cells.push(`<div title="${inYear ? `${U.fmtDate(k)} · ${esc(title)}` : ''}" style="width:11px;height:11px;border-radius:2px;background:${bg};${inYear && bg === '#f8fafc' ? 'outline:1px solid #eef2f7;outline-offset:-1px;' : ''}"></div>`);
        d = U.addDays(d, 1);
      }
      cols.push(`<div style="display:flex;flex-direction:column;gap:2px">${cells.join('')}</div>`);
      labels.push(`<div style="width:11px;font-size:9px;color:#64748b;white-space:nowrap;overflow:visible">${label}</div>`);
      if (U.iso(d) > dec31) break;
    }
    const s = DB.attendanceStats(studentId);
    const sw = (c, l) => `<span class="inline-flex items-center gap-1"><span style="width:10px;height:10px;border-radius:2px;background:${c};display:inline-block"></span>${l}</span>`;
    return `<div class="card p-4"><div class="flex flex-wrap items-center justify-between gap-2 mb-3"><div class="font-semibold">উপস্থিতি ${bnNum(year)}</div>
        <div class="flex flex-wrap gap-1.5 text-xs">${badge(`${bnNum(s.pct.toFixed(1))}%`, s.pct >= DB.s.school.minAttendance ? 'green' : 'red')}${badge(`${bn('P')} ${bnNum(s.P)}`, 'green')}${badge(`${bn('L')} ${bnNum(s.L)}`, 'amber')}${badge(`${bn('A')} ${bnNum(s.A)}`, 'red')}${badge(`${bn('E')} ${bnNum(s.E)}`, 'violet')}</div></div>
      <div class="scroll-x pb-1"><div style="display:inline-flex;gap:6px">
        <div style="display:flex;flex-direction:column;gap:2px;padding-top:15px;font-size:9px;color:#94a3b8">${['Sun', '', 'Tue', '', 'Thu', '', 'Sat'].map(x => `<div style="height:11px;line-height:11px">${x ? U.dayBn(x, true) : ''}</div>`).join('')}</div>
        <div><div style="display:flex;gap:2px;height:13px;margin-bottom:2px">${labels.join('')}</div><div style="display:flex;gap:2px">${cols.join('')}</div></div></div></div>
      <div class="flex flex-wrap gap-3 mt-3 text-xs text-slate-500">${sw(Attendance.HEX.P, 'উপস্থিত')}${sw(Attendance.HEX.L, 'বিলম্ব')}${sw(Attendance.HEX.A, 'অনুপস্থিত')}${sw(Attendance.HEX.E, 'অনুমোদিত ছুটি')}${sw('#fbcfe8', 'ছুটির দিন')}${sw('#e2e8f0', 'কোনো রেকর্ড নেই')}${sw('#f1f5f9', 'আসন্ন')}</div></div>`;
  },
  /** Table of recent gate check-ins/outs for a student or employee. */
  gateLog(personId, days = 14) {
    const from = U.iso(U.addDays(new Date(), -days));
    const logs = Attendance.logs().filter(l => l.personId === personId && l.date >= from).sort((a, b) => b.date.localeCompare(a.date) || b.in.localeCompare(a.in));
    if (!logs.length) return emptyState(`গত ${bnNum(days)} দিনে ফটকে কোনো প্রবেশের রেকর্ড নেই।`, 'scan-line');
    return `<div class="scroll-x"><table class="table"><thead><tr><th>তারিখ</th><th>প্রবেশ</th><th>প্রস্থান</th><th>ডিভাইস</th></tr></thead><tbody>${logs.map(l => `<tr><td class="whitespace-nowrap">${U.dayBn(l.date)} ${U.fmtDate(l.date)}</td><td class="font-mono ${Attendance.isLateLog(l) ? 'text-amber-600 font-semibold' : ''}">${U.bn(l.in)}</td><td class="font-mono">${l.out ? U.bn(l.out) : '<span class="text-slate-400">—</span>'}</td><td class="text-xs">${esc(Attendance.deviceName(l.device))} ${badge(bn(l.method), l.method === 'RFID' ? 'blue' : l.method === 'Face' ? 'violet' : 'slate')}</td></tr>`).join('')}</tbody></table></div>`;
  },
};

/* ---------- pages ---------- */
const AttendancePages = {
  card(title, body, extra = '') { return `<div class="card ${extra}"><div class="px-5 py-3 border-b border-slate-100 font-semibold flex items-center justify-between gap-2">${title}</div>${body}</div>`; },
  ago(ts) { if (!ts) return 'কখনো নয়'; const m = Math.round((Date.now() - new Date(ts)) / 60e3); return m < 1 ? 'এইমাত্র' : m < 60 ? `${bnNum(m)} মিনিট আগে` : m < 1440 ? `${bnNum(Math.round(m / 60))} ঘণ্টা আগে` : U.fmtDate(ts.slice(0, 10)); },

  /* ---- Biometric & RFID (admin) ---- */
  biometric: {
    id: 'biometric', label: 'বায়োমেট্রিক ও আরএফআইডি', icon: 'scan-line', module: 'attendance', flag: 'biometric',
    render() {
      const cp = DB.campusId(), today = U.today(), ui = App.ui.bio || (App.ui.bio = { clock: '' });
      const devs = Attendance.devices(cp), ids = new Set(devs.map(d => d.id));
      const deskCp = l => l.personType === 'student' ? DB.campusOf(DB.student(l.personId)?.classId) : DB.emp(l.personId)?.campusId;
      const todayLogs = Attendance.logs().filter(l => l.date === today && (ids.has(l.device) || (l.device === 'DESK' && deskCp(l) === cp)));
      const stIn = new Set(todayLogs.filter(l => l.personType === 'student').map(l => l.personId)).size, sfIn = new Set(todayLogs.filter(l => l.personType === 'staff').map(l => l.personId)).size;
      const nSt = DB.activeStudents(cp).length, nSf = DB.employees(cp).length, school = U.isSchoolDay(today, null, cp);
      if (ui.device && !devs.find(d => d.id === ui.device)) ui.device = '';
      const events = todayLogs.flatMap(l => [{ t: l.in, k: 'IN', l }, ...(l.out ? [{ t: l.out, k: 'OUT', l }] : [])]).sort((a, b) => b.t.localeCompare(a.t)).slice(0, 30);
      const last = ui.last;
      return pageHeader('বায়োমেট্রিক ও আরএফআইডি উপস্থিতি', `${esc(DB.campus(cp).name)} · ${U.dayBn(today)} ${U.fmtDate(today)} · ${school ? `বিলম্ব: <b>${Attendance.lateRule()}</b>` : '<span class="text-amber-600 font-semibold">বিদ্যালয়ের কার্যদিবস নয়</span>'}`,
        `<button class="btn btn-ghost" onclick="Attendance.addDevice()">${icon('plus')} ডিভাইস যোগ করুন</button><button class="btn btn-ghost" onclick="Attendance.closeDay()">${icon('moon')} দিন সমাপ্ত করুন</button><button class="btn btn-primary" onclick="Attendance.sync()">${icon('refresh-cw')} এখনই সিঙ্ক করুন</button>`)
        + `<div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">${kpi('অনলাইন ডিভাইস', `${bnNum(devs.filter(d => d.status === 'Online').length)}/${bnNum(devs.length)}`, multiCampus() ? esc(DB.campus(cp).short) + ' ক্যাম্পাস' : '', 'router', 'blue')}${kpi('আজকের ট্যাপ', bnNum(todayLogs.length + todayLogs.filter(l => l.out).length), `${bnNum(todayLogs.filter(l => !l.out).length)} জন এখনো ভেতরে`, 'scan-line', 'violet')}${kpi('প্রবেশকারী শিক্ষার্থী', `${bnNum(stIn)}/${bnNum(nSt)}`, nSt ? `${bnNum((stIn / nSt * 100).toFixed(0))}%` : '', 'graduation-cap', 'green')}${kpi('প্রবেশকারী কর্মী', `${bnNum(sfIn)}/${bnNum(nSf)}`, `${bnNum(todayLogs.filter(l => l.personType === 'staff' && Attendance.isLateLog(l)).length)} জন বিলম্ব`, 'contact', 'amber')}</div>
        <div class="card scroll-x mb-5"><table class="table"><thead><tr><th>ডিভাইস</th><th>ধরন</th><th>অবস্থান</th><th>অবস্থা</th><th>সর্বশেষ সিঙ্ক</th><th>আজ</th><th></th></tr></thead><tbody>
          ${devs.map(d => `<tr><td><div class="font-semibold">${esc(d.name)}</div><div class="text-xs text-slate-400">${esc(d.id)}${d.serial ? ' · ' + esc(d.serial) : ''}</div></td><td>${badge(bn(d.type), d.type === 'RFID' ? 'blue' : d.type === 'Face' ? 'violet' : 'slate')}</td><td class="text-sm">${esc(d.location)}</td>
            <td>${d.status === 'Online' ? badge('● অনলাইন', 'green') : badge('● অফলাইন', 'red')}</td><td class="text-xs">${AttendancePages.ago(d.lastSync)}</td><td class="text-sm">${bnNum(todayLogs.filter(l => l.device === d.id).length)}টি এন্ট্রি</td>
            <td class="text-right"><button class="btn btn-ghost btn-sm" onclick="Attendance.toggleDevice('${d.id}')">${icon('power')} ${d.status === 'Online' ? 'অফলাইন করুন' : 'অনলাইন করুন'}</button></td></tr>`).join('') || `<tr><td colspan="7">${emptyState('এই ক্যাম্পাসে কোনো ডিভাইস নিবন্ধিত নেই।', 'router')}</td></tr>`}</tbody></table></div>
        <div class="grid xl:grid-cols-5 gap-5">
          <div class="card xl:col-span-2 p-5"><div class="font-semibold flex items-center gap-2 mb-1">${icon('qr-code')} হাজিরা ডেস্ক — কিউআর স্ক্যান / ম্যানুয়াল এন্ট্রি</div><p class="text-xs text-slate-500 mb-4">আইডি কার্ডের কিউআর স্ক্যানার দিয়ে স্ক্যান করুন অথবা শিক্ষার্থী আইডি, নিবন্ধন নম্বর বা কর্মচারী আইডি লিখুন। প্রথম এন্ট্রি = প্রবেশ (স্বয়ংক্রিয় ${bn('P')}/${bn('L')}), পরেরটি = প্রস্থান।</p>
            <form id="gt-form" class="space-y-3" autocomplete="off">
              <div><label class="label">যেখান থেকে এন্ট্রি</label><select class="select" name="device"><option value="">${esc(Attendance.DESK.name)} (কিউআর / ম্যানুয়াল)</option>${devs.map(d => `<option value="${d.id}" ${d.id === ui.device ? 'selected' : ''} ${d.status === 'Online' ? '' : 'disabled'}>${esc(d.name)} (${bn(d.type)})${d.status === 'Online' ? '' : ' — অফলাইন'}</option>`).join('')}</select></div>
              <div><label class="label">কার্ড / আইডি</label><input class="input font-mono" name="code" id="gt-code" placeholder="কার্ডের কিউআর বা আইডি" required></div>
              <div class="flex items-end gap-3"><div class="flex-1"><label class="label">সময় (ফাঁকা = বর্তমান সময়)</label><input type="time" class="input" name="clock" value="${esc(ui.clock || '')}"></div><button class="btn btn-primary">${icon('scan-line')} এন্ট্রি দিন</button></div>
            </form>
            ${last ? `<div class="mt-4 rounded-xl p-4 ${!last.ok ? 'bg-red-50 text-red-700' : last.kind === 'OUT' ? 'bg-blue-50 text-blue-800' : last.late ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}">
              ${last.ok ? `<div class="flex items-center gap-3">${avatar(Attendance.personLabel(last.type, last.id).person || { name: last.name }, 44)}<div class="min-w-0"><div class="font-bold">${esc(last.name)} · ${bn(last.kind)}</div><div class="text-xs opacity-80">${esc(last.sub)}</div></div><div class="ml-auto font-mono text-xl font-bold">${esc(U.bn(last.time))}</div></div><div class="text-sm mt-2">${esc(last.msg)}</div>` : `<div class="flex items-center gap-2 font-semibold">${icon('circle-x')} ${esc(last.msg)}</div>`}</div>` : ''}
          </div>
          <div class="card xl:col-span-3"><div class="px-5 py-3 border-b border-slate-100 font-semibold flex items-center justify-between">সরাসরি আপডেট · আজ<span class="text-xs font-normal text-slate-400">${bnNum(todayLogs.length)}টি প্রবেশ</span></div>
            <div class="divide-y divide-slate-100 max-h-[460px] overflow-y-auto">${events.map(ev => { const p = Attendance.personLabel(ev.l.personType, ev.l.personId), late = ev.k === 'IN' && Attendance.isLateLog(ev.l, ev.t);
              return `<div class="px-5 py-2.5 flex items-center gap-3 text-sm"><span class="font-mono text-xs w-11 text-slate-500">${U.bn(ev.t)}</span>${badge(bn(ev.k), ev.k === 'IN' ? (late ? 'amber' : 'green') : 'blue')}<div class="min-w-0 flex-1"><div class="font-semibold truncate">${esc(p.name)} ${ev.l.personType === 'staff' ? badge('কর্মী', 'violet') : ''}</div><div class="text-xs text-slate-400 truncate">${esc(p.sub)} · ${esc(Attendance.deviceName(ev.l.device))}</div></div>${late ? badge('বিলম্ব', 'amber') : ''}</div>`; }).join('') || emptyState('আজ এখনো কোনো এন্ট্রি হয়নি। হাজিরা ডেস্কে কার্ড স্ক্যান করুন, অথবা সংযুক্ত ডিভাইস থাকলে “এখনই সিঙ্ক করুন”।', 'scan-line')}</div></div>
        </div>`;
    },
    mount() {
      const f = $('#gt-form'); if (!f) return;
      f.device.addEventListener('change', () => { App.ui.bio.device = f.device.value; });
      f.clock.addEventListener('change', () => { App.ui.bio.clock = f.clock.value; });
      f.addEventListener('submit', e => { e.preventDefault(); const d = formData(f); App.ui.bio.device = d.device; App.ui.bio.clock = d.clock; Attendance.tap(d.code, d.device, d.clock); setTimeout(() => $('#gt-code')?.focus(), 30); });
    },
  },

  /* ---- Staff attendance register (admin + principal) ---- */
  staff: {
    id: 'staff-attendance', label: 'কর্মী উপস্থিতি', icon: 'user-check', module: 'attendance',
    render() {
      const ui = App.ui.sta || (App.ui.sta = { date: U.today(), campus: DB.campusId(), top: DB.campusId(), marks: {}, key: '' });
      if (ui.top !== DB.campusId()) { ui.top = DB.campusId(); ui.campus = DB.campusId(); }
      const emps = DB.employees(ui.campus).sort((a, b) => (a.kind > b.kind ? 1 : a.kind < b.kind ? -1 : 0) || a.name.localeCompare(b.name));
      const key = ui.campus + ui.date;
      if (ui.key !== key) { ui.marks = {}; emps.forEach(e => { const v = Attendance.staffMark(e.id, ui.date); if (v) ui.marks[e.id] = v; }); ui.key = key; }
      const c = { P: 0, A: 0, L: 0, E: 0 }; emps.forEach(e => ui.marks[e.id] && c[ui.marks[e.id]]++);
      const unmarked = emps.filter(e => !ui.marks[e.id]).length, mk = ui.date.slice(0, 7), canEdit = App.perm('attendance', 'edit');
      const school = U.isSchoolDay(ui.date, null, ui.campus), hol = DB.holiday(ui.date, ui.campus);
      return pageHeader('কর্মী উপস্থিতি রেজিস্টার', `শিক্ষক ও সহায়ক কর্মী · বায়োমেট্রিক/আরএফআইডি ডিভাইস থেকে ফটকের সময় · সংরক্ষণ করলে ${U.monthName(mk)}-এর বেতন-ভাতার অনুপস্থিতির হিসাব আপডেট হয়।`,
        `<button class="btn btn-ghost" onclick="AttendanceReports.preview('staff', App.ui.sta.date, App.ui.sta.campus)">${icon('printer')} দৈনিক প্রতিবেদন মুদ্রণ</button>`)
        + `<div class="card p-4 mb-4 flex flex-wrap gap-3 items-end"><div><label class="label">তারিখ</label><input type="date" class="input" value="${ui.date}" max="${U.today()}" onchange="App.ui.sta.date=this.value||U.today();App.refresh()"></div>
          <div><label class="label">ক্যাম্পাস</label><select class="select" onchange="App.ui.sta.campus=this.value;App.refresh()">${campusOptions(ui.campus)}</select></div>
          <div class="flex-1"></div><div class="flex flex-wrap gap-1.5">${badge(`${bn('P')} ${bnNum(c.P)}`, 'green')}${badge(`${bn('L')} ${bnNum(c.L)}`, 'amber')}${badge(`${bn('A')} ${bnNum(c.A)}`, 'red')}${badge(`${bn('E')} ${bnNum(c.E)}`, 'violet')}${unmarked ? badge(`${bnNum(unmarked)} জন অচিহ্নিত`, 'slate') : ''}</div></div>
        ${school ? '' : `<div class="card p-3 mb-4 bg-amber-50 border-amber-200 text-amber-800 text-sm">${icon('calendar-off', 'w-4 h-4 inline')} ${U.fmtDate(ui.date)} ${hol ? `ছুটির দিন — <b>${esc(hol.name)}</b>।` : 'সাপ্তাহিক ছুটির দিন।'}</div>`}
        <div class="card"><div class="px-4 py-2 border-b border-slate-100 flex flex-wrap gap-2">${canEdit ? `<button class="btn btn-ghost btn-sm" onclick="DB.employees(App.ui.sta.campus).forEach(e=>App.ui.sta.marks[e.id]='P');App.refresh()">${icon('check-check')} সকলকে উপস্থিত চিহ্নিত করুন</button><button class="btn btn-ghost btn-sm" onclick="Attendance.staffFromGate()">${icon('scan-line')} ফটক লগ থেকে পূরণ করুন</button>` : '<span class="text-xs text-slate-400 py-1">আপনার ভূমিকার জন্য কেবল দেখার অনুমতি।</span>'}</div>
          <div class="divide-y divide-slate-100">${emps.map(e => { const io = Attendance.inOut(e.id, ui.date), ab = DB.s.teacherAbsences?.[e.id]?.[mk];
            return `<div class="px-4 py-2.5 flex flex-wrap sm:flex-nowrap items-center gap-3">${avatar(e, 34)}<div class="flex-1 min-w-[160px]"><div class="font-semibold text-sm">${esc(Attendance.ename(e))} ${badge(bn(e.kind), e.kind === 'Teacher' ? 'blue' : 'slate')}</div><div class="text-xs text-slate-400">${esc(e.id)} · ${esc(e.designation || bn(e.type || ''))}${ab ? ` · ${U.monthName(mk)}: ${bnNum(ab.unexcused)} ${bn('A')} / ${bnNum(ab.excused)} ${bn('E')}` : ''}</div></div>
              <div class="text-xs font-mono w-28 ${io ? '' : 'text-slate-400'}">${io ? `<span class="${Attendance.isLate(io.in, 'staff', e) ? 'text-amber-600 font-bold' : 'text-emerald-700'}">প্রবেশ ${U.bn(io.in)}</span><br>প্রস্থান ${io.out ? U.bn(io.out) : '—'}` : (Attendance.confirmOf(e.id, ui.date) ? `<span class="text-emerald-700">প্রধানের নিশ্চিতকরণ</span><br>${esc(pn(DB.user(Attendance.confirmOf(e.id, ui.date).by)) || '')}` : 'ফটকে প্রবেশের রেকর্ড নেই')}</div>
              <div class="flex gap-1">${['P', 'A', 'L', 'E'].map(v => `<button class="att-btn ${ui.marks[e.id] === v ? 'on-' + v : ''}" title="${Attendance.LABEL[v]}" ${canEdit ? `onclick="App.ui.sta.marks['${e.id}']='${v}';App.refresh()"` : 'disabled'}>${bn(v)}</button>`).join('')}</div></div>`; }).join('') || emptyState('এই ক্যাম্পাসে কোনো কর্মচারী নেই।')}</div>
          ${canEdit ? `<div class="p-4 border-t border-slate-100 flex justify-end"><button class="btn btn-primary" onclick="Attendance.saveStaff()">${icon('save')} রেজিস্টার সংরক্ষণ করুন</button></div>` : ''}</div>`;
    },
  },

  /* ---- Analytics (admin + principal) ---- */
  analytics: {
    id: 'attendance-analytics', label: 'উপস্থিতি বিশ্লেষণ', icon: 'bar-chart-3', module: 'attendance',
    render() {
      const cp = DB.campusId(), ui = App.ui.attan || (App.ui.attan = {}), classes = DB.classesIn(cp), sch = DB.s.school;
      if (!ui.cls || !classes.find(c => c.id === ui.cls)) ui.cls = classes[0]?.id;
      ui.date = ui.date || U.today(); ui.month = ui.month || U.monthKey(new Date());
      const sts = DB.activeStudents(cp), ids = new Set(sts.map(s => s.id));
      // months with any data on this campus (session year)
      const months = [...new Set(sts.flatMap(st => Object.keys(DB.s.attendance[st.id] || {}).map(k => k.slice(0, 7))))].filter(m => m.startsWith(DB.session())).sort().slice(-12);
      const heat = classes.map(c => ({ c, cells: months.map(m => Attendance.classMonth(c.id, m)) }));
      const days = Attendance.recentDays(cp, 30);
      const trend = days.map(d => { const cnt = Attendance.count(sts.map(st => DB.s.attendance[st.id]?.[d]).filter(Boolean)); return { d, cnt }; });
      const avg = trend.length ? U.sum(trend, t => t.cnt.pct || 0) / trend.length : null;
      const today = ui.date, snap = classes.map(c => { const list = DB.studentsIn(c.id); const vals = list.map(st => DB.s.attendance[st.id]?.[today]); return { c, n: list.length, cnt: Attendance.count(vals.filter(Boolean)), un: vals.filter(v => !v).length, gate: list.filter(st => Attendance.logsOn(st.id, today).length).length }; });
      const tot = Attendance.count(sts.map(st => DB.s.attendance[st.id]?.[today]).filter(Boolean));
      const win = new Set(days);
      const chronic = sts.map(st => { const a = DB.attendanceStats(st.id), recent = Attendance.count(Object.entries(DB.s.attendance[st.id] || {}).filter(([k]) => win.has(k)).map(([, v]) => v)); return { st, a, recent }; })
        .filter(r => r.a.pct < sch.minAttendance || r.recent.A >= 5).sort((a, b) => a.a.pct - b.a.pct);
      const phones = new Set(sts.flatMap(st => DB.guardiansOf(st.id).map(g => g.phone)));
      const smsLog = DB.s.outbox.filter(m => Attendance.isSmsAttendance(m.message) && (phones.has(m.to) || !DB.s.users.some(u => u.phone === m.to))).slice(0, 60);
      const pctCell = p => `<td class="text-center font-semibold text-xs" style="${Attendance.heatColor(p)}">${p === null ? '—' : bnNum(p.toFixed(1)) + '%'}</td>`;
      const dossier = st => typeof Dossier !== 'undefined' ? `<button class="font-semibold hover:underline text-left" onclick="Dossier.open('${st.id}')">${esc(pn(st))}</button>` : `<b>${esc(pn(st))}</b>`;
      return pageHeader('উপস্থিতি বিশ্লেষণ', `${esc(DB.campus(cp).name)} · ন্যূনতম আবশ্যক ${bnNum(sch.minAttendance)}% · বিলম্ব: ${Attendance.lateRule()}`,
        `<button class="btn btn-accent" onclick="Attendance.smsAbsentees(DB.campusId(), App.ui.attan.date)">${icon('message-square-warning')} অনুপস্থিতদের অভিভাবকদের এসএমএস পাঠান</button>`)
        + `<div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">${kpi('৩০ দিনের গড়', avg === null ? '—' : bnNum(avg.toFixed(1)) + '%', `${bnNum(days.length)} কার্যদিবস`, 'trending-up', 'green')}${kpi(today === U.today() ? 'আজ উপস্থিত' : `উপস্থিত ${U.fmtDate(today)}`, `${bnNum(tot.P + tot.L)}/${bnNum(sts.length)}`, `${bnNum(tot.L)} জন বিলম্ব · ${bnNum(sts.length - tot.P - tot.L - tot.A - tot.E)} জন অচিহ্নিত`, 'user-check', 'blue')}${kpi('অনুপস্থিত', bnNum(tot.A), `${bnNum(tot.E)} জন অনুমোদিত ছুটিতে`, 'user-x', 'red')}${kpi('দীর্ঘমেয়াদি অনুপস্থিত', bnNum(chronic.length), `${bnNum(sch.minAttendance)}%-এর নিচে অথবা ৩০ দিনে ≥৫ দিন অনুপস্থিত`, 'triangle-alert', 'amber')}</div>
        <div class="grid xl:grid-cols-3 gap-5 mb-5">
          ${AttendancePages.card('শ্রেণি × মাস উপস্থিতি', months.length ? `<div class="scroll-x"><table class="table"><thead><tr><th>শ্রেণি</th>${months.map(m => `<th class="text-center">${U.monthName(m)}</th>`).join('')}</tr></thead><tbody>${heat.map(r => `<tr><td class="font-semibold whitespace-nowrap">${esc(r.c.name)}</td>${r.cells.map(x => pctCell(x.pct)).join('')}</tr>`).join('')}</tbody></table></div>
            <div class="px-5 py-2 flex items-center gap-2 text-[11px] text-slate-500">৬০%<div class="h-2 w-40 rounded-full" style="background:linear-gradient(90deg,hsl(0 70% 86%),hsl(65 70% 84%),hsl(130 70% 82%))"></div>১০০%</div>` : emptyState('এই শিক্ষাবর্ষে কোনো উপস্থিতি রেকর্ড করা হয়নি।'), 'xl:col-span-2')}
          ${AttendancePages.card(`${multiCampus() ? 'ক্যাম্পাসের' : 'প্রতিষ্ঠানের'} প্রবণতা · সর্বশেষ ${bnNum(days.length)} কার্যদিবস`, `<div class="px-4">${trend.length ? miniBars(trend.map(t => ({ label: bnNum(U.d(t.d).getDate()), values: [{ label: `${U.fmtDate(t.d)} উপস্থিত`, v: t.cnt.pct || 0, cls: (t.cnt.pct || 0) >= sch.minAttendance + 15 ? 'bg-emerald-500' : (t.cnt.pct || 0) >= sch.minAttendance ? 'bg-amber-500' : 'bg-red-500' }] })), v => bnNum(v.toFixed(1)) + '%') : emptyState('কোনো তথ্য নেই।')}</div><div class="px-5 pb-3 text-xs text-slate-500">চিহ্নিত শিক্ষার্থীদের মধ্যে দৈনিক উপস্থিত + বিলম্বের শতাংশ। তারিখ দেখতে বারের ওপর কার্সর রাখুন।</div>`)}
        </div>
        <div class="grid xl:grid-cols-3 gap-5 mb-5">
          ${AttendancePages.card(`এক নজরে · <input type="date" class="input !w-auto !py-1 text-sm" value="${today}" max="${U.today()}" onchange="App.ui.attan.date=this.value||U.today();App.refresh()">`, `<div class="scroll-x"><table class="table"><thead><tr><th>শ্রেণি</th><th class="text-center">ভর্তিকৃত</th><th class="text-center">উপস্থিত</th><th class="text-center">বিলম্ব</th><th class="text-center">অনুপস্থিত</th><th class="text-center">অনুমোদিত ছুটি</th><th class="text-center">অচিহ্নিত</th><th class="text-center">ফটকে ট্যাপ</th><th class="text-center">%</th><th></th></tr></thead><tbody>
            ${snap.map(r => `<tr><td class="font-semibold">${esc(r.c.name)}</td><td class="text-center">${bnNum(r.n)}</td><td class="text-center text-emerald-700 font-semibold">${bnNum(r.cnt.P)}</td><td class="text-center text-amber-600">${bnNum(r.cnt.L)}</td><td class="text-center text-red-600 font-semibold">${bnNum(r.cnt.A)}</td><td class="text-center text-violet-600">${bnNum(r.cnt.E)}</td><td class="text-center text-slate-400">${bnNum(r.un)}</td><td class="text-center">${bnNum(r.gate)}</td>${pctCell(r.cnt.pct)}<td><button class="btn btn-ghost btn-sm" title="দৈনিক প্রতিবেদন মুদ্রণ" aria-label="দৈনিক প্রতিবেদন মুদ্রণ" onclick="AttendanceReports.preview('daily','${r.c.id}',App.ui.attan.date)">${icon('printer')}</button></td></tr>`).join('')}</tbody></table></div>
            ${U.isSchoolDay(today, null, cp) ? '' : `<div class="px-5 py-2 text-xs text-amber-700">${U.fmtDate(today)} এই ক্যাম্পাসে কার্যদিবস নয়।</div>`}`, 'xl:col-span-2')}
          ${AttendancePages.card('মুদ্রণযোগ্য প্রতিবেদন', `<div class="p-5 space-y-3"><div><label class="label">শ্রেণি</label><select class="select" onchange="App.ui.attan.cls=this.value">${classes.map(c => `<option value="${c.id}" ${c.id === ui.cls ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
            <div class="flex items-end gap-2"><div class="flex-1"><label class="label">দিন</label><input type="date" class="input" value="${today}" max="${U.today()}" onchange="App.ui.attan.date=this.value||U.today()"></div><button class="btn btn-ghost" onclick="AttendanceReports.preview('daily',App.ui.attan.cls,App.ui.attan.date)">${icon('printer')} দৈনিক</button></div>
            <div class="flex items-end gap-2"><div class="flex-1"><label class="label">মাস</label><input type="month" class="input" value="${ui.month}" onchange="App.ui.attan.month=this.value||U.monthKey(new Date())"></div><button class="btn btn-ghost" onclick="AttendanceReports.preview('monthly',App.ui.attan.cls,App.ui.attan.month)">${icon('printer')} মাসিক</button></div>
            <button class="btn btn-ghost w-full" onclick="AttendanceReports.preview('staff',App.ui.attan.date,DB.campusId())">${icon('printer')} কর্মীদের দৈনিক প্রতিবেদন</button>
            <p class="text-xs text-slate-400">মাসিক রেজিস্টার এ৪ আড়াআড়ি কাগজে শ্রেণি × দিন ছক ও মোটসহ মুদ্রিত হয়।</p></div>`)}
        </div>
        <div class="grid xl:grid-cols-2 gap-5">
          ${AttendancePages.card(`দীর্ঘমেয়াদি অনুপস্থিত <span class="text-xs font-normal text-slate-400">${bnNum(chronic.length)} জন শিক্ষার্থী</span>`, `<div class="scroll-x max-h-[420px] overflow-y-auto"><table class="table"><thead><tr><th>শিক্ষার্থী</th><th class="text-center">টার্ম %</th><th class="text-center">অনুপস্থিত (৩০ দিন)</th><th class="text-center">বিলম্ব (৩০ দিন)</th><th></th></tr></thead><tbody>
            ${chronic.map(r => `<tr><td>${dossier(r.st)}<div class="text-xs text-slate-400">${esc(DB.className(r.st.classId))} · রোল ${bnNum(r.st.roll)}</div></td><td class="w-32"><div class="text-xs font-semibold ${r.a.pct < sch.minAttendance ? 'text-red-600' : ''}">${bnNum(r.a.pct.toFixed(1))}%</div>${progressBar(r.a.pct)}</td><td class="text-center text-red-600 font-semibold">${bnNum(r.recent.A)}</td><td class="text-center text-amber-600">${bnNum(r.recent.L)}</td><td class="text-right"><button class="btn btn-ghost btn-sm" onclick="Attendance.warnChronic('${r.st.id}')">${icon('message-square')} অভিভাবককে সতর্ক করুন</button></td></tr>`).join('') || `<tr><td colspan="5">${emptyState('কোনো দীর্ঘমেয়াদি অনুপস্থিত নেই।', 'party-popper')}</td></tr>`}</tbody></table></div>`)}
          ${AttendancePages.card(`অনুপস্থিতি ও বিলম্বের এসএমএস লগ <span class="text-xs font-normal text-slate-400">সাম্প্রতিক ${bnNum(smsLog.length)}টি</span>`, `<div class="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">${smsLog.map(m => `<div class="px-5 py-2.5 text-sm"><div class="flex justify-between gap-2 text-xs text-slate-400"><span>${esc(m.to)} · ${esc(bn(m.kind))}</span><span>${U.fmtTime(m.ts)}</span></div><div class="mt-0.5">${Attendance.isSmsLate(m.message) ? badge('বিলম্ব', 'amber') : badge('অনুপস্থিত', 'red')} ${esc(m.message)}</div></div>`).join('') || emptyState('এখনো কোনো অনুপস্থিতি বা বিলম্বের সতর্কবার্তা পাঠানো হয়নি।', 'message-square')}</div>`)}
        </div>`;
    },
  },

  /* ---- Teacher: My Attendance ---- */
  mine: {
    id: 'my-attendance', label: 'আমার উপস্থিতি', icon: 'calendar-check', module: 'attendance',
    render() {
      const t = DB.teacherByUser(App.session.userId);
      if (!t) return pageHeader('আমার উপস্থিতি') + emptyState('আপনার অ্যাকাউন্টের সঙ্গে কোনো কর্মচারী রেকর্ড যুক্ত নেই।');
      const e = DB.emp(t.id), rec = DB.s.staffAttendance?.[t.id] || {};
      const months = [...new Set([...Object.keys(rec).map(k => k.slice(0, 7)), U.monthKey(new Date())])].sort();
      const mk = App.ui.myAttMonth && months.includes(App.ui.myAttMonth) ? App.ui.myAttMonth : months[months.length - 1];
      const [y, m] = mk.split('-').map(Number), first = new Date(y, m - 1, 1), nDays = new Date(y, m, 0).getDate(), idx = months.indexOf(mk);
      const tone = { P: 'bg-emerald-100 text-emerald-800', A: 'bg-red-500 text-white', L: 'bg-amber-200 text-amber-900', E: 'bg-violet-200 text-violet-800' };
      let cells = ''; for (let i = 0; i < first.getDay(); i++) cells += '<div></div>';
      for (let d = 1; d <= nDays; d++) {
        const k = `${mk}-${U.pad(d)}`, v = rec[k], io = Attendance.inOut(t.id, k), hol = DB.holiday(k, e.campusId), wk = DB.s.calendar.weekends.includes(new Date(y, m - 1, d).getDay());
        const cls = v ? tone[v] : hol && hol.type !== 'Exam' ? 'bg-pink-50 text-pink-700' : wk ? 'bg-slate-50 text-slate-300' : k === U.today() ? 'ring-2 ring-brand-400 text-slate-700' : 'text-slate-400 border border-slate-100';
        cells += `<div class="rounded-lg p-1 min-h-[54px] flex flex-col ${cls}" title="${U.fmtDate(k)}${v ? ' · ' + Attendance.LABEL[v] : ''}${hol ? ' · ' + esc(hol.name) : wk ? ' · সাপ্তাহিক ছুটি' : ''}"><div class="text-xs font-bold">${bnNum(d)}${v ? ` <span class="opacity-70">${bn(v)}</span>` : ''}</div>${io ? `<div class="text-[9px] font-mono leading-tight mt-auto">${U.bn(io.in)}${io.out ? '<br>' + U.bn(io.out) : ''}</div>` : hol && hol.type !== 'Exam' && !wk ? `<div class="text-[8px] leading-tight mt-auto truncate">${esc(hol.name)}</div>` : ''}</div>`;
      }
      const c = Attendance.count(Object.entries(rec).filter(([k]) => k.startsWith(mk)).map(([, v]) => v));
      const logsM = Attendance.logs().filter(l => l.personId === t.id && l.date.startsWith(mk));
      const avgIn = logsM.length ? Attendance.hm(U.sum(logsM, l => Attendance.toMin(l.in)) / logsM.length) : '—';
      const ab = DB.s.teacherAbsences?.[t.id]?.[mk];
      return pageHeader('আমার উপস্থিতি', `${esc(Attendance.ename(e))} · ${esc(e.designation || '')} · ${esc(DB.campus(e.campusId).name)} · দায়িত্ব শুরু ${U.bn(Attendance.startFor('staff', e))} · বিলম্ব ${U.bn(Attendance.lateAfter('staff', e))}-এর পরে`)
        + `<div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">${kpi('উপস্থিত', bnNum(c.P), U.monthName(mk), 'user-check', 'green')}${kpi('বিলম্ব', bnNum(c.L), `গড় প্রবেশ ${U.bn(avgIn)}`, 'alarm-clock', 'amber')}${kpi('অনুপস্থিত (অননুমোদিত)', bnNum(c.A), ab ? `বেতন কর্তনের জন্য বেতন-ভাতায় ${bnNum(ab.unexcused)} দিন গণ্য` : 'বেতন কর্তনে প্রভাব ফেলে', 'user-x', 'red')}${kpi('অনুমোদিত ছুটি', bnNum(c.E), c.pct === null ? '' : `${bnNum(c.pct.toFixed(1))}% উপস্থিতি`, 'shield-check', 'violet')}</div>
        <div class="grid lg:grid-cols-5 gap-5"><div class="card p-5 lg:col-span-3"><div class="flex items-center justify-between mb-3"><button class="btn btn-ghost btn-sm" ${idx > 0 ? '' : 'disabled'} onclick="App.ui.myAttMonth='${months[idx - 1] || ''}';App.refresh()">${icon('chevron-left')}</button><div class="font-semibold">${U.monthName(mk)}</div><button class="btn btn-ghost btn-sm" ${idx < months.length - 1 ? '' : 'disabled'} onclick="App.ui.myAttMonth='${months[idx + 1] || ''}';App.refresh()">${icon('chevron-right')}</button></div>
          <div class="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 mb-1">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(x => `<div>${U.dayBn(x, true)}</div>`).join('')}</div><div class="grid grid-cols-7 gap-1">${cells}</div>
          <div class="flex flex-wrap gap-2 mt-3 text-xs">${badge('উপস্থিত', 'green')}${badge('বিলম্ব', 'amber')}${badge('অনুপস্থিত', 'red')}${badge('অনুমোদিত ছুটি', 'violet')}<span class="badge bg-pink-50 text-pink-700">ছুটির দিন</span><span class="text-slate-400">সময় = ফটকে প্রবেশ / প্রস্থান</span></div></div>
          ${AttendancePages.card('সাম্প্রতিক ফটক প্রবেশ', AttendanceUI.gateLog(t.id, 30), 'lg:col-span-2')}</div>`;
    },
  },
};

App.addPage('admin', AttendancePages.biometric, 'system');
App.addPage('admin', AttendancePages.staff, 'biometric');
App.addPage('admin', AttendancePages.analytics, 'staff-attendance');
App.addPage('principal', AttendancePages.staff, 'staff');
App.addPage('principal', AttendancePages.analytics, 'staff-attendance');
App.addPage('teacher', AttendancePages.mine, 'attendance');
