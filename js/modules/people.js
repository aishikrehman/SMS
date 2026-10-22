/* ==========================================================================
   PEOPLE — names in Bangla and English, বিভাগ / শাখা choices, and identity look-up
   · Every person (students, fathers, mothers, guardians, teachers, staff, admins)
     has an English name and a Bangla name (nameBn, fatherNameBn …). The interface
     shows the Bangla name; the English name is kept for certificates and records.
   · Admission forms: বিভাগ/গ্রুপ (stream), শাখা preference and ব্যাচ whenever the chosen
     class has them — lists are set by the Root User (class editor, with ready-made packs
     per institution type: ClassPresets). Birth-registration look-up box sits on top.
   · Birth-registration / NID look-up connector: off (manual entry) by default, or a licensed
     API gateway such as the a2i "Porichoy" service — BDRIS itself has no open API.
   ========================================================================== */
const SECTION_NAMES = ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ', 'ঝ', 'ঞ'];
const STREAM_PRESETS = ['বিজ্ঞান', 'মানবিক', 'ব্যবসায় শিক্ষা', 'ব্যবসায় ব্যবস্থাপনা (বিএম)', 'কারিগরি', 'সাধারণ', 'নূরানী', 'নাজেরা', 'হিফজুল কুরআন', 'কিতাব', 'তাজবিদ', 'মুজাব্বিদ'];
// more institution types (the list itself lives in db.js)
['স্কুল ও কলেজ', 'কারিগরি স্কুল ও কলেজ', 'আলিয়া মাদ্রাসা', 'কওমি মাদ্রাসা', 'হাফেজিয়া মাদ্রাসা', 'ক্যাডেট কোচিং'].forEach(t => { if (!INSTITUTION_TYPES.includes(t)) INSTITUTION_TYPES.push(t); });

/* ---------------- class structure packs: বিভাগ/গ্রুপ (streams), শাখা (sections), ব্যাচ (batches) ----------------
   Applied to a class in the class editor with one click; everything stays editable afterwards. */
const ClassPresets = {
  list: [
    { id: 'ssc', name: 'সাধারণ — নবম–দশম (এসএসসি)', types: ['সাধারণ বিদ্যালয়', 'স্কুল ও কলেজ'], label: 'বিভাগ', streams: ['বিজ্ঞান', 'মানবিক', 'ব্যবসায় শিক্ষা'] },
    { id: 'boysgirls', name: 'বালক ও বালিকা শাখা', types: ['সাধারণ বিদ্যালয়', 'স্কুল ও কলেজ', 'আলিয়া মাদ্রাসা', 'মাদ্রাসা (দাখিল/আলিম)'], sections: ['বালক', 'বালিকা'] },
    { id: 'sscvoc', name: 'কারিগরি — এসএসসি (ভোকেশনাল)', types: ['কারিগরি স্কুল ও কলেজ'], label: 'ট্রেড', streams: ['কম্পিউটার ও তথ্যপ্রযুক্তি', 'জেনারেল ইলেকট্রিক্যাল ওয়ার্কস', 'জেনারেল ইলেকট্রনিক্স', 'রেফ্রিজারেশন ও এয়ারকন্ডিশনিং', 'অটোমোটিভ', 'ওয়েল্ডিং ও ফেব্রিকেশন', 'ড্রেস মেকিং', 'ফুড প্রসেসিং ও প্রিজারভেশন'] },
    { id: 'hsc', name: 'কলেজ — একাদশ–দ্বাদশ (এইচএসসি)', types: ['উচ্চ মাধ্যমিক কলেজ', 'স্কুল ও কলেজ'], label: 'বিভাগ', streams: ['বিজ্ঞান', 'মানবিক', 'ব্যবসায় শিক্ষা'] },
    { id: 'hscbm', name: 'কলেজ — এইচএসসি সাধারণ ও বিএম', types: ['উচ্চ মাধ্যমিক কলেজ', 'কারিগরি স্কুল ও কলেজ', 'স্কুল ও কলেজ'], label: 'বিভাগ', streams: ['বিজ্ঞান', 'মানবিক', 'ব্যবসায় শিক্ষা', 'ব্যবসায় ব্যবস্থাপনা (বিএম)'] },
    { id: 'bm', name: 'এইচএসসি (বিএম) — ট্রেড', types: ['কারিগরি স্কুল ও কলেজ', 'উচ্চ মাধ্যমিক কলেজ'], label: 'ট্রেড (বিএম)', streams: ['কম্পিউটার অপারেশন', 'হিসাবরক্ষণ', 'ব্যাংকিং', 'সেক্রেটারিয়াল সায়েন্স', 'উদ্যোক্তা উন্নয়ন'] },
    { id: 'alia', name: 'আলিয়া মাদ্রাসা — দাখিল / আলিম', types: ['আলিয়া মাদ্রাসা', 'মাদ্রাসা (দাখিল/আলিম)'], label: 'বিভাগ', streams: ['বিজ্ঞান', 'মানবিক (সাধারণ)', 'মুজাব্বিদ'] },
    { id: 'aliavoc', name: 'আলিয়া মাদ্রাসা — দাখিল (ভোকেশনাল)', types: ['আলিয়া মাদ্রাসা', 'মাদ্রাসা (দাখিল/আলিম)', 'কারিগরি স্কুল ও কলেজ'], label: 'ট্রেড', streams: ['কম্পিউটার ও তথ্যপ্রযুক্তি', 'জেনারেল ইলেকট্রিক্যাল ওয়ার্কস', 'ড্রেস মেকিং', 'ফুড প্রসেসিং ও প্রিজারভেশন'] },
    { id: 'qawmi', name: 'কওমি মাদ্রাসা — বিভাগ', types: ['কওমি মাদ্রাসা', 'হাফেজিয়া মাদ্রাসা'], label: 'বিভাগ', streams: ['নূরানী', 'নাজেরা', 'হিফজুল কুরআন', 'তাজবিদ', 'মুজাব্বিদ', 'কিতাব'] },
    { id: 'hifz', name: 'হিফজ — সবক ব্যাচ', types: ['কওমি মাদ্রাসা', 'হাফেজিয়া মাদ্রাসা', 'আলিয়া মাদ্রাসা'], batches: [{ name: 'ফজর ব্যাচ', time: 'ফজরের পর — সবক' }, { name: 'যোহর ব্যাচ', time: 'যোহরের পর — সাতসবক' }, { name: 'মাগরিব ব্যাচ', time: 'মাগরিবের পর — আমুখতা' }] },
    { id: 'cadet', name: 'ক্যাডেট কলেজ ভর্তি কোচিং', types: ['ক্যাডেট কোচিং', 'সাধারণ বিদ্যালয়', 'কিন্ডারগার্টেন', 'স্কুল ও কলেজ'], batches: [{ name: 'ক্যাডেট কোচিং — সকাল', time: 'শনি–বুধ সকাল ৭–৯টা', capacity: 30 }, { name: 'ক্যাডেট কোচিং — বিকাল', time: 'শনি–বুধ বিকাল ৪–৬টা', capacity: 30 }, { name: 'মডেল টেস্ট ব্যাচ', time: 'শুক্রবার সকাল ৯–১২টা', capacity: 40 }] },
  ],
  sum(p) { return [p.label && `${p.label}: ${p.streams.join(', ')}`, p.sections && `শাখা: ${p.sections.join(', ')}`, p.batches && `ব্যাচ: ${p.batches.map(b => b.name).join(', ')}`].filter(Boolean).join(' · '); },
  /** Pack buttons for the class editor — packs matching the institution type come first. */
  picker() {
    const T = instTypes(), mine = p => p.types.some(x => T.includes(x)), L = [...this.list].sort((a, b) => mine(b) - mine(a));
    return `<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">${L.map(p => `<button type="button" class="text-left border rounded-lg p-3 hover:border-brand-400 hover:bg-brand-50 ${mine(p) ? 'border-brand-300' : 'border-slate-200'}" onclick="Settings.clsPreset('${p.id}')"><span class="font-semibold flex items-center gap-1.5">${icon('wand-2', 'w-4 h-4 text-brand-600 shrink-0')}${esc(p.name)}</span><span class="block text-slate-500 mt-1 leading-snug">${esc(this.sum(p))}</span>${mine(p) ? `<span class="block mt-1">${badge('আপনার প্রতিষ্ঠানের ধরন', 'blue')}</span>` : ''}</button>`).join('')}</div>`;
  },
  /** Streams (and their label) are replaced; sections and batches are added when missing. Returns the pack. */
  apply(w, id) {
    const p = this.list.find(x => x.id === id); if (!p) return null;
    if (p.streams) { w.streams = [...p.streams]; w.streamLabel = p.label || ''; }
    (p.sections || []).forEach(s => { if (!w.sections.includes(s)) w.sections.push(s); });
    // the pack's sections replace empty default ones (ক, খ …); sections that already have students always stay
    if (p.sections) w.sections = w.sections.filter(s => p.sections.includes(s) || !SECTION_NAMES.includes(s) || (!w.isNew && DB.studentsIn(w.id, s).length));
    (p.batches || []).forEach(b => { if (!w.batches.some(x => x.name === b.name)) w.batches.push({ name: b.name, time: b.time || '', teacherId: '', capacity: b.capacity || '' }); });
    return p;
  },
};
Settings.clsPreset = function (id) {
  const w = this.clsSync(), p = ClassPresets.apply(w, id); if (!p) return;
  App.refresh(); toast(`"${p.name}" প্রয়োগ করা হয়েছে — প্রয়োজনমতো বদলে "শ্রেণি সংরক্ষণ করুন" চাপুন।`, 'success');
};

/* Structure for Bangla names: বিভাগ choices for secondary classes and Bangla-name fields on the admission form. */
DB.addSeeder('namesBn', s => {
  // secondary / college classes offer বিভাগ choices by default
  (s.classes || []).forEach(c => { if (c.grade >= 9 && !(c.streams || []).length) c.streams = ['বিজ্ঞান', 'মানবিক', 'ব্যবসায় শিক্ষা']; });
  // admission form: Bangla-name fields, বিভাগ and শাখা
  const F = s.admissionForm?.fields;
  if (F) {
    const ins = (after, f) => { if (F.some(x => x.key === f.key)) return; const i = F.findIndex(x => x.key === after); F.splice(i < 0 ? F.length : i + 1, 0, { enabled: true, builtin: true, ...f }); };
    ins('studentName', { key: 'studentNameBn', label: 'শিক্ষার্থীর নাম (বাংলায়)', type: 'text', group: 'student', required: true });
    ins('previousGpa', { key: 'stream', label: 'বিভাগ', type: 'stream', group: 'student', required: false });
    ins('stream', { key: 'sectionPref', label: 'পছন্দের শাখা', type: 'section', group: 'student', required: false });
    ins('guardianName', { key: 'guardianNameBn', label: 'অভিভাবকের নাম (বাংলায়)', type: 'text', group: 'guardian', required: false });
    ins('fatherName', { key: 'fatherNameBn', label: 'পিতার নাম (বাংলায়)', type: 'text', group: 'guardian', required: true });
    ins('motherName', { key: 'motherNameBn', label: 'মাতার নাম (বাংলায়)', type: 'text', group: 'guardian', required: true });
    const sn = F.find(x => x.key === 'studentName'); if (sn && !/English|ইংরেজি/.test(sn.label)) sn.label = 'শিক্ষার্থীর নাম (ইংরেজিতে)';
  }
  return true;
});

// Admission form v2: birth registration + date of birth first (look-up box), বিভাগ/গ্রুপ required when offered, ব্যাচ choice.
DB.addSeeder('admFormV2', s => {
  const F = s.admissionForm?.fields; if (!F) return true;
  ['dob', 'birthRegNo'].forEach(k => { const i = F.findIndex(x => x.key === k); if (i > 0) F.unshift(...F.splice(i, 1)); });
  const st = F.find(x => x.key === 'stream'); if (st) { if (st.label === 'বিভাগ') st.label = 'বিভাগ / গ্রুপ'; st.required = true; }
  if (!F.some(x => x.key === 'batchPref')) { const i = F.findIndex(x => x.key === 'sectionPref'); F.splice(i < 0 ? F.length : i + 1, 0, { key: 'batchPref', label: 'ব্যাচ', type: 'batch', group: 'student', required: false, enabled: true, builtin: true }); }
  return true;
});

// One-time: existing installs switch to the Bangla default font.
DB.addSeeder('fontBnV1', s => { if (s.theme && (!s.theme.bnFont || s.theme.bnFont === 'Hind Siliguri')) s.theme.bnFont = 'Noto Serif Bengali'; return true; });

/* ---------------- login IDs: student = Student ID / registration no., guardian = mobile no. ---------------- */
const LoginPolicy = {
  cfg() { const c = DB.s.config || (DB.s.config = {}); return c.login || (c.login = { forceChange: false }); },
  pureGuardian(u) { const r = DB.roles(u.id); return r.length === 1 && r[0] === 'GUARDIAN'; },
  /** One-time per user: student → username = Student ID, password = registration no.; guardian → username = password = mobile. */
  apply(s = DB.s) {
    let n = 0; const taken = new Set(s.users.map(u => u.username.toLowerCase()));
    s.students.forEach(st => {
      const u = s.users.find(x => x.id === st.userId); if (!u || u.loginPolicy || !st.regNo) return;
      if (u.username !== st.id && taken.has(st.id.toLowerCase())) return;
      taken.delete(u.username.toLowerCase()); u.username = st.id; taken.add(st.id.toLowerCase());
      u.pwHash = U.pw(String(st.regNo)); u.pwDefault = true; u.loginPolicy = 'v1'; n++;
    });
    s.users.filter(u => !u.loginPolicy && u.phone && s.userRoles.filter(r => r.userId === u.id).every(r => r.role === 'GUARDIAN') && s.userRoles.some(r => r.userId === u.id)).forEach(u => {
      if (u.username !== u.phone && taken.has(u.phone.toLowerCase())) return;
      taken.delete(u.username.toLowerCase()); u.username = u.phone; taken.add(u.phone.toLowerCase());
      u.pwHash = U.pw(u.phone); u.pwDefault = true; u.loginPolicy = 'v1'; n++;
    });
    return n;
  },
};
DB.addSeeder('loginIdsV1', s => { LoginPolicy.apply(s); return true; });
(() => {
  const l0 = App.login.bind(App);
  App.login = function (id) { const r = l0(id); const u = DB.user(id); if (u?.pwDefault && LoginPolicy.cfg().forceChange) setTimeout(() => { toast('নিরাপত্তার জন্য প্রথমে পাসওয়ার্ড বদলে নিন।', 'warn'); App.changePassword(); }, 300); return r; };
})();

const People = {
  /** Sign-in by username, Student ID, registration number or (guardian) mobile number. */
  findLogin(id) {
    const k = U.asciiDigits(String(id || '')).trim().toLowerCase(); if (!k) return null;
    const byName = DB.s.users.find(u => u.username.toLowerCase() === k); if (byName) return byName;
    const st = DB.s.students.find(x => String(x.regNo).toLowerCase() === k || x.id.toLowerCase() === k);
    if (st) return DB.user(st.userId);
    return DB.s.users.find(u => u.phone === k && DB.roles(u.id).includes('GUARDIAN') && LoginPolicy.pureGuardian(u)) || null;
  },
  /** Bangla-name + identity look-up block for staff / user forms. */
  fields(o = {}) {
    return `<div><label class="label">বাংলায় নাম</label><input class="input" name="nameBn" value="${esc(o.nameBn || '')}" placeholder="বাংলায় পূর্ণ নাম"></div>
      <div><label class="label">এনআইডি / জন্মনিবন্ধন নম্বর</label><div class="flex gap-2"><input class="input" name="idNo" inputmode="numeric" value="${esc(o.nid || '')}">${Registry.ready('nid') ? `<button type="button" class="btn btn-ghost btn-sm shrink-0" data-id-fill="nid" title="রেজিস্ট্রি থেকে নাম পূরণ করুন">${icon('scan-search')}</button>` : ''}</div></div>`;
  },
};

/* ---------------- names typed in staff / user forms are kept with the record ---------------- */
(() => {
  let pending = [];
  document.addEventListener('submit', e => { const f = e.target; if (f.nameBn && f.name?.value && f.nameBn.value.trim()) pending.push([f.name.value.trim(), f.nameBn.value.trim()]); }, true);
  const s0 = DB.save.bind(DB);
  DB.save = function () {
    if (pending.length && this.s) {
      pending.forEach(([en, bn]) => { [...this.s.users, ...(this.s.staff || []), ...this.s.students].filter(x => x.name === en && !x.nameBn).forEach(x => { x.nameBn = bn; }); });
      pending = [];
    }
    if (this.s?.students) LoginPolicy.apply(this.s);   // new students / guardians get the standard login IDs
    return s0();
  };
})();

/* ---------------- admission form: বিভাগ / শাখা, look-up button, carry names into enrolment ---------------- */
(() => {
  const in0 = Admissions.input.bind(Admissions);
  Admissions.input = function (f, v) {
    if (f.type === 'stream' || f.type === 'section') {
      const c = DB.cls(this._ctxClass || App.ui.adm?.d?.classId); if (!c) return '';
      const opts = f.type === 'stream' ? (c.streams || []) : c.sections;
      if (f.type === 'stream' ? !opts.length : opts.length < 2) return '';
      return in0({ ...f, type: 'select', options: opts, label: f.type === 'stream' && c.streamLabel ? c.streamLabel : f.label }, v);
    }
    if (f.type === 'batch') {
      const c = DB.cls(this._ctxClass || App.ui.adm?.d?.classId), B = c?.batches || []; if (!B.length) return '';
      const used = id => DB.s.students.filter(s => s.batchId === id && s.status === 'active').length;
      return `<div><label class="label">${esc(f.label)}${f.required ? ' <span class="text-red-500">*</span>' : ''}</label><select class="select" name="${f.key}" ${f.required ? 'required' : ''}><option value="">— কোনোটি নয় —</option>${B.map(b => { const full = b.capacity && used(b.id) >= b.capacity && b.id !== v; return `<option value="${b.id}" ${b.id === v ? 'selected' : ''} ${full ? 'disabled' : ''}>${esc(b.name)}${b.time ? ' · ' + esc(b.time) : ''}${full ? ' (আসন পূর্ণ)' : ''}</option>`; }).join('')}</select></div>`;
    }
    return in0(f, v);
  };
  const fh0 = Admissions.formHtml.bind(Admissions);
  Admissions.formHtml = function (a, office) { this._ctxClass = a.classId; try { return fh0(a, office); } finally { this._ctxClass = null; } };
  const vm0 = Admissions.viewMount.bind(Admissions);
  Admissions.viewMount = function (id) { vm0(id); const a = DB.s.admissions.find(x => x.id === id), f = $('#enrol'); if (f && a?.sectionPref && [...f.section.options].some(o => o.value === a.sectionPref)) { f.section.value = a.sectionPref; f.section.dispatchEvent(new Event('change')); } };
  const ap0 = Principal.approve.bind(Principal);
  Principal.approve = function (id, opts = {}) {
    const a = DB.s.admissions.find(x => x.id === id);
    if (a && !opts.section && a.sectionPref && DB.cls(opts.classId || a.classId)?.sections.includes(a.sectionPref)) opts = { ...opts, section: a.sectionPref };
    if (a) { if (opts.stream !== undefined) a.stream = opts.stream || ''; if (opts.batchId !== undefined) a.batchPref = opts.batchId || ''; }
    const out = ap0(id, opts);
    const st = a?.studentId && DB.student(a.studentId);
    if (st) {
      const c = DB.cls(st.classId), b = (c?.batches || []).find(x => x.id === a.batchPref);
      Object.assign(st, { nameBn: a.studentNameBn || st.nameBn, fatherName: st.fatherName || a.fatherName, fatherNameBn: a.fatherNameBn, motherName: st.motherName || a.motherName, motherNameBn: a.motherNameBn, stream: (c?.streams || []).includes(a.stream) ? a.stream : null, batchId: b?.id || null, batch: b?.name || null, birthRegNo: st.birthRegNo || a.birthRegNo, idVerified: a.idLookup ? { mode: a.idLookup.mode, at: a.idLookup.at } : st.idVerified || null });
      const u = DB.user(st.userId); if (u && a.studentNameBn) u.nameBn = a.studentNameBn;
      const g = DB.s.users.find(x => x.phone === a.guardianPhone && DB.roles(x.id).includes('GUARDIAN')); if (g && !g.nameBn && a.guardianNameBn) g.nameBn = a.guardianNameBn;
      DB.save();   // applies the login policy
      // replace the one-time credentials box with the standard login IDs
      Modal.open({ title: 'শিক্ষার্থী ভর্তি সম্পন্ন', size: 'md', body: `<div class="space-y-3 text-sm"><div class="flex items-center gap-3">${avatar(st, 48)}<div><div class="font-bold">${esc(pn(st))}</div><div class="text-slate-500">${esc(DB.className(st.classId))}${st.section ? '-' + esc(st.section) : ''} · রোল ${bnNum(st.roll)} · ${st.id}</div></div></div>
        <div class="card p-3 bg-amber-50 border-amber-200 space-y-1"><div class="font-semibold text-amber-800">লগইন তথ্য — নিরাপদে হস্তান্তর করুন</div>${DB.user(st.userId) ? `<div>শিক্ষার্থী: ইউজার আইডি <code>${esc(DB.user(st.userId).username)}</code> (অথবা রেজিস্ট্রেশন নম্বর), পাসওয়ার্ড <code>${esc(st.regNo)}</code></div>` : '<div>শিক্ষার্থী অ্যাকাউন্ট বন্ধ — কোনো লগইন তৈরি হয়নি।</div>'}${g && LoginPolicy.pureGuardian(g) ? `<div>অভিভাবক: ইউজার আইডি ও পাসওয়ার্ড <code>${esc(g.username)}</code> (মোবাইল নম্বর)</div>` : g ? `<div>অভিভাবকের বিদ্যমান অ্যাকাউন্টে যুক্ত করা হয়েছে।</div>` : '<div>অভিভাবক অ্যাকাউন্ট বন্ধ — কোনো লগইন তৈরি হয়নি।</div>'}<div class="text-xs text-slate-600">প্রথম লগইনে পাসওয়ার্ড বদলাতে হবে।</div></div></div>`, footer: `<button class="btn btn-primary" onclick="Modal.close()">ঠিক আছে</button>` });
    }
    return out;
  };
})();

/* ---------------- identity look-up (birth registration / NID) ---------------- */
const Registry = {
  /** mode 'manual' (default): details are typed in; 'live': an approved API gateway configured by the Root User. */
  cfg() { const c = DB.s.config || (DB.s.config = {}); const r = c.registry || (c.registry = { mode: 'manual', brnUrl: '', nidUrl: '', apiKey: '' }); if (r.mode !== 'live') r.mode = 'manual'; return r; },
  /** Auto-fill is offered only when a live gateway address is configured for that kind of number. */
  ready(kind) { const c = this.cfg(); return c.mode === 'live' && !!(kind === 'nid' ? c.nidUrl : c.brnUrl); },
  async lookup(kind, no, dob) {
    const c = this.cfg();
    if (!this.ready(kind)) throw new Error('স্বয়ংক্রিয় তথ্য পূরণের জন্য পরিচয় যাচাই গেটওয়ে সংযুক্ত নেই — তথ্যগুলো নিজে লিখুন।');
    const url = kind === 'nid' ? c.nidUrl : c.brnUrl;
    if (!url) throw new Error('এই যাচাইয়ের জন্য কোনো এপিআই ঠিকানা দেওয়া নেই (সেটিংস → ফিচার ও সেটিংস)।');
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}) }, body: JSON.stringify(kind === 'nid' ? { nid: no, dob } : { brn: no, dob }) });
    if (!r.ok) throw new Error(`রেজিস্ট্রি উত্তর দিয়েছে: ${U.bn(r.status)}।`);
    return r.json();
  },
  async fill(btn) {
    const form = btn.closest('form'), kind = btn.dataset.idFill, el = n => form.elements[n];
    const no = U.asciiDigits((kind === 'brn' ? el('birthRegNo') : el('idNo'))?.value || '').replace(/\D/g, ''), dob = el('dob')?.value || '';
    if (!(kind === 'brn' ? /^\d{17}$/.test(no) : /^(\d{10}|\d{13}|\d{17})$/.test(no))) return toast(kind === 'brn' ? 'আগে ১৭ সংখ্যার জন্মনিবন্ধন নম্বর লিখুন।' : 'আগে ১০, ১৩ বা ১৭ সংখ্যার এনআইডি / জন্মনিবন্ধন নম্বর লিখুন।', 'error');
    if (kind === 'brn' && !dob) { el('dob')?.focus(); return toast('জন্মতারিখও দিন — জন্মনিবন্ধন যাচাইয়ে নম্বর ও জন্মতারিখ দুটোই লাগে।', 'error'); }
    const label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `${icon('loader-2', 'w-4 h-4 animate-spin')} খোঁজা হচ্ছে…`; this.icons();
    // the record behind the form: public wizard data, or the staff form's application / draft
    const rec = form.id === 'adm-form' ? App.ui.adm?.d : form.id === 'adm-staff' && typeof Admissions !== 'undefined' ? Admissions.rec(form.dataset.app) : null;
    try {
      const d = await this.lookup(kind, no, dob);
      if (!d) return toast('এই নম্বর ও জন্মতারিখে কোনো তথ্য পাওয়া যায়নি — তথ্যগুলো নিজে লিখুন।', 'warn');
      if (d.dob && dob && d.dob !== dob) return toast('জন্মতারিখ রেজিস্ট্রির সঙ্গে মিলছে না।', 'error');
      const keys = [], set = (n, v) => { if (!v) return; if (el(n)) el(n).value = v; if (rec && form.id === 'adm-form') rec[n] = v; if (el(n) || form.id === 'adm-form') keys.push(n); };
      if (kind === 'brn') { set('studentName', d.nameEn); set('studentNameBn', d.nameBn); set('gender', d.gender); set('fatherName', d.fatherNameEn); set('fatherNameBn', d.fatherNameBn); set('motherName', d.motherNameEn); set('motherNameBn', d.motherNameBn); }
      else { set('name', d.nameEn); set('nameBn', d.nameBn); }
      if (rec && kind === 'brn') { rec.idLookup = { mode: this.cfg().mode, at: new Date().toISOString(), keys }; if (form.id === 'adm-form') Object.assign(rec, { birthRegNo: no, dob }); }
      this.mark(form, keys);
      const st = form.querySelector('[data-id-status]'); if (st) { st.innerHTML = this.status(rec?.idLookup || { mode: this.cfg().mode, keys }); this.icons(); }
      DB.audit('IDENTITY_LOOKUP', kind === 'brn' ? 'birth_registration' : 'nid', `${no.slice(0, 4)}…${no.slice(-3)} (${this.cfg().mode})`); DB.save();
      toast('রেজিস্ট্রি থেকে তথ্য পূরণ হয়েছে — নিচে মিলিয়ে দেখুন।', 'success');
    } catch (e) { toast(e.message, 'error'); } finally { btn.disabled = false; btn.innerHTML = label; }
  },
  /** Fields filled from the registry look locked (green, lock tag) but stay editable; editing removes the mark. */
  mark(form, keys) {
    if (!form || !keys?.length) return;
    keys.forEach(k => {
      const e = form.elements[k]; if (!e || e.dataset.reg) return;
      e.dataset.reg = '1'; e.classList.add('!bg-emerald-50', '!border-emerald-300'); e.title = 'জন্মনিবন্ধন রেজিস্ট্রি থেকে পূরণ — প্রয়োজনে সংশোধন করুন';
      const lb = e.closest('div')?.querySelector('label'); if (lb) lb.insertAdjacentHTML('beforeend', `<span class="font-normal text-emerald-700 ml-1" data-reg-tag>${icon('lock', 'w-3.5 h-3.5 inline -mt-0.5')} রেজিস্ট্রি</span>`);
      e.addEventListener('input', () => {
        e.classList.remove('!bg-emerald-50', '!border-emerald-300'); e.removeAttribute('title'); delete e.dataset.reg; lb?.querySelector('[data-reg-tag]')?.remove();
        const r = form.id === 'adm-form' ? App.ui.adm?.d : form.id === 'adm-staff' ? Admissions.rec(form.dataset.app) : null;
        if (r?.idLookup?.keys) r.idLookup.keys = r.idLookup.keys.filter(x => x !== k);
      }, { once: true });
    });
    this.icons();
  },
  icons() { try { window.lucide && lucide.createIcons(); } catch (e) { } },
  status(L) { return L ? `<span class="text-emerald-700">${icon('check-circle-2', 'w-4 h-4 inline -mt-0.5')} রেজিস্ট্রি থেকে ${bnNum(L.keys.length)}টি তথ্য পূরণ হয়েছে${L.at ? ` (${U.fmtTime(L.at)})` : ''} — সবুজ ঘরগুলো মিলিয়ে নিন, প্রয়োজনে সংশোধন করুন।</span>` : ''; },
  /** Look-up box shown at the top of admission forms: জন্মনিবন্ধন নম্বর → জন্মতারিখ → তথ্য লোড করুন. */
  box(rec, { cls = '', required = true } = {}) {
    const F = Admissions.form().fields, brn = F.find(f => f.key === 'birthRegNo'), dob = F.find(f => f.key === 'dob');
    if (!brn?.enabled) return '';
    const live = this.ready('brn'), star = r => r && required ? ' <span class="text-red-500">*</span>' : '';
    return `<div class="${cls} rounded-xl border-2 border-brand-200 bg-brand-50/60 p-4 space-y-3" data-idbox>
      <div class="font-semibold flex flex-wrap items-center gap-2">${icon('scan-search', 'w-5 h-5 text-brand-700')} ${live ? 'জন্মনিবন্ধন দিয়ে তথ্য আনুন' : 'জন্মনিবন্ধন ও জন্মতারিখ'}</div>
      <div class="grid ${live ? 'sm:grid-cols-[minmax(0,1fr)_13rem_auto]' : 'sm:grid-cols-[minmax(0,1fr)_13rem]'} gap-3 items-end">
        <div><label class="label">${esc(brn.label)}${star(brn.required)}</label><input class="input font-mono tracking-wider" name="birthRegNo" inputmode="numeric" maxlength="17" pattern="[0-9]{17}" title="১৭ অঙ্কের জন্মনিবন্ধন নম্বর" placeholder="১৭ অঙ্কের নম্বর" value="${esc(rec.birthRegNo || '')}" ${brn.required && required ? 'required' : ''} oninput="this.value=U.asciiDigits(this.value).replace(/\\D/g,'').slice(0,17)"></div>
        <div><label class="label">${esc(dob?.label || 'জন্মতারিখ')}${star(dob?.required)}</label><input type="date" class="input" name="dob" value="${esc(rec.dob || '')}" ${dob?.required && required ? 'required' : ''}></div>
        ${live ? `<button type="button" class="btn btn-primary justify-center" data-id-fill="brn">${icon('download')} তথ্য লোড করুন</button>` : ''}</div>
      <div data-id-status>${this.status(rec.idLookup)}</div>
      <p class="text-slate-600 leading-relaxed">${live ? 'তথ্য আসে প্রতিষ্ঠানের অনুমোদিত পরিচয় যাচাই গেটওয়ে থেকে। তথ্য না এলে নিচের ঘরগুলো নিজে পূরণ করুন।' : 'নিচের ঘরগুলো জন্মনিবন্ধন সনদ দেখে পূরণ করুন।'} সনদটি <a class="text-brand-700 underline" href="https://everify.bdris.gov.bd" target="_blank" rel="noopener">everify.bdris.gov.bd</a>-এ নিজে মিলিয়ে দেখা যায়।</p></div>`;
  },
};
document.addEventListener('click', e => { const b = e.target.closest('[data-id-fill]'); if (b) { e.preventDefault(); Registry.fill(b); } });

// Root User settings for the look-up connector
FeatureCfg.PARAMS['পরিচয় যাচাই (জন্মনিবন্ধন / এনআইডি)'] = [
  { k: 'regMode', label: 'মোড', type: 'select', options: [['manual', 'বন্ধ — তথ্য হাতে লেখা হবে'], ['live', 'লাইভ এপিআই গেটওয়ে']], get: () => Registry.cfg().mode, set: v => (Registry.cfg().mode = v) },
  { k: 'regBrn', label: 'জন্মনিবন্ধন এপিআই ঠিকানা', type: 'url', get: () => Registry.cfg().brnUrl, set: v => (Registry.cfg().brnUrl = v) },
  { k: 'regNid', label: 'এনআইডি এপিআই ঠিকানা', type: 'url', get: () => Registry.cfg().nidUrl, set: v => (Registry.cfg().nidUrl = v) },
  { k: 'regKey', label: 'এপিআই কী', type: 'password', get: () => Registry.cfg().apiKey ? '••••••••' : '', set: v => { if (v && !/^•+$/.test(v)) Registry.cfg().apiKey = v; } },];

// Root User settings: attendance mode and login policy
(FeatureCfg.PARAMS['উপস্থিতি'] = FeatureCfg.PARAMS['উপস্থিতি'] || []).unshift(
  { k: 'attMode', label: 'হাজিরার ধরন', type: 'select', options: [['daily', 'দৈনিক — দিনে একবার'], ['period', 'পিরিয়ডভিত্তিক — প্রতি পিরিয়ডে']], get: () => DB.s.school.attendanceMode || 'daily', set: v => (DB.s.school.attendanceMode = v) },
);
FeatureCfg.PARAMS['লগইন ও পাসওয়ার্ড'] = [
  { k: 'forceChange', label: 'প্রথম লগইনে পাসওয়ার্ড বদলানো বাধ্যতামূলক', type: 'select', options: [['no', 'না'], ['yes', 'হ্যাঁ (প্রস্তাবিত)']], get: () => LoginPolicy.cfg().forceChange ? 'yes' : 'no', set: v => (LoginPolicy.cfg().forceChange = v === 'yes') },
  { k: 'loginNote', type: 'note', label: 'শিক্ষার্থী: ইউজার আইডি = স্টুডেন্ট আইডি (অথবা রেজিস্ট্রেশন নম্বর), প্রাথমিক পাসওয়ার্ড = রেজিস্ট্রেশন নম্বর। অভিভাবক: ইউজার আইডি ও প্রাথমিক পাসওয়ার্ড = মোবাইল নম্বর। এই তথ্য অন্যরাও জানতে পারে, তাই প্রথম লগইনে পাসওয়ার্ড বদলানো বাধ্যতামূলক রাখা নিরাপদ।' },
];
