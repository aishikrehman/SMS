/* ==========================================================================
   360° STUDENT SINGLE-PROFILE DOSSIER (tabbed)
   Personal & documents · Digital ID · Fees & MFS logs · Attendance &
   achievements · Results · Leave & services · Admission & activity history
   ========================================================================== */

/** Display names for the stored (English) document kinds. */
const DOC_KIND_BN = { 'Birth Registration': 'জন্মনিবন্ধন সনদ', 'Father NID': 'পিতার জাতীয় পরিচয়পত্র', 'Mother NID': 'মাতার জাতীয় পরিচয়পত্র', 'Student Photo': 'শিক্ষার্থীর ছবি', 'Previous Marksheet': 'পূর্ববর্তী নম্বরপত্র' };
const docKindBn = k => DOC_KIND_BN[k] || bn(k);
/** Achievement levels: stored in English, shown in Bangla. */
const ACH_LEVEL_BN = { School: 'বিদ্যালয়', District: 'জেলা', Divisional: 'বিভাগীয়', National: 'জাতীয়', International: 'আন্তর্জাতিক' };
const INCIDENT_TONE = { Commendation: 'green', Disciplinary: 'red', Counselor: 'violet' };

const Dossier = {
  sid: null, tab: 'personal',
  TABS: [['personal', 'ব্যক্তিগত তথ্য ও নথি', 'user-round'], ['id', 'ডিজিটাল আইডি', 'id-card'], ['fees', 'ফি ও এমএফএস লেনদেন', 'wallet'], ['attendance', 'উপস্থিতি ও অর্জন', 'calendar-check'], ['results', 'ফলাফল ও ট্রান্সক্রিপ্ট', 'award'], ['services', 'ছুটি ও সেবা', 'concierge-bell'], ['history', 'ভর্তি ও কার্যক্রম', 'history']],

  open(studentId, tab = 'personal') {
    this.sid = studentId; this.tab = tab;
    const st = DB.student(studentId);
    if (!st) return toast('এই শিক্ষার্থীর নথি পাওয়া যায়নি।', 'error');
    DB.audit('DOSSIER_VIEW', 'students', `${pn(st)}-এর নথি দেখা হয়েছে (${st.id})`); DB.save();
    // In place (breadcrumb + back), never a pop-up.
    App.openDetail({ title: `৩৬০° নথি · ${pn(st)}`, actions: App.session?.role === 'STUDENT' || App.session?.role === 'GUARDIAN' ? '' : `<button class="btn btn-ghost btn-sm" onclick="Risk.summon('${st.id}')">${icon('message-square-warning')} অভিভাবককে তলব করুন</button>`, render: () => '<div id="dossier"></div>', mount: () => this.render() });
  },
  go(tab) { this.tab = tab; this.render(); },
  render() {
    const host = $('#dossier'); if (!host) return;
    const st = DB.student(this.sid);
    // the record may not be in this user's data (role filtering) or the student may have been removed
    if (!st) { host.innerHTML = emptyState('এই শিক্ষার্থীর নথি পাওয়া যায়নি — হয়তো রেকর্ডটি সরানো হয়েছে বা আপনার দেখার অনুমতি নেই।', 'folder-x'); App.icons(); return; }
    const c = DB.cls(st.classId) || { name: '—', campusId: DB.campusId() }, att = DB.attendanceStats(st.id), dues = DB.dues(st.id);
    host.innerHTML = `<div class="flex flex-wrap items-center gap-4 mb-4">${avatar(st, 64)}<div class="flex-1 min-w-0"><div class="font-bold text-xl">${esc(pn(st))}</div><div class="text-sm text-slate-500">${esc(DB.campus(c.campusId)?.name || '')} · ${esc(c.name)}${st.section ? '-' + esc(st.section) : ''} · রোল ${bnNum(st.roll)}</div><div class="text-xs text-slate-400 font-mono">${st.id} · নিবন্ধন ${esc(st.regNo || '—')}</div></div>
        <div class="flex flex-wrap gap-2">${badge(`উপস্থিতি ${bnNum(att.pct.toFixed(0))}%`, att.pct < DB.s.school.minAttendance ? 'red' : 'green')}${badge(`সিজিপিএ ${gpaFmt(DB.cgpa(st.id))}`, 'blue')}${badge(dues ? `বকেয়া ${U.money(dues)}` : 'কোনো বকেয়া নেই', dues ? 'red' : 'green')}${st.blood ? badge(`রক্তের গ্রুপ ${st.blood}`, 'red') : ''}${st.scholarshipPct ? badge(`বৃত্তি ${bnNum(st.scholarshipPct)}%`, 'violet') : ''}</div></div>
      ${pills(this.TABS, this.tab, id => `Dossier.go('${id}')`)}
      <div class="fade-in">${this[this.tab](st)}</div>`;
    App.icons();
    if (this.tab === 'personal') this.bindPersonal(st);
  },

  /* ---------- tab: personal & documents ---------- */
  personal(st) {
    const gs = DB.guardiansOf(st.id), docs = DB.s.documents.filter(d => d.studentId === st.id);
    const f = (k, l, extra = '') => `<div><label class="label">${l}</label><input class="input" name="${k}" value="${esc(st[k] || '')}" ${extra}></div>`;
    return `<div class="grid xl:grid-cols-5 gap-5"><form id="dos-personal" class="card p-4 xl:col-span-3 grid sm:grid-cols-2 gap-3">
        <div class="sm:col-span-2 text-xs font-bold uppercase tracking-wide text-slate-500">ব্যক্তিগত তথ্য</div>
        ${f('name', 'নাম (ইংরেজিতে)', 'required')}${f('nameBn', 'নাম (বাংলায়)')}${f('dob', 'জন্মতারিখ', 'type="date"')}${f('gender', 'লিঙ্গ')}${f('blood', 'রক্তের গ্রুপ')}
        ${f('birthRegNo', 'জন্মনিবন্ধন নম্বর', 'pattern="[0-9]{17}"')}${f('address', 'ঠিকানা')}
        ${f('fatherName', 'পিতার নাম (ইংরেজিতে)')}${f('fatherNameBn', 'পিতার নাম (বাংলায়)')}${f('fatherNid', 'পিতার জাতীয় পরিচয়পত্র নম্বর', 'pattern="[0-9]{10}|[0-9]{17}"')}${f('motherName', 'মাতার নাম (ইংরেজিতে)')}${f('motherNameBn', 'মাতার নাম (বাংলায়)')}${f('motherNid', 'মাতার জাতীয় পরিচয়পত্র নম্বর', 'pattern="[0-9]{10}|[0-9]{17}"')}
        ${f('emergency', 'জরুরি ফোন', 'pattern="01[3-9][0-9]{8}"')}${f('previousSchool', 'পূর্ববর্তী বিদ্যালয়')}
        <div><label class="label">উপদেষ্টা শিক্ষক</label><select class="select" name="advisorId"><option value="">— নির্ধারিত নয় —</option>${DB.s.teachers.filter(t => t.status !== 'Resigned').sort((a, b) => (a.campusId === DB.campusOf(st.classId) ? -1 : 1) - (b.campusId === DB.campusOf(st.classId) ? -1 : 1)).map(t => `<option value="${t.id}" ${t.id === st.advisorId ? 'selected' : ''}>${esc(DB.teacherName(t.id))}${t.campusId !== DB.campusOf(st.classId) ? ` (${esc(DB.campus(t.campusId)?.short || '')})` : ''}</option>`).join('')}</select></div>
        <div class="sm:col-span-2"><label class="label">স্বাস্থ্য ও অ্যালার্জি-সংক্রান্ত মন্তব্য</label><input class="input ${st.medical !== 'None' ? 'text-red-700 font-semibold' : ''}" name="medical" value="${esc(st.medical)}"></div>
        <div class="sm:col-span-2 flex flex-wrap items-center gap-3"><button class="btn btn-primary">${icon('save')} পরিবর্তন সংরক্ষণ করুন</button><span class="text-xs text-slate-500">অভিভাবকগণ: ${gs.map(g => `${esc(pn(g))} (${esc(bn(g.relation))}) <a class="text-brand-600" href="tel:${g.phone}">${g.phone}</a>`).join(' · ')}</span></div></form>
      <div class="card xl:col-span-2"><div class="px-4 py-3 border-b border-slate-100 font-semibold flex items-center gap-2">${icon('folder-lock', 'w-4 h-4 text-brand-600')} নথি ভান্ডার <span class="text-xs text-slate-400 font-normal ml-auto">${bnNum(docs.length)}টি ফাইল</span></div>
        <div class="divide-y divide-slate-100">${DOC_KINDS.map(k => { const d = docs.find(x => x.kind === k); return `<div class="px-4 py-3 flex items-center gap-3 text-sm">${icon(d ? 'file-check-2' : 'file-x-2', `w-5 h-5 ${d ? (d.verified ? 'text-emerald-600' : 'text-amber-500') : 'text-slate-300'}`)}<div class="flex-1 min-w-0"><div class="font-semibold">${docKindBn(k)}</div><div class="text-xs text-slate-400 truncate">${d ? `${esc(d.fileName)} · ${U.fmtDate(d.uploadedAt.slice(0, 10))}` : 'আপলোড করা হয়নি'}</div></div>
          ${d ? `${d.verified ? badge('যাচাইকৃত', 'green') : `<button class="btn btn-ghost btn-sm" onclick="Dossier.verifyDoc('${d.id}')">যাচাই করুন</button>`}<button class="btn btn-ghost btn-sm" title="দেখুন" onclick="Dossier.viewDoc(DB.s.documents.find(x=>x.id==='${d.id}'))">${icon('eye')}</button>` : ''}
          <label class="btn btn-ghost btn-sm cursor-pointer" title="আপলোড">${icon('upload')}<input type="file" accept="image/*,application/pdf" class="hidden" onchange="Dossier.upload('${st.id}','${k}',this.files[0])"></label></div>`; }).join('')}</div></div></div>`;
  },
  bindPersonal(st) {
    $('#dos-personal').addEventListener('submit', e => {
      e.preventDefault(); const f = formData(e.target);
      Object.assign(st, f); const u = DB.user(st.userId); if (u) { u.name = f.name; u.nameBn = f.nameBn; }
      DB.audit('STUDENT_UPDATE', 'students', `${st.id} ব্যক্তিগত তথ্য আপডেট করা হয়েছে`); DB.save();
      toast('শিক্ষার্থীর তথ্য সংরক্ষিত হয়েছে।', 'success'); this.render();
    });
  },
  async upload(studentId, kind, file) {
    if (!file) return;
    try {
      const dataUrl = await readUpload(file, 1100);
      DB.s.documents = DB.s.documents.filter(d => !(d.studentId === studentId && d.kind === kind));
      DB.s.documents.push({ id: DB.id('DOC'), studentId, kind, fileName: file.name, fileType: file.type === 'application/pdf' ? 'application/pdf' : 'image/jpeg', dataUrl, uploadedAt: new Date().toISOString(), by: App.session.userId, verified: false });
      if (kind === 'Student Photo' && file.type !== 'application/pdf') { const st = DB.student(studentId), u = DB.user(st.userId); st.photo = dataUrl; if (u) u.photo = dataUrl; }
      DB.audit('DOCUMENT_UPLOAD', 'documents', `${studentId}-এর ${docKindBn(kind)}`);
      if (!DB.save()) throw new Error('সংরক্ষণস্থান পূর্ণ — আরও ছোট ফাইল চেষ্টা করুন।');
      toast(`${docKindBn(kind)} আপলোড করা হয়েছে।`, 'success'); this.render();
    } catch (e) { toast(e.message, 'error'); }
  },
  verifyDoc(id) { const d = DB.s.documents.find(x => x.id === id); d.verified = true; d.verifiedBy = App.session.userId; DB.audit('DOCUMENT_VERIFY', 'documents', `${d.studentId}-এর ${docKindBn(d.kind)}`); DB.save(); this.render(); },
  /** Show a stored document (a record without a file says so). */
  viewDoc(d) {
    const src = d.dataUrl;
    // compact viewer (small pop-up, image fits the screen)
    const body = !src ? `<div class="text-center py-6">${icon('file-x', 'w-10 h-10 mx-auto text-slate-300 mb-2')}<p class="font-semibold">ফাইল নেই</p><p class="text-sm text-slate-500 mt-1">এই রেকর্ডের সঙ্গে কোনো ফাইল সংরক্ষিত নেই${d.fileName ? ` (${esc(d.fileName)})` : ''}। নতুন করে আপলোড করুন।</p></div>`
      : d.fileType === 'application/pdf' ?`<p class="text-sm mb-3">পিডিএফ নথি।</p><a class="btn btn-primary" href="${d.dataUrl}" target="_blank" rel="noopener">${icon('external-link')} পিডিএফ খুলুন</a>` : `<img src="${src}" class="w-full max-h-[55vh] object-contain rounded-lg border bg-slate-50" alt="${esc(docKindBn(d.kind))}">`;
    Modal.open({ title: esc(docKindBn(d.kind)), size: 'sm', popup: true, body, footer: `${d.dataUrl ? `<a class="btn btn-ghost btn-sm" href="${d.dataUrl}" download="${esc(d.fileName || d.kind)}">${icon('download')} ডাউনলোড</a>` : ''}<button class="btn btn-primary btn-sm" onclick="Modal.close()">বন্ধ করুন</button>` });
  },

  /* ---------- tab: digital ID ---------- */
  id(st) {
    return `<div class="grid lg:grid-cols-2 gap-6 items-start"><div>${Learner.idCard(st)}</div><div class="space-y-4"><div class="card p-4"><div class="label mb-2">CR80 মুদ্রণ প্রিভিউ</div><div class="flex flex-wrap gap-4"><div class="relative" style="width:85.6mm;height:53.98mm"><div class="cr80 h" style="left:0;top:0">${Print.cardH(st)}</div></div><div class="relative" style="width:53.98mm;height:85.6mm"><div class="cr80 v" style="left:0;top:0">${Print.cardV(st)}</div></div></div></div>
      <div class="flex flex-wrap gap-2"><button class="btn btn-primary" onclick="Print.show('idCards',['${st.id}'],'h')">${icon('printer')} আনুভূমিক মুদ্রণ</button><button class="btn btn-ghost" onclick="Print.show('idCards',['${st.id}'],'v')">${icon('printer')} উল্লম্ব মুদ্রণ</button><label class="btn btn-ghost cursor-pointer">${icon('camera')} ছবি পরিবর্তন করুন<input type="file" accept="image/*" class="hidden" onchange="Dossier.upload('${st.id}','Student Photo',this.files[0])"></label></div></div></div>`;
  },

  /* ---------- tab: fees & MFS logs ---------- */
  fees(st) {
    const inv = DB.invoices(st.id).sort((a, b) => b.due.localeCompare(a.due)), pays = DB.s.payments.filter(p => p.studentId === st.id).sort((a, b) => b.date.localeCompare(a.date));
    const plans = DB.s.installmentPlans.filter(p => p.studentId === st.id);
    const mask = m => m ? m.slice(0, 3) + '****' + m.slice(-3) : '—';
    return `<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">${kpi('বকেয়া', U.money(DB.dues(st.id)), `${bnNum(DB.unpaid(st.id).length)}টি বিল`, 'wallet', DB.dues(st.id) ? 'red' : 'green')}${kpi('এই শিক্ষাবর্ষে পরিশোধিত', U.money(U.sum(pays.filter(p => p.date.startsWith(DB.session())), p => p.amount)), `${bnNum(pays.length)}টি রসিদ`, 'receipt', 'blue')}${kpi('এমএফএস পরিশোধ', bnNum(pays.filter(p => MFS.includes(p.method)).length), `${bnNum(pays.filter(p => p.verified === false).length)}টি মিলিয়ে দেখার অপেক্ষায়`, 'smartphone', 'violet')}${kpi('বৃত্তি', bnNum(st.scholarshipPct || 0) + '%', plans.length ? `${bnNum(plans.length)}টি কিস্তি পরিকল্পনা` : 'কোনো কিস্তি পরিকল্পনা নেই', 'graduation-cap', 'amber')}</div>
      <div class="flex flex-wrap gap-2 mb-4"><button class="btn btn-primary btn-sm" onclick="Installments.create('${st.id}')">${icon('calendar-clock')} নতুন কিস্তি পরিকল্পনা</button><button class="btn btn-ghost btn-sm" onclick="Dossier.counter('${st.id}')">${icon('banknote')} কাউন্টারে পরিশোধ লিপিবদ্ধ করুন</button></div>
      ${plans.map(p => `<div class="card p-3 mb-3 bg-violet-50 border-violet-200 text-sm flex flex-wrap items-center gap-2">${icon('calendar-clock', 'w-4 h-4 text-violet-600')}<b>${esc(p.title)}</b> · ${U.money(p.total)} · ${bnNum(p.count)} × ${esc(bn(p.frequency))}<button class="btn btn-ghost btn-sm ml-auto" onclick="Print.show('installment','${p.id}')">${icon('printer')}</button></div>`).join('')}
      <div class="grid xl:grid-cols-2 gap-4"><div class="card scroll-x"><div class="px-4 py-3 border-b border-slate-100 font-semibold">বিলসমূহ</div><table class="table"><thead><tr><th>বিবরণ</th><th>পরিশোধের শেষ তারিখ</th><th class="text-right">পরিমাণ</th><th>অবস্থা</th></tr></thead><tbody>${inv.map(i => `<tr class="${i.status === 'rescheduled' ? 'opacity-50' : ''}"><td class="text-xs">${esc(i.item)}</td><td class="text-xs whitespace-nowrap">${U.fmtDate(i.due)}</td><td class="text-right">${U.money(i.amount)}</td><td>${i.status === 'rescheduled' ? badge('পুনঃনির্ধারিত', 'violet') : badge(bn(i.status), { paid: 'green', unpaid: 'red', partial: 'amber' }[i.status] || 'slate')}</td></tr>`).join('')}</tbody></table></div>
        <div class="card scroll-x"><div class="px-4 py-3 border-b border-slate-100 font-semibold">পরিশোধ ও এমএফএস লেনদেনের লগ</div><table class="table"><thead><tr><th>তারিখ</th><th>মাধ্যম</th><th>ট্রানজ্যাকশন আইডি (TrxID)</th><th>ওয়ালেট</th><th class="text-right">পরিমাণ</th><th>অবস্থা</th><th></th></tr></thead><tbody>${pays.map(p => `<tr><td class="text-xs whitespace-nowrap">${U.fmtDate(p.date)}</td><td class="text-xs">${esc(bn(p.method))}<div class="text-[10px] text-slate-400">${esc(bn(p.channel || ''))}</div></td><td class="font-mono text-xs">${esc(p.txn)}</td><td class="font-mono text-xs">${mask(p.msisdn)}</td><td class="text-right">${U.money(p.amount)}</td><td>${p.verified === false ? badge('অযাচাইকৃত', 'amber') : p.reconciled ? badge('মিলিয়ে দেখা হয়েছে', 'green') : badge('ঠিক আছে', 'slate')}</td><td><button class="btn btn-ghost btn-sm" onclick="Print.show('receipt','${p.id}')">${icon('receipt')}</button></td></tr>`).join('')}</tbody></table></div></div>`;
  },
  counter(studentId) {
    const invs = DB.unpaid(studentId);
    if (!invs.length) return toast('কোনো বকেয়া নেই।', 'warn');
    Modal.open({
      title: 'কাউন্টারে পরিশোধ লিপিবদ্ধ করুন', size: 'md',
      body: `<form id="ctr" class="space-y-3"><div class="space-y-1 max-h-60 overflow-y-auto">${invs.map(i => `<label class="flex items-center gap-2 text-sm"><input type="checkbox" name="inv" value="${i.id}" ${i.due <= U.today() ? 'checked' : ''}><span class="flex-1">${esc(i.item)} <span class="text-xs text-slate-400">পরিশোধের শেষ তারিখ ${U.fmtDate(i.due)}</span></span><b>${U.money(i.amount)}</b></label>`).join('')}</div>
        <div class="grid grid-cols-2 gap-3"><div><label class="label">মাধ্যম</label><select class="select" name="method">${['Cash', 'Bank', ...MFS].map(m => `<option value="${m}">${bn(m)}</option>`).join('')}</select></div><div><label class="label">ট্রানজ্যাকশন আইডি (TrxID) / স্লিপ নং</label><input class="input font-mono uppercase" name="trx" placeholder="নগদ অর্থের ক্ষেত্রে ঐচ্ছিক"></div></div>
        <button class="btn btn-success w-full">${icon('check')} পরিশোধ লিপিবদ্ধ করুন</button></form>`,
    });
    $('#ctr').addEventListener('submit', e => {
      e.preventDefault(); const f = formData(e.target), ids = $$('input[name=inv]:checked', e.target).map(x => x.value);
      if (!ids.length) return toast('অন্তত একটি বিল নির্বাচন করুন।', 'error');
      if (MFS.includes(f.method) && !/^[A-Z0-9]{8,10}$/i.test(f.trx)) return toast('৮–১০ অক্ষরের এমএফএস ট্রানজ্যাকশন আইডি (TrxID) লিখুন।', 'error');
      if (f.trx && DB.trxIdUsed(f.trx)) return toast('এই ট্রানজ্যাকশন আইডি (TrxID) ইতোমধ্যে ব্যবহৃত হয়েছে।', 'error');
      const pay = DB.recordPayment(studentId, ids, f.method, App.session.userId, { trxId: f.trx ? f.trx.toUpperCase() : undefined, channel: 'Counter', verified: !MFS.includes(f.method) });
      DB.audit('COUNTER_PAYMENT', 'payments', `${pay.id} ${U.money(pay.amount)} — ${bn(pay.method)}`); DB.save();
      toast(`রসিদ ${pay.id} লিপিবদ্ধ হয়েছে।`, 'success'); this.open(studentId, 'fees');
    });
  },

  /* ---------- tab: attendance & achievements ---------- */
  attendance(st) {
    const att = DB.attendanceStats(st.id), ach = DB.s.achievements.filter(a => a.studentId === st.id).sort((a, b) => b.date.localeCompare(a.date));
    const comm = DB.s.incidents.filter(i => i.studentId === st.id).sort((a, b) => b.date.localeCompare(a.date));
    return `<div class="grid lg:grid-cols-3 gap-5"><div class="space-y-4"><div class="card p-4"><div class="font-semibold mb-2">উপস্থিতি (${bnNum(att.days)} কর্মদিবস)</div><div class="flex flex-wrap gap-2 text-sm">${badge(`উপস্থিত ${bnNum(att.P)}`, 'green')}${badge(`অনুপস্থিত ${bnNum(att.A)}`, 'red')}${badge(`বিলম্ব ${bnNum(att.L)}`, 'amber')}${badge(`অনুমোদিত ছুটি ${bnNum(att.E)}`, 'violet')}</div><div class="mt-3">${progressBar(att.pct)}</div></div>${Learner.calendar(st, App.ui.calMonth).replace(/App\.refresh\(\)/g, 'Dossier.render()')}</div>
      <div class="lg:col-span-2 space-y-4"><div class="card"><div class="px-4 py-3 border-b border-slate-100 font-semibold flex items-center">অর্জনসমূহ <button class="btn btn-ghost btn-sm ml-auto" onclick="Dossier.addAchievement('${st.id}')">${icon('plus')} যোগ করুন</button></div><div class="divide-y divide-slate-100">${ach.map(a => `<div class="px-4 py-3 flex items-center gap-3 text-sm">${icon('trophy', 'w-5 h-5 text-amber-500')}<div class="flex-1"><b>${esc(a.title)}</b><div class="text-xs text-slate-400">${U.fmtDate(a.date)}</div></div>${badge(ACH_LEVEL_BN[a.level] || a.level, 'blue')}</div>`).join('') || emptyState('এখনো কোনো অর্জন নেই।', 'trophy')}</div></div>
        <div class="card"><div class="px-4 py-3 border-b border-slate-100 font-semibold">আচরণ ও কাউন্সেলিং লগ</div><div class="divide-y divide-slate-100">${comm.map(i => `<div class="px-4 py-3 text-sm flex gap-3"><div class="w-28 shrink-0">${badge(bn(i.type), INCIDENT_TONE[i.type] || 'slate')}<div class="text-xs text-slate-400 mt-1">${U.fmtDate(i.date)}</div></div><div>${esc(i.note)}<div class="text-xs text-slate-400">${esc(pn(DB.user(i.by)) || '—')} কর্তৃক</div></div></div>`).join('') || emptyState('কোনো রেকর্ড নেই।', 'smile')}</div></div></div></div>`;
  },
  addAchievement(studentId) {
    const title = prompt('অর্জন (যেমন: "জেলা বিজ্ঞান অলিম্পিয়াড — ১ম"):'); if (!title) return;
    const typed = (prompt('স্তর (বিদ্যালয় / জেলা / বিভাগীয় / জাতীয় / আন্তর্জাতিক):', 'বিদ্যালয়') || 'বিদ্যালয়').trim();
    const level = Object.keys(ACH_LEVEL_BN).find(k => k.toLowerCase() === typed.toLowerCase() || ACH_LEVEL_BN[k] === typed) || typed;
    DB.s.achievements.push({ id: DB.id('ACH'), studentId, title, level, date: U.today() });
    DB.audit('ACHIEVEMENT_ADD', 'achievements', `${studentId}: ${title}`); DB.save(); this.render();
  },

  /* ---------- tab: results ---------- */
  results(st) { return Learner.transcript(st); },

  /* ---------- tab: leave & services ---------- */
  services(st) {
    const reqs = DB.s.serviceRequests.filter(r => r.studentId === st.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const excused = Object.entries(DB.s.attendance[st.id] || {}).filter(([, v]) => v === 'E').map(([d]) => d).sort().reverse();
    return `<div class="grid lg:grid-cols-3 gap-5"><div class="lg:col-span-2 card"><div class="px-4 py-3 border-b border-slate-100 font-semibold flex items-center">সেবা ও ছুটির আবেদন <button class="btn btn-ghost btn-sm ml-auto" onclick="Services.newRequest('${st.id}')">${icon('plus')} নতুন আবেদন</button></div><div class="divide-y divide-slate-100">${reqs.map(r => Services.row(r, true)).join('') || emptyState('কোনো আবেদন নেই।')}</div></div>
      <div class="card"><div class="px-4 py-3 border-b border-slate-100 font-semibold">অনুমোদিত ছুটির দিন (${bnNum(excused.length)})</div><div class="p-4 flex flex-wrap gap-1.5">${excused.map(d => badge(U.fmtDate(d), 'violet')).join('') || '<span class="text-sm text-slate-400">নেই</span>'}</div></div></div>`;
  },

  /* ---------- tab: admission & activity history ---------- */
  history(st) {
    const app = DB.s.admissions.find(a => a.studentId === st.id || a.id === st.admissionRef);
    const ev = [];
    ev.push({ ts: st.admissionDate, ic: 'log-in', t: `${DB.className(st.classId)}-এ ভর্তিকৃত`, d: app ? `আবেদন ${app.id}${app.payment?.method ? ` · ${bn(app.payment.method)} ${U.money(app.netPaid)}` : ''}` : `পূর্ববর্তী বিদ্যালয়: ${st.previousSchool}` });
    DB.s.documents.filter(d => d.studentId === st.id).forEach(d => ev.push({ ts: d.uploadedAt, ic: 'file-up', t: `${docKindBn(d.kind)} আপলোড করা হয়েছে`, d: d.verified ? 'যাচাইকৃত' : 'যাচাইয়ের অপেক্ষায়' }));
    DB.s.payments.filter(p => p.studentId === st.id).slice(-8).forEach(p => ev.push({ ts: p.date, ic: 'receipt', t: `${bn(p.method)}-এর মাধ্যমে ${U.money(p.amount)} পরিশোধ`, d: `${p.id} · ট্রানজ্যাকশন আইডি (TrxID) ${p.txn}` }));
    DB.s.incidents.filter(i => i.studentId === st.id).forEach(i => ev.push({ ts: i.date, ic: 'clipboard-pen', t: bn(i.type), d: i.note }));
    DB.s.serviceRequests.filter(r => r.studentId === st.id).forEach(r => ev.push({ ts: r.createdAt, ic: 'concierge-bell', t: `${bn(r.type)} আবেদন — ${bn(r.status)}`, d: r.details }));
    DB.s.installmentPlans.filter(p => p.studentId === st.id).forEach(p => ev.push({ ts: p.createdAt, ic: 'calendar-clock', t: `কিস্তি পরিকল্পনা ${p.id}`, d: `${bnNum(p.count)}টি ${bn(p.frequency)} কিস্তিতে ${U.money(p.total)}` }));
    DB.s.audit.filter(a => a.detail.includes(st.id) && !['DOSSIER_VIEW'].includes(a.action)).forEach(a => ev.push({ ts: a.ts, ic: 'shield', t: a.action, d: a.detail }));
    ev.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    const views = DB.s.audit.filter(a => a.action === 'DOSSIER_VIEW' && a.detail.includes(st.id)).length;
    return `${app ? `<div class="card p-4 mb-4 text-sm grid sm:grid-cols-4 gap-3"><div><div class="label">আবেদন</div><b>${app.id}</b></div><div><div class="label">জমার তারিখ</div>${U.fmtDate(app.submittedAt)}</div><div><div class="label">কুপন</div>${esc(app.coupon || '—')}</div><div><div class="label">সিদ্ধান্ত</div>${badge(bn(app.status), { Pending: 'amber', Approved: 'green', Declined: 'red' }[app.status] || 'slate')}</div></div>` : ''}
      <div class="text-xs text-slate-400 mb-2">অডিট লগে ${bnNum(views)} বার নথি দেখার তথ্য লিপিবদ্ধ রয়েছে।</div>
      <ol class="relative border-l-2 border-slate-200 ml-3 space-y-4">${ev.slice(0, 60).map(e => `<li class="ml-5"><span class="absolute -left-[13px] w-6 h-6 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center text-brand-600">${icon(e.ic, 'w-3 h-3')}</span><div class="text-sm font-semibold">${esc(e.t)}</div><div class="text-xs text-slate-500">${String(e.ts).length > 10 ? U.fmtTime(e.ts) : U.fmtDate(e.ts)} · ${esc(e.d || '')}</div></li>`).join('')}</ol>`;
  },
};

/* ---------- Role-aware extensions: inline "My Profile", read-only for students & guardians,
   attendance heatmap, GPA trend, report downloads, counsellor notes, fee changes ---------- */
(() => {
  const base = { render: Dossier.render, fees: Dossier.fees, attendance: Dossier.attendance, results: Dossier.results, history: Dossier.history };
  Object.assign(Dossier, {
    ro() { return ['STUDENT', 'GUARDIAN'].includes(App.session?.role); },
    staff() { return !this.ro(); },
    /** Inline host for portal pages; call Dossier.render() from mount. */
    inline(studentId) { if (this.sid !== studentId) this.tab = 'personal'; this.sid = studentId; return '<div id="dossier"></div>'; },
    counter(studentId) { Fees.collect(studentId); },
    render() {
      base.render.call(this);
      const host = $('#dossier'); if (!host) return;
      if (this.ro()) {
        $$('#dos-personal input').forEach(i => i.disabled = true); $('#dos-personal button')?.remove();
        $$('#dossier button').filter(b => /Installments\.create|Dossier\.counter|Dossier\.verifyDoc|addAchievement|Fees\.adjust|counsel/.test(b.getAttribute('onclick') || '')).forEach(b => b.remove());
        if (App.session.role === 'STUDENT') $$('#dossier label.btn').forEach(l => l.remove());
      }
    },
    fees(st) {
      const unpaid = DB.unpaid(st.id), canAdj = this.staff() && App.perm('fees', 'edit');
      return base.fees.call(this, st) + (canAdj && unpaid.length ? `<div class="card mt-4 scroll-x"><div class="px-4 py-3 border-b border-slate-100 font-semibold">ফি পরিবর্তন / ছাড় <span class="text-xs text-slate-400 font-normal">প্রতিটি পরিবর্তন কারণসহ লিপিবদ্ধ হয় এবং লেজারে অন্তর্ভুক্ত হয়</span></div><table class="table"><tbody>${unpaid.map(i => `<tr><td class="text-sm">${esc(i.item)}${(i.adjustments || []).length ? ` <span class="text-xs text-slate-400">(${bnNum(i.adjustments.length)} বার পরিবর্তিত)</span>` : ''}</td><td class="text-xs">পরিশোধের শেষ তারিখ ${U.fmtDate(i.due)}</td><td class="text-right font-semibold">${U.money(i.amount)}</td><td class="text-right"><button class="btn btn-ghost btn-sm" onclick="Fees.adjust('${i.id}')">${icon('badge-percent')} ফি পরিবর্তন</button></td></tr>`).join('')}</tbody></table></div>` : '');
    },
    attendance(st) {
      return (typeof AttendanceUI !== 'undefined' ? `<div class="card p-4 mb-4 scroll-x"><div class="font-semibold mb-2">উপস্থিতির তাপচিত্র — শিক্ষাবর্ষ ${esc(U.bn(DB.session()))}</div>${AttendanceUI.heatmap(st.id)}</div>` : '')
        + base.attendance.call(this, st)
        + (typeof AttendanceUI !== 'undefined' ? `<div class="card p-4 mt-4"><div class="font-semibold mb-2">প্রবেশদ্বারে প্রবেশ / প্রস্থান (আরএফআইডি ও বায়োমেট্রিক)</div>${AttendanceUI.gateLog(st.id, 14)}</div>` : '');
    },
    results(st) {
      const ex = DB.s.exams.filter(e => e.published).sort((a, b) => a.start.localeCompare(b.start)).map(e => ({ e, r: DB.result(st.id, e.id) })).filter(x => x.r.rows.length);
      const max = Math.max(...ex.map(x => x.r.gpa ?? x.r.pct / 20), 5);
      const bars = `<div class="flex items-end gap-3 h-36">${ex.map(x => { const v = x.r.gpa ?? x.r.pct / 20; return `<div class="flex-1 flex flex-col items-center gap-1 min-w-0"><div class="text-xs font-bold">${x.r.gpa !== null ? gpaFmt(x.r.gpa) : esc(x.r.letter)}</div><div class="w-full max-w-[38px] rounded-t ${x.r.passed ? 'bg-brand-600' : 'bg-red-500'}" style="height:${Math.max(4, v / max * 100)}%"></div><div class="text-[10px] text-slate-500 text-center leading-tight truncate w-full" title="${esc(x.e.name)}">${esc(x.e.name.replace(/Examination|পরীক্ষা|—/g, '').trim())}</div></div>`; }).join('')}</div>`;
      const last = DB.latestExam(), PS = typeof PrintStudio !== 'undefined' ? PrintStudio.gen : null;
      return `<div class="card p-4 mb-4"><div class="flex flex-wrap items-center gap-2 mb-3"><div class="font-semibold mr-auto">জিপিএ-র প্রবণতা</div>
          ${PS?.progressReport ? `<button class="btn btn-ghost btn-sm" onclick="Print.show('progress','${st.id}')">${icon('file-chart-column')} বার্ষিক অগ্রগতি প্রতিবেদন</button>` : ''}
          ${PS?.transcript ? `<button class="btn btn-ghost btn-sm" onclick="Print.show('transcript','${st.id}')">${icon('scroll-text')} ট্রান্সক্রিপ্ট</button>` : ''}
          ${PS?.tabulation && this.staff() ? `<button class="btn btn-ghost btn-sm" onclick="Print.show('tabulation','${st.classId}','${last.id}')">${icon('table')} শ্রেণির টেবুলেশন শিট</button>` : ''}</div>${bars}</div>` + base.results.call(this, st);
    },
    history(st) {
      const notes = DB.s.incidents.filter(i => i.studentId === st.id && i.type === 'Counselor').sort((a, b) => b.date.localeCompare(a.date));
      return `<div class="card mb-4"><div class="px-4 py-3 border-b border-slate-100 flex items-center font-semibold">কাউন্সেলরের মন্তব্য${this.staff() ? `<button class="btn btn-ghost btn-sm ml-auto" onclick="Dossier.counselNote('${st.id}')">${icon('plus')} মন্তব্য যোগ করুন</button>` : ''}</div><div class="divide-y divide-slate-100">${notes.map(n => `<div class="px-4 py-2.5 text-sm"><span class="text-xs text-slate-400">${U.fmtDate(n.date)} · ${esc(pn(DB.user(n.by)))}</span><div>${esc(n.note)}</div></div>`).join('') || '<div class="px-4 py-3 text-sm text-slate-400">কাউন্সেলরের কোনো মন্তব্য নেই।</div>'}</div></div>` + base.history.call(this, st);
    },
    counselNote(studentId) {
      const note = prompt('কাউন্সেলর / সুস্থতা-সংক্রান্ত মন্তব্য (শুধু কর্মী ও অভিভাবকের জন্য গোপনীয়):'); if (!note) return;
      DB.s.incidents.push({ id: DB.id('INC'), studentId, type: 'Counselor', note, by: App.session.userId, date: U.today() });
      DB.audit('COUNSEL_NOTE', 'incidents', `${studentId} মন্তব্য যোগ করা হয়েছে`); DB.save(); this.render();
    },
  });
})();

/* "My Profile" for students and guardians (same 7-tab dossier, read-only where appropriate). */
App.addPage('student', { id: 'profile', label: 'আমার প্রোফাইল', icon: 'id-card', module: 'students', render() { const st = Student.me(); return pageHeader('আমার প্রোফাইল', 'আপনার পূর্ণাঙ্গ বিদ্যালয় রেকর্ড।') + Dossier.inline(st.id); }, mount() { Dossier.render(); } }, 'dashboard');
App.addPage('guardian', { id: 'profile', label: 'সন্তানের প্রোফাইল', icon: 'id-card', module: 'students', render() { const c = Guardian.child(); if (!c) return emptyState('কোনো সন্তান যুক্ত নেই।'); return pageHeader('সন্তানের প্রোফাইল', 'পূর্ণাঙ্গ রেকর্ড — নথি, আইডি, ফি, উপস্থিতি, ফলাফল, সেবা ও ইতিহাস।') + Guardian.switcher() + Dossier.inline(c.id); }, mount() { if (Guardian.child()) Dossier.render(); } }, 'overview');
