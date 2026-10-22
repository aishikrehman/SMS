/* ==========================================================================
   FEE STRUCTURE, BILLING & FINANCIAL STATEMENTS
   Fee heads (recurring + one-time) · per-class fee structure · bulk monthly
   billing · automatic late fines · concessions / manual fee changes ·
   counter collection desk with teller stamp · Balance Sheet, Income &
   Expenditure (P&L) and Daily Cash Flow statements · student self-pay.
   ========================================================================== */

/* Built-in fee heads. Amounts come from the class fee settings, transport routes and hostel allocations;
   only the late fine has its own amount (৳১০০, change it under Fees & Billing). Other heads are added by the school. */
DB.addSeeder('feeHeads', () => [
  { id: 'FH-TUI', name: 'মাসিক বেতন', type: 'Recurring', frequency: 'Monthly', account: '4000', amount: null, source: 'শ্রেণিভিত্তিক ফি নির্ধারণ', builtin: true },
  { id: 'FH-TRN', name: 'পরিবহন ফি', type: 'Recurring', frequency: 'Monthly', account: '4400', amount: null, source: 'পরিবহন রুট', builtin: true },
  { id: 'FH-HST', name: 'ছাত্রাবাস ও খাবার ফি', type: 'Recurring', frequency: 'Monthly', account: '4500', amount: null, source: 'ছাত্রাবাস বরাদ্দ', builtin: true },
  { id: 'FH-ADM', name: 'ভর্তি ফি', type: 'One-time', frequency: 'Once', account: '4100', amount: null, source: 'শ্রেণিভিত্তিক ফি নির্ধারণ', builtin: true },
  { id: 'FH-EXM', name: 'পরীক্ষার ফি', type: 'Recurring', frequency: 'Per term', account: '4200', amount: null, source: 'শ্রেণিভিত্তিক ফি নির্ধারণ', builtin: true },
  { id: 'FH-LATE', name: 'বিলম্ব জরিমানা', type: 'One-time', frequency: 'Per late invoice', account: '4700', amount: 100, builtin: true },
]);

const Fees = {
  head(id) { return DB.s.feeHeads.find(h => h.id === id); },
  /** Amount of a head for a class this session: structure override → head default (tuition/exam from the class fee config). */
  amount(headId, classId) {
    if (headId === 'FH-TUI') return DB.fees(classId).tuition;
    if (headId === 'FH-EXM') return DB.fees(classId).examFee;
    if (headId === 'FH-ADM') return DB.fees(classId).admissionFee;
    const o = DB.s.feeStructure.find(x => x.session === DB.session() && x.classId === classId && x.headId === headId);
    return o ? o.amount : (this.head(headId)?.amount || 0);
  },
  setAmount(headId, classId, v) {
    if (['FH-TUI', 'FH-EXM', 'FH-ADM'].includes(headId)) { const f = DB.s.feeConfigs.find(x => x.classId === classId && x.session === DB.session()); f[{ 'FH-TUI': 'tuition', 'FH-EXM': 'examFee', 'FH-ADM': 'admissionFee' }[headId]] = +v; }
    else { const o = DB.s.feeStructure.find(x => x.session === DB.session() && x.classId === classId && x.headId === headId); o ? o.amount = +v : DB.s.feeStructure.push({ session: DB.session(), classId, headId, amount: +v }); }
    DB.audit('FEE_STRUCTURE', 'fees', `${classId} ${headId} = ${v}`); DB.save();
  },
  editHead(id) {
    const h = this.head(id) || { name: '', type: 'One-time', frequency: 'Once', account: '4600', amount: 0 };
    Modal.open({ title: id ? `${esc(h.name)} এডিট করুন` : 'নতুন ফি খাত', size: 'md', body: `<form id="fh" class="grid grid-cols-2 gap-3"><div class="col-span-2"><label class="label">নাম</label><input class="input" name="name" value="${esc(h.name)}" required></div><div><label class="label">ধরন</label><select class="select" name="type"><option value="Recurring" ${h.type === 'Recurring' ? 'selected' : ''}>${bn('Recurring')}</option><option value="One-time" ${h.type === 'One-time' ? 'selected' : ''}>${bn('One-time')}</option></select></div><div><label class="label">পুনরাবৃত্তি</label><select class="select" name="frequency">${['Monthly', 'Per term', 'Yearly', 'Once'].map(x => `<option value="${x}" ${x === h.frequency ? 'selected' : ''}>${bn(x)}</option>`).join('')}</select></div><div><label class="label">ডিফল্ট পরিমাণ (৳)</label><input type="number" class="input" name="amount" value="${h.amount ?? 0}" ${h.builtin && h.amount === null ? 'disabled' : ''}></div><div><label class="label">আয়ের খাত</label><select class="select" name="account">${DB.s.accounts.filter(a => a.type === 'Income' || a.code === '2400').map(a => `<option value="${a.code}" ${a.code === h.account ? 'selected' : ''}>${a.code} · ${esc(a.name)}</option>`).join('')}</select></div><label class="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" name="optIn" ${h.optIn ? 'checked' : ''}> শুধু ঐচ্ছিক</label><button class="btn btn-primary col-span-2">সংরক্ষণ করুন</button></form>` });
    $('#fh').addEventListener('submit', e => { e.preventDefault(); const f = formData(e.target); f.amount = f.amount === undefined ? h.amount : +f.amount; f.optIn = !!e.target.optIn.checked; if (id) Object.assign(h, f); else DB.s.feeHeads.push({ id: DB.id('FH-'), ...f }); DB.audit('FEE_HEAD', 'fees', `${f.name} (${bn(f.type)}, ${bn(f.frequency)})`); DB.save(); Modal.close(); App.refresh(); });
  },
  /** Bulk billing: idempotent per student + head + month. Applies the student's scholarship % to tuition. */
  bill(month, headIds, classIds) {
    let n = 0, total = 0;
    classIds.forEach(cid => DB.studentsIn(cid).forEach(st => headIds.forEach(hid => {
      const h = this.head(hid); if (!h || ['FH-TRN', 'FH-HST', 'FH-LATE'].includes(hid)) return;
      if (h.optIn && !(st.optHeads || []).includes(hid)) return;
      const tag = `${hid}|${month}`;
      if (DB.s.invoices.some(i => i.studentId === st.id && (i.tag === tag || (hid === 'FH-TUI' && i.kind === 'tuition' && i.month === month)))) return;
      let amt = this.amount(hid, cid); if (hid === 'FH-TUI' && st.scholarshipPct) amt = Math.round(amt * (1 - st.scholarshipPct / 100));
      const inv = DB.bill(st.id, { item: `${h.name} — ${U.monthName(month)}${hid === 'FH-TUI' && st.scholarshipPct ? ` (−${bnNum(st.scholarshipPct)}% বৃত্তি)` : ''}`, amount: amt, due: `${month}-10`, kind: hid === 'FH-TUI' ? 'tuition' : hid === 'FH-EXM' ? 'exam' : 'other', incomeAcct: h.account, month, by: App.session.userId });
      if (inv) { inv.tag = tag; inv.headId = hid; n++; total += inv.amount; }
    })));
    DB.audit('BULK_BILLING', 'invoices', `${month}: ${bnNum(n)}টি বিল, ${U.money(total)} (${headIds.join(', ')})`); DB.save();
    return { n, total };
  },
  /** Late fine once per overdue tuition/installment invoice. */
  applyLateFines(silent) {
    const fine = this.head('FH-LATE')?.amount || 100, today = U.today(); let n = 0;
    DB.s.invoices.filter(i => i.status === 'unpaid' && ['tuition', 'installment'].includes(i.kind) && i.due < today && !i.lateFined).forEach(i => {
      const inv = DB.bill(i.studentId, { item: `বিলম্ব জরিমানা — ${i.item}`, amount: fine, due: U.iso(U.addDays(new Date(), 7)), kind: 'fine', incomeAcct: '4700', ref: i.id });
      if (inv) { i.lateFined = inv.id; n++; }
    });
    DB.s.meta.lastLateFineRun = today;
    if (n) DB.audit('LATE_FINES', 'invoices', `${bnNum(n)}টি বিলম্ব জরিমানা, প্রতিটি ${U.money(fine)}`, silent ? { role: 'SYSTEM' } : undefined);
    DB.save(); return n;
  },
  /** Manual fee change / concession on one unpaid invoice (Teacher/Admin/Principal with fees.edit). */
  adjust(invId) {
    if (!App.perm('fees', 'edit')) return toast('আপনার ভূমিকায় ফি পরিবর্তনের অনুমতি নেই।', 'error');
    const i = DB.s.invoices.find(x => x.id === invId), st = DB.student(i.studentId);
    Modal.open({ title: `ফি পরিবর্তন · ${esc(pn(st))}`, size: 'sm', body: `<form id="adj" class="space-y-3"><div class="text-sm">${esc(i.item)} — বর্তমান <b>${U.money(i.amount)}</b></div><div class="grid grid-cols-2 gap-3"><div><label class="label">ছাড় %</label><input type="number" min="0" max="100" class="input" name="pct" value="0"></div><div><label class="label">অথবা নতুন পরিমাণ (৳)</label><input type="number" min="0" class="input" name="amount" value="${i.amount}"></div></div><div><label class="label">কারণ (আবশ্যক)</label><input class="input" name="reason" required placeholder="যেমন: অধ্যক্ষ কর্তৃক অনুমোদিত সহোদর ছাড়"></div><button class="btn btn-primary w-full">পরিবর্তন প্রয়োগ করুন</button></form>` });
    const f = $('#adj');
    f.pct.addEventListener('input', () => { f.amount.value = Math.round(i.amount * (1 - (+f.pct.value || 0) / 100)); });
    f.addEventListener('submit', e => {
      e.preventDefault(); const d = formData(f), to = Math.max(0, Math.round(+d.amount)), from = i.amount, diff = from - to;
      if (!diff) return Modal.close();
      i.amount = to; (i.adjustments = i.adjustments || []).push({ from, to, reason: d.reason, by: App.session.userId, date: U.today() });
      DB.s.concessions.push({ id: DB.id('CON'), invoiceId: i.id, studentId: st.id, from, to, reason: d.reason, by: App.session.userId, role: App.session.role, date: U.today() });
      DB.postJournal(`ফি ${diff > 0 ? 'ছাড়' : 'বৃদ্ধি'} — ${pn(st)} (${i.item})`, diff > 0 ? [{ acct: '5200', dr: diff, cr: 0 }, { acct: '1100', dr: 0, cr: diff }] : [{ acct: '1100', dr: -diff, cr: 0 }, { acct: '4600', dr: 0, cr: -diff }], i.id, App.session.userId, null, { campusId: DB.campusOf(st.classId) });
      if (to === 0) i.status = 'paid', i.paymentId = 'WAIVED';
      DB.audit('FEE_ADJUST', 'invoices', `${i.id} ${pn(st)}: ${U.money(from)} → ${U.money(to)} (${d.reason})`); DB.save();
      Modal.close(); toast('ফি আপডেট করা হয়েছে।', 'success'); if ($('#dossier')) Dossier.render(); else App.refresh();
    });
  },
  /** Counter collection with a teller stamp on the receipt. */
  collect(studentId) {
    const st = DB.student(studentId), invs = DB.unpaid(studentId).sort((a, b) => a.due.localeCompare(b.due)), counter = App.ui.counterNo || 1;
    if (!invs.length) return toast('কোনো বকেয়া নেই।', 'warn');
    Modal.open({ title: `ফি আদায় · ${esc(pn(st))}`, size: 'md', body: `<form id="col" class="space-y-3"><div class="max-h-64 overflow-y-auto space-y-1">${invs.map(i => `<label class="flex items-center gap-2 text-sm"><input type="checkbox" name="inv" value="${i.id}" ${i.due <= U.iso(U.addDays(new Date(), 31)) ? 'checked' : ''}><span class="flex-1">${esc(i.item)} <span class="text-xs ${i.due < U.today() ? 'text-red-500' : 'text-slate-400'}">পরিশোধের শেষ তারিখ ${U.fmtDate(i.due)}</span></span><b>${U.money(i.amount)}</b></label>`).join('')}</div>
      <div class="grid grid-cols-3 gap-3"><div><label class="label">মাধ্যম</label><select class="select" name="method">${['Cash', 'Bank', ...MFS, 'Card'].map(m => `<option value="${m}">${bn(m)}</option>`).join('')}</select></div><div><label class="label">ট্রানজ্যাকশন আইডি (TrxID) / স্লিপ</label><input class="input font-mono uppercase" name="trx"></div><div><label class="label">কাউন্টার নং</label><input type="number" min="1" class="input" name="counter" value="${counter}"></div></div>
      <div id="col-tot" class="text-right font-bold"></div><button class="btn btn-success w-full">${icon('check')} আদায় করুন ও রসিদ মুদ্রণ করুন</button></form>` });
    const f = $('#col'), tot = () => { $('#col-tot').textContent = 'মোট ' + U.money(U.sum(DB.s.invoices.filter(i => $$('input[name=inv]:checked', f).map(x => x.value).includes(i.id)), i => i.amount)); };
    f.addEventListener('change', tot); tot();
    f.addEventListener('submit', e => {
      e.preventDefault(); const d = formData(f), ids = $$('input[name=inv]:checked', f).map(x => x.value);
      if (!ids.length) return toast('বিল নির্বাচন করুন।', 'error');
      if (MFS.includes(d.method) && !/^[A-Z0-9]{8,10}$/i.test(d.trx)) return toast('৮–১০ অক্ষরের এমএফএস ট্রানজ্যাকশন আইডি (TrxID) লিখুন।', 'error');
      if (d.trx && DB.trxIdUsed(d.trx)) return toast('এই ট্রানজ্যাকশন আইডি (TrxID) ইতোমধ্যে ব্যবহৃত হয়েছে।', 'error');
      App.ui.counterNo = +d.counter;
      const pay = DB.recordPayment(studentId, ids, d.method, App.session.userId, { trxId: d.trx ? d.trx.toUpperCase() : undefined, channel: 'Counter', verified: !MFS.includes(d.method) });
      pay.teller = `${pn(App.user())} · কাউন্টার ${bnNum(d.counter)}`; pay.sig = U.hash([pay.id, pay.amount, pay.txn, pay.date, pay.studentId].join('|'));
      DB.guardiansOf(studentId).forEach(g => DB.sms(g.phone, `${DB.s.school.shortName}: ${pn(st)}-এর জন্য ${bnNum(d.counter)} নং কাউন্টারে ${U.money(pay.amount)} গৃহীত হয়েছে। রসিদ ${pay.id}।`));
      DB.audit('COUNTER_COLLECTION', 'payments', `${pay.id} ${U.money(pay.amount)} ${bn(pay.method)} — ${pay.teller}`); DB.save();
      Modal.close(); Print.show('receipt', pay.id);
    });
  },

  /* ---------- statements ---------- */
  balanceSheet(asOf) {
    const b = DB.balances(v => v.date <= asOf), L = Object.values(b);
    const sum = t => U.sum(L.filter(a => a.type === t), a => a.balance);
    const surplus = sum('Income') - sum('Expense');
    return { assets: L.filter(a => a.type === 'Asset'), liabilities: L.filter(a => a.type === 'Liability'), equity: L.filter(a => a.type === 'Equity'), surplus, totA: sum('Asset'), totL: sum('Liability'), totE: sum('Equity') + surplus };
  },
  pnl(from, to) { const b = DB.balances(v => v.date >= from && v.date <= to), L = Object.values(b); return { income: L.filter(a => a.type === 'Income' && a.balance), expense: L.filter(a => a.type === 'Expense' && a.balance), inc: U.sum(L.filter(a => a.type === 'Income'), a => a.balance), exp: U.sum(L.filter(a => a.type === 'Expense'), a => a.balance) }; },
  cashFlow(from, to) {
    const days = {}, cash = ['1000', '1010', '1020'];
    DB.s.journal.filter(v => v.date >= from && v.date <= to).forEach(v => {
      if (v.lines.every(l => cash.includes(l.acct))) return;   // internal transfer (e.g. MFS settlement)
      const d = days[v.date] || (days[v.date] = { in: { 1000: 0, 1010: 0, 1020: 0 }, out: { 1000: 0, 1010: 0, 1020: 0 } });
      v.lines.filter(l => cash.includes(l.acct)).forEach(l => { d.in[l.acct] += +l.dr || 0; d.out[l.acct] += +l.cr || 0; });
    });
    return Object.entries(days).sort(([a], [b]) => a.localeCompare(b));
  },
  printStatement(kind, period) {
    const ui = period || App.ui.stmt || {}, S = Print.sheet({}, 'padded'), h = t => Print.header(t), nf = v => U.bn(v.toLocaleString('en-IN'));
    let body = '';
    if (kind === 'bs') { const x = this.balanceSheet(ui.asOf); const tbl = (title, rows, extra = '') => `<tr><th colspan="2" style="text-align:left;background:#eef7f3">${title}</th></tr>${rows.map(a => `<tr><td>${a.code} · ${esc(a.name)}</td><td style="text-align:right">${nf(a.balance)}</td></tr>`).join('')}${extra}`;
      body = h(`${U.fmtDate(ui.asOf)} তারিখের ব্যালান্স শিট`) + `<table class="ms-table">${tbl('সম্পদ', x.assets)}<tr><th>মোট সম্পদ</th><th style="text-align:right">${nf(x.totA)}</th></tr>${tbl('দায়', x.liabilities)}${tbl('তহবিল ও মূলধন', x.equity, `<tr><td>পুঞ্জীভূত উদ্বৃত্ত (চলতি সময়কাল)</td><td style="text-align:right">${nf(x.surplus)}</td></tr>`)}<tr><th>মোট দায় ও মূলধন</th><th style="text-align:right">${nf(x.totL + x.totE)}</th></tr></table>`; }
    if (kind === 'pnl') { const x = this.pnl(ui.from, ui.to); body = h(`আয় ও ব্যয় · ${U.fmtDate(ui.from)} – ${U.fmtDate(ui.to)}`) + `<table class="ms-table"><tr><th colspan="2" style="text-align:left">আয়</th></tr>${x.income.map(a => `<tr><td>${esc(a.name)}</td><td style="text-align:right">${nf(a.balance)}</td></tr>`).join('')}<tr><th>মোট আয়</th><th style="text-align:right">${nf(x.inc)}</th></tr><tr><th colspan="2" style="text-align:left">ব্যয়</th></tr>${x.expense.map(a => `<tr><td>${esc(a.name)}</td><td style="text-align:right">${nf(a.balance)}</td></tr>`).join('')}<tr><th>মোট ব্যয়</th><th style="text-align:right">${nf(x.exp)}</th></tr><tr><th>${x.inc >= x.exp ? 'উদ্বৃত্ত' : 'ঘাটতি'}</th><th style="text-align:right">${nf(Math.abs(x.inc - x.exp))}</th></tr></table>`; }
    if (kind === 'cf') { const rows = this.cashFlow(ui.from, ui.to); body = h(`দৈনিক নগদ প্রবাহ · ${U.fmtDate(ui.from)} – ${U.fmtDate(ui.to)}`) + `<table class="ms-table" style="font-size:8.5pt"><thead><tr><th>তারিখ</th><th>নগদ অর্থ আগম</th><th>ব্যাংক আগম</th><th>এমএফএস আগম</th><th>নগদ অর্থ নির্গম</th><th>ব্যাংক নির্গম</th><th>এমএফএস নির্গম</th><th>নিট</th></tr></thead><tbody>${rows.map(([d, r]) => `<tr><td>${U.fmtDate(d)}</td>${['1000', '1010', '1020'].map(a => `<td>${nf(r.in[a])}</td>`).join('')}${['1000', '1010', '1020'].map(a => `<td>${nf(r.out[a])}</td>`).join('')}<td><b>${nf(U.sum(Object.values(r.in)) - U.sum(Object.values(r.out)))}</b></td></tr>`).join('')}</tbody></table>`; }
    Print.preview('আর্থিক বিবরণী', [S + body + `<div style="position:absolute;bottom:20mm;left:14mm;right:14mm;display:flex;justify-content:space-between">${Print.signature('হিসাবরক্ষক')}${Print.signature('অধ্যক্ষ')}</div></div>`], { re: ['Fees.printStatement', kind, { asOf: ui.asOf, from: ui.from, to: ui.to }] });
  },
};

/* --------------------------------------------------------------- pages --- */
const feesPage = {
  id: 'fees', label: 'ফি ও বিল', icon: 'receipt', module: 'fees',
  render() {
    const t = App.ui.feeTab || 'desk', T = [['desk', 'আদায় ডেস্ক', 'banknote'], ['structure', 'ফি খাত ও কাঠামো', 'layers'], ['billing', 'একযোগে বিল প্রস্তুত', 'files'], ['fines', 'বিলম্ব জরিমানা', 'alarm-clock'], ['concessions', 'ছাড়ের লগ', 'badge-percent']];
    return pageHeader('ফি ও বিল', `${multiCampus() ? esc(DB.campus().name) + ' · ' : ''}শিক্ষাবর্ষ ${esc(U.bn(DB.session()))}`) + tabs('feeTab', T, t) + `<div class="fade-in">${this[t]()}</div>`;
  },
  desk() {
    const q = (App.ui.feeQ || '').toLowerCase(), L = 'fees.desk', K = 'feeLF';
    const FD = ListPrefs.filters(L, [{ k: 'cls', label: 'শ্রেণি', opts: DB.classesIn().map(c => [c.id, c.name]) }, { k: 'state', label: 'বকেয়ার অবস্থা', opts: [['over', 'মেয়াদোত্তীর্ণ বকেয়া আছে'], ['due', 'বকেয়া আছে'], ['clear', 'বকেয়ামুক্ত']] }, { k: 'limit', label: 'কতজন দেখাবে', on: false, all: 'প্রথম ৪০ জন', opts: [['100', 'প্রথম ১০০ জন'], ['all', 'সকল']] }]);
    const fv = k => ListPrefs.val(L, K, k), lim = fv('limit') === 'all' ? Infinity : +fv('limit') || 40;
    const list = DB.activeStudents().filter(s => (!fv('cls') || s.classId === fv('cls')) && (!q || s.name.toLowerCase().includes(q) || (s.nameBn || '').includes(App.ui.feeQ) || s.id.toLowerCase() === q || String(s.regNo || '').toLowerCase().includes(q) || String(s.roll) === q)).map(s => ({ s, d: DB.dues(s.id), over: DB.duesBefore(s.id, U.today()) }))
      .filter(x => !fv('state') || (fv('state') === 'over' ? x.over > 0 : fv('state') === 'due' ? x.d > 0 : !x.d)).sort((a, b) => b.over - a.over || b.d - a.d).slice(0, lim);
    const C = ListPrefs.cols(L, [
      { k: 'st', label: 'শিক্ষার্থী', lock: true, td: ({ s }) => `<button class="font-semibold hover:underline text-left" onclick="Dossier.open('${s.id}','fees')">${esc(pn(s))}</button><div class="text-xs text-slate-400">${s.id} · ${esc(s.regNo || '')}</div>` },
      { k: 'cls', label: 'শ্রেণি', td: ({ s }) => `${esc(DB.className(s.classId))} · ${bnNum(s.roll)}` },
      { k: 'over', label: 'মেয়াদোত্তীর্ণ', cls: 'text-right', td: ({ over }) => `<span class="${over ? 'text-red-600 font-semibold' : 'text-slate-400'}">${U.money(over)}</span>` },
      { k: 'due', label: 'মোট বকেয়া', cls: 'text-right', td: ({ d }) => U.money(d) },
      { k: 'bills', label: 'অপরিশোধিত বিল', on: false, td: ({ s }) => bnNum(DB.unpaid(s.id).length) },
      { k: 'last', label: 'সর্বশেষ পরিশোধ', on: false, td: ({ s }) => { const p = DB.s.payments.filter(x => x.studentId === s.id).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]; return p ? `${U.fmtDate(p.date)} · ${U.money(p.amount)}` : '—'; } },
      { k: 'phone', label: 'অভিভাবকের মোবাইল', on: false, td: ({ s }) => esc(U.bn(DB.guardiansOf(s.id)[0]?.phone || s.emergency || '—')) },
      { k: 'sch', label: 'বৃত্তি', on: false, td: ({ s }) => (s.scholarshipPct ? `${bnNum(s.scholarshipPct)}%` : '—') },
      { k: 'act', label: '', lock: true, cls: 'text-right', td: ({ s, d }) => (d ? `<button class="btn btn-success btn-sm" onclick="Fees.collect('${s.id}')">${icon('banknote')} আদায় করুন</button>` : badge('বকেয়ামুক্ত', 'green')) },
    ]);
    const today = DB.s.payments.filter(p => p.date === U.today());
    return `<div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">${kpi('আজকের আদায়', U.money(U.sum(today, p => p.amount)), `${bnNum(today.length)}টি রসিদ`, 'banknote', 'green')}${kpi('কাউন্টার (নগদ অর্থ)', U.money(U.sum(today.filter(p => p.method === 'Cash'), p => p.amount)), '', 'wallet', 'blue')}${kpi(multiCampus() ? 'মেয়াদোত্তীর্ণ বকেয়া (ক্যাম্পাস)' : 'মেয়াদোত্তীর্ণ বকেয়া', U.money(U.sum(DB.activeStudents(), s => DB.duesBefore(s.id, U.today()))), '', 'alarm-clock', 'red')}${kpi('অপেক্ষমাণ ট্রানজ্যাকশন আইডি', bnNum(DB.s.payments.filter(p => p.verified === false).length), 'মিলিয়ে দেখার অপেক্ষায়', 'scan-search', 'amber')}</div>
      <div class="card p-3 mb-3 flex flex-wrap gap-2"><input id="fee-q" class="input flex-1 min-w-[12rem]" placeholder="নাম, আইডি, রোল বা নিবন্ধন নম্বর দিয়ে শিক্ষার্থী অনুসন্ধান করুন…" value="${esc(App.ui.feeQ || '')}">${ListPrefs.selects(FD, K)}${ListPrefs.button(L)}</div>
      <div class="card scroll-x"><table class="table"><thead>${ListPrefs.head(C)}</thead><tbody>${list.map(x => ListPrefs.row(C, x)).join('')}</tbody></table>${list.length ? '' : emptyState('কোনো শিক্ষার্থী মেলেনি।')}</div>`;
  },
  structure() {
    const heads = DB.s.feeHeads, cls = DB.classesIn(), can = App.perm('fees', 'edit');
    return `<div class="card scroll-x mb-5"><div class="px-5 py-3 border-b border-slate-100 flex items-center"><div class="font-semibold">ফি খাত</div>${can ? `<button class="btn btn-primary btn-sm ml-auto" onclick="Fees.editHead()">${icon('plus')} নতুন খাত</button>` : ''}</div><table class="table"><thead><tr><th>খাত</th><th>ধরন</th><th>পুনরাবৃত্তি</th><th>হিসাব</th><th>ডিফল্ট</th><th></th></tr></thead><tbody>${heads.map(h => `<tr><td class="font-semibold">${esc(h.name)} ${h.optIn ? badge('ঐচ্ছিক', 'violet') : ''}</td><td>${badge(bn(h.type), h.type === 'Recurring' ? 'blue' : 'amber')}</td><td class="text-xs">${esc(bn(h.frequency))}</td><td class="text-xs">${h.account} · ${esc(DB.s.accounts.find(a => a.code === h.account)?.name || '')}</td><td>${h.amount === null ? `<span class="text-xs text-slate-400">${esc(bn(h.source || 'শ্রেণিভিত্তিক'))}</span>` : U.money(h.amount)}</td><td>${can ? `<button class="btn btn-ghost btn-sm" onclick="Fees.editHead('${h.id}')">${icon('pencil')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
      <div class="card scroll-x"><div class="px-5 py-3 border-b border-slate-100 font-semibold">শ্রেণিভিত্তিক ফি কাঠামো — শিক্ষাবর্ষ ${esc(U.bn(DB.session()))}</div><table class="table"><thead><tr><th>শ্রেণি</th>${heads.filter(h => !['FH-TRN', 'FH-HST', 'FH-LATE'].includes(h.id)).map(h => `<th class="text-right">${esc(h.name)}</th>`).join('')}</tr></thead><tbody>${cls.map(c => `<tr><td class="font-semibold">${esc(c.name)}</td>${heads.filter(h => !['FH-TRN', 'FH-HST', 'FH-LATE'].includes(h.id)).map(h => `<td class="text-right"><input type="number" class="grid-input !w-20" value="${Fees.amount(h.id, c.id)}" ${can ? '' : 'disabled'} onchange="Fees.setAmount('${h.id}','${c.id}',this.value)"></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  },
  billing() {
    const mk = App.ui.billMonth || U.monthKey(new Date());
    return `<form id="bill" class="card p-5 max-w-3xl space-y-4"><div class="grid sm:grid-cols-2 gap-3"><div><label class="label">বিলের মাস</label><input type="month" class="input" name="month" value="${mk}" required></div></div>
      <div><div class="label">ফি খাত</div><div class="grid sm:grid-cols-2 gap-2">${DB.s.feeHeads.filter(h => !['FH-TRN', 'FH-HST', 'FH-LATE', 'FH-ADM'].includes(h.id)).map(h => `<label class="flex items-center gap-2 text-sm card p-2"><input type="checkbox" name="head" value="${h.id}" ${h.id === 'FH-TUI' || h.optIn ? 'checked' : ''}> ${esc(h.name)} <span class="ml-auto text-xs text-slate-400">${esc(bn(h.frequency))}</span></label>`).join('')}</div></div>
      <div><div class="label">শ্রেণিসমূহ — ${esc(DB.campus().name)}</div><div class="flex flex-wrap gap-3">${DB.classesIn().map(c => `<label class="flex items-center gap-1.5 text-sm"><input type="checkbox" name="cls" value="${c.id}" checked> ${esc(c.name)}</label>`).join('')}</div></div>
      <button class="btn btn-primary">${icon('files')} বিল প্রস্তুত করুন</button></form>`;
  },
  fines() {
    const fine = Fees.head('FH-LATE')?.amount || 100, cand = DB.s.invoices.filter(i => i.status === 'unpaid' && ['tuition', 'installment'].includes(i.kind) && i.due < U.today() && !i.lateFined);
    const recent = DB.s.invoices.filter(i => i.kind === 'fine' && (i.item.startsWith('বিলম্ব জরিমানা') || i.item.startsWith('Late fine'))).slice(-15).reverse();
    return `<div class="grid lg:grid-cols-3 gap-5"><div class="card p-5 space-y-3"><div class="font-semibold">বিলম্ব জরিমানার নিয়ম</div><p class="text-sm text-slate-600">প্রতিটি মেয়াদোত্তীর্ণ মাসিক বেতন বা কিস্তির বিলে একবার জরিমানা: <b>${U.money(fine)}</b>। ${DB.s.featureFlags.lateFines ? 'প্রতিদিন একবার স্বয়ংক্রিয়ভাবে চলে।' : 'স্বয়ংক্রিয় প্রক্রিয়া বন্ধ রয়েছে (বৈশিষ্ট্য মডিউল)।'}</p><div class="text-sm">${bnNum(cand.length)}টি বিল এখন জরিমানাযোগ্য · সর্বশেষ চালানো হয়েছে ${DB.s.meta.lastLateFineRun ? U.fmtDate(DB.s.meta.lastLateFineRun) : 'কখনো নয়'}</div><button class="btn btn-primary w-full" ${cand.length ? '' : 'disabled'} onclick="const n=Fees.applyLateFines();toast(U.bn(n)+'টি বিলম্ব জরিমানা বিল করা হয়েছে।','success');App.refresh()">${icon('alarm-clock')} এখনই বিলম্ব জরিমানা প্রয়োগ করুন</button></div>
      <div class="card lg:col-span-2 scroll-x"><div class="px-5 py-3 border-b border-slate-100 font-semibold">সাম্প্রতিক বিলম্ব জরিমানা</div><table class="table"><tbody>${recent.map(i => `<tr><td>${esc(pn(DB.student(i.studentId)))}</td><td class="text-xs">${esc(i.item)}</td><td>${U.money(i.amount)}</td><td>${badge(bn(i.status), { paid: 'green', unpaid: 'red' }[i.status] || 'slate')}</td><td><button class="btn btn-ghost btn-sm" onclick="Fees.adjust('${i.id}')" title="মওকুফ / পরিবর্তন">${icon('badge-percent')}</button></td></tr>`).join('') || `<tr><td>${emptyState('এখনো কোনো জরিমানা নেই।')}</td></tr>`}</tbody></table></div></div>`;
  },
  concessions() {
    const list = [...DB.s.concessions].reverse();
    return `<div class="card scroll-x"><table class="table"><thead><tr><th>তারিখ</th><th>শিক্ষার্থী</th><th>বিল</th><th class="text-right">পূর্বের পরিমাণ</th><th class="text-right">নতুন পরিমাণ</th><th>কারণ</th><th>কর্তৃক</th></tr></thead><tbody>${list.map(c => `<tr><td class="text-xs">${U.fmtDate(c.date)}</td><td><button class="hover:underline" onclick="Dossier.open('${c.studentId}','fees')">${esc(pn(DB.student(c.studentId)))}</button></td><td class="text-xs">${esc(DB.s.invoices.find(i => i.id === c.invoiceId)?.item || c.invoiceId)}</td><td class="text-right">${U.money(c.from)}</td><td class="text-right font-semibold">${U.money(c.to)}</td><td class="text-xs">${esc(c.reason)}</td><td class="text-xs">${esc(pn(DB.user(c.by)))} <span class="text-slate-400">${esc(bn(c.role))}</span></td></tr>`).join('')}</tbody></table>${list.length ? '' : emptyState('এখনো কোনো ফি পরিবর্তন করা হয়নি।')}</div>`;
  },
  mount() {
    let t; $('#fee-q')?.addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { App.ui.feeQ = e.target.value; App.refresh(); const el = $('#fee-q'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 250); });
    $('#bill')?.addEventListener('submit', e => { e.preventDefault(); const f = e.target, heads = $$('input[name=head]:checked', f).map(x => x.value), cls = $$('input[name=cls]:checked', f).map(x => x.value); App.ui.billMonth = f.month.value; if (!heads.length || !cls.length) return toast('খাত ও শ্রেণি নির্বাচন করুন।', 'error'); if (!confirm(`${bnNum(cls.length)}টি শ্রেণির জন্য ${U.monthName(f.month.value)} মাসের বিল প্রস্তুত করবেন?`)) return; const r = Fees.bill(f.month.value, heads, cls); toast(`${bnNum(r.n)}টি বিল · ${U.money(r.total)} বিল করা হয়েছে।`, 'success'); App.refresh(); });
  },
};
App.addPage('admin', feesPage, 'accounts');
App.addPage('principal', feesPage, 'services');

const statementsPage = {
  id: 'statements', label: 'আর্থিক বিবরণী', icon: 'scale', module: 'accounts',
  render() {
    const ui = App.ui.stmt || (App.ui.stmt = { asOf: U.today(), from: `${DB.session()}-01-01`, to: U.today() });
    const bs = Fees.balanceSheet(ui.asOf), pl = Fees.pnl(ui.from, ui.to), cf = Fees.cashFlow(U.iso(U.addDays(ui.to, -13)) > ui.from ? U.iso(U.addDays(ui.to, -13)) : ui.from, ui.to);
    const row = a => `<tr><td><span class="font-mono text-xs text-slate-400">${a.code}</span> ${esc(a.name)}</td><td class="text-right">${U.money(a.balance)}</td></tr>`;
    return pageHeader('আর্থিক বিবরণী', '',`<a class="btn btn-ghost" href="${App.href(App.route.portal, 'ledger')}">${icon('book-open-text')} রেওয়ামিল</a>`)
      + `<form id="st-f" class="card p-4 mb-5 flex flex-wrap gap-3 items-end"><div><label class="label">ব্যালান্স শিটের তারিখ</label><input type="date" class="input" name="asOf" value="${ui.asOf}"></div><div><label class="label">সময়কাল শুরু</label><input type="date" class="input" name="from" value="${ui.from}"></div><div><label class="label">পর্যন্ত</label><input type="date" class="input" name="to" value="${ui.to}"></div></form>
      <div class="grid xl:grid-cols-2 gap-5"><div class="card"><div class="px-5 py-3 border-b border-slate-100 flex items-center"><b>ব্যালান্স শিট</b> <span class="text-xs text-slate-500 ml-2">${U.fmtDate(ui.asOf)} তারিখ অনুযায়ী</span>${Math.abs(bs.totA - bs.totL - bs.totE) < 1 ? `<span class="ml-2">${badge('ভারসাম্যপূর্ণ', 'green')}</span>` : badge('যাচাই করুন', 'red')}<button class="btn btn-ghost btn-sm ml-auto" onclick="Fees.printStatement('bs')">${icon('printer')}</button></div>
          <table class="table"><tbody><tr><td colspan="2" class="!bg-slate-50 text-xs font-bold uppercase">সম্পদ</td></tr>${bs.assets.map(row).join('')}<tr class="font-bold"><td>মোট সম্পদ</td><td class="text-right">${U.money(bs.totA)}</td></tr>
          <tr><td colspan="2" class="!bg-slate-50 text-xs font-bold uppercase">দায়</td></tr>${bs.liabilities.map(row).join('')}<tr><td colspan="2" class="!bg-slate-50 text-xs font-bold uppercase">তহবিল ও মূলধন</td></tr>${bs.equity.map(row).join('')}<tr><td>পুঞ্জীভূত উদ্বৃত্ত</td><td class="text-right">${U.money(bs.surplus)}</td></tr><tr class="font-bold"><td>মোট দায় ও মূলধন</td><td class="text-right">${U.money(bs.totL + bs.totE)}</td></tr></tbody></table></div>
        <div class="card"><div class="px-5 py-3 border-b border-slate-100 flex items-center"><b>আয় ও ব্যয়</b> <span class="text-xs text-slate-500 ml-2">${U.fmtDate(ui.from)} – ${U.fmtDate(ui.to)}</span><button class="btn btn-ghost btn-sm ml-auto" onclick="Fees.printStatement('pnl')">${icon('printer')}</button></div>
          <table class="table"><tbody><tr><td colspan="2" class="!bg-slate-50 text-xs font-bold uppercase">আয়</td></tr>${pl.income.map(row).join('')}<tr class="font-bold"><td>মোট আয়</td><td class="text-right">${U.money(pl.inc)}</td></tr><tr><td colspan="2" class="!bg-slate-50 text-xs font-bold uppercase">ব্যয়</td></tr>${pl.expense.map(row).join('')}<tr class="font-bold"><td>মোট ব্যয়</td><td class="text-right">${U.money(pl.exp)}</td></tr><tr class="font-extrabold ${pl.inc - pl.exp < 0 ? 'text-red-600' : 'text-emerald-700'}"><td>${pl.inc - pl.exp < 0 ? 'ঘাটতি' : 'উদ্বৃত্ত'}</td><td class="text-right">${U.money(Math.abs(pl.inc - pl.exp))}</td></tr></tbody></table></div>
        <div class="card xl:col-span-2 scroll-x"><div class="px-5 py-3 border-b border-slate-100 flex items-center"><b>দৈনিক নগদ প্রবাহ</b> <span class="text-xs text-slate-500 ml-2">সময়কালের শেষ ১৪ দিন · অভ্যন্তরীণ স্থানান্তর বাদে</span><button class="btn btn-ghost btn-sm ml-auto" onclick="Fees.printStatement('cf')">${icon('printer')} সম্পূর্ণ সময়কাল</button></div><table class="table"><thead><tr><th>তারিখ</th><th class="text-right">নগদ অর্থ আগম</th><th class="text-right">ব্যাংক আগম</th><th class="text-right">এমএফএস আগম</th><th class="text-right">নির্গম (সকল)</th><th class="text-right">নিট</th></tr></thead><tbody>${cf.map(([d, r]) => { const i = U.sum(Object.values(r.in)), o = U.sum(Object.values(r.out)); return `<tr><td>${U.fmtDate(d)}</td><td class="text-right">${U.money(r.in[1000])}</td><td class="text-right">${U.money(r.in[1010])}</td><td class="text-right">${U.money(r.in[1020])}</td><td class="text-right">${U.money(o)}</td><td class="text-right font-semibold ${i - o < 0 ? 'text-red-600' : ''}">${U.money(i - o)}</td></tr>`; }).join('') || `<tr><td colspan="6">${emptyState('এই সময়ে কোনো নগদ লেনদেন নেই।')}</td></tr>`}</tbody></table></div></div>`;
  },
  mount() { $('#st-f').addEventListener('change', e => { Object.assign(App.ui.stmt, formData(e.currentTarget)); App.refresh(); }); },
};
App.addPage('admin', statementsPage, 'ledger');
App.addPage('principal', statementsPage, 'accounts');

/* Student self-service fees (the guardian portal already has its own). */
const FeesDesk = {
  pay() {
    const st = Student.me(), ids = $$('input[name=sinv]:checked').map(x => x.value);
    if (!ids.length) return toast('অন্তত একটি বিল নির্বাচন করুন।', 'error');
    this._pending = { studentId: st.id, ids };
    Modal.open({ title: `${U.money(U.sum(DB.s.invoices.filter(i => ids.includes(i.id)), i => i.amount))} পরিশোধ করুন`, size: 'lg', body: Pub.payPicker(U.sum(DB.s.invoices.filter(i => ids.includes(i.id)), i => i.amount), null, 'FeesDesk.onPaid') });
  },
  onPaid(m, txn, meta) { Guardian._pending = this._pending; Guardian.onPaid(m, txn, meta); },
};
App.addPage('student', {
  id: 'fees', label: 'ফি ও পরিশোধ', icon: 'wallet', module: 'fees',
  render() {
    const st = Student.me(); if (!st) return pageHeader('ফি ও পরিশোধ') + emptyState('এই অ্যাকাউন্টের সঙ্গে কোনো শিক্ষার্থীর রেকর্ড যুক্ত নেই।', 'wallet');
    const unpaid = DB.unpaid(st.id).sort((a, b) => a.due.localeCompare(b.due)), pays = DB.s.payments.filter(p => p.studentId === st.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
    return pageHeader('ফি ও পরিশোধ', '')
      + `<div class="grid lg:grid-cols-5 gap-5"><div class="card lg:col-span-2 self-start"><div class="px-5 py-3 border-b border-slate-100 font-semibold flex justify-between">বকেয়া <span class="${unpaid.length ? 'text-red-600' : 'text-emerald-600'}">${U.money(U.sum(unpaid, i => i.amount))}</span></div>${unpaid.length ? `<div class="divide-y divide-slate-100">${unpaid.map(i => `<label class="px-5 py-3 flex items-center gap-3 text-sm cursor-pointer"><input type="checkbox" name="sinv" value="${i.id}" checked><span class="flex-1">${esc(i.item)}<div class="text-xs ${i.due < U.today() ? 'text-red-500' : 'text-slate-400'}">পরিশোধের শেষ তারিখ ${U.fmtDate(i.due)}</div></span><b>${U.money(i.amount)}</b></label>`).join('')}</div><div class="p-4 border-t border-slate-100"><button class="btn btn-primary w-full" onclick="FeesDesk.pay()">${icon('wallet')} নির্বাচিত বিল পরিশোধ করুন</button></div>` : emptyState('কোনো বকেয়া নেই — ধন্যবাদ!', 'badge-check')}</div>
        <div class="card lg:col-span-3 scroll-x"><div class="px-5 py-3 border-b border-slate-100 font-semibold">রসিদসমূহ</div>${pays.length ? `<table class="table"><tbody>${pays.map(p => `<tr><td class="font-mono text-xs">${p.id}</td><td>${U.fmtDate(p.date)}</td><td>${esc(bn(p.method))}${p.verified === false ? ' ' + badge('যাচাই চলছে', 'amber') : ''}</td><td class="text-right font-semibold">${U.money(p.amount)}</td><td><button class="btn btn-ghost btn-sm" onclick="Print.show('receipt','${p.id}')">${icon('receipt')}</button></td></tr>`).join('')}</tbody></table>` : emptyState('এখনো কোনো রসিদ নেই।', 'receipt')}</div></div>`;
  },
}, 'dashboard');
