/* ==========================================================================
   DATA IMPORT / EXPORT & BACKUPS
   CSV exports of the main registers, validated CSV imports (students with
   guardian linking, support staff, teachers), JSON backups, a PostgreSQL SQL
   dump and restore-from-JSON.
   ========================================================================== */

const DataIO = {
  BLOODS: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'],

  /* ---------- small helpers ---------- */
  campusName(id) { return DB.campus(id)?.name || id || ''; },
  scope() { return App.ui.dataCampus || 'ALL'; },
  inScope(campusId) { const cp = this.scope(); return cp === 'ALL' || campusId === cp; },
  stamp() { return U.today(); },
  csvDownload(name, rows) { downloadFile(name, '﻿' + U.csv(rows), 'text/csv;charset=utf-8'); },
  normKey(k) { return String(k || '').toLowerCase().replace(/[^a-z0-9]/g, ''); },
  tempPw() { return U.tempPw(); },
  uniqueUsername(base) {
    base = String(base || 'user').toLowerCase().replace(/[^a-z0-9._]/g, '') || 'user';
    const taken = u => DB.s.users.some(x => x.username.toLowerCase() === u);
    if (!taken(base)) return base;
    for (let n = 2; n < 10000; n++) if (!taken(base + n)) return base + n;
    return base + Date.now().toString(36);
  },
  resolveCampus(v) {
    v = String(v || '').trim().toLowerCase(); if (!v) return null;
    return DB.s.campuses.find(c => c.id.toLowerCase() === v || c.name.toLowerCase() === v || (c.short || '').toLowerCase() === v) || null;
  },
  normPhone(v) {
    let p = String(v || '').replace(/[\s\-().]/g, '');
    if (p.startsWith('+88')) p = p.slice(3); else if (p.startsWith('88') && p.length === 13) p = p.slice(2);
    if (/^1\d{9}$/.test(p)) p = '0' + p;                 // leading zero dropped by spreadsheets
    return p;
  },
  validPhone(p) { return /^01\d{9}$/.test(p); },
  normDate(v) {
    v = String(v || '').trim(); if (!v) return null;
    let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/), y, mo, d;
    if (m) [, y, mo, d] = m; else if ((m = v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/))) [, d, mo, y] = m; else return null;
    const iso = `${y}-${U.pad(+mo)}-${U.pad(+d)}`, dt = U.d(iso);
    return isNaN(dt) || U.iso(dt) !== iso ? null : iso;
  },
  normGender(v) { v = String(v || '').trim().toLowerCase(); return { m: 'Male', male: 'Male', boy: 'Male', f: 'Female', female: 'Female', girl: 'Female', o: 'Other', other: 'Other' }[v] || null; },
  normBlood(v) { v = String(v || '').trim().toUpperCase().replace(/\s+/g, '').replace(/VE$/, '').replace(/POS(ITIVE)?$/, '+').replace(/NEG(ATIVE)?$/, '-'); return v; },

  /** RFC-4180-ish CSV parser (quotes, escaped quotes, CRLF, BOM). Returns array of string arrays. */
  parseCsv(text) {
    text = String(text || '').replace(/^﻿/, '');
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
      if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(x => String(x).trim() !== ''));
  },

  /* ==========================================================================
     EXPORTS
     ========================================================================== */
  exportStudents() {
    const list = DB.s.students.filter(s => this.inScope(DB.campusOf(s.classId)));
    const rows = [['id', 'name', 'class', 'classId', 'roll', 'regNo', 'dob', 'gender', 'blood', 'guardianName', 'guardianPhone', 'campus', 'status']];
    list.forEach(s => { const g = DB.guardiansOf(s.id)[0] || {}; rows.push([s.id, s.name, DB.cls(s.classId)?.name || '', s.classId, s.roll, s.regNo, s.dob, s.gender, s.blood, g.name || '', g.phone || '', this.campusName(DB.campusOf(s.classId)), s.status]); });
    this.csvDownload(`students-${this.scope().toLowerCase()}-${this.stamp()}.csv`, rows);
    this.logExport('students', list.length);
  },
  exportTeachers() {
    const list = DB.s.teachers.filter(t => this.inScope(t.campusId));
    const rows = [['id', 'name', 'username', 'phone', 'email', 'campus', 'dept', 'designation', 'subjects', 'salaryGrade', 'baseSalary', 'status', 'joinDate', 'payoutMethod']];
    list.forEach(t => { const u = DB.user(t.userId) || {}; rows.push([t.id, u.name, u.username, u.phone, u.email, this.campusName(t.campusId), t.dept, t.designation, (t.subjects || []).join(';'), t.salaryGrade || '', t.baseSalary, t.status, t.joinDate, t.payoutMethod]); });
    this.csvDownload(`teachers-${this.scope().toLowerCase()}-${this.stamp()}.csv`, rows);
    this.logExport('teachers', list.length);
  },
  exportStaff() {
    const list = (DB.s.staff || []).filter(s => this.inScope(s.campusId));
    const rows = [['id', 'name', 'type', 'designation', 'campus', 'phone', 'salaryGrade', 'baseSalary', 'status', 'joinDate', 'payoutMethod']];
    list.forEach(s => rows.push([s.id, s.name, s.type, s.designation, this.campusName(s.campusId), s.phone, s.salaryGrade || '', s.baseSalary, s.status, s.joinDate, s.payoutMethod]));
    this.csvDownload(`support-staff-${this.scope().toLowerCase()}-${this.stamp()}.csv`, rows);
    this.logExport('staff', list.length);
  },
  exportInvoices() {
    const list = DB.s.invoices.filter(i => this.inScope(DB.campusOf(DB.student(i.studentId)?.classId)));
    const rows = [['id', 'studentId', 'studentName', 'class', 'month', 'item', 'kind', 'amount', 'status', 'due', 'paymentId']];
    list.forEach(i => { const s = DB.student(i.studentId); rows.push([i.id, i.studentId, s?.name || '', s ? DB.className(s.classId) : '', i.month, i.item, i.kind, i.amount, i.status, i.due, i.paymentId || '']); });
    this.csvDownload(`invoices-${this.scope().toLowerCase()}-${this.stamp()}.csv`, rows);
    this.logExport('invoices', list.length);
  },
  exportPayments() {
    const list = DB.s.payments.filter(p => this.inScope(DB.campusOf(DB.student(p.studentId)?.classId)));
    const rows = [['id', 'date', 'studentId', 'studentName', 'amount', 'method', 'txn', 'channel', 'verified', 'invoiceIds']];
    list.forEach(p => rows.push([p.id, p.date, p.studentId, DB.student(p.studentId)?.name || '', p.amount, p.method, p.txn, p.channel, p.verified ? 'yes' : 'no', (p.invoiceIds || []).join(';')]));
    this.csvDownload(`payments-${this.scope().toLowerCase()}-${this.stamp()}.csv`, rows);
    this.logExport('payments', list.length);
  },
  ENTITY_BN: { students: 'শিক্ষার্থী', teachers: 'শিক্ষক', staff: 'কর্মী', invoices: 'বিল', payments: 'পরিশোধ' },
  logExport(entity, n) { const e = this.ENTITY_BN[entity] || entity; DB.audit('DATA_EXPORT', entity, `${n}টি ${e}-সারি সিএসভি হিসেবে এক্সপোর্ট করা হয়েছে (${this.scope()})`); DB.save(); toast(`${bnNum(n)}টি ${e}-সারি এক্সপোর্ট করা হয়েছে।`, 'success'); },
  /** Display labels for backup kinds / statuses (the stored values stay English — they are matched by regex). */
  BK_KIND: { 'Manual export (JSON)': 'হাতে করা এক্সপোর্ট (JSON)', 'Manual export (PostgreSQL SQL)': 'হাতে করা এক্সপোর্ট (PostgreSQL SQL)', 'Manual export': 'হাতে করা এক্সপোর্ট', 'Automated daily (cloud)': 'স্বয়ংক্রিয় দৈনিক (ক্লাউড)', 'Scheduled nightly': 'নির্ধারিত রাত্রিকালীন' },
  BK_STATUS: { Downloaded: 'ডাউনলোডকৃত', Restored: 'পুনরুদ্ধারকৃত', Verified: 'যাচাইকৃত' },
  kindLabel(k) { k = String(k || ''); const m = k.match(/^Restored from (.+)$/); return m ? `${m[1]} থেকে পুনরুদ্ধারকৃত` : (this.BK_KIND[k] || k); },

  /* ==========================================================================
     IMPORT — templates, parsing, validation, commit
     ========================================================================== */
  KINDS: {
    students: {
      label: 'শিক্ষার্থী', icon: 'graduation-cap',
      cols: ['name', 'class', 'campus', 'roll', 'dob', 'gender', 'blood', 'guardianName', 'guardianPhone', 'guardianRelation', 'fatherName', 'motherName'],
      required: ['name', 'class', 'dob', 'gender', 'guardianPhone'],
      sample: [['Nusaiba Karim', 'C7', 'MAIN', '', '2014-04-12', 'Female', 'B+', 'Mr. Rezaul Karim', '01712345678', 'Father', 'Rezaul Karim', 'Salma Begum'], ['Arian Chowdhury', 'Class 3', 'MAIN', '', '2018-09-03', 'Male', 'O+', 'Mrs. Tania Chowdhury', '01898765432', 'Mother', 'Faisal Chowdhury', 'Tania Chowdhury']],
      notes: 'class = শ্রেণির আইডি (যেমন C7) অথবা নাম ("Class 7"), সঙ্গে campus (ক্যাম্পাসের আইডি, যেমন MAIN, অথবা ক্যাম্পাসের নাম)। roll ঐচ্ছিক — না দিলে পরবর্তী খালি রোল দেওয়া হবে। guardianPhone অবশ্যই 01XXXXXXXXX আকারে হতে হবে; ওই ফোন নম্বরের কোনো অভিভাবক আগে থেকে থাকলে তাঁর সঙ্গে সংযুক্ত করা হবে (ভাইবোন), অন্যথায় নতুন অভিভাবক লগইন তৈরি হবে। dob = YYYY-MM-DD অথবা DD/MM/YYYY।',
    },
    staff: {
      label: 'সহায়ক কর্মী', icon: 'hard-hat',
      cols: ['name', 'type', 'designation', 'campus', 'phone', 'baseSalary', 'salaryGrade', 'payoutMethod'],
      required: ['name', 'type'],
      sample: [['Abdur Rob', 'Security Guard', 'Night Guard', 'MAIN', '01755512345', '12000', '', 'Cash'], ['Shirin Akter', 'Cleaner', 'Caretaker', 'MAIN', '01933344455', '', 'S4', 'bKash']],
      notes: `type অবশ্যই এগুলোর একটি হতে হবে: ${STAFF_TYPES.join(', ')}। baseSalary অথবা salaryGrade (${Object.keys({ S1: 1, S2: 1, S3: 1, S4: 1 }).join('/')}) দিন। campus না দিলে সক্রিয় ক্যাম্পাস ধরা হবে।`,
    },
    teachers: {
      label: 'শিক্ষক', icon: 'presentation',
      cols: ['name', 'username', 'phone', 'email', 'campus', 'dept', 'designation', 'subjects', 'salaryGrade', 'baseSalary'],
      required: ['name', 'phone'],
      sample: [['Tahmina Akhter', '', '01711987654', '', 'MAIN', 'Science', 'Assistant Teacher', 'SCI;MATH', 'G3', ''], ['Jubayer Hossain', 'jubayer', '01822233344', '', 'MAIN', 'Primary', 'Assistant Teacher', 'ENG', '', '35000']],
      notes: 'subjects = বিষয়ের কোড বা নাম, ; দিয়ে পৃথক করে (যেমন MATH;ICT)। salaryGrade (G1–G4) অথবা baseSalary দিন। username ঐচ্ছিক (স্বয়ংক্রিয়ভাবে তৈরি হয়)। নতুন শিক্ষকগণ শিক্ষানবিশ অবস্থায় ব্যাংকের মাধ্যমে বেতন প্রদানে যুক্ত হন; একটি এককালীন পাসওয়ার্ড তৈরি হয়।',
    },
  },
  ALIASES: {
    studentname: 'name', fullname: 'name', classid: 'class', classname: 'class', campusid: 'campus', branch: 'campus', rollno: 'roll', dateofbirth: 'dob', birthdate: 'dob', sex: 'gender',
    bloodgroup: 'blood', guardian: 'guardianname', guardianmobile: 'guardianphone', mobile: 'phone', relation: 'guardianrelation', father: 'fathername', mother: 'mothername',
    staffname: 'name', teachername: 'name', salary: 'basesalary', grade: 'salarygrade', department: 'dept', subject: 'subjects', login: 'username',
  },
  template(kind) {
    const k = this.KINDS[kind];
    this.csvDownload(`template-${kind}.csv`, [k.cols, ...k.sample]);
  },

  /** Parse + validate a CSV for `kind`. Returns {kind, header, unknown, missing, rows:[{line, raw, val, errors[], warnings[]}]}. */
  validate(kind, text) {
    const def = this.KINDS[kind]; if (!def) throw new Error('অজানা ইমপোর্টের ধরন');
    const grid = this.parseCsv(text);
    if (!grid.length) return { kind, header: [], unknown: [], missing: def.required, rows: [] };
    const canon = Object.fromEntries(def.cols.map(c => [this.normKey(c), c]));
    const header = grid[0].map(h => { const n = this.normKey(h); const a = this.ALIASES[n] || n; return canon[a] || (kind === 'students' && a === 'phone' ? 'guardianPhone' : null); });
    const unknown = grid[0].filter((h, i) => !header[i]);
    const missing = def.required.filter(c => !header.includes(c));
    const rows = grid.slice(1).map((cells, i) => {
      const raw = {}; header.forEach((h, j) => { if (h) raw[h] = String(cells[j] ?? '').trim(); });
      return { line: i + 2, raw, val: {}, errors: [], warnings: [] };
    });
    if (!missing.length) this['check_' + kind](rows);
    else rows.forEach(r => r.errors.push(`কলাম অনুপস্থিত: ${missing.join(', ')}`));
    return { kind, header, unknown, missing, rows };
  },

  check_students(rows) {
    const nextRoll = {}, usedRoll = {};
    const rollsOf = cid => usedRoll[cid] || (usedRoll[cid] = new Set(DB.s.students.filter(s => s.classId === cid && s.status === 'active').map(s => +s.roll)));
    rows.forEach(r => {
      const x = r.raw, v = r.val, E = m => r.errors.push(m), W = m => r.warnings.push(m);
      v.name = (x.name || '').replace(/\s+/g, ' ');
      if (!v.name) E('নাম আবশ্যক');
      // campus + class
      let cp = null;
      if (x.campus) { cp = this.resolveCampus(x.campus); if (!cp) E(`অজানা ক্যাম্পাস "${x.campus}"`); }
      const cv = (x.class || '').trim();
      let c = null;
      if (!cv) E('শ্রেণি আবশ্যক');
      else {
        c = DB.s.classes.find(k => k.id.toLowerCase() === cv.toLowerCase());
        if (!c) {
          const num = (cv.match(/\d+/) || [])[0];
          let cand = DB.s.classes.filter(k => k.name.toLowerCase() === cv.toLowerCase() || (num && /^(class\s*)?\d+$/i.test(cv) && +k.grade === +num));
          if (cp) cand = cand.filter(k => k.campusId === cp.id);
          if (cand.length === 1) c = cand[0];
          else if (cand.length > 1) E(`"${cv}" শ্রেণিটি একাধিক ক্যাম্পাসে রয়েছে — campus কলামে মান যোগ করুন`);
          else E(cp ? `${cp.name}-এ অজানা শ্রেণি "${cv}"` : `অজানা শ্রেণি "${cv}"`);
        } else if (cp && c.campusId !== cp.id) E(`${c.id} শ্রেণিটি ${cp.name}-এ নেই`);
      }
      if (c) { v.classId = c.id; v.campusId = c.campusId; }
      // roll
      if (c) {
        const used = rollsOf(c.id);
        if (x.roll) {
          const n = +x.roll;
          if (!Number.isInteger(n) || n < 1) E(`রোল "${x.roll}" কোনো ধনাত্মক পূর্ণসংখ্যা নয়`);
          else if (used.has(n)) E(`${DB.className(c.id)}-এ রোল ${bnNum(n)} ইতোমধ্যে নেওয়া হয়েছে`);
          else { v.roll = n; used.add(n); }
        } else {
          let n = Math.max(nextRoll[c.id] || 0, 0, ...used) + 1;
          v.roll = n; v.autoRoll = true; used.add(n); nextRoll[c.id] = n;
        }
      }
      // dob / gender / blood
      v.dob = this.normDate(x.dob);
      if (!x.dob) E('জন্মতারিখ আবশ্যক'); else if (!v.dob) E(`অবৈধ জন্মতারিখ "${x.dob}" (YYYY-MM-DD আকারে লিখুন)`); else if (v.dob >= U.today()) E('জন্মতারিখ ভবিষ্যতের তারিখ হতে পারে না');
      v.gender = this.normGender(x.gender);
      if (!v.gender) E(x.gender ? `অজানা লিঙ্গ "${x.gender}"` : 'লিঙ্গ আবশ্যক');
      v.blood = x.blood ? this.normBlood(x.blood) : '';
      if (v.blood && !this.BLOODS.includes(v.blood)) { E(`অজানা রক্তের গ্রুপ "${x.blood}"`); }
      if (!v.blood) W('রক্তের গ্রুপ ফাঁকা');
      // guardian
      v.guardianPhone = this.normPhone(x.guardianPhone);
      if (!x.guardianPhone) E('অভিভাবকের ফোন নম্বর আবশ্যক');
      else if (!this.validPhone(v.guardianPhone)) E(`অভিভাবকের ফোন "${x.guardianPhone}" অবশ্যই 01XXXXXXXXX আকারে হতে হবে`);
      v.guardianName = (x.guardianName || '').replace(/\s+/g, ' ');
      v.guardianRelation = x.guardianRelation || 'Father';
      v.fatherName = x.fatherName || ''; v.motherName = x.motherName || '';
      if (this.validPhone(v.guardianPhone)) {
        const g = DB.s.users.find(u => u.phone === v.guardianPhone && DB.roles(u.id).includes('GUARDIAN'));
        if (g) { v.existingGuardian = g.id; W(`বিদ্যমান অভিভাবক @${g.username}-এর সঙ্গে সংযুক্ত হবে`); }
        else if (!v.guardianName) {
          const earlier = rows.find(o => o !== r && o.line < r.line && o.val.guardianPhone === v.guardianPhone && o.val.guardianName);
          if (earlier) v.guardianName = earlier.val.guardianName; else E('নতুন অভিভাবকের ক্ষেত্রে অভিভাবকের নাম আবশ্যক');
        }
      }
      if (v.name && v.dob && DB.s.students.some(s => s.status === 'active' && s.name.toLowerCase() === v.name.toLowerCase() && s.dob === v.dob)) W('একই নাম ও জন্মতারিখের একজন শিক্ষার্থী ইতোমধ্যে রয়েছে');
    });
  },

  check_staff(rows) {
    const grades = DB.s.staffGrades || {};
    rows.forEach(r => {
      const x = r.raw, v = r.val, E = m => r.errors.push(m), W = m => r.warnings.push(m);
      v.name = (x.name || '').replace(/\s+/g, ' '); if (!v.name) E('নাম আবশ্যক');
      v.type = STAFF_TYPES.find(t => t.toLowerCase() === String(x.type || '').trim().toLowerCase());
      if (!x.type) E('ধরন আবশ্যক'); else if (!v.type) E(`অজানা কর্মীর ধরন "${x.type}"`);
      v.designation = x.designation || v.type || '';
      const cp = x.campus ? this.resolveCampus(x.campus) : DB.campus();
      if (!cp) E(`অজানা ক্যাম্পাস "${x.campus}"`); else { v.campusId = cp.id; if (!x.campus) W(`ক্যাম্পাস হিসেবে ${cp.name} ধরা হয়েছে`); }
      v.phone = x.phone ? this.normPhone(x.phone) : '';
      if (x.phone && !this.validPhone(v.phone)) E(`ফোন "${x.phone}" অবশ্যই 01XXXXXXXXX আকারে হতে হবে`);
      if (!x.phone) W('ফোন নম্বর নেই');
      v.salaryGrade = x.salaryGrade ? x.salaryGrade.toUpperCase() : null;
      if (v.salaryGrade && !grades[v.salaryGrade]) E(`অজানা বেতন গ্রেড "${x.salaryGrade}" (${Object.keys(grades).join('/')})`);
      const base = x.baseSalary ? +String(x.baseSalary).replace(/[,৳\s]/g, '') : (v.salaryGrade ? grades[v.salaryGrade] : NaN);
      if (!(base > 0)) E(x.baseSalary ? `অবৈধ মূল বেতন "${x.baseSalary}"` : 'মূল বেতন অথবা বেতন গ্রেড আবশ্যক'); else v.baseSalary = Math.round(base);
      const pm = String(x.payoutMethod || 'Cash').trim();
      v.payoutMethod = ['Bank', 'Cash', ...MFS].find(m => m.toLowerCase() === pm.toLowerCase());
      if (!v.payoutMethod) E(`অজানা বেতন প্রদানের মাধ্যম "${x.payoutMethod}"`);
      if (v.name && (DB.s.staff || []).some(s => s.name.toLowerCase() === v.name.toLowerCase() && s.campusId === v.campusId)) W('এই ক্যাম্পাসে এই নামের একজন কর্মী ইতোমধ্যে রয়েছেন');
    });
  },

  check_teachers(rows) {
    const grades = DB.s.salaryGrades || {}, batchUsers = new Set();
    rows.forEach(r => {
      const x = r.raw, v = r.val, E = m => r.errors.push(m), W = m => r.warnings.push(m);
      v.name = (x.name || '').replace(/\s+/g, ' '); if (!v.name) E('নাম আবশ্যক');
      v.phone = this.normPhone(x.phone);
      if (!x.phone) E('ফোন নম্বর আবশ্যক'); else if (!this.validPhone(v.phone)) E(`ফোন "${x.phone}" অবশ্যই 01XXXXXXXXX আকারে হতে হবে`);
      if (this.validPhone(v.phone) && DB.s.users.some(u => u.phone === v.phone && DB.roles(u.id).includes('TEACHER'))) W('এই ফোন নম্বরের একজন শিক্ষক ইতোমধ্যে রয়েছেন');
      if (x.username) {
        v.username = x.username.toLowerCase();
        if (!/^[a-z0-9._]{3,30}$/.test(v.username)) E('ব্যবহারকারীর নাম ৩–৩০ অক্ষরের হতে হবে: a–z, 0–9, ডট, আন্ডারস্কোর');
        else if (DB.s.users.some(u => u.username.toLowerCase() === v.username) || batchUsers.has(v.username)) E(`ব্যবহারকারীর নাম "${v.username}" ইতোমধ্যে নেওয়া হয়েছে`);
        batchUsers.add(v.username);
      }
      v.email = (x.email || '').toLowerCase();
      if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) E(`অবৈধ ই-মেইল "${x.email}"`);
      else if (v.email && DB.s.users.some(u => (u.email || '').toLowerCase() === v.email)) E(`ই-মেইল "${v.email}" ইতোমধ্যে ব্যবহৃত হচ্ছে`);
      const cp = x.campus ? this.resolveCampus(x.campus) : DB.campus();
      if (!cp) E(`অজানা ক্যাম্পাস "${x.campus}"`); else { v.campusId = cp.id; if (!x.campus) W(`ক্যাম্পাস হিসেবে ${cp.name} ধরা হয়েছে`); }
      v.dept = x.dept || 'সাধারণ'; v.designation = x.designation || 'সহকারী শিক্ষক';
      v.subjects = [];
      String(x.subjects || '').split(/[;|\/]/).map(s => s.trim()).filter(Boolean).forEach(s => {
        const sub = DB.s.subjects.find(k => k.id.toLowerCase() === s.toLowerCase() || (k.code || '').toLowerCase() === s.toLowerCase() || k.name.toLowerCase() === s.toLowerCase());
        if (sub) { if (!v.subjects.includes(sub.id)) v.subjects.push(sub.id); } else E(`অজানা বিষয় "${s}"`);
      });
      if (!x.subjects) W('কোনো বিষয় নির্ধারিত হয়নি');
      v.salaryGrade = x.salaryGrade ? x.salaryGrade.toUpperCase() : null;
      if (v.salaryGrade && !grades[v.salaryGrade]) E(`অজানা বেতন গ্রেড "${x.salaryGrade}" (${Object.keys(grades).join('/')})`);
      const base = x.baseSalary ? +String(x.baseSalary).replace(/[,৳\s]/g, '') : (v.salaryGrade ? grades[v.salaryGrade] : NaN);
      if (!(base > 0)) E(x.baseSalary ? `অবৈধ মূল বেতন "${x.baseSalary}"` : 'মূল বেতন অথবা বেতন গ্রেড আবশ্যক'); else v.baseSalary = Math.round(base);
    });
  },

  /** Load a CSV into the preview (from the page's file input / paste box, or programmatically). */
  preview(kind, text, fileName = 'pasted.csv') {
    try { App.ui.dataImp = { kind, text, fileName, result: this.validate(kind, text) }; }
    catch (e) { return toast(e.message, 'error'); }
    App.ui.dataTab = 'import';
    App.refresh();
  },
  previewFile(file) {
    if (!file) return;
    const kind = App.ui.dataKind || 'students';
    const fr = new FileReader();
    fr.onload = () => this.preview(kind, fr.result, file.name);
    fr.onerror = () => toast('ফাইলটি পড়া যায়নি।', 'error');
    fr.readAsText(file);
  },
  previewPaste() { const t = $('#dio-paste')?.value || ''; if (!t.trim()) return toast('আগে সিএসভি লেখা পেস্ট করুন।', 'warn'); this.preview(App.ui.dataKind || 'students', t, 'pasted.csv'); },
  clearPreview() { App.ui.dataImp = null; App.refresh(); },

  /** Commit the valid rows of the current preview (re-validated against the live DB). Returns the summary. */
  commit() {
    const imp = App.ui.dataImp; if (!imp) return null;
    const res = this.validate(imp.kind, imp.text), ok = res.rows.filter(r => !r.errors.length);
    if (!ok.length) { toast('ইমপোর্ট করার মতো কোনো বৈধ সারি নেই।', 'error'); return null; }
    return this.commitRows(imp.kind, ok, imp.fileName, res.rows.length - ok.length);
  },
  /** Create the records of validated rows (DataIO.validate / CSVKit) — shared by this page and the CSV kit.
      Students: student / guardian sign-in accounts only when switched on (Accounts.on); a class without
      sections or shift gives '' (never undefined). The login sheet shows the passwords that really apply
      (LoginPolicy: student = registration no., guardian = mobile no.; otherwise the one-time 6-digit number). */
  commitRows(kind, ok, fileName = 'import.csv', skipped = 0) {
    const imp = { kind, fileName };
    const by = App.session?.userId || null, created = [], creds = [], pend = [];
    let guardiansNew = 0, guardiansLinked = 0;
    const acctOn = k => typeof Accounts === 'undefined' || Accounts.on(k);
    if (imp.kind === 'students') ok.forEach(r => {
      const v = r.val, c = DB.cls(v.classId), grade = c.grade, y = new Date().getFullYear();
      const temp = this.tempPw(), uname = this.uniqueUsername(`s${grade}${U.pad(v.roll)}${U.randStr(2, 'abcdefghjkmnpqrstuvwxyz23456789')}`);
      const su = acctOn('student') ? { id: DB.id('U'), name: v.name, nameBn: v.nameBn || undefined, username: uname, email: '', phone: v.guardianPhone, pwHash: U.pw(temp), active: true, createdAt: new Date().toISOString(), createdBy: by, photo: null } : null;
      if (su) { DB.s.users.push(su); DB.s.userRoles.push({ userId: su.id, role: 'STUDENT' }); }
      const section = v.section ?? (c.sections?.[0] || ''), shift = v.shift ?? (c.shift || '');
      const st = { id: DB.id('S'), userId: su ? su.id : null, name: v.name, ...(v.nameBn ? { nameBn: v.nameBn } : {}), classId: v.classId, section, shift, roll: v.roll, regNo: v.regNo || `${y}${c.campusId === 'MAIN' ? 'M' : 'N'}${U.pad(grade)}${U.pad(v.roll, 3)}${U.randStr(1, '0123456789')}`, dob: v.dob, gender: v.gender, blood: v.blood, medical: 'None', emergency: v.guardianPhone, admissionDate: v.admissionDate || U.today(), previousSchool: v.previousSchool || '', status: 'active', photo: null, fatherName: v.fatherName, motherName: v.motherName, ...(v.fatherNameBn ? { fatherNameBn: v.fatherNameBn } : {}), ...(v.motherNameBn ? { motherNameBn: v.motherNameBn } : {}), birthRegNo: v.birthRegNo || '', fatherNid: '', motherNid: '', address: v.address || '', religion: v.religion || '', stream: v.stream || null, guardianName: v.guardianName || '', guardianPhone: v.guardianPhone, guardianRelation: v.guardianRelation, scholarshipPct: 0, importRef: imp.fileName };
      DB.s.students.push(st);
      // Reuse an existing guardian login (sibling linking) when the phone matches — same rule as Principal.approve.
      let g = DB.s.users.find(u => u.phone === v.guardianPhone && DB.roles(u.id).includes('GUARDIAN')), gTemp = null;
      if (!g && acctOn('guardian')) {
        gTemp = this.tempPw();
        const gname = this.uniqueUsername(`g${v.guardianPhone.slice(-6)}`);
        g = { id: DB.id('U'), name: v.guardianName, username: gname, email: '', phone: v.guardianPhone, pwHash: U.pw(gTemp), active: true, createdAt: new Date().toISOString(), createdBy: by, photo: null };
        DB.s.users.push(g); DB.s.userRoles.push({ userId: g.id, role: 'GUARDIAN' }); guardiansNew++;
      } else if (g) guardiansLinked++;
      if (g) DB.s.guardianLinks.push({ guardianUserId: g.id, studentId: st.id, relation: v.guardianRelation });
      DB.s.attendance[st.id] = {};
      created.push({ id: st.id, name: st.name, detail: `${DB.className(st.classId)}${section ? '-' + section : ''} · রোল ${bnNum(st.roll)}` });
      if (su) pend.push({ who: st.name, role: 'শিক্ষার্থী', uid: su.id, temp, policy: () => String(st.regNo) });
      if (gTemp) pend.push({ who: g.name, role: 'অভিভাবক', uid: g.id, temp: gTemp, policy: () => g.phone });
    });
    if (imp.kind === 'staff') ok.forEach(r => {
      const v = r.val, method = v.payoutMethod;
      const s = { id: DB.id('ST'), name: v.name, type: v.type, designation: v.designation, campusId: v.campusId, phone: v.phone, email: '', joinDate: U.today(), salaryGrade: v.salaryGrade, baseSalary: v.baseSalary, payoutMethod: method, payoutAccount: MFS.includes(method) ? v.phone : '', status: 'Probation', blood: '', nid: '', photo: null, userId: null, overtimeHours: {} };
      (DB.s.staff || (DB.s.staff = [])).push(s);
      (DB.s.teacherAbsences || (DB.s.teacherAbsences = {}))[s.id] = {};
      created.push({ id: s.id, name: s.name, detail: `${bn(s.type)} · ${this.campusName(s.campusId)}` });
    });
    if (imp.kind === 'teachers') ok.forEach(r => {
      const v = r.val, first = v.name.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.|Engr\.)\s*/i, '').split(/\s+/)[0];
      const uname = v.username && !DB.s.users.some(u => u.username.toLowerCase() === v.username) ? v.username : this.uniqueUsername(first);
      const temp = this.tempPw();
      const u = { id: DB.id('U'), name: v.name, username: uname, email: v.email || '', phone: v.phone, pwHash: U.pw(temp), active: true, createdAt: new Date().toISOString(), createdBy: by, photo: null };
      DB.s.users.push(u); DB.s.userRoles.push({ userId: u.id, role: 'TEACHER' });
      const t = { id: DB.id('T'), userId: u.id, campusId: v.campusId, dept: v.dept, designation: v.designation, salaryGrade: v.salaryGrade, baseSalary: v.baseSalary, isHead: false, subjects: v.subjects, joinDate: U.today(), status: 'Probation', payoutMethod: 'Bank', payoutAccount: '', qualification: '', bio: '', showContact: true, overtimeHours: {} };
      DB.s.teachers.push(t);
      (DB.s.teacherAbsences || (DB.s.teacherAbsences = {}))[t.id] = {};
      created.push({ id: t.id, name: v.name, detail: `${t.designation} · ${this.campusName(t.campusId)} · ${t.subjects.join(', ') || 'কোনো বিষয় নেই'}` });
      creds.push({ who: v.name, role: 'শিক্ষক', username: uname, password: temp });
    });
    const extra = imp.kind === 'students' ? ` (${guardiansNew}টি অভিভাবক লগইন তৈরি, ${guardiansLinked}টি বিদ্যমান অভিভাবকের সঙ্গে সংযুক্ত)` : '';
    DB.audit('DATA_IMPORT', imp.kind, `${imp.fileName} থেকে ${ok.length}টি ${this.KINDS[imp.kind].label}-সারি ইমপোর্ট করা হয়েছে${extra}${skipped ? `; ${skipped}টি অবৈধ সারি বাদ পড়েছে` : ''}`);
    DB.save();   // applies the login-ID policy to the new student / guardian accounts
    pend.forEach(p => { const u = DB.user(p.uid); if (u) creds.push({ who: p.who, role: p.role, username: u.username, password: u.loginPolicy === 'v1' ? p.policy() : p.temp }); });
    const summary = { kind: imp.kind, imported: ok.length, skipped, guardiansNew, guardiansLinked, created, creds };
    App.ui.dataImp = null; App.ui.dataLast = summary;
    App.refresh();
    this.showSummary(summary);
    toast(`${bnNum(ok.length)} জন ${this.KINDS[imp.kind].label} ইমপোর্ট হয়েছে।`, 'success');
    return summary;
  },
  showSummary(s = App.ui.dataLast) {
    if (!s) return;
    Modal.open({
      title: `ইমপোর্ট সম্পন্ন · ${esc(this.KINDS[s.kind].label)}`, size: 'lg',
      body: `<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-center">
          <div class="rounded-xl bg-emerald-50 p-3"><div class="text-xs text-slate-500">ইমপোর্টকৃত</div><div class="text-xl font-bold text-emerald-700">${bnNum(s.imported)}</div></div>
          <div class="rounded-xl ${s.skipped ? 'bg-red-50' : 'bg-slate-50'} p-3"><div class="text-xs text-slate-500">বাদ পড়েছে (অবৈধ)</div><div class="text-xl font-bold ${s.skipped ? 'text-red-700' : ''}">${bnNum(s.skipped)}</div></div>
          ${s.kind === 'students' ? `<div class="rounded-xl bg-blue-50 p-3"><div class="text-xs text-slate-500">নতুন অভিভাবক</div><div class="text-xl font-bold text-blue-700">${bnNum(s.guardiansNew)}</div></div><div class="rounded-xl bg-violet-50 p-3"><div class="text-xs text-slate-500">সংযুক্ত (ভাইবোন)</div><div class="text-xl font-bold text-violet-700">${bnNum(s.guardiansLinked)}</div></div>` : ''}</div>
        <div class="card scroll-x mb-4 max-h-60 overflow-y-auto"><table class="table text-sm"><thead><tr><th>আইডি</th><th>নাম</th><th>বিবরণ</th></tr></thead><tbody>${s.created.map(c => `<tr><td class="font-mono text-xs">${esc(c.id)}</td><td>${esc(c.name)}</td><td class="text-slate-500">${esc(c.detail)}</td></tr>`).join('')}</tbody></table></div>
        ${s.creds.length ? `<div class="card p-3 bg-amber-50 border-amber-200 text-sm"><div class="font-semibold text-amber-800 mb-1 flex items-center gap-1.5">${icon('key-round')} ${bnNum(s.creds.length)}টি এককালীন লগইন তৈরি হয়েছে — নিরাপদে হস্তান্তর করুন</div><p class="text-xs text-amber-800">পাসওয়ার্ড কেবল এখনই দেখানো হচ্ছে। বন্ধ করার আগে লগইন-তথ্যের শিটটি ডাউনলোড করুন; ব্যবহারকারীগণ প্রথমবার লগইনের সময় পাসওয়ার্ড পরিবর্তন করবেন।</p></div>` : ''}`,
      footer: `${s.creds.length ? `<button class="btn btn-ghost" onclick="DataIO.downloadCreds()">${icon('download')} লগইন-তথ্য সিএসভি</button>` : ''}<button class="btn btn-primary" onclick="Modal.close()">সম্পন্ন</button>`,
    });
  },
  downloadCreds() {
    const s = App.ui.dataLast; if (!s || !s.creds.length) return;
    this.csvDownload(`import-credentials-${s.kind}-${this.stamp()}.csv`, [['name', 'role', 'username', 'oneTimePassword'], ...s.creds.map(c => [c.who, c.role, c.username, c.password])]);
    DB.audit('CREDENTIALS_EXPORT', 'users', `ইমপোর্টকৃত ${s.creds.length}টি অ্যাকাউন্টের এককালীন লগইন-তথ্যের শিট ডাউনলোড করা হয়েছে`); DB.save();
  },

  /* ==========================================================================
     BACKUPS — JSON, SQL dump, restore
     ========================================================================== */
  recordBackup(kind, bytes, status = 'Downloaded') {
    const kb = Math.max(1, Math.round(bytes / 1024));
    DB.s.backups.push({ id: DB.id('BK'), ts: new Date().toISOString(), kind, sizeKb: kb, status, by: App.session?.userId || null });
    return kb;
  },
  backupJson() {
    const json = JSON.stringify(DB.s, null, 1), bytes = new Blob([json]).size;
    const kb = this.recordBackup('Manual export (JSON)', bytes);
    DB.audit('DB_BACKUP', 'system', `হাতে করা JSON ব্যাকআপ (${kb} কেবি)`); DB.save();
    downloadFile(`dhee-backup-${this.stamp()}.json`, JSON.stringify(DB.s, null, 1), 'application/json');
    App.refresh();
  },
  exportSql() {
    const sql = this.sqlDump(), bytes = new Blob([sql]).size;
    const kb = this.recordBackup('Manual export (PostgreSQL SQL)', bytes);
    DB.audit('DB_EXPORT_SQL', 'system', `PostgreSQL ডাম্প এক্সপোর্ট করা হয়েছে (${kb} কেবি)`); DB.save();
    downloadFile(`dhee-dump-${this.stamp()}.sql`, sql, 'application/sql');
    App.refresh();
  },
  restore(file) {
    if (!file) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const data = JSON.parse(fr.result);
        const err = this.checkBackup(data); if (err) throw new Error(err);
        if (!confirm(`"${file.name}" পুনরুদ্ধার করবেন?\n\n${bnNum(data.students.length)} জন শিক্ষার্থী · ${bnNum(data.users.length)} জন ব্যবহারকারী · ${bnNum((data.invoices || []).length)}টি বিল · প্রতিষ্ঠান "${data.school.nameBn || data.school.name}"।\n\nবর্তমানের সকল ডেটা প্রতিস্থাপিত হবে। নিশ্চিত না হলে আগে একটি ব্যাকআপ নিন।`)) return;
        const keepBackups = [...(DB.s.backups || [])];
        DB.s = data;
        DB.runSeeders();
        // Keep the backup history of this installation, plus whatever the file carried.
        const ids = new Set((DB.s.backups || []).map(b => b.id));
        DB.s.backups = [...(DB.s.backups || []), ...keepBackups.filter(b => !ids.has(b.id))].sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
        DB.s.backups.push({ id: DB.id('BK'), ts: new Date().toISOString(), kind: `Restored from ${file.name}`, sizeKb: Math.round(file.size / 1024), status: 'Restored', by: App.session?.userId || null });
        DB.audit('DB_RESTORE', 'system', `${file.name} থেকে পুনরুদ্ধার করা হয়েছে (${data.students.length} জন শিক্ষার্থী, ${data.users.length} জন ব্যবহারকারী)`);
        DB.save();
        try { Theme.apply(); } catch (e) { }
        toast('ডেটাবেস পুনরুদ্ধার করা হয়েছে।', 'success');
        if (App.session && !DB.user(App.session.userId)) return App.logout();
        App.render();
      } catch (e) { toast(`পুনরুদ্ধার ব্যর্থ হয়েছে: ${e.message}`, 'error'); }
    };
    fr.onerror = () => toast('ফাইলটি পড়া যায়নি।', 'error');
    fr.readAsText(file);
  },
  /** Returns an error string, or null when the object looks like a Dhee SMS state snapshot. */
  checkBackup(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) return 'এটি কোনো JSON অবজেক্ট নয়।';
    if (!Array.isArray(d.users) || !d.users.length) return 'ব্যাকআপে কোনো ব্যবহারকারী নেই।';
    if (!Array.isArray(d.students)) return 'ব্যাকআপে শিক্ষার্থীর তালিকা নেই।';
    if (!d.school || typeof d.school !== 'object' || !d.school.name) return 'ব্যাকআপে প্রতিষ্ঠানের প্রোফাইল নেই।';
    for (const k of ['userRoles', 'classes', 'campuses']) if (!Array.isArray(d[k])) return `ব্যাকআপে "${k}" অনুপস্থিত।`;
    if (!d.userRoles.some(r => r.role === 'ADMIN' || r.role === 'SUPERADMIN')) return 'ব্যাকআপে কোনো রুট ব্যবহারকারী অ্যাকাউন্ট নেই — আপনাকে অবরুদ্ধ হওয়া থেকে রক্ষা করতে পুনরুদ্ধার প্রত্যাখ্যান করা হলো।';
    return null;
  },

  /* ---------- PostgreSQL dump ---------- */
  sqlLit(v, type) {
    if (v === undefined || v === null) return 'NULL';
    if (type === 'jsonb') return `${this.sqlStr(JSON.stringify(v))}::jsonb`;
    if (type === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (type === 'integer' || type === 'numeric') { const n = typeof v === 'number' ? v : (v === '' ? NaN : +v); return Number.isFinite(n) ? String(type === 'integer' ? Math.round(n) : n) : 'NULL'; }
    if (type === 'date') { const s = String(v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `'${s}'` : 'NULL'; }
    if (type === 'timestamptz') { const t = new Date(v); return isNaN(t) ? 'NULL' : `'${t.toISOString()}'`; }
    return this.sqlStr(typeof v === 'object' ? JSON.stringify(v) : String(v));
  },
  sqlStr(s) { return `'${String(s).replace(/\u0000/g, '').replace(/'/g, "''")}'`; },
  sqlIdent(n) { return /^[a-z_][a-z0-9_]*$/.test(n) && !['user', 'order', 'group', 'date', 'from', 'to', 'type', 'desc'].includes(n) ? n : `"${n.replace(/"/g, '""')}"`; },
  /** Table specs: cols = [sqlName, type, sourceKey | fn(row)]; `extra` stores unmapped keys as jsonb. */
  sqlTables() {
    const s = DB.s, T = (name, rows, cols, opt = {}) => ({ name, rows: rows || [], cols, pk: opt.pk, extra: opt.extra !== false });
    const lines = (s.journal || []).flatMap(v => (v.lines || []).map((l, i) => ({ voucherId: v.id, n: i + 1, ...l })));
    return [
      T('campuses', s.campuses, [['id', 'text', 'id'], ['name', 'text', 'name'], ['short', 'text', 'short'], ['address', 'text', 'address'], ['phone', 'text', 'phone'], ['levels', 'text', 'levels']], { pk: 'id' }),
      T('users', s.users, [['id', 'text', 'id'], ['name', 'text', 'name'], ['username', 'text', 'username'], ['email', 'text', 'email'], ['phone', 'text', 'phone'], ['password_hash', 'text', 'pwHash'], ['photo_url', 'text', 'photo'], ['active', 'boolean', 'active'], ['created_by', 'text', 'createdBy'], ['created_at', 'timestamptz', 'createdAt']], { pk: 'id' }),
      T('user_roles', s.userRoles, [['user_id', 'text', 'userId'], ['role', 'text', 'role']], { pk: 'user_id, role', extra: false }),
      T('classes', s.classes, [['id', 'text', 'id'], ['campus_id', 'text', 'campusId'], ['grade', 'integer', 'grade'], ['name', 'text', 'name'], ['sections', 'jsonb', 'sections'], ['shift', 'text', 'shift'], ['capacity', 'integer', 'capacity'], ['class_teacher_id', 'text', 'classTeacherId']], { pk: 'id' }),
      T('subjects', s.subjects, [['id', 'text', 'id'], ['code', 'text', 'code'], ['name', 'text', 'name']], { pk: 'id' }),
      T('students', s.students, [['id', 'text', 'id'], ['user_id', 'text', 'userId'], ['name', 'text', 'name'], ['class_id', 'text', 'classId'], ['section', 'text', 'section'], ['roll', 'integer', 'roll'], ['reg_no', 'text', 'regNo'], ['dob', 'date', 'dob'], ['gender', 'text', 'gender'], ['blood_group', 'text', 'blood'], ['medical', 'text', 'medical'], ['emergency_phone', 'text', 'emergency'], ['father_name', 'text', 'fatherName'], ['mother_name', 'text', 'motherName'], ['admission_date', 'date', 'admissionDate'], ['address', 'text', 'address'], ['status', 'text', 'status'], ['photo_url', 'text', 'photo']], { pk: 'id' }),
      T('teachers', s.teachers, [['id', 'text', 'id'], ['user_id', 'text', 'userId'], ['campus_id', 'text', 'campusId'], ['dept', 'text', 'dept'], ['designation', 'text', 'designation'], ['subjects', 'jsonb', 'subjects'], ['salary_grade', 'text', 'salaryGrade'], ['base_salary', 'numeric', 'baseSalary'], ['is_head', 'boolean', 'isHead'], ['join_date', 'date', 'joinDate'], ['status', 'text', 'status'], ['payout_method', 'text', 'payoutMethod'], ['payout_account', 'text', 'payoutAccount']], { pk: 'id' }),
      T('staff', s.staff, [['id', 'text', 'id'], ['name', 'text', 'name'], ['type', 'text', 'type'], ['designation', 'text', 'designation'], ['campus_id', 'text', 'campusId'], ['phone', 'text', 'phone'], ['email', 'text', 'email'], ['join_date', 'date', 'joinDate'], ['salary_grade', 'text', 'salaryGrade'], ['base_salary', 'numeric', 'baseSalary'], ['payout_method', 'text', 'payoutMethod'], ['payout_account', 'text', 'payoutAccount'], ['status', 'text', 'status'], ['user_id', 'text', 'userId']], { pk: 'id' }),
      T('guardian_links', s.guardianLinks, [['guardian_user_id', 'text', 'guardianUserId'], ['student_id', 'text', 'studentId'], ['relation', 'text', 'relation']], { pk: 'guardian_user_id, student_id', extra: false }),
      T('invoices', s.invoices, [['id', 'text', 'id'], ['student_id', 'text', 'studentId'], ['month', 'text', 'month'], ['item', 'text', 'item'], ['amount', 'numeric', 'amount'], ['status', 'text', 'status'], ['due', 'date', 'due'], ['kind', 'text', 'kind'], ['payment_id', 'text', 'paymentId']], { pk: 'id' }),
      T('payments', s.payments, [['id', 'text', 'id'], ['student_id', 'text', 'studentId'], ['invoice_ids', 'jsonb', 'invoiceIds'], ['amount', 'numeric', 'amount'], ['method', 'text', 'method'], ['txn', 'text', 'txn'], ['msisdn', 'text', 'msisdn'], ['channel', 'text', 'channel'], ['verified', 'boolean', 'verified'], ['paid_on', 'date', 'date'], ['received_by', 'text', 'by']], { pk: 'id' }),
      T('accounts', s.accounts, [['code', 'text', 'code'], ['name', 'text', 'name'], ['type', 'text', 'type'], ['category', 'text', 'category']], { pk: 'code' }),
      T('journal_vouchers', s.journal, [['id', 'text', 'id'], ['voucher_date', 'date', 'date'], ['memo', 'text', 'memo'], ['ref', 'text', 'ref'], ['kind', 'text', 'kind'], ['campus_id', 'text', 'campusId'], ['payee', 'text', 'payee'], ['posted_by', 'text', 'postedBy'], ['lines', 'jsonb', 'lines']], { pk: 'id' }),
      T('journal_lines', lines, [['voucher_id', 'text', 'voucherId'], ['line_no', 'integer', 'n'], ['account_code', 'text', 'acct'], ['debit', 'numeric', r => +r.dr || 0], ['credit', 'numeric', r => +r.cr || 0]], { pk: 'voucher_id, line_no', extra: false }),
      T('exams', s.exams, [['id', 'text', 'id'], ['name', 'text', 'name'], ['type', 'text', 'type'], ['session_id', 'text', 'session'], ['cq_max', 'integer', 'cqMax'], ['mcq_max', 'integer', 'mcqMax'], ['pr_max', 'integer', 'prMax'], ['cq_pass', 'integer', 'cqPass'], ['mcq_pass', 'integer', 'mcqPass'], ['pr_pass', 'integer', 'prPass'], ['weight', 'numeric', 'weight'], ['published', 'boolean', 'published'], ['start_date', 'date', 'start']], { pk: 'id' }),
      T('marks', s.marks, [['exam_id', 'text', 'examId'], ['student_id', 'text', 'studentId'], ['subject_id', 'text', 'subjectId'], ['cq', 'numeric', 'cq'], ['mcq', 'numeric', 'mcq'], ['pr', 'numeric', 'pr']], { pk: 'exam_id, student_id, subject_id' }),
      T('admissions', s.admissions, [['id', 'text', 'id'], ['campus_id', 'text', 'campusId'], ['student_name', 'text', 'studentName'], ['class_id', 'text', 'classId'], ['dob', 'date', 'dob'], ['gender', 'text', 'gender'], ['guardian_name', 'text', 'guardianName'], ['guardian_phone', 'text', 'guardianPhone'], ['status', 'text', 'status'], ['fee', 'numeric', 'fee'], ['net_paid', 'numeric', 'netPaid'], ['payment', 'jsonb', 'payment'], ['docs', 'jsonb', 'docs'], ['submitted_at', 'timestamptz', 'submittedAt'], ['decided_at', 'timestamptz', 'decidedAt'], ['student_id', 'text', 'studentId']], { pk: 'id' }),
      T('notices', s.notices, [['id', 'text', 'id'], ['category', 'text', 'category'], ['title', 'text', 'title'], ['notice_date', 'date', 'date'], ['body', 'text', 'body'], ['pinned', 'boolean', r => !!r.pinned]], { pk: 'id' }),
      T('certificates', s.certificates, [['serial', 'text', 'serial'], ['type', 'text', 'type'], ['student_name', 'text', 'studentName'], ['father_name', 'text', 'fatherName'], ['class_left', 'text', 'classLeft'], ['roll', 'integer', 'roll'], ['issue_date', 'date', 'issueDate'], ['reason', 'text', 'reason'], ['conduct', 'text', 'conduct'], ['dues_cleared', 'boolean', 'duesCleared']], { pk: 'serial' }),
    ];
  },
  sqlDump() {
    const out = [], tables = this.sqlTables(), sch = DB.s.school;
    out.push(`-- Dhee SMS — PostgreSQL data dump`, `-- Institution: ${String(sch.name).replace(/\n/g, ' ')} (EIIN ${sch.eiin})`, `-- Generated: ${new Date().toISOString()} · session ${DB.session()}`,
      `-- Simplified, self-contained relational export of the data.`, `-- Unmapped fields of each record are preserved in the "extra" jsonb column.`, '',
      `SET client_encoding = 'UTF8';`, `SET standard_conforming_strings = on;`, `BEGIN;`, '');
    tables.forEach(t => {
      const cols = t.cols.map(([n, ty]) => `  ${this.sqlIdent(n)} ${ty}`);
      if (t.extra) cols.push('  extra jsonb');
      if (t.pk) cols.push(`  PRIMARY KEY (${t.pk.split(',').map(x => this.sqlIdent(x.trim())).join(', ')})`);
      out.push(`-- ${t.name}: ${t.rows.length} row(s)`, `CREATE TABLE IF NOT EXISTS ${this.sqlIdent(t.name)} (\n${cols.join(',\n')}\n);`);
      if (!t.rows.length) { out.push(''); return; }
      const mapped = new Set(t.cols.map(c => c[2]).filter(k => typeof k === 'string'));
      const colList = [...t.cols.map(c => this.sqlIdent(c[0])), ...(t.extra ? ['extra'] : [])].join(', ');
      for (let i = 0; i < t.rows.length; i += 250) {
        const vals = t.rows.slice(i, i + 250).map(r => {
          const v = t.cols.map(([, ty, k]) => this.sqlLit(typeof k === 'function' ? k(r) : r[k], ty));
          if (t.extra) { const ex = {}; Object.keys(r).forEach(k => { if (!mapped.has(k) && r[k] !== undefined) ex[k] = r[k]; }); v.push(Object.keys(ex).length ? this.sqlLit(ex, 'jsonb') : 'NULL'); }
          return `  (${v.join(', ')})`;
        });
        out.push(`INSERT INTO ${this.sqlIdent(t.name)} (${colList}) VALUES\n${vals.join(',\n')}${t.pk ? '\nON CONFLICT DO NOTHING' : ''};`);
      }
      out.push('');
    });
    out.push(`-- Institution profile & settings as one jsonb document`, `CREATE TABLE IF NOT EXISTS school_settings (key text PRIMARY KEY, value jsonb);`,
      `INSERT INTO school_settings (key, value) VALUES\n${['school', 'theme', 'featureFlags', 'calendar', 'feeConfigs', 'gradingSchemes', 'sessions'].filter(k => DB.s[k] !== undefined).map(k => `  (${this.sqlStr(k)}, ${this.sqlLit(DB.s[k], 'jsonb')})`).join(',\n')}\nON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`, '', 'COMMIT;', '');
    return out.join('\n');
  },

  /* ==========================================================================
     PAGE
     ========================================================================== */
  /* The tabs আমদানি / রপ্তানি / ব্যাকআপ ও পুনরুদ্ধার of ডাটাবেজ ব্যবস্থাপনা (js/modules/hubs.js). */
  renderExport() {
    const cp = this.scope(), inS = id => cp === 'ALL' || id === cp;
    const n = {
      students: DB.s.students.filter(s => inS(DB.campusOf(s.classId))).length, teachers: DB.s.teachers.filter(t => inS(t.campusId)).length, staff: (DB.s.staff || []).filter(s => inS(s.campusId)).length,
      invoices: DB.s.invoices.filter(i => inS(DB.campusOf(DB.student(i.studentId)?.classId))).length, payments: DB.s.payments.filter(p => inS(DB.campusOf(DB.student(p.studentId)?.classId))).length,
    };
    const item = (fn, ic, title, desc, count) => `<div class="card p-4 flex items-start gap-3"><div class="rounded-xl p-2.5 bg-brand-50 text-brand-700">${icon(ic, 'w-5 h-5')}</div><div class="flex-1 min-w-0"><div class="font-semibold">${title}</div><div class="text-xs text-slate-500 mt-0.5">${multiCampus() ? desc : desc.replace(/, ক্যাম্পাস/g, '')}</div><div class="text-xs text-slate-400 mt-1">${bnNum(count, true)}টি সারি</div></div><button class="btn btn-primary btn-sm shrink-0" onclick="DataIO.${fn}()">${icon('download')} সিএসভি</button></div>`;
    return `<div class="flex flex-wrap items-center gap-2 mb-4">${multiCampus() ? `<label class="text-sm font-semibold text-slate-600" for="dio-cp">ক্যাম্পাস</label><select id="dio-cp" class="select !w-auto" onchange="App.ui.dataCampus=this.value;App.refresh()">${campusOptions(cp, true)}</select>` : ''}</div>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        ${item('exportStudents', 'graduation-cap', 'শিক্ষার্থী', 'আইডি, নাম, শ্রেণি, রোল, নিবন্ধন নম্বর, জন্মতারিখ, লিঙ্গ, রক্তের গ্রুপ, অভিভাবক, ক্যাম্পাস, অবস্থা', n.students)}
        ${item('exportTeachers', 'presentation', 'শিক্ষক', 'লগইন, যোগাযোগ, ক্যাম্পাস, বিভাগ, পদবি, বিষয়, বেতন গ্রেড', n.teachers)}
        ${item('exportStaff', 'hard-hat', 'সহায়ক কর্মী', 'ধরন, পদবি, ক্যাম্পাস, ফোন, বেতন, বেতন প্রদানের মাধ্যম', n.staff)}
        ${item('exportInvoices', 'receipt', 'বিল', 'অবস্থা, পরিশোধের শেষ তারিখ ও সংযুক্ত পরিশোধসহ সকল ফি-র বিল', n.invoices)}
        ${item('exportPayments', 'banknote', 'পরিশোধ', 'মাধ্যম, ট্রানজ্যাকশন আইডি (TrxID), চ্যানেল ও যাচাইয়ের অবস্থাসহ রসিদ', n.payments)}
      </div>`;
  },
  renderImport() {
    const kind = App.ui.dataKind || 'students', def = this.KINDS[kind], imp = App.ui.dataImp;
    const kinds = Object.entries(this.KINDS).map(([k, d]) => `<button class="btn btn-sm ${k === kind ? 'btn-primary' : 'btn-ghost'}" onclick="App.ui.dataKind='${k}';App.ui.dataImp=null;App.refresh()">${icon(d.icon)} ${d.label}</button>`).join('');
    const setup = `<div class="card p-5 mb-5"><div class="flex flex-wrap gap-2 mb-4">${kinds}</div>
      <div class="grid lg:grid-cols-2 gap-5">
        <div class="space-y-3 text-sm">
          <div><div class="label">কলাম</div><div class="flex flex-wrap gap-1">${def.cols.map(c => badge(c + (def.required.includes(c) ? ' *' : ''), def.required.includes(c) ? 'green' : 'slate')).join('')}</div></div>
          <p class="text-slate-600">${esc(def.notes)}</p>
          <button class="btn btn-ghost btn-sm" onclick="DataIO.template('${kind}')">${icon('file-spreadsheet')} ${esc(def.label)}-এর টেমপ্লেট ডাউনলোড করুন</button>
        </div>
        <div class="space-y-3">
          <label class="block border-2 border-dashed border-slate-300 rounded-xl p-5 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/40">${icon('upload', 'w-6 h-6 mx-auto text-slate-400')}<div class="text-sm font-semibold mt-1">একটি সিএসভি ফাইল নির্বাচন করুন</div><input type="file" accept=".csv,text/csv" class="hidden" onchange="DataIO.previewFile(this.files[0]);this.value=''"></label>
          <details><summary class="text-sm text-slate-500 cursor-pointer">…অথবা সিএসভি লেখা পেস্ট করুন</summary><textarea id="dio-paste" class="textarea mt-2 font-mono text-xs" rows="5" placeholder="${esc(def.cols.join(','))}"></textarea><button class="btn btn-ghost btn-sm mt-2" onclick="DataIO.previewPaste()">${icon('scan-eye')} প্রিভিউ</button></details>
        </div>
      </div></div>`;
    const last = App.ui.dataLast && !imp ? `<div class="card p-3 mb-5 flex flex-wrap items-center justify-between gap-2 text-sm bg-emerald-50 border-emerald-200"><span>${icon('circle-check', 'w-4 h-4 inline text-emerald-600')} সর্বশেষ ইমপোর্ট: <b>${bnNum(App.ui.dataLast.imported)}</b> জন ${esc(this.KINDS[App.ui.dataLast.kind].label)} ইমপোর্ট হয়েছে${App.ui.dataLast.skipped ? `, ${bnNum(App.ui.dataLast.skipped)}টি বাদ পড়েছে` : ''}।</span><button class="btn btn-ghost btn-sm" onclick="DataIO.showSummary()">সারসংক্ষেপ দেখুন</button></div>` : '';
    return setup + last + (imp ? this.renderPreview(imp) : '');
  },
  renderPreview(imp) {
    const r = imp.result, def = this.KINDS[imp.kind], ok = r.rows.filter(x => !x.errors.length).length, bad = r.rows.length - ok;
    const cols = def.cols.filter(c => r.header.includes(c) && (c !== 'campus' || multiCampus()));
    const shown = (row, c) => {
      const v = row.val;
      if (imp.kind === 'students' && c === 'roll' && v.roll) return `${bnNum(v.roll)}${v.autoRoll ? ' <span class="text-[10px] text-slate-400">স্বয়ংক্রিয়</span>' : ''}`;
      if (imp.kind === 'students' && c === 'class' && v.classId) return esc(DB.className(v.classId));
      if (c === 'campus' && v.campusId) return esc(DB.campus(v.campusId)?.short || v.campusId);
      if (Array.isArray(v[c])) return esc(v[c].join(', '));
      if (v[c] !== undefined && v[c] !== null && v[c] !== '' && typeof v[c] !== 'object') return esc(v[c]);
      return esc(row.raw[c] || '');
    };
    return `<div class="card">
      <div class="px-5 py-3 border-b border-slate-100 flex flex-wrap justify-between items-center gap-2">
        <div class="font-semibold">প্রিভিউ · ${esc(imp.fileName)} <span class="text-xs font-normal text-slate-500">${bnNum(r.rows.length)}টি সারি · ${def.label}</span></div>
        <div class="flex flex-wrap gap-2 items-center">${badge(`${bnNum(ok)}টি বৈধ`, 'green')}${bad ? badge(`${bnNum(bad)}টিতে ত্রুটি`, 'red') : ''}
          <button class="btn btn-ghost btn-sm" onclick="DataIO.clearPreview()">বাতিল করুন</button>
          <button class="btn btn-success btn-sm" ${ok ? '' : 'disabled'} onclick="DataIO.commit()">${icon('check')} ${bnNum(ok)}টি বৈধ সারি ইমপোর্ট করুন${bad ? ` · ${bnNum(bad)}টি বাদ দিন` : ''}</button></div>
      </div>
      ${r.missing.length ? `<div class="px-5 py-2 text-sm text-red-700 bg-red-50">আবশ্যক কলাম অনুপস্থিত: <b>${esc(r.missing.join(', '))}</b>। প্রত্যাশিত শিরোনাম-সারির জন্য টেমপ্লেট ডাউনলোড করুন।</div>` : ''}
      ${r.unknown.length ? `<div class="px-5 py-2 text-xs text-amber-800 bg-amber-50">উপেক্ষিত কলাম: ${esc(r.unknown.join(', '))}</div>` : ''}
      <div class="scroll-x max-h-[60vh] overflow-y-auto"><table class="table text-sm"><thead><tr><th>লাইন</th><th>অবস্থা</th>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>
      ${r.rows.map(row => `<tr class="${row.errors.length ? 'bg-red-50/60' : ''}"><td class="text-xs text-slate-400">${bnNum(row.line)}</td>
        <td class="min-w-[200px]">${row.errors.length ? row.errors.map(e => `<div class="text-xs text-red-700">✕ ${esc(e)}</div>`).join('') : `<div class="text-xs text-emerald-700 font-semibold">✓ প্রস্তুত</div>`}${row.warnings.map(w => `<div class="text-[11px] text-amber-700">! ${esc(w)}</div>`).join('')}</td>
        ${cols.map(c => `<td class="whitespace-nowrap">${shown(row, c)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length + 2}">${emptyState('ফাইলে শিরোনাম-সারি আছে, কিন্তু কোনো ডেটা-সারি নেই।')}</td></tr>`}
      </tbody></table></div></div>`;
  },
  renderBackup() {
    const list = [...(DB.s.backups || [])].reverse();
    const auto = list.filter(b => /automated|scheduled/i.test(b.kind)), manual = list.length - auto.length;
    let curKb = 0; try { curKb = Math.round(JSON.stringify(DB.s).length / 1024); } catch (e) { }
    const tone = b => /restor/i.test(b.kind) ? 'violet' : /automated|scheduled/i.test(b.kind) ? 'blue' : 'green';
    return `<div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        ${kpi('বর্তমান ডেটাবেস', `${bnNum(curKb, true)} কেবি`, `${bnNum(DB.s.users.length)} জন ব্যবহারকারী · ${bnNum(DB.s.students.length)} জন শিক্ষার্থী`, 'database', 'blue')}
        ${kpi('সর্বশেষ ব্যাকআপ', list[0] ? U.fmtDate(list[0].ts) : '—', list[0] ? esc(this.kindLabel(list[0].kind)) : 'এখনো কোনো ব্যাকআপ নেই', 'history', 'green')}
        ${kpi('স্বয়ংক্রিয় স্ন্যাপশট', bnNum(auto.length), DB.s.featureFlags.autoBackup ? 'দৈনিক ক্লাউড ব্যাকআপ চালু' : 'দৈনিক ক্লাউড ব্যাকআপ বন্ধ', 'cloud', DB.s.featureFlags.autoBackup ? 'green' : 'red')}
        ${kpi('হাতে করা এক্সপোর্ট', bnNum(manual), 'JSON, SQL ও পুনরুদ্ধার', 'hard-drive-download', 'violet')}
      </div>
      <div class="grid lg:grid-cols-3 gap-5">
        <div class="lg:col-span-2 card"><div class="px-5 py-3 border-b border-slate-100 font-semibold flex flex-wrap justify-between items-center gap-2">ব্যাকআপের ইতিহাস
          <div class="flex flex-wrap gap-2"><button class="btn btn-primary btn-sm" onclick="DataIO.backupJson()">${icon('download')} এখনই ব্যাকআপ নিন (JSON)</button><button class="btn btn-ghost btn-sm" onclick="DataIO.exportSql()">${icon('file-code')} SQL এক্সপোর্ট করুন</button>
          <label class="btn btn-ghost btn-sm cursor-pointer text-red-600">${icon('upload')} JSON পুনরুদ্ধার করুন<input type="file" accept=".json,application/json" class="hidden" onchange="DataIO.restore(this.files[0]);this.value=''"></label></div></div>
          <div class="scroll-x max-h-[55vh] overflow-y-auto"><table class="table text-sm"><thead><tr><th>সময়</th><th>ধরন</th><th class="text-right">আকার</th><th>অবস্থা</th><th>সম্পাদনকারী</th></tr></thead><tbody>
          ${list.map(b => `<tr><td class="whitespace-nowrap">${U.fmtTime(b.ts)}</td><td>${badge(this.kindLabel(b.kind), tone(b))}</td><td class="text-right whitespace-nowrap">${bnNum(b.sizeKb || 0, true)} কেবি</td><td>${esc(this.BK_STATUS[b.status] || bn(b.status || ''))}</td><td class="text-xs text-slate-500">${b.by ? esc(DB.user(b.by)?.username ? '@' + DB.user(b.by).username : b.by) : 'সিস্টেম'}</td></tr>`).join('') || `<tr><td colspan="5">${emptyState('এখনো কোনো ব্যাকআপ লিপিবদ্ধ হয়নি।', 'database')}</td></tr>`}
          </tbody></table></div></div>
        <div class="space-y-5">
          <div class="card p-5 text-sm space-y-2"><div class="font-semibold flex items-center gap-2">${icon('shield-check', 'w-4 h-4 text-brand-600')} সংরক্ষণ নীতি</div>
            <ul class="list-disc pl-5 text-slate-600 space-y-1">
              <li>প্রতিদিন প্রথম লগইনের সময় স্বয়ংক্রিয় দৈনিক ক্লাউড স্ন্যাপশট (যাচাইকৃত চেকসাম); সংরক্ষণের মেয়াদ <b>৩০ দিন</b>।</li>
              <li>মাস-শেষের স্ন্যাপশট সংরক্ষণের মেয়াদ <b>১২ মাস</b>; শিক্ষাবর্ষ-সমাপ্তির স্ন্যাপশট সংরক্ষণের মেয়াদ <b>৭ বছর</b> — অডিট ও বোর্ড পরিদর্শনের জন্য।</li>
              <li>হাতে করা JSON / SQL এক্সপোর্ট এই ডিভাইসে ডাউনলোড হয় — এগুলো এনক্রিপ্ট করে প্রতিষ্ঠানের বাইরে সংরক্ষণ করুন। এতে ব্যক্তিগত তথ্য ও পাসওয়ার্ড হ্যাশ রয়েছে।</li>
              <li>অডিট লগ হ্যাশ-শৃঙ্খলিত; পুনরুদ্ধারের ঘটনাটিও লিপিবদ্ধ হয়।</li>
            </ul></div>
          <div class="card p-5 text-sm space-y-2"><div class="font-semibold flex items-center gap-2">${icon('triangle-alert', 'w-4 h-4 text-amber-500')} পুনরুদ্ধার</div>
            <p class="text-slate-600">পুনরুদ্ধারের জন্য কেবল Dhee SMS-এর JSON ব্যাকআপ গ্রহণযোগ্য। ফাইলে ব্যবহারকারী, শিক্ষার্থী ও প্রতিষ্ঠানের প্রোফাইল আছে কি না যাচাই করা হয় এবং এতে অবশ্যই একটি রুট ব্যবহারকারী অ্যাকাউন্ট থাকতে হবে। পুনরুদ্ধার করলে <b>বর্তমানের সকল ডেটা প্রতিস্থাপিত হয়</b> — তাই আগে একটি নতুন ব্যাকআপ নিন।</p>
            <p class="text-slate-600">SQL এক্সপোর্টটি PostgreSQL ১৩+ সংস্করণের জন্য প্রস্তুত (<code>CREATE TABLE IF NOT EXISTS</code> + <code>INSERT … ON CONFLICT DO NOTHING</code>, JSON ফিল্ডগুলো <code>jsonb</code>)। লোড করতে ব্যবহার করুন <code class="bg-slate-100 px-1 rounded">psql -f dump.sql</code>।</p></div>
        </div>
      </div>`;
  },
};

