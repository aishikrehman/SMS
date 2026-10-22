/* ==========================================================================
   CUSTOMISATION
   · Menus & URLs — rename, reorder, hide and re-slug every page of every portal
     (public header/footer menus, dashboard sidebars, custom links, portal prefix)
   · Homepage builder — ordered, toggleable sections incl. free text blocks
   · Pages & footer — custom content pages, page banners, About page, footer text
   · Structure — class levels / groups (Pre-primary … Nurani, Kitabkhana),
     batches, streams, class teacher, section teachers and mentors
   · Features & settings — every feature switch with its own parameters
   ========================================================================== */

/** Tiny, safe markdown: "## heading", "- bullet", blank-line paragraphs, **bold**, [text](link). */
function mdLite(text) {
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\(((?:https?:\/\/|#)[^)\s]+)\)/g, (m, t, u) => `<a href="${u}"${u.startsWith('#') ? '' : ' target="_blank" rel="noopener"'}>${t}</a>`);
  return String(text || '').split(/\n{2,}/).map(b => {
    const lines = b.split('\n').filter(l => l.trim());
    if (!lines.length) return '';
    if (lines.every(l => /^\s*-\s+/.test(l))) return `<ul>${lines.map(l => `<li>${inline(l.replace(/^\s*-\s+/, ''))}</li>`).join('')}</ul>`;
    if (/^##\s+/.test(lines[0])) return `<h3>${inline(lines[0].replace(/^##\s+/, ''))}</h3>${lines.length > 1 ? `<p>${lines.slice(1).map(inline).join('<br>')}</p>` : ''}`;
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}
/** Resolve a link typed by an admin: page id → app URL, otherwise as given. */
function siteLink(l) { l = String(l || '').trim(); if (!l) return '#'; if (/^(https?:|#|mailto:|tel:)/.test(l)) return l; return App.href('public', l); }

/* ---------------- class levels / groups ---------------- */
const LEVEL_PRESETS = ['প্রাক-প্রাথমিক', 'প্রাথমিক', 'নিম্ন মাধ্যমিক', 'মাধ্যমিক', 'উচ্চ মাধ্যমিক', 'নূরানী', 'কিতাবখানা', 'হিফজ', 'দাখিল', 'আলিম'];
DB.addSeeder('levels', s => {
  const lv = ['প্রাক-প্রাথমিক', 'প্রাথমিক', 'নিম্ন মাধ্যমিক', 'মাধ্যমিক', 'উচ্চ মাধ্যমিক', 'নূরানী', 'কিতাবখানা', 'হিফজ'].map((name, i) => ({ id: 'LV' + (i + 1), name }));
  const by = g => g <= 0 ? 'LV1' : g <= 5 ? 'LV2' : g <= 8 ? 'LV3' : g <= 10 ? 'LV4' : 'LV5';
  (s.classes || []).forEach(c => { if (!c.level) c.level = by(c.grade); });
  return lv;
});

/* ---------------- Menus & URLs ---------------- */
const Menus = {
  PORTALS: [['public', 'পাবলিক ওয়েবসাইট'], ['admin', 'রুট ব্যবহারকারী'], ['principal', 'অধ্যক্ষ'], ['teacher', 'শিক্ষক'], ['student', 'শিক্ষার্থী'], ['guardian', 'অভিভাবক']],
  FOOTER: { admissions: 'services', verify: 'services', services: 'services', results: 'services', careers: 'services', prospectus: 'info', notices: 'info', calendar: 'info', privacy: 'info', contact: 'info' },
  cfg() { return DB.s.menus || (DB.s.menus = {}); },
  pc(portal) { const c = this.cfg(); return c[portal] || (c[portal] = { slug: '', pages: {}, order: null, links: [] }); },
  /** One-time: give every portal its own page objects (some are shared) and remember the built-in labels/order. */
  snapshot() {
    if (typeof navMergeRoot === 'function') navMergeRoot();   // Root User: every Principal page too (wiring.js)
    Object.values(App.portals).forEach(P => {
      if (P._order) return;
      if (typeof NAV_GROUPS !== 'undefined' && NAV_GROUPS[P.id]) P.groupOrder = [...NAV_GROUPS[P.id].order];
      P.pages = P.pages.map(p => { const c = Object.assign(Object.create(Object.getPrototypeOf(p)), p); c._label = p.label; c._group = typeof navGroupOf === 'function' ? navGroupOf(P.id, p) : p.group; c._hidden = !!p.hidden; return c; });
      // remember pages in the order the sidebar shows them (grouped), so editing the order keeps the groups intact
      if (P.groupOrder) { const go = P.groupOrder, gi = p => { const i = go.indexOf(p._group); return i < 0 ? 99 : i; }, oi = P.pages.map(p => p.id);
        // inside a group: the order of the built-in map (wiring.js NAV_GROUPS), then the registration order
        const mk = typeof NAV_GROUPS !== 'undefined' && NAV_GROUPS[P.id] ? Object.keys(NAV_GROUPS[P.id].map) : [], mi = p => { const i = mk.indexOf(p.id); return i < 0 ? 999 : i; };
        P.pages.sort((a, b) => gi(a) - gi(b) || mi(a) - mi(b) || oi.indexOf(a.id) - oi.indexOf(b.id)); }
      P._order = P.pages.map(p => p.id); P._groupOrder = P.groupOrder ? [...P.groupOrder] : null;
      if (P.nav) P._nav = P.nav.map(n => n[0]);
    });
  },
  apply() {
    this.snapshot(); Pages.sync();
    Object.values(App.portals).forEach(P => {
      const c = this.cfg()[P.id] || {}, o = id => c.pages?.[id] || {};
      P.slug = c.slug || null;
      // a group typed earlier with an old built-in name follows the new grouping (NAV_ALIAS, wiring.js)
      const grp = g => (g && typeof NAV_ALIAS !== 'undefined' && NAV_ALIAS[g] && !(P._groupOrder || []).includes(g) ? NAV_ALIAS[g] : g);
      P.pages.forEach(p => { const x = o(p.id); p.label = x.label || p._label; p.group = grp(x.group) || p._group; p.hidden = x.hidden ?? p._hidden; p.slug = x.slug || p.defSlug || null; });
      const ord = c.order || P._order, ix = id => { const i = ord.indexOf(id); return i < 0 ? 1000 + P._order.indexOf(id) : i; };
      P.pages.sort((a, b) => ix(a.id) - ix(b.id));
      P.groupOrder = c.order ? [...new Set(P.pages.map(p => p.group).filter(Boolean))] : P._groupOrder;
      // nav entry: [id, label, url?, newTab?, parentId?] — items with a parent show in that item's drop-down
      if (P.id === 'public') P.nav = this.items('public').filter(i => i.nav).map(i => [i.id, i.label, i.url || null, !!i.newTab, i.parent || '']);
    });
  },
  /** Public menu items (pages + custom links) in display order with nav / footer placement. */
  items(portal = 'public') {
    const P = App.portals[portal], c = this.cfg()[portal] || {}, links = c.links || [];
    const pages = P.pages.filter(p => p.id !== 'track').map(p => { const x = c.pages?.[p.id] || {}; return { id: p.id, label: p.label, page: p, nav: x.nav ?? (P._nav || []).includes(p.id), footer: x.footer ?? this.FOOTER[p.id] ?? '', parent: x.parent || '' }; });
    const all = [...pages, ...links.map(l => ({ ...l, link: true }))], ord = c.order || P._nav || [];
    const ix = it => { const i = ord.indexOf(it.id); return i < 0 ? 1000 + all.indexOf(it) : i; };
    return all.sort((a, b) => ix(a) - ix(b));
  },
  footerItems(col) {
    return this.items().filter(i => i.footer === col && (i.link || App.pageOk(i.page))).map(i => ({ label: i.label, href: i.link ? i.url : App.href('public', i.id), blank: i.link && i.newTab }));
  },

  /* ----- editor (Settings → Menus & URLs) ----- */
  editor() {
    const portal = App.ui.mnP || 'public', P = App.portals[portal], c = this.pc(portal), pub = portal === 'public', can = Settings.canEdit();
    const rows = pub ? this.items() : P.pages.map(p => ({ id: p.id, label: p.label, page: p }));
    const groups = [...new Set(P.pages.map(p => p.group).filter(Boolean))];
    const dis = can ? '' : 'disabled';
    // a drop-down parent must itself be a top-level menu item
    const parents = pub ? rows.filter(r => r.nav && !r.parent) : [];
    const parentSel = it => `<select class="select !py-1 mt-1 text-xs" name="parent" title="উপমেনু হিসেবে যার নিচে দেখাবে" ${dis}><option value="">মূল মেনুতে</option>${parents.filter(p => p.id !== it.id).map(p => `<option value="${p.id}" ${it.parent === p.id ? 'selected' : ''}>↳ ${esc(p.label)}-এর নিচে</option>`).join('')}</select>`;
    const ns = DB.s.site.navStyle || {};
    const row = (it, i) => {
      const p = it.page, x = c.pages?.[it.id] || {};
      const move = `<div class="flex flex-col"><button type="button" class="btn btn-ghost btn-sm !px-1 !py-0" ${i ? '' : 'disabled'} onclick="Menus.move('${it.id}',-1)">${icon('chevron-up', 'w-3.5 h-3.5')}</button><button type="button" class="btn btn-ghost btn-sm !px-1 !py-0" ${i < rows.length - 1 ? '' : 'disabled'} onclick="Menus.move('${it.id}',1)">${icon('chevron-down', 'w-3.5 h-3.5')}</button></div>`;
      if (it.link) return `<tr data-link="${it.id}"><td>${move}</td><td class="text-center"><input type="checkbox" name="nav" ${it.nav ? 'checked' : ''} ${dis}></td><td><input class="input !py-1" name="label" value="${esc(it.label)}" ${dis}><div class="text-[10px] text-slate-400">কাস্টম লিংক</div></td><td><input class="input !py-1 font-mono text-xs" name="url" value="${esc(it.url)}" placeholder="https://… অথবা /…" ${dis}><label class="text-[11px] flex items-center gap-1 mt-1"><input type="checkbox" name="newTab" ${it.newTab ? 'checked' : ''} ${dis}> নতুন ট্যাবে খুলুন</label></td>
        <td><select class="select !py-1" name="footer" ${dis}>${[['', '—'], ['services', 'ফুটার কলাম ১'], ['info', 'ফুটার কলাম ২']].map(([v, l]) => `<option value="${v}" ${v === (it.footer || '') ? 'selected' : ''}>${l}</option>`).join('')}</select>${parentSel(it)}</td><td><button type="button" class="btn btn-ghost btn-sm" onclick="Menus.delLink('${it.id}')" ${dis}>${icon('trash-2')}</button></td></tr>`;
      return `<tr data-page="${it.id}"><td>${move}</td><td class="text-center"><input type="checkbox" name="${pub ? 'nav' : 'show'}" ${pub ? (it.nav ? 'checked' : '') : (p.hidden ? '' : 'checked')} ${dis}></td>
        <td><input class="input !py-1" name="label" value="${esc(x.label || '')}" placeholder="${esc(p._label)}" ${dis}><div class="text-[10px] font-mono text-slate-400">${p.id}${p.cms ? ' · কাস্টম পৃষ্ঠা' : ''}</div></td>
        <td><div class="flex items-center gap-1 text-xs font-mono"><span class="text-slate-400 whitespace-nowrap">/${pub ? '' : esc(P.slug || portal) + '/'}</span><input class="input !py-1 font-mono text-xs" name="slug" value="${esc(x.slug || '')}" placeholder="${esc(p.defSlug || p.id)}" pattern="[a-z0-9][a-z0-9-]*" ${dis}></div></td>
        <td>${pub ? `<select class="select !py-1" name="footer" ${dis}>${[['', '—'], ['services', 'ফুটার কলাম ১'], ['info', 'ফুটার কলাম ২']].map(([v, l]) => `<option value="${v}" ${v === (it.footer || '') ? 'selected' : ''}>${l}</option>`).join('')}</select>${parentSel(it)}` : `<input class="input !py-1" name="group" list="mn-groups" value="${esc(x.group || '')}" placeholder="${esc(p._group || 'সাধারণ')}" ${dis}>`}</td>
        <td><a class="btn btn-ghost btn-sm" href="${App.href(portal, p.id)}" ${pub ? 'target="_blank"' : ''} title="খুলুন">${icon('external-link')}</a></td></tr>`;
    };
    return `${pills(this.PORTALS, portal, id => `App.ui.mnP='${id}';App.refresh()`)}
      <form id="mn-form" class="mt-4 space-y-4" onsubmit="Menus.save();return false"><div class="card p-4 flex flex-wrap items-end gap-3 ${pub ? 'hidden' : ''}"><div><label class="label">এই ${pub ? 'ওয়েবসাইটের' : 'কর্মক্ষেত্রের'} ইউআরএল উপসর্গ</label><div class="flex items-center gap-1 font-mono text-sm"><span class="text-slate-400">/</span><input class="input !w-48 font-mono" name="portalSlug" value="${esc(c.slug || '')}" placeholder="${portal}" pattern="[a-z0-9][a-z0-9-]*" ${dis}><span class="text-slate-400">/page</span></div></div>
          <p class="text-xs text-slate-500 flex-1 min-w-[16rem]">অন্তর্নির্মিত মান রাখতে ঘর ফাঁকা রাখুন। ইউআরএল পরিবর্তনের পরও পুরোনো লিংক (অন্তর্নির্মিত আইডি) কার্যকর থাকবে। কেবল ছোট হাতের অক্ষর, অঙ্ক ও হাইফেন ব্যবহার করুন।</p></div>
        ${pub ? `<div class="card p-4 flex flex-wrap items-end gap-4"><div><label class="label">মেনু বারের রং</label><select class="select" name="navTheme" ${dis}>${[['brand', 'ব্র্যান্ড রং'], ['white', 'সাদা'], ['dark', 'গাঢ়'], ['accent', 'অ্যাকসেন্ট রং']].map(([v, l]) => `<option value="${v}" ${(ns.theme || 'brand') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <label class="flex items-center gap-2 text-sm pb-2"><input type="checkbox" name="navSticky" ${ns.sticky !== false ? 'checked' : ''} ${dis}> স্ক্রল করলেও মেনু ওপরে আটকে থাকবে</label>
          <label class="flex items-center gap-2 text-sm pb-2"><input type="checkbox" name="navIcons" ${ns.icons ? 'checked' : ''} ${dis}> মেনুতে আইকন দেখান</label>
          <p class="text-xs text-slate-500 flex-1 min-w-[14rem]">কোনো আইটেমকে অন্য আইটেমের <b>উপমেনু</b> করতে ফুটার কলামের নিচের তালিকা থেকে “…-এর নিচে” বেছে নিন — বড় পর্দায় ড্রপ-ডাউন হিসেবে দেখাবে।</p></div>` : ''}
        <div class="card scroll-x"><table class="table"><thead><tr><th class="w-10">ক্রম</th><th class="text-center">${pub ? 'শিরোনাম মেনুতে' : 'সাইডবারে'}</th><th>লেবেল</th><th>ইউআরএল</th><th>${pub ? 'ফুটার' : 'সাইডবার গ্রুপ'}</th><th></th></tr></thead><tbody>${rows.map(row).join('')}</tbody></table></div>
        <datalist id="mn-groups">${groups.map(g => `<option value="${esc(g)}">`).join('')}</datalist>
        ${can ? `<div class="flex flex-wrap gap-2">${pub ? `<button type="button" class="btn btn-ghost" onclick="Menus.addLink()">${icon('link')} কাস্টম লিংক যোগ করুন</button>` : ''}<span class="flex-1"></span><button type="button" class="btn btn-ghost" onclick="Menus.reset('${portal}')">${icon('rotate-ccw')} ডিফল্ট অবস্থায় ফেরান</button><button class="btn btn-primary">${icon('save')} মেনু সংরক্ষণ করুন</button></div>` : ''}</form>`;
  },
  /** Copy the editor form into the config (no validation). */
  collect() {
    const f = $('#mn-form'); if (!f) return;
    const portal = App.ui.mnP || 'public', c = this.pc(portal), pub = portal === 'public';
    c.slug = (f.portalSlug.value || '').trim().toLowerCase();
    c.pages = c.pages || {};
    $$('tr[data-page]', f).forEach(tr => {
      const id = tr.dataset.page, v = n => tr.querySelector(`[name=${n}]`), x = c.pages[id] = c.pages[id] || {};
      x.label = v('label').value.trim(); x.slug = v('slug').value.trim().toLowerCase();
      if (pub) { x.nav = v('nav').checked; x.footer = v('footer').value; x.parent = v('parent')?.value || ''; } else { x.hidden = !v('show').checked; x.group = v('group').value.trim(); }
    });
    c.links = (c.links || []).map(l => { const tr = $(`tr[data-link="${l.id}"]`, f); if (!tr) return l; const v = n => tr.querySelector(`[name=${n}]`); return { ...l, label: v('label').value.trim(), url: v('url').value.trim(), newTab: v('newTab').checked, nav: v('nav').checked, footer: v('footer').value, parent: v('parent')?.value || '' }; });
    if (pub && f.navTheme) DB.s.site.navStyle = { theme: f.navTheme.value, sticky: f.navSticky.checked, icons: f.navIcons.checked };
    c.order = [...$$('tr[data-page],tr[data-link]', f)].map(tr => tr.dataset.page || tr.dataset.link);
  },
  validate(portal) {
    const c = this.pc(portal), P = App.portals[portal], re = /^[a-z0-9][a-z0-9-]*$/;
    if (c.slug && !re.test(c.slug)) return 'ইউআরএল উপসর্গে কেবল a–z, 0–9 ও হাইফেন থাকতে পারে।';
    if (c.slug && Object.values(App.portals).some(x => x.id !== portal && (x.id === c.slug || this.cfg()[x.id]?.slug === c.slug))) return `“${c.slug}” উপসর্গটি ইতোমধ্যে অন্য একটি পোর্টালে ব্যবহৃত হচ্ছে।`;
    const seen = {};
    for (const p of P.pages) {
      const s = c.pages?.[p.id]?.slug || p.defSlug || p.id;
      if (c.pages?.[p.id]?.slug && !re.test(s)) return `“${s}” বৈধ ইউআরএল নয় (a–z, 0–9, হাইফেন)।`;
      if (seen[s]) return `দুটি পৃষ্ঠার ইউআরএল একই “${s}” হয়ে যাবে (${seen[s]} ও ${p._label})।`;
      seen[s] = p._label;
    }
    for (const p of P.pages) { const s = c.pages?.[p.id]?.slug; if (s && P.pages.some(q => q !== p && q.id === s)) return `“${s}” অন্য একটি পৃষ্ঠার অন্তর্নির্মিত ঠিকানা — ভিন্ন একটি ইউআরএল নির্বাচন করুন।`; }
    // public pages sit at the top level (/<slug>): they must not take a dashboard prefix or a reserved path
    const reserved = new Set(['print', 'api', 'css', 'js', ...Object.values(App.portals).filter(x => x.id !== 'public').flatMap(x => [x.id, this.cfg()[x.id]?.slug].filter(Boolean))]);
    if (portal === 'public') { for (const p of P.pages) { const s = c.pages?.[p.id]?.slug; if (s && reserved.has(s)) return `“${s}” ইউআরএলটি সংরক্ষিত — ভিন্ন একটি ইউআরএল নির্বাচন করুন।`; } }
    else if (c.slug && (['print', 'api', 'css', 'js'].includes(c.slug) || App.portals.public.pages.some(p => p.id === c.slug || p.slug === c.slug))) return `“${c.slug}” উপসর্গটি সংরক্ষিত — ভিন্ন একটি উপসর্গ নির্বাচন করুন।`;
    return null;
  },
  save() {
    this.collect(); const portal = App.ui.mnP || 'public', err = this.validate(portal);
    if (err) return toast(err, 'error');
    if (portal === 'public' && this.pc(portal).links.some(l => !l.label || !l.url)) return toast('প্রতিটি কাস্টম লিংকের লেবেল ও ইউআরএল আবশ্যক।', 'error');
    this.apply(); DB.audit('MENU_UPDATE', 'settings', `${portal} মেনু ও ইউআরএল`); DB.save(); toast('মেনু সংরক্ষিত হয়েছে।', 'success'); App.render();
  },
  move(id, d) {
    this.collect(); const c = this.pc(App.ui.mnP || 'public'), i = c.order.indexOf(id), j = i + d;
    if (i < 0 || j < 0 || j >= c.order.length) return;
    [c.order[i], c.order[j]] = [c.order[j], c.order[i]]; this.apply(); DB.save(); App.render();
  },
  addLink() { this.collect(); const c = this.pc('public'); c.links = c.links || []; const id = 'LNK' + Date.now().toString(36); c.links.push({ id, label: 'নতুন লিংক', url: 'https://', nav: true, footer: '', newTab: true }); c.order = [...(c.order || []), id]; DB.save(); App.refresh(); },
  delLink(id) { const c = this.pc('public'); c.links = c.links.filter(l => l.id !== id); c.order = (c.order || []).filter(x => x !== id); this.apply(); DB.save(); App.render(); },
  reset(portal) { if (!confirm('এই মেনুর অন্তর্নির্মিত লেবেল, ক্রম ও ইউআরএল পুনর্বহাল করবেন?')) return; delete this.cfg()[portal]; this.apply(); DB.audit('MENU_RESET', 'settings', portal); DB.save(); toast('মেনু ডিফল্ট অবস্থায় ফেরানো হয়েছে।', 'success'); App.render(); },
};

/* ---------------- custom content pages, banners, About, footer ---------------- */
const Pages = {
  list() { return DB.s.site.pages || (DB.s.site.pages = []); },
  /** Register custom pages as public pages (re-run after edits). */
  sync() {
    const P = App.portals.public;
    P.pages = P.pages.filter(p => !p.cms);
    this.list().forEach(cp => P.pages.push({
      id: 'cp-' + cp.id, label: cp.title, _label: cp.title, icon: 'file-text', cms: true, defSlug: cp.slug || null,
      render() { const x = Pages.list().find(y => y.id === cp.id) || cp; return Pub.wrap(Pub.hero(esc(x.title), esc(x.sub || '')) + Pub.section('', '', `<div class="md-body text-slate-700 max-w-3xl">${mdLite(x.body)}</div>`)); },
    }));
  },
  editor() {
    const site = DB.s.site, ab = this.about(), ft = this.footer(), can = Settings.canEdit(), dis = can ? '' : 'disabled';
    const banners = App.portals.public.pages.filter(p => !['home', 'track'].includes(p.id) && !p.cms), H = site.heroes || {};
    return `<div class="grid xl:grid-cols-2 gap-5">
      <div class="card"><div class="px-5 py-3 border-b border-slate-100 font-semibold flex items-center">কাস্টম পৃষ্ঠা ${can ? `<button class="btn btn-primary btn-sm ml-auto" onclick="Pages.edit()">${icon('file-plus')} নতুন পৃষ্ঠা</button>` : ''}</div>
        <div class="divide-y divide-slate-100">${this.list().map(cp => `<div class="px-5 py-3 flex items-center gap-3 text-sm">${icon('file-text', 'w-5 h-5 text-brand-600')}<div class="flex-1 min-w-0"><b>${esc(cp.title)}</b><div class="text-xs text-slate-500 font-mono truncate">${App.href('public', 'cp-' + cp.id)}</div></div><a class="btn btn-ghost btn-sm" target="_blank" href="${App.href('public', 'cp-' + cp.id)}">${icon('external-link')}</a>${can ? `<button class="btn btn-ghost btn-sm" onclick="Pages.edit('${cp.id}')">${icon('pencil')}</button><button class="btn btn-ghost btn-sm" onclick="Pages.del('${cp.id}')">${icon('trash-2')}</button>` : ''}</div>`).join('') || `<div class="p-5 text-sm text-slate-400">এখনো কোনো কাস্টম পৃষ্ঠা নেই — “নিয়মকানুন”, “পোশাক” বা “পরিচালনা পর্ষদ”-এর মতো পৃষ্ঠা যোগ করুন। মেনুতে স্থাপন করুন এখান থেকে: <b>মেনু ও ইউআরএল</b>।</div>`}</div></div>
      <form class="card p-5 space-y-3" onsubmit="Pages.saveFooter(this);return false"><div class="font-semibold">ফুটার</div>
        <div><label class="label">নামের নিচের পরিচিতি লেখা (ঐচ্ছিক — খালি রাখলে দেখাবে না; ইআইআইএন, প্রতিষ্ঠান কোড ও প্রতিষ্ঠাকাল আসে পরিচিতি ও ব্র্যান্ডিং থেকে)</label><textarea class="textarea" rows="2" name="about" ${dis}>${esc(ft.about)}</textarea></div>
        <div class="grid sm:grid-cols-2 gap-3"><div><label class="label">কলাম ১-এর শিরোনাম</label><input class="input" name="col1" value="${esc(ft.col1)}" ${dis}></div><div><label class="label">কলাম ২-এর শিরোনাম</label><input class="input" name="col2" value="${esc(ft.col2)}" ${dis}></div>
          <div><label class="label">যোগাযোগ কলামের শিরোনাম</label><input class="input" name="col3" value="${esc(ft.col3)}" ${dis}></div><div><label class="label">কপিরাইট লাইন</label><input class="input" name="copyright" value="${esc(ft.copyright)}" ${dis}></div></div>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="showDate" ${ft.showDate ? 'checked' : ''} ${dis}> আজকের তারিখ দেখান</label>
        <div class="grid sm:grid-cols-2 gap-3"><div><label class="label">ফুটারের রং</label><select class="select" name="style" ${dis}>${[['brand', 'ব্র্যান্ড রং (গাঢ়)'], ['dark', 'গাঢ় ধূসর'], ['light', 'হালকা']].map(([v, l]) => `<option value="${v}" ${ft.style === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <label class="flex items-center gap-2 text-sm pt-6"><input type="checkbox" name="showMap" ${ft.showMap ? 'checked' : ''} ${dis}> যোগাযোগ কলামে ছোট মানচিত্র দেখান</label></div>
        <div class="grid sm:grid-cols-3 gap-3">${Pages.SOCIAL.map(([k, l]) => `<div><label class="label">${l}</label><input class="input !py-1 text-sm" type="url" name="so_${k}" value="${esc(ft.social?.[k] || '')}" placeholder="https://…" ${dis}></div>`).join('')}</div>
        <div class="grid sm:grid-cols-3 gap-3"><div><label class="label">অতিরিক্ত কলামের শিরোনাম</label><input class="input" name="col4" value="${esc(ft.col4 || '')}" placeholder="যেমন: গুরুত্বপূর্ণ লিংক" ${dis}></div>
          <div class="sm:col-span-2"><label class="label">অতিরিক্ত কলামের লিংক — প্রতি লাইনে: লেবেল | লিংক</label><textarea class="textarea text-sm" rows="3" name="col4Links" placeholder="শিক্ষা মন্ত্রণালয় | https://moedu.gov.bd&#10;ঢাকা শিক্ষা বোর্ড | https://dhakaeducationboard.gov.bd" ${dis}>${esc(ft.col4Links || '')}</textarea></div></div>
        <p class="text-xs text-slate-500">প্রতিটি ফুটার কলামে কোন লিংক দেখাবে তা নির্ধারণ করা হয় এখানে: <b>মেনু ও ইউআরএল → পাবলিক ওয়েবসাইট</b>।</p>${can ? `<button class="btn btn-primary">${icon('save')} ফুটার সংরক্ষণ করুন</button>` : ''}</form>
      <form class="card p-5 space-y-3" onsubmit="Pages.saveAbout(this);return false"><div class="font-semibold">পরিচিতি পৃষ্ঠা</div>
        <div><label class="label">অংশের শিরোনাম</label><input class="input" name="title" value="${esc(ab.title)}" ${dis}></div>
        <div><label class="label">লেখা <span class="font-normal text-slate-400">— ফাঁকা লাইন = নতুন অনুচ্ছেদ · ## শিরোনাম · - বুলেট · **গাঢ়** · [লিংক](https://…)</span></label><textarea class="textarea font-mono text-sm" rows="9" name="body" ${dis}>${esc(ab.body)}</textarea></div>
        <div class="flex flex-wrap gap-4 text-sm"><label class="flex items-center gap-2"><input type="checkbox" name="facts" ${ab.facts ? 'checked' : ''} ${dis}> তথ্য বাক্স (ইআইআইএন, প্রতিষ্ঠাকাল…)</label><label class="flex items-center gap-2 ${multiCampus() ? '' : 'hidden'}"><input type="checkbox" name="campuses" ${ab.campuses ? 'checked' : ''} ${dis}> ক্যাম্পাসসমূহ</label><label class="flex items-center gap-2"><input type="checkbox" name="faculty" ${ab.faculty ? 'checked' : ''} ${dis}> ${multiCampus() ? 'ক্যাম্পাস অনুযায়ী শিক্ষক' : 'শিক্ষকমণ্ডলী'}</label></div>
        ${can ? `<button class="btn btn-primary">${icon('save')} পরিচিতি পৃষ্ঠা সংরক্ষণ করুন</button>` : ''}</form>
      <form class="card scroll-x" onsubmit="Pages.saveBanners(this);return false"><div class="px-5 py-3 border-b border-slate-100 font-semibold">পৃষ্ঠার ব্যানার <span class="text-xs font-normal text-slate-400">— প্রতিটি পৃষ্ঠার শীর্ষে শিরোনাম ও উপ-লেখা; ফাঁকা = অন্তর্নির্মিত</span></div>
        <table class="table"><thead><tr><th>পৃষ্ঠা</th><th>শিরোনাম</th><th>উপ-লেখা</th></tr></thead><tbody>${banners.map(p => `<tr><td class="font-semibold text-sm whitespace-nowrap">${esc(p.label)}</td><td><input class="input !py-1" name="t_${p.id}" value="${esc(H[p.id]?.title || '')}" ${dis}></td><td><input class="input !py-1" name="s_${p.id}" value="${esc(H[p.id]?.sub || '')}" ${dis}></td></tr>`).join('')}</tbody></table>
        ${can ? `<div class="p-4"><button class="btn btn-primary">${icon('save')} ব্যানার সংরক্ষণ করুন</button></div>` : ''}</form></div>`;
  },
  edit(id) {
    const cp = this.list().find(x => x.id === id) || { id: '', title: '', slug: '', sub: '', body: '' };
    App.openDetail({
      title: id ? `পৃষ্ঠা সম্পাদনা · ${cp.title}` : 'নতুন পৃষ্ঠা',
      render: () => `<form id="cp-form" class="card p-5 grid sm:grid-cols-2 gap-4 max-w-4xl"><div><label class="label">শিরোনাম</label><input class="input" name="title" value="${esc(cp.title)}" required></div>
        <div><label class="label">ইউআরএল</label><div class="flex items-center gap-1 font-mono text-sm"><span class="text-slate-400 whitespace-nowrap">/</span><input class="input font-mono" name="slug" value="${esc(cp.slug)}" placeholder="rules-and-regulations" pattern="[a-z0-9][a-z0-9-]*" required></div></div>
        <div class="sm:col-span-2"><label class="label">ব্যানারের উপ-লেখা</label><input class="input" name="sub" value="${esc(cp.sub)}"></div>
        <div class="sm:col-span-2"><label class="label">বিষয়বস্তু <span class="font-normal text-slate-400">— ফাঁকা লাইন = নতুন অনুচ্ছেদ · ## শিরোনাম · - বুলেট · **গাঢ়** · [লিংক](https://…)</span></label><textarea class="textarea font-mono text-sm" rows="14" name="body">${esc(cp.body)}</textarea></div>
        ${id ? '' : `<label class="sm:col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" name="nav" checked> শিরোনাম মেনুতে যোগ করুন</label>`}
        <div class="sm:col-span-2 flex gap-2"><button class="btn btn-primary">${icon('save')} পৃষ্ঠা সংরক্ষণ করুন</button><button type="button" class="btn btn-ghost" onclick="App.closeDetail()">বাতিল</button></div></form>`,
      mount: () => $('#cp-form').addEventListener('submit', e => {
        e.preventDefault(); const f = formData(e.target), slug = f.slug.trim().toLowerCase(), P = App.portals.public;
        if (['print', 'api', 'css', 'js'].includes(slug) || Object.values(App.portals).some(x => x.id !== 'public' && (x.id === slug || x.slug === slug)) || P.pages.some(p => p.id !== 'cp-' + cp.id && (p.id === slug || p.slug === slug))) return toast(`“${slug}” ইউআরএলটি ইতোমধ্যে অন্য একটি পৃষ্ঠায় ব্যবহৃত হচ্ছে।`, 'error');
        if (id) Object.assign(cp, { title: f.title, slug, sub: f.sub, body: f.body });
        else { cp.id = DB.id('CP'); Object.assign(cp, { title: f.title, slug, sub: f.sub, body: f.body }); this.list().push(cp); const m = Menus.pc('public'); m.pages['cp-' + cp.id] = { nav: !!e.target.nav?.checked, footer: 'info' }; }
        Menus.apply(); DB.audit('PAGE_SAVE', 'website', `${cp.id} ${cp.title}`); DB.save(); toast('পৃষ্ঠা সংরক্ষিত হয়েছে।', 'success'); App.closeDetail();
      }),
    });
  },
  del(id) { if (!confirm('এই পৃষ্ঠাটি মুছে ফেলবেন? এর লিংকগুলো আর কাজ করবে না।')) return; DB.s.site.pages = this.list().filter(x => x.id !== id); Menus.apply(); DB.audit('PAGE_DELETE', 'website', id); DB.save(); App.refresh(); },
  about() {
    return DB.s.site.about || { title: 'আমাদের প্রতিষ্ঠান', facts: true, campuses: true, faculty: true,
      body: `${DB.s.school.welcome}\n\nবাংলা ও ইংরেজি ভার্সনে জাতীয় শিক্ষাক্রম (এনসিটিবি) অনুসরণ করা হয়। প্রতিটি শ্রেণিকক্ষ মাল্টিমিডিয়া-সমৃদ্ধ এবং আমাদের বিজ্ঞান ও আইসিটি গবেষণাগার নির্ধারিত সময়ের পরেও শিক্ষার্থীদের জন্য উন্মুক্ত থাকে।\n\nপড়াশোনার পাশাপাশি শিক্ষার্থীরা বিতর্ক সংঘ, রোবোটিক্স ক্লাব, স্কাউটস, রেড ক্রিসেন্ট এবং এক ডজন ক্রীড়া দলে অংশগ্রহণ করে।` };
  },
  footer() { return { about: '', col1: 'অনলাইন সেবা', col2: 'তথ্য', col3: 'যোগাযোগ', copyright: `© {year} ${DB.s.school.nameBn || DB.s.school.name}`, showDate: true, ...(DB.s.site.footer || {}) }; },
  saveAbout(f) { const d = formData(f); DB.s.site.about = { title: d.title, body: d.body, facts: !!f.facts.checked, campuses: !!f.campuses.checked, faculty: !!f.faculty.checked }; Settings.save('পরিচিতি পৃষ্ঠা সংরক্ষিত হয়েছে।', 'about page'); },
  SOCIAL: [['facebook', 'ফেসবুক'], ['youtube', 'ইউটিউব'], ['instagram', 'ইনস্টাগ্রাম'], ['x', 'এক্স (টুইটার)'], ['linkedin', 'লিংকডইন'], ['whatsapp', 'হোয়াটসঅ্যাপ']],
  saveFooter(f) {
    const d = formData(f), social = {};
    this.SOCIAL.forEach(([k]) => { const v = (d['so_' + k] || '').trim(); if (v) { if (!/^https?:\/\//.test(v)) return; social[k] = v; } });
    DB.s.site.footer = { about: d.about, col1: d.col1, col2: d.col2, col3: d.col3, col4: d.col4, col4Links: d.col4Links, copyright: d.copyright, showDate: !!f.showDate.checked, showMap: !!f.showMap.checked, style: d.style, social };
    Settings.save('ফুটার সংরক্ষিত হয়েছে।', 'footer');
  },
  saveBanners(f) { const d = formData(f), H = {}; Object.keys(d).forEach(k => { const [t, id] = [k[0], k.slice(2)]; if (d[k].trim()) (H[id] = H[id] || {})[t === 't' ? 'title' : 'sub'] = d[k].trim(); }); DB.s.site.heroes = H; Settings.save('পৃষ্ঠার ব্যানার সংরক্ষিত হয়েছে।', 'page banners'); },
};

// Page banners: admin-defined heading / sub-text replace the built-in ones.
(() => {
  const h0 = Pub.hero.bind(Pub);
  Pub.hero = (title, sub) => { const o = DB.s.site.heroes?.[App.route?.page]; return h0(o?.title ? esc(o.title) : title, o?.sub ? esc(o.sub) : sub); };
})();
// Footer built from the menu configuration.
Pub.footer = function () {
  const s = DB.s.school, ft = Pages.footer(), today = new Date(), light = ft.style === 'light';
  const T = light ? 'text-slate-900' : 'text-white', M = light ? 'text-slate-600' : 'opacity-80';
  const col = (title, items) => items.length ? `<div><h3 class="${T}">${esc(title)}</h3><ul class="space-y-2">${items.map(i => `<li><a href="${esc(i.href)}" ${i.blank ? 'target="_blank" rel="noopener"' : ''}>${icon('chevron-right', 'w-4 h-4 shrink-0 opacity-70')}${esc(i.label)}</a></li>`).join('')}</ul></div>` : '';
  const extra = Home.rows(ft.col4Links).filter(([, h]) => /^(https?:|#)/.test(h || '')).map(([label, href]) => ({ label, href, blank: /^https?:/.test(href) }));
  const SI = { facebook: 'facebook', youtube: 'youtube', instagram: 'instagram', x: 'twitter', linkedin: 'linkedin', whatsapp: 'message-circle' };
  const social = Object.entries(ft.social || {}).filter(([, v]) => v);
  const linkCols = [col(ft.col1, Menus.footerItems('services')), col(ft.col2, Menus.footerItems('info')), extra.length ? col(ft.col4 || 'গুরুত্বপূর্ণ লিংক', extra) : ''].filter(Boolean);
  const line = (ic, html) => `<li class="flex items-start gap-3"><span class="pub-fico">${icon(ic, 'w-4 h-4')}</span><span class="min-w-0 pt-1 break-words [overflow-wrap:anywhere]">${html}</span></li>`;
  return `<footer class="pub-footer ${light ? 'light bg-white border-t border-slate-200 text-slate-700' : ft.style === 'dark' ? 'bg-slate-900 text-slate-300' : 'bg-brand-950 text-brand-100'} border-t-4 !border-t-[color:var(--accent)] mt-10"><div class="max-w-7xl mx-auto px-4 sm:px-6 py-14 grid grid-cols-2 lg:grid-cols-[1.5fr_repeat(${linkCols.length + (s.address || s.phone || s.email ? 1 : 0)},minmax(0,1fr))] gap-x-6 gap-y-10 lg:gap-10">
    <div class="col-span-2 lg:col-span-1"><a href="${App.href('public', 'home')}" class="flex items-center gap-3">${logoHtml(52)}<span class="min-w-0 leading-tight"><span class="block font-heading font-bold text-xl ${T}" data-noi18n>${esc(s.nameBn || s.name)}</span>${s.nameBn && s.name !== s.nameBn ? `<span class="block ${M}" data-noi18n>${esc(s.name)}</span>` : ''}</span></a>${ft.about ? `<p class="mt-4 ${M} leading-relaxed">${esc(ft.about)}</p>` : s.mottoBn || s.motto ? `<p class="mt-4 ${M}">${esc(s.mottoBn || s.motto)}</p>` : ''}
      <dl class="mt-4 space-y-1 ${M}">${s.eiin ? `<div>ইআইআইএন: ${esc(bnNum(s.eiin))}</div>` : ''}${s.instCode ? `<div>প্রতিষ্ঠান কোড: ${esc(U.bn(s.instCode))}</div>` : ''}${s.founded ? `<div>প্রতিষ্ঠাকাল: ${bnNum(s.founded)}</div>` : ''}</dl>
      ${social.length ? `<div class="flex flex-wrap gap-2 mt-5">${social.map(([k, v]) => `<a href="${esc(v)}" target="_blank" rel="noopener" aria-label="${esc((Pages.SOCIAL.find(x => x[0] === k) || [])[1] || k)}" class="w-10 h-10 rounded-full flex items-center justify-center ${light ? 'bg-slate-100 hover:bg-brand-50 text-brand-700' : 'bg-white/10 hover:bg-white/20'}">${icon(SI[k] || 'link', 'w-4 h-4')}</a>`).join('')}</div>` : ''}</div>
    ${linkCols.join('')}
    ${s.address || s.phone || s.email ? `<div class="col-span-2 ${linkCols.length % 2 ? 'sm:col-span-1' : ''} lg:col-span-1"><h3 class="${T}">${esc(ft.col3)}</h3><ul class="space-y-3">${s.address ? line('map-pin', esc(s.address)) : ''}${s.phone ? line('phone', `<a href="tel:${esc(String(s.phone).replace(/[^\d+]/g, ''))}">${esc(s.phone)}</a>`) : ''}${s.email ? line('mail', `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>`) : ''}</ul>
      ${ft.showMap && s.address ? `<iframe class="mt-4 w-full h-32 rounded-lg border-0" loading="lazy" title="মানচিত্র" src="https://maps.google.com/maps?q=${encodeURIComponent(s.address)}&output=embed"></iframe>` : ''}</div>` : ''}
  </div><div class="border-t ${light ? 'border-slate-200' : 'border-white/10'}"><div class="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center gap-x-4 gap-y-1 ${M}">
    ${ft.showDate && !U.headerDate() ? `<span class="site-footer-date">${esc(U.dateLine(today, 'header', true).join(' · '))}</span>` : ''}
    <span class="flex-1"></span><span>${esc(ft.copyright.replace('{year}', bnNum(today.getFullYear())))}</span><!--credit--></div></div></footer>`;
};
// About page from the configuration.
App.portals.public.pages.find(p => p.id === 'about').render = function () {
  const s = DB.s.school, ab = Pages.about(), depts = [...new Set(DB.s.teachers.map(t => t.dept))];
  return Pub.wrap(Pub.hero('আমাদের পরিচিতি', `${esc(s.nameBn || s.name)} ${bnNum(s.founded)} সাল থেকে এর জনগোষ্ঠীকে সেবা দিয়ে আসছে।`)
    + Pub.section(esc(ab.title), 'ইতিহাস ও লক্ষ্য', `<div class="grid ${ab.facts ? 'md:grid-cols-3' : ''} gap-6"><div class="${ab.facts ? 'md:col-span-2' : ''} md-body text-slate-700">${mdLite(ab.body)}</div>
      ${ab.facts ? `<div class="card p-5 space-y-3 text-sm self-start">${s.eiin ? `<div><span class="text-slate-500">ইআইআইএন</span><div class="font-bold">${esc(bnNum(s.eiin))}</div></div>` : ''}${s.founded ? `<div><span class="text-slate-500">প্রতিষ্ঠাকাল</span><div class="font-bold">${bnNum(s.founded)}</div></div>` : ''}<div><span class="text-slate-500">বিভাগসমূহ</span><div class="font-bold">${esc(depts.join(', '))}</div></div><div><span class="text-slate-500">অধ্যক্ষ</span><div class="font-bold">${esc(s.principalName)}</div></div></div>` : ''}</div>`)
    + (ab.campuses && multiCampus() ? Pub.section('আমাদের ক্যাম্পাস', `${bnNum(DB.s.campuses.length)}টি ক্যাম্পাস`, `<div class="grid md:grid-cols-2 gap-4">${DB.s.campuses.map(c => `<div class="card p-5"><div class="flex items-center gap-2 font-bold text-lg">${icon('school', 'w-5 h-5 text-brand-600')} ${esc(c.name)}</div><div class="text-sm text-slate-600 mt-2">${esc(c.levels || '')}</div><div class="text-sm text-slate-500 mt-1">${esc(c.address || '')}${c.phone ? ' · ' + esc(c.phone) : ''}</div></div>`).join('')}</div>`) : '')
    + (ab.faculty ? DB.s.campuses.map(cp => Pub.section(multiCampus() ? `শিক্ষকমণ্ডলী — ${esc(cp.name)}` : 'শিক্ষকমণ্ডলী', 'আমাদের শিক্ষকবৃন্দ', `<div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">${DB.teachersIn(cp.id).map(t => { const u = DB.user(t.userId); return `<div class="card p-4 flex items-center gap-3">${avatar(u, 44)}<div><div class="font-semibold text-sm">${esc(pn(u))}</div><div class="text-xs text-slate-500">${esc(t.designation)}</div></div></div>`; }).join('')}</div>`)).join('') : ''));
};

/* ---------------- Homepage builder ---------------- */
const Home = {
  TYPES: { hero: ['হিরো ব্যানার', 'image'], quick: ['দ্রুত লিংক', 'layout-grid'], welcome: ['প্রধানের বাণী ও নোটিশ বোর্ড', 'quote'], programs: ['একাডেমিক কার্যক্রম', 'book-open'], gallery: ['ফটো গ্যালারি', 'images'], noticeGrid: ['সর্বশেষ নোটিশ (কার্ড)', 'megaphone'], campuses: ['আমাদের ক্যাম্পাস', 'school'], stats: ['পরিসংখ্যান ব্যান্ড', 'bar-chart-3'], cta: ['কার্যাহ্বান', 'mouse-pointer-click'], custom: ['লেখা ব্লক', 'text'], banner: ['ছবির ব্যানার / স্লাইডার', 'gallery-horizontal'], video: ['ভিডিও', 'youtube'], features: ['বৈশিষ্ট্য কার্ড', 'sparkles'], testimonials: ['মতামত', 'message-square-quote'], faq: ['প্রশ্নোত্তর', 'circle-help'], teachers: ['শিক্ষক পরিচিতি', 'users'], map: ['মানচিত্র ও যোগাযোগ', 'map-pin'], glance: ['একনজরে প্রতিষ্ঠান', 'gauge'], leaders: ['পরিচালক ও প্রধানের বাণী', 'messages-square'], calendar: ['ক্যালেন্ডার', 'calendar-days'], achievements: ['অর্জন', 'trophy'] },
  defaults() {
    return {
      sections: this.defaultSections(),
      quick: [['অনলাইনে ভর্তি', 'file-pen-line', 'admissions'], ['অনুসন্ধান ও যাচাই', 'search-check', 'verify'], ['ফলাফল', 'award', 'results'], ['নোটিশ', 'megaphone', 'notices'], ['অনলাইন সেবা', 'concierge-bell', 'services'], ['একাডেমিক ক্যালেন্ডার', 'calendar-days', 'calendar']].map(([label, ic, link]) => ({ label, icon: ic, link })),
    };
  },
  /** Every section hides itself while it has no real content (no messages, no notices, no achievements …). */
  defaultSections() {
    return [{ id: 'H1', type: 'hero', show: true }, { id: 'H2', type: 'quick', show: true },
      { id: 'H8', type: 'glance', show: true, title: 'একনজরে প্রতিষ্ঠান', kicker: 'আমাদের পরিসর', bg: 'white' },
      { id: 'H9', type: 'leaders', show: true, title: 'পরিচালক ও প্রধানের বাণী', kicker: 'নেতৃত্বের কথা' },
      { id: 'H3', type: 'noticeGrid', show: true, title: 'সর্বশেষ নোটিশ', kicker: 'নোটিশ বোর্ড', count: 6 },
      { id: 'H10', type: 'calendar', show: true, title: 'ইভেন্ট ও ছুটি', kicker: 'একাডেমিক ক্যালেন্ডার', month: true, count: 6, bg: 'white' },
      { id: 'H4', type: 'programs', show: true, title: 'একাডেমিক কার্যক্রম', kicker: 'আমরা যা পড়াই' },
      { id: 'H11', type: 'achievements', show: true, title: 'আমাদের অর্জন', kicker: 'স্বীকৃতি ও সাফল্য', count: 6, students: false, bg: 'soft' },
      { id: 'H12', type: 'teachers', show: true, title: 'শিক্ষকমণ্ডলী', kicker: 'আমাদের শিক্ষকবৃন্দ', count: 8 },
      { id: 'H5', type: 'gallery', show: true, title: 'ফটো গ্যালারি', kicker: 'ক্যাম্পাস জীবন', count: 9, bg: 'white' },
      // no sample quotes: a real school's site must not show made-up people. Hidden until the school adds real ones.
      { id: 'H6', type: 'testimonials', show: true, title: 'অভিভাবক ও শিক্ষার্থীদের কথা', kicker: 'মতামত', bg: 'soft', items: '' },
      { id: 'H7', type: 'cta', show: true, title: 'ভর্তি চলছে', body: 'ঘরে বসেই পাঁচটি সহজ ধাপে অনলাইনে আবেদন করুন। কোনো প্রশ্ন থাকলে আমাদের সঙ্গে যোগাযোগ করুন।', btnText: 'অনলাইনে আবেদন করুন', btnLink: 'admissions' }];
  },
  /** The previous built-in layout (7 sections) — a homepage still exactly like it gets the larger default. */
  PREV: '[{"id":"H1","type":"hero","show":true},{"id":"H2","type":"quick","show":true},{"id":"H3","type":"welcome","show":true,"title":"প্রতিষ্ঠান প্রধানের বাণী","notices":true,"noticeTitle":"নোটিশ বোর্ড","upcoming":true,"upcomingTitle":"আসন্ন অনুষ্ঠান"},{"id":"H4","type":"programs","show":true,"title":"একাডেমিক কার্যক্রম","kicker":"আমরা যা পড়াই","bg":"white"},{"id":"H5","type":"gallery","show":true,"title":"ফটো গ্যালারি","kicker":"ক্যাম্পাস জীবন","count":6},{"id":"H6","type":"testimonials","show":true,"title":"অভিভাবক ও শিক্ষার্থীদের কথা","kicker":"মতামত","bg":"soft","items":""},{"id":"H7","type":"cta","show":true,"title":"ভর্তি চলছে","body":"ঘরে বসেই পাঁচটি সহজ ধাপে অনলাইনে আবেদন করুন। কোনো প্রশ্ন থাকলে আমাদের সঙ্গে যোগাযোগ করুন।","btnText":"অনলাইনে আবেদন করুন","btnLink":"admissions"}]',
  /** The first built-in layout — a saved homepage still in exactly this state is upgraded to the current default. */
  LEGACY: '[{"id":"H1","type":"hero","show":true},{"id":"H2","type":"quick","show":true},{"id":"H3","type":"welcome","show":true,"title":"প্রতিষ্ঠান প্রধানের বাণী","notices":true,"noticeTitle":"নোটিশ বোর্ড","upcoming":true,"upcomingTitle":"আসন্ন"},{"id":"H4","type":"programs","show":true,"title":"একাডেমিক কার্যক্রম","kicker":"আমরা যা প্রদান করি","bg":"white"},{"id":"H5","type":"gallery","show":true,"title":"ফটো গ্যালারি","kicker":"ক্যাম্পাস জীবন","count":6}]',
  cfg() {
    const site = DB.s.site;
    const legacy = site.home && [this.LEGACY, this.PREV].includes(JSON.stringify(site.home.sections));
    if (!site.home || legacy) {
      if (legacy) site.home.sections = this.defaultSections(); else site.home = this.defaults();
      if (site.hero?.ctaText === 'ভর্তির আবেদন করুন') site.hero.ctaText = 'অনলাইনে আবেদন করুন';
    }
    return site.home;
  },
  /** Section look: background (page / white / soft / brand / dark / accent / image), spacing and alignment. */
  wrapBg(x, html) {
    if (!html) return '';
    const cls = { white: 'bg-white border-y border-slate-200', soft: 'bg-brand-50', brand: 'sec-dark hero-bg text-white', dark: 'sec-dark bg-slate-900 text-white', accent: 'sec-accent', image: 'sec-dark text-white' }[x.bg] || '';
    const style = x.bg === 'image' && x.bgImage ? `background:linear-gradient(rgba(0,0,0,.55),rgba(0,0,0,.55)),url('${x.bgImage}') center/cover` : '';
    const pad = x.pad === 'compact' ? 'sec-compact' : x.pad === 'spacious' ? 'sec-spacious' : '', al = x.align === 'center' ? 'sec-center' : '';
    return cls || style || pad || al ? `<div class="${cls} ${pad} ${al}" style="${style}">${html}</div>` : html;
  },
  /** Notices for the homepage: the website-visible ones, pinned first, newest first (a notice without a date sorts last). */
  notices() {
    const list = typeof PublicNotices !== 'undefined' ? PublicNotices.visible() : (DB.s.notices || []);
    return [...list].sort((a, b) => (!!b.pinned - !!a.pinned) || String(b.date || '').localeCompare(String(a.date || '')));
  },
  /** Lines "a | b | c" from a textarea field. */
  rows(t) { return String(t || '').split('\n').map(l => l.split('|').map(x => x.trim())).filter(r => r[0]); },
  ytId(u) { const m = String(u || '').match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/); return m ? m[1] : null; },
  /** A person's photo (uploaded in Institution Settings) or their initials. */
  face(photo, name, size) { return photo ? `<img src="${photo}" alt="${esc(name || '')}" class="rounded-full object-cover shrink-0 pub-face" style="width:${size}px;height:${size}px">` : avatar({ name: name || '?' }, size); },
  /** Compact month view for the homepage calendar section (prev / next month; a day opens its details). */
  miniMonth() {
    const mk = App.ui.hcM || U.monthKey(new Date()), [y, m] = mk.split('-').map(Number), first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate(), today = U.today();
    const cal = DB.s.calendar || { holidays: [], weekends: [5] }, on = U.altOn('home');
    const nav = d => U.monthKey(U.addMonths(`${mk}-01`, d));
    let cells = ''; for (let i = 0; i < first.getDay(); i++) cells += '<div></div>';
    for (let d = 1; d <= days; d++) {
      const dt = new Date(y, m - 1, d), k = U.iso(dt), evs = (cal.holidays || []).filter(h => k >= h.date && k <= (h.to || h.date));
      const opened = evs.some(h => h.type === 'Open'), closed = !opened && evs.some(h => h.type === 'Public' || h.type === 'School'), wk = (cal.weekends || []).includes(dt.getDay()) && !opened;
      const alt = on.order.map(c => c === 'bangla' ? U.bnParts(dt) : U.hijriParts(dt)).filter(Boolean).map(p => U.bn(p.d)).join(' · ');
      cells += `<button type="button" class="pub-mday ${closed ? 'is-hol' : wk ? 'is-wk' : ''} ${k === today ? 'is-today' : ''}" onclick="Cal.day('${k}')" aria-label="${esc(U.fmtDate(k))}${evs.length ? ' — ' + esc(evs.map(h => h.name).join(', ')) : ''}"><span class="pub-mday-n">${bnNum(d)}</span>${alt ? `<span class="pub-mday-a">${alt}</span>` : ''}${evs.some(h => !['Public', 'School'].includes(h.type)) ? '<span class="pub-mday-dot"></span>' : ''}</button>`;
    }
    const altM = typeof Cal !== 'undefined' && Cal.altMonths ? Cal.altMonths(y, m, 'home') : '';
    return `<div class="card pub-card p-4 sm:p-6"><div class="flex items-center gap-2 mb-4"><button type="button" class="btn btn-ghost btn-sm" aria-label="আগের মাস" onclick="App.ui.hcM='${nav(-1)}';App.refresh()">${icon('chevron-left')}</button><div class="flex-1 text-center min-w-0"><div class="font-heading text-xl font-bold text-slate-900">${U.monthName(mk)}</div>${altM ? `<div class="text-slate-500">${esc(altM)}</div>` : ''}</div><button type="button" class="btn btn-ghost btn-sm" aria-label="পরের মাস" onclick="App.ui.hcM='${nav(1)}';App.refresh()">${icon('chevron-right')}</button></div>
      <div class="grid grid-cols-7 gap-1 text-center font-bold text-slate-500 mb-1">${U.DAYS_SHORT.map((x, i) => `<div class="${(cal.weekends || []).includes(i) ? 'text-rose-500' : ''}">${x}</div>`).join('')}</div><div class="grid grid-cols-7 gap-1">${cells}</div>
      <div class="flex flex-wrap gap-x-4 gap-y-1 mt-4 text-slate-600"><span class="inline-flex items-center gap-1.5"><span class="pub-ev-dot pub-ev-hol"></span>ছুটি</span><span class="inline-flex items-center gap-1.5"><span class="pub-ev-dot pub-ev-evt"></span>অনুষ্ঠান / পরীক্ষা</span><span class="inline-flex items-center gap-1.5"><span class="pub-ev-dot pub-ev-wk"></span>সাপ্তাহিক ছুটি</span></div></div>`;
  },
  /** Section types added for a richer homepage. */
  extra(x) {
    const S = (body, cls = '') => Pub.section(esc(x.title || ''), esc(x.kicker || ''), body, cls);
    switch (x.type) {
      case 'banner': {
        const imgs = x.images || [], slides = this.rows(x.slides); const n = Math.max(imgs.length, slides.length); if (!n) return '';
        const sid = 'bn' + x.id;
        return `<div class="relative"><div id="${sid}" class="flex overflow-x-auto snap-x snap-mandatory scroll-smooth" style="scrollbar-width:none">${Array.from({ length: n }, (_, i) => { const [t, sub, btn, link] = slides[i] || []; const img = imgs[i % (imgs.length || 1)]; return `<div class="snap-start shrink-0 w-full relative min-h-[16rem] sm:min-h-[22rem] flex items-end ${img ? '' : 'hero-bg'}" style="${img ? `background:linear-gradient(0deg,rgba(0,0,0,.6),rgba(0,0,0,.05) 60%),url('${img}') center/cover` : ''}"><div class="max-w-7xl mx-auto w-full px-6 py-8 text-white">${t ? `<div class="font-heading text-2xl sm:text-4xl font-bold">${esc(t)}</div>` : ''}${sub ? `<p class="mt-2 text-white/90 max-w-2xl">${esc(sub)}</p>` : ''}${btn ? `<a href="${esc(siteLink(link))}" class="btn btn-accent mt-4">${esc(btn)} ${icon('arrow-right')}</a>` : ''}</div></div>`; }).join('')}</div>
          ${n > 1 ? `<button class="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 hover:bg-white flex items-center justify-center" aria-label="আগের ছবি" onclick="const e=document.getElementById('${sid}');e.scrollBy({left:-e.clientWidth})">${icon('chevron-left')}</button><button class="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 hover:bg-white flex items-center justify-center" aria-label="পরের ছবি" onclick="const e=document.getElementById('${sid}');e.scrollLeft+e.clientWidth>=e.scrollWidth-4?e.scrollTo({left:0}):e.scrollBy({left:e.clientWidth})">${icon('chevron-right')}</button>` : ''}</div>`;
      }
      case 'video': { const id = this.ytId(x.url); if (!id) return ''; return S(`<div class="grid ${x.body ? 'lg:grid-cols-5' : ''} gap-6 items-center"><div class="${x.body ? 'lg:col-span-3' : 'max-w-4xl mx-auto w-full'}"><div class="aspect-video rounded-xl overflow-hidden shadow-lg bg-black"><iframe class="w-full h-full" src="https://www.youtube-nocookie.com/embed/${id}" title="${esc(x.title || 'ভিডিও')}" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen></iframe></div></div>${x.body ? `<div class="lg:col-span-2 md-body text-slate-700">${mdLite(x.body)}</div>` : ''}</div>`); }
      case 'features': { const r = this.rows(x.items); return r.length ? S(`<div class="grid sm:grid-cols-2 lg:grid-cols-${Math.min(4, r.length)} gap-4">${r.map(([ic, t, d]) => `<div class="card pub-card pub-lift p-6"><span class="pub-icon">${icon(ic || 'sparkles', 'w-6 h-6')}</span><h3 class="font-heading text-lg font-bold text-slate-900 mt-4">${esc(t || '')}</h3>${d ? `<p class="text-slate-600 mt-2 leading-relaxed">${esc(d)}</p>` : ''}</div>`).join('')}</div>`) : ''; }
      case 'testimonials': { const r = this.rows(x.items); return r.length ? S(`<div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">${r.map(([n, who, q]) => `<figure class="card pub-card p-6 flex flex-col">${icon('quote', 'w-8 h-8 text-accent')}<blockquote class="mt-3 text-slate-700 leading-relaxed flex-1">${esc(q || '')}</blockquote><figcaption class="mt-5 pt-4 border-t border-slate-100 flex items-center gap-3">${avatar({ name: n }, 44)}<div class="min-w-0"><div class="font-bold text-slate-900">${esc(n)}</div>${who ? `<div class="text-slate-500">${esc(who)}</div>` : ''}</div></figcaption></figure>`).join('')}</div>`) : ''; }
      case 'faq': { const r = this.rows(x.items); return r.length ? S(`<div class="max-w-3xl space-y-2 ${x.align === 'center' ? 'mx-auto text-left' : ''}">${r.map(([q, a]) => `<details class="card px-5 py-3 group"><summary class="font-semibold cursor-pointer list-none flex items-center gap-2">${icon('circle-help', 'w-4 h-4 text-brand-600 shrink-0')}<span class="flex-1">${esc(q)}</span>${icon('chevron-down', 'w-4 h-4 text-slate-400 group-open:rotate-180 transition')}</summary><p class="mt-2 text-sm text-slate-600 leading-relaxed">${esc(a || '')}</p></details>`).join('')}</div>`) : ''; }
      case 'teachers': {
        // heads first, then by joining date; each card links to the teacher's public page
        const T = DB.s.teachers.filter(t => t.status !== 'Resigned' && DB.user(t.userId)).sort((a, b) => (!!b.isHead - !!a.isHead) || String(a.joinDate || '').localeCompare(String(b.joinDate || ''))).slice(0, +x.count || 8); if (!T.length) return '';
        const href = t => typeof TeacherPage !== 'undefined' ? TeacherPage.href(t.id) : App.href('public', 'faculty');
        return S(`<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">${T.map(t => { const u = DB.user(t.userId), subj = (t.subjects || []).map(s => DB.subject(s)?.name).filter(Boolean).slice(0, 3).join(', '); return `<a href="${href(t)}" class="card pub-card pub-lift pub-teacher">${u.photo ? `<img src="${u.photo}" alt="${esc(pn(u))}" loading="lazy" class="pub-teacher-img">` : `<span class="pub-teacher-img pub-teacher-ph">${avatar(u, 88)}</span>`}<div class="p-4 text-center"><div class="font-heading font-bold text-slate-900 leading-snug">${esc(pn(u))}</div>${t.designation ? `<div class="text-brand-700 font-semibold mt-1">${esc(bn(t.designation))}</div>` : ''}${subj ? `<div class="text-slate-500 mt-1 line-clamp-2">${esc(subj)}</div>` : ''}</div></a>`; }).join('')}</div><div class="mt-8"><a href="${App.href('public', 'faculty')}" class="btn btn-ghost">সকল শিক্ষক ${icon('arrow-right')}</a></div>`);
      }
      case 'glance': {
        const st = (DB.remote && DB.remote.stats) || {};
        const items = [['প্রতিষ্ঠার', st.years, 'বছর', 'landmark'], ['শিক্ষার্থী', st.students, 'জন', 'graduation-cap'], ['শিক্ষক', st.teachers, 'জন', 'presentation'], ['কর্মকর্তা-কর্মচারী', st.staff, 'জন', 'contact'], ['শ্রেণি', st.classes, 'টি', 'school'], ['শাখা', st.sections > st.classes ? st.sections : 0, 'টি', 'layers'], ['ক্যাম্পাস', st.campuses > 1 ? st.campuses : 0, 'টি', 'building-2'], ['বিষয়', st.subjects, 'টি', 'book-open'], ['গ্রন্থাগারের বই', st.books, 'টি', 'library']].filter(r => +r[1] > 0).slice(0, 8);
        if (!items.length) return '';
        return S(`<div class="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-5">${items.map(([l, v, u, i]) => `<div class="card pub-card pub-glance"><span class="pub-icon">${icon(i, 'w-6 h-6')}</span><div class="min-w-0"><div class="pub-glance-v">${bnNum(+v, true)}<span class="pub-glance-u">${u}</span></div><div class="pub-glance-l">${l}</div></div></div>`).join('')}</div>`);
      }
      case 'leaders': {
        const s = DB.s.school, inst = s.nameBn || s.name;
        const head = { name: s.principalName, role: /মাদ্রাসা|madrasah/i.test(instTypes(s).join(' ')) ? 'অধ্যক্ষ / সুপার' : 'প্রতিষ্ঠান প্রধান', photo: s.principalPhoto, msg: s.welcome, sig: s.signature };
        const dir = { name: s.directorName, role: s.directorTitle || 'পরিচালক', photo: s.directorPhoto, msg: s.directorMessage, sig: s.directorSignature };
        const L = (x.order === 'principal' ? [head, dir] : [dir, head]).filter(p => p.msg && String(p.msg).trim());
        if (!L.length) return '';
        const card = p => `<article class="card pub-card pub-leader flex flex-col"><div class="pub-leader-top">${this.face(p.photo, p.name || p.role, 112)}<div class="min-w-0">${p.name ? `<div class="font-heading text-xl font-bold text-slate-900 leading-snug">${esc(p.name)}</div>` : ''}<div class="text-brand-700 font-semibold">${esc(p.role)}</div><div class="text-slate-500">${esc(inst)}</div></div></div>
          <blockquote class="pub-quote mx-6 sm:mx-8 mb-6 flex-1">${esc(p.msg)}</blockquote>${p.sig ? `<div class="px-6 sm:px-8 pb-6"><img src="${p.sig}" alt="স্বাক্ষর" class="h-12 w-auto opacity-80"></div>` : ''}</article>`;
        return S(`<div class="grid ${L.length > 1 ? 'lg:grid-cols-2' : 'max-w-4xl'} gap-6">${L.map(card).join('')}</div>`);
      }
      case 'calendar': {
        if (DB.s.featureFlags.calendar === false) return '';
        const cal = DB.s.calendar || { holidays: [], weekends: [5] }, today = U.today();
        const up = (cal.holidays || []).filter(h => (h.to || h.date) >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, +x.count || 6);
        if (!up.length && x.month === false) return '';
        const tone = { Public: 'pub-ev-hol', School: 'pub-ev-hol', Exam: 'pub-ev-exam', Event: 'pub-ev-evt', Open: 'pub-ev-open' };
        const lab = h => typeof Cal !== 'undefined' ? (Cal.LABEL[h.type] || bn(h.type)).replace(/ \(.*\)$/, '').replace(/ —.*$/, '') : bn(h.type);
        const list = `<div class="card pub-card flex flex-col ${x.month === false ? 'lg:col-span-12' : 'lg:col-span-5'}"><div class="pub-cardhead border-b border-slate-100">${icon('calendar-clock', 'w-5 h-5 shrink-0')}<h3 class="font-heading text-xl font-bold flex-1">আসন্ন ছুটি ও অনুষ্ঠান</h3></div><div class="divide-y divide-slate-100 flex-1">${up.map(h => { const alt = U.altDates(h.date, 'home'); return `<button type="button" class="pub-row w-full text-left hover:bg-slate-50" onclick="Cal.day('${h.date}')"><div class="pub-date"><b>${bnNum(U.d(h.date).getDate())}</b>${U.MONTHS[U.d(h.date).getMonth()]}</div><div class="min-w-0 flex-1"><div class="font-semibold text-slate-800 leading-snug">${esc(h.name)}</div><div class="text-slate-500 mt-0.5"><span class="pub-ev-dot ${tone[h.type] || 'pub-ev-evt'}"></span>${esc(lab(h))}${h.to && h.to !== h.date ? ` · ${U.fmtDate(h.to)} পর্যন্ত` : ''}</div>${alt.length ? `<div class="text-slate-500">${esc(alt.join(' · '))}</div>` : ''}</div></button>`; }).join('') || '<div class="p-5 text-slate-500">আপাতত কিছু নির্ধারিত নেই।</div>'}</div><a href="${App.href('public', 'calendar')}" class="block px-5 py-3 border-t border-slate-100 text-brand-700 font-semibold hover:underline">পুরো ক্যালেন্ডার দেখুন</a></div>`;
        return S(`<div class="grid lg:grid-cols-12 gap-6">${x.month === false ? '' : `<div class="lg:col-span-7">${this.miniMonth()}</div>`}${list}</div>`);
      }
      case 'achievements': {
        if (typeof PubContent === 'undefined') return '';
        const n = +x.count || 6, I = PubContent.inst(), St = x.students ? PubContent.students() : [];
        const sN = Math.min(St.length, Math.max(n - I.length, Math.min(3, St.length))), list = [...I.slice(0, n - sN), ...St.slice(0, sN)];
        if (!list.length) return '';
        return S(`${PubContent.grid(list)}<div class="mt-8"><a href="${App.href('public', 'achievements')}" class="btn btn-ghost">সকল অর্জন ${icon('arrow-right')}</a></div>`);
      }
      case 'map': { const s = DB.s.school, q = x.query || s.address; if (!q && !x.embed) return ''; return S(`<div class="grid lg:grid-cols-3 gap-5"><div class="lg:col-span-2 rounded-xl overflow-hidden border border-slate-200 min-h-[18rem]"><iframe class="w-full h-full min-h-[18rem]" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="মানচিত্র" src="${x.embed && /^https:\/\/(www\.)?google\.[^/]+\/maps\/embed/.test(x.embed) ? esc(x.embed) : `https://maps.google.com/maps?q=${encodeURIComponent(q)}&output=embed`}"></iframe></div>
          <div class="card p-5 space-y-3 text-sm self-start"><div class="font-semibold">${esc(s.nameBn || s.name)}</div><div class="flex gap-2">${icon('map-pin', 'w-4 h-4 text-brand-600 shrink-0 mt-0.5')}${esc(s.address)}</div><div class="flex gap-2">${icon('phone', 'w-4 h-4 text-brand-600')}${esc(s.phone)}</div><div class="flex gap-2">${icon('mail', 'w-4 h-4 text-brand-600')}${esc(s.email)}</div>${x.body ? `<div class="md-body text-slate-600">${mdLite(x.body)}</div>` : ''}<a class="btn btn-primary btn-sm" target="_blank" rel="noopener" href="https://maps.google.com/?q=${encodeURIComponent(q)}">${icon('navigation')} দিকনির্দেশনা</a></div></div>`); }
    }
    return '';
  },
  async addImages(id, files) { const x = this.sec(id); x.images = x.images || []; for (const f of files) { try { x.images.push(await readUpload(f, 1600)); } catch (e) { toast(e.message, 'error'); } } if (!DB.save()) { x.images.splice(-files.length); return toast('সংরক্ষণস্থান পূর্ণ — ছোট বা কম ছবি দিন।', 'error'); } App.refresh(); },
  delImage(id, i) { this.sec(id).images.splice(i, 1); DB.save(); App.refresh(); },
  async bgImage(id, file) { if (!file) return; try { this.sec(id).bgImage = await readUpload(file, 1800); this.sec(id).bg = 'image'; if (!DB.save()) throw new Error('সংরক্ষণস্থান পূর্ণ।'); App.refresh(); } catch (e) { toast(e.message, 'error'); } },
  section(x) {
    const s = DB.s.school;
    switch (x.type) {
      case 'hero': return Site.hero();
      case 'quick': { const q = this.cfg().quick || []; return q.length ? `<section class="pub-quicksec max-w-7xl mx-auto px-4 sm:px-6 py-10"><div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-${Math.min(6, q.length)} gap-3 sm:gap-4">${q.map(l => `<a href="${esc(siteLink(l.link))}" class="card pub-card pub-quick">${`<span class="pub-icon">${icon(l.icon || 'link', 'w-6 h-6')}</span>`}<span>${esc(l.label)}</span></a>`).join('')}</div></section>` : ''; }
      case 'welcome': {
        const withMsg = !!s.welcome && x.message !== false;
        const notices = Home.notices().slice(0, withMsg ? 4 : 6);
        const upcoming = DB.s.calendar.holidays.filter(h => (h.to || h.date) >= U.today()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, withMsg ? 4 : 6);
        if (!withMsg && !(x.notices && notices.length) && !(x.upcoming && upcoming.length)) return '';
        if (!withMsg) {   // no principal's message here (none yet, or shown in the leaders section): the notice and event boxes share the row
          const nOn = x.notices && notices.length, uOn = x.upcoming && upcoming.length;
          const sb = (t, ic, more, body, foot = '') => `<div class="card pub-card flex flex-col ${nOn && uOn ? 'lg:col-span-6' : 'lg:col-span-12'}"><div class="pub-cardhead border-b border-slate-100">${icon(ic, 'w-5 h-5 shrink-0')}<h3 class="font-heading text-xl font-bold flex-1">${esc(t)}</h3>${more || ''}</div><div class="divide-y divide-slate-100 flex-1">${body}</div>${foot}</div>`;
          const dbx = d => d ? `<div class="pub-date"><b>${bnNum(U.d(d).getDate())}</b>${U.MONTHS[U.d(d).getMonth()]}</div>` : '<div class="pub-date"></div>';
          const nb = nOn ? sb(x.noticeTitle || 'নোটিশ বোর্ড', 'megaphone', `<a href="${App.href('public', 'notices')}" class="text-brand-700 font-semibold hover:underline whitespace-nowrap">সব দেখুন</a>`, notices.map(n => `<a href="${App.href('public', 'notices')}" class="pub-row">${dbx(n.date)}<div class="min-w-0"><div class="font-semibold text-slate-800 leading-snug">${n.pinned ? icon('pin', 'w-4 h-4 inline text-accent -mt-1 mr-1') : ''}${esc(n.title)}</div><div class="text-slate-500 mt-0.5">${esc(bn(n.category))}${n.body ? ` · <span class="line-clamp-1 inline">${esc(String(n.body).slice(0, 90))}</span>` : ''}</div></div></a>`).join('')) : '';
          const ub = uOn ? sb(x.upcomingTitle || 'আসন্ন অনুষ্ঠান', 'calendar-days', '', upcoming.map(h => `<div class="pub-row">${dbx(h.date)}<div class="min-w-0"><div class="font-semibold text-slate-800 leading-snug">${esc(h.name)}</div><div class="text-slate-500 mt-0.5">${esc(typeof Cal !== 'undefined' ? (Cal.LABEL[h.type] || bn(h.type)).replace(/ \(.*\)$/, '') : bn(h.type))}${h.to && h.to !== h.date ? ` · ${U.fmtDate(h.to)} পর্যন্ত` : ''}</div>${U.altDates(h.date, 'home').length ? `<div class="text-slate-500">${esc(U.altDates(h.date, 'home').join(' · '))}</div>` : ''}</div></div>`).join(''), DB.s.featureFlags.calendar !== false ? `<a href="${App.href('public', 'calendar')}" class="block px-5 py-3 border-t border-slate-100 text-brand-700 font-semibold hover:underline">পুরো ক্যালেন্ডার দেখুন</a>` : '') : '';
          return Pub.section(esc(x.title || ''), esc(x.kicker || ''), `<div class="grid lg:grid-cols-12 gap-6">${nb}${ub}</div>`);
        }
        const both = x.notices && x.upcoming, side = x.notices || x.upcoming;
        const head = (t, ic, more) => `<div class="pub-cardhead border-b border-slate-100">${icon(ic, 'w-5 h-5 shrink-0')}<h2 class="font-heading text-xl font-bold flex-1">${esc(t)}</h2>${more || ''}</div>`;
        const allN = `<a href="${App.href('public', 'notices')}" class="text-brand-700 font-semibold hover:underline whitespace-nowrap">সব দেখুন</a>`;
        const dateBox = d => d ? `<div class="pub-date"><b>${bnNum(U.d(d).getDate())}</b>${U.MONTHS[U.d(d).getMonth()]}</div>` : '<div class="pub-date"></div>';
        const msg = `<article class="card pub-card flex flex-col ${!side ? 'md:col-span-2 lg:col-span-12' : both ? 'md:col-span-2 lg:col-span-5' : 'lg:col-span-6'}">${head(x.title || 'প্রতিষ্ঠান প্রধানের বাণী', 'quote')}
          <div class="p-6 flex-1 flex flex-col gap-6"><blockquote class="pub-quote">${esc(s.welcome)}</blockquote>${s.principalName ? `<div class="flex items-center gap-3">${this.face(s.principalPhoto, s.principalName, 56)}<div class="min-w-0"><div class="font-bold text-slate-900">${esc(s.principalName)}</div><div class="text-slate-500">অধ্যক্ষ, ${esc(s.nameBn || s.name)}</div></div></div>` : ''}${App.portals.public.pages.some(p => p.id === 'about') ? `<a href="${App.href('public', 'about')}" class="mt-auto inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline self-start">আমাদের সম্পর্কে আরও জানুন ${icon('arrow-right', 'w-4 h-4')}</a>` : ''}</div></article>`;
        const nbox = x.notices ? `<div class="card pub-card flex flex-col ${both ? 'lg:col-span-4' : 'lg:col-span-6'}">${head(x.noticeTitle || 'নোটিশ বোর্ড', 'megaphone', allN)}<div class="divide-y divide-slate-100 flex-1">${notices.map(n => `<a href="${App.href('public', 'notices')}" class="pub-row">${dateBox(n.date)}<div class="min-w-0"><div class="font-semibold text-slate-800 leading-snug">${n.pinned ? icon('pin', 'w-4 h-4 inline text-accent -mt-1 mr-1') : ''}${esc(n.title)}</div><div class="text-slate-500 mt-0.5">${esc(bn(n.category))}</div></div></a>`).join('') || '<div class="p-5 text-slate-500">এখনো কোনো নোটিশ নেই।</div>'}</div></div>` : '';
        const ubox = x.upcoming ? `<div class="card pub-card flex flex-col ${both ? 'lg:col-span-3' : 'lg:col-span-6'}">${head(x.upcomingTitle || 'আসন্ন অনুষ্ঠান', 'calendar-days')}<div class="divide-y divide-slate-100 flex-1">${upcoming.map(h => `<div class="pub-row">${dateBox(h.date)}<div class="min-w-0"><div class="font-semibold text-slate-800 leading-snug">${esc(h.name)}</div><div class="text-slate-500 mt-0.5">${esc(bn(h.type))}${h.to ? ` · ${U.fmtDate(h.to)} পর্যন্ত` : ''}</div></div></div>`).join('') || '<div class="p-5 text-slate-500">আপাতত কোনো অনুষ্ঠান নেই।</div>'}</div>${DB.s.featureFlags.calendar !== false ? `<a href="${App.href('public', 'calendar')}" class="block px-5 py-3 border-t border-slate-100 text-brand-700 font-semibold hover:underline">পুরো ক্যালেন্ডার দেখুন</a>` : ''}</div>` : '';
        return `<section class="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-20"><div class="grid md:grid-cols-2 lg:grid-cols-12 gap-6">${msg}${nbox}${ubox}</div></section>`;
      }
      case 'programs': { const P = DB.s.site.programs; return P.length ? this.wrapBg(x, Pub.section(esc(x.title || ''), esc(x.kicker || ''), `<div class="grid sm:grid-cols-2 lg:grid-cols-3 ${P.length >= 5 ? 'xl:grid-cols-5' : P.length === 4 ? 'xl:grid-cols-4' : ''} gap-5">${P.map(p => `<a href="${App.href('public', 'programs')}" class="card pub-card pub-prog"><span class="pub-icon">${icon(p.icon || 'book-open', 'w-6 h-6')}</span><h3 class="font-heading text-lg font-bold text-slate-900 mt-4 leading-snug">${esc(p.name)}</h3>${p.ages ? `<span class="pub-tag mt-2">${esc(p.ages)}</span>` : ''}<p class="text-slate-600 mt-3 line-clamp-3 flex-1">${esc(p.desc)}</p><span class="mt-4 inline-flex items-center gap-1 font-semibold text-brand-700">বিস্তারিত ${icon('arrow-right', 'w-4 h-4')}</span></a>`).join('')}</div>`)) : ''; }
      case 'gallery': { const gal = Site.gallery(); if (DB.s.featureFlags.gallery === false || !gal.length) return ''; return this.wrapBg(x, Pub.section(esc(x.title || ''), esc(x.kicker || ''), `<div class="pub-mosaic">${gal.slice(0, +x.count || 9).map((g, i) => `<button class="pub-gal ${i === 0 ? 'pub-gal-big' : ''}" onclick="Site.lightbox('${g.id}')" aria-label="${esc(g.title)}"><img src="${galleryImg(g)}" alt="${esc(g.title)}" loading="lazy"><span class="cap ${i ? 'hidden sm:block' : ''}">${esc(g.title)}${i === 0 && g.album ? `<span class="block font-normal opacity-85">${esc(g.album)}</span>` : ''}</span></button>`).join('')}</div><div class="mt-8"><a href="${App.href('public', 'gallery')}" class="btn btn-ghost">পুরো গ্যালারি দেখুন ${icon('arrow-right')}</a></div>`)); }
      case 'noticeGrid': {
        const n = Home.notices().slice(0, +x.count || 4); if (!n.length) return '';
        // the newest (or pinned) notice large on the left, the rest as cards
        const f = n[0], dl = f.date ? U.dateLine(f.date, 'notices') : [];
        const feat = `<a href="${App.href('public', 'notices')}" class="card pub-card pub-lift pub-feat ${n.length > 1 ? 'lg:col-span-2 lg:row-span-2' : 'lg:col-span-3'} p-6 sm:p-8 flex flex-col gap-4"><div class="flex flex-wrap items-center gap-2">${badge(bn(f.category), 'blue')}${f.pinned ? badge('পিন করা', 'red') : ''}<span class="text-slate-500 ml-auto">${esc(dl.join(' · ') || U.fmtDate(f.date))}</span></div><h3 class="font-heading text-2xl sm:text-3xl font-bold text-slate-900 leading-snug">${esc(f.title)}</h3><p class="text-slate-600 text-lg leading-relaxed line-clamp-6">${esc(f.body || '')}</p><span class="mt-auto inline-flex items-center gap-1 font-semibold text-brand-700">বিস্তারিত ${icon('arrow-right', 'w-4 h-4')}</span></a>`;
        return this.wrapBg(x, Pub.section(esc(x.title || ''), esc(x.kicker || ''), `<div class="grid md:grid-cols-2 lg:grid-cols-3 gap-5">${feat}${n.slice(1).map(Pub.noticeCard).join('')}</div><div class="mt-8"><a href="${App.href('public', 'notices')}" class="btn btn-ghost">সকল নোটিশ ${icon('arrow-right')}</a></div>`)); }
      case 'campuses': if (DB.s.campuses.length < 2) return ''; return this.wrapBg(x, Pub.section(esc(x.title || ''), esc(x.kicker || ''), `<div class="grid md:grid-cols-2 gap-5">${DB.s.campuses.map(c => `<div class="card pub-card p-6 flex gap-4"><span class="pub-icon">${icon('school', 'w-6 h-6')}</span><div class="min-w-0"><div class="font-heading font-bold text-lg text-slate-900">${esc(c.name)}</div><div class="text-slate-600 mt-1">${esc(c.levels || '')}</div>${c.address ? `<div class="text-slate-500 mt-1 flex gap-1.5">${icon('map-pin', 'w-4 h-4 mt-1 shrink-0')}${esc(c.address)}</div>` : ''}</div></div>`).join('')}</div>`));
      case 'stats': if (!Site.stats().length) return ''; return `<div class="pub-statband"><div class="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-14">${x.title ? `<h2 class="font-heading text-2xl sm:text-3xl font-bold mb-8">${esc(x.title)}</h2>` : ''}<div class="grid grid-cols-2 md:grid-cols-4 gap-y-8">${Site.stats().map(([l, v, i]) => `<div class="pub-bandstat px-4 sm:px-6">${icon(i, 'w-6 h-6 text-white/70')}<div class="text-3xl sm:text-4xl font-extrabold mt-2">${v}</div><div class="text-white/80 font-semibold mt-1">${l}</div></div>`).join('')}</div></div></div>`;
      case 'cta': if (/admissions/.test(x.btnLink || '') && (DB.s.featureFlags.onlineAdmissions === false || !DB.s.classes.length)) return ''; return `<section class="pub-ctasec max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-20"><div class="pub-cta text-white p-8 sm:p-12 flex flex-col md:flex-row md:items-center gap-6"><div class="flex-1"><h2 class="font-heading text-2xl sm:text-4xl font-bold leading-snug">${esc(x.title || '')}</h2>${x.body ? `<p class="text-white/85 text-lg mt-3 max-w-2xl">${esc(x.body)}</p>` : ''}</div>${x.btnText ? `<a href="${esc(siteLink(x.btnLink))}" class="btn btn-accent shadow-lg !px-6 !py-3 text-lg">${esc(x.btnText)} ${icon('arrow-right')}</a>` : ''}</div></section>`;
      case 'custom': return this.wrapBg(x, Pub.section(esc(x.title || ''), esc(x.kicker || ''), `<div class="md-body text-slate-700 max-w-3xl">${mdLite(x.body)}</div>${x.btnText ? `<a href="${esc(siteLink(x.btnLink))}" class="btn btn-primary mt-4">${esc(x.btnText)}</a>` : ''}`));
    }
    return this.extra(x);
  },
  /** Each section with its chosen look (the existing sections already wrap themselves once). */
  render() { return this.cfg().sections.filter(x => x.show !== false).map(x => { try { const h = this.section(x); return ['hero', 'programs', 'gallery', 'noticeGrid', 'campuses', 'custom'].includes(x.type) || !x.bg && !x.pad && !x.align ? h : this.wrapBg(x, h); } catch (e) { console.error(e); return ''; } }).join(''); },

  /* ----- editor (Settings → Homepage) ----- */
  editor() {
    const c = this.cfg(), can = Settings.canEdit(), dis = can ? '' : 'disabled', open = App.ui.hsEdit;
    const fields = x => {
      const inp = (k, l, extra = '') => `<div><label class="label">${l}</label><input class="input" name="${k}" value="${esc(x[k] ?? '')}" ${extra} ${dis}></div>`;
      const sel = (k, l, opts) => `<div><label class="label">${l}</label><select class="select" name="${k}" ${dis}>${opts.map(([v, t]) => `<option value="${v}" ${(x[k] || '') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`;
      const bg = `<div class="sm:col-span-2 grid sm:grid-cols-3 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200"><div class="sm:col-span-3 text-xs font-bold text-slate-500">অংশের নকশা</div>
        ${sel('bg', 'পটভূমি', [['', 'পৃষ্ঠার রং'], ['white', 'সাদা'], ['soft', 'হালকা ব্র্যান্ড রং'], ['brand', 'ব্র্যান্ড রং (গাঢ়)'], ['dark', 'গাঢ়'], ['accent', 'অ্যাকসেন্ট রং (হালকা)'], ['image', 'নিজস্ব ছবি']])}
        ${sel('pad', 'ফাঁকা জায়গা', [['', 'সাধারণ'], ['compact', 'কম'], ['spacious', 'বেশি']])}${sel('align', 'লেখার অবস্থান', [['', 'বাঁয়ে'], ['center', 'মাঝখানে']])}
        <div class="sm:col-span-3 flex items-center gap-3 text-sm">${x.bgImage ? `<img src="${x.bgImage}" class="h-10 w-16 object-cover rounded">` : ''}<label class="btn btn-ghost btn-sm cursor-pointer">${icon('image-plus')} পটভূমির ছবি<input type="file" accept="image/*" class="hidden" ${dis} onchange="Home.bgImage('${x.id}',this.files[0])"></label>${x.bgImage ? `<button type="button" class="btn btn-ghost btn-sm" onclick="Home.sec('${x.id}').bgImage=null;Home.sec('${x.id}').bg='';DB.save();App.refresh()">${icon('trash-2')}</button>` : ''}</div></div>`;
      const lines = (k, l, ph, rows = 5) => `<div class="sm:col-span-2"><label class="label">${l}</label><textarea class="textarea text-sm" rows="${rows}" name="${k}" placeholder="${esc(ph)}" ${dis}>${esc(x[k] || '')}</textarea></div>`;
      const body = rows => `<div class="sm:col-span-2"><label class="label">লেখা <span class="font-normal text-slate-400">— ফাঁকা লাইন = অনুচ্ছেদ · ## শিরোনাম · - বুলেট · **গাঢ়** · [লিংক](https://…)</span></label><textarea class="textarea font-mono text-sm" rows="${rows}" name="body" ${dis}>${esc(x.body || '')}</textarea></div>`;
      switch (x.type) {
        case 'hero': return `<p class="sm:col-span-2 text-sm text-slate-600">শিরোনাম, বোতাম, পটভূমির ছবি ও পরিসংখ্যান এডিট করা হয় এখানে: <button type="button" class="text-brand-700 font-semibold underline" onclick="App.ui.setTab='website';App.refresh()">ওয়েবসাইট ও হিরো</button>।</p>`;
        case 'quick': return `<p class="sm:col-span-2 text-sm text-slate-600">লিংকগুলো এডিট করুন <b>দ্রুত লিংক</b> কার্ডে।</p>`;
        case 'glance': return `${inp('title', 'শিরোনাম')}${inp('kicker', 'শিরোনামের ওপরের ছোট লেবেল')}${bg}`;
        case 'leaders': return `${inp('title', 'শিরোনাম')}${inp('kicker', 'শিরোনামের ওপরের ছোট লেবেল')}${sel('order', 'আগে কার বাণী', [['', 'পরিচালক / সভাপতি'], ['principal', 'প্রতিষ্ঠান প্রধান']])}<p class="self-end text-slate-500">বাণী ও ছবি: <button type="button" class="text-brand-700 font-semibold underline" onclick="App.ui.setTab='identity';App.refresh()">মৌলিক তথ্য</button></p>${bg}`;
        case 'calendar': return `${inp('title', 'শিরোনাম')}${inp('kicker', 'শিরোনামের ওপরের ছোট লেবেল')}${inp('count', 'আসন্ন কতটি দেখাবে', 'type="number" min="2" max="12"')}<label class="flex items-center gap-2 text-sm pt-6"><input type="checkbox" name="month" ${x.month !== false ? 'checked' : ''} ${dis}> মাসের ছক দেখান</label>${bg}`;
        case 'achievements': return `${inp('title', 'শিরোনাম')}${inp('kicker', 'শিরোনামের ওপরের ছোট লেবেল')}${inp('count', 'কতগুলো দেখাবে', 'type="number" min="1" max="12"')}<label class="flex items-center gap-2 text-sm pt-6"><input type="checkbox" name="students" ${x.students ? 'checked' : ''} ${dis}> শিক্ষার্থীদের অর্জনও (সম্মতিসহ)</label><p class="sm:col-span-2 text-slate-500">অর্জনের তালিকা: <a class="text-brand-700 font-semibold underline" href="${App.href(App.route.portal, 'set-achievements')}">প্রতিষ্ঠানের অর্জন ও স্বীকৃতি</a></p>${bg}`;
        case 'welcome': return `${inp('title', 'শিরোনাম')}<label class="flex items-center gap-2 text-sm pt-6"><input type="checkbox" name="message" ${x.message !== false ? 'checked' : ''} ${dis}> প্রধানের বাণী দেখান</label><label class="flex items-center gap-2 text-sm"><input type="checkbox" name="notices" ${x.notices ? 'checked' : ''} ${dis}> নোটিশ বোর্ড দেখান</label>${inp('noticeTitle', 'নোটিশ বোর্ডের শিরোনাম')}<label class="flex items-center gap-2 text-sm"><input type="checkbox" name="upcoming" ${x.upcoming ? 'checked' : ''} ${dis}> আসন্ন অনুষ্ঠান দেখান</label>${inp('upcomingTitle', 'আসন্ন অংশের শিরোনাম')}<p class="sm:col-span-2 text-xs text-slate-500">বাণীটি হলো পরিচিতি ও ব্র্যান্ডিং-এ দেওয়া প্রধানের স্বাগত বাণী।</p>${bg}`;
        case 'gallery': case 'noticeGrid': return `${inp('title', 'শিরোনাম')}${inp('kicker', 'শিরোনামের ওপরের ছোট লেবেল')}${inp('count', 'কতগুলো আইটেম', 'type="number" min="1" max="12"')}${bg}`;
        case 'stats': return `${inp('title', 'শিরোনাম (ঐচ্ছিক)')}<p class="text-xs text-slate-500 self-end">সংখ্যাগুলো আসে ওয়েবসাইট ও হিরো → পরিসংখ্যান থেকে।</p>${bg}`;
        case 'cta': return `${inp('title', 'শিরোনাম')}${inp('body', 'উপ-লেখা')}${inp('btnText', 'বোতামের লেখা')}${inp('btnLink', 'বোতামের লিংক (পৃষ্ঠা আইডি বা ইউআরএল)')}${bg}`;
        case 'custom': return `${inp('title', 'শিরোনাম')}${inp('kicker', 'শিরোনামের ওপরের ছোট লেবেল')}${body(8)}${inp('btnText', 'বোতামের লেখা (ঐচ্ছিক)')}${inp('btnLink', 'বোতামের লিংক (পৃষ্ঠা আইডি বা ইউআরএল)')}${bg}`;
        case 'banner': return `<div class="sm:col-span-2"><label class="label">ছবি (একাধিক দিলে স্লাইডার হবে)</label><div class="flex flex-wrap gap-2 items-center">${(x.images || []).map((im, i) => `<div class="relative"><img src="${im}" class="h-16 w-28 object-cover rounded"><button type="button" class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white text-xs" onclick="Home.delImage('${x.id}',${i})" aria-label="ছবি সরান">×</button></div>`).join('')}<label class="btn btn-ghost btn-sm cursor-pointer">${icon('image-plus')} ছবি যোগ করুন<input type="file" accept="image/*" multiple class="hidden" ${dis} onchange="Home.addImages('${x.id}',this.files)"></label></div></div>
          ${lines('slides', 'প্রতি লাইনে একটি স্লাইডের লেখা: শিরোনাম | উপ-লেখা | বোতামের লেখা | বোতামের লিংক', 'ভর্তি চলছে ২০২৭ | অনলাইনে আবেদন করুন | আবেদন করুন | admissions', 4)}${sel('pad', 'উচ্চতা', [['', 'সাধারণ'], ['compact', 'কম'], ['spacious', 'বেশি']])}`;
        case 'video': return `${inp('title', 'শিরোনাম')}${inp('kicker', 'শিরোনামের ওপরের ছোট লেবেল')}<div class="sm:col-span-2"><label class="label">ইউটিউব লিংক</label><input class="input" name="url" value="${esc(x.url || '')}" placeholder="https://www.youtube.com/watch?v=…" ${dis}></div>${body(4)}${bg}`;
        case 'features': return `${inp('title', 'শিরোনাম')}${inp('kicker', 'শিরোনামের ওপরের ছোট লেবেল')}${lines('items', 'প্রতি লাইনে: আইকন | শিরোনাম | বিবরণ', 'monitor | মাল্টিমিডিয়া শ্রেণিকক্ষ | প্রতিটি কক্ষে প্রজেক্টর ও ইন্টারনেট', 6)}${bg}`;
        case 'testimonials': return `${inp('title', 'শিরোনাম')}${inp('kicker', 'শিরোনামের ওপরের ছোট লেবেল')}${lines('items', 'প্রতি লাইনে: নাম | পরিচয় | মতামত', 'রহিমা খাতুন | অভিভাবক, সপ্তম শ্রেণি | শিক্ষকরা অত্যন্ত যত্নশীল।', 6)}${bg}`;
        case 'faq': return `${inp('title', 'শিরোনাম')}${inp('kicker', 'শিরোনামের ওপরের ছোট লেবেল')}${lines('items', 'প্রতি লাইনে: প্রশ্ন | উত্তর', 'ভর্তি পরীক্ষা কবে? | ভর্তি বিজ্ঞপ্তিতে তারিখ দেওয়া থাকে।', 6)}${bg}`;
        case 'teachers': return `${inp('title', 'শিরোনাম')}${inp('kicker', 'শিরোনামের ওপরের ছোট লেবেল')}${inp('count', 'কতজন দেখাবে', 'type="number" min="2" max="24"')}${bg}`;
        case 'map': return `${inp('title', 'শিরোনাম')}${inp('kicker', 'শিরোনামের ওপরের ছোট লেবেল')}${inp('query', 'মানচিত্রে খোঁজার ঠিকানা (খালি = প্রতিষ্ঠানের ঠিকানা)')}${inp('embed', 'গুগল ম্যাপ এমবেড লিংক (ঐচ্ছিক)')}${body(3)}${bg}`;
        default: return `${inp('title', 'শিরোনাম')}${inp('kicker', 'শিরোনামের ওপরের ছোট লেবেল')}${bg}`;
      }
    };
    const row = (x, i) => `<div class="px-4 py-3 ${open === x.id ? 'bg-brand-50/40' : ''}"><div class="flex items-center gap-3">
        <div class="flex flex-col"><button class="btn btn-ghost btn-sm !px-1 !py-0" ${i && can ? '' : 'disabled'} onclick="Home.move('${x.id}',-1)">${icon('chevron-up', 'w-3.5 h-3.5')}</button><button class="btn btn-ghost btn-sm !px-1 !py-0" ${i < c.sections.length - 1 && can ? '' : 'disabled'} onclick="Home.move('${x.id}',1)">${icon('chevron-down', 'w-3.5 h-3.5')}</button></div>
        ${icon(this.TYPES[x.type]?.[1] || 'square', 'w-5 h-5 text-brand-600')}<div class="flex-1 min-w-0"><div class="font-semibold text-sm">${esc(x.title || this.TYPES[x.type]?.[0] || x.type)}</div><div class="text-xs text-slate-500">${esc(this.TYPES[x.type]?.[0] || x.type)}</div></div>
        <label class="flex items-center gap-1.5 text-xs font-semibold"><input type="checkbox" ${x.show !== false ? 'checked' : ''} ${dis} onchange="Home.toggle('${x.id}',this.checked)"> দৃশ্যমান</label>
        <button class="btn btn-ghost btn-sm" onclick="App.ui.hsEdit=App.ui.hsEdit==='${x.id}'?null:'${x.id}';App.refresh()">${icon(open === x.id ? 'chevron-up' : 'pencil')}</button>${can ? `<button class="btn btn-ghost btn-sm" onclick="Home.del('${x.id}')">${icon('trash-2')}</button>` : ''}</div>
        ${open === x.id ? `<form class="grid sm:grid-cols-2 gap-3 mt-3 ml-9" onsubmit="Home.saveSection('${x.id}',this);return false">${fields(x)}${can && !['hero', 'quick'].includes(x.type) ? `<div class="sm:col-span-2"><button class="btn btn-primary btn-sm">${icon('save')} অংশ সংরক্ষণ করুন</button></div>` : ''}</form>` : ''}</div>`;
    return `<div class="grid xl:grid-cols-3 gap-5"><div class="xl:col-span-2 space-y-4"><div class="card"><div class="px-5 py-3 border-b border-slate-100 font-semibold flex items-center gap-2">হোমপেজের অংশসমূহ <span class="text-xs font-normal text-slate-400">ওপর থেকে নিচে</span><a class="btn btn-ghost btn-sm ml-auto" href="${App.href('public', 'home')}" target="_blank">${icon('external-link')} হোমপেজ দেখুন</a></div><div class="divide-y divide-slate-100">${c.sections.map(row).join('') || emptyState('কোনো অংশ নেই — নিচে একটি যোগ করুন।')}</div></div>
        ${can ? `<div class="card p-4"><div class="label mb-2">একটি অংশ যোগ করুন</div><div class="flex flex-wrap gap-2">${Object.entries(this.TYPES).map(([k, [l, ic]]) => `<button class="pill" onclick="Home.add('${k}')">${icon(ic, 'w-4 h-4')} ${l}</button>`).join('')}</div>${can ? `<button class="btn btn-ghost btn-sm mt-3" onclick="if(confirm('হোমপেজের ডিফল্ট বিন্যাস পুনর্বহাল করবেন?')){DB.s.site.home=null;Home.cfg();Settings.save('হোমপেজের বিন্যাস পুনর্বহাল করা হয়েছে।','homepage reset')}">${icon('rotate-ccw')} ডিফল্ট বিন্যাস পুনর্বহাল করুন</button>` : ''}</div>` : ''}</div>
      <form class="card self-start" onsubmit="Home.saveQuick(this);return false"><div class="px-5 py-3 border-b border-slate-100 font-semibold">দ্রুত লিংক</div><div class="p-4 space-y-2">${(c.quick || []).map((q, i) => `<div class="grid grid-cols-[1fr_6rem_auto] gap-2" data-q><input class="input !py-1" name="label" value="${esc(q.label)}" placeholder="লেবেল" ${dis}><input class="input !py-1 text-xs" name="icon" value="${esc(q.icon)}" placeholder="আইকন" ${dis}><button type="button" class="btn btn-ghost btn-sm" onclick="this.closest('[data-q]').remove()" ${dis}>${icon('x')}</button><input class="input !py-1 font-mono text-xs col-span-3" name="link" value="${esc(q.link)}" placeholder="পৃষ্ঠা আইডি (যেমন results) অথবা ইউআরএল" ${dis}></div>`).join('')}
        ${can ? `<div class="flex gap-2 pt-1"><button type="button" class="btn btn-ghost btn-sm" onclick="Home.addQuick()">${icon('plus')} লিংক</button><button class="btn btn-primary btn-sm ml-auto">${icon('save')} লিংক সংরক্ষণ করুন</button></div>` : ''}<p class="text-xs text-slate-400">আইকনগুলো <a class="underline" href="https://lucide.dev/icons" target="_blank" rel="noopener">Lucide</a> নাম।</p></div></form></div>`;
  },
  sec(id) { return this.cfg().sections.find(x => x.id === id); },
  move(id, d) { const S = this.cfg().sections, i = S.findIndex(x => x.id === id), j = i + d; if (j < 0 || j >= S.length) return; [S[i], S[j]] = [S[j], S[i]]; DB.save(); App.refresh(); },
  toggle(id, on) { this.sec(id).show = on; DB.audit('HOMEPAGE', 'website', `${id} ${on ? 'shown' : 'hidden'}`); DB.save(); App.refresh(); },
  del(id) { if (!confirm('এই অংশটি হোমপেজ থেকে অপসারণ করবেন?')) return; const c = this.cfg(); c.sections = c.sections.filter(x => x.id !== id); DB.save(); App.refresh(); },
  add(type) {
    const id = 'H' + Date.now().toString(36), [label] = this.TYPES[type];
    const base = { id, type, show: true, title: type === 'custom' ? 'নতুন অংশ' : type === 'cta' ? 'ভর্তি চলছে' : label, kicker: '' };
    if (type === 'custom') base.body = 'এখানে আপনার লেখা লিখুন।\n\n- প্রথম বিষয়\n- দ্বিতীয় বিষয়';
    if (type === 'cta') Object.assign(base, { body: 'পাঁচটি সংক্ষিপ্ত ধাপে অনলাইনে আবেদন করুন।', btnText: 'এখনই আবেদন করুন', btnLink: 'admissions' });
    if (type === 'welcome') Object.assign(base, { notices: true, upcoming: true, noticeTitle: 'নোটিশ বোর্ড', upcomingTitle: 'আসন্ন' });
    if (type === 'gallery' || type === 'noticeGrid') base.count = type === 'gallery' ? 9 : 4;
    if (type === 'calendar') Object.assign(base, { month: true, count: 6 });
    if (type === 'achievements') Object.assign(base, { count: 6, students: false });
    if (type === 'teachers') base.count = 8;
    this.cfg().sections.push(base); App.ui.hsEdit = id; DB.save(); App.refresh();
  },
  saveSection(id, f) {
    const x = this.sec(id), d = formData(f);
    Object.keys(d).forEach(k => { x[k] = k === 'count' ? +d[k] || 0 : d[k]; });
    ['notices', 'upcoming', 'message', 'month', 'students'].forEach(k => { if (f[k] && f[k].type === 'checkbox') x[k] = !!f[k].checked; });
    App.ui.hsEdit = null; Settings.save('অংশ সংরক্ষিত হয়েছে।', `homepage section ${id}`);
  },
  addQuick() { const f = $('#page-host form[onsubmit^="Home.saveQuick"]'); this.collectQuick(f); this.cfg().quick.push({ label: 'নতুন লিংক', icon: 'link', link: 'home' }); DB.save(); App.refresh(); },
  collectQuick(f) { this.cfg().quick = $$('[data-q]', f).map(r => ({ label: r.querySelector('[name=label]').value.trim(), icon: r.querySelector('[name=icon]').value.trim() || 'link', link: r.querySelector('[name=link]').value.trim() })).filter(q => q.label); },
  saveQuick(f) { this.collectQuick(f); Settings.save('দ্রুত লিংক সংরক্ষিত হয়েছে।', 'homepage quick links'); },
};
App.portals.public.pages.find(p => p.id === 'home').render = () => Pub.wrap(Home.render());

/* ---------------- Features & settings (switch + parameters per feature) ---------------- */
const FeatureCfg = {
  cfg() { return DB.s.config || (DB.s.config = {}); },
  /** Parameters persisted in DB.s.config are pushed into the modules that use them. */
  apply() {
    const c = this.cfg();
    if (c.library && typeof Logistics !== 'undefined') Object.assign(Logistics, c.library);
    if (c.serviceFees) Object.assign(SERVICE_FEES, c.serviceFees);
  },
  PARAMS: {
    'পাবলিক ওয়েবসাইট': [
      { k: 'svcFees', label: 'সেবা ডেস্ক ফি (৳)', type: 'fees' },
    ],
    'পরিশোধ': [
      { k: 'mBkash', label: 'বিকাশ মার্চেন্ট নম্বর', get: () => DB.s.school.merchant?.bKash, set: v => (DB.s.school.merchant.bKash = v) },
      { k: 'mNagad', label: 'নগদ মার্চেন্ট নম্বর', get: () => DB.s.school.merchant?.Nagad, set: v => (DB.s.school.merchant.Nagad = v) },
      { k: 'mRocket', label: 'রকেট মার্চেন্ট নম্বর', get: () => DB.s.school.merchant?.Rocket, set: v => (DB.s.school.merchant.Rocket = v) },
      { k: 'lateFine', label: 'মেয়াদোত্তীর্ণ প্রতি বিলে বিলম্ব জরিমানা (৳)', type: 'number', get: () => typeof Fees !== 'undefined' ? Fees.head('FH-LATE')?.amount : '', set: v => { const h = typeof Fees !== 'undefined' && Fees.head('FH-LATE'); if (h) h.amount = +v; } },
    ],
    'একাডেমিক': [
      { k: 'passGpa', label: 'পাসের ন্যূনতম জিপিএ (ঝুঁকি নিরূপণ)', type: 'number', step: '0.1', get: () => DB.s.school.passGpa, set: v => (DB.s.school.passGpa = +v) },
      { k: 'secCap', label: 'শাখার ডিফল্ট ধারণক্ষমতা', type: 'number', get: () => DB.s.school.sectionCapacity, set: v => (DB.s.school.sectionCapacity = +v) },
    ],
    'উপস্থিতি': [
      { k: 'lateMinutes', label: 'বিলম্ব গণ্য হবে শিফট শুরুর কত মিনিট পরে', type: 'number', get: () => (typeof Attendance !== 'undefined' ? Attendance.lateMinutes() : DB.s.school.lateMinutes ?? 10), set: v => { DB.s.school.lateMinutes = Math.max(0, Math.round(+v || 0)); } },
      { k: 'staffShift', label: 'কর্মীদের দায়িত্ব শুরুর ডিফল্ট', type: 'select', get: () => DB.s.school.staffShift || (DB.s.school.staffStart ? '' : (DB.s.school.shifts || [])[0]?.id || ''),
        get options() { return [...(DB.s.school.shifts || []).map(s => [s.id, `${bn(s.name)} শিফট (${U.bn(s.start || '')})`]), ['', 'নিচের নির্দিষ্ট সময়']]; }, set: v => (DB.s.school.staffShift = v || '') },
      { k: 'staffStart', label: 'কর্মীদের দায়িত্ব শুরুর সময় (শিফট না থাকলে)', type: 'time', get: () => DB.s.school.staffStart || '', set: v => (DB.s.school.staffStart = v || '') },
      { k: 'lateNote', type: 'note', get label() { return typeof Attendance !== 'undefined' ? Attendance.shiftSummary() : ''; } },
      { k: 'minAtt', label: 'ন্যূনতম উপস্থিতি %', type: 'number', get: () => DB.s.school.minAttendance, set: v => (DB.s.school.minAttendance = +v) },
      { k: 'lateThr', label: 'নিয়মিত বিলম্বের সীমা (বার)', type: 'number', get: () => DB.s.school.lateThreshold, set: v => (DB.s.school.lateThreshold = +v) },
    ],
    'ক্যাম্পাস সেবা': [
      { k: 'libFine', label: 'গ্রন্থাগারে প্রতি বিলম্ব দিনের জরিমানা (৳)', type: 'number', get: () => Logistics.FINE_PER_DAY, set: v => { FeatureCfg.lib().FINE_PER_DAY = +v; } },
      { k: 'libDays', label: 'গ্রন্থাগারের ধার মেয়াদ (দিন)', type: 'number', get: () => Logistics.LOAN_DAYS, set: v => { FeatureCfg.lib().LOAN_DAYS = +v; } },
      { k: 'libMax', label: 'শিক্ষার্থীপ্রতি সর্বোচ্চ বই', type: 'number', get: () => Logistics.MAX_LOANS, set: v => { FeatureCfg.lib().MAX_LOANS = +v; } },
    ],
  },
  lib() { const c = this.cfg(); return c.library || (c.library = {}); },
  editor() {
    const f = DB.s.featureFlags, can = App.has('ADMIN'), dis = can ? '' : 'disabled';
    const groups = [...new Set([...Object.keys(FLAG_GROUPS), ...Object.keys(this.PARAMS)])];
    const param = p => p.type === 'fees' ? `<div class="sm:col-span-2"><div class="label">${p.label}</div><div class="grid grid-cols-2 gap-2">${SERVICE_TYPES.map(t => `<label class="text-xs text-slate-600">${esc(bn(t))}<input class="input !py-1" type="number" min="0" name="fee_${t}" value="${SERVICE_FEES[t] || 0}" ${dis}></label>`).join('')}</div></div>`
      : p.type === 'note' ? `<p class="sm:col-span-2 text-xs text-slate-500 leading-relaxed">${esc(p.label)}</p>`
      : p.type === 'html' ? `<div class="sm:col-span-2">${p.render(dis)}</div>`
      : p.type === 'select' ? `<div><label class="label">${p.label}</label><select class="select" name="${p.k}" ${dis}>${p.options.map(([v, l]) => `<option value="${v}" ${v === p.get() ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`
      : `<div class="${p.type === 'url' ? 'sm:col-span-2' : ''}"><label class="label">${p.label}</label><input class="input" type="${p.type || 'text'}" ${p.step ? `step="${p.step}"` : ''} name="${p.k}" value="${esc(p.get() ?? '')}" ${dis}></div>`;
    // sidebar of groups (left) + the chosen group's switches and settings (right); pills on small screens
    const cur = groups.includes(App.ui.fcG) ? App.ui.fcG : groups[0];
    const GI = { 'পাবলিক ওয়েবসাইট': 'globe', 'পরিশোধ': 'wallet', 'বার্তা প্রেরণ': 'message-square', 'একাডেমিক': 'graduation-cap', 'ক্যাম্পাস সেবা': 'bus', 'সিস্টেম': 'server', 'উপস্থিতি': 'calendar-check', 'লগইন ও পাসওয়ার্ড': 'key-round' };
    const gIcon = g => GI[g] || (/পরিচয়/.test(g) ? 'scan-search' : /শিক্ষক/.test(g) ? 'user-check' : /বাড়ির কাজ|হোমওয়ার্ক/.test(g) ? 'notebook-pen' : /গেটওয়ে|পেমেন্ট/.test(g) ? 'credit-card' : 'settings-2');
    const count = g => FLAG_GROUPS[g] ? Object.keys(FLAG_GROUPS[g]).filter(k => f[k] !== false).length + '/' + Object.keys(FLAG_GROUPS[g]).length : '';
    const g = cur;
    const panel = `<div class="card"><div class="px-5 py-4 border-b border-slate-100 flex items-center gap-2">${icon(gIcon(g), 'w-5 h-5 text-brand-600')}<div class="font-semibold text-lg">${esc(g)}</div></div>
        ${FLAG_GROUPS[g] ? `<div class="divide-y divide-slate-100">${Object.entries(FLAG_GROUPS[g]).map(([k, l]) => `<label class="px-5 py-3 flex items-center justify-between gap-3 ${can ? 'cursor-pointer' : 'opacity-60'}"><span>${l}</span><input type="checkbox" class="w-5 h-5 accent-[var(--brand)] shrink-0" ${f[k] !== false ? 'checked' : ''} ${dis} onchange="Settings.flag('${k}',this.checked)"></label>`).join('')}</div>` : ''}
        ${this.PARAMS[g] ? `<form class="p-5 grid sm:grid-cols-2 gap-4 ${FLAG_GROUPS[g] ? 'border-t border-slate-100 bg-slate-50/50' : ''}" onsubmit="FeatureCfg.save('${g}',this);return false"><div class="sm:col-span-2 font-semibold text-slate-600">সেটিংস</div>${this.PARAMS[g].map(param).join('')}${can ? `<div class="sm:col-span-2"><button class="btn btn-primary">${icon('save')} সংরক্ষণ করুন</button></div>` : ''}</form>` : ''}</div>`;
    return `${can ? '' : `<div class="card p-3 mb-4 bg-amber-50 border-amber-200 text-amber-800">কেবল রুট ব্যবহারকারী বৈশিষ্ট্য ও সেগুলোর সেটিংস পরিবর্তন করতে পারেন।</div>`}
      <div class="lg:hidden mb-4">${pills(groups.map(x => [x, x, gIcon(x)]), cur, id => `App.ui.fcG='${id.replace(/'/g, "\\'")}';App.refresh()`)}</div>
      <div class="grid lg:grid-cols-[17rem_1fr] gap-5 items-start"><nav class="hidden lg:block card p-2 sticky top-24" aria-label="বৈশিষ্ট্যের গ্রুপ">${groups.map(x => `<button class="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-2.5 ${x === cur ? 'bg-brand-50 text-brand-700 font-semibold' : 'hover:bg-slate-50'}" onclick="App.ui.fcG='${x.replace(/'/g, "\\'")}';App.refresh()">${icon(gIcon(x), 'w-4 h-4 shrink-0')}<span class="flex-1">${esc(x)}</span>${count(x) ? `<span class="text-slate-500">${U.bn(count(x))}</span>` : ''}</button>`).join('')}</nav>${panel}</div>`;
  },
  save(g, form) {
    const d = formData(form);
    this.PARAMS[g].forEach(p => {
      if (p.type === 'fees') { const fees = this.cfg().serviceFees = this.cfg().serviceFees || {}; SERVICE_TYPES.forEach(t => { if (d['fee_' + t] !== undefined) fees[t] = +d['fee_' + t] || 0; }); }
      else if (p.type === 'html') { if (p.save) p.save(form, d); }
      else if (p.set && d[p.k] !== undefined) p.set(d[p.k]);
    });
    this.apply(); Settings.save(`${g} সেটিংস সংরক্ষিত হয়েছে।`, `ফিচার সেটিংস: ${g}`);
  },
};

/* ---------------- Structure: levels, classes, batches, teachers & mentors ---------------- */
Object.assign(Settings, {
  TABS: [['identity', 'পরিচিতি ও ব্র্যান্ডিং', 'badge-check'], ['theme', 'থিম ও রং', 'palette'], ['website', 'ওয়েবসাইট ও হিরো', 'globe'], ['homepage', 'হোমপেজ নির্মাতা', 'layout-template'], ['menus', 'মেনু ও ইউআরএল', 'list-tree'], ['pages', 'পৃষ্ঠা ও ফুটার', 'file-text'], ['structure', 'শ্রেণি, স্তর ও শিক্ষাবর্ষ', 'building-2'], ['policy', 'একাডেমিক নীতি', 'scale'], ['flags', 'বৈশিষ্ট্য ও সেটিংস', 'toggle-right'], ['rbac', 'ভূমিকা ও অনুমতি', 'shield-check']],
  homepage() { return Home.editor(); },
  menus() { return Menus.editor(); },
  pages() { return Pages.editor(); },
  flags() { return FeatureCfg.editor(); },
  levels() { return DB.s.levels || (DB.s.levels = []); },
  tName(tid) { const t = DB.s.teachers.find(x => x.id === tid); return t ? pn(DB.user(t.userId)) || tid : ''; },
  structure() {
    const s = DB.s.school, can = this.canEdit(), lv = this.levels();
    const byLevel = [...lv.map(l => [l, DB.classesIn().filter(c => c.level === l.id)]), [{ id: '', name: 'কোনো স্তর নেই' }, DB.classesIn().filter(c => !lv.some(l => l.id === c.level))]].filter(([, cs]) => cs.length);
    return `<div class="grid xl:grid-cols-2 gap-5">
      <div class="card"><div class="px-5 py-3 border-b border-slate-100 font-semibold flex items-center">স্তরসমূহ <span class="text-xs font-normal text-slate-400 ml-2">যেমন প্রাক-প্রাথমিক, প্রাথমিক, নূরানী, কিতাবখানা</span></div>
        <form class="p-4 space-y-2" onsubmit="Settings.saveLevels(this);return false">${lv.map(l => `<div class="flex items-center gap-2" data-lv="${l.id}"><input class="input !py-1" name="name" value="${esc(l.name)}" ${can ? '' : 'disabled'}><span class="text-xs text-slate-400 whitespace-nowrap w-20">${bnNum(DB.s.classes.filter(c => c.level === l.id).length)}টি শ্রেণি</span>${can ? `<button type="button" class="btn btn-ghost btn-sm" onclick="Settings.delLevel('${l.id}')">${icon('trash-2')}</button>` : ''}</div>`).join('')}
          ${can ? `<div class="pt-2"><div class="text-xs text-slate-500 mb-1.5">যোগ করুন:</div><div class="flex flex-wrap gap-1.5">${LEVEL_PRESETS.filter(n => !lv.some(l => l.name === n)).map(n => `<button type="button" class="pill" onclick="Settings.addLevel('${n}')">${icon('plus', 'w-3 h-3')} ${n}</button>`).join('')}<button type="button" class="pill" onclick="Settings.addLevel('__custom')">${icon('plus', 'w-3 h-3')} কাস্টম…</button></div><button class="btn btn-primary btn-sm mt-3">${icon('save')} নাম সংরক্ষণ করুন</button></div>` : ''}</form></div>
      <div class="card xl:col-span-2"><div class="px-5 py-3 border-b border-slate-100 font-semibold flex flex-wrap items-center gap-2">শ্রেণি, শাখা, ব্যাচ ও শিক্ষক — ${esc(DB.campus().name)} ${can ? `<button class="btn btn-primary btn-sm ml-auto" onclick="Settings.editClass()">${icon('plus')} শ্রেণি যোগ করুন</button>` : ''}</div>
        ${byLevel.map(([l, cs]) => `<div class="px-5 pt-4 pb-1 text-xs font-bold uppercase tracking-wide text-brand-700">${esc(l.name)}</div><div class="scroll-x"><table class="table"><thead><tr><th>শ্রেণি</th><th>শাখাসমূহ</th><th>ব্যাচ / বিভাগ</th><th>শিফট</th><th>ভর্তিকৃত</th><th>শ্রেণি শিক্ষক</th><th>পরামর্শক শিক্ষক</th><th></th></tr></thead><tbody>${cs.map(c => { const n = DB.activeStudents().filter(x => x.classId === c.id).length, cap = (c.capacity || s.sectionCapacity) * Math.max(1, c.sections.length); return `<tr>
          <td class="font-semibold">${esc(c.name)} <span class="text-xs text-slate-400">${c.id}</span></td><td>${c.sections.map(x => badge(x + (c.sectionTeachers?.[x] ? ' · ' + this.tName(c.sectionTeachers[x]).split(' ')[0] : ''), 'slate')).join(' ')}</td>
          <td class="text-xs">${[...(c.streams || []).map(x => badge(x, 'violet')), ...(c.batches || []).map(b => badge(b.name, 'blue'))].join(' ') || '—'}</td><td class="text-xs">${esc(bn(s.shifts.find(x => x.id === c.shift)?.name || '—'))}</td>
          <td>${bnNum(n)}/${bnNum(cap)} ${n > cap ? badge('ধারণক্ষমতার অতিরিক্ত', 'red') : ''}</td><td class="text-sm">${esc(this.tName(c.classTeacherId)) || '<span class="text-slate-400">ঐচ্ছিক</span>'}</td><td class="text-xs">${(c.mentors || []).map(m => esc(this.tName(m))).join(', ') || '—'}</td>
          <td>${can ? `<button class="btn btn-ghost btn-sm" onclick="Settings.editClass('${c.id}')">${icon('pencil')} এডিট করুন</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`).join('') || emptyState('এই ক্যাম্পাসে এখনো কোনো শ্রেণি নেই।')}</div>
      <div class="card"><div class="px-5 py-3 border-b border-slate-100 font-semibold flex items-center">শিক্ষাবর্ষসমূহ ${can ? `<button class="btn btn-ghost btn-sm ml-auto" onclick="Settings.addSession()">${icon('plus')} শিক্ষাবর্ষ যোগ করুন</button>` : ''}</div><div class="divide-y divide-slate-100">${DB.s.sessions.map(x => `<div class="px-5 py-2.5 text-sm flex items-center gap-3"><b class="flex-1">${esc(bnNum(x.name))}</b>${badge(bn(x.status), { active: 'green', planning: 'blue', closed: 'slate' }[x.status])}${x.status === 'planning' ? `<a class="btn btn-ghost btn-sm" href="${App.href(App.route.portal, 'clone')}">প্রস্তুত / সক্রিয় করুন</a>` : ''}</div>`).join('')}</div>
        <div class="px-5 py-3 border-t border-slate-100"><div class="font-semibold text-sm mb-2">কর্মশিফট</div>${s.shifts.map((sh, i) => `<div class="flex gap-2 mb-2"><input class="input !py-1" value="${esc(sh.name)}" onchange="DB.s.school.shifts[${i}].name=this.value;DB.save()"><input type="time" class="input !py-1" value="${sh.start}" onchange="DB.s.school.shifts[${i}].start=this.value;DB.save()"><input type="time" class="input !py-1" value="${sh.end}" onchange="DB.s.school.shifts[${i}].end=this.value;DB.save()"></div>`).join('')}<button class="btn btn-ghost btn-sm" onclick="DB.s.school.shifts.push({id:'SH'+Date.now().toString().slice(-4),name:'সান্ধ্য',start:'15:00',end:'18:00'});Settings.save('শিফট যোগ করা হয়েছে।')">${icon('plus')} শিফট যোগ করুন</button></div></div>
      <div class="card p-5 grid gap-4"><div><div class="font-semibold mb-2">কক্ষ — ${esc(DB.campus().name)}</div><textarea class="textarea font-mono text-sm" rows="3" onchange="DB.s.rooms[DB.campusId()]=this.value.split(',').map(x=>x.trim()).filter(Boolean);Settings.save('কক্ষ আপডেট করা হয়েছে।')">${esc(DB.rooms().join(', '))}</textarea><p class="text-xs text-slate-400 mt-1">কমা দিয়ে আলাদা করুন; রুটিন নির্মাতা ও আসন বিন্যাসে ব্যবহৃত হয়।</p></div>
        <form id="set-rooms" class="grid grid-cols-2 gap-3"><div class="col-span-2 font-semibold">কক্ষ বরাদ্দের নিয়ম</div><div><label class="label">কক্ষপ্রতি সর্বোচ্চ শিক্ষার্থী</label><input type="number" class="input" name="maxPerRoom" value="${s.roomRules.maxPerRoom}"></div><div><label class="label">বেঞ্চপ্রতি পরীক্ষার আসন</label><input type="number" min="1" max="3" class="input" name="examSeatsPerBench" value="${s.roomRules.examSeatsPerBench}"></div><label class="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" name="keepLabsForPractical" ${s.roomRules.keepLabsForPractical ? 'checked' : ''}> ব্যবহারিক ক্লাসের জন্য গবেষণাগার সংরক্ষিত রাখুন</label><div class="col-span-2"><button class="btn btn-primary btn-sm">নিয়ম সংরক্ষণ করুন</button></div></form></div></div>`;
  },
  saveLevels(f) { $$('[data-lv]', f).forEach(r => { const l = this.levels().find(x => x.id === r.dataset.lv); const v = r.querySelector('input').value.trim(); if (l && v) l.name = v; }); this.save('স্তরসমূহ সংরক্ষিত হয়েছে।', 'class levels'); },
  addLevel(name) {
    if (name === '__custom') name = (prompt('স্তরের নাম (যেমন হিফজ, ও-লেভেল, ডিপ্লোমা):') || '').trim();
    if (!name) return App.refresh();
    if (this.levels().some(l => l.name.toLowerCase() === name.toLowerCase())) return toast('এই স্তরটি ইতোমধ্যে বিদ্যমান।', 'warn');
    this.levels().push({ id: DB.id('LV'), name }); this.save(`“${name}” স্তর যোগ করা হয়েছে।`, `level ${name}`);
  },
  delLevel(id) {
    const n = DB.s.classes.filter(c => c.level === id).length;
    if (n) return toast(`${bnNum(n)}টি শ্রেণি এই স্তর ব্যবহার করছে — আগে সেগুলো অন্য স্তরে স্থানান্তর করুন।`, 'error');
    if (!confirm('এই স্তরটি মুছে ফেলবেন?')) return;
    DB.s.levels = this.levels().filter(l => l.id !== id); this.save('স্তর মুছে ফেলা হয়েছে।', `level ${id} deleted`);
  },
  /** In-place class editor: level, sections + section teachers, batches, streams, class teacher (optional), mentors.
      Works on a copy (App.ui.clsWork) so rows can be added/removed before saving. */
  editClass(id) {
    const c = id ? DB.cls(id) : null;
    App.ui.clsWork = c ? JSON.parse(JSON.stringify({ batches: [], streams: [], mentors: [], sectionTeachers: {}, ...c })) : { id: '', name: '', grade: '', level: this.levels()[0]?.id || '', sections: ['ক'], shift: DB.s.school.shifts[0]?.id, capacity: DB.s.school.sectionCapacity, campusId: DB.campusId(), batches: [], streams: [], mentors: [], sectionTeachers: {}, classTeacherId: '', tuition: 2000, isNew: true };
    App.openDetail({ title: c ? `শ্রেণি বিন্যাস · ${c.name}` : `শ্রেণি যোগ করুন — ${DB.campus().name}`, render: () => this.classForm(), mount: () => $('#cls-form').addEventListener('submit', e => { e.preventDefault(); this.saveClass(); }) });
  },
  classForm() {
    const w = App.ui.clsWork, T = DB.teachersIn(w.campusId);
    const tOpt = (sel, empty) => `<option value="">${empty}</option>${T.map(t => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(pn(DB.user(t.userId)))}</option>`).join('')}`;
    return `<form id="cls-form" class="space-y-5 max-w-5xl"><div class="card p-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-4"><div class="sm:col-span-2 lg:col-span-4 font-semibold">শ্রেণি</div>
        <div><label class="label">শ্রেণি আইডি</label><input class="input font-mono uppercase" name="id" value="${esc(w.id)}" ${w.isNew ? 'required placeholder="যেমন KG1, C11, NUR1"' : 'readonly'}></div>
        <div><label class="label">নাম</label><input class="input" name="name" value="${esc(w.name)}" required placeholder="ষষ্ঠ শ্রেণি / নূরানী ১ম বর্ষ"></div>
        <div><label class="label">শ্রেণির ক্রমিক সংখ্যা <span class="font-normal text-slate-400">(ক্রম ও উত্তরণ)</span></label><input type="number" class="input" name="grade" value="${esc(w.grade)}" required></div>
        <div><label class="label">স্তর</label><select class="select" name="level">${this.levels().map(l => `<option value="${l.id}" ${l.id === w.level ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}<option value="" ${w.level ? '' : 'selected'}>— কোনোটি নয় —</option></select></div>
        <div><label class="label">শিফট</label><select class="select" name="shift"><option value="" ${w.shift ? '' : 'selected'}>— শিফট নেই —</option>${DB.s.school.shifts.map(sh => `<option value="${sh.id}" ${sh.id === w.shift ? 'selected' : ''}>${esc(bn(sh.name))}</option>`).join('')}</select></div>
        <div><label class="label">শাখাপ্রতি ধারণক্ষমতা</label><input type="number" min="5" class="input" name="capacity" value="${esc(w.capacity)}"></div>
        <div><label class="label">শ্রেণি শিক্ষক <span class="font-normal text-slate-400">(ঐচ্ছিক)</span></label><select class="select" name="classTeacherId">${tOpt(w.classTeacherId, '— নির্ধারিত হয়নি —')}</select></div>
        ${w.isNew ? `<div><label class="label">মাসিক বেতন (৳)</label><input type="number" class="input" name="tuition" value="${esc(w.tuition)}"></div>` : ''}
        <div class="sm:col-span-2 lg:col-span-4 border-t border-slate-100 pt-4"><div class="font-semibold">প্রস্তুত কাঠামো — বিভাগ / গ্রুপ, শাখা ও ব্যাচ</div><p class="text-slate-500 mt-1">প্রতিষ্ঠানের ধরন অনুযায়ী একটি কাঠামো এক ক্লিকে প্রয়োগ করুন, তারপর ইচ্ছেমতো বদলান। এক শ্রেণিতে একসঙ্গে বিভাগ/গ্রুপ, একাধিক শাখা ও ব্যাচ থাকতে পারে।</p>${typeof ClassPresets !== 'undefined' ? ClassPresets.picker() : ''}</div>
        <div><label class="label">বিভাগের শিরোনাম</label><input class="input" name="streamLabel" value="${esc(w.streamLabel || '')}" placeholder="বিভাগ / গ্রুপ / ট্রেড"></div>
        <div class="sm:col-span-1 lg:col-span-3"><label class="label">${esc(w.streamLabel || 'বিভাগ / গ্রুপ')}সমূহ <span class="font-normal text-slate-400">(ঐচ্ছিক, কমা দিয়ে আলাদা করুন)</span></label><input class="input" name="streams" value="${esc(w.streams.join(', '))}" placeholder="যেমন বিজ্ঞান, মানবিক, ব্যবসায় শিক্ষা"></div>
        <div class="sm:col-span-2 lg:col-span-4"><div class="flex flex-wrap gap-1.5">${(typeof STREAM_PRESETS !== 'undefined' ? STREAM_PRESETS : []).map(n => `<button type="button" class="pill" onclick="const i=this.closest('form').streams;const v=i.value.split(',').map(x=>x.trim()).filter(Boolean);if(!v.includes('${n}'))v.push('${n}');i.value=v.join(', ')">${icon('plus', 'w-3 h-3')} ${n}</button>`).join('')}</div>
          <p class="text-slate-500 mt-2">ভর্তি ফরমে এই শ্রেণির জন্য বিভাগ/গ্রুপ, পছন্দের শাখা (একাধিক শাখা থাকলে) ও ব্যাচ বেছে নেওয়ার ঘর আপনিই দেখা যাবে। শাখার নাম ক, খ, গ … অথবা বালক/বালিকা — যেকোনো নাম হতে পারে।</p></div></div>
      <div class="card p-5"><div class="flex items-center mb-3"><div class="font-semibold">শাখা ও শাখা শিক্ষক</div><button type="button" class="btn btn-ghost btn-sm ml-auto" onclick="Settings.clsRow('sections')">${icon('plus')} শাখা</button></div>
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">${w.sections.map((x, i) => `<div class="flex items-center gap-2 border border-slate-200 rounded-lg p-2" data-sec><input class="input !py-1 !w-28 font-mono uppercase" name="sec" value="${esc(x)}" required><select class="select !py-1" name="secTeacher">${tOpt(w.sectionTeachers[x], 'শাখা শিক্ষক —')}</select><button type="button" class="btn btn-ghost btn-sm !px-1" aria-label="শাখা সরান" onclick="Settings.clsRow('sections',${i})">${icon('x')}</button></div>`).join('')}</div></div>
      <div class="card p-5"><div class="flex items-center mb-3"><div class="font-semibold">ব্যাচসমূহ <span class="text-xs font-normal text-slate-400">— নিজস্ব শিক্ষক বা পরামর্শকসহ কোচিং / বিশেষ / প্রতিকারমূলক ব্যাচ</span></div><button type="button" class="btn btn-ghost btn-sm ml-auto" onclick="Settings.clsRow('batches')">${icon('plus')} ব্যাচ</button></div>
        ${w.batches.length ? `<div class="space-y-2">${w.batches.map((b, i) => `<div class="grid sm:grid-cols-[1fr_1fr_1fr_6rem_auto] gap-2 items-center" data-batch><input class="input !py-1" name="bName" value="${esc(b.name)}" placeholder="ব্যাচের নাম" required><input class="input !py-1" name="bTime" value="${esc(b.time || '')}" placeholder="দিন ও সময় (যেমন রবি–মঙ্গল বিকাল ৩–৫টা)"><select class="select !py-1" name="bTeacher">${tOpt(b.teacherId, 'শিক্ষক / পরামর্শক —')}</select><input type="number" class="input !py-1" name="bCap" value="${esc(b.capacity || '')}" placeholder="আসন"><button type="button" class="btn btn-ghost btn-sm !px-1" onclick="Settings.clsRow('batches',${i})">${icon('x')}</button></div>`).join('')}</div>` : '<p class="text-sm text-slate-400">কোনো ব্যাচ নেই।</p>'}</div>
      <div class="card p-5"><div class="font-semibold mb-1">পরামর্শক শিক্ষক</div><p class="text-xs text-slate-500 mb-3">যেসব শিক্ষক এই শ্রেণির পরামর্শক (তত্ত্বাবধান, দিকনির্দেশনা) — ঐচ্ছিক শ্রেণি শিক্ষকের অতিরিক্ত।</p>
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">${T.map(t => `<label class="flex items-center gap-2 text-sm border border-slate-200 rounded-lg px-3 py-2"><input type="checkbox" name="mentor" value="${t.id}" ${w.mentors.includes(t.id) ? 'checked' : ''}>${esc(pn(DB.user(t.userId)))} <span class="text-xs text-slate-400 ml-auto">${esc(t.dept || '')}</span></label>`).join('') || '<p class="text-sm text-slate-400">এই ক্যাম্পাসে কোনো শিক্ষক নেই।</p>'}</div></div>
      <div class="flex gap-2"><button class="btn btn-primary">${icon('save')} ${w.isNew ? 'শ্রেণি তৈরি করুন' : 'শ্রেণি সংরক্ষণ করুন'}</button><button type="button" class="btn btn-ghost" onclick="App.closeDetail()">বাতিল</button></div></form>`;
  },
  /** Copy everything typed in the class form into the working copy. */
  clsSync() {
    const f = $('#cls-form'), w = App.ui.clsWork; if (!f) return w;
    const d = formData(f);
    Object.assign(w, { name: d.name, grade: d.grade, level: d.level, shift: d.shift, capacity: d.capacity, classTeacherId: d.classTeacherId, streamLabel: (d.streamLabel || '').trim(), streams: (d.streams || '').split(',').map(x => x.trim()).filter(Boolean) });
    if (w.isNew) { w.id = d.id; w.tuition = d.tuition; }
    const secs = $$('[data-sec]', f).map(r => [r.querySelector('[name=sec]').value.trim().toUpperCase(), r.querySelector('[name=secTeacher]').value]);
    w.sections = secs.map(x => x[0]); w.sectionTeachers = Object.fromEntries(secs.filter(x => x[0] && x[1]));
    w.batches = $$('[data-batch]', f).map((r, i) => ({ id: w.batches[i]?.id || null, name: r.querySelector('[name=bName]').value.trim(), time: r.querySelector('[name=bTime]').value.trim(), teacherId: r.querySelector('[name=bTeacher]').value || null, capacity: +r.querySelector('[name=bCap]').value || null }));
    w.mentors = $$('[name=mentor]:checked', f).map(x => x.value);
    return w;
  },
  /** Add (no index) or remove (index) a section / batch row. */
  clsRow(kind, i) {
    const w = this.clsSync();
    if (i === undefined) { if (kind === 'sections') { const next = SECTION_NAMES.find(x => !w.sections.includes(x)) || String(w.sections.length + 1); w.sections.push(next); } else w.batches.push({ name: '', time: '', teacherId: '', capacity: '' }); }
    else w[kind].splice(i, 1);
    App.refresh();
  },
  saveClass() {
    const w = this.clsSync(), id = (w.id || '').trim().toUpperCase();
    // a class may have no section at all (students then have section ''); a listed section needs a name
    if (w.sections.some(x => !x)) return toast('প্রতিটি শাখার একটি নাম আবশ্যক।', 'error');
    if (new Set(w.sections).size !== w.sections.length) return toast('শাখার নাম অবশ্যই স্বতন্ত্র হতে হবে।', 'error');
    if (w.isNew && DB.cls(id)) return toast('এই শ্রেণি আইডি ইতোমধ্যে বিদ্যমান।', 'error');
    const c = w.isNew ? { id, campusId: w.campusId } : DB.cls(id);
    const removed = w.isNew ? [] : c.sections.filter(x => !w.sections.includes(x) && DB.studentsIn(c.id, x).length);
    if (removed.length) return toast(`${removed.join(', ')} শাখায় এখনো শিক্ষার্থী রয়েছে — অপসারণের আগে তাদের স্থানান্তর করুন।`, 'error');
    Object.assign(c, { name: w.name, grade: +w.grade, level: w.level || null, shift: w.shift || '', capacity: +w.capacity || DB.s.school.sectionCapacity, classTeacherId: w.classTeacherId || null, sections: w.sections, sectionTeachers: w.sectionTeachers, streams: w.streams, streamLabel: w.streamLabel || null, batches: w.batches.filter(b => b.name).map(b => ({ ...b, id: b.id || DB.id('BT') })), mentors: w.mentors });
    if (w.isNew) { DB.s.classes.push(c); DB.s.feeConfigs.push({ session: DB.session(), campusId: c.campusId, classId: c.id, tuition: +w.tuition || 0, admissionFee: (+w.tuition || 0) * 2, examFee: 800 }); }
    DB.audit(w.isNew ? 'CLASS_CREATE' : 'CLASS_CONFIG', 'classes', `${c.id} ${c.name} · ${bnNum(c.sections.length)}টি শাখা, ${bnNum(c.batches.length)}টি ব্যাচ, শ্রেণি শিক্ষক ${c.classTeacherId || '—'}, ${bnNum(c.mentors.length)} জন পরামর্শক`);
    DB.save(); toast(w.isNew ? `${c.name} তৈরি করা হয়েছে।` : 'শ্রেণি সংরক্ষিত হয়েছে।', 'success'); App.closeDetail();
  },
});

// Theme tab: sidebar colour controls (live preview via the existing theme form handler).
(() => {
  const t0 = Settings.theme.bind(Settings);
  Settings.theme = function () {
    const t = DB.s.theme, mode = t.sidebar || 'page';
    const block = `<div class="sm:col-span-2 card p-4 bg-slate-50/60"><div class="label">সাইডবারের রং (ড্যাশবোর্ড)</div><div class="flex flex-wrap items-center gap-3">
      ${[['page', 'পৃষ্ঠার মতো'], ['brand', 'ব্র্যান্ড রং'], ['dark', 'গাঢ়'], ['custom', 'কাস্টম']].map(([v, l]) => `<label class="pill cursor-pointer ${mode === v ? 'pill-on' : ''}"><input type="radio" name="sidebar" value="${v}" class="hidden" ${mode === v ? 'checked' : ''} onchange="$$('[name=sidebar]').forEach(r=>r.parentElement.classList.toggle('pill-on',r.checked))">${l}</label>`).join('')}
      <input type="color" name="sidebarBg" value="${t.sidebarBg || '#ffffff'}" class="h-9 w-14 rounded border" title="কাস্টম সাইডবার রং" oninput="const r=this.form.querySelector('[name=sidebar][value=custom]');r.checked=true;$$('[name=sidebar]').forEach(x=>x.parentElement.classList.toggle('pill-on',x.checked))"></div>
      <p class="text-xs text-slate-500 mt-2">বৈপরীত্যের জন্য লেখার রং স্বয়ংক্রিয়ভাবে সমন্বয় হয়। পরিবর্তনগুলো সরাসরি দেখা যায়; সেগুলো রাখতে "থিম সংরক্ষণ করুন" চাপুন।</p></div>`;
    return t0().replace('<div class="sm:col-span-2 flex gap-2"><button class="btn btn-primary">', block + '<div class="sm:col-span-2 flex gap-2"><button class="btn btn-primary">');
  };
})();


// Apply menus, custom pages and feature parameters once data is loaded (first render).
(() => {
  const r0 = App.render;
  App.render = function () { if (!Menus._ready) { Menus._ready = true; try { Menus.apply(); FeatureCfg.apply(); } catch (e) { console.error(e); } } return r0.apply(this, arguments); };
})();

// One-time clean-up: remove the made-up testimonial quotes that earlier versions put on the homepage
// (only when the text is still exactly the old sample — a school's own quotes are never touched).
DB.addSeeder('noSampleQuotesV1', s => {
  const old = /^রহিমা খাতুন \| অভিভাবক, সপ্তম শ্রেণি \|/;
  (s.site?.home?.sections || s.home?.sections || []).forEach(x => { if (x.type === 'testimonials' && old.test(x.items || '') && /নাসরিন সুলতানা/.test(x.items)) x.items = ''; });
  return true;
});
