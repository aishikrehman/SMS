/* ==========================================================================
   Dhee SMS — data layer
   --------------------------------------------------------------------------
   The in-browser copy of the institution's data and its API. The state lives
   on the Node server (one database row per top-level key, server/store/);
   see "SERVER SYNC" below.
   ========================================================================== */

/* ---------- small utilities shared everywhere ---------- */
const U = {
  pad: (n, w = 2) => String(n).padStart(w, '0'),
  /** Parse 'YYYY-MM-DD' as a *local* date (new Date('YYYY-MM-DD') is UTC and can shift a day). */
  d(str) { return typeof str === 'string' && str.length === 10 ? new Date(str + 'T00:00:00') : new Date(str); },
  iso(d) { d = U.d(d); return `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(d.getDate())}`; },
  today() { return U.iso(new Date()); },
  addDays(d, n) { const x = U.d(d); x.setDate(x.getDate() + n); return x; },
  addMonths(d, n) { const x = U.d(d); x.setMonth(x.getMonth() + n); return x; },
  monthKey(d) { d = U.d(d); return `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}`; },
  /* --- Bangla display formats (the interface is Bangla only; stored values stay ISO / numeric) --- */
  MONTHS: ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'],
  DAYS: ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'],
  DAYS_SHORT: ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি'],
  /** ASCII digits → Bangla digits for display: 12.5 → "১২.৫". */
  bn(v) { return String(v ?? '').replace(/[0-9]/g, d => '০১২৩৪৫৬৭৮৯'[d]); },
  monthName(key) { const [y, m] = key.split('-'); return `${U.MONTHS[+m - 1]} ${U.bn(y)}`; },
  fmtDate(d) { if (!d) return '—'; const x = U.d(String(d).length === 10 ? d : new Date(d)); return `${U.bn(U.pad(x.getDate()))} ${U.MONTHS[x.getMonth()]} ${U.bn(x.getFullYear())}`; },
  fmtTime(ts) { const x = new Date(ts); return `${U.bn(U.pad(x.getDate()))} ${U.MONTHS[x.getMonth()]}, ${U.bn(U.pad(x.getHours()))}:${U.bn(U.pad(x.getMinutes()))}`; },
  /** Bangla day name for an English day key ('Sun' … 'Saturday') or a date. */
  dayBn(v, short) { const i = typeof v === 'string' && /^[A-Za-z]/.test(v) ? ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(v.slice(0, 3).toLowerCase()) : U.d(v).getDay(); return i < 0 ? v : (short ? U.DAYS_SHORT : U.DAYS)[i]; },
  /** Bangla digits (০-৯) → ASCII, so numbers typed on a Bangla keyboard work everywhere. */
  asciiDigits(s) { return String(s ?? '').replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d)); },
  money(n) { return (n < 0 ? '−' : '') + '৳' + U.bn(Math.round(Math.abs(n || 0)).toLocaleString('en-IN')); },
  /** A school day is not a configured weekend and not inside a closing holiday (Public / School) for that campus.
      Exam periods and ordinary Events keep the school open. */
  isSchoolDay(d, cal, campusId) {
    cal = cal || (typeof DB !== 'undefined' && DB.s && DB.s.calendar) || null;
    // default weekly holiday: Friday only
    const dt = U.d(d), weekends = (cal && cal.weekends) || [5], k = U.iso(dt), mine = h => k >= h.date && k <= (h.to || h.date) && (!h.campusId || !campusId || h.campusId === campusId);
    // "Open" entries turn a weekend / holiday into a working day (e.g. a make-up Saturday).
    if (cal && cal.holidays.some(h => h.type === 'Open' && mine(h))) return true;
    if (weekends.includes(dt.getDay())) return false;
    if (cal) { if (cal.holidays.some(h => (h.type === 'Public' || h.type === 'School') && k >= h.date && k <= (h.to || h.date) && (!h.campusId || !campusId || h.campusId === campusId))) return false; }
    return true;
  },
  dayName(d) { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][U.d(d).getDay()]; },
  initials(name) { return String(name || '?').replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.)\s*/, '').split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase(); },
  color(seed) { const c = ['#1d57f2', '#059669', '#d97706', '#db2777', '#7c3aed', '#0891b2', '#dc2626', '#4f46e5', '#0d9488', '#9333ea']; let h = 0; for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return c[h % c.length]; },
  /* cyrb53 — fast non-cryptographic hash, used for the audit hash-chain and receipt check codes
     (the server's copy is server/lib/hash.js). Passwords never use it: the server hashes them with scrypt. */
  hash(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
  },
  /** Initial password of a NEW account. The server turns it into a scrypt hash on the next save and the
      browser drops it right after (it is never stored as written). Passwords of existing accounts change
      only through the server's password endpoints. */
  pw(password) { return 'plain:' + String(password); },
  rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; },
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  sum: (arr, f = x => x) => arr.reduce((s, x) => s + (+f(x) || 0), 0),
  /** MFS-style transaction id: 10 uppercase alphanumerics (bKash/Nagad/Rocket format). */
  /** `n` characters from `alphabet`, drawn with crypto.getRandomValues (no modulo bias). */
  randStr(n, alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789') {
    const out = [], lim = 256 - (256 % alphabet.length), buf = new Uint8Array(1);
    while (out.length < n) { crypto.getRandomValues(buf); if (buf[0] < lim) out.push(alphabet[buf[0] % alphabet.length]); }
    return out.join('');
  },
  /** MFS-style transaction / reference id: 10 uppercase alphanumerics (bKash/Nagad/Rocket format). */
  trxId() { return U.randStr(10); },
  /** Initial (one-time) password of a new account: a simple 6-digit number. The server marks the account
      "must change" and the strength rule applies only to the password the user then chooses.
      (Students and guardians get the standard login-ID policy instead: registration no. / mobile no.) */
  tempPw() { return U.randStr(6, '0123456789'); },
  csv(rows) { return rows.map(r => r.map(v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n'); },
};

/* ---------- Grading: configurable, percentage-based bands ---------- */
const NCTB_BANDS = [
  { min: 80, letter: 'A+', point: 5.0 }, { min: 70, letter: 'A', point: 4.0 }, { min: 60, letter: 'A-', point: 3.5 },
  { min: 50, letter: 'B', point: 3.0 }, { min: 40, letter: 'C', point: 2.0 }, { min: 33, letter: 'D', point: 1.0 }, { min: 0, letter: 'F', point: 0 },
];
/* 4.00 scale (UGC-style, used by the college wing) and letter-only scale (pre-school / KG). */
const SCALE_4_BANDS = [
  { min: 80, letter: 'A+', point: 4.0 }, { min: 75, letter: 'A', point: 3.75 }, { min: 70, letter: 'A-', point: 3.5 }, { min: 65, letter: 'B+', point: 3.25 }, { min: 60, letter: 'B', point: 3.0 },
  { min: 55, letter: 'B-', point: 2.75 }, { min: 50, letter: 'C+', point: 2.5 }, { min: 45, letter: 'C', point: 2.25 }, { min: 40, letter: 'D', point: 2.0 }, { min: 0, letter: 'F', point: 0 },
];
const LETTER_BANDS = [{ min: 90, letter: 'Outstanding', point: null }, { min: 75, letter: 'Excellent', point: null }, { min: 60, letter: 'Very Good', point: null }, { min: 45, letter: 'Good', point: null }, { min: 33, letter: 'Satisfactory', point: null }, { min: 0, letter: 'Needs Improvement', point: null }];
const SCALE_PRESETS = { '5': { label: 'জিপিএ ৫.০০ (এনসিটিবি)', bands: NCTB_BANDS }, '4': { label: 'সিজিপিএ ৪.০০', bands: SCALE_4_BANDS }, 'letter': { label: 'শুধু বর্ণভিত্তিক (জিপিএ নেই)', bands: LETTER_BANDS } };
/* Assessment components an exam's distribution can be built from (plus custom ones, key "x_…"). */
const COMP_KINDS = { cq: 'সৃজনশীল', mcq: 'বহুনির্বাচনি', pr: 'ব্যবহারিক', oral: 'মৌখিক', beh: 'আচরণিক মূল্যায়ন', att: 'উপস্থিতি', cw: 'শ্রেণি কার্যক্রম', proj: 'প্রজেক্ট' };
/* Attendance component: attendance % at least `min` → `pct` % of the component's full marks. */
const ATT_SCALE = [{ min: 90, pct: 100 }, { min: 80, pct: 80 }, { min: 70, pct: 60 }, { min: 60, pct: 40 }, { min: 0, pct: 0 }];
const DEFAULT_EXAM = { cqMax: 70, mcqMax: 30, prMax: 0, cqPass: 23, mcqPass: 10, prPass: 0 };
const EXAM_TYPES = ['Class Test', 'Weekly Assessment', 'Tutorial', 'Practical', 'Semester', 'Term', 'Term Final'];
const MAJOR_EXAMS = ['Term', 'Term Final', 'Semester'];
const MFS = ['bKash', 'Nagad', 'Rocket'];
/** The institution's types: school.types (several, e.g. school and college), else the old single school.type. */
function instTypes(s = (typeof DB !== 'undefined' && DB.s ? DB.s.school : null)) { if (!s) return []; const t = Array.isArray(s.types) && s.types.length ? s.types : [s.type]; return [...new Set(t.filter(Boolean))]; }
const INSTITUTION_TYPES = ['সাধারণ বিদ্যালয়', 'মাদ্রাসা (দাখিল/আলিম)', 'কিন্ডারগার্টেন', 'প্রাক-প্রাথমিক বিদ্যালয়', 'উচ্চ মাধ্যমিক কলেজ'];

const Grade = {
  scheme(campusId, session, exam) {
    if (typeof DB === 'undefined' || !DB.s) return null;
    if (exam?.gradeSource === 'custom' && exam.customBands?.length) return { id: 'custom', name: 'নিজস্ব (এই পরীক্ষা)', scale: exam.customScale || '5', bands: exam.customBands };
    if (exam?.gradeSource === 'scheme' && exam.schemeId) { const sc = DB.s.gradingSchemes.find(g => g.id === exam.schemeId); if (sc) return sc; }
    return DB.scheme(campusId, session);
  },
  bands(campusId, session, exam) { const sc = this.scheme(campusId, session, exam); return [...(sc ? sc.bands : NCTB_BANDS)].sort((a, b) => b.min - a.min); },
  scale(campusId, session, exam) { return this.scheme(campusId, session, exam)?.scale || '5'; },
  /** Effective marks policy of one subject in one exam: exam defaults overridden by its per-subject distribution. */
  cfg(exam, subjectId) {
    const e = { ...DEFAULT_EXAM, prMax: 0, prPass: 0, ...(exam || {}), ...((subjectId && exam?.subjects?.[subjectId]) || {}) };
    // flexible components (exam.comps / subjects[sid].comps): the standard three are mirrored into cqMax… for older readers
    const list = (subjectId && exam?.subjects?.[subjectId]?.comps) || exam?.comps;
    if (Array.isArray(list) && list.length) { ['cq', 'mcq', 'pr'].forEach(k => { const c = list.find(x => x.k === k); e[k + 'Max'] = c ? +c.max || 0 : 0; e[k + 'Pass'] = c ? +c.pass || 0 : 0; }); e.full = list.reduce((s, c) => s + (+c.max || 0), 0); }
    else e.full = e.cqMax + e.mcqMax + (e.prMax || 0);
    return e;
  },
  /** Assessment components of a subject in an exam: [{ k, label, max, pass, scale? }]. Without a configured list:
      written/CQ (+ MCQ, practical when their full marks are set) — the original distribution. */
  comps(exam, subjectId) {
    const list = (subjectId && exam?.subjects?.[subjectId]?.comps) || exam?.comps;
    if (Array.isArray(list) && list.length) return list.map(c => ({ k: c.k, label: c.label || COMP_KINDS[c.k] || c.k, max: +c.max || 0, pass: +c.pass || 0, ...(c.k === 'att' ? { scale: c.scale || exam?.attScale || ATT_SCALE } : {}) }));
    const e = this.cfg(exam, subjectId), out = [{ k: 'cq', label: e.mcqMax ? 'সৃজনশীল' : 'লিখিত', max: e.cqMax, pass: e.cqPass }];
    if (e.mcqMax) out.push({ k: 'mcq', label: 'বহুনির্বাচনি', max: e.mcqMax, pass: e.mcqPass });
    if (e.prMax) out.push({ k: 'pr', label: 'ব্যবহারিক', max: e.prMax, pass: e.prPass });
    return out;
  },
  /** Marks of the attendance component from the attendance % (scale: [{ min %, pct of full marks }]). */
  attMarks(pct, c) { const s = [...(c.scale || ATT_SCALE)].sort((a, b) => b.min - a.min), b = s.find(x => pct >= x.min) || { pct: 0 }; return Math.round(c.max * b.pct / 100 * 10) / 10; },
  included(exam, subjectId) { return exam?.subjects?.[subjectId]?.included !== false; },
  /** Grade a subject over its components (`extra` = values of components other than cq / mcq / pr).
      passRule 'component' (default): every component must reach its pass mark; 'total': only the total % (passPct) counts. */
  of(cq, mcq, exam, campusId, pr = 0, subjectId, extra) {
    const e = this.cfg(exam, subjectId), comps = this.comps(exam, subjectId);
    const v = { ...Object.fromEntries(Object.entries(extra || {}).map(([k, x]) => [k, +x || 0])), cq: +cq || 0, mcq: +mcq || 0, pr: +pr || 0 };
    const max = comps.reduce((s, c) => s + c.max, 0), total = Math.round(comps.reduce((s, c) => s + (v[c.k] || 0), 0) * 100) / 100, pct = max ? total / max * 100 : 0;
    const failed = e.passRule === 'total' ? pct < (e.passPct ?? 33) : comps.some(c => (c.k === 'cq' || c.max > 0) && (v[c.k] || 0) < c.pass);
    const bands = Grade.bands(campusId, e.session, exam);
    const g = failed ? bands[bands.length - 1] : (bands.find(b => pct >= b.min) || bands[bands.length - 1]);
    return { total, max, pct, letter: g.letter, point: g.point, failed };
  },
  /** failRule 'anyF' (default, NCTB): any failed subject makes the GPA 0; 'average': plain mean of points.
      Capped at the scale max; letter-only scales return null. */
  gpaFrom(points, scale = '5', failRule = 'anyF') {
    if (!points.length || scale === 'letter' || points.some(p => p === null)) return null;
    if (failRule !== 'average' && points.some(p => p === 0)) return 0;
    return Math.min(+scale || 5, points.reduce((a, b) => a + b, 0) / points.length);
  },
  /** Overall letter for a GPA using the scheme's own bands (falls back to the NCTB 5.0 ladder). */
  letterForGpa(g, bands) {
    if (g === null || g === undefined) return '—';
    const b = [...(bands || NCTB_BANDS)].filter(x => x.point !== null).sort((x, y) => y.point - x.point);
    return (b.find(x => g >= x.point) || b[b.length - 1]).letter;
  },
  letterForPct(pct, bands) { const b = [...(bands || NCTB_BANDS)].sort((x, y) => y.min - x.min); return (b.find(x => pct >= x.min) || b[b.length - 1]).letter; },
};

const ROLES = {
  ADMIN:      { label: 'রুট ব্যবহারকারী', icon: 'shield-check', portal: 'admin' },   // single top-level role (former Root + IT Admin)
  PRINCIPAL:  { label: 'অধ্যক্ষ', icon: 'landmark', portal: 'principal' },
  TEACHER:    { label: 'শিক্ষক', icon: 'presentation', portal: 'teacher' },
  STUDENT:    { label: 'শিক্ষার্থী', icon: 'graduation-cap', portal: 'student' },
  GUARDIAN:   { label: 'অভিভাবক', icon: 'users', portal: 'guardian' },
};
/** Lucide icon for a role (built-in or custom user type). No emoji anywhere in the UI. */
const roleIcon = (r, cls = 'w-4 h-4') => icon(ROLES[r]?.icon || 'user-round', cls);

const PERIODS = [
  { n: 1, start: '08:00', end: '08:45' }, { n: 2, start: '08:50', end: '09:35' }, { n: 3, start: '09:40', end: '10:25' },
  { n: 4, start: '10:50', end: '11:35' }, { n: 5, start: '11:40', end: '12:25' }, { n: 6, start: '12:30', end: '13:15' },
];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'];
const SERVICE_FEES = { 'Transfer Certificate': 500, 'Testimonial': 300, 'Character Certificate': 200, 'Transcript Copy': 400, 'ID Card Replacement': 250, 'Leave': 0, 'Scholarship': 0 };
const STAFF_TYPES = ['Administrative Staff', 'Accountant', 'Librarian', 'Driver', 'Transport Helper', 'Office Assistant', 'Security Guard', 'Nurse', 'Cleaner', 'Hostel Warden', 'Cook'];

/* RBAC: modules × actions. Pages declare `module`; the matrix is editable in Root User → Roles & Permissions. */
const PERM_ACTIONS = ['view', 'edit', 'delete', 'print', 'export'];
const PERM_MODULES = {
  dashboard: 'ড্যাশবোর্ড ও এমআইএস', students: 'শিক্ষার্থীর রেকর্ড ও নথি', admissions: 'ভর্তি', academics: 'রুটিন, পাঠ্যসূচি ও পাঠ-উপকরণ', exams: 'পরীক্ষা ও ফলাফল',
  attendance: 'উপস্থিতি ও বায়োমেট্রিক', fees: 'ফি ও বিল', accounts: 'হিসাব ও লেজার', hr: 'কর্মী, মানবসম্পদ ও বেতন-ভাতা', services: 'সেবা ডেস্ক', logistics: 'পরিবহন, ছাত্রাবাস ও গ্রন্থাগার',
  comms: 'নোটিশ ও বার্তা', print: 'মুদ্রণ স্টুডিও', settings: 'প্রতিষ্ঠানের সেটিংস', system: 'সিস্টেম, ব্যবহারকারী ও অডিট',
};
const CLASS_BN = { 1: 'প্রথম শ্রেণি', 2: 'দ্বিতীয় শ্রেণি', 3: 'তৃতীয় শ্রেণি', 4: 'চতুর্থ শ্রেণি', 5: 'পঞ্চম শ্রেণি', 6: 'ষষ্ঠ শ্রেণি', 7: 'সপ্তম শ্রেণি', 8: 'অষ্টম শ্রেণি', 9: 'নবম শ্রেণি', 10: 'দশম শ্রেণি' };   // class names in Bangla, by grade
const DOC_KINDS = ['Birth Registration', 'Father NID', 'Mother NID', 'Student Photo', 'Previous Marksheet'];

/* Payroll formula — used by the payroll engine (teachers and support staff):
   HRA 50% of base, Medical ৳2,500 flat (৳1,500 for support staff), Overtime = hours × base/208 × 1.5,
   optional extra allowance, LOP = base/30 per unexcused absence, PF 10% of base. */
function DB_calcPay(t, unexcused = 0, overtimeHours = 0, extraAllowance = 0) {
  const base = t.baseSalary, hra = Math.round(base * 0.5), medical = t.type ? 1500 : 2500;
  const overtime = Math.round(overtimeHours * base / 208 * 1.5), allowance = Math.round(+extraAllowance || 0);
  const gross = base + hra + medical + overtime + allowance;
  const lop = Math.round(base / 30 * unexcused);
  const pf = Math.round(base * 0.10);
  return { base, hra, medical, overtimeHours, overtime, allowance, gross, unexcused, lop, pf, net: gross - lop - pf };
}

/* ==========================================================================
   DB API
   ========================================================================== */
const DB = {
  s: null,
  seeders: [],
  /** Feature modules register seeders for their own collections: fn(state) runs once when `key` is missing.
      Seeders are structural only — an empty collection, a sensible default or a shape migration, never sample records. */
  addSeeder(key, fn) { this.seeders.push({ key, fn }); },
  runSeeders() {
    let changed = false;
    this.seeders.forEach(({ key, fn }) => {
      if (this.s[key] !== undefined && this.s[key] !== null) return;
      // one failing seeder (e.g. one that expects records a new institution does not have yet) must not stop start-up
      try { const v = fn(this.s); if (v !== undefined) { this.s[key] = v; changed = true; } }
      catch (e) { console.warn(`seeder "${key}" skipped:`, e.message); }
    });
    return changed;
  },
  /** DB.ready() has already fetched the state from the server; bring it up to this build's shape. */
  load() {
    this.migrate(); this.runSeeders(); this.save();
    return this.s;
  },
  /** Upgrades for older saves: Root + IT Admin are merged into the single Root User role (ADMIN). */
  migrate() {
    const s = this.s; if (!s.userRoles) return;
    s.userRoles.forEach(r => { if (r.role === 'SUPERADMIN') r.role = 'ADMIN'; });
    s.userRoles = s.userRoles.filter((r, i, a) => a.findIndex(x => x.userId === r.userId && x.role === r.role) === i);
    if (s.rbac) delete s.rbac.SUPERADMIN;
  },
  save() { return this.persist(); },
  /** Every DB.save wrapper (undo history, login IDs …) finishes here: changes go to the server. */
  persist() { if (this.remote.on && this.s) this.queueSync(); return true; },

  /* ==========================================================================
     SERVER SYNC (Node.js API — see server/ and README → "Run it")
     · DB.ready() runs before App.boot(): GET api/state. The app works only with the Node server.
     · Signed in: what the user's role may see (server/access.js). Anonymous visitor: the public subset only.
     · DB.save() → debounced (300 ms) PUT api/state with only the top-level keys whose JSON changed and the
       revision each was loaded at. The server merges record by record, keeps what the role may not
       change and newer changes by others, and names keys to reload ("stale").
     · Anonymous visitors never write the state; their new records (application, enquiry, service
       request …) go to POST api/public/submit, which only appends and validates.
     · Empty database: ready() answers 'setup' and the first-run setup page runs (js/sync.js).
     ========================================================================== */
  remote: { on: false, userId: null, base: {}, revs: {}, sent: {}, timer: null, busy: null, again: false, retry: 0, warnedAt: 0 },
  /** Records an anonymous visitor may add (server re-validates every one). */
  PUBLIC_APPEND: ['admissions', 'serviceRequests', 'jobApplications', 'inquiries', 'pwRequests', 'journal', 'outbox', 'audit'],
  /** → 'ok' (state loaded) · 'setup' (no institution yet) · 'offline' (server not reachable). */
  async ready() {
    let d = null;
    try { d = await this.api('state', undefined, 'GET'); } catch (e) { return 'offline'; }
    if (!d || d.server !== 'dhee') return 'offline';
    this.remote.on = true;
    if (d.setup) return 'setup';
    this.adopt(d);
    window.addEventListener('beforeunload', e => { if (this.dirty()) { this.flush(); e.preventDefault(); e.returnValue = ''; } });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.pull(); else if (this.dirty()) this.flush(); });
    setInterval(() => { if (document.visibilityState === 'visible') this.pull(); }, 20000);
    return 'ok';
  },
  /** Use a server payload ({ userId, revs, state }) as the current state and sync baseline. */
  adopt(d) {
    const R = this.remote;
    R.userId = d.userId || null; R.revs = d.revs || {}; R.sent = {}; R.mustChange = !!d.mustChange;
    R.viewOf = d.userId || null;   // whose (role-filtered) view the baseline is — sent with every save, checked by the server
    R.maint = d.maintenance || null; if (d.about) R.about = d.about;   // maintenance mode and developer info (js/modules/rootops.js)
    R.stats = d.stats || null;   // record counts for the homepage "একনজরে প্রতিষ্ঠান" section (server/public.js publicStats)
    this.s = d.state;
    R.base = {};
    if (this.s) for (const k of Object.keys(this.s)) R.base[k] = JSON.stringify(this.s[k]);
  },
  /** Fetch the state again (after sign-in / sign-out) and bring it up to this build's shape. */
  async reloadRemote() {
    this.adopt(await this.api('state', undefined, 'GET'));
    if (!this.s) return;
    this.migrate();
    if (this.runSeeders() && this.remote.userId) this.queueSync();
  },
  async api(path, body, method = 'POST') {
    const has = body !== undefined && body !== null;
    const r = await fetch('/api/' + path, { method, credentials: 'same-origin', cache: 'no-store', headers: has ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' }, body: has ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
    let d = null; try { d = await r.json(); } catch (e) { /* empty body */ }
    if (!r.ok) { const err = new Error((d && d.error) || 'http_' + r.status); err.status = r.status; err.data = d; throw err; }
    return d || {};
  },
  dirty() {
    const R = this.remote; if (!R.on || !this.s) return false;
    if (R.timer || R.busy) return true;
    return Object.keys(this.s).some(k => JSON.stringify(this.s[k]) !== R.base[k]);
  },
  queueSync() { const R = this.remote; clearTimeout(R.timer); R.timer = setTimeout(() => this.flush(), 300); },
  async flush() {
    const R = this.remote; clearTimeout(R.timer); R.timer = null;
    if (!R.on || !this.s) return;
    if (R.busy) { R.again = true; return R.busy; }
    R.busy = (async () => {
      try {
        if (R.userId) await this.pushChanges(); else await this.pushPublic();
        R.retry = 0;
      } catch (e) { this.syncFailed(e); }
    })();
    try { await R.busy; } finally { R.busy = null; }
    if (R.again) { R.again = false; return this.flush(); }
  },
  /** Signed in: send only the top-level keys whose JSON changed. */
  async pushChanges() {
    const R = this.remote, ch = {}, del = [];
    for (const k of Object.keys(this.s)) { const j = JSON.stringify(this.s[k]); if (j !== undefined && j !== R.base[k]) ch[k] = j; }
    for (const k of Object.keys(R.base)) if (!(k in this.s)) del.push(k);
    const keys = Object.keys(ch); if (!keys.length && !del.length) return;
    // revs: the revision each key was loaded at, so the server can merge with (not overwrite) newer changes
    const revs = {}; keys.forEach(k => { if (R.revs[k] !== undefined) revs[k] = R.revs[k]; });
    const body = '{"changes":{' + keys.map(k => JSON.stringify(k) + ':' + ch[k]).join(',') + '},"deletes":' + JSON.stringify(del) + ',"revs":' + JSON.stringify(revs) + ',"as":' + JSON.stringify(R.viewOf || null) + '}';
    const r = await this.api('state', body, 'PUT');
    keys.forEach(k => { R.base[k] = ch[k]; }); del.forEach(k => { delete R.base[k]; });
    Object.assign(R.revs, r.revs || {});
    // the server merged by record: keys whose result differs from what was sent are fetched again
    const stale = r.stale || [];
    if (stale.length) { stale.forEach(k => { R.revs[k] = -1; }); setTimeout(() => this.pull(), 50); }
    const say = m => { if (window.toast && Date.now() - (R.toldAt || 0) > 8000) { R.toldAt = Date.now(); toast(m, 'warn'); } };
    if ((r.conflicts || []).length) say('অন্য একজন ব্যবহারকারী একই তথ্য এইমাত্র বদলেছেন — তাঁর পরিবর্তন রাখা হয়েছে এবং তথ্য আবার লোড করা হচ্ছে। প্রয়োজনে আপনার পরিবর্তনটি আবার করুন।');
    else if ((r.ignored || []).length) say('আপনার ভূমিকায় অনুমতি নেই এমন কিছু পরিবর্তন সার্ভার গ্রহণ করেনি; তথ্য আবার লোড করা হচ্ছে।');
    else if ((r.rejected || []).length) say('কিছু তথ্য অনেক বড় বা গ্রহণযোগ্য নয়, তাই সার্ভারে সংরক্ষিত হয়নি।');
    // a new account's first password hash went up once; it is not kept in the browser
    if (ch.users && (this.s.users || []).some(u => u && 'pwHash' in u)) { this.s.users.forEach(u => { if (u) delete u.pwHash; }); R.base.users = JSON.stringify(this.s.users); }
  },
  /** Anonymous visitor: send only new records of the public flows; the server appends and validates them. */
  async pushPublic() {
    const R = this.remote, items = {}, snap = {};
    for (const k of Object.keys(this.s)) snap[k] = JSON.stringify(this.s[k]);
    for (const k of this.PUBLIC_APPEND) {
      const cur = this.s[k]; if (!Array.isArray(cur) || snap[k] === R.base[k]) continue;
      const base = R.base[k] ? JSON.parse(R.base[k]) : [], sent = R.sent[k] || (R.sent[k] = new Set());
      const old = new Set(base.map(x => JSON.stringify(x))), oldIds = new Set(base.map(x => x && x.id).filter(Boolean));
      // new = an id the server did not send (records the page merely recomputed, e.g. eligibility, are not new)
      let add = cur.filter(x => x && (x.id ? !oldIds.has(x.id) : !old.has(JSON.stringify(x))) && !(x.id && sent.has(x.id)));
      if (k === 'audit') add = add.filter(e => e.role === 'PUBLIC' || (e.role === 'SYSTEM' && e.action === 'ADMISSION_SCREEN'));
      if (add.length) items[k] = add;
    }
    if (Object.keys(items).length) {
      const r = await this.api('public/submit', { items, seq: this.s.meta && this.s.meta.seq });
      Object.entries(items).forEach(([k, list]) => list.forEach(x => { if (x.id) R.sent[k].add((r.remap && r.remap[x.id]) || x.id); }));
      const remap = r.remap || {}, pairs = Object.entries(remap);
      if (pairs.length) {
        this.PUBLIC_APPEND.forEach(k => (this.s[k] || []).forEach(x => { if (x && remap[x.id]) x.id = remap[x.id]; if (x && remap[x.ref]) x.ref = remap[x.ref]; }));
        pairs.forEach(([a, b]) => { if (window.toast) toast(`আপনার রেফারেন্স নম্বর ${a} নয়, ${b} — এটি লিখে রাখুন।`, 'warn'); });
        if (typeof App !== 'undefined' && App.refresh) App.refresh();
      }
    }
    // Everything else an anonymous visitor changes stays in this browser only.
    for (const k of Object.keys(this.s)) R.base[k] = k in snap ? snap[k] : JSON.stringify(this.s[k]);
  },
  syncFailed(e) {
    const R = this.remote, say = (m, t = 'error') => { if (window.toast && Date.now() - R.warnedAt > 8000) { R.warnedAt = Date.now(); toast(m, t); } };
    if (e.status === 401 && R.userId) {
      R.userId = null;
      say('সেশনের মেয়াদ শেষ হয়েছে — আবার লগইন করুন। শেষ পরিবর্তনগুলো সার্ভারে সংরক্ষিত হয়নি।');
      if (typeof App !== 'undefined') { App.session = null; App.persistSession(); setTimeout(() => App.showLogin(), 400); }
      return;
    }
    if (e.status === 409 && e.message === 'view_mismatch') {   // the signed-in account changed under this page: start from its own data
      say('অ্যাকাউন্ট বদলেছে — তথ্য নতুন করে লোড হচ্ছে।', 'warn');
      return setTimeout(() => location.reload(), 600);
    }
    if (e.status === 403 && e.message === 'password_change_required') return location.reload();
    if (e.status === 429) return say('অনেক বেশি অনুরোধ — কিছুক্ষণ পর আবার চেষ্টা করুন।');
    if (e.status === 413) return say('পরিবর্তনটি সার্ভারে সংরক্ষণের জন্য অনেক বড় — বড় ফাইল বা ছবি বাদ দিয়ে আবার চেষ্টা করুন।');
    if (e.status && e.status >= 400 && e.status < 500) return say('সার্ভার এই পরিবর্তন গ্রহণ করেনি। পৃষ্ঠাটি আবার লোড করে চেষ্টা করুন।');
    say('সার্ভারে সংরক্ষণ করা যায়নি — ইন্টারনেট সংযোগ দেখুন। পরিবর্তনগুলো এই ব্রাউজারে আছে, কিছুক্ষণ পর আবার চেষ্টা করা হবে।');
    R.retry = Math.min(R.retry + 1, 5);
    clearTimeout(R.timer); R.timer = setTimeout(() => this.flush(), 2000 * 2 ** R.retry);
  },
  /** Signed in: pick up keys another tab or user changed (keys with unsaved local edits are left alone). */
  async pull() {
    const R = this.remote;
    if (!R.on || !R.userId || R.busy || R.timer || this._pulling) return;
    this._pulling = true;
    try {
      const { revs } = await this.api('state/revs', undefined, 'GET');
      const keys = Object.keys(revs).filter(k => revs[k] !== R.revs[k] && (!(k in this.s) || JSON.stringify(this.s[k]) === R.base[k]));
      if (!keys.length) { Object.assign(R.revs, revs); return; }
      const d = await this.api('state/pull', { keys });
      if (R.timer || R.busy) return;   // the user saved meanwhile — try again next time
      Object.entries(d.state || {}).forEach(([k, v]) => { this.s[k] = v; R.base[k] = JSON.stringify(v); });
      Object.assign(R.revs, d.revs || revs);
      if (typeof Undo !== 'undefined' && Undo.last !== null) Undo.external(Object.keys(d.state || {}));
      const typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || (document.activeElement && document.activeElement.isContentEditable);
      // never repaint under the user: not while a field has focus, a pop-up is open or they typed in the last few seconds
      const recent = typeof App !== 'undefined' && Date.now() - (App._typedAt || 0) < 4000;
      if (!typing && !recent && !(document.getElementById('modal-root') || {}).innerHTML && typeof App !== 'undefined' && App.refresh) { App._bgRefresh = true; try { App.refresh(); } finally { App._bgRefresh = false; } }
    } catch (e) { /* offline: try again later */ }
    finally { this._pulling = false; }
  },
  /** Root User: a temporary password set on the server (server mode only). */
  async setTempPassword(userId) { const r = await this.api(`users/${encodeURIComponent(userId)}/password`, {}); const u = this.user(userId); if (u) u.pwDefault = true; return r.temp; },

  /* --- employees: teachers (T…) and support staff (ST…) share payroll, attendance and ID cards --- */
  emp(id) {
    const t = this.teacher(id);
    if (t) { const u = this.user(t.userId); return { ...t, kind: 'Teacher', name: u.name, phone: u.phone, email: u.email, photo: u.photo, ref: t }; }
    const s = (this.s.staff || []).find(x => x.id === id);
    return s ? { ...s, kind: 'Staff', ref: s } : null;
  },
  employees(campusId = this.campusId()) {
    return [...this.s.teachers.map(t => this.emp(t.id)), ...(this.s.staff || []).map(s => this.emp(s.id))].filter(e => campusId === 'ALL' || e.campusId === campusId);
  },
  /** Raise a student invoice and book the receivable against the right income account. */
  bill(studentId, { item, amount, due, kind = 'other', incomeAcct = '4600', month, ref, by } = {}) {
    if (!(amount > 0)) return null;
    const inv = { id: this.id('INV'), studentId, month: month || (due || U.today()).slice(0, 7), item, amount: Math.round(amount), status: 'unpaid', due: due || U.today(), kind, ref: ref || null };
    this.s.invoices.push(inv);
    this.postJournal(`${item} — ${pn(this.student(studentId)) || studentId}`, [{ acct: '1100', dr: inv.amount, cr: 0 }, { acct: incomeAcct, dr: 0, cr: inv.amount }], inv.id, by || null, null, { campusId: this.campusOf(this.student(studentId)?.classId) });
    return inv;
  },

  /* --- RBAC: role × module × action --- */
  defaultRbac() {
    const all = Object.fromEntries(PERM_ACTIONS.map(a => [a, true])), none = Object.fromEntries(PERM_ACTIONS.map(a => [a, false]));
    const viewPrint = { ...none, view: true, print: true };
    const grid = {};
    Object.keys(ROLES).forEach(role => { grid[role] = {}; Object.keys(PERM_MODULES).forEach(m => grid[role][m] = { ...none }); });
    Object.keys(PERM_MODULES).forEach(m => { grid.ADMIN[m] = { ...all }; grid.PRINCIPAL[m] = { ...all }; });
    ['system'].forEach(m => { grid.PRINCIPAL[m] = { ...viewPrint }; });
    ['dashboard', 'students', 'academics', 'exams', 'attendance', 'services', 'print', 'comms'].forEach(m => grid.TEACHER[m] = { ...all, delete: false });
    ['logistics'].forEach(m => grid.TEACHER[m] = { ...viewPrint });
    grid.TEACHER.admissions = { ...none, view: true, edit: true, print: true };   // teachers help with test rolls, schedules & scores
    ['dashboard', 'students', 'academics', 'exams', 'attendance', 'fees', 'services', 'logistics'].forEach(m => { grid.STUDENT[m] = { ...viewPrint }; grid.GUARDIAN[m] = { ...viewPrint }; });
    return grid;
  },
  perm(role, module, action = 'view') {
    if (!module) return true;
    const g = this.s.rbac || (this.s.rbac = this.defaultRbac());
    return !!g[role]?.[module]?.[action];
  },
  id(p) { this.s.meta.seq = (this.s.meta.seq || 1000) + 1; return `${p}${String(this.s.meta.seq).padStart(4, '0')}`; },

  /* --- campuses & sessions --- */
  campusId() { const cs = this.s.campuses || []; if (cs.length === 1) return cs[0].id; return (typeof App !== 'undefined' && App.session && App.session.campus) || 'MAIN'; },
  campus(id = this.campusId()) { return this.s.campuses.find(c => c.id === id); },
  /** Class structure of a session (per session × campus): the active session lives in `classes`,
      other sessions in sessionStore[ses].classes (a session without its own structure uses the active one). */
  classesOf(session = this.session()) { if (!session || session === this.session()) return this.s.classes; return this.s.sessionStore?.[session]?.classes || this.s.classes; },
  classesIn(campusId = this.campusId(), session) { return (session ? this.classesOf(session) : this.s.classes).filter(c => campusId === 'ALL' || c.campusId === campusId).sort((a, b) => (a.campusId > b.campusId ? 1 : a.campusId < b.campusId ? -1 : 0) || a.grade - b.grade); },
  campusOf(classId) { return this.cls(classId)?.campusId; },
  activeStudents(campusId = this.campusId()) { return this.s.students.filter(x => x.status === 'active' && (campusId === 'ALL' || this.campusOf(x.classId) === campusId)); },
  teachersIn(campusId = this.campusId()) { return this.s.teachers.filter(t => campusId === 'ALL' || t.campusId === campusId); },
  rooms(campusId = this.campusId()) { return this.s.rooms[campusId] || []; },
  session() { return this.s.activeSession; },
  routineSet(session = this.session()) {
    if (session === this.session()) return this.s.routine;
    const st = this.s.sessionStore[session] || (this.s.sessionStore[session] = {});
    return st.routine || (st.routine = []);
  },
  fees(classId, session = this.session()) {
    const f = this.s.feeConfigs.find(x => x.classId === classId && x.session === session) || this.s.feeConfigs.find(x => x.classId === classId && x.session === this.session());
    return f || { tuition: 0, admissionFee: 0, examFee: 0 };
  },
  scheme(campusId, session = this.session()) {
    const list = this.s.gradingSchemes;
    return list.find(g => g.session === session && g.campusId === campusId) || list.find(g => g.session === session && !g.campusId) || list.find(g => !g.campusId) || null;
  },

  /* --- lookups --- */
  user(id) { return this.s.users.find(u => u.id === id); },
  roles(userId) { return this.s.userRoles.filter(r => r.userId === userId).map(r => r.role); },
  student(id) { return this.s.students.find(x => x.id === id); },
  studentByUser(uid) { return this.s.students.find(x => x.userId === uid); },
  teacher(id) { return this.s.teachers.find(x => x.id === id); },
  teacherByUser(uid) { return this.s.teachers.find(x => x.userId === uid); },
  teacherName(id) { const t = this.teacher(id), u = t && this.user(t.userId); return u ? (u.nameBn || u.name) : '—'; },
  /** A class of the active session; an id that exists only in another session's structure is still found (old records). */
  cls(id, session) {
    if (session && session !== this.session()) { const c = this.s.sessionStore?.[session]?.classes?.find(x => x.id === id); if (c) return c; }
    return this.s.classes.find(c => c.id === id) || Object.values(this.s.sessionStore || {}).map(v => (v.classes || []).find(c => c.id === id)).find(Boolean);
  },
  className(id) { const c = this.cls(id); if (!c) return '—'; return c.campusId === 'MAIN' || this.s.campuses.length < 2 ? c.name : `${c.name} (${this.campus(c.campusId)?.short || c.campusId})`; },
  subject(id) { return this.s.subjects.find(x => x.id === id); },
  /** Active students of a class — one section, or every section when `section` is omitted. */
  studentsIn(classId, section) { return this.s.students.filter(x => x.classId === classId && (section == null || section === '' || x.section === section) && x.status === 'active').sort((a, b) => (a.section > b.section ? 1 : a.section < b.section ? -1 : 0) || a.roll - b.roll); },
  children(guardianUserId) { return this.s.guardianLinks.filter(l => l.guardianUserId === guardianUserId).map(l => this.student(l.studentId)).filter(Boolean); },
  guardiansOf(studentId) { return this.s.guardianLinks.filter(l => l.studentId === studentId).map(l => ({ ...this.user(l.guardianUserId), relation: l.relation })); },
  holiday(date, campusId) { const k = U.iso(date); return this.s.calendar.holidays.find(h => k >= h.date && k <= (h.to || h.date) && (!h.campusId || !campusId || h.campusId === campusId)) || null; },

  /* --- academics --- */
  attendanceStats(studentId) {
    const rec = this.s.attendance[studentId] || {}, st = this.examOffFor ? this.student(studentId) : null;
    // exam days set to "no class attendance" are not working days for the class / section / shift sitting that day
    const vals = Object.entries(rec).filter(([d]) => !st || !this.examOffFor(st, d)).map(([, v]) => v);
    const c = { P: 0, A: 0, L: 0, E: 0 };
    vals.forEach(v => c[v] = (c[v] || 0) + 1);
    const counted = vals.length - c.E;                     // excused days don't count against the student
    const pct = counted ? ((c.P + c.L) / counted) * 100 : 100;
    return { ...c, days: vals.length, pct };
  },
  /** Subjects taught in a class (class.subjects = list of subject ids; not set = every subject). */
  classSubjects(classId) { const c = this.cls(classId), ids = c?.subjects; return this.s.subjects.filter(s => s.active !== false && (!ids || !ids.length || ids.includes(s.id))); },
  /** Subjects of every class on a campus — what an exam set-up has to cover. */
  campusSubjects(campusId = this.campusId()) { const ids = new Set(this.classesIn(campusId).flatMap(c => this.classSubjects(c.id).map(s => s.id))); return this.s.subjects.filter(s => ids.has(s.id)); },
  exam(id) { return this.s.exams.find(e => e.id === id); },
  examsOf(session = this.session()) { return this.s.exams.filter(e => e.session === session).sort((a, b) => a.start.localeCompare(b.start)); },
  /** Every component value of a mark: cq / mcq / pr on the record, the others in m.x; an attendance component
      without an entered value is computed from the student's attendance %. */
  markVals(m, ex, subjectId, studentId) {
    const v = { ...(m?.x || {}), cq: +m?.cq || 0, mcq: +m?.mcq || 0, pr: +m?.pr || 0 };
    Grade.comps(ex, subjectId).forEach(c => { if (c.k === 'att' && (m?.x?.att === undefined || m.x.att === '')) v.att = Grade.attMarks(this.attendanceStats(studentId).pct, c); });
    return v;
  },
  /** Write component values into a mark (cq / mcq / pr on the record, others in m.x; '' clears a non-standard value). */
  setMark(examId, studentId, subjectId, vals) {
    let m = this.s.marks.find(x => x.examId === examId && x.studentId === studentId && x.subjectId === subjectId);
    if (!m) this.s.marks.push(m = { examId, studentId, subjectId, cq: 0, mcq: 0, pr: 0 });
    delete m.absent;
    Object.entries(vals).forEach(([k, v]) => {
      if (['cq', 'mcq', 'pr'].includes(k)) m[k] = v === '' ? 0 : +v;
      else { m.x = { ...(m.x || {}) }; if (v === '' || v === undefined) delete m.x[k]; else m.x[k] = +v; if (!Object.keys(m.x).length) delete m.x; }
    });
    return m;
  },
  result(studentId, examId) {
    const ex = this.exam(examId), cls = this.student(studentId)?.classId, campus = this.campusOf(cls);
    const rows = this.classSubjects(cls).filter(sub => Grade.included(ex, sub.id)).map(sub => {
      const m = this.s.marks.find(x => x.examId === examId && x.studentId === studentId && x.subjectId === sub.id);
      // absent (অনুপস্থিত): a mark flagged absent, or no mark and absent on the exam attendance sheet — fails, unlike 0
      const ab = m ? !!m.absent : !!this.examAbsent?.(examId, studentId, sub.id);
      if (!m && !ab) return null;
      const c = Grade.cfg(ex, sub.id);
      if (ab) { const g = Grade.of(0, 0, ex, campus, 0, sub.id), b = Grade.bands(campus, ex?.session, ex), f = b[b.length - 1]; return { subject: sub, cq: 0, mcq: 0, pr: 0, cfg: c, ...g, letter: f.letter, point: f.point, failed: true, absent: true }; }
      const v = this.markVals(m, ex, sub.id, studentId);
      return { subject: sub, cq: v.cq, mcq: v.mcq, pr: v.pr, cfg: c, parts: Grade.comps(ex, sub.id).map(k => ({ k: k.k, label: k.label, max: k.max, v: v[k.k] ?? 0 })), ...Grade.of(v.cq, v.mcq, ex, campus, v.pr, sub.id, v) };
    }).filter(Boolean);
    const scale = Grade.scale(campus, ex?.session, ex), bands = Grade.bands(campus, ex?.session, ex);
    const gpa = Grade.gpaFrom(rows.map(x => x.point), scale, ex?.failRule);
    const max = U.sum(rows, x => x.max), total = U.sum(rows, x => x.total), pct = max ? total / max * 100 : 0;
    const failed = rows.some(x => x.failed);
    const letter = scale === 'letter' ? Grade.letterForPct(pct, bands) : Grade.letterForGpa(gpa, bands);
    return { exam: ex, rows, gpa, scale, letter, total, max, pct, passed: rows.length > 0 && (ex?.failRule === 'average' ? (gpa ?? pct / 20) > 0 && !rows.every(x => x.failed) : !failed) };
  },
  /** Latest published *Term* exam (class tests are too small to drive dashboards). */
  latestExam() { return [...this.s.exams].filter(e => e.published && MAJOR_EXAMS.includes(e.type)).sort((a, b) => b.start.localeCompare(a.start))[0]; },
  previousExam() { return [...this.s.exams].filter(e => e.published && MAJOR_EXAMS.includes(e.type)).sort((a, b) => b.start.localeCompare(a.start))[1]; },
  /** Weighted session GPA: Σ(gpa × weight) / Σ weight over published exams of that session. Any failed exam counts as 0. */
  sessionGpa(studentId, session = this.session()) {
    let w = 0, acc = 0;
    this.examsOf(session).filter(e => e.published).forEach(e => { const g = this.result(studentId, e.id).gpa; if (g === null) return; acc += g * (e.weight || 0); w += (e.weight || 0); });
    return w ? acc / w : null;
  },
  /** Cumulative GPA = mean of session GPAs across all sessions with results. */
  cgpa(studentId) {
    const gs = [...new Set(this.s.exams.map(e => e.session))].map(ss => this.sessionGpa(studentId, ss)).filter(g => g !== null);
    return gs.length ? gs.reduce((a, b) => a + b, 0) / gs.length : null;
  },
  sectionRank(studentId, examId) {
    const st = this.student(studentId);
    const peers = this.studentsIn(st.classId, st.section).map(p => ({ id: p.id, r: this.result(p.id, examId) })).sort((a, b) => ((b.r.gpa ?? b.r.pct / 20) - (a.r.gpa ?? a.r.pct / 20)) || (b.r.total - a.r.total));
    return { rank: peers.findIndex(p => p.id === studentId) + 1, of: peers.length };
  },

  /* --- finance --- */
  invoices(studentId) { return this.s.invoices.filter(i => i.studentId === studentId); },
  unpaid(studentId) { return this.invoices(studentId).filter(i => i.status === 'unpaid'); },
  dues(studentId) { return U.sum(this.unpaid(studentId), i => i.amount); },
  /** Dues that fall due on or before a date — used for fee-gated admit cards (future installments don't block). */
  duesBefore(studentId, date) { return U.sum(this.unpaid(studentId).filter(i => i.due <= date), i => i.amount); },
  /** Principal / Root User exemption: issue the admit card even though dues are outstanding. */
  admitWaiver(studentId, examId) { return (this.s.admitWaivers || []).find(w => w.studentId === studentId && w.examId === examId && !w.revokedAt) || null; },
  admitCleared(studentId, exam) { return this.duesBefore(studentId, exam.start) === 0 || !!this.admitWaiver(studentId, exam.id); },
  mfsAccount(method) { return MFS.includes(method) ? '1020' : method === 'Cash' ? '1000' : '1010'; },
  recordPayment(studentId, invoiceIds, method, byUserId, opts = {}) {
    const invs = this.s.invoices.filter(i => invoiceIds.includes(i.id) && i.status === 'unpaid');
    if (!invs.length) return null;
    const amount = U.sum(invs, i => i.amount);
    const isM = MFS.includes(method);
    const pay = { id: this.id('PAY'), invoiceIds: invs.map(i => i.id), studentId, amount, method, txn: opts.trxId || (isM ? U.trxId() : method === 'Cash' ? `CASH-${Date.now().toString().slice(-6)}` : `${method.slice(0, 2).toUpperCase()}${Date.now().toString().slice(-10)}`), msisdn: opts.msisdn || null, channel: opts.channel || (method === 'Cash' ? 'Counter' : 'Online checkout'), verified: opts.verified ?? true, date: U.today(), by: byUserId || null };
    this.s.payments.push(pay);
    invs.forEach(i => { i.status = 'paid'; i.paymentId = pay.id; });
    this.postJournal(`ফি রসিদ ${pay.id} — ${pn(this.student(studentId))}${pay.channel === 'Manual TrxID' ? ' (ট্রানজ্যাকশন আইডি মিলিয়ে দেখার অপেক্ষায়)' : ''}`, [{ acct: this.mfsAccount(method), dr: amount, cr: 0 }, { acct: '1100', dr: 0, cr: amount }], pay.id, byUserId, null, { kind: 'RV', campusId: this.campusOf(this.student(studentId).classId) });
    return pay;
  },
  trxIdUsed(trx) { trx = String(trx || '').toUpperCase(); return this.s.payments.some(p => p.txn === trx) || this.s.admissions.some(a => a.payment?.txn === trx) || this.s.serviceRequests.some(r => r.payment?.trxId === trx); },
  postJournal(memo, lines, ref, byUserId, date, extra = {}) {
    const dr = U.sum(lines, l => l.dr), cr = U.sum(lines, l => l.cr);
    if (Math.abs(dr - cr) > 0.001) throw new Error(`অসমতাপূর্ণ ভাউচার: ডেবিট ${U.bn(dr)} ≠ ক্রেডিট ${U.bn(cr)}`);
    const v = { id: this.id(extra.kind === 'PV' ? 'PV' : extra.kind === 'RV' ? 'RV' : 'JV'), date: date || U.today(), memo, lines, ref: ref || null, postedBy: byUserId || null, kind: extra.kind || 'JV', campusId: extra.campusId || null, payee: extra.payee || null };
    this.s.journal.push(v);
    return v;
  },
  balances(filter) {
    const b = {};
    this.s.accounts.forEach(a => b[a.code] = { ...a, dr: 0, cr: 0 });
    this.s.journal.filter(v => !filter || filter(v)).forEach(v => v.lines.forEach(l => { if (b[l.acct]) { b[l.acct].dr += +l.dr || 0; b[l.acct].cr += +l.cr || 0; } }));
    Object.values(b).forEach(a => { const debitNormal = a.type === 'Asset' || a.type === 'Expense'; a.balance = debitNormal ? a.dr - a.cr : a.cr - a.dr; });
    return b;
  },
  /** SMS guardians about unpaid invoices due within `days`; each invoice is reminded at most once per 3 days. */
  runReminders(days = 3, byUser) {
    const today = U.today(), horizon = U.iso(U.addDays(new Date(), days));
    let n = 0;
    this.s.invoices.filter(i => i.status === 'unpaid' && i.due >= today && i.due <= horizon).forEach(i => {
      if (i.remindedAt && (Date.now() - new Date(i.remindedAt)) < 3 * 864e5) return;
      const st = this.student(i.studentId); if (!st) return;
      this.guardiansOf(st.id).forEach(g => this.sms(g.phone, `${this.s.school.nameBn || this.s.school.shortName}: অনুস্মারক — ${pn(st)}-এর ${i.item} বাবদ ${U.money(i.amount)} পরিশোধের শেষ তারিখ ${U.fmtDate(i.due)}। অভিভাবক পোর্টালের মাধ্যমে পরিশোধ করুন (বিকাশ/নগদ/রকেট/কার্ড)।`));
      i.remindedAt = new Date().toISOString(); n++;
    });
    this.s.meta.lastReminderRun = today;
    if (n) this.audit('FEE_REMINDERS', 'invoices', `পরিশোধের শেষ তারিখের ${U.bn(n)}টি অনুস্মারক পাঠানো হয়েছে`, byUser || { role: 'SYSTEM' });
    return n;
  },

  /* --- messaging + audit --- */
  sms(to, message, kind = 'SMS') {
    this.s.outbox.unshift({ id: this.id('MSG'), ts: new Date().toISOString(), to, message, kind, status: this.s.featureFlags.smsGateway ? 'Queued' : 'Queued (gateway off)' });   // 'Delivered' only when a provider confirms
    if (this.s.outbox.length > 500) this.s.outbox.length = 500;
  },
  /** Append-only, hash-chained audit log. Each entry's hash covers the previous hash, so editing
      or deleting any historic row breaks verification from that point on. */
  audit(action, entity, detail, actor) {
    const prev = this.s.audit[this.s.audit.length - 1];
    const a = actor || (typeof App !== 'undefined' && App.session) || {};
    const entry = { seq: (prev ? prev.seq : 0) + 1, ts: new Date().toISOString(), userId: a.userId || null, role: a.role || 'PUBLIC', action, entity, detail: String(detail || ''), ip: '', prevHash: prev ? prev.hash : '0'.repeat(14) };
    entry.hash = U.hash(JSON.stringify([entry.seq, entry.ts, entry.userId, entry.role, entry.action, entry.entity, entry.detail, entry.ip, entry.prevHash]));
    this.s.audit.push(entry);
  },
  verifyAudit() {
    let prev = '0'.repeat(14);
    for (const e of this.s.audit) {
      const h = U.hash(JSON.stringify([e.seq, e.ts, e.userId, e.role, e.action, e.entity, e.detail, e.ip, e.prevHash]));
      if (e.prevHash !== prev || e.hash !== h) return { ok: false, brokenAt: e.seq };
      prev = e.hash;
    }
    return { ok: true, count: this.s.audit.length };
  },
};
