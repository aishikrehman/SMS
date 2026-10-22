/* ==========================================================================
   SEAT PLAN — স্বয়ংক্রিয় আসনবিন্যাস (পরীক্ষা ও ফলাফল)
   Pick an exam and a sitting (date + start of the exam timetable), the rooms
   (size, seats per bench, blocked seats and aisles from কক্ষ বিন্যাস, roomLayout)
   and the rules; seats are assigned automatically and saved per sitting.
   seatPlans = [{ id, examId, sitting: "YYYY-MM-DD|HH:MM", campusId, rules: { mix, gap, order, bySection },
                  rooms: [{ roomId, name, no, rows, cols, per, grid: [[studentId | null | '#' | '|']] }],
                  unseated: [studentId], at, by }]
   '#' = blocked seat, '|' = aisle. Prints reuse Print.seatPlan and PrintStudio's desk labels.
   ========================================================================== */
const SeatPlan = {
  PAL: ['#dbeafe', '#fef3c7', '#dcfce7', '#fce7f3', '#ede9fe', '#ffedd5', '#cffafe', '#f1f5f9'],
  ORDERS: [['roll', 'রোল অনুযায়ী'], ['name', 'নাম অনুযায়ী'], ['id', 'আইডি অনুযায়ী']],
  can() { return App.perm('exams', 'edit') || App.has('ADMIN'); },
  ui() { return App.ui.seat || (App.ui.seat = { rooms: null, mix: 2, gap: 1, order: 'roll', bySection: false }); },
  all() { return Array.isArray(DB.s.seatPlans) ? DB.s.seatPlans : (DB.s.seatPlans = []); },
  exams() { return DB.s.exams.filter(e => String(e.session) === String(App.ui.exSes || DB.session()) || !e.session).filter(e => (e.schedule || []).length || DB.examClasses(e).length); },
  sittings(ex) {
    const m = new Map();
    (ex?.schedule || []).forEach(r => { if (!r.date) return; const k = `${r.date}|${r.start || ''}`; const x = m.get(k) || { key: k, date: r.date, start: r.start || '', end: r.end || '', rows: [] }; x.rows.push(r); m.set(k, x); });
    return [...m.values()].sort((a, b) => a.key.localeCompare(b.key));
  },
  sitLabel(s) { return `${U.fmtDate(s.date)}${s.start ? ` · ${U.bn(s.start)}${s.end ? '–' + U.bn(s.end) : ''}` : ''} · ${s.rows.map(r => DB.subject(r.subjectId)?.name).filter(Boolean).join(', ') || '—'}`; },
  /** Classes sitting at this slot (a row without classes = every class of the exam), this campus only. */
  classes(ex, sit) {
    const exC = DB.examClasses(ex).filter(c => c.campusId === DB.campusId()).map(c => c.id);
    if (!sit) return exC;
    const ids = new Set(); sit.rows.forEach(r => ((r.classIds || []).length ? r.classIds : exC).forEach(id => ids.add(id)));
    return [...ids].filter(id => exC.includes(id));
  },
  rooms() {
    if (typeof RoomMap === 'undefined') return [];
    // the room layout is built from the old room list the first time staff need it (as the কক্ষ বিন্যাস page does)
    if (this.can() && !DB.s.roomLayout?.campuses?.[DB.campusId()] && (DB.s.rooms?.[DB.campusId()] || []).length) { RoomMap.camp(DB.campusId(), true); DB.save(); }
    return RoomMap.all(DB.campusId()).filter(x => !['office', 'library'].includes(x.r.type) && (+x.r.rows || 0) > 0); },
  roomCells(R) { const rows = +R.rows || 1, cols = RoomMap.width(R); return { rows, cols, per: RoomMap.per(R) }; },
  sort(list, o) {
    const by = o.order === 'name' ? (a, b) => pn(a).localeCompare(pn(b), 'bn') : o.order === 'id' ? (a, b) => String(a.id).localeCompare(String(b.id)) : (a, b) => (+a.roll || 0) - (+b.roll || 0);
    return [...list].sort((a, b) => (o.bySection ? String(a.section || '').localeCompare(String(b.section || '')) : 0) || by(a, b));
  },
  /** Assign seats. mix = how many different classes share one bench (1 = no rule); gap = same class not within this many seats left/right/in front. */
  build(classIds, roomList, o) {
    const qs = classIds.map(id => ({ id, q: this.sort(DB.studentsIn(id), o) })).filter(x => x.q.length);
    const left = () => qs.reduce((n, x) => n + x.q.length, 0), out = [], gap = Math.max(0, +o.gap || 0), mix = Math.max(1, +o.mix || 1);
    const cls = sid => (sid && sid.length > 1 ? DB.student(sid)?.classId : null);
    let turn = 0;
    roomList.forEach(({ r: R }) => {
      const { rows, cols, per } = this.roomCells(R), cap = RoomMap.cap(R);
      const grid = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => { const c = RoomMap.cell(R, i, j); return c === 'a' ? '|' : c ? '#' : null; }));
      let placed = 0;
      for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
        if (grid[i][j] !== null || placed >= cap || !left()) continue;
        const b0 = Math.floor(j / per) * per, bench = new Set(); for (let k = b0; k < j; k++) { const c = cls(grid[i][k]); if (c) bench.add(c); }
        const near = new Set();
        for (let d = 1; d <= gap; d++) { const l = cls(grid[i][j - d]); if (l) near.add(l); const u = i - d >= 0 ? cls(grid[i - d][j]) : null; if (u) near.add(u); }
        const order = qs.map((_, n) => qs[(turn + n) % qs.length]).filter(x => x.q.length);
        const ok = x => !near.has(x.id) && (mix < 2 || !bench.has(x.id) || bench.size >= mix);
        const pick = order.find(ok) || (qs.filter(x => x.q.length).length === 1 && gap === 0 && mix < 2 ? order[0] : null);
        if (!pick) continue;
        grid[i][j] = pick.q.shift().id; placed++; turn = (qs.indexOf(pick) + 1) % qs.length;
      }
      out.push({ roomId: R.id, name: R.name, no: R.no || '', rows, cols, per, grid });
    });
    return { rooms: out.filter(x => x.grid.some(r => r.some(c => c && c.length > 1))), unseated: qs.flatMap(x => x.q.map(s => s.id)) };
  },
  plan(examId, sitting) { return this.all().find(p => p.examId === examId && p.sitting === sitting && (!p.campusId || p.campusId === DB.campusId())); },
  run() {
    if (!this.can()) return toast('অনুমতি নেই।', 'error');
    const u = this.ui(), ex = DB.exam(u.exam), sit = this.sittings(ex).find(s => s.key === u.sit);
    if (!ex) return toast('পরীক্ষা বেছে নিন।', 'warn');
    const R = this.rooms().filter(x => (u.rooms || []).includes(x.r.id)); if (!R.length) return toast('অন্তত একটি কক্ষ বেছে নিন।', 'warn');
    const C = this.classes(ex, sit); if (!C.length) return toast('এই সময়ে কোনো শ্রেণির পরীক্ষা নেই।', 'warn');
    const res = this.build(C, R, u), key = sit ? sit.key : '';
    const rec = { id: this.plan(ex.id, key)?.id || DB.id('SP'), examId: ex.id, sitting: key, campusId: DB.campusId(), rules: { mix: +u.mix, gap: +u.gap, order: u.order, bySection: !!u.bySection }, rooms: res.rooms, unseated: res.unseated, at: new Date().toISOString(), by: App.session?.userId || '' };
    DB.s.seatPlans = [...this.all().filter(p => p.id !== rec.id), rec];
    DB.audit('SEAT_PLAN', 'exams', `${ex.name} · ${key || 'সব'} · ${res.rooms.length}টি কক্ষ`); DB.save();
    toast(res.unseated.length ? `${bnNum(res.unseated.length)} জনের আসন হয়নি — কক্ষ যোগ করুন বা নিয়ম শিথিল করুন।` : 'আসনবিন্যাস তৈরি হয়েছে।', res.unseated.length ? 'warn' : 'success'); App.refresh();
  },
  del(id) { if (!confirm('এই আসনবিন্যাস মুছে ফেলবেন?')) return; DB.s.seatPlans = this.all().filter(p => p.id !== id); DB.save(); App.refresh(); },
  rname(r) { return r.no && String(r.no) !== String(r.name) ? `${r.no} · ${r.name}` : String(r.name || r.no || ''); },
  seatCode(i, j) { return `${String.fromCharCode(65 + i)}${j + 1}`; },
  color(classId, C) { const i = C.indexOf(classId); return this.PAL[(i < 0 ? 0 : i) % this.PAL.length]; },
  roomMap(room, C) {
    return `<div class="sp-room"><div class="flex flex-wrap items-center gap-2 mb-2"><b>${icon('door-open', 'w-4 h-4 inline')} ${esc(this.rname(room))}</b><span class="text-slate-500">${bnNum(room.grid.flat().filter(c => c && c.length > 1).length)} জন</span></div>
      <div class="sp-board">বোর্ড / পরিদর্শকের টেবিল</div>
      <div class="scroll-x"><table class="sp-grid"><tbody>${room.grid.map((row, i) => `<tr>${row.map((c, j) => {
        const gapR = room.per > 1 && (j + 1) % room.per === 0 && j < row.length - 1 ? ' sp-bench' : '';
        if (c === '|') return `<td class="sp-aisle${gapR}" title="চলার পথ"></td>`;
        if (c === '#') return `<td class="sp-block${gapR}" title="বন্ধ আসন">${icon('x', 'w-4 h-4')}</td>`;
        const st = c ? DB.student(c) : null;
        return `<td class="${gapR.trim()}" style="background:${st ? this.color(st.classId, C) : 'transparent'}" title="${esc(this.seatCode(i, j))}${st ? ' · ' + esc(pn(st)) : ''}"><span class="sp-code">${this.seatCode(i, j)}</span>${st ? `<span class="sp-nm">${esc(pn(st))}</span><span class="sp-sub">${esc(DB.className(st.classId))} · ${bnNum(st.roll)}</span>` : ''}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  },
  /* ----- prints ----- */
  title(p) { const ex = DB.exam(p.examId), s = this.sittings(ex).find(x => x.key === p.sitting); return `${ex?.name || 'পরীক্ষা'}${s ? ' · ' + U.fmtDate(s.date) + (s.start ? ' ' + U.bn(s.start) : '') : ''}`; },
  legacy(p) { return p.rooms.map(r => ({ room: this.rname(r), rows: r.rows, cols: r.cols, grid: r.grid.map(row => row.map(c => { const st = c && c.length > 1 ? DB.student(c) : null; return st ? { id: st.id, name: pn(st), roll: st.roll, grade: DB.cls(st.classId)?.grade || 0 } : null; })), filled: r.grid.flat().filter(c => c && c.length > 1).length })); },
  printChart(id) { const p = this.all().find(x => x.id === id); if (!p) return; Print.preview(`আসন বিন্যাস — ${this.title(p)}`, Print.seatPlan(this.legacy(p), this.title(p)), { paper: 'A4', orientation: 'landscape', re: ['SeatPlan.printChart', id] }); },
  printDoor(id) {
    const p = this.all().find(x => x.id === id); if (!p) return;
    const sheets = p.rooms.map(r => {
      const list = []; r.grid.forEach((row, i) => row.forEach((c, j) => { const st = c && c.length > 1 ? DB.student(c) : null; if (st) list.push({ st, seat: this.seatCode(i, j) }); }));
      list.sort((a, b) => DB.className(a.st.classId).localeCompare(DB.className(b.st.classId), 'bn') || (+a.st.roll || 0) - (+b.st.roll || 0));
      return `<div class="sheet padded">${Print.header(`দরজার তালিকা — ${esc(this.title(p))}`)}<div style="display:flex;justify-content:space-between;font-size:13pt;margin-bottom:3mm"><b>কক্ষ ${esc(this.rname(r))}</b><span>${bnNum(list.length)} জন</span></div>
        <table class="data" style="width:100%;font-size:10pt"><thead><tr><th>ক্রম</th><th>শ্রেণি</th><th>রোল</th><th>নাম</th><th>আসন</th></tr></thead><tbody>${list.map((x, n) => `<tr><td>${bnNum(n + 1)}</td><td>${esc(DB.className(x.st.classId))}${x.st.section ? '-' + esc(x.st.section) : ''}</td><td>${bnNum(x.st.roll)}</td><td>${esc(pn(x.st))}</td><td><b>${x.seat}</b></td></tr>`).join('')}</tbody></table></div>`;
    });
    Print.preview(`দরজার তালিকা — ${this.title(p)}`, sheets, { paper: 'A4', orientation: 'portrait', re: ['SeatPlan.printDoor', id] });
  },
  printSlips(id) {
    const p = this.all().find(x => x.id === id); if (!p) return;
    if (typeof PrintStudio === 'undefined' || !PrintStudio.gen?.deskLabels) return toast('মুদ্রণ ইঞ্জিন পাওয়া যাচ্ছে না।', 'error');
    Print.preview(`আসন স্লিপ — ${this.title(p)}`, PrintStudio.gen.deskLabels(this.legacy(p), this.title(p)), { paper: 'A4', orientation: 'portrait', re: ['SeatPlan.printSlips', id] });
  },
  CSS: `.sp-grid{border-collapse:separate;border-spacing:3px}.sp-grid td{min-width:5.5rem;height:4rem;border:1px solid var(--xg-bd,#cbd5e1);border-radius:6px;padding:2px 4px;vertical-align:top;line-height:1.15}
    .sp-grid td.sp-bench{border-right-width:3px}.sp-grid td.sp-aisle{border:none;min-width:1.2rem;background:transparent}.sp-grid td.sp-block{background:repeating-linear-gradient(45deg,transparent 0 6px,rgba(148,163,184,.35) 6px 12px);color:#94a3b8;text-align:center;vertical-align:middle}
    .sp-code{display:block;font-weight:700}.sp-nm{display:block;max-width:7rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sp-sub{display:block;color:#475569}
    .sp-board{text-align:center;border:1px dashed #94a3b8;border-radius:6px;padding:.25rem;margin-bottom:.5rem;color:#64748b}
    .sp-room{border:1px solid var(--xg-bd,#e2e8f0);border-radius:10px;padding:.75rem;margin-top:1rem}
    html.dark .sp-grid td:not(.sp-aisle):not(.sp-block){color:#0f172a}`,
  page() {
    const u = this.ui(), can = this.can(), E = this.exams();
    if (!E.length) return pageHeader('স্বয়ংক্রিয় আসনবিন্যাস') + `<div class="card p-6">${emptyState('কোনো পরীক্ষা নেই।')}</div>`;
    const ex = E.find(e => e.id === u.exam) || E[0]; u.exam = ex.id;
    const S = this.sittings(ex), sit = S.find(s => s.key === u.sit) || S[0] || null; u.sit = sit ? sit.key : '';
    const RL = this.rooms(); if (!u.rooms) u.rooms = RL.filter(x => ['class', 'hall'].includes(x.r.type)).map(x => x.r.id);
    const C = this.classes(ex, sit), N = C.reduce((n, id) => n + DB.studentsIn(id).length, 0), capSel = RL.filter(x => u.rooms.includes(x.r.id)).reduce((n, x) => n + Math.min(RoomMap.cap(x.r), RoomMap.seats(x.r)), 0);
    const p = this.plan(ex.id, u.sit), dis = can ? '' : 'disabled';
    const sel = (id, label, opts, val, js) => `<div><label class="label" for="${id}">${label}</label><select id="${id}" class="select !w-auto" ${dis} onchange="${js}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
    const set = (k, cast = '') => `SeatPlan.ui().${k}=${cast}this.value;App.refresh()`;
    const pat = r => (typeof SEAT_PATTERNS !== 'undefined' ? SEAT_PATTERNS.find(x => x[0] === r.pattern)?.[1] : '') || '';
    return `<style>${typeof XG_CSS !== 'undefined' ? XG_CSS : ''}${this.CSS}</style>` + pageHeader('স্বয়ংক্রিয় আসনবিন্যাস', '', `<select class="select !w-auto" onchange="App.ui.exSes=this.value;App.refresh()" aria-label="শিক্ষাবর্ষ">${sessionOptions(App.ui.exSes || DB.session())}</select>`)
      + `<div class="card p-4 mb-4"><div class="flex flex-wrap items-end gap-3">
        <div><label class="label" for="sp-ex">পরীক্ষা</label><select id="sp-ex" class="select !w-auto" onchange="SeatPlan.ui().exam=this.value;SeatPlan.ui().sit='';App.refresh()">${E.map(e => `<option value="${e.id}" ${e.id === ex.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></div>
        <div class="min-w-0"><label class="label" for="sp-sit">সিটিং</label><select id="sp-sit" class="select !w-auto max-w-full" onchange="SeatPlan.ui().sit=this.value;App.refresh()">${S.length ? S.map(s => `<option value="${esc(s.key)}" ${s === sit ? 'selected' : ''}>${esc(this.sitLabel(s))}</option>`).join('') : '<option value="">সব শ্রেণি একসাথে</option>'}</select></div>
        ${sel('sp-mix', 'প্রতি বেঞ্চে শ্রেণি মিশ্রণ', [[1, 'নিয়ম নেই'], [2, 'ভিন্ন ২টি শ্রেণি'], [3, 'ভিন্ন ৩টি শ্রেণি']], u.mix, set('mix', '+'))}
        ${sel('sp-gap', 'একই শ্রেণির দূরত্ব', [[0, 'নিয়ম নেই'], [1, 'পাশে/সামনে নয়'], [2, '২ আসন দূরে']], u.gap, set('gap', '+'))}
        ${sel('sp-ord', 'ক্রম', this.ORDERS, u.order, set('order'))}
        <label class="inline-flex items-center gap-2 pb-2"><input type="checkbox" class="w-4 h-4" ${u.bySection ? 'checked' : ''} ${dis} onchange="SeatPlan.ui().bySection=this.checked;App.refresh()">শাখা অনুযায়ী</label></div>
        <div class="mt-3"><div class="flex flex-wrap items-center gap-2 mb-2"><b>কক্ষ</b><span class="text-slate-500">${bnNum(u.rooms.length)}টি · ${bnNum(capSel)} আসন · ${bnNum(N)} জন পরীক্ষার্থী (${esc(C.map(id => DB.className(id)).join(', ') || '—')})</span></div>
        ${RL.length ? `<div class="flex flex-wrap gap-1.5">${RL.map(x => { const on = u.rooms.includes(x.r.id); return `<button type="button" class="pill ${on ? 'pill-on' : ''}" aria-pressed="${on}" ${dis} onclick="SeatPlan.toggleRoom('${x.r.id}')">${on ? icon('check', 'w-4 h-4') : ''}${esc(this.rname(x.r))} ·${bnNum(Math.min(RoomMap.cap(x.r), RoomMap.seats(x.r)))} · ${esc(pat(x.r))}</button>`; }).join('')}</div>` : `<p>${emptyState('কক্ষ বিন্যাসে কোনো কক্ষ নেই।', 'door-closed')}</p><a class="btn btn-ghost" href="${App.href(App.route.portal, 'set-rooms')}">${icon('layout-grid')} কক্ষ বিন্যাস</a>`}</div>
        ${can ? `<div class="flex flex-wrap gap-2 mt-4"><button class="btn btn-primary" onclick="SeatPlan.run()">${icon('wand-sparkles')} ${p ? 'আবার সাজান' : 'আসন সাজান'}</button>${capSel < N ? `<span class="self-center text-red-600">${bnNum(N - capSel)}টি আসন কম</span>` : ''}</div>` : ''}</div>`
      + (p ? `<div class="card p-4"><div class="flex flex-wrap items-center gap-2"><div class="font-semibold mr-auto">${esc(this.title(p))} · ${bnNum(p.rooms.length)}টি কক্ষ${p.unseated?.length ? ` · <span class="text-red-600">${bnNum(p.unseated.length)} জনের আসন হয়নি</span>` : ''}</div>
          <button class="btn btn-ghost" onclick="SeatPlan.printChart('${p.id}')">${icon('printer')} কক্ষের আসন চার্ট</button><button class="btn btn-ghost" onclick="SeatPlan.printDoor('${p.id}')">${icon('clipboard-list')} দরজার তালিকা</button><button class="btn btn-ghost" onclick="SeatPlan.printSlips('${p.id}')">${icon('ticket')} আসন স্লিপ</button>${can ? `<button class="btn btn-ghost text-red-600" onclick="SeatPlan.del('${p.id}')">${icon('trash-2')} মুছুন</button>` : ''}</div>
          <div class="flex flex-wrap gap-2 mt-3">${C.map(id => `<span class="inline-flex items-center gap-1.5"><span style="width:1rem;height:1rem;border-radius:4px;background:${this.color(id, C)};border:1px solid #cbd5e1;display:inline-block"></span>${esc(DB.className(id))}</span>`).join('')}</div>
          ${p.rooms.map(r => this.roomMap(r, C)).join('')}</div>`
        : `<div class="card p-6">${emptyState('এই সিটিংয়ের আসনবিন্যাস এখনো তৈরি হয়নি।', 'armchair')}</div>`);
  },
  toggleRoom(id) { const u = this.ui(); u.rooms = u.rooms.includes(id) ? u.rooms.filter(x => x !== id) : [...u.rooms, id]; App.refresh(); },
};
DB.addSeeder('seatPlans', () => []);
(() => {
  const pg = { id: 'seat-plan', label: 'স্বয়ংক্রিয় আসনবিন্যাস', icon: 'armchair', module: 'exams', group: 'পরীক্ষা ও ফলাফল', render: () => SeatPlan.page(), mount: () => { } };
  ['principal', 'admin'].forEach(portal => {
    const P = App.portals[portal]; if (!P || P.pages.some(x => x.id === pg.id)) return;
    const i = P.pages.findIndex(x => x.id === 'exam-attendance'); P.pages.splice(i < 0 ? P.pages.length : i + 1, 0, { ...pg });
  });
})();
