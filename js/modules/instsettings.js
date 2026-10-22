/* ==========================================================================
   প্রতিষ্ঠানের সেটিংস — separate pages, each at its own clean URL
   /<prefix>/settings/basic · design · academic · features · access · achievements
   · মৌলিক তথ্য: identity & branding, several addresses, campuses (default campus)
   · লুক এন্ড ফিল: theme, website & hero, video showcase / campus tour / documentary,
     homepage, menus, pages & footer
   · একাডেমিক: structure, subjects (one spreadsheet-like table), policy, semester
   · বৈশিষ্ট্য · ভূমিকা ও অনুমতি · প্রতিষ্ঠানের অর্জন ও স্বীকৃতি
   Old ids keep working: the page "settings" (+ App.ui.setTab), "website" and
   "inst-achievements" are hidden redirects to the right page and tab.
   ========================================================================== */

Settings.TABS.splice(1, 0, ['addresses', 'ঠিকানাসমূহ', 'map-pin'], ['campuses', 'ক্যাম্পাস', 'school']);
Settings.TABS.splice(Settings.TABS.findIndex(t => t[0] === 'homepage'), 0, ['media', 'ভিডিও, ট্যুর ও ডকুমেন্টারি', 'clapperboard']);
Settings.TABS.push(['instach', 'অর্জন ও স্বীকৃতি', 'trophy'], ['acadpolicy', 'শিক্ষাবর্ষ, সেমিস্টার ও নীতি', 'calendar-range']);
Settings.TABS.find(t => t[0] === 'structure')[1] = 'শ্রেণি কাঠামো';
/** Old academic tab ids → the tab that now holds them. */
const SET_ALIAS = { policy: 'acadpolicy', semester: 'acadpolicy', sessions: 'acadpolicy', addresses: 'places', campuses: 'places', rooms: 'roomplan' };
Settings.TABS.push(['places', 'ঠিকানা ও ক্যাম্পাস', 'map-pin'], ['roomplan', 'কক্ষ বিন্যাস', 'door-open']);

Object.assign(Settings, {
  PAGES: {
    basic: ['set-basic', 'মৌলিক তথ্য', 'badge-check', ['identity', 'places', 'addresses', 'campuses']],
    design: ['set-design', 'লুক এন্ড ফিল', 'palette', ['theme', 'website', 'media', 'homepage', 'menus', 'pages']],
    academic: ['set-academic', 'একাডেমিক', 'graduation-cap', ['structure', 'acadpolicy', 'policy', 'semester', 'sessions']],
    subjects: ['set-subjects', 'বিষয় বিন্যাস', 'book-marked', ['subjects']],
    rooms: ['set-rooms', 'কক্ষ বিন্যাস', 'door-open', ['roomplan', 'rooms']],
    features: ['set-features', 'বৈশিষ্ট্য', 'toggle-right', ['flags']],
    access: ['set-access', 'ভূমিকা ও অনুমতি', 'shield-check', ['rbac']],
    achievements: ['set-achievements', 'প্রতিষ্ঠানের অর্জন ও স্বীকৃতি', 'trophy', ['instach']],
  },
  /** Page key of a tab id, an old group id (design, academic) or a page key. */
  pageOf(t) { if (!t) return null; if (this.PAGES[t]) return t; return Object.keys(this.PAGES).find(k => this.PAGES[k][3].includes(t)) || null; },
  instach() { return typeof PubContent !== 'undefined' ? PubContent.adminPage() : ''; },
  /** One settings page. App.ui.setTab set by older code (onboarding, links) is a request for that tab. */
  pageView(key) {
    if (typeof Sem !== 'undefined' && Sem.addSettingsTab) Sem.addSettingsTab();
    const sub = App.ui.setSub || (App.ui.setSub = {}), req = App.ui.setTab;
    if (req && req !== App.ui._setShown) {
      const pk = this.pageOf(req);
      if (pk && req !== pk) sub[pk] = SET_ALIAS[req] || req;
      if (req === 'subjects') App.ui._scrollSubj = true;
      if (pk && pk !== key) { App.ui._setShown = req; setTimeout(() => App.go(App.route.portal, this.PAGES[pk][0])); return ''; }
    }
    const [, label, , all] = this.PAGES[key], tabs = all.filter(id => !SET_ALIAS[id]).map(id => this.TABS.find(t => t[0] === id)).filter(Boolean);
    const inner = tabs.some(t => t[0] === sub[key]) ? sub[key] : tabs[0]?.[0];
    sub[key] = inner; App.ui.setTab = App.ui._setShown = inner;
    if (inner === 'instach') return this.instach();
    const actions = key === 'design' ? `<a class="btn btn-ghost" href="/" target="_blank" rel="noopener">${icon('external-link')} সাইট দেখুন</a>` : '';
    if (tabs.length < 2) return pageHeader(label, '', actions) + `<div class="fade-in">${this[inner]()}</div>`;
    const go = id => `App.ui.setTab='${id}';App.refresh()`;
    return pageHeader(label, '', actions) + `<div class="lg:hidden mb-4">${pills(tabs, inner, go)}</div>
      <div class="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[15rem_minmax(0,1fr)] gap-5 items-start"><nav class="hidden lg:block card p-2 sticky top-24" aria-label="${esc(label)}">${tabs.map(([id, l, ic]) => `<button class="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-2.5 ${id === inner ? 'bg-brand-50 text-brand-700 font-semibold' : 'hover:bg-slate-50'}" ${id === inner ? 'aria-current="page"' : ''} onclick="${go(id)}">${icon(ic, 'w-4 h-4 shrink-0')}<span class="flex-1">${esc(l)}</span></button>`).join('')}</nav>
      <div class="min-w-0 fade-in">${this[inner]()}</div></div>`;
  },

  /* ---------- ঠিকানা ও ক্যাম্পাস (one list: campuses with address / phone / map, plus other addresses) ---------- */
  places() {
    const can = this.canEdit(), dis = can ? '' : 'disabled', C = DB.s.campuses, X = this.addrList(), def = this.defaultCampus();
    if (C.length < 2 && !X.length && !App.ui.plFull) {
      const c = C[0] || {};
      return `<form class="card p-5 grid sm:grid-cols-2 gap-4 max-w-3xl" onsubmit="Settings.placeSimple(this);return false">
        <div class="sm:col-span-2"><label class="label" for="pl-a">ঠিকানা</label><textarea id="pl-a" class="textarea" name="address" rows="2" maxlength="300" ${dis}>${esc(c.address || DB.s.school.address || '')}</textarea></div>
        <div><label class="label" for="pl-p">ফোন</label><input id="pl-p" class="input" name="phone" inputmode="tel" maxlength="40" value="${esc(c.phone || DB.s.school.phone || '')}" ${dis}></div>
        <div><label class="label" for="pl-m">মানচিত্রের লিংক</label><input id="pl-m" class="input" name="map" type="url" maxlength="500" value="${esc(c.map || '')}" ${dis}></div>
        ${can ? `<div class="sm:col-span-2 flex flex-wrap gap-2"><button class="btn btn-primary">${icon('save')} সংরক্ষণ</button><button type="button" class="btn btn-ghost ml-auto" onclick="App.ui.plFull=true;App.refresh()">${icon('school')} ক্যাম্পাস যোগ করুন</button><button type="button" class="btn btn-ghost" onclick="Settings.addrAdd()">${icon('map-pin')} ঠিকানা যোগ করুন</button></div>` : ''}</form>`;
    }
    const inp = (k, v, extra = '') => `<td><input class="xg-edit" name="${k}" value="${esc(v || '')}" ${extra} ${dis}></td>`;
    const rows = C.map(c => `<tr data-camp="${esc(c.id)}"><td>${badge('ক্যাম্পাস', 'green')}</td><td class="font-mono">${esc(c.id)}</td>${inp('name', c.name, 'required')}${inp('short', c.short)}${inp('levels', c.levels)}${inp('address', c.address)}${inp('phone', c.phone, 'inputmode="tel"')}${inp('map', c.map, 'type="url"')}
        <td class="text-center"><input type="radio" name="defcamp" class="w-5 h-5" aria-label="ডিফল্ট ক্যাম্পাস" ${c.id === def ? 'checked' : ''} ${dis} onchange="Settings.campDefault('${esc(c.id)}')"></td>
        ${can ? `<td class="text-center"><button class="btn btn-ghost btn-sm" aria-label="সংরক্ষণ" onclick="Settings.campSave('${esc(c.id)}')">${icon('save')}</button></td><td></td>` : ''}</tr>`).join('')
      + X.map((a, i) => `<tr data-addr="${i}"><td>${badge('ঠিকানা', 'blue')}</td><td></td>${inp('label', a.label)}<td></td><td></td>${inp('address', a.address)}${inp('phone', a.phone, 'inputmode="tel"')}${inp('map', a.map, 'type="url"')}<td></td>
        ${can ? `<td class="text-center"><button class="btn btn-ghost btn-sm" aria-label="সংরক্ষণ" onclick="Settings.addrRowSave(${i})">${icon('save')}</button></td><td class="text-center"><button class="btn btn-ghost btn-sm text-red-600" aria-label="মুছুন" onclick="Settings.addrDel(${i})">${icon('trash-2')}</button></td>` : ''}</tr>`).join('')
      + (can ? `<tr data-camp=""><td>${badge('নতুন ক্যাম্পাস', 'green')}</td><td><input class="xg-edit font-mono uppercase" name="id" placeholder="কোড" maxlength="8" aria-label="কোড"></td><td><input class="xg-edit" name="name" placeholder="ক্যাম্পাসের নাম" aria-label="ক্যাম্পাসের নাম"></td><td><input class="xg-edit" name="short" aria-label="সংক্ষিপ্ত নাম"></td><td><input class="xg-edit" name="levels" aria-label="প্রদত্ত স্তর"></td><td><input class="xg-edit" name="address" aria-label="ঠিকানা"></td><td><input class="xg-edit" name="phone" inputmode="tel" aria-label="ফোন"></td><td><input class="xg-edit" name="map" type="url" aria-label="মানচিত্র"></td><td></td><td class="text-center" colspan="2"><button class="btn btn-primary btn-sm" onclick="Settings.campSave('')">${icon('plus')} ক্যাম্পাস যোগ</button></td></tr>` : '');
    return `<style>${typeof XG_CSS !== 'undefined' ? XG_CSS : ''}</style><div class="xg-wrap"><table class="xg w-full" style="min-width:72rem"><thead><tr><th>ধরন</th><th>কোড</th><th>নাম / লেবেল</th><th>সংক্ষিপ্ত নাম</th><th>প্রদত্ত স্তর</th><th>ঠিকানা</th><th>ফোন</th><th>মানচিত্রের লিংক</th><th>ডিফল্ট</th>${can ? '<th>সংরক্ষণ</th><th>মুছুন</th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div>
      ${can ? `<button class="btn btn-ghost mt-4" onclick="Settings.addrAdd()">${icon('map-pin')} ঠিকানা যোগ করুন</button>` : ''}`;
  },
  placeSimple(f) {
    const d = formData(f), c = DB.s.campuses[0];
    if (d.map && !/^https?:\/\//i.test(d.map)) return toast('মানচিত্রের লিংক http:// বা https:// দিয়ে শুরু হতে হবে।', 'error');
    if (c) Object.assign(c, { address: d.address, phone: d.phone, map: d.map });
    Object.assign(DB.s.school, { address: d.address, phone: d.phone || DB.s.school.phone });
    this.save('ঠিকানা সংরক্ষিত হয়েছে।', 'address');
  },
  addrRowSave(i) {
    const tr = $$('[data-addr]').find(r => r.dataset.addr === String(i)), L = this.addrList(); if (!tr || !L[i]) return;
    const v = {}; $$('input.xg-edit', tr).forEach(x => { v[x.name] = x.value.trim(); });
    if (!v.label || !v.address) return toast('লেবেল ও ঠিকানা আবশ্যক।', 'error');
    if (v.map && !/^https?:\/\//i.test(v.map)) return toast('মানচিত্রের লিংক http:// বা https:// দিয়ে শুরু হতে হবে।', 'error');
    Object.assign(L[i], v); this.save('ঠিকানা সংরক্ষিত হয়েছে।', `address ${v.label}`);
  },
  /* ---------- addresses ---------- */
  addrList() { return Array.isArray(DB.s.school.addresses) ? DB.s.school.addresses : []; },
  addresses() {
    const can = this.canEdit(), dis = can ? '' : 'disabled', L = this.addrList();
    const row = (a, i) => `<form class="card p-4 grid sm:grid-cols-2 gap-3" onsubmit="Settings.addrSave(${i},this);return false">
      <div><label class="label">লেবেল</label><input class="input" name="label" value="${esc(a.label || '')}" required maxlength="60" ${dis}></div>
      <div><label class="label">ফোন</label><input class="input" name="phone" value="${esc(a.phone || '')}" maxlength="40" inputmode="tel" ${dis}></div>
      <div class="sm:col-span-2"><label class="label">ঠিকানা</label><textarea class="textarea" name="address" rows="2" required maxlength="300" ${dis}>${esc(a.address || '')}</textarea></div>
      <div class="sm:col-span-2"><label class="label">মানচিত্রের লিংক</label><input class="input" name="map" type="url" value="${esc(a.map || '')}" maxlength="500" ${dis}></div>
      ${can ? `<div class="sm:col-span-2 flex flex-wrap gap-2"><button class="btn btn-primary btn-sm">${icon('save')} সংরক্ষণ</button>${a.map ? `<a class="btn btn-ghost btn-sm" href="${esc(a.map)}" target="_blank" rel="noopener">${icon('map')} মানচিত্র</a>` : ''}<button type="button" class="btn btn-ghost btn-sm ml-auto text-red-600" onclick="Settings.addrDel(${i})">${icon('trash-2')} মুছুন</button></div>` : ''}</form>`;
    return `<div class="space-y-4 max-w-4xl">${L.map(row).join('') || `<div class="card">${emptyState('কোনো ঠিকানা যোগ করা হয়নি।', 'map-pin')}</div>`}
      ${can ? `<button class="btn btn-primary" onclick="Settings.addrAdd()">${icon('plus')} ঠিকানা যোগ করুন</button>` : ''}</div>`;
  },
  addrAdd() { DB.s.school.addresses = [...this.addrList(), { id: DB.id('AD'), label: 'শহর অফিস', address: '', phone: '', map: '' }]; App.ui.plFull = true; DB.save(); App.refresh(); },
  addrSave(i, f) {
    const d = formData(f), L = this.addrList(); if (!L[i]) return;
    if (d.map && !/^https?:\/\//i.test(d.map)) return toast('মানচিত্রের লিংক http:// বা https:// দিয়ে শুরু হতে হবে।', 'error');
    Object.assign(L[i], { label: d.label, address: d.address, phone: d.phone, map: d.map });
    if (i === 0) Object.assign(DB.s.school, { address: d.address, phone: d.phone || DB.s.school.phone });
    this.save('ঠিকানা সংরক্ষিত হয়েছে।', `address ${d.label}`);
  },
  addrDel(i) { const L = this.addrList(); if (!L[i] || !confirm(`“${L[i].label}” ঠিকানাটি মুছে ফেলবেন?`)) return; DB.s.school.addresses = L.filter((_, j) => j !== i); this.save('ঠিকানা মুছে ফেলা হয়েছে।', 'address deleted'); },

  /* ---------- campuses ---------- */
  defaultCampus() { const d = DB.s.school.defaultCampusId; return DB.s.campuses.some(c => c.id === d) ? d : DB.s.campuses[0]?.id; },
  campuses() {
    const can = this.canEdit(), dis = can ? '' : 'disabled', def = this.defaultCampus();
    const cell = (c, k, extra = '') => `<td><input class="xg-edit" name="${k}" value="${esc(c[k] || '')}" ${extra} ${dis}></td>`;
    return `<style>${typeof XG_CSS !== 'undefined' ? XG_CSS : ''}</style><div class="xg-wrap"><table class="xg w-full" style="min-width:56rem"><thead><tr><th>কোড</th><th>পূর্ণ নাম</th><th>সংক্ষিপ্ত নাম</th><th>প্রদত্ত স্তর</th><th>ঠিকানা</th><th>ফোন</th><th>ডিফল্ট</th><th>শ্রেণি</th>${can ? '<th>সংরক্ষণ</th>' : ''}</tr></thead><tbody>
      ${DB.s.campuses.map(c => `<tr data-camp="${esc(c.id)}"><td class="font-mono">${esc(c.id)}</td>${cell(c, 'name', 'required')}${cell(c, 'short')}${cell(c, 'levels')}${cell(c, 'address')}${cell(c, 'phone', 'inputmode="tel"')}
        <td class="text-center"><input type="radio" name="defcamp" class="w-5 h-5" aria-label="ডিফল্ট ক্যাম্পাস" ${c.id === def ? 'checked' : ''} ${dis} onchange="Settings.campDefault('${esc(c.id)}')"></td><td class="text-center">${bnNum(DB.classesIn(c.id).length)}</td>
        ${can ? `<td class="text-center"><button class="btn btn-ghost btn-sm" aria-label="সংরক্ষণ" onclick="Settings.campSave('${esc(c.id)}')">${icon('save')}</button></td>` : ''}</tr>`).join('')}
      ${can ? `<tr data-camp=""><td><input class="xg-edit font-mono uppercase" name="id" placeholder="কোড" maxlength="8"></td><td><input class="xg-edit" name="name" placeholder="নতুন ক্যাম্পাসের নাম"></td><td><input class="xg-edit" name="short"></td><td><input class="xg-edit" name="levels"></td><td><input class="xg-edit" name="address"></td><td><input class="xg-edit" name="phone" inputmode="tel"></td><td></td><td></td><td class="text-center"><button class="btn btn-primary btn-sm" onclick="Settings.campSave('')">${icon('plus')} যোগ</button></td></tr>` : ''}
      </tbody></table></div>`;
  },
  campRow(id) { const tr = $$('[data-camp]').find(r => r.dataset.camp === id), v = {}; if (tr) $$('input.xg-edit', tr).forEach(i => { v[i.name] = i.value.trim(); }); return v; },
  campSave(id) {
    const v = this.campRow(id);
    if (!v.name) return toast('ক্যাম্পাসের নাম আবশ্যক।', 'error');
    if (v.map && !/^https?:\/\//i.test(v.map)) return toast('মানচিত্রের লিংক http:// বা https:// দিয়ে শুরু হতে হবে।', 'error');
    if (id) { const c = DB.campus(id); if (!c) return; Object.assign(c, { name: v.name, short: v.short || v.name, levels: v.levels, address: v.address, phone: v.phone, map: v.map || '' }); if (DB.s.campuses[0] === c) Object.assign(DB.s.school, { address: v.address || DB.s.school.address, phone: v.phone || DB.s.school.phone }); return this.save('ক্যাম্পাস সংরক্ষিত হয়েছে।', `campus ${id}`); }
    const code = (v.id || '').toUpperCase();
    if (!/^[A-Z]{2,8}$/.test(code)) return toast('কোড ২–৮টি ইংরেজি অক্ষর হতে হবে।', 'error');
    if (DB.s.campuses.some(c => c.id === code)) return toast('ক্যাম্পাস কোডটি ইতোমধ্যে বিদ্যমান।', 'error');
    DB.s.campuses.push({ id: code, name: v.name, short: v.short || v.name, levels: v.levels, address: v.address, phone: v.phone, map: v.map || '' }); DB.s.rooms[code] = DB.s.rooms[code] || [];
    this.save(`“${v.name}” ক্যাম্পাস যোগ করা হয়েছে।`, `campus ${code} added`);
  },
  campDefault(id) { DB.s.school.defaultCampusId = id; this.save(`${DB.campus(id).name} ডিফল্ট ক্যাম্পাস করা হয়েছে।`, `default campus ${id}`); },
});

/* ---------------- ভিডিও শোকেস, ক্যাম্পাস ট্যুর ও ডকুমেন্টারি ---------------- */
const SiteMedia = {
  DEF: {
    videos: { on: false, title: 'ভিডিও গ্যালারি', kicker: 'ক্যামেরায় আমাদের প্রতিষ্ঠান', items: [] },
    tour: { on: false, title: 'ক্যাম্পাস ট্যুর', kicker: 'ঘুরে দেখুন', url: '', body: '', photos: [] },
    documentary: { on: false, title: 'ডকুমেন্টারি', kicker: 'আমাদের গল্প', url: '', body: '', poster: null },
  },
  HOME: { videos: 'videoShowcase', tour: 'campusTour', documentary: 'documentary' },
  /** Read-only view (never writes defaults on a public visit). */
  cfg(k) { const m = (DB.s.site || {}).media || {}; return { ...this.DEF[k], ...(m[k] || {}) }; },
  edit(k) { const S = DB.s.site, m = S.media || (S.media = {}); return m[k] || (m[k] = JSON.parse(JSON.stringify(this.DEF[k]))); },
  kind(u) { u = String(u || ''); if (/^data:video\//.test(u) || /\.(mp4|webm|ogg)(\?|#|$)/i.test(u)) return 'file'; if (this.yt(u)) return 'youtube'; if (this.vimeo(u)) return 'vimeo'; if (/^https:\/\/(kuula\.co|momento360\.com|www\.google\.com\/maps\/embed)/i.test(u)) return 'pano'; return /^https?:\/\//i.test(u) ? 'link' : ''; },
  yt(u) { const m = String(u || '').match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/); return m ? m[1] : null; },
  vimeo(u) { const m = String(u || '').match(/vimeo\.com\/(?:video\/)?(\d{6,})/); return m ? m[1] : null; },
  thumb(v) { if (v.thumb) return v.thumb; const y = this.yt(v.url); return y ? `https://i.ytimg.com/vi/${y}/hqdefault.jpg` : ''; },
  /** Player for a link or an uploaded file. */
  player(url, title, poster) {
    const k = this.kind(url), t = esc(title || 'ভিডিও'), box = h => `<div class="aspect-video rounded-xl overflow-hidden bg-black">${h}</div>`;
    if (k === 'youtube') return box(`<iframe class="w-full h-full" src="https://www.youtube-nocookie.com/embed/${this.yt(url)}" title="${t}" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen></iframe>`);
    if (k === 'vimeo') return box(`<iframe class="w-full h-full" src="https://player.vimeo.com/video/${this.vimeo(url)}" title="${t}" loading="lazy" allow="fullscreen; picture-in-picture" allowfullscreen></iframe>`);
    if (k === 'pano') return box(`<iframe class="w-full h-full" src="${esc(url)}" title="${t}" loading="lazy" allow="fullscreen; gyroscope; accelerometer" allowfullscreen></iframe>`);
    if (k === 'file') return box(`<video class="w-full h-full" controls preload="metadata" src="${esc(url)}" ${poster ? `poster="${esc(poster)}"` : ''}></video>`);
    if (k === 'link') return `<a class="btn btn-primary" href="${esc(url)}" target="_blank" rel="noopener">${icon('external-link')} ${t}</a>`;
    return '';
  },
  play(id) { const v = this.cfg('videos').items.find(x => x.id === id); if (v) Modal.open({ title: esc(v.title || 'ভিডিও'), size: 'xl', body: this.player(v.url, v.title, v.thumb) }); },
  card(v) {
    const th = this.thumb(v);
    return `<button type="button" class="text-left group" onclick="SiteMedia.play('${v.id}')"><div class="relative rounded-xl overflow-hidden aspect-video bg-slate-800 flex items-center justify-center">${th ? `<img src="${esc(th)}" alt="${esc(v.title)}" loading="lazy" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition">` : ''}<span class="relative w-14 h-14 rounded-full bg-white/90 text-brand-700 flex items-center justify-center shadow-lg">${icon('play', 'w-7 h-7')}</span></div><div class="font-semibold mt-2">${esc(v.title || '')}</div></button>`;
  },
  /** Section body (shared by the homepage and the gallery page); '' while off or empty. */
  body(k, count) {
    const c = this.cfg(k); if (!c.on) return '';
    if (k === 'videos') { const L = (c.items || []).filter(v => v.url).slice(0, count || 99); return L.length ? `<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">${L.map(v => this.card(v)).join('')}</div>` : ''; }
    if (k === 'tour') {
      const P = c.photos || [], pl = c.url ? this.player(c.url, c.title) : ''; if (!pl && !P.length) return '';
      return `${pl || c.body ? `<div class="grid ${c.body && pl ? 'lg:grid-cols-5' : ''} gap-6 items-center">${pl ? `<div class="${c.body ? 'lg:col-span-3' : 'max-w-4xl mx-auto w-full'}">${pl}</div>` : ''}${c.body ? `<div class="${pl ? 'lg:col-span-2' : ''} md-body text-slate-700">${mdLite(c.body)}</div>` : ''}</div>` : ''}
        ${P.length ? `<div class="grid grid-cols-2 md:grid-cols-4 gap-3 ${pl || c.body ? 'mt-6' : ''}">${P.map((p, i) => `<button type="button" class="rounded-lg overflow-hidden" onclick="SiteMedia.photo(${i})" aria-label="ছবি ${bnNum(i + 1)}"><img src="${p}" alt="" loading="lazy" class="w-full aspect-[4/3] object-cover hover:scale-105 transition"></button>`).join('')}</div>` : ''}`;
    }
    const pl = c.url ? this.player(c.url, c.title, c.poster) : ''; if (!pl) return '';
    return `<div class="grid ${c.body ? 'lg:grid-cols-5' : ''} gap-6 items-center"><div class="${c.body ? 'lg:col-span-3' : 'max-w-4xl mx-auto w-full'}">${pl}</div>${c.body ? `<div class="lg:col-span-2 md-body text-slate-700">${mdLite(c.body)}</div>` : ''}</div>`;
  },
  photo(i) { const P = this.cfg('tour').photos || []; if (P[i]) Modal.open({ title: esc(this.cfg('tour').title), size: 'xl', body: `<img src="${P[i]}" class="w-full rounded-lg" alt=""><div class="flex justify-end gap-2 mt-3"><button class="btn btn-ghost btn-sm" ${i > 0 ? '' : 'disabled'} onclick="SiteMedia.photo(${i - 1})">${icon('chevron-left')}</button><button class="btn btn-ghost btn-sm" ${i < P.length - 1 ? '' : 'disabled'} onclick="SiteMedia.photo(${i + 1})">${icon('chevron-right')}</button></div>` }); },
  section(k, x = {}) { const b = this.body(k, +x.count || 0); if (!b) return ''; const c = this.cfg(k); return Pub.section(esc(x.title || c.title || ''), esc(x.kicker ?? c.kicker ?? ''), b); },
  any() { return ['videos', 'tour', 'documentary'].some(k => this.body(k)); },

  /* ----- editor (লুক এন্ড ফিল → ভিডিও, ট্যুর ও ডকুমেন্টারি) ----- */
  editor() {
    const can = Settings.canEdit(), dis = can ? '' : 'disabled';
    const sw = k => `<label class="flex items-center gap-2 ml-auto font-semibold"><input type="checkbox" class="w-5 h-5" ${this.cfg(k).on ? 'checked' : ''} ${dis} onchange="SiteMedia.toggle('${k}',this.checked)"> চালু</label>`;
    const head = (k, ic, l) => `<div class="px-5 py-3 border-b border-slate-100 font-semibold flex items-center gap-2">${icon(ic, 'w-5 h-5 text-brand-600')} ${l}${sw(k)}</div>`;
    const tk = (k, c) => `<div><label class="label">শিরোনাম</label><input class="input" name="title" value="${esc(c.title || '')}" maxlength="80" ${dis}></div><div><label class="label">শিরোনামের ওপরের ছোট লেবেল</label><input class="input" name="kicker" value="${esc(c.kicker || '')}" maxlength="80" ${dis}></div>`;
    const V = this.cfg('videos'), T = this.cfg('tour'), D = this.cfg('documentary');
    const vids = `<div class="card">${head('videos', 'clapperboard', 'ভিডিও শোকেস')}
      <form class="p-5 grid sm:grid-cols-2 gap-3 border-b border-slate-100" onsubmit="SiteMedia.saveCfg('videos',this);return false">${tk('videos', V)}${can ? `<div class="sm:col-span-2"><button class="btn btn-primary btn-sm">${icon('save')} সংরক্ষণ</button></div>` : ''}</form>
      <div class="p-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">${(V.items || []).map(v => `<div class="border border-slate-200 rounded-lg p-3 space-y-2">${this.card(v)}<div class="text-slate-500 truncate">${esc(/^data:/.test(v.url) ? 'আপলোড করা ভিডিও' : v.url)}</div>${can ? `<div class="flex flex-wrap gap-2"><label class="btn btn-ghost btn-sm cursor-pointer">${icon('image-plus')} থাম্বনেইল<input type="file" accept="image/*" class="hidden" onchange="SiteMedia.thumbUp('${v.id}',this.files[0])"></label><button class="btn btn-ghost btn-sm text-red-600 ml-auto" onclick="SiteMedia.delVideo('${v.id}')">${icon('trash-2')} মুছুন</button></div>` : ''}</div>`).join('') || `<div class="sm:col-span-2 lg:col-span-3">${emptyState('কোনো ভিডিও নেই।', 'clapperboard')}</div>`}</div>
      ${can ? `<form class="p-5 border-t border-slate-100 grid sm:grid-cols-2 gap-3" onsubmit="SiteMedia.addVideo(this);return false"><div><label class="label">ভিডিওর শিরোনাম</label><input class="input" name="title" required maxlength="100"></div><div><label class="label">ইউটিউব / ভিমিও / MP4 লিংক</label><input class="input" name="url" type="url" maxlength="500"></div>
        <div><label class="label">অথবা ভিডিও ফাইল (সর্বোচ্চ ৪ এমবি)</label><input class="input" type="file" name="vfile" accept="video/mp4,video/webm"></div><div><label class="label">থাম্বনেইল (ঐচ্ছিক)</label><input class="input" type="file" name="tfile" accept="image/*"></div>
        <div class="sm:col-span-2"><button class="btn btn-primary btn-sm">${icon('plus')} ভিডিও যোগ করুন</button></div></form>` : ''}</div>`;
    const tour = `<div class="card">${head('tour', 'rotate-3d', 'ক্যাম্পাস ট্যুর')}
      <form class="p-5 grid sm:grid-cols-2 gap-3" onsubmit="SiteMedia.saveCfg('tour',this);return false">${tk('tour', T)}<div class="sm:col-span-2"><label class="label">ভিডিও বা ৩৬০° লিংক</label><input class="input" name="url" type="url" value="${esc(T.url || '')}" maxlength="500" ${dis}></div><div class="sm:col-span-2"><label class="label">বিবরণ</label><textarea class="textarea" name="body" rows="3" maxlength="2000" ${dis}>${esc(T.body || '')}</textarea></div>${can ? `<div class="sm:col-span-2"><button class="btn btn-primary btn-sm">${icon('save')} সংরক্ষণ</button></div>` : ''}</form>
      <div class="px-5 pb-5"><div class="label">ছবির সেট</div><div class="flex flex-wrap gap-2 items-center">${(T.photos || []).map((p, i) => `<div class="relative"><img src="${p}" alt="" class="h-20 w-28 object-cover rounded">${can ? `<button type="button" class="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-red-600 text-white flex items-center justify-center" aria-label="ছবি সরান" onclick="SiteMedia.delPhoto(${i})">${icon('x', 'w-4 h-4')}</button>` : ''}</div>`).join('')}${can ? `<label class="btn btn-ghost btn-sm cursor-pointer">${icon('image-plus')} ছবি যোগ করুন<input type="file" accept="image/*" multiple class="hidden" onchange="SiteMedia.addPhotos(this.files)"></label>` : ''}</div></div></div>`;
    const doc = `<div class="card">${head('documentary', 'film', 'ডকুমেন্টারি')}
      <form class="p-5 grid sm:grid-cols-2 gap-3" onsubmit="SiteMedia.saveCfg('documentary',this);return false">${tk('documentary', D)}<div class="sm:col-span-2"><label class="label">ভিডিও লিংক (ইউটিউব / ভিমিও / MP4)</label><input class="input" name="url" type="url" value="${esc(/^data:/.test(D.url || '') ? '' : D.url || '')}" maxlength="500" ${dis}></div><div class="sm:col-span-2"><label class="label">বিবরণ</label><textarea class="textarea" name="body" rows="4" maxlength="4000" ${dis}>${esc(D.body || '')}</textarea></div>${can ? `<div class="sm:col-span-2"><button class="btn btn-primary btn-sm">${icon('save')} সংরক্ষণ</button></div>` : ''}</form>
      <div class="px-5 pb-5 flex flex-wrap items-center gap-3">${D.poster ? `<img src="${D.poster}" alt="" class="h-20 w-32 object-cover rounded">` : ''}${can ? `<label class="btn btn-ghost btn-sm cursor-pointer">${icon('image-plus')} পোস্টার<input type="file" accept="image/*" class="hidden" onchange="SiteMedia.poster(this.files[0])"></label><label class="btn btn-ghost btn-sm cursor-pointer">${icon('upload')} ভিডিও ফাইল (৪ এমবি)<input type="file" accept="video/mp4,video/webm" class="hidden" onchange="SiteMedia.docFile(this.files[0])"></label>${D.poster ? `<button class="btn btn-ghost btn-sm" onclick="SiteMedia.edit('documentary').poster=null;Settings.save('পোস্টার সরানো হয়েছে।')">${icon('trash-2')}</button>` : ''}` : ''}</div></div>`;
    return `<div class="space-y-5">${vids}${tour}${doc}</div>`;
  },
  /** On / off for the section on the website; the homepage gets (or shows / hides) its section. */
  toggle(k, on) {
    this.edit(k).on = !!on;
    if (typeof Home !== 'undefined') { const H = Home.cfg(), t = this.HOME[k], x = H.sections.find(s => s.type === t); if (x) x.show = !!on; else if (on) H.sections.splice(Math.max(1, H.sections.length - 1), 0, { id: 'H' + Date.now().toString(36), type: t, show: true, title: this.cfg(k).title, kicker: this.cfg(k).kicker }); }
    Settings.save(on ? 'অংশটি ওয়েবসাইটে চালু করা হয়েছে।' : 'অংশটি ওয়েবসাইটে বন্ধ করা হয়েছে।', `media ${k}=${on}`);
  },
  saveCfg(k, f) {
    const d = formData(f), c = this.edit(k);
    if (d.url && !/^https?:\/\//i.test(d.url)) return toast('লিংক http:// বা https:// দিয়ে শুরু হতে হবে।', 'error');
    ['title', 'kicker', 'body'].forEach(x => { if (d[x] !== undefined) c[x] = d[x]; });
    if (d.url !== undefined && (d.url || !/^data:/.test(c.url || ''))) c.url = d.url;
    Settings.save('সংরক্ষিত হয়েছে।', `media ${k}`);
  },
  async addVideo(f) {
    const d = formData(f), vf = f.vfile.files[0], tf = f.tfile.files[0];
    if (d.url && !/^https?:\/\//i.test(d.url)) return toast('লিংক http:// বা https:// দিয়ে শুরু হতে হবে।', 'error');
    if (!vf && !this.kind(d.url)) return toast('একটি ভিডিও লিংক দিন অথবা ফাইল বেছে নিন।', 'error');
    try {
      const url = vf ? await Media.readAny(vf) : d.url, thumb = tf ? await readUpload(tf, 800) : null;
      this.edit('videos').items.push({ id: DB.id('VID'), title: d.title, url, thumb, date: U.today() });
      if (!DB.save()) { this.edit('videos').items.pop(); return toast('সংরক্ষণস্থান পূর্ণ — ছোট ফাইল বা লিংক ব্যবহার করুন।', 'error'); }
      Settings.save('ভিডিও যোগ করা হয়েছে।', `video ${d.title}`);
    } catch (e) { toast(e.message, 'error'); }
  },
  delVideo(id) { if (!confirm('ভিডিওটি মুছে ফেলবেন?')) return; const c = this.edit('videos'); c.items = c.items.filter(v => v.id !== id); Settings.save('ভিডিও মুছে ফেলা হয়েছে।', `video ${id} deleted`); },
  async thumbUp(id, file) { if (!file) return; try { const v = this.edit('videos').items.find(x => x.id === id); v.thumb = await readUpload(file, 800); Settings.save('থাম্বনেইল সংরক্ষিত হয়েছে।'); } catch (e) { toast(e.message, 'error'); } },
  async addPhotos(files) { const c = this.edit('tour'); c.photos = c.photos || []; for (const f of files) { try { c.photos.push(await readUpload(f, 1400)); } catch (e) { toast(e.message, 'error'); } } Settings.save('ছবি যোগ করা হয়েছে।', 'tour photos'); },
  delPhoto(i) { const c = this.edit('tour'); c.photos.splice(i, 1); Settings.save('ছবি সরানো হয়েছে।'); },
  async poster(file) { if (!file) return; try { this.edit('documentary').poster = await readUpload(file, 1400); Settings.save('পোস্টার সংরক্ষিত হয়েছে।'); } catch (e) { toast(e.message, 'error'); } },
  async docFile(file) { if (!file) return; try { this.edit('documentary').url = await Media.readAny(file); Settings.save('ভিডিও ফাইল সংরক্ষিত হয়েছে।', 'documentary file'); } catch (e) { toast(e.message, 'error'); } },
};
Settings.media = () => SiteMedia.editor();
// homepage sections
Object.assign(Home.TYPES, { videoShowcase: ['ভিডিও শোকেস', 'clapperboard'], campusTour: ['ক্যাম্পাস ট্যুর', 'rotate-3d'], documentary: ['ডকুমেন্টারি', 'film'] });
(() => {
  const e0 = Home.extra.bind(Home), back = { videoShowcase: 'videos', campusTour: 'tour', documentary: 'documentary' };
  Home.extra = function (x) { return back[x.type] ? SiteMedia.section(back[x.type], x) : e0(x); };
  // gallery page: photos, then the video showcase, campus tour and documentary
  const G = App.portals.public.pages.find(p => p.id === 'gallery');
  if (G) {
    const r0 = G.render, w0 = G.when;
    G.when = () => (w0 ? w0() : true) || SiteMedia.any();
    G.render = function (q) {
      const extra = ['videos', 'tour', 'documentary'].map(k => SiteMedia.section(k)).join('');
      if (!Site.gallery().length) return Pub.wrap(Pub.hero('গ্যালারি', '') + extra);
      const pw = Pub.wrap; Pub.wrap = inner => pw.call(Pub, inner + extra);
      try { return r0.call(this, q); } finally { Pub.wrap = pw; }
    };
  }
  // contact page: every address of the institution
  if (typeof PubContent !== 'undefined' && PubContent.contactPage) {
    const c0 = PubContent.contactPage.bind(PubContent);
    PubContent.contactPage = function () {
      const L = [...DB.s.campuses.filter(c => c.address).map(c => ({ label: c.name, address: c.address, phone: c.phone, map: c.map })), ...(DB.s.school.addresses || []).filter(a => a && a.address)]; if (L.length < 2) return c0();
      const sec = Pub.section('আমাদের ঠিকানাসমূহ', '', `<div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">${L.map(a => `<div class="card pub-card p-5 space-y-2"><div class="font-heading font-bold text-lg">${esc(a.label || '')}</div><div class="flex gap-2">${icon('map-pin', 'w-4 h-4 text-brand-600 shrink-0 mt-1')}${esc(a.address)}</div>${a.phone ? `<div class="flex gap-2">${icon('phone', 'w-4 h-4 text-brand-600 shrink-0 mt-1')}${esc(a.phone)}</div>` : ''}${a.map ? `<a class="btn btn-ghost btn-sm" href="${esc(a.map)}" target="_blank" rel="noopener">${icon('navigation')} মানচিত্র</a>` : ''}</div>`).join('')}</div>`);
      const pw = Pub.wrap; Pub.wrap = inner => pw.call(Pub, inner + sec);
      try { return c0(); } finally { Pub.wrap = pw; }
    };
  }
})();

/* ---------------- বিষয়সমূহ: one spreadsheet-like table ----------------
   Same data as before: subjects[] (code, name, nameEn, kind, group), class.subjects (empty = all),
   class.subjectRules[sid] = { streams, sections }, class.electives (choice groups, চতুর্থ বিষয়). */
const SubjGrid = {
  KINDS: [['core', 'আবশ্যিক'], ['elective', 'ঐচ্ছিক'], ['fourth', 'চতুর্থ বিষয়'], ['group', 'গুচ্ছভুক্ত']],
  RE: /^[A-Z0-9]{2,6}$/,
  code(s) { return s.code || s.id; },
  classes() { const ci = id => DB.s.campuses.findIndex(c => c.id === id); return [...DB.s.classes].sort((a, b) => ci(a.campusId) - ci(b.campusId) || (+a.grade || 0) - (+b.grade || 0)); },
  short(c) { return String(c.name || c.id).replace(/\s*শ্রেণি$/, ''); },
  label(key) {
    const [cid, k, v] = key.split('|'), c = DB.cls(cid); if (!c) return key;
    return k === 'st' ? `${this.short(c)} ${v}` : k === 'sec' ? `${this.short(c)}-${v}` : c.name;
  },
  inClass(c, sid) { return !(c.subjects || []).length || c.subjects.includes(sid); },
  materialize(c) { if (!(c.subjects || []).length) c.subjects = DB.s.subjects.map(s => s.id); },
  chips(sid) {
    const out = [];
    this.classes().forEach(c => {
      if (!this.inClass(c, sid)) return;
      const r = c.subjectRules?.[sid];
      if (!r || (!(r.streams || []).length && !(r.sections || []).length)) out.push(c.id);
      else { (r.streams || []).forEach(x => out.push(`${c.id}|st|${x}`)); (r.sections || []).forEach(x => out.push(`${c.id}|sec|${x}`)); }
    });
    return out;
  },
  options(campus) {
    const o = [];
    this.classes().filter(c => !campus || c.campusId === campus).forEach(c => { o.push(c.id); (c.streams || []).forEach(x => o.push(`${c.id}|st|${x}`)); if ((c.sections || []).length > 1) c.sections.forEach(x => o.push(`${c.id}|sec|${x}`)); });
    return o;
  },
  electivesWith(sid) { return DB.s.classes.flatMap(c => (c.electives || []).filter(g => (g.subjects || []).includes(sid))); },
  kindOf(s) { if (['fourth', 'group'].includes(s.kind)) return s.kind; const E = this.electivesWith(s.id); if (E.length) return E.some(g => g.fourth) ? 'fourth' : 'group'; return s.kind === 'elective' ? 'elective' : 'core'; },
  groupOf(s) { return s.group || this.electivesWith(s.id)[0]?.name || ''; },
  /** Subjects that were grouped in the old per-class editor keep their group when first edited here. */
  adopt(s) { const k = this.kindOf(s); if (['fourth', 'group'].includes(k) && !['fourth', 'group'].includes(s.kind)) { s.kind = k; s.group = this.groupOf(s); } },
  grouped(s) { return ['fourth', 'group'].includes(s.kind) && !!s.group; },
  /* ----- choice groups (গুচ্ছ): one name for the whole institution; in each class an elective of that name ----- */
  reg() { const s = DB.s.school; return Array.isArray(s.subjectGroups) ? s.subjectGroups : (s.subjectGroups = []); },
  groups() {
    const out = new Map(); (DB.s.school.subjectGroups || []).forEach(g => out.set(g.name, { name: g.name, fourth: !!g.fourth, religion: !!g.religion }));
    DB.s.classes.forEach(c => (c.electives || []).forEach(g => { if (g.name && !out.has(g.name)) out.set(g.name, { name: g.name, fourth: !!g.fourth }); }));
    DB.s.subjects.forEach(s => { if (s.group && !out.has(s.group)) out.set(s.group, { name: s.group, fourth: s.kind === 'fourth' }); });
    return [...out.values()];
  },
  gFourth(name) { return !!this.groups().find(g => g.name === name)?.fourth; },
  register(name, fourth, sec, religion) {
    const R = this.reg(); let g = R.find(x => x.name === name);
    if (!g) R.push(g = { name, fourth: !!fourth });
    g.fourth = !!fourth; if (religion !== undefined) g.religion = !!religion;
    if (sec) { g.secs = [...new Set([...(g.secs || []), ...(g.sec ? [g.sec] : []), sec])]; g.sec = g.secs[0]; }
  },
  secOf(name) { return (DB.s.school.subjectGroups || []).find(g => g.name === name)?.sec || ''; },
  /** A group shows in a level section when it was created there (a group may belong to several levels). */
  secIn(name, key) { const g = (DB.s.school.subjectGroups || []).find(x => x.name === name); return !!g && (g.sec === key || (g.secs || []).includes(key)); },
  gRel(name) { return !!(DB.s.school.subjectGroups || []).find(g => g.name === name)?.religion; },
  /** Copy the group's type (fourth / religion) to every class's elective of that name. */
  pushType(name) { const f = this.gFourth(name), r = this.gRel(name); DB.s.classes.forEach(c => (c.electives || []).forEach(g => { if (g.name === name) { g.fourth = f; g.religion = r; } })); },
  typeSel(g, attrs) { const v = g.religion ? 'religion' : g.fourth ? 'fourth' : 'one'; return `<select ${attrs}>${[['one', 'একটি বেছে নিন'], ['fourth', 'চতুর্থ বিষয়'], ['religion', 'ধর্ম অনুযায়ী']].map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`; },
  members(name) { return DB.s.subjects.filter(s => this.groupOf(s) === name && ['fourth', 'group'].includes(this.kindOf(s))); },
  addGroup(f) {
    const d = formData(f), name = (d.name || '').trim(); if (!name) return toast('গুচ্ছের নাম আবশ্যক।', 'error');
    const ex = this.groups().find(g => g.name === name);
    if (ex && (!d.sec || this.secIn(name, d.sec))) return toast('এই নামের গুচ্ছ আগে থেকেই আছে।', 'error');
    if (ex) this.register(name, ex.fourth, d.sec); else this.register(name, d.type === 'fourth', d.sec || '', d.type === 'religion');
    this.pushType(name); App.ui.sgGAdd = null; (App.ui.sgSec || (App.ui.sgSec = {}))['g:' + name] = true; this.done('গুচ্ছ তৈরি হয়েছে।', `group ${name} added`);
  },
  setGroupType(name, fourth) {
    const rel = fourth === 'religion'; fourth = fourth === true || fourth === 'fourth';
    this.members(name).forEach(s => this.adopt(s));
    this.register(name, fourth, '', rel);
    DB.s.subjects.filter(s => s.group === name).forEach(s => { s.kind = fourth ? 'fourth' : 'group'; });
    this.pushType(name);
    this.done('গুচ্ছের ধরন সংরক্ষিত হয়েছে।', `group ${name} fourth=${fourth}`);
  },
  renameGroup(old, name) {
    name = String(name || '').trim(); if (!name || name === old) return App.refresh();
    if (this.groups().some(g => g.name === name)) return toast('এই নামের গুচ্ছ আগে থেকেই আছে।', 'error');
    this.members(old).forEach(s => this.adopt(s));
    const R = this.reg(), o = R.find(g => g.name === old);
    if (o) o.name = name; else this.register(name, this.gFourth(old));
    DB.s.subjects.forEach(s => { if (s.group === old) s.group = name; });
    DB.s.classes.forEach(c => (c.electives || []).forEach(g => { if (g.name === old) g.name = name; }));
    this.done('গুচ্ছের নাম বদলানো হয়েছে।', `group ${old} → ${name}`);
  },
  delGroup(name) {
    if (!confirm(`“${name}” গুচ্ছটি মুছে ফেলবেন? এর বিষয়গুলো আবশ্যিক হয়ে যাবে।`)) return;
    const M = this.members(name); M.forEach(s => this.adopt(s));
    DB.s.school.subjectGroups = this.reg().filter(g => g.name !== name);
    M.forEach(s => { s.kind = 'core'; s.group = ''; this.sync(s.id); });
    DB.s.classes.forEach(c => { if (c.electives) c.electives = c.electives.filter(g => g.name !== name || DB.s.students.some(st => st.classId === c.id && st.electives?.[g.id])); });
    this.done('গুচ্ছ মুছে ফেলা হয়েছে।', `group ${name} deleted`);
  },
  groupsPanel(can) {
    const G = this.groups(), dis = can ? '' : 'disabled';
    return `<div class="xg-wrap mb-5"><table class="xg w-full" style="min-width:44rem"><thead><tr><th>গুচ্ছ (একটি বেছে নিতে হয়)</th><th>ধরন</th><th>বিষয়সমূহ</th>${can ? '<th>মুছুন</th>' : ''}</tr></thead><tbody>
      ${G.map(g => `<tr><td><input class="xg-edit" value="${esc(g.name)}" aria-label="গুচ্ছের নাম" ${dis} onchange="SubjGrid.renameGroup(${esc(JSON.stringify(g.name))},this.value)"></td>
        <td>${this.typeSel(g, `class="xg-edit sg-kind" aria-label="গুচ্ছের ধরন" ${dis} onchange="SubjGrid.setGroupType(${esc(JSON.stringify(g.name))},this.value)"`)}</td>
        <td class="sg-apply">${this.members(g.name).map(s => `<span class="sg-chip">${esc(s.name)}</span>`).join('') || '—'}</td>
        ${can ? `<td class="text-center"><button class="btn btn-ghost btn-sm text-red-600" aria-label="মুছুন" onclick="SubjGrid.delGroup(${esc(JSON.stringify(g.name))})">${icon('trash-2')}</button></td>` : ''}</tr>`).join('')}
      ${can ? `<tr><td colspan="${can ? 4 : 3}"><form class="flex flex-wrap gap-2 items-center" onsubmit="SubjGrid.addGroup(this);return false"><input class="xg-edit" name="name" placeholder="নতুন গুচ্ছের নাম" style="max-width:16rem" aria-label="নতুন গুচ্ছের নাম">${this.typeSel({}, 'class="xg-edit sg-kind" name="type" style="max-width:12rem" aria-label="ধরন"')}<button class="btn btn-primary btn-sm">${icon('plus')} গুচ্ছ যোগ</button></form></td></tr>` : ''}
      </tbody></table></div>`;
  },
  /** Per class: which sections / বিভাগ take a subject ("সব শাখা" = the whole class). */
  toggleKey(sid, key) {
    const s = DB.subject(sid), [cid, k, v] = key.split('|'), c = DB.cls(cid); if (!s || !c) return;
    this.adopt(s); this.materialize(c);
    const R = c.subjectRules || (c.subjectRules = {}), has = this.chips(sid).includes(key);
    if (!k) { if (has) { c.subjects = c.subjects.filter(x => x !== sid); delete R[sid]; } else { if (!c.subjects.includes(sid)) c.subjects.push(sid); delete R[sid]; } }
    else {
      const kind = k === 'st' ? 'streams' : 'sections';
      if (has) return this.delChip(sid, key);
      if (!c.subjects.includes(sid)) c.subjects.push(sid);
      const x = R[sid] || (R[sid] = { streams: [], sections: [] }); x.streams = x.streams || []; x.sections = x.sections || []; if (!x[kind].includes(v)) x[kind].push(v);
    }
    this.sync(sid); this.done('', `${sid} ⇄ ${key}`);
  },
  detail(sid, c) {
    const ch = this.chips(sid), on = key => ch.includes(key), p = (key, l) => `<button type="button" class="pill ${on(key) ? 'pill-on' : ''}" aria-pressed="${on(key)}" onclick="SubjGrid.toggleKey('${esc(sid)}','${esc(key)}')">${on(key) ? icon('check', 'w-4 h-4') : ''}${esc(l)}</button>`;
    return `<div class="flex flex-wrap gap-1.5 items-center my-1 p-2 rounded-lg" style="background:var(--xg-chip)"><b class="mr-1">${esc(c.name)}:</b>${p(c.id, 'সব শাখা')}${(c.streams || []).map(x => p(`${c.id}|st|${x}`, x)).join('')}${(c.sections || []).length > 1 ? c.sections.map(x => p(`${c.id}|sec|${x}`, `${this.short(c)}-${x}`)).join('') : ''}<button type="button" class="btn btn-ghost btn-sm" aria-label="বন্ধ করুন" onclick="App.ui.sgOpen=null;App.refresh()">${icon('x', 'w-4 h-4')}</button></div>`;
  },
  /** Put the subject into its choice group (same name) in every class it applies to, and out of all others. */
  sync(sid) {
    const s = DB.subject(sid); if (!s) return;
    DB.s.classes.forEach(c => {
      (c.electives || []).forEach(g => { g.subjects = (g.subjects || []).filter(x => x !== sid); });
      if (this.grouped(s) && this.inClass(c, sid)) {
        const E = c.electives || (c.electives = []);
        let g = E.find(x => x.name === s.group);
        if (!g) E.push(g = { id: DB.id('EG'), name: s.group, subjects: [], fourth: s.kind === 'fourth', streams: [] });
        g.subjects.push(sid); g.fourth = s.kind === 'fourth'; g.religion = this.gRel(s.group);
      }
      if (c.electives) c.electives = c.electives.filter(g => (g.subjects || []).length || DB.s.students.some(st => st.classId === c.id && st.electives?.[g.id]));
    });
  },
  done(msg, detail) { DB.audit('SUBJECT_TABLE', 'classes', detail); DB.save(); if (msg) toast(msg, 'success'); App.refresh(); },
  addChip(sid, key) {
    const s = DB.subject(sid); if (!s || !key) return;
    const [cid, k, v] = key.split('|'), c = DB.cls(cid); if (!c) return;
    this.adopt(s);
    const R = c.subjectRules || (c.subjectRules = {}), r = R[sid];
    const whole = this.inClass(c, sid) && (!r || (!(r.streams || []).length && !(r.sections || []).length));
    if (whole) return toast(`${this.label(cid)}-এ বিষয়টি আগে থেকেই আছে।`, 'warn');
    this.materialize(c); if (!c.subjects.includes(sid)) c.subjects.push(sid);
    if (!k) delete R[sid];
    else { const kind = k === 'st' ? 'streams' : 'sections', x = R[sid] || (R[sid] = { streams: [], sections: [] }); x.streams = x.streams || []; x.sections = x.sections || []; if (x[kind].includes(v)) return toast('এটি আগে থেকেই আছে।', 'warn'); x[kind].push(v); }
    this.sync(sid); this.done('', `${sid} + ${key}`);
  },
  delChip(sid, key) {
    const s = DB.subject(sid); if (!s) return;
    const [cid, k, v] = key.split('|'), c = DB.cls(cid); if (!c) return;
    this.adopt(s); this.materialize(c);
    const R = c.subjectRules || (c.subjectRules = {});
    if (!k) { c.subjects = c.subjects.filter(x => x !== sid); delete R[sid]; }
    else {
      const kind = k === 'st' ? 'streams' : 'sections', x = R[sid]; if (x) x[kind] = (x[kind] || []).filter(y => y !== v);
      if (!x || (!(x.streams || []).length && !(x.sections || []).length)) { delete R[sid]; c.subjects = c.subjects.filter(y => y !== sid); }
    }
    this.sync(sid); this.done('', `${sid} − ${key}`);
  },
  pick(sid, inp, campus) { const key = this._opts?.[campus]?.[inp.value.trim()]; if (!key) return; inp.value = ''; const [cid, k] = key.split('|'); k ? this.toggleKey(sid, key) : this.addChip(sid, key); App.ui.sgOpen = `${sid}|${cid}`; },
  setKind(sid, k) {
    const s = DB.subject(sid); if (!s) return;
    this.adopt(s); s.kind = k;
    if (['fourth', 'group'].includes(k)) {
      const fourth = k === 'fourth';
      if (!s.group || this.gFourth(s.group) !== fourth) s.group = this.groups().find(g => g.fourth === fourth)?.name || (fourth ? 'চতুর্থ বিষয়' : 'ঐচ্ছিক গুচ্ছ');
      this.register(s.group, fourth);
    } else s.group = '';
    this.sync(sid); this.done('ধরন সংরক্ষিত হয়েছে।', `${sid} kind=${k}`);
  },
  setGroup(sid, name) {
    const s = DB.subject(sid); if (!s) return;
    this.adopt(s); name = String(name || '').trim();
    s.group = name; s.kind = name ? (this.gFourth(name) ? 'fourth' : 'group') : 'core';
    if (name) this.register(name, s.kind === 'fourth');
    this.sync(sid); this.done('গুচ্ছ সংরক্ষিত হয়েছে।', `${sid} group=${name || '—'}`);
  },
  saveRow(sid) {
    const s = DB.subject(sid), tr = $$('[data-subj]').find(r => r.dataset.subj === sid); if (!s || !tr) return;
    const v = n => tr.querySelector(`[name=${n}]`)?.value.trim() || '';
    if (!v('name')) return toast('বিষয়ের নাম আবশ্যক।', 'error');
    Object.assign(s, { name: v('name'), nameEn: v('nameEn') });
    Settings.save('বিষয় সংরক্ষিত হয়েছে।', `subject ${sid} edited`);
  },
  codeTaken(code, except) { return DB.s.subjects.some(s => s.id !== except && (this.code(s).toUpperCase() === code || s.id.toUpperCase() === code)); },
  add() {
    const tr = $$('[data-subj]').find(r => r.dataset.subj === ''), v = n => tr?.querySelector(`[name=${n}]`)?.value.trim() || '';
    const code = v('code').toUpperCase(), name = v('name'), k = v('kind') || 'core';
    if (!this.RE.test(code)) return toast('বিষয় কোড ২–৬টি ইংরেজি বড় হাতের অক্ষর বা অঙ্ক হতে হবে।', 'error');
    if (this.codeTaken(code)) return toast('এই কোডের বিষয় আগে থেকেই আছে।', 'error');
    if (!name) return toast('বিষয়ের নাম আবশ্যক।', 'error');
    DB.s.classes.forEach(c => this.materialize(c));   // a new subject applies only to the classes of the section it was added in
    const grp = tr?.dataset.group || '', fourth = grp ? this.gFourth(grp) : k === 'fourth';
    DB.s.subjects.push({ id: code, code, name, nameEn: v('nameEn'), kind: grp ? (fourth ? 'fourth' : 'group') : k, group: grp || (k === 'fourth' ? 'চতুর্থ বিষয়' : k === 'group' ? 'ঐচ্ছিক গুচ্ছ' : '') });
    String(tr?.dataset.classes || '').split(',').filter(Boolean).forEach(cid => { const c = DB.cls(cid); if (c && !c.subjects.includes(code)) c.subjects.push(code); });
    if (DB.subject(code).group) { this.register(DB.subject(code).group, DB.subject(code).kind === 'fourth'); this.sync(code); }
    App.ui.sgAdd = null;
    Settings.save(`বিষয় “${name}” যোগ করা হয়েছে।`, `subject ${code} added`);
  },
  /** Code change: references (marks, routine, teachers, classes, exams …) use the subject's fixed internal id, so only the visible code changes. */
  changeCode(sid) {
    const s = DB.subject(sid); if (!s) return;
    const n = (prompt(`“${s.name}” বিষয়ের নতুন কোড (২–৬টি বড় হাতের অক্ষর বা অঙ্ক):`, this.code(s)) || '').trim().toUpperCase();
    if (!n || n === this.code(s)) return;
    if (!this.RE.test(n)) return toast('বিষয় কোড ২–৬টি ইংরেজি বড় হাতের অক্ষর বা অঙ্ক হতে হবে।', 'error');
    if (this.codeTaken(n, sid)) return toast('এই কোডের বিষয় আগে থেকেই আছে।', 'error');
    if (!confirm(`কোড ${this.code(s)} → ${n}। মুদ্রিত নম্বরপত্র, রুটিন ও প্রতিবেদনে নতুন কোড দেখাবে। বদলাবেন?`)) return;
    const old = this.code(s); s.code = n;
    DB.audit('SUBJECT_CODE', 'classes', `${sid}: ${old} → ${n}`); DB.save();
    toast(`কোড বদলানো হয়েছে। নম্বর, রুটিন ও শিক্ষক বরাদ্দ বিষয়ের স্থায়ী অভ্যন্তরীণ আইডিতে যুক্ত, তাই সবকিছু আগের মতোই সংযুক্ত আছে।`, 'success'); App.refresh();
  },
  editor() {
    const can = Settings.canEdit(), dis = can ? '' : 'disabled', S = DB.s.subjects;
    const camps = DB.s.campuses.filter(cp => DB.s.classes.some(c => c.campusId === cp.id)), CP = camps.length ? camps : DB.s.campuses.slice(0, 1);
    this._opts = Object.fromEntries(CP.map(cp => [cp.id, Object.fromEntries(this.options(cp.id).map(k => [this.label(k), k]))]));
    const groups = this.groups().map(g => g.name), open = App.ui.sgOpen || '';
    if (this._sections !== false) return this.sectioned(can, dis, CP, groups, open);
    const css = `<style>${typeof XG_CSS !== 'undefined' ? XG_CSS : ''}
      .sg-chip{display:inline-flex;align-items:center;gap:.25rem;background:var(--xg-chip);border:1px solid var(--xg-bd);border-radius:999px;padding:.05rem .2rem .05rem .6rem;margin:.1rem .15rem .1rem 0;white-space:nowrap}
      .sg-chip button{width:1.6rem;height:1.6rem;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;color:var(--xg-mut)}.sg-chip button:hover{background:var(--xg-bad);color:#b91c1c}
      .sg-chip .sg-lab{width:auto;height:auto;border-radius:0;color:inherit}.sg-chip .sg-lab:hover{background:transparent;color:inherit;text-decoration:underline}
      .sg-apply{white-space:normal !important;min-width:34rem}.sg-kind{min-width:8.5rem}.sg-off td{opacity:.55}</style>`;
    const row = s => {
      const k = this.kindOf(s), g = this.groupOf(s), used = Subjects.used(s.id);
      return `<tr data-subj="${esc(s.id)}" class="${s.active === false ? 'sg-off' : ''}">
        <td><div class="flex items-center gap-1"><span class="font-mono font-semibold">${esc(this.code(s))}</span>${can ? `<button class="btn btn-ghost btn-sm !px-1" title="কোড বদল" aria-label="কোড বদল" onclick="SubjGrid.changeCode('${esc(s.id)}')">${icon('pencil-line', 'w-4 h-4')}</button>` : ''}</div></td>
        <td><input class="xg-edit" name="name" value="${esc(s.name)}" style="min-width:9rem" ${dis}></td>
        <td><input class="xg-edit" name="nameEn" value="${esc(s.nameEn || '')}" lang="en" style="min-width:8rem" ${dis}></td>
        <td><select class="xg-edit sg-kind" aria-label="ধরন" ${dis} onchange="SubjGrid.setKind('${esc(s.id)}',this.value)">${this.KINDS.map(([v, l]) => `<option value="${v}" ${k === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
        <td><select class="xg-edit sg-kind" aria-label="গুচ্ছ" ${dis} onchange="SubjGrid.setGroup('${esc(s.id)}',this.value)"><option value="">— নেই —</option>${groups.map(n => `<option value="${esc(n)}" ${['fourth', 'group'].includes(k) && g === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></td>
        ${CP.map(cp => { const ch = this.chips(s.id).filter(key => DB.cls(key.split('|')[0])?.campusId === cp.id), oc = open.startsWith(s.id + '|') ? DB.cls(open.slice(s.id.length + 1)) : null;
          return `<td class="sg-apply">${ch.map(key => `<span class="sg-chip"><button type="button" class="sg-lab" aria-label="${esc(this.label(key))} — শাখা ও বিভাগ" onclick="App.ui.sgOpen='${esc(s.id)}|${esc(key.split('|')[0])}';App.refresh()">${esc(this.label(key))}</button>${can ? `<button type="button" aria-label="${esc(this.label(key))} সরান" onclick="SubjGrid.delChip('${esc(s.id)}','${esc(key)}')">${icon('x', 'w-4 h-4')}</button>` : ''}</span>`).join('')}${can ? `<input class="xg-edit" list="sg-opts-${esc(cp.id)}" style="width:10rem;display:inline-block" aria-label="শ্রেণি, শাখা বা বিভাগ যোগ করুন" placeholder="+ যোগ করুন" onchange="SubjGrid.pick('${esc(s.id)}',this,'${esc(cp.id)}')">` : ''}${can && oc && oc.campusId === cp.id ? this.detail(s.id, oc) : ''}</td>`; }).join('')}
        ${can ? `<td class="text-center"><button class="btn btn-ghost btn-sm" aria-label="সংরক্ষণ" onclick="SubjGrid.saveRow('${esc(s.id)}')">${icon('save')}</button></td>
        <td class="text-center"><button class="btn btn-ghost btn-sm" aria-label="${s.active === false ? 'চালু করুন' : 'বন্ধ করুন'}" onclick="Subjects.toggle('${esc(s.id)}')">${icon(s.active === false ? 'eye' : 'eye-off')}</button></td>
        <td class="text-center">${used ? '' : `<button class="btn btn-ghost btn-sm text-red-600" aria-label="মুছুন" onclick="Subjects.del('${esc(s.id)}')">${icon('trash-2')}</button>`}</td>` : ''}</tr>`;
    };
    const addRow = can ? `<tr data-subj=""><td><input class="xg-edit font-mono uppercase" name="code" maxlength="6" placeholder="কোড" style="min-width:5rem"></td><td><input class="xg-edit" name="name" placeholder="নতুন বিষয়"></td><td><input class="xg-edit" name="nameEn" lang="en"></td><td><select class="xg-edit sg-kind" name="kind">${this.KINDS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></td><td></td>${CP.map(() => '<td></td>').join('')}<td colspan="3" class="text-center"><button class="btn btn-primary btn-sm" onclick="SubjGrid.add()">${icon('plus')} যোগ</button></td></tr>` : '';
    return css + CP.map(cp => `<datalist id="sg-opts-${esc(cp.id)}">${Object.keys(this._opts[cp.id]).map(l => `<option value="${esc(l)}"></option>`).join('')}</datalist>`).join('')
      + `<h3 class="font-semibold text-lg mb-2" id="set-subjects">বিষয়সমূহ</h3>` + this.groupsPanel(can) + `
      <div class="xg-wrap"><table class="xg w-full" style="min-width:${50 + CP.length * 34}rem"><thead><tr><th>বিষয় কোড</th><th>বিষয়ের নাম (বাংলা)</th><th>ইংরেজি নাম</th><th>ধরন</th><th>গুচ্ছ</th>${CP.map(cp => `<th>প্রযোজ্য শ্রেণি ও বিভাগ/শাখা${CP.length > 1 ? ` — ${esc(cp.short || cp.name)}` : ''}</th>`).join('')}${can ? '<th>সংরক্ষণ</th><th>বন্ধ</th><th>মুছুন</th>' : ''}</tr></thead>
      <tbody>${S.map(row).join('')}${addRow}</tbody></table></div>`;
  },
  CSS() {
    return `<style>${typeof XG_CSS !== 'undefined' ? XG_CSS : ''}
      .sg-chip{display:inline-flex;align-items:center;gap:.25rem;background:var(--xg-chip);border:1px solid var(--xg-bd);border-radius:999px;padding:.05rem .2rem .05rem .6rem;margin:.1rem .15rem .1rem 0;white-space:nowrap}
      .sg-chip button{width:1.6rem;height:1.6rem;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;color:var(--xg-mut)}.sg-chip button:hover{background:var(--xg-bad);color:#b91c1c}
      .sg-chip .sg-lab{width:auto;height:auto;border-radius:0;color:inherit}.sg-chip .sg-lab:hover{background:transparent;color:inherit;text-decoration:underline}
      .sg-apply{white-space:normal !important;min-width:26rem}.sg-kind{min-width:8.5rem}.sg-off td{opacity:.55}
      .sg-sec>summary{list-style:none;cursor:pointer}.sg-sec>summary::-webkit-details-marker{display:none}.sg-sec[open]>summary .sg-car{transform:rotate(90deg)}.sg-car{transition:transform .15s}</style>`;
  },
  /** One subject row; CS = the classes of the section (chips and typeahead limited to them). */
  rowHtml(s, o) {
    const { can, dis, CP, groups, open, CS, key } = o, k = this.kindOf(s), g = this.groupOf(s), used = Subjects.used(s.id), inCS = cid => !CS || CS.has(cid);
    return `<tr data-subj="${esc(s.id)}" class="${s.active === false ? 'sg-off' : ''}">
      <td><div class="flex items-center gap-1"><span class="font-mono font-semibold">${esc(this.code(s))}</span>${can ? `<button class="btn btn-ghost btn-sm !px-1" title="কোড বদল" aria-label="কোড বদল" onclick="SubjGrid.changeCode('${esc(s.id)}')">${icon('pencil-line', 'w-4 h-4')}</button>` : ''}</div></td>
      <td><input class="xg-edit" name="name" value="${esc(s.name)}" style="min-width:9rem" aria-label="বিষয়ের নাম" ${dis}></td>
      <td><input class="xg-edit" name="nameEn" value="${esc(s.nameEn || '')}" lang="en" style="min-width:8rem" aria-label="ইংরেজি নাম" ${dis}></td>
      <td><select class="xg-edit sg-kind" aria-label="ধরন" ${dis} onchange="SubjGrid.setKind('${esc(s.id)}',this.value)">${this.KINDS.map(([v, l]) => `<option value="${v}" ${k === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
      <td><select class="xg-edit sg-kind" aria-label="গুচ্ছ" ${dis} onchange="SubjGrid.setGroup('${esc(s.id)}',this.value)"><option value="">— নেই —</option>${groups.map(n => `<option value="${esc(n)}" ${['fourth', 'group'].includes(k) && g === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></td>
      ${CP.map(cp => { const ch = this.chips(s.id).filter(x => { const c = DB.cls(x.split('|')[0]); return c?.campusId === cp.id && inCS(c.id); }), oc = open.startsWith(s.id + '|') ? DB.cls(open.slice(s.id.length + 1)) : null;
        return `<td class="sg-apply">${ch.map(x => `<span class="sg-chip"><button type="button" class="sg-lab" aria-label="${esc(this.label(x))} — শাখা ও বিভাগ" onclick="App.ui.sgOpen='${esc(s.id)}|${esc(x.split('|')[0])}';App.refresh()">${esc(this.label(x))}</button>${can ? `<button type="button" aria-label="${esc(this.label(x))} সরান" onclick="SubjGrid.delChip('${esc(s.id)}','${esc(x)}')">${icon('x', 'w-4 h-4')}</button>` : ''}</span>`).join('')}${can ? `<input class="xg-edit" list="sg-o-${esc(key)}-${esc(cp.id)}" style="width:10rem;display:inline-block" aria-label="শ্রেণি, শাখা বা বিভাগ যোগ করুন" placeholder="+ যোগ করুন" onchange="SubjGrid.pick('${esc(s.id)}',this,'${esc(key)}-${esc(cp.id)}')">` : ''}${can && oc && oc.campusId === cp.id && inCS(oc.id) ? this.detail(s.id, oc) : ''}</td>`; }).join('')}
      ${can ? `<td class="text-center"><button class="btn btn-ghost btn-sm" aria-label="সংরক্ষণ" onclick="SubjGrid.saveRow('${esc(s.id)}')">${icon('save')}</button></td>
      <td class="text-center"><button class="btn btn-ghost btn-sm" aria-label="${s.active === false ? 'চালু করুন' : 'বন্ধ করুন'}" onclick="Subjects.toggle('${esc(s.id)}')">${icon(s.active === false ? 'eye' : 'eye-off')}</button></td>
      <td class="text-center">${used ? '' : `<button class="btn btn-ghost btn-sm text-red-600" aria-label="মুছুন" onclick="Subjects.del('${esc(s.id)}')">${icon('trash-2')}</button>`}</td>` : ''}</tr>`;
  },
  table(rows, o, addRow = '') {
    const { can, CP } = o;
    return `<div class="xg-wrap"><table class="xg w-full" style="min-width:${44 + CP.length * 28}rem"><thead><tr><th>বিষয় কোড</th><th>বিষয়ের নাম (বাংলা)</th><th>ইংরেজি নাম</th><th>ধরন</th><th>গুচ্ছ</th>${CP.map(cp => `<th>প্রযোজ্য শ্রেণি ও বিভাগ/শাখা${CP.length > 1 ? ` — ${esc(cp.short || cp.name)}` : ''}</th>`).join('')}${can ? '<th>সংরক্ষণ</th><th>বন্ধ</th><th>মুছুন</th>' : ''}</tr></thead><tbody>${rows}${addRow}</tbody></table></div>`;
  },
  addRowHtml(o, classes, group) {
    const { CP } = o;
    return `<tr data-subj="" data-classes="${esc(classes.join(','))}" data-group="${esc(group || '')}"><td><input class="xg-edit font-mono uppercase" name="code" maxlength="6" placeholder="কোড" style="min-width:5rem" aria-label="কোড"></td><td><input class="xg-edit" name="name" placeholder="নতুন বিষয়" aria-label="নতুন বিষয়ের নাম"></td><td><input class="xg-edit" name="nameEn" lang="en" aria-label="ইংরেজি নাম"></td><td>${group ? '' : `<select class="xg-edit sg-kind" name="kind" aria-label="ধরন">${this.KINDS.filter(([v]) => v === 'core' || v === 'elective').map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`}</td><td>${group ? esc(group) : ''}</td>${CP.map(() => '<td></td>').join('')}<td colspan="3" class="text-center"><button class="btn btn-primary btn-sm" onclick="SubjGrid.add()">${icon('plus')} যোগ</button></td></tr>`;
  },
  secToggle(key, on) { (App.ui.sgSec || (App.ui.sgSec = {}))[key] = on; },
  /** Collapsible sections per level (and a section for subjects not yet given to any class); choice groups inside as their own sub-sections. */
  sectioned(can, dis, CP, groups, open) {
    const lv = DB.s.levels || [], C = DB.s.classes, q = String(App.ui.sgQ || '').trim().toLowerCase(), st = App.ui.sgSec || (App.ui.sgSec = {});
    const match = s => !q || [this.code(s), s.name, s.nameEn].some(x => String(x || '').toLowerCase().includes(q));
    const secs = [...lv.map(l => ({ key: l.id, name: l.name, cls: C.filter(c => c.level === l.id) })), { key: 'none', name: 'স্তরবিহীন শ্রেণি', cls: C.filter(c => !lv.some(l => l.id === c.level)) }].filter(x => x.cls.length);
    const unassigned = DB.s.subjects.filter(s => !this.chips(s.id).length);
    const G = this.groups(), o0 = { can, dis, CP, groups, open };
    this._opts = {};
    let lists = '';
    const sec = (x, subs) => {
      const CS = x.cls ? new Set(x.cls.map(c => c.id)) : null, o = { ...o0, CS, key: x.key };
      CP.forEach(cp => { const m = Object.fromEntries(this.options(cp.id).filter(k => !CS || CS.has(k.split('|')[0])).map(k => [this.label(k), k])); this._opts[`${x.key}-${cp.id}`] = m; lists += `<datalist id="sg-o-${esc(x.key)}-${esc(cp.id)}">${Object.keys(m).map(l => `<option value="${esc(l)}"></option>`).join('')}</datalist>`; });
      const inGroup = s => ['fourth', 'group'].includes(this.kindOf(s)) && this.groupOf(s);
      const plain = subs.filter(s => !inGroup(s)), hitPlain = plain.filter(match);
      const gs = G.filter(g => subs.some(s => inGroup(s) && this.groupOf(s) === g.name) || this.secIn(g.name, x.key));
      const gHtml = gs.map(g => {
        const mem = subs.filter(s => inGroup(s) && this.groupOf(s) === g.name), hit = mem.filter(match), gk = 'g:' + g.name, isOpen = q ? hit.length > 0 : !!st[gk];
        if (q && !hit.length) return '';
        const others = DB.s.subjects.filter(s => this.groupOf(s) !== g.name || !inGroup(s));
        return `<details class="sg-sec card mt-3 ml-0 sm:ml-4" ${isOpen ? 'open' : ''} ontoggle="SubjGrid.secToggle(${esc(JSON.stringify(gk))},this.open)"><summary class="px-4 py-3 flex flex-wrap items-center gap-2">${icon('chevron-right', 'w-4 h-4 sg-car')}${icon('layers', 'w-4 h-4 text-brand-600')}<b>${esc(g.name)}</b>${badge(g.fourth ? 'চতুর্থ বিষয়' : g.religion ? 'ধর্ম অনুযায়ী' : 'একটি বেছে নিন', g.fourth ? 'violet' : 'blue')}<span class="text-slate-500">${bnNum(mem.length)}টি বিষয়</span></summary>
          <div class="px-4 pb-4">${can ? `<div class="flex flex-wrap items-center gap-2 mb-3"><input class="input !py-1 !w-56" value="${esc(g.name)}" aria-label="গুচ্ছের নাম" onchange="SubjGrid.renameGroup(${esc(JSON.stringify(g.name))},this.value)">${this.typeSel(g, `class="select !py-1 !w-auto" aria-label="গুচ্ছের ধরন" onchange="SubjGrid.setGroupType(${esc(JSON.stringify(g.name))},this.value)"`)}
            <select class="select !py-1 !w-auto" aria-label="গুচ্ছে বিষয় যুক্ত করুন" onchange="if(this.value)SubjGrid.setGroup(this.value,${esc(JSON.stringify(g.name))})"><option value="">+ বিদ্যমান বিষয় যুক্ত করুন</option>${others.map(s => `<option value="${esc(s.id)}">${esc(this.code(s))} · ${esc(s.name)}</option>`).join('')}</select>
            <button class="btn btn-ghost btn-sm" onclick="App.ui.sgAdd=${esc(JSON.stringify(gk))};App.refresh()">${icon('plus')} বিষয় যোগ</button><button class="btn btn-ghost btn-sm text-red-600 ml-auto" onclick="SubjGrid.delGroup(${esc(JSON.stringify(g.name))})">${icon('trash-2')} গুচ্ছ মুছুন</button></div>` : ''}
            ${this.table((q ? hit : mem).map(s => this.rowHtml(s, o)).join(''), o, can && App.ui.sgAdd === gk ? this.addRowHtml(o, x.cls ? x.cls.map(c => c.id) : [], g.name) : '')}</div></details>`;
      }).join('');
      const anyHit = hitPlain.length || gHtml;
      if (q && !anyHit) return '';
      const isOpen = q ? true : (st[x.key] ?? x === secs[0]);
      return `<details class="sg-sec card mb-4" ${isOpen ? 'open' : ''} ontoggle="SubjGrid.secToggle(${esc(JSON.stringify(x.key))},this.open)"><summary class="px-5 py-3 flex flex-wrap items-center gap-2">${icon('chevron-right', 'w-5 h-5 sg-car')}<b class="text-lg">${esc(x.name)}</b><span class="text-slate-500">${x.cls ? esc(x.cls.map(c => this.short(c)).filter((v, i, a) => a.indexOf(v) === i).join(', ')) : ''} · ${bnNum(subs.length)}টি বিষয়</span></summary>
        <div class="px-4 pb-4">${can ? `<div class="flex flex-wrap gap-2 mb-3"><button class="btn btn-ghost btn-sm" onclick="App.ui.sgAdd=${esc(JSON.stringify(x.key))};App.refresh()">${icon('plus')} বিষয় যোগ</button><button class="btn btn-ghost btn-sm" onclick="App.ui.sgGAdd=${esc(JSON.stringify(x.key))};App.refresh()">${icon('layers')} গুচ্ছ যোগ</button></div>
          ${App.ui.sgGAdd === x.key ? `<form class="flex flex-wrap gap-2 items-center mb-3" onsubmit="SubjGrid.addGroup(this);return false"><input type="hidden" name="sec" value="${esc(x.key)}"><input class="input !py-1 !w-56" name="name" placeholder="নতুন গুচ্ছের নাম" aria-label="নতুন গুচ্ছের নাম" required>${this.typeSel({}, 'class="select !py-1 !w-auto" name="type" aria-label="ধরন"')}<button class="btn btn-primary btn-sm">${icon('plus')} তৈরি করুন</button></form>` : ''}` : ''}
          ${hitPlain.length || App.ui.sgAdd === x.key ? this.table(hitPlain.map(s => this.rowHtml(s, o)).join(''), o, can && App.ui.sgAdd === x.key ? this.addRowHtml(o, x.cls ? x.cls.map(c => c.id) : []) : '') : ''}${gHtml}</div></details>`;
    };
    const body = secs.map(x => sec(x, DB.s.subjects.filter(s => this.chips(s.id).some(k => x.cls.some(c => c.id === k.split('|')[0]))))).join('')
      + (unassigned.length || App.ui.sgAdd === 'unassigned' ? sec({ key: 'unassigned', name: 'কোনো শ্রেণিতে নির্ধারিত নয়', cls: null }, unassigned) : '');
    return this.CSS() + `<div class="flex flex-wrap items-center gap-2 mb-4"><input id="sg-q" class="input !w-72" type="search" placeholder="বিষয় খুঁজুন…" aria-label="বিষয় খুঁজুন" value="${esc(App.ui.sgQ || '')}" oninput="App.ui.sgQ=this.value;clearTimeout(window.__sgT);window.__sgT=setTimeout(()=>{App.ui.sgFocus=true;App.refresh()},250)">${can ? `<button class="btn btn-ghost" onclick="App.ui.sgAdd='unassigned';App.ui.sgSec.unassigned=true;App.refresh()">${icon('plus')} শ্রেণি ছাড়া বিষয় যোগ</button>` : ''}</div>` + lists + (body || `<div class="card">${emptyState('কিছু পাওয়া যায়নি।', 'search')}</div>`);
  },
  mount() { if (App.ui.sgFocus) { App.ui.sgFocus = false; const i = $('#sg-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } } },
};
Settings.subjects = () => SubjGrid.editor();

/* ---------------- শ্রেণি কাঠামো: per session × campus, one spreadsheet ---------------- */
const Struct = {
  ui() { const u = App.ui.stU || (App.ui.stU = {}); if (!DB.s.sessions.some(s => s.id === u.ses)) u.ses = DB.session(); if (!DB.s.campuses.some(c => c.id === u.campus)) u.campus = DB.campusId(); return u; },
  active() { return this.ui().ses === DB.session(); },
  own(ses) { return ses === DB.session() || !!DB.s.sessionStore?.[ses]?.classes; },
  /** The class list of a session; create = give that session its own copy before the first change. */
  list(ses, create) {
    if (ses === DB.session()) return DB.s.classes;
    const st = DB.s.sessionStore[ses] || (create ? (DB.s.sessionStore[ses] = {}) : null);
    if (st?.classes) return st.classes;
    if (!create) return DB.s.classes;
    return (st.classes = JSON.parse(JSON.stringify(DB.s.classes)));
  },
  rows() { const u = this.ui(), L = this.list(u.ses), lv = DB.s.levels || [], li = c => { const i = lv.findIndex(l => l.id === c.level); return i < 0 ? 99 : i; }; return L.filter(c => c.campusId === u.campus).sort((a, b) => li(a) - li(b) || (+a.grade || 0) - (+b.grade || 0)); },
  edit(cid, fn, msg) {
    const u = this.ui(), c = this.list(u.ses, true).find(x => x.id === cid); if (!c) return;
    if (fn(c) === false) return;
    DB.audit('CLASS_STRUCTURE', 'classes', `${u.ses}/${u.campus} ${cid}: ${msg || ''}`); DB.save(); App.refresh();
  },
  tLabel(t) { return `${pn(DB.user(t.userId)) || t.id} · ${t.id}`; },
  tName(id) { const t = DB.teacher(id); return t ? this.tLabel(t) : ''; },
  tid(v) { v = String(v || '').trim(); if (!v) return ''; const m = v.match(/·\s*(\S+)$/); const id = m ? m[1] : v; return DB.teacher(id) ? id : null; },
  setField(cid, k, v) {
    v = String(v ?? '').trim();
    if (k === 'name' && !v) return toast('শ্রেণির নাম আবশ্যক।', 'error');
    this.edit(cid, c => { c[k] = k === 'grade' ? +v || 0 : k === 'level' ? v || null : v; }, `${k}=${v}`);
  },
  setTeacher(cid, slot, v) {
    const id = this.tid(v); if (id === null) return toast('তালিকা থেকে একজন শিক্ষক বেছে নিন।', 'error');
    this.edit(cid, c => {
      if (slot === 'class') c.classTeacherId = id || null;
      else if (slot.startsWith('sec:')) { const s = slot.slice(4); c.sectionTeachers = c.sectionTeachers || {}; if (id) c.sectionTeachers[s] = id; else delete c.sectionTeachers[s]; }
      else if (slot.startsWith('bt:')) { const b = (c.batches || []).find(x => x.id === slot.slice(3)); if (b) b.teacherId = id || null; }
    }, `teacher ${slot}=${id || '—'}`);
  },
  addSec(cid, v) {
    v = String(v || '').trim().toUpperCase(); if (!v) return;
    this.edit(cid, c => { c.sections = c.sections || []; if (c.sections.includes(v)) { toast('এই শাখা আগে থেকেই আছে।', 'warn'); return false; } c.sections.push(v); }, `section + ${v}`);
  },
  delSec(cid, v) {
    if (this.active() && DB.studentsIn(cid, v).length) return toast(`${v} শাখায় এখনো শিক্ষার্থী রয়েছে — অপসারণের আগে তাদের স্থানান্তর করুন।`, 'error');
    this.edit(cid, c => { c.sections = (c.sections || []).filter(x => x !== v); if (c.sectionTeachers) delete c.sectionTeachers[v]; }, `section − ${v}`);
  },
  addStream(cid, v) { v = String(v || '').trim(); if (!v) return; this.edit(cid, c => { c.streams = c.streams || []; if (c.streams.includes(v)) return false; c.streams.push(v); c.streamLabel = c.streamLabel || 'বিভাগ'; }, `stream + ${v}`); },
  delStream(cid, v) { this.edit(cid, c => { c.streams = (c.streams || []).filter(x => x !== v); }, `stream − ${v}`); },
  addBatch(cid, v) { v = String(v || '').trim(); if (!v) return; this.edit(cid, c => { (c.batches = c.batches || []).push({ id: DB.id('BT'), name: v, time: '', teacherId: null, capacity: null }); }, `batch + ${v}`); },
  delBatch(cid, bid) { this.edit(cid, c => { c.batches = (c.batches || []).filter(b => b.id !== bid); }, `batch − ${bid}`); },
  addClass() {
    const tr = $('[data-stnew]'), v = n => tr?.querySelector(`[name=${n}]`)?.value.trim() || '', u = this.ui();
    const id = v('id').toUpperCase(), name = v('name');
    if (!/^[A-Z0-9-]{2,12}$/.test(id)) return toast('শ্রেণি আইডি ২–১২টি ইংরেজি অক্ষর, অঙ্ক বা হাইফেন হতে হবে।', 'error');
    if (!name) return toast('শ্রেণির নাম আবশ্যক।', 'error');
    const L = this.list(u.ses, true); if (L.some(c => c.id === id) || (!this.active() && DB.cls(id) && DB.cls(id).campusId !== u.campus)) return toast('এই শ্রেণি আইডি ইতোমধ্যে বিদ্যমান।', 'error');
    L.push({ id, campusId: u.campus, name, grade: +v('grade') || 0, level: v('level') || null, sections: ['ক'], sectionTeachers: {}, shift: DB.s.school.shifts?.[0]?.id || '', capacity: DB.s.school.sectionCapacity || 40, classTeacherId: null, streams: [], streamLabel: null, batches: [], mentors: [] });
    if (!DB.s.feeConfigs.some(f => f.classId === id && f.session === u.ses)) DB.s.feeConfigs.push({ session: u.ses, campusId: u.campus, classId: id, tuition: 0, admissionFee: 0, examFee: 0 });
    DB.audit('CLASS_CREATE', 'classes', `${u.ses}/${u.campus} ${id} ${name}`); DB.save(); toast(`${name} তৈরি করা হয়েছে।`, 'success'); App.refresh();
  },
  delClass(cid) {
    const u = this.ui();
    if (this.active() && DB.s.students.some(s => s.classId === cid)) return toast('এই শ্রেণিতে শিক্ষার্থী রয়েছে — মোছা যাবে না।', 'error');
    if (!confirm('এই শ্রেণিটি এই শিক্ষাবর্ষের কাঠামো থেকে মুছে ফেলবেন?')) return;
    const L = this.list(u.ses, true), i = L.findIndex(c => c.id === cid); if (i >= 0) L.splice(i, 1);
    DB.audit('CLASS_DELETE', 'classes', `${u.ses}/${u.campus} ${cid}`); DB.save(); App.refresh();
  },
  /** Copy the structure of another session / campus into the selected one (replaces it). */
  clone(f) {
    const d = formData(f), u = this.ui(), from = d.ses, fc = d.campus;
    if (from === u.ses && fc === u.campus) return toast('উৎস ও লক্ষ্য একই।', 'error');
    const src = this.list(from).filter(c => c.campusId === fc); if (!src.length) return toast('উৎসে কোনো শ্রেণি নেই।', 'error');
    if (!confirm(`${DB.s.sessions.find(s => s.id === from)?.name || from} · ${DB.campus(fc)?.name}-এর কাঠামো দিয়ে বর্তমান কাঠামো প্রতিস্থাপন করবেন?`)) return;
    const L = this.list(u.ses, true), same = fc === u.campus, ids = new Set(L.map(c => c.id));
    const copy = src.map(c => { const x = JSON.parse(JSON.stringify(c)); if (!same) { let id = `${c.id}-${u.campus}`; while (ids.has(id) || DB.cls(id)) id += 'X'; ids.add(id); x.id = id; x.campusId = u.campus; const ok = t => t && DB.teacher(t)?.campusId === u.campus; x.classTeacherId = ok(x.classTeacherId) ? x.classTeacherId : null; Object.keys(x.sectionTeachers || {}).forEach(k => { if (!ok(x.sectionTeachers[k])) delete x.sectionTeachers[k]; }); (x.batches || []).forEach(b => { if (!ok(b.teacherId)) b.teacherId = null; }); x.mentors = (x.mentors || []).filter(ok); } return x; });
    const keep = new Set(copy.map(c => c.id)), gone = L.filter(c => c.campusId === u.campus && !keep.has(c.id));
    if (this.active() && gone.some(c => DB.s.students.some(s => s.classId === c.id && s.status === 'active'))) return toast('বর্তমান কাঠামোর কিছু শ্রেণিতে শিক্ষার্থী আছে, যা উৎসে নেই — কপি করা যাবে না।', 'error');
    for (let i = L.length - 1; i >= 0; i--) if (L[i].campusId === u.campus) L.splice(i, 1);
    L.push(...copy);
    copy.forEach(c => { if (!DB.s.feeConfigs.some(f => f.classId === c.id && f.session === u.ses)) { const f0 = DB.s.feeConfigs.find(f => f.session === from && f.classId === src.find(s => s.name === c.name)?.id); DB.s.feeConfigs.push({ session: u.ses, campusId: u.campus, classId: c.id, tuition: f0?.tuition || 0, admissionFee: f0?.admissionFee || 0, examFee: f0?.examFee || 0 }); } });
    DB.audit('CLASS_STRUCTURE_CLONE', 'classes', `${from}/${fc} → ${u.ses}/${u.campus}: ${copy.length}`); DB.save();
    toast(`${bnNum(copy.length)}টি শ্রেণির কাঠামো কপি হয়েছে।`, 'success'); App.refresh();
  },
  editor() {
    const u = this.ui(), can = Settings.canEdit(), dis = can ? '' : 'disabled', R = this.rows(), lv = DB.s.levels || [], T = DB.teachersIn(u.campus), act = this.active();
    const tIn = (cid, slot, val, w = '11rem') => `<input class="xg-edit" list="st-teachers" value="${esc(this.tName(val))}" style="min-width:${w}" aria-label="শিক্ষক" ${dis} onchange="Struct.setTeacher('${esc(cid)}','${esc(slot)}',this.value)">`;
    const chip = (label, del, extra = '') => `<span class="sg-chip">${esc(label)}${extra}${can ? `<button type="button" aria-label="${esc(label)} সরান" onclick="${del}">${icon('x', 'w-4 h-4')}</button>` : ''}</span>`;
    const addIn = (ph, fn, list = '') => can ? `<input class="xg-edit" ${list ? `list="${list}"` : ''} style="width:8rem;display:inline-block" placeholder="${ph}" aria-label="${ph}" onchange="${fn}">` : '';
    const sesPills = `<div class="flex flex-wrap gap-2">${DB.s.sessions.map(s => `<button class="pill ${s.id === u.ses ? 'pill-on' : ''}" onclick="Struct.ui().ses='${esc(s.id)}';App.refresh()">${esc(bnNum(s.name))} ${s.id === DB.session() ? badge('সক্রিয়', 'green') : s.status === 'planning' ? badge('খসড়া', 'blue') : ''}</button>`).join('')}</div>`;
    const campPills = DB.s.campuses.length > 1 ? `<div class="flex flex-wrap gap-2 mt-3">${DB.s.campuses.map(c => `<button class="pill ${c.id === u.campus ? 'pill-on' : ''}" onclick="Struct.ui().campus='${esc(c.id)}';App.refresh()">${icon('school', 'w-4 h-4')} ${esc(c.name)}</button>`).join('')}</div>` : '';
    const cloneF = can ? `<form class="flex flex-wrap items-end gap-2 mt-4" onsubmit="Struct.clone(this);return false"><div><label class="label" for="st-cs">কপির উৎস — শিক্ষাবর্ষ</label><select id="st-cs" class="select" name="ses">${DB.s.sessions.map(s => `<option value="${esc(s.id)}" ${s.id === DB.session() ? 'selected' : ''}>${esc(bnNum(s.name))}</option>`).join('')}</select></div>${DB.s.campuses.length > 1 ? `<div><label class="label" for="st-cc">ক্যাম্পাস</label><select id="st-cc" class="select" name="campus">${DB.s.campuses.map(c => `<option value="${esc(c.id)}" ${c.id === u.campus ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>` : `<input type="hidden" name="campus" value="${esc(u.campus)}">`}<button class="btn btn-ghost">${icon('copy')} কাঠামো কপি করুন</button></form>` : '';
    const row = c => `<tr data-st="${esc(c.id)}">
      <td><select class="xg-edit sg-kind" aria-label="স্তর" ${dis} onchange="Struct.setField('${esc(c.id)}','level',this.value)"><option value="">—</option>${lv.map(l => `<option value="${esc(l.id)}" ${l.id === c.level ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></td>
      <td><input class="xg-edit" value="${esc(c.name)}" style="min-width:9rem" aria-label="শ্রেণির নাম" ${dis} onchange="Struct.setField('${esc(c.id)}','name',this.value)"><div class="font-mono" style="color:var(--xg-mut)">${esc(c.id)}</div></td>
      <td><input class="xg-edit" type="number" value="${esc(c.grade ?? '')}" style="width:4.5rem" aria-label="ক্রম" ${dis} onchange="Struct.setField('${esc(c.id)}','grade',this.value)"></td>
      <td><select class="xg-edit sg-kind" aria-label="শিফট" ${dis} onchange="Struct.setField('${esc(c.id)}','shift',this.value)"><option value="">—</option>${(DB.s.school.shifts || []).map(sh => `<option value="${esc(sh.id)}" ${sh.id === c.shift ? 'selected' : ''}>${esc(bn(sh.name))}</option>`).join('')}</select></td>
      <td class="sg-apply" style="min-width:24rem">${(c.sections || []).map(x => `<div class="flex items-center gap-1 mb-1">${chip(x, `Struct.delSec('${esc(c.id)}','${esc(x)}')`)}${tIn(c.id, 'sec:' + x, c.sectionTeachers?.[x])}</div>`).join('')}${addIn('+ শাখা', `Struct.addSec('${esc(c.id)}',this.value)`)}</td>
      <td class="sg-apply" style="min-width:14rem">${(c.streams || []).map(x => chip(x, `Struct.delStream('${esc(c.id)}','${esc(x)}')`)).join('')}${addIn('+ বিভাগ', `Struct.addStream('${esc(c.id)}',this.value)`, 'st-streams')}</td>
      <td class="sg-apply" style="min-width:24rem">${(c.batches || []).map(b => `<div class="flex items-center gap-1 mb-1">${chip(b.name, `Struct.delBatch('${esc(c.id)}','${esc(b.id)}')`)}${tIn(c.id, 'bt:' + b.id, b.teacherId)}</div>`).join('')}${addIn('+ ব্যাচ', `Struct.addBatch('${esc(c.id)}',this.value)`)}</td>
      <td>${tIn(c.id, 'class', c.classTeacherId, '12rem')}</td>
      ${act ? `<td class="text-center">${bnNum(DB.studentsIn(c.id).length)}</td>` : ''}
      ${can ? `<td class="text-center"><button class="btn btn-ghost btn-sm text-red-600" aria-label="মুছুন" onclick="Struct.delClass('${esc(c.id)}')">${icon('trash-2')}</button></td>` : ''}</tr>`;
    const add = can ? `<tr data-stnew><td><select class="xg-edit sg-kind" name="level" aria-label="স্তর"><option value="">—</option>${lv.map(l => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select></td><td><input class="xg-edit" name="name" placeholder="নতুন শ্রেণির নাম" aria-label="নতুন শ্রেণির নাম"><input class="xg-edit font-mono uppercase" name="id" placeholder="আইডি" aria-label="শ্রেণি আইডি" maxlength="12"></td><td><input class="xg-edit" type="number" name="grade" style="width:4.5rem" aria-label="ক্রম"></td><td colspan="${act ? 6 : 5}"></td><td class="text-center"><button class="btn btn-primary btn-sm" onclick="Struct.addClass()">${icon('plus')} যোগ</button></td></tr>` : '';
    return `<style>${typeof XG_CSS !== 'undefined' ? XG_CSS : ''}.sg-chip{display:inline-flex;align-items:center;gap:.25rem;background:var(--xg-chip);border:1px solid var(--xg-bd);border-radius:999px;padding:.05rem .2rem .05rem .6rem;margin:.1rem .15rem .1rem 0;white-space:nowrap}.sg-chip button{width:1.6rem;height:1.6rem;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;color:var(--xg-mut)}.sg-chip button:hover{background:var(--xg-bad);color:#b91c1c}.sg-apply{white-space:normal !important}.sg-kind{min-width:8.5rem}</style>
      <datalist id="st-teachers">${T.map(t => `<option value="${esc(this.tLabel(t))}"></option>`).join('')}</datalist><datalist id="st-streams">${(typeof STREAM_PRESETS !== 'undefined' ? STREAM_PRESETS : []).map(x => `<option value="${esc(x)}"></option>`).join('')}</datalist>
      <div class="card p-4 mb-5">${sesPills}${campPills}${!this.own(u.ses) ? `<div class="mt-3">${badge('সক্রিয় শিক্ষাবর্ষের কাঠামো দেখানো হচ্ছে — প্রথম পরিবর্তনে এই শিক্ষাবর্ষের নিজস্ব কপি তৈরি হবে', 'blue')}</div>` : ''}${cloneF}</div>
      ${act && typeof ClassSets !== 'undefined' && u.campus === DB.campusId() ? ClassSets.card() : ''}
      <div class="xg-wrap mb-6"><table class="xg w-full" style="min-width:110rem"><thead><tr><th>স্তর</th><th>শ্রেণি</th><th>ক্রম</th><th>শিফট</th><th>শাখা ও শাখা শিক্ষক</th><th>বিভাগ / গ্রুপ</th><th>ব্যাচ ও ব্যাচ শিক্ষক</th><th>শ্রেণি শিক্ষক</th>${act ? '<th>শিক্ষার্থী</th>' : ''}${can ? '<th>মুছুন</th>' : ''}</tr></thead><tbody>${R.map(row).join('')}${add}</tbody></table></div>
      <a class="btn btn-ghost" href="${App.href(App.route.portal, 'set-subjects')}">${icon('book-marked')} বিষয় বিন্যাস</a>`;
  },
};
Settings.levelsCard = function () {
  const can = this.canEdit(), lv = this.levels();
  return `<div class="card mb-2"><div class="px-5 py-3 border-b border-slate-100 font-semibold">স্তরসমূহ</div><form class="p-4 space-y-2" onsubmit="Settings.saveLevels(this);return false">${lv.map(l => `<div class="flex items-center gap-2" data-lv="${esc(l.id)}"><input class="input !py-1" name="name" value="${esc(l.name)}" aria-label="স্তরের নাম" ${can ? '' : 'disabled'}><span class="whitespace-nowrap">${bnNum(DB.s.classes.filter(c => c.level === l.id).length)}টি শ্রেণি</span>${can ? `<button type="button" class="btn btn-ghost btn-sm" aria-label="মুছুন" onclick="Settings.delLevel('${esc(l.id)}')">${icon('trash-2')}</button>` : ''}</div>`).join('')}
    ${can ? `<div class="flex flex-wrap gap-1.5 pt-2">${(typeof LEVEL_PRESETS !== 'undefined' ? LEVEL_PRESETS : []).filter(n => !lv.some(l => l.name === n)).map(n => `<button type="button" class="pill" onclick="Settings.addLevel('${esc(n)}')">${icon('plus', 'w-4 h-4')} ${esc(n)}</button>`).join('')}<button type="button" class="pill" onclick="Settings.addLevel('__custom')">${icon('plus', 'w-4 h-4')} কাস্টম</button></div><button class="btn btn-primary btn-sm mt-3">${icon('save')} নাম সংরক্ষণ করুন</button>` : ''}</form></div>`;
};
Settings.structure = () => Struct.editor();

/* ---------------- শিক্ষাবর্ষ, সেমিস্টার ও একাডেমিক নীতি (one page) ---------------- */
Object.assign(Settings, {
  sesDate(id, k, v) { const s = DB.s.sessions.find(x => x.id === id); if (!s) return; s[k] = v || null; DB.audit('SESSION_DATES', 'sessions', `${id} ${k}=${v}`); DB.save(); },
  sesName(id, v) { const s = DB.s.sessions.find(x => x.id === id); if (!s || !String(v).trim()) return App.refresh(); s.name = String(v).trim(); this.save('শিক্ষাবর্ষ সংরক্ষিত হয়েছে।', `session ${id} name`); },
  acadpolicy() {
    const s = DB.s.school, can = this.canEdit(), dis = can ? '' : 'disabled';
    const tone = { active: 'green', planning: 'blue', closed: 'slate' }, lab = { active: 'সক্রিয়', planning: 'খসড়া', closed: 'বন্ধ' };
    const ses = `<section class="mb-8"><div class="flex flex-wrap items-center gap-2 mb-3"><h3 class="font-semibold text-lg mr-auto">শিক্ষাবর্ষ</h3>${can ? `<button class="btn btn-ghost btn-sm" onclick="Settings.addSession()">${icon('plus')} শিক্ষাবর্ষ যোগ করুন</button>` : ''}</div>
      <div class="xg-wrap"><table class="xg w-full" style="min-width:46rem"><thead><tr><th>শিক্ষাবর্ষ</th><th>অবস্থা</th><th>শুরু</th><th>শেষ</th><th>শ্রেণি কাঠামো</th><th></th></tr></thead><tbody>${DB.s.sessions.map(x => `<tr>
        <td><input class="xg-edit" value="${esc(x.name)}" aria-label="শিক্ষাবর্ষের নাম" ${dis} onchange="Settings.sesName('${esc(x.id)}',this.value)"></td><td class="text-center">${badge(lab[x.status] || bn(x.status), tone[x.status])}</td>
        <td><input class="xg-edit" type="date" value="${esc(x.start || '')}" aria-label="শুরু" ${dis} onchange="Settings.sesDate('${esc(x.id)}','start',this.value)"></td><td><input class="xg-edit" type="date" value="${esc(x.end || '')}" aria-label="শেষ" ${dis} onchange="Settings.sesDate('${esc(x.id)}','end',this.value)"></td>
        <td class="text-center">${bnNum(DB.classesOf(x.id).length)}টি শ্রেণি${Struct.own(x.id) ? '' : ' (সক্রিয়টির মতো)'}</td>
        <td class="text-center">${x.status === 'planning' && App.has('ADMIN') ? `<button class="btn btn-ghost btn-sm" onclick="Clone.activate('${esc(x.id)}')">${icon('play')} সক্রিয় করুন</button>` : ''}</td></tr>`).join('')}</tbody></table></div></section>`;
    const shifts = `<section class="mb-8 grid lg:grid-cols-2 gap-5"><div class="card p-5"><div class="font-semibold mb-3">কর্মশিফট</div>${s.shifts.map((sh, i) => `<div class="flex flex-wrap gap-2 mb-2"><input class="input !py-1" aria-label="শিফটের নাম" value="${esc(sh.name)}" ${dis} onchange="DB.s.school.shifts[${i}].name=this.value;DB.save()"><input type="time" class="input !py-1" aria-label="শুরু" value="${esc(sh.start)}" ${dis} onchange="DB.s.school.shifts[${i}].start=this.value;DB.save()"><input type="time" class="input !py-1" aria-label="শেষ" value="${esc(sh.end)}" ${dis} onchange="DB.s.school.shifts[${i}].end=this.value;DB.save()"></div>`).join('')}${can ? `<button class="btn btn-ghost btn-sm" onclick="DB.s.school.shifts.push({id:'SH'+Date.now().toString().slice(-4),name:'সান্ধ্য',start:'15:00',end:'18:00'});Settings.save('শিফট যোগ করা হয়েছে।')">${icon('plus')} শিফট যোগ করুন</button>` : ''}</div>
      <div>${this.levelsCard()}</div></section>`;
    const sem = typeof Settings.semester === 'function' ? `<section class="mb-8 min-w-0"><h3 class="font-semibold text-lg mb-3">সেমিস্টার ও সাপ্লিমেন্টারি</h3><div class="max-w-full overflow-x-auto">${Settings.semester()}</div></section>` : '';
    return `<style>${typeof XG_CSS !== 'undefined' ? XG_CSS : ''}</style><div class="min-w-0 max-w-full">${ses}<section class="mb-8 min-w-0"><h3 class="font-semibold text-lg mb-3">একাডেমিক নীতি</h3><div class="max-w-full overflow-x-auto">${this.policy()}</div></section>${sem}${shifts}</div>`;
  },
  roomRules() {
    const s = DB.s.school, can = this.canEdit(), dis = can ? '' : 'disabled';
    return `<form id="set-rooms" class="card p-5 grid grid-cols-2 gap-3"><div class="col-span-2 font-semibold">কক্ষ বরাদ্দের নিয়ম</div><div><label class="label">কক্ষপ্রতি সর্বোচ্চ শিক্ষার্থী</label><input type="number" class="input" name="maxPerRoom" value="${esc(s.roomRules.maxPerRoom)}" ${dis}></div><div><label class="label">বেঞ্চপ্রতি পরীক্ষার আসন</label><input type="number" min="1" max="3" class="input" name="examSeatsPerBench" value="${esc(s.roomRules.examSeatsPerBench)}" ${dis}></div><label class="col-span-2 flex items-center gap-2"><input type="checkbox" name="keepLabsForPractical" ${s.roomRules.keepLabsForPractical ? 'checked' : ''} ${dis}> ব্যবহারিক ক্লাসের জন্য গবেষণাগার সংরক্ষিত রাখুন</label>${can ? '<div class="col-span-2"><button class="btn btn-primary btn-sm">নিয়ম সংরক্ষণ করুন</button></div>' : ''}</form>`;
  },
});

/* ---------------- একাডেমিক কার্যক্রম (homepage / programs page) from the academic structure ---------------- */
const AutoPrograms = {
  list() {
    const lv = DB.s.levels || [], C = DB.classesIn('ALL'), out = [];
    const make = (name, cs) => {
      if (!cs.length) return;
      const streams = [...new Set(cs.flatMap(c => c.streams || []))], subs = new Set(cs.flatMap(c => DB.classSubjects(c.id).map(s => s.id)));
      out.push({ id: 'AP-' + name, name, icon: 'graduation-cap', ages: cs.length > 1 ? `${cs[0].name} – ${cs[cs.length - 1].name}` : cs[0].name,
        desc: [[...new Set(cs.map(c => c.name))].join(', '), streams.length ? `বিভাগ: ${streams.join(', ')}` : '', subs.size ? `${bnNum(subs.size)}টি বিষয়` : ''].filter(Boolean).join(' · ') });
    };
    lv.forEach(l => make(l.name, C.filter(c => c.level === l.id)));
    make('অন্যান্য শ্রেণি', C.filter(c => !lv.some(l => l.id === c.level)));
    return out;
  },
  /** Run fn with site.programs replaced by the generated list (never saved). */
  with(fn) { const S = DB.s.site, p0 = S.programs; S.programs = this.list(); try { return fn(); } finally { S.programs = p0; } },
};
(() => {
  const s0 = Home.section.bind(Home);
  Home.section = function (x) { return x.type === 'programs' ? AutoPrograms.with(() => s0(x)) : s0(x); };
  const P = App.portals.public.pages.find(p => p.id === 'programs');
  if (P) { const r0 = P.render; P.render = function (q) { return AutoPrograms.with(() => r0.call(this, q)); }; P.when = () => AutoPrograms.list().length > 0; }
})();

/* ---------------- কক্ষ বিন্যাস: buildings → floors → rooms, seat plans and the campus map ----------------
   roomLayout = { show, campuses: { [campusId]: { buildings: [{ id, name, x, y, w, h, floors: [{ id, name, rooms: [room] }] }] } } }
   room = { id, no, name, type, capacity, pattern, perBench, rows, cols, cells: { "r-c": "x" (blocked) | "a" (aisle) } }
   `rooms` (names per campus) is kept in step, so the routine and older screens keep working. */
const ROOM_TYPES = [['class', 'শ্রেণিকক্ষ'], ['lab', 'ল্যাব'], ['office', 'অফিস'], ['hall', 'হল'], ['library', 'গ্রন্থাগার'], ['other', 'অন্যান্য']];
const SEAT_PATTERNS = [['bench', 'বেঞ্চ সারি'], ['single', 'একক বেঞ্চ'], ['mixed', 'মিশ্র'], ['floor', 'মেঝেতে বসা'], ['round', 'গোল টেবিল']];
const MAP_W = 24, MAP_H = 14, FP_W = 20, FP_H = 12;
const RoomMap = {
  cfg() { return DB.s.roomLayout || { show: false, campuses: {} }; },
  on() { return this.cfg().show === true; },
  newRoom(name, i = 0) { return { id: DB.id('RM'), no: String(101 + i), name, type: /lab|ল্যাব|গবেষণা/i.test(name) ? 'lab' : 'class', capacity: null, pattern: 'bench', perBench: 2, rows: 5, cols: 4, cells: {} }; },
  /** A campus's layout; the first time (staff) it is built from the old room list. */
  camp(cid, create) {
    const L = this.cfg(); let c = L.campuses?.[cid];
    if (!c && create) {
      if (!DB.s.roomLayout) DB.s.roomLayout = { show: false, campuses: {} };
      const R = DB.s.roomLayout; R.campuses = R.campuses || {};
      c = R.campuses[cid] = { buildings: [{ id: DB.id('BL'), name: 'প্রধান ভবন', x: 1, y: 1, w: 8, h: 5, floors: [{ id: DB.id('FL'), name: 'নিচতলা', rooms: (DB.s.rooms?.[cid] || []).map((n, i) => this.newRoom(n, i)) }] }] };
    }
    return c || { buildings: [] };
  },
  all(cid) { return this.camp(cid).buildings.flatMap(b => (b.floors || []).flatMap(f => (f.rooms || []).map(r => ({ r, f, b })))); },
  find(name, cid) {
    const hit = x => x.r.name === name || x.r.no === name || x.r.id === name;
    if (cid) { const x = this.all(cid).find(hit); if (x) return x.r; }
    for (const id of Object.keys(this.cfg().campuses || {})) { const x = this.all(id).find(hit); if (x) return x.r; }
    return null;
  },
  per(r) { return ['single', 'floor'].includes(r.pattern) ? 1 : Math.max(1, Math.min(6, +r.perBench || 1)); },
  width(r) { return Math.max(1, +r.cols || 1) * this.per(r); },
  cell(r, i, j) { return r.cells?.[`${i}-${j}`] || ''; },
  seats(r) { let n = 0; for (let i = 0; i < (+r.rows || 0); i++) for (let j = 0; j < this.width(r); j++) if (!this.cell(r, i, j)) n++; return n; },
  cap(r) { return +r.capacity || this.seats(r); },
  sync(cid) { DB.s.rooms = DB.s.rooms || {}; DB.s.rooms[cid] = this.all(cid).map(x => x.r.name).filter(Boolean); },
  ui() { const u = App.ui.rm || (App.ui.rm = {}); if (!DB.s.campuses.some(c => c.id === u.cid)) u.cid = DB.campusId(); return u; },
  done(msg) { const u = this.ui(); this.sync(u.cid); DB.audit('ROOM_LAYOUT', 'settings', msg || ''); DB.save(); if (msg) toast(msg, 'success'); App.refresh(); },
  B(id) { return this.camp(this.ui().cid, true).buildings.find(b => b.id === id); },
  R(id) { return this.all(this.ui().cid).find(x => x.r.id === id); },
  setShow(on) { if (!App.has('ADMIN')) return; if (!DB.s.roomLayout) DB.s.roomLayout = { show: false, campuses: {} }; DB.s.roomLayout.show = !!on; this.done(on ? 'ক্যাম্পাস মানচিত্র এখন সবার জন্য দৃশ্যমান।' : 'ক্যাম্পাস মানচিত্র লুকানো হয়েছে।'); },
  addBuilding() { const L = this.camp(this.ui().cid, true), n = L.buildings.length; const b = { id: DB.id('BL'), name: `ভবন ${bnNum(n + 1)}`, x: 1 + (n * 9) % (MAP_W - 6), y: 1 + Math.floor(n / 2) * 6 % (MAP_H - 4), w: 7, h: 4, floors: [{ id: DB.id('FL'), name: 'নিচতলা', rooms: [] }] }; L.buildings.push(b); this.ui().b = b.id; this.done('ভবন যোগ করা হয়েছে।'); },
  delBuilding(id) { const L = this.camp(this.ui().cid, true), b = L.buildings.find(x => x.id === id); if (!b) return; if (b.floors.some(f => f.rooms.length) && !confirm(`“${b.name}” ভবন ও এর সব কক্ষ মুছে ফেলবেন?`)) return; L.buildings = L.buildings.filter(x => x.id !== id); this.done('ভবন মুছে ফেলা হয়েছে।'); },
  step() { return this.ui().snap === false ? 0.25 : 1; },
  /** Clamp a rectangle {x,y,w,h} inside W×H. */
  fit(o, W, H) { o.w = Math.max(1, Math.min(W, o.w)); o.h = Math.max(1, Math.min(H, o.h)); o.x = Math.max(0, Math.min(W - o.w, o.x)); o.y = Math.max(0, Math.min(H - o.h, o.y)); return o; },
  setB(id, k, v) {
    const b = this.B(id); if (!b) return;
    if (k === 'name') { if (!String(v).trim()) return App.refresh(); b.name = String(v).trim(); }
    else if (k === 'rot') b.rot = (((Math.round(+v || 0)) % 360) + 360) % 360;
    else { b[k] = Math.round((+v || 0) * 4) / 4; Object.assign(b, this.fit({ x: +b.x, y: +b.y, w: +b.w, h: +b.h }, MAP_W, MAP_H)); }
    this.done();
  },
  /** Room rectangle inside its floor plan (FP_W × FP_H cells); older rooms get an automatic slot. */
  rr(r, i = 0) { return r.mw ? { x: +r.mx || 0, y: +r.my || 0, w: +r.mw, h: +r.mh || 3 } : { x: (i % 5) * 4, y: (Math.floor(i / 5) * 4) % (FP_H - 2), w: 4, h: 3 }; },
  setRect(id, k, v) { const x = this.R(id); if (!x) return; const o = this.rr(x.r, x.f.rooms.indexOf(x.r)); o[k] = Math.round((+v || 0) * 4) / 4; this.fit(o, FP_W, FP_H); Object.assign(x.r, { mx: o.x, my: o.y, mw: o.w, mh: o.h }); this.done(); },
  /** Pointer drag (mouse and touch) for a building ('b') or a room ('r'): mode 'move', 'e', 's' or 'se'. A tap without movement selects. */
  drag(ev, kind, id, mode) {
    if (ev.button > 0 || !Settings.canEdit()) return;
    const h = ev.currentTarget, el = h.closest(kind === 'b' ? '.rm-bl' : '.rm-rm'), box = el?.parentElement; if (!box) return;
    const W = kind === 'b' ? MAP_W : FP_W, H = kind === 'b' ? MAP_H : FP_H, rect = box.getBoundingClientRect();
    const x0 = kind === 'b' ? this.B(id) : this.R(id); if (!x0) return;
    const st = kind === 'b' ? { x: +x0.x, y: +x0.y, w: +x0.w, h: +x0.h } : this.rr(x0.r, x0.f.rooms.indexOf(x0.r));
    ev.preventDefault(); ev.stopPropagation();
    const s = this.step(), q = v => Math.round(v / s) * s, sx = ev.clientX, sy = ev.clientY; let cur = { ...st }, moved = false;
    const mv = e => {
      if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 3) moved = true; if (!moved) return;
      const dx = (e.clientX - sx) / rect.width * W, dy = (e.clientY - sy) / rect.height * H, o = { ...st };
      if (mode === 'move') { o.x = q(st.x + dx); o.y = q(st.y + dy); } else { if (mode.includes('e')) o.w = q(st.w + dx); if (mode.includes('s')) o.h = q(st.h + dy); o.w = Math.min(o.w, W - o.x); o.h = Math.min(o.h, H - o.y); }
      cur = this.fit(o, W, H); Object.assign(el.style, { left: cur.x / W * 100 + '%', top: cur.y / H * 100 + '%', width: cur.w / W * 100 + '%', height: cur.h / H * 100 + '%' });
    };
    const end = () => {
      h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', end); h.removeEventListener('pointercancel', end);
      const u = this.ui(); if (kind === 'b') u.b = id; else u.r = id;
      if (!moved) return App.refresh();
      if (kind === 'b') Object.assign(x0, cur); else Object.assign(x0.r, { mx: cur.x, my: cur.y, mw: cur.w, mh: cur.h });
      this.done();
    };
    try { h.setPointerCapture(ev.pointerId); } catch (e) { /* capture is optional */ }
    h.addEventListener('pointermove', mv); h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end);
  },
  zoom(d) { const u = this.ui(); u.zoom = d ? Math.max(0.5, Math.min(3, (u.zoom || 1) + d)) : 1; App.refresh(); },
  addFloor(bid) { const b = this.B(bid); if (!b) return; const f = { id: DB.id('FL'), name: `${bnNum(b.floors.length)} তলা`, rooms: [] }; b.floors.push(f); this.ui().f = f.id; this.done('তলা যোগ করা হয়েছে।'); },
  moveFloor(bid, fid, d) { const b = this.B(bid), i = b?.floors.findIndex(x => x.id === fid) ?? -1, j = i + d; if (i < 0 || j < 0 || j >= b.floors.length) return; [b.floors[i], b.floors[j]] = [b.floors[j], b.floors[i]]; this.done(); },
  delFloor(bid, fid) { const b = this.B(bid), f = b?.floors.find(x => x.id === fid); if (!f) return; if (f.rooms.length && !confirm(`“${f.name}” ও এর সব কক্ষ মুছে ফেলবেন?`)) return; b.floors = b.floors.filter(x => x.id !== fid); this.done('তলা মুছে ফেলা হয়েছে।'); },
  setF(bid, fid, v) { const f = this.B(bid)?.floors.find(x => x.id === fid); if (f && String(v).trim()) { f.name = String(v).trim(); this.done(); } },
  addRoom(bid, fid) {
    const f = this.B(bid)?.floors.find(x => x.id === fid); if (!f) return;
    const n = this.all(this.ui().cid).length, r = this.newRoom(`কক্ষ ${bnNum(n + 101)}`, n); f.rooms.push(r); this.ui().r = r.id; this.done('কক্ষ যোগ করা হয়েছে।');
  },
  delRoom(id) {
    const x = this.R(id); if (!x) return;
    const used = (DB.s.routine || []).some(s => s.room === x.r.name);
    if (!confirm(used ? `“${x.r.name}” রুটিনে ব্যবহৃত হচ্ছে। তবুও মুছে ফেলবেন?` : `“${x.r.name}” কক্ষটি মুছে ফেলবেন?`)) return;
    x.f.rooms = x.f.rooms.filter(r => r.id !== id); this.done('কক্ষ মুছে ফেলা হয়েছে।');
  },
  setR(id, k, v) {
    const x = this.R(id); if (!x) return; const r = x.r; v = String(v ?? '').trim();
    if (k === 'name') { if (!v) return toast('কক্ষের নাম আবশ্যক।', 'error'); if (this.all(this.ui().cid).some(y => y.r !== r && y.r.name === v)) return toast('এই নামের কক্ষ আগে থেকেই আছে।', 'error'); const old = r.name; r.name = v; (DB.s.routine || []).forEach(s => { if (s.room === old) s.room = v; }); }
    else if (['rows', 'cols', 'perBench'].includes(k)) { r[k] = Math.max(1, Math.min(k === 'perBench' ? 6 : 20, Math.round(+v || 1))); r.cells = Object.fromEntries(Object.entries(r.cells || {}).filter(([c]) => { const [i, j] = c.split('-').map(Number); return i < r.rows && j < this.width(r); })); }
    else if (k === 'capacity') r.capacity = +v > 0 ? Math.round(+v) : null;
    else r[k] = v;
    this.done();
  },
  /** Seat click: seat → blocked → aisle → seat. */
  seat(id, i, j) { const x = this.R(id); if (!x) return; const c = x.r.cells || (x.r.cells = {}), k = `${i}-${j}`, n = { '': 'x', x: 'a', a: '' }[c[k] || '']; if (n) c[k] = n; else delete c[k]; this.done(); },
  /* ----- drawings ----- */
  mapHtml(cid, edit) {
    const L = this.camp(cid), u = this.ui(), sel = edit ? u.b : null, z = edit ? (u.zoom || 1) : 1;
    const hd = (k, id) => ['e', 's', 'se'].map(m => `<span class="rm-h rm-h-${m}" aria-hidden="true" onpointerdown="RoomMap.drag(event,'${k}','${esc(id)}','${m}')"></span>`).join('');
    return `<div class="rm-zoom"><div class="rm-map ${edit ? 'rm-edit' : ''}" style="aspect-ratio:${MAP_W}/${MAP_H};width:${z * 100}%">${L.buildings.map(b => { const R = (b.floors || []).flatMap(f => f.rooms || []), on = b.id === sel;
      return `<div class="rm-bl ${on ? 'rm-sel' : ''}" style="left:${b.x / MAP_W * 100}%;top:${b.y / MAP_H * 100}%;width:${b.w / MAP_W * 100}%;height:${b.h / MAP_H * 100}%;${+b.rot ? `transform:rotate(${+b.rot}deg)` : ''}" ${edit ? `role="button" tabindex="0" aria-label="${esc(b.name)}" onpointerdown="RoomMap.drag(event,'b','${esc(b.id)}','move')" onkeydown="if(event.key==='Enter'){RoomMap.ui().b='${esc(b.id)}';App.refresh()}"` : ''}><b class="rm-t" title="${esc(b.name)}">${esc(b.name)}</b><span class="rm-rooms">${R.slice(0, 12).map(r => `<span>${esc(r.no || r.name)}</span>`).join('')}${R.length > 12 ? `<span>+${bnNum(R.length - 12)}</span>` : ''}</span>${edit && on ? hd('b', b.id) : ''}</div>`; }).join('')}</div></div>`;
  },
  /** One floor drawn as a plan; rooms can be dragged and resized. */
  floorHtml(f, edit) {
    const sel = this.ui().r;
    return `<div class="rm-fp ${edit ? 'rm-edit' : ''}" style="aspect-ratio:${FP_W}/${FP_H}">${(f.rooms || []).map((r, i) => { const o = this.rr(r, i), on = r.id === sel;
      return `<div class="rm-rm ${on ? 'rm-sel' : ''} rm-ty-${esc(r.type || 'class')}" style="left:${o.x / FP_W * 100}%;top:${o.y / FP_H * 100}%;width:${o.w / FP_W * 100}%;height:${o.h / FP_H * 100}%" role="button" tabindex="0" aria-label="${esc(r.name)}" ${edit ? `onpointerdown="RoomMap.drag(event,'r','${esc(r.id)}','move')"` : `onclick="RoomMap.ui().r='${esc(r.id)}';App.refresh()"`} onkeydown="if(event.key==='Enter'){RoomMap.ui().r='${esc(r.id)}';App.refresh()}"><b class="rm-t" title="${esc(r.name)}">${esc(r.no || '')}</b><span class="rm-t" title="${esc(r.name)}">${esc(r.name)}</span>${edit && on ? ['e', 's', 'se'].map(m => `<span class="rm-h rm-h-${m}" aria-hidden="true" onpointerdown="RoomMap.drag(event,'r','${esc(r.id)}','${m}')"></span>`).join('') : ''}</div>`; }).join('')}</div>`;
  },
  seatHtml(r, edit) {
    const per = this.per(r), rows = +r.rows || 0, cols = +r.cols || 0, round = r.pattern === 'round';
    let h = `<div class="rm-board">বোর্ড / মঞ্চ</div><div class="rm-seats">`;
    for (let i = 0; i < rows; i++) {
      h += `<div class="rm-row">`;
      for (let b = 0; b < cols; b++) {
        h += `<div class="rm-bench ${round ? 'rm-round' : ''}">`;
        for (let s = 0; s < per; s++) { const j = b * per + s, st = this.cell(r, i, j); h += `<button type="button" class="rm-seat ${st === 'x' ? 'is-x' : st === 'a' ? 'is-a' : ''}" aria-label="সারি ${bnNum(i + 1)}, আসন ${bnNum(j + 1)}${st === 'x' ? ' — বন্ধ' : st === 'a' ? ' — চলার পথ' : ''}" ${edit ? `onclick="RoomMap.seat('${esc(r.id)}',${i},${j})"` : 'disabled'}></button>`; }
        h += `</div>`;
      }
      h += `</div>`;
    }
    return h + `</div><div class="flex flex-wrap gap-4 mt-3"><span class="inline-flex items-center gap-2"><span class="rm-seat"></span>আসন</span><span class="inline-flex items-center gap-2"><span class="rm-seat is-x"></span>বন্ধ</span><span class="inline-flex items-center gap-2"><span class="rm-seat is-a"></span>চলার পথ</span><b class="ml-auto">${bnNum(this.seats(r))}টি আসন</b></div>`;
  },
  CSS: `.rm-zoom{overflow:auto;max-width:100%;border-radius:.6rem}
    .rm-map,.rm-fp{position:relative;width:100%;background-color:var(--xg-bg,#fff);background-image:linear-gradient(var(--xg-bd,#e2e8f0) 1px,transparent 1px),linear-gradient(90deg,var(--xg-bd,#e2e8f0) 1px,transparent 1px);background-size:calc(100%/${MAP_W}) calc(100%/${MAP_H});border:1px solid var(--xg-bd2,#cbd5e1);border-radius:.6rem;overflow:hidden}
    .rm-fp{background-size:calc(100%/${FP_W}) calc(100%/${FP_H})}
    .rm-bl,.rm-rm{position:absolute;background:color-mix(in srgb,var(--brand-600,#006a4e) 14%,#fff);border:2px solid var(--brand-600,#006a4e);border-radius:.4rem;padding:.2rem .35rem;overflow:hidden;display:flex;flex-direction:column;gap:.15rem;transform-origin:center}
    .rm-rm{background:#f8fafc;border:1px solid #64748b;border-radius:.25rem;min-width:0}.rm-rm.rm-ty-lab{background:#eff6ff}.rm-rm.rm-ty-office{background:#fefce8}.rm-rm.rm-ty-hall{background:#f5f3ff}.rm-rm.rm-ty-library{background:#fdf2f8}
    .rm-edit .rm-bl,.rm-edit .rm-rm{cursor:move;touch-action:none;user-select:none}.rm-t{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .rm-h{position:absolute;width:1rem;height:1rem;background:#2563eb;border:2px solid #fff;border-radius:.2rem;touch-action:none;z-index:3}.rm-h-e{right:0;top:50%;margin-top:-.5rem;cursor:ew-resize}.rm-h-s{bottom:0;left:50%;margin-left:-.5rem;cursor:ns-resize}.rm-h-se{right:0;bottom:0;cursor:nwse-resize}
    .rm-lay{display:grid;gap:1rem}@media(min-width:1024px){.rm-lay{grid-template-columns:minmax(0,1fr) 20rem}}
    .rm-side .input{padding-top:.25rem;padding-bottom:.25rem}.rm-nums{display:grid;grid-template-columns:repeat(auto-fill,minmax(5.5rem,1fr));gap:.5rem}
    html[data-mode="dark"] .rm-rm{background:#1e293b;border-color:#475569}
    .rm-bl.rm-sel,.rm-rm.rm-sel{outline:3px solid #2563eb;z-index:2}.rm-rooms{display:flex;flex-wrap:wrap;gap:.15rem}.rm-rooms span{background:#fff;border:1px solid #cbd5e1;border-radius:.25rem;padding:0 .25rem;font-size:1rem}
    .rm-board{text-align:center;border:1px solid #94a3b8;background:#f1f5f9;border-radius:.4rem;padding:.2rem;margin-bottom:.6rem}
    .rm-seats{display:flex;flex-direction:column;gap:.4rem;overflow-x:auto;padding-bottom:.3rem}.rm-row{display:flex;gap:.9rem}.rm-bench{display:flex;gap:.15rem;padding:.2rem;border:1px solid #cbd5e1;border-radius:.35rem;background:#f8fafc}.rm-bench.rm-round{border-radius:999px;padding:.35rem}
    .rm-seat{width:1.6rem;height:1.6rem;border-radius:.3rem;background:#bbf7d0;border:1px solid #16a34a;display:inline-block;flex:none}.rm-seat.is-x{background:#fecaca;border-color:#dc2626}.rm-seat.is-a{background:transparent;border:1px dashed #94a3b8}
    html[data-mode="dark"] .rm-rooms span{background:#1e293b;border-color:#334155}html[data-mode="dark"] .rm-bench,html[data-mode="dark"] .rm-board{background:#0f172a;border-color:#334155}`,
  editor() {
    const u = this.ui(), can = Settings.canEdit(), dis = can ? '' : 'disabled';
    if (can && !this.cfg().campuses?.[u.cid]) { this.camp(u.cid, true); this.sync(u.cid); DB.save(); }
    const rx = u.r && this.R(u.r); if (rx && u.rb !== u.r) { u.b = rx.b.id; u.rb = u.r; }
    const L = this.camp(u.cid), b = L.buildings.find(x => x.id === u.b) || L.buildings[0]; if (b) u.b = b.id;
    const campP = DB.s.campuses.length > 1 ? `<div class="flex flex-wrap gap-2 mb-4">${DB.s.campuses.map(c => `<button class="pill ${c.id === u.cid ? 'pill-on' : ''}" onclick="RoomMap.ui().cid='${esc(c.id)}';RoomMap.ui().b=null;RoomMap.ui().r=null;App.refresh()">${icon('school', 'w-4 h-4')} ${esc(c.name)}</button>`).join('')}</div>` : '';
    const show = `<label class="card p-4 mb-5 flex items-center gap-3 ${App.has('ADMIN') ? 'cursor-pointer' : 'opacity-60'}"><input type="checkbox" class="w-5 h-5" ${this.on() ? 'checked' : ''} ${App.has('ADMIN') ? '' : 'disabled'} onchange="RoomMap.setShow(this.checked)"><span><b>ক্যাম্পাস মানচিত্র ওয়েবসাইট ও সব ড্যাশবোর্ডে দেখান</b></span></label>`;
    const fl = b ? (b.floors || []) : [], f = fl.find(x => x.id === u.f) || (rx && rx.b === b ? rx.f : null) || fl[0]; u.f = f?.id;
    const nIn = (k, l, v, fn, extra = '') => `<div><label class="label" for="rm-${k}">${l}</label><input id="rm-${k}" type="number" class="input" value="${esc(v)}" ${extra} ${dis} onchange="${fn}"></div>`;
    const bId = b ? esc(b.id) : '', rSel = rx && f && rx.f === f ? rx.r : null, ro = rSel ? this.rr(rSel, f.rooms.indexOf(rSel)) : null;
    const side = b ? `<aside class="card p-4 rm-side space-y-3"><div><label class="label" for="rm-bn">ভবনের নাম</label><input id="rm-bn" class="input" value="${esc(b.name)}" ${dis} onchange="RoomMap.setB('${bId}','name',this.value)"></div>
      <div class="rm-nums">${[['x', 'বাম'], ['y', 'ওপর'], ['w', 'প্রস্থ'], ['h', 'দৈর্ঘ্য']].map(([k, l]) => nIn('b' + k, l, b[k], `RoomMap.setB('${bId}','${k}',this.value)`, `step="${this.step()}" min="0"`)).join('')}${nIn('brot', 'ঘূর্ণন (°)', +b.rot || 0, `RoomMap.setB('${bId}','rot',this.value)`, 'step="15" min="0" max="359"')}</div>
      <div><div class="label">তলা</div>${fl.map((x, i) => `<div class="flex items-center gap-1 mb-1"><input class="input" value="${esc(x.name)}" aria-label="তলার নাম" ${dis} onchange="RoomMap.setF('${bId}','${esc(x.id)}',this.value)">${can ? `<button class="btn btn-ghost btn-sm" aria-label="ওপরে" ${i ? '' : 'disabled'} onclick="RoomMap.moveFloor('${bId}','${esc(x.id)}',-1)">${icon('arrow-up')}</button><button class="btn btn-ghost btn-sm" aria-label="নিচে" ${i < fl.length - 1 ? '' : 'disabled'} onclick="RoomMap.moveFloor('${bId}','${esc(x.id)}',1)">${icon('arrow-down')}</button><button class="btn btn-ghost btn-sm text-red-600" aria-label="তলা মুছুন" onclick="RoomMap.delFloor('${bId}','${esc(x.id)}')">${icon('trash-2')}</button>` : ''}</div>`).join('')}${can ? `<button class="btn btn-ghost btn-sm" onclick="RoomMap.addFloor('${bId}')">${icon('plus')} তলা যোগ করুন</button>` : ''}</div>
      ${rSel ? `<div class="border-t border-slate-100 pt-3"><div class="label">কক্ষ: ${esc(rSel.name)}</div><div class="rm-nums">${[['x', 'বাম'], ['y', 'ওপর'], ['w', 'প্রস্থ'], ['h', 'দৈর্ঘ্য']].map(([k, l]) => nIn('r' + k, l, ro[k], `RoomMap.setRect('${esc(rSel.id)}','${k}',this.value)`, `step="${this.step()}" min="0"`)).join('')}</div></div>` : ''}
      ${can ? `<button class="btn btn-ghost btn-sm text-red-600" onclick="RoomMap.delBuilding('${bId}')">${icon('trash-2')} ভবন মুছুন</button>` : ''}</aside>` : '';
    const tools = `<div class="flex flex-wrap items-center gap-2 mb-3"><h3 class="font-semibold text-lg mr-auto">ক্যাম্পাস মানচিত্র</h3><button class="btn btn-ghost btn-sm" aria-label="ছোট করুন" onclick="RoomMap.zoom(-0.25)">${icon('zoom-out')}</button><span class="min-w-[3.5rem] text-center">${bnNum(Math.round((u.zoom || 1) * 100))}%</span><button class="btn btn-ghost btn-sm" aria-label="বড় করুন" onclick="RoomMap.zoom(0.25)">${icon('zoom-in')}</button><button class="btn btn-ghost btn-sm" aria-label="স্বাভাবিক আকার" onclick="RoomMap.zoom(0)">${icon('maximize')}</button>
      <label class="inline-flex items-center gap-2 cursor-pointer"><input type="checkbox" class="w-5 h-5" ${u.snap !== false ? 'checked' : ''} onchange="RoomMap.ui().snap=this.checked;App.refresh()">গ্রিডে আটকান</label>${can ? `<button class="btn btn-ghost btn-sm" onclick="RoomMap.addBuilding()">${icon('plus')} ভবন যোগ করুন</button>` : ''}</div>`;
    const map = `<div class="rm-lay mb-5"><div class="card p-4 min-w-0">${tools}${this.mapHtml(u.cid, can)}</div>${side}</div>`;
    const sel = (k, val, opts, id) => `<select class="xg-edit sg-kind" aria-label="${k}" ${dis} onchange="RoomMap.setR('${esc(id)}','${k}',this.value)">${opts.map(([v, l]) => `<option value="${v}" ${val === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    const num = (k, val, id, w = '4.5rem') => `<input class="xg-edit" type="number" min="1" value="${esc(val ?? '')}" style="width:${w}" aria-label="${k}" ${dis} onchange="RoomMap.setR('${esc(id)}','${k}',this.value)">`;
    const tabs = fl.length ? `<div class="flex flex-wrap gap-2 mb-3" role="tablist">${fl.map(x => `<button class="pill ${x === f ? 'pill-on' : ''}" role="tab" aria-selected="${x === f}" onclick="RoomMap.ui().f='${esc(x.id)}';RoomMap.ui().r=null;App.refresh()">${icon('layers', 'w-4 h-4')} ${esc(x.name)} · ${bnNum(x.rooms.length)}</button>`).join('')}</div>` : '';
    const floors = tabs + (b ? [f].filter(Boolean).map(f => `<div class="card mb-4"><div class="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-slate-100">${icon('layers', 'w-4 h-4 text-brand-600')}<b>${esc(f.name)}</b><span class="text-slate-500">${bnNum(f.rooms.length)}টি কক্ষ</span>${can ? `<button class="btn btn-ghost btn-sm ml-auto" onclick="RoomMap.addRoom('${esc(b.id)}','${esc(f.id)}')">${icon('plus')} কক্ষ যোগ</button>` : ''}</div>
      <div class="p-4"><div class="rm-zoom"><div style="width:${(u.zoom || 1) * 100}%">${this.floorHtml(f, can)}</div></div></div>
      ${f.rooms.length ? `<div class="xg-wrap" style="border:0;border-radius:0"><table class="xg w-full" style="min-width:74rem"><thead><tr><th>নম্বর</th><th>নাম</th><th>আইডি</th><th>ধরন</th><th>ধারণক্ষমতা</th><th>বসার ধরন</th><th>বেঞ্চপ্রতি আসন</th><th>সারি</th><th>কলাম</th><th>আসন</th><th>নকশা</th>${can ? '<th>মুছুন</th>' : ''}</tr></thead><tbody>${f.rooms.map(r => `<tr>
        <td><input class="xg-edit" value="${esc(r.no || '')}" style="width:5rem" aria-label="নম্বর" ${dis} onchange="RoomMap.setR('${esc(r.id)}','no',this.value)"></td><td><input class="xg-edit" value="${esc(r.name)}" style="min-width:9rem" aria-label="নাম" ${dis} onchange="RoomMap.setR('${esc(r.id)}','name',this.value)"></td><td class="font-mono">${esc(r.id)}</td>
        <td>${sel('type', r.type, ROOM_TYPES, r.id)}</td><td>${num('capacity', r.capacity, r.id)}</td><td>${sel('pattern', r.pattern, SEAT_PATTERNS, r.id)}</td><td>${num('perBench', r.perBench, r.id)}</td><td>${num('rows', r.rows, r.id)}</td><td>${num('cols', r.cols, r.id)}</td>
        <td class="text-center">${bnNum(this.cap(r))}</td><td class="text-center"><button class="btn btn-ghost btn-sm ${u.r === r.id ? 'btn-primary' : ''}" aria-label="আসন নকশা" onclick="RoomMap.ui().r=RoomMap.ui().r==='${esc(r.id)}'?null:'${esc(r.id)}';App.refresh()">${icon('armchair')}</button></td>
        ${can ? `<td class="text-center"><button class="btn btn-ghost btn-sm text-red-600" aria-label="মুছুন" onclick="RoomMap.delRoom('${esc(r.id)}')">${icon('trash-2')}</button></td>` : ''}</tr>${u.r === r.id ? `<tr><td colspan="${can ? 12 : 11}" style="white-space:normal">${this.seatHtml(r, can)}</td></tr>` : ''}`).join('')}</tbody></table></div>` : ''}</div>`).join('') : `<div class="card">${emptyState('কোনো ভবন নেই।', 'building-2')}</div>`);
    return `<style>${typeof XG_CSS !== 'undefined' ? XG_CSS : ''}${this.CSS}.sg-kind{min-width:8.5rem}</style>${show}${campP}${map}<h3 class="font-semibold text-lg mb-3">${esc(b?.name || '')}</h3>${floors}<div class="mt-6 max-w-2xl">${Settings.roomRules()}</div>`;
  },
  /** Read-only map for the website and dashboards. */
  view() {
    const C = DB.s.campuses.filter(c => this.camp(c.id).buildings.length);
    return `<style>${this.CSS}</style>` + C.map(c => `<section class="mb-8">${C.length > 1 ? `<h2 class="font-heading text-xl font-bold mb-3">${esc(c.name)}</h2>` : ''}${this.mapHtml(c.id, false)}
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">${this.camp(c.id).buildings.map(b => `<div class="card p-4"><div class="font-semibold mb-2">${icon('building-2', 'w-4 h-4 inline text-brand-600')} ${esc(b.name)}</div>${(b.floors || []).map(f => `<div class="mb-2"><div class="text-slate-500">${esc(f.name)}</div><div class="flex flex-wrap gap-1">${(f.rooms || []).map(r => badge(`${r.no ? r.no + ' · ' : ''}${r.name}`, 'slate')).join('')}</div></div>`).join('')}</div>`).join('')}</div></section>`).join('');
  },
  any() { return this.on() && DB.s.campuses.some(c => this.camp(c.id).buildings.length); },
};
Settings.roomplan = () => RoomMap.editor();
// one-time: the old comma-separated room lists become a building with one floor per campus
DB.addSeeder('roomLayout', s => { (s.campuses || []).forEach(c => RoomMap.camp(c.id, true)); return s.roomLayout; });
if (typeof Menus !== 'undefined' && Menus.FOOTER) Menus.FOOTER['campus-map'] = 'info';
// exam seat plans: room size, seats per bench and blocked seats / aisles come from the room layout
if (typeof Admin !== 'undefined' && Admin.buildSeatPlan) {
  const b0 = Admin.buildSeatPlan.bind(Admin);
  Admin.buildSeatPlan = function (classIds, rooms, rows, cols) {
    if (!rooms.some(n => RoomMap.find(n))) return b0(classIds, rooms, rows, cols);
    const exam = Math.max(1, +DB.s.school.roomRules?.examSeatsPerBench || 1);
    const queues = classIds.map(id => ({ id, grade: DB.cls(id).grade, q: DB.studentsIn(id).map(s => ({ id: s.id, name: pn(s), roll: s.roll, grade: DB.cls(id).grade })) }));
    const remaining = () => U.sum(queues, x => x.q.length), plan = [];
    rooms.forEach(room => {
      if (!remaining()) return;
      const R = RoomMap.find(room, DB.campusId()), rr = R ? +R.rows || 1 : rows, per = R ? RoomMap.per(R) : 1, cc = R ? RoomMap.width(R) : cols;
      const usable = (i, j) => !R || (!RoomMap.cell(R, i, j) && (j % per) < Math.min(per, exam));
      let left = R ? Math.min(RoomMap.cap(R), RoomMap.seats(R)) : Infinity;
      const grid = Array.from({ length: rr }, () => Array(cc).fill(null));
      for (let r = 0; r < rr; r++) for (let c = 0; c < cc; c++) {
        if (!usable(r, c) || left <= 0) continue;
        const lf = c > 0 ? grid[r][c - 1] : null, up = r > 0 ? grid[r - 1][c] : null;
        const order = queues.map((q, i) => ({ q, i })).sort((a, b) => ((a.i - (r + c)) % queues.length + queues.length) % queues.length - ((b.i - (r + c)) % queues.length + queues.length) % queues.length);
        const pick = order.find(({ q }) => q.q.length && (!lf || lf.grade !== q.grade) && (!up || up.grade !== q.grade));
        grid[r][c] = pick ? pick.q.q.shift() : null; if (grid[r][c]) left--;
      }
      plan.push({ room, rows: rr, cols: cc, grid, filled: grid.flat().filter(Boolean).length });
    });
    let violations = 0;
    plan.forEach(p => p.grid.forEach((row, r) => row.forEach((cell, c) => { if (!cell) return; if (c > 0 && row[c - 1]?.grade === cell.grade) violations++; if (r > 0 && p.grid[r - 1][c]?.grade === cell.grade) violations++; })));
    return { plan, unseated: remaining(), violations };
  };
}
// campus map page: website and every dashboard, only while the Root User shows it
(() => {
  const page = portal => ({ id: 'campus-map', label: 'ক্যাম্পাস মানচিত্র', icon: 'map', when: () => RoomMap.any(), render: () => portal === 'public' ? Pub.wrap(Pub.hero('ক্যাম্পাস মানচিত্র', '') + Pub.section('', '', RoomMap.view())) : pageHeader('ক্যাম্পাস মানচিত্র') + RoomMap.view() });
  Object.keys(App.portals).forEach(p => { if (p === 'print' || App.portals[p].pages.some(x => x.id === 'campus-map')) return; App.addPage(p, page(p)); });
})();

/* ---------------- pages and redirects ---------------- */
(() => {
  const mountTab = typeof settingsPage !== 'undefined' ? settingsPage.mount.bind(settingsPage) : () => { };
  Settings.mountTab = () => {
    const t = App.ui.setTab, run = id => { App.ui.setTab = id; try { mountTab(); } catch (e) { console.error(e); } };
    if (t === 'acadpolicy') { run('policy'); App.ui.setTab = t; }
    else if (t === 'roomplan') { run('structure'); App.ui.setTab = t; }
    else if (t === 'structure' || t === 'subjects') { if (t === 'subjects') SubjGrid.mount(); }
    else run(t);
  };
  const pages = Object.entries(Settings.PAGES).map(([key, [id, label, ic]]) => ({ id, label, icon: ic, module: 'settings', slug: `settings/${key}`, defSlug: `settings/${key}`, render() { return Settings.pageView(key); }, mount() { Settings.mountTab(); } }));
  const redirect = (pick) => ({
    hidden: true,
    render(q) {
      const t = pick(q || {}), key = Settings.pageOf(t) || 'basic', id = Settings.PAGES[key][0];
      App.ui.setTab = t; App.ui._setShown = null;
      App.route.page = id; App.replaceUrl(App.href(App.route.portal, id));
      return Settings.pageView(key);
    },
    mount() { Settings.mountTab(); },
  });
  const R = {
    settings: redirect(q => q.tab || App.ui.setTab || 'identity'),
    website: redirect(() => Settings.pageOf(App.ui.setTab) === 'design' ? App.ui.setTab : 'design'),
    'inst-achievements': redirect(() => 'achievements'),
  };
  ['admin', 'principal'].forEach(portal => {
    const P = App.portals[portal]; if (!P) return;
    Object.entries(R).forEach(([id, r]) => { const p = P.pages.find(x => x.id === id); if (p) Object.assign(p, r); });
    let at = P.pages.findIndex(x => x.id === 'settings');
    pages.forEach(pg => { if (P.pages.some(x => x.id === pg.id)) return; at = at < 0 ? P.pages.length - 1 : at; P.pages.splice(++at, 0, pg); });
  });
})();
