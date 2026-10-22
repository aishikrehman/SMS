/* ==========================================================================
   প্ল্যাটফর্ম সরঞ্জাম — সার্ভারের সঙ্গে যুক্ত পাতা
   · রিসাইকেল বিন (শুধু রুট ব্যবহারকারী): মুছে ফেলা প্রতিটি রেকর্ড সার্ভারে জমা থাকে (server/bin.js, server/admin.js)
   · পরীক্ষামূলক ডেটা (শুধু রুট): ডেমো ডেটা লোড / সব মুছে নতুন করে শুরু — আগে স্বয়ংক্রিয় ব্যাকআপ
   · TrxID যাচাই (হিসাব শাখা): শিক্ষার্থী/অভিভাবকের দাবি সার্ভারে যাচাই; অনলাইন পেমেন্ট সার্ভারের মাধ্যমে (server/pay.js)
   · পাসওয়ার্ড সহায়তা: সাইডবারে ব্যাজ, ড্যাশবোর্ডে কার্ড, অনুরোধের অবস্থা দেখা
   ========================================================================== */

const PLAT_ST = { Pending: ['অপেক্ষমাণ', 'amber'], Verified: ['যাচাইকৃত', 'green'], Rejected: ['বাতিল (মেলেনি)', 'red'], Cancelled: ['প্রত্যাহার', 'slate'], Done: ['নিষ্পন্ন', 'green'], Closed: ['বন্ধ', 'slate'] };
const platBadge = s => badge((PLAT_ST[s] || [bn(s)])[0], (PLAT_ST[s] || [0, 'slate'])[1]);

/* ---------------- রিসাইকেল বিন ---------------- */
const RecycleBin = {
  ui() { return App.ui.bin || (App.ui.bin = { q: '', key: '', from: '', to: '', offset: 0, data: null, loading: false, err: '' }); },
  async load() {
    const u = this.ui(); u.loading = true; u.err = '';
    const qs = new URLSearchParams({ q: u.q, key: u.key, from: u.from, to: u.to, offset: u.offset, limit: 50 }).toString();
    try { u.data = await DB.api('admin/bin?' + qs, undefined, 'GET'); } catch (e) { u.err = e.status === 403 ? 'শুধু রুট ব্যবহারকারী রিসাইকেল বিন দেখতে পারেন।' : 'সার্ভার থেকে তালিকা আনা যায়নি।'; }
    u.loading = false; App.refresh();
  },
  /** The রিসাইকেল বিন tab of ডাটাবেজ ব্যবস্থাপনা (js/modules/hubs.js). */
  page() {
    if (!App.has('ADMIN')) return emptyState('শুধু রুট ব্যবহারকারী রিসাইকেল বিন দেখতে পারেন।', 'lock');
    const u = this.ui(), d = u.data;
    const head = `<div class="flex flex-wrap gap-2 mb-4"><button class="btn btn-ghost" onclick="RecycleBin.load()">${icon('refresh-cw')} হালনাগাদ</button><button class="btn btn-ghost text-red-700" onclick="RecycleBin.empty()">${icon('trash-2')} বিন খালি করুন</button></div>`;
    if (u.err) return head + `<div class="card p-5 text-red-700">${esc(u.err)}</div>`;
    if (!d) return head + `<div class="card p-8 text-center text-slate-500">${icon('loader', 'w-6 h-6 mx-auto mb-2 animate-spin')}তালিকা আনা হচ্ছে…</div>`;
    const filters = `<form class="card p-4 mb-4 grid sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end" onsubmit="RecycleBin.filter(this);return false">
      <div class="lg:col-span-2"><label class="label" for="bin-q">খুঁজুন</label><input id="bin-q" class="input" name="q" value="${esc(u.q)}" placeholder="নাম, আইডি বা কে মুছেছেন…"></div>
      <div><label class="label" for="bin-key">ধরন</label><select id="bin-key" class="select" name="key"><option value="">সব ধরন (${bnNum(d.all)})</option>${d.keys.map(k => `<option value="${esc(k.key)}" ${k.key === u.key ? 'selected' : ''}>${esc(k.label)} (${bnNum(k.n)})</option>`).join('')}</select></div>
      <div><label class="label" for="bin-from">তারিখ থেকে</label><input id="bin-from" class="input" type="date" name="from" value="${esc(u.from)}"></div>
      <div><label class="label" for="bin-to">তারিখ পর্যন্ত</label><input id="bin-to" class="input" type="date" name="to" value="${esc(u.to)}"></div>
      <div class="sm:col-span-2 lg:col-span-5 flex flex-wrap gap-2"><button class="btn btn-primary">${icon('filter')} ফিল্টার</button><button type="button" class="btn btn-ghost" onclick="App.ui.bin=null;RecycleBin.load()">মুছে দিন</button></div></form>`;
    const row = e => {
      const n = (d.batchSizes || {})[e.batch] || 1;
      return `<div class="px-4 py-3 flex flex-wrap items-center gap-3"><div class="flex-1 min-w-[14rem]"><div class="font-semibold break-words">${esc(e.label)}</div>
        <div class="text-slate-500 break-words">${badge(this.typeLabel(e.key, d), 'blue')} ${esc(U.fmtTime(e.deletedAt))} · ${esc(e.deletedByName || e.deletedBy || 'সার্ভার')} · আইপি ${esc(e.ip || '—')}${n > 1 ? ` · একই সঙ্গে আরও ${bnNum(n - 1)}টি` : ''}</div></div>
        <div class="flex flex-wrap gap-2"><button class="btn btn-ghost btn-sm" onclick="RecycleBin.preview('${esc(e.id)}')">${icon('eye')} দেখুন</button><button class="btn btn-primary btn-sm" onclick="RecycleBin.restore('${esc(e.id)}')">${icon('undo-2')} ফেরত আনুন</button>${n > 1 ? `<button class="btn btn-ghost btn-sm" onclick="RecycleBin.restoreBatch('${esc(e.batch)}',${n})">${icon('layers')} সবগুলো ফেরত (${bnNum(n)})</button>` : ''}<button class="btn btn-ghost btn-sm text-red-700" onclick="RecycleBin.purge('${esc(e.id)}')" aria-label="স্থায়ীভাবে মুছুন">${icon('x')}</button></div></div>`;
    };
    const pager = d.total > 50 ? `<div class="px-4 py-3 flex flex-wrap items-center gap-2 border-t border-slate-100"><span class="text-slate-500">${bnNum(u.offset + 1)}–${bnNum(Math.min(u.offset + 50, d.total))} / ${bnNum(d.total)}</span><button class="btn btn-ghost btn-sm ml-auto" ${u.offset ? '' : 'disabled'} onclick="RecycleBin.page_(-1)">${icon('chevron-left')} আগের</button><button class="btn btn-ghost btn-sm" ${u.offset + 50 < d.total ? '' : 'disabled'} onclick="RecycleBin.page_(1)">পরের ${icon('chevron-right')}</button></div>` : '';
    return head + `<div class="card p-4 mb-4 flex flex-wrap items-center gap-3">${icon('timer', 'w-5 h-5 text-brand-600')}<span class="flex-1 min-w-[12rem]">${bnNum(d.days)} দিনের পুরোনো রেকর্ড স্বয়ংক্রিয়ভাবে স্থায়ীভাবে মুছে যায়।</span>
        <form class="flex flex-wrap gap-2 items-center" onsubmit="RecycleBin.setDays(this);return false"><label class="sr-only" for="bin-days">দিন</label><input id="bin-days" class="input !w-28" type="number" min="1" max="3650" name="days" value="${d.days}"><button class="btn btn-ghost btn-sm">${icon('save')} সংরক্ষণ</button></form></div>`
      + filters + `<div class="card"><div class="px-4 py-3 border-b border-slate-100 font-semibold">${bnNum(d.total)}টি রেকর্ড</div><div class="divide-y divide-slate-100">${d.items.map(row).join('') || emptyState('রিসাইকেল বিন খালি।', 'trash')}</div>${pager}</div>`;
  },
  typeLabel(key, d) { return ((d || this.ui().data || {}).keys || []).find(k => k.key === key)?.label || key; },
  mount() { const u = this.ui(); if (App.has('ADMIN') && !u.data && !u.loading && !u.err) this.load(); },
  filter(f) { const x = formData(f); Object.assign(this.ui(), { q: x.q || '', key: x.key || '', from: x.from || '', to: x.to || '', offset: 0 }); this.load(); },
  page_(dir) { const u = this.ui(); u.offset = Math.max(0, u.offset + dir * 50); this.load(); },
  async preview(id) {
    let e; try { e = await DB.api('admin/bin/' + encodeURIComponent(id), undefined, 'GET'); } catch (_) { return toast('রেকর্ডটি পাওয়া যায়নি।', 'error'); }
    const rows = e.record && typeof e.record === 'object' && !Array.isArray(e.record) ? Object.entries(e.record) : null;
    const val = v => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
    App.openDetail({ title: `রিসাইকেল বিন · ${e.label}`, render: () => `<div class="card p-5 space-y-3 max-w-4xl"><div class="flex flex-wrap gap-2 items-center">${badge(e.typeLabel, 'blue')}${e.exists ? badge('একই আইডির রেকর্ড এখন আছে', 'amber') : ''}</div>
      <div class="text-slate-600">মুছেছেন ${esc(e.deletedByName || e.deletedBy || 'সার্ভার')} · ${esc(U.fmtTime(e.deletedAt))} · আইপি ${esc(e.ip || '—')}</div>
      ${rows ? `<div class="scroll-x"><table class="table"><tbody>${rows.map(([k, v]) => `<tr><td class="font-mono whitespace-nowrap">${esc(k)}</td><td class="break-all">${/^data:/.test(String(v)) ? '(ফাইল)' : esc(val(v).slice(0, 600))}</td></tr>`).join('')}</tbody></table></div>` : `<pre class="whitespace-pre-wrap break-all bg-slate-50 rounded-lg p-3">${esc(JSON.stringify(e.record, null, 1).slice(0, 4000))}</pre>`}
      <div class="flex flex-wrap gap-2"><button class="btn btn-primary" onclick="RecycleBin.restore('${esc(e.id)}',true)">${icon('undo-2')} ফেরত আনুন</button><button class="btn btn-ghost text-red-700" onclick="RecycleBin.purge('${esc(e.id)}',true)">${icon('trash-2')} স্থায়ীভাবে মুছুন</button></div></div>` });
  },
  async after(msg, back) { toast(msg, 'success'); if (back && App.details?.length) App.closeDetail(); await DB.flush(); await DB.pull(); this.load(); },
  async restore(id, back, overwrite = false) {
    try { await DB.api(`admin/bin/${encodeURIComponent(id)}/restore`, { overwrite }); }
    catch (e) {
      if (e.status === 409 && !overwrite) { if (confirm('এই আইডির একটি রেকর্ড এখন আবার আছে। পুরোনোটি দিয়ে বর্তমান রেকর্ডটি প্রতিস্থাপন করবেন?')) return this.restore(id, back, true); return; }
      return toast('ফেরত আনা যায়নি।', 'error');
    }
    this.after('রেকর্ডটি ফেরত আনা হয়েছে।', back);
  },
  async restoreBatch(batch, n) {
    if (!confirm(`একই সময়ে মুছে ফেলা ${bnNum(n)}টি রেকর্ড একসঙ্গে ফেরত আনবেন?`)) return;
    let r; try { r = await DB.api('admin/bin/batch/restore', { batch }); } catch (_) { return toast('ফেরত আনা যায়নি।', 'error'); }
    this.after(`${bnNum(r.restored.length)}টি রেকর্ড ফেরত আনা হয়েছে${r.conflicts.length ? `; ${bnNum(r.conflicts.length)}টির আইডি এখন ব্যবহৃত, তাই বাদ` : ''}।`);
  },
  async purge(id, back) {
    if (!confirm('রেকর্ডটি স্থায়ীভাবে মুছে ফেলবেন? এটি আর ফেরত আনা যাবে না।')) return;
    try { await DB.api(`admin/bin/${encodeURIComponent(id)}/purge`, { confirm: true }); } catch (_) { return toast('মুছে ফেলা যায়নি।', 'error'); }
    this.after('রেকর্ডটি স্থায়ীভাবে মুছে ফেলা হয়েছে।', back);
  },
  async empty() {
    const phrase = 'বিন খালি করুন';
    const t = prompt(`রিসাইকেল বিনের সব রেকর্ড স্থায়ীভাবে মুছে যাবে। নিশ্চিত করতে লিখুন: ${phrase}`);
    if (t === null) return; if (t.trim() !== phrase) return toast('নিশ্চিতকরণ বাক্য মেলেনি।', 'error');
    let r; try { r = await DB.api('admin/bin/empty', { phrase }); } catch (_) { return toast('বিন খালি করা যায়নি।', 'error'); }
    this.after(`${bnNum(r.removed)}টি রেকর্ড স্থায়ীভাবে মুছে ফেলা হয়েছে।`);
  },
  async setDays(f) {
    const days = +formData(f).days;
    try { await DB.api('admin/bin/settings', { days }); } catch (_) { return toast('দিনের সংখ্যা ১ থেকে ৩৬৫০-এর মধ্যে দিন।', 'error'); }
    this.after(`${bnNum(days)} দিন পরে স্বয়ংক্রিয়ভাবে মুছে যাবে।`);
  },
};

/* ---------------- পরীক্ষামূলক ডেটা ---------------- */
const DemoData = {
  KEY: 'dhee.demoResult',
  ui() { return App.ui.demo || (App.ui.demo = { info: null, busy: '' }); },
  result() { try { return JSON.parse(sessionStorage.getItem(this.KEY) || 'null'); } catch (e) { return null; } },
  page() {
    if (!App.has('ADMIN')) return emptyState('শুধু রুট ব্যবহারকারী এই অংশ ব্যবহার করতে পারেন।', 'lock');
    const u = this.ui(), info = u.info, res = this.result();
    const done = res ? `<div class="card p-5 mb-5 bg-emerald-50 border-emerald-200 space-y-3"><div class="font-semibold flex items-center gap-2">${icon('check-circle-2', 'w-5 h-5 text-emerald-700')} ${res.kind === 'demo' ? 'ডেমো ডেটা লোড হয়েছে' : 'সব ডেটা মুছে নতুন করে শুরু হয়েছে'}</div>
        <p>আগের ডেটার ব্যাকআপ: <b class="font-mono break-all">${esc(res.backup)}</b>। অন্য সবাইকে লগআউট করা হয়েছে।</p>
        ${res.logins ? `<div class="scroll-x"><table class="table"><thead><tr><th>কে</th><th>ইউজার আইডি</th><th>পাসওয়ার্ড</th></tr></thead><tbody>${res.logins.map(([w, id, pw]) => `<tr><td>${esc(w)}</td><td class="font-mono">${esc(id)}</td><td class="font-mono">${esc(pw)}</td></tr>`).join('')}</tbody></table></div><p class="text-slate-600">${esc(res.note || '')}</p>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="sessionStorage.removeItem('${this.KEY}');App.refresh()">${icon('x')} বার্তাটি সরান</button></div>` : '';
    if (!info) return done +`<div class="card p-8 text-center text-slate-500">${icon('loader', 'w-6 h-6 mx-auto mb-2 animate-spin')}তথ্য আনা হচ্ছে…</div>`;
    const off = !info.allowed;
    const card = (kind, ic, title, text, phrase, btn, tone) => `<form class="card p-5 space-y-3" onsubmit="DemoData.run('${kind}',this);return false"><div class="font-semibold flex items-center gap-2">${icon(ic, 'w-5 h-5 ' + tone)} ${title}</div><p class="text-slate-600">${text}</p>
      <div><label class="label" for="dd-${kind}">নিশ্চিত করতে লিখুন: <b>${esc(phrase)}</b></label><input id="dd-${kind}" class="input" name="phrase" autocomplete="off" ${off ? 'disabled' : ''} required></div>
      <button class="btn ${kind === 'reset' ? 'bg-red-600 text-white hover:bg-red-700' : 'btn-primary'} w-full" ${off || u.busy ? 'disabled' : ''}>${u.busy === kind ? `${icon('loader', 'w-4 h-4 animate-spin')} কাজ চলছে…` : `${icon(ic)} ${btn}`}</button></form>`;
    return done
      + (off ? `<div class="card p-4 mb-5 bg-amber-50 border-amber-200">${icon('lock', 'w-4 h-4 inline')} এই সার্ভারে সুবিধাটি বন্ধ (ALLOW_DEMO_LOAD=false)। চালু প্রতিষ্ঠানের জন্য এটাই নিরাপদ।</div>` : '')
      + `<div class="grid lg:grid-cols-2 gap-5 items-start">${card('demo', 'database', 'ডেমো ডেটা লোড করুন', 'বর্তমান সব ডেটা (শিক্ষার্থী, শিক্ষক, ফি, হিসাব …) ডেমো প্রতিষ্ঠান “ধী একাডেমি” দিয়ে প্রতিস্থাপিত হবে। আপনার রুট অ্যাকাউন্ট ও পাসওয়ার্ড একই থাকবে; ডেমোর অন্য ব্যবহারকারীরা যুক্ত হবেন।', info.demoPhrase, 'ডেমো ডেটা লোড করুন', 'text-brand-600')}
        ${card('reset', 'rotate-ccw', 'সব ডেটা মুছে নতুন করে শুরু', 'সব শিক্ষার্থী, কর্মী, লেনদেন ও সেটিংস মুছে যাবে। থাকবে শুধু আপনার রুট অ্যাকাউন্ট এবং প্রতিষ্ঠানের পরিচয় (নাম, লোগো, ধরন, ইআইআইএন, থিম)।', info.resetPhrase, 'সব ডেটা মুছে নতুন করে শুরু', 'text-red-600')}</div>`;
  },
  async mount() { const u = this.ui(); if (App.has('ADMIN') && !u.info && !u.loading) { u.loading = true; try { u.info = await DB.api('admin/demo', undefined, 'GET'); } catch (e) { u.info = { allowed: false, demoPhrase: '', resetPhrase: '' }; } u.loading = false; App.refresh(); } },
  async run(kind, f) {
    const u = this.ui(), phrase = String(formData(f).phrase || '').trim(), want = kind === 'demo' ? u.info.demoPhrase : u.info.resetPhrase;
    if (phrase !== want) return toast('নিশ্চিতকরণ বাক্য মেলেনি।', 'error');
    if (!confirm(kind === 'demo' ? 'বর্তমান ডেটা ডেমো ডেটা দিয়ে প্রতিস্থাপন করবেন? (আগে ব্যাকআপ নেওয়া হবে)' : 'সব ডেটা মুছে ফেলবেন? (আগে ব্যাকআপ নেওয়া হবে)')) return;
    u.busy = kind; App.refresh();
    try { await DB.flush(); } catch (e) { }
    let r;
    try { r = await DB.api(kind === 'demo' ? 'admin/demo/load' : 'admin/demo/reset', { phrase }); }
    catch (e) { u.busy = ''; App.refresh(); return toast(e.status === 403 ? 'এই সার্ভারে সুবিধাটি বন্ধ।' : e.status === 409 ? 'আরেকটি কাজ চলছে — একটু পরে চেষ্টা করুন।' : 'কাজটি সম্পন্ন হয়নি — সার্ভারের লগ দেখুন।', 'error'); }
    try { sessionStorage.setItem(this.KEY, JSON.stringify({ kind, backup: r.backup, logins: r.logins || null, note: r.note || '' })); } catch (e) { }
    // the whole state changed on the server: never send this tab's old copy back
    DB.remote.on = false;
    if (App.session && r.rootId) { App.session.userId = r.rootId; App.persistSession(); }
    location.href = App.href('admin', 'database') + '?tab=demo';
  },
};

/* ---------------- TrxID যাচাই ও অনলাইন পেমেন্ট ---------------- */
const PayDesk = {
  claims() { return DB.s.payClaims || []; },
  pendingIds() { return new Set(this.claims().filter(c => c.status === 'Pending').flatMap(c => c.invoiceIds || [])); },
  canVerify() { return App.has('ADMIN') || App.perm('fees', 'edit'); },
  page() {
    const tab = App.ui.pcTab || 'Pending', all = [...this.claims()].sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const list = tab === 'all' ? all : all.filter(c => c.status === tab), n = all.filter(c => c.status === 'Pending').length;
    const can = this.canVerify();
    const row = c => { const st = DB.student(c.studentId), payer = DB.user(c.by); return `<div class="px-4 py-3 flex flex-wrap items-center gap-3"><div class="flex-1 min-w-[14rem]"><div class="font-semibold">${esc(st ? pn(st) : c.studentId)} · ${U.money(c.amount)}</div>
      <div class="text-slate-600 break-words">${esc(bn(c.method))} · TrxID <b class="font-mono">${esc(c.txn)}</b>${c.msisdn ? ` · নম্বর ${esc(c.msisdn)}` : ''} · ${esc(U.fmtTime(c.at))}${payer ? ` · ${esc(pn(payer))}` : ''}</div>
      <div class="text-slate-500 break-words">${(c.invoiceIds || []).map(id => esc(DB.s.invoices.find(i => i.id === id)?.item || id)).join(', ')}${c.reason ? ` · কারণ: ${esc(c.reason)}` : ''}${c.paymentId ? ` · রসিদ ${esc(c.paymentId)}` : ''}</div></div>
      ${platBadge(c.status)}${c.status === 'Pending' && can ? `<div class="flex flex-wrap gap-2"><button class="btn btn-primary btn-sm" onclick="PayDesk.verify('${esc(c.id)}')">${icon('check')} মিলেছে — গ্রহণ</button><button class="btn btn-ghost btn-sm text-red-700" onclick="PayDesk.reject('${esc(c.id)}')">${icon('x')} মেলেনি</button></div>` : ''}</div>`; };
    return pageHeader('TrxID যাচাই')
      + pills([['Pending', `অপেক্ষমাণ (${bnNum(n)})`, 'clock'], ['Verified', 'যাচাইকৃত', 'check'], ['Rejected', 'বাতিল', 'x'], ['all', 'সব', 'list']], tab, id => `App.ui.pcTab='${id}';App.refresh()`)
      + `<div class="card divide-y divide-slate-100">${list.map(row).join('') || emptyState('কোনো দাবি নেই।', 'receipt')}</div>`;
  },
  async verify(id) {
    const c = this.claims().find(x => x.id === id); if (!c) return;
    if (!confirm(`TrxID ${c.txn}, ${U.money(c.amount)} — বিবরণীর সঙ্গে মিলেছে? গ্রহণ করলে রসিদ তৈরি হবে।`)) return;
    try { await DB.flush(); const r = await DB.api(`pay/claims/${encodeURIComponent(id)}/verify`, {}); toast(`গৃহীত হয়েছে — রসিদ ${r.payment.id}`, 'success'); }
    catch (e) { toast({ invoice_changed: 'বিলটি এর মধ্যে পরিশোধিত বা পরিবর্তিত হয়েছে — দাবিটি বাতিল করুন।', trx_used: 'এই TrxID অন্য পরিশোধে ব্যবহৃত হয়েছে।', not_pending: 'দাবিটি আগেই নিষ্পন্ন হয়েছে।' }[e.message] || (e.status === 403 ? 'অনুমতি নেই।' : 'গ্রহণ করা যায়নি।'), 'error'); }
    await DB.pull(); App.refresh();
  },
  async reject(id) {
    const reason = prompt('কেন মেলেনি? (দাবিকারী এসএমএসে জানবেন)', 'বিবরণীতে এই TrxID পাওয়া যায়নি'); if (reason === null) return;
    try { await DB.flush(); await DB.api(`pay/claims/${encodeURIComponent(id)}/reject`, { reason }); toast('দাবিটি বাতিল করা হয়েছে।'); } catch (e) { toast('বাতিল করা যায়নি।', 'error'); }
    await DB.pull(); App.refresh();
  },
  /** Learner's own claims under the fee page. */
  mine(studentId) {
    const L = this.claims().filter(c => c.studentId === studentId).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 10); if (!L.length) return '';
    return `<div class="card mt-5"><div class="px-5 py-3 border-b border-slate-100 font-semibold">জমা দেওয়া ট্রানজ্যাকশন আইডি (TrxID)</div><div class="divide-y divide-slate-100">${L.map(c => `<div class="px-5 py-3 flex flex-wrap items-center gap-3"><div class="flex-1 min-w-[12rem]"><b>${U.money(c.amount)}</b> · ${esc(bn(c.method))} · <span class="font-mono">${esc(c.txn)}</span><div class="text-slate-500">${esc(U.fmtTime(c.at))}${c.reason ? ` · ${esc(c.reason)}` : ''}${c.paymentId ? ` · রসিদ ${esc(c.paymentId)}` : ''}</div></div>${platBadge(c.status)}${c.status === 'Pending' && c.by === App.session?.userId ? `<button class="btn btn-ghost btn-sm" onclick="PayDesk.cancel('${esc(c.id)}')">প্রত্যাহার</button>` : ''}</div>`).join('')}</div></div>`;
  },
  cancel(id) { const c = this.claims().find(x => x.id === id); if (!c || !confirm('দাবিটি প্রত্যাহার করবেন?')) return; c.status = 'Cancelled'; c.cancelledAt = new Date().toISOString(); DB.save(); App.refresh(); },
  /** A learner submits a TrxID claim; the server marks the invoices paid only after an accountant verifies it. */
  claim(m, txn, meta) {
    const { studentId, ids } = Guardian._pending || {};
    const invs = DB.s.invoices.filter(i => (ids || []).includes(i.id) && i.status === 'unpaid'); if (!invs.length) { Modal.close(); return toast('বিলটি আর অপরিশোধিত নেই।', 'warn'); }
    const amount = U.sum(invs, i => i.amount), list = DB.s.payClaims || (DB.s.payClaims = []);
    const c = { id: DB.id('PCL'), studentId, invoiceIds: invs.map(i => i.id), amount, method: m, txn: String(txn).toUpperCase(), msisdn: meta.msisdn || null, by: App.session.userId, at: new Date().toISOString(), status: 'Pending' };
    list.push(c);
    DB.audit('PAY_CLAIM', 'payments', `${pn(DB.student(studentId))}: ${U.money(amount)} — ${bn(m)} TrxID ${c.txn} যাচাইয়ের জন্য জমা (${c.id})`); DB.save();
    Modal.open({ title: 'ট্রানজ্যাকশন আইডি জমা হয়েছে', size: 'sm', body: `<div class="text-center space-y-2"><div class="w-14 h-14 mx-auto rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">${icon('clock', 'w-7 h-7')}</div><div class="text-2xl font-extrabold">${U.money(amount)}</div><div>${esc(bn(m))} · TrxID <span class="font-mono">${esc(c.txn)}</span></div><p class="text-amber-800">হিসাব শাখা ${esc(bn(m))} বিবরণীর সঙ্গে মিলিয়ে গ্রহণ করলে বিলটি পরিশোধিত দেখাবে এবং রসিদ পাবেন।</p></div>` });
    App.refresh();
  },
};
App.addPage('principal', { id: 'pay-claims', label: 'TrxID যাচাই', icon: 'badge-check', module: 'fees', group: 'অর্থ ও হিসাব', count: () => PayDesk.claims().filter(c => c.status === 'Pending').length || '', render() { return PayDesk.page(); } }, 'fees');
App.addPage('admin', { id: 'pay-claims', label: 'TrxID যাচাই', icon: 'badge-check', module: 'fees', group: 'অর্থ ও হিসাব', count: () => PayDesk.claims().filter(c => c.status === 'Pending').length || '', render() { return PayDesk.page(); } });

// learners: a TrxID becomes a claim (never a payment); online checkout goes through the school's server
Guardian.onPaid = function (m, txn, meta) { return PayDesk.claim(m, txn, meta); };
(() => {
  const guard = (obj, name) => { const f0 = obj.pay; obj.pay = function () { const pend = PayDesk.pendingIds(); if ($$(`input[name=${name}]:checked`).some(x => pend.has(x.value))) return toast('নির্বাচিত বিলের একটির TrxID যাচাইয়ের অপেক্ষায় আছে — সেটি বাদ দিয়ে নির্বাচন করুন।', 'warn'); return f0.apply(this, arguments); }; };
  guard(Guardian, 'inv'); if (typeof FeesDesk !== 'undefined') guard(FeesDesk, 'sinv');
  const addMine = (portal, who) => { const p = App.portals[portal]?.pages.find(x => x.id === 'fees'); if (!p) return; const r0 = p.render; p.render = function () { const h = r0.apply(this, arguments); const s = who(); return s ? h + PayDesk.mine(s.id) : h; }; };
  addMine('guardian', () => Guardian.child()); addMine('student', () => (typeof Student !== 'undefined' ? Student.me() : null));
})();
PayGw.start = async function (method, amount, ref, cb) {
  const learner = cb === 'Guardian.onPaid' || cb === 'FeesDesk.onPaid', P = learner ? (cb === 'FeesDesk.onPaid' ? FeesDesk._pending : Guardian._pending) : null;
  if (!P) return toast('অনলাইন পেমেন্ট শুধু পোর্টালের ফি পাতা থেকে করা যায় — এখানে ট্রানজ্যাকশন আইডি (TrxID) দিয়ে বা অফিসে পরিশোধ করুন।', 'warn');
  try {
    const r = await DB.api('pay/checkout', { studentId: P.studentId, invoiceIds: P.ids, method, portal: cb === 'FeesDesk.onPaid' ? 'student' : 'guardian' });
    location.href = r.url;
  } catch (e) {
    toast(e.status === 503 ? 'অনলাইন পেমেন্ট এখনো চালু হয়নি — TrxID দিয়ে বা অফিসে পরিশোধ করুন।' : e.message === 'claim_pending' ? 'এই বিলের একটি TrxID যাচাইয়ের অপেক্ষায় আছে।' : e.message === 'invoice_changed' ? 'বিলটি এর মধ্যে বদলে গেছে — পাতা হালনাগাদ করুন।' : 'পেমেন্ট শুরু করা যায়নি — একটু পরে আবার চেষ্টা করুন।', 'error');
  }
};

/* ---------------- পাসওয়ার্ড সহায়তা: অফিস যেন সহজে দেখে ---------------- */
const PwHelp = {
  pending() { return (DB.s.pwRequests || []).filter(r => r.status === 'Pending'); },
  /** Root User, or anyone given system: edit (role permission or per-user override). */
  canReset() { const uid = App.session?.userId; return App.has('ADMIN') || App.perm('system', 'edit') || DB.s.userPerms?.[uid]?.system?.edit === true; },
  card() {
    const L = this.pending(); if (!L.length) return '';
    const last = L[0], can = this.canReset(), portal = App.route.portal;
    const go = App.portals[portal]?.pages.some(p => p.id === 'user-admin') ? portal : 'admin';
    return `<div class="card p-4 mb-5 flex flex-wrap items-center gap-3 bg-amber-50 border-amber-200">${icon('key-round', 'w-6 h-6 text-amber-700')}<div class="flex-1 min-w-[12rem]"><div class="font-semibold">পাসওয়ার্ড সহায়তার ${bnNum(L.length)}টি অনুরোধ অপেক্ষমাণ</div><div class="text-slate-600 break-words">সর্বশেষ: ${esc(last.id)} · “${esc(last.given)}” · ${esc(U.fmtTime(last.at))}</div></div>
      ${can ? `<button class="btn btn-primary btn-sm" onclick="App.ui.usrTab='requests';App.go('${go}','user-admin')">${icon('arrow-right')} অনুরোধগুলো দেখুন</button>` : ''}</div>`;
  },
  claimsCard() {
    const n = PayDesk.claims().filter(c => c.status === 'Pending').length; if (!n || !PayDesk.canVerify()) return '';
    return `<div class="card p-4 mb-5 flex flex-wrap items-center gap-3 bg-blue-50 border-blue-200">${icon('badge-check', 'w-6 h-6 text-blue-700')}<div class="flex-1 min-w-[12rem] font-semibold">${bnNum(n)}টি ট্রানজ্যাকশন আইডি (TrxID) যাচাইয়ের অপেক্ষায়</div><button class="btn btn-ghost btn-sm" onclick="App.go(App.route.portal,'pay-claims')">${icon('arrow-right')} যাচাই করুন</button></div>`;
  },
  /** Public reset page: status of an office request by request id + mobile number. */
  statusBox(ref) {
    return `<section class="max-w-lg mx-auto px-4 pb-10"><form class="card p-6 space-y-3" onsubmit="PwHelp.check(this);return false"><div class="font-semibold flex items-center gap-2">${icon('search', 'w-5 h-5 text-brand-600')} আইটি অফিসে পাঠানো অনুরোধের অবস্থা</div>
      <div><label class="label" for="pws-id">রেফারেন্স (যেমন PR123456)</label><input id="pws-id" class="input font-mono uppercase" name="id" required value="${esc(ref || '')}"></div>
      <div><label class="label" for="pws-ph">অ্যাকাউন্টের মোবাইল নম্বর</label><input id="pws-ph" class="input" name="phone" inputmode="tel" required placeholder="01XXXXXXXXX"></div>
      <button class="btn btn-ghost w-full">${icon('search')} অবস্থা দেখুন</button><div id="pws-out" role="status" aria-live="polite"></div></form></section>`;
  },
  async check(f) {
    const d = formData(f), out = $('#pws-out');
    let r; try { r = await DB.api('public/pwstatus', { id: U.asciiDigits(d.id).trim().toUpperCase(), phone: U.asciiDigits(d.phone) }); } catch (e) { out.innerHTML = `<p class="text-red-700">${e.status === 429 ? 'অনেকবার চেষ্টা হয়েছে — কিছুক্ষণ পরে আবার দেখুন।' : 'এখন দেখা যাচ্ছে না — আবার চেষ্টা করুন।'}</p>`; return; }
    out.innerHTML = r.found ? `<div class="card p-3 flex flex-wrap items-center gap-2">${platBadge(r.status)}<span>${r.status === 'Done' ? `আইটি অফিস ${esc(U.fmtTime(r.doneAt))}-এ নতুন অস্থায়ী পাসওয়ার্ড দিয়েছে। মোবাইলে না পেলে অফিসে যোগাযোগ করুন; প্রথম লগইনে পাসওয়ার্ড বদলাতে হবে।` : r.status === 'Pending' ? `অনুরোধটি ${esc(U.fmtTime(r.at))}-এ পৌঁছেছে, আইটি অফিস এখনো নিষ্পত্তি করেনি।` : 'অনুরোধটি বন্ধ করা হয়েছে। প্রয়োজনে নতুন অনুরোধ পাঠান বা অফিসে যোগাযোগ করুন।'}</span></div>`
      : '<p class="text-red-700">এই রেফারেন্স ও মোবাইল নম্বরে কোনো অনুরোধ পাওয়া যায়নি।</p>';
  },
};
// পাসওয়ার্ড অনুরোধ: a tab of ব্যবহারকারী ব্যবস্থাপনা (js/modules/hubs.js) for the Root User and anyone given system: edit
// dashboard notification cards (Root User: সিস্টেমের অবস্থা; Principal: সারসংক্ষেপ)
[['admin', 'system'], ['principal', 'overview']].forEach(([portal, id]) => {
  const p = App.portals[portal]?.pages.find(x => x.id === id); if (!p) return;
  const r0 = p.render; p.render = function () { return PwHelp.card() + PwHelp.claimsCard() + r0.apply(this, arguments); };
});
// IT office contact for new-request alerts (server/admin.js → server/lib/notify.js)
FeatureCfg.PARAMS['আইটি অফিস'] = [
  { k: 'itPhone', label: 'নতুন পাসওয়ার্ড অনুরোধে এসএমএস যাবে এই মোবাইলে', type: 'text', get: () => DB.s.config?.itOffice?.phone || '', set: v => { const c = DB.s.config || (DB.s.config = {}); (c.itOffice || (c.itOffice = {})).phone = v.trim(); } },
  { k: 'itEmail', label: 'নতুন পাসওয়ার্ড অনুরোধে ই-মেইল যাবে এই ঠিকানায়', type: 'text', get: () => DB.s.config?.itOffice?.email || '', set: v => { const c = DB.s.config || (DB.s.config = {}); (c.itOffice || (c.itOffice = {})).email = v.trim(); } },
];
