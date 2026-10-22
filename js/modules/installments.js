/* ==========================================================================
   DYNAMIC INSTALLMENT & FLEXIBLE FEE PAYMENT PLANS
   Reschedule outstanding dues (or bill an annual/session fee) into monthly
   or quarterly installments, with automated SMS reminders before each due date.
   ========================================================================== */

const Installments = {
  schedule(total, count, frequency, start) {
    const step = frequency === 'Quarterly' ? 3 : 1, per = Math.ceil(total / count / 10) * 10;
    return Array.from({ length: count }, (_, k) => ({ due: U.iso(U.addMonths(start, k * step)), amount: k < count - 1 ? per : total - per * (count - 1) }));
  },
  create(studentId) {
    const st = DB.student(studentId), unpaid = DB.unpaid(studentId).filter(i => i.kind !== 'installment');
    Modal.open({
      title: `কিস্তি পরিকল্পনা · ${esc(pn(st))}`, size: 'lg',
      body: `<form id="ip-form" class="space-y-4">
        <div class="flex gap-4 text-sm"><label class="flex items-center gap-2"><input type="radio" name="src" value="dues" ${unpaid.length ? 'checked' : 'disabled'}> বকেয়া পুনঃতফসিল করুন</label><label class="flex items-center gap-2"><input type="radio" name="src" value="custom" ${unpaid.length ? '' : 'checked'}> নতুন বার্ষিক / শিক্ষাবর্ষ ফি ভাগ করুন</label></div>
        <div id="ip-dues" class="card p-3 space-y-1 max-h-48 overflow-y-auto">${unpaid.map(i => `<label class="flex items-center gap-2 text-sm"><input type="checkbox" name="inv" value="${i.id}" checked><span class="flex-1">${esc(i.item)} <span class="text-xs text-slate-400">পরিশোধের শেষ তারিখ ${U.fmtDate(i.due)}</span></span><b>${U.money(i.amount)}</b></label>`).join('') || '<div class="text-sm text-slate-400">কোনো বকেয়া বিল নেই।</div>'}</div>
        <div id="ip-custom" class="grid sm:grid-cols-2 gap-3 hidden"><div><label class="label">ফি-এর বিবরণ</label><input class="input" name="item" value="বার্ষিক শিক্ষাবর্ষ ফি ${DB.session()}"></div><div><label class="label">মোট পরিমাণ (৳)</label><input type="number" min="100" class="input" name="custom" value="${DB.fees(st.classId).tuition * 3}"></div></div>
        <div class="grid sm:grid-cols-4 gap-3"><div><label class="label">কিস্তির ব্যবধান</label><select class="select" name="frequency"><option value="Monthly">${bn('Monthly')}</option><option value="Quarterly">${bn('Quarterly')}</option></select></div><div><label class="label">কিস্তির সংখ্যা</label><input type="number" min="2" max="12" class="input" name="count" value="3"></div><div><label class="label">প্রথম কিস্তির শেষ তারিখ</label><input type="date" class="input" name="start" value="${U.iso(U.addDays(new Date(), 7))}" min="${U.today()}"></div><div><label class="label">পরিকল্পনায় বৃত্তি %</label><input type="number" min="0" max="100" class="input" name="waive" value="0"></div></div>
        <div><label class="label">কারণ / অনুমোদন সংক্রান্ত মন্তব্য</label><input class="input" name="reason" required placeholder="যেমন: অভিভাবক চাকরি হারিয়েছেন — অধ্যক্ষ কর্তৃক অনুমোদিত"></div>
        <div id="ip-prev" class="card p-3 bg-slate-50 text-sm"></div>
        <button class="btn btn-primary w-full">${icon('calendar-clock')} পরিকল্পনা তৈরি করুন ও অভিভাবককে জানান</button></form>`,
    });
    const f = $('#ip-form');
    const read = () => {
      const d = formData(f), src = f.querySelector('[name=src]:checked').value;
      const ids = src === 'dues' ? $$('input[name=inv]:checked', f).map(x => x.value) : [];
      const gross = src === 'dues' ? U.sum(DB.s.invoices.filter(i => ids.includes(i.id)), i => i.amount) : +d.custom || 0;
      const waive = Math.round(gross * U.clamp(+d.waive || 0, 0, 100) / 100);
      return { ...d, src, ids, gross, waive, total: gross - waive, count: U.clamp(+d.count || 2, 2, 12) };
    };
    const prev = () => {
      const r = read();
      $('#ip-dues').classList.toggle('hidden', r.src !== 'dues'); $('#ip-custom').classList.toggle('hidden', r.src !== 'custom');
      $('#ip-prev').innerHTML = r.total > 0 ? `<div class="font-semibold mb-1">${bnNum(r.count)}টি ${bn(r.frequency)} কিস্তিতে ${U.money(r.total)}${r.waive ? ` (${U.money(r.waive)} মওকুফের পর)` : ''}</div><div class="flex flex-wrap gap-2">${this.schedule(r.total, r.count, r.frequency, r.start).map((x, k) => badge(`#${bnNum(k + 1)} ${U.fmtDate(x.due)} · ${U.money(x.amount)}`, 'violet')).join('')}</div>` : '<span class="text-slate-400">বিল নির্বাচন করুন অথবা পরিমাণ লিখুন।</span>';
    };
    f.addEventListener('input', prev); f.addEventListener('change', prev); prev();
    f.addEventListener('submit', e => {
      e.preventDefault(); const r = read();
      if (r.total <= 0) return toast('তফসিল করার মতো কিছু নেই।', 'error');
      const plan = { id: DB.id('IP'), studentId, title: r.src === 'dues' ? 'পুনঃতফসিলকৃত বকেয়া' : r.item, total: r.total, frequency: r.frequency, count: r.count, startDate: r.start, replacedInvoiceIds: r.ids, invoiceIds: [], reason: r.reason, waived: r.waive, createdBy: App.session.userId, createdAt: new Date().toISOString() };
      DB.s.invoices.filter(i => r.ids.includes(i.id)).forEach(i => i.status = 'rescheduled');
      const cp = DB.campusOf(st.classId);
      if (r.src === 'custom') DB.postJournal(`${r.item} বিল করা হয়েছে — ${pn(st)} (পরিকল্পনা ${plan.id})`, [{ acct: '1100', dr: r.gross, cr: 0 }, { acct: '4000', dr: 0, cr: r.gross }], plan.id, App.session.userId, null, { campusId: cp });
      if (r.waive) DB.postJournal(`পরিকল্পনা ${plan.id}-এ মওকুফ — ${pn(st)}`, [{ acct: '5200', dr: r.waive, cr: 0 }, { acct: '1100', dr: 0, cr: r.waive }], plan.id, App.session.userId, null, { campusId: cp });
      this.schedule(r.total, r.count, r.frequency, r.start).forEach((x, k) => { const inv = { id: DB.id('INV'), studentId, month: x.due.slice(0, 7), item: `কিস্তি ${bnNum(k + 1)}/${bnNum(r.count)} — ${plan.title}`, amount: x.amount, status: 'unpaid', due: x.due, kind: 'installment', planId: plan.id }; DB.s.invoices.push(inv); plan.invoiceIds.push(inv.id); });
      DB.s.installmentPlans.push(plan);
      DB.guardiansOf(studentId).forEach(g => DB.sms(g.phone, `${DB.s.school.shortName}: ${pn(st)}-এর জন্য একটি কিস্তি পরিকল্পনা চালু হয়েছে — ${U.fmtDate(r.start)} থেকে ${bnNum(r.count)}টি ${bn(r.frequency)} কিস্তিতে মোট ${U.money(r.total)}। প্রতিটি পরিশোধের শেষ তারিখের আগে আপনি এসএমএস স্মারক পাবেন।`));
      DB.audit('INSTALLMENT_PLAN', 'installment_plans', `${plan.id} — ${pn(st)} (${st.id}): ${U.money(r.total)} × ${bnNum(r.count)} ${bn(r.frequency)}`); DB.save();
      Modal.open({ title: 'কিস্তি পরিকল্পনা তৈরি হয়েছে', size: 'sm', body: `<p class="text-sm">${plan.id} · ${bnNum(plan.count)}টি কিস্তিতে ${U.money(plan.total)}।</p>`, footer: `<button class="btn btn-primary" onclick="Print.show('installment','${plan.id}')">${icon('printer')} কিস্তির তফসিল প্রিন্ট করুন</button>` });
      App.refresh();
    });
  },
  cancel(planId) {
    const p = DB.s.installmentPlans.find(x => x.id === planId), invs = DB.s.invoices.filter(i => p.invoiceIds.includes(i.id));
    if (invs.some(i => i.status === 'paid')) return toast('কিস্তি ইতোমধ্যে পরিশোধ করা হয়েছে — বাতিল করা যাবে না। এর পরিবর্তে জাবেদা ভাউচারের মাধ্যমে সমন্বয় করুন।', 'error');
    if (!confirm(`পরিকল্পনা ${p.id} বাতিল করবেন? মূল বিলগুলো পুনর্বহাল করা হবে।`)) return;
    invs.forEach(i => i.status = 'cancelled');
    DB.s.invoices.filter(i => p.replacedInvoiceIds.includes(i.id)).forEach(i => i.status = 'unpaid');
    p.cancelled = true; DB.audit('INSTALLMENT_CANCEL', 'installment_plans', p.id); DB.save(); App.refresh();
  },
  pickStudent() {
    Modal.open({ title: 'নতুন কিস্তি পরিকল্পনা', size: 'sm', body: `<form id="ips" class="space-y-3"><label class="label">শিক্ষার্থী</label>${studentPicker('q', '', { campus: DB.campusId(), required: true })}<button class="btn btn-primary w-full">পরবর্তী</button></form>` });
    $('#ips').addEventListener('submit', e => { e.preventDefault(); const q = formData(e.target).q.toLowerCase(); const st = DB.s.students.find(s => s.id.toLowerCase() === q) || DB.s.students.find(s => s.name.toLowerCase().includes(q)); st ? this.create(st.id) : toast('শিক্ষার্থী পাওয়া যায়নি।', 'error'); });
  },
};

const installmentPage = {
  id: 'installments', label: 'কিস্তি পরিকল্পনা', icon: 'calendar-clock',
  render() {
    const plans = DB.s.installmentPlans.filter(p => !p.cancelled && DB.campusOf(DB.student(p.studentId).classId) === DB.campusId());
    const today = U.today(), week = U.iso(U.addDays(new Date(), 7));
    const upcoming = DB.s.invoices.filter(i => i.status === 'unpaid' && i.due >= today && i.due <= week && DB.campusOf(DB.student(i.studentId)?.classId) === DB.campusId()).sort((a, b) => a.due.localeCompare(b.due));
    const overdueInst = DB.s.invoices.filter(i => i.kind === 'installment' && i.status === 'unpaid' && i.due < today);
    return pageHeader('কিস্তি ও নমনীয় ফি পরিকল্পনা', `স্বয়ংক্রিয় এসএমএস স্মারক: ${DB.s.featureFlags.autoReminders ? 'চালু' : 'বন্ধ'}`, `<button class="btn btn-ghost" onclick="Installments.runNow()">${icon('bell-ring')} এখনই বকেয়ার স্মারক পাঠান</button><button class="btn btn-primary" onclick="Installments.pickStudent()">${icon('plus')} নতুন পরিকল্পনা</button>`)
      + `<div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">${kpi('সক্রিয় পরিকল্পনা', bnNum(plans.length), esc(DB.campus().name), 'calendar-clock', 'violet')}${kpi('নির্ধারিত মোট অর্থ', U.money(U.sum(plans, p => p.total)), `${U.money(U.sum(plans, p => p.waived || 0))} মওকুফ`, 'wallet', 'blue')}${kpi('৭ দিনের মধ্যে প্রদেয়', bnNum(upcoming.length), U.money(U.sum(upcoming, i => i.amount)), 'alarm-clock', 'amber')}${kpi('মেয়াদোত্তীর্ণ কিস্তি', bnNum(overdueInst.length), U.money(U.sum(overdueInst, i => i.amount)), 'triangle-alert', 'red')}</div>
      <div class="grid xl:grid-cols-3 gap-5"><div class="card xl:col-span-2 scroll-x"><div class="px-5 py-3 border-b border-slate-100 font-semibold">পরিকল্পনাসমূহ</div><table class="table"><thead><tr><th>শিক্ষার্থী</th><th>পরিকল্পনা</th><th>অগ্রগতি</th><th>পরবর্তী প্রদেয়</th><th></th></tr></thead><tbody>
        ${plans.map(p => { const st = DB.student(p.studentId), invs = DB.s.invoices.filter(i => p.invoiceIds.includes(i.id)), paid = invs.filter(i => i.status === 'paid'), next = invs.find(i => i.status === 'unpaid');
          return `<tr><td><button class="font-semibold hover:underline" onclick="Dossier.open('${st.id}','fees')">${esc(pn(st))}</button><div class="text-xs text-slate-400">${esc(DB.className(st.classId))}</div></td><td class="text-xs">${esc(p.title)}<div class="text-slate-400">${U.money(p.total)} · ${bnNum(p.count)} × ${esc(bn(p.frequency))}</div></td><td class="w-40"><div class="text-xs mb-1">${bnNum(paid.length)}/${bnNum(invs.length)} পরিশোধিত</div>${progressBar(paid.length / invs.length * 100, 'bg-violet-500')}</td>
            <td class="text-xs">${next ? `<span class="${next.due < today ? 'text-red-600 font-semibold' : ''}">${U.fmtDate(next.due)} · ${U.money(next.amount)}</span>${next.remindedAt ? `<div class="text-slate-400">স্মারক পাঠানো হয়েছে ${U.fmtDate(next.remindedAt.slice(0, 10))}</div>` : ''}` : badge('সম্পন্ন', 'green')}</td>
            <td><div class="flex gap-1 justify-end"><button class="btn btn-ghost btn-sm" title="কিস্তির তফসিল প্রিন্ট করুন" onclick="Print.show('installment','${p.id}')">${icon('printer')}</button><button class="btn btn-ghost btn-sm text-red-600" title="পরিকল্পনা বাতিল করুন" onclick="Installments.cancel('${p.id}')">${icon('x')}</button></div></td></tr>`; }).join('')}</tbody></table>${plans.length ? '' : emptyState('এই ক্যাম্পাসে কোনো পরিকল্পনা নেই।')}</div>
        <div class="card"><div class="px-5 py-3 border-b border-slate-100 font-semibold">আগামী ৭ দিনের বকেয়া</div><div class="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">${upcoming.map(i => `<div class="px-5 py-2.5 text-sm"><div class="flex justify-between"><b>${esc(pn(DB.student(i.studentId)))}</b><span>${U.money(i.amount)}</span></div><div class="text-xs text-slate-500 flex justify-between"><span>${esc(i.item)} · ${U.fmtDate(i.due)}</span>${i.remindedAt ? badge('স্মারক পাঠানো হয়েছে', 'green') : badge('অপেক্ষমাণ', 'amber')}</div></div>`).join('') || emptyState('এই সপ্তাহে কোনো প্রদেয় নেই।')}</div></div></div>`;
  },
};
Installments.runNow = () => { const n = DB.runReminders(3, App.session); DB.save(); toast(n ? `${bnNum(n)}টি স্মারক এসএমএস পাঠানো হয়েছে।` : 'পাঠানোর মতো কোনো স্মারক নেই (প্রতিটি বিলের জন্য সর্বোচ্চ ৩ দিনে একবার স্মারক পাঠানো হয়)।', n ? 'success' : 'ok'); App.refresh(); };
App.addPage('admin', installmentPage, 'reconcile');
App.addPage('principal', installmentPage, 'accounts');
