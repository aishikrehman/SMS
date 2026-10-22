/* ==========================================================================
   FINANCIAL MANAGEMENT & ACCOUNTING ENGINE
   Income vs expense, cost categories (per-campus cost centres), chart of
   accounts, payment / receipt / journal vouchers, MFS TrxID reconciliation.
   ========================================================================== */

const Finance = {
  scopeFilter() { const cc = App.ui.finCC || 'ALL'; return cc === 'ALL' ? null : v => v.campusId === cc || !v.campusId; },
  ccSelect() { return `<select class="select !w-auto" onchange="App.ui.finCC=this.value;App.refresh()" title="ব্যয়কেন্দ্র">${campusOptions(App.ui.finCC || 'ALL', true)}</select>`; },
  /** Display labels for reconciliation statuses / record sources (stored values stay English). */
  ST: { Matched: 'মিলেছে', 'Amount mismatch': 'পরিমাণে অমিল', Unclaimed: 'দাবিহীন', 'Missing on statement': 'বিবরণীতে অনুপস্থিত' },
  SRC: { payment: 'পরিশোধ', admission: 'ভর্তি', service: 'সেবা' },
  /** Monthly income & expense from journal lines on P&L accounts. */
  monthly(filter) {
    const acc = Object.fromEntries(DB.s.accounts.map(a => [a.code, a]));
    const by = {};
    DB.s.journal.filter(v => !filter || filter(v)).forEach(v => v.lines.forEach(l => {
      const a = acc[l.acct]; if (!a || (a.type !== 'Income' && a.type !== 'Expense')) return;
      const mk = v.date.slice(0, 7), r = by[mk] || (by[mk] = { inc: 0, exp: 0 });
      if (a.type === 'Income') r.inc += l.cr - l.dr; else r.exp += l.dr - l.cr;
    }));
    return Object.entries(by).sort(([a], [b]) => a.localeCompare(b));
  },
  catTotals(type, filter) {
    const b = DB.balances(filter);
    const groups = {};
    Object.values(b).filter(a => a.type === type && a.balance).forEach(a => { const k = type === 'Expense' ? (a.category || 'অন্যান্য') : a.name; groups[k] = (groups[k] || 0) + a.balance; });
    return Object.entries(groups).sort((a, b) => b[1] - a[1]);
  },
  barList(rows, tone) {
    const tot = U.sum(rows, r => r[1]) || 1;
    return `<div class="space-y-3">${rows.map(([k, v]) => `<div><div class="flex justify-between text-sm"><span>${esc(k)}</span><span class="font-semibold">${U.money(v)} <span class="text-slate-400 font-normal">${bnNum((v / tot * 100).toFixed(0))}%</span></span></div><div class="h-2 rounded-full bg-slate-100 mt-1 overflow-hidden"><div class="h-full ${tone}" style="width:${v / tot * 100}%"></div></div></div>`).join('') || emptyState('কোনো এন্ট্রি নেই।')}</div>`;
  },

  /* ---------- vouchers ---------- */
  voucher(kind = 'PV') {
    if (!App.can('ledger.post')) return toast('কেবল হিসাব / আইটি প্রশাসকগণ ভাউচার লিপিবদ্ধ করতে পারেন।', 'error');
    const acctOpt = (filter, sel) => DB.s.accounts.filter(filter).map(a => `<option value="${a.code}" ${a.code === sel ? 'selected' : ''}>${a.code} · ${esc(a.name)}${a.category ? ` (${esc(a.category)})` : ''}</option>`).join('');
    const cash = a => ['1000', '1010', '1020'].includes(a.code);
    const quick = kind !== 'JV';
    const body = quick
      ? `<form id="vch" class="grid sm:grid-cols-2 gap-3">
          <div><label class="label">তারিখ</label><input type="date" class="input" name="date" value="${U.today()}" required></div>
          <div><label class="label">${kind === 'PV' ? 'প্রাপক' : 'যাঁর নিকট থেকে প্রাপ্ত'}</label><input class="input" name="payee" required></div>
          <div><label class="label">${kind === 'PV' ? 'ব্যয় / ব্যয়ের খাত' : 'আয়ের হিসাব'}</label><select class="select" name="acct">${kind === 'PV' ? acctOpt(a => a.type === 'Expense' || a.type === 'Liability', '5300') : acctOpt(a => a.type === 'Income' || a.type === 'Liability', '4300')}</select></div>
          <div><label class="label">${kind === 'PV' ? 'যে হিসাব থেকে পরিশোধ' : 'যে হিসাবে জমা'}</label><select class="select" name="cash">${acctOpt(cash, '1010')}</select></div>
          <div><label class="label">পরিমাণ (৳)</label><input type="number" min="1" step="0.01" class="input" name="amount" required></div>
          <div><label class="label">ব্যয়কেন্দ্র</label><select class="select" name="campusId">${campusOptions(DB.campusId())}<option value="">প্রতিষ্ঠান-ব্যাপী</option></select></div>
          <div class="sm:col-span-2"><label class="label">বিবরণ</label><input class="input" name="memo" required placeholder="${kind === 'PV' ? 'যেমন বিজ্ঞানাগারের সিলিং ফ্যান মেরামত' : 'যেমন অক্টোবর মাসের ক্যান্টিন ভাড়া'}"></div>
          <div class="sm:col-span-2"><button class="btn btn-primary w-full">${icon('save')} ${kind === 'PV' ? 'পরিশোধ ভাউচার লিপিবদ্ধ করুন' : 'প্রাপ্তি ভাউচার লিপিবদ্ধ করুন'}</button></div></form>`
      : (() => { const line = () => `<div class="grid grid-cols-12 gap-2 jv-line"><select class="select col-span-6 !text-sm" name="acct">${acctOpt(() => true)}</select><input class="input col-span-3 !text-sm" name="dr" type="number" min="0" step="0.01" placeholder="ডেবিট"><input class="input col-span-3 !text-sm" name="cr" type="number" min="0" step="0.01" placeholder="ক্রেডিট"></div>`;
        return `<form id="vch" class="space-y-3"><div class="grid sm:grid-cols-3 gap-3"><div><label class="label">তারিখ</label><input type="date" class="input" name="date" value="${U.today()}" required></div><div class="sm:col-span-2"><label class="label">বিবরণ</label><input class="input" name="memo" required></div></div>
          <div class="grid grid-cols-12 gap-2 text-xs font-semibold text-slate-500"><div class="col-span-6">হিসাব</div><div class="col-span-3">ডেবিট ৳</div><div class="col-span-3">ক্রেডিট ৳</div></div><div id="jv-lines" class="space-y-2">${line()}${line()}</div>
          <button type="button" class="btn btn-ghost btn-sm" id="jv-add">${icon('plus')} লাইন যোগ করুন</button><div id="jv-tot" class="text-sm font-semibold"></div><button class="btn btn-primary w-full" id="jv-post">জাবেদা ভাউচার লিপিবদ্ধ করুন</button></form>`; })();
    Modal.open({ title: { PV: 'পরিশোধ ভাউচার', RV: 'প্রাপ্তি ভাউচার', JV: 'জাবেদা ভাউচার' }[kind], size: 'lg', body: `<div class="flex gap-1 mb-4">${['PV', 'RV', 'JV'].map(k => `<button class="btn btn-sm ${k === kind ? 'btn-primary' : 'btn-ghost'}" onclick="Finance.voucher('${k}')">${{ PV: 'পরিশোধ', RV: 'প্রাপ্তি', JV: 'জাবেদা' }[k]}</button>`).join('')}</div>${body}` });
    const f = $('#vch');
    if (!quick) {
      const tot = () => { let dr = 0, cr = 0; $$('.jv-line', f).forEach(l => { dr += +l.querySelector('[name=dr]').value || 0; cr += +l.querySelector('[name=cr]').value || 0; }); const ok = dr > 0 && Math.abs(dr - cr) < 0.005; $('#jv-tot').innerHTML = `মোট ডেবিট ${U.money(dr)} · মোট ক্রেডিট ${U.money(cr)} · ${ok ? '<span class="text-emerald-600">মিলেছে ✓</span>' : '<span class="text-red-600">মেলেনি</span>'}`; $('#jv-post').disabled = !ok; };
      $('#jv-add').addEventListener('click', () => { const tpl = $('.jv-line', f).cloneNode(true); tpl.querySelectorAll('input').forEach(i => i.value = ''); $('#jv-lines').appendChild(tpl); });
      f.addEventListener('input', tot); tot();
    }
    f.addEventListener('submit', e => {
      e.preventDefault(); const d = formData(f);
      try {
        let lines;
        if (quick) { const amt = +d.amount; lines = kind === 'PV' ? [{ acct: d.acct, dr: amt, cr: 0 }, { acct: d.cash, dr: 0, cr: amt }] : [{ acct: d.cash, dr: amt, cr: 0 }, { acct: d.acct, dr: 0, cr: amt }]; }
        else lines = $$('.jv-line', f).map(l => ({ acct: l.querySelector('[name=acct]').value, dr: +l.querySelector('[name=dr]').value || 0, cr: +l.querySelector('[name=cr]').value || 0 })).filter(l => l.dr || l.cr);
        const v = DB.postJournal(d.memo, lines, null, App.session.userId, d.date, { kind, campusId: d.campusId || null, payee: d.payee || null });
        DB.audit('VOUCHER_POST', 'journal', `${v.id} ${kind} ${U.money(U.sum(lines, l => l.dr))}: ${v.memo}`); DB.save();
        Modal.open({ title: `ভাউচার ${v.id} লিপিবদ্ধ হয়েছে`, size: 'sm', body: `<p class="text-sm">${esc(v.memo)} — ${U.money(U.sum(lines, l => l.dr))}</p>`, footer: `<button class="btn btn-primary" onclick="Print.show('voucher','${v.id}')">${icon('printer')} ভাউচার মুদ্রণ</button>` });
        App.refresh();
      } catch (err) { toast(err.message, 'error'); }
    });
  },

  /* ---------- MFS reconciliation ---------- */
  /** Every recorded MFS transaction (fees, admissions, service fees) for a provider and period. */
  records(provider, from, to) {
    const out = [];
    DB.s.payments.filter(p => p.method === provider && p.date >= from && p.date <= to).forEach(p => out.push({ src: 'payment', ref: p.id, trx: p.txn, amount: p.amount, date: p.date, who: DB.student(p.studentId)?.name, verified: p.verified !== false, obj: p }));
    DB.s.admissions.filter(a => a.payment?.method === provider && a.netPaid > 0 && a.payment.at.slice(0, 10) >= from && a.payment.at.slice(0, 10) <= to).forEach(a => out.push({ src: 'admission', ref: a.id, trx: a.payment.txn, amount: a.netPaid, date: a.payment.at.slice(0, 10), who: a.studentName, verified: a.payment.verified !== false, obj: a.payment }));
    DB.s.serviceRequests.filter(r => r.payment?.method === provider && r.payment.mode === 'Online' && r.createdAt.slice(0, 10) >= from && r.createdAt.slice(0, 10) <= to).forEach(r => out.push({ src: 'service', ref: r.id, trx: r.payment.trxId, amount: r.fee, date: r.createdAt.slice(0, 10), who: DB.student(r.studentId)?.name, verified: r.payment.verified !== false, obj: r.payment }));
    return out;
  },
  /** The merchant statement exported from the bKash / Nagad / Rocket merchant portal (CSV). */
  parseCsv(text) {
    const rows = text.trim().split(/\r?\n/).map(r => r.split(',').map(c => c.trim().replace(/^"|"$/g, '')));
    const head = rows.shift().map(h => h.toLowerCase());
    const ix = k => head.findIndex(h => h.includes(k));
    const t = ix('trx'), a = ix('amount'), d = ix('date'), m = ix('msisdn') >= 0 ? ix('msisdn') : ix('wallet');
    if (t < 0 || a < 0) throw new Error('সিএসভি-তে অন্তত "trxid" ও "amount" কলাম থাকতে হবে।');
    return rows.filter(r => r[t]).map(r => ({ trx: r[t].toUpperCase(), amount: +r[a], date: d >= 0 ? r[d] : '', msisdn: m >= 0 ? r[m] : '' }));
  },
  reconcile(provider, from, to, lines) {
    const recs = this.records(provider, from, to), byTrx = Object.fromEntries(recs.map(r => [String(r.trx).toUpperCase(), r]));
    const seen = new Set(), rows = [];
    lines.forEach(l => {
      const r = byTrx[l.trx.toUpperCase()];
      if (!r) rows.push({ status: 'Unclaimed', line: l });
      else { seen.add(r.ref); rows.push({ status: Math.abs(r.amount - l.amount) < 0.5 ? 'Matched' : 'Amount mismatch', line: l, rec: r }); }
    });
    recs.filter(r => !seen.has(r.ref)).forEach(r => rows.push({ status: 'Missing on statement', rec: r }));
    const run = { id: DB.id('REC'), provider, from, to, ts: new Date().toISOString(), by: App.session.userId, counts: {}, rows };
    rows.forEach(x => run.counts[x.status] = (run.counts[x.status] || 0) + 1);
    App.ui.recRun = run;
    return run;
  },
  confirmMatches() {
    const run = App.ui.recRun; let n = 0;
    run.rows.filter(r => r.status === 'Matched').forEach(r => { if (r.rec.obj.verified === false) n++; r.rec.obj.verified = true; r.rec.obj.reconciled = run.id; });
    DB.s.reconciliations.push({ id: run.id, provider: run.provider, from: run.from, to: run.to, ts: run.ts, by: run.by, counts: run.counts });
    DB.audit('MFS_RECONCILE', 'payments', `${run.provider} ${run.from}→${run.to}: ${JSON.stringify(run.counts)}; ${n}টি ট্রানজ্যাকশন আইডি নতুনভাবে যাচাইকৃত`); DB.save();
    toast(`মিলিয়ে দেখা সংরক্ষিত হয়েছে — ${bnNum(n)}টি অপেক্ষমাণ ট্রানজ্যাকশন আইডি (TrxID) যাচাই করা হয়েছে।`, 'success'); App.refresh();
  },
  reverse(ref) {
    const p = DB.s.payments.find(x => x.id === ref); if (!p) return;
    if (!confirm(`${p.id} (${U.money(p.amount)}, ট্রানজ্যাকশন আইডি (TrxID) ${p.txn}) প্রত্যাবর্তন করবেন? সংশ্লিষ্ট বিলগুলো অপরিশোধিত অবস্থায় ফিরে যাবে।`)) return;
    DB.s.invoices.filter(i => p.invoiceIds.includes(i.id)).forEach(i => { i.status = 'unpaid'; delete i.paymentId; });
    p.reversed = true; DB.s.payments = DB.s.payments.filter(x => x !== p);
    DB.postJournal(`${p.id}-এর প্রত্যাবর্তন — ট্রানজ্যাকশন আইডি (TrxID) ${p.txn} ${bn(p.method)} বিবরণীতে নেই`, [{ acct: '1100', dr: p.amount, cr: 0 }, { acct: DB.mfsAccount(p.method), dr: 0, cr: p.amount }], p.id, App.session.userId, null, { kind: 'JV' });
    DB.guardiansOf(p.studentId).forEach(g => DB.sms(g.phone, `${DB.s.school.shortName}: ${bn(p.method)} বিবরণীতে ট্রানজ্যাকশন আইডি ${p.txn} (${U.money(p.amount)}) খুঁজে পাওয়া যায়নি। অনুগ্রহ করে হিসাব শাখায় যোগাযোগ করুন।`));
    DB.audit('PAYMENT_REVERSE', 'payments', `${p.id} প্রত্যাবর্তন করা হয়েছে (TrxID ${p.txn})`); DB.save();
    App.ui.recRun.rows = App.ui.recRun.rows.filter(r => r.rec?.ref !== ref); App.refresh();
  },
  assignUnclaimed(trx, amount, provider) {
    Modal.open({
      title: `ট্রানজ্যাকশন আইডি (TrxID) ${esc(trx)} (${U.money(amount)}) নির্ধারণ করুন`, size: 'md',
      body: `<form id="asg" class="space-y-3"><div><label class="label">শিক্ষার্থী</label>${studentPicker('q', '', { required: true })}</div><button class="btn btn-primary w-full">অপরিশোধিত বিল খুঁজুন</button></form><div id="asg-out" class="mt-4"></div>`,
    });
    $('#asg').addEventListener('submit', e => {
      e.preventDefault(); const q = formData(e.target).q.toLowerCase();
      const st = DB.s.students.find(s => s.id.toLowerCase() === q) || DB.s.students.find(s => s.name.toLowerCase().includes(q));
      if (!st) return $('#asg-out').innerHTML = '<p class="text-sm text-red-600">কোনো শিক্ষার্থী পাওয়া যায়নি।</p>';
      const inv = DB.unpaid(st.id);
      $('#asg-out').innerHTML = `<div class="text-sm font-semibold mb-2">${esc(pn(st))} ·${esc(DB.className(st.classId))}</div>${inv.map(i => `<label class="flex items-center gap-2 text-sm"><input type="checkbox" class="asg-inv" value="${i.id}"> <span class="flex-1">${esc(i.item)}</span><b>${U.money(i.amount)}</b></label>`).join('') || '<p class="text-sm text-slate-500">কোনো অপরিশোধিত বিল নেই।</p>'}${inv.length ? `<button class="btn btn-success w-full mt-3" id="asg-go">পরিশোধ প্রয়োগ করুন</button>` : ''}`;
      $('#asg-go')?.addEventListener('click', () => {
        const ids = $$('.asg-inv:checked').map(x => x.value); const sum = U.sum(DB.s.invoices.filter(i => ids.includes(i.id)), i => i.amount);
        if (Math.abs(sum - amount) > 0.5) return toast(`নির্বাচিত বিলগুলোর মোট ${U.money(sum)}, কিন্তু ট্রানজ্যাকশন আইডি (TrxID)-এর পরিমাণ ${U.money(amount)}।`, 'error');
        const pay = DB.recordPayment(st.id, ids, provider, App.session.userId, { trxId: trx, channel: 'Reconciled (statement)', verified: true });
        pay.reconciled = App.ui.recRun?.id;
        DB.audit('PAYMENT_ASSIGN', 'payments', `দাবিহীন ${bn(provider)} TrxID ${trx} → ${pn(st)} (${pay.id})`); DB.save();
        App.ui.recRun.rows = App.ui.recRun.rows.map(r => r.line?.trx === trx ? { status: 'Matched', line: r.line, rec: { src: 'payment', ref: pay.id, trx, amount, who: st.name, obj: pay } } : r);
        Modal.close(); toast('পরিশোধ নির্ধারণ ও যাচাই করা হয়েছে।', 'success'); App.refresh();
      });
    });
  },
};

/* ------------------------------------------------------------- pages --- */
const financeOverview = {
  id: 'accounts', label: 'হিসাবের সারসংক্ষেপ', icon: 'landmark',
  render() {
    const filter = Finance.scopeFilter(), b = DB.balances(filter);
    const cash = b['1000'].balance + b['1010'].balance + b['1020'].balance;
    const inc = U.sum(Object.values(b).filter(a => a.type === 'Income'), a => a.balance), exp = U.sum(Object.values(b).filter(a => a.type === 'Expense'), a => a.balance);
    const months = Finance.monthly(filter);
    const canPost = App.can('ledger.post');
    return pageHeader('প্রতিষ্ঠানের হিসাব — আয়, ব্যয় ও খরচ', `শিক্ষাবর্ষ ${U.bn(DB.session())} · ব্যয়কেন্দ্র: ${App.ui.finCC && App.ui.finCC !== 'ALL' ? esc(DB.campus(App.ui.finCC).name) : 'সকল ক্যাম্পাস'}`, Finance.ccSelect() + (canPost ? `<button class="btn btn-primary" onclick="Finance.voucher('PV')">${icon('arrow-up-right')} পরিশোধ ভাউচার</button><button class="btn btn-ghost" onclick="Finance.voucher('RV')">${icon('arrow-down-left')} প্রাপ্তি</button><button class="btn btn-ghost" onclick="Finance.voucher('JV')">${icon('book-open-text')} জাবেদা</button>` : ''))
      + `<div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">${kpi('নগদ অর্থ · ব্যাংক · এমএফএস', U.money(cash), `এমএফএস ওয়ালেট ${U.money(b['1020'].balance)}`, 'landmark', 'blue')}${kpi('চলতি বছরের আয়', U.money(inc), `প্রাপ্য ${U.money(b['1100'].balance)}`, 'trending-up', 'green')}${kpi('চলতি বছরের ব্যয়', U.money(exp), `${bnNum(Finance.catTotals('Expense', filter).length)}টি ব্যয়ের খাত`, 'trending-down', 'red')}${kpi('নিট উদ্বৃত্ত', U.money(inc - exp), `${bnNum(inc ? ((inc - exp) / inc * 100).toFixed(1) : 0)}% মার্জিন`, 'piggy-bank', inc - exp >= 0 ? 'violet' : 'red')}</div>
      <div class="card p-5 mb-5"><div class="flex flex-wrap items-center gap-3"><div class="font-semibold">মাসভিত্তিক আয় বনাম ব্যয়</div><div class="flex gap-3 text-xs ml-auto"><span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-emerald-500"></span>আয়</span><span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-rose-500"></span>ব্যয়</span></div></div>
        ${miniBars(months.map(([mk, r]) => ({ label: U.monthName(mk).split(' ')[0], values: [{ label: 'আয়', v: Math.max(0, r.inc), cls: 'bg-emerald-500' }, { label: 'ব্যয়', v: Math.max(0, r.exp), cls: 'bg-rose-500' }] })))}</div>
      <div class="grid lg:grid-cols-2 gap-5"><div class="card p-5"><div class="font-semibold mb-4">ব্যয়ের খাতভিত্তিক ব্যয়</div>${Finance.barList(Finance.catTotals('Expense', filter), 'bg-rose-500')}</div>
        <div class="card p-5"><div class="font-semibold mb-4">উৎসভিত্তিক আয়</div>${Finance.barList(Finance.catTotals('Income', filter), 'bg-emerald-500')}</div></div>
      <div class="card mt-5 scroll-x"><div class="px-5 py-3 border-b border-slate-100 font-semibold">মাসিক বিবরণী</div><table class="table"><thead><tr><th>মাস</th><th class="text-right">আয়</th><th class="text-right">ব্যয়</th><th class="text-right">উদ্বৃত্ত</th></tr></thead><tbody>${months.map(([mk, r]) => `<tr><td>${U.monthName(mk)}</td><td class="text-right">${U.money(r.inc)}</td><td class="text-right">${U.money(r.exp)}</td><td class="text-right font-semibold ${r.inc - r.exp < 0 ? 'text-red-600' : ''}">${U.money(r.inc - r.exp)}</td></tr>`).join('')}</tbody></table></div>`;
  },
};

App.addPage('admin', financeOverview, 'system');
App.addPage('principal', { ...financeOverview, label: 'আর্থিক সারসংক্ষেপ' }, 'profile');

App.addPage('admin', {
  id: 'ledger', label: 'জাবেদা ও ভাউচার', icon: 'book-open-text',
  render() {
    const ui = App.ui.jl || (App.ui.jl = { kind: 'ALL', q: '' });
    const filter = Finance.scopeFilter(), b = DB.balances(filter), list = Object.values(b);
    const vs = [...DB.s.journal].reverse().filter(v => (!filter || filter(v)) && (ui.kind === 'ALL' || (v.kind || 'JV') === ui.kind) && (!ui.q || (v.memo + v.id + (v.payee || '')).toLowerCase().includes(ui.q.toLowerCase())));
    const totDr = U.sum(list, a => Math.max(0, a.dr - a.cr)), totCr = U.sum(list, a => Math.max(0, a.cr - a.dr));
    return pageHeader('সাধারণ লেজার — জাবেদা ও ভাউচার', '',Finance.ccSelect() + (App.can('ledger.post') ? `<button class="btn btn-primary" onclick="Finance.voucher('PV')">${icon('plus')} নতুন ভাউচার</button>` : ''))
      + `<div class="grid xl:grid-cols-5 gap-5"><div class="card xl:col-span-2 scroll-x self-start"><div class="px-5 py-3 border-b border-slate-100 font-semibold flex justify-between">রেওয়ামিল ${Math.abs(totDr - totCr) < 0.01 ? badge('মিলেছে', 'green') : badge('অমিল', 'red')}</div>
        <table class="table"><thead><tr><th>হিসাব</th><th class="text-right">ডেবিট</th><th class="text-right">ক্রেডিট</th></tr></thead><tbody>${['Asset', 'Liability', 'Equity', 'Income', 'Expense'].map(t => `<tr><td colspan="3" class="!bg-slate-50 text-xs font-bold uppercase text-slate-500">${bn(t)}</td></tr>` + list.filter(a => a.type === t).map(a => { const d = a.dr - a.cr; return `<tr><td><span class="font-mono text-xs text-slate-400">${a.code}</span> ${esc(a.name)}</td><td class="text-right">${d > 0 ? U.money(d) : ''}</td><td class="text-right">${d < 0 ? U.money(-d) : ''}</td></tr>`; }).join('')).join('')}
        <tr class="font-bold"><td>মোট</td><td class="text-right">${U.money(totDr)}</td><td class="text-right">${U.money(totCr)}</td></tr></tbody></table></div>
        <div class="card xl:col-span-3"><div class="px-5 py-3 border-b border-slate-100 flex flex-wrap gap-2 items-center"><div class="font-semibold mr-auto">ভাউচার (${bnNum(vs.length)})</div>${['ALL', 'PV', 'RV', 'JV'].map(k => `<button class="btn btn-sm ${ui.kind === k ? 'btn-primary' : 'btn-ghost'}" onclick="App.ui.jl.kind='${k}';App.refresh()">${{ ALL: 'সকল', PV: 'পরিশোধ', RV: 'প্রাপ্তি', JV: 'জাবেদা' }[k]}</button>`).join('')}<input id="jl-q" class="input !w-48 !py-1" placeholder="অনুসন্ধান…" value="${esc(ui.q)}"></div>
          <div class="max-h-[640px] overflow-y-auto divide-y divide-slate-100">${vs.slice(0, 80).map(v => `<details class="px-5 py-2.5"><summary class="cursor-pointer flex flex-wrap items-center gap-2 text-sm">${badge(bn(v.kind || 'JV'),{ PV: 'red', RV: 'green', JV: 'slate' }[v.kind || 'JV'])}<span class="font-mono text-xs text-slate-400">${v.id}</span><span class="text-xs text-slate-500">${U.fmtDate(v.date)}</span><span class="flex-1 min-w-0 truncate">${esc(v.memo)}</span>${v.campusId ? `<span class="text-[10px] text-slate-400">${esc(DB.campus(v.campusId).short)}</span>` : ''}<b>${U.money(U.sum(v.lines, l => l.dr))}</b></summary>
            <table class="table mt-2"><tbody>${v.lines.map(l => `<tr><td class="text-xs">${l.acct} · ${esc(b[l.acct]?.name || '')}</td><td class="text-right text-xs">${l.dr ? U.money(l.dr) : ''}</td><td class="text-right text-xs">${l.cr ? U.money(l.cr) : ''}</td></tr>`).join('')}</tbody></table>
            <div class="flex gap-2 mt-2">${v.payee ? `<span class="text-xs text-slate-500">প্রাপক: ${esc(v.payee)}</span>` : ''}<button class="btn btn-ghost btn-sm ml-auto" onclick="Print.show('voucher','${v.id}')">${icon('printer')} মুদ্রণ</button></div></details>`).join('')}</div></div></div>`;
  },
  mount() { let t; $('#jl-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { App.ui.jl.q = e.target.value; App.refresh(); const el = $('#jl-q'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 250); }); },
}, 'accounts');

App.addPage('admin', {
  id: 'coa', label: 'হিসাবের খাত তালিকা', icon: 'list-tree',
  render() {
    const b = DB.balances(), cats = [...new Set(DB.s.accounts.map(a => a.category).filter(Boolean))];
    return pageHeader('হিসাবের খাত তালিকা', '',App.can('ledger.post') ? `<button class="btn btn-primary" onclick="document.getElementById('coa-form').classList.toggle('hidden')">${icon('plus')} হিসাব যোগ করুন</button>` : '')
      + `<form id="coa-form" class="card p-4 mb-4 grid sm:grid-cols-5 gap-3 items-end hidden"><div><label class="label">কোড</label><input class="input font-mono" name="code" pattern="[0-9]{4}" required></div><div class="sm:col-span-2"><label class="label">নাম</label><input class="input" name="name" required></div>
        <div><label class="label">ধরন</label><select class="select" name="type">${['Asset', 'Liability', 'Equity', 'Income', 'Expense'].map(t => `<option value="${t}">${bn(t)}</option>`).join('')}</select></div><div><label class="label">ব্যয়ের খাত</label><input class="input" name="category" list="coa-cats"><datalist id="coa-cats">${cats.map(c => `<option>${esc(c)}</option>`).join('')}</datalist></div>
        <div class="sm:col-span-5"><button class="btn btn-primary">হিসাব তৈরি করুন</button></div></form>
      <div class="card scroll-x"><table class="table"><thead><tr><th>কোড</th><th>হিসাব</th><th>ধরন</th><th>ব্যয়ের খাত</th><th class="text-right">ডেবিট</th><th class="text-right">ক্রেডিট</th><th class="text-right">স্থিতি</th></tr></thead><tbody>
      ${DB.s.accounts.map(a => { const x = b[a.code]; return `<tr><td class="font-mono">${a.code}</td><td class="font-semibold">${esc(a.name)}</td><td>${badge(bn(a.type),{ Asset: 'blue', Liability: 'amber', Equity: 'violet', Income: 'green', Expense: 'red' }[a.type])}</td><td>${a.type === 'Expense' && App.can('ledger.post') ? `<input class="input !py-1 !text-xs !w-40" value="${esc(a.category || '')}" list="coa-cats" onchange="(DB.s.accounts.find(x=>x.code==='${a.code}').category=this.value),DB.audit('COA_EDIT','accounts','${a.code} ব্যয়ের খাত → '+this.value),DB.save()">` : esc(a.category || '—')}</td><td class="text-right">${U.money(x.dr)}</td><td class="text-right">${U.money(x.cr)}</td><td class="text-right font-bold">${U.money(x.balance)}</td></tr>`; }).join('')}</tbody></table></div>`;
  },
  mount() {
    $('#coa-form')?.addEventListener('submit', e => {
      e.preventDefault(); const f = formData(e.target);
      if (DB.s.accounts.some(a => a.code === f.code)) return toast('এই হিসাব কোড ইতোমধ্যে রয়েছে।', 'error');
      DB.s.accounts.push({ code: f.code, name: f.name, type: f.type, category: f.category || null }); DB.s.accounts.sort((a, b) => a.code.localeCompare(b.code));
      DB.audit('COA_ADD', 'accounts', `${f.code} ${f.name} (${bn(f.type)})`); DB.save(); toast('হিসাব তৈরি করা হয়েছে।', 'success'); App.refresh();
    });
  },
}, 'ledger');

App.addPage('admin', {
  id: 'reconcile', label: 'এমএফএস মিলিয়ে দেখা', icon: 'scan-search',
  count: () => (DB.s.payments.filter(p => p.verified === false).length + DB.s.admissions.filter(a => a.payment?.verified === false).length + DB.s.serviceRequests.filter(r => r.payment?.verified === false).length) || '',
  render() {
    const ui = App.ui.rec || (App.ui.rec = { provider: 'bKash', from: U.iso(U.addDays(new Date(), -30)), to: U.today() });
    const run = App.ui.recRun && App.ui.recRun.provider === ui.provider ? App.ui.recRun : null;
    const pending = MFS.map(m => [m, Finance.records(m, '2000-01-01', '2999-12-31').filter(r => !r.verified).length]);
    const tone = { Matched: 'green', 'Amount mismatch': 'red', Unclaimed: 'amber', 'Missing on statement': 'red' };
    return pageHeader('এমএফএস পরিশোধ মিলিয়ে দেখা', '')
      + `<div class="grid grid-cols-3 gap-3 mb-5">${pending.map(([m, n]) => `<div class="card kpi flex items-center gap-3"><div class="w-10 h-10 rounded-xl text-white font-extrabold flex items-center justify-center" style="background:${Pub.COLORS[m]}">${bn(m)[0]}</div><div><div class="l">${bn(m)}</div><div class="v">${bnNum(n)}</div><div class="text-xs text-slate-500">যাচাইয়ের অপেক্ষায় থাকা ট্রানজ্যাকশন আইডি (TrxID)</div></div></div>`).join('')}</div>
      <form id="rec-form" class="card p-4 mb-4 grid sm:grid-cols-6 gap-3 items-end"><div><label class="label">সেবাদাতা</label><select class="select" name="provider">${MFS.map(m => `<option value="${m}" ${m === ui.provider ? 'selected' : ''}>${bn(m)}</option>`).join('')}</select></div><div><label class="label">হতে</label><input type="date" class="input" name="from" value="${ui.from}"></div><div><label class="label">পর্যন্ত</label><input type="date" class="input" name="to" value="${ui.to}"></div>
        <label class="btn btn-primary cursor-pointer sm:col-span-2">${icon('upload')} বিবরণীর সিএসভি আপলোড করুন<input type="file" accept=".csv,text/csv" class="hidden" id="rec-csv"></label><button type="button" class="btn btn-ghost" id="rec-dl">${icon('download')} খালি সিএসভি ছক</button></form>
      ${run ? `<div class="card"><div class="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2"><div class="font-semibold mr-auto">${esc(bn(run.provider))} · ${U.fmtDate(run.from)} → ${U.fmtDate(run.to)}</div>${Object.entries(run.counts).map(([k, v]) => badge(`${Finance.ST[k] || k}: ${bnNum(v)}`, tone[k])).join('')}<button class="btn btn-success btn-sm" onclick="Finance.confirmMatches()">${icon('check-check')} মিলগুলো নিশ্চিত করুন</button></div>
        <div class="scroll-x"><table class="table"><thead><tr><th>অবস্থা</th><th>ট্রানজ্যাকশন আইডি (TrxID)</th><th>বিবরণী</th><th>আমাদের রেকর্ড</th><th>পরিশোধকারী</th><th></th></tr></thead><tbody>${run.rows.map(r => `<tr><td>${badge(Finance.ST[r.status] || r.status, tone[r.status])}</td><td class="font-mono text-xs">${esc(r.line?.trx || r.rec?.trx)}</td><td class="text-xs">${r.line ? `${U.money(r.line.amount)} · ${r.line.date ? (/^\d{4}-\d{2}-\d{2}$/.test(r.line.date) ? U.fmtDate(r.line.date) : esc(r.line.date)) : ''}` : '—'}</td><td class="text-xs">${r.rec ? `${U.money(r.rec.amount)} · ${esc(Finance.SRC[r.rec.src] || r.rec.src)} ${esc(r.rec.ref)}${r.rec.verified ? '' : ' ' + badge('অযাচাইকৃত ছিল', 'amber')}` : '—'}</td><td class="text-xs">${esc(r.rec?.who || r.line?.msisdn || '')}</td>
          <td>${r.status === 'Unclaimed' ? `<button class="btn btn-ghost btn-sm" onclick="Finance.assignUnclaimed('${r.line.trx}',${r.line.amount},'${run.provider}')">নির্ধারণ করুন</button>` : r.status === 'Missing on statement' && r.rec.src === 'payment' ? `<button class="btn btn-ghost btn-sm text-red-600" onclick="Finance.reverse('${r.rec.ref}')">প্রত্যাবর্তন করুন</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>` : `<div class="card p-6 text-sm text-slate-500">${icon('info', 'w-4 h-4 inline')} বিবরণীর সিএসভি কলাম: <code>trxid, amount, date, msisdn</code></div>`}
      <div class="card mt-5"><div class="px-5 py-3 border-b border-slate-100 font-semibold">মিলিয়ে দেখার ইতিহাস</div><div class="divide-y divide-slate-100 text-sm">${[...DB.s.reconciliations].reverse().map(r => `<div class="px-5 py-2.5 flex flex-wrap gap-2"><b>${esc(bn(r.provider))}</b><span class="text-slate-500">${U.fmtDate(r.from)} → ${U.fmtDate(r.to)}</span><span class="text-xs text-slate-400">${U.fmtTime(r.ts)}</span><span class="ml-auto">${Object.entries(r.counts).map(([k, v]) => badge(`${Finance.ST[k] || k} ${bnNum(v)}`, tone[k])).join(' ')}</span></div>`).join('') || emptyState('এখনো কিছু মিলিয়ে দেখা হয়নি।')}</div></div>`;
  },
  mount() {
    const f = $('#rec-form'), read = () => { Object.assign(App.ui.rec, { provider: f.provider.value, from: f.from.value, to: f.to.value }); return App.ui.rec; };
    f.addEventListener('submit', e => e.preventDefault());
    $('#rec-csv').addEventListener('change', e => { const file = e.target.files[0]; if (!file) return; const fr = new FileReader(); fr.onload = () => { try { const u = read(); Finance.reconcile(u.provider, u.from, u.to, Finance.parseCsv(fr.result)); App.refresh(); } catch (err) { toast(err.message, 'error'); } }; fr.readAsText(file); });
    $('#rec-dl').addEventListener('click', () => { const u = read(); downloadFile(`${u.provider}-statement-${u.from}_${u.to}.csv`, U.csv([['trxid', 'amount', 'date', 'msisdn']]), 'text/csv'); });
  },
}, 'coa');
