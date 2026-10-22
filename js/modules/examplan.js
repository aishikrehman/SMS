/* ==========================================================================
   EXAM PLANNING & RESULTS — the staff "পরীক্ষা ও ফলাফল" menu
   · পরীক্ষাসমূহ: exam list & setup, routine builder (date → time → classes / section → subjects → room)
     with clash detection, an automatic routine generator and invigilation duty (auto-assign, roster prints,
     duties on the teacher's "আমার দিন"); মানবণ্টন; printable sheets.
   · প্রশ্নব্যাংক · অনলাইন পরীক্ষা · প্রশ্নপত্র ও সমাধান (with OMR answer keys) · হাজিরা · ওএমআর
   · ফলাফল: gradebook, results, bulk entry (grid / one CSV), publishing & marksheet settings, re-check queue.
   · Class attendance on exam days (exam.dayAtt, default school.examDayAtt): 'exam' = the exam attendance is
     that day's class attendance (default) · 'off' = no class attendance, not a working day · 'normal'.
   Load after examops.js.
   ========================================================================== */

DB.addSeeder('recheckReqs', () => []);

/* Shared spreadsheet look (routine builder, marks grid): full borders, zebra rows, header colour bands,
   read-only / computed tints, selection colours — light and dark (html[data-mode="dark"]). */
const XG_CSS = `.xg-wrap{overflow:auto;max-width:100%;border:1px solid var(--xg-bd);border-radius:.6rem;background:var(--xg-bg)}
.xg{--xg-bd:#e2e8f0;--xg-bd2:#cbd5e1;--xg-bg:#fff;--xg-z:#fafbfc;--xg-tx:#0f172a;--xg-mut:#64748b;--xg-h:#f8fafc;--xg-ro:#f8fafc;--xg-calc:#f8fafc;--xg-merge:#fff;--xg-sel:#eff6ff;--xg-selb:#2563eb;--xg-chip:#f1f5f9;--xg-bad:#fee2e2;--xg-ab:#fef3c7;
  border-collapse:separate;border-spacing:0;color:var(--xg-tx);background:var(--xg-bg);font-size:1rem}
html[data-mode="dark"] .xg{--xg-bd:#273449;--xg-bd2:#334155;--xg-bg:#0f172a;--xg-z:#111a2d;--xg-tx:#e2e8f0;--xg-mut:#94a3b8;--xg-h:#151f33;--xg-ro:#131c2e;--xg-calc:#131c2e;--xg-merge:#0f172a;--xg-sel:#172554;--xg-selb:#60a5fa;--xg-chip:#1e293b;--xg-bad:#4c1d1d;--xg-ab:#4a3a10}
.xg th,.xg td{border-right:1px solid var(--xg-bd);border-bottom:1px solid var(--xg-bd);padding:.3rem .45rem;white-space:nowrap}
.xg tr>:first-child{border-left:1px solid var(--xg-bd)}.xg thead tr:first-child th{border-top:1px solid var(--xg-bd)}
.xg thead th{position:sticky;top:0;z-index:3;font-weight:600;text-align:center;background:var(--xg-h);color:var(--xg-tx);border-bottom-color:var(--xg-bd2)}
.xg tbody tr:nth-child(even)>td{background:var(--xg-z)}
.xg .xg-gs,.xg [data-gs]{border-left:2px solid var(--xg-bd2) !important}
/* editable affordance: a hover border; while editing a clear field with a focus ring */
.xg-edit{border:1px solid transparent;border-radius:.3rem;background:transparent;color:inherit;font:inherit;padding:.15rem .3rem;width:100%;min-width:0;transition:border-color .1s}
.xg-edit:hover{border-color:var(--xg-bd2)}.xg-edit:focus{border-color:var(--xg-selb);background:var(--xg-bg);box-shadow:0 0 0 3px rgba(37,99,235,.18);outline:none}
select.xg-edit{-webkit-appearance:none;appearance:none;padding-right:1.2rem;background-image:linear-gradient(45deg,transparent 50%,var(--xg-mut) 50%),linear-gradient(135deg,var(--xg-mut) 50%,transparent 50%);background-position:calc(100% - .65rem) 55%,calc(100% - .4rem) 55%;background-size:.25rem .25rem;background-repeat:no-repeat;cursor:pointer}`;

/* ---------- exam days ---------- */
Object.assign(DB, {
  /** date → routine rows of every exam on that date (cached briefly). */
  _exDays() {
    const c = this._xc ? this._xc() : {}; if (c.exDays) return c.exDays;
    const m = new Map(); (this.s.exams || []).forEach(ex => (ex.schedule || []).forEach(r => { if (!m.has(r.date)) m.set(r.date, []); m.get(r.date).push({ ex, r }); }));
    return (c.exDays = m);
  },
  /** Class-attendance mode when a class (section, shift) sits an exam paper on that date; null on other days.
      A routine row without section / shift covers every section / shift of its classes. */
  examDayMode(classId, section, date, shift) {
    const list = this._exDays().get(date); if (!list) return null;
    const hit = list.find(({ ex, r }) => (r.classIds?.length ? r.classIds.includes(classId) : this.examTakes(ex, classId)) && (!r.section || !section || r.section === section) && (!r.shift || !shift || r.shift === shift));
    return hit ? (hit.ex.dayAtt || this.s.school?.examDayAtt || 'exam') : null;
  },
  /** Is the date an "off" exam day for this student (no class attendance, not a working day)? */
  examOffFor(st, date) { return !!st && this.examDayMode(st.classId, st.section, date, st.shift || this.cls(st.classId)?.shift || '') === 'off'; },
  /** Is the date an "off" exam day for the whole class (every section sits)? */
  classOffDay(classId, date) { const c = this.cls(classId); if (!c || !this._exDays().has(date)) return false; const secs = c.sections?.length ? c.sections : ['']; return secs.every(s => this.examDayMode(classId, s, date, c.shift || '') === 'off'); },
});
const DAYATT = [['exam', 'পরীক্ষার হাজিরাই সেদিনের শ্রেণি-হাজিরা'], ['off', 'শ্রেণি-হাজিরা নেই (কর্মদিবস নয়)'], ['normal', 'স্বাভাবিক শ্রেণি-হাজিরা']];

/* The daily register: no class attendance on 'off' exam days; on 'exam' days it comes from the exam attendance. */
(() => {
  const s0 = Teacher.saveRegister.bind(Teacher);
  Teacher.saveRegister = function () {
    const ui = App.ui.att, mode = ui ? DB.examDayMode(ui.cls, null, ui.date) : null;
    if (mode === 'off') return toast('আজ এই শ্রেণির পরীক্ষা — পরীক্ষার দিনে শ্রেণি-হাজিরা নেওয়া হয় না।', 'warn');
    if (mode === 'exam') return toast('আজ এই শ্রেণির পরীক্ষা — পরীক্ষার হাজিরাই সেদিনের শ্রেণি-হাজিরা হিসেবে গণ্য হবে।', 'warn');
    return s0();
  };
  // exam attendance saved → that day's class attendance (mode 'exam'; an excused day stays excused)
  const x0 = XA.save.bind(XA);
  XA.save = function () {
    const { ui, ex, slot } = this.st(); x0();
    if (!slot) return;
    let n = 0;
    this.rows().filter(r => r.examId === ex.id && r.subjectId === slot.subjectId && r.date === slot.date).forEach(r => {
      const st = DB.student(r.studentId); if (!st || DB.examDayMode(st.classId, st.section, slot.date, st.shift || DB.cls(st.classId)?.shift || '') !== 'exam') return;
      const rec = DB.s.attendance[st.id] || (DB.s.attendance[st.id] = {});
      if (rec[slot.date] === 'E') return;
      // present in any paper that day = present
      const day = this.rows().filter(x => x.studentId === st.id && x.date === slot.date);
      rec[slot.date] = day.some(x => x.status === 'P') ? 'P' : 'A'; n++;
    });
    if (n) { DB.audit('ATTENDANCE_FROM_EXAM', 'attendance', `${ex.id} · ${slot.date} · ${ui.cls}: ${n} জন`); DB.save(); }
  };
})();

/* ==========================================================================
   ROUTINE BUILDER, CLASH CHECK, GENERATOR, INVIGILATION
   ========================================================================== */
const RB = {
  uid() { this._n = (this._n || 0) + 1; return 'e' + Date.now().toString(36) + this._n.toString(36) + Math.random().toString(36).slice(2, 6); },
  /** Routine rows → entries (rows saved together share `eid`). */
  entries(ex) {
    const m = new Map();
    (ex.schedule || []).forEach((r, i) => {
      const id = r.eid || `r${i}`;
      if (!m.has(id)) m.set(id, { eid: id, date: r.date, start: r.start || '10:00', end: r.end || '13:00', classIds: [...(r.classIds || [])], section: r.section || '', shift: r.shift || '', subjectIds: [], room: r.room || '', invig: [...(r.invig || [])] });
      m.get(id).subjectIds.push(r.subjectId);
    });
    return [...m.values()].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  },
  flatten(rows) {
    return rows.filter(e => e.date && e.subjectIds.length).flatMap(e => e.subjectIds.map(s => ({ date: e.date, start: e.start, end: e.end, subjectId: s, room: e.room || '', eid: e.eid, ...(e.classIds.length ? { classIds: [...e.classIds] } : {}), ...(e.section ? { section: e.section } : {}), ...(e.shift ? { shift: e.shift } : {}), ...(e.invig.length ? { invig: [...e.invig] } : {}) })))
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  },
  d() { return App.ui.rb; },
  ex() { return DB.exam(this.d()?.examId); },
  open(examId) {
    const ex = DB.exam(examId); if (!ex) return;
    App.ui.rb = { examId, rows: this.entries(ex), gen: null, per: 1 };
    App.openDetail({ title: `পরীক্ষার রুটিন ও দায়িত্ব · ${ex.name}`, render: () => this.html(), mount: () => App.icons() });
  },
  classes(e) { const ex = this.ex(); return e.classIds.length ? e.classIds : DB.examClasses(ex).filter(c => c.campusId === DB.campusId()).map(c => c.id); },
  /** Students sitting an entry: its classes (section) × anyone taking at least one of its subjects. */
  students(e, subjectIds = e.subjectIds) {
    return this.classes(e).flatMap(c => DB.studentsIn(c).filter(s => (!e.section || s.section === e.section) && (!e.shift || (s.shift || DB.cls(c)?.shift || '') === e.shift) && subjectIds.some(sid => typeof SubjectSets === 'undefined' || SubjectSets.takes(s.id, sid))));
  },
  /** Clashes: the same students sitting two papers at once (in one row or two), a room booked twice, an
      invigilator in two places. The same class at the same time with no student in common (groups,
      electives) is only an informational note ({ info: true }). */
  clashes(rows) {
    const out = [], ex = this.ex(), over = (a, b) => a.date === b.date && a.start < b.end && b.start < a.end;
    const name = e => `${U.fmtDate(e.date)} ${U.bn(e.start)}`;
    rows.forEach((a, i) => {
      if (a.subjectIds.length > 1) {
        const both = this.students(a).filter(s => a.subjectIds.filter(sid => typeof SubjectSets === 'undefined' || SubjectSets.takes(s.id, sid)).length > 1);
        if (both.length) out.push({ i: [i], kind: 'একই শিক্ষার্থী', text: `${name(a)} — ${bnNum(both.length)} জন শিক্ষার্থী একই সময়ে একাধিক বিষয়ের পরীক্ষার্থী` });      }
      rows.slice(i + 1).forEach((b, k) => {
        const j = i + 1 + k; if (!over(a, b)) return;
        const shared = this.classes(a).filter(c => this.classes(b).includes(c)), secOk = (a.section && b.section && a.section !== b.section) || (a.shift && b.shift && a.shift !== b.shift);
        if (shared.length && !secOk) {
          const sa = new Set(this.students(a).map(s => s.id)), common = this.students(b).filter(s => sa.has(s.id));
          const where = `${shared.map(c => DB.className(c)).join(', ')}${a.section || b.section ? '-' + (a.section || b.section) : ''}`;
          // the same students in two papers at once = a real conflict; the same class with disjoint groups / electives is normal
          if (common.length) out.push({ i: [i, j], kind: 'একই শিক্ষার্থী', text: `${name(a)} — ${where}: ${bnNum(common.length)} জন শিক্ষার্থী একই সময়ে দুটি পত্রে` });
          else out.push({ i: [i, j], info: true, kind: 'একই শ্রেণি', text: `${name(a)} — ${where} একই সময়ে দুটি সারিতে` });
        }
        if (a.room && b.room && a.room.trim() === b.room.trim()) out.push({ i: [i, j], kind: 'কক্ষ', text: `${name(a)} — কক্ষ ${U.bn(a.room)} দুবার বরাদ্দ` });
        const t = a.invig.filter(x => b.invig.includes(x));
        if (t.length) out.push({ i: [i, j], kind: 'পরিদর্শক', text: `${name(a)} — ${t.map(x => DB.teacherName(x)).join(', ')} একই সময়ে দুই জায়গায়` });
      });
    });
    void ex; return out;
  },
  /** Real conflicts only (informational notes left out). */
  conflicts(rows) { return this.clashes(rows).filter(c => !c.info);
  },
  /* ---------- editor ---------- */
  /* One table; consecutive rows with the same date, then time, then class / section are merged (rowspan).
     Editing a merged cell changes every row it covers. */
  clsKey(e) { return `${[...e.classIds].sort().join(',')}|${e.section || ''}|${e.shift || ''}`; },
  sortRows() { const r = this.d().rows; r.sort((a, b) => (a.date + a.start + a.end).localeCompare(b.date + b.start + b.end) || this.clsKey(a).localeCompare(this.clsKey(b))); return r; },
  same(a, b, level) { return a.date === b.date && (level === 'date' || (a.start === b.start && a.end === b.end && (level === 'time' || this.clsKey(a) === this.clsKey(b)))); },
  group(i, level) { const r = this.d().rows, e = r[i]; return level === 'row' ? [e] : r.filter(x => this.same(x, e, level)); },
  /** rowspan of row i at a level (0 = covered by the row above). */
  span(i, level) { const r = this.d().rows; if (i > 0 && this.same(r[i - 1], r[i], level)) return 0; let n = 1; while (i + n < r.length && this.same(r[i + n], r[i], level)) n++; return n; },
  set(i, k, v, level = 'row') { this.group(i, level).forEach(e => { e[k] = v; if (k === 'classIds') { const secs = this.secsOf(e); if (!secs.includes(e.section)) e.section = ''; } }); App.refresh(); },
  blank(date, start, end) { return { eid: this.uid(), date, start, end, classIds: [], section: '', shift: '', subjectIds: [], room: '', invig: [] }; },
  /** Another row at the same date and time (another class / subject sitting together). */
  add(i) { const r = this.d().rows, base = i === undefined ? r[r.length - 1] : r[i]; r.push(this.blank(base?.date || this.ex().start, base?.start || '10:00', base?.end || '13:00')); App.refresh(); },
  /** A new time slot on the same date: starts 30 minutes after the date's last paper ends. */
  addTime(i) {
    const r = this.d().rows, d = r[i].date, last = r.filter(x => x.date === d).map(x => x.end).sort().pop() || '10:00';
    const m = t => { const [h, mm] = t.split(':').map(Number); return h * 60 + mm; }, f = v => `${String(Math.floor(v / 60) % 24).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
    const s = Math.min(m(last) + 30, 22 * 60), dur = Math.max(30, m(r[i].end) - m(r[i].start));
    r.push(this.blank(d, f(s), f(Math.min(s + dur, 23 * 60 + 59)))); App.refresh();
  },
  /** A new date: the next working day after the last date in the routine, with the first slot's times. */
  addDate() {
    const r = this.d().rows, last = r.map(x => x.date).sort().pop() || this.ex().start, first = r[0];
    let d = U.addDays(last, r.length ? 1 : 0); for (let k = 0; k < 14 && !U.isSchoolDay(d, null, DB.campusId()); k++) d = U.addDays(d, 1);
    r.push(this.blank(U.iso(d), first?.start || '10:00', first?.end || '13:00')); App.refresh();
  },
  del(i) { this.d().rows.splice(i, 1); App.refresh(); },
  secsOf(e) { return [...new Set(this.classes(e).flatMap(c => DB.cls(c)?.sections || []))]; },
  teachers() { return DB.s.teachers.filter(t => t.status !== 'Resigned' && (!t.campusId || t.campusId === DB.campusId())); },
  /** Choices of a multi-value cell: [value, label]. */
  items(i, k) {
    const e = this.d().rows[i], ex = this.ex();
    if (k === 'classIds') return DB.examClasses(ex).filter(c => c.campusId === DB.campusId()).map(c => [c.id, DB.className(c.id)]);
    if (k === 'invig') return this.teachers().map(t => [t.id, DB.teacherName(t.id)]);
    return Exams.examSubjectIds(ex).filter(s => this.classes(e).some(c => DB.examTakes(ex, c, s))).map(s => [s, DB.subject(s)?.name || s]);
  },
  /** In-cell multi-select: chips (× removes) plus a borderless typeahead with the remaining choices. */
  chips(i, k, list, level, empty) {
    const all = this.items(i, k), name = v => (all.find(x => x[0] === v) || [v, k === 'invig' ? DB.teacherName(v) : DB.className(v)])[1], rest = all.filter(([v]) => !list.includes(v)), lid = `rb-dl-${i}-${k}`;
    const lab = { classIds: 'শ্রেণি', subjectIds: 'বিষয়', invig: 'পরিদর্শক' }[k];
    return `<div class="rb-multi">${list.map(v => `<span class="rb-chip">${esc(name(v))}<button type="button" aria-label="${esc(name(v))} বাদ দিন" onclick="RB.rm(${i},'${k}','${v}','${level}')">×</button></span>`).join('')}<input class="rb-ta" list="${lid}" placeholder="${list.length ? '+' : esc(empty)}" aria-label="${lab} যোগ" onchange="RB.addBy(${i},'${k}',this.value,'${level}')"><datalist id="${lid}">${rest.map(([, l]) => `<option value="${esc(l)}">`).join('')}</datalist></div>`;
  },
  addBy(i, k, label, level) { const it = this.items(i, k).find(([, l]) => l === String(label).trim()); if (!it) return App.refresh(); const e = this.d().rows[i]; this.set(i, k, [...new Set([...e[k], it[0]])], level); },
  rm(i, k, v, level) { const e = this.d().rows[i]; this.set(i, k, e[k].filter(x => x !== v), level); },
  html() {
    const D = this.d(), ex = this.ex(); if (!D || !ex) return '';
    const rows = this.sortRows(), all = this.clashes(rows), cl = all.filter(c => !c.info), notes = all.filter(c => c.info), bad = new Set(cl.flatMap(c => c.i));
    const rooms = Object.values(DB.s.rooms || {}).flat(), shifts = DB.s.school.shifts || [];
    // section / shift columns only when the classes have more than one, a row uses them, or they were switched on
    const exClasses = DB.examClasses(ex).filter(c => c.campusId === DB.campusId());
    const showSec = D.showSec ?? (exClasses.some(c => (c.sections || []).length > 1) || rows.some(r => r.section));
    const showShift = shifts.length > 0 && (D.showShift ?? (new Set(exClasses.map(c => c.shift || '')).size > 1 || rows.some(r => r.shift)));
    this._cols = { showSec, showShift };
    const body = rows.map((e, i) => {
      const sd = this.span(i, 'date'), stt = this.span(i, 'time'), sc = this.span(i, 'cls'), secs = this.secsOf(e);
      return `<tr class="${bad.has(i) ? 'rb-bad' : ''}">
        ${sd ? `<td rowspan="${sd}" class="rb-c rb-m"><input type="date" class="rb-in xg-edit" value="${e.date}" aria-label="তারিখ" onchange="RB.set(${i},'date',this.value,'date')"><div class="rb-sub">${U.dayBn(new Date(e.date))}</div><div class="rb-dact"><button type="button" onclick="RB.addTime(${i})">+ এই তারিখে নতুন সময়</button></div></td>` : ''}
        ${stt ? `<td rowspan="${stt}" class="rb-c rb-m"><input type="time" class="rb-in xg-edit" value="${e.start}" aria-label="শুরু" onchange="RB.set(${i},'start',this.value,'time')"><input type="time" class="rb-in xg-edit" value="${e.end}" aria-label="শেষ" onchange="RB.set(${i},'end',this.value,'time')"></td>` : ''}
        ${sc ? `<td rowspan="${sc}" class="rb-c rb-m">${this.chips(i, 'classIds', e.classIds, 'cls', 'সকল শ্রেণি')}</td>
          ${showSec ? `<td rowspan="${sc}" class="rb-c rb-m"><select class="rb-in xg-edit" aria-label="শাখা" onchange="RB.set(${i},'section',this.value,'cls')"><option value="">সব</option>${secs.map(s => `<option ${s === e.section ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></td>` : ''}
          ${showShift ? `<td rowspan="${sc}" class="rb-c rb-m"><select class="rb-in xg-edit" aria-label="শিফট" onchange="RB.set(${i},'shift',this.value,'cls')"><option value="">সব</option>${shifts.map(s => `<option value="${esc(s.id)}" ${s.id === e.shift ? 'selected' : ''}>${esc(bn(s.name || s.id))}</option>`).join('')}</select></td>` : ''}` : ''}
        <td class="rb-c">${this.chips(i, 'subjectIds', e.subjectIds, 'row', 'বিষয়')}<div class="rb-sub">${bnNum(this.students(e).length)} জন</div></td>
        <td class="rb-c rb-room"><input class="rb-in xg-edit" list="rb-rooms" value="${esc(e.room)}" aria-label="কক্ষ" onchange="RB.set(${i},'room',this.value.trim())"></td>
        <td class="rb-c">${this.chips(i, 'invig', e.invig, 'row', 'পরিদর্শক')}</td>
        <td class="rb-c rb-act"><button type="button" class="rb-ib" title="একই সময়ে আরেকটি সারি" aria-label="একই সময়ে আরেকটি সারি" onclick="RB.add(${i})">${icon('copy-plus', 'w-4 h-4')}</button><button type="button" class="rb-ib text-red-600" title="মুছুন" aria-label="মুছুন" onclick="RB.del(${i})">${icon('trash-2', 'w-4 h-4')}</button></td></tr>`;
    }).join('');
    const tools = `<div class="card p-4 mb-4 flex flex-wrap items-end gap-2">
      <div class="min-w-0"><label class="label" for="rb-att">পরীক্ষার দিনে শ্রেণি-হাজিরা</label><select id="rb-att" class="select" onchange="RB.dayAtt(this.value)"><option value="">প্রতিষ্ঠানের ডিফল্ট (${esc((DAYATT.find(x => x[0] === (DB.s.school.examDayAtt || 'exam')) || DAYATT[0])[1])})</option>${DAYATT.map(([k, l]) => `<option value="${k}" ${ex.dayAtt === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <span class="flex-1"></span><button type="button" class="btn btn-ghost" onclick="RB.genForm()">${icon('wand-sparkles')} স্বয়ংক্রিয় রুটিন</button>
      <div class="w-28"><label class="label" for="rb-per">সারিপ্রতি পরিদর্শক</label><input id="rb-per" class="input" type="number" min="1" max="5" value="${D.per}" onchange="RB.d().per=Math.max(1,+this.value||1)"></div>
      <button type="button" class="btn btn-ghost" onclick="RB.autoInvig()">${icon('users')} দায়িত্ব স্বয়ংক্রিয় বণ্টন</button></div>`;
    const clash = cl.length ? `<div class="card p-4 mb-4 border-red-200 bg-red-50"><div class="font-semibold text-red-700 mb-1">${icon('triangle-alert', 'w-4 h-4 inline')} সংঘাত ${bnNum(cl.length)}টি</div><ul class="space-y-1">${cl.map(c => `<li>${badge(c.kind, 'red')} ${esc(c.text)}</li>`).join('')}</ul></div>` : (rows.length ? `<div class="card p-3 mb-4 text-emerald-700">${icon('circle-check', 'w-4 h-4 inline')} কোনো সংঘাত নেই</div>` : '');
    const info = notes.length ? `<details class="mb-4 text-sm text-slate-500"><summary class="cursor-pointer">${icon('info', 'w-4 h-4 inline')} একই সময়ে একাধিক পত্র ${bnNum(notes.length)}টি</summary><ul class="mt-1 ml-5 space-y-0.5">${notes.map(c => `<li>${badge(c.kind, 'slate')} ${esc(c.text)}</li>`).join('')}</ul></details>` : '';
    const css = `<style>${XG_CSS}
      .rb-t{min-width:${44 + (showSec ? 6 : 0) + (showShift ? 7 : 0)}rem}.rb-c{vertical-align:middle}.xg tbody tr>td.rb-m{background:var(--xg-merge)}
      .rb-in{display:block}select.rb-in{max-width:7.5rem}.rb-sub{color:var(--xg-mut);padding:0 .3rem}
      .rb-multi{display:flex;flex-wrap:wrap;gap:.2rem;align-items:center;max-width:16rem}.rb-chip{display:inline-flex;align-items:center;gap:.1rem;max-width:10rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:var(--xg-chip);color:var(--xg-tx);border:1px solid var(--xg-bd);border-radius:.3rem;padding:0 .1rem 0 .4rem;line-height:1.6}.rb-chip button{border:0;background:none;color:var(--xg-mut);cursor:pointer;padding:0 .3rem;font-size:1rem;line-height:1}
      .rb-ta{flex:1 1 5rem;min-width:5rem;border:1px dashed var(--xg-bd2);border-radius:.3rem;background:transparent;color:inherit;font:inherit;padding:.1rem .3rem}.rb-ta:hover{border-color:var(--xg-mut)}.rb-ta:focus{border:1px solid var(--xg-selb);box-shadow:0 0 0 3px rgba(37,99,235,.18);outline:none;background:var(--xg-bg)}
      .rb-dact{display:flex;flex-direction:column;gap:.15rem;margin-top:.3rem}.rb-dact button{border:0;background:none;color:var(--xg-selb);cursor:pointer;font:inherit;text-align:left;padding:0}
      .rb-room{min-width:6.5rem}.rb-act{white-space:nowrap;width:4.5rem}.rb-ib{border:0;background:none;padding:.25rem;cursor:pointer;color:var(--xg-mut)}.rb-bad td{background:var(--xg-bad) !important}</style>`;
    const colTog = `<div class="flex flex-wrap items-center gap-3 mb-2"><label class="flex items-center gap-2"><input type="checkbox" class="w-5 h-5" ${showSec ? 'checked' : ''} onchange="RB.d().showSec=this.checked;App.refresh()"> শাখা কলাম</label>${shifts.length ? `<label class="flex items-center gap-2"><input type="checkbox" class="w-5 h-5" ${showShift ? 'checked' : ''} onchange="RB.d().showShift=this.checked;App.refresh()"> শিফট কলাম</label>` : ''}</div>`;
    return css + (D.gen ? this.genHtml() : '') + tools + clash + info + `<datalist id="rb-rooms">${rooms.map(r => `<option value="${esc(r)}">`).join('')}</datalist>${body ? `${colTog}<div class="xg-wrap mb-4"><table class="xg rb-t"><thead><tr><th class="xg-b0">তারিখ</th><th class="xg-b1">সময়</th><th class="xg-b2">শ্রেণি</th>${showSec ? '<th class="xg-b2">শাখা</th>' : ''}${showShift ? '<th class="xg-b2">শিফট</th>' : ''}<th class="xg-b3">বিষয়</th><th class="xg-b4">কক্ষ</th><th class="xg-b5">পরিদর্শক</th><th></th></tr></thead><tbody>${body}</tbody></table></div>` : `<div class="card p-6 mb-4">${emptyState('রুটিনে কোনো সারি নেই।', 'calendar-x')}</div>`}
      <div class="flex flex-wrap gap-2 sticky bottom-0 bg-[var(--surface)] py-3 border-t border-slate-100"><button type="button" class="btn btn-ghost" onclick="RB.add()">${icon('plus')} সারি যোগ</button><button type="button" class="btn btn-ghost" onclick="RB.addDate()">${icon('calendar-plus')} নতুন তারিখ</button><label class="flex items-center gap-2"><input type="checkbox" class="w-5 h-5" id="rb-notify"> অভিভাবকদের এসএমএসে জানান</label><span class="flex-1"></span><button type="button" class="btn btn-ghost" onclick="App.closeDetail()">বাতিল</button><button type="button" class="btn btn-primary" onclick="RB.save()">${icon('save')} রুটিন সংরক্ষণ</button></div>`;
  },
  dayAtt(v) { const ex = this.ex(); if (v) ex.dayAtt = v; else delete ex.dayAtt; DB.audit('EXAM_DAY_ATT', 'exams', `${ex.id} → ${v || 'default'}`); DB.save(); },
  save(force) {
    const D = this.d(), ex = this.ex(), cl = this.conflicts(D.rows);
    if (D.rows.some(e => e.date && !e.subjectIds.length)) return toast('প্রতিটি সারিতে অন্তত একটি বিষয় বাছুন।', 'error');
    if (D.rows.some(e => e.start >= e.end)) return toast('শেষের সময় শুরুর পরে হতে হবে।', 'error');
    if (cl.length && !force && !confirm(`${bnNum(cl.length)}টি সংঘাত আছে। তবুও সংরক্ষণ করবেন?`)) return;
    ex.schedule = this.flatten(D.rows);
    if ($('#rb-notify')?.checked && ex.schedule.length) Principal.audience('Guardians').forEach(u => DB.sms(u.phone, `${DB.s.school.shortName}: ${ex.name} শুরু হবে ${U.fmtDate(ex.schedule[0].date)} তারিখে। পূর্ণ রুটিন পোর্টালে দেখুন।`));
    DB.audit('EXAM_TIMETABLE', 'exams', `${ex.name}: ${D.rows.length}টি সারি, ${ex.schedule.length}টি পত্র${cl.length ? `, সংঘাত ${cl.length}` : ''}`); DB.save();
    toast('রুটিন সংরক্ষিত হয়েছে।', 'success'); App.closeDetail();
  },

  /* ---------- automatic routine ---------- */
  genForm() {
    const ex = this.ex(), cal = DB.s.calendar?.weekends || [5];
    this.d().gen = this.d().gen || { from: ex.start, to: U.iso(U.addDays(ex.start, 20)), off: [...cal], extra: '', slots: '10:00-13:00', classes: DB.examClasses(ex).filter(c => c.campusId === DB.campusId()).map(c => c.id), gap: 1, mode: 'class', rooms: '' };
    App.refresh();
  },
  gf(k, v) { this.d().gen[k] = v; },
  genHtml() {
    const g = this.d().gen, ex = this.ex(), cls = DB.examClasses(ex).filter(c => c.campusId === DB.campusId());
    return `<div class="card p-4 mb-4 space-y-3"><div class="font-semibold">স্বয়ংক্রিয় রুটিন</div><div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <div><label class="label">শুরুর তারিখ</label><input type="date" class="input" value="${g.from}" onchange="RB.gf('from',this.value)"></div>
      <div><label class="label">শেষ তারিখ</label><input type="date" class="input" value="${g.to}" onchange="RB.gf('to',this.value)"></div>
      <div><label class="label">দিনের সময়-স্লট</label><input class="input" value="${esc(g.slots)}" placeholder="10:00-13:00, 14:00-16:00" onchange="RB.gf('slots',this.value)"></div>
      <div><label class="label">একই শ্রেণির দুই পত্রের মাঝে ন্যূনতম বিরতি (দিন)</label><input type="number" min="0" max="5" class="input" value="${g.gap}" onchange="RB.gf('gap',+this.value||0)"></div>
      <div><label class="label">পদ্ধতি</label><select class="select" onchange="RB.gf('mode',this.value);App.refresh()">${[['class', 'শ্রেণিভিত্তিক'], ['section', 'শাখাভিত্তিক'], ['room', 'কক্ষভিত্তিক']].map(([k, l]) => `<option value="${k}" ${g.mode === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="sm:col-span-2"><label class="label">অতিরিক্ত ছুটির তারিখ</label><input class="input" value="${esc(g.extra)}" placeholder="2026-12-16, 2026-12-25" onchange="RB.gf('extra',this.value)"></div>
      ${g.mode === 'room' ? `<div class="sm:col-span-2 lg:col-span-4"><label class="label">কক্ষ ও ধারণক্ষমতা</label><input class="input" value="${esc(g.rooms)}" placeholder="101:40, 201:40, Hall-A:120" onchange="RB.gf('rooms',this.value)"></div>` : ''}</div>
      <div><div class="label">সাপ্তাহিক বন্ধ</div><div class="flex flex-wrap gap-x-4 gap-y-2">${U.DAYS_SHORT.map((d, i) => `<label class="flex items-center gap-2"><input type="checkbox" class="w-5 h-5" ${g.off.includes(i) ? 'checked' : ''} onchange="RB.gOff(${i},this.checked)"> ${d}</label>`).join('')}</div></div>
      <div><div class="label">শ্রেণি</div><div class="flex flex-wrap gap-x-4 gap-y-2">${cls.map(c => `<label class="flex items-center gap-2"><input type="checkbox" class="w-5 h-5" ${g.classes.includes(c.id) ? 'checked' : ''} onchange="RB.gCls('${c.id}',this.checked)"> ${esc(DB.className(c.id))} <span class="text-slate-500">(${bnNum(DB.examSubjects(ex, c.id).length)}টি বিষয়)</span></label>`).join('')}</div></div>
      <div class="flex flex-wrap gap-2 justify-end"><button type="button" class="btn btn-ghost" onclick="RB.d().gen=null;App.refresh()">বন্ধ করুন</button><button type="button" class="btn btn-primary" onclick="RB.generate()">${icon('wand-sparkles')} খসড়া তৈরি করুন</button></div></div>`;
  },
  gOff(i, on) { const g = this.d().gen; g.off = on ? [...new Set([...g.off, i])] : g.off.filter(x => x !== i); },
  gCls(c, on) { const g = this.d().gen; g.classes = on ? [...new Set([...g.classes, c])] : g.classes.filter(x => x !== c); },
  /** Greedy clash-free draft: each unit (class / section) sits at most one paper per slot, at least `gap`
      free days between its papers; in room mode every unit gets a free room big enough for it. */
  plan(ex, g) {
    const slots = String(g.slots).split(/[,\n]+/).map(s => s.trim().match(/^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/)).filter(Boolean).map(m => ({ start: m[1].padStart(5, '0'), end: m[2].padStart(5, '0') }));
    if (!slots.length) return { error: 'সময়-স্লট সঠিক নয় (যেমন 10:00-13:00)' };
    const extra = new Set(String(g.extra).split(/[,\s]+/).map(x => U.asciiDigits(x.trim())).filter(Boolean));
    const days = []; for (let d = U.d(g.from); U.iso(d) <= g.to && days.length < 120; d = U.addDays(d, 1)) { const k = U.iso(d); if (!g.off.includes(d.getDay()) && !extra.has(k) && (!DB.holiday || !DB.holiday(k, DB.campusId()) || DB.holiday(k, DB.campusId()).type === 'Open')) days.push(k); }
    if (!days.length) return { error: 'এই সময়সীমায় কোনো কর্মদিবস নেই' };
    const units = [];
    g.classes.forEach(c => {
      const subs = DB.examSubjects(ex, c).map(s => s.id), secs = DB.cls(c)?.sections || [];
      if (g.mode === 'section' && secs.length > 1) secs.forEach(s => units.push({ classId: c, section: s, queue: [...subs], last: -99, n: DB.studentsIn(c).filter(x => x.section === s).length }));
      else units.push({ classId: c, section: '', queue: [...subs], last: -99, n: DB.studentsIn(c).length });
    });
    const caps = String(g.rooms || '').split(/[,\n]+/).map(x => x.split(':').map(y => y.trim())).filter(p => p[0]).map(([r, c]) => ({ room: r, cap: +U.asciiDigits(c || '') || 9999 })).sort((a, b) => a.cap - b.cap);
    if (g.mode === 'room' && !caps.length) return { error: 'কক্ষভিত্তিক পদ্ধতিতে কক্ষের তালিকা দিন' };
    const rows = [];
    days.forEach((date, di) => slots.forEach(sl => {
      const used = new Set();
      units.forEach(u => {
        // at most one paper per slot; with a gap of n days, n free days between two papers of the unit
        if (!u.queue.length || (g.gap > 0 && u.last >= 0 && di - u.last <= g.gap)) return;
        let room = '';
        if (g.mode === 'room') { const r = caps.find(x => !used.has(x.room) && x.cap >= u.n); if (!r) return; room = r.room; used.add(r.room); }
        const sid = u.queue.shift(); u.last = di; u.lastSlot = `${date}|${sl.start}`;
        rows.push({ eid: this.uid(), date, start: sl.start, end: sl.end, classIds: [u.classId], section: u.section, subjectIds: [sid], room, invig: [] });
      });
    }));
    return { rows, left: U.sum(units, u => u.queue.length) };
  },
  generate() {
    const D = this.d(), r = this.plan(this.ex(), D.gen);
    if (r.error) return toast(r.error, 'error');
    if (D.rows.length && !confirm('বর্তমান রুটিনের সারিগুলো খসড়া দিয়ে বদলে যাবে। চালিয়ে যাবেন?')) return;
    D.rows = r.rows; D.gen = null;
    toast(r.left ? `${bnNum(r.left)}টি পত্র এই সময়সীমায় বসানো যায়নি — তারিখ বা স্লট বাড়ান।` : `${bnNum(r.rows.length)}টি সারির খসড়া তৈরি হয়েছে — দেখে সংরক্ষণ করুন।`, r.left ? 'warn' : 'success');
    App.refresh();
  },

  /* ---------- invigilation ---------- */
  onLeave(tid, date) { return (DB.s.leaves || []).some(l => l.teacherId === tid && l.status === 'Approved' && date >= l.from && date <= l.to); },
  teaches(tid, e) { const t = DB.teacher(tid); return e.subjectIds.some(s => (t?.subjects || []).includes(s)); },
  /** Even spread: fewest duties first; never on leave or in two places; avoid the teacher of the paper's subject when possible. */
  autoInvig() {
    const D = this.d(), per = D.per || 1, T = this.teachers().map(t => t.id); if (!T.length) return toast('কোনো শিক্ষক নেই।', 'error');
    const load = new Map(T.map(t => [t, 0])), over = (a, b) => a.date === b.date && a.start < b.end && b.start < a.end;
    D.rows.forEach(e => (e.invig = []));
    D.rows.forEach(e => {
      const free = T.filter(t => !this.onLeave(t, e.date) && !D.rows.some(o => o !== e && over(o, e) && o.invig.includes(t)));
      const pick = free.sort((a, b) => (this.teaches(a, e) - this.teaches(b, e)) || (load.get(a) - load.get(b)) || a.localeCompare(b)).slice(0, per);
      pick.forEach(t => load.set(t, load.get(t) + 1)); e.invig = pick;
    });
    const short = D.rows.filter(e => e.invig.length < per).length;
    toast(short ? `${bnNum(short)}টি সারিতে যথেষ্ট শিক্ষক পাওয়া যায়নি।` : 'দায়িত্ব বণ্টন সম্পন্ন — সংরক্ষণ করুন।', short ? 'warn' : 'success'); App.refresh();
  },
  /** Duties of one teacher across exams (from today unless `all`). */
  dutiesOf(tid, all) {
    const t = U.today();
    return DB.s.exams.flatMap(ex => this.entries(ex).filter(e => e.invig.includes(tid) && (all || e.date >= t)).map(e => ({ ex, e }))).sort((a, b) => (a.e.date + a.e.start).localeCompare(b.e.date + b.e.start));
  },
  label(e) { return `${(e.classIds.length ? e.classIds.map(c => DB.className(c)).join(', ') : 'সকল শ্রেণি')}${e.section ? '-' + e.section : ''} · ${e.subjectIds.map(s => DB.subject(s)?.name || s).join(', ')}`; },
};
Exams.schedule = examId => RB.open(examId);

/* Routine print: one table; date, time (start above end) and class / section merged across consecutive rows. */
ExamHub.printRoutine = function (examId, cls) {
  const ex = DB.exam(examId), all = RB.entries(ex).filter(e => !cls || ((!e.classIds.length || e.classIds.includes(cls)) && e.subjectIds.some(s => DB.examTakes(ex, cls, s))));
  const key = e => `${[...e.classIds].sort().join(',')}|${e.section}|${e.shift}`, same = (a, b, l) => a.date === b.date && (l === 0 || (a.start === b.start && a.end === b.end && (l === 1 || key(a) === key(b))));
  all.sort((a, b) => (a.date + a.start + a.end).localeCompare(b.date + b.start + b.end) || key(a).localeCompare(key(b)));
  const per = 24, sheets = [];
  for (let i = 0; i === 0 || i < all.length; i += per) {
    const rows = all.slice(i, i + per), last = i + per >= all.length;
    const span = (k, l) => { if (k > 0 && same(rows[k - 1], rows[k], l)) return 0; let n = 1; while (k + n < rows.length && same(rows[k + n], rows[k], l)) n++; return n; };
    const clsTxt = e => `${e.classIds.length ? e.classIds.map(c => DB.className(c)).join(', ') : 'সকল শ্রেণি'}${e.section ? ' — শাখা ' + e.section : ''}${e.shift ? ' · ' + bn((DB.s.school.shifts || []).find(s => s.id === e.shift)?.name || e.shift) : ''}`;
    sheets.push(`${Print.sheet({}, 'padded')}${Print.header('পরীক্ষার রুটিন')}<div style="display:flex;justify-content:space-between;font-size:11pt;margin-bottom:4mm"><b>${esc(ex.name)}</b><span>${cls ? esc(DB.className(cls)) : 'সকল শ্রেণি'} · শিক্ষাবর্ষ ${esc(U.bn(ex.session))}</span></div>
      <table class="ms-table" style="width:100%"><thead><tr><th>তারিখ</th><th>সময়</th><th>শ্রেণি ও শাখা</th><th>বিষয়</th><th>কক্ষ</th></tr></thead><tbody>${rows.map((e, k) => { const a = span(k, 0), b = span(k, 1), c = span(k, 2);
        return `<tr>${a ? `<td rowspan="${a}" style="vertical-align:middle">${U.fmtDate(e.date)}<br><span style="color:#475569">${U.dayBn(new Date(e.date))}</span></td>` : ''}${b ? `<td rowspan="${b}" style="vertical-align:middle;text-align:center">${U.bn(e.start)}<br>${U.bn(e.end)}</td>` : ''}${c ? `<td rowspan="${c}" style="vertical-align:middle">${esc(clsTxt(e))}</td>` : ''}<td><b>${esc(e.subjectIds.map(s => DB.subject(s)?.name || s).join(', '))}</b></td><td>${esc(U.bn(e.room || ''))}</td></tr>`; }).join('')}</tbody></table>
      ${last ? `<div style="position:absolute;bottom:18mm;right:14mm">${Print.signature('Exam Controller')}</div>` : ''}</div>`);
  }
  Print.preview('পরীক্ষার রুটিন', sheets, { re: ['ExamHub.printRoutine', examId, cls || null] });
};

Object.assign(Print.doc, {
  /** Invigilation roster of one exam: every sitting with its room, classes, subjects and invigilators. */
  dutyRoster(examId) {
    const ex = DB.exam(examId); if (!ex) return { empty: 'পরীক্ষাটি পাওয়া যায়নি।' };
    const rows = RB.entries(ex), per = 20, pages = [];
    for (let i = 0; i === 0 || i < rows.length; i += per) pages.push(rows.slice(i, i + per));
    return { title: 'পরিদর্শকের দায়িত্ব বণ্টন', sheets: pages.map((p, k) => `${Print.sheet({}, 'padded')}${k === 0 ? `${Print.header('পরীক্ষাকালীন দায়িত্ব বণ্টন')}<div style="font-size:11pt;margin-bottom:3mm"><b>${esc(ex.name)}</b></div>` : ''}
      <table class="ms-table" style="width:100%;font-size:9.5pt"><thead><tr><th>তারিখ</th><th>সময়</th><th>কক্ষ</th><th>শ্রেণি ও বিষয়</th><th>পরিদর্শক</th><th style="width:28mm">স্বাক্ষর</th></tr></thead>
      <tbody>${p.map(e => `<tr><td>${U.fmtDate(e.date)}</td><td>${U.bn(e.start)}–${U.bn(e.end)}</td><td>${esc(U.bn(e.room || '—'))}</td><td>${esc(RB.label(e))}</td><td>${esc(e.invig.map(t => DB.teacherName(t)).join(', ') || '—')}</td><td></td></tr>`).join('')}</tbody></table>
      ${k === pages.length - 1 ? `<div style="position:absolute;bottom:18mm;right:14mm">${Print.signature('Exam Controller')}</div>` : ''}</div>`) };
  },
  /** One page per teacher with duties in this exam. */
  dutyLists(examId) {
    const ex = DB.exam(examId); if (!ex) return { empty: 'পরীক্ষাটি পাওয়া যায়নি।' };
    const rows = RB.entries(ex), tids = [...new Set(rows.flatMap(e => e.invig))];
    if (!tids.length) return { empty: 'কোনো দায়িত্ব বণ্টন করা হয়নি।' };
    return { title: 'শিক্ষকভিত্তিক দায়িত্ব তালিকা', sheets: tids.map(t => `${Print.sheet({}, 'padded')}${Print.header('পরীক্ষাকালীন দায়িত্ব')}<div style="font-size:11pt;margin-bottom:3mm"><b>${esc(DB.teacherName(t))}</b> · ${esc(ex.name)}</div>
      <table class="ms-table" style="width:100%;font-size:10pt"><thead><tr><th>তারিখ</th><th>বার</th><th>সময়</th><th>কক্ষ</th><th>শ্রেণি ও বিষয়</th></tr></thead><tbody>${rows.filter(e => e.invig.includes(t)).map(e => `<tr><td>${U.fmtDate(e.date)}</td><td>${U.dayBn(new Date(e.date))}</td><td>${U.bn(e.start)}–${U.bn(e.end)}</td><td>${esc(U.bn(e.room || '—'))}</td><td>${esc(RB.label(e))}</td></tr>`).join('')}</tbody></table>
      <div style="position:absolute;bottom:18mm;right:14mm">${Print.signature('Exam Controller')}</div></div>`) };
  },
});

/* Duties on the teacher's "আমার দিন" */
(() => {
  const page = App.portals.teacher?.pages.find(p => p.id === 'today'); if (!page) return;
  const r0 = page.render;
  page.render = function (q) {
    const html = r0.call(this, q), me = Teacher.me(); if (!me) return html;
    const d = RB.dutiesOf(me.id).slice(0, 8); if (!d.length) return html;
    return html + `<div class="card mt-4"><div class="px-5 py-3 border-b border-slate-100 font-semibold">${icon('shield-check', 'w-4 h-4 inline')} পরীক্ষাকালীন দায়িত্ব</div><div class="divide-y divide-slate-100">${d.map(({ ex, e }) => `<div class="px-5 py-3 flex flex-wrap gap-x-4 gap-y-1"><b>${U.fmtDate(e.date)}${e.date === U.today() ? ' ' + badge('আজ', 'blue') : ''}</b><span>${U.bn(e.start)}–${U.bn(e.end)}</span><span>কক্ষ ${esc(U.bn(e.room || '—'))}</span><span class="text-slate-600">${esc(ex.name)} · ${esc(RB.label(e))}</span></div>`).join('')}</div></div>`;
  };
})();

/* ==========================================================================
   OMR ANSWER KEYS for papers not built in the question builder (examPapers kind 'omrkey')
   ========================================================================== */
(() => {
  const key0 = OMR.key.bind(OMR);
  OMR.key = function (p, k) {
    if (p?.kind !== 'omrkey') return key0(p, k);
    const ks = (p.keys || [])[k] || (p.keys || [])[0] || [];
    return ks.map(a => ({ ans: String(a).split('').map(Number).filter(n => n >= 0 && n < 4).sort(), multi: String(a).length > 1, marks: +p.marks || 1 }));
  };
  const st0 = OMR.st.bind(OMR);
  OMR.st = function () {
    const r = st0();
    if (!r.paper && r.ex && r.ui.cls && r.ui.sub) { const k = ExamHub.papers().find(p => p.kind === 'omrkey' && p.examId === r.ex.id && p.classId === r.ui.cls && p.subjectId === r.ui.sub); if (k) { r.paper = k; k.content = k.content || { sets: k.sets }; } }
    return r;
  };
})();
const OK = {
  L: ['ক', 'খ', 'গ', 'ঘ'],
  render() {
    const { ui, ex, cls } = ExamHub.state(); if (!ex) return `<div class="card p-6">${emptyState('কোনো পরীক্ষা নেই।')}</div>`;
    const bar = ExamHub.filterBar(ex, cls, ui); if (!ui.cls) return bar;
    const subs = DB.examSubjects(ex, ui.cls).filter(s => XO.staff() || ExamHub.mine(ui.cls, s.id));
    return bar + `<div class="card scroll-x"><table class="table"><thead><tr><th>বিষয়</th><th>উত্তরমালা</th><th></th></tr></thead><tbody>${subs.map(s => {
      const b = ExamHub.paper('question', ex.id, ui.cls, s.id), built = b?.mode === 'build' && OMR.key(b, 0).length, k = ExamHub.papers().find(p => p.kind === 'omrkey' && p.examId === ex.id && p.classId === ui.cls && p.subjectId === s.id);
      const src = built ? b : k;
      return `<tr><td class="font-semibold">${esc(s.name)}</td><td>${built ? badge(`প্রশ্ন তৈরি থেকে · ${bnNum(OMR.key(b, 0).length)}টি`, 'green') : k ? badge(`নিজস্ব · ${bnNum((k.keys?.[0] || []).length)}টি · ${bnNum(k.sets || 1)} সেট`, 'blue') : badge('নেই', 'slate')}</td>
        <td class="whitespace-nowrap">${src ? `<button class="btn btn-ghost btn-sm" onclick="QB.print('${src.id}','omr')">${icon('printer')} ওএমআর শিট</button>` : ''}${built ? '' : `<button class="btn btn-ghost btn-sm" onclick="OK.edit('${ex.id}','${ui.cls}','${s.id}')">${icon('key-round')} উত্তরমালা নির্ধারণ</button>`}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  },
  edit(examId, cls, sid) {
    if (!ExamHub.canWrite(cls, sid)) return toast('অনুমতি নেই।', 'error');
    const k = ExamHub.papers().find(p => p.kind === 'omrkey' && p.examId === examId && p.classId === cls && p.subjectId === sid);
    const sets = k?.sets || 1, L = this.L, txt = i => (k?.keys?.[i] || []).map(a => String(a).split('').map(n => L[+n]).join('')).join(' ');
    Modal.open({ title: `উত্তরমালা · ${DB.subject(sid)?.name || ''}`, size: 'lg', body: `<form id="okf" class="space-y-3"><div class="grid grid-cols-2 gap-3"><div><label class="label">সেট</label><select class="select" name="sets">${[1, 2, 3, 4].map(n => `<option ${n === sets ? 'selected' : ''}>${n}</option>`).join('')}</select></div><div><label class="label">প্রতি প্রশ্নের নম্বর</label><input class="input" type="number" min="0.5" step="0.5" name="marks" value="${k?.marks || 1}"></div></div>
      ${[0, 1, 2, 3].map(i => `<div data-set="${i}"><label class="label">সেট ${L[i]} — উত্তর ক্রমানুসারে (যেমন: ক খ গ ঘ কগ)</label><textarea class="input" rows="3" name="k${i}">${esc(txt(i))}</textarea></div>`).join('')}
      <button class="btn btn-primary w-full">${icon('save')} সংরক্ষণ</button></form>` });
    const f = $('#okf'), vis = () => $$('[data-set]', f).forEach(d => { d.hidden = +d.dataset.set >= +f.sets.value; });
    f.sets.addEventListener('change', vis); vis();
    f.addEventListener('submit', ev => {
      ev.preventDefault();
      const n = +f.sets.value, keys = [];
      for (let i = 0; i < n; i++) {
        const toks = f[`k${i}`].value.trim().split(/[\s,]+/).filter(Boolean), out = [];
        for (const t of toks) { const ds = [...t].map(ch => L.indexOf(ch) >= 0 ? L.indexOf(ch) : 'abcdABCD'.indexOf(ch) % 4); if (ds.some(d => d < 0)) return toast(`“${t}” বোঝা যায়নি — ক/খ/গ/ঘ লিখুন।`, 'error'); out.push([...new Set(ds)].sort().join('')); }
        keys.push(out);
      }
      if (!keys[0].length || keys.some(x => x.length !== keys[0].length)) return toast('প্রতিটি সেটে সমান সংখ্যক উত্তর দিন।', 'error');
      if (keys[0].length > OMR.MAXQ) return toast(`সর্বোচ্চ ${bnNum(OMR.MAXQ)}টি প্রশ্ন।`, 'error');
      let p = ExamHub.papers().find(x => x.kind === 'omrkey' && x.examId === examId && x.classId === cls && x.subjectId === sid);
      if (!p) ExamHub.papers().push(p = { id: DB.id('XP'), kind: 'omrkey', examId, classId: cls, subjectId: sid, status: 'draft', published: false, by: App.session.userId, createdAt: U.today() });
      Object.assign(p, { sets: n, keys, marks: +f.marks.value || 1, content: { sets: n }, updatedAt: U.today() });
      DB.audit('OMR_KEY', 'exams', `${examId} · ${cls} · ${sid}: ${keys[0].length}টি প্রশ্ন, ${n} সেট`); DB.save(); Modal.close(); toast('উত্তরমালা সংরক্ষিত হয়েছে।', 'success'); App.refresh();
    });
  },
};

/* ==========================================================================
   RESULTS: bulk entry, publishing & marksheet settings, re-check
   ========================================================================== */
const BULK = {
  AB: /^(অনুপস্থিত|অনু|অ|ab|abs|absent)$/i,
  st() {
    const ui = App.ui.bulk || (App.ui.bulk = {}), exams = XO.exams(); if (!exams.some(e => e.id === ui.exam)) ui.exam = exams[0]?.id;
    const ex = DB.exam(ui.exam), cls = ex ? DB.classesIn().map(c => c.id).filter(c => DB.examTakes(ex, c)) : []; if (!cls.includes(ui.cls)) ui.cls = cls[0];
    const secs = ui.cls ? DB.cls(ui.cls)?.sections || [] : []; if (!secs.includes(ui.sec)) ui.sec = '';
    return { ui, exams, ex, cls, secs };
  },
  can() { return XO.staff() && (App.perm('exams', 'edit') || App.has('ADMIN')); },
  cols(ex, cls) { return DB.examSubjects(ex, cls).flatMap(s => Grade.comps(ex, s.id).map(c => ({ s, c, key: `${s.id}:${c.k}`, head: `${s.name} — ${c.label}` }))); },
  list(ui) { return DB.studentsIn(ui.cls).filter(s => !ui.sec || s.section === ui.sec).sort((a, b) => (a.section || '').localeCompare(b.section || '') || (+a.roll - +b.roll)); },
  takes(st, sid) { return typeof SubjectSets === 'undefined' || SubjectSets.takes(st.id, sid); },
  cur(ex, st, s, c) { const m = DB.s.marks.find(x => x.examId === ex.id && x.studentId === st.id && x.subjectId === s.id); if (!m) return ''; if (m.absent) return 'অ'; return ['cq', 'mcq', 'pr'].includes(c.k) ? (m[c.k] ?? '') : (m.x?.[c.k] ?? ''); },
  render() {
    const { ui, exams, ex, cls, secs } = this.st();
    if (!this.can()) return `<div class="card p-6">${emptyState('একসাথে নম্বর দেওয়ার অনুমতি আপনার নেই।', 'lock')}</div>`;
    if (!exams.length) return `<div class="card p-6">${emptyState('কোনো পরীক্ষা নেই।')}</div>`;
    const bar = `<div class="card p-4 mb-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">${XO.sel('bk-ex', 'পরীক্ষা', XO.opts(exams.map(e => [e.id, e.name]), ui.exam), "App.ui.bulk.exam=this.value;App.refresh()")}
      ${XO.sel('bk-cls', 'শ্রেণি', XO.opts(cls.map(c => [c, DB.className(c)]), ui.cls), "App.ui.bulk.cls=this.value;App.refresh()")}
      ${secs.length > 1 ? XO.sel('bk-sec', 'শাখা', XO.opts(secs.map(s => [s, s]), ui.sec, 'সকল শাখা'), "App.ui.bulk.sec=this.value;App.refresh()") : '<div></div>'}
      <div class="flex flex-wrap gap-2"><button class="btn btn-ghost" onclick="BULK.template()">${icon('download')} সিএসভি নমুনা</button><label class="btn btn-ghost cursor-pointer">${icon('file-up')} সিএসভি আমদানি<input type="file" accept=".csv,text/csv" class="sr-only" onchange="BULK.file(this.files[0]);this.value=''"></label></div></div>`;
    if (!ui.cls) return bar;
    const cols = this.cols(ex, ui.cls), list = this.list(ui), subs = [...new Set(cols.map(c => c.s))];
    const head1 = subs.map(s => `<th colspan="${cols.filter(c => c.s === s).length}" class="text-center border-l border-slate-200">${esc(s.name)}</th>`).join(''), head2 = cols.map(c => `<th class="border-l border-slate-100">${esc(c.c.label)} /${bnNum(c.c.max)}</th>`).join('');
    const prev = ui.preview ? `<div class="card p-4 mb-4"><div class="font-semibold mb-2">সিএসভি: ${esc(ui.preview.name)} — ${bnNum(ui.preview.ok)}টি ঘর ঠিক, ${bnNum(ui.preview.errors.length)}টি ত্রুটি</div>${ui.preview.errors.length ? `<ul class="text-red-700 mb-2 max-h-40 overflow-auto">${ui.preview.errors.slice(0, 50).map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}<div class="flex gap-2 justify-end"><button class="btn btn-ghost" onclick="App.ui.bulk.preview=null;App.refresh()">বাতিল</button><button class="btn btn-primary" onclick="BULK.commit()" ${ui.preview.ok ? '' : 'disabled'}>${icon('check')} ${bnNum(ui.preview.ok)}টি নম্বর বসান</button></div></div>` : '';
    const lk = typeof MarkLock !== 'undefined' && MarkLock.locked(ex.id);
    if (lk) setTimeout(() => $$('#bk-table input, #bk-save').forEach(i => { i.disabled = true; }), 0);
    return bar + (lk ? MarkLock.banner() : prev) + `<div class="card scroll-x"><table class="table" id="bk-table"><thead><tr><th rowspan="2">রোল</th><th rowspan="2">নাম</th>${head1}</tr><tr>${head2}</tr></thead><tbody>
      ${list.map(st => `<tr data-st="${st.id}"><td>${bnNum(st.roll)}</td><td class="font-semibold whitespace-nowrap">${esc(pn(st))}</td>${cols.map(c => this.takes(st, c.s.id) ? `<td class="border-l border-slate-100"><input class="grid-input !w-16" inputmode="decimal" data-key="${c.key}" data-max="${c.c.max}" value="${esc(String(this.cur(ex, st, c.s, c.c)))}" ${c.c.k === 'att' ? `placeholder="${Grade.attMarks(DB.attendanceStats(st.id).pct, c.c)}"` : ''} aria-label="${esc(c.head)}"></td>` : '<td class="border-l border-slate-100 text-slate-300">—</td>').join('')}</tr>`).join('')}</tbody></table>
      <div class="p-4 border-t border-slate-100 flex flex-wrap justify-end gap-2"><span class="mr-auto text-slate-500">${bnNum(list.length)} জন × ${bnNum(cols.length)}টি কলাম</span><button class="btn btn-primary" id="bk-save" onclick="BULK.save()">${icon('save')} সব নম্বর সংরক্ষণ</button></div></div>`;
  },
  /** Put values into marks: { studentId: { subjectId: { k: value | 'A' } } }. */
  apply(ex, data) {
    let n = 0;
    if (typeof MarkLock !== 'undefined' && MarkLock.locked(ex.id)) { toast('ফলাফল প্রকাশিত — নম্বর লক করা আছে।', 'error'); return 0; }
    Object.entries(data).forEach(([sid, subs]) => Object.entries(subs).forEach(([sub, vals]) => {
      if (Object.values(vals).includes('A')) { const m = DB.setMark(ex.id, sid, sub, { cq: 0, mcq: 0, pr: 0 }); delete m.x; m.absent = true; n++; return; }
      if (!Object.entries(vals).some(([k, v]) => v !== '' && k !== 'att')) return;
      const m0 = DB.s.marks.find(x => x.examId === ex.id && x.studentId === sid && x.subjectId === sub);
      if (m0?.absent) { m0.cq = m0.mcq = m0.pr = 0; }
      DB.setMark(ex.id, sid, sub, vals); n++;
    }));
    return n;
  },
  save() {
    const { ui, ex } = this.st(), data = {}; let bad = 0;
    $$('#bk-table input[data-key]').forEach(i => {
      const sid = i.closest('tr').dataset.st, [sub, k] = i.dataset.key.split(':'), raw = U.asciiDigits(i.value).trim();
      let v = raw; if (this.AB.test(raw)) v = 'A'; else if (raw !== '') { v = +raw; if (!Number.isFinite(v) || v < 0 || v > +i.dataset.max) { bad++; i.classList.add('bad'); return; } }
      i.classList.remove('bad'); ((data[sid] = data[sid] || {})[sub] = data[sid][sub] || {})[k] = v;
    });
    if (bad) return toast(`${bnNum(bad)}টি ঘরের নম্বর সীমার বাইরে বা সংখ্যা নয়।`, 'error');
    const n = this.apply(ex, data);
    DB.audit('MARKS_BULK', 'marks', `${ex.id} · ${DB.className(ui.cls)}${ui.sec ? '-' + ui.sec : ''}: ${n}টি বিষয়-নম্বর (গ্রিড)`); DB.save(); toast(`${bnNum(n)}টি বিষয়ের নম্বর সংরক্ষিত হয়েছে।`, 'success');
  },
  template() {
    const { ui, ex } = this.st(); if (!ui.cls) return;
    const cols = this.cols(ex, ui.cls), grid = [['শিক্ষার্থী আইডি', 'রোল', 'নাম', ...cols.map(c => c.head)], ...this.list(ui).map(st => [st.id, st.roll, pn(st), ...cols.map(c => this.takes(st, c.s.id) ? String(this.cur(ex, st, c.s, c.c)) : '—')])];
    CSVKit.download(`marks-${ex.id}-${ui.cls}.csv`, grid);
  },
  /** One CSV for the whole class: ID, roll, name + one column per subject × component (header "বিষয় — অংশ" or "SUBJ:k"). */
  parse(text, ex, cls) {
    const grid = CSVKit.parse(text), errors = [], data = {}; let ok = 0;
    if (grid.length < 2) return { errors: ['ফাইলে কোনো তথ্য-সারি নেই'], data, ok };
    const cols = this.cols(ex, cls), n = s => CSVKit.norm(s), head = grid[0].map(h => String(h || '').trim());
    const idCol = head.findIndex(h => ['শিক্ষার্থীআইডি', 'studentid', 'id', 'আইডি'].includes(n(h))), rollCol = head.findIndex(h => ['রোল', 'roll'].includes(n(h)));
    const map = head.map(h => cols.find(c => n(c.head) === n(h) || n(c.key) === n(h)) || null);
    if (!map.some(Boolean)) return { errors: ['কোনো বিষয়-অংশের কলাম চেনা যায়নি (শিরোনাম: “বিষয় — অংশ”)'], data, ok };
    const all = DB.studentsIn(cls);
    grid.slice(1).forEach((row, ri) => {
      const line = `সারি ${bnNum(ri + 2)}`, idv = idCol >= 0 ? U.asciiDigits(String(row[idCol] || '')).trim().toUpperCase() : '', roll = rollCol >= 0 ? +U.asciiDigits(String(row[rollCol] || '')) : 0;
      if (!idv && !roll) return;
      let st = null;
      if (idv) { st = DB.s.students.find(s => s.id.toUpperCase() === idv || String(s.regNo || '').toUpperCase() === idv); if (!st) return errors.push(`${line}: আইডি ${idv} পাওয়া যায়নি`); if (st.classId !== cls) return errors.push(`${line}: ${pn(st)} এই শ্রেণির নয়`); }
      else { const c = all.filter(s => +s.roll === roll); if (c.length !== 1) return errors.push(`${line}: রোল ${bnNum(roll)} ${c.length ? 'একাধিক শাখায় — আইডি দিন' : 'পাওয়া যায়নি'}`); st = c[0]; }
      map.forEach((c, i) => {
        if (!c) return; const raw = U.asciiDigits(String(row[i] ?? '')).trim(); if (raw === '' || raw === '—') return;
        if (!this.takes(st, c.s.id)) return errors.push(`${line}: ${pn(st)} ${c.s.name} নেয়নি`);
        let v; if (this.AB.test(raw)) v = 'A'; else { v = +raw; if (!Number.isFinite(v) || v < 0 || v > c.c.max) return errors.push(`${line}: ${c.head} — “${raw}” সীমার বাইরে (০–${bnNum(c.c.max)})`); }
        ((data[st.id] = data[st.id] || {})[c.s.id] = data[st.id][c.s.id] || {})[c.c.k] = v; ok++;
      });
    });
    return { errors, data, ok };
  },
  async file(f) {
    if (!f) return; const { ui, ex } = this.st(); const text = await f.text(), r = this.parse(text, ex, ui.cls);
    ui.preview = { name: f.name, ...r }; App.refresh();
  },
  commit() {
    const { ui, ex } = this.st(), p = ui.preview; if (!p) return;
    const n = this.apply(ex, p.data); ui.preview = null;
    DB.audit('MARKS_BULK', 'marks', `${ex.id} · ${DB.className(ui.cls)}: সিএসভি ${p.name} থেকে ${n}টি বিষয়-নম্বর`); DB.save(); toast(`${bnNum(n)}টি বিষয়ের নম্বর বসানো হয়েছে।`, 'success'); App.refresh();
  },
};

const PUB = {
  OPTS: [['position', 'অবস্থান'], ['points', 'গ্রেড পয়েন্ট / জিপিএ'], ['remarks', 'শিক্ষকের মন্তব্য'], ['average', 'গড় নম্বর'], ['highest', 'সর্বোচ্চ নম্বর']],
  render() {
    const ses = App.ui.exSes || DB.session(), list = DB.examsOf(ses), m = App.perm('exams', 'edit') || App.has('ADMIN'), rc = DB.s.school.recheck || {};
    const on = (e, k) => (e.sheet || {})[k] !== false && (k !== 'highest' || (e.sheet || {})[k]);
    return `<div class="space-y-3 mb-5">${list.map(e => `<div class="card p-4 flex flex-wrap items-center gap-3"><div class="flex-1 min-w-[12rem]"><div class="font-semibold">${esc(e.name)}</div><div class="text-slate-500">${U.fmtDate(e.start)}</div></div>
        <div class="flex flex-wrap gap-x-4 gap-y-2">${this.OPTS.map(([k, l]) => `<label class="flex items-center gap-2"><input type="checkbox" class="w-5 h-5" ${on(e, k) ? 'checked' : ''} ${m ? '' : 'disabled'} onchange="PUB.opt('${e.id}','${k}',this.checked)"> ${l}</label>`).join('')}</div>
        ${m ? `<button class="btn ${e.published ? 'btn-success' : 'btn-primary'}" onclick="Exams.togglePublish('${e.id}')">${icon(e.published ? 'eye' : 'send')} ${e.published ? 'প্রকাশিত — লুকান' : 'ফলাফল প্রকাশ করুন'}</button>` : badge(e.published ? 'প্রকাশিত' : 'অপ্রকাশিত', e.published ? 'green' : 'slate')}</div>`).join('') || `<div class="card p-6">${emptyState('এই শিক্ষাবর্ষে কোনো পরীক্ষা নেই।')}</div>`}</div>
      <div class="card p-4"><div class="font-semibold mb-3">পুননিরীক্ষণের আবেদন</div><div class="grid sm:grid-cols-3 gap-3 items-end">
        <label class="flex items-center gap-2"><input type="checkbox" class="w-5 h-5" ${rc.on !== false ? 'checked' : ''} ${m ? '' : 'disabled'} onchange="PUB.rc('on',this.checked)"> আবেদন চালু</label>
        <div><label class="label" for="rc-fee">প্রতি বিষয়ে ফি (৳)</label><input id="rc-fee" class="input" type="number" min="0" value="${+rc.fee || 0}" ${m ? '' : 'disabled'} onchange="PUB.rc('fee',Math.max(0,+this.value||0))"></div>
        <div><label class="label" for="rc-until">শেষ তারিখ</label><input id="rc-until" class="input" type="date" value="${rc.until || ''}" ${m ? '' : 'disabled'} onchange="PUB.rc('until',this.value)"></div></div></div>
      ${App.has('ADMIN') ? `<div class="card p-4 mt-4"><label class="flex items-center gap-3"><input type="checkbox" class="w-5 h-5" ${DB.s.school.teacherMarksView ? 'checked' : ''} onchange="PUB.teacherView(this.checked)"> শিক্ষকরা অন্যান্য বিষয়ের ঘর দেখতে পারবেন (শুধু দেখা)</label>
        <label class="flex items-center gap-3 mt-3"><input type="checkbox" class="w-5 h-5" ${DB.s.featureFlags?.publishedMarksPrincipal ? 'checked' : ''} onchange="PUB.principalEdit(this.checked)"> ${icon('lock-open', 'w-4 h-4')} প্রকাশিত ফলাফলের নম্বর অধ্যক্ষও বদলাতে পারবেন</label></div>` : ''}
      <div class="card p-4 mt-4"><div class="font-semibold mb-3">পরীক্ষার দিনে শ্রেণি-হাজিরা — প্রতিষ্ঠানের ডিফল্ট</div><select class="select" ${m ? '' : 'disabled'} onchange="PUB.dayAtt(this.value)">${DAYATT.map(([k, l]) => `<option value="${k}" ${(DB.s.school.examDayAtt || 'exam') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
  },
  opt(id, k, on) { const e = DB.exam(id); e.sheet = { ...(e.sheet || {}), [k]: on }; DB.audit('MARKSHEET_OPTS', 'exams', `${id} · ${k} → ${on}`); DB.save(); },
  rc(k, v) { DB.s.school.recheck = { ...(DB.s.school.recheck || {}), [k]: v }; DB.audit('RECHECK_SETTINGS', 'exams', `${k} → ${v}`); DB.save(); },
  teacherView(on) { if (!App.has('ADMIN')) return; DB.s.school.teacherMarksView = !!on; DB.audit('TEACHER_MARKS_VIEW', 'exams', `→ ${on}`); DB.save(); },
  principalEdit(on) { if (!App.has('ADMIN')) return; DB.s.featureFlags.publishedMarksPrincipal = !!on; DB.audit('PUBLISHED_MARKS_PRINCIPAL', 'exams', `→ ${on}`); DB.save(); App.refresh(); },
  dayAtt(v) { DB.s.school.examDayAtt = v; DB.audit('EXAM_DAY_ATT', 'exams', `default → ${v}`); DB.save(); },
};

const RC = {
  ST: { Pending: ['অপেক্ষমাণ', 'amber'], Assigned: ['নিরীক্ষকের কাছে', 'blue'], Reviewed: ['পুনঃমূল্যায়িত', 'violet'], Accepted: ['গৃহীত', 'green'], Rejected: ['বাতিল', 'red'] },
  all() { return DB.s.recheckReqs || (DB.s.recheckReqs = []); },
  badge(r) { const s = this.ST[r.status] || [r.status, 'slate']; return badge(s[0], s[1]); },
  mark(r) { return DB.s.marks.find(m => m.examId === r.examId && m.studentId === r.studentId && m.subjectId === r.subjectId); },
  vals(r) { const m = this.mark(r), ex = DB.exam(r.examId); return m ? DB.markVals(m, ex, r.subjectId, r.studentId) : {}; },
  fmt(r, v) { return Grade.comps(DB.exam(r.examId), r.subjectId).map(c => `${c.label} ${bnNum(v?.[c.k] ?? 0)}`).join(' · '); },
  inv(r) { const i = r.invoiceId && DB.s.invoices.find(x => x.id === r.invoiceId); return i ? badge(i.status === 'paid' ? 'ফি পরিশোধিত' : `ফি ৳${bnNum(i.amount)} বকেয়া`, i.status === 'paid' ? 'green' : 'amber') : ''; },
  /* staff queue */
  render() {
    const f = App.ui.rcf || (App.ui.rcf = { st: 'open' }), open = ['Pending', 'Assigned', 'Reviewed'];
    const list = this.all().filter(r => f.st === 'all' || (f.st === 'open' ? open.includes(r.status) : !open.includes(r.status))).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const tch = RB.teachers(), m = App.perm('exams', 'edit') || App.has('ADMIN');
    return `<div class="flex flex-wrap items-center gap-2 mb-4">${pills([['open', 'চলমান'], ['done', 'নিষ্পন্ন'], ['all', 'সব']], f.st, id => `App.ui.rcf.st='${id}';App.refresh()`)}<span class="flex-1"></span>${m ? `<button class="btn btn-primary" onclick="RC.applyForm(true)">${icon('plus')} অফিস থেকে আবেদন</button>` : ''}</div>
      <div class="space-y-3">${list.map(r => { const st = DB.student(r.studentId), ex = DB.exam(r.examId), comps = Grade.comps(ex, r.subjectId), nv = r.newVals || this.vals(r);
        return `<div class="card p-4 space-y-3"><div class="flex flex-wrap items-center gap-2"><b>${esc(pn(st))}</b><span class="text-slate-500">${esc(st ? DB.className(st.classId) : '')} · রোল ${bnNum(st?.roll ?? '')}</span>${this.badge(r)}${this.inv(r)}${r.byOffice ? badge('অফিস থেকে', 'slate') : ''}</div>
          <div>${esc(ex?.name || '')} · <b>${esc(DB.subject(r.subjectId)?.name || '')}</b>${r.reason ? ` — ${esc(r.reason)}` : ''}</div>
          <div class="text-slate-600">বর্তমান: ${esc(this.fmt(r, this.vals(r)))}${r.oldVals ? ` · আগের: ${esc(this.fmt(r, r.oldVals))}` : ''}</div>
          ${open.includes(r.status) && m ? `<div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end"><div><label class="label">নিরীক্ষক</label><select class="select" onchange="RC.assign('${r.id}',this.value)"><option value="">— বাছুন —</option>${tch.map(t => `<option value="${t.id}" ${t.id === r.reviewerId ? 'selected' : ''}>${esc(DB.teacherName(t.id))}</option>`).join('')}</select></div>
            ${comps.map(c => this.inp(r, c, nv)).join('')}</div>
            <div class="flex flex-wrap gap-2 justify-end"><button class="btn btn-ghost text-red-600" onclick="RC.reject('${r.id}')">${icon('x')} বাতিল</button><button class="btn btn-primary" onclick="RC.accept('${r.id}')">${icon('check')} গ্রহণ ও নম্বর হালনাগাদ</button></div>` : r.decision ? `<div class="text-slate-600">${esc(r.decision)}</div>` : ''}</div>`; }).join('') || `<div class="card p-6">${emptyState('কোনো আবেদন নেই।', 'file-search')}</div>`}</div>`;
  },
  /** One component input. উপস্থিতি stays empty (auto-computed, shown as placeholder) unless a value was entered for it
      earlier, so a re-check freezes it only when the reviewer types a value. */
  inp(r, c, nv) {
    const auto = c.k === 'att' && r.newVals?.att === undefined && this.mark(r)?.x?.att === undefined;
    const ph = c.k === 'att' ? Grade.attMarks(DB.attendanceStats(r.studentId).pct, c) : '';
    return `<div><label class="label">${esc(c.label)} /${bnNum(c.max)}</label><input class="input" type="number" min="0" max="${c.max}" step="0.5" data-rc="${r.id}" data-k="${c.k}" value="${auto ? '' : nv[c.k] ?? ''}" ${ph !== '' ? `placeholder="${ph}"` : ''}></div>`;
  },
  assign(id, tid) { const r = this.all().find(x => x.id === id); r.reviewerId = tid || null; r.status = tid ? 'Assigned' : 'Pending'; DB.audit('RECHECK_ASSIGN', 'exams', `${id} → ${tid || '—'}`); DB.save(); App.refresh(); },
  read(id) { const v = {}; let bad = false; $$(`[data-rc="${id}"]`).forEach(i => { if (i.value === '') return; const n = +i.value; if (!(n >= 0 && n <= +i.max)) bad = true; v[i.dataset.k] = n; }); return bad ? null : v; },
  notify(r, msg) {
    const st = DB.student(r.studentId), to = [...DB.guardiansOf(r.studentId).map(g => g.phone), DB.user(st?.userId)?.phone].filter(Boolean);
    [...new Set(to)].forEach(p => DB.sms(p, `${DB.s.school.shortName || ''}: ${msg}`));
  },
  accept(id) {
    const r = this.all().find(x => x.id === id), v = this.read(id); if (!r) return;
    if (!v) return toast('নম্বর পূর্ণমানের সীমার বাইরে।', 'error');
    if (typeof MarkLock !== 'undefined' && MarkLock.locked(r.examId)) return toast('এই পরীক্ষার ফলাফল প্রকাশিত, তাই নম্বর লক করা আছে। আবেদনটি গ্রহণ করার অনুমতি আপনার নেই — রুট ব্যবহারকারী (বা রুট অনুমতি দিলে অধ্যক্ষ) এটি গ্রহণ করতে পারবেন।', 'error');
    const inv = r.invoiceId && DB.s.invoices.find(x => x.id === r.invoiceId);
    if (inv && inv.status !== 'paid' && !confirm('আবেদনের ফি এখনো পরিশোধিত হয়নি। তবুও গ্রহণ করবেন?')) return;
    const old = this.vals(r), ex = DB.exam(r.examId), before = DB.result(r.studentId, r.examId);
    DB.setMark(r.examId, r.studentId, r.subjectId, v);
    const after = DB.result(r.studentId, r.examId), now = this.vals(r), changed = Object.keys(now).some(k => +now[k] !== +(old[k] ?? 0));
    Object.assign(r, { status: 'Accepted', oldVals: old, newVals: v, decidedBy: App.session.userId, decidedAt: new Date().toISOString(), decision: changed ? `নম্বর পরিবর্তিত: ${this.fmt(r, old)} → ${this.fmt(r, now)}` : 'পুনঃনিরীক্ষায় নম্বর অপরিবর্তিত' });
    DB.audit('RECHECK_ACCEPT', 'marks', `${r.id} · ${r.studentId} · ${r.examId} · ${r.subjectId}: ${JSON.stringify(old)} → ${JSON.stringify(v)} · জিপিএ ${before.gpa ?? '—'} → ${after.gpa ?? '—'}`);
    this.notify(r, `${pn(DB.student(r.studentId))}-এর ${ex?.name || ''} ${DB.subject(r.subjectId)?.name || ''} পুননিরীক্ষণ সম্পন্ন — ${r.decision}। পোর্টালে হালনাগাদ ফলাফল দেখুন।`);
    DB.save(); toast('আবেদন গৃহীত — ফলাফল পুনর্গণনা হয়েছে।', 'success'); App.refresh();
  },
  reject(id) {
    const r = this.all().find(x => x.id === id); if (!r) return;
    const why = (prompt('বাতিলের কারণ') || '').trim(); if (!why) return;
    Object.assign(r, { status: 'Rejected', decision: `বাতিল: ${why}`, decidedBy: App.session.userId, decidedAt: new Date().toISOString() });
    DB.audit('RECHECK_REJECT', 'exams', `${r.id}: ${why}`);
    this.notify(r, `${pn(DB.student(r.studentId))}-এর ${DB.subject(r.subjectId)?.name || ''} পুননিরীক্ষণের আবেদন বাতিল — ${why}`);
    DB.save(); App.refresh();
  },
  /* application form (learner: own child; office: any student) */
  applyForm(office) {
    const kid = office ? null : QZ.kid(), exams = DB.s.exams.filter(e => e.published).sort((a, b) => b.start.localeCompare(a.start));
    if (!exams.length) return toast('কোনো প্রকাশিত ফলাফল নেই।', 'warn');
    const fee = +(DB.s.school.recheck || {}).fee || 0;
    Modal.open({ title: 'ফলাফল পুননিরীক্ষণের আবেদন', size: 'md', body: `<form id="rcf" class="space-y-3">
      <div><label class="label">পরীক্ষা</label><select class="select" name="exam">${exams.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select></div>
      ${office ? `<div><label class="label">শিক্ষার্থী আইডি</label><input class="input" name="sid" required></div>` : ''}
      <div><div class="label">বিষয়</div><div id="rcf-subs" class="flex flex-wrap gap-x-4 gap-y-2"></div></div>
      <div><label class="label">কারণ</label><textarea class="input" rows="2" name="reason"></textarea></div>
      ${fee ? `<div class="rounded-lg bg-amber-50 p-3">প্রতি বিষয়ে ফি ৳${bnNum(fee)}</div>` : ''}
      <button class="btn btn-primary w-full">${icon('send')} আবেদন জমা দিন</button></form>` });
    const f = $('#rcf'), sid = () => office ? U.asciiDigits(f.sid.value).trim().toUpperCase() : kid?.id;
    const subs = () => { const id = sid(), ms = DB.s.marks.filter(m => m.examId === f.exam.value && m.studentId === id); $('#rcf-subs').innerHTML = ms.map(m => `<label class="flex items-center gap-2"><input type="checkbox" class="w-5 h-5" name="s" value="${m.subjectId}"> ${esc(DB.subject(m.subjectId)?.name || m.subjectId)}</label>`).join('') || '<span class="text-slate-500">নম্বর পাওয়া যায়নি</span>'; };
    f.exam.addEventListener('change', subs); f.sid?.addEventListener('change', subs); subs();
    f.addEventListener('submit', async ev => {
      ev.preventDefault();
      const ids = $$('#rcf input[name=s]:checked').map(x => x.value); if (!ids.length) return toast('অন্তত একটি বিষয় বাছুন।', 'warn');
      try {
        const r = await DB.api('recheck/apply', { examId: f.exam.value, studentId: sid(), subjectIds: ids, reason: f.reason.value });
        Modal.close(); toast(r.fee ? `আবেদন জমা হয়েছে — ফি ৳${bnNum(r.fee)} এর বিল তৈরি হয়েছে।` : 'আবেদন জমা হয়েছে।', 'success'); await DB.pull(); App.refresh();
      } catch (e) { toast({ duplicate: 'এই বিষয়ে আগের আবেদন চলমান।', closed: 'আবেদনের সময় শেষ।', not_published: 'ফলাফল এখনো প্রকাশিত হয়নি।', forbidden: 'অনুমতি নেই।', not_found: 'শিক্ষার্থী বা পরীক্ষা পাওয়া যায়নি।', bad_subject: 'বিষয় সঠিক নয়।' }[e.message] || 'আবেদন জমা দেওয়া যায়নি।', 'error'); }
    });
  },
  learnerRender() {
    const k = QZ.kid(), G = App.session?.role === 'GUARDIAN';
    let h = pageHeader('ফলাফল পুননিরীক্ষণ', '', k ? `<button class="btn btn-primary" onclick="RC.applyForm(false)">${icon('plus')} নতুন আবেদন</button>` : '') + (G ? Guardian.switcher() : '');
    if (!k) return h + `<div class="card p-6">${emptyState('কোনো শিক্ষার্থী সংযুক্ত নেই।')}</div>`;
    const list = this.all().filter(r => r.studentId === k.id).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return h + `<div class="space-y-3">${list.map(r => `<div class="card p-4 space-y-1"><div class="flex flex-wrap items-center gap-2"><b>${esc(DB.subject(r.subjectId)?.name || '')}</b><span class="text-slate-500">${esc(DB.exam(r.examId)?.name || '')}</span>${this.badge(r)}${this.inv(r)}</div>${r.decision ? `<div>${esc(r.decision)}</div>` : ''}<div class="text-slate-500">${XO.dt(r.at)}</div></div>`).join('') || `<div class="card p-6">${emptyState('কোনো আবেদন নেই।', 'file-search')}</div>`}</div>`;
  },
  /* teacher: applications assigned to me */
  reviewerRender() {
    const me = Teacher.me(), list = this.all().filter(r => r.reviewerId === me?.id).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return pageHeader('পুননিরীক্ষণ', '') + `<div class="space-y-3">${list.map(r => { const st = DB.student(r.studentId), comps = Grade.comps(DB.exam(r.examId), r.subjectId), nv = r.newVals || this.vals(r), edit = r.status === 'Assigned';
      return `<div class="card p-4 space-y-3"><div class="flex flex-wrap items-center gap-2"><b>${esc(pn(st))}</b><span class="text-slate-500">${esc(st ? DB.className(st.classId) : '')} · রোল ${bnNum(st?.roll ?? '')}</span>${this.badge(r)}</div><div>${esc(DB.exam(r.examId)?.name || '')} · <b>${esc(DB.subject(r.subjectId)?.name || '')}</b></div><div class="text-slate-600">বর্তমান: ${esc(this.fmt(r, this.vals(r)))}</div>
        ${edit ? `<div class="grid sm:grid-cols-3 gap-3">${comps.map(c => this.inp(r, c, nv)).join('')}</div><div class="flex justify-end"><button class="btn btn-primary" onclick="RC.review('${r.id}')">${icon('send')} পুনঃমূল্যায়িত নম্বর জমা দিন</button></div>` : ''}</div>`; }).join('') || `<div class="card p-6">${emptyState('আপনার কাছে কোনো আবেদন নেই।', 'file-search')}</div>`}</div>`;
  },
  review(id) { const r = this.all().find(x => x.id === id), v = this.read(id); if (!v) return toast('নম্বর পূর্ণমানের সীমার বাইরে।', 'error'); Object.assign(r, { newVals: v, status: 'Reviewed', reviewedAt: new Date().toISOString() }); DB.save(); toast('জমা হয়েছে।', 'success'); App.refresh(); },
};

/* ==========================================================================
   STAFF MENU: পরীক্ষা ও ফলাফল
   ========================================================================== */
const XM = {
  demote(h) { return typeof StudentHub !== 'undefined' ? StudentHub.demote(h) : h; },
  /** One Exam Centre tab inside another page (filter bar + the tab). */
  hub(t) {
    const { ui, ex, cls } = ExamHub.state(); if (!ex) return `<div class="card p-6">${emptyState('কোনো পরীক্ষা পাওয়া যায়নি।')}</div>`;
    let h = ExamHub.filterBar(ex, cls, ui);
    if (!ui.cls && t !== 'routine') return h + `<div class="card p-6">${emptyState('এই পরীক্ষায় কোনো শ্রেণি নেই।', 'circle-slash')}</div>`;
    return h + (t === 'routine' ? ExamHub.routineTab(ex, ui.cls) : t === 'syllabus' ? ExamHub.syllabusTab(ex, ui.cls) : t === 'papers' ? ExamHub.papersTab(ex, ui.cls, 'question') : t === 'solutions' ? ExamHub.papersTab(ex, ui.cls, 'solution') : t === 'marks' ? ExamHub.marksTab(ex, ui.cls) : ExamHub.resultsTab(ex, ui.cls));
  },
  page(title, tabs, key, body) {
    const ui = App.ui.xm || (App.ui.xm = {}), t = tabs.some(x => x[0] === ui[key]) ? ui[key] : tabs[0][0];
    const ses = `<select class="select !w-auto" onchange="App.ui.exSes=this.value;App.refresh()" aria-label="শিক্ষাবর্ষ">${sessionOptions(App.ui.exSes || DB.session())}</select>`;
    let inner; try { inner = body(t); } catch (e) { console.error(e); inner = `<div class="card p-6">${emptyState('এই অংশটি দেখানো যায়নি।', 'triangle-alert')}</div>`; }
    return pageHeader(title, '', ses) + (tabs.length > 1 ? pills(tabs, t, id => `App.ui.xm['${key}']='${id}';App.refresh()`) : '') + inner;
  },
  exams() {
    // the exam syllabus is its own menu entry now (exam-syllabus); an old tab choice opens it
    if (App.ui.xm?.ex === 'syllabus') { App.ui.xm.ex = 'list'; const pt = App.route.portal; App.route.page = 'exam-syllabus'; App.replaceUrl(App.href(pt, 'exam-syllabus')); return this.syllabus(); }
    return this.page('পরীক্ষাসমূহ', [['list', 'পরীক্ষার তালিকা', 'clipboard-list'], ['routine', 'রুটিন ও দায়িত্ব', 'calendar-clock'], ['marks', 'মানবণ্টন', 'scale'], ['sheets', 'শিট মুদ্রণ', 'printer']], 'ex', t => {
      if (t === 'list') return ExamHub.listTab();
      if (t === 'sheets') return this.sheets();
      if (t === 'routine') { const { ex } = ExamHub.state(); return this.hub('routine') + (ex ? `<div class="card p-4 mt-4 flex flex-wrap items-center gap-2"><div class="font-semibold mr-auto">${icon('shield-check', 'w-4 h-4 inline')} পরিদর্শকের দায়িত্ব · ${bnNum(new Set(RB.entries(ex).flatMap(e => e.invig)).size)} জন শিক্ষক</div><button class="btn btn-ghost" onclick="Exams.schedule('${ex.id}')">${icon('pencil')} রুটিন ও দায়িত্ব সম্পাদনা</button><button class="btn btn-ghost" onclick="Print.show('dutyRoster','${ex.id}')">${icon('printer')} দায়িত্ব বণ্টন</button><button class="btn btn-ghost" onclick="Print.show('dutyLists','${ex.id}')">${icon('printer')} শিক্ষকভিত্তিক তালিকা</button></div>` : ''); }
      return this.hub(t);
    });
  },
  sheets() {
    const { ex } = ExamHub.state();
    return this.demote(MS.render()) + (ex ? `<div class="card p-4 mt-4 flex flex-wrap items-center gap-2"><div class="font-semibold mr-auto">${esc(ex.name)}</div><button class="btn btn-ghost" onclick="App.go(App.route.portal,'exam-attendance')">${icon('user-check')} পত্রভিত্তিক হাজিরা শিট</button><button class="btn btn-ghost" onclick="Print.show('examAttSummary','${ex.id}')">${icon('printer')} হাজিরার সারসংক্ষেপ</button><button class="btn btn-ghost" onclick="Print.show('dutyRoster','${ex.id}')">${icon('printer')} দায়িত্ব বণ্টন</button></div>` : '');
  },
  syllabus() { return this.page('পরীক্ষার পাঠ্যসূচি', [['syllabus', 'পাঠ্যসূচি', 'book-open']], 'sy', () => this.hub('syllabus')); },
  papers() { return this.page('প্রশ্নপত্র ও সমাধান', [['papers', 'প্রশ্নপত্র', 'file-text'], ['solutions', 'সমাধান', 'file-check'], ['omrkey', 'ওএমআর ও উত্তরমালা', 'scan-line']], 'pp', t => t === 'omrkey' ? OK.render() : this.hub(t)); },
  results() {
    return this.page('ফলাফল', [['gradebook', 'নম্বরপত্র ও গ্রেডবুক', 'table-2'], ['bulk', 'একসাথে নম্বর', 'grid-3x3'], ['results', 'ফলাফল', 'award'], ['comps', 'মূল্যায়নের অংশ', 'list-tree'], ['publish', 'প্রকাশ ও মার্কশিট', 'send'], ['recheck', 'পুননিরীক্ষণ', 'file-search']], 'rs', t => {
      if (t === 'gradebook') return this.demote(StaffMarks.page().render());
      if (t === 'bulk') return BULK.render();
      if (t === 'publish') return PUB.render();
      if (t === 'recheck') return RC.render();
      if (t === 'comps') return this.comps();
      return this.hub('results');
    });
  },
  comps() {
    const list = DB.examsOf(App.ui.exSes || DB.session()), m = App.perm('exams', 'edit') || App.has('ADMIN');
    return `<div class="space-y-3">${list.map(e => { const own = Object.entries(e.subjects || {}).filter(([, o]) => o.comps); return `<div class="card p-4"><div class="flex flex-wrap items-center gap-2 mb-2"><b class="mr-auto">${esc(e.name)}</b>${m ? `<button class="btn btn-ghost btn-sm" onclick="Exams.setup('${e.id}')">${icon('sliders-horizontal')} সম্পাদনা</button>` : ''}</div>
      <div class="flex flex-wrap gap-1">${Grade.comps(e).map(c => badge(`${c.label} ${bnNum(c.max)} (পাস ${bnNum(c.pass)})`, 'blue')).join('')}</div>
      ${own.length ? `<div class="mt-2 space-y-1">${own.map(([sid, o]) => `<div><span class="font-semibold">${esc(DB.subject(sid)?.name || sid)}:</span> ${o.comps.map(c => esc(`${c.label || COMP_KINDS[c.k] || c.k} ${c.max}`)).join(' · ')}</div>`).join('')}</div>` : ''}</div>`; }).join('') || `<div class="card p-6">${emptyState('এই শিক্ষাবর্ষে কোনো পরীক্ষা নেই।')}</div>`}</div>`;
  },
};

(() => {
  const G = 'পরীক্ষা ও ফলাফল';
  const go = (id, ui) => q => { const pt = App.route.portal; if (ui) Object.assign(App.ui.xm || (App.ui.xm = {}), ui); App.route.page = id; App.replaceUrl(App.href(pt, id)); return App.portals[pt]?.pages.find(p => p.id === id)?.render(q) || ''; };
  ['admin', 'principal'].forEach(portal => {
    const P = App.portals[portal]; if (!P) return;
    const pg = id => P.pages.find(p => p.id === id);
    const set = (id, o) => { const p = pg(id); if (p) Object.assign(p, o, { group: G }); return p; };
    const ex = set('exams', { label: 'পরীক্ষাসমূহ', icon: 'clipboard-list', render: () => XM.exams(), mount: () => { } });
    const add = o => { if (!pg(o.id)) P.pages.push({ module: 'exams', mount: () => { }, ...o, group: G }); return pg(o.id); };
    const sy = add({ id: 'exam-syllabus', label: 'পরীক্ষার পাঠ্যসূচি', icon: 'book-open', render: () => XM.syllabus() });
    const qb = add({ id: 'qbank', label: 'প্রশ্নব্যাংক', icon: 'library', render: () => pageHeader('প্রশ্নব্যাংক', '') + QB.bankTab() });
    const ot = set('online-tests', { label: 'অনলাইন পরীক্ষা' });
    const pp = add({ id: 'papers', label: 'প্রশ্নপত্র ও সমাধান', icon: 'file-text', render: () => XM.papers() });
    const at = set('exam-attendance', { label: 'হাজিরা', icon: 'user-check' });
    const om = set('omr', { label: 'উত্তরপত্র মূল্যায়ন (ওএমআর)', icon: 'scan-line' });
    const rs = add({ id: 'exam-results', label: 'ফলাফল', icon: 'award', render: () => XM.results(), mount: q => { if ((App.ui.xm?.rs || 'gradebook') === 'gradebook') StaffMarks.page().mount(q); } });
    // old pages: hidden redirects to their new home
    [['marks-entry', 'exam-results', { rs: 'gradebook' }], ['mark-sheet', 'exams', { ex: 'sheets' }], ['gradebook', 'exam-results', { rs: 'gradebook' }], ['results', 'exam-results', { rs: 'results' }], ['bulk-marks', 'exam-results', { rs: 'bulk' }], ['recheck', 'exam-results', { rs: 'recheck' }], ['question-bank', 'qbank'], ['syllabus-exam', 'exam-syllabus'],['routine-exam', 'exams', { ex: 'routine' }]].forEach(([id, to, ui]) => {
      const p = pg(id); if (p && !['results'].includes(id)) { Object.assign(p, { hidden: true, render: go(to, ui), mount: () => { } }); return; }
      if (!p) P.pages.push({ id, label: id, icon: 'arrow-right', hidden: true, render: go(to, ui), mount: () => { } });
    });
    // order inside the group: the eight entries first, then whatever else the group already holds (semester …)
    const order = [ex, sy, qb, ot, pp, at, om, rs].filter(Boolean), first = P.pages.findIndex(p => p.group === G || order.includes(p));
    P.pages = P.pages.filter(p => !order.includes(p)); P.pages.splice(Math.max(0, Math.min(first, P.pages.length)), 0, ...order);
  });
  const T = App.portals.teacher;
  if (T && !T.pages.some(p => p.id === 'recheck-review')) App.addPage('teacher', { id: 'recheck-review', label: 'পুননিরীক্ষণ', icon: 'file-search', group: G, when: () => RC.all().some(r => r.reviewerId === Teacher.me()?.id), render: () => RC.reviewerRender(), mount: () => { } }, 'omr');
  ['student', 'guardian'].forEach(portal => { const P = App.portals[portal]; if (P && !P.pages.some(p => p.id === 'recheck')) App.addPage(portal, { id: 'recheck', label: 'ফলাফল পুননিরীক্ষণ', icon: 'file-search', group: 'পড়াশোনা', render: () => RC.learnerRender(), mount: () => { } }, 'online-test'); });
})();
