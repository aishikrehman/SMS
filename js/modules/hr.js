/* ==========================================================================
   FACULTY, HR & SUPPORT STAFF
   Support-staff directory (no dashboard login needed) · staff profiles ·
   teacher self-service profile (contact, photo, signature, qualification) ·
   guardian/student feedback · composite performance scorecard
   (inspection + feedback + syllabus pace) · Class-teacher desk.
   ========================================================================== */

DB.addSeeder('feedback', () => []);

const HR = {
  feedbackAvg(tid) { const f = DB.s.feedback.filter(x => x.teacherId === tid); return f.length ? { avg: U.sum(f, x => x.rating) / f.length, n: f.length } : { avg: null, n: 0 }; },
  syllabusPace(tid) {
    const sys = DB.s.syllabus.filter(x => x.teacherId === tid && x.chapters.length); if (!sys.length || typeof Academics === 'undefined') return null;
    return U.sum(sys, sy => Academics.progress(sy).pct) / sys.length;
  },
  /** Composite score /100: 40% principal inspection, 30% guardian/student feedback, 30% syllabus completion. Missing parts are re-weighted. */
  score(tid) {
    const parts = [], ins = Faculty.avgEval(tid), fb = this.feedbackAvg(tid).avg, sp = this.syllabusPace(tid);
    if (ins !== null) parts.push([40, ins / 5 * 100]); if (fb !== null) parts.push([30, fb / 5 * 100]); if (sp !== null) parts.push([30, sp]);
    const w = U.sum(parts, p => p[0]); return w ? U.sum(parts, p => p[0] * p[1]) / w : null;
  },

  /* ---------- support staff ---------- */
  editStaff(id) {
    if (!App.perm('hr', 'edit')) return toast('কর্মীর তথ্য এডিট করার অনুমতি নেই।', 'error');
    const s = DB.s.staff.find(x => x.id === id) || { name: '', type: 'Office Assistant', designation: '', campusId: DB.campusId(), phone: '', email: '', salaryGrade: 'S3', baseSalary: DB.s.staffGrades?.S3 || 16000, payoutMethod: 'Bank', payoutAccount: '', status: 'Probation', blood: '', nid: '', joinDate: U.today() };
    Modal.open({ title: id ? `${esc(pn(s))} সম্পাদনা` : 'সহায়ক কর্মী যোগ করুন', size: 'lg', body: `<form id="stf" class="grid sm:grid-cols-3 gap-3"><div class="sm:col-span-2"><label class="label">পূর্ণ নাম</label><input class="input" name="name" value="${esc(s.name)}" required></div>${People.fields(s)}<div><label class="label">কর্মীর ধরন</label><select class="select" name="type">${STAFF_TYPES.map(t => `<option value="${t}" ${t === s.type ? 'selected' : ''}>${bn(t)}</option>`).join('')}</select></div>
      <div><label class="label">পদবি</label><input class="input" name="designation" value="${esc(s.designation)}" required></div><div><label class="label">ক্যাম্পাস</label><select class="select" name="campusId">${campusOptions(s.campusId)}</select></div><div><label class="label">যোগদান</label><input type="date" class="input" name="joinDate" value="${s.joinDate}"></div>
      <div><label class="label">মোবাইল</label><input class="input" name="phone" value="${esc(s.phone)}" pattern="01[3-9][0-9]{8}" required></div><div><label class="label">ই-মেইল</label><input type="email" class="input" name="email" value="${esc(s.email || '')}"></div><div><label class="label">জাতীয় পরিচয়পত্র নম্বর</label><input class="input" name="nid" value="${esc(s.nid || '')}"></div>
      <div><label class="label">রক্তের গ্রুপ</label><input class="input" name="blood" value="${esc(s.blood || '')}"></div><div><label class="label">বেতন গ্রেড</label><select class="select" name="salaryGrade">${Object.entries(DB.s.staffGrades || {}).map(([g, v]) => `<option value="${g}" ${g === s.salaryGrade ? 'selected' : ''}>${g} — ${U.money(v)}</option>`).join('')}</select></div><div><label class="label">অবস্থা</label><select class="select" name="status">${['Probation', 'Confirmed', 'On leave', 'Resigned'].map(x => `<option value="${x}" ${x === s.status ? 'selected' : ''}>${bn(x)}</option>`).join('')}</select></div>
      <div><label class="label">বেতন প্রদানের মাধ্যম</label><select class="select" name="payoutMethod">${PAYOUT_METHODS.map(m => `<option value="${m}" ${m === s.payoutMethod ? 'selected' : ''}>${bn(m)}</option>`).join('')}</select></div><div class="sm:col-span-2"><label class="label">হিসাব / ওয়ালেট নম্বর</label><input class="input font-mono" name="payoutAccount" value="${esc(s.payoutAccount || '')}"></div>
      <div class="sm:col-span-3"><button class="btn btn-primary w-full">${icon('save')} কর্মীর তথ্য সংরক্ষণ করুন</button></div></form>` });
    $('#stf').addEventListener('submit', e => {
      e.preventDefault(); const f = formData(e.target); f.baseSalary = DB.s.staffGrades[f.salaryGrade];
      if (id) Object.assign(s, f); else { const n = { id: DB.id('ST'), ...f, photo: null, userId: null, overtimeHours: {} }; DB.s.staff.push(n); DB.s.teacherAbsences[n.id] = {}; }
      DB.audit(id ? 'STAFF_EDIT' : 'STAFF_ADD', 'staff', `${f.name} (${f.type}, ${f.campusId})`); DB.save(); Modal.close(); toast('কর্মীর তথ্য সংরক্ষিত হয়েছে।', 'success'); App.refresh();
    });
  },
  staffProfile(id) {
    const s = DB.s.staff.find(x => x.id === id), mk = U.monthKey(new Date()), abs = DB.s.teacherAbsences[id]?.[mk] || { unexcused: 0, excused: 0 };
    const pays = DB.s.payroll.filter(p => p.empId === id).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 6);
    Modal.open({ title: `কর্মীর প্রোফাইল · ${esc(pn(s))}`, size: 'xl', body: `<div class="flex flex-wrap items-center gap-4 mb-4">${avatar(s, 56)}<div class="flex-1"><div class="font-bold text-lg">${esc(pn(s))}</div><div class="text-sm text-slate-500">${esc(s.designation)} · ${esc(bn(s.type))} · ${esc(DB.campus(s.campusId).name)} · ${s.id}</div><div class="text-xs text-slate-500">${esc(U.bn(s.phone))} · যোগদান ${U.fmtDate(s.joinDate)}${s.blood ? ' · রক্তের গ্রুপ ' + esc(s.blood) : ''}</div></div>${badge(bn(s.status), s.status === 'Confirmed' ? 'green' : 'amber')}<label class="btn btn-ghost btn-sm cursor-pointer">${icon('camera')} ছবি<input type="file" accept="image/*" class="hidden" onchange="HR.staffPhoto('${s.id}',this.files[0])"></label></div>
      <div class="grid lg:grid-cols-2 gap-5"><div class="space-y-4"><div class="card p-4 text-sm"><div class="font-semibold mb-2">চলতি মাস</div>${badge(`অনুমোদিত ছুটি ${bnNum(abs.excused)}`, 'violet')} ${badge(`অননুমোদিত ${bnNum(abs.unexcused)}`, abs.unexcused ? 'red' : 'slate')} ${badge(`অতিরিক্ত কাজ ${bnNum(s.overtimeHours?.[mk] || 0)} ঘণ্টা`, 'blue')}</div>${typeof AttendanceUI !== 'undefined' ? `<div class="card p-4"><div class="font-semibold mb-2 text-sm">ফটক লগ</div>${AttendanceUI.gateLog(s.id, 10)}</div>` : ''}</div>
      <div class="card scroll-x"><div class="px-4 py-3 border-b border-slate-100 font-semibold">বেতন-ভাতার ইতিহাস</div><table class="table"><tbody>${pays.map(p => `<tr><td>${U.monthName(p.month)}</td><td class="text-right">${U.money(p.net)}</td><td>${statusBadge(p.status)}</td><td><button class="btn btn-ghost btn-sm" aria-label="বেতন বিবরণী" onclick="Payroll.payslip('${s.id}','${p.month}')">${icon('file-text')}</button></td></tr>`).join('') || `<tr><td>${emptyState('এখনো কোনো বেতন-ভাতা নেই।')}</td></tr>`}</tbody></table></div></div>`,
      footer: `<button class="btn btn-ghost" onclick="HR.editStaff('${s.id}')">${icon('pencil')} এডিট করুন</button>${typeof PrintStudio !== 'undefined' && PrintStudio.gen?.employeeCards ? `<button class="btn btn-ghost" onclick="Print.show('idCards',['${s.id}'],'h','employee')">${icon('id-card')} আইডি কার্ড</button>` : ''}<button class="btn btn-primary" onclick="Modal.close()">বন্ধ করুন</button>` });
  },
  async staffPhoto(id, file) { if (!file) return; try { DB.s.staff.find(x => x.id === id).photo = await readUpload(file, 360); DB.save(); this.staffProfile(id); } catch (e) { toast(e.message, 'error'); } },

  /* ---------- guardian feedback ---------- */
  rate(teacherId, studentId) {
    Modal.open({ title: `${esc(DB.teacherName(teacherId))}-এর জন্য মতামত`, size: 'sm', body: `<form id="fbk" class="space-y-3"><div class="flex justify-center gap-1 text-3xl" id="stars">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-n="${n}" aria-label="${bnNum(n)} তারকা" class="text-slate-300 hover:text-amber-400">★</button>`).join('')}</div><input type="hidden" name="rating" value="0"><div><label class="label">মন্তব্য (ঐচ্ছিক)</label><textarea class="textarea" name="comment" rows="3" maxlength="300"></textarea></div><p class="text-xs text-slate-500">মতামত অধ্যক্ষের সঙ্গে শেয়ার করা হয়।</p><button class="btn btn-primary w-full">মতামত জমা দিন</button></form>` });
    const f = $('#fbk'); $$('#stars button').forEach(b => b.addEventListener('click', () => { f.rating.value = b.dataset.n; $$('#stars button').forEach(x => x.className = +x.dataset.n <= +b.dataset.n ? 'text-amber-400' : 'text-slate-300'); }));
    f.addEventListener('submit', e => {
      e.preventDefault(); const d = formData(f); if (!+d.rating) return toast('একটি তারকা রেটিং নির্বাচন করুন।', 'error');
      DB.s.feedback = DB.s.feedback.filter(x => !(x.teacherId === teacherId && x.studentId === studentId && x.by === App.session.userId && x.term === `Pre-Test ${DB.session()}`));
      DB.s.feedback.push({ id: DB.id('FB'), teacherId, studentId, by: App.session.userId, role: App.session.role, rating: +d.rating, comment: d.comment, term: `Pre-Test ${DB.session()}`, date: U.today() });
      DB.audit('TEACHER_FEEDBACK', 'feedback', `${DB.teacherName(teacherId)} rated ${d.rating}/5`); DB.save(); Modal.close(); toast('আপনার মতামতের জন্য ধন্যবাদ।', 'success'); App.refresh();
    });
  },
};

/* ------------------------------------------------------------- pages --- */
const staffDirPage = {
  id: 'support-staff', label: 'সহায়ক কর্মী', icon: 'hard-hat', module: 'hr',
  render() {
    const type = App.ui.stType || '', list = DB.s.staff.filter(s => s.campusId === DB.campusId() && (!type || s.type === type));
    const mk = U.monthKey(new Date());
    return pageHeader('সহায়ক ও প্রশাসনিক কর্মী', '', App.perm('hr', 'edit') ? `<button class="btn btn-primary" onclick="HR.editStaff()">${icon('user-plus')} কর্মী যোগ করুন</button>` : '')
      + `<div class="flex flex-wrap gap-2 mb-4"><button class="btn btn-sm ${!type ? 'btn-primary' : 'btn-ghost'}" onclick="App.ui.stType='';App.refresh()">সকল ${bnNum(DB.s.staff.filter(s => s.campusId === DB.campusId()).length)}</button>${[...new Set(DB.s.staff.filter(s => s.campusId === DB.campusId()).map(s => s.type))].map(t => `<button class="btn btn-sm ${t === type ? 'btn-primary' : 'btn-ghost'}" onclick="App.ui.stType='${t}';App.refresh()">${esc(bn(t))}</button>`).join('')}</div>
      <div class="card scroll-x"><table class="table"><thead><tr><th>কর্মী</th><th>ধরন</th><th>ফোন</th><th>গ্রেড</th><th>প্রদান মাধ্যম</th><th>চলতি মাস</th><th>অবস্থা</th><th></th></tr></thead><tbody>${list.map(s => { const a = DB.s.teacherAbsences[s.id]?.[mk] || { unexcused: 0, excused: 0 }; return `<tr><td><div class="flex items-center gap-2.5">${avatar(s, 30)}<div><button class="font-semibold hover:underline" onclick="HR.staffProfile('${s.id}')">${esc(pn(s))}</button><div class="text-xs text-slate-400">${esc(s.designation)} · ${s.id}</div></div></div></td><td>${esc(bn(s.type))}</td><td class="text-xs">${esc(U.bn(s.phone))}</td><td>${s.salaryGrade} · ${U.money(s.baseSalary)}</td><td class="text-xs">${esc(bn(s.payoutMethod))}</td><td class="text-xs">${bnNum(a.excused)} অনু. ছুটি · <span class="${a.unexcused ? 'text-red-600 font-semibold' : ''}">${bnNum(a.unexcused)} অননুমোদিত</span>${s.overtimeHours?.[mk] ? ` · ${bnNum(s.overtimeHours[mk])} ঘণ্টা অতিরিক্ত` : ''}</td><td>${badge(bn(s.status), s.status === 'Confirmed' ? 'green' : s.status === 'Resigned' ? 'red' : 'amber')}</td><td><button class="btn btn-ghost btn-sm" title="এডিট করুন" aria-label="এডিট করুন" onclick="HR.editStaff('${s.id}')">${icon('pencil')}</button></td></tr>`; }).join('')}</tbody></table>${list.length ? '' : emptyState('এই ক্যাম্পাসে কোনো কর্মী নেই।')}</div>`;
  },
};
App.addPage('principal', staffDirPage, 'staff');
App.addPage('admin', staffDirPage, 'users');

App.addPage('principal', {
  id: 'performance', label: 'কর্মদক্ষতা স্কোরকার্ড', icon: 'gauge', module: 'hr',
  render() {
    const ts = DB.teachersIn().filter(t => t.status !== 'Resigned').map(t => ({ t, ins: Faculty.avgEval(t.id), fb: HR.feedbackAvg(t.id), sp: HR.syllabusPace(t.id), score: HR.score(t.id) })).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    const fbList = DB.s.feedback.filter(f => DB.teacher(f.teacherId)?.campusId === DB.campusId()).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
    return pageHeader('শিক্ষকমণ্ডলীর কর্মদক্ষতা স্কোরকার্ড', 'সমন্বিত /১০০ = ৪০% পরিদর্শন + ৩০% মতামত + ৩০% পাঠ্যসূচির গতি')
      + `<div class="card scroll-x mb-5"><table class="table"><thead><tr><th>#</th><th>শিক্ষক</th><th>পরিদর্শন</th><th>মতামত</th><th>পাঠ্যসূচির গতি</th><th>সমন্বিত</th><th></th></tr></thead><tbody>${ts.map((x, i) => `<tr><td>${bnNum(i + 1)}</td><td class="font-semibold">${esc(pn(DB.user(x.t.userId)))}<div class="text-xs text-slate-400 font-normal">${esc(x.t.designation)} · ${esc(Teacher.assignSummary(x.t))}</div></td><td>${Faculty.stars(x.ins)}</td><td>${x.fb.avg !== null ? `${Faculty.stars(x.fb.avg)} <span class="text-xs text-slate-400">(${bnNum(x.fb.n)})</span>` : '—'}</td><td class="w-36">${x.sp !== null ? `<div class="text-xs mb-1">${bnNum(x.sp.toFixed(0))}%</div>${progressBar(x.sp)}` : '—'}</td><td><span class="text-lg font-extrabold ${x.score >= 75 ? 'text-emerald-600' : x.score >= 55 ? 'text-amber-600' : 'text-red-600'}">${x.score !== null ? bnNum(x.score.toFixed(0)) : '—'}</span></td><td><button class="btn btn-ghost btn-sm" onclick="Faculty.profile('${x.t.id}','evals')">${icon('star')} পরিদর্শন করুন</button></td></tr>`).join('')}</tbody></table></div>
      <div class="card"><div class="px-5 py-3 border-b border-slate-100 font-semibold">অভিভাবক ও শিক্ষার্থীদের সাম্প্রতিক মতামত</div><div class="divide-y divide-slate-100">${fbList.map(f => `<div class="px-5 py-2.5 text-sm flex gap-3"><span class="text-amber-500 shrink-0">${'★'.repeat(f.rating)}<span class="text-slate-300">${'★'.repeat(5 - f.rating)}</span></span><div class="flex-1"><b>${esc(DB.teacherName(f.teacherId))}</b> — ${esc(f.comment || '(কোনো মন্তব্য নেই)')}<div class="text-xs text-slate-400">${f.role === 'GUARDIAN' ? `${esc(pn(DB.student(f.studentId)))}-এর অভিভাবক` : `শিক্ষার্থী ${esc(pn(DB.student(f.studentId)))}`} ·${U.fmtDate(f.date)}</div></div></div>`).join('') || emptyState('এখনো কোনো মতামত নেই।')}</div></div>`;
  },
}, 'faculty');

/* Teacher self-service profile */
App.addPage('teacher', {
  id: 'my-profile', label: 'আমার প্রোফাইল', icon: 'user-round-cog',
  render() {
    const t = Teacher.me(), u = DB.user(t.userId), fb = HR.feedbackAvg(t.id), mk = U.monthKey(new Date());
    const pays = DB.s.payroll.filter(p => p.empId === t.id).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 4);
    const sc = HR.score(t.id);
    return pageHeader('আমার প্রোফাইল', '')
      + `<div class="grid xl:grid-cols-3 gap-5"><form id="me-f" class="card p-5 xl:col-span-2 grid sm:grid-cols-2 gap-3"><div class="sm:col-span-2 flex items-center gap-4">${avatar(u, 64)}<label class="btn btn-ghost btn-sm cursor-pointer">${icon('camera')} ছবি পরিবর্তন করুন<input type="file" accept="image/*" class="hidden" id="me-photo"></label><div class="text-sm text-slate-500">${esc(t.designation)} · ${esc(t.dept)} · ${esc(DB.campus(t.campusId).name)}<br>কর্মচারী আইডি ${t.id} · যোগদান ${U.fmtDate(t.joinDate)}</div></div>
          <div><label class="label">মোবাইল</label><input class="input" name="phone" value="${esc(u.phone)}" pattern="01[3-9][0-9]{8}" required></div><div><label class="label">ই-মেইল</label><input type="email" class="input" name="email" value="${esc(u.email)}" required></div>
          <div class="sm:col-span-2"><label class="label">শিক্ষাগত যোগ্যতা</label><input class="input" name="qualification" value="${esc(t.qualification || '')}"></div>
          <div class="sm:col-span-2"><label class="label">সংক্ষিপ্ত পরিচিতি (পাবলিক)</label><textarea class="textarea" name="bio" rows="2" maxlength="300">${esc(t.bio || '')}</textarea></div>
          <label class="sm:col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" name="showContact" ${t.showContact !== false ? 'checked' : ''}> পাবলিক শিক্ষকমণ্ডলী তালিকায় আমার ই-মেইল ও ফোন প্রদর্শন করুন</label>
          <div class="sm:col-span-2"><label class="label">ডিজিটাল স্বাক্ষর</label><canvas id="me-sig" width="480" height="140" class="sig-pad w-full max-w-md"></canvas><div class="flex gap-2 mt-2"><button type="button" class="btn btn-ghost btn-sm" onclick="const c=document.getElementById('me-sig');c.getContext('2d').clearRect(0,0,c.width,c.height)">মুছে দিন</button></div></div>
          <div class="sm:col-span-2"><button class="btn btn-primary">${icon('save')} প্রোফাইল সংরক্ষণ করুন</button></div></form>
        <div class="space-y-4"><div class="card p-4"><div class="font-semibold mb-2">আমার পাঠদান বরাদ্দ</div><div class="flex flex-wrap gap-1.5">${Teacher.pairs(t).map(a => badge(`${DB.cls(a.classId).name} · ${DB.subject(a.subjectId).name}`, 'blue')).join('') || '<span class="text-slate-400">কোনো বরাদ্দ নেই</span>'}</div></div>
          <div class="card p-4"><div class="font-semibold mb-2">প্রাপ্ত মতামত</div>${fb.avg !== null ? `${Faculty.stars(fb.avg)} <span class="text-xs text-slate-500">${bnNum(fb.n)} জন অভিভাবক/শিক্ষার্থীর কাছ থেকে</span>` : '<span class="text-sm text-slate-400">এখনো কোনো মতামত নেই</span>'}<div class="mt-2 text-sm">সমন্বিত স্কোর: <b>${sc !== null && sc !== undefined ? bnNum(sc.toFixed(0)) : '—'}</b>/১০০</div></div>
          <div class="card p-4"><div class="font-semibold mb-2">চলতি মাস</div>${badge(`অনুমোদিত ছুটি ${bnNum(DB.s.teacherAbsences[t.id]?.[mk]?.excused || 0)}`, 'violet')} ${badge(`অননুমোদিত ${bnNum(DB.s.teacherAbsences[t.id]?.[mk]?.unexcused || 0)}`, 'red')}<a class="btn btn-ghost btn-sm w-full mt-3" href="${App.href('teacher', 'leave')}">${icon('plane')} ছুটির আবেদন করুন</a></div>
          <div class="card"><div class="px-4 py-3 border-b border-slate-100 font-semibold">আমার বেতন বিবরণী</div><div class="divide-y divide-slate-100">${pays.map(p => `<div class="px-4 py-2 flex items-center text-sm"><span class="flex-1">${U.monthName(p.month)} · ${U.money(p.net)}</span>${statusBadge(p.status)}<button class="btn btn-ghost btn-sm" aria-label="বেতন বিবরণী" onclick="Payroll.payslip('${t.id}','${p.month}')">${icon('file-text')}</button></div>`).join('') || emptyState('এখনো কিছু নেই।')}</div></div></div></div>`;
  },
  mount() {
    const t = Teacher.me(), u = DB.user(t.userId), cv = $('#me-sig'), ctx = cv.getContext('2d'); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#1e3a8a';
    if (t.signature) { const im = new Image(); im.onload = () => ctx.drawImage(im, 0, 0, cv.width, cv.height); im.src = t.signature; }
    let dr = false; const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
    cv.addEventListener('pointerdown', e => { dr = true; cv.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...pos(e)); cv.dataset.dirty = 1; }); cv.addEventListener('pointermove', e => { if (dr) { ctx.lineTo(...pos(e)); ctx.stroke(); } }); cv.addEventListener('pointerup', () => dr = false);
    $('#me-photo').addEventListener('change', async e => { try { u.photo = await readUpload(e.target.files[0], 360); DB.audit('PROFILE_PHOTO', 'users', u.username); DB.save(); App.render(); } catch (err) { toast(err.message, 'error'); } });
    $('#me-f').addEventListener('submit', e => {
      e.preventDefault(); const f = formData(e.target);
      Object.assign(u, { phone: f.phone, email: f.email }); Object.assign(t, { qualification: f.qualification, bio: f.bio, showContact: !!e.target.showContact.checked });
      if (cv.dataset.dirty) t.signature = cv.toDataURL('image/png');
      DB.audit('PROFILE_UPDATE', 'teachers', `${u.username} updated own profile`); DB.save(); toast('প্রোফাইল সংরক্ষিত হয়েছে।', 'success'); App.refresh();
    });
  },
});

/* Class-teacher desk */
App.addPage('teacher', {
  id: 'my-class', label: 'আমার শ্রেণি', icon: 'users-round', module: 'students', when: () => { const t = Teacher.me(); return !!t && DB.s.classes.some(c => c.classTeacherId && c.classTeacherId === t.id); },
  render() {
    // no teacher record (e.g. a Principal with the teacher role) or no homeroom class: an empty state, never a crash
    const t = Teacher.me(), mine = t ? DB.s.classes.filter(c => c.classTeacherId && c.classTeacherId === t.id) : [];
    if (!mine.length) return pageHeader('আমার শ্রেণি', '') + `<div class="card p-6">${emptyState(t ? 'আপনাকে কোনো শ্রেণির শ্রেণিশিক্ষক করা হয়নি।' : 'আপনার অ্যাকাউন্টের সঙ্গে কোনো শিক্ষকের তথ্য যুক্ত নেই।', 'users-round')}</div>`;
    const cls = mine.some(c => c.id === App.ui.myCls) ? App.ui.myCls : mine[0].id;
    const list = DB.studentsIn(cls), ex = DB.latestExam() || DB.examsOf().slice(-1)[0] || null, rem = (ex && DB.s.examRemarks[ex.id]) || {};
    const leaves = DB.s.serviceRequests.filter(r => r.type === 'Leave' && r.stage === 'Class Teacher' && r.status === 'Pending' && DB.student(r.studentId)?.classId === cls);
    if (!ex) return pageHeader(`শ্রেণিশিক্ষক — ${esc(DB.className(cls))}`, '')
      + (leaves.length ? `<div class="card mb-5 border-amber-300"><div class="px-5 py-3 border-b border-amber-200 bg-amber-50 font-semibold text-amber-900">আপনার সুপারিশের অপেক্ষায় ছুটির আবেদন (${bnNum(leaves.length)})</div><div class="divide-y divide-slate-100">${leaves.map(r => Services.row(r)).join('')}</div></div>` : '')
      + `<div class="card scroll-x">${list.length ? `<table class="table"><thead><tr><th>রোল</th><th>শিক্ষার্থী</th><th>উপস্থিতি</th><th>বকেয়া</th><th></th></tr></thead><tbody>${list.map(st => { const a = DB.attendanceStats(st.id); return `<tr><td>${bnNum(st.roll)}</td><td class="font-semibold">${esc(pn(st))}</td><td>${bnNum(a.pct.toFixed(0))}%</td><td>${DB.dues(st.id) ? U.money(DB.dues(st.id)) : '—'}</td><td><button class="btn btn-ghost btn-sm" title="বিস্তারিত দেখুন" aria-label="বিস্তারিত দেখুন" onclick="Dossier.open('${st.id}')">${icon('eye')}</button></td></tr>`; }).join('')}</tbody></table>` : emptyState('এই শ্রেণিতে এখনো কোনো শিক্ষার্থী নেই।', 'users')}</div>`;
    return pageHeader(`শ্রেণিশিক্ষক — ${esc(DB.className(cls))}`, '', mine.length > 1 ? `<select class="select !w-auto" onchange="App.ui.myCls=this.value;App.refresh()">${mine.map(c => `<option value="${c.id}" ${c.id === cls ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>` : '')
      + (leaves.length ? `<div class="card mb-5 border-amber-300"><div class="px-5 py-3 border-b border-amber-200 bg-amber-50 font-semibold text-amber-900">আপনার সুপারিশের অপেক্ষায় ছুটির আবেদন (${bnNum(leaves.length)})</div><div class="divide-y divide-slate-100">${leaves.map(r => Services.row(r)).join('')}</div></div>` : '')
      + `<div class="card scroll-x"><div class="px-5 py-3 border-b border-slate-100 flex items-center"><b>তালিকা ও মন্তব্য · ${esc(ex.name)}</b><button class="btn btn-primary btn-sm ml-auto" onclick="$$('[data-rem]').forEach(i=>{(DB.s.examRemarks['${ex.id}']=DB.s.examRemarks['${ex.id}']||{})[i.dataset.rem]=i.value});DB.audit('EXAM_REMARKS','exams','${cls} ${ex.id}');DB.save();toast('মন্তব্য সংরক্ষিত হয়েছে — এগুলো নম্বরপত্রে মুদ্রিত হবে।','success')">${icon('save')} মন্তব্য সংরক্ষণ করুন</button></div>
        <table class="table"><thead><tr><th>রোল</th><th>শিক্ষার্থী</th><th>উপস্থিতি</th><th>ফলাফল</th><th>বকেয়া</th><th>শ্রেণিশিক্ষকের মন্তব্য</th><th></th></tr></thead><tbody>${list.map(st => { const r = DB.result(st.id, ex.id), a = DB.attendanceStats(st.id); return `<tr><td>${bnNum(st.roll)}</td><td class="font-semibold">${esc(pn(st))}</td><td class="${a.pct < DB.s.school.minAttendance ? 'text-red-600 font-semibold' : ''}">${bnNum(a.pct.toFixed(0))}%</td><td>${r.gpa !== null ? gpaFmt(r.gpa) + ' · ' : ''}${esc(r.letter)}</td><td class="${DB.dues(st.id) ? 'text-red-600' : 'text-slate-400'}">${DB.dues(st.id) ? U.money(DB.dues(st.id)) : '—'}</td><td><input class="input !py-1 text-sm" data-rem="${st.id}" value="${esc(rem[st.id] || '')}" placeholder="${r.passed ? (r.gpa >= 4.5 ? 'চমৎকার — এভাবেই চালিয়ে যাও।' : 'ভালো প্রচেষ্টা; আরও উচ্চ লক্ষ্য রাখো।') : 'উল্লেখযোগ্য উন্নতি প্রয়োজন।'}"></td><td><button class="btn btn-ghost btn-sm" title="বিস্তারিত দেখুন" aria-label="বিস্তারিত দেখুন" onclick="Dossier.open('${st.id}')">${icon('eye')}</button></td></tr>`; }).join('')}</tbody></table></div>`;
  },
}, 'today');

/* Guardian: rate your child's teachers */
App.addPage('guardian', {
  id: 'feedback', label: 'শিক্ষক মূল্যায়ন', icon: 'star',
  render() {
    const c = Guardian.child(); if (!c) return emptyState('কোনো সন্তান যুক্ত নেই।');
    const tids = [...new Set(DB.s.routine.filter(r => r.classId === c.classId).flatMap(r => RT.tchs(r)))];
    return pageHeader('শিক্ষক মূল্যায়ন', '') + Guardian.switcher()
      + `<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">${tids.filter(tid => DB.teacher(tid) && DB.user(DB.teacher(tid).userId)).map(tid => { const t = DB.teacher(tid), u = DB.user(t.userId), mine = DB.s.feedback.filter(f => f.teacherId === tid && f.by === App.session.userId && f.studentId === c.id).pop(); return `<div class="card p-4"><div class="flex items-center gap-3">${avatar(u, 44)}<div><div class="font-semibold">${esc(pn(u))}</div><div class="text-xs text-slate-500">${[...new Set(DB.s.routine.filter(r => r.classId === c.classId && RT.hasT(r, tid)).flatMap(r => RT.subs(r)).map(s => DB.subject(s)?.name).filter(Boolean))].join(', ')}</div></div></div><div class="mt-3 flex items-center justify-between">${mine ? `<span class="text-amber-500">${'★'.repeat(mine.rating)}<span class="text-slate-300">${'★'.repeat(5 - mine.rating)}</span></span><span class="text-xs text-slate-400">${U.fmtDate(mine.date)}</span>` : '<span class="text-xs text-slate-400">এখনো রেটিং দেওয়া হয়নি</span>'}<button class="btn btn-ghost btn-sm" onclick="HR.rate('${tid}','${c.id}')">${mine ? 'আপডেট করুন' : 'রেটিং দিন'}</button></div></div>`; }).join('') || `<div class="sm:col-span-2 lg:col-span-3">${emptyState('আপনার সন্তানের শ্রেণির রুটিনে এখনো কোনো শিক্ষক নেই।', 'star')}</div>`}</div>`;
  },
}, 'conduct');
