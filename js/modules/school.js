/* ==========================================================================
   বিদ্যালয় পরিচালনা — বিষয়, উপদেষ্টা, প্রবেশাধিকার, পাঠ-উপকরণ, পাঠ্যসূচি বুকলেট
   · বিষয়সমূহ: বিষয় যোগ/নাম পরিবর্তন/বন্ধ, শ্রেণিভিত্তিক বিষয় নির্ধারণ
   · উপদেষ্টা ও শ্রেণিশিক্ষক: একজন শিক্ষক একাধিক শ্রেণির শ্রেণিশিক্ষক এবং ভিন্ন ভিন্ন
     শ্রেণির একাধিক শিক্ষার্থীর উপদেষ্টা হতে পারেন; শিক্ষকের “আমার শিক্ষার্থী” পাতা
   · প্রবেশাধিকার: ভূমিকাভিত্তিক পাতা চালু/বন্ধ, নির্দিষ্ট ব্যবহারকারীর দেখা/সম্পাদনার ক্ষমতা
   · পাঠ-উপকরণ: পিডিএফ, ছবি, অডিও, ভিডিও বা লিংক (ইউটিউবসহ)
   · পাঠ্যক্রম বুকলেট: বইয়ের মতো নকশায় পূর্ণ পাঠ্যক্রম (কারিকুলাম) (প্রচ্ছদ, সূচিপত্র, বিষয়ভিত্তিক অধ্যায়)
   ========================================================================== */

/* ---------------- বিষয়সমূহ ---------------- */
const Subjects = {
  KIND: { core: 'আবশ্যিক', elective: 'ঐচ্ছিক', practical: 'ব্যবহারিক', religion: 'ধর্ম ও নৈতিকতা' },
  used(id) { return DB.s.marks.some(m => m.subjectId === id) || DB.s.routine.some(r => RT.subs(r).includes(id)) || DB.s.teachers.some(t => t.subjects.includes(id)); },
  editor() {
    const can = Settings.canEdit(), dis = can ? '' : 'disabled', S = DB.s.subjects, cls = DB.classesIn();
    return `<div class="grid xl:grid-cols-5 gap-5 items-start">
      <div class="card xl:col-span-2"><div class="px-5 py-3 border-b border-slate-100 font-semibold">বিষয়ের তালিকা <span class="text-xs font-normal text-slate-400">— সব ক্যাম্পাসে প্রযোজ্য</span></div>
        <div class="divide-y divide-slate-100">${S.map(s => `<form class="px-4 py-2.5 grid grid-cols-[5rem_1fr_auto] gap-2 items-center ${s.active === false ? 'opacity-50' : ''}" onsubmit="Subjects.save('${s.id}',this);return false">
          <input class="input !py-1 font-mono text-xs uppercase" name="code" value="${esc(s.code || s.id)}" ${dis} title="কোড">
          <div class="flex gap-2"><input class="input !py-1" name="name" value="${esc(s.name)}" required ${dis}><select class="select !py-1 !w-32" name="kind" ${dis}>${Object.entries(this.KIND).map(([k, l]) => `<option value="${k}" ${(s.kind || 'core') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          ${can ? `<div class="flex gap-1"><button class="btn btn-ghost btn-sm" title="সংরক্ষণ">${icon('save')}</button><button type="button" class="btn btn-ghost btn-sm" title="${s.active === false ? 'চালু করুন' : 'বন্ধ করুন'}" onclick="Subjects.toggle('${s.id}')">${icon(s.active === false ? 'eye' : 'eye-off')}</button>${this.used(s.id) ? '' : `<button type="button" class="btn btn-ghost btn-sm" title="মুছুন" onclick="Subjects.del('${s.id}')">${icon('trash-2')}</button>`}</div>` : ''}</form>`).join('')}</div>
        ${can ? `<form class="p-4 border-t border-slate-100 grid grid-cols-[5rem_1fr_auto] gap-2" onsubmit="Subjects.add(this);return false"><input class="input !py-1 font-mono text-xs uppercase" name="code" placeholder="কোড" required pattern="[A-Za-z0-9]{2,8}"><input class="input !py-1" name="name" placeholder="নতুন বিষয়ের নাম (যেমন: পদার্থবিজ্ঞান)" required><button class="btn btn-primary btn-sm">${icon('plus')} যোগ</button></form>` : ''}
        <p class="px-4 pb-4 text-xs text-slate-500">যে বিষয়ে নম্বর, রুটিন বা শিক্ষক যুক্ত আছে তা মোছা যায় না — বন্ধ করে রাখা যায়।</p></div>
      <div class="card xl:col-span-3 scroll-x"><div class="px-5 py-3 border-b border-slate-100 font-semibold">শ্রেণিভিত্তিক বিষয় — ${esc(DB.campus().name)} <span class="text-xs font-normal text-slate-400">— টিক দেওয়া বিষয়ই ফলাফল, নম্বরপত্র ও পরীক্ষা সেটআপে আসবে</span></div>
        <table class="table"><thead><tr><th>শ্রেণি</th>${S.filter(s => s.active !== false).map(s => `<th class="text-center text-xs">${esc(s.name)}</th>`).join('')}</tr></thead><tbody>${cls.map(c => { const has = DB.classSubjects(c.id).map(s => s.id); return `<tr><td class="font-semibold whitespace-nowrap">${esc(c.name)}</td>${S.filter(s => s.active !== false).map(s => `<td class="text-center"><input type="checkbox" class="w-4 h-4" ${has.includes(s.id) ? 'checked' : ''} ${dis} onchange="Subjects.setClass('${c.id}','${s.id}',this.checked)"></td>`).join('')}</tr>`; }).join('')}</tbody></table></div></div>`;
  },
  add(f) {
    const d = formData(f), id = d.code.toUpperCase();
    if (DB.subject(id)) return toast('এই কোডের বিষয় আগে থেকেই আছে।', 'error');
    DB.s.subjects.push({ id, code: id, name: d.name, kind: 'core' });
    DB.s.classes.filter(c => c.subjects?.length).forEach(c => { if (!c.subjects.includes(id)) c.subjects.push(id); });   // already-customised classes get it too (untick if not taught)
    Settings.save(`বিষয় “${d.name}” যোগ করা হয়েছে।`, `subject ${id} added`);
  },
  save(id, f) { const s = DB.subject(id), d = formData(f); Object.assign(s, { code: d.code.toUpperCase() || s.code, name: d.name, kind: d.kind }); Settings.save('বিষয় সংরক্ষিত হয়েছে।', `subject ${id} edited`); },
  toggle(id) { const s = DB.subject(id); s.active = s.active === false; Settings.save(s.active === false ? 'বিষয়টি বন্ধ করা হয়েছে।' : 'বিষয়টি চালু করা হয়েছে।', `subject ${id} active=${s.active !== false}`); },
  del(id) { if (this.used(id)) return toast('এই বিষয় ব্যবহৃত হচ্ছে — মোছা যাবে না, বন্ধ করে রাখুন।', 'error'); if (!confirm('বিষয়টি মুছে ফেলবেন?')) return; DB.s.subjects = DB.s.subjects.filter(s => s.id !== id); DB.s.classes.forEach(c => { if (c.subjects) c.subjects = c.subjects.filter(x => x !== id); }); Settings.save('বিষয় মুছে ফেলা হয়েছে।', `subject ${id} deleted`); },
  setClass(classId, sid, on) {
    const c = DB.cls(classId); if (!c.subjects || !c.subjects.length) c.subjects = DB.s.subjects.map(s => s.id);
    c.subjects = on ? [...new Set([...c.subjects, sid])] : c.subjects.filter(x => x !== sid);
    DB.audit('CLASS_SUBJECTS', 'classes', `${classId}: ${c.subjects.join(',')}`); DB.save();
  },
};
Settings.TABS.splice(Settings.TABS.findIndex(t => t[0] === 'policy'), 0, ['subjects', 'বিষয়সমূহ', 'book-marked']);
Settings.subjects = () => Subjects.editor();

/* ---------------- উপদেষ্টা ও শ্রেণিশিক্ষক ---------------- */
const Advisors = {
  classesOf(tid) { return DB.s.classes.filter(c => c.classTeacherId === tid || Object.values(c.sectionTeachers || {}).includes(tid)); },
  adviseesOf(tid) { return DB.activeStudents('ALL').filter(s => s.advisorId === tid); },
  page() {
    const T = DB.teachersIn(), can = App.perm('students', 'edit');
    return pageHeader('উপদেষ্টা ও শ্রেণিশিক্ষক', '',can ? `<button class="btn btn-primary" onclick="Advisors.bulk()">${icon('users')} একসাথে নির্ধারণ</button>` : '')
      + `<div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">${T.map(t => { const u = DB.user(t.userId), cs = this.classesOf(t.id), ad = this.adviseesOf(t.id); return `<div class="card p-4 flex flex-col gap-3"><div class="flex items-center gap-3">${avatar(u, 40)}<div class="min-w-0 flex-1"><div class="font-semibold truncate">${esc(pn(u))}</div><div class="text-xs text-slate-500">${esc(bn(t.designation))} · ${esc((t.subjects || []).map(s => DB.subject(s)?.name).filter(Boolean).join(', '))}</div></div></div>
        <div class="text-sm"><div class="text-xs font-semibold text-slate-500 mb-1">শ্রেণিশিক্ষক</div>${cs.length ? cs.map(c => badge(c.name + (c.classTeacherId === t.id ? '' : ' (শাখা)'), 'green')).join(' ') : '<span class="text-slate-400 text-xs">নেই</span>'}</div>
        <div class="text-sm"><div class="text-xs font-semibold text-slate-500 mb-1">উপদেষ্টা — ${bnNum(ad.length)} জন শিক্ষার্থী</div>${ad.slice(0, 6).map(s => badge(pn(s).split(' ')[0] + ' · ' + DB.className(s.classId), 'violet')).join(' ')}${ad.length > 6 ? ` <span class="text-xs text-slate-400">+${bnNum(ad.length - 6)}</span>` : ''}</div>
        ${can ? `<button class="btn btn-ghost btn-sm self-start mt-auto" onclick="Advisors.edit('${t.id}')">${icon('pencil')} নির্ধারণ করুন</button>` : ''}</div>`; }).join('') || emptyState('এই ক্যাম্পাসে কোনো শিক্ষক নেই।')}</div>`;
  },
  edit(tid) {
    const t = DB.teacher(tid), u = DB.user(t.userId);
    App.openDetail({
      title: `দায়িত্ব নির্ধারণ · ${pn(u)}`,
      render: () => { const ad = this.adviseesOf(tid); return `<div class="grid lg:grid-cols-2 gap-5 max-w-5xl">
        <div class="card p-5"><div class="font-semibold mb-1">শ্রেণিশিক্ষক হিসেবে</div><p class="text-xs text-slate-500 mb-3">নতুন করে টিক দিলে সেই শ্রেণির আগের শ্রেণিশিক্ষক বদলে যাবেন।</p>
          <div class="grid sm:grid-cols-2 gap-2">${DB.classesIn(t.campusId).map(c => { const other = c.classTeacherId && c.classTeacherId !== tid ? DB.teacherName(c.classTeacherId) : ''; return `<label class="flex items-start gap-2 text-sm border border-slate-200 rounded-lg px-3 py-2"><input type="checkbox" class="mt-0.5" ${c.classTeacherId === tid ? 'checked' : ''} onchange="Advisors.setClass('${tid}','${c.id}',this.checked)"><span>${esc(c.name)}${other ? `<span class="block text-[11px] text-slate-400">এখন: ${esc(other)}</span>` : ''}</span></label>`; }).join('')}</div></div>
        <div class="card p-5"><div class="font-semibold mb-3">উপদেষ্টা হিসেবে</div>
          <form onsubmit="return false" class="mb-3">${studentPicker('adv', '', { campus: 'ALL', onPick: `if(id){Advisors.add('${tid}',id)}` })}</form>
          <div class="divide-y divide-slate-100">${ad.map(s => `<div class="py-2 flex items-center gap-3 text-sm">${avatar(s, 28)}<div class="flex-1 min-w-0"><div class="font-semibold truncate">${esc(pn(s))}</div><div class="text-xs text-slate-500">${esc(DB.className(s.classId))}${s.section ? '-' + esc(s.section) : ''} · রোল ${bnNum(s.roll)}</div></div><button class="btn btn-ghost btn-sm" title="সরিয়ে দিন" onclick="Advisors.remove('${s.id}')">${icon('x')}</button></div>`).join('') || '<p class="text-sm text-slate-400">এখনও কোনো শিক্ষার্থী নেই।</p>'}</div></div></div>`; },
    });
  },
  /** একসাথে অনেক শিক্ষার্থীকে (ভিন্ন শ্রেণিরও) একজন উপদেষ্টার অধীনে দেওয়া */
  bulk() {
    const B = App.ui.advB || (App.ui.advB = { cls: DB.classesIn()[0]?.id, sel: {}, q: '', tid: '' });
    App.openDetail({
      title: 'একসাথে উপদেষ্টা নির্ধারণ',
      render: () => {
        const list = DB.studentsIn(B.cls).filter(s => !B.q || `${s.name} ${s.nameBn || ''} ${s.id} ${s.roll}`.toLowerCase().includes(B.q.toLowerCase()));
        const n = Object.keys(B.sel).length, all = list.length && list.every(s => B.sel[s.id]);
        return `<div class="grid lg:grid-cols-3 gap-5 max-w-6xl"><div class="lg:col-span-2 space-y-4"><div class="card p-4"><div class="label mb-2">শ্রেণি</div>${pills(DB.classesIn().map(c => [c.id, c.name, 'users']), B.cls, id => `App.ui.advB.cls='${id}';App.refresh()`)}
            <input class="input mt-3" placeholder="নাম, আইডি বা রোল দিয়ে খুঁজুন…" value="${esc(B.q)}" oninput="App.ui.advB.q=this.value;clearTimeout(window.__advT);window.__advT=setTimeout(()=>{App.refresh();const i=document.querySelector('#adv-q');i&&(i.focus(),i.setSelectionRange(i.value.length,i.value.length))},250)" id="adv-q"></div>
          <div class="card"><label class="px-4 py-3 border-b border-slate-100 flex items-center gap-3 cursor-pointer"><input type="checkbox" class="w-5 h-5" ${all ? 'checked' : ''} onchange="DB.studentsIn(App.ui.advB.cls).forEach(s=>{if(this.checked)App.ui.advB.sel[s.id]=1;else delete App.ui.advB.sel[s.id]});App.refresh()"><b>এই শ্রেণির সবাই</b></label>
            <div class="divide-y divide-slate-100">${list.map(s => `<label class="px-4 py-2.5 flex items-center gap-3 cursor-pointer"><input type="checkbox" class="w-5 h-5" ${B.sel[s.id] ? 'checked' : ''} onchange="if(this.checked)App.ui.advB.sel['${s.id}']=1;else delete App.ui.advB.sel['${s.id}'];App.refresh()">${avatar(s, 30)}<span class="flex-1 min-w-0"><span class="block font-semibold truncate">${esc(pn(s))}</span><span class="block text-slate-500">রোল ${bnNum(s.roll)} · ${esc(s.section)}${s.advisorId ? ` · বর্তমান উপদেষ্টা: ${esc(DB.teacherName(s.advisorId))}` : ''}</span></span></label>`).join('') || emptyState('কেউ নেই।')}</div></div></div>
          <div class="card p-5 space-y-4 self-start lg:sticky lg:top-24"><div class="font-semibold">নির্বাচিত: ${bnNum(n)} জন শিক্ষার্থী</div>
            <div><label class="label">উপদেষ্টা শিক্ষক</label><select class="select" onchange="App.ui.advB.tid=this.value"><option value="">— বেছে নিন —</option>${DB.s.teachers.filter(t => t.status !== 'Resigned').map(t => `<option value="${t.id}" ${B.tid === t.id ? 'selected' : ''}>${esc(DB.teacherName(t.id))}</option>`).join('')}</select></div>
            <button class="btn btn-primary w-full" ${n ? '' : 'disabled'} onclick="Advisors.bulkSave()">${icon('user-check')} উপদেষ্টা নির্ধারণ করুন</button>
            <button class="btn btn-ghost w-full" ${n ? '' : 'disabled'} onclick="Advisors.bulkSave(true)">${icon('user-x')} নির্বাচিতদের উপদেষ্টা সরান</button>
            ${n ? `<button class="btn btn-ghost btn-sm w-full" onclick="App.ui.advB.sel={};App.refresh()">নির্বাচন মুছুন</button>` : ''}</div></div>`;
      },
    });
  },
  bulkSave(remove) {
    const B = App.ui.advB, ids = Object.keys(B.sel);
    if (!remove && !B.tid) return toast('একজন উপদেষ্টা শিক্ষক বেছে নিন।', 'error');
    ids.forEach(id => { const s = DB.student(id); if (s) s.advisorId = remove ? null : B.tid; });
    DB.audit('ADVISOR_BULK', 'students', `${ids.length} জন → ${remove ? '—' : B.tid}`); DB.save();
    toast(remove ? `${bnNum(ids.length)} জনের উপদেষ্টা সরানো হয়েছে।` : `${bnNum(ids.length)} জন শিক্ষার্থীকে ${DB.teacherName(B.tid)}-এর অধীনে দেওয়া হয়েছে।`, 'success');
    B.sel = {}; App.refresh();
  },
  setClass(tid, cid, on) { const c = DB.cls(cid); c.classTeacherId = on ? tid : (c.classTeacherId === tid ? null : c.classTeacherId); DB.audit('CLASS_TEACHER', 'classes', `${cid} → ${c.classTeacherId || '—'}`); DB.save(); App.refresh(); },
  add(tid, sid) { const s = DB.student(sid); if (s.advisorId && s.advisorId !== tid && !confirm(`${pn(s)}-এর বর্তমান উপদেষ্টা ${DB.teacherName(s.advisorId)}। পরিবর্তন করবেন?`)) return App.refresh(); s.advisorId = tid; DB.audit('ADVISOR_SET', 'students', `${sid} → ${tid}`); DB.save(); toast(`${pn(s)} যুক্ত হয়েছে।`, 'success'); App.refresh(); },
  remove(sid) { const s = DB.student(sid); s.advisorId = null; DB.audit('ADVISOR_SET', 'students', `${sid} → —`); DB.save(); App.refresh(); },
  /** শিক্ষকের নিজের পাতা */
  mine() {
    const t = Teacher.me(); if (!t) return emptyState('শিক্ষক প্রোফাইল পাওয়া যায়নি।');
    const cs = this.classesOf(t.id), ad = this.adviseesOf(t.id);
    const row = s => { const a = DB.attendanceStats(s.id), r = DB.latestExam() ? DB.result(s.id, DB.latestExam().id) : null, due = DB.dues(s.id); return `<tr><td>${avatar(s, 28)}</td><td><div class="font-semibold">${esc(pn(s))}</div><div class="text-xs text-slate-500">${esc(DB.className(s.classId))}${s.section ? '-' + esc(s.section) : ''} · রোল ${bnNum(s.roll)}</div></td><td class="${a.pct < DB.s.school.minAttendance ? 'text-red-600 font-semibold' : ''}">${bnNum(a.pct.toFixed(0))}%</td><td>${r ? gpaFmt(r.gpa) : '—'}</td><td>${due ? `<span class="text-red-600">${U.money(due)}</span>` : 'নেই'}</td><td><button class="btn btn-ghost btn-sm" onclick="Dossier.open('${s.id}')">${icon('eye')} প্রোফাইল</button></td></tr>`; };
    const table = list => `<div class="card scroll-x"><table class="table"><thead><tr><th></th><th>শিক্ষার্থী</th><th>উপস্থিতি</th><th>জিপিএ</th><th>বকেয়া</th><th></th></tr></thead><tbody>${list.map(row).join('')}</tbody></table>${list.length ? '' : emptyState('কেউ নেই।')}</div>`;
    return pageHeader('আমার শিক্ষার্থী')
      + (cs.length ? cs.map(c => `<div class="font-semibold mt-2 mb-2">${icon('users', 'w-4 h-4 inline text-brand-600')} শ্রেণিশিক্ষক — ${esc(c.name)} <span class="text-xs font-normal text-slate-500">(${bnNum(DB.studentsIn(c.id).length)} জন)</span></div>${table(DB.studentsIn(c.id))}`).join('<div class="h-4"></div>') : `<div class="card p-4 text-sm text-slate-500 mb-4">আপনি কোনো শ্রেণির শ্রেণিশিক্ষক নন।</div>`)
      + `<div class="font-semibold mt-6 mb-2">${icon('user-check', 'w-4 h-4 inline text-brand-600')} উপদেষ্টা হিসেবে — ${bnNum(ad.length)} জন</div>${table(ad)}`;
  },
};
const advPage = { id: 'advisors', label: 'শ্রেণি শিক্ষক ও উপদেষ্টা', icon: 'user-cog', module: 'students', render() { return Advisors.page(); } };
/** Put a new page in the same sidebar group as a neighbour page. */
const addBeside = (portal, page, after) => { const P = App.portals[portal], nb = P?.pages.find(x => x.id === after); App.addPage(portal, { ...page, group: page.group || nb?.group }, nb ? after : undefined); };
addBeside('principal', advPage, 'dossier');
addBeside('admin', advPage, 'settings');
addBeside('teacher', { id: 'my-students', label: 'আমার শিক্ষার্থী', icon: 'users-round', module: 'students', render() { return Advisors.mine(); } }, 'today');

/* ---------------- প্রবেশাধিকার: ভূমিকাভিত্তিক পাতা ও ব্যবহারকারীভিত্তিক ক্ষমতা ---------------- */
const Access = {
  pageOff(role, pageId) { return DB.s.pageAccess?.[role]?.[pageId] === false; },
  userPerm(uid, m, a) { return DB.s.userPerms?.[uid]?.[m]?.[a]; },
  /** ভূমিকা অনুযায়ী প্রতিটি পাতা চালু/বন্ধ */
  /** ভূমিকা অনুযায়ী পাতা চালু/বন্ধ — এক গ্রিড: সারি = পোর্টাল ও গ্রুপ অনুযায়ী পাতা, কলাম = ভূমিকা */
  /** One row per page id (across portals), grouped by sidebar group; one column per role. A role's cell controls
      the copy of the page in that role's portal (custom roles: their base portal); "—" where the portal lacks it. */
  matrix() {
    if (typeof navMergeRoot === 'function') navMergeRoot();
    const roles = Object.keys(ROLES), rows = new Map(), groups = [];
    roles.forEach(r => (App.portals[ROLES[r].portal]?.pages || []).forEach(p => {
      if (p.hidden) return;
      if (!rows.has(p.id)) { const g = p.group || 'অন্যান্য'; if (!groups.includes(g)) groups.push(g); rows.set(p.id, { id: p.id, label: p.label, icon: p.icon, group: g, roles: new Set(), ids: {} }); }
      const x = rows.get(p.id); x.roles.add(r); x.ids[r] = p.id;
    }));
    // the same feature under another id in another portal (e.g. online-tests / online-test): one row when the
    // labels match and no role has both
    const list = [];
    rows.forEach(x => { const t = list.find(y => y.label === x.label && ![...x.roles].some(r => y.roles.has(r))); if (t) { x.roles.forEach(r => { t.roles.add(r); t.ids[r] = x.ids[r]; }); } else list.push(x); });
    return { roles, groups: groups.map(g => ({ name: g, rows: list.filter(x => x.group === g) })).filter(g => g.rows.length) };
  },
  pagesGrid() {
    const { roles, groups } = this.matrix(), can = App.has('ADMIN'), col = App.ui.pgCol || (App.ui.pgCol = {});
    const on = (r, id) => r === 'ADMIN' || !this.pageOff(r, id), js = s => esc(JSON.stringify(s));
    const sb = (args, t) => can ? `<button class="rbx-b" onclick="Access.bulkPage(${args})" title="${t}">সব</button>` : '';
    let body = '';
    groups.forEach((g, gi) => {
      const shut = !!col[g.name], ids = g.rows.map(x => x.id);   // row keys; bulkPage maps them to each role's own page id
      body += `<tr class="rbx-g"><td class="rbx-s"><div class="flex items-center gap-2"><button type="button" class="flex items-center gap-1 font-semibold flex-1 min-w-0 text-left" aria-expanded="${!shut}" onclick="App.ui.pgCol[${js(g.name)}]=${!shut};App.refresh()">${icon(shut ? 'chevron-right' : 'chevron-down', 'w-4 h-4 shrink-0')}<span class="truncate">${esc(g.name)}</span><span class="text-slate-500 font-normal">${bnNum(g.rows.length)}</span></button>${sb(`null,${js(ids)}`, 'গ্রুপের সব চালু/বন্ধ')}</div></td>${roles.map(r => `<td class="text-center">${r !== 'ADMIN' && g.rows.some(x => x.roles.has(r)) ? sb(`'${r}',${js(ids)}`, 'এই গ্রুপে এই ভূমিকার সব চালু/বন্ধ') : ''}</td>`).join('')}</tr>`;
      if (shut) return;
      g.rows.forEach(p => {
        body += `<tr><td class="rbx-s"><div class="flex items-center gap-2">${icon(p.icon || 'file', 'w-4 h-4 text-slate-400 shrink-0')}<span class="flex-1 min-w-0 truncate" title="${esc(p.label)}">${esc(p.label)}</span>${[...p.roles].some(r => r !== 'ADMIN') ? sb(`null,${js([p.id])}`, 'সারির সব চালু/বন্ধ') : ''}</div></td>${roles.map(r => { const id = p.ids[r]; return `<td class="text-center">${id ? Settings.rbxCell(on(r, id), !can || r === 'ADMIN', `Access.setPage('${r}','${id}',${!on(r, id)});App.refresh()`, `${ROLES[r].label} · ${p.label}`) : '<span class="rbx-na" aria-label="প্রযোজ্য নয়">—</span>'}</td>`; }).join('')}</tr>`;
      });
    });
    return `<style>${typeof XG_CSS !== 'undefined' ? XG_CSS : ''}${Settings.RBX_CSS}</style><div class="xg-wrap mt-4" style="max-height:75vh"><table class="xg rbx"><thead><tr><th class="rbx-s">পাতা</th>${roles.map(r => `<th><div>${roleIcon(r)} ${esc(ROLES[r].label)}${r === 'ADMIN' ? ` ${icon('lock', 'w-4 h-4 inline')}` : ''}</div>${r !== 'ADMIN' ? sb(`'${r}',null`, 'এই ভূমিকার সব পাতা চালু/বন্ধ') : ''}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
  },
  /** একসাথে: role = null → সব ভূমিকা; pageIds = null → ভূমিকার পোর্টালের সব পাতা। সব চালু থাকলে বন্ধ, নইলে চালু (রুট বাদ) */
  bulkPage(role, pageIds) {
    const { roles, groups } = this.matrix(), rows = groups.flatMap(g => g.rows).filter(x => !pageIds || pageIds.includes(x.id));
    const cells = []; (role ? [role] : roles).filter(r => r !== 'ADMIN').forEach(r => rows.forEach(x => { if (x.ids[r]) cells.push([r, x.ids[r]]); }));
    if (!cells.length) return;
    const allOn = cells.every(([r, p]) => !this.pageOff(r, p));
    const a = DB.s.pageAccess || (DB.s.pageAccess = {});
    cells.forEach(([r, p]) => { a[r] = a[r] || {}; if (allOn) a[r][p] = false; else delete a[r][p]; });
    DB.audit('PAGE_ACCESS', 'rbac', `bulk ${role || '*'}.${pageIds ? pageIds.join(',') : '*'}=${!allOn}`); DB.save(); App.refresh();
  },
  setPage(role, pid, on) { if (role === 'ADMIN') return; const a = DB.s.pageAccess || (DB.s.pageAccess = {}); (a[role] = a[role] || {})[pid] = on ? undefined : false; if (on) delete a[role][pid]; DB.audit('PAGE_ACCESS', 'rbac', `${role}.${pid}=${on}`); DB.save(); },
  /** নির্দিষ্ট ব্যবহারকারীর জন্য মডিউল × কাজ — ভূমিকার নিয়মের ওপরে আলাদা অনুমতি */
  usersEditor() {
    const q = (App.ui.apQ || '').toLowerCase(), uid = App.ui.apU, can = App.has('ADMIN');
    const list = DB.s.users.filter(u => !q || `${u.name} ${u.nameBn || ''} ${u.username}`.toLowerCase().includes(q)).slice(0, 12);
    const u = uid && DB.user(uid);
    const left = `<div class="card p-4 self-start"><input class="input mb-3" placeholder="নাম বা ইউজার আইডি দিয়ে খুঁজুন…" value="${esc(App.ui.apQ || '')}" oninput="App.ui.apQ=this.value;clearTimeout(window.__apT);window.__apT=setTimeout(()=>{App.refresh();const i=document.querySelector('[placeholder^=&quot;নাম বা ইউজার&quot;]');i?.focus();i&&i.setSelectionRange(i.value.length,i.value.length)},250)">
      <div class="divide-y divide-slate-100">${list.map(x => `<button class="w-full text-left py-2 px-1 flex items-center gap-2 text-sm ${x.id === uid ? 'bg-brand-50' : 'hover:bg-slate-50'}" onclick="App.ui.apU='${x.id}';App.refresh()">${avatar(x, 26)}<span class="min-w-0 flex-1"><span class="block font-semibold truncate">${esc(pn(x))}</span><span class="block text-xs text-slate-500">@${esc(x.username)} · ${esc(DB.roles(x.id).map(bn).join(', '))}</span></span>${DB.s.userPerms?.[x.id] ? badge('বিশেষ', 'amber') : ''}</button>`).join('')}</div></div>`;
    if (!u) return `<div class="grid lg:grid-cols-3 gap-5">${left}<div class="lg:col-span-2 card p-6 text-sm text-slate-500">বাম থেকে একজন ব্যবহারকারী বেছে নিন।</div></div>`;
    const role = DB.roles(u.id)[0], o = DB.s.userPerms?.[u.id] || {};
    const cell = (m, a) => { const ov = o[m]?.[a], base = DB.perm(role, m, a); return `<td class="text-center"><select class="select !py-0.5 !px-1 !w-auto text-xs ${ov === undefined ? '' : ov ? '!border-emerald-500' : '!border-red-500'}" ${can ? '' : 'disabled'} onchange="Access.setUser('${u.id}','${m}','${a}',this.value)"><option value="" ${ov === undefined ? 'selected' : ''}>ভূমিকা (${base ? 'হ্যাঁ' : 'না'})</option><option value="1" ${ov === true ? 'selected' : ''}>হ্যাঁ</option><option value="0" ${ov === false ? 'selected' : ''}>না</option></select></td>`; };
    return `<div class="grid lg:grid-cols-3 gap-5">${left}<div class="lg:col-span-2 card scroll-x"><div class="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2"><div class="font-semibold">${esc(pn(u))}</div><span class="text-xs text-slate-500">ভূমিকা: ${esc(bn(role))}</span>${can && DB.s.userPerms?.[u.id] ? `<button class="btn btn-ghost btn-sm ml-auto" onclick="Access.clearUser('${u.id}')">${icon('rotate-ccw')} ভূমিকার নিয়মে ফেরান</button>` : ''}</div>
      <table class="table"><thead><tr><th>মডিউল</th>${PERM_ACTIONS.map(a => `<th class="text-center">${esc(Settings.PERM_BN?.[a] || a)}</th>`).join('')}</tr></thead><tbody>${Object.entries(PERM_MODULES).map(([m, l]) => `<tr><td class="font-semibold text-sm">${esc(l)}</td>${PERM_ACTIONS.map(a => cell(m, a)).join('')}</tr>`).join('')}</tbody></table>
      ${this.userPagesEditor(u, can)}</div></div>`;
  },
  /** এই ব্যক্তির জন্য পাতা আলাদাভাবে চালু/বন্ধ (ভূমিকার নিয়মের ওপরে) — যেমন একজন শিক্ষককে “শিক্ষক উপস্থিতি নিশ্চিতকরণ” পাতা দেওয়া */
  userPagesEditor(u, can) {
    const o = DB.s.userPages?.[u.id] || {}, portals = [...new Set(DB.roles(u.id).map(r => ROLES[r]?.portal).filter(Boolean))];
    return `<div class="border-t border-slate-100 p-4"><div class="font-semibold mb-3">পাতা — শুধু এই ব্যক্তির জন্য</div>
      ${portals.map(pid => `<div class="mb-3"><div class="text-slate-500 mb-1">${esc(App.portals[pid].title)}</div><div class="grid sm:grid-cols-2 gap-2">${App.portals[pid].pages.map(p => { const v = o[p.id]; return `<label class="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2">${icon(p.icon || 'file', 'w-4 h-4 text-slate-400 shrink-0')}<span class="flex-1 min-w-0 truncate">${esc(p.label)}</span><select class="select !py-0.5 !w-auto ${v === undefined ? '' : v ? '!border-emerald-500' : '!border-red-500'}" ${can ? '' : 'disabled'} onchange="Access.setUserPage('${u.id}','${p.id}',this.value)"><option value="" ${v === undefined ? 'selected' : ''}>ভূমিকা</option><option value="1" ${v === true ? 'selected' : ''}>চালু</option><option value="0" ${v === false ? 'selected' : ''}>বন্ধ</option></select></label>`; }).join('')}</div></div>`).join('')}</div>`;
  },
  userPageOverride(uid, pid) { return DB.s.userPages?.[uid]?.[pid]; },
  setUserPage(uid, pid, v) { const P = DB.s.userPages || (DB.s.userPages = {}); const o = (P[uid] = P[uid] || {}); if (v === '') delete o[pid]; else o[pid] = v === '1'; if (!Object.keys(o).length) delete P[uid]; DB.audit('USER_PAGE', 'rbac', `${uid}.${pid}=${v || 'role'}`); DB.save(); App.refresh(); },
  setUser(uid, m, a, v) { const P = DB.s.userPerms || (DB.s.userPerms = {}); const o = (P[uid] = P[uid] || {}); o[m] = o[m] || {}; if (v === '') delete o[m][a]; else o[m][a] = v === '1'; if (!Object.keys(o[m]).length) delete o[m]; if (!Object.keys(o).length) delete P[uid]; DB.audit('USER_PERM', 'rbac', `${uid}.${m}.${a}=${v || 'role'}`); DB.save(); App.refresh(); },
  clearUser(uid) { delete DB.s.userPerms[uid]; DB.audit('USER_PERM', 'rbac', `${uid} reset`); DB.save(); App.refresh(); },
};
// ব্যক্তিগত অনুমতি ভূমিকার নিয়মের ওপরে, আর বন্ধ পাতা মেনু ও লিংক দুই জায়গাতেই আটকানো
(() => {
  const p0 = App.perm.bind(App), ok0 = App.pageOk.bind(App);
  App.perm = function (m, a = 'view') { if (this.session && m) { const v = Access.userPerm(this.session.userId, m, a); if (v !== undefined) return v; } return p0(m, a); };
  App.pageOk = function (page) {
    if (this.session && this.route.portal !== 'public') {
      const u = Access.userPageOverride(this.session.userId, page.id);
      if (u === false) return false;
      if (u === true) { if (page.flag && DB.s.featureFlags[page.flag] === false) return false; if (page.when && !page.when()) return false; return true; }   // granted to this person even if the role has no access
      if (this.session.role !== 'ADMIN' && Access.pageOff(this.session.role, page.id)) return false;
    }
    return ok0(page);
  };
  const rb0 = Settings.rbac.bind(Settings);
  Settings.rbac = function () {
    const mode = ['module', 'pages', 'users'].includes(App.ui.rbMode) ? App.ui.rbMode : 'module';   // custom user types: ব্যবহারকারী ব্যবস্থাপনা → ব্যবহারকারী ধরন
    const head = `<div class="flex flex-wrap items-start gap-2">${pills([['module', 'ভূমিকা × মডিউল', 'shield-check'], ['pages', 'ভূমিকা অনুযায়ী পাতা চালু/বন্ধ', 'layout-list'], ['users', 'নির্দিষ্ট ব্যবহারকারী', 'user-cog']], mode, id => `App.ui.rbMode='${id}';App.refresh()`)}${typeof CustomRoles !== 'undefined' && App.has('ADMIN') ? `<button class="btn btn-ghost btn-sm" onclick="CustomRoles.open()">${icon('user-round-plus')} ব্যবহারকারী ধরন</button>` : ''}</div>`;
    if (mode === 'pages') return head + Access.pagesGrid();
    if (mode === 'users') return head + '<div class="mt-4">' + Access.usersEditor() + '</div>';
    return head + '<div class="mt-4">' + rb0() + '</div>';
  };
})();

/* ---------------- পাঠ-উপকরণ: পিডিএফ / ছবি / অডিও / ভিডিও / লিংক ---------------- */
const Media = {
  KINDS: [['file', 'ফাইল (পিডিএফ, ছবি, অডিও, ভিডিও)'], ['link', 'লিংক (ওয়েবসাইট / ইউটিউব / গুগল ড্রাইভ)']],
  TYPES: ['Notes', 'Worksheet', 'Syllabus', 'Lab Manual', 'Slides', 'Past Paper', 'Video', 'Audio', 'Image', 'Link'],
  kindOf(m) { if (m.url) return /youtu\.?be/.test(m.url) ? 'youtube' : 'link'; const t = m.fileType || ''; return t.startsWith('video/') ? 'video' : t.startsWith('audio/') ? 'audio' : t.startsWith('image/') ? 'image' : 'pdf'; },
  icon(m) { return { youtube: 'youtube', link: 'link', video: 'film', audio: 'music', image: 'image', pdf: 'file-text' }[this.kindOf(m)]; },
  readAny(file) {
    if (file.type.startsWith('image/') || file.type === 'application/pdf') return readUpload(file, 1400);
    return new Promise((res, rej) => { if (file.size > 4e6) return rej(new Error('অডিও/ভিডিও ফাইল সর্বোচ্চ ৪ এমবি গ্রহণযোগ্য। বড় ফাইলের জন্য লিংক ব্যবহার করুন।')); const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
  },
  ytId(u) { const m = String(u).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/); return m ? m[1] : null; },
  setPublic(id, on) { const m = DB.s.materials.find(x => x.id === id); if (!m) return; m.public = !!on; DB.audit('MATERIAL_PUBLIC', 'materials', `${id} ${on ? 'public' : 'private'}`); DB.save(); toast(on ? 'উপকরণটি পাবলিক করা হয়েছে।' : 'উপকরণটি আর পাবলিক নয়।', 'success'); },
};
Academics.upload = function () {
  const t = Teacher.me();
  Modal.open({ title: 'পাঠ-উপকরণ শেয়ার করুন', size: 'md', body: `<form id="mat" class="grid grid-cols-2 gap-3"><div class="col-span-2"><label class="label">শিরোনাম</label><input class="input" name="title" required></div>
    <div><label class="label">শ্রেণি</label><select class="select" name="classId">${Teacher.myClasses().map(c => `<option value="${c}">${esc(DB.className(c))}</option>`).join('')}</select></div>
    <div><label class="label">বিষয়</label><select class="select" name="subjectId">${subjectOptions(t.subjects[0], Teacher.mySubjects())}</select></div>
    <div><label class="label">ধরন</label><select class="select" name="type">${Media.TYPES.map(x => `<option value="${x}">${bn(x)}</option>`).join('')}</select></div>
    <div><label class="label">কীভাবে দেবেন</label><select class="select" name="kind" onchange="this.form.querySelector('[data-k=file]').classList.toggle('hidden',this.value!=='file');this.form.querySelector('[data-k=link]').classList.toggle('hidden',this.value!=='link');this.form.file.required=this.value==='file';this.form.url.required=this.value==='link'">${Media.KINDS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
    <div class="col-span-2" data-k="file"><label class="label">ফাইল — পিডিএফ/ছবি (১.৫ এমবি), অডিও/ভিডিও (৪ এমবি)</label><input type="file" name="file" accept="application/pdf,image/*,audio/*,video/*" class="input" required></div>
    <div class="col-span-2 hidden" data-k="link"><label class="label">লিংক</label><input class="input" type="url" name="url" placeholder="https://www.youtube.com/watch?v=… অথবা যেকোনো ওয়েব ঠিকানা"></div>
    <div class="col-span-2"><label class="label">সংক্ষিপ্ত বিবরণ (ঐচ্ছিক)</label><input class="input" name="note"></div>
    <label class="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" name="notify" checked> শিক্ষার্থী ও অভিভাবকদের জানান</label>
    <label class="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" name="public"> পাবলিক — ওয়েবসাইটের পাঠ-উপকরণ পৃষ্ঠায় সবার জন্য</label><button class="btn btn-primary col-span-2">${icon('upload')} শেয়ার করুন</button></form>` });
  $('#mat').addEventListener('submit', async e => {
    e.preventDefault(); const f = formData(e.target), file = e.target.file.files[0];
    try {
      const m = { id: DB.id('MAT'), classId: f.classId, subjectId: f.subjectId, title: f.title, type: f.type, note: f.note || '', teacherId: t.id, date: U.today(), downloads: 0, public: !!e.target.public.checked };
      if (f.kind === 'link') { if (!/^https?:\/\//.test(f.url)) throw new Error('সঠিক লিংক দিন (https:// দিয়ে শুরু)।'); m.url = f.url; m.fileName = ''; m.fileType = 'link'; m.dataUrl = null; }
      else { m.dataUrl = await Media.readAny(file); m.fileName = file.name; m.fileType = file.type.startsWith('image/') ? 'image/jpeg' : file.type || 'application/octet-stream'; }
      DB.s.materials.unshift(m);
      if (e.target.notify.checked) DB.studentsIn(f.classId).forEach(st => DB.guardiansOf(st.id).forEach(g => DB.sms(g.phone, `${DB.s.school.nameBn || DB.s.school.shortName}: ${DB.className(f.classId)}-এর জন্য নতুন ${bn(f.type)} "${f.title}" (${DB.subject(f.subjectId).name}) শেয়ার করা হয়েছে।`, 'Push')));
      DB.audit('MATERIAL_SHARE', 'materials', `${m.id} ${f.title} → ${f.classId}`);
      if (!DB.save()) { DB.s.materials.shift(); DB.save(); throw new Error('সংরক্ষণস্থান পূর্ণ — ছোট ফাইল বা লিংক দিয়ে চেষ্টা করুন।'); }
      Modal.close(); toast('পাঠ-উপকরণ শেয়ার করা হয়েছে।', 'success'); App.refresh();
    } catch (err) { toast(err.message, 'error'); }
  });
};
(() => {
  const open0 = Academics.open.bind(Academics);
  Academics.open = function (id) {
    const m = DB.s.materials.find(x => x.id === id), k = Media.kindOf(m);
    if (!['youtube', 'link', 'video', 'audio', 'image'].includes(k)) return open0(id);
    m.downloads = (m.downloads || 0) + 1; DB.save();
    if (k === 'link') return window.open(m.url, '_blank', 'noopener');
    const yt = k === 'youtube' && Media.ytId(m.url);
    const body = k === 'youtube' ? (yt ? `<div class="aspect-video"><iframe class="w-full h-full rounded-lg" src="https://www.youtube-nocookie.com/embed/${yt}" title="${esc(m.title)}" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>` : `<a class="btn btn-primary" href="${esc(m.url)}" target="_blank" rel="noopener">${icon('external-link')} ইউটিউবে খুলুন</a>`)
      : k === 'video' ? `<video class="w-full rounded-lg bg-black" src="${m.dataUrl}" controls></video>` : k === 'audio' ? `<audio class="w-full" src="${m.dataUrl}" controls></audio>` : `<img class="w-full max-h-[65vh] object-contain rounded-lg border" src="${m.dataUrl}" alt="${esc(m.title)}">`;
    Modal.open({ title: esc(m.title), size: 'lg', popup: true, body: body + (m.note ? `<p class="text-sm text-slate-600 mt-3">${esc(m.note)}</p>` : ''), footer: `${m.dataUrl ? `<a class="btn btn-ghost btn-sm" href="${m.dataUrl}" download="${esc(m.fileName || m.title)}">${icon('download')} ডাউনলোড</a>` : ''}<button class="btn btn-primary btn-sm" onclick="Modal.close()">বন্ধ করুন</button>` });
  };
  const list0 = Academics.materialsList.bind(Academics);
  Academics.materialsList = function (list, canRemove) {
    let html = list0(list, canRemove);
    // per item "পাবলিক" switch for the owner (shown on the website's পাঠ-উপকরণ page when that page is on)
    if (canRemove) { let j = 0; html = html.replace(/(<button class="btn btn-ghost btn-sm" onclick="Academics\.remove\('[^']+'\)" title="অপসারণ করুন">[\s\S]*?<\/button>)/g, (m0) => { const m = list.filter(Boolean)[j++]; return m ? `${m0}<label class="ml-auto flex items-center gap-1.5 text-sm font-semibold" title="ওয়েবসাইটে সবার জন্য"><input type="checkbox" ${m.public ? 'checked' : ''} onchange="Media.setPublic('${m.id}',this.checked)"> পাবলিক</label>` : m0; }); }
    return html.replace(/<div class="w-10 h-10 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">[\s\S]*?<\/div>/g, (() => { let i = 0; return () => { const m = list[i++]; return `<div class="w-10 h-10 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">${icon(m ? Media.icon(m) : 'file', 'w-5 h-5')}</div>`; }; })());
  };
})();

/* ---------------- পাঠ্যক্রম বুকলেট (বইয়ের মতো পিডিএফ) ---------------- */
const Booklet = {
  data(classId) {
    const subs = DB.classSubjects(classId);
    return subs.map(s => {
      const sy = DB.s.syllabus.filter(x => x.classId === classId && x.subjectId === s.id && x.chapters?.length);
      const chapters = sy.flatMap(x => x.chapters.map(c => ({ ...c, teacherId: x.teacherId })));
      return { s, chapters, teachers: [...new Set(sy.map(x => x.teacherId))] };
    });
  },
  sheet(content, n, sch) {
    return Print.sheet({}, '', 'padding:16mm 16mm 18mm;font-family:var(--font-heading,serif)') + `<div style="position:absolute;inset:8mm;border:.4mm solid var(--brand);border-radius:2mm;pointer-events:none"></div><div style="position:absolute;inset:9.5mm;border:.15mm solid var(--accent);border-radius:1.5mm;pointer-events:none"></div>${content}
      <div style="position:absolute;left:16mm;right:16mm;bottom:11mm;display:flex;justify-content:space-between;font-size:8pt;color:#64748b;border-top:.2mm solid #cbd5e1;padding-top:1.5mm"><span>${esc(sch.nameBn || sch.name)}</span><span>পৃষ্ঠা ${bnNum(n)}</span></div></div>`;
  },
  build(classId) {
    const sch = DB.s.school, c = DB.cls(classId), D = this.data(classId), ses = U.bn(DB.session());
    const exams = id => DB.exam(id)?.name || 'নির্ধারিত নয়';
    const cover = Print.sheet({}, '', 'padding:0;font-family:var(--font-heading,serif)') + `<div style="position:absolute;inset:0;background:linear-gradient(160deg,var(--brand) 0%,var(--brand-ink) 100%)"></div>
      <div style="position:absolute;inset:12mm;border:.6mm solid rgba(255,255,255,.55);border-radius:3mm"></div><div style="position:absolute;inset:15mm;border:.2mm solid rgba(255,255,255,.35);border-radius:2mm"></div>
      <div style="position:relative;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#fff;padding:30mm">
        <div style="background:#fff;border-radius:50%;padding:4mm;margin-bottom:8mm">${Print.logo ? Print.logo(26) : ''}</div>
        <div style="font-size:24pt;font-weight:700">${esc(sch.nameBn || sch.name)}</div><div style="font-size:11pt;opacity:.85;margin-top:2mm">${esc(sch.name)}</div>
        <div style="width:40mm;height:.6mm;background:var(--accent);margin:12mm auto"></div>
        <div style="font-size:34pt;font-weight:700;letter-spacing:.02em">পাঠ্যক্রম</div><div style="font-size:18pt;margin-top:4mm">${esc(c.name)}</div><div style="font-size:13pt;margin-top:3mm;opacity:.9">শিক্ষাবর্ষ ${ses}</div>
        <div style="position:absolute;bottom:26mm;left:0;right:0;font-size:10pt;opacity:.85">${esc(sch.address || '')}</div></div></div>`;
    let page = 2; const toc = D.map(d => { const start = page + 1; page += Math.max(1, Math.ceil((d.chapters.reduce((a, ch) => a + 2 + (ch.topics?.length || 0), 0) || 4) / 34)); return { d, start }; });
    const contents = this.sheet(`<div style="font-size:20pt;font-weight:700;color:var(--brand-ink);text-align:center;margin-bottom:2mm">সূচিপত্র</div><div style="text-align:center;font-size:10pt;color:#64748b;margin-bottom:8mm">${esc(c.name)} · শিক্ষাবর্ষ ${ses}</div>
      ${toc.map(({ d, start }, i) => `<div style="display:flex;align-items:baseline;gap:2mm;font-size:12pt;margin:3.2mm 0"><span style="color:var(--brand);font-weight:700;width:9mm">${bnNum(i + 1)}.</span><span style="font-weight:600">${esc(d.s.name)}</span><span style="flex:1;border-bottom:.3mm dotted #94a3b8;transform:translateY(-1mm)"></span><span>${bnNum(start)}</span></div>`).join('')}
      <div style="margin-top:12mm;font-size:9.5pt;color:#475569;line-height:1.8;border:.2mm solid #cbd5e1;border-radius:2mm;padding:4mm">এই পুস্তিকায় প্রতিটি বিষয়ের অধ্যায়, পাঠ্য বিষয়বস্তু এবং কোন পরীক্ষায় কোন অধ্যায় অন্তর্ভুক্ত তা দেওয়া আছে। প্রয়োজনে বিদ্যালয় পাঠ্যক্রম পরিবর্তন করতে পারে; সর্বশেষ তথ্য বিদ্যালয়ের ওয়েবসাইট ও নোটিশ বোর্ডে পাওয়া যাবে।</div>`, 2, sch);
    let n = 2; const pages = [];
    D.forEach((d, i) => {
      const blocks = d.chapters.length ? d.chapters.map((ch, ci) => `<div style="break-inside:avoid;margin:0 0 4mm"><div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:.3mm solid var(--brand);padding-bottom:1mm"><div style="font-size:12pt;font-weight:700;color:var(--brand-ink)">অধ্যায় ${esc(ch.no ? U.bn(ch.no) : bnNum(ci + 1))}: ${esc(ch.name)}</div><div style="font-size:8.5pt;color:#64748b">${esc((typeof chExams === 'function' ? chExams(ch) : [ch.examId]).map(exams).filter(Boolean).join(', '))}</div></div>
          <ol style="margin:1.5mm 0 0 6mm;font-size:10.5pt;line-height:1.75">${(ch.topics || []).map(tp => `<li>${esc(tp.name)}</li>`).join('')}</ol></div>`) : [`<p style="font-size:11pt;color:#64748b">এই বিষয়ের পাঠ্যক্রম এখনও যুক্ত করা হয়নি।</p>`];
      // ~34 lines per page; split chapters across pages
      let cur = [], lines = 0; const chunks = [];
      blocks.forEach((b, bi) => { const L = 2 + ((d.chapters[bi]?.topics?.length) || 2); if (lines + L > 34 && cur.length) { chunks.push(cur); cur = []; lines = 0; } cur.push(b); lines += L; });
      if (cur.length) chunks.push(cur);
      chunks.forEach((ch, k) => { n++; pages.push(this.sheet(`${k === 0 ? `<div style="display:flex;align-items:center;gap:4mm;margin-bottom:6mm"><div style="width:14mm;height:14mm;border-radius:50%;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;font-size:15pt;font-weight:700">${bnNum(i + 1)}</div><div><div style="font-size:19pt;font-weight:700;color:var(--brand-ink)">${esc(d.s.name)}</div><div style="font-size:9.5pt;color:#64748b">${esc(c.name)} · শিক্ষক: ${esc(d.teachers.map(t => DB.teacherName(t)).join(', ') || '—')}</div></div></div>` : `<div style="font-size:11pt;font-weight:700;color:var(--brand-ink);margin-bottom:4mm">${esc(d.s.name)} (চলমান)</div>`}${ch.join('')}`, n, sch)); });
    });
    return [cover, contents, ...pages];
  },
  print(classId) { Print.preview(`পাঠ্যক্রম — ${DB.className(classId)}`, this.build(classId), { re: ['Booklet.print', classId] }); },
  page() {
    const role = App.session.role;
    const kidCls = role === 'STUDENT' ? Student.me()?.classId : role === 'GUARDIAN' ? Guardian.child()?.classId : null;
    const cls = kidCls || (DB.classesIn().some(c => c.id === App.ui.bkC) ? App.ui.bkC : (role === 'TEACHER' ? Teacher.myClasses()[0] : DB.classesIn()[0]?.id));
    const D = cls ? this.data(cls) : [];
    return pageHeader('পাঠ্যক্রম বুকলেট', '',cls ? `<button class="btn btn-primary" onclick="Booklet.print('${cls}')">${icon('book-down')} বুকলেট ডাউনলোড (পিডিএফ)</button>` : '')
      + (kidCls ? '' : `<div class="card p-4 mb-4"><div class="label mb-2">শ্রেণি</div>${pills((role === 'TEACHER' ? Teacher.myClasses() : DB.classesIn().map(c => c.id)).map(id => [id, DB.className(id), 'book']), cls, id => `App.ui.bkC='${id}';App.refresh()`)}</div>`)
      + `<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">${D.map((d, i) => `<div class="card p-4"><div class="flex items-center gap-2 mb-2"><span class="w-7 h-7 rounded-full bg-brand-600 text-white text-sm font-bold flex items-center justify-center">${bnNum(i + 1)}</span><div class="font-semibold">${esc(d.s.name)}</div></div><div class="text-xs text-slate-500 mb-2">${bnNum(d.chapters.length)}টি অধ্যায় · ${bnNum(d.chapters.reduce((a, c) => a + (c.topics?.length || 0), 0))}টি পাঠ</div><ol class="text-sm list-decimal ml-5 space-y-0.5">${d.chapters.slice(0, 5).map(c => `<li>${esc(c.name)}</li>`).join('')}${d.chapters.length > 5 ? `<li class="list-none text-xs text-slate-400">… আরও ${bnNum(d.chapters.length - 5)}টি</li>` : ''}</ol></div>`).join('') || emptyState('এই শ্রেণির জন্য কোনো বিষয় নির্ধারিত নেই।')}</div>`;
  },
};
['principal', 'teacher', 'student', 'guardian'].forEach(p => { const P = App.portals[p], nb = P.pages.find(x => /syllabus|academics|materials/.test(x.id)); addBeside(p, { id: 'syllabus-book', label: 'পাঠ্যক্রম বুকলেট', icon: 'book-open-text', module: 'academics', render() { return Booklet.page(); } }, nb?.id); });

/* ---------------- ফি কাঠামো: সব ড্যাশবোর্ডে গুছানো রূপে; পাবলিক প্রসপেক্টাসে দেখানো ঐচ্ছিক ---------------- */
const FeeView = {
  heads() { return (DB.s.feeHeads || []).filter(h => h.amount && h.id !== 'FH-LATE'); },
  /** class rows of a campus: monthly tuition, admission, exam fee, yearly estimate */
  rows(campus) { return DB.classesIn(campus).map(c => { const f = DB.fees(c.id); return { c, f, year: f.tuition * 12 + f.examFee * 3 }; }); },
  table(campus, mine) {
    const R = this.rows(campus);
    return `<div class="card scroll-x"><table class="table"><thead><tr><th>শ্রেণি</th><th class="text-right">মাসিক বেতন</th><th class="text-right">ভর্তি ফি</th><th class="text-right">পরীক্ষার ফি (প্রতি টার্ম)</th><th class="text-right">বার্ষিক আনুমানিক*</th></tr></thead><tbody>${R.map(({ c, f, year }) => `<tr class="${mine === c.id ? 'bg-brand-50 font-semibold' : ''}"><td>${esc(c.name)}${mine === c.id ? ` ${badge('আপনার শ্রেণি', 'green')}` : ''}</td><td class="text-right">${U.money(f.tuition)}</td><td class="text-right">${U.money(f.admissionFee)}</td><td class="text-right">${U.money(f.examFee)}</td><td class="text-right">${U.money(year)}</td></tr>`).join('')}</tbody></table></div>`;
  },
  extras() {
    const H = this.heads();
    return H.length ? `<div class="card"><div class="px-5 py-3 border-b border-slate-100 font-semibold">অন্যান্য ফি</div><div class="divide-y divide-slate-100">${H.map(h => `<div class="px-5 py-3 flex flex-wrap items-center gap-3"><span class="flex-1">${esc(h.name)}${h.optIn ? ` ${badge('ঐচ্ছিক', 'slate')}` : ''}</span><span class="text-slate-500">${esc(bn(h.frequency))}</span><b>${U.money(h.amount)}</b></div>`).join('')}</div></div>` : '';
  },
  page() {
    const role = App.session.role, kid = role === 'STUDENT' ? Student.me() : role === 'GUARDIAN' ? Guardian.child() : null;
    const campus = kid ? DB.campusOf(kid.classId) : (role === 'TEACHER' ? Teacher.me()?.campusId : DB.campusId());
    return pageHeader('ফি কাঠামো', `শিক্ষাবর্ষ ${U.bn(DB.session())} · ${esc(DB.campus(campus)?.name || '')}`, `<button class="btn btn-ghost" onclick="FeeView.print('${campus}')">${icon('printer')} মুদ্রণ</button>`)
      + (role === 'GUARDIAN' ? Guardian.switcher() : '')
      + `<div class="grid xl:grid-cols-3 gap-5 items-start"><div class="xl:col-span-2 space-y-3">${this.table(campus, kid?.classId)}<p class="text-slate-500">* বার্ষিক আনুমানিক = ১২ মাসের বেতন + ৩টি টার্ম পরীক্ষার ফি। পরিবহন, ছাত্রাবাস ও ঐচ্ছিক ফি আলাদা।</p></div>${this.extras()}</div>`;
  },
  print(campus) { Print.preview('ফি কাঠামো', [Print.sheet({}, 'padded') + Print.header(`ফি কাঠামো — শিক্ষাবর্ষ ${U.bn(DB.session())}`) + `<table style="width:100%;border-collapse:collapse;font-size:11pt"><tr style="background:#f1f5f9"><th style="text-align:left;padding:2mm">শ্রেণি</th><th style="text-align:right;padding:2mm">মাসিক বেতন</th><th style="text-align:right;padding:2mm">ভর্তি ফি</th><th style="text-align:right;padding:2mm">পরীক্ষার ফি</th></tr>${this.rows(campus).map(({ c, f }) => `<tr style="border-bottom:.2mm solid #cbd5e1"><td style="padding:2mm">${esc(c.name)}</td><td style="text-align:right;padding:2mm">${U.money(f.tuition)}</td><td style="text-align:right;padding:2mm">${U.money(f.admissionFee)}</td><td style="text-align:right;padding:2mm">${U.money(f.examFee)}</td></tr>`).join('')}</table>${this.heads().length ? `<div style="margin-top:6mm;font-weight:700">অন্যান্য ফি</div>${this.heads().map(h => `<div style="display:flex;justify-content:space-between;border-bottom:.2mm dotted #cbd5e1;padding:1.5mm 0"><span>${esc(h.name)} (${esc(bn(h.frequency))})</span><b>${U.money(h.amount)}</b></div>`).join('')}` : ''}</div>`], { re: ['FeeView.print', campus === undefined ? null : campus] }); },
};
['principal', 'admin', 'teacher', 'student', 'guardian'].forEach(p => { const nb = App.portals[p].pages.find(x => /fees|accounts|logistics|services/.test(x.id)); addBeside(p, { id: 'fee-structure', label: 'ফি কাঠামো', icon: 'receipt-text', render() { return FeeView.page(); } }, nb?.id); });
// public prospectus: the fee table and estimator can be hidden (Root User → ফিচার ও সেটিংস → পাবলিক ওয়েবসাইট)
(() => {
  const P = App.portals.public.pages.find(p => p.id === 'prospectus'); if (!P) return;
  const r0 = P.render.bind(P), m0 = P.mount?.bind(P);
  P.render = function (q) {
    if (DB.s.site.showFees !== false) return r0(q);
    const s = DB.s.school;
    return Pub.wrap(Pub.hero('প্রসপেক্টাস', 'আমাদের শিক্ষা কার্যক্রম ও ভর্তির তথ্য।') + Pub.section('শিক্ষা কার্যক্রম', '', `<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">${DB.s.site.programs.map(p => `<div class="card p-5"><div class="font-bold">${esc(p.name)}</div><div class="text-accent font-semibold">${esc(p.ages || '')}</div><p class="text-slate-600 mt-2">${esc(p.desc)}</p></div>`).join('')}</div>
      <div class="card p-5 mt-6 flex flex-wrap items-center gap-4">${icon('receipt-text', 'w-6 h-6 text-brand-600')}<p class="flex-1">ফি সংক্রান্ত তথ্যের জন্য বিদ্যালয়ের অফিসে যোগাযোগ করুন: <b>${esc(s.phone)}</b></p><a href="${App.href('public', 'admissions')}" class="btn btn-primary">${icon('file-pen-line')} আবেদন শুরু করুন</a></div>`));
  };
  P.mount = function (q) { if (DB.s.site.showFees !== false && m0) m0(q); };
})();
(FeatureCfg.PARAMS['পাবলিক ওয়েবসাইট'] = FeatureCfg.PARAMS['পাবলিক ওয়েবসাইট'] || []).unshift(
  { k: 'showFees', label: 'প্রসপেক্টাস পাতায় শ্রেণিভিত্তিক ফি কাঠামো ও ব্যয় নিরূপক', type: 'select', options: [['yes', 'দেখান'], ['no', 'লুকান (শুধু ড্যাশবোর্ডে দেখা যাবে)']], get: () => DB.s.site.showFees === false ? 'no' : 'yes', set: v => (DB.s.site.showFees = v !== 'no') },
);