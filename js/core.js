/* ==========================================================================
   Dhee SMS — application core
   Session, multi-role switcher, hash router, layout shells and UI helpers.
   ========================================================================== */
const SESSION_KEY = 'dhee.session.v1';
/* ---------- tiny view helpers ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (name, cls = 'w-4 h-4') => `<i data-lucide="${name}" class="${cls}"></i>`;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
function avatar(person, size = 36) {
  const name = person?.name || '?';
  const inner = person?.photo ? `<img src="${person.photo}" alt="">` : esc(U.initials(name));
  return `<span class="avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px;background:${U.color(name)}">${inner}</span>`;
}
function badge(text, tone = 'slate') {
  const tones = { slate: 'bg-slate-100 text-slate-700', green: 'bg-emerald-100 text-emerald-700', red: 'bg-red-100 text-red-700', amber: 'bg-amber-100 text-amber-800', blue: 'bg-blue-100 text-blue-700', violet: 'bg-violet-100 text-violet-700', pink: 'bg-pink-100 text-pink-700' };
  return `<span class="badge ${tones[tone] || tones.slate}">${esc(text)}</span>`;
}
function statusBadge(st) {
  const map = { Pending: 'amber', Approved: 'green', Declined: 'red', paid: 'green', unpaid: 'red', Submitted: 'blue', Graded: 'green', Delivered: 'green', Queued: 'amber', Commendation: 'green', Disciplinary: 'red', Counselor: 'violet', Rejected: 'red', disbursed: 'green', draft: 'amber' };
  return badge(bn(st), map[st] || 'slate');
}
function pageHeader(title, subtitle = '', actions = '') {
  return `<div class="flex flex-wrap items-end justify-between gap-3 mb-5">
    <div><h1 class="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">${title}</h1>${subtitle ? `<p class="text-sm text-slate-500 mt-0.5">${campusText(subtitle)}</p>` : ''}</div>
    <div class="flex flex-wrap gap-2">${actions}</div></div>`;
}
function kpi(label, value, sub = '', ic = 'activity', tone = 'blue') {
  const tones = { blue: 'bg-blue-50 text-blue-600', green: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600', red: 'bg-red-50 text-red-600', violet: 'bg-violet-50 text-violet-600' };
  return `<div class="card kpi flex items-start gap-3"><div class="rounded-xl p-2.5 ${tones[tone]}">${icon(ic, 'w-5 h-5')}</div>
    <div class="min-w-0"><div class="l">${campusText(label)}</div><div class="v">${value}</div>${sub ? `<div class="text-xs text-slate-500 mt-0.5">${sub}</div>` : ''}</div></div>`;
}
function emptyState(msg, ic = 'inbox') { return `<div class="text-center py-10 text-slate-400">${icon(ic, 'w-8 h-8 mx-auto mb-2')}<div class="text-sm">${campusText(msg)}</div></div>`; }
/** A single-campus institution never reads about "this campus": messages say "the institution" instead. */
function campusText(s) {
  if (typeof s !== 'string' || typeof DB === 'undefined' || !DB.s || (DB.s.campuses || []).length !== 1) return s;
  const c = DB.s.campuses[0], rx = v => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (c.name && s.includes(c.name)) {
    const n = rx(c.name);
    s = s.replace(new RegExp(`\\s*\\(${n}\\)`, 'g'), '').replace(new RegExp(`\\s*[·—,]\\s*(<b>)?${n}(</b>)?`, 'g'), '').replace(new RegExp(`(<b>)?${n}(</b>)?\\s*[·—,]\\s*`, 'g'), '').replace(new RegExp(`(<b>)?${n}(</b>)?-এর জন্য `, 'g'), '').replace(new RegExp(`(<b>)?${n}(</b>)?-এ `, 'g'), 'প্রতিষ্ঠানে ');
  }
  if (c.short) { const h = rx(c.short); s = s.replace(new RegExp(`\\s*[·(]?\\s*${h} ক্যাম্পাস\\)?`, 'g'), '').replace(new RegExp(`\\s*\\(${h}\\)`, 'g'), '').replace(new RegExp(`\\s*[·—]\\s*${h}(?=$|[\\s<)])`, 'g'), ''); }
  if (!s.includes('ক্যাম্পাস')) return s;
  return s.replace(/এই ক্যাম্পাসের/g, 'প্রতিষ্ঠানের').replace(/এই ক্যাম্পাসে/g, 'প্রতিষ্ঠানে').replace(/ক্যাম্পাসব্যাপী/g, 'প্রতিষ্ঠানব্যাপী').replace(/ক্যাম্পাসের সকল/g, 'সকল').replace(/ \((এই )?ক্যাম্পাস\)/g, '').replace(/সকল ক্যাম্পাস/g, 'সম্পূর্ণ প্রতিষ্ঠান');
}
/** Form values; numbers and codes typed with Bangla digits (০-৯) are stored as 0-9, so বাংলা and English input both work. */
function formData(form) {
  const o = {};
  new FormData(form).forEach((v, k) => {
    if (typeof v === 'string') { v = v.trim(); if (/[০-৯]/.test(v) && /^[\sA-Za-z0-9০-৯_.,:\-\/+()|#@]*$/.test(v)) v = U.asciiDigits(v); }
    o[k] = v;
  });
  return o;
}
// Number / phone / date fields: a Bangla digit typed on a Bangla keyboard becomes the same digit 0-9.
document.addEventListener('beforeinput', e => {
  const el = e.target;
  if (!e.data || !/[০-৯]/.test(e.data) || el.nodeName !== 'INPUT' || !/^(number|tel|text|search)$/.test(el.type)) return;
  if (el.type === 'text' || el.type === 'search') { if (!/numeric|tel|decimal/.test(el.inputMode || '') && !/(roll|reg|phone|mobile|trx|code|nid|brn|idNo|birthRegNo|amount)/i.test(el.name)) return; }
  e.preventDefault();
  const d = U.asciiDigits(e.data);
  if (el.type === 'number') el.value = (el.value || '') + d; else el.setRangeText(d, el.selectionStart, el.selectionEnd, 'end');
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
/** Class <option>s for the active campus, or grouped by campus when campus === 'ALL' (public site). */
function classOptions(selected, all = false, campus) {
  campus = campus || (App.route.portal === 'public' ? 'ALL' : DB.campusId());
  const opt = c => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${c.name}</option>`;
  const head = all ? `<option value="">সকল শ্রেণি</option>` : '';
  if (campus !== 'ALL' || !multiCampus()) return head + DB.classesIn(campus).map(opt).join('');
  return head + DB.s.campuses.map(cp => `<optgroup label="${esc(cp.name)}">${DB.classesIn(cp.id).map(opt).join('')}</optgroup>`).join('');
}
/** More than one campus? A single-campus institution never sees campus filters, selectors or columns
    (campus <option>s carry data-cmp; SingleValue below hides their <select> and its label). */
function multiCampus() { return ((typeof DB !== 'undefined' && DB.s && DB.s.campuses) || []).length > 1; }
function campusOptions(selected, withAll = false) { return (withAll ? `<option data-cmp value="ALL" ${selected === 'ALL' ? 'selected' : ''}>সকল ক্যাম্পাস</option>` : '') + DB.s.campuses.map(c => `<option data-cmp value="${c.id}" ${c.id === selected ? 'selected' : ''}>${esc(c.name)}</option>`).join(''); }
function sessionOptions(selected) { const one = DB.s.sessions.length === 1 ? 'data-one' : ''; return DB.s.sessions.map(s => `<option ${one} value="${s.id}" ${s.id === selected ? 'selected' : ''}>${esc(U.bn(s.name))} · ${esc(bn(s.status))}</option>`).join(''); }
/* ---------- Single-value filters: hide what cannot change anything ----------
   A <select> whose options are campus options (data-cmp) while there is one campus, or whose only
   option is marked data-one (single session …), is hidden together with its label; its value is still
   submitted with the form. Table cells marked data-cmp-col disappear too. Runs on every DOM change. */
const SingleValue = {
  sweep(root = document) {
    const single = !multiCampus();
    $$('select:not([data-sv])', root).forEach(sel => {
      const opts = [...sel.options];
      const hide = (single && opts.length && opts.some(o => o.hasAttribute('data-cmp')) && opts.every(o => o.hasAttribute('data-cmp') || !o.value))
        || (opts.length === 1 && opts[0].hasAttribute('data-one'));
      if (!hide) return;
      sel.dataset.sv = '1';
      const p = sel.parentElement, lab = p && [...p.children].filter(x => x !== sel);
      const wrap = sel.closest('[data-sv-wrap]') || (p && p.tagName !== 'FORM' && !p.classList.contains('card') && lab.length <= 1 && lab.every(x => x.matches('label, .label')) ? p : null);
      (wrap || sel).classList.add('hidden');
      if (!wrap && sel.id) $$(`label[for="${sel.id}"]`).forEach(l => l.classList.add('hidden'));
    });
    if (single) $$('[data-cmp-col]:not(.hidden)', root).forEach(el => el.classList.add('hidden'));
    if (single) this.texts(root === document ? document.body : root);
  },
  /** Single campus: the campus name and "this campus" wording disappear from text (Root User's campus management keeps it: [data-keep-campus]). */
  _seen: typeof WeakMap !== 'undefined' ? new WeakMap() : null,
  texts(root) {
    if (!root || !this._seen) return;
    const c = DB.s.campuses[0] || {}, keys = [c.name, c.short, 'ক্যাম্পাস'].filter(Boolean);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => (this._seen.get(n) === n.nodeValue || !keys.some(k => n.nodeValue.includes(k)) || n.parentElement?.closest('script,style,textarea,[data-keep-campus]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    const list = []; while (w.nextNode()) list.push(w.currentNode);
    list.forEach(n => { const v = campusText(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; this._seen.set(n, n.nodeValue); });
    $$('[title*="ক্যাম্পাস"],[aria-label*="ক্যাম্পাস"]', root).forEach(el => { ['title', 'aria-label'].forEach(a => { const v = el.getAttribute(a); if (v && !el.closest('[data-keep-campus]')) el.setAttribute(a, campusText(v)); }); });
  },
};
if (typeof MutationObserver !== 'undefined') new MutationObserver(() => { try { SingleValue.sweep(); } catch (e) { /* never block rendering */ } }).observe(document.documentElement, { childList: true, subtree: true });
/* ---------- "কলাম ও ফিল্টার": each user chooses a list's columns and filters ----------
   defs = [{ k, label, on?: false (hidden by default), lock?: true (always shown), when?: false (not offered) }]
   ListPrefs.cols(listId, defs) / ListPrefs.filters(listId, defs) → the visible defs (call them while rendering),
   ListPrefs.button(listId) → the button that opens the chooser. The choice is stored on the user's own record
   (users[].uiPrefs[listId] = { cols, filters }) and saved with the normal state save — every role may change
   its own record on the server, so it follows the user to every device. */
const ListPrefs = {
  _defs: {},
  user() { return App.session ? DB.user(App.session.userId) : null; },
  saved(listId) { const p = this.user()?.uiPrefs; return (p && p[listId]) || null; },
  pick(listId, kind, defs) {
    const all = defs.filter(d => d.when !== false);
    (this._defs[listId] = this._defs[listId] || {})[kind] = all;
    const s = this.saved(listId)?.[kind];
    return all.filter(d => d.lock || (Array.isArray(s) ? s.includes(d.k) : d.on !== false));
  },
  cols(listId, defs) { return this.pick(listId, 'cols', defs); },
  filters(listId, defs) { return this.pick(listId, 'filters', defs); },
  /** Set of visible keys of one kind (after cols()/filters() ran for this list). */
  keys(listId, kind) { const d = this._defs[listId]?.[kind] || []; return new Set(this.pick(listId, kind, d).map(x => x.k)); },
  button(listId) { return this.user() ? `<button type="button" class="btn btn-ghost btn-sm" aria-haspopup="dialog" onclick="ListPrefs.open('${listId}',this)">${icon('columns-3')} কলাম ও ফিল্টার</button>` : ''; },
  close() { $('#lp-pop')?.remove(); document.removeEventListener('mousedown', this._out, true); document.removeEventListener('keydown', this._esc, true); },
  open(listId, btn) {
    if ($('#lp-pop')?.dataset.list === listId) return this.close();
    this.close();
    const D = this._defs[listId] || {}, box = (kind, title) => {
      const defs = (D[kind] || []).filter(d => !d.lock); if (!defs.length) return '';
      const on = this.keys(listId, kind);
      return `<fieldset class="mb-3"><legend class="font-semibold mb-1.5">${title}</legend><div class="grid gap-1">${defs.map(d => `<label class="flex items-center gap-2 cursor-pointer py-0.5"><input type="checkbox" class="w-4 h-4 accent-[var(--brand)]" data-kind="${kind}" value="${esc(d.k)}" ${on.has(d.k) ? 'checked' : ''}> ${esc(d.label)}</label>`).join('')}</div></fieldset>`;
    };
    const el = document.createElement('div');
    el.id = 'lp-pop'; el.dataset.list = listId; el.className = 'card shadow-xl p-4'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'কলাম ও ফিল্টার');
    el.style.cssText = 'position:fixed;z-index:80;width:min(20rem,calc(100vw - 16px));max-height:70vh;overflow:auto';
    el.innerHTML = `${box('filters', 'ফিল্টার')}${box('cols', 'কলাম / তথ্য')}<div class="flex flex-wrap gap-2 pt-2 border-t border-slate-100"><button type="button" class="btn btn-primary btn-sm" onclick="ListPrefs.save('${listId}')">${icon('check')} সংরক্ষণ করুন</button><button type="button" class="btn btn-ghost btn-sm" onclick="ListPrefs.reset('${listId}')">${icon('rotate-ccw')} ডিফল্ট</button></div>`;
    document.body.appendChild(el);
    const r = btn.getBoundingClientRect(), w = el.offsetWidth;
    el.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + 'px';
    el.style.top = Math.min(r.bottom + 6, Math.max(8, window.innerHeight - el.offsetHeight - 8)) + 'px';
    this._out = e => { if (!el.contains(e.target) && !btn.contains(e.target)) this.close(); };
    this._esc = e => { if (e.key === 'Escape') { this.close(); btn.focus(); } };
    document.addEventListener('mousedown', this._out, true); document.addEventListener('keydown', this._esc, true);
    App.icons(); el.querySelector('input')?.focus();
  },
  write(listId, v) {
    const u = this.user(); if (!u) return;
    const p = { ...(u.uiPrefs || {}) }; if (v) p[listId] = v; else delete p[listId];
    u.uiPrefs = p; DB.save(); this.close(); App.refresh();
  },
  save(listId) {
    const pop = $('#lp-pop'), get = kind => $$(`input[data-kind="${kind}"]`, pop).filter(i => i.checked).map(i => i.value);
    this.write(listId, { cols: get('cols'), filters: get('filters') });
    toast('তালিকার কলাম ও ফিল্টার সংরক্ষিত হয়েছে।', 'success');
  },
  reset(listId) { this.write(listId, null); },
  /** <select>s for the visible filters that list their options: defs [{ k, label, opts: [[value, label]], all }]; values live in App.ui[uiKey]. */
  selects(defs, uiKey) {
    const ui = App.ui[uiKey] || {};
    return defs.filter(d => d.opts).map(d => `<select class="select !w-auto max-w-full" aria-label="${esc(d.label)}" onchange="ListPrefs.set('${uiKey}','${d.k}',this.value)"><option value="">${esc(d.all || `${d.label} — সকল`)}</option>${d.opts.map(([v, l]) => `<option value="${esc(v)}" ${String(ui[d.k] ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`).join('');
  },
  set(uiKey, k, v) { (App.ui[uiKey] = App.ui[uiKey] || {})[k] = v; App.refresh(); },
  /** Value of a filter, or '' when the user switched that filter off. */
  val(listId, uiKey, k) { return this.keys(listId, 'filters').has(k) ? ((App.ui[uiKey] || {})[k] ?? '') : ''; },
  /** <th>/<td> rows for the visible columns: cols [{ k, label, td(row), cls? }]. */
  head(cols) { return `<tr>${cols.map(c => `<th class="${c.cls || ''}">${c.label}</th>`).join('')}</tr>`; },
  row(cols, r) { return `<tr>${cols.map(c => `<td class="${c.cls || ''}">${c.td(r)}</td>`).join('')}</tr>`; },
};
/** Small tab strip; `key` names an App.ui slot holding the active tab id. */
/** Wrapping pill tabs (never a horizontally scrolling strip). `key` names an App.ui slot holding the active id. */
function tabs(key, items, active) { return pills(items, active, id => `App.ui['${key}']='${id}';App.refresh()`); }
function pills(items, active, onclickFor) {
  return `<div class="flex flex-wrap gap-1.5 mb-4" role="tablist">${items.map(([id, label, ic]) => `<button role="tab" aria-selected="${id === active}" class="pill ${id === active ? 'pill-on' : ''}" onclick="${onclickFor(id)}">${ic ? icon(ic, 'w-4 h-4') : ''}${label}</button>`).join('')}</div>`;
}
/* ---------- Searchable student picker (replaces long student <select>s) ----------
   Renders a hidden input `name` (student id) + a search box with live results.
   opts.scope = name of a class <select> in the same form to restrict results; opts.campus; opts.allowEmpty/emptyLabel. */
function studentPicker(name, value = '', opts = {}) {
  const st = value ? DB.student(value) : null;
  return `<div class="sp relative" data-sp data-scope="${esc(opts.scope || '')}" data-campus="${esc(opts.campus || 'ALL')}" data-empty="${esc(opts.allowEmpty ? (opts.emptyLabel || 'সকল শিক্ষার্থী') : '')}" ${opts.onPick ? `data-onpick="${esc(opts.onPick)}"` : ''}>
    <input type="hidden" name="${name}" value="${esc(value)}">
    <div class="relative">${icon('search', 'w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none')}<input class="input sp-q !pl-9 !pr-8" autocomplete="off" placeholder="${esc(opts.allowEmpty ? (opts.emptyLabel || 'সকল শিক্ষার্থী') + ' — অথবা অনুসন্ধান করুন…' : 'নাম, আইডি, রোল বা নিবন্ধন নম্বর দিয়ে অনুসন্ধান করুন…')}" value="${st ? esc(`${pn(st)} · ${DB.className(st.classId)} · রোল ${bnNum(st.roll)}`) : ''}" ${opts.required ? 'required' : ''}>
    <button type="button" class="sp-clear absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 ${st ? '' : 'hidden'}" aria-label="মুছুন">${icon('x', 'w-4 h-4')}</button></div>
    <div class="sp-list hidden absolute z-40 left-0 right-0 mt-1 card shadow-xl max-h-72 overflow-y-auto"></div></div>`;
}
const StudentPicker = {
  search(box, q) {
    const form = box.closest('form'), scope = box.dataset.scope && form?.elements[box.dataset.scope]?.value;
    let list = DB.activeStudents(box.dataset.campus || 'ALL');
    if (scope) list = list.filter(s => s.classId === scope);
    const t = q.trim().toLowerCase();
    if (t) { const terms = t.split(/\s+/); list = list.filter(s => { const hay = `${s.name} ${s.nameBn || ''} ${s.id} ${s.regNo} ${DB.className(s.classId)} ${s.classId}-${s.roll} roll ${s.roll} রোল ${U.bn(s.roll)}`.toLowerCase(); return terms.every(x => hay.includes(x)); }); }
    return list.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 12);
  },
  show(box) {
    const q = box.querySelector('.sp-q').value, list = this.search(box, box.querySelector('input[type=hidden]').value ? '' : q), el = box.querySelector('.sp-list');
    el.innerHTML = (box.dataset.empty ? `<button type="button" class="sp-item w-full text-left px-3 py-2 text-sm hover:bg-brand-50 text-slate-500" data-id="">${esc(box.dataset.empty)}</button>` : '')
      + list.map((s, i) => `<button type="button" class="sp-item w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-brand-50 ${i === 0 ? 'sp-active' : ''}" data-id="${s.id}">${avatar(s, 28)}<span class="min-w-0"><span class="block text-sm font-semibold truncate">${esc(pn(s))}</span><span class="block text-xs text-slate-500">${esc(DB.className(s.classId))}${s.section ? '-' + esc(s.section) : ''} · রোল ${bnNum(s.roll)} · ${s.id}</span></span></button>`).join('')
      + (list.length ? '' : '<div class="px-3 py-3 text-sm text-slate-400">কোনো শিক্ষার্থী মেলেনি।</div>');
    el.classList.remove('hidden');
  },
  pick(box, id) {
    const hid = box.querySelector('input[type=hidden]'), q = box.querySelector('.sp-q'), st = id ? DB.student(id) : null;
    hid.value = id || ''; q.value = st ? `${pn(st)} · ${DB.className(st.classId)} · রোল ${bnNum(st.roll)}` : '';
    box.querySelector('.sp-clear').classList.toggle('hidden', !st); box.querySelector('.sp-list').classList.add('hidden');
    hid.dispatchEvent(new Event('change', { bubbles: true }));
    if (box.dataset.onpick) new Function('id', box.dataset.onpick).call(hid, id);
  },
};
document.addEventListener('input', e => { const box = e.target.closest?.('[data-sp]'); if (box && e.target.classList.contains('sp-q')) { box.querySelector('input[type=hidden]').value = ''; StudentPicker.show(box); } });
document.addEventListener('focusin', e => { const box = e.target.closest?.('[data-sp]'); if (box && e.target.classList.contains('sp-q')) StudentPicker.show(box); });
document.addEventListener('mousedown', e => {
  const item = e.target.closest?.('.sp-item'); if (item) { e.preventDefault(); StudentPicker.pick(item.closest('[data-sp]'), item.dataset.id); return; }
  const clr = e.target.closest?.('.sp-clear'); if (clr) { e.preventDefault(); StudentPicker.pick(clr.closest('[data-sp]'), ''); return; }
  $$('[data-sp] .sp-list:not(.hidden)').forEach(l => { if (!l.parentElement.contains(e.target)) l.classList.add('hidden'); });
});
document.addEventListener('keydown', e => {
  const box = e.target.closest?.('[data-sp]'); if (!box || !e.target.classList.contains('sp-q')) return;
  const items = $$('.sp-item', box), i = items.findIndex(x => x.classList.contains('sp-active'));
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[i]?.classList.remove('sp-active'); items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.classList.add('sp-active'); }
  if (e.key === 'Enter' && !box.querySelector('.sp-list').classList.contains('hidden')) { e.preventDefault(); const a = items[i] || items[0]; if (a) StudentPicker.pick(box, a.dataset.id); }
  if (e.key === 'Escape') box.querySelector('.sp-list').classList.add('hidden');
});
function miniBars(rows, fmt = U.money) {
  const max = Math.max(1, ...rows.flatMap(r => r.values.map(v => v.v)));
  return `<div class="flex items-end gap-2 h-44 pt-4">${rows.map(r => `<div class="flex-1 flex flex-col items-center gap-1 min-w-0"><div class="flex items-end gap-0.5 h-36 w-full justify-center">${r.values.map(v => `<div title="${esc(v.label)}: ${fmt(v.v)}" class="w-1/3 max-w-[18px] rounded-t ${v.cls}" style="height:${Math.max(2, v.v / max * 100)}%"></div>`).join('')}</div><div class="text-[10px] text-slate-500 truncate">${esc(r.label)}</div></div>`).join('')}</div>`;
}
function subjectOptions(selected, ids) { return DB.s.subjects.filter(s => !ids || ids.includes(s.id)).map(s => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${s.name}</option>`).join(''); }
function progressBar(pct, tone) { const c = tone || (pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'); return `<div class="h-2 rounded-full bg-slate-100 overflow-hidden"><div class="h-full ${c}" style="width:${U.clamp(pct, 0, 100)}%"></div></div>`; }
function gpaFmt(g) { return g === null || g === undefined ? '—' : U.bn(g.toFixed(2)); }
/** Number for display in Bangla digits (keeps Indian grouping when `group` is true): bnNum(1250, true) → "১,২৫০". */
function bnNum(n, group) { if (n === null || n === undefined || n === '') return '—'; return U.bn(group && typeof n === 'number' ? n.toLocaleString('en-IN') : n); }

/* ---------- Bangla (বঙ্গাব্দ) and Hijri dates ----------
   U.bnDate(date)    → "১ কার্তিক ১৪৩৩ বঙ্গাব্দ" (opts.parts → { d, m, y, month })
   U.hijriDate(date) → "৫ জমাদিউল আউয়াল ১৪৪৮ হিজরি" (Intl islamic-umalqura when the browser has it, else the tabular calendar)
   U.dateLine(date, place) / U.altDates(date, place) → the calendars switched on for a place in ফিচার ও সেটিংস → তারিখ প্রদর্শন (config.dates) */
Object.assign(U, {
  BN_MONTHS: ['বৈশাখ', 'জ্যৈষ্ঠ', 'আষাঢ়', 'শ্রাবণ', 'ভাদ্র', 'আশ্বিন', 'কার্তিক', 'অগ্রহায়ণ', 'পৌষ', 'মাঘ', 'ফাল্গুন', 'চৈত্র'],
  HIJRI_MONTHS: ['মহররম', 'সফর', 'রবিউল আউয়াল', 'রবিউস সানি', 'জমাদিউল আউয়াল', 'জমাদিউস সানি', 'রজব', 'শাবান', 'রমজান', 'শাওয়াল', 'জিলকদ', 'জিলহজ'],
  /** Revised Bangladesh calendar: 1 Boishakh = 14 April. Month lengths follow the national calendar as revised in
      1426 (2019): Boishakh–Ashwin 31 days, Kartik–Magh and Chaitra 30, Falgun 29 (30 when the Gregorian year it falls
      in is a leap year) — so 21 February = 8 Falgun, 26 March = 12 Chaitra and 16 December = 1 Poush. */
  bnParts(date) {
    const x = U.d(date); if (isNaN(x)) return null;
    const y = x.getFullYear(), start = new Date(x >= new Date(y, 3, 14) ? y : y - 1, 3, 14);
    const gy = start.getFullYear() + 1, leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
    let n = Math.round((new Date(y, x.getMonth(), x.getDate()) - start) / 864e5), m = 0;
    const len = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, leap ? 30 : 29, 30];
    while (m < 11 && n >= len[m]) { n -= len[m]; m++; }
    return { d: n + 1, m, y: start.getFullYear() - 593, month: U.BN_MONTHS[m] };
  },
  bnDate(date, opts = {}) { const p = U.bnParts(date); if (!p) return ''; return opts.parts ? p : `${U.bn(p.d)} ${p.month} ${U.bn(p.y)}${opts.short ? '' : ' বঙ্গাব্দ'}`; },
  _hijriFmt: undefined,
  hijriParts(date) {
    const x = U.d(date); if (isNaN(x)) return null;
    if (U._hijriFmt === undefined) {
      U._hijriFmt = null;
      try { const f = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric' }); if (/islamic/.test(f.resolvedOptions().calendar)) U._hijriFmt = f; } catch (e) { /* tabular below */ }
    }
    if (U._hijriFmt) {
      const p = {}; U._hijriFmt.formatToParts(new Date(x.getFullYear(), x.getMonth(), x.getDate(), 12)).forEach(t => { if (t.type !== 'literal') p[t.type] = parseInt(t.value, 10); });
      if (p.day && p.month && p.year) return { d: p.day, m: p.month - 1, y: p.year, month: U.HIJRI_MONTHS[p.month - 1] };
    }
    // tabular (arithmetical) Islamic calendar, civil epoch 16 July 622
    const jd = Math.floor((Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) / 864e5) + 2440587.5) + 1;
    let l = jd - 1948440 + 10632; const n = Math.floor((l - 1) / 10631); l = l - 10631 * n + 354;
    const j = Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) + Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
    l = l - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
    const m = Math.floor((24 * l) / 709), d = l - Math.floor((709 * m) / 24), y = 30 * n + j - 30;
    return { d, m: m - 1, y, month: U.HIJRI_MONTHS[m - 1] };
  },
  hijriDate(date, opts = {}) { const p = U.hijriParts(date); if (!p) return ''; return opts.parts ? p : `${U.bn(p.d)} ${p.month} ${U.bn(p.y)}${opts.short ? '' : ' হিজরি'}`; },
  /* --- তারিখ প্রদর্শন (ফিচার ও সেটিংস; config.dates) ---
     { order: ['greg', 'bangla', 'hijri'], use: { greg|bangla|hijri: { header, home, notices, calendar, print } }, header: { show, where: 'strip' | 'nav' } }
     A missing value falls back to the defaults below (Hijri on by default for a madrasah). */
  CALS: [['greg', 'ইংরেজি (গ্রেগরিয়ান)'], ['bangla', 'বাংলা (বঙ্গাব্দ)'], ['hijri', 'হিজরি']],
  DATE_PLACES: [['header', 'ওয়েবসাইটের শিরোনাম'], ['home', 'হোমপেজের ক্যালেন্ডার'], ['notices', 'নোটিশ'], ['calendar', 'ক্যালেন্ডার পৃষ্ঠা'], ['print', 'মুদ্রণ ও সনদ']],
  dateCfg() {
    const c = (DB.s.config && DB.s.config.dates) || {}, mad = /madrasah|মাদ্রাসা/i.test(DB.s.school?.type || '');
    const def = { greg: { header: true, home: true, notices: true, calendar: true, print: true }, bangla: { header: true, home: true, notices: false, calendar: true, print: false }, hijri: { header: mad, home: mad, notices: false, calendar: mad, print: false } };
    const order = [...(Array.isArray(c.order) ? c.order : []), 'greg', 'bangla', 'hijri'].filter((k, i, a) => def[k] && a.indexOf(k) === i);
    const use = {}; Object.keys(def).forEach(k => { use[k] = { ...def[k], ...((c.use || {})[k] || {}) }; });
    return { order, use, header: { show: c.header?.show ?? true, where: c.header?.where === 'nav' ? 'nav' : 'strip' } };
  },
  /** One date in every calendar switched on for a place, in the chosen order. */
  dateLine(date, place, weekday) {
    const c = U.dateCfg(), out = c.order.filter(k => c.use[k][place]).map(k => k === 'greg' ? U.fmtDate(U.iso(date)) : k === 'bangla' ? U.bnDate(date) : U.hijriDate(date)).filter(Boolean);
    if (weekday && out.length) out[0] = `${U.dayBn(U.iso(date))}, ${out[0]}`;
    return out;
  },
  /** The Bangla / Hijri dates switched on for a place (the Gregorian date is shown separately there). */
  altDates(date, place = 'calendar') { const c = U.dateCfg(); return c.order.filter(k => k !== 'greg' && c.use[k][place]).map(k => k === 'bangla' ? U.bnDate(date) : U.hijriDate(date)).filter(Boolean); },
  /** Which of Bangla / Hijri a place uses: { bangla, hijri }. */
  altOn(place) { const c = U.dateCfg(); return { bangla: !!c.use.bangla[place], hijri: !!c.use.hijri[place], order: c.order.filter(k => k !== 'greg' && c.use[k][place]) }; },
  /** Where the website header shows the date ('strip' | 'nav'), or null when it does not. */
  headerDate() { const c = U.dateCfg(); return c.header.show && U.dateLine(new Date(), 'header').length ? c.header.where : null; },
});
/** A person's display name — the Bangla name when the record has one. Works for students, users, staff, admissions. */
function pn(p) { if (!p) return ''; if (typeof p === 'string') return p; if (String(p.id || '').startsWith('_P') && !p.name && !p.nameBn) return 'সহপাঠী'; return p.nameBn || p.studentNameBn || p.name || p.studentName || ''; }
/** Bangla label for a value that is STORED in English (statuses, types, methods, days, roles …).
    Use for display only: badge(bn(a.status)) — never compare or save the result. */
const BN_LABELS = {
  Pending: 'অপেক্ষমাণ', Approved: 'অনুমোদিত', Declined: 'প্রত্যাখ্যাত', Rejected: 'প্রত্যাখ্যাত', Selected: 'নির্বাচিত', Waiting: 'অপেক্ষমাণ তালিকা', Draft: 'খসড়া', Enrolled: 'ভর্তিকৃত',
  New: 'নতুন', Shortlisted: 'সংক্ষিপ্ত তালিকাভুক্ত', Interview: 'সাক্ষাৎকার', Hired: 'নিয়োগপ্রাপ্ত', Open: 'চালু', Closed: 'বন্ধ', Cancelled: 'বাতিল', Completed: 'সম্পন্ন', Submitted: 'জমা হয়েছে', Graded: 'মূল্যায়িত',
  Paid: 'পরিশোধিত', Unpaid: 'অপরিশোধিত', Partial: 'আংশিক', paid: 'পরিশোধিত', unpaid: 'অপরিশোধিত', partial: 'আংশিক', approved: 'অনুমোদিত', disbursed: 'বিতরণকৃত', rescheduled: 'পুনঃনির্ধারিত', draft: 'খসড়া',
  active: 'সক্রিয়', inactive: 'নিষ্ক্রিয়', deleted: 'মুছে ফেলা', graduated: 'উত্তীর্ণ', transferred: 'স্থানান্তরিত', planning: 'পরিকল্পনাধীন', closed: 'সমাপ্ত', Active: 'সক্রিয়', Inactive: 'নিষ্ক্রিয়',
  Present: 'উপস্থিত', Absent: 'অনুপস্থিত', Late: 'বিলম্ব', Excused: 'অনুমোদিত ছুটি', P: 'উ', A: 'অ', L: 'বি', E: 'ছু', IN: 'প্রবেশ', OUT: 'প্রস্থান', QR: 'কিউআর / ম্যানুয়াল',
  Online: 'অনলাইন', Offline: 'অফলাইন', Verified: 'যাচাইকৃত', 'In workshop': 'ওয়ার্কশপে',
  Confirmed: 'স্থায়ী', Probation: 'শিক্ষানবিশ', Resigned: 'পদত্যাগকৃত', 'On leave': 'ছুটিতে', 'Full-time': 'পূর্ণকালীন', 'Part-time': 'খণ্ডকালীন', Contract: 'চুক্তিভিত্তিক',
  Ongoing: 'চলমান', Done: 'সম্পন্ন', Revision: 'পুনরালোচনা', Rework: 'পুনঃপাঠদান', 'Not started': 'শুরু হয়নি',
  Morning: 'প্রভাতি', Day: 'দিবা', Evening: 'সান্ধ্য', MORNING: 'প্রভাতি', DAY: 'দিবা', EVENING: 'সান্ধ্য',
  Male: 'পুরুষ', Female: 'মহিলা', Father: 'পিতা', Mother: 'মাতা', 'Legal guardian': 'আইনগত অভিভাবক', Islam: 'ইসলাম', Hinduism: 'হিন্দু', Buddhism: 'বৌদ্ধ', Christianity: 'খ্রিস্টান', Other: 'অন্যান্য', Bangladeshi: 'বাংলাদেশি',
  Cash: 'নগদ', Bank: 'ব্যাংক', Card: 'কার্ড', bKash: 'বিকাশ', Nagad: 'নগদ (এমএফএস)', Rocket: 'রকেট', Waiver: 'মওকুফ', Counter: 'কাউন্টার', Office: 'অফিস', 'Online checkout': 'অনলাইন পরিশোধ', 'Manual TrxID': 'ট্রানজ্যাকশন আইডি', 'Send money + TrxID': 'সেন্ড মানি + ট্রানজ্যাকশন আইডি',
  Public: 'সার্বজনীন ছুটি', School: 'বিদ্যালয়ের ছুটি', Exam: 'পরীক্ষা', Event: 'অনুষ্ঠান', 'Open day': 'খোলা দিন',
  Academic: 'একাডেমিক', Holiday: 'ছুটি', Admission: 'ভর্তি', Fees: 'ফি', General: 'সাধারণ', Urgent: 'জরুরি', Sports: 'ক্রীড়া', Cultural: 'সাংস্কৃতিক',
  Term: 'টার্ম পরীক্ষা', 'Class Test': 'শ্রেণি পরীক্ষা', Annual: 'বার্ষিক', 'Model Test': 'মডেল টেস্ট', Monthly: 'মাসিক', Weekly: 'সাপ্তাহিক', Quarterly: 'ত্রৈমাসিক', Yearly: 'বার্ষিক', Once: 'একবার', 'One-time': 'এককালীন', Recurring: 'নিয়মিত', 'Per term': 'প্রতি টার্ম',
  Asset: 'সম্পদ', Liability: 'দায়', Equity: 'মূলধন', Income: 'আয়', Expense: 'ব্যয়', JV: 'জাবেদা', PV: 'পরিশোধ ভাউচার', RV: 'প্রাপ্তি ভাউচার',
  tuition: 'মাসিক বেতন', fine: 'জরিমানা', installment: 'কিস্তি', transport: 'পরিবহন', hostel: 'ছাত্রাবাস', library: 'গ্রন্থাগার', exam: 'পরীক্ষা ফি', admission: 'ভর্তি ফি', service: 'সেবা ফি', other: 'অন্যান্য',
  Excellent: 'অত্যন্ত ভালো', 'Very Good': 'খুব ভালো', Good: 'ভালো', Satisfactory: 'সন্তোষজনক', 'Needs improvement': 'উন্নতি প্রয়োজন', Outstanding: 'অসাধারণ',
  Commendation: 'প্রশংসা', Disciplinary: 'শৃঙ্খলাজনিত', Medical: 'স্বাস্থ্যগত', Counselor: 'কাউন্সেলর', National: 'জাতীয়', District: 'জেলা', Divisional: 'বিভাগীয়',
  Leave: 'ছুটি', Scholarship: 'বৃত্তি', 'Installment Plan': 'কিস্তি পরিকল্পনা', 'Transfer Certificate': 'ছাড়পত্র', Testimonial: 'প্রশংসাপত্র', 'Character Certificate': 'চারিত্রিক সনদ', 'Transcript Copy': 'ট্রান্সক্রিপ্ট', 'ID Card Replacement': 'আইডি কার্ড প্রতিস্থাপন',
  Casual: 'নৈমিত্তিক ছুটি', Sick: 'অসুস্থতাজনিত ছুটি', Earned: 'অর্জিত ছুটি', Maternity: 'মাতৃত্বকালীন ছুটি',
  Bus: 'বাস', Microbus: 'মাইক্রোবাস', Fingerprint: 'আঙুলের ছাপ', Face: 'মুখাবয়ব', RFID: 'আরএফআইডি', SMS: 'এসএমএস', Email: 'ই-মেইল', Push: 'পুশ', Everyone: 'সকলে',
  Sun: 'রবি', Mon: 'সোম', Tue: 'মঙ্গল', Wed: 'বুধ', Thu: 'বৃহঃ', Fri: 'শুক্র', Sat: 'শনি', Sunday: 'রবিবার', Monday: 'সোমবার', Tuesday: 'মঙ্গলবার', Wednesday: 'বুধবার', Thursday: 'বৃহস্পতিবার', Friday: 'শুক্রবার', Saturday: 'শনিবার',
  MAIN: 'প্রধান', ALL: 'সকল', ADMIN: 'রুট ইউজার', PRINCIPAL: 'অধ্যক্ষ', TEACHER: 'শিক্ষক', STUDENT: 'শিক্ষার্থী', GUARDIAN: 'অভিভাবক', PUBLIC: 'দর্শনার্থী', SYSTEM: 'সিস্টেম',
};
Object.assign(BN_LABELS, {
  Cash: 'নগদ অর্থ', Nagad: 'নগদ', Website: 'ওয়েবসাইট', Delivered: 'পৌঁছেছে', Sent: 'পাঠানো হয়েছে', Queued: 'সারিতে আছে', 'Queued (gateway off)': 'সারিতে আছে (গেটওয়ে বন্ধ)',
  Principal: 'অধ্যক্ষ', None: 'নেই', 'Needs Improvement': 'উন্নতি প্রয়োজন', Teacher: 'শিক্ষক', Staff: 'কর্মী', Guardian: 'অভিভাবক', Campus: 'ক্যাম্পাস',
  'Birth Registration': 'জন্মনিবন্ধন সনদ', 'Father NID': 'পিতার জাতীয় পরিচয়পত্র', 'Mother NID': 'মাতার জাতীয় পরিচয়পত্র', 'Student Photo': 'শিক্ষার্থীর ছবি', 'Previous Marksheet': 'পূর্ববর্তী নম্বরপত্র',
  'Automated daily (cloud)': 'স্বয়ংক্রিয় দৈনিক (ক্লাউড)', 'Scheduled nightly': 'নির্ধারিত রাত্রিকালীন', 'Manual export': 'ম্যানুয়াল এক্সপোর্ট', Downloaded: 'ডাউনলোডকৃত', Restored: 'পুনরুদ্ধারকৃত',
  'Off-road': 'চলাচল বন্ধ', Textbook: 'পাঠ্যপুস্তক', 'Bangla Literature': 'বাংলা সাহিত্য', 'History & Liberation War': 'ইতিহাস ও মুক্তিযুদ্ধ', 'English Fiction': 'ইংরেজি কথাসাহিত্য', Science: 'বিজ্ঞান', Reference: 'তথ্যসূত্র', Children: 'শিশুতোষ',
  'Administrative Staff': 'প্রশাসনিক কর্মী', Accountant: 'হিসাবরক্ষক', Librarian: 'গ্রন্থাগারিক', Driver: 'গাড়িচালক', 'Transport Helper': 'পরিবহন সহকারী', 'Office Assistant': 'অফিস সহকারী', 'Security Guard': 'নিরাপত্তাকর্মী', Nurse: 'নার্স', Cleaner: 'পরিচ্ছন্নতাকর্মী', 'Hostel Warden': 'ছাত্রাবাস তত্ত্বাবধায়ক', Cook: 'রাঁধুনি',
  'Reconciled (statement)': 'মিলিয়ে দেখা (বিবরণী)', 'Card scan': 'কার্ড স্ক্যান', Manual: 'হাতে লিখিত', Gate: 'গেট',
  'Weekly Assessment': 'সাপ্তাহিক মূল্যায়ন', Tutorial: 'টিউটোরিয়াল', Practical: 'ব্যবহারিক', Semester: 'সেমিস্টার', 'Term Final': 'টার্ম সমাপনী', Duty: 'দাপ্তরিক দায়িত্ব',
  Notes: 'নোট', Worksheet: 'কার্যপত্র', Syllabus: 'পাঠ্যসূচি', 'Lab Manual': 'ব্যবহারিক নির্দেশিকা', Slides: 'স্লাইড', 'Past Paper': 'বিগত বছরের প্রশ্নপত্র', Link: 'লিংক', Image: 'ছবি', Audio: 'অডিও', Video: 'ভিডিও', PDF: 'পিডিএফ',
  'GPA 5.00 (NCTB)': 'জিপিএ ৫.০০ (এনসিটিবি)', 'CGPA 4.00': 'সিজিপিএ ৪.০০', 'Letter-only (no GPA)': 'কেবল লেটার গ্রেড (জিপিএ নেই)',
  Humanities: 'মানবিক', Commerce: 'ব্যবসায় শিক্ষা', 'Business Studies': 'ব্যবসায় শিক্ষা', 'Physical Education': 'শারীরিক শিক্ষা', Primary: 'প্রাথমিক', Administration: 'প্রশাসন', Unassigned: 'অনির্ধারিত',
  'Assistant Teacher': 'সহকারী শিক্ষক', 'Senior Teacher': 'জ্যেষ্ঠ শিক্ষক', Lecturer: 'প্রভাষক', 'Per late invoice': 'প্রতিটি বিলম্বিত বিলে', 'Unexpected absence': 'আকস্মিক অনুপস্থিতি', 'Sudden illness': 'আকস্মিক অসুস্থতা',
  Promote: 'উত্তীর্ণ', Retain: 'পুনরায় একই শ্রেণি', Graduate: 'সমাপনী', Matched: 'মিলেছে', 'Amount mismatch': 'পরিমাণে অমিল', Unclaimed: 'দাবিহীন', 'Missing on statement': 'বিবরণীতে নেই',
});
/* semester / supplementary (js/modules/semester.js) */
Object.assign(BN_LABELS, { annual: 'বার্ষিক', semester: 'সেমিস্টার', trimester: 'ট্রাইমেস্টার', term: 'টার্ম', Supplementary: 'সাপ্লিমেন্টারি', regular: 'নিয়মিত', retake: 'রিটেক', improvement: 'মানোন্নয়ন', registered: 'নিবন্ধিত', dropped: 'বাদ দেওয়া', cancelled: 'বাতিল' });
function bn(v) { if (v === null || v === undefined) return ''; const s = String(v); return BN_LABELS[s] ?? s; }
/* QR + barcode (libraries degrade to a labelled placeholder if the CDN is unreachable) */
function qr(text, px = 96) {
  try { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 2, margin: 0, scalable: true }).replace('<svg ', `<svg style="width:${px}px;height:${px}px;display:block" `); }
  catch (e) { return `<div style="width:${px}px;height:${px}px" class="border border-dashed border-slate-400 flex items-center justify-center text-[9px] text-slate-500 text-center p-1">কিউআর<br>${esc(text.slice(-12))}</div>`; }
}
function barcode(text, { height = 30, width = 1.2, fontSize = 10, displayValue = true } = {}) {
  try { const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); JsBarcode(el, text, { format: 'CODE128', height, width, fontSize, displayValue, margin: 0, background: 'transparent' }); el.setAttribute('class', 'barcode'); return el.outerHTML; }
  catch (e) { return `<div class="font-mono text-[10px] tracking-widest">|||| ${esc(text)} ||||</div>`; }
}
function verifyUrl(type, code) { return `${location.origin}${App.href('public', 'verify')}?type=${encodeURIComponent(type)}&code=${encodeURIComponent(code)}`; }
function downloadFile(name, content, type = 'application/json') {
  if (App.session && App.currentModule() && !App.perm(App.currentModule(), 'export')) return toast('এই মডিউল থেকে রপ্তানি করার অনুমতি আপনার ভূমিকার নেই।', 'error');
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
/** Read an uploaded image and downscale it to keep the saved data small. PDFs are stored as-is if < 1.5 MB. */
function readUpload(file, maxDim = 1400) {
  return new Promise((resolve, reject) => {
    if (file.type === 'application/pdf') {
      if (file.size > 1.5e6) return reject(new Error('পিডিএফ ফাইলটি অনেক বড় — সর্বোচ্চ ১.৫ এমবি গ্রহণযোগ্য।'));
      const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = reject; fr.readAsDataURL(file); return;
    }
    if (!file.type.startsWith('image/')) return reject(new Error('শুধু ছবি (JPG/PNG) অথবা পিডিএফ ফাইল গ্রহণযোগ্য।'));
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, maxDim / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.78));
    };
    img.onerror = () => reject(new Error('ছবিটি পড়া যায়নি।'));
    img.src = url;
  });
}
/* ---------- toast ---------- */
function toast(msg, type = 'ok') {
  const tones = { ok: 'bg-slate-900 text-white', success: 'bg-emerald-600 text-white', warn: 'bg-amber-500 text-white', error: 'bg-red-600 text-white' };
  const el = document.createElement('div');
  el.className = `pointer-events-auto fade-in max-w-sm rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${tones[type] || tones.ok}`;
  el.textContent = campusText(msg);
  $('#toast-root').appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3400);
}
/* ---------- modal ---------- */
/* Small dialogs (sm/md) stay pop-ups. Large ones (lg/xl/full) inside a dashboard open IN PLACE as a
   detail page with breadcrumbs and a back button (App.openDetail) — pass {popup:true} to force a pop-up. */
const Modal = {
  isPopup() { return !!$('#modal-root').innerHTML; },
  open({ title, body, size = 'md', footer = '', onClose, popup } = {}) {
    const inDash = App.session && App.portals[App.route.portal]?.layout !== 'site' && $('#page-host');
    if (!popup && inDash && ['lg', 'xl', 'full'].includes(size)) {
      $('#modal-root').innerHTML = '';
      App.openDetail({ title: String(title).replace(/<[^>]+>/g, ''), static: true, onClose,
        html: `<div class="card"><div class="p-5" id="modal-body">${body}</div>${footer ? `<div class="px-5 py-3 border-t border-slate-100 flex flex-wrap justify-end gap-2" id="modal-footer">${footer}</div>` : ''}</div>` });
      return $('#page-host #modal-body');
    }
    const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl', full: 'max-w-7xl' }[size];
    this._onClose = onClose;
    $('#modal-root').innerHTML = `
      <div class="fixed inset-0 z-[80] flex items-start sm:items-center justify-center p-2 sm:p-6 bg-slate-900/50 backdrop-blur-sm overflow-y-auto" data-modal-backdrop>
        <div class="card w-full ${w} fade-in my-auto shadow-2xl" role="dialog" aria-modal="true">
          <div class="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-100">
            <h3 class="font-bold text-slate-900 text-base">${title}</h3>
            <button class="p-1.5 rounded-lg hover:bg-slate-100" onclick="Modal.close()" aria-label="বন্ধ করুন">${icon('x')}</button>
          </div>
          <div class="p-5" id="modal-body">${body}</div>
          ${footer ? `<div class="px-5 py-3 border-t border-slate-100 flex flex-wrap justify-end gap-2" id="modal-footer">${footer}</div>` : ''}
        </div>
      </div>`;
    $('[data-modal-backdrop]').addEventListener('mousedown', e => { if (e.target.hasAttribute('data-modal-backdrop')) Modal.close(); });
    App.icons();
    return $('#modal-body');
  },
  body(html) { const el = $('#modal-root #modal-body') || $('#page-host #modal-body'); if (el) el.innerHTML = html; App.icons(); },
  /** Closes the pop-up if one is open; otherwise steps back out of an in-place detail page. */
  close() {
    if (this.isPopup()) { $('#modal-root').innerHTML = ''; const f = this._onClose; this._onClose = null; if (f) f(); return; }
    if (App.details.length) App.closeDetail();
  },
};
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#modal-root').innerHTML) Modal.close(); });
/* ==========================================================================
   THEME — Bangladesh-green defaults; colours, fonts and sizes are configurable
   (Root User / Principal → Branding & Theme). Tailwind's `brand-*` palette reads
   these CSS variables, so the whole UI re-skins instantly.
   ========================================================================== */
const FONT_OPTIONS = ['Inter', 'Roboto', 'Poppins', 'Noto Sans', 'Hind Siliguri', 'Noto Sans Bengali', 'Source Serif 4', 'Merriweather', 'Tiro Bangla', 'Noto Serif Bengali'];
const Theme = {
  hexToRgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; },
  mix(a, b, t) { return a.map((v, i) => Math.round(v + (b[i] - v) * t)); },
  hex(rgb) { return '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join(''); },
  apply(t = DB.s.theme) {
    const base = this.hexToRgb(t.primary || '#006a4e'), W = [255, 255, 255], K = [0, 0, 0];
    const shades = { 50: this.mix(base, W, .93), 100: this.mix(base, W, .85), 200: this.mix(base, W, .7), 300: this.mix(base, W, .5), 400: this.mix(base, W, .3), 500: this.mix(base, W, .12), 600: base, 700: this.mix(base, K, .15), 800: this.mix(base, K, .3), 900: this.mix(base, K, .45), 950: this.mix(base, K, .62) };
    const root = document.documentElement.style;
    Object.entries(shades).forEach(([k, v]) => root.setProperty(`--b${k}`, v.join(' ')));
    root.setProperty('--brand', this.hex(base)); root.setProperty('--brand-700', this.hex(shades[700])); root.setProperty('--brand-ink', this.hex(shades[950])); root.setProperty('--brand-50', this.hex(shades[50]));
    root.setProperty('--accent', t.accent || '#f42a41');
    root.setProperty('--surface', t.surface || '#f6f8f7');
    root.setProperty('--font-sans', `"${t.bnFont || 'Noto Serif Bengali'}", "${t.font || 'Inter'}", system-ui, sans-serif`);   // Bangla interface: Bangla font first
    root.setProperty('--font-heading', `"${t.bnFont || 'Noto Serif Bengali'}", "${t.headingFont || 'Source Serif 4'}", Georgia, serif`);
    root.setProperty('--radius', (t.radius ?? 10) + 'px');
    root.fontSize = (t.baseSize || 15) + 'px';
    this.sidebar(t, shades, root);
    if (typeof A11y !== 'undefined') A11y.apply();   // visitor's text size / theme mode on top of the institution theme
  },
  /** Sidebar palette: 'page' (same as the page background — default), 'brand', 'dark' or 'custom' (any colour; text contrast is automatic). */
  sidebar(t, shades, root) {
    const mode = t.sidebar || 'page';
    const bg = mode === 'brand' ? this.hex(shades[950]) : mode === 'dark' ? '#0f172a' : mode === 'custom' ? (t.sidebarBg || '#ffffff') : (t.surface || '#f6f8f7');
    const [r, g, b] = this.hexToRgb(bg), lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255, dark = lum < 0.55;
    const v = dark
      ? { fg: 'rgba(255,255,255,.78)', strong: '#ffffff', muted: 'rgba(255,255,255,.55)', hover: 'rgba(255,255,255,.08)', active: 'rgba(255,255,255,.14)', activeFg: '#ffffff', border: 'rgba(255,255,255,.12)', bar: '#ffffff', input: 'rgba(255,255,255,.08)', hit: 'rgba(250,204,21,.35)' }
      : { fg: '#334155', strong: '#0f172a', muted: '#64748b', hover: 'rgba(15,23,42,.05)', active: this.hex(shades[50]), activeFg: this.hex(shades[700]), border: '#e2e8f0', bar: this.hex(shades[600]), input: '#ffffff', hit: this.hex(shades[200]) };
    root.setProperty('--sb-bg', bg);
    Object.entries(v).forEach(([k, x]) => root.setProperty('--sb-' + k.replace(/[A-Z]/g, m => '-' + m.toLowerCase()), x));
  },
};
/** Institution logo: uploaded image, or a monogram on brand colour. */
function logoHtml(size = 40) {
  const s = DB.s.school;
  return s.logo ? `<img src="${s.logo}" alt="" style="width:${size}px;height:${size}px;object-fit:contain">`
    : `<span class="inline-flex items-center justify-center rounded-full text-white font-extrabold shrink-0" style="width:${size}px;height:${size}px;background:var(--brand);box-shadow:0 0 0 3px #fff, 0 0 0 4px var(--accent);font-size:${Math.round(size * .34)}px">${esc(s.shortName.slice(0, 3))}</span>`;
}
/* ==========================================================================
   APP
   ========================================================================== */
const App = {
  portals: {},
  session: null,          // { userId, role }
  route: { portal: 'public', page: 'home', query: {} },
  ui: {},                 // per-page transient UI state
  register(id, def) { this.portals[id] = { id, ...def }; },
  /** Feature modules plug extra pages into an existing portal, optionally right after `afterId`. */
  addPage(portalId, page, afterId) {
    const pages = this.portals[portalId].pages;
    const i = afterId ? pages.findIndex(p => p.id === afterId) : -1;
    i >= 0 ? pages.splice(i + 1, 0, page) : pages.push(page);
  },
  setCampus(id) {
    if (!this.session) return;
    this.session.campus = id; this.persistSession(); this.ui = { ...this.ui, rtCls: null, id: null, ad: null, sp: null, dos: null };
    DB.audit('CAMPUS_SWITCH', 'session', `সক্রিয় ক্যাম্পাস → ${DB.campus(id).name}`); DB.save();
    toast(`${DB.campus(id).name}-এ পরিবর্তন করা হয়েছে`); this.render();
  },
  boot() {
    DB.load();
    Theme.apply();
    try { this.session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { this.session = null; }
    if (this.session?.role === 'SUPERADMIN') this.session.role = 'ADMIN';
    if (this.session && !DB.user(this.session.userId)) this.session = null;
    // Server mode: the dashboard opens only for the account the server session belongs to.
    if (DB.remote.on && this.session && this.session.userId !== DB.remote.userId) { this.session = null; this.persistSession(); }
    // Automated SMS payment reminders, at most once per day.
    if (DB.s.featureFlags.autoReminders && DB.s.meta.lastReminderRun !== U.today()) { DB.runReminders(); DB.save(); }
    // clean History-API URLs; old #/portal/page links are converted in place
    if (location.hash.startsWith('#/')) { try { history.replaceState(history.state, '', this.clean(location.hash)); } catch (e) { } }
    window.addEventListener('popstate', () => { if (this.loc() !== this._renderedHash) this.render(); });
    window.addEventListener('hashchange', () => { if (location.hash.startsWith('#/')) { try { history.replaceState(history.state, '', this.clean(location.hash)); } catch (e) { } this.render(); } });
    // same-origin <a href> navigate inside the app (no full page reload)
    document.addEventListener('click', e => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.('a[href]'); if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const raw = a.getAttribute('href') || ''; if (!raw || (raw.startsWith('#') && !raw.startsWith('#/'))) return;
      let u; try { u = new URL(this.clean(raw), location.href); } catch (err) { return; }
      if (u.origin !== location.origin || /^\/(api|css|js)(\/|$)/.test(u.pathname) || /\.[A-Za-z0-9]{1,8}$/.test(u.pathname)) return;
      e.preventDefault(); this.nav(u.pathname + u.search);
    });
    // which fields the user changed since the last render (kept across in-place refreshes)
    document.addEventListener('input', e => { if (e.target.matches?.('input, textarea, select')) { e.target.dataset.dirty = '1'; this._typedAt = Date.now(); } }, true);
    document.addEventListener('submit', e => { e.target.querySelectorAll?.('[data-dirty]').forEach(x => delete x.dataset.dirty); }, true);
    this.render();
  },
  /* --- session & roles --- */
  user() { return this.session ? DB.user(this.session.userId) : null; },
  roles() { return this.session ? DB.roles(this.session.userId) : []; },
  has(role) { return this.roles().includes(role === 'SUPERADMIN' ? 'ADMIN' : role); },   // legacy SUPERADMIN checks map to the merged Root User role
  /** Permission matrix. The Root User (ADMIN) holds every system permission, including provisioning Principals. */
  can(perm) {
    const r = this.roles();
    const matrix = {
      'provision.root': ['ADMIN'],
      'provision.teacher': ['PRINCIPAL'],
      'admissions.decide': ['PRINCIPAL'],
      'roles.bind': ['SUPERADMIN', 'ADMIN'],
      'credentials.reset': ['SUPERADMIN', 'ADMIN'],
      'ledger.post': ['SUPERADMIN', 'ADMIN'],
      'payroll.run': ['SUPERADMIN', 'ADMIN'],
    };
    if (r.includes('ADMIN')) return true;   // Root User = every feature, the Principal's included (server/access.js: root is all-access)
    return (matrix[perm] || []).some(x => r.includes(x));
  },
  /** RBAC check for the active role (Root User → Roles & Permissions). The Root User always has every permission. */
  perm(module, action = 'view') { if (!this.session) return action === 'view' && !module; if (this.session.role === 'ADMIN' && this.has('ADMIN')) return true; return DB.perm(this.session.role, module, action); },
  /** Page availability = its feature flag is on AND the active role may view its module. */
  pageOk(page) {
    if (page.flag && DB.s.featureFlags[page.flag] === false) return false;
    if (page.when && !page.when()) return false;
    if (this.route.portal === 'public' || !this.session) return true;
    return !page.module || this.perm(page.module, 'view');
  },
  currentModule() { const p = this.portals[this.route.portal]?.pages.find(x => x.id === this.route.page); return p?.module || null; },
  persistSession() { try { this.session ? localStorage.setItem(SESSION_KEY, JSON.stringify(this.session)) : localStorage.removeItem(SESSION_KEY); } catch (e) { } },
  login(userId) {
    const u = DB.user(userId);
    if (!u || !u.active) return toast('অ্যাকাউন্টটি নিষ্ক্রিয় করা হয়েছে।', 'error');
    const roles = DB.roles(userId);
    const pref = ['SUPERADMIN', 'ADMIN', 'PRINCIPAL', 'TEACHER', 'GUARDIAN', 'STUDENT'].find(r => roles.includes(r)) || roles.find(r => ROLES[r]);   // custom user types too
    this.session = { userId, role: pref, campus: DB.teacherByUser(userId)?.campusId || (DB.s.campuses.some(c => c.id === DB.s.school.defaultCampusId) ? DB.s.school.defaultCampusId : DB.s.campuses[0]?.id || 'MAIN') };
    this.persistSession();
    DB.audit('LOGIN', 'session', `${u.username} লগইন করেছেন (ভূমিকা: ${roles.map(bn).join(', ')})`);
    DB.save();
    Modal.close();
    toast(`স্বাগতম, ${pn(u)}`, 'success');
    this.go(ROLES[pref].portal);
  },
  logout() {
    if (this.session) { DB.audit('LOGOUT', 'session', `${this.user()?.username} লগআউট করেছেন`); DB.save(); }
    this.session = null; this.persistSession(); this.ui = {};
    this.go('public', 'home');
  },
  /** Switch workspace without logging out. Session + per-page UI state survive. */
  switchMode(mode) {
    if (mode === 'PUBLIC') return this.go('public', 'home');
    if (!this.has(mode)) return toast('এই ভূমিকাটি আপনার অ্যাকাউন্টে যুক্ত নেই।', 'error');
    this.session.role = mode; this.persistSession();
    DB.audit('ROLE_SWITCH', 'session', `সক্রিয় ড্যাশবোর্ড → ${bn(mode)}`); DB.save();
    this.go(ROLES[mode].portal);
  },
  /* --- routing --- */
  go(portal, page, query) {
    const p = this.portals[portal];
    page = page || (p && p.pages[0].id);
    const q = query ? '?' + new URLSearchParams(query).toString() : '';
    this.nav(this.href(portal, page) + q);
  },
  /** Go to an in-app address ('/results', '/admin/database?tab=x', or a legacy '#/…'). */
  nav(url, replace) {
    url = this.clean(url);
    if (url !== this.loc()) { try { replace ? history.replaceState(history.state, '', url) : history.pushState(null, '', url); } catch (e) { location.href = url; return; } }
    this.render();
  },
  /** Current address (path + query) — what render() last drew is kept in _renderedHash. */
  loc() { return location.pathname + location.search; },
  /** Change the address bar only (no render). */
  replaceUrl(url) { try { history.replaceState(history.state, '', this.clean(url)); this._renderedHash = this.loc(); } catch (e) { } },
  _portal(seg) { return this.portals[seg] || Object.values(this.portals).find(p => p.slug && p.slug === seg) || null; },
  _page(P, seg) { return P && seg ? P.pages.find(p => p.id === seg) || P.pages.find(p => p.slug && p.slug === seg) || null : null; },
  /** Legacy '#/portal/page?q' → clean path; anything else unchanged. */
  clean(u) {
    u = String(u || '');
    const m = u.match(/^(?:[^#]*)#\/(.*)$/); if (!m) return u;
    const [path, qs] = m[1].split('?'), [portal = 'public', page] = path.split('/'), q = qs ? '?' + qs : '';
    if (portal === 'print') return `/print/${page || ''}${q}`;
    return this.href(portal, page) + q;
  },
  /** URL of a page — public: /<slug> (home = /); dashboards: /<portal prefix>/<slug>. Custom slugs from Settings → Menus & URLs. */
  href(portal, page) {
    const P = this._portal(portal), pg = this._page(P, page);
    if (!P || P.id === 'public') { if (!page || page === 'home' || pg?.id === 'home') return '/'; return '/' + encodeURIComponent(pg ? pg.slug || pg.id : page); }
    const first = page ? null : P.pages.find(p => !p.hidden) || P.pages[0];   // always two segments: /teacher alone is the public teacher page
    return `/${P.slug || P.id}/${String(pg ? pg.slug || pg.id : first ? first.slug || first.id : page).split('/').map(encodeURIComponent).join('/')}`;
  },
  parse() {
    let segs = []; try { segs = location.pathname.split('/').filter(Boolean).map(decodeURIComponent); } catch (e) { }
    const query = Object.fromEntries(new URLSearchParams(location.search));
    if (!segs.length) return { portal: 'public', page: 'home', query };
    if (segs[0] === 'print') return { portal: 'print', page: segs[1], query };
    const P = this._portal(segs[0]);
    // one segment: a public page first (e.g. /teacher?id=…), else that dashboard's first page
    if (segs.length === 1) return P && P.id !== 'public' && (location.pathname.endsWith('/') || !this._page(this.portals.public, segs[0])) ? { portal: P.id, page: undefined, query } : { portal: 'public', page: P?.id === 'public' ? 'home' : segs[0], query };
    // nested page slugs (/principal/settings/basic): a page whose slug has a slash
    if (P && segs.length > 2) { const deep = this._page(P, segs.slice(1).join('/')); if (deep) return { portal: P.id, page: deep.id, query }; }
    if (P) return { portal: P.id, page: segs[1], query };
    return { portal: 'public', page: segs[0], query };
  },
  /** Which of the user's roles grants access to a portal (null = no access). */
  roleForPortal(portal) {
    if (portal === 'public') return 'PUBLIC';
    const r = this.roles();
    if (this.session && ROLES[this.session.role]?.portal === portal && r.includes(this.session.role)) return this.session.role;
    // the Root User may also open the Principal's dashboard (links that name it keep working)
    return r.find(x => ROLES[x]?.portal === portal) || (portal === 'principal' && r.includes('ADMIN') ? 'ADMIN' : null);
  },
  /* --- In-place detail pages (instead of pop-ups) with breadcrumbs + back stack ---
     d = { title, render() → html, mount(), actions?: html }  — re-renderable (kept in the stack)
       | { title, static: true, html, onClose }              — from Modal.open (replaced by the next detail) */
  details: [],
  openDetail(d) {
    if (!$('#page-host')) { const h = d.static ? d.html : d.render(); Modal.open({ title: d.title, body: h, size: 'xl', popup: true }); d.mount?.(); return; }
    if (this.details.length && this.details[this.details.length - 1].static) this.details.pop();
    this.details.push(d); this.showDetail(true);
  },
  showDetail(top) {
    const d = this.details[this.details.length - 1], host = $('#page-host'); if (!d || !host) return;
    const y = window.scrollY;
    if (top) this.navAnim();
    const keep = top ? null : this.keepUi(host);
    host.innerHTML = this.crumbs() + `<div class="fade-in">${d.static ? d.html : d.render()}</div>`;
    const school = DB.s.school.nameBn || DB.s.school.name; document.title = `${String(d.title).replace(/<[^>]+>/g, '')} — ${school}`;
    if (!d.static) { try { d.mount?.(); } catch (e) { console.error(e); } }
    this.icons(); keep?.(); window.scrollTo(0, top ? 0 : y);
  },
  closeDetail(toIndex) {
    const d = toIndex === undefined ? this.details.pop() : null;
    if (toIndex !== undefined) this.details.length = Math.max(0, toIndex);
    if (d?.onClose) d.onClose();
    if (this.details.length && !this.details[this.details.length - 1].static) this.showDetail(true);
    else { this.details = []; this.refreshPage(); window.scrollTo(0, 0); }
  },
  crumbs() {
    const portal = this.portals[this.route.portal], page = portal.pages.find(p => p.id === this.route.page);
    const parts = [`<button class="crumb" onclick="App.closeDetail(0)">${esc(page?.label || portal.title)}</button>`]
      .concat(this.details.map((d, i) => i === this.details.length - 1 ? `<span class="crumb-cur">${esc(d.title)}</span>` : `<button class="crumb" onclick="App.closeDetail(${i + 1})">${esc(d.title)}</button>`));
    const top = this.details[this.details.length - 1];
    return `<div class="flex flex-wrap items-center gap-2 mb-4"><button class="btn btn-ghost btn-sm" onclick="App.closeDetail()" title="ফিরে যান">${icon('arrow-left')} ফিরে যান</button>
      <nav class="flex flex-wrap items-center gap-1 text-sm text-slate-500" aria-label="পথনির্দেশিকা"><span class="text-slate-400">${esc(portal.title)}</span>${parts.map(p => `<span class="text-slate-300">›</span>${p}`).join('')}</nav>${top?.actions ? `<div class="ml-auto flex flex-wrap gap-2">${top.actions}</div>` : ''}</div>`;
  },
  render() {
    const prev = this.route;
    this._renderedHash = this.loc();
    this.details = [];
    this.navAnim();
    this.trackHistory();
    const route = this.parse();
    // stable print view (/print/<id>, js/print.js): a full page of its own, outside every portal
    if (route.portal === 'print' && typeof Print !== 'undefined' && Print.route) { try { Print.route(route.page); } catch (e) { console.error(e); $('#view').innerHTML = `<div class="card p-6 text-red-600">প্রদর্শন ত্রুটি: ${esc(e.message)}</div>`; } window.scrollTo(0, 0); return; }
    const portal =this.portals[route.portal] || Object.values(this.portals).find(p => p.slug && p.slug === route.portal) || this.portals.public;
    route.portal = portal.id;
    const bySlug = portal.pages.find(p => p.id === route.page) || portal.pages.find(p => p.slug && p.slug === route.page);
    if (bySlug) route.page = bySlug.id;
    this.route = route;
    const okPages = portal.pages.filter(p => this.pageOk(p));
    route.page = okPages.find(p => p.id === route.page) ? route.page : (okPages[0] || portal.pages[0]).id;
    const grant = this.roleForPortal(portal.id);
    if (portal.id !== 'public' && this.session && grant && this.session.role !== grant) { this.session.role = grant; this.persistSession(); }
    this.renderTopbar();
    const view = $('#view');
    if (portal.id !== 'public' && !this.session) {
      view.innerHTML = this.gate('লগইন করা আবশ্যক', 'এই ড্যাশবোর্ডটি শুধু অনুমোদিত অ্যাকাউন্টের জন্য সংরক্ষিত।', true);
    } else if (portal.id !== 'public' && !grant) {
      DB.audit('ACCESS_DENIED', portal.id, `${portal.id}/${route.page} খোলার চেষ্টা করা হয়েছে`); DB.save();
      view.innerHTML = this.gate('প্রবেশাধিকার নেই', `${esc(portal.title)}-এর জন্য আপনার অ্যাকাউন্টে কোনো ভূমিকা যুক্ত নেই। একটি ভূমিকা যুক্ত করতে রুট ব্যবহারকারীকে অনুরোধ করুন।`, false);
    } else {
      const page = portal.pages.find(p => p.id === route.page);
      let html;
      try { html = page.render(route.query); } catch (e) { console.error(e); html = `<div class="card p-6 text-red-600">প্রদর্শন ত্রুটি: ${esc(e.message)}</div>`; }
      const sbTop = $('#sb-nav')?.scrollTop || 0;   // keep the sidebar menu where the user left it
      view.innerHTML = portal.layout === 'site' ? html : this.shell(portal, html);
      const sb = $('#sb-nav');
      if (sb) { sb.scrollTop = sbTop; const a = sb.querySelector('.nav-link.active'); if (a) { const r = a.getBoundingClientRect(), s = sb.getBoundingClientRect(); if (r.top < s.top || r.bottom > s.bottom) a.scrollIntoView({ block: 'nearest' }); } }
      try { page.mount && page.mount(route.query); } catch (e) { console.error(e); }
    }
    if (prev.portal !== route.portal || prev.page !== route.page) window.scrollTo(0, 0);
    // dynamic <title>: page — school (Bangla name first)
    const pg = portal.pages.find(p => p.id === route.page), school = DB.s.school.nameBn || DB.s.school.name;
    document.title = route.page === 'home' && portal.id === 'public' ? school : `${pg?.label || ''} — ${school}`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', [school, DB.s.school.mottoBn || DB.s.school.motto].filter(Boolean).join(' — '));
    this.icons();
  },
  /** Re-render only the current page (keeps topbar + scroll position). */
  refresh() {
    const here = this.loc();
    if (here.startsWith('/print/') && here === this._renderedHash) return;   // the print view keeps the document it shows
    if (here !== this._renderedHash || !$('#page-host') && this.portals[this.route.portal].layout !== 'site') return this.render();
    // Inside an in-place detail: re-render that detail (static details from pop-up forms keep their DOM).
    if (this.details.length) { if (!this.details[this.details.length - 1].static) this.showDetail(false); return; }
    this.refreshPage();
  },
  refreshPage() {
    const y = window.scrollY;
    const portal = this.portals[this.route.portal];
    const page = portal.pages.find(p => p.id === this.route.page);
    const html = page.render(this.route.query);
    const host = portal.layout === 'site' ? $('#view') : $('#page-host');
    const keep = this.keepUi(host);
    host.innerHTML = html;
    try { page.mount && page.mount(this.route.query); } catch (e) { console.error(e); }
    this.icons(); keep(); window.scrollTo(0, y);
  },
  /** Page content fades in only on real navigation. */
  navAnim() {
    const H = document.documentElement; H.classList.add('nav-anim');
    clearTimeout(this._navT); this._navT = setTimeout(() => H.classList.remove('nav-anim'), 260);
  },
  /** Before an in-place re-render: remember focus, caret, selection, typed values, open <details> and inner scroll
      positions inside `host`; the returned function puts them back on the new DOM. */
  keepUi(host) {
    clearTimeout(this._navT); document.documentElement.classList.remove('nav-anim');
    if (!host) return () => { };
    const sel = 'input, textarea, select, details, [data-keep-scroll], .overflow-auto, .overflow-x-auto, .overflow-y-auto';
    const all = [...host.querySelectorAll(sel)];
    const keyOf = (el, list) => {
      if (el.id) return '#' + el.id;
      const f = el.form?.id || el.closest('form')?.id || '', nm = el.getAttribute('name');
      if (nm) { const same = list.filter(x => x.tagName === el.tagName && x.getAttribute('name') === nm && (x.form?.id || x.closest('form')?.id || '') === f); return `${el.tagName}|${f}|${nm}|${same.indexOf(el)}`; }
      return `${el.tagName}|${el.className}|${list.filter(x => x.tagName === el.tagName && x.className === el.className).indexOf(el)}`;
    };
    const act = document.activeElement, saved = [];
    all.forEach(el => {
      const s = { k: keyOf(el, all) };
      if (el.tagName === 'DETAILS') s.open = el.open;
      if (el.scrollLeft || el.scrollTop) { s.sl = el.scrollLeft; s.st = el.scrollTop; }
      // typed values survive only background refreshes (sync pull); a user action's own refresh shows the saved state
      if (this._bgRefresh && el.dataset.dirty && el.type !== 'file') { s.v = el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value; }
      if (el === act) { s.focus = true; try { s.a = el.selectionStart; s.b = el.selectionEnd; s.dir = el.selectionDirection; } catch (e) { } }
      if (s.open !== undefined || s.sl !== undefined || s.v !== undefined || s.focus) saved.push(s);
    });
    return () => {
      if (!saved.length) return;
      const now = [...host.querySelectorAll(sel)], map = new Map(now.map(el => [keyOf(el, now), el]));
      saved.forEach(s => {
        const el = map.get(s.k); if (!el) return;
        if (s.open !== undefined && el.tagName === 'DETAILS') el.open = s.open;
        if (s.sl !== undefined) { el.scrollLeft = s.sl; el.scrollTop = s.st; }
        if (s.v !== undefined) { if (typeof s.v === 'boolean') el.checked = s.v; else if (el.value !== s.v) el.value = s.v; if (el.value === s.v || typeof s.v === 'boolean') el.dataset.dirty = '1'; }
        if (s.focus) { try { el.focus({ preventScroll: true }); if (s.a != null) el.setSelectionRange(s.a, s.b, s.dir); } catch (e) { } }
      });
    };
  },
  icons() { try { window.lucide && lucide.createIcons(); } catch (e) { } },
  gate(title, msg, showLogin) {
    return `<div class="min-h-[70vh] flex items-center justify-center p-6"><div class="card max-w-md w-full p-8 text-center">
      <div class="mx-auto w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mb-4">${icon('shield-alert', 'w-6 h-6')}</div>
      <h2 class="text-lg font-bold">${title}</h2><p class="text-sm text-slate-500 mt-1 mb-5">${msg}</p>
      ${showLogin ? `<button class="btn btn-primary" onclick="App.showLogin()">${icon('log-in')} লগইন করুন</button>` : `<button class="btn btn-ghost" onclick="App.go('public','home')">পাবলিক ওয়েবসাইটে ফিরে যান</button>`}
    </div></div>`;
  },
  /* --- top bar with role switcher --- */
  renderTopbar() {
    const u = this.user();
    const isPublic = this.route.portal === 'public';
    const dash = !isPublic && !!u && !!this.roleForPortal(this.route.portal) && this.portals[this.route.portal]?.layout !== 'site';   // the sidebar shell is shown
    const modes = [['PUBLIC', icon('globe', 'w-4 h-4'), 'পাবলিক ওয়েবসাইট']].concat([...new Set(['ADMIN', 'PRINCIPAL', 'TEACHER', 'STUDENT', 'GUARDIAN', ...Object.keys(ROLES)])].filter(r => this.has(r) && ROLES[r]).map(r => [r, roleIcon(r), ROLES[r].label]));
    const active = isPublic ? 'PUBLIC' : this.session?.role;
    const sch = DB.s.school;
    // maintenance notice (js/modules/rootops.js; set by the Root User, enforced on the server)
    const banner = typeof Maint !== 'undefined' ? Maint.banner() : '';
    const userMenu = u ? `
      <div class="relative">
        <button class="flex items-center gap-2 rounded-lg hover:bg-slate-100 p-1 pr-2" aria-haspopup="true" aria-controls="user-menu" aria-label="ব্যবহারকারী মেনু: ${esc(pn(u))} (@${esc(u.username)})" onclick="document.getElementById('user-menu').classList.toggle('hidden')">${avatar(u, 30)}<span class="hidden md:block text-left leading-tight"><span class="block text-sm font-semibold max-w-[160px] truncate">${esc(pn(u))}</span><span class="block text-[11px] text-slate-500 max-w-[160px] truncate" data-noi18n>@${esc(u.username)}</span></span>${icon('chevron-down', 'w-4 h-4 text-slate-400')}</button>
        <div id="user-menu" class="hidden absolute right-0 mt-2 w-64 card p-2 shadow-xl z-50">
          <div class="px-3 py-2"><div class="font-semibold text-sm">${esc(pn(u))}</div><div class="text-xs text-slate-500">@${esc(u.username)} · ${esc(u.email)}</div>
          <div class="flex flex-wrap gap-1 mt-2">${this.roles().map(r => badge(ROLES[r].label, 'blue')).join('')}</div></div>
          <hr class="my-1 border-slate-100">
          ${(() => { const dashes = modes.filter(([r]) => r !== 'PUBLIC'), it = (r, ic, l, on) => `<button class="w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${on ? 'bg-brand-50 text-brand-700 font-semibold' : 'hover:bg-slate-100'}" onclick="App.switchMode('${r}')">${ic} ${esc(l)}</button>`;
            // dashboard switching lives here: one "go to dashboard" on the website, the full list when there are several
            if (isPublic) return dashes.map(([r, e, l]) => it(r, icon('layout-dashboard'), dashes.length > 1 ? l : 'ড্যাশবোর্ডে যান', false)).join('');
            return (dashes.length > 1 ? `<div class="px-3 pt-1 pb-1 text-xs font-bold text-slate-400">ড্যাশবোর্ড বদলান</div>${dashes.map(([r, e, l]) => it(r, e, l, r === active)).join('')}<hr class="my-1 border-slate-100">` : '') + it('PUBLIC', icon('globe'), 'পাবলিক ওয়েবসাইট', false); })()}
          <button class="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 text-sm flex items-center gap-2" onclick="App.myAccount()">${icon('user-round')} আমার প্রোফাইল</button>
          <button class="w-full text-left px-3 py-2 rounded-lg hover:bg-red-50 text-red-600 text-sm flex items-center gap-2" onclick="App.logout()">${icon('log-out')} লগআউট</button>
        </div>
      </div>` : '';
    const modeSwitch = '';   // workspace switching lives in the name drop-down
    if (isPublic) {
      // Government-style public header: utility strip → identity band → green navigation bar → notice ticker.
      // nav items: [pageId, label] or [linkId, label, url, newTab] for custom links (Settings → Menus & URLs)
      const nav = this.portals.public.nav.filter(([page, , url]) => { if (url) return true; const p = this.portals.public.pages.find(x => x.id === page); return p && this.pageOk(p); });
      // menu tree: items with a parent go into that item's drop-down (stacked under it on small screens)
      const ns = DB.s.site?.navStyle || {}, ids = new Set(nav.map(n => n[0]));
      const navIcon = page => ns.icons ? icon(this.portals.public.pages.find(x => x.id === page)?.icon || 'link', 'w-4 h-4 inline -mt-0.5 mr-1') : '';
      const navLink = ([page, label, url, blank], sub) => url ? `<a href="${esc(this.clean(url))}" ${blank ? 'target="_blank" rel="noopener"' : ''} class="${sub ? 'gov-sub' : 'gov-link'}">${esc(label)}</a>` : `<a href="${this.href('public', page)}" class="${sub ? 'gov-sub' : 'gov-link'} ${this.route.page === page ? 'active' : ''}">${sub ? '' : navIcon(page)}${esc(label)}</a>`;
      const pubNav = nav.filter(n => !n[4] || !ids.has(n[4])).map(n => {
        const kids = nav.filter(k => k[4] === n[0]);
        if (!kids.length) return navLink(n);
        const open = kids.some(k => k[0] === this.route.page);
        // tap / click toggles (phones and keyboard: Enter / Space); hover and focus open it on wide screens; Esc or a click outside closes it
        return `<div class="gov-dd relative" onmouseleave="this.classList.remove('dd-closed')"><button type="button" class="gov-link ${open || this.route.page === n[0] ? 'active' : ''} flex items-center gap-1" aria-haspopup="true" aria-expanded="false" aria-controls="dd-${esc(n[0])}" onclick="App.ddToggle(this)">${navIcon(n[0])}${esc(n[1])}${icon('chevron-down', 'w-3.5 h-3.5 gov-dd-chev')}</button><div class="gov-dd-menu" id="dd-${esc(n[0])}">${n[2] || this.portals.public.pages.some(p => p.id === n[0]) ? navLink(n, true) : ''}${kids.map(k => navLink(k, true)).join('')}</div></div>`;
      }).join('');
      const navCls = { white: 'gov-nav-white', dark: 'gov-nav-dark', accent: 'gov-nav-accent' }[ns.theme] || '';
      const tick = DB.s.featureFlags.noticeTicker !== false && DB.s.site?.ticker !== false ? [...DB.s.notices].filter(n => n.ticker !== false).sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date)).slice(0, 8) : [];
      const today = new Date(), dWhere = U.headerDate(), dLine = dWhere ? U.dateLine(today, 'header', true) : [];
      const dHtml = dLine.map((a, i) => `<span class="${i ? 'pub-datebar-alt' : ''}">${esc(a)}</span>`).join('');
      $('#topbar').innerHTML = `${banner}
        <div class="gov-strip h-1"></div>
        ${dWhere === 'strip' ? `<div class="pub-datebar"><div class="max-w-7xl mx-auto px-4 flex flex-wrap items-center gap-x-4 gap-y-0.5">${icon('calendar-days', 'w-4 h-4 shrink-0')}${dHtml}</div></div>` : ''}
        <div class="bg-white border-b border-slate-200"><div class="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <a href="/" class="flex items-center gap-3 min-w-0">${logoHtml(52)}<span class="min-w-0 leading-tight"><span class="block font-heading font-bold text-lg sm:text-2xl text-brand-800 truncate" data-noi18n>${esc(sch.nameBn || sch.name)}</span>${sch.nameBn ? `<span class="block text-sm text-slate-600 truncate" data-noi18n>${esc(sch.name)}</span>` : ''}</span></a>
          <span class="flex-1"></span>${modeSwitch}${userMenu}
          ${u ? '' : `<a href="${this.href('public', 'admissions')}" class="btn btn-accent hidden sm:inline-flex">${icon('file-pen-line')} অনলাইনে আবেদন করুন</a><button class="btn btn-primary" onclick="App.showLogin()">${icon('log-in')} লগইন</button>`}
          <button class="xl:hidden p-2 rounded-lg hover:bg-slate-100" onclick="document.getElementById('gov-nav').classList.toggle('hidden')" aria-label="মেনু">${icon('menu', 'w-5 h-5')}</button></div></div>
        <nav class="gov-nav ${navCls} ${ns.sticky === false ? '' : 'sticky top-0'} z-40" aria-label="প্রধান মেনু"><div id="gov-nav" class="hidden xl:flex max-w-7xl mx-auto px-2 flex-wrap">${pubNav}${dWhere === 'nav' ? `<div class="gov-navdate">${icon('calendar-days', 'w-4 h-4 shrink-0')}${dHtml}</div>` : ''}</div></nav>
        ${tick.length ? `<div class="ticker-bar"><div class="max-w-7xl mx-auto flex items-stretch min-w-0 overflow-hidden"><span class="ticker-label">${icon('megaphone', 'w-4 h-4')} নোটিশ</span><div class="ticker-track"><div class="ticker-move">${[...tick, ...tick].map(n => `<a href="${this.href('public', 'notices')}" class="mx-6 whitespace-nowrap hover:underline">● ${esc(n.title)}</a>`).join('')}</div></div></div></div>` : ''}`;
    } else {
      // Dashboard top bar (Cloudflare-style): menu button (phones) + breadcrumbs on the left, quick actions on the right.
      const P = this.portals[this.route.portal], pg = P.pages.find(p => p.id === this.route.page);
      const first = P.pages.find(p => !p.hidden && this.pageOk(p)) || P.pages[0];
      const crumbs = dash ? `<nav class="tb-crumbs" aria-label="পথনির্দেশিকা"><ol>
          <li class="hidden sm:flex"><a class="tb-crumb" href="${this.href(P.id, first.id)}">${esc(P.title)}</a></li>
          ${pg?.group ? `<li class="hidden md:flex"><span class="tb-sep" aria-hidden="true">›</span><span class="tb-crumb-mid">${esc(pg.group)}</span></li>` : ''}
          <li class="min-w-0 flex"><span class="tb-sep hidden sm:inline" aria-hidden="true">›</span><span class="tb-crumb-cur" aria-current="page">${esc(pg?.label || '')}</span></li></ol></nav>`
        : `<a href="/" class="flex items-center gap-2.5 min-w-0">${logoHtml(32)}<span class="font-bold text-slate-900 truncate" data-noi18n>${esc(sch.nameBn || sch.name)}</span></a>`;
      $('#topbar').innerHTML = `${banner}
        <div class="dash-top bg-white border-b border-slate-200">
          <div class="px-3 sm:px-5 h-14 flex items-center gap-2 sm:gap-3 min-w-0">
            ${dash ? `<button class="tb-icon sb-menu-btn" onclick="App.sbDrawer(true)" aria-label="মেনু খুলুন" aria-controls="sb" aria-expanded="false">${icon('menu', 'w-5 h-5')}</button>` : ''}
            ${crumbs}
            <div class="flex-1"></div>
            <div id="undo-bar" class="hidden sm:block"></div>
            ${modeSwitch}${userMenu}
            ${u ? '' : `<button class="btn btn-primary" onclick="App.showLogin()">${icon('log-in')} লগইন</button>`}
          </div>
        </div>`;
    }
    const H = document.documentElement;
    H.classList.toggle('dash', dash); H.classList.toggle('sb-mini', this.sbMini()); H.classList.remove('sb-open');
    // Dashboards: the slim top bar sticks to the top, to the right of the full-height sidebar.
    const tb = $('#topbar'); tb.className = isPublic ? '' : 'sticky top-0 z-40';
    document.documentElement.style.setProperty('--tb', (isPublic ? 0 : tb.offsetHeight) + 'px');
    document.addEventListener('click', this._closeMenu || (this._closeMenu = e => { const m = $('#user-menu'); if (m && !m.parentElement.contains(e.target)) m.classList.add('hidden'); }));
    if (!this._ddKeys) {
      this._ddKeys = true;
      // public menu drop-downs: a click outside closes them; Esc closes the open one and returns focus to its button
      document.addEventListener('click', e => $$('.gov-dd.open').forEach(d => { if (!d.contains(e.target)) this.ddToggle(d.querySelector('button'), false); }));
      document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        const d = e.target.closest?.('.gov-dd') || $('.gov-dd.open'); if (!d) return;
        this.ddToggle(d.querySelector('button'), false); d.classList.add('dd-closed'); d.querySelector('button').focus();
      });
      document.addEventListener('focusout', e => { const d = e.target.closest?.('.gov-dd'); if (d && !d.contains(e.relatedTarget)) { d.classList.remove('dd-closed'); if (e.relatedTarget) this.ddToggle(d.querySelector('button'), false); } });
    }
  },
  /** Open / close one public-menu drop-down (others close). */
  ddToggle(btn, force) {
    const d = btn && btn.closest('.gov-dd'); if (!d) return;
    const on = force ?? !d.classList.contains('open');
    if (on) $$('.gov-dd.open').forEach(x => { if (x !== d) { x.classList.remove('open'); x.querySelector('button')?.setAttribute('aria-expanded', 'false'); } });
    d.classList.toggle('open', on); d.classList.toggle('dd-closed', !on); btn.setAttribute('aria-expanded', String(on));
  },
  /* --- dashboard shell (sidebar + page host) --- */
  shell(portal, html) {
    const role = this.session.role;
    this.sbInit();
    // Sidebar: pages grouped by `page.group` into collapsible sections (state remembered per portal).
    const visible = portal.pages.filter(p => !p.hidden && this.pageOk(p)), groups = [];
    visible.forEach(p => { const g = p.group || 'সাধারণ'; let G = groups.find(x => x.name === g); if (!G) groups.push(G = { name: g, pages: [] }); G.pages.push(p); });
    const order = portal.groupOrder || [];
    groups.sort((a, b) => (order.indexOf(a.name) + 1 || 99) - (order.indexOf(b.name) + 1 || 99));
    let collapsed = {}; try { collapsed = JSON.parse(localStorage.getItem('dhee.nav.' + portal.id) || '{}'); } catch (e) { }
    const NP = this.navPrefs(), accordion = this.navAccordion(), pins = (NP.pins?.[portal.id] || []).filter(id => visible.some(p => p.id === id));
    // Each row: icon + label (truncated, full label as tooltip) + pin star; `data-k` = label, page id / slug and group name (quick search).
    const link = (p, g, pfx = 'nl') => { const on = p.id === this.route.page, pinned = pins.includes(p.id); return `<div class="nav-row"><a href="${this.href(portal.id, p.id)}" id="${pfx}-${esc(p.id)}" class="nav-link ${on ? 'active' : ''}" ${on && pfx === 'nl' ? 'aria-current="page"' : ''} title="${esc(p.label)}" data-tip="${esc(p.label)}" data-label="${esc(p.label)}" data-k="${esc(`${p.label} ${p.id} ${p.slug || ''} ${g || ''}`.toLowerCase())}">${icon(p.icon || 'circle')}<span class="nav-label">${esc(p.label)}</span>${(() => { let n = 0; try { n = p.count ? p.count() : 0; } catch (e) { console.warn('nav count', p.id, e); } return n ? `<span class="nav-count">${U.bn(n)}</span>` : ''; })()}</a><button type="button" class="nav-pin ${pinned ? 'on' : ''}" aria-pressed="${pinned}" aria-label="${pinned ? 'প্রিয় থেকে সরান' : 'প্রিয়তে রাখুন'}" title="${pinned ? 'প্রিয় থেকে সরান' : 'প্রিয়তে রাখুন'}" onclick="App.navPin('${portal.id}','${esc(p.id)}')">${icon('star', 'w-4 h-4')}</button></div>`; };
    const byId = id => visible.find(p => p.id === id);
    const mini = (key, title, ic, ids, pfx) => ids.length ? `<div class="nav-group nav-quick" data-g="${key}"><div class="nav-qh">${icon(ic, 'w-4 h-4')}<span class="nav-gl" data-label="${title}">${title}</span></div><div class="nav-group-b flex flex-col">${ids.map(id => link(byId(id), title, pfx)).join('')}</div></div>` : '';
    const quick = mini('__pins', 'প্রিয়', 'star', pins, 'np');
    const gIcon = n => (this.navGroupIcons.find(([re]) => re.test(n)) || [0, 'folder'])[1];
    const links = quick + (groups.length === 1 ? `<div class="nav-group nav-solo"><div class="nav-group-b flex flex-col">${groups[0].pages.map(p => link(p)).join('')}</div></div>` : groups.map((G, gi) => {
      // collapsed by default; the active page's group is open. Without accordion mode, groups the user opened stay open.
      const act = G.pages.some(p => p.id === this.route.page), open = act || (!accordion && G.name in collapsed && !collapsed[G.name]);
      return `<div class="nav-group ${act ? 'has-active' : ''}" data-g="${esc(G.name)}"><button type="button" class="nav-group-h" title="${esc(G.name)}" data-tip="${esc(G.name)}" aria-expanded="${open}" aria-controls="nvg-${gi}" onclick="App.toggleNavGroup(this,'${portal.id}')">${icon(gIcon(G.name), 'nav-gi')}<span class="nav-gl" data-label="${esc(G.name)}">${esc(G.name)}</span><span class="nav-gc">${U.bn(G.pages.length)}</span><span class="nav-chev">${icon('chevron-down', 'w-4 h-4')}</span></button><div id="nvg-${gi}" class="nav-group-b ${open ? '' : 'hidden'} flex flex-col">${G.pages.map(p => link(p, G.name)).join('')}</div></div>`;
    }).join(''));
    // Workspace switcher (Cloudflare "account" menu): dashboards the user may open + active campus + institution info.
    const modes = [['PUBLIC', icon('globe', 'w-4 h-4'), 'পাবলিক ওয়েবসাইট']].concat([...new Set(['ADMIN', 'PRINCIPAL', 'TEACHER', 'STUDENT', 'GUARDIAN', ...Object.keys(ROLES)])].filter(r => this.has(r) && ROLES[r]).map(r => [r, roleIcon(r), ROLES[r].label]));
    const sch = DB.s.school, campusOk = ['principal', 'admin'].includes(portal.id) && (this.has('ADMIN') || this.has('PRINCIPAL')) && multiCampus();
    const item = (on, click, lead, label) => `<button type="button" role="menuitem" class="sb-mi ${on ? 'on' : ''}" ${on ? 'aria-current="true"' : ''} onclick="${click}"><span class="w-6 text-center shrink-0">${lead}</span><span class="flex-1 min-w-0 truncate">${esc(label)}</span>${on ? icon('check', 'w-4 h-4 shrink-0') : ''}</button>`;
    // The logo block opens a menu only for campus switching (several campuses); dashboards are switched from the profile menu.
    const wsMenu = campusOk ? `<div id="sb-ws-menu" class="sb-ws-menu card hidden" role="menu" aria-label="ক্যাম্পাস">
        <div class="sb-mh">সক্রিয় ক্যাম্পাস</div>${DB.s.campuses.map(c => item(c.id === DB.campusId(), `App.setCampus('${esc(c.id)}')`, icon('school', 'w-4 h-4'), c.name)).join('')}</div>` : '';
    const canBack = this._hi > 0 || (visible[0] && visible[0].id !== this.route.page);
    // Full-height fixed sidebar; colours come from the theme (--sb-*), default = page colour. Collapsible to an icon rail; drawer on phones.
    return `<div>
      <aside id="sb" class="sidebar" aria-label="সাইডবার">
        <div class="sb-head">
          ${campusOk ? `<button type="button" id="sb-ws-btn" class="sb-ws" data-tip="${esc(sch.nameBn || sch.name)} — ${esc(DB.campus().name)}" aria-haspopup="menu" aria-expanded="false" aria-controls="sb-ws-menu" onclick="App.sbWs()">` : `<div class="sb-ws" data-tip="${esc(sch.nameBn || sch.name)} — ${esc(ROLES[role].label)}">`}
            ${logoHtml(32)}<span class="sb-txt flex-1 min-w-0 text-left leading-snug"><span class="block font-bold sb-strong truncate" data-noi18n>${esc(sch.nameBn || sch.name)}</span><span class="block sb-muted truncate">${roleIcon(role, 'w-3.5 h-3.5 inline -mt-0.5')} ${esc(ROLES[role].label)}${campusOk ? ' · ' + esc(DB.campus().name) : ''}</span></span>${campusOk ? `<span class="sb-txt sb-muted shrink-0">${icon('chevrons-up-down', 'w-4 h-4')}</span></button>` : '</div>'}
          <button type="button" class="sb-x tb-icon" onclick="App.sbDrawer(false)" aria-label="মেনু বন্ধ করুন">${icon('x', 'w-5 h-5')}</button>
          ${wsMenu}
        </div>
        <div class="sb-tools">
          <div class="sb-row1"><button type="button" class="nav-link sb-back" onclick="App.sbBack()" data-tip="ফিরে যান" ${canBack ? '' : 'disabled aria-disabled="true"'}>${icon('arrow-left')}<span class="nav-label">ফিরে যান</span></button>
          <button type="button" class="sb-collapse sb-collapse-ic" onclick="App.sbToggle()" aria-controls="sb" aria-expanded="${!this.sbMini()}" aria-label="${this.sbMini() ? 'সাইডবার বড় করুন' : 'সাইডবার ছোট করুন'}" title="${this.sbMini() ? 'সাইডবার বড় করুন' : 'সাইডবার ছোট করুন'}">${icon('panel-left-close', 'sb-ic-close')}${icon('panel-left-open', 'sb-ic-open')}</button></div>
          <div class="sb-search" role="search">${icon('search', 'sb-search-ic')}<input id="sb-q" type="search" placeholder="মেনু খুঁজুন…" aria-label="মেনু খুঁজুন (শর্টকাট: / বা Ctrl+K)" aria-controls="sb-nav" autocomplete="off" spellcheck="false" oninput="App.sbFilter(this.value)" onkeydown="App.sbKey(event)" onblur="App.sbPeekEnd()"><kbd class="sb-kbd" aria-hidden="true">/</kbd></div>
          <button type="button" class="nav-link sb-search-mini" onclick="App.sbSearchOpen()" data-tip="মেনু খুঁজুন (Ctrl+K)">${icon('search')}<span class="nav-label">মেনু খুঁজুন</span></button>
        </div>
        <nav id="sb-nav" class="sb-nav" aria-label="প্রধান মেনু">${links}<div id="sb-empty" class="sb-empty hidden" role="status">কিছু পাওয়া যায়নি</div></nav>
        <div class="sb-foot">
          ${typeof DevInfo !== 'undefined' ? `<button type="button" class="nav-link" onclick="DevInfo.open()" data-tip="ডেভেলপার তথ্য">${icon('info')}<span class="nav-label">ডেভেলপার তথ্য</span></button>` : ''}
        </div>
      </aside>
      <div class="sb-overlay" onclick="App.sbDrawer(false)" aria-hidden="true"></div>
      <main class="dash-main min-w-0 px-4 sm:px-6 py-5 sm:py-7">
        <div id="page-host" class="fade-in">${html}</div>
      </main></div>`;
  },
  /* --- sidebar behaviour: collapse to an icon rail, phone drawer, back, quick menu search --- */
  sbInit() {
    if (this._sbInit) return; this._sbInit = true;
    const tipFor = e => App.sbTip(e.target.closest?.('#sb [data-tip]') || null);
    document.addEventListener('mouseover', tipFor); document.addEventListener('focusin', tipFor);
    document.addEventListener('scroll', () => App.sbTip(null), true);
    document.addEventListener('click', e => { const m = $('#sb-ws-menu'); if (m && !m.classList.contains('hidden') && !e.target.closest('#sb-ws-menu, #sb-ws-btn')) App.sbWs(false); });
    document.addEventListener('keydown', e => {
      if (!$('#sb-q') || $('#modal-root')?.innerHTML) return;
      const typing = e.target.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
      if ((e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) || ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k')) { e.preventDefault(); App.sbSearchOpen(); return; }
      if (e.key === 'Escape') {
        const m = $('#sb-ws-menu'); if (m && !m.classList.contains('hidden')) { App.sbWs(false); $('#sb-ws-btn')?.focus(); return; }
        if (document.documentElement.classList.contains('sb-open')) App.sbDrawer(false);
      }
    });
    window.addEventListener('resize', () => { if (innerWidth > 768 && document.documentElement.classList.contains('sb-open')) App.sbDrawer(false); });
  },
  sbMini() { try { return localStorage.getItem('dhee.sb.mini') === '1'; } catch (e) { return false; } },
  sbToggle(force) {
    const H = document.documentElement, mini = force === undefined ? !H.classList.contains('sb-mini') : !!force;
    this._peek = false; H.classList.toggle('sb-mini', mini);
    try { localStorage.setItem('dhee.sb.mini', mini ? '1' : '0'); } catch (e) { }
    const c = $('.sb-collapse'), t = mini ? 'সাইডবার বড় করুন' : 'সাইডবার ছোট করুন';
    if (c) { c.setAttribute('aria-expanded', String(!mini)); c.setAttribute('aria-label', t); c.title = t; }
    this.sbTip(null);
  },
  sbDrawer(open) {
    const H = document.documentElement; H.classList.toggle('sb-open', !!open);
    const btn = $('.sb-menu-btn'); btn?.setAttribute('aria-expanded', String(!!open));
    if (open) setTimeout(() => $('#sb .sb-x')?.focus(), 30); else if (H.classList.contains('dash') && $('#sb')?.contains(document.activeElement)) btn?.focus();
  },
  sbWs(open) {
    const m = $('#sb-ws-menu'), b = $('#sb-ws-btn'); if (!m) return;
    const show = open === undefined ? m.classList.contains('hidden') : open;
    m.classList.toggle('hidden', !show); b.setAttribute('aria-expanded', String(show)); this.sbTip(null);
    if (show) m.querySelector('.sb-mi')?.focus();
  },
  /** Back = previous page of this app (browser history entries we created), otherwise the portal's first page. */
  trackHistory() {
    const st = history.state;
    if (st && typeof st.dheeI === 'number') this._hi = st.dheeI;
    else { this._hi = this._hi === undefined ? 0 : this._hi + 1; try { history.replaceState({ ...(st || {}), dheeI: this._hi }, ''); } catch (e) { } }
  },
  sbBack() {
    if (this._hi > 0) return history.back();
    const P = this.portals[this.route.portal], first = P?.pages.find(p => !p.hidden && this.pageOk(p));
    if (first && first.id !== this.route.page) this.go(P.id, first.id);
  },
  /** Live filter of the sidebar menu: Bangla labels, group names, Latin page ids / slugs. */
  sbFilter(q) {
    const nav = $('#sb-nav'); if (!nav) return;
    const n = String(q || '').trim().toLowerCase().normalize('NFC');
    const mark = (el, t = el.dataset.label) => { const i = n ? t.toLowerCase().indexOf(n) : -1; el.innerHTML = i < 0 ? esc(t) : `${esc(t.slice(0, i))}<mark class="sb-hit">${esc(t.slice(i, i + n.length))}</mark>${esc(t.slice(i + n.length))}`; };
    nav.classList.toggle('searching', !!n);
    let hits = 0;
    nav.querySelectorAll('.nav-link').forEach(a => { const ok = !n || a.dataset.k.normalize('NFC').includes(n); a.classList.toggle('nomatch', !ok); a.classList.remove('kb'); if (ok) hits++; mark(a.querySelector('.nav-label'), a.dataset.label); });
    nav.querySelectorAll('.nav-group').forEach(g => { g.classList.toggle('nomatch', !!n && !g.querySelector('.nav-link:not(.nomatch)')); const gl = g.querySelector('.nav-gl'); if (gl) mark(gl); });
    $('#sb-empty')?.classList.toggle('hidden', !n || hits > 0);
    const q0 = $('#sb-q'); q0?.removeAttribute('aria-activedescendant');
    if (n) { const f = nav.querySelector('.nav-link:not(.nomatch)'); if (f) { f.classList.add('kb'); q0?.setAttribute('aria-activedescendant', f.id); } }
  },
  sbKey(e) {
    const nav = $('#sb-nav'), inp = e.target; if (!nav) return;
    const vis = [...nav.querySelectorAll('.nav-link:not(.nomatch)')].filter(a => a.offsetParent);
    let i = vis.findIndex(a => a.classList.contains('kb'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); if (!vis.length) return;
      vis[i]?.classList.remove('kb');
      i = e.key === 'ArrowDown' ? (i + 1) % vis.length : (i <= 0 ? vis.length - 1 : i - 1);
      vis[i].classList.add('kb'); vis[i].scrollIntoView({ block: 'nearest' }); inp.setAttribute('aria-activedescendant', vis[i].id);
    } else if (e.key === 'Enter') {
      e.preventDefault(); const a = vis[i >= 0 ? i : 0]; if (a) a.click();
    } else if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (inp.value) { inp.value = ''; this.sbFilter(''); } else { inp.blur(); if (document.documentElement.classList.contains('sb-open')) this.sbDrawer(false); }
    }
  },
  /** "/" or Ctrl+K: focus the menu search (opens the drawer on phones, briefly widens the icon rail). */
  sbSearchOpen() {
    const H = document.documentElement; if (!$('#sb-q')) return;
    if (innerWidth <= 768) this.sbDrawer(true);
    else if (H.classList.contains('sb-mini')) { H.classList.remove('sb-mini'); this._peek = true; this.sbTip(null); }
    setTimeout(() => { const q = $('#sb-q'); q?.focus(); q?.select(); }, 40);
  },
  sbPeekEnd() {
    if (!this._peek) return;
    setTimeout(() => { if (this._peek && !$('#sb-q')?.value && !$('#sb')?.contains(document.activeElement)) { this._peek = false; document.documentElement.classList.toggle('sb-mini', this.sbMini()); } }, 200);
  },
  /** Tooltip for the icon rail (title + accessible label stay on the row itself). */
  sbTip(el) {
    let t = $('#sb-tip');
    if (!el || !document.documentElement.classList.contains('sb-mini') || innerWidth <= 768) { t?.classList.add('hidden'); return; }
    if (!t) { t = document.createElement('div'); t.id = 'sb-tip'; t.setAttribute('role', 'tooltip'); document.body.appendChild(t); }
    const r = el.getBoundingClientRect();
    t.textContent = el.dataset.tip; t.style.left = (r.right + 10) + 'px'; t.style.top = (r.top + r.height / 2) + 'px'; t.classList.remove('hidden');
  },
  toggleNavGroup(btn, portal, name) {
    name = name || btn.closest('.nav-group')?.dataset.g;
    const body = btn.nextElementSibling, open = body.classList.toggle('hidden') === false;
    btn.setAttribute('aria-expanded', open);
    // accordion: opening one group closes the others
    if (open && this.navAccordion()) $$('#sb-nav .nav-group-h[aria-expanded="true"]').forEach(h => { if (h !== btn) { h.setAttribute('aria-expanded', 'false'); h.nextElementSibling.classList.add('hidden'); } });
    let c = {}; try { c = JSON.parse(localStorage.getItem('dhee.nav.' + portal) || '{}'); } catch (e) { }
    c[name] = !open; try { localStorage.setItem('dhee.nav.' + portal, JSON.stringify(c)); } catch (e) { }
  },
  /** Group header icons, matched on the group's name (fallback: folder). */
  navGroupIcons: [[/ড্যাশবোর্ড|সাধারণ/, 'layout-dashboard'], [/প্রতিষ্ঠান|সেটিংস/, 'building-2'], [/শিক্ষা কার্যক্রম|একাডেমিক/, 'book-open'], [/শিক্ষার্থী/, 'graduation-cap'], [/শিক্ষক/, 'presentation'], [/পরীক্ষা|ফলাফল/, 'clipboard-check'], [/প্রশাসন/, 'landmark'], [/পরিষেবা/, 'bus'], [/অর্থ|হিসাব|ফি/, 'wallet'], [/মানবসম্পদ/, 'users'], [/সিস্টেম/, 'cpu'], [/ওয়েব/, 'globe'], [/সন্তান|আমার/, 'user']],
  /** Sidebar preferences on the user's own record (users[].uiPrefs.nav): { pins: {portal: [pageId]} }. */
  navPrefs() { const u = App.session ? DB.user(App.session.userId) : null; return u?.uiPrefs?.nav || {}; },
  navSet(patch) {
    const u = App.session ? DB.user(App.session.userId) : null; if (!u) return;
    u.uiPrefs = { ...(u.uiPrefs || {}), nav: { ...(u.uiPrefs?.nav || {}), ...patch } }; DB.save();
    const sc = $('#sb-nav')?.scrollTop || 0; this.render(); const n = $('#sb-nav'); if (n) n.scrollTop = sc;
  },
  navPin(portal, id) {
    const P = { ...(this.navPrefs().pins || {}) }, l = (P[portal] || []).slice(), i = l.indexOf(id);
    if (i >= 0) l.splice(i, 1); else l.push(id);
    P[portal] = l; this.navSet({ pins: P });
  },
  /** Accordion sidebar (one group open at a time): on unless the Root User switched off featureFlags.navAccordion. */
  navAccordion() { return DB.s.featureFlags?.navAccordion !== false; },
  /* --- login --- */
  showLogin() {
    Modal.open({
      title: 'Dhee SMS-এ লগইন করুন', size: 'md',
      body: `<form id="login-form" class="space-y-3" autocomplete="off">
          <div><label class="label">ইউজার আইডি</label><input class="input" name="username" required autocomplete="username" placeholder="ইউজারনেম / স্টুডেন্ট আইডি / রেজিস্ট্রেশন নম্বর / মোবাইল নম্বর"></div>
          <div><label class="label">পাসওয়ার্ড</label><input class="input" name="password" type="password" required></div>
          <div id="login-err" class="text-sm text-red-600 hidden"></div>
          <button class="btn btn-primary w-full">${icon('log-in')} লগইন করুন</button>
          <button type="button" class="w-full text-center text-brand-700 font-semibold py-1 hover:underline" onclick="Modal.close();App.go('public','reset-password')">পাসওয়ার্ড ভুলে গেছেন?</button>
        </form>
        <p class="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 leading-relaxed">শিক্ষার্থী ও অভিভাবকেরা প্রতিষ্ঠান থেকে দেওয়া ইউজার আইডি ও পাসওয়ার্ড দিয়ে লগইন করবেন। লগইনে সমস্যা হলে প্রতিষ্ঠানের অফিসে যোগাযোগ করুন।</p>`,
    });
    // The server checks the password (scrypt) and opens a session; failures are audited there.
    $('#login-form').addEventListener('submit', e => { e.preventDefault(); Sync.signIn(formData(e.target), $('#login-err'), e.target.querySelector('button:not([type=button])')); });
  },
};
