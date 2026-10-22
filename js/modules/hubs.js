/* ==========================================================================
   দুটি একীভূত পাতা
   · ডাটাবেজ ব্যবস্থাপনা (রুট ড্যাশবোর্ড): আমদানি, রপ্তানি, ব্যাকআপ ও পুনরুদ্ধার, রিসাইকেল বিন, পরীক্ষামূলক ডেটা
     (DataIO — dataio.js, ServerBackup — sync.js, RecycleBin / DemoData — platform.js)
   · ব্যবহারকারী ব্যবস্থাপনা (রুট ও অধ্যক্ষের ড্যাশবোর্ড): ব্যবহারকারী, পাসওয়ার্ড অনুরোধ, ব্যবহারকারী ধরন
     (Admin users — views/admin.js, StaffUsers / PwDesk / CustomRoles — account.js, Users — wiring.js)
   Old page ids (data, recycle-bin, demo-data, users, user-accounts, pw-desk) open the right tab.
   ========================================================================== */

/** Remove the query (?tab=…) from the address once it has been read, so later re-renders keep the chosen tab. */
function hubDropQuery(portal, page) {
  App.route.query = {};
  App.replaceUrl(App.href(portal, page));
}

/* ---------------- ডাটাবেজ ব্যবস্থাপনা ---------------- */
const DbHub = {
  canView() { return App.has('ADMIN') || App.perm('system', 'view'); },
  /** Root User: every tab. Others with system access: export (view) and import (edit). */
  tabs() {
    const root = App.has('ADMIN');
    return [['import', 'আমদানি', 'file-up', root || App.perm('system', 'edit')], ['export', 'রপ্তানি', 'file-down', this.canView()],
      ['backup', 'ব্যাকআপ ও পুনরুদ্ধার', 'database-backup', root], ['bin', 'রিসাইকেল বিন', 'trash-2', root], ['demo', 'পরীক্ষামূলক ডেটা', 'flask-conical', root]]
      .filter(t => t[3]).map(t => t.slice(0, 3));
  },
  render(q = {}) {
    const T = this.tabs();
    if (!T.length) return pageHeader('ডাটাবেজ ব্যবস্থাপনা') + `<div class="card p-6">${emptyState('এই অংশ দেখার অনুমতি আপনার নেই।', 'lock')}</div>`;
    if (q.tab) { if (T.some(t => t[0] === q.tab)) App.ui.dataTab = q.tab; hubDropQuery(App.route.portal, 'database'); }
    const t = T.some(x => x[0] === App.ui.dataTab) ? App.ui.dataTab : T[0][0]; App.ui.dataTab = t;
    let body = '';
    try { body = t === 'import' ? DataIO.renderImport() : t === 'export' ? DataIO.renderExport() : t === 'backup' ? DataIO.renderBackup() : t === 'bin' ? RecycleBin.page() : DemoData.page(); }
    catch (e) { console.error(e); body = `<div class="card p-6">${emptyState('এই অংশটি দেখানো যায়নি — পাতাটি আবার লোড করুন।', 'triangle-alert')}</div>`; }
    return pageHeader('ডাটাবেজ ব্যবস্থাপনা') + tabs('dataTab', T, t) + `<div class="fade-in">${body}</div>`;
  },
  mount() {
    const t = App.ui.dataTab;
    try { if (t === 'bin') RecycleBin.mount(); if (t === 'demo') DemoData.mount(); } catch (e) { console.error(e); }
  },
};

/* ---------------- ব্যবহারকারী ব্যবস্থাপনা ---------------- */
const UserHub = {
  /** The Root User's provisioning table (the old admin page `users`), kept for the ব্যবহারকারী tab. */
  rootPage: null,
  pending() { return typeof PwHelp !== 'undefined' && PwHelp.canReset() ? PwHelp.pending().length : 0; },
  tabs() {
    const root = App.has('ADMIN'), prin = App.has('PRINCIPAL'), n = this.pending();
    return [['users', 'ব্যবহারকারী', 'users', root || prin], ['requests', `পাসওয়ার্ড অনুরোধ${n ? ` (${bnNum(n)})` : ''}`, 'key-round', typeof PwHelp !== 'undefined' && PwHelp.canReset()],
      ['roles', 'ব্যবহারকারী ধরন', 'user-round-plus', root]].filter(t => t[3]).map(t => t.slice(0, 3));
  },
  /** Settings → ভূমিকা ও অনুমতি, when this user may open Settings. */
  permsLink() {
    const portal = App.route.portal, pg = App.portals[portal]?.pages.find(p => p.id === 'settings');
    if (!pg || !App.pageOk(pg) || !(App.has('ADMIN') || App.has('PRINCIPAL'))) return '';
    return `<button class="btn btn-ghost" onclick="App.ui.setTab='rbac';App.ui.rbMode='module';App.go('${portal}','settings')">${icon('shield-check')} অনুমতি</button>`;
  },
  render(q = {}) {
    const T = this.tabs(), portal = App.route.portal;
    if (!T.length) return pageHeader('ব্যবহারকারী ব্যবস্থাপনা') + `<div class="card p-6">${emptyState('এই অংশ দেখার অনুমতি আপনার নেই।', 'lock')}</div>`;
    if (q.tab) { if (T.some(t => t[0] === q.tab)) App.ui.usrTab = q.tab; hubDropQuery(portal, 'user-admin'); }
    const t = T.some(x => x[0] === App.ui.usrTab) ? App.ui.usrTab : T[0][0]; App.ui.usrTab = t;
    let body = '';
    try {
      if (t === 'users') body = App.has('ADMIN') && this.rootPage ? this.rootPage.render() : StaffUsers.panel();
      else if (t === 'requests') body = PwDesk.panel();
      else body = CustomRoles.editor();
    } catch (e) { console.error(e); body = `<div class="card p-6">${emptyState('এই অংশটি দেখানো যায়নি — পাতাটি আবার লোড করুন।', 'triangle-alert')}</div>`; }
    return pageHeader('ব্যবহারকারী ব্যবস্থাপনা', '', this.permsLink()) + tabs('usrTab', T, t) + `<div class="fade-in">${body}</div>`;
  },
  mount() {
    try { if (App.ui.usrTab === 'users' && App.has('ADMIN') && this.rootPage?.mount && $('#us-q')) this.rootPage.mount(); } catch (e) { console.error(e); }
  },
};

/* ---------------- pages, old ids → tabs ---------------- */
const HUB_MOVES = {
  data: ['database', 'dataTab', null], 'recycle-bin': ['database', 'dataTab', 'bin'], 'demo-data': ['database', 'dataTab', 'demo'],
  users: ['user-admin', 'usrTab', 'users'], 'user-accounts': ['user-admin', 'usrTab', 'users'], 'pw-desk': ['user-admin', 'usrTab', 'requests'],
};
(() => {
  ['admin', 'principal'].forEach(pid => {
    const P = App.portals[pid]; if (!P) return;
    if (pid === 'admin') { const old = P.pages.find(p => p.id === 'users'); if (old) UserHub.rootPage = { render: old.render, mount: old.mount }; }
    P.pages = P.pages.filter(p => !HUB_MOVES[p.id]);
  });
  const userPage = () => ({
    id: 'user-admin', label: 'ব্যবহারকারী ব্যবস্থাপনা', icon: 'user-cog',
    when: () => App.has('ADMIN') || App.has('PRINCIPAL') || (typeof PwHelp !== 'undefined' && PwHelp.canReset()),
    count: () => UserHub.pending() || '',
    render: q => UserHub.render(q), mount: q => UserHub.mount(q),
  });
  App.addPage('admin', { id: 'database', label: 'ডাটাবেজ ব্যবস্থাপনা', icon: 'database', when: () => DbHub.canView(), render: q => DbHub.render(q), mount: q => DbHub.mount(q) }, 'audit');
  App.addPage('admin', userPage(), 'audit');
  App.addPage('principal', userPage());
  // links and bookmarks to the old pages open the matching tab
  const parse0 = App.parse.bind(App);
  App.parse = function () {
    const r = parse0(), mv = HUB_MOVES[r.page];
    if (!mv) return r;
    const P = this.portals[r.portal] || Object.values(this.portals).find(p => p.slug && p.slug === r.portal);
    if (!P || !['admin', 'principal'].includes(P.id) || P.pages.some(p => p.id === r.page || p.slug === r.page) || !P.pages.some(p => p.id === mv[0])) return r;
    if (mv[2]) App.ui[mv[1]] = mv[2];
    r.page = mv[0];
    this.replaceUrl(this.href(P.id, mv[0]));
    return r;
  };
})();
