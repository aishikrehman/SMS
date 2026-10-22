/* ==========================================================================
   ROOT USER OPERATIONS & PRODUCT INFORMATION
   · ডেভেলপার তথ্য — product, version, developer company and support contacts. They come from the server
     (server/config.js → DEVELOPER_*), never from the school's data, so schools cannot change them.
     Reached from the user menu and the sidebar footer of every dashboard, and from the website footer credit.
   · রক্ষণাবেক্ষণ মোড — the Root User takes the public website, or the whole system, offline with a Bangla
     message and an optional end time. The server enforces it (503 + maintenance page data, server/lib/rootops.js);
     signed-in Root Users keep working and see a banner.
   · ওয়েবসাইট রিসেট — theme, hero, homepage sections, menus, pages and footer back to the defaults, after a
     server backup, with a typed confirmation phrase and an audit entry. School data is not touched.
   ========================================================================== */
const DevInfo = {
  info() { return (DB.remote && DB.remote.about) || { product: 'Dhee SMS', company: 'DHEE', version: '' }; },
  /** The website footer credit can be switched off per plan (DEVELOPER_CREDIT=false on the server). */
  credit() { return this.info().credit !== false; },
  open() {
    $('#user-menu')?.classList.add('hidden');
    const d = this.info(), row = (ic, k, v) => v ? `<div class="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">${icon(ic, 'w-5 h-5 text-brand-600 shrink-0 mt-0.5')}<dt class="w-32 shrink-0 text-slate-500">${k}</dt><dd class="font-medium min-w-0 break-words">${v}</dd></div>` : '';
    const link = (href, text) => `<a class="text-brand-700 underline" href="${esc(href)}" ${/^https?:/.test(href) ? 'target="_blank" rel="noopener"' : ''} data-noi18n>${esc(text)}</a>`;
    Modal.open({ title: 'ডেভেলপার তথ্য', size: 'md', popup: true, body: `<div class="flex items-center gap-3 mb-4"><span class="w-12 h-12 rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">${icon('graduation-cap', 'w-6 h-6')}</span>
        <div class="min-w-0"><div class="font-bold text-lg" data-noi18n>${esc(d.product || 'Dhee SMS')}</div><div class="text-slate-500">শিক্ষাপ্রতিষ্ঠান ব্যবস্থাপনা ও ওয়েবসাইট</div></div></div>
      <dl>${row('tag', 'সংস্করণ', d.version ? `<span data-noi18n>${esc(d.version)}</span>` : '')}${row('building-2', 'ডেভেলপার', `<span data-noi18n>${esc(d.company || 'DHEE')}</span>`)}
        ${row('globe', 'ওয়েবসাইট', d.website ? link(d.website, d.website.replace(/^https?:\/\//, '')) : '')}${row('mail', 'সহায়তা ই-মেইল', d.email ? link('mailto:' + d.email, d.email) : '')}
        ${row('phone', 'সহায়তা ফোন', d.phone ? link('tel:' + String(d.phone).replace(/[^\d+]/g, ''), d.phone) : '')}${row('clock', 'সহায়তার সময়', d.hours ? esc(d.hours) : '')}${row('map-pin', 'ঠিকানা', d.address ? esc(d.address) : '')}</dl>
      ${d.email || d.phone || d.website ? '' : '<p class="text-slate-500 mt-2">সহায়তার জন্য প্রতিষ্ঠানের আইটি দপ্তরে যোগাযোগ করুন।</p>'}` });
  },
};

const Maint = {
  PHRASE: 'ওয়েবসাইট রিসেট',
  info() { return (DB.remote && DB.remote.maint) || null; },
  untilText(m) { return m && m.until ? `${U.fmtDate(String(m.until).slice(0, 10))} ${U.bn(new Date(m.until).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))}` : ''; },
  /** Top-bar notice for signed-in users while maintenance is on (the Root User keeps working). */
  banner() {
    const m = this.info(); if (!m || !App.session) return '';
    const what = m.system ? 'সম্পূর্ণ সিস্টেম' : 'পাবলিক ওয়েবসাইট';
    const txt = m.root ? `রক্ষণাবেক্ষণ মোড চালু: ${what} অন্যদের জন্য বন্ধ${m.until ? ` (${this.untilText(m)} পর্যন্ত)` : ''}। আপনি রুট ব্যবহারকারী হিসেবে কাজ করতে পারছেন।` : `পাবলিক ওয়েবসাইট এখন রক্ষণাবেক্ষণে আছে${m.until ? ` (${this.untilText(m)} পর্যন্ত)` : ''}।`;
    const link = m.root && App.portals.admin?.pages.some(p => p.id === 'maintenance') ? ` <a class="underline font-bold" href="${App.href('admin', 'maintenance')}">বদলান</a>` : '';
    return `<div class="bg-amber-500 text-white font-semibold text-center py-1.5 px-4" role="status">${icon('construction', 'w-4 h-4 inline -mt-0.5')} ${esc(txt)}${link}</div>`;
  },
  /** The page everyone who is kept out sees (also when the browser cannot boot the app). */
  gateHtml() {
    const m = this.info() || {}, s = DB.s?.school || {}, signed = !!DB.remote.userId;
    return `<div class="card w-full max-w-lg p-6 sm:p-8 text-center space-y-4">
      <div class="flex justify-center">${s.logo ? `<img src="${s.logo}" alt="" class="h-16 w-16 object-contain">` : `<span class="w-16 h-16 rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center">${icon('construction', 'w-8 h-8')}</span>`}</div>
      <div><div class="font-heading font-bold text-xl" data-noi18n>${esc(s.nameBn || s.name || '')}</div>${s.nameBn && s.name ? `<div class="text-slate-500" data-noi18n>${esc(s.name)}</div>` : ''}</div>
      <h1 class="text-lg font-bold flex items-center justify-center gap-2">${icon('construction', 'w-5 h-5 text-amber-600')} রক্ষণাবেক্ষণের কাজ চলছে</h1>
      <p class="text-slate-700 whitespace-pre-line">${esc(m.message || 'সাইটটি সাময়িকভাবে বন্ধ আছে। কিছুক্ষণ পর আবার চেষ্টা করুন।')}</p>
      ${m.until ? `<p class="text-slate-600">${icon('clock', 'w-4 h-4 inline -mt-0.5')} আনুমানিক চালু হবে: <b>${esc(this.untilText(m))}</b></p>` : ''}
      ${s.phone || s.email ? `<p class="text-slate-500">যোগাযোগ: ${esc([s.phone, s.email].filter(Boolean).join(' · '))}</p>` : ''}
      ${signed ? `<button class="btn btn-ghost" onclick="Maint.signOut()">${icon('log-out')} লগআউট</button>`
        : `<details class="text-left"><summary class="cursor-pointer text-brand-700 font-semibold text-center">রুট ব্যবহারকারীর লগইন</summary>
          <form id="mt-login" class="space-y-3 mt-3"><div><label class="label" for="mt-u">ইউজার আইডি</label><input id="mt-u" class="input" name="username" autocomplete="username" required></div>
            <div><label class="label" for="mt-p">পাসওয়ার্ড</label><input id="mt-p" class="input" type="password" name="password" autocomplete="current-password" required></div>
            <div id="mt-err" class="text-red-600 hidden" role="alert"></div><button class="btn btn-primary w-full">${icon('log-in')} লগইন</button></form></details>`}
    </div>`;
  },
  mountGate() {
    $('#mt-login')?.addEventListener('submit', async e => {
      e.preventDefault(); const f = formData(e.target), err = $('#mt-err'), btn = e.target.querySelector('button');
      btn.disabled = true;
      try { await DB.api('login', { username: String(f.username || '').trim(), password: f.password || '' }); location.reload(); }
      catch (x) { btn.disabled = false; err.textContent = x.message === 'invalid' ? 'ব্যবহারকারীর নাম বা পাসওয়ার্ড সঠিক নয়।' : x.message === 'too_many' ? 'অনেকবার ভুল চেষ্টা হয়েছে — পরে আবার চেষ্টা করুন।' : 'লগইন করা যায়নি — আবার চেষ্টা করুন।'; err.classList.remove('hidden'); }
    });
  },
  async signOut() { try { await DB.api('logout', {}); } catch (e) { } location.reload(); },
  /** Whole-screen maintenance page (the app is not started). */
  gate() {
    Sync.shell(this.gateHtml());
    try { if (DB.s?.theme) Theme.apply({ ...DB.s.theme }); } catch (e) { }
    this.mountGate(); App.icons(); this.reloadAtEnd();
  },
  reloadAtEnd() {
    const m = this.info(), t = m && m.until ? Date.parse(m.until) - Date.now() : NaN;
    if (Number.isFinite(t) && t > 0 && t < 864e5 && !this._timer) this._timer = setTimeout(() => location.reload(), t + 3000);
  },

  /* ----- Root User page: সিস্টেম → রক্ষণাবেক্ষণ ও রিসেট ----- */
  page() {
    const m = DB.s.maintenance || {}, on = this.info(), mode = m.system ? 'system' : m.site ? 'site' : 'off';
    const local = v => { if (!v) return ''; const d = new Date(v), z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; };
    const opt = (v, l, hint) => `<label class="card p-3 flex items-start gap-3 cursor-pointer ${mode === v ? 'border-brand-400 bg-brand-50/50' : ''}"><input type="radio" name="mode" value="${v}" class="mt-1.5" ${mode === v ? 'checked' : ''}><span><b>${l}</b><span class="block text-slate-500">${hint}</span></span></label>`;
    return pageHeader('রক্ষণাবেক্ষণ ও রিসেট', '',`<button class="btn btn-ghost" onclick="DevInfo.open()">${icon('info')} ডেভেলপার তথ্য</button>`)
      + `<div class="grid xl:grid-cols-2 gap-5 items-start">
        <section class="card p-5" aria-labelledby="mt-h1"><h2 id="mt-h1" class="font-semibold text-lg flex flex-wrap items-center gap-2 mb-1">${icon('construction', 'w-5 h-5 text-amber-600')} রক্ষণাবেক্ষণ মোড ${on ? badge(on.system ? 'সম্পূর্ণ সিস্টেম বন্ধ' : 'ওয়েবসাইট বন্ধ', 'amber') : badge('বন্ধ', 'green')}</h2>
          <form id="mt-form" class="space-y-3 mt-3">
            <div class="grid gap-2">${opt('off', 'বন্ধ', 'সবাই স্বাভাবিকভাবে ব্যবহার করবেন।')}${opt('site', 'শুধু পাবলিক ওয়েবসাইট', 'ওয়েবসাইট ও পাবলিক সেবা (ভর্তি, ফলাফল, যাচাই) বন্ধ; ড্যাশবোর্ড চালু থাকবে।')}${opt('system', 'সম্পূর্ণ সিস্টেম', 'ওয়েবসাইট ও সব ড্যাশবোর্ড বন্ধ; শুধু রুট ব্যবহারকারী ঢুকতে পারবেন।')}</div>
            <div><label class="label" for="mt-msg">বার্তা (বাংলায়)</label><textarea id="mt-msg" class="textarea" name="message" rows="3" maxlength="500" placeholder="যেমন: সার্ভার হালনাগাদের কাজ চলছে। রাত ১০টার মধ্যে আবার চালু হবে।">${esc(m.message || '')}</textarea></div>
            <div><label class="label" for="mt-until">শেষ সময় (ঐচ্ছিক)</label><input id="mt-until" class="input" type="datetime-local" name="until" value="${local(m.until)}"></div>
            <button class="btn btn-primary">${icon('save')} সংরক্ষণ করুন</button>
          </form></section>
        <section class="card p-5 border-red-200" aria-labelledby="mt-h2"><h2 id="mt-h2" class="font-semibold text-lg flex items-center gap-2 mb-1">${icon('rotate-ccw', 'w-5 h-5 text-red-600')} ওয়েবসাইট রিসেট</h2>
          <p class="text-slate-600">থিম ও রং, হিরো অংশ, হোমপেজের অংশসমূহ, মেনু ও ইউআরএল, কাস্টম পৃষ্ঠা, পৃষ্ঠার ব্যানার, পরিচিতি পাতা ও ফুটার শুরুর অবস্থায় ফিরে যাবে।</p>
          <ul class="list-disc pl-5 text-slate-600 my-3 space-y-1"><li>শিক্ষার্থী, শিক্ষক, ফলাফল, হিসাব, নোটিশ, একাডেমিক কার্যক্রম ও গ্যালারির ছবি যেমন আছে তেমনই থাকবে।</li><li>রিসেটের আগে সার্ভারে একটি ব্যাকআপ নেওয়া হবে, আর অডিট লগে লেখা থাকবে।</li></ul>
          <form id="mt-reset" class="space-y-3"><div><label class="label" for="mt-phrase">নিশ্চিত করতে লিখুন: <b>${this.PHRASE}</b></label><input id="mt-phrase" class="input" name="phrase" autocomplete="off" spellcheck="false"></div>
            <button class="btn btn-danger" id="mt-reset-btn" disabled>${icon('rotate-ccw')} ওয়েবসাইট রিসেট করুন</button></form></section></div>`;
  },
  mount() {
    $('#mt-form')?.addEventListener('submit', async e => {
      e.preventDefault(); const f = formData(e.target), btn = e.target.querySelector('button');
      const until = f.until ? new Date(f.until) : null;
      if (until && until <= new Date()) return toast('শেষ সময় ভবিষ্যতের হতে হবে।', 'error');
      if (f.mode === 'system' && !confirm('সম্পূর্ণ সিস্টেম বন্ধ করবেন? রুট ব্যবহারকারী ছাড়া সবাই লগআউট অবস্থায় রক্ষণাবেক্ষণ পাতা দেখবেন।')) return;
      btn.disabled = true;
      try {
        const r = await DB.api('admin/maintenance', { site: f.mode === 'site' || f.mode === 'system', system: f.mode === 'system', message: f.message || '', until: until ? until.toISOString() : null });
        DB.s.maintenance = r.maintenance; DB.remote.base.maintenance = JSON.stringify(r.maintenance); DB.remote.maint = r.info || null;
        toast(f.mode === 'off' ? 'রক্ষণাবেক্ষণ মোড বন্ধ করা হয়েছে।' : 'রক্ষণাবেক্ষণ মোড চালু হয়েছে।', f.mode === 'off' ? 'success' : 'warn'); App.render();
      } catch (x) { btn.disabled = false; toast(x.message === 'past_until' ? 'শেষ সময় ভবিষ্যতের হতে হবে।' : x.status === 403 ? 'শুধু রুট ব্যবহারকারী এটি বদলাতে পারেন।' : 'সংরক্ষণ করা যায়নি — আবার চেষ্টা করুন।', 'error'); }
    });
    const ph = $('#mt-phrase'), rb = $('#mt-reset-btn');
    ph?.addEventListener('input', () => { rb.disabled = ph.value.trim() !== this.PHRASE; });
    $('#mt-reset')?.addEventListener('submit', async e => {
      e.preventDefault();
      if (ph.value.trim() !== this.PHRASE) return toast(`নিশ্চিত করতে “${this.PHRASE}” লিখুন।`, 'error');
      if (!confirm('ওয়েবসাইটের ডিজাইন শুরুর অবস্থায় ফেরাবেন? আগে সার্ভারে ব্যাকআপ নেওয়া হবে।')) return;
      rb.disabled = true;
      try {
        await DB.flush();
        const r = await DB.api('admin/site-reset', { confirm: ph.value.trim() });
        await DB.reloadRemote();
        if (typeof Menus !== 'undefined') { try { Menus.apply(); } catch (x) { console.error(x); } }
        Theme.apply();
        toast(`ওয়েবসাইট রিসেট হয়েছে। আগের অবস্থার ব্যাকআপ: ${r.backup}`, 'success'); App.render();
      } catch (x) { rb.disabled = false; toast(x.message === 'confirm_required' ? `নিশ্চিত করতে “${this.PHRASE}” লিখুন।` : x.status === 403 ? 'শুধু রুট ব্যবহারকারী ওয়েবসাইট রিসেট করতে পারেন।' : 'রিসেট করা যায়নি — সার্ভারের লগ দেখুন।', 'error'); }
    });
  },
};

// Root User page (sidebar group "সিস্টেম", wiring.js)
App.addPage('admin', { id: 'maintenance', label: 'রক্ষণাবেক্ষণ ও রিসেট', icon: 'construction', module: 'system', when: () => App.has('ADMIN'), render: () => Maint.page(), mount: () => Maint.mount() });

/* Start-up: whoever the server keeps out gets the maintenance page instead of the app. */
(() => {
  const s0 = Sync.start.bind(Sync);
  Sync.start = async function () {
    const mode = await DB.ready();
    const m = Maint.info();
    if (mode === 'ok' && m && (m.blockedSystem || (m.blockedSite && !DB.remote.userId))) return Maint.gate();
    DB.ready = async () => mode;   // already loaded: the original start-up continues with the same answer
    return s0();
  };
  // public website during "site" maintenance: signed-in non-root users see the maintenance notice there too
  const r0 = App.render.bind(App);
  App.render = function () {
    const out = r0.apply(this, arguments), m = Maint.info();
    if (m && m.blockedSite && this.route.portal === 'public') { $('#view').innerHTML = `<main class="min-h-[70vh] flex items-start sm:items-center justify-center px-4 py-10">${Maint.gateHtml()}</main>`; Maint.mountGate(); this.icons(); }
    Maint.reloadAtEnd();
    return out;
  };
  // a save refused because maintenance began meanwhile: show the maintenance page
  const f0 = DB.syncFailed.bind(DB);
  DB.syncFailed = function (e) { if (e && e.status === 503 && e.message === 'maintenance') return location.reload(); return f0(e); };
})();

/* Website footer: a small product credit (switched off per plan on the server: DEVELOPER_CREDIT=false). */
(() => {
  if (typeof Pub === 'undefined' || typeof Pub.footer !== 'function') return;
  const f0 = Pub.footer.bind(Pub);
  Pub.footer = function () {
    const html = f0.apply(this, arguments);
    if (!DevInfo.credit()) return html;
    const d = DevInfo.info();
    // in the footer's bottom row, next to the copyright line (not a row of its own)
    if (html.includes('<!--credit-->')) return html.replace('<!--credit-->', `<span class="pub-credit opacity-80"><button type="button" class="hover:underline" onclick="DevInfo.open()">সফটওয়্যার: <span data-noi18n>${esc(d.product || 'Dhee SMS')}</span> · <span data-noi18n>${esc(d.company || 'DHEE')}</span></button></span>`);
    return html.replace(/<\/footer>\s*$/, `<div class="pub-credit text-center py-3 px-4 opacity-75"><button type="button" class="hover:underline" onclick="DevInfo.open()">সফটওয়্যার: <span data-noi18n>${esc(d.product || 'Dhee SMS')}</span> · <span data-noi18n>${esc(d.company || 'DHEE')}</span></button></div></footer>`);
  };
})();

/* ---------- Licence panel on সিস্টেমের অবস্থা (server LICENSE_* → /api/about.license) ---------- */
const Licence = {
  _v: undefined,
  info() { return this._v || null; },
  /** Root User only: GET /api/admin/license (the public /api/about never carries it). */
  load() {
    if (this._v !== undefined || this._busy || !App.has('ADMIN')) return;
    this._busy = true;
    DB.api('admin/license', null, 'GET').then(d => { this._v = d.license || null; }).catch(() => { this._v = null; }).finally(() => { this._busy = false; const c = $('#licence-card'); if (c) { c.outerHTML = this.card(); App.icons(); } });
  },
  card() {
    if (this._v === undefined) { this.load(); return `<div class="card p-5 mt-5" id="licence-card"><div class="font-semibold flex items-center gap-2">${icon('key-round', 'w-4 h-4 text-brand-600')} লাইসেন্স</div></div>`; }
    const L = this.info(), row = (k, v) => `<div class="flex flex-wrap justify-between gap-2 py-2"><span class="text-slate-500">${k}</span><b>${v}</b></div>`;
    if (!L) return `<div class="card p-5 mt-5" id="licence-card"><div class="font-semibold mb-2 flex items-center gap-2">${icon('key-round', 'w-4 h-4 text-brand-600')} লাইসেন্স</div><p class="text-slate-500">লাইসেন্স কনফিগার করা হয়নি</p></div>`;
    const d = L.daysLeft, dl = d === null || d === undefined ? '—' : d < 0 ? badge('মেয়াদোত্তীর্ণ', 'red') : badge(`${bnNum(d)} দিন`, d <= 30 ? 'amber' : 'green');
    return `<div class="card p-5 mt-5" id="licence-card"><div class="font-semibold mb-2 flex items-center gap-2">${icon('key-round', 'w-4 h-4 text-brand-600')} লাইসেন্স</div><div class="divide-y divide-slate-100">
      ${row('প্ল্যান', esc(L.plan || '—'))}${row('লাইসেন্স কী', `<span class="font-mono" data-noi18n>${esc(L.key || '—')}</span>`)}${row('মেয়াদ শেষ', L.expires ? U.fmtDate(L.expires) : '—')}${row('বাকি', dl)}
      <div class="py-2"><div class="text-slate-500 mb-1">মডিউল</div>${(L.modules || []).length ? L.modules.map(m => `<span class="badge mr-1 mb-1">${esc(m)}</span>`).join('') : '—'}</div></div></div>`;
  },
};
(() => {
  const A = App.portals.admin, p = A?.pages.find(x => x.id === 'system'); if (!p) return;
  const r0 = p.render; p.render = function (q) { return r0.call(this, q) + Licence.card(); };
})();

/* ---------- বার্তা লগ ও গেটওয়ে: one page with tabs; old ids redirect ---------- */
const MsgCenter = {
  TABS: [['log', 'বার্তা লগ'], ['gateways', 'বার্তা গেটওয়ে']],
  tab() { return App.ui.msgTab === 'gateways' ? 'gateways' : 'log'; },
  render() {
    const t = this.tab();
    const pills = `<div class="flex flex-wrap gap-2 mb-4">${this.TABS.map(([k, l]) => `<button class="pill ${k === t ? 'pill-on' : ''}" aria-pressed="${k === t}" onclick="App.ui.msgTab='${k}';App.refresh()">${l}</button>`).join('')}</div>`;
    let body = ''; try { body = t === 'gateways' ? Comms.gatewaysPage() : Comms.messagesPage(); } catch (e) { console.error(e); body = `<div class="card p-6">${emptyState('এই অংশটি দেখানো যায়নি — পাতাটি আবার লোড করুন।', 'triangle-alert')}</div>`; }
    return pageHeader('বার্তা লগ ও গেটওয়ে') + pills + String(body).replace(/<h1 class="text-xl sm:text-2xl/g, '<h2 class="text-lg sm:text-xl').replace(/<\/h1>/g, '</h2>');
  },
  mount() { if (this.tab() === 'gateways') try { Comms.gatewaysMount(); } catch (e) { console.error(e); } },
};
(() => {
  ['admin', 'principal'].forEach(portal => {
    const P = App.portals[portal]; if (!P || typeof Comms === 'undefined') return;
    [['messages', 'log'], ['gateways', 'gateways']].forEach(([id, tab]) => {
      const p = P.pages.find(x => x.id === id), go = () => { App.ui.msgTab = tab; App.route.page = 'messaging'; App.replaceUrl(App.href(App.route.portal, 'messaging')); return MsgCenter.render(); };
      if (p) Object.assign(p, { hidden: true, render: go, mount: () => MsgCenter.mount() });
    });
    if (portal === 'admin' && !P.pages.some(x => x.id === 'messaging')) App.addPage(portal, { id: 'messaging', label: 'বার্তা লগ ও গেটওয়ে', icon: 'radio-tower', module: 'system', render: () => MsgCenter.render(), mount: () => MsgCenter.mount() });
  });
})();
