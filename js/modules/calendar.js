/* ==========================================================================
   ACADEMIC CALENDAR — weekends, public/school holidays and exam periods.
   Shown in every role (and on the public site); editable by the Principal.
   The same data drives U.isSchoolDay(), so attendance, PTC slots, proxies
   and timetables all respect it.
   ========================================================================== */

const Cal = {
  TONE: { Public: 'bg-pink-100 text-pink-800 border-pink-200', School: 'bg-amber-100 text-amber-800 border-amber-200', Exam: 'bg-sky-100 text-sky-800 border-sky-200', Event: 'bg-emerald-100 text-emerald-800 border-emerald-200', Open: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  LABEL: { Public: 'সার্বজনীন ছুটি (বন্ধ)', School: 'বিদ্যালয়ের ছুটি (বন্ধ)', Exam: 'পরীক্ষাকাল (খোলা)', Event: 'অনুষ্ঠান / সভা (খোলা)', Open: 'খোলা দিন — সাপ্তাহিক ছুটি / ছুটির দিনকে কর্মদিবস করা হয়েছে' },
  campusFor() {
    const p = App.route.portal;
    if (p === 'teacher') return Teacher.me()?.campusId;
    if (p === 'student') return DB.campusOf(Student.me()?.classId);
    if (p === 'guardian') return DB.campusOf(Guardian.child()?.classId);
    if (p === 'public') return App.ui.calCampus || null;
    return DB.campusId();
  },
  canEdit() { return App.session && ['PRINCIPAL', 'ADMIN', 'SUPERADMIN'].includes(App.session.role) && App.perm('academics', 'edit'); },
  /** All calendar entries covering a date (a day can hold several, e.g. an exam period and a meeting). */
  on(k, campus) { return DB.s.calendar.holidays.filter(h => k >= h.date && k <= (h.to || h.date) && (!h.campusId || !campus || h.campusId === campus)); },
  view(editable) {
    const mk = App.ui.calM || U.monthKey(new Date()), campus = this.campusFor();
    const [y, m] = mk.split('-').map(Number), first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate(), today = U.today();
    const cal = DB.s.calendar;
    let cells = ''; for (let i = 0; i < first.getDay(); i++) cells += '<div></div>';
    const cc = U.altOn(App.route.portal === 'public' && App.route.page === 'home' ? 'home' : 'calendar');
    // the Bangla / Hijri day under each date (with the month name on its first day and on the 1st of the grid)
    const altDay = dt => cc.order.map(k => [k, k === 'bangla' ? U.bnParts(dt) : U.hijriParts(dt)]).filter(([, p]) => p).map(([k, p]) => `<span class="cal-alt ${k === 'hijri' ? 'cal-alt-h' : ''}" data-day="1">${U.bn(p.d)}${p.d === 1 || dt.getDate() === 1 ? `<span class="hidden lg:inline"> ${p.month}</span>` : ''}</span>`).join('');
    for (let d = 1; d <= days; d++) {
      const dt = new Date(y, m - 1, d), k = U.iso(dt), evs = this.on(k, campus), opened = evs.some(h => h.type === 'Open'), closed = !opened && evs.find(h => h.type === 'Public' || h.type === 'School'), wk = cal.weekends.includes(dt.getDay()) && !opened;
      cells += `<div class="group min-h-[70px] sm:min-h-[92px] rounded-lg border p-1.5 text-xs flex flex-col gap-1 cursor-pointer ${closed ? this.TONE[closed.type] : wk ? 'bg-slate-50 border-slate-100 text-slate-400' : 'bg-white border-slate-200'} ${k === today ? 'ring-2 ring-brand-500' : ''} ${editable ? 'hover:border-brand-500' : 'hover:border-brand-400'}" ${editable ? `onclick="if(event.target===this||event.target.dataset.day)Cal.edit(null,'${k}')"` : `onclick="Cal.day('${k}')" role="button" tabindex="0" onkeydown="if(event.key==='Enter')Cal.day('${k}')" aria-label="${esc(U.fmtDate(k))}"`}>
        <div class="font-bold flex items-center gap-1" data-day="1">${bnNum(d)}${wk && !evs.length ? ' <span class="font-normal hidden sm:inline">· সাপ্তাহিক ছুটি</span>' : ''}${editable && (wk || closed) ? `<button type="button" class="ml-auto hidden group-hover:inline-flex text-[10px] font-semibold rounded px-1 border border-indigo-300 text-indigo-700 bg-white" title="এই দিনটিকে কর্মদিবস করুন" onclick="event.stopPropagation();Cal.openDay('${k}')">খোলা</button>` : ''}</div>${altDay(dt) ? `<div class="cal-alts" data-day="1">${altDay(dt)}</div>` : ''}${evs.map(h => `<button type="button" class="text-left leading-tight rounded px-1 py-0.5 border ${this.TONE[h.type] || this.TONE.Event} line-clamp-2" ${editable ? `onclick="event.stopPropagation();Cal.edit('${h.id}')"` : 'tabindex="-1"'} title="${esc(h.name)}">${esc(h.name)}</button>`).join('')}</div>`;
    }
    const upcoming = cal.holidays.filter(h => (h.to || h.date) >= today && (!h.campusId || !campus || h.campusId === campus)).sort((a, b) => a.date.localeCompare(b.date));
    // working days of one class (learners: their own; staff: the chosen class) leave out its "no class attendance" exam days
    const kid = App.session?.role === 'STUDENT' ? Student.me() : App.session?.role === 'GUARDIAN' ? Guardian.child() : null;
    const calCls = kid ? kid.classId : App.ui.calCls && DB.cls(App.ui.calCls) ? App.ui.calCls : '';
    const off = k => kid ? DB.examOffFor?.(kid, k) : calCls ? DB.classOffDay?.(calCls, k) : false;
    const schoolDays = Array.from({ length: days }, (_, i) => new Date(y, m - 1, i + 1)).filter(dt => U.isSchoolDay(dt, null, campus) && !off(U.iso(dt))).length;
    const clsPick = App.session && !kid && App.route.portal !== 'public' ? `<select class="select !w-auto" aria-label="শ্রেণি" onchange="App.ui.calCls=this.value;App.refresh()"><option value="">সকল শ্রেণি</option>${DB.classesIn(campus || DB.campusId()).map(c => `<option value="${c.id}" ${c.id === calCls ? 'selected' : ''}>${esc(DB.className(c.id))}</option>`).join('')}</select>` : '';
    const nav = d => U.monthKey(U.addMonths(`${mk}-01`, d));
    return `<div class="grid xl:grid-cols-3 gap-5"><div class="card p-4 xl:col-span-2"><div class="flex flex-wrap items-center gap-2 mb-3"><button class="btn btn-ghost btn-sm" onclick="App.ui.calM='${nav(-1)}';App.refresh()">${icon('chevron-left')}</button><div class="min-w-0"><div class="font-bold text-lg">${U.monthName(mk)}</div>${this.altMonths(y, m) ? `<div class="text-slate-500 leading-snug">${esc(this.altMonths(y, m))}</div>` : ''}</div><button class="btn btn-ghost btn-sm" onclick="App.ui.calM='${nav(1)}';App.refresh()">${icon('chevron-right')}</button><button class="btn btn-ghost btn-sm" onclick="App.ui.calM=null;App.refresh()">আজ</button><button class="btn btn-ghost btn-sm" onclick="Cal.yearList(${y})">${icon('list')} সারা বছরের ছুটির তালিকা</button>${editable ? `<button class="btn btn-primary btn-sm" onclick="Cal.edit(null,'${mk === U.monthKey(new Date()) ? today : mk + '-01'}')">${icon('calendar-plus')} অনুষ্ঠান যোগ করুন</button><button class="btn btn-ghost btn-sm" onclick="Cal.importCsv()">${icon('upload')} সিএসভি ইমপোর্ট</button>` : ''}${App.session && App.route.portal !== 'public' ? `<button class="btn btn-ghost btn-sm" onclick="Cal.exportCsv(${y})">${icon('download')} সিএসভি এক্সপোর্ট</button>` : ''}<span class="ml-auto"></span>${clsPick}<span class="text-slate-500">${bnNum(schoolDays)} কর্মদিবস${calCls ? ` · ${esc(DB.className(calCls))}` : ''}${campus && multiCampus() ? ` · ${esc(DB.campus(campus).short)} ক্যাম্পাস` : ''}</span></div>
        <div class="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-slate-400 mb-1">${U.DAYS_SHORT.map((x, i) => `<div class="${cal.weekends.includes(i) ? 'text-rose-400' : ''}">${x}</div>`).join('')}</div><div class="grid grid-cols-7 gap-1">${cells}</div>
        <div class="flex flex-wrap gap-2 mt-3 text-xs">${Object.entries(this.TONE).map(([k, c]) => `<span class="badge border ${c}">${this.LABEL[k]}</span>`).join('')}<span class="badge bg-slate-100 text-slate-500">সাপ্তাহিক ছুটি (${cal.weekends.map(w => U.DAYS_SHORT[w]).join(' + ')})</span>${editable ? '<span class="text-slate-400">যোগ করতে কোনো দিনে ক্লিক করুন · সম্পাদনা করতে কোনো এন্ট্রিতে ক্লিক করুন</span>' : ''}</div></div>
      <div class="space-y-5">${editable ? this.weekendCard() : ''}<div class="card"><div class="px-4 py-3 border-b border-slate-100 font-semibold">আসন্ন</div><div class="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">${upcoming.map(h => `<div class="px-4 py-2.5 text-sm flex items-center gap-2"><span class="w-2 h-8 rounded-full ${(this.TONE[h.type] || this.TONE.Event).split(' ')[0]}"></span><div class="flex-1 min-w-0"><div class="font-semibold truncate">${esc(h.name)}</div><div class="text-xs text-slate-500">${U.fmtDate(h.date)}${h.to ? ` – ${U.fmtDate(h.to)}` : ''} · ${esc(this.LABEL[h.type] || bn(h.type))}${h.campusId ? ` · কেবল ${esc(DB.campus(h.campusId).short)}` : ''}</div>${h.note ? `<div class="text-xs text-slate-400">${esc(h.note)}</div>` : ''}</div>${editable ? `<button class="btn btn-ghost btn-sm" title="সম্পাদনা" onclick="Cal.edit('${h.id}')">${icon('pencil')}</button>` : ''}</div>`).join('') || emptyState('কিছুই নির্ধারিত নেই।')}</div></div></div></div>`;
  },
  weekendCard() {
    const cal = DB.s.calendar;
    const oh = this.officeHours();
    return `<div class="card p-4"><div class="label">সাপ্তাহিক ছুটির দিন</div><div class="flex flex-wrap gap-2 text-sm">${U.DAYS_SHORT.map((d, i) => `<label class="flex items-center gap-1"><input type="checkbox" ${cal.weekends.includes(i) ? 'checked' : ''} onchange="Cal.toggleWeekend(${i},this.checked)"> ${d}</label>`).join('')}</div>
      <form class="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-2" onsubmit="Cal.saveHours(this);return false"><div class="col-span-2 label !mb-0">দাপ্তরিক সময়</div>
        <div><label class="label">শুরু</label><input type="time" class="input" name="from" value="${esc(oh.from)}"></div><div><label class="label">শেষ</label><input type="time" class="input" name="to" value="${esc(oh.to)}"></div>
        <div class="col-span-2"><label class="label">মন্তব্য (ঐচ্ছিক)</label><input class="input" name="note" value="${esc(cal.officeHours?.note || '')}" placeholder="যেমন: রমজানে সকাল ৯টা – দুপুর ১টা"></div>
        <button class="btn btn-primary btn-sm col-span-2">${icon('save')} দাপ্তরিক সময় সংরক্ষণ করুন</button></form></div>`;
  },
  /** Office hours: set in the calendar settings, else the earliest shift start to the latest shift end. */
  officeHours() {
    const o = DB.s.calendar.officeHours || {}, S = (DB.s.school.shifts || []).filter(s => s.start && s.end);
    const from = o.from || (S.length ? S.map(s => s.start).sort()[0] : ''), to = o.to || (S.length ? S.map(s => s.end).sort().slice(-1)[0] : '');
    return { from, to, note: o.note || '' };
  },
  saveHours(f) {
    const d = formData(f); if (d.from && d.to && d.to <= d.from) return toast('শেষের সময় শুরুর পরে হতে হবে।', 'error');
    DB.s.calendar.officeHours = { from: d.from || '', to: d.to || '', note: (d.note || '').trim() };
    DB.audit('OFFICE_HOURS', 'calendar', `${d.from || '—'}–${d.to || '—'}`); DB.save(); toast('দাপ্তরিক সময় সংরক্ষিত হয়েছে।', 'success'); App.refresh();
  },
  /** Add (id = null) or edit an entry. Small form → pop-up. */
  edit(id, date, preset) {
    const wkd = !id && date && DB.s.calendar.weekends.includes(U.d(date).getDay());
    const h = id ? DB.s.calendar.holidays.find(x => x.id === id) : { name: wkd ? 'খোলা দিন (পূরণমূলক ক্লাস)' : '', date: date || U.today(), to: null, type: wkd ? 'Open' : 'Event', campusId: null, note: '', ...(preset || {}) };
    Modal.open({
      title: id ? 'ক্যালেন্ডার এন্ট্রি সম্পাদনা' : 'ক্যালেন্ডার এন্ট্রি যোগ করুন', size: 'md',
      body: `<form id="cal-form" class="grid grid-cols-2 gap-3"><div class="col-span-2"><label class="label">শিরোনাম</label><input class="input" name="name" value="${esc(h.name)}" required placeholder="যেমন: অভিভাবক সভা, বার্ষিক ক্রীড়া, ঈদের ছুটি"></div>
        <div><label class="label">হতে</label><input type="date" class="input" name="date" value="${h.date}" required oninput="const a=document.getElementById('cal-alt');if(a)a.textContent=this.value?U.altDates(this.value).join(' · '):''"></div><div><label class="label">পর্যন্ত (ঐচ্ছিক)</label><input type="date" class="input" name="to" value="${h.to || ''}"></div>
        <div class="col-span-2 text-slate-500 -mt-1" id="cal-alt">${esc(U.altDates(h.date).join(' · '))}</div>
        <div><label class="label">ধরন</label><select class="select" name="type">${Object.keys(this.TONE).map(t => `<option value="${t}" ${t === h.type ? 'selected' : ''}>${this.LABEL[t]}</option>`).join('')}</select></div><div><label class="label">প্রযোজ্য</label><select class="select" name="campusId"><option data-cmp value="">সকল ক্যাম্পাস</option>${campusOptions(h.campusId || '')}</select></div>
        <div class="col-span-2"><label class="label">মন্তব্য (ঐচ্ছিক)</label><input class="input" name="note" value="${esc(h.note || '')}"></div>
        <label class="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" name="notify"> এই ${id ? 'পরিবর্তন' : 'এন্ট্রি'} সম্পর্কে অভিভাবক ও কর্মীদের এসএমএস পাঠান</label>
        <div class="col-span-2 flex gap-2">${id ? `<button type="button" class="btn btn-ghost text-red-600" onclick="Cal.remove('${id}')">${icon('trash-2')} মুছে ফেলুন</button>` : ''}<button class="btn btn-primary flex-1">${icon('save')} ${id ? 'পরিবর্তন সংরক্ষণ করুন' : 'ক্যালেন্ডারে যোগ করুন'}</button></div></form>`,
    });
    $('#cal-form').addEventListener('submit', e => {
      e.preventDefault(); const f = formData(e.target);
      if (f.to && f.to < f.date) return toast('শেষের তারিখ শুরুর তারিখের আগে।', 'error');
      const rec = { date: f.date, to: f.to || null, name: f.name, type: f.type, campusId: f.campusId || null, note: f.note || '' };
      if (id) Object.assign(h, rec); else DB.s.calendar.holidays.push({ id: DB.id('HOL'), ...rec });
      if (e.target.notify.checked) Principal.audience(f.campusId ? `Campus:${f.campusId}` : 'Everyone').forEach(u => DB.sms(u.phone, `${DB.s.school.shortName}: ${id ? 'আপডেট — ' : ''}${f.name} — ${U.fmtDate(f.date)}${f.to ? ` থেকে ${U.fmtDate(f.to)}` : ''}${f.type === 'Public' || f.type === 'School' ? '। বিদ্যালয় বন্ধ থাকবে।' : f.type === 'Open' ? '। এই দিন বিদ্যালয় খোলা থাকবে (নিয়মিত ক্লাস)।' : '।'}`));
      DB.audit(id ? 'CALENDAR_EDIT' : 'CALENDAR_ADD', 'calendar', `${f.name} ${f.date}${f.to ? '→' + f.to : ''} (${f.type}${f.campusId ? ', ' + f.campusId : ''})`); DB.save();
      Modal.close(); App.ui.calM = f.date.slice(0, 7); toast(id ? 'ক্যালেন্ডার এন্ট্রি আপডেট করা হয়েছে।' : 'একাডেমিক ক্যালেন্ডারে যোগ করা হয়েছে।', 'success'); App.refresh();
    });
  },
  /** Whole-year list of holidays, exam periods, events and open days, month by month (printable). */
  yearList(year) {
    const campus = this.campusFor(), rows = () => {
      const y = App.ui.calY || year, list = DB.s.calendar.holidays.filter(h => (h.date.slice(0, 4) <= String(y) && (h.to || h.date).slice(0, 4) >= String(y)) && (!h.campusId || !campus || h.campusId === campus)).sort((a, b) => a.date.localeCompare(b.date));
      const days = h => Math.round((U.d(h.to || h.date) - U.d(h.date)) / 864e5) + 1;
      const closed = list.filter(h => h.type === 'Public' || h.type === 'School'), total = U.sum(closed, days);
      const byM = {}; list.forEach(h => (byM[h.date.slice(0, 7)] = byM[h.date.slice(0, 7)] || []).push(h));
      return { y, list, total, html: Object.keys(byM).sort().map(mk => `<div class="card mb-3"><div class="px-4 py-2 border-b border-slate-100 font-semibold text-brand-700">${U.monthName(mk)}</div><table class="table"><tbody>${byM[mk].map(h => `<tr><td class="w-40 whitespace-nowrap">${U.fmtDate(h.date)}${h.to ? ` – ${U.fmtDate(h.to)}` : ''}</td><td class="font-semibold">${esc(h.name)}${h.note ? `<div class="text-xs text-slate-500 font-normal">${esc(h.note)}</div>` : ''}</td><td class="whitespace-nowrap"><span class="badge border ${this.TONE[h.type] || this.TONE.Event}">${esc(this.LABEL[h.type] || bn(h.type))}</span></td><td class="text-right whitespace-nowrap">${bnNum(days(h))} দিন</td></tr>`).join('')}</tbody></table></div>`).join('') || emptyState('এ বছরের জন্য কিছু নির্ধারিত নেই।') };
    };
    App.ui.calY = year;
    App.openDetail({
      title: `ছুটির তালিকা ${bnNum(year)}`,
      actions: `<button class="btn btn-ghost btn-sm" onclick="Cal.printYear()">${icon('printer')} মুদ্রণ</button>`,
      render: () => { const r = rows(); return `<div class="flex flex-wrap items-center gap-2 mb-4"><button class="btn btn-ghost btn-sm" onclick="App.ui.calY=${r.y - 1};App.refresh()">${icon('chevron-left')}</button><div class="font-bold text-lg">${bnNum(r.y)}</div><button class="btn btn-ghost btn-sm" onclick="App.ui.calY=${r.y + 1};App.refresh()">${icon('chevron-right')}</button><span class="ml-auto text-sm text-slate-600">${bnNum(r.list.length)}টি তালিকাভুক্ত · ${bnNum(r.total)} দিন বন্ধ</span></div>${r.html}`; },
    });
    this._yearRows = rows;
  },
  printYear(y) {
    if (y) App.ui.calY = y;
    // after a reload (print view re-build) the year list has not been opened yet: build its rows without showing it
    if (!this._yearRows) { const d0 = App.openDetail; App.openDetail = () => { }; try { this.yearList(y || new Date().getFullYear()); } finally { App.openDetail = d0; } }
    const r = this._yearRows();
    Print.preview(`ছুটির তালিকা ${bnNum(r.y)}`, [Print.sheet({}, 'padded') + Print.header(`ছুটির তালিকা ${bnNum(r.y)}`) + `<table style="width:100%;border-collapse:collapse;font-size:10pt">${r.list.map(h => `<tr style="border-bottom:.2mm solid #cbd5e1"><td style="padding:1.6mm 2mm;white-space:nowrap">${U.fmtDate(h.date)}${h.to ? ` – ${U.fmtDate(h.to)}` : ''}</td><td style="padding:1.6mm 2mm"><b>${esc(h.name)}</b></td><td style="padding:1.6mm 2mm">${esc(this.LABEL[h.type] || bn(h.type))}</td></tr>`).join('')}</table><p style="font-size:9pt;margin-top:4mm">${bnNum(r.total)} দিন বন্ধ</p><div style="position:absolute;bottom:22mm;right:14mm">${Print.signature('অধ্যক্ষ')}</div></div>`], { re: ['Cal.printYear', r.y] });
  },
  /** Mark a weekend / holiday as a working day (e.g. make-up class day). Opens the entry form pre-filled. */
  openDay(k) { this.edit(null, k, { type: 'Open', name: 'খোলা দিন (পূরণমূলক ক্লাস)' }); },
  /** "আশ্বিন–কার্তিক ১৪৩৩ · রবিউস সানি–জমাদিউল আউয়াল ১৪৪৮" for a Gregorian month (only the calendars switched on). */
  altMonths(y, m, place = 'calendar') {
    const a = new Date(y, m - 1, 1), b = new Date(y, m, 0);
    const span = (p, q) => p.month === q.month ? `${p.month} ${U.bn(p.y)}` : p.y === q.y ? `${p.month}–${q.month} ${U.bn(q.y)}` : `${p.month} ${U.bn(p.y)}–${q.month} ${U.bn(q.y)}`;
    return U.altOn(place).order.map(k => k === 'bangla' ? span(U.bnParts(a), U.bnParts(b)) + ' বঙ্গাব্দ' : span(U.hijriParts(a), U.hijriParts(b)) + ' হিজরি').join(' · ');
  },
  /** Day details (read-only calendars): the date in every calendar, school day or not, and the entries. */
  day(k) {
    const campus = this.campusFor(), evs = this.on(k, campus), open = U.isSchoolDay(k, null, campus), alt = U.altDates(k);
    Modal.open({
      title: `${U.dayBn(k)}, ${U.fmtDate(k)}`, size: 'sm',
      body: `${alt.length ? `<div class="flex flex-wrap gap-2 mb-3">${alt.map(a => `<span class="badge bg-brand-50 text-brand-800">${esc(a)}</span>`).join('')}</div>` : ''}
        <div class="mb-3 font-semibold ${open ? 'text-emerald-700' : 'text-rose-700'}">${icon(open ? 'check-circle' : 'calendar-off', 'w-4 h-4 inline -mt-0.5')} ${open ? 'প্রতিষ্ঠান খোলা' : 'প্রতিষ্ঠান বন্ধ'}${!open && !evs.length ? ' — সাপ্তাহিক ছুটি' : ''}</div>
        <div class="space-y-2">${evs.map(h => `<div class="rounded-lg border p-3 ${this.TONE[h.type] || this.TONE.Event}"><div class="font-semibold">${esc(h.name)}</div><div>${esc(this.LABEL[h.type] || bn(h.type))}${h.to && h.to !== h.date ? ` · ${U.fmtDate(h.date)} – ${U.fmtDate(h.to)}` : ''}${h.campusId && DB.campus(h.campusId) ? ` · কেবল ${esc(DB.campus(h.campusId).short || DB.campus(h.campusId).name)}` : ''}</div>${h.note ? `<div class="opacity-80">${esc(h.note)}</div>` : ''}</div>`).join('') || '<p class="text-slate-500">এ দিনের জন্য কিছু নির্ধারিত নেই।</p>'}</div>`,
    });
  },
  /* ---------- holidays CSV (columns: date, to, name, type, campus) — the shared CSV kit (csvkit.js) ---------- */
  TYPE_SPELL: { Public: ['public', 'সার্বজনীন ছুটি', 'সার্বজনীন', 'সরকারি ছুটি', 'সরকারি'], School: ['school', 'বিদ্যালয়ের ছুটি', 'প্রতিষ্ঠানের ছুটি', 'বিদ্যালয়'], Exam: ['exam', 'পরীক্ষাকাল', 'পরীক্ষা'], Event: ['event', 'অনুষ্ঠান', 'সভা', 'অনুষ্ঠান / সভা'], Open: ['open', 'খোলা দিন', 'খোলা'] },
  campusOf(v) { const n = String(v || '').trim().toLowerCase(); if (!n || /^(all|সকল|সব)/.test(n)) return null; const c = DB.s.campuses.find(x => [x.id, x.short, x.name].some(y => String(y || '').trim().toLowerCase() === n)); return c ? c.id : undefined; },
  csvSpec() {
    if (typeof CSVKit === 'undefined') return null;
    if (CSVKit.specs.holidays) return CSVKit.specs.holidays;
    return CSVKit.register('holidays', {
      label: 'ছুটি ও অনুষ্ঠান', icon: 'calendar-days', can: () => Cal.canEdit(),
      fields: [
        { k: 'date', label: 'তারিখ', en: 'date', type: 'date', required: true, aliases: ['from', 'হতে', 'শুরু'], example: `${new Date().getFullYear()}-12-16` },
        { k: 'to', label: 'পর্যন্ত', en: 'to', type: 'date', aliases: ['to-date', 'todate', 'end', 'শেষ'], example: '' },
        { k: 'name', label: 'শিরোনাম', en: 'name', required: true, aliases: ['title', 'নাম'], example: 'বিজয় দিবস' },
        { k: 'type', label: 'ধরন', en: 'type', type: 'enum', options: Object.entries(this.TYPE_SPELL).map(([k, v]) => [k, ...v]), example: 'Public', help: 'Public / School / Exam / Event / Open (বা বাংলায়: সার্বজনীন ছুটি, বিদ্যালয়ের ছুটি, পরীক্ষাকাল, অনুষ্ঠান, খোলা দিন)' },
        { k: 'campus', label: 'ক্যাম্পাস', en: 'campus', aliases: ['campusid'], example: '', help: 'ফাঁকা = সকল ক্যাম্পাস; নইলে ক্যাম্পাসের কোড বা নাম' },
      ],
      validate(rows) {
        rows.forEach(r => {
          const v = r.val;
          if (!v.type) v.type = 'Event';
          if (v.to && v.date && v.to < v.date) r.errors.push('“পর্যন্ত” তারিখ শুরুর তারিখের আগে');
          if (v.to === v.date) v.to = null;
          const c = Cal.campusOf(v.campus); if (c === undefined) r.errors.push(`ক্যাম্পাস “${v.campus}” পাওয়া যায়নি`); else v.campusId = c;
          if (DB.s.calendar.holidays.some(h => h.date === v.date && h.name.trim() === String(v.name || '').trim() && (h.campusId || null) === (v.campusId || null))) r.warnings.push('ক্যালেন্ডারে আগে থেকেই আছে — বাদ দেওয়া হবে');
        });
      },
      commit(ok) {
        let added = 0, skipped = 0;
        ok.forEach(r => {
          const v = r.val;
          if (DB.s.calendar.holidays.some(h => h.date === v.date && h.name.trim() === v.name.trim() && (h.campusId || null) === (v.campusId || null))) { skipped++; return; }
          DB.s.calendar.holidays.push({ id: DB.id('HOL'), date: v.date, to: v.to || null, name: v.name.trim(), type: v.type || 'Event', campusId: v.campusId || null, note: '' }); added++;
        });
        DB.audit('CALENDAR_IMPORT', 'calendar', `সিএসভি থেকে ${added}টি এন্ট্রি${skipped ? `, ${skipped}টি আগে থেকেই ছিল` : ''}`); DB.save();
        return `${bnNum(added)}টি এন্ট্রি ক্যালেন্ডারে যোগ হয়েছে${skipped ? ` · ${bnNum(skipped)}টি আগে থেকেই ছিল` : ''}।`;
      },
    });
  },
  importCsv() {
    if (!this.canEdit()) return toast('ক্যালেন্ডার পরিবর্তনের অনুমতি নেই।', 'error');
    if (!this.csvSpec()) return toast('সিএসভি ইমপোর্ট এখন পাওয়া যাচ্ছে না।', 'error');
    CSVKit.open('holidays', {});
  },
  exportCsv(year) {
    const campus = this.campusFor(), rows = DB.s.calendar.holidays.filter(h => (!year || (h.date.slice(0, 4) <= String(year) && (h.to || h.date).slice(0, 4) >= String(year))) && (!h.campusId || !campus || h.campusId === campus)).sort((a, b) => a.date.localeCompare(b.date));
    const cols = [{ k: 'date', label: 'তারিখ', en: 'date', get: h => h.date }, { k: 'to', label: 'পর্যন্ত', en: 'to', get: h => h.to || '' }, { k: 'name', label: 'শিরোনাম', en: 'name', get: h => h.name },
      { k: 'type', label: 'ধরন', en: 'type', get: h => h.type }, { k: 'campus', label: 'ক্যাম্পাস', en: 'campus', get: h => h.campusId || '' }, { k: 'note', label: 'মন্তব্য', en: 'note', get: h => h.note || '', on: false }];
    if (typeof CSVKit !== 'undefined' && CSVKit.exportDialog) return CSVKit.exportDialog({ title: `ছুটি ও অনুষ্ঠান ${year ? bnNum(year) : ''}`, filename: `holidays-${year || 'all'}.csv`, rows, cols });
    downloadFile(`holidays-${year || 'all'}.csv`, '﻿' + [cols.slice(0, 5).map(c => c.en), ...rows.map(h => cols.slice(0, 5).map(c => c.get(h)))].map(r => r.map(v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  },
  bind() { },
  remove(id) { const h = DB.s.calendar.holidays.find(x => x.id === id); if (!confirm(`ক্যালেন্ডার থেকে "${h.name}" মুছে ফেলবেন?`)) return; DB.s.calendar.holidays = DB.s.calendar.holidays.filter(x => x.id !== id); DB.audit('CALENDAR_REMOVE', 'calendar', h.name); DB.save(); Modal.close(); App.refresh(); },
  toggleWeekend(day, on) {
    const w = DB.s.calendar.weekends; on ? w.push(day) : w.splice(w.indexOf(day), 1); w.sort();
    if (w.length > 3) { w.splice(w.indexOf(day), 1); return toast('সর্বোচ্চ তিনটি সাপ্তাহিক ছুটির দিন নির্ধারণ করা যায়।', 'error'); }
    DB.audit('WEEKEND_CONFIG', 'calendar', `Weekends: ${w.join(',')}`); DB.save(); App.refresh();
  },
};

const calPage = () => ({ id: 'calendar', label: 'একাডেমিক ক্যালেন্ডার', icon: 'calendar-days', render() { return pageHeader('একাডেমিক ক্যালেন্ডার', 'সাপ্তাহিক ছুটি, ছুটির দিন, পরীক্ষাকাল ও বিদ্যালয়ের অনুষ্ঠান।') + Cal.view(Cal.canEdit()); }, mount() { Cal.bind(); } });
App.addPage('principal', calPage(true), 'exams');
App.addPage('teacher', calPage(false));
App.addPage('student', calPage(false));
App.addPage('guardian', calPage(false));
App.addPage('admin', calPage(false), 'system');
App.addPage('public', { id: 'calendar', label: 'ক্যালেন্ডার', icon: 'calendar-days', render() { return Pub.wrap(Pub.hero('একাডেমিক ক্যালেন্ডার', multiCampus() ? 'সকল ক্যাম্পাসের ছুটির দিন, সাপ্তাহিক ছুটি ও পরীক্ষাকাল।' : 'ছুটির দিন, সাপ্তাহিক ছুটি ও পরীক্ষাকাল।') + `<section class="max-w-6xl mx-auto px-4 py-10"><div class="flex gap-2 mb-4"><select class="select !w-auto" onchange="App.ui.calCampus=this.value||null;App.refresh()"><option value="">সকল ক্যাম্পাস</option>${campusOptions(App.ui.calCampus || '')}</select></div>${Cal.view(false)}</section>`); } }, 'notices');
App.portals.public.nav.splice(4, 0, ['calendar', 'ক্যালেন্ডার']);
