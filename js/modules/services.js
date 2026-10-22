/* ==========================================================================
   ONLINE SERVICE DESK
   Students & guardians (logged in, or via the public site with identity
   check) request Leave, Scholarship, Installment plans and Certificates
   (TC, Testimonial, Character, Transcript) — paying online via MFS/card or
   at the counter. The Principal processes them from a queue; issued
   certificates are added to the public verification registry.
   ========================================================================== */

const SERVICE_TYPES = ['Leave', 'Scholarship', 'Installment Plan', 'Transfer Certificate', 'Testimonial', 'Character Certificate', 'Transcript Copy', 'ID Card Replacement'];
const CERT_PREFIX = { 'Transfer Certificate': 'TC', 'Testimonial': 'TST', 'Character Certificate': 'CC', 'Transcript Copy': 'TR' };
const SVC_STATUS_TONE = { Pending: 'amber', Approved: 'green', Rejected: 'red' };

const Services = {
  fee(type) { return SERVICE_FEES[type] || 0; },
  /** Request form; `ctx` = where it is rendered (modal | public). */
  form(studentId, ctx = 'modal') {
    const st = DB.student(studentId), t = App.ui.svcType || 'Testimonial';
    return `<form id="svc-form" class="space-y-3"><div class="text-sm text-slate-600">শিক্ষার্থী: <b>${esc(pn(st))}</b> · ${esc(DB.className(st.classId))} · রোল ${bnNum(st.roll)}</div>
      <div class="grid sm:grid-cols-2 gap-3"><div><label class="label">সেবা</label><select class="select" name="type" onchange="App.ui.svcType=this.value;Services.reform('${studentId}','${ctx}')">${SERVICE_TYPES.map(x => `<option value="${x}" ${x === t ? 'selected' : ''}>${bn(x)}</option>`).join('')}</select></div><div><label class="label">ফি</label><div class="input bg-slate-50 font-semibold">${this.fee(t) ? U.money(this.fee(t)) : 'বিনামূল্যে'}</div></div></div>
      ${t === 'Leave' ? `<div class="grid grid-cols-2 gap-3"><div><label class="label">হতে</label><input type="date" class="input" name="from" min="${U.today()}" required></div><div><label class="label">পর্যন্ত</label><input type="date" class="input" name="to" min="${U.today()}" required></div></div><div><label class="label">চিকিৎসা / সহায়ক কাগজপত্র (ঐচ্ছিক)</label><input type="file" name="attach" accept="image/*,application/pdf" class="input"></div><p class="text-xs text-slate-500">ছুটির আবেদন প্রথমে শ্রেণি শিক্ষকের কাছে, তারপর অধ্যক্ষের কাছে যায়।</p>` : ''}
      ${t === 'Scholarship' ? `<div><label class="label">প্রার্থিত মাসিক বেতন মওকুফ %</label><input type="number" min="10" max="100" step="5" class="input" name="pct" value="50" required></div>` : ''}
      ${t === 'Installment Plan' ? `<div class="grid grid-cols-2 gap-3"><div><label class="label">পছন্দের কিস্তির ব্যবধান</label><select class="select" name="frequency"><option value="Monthly">${bn('Monthly')}</option><option value="Quarterly">${bn('Quarterly')}</option></select></div><div><label class="label">কিস্তির সংখ্যা</label><input type="number" min="2" max="12" class="input" name="count" value="3"></div></div><p class="text-xs text-slate-500">বর্তমান বকেয়া: <b>${U.money(DB.dues(st.id))}</b></p>` : ''}
      <div><label class="label">${t === 'Leave' ? 'ছুটির কারণ' : 'বিস্তারিত / উদ্দেশ্য'}</label><textarea class="textarea" name="details" rows="3" required></textarea></div>
      ${this.fee(t) ? `<div><div class="label">পরিশোধ</div><div class="flex gap-4 text-sm"><label class="flex items-center gap-2"><input type="radio" name="mode" value="Online" checked> এখনই অনলাইনে পরিশোধ করুন (এমএফএস / কার্ড)</label><label class="flex items-center gap-2"><input type="radio" name="mode" value="Counter"> প্রতিষ্ঠানের কাউন্টারে পরিশোধ করুন</label></div></div>` : ''}
      <button class="btn btn-primary w-full">${icon('send')} ${this.fee(t) ? 'পরবর্তী' : 'আবেদন জমা দিন'}</button></form>`;
  },
  reform(studentId, ctx) { const host = $('#svc-host'); if (host) { host.innerHTML = this.form(studentId, ctx); App.icons(); this.bind(studentId); } },
  newRequest(studentId) {
    Modal.open({ title: 'নতুন সেবার আবেদন', size: 'md', body: `<div id="svc-host">${this.form(studentId)}</div>` });
    this.bind(studentId);
  },
  bind(studentId) {
    $('#svc-form').addEventListener('submit', async e => {
      e.preventDefault(); const f = formData(e.target), type = f.type || App.ui.svcType || 'Testimonial';
      const file = e.target.attach?.files?.[0]; let attachment = null;
      if (file) { try { attachment = { fileName: file.name, fileType: file.type === 'application/pdf' ? 'application/pdf' : 'image/jpeg', dataUrl: await readUpload(file, 1200) }; } catch (err) { return toast(err.message, 'error'); } }
      if (f.from && f.to < f.from) return toast('শেষের তারিখ শুরুর তারিখের আগে হয়েছে।', 'error');
      if (DB.s.serviceRequests.some(r => r.studentId === studentId && r.type === type && r.status === 'Pending')) return toast(`একটি ${bn(type)} আবেদন ইতোমধ্যে অপেক্ষমাণ রয়েছে।`, 'error');
      const draft = { studentId, type, details: f.details, from: f.from, to: f.to, pct: f.pct ? +f.pct : undefined, frequency: f.frequency, count: f.count ? +f.count : undefined, fee: this.fee(type), attachment };
      this._draft = draft;
      if (draft.fee && f.mode === 'Online') return Modal.open({ title: `${U.money(draft.fee)} পরিশোধ করুন — ${esc(bn(type))}`, size: 'lg', body: Pub.payPicker(draft.fee, null, 'Services.onPaid') });
      this.submit(draft, draft.fee ? { mode: 'Counter', method: null, trxId: null, verified: false, paid: false } : null);
    });
  },
  onPaid(method, txn, meta) { this.submit(this._draft, { mode: 'Online', method, trxId: txn, verified: meta.verified, msisdn: meta.msisdn, paid: true }); },
  submit(d, payment) {
    const st = DB.student(d.studentId);
    const r = { id: DB.id('SR'), type: d.type, studentId: d.studentId, requestedBy: App.session?.userId || 'PUBLIC', details: d.details, from: d.from, to: d.to, pct: d.pct, frequency: d.frequency, count: d.count, fee: d.fee, payment, attachment: d.attachment || null, status: 'Pending', createdAt: new Date().toISOString(), decidedAt: null, outcome: '' };
    // Multi-tier: student leave goes to the class teacher first (if the class has one), then the Principal.
    if (d.type === 'Leave') r.stage = DB.cls(st.classId)?.classTeacherId ? 'Class Teacher' : 'Principal';
    DB.s.serviceRequests.push(r);
    if (payment?.paid) DB.postJournal(`${bn(d.type)} ফি — ${pn(st)} (${r.id}), ${bn(payment.method)}-এর মাধ্যমে${payment.verified ? '' : ' (ট্রানজ্যাকশন আইডি যাচাই অপেক্ষমাণ)'}`, [{ acct: DB.mfsAccount(payment.method), dr: d.fee, cr: 0 }, { acct: '4300', dr: 0, cr: d.fee }], r.id, App.session?.userId, null, { kind: 'RV', campusId: DB.campusOf(st.classId), payee: st.name });
    DB.guardiansOf(st.id).forEach(g => DB.sms(g.phone, `${DB.s.school.shortName}: ${pn(st)}-এর ${bn(d.type)} আবেদন ${r.id} গৃহীত হয়েছে।${payment && !payment.paid ? ` অনুগ্রহ করে হিসাব কাউন্টারে ${U.money(d.fee)} পরিশোধ করুন।` : ''}`));
    DB.audit('SERVICE_REQUEST', 'service_requests', `${r.id} ${bn(d.type)} — ${pn(st)}${payment ? ` (${bn(payment.mode)}${payment.trxId ? ' ' + payment.trxId : ''})` : ''}`, App.session || { role: 'PUBLIC' }); DB.save();
    Modal.open({ title: 'আবেদন জমা হয়েছে', size: 'sm', body: `<div class="text-center"><div class="w-14 h-14 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">${icon('check', 'w-7 h-7')}</div><div class="text-sm text-slate-500 mt-3">আবেদন আইডি</div><div class="text-2xl font-mono font-extrabold">${r.id}</div><p class="text-sm text-slate-600 mt-2">${esc(bn(d.type))} · ${payment ? (payment.paid ? `${esc(bn(payment.method))}-এর মাধ্যমে ${U.money(d.fee)} পরিশোধিত` : `কাউন্টারে ${U.money(d.fee)} পরিশোধ করুন`) : 'কোনো ফি নেই'}</p></div>` });
    App.refresh();
  },

  /* ---------- processing (Principal) ---------- */
  row(r, compact) {
    const st = DB.student(r.studentId), isCT = r.stage === 'Class Teacher' && App.session?.role === 'TEACHER' && Teacher.me()?.id === DB.cls(st.classId)?.classTeacherId;
    const canDecide = r.status === 'Pending' && App.session?.role !== 'TEACHER' && (App.has('PRINCIPAL') || App.has('ADMIN'));
    const pay = r.payment ? (r.payment.paid ? `${badge(`পরিশোধিত ${U.money(r.fee)} · ${bn(r.payment.method)}`, r.payment.verified ? 'green' : 'amber')}${r.payment.trxId && r.payment.mode === 'Online' ? ` <span class="font-mono text-[10px] text-slate-400">${esc(r.payment.trxId)}</span>` : ''}` : badge(`অপরিশোধিত ${U.money(r.fee)} (কাউন্টার)`, 'red')) : '';
    const shownSt = r.status === 'Completed' ? 'Approved' : r.status;
    return `<div class="px-4 py-3 text-sm flex flex-wrap gap-3 items-start"><div class="w-40 shrink-0"><div class="font-semibold">${esc(bn(r.type))}</div><div class="text-xs text-slate-400 font-mono">${r.id} · ${U.fmtDate(r.createdAt.slice(0, 10))}</div></div>
      <div class="flex-1 min-w-[200px]">${compact ? '' : `<button class="font-semibold hover:underline" onclick="Dossier.open('${st.id}','services')">${esc(pn(st))}</button> <span class="text-xs text-slate-400">${esc(DB.className(st.classId))}</span><br>`}<span class="text-slate-600">${esc(r.details)}</span>${r.from ? `<div class="text-xs text-slate-500">${U.fmtDate(r.from)} → ${U.fmtDate(r.to)}</div>` : ''}${r.pct ? `<div class="text-xs text-slate-500">প্রার্থিত মওকুফ ${bnNum(r.pct)}%</div>` : ''}${r.count ? `<div class="text-xs text-slate-500">${bnNum(r.count)} × ${esc(bn(r.frequency))}</div>` : ''}${r.attachment ? `<button class="btn btn-ghost btn-sm mt-1" onclick="Dossier.viewDoc(DB.s.serviceRequests.find(x=>x.id==='${r.id}').attachment)">${icon('paperclip')} ${esc(r.attachment.fileName)}</button>` : ''}${r.stage && r.status === 'Pending' ? `<div class="text-xs mt-1">${badge(r.stage === 'Class Teacher' ? 'শ্রেণি শিক্ষকের অপেক্ষায়' : 'অধ্যক্ষের অপেক্ষায়', 'amber')}${r.recommendedBy ? ` <span class="text-slate-500">${esc(DB.teacherName(r.recommendedBy))} কর্তৃক সুপারিশকৃত${r.ctNote ? ': ' + esc(r.ctNote) : ''}</span>` : ''}</div>` : ''}<div class="mt-1">${pay}</div>${r.outcome ? `<div class="text-xs text-emerald-700 mt-1">${esc(r.outcome)}</div>` : ''}</div>
      <div class="flex flex-wrap gap-1 items-center">${badge(bn(shownSt), SVC_STATUS_TONE[shownSt] || 'slate')}${canDecide && r.payment && !r.payment.paid ? `<button class="btn btn-ghost btn-sm" onclick="Services.collect('${r.id}')">${icon('banknote')} ফি আদায় করুন</button>` : ''}${isCT ? `<button class="btn btn-success btn-sm" onclick="Services.recommend('${r.id}')">সুপারিশ করুন</button><button class="btn btn-ghost btn-sm text-red-600" onclick="Services.reject('${r.id}')">প্রত্যাখ্যান করুন</button>` : ''}${canDecide ? `<button class="btn btn-success btn-sm" onclick="Services.approve('${r.id}')">${r.stage === 'Class Teacher' ? 'অনুমোদন করুন (অগ্রাহ্য করে)' : 'অনুমোদন করুন'}</button><button class="btn btn-ghost btn-sm text-red-600" onclick="Services.reject('${r.id}')">প্রত্যাখ্যান করুন</button>` : ''}${r.certSerial ? `<button class="btn btn-ghost btn-sm" title="সনদ প্রিন্ট করুন" onclick="Print.show('certificate','${r.certSerial}')">${icon('printer')}</button>` : ''}</div></div>`;
  },
  recommend(id) {
    const r = DB.s.serviceRequests.find(x => x.id === id), note = prompt('অধ্যক্ষের জন্য মন্তব্য (ঐচ্ছিক):', '') ?? '';
    r.stage = 'Principal'; r.recommendedBy = Teacher.me().id; r.ctNote = note;
    DB.audit('LEAVE_RECOMMEND', 'service_requests', `${r.id} শ্রেণি শিক্ষক কর্তৃক সুপারিশকৃত`); DB.save(); toast('অধ্যক্ষের কাছে পাঠানো হয়েছে।', 'success'); this.rerender();
  },
  collect(id) {
    const r = DB.s.serviceRequests.find(x => x.id === id), st = DB.student(r.studentId);
    r.payment = { mode: 'Counter', method: 'Cash', trxId: `CASH-${Date.now().toString().slice(-6)}`, verified: true, paid: true };
    DB.postJournal(`${bn(r.type)} ফি কাউন্টারে আদায় — ${pn(st)} (${r.id})`, [{ acct: '1000', dr: r.fee, cr: 0 }, { acct: '4300', dr: 0, cr: r.fee }], r.id, App.session.userId, null, { kind: 'RV', campusId: DB.campusOf(st.classId), payee: st.name });
    DB.audit('SERVICE_FEE_COLLECT', 'service_requests', `${r.id} ${U.money(r.fee)} নগদ`); DB.save(); toast('ফি আদায় করা হয়েছে।', 'success'); this.rerender();
  },
  approve(id) {
    const r = DB.s.serviceRequests.find(x => x.id === id), st = DB.student(r.studentId), y = DB.session();
    if (r.payment && !r.payment.paid) return toast('আগে ফি আদায় করুন।', 'error');
    if (r.payment && r.payment.verified === false) return toast('ট্রানজ্যাকশন আইডি (TrxID) এখনো যাচাই করা হয়নি — আগে এমএফএস বিবরণী মিলিয়ে দেখুন।', 'error');
    if (r.type === 'Transfer Certificate' && DB.dues(st.id) > 0) return toast(`ছাড়পত্র (টিসি) স্থগিত: ${U.money(DB.dues(st.id))} বকেয়া রয়েছে।`, 'error');
    if (r.type === 'Leave') {
      let n = 0; for (let d = U.d(r.from); U.iso(d) <= r.to; d = U.addDays(d, 1)) if (U.isSchoolDay(d, null, DB.campusOf(st.classId))) { (DB.s.attendance[st.id] = DB.s.attendance[st.id] || {})[U.iso(d)] = 'E'; n++; }
      r.outcome = `${bnNum(n)}টি শিক্ষাদিবস অনুমোদিত ছুটি হিসেবে চিহ্নিত`;
    } else if (r.type === 'Scholarship') {
      const pct = +(prompt(`${pn(st)}-এর জন্য মাসিক বেতন মওকুফের % অনুমোদন করুন (প্রার্থিত ${bnNum(r.pct)}%):`, r.pct) || 0);
      if (!pct) return;
      st.scholarshipPct = pct;
      let waived = 0; DB.unpaid(st.id).filter(i => i.kind === 'tuition').forEach(i => { const cut = Math.round(i.amount * pct / 100); i.amount -= cut; waived += cut; i.item += ` (−${bnNum(pct)}% বৃত্তি)`; });
      if (waived) DB.postJournal(`বৃত্তি ${bnNum(pct)}% — ${pn(st)} (${r.id})`, [{ acct: '5200', dr: waived, cr: 0 }, { acct: '1100', dr: 0, cr: waived }], r.id, App.session.userId, null, { campusId: DB.campusOf(st.classId) });
      r.outcome = `${bnNum(pct)}% মাসিক বেতন মওকুফ মঞ্জুর · বকেয়া বিল থেকে ${U.money(waived)} মওকুফ করা হয়েছে`;
    } else if (r.type === 'Installment Plan') {
      r.status = 'Approved'; r.decidedAt = new Date().toISOString(); r.outcome = 'হিসাব শাখা কর্তৃক পরিকল্পনা তৈরি';
      DB.audit('SERVICE_APPROVE', 'service_requests', `${r.id} ${bn(r.type)}`); DB.save();
      return Installments.create(st.id);
    } else if (r.type === 'ID Card Replacement') {
      r.outcome = 'প্রতিস্থাপিত পরিচয়পত্র প্রিন্ট করা হয়েছে — অফিস থেকে সংগ্রহ করুন';
      setTimeout(() => Print.show('idCards', [st.id], 'h', 'student', 'প্রতিস্থাপিত পরিচয়পত্র'), 50);
    } else {
      const serial = `${CERT_PREFIX[r.type]}-${y}-${String(DB.s.certificates.length + 101).padStart(5, '0')}`;
      DB.s.certificates.push({ serial, type: r.type, studentName: st.name, studentNameBn: st.nameBn || '', fatherName: st.fatherName || DB.guardiansOf(st.id)[0]?.name || '—', fatherNameBn: st.fatherNameBn || '', classLeft: DB.className(st.classId), roll: st.roll, issueDate: U.today(), reason: r.details, conduct: DB.s.incidents.some(i => i.studentId === st.id && i.type === 'Disciplinary') ? 'Good' : 'Excellent', duesCleared: DB.dues(st.id) === 0, studentId: st.id });
      r.certSerial = serial; r.outcome = `${serial} ইস্যু করা হয়েছে — পাবলিক পোর্টালে যাচাইযোগ্য`;
      if (r.type === 'Transfer Certificate') { st.status = 'transferred'; st.leftOn = U.today(); }
    }
    r.status = 'Completed'; r.decidedAt = new Date().toISOString(); r.decidedBy = App.session.userId;
    DB.guardiansOf(st.id).forEach(g => DB.sms(g.phone, `${DB.s.school.shortName}: ${pn(st)}-এর জন্য আপনার ${bn(r.type)} আবেদন ${r.id} অনুমোদিত হয়েছে। ${r.outcome}।`));
    DB.audit('SERVICE_APPROVE', 'service_requests', `${r.id} ${bn(r.type)} — ${pn(st)}: ${r.outcome}`); DB.save();
    toast(`${bn(r.type)} অনুমোদিত হয়েছে।`, 'success'); this.rerender();
  },
  reject(id) {
    const r = DB.s.serviceRequests.find(x => x.id === id), why = prompt('প্রত্যাখ্যানের কারণ (অভিভাবককে পাঠানো হবে):'); if (!why) return;
    r.status = 'Rejected'; r.outcome = why; r.decidedAt = new Date().toISOString();
    if (r.payment?.paid) { DB.postJournal(`ফি ফেরত — প্রত্যাখ্যাত ${bn(r.type)} ${r.id}`, [{ acct: '4300', dr: r.fee, cr: 0 }, { acct: DB.mfsAccount(r.payment.method), dr: 0, cr: r.fee }], r.id, App.session.userId, null, { kind: 'PV' }); r.outcome += ' · ফি ফেরত দেওয়া হয়েছে'; }
    DB.guardiansOf(r.studentId).forEach(g => DB.sms(g.phone, `${DB.s.school.shortName}: ${bn(r.type)} আবেদন ${r.id} অনুমোদিত হয়নি: ${why}`));
    DB.audit('SERVICE_REJECT', 'service_requests', `${r.id}: ${why}`); DB.save(); this.rerender();
  },
  rerender() { if ($('#dossier')) Dossier.render(); else App.refresh(); },
  list(filterFn) { return DB.s.serviceRequests.filter(filterFn).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); },
};

/* ---------- Principal queue ---------- */
App.addPage('principal', {
  id: 'services', label: 'সেবার আবেদন', icon: 'concierge-bell', count: () => DB.s.serviceRequests.filter(r => r.status === 'Pending' && DB.campusOf(DB.student(r.studentId).classId) === DB.campusId()).length || '',
  render() {
    const f = App.ui.svcF || 'Pending', ty = App.ui.svcT || 'All';
    const list = Services.list(r => DB.campusOf(DB.student(r.studentId).classId) === DB.campusId() && (f === 'All' || (f === 'Pending' ? r.status === 'Pending' : r.status !== 'Pending')) && (ty === 'All' || r.type === ty));
    const fl = { Pending: 'অপেক্ষমাণ', Decided: 'নিষ্পন্ন', All: 'সকল' };
    return pageHeader('অনলাইন সেবা ডেস্ক — আবেদনসমূহ', '')
      + `<div class="flex flex-wrap gap-2 mb-4">${['Pending', 'Decided', 'All'].map(s => `<button class="btn btn-sm ${s === f ? 'btn-primary' : 'btn-ghost'}" onclick="App.ui.svcF='${s}';App.refresh()">${fl[s]}</button>`).join('')}<select class="select !w-auto !py-1 ml-auto" onchange="App.ui.svcT=this.value;App.refresh()"><option value="All">সকল</option>${SERVICE_TYPES.map(t => `<option value="${t}" ${t === ty ? 'selected' : ''}>${bn(t)}</option>`).join('')}</select></div>
      <div class="card divide-y divide-slate-100">${list.map(r => Services.row(r)).join('') || emptyState('কোনো আবেদন নেই।')}</div>`;
  },
}, 'admissions');

/* ---------- Student & guardian desks ---------- */
const svcPage = (who) => ({
  id: 'services', label: 'অনলাইন সেবা', icon: 'concierge-bell',
  render() {
    const st = who === 'student' ? Student.me() : Guardian.child(); if (!st) return emptyState('কোনো শিক্ষার্থী সংযুক্ত নেই।');
    const list = Services.list(r => r.studentId === st.id);
    return pageHeader('অনলাইন সেবা ডেস্ক', '',`<button class="btn btn-primary" onclick="Services.newRequest('${st.id}')">${icon('plus')} নতুন আবেদন</button>`)
      + (who === 'guardian' ? Guardian.switcher() : '')
      + `<div class="grid sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-5">${SERVICE_TYPES.map(t => `<button class="card p-4 text-left hover:border-brand-400" onclick="App.ui.svcType='${t}';Services.newRequest('${st.id}')"><div class="font-semibold text-sm">${bn(t)}</div><div class="text-xs text-slate-500">${Services.fee(t) ? U.money(Services.fee(t)) : 'বিনামূল্যে'}</div></button>`).join('')}</div>
      <div class="card"><div class="px-4 py-3 border-b border-slate-100 font-semibold">আমার আবেদনসমূহ</div><div class="divide-y divide-slate-100">${list.map(r => Services.row(r, true)).join('') || emptyState('এখনো কোনো আবেদন নেই।')}</div></div>`;
  },
});
App.addPage('student', svcPage('student'));
App.addPage('guardian', svcPage('guardian'), 'fees');

/* ---------- Public desk (identity-checked, no login) ---------- */
App.addPage('public', {
  id: 'services', label: 'অনলাইন সেবা', icon: 'concierge-bell',
  render() {
    const sid = App.ui.pubSvc;
    const st = sid ? DB.student(sid) : null;
    const track = App.ui.svcTrack ? DB.s.serviceRequests.find(r => r.id.toUpperCase() === App.ui.svcTrack.toUpperCase()) : null;
    return Pub.wrap(Pub.hero('অনলাইন সেবা ডেস্ক', 'ছুটি, বৃত্তি, কিস্তি পরিকল্পনা ও সনদের (ছাড়পত্র, প্রশংসাপত্র, চারিত্রিক সনদ, ট্রান্সক্রিপ্ট) জন্য আবেদন করুন — অনলাইনে অথবা কাউন্টারে পরিশোধ করুন।') + `<section class="max-w-4xl mx-auto px-4 py-10 space-y-5">
      ${st ? `<div class="card p-5"><div class="flex items-center gap-3 mb-4">${avatar(st, 40)}<div class="flex-1"><b>${esc(pn(st))}</b><div class="text-xs text-slate-500">পরিচয় যাচাইকৃত</div></div><button class="btn btn-ghost btn-sm" onclick="App.ui.pubSvc=null;App.refresh()">লগআউট</button></div><div id="svc-host">${Services.form(st.id, 'public')}</div></div>
        <div class="card"><div class="px-4 py-3 border-b border-slate-100 font-semibold">${esc(pn(st).split(' ')[0])}-এর আবেদনসমূহ</div><div class="divide-y divide-slate-100">${Services.list(r => r.studentId === st.id).map(r => Services.row(r, true)).join('') || emptyState('এখনো কিছু নেই।')}</div></div>`
        : `<form id="pub-id" class="card p-5 grid sm:grid-cols-4 gap-3 items-end"><div class="sm:col-span-4 font-semibold">পরিচয় যাচাই করুন</div><div><label class="label">শিক্ষার্থী আইডি</label><input class="input" name="sid" required></div><div><label class="label">নিবন্ধন নম্বর</label><input class="input" name="reg" required></div><div><label class="label">অভিভাবকের মোবাইল</label><input class="input" name="phone" required pattern="01[3-9][0-9]{8}"></div><button class="btn btn-primary">${icon('shield-check')} পরবর্তী</button></form>`}
      <form id="svc-track" class="card p-5 flex flex-col sm:flex-row gap-3"><input class="input" name="id" placeholder="আবেদনের অবস্থা দেখুন — যেমন SR0123" value="${esc(App.ui.svcTrack || '')}" required><button class="btn btn-ghost">${icon('search')} অনুসরণ করুন</button></form>
      ${App.ui.svcTrack ? (track ? `<div class="card">${Services.row(track, true)}</div>` : `<div class="card p-4 text-sm text-red-600">${esc(App.ui.svcTrack)} নামে কোনো আবেদন নেই।</div>`) : ''}</section>`);
  },
  mount() {
    $('#pub-id')?.addEventListener('submit', e => {
      e.preventDefault(); const f = formData(e.target), st = DB.student(f.sid.toUpperCase());
      const ok = st && st.regNo === f.reg && DB.guardiansOf(st.id).some(g => g.phone === f.phone);
      DB.audit(ok ? 'PUBLIC_ID_OK' : 'PUBLIC_ID_FAIL', 'service_requests', `সেবা ডেস্কে পরিচয় যাচাই: ${f.sid}`, { role: 'PUBLIC' }); DB.save();
      if (!ok) return toast('প্রদত্ত তথ্য আমাদের রেকর্ডের সাথে মেলেনি।', 'error');
      App.ui.pubSvc = st.id; App.refresh();
    });
    if (App.ui.pubSvc) Services.bind(App.ui.pubSvc);
    $('#svc-track').addEventListener('submit', e => { e.preventDefault(); App.ui.svcTrack = formData(e.target).id.trim(); App.refresh(); });
  },
}, 'track');
App.portals.public.nav.splice(App.portals.public.nav.findIndex(n => n[0] === 'track') + 1, 0, ['services', 'সেবাসমূহ']);
