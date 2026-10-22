/* ==========================================================================
   INSTITUTION SETTINGS
   Identity & branding · Theme (colours, fonts, sizes) · Website & homepage
   (hero, programmes, gallery) · Campuses, sessions, shifts, sections, rooms ·
   Academic policy · Feature-flag matrix · Roles & permissions (RBAC).
   ========================================================================== */

const THEME_PRESETS = {
  'বাংলাদেশ সবুজ (ডিফল্ট)': { primary: '#006a4e', accent: '#f42a41', surface: '#f6f8f7' },
  'গাঢ় টিল': { primary: '#0f766e', accent: '#e11d48', surface: '#f5f8f8' },
  'নেভি ব্লু': { primary: '#1e3a8a', accent: '#dc2626', surface: '#f6f7fb' },
  'মেরুন': { primary: '#7f1d1d', accent: '#ca8a04', surface: '#faf7f6' },
  'মাদ্রাসা সবুজ': { primary: '#14532d', accent: '#b45309', surface: '#f6f8f5' },
};
const FLAG_GROUPS = {
  'পাবলিক ওয়েবসাইট': { onlineAdmissions: 'অনলাইন ভর্তি ফরম', publicResults: 'পাবলিক ফলাফল পোর্টাল', gallery: 'ফটো গ্যালারি', careers: 'চাকরি ও নিয়োগ আবেদন', onlineServices: 'অনলাইন সেবা ডেস্ক', noticeTicker: 'চলমান নোটিশ টিকার' },   // maintenance: সিস্টেম → রক্ষণাবেক্ষণ ও রিসেট (rootops.js)
  'পরিশোধ': { gatewayBkash: 'বিকাশ', gatewayNagad: 'নগদ', gatewayRocket: 'রকেট', gatewayCard: 'Visa / Mastercard', installments: 'কিস্তি পরিকল্পনা', autoReminders: 'পরিশোধের শেষ তারিখের স্বয়ংক্রিয় এসএমএস', lateFines: 'স্বয়ংক্রিয় বিলম্ব জরিমানা' },
  'বার্তা প্রেরণ': { smsGateway: 'এসএমএস গেটওয়ে', emailGateway: 'ই-মেইল (SMTP) গেটওয়ে', pushNotifications: 'অ্যাপ পুশ নোটিফিকেশন' },
  'একাডেমিক': { homework: 'বাড়ির কাজ ও অ্যাসাইনমেন্ট', studyMaterials: 'পাঠ-উপকরণ', aiPlanner: 'পাঠ পরিকল্পনা টেমপ্লেট', proxy: 'জরুরি বদলি শিক্ষক নির্ধারণ', promotion: 'শ্রেণি উত্তরণ ব্যবস্থা' },
  'ক্যাম্পাস সেবা': { transport: 'পরিবহন ও যানবহর', hostel: 'ছাত্রাবাস ও আবাসন', library: 'গ্রন্থাগার ব্যবস্থাপনা', biometric: 'বায়োমেট্রিক / আরএফআইডি সমন্বয়' },
  'সিস্টেম': { autoBackup: 'স্বয়ংক্রিয় দৈনিক ক্লাউড ব্যাকআপ', navAccordion: 'সাইডবারে একবারে একটি গ্রুপ খোলা' },
};

/** A gallery item's uploaded image (items without an image are not shown on the website). */
function galleryImg(g) { return g.dataUrl || ''; }

const Settings = {
  tab: 'identity',
  canEdit() { return App.perm('settings', 'edit'); },
  save(msg, detail) { DB.audit('SETTINGS_UPDATE', 'settings', detail || msg); DB.save(); toast(msg, 'success'); App.render(); },

  /* ---------- identity & branding ---------- */
  identity() {
    const s = DB.s.school, f = (k, l, extra = '') => `<div><label class="label">${l}</label><input class="input" name="${k}" value="${esc(s[k] ?? '')}" ${extra}></div>`;
    const img = (k, l, hint) => `<div class="card p-4"><div class="label">${l}</div><div class="h-24 flex items-center justify-center bg-slate-50 rounded-lg border border-dashed border-slate-300 mb-2">${s[k] ? `<img src="${s[k]}" class="max-h-20 object-contain">` : `<span class="text-xs text-slate-400">${hint}</span>`}</div>
      <div class="flex gap-2"><label class="btn btn-ghost btn-sm cursor-pointer flex-1">${icon('upload')} আপলোড<input type="file" accept="image/*" class="hidden" onchange="Settings.upload('${k}', this.files[0])"></label>${s[k] ? `<button type="button" class="btn btn-ghost btn-sm" onclick="Settings.clearImg('${k}')">${icon('trash-2')}</button>` : ''}</div></div>`;
    const pad = (k, l) => `<div class="card p-4"><div class="label">${l}</div><canvas data-sig="${k}" width="480" height="150" class="sig-pad w-full"></canvas><div class="flex gap-2 mt-2"><button type="button" class="btn btn-ghost btn-sm" onclick="Settings.sigClear('${k}')">মুছে ফেলুন</button><button type="button" class="btn btn-primary btn-sm" onclick="Settings.sigSave('${k}')">স্বাক্ষর সংরক্ষণ করুন</button><label class="btn btn-ghost btn-sm cursor-pointer">${icon('upload')}<input type="file" accept="image/*" class="hidden" onchange="Settings.upload('${k}', this.files[0])"></label></div></div>`;
    return `<form id="set-id" class="grid xl:grid-cols-3 gap-5"><div class="card p-5 xl:col-span-2 grid sm:grid-cols-2 gap-4">
        <fieldset class="sm:col-span-2"><legend class="label">প্রতিষ্ঠানের ধরন</legend><div class="flex flex-wrap gap-2">${[...new Set([...INSTITUTION_TYPES, ...instTypes()])].map(t => { const on = instTypes().includes(t); return `<label class="pill cursor-pointer ${on ? 'pill-on' : ''}"><input type="checkbox" name="itype" value="${esc(t)}" class="sr-only" ${on ? 'checked' : ''} onchange="this.parentElement.classList.toggle('pill-on',this.checked)">${on ? icon('check', 'w-4 h-4') : ''}${esc(bn(t))}</label>`; }).join('')}</div></fieldset>${f('eiin', 'ইআইআইএন (ঐচ্ছিক)', 'inputmode="numeric" pattern="[0-9০-৯]{5,8}"')}${f('instCode', 'প্রতিষ্ঠান কোড (ঐচ্ছিক)')}

        ${f('name', 'প্রতিষ্ঠানের নাম (ইংরেজি)', 'required')}${f('nameBn', 'প্রতিষ্ঠানের নাম (বাংলা)')}${f('shortName', 'সংক্ষিপ্ত নাম / মনোগ্রাম', 'maxlength="6" required')}${f('founded', 'প্রতিষ্ঠাকাল', 'type="number" min="1800" max="2100"')}
        ${f('motto', 'মূলমন্ত্র (ইংরেজি)')}${f('mottoBn', 'মূলমন্ত্র (বাংলা)')}${f('address', 'ঠিকানা')}${f('phone', 'ফোন')}${f('email', 'ই-মেইল', 'type="email"')}${f('website', 'ওয়েবসাইট')}
        ${f('principalName', 'অধ্যক্ষ / প্রধানের নাম')}${f('directorName', 'পরিচালক / সভাপতির নাম')}${f('directorTitle', 'পরিচালকের পদবি')}${f('stampText', 'সিলের লেখা')}
        <div class="sm:col-span-2"><label class="label">প্রধানের স্বাগত বাণী</label><textarea class="textarea" name="welcome" rows="3">${esc(s.welcome)}</textarea></div>
        <div class="sm:col-span-2"><label class="label">পরিচালক / সভাপতির বাণী</label><textarea class="textarea" name="directorMessage" rows="3">${esc(s.directorMessage || '')}</textarea></div>
        <div class="sm:col-span-2"><button class="btn btn-primary">${icon('save')} পরিচিতি সংরক্ষণ করুন</button></div></div>
      <div class="space-y-4">${img('logo', 'লোগো', 'কোনো লোগো নেই — মনোগ্রাম ব্যবহৃত হচ্ছে')}${img('principalPhoto', 'প্রধানের ছবি', 'ছবি নেই')}${img('directorPhoto', 'পরিচালক / সভাপতির ছবি', 'ছবি নেই')}${img('stampImage', 'দাপ্তরিক সিল / মোহর', 'লেখাভিত্তিক সিল ব্যবহৃত হচ্ছে')}${pad('signature', 'অধ্যক্ষের ডিজিটাল স্বাক্ষর')}${pad('directorSignature', 'পরিচালকের ডিজিটাল স্বাক্ষর')}</div></form>`;
  },
  async upload(key, file) {
    if (!file) return;
    try { const url = await readUpload(file, key === 'logo' || key === 'stampImage' ? 500 : 700); DB.s.school[key] = file.type === 'image/png' || key !== 'logo' ? url : url; this.save('ছবি সংরক্ষিত হয়েছে।', `${key} uploaded`); }
    catch (e) { toast(e.message, 'error'); }
  },
  clearImg(key) { DB.s.school[key] = null; this.save('ছবি অপসারণ করা হয়েছে।', `${key} removed`); },
  sigPads() {
    $$('canvas[data-sig]').forEach(cv => {
      const ctx = cv.getContext('2d'); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.strokeStyle = '#1e3a8a'; let drawing = false;
      const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
      cv.addEventListener('pointerdown', e => { drawing = true; cv.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...pos(e)); });
      cv.addEventListener('pointermove', e => { if (drawing) { ctx.lineTo(...pos(e)); ctx.stroke(); } });
      cv.addEventListener('pointerup', () => drawing = false);
      const src = DB.s.school[cv.dataset.sig]; if (src) { const im = new Image(); im.onload = () => ctx.drawImage(im, 0, 0, cv.width, cv.height); im.src = src; }
    });
  },
  sigClear(k) { const cv = $(`canvas[data-sig="${k}"]`); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); },
  sigSave(k) { DB.s.school[k] = $(`canvas[data-sig="${k}"]`).toDataURL('image/png'); this.save('স্বাক্ষর সংরক্ষিত হয়েছে — সকল মুদ্রিত কাগজে ব্যবহৃত হবে।', `${k} updated`); },

  /* ---------- theme ---------- */
  theme() {
    const t = DB.s.theme, fo = sel => FONT_OPTIONS.map(f => `<option ${f === sel ? 'selected' : ''}>${f}</option>`).join('');
    return `<div class="grid xl:grid-cols-3 gap-5"><form id="set-theme" class="card p-5 xl:col-span-2 grid sm:grid-cols-2 gap-4">
        <div class="sm:col-span-2"><div class="label">ডিফল্ট থিম</div><div class="flex flex-wrap gap-2">${Object.entries(THEME_PRESETS).map(([n, p]) => `<button type="button" class="btn btn-ghost btn-sm" onclick="Settings.preset('${n}')"><span class="w-3 h-3 rounded-full" style="background:${p.primary}"></span><span class="w-3 h-3 rounded-full" style="background:${p.accent}"></span>${n}</button>`).join('')}</div></div>
        <div><label class="label">প্রধান রং</label><div class="flex gap-2"><input type="color" name="primary" value="${t.primary}" class="h-10 w-14 rounded border"><input class="input font-mono" value="${t.primary}" oninput="this.previousElementSibling.value=this.value;this.form.dispatchEvent(new Event('input'))"></div></div>
        <div><label class="label">সহায়ক রং</label><div class="flex gap-2"><input type="color" name="accent" value="${t.accent}" class="h-10 w-14 rounded border"><input class="input font-mono" value="${t.accent}" oninput="this.previousElementSibling.value=this.value;this.form.dispatchEvent(new Event('input'))"></div></div>
        <div><label class="label">পৃষ্ঠার পটভূমি</label><input type="color" name="surface" value="${t.surface || '#f6f8f7'}" class="h-10 w-14 rounded border"></div>
        <div><label class="label">কোণের বক্রতা (px)</label><input type="range" min="0" max="18" name="radius" value="${t.radius}" class="w-full"></div>
        <div><label class="label">মূল লেখার ফন্ট</label><select class="select" name="font">${fo(t.font)}</select></div><div><label class="label">শিরোনামের ফন্ট</label><select class="select" name="headingFont">${fo(t.headingFont)}</select></div>
        <div><label class="label">বাংলা ফন্ট</label><select class="select" name="bnFont">${['Noto Serif Bengali', 'Hind Siliguri', 'Noto Sans Bengali', 'Tiro Bangla'].map(f => `<option ${f === t.bnFont ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
        <div><label class="label">ফন্টের মূল আকার: <b id="fs-v">${t.baseSize}px</b></label><input type="range" min="13" max="18" name="baseSize" value="${t.baseSize}" class="w-full"></div>
        <div class="sm:col-span-2 flex gap-2"><button class="btn btn-primary">${icon('save')} থিম সংরক্ষণ করুন</button><button type="button" class="btn btn-ghost" onclick="Settings.preset('বাংলাদেশ সবুজ (ডিফল্ট)')">ডিফল্টে ফিরুন</button></div></form>
      <div class="card p-5 space-y-3"><div class="label">সরাসরি প্রিভিউ</div><div class="gov-strip rounded px-3 py-1 text-xs">ইউটিলিটি স্ট্রিপ</div><div class="gov-nav rounded flex"><span class="gov-link active">প্রথম পাতা</span><span class="gov-link">ভর্তি</span></div>
        <h3 class="section-title text-xl font-bold">অংশের শিরোনাম</h3><p class="text-sm text-slate-600">নির্বাচিত ফন্টে মূল লেখা। বাংলা লেখা এভাবে দেখাবে।</p><div class="flex gap-2"><button class="btn btn-primary">প্রধান</button><button class="btn btn-accent">সহায়ক</button><button class="btn btn-ghost">স্বচ্ছ</button></div>${kpi('নমুনা সূচক', '৳১,২৫,০০০', 'উপ-লেখা', 'wallet', 'green')}</div></div>`;
  },
  preset(n) { Object.assign(DB.s.theme, THEME_PRESETS[n]); Theme.apply(); this.save(`"${n}" থিম প্রয়োগ করা হয়েছে।`, `theme preset ${n}`); },

  /* ---------- website & homepage ---------- */
  website() {
    const h = DB.s.site.hero, s = DB.s.school;
    return `<div class="grid xl:grid-cols-2 gap-5"><form id="set-hero" class="card p-5 grid sm:grid-cols-2 gap-3"><div class="sm:col-span-2 font-semibold">হোমপেজের হিরো অংশ</div>
        <div class="sm:col-span-2"><label class="label">শিরোনাম</label><input class="input" name="title" value="${esc(h.title)}"></div>
        <div class="sm:col-span-2"><label class="label">উপশিরোনাম</label><textarea class="textarea" rows="2" name="subtitle">${esc(h.subtitle)}</textarea></div>
        <div><label class="label">প্রধান বোতামের লেখা</label><input class="input" name="ctaText" value="${esc(h.ctaText)}"></div><div><label class="label">প্রধান বোতামের লিংক</label><input class="input" name="ctaLink" value="${esc(h.ctaLink)}"></div>
        <div><label class="label">দ্বিতীয় বোতামের লেখা</label><input class="input" name="cta2Text" value="${esc(h.cta2Text)}"></div><div><label class="label">দ্বিতীয় বোতামের লিংক</label><input class="input" name="cta2Link" value="${esc(h.cta2Link)}"></div>
        <div><label class="label">লেখার বিন্যাস</label><select class="select" name="align"><option value="left" ${h.align === 'left' ? 'selected' : ''}>বাম</option><option value="center" ${h.align === 'center' ? 'selected' : ''}>মাঝখানে</option></select></div>
        <label class="flex items-center gap-2 text-sm pt-6"><input type="checkbox" name="showStats" ${h.showStats ? 'checked' : ''}> পরিসংখ্যান টাইল দেখান</label>
        <label class="sm:col-span-2 flex items-center gap-2 text-sm card p-3"><input type="checkbox" name="ticker" ${DB.s.site.ticker !== false && DB.s.featureFlags.noticeTicker !== false ? 'checked' : ''}> <span><b>চলমান নোটিশ মার্কি দেখান</b> মেনুর নিচে</span></label>
        <div class="sm:col-span-2"><div class="label">পটভূমির ছবি</div><div class="flex items-center gap-3">${h.image ? `<img src="${h.image}" class="h-16 w-28 object-cover rounded">` : '<span class="text-xs text-slate-400">নেই — নকশাসহ একরঙা ব্র্যান্ড রং</span>'}<label class="btn btn-ghost btn-sm cursor-pointer">${icon('upload')} আপলোড<input type="file" accept="image/*" class="hidden" onchange="Settings.heroImg(this.files[0])"></label>${h.image ? `<button type="button" class="btn btn-ghost btn-sm" onclick="DB.s.site.hero.image=null;Settings.save('হিরো ছবি অপসারণ করা হয়েছে।')">${icon('trash-2')}</button>` : ''}</div></div>
        <div class="sm:col-span-2 grid grid-cols-4 gap-2">${[['passRate', 'পাসের হার %'], ['scholars', 'শিক্ষার্থী'], ['faculty', 'শিক্ষকমণ্ডলী'], ['aPlus', 'জিপিএ-৫ প্রাপ্ত']].map(([k, l]) => `<div><label class="label">${l}</label><input class="input" name="stat_${k}" type="number" step="0.1" value="${s.stats[k]}"></div>`).join('')}</div>
        <div class="sm:col-span-2"><button class="btn btn-primary">${icon('save')} হোমপেজ সংরক্ষণ করুন</button> <a class="btn btn-ghost" href="/" target="_blank">${icon('external-link')} সাইট দেখুন</a></div></form>
      <div class="space-y-5"><div class="card"><div class="px-5 py-3 border-b border-slate-100 font-semibold flex items-center gap-2">ফটো গ্যালারি <span class="text-xs text-slate-400 font-normal">${bnNum(DB.s.site.gallery.length)}টি ছবি</span><label class="btn btn-primary btn-sm ml-auto cursor-pointer">${icon('image-plus')} ছবি আপলোড করুন<input type="file" accept="image/*" multiple class="hidden" onchange="Settings.galleryUpload(this.files)"></label></div>
          <div class="p-4 grid grid-cols-3 sm:grid-cols-4 gap-2">${DB.s.site.gallery.map(g => `<div class="relative group"><img src="${galleryImg(g)}" class="w-full aspect-[4/3] object-cover rounded-lg"><div class="text-[10px] text-slate-500 truncate mt-0.5">${esc(g.album)} · ${esc(g.title)}</div><button class="absolute top-1 right-1 hidden group-hover:flex btn btn-danger btn-sm !p-1" onclick="Settings.galleryDel('${g.id}')">${icon('x', 'w-3 h-3')}</button></div>`).join('')}</div></div></div></div>`;
  },
  async heroImg(file) { if (!file) return; try { DB.s.site.hero.image = await readUpload(file, 1600); this.save('হিরো পটভূমি আপডেট করা হয়েছে।'); } catch (e) { toast(e.message, 'error'); } },
  async galleryUpload(files) {
    const album = prompt('এই ছবিগুলোর অ্যালবামের নাম:', 'ক্যাম্পাস') || 'ক্যাম্পাস';
    for (const file of files) { try { DB.s.site.gallery.unshift({ id: DB.id('GAL'), title: file.name.replace(/\.[^.]+$/, ''), album, date: U.today(), dataUrl: await readUpload(file, 1200) }); } catch (e) { toast(e.message, 'error'); } }
    if (!DB.save()) { toast('সংরক্ষণস্থান পূর্ণ — অনুগ্রহ করে কম/ছোট আকারের ছবি দিন।', 'error'); return; }
    this.save(`"${album}" অ্যালবামে ${bnNum(files.length)}টি ছবি যোগ করা হয়েছে।`);
  },
  galleryDel(id) { if (!confirm('এই ছবিটি গ্যালারি থেকে মুছে ফেলবেন?')) return; DB.s.site.gallery = DB.s.site.gallery.filter(g => g.id !== id); this.save('ছবি মুছে ফেলা হয়েছে।', `gallery ${id} deleted`); },
  editProgram(id) {
    const p = DB.s.site.programs.find(x => x.id === id) || { name: '', ages: '', desc: '', icon: 'book-open' };
    Modal.open({ title: id ? 'কার্যক্রম সম্পাদনা' : 'কার্যক্রম যোগ করুন', size: 'md', body: `<form id="pg" class="space-y-3"><div><label class="label">নাম</label><input class="input" name="name" value="${esc(p.name)}" required></div><div class="grid grid-cols-2 gap-3"><div><label class="label">বয়স / স্তর</label><input class="input" name="ages" value="${esc(p.ages)}"></div><div><label class="label">আইকন (Lucide নাম)</label><input class="input" name="icon" value="${esc(p.icon)}"></div></div><div><label class="label">বিবরণ</label><textarea class="textarea" name="desc" rows="3">${esc(p.desc)}</textarea></div><button class="btn btn-primary w-full">সংরক্ষণ করুন</button></form>` });
    $('#pg').addEventListener('submit', e => { e.preventDefault(); const f = formData(e.target); if (id) Object.assign(p, f); else DB.s.site.programs.push({ id: DB.id('PG'), ...f }); Modal.close(); this.save('কার্যক্রম সংরক্ষিত হয়েছে।'); });
  },
  delProgram(id) { if (!confirm('এই কার্যক্রমটি অপসারণ করবেন?')) return; DB.s.site.programs = DB.s.site.programs.filter(p => p.id !== id); this.save('কার্যক্রম অপসারণ করা হয়েছে।'); },

  /* ---------- campuses, sessions, shifts, classes & rooms ---------- */
  editCampus(id) {
    const c = DB.s.campuses.find(x => x.id === id) || { id: '', name: '', short: '', address: '', phone: '', levels: '' };
    Modal.open({ title: id ? `${esc(c.name)} সম্পাদনা` : 'ক্যাম্পাস / শাখা ক্যাম্পাস যোগ করুন', size: 'md', body: `<form id="cp" data-keep-campus class="grid grid-cols-2 gap-3"><div><label class="label">কোড</label><input class="input font-mono uppercase" name="id" value="${esc(c.id)}" ${id ? 'readonly' : 'required pattern="[A-Za-z]{2,8}"'}></div><div><label class="label">সংক্ষিপ্ত নাম</label><input class="input" name="short" value="${esc(c.short)}" required></div><div class="col-span-2"><label class="label">পূর্ণ নাম</label><input class="input" name="name" value="${esc(c.name)}" required></div><div class="col-span-2"><label class="label">প্রদত্ত স্তর</label><input class="input" name="levels" value="${esc(c.levels)}"></div><div class="col-span-2"><label class="label">ঠিকানা</label><input class="input" name="address" value="${esc(c.address)}"></div><div><label class="label">ফোন</label><input class="input" name="phone" value="${esc(c.phone)}"></div><div class="col-span-2"><button class="btn btn-primary w-full">ক্যাম্পাস সংরক্ষণ করুন</button></div></form>` });
    $('#cp').addEventListener('submit', e => {
      e.preventDefault(); const f = formData(e.target); f.id = f.id.toUpperCase();
      if (id) Object.assign(c, f); else { if (DB.s.campuses.some(x => x.id === f.id)) return toast('ক্যাম্পাস কোডটি ইতোমধ্যে বিদ্যমান।', 'error'); DB.s.campuses.push(f); DB.s.rooms[f.id] = []; }
      Modal.close(); this.save('ক্যাম্পাস সংরক্ষিত হয়েছে।', `campus ${f.id}`);
    });
  },
  addSession() {
    const last = Math.max(...DB.s.sessions.map(s => +s.id)), id = String(last + 1);
    if (!confirm(`শিক্ষাবর্ষ ${bnNum(id)} (পরিকল্পনাধীন) যোগ করবেন?`)) return;
    DB.s.sessions.push({ id, name: `শিক্ষাবর্ষ ${id}`, status: 'planning' }); this.save(`শিক্ষাবর্ষ ${bnNum(id)} যোগ করা হয়েছে — "ক্লোন ও ইমপোর্ট" থেকে এতে সেটিংস কপি করুন।`);
  },
  /* ---------- academic policy ---------- */
  policy() {
    const s = DB.s.school, f = (k, l, extra) => `<div><label class="label">${l}</label><input class="input" name="${k}" value="${esc(s[k])}" ${extra}></div>`;
    return `<form id="set-policy" class="card p-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
      ${f('passGpa', 'পাসের ন্যূনতম জিপিএ', 'type="number" step="0.1" min="0" max="5"')}${f('minAttendance', 'ন্যূনতম উপস্থিতি %', 'type="number" min="0" max="100"')}${f('lateThreshold', 'নিয়মিত বিলম্বের সীমা (বার)', 'type="number" min="1"')}
      <div><label class="label">বিলম্ব গণ্য হবে শিফট শুরুর কত মিনিট পরে</label><input class="input" name="lateMinutes" type="number" min="0" max="240" value="${typeof Attendance !== 'undefined' ? Attendance.lateMinutes() : esc(s.lateMinutes ?? 10)}"></div>${f('sectionCapacity', 'শাখার ডিফল্ট ধারণক্ষমতা', 'type="number" min="5"')}
      <div class="sm:col-span-2 lg:col-span-3"><button class="btn btn-primary">${icon('save')} নীতি সংরক্ষণ করুন</button></div></form>`;
  },

  flag(k, on) { DB.s.featureFlags[k] = on; DB.audit('FEATURE_FLAG', 'system', `${k}=${on}`); DB.save(); toast(`${Settings.flagLabel(k)} সমগ্র সিস্টেমে ${on ? 'চালু' : 'বন্ধ'} করা হয়েছে।`, on ? 'success' : 'warn'); App.render(); },

  flagLabel(k) { for (const g of Object.values(FLAG_GROUPS)) if (g[k]) return g[k]; return k; },
  PERM_BN: { view: 'দেখা', edit: 'সম্পাদনা', delete: 'মুছে ফেলা', print: 'মুদ্রণ', export: 'রপ্তানি' },

  /* ---------- RBAC ---------- */
  /** Excel-ধাঁচের গ্রিড: সারি = মডিউল, কলাম = প্রতিটি ভূমিকা × কাজ। রুট সব সময় সব চালু (তালাবদ্ধ)। */
  RBX_CSS: `.rbx{border-collapse:separate;border-spacing:0}.rbx th,.rbx td{padding:.2rem .3rem}
.rbx .rbx-s{position:sticky;left:0;z-index:2;background:var(--xg-bg);text-align:left;min-width:11rem;max-width:15rem;white-space:normal}
.rbx thead .rbx-s{z-index:4;background:var(--xg-h)}.rbx tbody tr:nth-child(even)>td.rbx-s{background:var(--xg-z)}
.rbx thead tr:first-child th{height:3.3rem}.rbx thead tr:nth-child(2) th{top:3.3rem}
.rbx-t{display:inline-flex;align-items:center;justify-content:center;width:1.9rem;height:1.9rem;border-radius:.35rem;border:1px solid var(--xg-bd2);background:var(--xg-bg);color:transparent;cursor:pointer}
.rbx-t.on{background:#059669;border-color:#059669;color:#fff}.rbx-t:disabled{cursor:not-allowed;opacity:.55}
.rbx-t:not(:disabled):hover{border-color:var(--xg-selb)}.rbx-t svg{width:1rem;height:1rem}
.rbx-b{border:1px solid var(--xg-bd2);border-radius:.3rem;padding:.05rem .35rem;background:var(--xg-chip);color:var(--xg-tx);cursor:pointer;white-space:nowrap}
.rbx-b:hover{border-color:var(--xg-selb)}.rbx-g>td{background:var(--xg-h) !important;font-weight:600}.rbx-na{color:var(--xg-mut)}`,
  rbxCell(on, dis, click, title) { return `<button type="button" class="rbx-t ${on ? 'on' : ''}" ${dis ? 'disabled' : `onclick="${click}"`} title="${esc(title)}" aria-pressed="${on}">${icon('check')}</button>`; },
  rbac() {
    const g = DB.s.rbac || (DB.s.rbac = DB.defaultRbac()), can = App.has('ADMIN');
    const roles = Object.keys(ROLES), mods = Object.entries(PERM_MODULES), AB = { view: 'দে', edit: 'স', delete: 'মু', print: 'প্রি', export: 'র' };
    roles.forEach(r => { g[r] = g[r] || {}; mods.forEach(([m]) => { g[r][m] = g[r][m] || {}; }); });
    const on = (r, m, a) => r === 'ADMIN' || !!g[r][m][a];
    const head = `<tr><th class="rbx-s" rowspan="2">মডিউল</th>${roles.map(r => `<th colspan="${PERM_ACTIONS.length}" class="xg-gs">${roleIcon(r)} ${esc(ROLES[r].label)}${can && r !== 'ADMIN' ? ` <button class="rbx-b" onclick="Settings.bulkPerm('${r}',null,null)" title="এই ভূমিকার সব চালু/বন্ধ">সব</button>` : r === 'ADMIN' ? ` ${icon('lock', 'w-4 h-4 inline')}` : ''}</th>`).join('')}</tr>
      <tr>${roles.map(r => PERM_ACTIONS.map((a, i) => `<th class="${i ? '' : 'xg-gs'}" title="${esc(Settings.PERM_BN[a])}">${can && r !== 'ADMIN' ? `<button class="rbx-b" onclick="Settings.bulkPerm('${r}',null,'${a}')">${AB[a] || a}</button>` : (AB[a] || a)}</th>`).join('')).join('')}</tr>`;
    const body = mods.map(([m, l]) => `<tr><td class="rbx-s"><div class="flex items-center gap-2"><span class="font-semibold flex-1 min-w-0">${esc(l)}</span>${can ? `<button class="rbx-b" onclick="Settings.bulkPerm(null,'${m}',null)" title="সারির সব চালু/বন্ধ">সব</button>` : ''}</div></td>${roles.map(r => PERM_ACTIONS.map((a, i) => `<td class="text-center ${i ? '' : 'xg-gs'}">${Settings.rbxCell(on(r, m, a), !can || r === 'ADMIN', `Settings.setPerm('${r}','${m}','${a}',${!on(r, m, a)})`, `${ROLES[r].label} · ${l} · ${Settings.PERM_BN[a]}`)}</td>`).join('')).join('')}</tr>`).join('');
    return `<style>${typeof XG_CSS !== 'undefined' ? XG_CSS : ''}${Settings.RBX_CSS}</style>
      <div class="flex flex-wrap items-center gap-3 mb-3"><span class="text-slate-600">${PERM_ACTIONS.map(a => `${AB[a]} = ${Settings.PERM_BN[a]}`).join(' · ')}</span>${can ? `<button class="btn btn-ghost btn-sm ml-auto" onclick="if(confirm('সকল ভূমিকার ডিফল্ট অনুমতি পুনর্বহাল করবেন?')){DB.s.rbac=DB.defaultRbac();Settings.save('অনুমতি ডিফল্ট অবস্থায় ফেরানো হয়েছে।')}">${icon('rotate-ccw')} ডিফল্ট</button>` : ''}</div>
      <div class="xg-wrap" style="max-height:75vh"><table class="xg rbx"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  },
  setPerm(role, m, a, on) {
    if (role === 'ADMIN') return;
    const g = DB.s.rbac; g[role] = g[role] || {}; g[role][m] = g[role][m] || {}; g[role][m][a] = on;
    if (a === 'view' && !on) PERM_ACTIONS.forEach(x => g[role][m][x] = false);
    if (a !== 'view' && on) g[role][m].view = true;
    DB.audit('RBAC_CHANGE', 'rbac', `${role}.${m}.${a}=${on}`); DB.save(); App.refresh();
  },
  /** সারি (মডিউল), কলাম (ভূমিকা বা ভূমিকা×কাজ) একসাথে: সব চালু থাকলে বন্ধ, নইলে চালু */
  bulkPerm(role, mod, act) {
    const g = DB.s.rbac, roles = role ? [role] : Object.keys(ROLES).filter(r => r !== 'ADMIN'), mods = mod ? [mod] : Object.keys(PERM_MODULES), acts = act ? [act] : PERM_ACTIONS;
    const cells = []; roles.forEach(r => mods.forEach(m => acts.forEach(a => cells.push([r, m, a]))));
    const all = cells.every(([r, m, a]) => g[r]?.[m]?.[a]);
    cells.forEach(([r, m, a]) => { g[r] = g[r] || {}; g[r][m] = g[r][m] || {}; g[r][m][a] = !all; if (!all) g[r][m].view = true; else if (a === 'view') PERM_ACTIONS.forEach(x => g[r][m][x] = false); });
    DB.audit('RBAC_CHANGE', 'rbac', `bulk ${role || '*'}.${mod || '*'}.${act || '*'}=${!all}`); DB.save(); App.refresh();
  },
};

/* Tab groups: a group is one top tab that opens with an inner sidebar (pills on phones), like
   বৈশিষ্ট্য ও সেটিংস. Old tab ids keep working (App.ui.setTab = 'homepage' opens ডিজাইন → হোমপেজ নির্মাতা). */
Object.assign(Settings, {
  GROUPS: {
    design: ['ডিজাইন', 'palette', ['theme', 'website', 'homepage', 'menus', 'pages']],
    academic: ['একাডেমিক', 'graduation-cap', ['structure', 'subjects', 'policy', 'semester']],
  },
  groupOf(id) { return Object.keys(this.GROUPS).find(g => this.GROUPS[g][2].includes(id)) || null; },
  members(g) { return this.GROUPS[g][2].map(id => this.TABS.find(t => t[0] === id)).filter(Boolean); },
  /** Top-level tabs: single tabs, and each group once (at the place of its first member). */
  topTabs() {
    const out = [];
    this.TABS.forEach(t => { const g = this.groupOf(t[0]); if (!g) out.push(t); else if (!out.some(x => x[0] === g)) out.push([g, this.GROUPS[g][0], this.GROUPS[g][1]]); });
    return out;
  },
  /** id (tab or group) → { top, group, inner }; remembers the last inner tab per group. */
  resolve(id) {
    const sub = App.ui.setSub || (App.ui.setSub = {});
    let g = this.GROUPS[id] ? id : this.groupOf(id), inner = id;
    if (g && this.GROUPS[id]) inner = sub[g];
    if (g) { const m = this.members(g); if (!m.some(t => t[0] === inner)) inner = m[0]?.[0]; if (!inner) g = null; else sub[g] = inner; }
    if (!g && !this.TABS.some(t => t[0] === inner)) inner = 'identity';
    return { top: g || inner, group: g, inner };
  },
  /** A group's inner layout: sidebar of its tabs (large screens) or pills (phones) + the chosen tab. */
  groupView(g, inner) {
    const items = this.members(g), go = id => `App.ui.setTab='${id}';App.refresh()`;
    return `<div class="lg:hidden mb-4">${pills(items, inner, go)}</div>
      <div class="grid lg:grid-cols-[15rem_minmax(0,1fr)] gap-5 items-start"><nav class="hidden lg:block card p-2 sticky top-24" aria-label="${esc(this.GROUPS[g][0])}">${items.map(([id, l, ic]) => `<button class="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-2.5 ${id === inner ? 'bg-brand-50 text-brand-700 font-semibold' : 'hover:bg-slate-50'}" ${id === inner ? 'aria-current="page"' : ''} onclick="${go(id)}">${icon(ic, 'w-4 h-4 shrink-0')}<span class="flex-1">${esc(l)}</span></button>`).join('')}</nav>
      <div class="min-w-0 fade-in">${this[inner]()}</div></div>`;
  },
});

const settingsPage = {
  id: 'settings', label: 'প্রতিষ্ঠানের সেটিংস', icon: 'settings', module: 'settings',
  render() {
    const v = Settings.resolve(App.ui.setTab || 'identity');
    App.ui.setTab = v.inner;   // mount() and the tab forms read the inner tab id
    return pageHeader('প্রতিষ্ঠানের সেটিংস', esc(bn(DB.s.school.type)))
      + pills(Settings.topTabs(), v.top, id => `App.ui.setTab='${id}';App.refresh()`)
      + (v.group ? Settings.groupView(v.group, v.inner) : `<div class="fade-in">${Settings[v.inner]()}</div>`);
  },
  mount() {
    const t = App.ui.setTab || 'identity';
    if (t === 'identity') {
      Settings.sigPads();
      $('#set-id').addEventListener('submit', e => { e.preventDefault(); const f = formData(e.target); f.founded = +f.founded;
        const types = $$('[name=itype]:checked', e.target).map(x => x.value); delete f.itype;
        if (!types.length) return toast('অন্তত একটি প্রতিষ্ঠানের ধরন বেছে নিন।', 'error');
        f.types = types; f.type = types[0]; Object.assign(DB.s.school, f);
        Settings.save('পরিচিতি সংরক্ষিত হয়েছে — ওয়েবসাইট, পরিচয়পত্র ও সকল মুদ্রিত কাগজে প্রয়োগ করা হয়েছে।', `identity (${f.name}, EIIN ${f.eiin})`); });
    }
    if (t === 'theme') {
      const f = $('#set-theme');
      const live = () => { const d = formData(f); d.baseSize = +d.baseSize; d.radius = +d.radius; Theme.apply({ ...DB.s.theme, ...d }); $('#fs-v').textContent = d.baseSize + 'px'; };
      f.addEventListener('input', live);
      f.addEventListener('submit', e => { e.preventDefault(); const d = formData(f); d.baseSize = +d.baseSize; d.radius = +d.radius; Object.assign(DB.s.theme, d); Theme.apply(); Settings.save('থিম সংরক্ষিত হয়েছে।', `theme ${d.primary}/${d.accent} ${d.font} ${d.baseSize}px`); });
    }
    if (t === 'website') $('#set-hero').addEventListener('submit', e => {
      e.preventDefault(); const f = formData(e.target), h = DB.s.site.hero;
      ['title', 'subtitle', 'ctaText', 'ctaLink', 'cta2Text', 'cta2Link', 'align'].forEach(k => h[k] = f[k]); h.showStats = !!e.target.showStats.checked; DB.s.site.ticker = DB.s.featureFlags.noticeTicker = !!e.target.ticker.checked;
      ['passRate', 'scholars', 'faculty', 'aPlus'].forEach(k => DB.s.school.stats[k] = +f['stat_' + k]);
      Settings.save('হোমপেজ আপডেট করা হয়েছে।', 'hero section');
    });
    if (t === 'structure') $('#set-rooms').addEventListener('submit', e => { e.preventDefault(); const f = formData(e.target); Object.assign(DB.s.school.roomRules, { maxPerRoom: +f.maxPerRoom, examSeatsPerBench: +f.examSeatsPerBench, keepLabsForPractical: !!e.target.keepLabsForPractical.checked }); Settings.save('কক্ষের নিয়ম সংরক্ষিত হয়েছে।'); });
    if (t === 'policy') $('#set-policy').addEventListener('submit', e => { e.preventDefault(); const f = formData(e.target); ['passGpa', 'minAttendance', 'lateThreshold', 'sectionCapacity', 'lateMinutes'].forEach(k => f[k] = +f[k]); f.lateMinutes = Math.max(0, Math.round(f.lateMinutes || 0)); Object.assign(DB.s.school, f); Settings.save('নীতি সংরক্ষিত হয়েছে।'); });
  },
};
App.addPage('admin', settingsPage, 'system');
App.addPage('principal', settingsPage);
/* Sidebar "ওয়েবসাইট": the same ডিজাইন tabs (theme, hero, homepage, menus, pages & footer) as a page of its own. */
const websiteDesignPage = {
  id: 'website', label: 'ওয়েবসাইট ও ডিজাইন', icon: 'globe', module: 'settings',
  render() {
    const v = Settings.resolve(Settings.groupOf(App.ui.setTab) === 'design' ? App.ui.setTab : 'design');
    App.ui.setTab = v.inner;
    return pageHeader('ওয়েবসাইট ও ডিজাইন', '', `<a class="btn btn-ghost" href="/" target="_blank" rel="noopener">${icon('external-link')} সাইট দেখুন</a>`)
      + Settings.groupView('design', v.inner);
  },
  mount() { settingsPage.mount(); },
};
App.addPage('admin', websiteDesignPage, 'settings');
App.addPage('principal', websiteDesignPage, 'settings');
