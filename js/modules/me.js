/* ============================================================
   আমার অ্যাকাউন্ট — every signed-in user's own account page:
   login details, roles, password change (checked on the server).
   Reached from the user menu; not listed in the sidebar.
   ============================================================ */
const Me = {
  /** Related "my profile" pages that already exist per portal. */
  LINKS: { teacher: ['my-profile', 'আমার প্রোফাইল (শিক্ষক)'], student: ['profile', 'আমার প্রোফাইল'], guardian: ['profile', 'সন্তানের প্রোফাইল'] },
  /** The Root User, and staff whose role may edit users/system, change their own name, mobile and e-mail here
      (server: POST api/me/profile checks the same). Everyone else asks the office. */
  canEdit() { return !!App.session && (App.has('ADMIN') || App.perm('system', 'edit') || App.perm('users', 'edit')); },
  async saveProfile(form) {
    const d = formData(form), btn = form.querySelector('button');
    const phone = U.asciiDigits(d.phone || '').replace(/[\s-]/g, '').replace(/^\+?88/, '');
    if (!String(d.name || '').trim()) return toast('ইংরেজিতে নাম লিখুন।', 'error');
    if (!/^01[3-9]\d{8}$/.test(phone)) return toast('সঠিক মোবাইল নম্বর লিখুন (01XXXXXXXXX)।', 'error');
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) return toast('সঠিক ই-মেইল ঠিকানা লিখুন।', 'error');
    btn.disabled = true;
    try {
      const r = await DB.api('me/profile', { name: d.name.trim(), nameBn: (d.nameBn || '').trim(), phone, email: (d.email || '').trim() });
      const u = App.user(), R = DB.remote, clean = R.base.users === JSON.stringify(DB.s.users);
      Object.assign(u, r.user || {});
      if (clean) R.base.users = JSON.stringify(DB.s.users);   // already saved on the server
      toast('আপনার তথ্য সংরক্ষিত হয়েছে।', 'success'); App.render();
    } catch (e) {
      btn.disabled = false;
      toast(e.status === 403 ? 'নিজের তথ্য বদলানোর অনুমতি আপনার নেই — অফিসে যোগাযোগ করুন।' : e.message === 'bad_request' ? 'তথ্য সঠিক নয় — আবার দেখুন।' : 'সার্ভারের সঙ্গে যোগাযোগ করা যায়নি — আবার চেষ্টা করুন।', 'error');
    }
  },
  /** Teachers and students: their role profile page is shown as a tab of this page (one "আমার প্রোফাইল"). */
  MERGED: ['teacher', 'student'],
  profilePage() { const link = this.LINKS[App.route.portal]; return this.MERGED.includes(App.route.portal) && link ? App.portals[App.route.portal].pages.find(p => p.id === link[0] && App.pageOk(p)) : null; },
  tab() { const pp = this.profilePage(); return pp && App.ui.meTab !== 'login' ? 'profile' : 'login'; },
  page(q) {
    const u = App.user(); if (!u) return '';
    const pp = this.profilePage(), t = this.tab();
    const head = pageHeader('আমার প্রোফাইল', '') + (pp ? pills([['profile', 'প্রোফাইল', 'id-card'], ['login', 'লগইন ও পাসওয়ার্ড', 'key-round']], t, id => `App.ui.meTab='${id}';App.refresh()`) : '');
    if (t === 'profile') { const h = pp.render(q || {}); return head + String(h).replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/, ''); }   // one heading: this page's
    return head + this.loginHtml(u);
  },
  loginHtml(u) {
    const row = (k, v) => `<div class="flex flex-wrap gap-x-4 gap-y-1 py-2 border-b border-slate-100 last:border-0"><dt class="w-40 text-slate-500 shrink-0">${k}</dt><dd class="font-medium min-w-0 break-words">${v || '—'}</dd></div>`;
    const link = !this.MERGED.includes(App.route.portal) && this.LINKS[App.route.portal], P = App.portals[App.route.portal], lp = link && P.pages.find(p => p.id === link[0] && App.pageOk(p));
    return `<div class="grid lg:grid-cols-2 gap-4 items-start">
        <section class="card p-5" aria-labelledby="me-h1">
          <div class="flex items-center gap-3 mb-3">${avatar(u, 48)}<div class="min-w-0"><h2 id="me-h1" class="font-semibold text-lg truncate">${esc(pn(u))}</h2><div class="flex flex-wrap gap-1 mt-1">${App.roles().map(r => badge(ROLES[r]?.label || r, 'blue')).join('')}</div></div></div>
          ${this.canEdit() ? `<form id="me-form" class="grid sm:grid-cols-2 gap-3" novalidate>
            <div class="sm:col-span-2 text-slate-500">ইউজার আইডি: <b class="text-slate-800" data-noi18n>@${esc(u.username)}</b></div>
            <div><label class="label" for="me-nameBn">নাম (বাংলায়)</label><input id="me-nameBn" class="input" name="nameBn" maxlength="120" value="${esc(u.nameBn || '')}"></div>
            <div><label class="label" for="me-name">নাম (ইংরেজিতে) *</label><input id="me-name" class="input" name="name" maxlength="120" required lang="en" value="${esc(u.name || '')}"></div>
            <div><label class="label" for="me-phone">মোবাইল *</label><input id="me-phone" class="input" name="phone" inputmode="tel" maxlength="14" required value="${esc(u.phone || '')}" placeholder="01XXXXXXXXX"></div>
            <div><label class="label" for="me-email">ই-মেইল</label><input id="me-email" class="input" name="email" type="email" maxlength="120" value="${esc(u.email || '')}"></div>
            <div class="sm:col-span-2"><button class="btn btn-primary">${icon('save')} তথ্য সংরক্ষণ করুন</button></div></form>`
          : `<dl>${row('ইউজার আইডি', '@' + esc(u.username))}${row('মোবাইল', esc(U.bn(u.phone || '')))}${row('ই-মেইল', esc(u.email || ''))}${u.name && u.nameBn && u.name !== u.nameBn ? row('নাম (ইংরেজিতে)', esc(u.name)) : ''}</dl>
          <p class="text-slate-500 mt-3">নাম, মোবাইল বা ই-মেইল বদলাতে প্রতিষ্ঠানের অফিসে যোগাযোগ করুন।</p>`}
          ${lp ? `<button class="btn btn-ghost mt-3" onclick="App.go('${P.id}','${lp.id}')">${icon('id-card')} ${esc(link[1])}</button>` : ''}
        </section>
        <section class="card p-5" aria-labelledby="me-h2">
          <h2 id="me-h2" class="font-semibold text-lg mb-1">${icon('key-round', 'w-5 h-5 inline -mt-1')} পাসওয়ার্ড বদলান</h2>
          ${u.pwDefault ? `<p class="text-amber-700 bg-amber-50 rounded-lg px-3 py-2 my-2">নিরাপত্তার জন্য প্রাথমিক পাসওয়ার্ডটি এখনই বদলে নিন।</p>` : ''}
          <form id="pw-form" class="space-y-3 mt-3">
            <div><label class="label" for="pw-cur">বর্তমান পাসওয়ার্ড</label><input id="pw-cur" class="input" type="password" name="cur" required autocomplete="current-password"></div>
            <div><label class="label" for="pw-next">নতুন পাসওয়ার্ড</label><input id="pw-next" class="input" type="password" name="next" minlength="10" required autocomplete="new-password"><p class="text-slate-500 mt-1">কমপক্ষে ১০ অক্ষর; অক্ষর ও সংখ্যা দুটোই থাকতে হবে।</p></div>
            <div><label class="label" for="pw-next2">নতুন পাসওয়ার্ড আবার লিখুন</label><input id="pw-next2" class="input" type="password" name="next2" minlength="10" required autocomplete="new-password"></div>
            <button class="btn btn-primary">${icon('save')} পাসওয়ার্ড বদলান</button>
          </form>
        </section></div>`;
  },
  mount(q) {
    if (this.tab() === 'profile') { const pp = this.profilePage(); return pp?.mount && pp.mount(q || {}); }
    $('#me-form')?.addEventListener('submit', e => { e.preventDefault(); this.saveProfile(e.target); });
    $('#pw-form')?.addEventListener('submit', async e => {
      e.preventDefault(); const f = formData(e.target), u = App.user(), btn = e.target.querySelector('button');
      if (f.next !== f.next2) return toast('নতুন পাসওয়ার্ড দুইবার একই লিখুন।', 'error');
      if (f.next === f.cur) return toast('নতুন পাসওয়ার্ড আগেরটির চেয়ে আলাদা হতে হবে।', 'error');
      btn.disabled = true;
      try { await DB.api('password', { current: f.cur, next: f.next }); }
      catch (err) { btn.disabled = false; return toast(err.message === 'wrong_current' ? 'বর্তমান পাসওয়ার্ডটি সঠিক নয়।' : err.message === 'weak' ? (err.data?.message || 'পাসওয়ার্ডটি যথেষ্ট শক্ত নয়।') : err.message === 'same' ? 'নতুন পাসওয়ার্ড আগেরটির চেয়ে আলাদা হতে হবে।' : 'সার্ভারের সঙ্গে যোগাযোগ করা যায়নি — আবার চেষ্টা করুন।', 'error'); }
      u.pwDefault = false; DB.audit('PASSWORD_CHANGE', 'users', `${u.username} নিজের পাসওয়ার্ড পরিবর্তন করেছেন`); DB.save();
      e.target.reset(); btn.disabled = false; toast('পাসওয়ার্ড বদলানো হয়েছে।', 'success'); App.refresh();
    });
  },
};
// one hidden page per dashboard portal (custom user types use the principal/admin portals)
['admin', 'principal', 'teacher', 'student', 'guardian'].forEach(id => { if (App.portals[id]) App.addPage(id, { id: 'account', label: 'আমার প্রোফাইল', icon: 'user-round', hidden: true, render: q => Me.page(q), mount: q => Me.mount(q) }); });
// teachers' and students' separate profile pages leave the sidebar; their old links open the merged page's profile tab
Me.MERGED.forEach(id => { const P = App.portals[id], pg = P?.pages.find(p => p.id === Me.LINKS[id][0]); if (!pg) return; pg.hidden = true; pg._hidden = true;
  const r0 = pg.render; pg.render = function (q) { if (App.route.page === pg.id) { App.ui.meTab = 'profile'; setTimeout(() => App.go(id, 'account'), 0); return ''; } return r0.call(this, q); }; });
// user menu → this page; the old pop-up password dialog is gone (people.js forced-change still calls App.changePassword)
App.myAccount = function () { $('#user-menu')?.classList.add('hidden'); const p = this.route.portal !== 'public' ? this.route.portal : ROLES[this.session?.role]?.portal; if (p) this.go(p, 'account'); };
App.changePassword = App.myAccount;
