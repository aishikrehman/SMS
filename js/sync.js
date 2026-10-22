/* ==========================================================================
   SERVER GLUE (loaded after every module, before start-up)
   · Start-up: first-run setup page, or "server unreachable" page, or App.boot().
   · Sign-in / sign-out through the server session (httpOnly cookie).
   · Public look-ups: an anonymous visitor's browser holds only the public part of
     the data, so result search, verification, service-desk identity check and
     application tracking first fetch the one record they need from the server
   (the result search calls the server itself: js/modules/pubresult.js).
   The data sync itself (load, save, public submissions) lives in js/db.js.
   ========================================================================== */
const Sync = {
  anon() { return DB.remote.on && !DB.remote.userId; },

  /* ---------------- start-up ---------------- */
  async start() {
    const mode = await DB.ready();
    if (mode === 'ok' && DB.remote.mustChange) return this.passwordPage();
    if (mode === 'ok') {
      App.boot();
      // the server session (cookie) is the truth: reopen the dashboard of the signed-in account
      if (DB.remote.userId && !App.session) App.login(DB.remote.userId);
      return;
    }
    if (mode === 'setup') return this.setupPage();
    this.offlinePage();
  },
  shell(html) {
    // full-page screens (forced password change, setup, offline) replace everything — never leave the login pop-up on top
    try { if (typeof Modal !== 'undefined') Modal.close(); } catch (e) { }
    document.getElementById('a11y-panel')?.classList.add('hidden');
    try { Theme.apply({ primary: '#006a4e', accent: '#f42a41', font: 'Inter', headingFont: 'Source Serif 4', bnFont: 'Noto Serif Bengali', baseSize: 15, radius: 10, surface: '#f6f8f7' }); } catch (e) { /* plain colours */ }
    $('#topbar').innerHTML = '';
    $('#view').innerHTML = `<main class="min-h-screen flex items-start sm:items-center justify-center px-4 py-10">${html}</main>`;
    App.icons();
  },
  offlinePage() {
    this.shell(`<div class="card p-6 max-w-md w-full text-center space-y-3">${icon('server-off', 'w-10 h-10 mx-auto text-red-600')}
      <h1 class="text-lg font-bold">সার্ভারের সঙ্গে সংযোগ পাওয়া যায়নি</h1>
      <p class="text-slate-600">কিছুক্ষণ পর আবার চেষ্টা করুন। সমস্যা থাকলে প্রতিষ্ঠানের আইটি দপ্তরে যোগাযোগ করুন।</p>
      <button class="btn btn-primary" onclick="location.reload()">${icon('rotate-cw')} আবার চেষ্টা করুন</button></div>`);
  },

  /* ---------------- forced password change (temporary password from the office) ----------------
     The server refuses every other request of this session until the password is changed. */
  passwordPage() {
    this.shell(`<form id="pw-force" class="card w-full max-w-md p-6 space-y-4" novalidate>
      <h1 class="text-lg font-bold flex items-center gap-2">${icon('key-round', 'w-6 h-6 text-brand-600')} নতুন পাসওয়ার্ড দিন</h1>
      <p class="text-slate-600">আপনি অস্থায়ী পাসওয়ার্ড দিয়ে লগইন করেছেন। নিরাপত্তার জন্য এখনই নিজের পাসওয়ার্ড ঠিক করুন; এরপর সব ডিভাইস থেকে আগের সেশন বন্ধ হয়ে যাবে।</p>
      <div><label class="label" for="pf-cur">বর্তমান (অস্থায়ী) পাসওয়ার্ড</label><input class="input" id="pf-cur" name="current" type="password" autocomplete="current-password" required></div>
      <div><label class="label" for="pf-new">নতুন পাসওয়ার্ড</label><input class="input" id="pf-new" name="next" type="password" minlength="10" autocomplete="new-password" required><p class="text-xs text-slate-500 mt-1">কমপক্ষে ১০ অক্ষর, অক্ষর ও সংখ্যা দুটোই থাকবে, ইউজার আইডি থাকবে না</p></div>
      <div><label class="label" for="pf-new2">নতুন পাসওয়ার্ড আবার লিখুন</label><input class="input" id="pf-new2" name="next2" type="password" autocomplete="new-password" required></div>
      <div id="pf-err" class="text-red-600 hidden" role="alert"></div>
      <div class="flex gap-2"><button class="btn btn-primary flex-1">${icon('check')} পাসওয়ার্ড বদলান</button><button type="button" class="btn btn-ghost" id="pf-out">${icon('log-out')} লগআউট</button></div>
    </form>`);
    const err = $('#pf-err'), show = m => { err.textContent = m; err.classList.remove('hidden'); };
    $('#pf-out').addEventListener('click', async () => { try { await DB.api('logout', {}); } catch (e) { } location.reload(); });
    $('#pw-force').addEventListener('submit', async e => {
      e.preventDefault();
      const d = formData(e.target);
      if (d.next !== d.next2) return show('দুটি নতুন পাসওয়ার্ড মেলেনি।');
      try { await DB.api('password', { current: d.current, next: d.next }); location.reload(); }
      catch (x) { show(x.message === 'wrong_current' ? 'বর্তমান পাসওয়ার্ড সঠিক নয়।' : x.message === 'same' ? 'নতুন পাসওয়ার্ড আগেরটির মতো হতে পারবে না।' : (x.data && x.data.message) || 'পাসওয়ার্ড বদলানো যায়নি — আবার চেষ্টা করুন।'); }
    });
  },

  /* ---------------- first-run setup (only while the server has no user) ---------------- */
  setupPage() {
    const types = (typeof INSTITUTION_TYPES !== 'undefined' ? INSTITUTION_TYPES : ['সাধারণ বিদ্যালয়']);
    const F = (name, label, attrs = '', hint = '') => `<div><label class="label" for="su-${name}">${label}</label><input class="input" id="su-${name}" name="${name}" ${attrs}>${hint ? `<p class="text-xs text-slate-500 mt-1">${hint}</p>` : ''}</div>`;
    this.shell(`<form id="setup-form" class="card w-full max-w-2xl p-6 sm:p-8 space-y-6" novalidate>
      <div><h1 class="text-xl font-bold text-slate-900 flex items-center gap-2">${icon('school', 'w-6 h-6 text-brand-600')} প্রাথমিক সেটআপ</h1>
        <p class="text-slate-600 mt-1">প্রতিষ্ঠানের মৌলিক তথ্য দিন এবং রুট ব্যবহারকারী তৈরি করুন। এই পাতা শুধু একবারই দেখা যাবে; পরে বাকি সব সেটিংস ড্যাশবোর্ড থেকে ঠিক করা যাবে।</p></div>
      <fieldset class="grid sm:grid-cols-2 gap-4"><legend class="font-semibold mb-2">প্রতিষ্ঠান</legend>
        ${F('nameBn', 'প্রতিষ্ঠানের নাম (বাংলায়) *', 'required maxlength="120"')}
        ${F('name', 'প্রতিষ্ঠানের নাম (ইংরেজিতে) *', 'required maxlength="120" lang="en"')}
        <div><label class="label" for="su-type">প্রতিষ্ঠানের ধরন *</label><select class="select" id="su-type" name="type">${types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}</select></div>
        ${F('eiin', 'ইআইআইএন (ঐচ্ছিক)', 'inputmode="numeric" maxlength="8"')}
      </fieldset>
      <fieldset class="grid sm:grid-cols-2 gap-4"><legend class="font-semibold mb-2">রুট ব্যবহারকারী (সব সেটিংস ও ব্যবহারকারী তৈরির দায়িত্বে)</legend>
        ${F('rootName', 'পূর্ণ নাম (ইংরেজিতে) *', 'required maxlength="120" lang="en" autocomplete="name"')}
        ${F('rootNameBn', 'পূর্ণ নাম (বাংলায়)', 'maxlength="120"')}
        ${F('username', 'ইউজার আইডি *', 'required maxlength="20" autocomplete="username" autocapitalize="none" spellcheck="false"', 'ছোট হাতের ইংরেজি অক্ষর, সংখ্যা, _ বা . — ৩ থেকে ২০ অক্ষর')}
        ${F('phone', 'মোবাইল নম্বর *', 'required inputmode="tel" maxlength="14" autocomplete="tel" placeholder="01XXXXXXXXX"')}
        <div class="sm:col-span-2">${F('email', 'ই-মেইল *', 'required type="email" maxlength="120" autocomplete="email"')}</div>
        ${F('password', 'পাসওয়ার্ড *', 'required type="password" minlength="10" autocomplete="new-password"', 'কমপক্ষে ১০ অক্ষর, অক্ষর ও সংখ্যা দুটোই থাকবে, ইউজার আইডি থাকবে না')}
        ${F('password2', 'পাসওয়ার্ড আবার লিখুন *', 'required type="password" minlength="10" autocomplete="new-password"')}
      </fieldset>
      <div id="setup-err" class="text-red-600 hidden" role="alert"></div>
      <button class="btn btn-primary w-full">${icon('check')} সেটআপ সম্পন্ন করুন</button>
    </form>`);
    $('#setup-form').addEventListener('submit', e => { e.preventDefault(); this.submitSetup(e.target); });
  },
  async submitSetup(form) {
    const d = formData(form), err = $('#setup-err'), btn = form.querySelector('button');
    const show = m => { err.textContent = m; err.classList.remove('hidden'); err.scrollIntoView({ block: 'nearest' }); };
    const phone = U.asciiDigits(d.phone).replace(/[\s-]/g, '').replace(/^\+?88/, '');
    if (d.password !== d.password2) return show('দুটি পাসওয়ার্ড মেলেনি।');
    const MSG = { nameBn: 'প্রতিষ্ঠানের বাংলা নাম লিখুন।', name: 'প্রতিষ্ঠানের ইংরেজি নাম লিখুন।', type: 'প্রতিষ্ঠানের ধরন বেছে নিন।', eiin: 'ইআইআইএন ৫ থেকে ৮ অঙ্কের সংখ্যা হবে।', rootName: 'রুট ব্যবহারকারীর নাম লিখুন।', username: 'ইউজার আইডি ঠিক নেই — ছোট হাতের ইংরেজি অক্ষর, সংখ্যা, _ বা . দিয়ে ৩–২০ অক্ষর।', phone: 'সঠিক মোবাইল নম্বর লিখুন (01XXXXXXXXX)।', email: 'সঠিক ই-মেইল ঠিকানা লিখুন।', password: 'পাসওয়ার্ড নিয়ম মানেনি।' };
    btn.disabled = true;
    try {
      const r = await DB.api('setup', { school: { nameBn: d.nameBn, name: d.name, type: d.type, eiin: U.asciiDigits(d.eiin) }, root: { name: d.rootName, nameBn: d.rootNameBn, username: d.username.trim().toLowerCase(), phone, email: d.email, password: d.password } });
      await DB.reloadRemote();
      App.boot();
      App.login(r.userId);
    } catch (e) {
      btn.disabled = false;
      if (e.status === 409) return show('সেটআপ আগেই সম্পন্ন হয়েছে। পাতাটি আবার লোড করে লগইন করুন।');
      if (e.data && e.data.fields) return show(e.data.fields.map(f => f === 'password' && e.data.message ? e.data.message : MSG[f]).filter(Boolean).join(' '));
      show('সার্ভারের সঙ্গে যোগাযোগ করা যায়নি — আবার চেষ্টা করুন।');
    }
  },

  /* ---------------- sign-in / sign-out ---------------- */
  async signIn(f, errEl, btn) {
    const fail = m => { if (errEl) { errEl.textContent = m; errEl.classList.remove('hidden'); } else toast(m, 'error'); };
    if (btn) btn.disabled = true;
    try {
      const r = await DB.api('login', { username: String(f.username || '').trim(), password: f.password || '' });
      await DB.flush();               // anything an anonymous visitor submitted goes first
      if (r.mustChange) return this.passwordPage();
      await DB.reloadRemote();        // now the signed-in view of the data
      App.login(r.userId);
    } catch (e) {
      const wait = Math.max(1, Math.ceil(((e.data && e.data.retryAfter) || 900) / 60));
      fail(e.message === 'invalid' ? 'ব্যবহারকারীর নাম বা পাসওয়ার্ড সঠিক নয়।' : e.message === 'too_many' ? `অনেকবার ভুল চেষ্টা হয়েছে — ${typeof bnNum === 'function' ? bnNum(wait) : wait} মিনিট পর আবার চেষ্টা করুন।` : e.message === 'inactive' ? 'অ্যাকাউন্টটি নিষ্ক্রিয় করা হয়েছে।' : 'সার্ভারের সঙ্গে যোগাযোগ করা যায়নি — আবার চেষ্টা করুন।');
    } finally { if (btn) btn.disabled = false; }
  },

  /* ---------------- public look-ups ---------------- */
  /** Merge records sent by the server into the in-memory state (an anonymous visitor's copy only). */
  hydrate(h) {
    if (!h) return;
    const keyOf = { certificates: x => x.serial, marks: x => `${x.examId}|${x.studentId}|${x.subjectId}`, guardianLinks: x => `${x.guardianUserId}|${x.studentId}` };
    Object.entries(h).forEach(([k, list]) => {
      if (!Array.isArray(list)) return;
      const cur = Array.isArray(DB.s[k]) ? DB.s[k] : (DB.s[k] = []), id = keyOf[k] || (x => x.id);
      list.forEach(x => { if (!x) return; const i = cur.findIndex(y => y && id(y) === id(x)); if (i >= 0) cur[i] = x; else cur.push(x); });
      DB.remote.base[k] = JSON.stringify(cur);
    });
  },
  async lookup(body) {
    try { await DB.flush(); const d = await DB.api('public/lookup', body); this.hydrate(d.hydrate); return d; }
    catch (e) { toast('সার্ভারের সঙ্গে যোগাযোগ করা যায়নি — আবার চেষ্টা করুন।', 'error'); return null; }
  },
  /** Forms whose original handler needs one private record: fetch it first, then let the handler run. */
  FORMS: {
    'pub-id': d => ({ kind: 'identity', sid: d.sid, reg: d.reg, phone: d.phone }),
    'svc-track': d => ({ kind: 'service', id: d.id }),
    'car-track': d => ({ kind: 'jobapp', ref: d.ref, phone: d.phone }),
  },
  verifyDone: new Set(),
};

/* Submit interception (capture phase, before the page's own handler). */
document.addEventListener('submit', e => {
  const f = e.target, spec = f && Sync.FORMS[f.id];
  if (!spec || !Sync.anon() || f._syncPass) return;
  e.preventDefault(); e.stopImmediatePropagation();
  Sync.lookup(spec(formData(f))).finally(() => { f._syncPass = true; try { f.requestSubmit(); } finally { f._syncPass = false; } });
}, true);

/* Verify page: codes arrive from the form or from a QR-code link, so look up before rendering. */
(() => {
  const page = App.portals.public.pages.find(p => p.id === 'verify'); if (!page) return;
  const r0 = page.render;
  page.render = function (q = {}) {
    const code = (q.code || App.ui.verCode || q.ref || App.ui.trackTerm || '').trim();
    if (!Sync.anon() || !code) return r0.call(this, q);
    const type = q.type || (typeof Site !== 'undefined' ? Site.detect(code) : 'tc'), key = `${type}|${code}`;
    if (Sync.verifyDone.has(key)) return r0.call(this, q);
    Sync.lookup({ kind: 'verify', code, type }).then(() => { Sync.verifyDone.add(key); App.refresh(); });
    // meanwhile: the empty search page
    const keep = [App.ui.verCode, App.ui.trackTerm]; App.ui.verCode = ''; App.ui.trackTerm = '';
    try { return r0.call(this, { ...q, code: '', ref: '' }); } finally { [App.ui.verCode, App.ui.trackTerm] = keep; }
  };
})();

/* Sign-in only for the account the server session belongs to; sign-out ends the server session. */
(() => {
  const l0 = App.login.bind(App), o0 = App.logout.bind(App);
  App.login = function (userId, ...rest) {
    if (DB.remote.userId !== userId) { App.showLogin(); return; }
    return l0(userId, ...rest);
  };
  App.logout = async function (...args) {
    const out = o0(...args);
    await DB.flush();
    try { await DB.api('logout', {}); } catch (e) { /* the session ends on the server anyway when it expires */ }
    try { await DB.reloadRemote(); } catch (e) { return location.reload(); }
    if (typeof Undo !== 'undefined') Undo.start();
    App.render();
    return out;
  };
})();

/* Server backups (Root User): the "ব্যাকআপ ও পুনরুদ্ধার" tab and the System page's backup card use the
   real backups on the server (api/admin/backups) instead of browser-side JSON copies. Restoring is a
   server task (npm run restore -- <file>, see DEPLOY.md) because it replaces every user's data. */
const ServerBackup = {
  list: null, info: null, busy: false,
  async load() {
    try { const d = await DB.api('admin/backups', undefined, 'GET'); this.list = d.backups || []; this.info = d; }
    catch (e) { this.list = []; this.info = { error: e.status === 403 ? 'forbidden' : 'offline' }; }
    if (typeof App !== 'undefined' && App.refresh) App.refresh();
  },
  kind: k => ({ daily: 'দৈনিক স্বয়ংক্রিয়', manual: 'হাতে নেওয়া', cli: 'কমান্ড থেকে', prerestore: 'পুনরুদ্ধারের আগের কপি' }[k] || k),
  async create() {
    if (this.busy) return; this.busy = true;
    try {
      const r = await DB.api('admin/backups', {});
      (DB.s.backups || (DB.s.backups = [])).push({ id: DB.id('BK'), ts: new Date().toISOString(), kind: 'Server backup', sizeKb: Math.round(r.backup.size / 1024), status: 'Saved on server', by: DB.remote.userId, file: r.backup.name });
      DB.save(); toast('সার্ভারে ব্যাকআপ নেওয়া হয়েছে।', 'success');
    } catch (e) { toast(e.status === 403 ? 'শুধু রুট ব্যবহারকারী ব্যাকআপ নিতে পারেন।' : 'ব্যাকআপ নেওয়া যায়নি — সার্ভারের লগ দেখুন।', 'error'); }
    finally { this.busy = false; this.load(); }
  },
  download(name) { location.href = '/api/admin/backups/' + encodeURIComponent(name); },
  panel() {
    if (this.list === null) { this.load(); return `<div class="card p-5">${icon('loader')} সার্ভারের ব্যাকআপ তালিকা আনা হচ্ছে…</div>`; }
    if (this.info && this.info.error) return `<div class="card p-5 text-slate-600">${this.info.error === 'forbidden' ? 'সার্ভারের ব্যাকআপ শুধু রুট ব্যবহারকারী দেখতে ও নিতে পারেন।' : 'সার্ভারের সঙ্গে যোগাযোগ করা যায়নি।'}</div>`;
    const i = this.info || {}, mb = n => `${bnNum((n / 1048576).toFixed(2))} এমবি`;
    return `<div class="grid lg:grid-cols-3 gap-5">
      <div class="lg:col-span-2 card"><div class="px-5 py-3 border-b border-slate-100 font-semibold flex flex-wrap justify-between items-center gap-2">সার্ভারের ব্যাকআপ
        <div class="flex flex-wrap gap-2"><button class="btn btn-primary btn-sm" onclick="ServerBackup.create()" ${this.busy ? 'disabled' : ''}>${icon('database-backup')} এখনই ব্যাকআপ নিন</button><button class="btn btn-ghost btn-sm" onclick="ServerBackup.load()">${icon('rotate-cw')} হালনাগাদ</button></div></div>
        <div class="scroll-x max-h-[55vh] overflow-y-auto"><table class="table text-sm"><thead><tr><th>ফাইল</th><th>সময়</th><th>ধরন</th><th class="text-right">আকার</th><th></th></tr></thead><tbody>
        ${this.list.map(b => `<tr><td class="font-mono text-xs">${esc(b.name)}</td><td class="whitespace-nowrap">${U.fmtTime(b.createdAt)}</td><td>${esc(this.kind(b.kind))}</td><td class="text-right whitespace-nowrap">${mb(b.size)}</td><td><button class="btn btn-ghost btn-sm" onclick="ServerBackup.download('${esc(b.name)}')">${icon('download')} ডাউনলোড</button></td></tr>`).join('') || `<tr><td colspan="5">${emptyState('সার্ভারে এখনো কোনো ব্যাকআপ নেই।', 'database')}</td></tr>`}
        </tbody></table></div></div>
      <div class="space-y-5"><div class="card p-5 text-sm space-y-2"><div class="font-semibold flex items-center gap-2">${icon('shield-check', 'w-4 h-4 text-brand-600')} নিয়ম</div>
        <ul class="list-disc pl-5 text-slate-600 space-y-1">
          <li>${i.auto ? `প্রতিদিন রাত ${bnNum(i.hour)}টার পর সার্ভার নিজে একটি ব্যাকআপ নেয়।` : 'স্বয়ংক্রিয় দৈনিক ব্যাকআপ বন্ধ আছে (BACKUP_AUTO)।'}</li>
          <li>${bnNum(i.keepDays)} দিনের পুরোনো ব্যাকআপ মুছে যায়; সর্বশেষ তিনটি সবসময় থাকে।</li>
          <li>ব্যাকআপ ফাইলে সব ব্যক্তিগত তথ্য আছে — ডাউনলোড করে প্রতিষ্ঠানের বাইরে নিরাপদ (এনক্রিপ্ট করা) জায়গায় রাখুন।</li>
        </ul></div>
        <div class="card p-5 text-sm space-y-2"><div class="font-semibold flex items-center gap-2">${icon('triangle-alert', 'w-4 h-4 text-amber-500')} পুনরুদ্ধার</div>
          <p class="text-slate-600">পুনরুদ্ধার সবার তথ্য বদলে দেয়, তাই এটি সার্ভারে করতে হয়: সার্ভার বন্ধ করে <code class="bg-slate-100 px-1 rounded">npm run restore -- ফাইলের-নাম</code> চালান, তারপর আবার চালু করুন (DEPLOY.md দেখুন)।</p></div>
        <div class="card p-5 text-sm space-y-2"><div class="font-semibold">অন্য ফরম্যাটে এক্সপোর্ট</div>
          <div class="flex flex-wrap gap-2">${typeof DataIO !== 'undefined' && DataIO.backupJson ? `<button class="btn btn-ghost btn-sm" onclick="DataIO.backupJson()">${icon('download')} JSON</button>` : ''}${typeof DataIO !== 'undefined' && DataIO.exportSql ? `<button class="btn btn-ghost btn-sm" onclick="DataIO.exportSql()">${icon('file-code')} SQL</button>` : ''}</div></div></div></div>`;
  },
};
(() => {
  if (typeof DataIO !== 'undefined') DataIO.renderBackup = () => ServerBackup.panel();
  if (typeof Admin !== 'undefined') {
    Admin.backup = () => ServerBackup.create();
    Admin.restore = () => toast('পুনরুদ্ধার সার্ভারে করতে হয়: npm run restore -- ফাইলের-নাম (DEPLOY.md দেখুন)।', 'warn');
  }
})();

/* School-wide daily jobs (fee reminders, late fines) need every invoice, which only staff receive from
   the server; a teacher's, student's or guardian's browser skips them. */
(() => {
  const staff = () => { const uid = DB.remote.userId; return !!uid && (DB.s.userRoles || []).some(r => r.userId === uid && !['TEACHER', 'STUDENT', 'GUARDIAN'].includes(r.role)); };
  const only = fn => function (...a) { return staff() ? fn.apply(this, a) : 0; };
  if (typeof DB.runReminders === 'function') DB.runReminders = only(DB.runReminders);
  if (typeof Fees !== 'undefined' && typeof Fees.applyLateFines === 'function') Fees.applyLateFines = only(Fees.applyLateFines);
})();
