/* ==========================================================================
   অ্যাকাউন্ট ও প্রবেশ
   · পাসওয়ার্ড পুনরুদ্ধার (পাতা, পপ-আপ নয়): মোবাইল/ই-মেইলে ওটিপি, অথবা আইটি অফিসে অনুরোধ
   · আইটি অফিস (রুট ইউজার): অনুরোধ নিষ্পত্তি ও যেকোনো ব্যবহারকারীর পাসওয়ার্ড সরাসরি রিসেট
   · কাস্টম ব্যবহারকারী ধরন (যেমন হিসাবরক্ষক, অফিস সহকারী) — রুট তৈরি করেন, চাইলে অধ্যক্ষও এ ধরনের ব্যবহারকারী যোগ করতে পারেন
   · অধ্যক্ষের “ব্যবহারকারী” পাতা — শিক্ষক, কর্মী ও কাস্টম ধরনের ব্যবহারকারী যোগ
   · পেমেন্ট গেটওয়ে সংযোগ (ওপেন-সোর্স Hyperswitch বা নিজস্ব সার্ভার)
   ========================================================================== */

/* ---------------- পাসওয়ার্ড পুনরুদ্ধার ---------------- */
const Recover = {
  st() { return App.ui.rec || (App.ui.rec = { step: 1 }); },
  mask(v) { v = String(v || ''); return v.includes('@') ? v.replace(/^(.).*(@.*)$/, '$1•••$2') : v.replace(/^(\d{3})\d+(\d{3})$/, '$1•••••$2'); },
  find(id) { const k = U.asciiDigits(String(id || '')).trim().toLowerCase(); return (typeof People !== 'undefined' && People.findLogin(k)) || DB.s.users.find(u => (u.email || '').toLowerCase() === k) || null; },
  page() {
    const R = this.st(), box = b => `<section class="max-w-lg mx-auto px-4 py-10"><div class="card p-6 space-y-4">${b}</div></section>`;
    let body = '';
    if (R.step === 1) body = `<form id="rec-form" class="space-y-4"><div><label class="label">ইউজার আইডি / স্টুডেন্ট আইডি / রেজিস্ট্রেশন নম্বর / মোবাইল / ই-মেইল</label><input class="input" name="id" required autocomplete="username" value="${esc(R.id || '')}"></div>
        <fieldset class="space-y-2"><legend class="label">কোড কোথায় পাঠাব?</legend>
          ${[['sms', 'message-square', 'নিবন্ধিত মোবাইলে এসএমএস (ওটিপি)'], ['email', 'mail', 'নিবন্ধিত ই-মেইলে (ওটিপি)'], ['office', 'building-2', 'আইটি অফিসে রিসেটের অনুরোধ পাঠান']].map(([v, ic, l], i) => `<label class="card p-3 flex items-center gap-3 cursor-pointer"><input type="radio" name="via" value="${v}" ${(R.via || 'sms') === v || (!R.via && !i) ? 'checked' : ''}>${icon(ic, 'w-5 h-5 text-brand-600')}<span>${l}</span></label>`).join('')}</fieldset>
        <button class="btn btn-primary w-full">${icon('send')} পরবর্তী</button><button type="button" class="w-full text-brand-700 font-semibold" onclick="App.showLogin()">লগইনে ফিরে যান</button></form>`;
    if (R.step === 2) body = `<div class="flex items-center gap-2 font-semibold">${icon('shield-check', 'w-5 h-5 text-brand-600')} যাচাই কোড পাঠানো হয়েছে</div><p>${R.via === 'email' ? 'ই-মেইল' : 'মোবাইল'} ${esc(R.masked || '')}-এ ৬ অঙ্কের কোড পাঠানো হয়েছে (যদি তথ্য সঠিক থাকে)। কোডটি ১০ মিনিট কার্যকর থাকবে।</p>
        <form id="rec-form" class="space-y-4"><div><label class="label">যাচাই কোড</label><input class="input text-center text-xl tracking-widest" name="code" inputmode="numeric" maxlength="6" required autocomplete="one-time-code"></div>
          <div><label class="label">নতুন পাসওয়ার্ড (কমপক্ষে ১০ অক্ষর, অক্ষর ও সংখ্যা দুটোই)</label><input class="input" type="password" name="pw" minlength="10" required autocomplete="new-password"></div>
          <div><label class="label">নতুন পাসওয়ার্ড আবার লিখুন</label><input class="input" type="password" name="pw2" minlength="10" required autocomplete="new-password"></div>
          <button class="btn btn-primary w-full">${icon('key-round')} পাসওয়ার্ড বদলান</button></form>
        <div class="flex flex-wrap gap-2 justify-between"><button class="text-brand-700 font-semibold" onclick="Recover.resend()">${icon('rotate-cw', 'w-4 h-4 inline')} আবার কোড পাঠান</button><button class="text-slate-600" onclick="App.ui.rec={step:1};App.refresh()">শুরুতে ফিরুন</button></div>`;
    if (R.step === 3) body = `<div class="text-center space-y-3">${icon('check-circle-2', 'w-12 h-12 text-emerald-600 mx-auto')}<div class="font-semibold text-lg">পাসওয়ার্ড বদলানো হয়েছে</div><p>নতুন পাসওয়ার্ড দিয়ে লগইন করুন।</p><button class="btn btn-primary" onclick="App.ui.rec=null;App.showLogin()">${icon('log-in')} লগইন</button></div>`;
    if (R.step === 4) body = `<div class="text-center space-y-3">${icon('building-2', 'w-12 h-12 text-brand-600 mx-auto')}<div class="font-semibold text-lg">অনুরোধ আইটি অফিসে পাঠানো হয়েছে</div><p>রেফারেন্স: <b class="font-mono">${esc(R.ref)}</b>। আইটি অফিস পরিচয় যাচাই করে নতুন পাসওয়ার্ড আপনার নিবন্ধিত মোবাইলে পাঠাবে, অথবা পরিচয়পত্রসহ অফিসে এলে সরাসরি দেবে।</p><button class="btn btn-ghost" onclick="App.ui.rec=null;App.go('public','home')">প্রথম পাতায় যান</button></div>`;
    return Pub.wrap(Pub.hero('পাসওয়ার্ড পুনরুদ্ধার', 'মোবাইল বা ই-মেইলে যাচাই কোড নিয়ে নতুন পাসওয়ার্ড দিন, অথবা আইটি অফিসের সাহায্য নিন।') + box(body) + ((R.step === 1 || R.step === 4) && typeof PwHelp !== 'undefined' ? PwHelp.statusBox(R.step === 4 ? R.ref : '') : ''));
  },
  mount() {
    const f = $('#rec-form'), R = this.st(); if (!f) return;
    f.addEventListener('submit', e => { e.preventDefault(); const d = formData(f); R.step === 1 ? this.start(d) : this.finish(d); });
  },
  /* The server finds the account, sends the code through the configured SMS / e-mail provider,
     checks it and sets the new password (POST api/public/otp/request · otp/verify). */
  async start(d) {
    const R = this.st(); Object.assign(R, { id: d.id, via: d.via, uid: null });
    if (d.via === 'office') {
      const list = DB.s.pwRequests || (DB.s.pwRequests = []), ref = 'PR' + Date.now().toString().slice(-6);
      list.unshift({ id: ref, userId: null, given: d.id, at: new Date().toISOString(), status: 'Pending' });   // the server links the account
      DB.audit('PASSWORD_HELP', 'users', `${ref}: “${d.id}” আইটি অফিসের সাহায্য চেয়েছেন`, { role: 'PUBLIC' }); DB.save();
      Object.assign(R, { step: 4, ref }); return App.refresh();
    }
    if (await this.send()) { R.step = 2; App.refresh(); }
  },
  /** Ask the server for a code. Returns true when the code step may be shown. */
  async send() {
    const R = this.st();
    if (R.sentAt && Date.now() - R.sentAt < 60000) { toast('এক মিনিট পর আবার চেষ্টা করুন।', 'warn'); return false; }
    let r;
    try { r = await DB.api('public/otp/request', { id: R.id, via: R.via }); } catch (e) { toast('সার্ভারের সঙ্গে যোগাযোগ করা যায়নি — আবার চেষ্টা করুন।', 'error'); return false; }
    if (!r.ok) {
      toast(r.reason === 'nocontact' ? (r.via === 'email' ? 'এই অ্যাকাউন্টে কোনো ই-মেইল নেই — মোবাইল বা আইটি অফিস বেছে নিন।' : 'এই অ্যাকাউন্টে কোনো মোবাইল নম্বর নেই।')
        : r.reason === 'wait' ? 'এক মিনিট পর আবার চেষ্টা করুন।' : 'এখন কোড পাঠানো যাচ্ছে না — আইটি অফিসের সাহায্য নিন।', r.reason === 'wait' ? 'warn' : 'error');
      return false;
    }
    R.sentAt = Date.now(); R.masked = r.masked; return true;
  },
  async resend() { if (await this.send()) { toast('নতুন কোড পাঠানো হয়েছে।', 'success'); App.refresh(); } },
  async finish(d) {
    const R = this.st();
    if (d.pw !== d.pw2) return toast('দুটি পাসওয়ার্ড মেলেনি।', 'error');
    let r;
    try { r = await DB.api('public/otp/verify', { id: R.id, code: d.code, pw: d.pw }); } catch (e) { return toast('সার্ভারের সঙ্গে যোগাযোগ করা যায়নি — আবার চেষ্টা করুন।', 'error'); }
    if (!r.ok) return toast(r.reason === 'weak' ? r.message : r.reason === 'toomany' ? 'বেশিবার ভুল হয়েছে — নতুন কোড নিন।' : r.reason === 'wrong' ? 'কোডটি সঠিক নয়।' : 'কোডটি সঠিক নয় বা মেয়াদ শেষ — আবার কোড পাঠান।', 'error');
    App.ui.rec = { step: 3 }; App.refresh();
  },
};
App.addPage('public', { id: 'reset-password', label: 'পাসওয়ার্ড পুনরুদ্ধার', icon: 'key-round', render() { return Recover.page(); }, mount() { Recover.mount(); } });

/* ---------------- আইটি অফিস: অনুরোধ ও সরাসরি রিসেট ---------------- */
const PwDesk = {
  /** Pending requests and direct reset (a tab of ব্যবহারকারী ব্যবস্থাপনা, js/modules/hubs.js). */
  panel() {
    const req = (DB.s.pwRequests || []).filter(r => r.status === 'Pending'), q = (App.ui.pwQ || '').toLowerCase();
    const found = q ? DB.s.users.filter(u => `${u.name} ${u.nameBn || ''} ${u.username} ${u.phone} ${u.email}`.toLowerCase().includes(q)).slice(0, 10) : [];
    return `<div class="grid lg:grid-cols-2 gap-5 items-start"><div class="card"><div class="px-5 py-3 border-b border-slate-100 font-semibold">অপেক্ষমাণ অনুরোধ (${bnNum(req.length)})</div><div class="divide-y divide-slate-100">${req.map(r => { const u = r.userId && DB.user(r.userId); return `<div class="px-5 py-3 flex flex-wrap items-center gap-3"><div class="flex-1 min-w-0"><div class="font-semibold">${u ? esc(pn(u)) : `অজানা অ্যাকাউন্ট: “${esc(r.given)}”`}</div><div class="text-slate-500">${r.id} · ${U.fmtTime(r.at)}${u ? ` · ${esc(u.phone || '')}` : ''}</div></div>${u ? `<button class="btn btn-primary btn-sm" onclick="PwDesk.reset('${u.id}','${r.id}')">রিসেট</button>` : ''}<button class="btn btn-ghost btn-sm" onclick="PwDesk.close('${r.id}')">বাতিল</button></div>`; }).join('') || emptyState('কোনো অনুরোধ নেই।')}</div></div>
        <div class="card p-5 space-y-3"><div class="font-semibold">সরাসরি রিসেট</div><input class="input" id="pw-q" placeholder="নাম, ইউজার আইডি, মোবাইল বা ই-মেইল দিয়ে খুঁজুন…" value="${esc(App.ui.pwQ || '')}" oninput="App.ui.pwQ=this.value;clearTimeout(window.__pwT);window.__pwT=setTimeout(()=>{App.refresh();const i=document.getElementById('pw-q');i&&(i.focus(),i.setSelectionRange(i.value.length,i.value.length))},250)">
          <div class="divide-y divide-slate-100">${found.map(u => `<div class="py-2.5 flex items-center gap-3">${avatar(u, 30)}<div class="flex-1 min-w-0"><div class="font-semibold truncate">${esc(pn(u))}</div><div class="text-slate-500">@${esc(u.username)} · ${esc(DB.roles(u.id).map(bn).join(', '))}</div></div><button class="btn btn-ghost btn-sm" onclick="PwDesk.reset('${u.id}')">${icon('key-round')} রিসেট</button></div>`).join('') || (q ? '<p class="text-slate-500">কাউকে পাওয়া যায়নি।</p>' : '')}</div></div></div>`;
  },
  async reset(uid, reqId) {
    const u = DB.user(uid);
    if (DB.roles(uid).includes('ADMIN') && uid !== App.session.userId && !confirm('আরেকজন রুট ইউজারের পাসওয়ার্ড রিসেট করবেন?')) return;
    let temp;   // created on the server, which keeps only its hash
    try { temp = await DB.setTempPassword(uid); } catch (e) { return toast(e.status === 403 ? 'অনুমতি নেই।' : 'সার্ভারের সঙ্গে যোগাযোগ করা যায়নি — আবার চেষ্টা করুন।', 'error'); }
    const r = reqId && (DB.s.pwRequests || []).find(x => x.id === reqId); if (r) { r.status = 'Done'; r.doneAt = new Date().toISOString(); r.by = App.session.userId; }
    DB.audit('CREDENTIAL_RESET', 'users', `${u.username}-এর পাসওয়ার্ড আইটি অফিস থেকে রিসেট${reqId ? ` (${reqId})` : ''}`); DB.save();
    App.openDetail({ title: `নতুন পাসওয়ার্ড · ${pn(u)}`, render: () => `<div class="card p-6 max-w-lg space-y-4 text-center"><div>${avatar(u, 56)}</div><div class="font-semibold text-lg">${esc(pn(u))}</div><div>ইউজার আইডি: <b class="font-mono">${esc(u.username)}</b></div>
      <div class="text-2xl font-mono bg-slate-100 rounded-lg py-3 tracking-wider">${esc(temp)}</div><p class="text-slate-600">এই অস্থায়ী পাসওয়ার্ড শুধু একবার দেখানো হচ্ছে। প্রথম লগইনের পর ব্যবহারকারীকে পাসওয়ার্ড বদলাতে বলুন।</p>
      <p class="text-slate-500 text-sm">পাসওয়ার্ডটি কোথাও সংরক্ষিত থাকে না (বার্তা লগ বা অডিটেও নয়) — এই পাতা বন্ধ করার আগে ব্যবহারকারীকে জানিয়ে দিন${u.phone ? ` (মোবাইল ${esc(Recover.mask(u.phone))})` : ''}।</p></div>` });
  },
  close(id) { const r = (DB.s.pwRequests || []).find(x => x.id === id); if (r) { r.status = 'Closed'; DB.save(); App.refresh(); } },
};

/* ---------------- কাস্টম ব্যবহারকারী ধরন ---------------- */
const CustomRoles = {
  list() { return DB.s.customRoles || (DB.s.customRoles = []); },
  ICONS: [['user-round', 'ব্যক্তি'], ['calculator', 'হিসাব'], ['briefcase', 'অফিস'], ['library', 'গ্রন্থাগার'], ['clipboard-check', 'পরীক্ষা'], ['wallet', 'ফি'], ['headset', 'সহায়তা'], ['monitor-cog', 'আইটি'], ['bus', 'পরিবহন'], ['building', 'হোস্টেল'], ['stethoscope', 'স্বাস্থ্য'], ['shield', 'নিরাপত্তা'], ['user-cog', 'প্রশাসন'], ['book-open', 'একাডেমিক']],
  PORTALS: [['principal', 'প্রশাসনিক ড্যাশবোর্ড (অধ্যক্ষের মতো, পাতা বেছে দেওয়া যায়)'], ['admin', 'রুট ড্যাশবোর্ড (প্রযুক্তি/হিসাব কাজের জন্য)']],
  register() {
    const g = DB.s.rbac || (DB.s.rbac = DB.defaultRbac());
    this.list().forEach(r => { ROLES[r.key] = { label: r.label, icon: r.icon || 'user-round', portal: r.portal, custom: true }; if (!g[r.key]) g[r.key] = JSON.parse(JSON.stringify(g[r.copyFrom] || g.TEACHER || {})); });
  },
  editor() {
    const can = App.has('ADMIN'), L = this.list();
    return `<div class="grid lg:grid-cols-2 gap-5 items-start"><div class="card"><div class="px-5 py-3 border-b border-slate-100 font-semibold">কাস্টম ব্যবহারকারী ধরন</div><div class="divide-y divide-slate-100">${L.map(r => { const n = DB.s.userRoles.filter(x => x.role === r.key).length; return `<div class="px-5 py-3 flex flex-wrap items-center gap-3"><span class="w-10 h-10 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">${icon(r.icon || 'user-round', 'w-5 h-5')}</span><div class="flex-1 min-w-0"><div class="font-semibold">${esc(r.label)}</div><div class="text-slate-500">${esc((this.PORTALS.find(p => p[0] === r.portal) || [])[1] || r.portal)} · ${bnNum(n)} জন${r.principalCreates ? ' · অধ্যক্ষ যোগ করতে পারেন' : ''}</div></div>${can ? `<button class="btn btn-ghost btn-sm" onclick="CustomRoles.perms('${r.key}','module')">${icon('shield-check')} অনুমতি</button><button class="btn btn-ghost btn-sm" onclick="CustomRoles.perms('${r.key}','pages')">${icon('layout-list')} পাতা</button>${n ? '' : `<button class="btn btn-ghost btn-sm" onclick="CustomRoles.del('${r.key}')" aria-label="ধরনটি মুছুন">${icon('trash-2')}</button>`}` : ''}</div>`; }).join('') || '<p class="p-5 text-slate-500">এখনও কোনো কাস্টম ধরন নেই।</p>'}</div></div>
      ${can ? `<form class="card p-5 grid sm:grid-cols-2 gap-4" onsubmit="CustomRoles.add(this);return false"><div class="sm:col-span-2 font-semibold">নতুন ধরন তৈরি করুন</div>
        <div><label class="label">নাম</label><input class="input" name="label" required placeholder="যেমন: হিসাবরক্ষক"></div><div><span class="label">আইকন</span><div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="আইকন">${CustomRoles.ICONS.map(([k, l], i) => `<label class="cursor-pointer" title="${l}"><input type="radio" name="icon" value="${k}" class="peer sr-only" ${i ? '' : 'checked'}><span class="w-10 h-10 rounded-lg border border-slate-200 flex items-center justify-center peer-checked:border-brand-600 peer-checked:bg-brand-50 peer-checked:text-brand-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500">${icon(k, 'w-5 h-5')}</span><span class="sr-only">${l}</span></label>`).join('')}</div></div>
        <div class="sm:col-span-2"><label class="label">কোন ড্যাশবোর্ড ব্যবহার করবেন</label><select class="select" name="portal">${this.PORTALS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
        <div><label class="label">শুরুর অনুমতি কপি করুন</label><select class="select" name="copyFrom">${['TEACHER', 'PRINCIPAL', 'ADMIN'].map(k => `<option value="${k}">${esc(ROLES[k].label)}</option>`).join('')}</select></div>
        <label class="flex items-center gap-2 pt-7"><input type="checkbox" name="principalCreates" checked> অধ্যক্ষও এ ধরনের ব্যবহারকারী যোগ করতে পারবেন</label>
        <div class="sm:col-span-2"><button class="btn btn-primary">${icon('plus')} তৈরি করুন</button></div></form>` : ''}</div>`;
  },
  add(f) {
    const d = formData(f), key = 'CR_' + Date.now().toString(36).toUpperCase();
    this.list().push({ key, label: d.label.trim(), icon: CustomRoles.ICONS.some(x => x[0] === d.icon) ? d.icon : 'user-round', portal: d.portal, copyFrom: d.copyFrom, principalCreates: !!f.principalCreates.checked });
    this.register();
    // a new admin-dashboard type starts with only the safe pages; a principal-dashboard type starts without staff/settings pages
    const pa = DB.s.pageAccess || (DB.s.pageAccess = {}); pa[key] = {}; App.portals[d.portal].pages.forEach(p => { if (/settings|users|user-admin|pw-desk|data|database|clone|audit|system|maintenance/.test(p.id)) pa[key][p.id] = false; });
    DB.audit('ROLE_TYPE_CREATE', 'rbac', `“${d.label}” (${key})`); DB.save(); toast(`“${d.label}” তৈরি হয়েছে। এখন অনুমতি ও পাতা ঠিক করে দিন।`, 'success'); App.refresh();
  },
  /** Jump to ব্যবহারকারী ব্যবস্থাপনা → ব্যবহারকারী ধরন. */
  open() { Modal.close(); App.ui.usrTab = 'roles'; App.go(App.portals[App.route.portal]?.pages.some(x => x.id === 'user-admin') ? App.route.portal : 'admin', 'user-admin'); },
  /** Settings → ভূমিকা ও অনুমতি for one custom type (mode 'module' or 'pages'). */
  perms(key, mode) { App.ui.setTab = 'rbac'; App.ui.rbMode = mode; App.ui.rbRole = key; App.go(App.portals[App.route.portal]?.pages.some(x => x.id === 'settings') ? App.route.portal : 'admin', 'settings'); },
  del(key) { if (DB.s.userRoles.some(r => r.role === key)) return toast('এই ধরনের ব্যবহারকারী আছেন — আগে তাঁদের অন্য ধরনে নিন।', 'error'); if (!confirm('ধরনটি মুছে ফেলবেন?')) return; DB.s.customRoles = this.list().filter(r => r.key !== key); delete ROLES[key]; delete DB.s.rbac?.[key]; DB.save(); App.refresh(); },
};

/* ---------------- অধ্যক্ষের “ব্যবহারকারী” পাতা ---------------- */
const StaffUsers = {
  /** Account types the Principal manages: teachers and the custom types the Root User lets them add. */
  keys() { return ['TEACHER', ...CustomRoles.list().filter(r => r.principalCreates).map(r => r.key)]; },
  /** May the signed-in Principal manage this account? (never a Root User's or another Principal's) */
  mine(uid) { const r = DB.roles(uid), k = this.keys(); return uid !== App.session?.userId && r.some(x => k.includes(x)) && !r.some(x => ['ADMIN', 'SUPERADMIN', 'PRINCIPAL'].includes(x)); },
  /** The Principal's list (a tab of ব্যবহারকারী ব্যবস্থাপনা, js/modules/hubs.js). */
  panel() {
    const keys = this.keys(), q = String(App.ui.suQ || '').toLowerCase(), canReset = typeof PwHelp !== 'undefined' && PwHelp.canReset(), canDel = App.perm('system', 'delete');
    const list = DB.s.users.filter(u => DB.roles(u.id).some(r => keys.includes(r)) && (!q || `${u.name} ${u.nameBn || ''} ${u.username} ${u.phone || ''}`.toLowerCase().includes(q)));
    return `<div class="flex flex-wrap gap-2 mb-4"><button class="btn btn-primary" onclick="Users.create()">${icon('user-plus')} নতুন ব্যবহারকারী</button><input id="su-q" class="input flex-1 min-w-[12rem]" placeholder="নাম, ইউজার আইডি বা মোবাইল দিয়ে খুঁজুন" aria-label="খুঁজুন" value="${esc(App.ui.suQ || '')}" oninput="App.ui.suQ=this.value;clearTimeout(window.__suT);window.__suT=setTimeout(()=>{App.refresh();const i=document.getElementById('su-q');i&&(i.focus(),i.setSelectionRange(i.value.length,i.value.length))},250)"></div>
      <div class="card scroll-x"><table class="table"><thead><tr><th></th><th>নাম</th><th>ইউজার আইডি</th><th>ধরন</th><th>মোবাইল</th><th>অবস্থা</th><th></th></tr></thead><tbody>${list.map(u => { const m = this.mine(u.id); return `<tr class="${u.active ? '' : 'opacity-60'}"><td>${avatar(u, 30)}</td><td class="font-semibold">${typeof UserProfile !== 'undefined' ? `<button class="text-left hover:underline text-brand-700" onclick="UserProfile.open('${u.id}')">${esc(pn(u))}</button>` : esc(pn(u))}</td><td class="font-mono">${esc(u.username)}</td><td>${DB.roles(u.id).map(r => badge(bn(ROLES[r]?.label || r), 'blue')).join(' ')}</td><td>${esc(u.phone || '')}</td><td>${u.active ? badge('সক্রিয়', 'green') : badge('নিষ্ক্রিয়', 'slate')}</td>
        <td><div class="flex gap-1 justify-end">${m && canReset ? `<button class="btn btn-ghost btn-sm" title="পাসওয়ার্ড রিসেট" aria-label="পাসওয়ার্ড রিসেট" onclick="PwDesk.reset('${u.id}')">${icon('key-round')}</button>` : ''}${typeof ChildLink !== 'undefined' && GuardianCard.can() ? `<button class="btn btn-ghost btn-sm" title="সন্তান যুক্ত করুন" aria-label="সন্তান যুক্ত করুন" onclick="ChildLink.open('${u.id}')">${icon('baby')}</button>` : ''}${m ? `<button class="btn btn-ghost btn-sm" title="সক্রিয় / নিষ্ক্রিয়" aria-label="সক্রিয় / নিষ্ক্রিয়" onclick="StaffUsers.toggle('${u.id}')">${icon(u.active ? 'user-x' : 'user-check')}</button>` : ''}${m && canDel ? `<button class="btn btn-ghost btn-sm text-red-600" title="অ্যাকাউন্ট মুছুন" aria-label="অ্যাকাউন্ট মুছুন" onclick="Users.remove('${u.id}')">${icon('trash-2')}</button>` : ''}</div></td></tr>`; }).join('')}</tbody></table>${list.length ? '' : emptyState('কোনো ব্যবহারকারী নেই।', 'users')}</div>`;
  },
  toggle(uid) { if (!this.mine(uid)) return toast('অনুমতি নেই।', 'error'); Admin.toggleActive(uid); },
};

/* ---------------- পেমেন্ট গেটওয়ে (ওপেন-সোর্স / নিজস্ব সার্ভার) ---------------- */
const PayGw = {
  /** Off by default: online checkout needs the school's own payment server (provider + server address). */
  cfg() { const c = DB.s.config || (DB.s.config = {}); const g = c.payGw || (c.payGw = { provider: '', server: '', publishable: '', returnUrl: '' }); if (g.provider === 'demo') g.provider = ''; return g; },
  live() { const c = this.cfg(); return !!c.provider && !!c.server; },
  /** Ask the school's own payment server to create a session, then send the payer to the gateway's secure page. */
  async start(method, amount, ref) {
    const c = this.cfg();
    try {
      const r = await fetch(c.server.replace(/\/$/, '') + '/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: c.provider, method, amount, currency: 'BDT', reference: ref, return_url: c.returnUrl || location.origin + App.href('public', 'verify'), publishable_key: c.publishable }) });
      if (!r.ok) throw new Error(`সার্ভার উত্তর দিয়েছে ${r.status}`);
      const j = await r.json(); if (!j.redirect_url && !j.next_action?.redirect_to_url) throw new Error('সার্ভার থেকে পেমেন্ট লিংক পাওয়া যায়নি');
      location.href = j.redirect_url || j.next_action.redirect_to_url;
    } catch (e) { toast(`পেমেন্ট শুরু করা যায়নি: ${e.message}`, 'error'); }
  },
};
FeatureCfg.PARAMS['পেমেন্ট গেটওয়ে'] = [
  { k: 'pgProvider', label: 'গেটওয়ে', type: 'select', options: [['', 'বন্ধ — অনলাইন পেমেন্ট নেই (অফিসে বা TrxID দিয়ে পরিশোধ)'], ['hyperswitch', 'Hyperswitch (ওপেন-সোর্স, Apache-2.0)'], ['custom', 'নিজস্ব পেমেন্ট সার্ভার / অন্য গেটওয়ে']], get: () => PayGw.cfg().provider, set: v => (PayGw.cfg().provider = v) },
  { k: 'pgServer', label: 'প্রতিষ্ঠানের পেমেন্ট সার্ভারের ঠিকানা', type: 'url', get: () => PayGw.cfg().server, set: v => (PayGw.cfg().server = v.trim()) },
  { k: 'pgPub', label: 'পাবলিশেবল কী (গোপন নয় এমন কী)', type: 'text', get: () => PayGw.cfg().publishable, set: v => (PayGw.cfg().publishable = v.trim()) },
  { k: 'pgReturn', label: 'পেমেন্ট শেষে ফেরার ঠিকানা (ঐচ্ছিক)', type: 'url', get: () => PayGw.cfg().returnUrl, set: v => (PayGw.cfg().returnUrl = v.trim()) },
  { k: 'pgNote', type: 'note', label: 'গোপন এপিআই কী কখনো এখানে দেবেন না — তা শুধু পেমেন্ট সার্ভারে থাকে।' },
];

// custom user types must exist before the first page is drawn (logins and menus use ROLES)
(() => { const r0 = App.render; App.render = function () { if (!CustomRoles._done) { CustomRoles._done = true; try { CustomRoles.register(); } catch (e) { console.error(e); } } return r0.apply(this, arguments); }; })();
