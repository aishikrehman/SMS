/* ==========================================================================
   A. PUBLIC INSTITUTIONAL PORTAL — the school website (no dashboard chrome)
   ========================================================================== */

const Pub = {
  wrap(inner) { return `<div class="fade-in">${inner}</div>${this.footer()}`; },
  section(title, kicker, body, cls = '') {
    return `<section class="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-20 ${cls}">${kicker || title ? `<div class="pub-head">${kicker ? `<div class="pub-kicker">${kicker}</div>` : ''}${title ? `<h2 class="pub-h2">${title}</h2>` : ''}</div>` : ''}${body}</section>`;
  },
  hero(title, sub) {
    return `<div class="pub-hero pub-pagehero text-white"><div class="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16"><h1>${title}</h1>${sub ? `<p class="text-white/85 text-lg mt-3 max-w-2xl leading-relaxed">${sub}</p>` : ''}</div></div>`;
  },
  noticePdf(id) {
    const n = DB.s.notices.find(x => x.id === id); if (!n) return toast('নোটিশটি পাওয়া যায়নি।', 'error');
    Print.preview(`নোটিশ — ${n.title}`, [`<div class="sheet padded">${Print.header(`${bn(n.category)} নোটিশ`)}<div style="font-size:9pt;color:#475569">সূত্র: ${n.id} · তারিখ: ${U.fmtDate(n.date)}</div><h2 class="doc-title" style="font-size:16pt;margin:6mm 0 4mm">${esc(n.title)}</h2><p style="font-size:11pt;line-height:1.8">${esc(n.body)}</p><div style="position:absolute;bottom:25mm;right:14mm">${Print.signature('Principal')}</div></div>`], { re: ['Pub.noticePdf', id] });
  },
};

App.register('public', {
  title: 'পাবলিক ওয়েবসাইট', layout: 'site',
  nav: [['home', 'প্রথম পাতা'], ['about', 'পরিচিতি'], ['prospectus', 'প্রসপেক্টাস'], ['notices', 'নোটিশ'], ['admissions', 'ভর্তি'], ['track', 'অনুসন্ধান'], ['results', 'ফলাফল'], ['verify', 'টিসি যাচাই'], ['contact', 'যোগাযোগ'], ['privacy', 'গোপনীয়তা নীতি']],
  pages: [
    /* ---------------- Home & About — content comes from the homepage builder and the About editor (js/modules/customize.js) ---------------- */
    { id: 'home', label: 'প্রথম পাতা', icon: 'home', render() { return ''; } },
    { id: 'about', label: 'পরিচিতি', icon: 'info', render() { return ''; } },
    /* ---------------- Prospectus + fee estimator (class fees, the school's optional fee heads and transport routes) ---------------- */
    {
      id: 'prospectus', label: 'প্রসপেক্টাস', icon: 'book-open',
      render() {
        const ses = Pub.admSession(), classes = DB.classesIn('ALL');
        const ui = App.ui.est || (App.ui.est = { cls: '', extras: [], transport: '' });
        if (!classes.find(c => c.id === ui.cls)) ui.cls = classes[0]?.id || '';
        if (!classes.length) return Pub.wrap(Pub.hero('প্রসপেক্টাস ও ফি', '') + Pub.section('', '', emptyState('ফি কাঠামো শিগগিরই প্রকাশ করা হবে। বিস্তারিত জানতে অফিসে যোগাযোগ করুন।', 'receipt-text')));
        const extras = Pub.feeExtras(), routes = Pub.routes();
        return Pub.wrap(Pub.hero('প্রসপেক্টাস ও ফি', 'ফি কাঠামো এবং পূর্ণ শিক্ষাবর্ষের সম্ভাব্য ব্যয়ের হিসাব।') + Pub.section('ফি কাঠামো', 'শিক্ষাবর্ষ ' + bnNum(ses), `
          <div class="grid lg:grid-cols-2 gap-4">${DB.s.campuses.filter(cp => DB.classesIn(cp.id).length).map(cp => `<div class="card scroll-x"><div class="px-4 py-3 border-b border-slate-100 font-semibold">${esc(multiCampus() ? cp.name : 'শ্রেণিভিত্তিক ফি')}</div><table class="table"><thead><tr><th>শ্রেণি</th><th>মাসিক বেতন</th><th>ভর্তি ফি</th><th>পরীক্ষার ফি (বছরে ×৩)</th></tr></thead><tbody>${DB.classesIn(cp.id).map(c => { const f = DB.fees(c.id, ses); return `<tr><td class="font-semibold">${esc(c.name)}</td><td>${U.money(f.tuition)}</td><td>${U.money(f.admissionFee)}</td><td>${U.money(f.examFee)}</td></tr>`; }).join('')}</tbody></table></div>`).join('')}</div>
          <p class="text-sm text-slate-500 mt-3">${icon('info', 'w-4 h-4 inline')} সহায়তা প্রয়োজন এমন পরিবার মাসিক বা ত্রৈমাসিক কিস্তি পরিকল্পনার জন্য আবেদন করতে পারেন — <a class="text-brand-600 font-semibold" href="${App.href('public', 'services')}">অনলাইন সেবা</a>।</p>`)
          + Pub.section('ফি নিরূপক', 'আপনার বছরের পরিকল্পনা করুন', `<div class="grid lg:grid-cols-5 gap-6">
            <form id="est-form" class="card p-5 lg:col-span-3 space-y-5">
              <div><label class="label">শ্রেণি</label><select class="select" name="cls">${classOptions(ui.cls)}</select></div>
              ${extras.length ? `<div><div class="label">অন্যান্য ফি</div><div class="grid sm:grid-cols-2 gap-2">${extras.map(h => `<label class="flex items-center gap-2 card p-2.5 text-sm cursor-pointer"><input type="checkbox" name="ex" value="${esc(h.id)}" ${ui.extras.includes(h.id) || !h.optIn ? 'checked' : ''} ${h.optIn ? '' : 'disabled'}> ${esc(h.name)} <span class="ml-auto text-slate-500 whitespace-nowrap">${U.money(h.amount)} · ${esc(bn(h.frequency))}</span></label>`).join('')}</div></div>` : ''}
              ${routes.length ? `<div><label class="label">বিদ্যালয়ের পরিবহন</label><select class="select" name="transport"><option value="">প্রয়োজন নেই</option>${routes.map(r => `<option value="${esc(r.id)}" ${ui.transport === r.id ? 'selected' : ''}>${esc(r.name)} — ${U.money(r.fee)}/মাস</option>`).join('')}</select></div>` : ''}
            </form>
            <div class="lg:col-span-2"><div class="card p-5 sticky top-24" id="est-out"></div></div></div>`));
      },
      mount() {
        const f = $('#est-form'); if (!f) return;
        const calc = () => {
          const ui = App.ui.est, extras = Pub.feeExtras();
          ui.cls = f.cls.value; ui.extras = $$('input[name=ex]:checked', f).map(x => x.value); ui.transport = f.transport ? f.transport.value : '';
          const c = DB.cls(ui.cls), fc = DB.fees(ui.cls, Pub.admSession());
          const times = h => ({ Monthly: 12, 'Per term': 3 }[h.frequency] || 1);
          const ex = extras.filter(h => !h.optIn || ui.extras.includes(h.id)), tr = Pub.routes().find(r => r.id === ui.transport)?.fee || 0;
          const lines = [['মাসিক বেতন (১২ মাস)', fc.tuition * 12], ['ভর্তি ফি', fc.admissionFee], ['পরীক্ষার ফি (৩টি সাময়িক)', fc.examFee * 3], ...ex.map(h => [`${h.name}${times(h) > 1 ? ` (${bnNum(times(h))} বার)` : ''}`, h.amount * times(h)]), ...(tr ? [['পরিবহন (১২ মাস)', tr * 12]] : [])];
          const total = U.sum(lines, l => l[1]);
          $('#est-out').innerHTML = `<div class="text-xs font-bold uppercase tracking-wide text-slate-500">সম্ভাব্য বার্ষিক ব্যয় · ${esc(c?.name || '')}</div><div class="text-4xl font-extrabold text-brand-700 mt-1">${U.money(total)}</div><div class="text-sm text-slate-500">≈ মাসে ${U.money(total / 12)}</div>
            <div class="mt-4 divide-y divide-slate-100 text-sm">${lines.map(([l, v]) => `<div class="flex justify-between gap-3 py-2 ${v ? '' : 'text-slate-400'}"><span>${esc(l)}</span><span class="font-semibold whitespace-nowrap">${U.money(v)}</span></div>`).join('')}</div>
            <a href="${App.href('public', 'admissions')}" class="btn btn-primary w-full mt-4">${icon('file-pen-line')} আবেদন শুরু করুন</a>`;
          App.icons();
        };
        f.addEventListener('input', calc); calc();
      },
    },
    /* ---------------- Notices — rendered by js/modules/wiring.js ---------------- */
    { id: 'notices', label: 'নোটিশ', icon: 'megaphone', render() { return ''; } },
    /* ---------------- Admissions — the form builder version lives in js/modules/admissions.js ---------------- */
    { id: 'admissions', label: 'ভর্তি', icon: 'file-pen-line', render() { return ''; } },
    /* ---------------- Application tracker — forwards to Track & Verify (js/modules/website.js) ---------------- */
    { id: 'track', label: 'অনুসন্ধান', icon: 'search-check', render() { return ''; } },
    /* ---------------- Results — configurable search, result card and statistics: js/modules/pubresult.js ---------------- */
    { id: 'results', label: 'ফলাফল', icon: 'award', render() { return ''; } },
    /* ---------------- Track & Verify — rendered by js/modules/website.js ---------------- */
    { id: 'verify', label: 'যাচাই করুন', icon: 'shield-check', render() { return ''; } },
    /* ---------------- Contact ---------------- */
    {
      id: 'contact', label: 'যোগাযোগ', icon: 'phone',
      render() {
        const s = DB.s.school;
        return Pub.wrap(Pub.hero('যোগাযোগ করুন', 'দাপ্তরিক সময়: রবিবার–বৃহস্পতিবার, সকাল ৮:০০ – বিকাল ৩:০০।') + Pub.section('যোগাযোগ করুন', '', `<div class="grid md:grid-cols-2 gap-6">
          <div class="space-y-3">${DB.s.campuses.map(c => `<div class="card p-4"><div class="font-semibold flex items-center gap-2">${icon('school', 'w-5 h-5 text-brand-600')} ${esc(multiCampus() ? c.name : s.nameBn || s.name)}</div><div class="text-sm text-slate-600 mt-1">${icon('map-pin', 'w-3.5 h-3.5 inline')} ${esc(c.address)}<br>${icon('phone', 'w-3.5 h-3.5 inline')} ${esc(c.phone)}</div></div>`).join('')}${[['mail', s.email], ['clock', 'রবি–বৃহস্পতি · ০৮:০০–১৫:০০ (সাপ্তাহিক ছুটি শুক্র–শনি)']].map(([i, t]) => `<div class="card p-4 flex items-center gap-3">${icon(i, 'w-5 h-5 text-brand-600')}<span>${esc(t)}</span></div>`).join('')}</div>
          <form id="contact-form" class="card p-5 space-y-3"><div><label class="label">আপনার নাম</label><input class="input" name="name" required></div><div><label class="label">ফোন অথবা ই-মেইল</label><input class="input" name="contact" required></div><div><label class="label">বার্তা</label><textarea class="textarea" rows="4" name="message" required></textarea></div><button class="btn btn-primary">${icon('send')} জিজ্ঞাসা পাঠান</button></form></div>`));
      },
      mount() {
        $('#contact-form').addEventListener('submit', e => {
          e.preventDefault(); const f = formData(e.target);
          (DB.s.inquiries = DB.s.inquiries || []).push({ ...f, ts: new Date().toISOString() });
          DB.audit('PUBLIC_ENQUIRY', 'inquiries', `${f.name}-এর জিজ্ঞাসা`); DB.save();
          e.target.reset(); toast('ধন্যবাদ — দপ্তর এক কর্মদিবসের মধ্যে উত্তর দেবে।', 'success');
        });
      },
    },
    /* ---------------- Privacy ---------------- */
    {
      id: 'privacy', label: 'গোপনীয়তা নীতি', icon: 'lock',
      render() {
        const blocks = [
          ['credit-card', 'পরিশোধের নিরাপত্তা (PCI-DSS)', 'কার্ডের মাধ্যমে পরিশোধ আমাদের PCI-DSS লেভেল ১ পেমেন্ট প্রসেসর টোকেনাইজ করে। কার্ড নম্বর কখনোই বিদ্যালয়ের সার্ভারে পৌঁছায় না বা সংরক্ষিত হয় না; আমরা কেবল গেটওয়ের লেনদেন আইডি ও শেষ চারটি অঙ্ক সংরক্ষণ করি। মোবাইল ওয়ালেট (বিকাশ/নগদ) পরিশোধ সরাসরি সার্ভার-থেকে-সার্ভার যাচাই করা হয়।'],
          ['heart-pulse', 'চিকিৎসাকক্ষ ও স্বাস্থ্য-তথ্য', 'রক্তের গ্রুপ, অ্যালার্জি ও চিকিৎসা-সংক্রান্ত মন্তব্য কেবল অধ্যক্ষ, বিদ্যালয়ের নার্স এবং শিক্ষার্থীর নিজ অভিভাবকগণ দেখতে পারেন। এগুলো এনক্রিপ্ট করে সংরক্ষিত থাকে এবং প্রতিটি প্রবেশ অডিট লগে লিপিবদ্ধ হয়।'],
          ['folder-lock', 'শিক্ষার্থীর রেকর্ড', 'ঢাকা শিক্ষা বোর্ড কর্তৃক নির্ধারিত মেয়াদ পর্যন্ত একাডেমিক রেকর্ড সংরক্ষণ করা হয়। অভিভাবকগণ দপ্তরের মাধ্যমে কপি বা সংশোধনের আবেদন করতে পারেন। আমরা কখনোই বিজ্ঞাপনদাতাদের কাছে তথ্য বিক্রি বা প্রদান করি না।'],
          ['scroll-text', 'অডিট ও জবাবদিহি', 'প্রতিটি সংবেদনশীল পরিবর্তন — নম্বর, ফি, ভর্তি, ভূমিকা নির্ধারণ — একটি পরিবর্তন-প্রমাণযোগ্য, হ্যাশ-শৃঙ্খলিত অডিট লগে লিপিবদ্ধ হয়, যা আইটি বিভাগ পর্যালোচনা করে।'],
          ['user-check', 'আপনার অধিকার', 'আপনি ' + DB.s.school.email + ' ঠিকানায় লিখে ব্যক্তিগত তথ্যে প্রবেশাধিকার, সংশোধন বা অপসারণের অনুরোধ করতে পারেন (আইনানুগ সংরক্ষণ সাপেক্ষে)।'],
        ];
        return Pub.wrap(Pub.hero('প্রাতিষ্ঠানিক নীতি ও গোপনীয়তা কেন্দ্র', 'আমরা কীভাবে পরিশোধ, স্বাস্থ্য-তথ্য ও শিক্ষার্থীর রেকর্ড সুরক্ষিত রাখি।') + Pub.section('নীতিমালা', 'সর্বশেষ পর্যালোচনা ' + U.fmtDate(new Date().getFullYear() + '-01-15'), `<div class="grid md:grid-cols-2 gap-4">${blocks.map(([i, t, d]) => `<div class="card p-5"><div class="flex items-center gap-2 font-semibold">${icon(i, 'w-5 h-5 text-brand-600')} ${t}</div><p class="text-sm text-slate-600 mt-2 leading-relaxed">${esc(d)}</p></div>`).join('')}</div>`));
      },
    },
  ],
});

Object.assign(Pub, {
  /** The school's own fee heads with a fixed amount (registration, lab, sports …) — the late fine is not a planned cost. */
  feeExtras() { return (DB.s.feeHeads || []).filter(h => h.amount > 0 && h.id !== 'FH-LATE' && h.active !== false); },
  /** Transport routes with a monthly fee (Transport & fleet page). */
  routes() { return DB.s.featureFlags.transport === false ? [] : ((DB.s.transport || {}).routes || []).filter(r => r.fee > 0); },

  /** Admissions open for the session after the active one. */
  admSession() { return String(+DB.session() + 1); },
  quote(classId, coupon) {
    const fee = DB.fees(classId, Pub.admSession()).admissionFee;
    const c = coupon ? DB.s.coupons[coupon.toUpperCase()] : null;
    const pct = c ? c.pct : 0;
    return { fee, pct, net: Math.round(fee * (1 - pct / 100)), valid: !!c, label: c?.label };
  },

  COLORS: { bKash: '#e2136e', Nagad: '#f6921e', Rocket: '#8c3494', Card: '#1a1f71' },
  /** Payment chooser. Online checkout appears only when the school has configured its payment gateway
      (ফিচার ও সেটিংস → পেমেন্ট গেটওয়ে); "send money + TrxID" appears for each wallet with a merchant number.
      A TrxID payment stays pending until the accounts office matches it with the wallet statement. */
  payPicker(amount, backJs, cb = 'Pub.submitAdmission') {
    const f = DB.s.featureFlags, live = typeof PayGw !== 'undefined' && PayGw.live(), merchant = DB.s.school.merchant || {};
    const on = { bKash: f.gatewayBkash !== false, Nagad: f.gatewayNagad !== false, Rocket: f.gatewayRocket !== false, Card: f.gatewayCard !== false };
    const MN = { bKash: 'বিকাশ', Nagad: 'নগদ', Rocket: 'রকেট', Card: 'কার্ড' };
    const methods = ['bKash', 'Nagad', 'Rocket', 'Card'].filter(m => on[m] && (live || (m !== 'Card' && String(merchant[m] || '').trim())));
    const later = cb === 'Pub.submitAdmission' ? `<button class="btn btn-ghost mt-3" onclick="Pub.submitAdmission('Cash','PAY-AT-OFFICE',{channel:'Pay at office',verified:false})">${icon('building-2')} আবেদন জমা দিন — ফি অফিসে পরিশোধ করব</button>` : '';
    const off = `<div class="card p-4 bg-amber-50 border-amber-200 text-amber-900">${icon('info', 'w-4 h-4 inline')} অনলাইন পেমেন্ট চালু নেই — অফিসে${methods.length ? ' বা নিচের মার্চেন্ট নম্বরে সেন্ড মানি করে TrxID দিয়ে' : ''} পরিশোধ করুন।</div>`;
    return `<p class="text-sm text-slate-600 mb-4">পরিশোধযোগ্য: <b>${U.money(amount)}</b></p>${live ? '' : off}
      ${methods.length ? `<div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">${methods.map(m => `<div class="card p-4 text-center"><div class="mx-auto w-12 h-12 rounded-2xl flex items-center justify-center text-white font-extrabold" style="background:${Pub.COLORS[m]}">${m === 'Card' ? icon('credit-card', 'w-6 h-6') : MN[m][0]}</div><div class="font-semibold mt-2">${m === 'Card' ? 'Visa / Mastercard' : MN[m]}</div>
        <div class="flex flex-col gap-1.5 mt-3">${live ? `<button class="btn btn-primary btn-sm" onclick="Pub.gateway('${m}', ${amount}, 'checkout', '${cb}')">অনলাইনে পরিশোধ</button>` : ''}${m !== 'Card' && String(merchant[m] || '').trim() ? `<button class="btn btn-ghost btn-sm" onclick="Pub.gateway('${m}', ${amount}, 'trx', '${cb}')">সেন্ড মানি + ট্রানজ্যাকশন আইডি (TrxID)</button>` : ''}</div></div>`).join('')}</div>` : ''}
      ${later}${backJs ? `<div class="mt-6"><button class="btn btn-ghost" onclick="${backJs}">${icon('arrow-left')} ফিরে যান</button></div>` : ''}`;
  },
  /** checkout: the school's payment server creates the session and the payer is sent to the gateway (PayGw, js/modules/account.js).
      trx: the payer sends money to the merchant number and submits the TrxID; it stays pending until reconciled. */
  gateway(method, amount, mode = 'checkout', cb = 'Pub.submitAdmission') {
    if (mode === 'checkout') {
      if (typeof PayGw !== 'undefined' && PayGw.live()) return PayGw.start(method, amount, 'EP' + Date.now().toString().slice(-6), cb);
      return toast('অনলাইন পেমেন্ট চালু নেই — অফিসে বা TrxID দিয়ে পরিশোধ করুন।', 'warn');
    }
    const color = Pub.COLORS[method], walletPat = method === 'Rocket' ? '01[3-9][0-9]{8}[0-9]?' : '01[3-9][0-9]{8}';
    const ref = 'EP' + Date.now().toString().slice(-6);
    const mName = { bKash: 'বিকাশ', Nagad: 'নগদ', Rocket: 'রকেট' }[method] || method;
    const body = `<ol class="text-sm space-y-1.5 list-decimal ml-5 mb-4 text-slate-700"><li>${mName} অ্যাপ খুলুন অথবা ${{ bKash: '*247#', Nagad: '*167#', Rocket: '*322#' }[method] || ''} ডায়াল করুন।</li><li>মার্চেন্ট নম্বরে <b class="font-mono">${esc((DB.s.school.merchant || {})[method] || '')}</b> <b>পেমেন্ট</b> নির্বাচন করুন।</li><li>পরিমাণ <b>${U.money(amount)}</b>, রেফারেন্স <b class="font-mono">${ref}</b>।</li><li>নিশ্চিতকরণ এসএমএস থেকে ট্রানজ্যাকশন আইডি (TrxID) নিচে লিখুন।</li></ol>
        <form id="gw-form" class="space-y-3" autocomplete="off"><div><label class="label">আপনার ${mName} নম্বর</label><input class="input" name="wallet" pattern="${walletPat}" placeholder="01XXXXXXXXX" required></div>
        <div><label class="label">ট্রানজ্যাকশন আইডি (TrxID)</label><input class="input font-mono uppercase" name="trx" pattern="[A-Za-z0-9]{8,10}" placeholder="যেমন 9BK7A2QX4M" required></div>
        <p class="text-xs text-slate-500">পরিশোধটি <b>যাচাইয়ের অপেক্ষায়</b> হিসেবে লিপিবদ্ধ থাকবে, যতক্ষণ না হিসাব শাখা ${mName} বিবরণীর সাথে এই ট্রানজ্যাকশন আইডি মিলিয়ে দেখে।</p>
        <div id="gw-err" class="text-sm text-red-600"></div><button class="btn w-full text-white" style="background:${color}">${icon('send')} ট্রানজ্যাকশন আইডি জমা দিন</button></form>`;
    Modal.open({ title: `${mName} সেন্ড মানি`, size: 'sm', body: `<div class="rounded-xl text-white p-4 mb-4" style="background:${color}"><div class="text-xs opacity-80">মার্চেন্ট</div><div class="font-bold">${esc(DB.s.school.nameBn || DB.s.school.name)}</div><div class="text-2xl font-extrabold mt-2">${U.money(amount)}</div></div>${body}` });
    $('#gw-form').addEventListener('submit', e => {
      e.preventDefault(); const f = formData(e.target), err = m => { $('#gw-err').textContent = m; };
      const txn = U.asciiDigits(f.trx).toUpperCase();
      if (DB.trxIdUsed(txn)) return err('এই ট্রানজ্যাকশন আইডি (TrxID) ইতোমধ্যে অন্য একটি পরিশোধে ব্যবহৃত হয়েছে।');
      const meta = { channel: 'Manual TrxID', verified: false, msisdn: f.wallet, ref };
      Modal.body(`<div class="text-center py-6"><div class="w-10 h-10 border-4 border-slate-200 border-t-brand-600 rounded-full animate-spin mx-auto"></div><div class="mt-3 text-sm text-slate-600">ট্রানজ্যাকশন আইডি লিপিবদ্ধ করা হচ্ছে…</div></div>`);
      // cb is a dotted global path such as "Guardian.onPaid" (kept as a string so it can live in onclick markup).
      // Top-level `const` objects aren't window properties, so resolve the owner through global scope.
      const [obj, fn] = cb.split('.'), owner = /^[A-Za-z_$][\w$]*$/.test(obj) ? new Function(`return ${obj}`)() : null;
      setTimeout(() => owner[fn].call(owner, method, txn, meta), 300);
    });
  },

  submitAdmission(method, txn, meta = {}) {
    const d = App.ui.adm.d, q = Pub.quote(d.classId, d.coupon), y = Pub.admSession();
    const n = DB.s.admissions.filter(a => a.id.startsWith(`APP-${y}`)).length + 1;
    const a = { id: `APP-${y}-${String(n).padStart(4, '0')}`, ...d, campusId: DB.campusOf(d.classId), coupon: q.valid ? d.coupon : null, fee: q.fee, discountPct: q.pct, netPaid: q.net, payment: { method, txn, channel: meta.channel || 'Online checkout', verified: meta.verified ?? true, msisdn: meta.msisdn || null, at: new Date().toISOString() }, status: 'Pending', submittedAt: new Date().toISOString(), decidedAt: null, note: '' };
    DB.s.admissions.push(a);
    const later = meta.channel === 'Pay at office';
    if (later) Object.assign(a, { netPaid: 0, feeDue: q.net, payment: { method: 'Cash', txn: '', channel: 'Pay at office', verified: false, msisdn: null, at: null } });
    if (q.net > 0 && !later) DB.postJournal(`ভর্তি ফি ${a.id} · ${bn(method)}-এর মাধ্যমে${a.payment.verified ? '' : ' (ট্রানজ্যাকশন আইডি মিলিয়ে দেখার অপেক্ষায়)'}`, [{ acct: DB.mfsAccount(method), dr: q.net, cr: 0 }, { acct: '2200', dr: 0, cr: q.net }], a.id, null, null, { kind: 'RV', campusId: a.campusId, payee: d.guardianName });
    DB.sms(a.guardianPhone, `${DB.s.school.shortName}: ${a.studentNameBn || a.studentName}-এর আবেদন ${a.id} গৃহীত হয়েছে। আমাদের ওয়েবসাইটে অবস্থা দেখুন।`);
    DB.audit('ADMISSION_SUBMIT', 'admissions', `${a.id} · ${a.studentName} · ${later ? `ফি ${U.money(q.net)} অফিসে পরিশোধ করা হবে` : `${bn(method)}-এর মাধ্যমে ${U.money(q.net)}`}`, { role: 'PUBLIC' });
    DB.save();
    App.ui.adm = null;
    Modal.open({
      title: 'আবেদন জমা হয়েছে', size: 'sm',
      body: `<div class="text-center"><div class="w-14 h-14 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">${icon('check', 'w-7 h-7')}</div><div class="mt-3 text-sm text-slate-500">আপনার রেফারেন্স আইডি</div><div class="text-2xl font-mono font-extrabold">${a.id}</div>${later ? `<p class="text-sm text-amber-700 mt-2">${icon('building-2', 'w-4 h-4 inline')} ভর্তি ফি ${U.money(q.net)} প্রতিষ্ঠানের অফিসে পরিশোধ করুন; পরিশোধের পর আবেদন বিবেচনা করা হবে।</p>` : `<p class="text-sm text-slate-600 mt-2">${esc(bn(method))}-এর মাধ্যমে ${U.money(a.netPaid)} পরিশোধিত · ট্রানজ্যাকশন আইডি <span class="font-mono">${esc(txn)}</span></p>`}${a.payment.verified || later ? '' : `<p class="text-xs text-amber-700 mt-2">${icon('clock', 'w-3.5 h-3.5 inline')} ${esc(bn(method))} বিবরণীর সাথে পরিশোধ যাচাইয়ের অপেক্ষায় রয়েছে।</p>`}</div>`,
      footer: `<button class="btn btn-ghost" onclick="Modal.close();App.ui.trackTerm='${a.id}';App.go('public','track')">অবস্থা দেখুন</button><button class="btn btn-primary" onclick="Print.show('admissionReceipt','${a.id}')">${icon('download')} রসিদ ডাউনলোড করুন</button>`,
    });
    App.refresh();
  },
});
