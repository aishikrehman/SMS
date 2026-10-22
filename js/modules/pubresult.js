/* ==========================================================================
   PUBLIC RESULTS (ফলাফল পোর্টাল)
   · The Root User / Principal choose (ফিচার ও সেটিংস → ফলাফল (পাবলিক)) which identifiers the search
     form asks for and which of them are required; the server (server/public.js → resultLookup) checks
     exactly these and never answers with fewer identifiers than configured (at least two in total).
   · What the result card shows: subject-wise result, marks or grades only, GPA, position, attendance,
     remarks, marksheet download, and the combined result (DB.combinedResult) with its parts.
   · Optional statistics per published exam (examinees, pass rate, top-grade count, grade distribution,
     subject-wise pass rate, class / section / group breakdown). Only counts are published: a staff
     browser computes them with the marksheet's own grading code and stores the snapshot in
     config.publicResult.statsData; the server drops groups smaller than five examinees.
   ========================================================================== */

const ResultCfg = {
  FIELDS: [['exam', 'পরীক্ষা'], ['session', 'শিক্ষাবর্ষ / বছর'], ['cls', 'শ্রেণি'], ['section', 'শাখা'], ['group', 'বিভাগ / গ্রুপ'], ['roll', 'রোল'], ['reg', 'রেজিস্ট্রেশন নম্বর'], ['sid', 'শিক্ষার্থী আইডি'], ['dob', 'জন্মতারিখ'], ['phone', 'অভিভাবকের মোবাইলের শেষ অঙ্কগুলো']],
  STATES: [['off', 'জিজ্ঞাসা করা হবে না'], ['opt', 'ঐচ্ছিক'], ['req', 'আবশ্যক']],
  CARD: [['subjects', 'বিষয়ভিত্তিক ফলাফল'], ['marks', 'প্রাপ্ত নম্বর'], ['gpa', 'জিপিএ ও গ্রেড পয়েন্ট'], ['position', 'শ্রেণি ও শাখায় অবস্থান'], ['attendance', 'উপস্থিতি'], ['remarks', 'শ্রেণিশিক্ষকের মন্তব্য'], ['download', 'নম্বরপত্র ডাউনলোডের বোতাম']],
  CMB: [['weights', 'কোন পরীক্ষা কত ভারে যুক্ত'], ['table', 'বিষয়ভিত্তিক সমন্বিত শতকরা'], ['final', 'চূড়ান্ত (সমন্বিত) জিপিএ ও গ্রেড']],
  BLOCKS: [['examinees', 'পরীক্ষার্থীর সংখ্যা'], ['passRate', 'পাসের হার'], ['aplus', 'জিপিএ-৫ / এ+ প্রাপ্তের সংখ্যা'], ['grades', 'গ্রেড বণ্টন'], ['subjects', 'বিষয়ভিত্তিক পাসের হার'], ['breakdown', 'শ্রেণি, শাখা ও বিভাগভিত্তিক বিশ্লেষণ']],
  DEF: {
    fields: { exam: 'req', session: 'off', cls: 'req', section: 'off', group: 'off', roll: 'req', reg: 'req', sid: 'off', dob: 'off', phone: 'off' },
    card: { subjects: true, marks: true, gpa: true, position: true, attendance: false, remarks: false, download: true },
    combined: { on: true, weights: true, table: true, final: true },
    blocks: { examinees: true, passRate: true, aplus: true, grades: true, subjects: true, breakdown: true },
  },
  MIN: 5,
  raw() { const c = DB.s.config || {}; return c.publicResult || {}; },
  /** Registration no., student ID, date of birth and guardian mobile count one each; roll counts only with the class (same rule as the server). */
  strength(f) { return ['reg', 'sid', 'dob', 'phone'].filter(k => f[k] === 'req').length + (f.roll === 'req' && f.cls === 'req' ? 1 : 0); },
  get() {
    const r = this.raw(), fields = {};
    this.FIELDS.forEach(([k]) => { const v = r.fields && r.fields[k]; fields[k] = ['off', 'opt', 'req'].includes(v) ? v : this.DEF.fields[k]; });
    if (this.strength(fields) < 2) Object.assign(fields, this.DEF.fields);
    return {
      fields, phoneDigits: U.clamp(+r.phoneDigits || 4, 4, 6),
      card: { ...this.DEF.card, ...(r.card || {}) }, combined: { ...this.DEF.combined, ...(r.combined || {}) },
      stats: { on: !!(r.stats && r.stats.on), blocks: { ...this.DEF.blocks, ...((r.stats && r.stats.blocks) || {}) } },
      statsData: r.statsData || {},
    };
  },
  canEdit() { return !!App.session && (App.has('ADMIN') || App.has('PRINCIPAL')); },

  /* ---------- settings editor (a FeatureCfg 'html' parameter) ---------- */
  editor() {
    const c = this.get(), dis = this.canEdit() ? '' : 'disabled', st = c.statsData, n = Object.keys(st).length;
    const chk = (name, on, label) => `<label class="flex items-start gap-2 cursor-pointer"><input type="checkbox" class="w-5 h-5 mt-0.5 shrink-0 accent-[var(--brand)]" name="${name}" ${on ? 'checked' : ''} ${dis}><span>${label}</span></label>`;
    const last = Object.values(st).map(s => s.at).filter(Boolean).sort().pop();
    return `<div class="space-y-6">
      <section><h3 class="font-semibold text-lg mb-3">অনুসন্ধান ফরমের ঘর</h3>
        <div class="grid sm:grid-cols-2 gap-3">${this.FIELDS.map(([k, l]) => `<div><label class="label" for="prf-${k}">${l}</label><select class="select" id="prf-${k}" name="prf_${k}" ${dis} onchange="ResultCfg.live(this.form)">${this.STATES.map(([v, t]) => `<option value="${v}" ${c.fields[k] === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`).join('')}
          <div><label class="label" for="prf-digits">মোবাইলের শেষ কয়টি অঙ্ক চাওয়া হবে</label><select class="select" id="prf-digits" name="prf_digits" ${dis}>${[4, 5, 6].map(d => `<option value="${d}" ${c.phoneDigits === d ? 'selected' : ''}>${bnNum(d)}টি</option>`).join('')}</select></div></div>
        <div id="prf-strength" class="mt-3" role="status">${this.strengthNote(c.fields)}</div></section>
      <section><h3 class="font-semibold text-lg mb-2">ফলাফল কার্ডে যা দেখানো হবে</h3><div class="grid sm:grid-cols-2 gap-2">${this.CARD.map(([k, l]) => chk(`prc_${k}`, c.card[k], l)).join('')}</div></section>
      <section><h3 class="font-semibold text-lg mb-2">সমন্বিত (চূড়ান্ত) ফলাফল</h3>
        <div class="grid sm:grid-cols-2 gap-2">${chk('prm_on', c.combined.on, '<b>সমন্বিত ফলাফল দেখান</b>')}${this.CMB.map(([k, l]) => chk(`prm_${k}`, c.combined[k], l)).join('')}</div></section>
      <section><h3 class="font-semibold text-lg mb-1">পাবলিক পরিসংখ্যান</h3><p class="text-slate-600 mb-2">প্রকাশিত প্রতিটি পরীক্ষার সমষ্টিগত সংখ্যা — কোনো শিক্ষার্থীর নাম বা ব্যক্তিগত তথ্য নয়। ${bnNum(this.MIN)} জনের কম পরীক্ষার্থীর দলের হিসাব দেখানো হয় না।</p>
        <div class="grid sm:grid-cols-2 gap-2">${chk('prs_on', c.stats.on, '<b>পরিসংখ্যান দেখান</b>')}${this.BLOCKS.map(([k, l]) => chk(`prs_${k}`, c.stats.blocks[k], l)).join('')}</div>
        <div class="flex flex-wrap items-center gap-3 mt-3"><button type="button" class="btn btn-ghost btn-sm" ${dis} onclick="ResultStats.refresh(true)">${icon('refresh-cw')} পরিসংখ্যান এখনই হালনাগাদ করুন</button><span class="text-slate-500">${n ? `${bnNum(n)}টি পরীক্ষা · সর্বশেষ ${U.fmtTime ? U.fmtTime(last) : esc(last)}` : 'এখনো তৈরি হয়নি'}</span></div></section>
      ${this.canEdit() && !App.has('ADMIN') ? `<button class="btn btn-primary">${icon('save')} সংরক্ষণ করুন</button>` : ''}</div>`;
  },
  strengthNote(f) {
    const s = this.strength(f);
    return s >= 2 ? `<span class="text-emerald-700">${icon('shield-check', 'w-4 h-4 inline')} যথেষ্ট শনাক্তকারী আবশ্যক (${bnNum(s)}টি)।</span>`
      : `<span class="text-red-600">${icon('shield-alert', 'w-4 h-4 inline')} কমপক্ষে দুটি শনাক্তকারী আবশ্যক করুন — রেজিস্ট্রেশন নম্বর, শিক্ষার্থী আইডি, জন্মতারিখ, অভিভাবকের মোবাইল, অথবা শ্রেণিসহ রোল। এর কম হলে সংরক্ষণ করা যাবে না।</span>`;
  },
  readFields(form) { const f = {}; this.FIELDS.forEach(([k]) => { f[k] = form.elements[`prf_${k}`]?.value || 'off'; }); return f; },
  live(form) { const el = $('#prf-strength'); if (el) { el.innerHTML = this.strengthNote(this.readFields(form)); App.icons(); } },
  save(form) {
    if (!this.canEdit()) return;
    const r = this.raw(), f = this.readFields(form), box = k => !!form.elements[k]?.checked;
    const pr = { ...r, phoneDigits: +form.elements.prf_digits?.value || 4 };
    if (this.strength(f) >= 2) pr.fields = f;
    else setTimeout(() => toast('কমপক্ষে দুটি শনাক্তকারী আবশ্যক — অনুসন্ধান ফরমের আগের ঘরগুলো রাখা হয়েছে।', 'error'), 50);
    pr.card = Object.fromEntries(this.CARD.map(([k]) => [k, box(`prc_${k}`)]));
    pr.combined = { on: box('prm_on'), ...Object.fromEntries(this.CMB.map(([k]) => [k, box(`prm_${k}`)])) };
    pr.stats = { on: box('prs_on'), blocks: Object.fromEntries(this.BLOCKS.map(([k]) => [k, box(`prs_${k}`)])) };
    (DB.s.config || (DB.s.config = {})).publicResult = pr;
    if (pr.stats.on) ResultStats.refresh(false);
  },
};
if (typeof FeatureCfg !== 'undefined') FeatureCfg.PARAMS['ফলাফল (পাবলিক)'] = [{ k: 'publicResult', type: 'html', render: () => ResultCfg.editor(), save: form => ResultCfg.save(form) }];

/* ---------- aggregate statistics ---------- */
const ResultStats = {
  /** Counts for one published exam (no names, no ids of students). */
  compute(ex) {
    const cfg = ResultCfg.get(), useComb = cfg.combined.on && !!(ex.combine && ex.combine.length);
    const rows = [], subj = {}, grades = {}, order = [];
    let topLabel = '';
    DB.examClasses(ex).forEach(c => {
      const bands = Grade.bands(c.campusId, ex.session, ex), top = bands[0]?.letter;
      if (!topLabel) topLabel = top;
      bands.forEach(b => { if (!order.includes(b.letter)) order.push(b.letter); });
      DB.studentsIn(c.id).forEach(st => {
        const f = DB.combinedResult(st.id, ex.id), base = f.base || f; if (!base.rows || !base.rows.length) return;
        const r = useComb ? f : base;
        rows.push({ c: c.id, sec: st.section || '', grp: st.stream || '', passed: !!r.passed, top: r.letter === top });
        grades[r.letter] = (grades[r.letter] || 0) + 1;
        base.rows.forEach(x => { const s = subj[x.subject.id] || (subj[x.subject.id] = { id: x.subject.id, name: x.subject.name, n: 0, pass: 0 }); s.n++; if (!x.failed) s.pass++; });
      });
    });
    const agg = rs => ({ n: rs.length, pass: rs.filter(r => r.passed).length, top: rs.filter(r => r.top).length });
    const by = (rs, k) => [...new Set(rs.map(r => r[k]).filter(Boolean))].map(name => ({ name, ...agg(rs.filter(r => r[k] === name)) }));
    return {
      at: new Date().toISOString(), combined: useComb, topLabel, ...agg(rows),
      grades: order.filter(l => grades[l]).map(l => [l, grades[l]]),
      subjects: Object.values(subj),
      classes: [...new Set(rows.map(r => r.c))].map(id => { const rs = rows.filter(r => r.c === id); return { id, name: DB.className(id) || id, ...agg(rs), sections: by(rs, 'sec'), groups: by(rs, 'grp') }; }),
    };
  },
  /** Recompute every published exam's snapshot; writes (and saves) only when something changed. */
  refresh(manual) {
    if (!ResultCfg.canEdit() || !DB.s.exams) return false;
    const pr = (DB.s.config || (DB.s.config = {})).publicResult || ((DB.s.config.publicResult = {}));
    const data = {};
    DB.s.exams.filter(e => e.published).forEach(e => { try { const s = this.compute(e); if (s.n) data[e.id] = s; } catch (err) { console.error('result stats', e.id, err); } });
    const strip = o => JSON.stringify(Object.keys(o || {}).sort().map(k => ({ ...o[k], at: '' })));
    if (strip(data) === strip(pr.statsData)) { if (manual) toast('পরিসংখ্যান হালনাগাদই আছে।'); return false; }
    pr.statsData = data; DB.save();
    if (manual) { toast('পরিসংখ্যান হালনাগাদ হয়েছে।', 'success'); App.refresh(); }
    return true;
  },
  /** Staff browsers keep the snapshot fresh while statistics are on (at most once a minute). */
  auto() {
    if (!ResultCfg.canEdit() || !ResultCfg.get().stats.on || Date.now() - (this._t || 0) < 60000) return;
    this._t = Date.now(); try { this.refresh(false); } catch (e) { console.error(e); }
  },
  /** Display form of a snapshot (the server already sends it this way to visitors; staff hold the raw counts). */
  view(s, blocks) {
    if (!s) return null;
    const on = k => blocks[k] !== false, pc = (a, n) => (n ? Math.round(a / n * 1000) / 10 : 0), M = ResultCfg.MIN;
    if (s.passPct !== undefined || s.pass === undefined) return s;
    const small = s.n < M, x = { at: s.at, combined: s.combined, topLabel: s.topLabel, min: M };
    if (on('examinees')) x.n = s.n;
    if (!small) {
      if (on('passRate')) x.passPct = pc(s.pass, s.n);
      if (on('aplus')) x.top = s.top;
      if (on('grades')) x.grades = s.grades;
      if (on('subjects')) x.subjects = (s.subjects || []).filter(r => r.n >= M).map(r => ({ id: r.id, name: r.name, passPct: pc(r.pass, r.n) }));
      if (on('breakdown')) x.classes = (s.classes || []).filter(c => c.n >= M).map(c => ({ id: c.id, name: c.name, n: c.n, passPct: pc(c.pass, c.n), top: c.top, sections: (c.sections || []).filter(g => g.n >= M).map(g => ({ name: g.name, n: g.n, passPct: pc(g.pass, g.n), top: g.top })), groups: (c.groups || []).filter(g => g.n >= M).map(g => ({ name: g.name, n: g.n, passPct: pc(g.pass, g.n), top: g.top })) }));
    }
    return x;
  },
};
setInterval(() => ResultStats.auto(), 65000);

/* ---------- the public page ---------- */
const PubResult = {
  ui() { return App.ui.res || (App.ui.res = { f: {}, view: 'search' }); },
  exams(session) { return DB.s.exams.filter(e => e.published && (!session || String(e.session) === String(session))).sort((a, b) => String(b.start || '').localeCompare(String(a.start || ''))); },
  render() {
    const cfg = ResultCfg.get(), ui = this.ui();
    if (DB.s.featureFlags.publicResults === false) return Pub.wrap(Pub.hero('ফলাফল', '') + Pub.section('ফলাফল পোর্টাল বন্ধ রয়েছে', '', '<p class="text-slate-600">ফলাফল সাময়িকভাবে পাওয়া যাচ্ছে না।</p>'));
    if (!this.exams().length || !DB.s.classes.length) return Pub.wrap(Pub.hero('ফলাফল ও নম্বরপত্র', '') + Pub.section('', '', emptyState('এখনো কোনো পরীক্ষার ফলাফল প্রকাশিত হয়নি।', 'award')));
    const hasStats = cfg.stats.on && Object.keys(cfg.statsData).some(id => DB.exam(id)?.published);
    const view = hasStats && ui.view === 'stats' ? 'stats' : 'search';
    const asked = ResultCfg.FIELDS.filter(([k]) => cfg.fields[k] !== 'off').map(([, l]) => l);
    return Pub.wrap(Pub.hero('ফলাফল ও নম্বরপত্র', `${asked.join(', ')} দিয়ে অনুসন্ধান করুন।`) + `<section class="max-w-4xl mx-auto px-4 py-10 space-y-5">
      ${hasStats ? pills([['search', 'ফলাফল অনুসন্ধান', 'search'], ['stats', 'পরিসংখ্যান', 'bar-chart-3']], view, id => `PubResult.ui().view='${id}';App.refresh()`) : ''}
      ${view === 'stats' ? this.statsHtml(cfg) : this.form(cfg) + this.outcome(cfg)}</section>`);
  },
  form(cfg) {
    const ui = this.ui(), f = ui.f || {}, F = cfg.fields, req = k => (F[k] === 'req' ? 'required' : '');
    const lab = (k, l) => `<label class="label" for="pr-${k}">${l}${F[k] === 'req' ? ' *' : ' (ঐচ্ছিক)'}</label>`;
    const opt = (k, items, empty) => `<option value="">${empty}</option>` + items.map(([v, l]) => `<option value="${esc(v)}" ${String(f[k] ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('');
    const sessions = [...new Set(this.exams().map(e => e.session).filter(Boolean))];
    const cls = DB.cls(f.cls), classes = cls ? [cls] : DB.s.classes;
    const secs = [...new Set(classes.flatMap(c => c.sections || []))], groups = [...new Set(classes.flatMap(c => c.streams || []))];
    const box = (k, html, wide) => (F[k] === 'off' ? '' : `<div class="${wide ? 'sm:col-span-2' : ''}">${html}</div>`);
    const fields = [
      box('session', `${lab('session', 'শিক্ষাবর্ষ / বছর')}<select class="select" id="pr-session" name="session" data-rerender ${req('session')}>${opt('session', sessions.map(s => [s, U.bn(s)]), F.session === 'req' ? 'নির্বাচন করুন' : 'সকল শিক্ষাবর্ষ')}</select>`),
      box('exam', `${lab('exam', 'পরীক্ষা')}<select class="select" id="pr-exam" name="exam" ${req('exam')}>${opt('exam', this.exams(f.session).map(e => [e.id, `${e.name} (${bn(e.type)})`]), F.exam === 'req' ? 'পরীক্ষা নির্বাচন করুন' : 'সর্বশেষ প্রকাশিত পরীক্ষা')}</select>`, true),
      box('cls', `${lab('cls', 'শ্রেণি')}<select class="select" id="pr-cls" name="cls" data-rerender ${req('cls')}><option value="">${F.cls === 'req' ? 'শ্রেণি নির্বাচন করুন' : 'সকল শ্রেণি'}</option>${classOptions(f.cls, false, 'ALL')}</select>`),
      secs.length ? box('section', `${lab('section', 'শাখা')}<select class="select" id="pr-section" name="section" ${req('section')}>${opt('section', secs.map(s => [s, s]), 'নির্বাচন করুন')}</select>`) : '',
      groups.length ? box('group', `${lab('group', 'বিভাগ / গ্রুপ')}<select class="select" id="pr-group" name="group" ${req('group')}>${opt('group', groups.map(s => [s, s]), 'নির্বাচন করুন')}</select>`) : '',
      box('roll', `${lab('roll', 'রোল')}<input class="input" id="pr-roll" name="roll" inputmode="numeric" autocomplete="off" ${req('roll')} value="${esc(f.roll || '')}">`),
      box('reg', `${lab('reg', 'রেজিস্ট্রেশন নম্বর')}<input class="input uppercase" id="pr-reg" name="reg" autocomplete="off" ${req('reg')} value="${esc(f.reg || '')}">`),
      box('sid', `${lab('sid', 'শিক্ষার্থী আইডি')}<input class="input uppercase" id="pr-sid" name="sid" autocomplete="off" ${req('sid')} value="${esc(f.sid || '')}">`),
      box('dob', `${lab('dob', 'জন্মতারিখ')}<input class="input" type="date" id="pr-dob" name="dob" ${req('dob')} value="${esc(f.dob || '')}">`),
      box('phone', `${lab('phone', `অভিভাবকের মোবাইলের শেষ ${bnNum(cfg.phoneDigits)}টি অঙ্ক`)}<input class="input" id="pr-phone" name="phone" inputmode="numeric" autocomplete="off" maxlength="${cfg.phoneDigits}" pattern="[0-9০-৯]{${cfg.phoneDigits}}" ${req('phone')} value="${esc(f.phone || '')}">`),
    ].join('');
    return `<form id="pr-form" class="card p-5 grid sm:grid-cols-2 gap-3 items-end" novalidate>${fields}
      <div class="sm:col-span-2"><button class="btn btn-primary w-full sm:w-auto" ${ui.busy ? 'disabled' : ''}>${icon(ui.busy ? 'loader' : 'search')} অনুসন্ধান</button></div></form>`;
  },
  mount() {
    const form = $('#pr-form'); if (!form) return;
    form.addEventListener('change', e => { if (e.target.hasAttribute('data-rerender')) { this.ui().f = formData(form); App.refresh(); } });
    form.addEventListener('submit', e => { e.preventDefault(); this.submit(form); });
  },
  async submit(form) {
    const cfg = ResultCfg.get(), ui = this.ui(), d = formData(form);
    const missing = ResultCfg.FIELDS.filter(([k]) => cfg.fields[k] === 'req' && !String(d[k] || '').trim() && form.elements[k]);
    ui.f = d; ui.res = null; ui.err = '';
    if (missing.length) { ui.err = 'missing'; ui.missing = missing.map(([, l]) => l); return App.refresh(); }
    if (d.phone && String(U.asciiDigits(d.phone)).replace(/\D/g, '').length !== cfg.phoneDigits) { ui.err = 'phone'; return App.refresh(); }
    const body = { kind: 'result' };
    ResultCfg.FIELDS.forEach(([k]) => { if (cfg.fields[k] !== 'off' && d[k]) body[k] = d[k]; });
    if (typeof Sync !== 'undefined' && Sync.anon()) {
      ui.busy = true; App.refresh();
      try {
        await DB.flush();
        const r = await DB.api('public/lookup', body);
        Sync.hydrate(r.hydrate);
        if (r.found) ui.res = { sid: r.sid, examId: r.examId, extra: r.extra || {} };
        else ui.err = r.reason === 'missing' ? 'missing' : 'notfound';
      } catch (e) { ui.err = e.status === 429 ? 'locked' : 'offline'; ui.wait = Math.ceil(((e.data && e.data.retryAfter) || 900) / 60); }
      ui.busy = false;
    } else {
      ui.res = this.matchLocal(cfg, body);
      if (!ui.res) ui.err = 'notfound';
    }
    App.refresh();
  },
  /** Signed-in visitors already hold the data their role allows: the same rules as the server, in the browser. */
  matchLocal(cfg, b) {
    const F = cfg.fields, given = k => F[k] !== 'off' && String(b[k] ?? '').trim() !== '', val = k => U.asciiDigits(String(b[k] ?? '')).trim(), up = v => String(v ?? '').trim().toUpperCase(), D = cfg.phoneDigits;
    const ph = val('phone').replace(/\D/g, '');
    const phones = s => [s.emergency, ...DB.guardiansOf(s.id).map(g => g.phone)].map(p => String(p || '').replace(/\D/g, '')).filter(p => p.length >= D);
    const test = { cls: s => s.classId === val('cls'), section: s => up(s.section) === up(val('section')), group: s => up(s.stream) === up(val('group')), roll: s => String(s.roll) === String(+val('roll')), reg: s => up(s.regNo) === up(val('reg')), sid: s => up(s.id) === up(val('sid')), dob: s => String(s.dob || '').slice(0, 10) === val('dob'), phone: s => phones(s).some(p => p.slice(-D) === ph.slice(-D)) };
    const checks = Object.keys(test).filter(given); if (!checks.length) return null;
    const hits = DB.s.students.filter(s => !String(s.id).startsWith('_') && checks.every(k => test[k](s))); if (hits.length !== 1) return null;
    const s = hits[0], marks = e => DB.s.marks.some(m => m.examId === e.id && m.studentId === s.id);
    const exams = this.exams(given('session') ? val('session') : '').filter(e => !e.classes?.length || e.classes.includes(s.classId));
    const ex = given('exam') ? exams.find(e => e.id === val('exam')) : exams.filter(marks)[0];
    if (!ex || !marks(ex)) return null;
    const a = DB.attendanceStats(s.id), rem = DB.s.examRemarks?.[ex.id]?.[s.id];
    return { sid: s.id, examId: ex.id, extra: { attendance: { days: a.days, present: a.P + a.L, pct: a.days ? a.pct : null }, remark: rem ? String(typeof rem === 'object' ? rem.text || '' : rem) : '' } };
  },
  outcome(cfg) {
    const ui = this.ui(), alert = m => `<div class="card p-5 text-red-700" role="alert">${icon('alert-circle', 'w-4 h-4 inline')} ${m}</div>`;
    if (ui.busy) return `<div class="card p-5 text-slate-600">${icon('loader', 'w-4 h-4 inline')} অনুসন্ধান চলছে…</div>`;
    if (ui.err === 'missing') return alert(`এই ঘরগুলো পূরণ করুন: ${esc((ui.missing || ResultCfg.FIELDS.filter(([k]) => cfg.fields[k] === 'req').map(([, l]) => l)).join(', '))}।`);
    if (ui.err === 'phone') return alert(`অভিভাবকের মোবাইল নম্বরের শেষ ${bnNum(cfg.phoneDigits)}টি অঙ্ক লিখুন।`);
    if (ui.err === 'notfound') return alert('প্রদত্ত তথ্যের সঙ্গে কোনো প্রকাশিত ফলাফল মেলেনি। তথ্যগুলো আবার মিলিয়ে দেখুন।');
    if (ui.err === 'locked') return alert(`অনেকবার মেলেনি — নিরাপত্তার জন্য ${bnNum(ui.wait || 15)} মিনিট পর আবার চেষ্টা করুন।`);
    if (ui.err === 'offline') return alert('সার্ভারের সঙ্গে যোগাযোগ করা যায়নি — আবার চেষ্টা করুন।');
    return ui.res ? this.card(ui.res, cfg) : '';
  },
  card(r, cfg) {
    const st = DB.student(r.sid), ex = DB.exam(r.examId); if (!st || !ex) return '';
    const C = cfg.card, M = cfg.combined, cr = DB.combinedResult(st.id, ex.id), base = cr.base || cr, letterOnly = base.scale === 'letter';
    const comb = cr.combined && M.on, head = comb && M.final ? cr : base, showPts = C.gpa && !letterOnly, f1 = v => (v === null || v === undefined || isNaN(v) ? '—' : bnNum(Math.round(v * 10) / 10));
    if (!base.rows.length) return `<div class="card p-5">${emptyState('এই পরীক্ষার কোনো নম্বর পাওয়া যায়নি।', 'award')}</div>`;
    const ok = head.passed;
    const facts = [];
    if (C.position) { const rank = DB.examRanking(ex.id, st.classId), me = rank.find(x => x.st.id === st.id), sec = rank.filter(x => x.st.section === st.section), sp = sec.findIndex(x => x.st.id === st.id) + 1; if (me) facts.push(['শ্রেণিতে অবস্থান', `${bnNum(me.pos)} / ${bnNum(rank.length)}`], ...(sec.length > 1 && sec.length < rank.length ? [['শাখায় অবস্থান', `${bnNum(sp)} / ${bnNum(sec.length)}`]] : [])); }
    if (C.attendance && r.extra?.attendance) { const a = r.extra.attendance; facts.push(['উপস্থিতি', a.pct === null || a.pct === undefined ? '—' : `${f1(a.pct)}% (${bnNum(a.present)}/${bnNum(a.days)} দিন)`]); }
    if (comb && M.final) facts.push(['এই পরীক্ষার জিপিএ', letterOnly ? esc(base.letter) : `${gpaFmt(base.gpa)} · ${esc(base.letter)}`]);
    const hasMcq = base.rows.some(x => x.cfg?.mcqMax > 0), hasPr = base.rows.some(x => x.cfg?.prMax > 0), cell = (v, m) => (m ? `${bnNum(v ?? '—')} / ${bnNum(m)}` : '—');
    const table = C.subjects ? `<div class="scroll-x"><table class="table"><thead><tr><th>বিষয়</th>${C.marks ? `<th>${hasMcq ? 'সৃজনশীল' : 'লিখিত'}</th>${hasMcq ? '<th>বহুনির্বাচনি</th>' : ''}${hasPr ? '<th>ব্যবহারিক</th>' : ''}<th>মোট</th>` : ''}<th>গ্রেড</th>${showPts ? '<th>পয়েন্ট</th>' : ''}</tr></thead><tbody>${base.rows.map(x => { const c = x.cfg || {}; return `<tr><td>${esc(x.subject?.name || '')}</td>${C.marks ? `<td>${x.absent ? 'অনুপস্থিত' : cell(x.cq, c.cqMax)}</td>${hasMcq ? `<td>${cell(x.mcq, c.mcqMax)}</td>` : ''}${hasPr ? `<td>${cell(x.pr, c.prMax)}</td>` : ''}<td class="font-semibold">${bnNum(x.total ?? '—')}${x.max ? ` / ${bnNum(x.max)}` : ''}</td>` : ''}<td>${x.failed ? badge(x.letter, 'red') : esc(x.letter || '—')}</td>${showPts ? `<td>${typeof x.point === 'number' ? bnNum(x.point.toFixed(2)) : '—'}</td>` : ''}</tr>`; }).join('')}</tbody></table></div>` : '';
    const parts = comb && M.weights ? `<div class="px-5 py-3 border-t border-slate-100"><div class="font-semibold mb-2">সমন্বিত ফলাফলের অংশ</div><div class="flex flex-wrap gap-2">${cr.parts.map(p => `<span class="badge bg-slate-100 text-slate-700">${esc(p.exam.name)} · ভার ${bnNum(p.weight)}%${showPts && p.gpa !== null && p.gpa !== undefined ? ` · জিপিএ ${gpaFmt(p.gpa)}` : ''}</span>`).join('')}</div></div>` : '';
    const ctable = comb && M.table ? `<div class="border-t border-slate-100 scroll-x"><div class="px-5 pt-3 font-semibold">বিষয়ভিত্তিক সমন্বিত ফলাফল</div><table class="table"><thead><tr><th>বিষয়</th>${cr.parts.map(p => `<th>${esc(p.exam.name)} (${bnNum(p.weight)}%)</th>`).join('')}<th>সমন্বিত %</th><th>গ্রেড</th>${showPts ? '<th>পয়েন্ট</th>' : ''}</tr></thead><tbody>${cr.rows.map(x => `<tr><td>${esc(x.subject.name)}</td>${x.items.map(i => `<td>${i.pct === null ? (i.zero ? '০%' : '—') : f1(i.pct) + '%'}</td>`).join('')}<td class="font-semibold">${f1(x.pct)}%</td><td>${x.failed ? badge(x.letter, 'red') : esc(x.letter)}</td>${showPts ? `<td>${gpaFmt(x.point)}</td>` : ''}</tr>`).join('')}</tbody></table></div>` : '';
    const remark = C.remarks && r.extra?.remark ? `<div class="px-5 py-3 border-t border-slate-100"><b>শ্রেণিশিক্ষকের মন্তব্য:</b> ${esc(r.extra.remark)}</div>` : '';
    const dl = C.download ? `<div class="p-4 border-t border-slate-100 flex justify-end"><button class="btn btn-primary" onclick="Print.show('marksheet','${st.id}','${ex.id}','দাপ্তরিক নম্বরপত্র')">${icon('download')} নম্বরপত্র ডাউনলোড করুন</button></div>` : '';
    const sub = [esc(DB.className(st.classId)), st.section ? `শাখা ${esc(st.section)}` : '', st.roll ? `রোল ${bnNum(st.roll)}` : '', esc(ex.name)].filter(Boolean).join(' · ');
    return `<div class="card overflow-hidden"><div class="p-5 flex flex-wrap items-center gap-4 border-b border-slate-100">${avatar(st, 52)}<div class="flex-1 min-w-0"><div class="font-bold text-lg">${esc(pn(st))}</div><div class="text-slate-500">${sub}</div></div>
        <div class="text-right"><div class="text-3xl font-extrabold ${ok ? 'text-emerald-600' : 'text-red-600'}">${C.gpa && !letterOnly ? gpaFmt(head.gpa) : esc(head.letter)}</div><div class="text-slate-500">${C.gpa && !letterOnly ? `${comb && M.final ? 'চূড়ান্ত জিপিএ' : 'জিপিএ'} · ${esc(head.letter)} · ` : ''}${ok ? 'উত্তীর্ণ' : 'অনুত্তীর্ণ'}</div></div></div>
      ${facts.length ? `<div class="px-5 py-3 grid grid-cols-2 sm:grid-cols-3 gap-3 border-b border-slate-100">${facts.map(([k, v]) => `<div><div class="text-slate-500">${k}</div><div class="font-semibold">${v}</div></div>`).join('')}</div>` : ''}
      ${table}${parts}${ctable}${remark}${dl}</div>`;
  },
  statsHtml(cfg) {
    const ui = this.ui(), ids = this.exams().map(e => e.id).filter(id => cfg.statsData[id]);
    const id = ids.includes(ui.statEx) ? ui.statEx : ids[0], ex = DB.exam(id), s = ResultStats.view(cfg.statsData[id], cfg.stats.blocks);
    if (!s) return `<div class="card p-5">${emptyState('পরিসংখ্যান এখনো প্রকাশিত হয়নি।', 'bar-chart-3')}</div>`;
    const pct = v => `${bnNum(Math.round(v * 10) / 10)}%`, bar = v => `<div class="h-2.5 rounded-full bg-slate-100 overflow-hidden"><div class="h-full bg-brand-600" style="width:${U.clamp(v, 0, 100)}%"></div></div>`;
    const top = s.topLabel === 'A+' ? 'জিপিএ-৫ (এ+)' : `${esc(s.topLabel || 'সর্বোচ্চ')} গ্রেড`;
    const k = [s.n !== undefined ? kpi('পরীক্ষার্থী', bnNum(s.n), '', 'users', 'blue') : '', s.passPct !== undefined ? kpi('পাসের হার', pct(s.passPct), '', 'badge-check', 'green') : '', s.top !== undefined ? kpi(top, bnNum(s.top), 'জন', 'trophy', 'amber') : ''].join('');
    const totalG = U.sum(s.grades || [], g => g[1]);
    const grades = s.grades?.length ? `<div class="card p-5"><div class="font-semibold mb-3">গ্রেড বণ্টন</div><div class="space-y-2">${s.grades.map(([l, c]) => `<div class="grid grid-cols-[5rem_1fr_4rem] items-center gap-3"><span class="font-semibold">${esc(/^[A-F][+-]?$/.test(l) ? l : bn(l))}</span>${bar(totalG ? c / totalG * 100 : 0)}<span class="text-right">${bnNum(c)}</span></div>`).join('')}</div></div>` : '';
    const subs = s.subjects?.length ? `<div class="card p-5"><div class="font-semibold mb-3">বিষয়ভিত্তিক পাসের হার</div><div class="space-y-2">${s.subjects.map(r => `<div class="grid grid-cols-[minmax(0,8rem)_1fr_4rem] items-center gap-3"><span class="truncate">${esc(r.name)}</span>${bar(r.passPct)}<span class="text-right">${pct(r.passPct)}</span></div>`).join('')}</div></div>` : '';
    const row = (name, g, cls = '') => `<tr class="${cls}"><td>${name}</td><td>${bnNum(g.n)}</td><td>${pct(g.passPct)}</td><td>${bnNum(g.top)}</td></tr>`;
    const brk = s.classes?.length ? `<div class="card scroll-x"><div class="px-5 py-3 border-b border-slate-100 font-semibold">শ্রেণি, শাখা ও বিভাগভিত্তিক</div><table class="table"><thead><tr><th>দল</th><th>পরীক্ষার্থী</th><th>পাসের হার</th><th>${top}</th></tr></thead><tbody>${s.classes.map(c => row(`<b>${esc(c.name)}</b>`, c) + (c.sections.length > 1 ? c.sections.map(g => row(`<span class="pl-4">শাখা ${esc(g.name)}</span>`, g)).join('') : '') + (c.groups.length > 1 ? c.groups.map(g => row(`<span class="pl-4">${esc(g.name)}</span>`, g)).join('') : '')).join('')}</tbody></table></div>` : '';
    return `<div class="card p-4 flex flex-wrap items-center gap-3"><label class="label !mb-0" for="pr-stat-ex">পরীক্ষা</label><select id="pr-stat-ex" class="select !w-auto max-w-full" onchange="PubResult.ui().statEx=this.value;App.refresh()">${ids.map(x => `<option value="${x}" ${x === id ? 'selected' : ''}>${esc(DB.exam(x)?.name || x)}</option>`).join('')}</select>${s.combined ? badge('সমন্বিত (চূড়ান্ত) ফলাফল অনুযায়ী', 'blue') : ''}</div>
      ${k ? `<div class="grid grid-cols-2 sm:grid-cols-3 gap-3">${k}</div>` : ''}${s.n !== undefined && s.n < (s.min || ResultCfg.MIN) ? `<div class="card p-4 text-slate-600">${bnNum(s.min || ResultCfg.MIN)} জনের কম পরীক্ষার্থী থাকায় বিস্তারিত পরিসংখ্যান দেখানো হচ্ছে না।</div>` : ''}
      <div class="grid lg:grid-cols-2 gap-5">${grades}${subs}</div>${brk}
      <p class="text-slate-500">${esc(ex?.name || '')} · শুধু সমষ্টিগত সংখ্যা; ${bnNum(s.min || ResultCfg.MIN)} জনের কম পরীক্ষার্থীর দল দেখানো হয় না।</p>`;
  },
};
Object.assign(App.portals.public.pages.find(p => p.id === 'results'), { render: q => PubResult.render(q), mount: q => PubResult.mount(q) });
