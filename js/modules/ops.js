/* ==========================================================================
   OPERATIONS
   · Admit-card exemptions — let a student sit the exam while dues stay open
   · Undo / redo / restore — every saved change can be rolled back from the
     dashboard header (↶ / ↷ / history), with Ctrl+Z / Ctrl+Y shortcuts.
     The audit log and the message outbox are append-only and survive an undo
     (the undo itself is audited); record ids are never re-issued.
   ========================================================================== */

const AdmitWaiver = {
  can() { return App.has('PRINCIPAL') || App.has('ADMIN'); },
  grant(studentId, examId, after) {
    if (!this.can()) return toast('শুধু অধ্যক্ষ বা রুট ব্যবহারকারী কোনো শিক্ষার্থীকে অব্যাহতি দিতে পারেন।', 'error');
    const st = DB.student(studentId), ex = DB.exam(examId), due = DB.duesBefore(studentId, ex.start);
    Modal.open({
      title: 'বকেয়া থাকা অবস্থায় প্রবেশপত্র প্রদান', size: 'sm',
      body: `<form id="aw-form" class="space-y-3"><div class="text-sm"><b>${esc(pn(st))}</b> · ${esc(DB.className(st.classId))}${st.section ? '-' + esc(st.section) : ''} · রোল ${bnNum(st.roll)}<br>${esc(ex.name)} · বকেয়া <b class="text-red-600">${U.money(due)}</b></div>        <div><label class="label">কারণ</label><input class="input" name="reason" required placeholder="যেমন: অভিভাবক ১৫ তারিখের মধ্যে পরিশোধের প্রতিশ্রুতি দিয়েছেন; আর্থিক সংকট"></div>
        <div><label class="label">প্রতিশ্রুত পরিশোধের তারিখ (ঐচ্ছিক)</label><input type="date" class="input" name="promise"></div>
        <button class="btn btn-primary w-full">${icon('unlock')} প্রবেশপত্রের অনুমতি দিন</button></form>`,
    });
    $('#aw-form').addEventListener('submit', e => {
      e.preventDefault(); const f = formData(e.target), list = DB.s.admitWaivers || (DB.s.admitWaivers = []);
      list.push({ id: DB.id('AW'), studentId, examId, reason: f.reason, promise: f.promise || null, due, by: App.session.userId, at: new Date().toISOString() });
      DB.audit('ADMIT_WAIVER', 'admit_cards', `${pn(st)} (${st.id}) · ${ex.name} · বকেয়া ${U.money(due)} রেখে প্রবেশপত্রের অনুমতি — ${f.reason}`); DB.save();
      Modal.close(); toast(`${pn(st)} এখন প্রবেশপত্র পেতে পারবে। বকেয়া হিসাবে থেকে যাবে।`, 'success');
      if (typeof after === 'function') after(); else App.refresh();
    });
  },
  revoke(studentId, examId) {
    const w = DB.admitWaiver(studentId, examId); if (!w || !confirm('এই অব্যাহতি প্রত্যাহার করবেন? বকেয়া পরিশোধ না হওয়া পর্যন্ত প্রবেশপত্র আবার আটকে থাকবে।')) return;
    w.revokedAt = new Date().toISOString(); w.revokedBy = App.session.userId;
    DB.audit('ADMIT_WAIVER_REVOKE', 'admit_cards', `${studentId} · ${examId}`); DB.save(); App.refresh();
  },
};

const Undo = {
  // Each entry keeps only the top-level keys that changed: prev = before, next = after (JSON strings).
  // The history is stored per user in this browser and survives a page reload; it is cleared on logout.
  stack: [], redoStack: [], MAX: 15, last: null, lastAuditKey: null, quiet: false,
  SKIP: /^(LOGIN|LOGOUT|ROLE_SWITCH|ACCESS_DENIED|DB_SEED|UNDO|REDO|BACKUP_AUTO)$/,
  KEEP: ['audit', 'outbox', 'meta'],   // append-only collections (and the id sequence) that an undo never rolls back
  auditKey(s) { const a = s.audit?.[s.audit.length - 1]; return a ? a.hash || a.seq : null; },
  snap(s) { const m = {}; for (const k of Object.keys(s)) { if (this.KEEP.includes(k)) continue; try { m[k] = JSON.stringify(s[k]); } catch (e) { } } return m; },
  diff(a, b) { const prev = {}, next = {}; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[k] !== b[k]) { prev[k] = a[k] ?? null; next[k] = b[k] ?? null; } return Object.keys(prev).length ? { prev, next } : null; },
  storeKey() { return App.session?.userId ? 'dhee.undo.' + App.session.userId : null; },
  save() { const k = this.storeKey(); if (!k) return; for (;;) { try { localStorage.setItem(k, JSON.stringify({ stack: this.stack, redo: this.redoStack })); return; } catch (e) { if (this.redoStack.length) this.redoStack.shift(); else if (this.stack.length) this.stack.shift(); else return; } } },
  clear(uid) { try { localStorage.removeItem('dhee.undo.' + uid); } catch (e) { } },
  /** Wrap DB.save: remember what changed in each save. */
  hook() {
    DB.save = function () {
      let str; try { str = JSON.stringify(this.s); } catch (e) { return false; }
      const cur = Undo.snap(this.s);
      if (Undo.last !== null && !Undo.quiet) {
        const d = Undo.diff(Undo.last, cur);
        const a = this.s.audit[this.s.audit.length - 1], fresh = a && (a.hash || a.seq) !== Undo.lastAuditKey;
        if (d && !(fresh && Undo.SKIP.test(a.action))) {
          Undo.stack.push({ ...d, label: fresh ? (a.detail || a.action) : 'সম্পাদনা', action: fresh ? a.action : 'EDIT', at: new Date().toISOString(), by: App.session?.userId || null });
          if (Undo.stack.length > Undo.MAX) Undo.stack.shift();
          Undo.redoStack = [];
          Undo.save(); Undo.notify();
        }
      }
      Undo.last = cur; Undo.lastAuditKey = Undo.auditKey(this.s);
      return this.persist(str);   // the Node server (db.js)
    };
  },
  /** Start tracking; after a reload, bring back this user's history if the data still matches it. */
  start() {
    this.stack = []; this.redoStack = []; this.last = this.snap(DB.s); this.lastAuditKey = this.auditKey(DB.s);
    const k = this.storeKey(); if (!k) return;
    try {
      const saved = JSON.parse(localStorage.getItem(k) || 'null'); if (!saved) return;
      const top = saved.stack?.[saved.stack.length - 1], rd = saved.redo?.[saved.redo.length - 1];
      const matches = e => Object.entries(e).every(([key, v]) => (this.last[key] ?? null) === v);
      // keep the history only if nobody changed those records since (else an undo would overwrite their work)
      if (top ? matches(top.next) : true) this.stack = saved.stack || [];
      if (rd ? matches(rd.prev) && (!top || matches(top.next)) : false) this.redoStack = saved.redo || [];
      if (this.stack.length !== (saved.stack || []).length) this.save();
    } catch (e) { }
  },
  /** Someone else's changes arrived from the server: history touching those keys can no longer be undone safely. */
  external(keys) {
    this.last = this.snap(DB.s); this.lastAuditKey = this.auditKey(DB.s);
    const hit = e => keys.some(k => k in e.prev);
    if (this.stack.some(hit) || this.redoStack.some(hit)) { this.stack = []; this.redoStack = []; this.save(); this.paint(); }
  },
  allowed(entry) { return !!App.session && (App.has('ADMIN') || App.has('PRINCIPAL') || entry?.by === App.session.userId) && !['STUDENT', 'GUARDIAN'].includes(App.session.role); },
  /** Put back the given key values but keep the append-only logs and the id sequence. */
  restore(vals, verb, label) {
    for (const [k, v] of Object.entries(vals)) { if (this.KEEP.includes(k)) continue; if (v === null) delete DB.s[k]; else DB.s[k] = JSON.parse(v); }
    DB.audit(verb, 'system', label);
    this.quiet = true; DB.save(); this.quiet = false;
    this.save();
    try { Theme.apply(); Menus.apply(); FeatureCfg.apply(); } catch (e) { console.error(e); }
    App.details = []; App.render();
  },
  undo() {
    const e = this.stack[this.stack.length - 1];
    if (!e) return toast('পূর্বাবস্থায় ফেরানোর মতো কিছু নেই।', 'warn');
    if (!this.allowed(e)) return toast('আপনি শুধু নিজের পরিবর্তনগুলো পূর্বাবস্থায় ফেরাতে পারেন।', 'error');
    this.stack.pop(); this.redoStack.push(e);
    this.restore(e.prev, 'UNDO', `পূর্বাবস্থায় ফেরানো হয়েছে: ${e.label}`); toast(`পূর্বাবস্থায় ফেরানো হয়েছে: ${e.label}`, 'success');
  },
  redo() {
    const e = this.redoStack.pop(); if (!e) return toast('পুনরায় করার মতো কিছু নেই।', 'warn');
    this.stack.push(e);
    this.restore(e.next, 'REDO', `পুনরায় করা হয়েছে: ${e.label}`); toast(`পুনরায় করা হয়েছে: ${e.label}`, 'success');
  },
  /** Roll back every change after (and including) history entry i. */
  restoreTo(i) {
    const e = this.stack[i]; if (!e) return;
    const n = this.stack.length - i;
    if (this.stack.slice(i).some(x => !this.allowed(x))) return toast('এর কিছু পরিবর্তন অন্য ব্যবহারকারী করেছেন — অধ্যক্ষ বা রুট ব্যবহারকারীর সঙ্গে যোগাযোগ করুন।', 'error');
    if (!confirm(`“${e.label}”-এর আগের অবস্থায় ফিরে যেতে ${bnNum(n)}টি পরিবর্তন বাতিল করবেন?`)) return;
    const vals = {};   // newest → oldest, so the oldest "before" value wins for each key
    for (let k = this.stack.length - 1; k >= i; k--) { const x = this.stack[k]; Object.assign(vals, x.prev); this.redoStack.push(x); }
    this.stack.length = i;
    this.restore(vals, 'UNDO', `আগের অবস্থায় পুনরুদ্ধার করা হয়েছে: ${e.label} (${bnNum(n)}টি পরিবর্তন)`); toast(`${bnNum(n)}টি পরিবর্তন বাতিল করা হয়েছে।`, 'success');
  },
  /* ----- UI: header buttons + snackbar ----- */
  paint() {
    const box = $('#undo-bar'); if (!box) return;
    const show = App.session && !['STUDENT', 'GUARDIAN'].includes(App.session.role);
    if (!show) { box.innerHTML = ''; return; }
    const top = this.stack[this.stack.length - 1], rd = this.redoStack[this.redoStack.length - 1], wasOpen = $('#undo-menu') && !$('#undo-menu').classList.contains('hidden');
    box.innerHTML = `<div class="relative flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
      <button class="p-1.5 rounded-md hover:bg-white disabled:opacity-40" ${top ? '' : 'disabled'} title="${top ? 'পূর্বাবস্থায় ফেরান: ' + esc(top.label) + ' (Ctrl+Z)' : 'পূর্বাবস্থায় ফেরানোর মতো কিছু নেই'}" onclick="Undo.undo()">${icon('undo-2', 'w-4 h-4')}</button>
      <button class="p-1.5 rounded-md hover:bg-white disabled:opacity-40" ${rd ? '' : 'disabled'} title="${rd ? 'পুনরায় করুন: ' + esc(rd.label) + ' (Ctrl+Y)' : 'পুনরায় করার মতো কিছু নেই'}" onclick="Undo.redo()">${icon('redo-2', 'w-4 h-4')}</button>
      <button class="p-1.5 rounded-md hover:bg-white flex items-center gap-1 text-xs font-semibold text-slate-600" title="পরিবর্তনের ইতিহাস" onclick="document.getElementById('undo-menu').classList.toggle('hidden')">${icon('history', 'w-4 h-4')}<span class="hidden xl:inline">${bnNum(this.stack.length)}</span></button>
      <div id="undo-menu" class="hidden absolute right-0 top-full mt-2 w-96 max-w-[90vw] card p-2 shadow-xl z-50"><div class="px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">সাম্প্রতিক পরিবর্তন</div>
        <div class="max-h-80 overflow-y-auto divide-y divide-slate-100">${[...this.stack].map((x, i) => [x, i]).reverse().map(([x, i]) => `<div class="px-2 py-2 flex items-start gap-2 text-sm"><div class="flex-1 min-w-0"><div class="leading-snug line-clamp-2">${esc(x.label)}</div><div class="text-[11px] text-slate-400">${U.fmtTime(x.at)} · ${esc(pn(DB.user(x.by)) || 'সিস্টেম')}</div></div><button class="btn btn-ghost btn-sm shrink-0" onclick="Undo.restoreTo(${i})" title="এটি এবং এর পরের সব পরিবর্তন পূর্বাবস্থায় ফেরান">${icon('rotate-ccw')} এর আগের অবস্থায় ফেরান</button></div>`).join('') || '<div class="px-2 py-4 text-sm text-slate-400">এখনো কোনো পরিবর্তন নেই।</div>'}</div></div></div>`;
    if (wasOpen) $('#undo-menu')?.classList.remove('hidden');
    App.icons();
  },
  notify() {
    setTimeout(() => {
      this.paint();
      const top = this.stack[this.stack.length - 1]; if (!top || !$('#undo-bar') || !this.allowed(top)) return;
      let bar = $('#undo-snack'); if (!bar) { bar = document.createElement('div'); bar.id = 'undo-snack'; bar.className = 'fixed bottom-4 left-4 z-[60] max-w-sm'; document.body.appendChild(bar); }
      // already showing: change only the label (no re-created card, no replayed animation)
      const lab = bar.querySelector('[data-undo-label]');
      if (lab) { lab.textContent = top.label; lab.title = top.label; bar.firstElementChild.classList.add('shown'); }
      else { bar.innerHTML = `<div class="card shadow-xl px-4 py-2.5 flex items-center gap-3 text-sm fade-in">${icon('check-circle-2', 'w-4 h-4 text-emerald-600 shrink-0')}<span data-undo-label class="flex-1 min-w-0 truncate" title="${esc(top.label)}">${esc(top.label)}</span><button class="font-semibold text-brand-700 hover:underline shrink-0" onclick="Undo.undo();document.getElementById('undo-snack').innerHTML=''">পূর্বাবস্থায় ফেরান</button></div>`; App.icons(); }
      clearTimeout(this._t); this._t = setTimeout(() => { if (bar) bar.innerHTML = ''; }, 7000);
    }, 0);
  },
};
Undo.hook();

// Start tracking after boot (boot-time jobs are not undoable); reset per sign-in.
(() => {
  const r0 = App.render, l0 = App.login, o0 = App.logout;
  App.render = function () { if (Undo.last === null) Undo.start(); const out = r0.apply(this, arguments); Undo.paint(); return out; };
  App.login = function () { const out = l0.apply(this, arguments); Undo.start(); Undo.paint(); return out; };
  App.logout = function () { const uid = App.session?.userId; const out = o0.apply(this, arguments); if (uid) Undo.clear(uid); Undo.start(); return out; };
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || !$('#undo-bar')?.innerHTML) return;
    if (e.target.closest('input, textarea, select, [contenteditable]')) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); Undo.undo(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); Undo.redo(); }
  });
  document.addEventListener('click', e => { const m = $('#undo-menu'); if (m && !m.parentElement.contains(e.target)) m.classList.add('hidden'); });
})();
