/* ==========================================================================
   ADVANCED FACULTY & PROXY MANAGEMENT
   Teacher lifecycle (status, allocations, evaluations), emergency proxy
   assignment, and payroll with installment + multi-channel payouts.
   ========================================================================== */

const EVAL_CRITERIA = [['pedagogy', 'শিক্ষণপদ্ধতি ও পাঠ উপস্থাপন'], ['punctuality', 'সময়ানুবর্তিতা ও উপস্থিতি'], ['classroom', 'শ্রেণিকক্ষ ব্যবস্থাপনা'], ['results', 'শিক্ষার্থীদের ফলাফল'], ['collaboration', 'সহযোগিতা ও দায়িত্ব পালন']];
const PAYOUT_METHODS = ['Bank', 'Cash', 'bKash', 'Nagad', 'Rocket'];
/** Display name of an employee row from DB.emp() (Bangla name when the record has one). */
const facEmpName = e => !e ? '' : e.kind === 'Teacher' ? pn(DB.user(e.userId)) || e.name : pn(e);
const FAC_STATUS_TONE = { Probation: 'amber', Confirmed: 'green', Resigned: 'red', 'On leave': 'violet' };

const Faculty = {
  tid: null, tab: 'overview',
  periodsPerWeek(tid) { return U.sum(DB.s.routine.filter(r => !r.date && RT.hasT(r, tid)), r => RT.span(r)); },
  avgEval(tid) { const ev = DB.s.evaluations.filter(e => e.teacherId === tid); if (!ev.length) return null; const last = ev[ev.length - 1]; return U.sum(EVAL_CRITERIA, ([k]) => last.scores[k]) / EVAL_CRITERIA.length; },
  stars(v) { return v === null ? '—' : `<span class="text-amber-500">${'★'.repeat(Math.round(v))}<span class="text-slate-300">${'★'.repeat(5 - Math.round(v))}</span></span> <span class="text-xs text-slate-500">${bnNum(v.toFixed(1))}</span>`; },

  /* ---------- teacher profile ---------- */
  /** The teacher's own page (its own URL, so it can be shared): /<portal>/teacher-profile?id=T…&tab=… — see js/modules/teacherpage.js. */
  url(tid, tab) { const p = App.portals[App.route.portal]?.pages.some(x => x.id === 'teacher-profile') ? App.route.portal : 'principal'; return `${App.href(p, 'teacher-profile')}?${new URLSearchParams({ id: tid, ...(tab && tab !== 'overview' ? { tab } : {}) })}`; },
  profile(tid, tab = 'overview') { App.nav(this.url(tid, tab)); },
  TABS: [['overview', 'সারসংক্ষেপ ও বরাদ্দ', 'layout-grid'], ['assign', 'বিষয় ও শ্রেণি', 'grid-3x3'], ['evals', 'মূল্যায়ন', 'star'], ['attendance', 'উপস্থিতি, ছুটি ও প্রক্সি', 'calendar-x'], ['pay', 'বেতন ও পরিশোধ', 'banknote']],
  go(tab) {
    this.tab = tab; this.render();
    // keep the tab in the address, without a new history entry
    const q = new URLSearchParams(location.search); if (tab === 'overview') q.delete('tab'); else q.set('tab', tab); App.replaceUrl(`${location.pathname}?${q}`);
  },
  render() {
    const t = DB.teacher(this.tid), host = $('#fac'); if (!host || !t) return;
    const u = DB.user(t.userId) || { name: t.id };
    // RBAC: evaluations and attendance need hr view; pay needs the payroll permission (accounts or hr edit)
    const tabs = this.TABS.filter(([k]) => k !== 'pay' || App.perm('hr', 'edit') || App.can('payroll.run'));
    if (!tabs.some(([k]) => k === this.tab)) this.tab = 'overview';
    const tabsHtml = pills(tabs, this.tab, id => `Faculty.go('${id}')`);
    host.innerHTML = `<div class="flex flex-wrap items-center gap-4 mb-4">${avatar(u, 56)}<div class="flex-1"><div class="font-bold text-lg">${esc(pn(u))}</div><div class="text-sm text-slate-500">${esc(bn(t.designation))} · ${esc(bn(t.dept))}${multiCampus() ? ` · ${esc(DB.campus(t.campusId)?.name || '')}` : ''} · যোগদান ${U.fmtDate(t.joinDate)}</div></div><div class="flex flex-wrap gap-2">${badge(bn(t.status || 'Confirmed'), FAC_STATUS_TONE[t.status] || 'slate')}${badge(`সপ্তাহে ${bnNum(this.periodsPerWeek(t.id))}টি পিরিয়ড`, 'blue')}<a class="btn btn-ghost btn-sm" href="${App.href('public', 'teacher')}?id=${encodeURIComponent(t.id)}" target="_blank" rel="noopener">${icon('globe')} পাবলিক প্রোফাইল</a></div></div>
      ${tabsHtml}<div class="fade-in">${this[this.tab](t, u)}</div>`;
    App.icons();
    if (this.tab === 'evals') this.bindEval(t);
    if (this.tab === 'overview') this.bindOverview(t);
    if (this.tab === 'assign') this.bindAssign();
  },
  /* ---------- teaching assignments: class × subject grid ---------- */
  assign(t) {
    const classes = DB.classesIn(t.campusId), subs = DB.s.subjects.filter(s => s.active !== false);
    const draft = this.asgDraft && this.asgDraft.tid === t.id ? this.asgDraft : (this.asgDraft = { tid: t.id, set: new Set(Teacher.pairs(t).map(a => a.classId + '|' + a.subjectId)) });
    const rt = new Set(DB.s.routine.filter(r => RT.hasT(r, t.id)).flatMap(r => RT.subs(r).map(s => r.classId + '|' + s)));
    const taught = c => new Set(DB.classSubjects(c.id).map(s => s.id));
    return `<div class="card p-4 mb-4 space-y-2"><div class="font-semibold">পাঠদানের বরাদ্দ — কোন শ্রেণিতে কোন বিষয়</div>
        ${t.assignments?.length ? '' : `<p>${badge('এখনো সংরক্ষিত নয় — রুটিন থেকে দেখানো হচ্ছে', 'amber')}</p>`}
        <div class="flex flex-wrap gap-2">${badge(`${bnNum(draft.set.size)}টি বরাদ্দ`, 'blue')}<span class="text-slate-500">★ = রুটিনে এই শ্রেণি-বিষয়ের পিরিয়ড আছে</span></div></div>
      <div class="card scroll-x"><table class="table" id="fac-asg"><thead><tr><th>শ্রেণি</th>${subs.map(s => `<th class="text-center whitespace-nowrap">${esc(s.name)}</th>`).join('')}</tr></thead><tbody>
        ${classes.map(c => { const ok = taught(c); return `<tr><td class="font-semibold whitespace-nowrap">${esc(c.name)}</td>${subs.map(s => { const k = c.id + '|' + s.id, on = draft.set.has(k); return `<td class="text-center">${ok.has(s.id) || on ? `<label class="inline-flex items-center gap-1 cursor-pointer p-1"><input type="checkbox" class="w-5 h-5 accent-[var(--brand)]" data-k="${k}" ${on ? 'checked' : ''} aria-label="${esc(c.name)} — ${esc(s.name)}">${rt.has(k) ? '<span class="text-amber-500">★</span>' : ''}</label>` : '<span class="text-slate-300">—</span>'}</td>`; }).join('')}</tr>`; }).join('')}</tbody></table></div>
      <div class="flex flex-wrap gap-2 mt-4"><button class="btn btn-primary" onclick="Faculty.saveAssign()">${icon('save')} বরাদ্দ সংরক্ষণ করুন</button><button class="btn btn-ghost" onclick="Faculty.asgFromRoutine()">${icon('calendar-range')} রুটিন থেকে পূরণ করুন</button><button class="btn btn-ghost" onclick="Faculty.asgDraft.set.clear();Faculty.render()">${icon('eraser')} সব টিক মুছুন</button></div>`;
  },
  bindAssign() { $$('#fac-asg [data-k]').forEach(i => i.addEventListener('change', () => { const s = this.asgDraft.set; i.checked ? s.add(i.dataset.k) : s.delete(i.dataset.k); })); },
  asgFromRoutine() { const t = DB.teacher(this.tid); this.asgDraft = { tid: t.id, set: new Set(DB.s.routine.filter(r => RT.hasT(r, t.id)).flatMap(r => RT.subs(r).map(s => r.classId + '|' + s))) }; this.render(); },
  saveAssign() {
    const t = DB.teacher(this.tid), list = [...this.asgDraft.set].map(k => { const [classId, subjectId] = k.split('|'); return { classId, subjectId }; }).filter(a => DB.cls(a.classId) && DB.subject(a.subjectId));
    if (!list.length && !confirm('কোনো বরাদ্দ টিক দেওয়া নেই। সংরক্ষণ করলে শিক্ষকের বিষয় তালিকা রুটিন থেকে নেওয়া হবে। চালিয়ে যাবেন?')) return;
    t.assignments = list;
    if (list.length) t.subjects = [...new Set(list.map(a => a.subjectId))];
    DB.audit('TEACHER_ASSIGNMENTS', 'teachers', `${DB.teacherName(t.id)}: ${list.map(a => `${a.classId}/${a.subjectId}`).join(', ') || 'রুটিন অনুযায়ী'}`); DB.save();
    toast('পাঠদানের বরাদ্দ সংরক্ষিত হয়েছে।', 'success'); this.asgDraft = null; this.render();
  },
  overview(t, u = DB.user(t.userId) || {}) {
    const alloc = {}; DB.s.routine.filter(r => !r.date && RT.hasT(r, t.id)).forEach(r => { const k = `${r.classId}|${RT.subs(r).join('+')}`; alloc[k] = (alloc[k] || 0) + RT.span(r); });
    return `<div class="grid lg:grid-cols-2 gap-5"><div class="card scroll-x"><div class="px-4 py-3 border-b border-slate-100 font-semibold">শ্রেণি বরাদ্দ (চলমান রুটিন)</div><table class="table"><thead><tr><th>শ্রেণি</th><th>বিষয়</th><th class="text-right">পিরিয়ড / সপ্তাহ</th></tr></thead><tbody>${Object.entries(alloc).map(([k, n]) => { const [c, s] = k.split('|'); return `<tr><td>${esc(DB.className(c))}</td><td>${esc(s.split('+').map(x => DB.subject(x)?.name || x).join(' / '))}</td><td class="text-right font-semibold">${bnNum(n)}</td></tr>`; }).join('') || '<tr><td colspan="3" class="text-slate-400">কোনো পিরিয়ড বরাদ্দ নেই।</td></tr>'}</tbody></table><div class="px-4 py-3 border-t border-slate-100"><div class="label">পাঠদানের বরাদ্দ (বিষয় ও শ্রেণি)</div><div>${esc(Teacher.assignSummary(t)) || '—'}</div><button class="btn btn-ghost btn-sm mt-2" onclick="Faculty.go('assign')">${icon('grid-3x3')} বরাদ্দ সম্পাদনা করুন</button></div></div>
      <form id="fac-ov" class="card p-4 grid sm:grid-cols-2 gap-3 self-start"><div class="sm:col-span-2 text-xs font-bold uppercase text-slate-500">চাকরির অবস্থা ও বেতন প্রদানের সেটিংস</div>
        <div><label class="label">চাকরির অবস্থা</label><select class="select" name="status">${['Probation', 'Confirmed', 'On leave', 'Resigned'].map(s => `<option value="${s}" ${s === (t.status || 'Confirmed') ? 'selected' : ''}>${bn(s)}</option>`).join('')}</select></div>
        <div><label class="label">পদবি</label><input class="input" name="designation" value="${esc(t.designation)}"></div>
        <div><label class="label">বেতন প্রদানের মাধ্যম</label><select class="select" name="payoutMethod">${PAYOUT_METHODS.map(m => `<option value="${m}" ${m === t.payoutMethod ? 'selected' : ''}>${bn(m)}</option>`).join('')}</select></div>
        <div><label class="label">হিসাব / ওয়ালেট নম্বর</label><input class="input font-mono" name="payoutAccount" value="${esc(t.payoutAccount || '')}"></div>
        <div class="sm:col-span-2 text-xs font-bold uppercase text-slate-500 pt-2">পরিচিতি (পাবলিক)</div>
        <div><label class="label">শিক্ষাগত যোগ্যতা</label><input class="input" name="qualification" maxlength="160" value="${esc(t.qualification || '')}"></div>
        <div><label class="label">পূর্ব অভিজ্ঞতা (বছর)</label><input class="input" type="number" min="0" max="60" name="experienceYears" value="${esc(t.experienceYears ?? '')}"></div>
        <div class="sm:col-span-2"><label class="label">সংক্ষিপ্ত পরিচিতি</label><textarea class="textarea" name="bio" rows="3" maxlength="600">${esc(t.bio || '')}</textarea></div>
        <div class="sm:col-span-2"><button class="btn btn-primary" ${App.perm('hr', 'edit') ? '' : 'disabled'}>${icon('save')} সংরক্ষণ করুন</button></div></form></div>
      ${this.contactCard(t, u)}`;
  },
  /** Staff view: contact and identity details (the public page shows contact only when the teacher allows it). */
  contactCard(t, u) {
    const yrs = TeacherPage.years(t);
    return `<div class="card p-4 mt-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">${[['মোবাইল', esc(U.bn(u.phone || '—'))], ['ই-মেইল', esc(u.email || '—')], ['কর্মচারী আইডি', `<span class="font-mono">${esc(t.id)}</span>`], ['অভিজ্ঞতা', yrs ? `${bnNum(yrs)} বছর` : '—'], ['শিক্ষাগত যোগ্যতা', esc(t.qualification || '—')], ['পাবলিক তালিকায় যোগাযোগ', t.showContact !== false ? 'দেখানো হয়' : 'লুকানো'], ['বিভাগীয় প্রধান', t.isHead ? 'হ্যাঁ' : 'না'], ['ইউজার আইডি', `@${esc(u.username || '')}`]].map(([k, v]) => `<div><div class="text-slate-500">${k}</div><div class="font-semibold">${v}</div></div>`).join('')}${t.bio ? `<p class="sm:col-span-2 lg:col-span-4 text-slate-700">${esc(t.bio)}</p>` : ''}</div>`;
  },
  bindOverview(t) {
    $('#fac-ov').addEventListener('submit', e => {
      e.preventDefault(); const f = formData(e.target), prev = t.status;
      if (MFS.includes(f.payoutMethod) && !/^01[3-9][0-9]{8,9}$/.test(f.payoutAccount)) return toast('এমএফএস-এর মাধ্যমে পরিশোধের জন্য সঠিক ওয়ালেট নম্বর দিন।', 'error');
      if (!App.perm('hr', 'edit')) return toast('শিক্ষকের তথ্য পরিবর্তনের অনুমতি নেই।', 'error');
      f.experienceYears = f.experienceYears === '' ? null : U.clamp(+f.experienceYears || 0, 0, 60);
      Object.assign(t, f);
      DB.audit('TEACHER_LIFECYCLE', 'teachers', `${DB.teacherName(t.id)}: অবস্থা ${bn(prev)}→${bn(f.status)}, বেতন প্রদানের মাধ্যম ${bn(f.payoutMethod)}`); DB.save();
      toast('শিক্ষকের তথ্য আপডেট করা হয়েছে।', 'success'); this.render(); App.refresh();
    });
  },
  evals(t) {
    const ev = DB.s.evaluations.filter(e => e.teacherId === t.id).reverse();
    return `<div class="grid lg:grid-cols-2 gap-5"><form id="fac-ev" class="card p-4 space-y-3 self-start"><div class="text-xs font-bold uppercase text-slate-500">নতুন মূল্যায়ন</div><div><label class="label">টার্ম</label><input class="input" name="term" value="প্রাক-নির্বাচনী পরীক্ষা ${U.bn(DB.session())}" required></div>
        ${EVAL_CRITERIA.map(([k, l]) => `<div class="flex items-center gap-3"><label class="text-sm flex-1">${l}</label><select class="select !w-24" name="${k}">${[5, 4, 3, 2, 1].map(n => `<option value="${n}" ${n === 4 ? 'selected' : ''}>${bnNum(n)} ★</option>`).join('')}</select></div>`).join('')}
        <div><label class="label">মন্তব্য</label><textarea class="textarea" name="remarks" rows="2"></textarea></div><button class="btn btn-primary w-full">${icon('star')} মূল্যায়ন লিপিবদ্ধ করুন</button></form>
      <div class="space-y-3">${ev.map(e => { const avg = U.sum(EVAL_CRITERIA, ([k]) => e.scores[k]) / EVAL_CRITERIA.length; return `<div class="card p-4"><div class="flex justify-between"><b>${esc(U.bn(e.term))}</b>${this.stars(avg)}</div><div class="text-xs text-slate-400">${U.fmtDate(e.date)} · মূল্যায়নকারী: ${esc(pn(DB.user(e.by)) || '—')}</div><div class="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">${EVAL_CRITERIA.map(([k, l]) => `<div class="flex justify-between"><span class="text-slate-500">${l}</span><b>${bnNum(e.scores[k])}</b></div>`).join('')}</div>${e.remarks ? `<p class="text-sm mt-2 text-slate-600">${esc(e.remarks)}</p>` : ''}</div>`; }).join('') || emptyState('এখনো কোনো মূল্যায়ন নেই।', 'star')}</div></div>`;
  },
  bindEval(t) {
    $('#fac-ev').addEventListener('submit', e => {
      e.preventDefault(); const f = formData(e.target);
      DB.s.evaluations.push({ id: DB.id('EV'), teacherId: t.id, term: f.term, date: U.today(), by: App.session.userId, scores: Object.fromEntries(EVAL_CRITERIA.map(([k]) => [k, +f[k]])), remarks: f.remarks });
      DB.audit('TEACHER_EVALUATION', 'evaluations', `${DB.teacherName(t.id)} — ${f.term}`); DB.save(); toast('মূল্যায়ন লিপিবদ্ধ হয়েছে।', 'success'); this.render();
    });
  },
  attendance(t) {
    const abs = Object.entries(DB.s.teacherAbsences[t.id] || {}).sort().reverse(), lv = DB.s.leaves.filter(l => l.teacherId === t.id);
    const covered = DB.s.proxies.filter(p => p.proxyTeacherId === t.id), needed = DB.s.proxies.filter(p => p.absentTeacherId === t.id);
    return `<div class="grid lg:grid-cols-3 gap-5"><div class="card scroll-x"><div class="px-4 py-3 border-b border-slate-100 font-semibold">মাসভিত্তিক অনুপস্থিতি</div><table class="table"><thead><tr><th>মাস</th><th>অনুমোদিত ছুটি</th><th>অননুমোদিত (বিনা বেতন)</th></tr></thead><tbody>${abs.map(([mk, a]) => `<tr><td>${U.monthName(mk)}</td><td>${bnNum(a.excused)}</td><td class="${a.unexcused ? 'text-red-600 font-semibold' : ''}">${bnNum(a.unexcused)}</td></tr>`).join('')}</tbody></table></div>
      <div class="card"><div class="px-4 py-3 border-b border-slate-100 font-semibold">ছুটির আবেদন</div><div class="divide-y divide-slate-100 text-sm">${lv.map(l => `<div class="px-4 py-2.5">${badge(bn(l.status), { Pending: 'amber', Approved: 'green', Rejected: 'red' }[l.status] || 'slate')} ${bn(l.type)} · ${U.fmtDate(l.from)}–${U.fmtDate(l.to)}<div class="text-xs text-slate-500">${esc(l.reason)}</div></div>`).join('') || emptyState('নেই')}</div></div>
      <div class="card"><div class="px-4 py-3 border-b border-slate-100 font-semibold">প্রক্সির বিবরণ</div><div class="p-4 text-sm space-y-2"><div>${badge(`${bnNum(covered.length)}টি পিরিয়ডে প্রক্সি দিয়েছেন`, 'green')} ${badge(`প্রক্সি প্রয়োজন হয়েছে ${bnNum(needed.length)}`, 'amber')}</div>${[...covered.map(p => ['covered', p]), ...needed.map(p => ['absent', p])].sort((a, b) => b[1].date.localeCompare(a[1].date)).slice(0, 10).map(([k, p]) => `<div class="text-xs">${U.fmtDate(p.date)} পিরিয়ড ${bnNum(p.period)} · ${esc(DB.className(p.classId))} — ${k === 'covered' ? `${esc(DB.teacherName(p.absentTeacherId))}-এর পরিবর্তে প্রক্সি` : `প্রক্সি দিয়েছেন ${esc(DB.teacherName(p.proxyTeacherId))}`}</div>`).join('')}</div></div></div>`;
  },
  pay(t) {
    const rows = DB.s.payroll.filter(p => p.empId === t.id).sort((a, b) => b.month.localeCompare(a.month));
    return `<div class="card scroll-x"><table class="table"><thead><tr><th>মাস</th><th class="text-right">মোট বেতন</th><th class="text-right">বিনা বেতন কর্তন</th><th class="text-right">ভবিষ্য তহবিল</th><th class="text-right">নিট</th><th>পরিশোধসমূহ</th><th>অবস্থা</th><th></th></tr></thead><tbody>${rows.map(p => `<tr><td>${U.monthName(p.month)}</td><td class="text-right">${U.money(p.gross)}</td><td class="text-right">${p.lop ? '−' + U.money(p.lop) : '—'}</td><td class="text-right">−${U.money(p.pf)}</td><td class="text-right font-bold">${U.money(p.net)}</td><td class="text-xs">${(p.payouts || []).map(x => `${bnNum(x.n)}/${bnNum(p.installments)}: ${U.money(x.amount)} ${bn(x.method)}`).join('<br>') || '—'}</td><td>${badge(bn(p.status), { disbursed: 'green', draft: 'amber', approved: 'blue' }[p.status] || 'slate')}</td><td><button class="btn btn-ghost btn-sm" onclick="Payroll.payslip('${t.id}','${p.month}')">${icon('file-text')}</button></td></tr>`).join('')}</tbody></table></div>`;
  },
};

/* ---------- Emergency proxy assignee ---------- */
const ProxyDesk = {
  /** Rank substitutes for one period: must be free (no class, no other proxy, not absent/on leave);
      same-subject specialists first, then whoever has the lightest proxy load this month and that day. */
  candidates(date, period, slot, absentIds) {
    const day = U.dayName(date), mk = date.slice(0, 7), campus = DB.campusOf(slot.classId);
    return DB.teachersIn(campus).filter(t => !absentIds.includes(t.id) && t.status !== 'Resigned' && t.status !== 'On leave'
      && !RT.busy(t.id, date, slot)
      && !DB.s.proxies.some(p => p.proxyTeacherId === t.id && p.date === date && RT.overlap({ ...p, day, span: p.span || 1 }, { ...slot, day }))
      && !DB.s.leaves.some(l => l.teacherId === t.id && l.status === 'Approved' && date >= l.from && date <= l.to))
      .map(t => {
        const ss = RT.subs(slot), sameSubj = Teacher.pairs(t).some(a => ss.includes(a.subjectId)) || (t.subjects || []).some(x => ss.includes(x)), monthLoad = DB.s.proxies.filter(p => p.proxyTeacherId === t.id && p.date.startsWith(mk)).length;
        const dayLoad = RT.ofTeacher(t.id, date).length + DB.s.proxies.filter(p => p.proxyTeacherId === t.id && p.date === date).length;
        return { t, sameSubj, monthLoad, dayLoad, score: (sameSubj ? 100 : 0) - monthLoad * 8 - dayLoad * 3 };
      }).sort((a, b) => b.score - a.score);
  },
  absentOn(date) {
    const campus = DB.campusId();
    const onLeave = DB.s.leaves.filter(l => l.status === 'Approved' && date >= l.from && date <= l.to).map(l => l.teacherId);
    return [...new Set([...onLeave, ...(App.ui.px?.manual || [])])].filter(id => DB.teacher(id)?.campusId === campus);
  },
  assign(date, period, classId, absentId, proxyId, reason) {
    const day = U.dayName(date), eff = RT.effective(classId, date, { noProxy: true }), slot = eff.find(r => +r.period === +period && RT.hasT(r, absentId)) || eff.find(r => +r.period === +period);
    if (!slot) return toast('রুটিনে এই পিরিয়ডটি পাওয়া যায়নি।', 'error');
    const t0 = RT.range(slot).start;
    DB.s.proxies.push({ id: DB.id('PX'), date, period, span: RT.span(slot), classId, subjectId: RT.subs(slot)[0] || '', subjectIds: RT.subs(slot), room: slot.room || '', absentTeacherId: absentId, proxyTeacherId: proxyId, reason: reason || 'আকস্মিক অনুপস্থিতি', by: App.session.userId, createdAt: new Date().toISOString() });
    const pu = DB.user(DB.teacher(proxyId).userId);
    DB.sms(pu.phone, `${DB.s.school.shortName} প্রক্সি: ${U.fmtDate(date)} ${RT.periodText(slot)}${t0 ? ` (${U.bn(t0)})` : ''} — ${RT.subName(slot)}, ${DB.className(classId)}${slot.room ? `, কক্ষ ${U.bn(slot.room)}` : ''}, ${DB.teacherName(absentId)}-এর পরিবর্তে।`);
    DB.audit('PROXY_ASSIGN', 'proxies', `${date} P${period} ${classId}: ${DB.teacherName(absentId)}-এর পরিবর্তে ${DB.teacherName(proxyId)}`); DB.save();
    toast(`${pn(pu)}-কে দায়িত্ব দেওয়া হয়েছে এবং এসএমএসে জানানো হয়েছে।`, 'success'); App.refresh();
  },
  autoAssign() {
    const ui = App.ui.px, absent = this.absentOn(ui.date), day = U.dayName(ui.date); let n = 0;
    absent.forEach(aid => RT.ofTeacher(aid, ui.date, { noProxy: true }).forEach(slot => {
      if (DB.s.proxies.some(p => p.date === ui.date && p.period === slot.period && p.classId === slot.classId)) return;
      const best = this.candidates(ui.date, slot.period, slot, absent)[0];
      if (best) { this.assign(ui.date, slot.period, slot.classId, aid, best.t.id, ui.reason); n++; }
    }));
    toast(n ? `স্বয়ংক্রিয়ভাবে ${bnNum(n)}টি পিরিয়ডে প্রক্সি নির্ধারিত হয়েছে।` : 'প্রক্সি দেওয়ার মতো আর কিছু নেই।', n ? 'success' : 'ok');
  },
  markAbsence(tid, kind) {
    const mk = App.ui.px.date.slice(0, 7), rec = DB.s.teacherAbsences[tid][mk] || (DB.s.teacherAbsences[tid][mk] = { unexcused: 0, excused: 0 });
    rec[kind]++; DB.audit('TEACHER_ABSENCE', 'payroll', `${DB.teacherName(tid)} ${App.ui.px.date}: ${kind === 'unexcused' ? 'অননুমোদিত' : 'অনুমোদিত ছুটি'}`); DB.save();
    toast(kind === 'unexcused' ? 'অননুমোদিত অনুপস্থিতি হিসেবে লিপিবদ্ধ — বেতন-ভাতায় বিনা বেতন কর্তন প্রযোজ্য।' : 'অনুমোদিত ছুটি হিসেবে লিপিবদ্ধ — বেতন কর্তন হবে না।'); App.refresh();
  },
};

App.addPage('principal', {
  id: 'proxy', label: 'জরুরি প্রক্সি', icon: 'user-round-check',
  render() {
    const ui = App.ui.px || (App.ui.px = { date: U.iso(Teacher.nextSchoolDay ? (() => { let d = new Date(); for (let i = 0; i < 20 && !U.isSchoolDay(d, null, DB.campusId()); i++) d = U.addDays(d, 1); return d; })() : new Date()), manual: [], reason: 'আকস্মিক অসুস্থতা' });
    const day = U.dayName(ui.date), absent = ProxyDesk.absentOn(ui.date), hol = !U.isSchoolDay(ui.date, null, DB.campusId());
    const assigned = DB.s.proxies.filter(p => p.date === ui.date && DB.campusOf(p.classId) === DB.campusId());
    const blocks = absent.map(aid => {
      const slots = RT.ofTeacher(aid, ui.date, { noProxy: true });
      const onLeave = DB.s.leaves.find(l => l.teacherId === aid && l.status === 'Approved' && ui.date >= l.from && ui.date <= l.to);
      return `<div class="card mb-4"><div class="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2"><b>${esc(DB.teacherName(aid))}</b>${onLeave ? badge(`অনুমোদিত ${bn(onLeave.type)}তে`, 'violet') : badge('আকস্মিক অনুপস্থিতি', 'red')}<span class="text-xs text-slate-500">${U.dayBn(day)} ${bnNum(slots.length)}টি পিরিয়ড</span>
        <div class="ml-auto flex gap-1">${onLeave ? '' : `<button class="btn btn-ghost btn-sm" onclick="ProxyDesk.markAbsence('${aid}','excused')">অনুমোদিত ছুটি হিসেবে চিহ্নিত করুন</button><button class="btn btn-ghost btn-sm text-red-600" onclick="ProxyDesk.markAbsence('${aid}','unexcused')">অননুমোদিত হিসেবে চিহ্নিত করুন (বিনা বেতন)</button><button class="btn btn-ghost btn-sm" onclick="App.ui.px.manual=App.ui.px.manual.filter(x=>x!=='${aid}');App.refresh()">${icon('x')}</button>`}</div></div>
        <div class="divide-y divide-slate-100">${slots.map(s => {
          const done = assigned.find(p => p.period === s.period && p.classId === s.classId);
          const cands = done ? [] : ProxyDesk.candidates(ui.date, s.period, s, absent).slice(0, 4);
          return `<div class="px-5 py-3 flex flex-wrap items-center gap-3 text-sm"><div class="w-36"><b>${RT.periodText(s)}${RT.range(s).start ? ' · ' + U.bn(RT.range(s).start) : ''}</b><div class="text-slate-500">${esc(RT.subName(s))} · ${esc(DB.className(s.classId))}${s.room ? ' · ' + esc(U.bn(s.room)) : ''}</div></div>
            ${done ? `<div class="flex-1">${badge('প্রক্সি নির্ধারিত', 'green')} <b>${esc(DB.teacherName(done.proxyTeacherId))}</b></div><button class="btn btn-ghost btn-sm" onclick="DB.s.proxies=DB.s.proxies.filter(x=>x.id!=='${done.id}');DB.audit('PROXY_CANCEL','proxies','${done.id}');DB.save();App.refresh()">পূর্বাবস্থায় ফেরান</button>`
              : `<div class="flex-1 flex flex-wrap gap-1.5">${cands.map((c, i) => `<button class="btn btn-sm ${i === 0 ? 'btn-primary' : 'btn-ghost'}" title="${c.sameSubj ? 'একই বিষয় · ' : ''}এ মাসে ${bnNum(c.monthLoad)}টি প্রক্সি · আজ ${bnNum(c.dayLoad)}টি পিরিয়ড" onclick="ProxyDesk.assign('${ui.date}',${s.period},'${s.classId}','${aid}','${c.t.id}',App.ui.px.reason)">${c.sameSubj ? '★ ' : ''}${esc(pn(DB.user(c.t.userId)))} <span class="opacity-60 text-[10px]">${bnNum(c.monthLoad)}/${bnNum(c.dayLoad)}</span></button>`).join('') || '<span class="text-red-600 text-xs">কোনো শিক্ষক খালি নেই।</span>'}</div>`}</div>`;
        }).join('') || '<div class="px-5 py-3 text-sm text-slate-400">কোনো পিরিয়ড নির্ধারিত নেই।</div>'}</div></div>`;
    }).join('');
    return pageHeader('স্মার্ট জরুরি প্রক্সি নির্ধারণ', '★ = একই বিষয় · সংখ্যা = এ মাসের প্রক্সি / সেদিনের পিরিয়ড')
      + `<div class="card p-4 mb-4 flex flex-wrap gap-3 items-end"><div><label class="label">তারিখ</label><input type="date" class="input" value="${ui.date}" onchange="App.ui.px.date=this.value;App.refresh()"></div>
        <div><label class="label">অনুপস্থিত শিক্ষক যোগ করুন</label><select class="select" onchange="if(this.value){App.ui.px.manual.push(this.value);App.refresh()}"><option value="">— নির্বাচন করুন —</option>${DB.teachersIn().filter(t => !absent.includes(t.id)).map(t => `<option value="${t.id}">${esc(pn(DB.user(t.userId)))} (${t.subjects.map(x => DB.subject(x)?.name || x).join(', ')})</option>`).join('')}</select></div>
        <div><label class="label">কারণ</label><input class="input" value="${esc(ui.reason)}" onchange="App.ui.px.reason=this.value"></div>
        <button class="btn btn-primary" ${absent.length ? '' : 'disabled'} onclick="ProxyDesk.autoAssign()">${icon('wand-sparkles')} উপযুক্তদের স্বয়ংক্রিয়ভাবে নির্ধারণ করুন</button></div>
      ${hol ? `<div class="card p-3 mb-4 bg-amber-50 border-amber-200 text-amber-800 text-sm">${U.fmtDate(ui.date)} এই ক্যাম্পাসের সাপ্তাহিক ছুটি বা ছুটির দিন।</div>` : ''}
      ${blocks || `<div class="card p-6">${emptyState(`${U.fmtDate(ui.date)} তারিখে কোনো অনুপস্থিতি লিপিবদ্ধ নেই। ওপরে অনুপস্থিত শিক্ষক যোগ করুন; অনুমোদিত ছুটি স্বয়ংক্রিয়ভাবে দেখানো হবে।`, 'user-check')}</div>`}
      <div class="card mt-2"><div class="px-5 py-3 border-b border-slate-100 font-semibold">প্রক্সির লগ (এই ক্যাম্পাস)</div><div class="divide-y divide-slate-100 text-sm max-h-72 overflow-y-auto">${DB.s.proxies.filter(p => DB.campusOf(p.classId) === DB.campusId()).slice().reverse().slice(0, 30).map(p => `<div class="px-5 py-2">${U.fmtDate(p.date)} পিরিয়ড ${bnNum(p.period)} · ${esc(DB.className(p.classId))} ${esc(RT.subName(p))} — <b>${esc(DB.teacherName(p.proxyTeacherId))}</b>, ${esc(DB.teacherName(p.absentTeacherId))}-এর পরিবর্তে <span class="text-xs text-slate-400">${esc(bn(p.reason || ''))}</span></div>`).join('') || emptyState('এখনো কোনো প্রক্সি নেই।')}</div></div>`;
  },
}, 'staff');

App.addPage('principal', {
  id: 'faculty', label: 'শিক্ষকমণ্ডলীর চাকরিজীবন', icon: 'id-card-lanyard',
  render() {
    const all = DB.teachersIn(), mk = U.monthKey(new Date()), L = 'teachers.faculty', K = 'facF', uq = f => [...new Set(all.map(f).filter(Boolean))];
    const FD = ListPrefs.filters(L, [{ k: 'status', label: 'চাকরির অবস্থা', opts: uq(t => t.status || 'Confirmed').map(s => [s, bn(s)]), when: uq(t => t.status || 'Confirmed').length > 1 }, { k: 'dept', label: 'বিভাগ', on: false, opts: uq(t => t.dept).map(d => [d, bn(d)]), when: uq(t => t.dept).length > 1 }, { k: 'pay', label: 'পরিশোধের মাধ্যম', on: false, opts: uq(t => t.payoutMethod || 'Bank').map(m => [m, bn(m)]), when: uq(t => t.payoutMethod || 'Bank').length > 1 }]);
    const fv = k => ListPrefs.val(L, K, k);
    const ts = all.filter(t => (!fv('status') || (t.status || 'Confirmed') === fv('status')) && (!fv('dept') || t.dept === fv('dept')) && (!fv('pay') || (t.payoutMethod || 'Bank') === fv('pay')));
    const C = ListPrefs.cols(L, [
      { k: 't', label: 'শিক্ষক', lock: true, td: t => { const u = DB.user(t.userId) || {}; return `<div class="flex items-center gap-2.5">${avatar(u, 30)}<div><a class="font-semibold hover:underline" href="${Faculty.url(t.id)}">${esc(pn(u))}</a><div class="text-xs text-slate-400">${esc(bn(t.designation))} · ${esc(Teacher.assignSummary(t))}</div></div></div>`; } },
      { k: 'status', label: 'অবস্থা', td: t => badge(bn(t.status || 'Confirmed'), FAC_STATUS_TONE[t.status] || 'slate') },
      { k: 'periods', label: 'পিরিয়ড/সপ্তাহ', td: t => bnNum(Faculty.periodsPerWeek(t.id)) },
      { k: 'eval', label: 'সর্বশেষ মূল্যায়ন', td: t => Faculty.stars(Faculty.avgEval(t.id)) },
      { k: 'abs', label: `অনুপস্থিতি (${U.monthName(mk)})`, td: t => { const a = DB.s.teacherAbsences[t.id]?.[mk] || { excused: 0, unexcused: 0 }; return `${bnNum(a.excused)} অনু. ছুটি · <span class="${a.unexcused ? 'text-red-600 font-semibold' : ''}">${bnNum(a.unexcused)} অননুমোদিত</span>`; } },
      { k: 'proxy', label: 'প্রদত্ত প্রক্সি', td: t => bnNum(DB.s.proxies.filter(p => p.proxyTeacherId === t.id).length) },
      { k: 'pay', label: 'পরিশোধের মাধ্যম', td: t => esc(bn(t.payoutMethod || 'Bank')) },
      { k: 'dept', label: 'বিভাগ', on: false, td: t => esc(bn(t.dept)) },
      { k: 'join', label: 'যোগদান', on: false, td: t => (t.joinDate ? U.fmtDate(t.joinDate) : '—') },
      { k: 'act', label: '', lock: true, td: t => `<a class="btn btn-ghost btn-sm" href="${Faculty.url(t.id)}">${icon('eye')} প্রোফাইল</a>` },
    ]);
    return pageHeader('শিক্ষকমণ্ডলীর চাকরিজীবন ও মূল্যায়ন', multiCampus() ? esc(DB.campus().name) : '', `${ListPrefs.button(L)}<button class="btn btn-primary" onclick="Principal.onboard()">${icon('user-plus')} শিক্ষক যুক্ত করুন</button>`)
      + `<div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">${kpi('শিক্ষকমণ্ডলী', bnNum(ts.length), `${bnNum(ts.filter(t => t.status === 'Probation').length)} জন শিক্ষানবিশকালে`, 'users', 'blue')}${kpi('গড় মূল্যায়ন', bnNum((U.sum(ts.map(t => Faculty.avgEval(t.id)).filter(x => x !== null)) / (ts.filter(t => Faculty.avgEval(t.id) !== null).length || 1)).toFixed(2)), 'প্রত্যেক শিক্ষকের সর্বশেষ', 'star', 'amber')}${kpi('এ মাসের প্রক্সি', bnNum(DB.s.proxies.filter(p => p.date.startsWith(mk) && DB.campusOf(p.classId) === DB.campusId()).length), '', 'user-round-check', 'violet')}${kpi('পাঠদানের চাপ', bnNum((U.sum(ts, t => Faculty.periodsPerWeek(t.id)) / (ts.length || 1)).toFixed(1)), 'গড় পিরিয়ড / সপ্তাহ', 'clock', 'green')}</div>
      ${FD.some(d => d.opts) ? `<div class="card p-3 mb-3 flex flex-wrap gap-2">${ListPrefs.selects(FD, K)}</div>` : ''}
      <div class="card scroll-x"><table class="table"><thead>${ListPrefs.head(C)}</thead><tbody>
      ${ts.map(t => ListPrefs.row(C, t)).join('')}</tbody></table>${ts.length ? '' : emptyState('কোনো শিক্ষক মেলেনি।', 'users')}</div>`;
  },
}, 'staff');

/* ---------- Payroll engine: teachers + support staff, overtime, allowances, installments & multi-channel payouts ---------- */
const Payroll = {
  /** Draft lines for every active employee of the campus (teachers T… and support staff ST…). */
  preview(mk) {
    const adj = App.ui.prAdj || {};
    return DB.employees().filter(e => e.status !== 'Resigned').map(e => {
      const abs = DB.s.teacherAbsences[e.id]?.[mk] || {}, ot = adj[e.id]?.ot ?? e.ref.overtimeHours?.[mk] ?? 0, al = adj[e.id]?.allowance ?? 0;
      return { e, ...DB_calcPay(e, abs.unexcused || 0, ot, al), excused: abs.excused || 0 };
    });
  },
  rows(mk) { return DB.s.payroll.filter(p => p.month === mk && DB.emp(p.empId)?.campusId === DB.campusId()); },
  setAdj(id, field, v) { const a = App.ui.prAdj || (App.ui.prAdj = {}); (a[id] = a[id] || {})[field] = Math.max(0, +v || 0); if (field === 'ot') { const e = DB.emp(id); (e.ref.overtimeHours = e.ref.overtimeHours || {})[App.ui.prMonth || U.monthKey(new Date())] = +v || 0; DB.save(); } App.refresh(); },
  /** Approve = accrue: Dr Salaries, Cr Salaries Payable (net) + PF Payable. Cash leaves only when installments are disbursed. */
  approve(mk) {
    if (this.rows(mk).length) return toast(`এই ক্যাম্পাসের ${U.monthName(mk)} মাসের বেতন-ভাতা ইতোমধ্যে অনুমোদিত।`, 'error');
    const inst = App.ui.prInst || {}, rows = this.preview(mk);
    if (!confirm(`${bnNum(rows.length)} জন কর্মচারীর ${U.money(U.sum(rows, r => r.net))} নিট বেতন-ভাতা অনুমোদন করবেন (${DB.campus().name}, ${U.monthName(mk)})?`)) return;
    rows.forEach(r => DB.s.payroll.push({ id: DB.id('PR'), month: mk, empId: r.e.id, base: r.base, hra: r.hra, medical: r.medical, overtimeHours: r.overtimeHours, overtime: r.overtime, allowance: r.allowance, gross: r.gross, unexcused: r.unexcused, lop: r.lop, pf: r.pf, net: r.net, installments: +inst[r.e.id] || 1, payouts: [], status: 'approved' }));
    DB.postJournal(`বেতন-ভাতা হিসাবভুক্তি — ${U.monthName(mk)} (${DB.campus().short})`, [{ acct: '5000', dr: U.sum(rows, r => r.gross - r.lop), cr: 0 }, { acct: '2300', dr: 0, cr: U.sum(rows, r => r.net) }, { acct: '2100', dr: 0, cr: U.sum(rows, r => r.pf) }], 'PAYROLL-' + mk, App.session.userId, null, { campusId: DB.campusId() });
    DB.audit('PAYROLL_APPROVE', 'payroll', `${mk} ${DB.campusId()}: ${bnNum(rows.length)} জন কর্মচারী, নিট ${U.money(U.sum(rows, r => r.net))}`); DB.save();
    App.ui.prAdj = {}; toast('বেতন-ভাতা অনুমোদিত ও হিসাবভুক্ত হয়েছে। এরপর কিস্তি বিতরণ করুন।', 'success'); App.refresh();
  },
  /** Pay the next installment of one payroll row through the employee's payout channel. */
  disburse(prId, silent) {
    const p = DB.s.payroll.find(x => x.id === prId), e = DB.emp(p.empId);
    if (p.payouts.length >= p.installments) return;
    const paid = U.sum(p.payouts, x => x.amount), n = p.payouts.length + 1;
    const amount = n === p.installments ? p.net - paid : Math.round(p.net / p.installments);
    const method = e.payoutMethod || 'Bank', ref = method === 'Cash' ? `CV-${p.id}-${n}` : method === 'Bank' ? `BA-${Date.now().toString().slice(-8)}` : U.trxId();
    p.payouts.push({ n, amount, method, account: e.payoutAccount || '', date: U.today(), ref });
    p.status = p.payouts.length >= p.installments ? 'disbursed' : 'partial';
    DB.postJournal(`বেতন ${U.monthName(p.month)} কিস্তি ${bnNum(n)}/${bnNum(p.installments)} — ${facEmpName(e)} (${bn(method)}-এর মাধ্যমে)`, [{ acct: '2300', dr: amount, cr: 0 }, { acct: DB.mfsAccount(method), dr: 0, cr: amount }], p.id, App.session.userId, null, { kind: 'PV', campusId: e.campusId, payee: e.name });
    if (e.phone) DB.sms(e.phone, `${DB.s.school.shortName}: ${U.monthName(p.month)} মাসের বেতনের কিস্তি ${bnNum(n)}/${bnNum(p.installments)} — ${U.money(amount)} ${bn(method)}-এর মাধ্যমে পাঠানো হয়েছে${method === 'Cash' ? ' (হিসাব শাখা থেকে সংগ্রহ করুন)' : ''}। রেফারেন্স ${ref}।`);
    DB.audit('SALARY_DISBURSE', 'payroll', `${p.id} #${n} ${U.money(amount)} — ${bn(method)} (${ref})`);
    if (!silent) { DB.save(); toast(`${bn(method)}-এর মাধ্যমে ${facEmpName(e)}-কে ${U.money(amount)} পরিশোধ করা হয়েছে।`, 'success'); App.refresh(); }
  },
  disburseAll(mk, method) {
    const rows = this.rows(mk).filter(p => p.payouts.length < p.installments && (!method || (DB.emp(p.empId).payoutMethod || 'Bank') === method));
    if (!rows.length) return toast('কোনো পাওনা নেই।', 'warn');
    if (!confirm(method ? `${bn(method)}-এর মাধ্যমে বেতনপ্রাপ্ত ${bnNum(rows.length)} জন কর্মচারীর পরবর্তী কিস্তি বিতরণ করবেন?` : `${bnNum(rows.length)} জন কর্মচারীর পরবর্তী কিস্তি বিতরণ করবেন?`)) return;
    rows.forEach(p => this.disburse(p.id, true)); DB.save(); toast(`${bnNum(rows.length)}টি পরিশোধ বিতরণ করা হয়েছে।`, 'success'); App.refresh();
  },
  /** Bulk-disbursement file: MFS wallets (bKash/Nagad/Rocket B2C format) or bank advice. */
  exportFile(mk, method) {
    const rows = this.rows(mk).filter(p => (DB.emp(p.empId).payoutMethod || 'Bank') === method && p.payouts.length < p.installments);
    if (!rows.length) return toast(`${bn(method)}-এর মাধ্যমে কোনো অপেক্ষমাণ পরিশোধ নেই।`, 'warn');
    const amt = p => { const n = p.payouts.length + 1; return n === p.installments ? p.net - U.sum(p.payouts, x => x.amount) : Math.round(p.net / p.installments); };
    const head = MFS.includes(method) ? ['wallet_number', 'amount', 'reference', 'name'] : ['account_number', 'amount', 'narration', 'beneficiary'];
    downloadFile(`${method}-salary-${mk}-${DB.campusId()}.csv`, U.csv([head, ...rows.map(p => { const e = DB.emp(p.empId); return [e.payoutAccount, amt(p), `SAL-${mk}-${p.id}-${p.payouts.length + 1}`, e.name]; })]), 'text/csv');
    DB.audit('PAYROLL_EXPORT', 'payroll', `${method} একত্রিত ফাইল ${mk} (${bnNum(rows.length)} সারি)`); DB.save();
  },
  slipSheet(empId, mk) {
    const p = DB.s.payroll.find(x => x.empId === empId && x.month === mk) || { ...this.preview(mk).find(r => r.e.id === empId), status: 'draft', payouts: [], installments: 1 };
    const e = DB.emp(empId), n = v => U.bn((+v || 0).toLocaleString('en-IN'));
    return Print.sheet({}, 'padded') + `${Print.header(`বেতন বিবরণী · ${U.monthName(mk)}`)}<div style="font-size:10pt;line-height:1.8"><b>${esc(facEmpName(e))}</b> · ${esc(bn(e.designation))} · ${esc(bn(e.kind === 'Teacher' ? e.dept : e.type))} · ${esc(DB.campus(e.campusId).name)} · গ্রেড ${e.salaryGrade} · কর্মচারী আইডি ${e.id}</div>
      <table class="ms-table" style="margin-top:4mm"><tr><th>আয়</th><th>৳</th><th>কর্তন</th><th>৳</th></tr><tr><td>মূল বেতন</td><td>${n(p.base)}</td><td>ভবিষ্য তহবিল (১০%)</td><td>${n(p.pf)}</td></tr><tr><td>বাড়িভাড়া (৫০%)</td><td>${n(p.hra)}</td><td>বিনা বেতন কর্তন (${bnNum(p.unexcused || 0)} দিন)</td><td>${n(p.lop)}</td></tr><tr><td>চিকিৎসা ভাতা</td><td>${n(p.medical)}</td><td></td><td></td></tr><tr><td>অতিরিক্ত সময় (${bnNum(p.overtimeHours || 0)} ঘণ্টা)</td><td>${n(p.overtime)}</td><td></td><td></td></tr><tr><td>অন্যান্য ভাতা</td><td>${n(p.allowance)}</td><td></td><td></td></tr>
      <tr><th>মোট বেতন</th><th>${n(p.gross)}</th><th>নিট বেতন</th><th>${n(p.net)}</th></tr></table>
      <table class="ms-table" style="margin-top:5mm"><tr><th>কিস্তি</th><th>তারিখ</th><th>মাধ্যম</th><th>হিসাব</th><th>রেফারেন্স</th><th>পরিমাণ</th></tr>${(p.payouts || []).map(x => `<tr><td>${bnNum(x.n)}/${bnNum(p.installments)}</td><td>${U.fmtDate(x.date)}</td><td>${esc(bn(x.method))}</td><td>${esc(x.account || '—')}</td><td>${esc(x.ref)}</td><td>${n(x.amount)}</td></tr>`).join('') || '<tr><td colspan="6">এখনো বিতরণ করা হয়নি</td></tr>'}</table>
      <div style="margin-top:4mm;font-size:9pt;color:#475569">অবস্থা: ${bn(p.status)}</div><div style="position:absolute;bottom:25mm;right:14mm">${Print.signature('হিসাবরক্ষণ কর্মকর্তা')}</div></div>`;
  },
  payslip(empId, mk) { Print.preview('বেতন বিবরণী', [this.slipSheet(empId, mk)], { re: ['Payroll.payslip', empId, mk] }); },
  setAbsence(id, mk, v) { const rec = DB.s.teacherAbsences[id]?.[mk] || ((DB.s.teacherAbsences[id] = DB.s.teacherAbsences[id] || {})[mk] = { unexcused: 0, excused: 0 }); rec.unexcused = Math.max(0, +v || 0); DB.audit('ABSENCE_EDIT', 'payroll', `${DB.emp(id).name} ${mk} unexcused=${rec.unexcused}`); DB.save(); App.refresh(); },
};

App.addPage('admin', {
  id: 'payroll', label: 'বেতন-ভাতা ও পরিশোধ', icon: 'banknote', module: 'hr',
  render() {
    const months = [...new Set([U.monthKey(new Date()), ...DB.s.payroll.map(p => p.month)])].sort().reverse();
    const mk = App.ui.prMonth || months[0], rows0 = Payroll.rows(mk), done = rows0.length > 0;
    const rows = done ? rows0.map(p => ({ ...p, e: DB.emp(p.empId) })) : Payroll.preview(mk);
    const inst = App.ui.prInst || (App.ui.prInst = {});
    const pendingBy = PAYOUT_METHODS.map(m => [m, rows0.filter(p => (DB.emp(p.empId).payoutMethod || 'Bank') === m && (p.payouts || []).length < p.installments).length]).filter(x => x[1]);
    return pageHeader('বেতন-ভাতা প্রক্রিয়াকরণ ও বেতন পরিশোধ', 'মূল বেতন + বাড়িভাড়া ৫০% + চিকিৎসা + অতিরিক্ত সময় + ভাতা − বিনা বেতন কর্তন − ১০% ভবিষ্য তহবিল', `<select class="select !w-auto" onchange="App.ui.prMonth=this.value;App.ui.prAdj={};App.refresh()">${months.map(m => `<option value="${m}" ${m === mk ? 'selected' : ''}>${U.monthName(m)}</option>`).join('')}</select>${!done && App.can('payroll.run') ? `<button class="btn btn-primary" onclick="Payroll.approve('${mk}')">${icon('check')} ${U.monthName(mk)} অনুমোদন করুন</button>` : badge(done ? 'অনুমোদিত' : 'খসড়া', done ? 'green' : 'amber')}`)
      + `<div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">${kpi('মোট বেতন-ভাতা', U.money(U.sum(rows, r => r.gross)), `${bnNum(rows.length)} জন কর্মচারী · ${esc(DB.campus().short)}`, 'wallet', 'blue')}${kpi('অতিরিক্ত সময় ও ভাতা', U.money(U.sum(rows, r => (r.overtime || 0) + (r.allowance || 0))), `${bnNum(U.sum(rows, r => r.overtimeHours || 0))} ঘণ্টা অতিরিক্ত সময়`, 'clock', 'violet')}${kpi('বিনা বেতন কর্তন', U.money(U.sum(rows, r => r.lop)), `${bnNum(U.sum(rows, r => r.unexcused))} দিন অননুমোদিত`, 'calendar-x', 'red')}${kpi('বিতরণকৃত / নিট', `${U.money(U.sum(rows0, p => U.sum(p.payouts, x => x.amount)))}`, `${U.money(U.sum(rows, r => r.net))}-এর মধ্যে`, 'banknote', 'green')}</div>
      ${done && pendingBy.length ? `<div class="card p-4 mb-4 flex flex-wrap items-center gap-2"><span class="text-sm font-semibold mr-2">অপেক্ষমাণ পরিশোধ:</span>${pendingBy.map(([m, n]) => `<div class="flex items-center gap-1 border border-slate-200 rounded-lg pl-2">${badge(`${bn(m)} · ${bnNum(n)}`, MFS.includes(m) ? 'pink' : 'slate')}<button class="btn btn-ghost btn-sm" onclick="Payroll.disburseAll('${mk}','${m}')">পরিশোধ করুন</button>${m !== 'Cash' ? `<button class="btn btn-ghost btn-sm" title="একত্রিত ফাইল" onclick="Payroll.exportFile('${mk}','${m}')">${icon('file-down')}</button>` : ''}</div>`).join('')}<button class="btn btn-primary btn-sm ml-auto" onclick="Payroll.disburseAll('${mk}')">${icon('send')} সকলের পরবর্তী কিস্তি বিতরণ করুন</button></div>` : ''}
      <div class="card scroll-x"><table class="table"><thead><tr><th>কর্মচারী</th><th class="text-right">মূল বেতন</th><th class="text-center">অতিরিক্ত ঘণ্টা</th><th class="text-center">ভাতা</th><th class="text-right">মোট বেতন</th><th class="text-center">অননুমোদিত</th><th class="text-right">বিনা বেতন কর্তন</th><th class="text-right">ভবিষ্য তহবিল</th><th class="text-right">নিট</th><th>মাধ্যম</th><th>কিস্তি</th><th>পরিশোধসমূহ</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr><td class="font-semibold"><button class="hover:underline" onclick="${r.e.kind === 'Teacher' ? `Faculty.profile('${r.e.id}','pay')` : `HR.staffProfile('${r.e.id}')`}">${esc(facEmpName(r.e))}</button><div class="text-xs text-slate-400 font-normal">${esc(bn(r.e.designation))} · ${r.e.kind === 'Teacher' ? 'শিক্ষক' : esc(bn(r.e.type))}</div></td><td class="text-right">${U.money(r.base)}</td>
        <td class="text-center">${!done ? `<input type="number" min="0" class="grid-input !w-14" value="${r.overtimeHours || 0}" onchange="Payroll.setAdj('${r.e.id}','ot',this.value)">` : bnNum(r.overtimeHours || 0)}</td><td class="text-center">${!done ? `<input type="number" min="0" step="100" class="grid-input !w-20" value="${r.allowance || 0}" onchange="Payroll.setAdj('${r.e.id}','allowance',this.value)">` : U.money(r.allowance || 0)}</td>
        <td class="text-right">${U.money(r.gross)}</td><td class="text-center">${!done ? `<input type="number" min="0" max="31" class="grid-input !w-14" value="${r.unexcused}" onchange="Payroll.setAbsence('${r.e.id}','${mk}',this.value)">` : bnNum(r.unexcused)}</td><td class="text-right text-red-600">${r.lop ? '−' + U.money(r.lop) : '—'}</td><td class="text-right">−${U.money(r.pf)}</td><td class="text-right font-bold">${U.money(r.net)}</td>
        <td class="text-xs">${esc(bn(r.e.payoutMethod || 'Bank'))}<div class="font-mono text-[10px] text-slate-400">${esc(r.e.payoutAccount || '')}</div></td>
        <td>${!done ? `<select class="select !py-1 !text-xs !w-16" onchange="App.ui.prInst['${r.e.id}']=this.value">${[1, 2, 3].map(n => `<option value="${n}" ${+(inst[r.e.id] || 1) === n ? 'selected' : ''}>${bnNum(n)}</option>`).join('')}</select>` : `${bnNum(r.payouts.length)}/${bnNum(r.installments)}`}</td>
        <td class="text-xs">${done ? (r.payouts.map(x => `${U.money(x.amount)} <span class="text-slate-400">${bn(x.method)} ${U.fmtDate(x.date)}</span>`).join('<br>') || '—') : '—'}</td>
        <td><div class="flex gap-1 justify-end">${done && r.payouts.length < r.installments ? `<button class="btn btn-success btn-sm" onclick="Payroll.disburse('${r.id}')">কিস্তি #${bnNum(r.payouts.length + 1)} পরিশোধ করুন</button>` : done ? badge('পরিশোধিত', 'green') : ''}<button class="btn btn-ghost btn-sm" onclick="Payroll.payslip('${r.e.id}','${mk}')">${icon('file-text')}</button></div></td></tr>`).join('')}</tbody></table></div>`;
  },
}, 'installments');
