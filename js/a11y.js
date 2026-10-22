/* ==========================================================================
   ACCESSIBILITY & DISPLAY — available to every visitor (website and dashboards)
   Theme: default (follow the device) · light · dark   ·   text size   ·
   high contrast · underline links · wider spacing · reduce motion.
   Saved per browser; applied before the first paint.
   ========================================================================== */
const A11y = {
  KEY: 'dhee.a11y',
  o: { mode: 'default', size: 1, contrast: false, links: false, spacing: false, motion: false },
  load() { try { Object.assign(this.o, JSON.parse(localStorage.getItem(this.KEY) || '{}')); } catch (e) { } },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.o)); } catch (e) { } },
  dark() { return this.o.mode === 'dark' || (this.o.mode === 'default' && window.matchMedia?.('(prefers-color-scheme: dark)').matches); },
  apply() {
    const h = document.documentElement, o = this.o;
    h.dataset.mode = this.dark() ? 'dark' : 'light';
    h.dataset.contrast = o.contrast ? 'high' : '';
    h.dataset.links = o.links ? 'underline' : '';
    h.dataset.spacing = o.spacing ? 'wide' : '';
    h.dataset.motion = o.motion ? 'reduce' : '';
    const base = (typeof DB !== 'undefined' && DB.s?.theme?.baseSize) || 15;
    h.style.fontSize = Math.round(base * o.size * 10) / 10 + 'px';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', this.dark() ? '#0b1220' : '#006a4e');
  },
  set(k, v) { this.o[k] = v; this.save(); this.apply(); this.paint(); },
  reset() { this.o = { mode: 'default', size: 1, contrast: false, links: false, spacing: false, motion: false }; this.save(); this.apply(); this.paint(); },
  /** Floating round button, fixed at the bottom-right corner of every page (website and dashboards).
      Toasts sit above it (css/app.css); the undo snackbar stays bottom-left. */
  button() { return `<button type="button" id="a11y-fab" class="a11y-btn a11y-fab" onclick="A11y.toggle(this)" title="প্রদর্শন ও সহায়ক সুবিধা" aria-label="প্রদর্শন ও সহায়ক সুবিধা" aria-haspopup="dialog" aria-expanded="false" aria-controls="a11y-panel"><i data-lucide="accessibility" class="w-6 h-6" aria-hidden="true"></i></button>`; },
  mount() {
    if (document.getElementById('a11y-fab') || !document.body) return;
    document.body.insertAdjacentHTML('beforeend', this.button());
    try { window.lucide && lucide.createIcons(); } catch (e) { }
  },
  toggle(btn) {
    btn = btn || document.getElementById('a11y-fab');
    let p = document.getElementById('a11y-panel');
    if (p && !p.classList.contains('hidden')) { p.classList.add('hidden'); btn?.setAttribute('aria-expanded', 'false'); return; }
    if (!p) { p = document.createElement('div'); p.id = 'a11y-panel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'প্রদর্শন ও সহায়ক সুবিধা'); p.className = 'card shadow-xl p-4 fixed z-[95] w-[19rem] max-w-[calc(100vw-1.5rem)] overflow-y-auto'; document.body.appendChild(p); }
    // opens upwards from the corner button
    const r = btn.getBoundingClientRect();
    p.style.top = 'auto'; p.style.bottom = Math.max(12, window.innerHeight - r.top + 8) + 'px'; p.style.right = Math.max(12, window.innerWidth - r.right) + 'px';
    p.style.maxHeight = Math.max(200, r.top - 20) + 'px';
    p.classList.remove('hidden'); btn.setAttribute('aria-expanded', 'true'); this.paint(); p.querySelector('button')?.focus();
  },
  paint() {
    const p = document.getElementById('a11y-panel'); if (!p) return;
    const o = this.o, seg = (k, opts) => `<div class="grid grid-cols-${opts.length} gap-1 bg-slate-100 rounded-lg p-1">${opts.map(([v, l, ic]) => `<button class="px-2 py-1.5 rounded-md text-xs font-semibold flex items-center justify-center gap-1 ${o[k] === v ? 'bg-white shadow text-brand-700' : 'text-slate-600'}" aria-pressed="${o[k] === v}" onclick="A11y.set('${k}',${typeof v === 'string' ? `'${v}'` : v})">${ic ? icon(ic, 'w-3.5 h-3.5') : ''}${l}</button>`).join('')}</div>`;
    const sw = (k, l, ic) => `<label class="flex items-center gap-2 py-1.5 text-sm cursor-pointer">${icon(ic, 'w-4 h-4 text-slate-400')}<span class="flex-1">${l}</span><input type="checkbox" class="w-4 h-4 accent-[var(--brand)]" ${o[k] ? 'checked' : ''} onchange="A11y.set('${k}',this.checked)"></label>`;
    p.innerHTML = `<div class="flex items-center mb-3"><div class="font-semibold">প্রদর্শন ও সহায়ক সুবিধা</div><button class="ml-auto p-1 rounded hover:bg-slate-100" onclick="document.getElementById('a11y-panel').classList.add('hidden')" aria-label="বন্ধ করুন">${icon('x', 'w-4 h-4')}</button></div>
      <div class="label">থিম</div>${seg('mode', [['default', 'ডিফল্ট', 'monitor'], ['light', 'লাইট', 'sun'], ['dark', 'ডার্ক', 'moon']])}
      <div class="label mt-3">লেখার আকার</div>${seg('size', [[0.9, 'A−'], [1, 'A'], [1.12, 'A+'], [1.25, 'A++']])}
      <div class="mt-3 divide-y divide-slate-100">${sw('contrast', 'উচ্চ কনট্রাস্ট', 'contrast')}${sw('links', 'লিংকের নিচে দাগ', 'underline')}${sw('spacing', 'লেখায় বেশি ফাঁকা', 'text')}${sw('motion', 'অ্যানিমেশন কমান (চলমান নোটিশ থামবে)', 'pause')}</div>
      <button class="btn btn-ghost btn-sm w-full mt-3" onclick="A11y.reset()">${icon('rotate-ccw')} ডিফল্টে ফিরুন</button>`;
    if (typeof App !== 'undefined') App.icons();
  },
};
A11y.load(); A11y.apply();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => A11y.mount()); else A11y.mount();
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => A11y.apply());
// "Click outside closes the panel": use the event path captured at dispatch — the clicked icon or option
// may already have been re-rendered (detached) by the time this runs, which made clicks look "outside".
document.addEventListener('click', e => { const p = document.getElementById('a11y-panel'); if (!p || p.classList.contains('hidden')) return; if (e.composedPath().some(n => n === p || n.classList?.contains('a11y-btn'))) return; p.classList.add('hidden'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.getElementById('a11y-panel')?.classList.add('hidden'); });
