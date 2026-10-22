/* ==========================================================================
   TEACHER PAGES
   · Public faculty directory (/faculty): the Root User / Principal choose which teacher fields
     are public and which filters visitors get (ফিচার ও সেটিংস → শিক্ষকমণ্ডলী (পাবলিক); stored in
     site.faculty). A field switched off is also withheld by the server (server/public.js).
   · Public teacher page (/teacher?id=T…): one page per teacher, shareable.
   · Staff teacher page (/principal/teacher-profile?id=T…&tab=…, also in the Root User portal):
     the full record with tabs (Faculty.render in js/modules/faculty.js), per RBAC.
   ========================================================================== */

const TeacherPage = {
  FIELDS: [['photo', 'ছবি'], ['designation', 'পদবি'], ['dept', 'বিভাগ'], ['subjects', 'বিষয়সমূহ'], ['classes', 'যে শ্রেণিতে পড়ান'], ['qualification', 'শিক্ষাগত যোগ্যতা'], ['experience', 'অভিজ্ঞতা'], ['bio', 'সংক্ষিপ্ত পরিচিতি'], ['contact', 'ফোন ও ই-মেইল (শিক্ষক অনুমতি দিলে)'], ['joinDate', 'যোগদানের তারিখ']],
  FILTERS: [['q', 'নাম অনুসন্ধান'], ['dept', 'বিভাগ'], ['subj', 'বিষয়'], ['campus', 'ক্যাম্পাস']],
  DEF: { fields: { photo: true, designation: true, dept: true, subjects: true, classes: true, qualification: true, experience: true, bio: true, contact: true, joinDate: false }, filters: { q: true, dept: true, subj: true, campus: true } },
  cfg() { const c = (DB.s.site && DB.s.site.faculty) || {}; return { fields: { ...this.DEF.fields, ...(c.fields || {}) }, filters: { ...this.DEF.filters, ...(c.filters || {}) } }; },
  /** Years of experience: earlier experience + years since joining. */
  years(t) { const since = t.joinDate ? Math.max(0, (Date.now() - new Date(t.joinDate)) / (365.25 * 864e5)) : 0; const y = Math.floor((+t.experienceYears || 0) + since); return y > 0 ? y : 0; },
  /** Classes the teacher teaches (assignments, else the routine where the viewer has it). */
  classes(t) { const ids = (t.assignments || []).map(a => a.classId).concat((DB.s.routine || []).filter(r => RT.hasT(r, t.id)).map(r => r.classId)); return [...new Set(ids)].map(id => DB.cls(id)).filter(Boolean).sort((a, b) => a.grade - b.grade); },
  subjects(t) { const ids = [...new Set([...(t.subjects || []), ...(t.assignments || []).map(a => a.subjectId)].filter(Boolean))]; return ids.map(id => DB.subject(id)?.name || id); },
  href(id) { return `${App.href('public', 'teacher')}?id=${encodeURIComponent(id)}`; },
  list() { return DB.s.teachers.filter(t => t.status !== 'Resigned'); },
  canEdit() { return !!App.session && (App.has('ADMIN') || App.has('PRINCIPAL')); },

  /* ---------- settings (FeatureCfg 'html' parameter) ---------- */
  editor() {
    const c = this.cfg(), dis = this.canEdit() ? '' : 'disabled';
    const chk = (name, on, label) => `<label class="flex items-start gap-2 cursor-pointer"><input type="checkbox" class="w-5 h-5 mt-0.5 shrink-0 accent-[var(--brand)]" name="${name}" ${on ? 'checked' : ''} ${dis}><span>${label}</span></label>`;
    return `<div class="space-y-5"><section><h3 class="font-semibold text-lg mb-1">পাবলিক তালিকায় শিক্ষকের যে তথ্য দেখানো হবে</h3><p class="text-slate-600 mb-2">বন্ধ করা তথ্য সার্ভার থেকেই ওয়েবসাইটে পাঠানো হয় না। ফোন ও ই-মেইল শুধু সেই শিক্ষকের দেখানো হয়, যিনি নিজের প্রোফাইলে অনুমতি দিয়েছেন।</p>
      <div class="grid sm:grid-cols-2 gap-2">${this.FIELDS.map(([k, l]) => chk(`fcf_${k}`, c.fields[k], l)).join('')}</div></section>
      <section><h3 class="font-semibold text-lg mb-2">দর্শকের জন্য ফিল্টার</h3><div class="grid sm:grid-cols-2 gap-2">${this.FILTERS.filter(([k]) => k !== 'campus' || multiCampus()).map(([k, l]) => chk(`fcl_${k}`, c.filters[k], l)).join('')}</div></section>
      ${this.canEdit() && !App.has('ADMIN') ? `<button class="btn btn-primary">${icon('save')} সংরক্ষণ করুন</button>` : ''}</div>`;
  },
  save(form) {
    if (!this.canEdit()) return;
    const box = k => !!form.elements[k]?.checked, old = this.cfg();
    DB.s.site.faculty = { fields: Object.fromEntries(this.FIELDS.map(([k]) => [k, box(`fcf_${k}`)])), filters: Object.fromEntries(this.FILTERS.map(([k]) => [k, form.elements[`fcl_${k}`] ? box(`fcl_${k}`) : old.filters[k]])) };
  },

  /* ---------- public directory ---------- */
  directory() {
    const c = this.cfg(), F = c.fields, L = c.filters, f = App.ui.fac || (App.ui.fac = { dept: '', subj: '', campus: '', q: '' });
    const all = this.list(), on = k => L[k] && (k !== 'campus' || multiCampus());
    const depts = [...new Set(all.map(t => t.dept).filter(Boolean))];
    const v = k => (on(k) ? f[k] || '' : '');
    const list = all.filter(t => { const u = DB.user(t.userId) || {}; return (!v('dept') || t.dept === v('dept')) && (!v('subj') || (t.subjects || []).includes(v('subj'))) && (!v('campus') || t.campusId === v('campus')) && (!v('q') || `${u.name || ''} ${u.nameBn || ''}`.toLowerCase().includes(v('q').toLowerCase())); });
    const filters = [on('q') ? `<input class="input" name="q" placeholder="নাম অনুসন্ধান…" aria-label="নাম অনুসন্ধান" value="${esc(f.q)}">` : '',
      on('dept') && F.dept && depts.length > 1 ? `<select class="select" name="dept" aria-label="বিভাগ"><option value="">সকল বিভাগ</option>${depts.map(d => `<option value="${esc(d)}" ${d === f.dept ? 'selected' : ''}>${esc(bn(d))}</option>`).join('')}</select>` : '',
      on('subj') && F.subjects ? `<select class="select" name="subj" aria-label="বিষয়"><option value="">সকল বিষয়</option>${subjectOptions(f.subj)}</select>` : '',
      on('campus') ? `<select class="select" name="campus" aria-label="ক্যাম্পাস"><option value="">সকল ক্যাম্পাস</option>${campusOptions(f.campus)}</select>` : ''].filter(Boolean);
    const card = t => {
      const u = DB.user(t.userId) || { name: '' }, yrs = F.experience ? this.years(t) : 0;
      return `<a href="${this.href(t.id)}" class="card p-5 block hover:shadow-md transition focus:outline-none focus:ring-2 focus:ring-brand-500"><div class="flex items-center gap-3">${F.photo ? avatar(u, 56) : ''}<div class="min-w-0"><div class="font-bold">${esc(pn(u))}</div>${F.designation && t.designation ? `<div class="text-brand-700 font-semibold">${esc(bn(t.designation))}</div>` : ''}${(F.dept && t.dept) || multiCampus() ? `<div class="text-slate-500">${[F.dept ? esc(bn(t.dept || '')) : '', multiCampus() ? esc(DB.campus(t.campusId)?.short || '') : ''].filter(Boolean).join(' · ')}</div>` : ''}</div></div>
        <div class="mt-3 text-slate-600 space-y-2">${F.qualification && t.qualification ? `<div class="flex gap-2">${icon('graduation-cap', 'w-4 h-4 text-slate-400 shrink-0 mt-1')}${esc(t.qualification)}</div>` : ''}${yrs ? `<div class="flex gap-2">${icon('briefcase', 'w-4 h-4 text-slate-400 shrink-0 mt-1')}${bnNum(yrs)} বছরের অভিজ্ঞতা</div>` : ''}
        ${F.subjects && (t.subjects || []).length ? `<div class="flex flex-wrap gap-1">${this.subjects(t).map(s => badge(s, 'green')).join('')}${t.isHead ? badge('বিভাগীয় প্রধান', 'amber') : ''}</div>` : ''}</div>
        <div class="mt-3 text-brand-700 font-semibold flex items-center gap-1">বিস্তারিত দেখুন ${icon('arrow-right', 'w-4 h-4')}</div></a>`;
    };
    return Pub.wrap(Pub.hero('শিক্ষক নির্দেশিকা', 'আমাদের শিক্ষকদের সাথে পরিচিত হোন — যেকোনো শিক্ষকের নামে ক্লিক করে পূর্ণ প্রোফাইল দেখুন।') + `<section class="max-w-7xl mx-auto px-4 py-10">
      ${filters.length ? `<form id="fac-f" class="card p-4 mb-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-3" onsubmit="return false">${filters.join('')}</form>` : ''}
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">${list.map(card).join('') || emptyState('কোনো শিক্ষক মেলেনি।', 'users')}</div></section>`);
  },
  mountDirectory() {
    const f = $('#fac-f'); if (!f) return;
    f.addEventListener('input', e => { Object.assign(App.ui.fac, formData(f)); clearTimeout(this._t); this._t = setTimeout(() => { App.refresh(); const el = $('#fac-f [name=q]'); if (el && e.target.name === 'q') { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, e.target.name === 'q' ? 300 : 0); });
  },

  /* ---------- breadcrumbs + Back for a routed single page ---------- */
  crumbs(items, back) {
    return `<div class="flex flex-wrap items-center gap-2 mb-5"><a class="btn btn-ghost btn-sm" href="${back}">${icon('arrow-left')} ফিরে যান</a>
      <nav class="flex flex-wrap items-center gap-1 text-slate-500" aria-label="পথনির্দেশিকা">${items.map(([l, h], i) => `${i ? '<span class="text-slate-300">›</span>' : ''}${h ? `<a class="crumb hover:underline" href="${h}">${esc(l)}</a>` : `<span class="crumb-cur" aria-current="page">${esc(l)}</span>`}`).join('')}</nav></div>`;
  },

  /* ---------- public teacher page ---------- */
  publicPage(q = {}) {
    const t = this.list().find(x => x.id === q.id), back = App.href('public', 'faculty');
    if (!t) return Pub.wrap(Pub.hero('শিক্ষকের প্রোফাইল', '') + `<section class="max-w-4xl mx-auto px-4 py-10">${this.crumbs([['প্রথম পাতা', '/'], ['শিক্ষকমণ্ডলী', back], ['পাওয়া যায়নি']], back)}<div class="card p-6">${emptyState('এই শিক্ষকের প্রোফাইল পাওয়া যায়নি।', 'user-x')}</div></section>`);
    const F = this.cfg().fields, u = DB.user(t.userId) || { name: '' }, yrs = F.experience ? this.years(t) : 0, cls = F.classes ? this.classes(t) : [];
    const contact = F.contact && t.showContact !== false && (u.phone || u.email);
    const facts = [F.designation && t.designation ? ['পদবি', esc(bn(t.designation))] : null, F.dept && t.dept ? ['বিভাগ', esc(bn(t.dept))] : null, multiCampus() ? ['ক্যাম্পাস', esc(DB.campus(t.campusId)?.name || '')] : null,
      F.qualification && t.qualification ? ['শিক্ষাগত যোগ্যতা', esc(t.qualification)] : null, yrs ? ['অভিজ্ঞতা', `${bnNum(yrs)} বছর`] : null, F.joinDate && t.joinDate ? ['যোগদান', U.fmtDate(t.joinDate)] : null].filter(Boolean);
    document.title = `${pn(u)} — ${DB.s.school.nameBn || DB.s.school.name}`;
    return Pub.wrap(`<section class="max-w-5xl mx-auto px-4 py-8 sm:py-10">${this.crumbs([['প্রথম পাতা', '/'], ['শিক্ষকমণ্ডলী', back], [pn(u)]], back)}
      <div class="card p-5 sm:p-8"><div class="flex flex-col sm:flex-row sm:items-center gap-5">${F.photo ? avatar(u, 112) : ''}<div class="min-w-0"><h1 class="font-heading text-2xl sm:text-3xl font-bold text-brand-800">${esc(pn(u))}</h1>${u.nameBn && u.name ? `<div class="text-slate-500" lang="en">${esc(u.name)}</div>` : ''}${F.designation && t.designation ? `<div class="text-lg text-brand-700 font-semibold mt-1">${esc(bn(t.designation))}${t.isHead ? ` · ${esc('বিভাগীয় প্রধান')}` : ''}</div>` : ''}</div></div>
        ${facts.length ? `<dl class="grid sm:grid-cols-2 gap-x-8 gap-y-3 mt-6">${facts.map(([k, v]) => `<div><dt class="text-slate-500">${k}</dt><dd class="font-semibold">${v}</dd></div>`).join('')}</dl>` : ''}
        ${F.bio && t.bio ? `<div class="mt-6"><h2 class="font-semibold text-lg mb-1">পরিচিতি</h2><p class="text-slate-700 leading-relaxed whitespace-pre-line">${esc(t.bio)}</p></div>` : ''}
        ${F.subjects && this.subjects(t).length ? `<div class="mt-6"><h2 class="font-semibold text-lg mb-2">যে বিষয় পড়ান</h2><div class="flex flex-wrap gap-1.5">${this.subjects(t).map(s => badge(s, 'green')).join('')}</div></div>` : ''}
        ${cls.length ? `<div class="mt-6"><h2 class="font-semibold text-lg mb-2">যে শ্রেণিতে পড়ান</h2><div class="flex flex-wrap gap-1.5">${cls.map(c => badge(DB.className(c.id), 'blue')).join('')}</div></div>` : ''}
        ${contact ? `<div class="mt-6"><h2 class="font-semibold text-lg mb-2">যোগাযোগ</h2><div class="flex flex-wrap gap-3">${u.phone ? `<a class="btn btn-ghost" href="tel:${esc(u.phone)}">${icon('phone')} ${esc(U.bn(u.phone))}</a>` : ''}${u.email ? `<a class="btn btn-ghost max-w-full" href="mailto:${esc(u.email)}"><span class="truncate">${icon('mail')} ${esc(u.email)}</span></a>` : ''}</div></div>` : ''}
      </div></section>`);
  },

  /** The browser tab shows the teacher's name (set after the router has written the page label). */
  title(q = {}) { const t = DB.teacher(q.id), u = t && DB.user(t.userId); if (u) setTimeout(() => { document.title = `${pn(u)} — ${DB.s.school.nameBn || DB.s.school.name}`; }, 0); },

  /* ---------- staff teacher page ---------- */
  staffPage(q = {}) {
    const t = DB.teacher(q.id), P = App.route.portal, back = App.href(P, App.portals[P].pages.some(p => p.id === 'faculty') ? 'faculty' : App.portals[P].pages.some(p => p.id === 'staff') ? 'staff' : App.portals[P].pages[0].id);
    const crumbs = n => this.crumbs([[App.portals[P].title, App.href(P)], ['শিক্ষকমণ্ডলী', back], [n]], back);
    if (!t) return crumbs('পাওয়া যায়নি') + `<div class="card p-6">${emptyState('এই শিক্ষকের রেকর্ড পাওয়া যায়নি।', 'user-x')}</div>`;
    Faculty.tid = t.id; Faculty.asgDraft = Faculty.asgDraft && Faculty.asgDraft.tid === t.id ? Faculty.asgDraft : null;
    Faculty.tab = Faculty.TABS.some(([k]) => k === q.tab) ? q.tab : 'overview';
    const u = DB.user(t.userId) || {};
    document.title = `${pn(u)} — ${DB.s.school.nameBn || DB.s.school.name}`;
    return crumbs(`শিক্ষকের প্রোফাইল · ${pn(u)}`) + '<div id="fac"></div>';
  },
};

/* settings groups */
if (typeof FeatureCfg !== 'undefined') FeatureCfg.PARAMS['শিক্ষকমণ্ডলী (পাবলিক)'] = [{ k: 'facultyPublic', type: 'html', render: () => TeacherPage.editor(), save: form => TeacherPage.save(form) }];

/* public pages */
Object.assign(App.portals.public.pages.find(p => p.id === 'faculty'), { render: () => TeacherPage.directory(), mount: () => TeacherPage.mountDirectory() });
App.addPage('public', { id: 'teacher', label: 'শিক্ষকের প্রোফাইল', icon: 'user-round', hidden: true, render: q => TeacherPage.publicPage(q), mount: q => TeacherPage.title(q) }, 'faculty');

/* staff page: principal and Root User dashboards (the Root User portal carries every principal page) */
['principal', 'admin'].forEach(portal => {
  if (!App.portals[portal] || App.portals[portal].pages.some(p => p.id === 'teacher-profile')) return;
  App.addPage(portal, { id: 'teacher-profile', label: 'শিক্ষকের প্রোফাইল', icon: 'user-round', module: 'hr', hidden: true, render: q => TeacherPage.staffPage(q), mount: q => { Faculty.render(); TeacherPage.title(q); } });
});
