/* ==========================================================================
   RESULTS UI
   · MG — one editable, spreadsheet-like marks grid (নম্বরপত্র ও গ্রেডবুক) for teachers and staff:
     sticky header and identity columns, keyboard navigation, multi-cell selection, copy / paste from Excel,
     Google Sheets or CSV text, CSV import / export, fill-down, undo, filters and sorting, live totals /
     grade / GPA, validation colours. Staff see every subject of the class (subject → component columns);
     teachers only their own subjects. Computed and identity columns are read-only; admins can lock columns.
     Per-user table settings (visible columns, subject order, frozen columns, density, colour rules) live in
     the user's own record (users[].prefs.marksGrid). Saving goes through the normal state save.
   · MSD — marksheet design (school.msDesign) with a live preview.
   · PV — public result views (school.pubViews): class / section list, school summary, merit list, served by
     POST /api/public/results from the snapshot built here (pubResultSets).
   Load after examplan.js.
   ========================================================================== */

const MG = {
  AB: /^(অনুপস্থিত|অনু|অ|ab|abs|absent)$/i,
  ui() { return App.ui.mg || (App.ui.mg = { sec: '', grp: '', subj: '', comp: '', status: '', q: '', sort: null }); },
  prefs() {
    const u = DB.user(App.session?.userId), p = u?.prefs?.marksGrid || {};
    return { hidden: [], order: [], frozen: 3, density: 'normal', subTotals: false, rules: { range: true, absent: true, fail: true, top: false }, ...p, rules: { range: true, absent: true, fail: true, top: false, ...(p.rules || {}) } };
  },
  savePrefs(p) { const u = DB.user(App.session?.userId); if (!u) return; u.prefs = { ...(u.prefs || {}), marksGrid: p }; DB.save(); },
  staff() { return XO.staff(); },
  classes() { return this.staff() ? DB.classesIn().map(c => c.id) : Teacher.myClasses(); },
  canAdmin() { return this.staff() && (App.perm('exams', 'edit') || App.has('ADMIN')); },

  /* ---------- context ---------- */
  ctx() {
    const ui = this.ui(), exams = XO.exams();
    if (!exams.some(e => e.id === ui.exam)) ui.exam = (exams.find(e => !e.published) || exams[0])?.id;
    const ex = DB.exam(ui.exam), cls = this.classes().filter(c => ex && DB.examTakes(ex, c));
    if (!cls.includes(ui.cls)) ui.cls = cls[0];
    if (!ex || !ui.cls) return { ui, exams, ex, cls };
    // teachers edit only their own subjects; other subjects appear read-only when the Root User allows it
    const c = DB.cls(ui.cls), mine = this.staff() ? null : new Set(Teacher.mySubjects(ui.cls)), P = this.prefs(), seeAll = DB.s.school?.teacherMarksView === true;
    let subs = DB.examSubjects(ex, ui.cls).filter(s => !mine || seeAll || mine.has(s.id));
    subs.sort((a, b) => { const ia = P.order.indexOf(a.id), ib = P.order.indexOf(b.id); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib); });
    const key = `${ui.exam}|${ui.cls}`;
    if (ui.key !== key) { ui.key = key; ui.data = null; ui.dirty = new Set(); ui.undo = []; ui.sel = null; }
    return { ui, exams, ex, cls, c, subs, P, mine, campus: DB.campusOf(ui.cls) };
  },
  students(ex, cls, subs) { return DB.studentsIn(cls).filter(st => subs.some(s => this.takes(st, s.id))).sort((a, b) => (a.section || '').localeCompare(b.section || '') || (+a.roll - +b.roll)); },
  takes(st, sid) { return typeof SubjectSets === 'undefined' || SubjectSets.takes(st.id, sid); },
  locked(ex, key) { return (ex.lockedCols || []).includes(key) || (typeof MarkLock !== 'undefined' && MarkLock.locked(ex.id)); },
  /** Working copy: data[studentId][`${sid}:${k}`] = text as typed (absent = 'অ'). */
  load(x) {
    const { ui, ex, subs } = x; if (ui.data) return;
    ui.data = {};
    this.students(ex, ui.cls, subs).forEach(st => {
      const row = ui.data[st.id] = {};
      subs.forEach(s => {
        const m = DB.s.marks.find(y => y.examId === ex.id && y.studentId === st.id && y.subjectId === s.id), ab = m ? !!m.absent : !!DB.examAbsent?.(ex.id, st.id, s.id);
        Grade.comps(ex, s.id).forEach(c => { const v = ab ? 'অ' : !m ? '' : ['cq', 'mcq', 'pr'].includes(c.k) ? (m[c.k] ?? '') : (m.x?.[c.k] ?? ''); row[`${s.id}:${c.k}`] = c.k === 'att' && v === '' ? '' : String(v); });
      });
    });
  },
  /** Column model (after the user's hidden columns and the subject / component filter). */
  columns(x) {
    const { ui, ex, subs, P, mine } = x, out = [{ key: 'roll', label: 'রোল', ro: true, id: 1 }, { key: 'id', label: 'আইডি', ro: true, id: 1 }, { key: 'name', label: 'নাম', ro: true, id: 1 }];
    subs.filter(s => !ui.subj || s.id === ui.subj).forEach(s => {
      Grade.comps(ex, s.id).filter(c => !ui.comp || c.k === ui.comp).forEach(c => { const key = `${s.id}:${c.k}`; out.push({ key, s, c, label: c.label, max: c.max, ro: c.k === 'att' || this.locked(ex, key) || (!!mine && !mine.has(s.id)), lock: this.locked(ex, key), view: !!mine && !mine.has(s.id), auto: c.k === 'att' }); });
      if (P.subTotals) out.push({ key: `${s.id}:T`, s, label: 'মোট', ro: true, calc: 'st' }, { key: `${s.id}:G`, s, label: 'গ্রেড', ro: true, calc: 'sg' });
    });
    out.push({ key: 'TOT', label: 'সর্বমোট', ro: true, calc: 'tot' }, { key: 'GPA', label: 'জিপিএ', ro: true, calc: 'gpa' }, { key: 'RES', label: 'ফলাফল', ro: true, calc: 'res' });
    return out.filter(c => c.id || !P.hidden.includes(c.key) && !(c.s && P.hidden.includes(c.s.id)));
  },
  parse(v, max) {
    const s = U.asciiDigits(String(v ?? '')).trim();
    if (s === '') return { e: true };
    if (this.AB.test(s)) return { ab: true };
    const n = Number(s); return Number.isFinite(n) && n >= 0 && n <= max ? { n } : { bad: true };
  },
  /** Live result of one student from the working copy. */
  calc(x, st) {
    const { ui, ex, subs, campus } = x, row = ui.data[st.id] || {}, rows = [], per = {};
    subs.forEach(s => {
      if (!this.takes(st, s.id)) return;
      const comps = Grade.comps(ex, s.id), v = {}; let any = false, ab = false, bad = false;
      comps.forEach(c => { const p = this.parse(row[`${s.id}:${c.k}`], c.max); if (p.ab) ab = true; else if (p.bad) bad = true; else if (!p.e) { v[c.k] = p.n; if (c.k !== 'att') any = true; } else if (c.k === 'att') v.att = Grade.attMarks(DB.attendanceStats(st.id).pct, c); });
      if (ab) { const b = Grade.bands(campus, ex.session, ex), f = b[b.length - 1]; per[s.id] = { absent: true, letter: f.letter, point: f.point, failed: true, total: 0, max: Grade.cfg(ex, s.id).full }; rows.push({ subject: s, ...per[s.id] }); return; }
      if (!any) { per[s.id] = { empty: true, bad }; return; }
      const g = Grade.of(v.cq, v.mcq, ex, campus, v.pr, s.id, v); per[s.id] = { ...g, bad }; rows.push({ subject: s, ...g });
    });
    let agg = rows.length ? DB.examAggregate(rows, ex, campus) : null;
    if (agg && typeof SubjectSets !== 'undefined' && SubjectSets.active?.(st.classId)) agg = SubjectSets.applyFourth({ ...agg, exam: ex }, st);
    return { per, agg, complete: rows.length === subs.filter(s => this.takes(st, s.id)).length };
  },
  /** Rows after the filters and the chosen sort. */
  rows(x, cols) {
    const { ui, ex, subs } = x, q = String(ui.q || '').toLowerCase();
    let list = this.students(ex, ui.cls, subs).filter(st => (!ui.sec || st.section === ui.sec) && (!ui.grp || st.stream === ui.grp) && (!q || `${st.roll} ${st.id} ${st.name} ${st.nameBn || ''}`.toLowerCase().includes(q)));
    const R = new Map(list.map(st => [st.id, this.calc(x, st)]));
    if (ui.status) list = list.filter(st => { const r = R.get(st.id); return ui.status === 'absent' ? Object.values(r.per).some(p => p.absent) : ui.status === 'empty' ? Object.values(r.per).some(p => p.empty) : ui.status === 'pass' ? r.agg?.passed && r.complete : ui.status === 'fail' ? r.agg && !r.agg.passed : true; });
    if (ui.sort) {
      const { key, dir } = ui.sort, val = st => { const r = R.get(st.id), d = ui.data[st.id] || {}; if (key === 'roll') return +st.roll; if (key === 'id') return st.id; if (key === 'name') return pn(st); if (key === 'TOT') return r.agg?.total ?? -1; if (key === 'GPA') return r.agg?.gpa ?? -1; if (key === 'RES') return r.agg ? (r.agg.passed ? 1 : 0) : -1; const [sid, k] = key.split(':'); if (k === 'T' || k === 'G') return r.per[sid]?.total ?? -1; const n = Number(U.asciiDigits(d[key] || '')); return Number.isFinite(n) && d[key] !== '' ? n : -1; };
      list.sort((a, b) => { const va = val(a), vb = val(b); return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * dir; });
    }
    void cols; return { list, R };
  },

  /* ---------- render ---------- */
  render() {
    const x = this.ctx(), { ui, exams, ex, cls } = x;
    const head = pageHeader('নম্বরপত্র ও গ্রেডবুক', '');
    if (!exams.length) return head + `<div class="card p-6">${emptyState('এখনো কোনো পরীক্ষা নেই।', 'table-2')}</div>`;
    if (!cls.length) return head + `<div class="card p-6">${emptyState('এই পরীক্ষায় আপনার কোনো শ্রেণি নেই।', 'table-2')}</div>`;
    this.load(x);
    const { c, subs, P } = x, cols = this.columns(x), { list, R } = this.rows(x, cols), secs = c?.sections || [], grps = c?.streams || [];
    this._v = { x, cols, list };
    const opt = (id, label, items, cur, on, empty) => XO.sel(id, label, XO.opts(items, cur, empty), on);
    const bar = `<div class="card p-4 mb-3 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 items-end">
      ${opt('mg-ex', 'পরীক্ষা', exams.map(e => [e.id, e.name]), ui.exam, "MG.set('exam',this.value)")}
      ${opt('mg-cls', 'শ্রেণি', cls.map(c => [c, DB.className(c)]), ui.cls, "MG.set('cls',this.value)")}
      ${secs.length > 1 ? opt('mg-sec', 'শাখা', secs.map(s => [s, s]), ui.sec, "MG.set('sec',this.value)", 'সকল') : ''}
      ${grps.length ? opt('mg-grp', esc(c.streamLabel || 'বিভাগ'), grps.map(s => [s, s]), ui.grp, "MG.set('grp',this.value)", 'সকল') : ''}
      ${opt('mg-sub', 'বিষয়', subs.map(s => [s.id, s.name]), ui.subj, "MG.set('subj',this.value)", 'সকল বিষয়')}
      ${opt('mg-comp', 'অংশ', [...new Map(subs.flatMap(s => Grade.comps(ex, s.id)).map(k => [k.k, k.label])).entries()], ui.comp, "MG.set('comp',this.value)", 'সকল অংশ')}
      ${opt('mg-st', 'অবস্থা', [['pass', 'উত্তীর্ণ'], ['fail', 'অনুত্তীর্ণ'], ['absent', 'অনুপস্থিত আছে'], ['empty', 'নম্বর বাকি']], ui.status, "MG.set('status',this.value)", 'সকল')}
      <div class="min-w-0"><label class="label" for="mg-q">খুঁজুন</label><input id="mg-q" class="input" value="${esc(ui.q)}" onchange="MG.set('q',this.value)"></div></div>`;
    const tools = `<div class="flex flex-wrap items-center gap-2 mb-3">
      <button class="btn btn-ghost btn-sm" onclick="MG.undoLast()" ${ui.undo.length ? '' : 'disabled'}>${icon('undo-2')} পূর্বাবস্থা</button>
      <button class="btn btn-ghost btn-sm" onclick="MG.fillDown()">${icon('arrow-down-to-line')} নিচে পূরণ</button>
      <button class="btn btn-ghost btn-sm" onclick="MG.exportCsv()">${icon('file-down')} সিএসভি রপ্তানি</button>
      <label class="btn btn-ghost btn-sm cursor-pointer">${icon('file-up')} সিএসভি আমদানি<input type="file" accept=".csv,text/csv,text/plain" class="sr-only" onchange="MG.importCsv(this.files[0]);this.value=''"></label>
      <button class="btn btn-ghost btn-sm" onclick="MG.settings()">${icon('settings-2')} টেবিল সেটিংস</button>
      <span class="flex-1"></span><span class="text-slate-600">${bnNum(list.length)} জন${ui.dirty.size ? ` · ${badge(`${bnNum(ui.dirty.size)}টি পরিবর্তন`, 'amber')}` : ''}</span>
      <button class="btn btn-primary" onclick="MG.save()" ${ui.dirty.size ? '' : 'disabled'}>${icon('save')} সংরক্ষণ</button></div>`;
    const lockBox = typeof MarkLock !== 'undefined' && ex.published ? (MarkLock.locked(ex.id) ? MarkLock.banner() : `<div class="card p-3 mb-3 flex items-center gap-2">${icon('lock-open', 'w-5 h-5 text-slate-500')}<span>ফলাফল প্রকাশিত — আপনার সম্পাদনার অনুমতি আছে।</span></div>`) : '';
    return head + bar + lockBox + tools + this.tableHtml(x, cols, list, R, P);
  },
  W: { roll: 4, id: 6.5, name: 13 },
  tableHtml(x, cols, list, R, P) {
    const { ui } = x, dense = P.density === 'compact', frozen = Math.max(0, Math.min(3, +P.frozen || 0)), W = this.W;
    let left = 0; const lefts = {}; cols.slice(0, frozen).forEach(c => { lefts[c.key] = left; left += W[c.key] || 6; });
    const sticky = c => lefts[c.key] !== undefined ? `position:sticky;left:${lefts[c.key]}rem;z-index:2;` : '';
    const groups = []; cols.forEach(c => { const g = c.s ? c.s.id : '_'; const last = groups[groups.length - 1]; if (last && last.g === g) last.n++; else groups.push({ g, n: 1, s: c.s }); });
    // plain header; a subtle separator before each subject group (and before the summary columns)
    this._gs = new Set(cols.map((c, j) => (j > 0 && (c.s?.id || '_') !== (cols[j - 1].s?.id || '_') ? j : -1)).filter(j => j > 0));
    const arrow = k => ui.sort?.key === k ? (ui.sort.dir > 0 ? ' ▲' : ' ▼') : '';
    let gj = 0; const th1 = groups.map(g => { const j = gj; gj += g.n; return `<th colspan="${g.n}" class="${this._gs.has(j) ? 'xg-gs' : ''}" style="${g.g === '_' ? 'position:sticky;left:0;z-index:5;' : ''}">${g.s ? esc(g.s.name) : ''}</th>`; }).join('');
    const th2 = cols.map((c, j) => `<th data-c="${j}" style="${sticky(c)}${W[c.key] ? `min-width:${W[c.key]}rem;` : ''}${lefts[c.key] !== undefined ? 'z-index:5;' : ''}" class="${this._gs.has(j) ? 'xg-gs' : ''} ${c.lock ? 'mg-lock' : ''}"><button type="button" class="mg-sort" onclick="MG.sortBy('${c.key}')">${esc(c.label)}${c.max !== undefined ? ` /${bnNum(c.max)}` : ''}${c.lock ? ' ' + icon('lock', 'w-3 h-3 inline') : ''}${arrow(c.key)}</button></th>`).join('');
    this._sticky = sticky;
    const css = `<style>${XG_CSS}
      .mg-wrap{max-height:70vh;position:relative;outline:none}.mg-wrap:focus-visible{box-shadow:0 0 0 2px var(--brand,#4f46e5)}
      .xg.mg-t th,.xg.mg-t td{padding:${dense ? '.12rem .35rem' : '.35rem .55rem'}}.mg-t thead tr:nth-child(2) th{top:${dense ? '1.75rem' : '2.35rem'}}
      .mg-g{border-left:2px solid var(--xg-bd) !important}.mg-sort{font:inherit;font-weight:700;background:none;border:0;cursor:pointer;white-space:nowrap;color:inherit}
      .xg tbody tr>td.mg-ro{background:var(--xg-ro);color:var(--xg-mut)}.xg tbody tr>td.mg-calc{background:var(--xg-calc);font-weight:600}.xg tbody tr>td.mg-id{background:var(--xg-ro)}
      .mg-cell{cursor:cell;min-width:3.6rem;text-align:center;user-select:none}.mg-calc,.mg-ro{text-align:center}
      .xg tbody tr>td.mg-bad{background:var(--xg-bad);color:#dc2626;font-weight:700}.xg tbody tr>td.mg-ab{background:var(--xg-ab)}.mg-fail{color:#dc2626;font-weight:700}.xg tbody tr>td.mg-top{font-weight:800}
      .mg-cell:hover{box-shadow:inset 0 0 0 1px var(--xg-bd2)}.xg tbody tr>td.mg-dirty{box-shadow:inset 0 -2px 0 var(--xg-selb)}.xg tbody tr>td.mg-sel{background:var(--xg-sel) !important}.mg-cur{outline:2px solid var(--xg-selb);outline-offset:-2px}.mg-lock{color:var(--xg-mut)}
      .mg-ed{position:absolute;z-index:6;box-sizing:border-box;border:2px solid var(--xg-selb);border-radius:.15rem;background:var(--xg-bg);color:var(--xg-tx);font:inherit;text-align:center;padding:0 .3rem;outline:none;box-shadow:0 0 0 3px rgba(37,99,235,.2),0 2px 6px rgba(0,0,0,.12)}</style>`;
    return css + `<div class="xg-wrap mg-wrap" id="mg-wrap" tabindex="0" aria-label="নম্বরের স্প্রেডশিট"><table class="xg mg-t" id="mg-t"><thead><tr>${th1}</tr><tr>${th2}</tr></thead><tbody>${list.map((st, i) => `<tr data-st="${st.id}">${cols.map((c, j) => { const h = this.cellHtml(x, st, R.get(st.id), c, i, j); return this._gs.has(j) ? h.replace('<td ', '<td data-gs="1" ') : h; }).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}">${emptyState('কোনো শিক্ষার্থী নেই।')}</td></tr>`}</tbody></table><input id="mg-ed" class="mg-ed" hidden inputmode="decimal" aria-label="ঘর সম্পাদনা"></div>`;
  },
  /** One cell as plain text (editing happens in the single overlay editor). */
  cellHtml(x, st, r, c, i, j) {
    const { ui, P } = x, d = ui.data[st.id] || {}, base = `data-r="${i}" data-c="${j}"`, sticky = this._sticky || (() => '');
    if (c.key === 'roll') return `<td ${base} style="${sticky(c)}" class="mg-id">${bnNum(st.roll)}</td>`;
    if (c.key === 'id') return `<td ${base} style="${sticky(c)}" class="mg-id font-mono">${esc(st.id)}</td>`;
    if (c.key === 'name') return `<td ${base} style="${sticky(c)}" class="mg-id font-semibold">${esc(pn(st))}</td>`;
    if (c.s && !this.takes(st, c.s.id)) return `<td ${base} class="mg-ro">—</td>`;
    const p = c.s && r.per[c.s.id], rules = P.rules;
    if (c.calc === 'st') return `<td ${base} class="mg-calc">${p?.absent ? 'অনু' : p && !p.empty ? bnNum(p.total) : '—'}</td>`;
    if (c.calc === 'sg') return `<td ${base} class="mg-calc ${p?.failed && rules.fail ? 'mg-fail' : ''}">${p && !p.empty ? esc(p.letter) : '—'}</td>`;
    if (c.calc === 'tot') return `<td ${base} class="mg-calc">${r.agg ? bnNum(r.agg.total) : '—'}</td>`;
    if (c.calc === 'gpa') return `<td ${base} class="mg-calc ${r.agg?.gpa === 5 && rules.top ? 'mg-top' : ''}">${r.agg ? (r.agg.gpa === null ? esc(r.agg.letter) : gpaFmt(r.agg.gpa)) : '—'}</td>`;
    if (c.calc === 'res') return `<td ${base} class="mg-calc ${r.agg && r.complete && !r.agg.passed && rules.fail ? 'mg-fail' : ''}">${!r.agg ? '—' : !r.complete ? 'অসম্পূর্ণ' : r.agg.passed ? 'উত্তীর্ণ' : 'অনুত্তীর্ণ'}</td>`;
    const v = d[c.key] ?? '', pr = this.parse(v, c.max), cls = `${pr.bad && rules.range ? 'mg-bad' : ''} ${pr.ab && rules.absent ? 'mg-ab' : ''} ${ui.dirty.has(`${st.id}|${c.key}`) ? 'mg-dirty' : ''}`;
    if (c.ro) { const shown = c.auto && v === '' ? Grade.attMarks(DB.attendanceStats(st.id).pct, c.c) : v; return `<td ${base} class="mg-ro ${cls}">${esc(U.bn(String(shown)))}</td>`; }
    return `<td ${base} class="mg-cell ${cls}" aria-label="${esc(`${pn(st)} · ${c.s.name} · ${c.label}`)}">${esc(String(v))}</td>`;
  },
  set(k, v) { const ui = this.ui(); if ((k === 'exam' || k === 'cls') && ui.dirty?.size && !confirm('সংরক্ষণ না করা পরিবর্তন বাদ যাবে। চালিয়ে যাবেন?')) return App.refresh(); ui[k] = v; if (k === 'cls') { ui.sec = ''; ui.grp = ''; } App.refresh(); },
  sortBy(key) { const ui = this.ui(); ui.sort = ui.sort?.key === key ? (ui.sort.dir > 0 ? { key, dir: -1 } : null) : { key, dir: 1 }; App.refresh(); },

  /* ---------- editing ---------- */
  cellAt(r, c) { return $(`#mg-t td[data-r="${r}"][data-c="${c}"]`); },
  editable(r, c) { const { cols, list } = this._v, col = cols[c], st = list[r]; return !!(col && st && !col.ro && col.s && this.takes(st, col.s.id)); },
  /** Write values: [[r, c, text]]; read-only cells are skipped; one undo step. */
  write(items, label) {
    const { x, cols, list } = this._v, ui = x.ui, step = [];
    items.forEach(([r, c, v]) => {
      const col = cols[c], st = list[r]; if (!col || !st || col.ro || !col.s || !this.takes(st, col.s.id)) return;
      const d = ui.data[st.id] || (ui.data[st.id] = {}), old = d[col.key] ?? '', nv = String(v ?? '').trim();
      if (old === nv) return; d[col.key] = nv; ui.dirty.add(`${st.id}|${col.key}`); step.push({ sid: st.id, key: col.key, old, nv });
    });
    if (step.length) { ui.undo.push(step); if (ui.undo.length > 100) ui.undo.shift(); }
    void label; return step.length;
  },
  undoLast() { const ui = this.ui(), step = ui.undo.pop(); if (!step) return; step.forEach(s => { ui.data[s.sid][s.key] = s.old; }); App.refresh(); },
  selRect() { const s = this.ui().sel; if (!s) return null; return { r0: Math.min(s.r0, s.r1), r1: Math.max(s.r0, s.r1), c0: Math.min(s.c0, s.c1), c1: Math.max(s.c0, s.c1) }; },
  paintSel() {
    $$('#mg-t .mg-sel, #mg-t .mg-cur').forEach(e => e.classList.remove('mg-sel', 'mg-cur'));
    const R = this.selRect(), s = this.ui().sel; if (!R) return;
    for (let r = R.r0; r <= R.r1; r++) for (let c = R.c0; c <= R.c1; c++) { const td = this.cellAt(r, c); if (td) td.classList.add('mg-sel'); }
    this.cellAt(s.r1, s.c1)?.classList.add('mg-cur');
  },
  cellText(r, c) { if (this.editable(r, c)) { const { cols, list, x } = this._v; return x.ui.data[list[r].id]?.[cols[c].key] ?? ''; } const td = this.cellAt(r, c); return td ? td.innerText.trim() : ''; },
  fillDown() {
    const R = this.selRect(); if (!R || R.r1 === R.r0) return toast('একাধিক সারি নির্বাচন করুন (Shift + ক্লিক বা Shift + তীর)।', 'warn');
    const items = []; for (let c = R.c0; c <= R.c1; c++) { const v = this.cellText(R.r0, c); for (let r = R.r0 + 1; r <= R.r1; r++) items.push([r, c, U.asciiDigits(v)]); }
    if (this.write(items)) App.refresh();
  },
  /** Paste: rows split by new lines, cells by tab (or comma / semicolon when there is no tab). */
  paste(r0, c0, text) {
    const lines = String(text).replace(/\r/g, '').split('\n').filter((l, i, a) => l !== '' || i < a.length - 1);
    const tab = lines.some(l => l.includes('\t')), items = [];
    lines.forEach((l, i) => { const cells = tab ? l.split('\t') : l.split(/[,;]/); cells.forEach((v, j) => items.push([r0 + i, c0 + j, v.replace(/^"|"$/g, '')])); });
    const n = this.write(items); if (n) { App.refresh(); toast(`${bnNum(n)}টি ঘরে বসানো হয়েছে।`, 'success'); }
  },
  copy() { const R = this.selRect(); if (!R) return ''; const out = []; for (let r = R.r0; r <= R.r1; r++) { const row = []; for (let c = R.c0; c <= R.c1; c++) row.push(U.asciiDigits(this.cellText(r, c))); out.push(row.join('\t')); } return out.join('\n'); },
  /** Excel-like behaviour: cells show plain text; one overlay editor appears over the current cell while typing. */
  mount() {
    const wrap = $('#mg-wrap'), t = $('#mg-t'), ed = $('#mg-ed'); if (!wrap || !t) return;
    const ui = this.ui(), maxR = this._v.list.length - 1, maxC = this._v.cols.length - 1;
    const go = (r, c, extend) => {
      r = Math.max(0, Math.min(maxR, r)); c = Math.max(0, Math.min(maxC, c));
      ui.sel = extend && ui.sel ? { ...ui.sel, r1: r, c1: c } : { r0: r, c0: c, r1: r, c1: c }; this.paintSel();
      this.cellAt(r, c)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    const startEdit = (seed) => {
      const s = ui.sel; if (!s || !this.editable(s.r1, s.c1)) return;
      const td = this.cellAt(s.r1, s.c1), wr = wrap.getBoundingClientRect(), tr = td.getBoundingClientRect();
      Object.assign(ed.style, { left: `${tr.left - wr.left + wrap.scrollLeft}px`, top: `${tr.top - wr.top + wrap.scrollTop}px`, width: `${tr.width}px`, height: `${tr.height}px` });
      ed.dataset.r = s.r1; ed.dataset.c = s.c1; ed.hidden = false; ed.value = seed !== undefined ? seed : this.cellText(s.r1, s.c1); ed.focus();
      if (seed === undefined) ed.select(); else ed.setSelectionRange(ed.value.length, ed.value.length);
      this._editing = true;
    };
    const endEdit = (save) => {
      if (!this._editing) return; this._editing = false; ed.hidden = true;
      if (save) { const r = +ed.dataset.r, c = +ed.dataset.c; if (this.write([[r, c, ed.value]])) this.refreshRow(r); }
      wrap.focus({ preventScroll: true });
    };
    this._end = endEdit;
    wrap.addEventListener('mousedown', ev => {
      const td = ev.target.closest('td[data-r]'); if (!td || ev.target === ed) return;
      endEdit(true); const r = +td.dataset.r, c = +td.dataset.c;
      if (ev.shiftKey && ui.sel) { ev.preventDefault(); ui.sel = { ...ui.sel, r1: r, c1: c }; this.paintSel(); return; }
      ui.sel = { r0: r, c0: c, r1: r, c1: c }; this._drag = true; this.paintSel(); setTimeout(() => wrap.focus({ preventScroll: true }));
    });
    wrap.addEventListener('mouseover', ev => { if (!this._drag || !(ev.buttons & 1)) return; const td = ev.target.closest('td[data-r]'); if (!td) return; ui.sel = { ...ui.sel, r1: +td.dataset.r, c1: +td.dataset.c }; this.paintSel(); });
    if (!this._mu) { this._mu = true; document.addEventListener('mouseup', () => { this._drag = false; }); }
    wrap.addEventListener('dblclick', ev => { if (ev.target.closest('td[data-r]')) startEdit(); });
    ed.addEventListener('keydown', ev => {
      const r = +ed.dataset.r, c = +ed.dataset.c, mv = { Enter: [ev.shiftKey ? -1 : 1, 0], Tab: [0, ev.shiftKey ? -1 : 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[ev.key];
      if (ev.key === 'Escape') { ev.preventDefault(); return endEdit(false); }
      if (mv) { ev.preventDefault(); endEdit(true); go(r + mv[0], c + mv[1]); }
      ev.stopPropagation();
    });
    ed.addEventListener('blur', () => { if (this._editing) endEdit(true); });
    ed.addEventListener('paste', ev => { const text = ev.clipboardData?.getData('text/plain') || ''; if (!/[\t\n]/.test(text.trim())) return; ev.preventDefault(); const r = +ed.dataset.r, c = +ed.dataset.c; this._editing = false; ed.hidden = true; this.paste(r, c, text); });
    wrap.addEventListener('keydown', ev => {
      if (ev.target === ed || !ui.sel) return;
      const s = ui.sel, mod = ev.ctrlKey || ev.metaKey, k = ev.key, multi = () => { const R = this.selRect(); return R.r0 !== R.r1 || R.c0 !== R.c1; };
      if (mod && k.toLowerCase() === 'z') { ev.preventDefault(); return this.undoLast(); }
      if (mod && k.toLowerCase() === 'd') { ev.preventDefault(); return this.fillDown(); }
      if (mod) return;   // copy / paste arrive as clipboard events
      if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); const R = this.selRect(), items = []; for (let y = R.r0; y <= R.r1; y++) for (let x2 = R.c0; x2 <= R.c1; x2++) items.push([y, x2, '']); if (this.write(items)) { if (multi()) App.refresh(); else this.refreshRow(s.r1); } return; }
      if (k === 'F2') { ev.preventDefault(); return startEdit(); }
      const mv = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Enter: [ev.shiftKey ? -1 : 1, 0], Tab: [0, ev.shiftKey ? -1 : 1] }[k];
      if (mv) { ev.preventDefault(); return go(s.r1 + mv[0], s.c1 + mv[1], ev.shiftKey && k.startsWith('Arrow')); }
      if (k.length === 1 && !ev.altKey) { ev.preventDefault(); startEdit(k); }
    });
    wrap.addEventListener('copy', ev => { if (ev.target === ed || !ui.sel) return; ev.preventDefault(); const s = this.copy(); ev.clipboardData.setData('text/plain', s); this._clip = s; toast('কপি হয়েছে।', 'success'); });
    wrap.addEventListener('paste', ev => { if (ev.target === ed || !ui.sel) return; ev.preventDefault(); const R = this.selRect(); this.paste(R.r0, R.c0, ev.clipboardData?.getData('text/plain') || ''); });
    wrap.addEventListener('scroll', () => { if (this._editing) endEdit(true); });
    if (ui.sel) { this.paintSel(); if (ui.focusGrid) wrap.focus({ preventScroll: true }); }
    ui.focusGrid = true;
  },
  /** Recompute one row in place (totals, grade, GPA, colours) without re-rendering the table. */
  refreshRow(r) {
    const { x, cols, list } = this._v, st = list[r]; if (!st) return;
    const R = this.calc(x, st), tr = $(`#mg-t tr[data-st="${st.id}"]`); if (!tr) return;
    // re-render this row's cells (text, totals, colours) in place; the selection is painted again
    cols.forEach((c, j) => {
      const td = tr.querySelector(`td[data-c="${j}"]`); if (!td || c.id) return;
      const n = document.createElement('tbody'); n.innerHTML = `<tr>${this.cellHtml(x, st, R, c, r, j)}</tr>`; const nt = n.querySelector('td');
      td.className = nt.className; td.innerHTML = nt.innerHTML;
    });
    this.paintSel();
  },

  /* ---------- save, CSV ---------- */
  async save() {
    const x = this.ctx(), { ui, ex } = x; if (!ui.dirty.size) return;
    const pairs = new Map(); [...ui.dirty].forEach(k => { const [sid, key] = k.split('|'), [sub] = key.split(':'); pairs.set(`${sid}|${sub}`, [sid, sub]); });
    const bad = [];
    pairs.forEach(([sid, sub]) => Grade.comps(ex, sub).forEach(c => { if (this.parse(ui.data[sid]?.[`${sub}:${c.k}`], c.max).bad) bad.push(sid); }));
    if (bad.length) return toast(`${bnNum(new Set(bad).size)} জনের নম্বর সীমার বাইরে বা সংখ্যা নয় (লাল ঘর)।`, 'error');
    const list = [...pairs.values()]; let n = 0;
    for (let i = 0; i < list.length; i += 300) {   // batches keep large classes responsive
      list.slice(i, i + 300).forEach(([sid, sub]) => {
        const d = ui.data[sid] || {}, comps = Grade.comps(ex, sub), vals = {}; let ab = false, any = false;
        comps.forEach(c => { const p = this.parse(d[`${sub}:${c.k}`], c.max); if (p.ab) ab = true; else if (!p.e) { vals[c.k] = p.n; if (c.k !== 'att') any = true; } else if (!['cq', 'mcq', 'pr'].includes(c.k)) vals[c.k] = ''; else vals[c.k] = ''; });
        const m0 = DB.s.marks.find(m => m.examId === ex.id && m.studentId === sid && m.subjectId === sub);
        if (ab) { const m = DB.setMark(ex.id, sid, sub, { cq: 0, mcq: 0, pr: 0 }); delete m.x; m.absent = true; n++; return; }
        if (!any) { if (m0) { DB.s.marks = DB.s.marks.filter(m => m !== m0); n++; } return; }
        DB.setMark(ex.id, sid, sub, vals); n++;
      });
      if (i + 300 < list.length) await new Promise(r => setTimeout(r, 0));
    }
    DB.audit('MARKS_GRID', 'marks', `${ex.id} · ${DB.className(ui.cls)}: ${n}টি বিষয়-নম্বর (স্প্রেডশিট)`); DB.save();
    ui.dirty = new Set(); ui.undo = []; toast(`${bnNum(n)}টি বিষয়ের নম্বর সংরক্ষিত হয়েছে।`, 'success'); App.refresh();
  },
  exportCsv() {
    const { x, cols, list } = this._v || {}; if (!cols) return;
    const R = new Map(list.map(st => [st.id, this.calc(x, st)]));
    const head = cols.map(c => c.s ? `${c.s.name} — ${c.label}` : c.label);
    const rows = list.map((st, i) => cols.map((c, j) => { void i; void j; if (c.key === 'roll') return st.roll; if (c.key === 'id') return st.id; if (c.key === 'name') return pn(st); const r = R.get(st.id), p = c.s && r.per[c.s.id]; if (c.calc === 'st') return p?.absent ? 'অনুপস্থিত' : p && !p.empty ? p.total : ''; if (c.calc === 'sg') return p && !p.empty ? p.letter : ''; if (c.calc === 'tot') return r.agg?.total ?? ''; if (c.calc === 'gpa') return r.agg ? (r.agg.gpa ?? r.agg.letter) : ''; if (c.calc === 'res') return r.agg ? (r.agg.passed ? 'উত্তীর্ণ' : 'অনুত্তীর্ণ') : ''; if (c.s && !this.takes(st, c.s.id)) return '—'; const v = x.ui.data[st.id]?.[c.key] ?? ''; return c.auto && v === '' ? Grade.attMarks(DB.attendanceStats(st.id).pct, c.c) : v; }));
    CSVKit.download(`marks-${x.ui.exam}-${x.ui.cls}.csv`, [head, ...rows]);
  },
  /** CSV with ID / roll / name + "বিষয় — অংশ" columns (the export format) → into the grid as unsaved changes. */
  async importCsv(f) {
    if (!f) return; const { x, cols, list } = this._v, text = await f.text(), grid = CSVKit.parse(text);
    if (grid.length < 2) return toast('ফাইলে কোনো তথ্য-সারি নেই।', 'error');
    const n = s => CSVKit.norm(s), head = grid[0], idC = head.findIndex(h => ['আইডি', 'শিক্ষার্থীআইডি', 'id', 'studentid'].includes(n(h))), rollC = head.findIndex(h => ['রোল', 'roll'].includes(n(h)));
    const map = head.map(h => cols.findIndex(c => c.s && !c.ro && (n(`${c.s.name} — ${c.label}`) === n(h) || n(c.key) === n(h))));
    if (!map.some(j => j >= 0)) return toast('কোনো বিষয়-অংশের কলাম চেনা যায়নি।', 'error');
    const items = [], errs = [];
    grid.slice(1).forEach((row, ri) => {
      const id = idC >= 0 ? U.asciiDigits(String(row[idC] || '')).trim().toUpperCase() : '', roll = rollC >= 0 ? +U.asciiDigits(String(row[rollC] || '')) : 0;
      if (!id && !roll) return;
      let r = id ? list.findIndex(s => s.id.toUpperCase() === id || String(s.regNo || '').toUpperCase() === id) : -1;
      if (r < 0 && !id) { const c = list.map((s, i) => [s, i]).filter(([s]) => +s.roll === roll); if (c.length === 1) r = c[0][1]; else return errs.push(`সারি ${bnNum(ri + 2)}: রোল ${bnNum(roll)} ${c.length ? 'একাধিক — আইডি দিন' : 'পাওয়া যায়নি'}`); }
      if (r < 0) return errs.push(`সারি ${bnNum(ri + 2)}: ${id} এই তালিকায় নেই`);
      map.forEach((j, k) => { if (j >= 0 && String(row[k] ?? '').trim() !== '' && row[k] !== '—') items.push([r, j, row[k]]); });
    });
    const w = this.write(items); App.refresh();
    toast(`${bnNum(w)}টি ঘর বসানো হয়েছে — যাচাই করে সংরক্ষণ করুন।${errs.length ? ` ${bnNum(errs.length)}টি সারি বাদ: ${errs.slice(0, 2).join('; ')}` : ''}`, errs.length ? 'warn' : 'success');
    void x;
  },

  /* ---------- table settings (per user) & column locks (admins) ---------- */
  settings() {
    const x = this.ctx(), { ex, subs, P } = x;
    const comps = subs.flatMap(s => Grade.comps(ex, s.id).map(c => ({ key: `${s.id}:${c.k}`, label: `${s.name} — ${c.label}` })));
    const chk = (name, val, on, label) => `<label class="flex items-center gap-2 py-1"><input type="checkbox" class="w-5 h-5" name="${name}" value="${esc(val)}" ${on ? 'checked' : ''}> ${esc(label)}</label>`;
    Modal.open({ title: 'টেবিল সেটিংস', size: 'lg', body: `<form id="mgs" class="space-y-4">
      <div><div class="font-semibold mb-1">দেখানো বিষয় ও ক্রম</div><div id="mgs-order" class="space-y-1">${subs.map((s, i) => `<div class="flex items-center gap-2" data-sid="${s.id}">${chk('show', s.id, !P.hidden.includes(s.id), s.name)}<span class="flex-1"></span><button type="button" class="btn btn-ghost btn-sm" aria-label="ওপরে" onclick="MG.mvSub(this,-1)" ${i ? '' : 'disabled'}>${icon('arrow-up')}</button><button type="button" class="btn btn-ghost btn-sm" aria-label="নিচে" onclick="MG.mvSub(this,1)">${icon('arrow-down')}</button></div>`).join('')}</div></div>
      <div><div class="font-semibold mb-1">দেখানো কলাম</div><div class="grid sm:grid-cols-2 gap-x-4">${chk('subTotals', '1', P.subTotals, 'বিষয়ভিত্তিক মোট ও গ্রেড')}${comps.map(c => chk('col', c.key, !P.hidden.includes(c.key), c.label)).join('')}${chk('col', 'TOT', !P.hidden.includes('TOT'), 'সর্বমোট')}${chk('col', 'GPA', !P.hidden.includes('GPA'), 'জিপিএ')}${chk('col', 'RES', !P.hidden.includes('RES'), 'ফলাফল')}</div></div>
      <div class="grid sm:grid-cols-2 gap-3"><div><label class="label" for="mgs-fr">স্থির কলাম</label><select id="mgs-fr" class="select" name="frozen">${[[0, 'নেই'], [1, 'রোল'], [2, 'রোল ও আইডি'], [3, 'রোল, আইডি ও নাম']].map(([v, l]) => `<option value="${v}" ${+P.frozen === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div><label class="label" for="mgs-de">ঘনত্ব</label><select id="mgs-de" class="select" name="density"><option value="normal" ${P.density !== 'compact' ? 'selected' : ''}>স্বাভাবিক</option><option value="compact" ${P.density === 'compact' ? 'selected' : ''}>ঘন</option></select></div></div>
      <div><div class="font-semibold mb-1">রঙের নিয়ম</div><div class="grid sm:grid-cols-2 gap-x-4">${chk('rule', 'range', P.rules.range, 'সীমার বাইরের নম্বর লাল')}${chk('rule', 'absent', P.rules.absent, 'অনুপস্থিত হলুদ')}${chk('rule', 'fail', P.rules.fail, 'অকৃতকার্য গ্রেড লাল')}${chk('rule', 'top', P.rules.top, 'জিপিএ ৫ সবুজ')}</div></div>
      ${this.canAdmin() ? `<div><div class="font-semibold mb-1">লক করা কলাম (সবার জন্য)</div><div class="grid sm:grid-cols-2 gap-x-4">${comps.map(c => chk('lock', c.key, (ex.lockedCols || []).includes(c.key), c.label)).join('')}</div></div>` : ''}
      <button class="btn btn-primary w-full">${icon('save')} সংরক্ষণ</button></form>` });
    $('#mgs').addEventListener('submit', ev => {
      ev.preventDefault(); const f = ev.target, all = name => $$(`#mgs input[name=${name}]`);
      const hidden = [...all('show').filter(i => !i.checked).map(i => i.value), ...all('col').filter(i => !i.checked).map(i => i.value)];
      const order = $$('#mgs-order [data-sid]').map(d => d.dataset.sid);
      this.savePrefs({ hidden, order, subTotals: !!$('#mgs input[name=subTotals]')?.checked, frozen: +f.frozen.value, density: f.density.value, rules: Object.fromEntries(all('rule').map(i => [i.value, i.checked])) });
      if (this.canAdmin()) { const locks = all('lock').filter(i => i.checked).map(i => i.value), other = (ex.lockedCols || []).filter(k => !comps.some(c => c.key === k)); ex.lockedCols = [...other, ...locks]; if (!ex.lockedCols.length) delete ex.lockedCols; DB.audit('MARKS_LOCK', 'exams', `${ex.id}: ${locks.join(', ') || '—'}`); DB.save(); }
      Modal.close(); App.refresh();
    });
  },
  mvSub(btn, d) { const row = btn.closest('[data-sid]'), box = row.parentElement; if (d < 0 && row.previousElementSibling) box.insertBefore(row, row.previousElementSibling); if (d > 0 && row.nextElementSibling) box.insertBefore(row.nextElementSibling, row); },
};

/* ---------- the grid replaces the gradebook (teacher) and the staff marks entry / bulk grid ---------- */
(() => {
  const g = App.portals.teacher?.pages.find(p => p.id === 'gradebook');
  if (g) Object.assign(g, { label: 'নম্বরপত্র ও গ্রেডবুক', render: () => MG.render(), mount: () => MG.mount() });
  if (typeof XM !== 'undefined') {
    XM.results = function () {
      return this.page('ফলাফল', [['gradebook', 'নম্বরপত্র ও গ্রেডবুক', 'table-2'], ['results', 'ফলাফল', 'award'], ['comps', 'মূল্যায়নের অংশ', 'list-tree'], ['publish', 'প্রকাশ ও সেটিংস', 'send'], ['design', 'মার্কশিট ডিজাইন', 'palette'], ['public', 'পাবলিক ফলাফল', 'globe'], ['recheck', 'পুননিরীক্ষণ', 'file-search']], 'rs', t => {
        if (t === 'gradebook') return XM.demote(MG.render());
        if (t === 'design') return MSD.render();
        if (t === 'public') return PV.render();
        if (t === 'publish') return PUB.render();
        if (t === 'recheck') return RC.render();
        if (t === 'comps') return this.comps();
        return this.hub('results');
      });
    };
    ['admin', 'principal'].forEach(portal => {
      const P = App.portals[portal]; if (!P) return;
      const rs = P.pages.find(p => p.id === 'exam-results'); if (rs) rs.mount = () => { if ((App.ui.xm?.rs || 'gradebook') === 'gradebook') MG.mount(); if (App.ui.xm?.rs === 'design') MSD.mount(); };
      const b = P.pages.find(p => p.id === 'bulk-marks'); if (b) b.render = () => { (App.ui.xm || (App.ui.xm = {})).rs = 'gradebook'; App.route.page = 'exam-results'; App.replaceUrl(App.href(App.route.portal, 'exam-results')); return P.pages.find(p => p.id === 'exam-results').render(); };
    });
  }
  // StaffMarks (marks-entry) renders the gradebook page; with the grid it shows every class for staff
})();

/* ==========================================================================
   MARKSHEET DESIGN (live preview)
   ========================================================================== */
const MSD = {
  BLOCKS: [['guardian', 'পিতা / অভিভাবক'], ['dob', 'জন্মতারিখ'], ['regNo', 'রেজিস্ট্রেশন নম্বর'], ['qr', 'যাচাইয়ের কিউআর কোড'], ['summary', 'ফলাফলের সারসংক্ষেপ'], ['rules', 'স্কেল ও পাসের নিয়ম'], ['remarks', 'শিক্ষকের মন্তব্য'], ['watermark', 'জলছাপ'], ['stamp', 'সিল'], ['signClass', 'শ্রেণিশিক্ষকের স্বাক্ষর'], ['signController', 'পরীক্ষা নিয়ন্ত্রকের স্বাক্ষর'], ['signPrincipal', 'অধ্যক্ষের স্বাক্ষর'], ['subTotal', 'বিষয়ভিত্তিক মোট'], ['subGrade', 'বিষয়ভিত্তিক গ্রেড']],
  can() { return App.perm('exams', 'edit') || App.has('ADMIN'); },
  sample() {
    const ui = App.ui.msd || (App.ui.msd = {}), exams = DB.s.exams.filter(e => DB.s.marks.some(m => m.examId === e.id)).sort((a, b) => b.start.localeCompare(a.start));
    if (!exams.some(e => e.id === ui.exam)) ui.exam = exams[0]?.id;
    const st = ui.exam && DB.s.students.find(s => DB.s.marks.some(m => m.examId === ui.exam && m.studentId === s.id));
    return { ui, exams, st };
  },
  render() {
    const D = Print.msDesign(), dis = this.can() ? '' : 'disabled', { ui, exams, st } = this.sample();
    const ctl = `<form id="msd" class="card p-4 space-y-3" onchange="MSD.apply()">
      <div class="grid sm:grid-cols-2 gap-3"><div><label class="label" for="msd-t">টেমপ্লেট</label><select id="msd-t" class="select" name="template" ${dis}>${[['classic', 'ক্লাসিক'], ['modern', 'আধুনিক'], ['compact', 'সংক্ষিপ্ত']].map(([k, l]) => `<option value="${k}" ${D.template === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div><label class="label" for="msd-c">মূল রং</label><input id="msd-c" class="input" type="color" name="accent" value="${esc(D.accent || '#1e3a8a')}" ${dis}></div>
        <div class="sm:col-span-2"><label class="label" for="msd-title">শিরোনাম</label><input id="msd-title" class="input" name="title" value="${esc(D.title)}" placeholder="একাডেমিক ট্রান্সক্রিপ্ট / নম্বরপত্র" ${dis}></div></div>
      <div class="grid sm:grid-cols-2 gap-x-4">${[['logo', 'লোগো', D.logo], ['gradeTable', 'গ্রেডিং তালিকা', D.gradeTable]].map(([k, l, on]) => `<label class="flex items-center gap-2 py-1"><input type="checkbox" class="w-5 h-5" name="${k}" ${on ? 'checked' : ''} ${dis}> ${l}</label>`).join('')}${this.BLOCKS.map(([k, l]) => `<label class="flex items-center gap-2 py-1"><input type="checkbox" class="w-5 h-5" name="b_${k}" ${D.blocks[k] ? 'checked' : ''} ${dis}> ${l}</label>`).join('')}</div>
      <div class="flex flex-wrap gap-2"><button type="button" class="btn btn-ghost" onclick="MSD.reset()" ${dis}>${icon('rotate-ccw')} ডিফল্ট</button><span class="flex-1"></span>${st ? `<button type="button" class="btn btn-ghost" onclick="Print.preview('নম্বরপত্র', Print.marksheet(DB.student('${st.id}'),'${ui.exam}'))">${icon('printer')} পূর্ণ মুদ্রণ-প্রিভিউ</button>` : ''}</div></form>`;
    const pv = `<div class="card p-3"><div class="flex flex-wrap items-end gap-2 mb-2">${XO.sel('msd-ex', 'নমুনা পরীক্ষা', XO.opts(exams.map(e => [e.id, e.name]), ui.exam), "App.ui.msd.exam=this.value;App.refresh()")}</div><div id="msd-pv" class="overflow-hidden rounded-lg border border-slate-200 bg-slate-100" style="height:560px"></div></div>`;
    return `<div class="grid xl:grid-cols-2 gap-4">${ctl}${pv}</div>`;
  },
  mount() { this.preview(); },
  preview() {
    const box = $('#msd-pv'); if (!box) return; const { ui, st } = this.sample();
    if (!st) { box.innerHTML = emptyState('নমুনা দেখানোর মতো কোনো নম্বর নেই।'); return; }
    const html = Print.marksheet(st, ui.exam)[0], w = box.clientWidth || 360, scale = Math.min(1, (w - 8) / (210 * 3.7795));
    box.innerHTML = `<div style="transform:scale(${scale});transform-origin:top left;width:210mm;background:#fff">${html}</div>`;
    box.style.height = `${Math.ceil(297 * 3.7795 * scale) + 8}px`;
  },
  apply() {
    if (!this.can()) return; const f = $('#msd'), on = n => !!f.elements[n]?.checked;
    DB.s.school.msDesign = { template: f.template.value, accent: f.accent.value, title: f.title.value.trim(), logo: on('logo'), gradeTable: on('gradeTable'), blocks: Object.fromEntries(this.BLOCKS.map(([k]) => [k, on(`b_${k}`)])) };
    DB.audit('MARKSHEET_DESIGN', 'exams', `${f.template.value}`); DB.save(); this.preview();
  },
  reset() { delete DB.s.school.msDesign; DB.save(); App.refresh(); },
};

/* ==========================================================================
   PUBLIC RESULT VIEWS
   ========================================================================== */
const PV = {
  VIEWS: [['list', 'শ্রেণি / শাখাভিত্তিক ফলাফল তালিকা'], ['summary', 'প্রতিষ্ঠানের ফলাফল সারসংক্ষেপ'], ['merit', 'মেধাতালিকা']],
  cfg() { const c = DB.s.school.pubViews || {}; return { list: { on: false, showName: true, showId: false, showTotal: false, by: 'section', ...(c.list || {}) }, summary: { on: false, ...(c.summary || {}) }, merit: { on: false, top: 10, showName: true, showId: false, showTotal: false, ...(c.merit || {}) } }; },
  can() { return App.perm('exams', 'edit') || App.has('ADMIN'); },
  render() {
    const c = this.cfg(), dis = this.can() ? '' : 'disabled', sets = DB.s.pubResultSets || {}, pub = DB.s.exams.filter(e => e.published).sort((a, b) => b.start.localeCompare(a.start));
    const chk = (v, k, l) => `<label class="flex items-center gap-2 py-1"><input type="checkbox" class="w-5 h-5" ${c[v][k] ? 'checked' : ''} ${dis} onchange="PV.set('${v}','${k}',this.checked)"> ${l}</label>`;
    const views = this.VIEWS.map(([v, l]) => `<div class="card p-4 space-y-2"><div class="flex items-center gap-2"><b class="flex-1">${l}</b>${chk(v, 'on', 'চালু')}</div>
      ${v !== 'summary' ? `<div class="grid sm:grid-cols-3 gap-x-4">${chk(v, 'showName', 'নাম')}${chk(v, 'showId', 'শিক্ষার্থী আইডি')}${chk(v, 'showTotal', 'মোট নম্বর')}</div>` : ''}
      ${v === 'list' ? `<div class="max-w-xs"><label class="label">তালিকা</label><select class="select" ${dis} onchange="PV.set('list','by',this.value)"><option value="section" ${c.list.by === 'section' ? 'selected' : ''}>শাখাভিত্তিক</option><option value="class" ${c.list.by === 'class' ? 'selected' : ''}>শ্রেণিভিত্তিক</option></select></div>` : ''}
      ${v === 'merit' ? `<div class="max-w-xs"><label class="label">শীর্ষ কতজন</label><input class="input" type="number" min="1" max="100" value="${c.merit.top}" ${dis} onchange="PV.set('merit','top',Math.max(1,Math.min(100,+this.value||10)))"></div>` : ''}</div>`).join('');
    const snaps = `<div class="card p-4"><div class="font-semibold mb-2">প্রকাশিত তালিকা</div><div class="space-y-2">${pub.map(e => `<div class="flex flex-wrap items-center gap-2"><span class="flex-1 min-w-[10rem]">${esc(e.name)}</span>${sets[e.id] ? badge(`হালনাগাদ ${XO.dt(sets[e.id].at)}`, 'green') : badge('তৈরি হয়নি', 'slate')}<button class="btn btn-ghost btn-sm" ${dis} onclick="PV.build('${e.id}')">${icon('refresh-cw')} তৈরি / হালনাগাদ</button>${sets[e.id] ? `<button class="btn btn-ghost btn-sm text-red-600" ${dis} onclick="PV.drop('${e.id}')">${icon('trash-2')}</button>` : ''}</div>`).join('') || emptyState('কোনো প্রকাশিত পরীক্ষা নেই।')}</div>
      <div class="flex flex-wrap gap-2 mt-3"><a class="btn btn-ghost" href="${App.href('public', 'result-board')}" target="_blank" rel="noopener">${icon('external-link')} পাবলিক পাতা দেখুন</a></div></div>`;
    const search = typeof ResultCfg !== 'undefined' ? `<form class="card p-4" onsubmit="event.preventDefault();ResultCfg.save(this);DB.save();toast('সংরক্ষিত হয়েছে।','success')"><div class="font-semibold text-lg mb-3">ফলাফল অনুসন্ধান (শনাক্তকারী ও কার্ড)</div>${ResultCfg.editor().replace(/<button class="btn btn-primary">[\s\S]*?<\/button>/, '')}${ResultCfg.canEdit() ? `<button class="btn btn-primary mt-3">${icon('save')} সংরক্ষণ</button>` : ''}</form>` : '';
    return `<div class="grid lg:grid-cols-2 gap-4 mb-4">${views}${snaps}</div>${search}`;
  },
  set(v, k, val) {
    const c = this.cfg(); c[v][k] = val; DB.s.school.pubViews = c; DB.audit('PUBLIC_RESULT_VIEWS', 'exams', `${v}.${k} → ${val}`);
    // switching a view on fills in the lists of published exams that have none yet
    if (k === 'on' && val) DB.s.exams.filter(e => e.published && !DB.s.pubResultSets?.[e.id]).forEach(e => this.build(e.id, true));
    DB.save(); App.refresh();
  },
  /** Snapshot of computed results only (no contact or personal data beyond roll / ID / name). */
  build(examId, quiet) {
    const ex = DB.exam(examId); if (!ex?.published) return quiet ? null : toast('আগে ফলাফল প্রকাশ করুন।', 'warn');
    const classes = {};
    DB.examClasses(ex).forEach(c => {
      const rank = DB.examRanking(examId, c.id); if (!rank.length) return;
      classes[c.id] = { name: DB.className(c.id), rows: rank.map(x => ({ id: x.st.id, roll: +x.st.roll, name: pn(x.st), section: x.st.section || '', gpa: x.c.gpa ?? null, letter: x.c.letter, passed: !!x.c.passed, total: Math.round(x.c.total * 10) / 10, max: x.c.max, pos: x.pos })) };
    });
    (DB.s.pubResultSets || (DB.s.pubResultSets = {}))[examId] = { at: new Date().toISOString(), by: App.session.userId, classes };
    DB.audit('PUBLIC_RESULT_SET', 'exams', `${examId}: ${Object.keys(classes).length}টি শ্রেণি`); DB.save();
    if (!quiet) { toast('পাবলিক তালিকা হালনাগাদ হয়েছে।', 'success'); App.refresh(); }
  },
  drop(examId) { if (!confirm('এই পরীক্ষার পাবলিক তালিকা সরিয়ে ফেলবেন?')) return; delete DB.s.pubResultSets[examId]; DB.save(); App.refresh(); },
};
// publishing a result builds (or refreshes) its public list automatically while any public view is on;
// unpublishing removes it, so the public views never show an unpublished result
(() => {
  const t0 = Exams.togglePublish.bind(Exams);
  Exams.togglePublish = function (id) {
    t0(id); const ex = DB.exam(id); if (!ex) return;
    if (ex.published && RBD.views().length) PV.build(id, true);
    else if (!ex.published && DB.s.pubResultSets?.[id]) { delete DB.s.pubResultSets[id]; DB.save(); }
  };
  // snapshots written by the demo seed (seed: true) are rebuilt with the app's own ranking at the first staff sign-in
  const b0 = App.boot.bind(App);
  App.boot = function (...a) {
    const r = b0(...a);
    setTimeout(() => { try { if (App.session && ResultCfg.canEdit()) Object.entries(DB.s.pubResultSets || {}).forEach(([id, v]) => { if (v?.seed && DB.exam(id)?.published) PV.build(id, true); }); } catch (e) { console.error(e); } }, 1500);
    return r;
  };
})();

/* ---------- the public page: class list · school summary · merit list ---------- */
const RBD = {
  st() { return App.ui.rbd || (App.ui.rbd = { kind: '', exam: '', cls: '', sec: '' }); },
  views() { const c = DB.s.school?.pubViews || {}; return PV.VIEWS.filter(([k]) => c[k]?.on); },
  /** One board view inside the public result page: filters + the table. */
  embed(kind) {
    const ui = this.st(), exams = (DB.s.exams || []).filter(e => e.published).sort((a, b) => String(b.start).localeCompare(String(a.start)));
    ui.kind = kind;
    if (!exams.length) return `<div class="card p-6">${emptyState('এখন কোনো তালিকা প্রকাশিত নেই।', 'award')}</div>`;
    if (!exams.some(e => e.id === ui.exam)) ui.exam = exams[0].id;
    const cls = (DB.s.classes || []).filter(c => { const e = DB.exam(ui.exam); return !e?.classes?.length || e.classes.includes(c.id); });
    if (ui.kind === 'list' && !cls.some(c => c.id === ui.cls)) ui.cls = cls[0]?.id || '';
    let h = `<div class="card p-4 grid sm:grid-cols-3 gap-3 items-end">${XO.sel('rbd-ex', 'পরীক্ষা', XO.opts(exams.map(e => [e.id, e.name]), ui.exam), "App.ui.rbd.exam=this.value;RBD.load()")}
      ${ui.kind !== 'summary' ? XO.sel('rbd-cls', 'শ্রেণি', XO.opts(cls.map(c => [c.id, c.name]), ui.cls, ui.kind === 'merit' ? 'সকল শ্রেণি' : ''), "App.ui.rbd.cls=this.value;App.ui.rbd.sec='';RBD.load()") : ''}
      ${ui.kind === 'list' && ui.data?.sections?.length > 1 ? XO.sel('rbd-sec', 'শাখা', XO.opts(ui.data.sections.map(s => [s, s]), ui.sec, 'সকল'), "App.ui.rbd.sec=this.value;RBD.load()") : ''}</div>`;
    return h + `<div id="rbd-body">${this.body()}</div>`;
  },
  key() { const ui = this.st(); return `${ui.kind}|${ui.exam}|${ui.cls}|${ui.sec}`; },
  mount() { if (this.st().loaded !== this.key() && !this._busy) this.load(); },
  async load() {
    const ui = this.st(); this._busy = true; ui.loaded = this.key();
    try { ui.data = await DB.api('public/results', { kind: ui.kind, examId: ui.exam, classId: ui.kind === 'summary' ? '' : ui.cls, section: ui.sec }); ui.err = null; }
    catch (e) { ui.data = null; ui.err = e.message; }
    this._busy = false; App.refresh();
  },
  body() {
    const ui = this.st(), d = ui.loaded === this.key() && !this._busy ? ui.data : null;
    if (ui.err && ui.loaded === this.key()) return `<div class="card p-6">${emptyState(ui.err === 'off' ? 'এই তালিকা এখন বন্ধ।' : ui.err === 'too_many' ? 'অনেকবার খোঁজা হয়েছে — কিছুক্ষণ পরে আবার চেষ্টা করুন।' : 'এই পরীক্ষার তালিকা এখনো প্রকাশিত হয়নি।', 'award')}</div>`;
    if (!d) return `<div class="card p-6">${emptyState('লোড হচ্ছে…', 'loader')}</div>`;
    const g = r => r.gpa === null || r.gpa === undefined ? esc(r.letter || '—') : gpaFmt(r.gpa);
    const res = r => r.passed ? badge('উত্তীর্ণ', 'green') : badge('অনুত্তীর্ণ', 'red');
    if (ui.kind === 'summary') return `<div class="grid grid-cols-3 gap-3 mb-4">${[['পরীক্ষার্থী', bnNum(d.total.n)], ['উত্তীর্ণ', bnNum(d.total.passed)], ['পাসের হার', `${bnNum(d.total.rate)}%`]].map(([l, v]) => `<div class="card p-4"><div class="text-slate-500">${l}</div><div class="text-xl font-bold">${v}</div></div>`).join('')}</div>
      <div class="card scroll-x"><table class="table"><thead><tr><th>শ্রেণি</th><th>পরীক্ষার্থী</th><th>উত্তীর্ণ</th><th>পাসের হার</th><th>জিপিএ ৫</th><th>গড় জিপিএ</th></tr></thead><tbody>${d.classes.map(c => `<tr><td class="font-semibold">${esc(c.name)}</td><td>${bnNum(c.n)}</td><td>${bnNum(c.passed)}</td><td>${bnNum(c.rate)}%</td><td>${bnNum(c.top)}</td><td>${c.avgGpa === null ? '—' : gpaFmt(c.avgGpa)}</td></tr>`).join('')}</tbody></table></div>`;
    const has = k => d.rows.some(r => r[k] !== undefined);
    return `<div class="card scroll-x"><table class="table"><thead><tr>${ui.kind === 'merit' ? '<th>ক্রম</th><th>শ্রেণি</th>' : ''}<th>রোল</th>${has('id') ? '<th>আইডি</th>' : ''}${has('name') ? '<th>নাম</th>' : ''}<th>শাখা</th>${has('total') ? '<th>মোট</th>' : ''}<th>জিপিএ / গ্রেড</th><th>ফলাফল</th></tr></thead><tbody>
      ${d.rows.map(r => `<tr>${ui.kind === 'merit' ? `<td class="font-bold">${bnNum(r.rank)}</td><td>${esc(r.className || '')}</td>` : ''}<td>${bnNum(r.roll ?? '')}</td>${has('id') ? `<td class="font-mono">${esc(r.id || '')}</td>` : ''}${has('name') ? `<td>${esc(r.name || '')}</td>` : ''}<td>${esc(r.section || '')}</td>${has('total') ? `<td>${bnNum(r.total ?? '')}</td>` : ''}<td class="font-semibold">${g(r)}</td><td>${res(r)}</td></tr>`).join('') || `<tr><td colspan="9">${emptyState('কোনো তথ্য নেই।')}</td></tr>`}</tbody></table></div>`;
  },
};
(() => {
  const P = App.portals.public; if (!P || P.pages.some(p => p.id === 'result-board')) return;
  // the board lives inside the public result page (/results) as tabs; the old address opens that page
  App.addPage('public', { id: 'result-board', label: 'ফলাফল বোর্ড', icon: 'award', hidden: true, render: q => { const ui = PubResult.ui(); if (!RBD.views().some(v => v[0] === ui.view)) ui.view = RBD.views()[0]?.[0] || 'search'; App.route.page = 'results'; App.replaceUrl(App.href('public', 'results')); return P.pages.find(p => p.id === 'results').render(q); }, mount: q => P.pages.find(p => p.id === 'results').mount?.(q) }, 'results');
  const pr = P.pages.find(p => p.id === 'results'); if (!pr || typeof PubResult === 'undefined') return;
  const r0 = PubResult.render.bind(PubResult), m0 = pr.mount;
  /* One public result form: "ফলাফলের ধরন" — একক (search by the configured identifiers) · শ্রেণিভিত্তিক (class / section
     list) · সমগ্র (school summary and statistics) · মেধাতালিকা (merit list); only the enabled types are offered and the
     fields below the type follow it. */
  PubResult.TYPES = [['search', 'একক'], ['list', 'শ্রেণিভিত্তিক'], ['summary', 'সমগ্র'], ['merit', 'মেধাতালিকা']];
  PubResult.typeSel = function (types, cur, span) {
    if (types.length < 2) return '';
    return `<div class="${span}"><label class="label" for="pr-kind">ফলাফলের ধরন</label><select id="pr-kind" class="select" onchange="PubResult.ui().view=this.value;App.refresh()">${types.map(([k, l]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
  };
  PubResult.render = function () {
    const cfg = ResultCfg.get(), ui = this.ui();
    if (DB.s.featureFlags.publicResults === false || !this.exams().length || !DB.s.classes.length) return r0();
    const hasStats = cfg.stats.on && Object.keys(cfg.statsData).some(id => DB.exam(id)?.published), board = RBD.views().map(v => v[0]);
    const types = this.TYPES.filter(([k]) => k === 'search' || board.includes(k) || (k === 'summary' && hasStats));
    if (ui.view === 'stats') ui.view = 'summary';
    if (!types.some(t => t[0] === ui.view)) ui.view = 'search';
    const asked = ResultCfg.FIELDS.filter(([k]) => cfg.fields[k] !== 'off').map(([, l]) => l);
    let body;
    if (ui.view === 'search') body = this.form(cfg).replace('novalidate>', `novalidate>${this.typeSel(types, ui.view, 'sm:col-span-2')}`) + this.outcome(cfg);
    else if (ui.view === 'summary' && !board.includes('summary')) body = `<div class="card p-4 grid sm:grid-cols-3 gap-3 items-end">${this.typeSel(types, ui.view, '')}</div>` + this.statsHtml(cfg);
    else body = RBD.embed(ui.view).replace('<div class="card p-4 grid sm:grid-cols-3 gap-3 items-end">', `<div class="card p-4 grid sm:grid-cols-3 gap-3 items-end">${this.typeSel(types, ui.view, '')}`) + (ui.view === 'summary' && hasStats ? `<div class="mt-5">${this.statsHtml(cfg)}</div>` : '');
    return Pub.wrap(Pub.hero('ফলাফল ও নম্বরপত্র', ui.view === 'search' ? `${asked.join(', ')} দিয়ে অনুসন্ধান করুন।` : '') + `<section class="max-w-5xl mx-auto px-4 py-10 space-y-5">${body}</section>`);
  };
  pr.render = q => PubResult.render(q);
  pr.mount = q => { const v = PubResult.ui().view; if (RBD.views().some(x => x[0] === v)) RBD.mount(); else m0?.(q); };
})();
