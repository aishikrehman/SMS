/* ==========================================================================
   PUBLIC WEBSITE EXTENSIONS
   Configurable hero homepage · Academic programmes · Image gallery ·
   Faculty directory · One-stop "Track & Verify" page (applications, TC,
   testimonials, marksheets, receipts, service requests, admit cards).
   ========================================================================== */

const Site = {
  /** The four headline numbers (Settings → Website & hero → statistics). */
  stats() {
    const st = DB.s.school.stats || {};
    // only the figures the school has entered (Settings → Website); a new institution shows none
    return [['বোর্ড পরীক্ষায় পাসের হার', +st.passRate, bnNum(st.passRate) + '%', 'trending-up'], ['শিক্ষার্থী', +st.scholars, bnNum(+st.scholars, true), 'users'], ['শিক্ষকমণ্ডলী', +st.faculty, bnNum(st.faculty), 'presentation'], ['জিপিএ ৫.০০ প্রাপ্ত', +st.aPlus, bnNum(st.aPlus), 'trophy']].filter(r => r[1] > 0).map(([l, , v, i]) => [l, v, i]);
  },
  hero() {
    const h = DB.s.site.hero, s = DB.s.school, center = h.align === 'center';
    const bg = h.image ? `background-image:linear-gradient(100deg, rgb(var(--b950) / .92) 0%, rgb(var(--b900) / .72) 50%, rgb(var(--b900) / .3) 100%), url('${h.image}');background-size:cover;background-position:center` : '';
    // headline: Bangla name when the title is the English name; the other name (if different) goes underneath
    const title = h.title === s.name && s.nameBn ? s.nameBn : h.title;
    const alt = [s.name, s.nameBn].find(n => n && n !== title) || '';
    const facts = [['প্রতিষ্ঠাকাল', s.founded ? bnNum(s.founded) : ''], ['ইআইআইএন', s.eiin ? bnNum(s.eiin) : ''], ['ক্যাম্পাস', DB.s.campuses.length > 1 ? bnNum(DB.s.campuses.length) : '']].filter(([, v]) => v);
    const emblem = center ? '' : `<div class="hidden lg:block lg:col-span-5"><div class="pub-emblem p-8 text-center max-w-md ml-auto">
        <span class="pub-ring">${logoHtml(112)}</span>
        <div class="font-heading text-2xl font-bold mt-6">${esc(s.nameBn || s.name)}</div>${s.mottoBn || s.motto ? `<div class="text-white/80 mt-1">${esc(s.mottoBn || s.motto)}</div>` : ''}
        ${facts.length ? `<div class="grid grid-cols-${facts.length} gap-3 mt-6">${facts.map(([l, v]) => `<div class="pub-fact"><b>${esc(v)}</b><span class="text-white/80">${l}</span></div>`).join('')}</div>` : ''}</div></div>`;
    const stats = h.showStats && this.stats().length ? `<div class="pub-stats-wrap"><div class="max-w-7xl mx-auto px-4 sm:px-6"><div class="pub-stats card pub-card">${this.stats().map(([l, v, i]) => `<div class="pub-stat"><span class="pub-icon">${icon(i, 'w-6 h-6')}</span><div class="min-w-0"><div class="v">${v}</div><div class="l">${l}</div></div></div>`).join('')}</div></div></div>` : '';
    return `<section class="pub-hero ${stats ? 'has-stats' : ''} text-white" style="${bg}"><div class="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-20 grid lg:grid-cols-12 gap-10 items-center">
      <div class="${center ? 'lg:col-span-12 text-center mx-auto max-w-3xl' : 'lg:col-span-7'}">
        <div class="flex flex-wrap gap-2 ${center ? 'justify-center' : ''}"><span class="pub-chip">${icon('badge-check', 'w-4 h-4')} ${esc(bn(s.type))}</span>${s.founded ? `<span class="pub-chip">${icon('landmark', 'w-4 h-4')} স্থাপিত ${bnNum(s.founded)}</span>` : ''}</div>
        <h1 class="mt-5">${esc(title)}</h1>${alt ? `<div class="text-xl mt-2 text-white/80" data-noi18n>${esc(alt)}</div>` : ''}
        ${h.subtitle ? `<p class="text-lg sm:text-xl text-white/90 mt-5 max-w-2xl leading-relaxed ${center ? 'mx-auto' : ''}">${esc(h.subtitle)}</p>` : ''}
        <div class="flex flex-wrap gap-3 mt-8 ${center ? 'justify-center' : ''}">${h.ctaText ? `<a href="${esc(App.clean(h.ctaLink))}" class="btn btn-accent shadow-lg">${icon('file-pen-line')} ${esc(h.ctaText)}</a>` : ''}${h.cta2Text ? `<a href="${esc(App.clean(h.cta2Link))}" class="btn pub-btn-outline">${icon('award')} ${esc(h.cta2Text)}</a>` : ''}</div></div>
      ${emblem}
    </div></section>${stats}`;
  },
  /** Gallery items that have an uploaded image (the only ones shown on the website). */
  gallery() { return ((DB.s.site || {}).gallery || []).filter(g => g && g.dataUrl); },
  lightbox(id) {
    const list = Site.gallery(), i = list.findIndex(g => g.id === id), g = list[i];
    Modal.open({ title: esc(g.title), size: 'xl', body: `<img src="${galleryImg(g)}" class="w-full rounded-lg"><div class="flex items-center justify-between mt-3 text-sm text-slate-500"><span>${esc(g.album)} · ${U.fmtDate(g.date)}</span><span class="flex gap-2"><button class="btn btn-ghost btn-sm" ${i > 0 ? '' : 'disabled'} onclick="Site.lightbox('${list[i - 1]?.id}')">${icon('chevron-left')}</button><button class="btn btn-ghost btn-sm" ${i < list.length - 1 ? '' : 'disabled'} onclick="Site.lightbox('${list[i + 1]?.id}')">${icon('chevron-right')}</button></span></div>` });
  },
  /** Auto-detect what a code is, so one search box can verify anything. */
  detect(code) {
    const c = code.trim().toUpperCase();
    if (/^APP-/.test(c) || /^01[3-9]\d{8}$/.test(c)) return 'application';
    if (/^(TC|TST|CC|TR)-/.test(c)) return 'tc';
    if (/^PAY/.test(c)) return 'receipt';
    if (/^SR/.test(c)) return 'service';
    if (/^(JV|PV|RV)/.test(c)) return 'voucher';
    if (/^IP/.test(c)) return 'plan';
    if (/^S\d{3,}$/.test(c)) return 'student';
    if (c.includes('|')) return 'admit';
    if (c.includes('_')) return 'marksheet';
    return 'tc';
  },
};

App.addPage('public', {
  id: 'programs', label: 'শিক্ষা কার্যক্রম', icon: 'book-open', when: () => (DB.s.site.programs || []).length > 0,
  render() {
    return Pub.wrap(Pub.hero('একাডেমিক কার্যক্রম', `${esc(DB.s.school.nameBn || DB.s.school.name)}-এর শিক্ষা কার্যক্রম${multiCampus() ? ' ও ক্যাম্পাসসমূহ' : ''}।`)
      + Pub.section('কার্যক্রমসমূহ', '', `<div class="space-y-4">${DB.s.site.programs.map(p => `<div class="card p-6 flex flex-col sm:flex-row gap-5"><div class="w-14 h-14 rounded-lg bg-brand-600 text-white flex items-center justify-center shrink-0">${icon(p.icon || 'book-open', 'w-7 h-7')}</div><div><h3 class="font-heading text-xl font-bold text-brand-800">${esc(p.name)}</h3><div class="text-sm text-accent font-semibold">${esc(p.ages || '')}</div><p class="text-slate-700 mt-2 leading-relaxed">${esc(p.desc)}</p></div></div>`).join('')}</div>
        <div class="mt-8 grid md:grid-cols-2 gap-4">${DB.s.campuses.map(c => `<div class="card p-5"><div class="font-bold flex items-center gap-2">${icon('school', 'w-5 h-5 text-brand-600')} ${esc(multiCampus() ? c.name : 'শ্রেণিসমূহ')}</div><div class="text-sm text-slate-600 mt-1">${esc(c.levels || '')}</div><div class="flex flex-wrap gap-1.5 mt-3">${DB.classesIn(c.id).map(k => badge(k.name, 'green')).join('')}</div></div>`).join('')}</div>
        <div class="mt-6 flex flex-wrap gap-3"><a class="btn btn-primary" href="${App.href('public', 'prospectus')}">${icon('book-open')} প্রসপেক্টাস ও ফি</a><a class="btn btn-ghost" href="${App.href('public', 'admissions')}">${icon('file-pen-line')} অনলাইনে আবেদন করুন</a></div>`));
  },
}, 'about');

App.addPage('public', {
  id: 'gallery', label: 'ফটো গ্যালারি', icon: 'images', flag: 'gallery', when: () => Site.gallery().length > 0,
  render() {
    const all = Site.gallery(), albums = [...new Set(all.map(g => g.album))], a = App.ui.galAlbum || 'All';
    const list = all.filter(g => a === 'All' || g.album === a);
    return Pub.wrap(Pub.hero('ফটো গ্যালারি', 'শ্রেণিকক্ষ, গবেষণাগার, খেলার মাঠ ও জাতীয় দিবসের মুহূর্তসমূহ।') + Pub.section('অ্যালবাম', '', `
      <div class="flex flex-wrap gap-2 mb-5">${['All', ...albums].map(x => `<button class="btn btn-sm ${x === a ? 'btn-primary' : 'btn-ghost'}" onclick="App.ui.galAlbum='${esc(x)}';App.refresh()">${x === 'All' ? 'সকল' : esc(x)} <span class="opacity-60">${bnNum(x === 'All' ? all.length : all.filter(g => g.album === x).length)}</span></button>`).join('')}</div>
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">${list.map(g => `<button class="text-left group" onclick="Site.lightbox('${g.id}')"><div class="rounded-lg overflow-hidden"><img src="${galleryImg(g)}" class="w-full aspect-[4/3] object-cover group-hover:scale-105 transition" alt="${esc(g.title)}"></div><div class="text-sm font-semibold mt-1.5">${esc(g.title)}</div><div class="text-xs text-slate-500">${esc(g.album)} · ${U.fmtDate(g.date)}</div></button>`).join('') || emptyState('এখনো কোনো ছবি নেই।', 'images')}</div>`));
  },
}, 'calendar');

/* Faculty directory and each teacher's own page: js/modules/teacherpage.js */
App.addPage('public', { id: 'faculty', label: 'শিক্ষকমণ্ডলী', icon: 'users', render() { return ''; } }, 'programs');

/* ---------- Track & Verify (one page) ---------- */
Object.assign(App.portals.public.pages.find(p => p.id === 'verify'), {
  label: 'অনুসন্ধান ও যাচাই',
  render(q) {
    const code = (q.code || App.ui.verCode || q.ref || App.ui.trackTerm || '').trim();
    const type = q.type || (code ? Site.detect(code) : null);
    let out = '';
    const ok = (title, rows, extra = '') => `<div class="card p-5 border-emerald-300 bg-emerald-50/40"><div class="flex items-center gap-2 text-emerald-700 font-bold">${icon('badge-check', 'w-5 h-5')} ${title}</div><dl class="grid sm:grid-cols-2 gap-x-6 gap-y-2 mt-4 text-sm">${rows.map(([k, v]) => `<div><dt class="text-slate-500 text-xs uppercase font-semibold">${k}</dt><dd class="font-semibold">${v}</dd></div>`).join('')}</dl>${extra}</div>`;
    const bad = what => `<div class="card p-5 border-red-300 bg-red-50/50 text-red-700"><div class="font-bold flex items-center gap-2">${icon('octagon-alert', 'w-5 h-5')} পাওয়া যায়নি — সম্ভাব্য জালিয়াতি বা টাইপের ভুল</div><p class="text-sm mt-1">“${esc(code)}”-এর সাথে কোনো ${what} মেলেনি। এটি ভুল মনে হলে বিদ্যালয় দপ্তরে যোগাযোগ করুন।</p></div>`;
    if (code) {
      const C = code.toUpperCase();
      if (type === 'application') {
        const hits = DB.s.admissions.filter(a => a.id.toUpperCase() === C || a.guardianPhone === code);
        out = hits.length ? hits.map(a => (typeof Admissions !== 'undefined' ? Admissions.publicStatus(a) : ok(`আবেদন ${a.id}`, [['আবেদনকারী', esc(a.studentNameBn || a.studentName)], ['অবস্থা', bn(a.status)]]))).join('') : bad('ভর্তির আবেদন');
      }
      if (type === 'tc') { const c = DB.s.certificates.find(x => x.serial.toUpperCase() === C); out = c ? ok(`সঠিক ও প্রামাণিক — ${esc(bn(c.type))}`, [['ক্রমিক নম্বর', c.serial], ['শিক্ষার্থী', esc(c.studentNameBn || c.studentName)], ['পিতার নাম', esc(c.fatherNameBn || c.fatherName)], ['শ্রেণি', esc(c.classLeft)], ['ইস্যুর তারিখ', U.fmtDate(c.issueDate)], ['আচরণ', esc(bn(c.conduct))], ['কারণ / মন্তব্য', esc(c.reason)], ['বকেয়া', c.duesCleared ? 'পরিশোধিত' : 'বকেয়া']], `<button class="btn btn-ghost btn-sm mt-4" onclick="Print.show('certificate','${c.serial}')">${icon('file-text')} সনদ দেখুন</button>`) : bad('সনদ'); }
      if (type === 'marksheet') { const [reg, ex] = code.split('_'); const st = DB.s.students.find(s => s.regNo === reg), exam = DB.exam(ex); if (st && exam) { const r = DB.result(st.id, ex); out = ok('সঠিক ও প্রামাণিক — নম্বরপত্র', [['শিক্ষার্থী', esc(pn(st))], ['শ্রেণি / রোল', `${esc(DB.className(st.classId))} / ${bnNum(st.roll)}`], ['পরীক্ষা', esc(exam.name)], ['ফলাফল', `${r.gpa !== null ? 'জিপিএ ' + gpaFmt(r.gpa) + ' · ' : ''}${esc(r.letter)}`]]); } else out = bad('নম্বরপত্র'); }
      if (type === 'receipt') { const p = DB.s.payments.find(x => x.id === C); out = p ? ok('সঠিক ও প্রামাণিক — টাকার রসিদ', [['রসিদ', p.id], ['শিক্ষার্থী', esc(pn(DB.student(p.studentId)))], ['পরিমাণ', U.money(p.amount)], ['পরিশোধিত', `${esc(bn(p.method))}-এর মাধ্যমে ${U.fmtDate(p.date)}`], ['ট্রানজ্যাকশন আইডি (TrxID)', `<span class="font-mono">${esc(p.txn)}</span>`], ['যাচাই', p.verified === false ? 'এমএফএস মিলিয়ে দেখার অপেক্ষায়' : 'যাচাইকৃত'], ...(p.teller ? [['টেলার', esc(p.teller)]] : [])]) : bad('রসিদ'); }
      if (type === 'service') { const r = DB.s.serviceRequests.find(x => x.id === C); out = r ? ok(`সেবা অনুরোধ ${r.id}`, [['ধরন', esc(bn(r.type))], ['শিক্ষার্থী', esc(pn(DB.student(r.studentId)))], ['অবস্থা', esc(bn(r.status))], ['ফলাফল', esc(r.outcome || '—')]]) : bad('সেবা অনুরোধ'); }
      if (type === 'voucher') { const v = DB.s.journal.find(x => x.id === C); out = v ? ok('সঠিক ও প্রামাণিক — হিসাব ভাউচার', [['ভাউচার', v.id], ['তারিখ', U.fmtDate(v.date)], ['পরিমাণ', U.money(U.sum(v.lines, l => l.dr))], ['বিবরণ', esc(v.memo)]]) : bad('ভাউচার'); }
      if (type === 'plan') { const p = DB.s.installmentPlans.find(x => x.id === C); out = p ? ok('কিস্তি পরিকল্পনা', [['পরিকল্পনা', p.id], ['শিক্ষার্থী', esc(pn(DB.student(p.studentId)))], ['মোট', U.money(p.total)], ['সময়সূচি', `${bnNum(p.count)} × ${esc(bn(p.frequency))}`]]) : bad('কিস্তি পরিকল্পনা'); }
      if (type === 'admit') { const [reg, ex] = code.split('|'); const st = DB.s.students.find(s => s.regNo === reg), exm = DB.exam(ex); out = st && exm && DB.admitCleared(st.id, exm) ? ok('বৈধ প্রবেশপত্র', [['শিক্ষার্থী', esc(pn(st))], ['শ্রেণি / রোল', `${esc(DB.className(st.classId))} / ${bnNum(st.roll)}`], ['পরীক্ষা', esc(exm.name)], ['ফি পরিশোধের ছাড়পত্র', DB.duesBefore(st.id, exm.start) ? 'বিদ্যালয় কর্তৃক অব্যাহতিপ্রাপ্ত (বকেয়া অপরিশোধিত)' : 'পরিশোধিত']]) : bad('প্রবেশপত্র'); }
      if (type === 'student') { const st = DB.student(C); out = st ? ok(st.status === 'active' ? 'বৈধ শিক্ষার্থী পরিচয়পত্র' : 'শিক্ষার্থী — বর্তমানে সক্রিয় নয়', [['নাম', esc(pn(st))], ['শ্রেণি / শাখা', `${esc(DB.className(st.classId))} / ${esc(st.section)}`], ['রোল', bnNum(st.roll)], ...(multiCampus() ? [['ক্যাম্পাস', esc(DB.campus(DB.campusOf(st.classId))?.name || '')]] : []), ['অবস্থা', esc(bn(st.status))]]) : bad('শিক্ষার্থী'); }
      if (type === 'employee') { const e = DB.emp(C); out = e ? ok('বৈধ কর্মচারী আইডি', [['নাম', esc(pn(e))], ['পদবি', esc(e.designation)], ...(multiCampus() ? [['ক্যাম্পাস', esc(DB.campus(e.campusId)?.name || '')]] : []), ['অবস্থা', esc(bn(e.status || 'Active'))]]) : bad('কর্মচারী'); }
      if (type === 'invoice') { const st = DB.student(code); out = st ? ok('ফি বিল', [['শিক্ষার্থী', esc(pn(st))], ['বকেয়া', U.money(DB.dues(st.id))]]) : bad('বিল'); }
    }
    const types = [['application', 'ভর্তির আবেদন'], ['tc', 'টিসি / প্রশংসাপত্র / সনদ'], ['marksheet', 'নম্বরপত্র'], ['receipt', 'টাকার রসিদ'], ['service', 'সেবা অনুরোধ'], ['admit', 'প্রবেশপত্র'], ['voucher', 'ভাউচার'], ['plan', 'কিস্তি পরিকল্পনা']];
    return Pub.wrap(Pub.hero('অনুসন্ধান ও যাচাই', 'একটি অনুসন্ধান বাক্স থেকেই ভর্তির আবেদনের অবস্থা দেখুন, অথবা ছাড়পত্র, প্রশংসাপত্র, নম্বরপত্র, রসিদ বা আমাদের ইস্যুকৃত যেকোনো কাগজের সত্যতা যাচাই করুন।') + `<section class="max-w-3xl mx-auto px-4 py-10 space-y-5">
      <form id="tv-form" class="card p-5"><label class="label">রেফারেন্স, ক্রমিক নম্বর অথবা ফোন নম্বর</label><div class="flex flex-col sm:flex-row gap-3"><input class="input text-lg" name="code" value="${esc(code)}" placeholder="APP-… · TC-… · PAY… · 01XXXXXXXXX" required><button class="btn btn-primary">${icon('search')} অনুসন্ধান / যাচাই</button></div>
      <div class="text-xs text-slate-500 mt-2">${code ? `শনাক্তকৃত: <b>${esc((types.find(t => t[0] === type) || [, type])[1])}</b>` : 'কাগজের ধরন স্বয়ংক্রিয়ভাবে শনাক্ত করা হয়। কাগজে ছাপা কিউআর কোড স্ক্যান করলেও এই পাতা খোলে।'}</div></form>${out}</section>`);
  },
  mount() { $('#tv-form').addEventListener('submit', e => { e.preventDefault(); App.ui.verCode = formData(e.target).code; App.ui.trackTerm = null; App.go('public', 'verify'); }); },
});
// The old separate tracker page now forwards to the unified page.
Object.assign(App.portals.public.pages.find(p => p.id === 'track'), { render(q) { App.ui.verCode = q.ref || App.ui.trackTerm || App.ui.verCode || ''; setTimeout(() => App.go('public', 'verify'), 0); return ''; }, mount() { } });
