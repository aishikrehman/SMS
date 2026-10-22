/* ==========================================================================
   MIS REPORTING & ANALYTICS DASHBOARD
   Institution-wide KPIs, attendance trend, daily cash flow, financial status,
   academic progress and enrolment analytics — per campus or all campuses.
   Charts are self-contained (inline SVG / div bars) and follow the theme.
   ========================================================================== */

const MIS = {
  CASH: ['1000', '1010', '1020'],
  FUNNEL: ['Pending', 'Selected', 'Waiting', 'Approved', 'Declined'],

  scope() { return App.ui.misCampus || DB.campusId(); },
  inScope(classId, cp = this.scope()) { return cp === 'ALL' || DB.campusOf(classId) === cp; },
  students(cp = this.scope()) { return DB.activeStudents(cp); },
  pct(n, d) { return d ? n / d * 100 : 0; },
  pctFmt(v) { return v === null || v === undefined || isNaN(v) ? '—' : `${bnNum(v.toFixed(1))}%`; },

  /* ---------- charts ---------- */
  /** Inline-SVG line chart. points = [{label, v}] ; opts {max, min, fmt, color, height, target}. */
  lineChart(points, opts = {}) {
    if (!points.length) return emptyState('এখনো কোনো তথ্য নেই।', 'line-chart');
    const W = 640, H = opts.height || 200, L = 36, R = 10, T = 12, B = 26;
    const vals = points.map(p => p.v).filter(v => v !== null && v !== undefined);
    const max = opts.max ?? Math.max(1, ...vals), min = opts.min ?? 0, span = (max - min) || 1;
    const fmt = opts.fmt || (v => bnNum(Math.round(v))), color = opts.color || 'var(--brand)';
    const x = i => L + (points.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (points.length - 1));
    const y = v => T + (1 - (v - min) / span) * (H - T - B);
    const ticks = [0, 0.25, 0.5, 0.75, 1].map(k => min + span * k);
    const pts = points.map((p, i) => p.v === null || p.v === undefined ? null : [x(i), y(p.v)]).filter(Boolean);
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const area = pts.length ? `${path} L${pts[pts.length - 1][0].toFixed(1)},${(H - B)} L${pts[0][0].toFixed(1)},${H - B} Z` : '';
    const every = Math.max(1, Math.ceil(points.length / 8));
    return `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto" role="img" aria-label="${esc(opts.title || 'রেখাচিত্র')}">
      ${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="#e2e8f0" stroke-width="1"/><text x="${L - 4}" y="${y(t) + 3}" text-anchor="end" font-size="9" fill="#94a3b8">${esc(fmt(t))}</text>`).join('')}
      ${opts.target !== undefined ? `<line x1="${L}" x2="${W - R}" y1="${y(opts.target)}" y2="${y(opts.target)}" stroke="var(--accent)" stroke-dasharray="4 3" stroke-width="1"/><text x="${W - R}" y="${y(opts.target) - 3}" text-anchor="end" font-size="9" fill="var(--accent)">লক্ষ্যমাত্রা ${esc(fmt(opts.target))}</text>` : ''}
      ${area ? `<path d="${area}" fill="${color}" opacity="0.08"/>` : ''}
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${points.map((p, i) => p.v === null || p.v === undefined ? '' : `<circle cx="${x(i)}" cy="${y(p.v)}" r="2.6" fill="${color}"><title>${esc(p.label)}: ${esc(fmt(p.v))}</title></circle>`).join('')}
      ${points.map((p, i) => (i % every === 0 && points.length - 1 - i >= every / 2) || i === points.length - 1 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="9" fill="#64748b">${esc(p.short || p.label)}</text>` : '').join('')}
    </svg>`;
  },
  /** Paired vertical bars (e.g. inflow vs outflow). rows = [{label, a, b}] */
  pairBars(rows, la, lb, fmt = U.money) {
    const max = Math.max(1, ...rows.flatMap(r => [r.a, r.b]));
    return `<div class="flex items-center gap-4 text-xs text-slate-500 mb-1"><span class="flex items-center gap-1"><i class="inline-block w-3 h-3 rounded-sm" style="background:var(--brand)"></i>${esc(la)}</span><span class="flex items-center gap-1"><i class="inline-block w-3 h-3 rounded-sm" style="background:var(--accent)"></i>${esc(lb)}</span></div>
      <div class="flex items-end gap-1.5 h-44 pt-2">${rows.map(r => `<div class="flex-1 flex flex-col items-center gap-1 min-w-0"><div class="flex items-end gap-0.5 h-36 w-full justify-center">
        <div title="${esc(r.label)} · ${esc(la)}: ${fmt(r.a)}" class="w-1/2 max-w-[14px] rounded-t" style="background:var(--brand);height:${Math.max(r.a ? 2 : 0, r.a / max * 100)}%"></div>
        <div title="${esc(r.label)} · ${esc(lb)}: ${fmt(r.b)}" class="w-1/2 max-w-[14px] rounded-t" style="background:var(--accent);height:${Math.max(r.b ? 2 : 0, r.b / max * 100)}%"></div>
      </div><div class="text-[10px] text-slate-500 truncate">${esc(r.label)}</div></div>`).join('')}</div>`;
  },
  /** Horizontal bars. rows = [{label, v, sub?}] with v in 0..max */
  hBars(rows, max = 100, fmt = v => `${bnNum(v.toFixed(1))}%`, color = 'var(--brand)') {
    return `<div class="space-y-2.5">${rows.map(r => `<div><div class="flex justify-between text-sm gap-2"><span class="truncate">${esc(r.label)}</span><span class="font-semibold shrink-0">${fmt(r.v)}${r.sub ? ` <span class="text-slate-400 font-normal text-xs">${esc(r.sub)}</span>` : ''}</span></div>
      <div class="h-2 rounded-full bg-slate-100 mt-1 overflow-hidden"><div class="h-full rounded-full" style="background:${color};width:${U.clamp(max ? r.v / max * 100 : 0, 0, 100)}%"></div></div></div>`).join('') || emptyState('কোনো তথ্য নেই।')}</div>`;
  },

  /* ---------- data ---------- */
  /** Daily student attendance % for the scope: [{date, pct, present, counted}] sorted ascending (dates with data only, ≤ today). */
  attendanceDaily(cp = this.scope()) {
    const by = {}, today = U.today();
    this.students(cp).forEach(st => Object.entries(DB.s.attendance[st.id] || {}).forEach(([d, m]) => {
      if (d > today) return;
      const r = by[d] || (by[d] = { present: 0, counted: 0, total: 0 });
      r.total++; if (m === 'E') return; r.counted++; if (m === 'P' || m === 'L') r.present++;
    }));
    // Ignore days where only a handful of registers are in (e.g. today, while marking is in progress).
    const min = Math.max(1, Math.ceil(this.students(cp).length * 0.5));
    return Object.entries(by).filter(([, r]) => r.total >= min).sort(([a], [b]) => a.localeCompare(b)).map(([date, r]) => ({ date, ...r, pct: this.pct(r.present, r.counted) }));
  },
  staffToday(cp = this.scope()) {
    const sa = DB.s.staffAttendance || {}, emps = DB.employees(cp);
    let last = null; const today = U.today(), cnt = {}, min = Math.max(1, Math.ceil(emps.length * 0.5));
    emps.forEach(e => Object.keys(sa[e.id] || {}).forEach(d => { if (d <= today) cnt[d] = (cnt[d] || 0) + 1; }));
    Object.entries(cnt).forEach(([d, n]) => { if (n >= min && (!last || d > last)) last = d; });
    if (!last && cnt[today]) last = today;
    if (!last) return { date: null, present: 0, total: emps.length };
    const present = emps.filter(e => ['P', 'L'].includes((sa[e.id] || {})[last])).length;
    return { date: last, present, total: emps.length };
  },
  cashFilter(cp) { return cp === 'ALL' ? () => true : v => v.campusId === cp || !v.campusId; },
  /** Last `n` calendar days of cash/bank/MFS movement. Pure internal transfers between cash accounts are excluded. */
  cashFlow(cp = this.scope(), n = 14) {
    const days = Array.from({ length: n }, (_, k) => U.iso(U.addDays(new Date(), k - n + 1)));
    const rows = Object.fromEntries(days.map(d => [d, { date: d, in1000: 0, in1010: 0, in1020: 0, out: 0, inflow: 0 }]));
    const f = this.cashFilter(cp);
    DB.s.journal.filter(v => rows[v.date] && f(v)).forEach(v => {
      if (v.lines.every(l => this.CASH.includes(l.acct))) return;     // e.g. MFS → bank settlement
      v.lines.filter(l => this.CASH.includes(l.acct)).forEach(l => {
        const r = rows[v.date]; r['in' + l.acct] += +l.dr || 0; r.inflow += +l.dr || 0; r.out += +l.cr || 0;
      });
    });
    return days.map(d => ({ ...rows[d], net: rows[d].inflow - rows[d].out }));
  },
  incomeExpenseYtd(cp = this.scope()) {
    const yr = String(new Date().getFullYear()), f = cp === 'ALL' ? null : this.cashFilter(cp);
    let months;
    if (typeof Finance !== 'undefined' && Finance.monthly) months = Finance.monthly(f);
    else {
      const acc = Object.fromEntries(DB.s.accounts.map(a => [a.code, a])), by = {};
      DB.s.journal.filter(v => !f || f(v)).forEach(v => v.lines.forEach(l => { const a = acc[l.acct]; if (!a || (a.type !== 'Income' && a.type !== 'Expense')) return; const r = by[v.date.slice(0, 7)] || (by[v.date.slice(0, 7)] = { inc: 0, exp: 0 }); if (a.type === 'Income') r.inc += l.cr - l.dr; else r.exp += l.dr - l.cr; }));
      months = Object.entries(by).sort(([a], [b]) => a.localeCompare(b));
    }
    months = months.filter(([mk]) => mk.startsWith(yr));
    return { months, inc: U.sum(months, m => m[1].inc), exp: U.sum(months, m => m[1].exp) };
  },
  feeRates(cp = this.scope()) {
    const ses = DB.session(), byStu = {};
    DB.s.invoices.forEach(i => { if (i.status === 'paid' || i.status === 'unpaid') (byStu[i.studentId] || (byStu[i.studentId] = [])).push(i); });
    return DB.classesIn(cp).map(c => {
      const invs = DB.s.students.filter(s => s.classId === c.id && s.status === 'active').flatMap(s => (byStu[s.id] || []).filter(i => String(i.month || i.due || '').startsWith(ses)));
      const billed = U.sum(invs, i => i.amount), paid = U.sum(invs.filter(i => i.status === 'paid'), i => i.amount);
      return { classId: c.id, name: DB.className(c.id), billed, paid, outstanding: billed - paid, rate: this.pct(paid, billed) };
    });
  },
  defaulters(cp = this.scope(), n = 10) {
    return this.students(cp).map(st => ({ st, dues: DB.dues(st.id), count: DB.unpaid(st.id).length, oldest: DB.unpaid(st.id).map(i => i.due).sort()[0] })).filter(x => x.dues > 0).sort((a, b) => b.dues - a.dues).slice(0, n);
  },
  majorExams() { return [...DB.s.exams].filter(e => e.published && MAJOR_EXAMS.includes(e.type)).sort((a, b) => a.start.localeCompare(b.start)).slice(-4); },
  /** Per-render cache of DB.result (expensive). */
  _rc: null,
  res(stId, exId) { const k = stId + '|' + exId; return this._rc[k] || (this._rc[k] = DB.result(stId, exId)); },
  academic(cp = this.scope()) {
    const exams = this.majorExams(), latest = DB.latestExam();
    const classes = DB.classesIn(cp).map(c => {
      const sts = DB.s.students.filter(s => s.classId === c.id && s.status === 'active');
      const gpas = {};
      exams.forEach(ex => { const g = sts.map(s => this.res(s.id, ex.id)).filter(r => r.rows.length && r.gpa !== null).map(r => r.gpa); gpas[ex.id] = g.length ? U.sum(g) / g.length : null; });
      let pass = null, sat = 0;
      if (latest) { const rs = sts.map(s => this.res(s.id, latest.id)).filter(r => r.rows.length); sat = rs.length; pass = rs.length ? this.pct(rs.filter(r => r.passed).length, rs.length) : null; }
      return { classId: c.id, name: DB.className(c.id), gpas, pass, sat };
    });
    let subjects = [];
    if (latest) {
      const ids = new Set(this.students(cp).map(s => s.id)), max = (latest.cqMax || 0) + (latest.mcqMax || 0) + (latest.prMax || 0), acc = {};
      DB.s.marks.forEach(m => { if (m.examId !== latest.id || !ids.has(m.studentId)) return; const a = acc[m.subjectId] || (acc[m.subjectId] = { t: 0, n: 0 }); a.t += (+m.cq || 0) + (+m.mcq || 0) + (+m.pr || 0); a.n++; });
      subjects = DB.s.subjects.filter(s => acc[s.id]).map(s => ({ id: s.id, name: s.name, n: acc[s.id].n, avg: max ? acc[s.id].t / acc[s.id].n / max * 100 : 0 }));
    }
    return { exams, latest, classes, subjects };
  },
  enrolment(cp = this.scope()) {
    return DB.classesIn(cp).map(c => {
      const sts = DB.s.students.filter(s => s.classId === c.id && s.status === 'active');
      const m = sts.filter(s => s.gender === 'Male').length, f = sts.filter(s => s.gender === 'Female').length;
      return { classId: c.id, name: DB.className(c.id), campus: DB.campus(c.campusId)?.short || c.campusId, male: m, female: f, other: sts.length - m - f, total: sts.length };
    });
  },
  funnel(cp = this.scope()) {
    const apps = DB.s.admissions.filter(a => cp === 'ALL' || (a.campusId || DB.campusOf(a.classId)) === cp);
    const counts = Object.fromEntries(this.FUNNEL.map(k => [k, apps.filter(a => a.status === k).length]));
    return { total: apps.length, counts };
  },
  kpis(cp = this.scope()) {
    const today = U.today(), sts = this.students(cp), ids = new Set(sts.map(s => s.id));
    const att = this.attendanceDaily(cp), last = att[att.length - 1];
    const payToday = DB.s.payments.filter(p => p.date === today && ids.has(p.studentId));
    const outstanding = U.sum(DB.s.invoices.filter(i => i.status === 'unpaid' && ids.has(i.studentId)), i => i.amount);
    const recv = DB.balances(cp === 'ALL' ? null : this.cashFilter(cp))['1100']?.balance || 0;
    const pendAdm = DB.s.admissions.filter(a => a.status === 'Pending' && (cp === 'ALL' || (a.campusId || DB.campusOf(a.classId)) === cp)).length;
    const pendSr = (DB.s.serviceRequests || []).filter(r => r.status === 'Pending' && ids.has(r.studentId)).length;
    const byCampus = !multiCampus() ? '' : DB.s.campuses.filter(c => cp === 'ALL' || c.id === cp).map(c => `${c.short || c.name}: ${bnNum(DB.activeStudents(c.id).length)}`).join(' · ');
    return { enrol: sts.length, byCampus, att: last, payToday, collected: U.sum(payToday, p => p.amount), outstanding, recv, staff: this.staffToday(cp), pendAdm, pendSr };
  },

  /* ---------- page ---------- */
  render() {
    this._rc = {};
    const cp = this.scope(), k = this.kpis(cp), scopeName = !multiCampus() ? (DB.s.school.nameBn || DB.s.school.name) : cp === 'ALL' ? 'সকল ক্যাম্পাস' : DB.campus(cp)?.name;
    const att = this.attendanceDaily(cp).filter(d => U.isSchoolDay(d.date, null, cp === 'ALL' ? null : cp)).slice(-30);
    const cash = this.cashFlow(cp), ie = this.incomeExpenseYtd(cp), fees = this.feeRates(cp), defs = this.defaulters(cp);
    const ac = this.academic(cp), en = this.enrolment(cp), fn = this.funnel(cp);
    const minAtt = DB.s.school.minAttendance || 75;
    const attAvg = att.length ? U.sum(att, d => d.pct) / att.length : null;
    const staffSub = k.staff.date ? `${U.fmtDate(k.staff.date)} · মোট ${bnNum(k.staff.total)} জনের মধ্যে` : `এখনো কর্মীদের উপস্থিতির তথ্য নেই · ${bnNum(k.staff.total)} জন কর্মী`;
    const head = pageHeader('এমআইএস বিশ্লেষণ', `<b>${esc(scopeName)}</b> · শিক্ষাবর্ষ ${esc(U.bn(DB.session()))} · প্রস্তুতের সময় ${U.fmtTime(Date.now())}`,
      `${multiCampus() ? `<select class="select !w-auto" onchange="App.ui.misCampus=this.value;App.refresh()" aria-label="ক্যাম্পাসের পরিসর"><option value="${DB.campusId()}" ${cp === DB.campusId() ? 'selected' : ''}>সক্রিয় ক্যাম্পাস (${esc(DB.campus()?.short || DB.campusId())})</option>${DB.s.campuses.filter(c => c.id !== DB.campusId()).map(c => `<option value="${c.id}" ${cp === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}<option value="ALL" ${cp === 'ALL' ? 'selected' : ''}>সকল ক্যাম্পাস</option></select>` : ''}
       <button class="btn btn-ghost" onclick="MIS.exportCsv()">${icon('file-spreadsheet')} স্ন্যাপশট এক্সপোর্ট করুন (সিএসভি)</button>`);
    const card = (title, body, extra = '') => `<div class="card"><div class="px-5 py-3 border-b border-slate-100 font-semibold flex flex-wrap justify-between items-center gap-2"><span>${title}</span>${extra}</div><div class="p-5">${body}</div></div>`;

    const kpiRow = `<div class="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
      ${kpi('ভর্তিকৃত শিক্ষার্থী', bnNum(k.enrol, true), esc(k.byCampus), 'users', 'blue')}
      ${kpi('উপস্থিতি (সর্বশেষ দিন)', k.att ? this.pctFmt(k.att.pct) : '—', k.att ? `${U.fmtDate(k.att.date)} · ${bnNum(k.att.present)}/${bnNum(k.att.counted)}` : 'উপস্থিতির কোনো তথ্য নেই', 'calendar-check', k.att && k.att.pct < minAtt ? 'red' : 'green')}
      ${kpi('আজকের আদায়', U.money(k.collected), `${bnNum(k.payToday.length)}টি রসিদ · ${U.fmtDate(U.today())}`, 'banknote', 'green')}
      ${kpi('বকেয়া প্রাপ্য', U.money(k.outstanding), `লেজার ১১০০-এর স্থিতি ${U.money(k.recv)}`, 'receipt', 'amber')}
      ${kpi('আজ উপস্থিত কর্মী', k.staff.date ? `${bnNum(k.staff.present)}/${bnNum(k.staff.total)}` : '—', staffSub, 'contact', 'violet')}
      ${kpi('অপেক্ষমাণ অনুরোধ', `${bnNum(k.pendAdm + k.pendSr)}`, `${bnNum(k.pendAdm)}টি ভর্তি · ${bnNum(k.pendSr)}টি সেবা-অনুরোধ`, 'inbox', k.pendAdm + k.pendSr ? 'amber' : 'blue')}
    </div>`;

    const attCard = card(`শিক্ষার্থী উপস্থিতির প্রবণতা <span class="text-xs font-normal text-slate-400">সর্বশেষ ${bnNum(att.length)} কর্মদিবস</span>`,
      this.lineChart(att.map(d => ({ label: U.fmtDate(d.date), short: U.bn(d.date.slice(5)), v: d.pct })), { min: Math.max(0, Math.floor(Math.min(minAtt, ...att.map(d => d.pct)) / 10) * 10 - 10), max: 100, fmt: v => `${bnNum(Math.round(v))}%`, target: minAtt, title: 'দৈনিক উপস্থিতি %' }),
      attAvg !== null ? badge(`৩০ দিনের গড় ${bnNum(attAvg.toFixed(1))}%`, attAvg >= minAtt ? 'green' : 'red') : '');

    const totIn = U.sum(cash, r => r.inflow), totOut = U.sum(cash, r => r.out);
    const cashCard = card(`দৈনিক নগদ প্রবাহ <span class="text-xs font-normal text-slate-400">সর্বশেষ ১৪ দিন</span>`,
      `${this.pairBars(cash.map(r => ({ label: U.bn(r.date.slice(8)) + ' ' + U.dayBn(r.date, true), a: r.inflow, b: r.out })), 'অন্তঃপ্রবাহ (ডেবিট)', 'বহিঃপ্রবাহ (ক্রেডিট)')}
       <div class="scroll-x mt-4"><table class="table text-sm"><thead><tr><th>তারিখ</th><th class="text-right">নগদ অর্থ জমা</th><th class="text-right">ব্যাংকে জমা</th><th class="text-right">এমএফএস-এ জমা</th><th class="text-right">মোট জমা</th><th class="text-right">খরচ</th><th class="text-right">নিট</th></tr></thead><tbody>
       ${[...cash].reverse().map(r => `<tr><td class="whitespace-nowrap">${U.fmtDate(r.date)} <span class="text-xs text-slate-400">${U.dayBn(r.date, true)}</span></td><td class="text-right">${U.money(r.in1000)}</td><td class="text-right">${U.money(r.in1010)}</td><td class="text-right">${U.money(r.in1020)}</td><td class="text-right font-semibold">${U.money(r.inflow)}</td><td class="text-right">${U.money(r.out)}</td><td class="text-right font-semibold ${r.net < 0 ? 'text-red-600' : 'text-emerald-700'}">${U.money(r.net)}</td></tr>`).join('')}
       <tr class="font-bold bg-slate-50"><td>মোট</td><td class="text-right">${U.money(U.sum(cash, r => r.in1000))}</td><td class="text-right">${U.money(U.sum(cash, r => r.in1010))}</td><td class="text-right">${U.money(U.sum(cash, r => r.in1020))}</td><td class="text-right">${U.money(totIn)}</td><td class="text-right">${U.money(totOut)}</td><td class="text-right">${U.money(totIn - totOut)}</td></tr></tbody></table></div>`);

    const surplus = ie.inc - ie.exp;
    const finCard = card(`আর্থিক অবস্থা <span class="text-xs font-normal text-slate-400">${bnNum(new Date().getFullYear())} — বছরের শুরু থেকে এ পর্যন্ত</span>`,
      `<div class="grid grid-cols-3 gap-3 mb-4 text-center"><div class="rounded-xl bg-emerald-50 p-3"><div class="text-xs text-slate-500">আয়</div><div class="font-bold text-emerald-700">${U.money(ie.inc)}</div></div><div class="rounded-xl bg-red-50 p-3"><div class="text-xs text-slate-500">ব্যয়</div><div class="font-bold text-red-700">${U.money(ie.exp)}</div></div><div class="rounded-xl bg-slate-50 p-3"><div class="text-xs text-slate-500">${surplus >= 0 ? 'উদ্বৃত্ত' : 'ঘাটতি'}</div><div class="font-bold ${surplus >= 0 ? 'text-brand-700' : 'text-red-700'}">${U.money(surplus)}</div></div></div>
       ${this.pairBars(ie.months.map(([mk, r]) => ({ label: U.monthName(mk).split(' ')[0], a: r.inc, b: r.exp })), 'আয়', 'ব্যয়')}`);

    const feeCard = card(`শ্রেণিভিত্তিক ফি আদায়ের হার <span class="text-xs font-normal text-slate-400">শিক্ষাবর্ষ ${esc(U.bn(DB.session()))}</span>`,
      this.hBars(fees.map(f => ({ label: f.name, v: f.rate, sub: `${U.money(f.paid)} / ${U.money(f.billed)}` }))) +
      `<div class="text-xs text-slate-400 mt-3">সামগ্রিক: ${this.pctFmt(this.pct(U.sum(fees, f => f.paid), U.sum(fees, f => f.billed)))} · বকেয়া ${U.money(U.sum(fees, f => f.outstanding))}</div>`);

    const defCard = `<div class="card"><div class="px-5 py-3 border-b border-slate-100 font-semibold">শীর্ষ ১০ বকেয়াদার</div><div class="scroll-x"><table class="table text-sm"><thead><tr><th>#</th><th>শিক্ষার্থী</th><th>শ্রেণি</th><th class="text-right">বিল</th><th>সবচেয়ে পুরোনো বকেয়া</th><th class="text-right">বকেয়া</th></tr></thead><tbody>
      ${defs.map((d, i) => `<tr><td>${bnNum(i + 1)}</td><td><button class="font-semibold hover:underline text-left" onclick="Dossier.open('${esc(d.st.id)}','fees')">${esc(pn(d.st))}</button><div class="text-xs text-slate-400">${esc(d.st.id)}</div></td><td>${esc(DB.className(d.st.classId))} · রোল ${bnNum(d.st.roll)}</td><td class="text-right">${bnNum(d.count)}</td><td class="whitespace-nowrap">${U.fmtDate(d.oldest)}</td><td class="text-right font-bold text-red-600">${U.money(d.dues)}</td></tr>`).join('') || `<tr><td colspan="6">${emptyState('কোনো বকেয়া নেই।', 'party-popper')}</td></tr>`}
      </tbody></table></div></div>`;

    const acadCard = `<div class="card"><div class="px-5 py-3 border-b border-slate-100 font-semibold">শিক্ষাগত অগ্রগতি <span class="text-xs font-normal text-slate-400">শ্রেণিভিত্তিক গড় জিপিএ${ac.latest ? ` · ${esc(ac.latest.name)}-এ পাসের হার` : ''}</span></div>
      <div class="scroll-x"><table class="table text-sm"><thead><tr><th>শ্রেণি</th>${ac.exams.map(e => `<th class="text-right">${esc(e.name)}</th>`).join('')}<th class="text-right">প্রবণতা</th><th class="w-40">পাসের হার (সর্বশেষ)</th></tr></thead><tbody>
      ${ac.classes.map(c => { const g = ac.exams.map(e => c.gpas[e.id]).filter(v => v !== null); const tr = g.length > 1 ? g[g.length - 1] - g[g.length - 2] : null; return `<tr><td class="font-semibold whitespace-nowrap">${esc(c.name)}</td>${ac.exams.map(e => `<td class="text-right">${gpaFmt(c.gpas[e.id])}</td>`).join('')}<td class="text-right ${tr === null ? '' : tr >= 0 ? 'text-emerald-600' : 'text-red-600'}">${tr === null ? '—' : (tr >= 0 ? '▲ ' : '▼ ') + bnNum(Math.abs(tr).toFixed(2))}</td><td>${c.pass === null ? '<span class="text-slate-400">—</span>' : `<div class="text-xs mb-1">${bnNum(c.sat)} জনের মধ্যে ${bnNum(c.pass.toFixed(1))}%</div>${progressBar(c.pass)}`}</td></tr>`; }).join('') || `<tr><td colspan="9">${emptyState('কোনো শ্রেণি নেই।')}</td></tr>`}
      </tbody></table></div></div>`;
    const subjCard = card(`বিষয়ভিত্তিক গড় ${ac.latest ? `<span class="text-xs font-normal text-slate-400">${esc(ac.latest.name)}</span>` : ''}`,
      ac.latest ? this.hBars(ac.subjects.map(s => ({ label: s.name, v: s.avg, sub: `${bnNum(s.n)}টি উত্তরপত্র` }))) : emptyState('এখনো কোনো প্রধান পরীক্ষার ফলাফল প্রকাশিত হয়নি।', 'clipboard-list'));

    const maxEn = Math.max(1, ...en.map(e => e.total));
    const enCard = card('শ্রেণি ও লিঙ্গভিত্তিক ভর্তিকৃত শিক্ষার্থী',
      `<div class="flex items-center gap-4 text-xs text-slate-500 mb-3"><span class="flex items-center gap-1"><i class="inline-block w-3 h-3 rounded-sm" style="background:var(--brand)"></i>পুরুষ</span><span class="flex items-center gap-1"><i class="inline-block w-3 h-3 rounded-sm" style="background:var(--accent)"></i>মহিলা</span><span class="flex items-center gap-1"><i class="inline-block w-3 h-3 rounded-sm bg-slate-300"></i>অন্যান্য / অনির্দিষ্ট</span></div>
       <div class="space-y-2">${en.map(e => `<div class="flex items-center gap-2 text-sm"><span class="w-32 shrink-0 truncate">${esc(e.name)}</span><div class="flex-1 h-4 rounded bg-slate-50 overflow-hidden flex" title="পুরুষ ${bnNum(e.male)} · মহিলা ${bnNum(e.female)} · অন্যান্য ${bnNum(e.other)}"><div style="background:var(--brand);width:${e.male / maxEn * 100}%"></div><div style="background:var(--accent);width:${e.female / maxEn * 100}%"></div><div class="bg-slate-300" style="width:${e.other / maxEn * 100}%"></div></div><span class="w-20 text-right text-xs text-slate-500 shrink-0">${bnNum(e.male)} পু · ${bnNum(e.female)} ম${e.other ? ` · ${bnNum(e.other)}` : ''}</span><b class="w-8 text-right">${bnNum(e.total)}</b></div>`).join('') || emptyState('কোনো শ্রেণি নেই।')}</div>
       <div class="text-xs text-slate-500 mt-3">মোট ${bnNum(U.sum(en, e => e.total))} · পুরুষ ${bnNum(U.sum(en, e => e.male))} · মহিলা ${bnNum(U.sum(en, e => e.female))}${U.sum(en, e => e.other) ? ` · অন্যান্য ${bnNum(U.sum(en, e => e.other))}` : ''}</div>`);
    const fMax = Math.max(1, ...this.FUNNEL.map(s => fn.counts[s]));
    const tone = { Pending: '#f59e0b', Selected: '#3b82f6', Waiting: '#8b5cf6', Approved: 'var(--brand)', Declined: 'var(--accent)' };
    const funCard = card(`ভর্তি প্রক্রিয়ার ধাপ <span class="text-xs font-normal text-slate-400">${bnNum(fn.total)}টি আবেদন</span>`,
      `<div class="space-y-2">${this.FUNNEL.map(s => `<div class="flex items-center gap-3 text-sm"><span class="w-20 shrink-0">${esc(bn(s))}</span><div class="flex-1 flex justify-center"><div class="h-7 rounded-md flex items-center justify-center text-white text-xs font-bold" style="background:${tone[s]};min-width:2rem;width:${Math.max(8, fn.counts[s] / fMax * 100)}%">${bnNum(fn.counts[s])}</div></div><span class="w-12 text-right text-xs text-slate-500">${this.pctFmt(this.pct(fn.counts[s], fn.total))}</span></div>`).join('')}</div>
       <div class="text-xs text-slate-400 mt-3">রূপান্তর হার (অনুমোদিত ÷ নিষ্পত্তিকৃত):${this.pctFmt(this.pct(fn.counts.Approved, fn.counts.Approved + fn.counts.Declined))}</div>`);

    return `${head}${kpiRow}
      <div class="grid lg:grid-cols-2 gap-5 mb-5">${attCard}${finCard}</div>
      <div class="mb-5">${cashCard}</div>
      <div class="grid lg:grid-cols-2 gap-5 mb-5">${feeCard}${defCard}</div>
      <div class="mb-5">${acadCard}</div>
      <div class="grid lg:grid-cols-3 gap-5">${subjCard}${enCard}${funCard}</div>`;
  },

  /** Download the key MIS tables as one multi-section CSV. */
  exportCsv() {
    this._rc = {};
    const cp = this.scope(), k = this.kpis(cp), rows = [];
    const sec = (title, header, data) => { rows.push([`# ${title}`]); rows.push(header); data.forEach(r => rows.push(r)); rows.push([]); };
    sec('এমআইএস স্ন্যাপশট', ['প্রতিষ্ঠান', 'পরিসর', 'শিক্ষাবর্ষ', 'প্রস্তুতের সময়'], [[DB.s.school.nameBn || DB.s.school.name, !multiCampus() ? 'সম্পূর্ণ প্রতিষ্ঠান' : cp === 'ALL' ? 'সকল ক্যাম্পাস' : DB.campus(cp)?.name, DB.session(), new Date().toISOString()]]);
    sec('মূল সূচক', ['সূচক', 'মান', 'মন্তব্য'], [
      ['ভর্তিকৃত শিক্ষার্থী', k.enrol, k.byCampus], ['উপস্থিতি % (সর্বশেষ কর্মদিবস)', k.att ? k.att.pct.toFixed(1) : '', k.att ? k.att.date : ''],
      ['আজকের আদায়', Math.round(k.collected), `${k.payToday.length}টি রসিদ`], ['বকেয়া প্রাপ্য (বিল)', Math.round(k.outstanding), `লেজার ১১০০: ${Math.round(k.recv)}`],
      ['উপস্থিত কর্মী', k.staff.date ? k.staff.present : '', k.staff.date ? `${k.staff.date} তারিখে মোট ${k.staff.total} জনের মধ্যে` : 'কোনো তথ্য নেই'], ['অপেক্ষমাণ ভর্তি', k.pendAdm, ''], ['অপেক্ষমাণ সেবা-অনুরোধ', k.pendSr, ''],
    ]);
    sec('উপস্থিতির প্রবণতা (সর্বশেষ ৩০ কর্মদিবস)', ['তারিখ', 'উপস্থিত+বিলম্ব', 'গণনাকৃত', 'শতাংশ'],this.attendanceDaily(cp).filter(d => U.isSchoolDay(d.date, null, cp === 'ALL' ? null : cp)).slice(-30).map(d => [d.date, d.present, d.counted, d.pct.toFixed(1)]));
    sec('দৈনিক নগদ প্রবাহ (সর্বশেষ ১৪ দিন)', ['তারিখ', 'নগদ অর্থ জমা', 'ব্যাংকে জমা', 'এমএফএস-এ জমা', 'মোট জমা', 'খরচ', 'নিট'],this.cashFlow(cp).map(r => [r.date, r.in1000, r.in1010, r.in1020, r.inflow, r.out, r.net]));
    const ie = this.incomeExpenseYtd(cp);
    sec('আয় বনাম ব্যয় (চলতি বছর)', ['মাস', 'আয়', 'ব্যয়', 'উদ্বৃত্ত'], [...ie.months.map(([mk, r]) => [mk, Math.round(r.inc), Math.round(r.exp), Math.round(r.inc - r.exp)]), ['মোট', Math.round(ie.inc), Math.round(ie.exp), Math.round(ie.inc - ie.exp)]]);
    sec('শ্রেণিভিত্তিক ফি আদায়ের হার', ['শ্রেণি', 'বিলকৃত', 'পরিশোধিত', 'বকেয়া', 'হার %'], this.feeRates(cp).map(f => [f.name, f.billed, f.paid, f.outstanding, f.rate.toFixed(1)]));
    sec('শীর্ষ ১০ বকেয়াদার', ['শিক্ষার্থীর আইডি', 'নাম', 'শ্রেণি', 'রোল', 'অপরিশোধিত বিল', 'সবচেয়ে পুরোনো বকেয়া', 'বকেয়া'], this.defaulters(cp).map(d => [d.st.id, pn(d.st), DB.className(d.st.classId), d.st.roll, d.count, d.oldest, d.dues]));
    const ac = this.academic(cp);
    sec('শ্রেণিভিত্তিক গড় জিপিএ', ['শ্রেণি', ...ac.exams.map(e => e.name), `পাসের হার % (${ac.latest?.name || '—'})`], ac.classes.map(c => [c.name, ...ac.exams.map(e => c.gpas[e.id] === null ? '' : c.gpas[e.id].toFixed(2)), c.pass === null ? '' : c.pass.toFixed(1)]));
    sec(`বিষয়ভিত্তিক গড় % (${ac.latest?.name || '—'})`, ['বিষয়', 'উত্তরপত্র', 'গড় %'], ac.subjects.map(s => [s.name, s.n, s.avg.toFixed(1)]));
    sec('শ্রেণি ও লিঙ্গভিত্তিক ভর্তিকৃত শিক্ষার্থী', ['শ্রেণি', ...(multiCampus() ? ['ক্যাম্পাস'] : []), 'পুরুষ', 'মহিলা', 'অন্যান্য', 'মোট'], this.enrolment(cp).map(e => [e.name, ...(multiCampus() ? [e.campus] : []), e.male, e.female, e.other, e.total]));
    const fn = this.funnel(cp);
    sec('ভর্তি প্রক্রিয়ার ধাপ', ['অবস্থা', 'সংখ্যা'], this.FUNNEL.map(s => [bn(s), fn.counts[s]]));
    downloadFile(`mis-snapshot-${cp.toLowerCase()}-${U.today()}.csv`, '﻿' + U.csv(rows), 'text/csv;charset=utf-8');
    DB.audit('MIS_EXPORT', 'reports', `এমআইএস স্ন্যাপশট সিএসভি এক্সপোর্ট করা হয়েছে (${cp})`); DB.save();
    toast('এমআইএস স্ন্যাপশট এক্সপোর্ট করা হয়েছে।', 'success');
  },
};

const misPage = {
  id: 'mis', label: 'এমআইএস বিশ্লেষণ', icon: 'chart-no-axes-combined', module: 'dashboard',
  render: () => MIS.render(),
};
App.addPage('admin', misPage, 'system');
App.addPage('principal', misPage, 'overview');
