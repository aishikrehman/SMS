/* ==========================================================================
   E. STUDENT PORTAL  (+ shared "learner" widgets reused by the Guardian portal)
   ========================================================================== */

const Learner = {
  summary(st) {
    const att = DB.attendanceStats(st.id), ex = DB.latestExam() || { name: 'কোনো ফল প্রকাশিত হয়নি' }, res = ex.id ? DB.result(st.id, ex.id) : { gpa: null }, rank = ex.id ? DB.sectionRank(st.id, ex.id) : { rank: '—', of: '—' }, dues = DB.dues(st.id);
    return `<div class="grid grid-cols-2 xl:grid-cols-4 gap-3">${kpi('ক্রমযোজিত জিপিএ', gpaFmt(DB.cgpa(st.id)), `শিক্ষাবর্ষ ${U.bn(DB.session())} ভারযুক্ত ${gpaFmt(DB.sessionGpa(st.id))} · বিগত টার্ম ${gpaFmt(res.gpa)}`, 'award', 'blue')}${kpi('উপস্থিতি', bnNum(att.pct.toFixed(1)) + '%', `${bnNum(att.P)} দিন উপস্থিত · ${bnNum(att.A)} দিন অনুপস্থিত · ${bnNum(att.L)} দিন বিলম্ব`, 'calendar-check', att.pct < DB.s.school.minAttendance ? 'red' : 'green')}${kpi('শাখায় অবস্থান', `${bnNum(rank.rank)}<span class="text-base text-slate-400">/${bnNum(rank.of)}</span>`, esc(ex.name), 'trophy', 'violet')}${kpi('ফি-এর অবস্থা', dues ? U.money(dues) : 'পরিশোধিত', dues ? 'বকেয়া' : 'কোনো বকেয়া নেই', 'wallet', dues ? 'red' : 'green')}</div>`;
  },
  timetable(st, dateObj) {
    const cp = DB.campusOf(st.classId);
    let d = dateObj || new Date();
    // a supplementary class can fall on a holiday / off day: such a day counts too
    const has = x => RT.ofClass(st.classId, st.section, x).length > 0, open = x => (U.isSchoolDay(x, null, cp) && !RT.isOff(st.classId, U.dayName(x))) || has(x);
    const today = open(d); for (let i = 0; i < 30 && !open(d); i++) d = U.addDays(d, 1);
    const rows = RT.ofClass(st.classId, st.section, d);
    const now = new Date(), hm = `${U.pad(now.getHours())}:${U.pad(now.getMinutes())}`;
    const hol = !today && DB.holiday(new Date(), cp);
    return `<div class="card"><div class="px-5 py-3 border-b border-slate-100 font-semibold">${today ? 'আজকের সময়সূচি' : `${U.dayBn(d)} ${U.fmtDate(U.iso(d))}-এর সময়সূচি`} · ${DB.cls(st.classId)?.name || ''}${st.section ? '-' + st.section : ''}${hol ? ` <span class="ml-1">${badge('আজ: ' + hol.name, 'violet')}</span>` : ''}</div><div class="divide-y divide-slate-100">
      ${rows.map(r => { const p = RT.range(r), live = today && p.start && hm >= p.start && hm <= p.end; return `<div class="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 ${live ? 'bg-brand-50' : ''}"><div class="w-32"><div class="font-mono text-slate-600">${p.start ? `${U.bn(p.start)}–${U.bn(p.end)}` : ''}</div><div class="text-slate-500">${RT.periodText(r)}</div></div><div class="w-1.5 h-9 rounded-full" style="background:${U.color(RT.subs(r)[0] || '')}"></div><div class="flex-1 min-w-0"><div class="font-semibold">${esc(RT.subName(r))} ${live ? badge('চলমান', 'blue') : ''}${r.supp ? ' ' + badge('সাপ্লিমেন্টারি', 'violet') : ''}${r._ov?.length ? ' ' + badge(RT.ovNote(r), 'amber') : ''}</div><div class="text-slate-500">${esc(RT.tchName(r))}</div></div>${r.room ? `<div class="text-slate-600">${icon('map-pin', 'w-4 h-4 inline')} ${esc(U.bn(r.room))}</div>` : ''}</div>`; }).join('') || emptyState('কোনো ক্লাস নেই।')}
      </div></div>`;
  },
  calendar(st, monthKey) {
    const rec = DB.s.attendance[st.id] || {};
    const months = [...new Set(Object.keys(rec).map(d => d.slice(0, 7)))].sort();
    const mk = monthKey || months[months.length - 1] || U.monthKey(new Date());
    const [y, m] = mk.split('-').map(Number), first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate();
    const tone = { P: 'bg-emerald-100 text-emerald-700', A: 'bg-red-500 text-white', L: 'bg-amber-200 text-amber-800', E: 'bg-violet-200 text-violet-800' };
    let cells = ''; for (let i = 0; i < first.getDay(); i++) cells += '<div></div>';
    const cp = DB.campusOf(st.classId);
    for (let d = 1; d <= days; d++) {
      const k = `${mk}-${U.pad(d)}`, v = rec[k], dt = new Date(y, m - 1, d), hol = DB.holiday(dt, cp), wk = DB.s.calendar.weekends.includes(dt.getDay());
      const cls = v ? tone[v] : hol && hol.type !== 'Exam' ? 'bg-pink-100 text-pink-700' : hol ? 'bg-sky-100 text-sky-700' : wk ? 'bg-slate-50 text-slate-300' : 'text-slate-400';
      cells += `<div class="cal-cell ${cls}" title="${U.fmtDate(k)}${v ? ' · ' + bn({ P: 'Present', A: 'Absent', L: 'Late', E: 'Excused' }[v]) : ''}${hol ? ' · ' + esc(hol.name) : wk ? ' · সাপ্তাহিক ছুটি' : ''}">${bnNum(d)}</div>`;
    }
    const idx = months.indexOf(mk);
    return `<div class="card p-5"><div class="flex items-center justify-between mb-3"><button class="btn btn-ghost btn-sm" ${idx > 0 ? '' : 'disabled'} onclick="App.ui.calMonth='${months[idx - 1] || ''}';App.refresh()">${icon('chevron-left')}</button><div class="font-semibold">${U.monthName(mk)}</div><button class="btn btn-ghost btn-sm" ${idx < months.length - 1 ? '' : 'disabled'} onclick="App.ui.calMonth='${months[idx + 1] || ''}';App.refresh()">${icon('chevron-right')}</button></div>
      <div class="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 mb-1">${['র', 'সো', 'ম', 'বু', 'বৃ', 'শু', 'শ'].map(x => `<div>${x}</div>`).join('')}</div><div class="grid grid-cols-7 gap-1">${cells}</div>
      <div class="flex flex-wrap gap-2 mt-3 text-xs">${badge('উপস্থিত', 'green')}${badge('অনুপস্থিত', 'red')}${badge('বিলম্ব', 'amber')}${badge('অনুমোদিত ছুটি', 'violet')}<span class="badge bg-pink-100 text-pink-700">ছুটির দিন</span><span class="badge bg-sky-100 text-sky-700">পরীক্ষা</span></div></div>`;
  },
  /** Session-by-session transcript with weighted session GPA and per-exam detail. */
  transcript(st) {
    const sessions = [...new Set(DB.s.exams.filter(e => e.published).map(e => e.session))].sort().reverse();
    return `<div class="card p-4 mb-4 flex flex-wrap gap-4 items-center"><div><div class="label">ক্রমযোজিত জিপিএ</div><div class="text-2xl font-extrabold">${gpaFmt(DB.cgpa(st.id))}</div></div>${sessions.map(ss => `<div class="border-l border-slate-200 pl-4"><div class="label">শিক্ষাবর্ষ ${U.bn(ss)} (ভারযুক্ত)</div><div class="text-xl font-bold">${gpaFmt(DB.sessionGpa(st.id, ss))}</div></div>`).join('')}</div>`
      + sessions.map(ss => `<div class="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">শিক্ষাবর্ষ ${U.bn(ss)}</div>` + DB.examsOf(ss).filter(e => e.published).reverse().map(ex => {
        const r = DB.result(st.id, ex.id);
        return `<div class="card mb-4"><div class="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2"><div class="font-semibold flex-1">${esc(ex.name)} <span class="ml-1">${badge(bn(ex.type), ex.type === 'Term' ? 'blue' : 'slate')} ${badge(`ভার ${bnNum(ex.weight)}%`, 'violet')}</span></div><span class="text-sm">জিপিএ <b>${gpaFmt(r.gpa)}</b> · ${r.letter}</span><button class="btn btn-ghost btn-sm" onclick="Print.show('marksheet','${st.id}','${ex.id}')">${icon('download')} নম্বরপত্র</button></div>
          <div class="scroll-x"><table class="table"><thead><tr><th>বিষয়</th><th>অংশভিত্তিক নম্বর</th><th>মোট</th><th>গ্রেড</th><th>পয়েন্ট</th></tr></thead><tbody>${r.rows.map(x => `<tr><td>${x.subject.name}</td><td>${x.absent ? 'অনুপস্থিত' : (x.parts || []).map(p => `${esc(p.label)} ${bnNum(p.v)}/${bnNum(p.max)}`).join(' · ')}</td><td class="font-semibold">${bnNum(x.total)}</td><td>${x.letter === 'F' ? badge('F', 'red') : x.letter}</td><td>${gpaFmt(x.point)}</td></tr>`).join('')}</tbody></table></div></div>`;
      }).join('')).join('');
  },
  incidents(st) {
    const list = DB.s.incidents.filter(i => i.studentId === st.id).sort((a, b) => b.date.localeCompare(a.date));
    return `<div class="card divide-y divide-slate-100">${list.map(i => `<div class="px-5 py-4 flex gap-4"><div class="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center ${i.type === 'Commendation' ? 'bg-emerald-100 text-emerald-600' : i.type === 'Disciplinary' ? 'bg-red-100 text-red-600' : 'bg-violet-100 text-violet-600'}">${icon(i.type === 'Commendation' ? 'award' : i.type === 'Disciplinary' ? 'alert-triangle' : 'heart-handshake', 'w-5 h-5')}</div>
      <div class="flex-1"><div class="flex flex-wrap items-center gap-2">${statusBadge(i.type === 'Counselor' ? 'Counselor' : i.type)}<span class="text-xs text-slate-400">${U.fmtDate(i.date)} · ${esc(pn(DB.user(i.by)))}</span></div><p class="text-sm mt-1">${esc(i.note)}</p></div></div>`).join('') || emptyState('কোনো আচরণগত অভিযোগ নেই — এভাবেই এগিয়ে চলো!', 'smile')}</div>`;
  },
  idCard(st) {
    const c = DB.cls(st.classId), s = DB.s.school;
    return `<div class="id-phone mx-auto bg-white"><div class="hero-bg text-white p-5 pb-14 text-center"><div class="text-xs uppercase tracking-widest opacity-80">শিক্ষার্থী পরিচয়পত্র</div><div class="font-bold mt-1">${esc(s.nameBn || s.name)}</div>${s.eiin ? `<div class="text-[11px] opacity-80">ইআইআইএন ${esc(U.bn(s.eiin))}</div>` : ''}</div>
      <div class="-mt-11 flex justify-center"><div class="rounded-2xl border-4 border-white shadow-lg overflow-hidden">${avatar(st, 92).replace('border-radius:999px', '')}</div></div>
      <div class="text-center px-5 pt-3"><div class="text-xl font-extrabold">${esc(pn(st))}</div><div class="text-sm text-slate-500">${c.name} · শাখা ${st.section} · রোল ${bnNum(st.roll)}</div></div>
      <div class="grid grid-cols-2 gap-3 px-5 py-4 text-sm"><div><div class="text-[10px] uppercase font-bold text-slate-400">শিক্ষার্থী আইডি</div><div class="font-mono font-semibold">${st.id}</div></div><div><div class="text-[10px] uppercase font-bold text-slate-400">রক্তের গ্রুপ</div><div class="font-bold text-red-600">${st.blood}</div></div><div><div class="text-[10px] uppercase font-bold text-slate-400">নিবন্ধন নম্বর</div><div class="font-mono">${st.regNo}</div></div><div><div class="text-[10px] uppercase font-bold text-slate-400">জরুরি যোগাযোগ</div><div>${esc(U.bn(st.emergency))}</div></div></div>
      <div class="flex flex-col items-center pb-5">${qr(`DHEE|${s.eiin}|${st.id}|${st.regNo}`, 150)}<div class="text-[10px] text-slate-400 mt-2">ডিসেম্বর ${bnNum(new Date().getFullYear())} পর্যন্ত বৈধ · প্রবেশদ্বারে প্রদর্শন করুন</div></div></div>`;
  },
};

const Student = {
  me() { return DB.studentByUser(App.session.userId); },
  async submit(hwId, file) {
    try {
      if (!file) return;
      if (file.size > 12e6) throw new Error('ফাইলটি অত্যধিক বড় (সংকোচনের আগে সর্বোচ্চ ১২ এমবি)।');
      const dataUrl = await readUpload(file);
      const st = this.me();
      let sub = DB.s.submissions.find(s => s.homeworkId === hwId && s.studentId === st.id);
      if (sub && sub.status === 'Graded') throw new Error('ইতোমধ্যে মূল্যায়িত — পুনরায় খোলার জন্য শিক্ষকের কাছে অনুরোধ করো।');
      if (!sub) DB.s.submissions.push(sub = { id: DB.id('SUB'), homeworkId: hwId, studentId: st.id });
      Object.assign(sub, { fileName: file.name, fileType: file.type === 'application/pdf' ? 'application/pdf' : 'image/jpeg', dataUrl, submittedAt: new Date().toISOString(), status: 'Submitted', grade: null, feedback: '', annotatedUrl: null });
      DB.audit('HOMEWORK_SUBMIT', 'submissions', `${st.name} → ${hwId} (${file.name})`);
      { const hw = DB.s.homework.find(h => h.id === hwId); DB.guardiansOf(st.id).forEach(g => DB.sms(g.phone, `${DB.s.school.shortName}: ${pn(st)} বাড়ির কাজ "${hw.title}" জমা দিয়েছে।`, 'Push')); }
      if (!DB.save()) { DB.s.submissions = DB.s.submissions.filter(s => s !== sub); DB.save(); throw new Error('সংরক্ষণস্থান পূর্ণ — ছোট আকারের ছবি দিয়ে চেষ্টা করুন।'); }
      toast('বাড়ির কাজ জমা দেওয়া হয়েছে!', 'success'); App.refresh();
    } catch (e) { toast(e.message, 'error'); }
  },
  viewFeedback(subId) {
    const s = DB.s.submissions.find(x => x.id === subId), hw = DB.s.homework.find(h => h.id === s.homeworkId);
    Modal.open({ title: `মূল্যায়ন মন্তব্য · ${esc(hw.title)}`, size: 'lg', body: `<div class="flex flex-wrap gap-2 mb-3">${badge('গ্রেড ' + s.grade, 'green')}<span class="text-sm text-slate-600">${esc(s.feedback || '')}</span></div>${s.annotatedUrl ? `<img src="${s.annotatedUrl}" class="w-full rounded-xl border">` : '<p class="text-sm text-slate-500">কোনো চিহ্নিত ছবি নেই।</p>'}` });
  },
};

App.register('student', {
  title: 'শিক্ষার্থী পোর্টাল',
  pages: [
    {
      id: 'dashboard', label: 'ড্যাশবোর্ড', icon: 'layout-dashboard',
      render() {
        const st = Student.me(); if (!st) return emptyState('এই অ্যাকাউন্টের সঙ্গে কোনো শিক্ষার্থীর তথ্য সংযুক্ত নেই।');
        const hw = DB.s.homework.filter(h => h.classId === st.classId && h.due >= U.today()).sort((a, b) => a.due.localeCompare(b.due));
        return pageHeader(`শুভেচ্ছা, ${esc(st.nameBn ? pn(st) : st.name.split(' ')[0])}`, `${DB.cls(st.classId)?.name || ''}${st.section ? '-' + st.section : ''} · রোল ${bnNum(st.roll)} · ${st.id}`)
          + Learner.summary(st) + `<div class="grid lg:grid-cols-3 gap-5 mt-5"><div class="lg:col-span-2">${Learner.timetable(st)}</div>
            <div class="card"><div class="px-5 py-3 border-b border-slate-100 font-semibold flex justify-between">আসন্ন বাড়ির কাজ <a href="${App.href('student', 'homework')}" class="text-sm text-brand-600">সকল</a></div><div class="divide-y divide-slate-100">${hw.slice(0, 5).map(h => { const sub = DB.s.submissions.find(s => s.homeworkId === h.id && s.studentId === st.id); return `<div class="px-5 py-3 text-sm"><div class="font-semibold">${esc(h.title)}</div><div class="text-xs text-slate-500 flex justify-between mt-0.5"><span>${esc(DB.subject(h.subjectId)?.name || '')} · জমার শেষ তারিখ ${U.fmtDate(h.due)}</span>${sub ? statusBadge(sub.status) : badge('করণীয়', 'amber')}</div></div>`; }).join('') || emptyState('কোনো কাজ বাকি নেই।')}</div></div></div>`;
      },
    },
    { id: 'timetable', label: 'আজকের সময়সূচি', icon: 'clock', render() { const st = Student.me(); if (!st) return emptyState('এই অ্যাকাউন্টের সঙ্গে কোনো শিক্ষার্থীর তথ্য সংযুক্ত নেই।'); return pageHeader('শ্রেণির সময়সূচি', '') + Learner.timetable(st) + `<div class="card scroll-x mt-5 p-2">${RT.grid(st.classId) || emptyState('কোনো ক্লাস নেই।')}</div>` + RT.datedList(st.classId); } },
    {
      id: 'homework', label: 'বাড়ির কাজ ডেস্ক', icon: 'upload-cloud',   // rendered by js/modules/staffgate.js (marks / grade per policy)
      mount() {
        $$('.dropzone').forEach(z => {
          const hw = z.dataset.hw;
          z.querySelector('input').addEventListener('change', e => Student.submit(hw, e.target.files[0]));
          ['dragenter', 'dragover'].forEach(ev => z.addEventListener(ev, e => { e.preventDefault(); z.classList.add('drag'); }));
          ['dragleave', 'drop'].forEach(ev => z.addEventListener(ev, e => { e.preventDefault(); z.classList.remove('drag'); }));
          z.addEventListener('drop', e => Student.submit(hw, e.dataTransfer.files[0]));
        });
      },
    },
    { id: 'idcard', label: 'ডিজিটাল পরিচয়পত্র', icon: 'id-card', render() { const st = Student.me(); if (!st) return emptyState('এই অ্যাকাউন্টের সঙ্গে কোনো শিক্ষার্থীর তথ্য সংযুক্ত নেই।'); return pageHeader('ডিজিটাল পরিচয়পত্র', '') + Learner.idCard(st); } },
    { id: 'attendance', label: 'উপস্থিতি ও একাডেমিক প্রতিলিপি', icon: 'calendar-days', render() { const st = Student.me(); if (!st) return emptyState('এই অ্যাকাউন্টের সঙ্গে কোনো শিক্ষার্থীর তথ্য সংযুক্ত নেই।'); return pageHeader('উপস্থিতি ক্যালেন্ডার ও একাডেমিক প্রতিলিপি', '') + `<div class="grid lg:grid-cols-3 gap-5"><div>${Learner.calendar(st, App.ui.calMonth)}</div><div class="lg:col-span-2">${Learner.transcript(st)}</div></div>`; } },
  ],
});
