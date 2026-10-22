/* ==========================================================================
   স্বাগত ও শুরু করার নির্দেশিকা (onboarding checklist)
   A "শুরু করুন" page for the Root User (admin portal) and the Principal:
   twelve set-up steps, each detected as done from the real data, each with a
   short "কেন / কীভাবে" and buttons that open the exact page / tab. Steps can
   be skipped; the whole guide can be dismissed. All state: DB.s.onboarding.
   While set-up is incomplete the page sits first in the sidebar and is the
   landing page; a dismissible card shows on the dashboards.
   Also: Help — a tiny reusable "?" help button for any page.
   ========================================================================== */

/* ---------- reusable contextual help ("?" button) ----------
   Help.add('key', 'শিরোনাম', '<p>…</p>');  then  Help.btn('key')  anywhere in a page. */
const Help = {
  T: {},
  add(key, title, html) { this.T[key] = { title, html }; },
  btn(key, label = 'সাহায্য') {
    const t = this.T[key]; if (!t) return '';
    return `<button type="button" class="btn btn-ghost btn-sm" onclick="Help.show('${esc(key)}')" aria-label="সাহায্য: ${esc(t.title)}">${icon('circle-help')} ${esc(label)}</button>`;
  },
  show(key) { const t = this.T[key]; if (t) Modal.open({ title: t.title, size: 'md', body: `<div class="space-y-3 leading-relaxed">${t.html}</div>` }); },
};

const Onboard = {
  GROUP: 'শুরু করুন',
  /** Read-only view of the stored state (never writes). */
  st() { return DB.s.onboarding || {}; },
  /** Writable state (created on first write). */
  w() { const o = DB.s.onboarding || (DB.s.onboarding = {}); o.skipped = o.skipped || {}; o.confirmed = o.confirmed || {}; return o; },
  canSee() { return !!App.session && (App.has('ADMIN') || App.has('PRINCIPAL')); },
  hasRole(r) { return (DB.s.userRoles || []).some(x => x.role === r); },
  nextSession() { const cur = +DB.session(); return (DB.s.sessions || []).filter(s => +s.id > cur).sort((a, b) => +a.id - +b.id)[0] || null; },

  /* ---------- the twelve steps ----------
     done() → { ok, note }  · actions: [{ label, page, ui?, icon? }] (page looked up in this portal, then in another portal the user may open) */
  STEPS: [
    { id: 'identity', title: 'প্রতিষ্ঠানের পরিচিতি ও লোগো', ic: 'badge-check',
      why: 'নাম, লোগো, ঠিকানা, ফোন, ইআইআইএন ও প্রতিষ্ঠাকাল ওয়েবসাইট, পরিচয়পত্র, রসিদ, নম্বরপত্র ও সব মুদ্রিত কাগজে বসে।',
      how: 'প্রতিষ্ঠানের সেটিংস → পরিচিতি ও ব্র্যান্ডিং-এ ঘরগুলো পূরণ করে “পরিচিতি সংরক্ষণ করুন” চাপুন; ডান পাশে লোগো আপলোড করুন।',
      done() {
        const s = DB.s.school || {}, miss = [['লোগো', s.logo], ['ঠিকানা', s.address], ['ফোন', s.phone], ['প্রতিষ্ঠাকাল', s.founded]].filter(x => !x[1]).map(x => x[0]);
        return { ok: !miss.length, note: miss.length ? `বাকি: ${miss.join(', ')}` : '' };
      },
      actions: [{ label: 'পরিচিতি ও ব্র্যান্ডিং খুলুন', page: 'settings', ui: { setTab: 'identity' } }] },
    { id: 'session', get title() { return typeof multiCampus === 'function' && multiCampus() ? 'শিক্ষাবর্ষ / সেমিস্টার ও ক্যাম্পাস' : 'শিক্ষাবর্ষ / সেমিস্টার'; }, ic: 'calendar-range',
      why: 'চলতি শিক্ষাবর্ষ ঠিক থাকলে হাজিরা, পরীক্ষা, ফি ও রুটিন সঠিক বছরে জমা হয়। পরের শিক্ষাবর্ষ আগে থেকে যোগ করলে অস্থায়ী শ্রেণি উন্নয়ন ও আগাম ফি নেওয়া যায়।',
      how: 'কাঠামো ট্যাবে ক্যাম্পাসের ঠিকানা লিখুন ও “শিক্ষাবর্ষ যোগ করুন” দিয়ে পরের বছর যোগ করুন। নতুন বছর শুরু হলে “কপি ও আমদানি” পাতা থেকে সেটি সক্রিয় করুন।',
      done() {
        const miss = [];
        if (!DB.s.activeSession) miss.push('চলতি শিক্ষাবর্ষ');
        const noAddr = (DB.s.campuses || []).filter(c => !c.address);
        if (!(DB.s.campuses || []).length) miss.push('ক্যাম্পাস'); else if (noAddr.length) miss.push(`ক্যাম্পাসের ঠিকানা (${noAddr.map(c => c.name).join(', ')})`);
        if (!Onboard.nextSession()) miss.push('পরের শিক্ষাবর্ষ');
        return { ok: !miss.length, note: miss.length ? `বাকি: ${miss.join(', ')}` : `চলতি: ${U.bn(DB.session())} · পরের: ${U.bn(Onboard.nextSession().id)}` };
      },
      actions: [{ label: 'ক্যাম্পাস ও শিক্ষাবর্ষ', page: 'settings', ui: { setTab: 'structure' } }, { label: 'শিক্ষাবর্ষ সক্রিয় / কপি', page: 'clone', icon: 'copy' }] },
    { id: 'classes', title: 'শ্রেণি, শাখা ও বিভাগ', ic: 'building-2',
      why: 'ভর্তি, হাজিরা, রুটিন, পরীক্ষা ও ফি — সবকিছু শ্রেণি ও শাখার ওপর চলে। বিভাগ (বিজ্ঞান, মানবিক …) ভর্তি ফরমেও দেখা যায়।',
      how: 'কাঠামো ট্যাবে “শ্রেণি যোগ করুন” চাপুন; প্রতিটি শ্রেণিতে শাখা (ক, খ …), প্রয়োজনে বিভাগ ও শ্রেণি শিক্ষক দিন।',
      done() { const n = (DB.s.classes || []).length; return { ok: n > 0, note: n ? `${bnNum(n)}টি শ্রেণি` : 'এখনো কোনো শ্রেণি নেই' }; },
      actions: [{ label: 'শ্রেণি ও শাখা', page: 'settings', ui: { setTab: 'structure' } }] },
    { id: 'subjects', title: 'বিষয় ও শ্রেণিভিত্তিক বিষয়', ic: 'book-marked',
      why: 'নম্বরপত্র, পরীক্ষার মানবণ্টন ও রুটিন শুধু শ্রেণির নিজস্ব বিষয় নিয়ে কাজ করে।',
      how: 'বিষয়সমূহ ট্যাবে বিষয় যোগ করুন, তারপর প্রতিটি শ্রেণি কোন কোন বিষয় পড়ে তাতে টিক দিন।',
      done() {
        const n = (DB.s.subjects || []).filter(s => s.active !== false).length, cls = (DB.s.classes || []).filter(c => c.subjects?.length).length;
        return { ok: n > 0 && cls > 0, note: `${bnNum(n)}টি বিষয় · ${bnNum(cls)}টি শ্রেণিতে বিষয় বাছাই করা হয়েছে` };
      },
      actions: [{ label: 'বিষয়সমূহ খুলুন', page: 'settings', ui: { setTab: 'subjects' } }] },
    { id: 'exams', title: 'গ্রেডিং ও পরীক্ষা কাঠামো', ic: 'clipboard-list',
      why: 'গ্রেডিং স্কেল ঠিক করে জিপিএ ও লেটার গ্রেড; পরীক্ষার তালিকা ও ভার ঠিক করে শিক্ষাবর্ষের চূড়ান্ত ফল।',
      how: 'পরীক্ষা কেন্দ্র → পরীক্ষাসমূহ-এ পরীক্ষা তৈরি করুন, প্রতিটির “সেটআপ” থেকে বিষয় ও নম্বর ঠিক করুন; নিচে গ্রেডিং পদ্ধতি দেখুন।',
      done() {
        const sc = DB.scheme(DB.campusId(), DB.session()), n = DB.examsOf().length;
        return { ok: !!sc && n > 0, note: `${sc ? 'গ্রেডিং: ' + sc.name : 'গ্রেডিং পদ্ধতি নেই'} · এ বছরের পরীক্ষা ${bnNum(n)}টি` };
      },
      actions: [{ label: 'পরীক্ষা কেন্দ্র খুলুন', page: 'exams', ui: { xh: { tab: 'list' } } }] },
    { id: 'fees', title: 'ফির খাত ও ফি কাঠামো', ic: 'receipt',
      why: 'মাসিক বেতন, ভর্তি ও পরীক্ষার ফি এখান থেকে বিলে বসে; অভিভাবক ও শিক্ষার্থীরা ড্যাশবোর্ডে ফি কাঠামো দেখেন।',
      how: 'ফি ও বিল → ফি খাত ও কাঠামো-তে প্রয়োজনীয় খাত যোগ করুন, তারপর নিচের ছকে প্রতিটি শ্রেণির পরিমাণ লিখুন।',
      done() { const n = (DB.s.feeConfigs || []).filter(f => f.session === DB.session() && +f.tuition > 0).length; return { ok: n > 0, note: `${bnNum(n)}টি শ্রেণির মাসিক বেতন নির্ধারিত` }; },
      actions: [{ label: 'ফি খাত ও কাঠামো', page: 'fees', ui: { feeTab: 'structure' } }] },
    { id: 'users', title: 'অধ্যক্ষ ও শিক্ষক যোগ', ic: 'user-plus',
      why: 'অধ্যক্ষ ভর্তি, ফল ও ছুটি অনুমোদন করেন; শিক্ষকেরা হাজিরা, নম্বর ও বাড়ির কাজ দেন।',
      how: 'রুট ব্যবহারকারী “ব্যবহারকারী সৃজন” থেকে অধ্যক্ষ যোগ করেন; অধ্যক্ষ “ব্যবহারকারী” পাতা থেকে শিক্ষক যোগ করেন। এককালীন পাসওয়ার্ড নিরাপদে পৌঁছে দিন।',
      done() {
        const p = Onboard.hasRole('PRINCIPAL'), t = (DB.s.teachers || []).filter(x => x.status !== 'Resigned').length;
        return { ok: p && t > 0, note: `${p ? 'অধ্যক্ষ আছেন' : 'অধ্যক্ষ নেই'} · শিক্ষক ${bnNum(t)} জন` };
      },
      actions: [{ label: 'ব্যবহারকারী যোগ করুন', page: 'user-admin', ui: { usrTab: 'users' } }] },
    { id: 'students', title: 'শিক্ষার্থী যোগ / সিএসভি আমদানি', ic: 'graduation-cap',
      why: 'শিক্ষার্থী ছাড়া হাজিরা, ফি ও ফল কাজ করে না। অনেক শিক্ষার্থী একসঙ্গে আনতে সিএসভি আমদানি সবচেয়ে দ্রুত।',
      how: 'টেমপ্লেট ডাউনলোড করে Excel-এ পূরণ করুন, সিএসভি হিসেবে সংরক্ষণ করে আপলোড দিন — প্রিভিউ দেখে বৈধ সারিগুলো আমদানি করুন। একজন-দুজন হলে ভর্তি ডেস্ক থেকে সরাসরি ভর্তি করুন।',
      done() { const n = (DB.s.students || []).filter(s => s.status === 'active').length; return { ok: n > 0, note: `${bnNum(n)} জন সক্রিয় শিক্ষার্থী` }; },
      actions: [{ label: 'সিএসভি আমদানি', page: 'students', ui: { stuIO: 'import' }, icon: 'file-up' }, { label: 'নতুন ভর্তি', page: 'admission', ui: { admHubTab: 'direct' }, icon: 'user-plus' }] },
    { id: 'website', title: 'ওয়েবসাইট (হোমপেজ, মেনু, ফুটার)', ic: 'globe',
      why: 'অভিভাবকেরা প্রথম আপনার ওয়েবসাইট দেখেন — নোটিশ, ভর্তি, ফল ও যোগাযোগ সেখান থেকেই।',
      how: '“ওয়েবসাইট ও হিরো”-তে শিরোনাম ও উপশিরোনাম লিখুন, “হোমপেজ নির্মাতা”-তে অংশ সাজান, “মেনু ও ইউআরএল”-এ মেনু ঠিক করুন, “পৃষ্ঠা ও ফুটার”-এ ফুটার সংরক্ষণ করুন।',
      done() {
        const site = DB.s.site || {}, miss = [site.hero?.subtitle || site.hero?.image ? '' : 'হোমপেজের উপশিরোনাম / ছবি', site.footer ? '' : 'ফুটার (পৃষ্ঠা ও ফুটার ট্যাবে সংরক্ষণ)'].filter(Boolean);
        return { ok: !miss.length, note: miss.length ? `বাকি: ${miss.join(', ')}` : '' };
      },
      actions: [{ label: 'হোমপেজ', page: 'settings', ui: { setTab: 'website' } }, { label: 'হোমপেজ নির্মাতা', page: 'settings', ui: { setTab: 'homepage' }, icon: 'layout-template' }, { label: 'মেনু', page: 'settings', ui: { setTab: 'menus', mnP: 'public' }, icon: 'list-tree' }, { label: 'ফুটার', page: 'settings', ui: { setTab: 'pages' }, icon: 'file-text' }] },
    { id: 'gateway', title: 'এসএমএস / ই-মেইল গেটওয়ে', ic: 'radio-tower',
      why: 'নোটিশ, বকেয়া ফির স্মারক, ফলাফল ও পাসওয়ার্ড পুনরুদ্ধারের কোড এসএমএস বা ই-মেইলে যায়।',
      how: 'বার্তা গেটওয়ে পাতায় সেবাদাতার তথ্য দিয়ে “গেটওয়ে সক্রিয়” টিক দিন, তারপর একটি পরীক্ষামূলক বার্তা পাঠান।',
      done() { const g = DB.s.gateways || {}; const on = [g.sms?.active ? 'এসএমএস' : '', g.email?.active ? 'ই-মেইল' : ''].filter(Boolean); return { ok: on.length > 0, note: on.length ? `সক্রিয়: ${on.join(', ')}` : 'কোনো গেটওয়ে সক্রিয় নয়' }; },
      actions: [{ label: 'বার্তা গেটওয়ে', page: 'gateways', ui: { gwTab: 'sms' } }] },
    { id: 'payment', title: 'পেমেন্ট পদ্ধতি', ic: 'wallet',
      why: 'বিকাশ / নগদ / রকেট মার্চেন্ট নম্বর থাকলে অভিভাবকেরা TrxID দিয়ে ফি দিতে পারেন; পেমেন্ট সার্ভার যুক্ত করলে সরাসরি অনলাইন পেমেন্ট হয়।',
      how: 'বৈশিষ্ট্য ও সেটিংস → পরিশোধ-এ মার্চেন্ট নম্বর দিন; অনলাইন চেকআউটের জন্য “পেমেন্ট গেটওয়ে”-তে প্রতিষ্ঠানের পেমেন্ট সার্ভারের ঠিকানা দিন।',
      done() {
        const m = Object.values(DB.s.school?.merchant || {}).filter(Boolean).length, c = DB.s.config?.payGw, live = !!(c && c.provider && c.server);
        return { ok: m > 0 || live, note: `${bnNum(m)}টি মার্চেন্ট নম্বর · অনলাইন গেটওয়ে ${live ? 'যুক্ত' : 'যুক্ত নয়'}` };
      },
      actions: [{ label: 'মার্চেন্ট নম্বর', page: 'settings', ui: { setTab: 'flags', fcG: 'পরিশোধ' } }, { label: 'পেমেন্ট গেটওয়ে', page: 'settings', ui: { setTab: 'flags', fcG: 'পেমেন্ট গেটওয়ে' }, icon: 'credit-card' }] },
    { id: 'backup', title: 'ব্যাকআপ যাচাই', ic: 'database-backup',
      why: 'যন্ত্র নষ্ট বা ভুল মুছে গেলে ব্যাকআপই একমাত্র ভরসা। একবার ব্যাকআপ নিয়ে খুলে দেখুন যে ফাইলটি ঠিক আছে।',
      how: 'ব্যাকআপ ও পুনরুদ্ধার ট্যাবে “এখনই ব্যাকআপ নিন (JSON)” চাপুন, ফাইলটি প্রতিষ্ঠানের বাইরে নিরাপদে রাখুন। সার্ভারে নিয়মিত ব্যাকআপের জন্য DEPLOY.md দেখুন (npm run backup)।',
      done() {
        const b = (DB.s.backups || []).filter(x => !/automated|scheduled/i.test(x.kind || '')), c = Onboard.st().confirmed?.backup;
        return { ok: b.length > 0 || !!c, note: b.length ? `সর্বশেষ ব্যাকআপ ${U.fmtDate(String(b[b.length - 1].ts).slice(0, 10))}` : c ? 'যাচাই করা হয়েছে বলে নিশ্চিত করা হয়েছে' : 'এখনো কোনো ব্যাকআপ নেওয়া হয়নি' };
      },
      confirm: 'ব্যাকআপ যাচাই করেছি',
      actions: [{ label: 'ব্যাকআপ ও পুনরুদ্ধার', page: 'database', ui: { dataTab: 'backup' } }] },
  ],

  step(id) { return this.STEPS.find(s => s.id === id); },
  status(s) {
    let d; try { d = s.done(); } catch (e) { d = { ok: false, note: '' }; }
    const sk = this.st().skipped?.[s.id];
    return { ...d, skipped: !d.ok && !!sk, state: d.ok ? 'done' : sk ? 'skipped' : 'todo' };
  },
  summary() {
    const rows = this.STEPS.map(s => ({ s, x: this.status(s) }));
    const done = rows.filter(r => r.x.state === 'done').length, skipped = rows.filter(r => r.x.state === 'skipped').length;
    return { rows, done, skipped, total: rows.length, complete: done + skipped === rows.length, next: rows.find(r => r.x.state === 'todo') };
  },
  /** The guide is "active" (first in the menu, landing page, dashboard card) until every step is done/skipped or it is dismissed. */
  active() { if (!DB.s || this.st().dismissed) return false; return !this.summary().complete; },

  /* ---------- navigation to the exact page / tab ---------- */
  target(a) {
    const cur = App.route.portal, order = [cur, ...['admin', 'principal'].filter(p => p !== cur)];
    for (const pid of order) {
      const P = App.portals[pid], pg = P?.pages.find(x => x.id === a.page), role = pg && App.roleForPortal(pid);
      if (!pg || !role || role === 'PUBLIC') continue;
      if (pg.flag && DB.s.featureFlags[pg.flag] === false) continue;
      if (pg.module && !DB.perm(role, pg.module, 'view') && !(App.has('ADMIN') && pid === 'admin')) continue;
      return { portal: pid, page: pg.id };
    }
    return null;
  },
  open(stepId, i) {
    const s = this.step(stepId); if (!s) return;
    const a = i == null ? (s.actions.find(x => this.target(x)) || s.actions[0]) : s.actions[i];
    const t = a && this.target(a);
    if (!t) return toast('এই কাজটি রুট ব্যবহারকারীর অ্যাকাউন্ট থেকে করতে হয় — তাঁকে জানান।', 'warn');
    if (a.ui) Object.entries(a.ui).forEach(([k, v]) => { App.ui[k] = v && typeof v === 'object' ? { ...v } : v; });
    App.go(t.portal, t.page);
  },
  skip(id, on) {
    const o = this.w();
    if (on) o.skipped[id] = { by: App.session?.userId || null, ts: new Date().toISOString() }; else delete o.skipped[id];
    DB.audit(on ? 'ONBOARDING_SKIP' : 'ONBOARDING_UNSKIP', 'settings', `শুরু করার নির্দেশিকা: “${this.step(id)?.title}” ${on ? 'বাদ দেওয়া হয়েছে' : 'আবার তালিকায়'}`);
    DB.save(); App.refresh();
  },
  confirmStep(id) {
    const o = this.w(); o.confirmed[id] = { by: App.session?.userId || null, ts: new Date().toISOString() };
    DB.audit('ONBOARDING_CONFIRM', 'settings', `শুরু করার নির্দেশিকা: “${this.step(id)?.title}” নিশ্চিত করা হয়েছে`); DB.save(); App.refresh();
  },
  dismiss(on) {
    const o = this.w(); o.dismissed = on ? { by: App.session?.userId || null, ts: new Date().toISOString() } : null;
    if (!on) o.bannerHidden = false;
    DB.audit(on ? 'ONBOARDING_DISMISS' : 'ONBOARDING_RESUME', 'settings', on ? 'শুরু করার নির্দেশিকা বন্ধ করা হয়েছে' : 'শুরু করার নির্দেশিকা আবার চালু করা হয়েছে');
    DB.save(); toast(on ? 'নির্দেশিকা বন্ধ করা হয়েছে — “শুরু করুন” পাতাটি মেনুর নিচের দিকে থাকবে।' : 'নির্দেশিকা আবার চালু হয়েছে।', 'success'); App.render();
  },
  hideBanner() { this.w().bannerHidden = true; DB.save(); App.refresh(); },
  /** First time everything is done/skipped: stamp + audit once. */
  stampComplete(sum) {
    if (!sum.complete || this.st().completedAt) return;
    this.w().completedAt = new Date().toISOString();
    DB.audit('ONBOARDING_COMPLETE', 'settings', `শুরু করার নির্দেশিকা সম্পন্ন: ${sum.done}টি ধাপ সম্পন্ন, ${sum.skipped}টি বাদ`); DB.save();
  },

  /* ---------- sidebar placement: first while active, end of the settings group otherwise ---------- */
  place(portalId) {
    const P = App.portals[portalId]; if (!P || !['admin', 'principal'].includes(portalId)) return;
    const i = P.pages.findIndex(p => p.id === 'onboarding'); if (i < 0) return;
    const pg = P.pages[i], base = (P.groupOrder || []).filter(g => g !== this.GROUP), on = this.active();
    P.pages.splice(i, 1);
    // grouped sidebar (wiring.js): top of "ড্যাশবোর্ড" while active, end of "প্রতিষ্ঠান ও সেটিংস" afterwards
    const top = base.find(g => g === 'ড্যাশবোর্ড'), end = base.find(g => g === 'প্রতিষ্ঠানের সেটিংস' || g === 'প্রতিষ্ঠান ও সেটিংস' || g === 'প্রতিষ্ঠান');
    if (on) { pg.group = top || this.GROUP; P.pages.unshift(pg); if (P.groupOrder) P.groupOrder = top ? base : [this.GROUP, ...base]; }
    else { pg.group = end || base[base.length - 1]; P.pages.push(pg); if (P.groupOrder) P.groupOrder = base; }
  },

  /* ---------- views ---------- */
  stepCard(r, n) {
    const { s, x } = r, tone = { done: 'green', skipped: 'slate', todo: 'amber' }[x.state];
    const label = { done: 'সম্পন্ন', skipped: 'বাদ দেওয়া হয়েছে', todo: 'বাকি' }[x.state];
    const can = App.perm('settings', 'edit') || App.has('ADMIN') || App.has('PRINCIPAL');
    const acts = s.actions.map((a, i) => ({ a, i })).filter(({ a }) => this.target(a));
    return `<li class="card p-4 ${x.state === 'done' ? 'opacity-90' : ''}" id="ob-${s.id}">
      <div class="flex flex-wrap items-start gap-3">
        <span class="w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-bold ${x.state === 'done' ? 'bg-emerald-100 text-emerald-700' : x.state === 'skipped' ? 'bg-slate-100 text-slate-500' : 'bg-brand-50 text-brand-700'}" aria-hidden="true">${x.state === 'done' ? icon('check', 'w-5 h-5') : bnNum(n)}</span>
        <div class="flex-1 min-w-[12rem]">
          <h2 class="font-semibold text-lg flex flex-wrap items-center gap-2">${icon(s.ic, 'w-5 h-5 text-brand-600')} ${esc(s.title)} ${badge(label, tone)}</h2>
          ${x.note ? `<p class="text-slate-600 mt-1">${esc(x.note)}</p>` : ''}
          <div class="flex flex-wrap gap-2 mt-3">${acts.map(({ a, i }, k) => `<button class="btn ${k === 0 && x.state === 'todo' ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="Onboard.open('${s.id}',${i})">${icon(a.icon || 'arrow-right')} ${esc(a.label)}</button>`).join('') || `<span class="text-slate-600">${icon('info', 'w-4 h-4 inline -mt-1')} এই ধাপটি রুট ব্যবহারকারী করবেন।</span>`}
            ${s.confirm && x.state !== 'done' && can ? `<button class="btn btn-ghost btn-sm" onclick="Onboard.confirmStep('${s.id}')">${icon('check-check')} ${esc(s.confirm)}</button>` : ''}
            ${x.state === 'todo' && can ? `<button class="btn btn-ghost btn-sm" onclick="Onboard.skip('${s.id}',true)">${icon('skip-forward')} এই ধাপ বাদ দিন</button>` : ''}
            ${x.state === 'skipped' && can ? `<button class="btn btn-ghost btn-sm" onclick="Onboard.skip('${s.id}',false)">${icon('undo-2')} আবার তালিকায় আনুন</button>` : ''}</div>
        </div></div></li>`;
  },
  page() {
    const sum = this.summary(), o = this.st(), pct = (sum.done + sum.skipped) / sum.total * 100;
    this.stampComplete(sum);
    const school = DB.s.school.nameBn || DB.s.school.name;
    return pageHeader('শুরু করুন', esc(school), Help.btn('onboarding'))
      + `<section class="card p-5 mb-5" aria-label="অগ্রগতি">
        <div class="flex flex-wrap items-center gap-3 mb-3"><div class="font-semibold text-lg flex-1 min-w-[12rem]">${sum.complete ? `${icon('party-popper', 'w-5 h-5 inline -mt-1 text-emerald-600')} সব ধাপ শেষ!` : `${bnNum(sum.done)}/${bnNum(sum.total)}টি ধাপ সম্পন্ন${sum.skipped ? ` · ${bnNum(sum.skipped)}টি বাদ` : ''}`}</div>
          ${sum.next ? `<button class="btn btn-primary" onclick="Onboard.open('${sum.next.s.id}')">${icon('arrow-right')} পরের ধাপ: ${esc(sum.next.s.title)}</button>` : ''}
          ${o.dismissed ? `<button class="btn btn-ghost" onclick="Onboard.dismiss(false)">${icon('rotate-ccw')} নির্দেশিকা আবার চালু করুন</button>` : sum.complete ? '' : `<button class="btn btn-ghost" onclick="if(confirm('নির্দেশিকা বন্ধ করবেন? “শুরু করুন” পাতাটি মেনুর নিচের দিকে থাকবে, যেকোনো সময় আবার খোলা যাবে।'))Onboard.dismiss(true)">${icon('x')} নির্দেশিকা বন্ধ করুন</button>`}</div>
        <div role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}" aria-label="সেটআপের অগ্রগতি">${progressBar(pct, 'bg-brand-600')}</div>
        ${o.dismissed ? `<p class="text-slate-600 mt-3">নির্দেশিকাটি ${U.fmtDate(String(o.dismissed.ts).slice(0, 10))} তারিখে বন্ধ করা হয়েছে।</p>` : ''}</section>
      <ol class="space-y-3">${sum.rows.map((r, i) => this.stepCard(r, i + 1)).join('')}</ol>`;
  },
  /** Dashboard card (admin "সিস্টেমের অবস্থা", principal "সারসংক্ষেপ"). */
  banner() {
    if (!this.canSee() || !this.active() || this.st().bannerHidden) return '';
    const sum = this.summary(), pct = (sum.done + sum.skipped) / sum.total * 100, P = App.route.portal;
    return `<section class="card p-4 mb-5 border-brand-200 bg-brand-50/40" aria-label="শুরু করার নির্দেশিকা">
      <div class="flex flex-wrap items-center gap-3"><span class="rounded-xl p-2.5 bg-brand-50 text-brand-700">${icon('rocket', 'w-5 h-5')}</span>
        <div class="flex-1 min-w-[12rem]"><div class="font-semibold text-lg">প্রতিষ্ঠান প্রস্তুত করুন — ${bnNum(sum.done)}/${bnNum(sum.total)}টি ধাপ সম্পন্ন</div>${sum.next ? `<div class="text-slate-600">পরের ধাপ: ${esc(sum.next.s.title)}</div>` : ''}</div>
        <div class="flex flex-wrap gap-2">${sum.next ? `<button class="btn btn-primary btn-sm" onclick="Onboard.open('${sum.next.s.id}')">${icon('arrow-right')} পরের ধাপ</button>` : ''}<a class="btn btn-ghost btn-sm" href="${App.href(P, 'onboarding')}">${icon('list-checks')} নির্দেশিকা</a><button class="btn btn-ghost btn-sm" onclick="Onboard.hideBanner()" aria-label="কার্ডটি লুকান">${icon('x')} লুকান</button></div></div>
      <div class="mt-3">${progressBar(pct, 'bg-brand-600')}</div></section>`;
  },
};

Help.add('onboarding', 'শুরু করার নির্দেশিকা', `<p>প্রতিটি ধাপ আপনার দেওয়া আসল তথ্য দেখে নিজে থেকেই “সম্পন্ন” হয় — আলাদা করে টিক দিতে হয় না।</p>
  <p>ধাপের বোতাম চাপলে ঠিক সেই পাতা ও ট্যাব খুলবে। কাজ শেষে আবার “শুরু করুন” পাতায় ফিরে আসুন (মেনুর একদম ওপরে)।</p>
  <p>কোনো ধাপ আপনার প্রতিষ্ঠানে না লাগলে “এই ধাপ বাদ দিন” চাপুন। সব ধাপ সম্পন্ন বা বাদ হলে পাতাটি মেনুর নিচের দিকে চলে যায়।</p>
  <p>কিছু ধাপ (বার্তা গেটওয়ে, ব্যাকআপ, অধ্যক্ষ যোগ) শুধু রুট ব্যবহারকারী করতে পারেন।</p>`);

/* ---------- page, placement, landing page, dashboard cards ---------- */
['admin', 'principal'].forEach(pid => {
  if (!App.portals[pid] || App.portals[pid].pages.some(p => p.id === 'onboarding')) return;
  App.addPage(pid, { id: 'onboarding', label: 'শুরু করুন', icon: 'rocket', module: 'settings', render: () => Onboard.page(), count: () => (Onboard.active() ? Onboard.summary().rows.filter(r => r.x.state === 'todo').length : 0) });
});
(() => {
  const s0 = App.shell;
  App.shell = function (portal, html) { try { Onboard.place(portal.id); } catch (e) { console.error(e); } return s0.call(this, portal, html); };
  const g0 = App.go;
  App.go = function (portal, page, query) {
    if (!page && ['admin', 'principal'].includes(portal) && this.session) { try { if (Onboard.canSee() && Onboard.active()) page = 'onboarding'; } catch (e) { } }
    return g0.call(this, portal, page, query);
  };
  [['admin', 'system'], ['principal', 'overview']].forEach(([pid, id]) => {
    const pg = App.portals[pid]?.pages.find(p => p.id === id); if (!pg) return;
    const r0 = pg.render;
    pg.render = function (q) { const html = r0.call(this, q); let b = ''; try { b = Onboard.banner(); } catch (e) { console.error(e); } return b + html; };
  });
})();
