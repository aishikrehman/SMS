/* ==========================================================================
   PUBLIC CONTENT — institution achievements, optional public syllabus,
   study materials and library catalogue, the contact page, extra calendars
   on print headers, and the settings for all of these.

   Data
     DB.s.instAchievements = [{ id, title, year, level, text, image, show, order,
                                kind: 'student', srcId, studentName, className, consent, date }]
       kind 'student' = a student's achievement (DB.s.achievements) copied for the website with consent;
       it reaches visitors only while config.publicSite.studentAch is on (server/public.js, server/access.js).
     DB.s.config.publicSite = { syllabus, materials, library, studentAch }   — every switch off by default
     DB.s.config.calendars  = { bangla, hijri, header, notices, print }      — see U.calCfg() in core.js
   Visitors receive only what is switched on, filtered on the server (server/public.js).
   ========================================================================== */
DB.addSeeder('instAchievements', () => []);

const PubContent = {
  LEVELS: [['School', 'প্রতিষ্ঠান'], ['Upazila', 'উপজেলা'], ['District', 'জেলা'], ['Divisional', 'বিভাগীয়'], ['Board', 'শিক্ষা বোর্ড'], ['National', 'জাতীয়'], ['International', 'আন্তর্জাতিক'], ['Campus', 'ক্যাম্পাস']],
  levelBn(l) { return (this.LEVELS.find(x => x[0] === l) || [])[1] || bn(l || ''); },
  cfg() { const c = (DB.s.config || {}).publicSite || {}; return { syllabus: c.syllabus === true, materials: c.materials === true, library: c.library === true, studentAch: c.studentAch === true }; },
  canEdit() { return !!App.session && (App.has('ADMIN') || App.has('SUPERADMIN') || App.has('PRINCIPAL')) && Settings.canEdit(); },
  list() { return DB.s.instAchievements || (DB.s.instAchievements = []); },
  /** What the website shows: the institution's own entries, plus consented student entries while that switch is on. */
  visible() {
    const on = this.cfg().studentAch;
    return this.list().filter(a => a && a.show !== false && (a.kind !== 'student' || (on && a.consent === true)))
      .sort((a, b) => (+a.order || 0) - (+b.order || 0) || String(b.year || b.date || '').localeCompare(String(a.year || a.date || '')));
  },
  inst() { return this.visible().filter(a => a.kind !== 'student'); },
  students() { return this.visible().filter(a => a.kind === 'student'); },
  yearOf(a) { return a.year || (a.date ? String(a.date).slice(0, 4) : ''); },

  /* ---------- shared cards (public page and homepage section) ---------- */
  card(a) {
    const yr = this.yearOf(a);
    return `<article class="card pub-card pub-lift pub-ach flex flex-col overflow-hidden">${a.image ? `<div class="pub-ach-img"><img src="${a.image}" alt="${esc(a.title)}" loading="lazy"></div>` : `<div class="pub-ach-band">${icon(a.kind === 'student' ? 'medal' : 'trophy', 'w-9 h-9')}</div>`}
      <div class="p-5 flex-1 flex flex-col gap-2"><div class="flex flex-wrap gap-2">${yr ? `<span class="pub-tag">${U.bn(yr)}</span>` : ''}${a.level ? badge(this.levelBn(a.level), 'blue') : ''}</div>
      <h3 class="font-heading text-lg font-bold text-slate-900 leading-snug">${esc(a.title)}</h3>${a.kind === 'student' && a.studentName ? `<div class="text-brand-700 font-semibold">${esc(a.studentName)}${a.className ? ` · ${esc(a.className)}` : ''}</div>` : ''}${a.text ? `<p class="text-slate-600 leading-relaxed">${esc(a.text)}</p>` : ''}</div></article>`;
  },
  grid(list) { return `<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">${list.map(a => this.card(a)).join('')}</div>`; },

  /* ---------- admin: প্রতিষ্ঠানের অর্জন ---------- */
  adminPage() {
    const L = this.list(), can = this.canEdit(), sa = DB.s.achievements || [], on = this.cfg().studentAch;
    const copied = new Map(L.filter(a => a.kind === 'student').map(a => [a.srcId, a]));
    const row = a => `<div class="px-4 py-3 flex flex-wrap sm:flex-nowrap items-center gap-3">${a.image ? `<img src="${a.image}" alt="" class="w-16 h-12 object-cover rounded-lg shrink-0">` : `<span class="pub-icon !w-12 !h-12">${icon(a.kind === 'student' ? 'medal' : 'trophy', 'w-5 h-5')}</span>`}
      <div class="flex-1 min-w-[12rem]"><div class="font-semibold">${esc(a.title)}</div><div class="text-slate-500">${[this.yearOf(a) ? U.bn(this.yearOf(a)) : '', a.level ? this.levelBn(a.level) : '', a.kind === 'student' ? `${esc(a.studentName || '')} (শিক্ষার্থী)` : ''].filter(Boolean).join(' · ')}</div></div>
      ${a.show === false ? badge('লুকানো', 'slate') : badge('ওয়েবসাইটে', 'green')}${a.kind === 'student' ? (a.consent ? badge('সম্মতি আছে', 'green') : badge('সম্মতি নেই', 'amber')) : ''}
      ${can ? `<span class="flex gap-1">${a.kind === 'student' ? '' : `<button class="btn btn-ghost btn-sm" title="সম্পাদনা" onclick="PubContent.edit('${a.id}')">${icon('pencil')}</button>`}<button class="btn btn-ghost btn-sm" title="${a.show === false ? 'দেখান' : 'লুকান'}" onclick="PubContent.toggle('${a.id}')">${icon(a.show === false ? 'eye' : 'eye-off')}</button><button class="btn btn-ghost btn-sm" title="মুছে ফেলুন" onclick="PubContent.del('${a.id}')">${icon('trash-2')}</button></span>` : ''}</div>`;
    const inst = L.filter(a => a.kind !== 'student'), studs = L.filter(a => a.kind === 'student');
    return pageHeader('প্রতিষ্ঠানের অর্জন ও স্বীকৃতি', '',`${can ? `<button class="btn btn-primary" onclick="PubContent.edit()">${icon('plus')} অর্জন যোগ করুন</button>` : ''}<a class="btn btn-ghost" href="${App.href('public', 'achievements')}" target="_blank" rel="noopener">${icon('external-link')} পৃষ্ঠাটি দেখুন</a>`)
      + `<div class="card mb-5"><div class="px-5 py-3 border-b border-slate-100 font-semibold">প্রতিষ্ঠানের অর্জন (${bnNum(inst.length)})</div><div class="divide-y divide-slate-100">${inst.map(row).join('') || emptyState('এখনো কোনো অর্জন যোগ করা হয়নি।', 'trophy')}</div></div>
      <div class="card"><div class="px-5 py-3 border-b border-slate-100 font-semibold flex flex-wrap items-center gap-2">শিক্ষার্থীদের অর্জন — ওয়েবসাইটে দেখানো ${on ? badge('চালু', 'green') : badge('বন্ধ', 'slate')}</div>
        <div class="p-5 space-y-3">
        ${studs.length ? `<div class="rounded-lg border border-slate-200 divide-y divide-slate-100">${studs.map(row).join('')}</div>` : ''}
        ${can ? `<div class="label !mt-4">শিক্ষার্থীর অর্জন থেকে বাছাই করুন</div><div class="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-[28rem] overflow-y-auto">${[...sa].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).map(x => { const st = DB.student(x.studentId), c = copied.get(x.id); return `<div class="px-4 py-2.5 flex flex-wrap items-center gap-3"><div class="flex-1 min-w-[12rem]"><div class="font-semibold">${esc(x.title)}</div><div class="text-slate-500">${esc(pn(st) || '')}${st ? ` · ${esc(DB.className(st.classId))}` : ''}${x.level ? ` · ${esc(this.levelBn(x.level))}` : ''}${x.date ? ` · ${U.fmtDate(x.date)}` : ''}</div></div>${c ? badge('বাছাই করা হয়েছে', 'green') : `<button class="btn btn-ghost btn-sm" onclick="PubContent.pickStudent('${x.id}')">${icon('plus')} ওয়েবসাইটের তালিকায় নিন</button>`}</div>`; }).join('') || '<div class="p-4 text-slate-500">শিক্ষার্থীদের কোনো অর্জন লিপিবদ্ধ নেই।</div>'}</div>` : ''}</div></div>`;
  },
  edit(id) {
    if (!this.canEdit()) return toast('অর্জন সম্পাদনার অনুমতি নেই।', 'error');
    const a = id ? this.list().find(x => x.id === id) : { title: '', year: String(new Date().getFullYear()), level: 'School', text: '', image: null, show: true, order: 0 };
    App.ui.iaImg = a.image || null;
    Modal.open({
      title: id ? 'অর্জন সম্পাদনা' : 'অর্জন যোগ করুন', size: 'md',
      body: `<form id="ia-form" class="grid sm:grid-cols-2 gap-3"><div class="sm:col-span-2"><label class="label">শিরোনাম</label><input class="input" name="title" value="${esc(a.title)}" required maxlength="160"></div>
        <div><label class="label">বছর</label><input class="input" name="year" value="${esc(U.bn(a.year || ''))}" inputmode="numeric" maxlength="9"></div>
        <div><label class="label">পর্যায়</label><select class="select" name="level">${this.LEVELS.map(([v, l]) => `<option value="${v}" ${v === a.level ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="sm:col-span-2"><label class="label">সংক্ষিপ্ত বিবরণ</label><textarea class="textarea" name="text" rows="3" maxlength="500">${esc(a.text || '')}</textarea></div>
        <div class="sm:col-span-2"><div class="label">ছবি (ঐচ্ছিক)</div><div class="flex flex-wrap items-center gap-3"><img id="ia-prev" src="${a.image || ''}" alt="" class="h-16 w-24 object-cover rounded ${a.image ? '' : 'hidden'}"><label class="btn btn-ghost btn-sm cursor-pointer">${icon('image-plus')} ছবি বাছাই<input type="file" accept="image/*" class="hidden" onchange="PubContent.pickImg(this.files[0])"></label><button type="button" class="btn btn-ghost btn-sm" onclick="App.ui.iaImg=null;const p=document.getElementById('ia-prev');p.src='';p.classList.add('hidden')">${icon('trash-2')} ছবি সরান</button></div></div>
        <div><label class="label">ক্রম (ছোট সংখ্যা আগে)</label><input class="input" type="number" name="order" value="${+a.order || 0}"></div>
        <label class="flex items-center gap-2 pt-6"><input type="checkbox" name="show" ${a.show !== false ? 'checked' : ''}> ওয়েবসাইটে দেখান</label>
        <button class="btn btn-primary sm:col-span-2">${icon('save')} সংরক্ষণ করুন</button></form>`,
    });
    $('#ia-form').addEventListener('submit', e => {
      e.preventDefault(); const f = formData(e.target);
      const rec = { title: f.title.trim(), year: U.asciiDigits(f.year || '').trim(), level: f.level, text: (f.text || '').trim(), image: App.ui.iaImg || null, show: !!e.target.show.checked, order: +f.order || 0 };
      if (!rec.title) return toast('শিরোনাম লিখুন।', 'error');
      if (id) Object.assign(a, rec); else this.list().push({ id: DB.id('IA'), ...rec });
      DB.audit(id ? 'INST_ACH_EDIT' : 'INST_ACH_ADD', 'settings', rec.title);
      if (!DB.save()) return toast('সংরক্ষণস্থান পূর্ণ — ছোট ছবি দিন।', 'error');
      Modal.close(); toast('অর্জন সংরক্ষিত হয়েছে।', 'success'); App.refresh();
    });
  },
  async pickImg(file) { if (!file) return; try { App.ui.iaImg = await readUpload(file, 1000); const p = $('#ia-prev'); if (p) { p.src = App.ui.iaImg; p.classList.remove('hidden'); } } catch (e) { toast(e.message, 'error'); } },
  toggle(id) { const a = this.list().find(x => x.id === id); if (!a) return; a.show = a.show === false; DB.audit('INST_ACH_SHOW', 'settings', `${a.title}: ${a.show ? 'shown' : 'hidden'}`); DB.save(); App.refresh(); },
  del(id) { const a = this.list().find(x => x.id === id); if (!a || !confirm(`“${a.title}” তালিকা থেকে মুছে ফেলবেন?`)) return; DB.s.instAchievements = this.list().filter(x => x.id !== id); DB.audit('INST_ACH_DELETE', 'settings', a.title); DB.save(); App.refresh(); },
  /** Copy a student's achievement to the website list — only after consent is confirmed. */
  pickStudent(achId) {
    const x = (DB.s.achievements || []).find(a => a.id === achId), st = x && DB.student(x.studentId); if (!x) return;
    if (!confirm(`“${x.title}” — ${pn(st) || 'শিক্ষার্থী'}\n\nশিক্ষার্থী / অভিভাবক কি নাম ও অর্জন ওয়েবসাইটে প্রকাশে সম্মতি দিয়েছেন? “OK” চাপলে সম্মতি লিপিবদ্ধ হবে।`)) return;
    this.list().push({ id: DB.id('IA'), kind: 'student', srcId: x.id, title: x.title, level: x.level || '', date: x.date || '', year: x.date ? String(x.date).slice(0, 4) : '', studentName: pn(st) || '', className: st ? DB.className(st.classId) : '', consent: true, consentBy: App.session.userId, consentAt: new Date().toISOString(), show: true, text: '' });
    DB.audit('INST_ACH_STUDENT', 'settings', `${x.id} (${x.studentId}) — সম্মতিসহ ওয়েবসাইটের তালিকায়`); DB.save();
    toast(this.cfg().studentAch ? 'ওয়েবসাইটের তালিকায় যোগ হয়েছে।' : 'তালিকায় যোগ হয়েছে — “শিক্ষার্থীদের অর্জন” সেটিং চালু করলে ওয়েবসাইটে দেখাবে।', 'success'); App.refresh();
  },

  /* ---------- public pages ---------- */
  achievementsPage() {
    const I = this.inst(), S = this.students();
    return Pub.wrap(Pub.hero('আমাদের অর্জন', `${esc(DB.s.school.nameBn || DB.s.school.name)}-এর প্রাতিষ্ঠানিক সাফল্য ও স্বীকৃতি।`)
      + (I.length ? Pub.section('প্রতিষ্ঠানের অর্জন', 'স্বীকৃতি ও সাফল্য', this.grid(I)) : '')
      + (S.length ? Pub.section('শিক্ষার্থীদের অর্জন', 'আমাদের গর্ব', this.grid(S)) : '')
      + (!I.length && !S.length ? Pub.section('', '', emptyState('এখনো কোনো অর্জন প্রকাশ করা হয়নি।', 'trophy')) : ''));
  },
  /** Class / subject filter bar shared by the syllabus and materials pages. */
  filters(key, classIds, subjectIds) {
    const f = App.ui[key] || (App.ui[key] = { cls: '', sub: '' });
    if (f.cls && !classIds.includes(f.cls)) f.cls = '';
    if (f.sub && !subjectIds.includes(f.sub)) f.sub = '';
    const cls = DB.s.classes.filter(c => classIds.includes(c.id)), subs = DB.s.subjects.filter(s => subjectIds.includes(s.id));
    return `<div class="card p-4 mb-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-3"><div><label class="label" for="${key}-c">শ্রেণি</label><select id="${key}-c" class="select" onchange="App.ui.${key}.cls=this.value;App.refresh()"><option value="">সকল শ্রেণি</option>${cls.map(c => `<option value="${c.id}" ${c.id === f.cls ? 'selected' : ''}>${esc(c.name)}${multiCampus() && DB.campus(c.campusId) ? ` — ${esc(DB.campus(c.campusId).short || '')}` : ''}</option>`).join('')}</select></div>
      <div><label class="label" for="${key}-s">বিষয়</label><select id="${key}-s" class="select" onchange="App.ui.${key}.sub=this.value;App.refresh()"><option value="">সকল বিষয়</option>${subs.map(s => `<option value="${s.id}" ${s.id === f.sub ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div></div>`;
  },
  syllabusPage() {
    const all = (DB.s.syllabus || []).filter(s => s.classId && s.subjectId && (s.chapters || []).length && DB.cls(s.classId));
    const head = this.filters('psy', [...new Set(all.map(s => s.classId))], [...new Set(all.map(s => s.subjectId))]), f = App.ui.psy;
    const list = all.filter(s => (!f.cls || s.classId === f.cls) && (!f.sub || s.subjectId === f.sub));
    const byKey = {}; list.forEach(s => { const k = s.classId + '|' + s.subjectId; (byKey[k] = byKey[k] || []).push(s); });
    const notes = DB.s.examSyllabus || [], exName = id => DB.exam(id)?.name || '';
    const block = k => {
      const [c, sid] = k.split('|'), seen = new Set(), groups = {};
      byKey[k].forEach(s => s.chapters.forEach(ch => { if (seen.has(ch.name)) return; seen.add(ch.name); (groups[ch.examId || ''] = groups[ch.examId || ''] || []).push(ch); }));
      const ex = Object.keys(groups).sort((a, b) => String(DB.exam(a)?.start || 'z').localeCompare(String(DB.exam(b)?.start || 'z')));
      const nts = notes.filter(n => n.classId === c && n.subjectId === sid && n.text);
      return `<article class="card pub-card overflow-hidden"><div class="pub-cardhead border-b border-slate-100">${icon('book-open-check', 'w-5 h-5 shrink-0')}<h3 class="font-heading text-lg font-bold flex-1">${esc(DB.subject(sid)?.name || '')}</h3><span class="pub-tag">${esc(DB.className(c))}</span></div>
        <div class="p-5 space-y-4">${ex.map(e => `<div>${e ? `<div class="font-semibold text-brand-700 mb-1">${esc(exName(e) || 'পরীক্ষা')}</div>` : ex.length > 1 ? '<div class="font-semibold text-brand-700 mb-1">সারা বছর</div>' : ''}<ol class="list-decimal ml-5 space-y-1">${groups[e].map(ch => `<li><span class="font-semibold">${esc(ch.name)}</span>${(ch.topics || []).length ? `<div class="text-slate-500">${esc(ch.topics.map(t => (t.name || '').replace(ch.name + ':', '').trim()).filter(Boolean).join(' · '))}</div>` : ''}</li>`).join('')}</ol></div>`).join('')}
        ${nts.map(n => `<div class="rounded-lg bg-amber-50 border border-amber-200 p-3 whitespace-pre-line"><b>${esc(exName(n.examId) || 'পরীক্ষা')} — অতিরিক্ত নির্দেশনা:</b>\n${esc(n.text)}</div>`).join('')}</div></article>`;
    };
    const keys = Object.keys(byKey).sort((a, b) => (DB.cls(a.split('|')[0])?.grade || 0) - (DB.cls(b.split('|')[0])?.grade || 0) || a.localeCompare(b));
    return Pub.wrap(Pub.hero('পাঠ্যক্রম ও পাঠ্যসূচি', 'শ্রেণি ও বিষয়ভিত্তিক অধ্যায় এবং পরীক্ষাভিত্তিক পাঠ্যসূচি।') + Pub.section('', '', head + (keys.length ? `<div class="grid lg:grid-cols-2 gap-5">${keys.map(block).join('')}</div>` : emptyState('এই বাছাইয়ে কোনো পাঠ্যসূচি প্রকাশিত নেই।', 'book-open'))));
  },
  matLink(m) {
    if (m.url) return `<a class="btn btn-primary btn-sm" href="${esc(m.url)}" target="_blank" rel="noopener">${icon(/youtu\.?be/.test(m.url) ? 'youtube' : 'external-link')} খুলুন</a>`;
    if (m.dataUrl) return `<a class="btn btn-primary btn-sm" href="${m.dataUrl}" download="${esc(m.fileName || m.title)}">${icon('download')} ডাউনলোড</a>`;
    return '<span class="text-slate-500">ফাইল সংযুক্ত নেই</span>';
  },
  materialsPage() {
    const all = (DB.s.materials || []).filter(m => m.public === true && DB.cls(m.classId));
    const head = this.filters('pmt', [...new Set(all.map(m => m.classId))], [...new Set(all.map(m => m.subjectId))]), f = App.ui.pmt;
    const list = all.filter(m => (!f.cls || m.classId === f.cls) && (!f.sub || m.subjectId === f.sub)).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    const ic = m => (typeof Media !== 'undefined' ? Media.icon(m) : 'file-text');
    return Pub.wrap(Pub.hero('পাঠ-উপকরণ', 'শিক্ষকদের প্রকাশ করা নোট, কার্যপত্র ও অন্যান্য উপকরণ।') + Pub.section('', '', head + (list.length ? `<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">${list.map(m => `<article class="card pub-card p-5 flex gap-4"><span class="pub-icon">${icon(ic(m), 'w-6 h-6')}</span><div class="min-w-0 flex-1"><h3 class="font-semibold text-slate-900 leading-snug">${esc(m.title)}</h3><div class="text-slate-500 mt-1">${esc(bn(m.type || ''))} · ${esc(DB.subject(m.subjectId)?.name || '')} · ${esc(DB.className(m.classId))}</div>${m.note ? `<p class="text-slate-600 mt-1">${esc(m.note)}</p>` : ''}<div class="text-slate-500 mt-1">${m.date ? U.fmtDate(m.date) : ''}</div><div class="mt-3">${this.matLink(m)}</div></div></article>`).join('')}</div>` : emptyState('এই বাছাইয়ে কোনো পাবলিক উপকরণ নেই।', 'folder-open'))));
  },

  /* ---------- library catalogue (public, student, guardian) ---------- */
  books() { return ((DB.s.library || {}).books || []).filter(b => b && b.title); },
  avail(b) { return b.avail !== undefined ? b.avail : (typeof Logistics !== 'undefined' && Logistics.L ? Logistics.available(b) : +b.copies || 0); },
  catalogue() {
    const f = App.ui.lcat || (App.ui.lcat = { q: '', by: 'all', cat: '', av: '', n: 30 });
    const all = this.books(), cats = [...new Set(all.map(b => b.category).filter(Boolean))].sort();
    const q = String(f.q || '').trim().toLowerCase();
    const hay = b => (f.by === 'title' ? [b.title] : f.by === 'author' ? [b.author] : f.by === 'subject' ? [b.category, bn(b.category || ''), b.subject] : [b.title, b.author, b.category, bn(b.category || ''), b.publisher, b.isbn, b.id]).filter(Boolean).join(' ').toLowerCase();
    const list = all.filter(b => (!q || hay(b).includes(q)) && (!f.cat || b.category === f.cat) && (!f.av || this.avail(b) > 0)).sort((a, b) => String(a.title).localeCompare(String(b.title), 'bn'));
    const total = U.sum(all, b => +b.copies || 0), free = U.sum(all, b => this.avail(b));
    const sel = (name, opts, cur, lab) => `<div><label class="label" for="lc-${name}">${lab}</label><select id="lc-${name}" class="select" onchange="App.ui.lcat.${name}=this.value;App.ui.lcat.n=30;App.refresh()">${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
    return `<div class="grid grid-cols-3 gap-3 mb-5">${[['বইয়ের শিরোনাম', all.length, 'library'], ['মোট কপি', total, 'book-copy'], ['এখন তাকে আছে', free, 'book-check']].map(([l, v, i]) => `<div class="card p-4 flex items-center gap-3">${icon(i, 'w-6 h-6 text-brand-600 shrink-0 hidden sm:block')}<div class="min-w-0"><div class="text-xl sm:text-2xl font-extrabold">${bnNum(v, true)}</div><div class="text-slate-500">${l}</div></div></div>`).join('')}</div>
      <form class="card p-4 mb-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-3" onsubmit="App.ui.lcat.q=this.q.value;App.ui.lcat.n=30;App.refresh();return false"><div class="sm:col-span-2"><label class="label" for="lc-q">খুঁজুন</label><div class="flex gap-2"><input id="lc-q" class="input" name="q" value="${esc(f.q || '')}" placeholder="বইয়ের নাম, লেখক বা বিষয়"><button class="btn btn-primary" aria-label="খুঁজুন">${icon('search')}</button></div></div>
        ${sel('by', [['all', 'সব ঘরে'], ['title', 'শিরোনাম'], ['author', 'লেখক'], ['subject', 'বিষয়']], f.by, 'যেখানে খুঁজবেন')}${sel('cat', [['', 'সকল বিষয়'], ...cats.map(c => [c, bn(c)])], f.cat, 'বিষয় / ধরন')}
        <label class="flex items-center gap-2 sm:col-span-2 lg:col-span-4"><input type="checkbox" ${f.av ? 'checked' : ''} onchange="App.ui.lcat.av=this.checked?'1':'';App.ui.lcat.n=30;App.refresh()"> কেবল এখন পাওয়া যায় এমন বই</label></form>
      <div class="text-slate-500 mb-3">${bnNum(list.length)}টি বই</div>
      ${list.length ? `<div class="card divide-y divide-slate-100">${list.slice(0, f.n).map(b => { const av = this.avail(b); return `<div class="px-4 py-3 flex flex-wrap sm:flex-nowrap items-center gap-3"><span class="pub-icon !w-11 !h-11 shrink-0">${icon('book', 'w-5 h-5')}</span><div class="flex-1 min-w-[12rem]"><div class="font-semibold text-slate-900">${esc(b.title)}</div><div class="text-slate-500">${[b.author, b.category ? bn(b.category) : '', b.publisher, b.year ? U.bn(b.year) : ''].filter(Boolean).map(esc).join(' · ')}</div></div><div class="text-right whitespace-nowrap">${av > 0 ? badge(`${bnNum(av)}টি পাওয়া যাবে`, 'green') : badge('সব কপি ধারে', 'amber')}<div class="text-slate-500 mt-1">মোট ${bnNum(+b.copies || 0)} কপি${b.shelf ? ` · তাক ${esc(b.shelf)}` : ''}</div></div></div>`; }).join('')}</div>
        ${list.length > f.n ? `<div class="mt-4 text-center"><button class="btn btn-ghost" onclick="App.ui.lcat.n+=30;App.refresh()">${icon('chevrons-down')} আরও দেখুন</button></div>` : ''}` : `<div class="card">${emptyState('কোনো বই পাওয়া যায়নি।', 'library')}</div>`}`;
  },

  /* ---------- contact page from the real data ---------- */
  contactPage() {
    const s = DB.s.school, cal = DB.s.calendar || { weekends: [5], holidays: [] }, oh = typeof Cal !== 'undefined' && Cal.officeHours ? Cal.officeHours() : { from: '', to: '', note: '' };
    const wk = (cal.weekends || []).slice().sort();
    // working days in week order starting after the weekly holiday; a consecutive run reads as a range ("শনিবার – বৃহস্পতিবার")
    const s0 = wk.length ? (Math.max(...wk) + 1) % 7 : 0, workDays = [0, 1, 2, 3, 4, 5, 6].map(i => (s0 + i) % 7).filter(d => !wk.includes(d));
    const consecutive = workDays.length > 1 && workDays.every((d, i) => !i || d === (workDays[i - 1] + 1) % 7);
    const days = !workDays.length ? '' : consecutive ? `${U.DAYS[workDays[0]]} – ${U.DAYS[workDays[workDays.length - 1]]}` : workDays.map(d => U.DAYS[d]).join(', ');
    const t = hm => { if (!hm) return ''; const [h, m] = hm.split(':').map(Number), p = h < 12 ? (h < 5 ? 'রাত' : 'সকাল') : h < 15 ? 'দুপুর' : h < 18 ? 'বিকাল' : 'সন্ধ্যা'; return `${p} ${U.bn(((h + 11) % 12) + 1)}:${U.bn(U.pad(m))}`; };
    const hours = oh.from && oh.to ? `${t(oh.from)} – ${t(oh.to)}` : '';
    const today = U.today(), up = (cal.holidays || []).filter(h => (h.type === 'Public' || h.type === 'School') && (h.to || h.date) >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
    const tel = p => String(p || '').replace(/[^\d+]/g, '');
    const line = (ic, label, html) => html ? `<div class="flex items-start gap-4"><span class="pub-icon">${icon(ic, 'w-6 h-6')}</span><div class="min-w-0 break-words [overflow-wrap:anywhere]"><div class="text-slate-500">${label}</div><div class="font-semibold text-slate-900">${html}</div></div></div>` : '';
    const sub = [days && hours ? `দাপ্তরিক সময়: ${days}, ${hours}` : '', wk.length ? `সাপ্তাহিক ছুটি: ${wk.map(d => U.DAYS[d]).join(' ও ')}` : ''].filter(Boolean).join(' · ');
    const multi = multiCampus();
    return Pub.wrap(Pub.hero('যোগাযোগ করুন', esc(sub)) + `<section class="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-20"><div class="grid lg:grid-cols-12 gap-6">
      <div class="lg:col-span-7 space-y-6"><div class="card pub-card p-6 sm:p-8 grid sm:grid-cols-2 gap-6">
          ${line('map-pin', 'ঠিকানা', esc(s.address || ''))}${line('phone', 'ফোন', s.phone ? `<a class="hover:underline" href="tel:${esc(tel(s.phone))}">${esc(s.phone)}</a>` : '')}${line('mail', 'ই-মেইল', s.email ? `<a class="hover:underline" href="mailto:${esc(s.email)}">${esc(s.email)}</a>` : '')}${line('globe', 'ওয়েবসাইট', s.website ? esc(s.website) : '')}
          ${line('clock', 'দাপ্তরিক সময়', days && hours ? `${esc(days)}<br>${esc(hours)}${oh.note ? `<div class="font-normal text-slate-600">${esc(oh.note)}</div>` : ''}` : '')}${line('calendar-off', 'সাপ্তাহিক ছুটি', wk.length ? esc(wk.map(d => U.DAYS[d]).join(', ')) : '')}
          ${!s.address && !s.phone && !s.email ? '<p class="sm:col-span-2 text-slate-500">যোগাযোগের তথ্য শিগগিরই যোগ করা হবে।</p>' : ''}</div>
        ${multi ? `<div class="grid sm:grid-cols-2 gap-4">${DB.s.campuses.map(c => `<div class="card pub-card p-5"><div class="font-heading font-bold text-lg flex items-center gap-2">${icon('school', 'w-5 h-5 text-brand-600')} ${esc(c.name)}</div>${c.address ? `<div class="text-slate-600 mt-2 flex gap-2">${icon('map-pin', 'w-4 h-4 mt-1 shrink-0')}${esc(c.address)}</div>` : ''}${c.phone ? `<div class="text-slate-600 mt-1 flex gap-2">${icon('phone', 'w-4 h-4 mt-1 shrink-0')}<a class="hover:underline" href="tel:${esc(tel(c.phone))}">${esc(c.phone)}</a></div>` : ''}</div>`).join('')}</div>` : ''}
        <div class="card pub-card"><div class="pub-cardhead border-b border-slate-100">${icon('calendar-days', 'w-5 h-5 shrink-0')}<h2 class="font-heading text-xl font-bold flex-1">আসন্ন ছুটি</h2>${DB.s.featureFlags.calendar !== false ? `<a href="${App.href('public', 'calendar')}" class="text-brand-700 font-semibold hover:underline whitespace-nowrap">ক্যালেন্ডার</a>` : ''}</div>
          <div class="divide-y divide-slate-100">${up.map(h => `<div class="pub-row"><div class="pub-date"><b>${bnNum(U.d(h.date).getDate())}</b>${U.MONTHS[U.d(h.date).getMonth()]}</div><div class="min-w-0"><div class="font-semibold text-slate-800">${esc(h.name)}</div><div class="text-slate-500">${h.to && h.to !== h.date ? `${U.fmtDate(h.date)} – ${U.fmtDate(h.to)} · ` : ''}প্রতিষ্ঠান বন্ধ${h.campusId && multi && DB.campus(h.campusId) ? ` · কেবল ${esc(DB.campus(h.campusId).short || DB.campus(h.campusId).name)}` : ''}</div></div></div>`).join('') || '<div class="p-5 text-slate-500">সামনে কোনো ছুটি নির্ধারিত নেই।</div>'}</div></div></div>
      <div class="lg:col-span-5"><form id="contact-form" class="card pub-card p-6 space-y-4 lg:sticky lg:top-24"><h2 class="font-heading text-xl font-bold">বার্তা পাঠান</h2><div><label class="label" for="cf-n">আপনার নাম</label><input id="cf-n" class="input" name="name" required maxlength="80"></div><div><label class="label" for="cf-c">ফোন অথবা ই-মেইল</label><input id="cf-c" class="input" name="contact" required maxlength="80"></div><div><label class="label" for="cf-m">বার্তা</label><textarea id="cf-m" class="textarea" rows="5" name="message" required maxlength="1500"></textarea></div><button class="btn btn-primary w-full">${icon('send')} জিজ্ঞাসা পাঠান</button></form></div>
      </div>${s.address ? `<div class="mt-6 rounded-2xl overflow-hidden border border-slate-200"><iframe class="w-full h-72 sm:h-96 border-0" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="মানচিত্র" src="https://maps.google.com/maps?q=${encodeURIComponent(s.address)}&output=embed"></iframe></div>` : ''}</section>`);
  },
};

/* ---------- pages ---------- */
const instAchPage = { id: 'inst-achievements', label: 'প্রতিষ্ঠানের অর্জন', icon: 'trophy', module: 'settings', render: () => PubContent.adminPage() };
App.addPage('principal', instAchPage);
App.addPage('admin', instAchPage);

App.addPage('public', { id: 'achievements', label: 'অর্জন', icon: 'trophy', when: () => PubContent.visible().length > 0, render: () => PubContent.achievementsPage() }, 'about');
App.addPage('public', { id: 'syllabus', label: 'পাঠ্যসূচি', icon: 'book-open-check', when: () => PubContent.cfg().syllabus, render: () => PubContent.syllabusPage() }, 'programs');
App.addPage('public', { id: 'materials', label: 'পাঠ-উপকরণ', icon: 'folder-open', flag: 'studyMaterials', when: () => PubContent.cfg().materials, render: () => PubContent.materialsPage() }, 'syllabus');
App.addPage('public', { id: 'library', label: 'গ্রন্থাগার', icon: 'library', flag: 'library', when: () => PubContent.cfg().library, render: () => Pub.wrap(Pub.hero('গ্রন্থাগারের বইয়ের তালিকা', 'কোন বই আছে এবং এখন কতটি কপি পাওয়া যাবে।') + Pub.section('', '', PubContent.catalogue())) }, 'materials');
Object.assign(App.portals.public.pages.find(p => p.id === 'contact'), { render: () => PubContent.contactPage() });
// menu: অর্জন after পরিচিতি; the optional pages in the footer's information column (Settings → Menus & URLs can move them)
(() => { const nav = App.portals.public.nav, i = nav.findIndex(n => n[0] === 'about'); if (!nav.some(n => n[0] === 'achievements')) nav.splice(i < 0 ? nav.length : i + 1, 0, ['achievements', 'অর্জন']); })();
Object.assign(Menus.FOOTER, { achievements: 'info', syllabus: 'info', materials: 'info', library: 'info' });

const bookList = who => ({
  id: 'booklist', label: 'গ্রন্থাগারের বই', icon: 'library', module: 'logistics', flag: 'library',
  render() {
    return pageHeader('গ্রন্থাগারের বইয়ের তালিকা') + PubContent.catalogue();
  },
});
App.addPage('student', bookList('student'), 'logistics');
App.addPage('guardian', bookList('guardian'), 'logistics');

/* ---------- print headers: optional Bangla / Hijri date line (ফিচার ও সেটিংস → তারিখ ও ক্যালেন্ডার) ---------- */
(() => {
  if (typeof Print === 'undefined' || !Print.header) return;
  const h0 = Print.header;
  Print.header = function (...a) {
    const h = h0.apply(this, a);
    const d = new Date();
    if (!U.altDates(d, 'print').length) return h;   // only when Bangla / Hijri is switched on for prints
    return h + `<div class="doc-altdate" style="text-align:right;font-size:9pt;color:#475569;margin:-3mm 0 3mm">তারিখ: ${U.dateLine(d, 'print').map(esc).join(' · ')}</div>`;
  };
})();

/* ---------- settings (ফিচার ও সেটিংস) ---------- */
(() => {
  const chk = (name, label, on, dis, hint) => `<label class="flex items-start gap-3 py-2"><input type="checkbox" class="w-5 h-5 mt-0.5 accent-[var(--brand)] shrink-0" name="${name}" ${on ? 'checked' : ''} ${dis}><span><span class="font-semibold">${label}</span>${hint ? `<span class="block text-slate-500">${hint}</span>` : ''}</span></label>`;
  const conf = k => { const c = DB.s.config || (DB.s.config = {}); return c[k] || (c[k] = {}); };
  FeatureCfg.PARAMS['পাবলিক কনটেন্ট'] = [
    { k: 'pubContent', type: 'html', render(dis) {
      const p = PubContent.cfg();
      return `${chk('ps_syllabus', 'পাঠ্যক্রম ও পাঠ্যসূচি', p.syllabus, dis)}${chk('ps_materials', 'পাঠ-উপকরণ (যেগুলোতে “পাবলিক” চিহ্ন আছে)', p.materials, dis)}
        ${chk('ps_library', 'গ্রন্থাগারের বইয়ের তালিকা', p.library, dis)}${chk('ps_studentAch', 'শিক্ষার্থীদের অর্জন (সম্মতিসহ বাছাই করা)', p.studentAch, dis)}`;
    }, save(form) { const c = conf('publicSite'); ['syllabus', 'materials', 'library', 'studentAch'].forEach(k => { c[k] = !!form['ps_' + k]?.checked; }); } },
  ];
  FeatureCfg.PARAMS['তারিখ প্রদর্শন'] = [
    { k: 'dates', type: 'html', render(dis) {
      const c = U.dateCfg(), d = new Date(), name = k => U.CALS.find(x => x[0] === k)[1];
      const sample = k => k === 'greg' ? U.fmtDate(U.iso(d)) : k === 'bangla' ? U.bnDate(d) : U.hijriDate(d);
      const rows = c.order.map((k, i) => `<tr><td class="whitespace-nowrap"><span class="inline-flex flex-col align-middle mr-1"><button type="button" class="btn btn-ghost btn-sm !px-1 !py-0" aria-label="ওপরে" ${i && !dis ? '' : 'disabled'} onclick="PubContent.dateMove('${k}',-1)">${icon('chevron-up', 'w-4 h-4')}</button><button type="button" class="btn btn-ghost btn-sm !px-1 !py-0" aria-label="নিচে" ${i < c.order.length - 1 && !dis ? '' : 'disabled'} onclick="PubContent.dateMove('${k}',1)">${icon('chevron-down', 'w-4 h-4')}</button></span><b>${name(k)}</b><div class="text-slate-500">${esc(sample(k))}</div></td>
        ${U.DATE_PLACES.map(([p, l]) => `<td class="text-center"><input type="checkbox" class="w-5 h-5 accent-[var(--brand)]" name="dt_${k}_${p}" aria-label="${esc(name(k) + ' — ' + l)}" ${c.use[k][p] ? 'checked' : ''} ${dis}></td>`).join('')}</tr>`).join('');
      return `<div class="scroll-x"><table class="table"><thead><tr><th>ক্যালেন্ডার ও ক্রম</th>${U.DATE_PLACES.map(([, l]) => `<th class="text-center">${l}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
        <div class="grid sm:grid-cols-2 gap-3 mt-4">${chk('dt_hshow', 'ওয়েবসাইটের শিরোনামে আজকের তারিখ দেখান', c.header.show, dis)}
        <div><label class="label" for="dt-where">কোথায়</label><select id="dt-where" class="select" name="dt_where" ${dis}><option value="strip" ${c.header.where === 'strip' ? 'selected' : ''}>ওপরের পট্টিতে</option><option value="nav" ${c.header.where === 'nav' ? 'selected' : ''}>মেনু বারে</option></select></div></div>`;
    }, save(form) {
      const c = DB.s.config || (DB.s.config = {}), cur = U.dateCfg(), use = {};
      cur.order.forEach(k => { use[k] = {}; U.DATE_PLACES.forEach(([p]) => { use[k][p] = !!form[`dt_${k}_${p}`]?.checked; }); });
      c.dates = { order: cur.order, use, header: { show: !!form.dt_hshow?.checked, where: form.dt_where?.value === 'nav' ? 'nav' : 'strip' } };
    } },
  ];
})();
PubContent.dateMove = function (k, d) {
  if (!App.has('ADMIN') && !App.has('SUPERADMIN')) return;
  const c = DB.s.config || (DB.s.config = {}), cur = U.dateCfg(), o = [...cur.order], i = o.indexOf(k), j = i + d;
  if (i < 0 || j < 0 || j >= o.length) return;
  [o[i], o[j]] = [o[j], o[i]];
  c.dates = { ...(c.dates || {}), order: o, use: cur.use, header: cur.header };
  DB.audit('SETTINGS_UPDATE', 'settings', `তারিখের ক্রম: ${o.map(x => U.CALS.find(c => c[0] === x)[1]).join(', ')}`); DB.save(); App.refresh();
};
