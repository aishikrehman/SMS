/* ==========================================================================
   F. GUARDIAN / PARENT PORTAL
   ========================================================================== */

const Guardian = {
  kids() { return DB.children(App.session.userId); },
  child() {
    const kids = this.kids();
    let c = kids.find(k => k.id === App.ui.child);
    if (!c) { c = kids[0]; App.ui.child = c?.id; }
    return c;
  },
  /** Sibling switcher shown at the top of every guardian page. */
  switcher() {
    const kids = this.kids(), c = this.child();
    return `<div class="card p-3 mb-5 flex flex-wrap items-center gap-3"><span class="text-xs font-bold uppercase text-slate-500">প্রদর্শিত হচ্ছে</span>
      <div class="flex flex-wrap gap-2">${kids.map(k => `<button class="flex items-center gap-2 rounded-xl px-2.5 py-1.5 border ${k.id === c.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'}" onclick="App.ui.child='${k.id}';App.ui.calMonth=null;App.refresh()">${avatar(k, 28)}<span class="text-left leading-tight"><span class="block text-sm font-semibold">${esc(k.nameBn ? pn(k) : k.name.split(' ')[0])}</span><span class="block text-[11px] text-slate-500">${DB.cls(k.classId).name}</span></span></button>`).join('')}</div>
      <span class="ml-auto text-xs text-slate-400">${bnNum(kids.length)} জন সন্তান সংযুক্ত</span></div>`;
  },
  pay() {
    const c = this.child(), ids = $$('input[name=inv]:checked').map(x => x.value);
    if (!ids.length) return toast('অন্তত একটি বিল নির্বাচন করুন।', 'error');
    const amount = U.sum(DB.s.invoices.filter(i => ids.includes(i.id)), i => i.amount);
    this._pending = { studentId: c.id, ids };
    Modal.open({ title: `${esc(pn(c))}-এর জন্য ${U.money(amount)} পরিশোধ করুন`, size: 'lg', body: Pub.payPicker(amount, null, 'Guardian.onPaid') });
  },
  onPaid(m, txn, meta) {
    const { studentId, ids } = this._pending;
    const pay = DB.recordPayment(studentId, ids, m, App.session.userId, { trxId: txn, channel: meta.channel, verified: meta.verified, msisdn: meta.msisdn });
    DB.audit('FEE_PAYMENT', 'payments', `${pn(DB.student(studentId))}: ${U.money(pay.amount)} — ${bn(m)} ${meta.channel} (${pay.id}, TrxID ${txn})`);
    DB.sms(DB.user(App.session.userId).phone, `${DB.s.school.shortName}: ${pn(DB.student(studentId))}-এর ${U.money(pay.amount)} পরিশোধ ${pay.verified ? 'গৃহীত হয়েছে' : 'লিপিবদ্ধ হয়েছে (ট্রানজ্যাকশন আইডি যাচাই অপেক্ষমাণ)'}। রসিদ ${pay.id}।`);
    DB.save();
    Modal.open({ title: pay.verified ? 'পরিশোধ সফল হয়েছে' : 'পরিশোধ লিপিবদ্ধ হয়েছে', size: 'sm', body: `<div class="text-center"><div class="w-14 h-14 mx-auto rounded-full ${pay.verified ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'} flex items-center justify-center">${icon(pay.verified ? 'check' : 'clock', 'w-7 h-7')}</div><div class="text-2xl font-extrabold mt-2">${U.money(pay.amount)}</div><div class="text-sm text-slate-500">রসিদ ${pay.id} · ${esc(bn(m))} · ট্রানজ্যাকশন আইডি <span class="font-mono">${esc(pay.txn)}</span></div>${pay.verified ? '' : '<p class="text-xs text-amber-700 mt-2">হিসাব শাখা এক কর্মদিবসের মধ্যে এমএফএস বিবরণীর সঙ্গে এই ট্রানজ্যাকশন আইডি মিলিয়ে দেখবে।</p>'}</div>`, footer: `<button class="btn btn-primary" onclick="Print.show('receipt','${pay.id}')">${icon('download')} রসিদ ডাউনলোড করুন</button>` });
    App.refresh();
  },
  slots(teacherId) {
    const out = []; let d = U.addDays(new Date(), 1);
    const cp = DB.teacher(teacherId)?.campusId;
    for (let i = 0; out.length < 3 && i < 40; i++) { if (U.isSchoolDay(d, null, cp)) out.push(U.iso(d)); d = U.addDays(d, 1); }
    const times = ['14:00', '14:10', '14:20', '14:30', '14:40', '14:50'];
    return out.map(date => ({ date, times: times.map(t => ({ t, booking: DB.s.ptcBookings.find(b => b.teacherId === teacherId && b.date === date && b.time === t) })) }));
  },
  book(teacherId, date, time) {
    const c = this.child();
    if (DB.s.ptcBookings.some(b => b.teacherId === teacherId && b.date === date && b.time === time)) return toast('সময়টি এইমাত্র অন্য কেউ নির্ধারণ করেছেন।', 'error');
    if (DB.s.ptcBookings.some(b => b.guardianUserId === App.session.userId && b.date === date && b.time === time)) return toast('ওই সময়ে আপনার ইতোমধ্যে একটি সাক্ষাৎ নির্ধারিত আছে।', 'error');
    DB.s.ptcBookings.push({ id: DB.id('PTC'), teacherId, date, time, guardianUserId: App.session.userId, studentId: c.id, createdAt: new Date().toISOString() });
    DB.sms(DB.user(DB.teacher(teacherId).userId).phone, `${DB.s.school.shortName}: ${pn(c)}-এর অভিভাবকের সঙ্গে ${U.fmtDate(date)} তারিখ ${U.bn(time)}-এ অভিভাবক-শিক্ষক সভা নির্ধারিত হয়েছে।`);
    DB.audit('PTC_BOOK', 'ptc', `${pn(c)} — ${DB.teacherName(teacherId)} ${date} ${time}`); DB.save();
    toast(`${U.fmtDate(date)} তারিখ ${U.bn(time)}-এ ${DB.teacherName(teacherId)}-এর সঙ্গে সাক্ষাৎ নির্ধারিত হয়েছে।`, 'success'); App.refresh();
  },
  cancel(id) { const b = DB.s.ptcBookings.find(x => x.id === id); DB.s.ptcBookings = DB.s.ptcBookings.filter(x => x.id !== id); DB.audit('PTC_CANCEL', 'ptc', `${b.date} ${b.time}`); DB.save(); toast('সাক্ষাৎ বাতিল করা হয়েছে।'); App.refresh(); },
};

const noKids = () => emptyState('এই অ্যাকাউন্টের সঙ্গে কোনো সন্তান সংযুক্ত নেই। প্রতিষ্ঠানের অফিসে যোগাযোগ করুন।', 'users');

App.register('guardian', {
  title: 'অভিভাবক পোর্টাল',
  pages: [
    {
      id: 'overview', label: 'সারসংক্ষেপ', icon: 'home',
      render() {
        const c = Guardian.child(); if (!c) return noKids();
        const recent = DB.s.incidents.filter(i => i.studentId === c.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
        return pageHeader(`স্বাগতম, ${esc(pn(App.user()))}`, '') + Guardian.switcher() + Learner.summary(c)
          + `<div class="grid lg:grid-cols-3 gap-5 mt-5"><div class="lg:col-span-2">${Learner.timetable(c)}</div><div class="space-y-5">${Learner.calendar(c, App.ui.calMonth)}
            <div class="card"><div class="px-5 py-3 border-b border-slate-100 font-semibold flex justify-between">সাম্প্রতিক সতর্কবার্তা <a href="${App.href('guardian', 'conduct')}" class="text-sm text-brand-600">সকল</a></div><div class="divide-y divide-slate-100">${recent.map(i => `<div class="px-5 py-3 text-sm">${statusBadge(i.type)} <span class="text-xs text-slate-400">${U.fmtDate(i.date)}</span><div class="mt-1">${esc(i.note)}</div></div>`).join('') || emptyState('কোনো সতর্কবার্তা নেই।', 'smile')}</div></div></div></div>`;
      },
    },
    {
      id: 'fees', label: 'ফি ও রসিদ', icon: 'wallet',
      render() {
        const c = Guardian.child(); if (!c) return noKids();
        const unpaid = DB.unpaid(c.id).sort((a, b) => a.due.localeCompare(b.due)), pays = DB.s.payments.filter(p => p.studentId === c.id).sort((a, b) => b.date.localeCompare(a.date));
        const plans = DB.s.installmentPlans.filter(p => p.studentId === c.id);
        return pageHeader('ফি পরিশোধ ও রসিদ কেন্দ্র', '', `<a class="btn btn-ghost" href="${App.href('guardian', 'services')}">${icon('calendar-clock')} কিস্তি পরিকল্পনার আবেদন করুন</a>`) + Guardian.switcher()
          + (plans.length ? `<div class="card p-4 mb-5 bg-violet-50 border-violet-200 text-sm">${plans.map(p => `<div class="flex flex-wrap items-center gap-2">${icon('calendar-clock', 'w-4 h-4 text-violet-600')}<b>${esc(p.title)}</b> · ${U.fmtDate(p.startDate)} থেকে ${bnNum(p.count)}টি ${esc(bn(p.frequency))} কিস্তিতে ${U.money(p.total)}<button class="btn btn-ghost btn-sm ml-auto" onclick="Print.show('installment','${p.id}')">${icon('printer')} সূচি</button></div>`).join('')}</div>` : '')
          + `<div class="grid lg:grid-cols-5 gap-5"><div class="card lg:col-span-2 self-start"><div class="px-5 py-3 border-b border-slate-100 font-semibold flex justify-between">অপরিশোধিত বকেয়া <span class="${unpaid.length ? 'text-red-600' : 'text-emerald-600'}">${U.money(U.sum(unpaid, i => i.amount))}</span></div>
            ${unpaid.length ? `<div class="divide-y divide-slate-100">${unpaid.map(i => `<label class="px-5 py-3 flex items-center gap-3 text-sm cursor-pointer"><input type="checkbox" name="inv" value="${i.id}" checked><span class="flex-1">${esc(i.item)} ${i.kind === 'installment' ? badge('কিস্তি', 'violet') : ''}<div class="text-xs ${i.due < U.today() ? 'text-red-500' : 'text-slate-400'}">পরিশোধের শেষ তারিখ ${U.fmtDate(i.due)}${i.remindedAt ? ' · স্মারক পাঠানো হয়েছে' : ''}</div></span><b>${U.money(i.amount)}</b></label>`).join('')}</div><div class="p-4 border-t border-slate-100"><button class="btn btn-primary w-full" onclick="Guardian.pay()">${icon('lock')} নির্বাচিতগুলো অনলাইনে পরিশোধ করুন</button>${DB.dues(c.id) ? `<p class="text-xs text-amber-700 mt-2">${icon('info', 'w-3.5 h-3.5 inline')} সকল বকেয়া পরিশোধ না হওয়া পর্যন্ত প্রবেশপত্র স্থগিত থাকবে।</p>` : ''}</div>` : emptyState('সকল বকেয়া পরিশোধিত। ধন্যবাদ!', 'badge-check')}</div>
            <div class="card lg:col-span-3 scroll-x"><div class="px-5 py-3 border-b border-slate-100 font-semibold">পরিশোধের ইতিহাস</div><table class="table"><thead><tr><th>রসিদ</th><th>তারিখ</th><th>খাত</th><th>মাধ্যম</th><th class="text-right">পরিমাণ</th><th></th></tr></thead><tbody>${pays.map(p => `<tr><td class="font-mono text-xs">${p.id}</td><td class="whitespace-nowrap">${U.fmtDate(p.date)}</td><td class="text-xs text-slate-600">${p.invoiceIds.map(id => esc(DB.s.invoices.find(i => i.id === id)?.item || '')).join(', ')}</td><td>${esc(bn(p.method))}${p.verified === false ? `<div>${badge('ট্রানজ্যাকশন আইডি যাচাই চলছে', 'amber')}</div>` : ''}<div class="font-mono text-[10px] text-slate-400">${esc(p.txn)}</div></td><td class="text-right font-semibold">${U.money(p.amount)}</td><td><button class="btn btn-ghost btn-sm" onclick="Print.show('receipt','${p.id}')" title="রসিদ">${icon('receipt')}</button></td></tr>`).join('')}</tbody></table></div></div>`;
      },
    },
    {
      id: 'ptc', label: 'অভিভাবক-শিক্ষক সভা নির্ধারণ', icon: 'calendar-plus',
      render() {
        const c = Guardian.child(); if (!c) return noKids();
        // Teachers of the child's class: from the routine, else class teacher / section teacher / mentors, else the campus staff.
        const cls = DB.cls(c.classId) || {};
        let ids = [...new Set(DB.s.routine.filter(r => r.classId === c.classId).flatMap(r => RT.tchs(r)))];
        if (!ids.length) ids = [cls.classTeacherId, cls.sectionTeachers?.[c.section], ...(cls.mentors || [])].filter(Boolean);
        if (!ids.length) ids = DB.teachersIn(DB.campusOf(c.classId)).map(t => t.id);
        const teachers = [...new Set(ids)].map(id => DB.teacher(id)).filter(t => t && DB.user(t.userId));
        if (!teachers.length) return pageHeader('অভিভাবক-শিক্ষক সভা', '') + Guardian.switcher() + `<div class="card">${emptyState('এই শ্রেণিতে এখনও কোনো শিক্ষক নির্ধারণ করা হয়নি।', 'users')}</div>`;
        const mine = DB.s.ptcBookings.filter(b => b.guardianUserId === App.session.userId && b.date >= U.today()).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
        const tid = App.ui.ptcT && teachers.some(t => t.id === App.ui.ptcT) ? App.ui.ptcT : teachers[0].id;
        return pageHeader('অভিভাবক-শিক্ষক সভা', 'অপরাহ্ণ ২:০০–৩:০০ · ১০ মিনিট') + Guardian.switcher()
          + (mine.length ? `<div class="card mb-5"><div class="px-5 py-3 border-b border-slate-100 font-semibold">আমার আসন্ন সাক্ষাৎ</div><div class="divide-y divide-slate-100">${mine.map(b => `<div class="px-5 py-3 flex items-center gap-3 text-sm">${icon('calendar-check', 'w-5 h-5 text-brand-600')}<div class="flex-1"><b>${U.fmtDate(b.date)} · ${U.bn(b.time)}</b> ${esc(DB.teacherName(b.teacherId))}-এর সঙ্গে<div class="text-xs text-slate-500">বিষয়: ${esc(pn(DB.student(b.studentId)))} · শিক্ষক মিলনায়তন</div></div><button class="btn btn-ghost btn-sm text-red-600" onclick="Guardian.cancel('${b.id}')">বাতিল</button></div>`).join('')}</div></div>` : '')
          + `<div class="grid lg:grid-cols-3 gap-5"><div class="card self-start"><div class="px-5 py-3 border-b border-slate-100 font-semibold">${esc(c.nameBn ? pn(c) : c.name.split(' ')[0])}-এর শিক্ষকগণ</div><div class="divide-y divide-slate-100">${teachers.map(t => { const u = DB.user(t.userId); return `<button class="w-full text-left px-5 py-3 flex items-center gap-3 ${t.id === tid ? 'bg-brand-50' : 'hover:bg-slate-50'}" onclick="App.ui.ptcT='${t.id}';App.refresh()">${avatar(u, 34)}<div><div class="text-sm font-semibold">${esc(pn(u))}</div><div class="text-xs text-slate-500">${[...new Set(DB.s.routine.filter(r => r.classId === c.classId && RT.hasT(r, t.id)).flatMap(r => RT.subs(r)).map(s => DB.subject(s)?.name).filter(Boolean))].join(', ')}</div></div></button>`; }).join('')}</div></div>
            <div class="lg:col-span-2 card p-5"><div class="font-semibold mb-4">খালি সময় · ${esc(DB.teacherName(tid))}</div><div class="space-y-4">${Guardian.slots(tid).map(d => `<div><div class="text-sm font-semibold text-slate-600 mb-2">${U.dayBn(d.date + 'T00:00')} · ${U.fmtDate(d.date)}</div><div class="grid grid-cols-3 sm:grid-cols-6 gap-2">${d.times.map(s => s.booking ? `<button disabled class="btn btn-sm ${s.booking.guardianUserId === App.session.userId ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400 line-through'}">${U.bn(s.t)}</button>` : `<button class="btn btn-ghost btn-sm hover:!bg-brand-600 hover:!text-white" onclick="Guardian.book('${tid}','${d.date}','${s.t}')">${U.bn(s.t)}</button>`).join('')}</div></div>`).join('')}</div></div></div>`;
      },
    },
    { id: 'conduct', label: 'আচরণ ও সতর্কবার্তা', icon: 'bell-ring', render() { const c = Guardian.child(); if (!c) return noKids(); return pageHeader('আচরণ ও ঘটনাসংক্রান্ত সতর্কবার্তা', '') + Guardian.switcher() + Learner.incidents(c); } },
    { id: 'academics', label: 'শিক্ষা কার্যক্রম', icon: 'graduation-cap', render() { const c = Guardian.child(); if (!c) return noKids(); return pageHeader('উপস্থিতি ও একাডেমিক প্রতিলিপি', '') + Guardian.switcher() + `<div class="grid lg:grid-cols-3 gap-5"><div>${Learner.calendar(c, App.ui.calMonth)}</div><div class="lg:col-span-2">${Learner.transcript(c)}</div></div>`; } },
    { id: 'idcards', label: 'সন্তানদের পরিচয়পত্র', icon: 'id-card', render() { const kids = Guardian.kids(); if (!kids.length) return noKids(); return pageHeader('ডিজিটাল পরিচয়পত্র', '') + `<div class="grid md:grid-cols-2 xl:grid-cols-3 gap-6">${kids.map(k => Learner.idCard(k)).join('')}</div>`; } },
  ],
});
