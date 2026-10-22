/* ==========================================================================
   CLASS ROUTINE — period plans per shift (optionally per weekday) with breaks,
   weekly off days per class / shift, supplementary classes (recurring or dated),
   several subjects / teachers in one period, multi-period (merged) classes,
   clash warnings (never blocking) and a printable weekly routine.

   Slot record (DB.s.routine / DB.routineSet(session)):
     { id, classId, section, day, period, span?, subjectIds?[], teacherIds?[], room?, supp?, date? }
   Old records carry only subjectId / teacherId; every reader goes through RT.subs / RT.tchs,
   and saved slots keep subjectId / teacherId = the first entry so older readers still work.
   Period plans: DB.s.school.routineCfg = { shifts: { <shiftId>: { periods, breaks, days: { Sun: { periods, breaks } } } },
                                            offDays: { 'c:<classId>': [0..6], 's:<shiftId>': [0..6] } }
   ========================================================================== */

const RT = {
  D7: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  IDX: { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 },
  DEF_BREAKS: [{ after: 3, label: 'টিফিন', start: '10:25', end: '10:50' }],

  /* ---------- configuration ---------- */
  /* ---------- routine versions ----------
     The live DB.s.routine + school.routineCfg are the first version, "নিয়মিত রুটিন" (id 'BASE'), so existing data needs no copy.
     DB.s.routineVersions = { baseName, list: [{ id, name, classIds[] (empty = all), routine[], cfg, createdAt, by }],
                              schedule: [{ id, versionId, from, to?, at, by }] }
     The version of a class on a date is the most recently made activation whose dates cover it (and whose version
     includes the class); when its end date passes, the one made before it applies again. Nothing covers → BASE. */
  _v: undefined,
  as(v, fn) { const p = this._v; this._v = v || null; try { return fn(); } finally { this._v = p; } },
  vstore() { const s = DB.s.routineVersions; return s && typeof s === 'object' && !Array.isArray(s) ? s : null; },
  vstoreW() { if (!this.vstore()) DB.s.routineVersions = { baseName: 'নিয়মিত রুটিন', list: [], schedule: [] }; const s = DB.s.routineVersions; s.list = s.list || []; s.schedule = s.schedule || []; return s; },
  vers() { return this.vstore()?.list || []; },
  ver(id) { return id && id !== 'BASE' ? this.vers().find(v => v.id === id) || null : null; },
  verName(id) { return id && id !== 'BASE' ? (this.ver(id)?.name || '') : (this.vstore()?.baseName || 'নিয়মিত রুটিন'); },
  routineOf(v) { return v ? (Array.isArray(v.routine) ? v.routine : []) : (DB.s.routine || []); },
  onBuilder() { return App.route?.portal === 'principal' && App.route?.page === 'routine' && (!App.ui.rtSes || App.ui.rtSes === DB.session()); },
  builderVer() { return this.ver(App.ui.rtVer); },
  /** Version whose times / off days the editor reads and writes (the builder's selection). */
  ctxV() { return this._v !== undefined ? this._v : App.route?.portal === 'principal' && (!App.ui.rtSes || App.ui.rtSes === DB.session()) ? this.builderVer() : null; },
  /** Version running for a class on a date (null = নিয়মিত রুটিন). */
  verFor(classId, iso) {
    const st = this.vstore(); if (!st || !(st.schedule || []).length) return null;
    const ck = `v|${classId}|${iso}`; if (ck in this._cache) return this._cache[ck];
    const e = st.schedule.filter(a => a.from <= iso && (!a.to || iso <= a.to) && (a.versionId === 'BASE' || (v => v && (!v.classIds?.length || v.classIds.includes(classId)))(this.ver(a.versionId))))
      .sort((a, b) => String(a.at || '').localeCompare(String(b.at || ''))).pop();
    return (this._cache[ck] = e ? this.ver(e.versionId) : null);
  },
  verIdFor(classId, iso) { return this.verFor(classId, iso)?.id || 'BASE'; },
  /** Slot list the builder edits: the selected version (current session) or the session's routine. */
  editSet() { const ses = App.ui.rtSes || DB.session(), v = ses === DB.session() ? this.builderVer() : null; return v ? this.routineOf(v) : DB.routineSet(ses); },
  /** Copy the selected version (routine, times, off days, classes) into a new one and open it. */
  verNew() {
    const src = this.builderVer(), st = this.vstoreW(), copy = x => JSON.parse(JSON.stringify(x || {}));
    const routine = this.routineOf(src).map(r => ({ ...copy(r), id: DB.id('RT') }));
    const v = { id: DB.id('RV'), name: `নতুন সংস্করণ ${bnNum(st.list.length + 1)}`, classIds: (src?.classIds || []).slice(), routine, cfg: copy(src ? src.cfg : DB.s.school.routineCfg), createdAt: new Date().toISOString(), by: App.session.userId };
    st.list.push(v); this._cache = {};
    DB.audit('ROUTINE_VERSION_ADD', 'routine', `${v.name} ← ${this.verName(src?.id)} (${routine.length}টি পিরিয়ড)`); DB.save();
    App.ui.rtVer = v.id; App.ui.rtAct = null; toast('নতুন সংস্করণ তৈরি হয়েছে।', 'success'); App.refresh();
    setTimeout(() => { const i = $('#rv-name'); if (i) { i.focus(); i.select(); } }, 50);
  },
  verRename(id, name) {
    const cur = this.verName(id); name = String(name || '').trim(); if (!name || name === cur) return App.refresh();
    const st = this.vstoreW(); if (id === 'BASE') st.baseName = name; else { const v = this.ver(id); if (!v) return; v.name = name; }
    DB.audit('ROUTINE_VERSION_RENAME', 'routine', `${cur} → ${name}`); DB.save(); App.refresh();
  },
  verNote(id, note) {
    const st = this.vstoreW(); note = String(note || '').trim();
    if (id === 'BASE') st.baseNote = note; else { const v = this.ver(id); if (!v) return; v.note = note; }
    DB.save();
  },
  verSched(id) { const today = U.today(); return (this.vstore()?.schedule || []).filter(a => a.versionId === id && (!a.to || a.to >= today)).sort((a, b) => a.from.localeCompare(b.from)); },
  /** চালু: activate the version from / until the dates in the toolbar. */
  verOn(id) {
    const d = App.ui.rtAct?.id === id ? App.ui.rtAct : {}, from = d.from || U.today(), to = d.to || '';
    if (to && to < from) return toast('শেষ তারিখ শুরুর পরে দিন।', 'error');
    const st = this.vstoreW(), note = id === 'BASE' ? st.baseNote : this.ver(id)?.note;
    st.schedule.push({ id: DB.id('RA'), versionId: id, from, ...(to ? { to } : {}), ...(note ? { note } : {}), at: new Date().toISOString(), by: App.session.userId }); this._cache = {};
    DB.audit('ROUTINE_VERSION_SWITCH', 'routine', `${this.verName(id)} চালু: ${from}${to ? ' – ' + to : ' থেকে'}${note ? ' · ' + note : ''}`); DB.save();
    App.ui.rtAct = null; toast(from <= U.today() ? 'সংস্করণ চালু হয়েছে।' : `${U.fmtDate(from)} থেকে চালু হবে।`, 'success'); App.refresh();
  },
  /** বন্ধ: end the version's running activation today and drop its upcoming ones (the previous version applies again). */
  verOff(id) {
    const st = this.vstoreW(), today = U.today(), yest = U.iso(U.addDays(U.d(today), -1)), mine = this.verSched(id);
    if (!mine.length) return;
    st.schedule = st.schedule.flatMap(a => !mine.includes(a) ? [a] : a.from > yest ? [] : [{ ...a, to: yest }]); this._cache = {};
    DB.audit('ROUTINE_VERSION_OFF', 'routine', `${this.verName(id)} বন্ধ`); DB.save(); toast('সংস্করণ বন্ধ হয়েছে।', 'success'); App.refresh();
  },
  verDel(id) {
    const v = this.ver(id); if (!v) return;
    if (!confirm(`"${v.name}" সংস্করণ মুছে ফেলবেন? এর চালুর তারিখগুলোও বাতিল হবে।`)) return;
    const st = this.vstoreW(); st.list = st.list.filter(x => x.id !== id); st.schedule = st.schedule.filter(a => a.versionId !== id); this._cache = {};
    if (App.ui.rtVer === id) App.ui.rtVer = 'BASE';
    DB.audit('ROUTINE_VERSION_DELETE', 'routine', v.name); DB.save(); App.refresh();
  },
  verUnschedule(aid) {
    const st = this.vstoreW(), a = st.schedule.find(x => x.id === aid); if (!a || !confirm('এই চালুর সময়সূচি বাতিল করবেন?')) return;
    st.schedule = st.schedule.filter(x => x.id !== aid); this._cache = {};
    DB.audit('ROUTINE_VERSION_UNSCHEDULE', 'routine', `${this.verName(a.versionId)}: ${a.from}${a.to ? ' – ' + a.to : ''}`); DB.save(); App.refresh();
  },
  /** Toolbar above the grid: class, times & off days, date view; then the version row. */
  toolbar(cls, ses) {
    const curSes = ses === DB.session(), cur = App.ui.rtVer && (App.ui.rtVer === 'BASE' || this.ver(App.ui.rtVer)) ? App.ui.rtVer : 'BASE', today = U.today(), live = this.verIdFor(cls, today);
    const row1 = `<div class="flex flex-wrap items-end gap-2">
      <div><label class="label" for="rt-cls">শ্রেণি</label><select class="select !w-auto" id="rt-cls" onchange="App.ui.rtCls=this.value;App.refresh()">${classOptions(cls)}</select></div>
      <button class="btn ${App.ui.rtCfg ? 'btn-primary' : 'btn-ghost'}" onclick="RT.cfgOpen('${cls}')">${icon('clock')} সময় ও ছুটির দিন</button>
      ${curSes ? `<div><label class="label" for="rt-date">নির্দিষ্ট তারিখ দেখুন</label><input type="date" class="input !w-auto" id="rt-date" value="${esc(App.ui.rtDate || '')}" onchange="App.ui.rtDate=this.value;App.refresh()"></div>` : ''}</div>`;
    if (!curSes) return `<div class="card p-3 mb-4">${row1}</div>`;
    const opts = [['BASE', this.verName('BASE')], ...this.vers().map(v => [v.id, v.name + (v.classIds?.length ? ` (${bnNum(v.classIds.length)}টি শ্রেণি)` : '')])];
    const sched = this.verSched(cur), act = App.ui.rtAct?.id === cur ? App.ui.rtAct : { id: cur, from: sched.find(a => a.from > today)?.from || today, to: '' };
    const note = cur === 'BASE' ? this.vstore()?.baseNote : this.ver(cur)?.note, on = live === cur;
    const allSched = (this.vstore()?.schedule || []).filter(a => !a.to || a.to >= today).sort((a, b) => a.from.localeCompare(b.from));
    const setAct = k => `App.ui.rtAct=Object.assign(App.ui.rtAct&&App.ui.rtAct.id==='${cur}'?App.ui.rtAct:{id:'${cur}',from:'${act.from}',to:'${act.to}'},{${k}:this.value})`;
    const row2 = `<div class="flex flex-wrap items-end gap-2 pt-3 border-t border-slate-100">
      <div><label class="label" for="rv-sel">সংস্করণ</label><select class="select !w-auto" id="rv-sel" onchange="App.ui.rtVer=this.value;App.ui.rtAct=null;App.refresh()">${opts.map(([id, n]) => `<option value="${id}" ${id === cur ? 'selected' : ''}>${esc(n)}${id === live ? ' — চালু' : ''}</option>`).join('')}</select></div>
      <div><label class="label" for="rv-name">নাম</label><input class="input !w-44" id="rv-name" maxlength="60" value="${esc(this.verName(cur))}" onchange="RT.verRename('${cur}',this.value)"></div>
      <div><label class="label" for="rv-note">কারণ</label><input class="input !w-44" id="rv-note" maxlength="120" value="${esc(note || '')}" onchange="RT.verNote('${cur}',this.value)"></div>
      <div><label class="label" for="rv-from">চালু হবে</label><input type="date" class="input !w-auto" id="rv-from" value="${esc(act.from)}" onchange="${setAct('from')}"></div>
      <div><label class="label" for="rv-to">পর্যন্ত</label><input type="date" class="input !w-auto" id="rv-to" value="${esc(act.to || '')}" onchange="${setAct('to')}"></div>
      <button class="btn btn-primary" onclick="RT.verOn('${cur}')">${icon('power')} চালু</button>
      ${cur !== 'BASE' && sched.length ? `<button class="btn btn-ghost" onclick="RT.verOff('${cur}')">${icon('power-off')} বন্ধ</button>` : ''}
      <span class="rounded px-2 py-2 ${on ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}">${on ? 'আজ চালু' : 'প্রিভিউ'}</span>
      <div class="flex gap-2 ml-auto"><button class="btn btn-ghost" onclick="RT.verNew()">${icon('copy-plus')} নতুন সংস্করণ তৈরি করুন</button>${cur !== 'BASE' ? `<button class="btn btn-ghost text-red-600" title="মুছুন" aria-label="সংস্করণ মুছুন" onclick="RT.verDel('${cur}')">${icon('trash-2')}</button>` : ''}</div></div>
      ${allSched.length ? `<details class="mt-2"><summary class="cursor-pointer text-slate-600">চালুর সময়সূচি (${bnNum(allSched.length)})</summary><div class="divide-y divide-slate-100 mt-1">${allSched.map(a => `<div class="py-1.5 flex flex-wrap items-center gap-2"><span class="rounded px-2 ${a.from <= today ? 'bg-emerald-50 text-emerald-800' : 'bg-blue-50 text-blue-800'}">${a.from <= today ? 'চলমান' : 'আসন্ন'}</span><b>${esc(this.verName(a.versionId))}</b><span>${U.fmtDate(a.from)}${a.to ? ' – ' + U.fmtDate(a.to) : ' থেকে'}</span>${a.note ? `<span class="text-slate-600">${esc(a.note)}</span>` : ''}<button class="btn btn-ghost btn-sm ml-auto" title="বাতিল" aria-label="বাতিল" onclick="RT.verUnschedule('${a.id}')">${icon('x')}</button></div>`).join('')}</div></details>` : ''}`;
    return `<div class="card p-3 mb-4 space-y-3">${row1}${row2}</div>`;
  },
  cfgR() { const v = this.ctxV(); return v ? (v.cfg || {}) : ((DB.s.school && DB.s.school.routineCfg) || {}); },
  cfgW() { const v = this.ctxV(), s = DB.s.school; const c = v ? (v.cfg || (v.cfg = {})) : (s.routineCfg || (s.routineCfg = {})); c.default = c.default || {}; c.shifts = c.shifts || {}; c.classes = c.classes || {}; c.offDays = c.offDays || {}; return c; },
  shifts() { return (DB.s.school?.shifts || []).filter(x => x && x.id); },
  /** Shifts matter only when the institution has more than one. */
  multi() { return this.shifts().length > 1; },
  shiftOf(classId) { const c = DB.cls(classId), l = this.shifts(); return this.multi() ? (l.some(x => x.id === c?.shift) ? c.shift : l[0].id) : ''; },
  shiftName(id) { return this.shifts().find(x => x.id === id)?.name || ''; },
  /** Timetable layers: class override → shift → default (each { periods, breaks, days: { Sun: {…} } }). */
  layer(scope, key) { const c = this.cfgR(); return scope === 'class' ? c.classes?.[key] : scope === 'shift' ? c.shifts?.[key] : c.default; },
  chainFrom(scope, key, classId) {
    const out = [];
    if (scope === 'class') { out.push(this.layer('class', key)); const sh = this.shiftOf(key); if (sh) out.push(this.layer('shift', sh)); }
    if (scope === 'shift' && key) out.push(this.layer('shift', key));
    out.push(this.layer('default'));
    return out.filter(Boolean);
  },
  resolve(chain, day) {
    const ok = p => p && Array.isArray(p.periods) && p.periods.length;
    for (const L of chain) { if (day && ok(L.days?.[day])) return this.clean(L.days[day]); if (ok(L)) return this.clean(L); }
    return this.basePlan();
  },
  basePlan() { return { periods: PERIODS.map(p => ({ ...p })), breaks: this.DEF_BREAKS.map(b => ({ ...b })) }; },
  clean(p) {
    const periods = (p.periods || []).map((x, i) => ({ n: i + 1, start: x.start || '', end: x.end || '' }));
    const breaks = (p.breaks || []).filter(b => +b.after >= 1 && +b.after < periods.length).map(b => ({ after: +b.after, label: String(b.label || '').trim() || 'বিরতি', start: b.start || '', end: b.end || '' })).sort((a, b) => a.after - b.after);
    return { periods, breaks };
  },
  /** Period plan of a class on a weekday (null = its usual week): class → shift → default → built-in. */
  plan(classId, day, iso) {
    // dated: the version running that day; undated: the builder's version, else today's
    if (this._v === undefined) return this.as(iso ? this.verFor(classId, iso) : this.onBuilder() ? this.builderVer() : this.verFor(classId, U.today()), () => this.plan(classId, day, iso));
    const d =iso && this.dayOv(classId, iso);
    if (d && !d.dayCancel && d.dayPlan?.periods?.length) return this.clean(d.dayPlan);
    return this.resolve(this.chainFrom('class', classId), day);
  },
  /** Does this weekday differ from the class's usual timetable? */
  ownDay(classId, day) { return JSON.stringify(this.plan(classId, day)) !== JSON.stringify(this.plan(classId, null)); },
  time(classId, day, n) { return this.plan(classId, day).periods.find(p => p.n === +n) || { n: +n, start: '', end: '' }; },
  offKeys(scope, key) { const k = []; if (scope === 'class') { k.push('c:' + key); const sh = this.shiftOf(key); if (sh) k.push('s:' + sh); } if (scope === 'shift' && key) k.push('s:' + key); k.push('d'); return k; },
  offFor(scope, key) {
    const o = this.cfgR().offDays || {}, k = this.offKeys(scope, key).find(x => Array.isArray(o[x]));
    return k ? o[k] : ((DB.s.calendar && DB.s.calendar.weekends) || [5]);
  },
  offDays(classId) {
    if (this._v === undefined && !this.onBuilder()) return this.as(this.verFor(classId, U.today()), () => this.offFor('class', classId));
    return this.offFor('class', classId);
  },
  isOff(classId, day) { return this.offDays(classId).includes(this.IDX[day]); },

  /* ---------- slot readers (old and new records) ---------- */
  subs(r) { const a = Array.isArray(r?.subjectIds) ? r.subjectIds.filter(Boolean) : []; return a.length ? a : (r?.subjectId ? [r.subjectId] : []); },
  tchs(r) { const a = Array.isArray(r?.teacherIds) ? r.teacherIds.filter(Boolean) : []; return a.length ? a : (r?.teacherId ? [r.teacherId] : []); },
  hasT(r, tid) { return !!tid && this.tchs(r).includes(tid); },
  span(r) { return Math.max(1, Math.floor(+r?.span || 1)); },
  subName(r, sep = ' / ') { return this.subs(r).map(s => DB.subject(s)?.name || s).join(sep) || '—'; },
  tchName(r) { return this.tchs(r).map(t => DB.teacherName(t)).filter(Boolean).join(', '); },
  /** [{classId, subjectId}] of a slot (one per subject). */
  pairs(r) { return this.subs(r).map(subjectId => ({ classId: r.classId, subjectId })); },
  mins(t) { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : NaN; },
  addMin(t, n) { const m = this.mins(t); if (isNaN(m)) return ''; const v = Math.max(0, Math.min(1439, m + n)); return `${U.pad(Math.floor(v / 60))}:${U.pad(v % 60)}`; },
  range(r) {
    if (r._time?.start) return { ...r._time };
    const plan = this.plan(r.classId, r.day, r._iso), pl = plan.periods, a = pl.find(p => p.n === +r.period), b = pl.find(p => p.n === this.lastP(r)) || a;
    const into = r.intoBreak && plan.breaks.find(x => x.after === this.lastP(r));
    return { start: a?.start || '', end: (into && into.end) || b?.end || '' };
  },
  lastP(r) { return +r.period + this.span(r) - 1; },
  /** Breaks a multi-period slot passes: 'skip' keeps the break (the class continues after it), 'class' uses it as class time. */
  brkMode(r) { return r?.brk === 'class' ? 'class' : 'skip'; },
  breaksInside(classId, day, period, span) { return this.plan(classId, day).breaks.filter(b => b.after >= +period && b.after < +period + span - 1); },
  rangeText(r) { const x = this.range(r); return x.start ? `${U.bn(x.start)}–${U.bn(x.end || '')}` : ''; },
  periodText(r) { const s = this.span(r); return s > 1 ? `পিরিয়ড ${bnNum(r.period)}–${bnNum(+r.period + s - 1)}` : `পিরিয়ড ${bnNum(r.period)}`; },
  /** Slots that run on a weekday; dated slots only on their own date. */
  onDay(list, day, iso) { return (list || []).filter(r => r.day === day && (!r.date || (iso && r.date === iso)) && +r.period <= this.plan(r.classId, day).periods.length); },
  sortT(list) { return list.sort((a, b) => ((this.mins(this.range(a).start) || 9999) - (this.mins(this.range(b).start) || 9999)) || (a.period - b.period)); },
  /** A teacher's classes on a date (temporary changes and proxies applied; opt.noProxy leaves proxies out). */
  ofTeacher(tid, d, opt = {}) {
    const iso = U.iso(d), seen = new Set();
    // a combined class appears once (its slot exists in every class it merges)
    return this.sortT(DB.s.classes.flatMap(c => this.effective(c.id, iso, opt)).filter(r => { if (!this.hasT(r, tid)) return false; if (!r.combined) return true; const k = String(r.id).split(':')[0] + ':' + r.period; if (seen.has(k)) return false; seen.add(k); return true; }));
  },
  ofClass(classId, section, d) { return this.sortT(this.effective(classId, U.iso(d)).filter(r => !section || !r.section || r.section === section)); },
  /** Is the teacher already taking a class that overlaps `slot` on that date? */
  busy(tid, date, slot, ignore) { return this.ofTeacher(tid, date).some(r => (!ignore || r._base !== ignore) && this.overlap(r, { ...slot, day: U.dayName(date), _iso: date })); },

  /* ---------- temporary, date-ranged changes (সাময়িক পরিবর্তন) ----------
     DB.s.routineOverrides: { id, type, from, to, classIds[], periods[], reason, by, at, … }
       cancel  — the periods do not run
       change  — subjectIds / room / start–end for those dates
       swap    — periods [a, b] exchange places
       combine — classIds sit together in periods[] with teacherIds / subjectIds / room
       day     — dayCancel: no classes, or dayPlan: { periods, breaks } replaces the day's times
     Teacher replacement is the proxy desk's DB.s.proxies (one record per date × class × period, groupId links a range). */
  TYPES: { cancel: 'ক্লাস রহিত', teacher: 'শিক্ষক বদল', change: 'বিষয়-কক্ষ-সময় বদল', swap: 'অদলবদল', combine: 'একাধিক শ্রেণি', day: 'পুরো দিনের রুটিন বদল' },
  ovs() { return Array.isArray(DB.s.routineOverrides) ? DB.s.routineOverrides : []; },
  ovOn(o, classId, iso) { return iso >= o.from && iso <= (o.to || o.from) && (!o.classIds?.length || o.classIds.includes(classId)); },
  dayOv(classId, iso) { return this.ovs().filter(o => o.type === 'day' && this.ovOn(o, classId, iso)).pop() || null; },
  _cache: {},
  /** The routine as it runs on a date: weekly slots + that date's supplementary classes, then the temporary changes,
      then proxies. Cancelled slots are left out unless opt.all (they then carry `cancelled`). */
  effective(classId, iso, opt = {}) {
    const ver = this.verFor(classId, iso);
    if (this._v !== ver) return this.as(ver, () => this.effective(classId, iso, opt));
    const ck = `${classId}|${iso}|${opt.all ? 1 : 0}${opt.noProxy ? 1 : 0}`;
    if (this._cache[ck]) return this._cache[ck].map(s => ({ ...s }));
    const day = U.dayName(iso), dov = this.dayOv(classId, iso), pl = this.plan(classId, day, iso);
    let list = this.routineOf(ver).filter(r => r.classId === classId && r.day === day && (!r.date || r.date === iso) && +r.period <= pl.periods.length)
      .map(r => ({ ...r, date: undefined, _iso: iso, _base: r, _ov: dov && !dov.dayCancel ? [dov] : [] }));
    if (dov && dov.dayCancel) list.forEach(s => { s.cancelled = dov.reason || this.TYPES.day; s._ov = [dov]; });
    else this.ovs().filter(o => o.type !== 'day' && this.ovOn(o, classId, iso)).forEach(o => {
      const ps = (o.periods || []).map(Number), hit = s => !s.cancelled && ps.some(p => p >= +s.period && p <= this.lastP(s));
      if (o.type === 'cancel') list.forEach(s => { if (hit(s)) { s.cancelled = o.reason || this.TYPES.cancel; s._ov.push(o); } });
      else if (o.type === 'change') list.forEach(s => {
        if (!hit(s)) return;
        if (o.subjectIds?.length) { s.subjectIds = o.subjectIds.slice(); s.subjectId = o.subjectIds[0]; }
        if (o.room) s.room = o.room;
        if (o.start && o.end) s._time = { start: o.start, end: o.end };
        s._ov.push(o);
      });
      else if (o.type === 'swap' && ps.length === 2) {
        const a = list.find(s => +s.period === ps[0] && !s.cancelled), b = list.find(s => +s.period === ps[1] && !s.cancelled);
        if (a) { a.period = ps[1]; a.span = 1; a._ov.push(o); } if (b) { b.period = ps[0]; b.span = 1; b._ov.push(o); }
      } else if (o.type === 'combine') ps.forEach(p => {
        list = list.filter(s => !(p >= +s.period && p <= this.lastP(s)));
        list.push({ id: `${o.id}:${classId}:${p}`, classId, section: '', day, period: p, span: 1, subjectIds: (o.subjectIds || []).slice(), subjectId: o.subjectIds?.[0] || '', teacherIds: (o.teacherIds || []).slice(), teacherId: o.teacherIds?.[0] || '', room: o.room || '', combined: (o.classIds || []).slice(), _iso: iso, _ov: [o] });
      });
    });
    if (!opt.noProxy && !(dov && dov.dayCancel)) (DB.s.proxies || []).filter(p => p.date === iso && p.classId === classId).forEach(p => {
      const s = list.find(x => !x.cancelled && +x.period === +p.period); if (!s) return;
      const ts = this.tchs(s), i = ts.indexOf(p.absentTeacherId);
      s.teacherIds = ts.map((t, k) => (k === (i < 0 ? 0 : i) ? p.proxyTeacherId : t)); s.teacherId = s.teacherIds[0];
      s._proxy = p; s._ov.push({ type: 'teacher', id: p.id, reason: p.reason || '' });
    });
    list = this.sortT(opt.all ? list : list.filter(s => !s.cancelled));
    this._cache[ck] = list;
    return list.map(s => ({ ...s }));
  },
  ovNote(r) {
    if (r.cancelled) return `রহিত — ${r.cancelled}`;
    return (r._ov || []).map(o => `${this.TYPES[o.type] || ''}${o.type === 'combine' && o.classIds?.length > 1 ? ` (${o.classIds.map(c => DB.className(c)).join(' + ')})` : ''}${o.reason ? ': ' + o.reason : ''}`).join('; ');
  },
  datesIn(from, to) { const out = []; for (let d = U.d(from), i = 0; U.iso(d) <= (to || from) && i < 62; d = U.addDays(d, 1), i++) out.push(U.iso(d)); return out; },
  /** Teacher / room clashes across the campus on one date (effective routine). */
  dateClashes(iso, campus) {
    const all = DB.classesIn(campus || DB.campusId()).flatMap(c => this.effective(c.id, iso)), out = [];
    all.forEach((a, i) => all.slice(i + 1).forEach(b => { if (a.classId !== b.classId && !(a.combined && b.combined && a.combined.includes(b.classId))) this.clashes(a, null, [b]).forEach(m => out.push(`${U.fmtDate(iso)} · ${m}`)); }));
    return [...new Set(out)];
  },

  /* ---------- clashes (warnings only) ---------- */
  overlap(a, b) {
    if (a.day !== b.day || (a.date && b.date && a.date !== b.date)) return false;
    const ra = this.range(a), rb = this.range(b), s1 = this.mins(ra.start), e1 = this.mins(ra.end), s2 = this.mins(rb.start), e2 = this.mins(rb.end);
    if (![s1, e1, s2, e2].some(isNaN)) return s1 < e2 && s2 < e1;
    return +a.period < +b.period + this.span(b) && +b.period < +a.period + this.span(a);
  },
  where(r) { return `${U.dayBn(r.day)}${r.date ? ' (' + U.fmtDate(r.date) + ')' : ''} ${this.periodText(r)}`; },
  clashes(slot, ignoreId, set) {
    const out = [], rm = String(slot.room || '').trim();
    (set || []).forEach(r => {
      if (r === slot || (ignoreId && r.id === ignoreId) || !this.overlap(r, slot)) return;
      if (r.classId === slot.classId && (r.section || '') === (slot.section || '')) {
        const absorbed = (r.date || '') === (slot.date || '') && +r.period > +slot.period;   // taken over by a multi-period slot on save
        if (!absorbed && (+r.period !== +slot.period || !!r.date !== !!slot.date)) out.push(`${this.where(r)}: ${DB.className(r.classId)}-এর আরেকটি ক্লাস (${this.subName(r)}) একই সময়ে পড়েছে`);
        return;
      }
      this.tchs(slot).filter(t => this.hasT(r, t)).forEach(t => out.push(`${this.where(r)}: ${DB.teacherName(t)} একই সময়ে ${DB.className(r.classId)}-এ পাঠদান করছেন`));
      if (rm && String(r.room || '').trim() === rm) out.push(`${this.where(r)}: কক্ষ ${U.bn(rm)} একই সময়ে ${DB.className(r.classId)}-এর জন্য বরাদ্দ`);
    });
    return out;
  },
  allClashes(set) {
    const list = [], ids = new Set(), byDay = {};
    (set || []).forEach(r => (byDay[r.day] = byDay[r.day] || []).push(r));
    Object.values(byDay).forEach(rows => rows.forEach((a, i) => rows.slice(i + 1).forEach(b => {
      const m = this.clashes(a, null, [b]);
      if (m.length) { ids.add(a.id); ids.add(b.id); m.forEach(msg => list.push({ r: a, msg })); }
    })));
    return { list, ids };
  },

  /* ---------- weekly grid ---------- */
  cols(classIds, days, iso) {
    const plans = [].concat(classIds).flatMap(c => days.map(d => this.plan(c, d, iso))), maxN = Math.max(1, ...plans.map(p => p.periods.length)), cols = [];
    for (let n = 1; n <= maxN; n++) { cols.push({ t: 'p', n }); if (plans.some(p => p.breaks.some(b => b.after === n))) cols.push({ t: 'b', after: n }); }
    return cols;
  },
  /** opts: {set, edit, bad:Set, print} */
  grid(classId, o = {}) {
    if (this._v === undefined) return this.as(this.onBuilder() ? this.builderVer() : this.verFor(classId, U.today()), () => this.grid(classId, o));
    const set = (o.set || this.routineOf(this._v)).filter(r => r.classId === classId), P = !!o.print;
    const days = this.D7.filter(d => !this.isOff(classId, d) || set.some(r => r.day === d && !r.date) || o.edit);
    if (!days.length) return '';
    const base = this.plan(classId, null), cols = this.cols(classId, days);
    const th = P ? 'style="border:.3mm solid #94a3b8;padding:.6mm .8mm;background:#f1f5f9;font-size:12pt;line-height:1.15"' : 'class="p-2 text-slate-600 font-semibold align-bottom"';
    const head = cols.map(c => {
      if (c.t === 'b') { const b = base.breaks.find(x => x.after === c.after); return `<th ${th}>${esc(b?.label || 'বিরতি')}${b?.start ? `<div style="font-weight:400">${U.bn(b.start)}–${U.bn(b.end)}</div>` : ''}</th>`; }
      const p = base.periods.find(x => x.n === c.n);
      return `<th ${th}>পিরিয়ড ${bnNum(c.n)}${p?.start ? `<div style="font-weight:400">${U.bn(p.start)}–${U.bn(p.end)}</div>` : ''}</th>`;
    }).join('');
    const rows = days.map(day => {
      const off = this.isOff(classId, day), out = this.rowCells(classId, day, cols, set, o);
      const label = `${U.dayBn(day, !P)}${off ? (P ? ' (ছুটি)' : `<div class="font-normal text-rose-600">ছুটি</div>`) : ''}`;
      return P ? `<tr><td style="border:.3mm solid #94a3b8;padding:.6mm .8mm;font-weight:700;font-size:12pt;line-height:1.15;${off ? 'background:#f1f5f9' : ''}">${label}</td>${out}</tr>`
        : `<tr class="${off ? 'bg-slate-50' : ''}"><td class="p-2 font-bold text-slate-600 align-top">${label}</td>${out}</tr>`;
    }).join('');
    return P ? `<table style="width:100%;border-collapse:collapse;text-align:center"><thead><tr><th ${th}>দিন</th>${head}</tr></thead><tbody>${rows}</tbody></table>`
      : `<table class="w-full rt-grid" style="min-width:${120 + cols.length * 130}px"><thead><tr><th class="p-2 text-slate-600 text-left w-20">দিন</th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
  },
  /** Cells of one class × day row. A multi-period slot is one merged cell; when it passes a break that stays a
      break ('skip'), it is split into linked parts around the break; with 'class' / intoBreak the break is covered. */
  rowCells(classId, day, cols, set, o = {}) {
    const P = !!o.print, C = !!o.compact, pl = this.plan(classId, day, o.iso), off = this.isOff(classId, day), own = this.ownDay(classId, day);
    const rows = set.filter(r => r.classId === classId && !r.date && r.day === day);
    const bd = 'border:.3mm solid #94a3b8;', pf = 'font-size:12pt;line-height:1.15;';
    const brkCell = (c, linked) => {
      const b = pl.breaks.find(x => x.after === c.after);
      if (P) return `<td style="${bd}background:#fef9c3;text-align:center;${pf}${linked ? 'border-top:.8mm solid #6366f1;border-bottom:.8mm solid #6366f1;' : ''}">${b ? esc(b.label) : ''}${linked ? '<div>⟷</div>' : ''}</td>`;
      return `<td class="p-1 align-middle">${b ? `<div class="rounded-lg bg-amber-50 text-amber-800 text-center px-1 py-3 font-semibold ${linked ? 'border-y-4 border-indigo-400' : ''}" title="${esc(b.label)}${b.start ? ' ' + U.bn(b.start) + '–' + U.bn(b.end) : ''}">${icon('coffee', 'w-4 h-4 mx-auto')}<div>${esc(b.label)}</div>${linked ? icon('link-2', 'w-4 h-4 mx-auto text-indigo-600') : ''}</div>` : ''}</td>`;
    };
    const slotCell = (r, n, span, f = {}) => {
      const cs = span > 1 ? ` colspan="${span}"` : '', t = own && r && !f.part ? this.rangeText(r) : '';
      const notes = r ? [r.cancelled || r._ov?.length ? this.ovNote(r) : '', f.absorbed?.length ? `${f.absorbed.map(b => b.label).join(', ')} সময়েও ক্লাস` : '', f.parts > 1 && !f.part ? `${f.brks.map(b => b.label).join(', ')}-এর পরে চলবে` : ''].filter(Boolean) : [];
      if (P) {
        if (r && f.part) return `<td${cs} style="${bd}padding:.6mm .8mm;${pf}border-left:.8mm solid #6366f1;${off ? 'background:#f1f5f9' : ''}">↳ <b>${esc(this.subName(r))}</b><div>চলমান</div></td>`;
        const link = r && f.parts > 1 ? 'border-right:.8mm solid #6366f1;' : '';
        return `<td${cs} style="${bd}padding:.6mm .8mm;vertical-align:middle;${pf}${link}${off ? 'background:#f1f5f9' : ''}">${r ? `<b>${esc(this.subName(r))}</b><div>${esc(this.tchName(r))}${r.room ? ` · ${esc(U.bn(r.room))}` : ''}</div>${!C && (t || r.supp) ? `<div>${t}${r.supp ? `${t ? ' · ' : ''}<i>সাপ্লিমেন্টারি</i>` : ''}</div>` : ''}${notes.length ? `<div><i>${esc(notes.join(' · '))}</i></div>` : ''}` : ''}</td>`;
      }
      const bad = r && o.bad && o.bad.has(r.id);
      let inner;
      if (r && f.part) inner = `<div class="flex items-center gap-1 text-indigo-700">${icon('corner-down-right', 'w-4 h-4')} <b>${esc(this.subName(r))}</b></div><div class="text-slate-500">চলমান</div>`;
      else inner = r ? `${this.subs(r).map(s => `<div class="font-bold leading-tight" style="color:${U.color(s)}">${esc(DB.subject(s)?.name || s)}</div>`).join('')}<div class="text-slate-600 leading-tight">${esc(this.tchName(r)) || '—'}</div>${r.room ? `<div class="text-slate-500">কক্ষ ${esc(U.bn(r.room))}</div>` : ''}${t ? `<div class="text-slate-500">${t}</div>` : ''}${notes.map((x, k) => `<div class="${k === 0 && (r.cancelled || r._ov?.length) ? 'text-amber-800 no-underline' : 'text-indigo-700'}">${esc(x)}</div>`).join('')}${r.supp ? '<div><span class="rounded px-1.5 bg-violet-100 text-violet-800">সাপ্লিমেন্টারি</span></div>' : ''}${bad ? `<div class="text-red-700">${icon('triangle-alert', 'w-4 h-4 inline')} সংঘাত</div>` : ''}`
        : (o.edit ? `<div class="py-2">${icon('plus', 'w-4 h-4 inline')} ${off ? 'সাপ্লিমেন্টারি' : 'খালি'}</div>` : '<div class="py-2 text-slate-300">—</div>');
      const link = r && f.parts > 1 ? (f.part ? ' border-l-4 border-l-indigo-400' : ' border-r-4 border-r-indigo-400') : '';
      const cls = `w-full h-full text-left rounded-lg p-2 border ${bad ? 'border-red-400 bg-red-50' : r?.cancelled ? 'border-red-300 bg-red-50 line-through decoration-red-400' : r?._ov?.length ? 'border-amber-400 bg-amber-50' : r ? (r.supp ? 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-white') : 'border-dashed border-slate-300 text-slate-400'}${link}${o.edit ? ' hover:border-brand-400' : ''}`;
      return `<td${cs} class="p-1 align-top">${o.edit ? `<button class="${cls}" onclick="${o.iso ? `RT.ovCell('${classId}',${r ? r.period : n},'${o.iso}')` : `Principal.editSlot('${classId}','${day}',${r ? r.period : n})`}">${inner}</button>` : `<div class="${cls}">${inner}</div>`}</td>`;
    };
    let out = '', ci = 0;
    const realBrk = x => x.t === 'b' && pl.breaks.some(b => b.after === x.after);
    while (ci < cols.length) {
      const c = cols[ci];
      if (c.t === 'b') { out += brkCell(c); ci++; continue; }
      if (c.n > pl.periods.length) { out += P ? `<td style="${bd}background:#f8fafc"></td>` : '<td class="p-1"></td>'; ci++; continue; }
      const r = rows.find(x => +x.period === c.n);
      if (!r) { out += slotCell(null, c.n, 1); ci++; continue; }
      const last = Math.min(this.lastP(r), pl.periods.length);
      let ei = cols.findIndex(x => x.t === 'p' && x.n === last);
      if (r.intoBreak && pl.breaks.some(b => b.after === last)) ei = Math.max(ei, cols.findIndex(x => x.t === 'b' && x.after === last));
      if (ei < ci) ei = ci;
      const inside = cols.slice(ci, ei + 1).filter(realBrk).map(x => pl.breaks.find(b => b.after === x.after));
      const keep = this.brkMode(r) === 'skip' ? cols.slice(ci, ei + 1).filter(x => realBrk(x) && x.after < last) : [];
      if (!keep.length) out += slotCell(r, c.n, ei - ci + 1, { absorbed: inside });
      else {
        const brks = keep.map(x => pl.breaks.find(b => b.after === x.after)), absorbed = inside.filter(b => !brks.includes(b));
        let seg = ci, part = 0;
        for (let k = ci; k <= ei; k++) if (keep.includes(cols[k])) { if (k > seg) out += slotCell(r, c.n, k - seg, { part: part++, parts: keep.length + 1, brks, absorbed: part === 1 ? absorbed : [] }); out += brkCell(cols[k], true); seg = k + 1; }
        if (seg <= ei) out += slotCell(r, c.n, ei - seg + 1, { part: part++, parts: keep.length + 1, brks });
      }
      ci = ei + 1;
    }
    return out;
  },
  /** Fit a block of estimated natural size (mm) into w × h mm by scaling it down. */
  fit(html, natW, natH, w, h) { const s = Math.min(1, w / natW, h / natH); return s >= 1 ? html : `<div style="width:${(w / s).toFixed(1)}mm;transform:scale(${s.toFixed(3)});transform-origin:top left">${html}</div>`; },
  sheetHead(title, line) {
    const s = DB.s.school || {};
    return `<div style="display:flex;align-items:center;gap:4mm;border-bottom:.5mm solid var(--brand);padding-bottom:2mm;margin-bottom:2.5mm">${Print.logo(11)}<div style="flex:1;text-align:center"><div style="font-size:16pt;font-weight:700;color:var(--brand-ink)">${esc(s.nameBn || s.name || '')}</div><div style="font-size:12pt;font-weight:700">${title}</div></div><div style="width:11mm"></div></div>${line ? `<div style="display:flex;justify-content:space-between;gap:4mm;font-size:12pt;margin-bottom:2mm">${line}</div>` : ''}`;
  },
  setOf(ses) { return ses && ses !== DB.session() ? DB.routineSet(ses) : DB.s.routine; },
  printClasses(campus) { return DB.classesIn(campus || DB.campusId()).slice().sort((a, b) => (a.grade || 0) - (b.grade || 0)); },
  /** All classes on one sheet: rows = day × class (layout 'day') or class × day (layout 'class'), columns = periods and breaks. */
  masterSheet(ses, campus, layout = 'day', paper = 'A4', vid) {
    if (vid && this._v === undefined) return this.as(this.ver(vid), () => this.masterSheet(ses, campus, layout, paper, vid));
    const set = vid ? this.routineOf(this._v) : this.setOf(ses), classes = this.printClasses(campus).map(c => c.id);
    if (!classes.length) return null;
    const days = this.D7.filter(d => classes.some(c => !this.isOff(c, d) || set.some(r => r.classId === c && r.day === d && !r.date)));
    const cols = this.cols(classes, days), base = this.plan(classes[0], null), o = { print: true, compact: true };
    const bd = 'border:.3mm solid #94a3b8;padding:.6mm .8mm;font-size:12pt;line-height:1.15;';
    const head = `<tr><th style="${bd}background:#f1f5f9">${layout === 'class' ? 'শ্রেণি' : 'দিন'}</th><th style="${bd}background:#f1f5f9">${layout === 'class' ? 'দিন' : 'শ্রেণি'}</th>${cols.map(c => { if (c.t === 'b') { const b = base.breaks.find(x => x.after === c.after); return `<th style="${bd}background:#fef9c3">${esc(b?.label || 'বিরতি')}</th>`; } const p = base.periods.find(x => x.n === c.n); return `<th style="${bd}background:#f1f5f9">পিরিয়ড ${bnNum(c.n)}${p?.start ? `<div style="font-weight:400">${U.bn(p.start)}–${U.bn(p.end)}</div>` : ''}</th>`; }).join('')}</tr>`;
    const outer = layout === 'class' ? classes : days, inner = layout === 'class' ? days : classes;
    let body = '', n = 0;
    outer.forEach(a => {
      const list = inner.filter(b => { const [c, d] = layout === 'class' ? [a, b] : [b, a]; return !this.isOff(c, d) || set.some(r => r.classId === c && r.day === d && !r.date); });
      list.forEach((b, i) => {
        const [c, d] = layout === 'class' ? [a, b] : [b, a]; n++;
        body += `<tr>${i === 0 ? `<td rowspan="${list.length}" style="${bd}font-weight:700;background:#f8fafc">${layout === 'class' ? esc(DB.className(c)) : U.dayBn(d)}</td>` : ''}<td style="${bd}font-weight:700">${layout === 'class' ? U.dayBn(d, true) : esc(DB.className(c))}</td>${this.rowCells(c, d, cols, set, o)}</tr>`;
      });
    });
    const [W, H] = Print.dims({ paper, orientation: 'landscape' }), pad = 8, availW = W - 2 * pad, availH = H - 2 * pad - 22;
    const table = `<table style="width:100%;border-collapse:collapse;text-align:center">${head}${body}</table>`;
    return `${Print.sheet({ paper, orientation: 'landscape' }, '', `padding:${pad}mm;box-sizing:border-box;overflow:hidden;position:relative`)}${this.sheetHead(`সমন্বিত ক্লাস রুটিন${vid ? ' — ' + esc(this.verName(vid)) : ''}`,`<b>${multiCampus() ? esc(DB.campus(campus || DB.campusId())?.name || '') : ''}</b><span>শিক্ষাবর্ষ ${esc(U.bn(ses || DB.session()))}</span>`)}
      ${this.fit(table, 50 + cols.length * 32, 16 + n * 13, availW, availH)}</div>`;
  },
  /* ---------- one date: effective routine of every class ---------- */
  dateTable(iso, campus, P) {
    const classes = this.printClasses(campus).map(c => c.id), day = U.dayName(iso);
    if (!classes.length) return '';
    const cols = this.cols(classes, [day], iso), pl0 = this.plan(classes[0], day, iso);
    const th = P ? 'style="border:.3mm solid #94a3b8;padding:.6mm .8mm;background:#f1f5f9;font-size:12pt"' : 'class="p-2 text-slate-600"';
    const head = cols.map(c => { if (c.t === 'b') return `<th ${th}>${esc(pl0.breaks.find(b => b.after === c.after)?.label || 'বিরতি')}</th>`; const p = pl0.periods.find(x => x.n === c.n); return `<th ${th}>পিরিয়ড ${bnNum(c.n)}${p?.start ? `<div style="font-weight:400">${U.bn(p.start)}–${U.bn(p.end)}</div>` : ''}</th>`; }).join('');
    const rows = classes.map(c => {
      const dov = this.dayOv(c, iso), lab = `${esc(DB.className(c))}${dov ? `<div style="font-weight:400">${dov.dayCancel ? 'সব ক্লাস রহিত' : 'ভিন্ন সময়সূচি'}${dov.reason ? ': ' + esc(dov.reason) : ''}</div>` : ''}`;
      return `<tr><td ${P ? 'style="border:.3mm solid #94a3b8;padding:.6mm .8mm;font-weight:700;font-size:12pt"' : 'class="p-2 font-bold align-top whitespace-nowrap"'}>${lab}</td>${this.rowCells(c, day, cols, this.effective(c, iso, { all: true }), { iso, print: P, edit: !P })}</tr>`;
    }).join('');
    return `<table class="${P ? '' : 'w-full'}" style="${P ? 'width:100%;border-collapse:collapse;text-align:center' : `min-width:${160 + cols.length * 130}px`}"><thead><tr><th ${th}>শ্রেণি</th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
  },
  dateView(iso) {
    const cl = this.dateClashes(iso);
    return `<div class="card mb-4"><div class="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2"><b>${U.dayBn(U.dayName(iso))} ${U.fmtDate(iso)} — কার্যকর রুটিন</b><div class="ml-auto flex flex-wrap gap-2"><button class="btn btn-ghost btn-sm" onclick="RT.ovDay('${iso}')">${icon('calendar-x')} এই দিনের সব ক্লাস</button><button class="btn btn-ghost btn-sm" onclick="Print.show('routineDate','${iso}','${DB.campusId()}')">${icon('printer')} মুদ্রণ</button><button class="btn btn-ghost btn-sm" aria-label="বন্ধ করুন" title="বন্ধ করুন" onclick="App.ui.rtDate='';App.refresh()">${icon('x')}</button></div></div>
      ${cl.length ? `<details class="px-4 py-2 bg-amber-50 text-amber-900"><summary class="cursor-pointer font-semibold">${icon('triangle-alert', 'w-4 h-4 inline')} ${bnNum(cl.length)}টি সংঘাতের সতর্কতা</summary><ul class="list-disc ml-5 mt-1">${cl.slice(0, 30).map(m => `<li>${esc(m)}</li>`).join('')}</ul></details>` : ''}
      <div class="scroll-x p-2">${this.dateTable(iso)}</div></div>`;
  },
  dateSheet(iso, campus) {
    const classes = this.printClasses(campus);
    if (!classes.length) return null;
    const nCols = this.cols(classes.map(c => c.id), [U.dayName(iso)], iso).length;
    return `${Print.sheet({ orientation: 'landscape' }, '', 'padding:8mm;box-sizing:border-box;overflow:hidden;position:relative')}${this.sheetHead('দিনের ক্লাস রুটিন', `<b>${U.dayBn(U.dayName(iso))}, ${U.fmtDate(iso)}</b><span>শিক্ষাবর্ষ ${esc(U.bn(DB.session()))}</span>`)}
      ${this.fit(this.dateTable(iso, campus, true), 40 + nCols * 32, 16 + classes.length * 21, 281, 194 - 26)}</div>`;
  },

  /* ---------- temporary changes: list, form, save, delete ---------- */
  ovItems(campus = DB.campusId()) {
    const today = U.today(), out = [], here = ids => !ids?.length || ids.some(c => DB.campusOf(c) === campus);
    this.ovs().filter(o => (o.to || o.from) >= today && here(o.classIds)).forEach(o => out.push({ kind: 'ov', key: o.id, type: o.type, from: o.from, to: o.to || o.from, classIds: o.classIds || [], periods: o.periods || [], reason: o.reason, by: o.by }));
    const g = {}; (DB.s.proxies || []).filter(p => p.date >= today && DB.campusOf(p.classId) === campus).forEach(p => { const k = p.groupId || p.id; (g[k] = g[k] || []).push(p); });
    Object.entries(g).forEach(([k, ps]) => { const ds = ps.map(p => p.date).sort(); out.push({ kind: 'px', key: k, type: 'teacher', from: ds[0], to: ds[ds.length - 1], classIds: [...new Set(ps.map(p => p.classId))], periods: [...new Set(ps.map(p => +p.period))].sort((a, b) => a - b), reason: ps[0].reason, by: ps[0].by, extra: `${[...new Set(ps.map(p => DB.teacherName(p.absentTeacherId)))].join(', ')} → ${DB.teacherName(ps[0].proxyTeacherId)}` }); });
    return out.sort((a, b) => a.from.localeCompare(b.from));
  },
  /** Compact, collapsible list of running / upcoming temporary changes (changes are made from the cells). */
  ovList() {
    const list = this.ovItems(), today = U.today();
    if (!list.length) return '';
    return `<details class="card mt-4"><summary class="px-4 py-3 cursor-pointer font-semibold">${icon('calendar-clock', 'w-4 h-4 inline')} সাময়িক পরিবর্তন (${bnNum(list.length)})</summary>
      <div class="divide-y divide-slate-100 border-t border-slate-100">${list.map(x => `<div class="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span class="rounded px-2 py-0.5 ${x.from <= today ? 'bg-emerald-50 text-emerald-800' : 'bg-blue-50 text-blue-800'}">${x.from <= today ? 'চলমান' : 'আসন্ন'}</span><b>${this.TYPES[x.type]}</b>
        <span>${U.fmtDate(x.from)}${x.to !== x.from ? ' – ' + U.fmtDate(x.to) : ''}</span><span>${x.classIds.length ? esc(x.classIds.map(c => DB.className(c)).join(', ')) : 'সকল শ্রেণি'}</span>
        ${x.periods.length ? `<span>পিরিয়ড ${x.periods.map(n => bnNum(n)).join(', ')}</span>` : ''}${x.extra ? `<span>${esc(x.extra)}</span>` : ''}${x.reason ? `<span class="text-slate-600">${esc(x.reason)}</span>` : ''}${x.by ? `<span class="text-slate-500">${esc(pn(DB.user(x.by)) || '')}</span>` : ''}
        <div class="ml-auto flex gap-1"><button class="btn btn-ghost btn-sm" title="সম্পাদনা" aria-label="সম্পাদনা" onclick="RT.ovForm('${x.kind}','${esc(x.key)}')">${icon('pencil')}</button><button class="btn btn-ghost btn-sm text-red-600" title="মুছুন" aria-label="মুছুন" onclick="RT.ovDel('${x.kind}','${esc(x.key)}')">${icon('trash-2')}</button></div></div>`).join('')}</div></details>`;
  },
  ovRemove(kind, key) {
    if (!key) return;
    if (kind === 'ov') DB.s.routineOverrides = this.ovs().filter(o => o.id !== key);
    else DB.s.proxies = (DB.s.proxies || []).filter(p => (p.groupId || p.id) !== key);
    this._cache = {};
  },
  ovDel(kind, key) {
    if (!confirm('এই সাময়িক পরিবর্তন মুছে ফেলবেন?')) return;
    this.ovRemove(kind, key); DB.audit('ROUTINE_OVERRIDE_DELETE', 'routine', `${kind}:${key}`); DB.save(); toast('মুছে ফেলা হয়েছে।', 'success'); App.refresh();
  },
  /** Today, or the next date that falls on `day`. */
  nextDate(day) { let d = U.d(U.today()); for (let i = 0; i < 7 && U.dayName(d) !== day; i++) d = U.addDays(d, 1); return U.iso(d); },
  /** Temporary-change editor for one cell on a date (opened from the slot editor or the date view). */
  ovCell(classId, period, iso) { this.ovForm(null, null, { classIds: [classId], periods: [+period], from: iso || App.ui.rtDate || U.today(), cell: { classId, period: +period, iso: iso || App.ui.rtDate || U.today() } }); },
  /** Whole-day change for a date (all classes of the campus by default). */
  ovDay(iso) { this.ovForm(null, null, { type: 'day', from: iso, classIds: [], types: ['day'] }); },
  ovForm(kind, key, pre = {}) {
    const campus = DB.campusId(), classes = this.printClasses(campus), cls0 = classes.some(c => c.id === App.ui.rtCls) ? App.ui.rtCls : classes[classes.length - 1]?.id;
    const ex = kind === 'ov' ? this.ovs().find(o => o.id === key) : null, pxs = kind === 'px' ? (DB.s.proxies || []).filter(p => (p.groupId || p.id) === key) : [];
    const ds = pxs.map(p => p.date).sort();
    const v = ex ? { ...ex } : pxs.length ? { type: 'teacher', from: ds[0], to: ds[ds.length - 1], classIds: [...new Set(pxs.map(p => p.classId))], periods: [...new Set(pxs.map(p => +p.period))], reason: pxs[0].reason, teacherIds: [pxs[0].proxyTeacherId] } : { type: pre.type || 'cancel', from: pre.from || App.ui.rtDate || U.today(), to: '', classIds: pre.classIds || (cls0 ? [cls0] : []), periods: pre.periods || [], reason: '' };
    const types = Object.entries(this.TYPES).filter(([k]) => (pre.types ? pre.types.includes(k) : k !== 'day') || k === v.type);
    const c = pre.cell, here = c ? [...this.ovs().filter(o => o.type !== 'day' && this.ovOn(o, c.classId, c.iso) && (o.periods || []).map(Number).includes(c.period)).map(o => ({ kind: 'ov', key: o.id, label: this.TYPES[o.type], reason: o.reason })),
      ...(DB.s.proxies || []).filter(p => p.date === c.iso && p.classId === c.classId && +p.period === c.period).map(p => ({ kind: 'px', key: p.groupId || p.id, label: `${this.TYPES.teacher}: ${DB.teacherName(p.proxyTeacherId)}`, reason: p.reason }))] : [];
    const maxN = Math.max(1, ...classes.map(c => this.plan(c.id, null).periods.length)), teachers = DB.teachersIn(campus), subs = DB.s.subjects.filter(s => s.active !== false);
    const chk = (name, val, label, on) => `<label class="flex items-center gap-2"><input type="checkbox" class="w-5 h-5" name="${name}" value="${esc(String(val))}" ${on ? 'checked' : ''}> ${label}</label>`;
    const box = 'max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-2 grid gap-1';
    const dp = v.dayPlan?.periods?.length ? v.dayPlan : null, p1 = dp?.periods[0], p2 = dp?.periods[1], b0 = dp?.breaks?.[0];
    const dpv = { n: dp ? dp.periods.length : 4, start: p1?.start || '08:00', len: p1 ? this.mins(p1.end) - this.mins(p1.start) : 35, gap: p2 ? this.mins(p2.start) - this.mins(p1.end) : 5, bAfter: b0 ? b0.after : 2, bLen: b0 ? this.mins(b0.end) - this.mins(b0.start) : 15 };
    const num = (name, label, val, min, max) => `<div><label class="label" for="ov-${name}">${label}</label><input type="number" class="input" id="ov-${name}" name="${name}" min="${min}" max="${max}" value="${val}"></div>`;
    Modal.open({
      title: c ? `${DB.className(c.classId)} · পিরিয়ড ${bnNum(c.period)}` : 'সাময়িক পরিবর্তন', size: 'sm',
      body: `${c ? `<div class="flex gap-2 mb-3"><button type="button" class="btn btn-ghost btn-sm" onclick="Modal.close();Principal.editSlot('${c.classId}','${U.dayName(c.iso)}',${c.period})">নিয়মিত রুটিন</button><button type="button" class="btn btn-primary btn-sm">সাময়িক পরিবর্তন</button></div>` : ''}
        ${here.length ? `<div class="border border-amber-300 bg-amber-50 rounded-lg divide-y divide-amber-200 mb-3">${here.map(x => `<div class="px-3 py-2 flex flex-wrap items-center gap-2"><b>${esc(x.label)}</b>${x.reason ? `<span>${esc(x.reason)}</span>` : ''}<div class="ml-auto flex gap-1"><button type="button" class="btn btn-ghost btn-sm" title="সম্পাদনা" aria-label="সম্পাদনা" onclick="RT.ovForm('${x.kind}','${esc(x.key)}')">${icon('pencil')}</button><button type="button" class="btn btn-ghost btn-sm text-red-600" title="মুছুন" aria-label="মুছুন" onclick="Modal.close();RT.ovDel('${x.kind}','${esc(x.key)}')">${icon('trash-2')}</button></div></div>`).join('')}</div>` : ''}
        <form id="ov-form" class="space-y-3">
        <div><label class="label" for="ov-type">ধরন</label><select class="select" id="ov-type" name="type">${types.map(([k, l]) => `<option value="${k}" ${k === v.type ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="grid grid-cols-2 gap-3"><div><label class="label" for="ov-from">শুরুর তারিখ</label><input type="date" class="input" id="ov-from" name="from" value="${esc(v.from || '')}" required></div><div><label class="label" for="ov-to">শেষ তারিখ</label><input type="date" class="input" id="ov-to" name="to" value="${esc(v.to && v.to !== v.from ? v.to : '')}"></div></div>
        <div><div class="label">শ্রেণি</div><div class="${box} grid-cols-2">${classes.map(c => chk('cls', c.id, esc(c.name), (v.classIds || []).includes(c.id))).join('')}</div></div>
        <div data-t="cancel teacher change swap combine"><div class="label">পিরিয়ড</div><div class="${box} grid-cols-3">${Array.from({ length: maxN }, (_, i) => i + 1).map(n => chk('per', n, `পিরিয়ড ${bnNum(n)}`, (v.periods || []).map(Number).includes(n))).join('')}</div></div>
        <div data-t="teacher combine"><label class="label" for="ov-t">শিক্ষক</label><select class="select" id="ov-t" name="teacher">${teachers.map(t => `<option value="${t.id}" ${(v.teacherIds || [])[0] === t.id ? 'selected' : ''}>${esc(pn(DB.user(t.userId)) || t.id)}</option>`).join('')}</select></div>
        <div data-t="change combine"><label class="label" for="ov-s">বিষয়</label><select class="select" id="ov-s" name="subject"><option value="">—</option>${subs.map(s => `<option value="${s.id}" ${(v.subjectIds || [])[0] === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
        <div data-t="change combine"><label class="label" for="ov-r">কক্ষ</label><input class="input" id="ov-r" name="room" maxlength="40" value="${esc(v.room || '')}"></div>
        <div data-t="change" class="grid grid-cols-2 gap-3"><div><label class="label" for="ov-st">শুরু</label><input type="time" class="input" id="ov-st" name="start" value="${esc(v.start || '')}"></div><div><label class="label" for="ov-en">শেষ</label><input type="time" class="input" id="ov-en" name="end" value="${esc(v.end || '')}"></div></div>
        <div data-t="day" class="space-y-2"><label class="flex items-center gap-2"><input type="radio" class="w-5 h-5" name="dmode" value="cancel" ${dp ? '' : 'checked'}> সব ক্লাস রহিত</label><label class="flex items-center gap-2"><input type="radio" class="w-5 h-5" name="dmode" value="plan" ${dp ? 'checked' : ''}> ভিন্ন সময়সূচি</label>
          <div class="grid grid-cols-2 gap-3">${num('pn', 'পিরিয়ড সংখ্যা', dpv.n, 1, 12)}<div><label class="label" for="ov-pstart">প্রথম পিরিয়ড শুরু</label><input type="time" class="input" id="ov-pstart" name="pstart" value="${esc(dpv.start)}"></div>${num('plen', 'প্রতি পিরিয়ড (মিনিট)', dpv.len, 5, 120)}${num('pgap', 'পিরিয়ডের ফাঁক (মিনিট)', dpv.gap, 0, 60)}${num('bafter', 'বিরতি — পিরিয়ডের পরে', dpv.bAfter, 0, 11)}${num('blen', 'বিরতি (মিনিট)', dpv.bLen, 0, 120)}</div></div>
        <div><label class="label" for="ov-why">কারণ</label><input class="input" id="ov-why" name="reason" maxlength="120" value="${esc(v.reason || '')}"></div>
        <label class="flex items-center gap-2"><input type="checkbox" class="w-5 h-5" name="notify"> শিক্ষক ও শ্রেণিকে এসএমএসে জানান</label>
        <button class="btn btn-primary w-full">${icon('save')} সংরক্ষণ করুন</button></form>`,
    });
    const f = $('#ov-form'), sync = () => $$('#ov-form [data-t]').forEach(el => el.classList.toggle('hidden', !el.dataset.t.split(' ').includes(f.type.value)));
    f.addEventListener('change', sync); sync();
    f.addEventListener('submit', e => { e.preventDefault(); this.ovSave(kind, key, f); });
  },
  ovSave(kind, key, f) {
    this._cache = {};
    const type = f.type.value, from = f.from.value, to = f.to.value && f.to.value > from ? f.to.value : from;
    const classIds = $$('#ov-form [name=cls]:checked').map(i => i.value), periods = $$('#ov-form [name=per]:checked').map(i => +i.value).sort((a, b) => a - b);
    const reason = f.reason.value.trim(), subj = f.subject.value, room = f.room.value.trim(), tid = f.teacher.value;
    if (!from) return toast('তারিখ দিন।', 'error');
    if (type !== 'day' && !classIds.length) return toast('অন্তত একটি শ্রেণি নির্বাচন করুন।', 'error');
    if (type !== 'day' && !periods.length) return toast('অন্তত একটি পিরিয়ড নির্বাচন করুন।', 'error');
    if (type === 'swap' && periods.length !== 2) return toast('অদলবদলের জন্য ঠিক দুটি পিরিয়ড নির্বাচন করুন।', 'error');
    if (type === 'combine' && (classIds.length < 2 || !subj)) return toast('যৌথ ক্লাসে অন্তত দুটি শ্রেণি ও একটি বিষয় নির্বাচন করুন।', 'error');
    if (type === 'change' && !subj && !room && !(f.start.value && f.end.value)) return toast('বিষয়, কক্ষ বা সময় — অন্তত একটি পরিবর্তন দিন।', 'error');
    if (type === 'change' && f.start.value && f.end.value && this.mins(f.end.value) <= this.mins(f.start.value)) return toast('শেষ সময় শুরুর পরে দিন।', 'error');
    const dates = this.datesIn(from, to), by = App.session.userId, at = new Date().toISOString();
    let added = [], rec = null;
    if (type === 'teacher') {
      const gid = DB.id('PG');
      dates.forEach(iso => classIds.forEach(c => periods.forEach(p => {
        const s = this.effective(c, iso, { noProxy: true }).find(x => +x.period === p);
        if (!s || this.hasT(s, tid) || (DB.s.proxies || []).some(x => x.date === iso && x.classId === c && +x.period === p && (x.groupId || x.id) !== key)) return;
        added.push({ id: DB.id('PX'), groupId: gid, date: iso, period: p, span: this.span(s), classId: c, subjectId: this.subs(s)[0] || '', subjectIds: this.subs(s), room: s.room || '', absentTeacherId: this.tchs(s)[0] || '', proxyTeacherId: tid, reason: reason || this.TYPES.teacher, by, createdAt: at });
      })));
      if (!added.length) return toast('নির্বাচিত তারিখ ও পিরিয়ডে বদলযোগ্য কোনো ক্লাস নেই।', 'error');
    } else {
      rec = { id: kind === 'ov' && key ? key : DB.id('RO'), type, from, to, classIds: type === 'day' && !classIds.length ? [] : classIds, periods: type === 'day' ? [] : periods, reason, by, at };
      if (type === 'change' || type === 'combine') { if (subj) rec.subjectIds = [subj]; if (room) rec.room = room; }
      if (type === 'change' && f.start.value && f.end.value) { rec.start = f.start.value; rec.end = f.end.value; }
      if (type === 'combine') rec.teacherIds = [tid];
      if (type === 'day') {
        if (f.dmode.value === 'plan') {
          const n = Math.max(1, Math.min(12, +f.pn.value || 0)), len = +f.plen.value || 0, gap = Math.max(0, +f.pgap.value || 0), ba = +f.bafter.value || 0, bl = Math.max(0, +f.blen.value || 0);
          if (isNaN(this.mins(f.pstart.value)) || len <= 0) return toast('প্রথম পিরিয়ডের শুরু ও দৈর্ঘ্য দিন।', 'error');
          const ps = [], brs = []; let t = f.pstart.value;
          for (let i = 1; i <= n; i++) { const e = this.addMin(t, len); ps.push({ n: i, start: t, end: e }); t = this.addMin(e, gap); if (i === ba && ba < n && bl > 0) { brs.push({ after: i, label: 'বিরতি', start: e, end: this.addMin(e, bl) }); t = this.addMin(e, bl); } }
          rec.dayPlan = { periods: ps, breaks: brs };
        } else rec.dayCancel = true;
      }
    }
    this.ovRemove(kind, key);
    if (rec) { if (!Array.isArray(DB.s.routineOverrides)) DB.s.routineOverrides = []; DB.s.routineOverrides.push(rec); }
    else DB.s.proxies = [...(DB.s.proxies || []), ...added];
    this._cache = {};
    const label = `${U.fmtDate(from)}${to !== from ? '–' + U.fmtDate(to) : ''} ${classIds.length ? classIds.map(c => DB.className(c)).join(', ') : 'সকল শ্রেণি'} — ${this.TYPES[type]}${periods.length && type !== 'day' ? ` (পিরিয়ড ${periods.map(n => bnNum(n)).join(', ')})` : ''}${type === 'teacher' || type === 'combine' ? ': ' + DB.teacherName(tid) : ''}${reason ? ' · ' + reason : ''}`;
    DB.audit(kind && key ? 'ROUTINE_OVERRIDE_EDIT' : 'ROUTINE_OVERRIDE_ADD', 'routine', label);
    let sent = 0;
    if (f.notify.checked) sent = this.ovNotify(label, dates, classIds, type === 'day' ? [] : periods, type === 'teacher' || type === 'combine' ? [tid] : []);
    DB.save();
    const cl = [...new Set(dates.slice(0, 14).flatMap(iso => this.dateClashes(iso)))];
    Modal.close();
    toast(`সাময়িক পরিবর্তন সংরক্ষিত হয়েছে${sent ? ` · ${bnNum(sent)}টি এসএমএস সারিতে` : ''}${cl.length ? ` · ${bnNum(cl.length)}টি সংঘাত: ${cl[0]}` : ''}`, cl.length ? 'warn' : 'success');
    App.refresh();
  },
  /** Queue SMS to the teachers of the affected periods (before and after the change) and the classes' guardians. */
  ovNotify(label, dates, classIds, periods, extra) {
    const tids = new Set(extra || []), phones = new Set(), cls = classIds.length ? classIds : DB.classesIn().map(c => c.id);
    dates.forEach(iso => cls.forEach(c => this.effective(c, iso, { all: true }).filter(s => !periods.length || periods.some(p => p >= +s.period && p <= this.lastP(s))).forEach(s => [...this.tchs(s), ...this.tchs(s._base || {})].forEach(t => tids.add(t)))));
    tids.forEach(t => { const ph = DB.user(DB.teacher(t)?.userId)?.phone; if (ph) phones.add(ph); });
    cls.forEach(c => DB.studentsIn(c).forEach(st => DB.guardiansOf(st.id).forEach(g => { if (g.phone) phones.add(g.phone); })));
    const msg = `${DB.s.school.shortName}: রুটিনে সাময়িক পরিবর্তন — ${label}`;
    phones.forEach(ph => DB.sms(ph, msg));
    return phones.size;
  },
  /* ---------- print menu ---------- */
  printMenu(cls, ses, vid) {
    const r = (v, l, on) => `<label class="flex items-center gap-2 p-2 rounded-lg border border-slate-200 cursor-pointer"><input type="radio" name="what" value="${v}" class="w-5 h-5" ${on ? 'checked' : ''}> ${l}</label>`;
    Modal.open({
      title: 'রুটিন মুদ্রণ', size: 'sm',
      body: `<form id="rt-pm" class="space-y-3">${r('one', `শুধু ${esc(DB.className(cls))}`, true)}${r('all', 'সকল শ্রেণি — প্রতিটি আলাদা পৃষ্ঠায়')}${r('master', 'সকল শ্রেণি — এক পৃষ্ঠায় সমন্বিত')}
        <div id="rt-pm-x" class="grid grid-cols-2 gap-3 hidden"><div><label class="label" for="rt-pm-l">সারি</label><select class="select" id="rt-pm-l" name="layout"><option value="day">দিন × শ্রেণি</option><option value="class">শ্রেণি × দিন</option></select></div>
        <div><label class="label" for="rt-pm-p">কাগজ</label><select class="select" id="rt-pm-p" name="paper"><option value="A4">এ৪ ল্যান্ডস্কেপ</option><option value="A3">এ৩ ল্যান্ডস্কেপ</option></select></div></div>
        <button class="btn btn-primary w-full">${icon('printer')} মুদ্রণ / পিডিএফ</button></form>`,
    });
    const f = $('#rt-pm'), sync = () => $('#rt-pm-x').classList.toggle('hidden', f.what.value !== 'master');
    f.addEventListener('change', sync);
    f.addEventListener('submit', e => {
      e.preventDefault(); const w = f.what.value, campus = DB.campusId();
      if (w === 'one') Print.show('routine', cls, ses, vid);
      else if (w === 'all') Print.show('routineAll', ses, campus, vid);
      else Print.show('routineMaster', ses, campus, f.layout.value, f.paper.value, vid);
    });
  },
  /** Dated supplementary classes of a class (from today on unless `all`). */
  dated(classId, set, all) { return (set || this.routineOf(this._v !== undefined ? this._v : this.onBuilder() ? this.builderVer() : this.verFor(classId, U.today()))).filter(r => r.classId === classId && r.date && (all || r.date >= U.today())).sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period); },
  datedList(classId, o = {}) {
    const list = this.dated(classId, o.set, o.edit), P = !!o.print;
    if (!list.length) return '';
    if (P) return `<div style="margin-top:4mm;font-size:12pt;font-weight:700">তারিখভিত্তিক সাপ্লিমেন্টারি ক্লাস</div><table style="width:100%;border-collapse:collapse;font-size:12pt;margin-top:1.5mm">${list.map(r => `<tr><td style="border:.3mm solid #94a3b8;padding:1.2mm">${U.fmtDate(r.date)} · ${U.dayBn(r.day)}</td><td style="border:.3mm solid #94a3b8;padding:1.2mm">${this.periodText(r)} ${this.rangeText(r)}</td><td style="border:.3mm solid #94a3b8;padding:1.2mm">${esc(this.subName(r))}</td><td style="border:.3mm solid #94a3b8;padding:1.2mm">${esc(this.tchName(r))}</td><td style="border:.3mm solid #94a3b8;padding:1.2mm">${r.room ? 'কক্ষ ' + esc(U.bn(r.room)) : ''}</td></tr>`).join('')}</table>`;
    return `<div class="card mt-4"><div class="px-4 py-3 border-b border-slate-100 font-semibold flex items-center gap-2">${icon('calendar-plus')} তারিখভিত্তিক সাপ্লিমেন্টারি ক্লাস</div><div class="divide-y divide-slate-100">${list.map(r => `<div class="px-4 py-3 flex flex-wrap items-center gap-3"><b>${U.fmtDate(r.date)} · ${U.dayBn(r.day)}</b><span>${this.periodText(r)} ${this.rangeText(r)}</span><span class="font-semibold">${esc(this.subName(r))}</span><span class="text-slate-600">${esc(this.tchName(r))}</span>${r.room ? `<span class="text-slate-600">কক্ষ ${esc(U.bn(r.room))}</span>` : ''}${o.bad && o.bad.has(r.id) ? `<span class="text-red-700">${icon('triangle-alert', 'w-4 h-4 inline')} সংঘাত</span>` : ''}${o.edit ? `<button class="btn btn-ghost btn-sm ml-auto" onclick="Principal.editSlot('${r.classId}','${r.day}',${r.period},'${r.id}')">${icon('pencil')} সম্পাদনা</button>` : ''}</div>`).join('')}</div></div>`;
  },
  /** One landscape sheet: header, weekly grid with breaks, dated supplementary classes. */
  printSheet(classId, ses, vid) {
    if (vid && this._v === undefined) return this.as(this.ver(vid), () => this.printSheet(classId, ses, vid));
    const set = vid ? this.routineOf(this._v) : this.setOf(ses), c = DB.cls(classId);
    if (!c) return null;
    const off = this.offDays(classId).map(i => U.DAYS[i]).join(', ');
    const days = this.D7.filter(d => !this.isOff(classId, d) || set.some(r => r.classId === classId && r.day === d && !r.date)).length;
    const nCols = this.cols(classId, this.D7).length, nDated = this.dated(classId, set).length;
    const body = `${this.grid(classId, { set, print: true })}${this.datedList(classId, { set, print: true })}<div style="display:flex;justify-content:flex-end;margin-top:4mm">${Print.signature('Principal')}</div>`;
    return `${Print.sheet({ orientation: 'landscape' }, '', 'padding:8mm;box-sizing:border-box;overflow:hidden;position:relative')}${this.sheetHead(`ক্লাস রুটিন${vid ? ' — ' + esc(this.verName(vid)) : ''}`,`<b>${esc(c.name)}${this.multi() ? ' · ' + esc(this.shiftName(this.shiftOf(classId))) + ' শিফট' : ''}</b><span>শিক্ষাবর্ষ ${esc(U.bn(ses || DB.session()))}${off ? ' · সাপ্তাহিক ছুটি: ' + esc(off) : ''}</span>`)}
      ${this.fit(body, 25 + nCols * 30, 16 + days * 17 + (nDated ? 10 + nDated * 8 : 0) + 28, 281, 194 - 26)}</div>`;
  },

  /* ---------- period-time & off-day editor (routine builder) ---------- */
  /** Draft of the timetable being edited: scope 'default' | 'shift' (key = shift id) | 'class' (key = class id). */
  draftOf(scope, key, day) { const p = this.resolve(this.chainFrom(scope, key), day || null); return { periods: p.periods.map(x => ({ ...x })), breaks: p.breaks.map(x => ({ ...x })) }; },
  scopeName(scope, key) { return scope === 'class' ? DB.className(key) : scope === 'shift' ? `${this.shiftName(key)} শিফট` : 'সকল শ্রেণি'; },
  cfgOpen(cls) { const ui = App.ui; if (ui.rtCfg) { ui.rtCfg = null; return App.refresh(); } this.cfgScope(this.cfgR().classes?.[cls] ? 'class' : 'default', cls); },
  initDraft(scope, cls, day = '') {
    const key = scope === 'class' ? cls : scope === 'shift' ? (this.shiftOf(cls) || this.shifts()[0]?.id || '') : '';
    return { scope, key, cls, day, ...this.draftOf(scope, key, day) };
  },
  cfgScope(scope, cls) { App.ui.rtCfg = this.initDraft(scope, cls); App.refresh(); },
  cfgPick(k, v) { const d = App.ui.rtCfg; d[k] = v; Object.assign(d, this.draftOf(d.scope, d.key, d.day)); App.refresh(); },
  cfgSet(kind, i, f, v) { const row = App.ui.rtCfg?.[kind]?.[i]; if (!row) return; row[f] = f === 'after' ? +v : v; if (f !== 'label') App.refresh(); },
  cfgAdd(kind, after) {
    const d = App.ui.rtCfg;
    if (kind === 'periods') { const last = d.periods[d.periods.length - 1], s = last?.end ? this.addMin(last.end, 5) : '08:00'; d.periods.push({ n: d.periods.length + 1, start: s, end: this.addMin(s, 45) }); }
    else { const n = after || Math.max(1, Math.min(3, d.periods.length - 1)), p = d.periods[n - 1]; d.breaks.push({ after: n, label: 'বিরতি', start: p?.end || '', end: p?.end ? this.addMin(p.end, 20) : '' }); }
    App.refresh();
  },
  cfgDel(kind, i) {
    const d = App.ui.rtCfg; d[kind].splice(i, 1);
    if (kind === 'periods') d.breaks = d.breaks.map(b => ({ ...b, after: b.after > i ? b.after - 1 : b.after })).filter(b => b.after >= 1 && b.after < d.periods.length);
    App.refresh();
  },
  ownLayer(d) { const c = this.cfgW(); return d.scope === 'class' ? (c.classes[d.key] = c.classes[d.key] || {}) : d.scope === 'shift' ? (c.shifts[d.key] = c.shifts[d.key] || {}) : c.default; },
  hasOwn(scope, key, day) { const L = this.layer(scope, key); return !!(L && (day ? L.days?.[day] : L.periods?.length)); },
  cfgSave() {
    const d = App.ui.rtCfg; if (!d) return;
    if (!d.periods.length) return toast('অন্তত একটি পিরিয়ড রাখুন।', 'error');
    for (const p of d.periods) {
      if (isNaN(this.mins(p.start)) || isNaN(this.mins(p.end)) || this.mins(p.end) <= this.mins(p.start)) return toast('প্রতিটি পিরিয়ডের শুরু ও শেষের সময় সঠিকভাবে দিন (শেষ সময় শুরুর পরে)।', 'error');
    }
    const L = this.ownLayer(d), plan = this.clean(d);
    if (d.day) (L.days = L.days || {})[d.day] = plan; else { L.periods = plan.periods; L.breaks = plan.breaks; }
    DB.audit('ROUTINE_TIMES', 'routine', `${this.scopeName(d.scope, d.key)}${d.day ? ' · ' + U.dayBn(d.day) : ''}: ${plan.periods.length}টি পিরিয়ড, ${plan.breaks.length}টি বিরতি`); DB.save();
    const ses = App.ui.rtSes || DB.session(), extra = DB.routineSet(ses).filter(r => (!d.day || r.day === d.day) && +r.period > this.plan(r.classId, r.day).periods.length).length;
    toast(extra ? `সময়সূচি সংরক্ষিত হয়েছে। ${bnNum(extra)}টি পিরিয়ড নতুন সময়সূচির বাইরে পড়েছে — রুটিনে দেখানো হবে না।` : 'সময়সূচি সংরক্ষিত হয়েছে।', extra ? 'warn' : 'success'); App.refresh();
  },
  cfgReset() {
    const d = App.ui.rtCfg, L = this.ownLayer(d);
    if (d.day) { if (L.days) delete L.days[d.day]; } else { delete L.periods; delete L.breaks; }
    if (d.scope === 'class' && !L.periods && !Object.keys(L.days || {}).length) delete this.cfgW().classes[d.key];
    DB.audit('ROUTINE_TIMES', 'routine', `${this.scopeName(d.scope, d.key)}${d.day ? ' · ' + U.dayBn(d.day) : ''}: নিজস্ব সময় মুছে ফেলা হয়েছে`); DB.save();
    Object.assign(d, this.draftOf(d.scope, d.key, d.day)); toast('নিজস্ব সময় মুছে ফেলা হয়েছে।', 'success'); App.refresh();
  },
  offKey1(d) { return d.scope === 'class' ? 'c:' + d.key : d.scope === 'shift' ? 's:' + d.key : 'd'; },
  offSet(idx, on) {
    const d = App.ui.rtCfg, c = this.cfgW(), cur = new Set(this.offFor(d.scope, d.key)); on ? cur.add(idx) : cur.delete(idx);
    c.offDays[this.offKey1(d)] = [...cur].sort();
    DB.audit('ROUTINE_OFFDAYS', 'routine', `${this.scopeName(d.scope, d.key)}: ${[...cur].map(i => U.DAYS[i]).join(', ') || 'নেই'}`); DB.save(); App.refresh();
  },
  offReset() { const d = App.ui.rtCfg; delete this.cfgW().offDays[this.offKey1(d)]; DB.audit('ROUTINE_OFFDAYS', 'routine', `${this.scopeName(d.scope, d.key)}: নিজস্ব ছুটি মুছে ফেলা হয়েছে`); DB.save(); App.refresh(); },
  /* ---------- shifts: add / rename / remove (school.shifts) ---------- */
  shiftAdd() {
    const s = DB.s.school, l = s.shifts = (s.shifts || []).filter(x => x && x.id);
    if (!l.length) l.push({ id: 'MORNING', name: 'প্রভাতি', start: '', end: '' });
    l.push({ id: 'SH' + Date.now().toString(36).toUpperCase(), name: `শিফট ${bnNum(l.length + 1)}`, start: '', end: '' });
    DB.audit('SHIFT_ADD', 'settings', l[l.length - 1].name); DB.save(); App.refresh();
  },
  shiftRename(id, name) { const x = this.shifts().find(s => s.id === id); name = String(name || '').trim(); if (!x || !name) return App.refresh(); x.name = name; DB.audit('SHIFT_RENAME', 'settings', `${id} → ${name}`); DB.save(); App.refresh(); },
  shiftDel(id) {
    const x = this.shifts().find(s => s.id === id); if (!x) return;
    const n = DB.s.classes.filter(c => c.shift === id).length;
    if (!confirm(`"${x.name}" শিফট মুছে ফেলবেন?${n ? ` ${bnNum(n)}টি শ্রেণি অন্য শিফটের সময় অনুসরণ করবে।` : ''}`)) return;
    DB.s.school.shifts = DB.s.school.shifts.filter(s => s.id !== id);
    DB.s.classes.forEach(c => { if (c.shift === id) c.shift = ''; });
    const c = this.cfgW(); delete c.shifts[id]; delete c.offDays['s:' + id];
    const d = App.ui.rtCfg; if (d && d.scope === 'shift' && d.key === id) { d.scope = 'default'; d.key = ''; Object.assign(d, this.draftOf('default', '', d.day)); }
    DB.audit('SHIFT_DELETE', 'settings', x.name); DB.save(); App.refresh();
  },
  setClassShift(cls, id) { const c = DB.cls(cls); if (!c) return; c.shift = id; DB.audit('CLASS_SHIFT', 'classes', `${c.name} → ${this.shiftName(id)}`); DB.save(); const d = App.ui.rtCfg; if (d) Object.assign(d, this.draftOf(d.scope, d.key, d.day)); App.refresh(); },
  dur(a, b) { const x = this.mins(b) - this.mins(a); return isNaN(x) || x <= 0 ? '—' : `${bnNum(x)} মিনিট`; },
  cfgCard(cls) {
    let d = App.ui.rtCfg; if (!d) return '';
    const multi = this.multi(), shifts = this.shifts();
    if (d.cls !== cls || (d.scope === 'shift' && !multi)) App.ui.rtCfg = d = this.initDraft(d.scope === 'shift' && !multi ? 'default' : d.scope, cls, d.day);
    const tin = (kind, i, f, v) => `<input type="time" class="input !w-36" value="${esc(v || '')}" onchange="RT.cfgSet('${kind}',${i},'${f}',this.value)" aria-label="${f === 'start' ? 'শুরু' : 'শেষ'}">`;
    const td = 'class="px-3 py-2 align-middle"', del = (kind, i) => `<button class="btn btn-ghost btn-sm" title="মুছুন" aria-label="মুছুন" onclick="RT.cfgDel('${kind}',${i})">${icon('trash-2')}</button>`;
    const rows = d.periods.map((p, i) => `<tr class="border-t border-slate-100"><td ${td}><b>পিরিয়ড ${bnNum(i + 1)}</b></td><td ${td}><span class="rounded px-2 py-0.5 bg-blue-50 text-blue-800">পিরিয়ড</span></td><td ${td}>${tin('periods', i, 'start', p.start)}</td><td ${td}>${tin('periods', i, 'end', p.end)}</td><td ${td}>${this.dur(p.start, p.end)}</td><td ${td}><div class="flex gap-1">${i < d.periods.length - 1 ? `<button class="btn btn-ghost btn-sm" title="এর পরে বিরতি যোগ করুন" aria-label="এর পরে বিরতি যোগ করুন" onclick="RT.cfgAdd('breaks',${i + 1})">${icon('coffee')}</button>` : ''}${del('periods', i)}</div></td></tr>`
      + d.breaks.map((b, j) => [b, j]).filter(([b]) => +b.after === i + 1).map(([b, j]) => `<tr class="border-t border-slate-100 bg-amber-50/60"><td ${td}><input class="input !w-40" value="${esc(b.label)}" maxlength="30" onchange="RT.cfgSet('breaks',${j},'label',this.value)" aria-label="বিরতির নাম"></td><td ${td}><select class="select !w-auto" onchange="RT.cfgSet('breaks',${j},'after',this.value)" aria-label="বিরতির অবস্থান">${d.periods.slice(0, -1).map((p, k) => `<option value="${k + 1}" ${k + 1 === +b.after ? 'selected' : ''}>বিরতি · পিরিয়ড ${bnNum(k + 1)}-এর পরে</option>`).join('')}</select></td><td ${td}>${tin('breaks', j, 'start', b.start)}</td><td ${td}>${tin('breaks', j, 'end', b.end)}</td><td ${td}>${this.dur(b.start, b.end)}</td><td ${td}>${del('breaks', j)}</td></tr>`).join('')).join('');
    const offs = this.offFor(d.scope, d.key), ownOff = Array.isArray(this.cfgR().offDays?.[this.offKey1(d)]);
    const tab = (scope, label) => `<button class="btn btn-sm ${d.scope === scope ? 'btn-primary' : 'btn-ghost'}" onclick="RT.cfgScope('${scope}','${cls}')">${label}</button>`;
    const own = this.hasOwn(d.scope, d.key, d.day);
    return `<div class="card p-4 mb-4 space-y-4" id="rt-cfg">
      <div class="flex flex-wrap items-center gap-2">${tab('default', 'সকল শ্রেণি')}${multi ? tab('shift', 'শিফট') : ''}${tab('class', esc(DB.className(cls)))}</div>
      <div class="flex flex-wrap items-end gap-3">
        ${d.scope === 'shift' ? `<div><label class="label">শিফট</label><select class="select" onchange="RT.cfgPick('key',this.value)">${shifts.map(s => `<option value="${esc(s.id)}" ${s.id === d.key ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>` : ''}
        ${d.scope === 'class' && multi ? `<div><label class="label">শ্রেণির শিফট</label><select class="select" onchange="RT.setClassShift('${cls}',this.value)">${shifts.map(s => `<option value="${esc(s.id)}" ${s.id === this.shiftOf(cls) ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>` : ''}
        <div><label class="label">দিন</label><select class="select" onchange="RT.cfgPick('day',this.value)"><option value="">সকল দিন</option>${this.D7.map(x => `<option value="${x}" ${x === d.day ? 'selected' : ''}>${U.dayBn(x)}${this.hasOwn(d.scope, d.key, x) ? ' (আলাদা সময়)' : ''}</option>`).join('')}</select></div>
        <div class="pb-2">${own ? '<span class="rounded px-2 py-0.5 bg-emerald-50 text-emerald-800">নিজস্ব সময়</span>' : `<span class="rounded px-2 py-0.5 bg-slate-100 text-slate-700">${d.scope === 'default' ? 'পূর্বনির্ধারিত সময়' : 'উপরের স্তর থেকে নেওয়া'}</span>`}</div>
      </div>
      <div class="font-semibold">${esc(this.scopeName(d.scope, d.key))}${d.day ? ' · ' + U.dayBn(d.day) : ''} — পিরিয়ড ও বিরতি</div>
      <div class="scroll-x border border-slate-200 rounded-lg"><table class="w-full" style="min-width:720px"><thead class="bg-slate-50"><tr><th class="px-3 py-2 text-left">নাম</th><th class="px-3 py-2 text-left">ধরন</th><th class="px-3 py-2 text-left">শুরু</th><th class="px-3 py-2 text-left">শেষ</th><th class="px-3 py-2 text-left">সময়কাল</th><th class="px-3 py-2"></th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="flex flex-wrap gap-2"><button class="btn btn-ghost" onclick="RT.cfgAdd('periods')">${icon('plus')} পিরিয়ড যোগ করুন</button><button class="btn btn-primary" onclick="RT.cfgSave()">${icon('save')} সময় সংরক্ষণ করুন</button>${own ? `<button class="btn btn-ghost" onclick="RT.cfgReset()">${icon('rotate-ccw')} নিজস্ব সময় মুছুন</button>` : ''}</div>
      <div class="border-t border-slate-100 pt-4"><div class="font-semibold mb-2">সাপ্তাহিক ছুটি — ${esc(this.scopeName(d.scope, d.key))}</div>
        <div class="scroll-x border border-slate-200 rounded-lg"><table class="w-full text-center" style="min-width:560px"><thead class="bg-slate-50"><tr>${this.D7.map(x => `<th class="px-2 py-2">${U.dayBn(x)}</th>`).join('')}</tr></thead><tbody><tr>${this.D7.map(x => { const i = this.IDX[x], on = offs.includes(i); return `<td class="px-2 py-2"><label class="inline-flex flex-col items-center gap-1 cursor-pointer"><input type="checkbox" class="w-5 h-5" ${on ? 'checked' : ''} onchange="RT.offSet(${i},this.checked)" aria-label="${U.dayBn(x)} ছুটি"><span class="${on ? 'text-rose-700' : 'text-slate-500'}">${on ? 'ছুটি' : 'ক্লাস'}</span></label></td>`; }).join('')}</tr></tbody></table></div>
        <div class="flex flex-wrap items-center gap-2 mt-2"><span class="text-slate-600">${ownOff ? 'নিজস্ব ছুটি' : 'উপরের স্তর / ক্যালেন্ডার অনুযায়ী'}</span>${ownOff ? `<button class="btn btn-ghost btn-sm" onclick="RT.offReset()">${icon('rotate-ccw')} নিজস্ব ছুটি মুছুন</button>` : ''}</div></div>
      <div class="border-t border-slate-100 pt-4">${multi ? `<div class="font-semibold mb-2">শিফট</div><div class="space-y-2">${shifts.map(s => `<div class="flex flex-wrap items-center gap-2"><input class="input !w-48" value="${esc(s.name)}" maxlength="30" onchange="RT.shiftRename('${esc(s.id)}',this.value)" aria-label="শিফটের নাম"><span class="text-slate-500">${bnNum(DB.s.classes.filter(c => this.shiftOf(c.id) === s.id).length)}টি শ্রেণি</span><button class="btn btn-ghost btn-sm" title="মুছুন" aria-label="মুছুন" onclick="RT.shiftDel('${esc(s.id)}')">${icon('trash-2')}</button></div>`).join('')}</div>` : ''}
        <button class="btn btn-ghost btn-sm ${multi ? 'mt-2' : ''}" onclick="RT.shiftAdd()">${icon('plus')} শিফট যোগ করুন</button></div>
    </div>`;
  },
};

/* ---------- printable weekly routine ---------- */
if (!Print.PAPERS.A3) { Print.PAPERS.A3 = [297, 420]; Print.PAPER_BN.A3 = 'এ৩'; }
Print.doc.routine = function (classId, ses, vid) { const s = RT.printSheet(classId, ses, vid); return s && { title: `ক্লাস রুটিন — ${DB.className(classId)}${vid ? ' — ' + RT.verName(vid) : ''}`, sheets: [s], opts: { orientation: 'landscape' } }; };
Print.doc.routineDate = function (iso, campus) { const s = /^\d{4}-\d{2}-\d{2}$/.test(iso || '') && RT.dateSheet(iso, campus); return s && { title: `দিনের ক্লাস রুটিন — ${U.fmtDate(iso)}`, sheets: [s], opts: { orientation: 'landscape' } }; };
/* any save may change the routine, its temporary changes or proxies: drop the per-date cache */
(() => { const s0 = DB.save.bind(DB); DB.save = function () { RT._cache = {}; return s0.apply(this, arguments); }; })();
/* data refreshed from the server (another tab / user) also invalidates it */
setInterval(() => { RT._cache = {}; }, 15000);
Print.doc.routineAll = function (ses, campus, vid) { const sheets = RT.printClasses(campus).map(c => RT.printSheet(c.id, ses, vid)).filter(Boolean); return sheets.length && { title: `ক্লাস রুটিন — সকল শ্রেণি${vid ? ' — ' + RT.verName(vid) : ''}`, sheets, opts: { orientation: 'landscape' } }; };
Print.doc.routineMaster = function (ses, campus, layout, paper, vid) { const p = paper === 'A3' ? 'A3' : 'A4', s = RT.masterSheet(ses, campus, layout === 'class' ? 'class' : 'day', p, vid); return s && { title: 'সমন্বিত ক্লাস রুটিন', sheets: [s], opts: { paper: p, orientation: 'landscape' } }; };

/* ---------- routine builder (principal → রুটিন প্রস্তুতকারী) ---------- */
Object.assign(Principal, {
  conflicts(slot, ignoreId, set = RT.editSet()) { return RT.clashes(slot, ignoreId, set); },
  allConflicts(set = RT.editSet()) { return RT.allClashes(set).list; },
  editSlot(classId, day, period, slotId) {
    const ses = App.ui.rtSes || DB.session(), set = RT.editSet(), campus = DB.campusOf(classId), cls = DB.cls(classId);
    if (!cls) return;
    if (!DB.teachersIn(campus).length) return toast('রুটিনে পিরিয়ড বসাতে আগে এই ক্যাম্পাসে শিক্ষক যোগ করুন।', 'warn');
    const fresh = slotId === 'new';
    const found = fresh ? null : slotId ? set.find(r => r.id === slotId) : set.find(r => r.classId === classId && r.day === day && !r.date && +r.period === +period);
    const cur = found || { classId, section: cls.sections?.[0] || '', day, period: +period, span: 1, subjectIds: [], teacherIds: [], room: '', supp: fresh || RT.isOff(classId, day) };
    const subs = RT.subs(cur), tchs = RT.tchs(cur), maxN = RT.plan(classId, day).periods.length;
    const subList = [...new Set([...DB.classSubjects(classId).map(s => s.id), ...subs])];
    const tList = [...new Set([...DB.teachersIn(campus).map(t => t.id), ...tchs])].map(id => DB.teacher(id)).filter(Boolean);
    const rooms = [...new Set([...DB.rooms(campus), ...set.filter(r => r.room && DB.campusOf(r.classId) === campus).map(r => r.room)])];
    const box = 'max-h-56 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1';
    Modal.open({
      title: fresh ? `${cls.name} · সাপ্লিমেন্টারি ক্লাস` : `${cls.name} · ${U.dayBn(day)} · পিরিয়ড ${bnNum(period)}`, size: 'sm',
      body: `${!fresh && (App.ui.rtSes || DB.session()) === DB.session() ? `<div class="flex gap-2 mb-3"><button type="button" class="btn btn-primary btn-sm">নিয়মিত রুটিন</button><button type="button" class="btn btn-ghost btn-sm" onclick="RT.ovCell('${classId}',${+period},App.ui.rtDate||RT.nextDate('${day}'))">${icon('calendar-clock')} সাময়িক পরিবর্তন</button></div>` : ''}<form id="slot-form" class="space-y-3">
        <div><div class="label">বিষয়</div><div class="${box}">${subList.map(id => `<label class="flex items-center gap-2"><input type="checkbox" class="w-5 h-5" name="sub" value="${esc(id)}" ${subs.includes(id) ? 'checked' : ''}> ${esc(DB.subject(id)?.name || id)}</label>`).join('') || '<div class="text-slate-500">এই শ্রেণির কোনো বিষয় নেই</div>'}</div></div>
        <div><div class="label">শিক্ষক</div><div class="${box}">${tList.map(t => { const ms = Teacher.mySubjects(classId, t).map(x => DB.subject(x)?.name || x).join(', '); return `<label class="flex items-center gap-2"><input type="checkbox" class="w-5 h-5" name="tch" value="${t.id}" ${tchs.includes(t.id) ? 'checked' : ''}> <span>${esc(pn(DB.user(t.userId)) || t.id)}${ms ? ` <span class="text-slate-500">— ${esc(ms)}</span>` : ''}</span></label>`; }).join('')}</div></div>
        ${fresh ? `<div><label class="label" for="slot-period">পিরিয়ড</label><select class="select" id="slot-period" name="period">${RT.plan(classId, null).periods.map(p => `<option value="${p.n}">পিরিয়ড ${bnNum(p.n)}${p.start ? ' · ' + U.bn(p.start) : ''}</option>`).join('')}</select></div>` : ''}
        <div class="grid grid-cols-2 gap-3">
          <div><label class="label" for="slot-room">কক্ষ</label><input class="input" id="slot-room" name="room" list="slot-rooms" maxlength="40" value="${esc(cur.room || '')}"><datalist id="slot-rooms">${rooms.map(r => `<option value="${esc(r)}">`).join('')}</datalist></div>
          <div><label class="label" for="slot-span">পিরিয়ড সংখ্যা</label><select class="select" id="slot-span" name="span">${Array.from({ length: Math.max(1, maxN - +period + 1) }, (_, i) => i + 1).map(n => `<option value="${n}" ${n === RT.span(cur) ? 'selected' : ''}>${bnNum(n)}${n > 1 ? ` (পিরিয়ড ${bnNum(+period)}–${bnNum(+period + n - 1)})` : ''}</option>`).join('')}</select></div>
        </div>
        <label class="flex items-center gap-2"><input type="checkbox" class="w-5 h-5" name="supp" ${cur.supp ? 'checked' : ''}> সাপ্লিমেন্টারি ক্লাস</label>
        <div><label class="label" for="slot-date">নির্দিষ্ট তারিখ (ঐচ্ছিক)</label><input type="date" class="input" id="slot-date" name="date" value="${esc(cur.date || '')}"></div>
        <div id="slot-brk" class="space-y-2"></div>
        <div id="slot-conf"></div>
        <div class="flex gap-2">${found ? '<button type="button" class="btn btn-ghost" id="slot-clear">খালি পিরিয়ড</button>' : ''}<button class="btn btn-primary flex-1" id="slot-save">পিরিয়ড সংরক্ষণ করুন</button></div></form>`,
    });
    const f = $('#slot-form');
    const read = () => {
      const date = f.date.value || '';
      return { subjectIds: $$('#slot-form [name=sub]:checked').map(i => i.value), teacherIds: $$('#slot-form [name=tch]:checked').map(i => i.value), room: f.room.value.trim(), span: +f.span.value || 1, supp: f.supp.checked, date, day: date ? U.dayName(date) : day, period: f.period ? +f.period.value : +period, brk: f.brk ? f.brk.value : '', intoBreak: !!(f.intoBreak && f.intoBreak.checked) };
    };
    const check = () => {
      const v = read(), c = RT.clashes({ ...cur, ...v, teacherId: v.teacherIds[0], subjectId: v.subjectIds[0] }, cur.id, set);
      $('#slot-conf').innerHTML = c.length ? `<div class="card p-3 bg-amber-50 border-amber-300 text-amber-900">${icon('triangle-alert', 'w-4 h-4 inline')} <b>সংঘাতের সতর্কতা</b><ul class="list-disc ml-5 mt-1">${c.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : `<div class="text-emerald-700">${icon('check-circle-2', 'w-4 h-4 inline')} কোনো সংঘাত নেই</div>`;
      App.icons();
    };
    const brkUI = () => {
      const per = f.period ? +f.period.value : +period, sp = +f.span.value || 1, dy = f.date.value ? U.dayName(f.date.value) : day, pl = RT.plan(classId, dy);
      const ins = RT.breaksInside(classId, dy, per, sp), nxt = pl.breaks.find(b => b.after === per + sp - 1 && b.after < pl.periods.length);
      const mode = f.brk ? f.brk.value : RT.brkMode(cur), into = f.intoBreak ? f.intoBreak.checked : !!cur.intoBreak;
      $('#slot-brk').innerHTML = (ins.length ? `<div><label class="label" for="slot-bm">${esc(ins.map(b => b.label).join(', '))}</label><select class="select" id="slot-bm" name="brk"><option value="skip" ${mode !== 'class' ? 'selected' : ''}>বিরতি থাকবে, ক্লাস বিরতির পরে চলবে</option><option value="class" ${mode === 'class' ? 'selected' : ''}>বিরতির সময়েও ক্লাস</option></select></div>` : '')
        + (nxt ? `<label class="flex items-center gap-2"><input type="checkbox" class="w-5 h-5" name="intoBreak" ${into ? 'checked' : ''}> ${esc(nxt.label)}-এর সময়েও ক্লাস চলবে</label>` : '');
    };
    brkUI();
    f.addEventListener('change', e => { if (['span', 'period', 'date'].includes(e.target.name)) brkUI(); check(); }); f.addEventListener('input', e => { if (e.target.name === 'room') check(); }); check();
    f.addEventListener('submit', e => {
      e.preventDefault(); const v = read();
      if (!v.subjectIds.length) return toast('অন্তত একটি বিষয় নির্বাচন করুন।', 'error');
      if (!v.teacherIds.length) return toast('অন্তত একজন শিক্ষক নির্বাচন করুন।', 'error');
      if (fresh && !v.date) return toast('সাপ্লিমেন্টারি ক্লাসের তারিখ দিন।', 'error');
      if (v.date && v.period > RT.plan(classId, v.day).periods.length) return toast('ওই দিনের সময়সূচিতে এই পিরিয়ড নেই।', 'error');
      const rec = { ...cur, ...v, subjectId: v.subjectIds[0], teacherId: v.teacherIds[0] };
      if (!rec.date) delete rec.date;
      if (!rec.supp) delete rec.supp;
      if (rec.brk !== 'class' || !RT.breaksInside(classId, rec.day, rec.period, RT.span(rec)).length) delete rec.brk;
      if (!rec.intoBreak) delete rec.intoBreak;
      const clash = RT.clashes(rec, cur.id, set);
      if (found) Object.keys(found).forEach(k => { if (!(k in rec)) delete found[k]; });
      if (found) Object.assign(found, rec); else set.push(Object.assign({ id: DB.id('RT') }, rec));
      const me = found || set[set.length - 1];
      // a multi-period class takes over the periods it now covers in the same row
      let merged = 0;
      for (let i = set.length - 1; i >= 0; i--) { const r = set[i]; if (r !== me && r.classId === classId && r.day === me.day && (r.date || '') === (me.date || '') && +r.period > +me.period && +r.period < +me.period + RT.span(me)) { set.splice(i, 1); merged++; } }
      DB.audit('ROUTINE_EDIT', 'routine', `[${ses}] ${classId} ${me.day}${me.date ? ' ' + me.date : ''} P${me.period}${RT.span(me) > 1 ? '–' + (+me.period + RT.span(me) - 1) : ''} → ${v.subjectIds.join('+')} / ${v.teacherIds.map(t => DB.teacherName(t)).join('+')}${v.room ? ' / ' + v.room : ''}${merged ? ` (${merged}টি পিরিয়ড একীভূত)` : ''}`); DB.save();
      Modal.close(); toast(clash.length ? `পিরিয়ড সংরক্ষিত হয়েছে — ${bnNum(clash.length)}টি সংঘাত রয়েছে।` : 'পিরিয়ড সংরক্ষিত হয়েছে।', clash.length ? 'warn' : 'success'); App.refresh();
    });
    $('#slot-clear')?.addEventListener('click', () => { const i = set.indexOf(found); if (i >= 0) set.splice(i, 1); DB.audit('ROUTINE_EDIT', 'routine', `${classId} ${found.day}${found.date ? ' ' + found.date : ''} P${found.period} খালি করা হয়েছে`); DB.save(); Modal.close(); App.refresh(); });
  },
});

(() => {
  const page = App.portals.principal.pages.find(p => p.id === 'routine');
  if (!page) return;
  page.render = function () {
    const campusClasses = DB.classesIn();
    if (!campusClasses.length) return pageHeader('রুটিন প্রস্তুতকারী', '') + `<div class="card p-6">${emptyState('রুটিন তৈরির আগে এই ক্যাম্পাসে শ্রেণি যোগ করুন।', 'calendar-range')}<div class="text-center"><button class="btn btn-primary" onclick="App.ui.setTab='structure';App.go(App.route.portal,'settings')">${icon('plus')} প্রথম শ্রেণি যোগ করুন</button></div></div>`;
    const cls = campusClasses.some(c => c.id === App.ui.rtCls) ? App.ui.rtCls : campusClasses[campusClasses.length - 1].id;
    if (App.ui.rtVer && App.ui.rtVer !== 'BASE' && !RT.ver(App.ui.rtVer)) App.ui.rtVer = 'BASE';
    const ses = App.ui.rtSes || DB.session(), set = RT.editSet(), vid = ses === DB.session() ? (App.ui.rtVer || 'BASE') : 'BASE';
    const { list, ids } = RT.allClashes(set.filter(r => DB.campusOf(r.classId) === DB.campusId()));
    const msgs = [...new Set(list.map(x => x.msg))];
    return pageHeader('রুটিন প্রস্তুতকারী', '', `<select class="select !w-auto" aria-label="শিক্ষাবর্ষ" onchange="App.ui.rtSes=this.value;App.refresh()">${sessionOptions(ses)}</select><button class="btn btn-ghost" onclick="RT.printMenu('${cls}','${esc(ses)}','${vid}')">${icon('printer')} মুদ্রণ</button><a class="btn btn-ghost" href="${App.href(App.route.portal === 'admin' ? 'admin' : 'principal', 'clone')}">${icon('copy')} কপি করুন</a>`)
      + RT.toolbar(cls, ses)
      + (ses !== DB.session() ? `<div class="card p-3 mb-3 bg-blue-50 border-blue-200 text-blue-800">${icon('info', 'w-4 h-4 inline')} এডিট চলছে: <b>${esc(U.bn(ses))}</b> খসড়া সময়সূচি (${bnNum(set.length)}টি পিরিয়ড)।</div>` : '')
      + RT.cfgCard(cls)
      + (App.ui.rtDate && ses === DB.session() ? RT.dateView(App.ui.rtDate) : '')
      + (msgs.length ? `<details class="card p-3 mb-4 bg-amber-50 border-amber-300 text-amber-900"><summary class="cursor-pointer font-semibold">${icon('triangle-alert', 'w-4 h-4 inline')} ${bnNum(msgs.length)}টি সংঘাতের সতর্কতা</summary><ul class="list-disc ml-5 mt-2 space-y-1">${msgs.slice(0, 40).map(m => `<li>${esc(m)}</li>`).join('')}</ul></details>`
        : `<div class="card p-3 mb-4 flex items-center gap-2 bg-emerald-50 border-emerald-200 text-emerald-800">${icon('shield-check')} শিক্ষক বা কক্ষের কোনো সংঘাত নেই</div>`)
      + `<div class="card scroll-x p-2">${RT.grid(cls, { set, edit: true, bad: ids })}</div>`
      + RT.datedList(cls, { set, edit: true, bad: ids })
      + `<div class="mt-3"><button class="btn btn-ghost" onclick="Principal.editSlot('${cls}','${RT.D7.find(d => RT.isOff(cls, d)) || 'Fri'}',1,'new')">${icon('calendar-plus')} সাপ্লিমেন্টারি ক্লাস যোগ করুন</button></div>`
      + (ses === DB.session() ? RT.ovList() : '');
  };
})();
