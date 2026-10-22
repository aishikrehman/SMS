/* ==========================================================================
   ADMISSIONS ENGINE
   Form builder (staff edit the public application form) · eligibility rules
   (age window, previous GPA) · admission tests (schedule, test rolls,
   admit cards, scores) · merit list, waiting list & rejection tracking ·
   application editing · enrolment with class/section/roll/shift.
   ========================================================================== */

const ADM_BLOOD = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
const ADM_BASE_FIELDS = [
  { key: 'studentName', label: 'শিক্ষার্থীর পূর্ণ নাম', type: 'text', group: 'student', required: true, lock: true },
  { key: 'dob', label: 'জন্মতারিখ', type: 'date', group: 'student', required: true, lock: true },
  { key: 'gender', label: 'লিঙ্গ', type: 'select', options: ['Female', 'Male'], group: 'student', required: true },
  { key: 'blood', label: 'রক্তের গ্রুপ', type: 'select', options: ADM_BLOOD, group: 'student', required: false },
  { key: 'birthRegNo', label: 'জন্মনিবন্ধন নম্বর (১৭ অঙ্ক)', type: 'text', pattern: '[0-9]{17}', group: 'student', required: true },
  { key: 'religion', label: 'ধর্ম', type: 'select', options: ['Islam', 'Hinduism', 'Buddhism', 'Christianity', 'Other'], group: 'student', required: false },
  { key: 'nationality', label: 'জাতীয়তা', type: 'text', group: 'student', required: false, default: 'Bangladeshi' },
  { key: 'shift', label: 'পছন্দের শিফট', type: 'shift', group: 'student', required: false },
  { key: 'previousSchool', label: 'পূর্ববর্তী বিদ্যালয়', type: 'text', group: 'student', required: false },
  { key: 'previousGpa', label: 'পূর্ববর্তী ফলাফল (জিপিএ, যদি থাকে)', type: 'number', step: '0.01', group: 'student', required: false },
  { key: 'guardianName', label: 'অভিভাবকের নাম', type: 'text', group: 'guardian', required: true, lock: true },
  { key: 'guardianRelation', label: 'সম্পর্ক', type: 'select', options: ['Father', 'Mother', 'Legal guardian'], group: 'guardian', required: true },
  { key: 'guardianPhone', label: 'অভিভাবকের মোবাইল (01XXXXXXXXX)', type: 'tel', pattern: '01[3-9][0-9]{8}', group: 'guardian', required: true, lock: true },
  { key: 'guardianEmail', label: 'ই-মেইল', type: 'email', group: 'guardian', required: false },
  { key: 'fatherName', label: 'পিতার নাম', type: 'text', group: 'guardian', required: true },
  { key: 'fatherNid', label: 'পিতার জাতীয় পরিচয়পত্র নম্বর', type: 'text', pattern: '[0-9]{10}|[0-9]{13}|[0-9]{17}', group: 'guardian', required: false },
  { key: 'motherName', label: 'মাতার নাম', type: 'text', group: 'guardian', required: true },
  { key: 'motherNid', label: 'মাতার জাতীয় পরিচয়পত্র নম্বর', type: 'text', pattern: '[0-9]{10}|[0-9]{13}|[0-9]{17}', group: 'guardian', required: false },
  { key: 'guardianOccupation', label: 'অভিভাবকের পেশা', type: 'text', group: 'guardian', required: false },
  { key: 'address', label: 'বর্তমান ঠিকানা', type: 'textarea', group: 'guardian', required: true },
].map(f => ({ enabled: true, builtin: true, ...f }));

DB.addSeeder('admissionForm', () => ({
  fields: ADM_BASE_FIELDS.map(f => ({ ...f })),
  docs: [{ kind: 'Birth Registration', required: true, enabled: true }, { kind: 'Student Photo', required: true, enabled: true }, { kind: 'Father NID', required: false, enabled: true }, { kind: 'Mother NID', required: false, enabled: true }, { kind: 'Previous Marksheet', required: false, enabled: true }],
  intro: 'অনুগ্রহ করে ফরমটি সতর্কতার সাথে পূরণ করুন। * চিহ্নিত ঘরগুলো পূরণ করা আবশ্যক। বয়সের যোগ্যতা অনুযায়ী আবেদনগুলো স্বয়ংক্রিয়ভাবে যাচাই করা হয়।',
  declaration: 'আমি ঘোষণা করছি যে প্রদত্ত তথ্য সত্য। আমি অবগত যে ভুল তথ্য প্রদান করলে আবেদন বাতিল হবে।',
}));
// Per-class rules and test schedules are set on the Admissions desk; a class without a rule gets Admissions.rule()'s default.
DB.addSeeder('admissionRules', () => ({}));
DB.addSeeder('admissionTests', () => ({}));

const Admissions = {
  form() { return DB.s.admissionForm; },
  /** Default rule for a class: an age window from its grade (school-starting age 6 for Class 1), the class capacity as seats, no test. */
  rule(classId) {
    const R = DB.s.admissionRules || (DB.s.admissionRules = {});
    if (R[classId]) return R[classId];
    const c = DB.cls(classId), g = Number.isFinite(+c?.grade) ? +c.grade : null;
    return (R[classId] = { minAge: g === null ? 0 : Math.max(2, g + 4), maxAge: g === null ? 99 : g + 9, seats: +c?.capacity || +DB.s.school.sectionCapacity || 40, waitlist: 5, testRequired: false, minPrevGpa: 0 });
  },
  test(classId) { return (DB.s.admissionTests || {})[classId] || null; },
  /** One line about the application fee: paid (and how), pending TrxID check, or still to be paid at the office. */
  payText(a) {
    const p = a.payment || {};
    if (!p.method || p.channel === 'Pay at office') return `ভর্তি ফি ${U.money(a.feeDue ?? a.fee ?? 0)} এখনো পরিশোধ হয়নি (অফিসে পরিশোধযোগ্য)`;
    if (p.method === 'Waiver') return 'ভর্তি ফি সম্পূর্ণ মওকুফ';
    return `${esc(bn(p.method))}-এর মাধ্যমে ${U.money(a.netPaid)} পরিশোধিত${p.verified === false ? ' (ট্রানজ্যাকশন আইডি (TrxID) যাচাই অপেক্ষমাণ)' : ''}`;
  },
  /** Automated eligibility: age window on 1 January of the admission session, plus minimum previous GPA. */
  eligibility(a) {
    const r = this.rule(a.classId), reasons = [];
    const asOf = U.d(`${typeof Pub !== 'undefined' ? Pub.admSession() : new Date().getFullYear() + 1}-01-01`), dob = U.d(a.dob);
    let age = asOf.getFullYear() - dob.getFullYear(); if (asOf < new Date(asOf.getFullYear(), dob.getMonth(), dob.getDate())) age--;
    if (a.dob && (age < r.minAge || age > r.maxAge)) reasons.push(`১ জানুয়ারি তারিখে বয়স ${bnNum(age)}, যা ${DB.className(a.classId)}-এর জন্য নির্ধারিত ${bnNum(r.minAge)}–${bnNum(r.maxAge)} সীমার বাইরে`);
    if (r.minPrevGpa && a.previousGpa !== undefined && a.previousGpa !== '' && +a.previousGpa < r.minPrevGpa) reasons.push(`পূর্ববর্তী জিপিএ ${bnNum(a.previousGpa)}, যা ন্যূনতম ${bnNum(r.minPrevGpa)}-এর কম`);
    return { ok: !reasons.length, reasons, age };
  },
  nextTestRoll(classId) { const t = this.test(classId); if (!t) return null; return `T${DB.cls(classId).grade}-${String(t.nextRoll++).padStart(3, '0')}`; },
  /** Called after a public submission: screen eligibility and auto-assign a test roll. */
  afterSubmit(a) {
    a.eligibility = this.eligibility(a);
    if (!a.eligibility.ok) { a.status = 'Declined'; a.note = 'যোগ্য নয়: ' + a.eligibility.reasons.join('; '); a.rejection = 'Ineligible'; }
    else if (this.rule(a.classId).testRequired && this.test(a.classId)) a.testRoll = this.nextTestRoll(a.classId);
    DB.audit('ADMISSION_SCREEN', 'admissions', `${a.id}: ${a.eligibility.ok ? 'eligible' : 'ineligible'}${a.testRoll ? `, test roll ${a.testRoll}` : ''}`, { role: 'SYSTEM' }); DB.save();
  },
  statusTone: { Pending: 'amber', Selected: 'blue', Waiting: 'violet', Approved: 'green', Declined: 'red' },

  /* ---------- field rendering (shared by the public form and the staff editor) ---------- */
  input(f, v) {
    const val = v ?? f.default ?? '', req = f.required ? 'required' : '', pat = f.pattern ? `pattern="${f.pattern}"` : '';
    const opts = f.type === 'shift' ? DB.s.school.shifts.map(s => s.name) : (f.options || []);
    const ctl = f.type === 'select' || f.type === 'shift' ? `<select class="select" name="${f.key}" ${req}><option value="">— নির্বাচন করুন —</option>${opts.map(o => `<option value="${esc(o)}" ${o === val ? 'selected' : ''}>${esc(bn(o))}</option>`).join('')}</select>`
      : f.type === 'textarea' ? `<textarea class="textarea" name="${f.key}" rows="2" ${req}>${esc(val)}</textarea>`
      : `<input class="input" type="${f.type === 'tel' ? 'tel' : f.type}" name="${f.key}" value="${esc(val)}" ${req} ${pat} ${f.step ? `step="${f.step}"` : ''}>`;
    return `<div class="${f.type === 'textarea' ? 'sm:col-span-2' : ''}"><label class="label">${esc(f.label)}${f.required ? ' <span class="text-red-500">*</span>' : ''}</label>${ctl}</div>`;
  },
  fields(group) { return this.form().fields.filter(f => f.enabled && f.group === group); },

  /* ---------- applicant-facing status card (used by Track & Verify) ---------- */
  publicStatus(a) {
    const t = this.test(a.classId), st = a.studentId ? DB.student(a.studentId) : null, el = a.eligibility || { ok: true, reasons: [] };
    const step = (done, text) => `<li class="flex gap-2">${icon(done ? 'check-circle-2' : 'circle-dashed', `w-4 h-4 ${done ? 'text-emerald-500' : 'text-slate-300'} shrink-0 mt-0.5`)}<span>${text}</span></li>`;
    return `<div class="card p-5"><div class="flex flex-wrap items-center gap-2"><span class="font-mono text-sm text-slate-500">${a.id}</span>${badge(bn(a.status === 'Approved' ? 'Enrolled' : a.status), this.statusTone[a.status])}${a.meritRank ? badge(`মেধাক্রম #${bnNum(a.meritRank)}`, 'blue') : ''}</div>
      <div class="text-lg font-bold mt-1">${esc(a.studentNameBn || a.studentName)}</div><div class="text-sm text-slate-500">${esc(DB.className(a.classId))} · জমাদান ${U.fmtTime(a.submittedAt)}</div>
      <ol class="mt-4 space-y-2 text-sm">${step(true, `আবেদন গৃহীত · ${Admissions.payText(a)}`)}
        ${step(el.ok, el.ok ? 'যোগ্যতা যাচাইয়ে উত্তীর্ণ' : `<span class="text-red-600">যোগ্য নয় — ${esc(el.reasons.join('; '))}</span>`)}
        ${t && a.testRoll ? step(a.score !== undefined, `ভর্তি পরীক্ষা: <b>${U.fmtDate(t.date)} ${esc(U.bn(t.time))}</b> স্থান: ${esc(t.venue)} · পরীক্ষার রোল <b class="font-mono">${esc(a.testRoll)}</b>${a.score !== undefined && t.published ? ` · প্রাপ্ত নম্বর <b>${bnNum(a.score)}/${bnNum(t.total)}</b>` : ''}`) : ''}
        ${step(['Selected', 'Waiting', 'Approved', 'Declined'].includes(a.status), a.status === 'Selected' ? 'মেধাতালিকায় নির্বাচিত — অফিসে এসে ভর্তি সম্পন্ন করুন' : a.status === 'Waiting' ? `অপেক্ষমাণ তালিকায় (ক্রম ${a.waitPos ? bnNum(a.waitPos) : '—'})` : a.status === 'Declined' ? `<span class="text-red-600">নির্বাচিত হয়নি${a.note ? ' — ' + esc(a.note) : ''}</span>` : a.status === 'Approved' ? 'ভর্তিকৃত' : 'মেধাতালিকা / সিদ্ধান্তের অপেক্ষায়')}
        ${st ? step(true, `ভর্তিকৃত: ${esc(DB.className(st.classId))}${st.section ? '-' + esc(st.section) : ''}, রোল ${bnNum(st.roll)} · শিক্ষার্থী আইডি ${st.id}`) : ''}</ol>
      <div class="flex flex-wrap gap-2 mt-4"><button class="btn btn-ghost btn-sm" onclick="Print.show('admissionReceipt','${a.id}')">${icon('receipt')} রসিদ</button>${t && a.testRoll && a.status !== 'Declined' ? `<button class="btn btn-primary btn-sm" onclick="Admissions.printAdmit(['${a.id}'])">${icon('ticket')} ভর্তি পরীক্ষার প্রবেশপত্র ডাউনলোড করুন</button>` : ''}</div></div>`;
  },
  printAdmit(ids) {
    const apps = ids.map(id => DB.s.admissions.find(a => a.id === id)).filter(a => a && a.testRoll);
    const sheets = [];
    for (let i = 0; i < apps.length; i += 2) sheets.push(Print.sheet({}, '', 'padding:12mm 14mm') + apps.slice(i, i + 2).map(a => {
      const t = this.test(a.classId), photo = (a.docs || []).find(d => d.kind === 'Student Photo' && d.dataUrl);
      return `<div style="border:.6mm solid var(--brand);border-radius:3mm;padding:6mm;height:128mm;box-sizing:border-box;margin-bottom:8mm;position:relative">${Print.header('ভর্তি পরীক্ষার প্রবেশপত্র')}
        <div style="display:flex;gap:6mm"><div style="width:28mm;height:34mm;border:.3mm solid #94a3b8;display:flex;align-items:center;justify-content:center;overflow:hidden">${photo ? `<img src="${photo.dataUrl}" style="width:100%;height:100%;object-fit:cover">` : '<span style="font-size:8pt;color:#94a3b8">ছবি</span>'}</div>
        <table style="flex:1;font-size:10.5pt;line-height:1.9"><tr><td style="color:#475569;width:38mm">পরীক্ষার রোল</td><td><b style="font-size:14pt;font-family:monospace">${esc(a.testRoll)}</b></td></tr><tr><td style="color:#475569">আবেদনকারী</td><td><b>${esc(a.studentNameBn || a.studentName)}</b></td></tr><tr><td style="color:#475569">আবেদনকৃত শ্রেণি</td><td>${esc(DB.className(a.classId))}</td></tr><tr><td style="color:#475569">আবেদন নম্বর</td><td>${a.id}</td></tr>
        <tr><td style="color:#475569">পরীক্ষার তারিখ ও সময়</td><td><b>${U.fmtDate(t.date)} · ${esc(U.bn(t.time))}</b></td></tr><tr><td style="color:#475569">স্থান</td><td>${esc(t.venue)}</td></tr></table>
        <div style="text-align:center">${qr(verifyUrl('application', a.id), 80)}<div style="font-size:7pt;color:#64748b">যাচাই করতে স্ক্যান করুন</div></div></div>
        <div style="font-size:8pt;color:#475569;margin-top:3mm">এই প্রবেশপত্র, পেনসিল, কলম ও ইরেজার সঙ্গে আনুন। ৩০ মিনিট আগে উপস্থিত হোন। ইলেকট্রনিক যন্ত্র সঙ্গে আনা নিষিদ্ধ।</div>
        <div style="position:absolute;right:6mm;bottom:5mm;transform:scale(.85);transform-origin:bottom right">${Print.signature('ভর্তি কমিটি')}</div></div>`;
    }).join('') + '</div>');
    if (!sheets.length) return toast('কোনো প্রবেশপত্র নেই — প্রথমে পরীক্ষার রোল নির্ধারণ করুন।', 'warn');
    Print.preview('ভর্তি পরীক্ষার প্রবেশপত্র', sheets, { re: ['Admissions.printAdmit', ids] });
  },

  /* ---------- staff actions (application page, editor and enrolment are further below, in place) ---------- */
  assignRolls(classId) {
    let n = 0; DB.s.admissions.filter(a => a.classId === classId && a.status === 'Pending' && !a.testRoll && (a.eligibility?.ok !== false)).forEach(a => { a.testRoll = this.nextTestRoll(classId); n++; DB.sms(a.guardianPhone, `${DB.s.school.shortName}: ${a.studentNameBn || a.studentName}-এর ভর্তি পরীক্ষা — ${U.fmtDate(this.test(classId).date)} ${U.bn(this.test(classId).time)}, ${this.test(classId).venue}। পরীক্ষার রোল ${a.testRoll}। "ট্র্যাক ও যাচাই" থেকে প্রবেশপত্র ডাউনলোড করুন।`); });
    DB.audit('ADMISSION_TEST_ROLLS', 'admissions', `${classId}: ${n} test roll(s) assigned`); DB.save(); toast(`${bnNum(n)}টি পরীক্ষার রোল নির্ধারিত হয়েছে ও এসএমএস পাঠানো হয়েছে।`, 'success'); App.refresh();
  },
  saveScores(classId) {
    $$(`[data-score]`).forEach(inp => { const a = DB.s.admissions.find(x => x.id === inp.dataset.score); if (inp.value !== '') a.score = U.clamp(+inp.value, 0, this.test(classId).total); });
    DB.audit('ADMISSION_SCORES', 'admissions', `${classId} scores saved`); DB.save(); toast('নম্বর সংরক্ষিত হয়েছে।', 'success'); App.refresh();
  },
  /** Merit list: rank eligible applicants (by test score, then previous GPA, then earliest submission); fill seats, then the waiting list; reject the rest. */
  generateMerit(classId) {
    const r = this.rule(classId), t = this.test(classId), useTest = r.testRequired && t;
    const pool = DB.s.admissions.filter(a => a.classId === classId && ['Pending', 'Selected', 'Waiting'].includes(a.status) && (a.eligibility?.ok !== false));
    if (useTest && pool.some(a => a.testRoll && a.score === undefined) && !confirm('কিছু আবেদনকারীর নম্বর এখনও দেওয়া হয়নি — তাদের অনুপস্থিত গণ্য করা হবে। চালিয়ে যাবেন?')) return;
    const passed = pool.filter(a => !useTest || (a.score !== undefined && a.score >= t.pass)), failed = pool.filter(a => !passed.includes(a));
    passed.sort((x, y) => ((y.score ?? 0) - (x.score ?? 0)) || ((+y.previousGpa || 0) - (+x.previousGpa || 0)) || String(x.submittedAt || '').localeCompare(String(y.submittedAt || '')));
    const enrolled = DB.studentsIn(classId).length, cap = (DB.cls(classId).capacity || DB.s.school.sectionCapacity) * Math.max(1, DB.cls(classId).sections.length);
    const seats = Math.max(0, Math.min(r.seats, cap - enrolled));
    passed.forEach((a, i) => {
      a.meritRank = i + 1;
      a.status = i < seats ? 'Selected' : i < seats + r.waitlist ? 'Waiting' : 'Declined';
      a.waitPos = a.status === 'Waiting' ? i - seats + 1 : null;
      if (a.status === 'Declined') { a.rejection = 'Below merit cut-off'; a.note = 'মেধার ন্যূনতম সীমার নিচে'; }
      DB.sms(a.guardianPhone, `${DB.s.school.shortName}: ${a.studentNameBn || a.studentName} (${a.id}) — ${a.status === 'Selected' ? `নির্বাচিত (মেধাক্রম #${bnNum(a.meritRank)})। অনুগ্রহ করে ৭ দিনের মধ্যে ভর্তি সম্পন্ন করুন।` : a.status === 'Waiting' ? `অপেক্ষমাণ তালিকায়, ক্রম ${bnNum(a.waitPos)}।` : 'এবার নির্বাচিত হয়নি।'}`);
    });
    failed.forEach(a => { a.status = 'Declined'; a.meritRank = null; a.rejection = a.score === undefined ? 'Absent from test' : 'Failed admission test'; a.note = a.score === undefined ? 'পরীক্ষায় অনুপস্থিত' : 'ভর্তি পরীক্ষায় অকৃতকার্য'; DB.sms(a.guardianPhone, `${DB.s.school.shortName}: ${a.studentNameBn || a.studentName} (${a.id}) নির্বাচিত হয়নি — ${a.note}।`); });
    if (t) t.published = true;
    DB.audit('MERIT_LIST', 'admissions', `${classId}: ${Math.min(seats, passed.length)} selected, ${passed.filter(a => a.status === 'Waiting').length} waiting, ${failed.length + passed.filter(a => a.status === 'Declined').length} declined`); DB.save();
    toast('মেধাতালিকা তৈরি ও প্রকাশিত হয়েছে; সকল আবেদনকারীকে এসএমএস পাঠানো হয়েছে।', 'success'); App.refresh();
  },
  printMerit(classId) {
    const list = DB.s.admissions.filter(a => a.classId === classId && a.meritRank).sort((a, b) => a.meritRank - b.meritRank), t = this.test(classId);
    Print.preview('মেধাতালিকা', [Print.sheet({}, 'padded') + Print.header(`ভর্তির মেধাতালিকা — ${esc(DB.className(classId))} · শিক্ষাবর্ষ ${bnNum(Pub.admSession())}`)
      + `<table class="ms-table"><thead><tr><th>মেধাক্রম</th><th>পরীক্ষার রোল</th><th>আবেদনকারী</th><th>আবেদন</th><th>প্রাপ্ত নম্বর${t ? ` /${bnNum(t.total)}` : ''}</th><th>পূর্ববর্তী জিপিএ</th><th>অবস্থা</th></tr></thead><tbody>${list.map(a => `<tr><td>${bnNum(a.meritRank)}</td><td>${esc(a.testRoll || '—')}</td><td style="text-align:left">${esc(a.studentNameBn || a.studentName)}</td><td>${a.id}</td><td>${bnNum(a.score)}</td><td>${esc(bnNum(a.previousGpa))}</td><td>${bn(a.status === 'Approved' ? 'Enrolled' : a.status)}${a.waitPos ? ' #' + bnNum(a.waitPos) : ''}</td></tr>`).join('')}</tbody></table>
      <div style="position:absolute;bottom:20mm;right:14mm">${Print.signature('সভাপতি, ভর্তি কমিটি')}</div></div>`], { re: ['Admissions.printMerit', classId] });
  },

  /* ---------- form builder ---------- */
  setField(i, prop, v) { const f = this.form().fields[i]; f[prop] = v; DB.audit('ADMISSION_FORM', 'admissions', `field ${f.key}.${prop}=${v}`); DB.save(); },
  addField() {
    Modal.open({ title: 'নিজস্ব ঘর যোগ করুন', size: 'md', body: `<form id="af" class="grid grid-cols-2 gap-3"><div class="col-span-2"><label class="label">শিরোনাম</label><input class="input" name="label" required placeholder="যেমন: শখ / এই বিদ্যালয়ে অধ্যয়নরত ভাইবোন"></div><div><label class="label">ধরন</label><select class="select" name="type"><option value="text">সংক্ষিপ্ত লেখা</option><option value="textarea">দীর্ঘ লেখা</option><option value="number">সংখ্যা</option><option value="date">তারিখ</option><option value="select">ড্রপডাউন</option><option value="email">ই-মেইল</option><option value="tel">ফোন</option></select></div><div><label class="label">শাখা</label><select class="select" name="group"><option value="student">শিক্ষার্থীর তথ্য</option><option value="guardian">অভিভাবকের তথ্য</option></select></div><div class="col-span-2"><label class="label">ড্রপডাউনের বিকল্পসমূহ (কমা দিয়ে আলাদা করুন)</label><input class="input" name="options"></div><label class="flex items-center gap-2 text-sm"><input type="checkbox" name="required"> আবশ্যক</label><div class="col-span-2"><button class="btn btn-primary w-full">ঘর যোগ করুন</button></div></form>` });
    $('#af').addEventListener('submit', e => {
      e.preventDefault(); const f = formData(e.target), slug = f.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24), key = 'x_' + (slug || Date.now().toString(36));
      if (this.form().fields.some(x => x.key === key)) return toast('এই নামে একটি ঘর ইতোমধ্যে আছে।', 'error');
      this.form().fields.push({ key, label: f.label, type: f.type, group: f.group, options: f.options ? f.options.split(',').map(x => x.trim()).filter(Boolean) : undefined, required: !!e.target.required.checked, enabled: true, builtin: false });
      DB.audit('ADMISSION_FORM', 'admissions', `custom field ${key} added`); DB.save(); Modal.close(); App.refresh();
    });
  },
  delField(i) { const f = this.form().fields[i]; if (!confirm(`নিজস্ব ঘর "${f.label}" মুছে ফেলবেন?`)) return; this.form().fields.splice(i, 1); DB.audit('ADMISSION_FORM', 'admissions', `custom field ${f.key} removed`); DB.save(); App.refresh(); },
  moveField(i, d) { const fs = this.form().fields, j = i + d; if (j < 0 || j >= fs.length) return; [fs[i], fs[j]] = [fs[j], fs[i]]; DB.save(); App.refresh(); },
};

/* ------------------------------------------------------------ staff page --- */
const admissionsPage = {
  id: 'admissions', label: 'ভর্তি', icon: 'inbox', module: 'admissions', count: () => DB.s.admissions.filter(a => a.status === 'Pending' && (a.campusId || DB.campusOf(a.classId)) === DB.campusId()).length || '',
  render() {
    const t = App.ui.admTab || 'apps', can = App.perm('admissions', 'edit');
    const T = [['apps', 'আবেদনসমূহ', 'inbox'], ['merit', 'পরীক্ষা ও মেধাতালিকা', 'list-ordered'], ['form', 'ফরম নির্মাতা', 'layout-list'], ['rules', 'যোগ্যতা ও আসন', 'scale']];
    return pageHeader('ভর্তি', `শিক্ষাবর্ষ ${esc(bnNum(Pub.admSession()))}${multiCampus() ? ' · ' + esc(DB.campus().name) : ''}`,`<a class="btn btn-ghost" href="${App.href('public', 'admissions')}" target="_blank">${icon('external-link')} পাবলিক ফরম</a>`) + tabs('admTab', T, t) + `<div class="fade-in">${this[t](can)}</div>`;
  },
  apps(can) {
    const head = Admissions.appsHead(can);
    if (App.ui.admF === 'Draft') return head + Admissions.draftList();
    const f = App.ui.admF || 'Pending', L = 'admissions.apps', K = 'admLF';
    const all = DB.s.admissions.filter(a => (a.campusId || DB.campusOf(a.classId)) === DB.campusId());
    const FD = ListPrefs.filters(L, [{ k: 'cls', label: 'শ্রেণি' }, { k: 'elig', label: 'যোগ্যতা', on: false, opts: [['ok', 'যোগ্য'], ['no', 'অযোগ্য']] }, { k: 'pay', label: 'পরিশোধ', on: false, opts: [['paid', 'পরিশোধিত'], ['due', 'ফি অপরিশোধিত'], ['unverified', 'TrxID অযাচাইকৃত']] }, { k: 'q', label: 'নাম / নম্বর অনুসন্ধান' }]);
    const fv = k => (k === 'cls' ? (ListPrefs.keys(L, 'filters').has('cls') ? App.ui.admC || '' : '') : ListPrefs.val(L, K, k)), cls = fv('cls'), q = String(fv('q')).toLowerCase();
    const paid = a => !!(a.payment?.method && a.payment.channel !== 'Pay at office');
    const list = all.filter(a => (f === 'All' ? a.status !== 'Draft' : a.status === f) && (!cls || a.classId === cls) && (!fv('elig') || (fv('elig') === 'no') === (a.eligibility?.ok === false))
      && (!fv('pay') || (fv('pay') === 'paid' ? paid(a) && a.payment.verified !== false : fv('pay') === 'due' ? !paid(a) : paid(a) && a.payment.verified === false))
      && (!q || `${a.id} ${a.studentName || ''} ${a.studentNameBn || ''} ${a.guardianPhone || ''} ${a.testRoll || ''}`.toLowerCase().includes(q)))
      .sort((a, b) => (a.meritRank || 999) - (b.meritRank || 999) || String(b.submittedAt || b.createdAt || '').localeCompare(String(a.submittedAt || a.createdAt || '')));
    const C = ListPrefs.cols(L, [
      { k: 'id', label: 'আবেদন নম্বর', lock: true, cls: 'font-mono', td: a => `${a.id}<div class="text-slate-400">${U.fmtDate(a.submittedAt)}</div>` },
      { k: 'name', label: 'আবেদনকারী', lock: true, td: a => `<span class="font-semibold">${esc(a.studentNameBn || a.studentName)}</span><div class="text-xs text-slate-400">${esc(a.guardianPhone)}</div>` },
      { k: 'cls', label: 'শ্রেণি', td: a => esc(DB.className(a.classId)) },
      { k: 'elig', label: 'যোগ্যতা', td: a => (a.eligibility?.ok === false ? `<span title="${esc((a.eligibility.reasons || []).join('; '))}">${badge('অযোগ্য', 'red')}</span>` : badge('যোগ্য', 'green')) },
      { k: 'roll', label: 'পরীক্ষার রোল', cls: 'font-mono', td: a => esc(a.testRoll || '—') },
      { k: 'score', label: 'প্রাপ্ত নম্বর', td: a => bnNum(a.score) },
      { k: 'rank', label: 'মেধাক্রম', td: a => (a.meritRank ? '#' + bnNum(a.meritRank) : '—') },
      { k: 'pay', label: 'পরিশোধ', td: a => (paid(a) ? `${U.money(a.netPaid)} ${esc(bn(a.payment.method))}${a.payment.verified === false ? `<div>${badge('ট্রানজ্যাকশন আইডি (TrxID) অযাচাইকৃত', 'amber')}</div>` : ''}` : badge('ফি অপরিশোধিত', 'slate')) },
      { k: 'status', label: 'অবস্থা', td: a => `${badge(bn(a.status === 'Approved' ? 'Enrolled' : a.status), Admissions.statusTone[a.status])}${a.waitPos ? ` <span class="text-xs">#${bnNum(a.waitPos)}</span>` : ''}` },
      { k: 'gpa', label: 'পূর্ববর্তী জিপিএ', on: false, td: a => esc(bnNum(a.previousGpa)) },
      { k: 'dob', label: 'জন্মতারিখ', on: false, td: a => (a.dob ? U.fmtDate(a.dob) : '—') },
      { k: 'guardian', label: 'অভিভাবক', on: false, td: a => esc(a.guardianNameBn || a.guardianName || '—') },
      { k: 'group', label: 'বিভাগ / গ্রুপ', on: false, td: a => esc(a.stream || '—') },
      { k: 'act', label: '', lock: true, td: a => `<div class="flex gap-1 justify-end"><button class="btn btn-ghost btn-sm" aria-label="দেখুন" onclick="Admissions.view('${a.id}')">${icon('eye')}</button><button class="btn btn-ghost btn-sm" aria-label="সম্পাদনা" onclick="Admissions.edit('${a.id}')">${icon('pencil')}</button>${['Pending', 'Selected', 'Waiting'].includes(a.status) && App.can('admissions.decide') ? `<button class="btn btn-success btn-sm" onclick="Admissions.view('${a.id}')">ভর্তি করুন</button>` : ''}</div>` },
    ]);
    const shown = new Set(FD.map(d => d.k));
    return head + `<div class="flex flex-wrap gap-2 mb-4">${['Pending', 'Selected', 'Waiting', 'Approved', 'Declined', 'All'].map(s => `<button class="btn btn-sm ${s === f ? 'btn-primary' : 'btn-ghost'}" onclick="App.ui.admF='${s}';App.refresh()">${s === 'All' ? 'সকল' : bn(s === 'Approved' ? 'Enrolled' : s)} <span class="opacity-70">${bnNum(s === 'All' ? all.filter(a => a.status !== 'Draft').length : all.filter(a => a.status === s).length)}</span></button>`).join('')}<span class="ml-auto">${ListPrefs.button(L)}</span></div>
      <div class="flex flex-wrap gap-2 mb-4">${shown.has('q') ? `<input class="input flex-1 min-w-[12rem]" placeholder="নাম, আবেদন নম্বর, ফোন বা পরীক্ষার রোল…" aria-label="অনুসন্ধান" value="${esc((App.ui[K] || {}).q || '')}" onchange="ListPrefs.set('${K}','q',this.value)">` : ''}${shown.has('cls') ? `<select class="select !w-auto" aria-label="শ্রেণি" onchange="App.ui.admC=this.value;App.refresh()">${classOptions(cls, true)}</select>` : ''}${ListPrefs.selects(FD, K)}</div>
      <div class="card scroll-x"><table class="table"><thead>${ListPrefs.head(C)}</thead><tbody>
      ${list.map(a => ListPrefs.row(C, a)).join('')}</tbody></table>${list.length ? '' : emptyState('এখানে কোনো আবেদন নেই।')}</div>`;
  },
  merit(can) {
    const cls = DB.classesIn().some(c => c.id === App.ui.admMC) ? App.ui.admMC : DB.classesIn()[0]?.id, r = Admissions.rule(cls);
    const t = Admissions.test(cls), apps = DB.s.admissions.filter(a => a.classId === cls && a.status !== 'Approved' && a.eligibility?.ok !== false);
    return `<div class="flex flex-wrap items-end gap-3 mb-4"><div><label class="label">শ্রেণি</label><select class="select" onchange="App.ui.admMC=this.value;App.refresh()">${classOptions(cls)}</select></div>
        <div class="flex flex-wrap gap-2">${badge(`${bnNum(r.seats)}টি আসন`, 'blue')}${badge(`অপেক্ষমাণ তালিকা ${bnNum(r.waitlist)}`, 'violet')}${r.testRequired ? badge('ভর্তি পরীক্ষা আবশ্যক', 'amber') : badge('পরীক্ষা নেই — পূর্ববর্তী জিপিএ অনুযায়ী ক্রম নির্ধারণ', 'slate')}</div></div>
      <div class="grid xl:grid-cols-3 gap-5"><form id="tst" class="card p-5 space-y-3 self-start"><div class="font-semibold">ভর্তি পরীক্ষার সময়সূচি</div>
          <div class="grid grid-cols-2 gap-3"><div><label class="label">তারিখ</label><input type="date" class="input" name="date" value="${t?.date || ''}" required></div><div><label class="label">সময়</label><input type="time" class="input" name="time" value="${t?.time || '09:30'}" required></div></div>
          <div><label class="label">স্থান</label><input class="input" name="venue" value="${esc(t?.venue || DB.campus().name + ' — হল এ')}" required></div>
          <div class="grid grid-cols-2 gap-3"><div><label class="label">পূর্ণ নম্বর</label><input type="number" class="input" name="total" value="${t?.total || 100}"></div><div><label class="label">পাস নম্বর</label><input type="number" class="input" name="pass" value="${t?.pass || 40}"></div></div>
          <button class="btn btn-primary w-full" ${can ? '' : 'disabled'}>${icon('save')} সময়সূচি সংরক্ষণ করুন</button>
          ${t ? `<button type="button" class="btn btn-ghost w-full" onclick="Admissions.assignRolls('${cls}')" ${can ? '' : 'disabled'}>${icon('hash')} পরীক্ষার রোল নির্ধারণ ও এসএমএস প্রেরণ করুন</button><button type="button" class="btn btn-ghost w-full" onclick="Admissions.printAdmit(DB.s.admissions.filter(a=>a.classId==='${cls}'&&a.testRoll&&a.status!=='Declined').map(a=>a.id))">${icon('ticket')} সকল প্রবেশপত্র মুদ্রণ করুন</button>` : ''}</form>
        <div class="card xl:col-span-2"><div class="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2"><div class="font-semibold mr-auto">নম্বর প্রদান ও মেধাক্রম (${bnNum(apps.length)} জন যোগ্য আবেদনকারী)</div>${t ? `<button class="btn btn-ghost btn-sm" onclick="Admissions.saveScores('${cls}')" ${can ? '' : 'disabled'}>${icon('save')} নম্বর সংরক্ষণ করুন</button>` : ''}${App.can('admissions.decide') || App.has('ADMIN') ? `<button class="btn btn-primary btn-sm" onclick="Admissions.generateMerit('${cls}')">${icon('list-ordered')} মেধাতালিকা তৈরি ও প্রকাশ করুন</button>` : ''}<button class="btn btn-ghost btn-sm" onclick="Admissions.printMerit('${cls}')">${icon('printer')} মেধাতালিকা</button></div>
          <div class="scroll-x"><table class="table"><thead><tr><th>পরীক্ষার রোল</th><th>আবেদনকারী</th><th>পূর্ববর্তী জিপিএ</th><th>প্রাপ্ত নম্বর${t ? ' /' + bnNum(t.total) : ''}</th><th>মেধাক্রম</th><th>অবস্থা</th></tr></thead><tbody>${apps.sort((a, b) => String(a.testRoll || 'zz').localeCompare(String(b.testRoll || 'zz'))).map(a => `<tr><td class="font-mono text-xs">${esc(a.testRoll || '—')}</td><td class="font-semibold">${esc(a.studentNameBn || a.studentName)}</td><td>${esc(bnNum(a.previousGpa))}</td><td>${t && a.testRoll ? `<input class="grid-input" type="number" min="0" max="${t.total}" data-score="${a.id}" value="${a.score ?? ''}" ${can ? '' : 'disabled'}>` : '—'}</td><td>${a.meritRank ? '#' + bnNum(a.meritRank) : '—'}</td><td>${badge(bn(a.status), Admissions.statusTone[a.status])}</td></tr>`).join('')}</tbody></table>${apps.length ? '' : emptyState('এই শ্রেণির জন্য কোনো যোগ্য আবেদনকারী নেই।')}</div></div></div>`;
  },
  form(can) {
    const F = Admissions.form();
    const GROUP = { student: 'শিক্ষার্থী', guardian: 'অভিভাবক' }, TYPE = { text: 'সংক্ষিপ্ত লেখা', textarea: 'দীর্ঘ লেখা', number: 'সংখ্যা', date: 'তারিখ', select: 'ড্রপডাউন', email: 'ই-মেইল', tel: 'ফোন', shift: 'শিফট', stream: 'বিভাগ / গ্রুপ', section: 'শাখা', batch: 'ব্যাচ' };
    return `<div class="grid xl:grid-cols-3 gap-5"><div class="card xl:col-span-2 scroll-x"><div class="px-5 py-3 border-b border-slate-100 flex items-center"><div class="font-semibold">আবেদন ফরমের ঘরসমূহ</div>${can ? `<button class="btn btn-primary btn-sm ml-auto" onclick="Admissions.addField()">${icon('plus')} নিজস্ব ঘর</button>` : ''}</div>
        <table class="table"><thead><tr><th></th><th>শিরোনাম (সম্পাদনাযোগ্য)</th><th>শাখা</th><th>ধরন</th><th class="text-center">প্রদর্শিত</th><th class="text-center">আবশ্যক</th><th></th></tr></thead><tbody>${F.fields.map((f, i) => `<tr class="${f.enabled ? '' : 'opacity-50'}"><td class="whitespace-nowrap"><button class="btn btn-ghost btn-sm !px-1" onclick="Admissions.moveField(${i},-1)">${icon('chevron-up', 'w-3 h-3')}</button><button class="btn btn-ghost btn-sm !px-1" onclick="Admissions.moveField(${i},1)">${icon('chevron-down', 'w-3 h-3')}</button></td>
          <td><input class="input !py-1" value="${esc(f.label)}" ${can ? '' : 'disabled'} onchange="Admissions.setField(${i},'label',this.value)"><div class="text-[10px] font-mono text-slate-400">${f.key}${f.builtin ? '' : ' · নিজস্ব'}</div></td><td class="text-xs">${GROUP[f.group] || esc(f.group)}</td><td class="text-xs">${TYPE[f.type] || esc(f.type)}</td>
          <td class="text-center"><input type="checkbox" ${f.enabled ? 'checked' : ''} ${f.lock || !can ? 'disabled' : ''} onchange="Admissions.setField(${i},'enabled',this.checked);App.refresh()"></td><td class="text-center"><input type="checkbox" ${f.required ? 'checked' : ''} ${f.lock || !can ? 'disabled' : ''} onchange="Admissions.setField(${i},'required',this.checked)"></td>
          <td>${!f.builtin && can ? `<button class="btn btn-ghost btn-sm" onclick="Admissions.delField(${i})">${icon('trash-2')}</button>` : f.lock ? `<span title="মূল ঘর">${icon('lock', 'w-3.5 h-3.5 text-slate-400')}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>
      <div class="space-y-5"><div class="card"><div class="px-5 py-3 border-b border-slate-100 font-semibold">প্রয়োজনীয় কাগজপত্র</div><div class="divide-y divide-slate-100">${F.docs.map((d, i) => `<div class="px-5 py-2.5 flex items-center gap-3 text-sm"><span class="flex-1">${esc(bn(d.kind))}</span><label class="flex items-center gap-1 text-xs"><input type="checkbox" ${d.enabled ? 'checked' : ''} ${can ? '' : 'disabled'} onchange="Admissions.form().docs[${i}].enabled=this.checked;DB.save()"> প্রদর্শিত</label><label class="flex items-center gap-1 text-xs"><input type="checkbox" ${d.required ? 'checked' : ''} ${can ? '' : 'disabled'} onchange="Admissions.form().docs[${i}].required=this.checked;DB.save()"> আবশ্যক</label></div>`).join('')}</div></div>
        <div class="card p-5 space-y-3"><div><label class="label">ভূমিকা</label><textarea class="textarea" rows="3" ${can ? '' : 'disabled'} onchange="Admissions.form().intro=this.value;DB.save()">${esc(F.intro)}</textarea></div><div><label class="label">ঘোষণা</label><textarea class="textarea" rows="3" ${can ? '' : 'disabled'} onchange="Admissions.form().declaration=this.value;DB.save()">${esc(F.declaration)}</textarea></div><a class="btn btn-ghost w-full" href="${App.href('public', 'admissions')}" target="_blank">${icon('eye')} পাবলিক ফরমের প্রিভিউ</a></div></div></div>`;
  },
  rules(can) {
    return `<div class="card scroll-x"><table class="table"><thead><tr><th>শ্রেণি</th><th>ন্যূনতম বয়স</th><th>সর্বোচ্চ বয়স</th><th>ন্যূনতম পূর্ববর্তী জিপিএ</th><th>আসন</th><th>অপেক্ষমাণ তালিকা</th><th>পরীক্ষা আবশ্যক</th><th>ভর্তি ফি (${esc(bnNum(Pub.admSession()))})</th></tr></thead><tbody>
      ${DB.classesIn().map(c => { const r = Admissions.rule(c.id), inp = (k, step = 1) => `<input type="number" step="${step}" class="grid-input" value="${r[k]}" ${can ? '' : 'disabled'} onchange="Admissions.rule('${c.id}').${k}=+this.value;DB.audit('ADMISSION_RULE','admissions','${c.id} ${k}='+this.value);DB.save()">`; return `<tr><td class="font-semibold">${esc(c.name)}</td><td>${inp('minAge')}</td><td>${inp('maxAge')}</td><td>${inp('minPrevGpa', 0.1)}</td><td>${inp('seats')}</td><td>${inp('waitlist')}</td><td><input type="checkbox" ${r.testRequired ? 'checked' : ''} ${can ? '' : 'disabled'} onchange="Admissions.rule('${c.id}').testRequired=this.checked;DB.save()"></td><td>${U.money(DB.fees(c.id, Pub.admSession()).admissionFee)}</td></tr>`; }).join('')}</tbody></table></div>`;
  },
  mount() {
    const f = $('#tst');
    if (f) f.addEventListener('submit', e => {
      e.preventDefault(); const d = formData(f), cls = DB.classesIn().some(c => c.id === App.ui.admMC) ? App.ui.admMC : DB.classesIn()[0]?.id;
      const t = DB.s.admissionTests[cls] || { nextRoll: 1, published: false };
      DB.s.admissionTests[cls] = { ...t, date: d.date, time: d.time, venue: d.venue, total: +d.total, pass: +d.pass };
      DB.audit('ADMISSION_TEST', 'admissions', `${cls} test ${d.date} ${d.time} @ ${d.venue}`); DB.save(); toast('পরীক্ষার সময়সূচি সংরক্ষিত হয়েছে।', 'success'); App.refresh();
    });
  },
};
// Replace the original Principal admissions page and add the same desk for Root User and teachers.
App.addPage('principal', admissionsPage, 'dossier');
App.addPage('admin', admissionsPage, 'system');
App.addPage('teacher', { ...admissionsPage, label: 'ভর্তি দায়িত্ব' });
Principal.viewApplication = id => Admissions.view(id);

/* ------------------------------------------------- public application form --- */
const _origSubmit = Pub.submitAdmission;
Pub.submitAdmission = function (...args) { _origSubmit.apply(this, args); const a = DB.s.admissions[DB.s.admissions.length - 1]; Admissions.afterSubmit(a); if (!a.eligibility.ok) toast('আবেদন সংরক্ষিত হয়েছে, তবে যোগ্য নয় — বিস্তারিত জানতে "ট্র্যাক ও যাচাই" দেখুন।', 'warn'); };

Object.assign(App.portals.public.pages.find(p => p.id === 'admissions'), {
  render() {
    if (!DB.s.featureFlags.onlineAdmissions) return Pub.wrap(Pub.hero('অনলাইন ভর্তি', '') + Pub.section('আবেদন গ্রহণ বন্ধ', '', `<p class="text-slate-600">অনলাইন ভর্তির আবেদন বর্তমানে বন্ধ আছে। অনুগ্রহ করে নোটিশ বোর্ড দেখুন।</p>`));
    const first = DB.classesIn('ALL')[0];
    if (!first) return Pub.wrap(Pub.hero('অনলাইন ভর্তি', '') + Pub.section('', '', emptyState('ভর্তির জন্য এখনো কোনো শ্রেণি প্রকাশ করা হয়নি। বিস্তারিত জানতে অফিসে যোগাযোগ করুন।', 'file-pen-line')));
    const A = App.ui.adm || (App.ui.adm = { step: 1, d: { campusId: first.campusId, classId: first.id, coupon: '', docs: [], nationality: 'Bangladeshi' } });
    const d = A.d, F = Admissions.form(), steps = ['শিক্ষার্থী', 'অভিভাবক', 'কাগজপত্র', 'ফি ও কুপন', 'পরিশোধ'];
    const stepper = `<div class="flex items-center gap-2 mb-6 overflow-x-auto">${steps.map((s, i) => `<div class="flex items-center gap-2 shrink-0"><div class="step-dot ${i + 1 < A.step ? 'bg-brand-600 text-white' : i + 1 === A.step ? 'bg-accent text-white' : 'bg-slate-200 text-slate-500'}">${i + 1 < A.step ? '✓' : bnNum(i + 1)}</div><span class="text-sm font-semibold ${i + 1 === A.step ? 'text-slate-900' : 'text-slate-400'}">${s}</span>${i < steps.length - 1 ? '<div class="w-8 h-px bg-slate-300"></div>' : ''}</div>`).join('')}</div>`;
    const nav = back => `<div class="sm:col-span-2 flex ${back ? 'justify-between' : 'justify-end'}">${back ? `<button type="button" class="btn btn-ghost" onclick="App.ui.adm.step=${back};App.refresh()">${icon('arrow-left')} ফিরে যান</button>` : ''}<button class="btn btn-primary">পরবর্তী ধাপ ${icon('arrow-right')}</button></div>`;
    let body = '';
    if (A.step === 1) {
      const t = Admissions.test(d.classId), r = Admissions.rule(d.classId);
      const idk = Admissions.idKeys();
      body = `<p class="text-sm text-slate-600 mb-4">${esc(F.intro)}</p><form id="adm-form" class="grid sm:grid-cols-2 gap-4">
        ${Registry.box(d, { cls: 'sm:col-span-2' })}
        <div><label class="label">ক্যাম্পাস *</label><select class="select" name="campusId" onchange="Object.assign(App.ui.adm.d, formData(this.form));App.ui.adm.d.classId=DB.classesIn(this.value)[0]?.id;App.refresh()">${campusOptions(d.campusId)}</select></div>
        <div><label class="label">আবেদনকৃত শ্রেণি *</label><select class="select" name="classId" onchange="Object.assign(App.ui.adm.d, formData(this.form));App.refresh()">${classOptions(d.classId, false, d.campusId)}</select></div>
        <div class="sm:col-span-2 card p-3 bg-brand-50 border-brand-200 text-xs text-brand-900">${icon('info', 'w-3.5 h-3.5 inline')} ১ জানুয়ারি ${esc(bnNum(Pub.admSession()))} তারিখে যোগ্য বয়স: <b>${bnNum(r.minAge)}–${bnNum(r.maxAge)} বছর</b>${r.minPrevGpa ? ` · ন্যূনতম পূর্ববর্তী জিপিএ <b>${bnNum(r.minPrevGpa)}</b>` : ''} · ${r.testRequired && t ? `ভর্তি পরীক্ষার তারিখ <b>${U.fmtDate(t.date)}</b>` : 'ভর্তি পরীক্ষা নেই'} · ${bnNum(r.seats)}টি আসন।</div>
        ${Admissions.fields('student').filter(f => !idk.includes(f.key)).map(f => Admissions.input(f, d[f.key])).join('')}${nav(0)}</form>`;
    }
    if (A.step === 2) body = `<form id="adm-form" class="grid sm:grid-cols-2 gap-4">${Admissions.fields('guardian').map(f => Admissions.input(f, d[f.key])).join('')}${nav(1)}</form>`;
    if (A.step === 3) {
      const docs = F.docs.filter(x => x.enabled), missing = docs.filter(x => x.required && !d.docs.some(y => y.kind === x.kind));
      body = `<p class="text-sm text-slate-600 mb-4">স্পষ্ট ছবি (JPG/PNG) অথবা পিডিএফ আপলোড করুন। <span class="text-red-500">*</span> চিহ্নিত কাগজপত্র আবশ্যক।</p>
        <div class="grid sm:grid-cols-2 gap-3">${docs.map(k => { const doc = d.docs.find(x => x.kind === k.kind); return `<label class="dropzone p-4 flex items-center gap-3 cursor-pointer ${doc ? '!border-emerald-400 bg-emerald-50/50' : ''}" data-doc="${esc(k.kind)}">${icon(doc ? 'file-check-2' : 'upload-cloud', `w-7 h-7 ${doc ? 'text-emerald-600' : 'text-slate-400'}`)}<div class="min-w-0 flex-1"><div class="text-sm font-semibold">${esc(bn(k.kind))} ${k.required ? '<span class="text-red-500">*</span>' : ''}</div><div class="text-xs text-slate-500 truncate">${doc ? esc(doc.fileName) : 'ফাইল এখানে ছেড়ে দিন অথবা আপলোড করতে ক্লিক করুন'}</div></div><input type="file" accept="${k.kind === 'Student Photo' ? 'image/*' : 'image/*,application/pdf'}" class="hidden"></label>`; }).join('')}</div>
        <div class="flex justify-between mt-6"><button class="btn btn-ghost" onclick="App.ui.adm.step=2;App.refresh()">${icon('arrow-left')} ফিরে যান</button><button class="btn btn-primary" ${missing.length ? `disabled title="অনুপস্থিত: ${esc(missing.map(m => bn(m.kind)).join(', '))}"` : ''} onclick="App.ui.adm.step=4;App.refresh()">পরবর্তী ধাপ ${icon('arrow-right')}</button></div>`;
    }
    if (A.step === 4) {
      const q = Pub.quote(d.classId, d.coupon), el = Admissions.eligibility(d);
      body = `${el.ok ? '' : `<div class="card p-4 mb-4 bg-red-50 border-red-200 text-sm text-red-700"><b>${esc(DB.className(d.classId))}-এর জন্য যোগ্য নয়:</b><br>${el.reasons.map(esc).join('<br>')}<br><span class="text-xs">ফিরে গিয়ে অন্য শ্রেণি নির্বাচন করুন, অথবা অফিসে যোগাযোগ করুন।</span></div>`}
        <div class="grid md:grid-cols-2 gap-6"><div class="space-y-4"><div class="card p-4 text-sm space-y-1"><div class="font-semibold">${esc(d.studentNameBn || d.studentName)}</div><div class="text-slate-500">${esc(DB.className(d.classId))}${d.stream ? ' · ' + esc(d.stream) : ''}${d.sectionPref ? ' · শাখা ' + esc(d.sectionPref) : ''}${d.batchPref ? ' · ' + esc((DB.cls(d.classId)?.batches || []).find(b => b.id === d.batchPref)?.name || '') : ''} · জন্মতারিখ ${U.fmtDate(d.dob)} (বয়স ${bnNum(el.age)})</div><div class="text-slate-500">অভিভাবক: ${esc(d.guardianNameBn || d.guardianName)} (${esc(d.guardianPhone)})</div><div class="text-slate-500">${bnNum(d.docs.length)}টি কাগজ সংযুক্ত</div></div>
          <div><label class="label">প্রোমো / বৃত্তি কোড</label><div class="flex gap-2"><input class="input uppercase" id="coupon" value="${esc(d.coupon)}" placeholder="কোড থাকলে লিখুন"><button class="btn btn-ghost" id="coupon-apply">প্রয়োগ করুন</button></div>
          <div class="text-sm mt-1.5 ${q.valid ? 'text-emerald-600' : 'text-red-600'}">${d.coupon ? (q.valid ? `✓ ${esc(q.label)} প্রয়োগ করা হয়েছে` : '✗ কোডটি অবৈধ বা মেয়াদোত্তীর্ণ') : ''}</div></div>
          <label class="flex items-start gap-2 text-xs text-slate-600"><input type="checkbox" id="decl" class="mt-0.5" ${d.declared ? 'checked' : ''}> ${esc(F.declaration)}</label></div>
          <div class="card p-5 bg-slate-50"><div class="text-xs font-bold uppercase tracking-wide text-slate-500">এখন পরিশোধযোগ্য</div><div class="divide-y divide-slate-200 text-sm mt-2"><div class="flex justify-between py-2"><span>ভর্তি ফি — ${esc(DB.className(d.classId))}</span><span>${U.money(q.fee)}</span></div><div class="flex justify-between py-2 text-emerald-700"><span>ছাড় (${bnNum(q.pct)}%)</span><span>− ${U.money(q.fee - q.net)}</span></div><div class="flex justify-between py-3 text-lg font-extrabold"><span>নিট পরিশোধযোগ্য</span><span>${U.money(q.net)}</span></div></div></div></div>
        <div class="flex justify-between mt-6"><button class="btn btn-ghost" onclick="App.ui.adm.step=3;App.refresh()">${icon('arrow-left')} ফিরে যান</button><button class="btn btn-primary" ${el.ok ? '' : 'disabled'} onclick="if(!document.getElementById('decl').checked){toast('অনুগ্রহ করে ঘোষণাটি গ্রহণ করুন।','error');return}App.ui.adm.d.declared=true;App.ui.adm.step=5;App.refresh()">পরিশোধে এগিয়ে যান ${icon('arrow-right')}</button></div>`;
    }
    if (A.step === 5) {
      const q = Pub.quote(d.classId, d.coupon);
      body = q.net === 0 ? `<div class="text-center py-6"><div class="text-brand-600 flex justify-center">${icon('party-popper', 'w-12 h-12')}</div><h3 class="text-lg font-bold mt-2">সম্পূর্ণ মওকুফ প্রয়োগ করা হয়েছে</h3><p class="text-slate-500 text-sm">কোনো পরিশোধের প্রয়োজন নেই। আবেদন নিবন্ধন করতে জমা দিন।</p><button class="btn btn-primary mt-4" onclick="Pub.submitAdmission('Waiver','WAIVED',{channel:'Waiver',verified:true})">${icon('send')} আবেদন জমা দিন</button></div>` : Pub.payPicker(q.net, 'App.ui.adm.step=4;App.refresh()');
    }
    return Pub.wrap(Pub.hero(`অনলাইন ভর্তি ${bnNum(Pub.admSession())}`, 'পাঁচটি সংক্ষিপ্ত ধাপ — শিক্ষার্থী, অভিভাবক, কাগজপত্র, ফি ও পরিশোধ। আপনি একটি আবেদন আইডি, একটি এসএমএস, একটি রসিদ এবং (প্রযোজ্য ক্ষেত্রে) ভর্তি পরীক্ষার প্রবেশপত্র পাবেন।') + `<section class="max-w-4xl mx-auto px-4 py-10"><div class="card p-5 sm:p-8">${stepper}${body}</div></section>`);
  },
  mount() {
    const f = $('#adm-form');
    if (f) f.addEventListener('submit', e => { e.preventDefault(); const d = App.ui.adm.d; Object.assign(d, formData(f)); if (f.classId) ['stream', 'sectionPref', 'batchPref'].forEach(k => { if (!f.elements[k]) delete d[k]; }); App.ui.adm.step++; App.refresh(); });
    if (f) Registry.mark(f, App.ui.adm?.d?.idLookup?.keys);
    $('#coupon-apply')?.addEventListener('click', () => { App.ui.adm.d.coupon = $('#coupon').value.trim().toUpperCase(); App.refresh(); });
    $$('[data-doc]').forEach(z => {
      const add = async file => {
        if (!file) return;
        try { const dataUrl = await readUpload(file, 1100); const docs = App.ui.adm.d.docs.filter(x => x.kind !== z.dataset.doc); docs.push({ kind: z.dataset.doc, fileName: file.name, fileType: file.type === 'application/pdf' ? 'application/pdf' : 'image/jpeg', dataUrl }); App.ui.adm.d.docs = docs; App.refresh(); }
        catch (e) { toast(e.message, 'error'); }
      };
      z.querySelector('input').addEventListener('change', e => add(e.target.files[0]));
      ['dragenter', 'dragover'].forEach(ev => z.addEventListener(ev, e => { e.preventDefault(); z.classList.add('drag'); }));
      ['dragleave', 'drop'].forEach(ev => z.addEventListener(ev, e => { e.preventDefault(); z.classList.remove('drag'); }));
      z.addEventListener('drop', e => add(e.dataTransfer.files[0]));
    });
  },
});

/* ==========================================================================
   IN-PLACE ADMISSION PAGES (breadcrumb + back, no pop-ups)
   Application page with Approve / Edit / Admit (test-gated) · in-place editor ·
   Direct admission from the office with "Save draft" (any field may be blank).
   ========================================================================== */
Object.assign(Admissions, {
  statusTone: { ...Admissions.statusTone, Draft: 'slate' },
  testGate(a) {
    const r = this.rule(a.classId), t = this.test(a.classId);
    if (!r.testRequired || !t) return { ok: true, note: 'এই শ্রেণির জন্য ভর্তি পরীক্ষার প্রয়োজন নেই।' };
    if (a.status === 'Selected' || a.status === 'Waiting') return { ok: true, note: `মেধাতালিকায় অন্তর্ভুক্ত (${bn(a.status)}${a.meritRank ? ', #' + bnNum(a.meritRank) : ''})।` };
    if (a.score !== undefined && a.score >= t.pass) return { ok: true, note: `ভর্তি পরীক্ষায় উত্তীর্ণ (${bnNum(a.score)}/${bnNum(t.total)})।` };
    return { ok: false, note: a.score === undefined ? `ভর্তি পরীক্ষা আবশ্যক — এখনও কোনো নম্বর লিপিবদ্ধ হয়নি${a.testRoll ? ` (পরীক্ষার রোল ${a.testRoll})` : ''}।` : `প্রাপ্ত নম্বর ${bnNum(a.score)}/${bnNum(t.total)}, যা পাস নম্বর ${bnNum(t.pass)}-এর কম।` };
  },
  view(id) {
    App.openDetail({ title: `আবেদন ${id}`, render: () => this.viewHtml(id), mount: () => this.viewMount(id),
      actions: `<button class="btn btn-ghost btn-sm" onclick="Print.show('admissionReceipt','${id}')">${icon('receipt')} রসিদ</button>` });
  },
  viewHtml(id) {
    const a = DB.s.admissions.find(x => x.id === id), f = this.form().fields, el = a.eligibility || this.eligibility(a), gate = this.testGate(a), t = this.test(a.classId);
    const canDecide = App.can('admissions.decide') || App.has('ADMIN'), open = ['Pending', 'Selected', 'Waiting'].includes(a.status);
    const next = (cls, sec) => Math.max(0, ...DB.studentsIn(cls, sec).map(s => s.roll)) + 1, c = DB.cls(a.classId);
    const rows = f.filter(x => a[x.key] !== undefined && a[x.key] !== '').map(x => [x.type === 'stream' && c?.streamLabel ? c.streamLabel : x.label, x.type === 'batch' ? ((c?.batches || []).find(b => b.id === a[x.key])?.name || '—') : bn(a[x.key])]);
    if (a.idLookup) rows.unshift(['পরিচয় যাচাই', `জন্মনিবন্ধন রেজিস্ট্রি থেকে ${bnNum(a.idLookup.keys.length)}টি তথ্য · ${U.fmtTime(a.idLookup.at)}`]);
    return `<div class="card p-5 mb-5 flex flex-wrap items-center gap-4">${avatar({ name: a.studentName, photo: (a.docs || []).find(d => d.kind === 'Student Photo')?.dataUrl }, 56)}<div class="flex-1 min-w-0"><div class="font-bold text-xl">${esc(a.studentNameBn || a.studentName || '(নামহীন)')}</div><div class="text-sm text-slate-500">${esc(DB.className(a.classId))} · ${esc(DB.campus(a.campusId || DB.campusOf(a.classId)).name)} · জমাদান ${U.fmtTime(a.submittedAt)}</div></div>
        <div class="flex flex-wrap gap-2">${badge(bn(a.status === 'Approved' ? 'Enrolled' : a.status), this.statusTone[a.status])}${el.ok ? badge('যোগ্য', 'green') : badge('অযোগ্য', 'red')}${a.testRoll ? badge('পরীক্ষার রোল ' + a.testRoll, 'blue') : ''}${a.score !== undefined ? badge(`প্রাপ্ত নম্বর ${bnNum(a.score)}${t ? '/' + bnNum(t.total) : ''}`, 'violet') : ''}${a.meritRank ? badge(`মেধাক্রম #${bnNum(a.meritRank)}`, 'amber') : ''}</div></div>
      ${open ? `<div class="card p-4 mb-5 flex flex-wrap items-center gap-2"><span class="text-sm font-semibold mr-auto">সিদ্ধান্ত</span>
        <button class="btn btn-ghost" onclick="Admissions.edit('${a.id}')">${icon('pencil')} আবেদন সম্পাদনা</button>
        ${canDecide && a.status === 'Pending' ? `<button class="btn btn-ghost" onclick="Admissions.approveOnly('${a.id}')">${icon('check')} অনুমোদন করুন (নির্বাচন)</button>` : ''}
        ${canDecide ? `<button class="btn btn-danger" onclick="Principal.decline('${a.id}')">${icon('x')} প্রত্যাখ্যান করুন</button><button type="button" class="btn btn-success" onclick="const f=document.getElementById('enrol');f.scrollIntoView({behavior:'smooth',block:'center'});f.querySelector('select,input')?.focus({preventScroll:true})">${icon('user-check')} ভর্তি করুন…</button>` : ''}</div>` : ''}
      ${el.ok ? '' : `<div class="card p-3 mb-4 bg-red-50 border-red-200 text-sm text-red-700">${el.reasons.map(esc).join('<br>')}</div>`}
      <div class="grid xl:grid-cols-3 gap-5"><div class="card p-5 xl:col-span-2"><div class="font-semibold mb-3">আবেদনের বিবরণ</div><dl class="grid sm:grid-cols-2 gap-3 text-sm">${rows.map(([k, v]) => `<div><dt class="text-xs text-slate-500 font-semibold uppercase">${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
          <div class="mt-4"><div class="label">কাগজপত্র</div><div class="flex flex-wrap gap-2">${(a.docs || []).map((d, i) => `<button class="btn btn-ghost btn-sm" onclick="Dossier.viewDoc(DB.s.admissions.find(x=>x.id==='${a.id}').docs[${i}])">${icon('file-image')} ${esc(bn(d.kind))}</button>`).join('') || '<span class="text-sm text-slate-400">কিছুই আপলোড করা হয়নি</span>'}</div></div></div>
        <div class="space-y-5"><div class="card p-5 text-sm"><div class="font-semibold mb-2">পরিশোধ</div>${!a.payment?.method || a.payment.channel === 'Pay at office' ? badge('ফি অপরিশোধিত', 'slate') : a.payment.verified === false ? badge('ট্রানজ্যাকশন আইডি (TrxID) অযাচাইকৃত', 'amber') : badge('যাচাইকৃত', 'green')}<div class="mt-2">ফি ${U.money(a.fee || 0)} · কুপন ${esc(a.coupon || 'নেই')} (${bnNum(a.discountPct || 0)}%)<br>${Admissions.payText(a)}${a.payment?.txn ? `<br>ট্রানজ্যাকশন আইডি (TrxID) <code>${esc(a.payment.txn)}</code>` : ''}</div></div>
          <div class="card p-5 text-sm"><div class="font-semibold mb-2">ভর্তি পরীক্ষা</div>${t ? `${U.fmtDate(t.date)} ${esc(U.bn(t.time))} · ${esc(t.venue)}<br>পাস নম্বর ${bnNum(t.pass)}/${bnNum(t.total)}` : 'এই শ্রেণির জন্য কোনো পরীক্ষা নির্ধারিত হয়নি।'}<div class="mt-2 ${gate.ok ? 'text-emerald-700' : 'text-amber-700'}">${esc(gate.note)}</div>${a.testRoll ? `<button class="btn btn-ghost btn-sm mt-2" onclick="Admissions.printAdmit(['${a.id}'])">${icon('ticket')} প্রবেশপত্র</button>` : ''}</div></div></div>
      ${open && canDecide ? `<form id="enrol" class="card p-5 mt-5 grid sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"><div class="sm:col-span-2 lg:col-span-5 font-semibold">ভর্তি / অন্তর্ভুক্তি ${gate.ok ? '' : `<span class="ml-2">${badge('পরীক্ষার শর্ত পূরণ হয়নি', 'amber')}</span>`}</div>
        <div><label class="label">শ্রেণি</label><select class="select" name="classId">${classOptions(a.classId, false, a.campusId || DB.campusOf(a.classId))}</select></div>
        <div><label class="label">শাখা</label><select class="select" name="section">${(c.sections.length ? c.sections : ['']).map(s => `<option value="${esc(s)}">${esc(s || '— শাখা নেই —')}</option>`).join('')}</select></div>
        <div><label class="label">রোল</label><input type="number" min="1" class="input" name="roll" value="${next(a.classId, c.sections[0] || '')}"></div>
        <div><label class="label">শিফট</label><select class="select" name="shift"><option value="" ${c.shift ? '' : 'selected'}>— শিফট নেই —</option>${DB.s.school.shifts.map(s => `<option value="${s.id}" ${s.id === c.shift ? 'selected' : ''}>${esc(bn(s.name))}</option>`).join('')}</select></div>
        <div><label class="label">মাসিক বেতনে ছাড় %</label><input type="number" min="0" max="100" class="input" name="concessionPct" value="0"></div>
        <div class="contents" data-dims>${this.enrolDims(c, a)}</div>
        ${gate.ok ? '' : `<label class="sm:col-span-2 lg:col-span-5 flex items-center gap-2 text-sm text-amber-800"><input type="checkbox" name="override"> ভর্তি পরীক্ষায় উত্তীর্ণ না হলেও ভর্তি করুন (অধ্যক্ষের বিশেষ অনুমোদন — অডিট লগে লিপিবদ্ধ হবে)</label>`}
        <div class="sm:col-span-2 lg:col-span-5"><button class="btn btn-success">${icon('user-check')} ভর্তি করুন ও লগইন তৈরি করুন</button></div></form>` : ''}`;
  },
  viewMount(id) {
    const f = $('#enrol'); if (!f) return;
    const next = (cls, sec) => Math.max(0, ...DB.studentsIn(cls, sec).map(s => s.roll)) + 1;
    f.classId.addEventListener('change', () => { const c = DB.cls(f.classId.value); f.section.innerHTML = (c.sections.length ? c.sections : ['']).map(s => `<option value="${esc(s)}">${esc(s || '— শাখা নেই —')}</option>`).join(''); f.roll.value = next(c.id, c.sections[0] || ''); $('[data-dims]', f).innerHTML = this.enrolDims(c, DB.s.admissions.find(x => x.id === id)); });
    f.section.addEventListener('change', () => { f.roll.value = next(f.classId.value, f.section.value); });
    f.addEventListener('submit', e => {
      e.preventDefault(); const a = DB.s.admissions.find(x => x.id === id), o = formData(f), gate = this.testGate(a);
      if (!f.stream) o.stream = ''; if (!f.batchId) o.batchId = '';
      if (!gate.ok && !f.override?.checked) return toast('ভর্তি পরীক্ষার শর্ত পূরণ হয়নি — তবুও ভর্তি করতে বিশেষ অনুমোদন ঘরে টিক দিন।', 'error');
      if (!gate.ok) DB.audit('ADMISSION_TEST_OVERRIDE', 'admissions', `${a.id} admitted without passing the test (${gate.note})`);
      Principal.approve(a.id, { ...o, roll: +o.roll, concessionPct: +o.concessionPct });
    });
  },
  approveOnly(id) {
    const a = DB.s.admissions.find(x => x.id === id); a.status = 'Selected'; a.decidedAt = new Date().toISOString();
    DB.sms(a.guardianPhone, `${DB.s.school.shortName}: ${a.studentNameBn || a.studentName} (${a.id}) ভর্তির জন্য নির্বাচিত হয়েছে। অনুগ্রহ করে ৭ দিনের মধ্যে অফিসে এসে ভর্তি সম্পন্ন করুন।`);
    DB.audit('ADMISSION_SELECT', 'admissions', a.id); DB.save(); toast('আবেদন অনুমোদিত (নির্বাচিত)। অভিভাবককে অবহিত করা হয়েছে।', 'success'); App.refresh();
  },
  enrol(id) { this.view(id); setTimeout(() => $('#enrol')?.scrollIntoView({ behavior: 'smooth' }), 50); },
  /** Application or unsaved office draft by id. */
  rec(id) { return DB.s.admissions.find(x => x.id === id) || (this._new?.id === id ? this._new : null); },
  /** Fields shown in the look-up box at the top of the forms (birth registration first, then date of birth). */
  idKeys() { return this.form().fields.some(f => f.key === 'birthRegNo' && f.enabled) ? ['birthRegNo', 'dob'] : []; },
  /** বিভাগ/গ্রুপ and ব্যাচ pickers of the enrolment form, pre-set from the application. */
  enrolDims(c, a) {
    const S = c?.streams || [], B = c?.batches || [];
    return `${S.length ? `<div><label class="label">${esc(c.streamLabel || 'বিভাগ / গ্রুপ')}</label><select class="select" name="stream"><option value="">— নির্ধারিত নয় —</option>${S.map(s => `<option ${s === a?.stream ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>` : ''}${B.length ? `<div><label class="label">ব্যাচ</label><select class="select" name="batchId"><option value="">— কোনোটি নয় —</option>${B.map(b => `<option value="${b.id}" ${b.id === a?.batchPref ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>` : ''}`;
  },

  /* ---------- in-place editor (also used for office drafts) ---------- */
  edit(id) {
    if (!App.perm('admissions', 'edit')) return toast('আবেদন সম্পাদনার অনুমতি নেই।', 'error');
    const a = DB.s.admissions.find(x => x.id === id);
    App.openDetail({ title: a.status === 'Draft' ? `খসড়া ${a.id}` : `সম্পাদনা: ${a.id}`, render: () => this.formHtml(a, a.status === 'Draft'), mount: () => this.formMount(a.id) });
  },
  /** Direct admission from the office: full form in place; "Save draft" accepts blanks, "Admit now" enrols immediately. */
  office() {
    if (!App.perm('admissions', 'edit')) return toast('অনুমতি নেই।', 'error');
    const cls = DB.classesIn()[0];
    if (!cls) return toast('সরাসরি ভর্তির আগে এই ক্যাম্পাসে অন্তত একটি শ্রেণি যোগ করুন (প্রতিষ্ঠানের সেটিংস → ক্যাম্পাস, শ্রেণি ও স্তর)।', 'warn');
    const a = { id: 'DRF-' + DB.id('').replace(/\D/g, ''), status: 'Draft', campusId: DB.campusId(), classId: cls.id, studentName: '', docs: [], fee: DB.fees(cls.id).admissionFee, coupon: null, discountPct: 0, netPaid: 0, payment: { method: 'Cash', txn: '', channel: 'Office', verified: true, at: new Date().toISOString() }, submittedAt: new Date().toISOString(), note: '', source: 'Office', eligibility: { ok: true, reasons: [] } };
    this._new = a;   // persisted only on Save draft / Admit now
    App.openDetail({ title: 'সরাসরি ভর্তি (অফিস)', render: () => this.formHtml(a, true), mount: () => this.formMount(a.id) });
  },
  formHtml(a, office) {
    const fs = this.form().fields.filter(f => f.enabled), c = DB.cls(a.classId) || DB.classesIn()[0];
    const inp = f => this.input({ ...f, required: false }, a[f.key]);   // staff forms never block on blanks (drafts allowed)
    const skip = [...this.idKeys(), ...(office ? ['sectionPref'] : [])];   // look-up box fields sit on top; office picks the section below
    return `<form id="adm-staff" data-app="${esc(a.id)}" class="space-y-5">${Registry.box(a, { required: false })}<div class="card p-5"><div class="flex flex-wrap items-center gap-2 mb-3"><div class="font-semibold mr-auto">${office ? 'অফিস থেকে সরাসরি ভর্তি' : 'আবেদন'}</div>${badge(a.status === 'Draft' ? 'খসড়া' :bn(a.status), this.statusTone[a.status] || 'slate')}</div>
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3"><div><label class="label">আবেদনকৃত / ভর্তিকৃত শ্রেণি</label><select class="select" name="classId">${classOptions(a.classId, false, 'ALL')}</select></div>
        ${office ? '' : `<div><label class="label">অবস্থা</label><select class="select" name="status">${['Pending', 'Selected', 'Waiting', 'Declined'].map(s => `<option value="${s}" ${s === a.status ? 'selected' : ''}>${bn(s)}</option>`).join('')}</select></div><div><label class="label">পরীক্ষার রোল</label><input class="input font-mono" name="testRoll" value="${esc(a.testRoll || '')}"></div><div><label class="label">পরীক্ষার নম্বর</label><input class="input" type="number" name="score" value="${a.score ?? ''}"></div>`}</div></div>
      <div class="card p-5"><div class="font-semibold mb-3">শিক্ষার্থীর তথ্য</div><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">${this.fields('student').filter(f => !skip.includes(f.key)).map(inp).join('')}</div></div>
      <div class="card p-5"><div class="font-semibold mb-3">অভিভাবকের তথ্য</div><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">${this.fields('guardian').map(inp).join('')}</div></div>
      <div class="card p-5"><div class="font-semibold mb-3">কাগজপত্র</div><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">${this.form().docs.filter(d => d.enabled).map(d => { const doc = (a.docs || []).find(x => x.kind === d.kind); return `<label class="dropzone p-3 flex items-center gap-3 cursor-pointer ${doc ? '!border-emerald-400 bg-emerald-50/50' : ''}">${icon(doc ? 'file-check-2' : 'upload-cloud', `w-6 h-6 ${doc ? 'text-emerald-600' : 'text-slate-400'}`)}<span class="min-w-0"><span class="block text-sm font-semibold">${esc(bn(d.kind))}</span><span class="block text-xs text-slate-500 truncate">${doc ? esc(doc.fileName) : 'আপলোড করুন'}</span></span><input type="file" class="hidden" accept="image/*,application/pdf" data-sdoc="${esc(d.kind)}"></label>`; }).join('')}</div></div>
      ${office ? `<div class="card p-5"><div class="font-semibold mb-3">গৃহীত ফি ও ভর্তি</div><div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div><label class="label">ভর্তি ফি (৳)</label><input type="number" min="0" class="input" name="fee" value="${a.fee ?? DB.fees(c.id).admissionFee}"></div>
          <div><label class="label">গ্রহণের মাধ্যম</label><select class="select" name="payMethod">${['Cash', 'Bank', ...MFS, 'Card', 'Waiver'].map(m => `<option value="${m}" ${m === a.payment?.method ? 'selected' : ''}>${bn(m)}</option>`).join('')}</select></div>
          <div><label class="label">ট্রানজ্যাকশন আইডি (TrxID) / স্লিপ নম্বর</label><input class="input font-mono uppercase" name="trx" value="${esc(a.payment?.txn || '')}"></div>
          <div><label class="label">শাখা</label><select class="select" name="section">${(c.sections.length ? c.sections : ['']).map(s => `<option value="${esc(s)}" ${s === a.section ? 'selected' : ''}>${esc(s || '— শাখা নেই —')}</option>`).join('')}</select></div>
          <div><label class="label">রোল</label><input type="number" min="1" class="input" name="roll" value="${a.roll || ''}" placeholder="স্বয়ংক্রিয়"></div>
          <div><label class="label">শিফট</label><select class="select" name="shift"><option value="" ${(a.shift || c.shift) ? '' : 'selected'}>— শিফট নেই —</option>${DB.s.school.shifts.map(s => `<option value="${s.id}" ${s.id === (a.shift || c.shift) ? 'selected' : ''}>${esc(bn(s.name))}</option>`).join('')}</select></div>
          <div><label class="label">মাসিক বেতনে ছাড় %</label><input type="number" min="0" max="100" class="input" name="concessionPct" value="${a.concessionPct || 0}"></div></div></div>` : `<div class="card p-5"><label class="label">অভ্যন্তরীণ মন্তব্য</label><input class="input" name="note" value="${esc(a.note || '')}"></div>`}
      <div class="flex flex-wrap gap-2 sticky bottom-0 bg-[var(--surface)] py-3">${office ? `<button type="button" class="btn btn-ghost text-red-600" onclick="Admissions.discardDraft('${a.id}')">${icon('trash-2')} বাতিল করুন</button>` : ''}<span class="flex-1"></span><button type="button" class="btn btn-ghost" onclick="App.closeDetail()">বাতিল</button>${office ? `<button type="submit" name="act" value="draft" class="btn btn-ghost">${icon('save')} খসড়া সংরক্ষণ করুন</button><button type="submit" name="act" value="admit" class="btn btn-success">${icon('user-check')} এখনই ভর্তি করুন</button>` : `<button class="btn btn-primary">${icon('save')} আবেদন সংরক্ষণ করুন</button>`}</div></form>`;
  },
  formMount(id) {
    const f = $('#adm-staff'), a = () => DB.s.admissions.find(x => x.id === id) || (this._new?.id === id ? this._new : null), keep = x => { if (!DB.s.admissions.includes(x)) DB.s.admissions.push(x); };
    $$('[data-sdoc]', f).forEach(inp => inp.addEventListener('change', async () => {
      const file = inp.files[0]; if (!file) return;
      try { this.collect(f, a()); const url = await readUpload(file, 1100); const x = a(); x.docs = (x.docs || []).filter(d => d.kind !== inp.dataset.sdoc); x.docs.push({ kind: inp.dataset.sdoc, fileName: file.name, fileType: file.type === 'application/pdf' ? 'application/pdf' : 'image/jpeg', dataUrl: url }); DB.save(); App.refresh(); }
      catch (e) { toast(e.message, 'error'); }
    }));
    // another class: its own sections and shift apply (the class may have none)
    f.classId.addEventListener('change', () => { const x = a(); this.collect(f, x); delete x.section; delete x.shift; App.refresh(); });
    Registry.mark(f, a()?.idLookup?.keys);
    f.addEventListener('submit', e => {
      e.preventDefault(); const x = a(), act = e.submitter?.value || 'save';
      this.collect(f, x); x.eligibility = this.eligibility(x);
      if (act === 'draft') { keep(x); x.status = 'Draft'; DB.audit('ADMISSION_DRAFT', 'admissions', `${x.id} saved (${x.studentName || 'unnamed'})`); DB.save(); toast('খসড়া সংরক্ষিত হয়েছে — যেকোনো সময় ভর্তি → খসড়া থেকে সম্পন্ন করুন।', 'success'); return App.closeDetail(); }
      if (act === 'admit') {
        const miss = [['studentName', 'শিক্ষার্থীর নাম'], ['dob', 'জন্মতারিখ'], ['guardianName', 'অভিভাবকের নাম'], ['guardianPhone', 'অভিভাবকের মোবাইল']].filter(([k]) => !x[k]).map(([, l]) => l);
        if (miss.length) return toast(`ভর্তি করতে পূরণ করুন: ${miss.join(', ')}। (অসম্পূর্ণ ফরম রাখতে “খসড়া সংরক্ষণ করুন” ব্যবহার করুন।)`, 'error');
        if (!/^01[3-9]\d{8}$/.test(x.guardianPhone)) return toast('অভিভাবকের মোবাইল নম্বর 01XXXXXXXXX আকারে হতে হবে।', 'error');
        const y = Pub.admSession(), n = DB.s.admissions.filter(z => z.id.startsWith(`APP-${y}`)).length + 1;
        const oldId = x.id; x.id = `APP-${y}-${String(n).padStart(4, '0')}`; x.status = 'Pending'; x.submittedAt = new Date().toISOString();
        x.payment = x.payment && x.payment.method ? x.payment : { method: 'Cash' };
        x.netPaid = x.payment.method === 'Waiver' ? 0 : x.fee; x.payment = { ...x.payment, txn: x.payment.txn || (x.payment.method === 'Cash' ? `CASH-${Date.now().toString().slice(-6)}` : `OFF-${Date.now().toString().slice(-8)}`), channel: 'Office', verified: true, at: new Date().toISOString() };
        if (x.netPaid > 0) DB.postJournal(`ভর্তি ফি ${x.id} (অফিস) — ${bn(x.payment.method)}`, [{ acct: DB.mfsAccount(x.payment.method), dr: x.netPaid, cr: 0 }, { acct: '2200', dr: 0, cr: x.netPaid }], x.id, App.session.userId, null, { kind: 'RV', campusId: DB.campusOf(x.classId), payee: x.guardianName });
        DB.audit('ADMISSION_OFFICE', 'admissions', `${oldId} → ${x.id} direct admission (${x.studentName})`);
        keep(x); DB.save(); Principal.approve(x.id, { classId: x.classId, section: x.section, roll: x.roll ? +x.roll : undefined, shift: x.shift, concessionPct: +x.concessionPct || 0 });
        App.details.pop(); this.view(x.id); return;
      }
      if (x.score !== undefined && x.score !== '') x.score = +x.score; else delete x.score;
      DB.audit('ADMISSION_EDIT', 'admissions', `${x.id} edited`); DB.save(); toast('আবেদন সংরক্ষিত হয়েছে।', 'success'); App.closeDetail();
    });
  },
  /** Copy the staff form into the application record (no validation — drafts may be blank). */
  collect(f, x) {
    const d = formData(f); delete d.act;
    ['fee', 'concessionPct', 'roll'].forEach(k => { if (d[k] !== undefined) d[k] = d[k] === '' ? '' : +d[k]; });
    if (d.payMethod !== undefined) { x.payment = { ...(x.payment || {}), method: d.payMethod, txn: (d.trx || '').toUpperCase() }; delete d.payMethod; delete d.trx; }
    Object.assign(x, d); x.campusId = DB.campusOf(x.classId);
  },
  discardDraft(id) { if (!confirm('এই খসড়াটি বাতিল করবেন?')) return; this._new = null; DB.s.admissions = DB.s.admissions.filter(x => x.id !== id); DB.audit('ADMISSION_DRAFT_DISCARD', 'admissions', id); DB.save(); App.closeDetail(); },
});

Object.assign(Admissions, {
  appsHead(can) {
    const n = DB.s.admissions.filter(a => a.status === 'Draft' && (a.campusId || DB.campusOf(a.classId)) === DB.campusId()).length;
    return `<div class="flex flex-wrap items-center gap-2 mb-3">${can ? `<button class="btn btn-primary" onclick="Admissions.office()">${icon('user-plus')} সরাসরি ভর্তি (অফিস)</button>` : ''}<button class="btn ${App.ui.admF === 'Draft' ? 'btn-primary' : 'btn-ghost'}" onclick="App.ui.admF='Draft';App.refresh()">${icon('file-pen-line')} খসড়াসমূহ <span class="opacity-70">${bnNum(n)}</span></button></div>`;
  },
  draftList() {
    const drafts = DB.s.admissions.filter(a => a.status === 'Draft' && (a.campusId || DB.campusOf(a.classId)) === DB.campusId());
    return `<div class="flex gap-2 mb-4"><button class="btn btn-sm btn-ghost" onclick="App.ui.admF='Pending';App.refresh()">${icon('arrow-left')} সকল আবেদন</button></div><div class="card divide-y divide-slate-100">${drafts.map(a => `<button class="w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-slate-50" onclick="Admissions.edit('${a.id}')">${icon('file-pen-line', 'w-5 h-5 text-slate-400')}<span class="flex-1"><b>${esc(a.studentNameBn || a.studentName || '(নামহীন খসড়া)')}</b><span class="block text-xs text-slate-500">${a.id} · ${esc(DB.className(a.classId))} · শুরু ${U.fmtTime(a.submittedAt)}</span></span>${badge('খসড়া', 'slate')}</button>`).join('') || emptyState('কোনো খসড়া নেই। অসম্পূর্ণ ফরম রাখতে “সরাসরি ভর্তি (অফিস)” ও “খসড়া সংরক্ষণ করুন” ব্যবহার করুন।')}</div>`;
  },
});
