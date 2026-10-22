/* ==========================================================================
   CSV KIT — one reusable CSV import / export kit for every list
   --------------------------------------------------------------------------
   Import (step by step, all in the page — no pop-up):
     1. ফাইল — choose a .csv file or paste CSV text; download a template
        (Bangla or English column headers; Bangla digits are fine anywhere).
     2. কলাম মেলানো — every CSV column is matched to a field automatically
        (by English key, Bangla label or an alias); the user can change it.
     3. প্রিভিউ — every row with its errors (row skipped) and warnings (row kept);
        nothing is saved until "আমদানি করুন" is pressed. Only valid rows are saved.
   Export: a column chooser (which columns, Bangla or English headers, English or
   Bangla digits) that downloads UTF-8 CSV with BOM (opens correctly in Excel).

   API for other modules (holidays, library books …):

     CSVKit.register('books', {
       label: 'বই',                                  // shown in titles
       icon: 'book',                                 // lucide icon
       can: () => App.perm('logistics', 'edit'),     // may this user import? (optional)
       fields: [                                     // the importable fields
         { k: 'title', label: 'বইয়ের নাম', en: 'title', required: true, example: 'গণিত সহায়িকা' },
         { k: 'copies', label: 'কপি', en: 'copies', type: 'int', min: 1, example: '3' },
         { k: 'kind', label: 'ধরন', type: 'enum', options: [['Text', 'পাঠ্য'], ['Ref', 'সহায়ক']] },
         // type: 'text' (default) | 'int' | 'num' | 'date' (YYYY-MM-DD or DD/MM/YYYY) | 'phone' (01XXXXXXXXX)
         //       | 'enum' (options: [[storedValue, ...accepted spellings]]) | 'bool' (হ্যাঁ/না, yes/no, 1/0)
         // aliases: ['other', 'header', 'spellings'] · help: 'note shown under the field list'
         // selfCheck: true → no generic required/type check (the spec's validate() checks it) · keepDigits: true → Bangla digits kept
       ],
       context: ctx => '<select … onchange="CSVKit.setCtx(\'shelf\', this.value)">…',   // optional pickers above the import
       ready: ctx => '' | 'message why the import cannot start yet',                   // optional
       templateRows: ctx => [{ title: '…' }],       // optional: pre-filled template rows (e.g. a class roster)
       validate(rows, ctx) { },                      // optional cross-checks; each row = { line, raw, val, errors[], warnings[] }
       commit(okRows, ctx) { return 'Bangla summary'; },   // save the valid rows (row.val holds parsed values)
     });

     CSVKit.panel('books', ctx)    → HTML of the whole import flow (put it in any page; no mount needed)
     CSVKit.open('books', ctx)     → the same flow as an in-place detail page (breadcrumb + back)
     CSVKit.template('books', 'bn' | 'en', ctx)
     CSVKit.exportDialog({ title, filename, rows, cols: [{ k, label, en, get: row => value, on: false }] })
     CSVKit.download(fileName, grid)   · CSVKit.parse(text) → string[][]
   ========================================================================== */
const CSVKit = {
  specs: {},
  cur: null,
  /** (the spec object is kept as given, so `fields` may be a getter that depends on the import context) */
  register(id, spec) { spec.id = id; this.specs[id] = spec; return spec; },

  /* ---------- parsing ---------- */
  /** RFC-4180 CSV (quotes, escaped quotes, CRLF, BOM); the delimiter (, ; or tab) is detected from the first line. */
  parse(text) {
    text = String(text || '').replace(/^﻿/, '');
    const first = text.split(/\r?\n/, 1)[0] || '', count = ch => first.split(ch).length - 1;
    const d = [',', ';', '\t'].sort((a, b) => count(b) - count(a))[0];
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
      if (c === '"') q = true;
      else if (c === d) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(x => String(x).trim() !== ''));
  },
  /** Header / spelling key: lower-case, no spaces or punctuation, Bangla digits → 0-9. */
  norm(s) { return U.asciiDigits(String(s || '')).toLowerCase().replace(/[\s_\-.()\/:*'"।,]+/g, ''); },
  names(f) { return [f.k, f.en, f.label, ...(f.aliases || [])].filter(Boolean).map(x => this.norm(x)); },
  autoMap(header, fields) {
    const used = new Set();
    return header.map(h => {
      const n = this.norm(h), f = fields.find(x => !used.has(x.k) && this.names(x).includes(n));
      if (f) { used.add(f.k); return f.k; }
      return '';
    });
  },
  csvText(grid) { return grid.map(r => r.map(v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\r\n'); },
  download(name, grid) { downloadFile(name, '﻿' + this.csvText(grid), 'text/csv;charset=utf-8'); },

  /* ---------- generic value parsing ---------- */
  normDate(v) {
    v = U.asciiDigits(String(v || '').trim()); if (!v) return null;
    let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/), y, mo, d;
    if (m) [, y, mo, d] = m; else if ((m = v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/))) [, d, mo, y] = m; else return null;
    const iso = `${y}-${U.pad(+mo)}-${U.pad(+d)}`, dt = U.d(iso);
    return isNaN(dt) || U.iso(dt) !== iso ? null : iso;
  },
  normPhone(v) {
    let p = U.asciiDigits(String(v || '')).replace(/[\s\-().]/g, '');
    if (p.startsWith('+88')) p = p.slice(3); else if (p.startsWith('88') && p.length === 13) p = p.slice(2);
    if (/^1\d{9}$/.test(p)) p = '0' + p;
    return p;
  },
  typed(row, f) {
    const x = row.raw[f.k]; if (x === undefined || x === '') return;
    const E = m => row.errors.push(`${f.label}: ${m}`);
    if (f.type === 'int' || f.type === 'num') {
      const n = +String(x).replace(/[,৳\s]/g, '');
      if (!Number.isFinite(n) || (f.type === 'int' && !Number.isInteger(n))) return E(`"${x}" সংখ্যা নয়`);
      if (f.min !== undefined && n < f.min) return E(`${bnNum(f.min)}-এর কম হতে পারে না`);
      if (f.max !== undefined && n > f.max) return E(`${bnNum(f.max)}-এর বেশি হতে পারে না`);
      row.val[f.k] = n;
    } else if (f.type === 'date') { const d = this.normDate(x); if (!d) return E(`"${x}" তারিখ নয় (YYYY-MM-DD বা DD/MM/YYYY)`); row.val[f.k] = d; }
    else if (f.type === 'phone') { const p = this.normPhone(x); if (!/^01\d{9}$/.test(p)) return E(`"${x}" — 01XXXXXXXXX আকারে লিখুন`); row.val[f.k] = p; }
    else if (f.type === 'enum') { const n = this.norm(x), o = (f.options || []).find(op => op.some(v => this.norm(v) === n)); if (!o) return E(`"${x}" গ্রহণযোগ্য নয় (${(f.options || []).map(op => op[1] || op[0]).join(' / ')})`); row.val[f.k] = o[0]; }
    else if (f.type === 'bool') { const n = this.norm(x); row.val[f.k] = ['1', 'yes', 'y', 'true', 'হ্যাঁ', 'হ্যা'].includes(n); }
    else row.val[f.k] = String(x).replace(/\s+/g, ' ').trim();
  },

  /* ---------- import flow ---------- */
  state(id, ctx) {
    if (!this.cur || this.cur.id !== id) this.cur = { id, ctx: { ...(ctx || {}) }, step: 'file', grid: null, map: [], rows: null, fileName: '', done: null };
    else if (ctx) Object.keys(ctx).forEach(k => { if (this.cur.ctx[k] === undefined) this.cur.ctx[k] = ctx[k]; });
    return this.cur;
  },
  /** The whole import flow as HTML (inline handlers only, so any page can show it without a mount step). */
  panel(id, ctx) { this.state(id, ctx); return `<div id="csvk">${this.html()}</div>`; },
  open(id, ctx) {
    const s = this.specs[id]; if (!s) return;
    this.cur = null; this.state(id, ctx);
    App.openDetail({ title: `সিএসভি আমদানি — ${s.label}`, render: () => `<div id="csvk">${this.html()}</div>` });
  },
  redraw() { const h = $('#csvk'); if (h) { h.innerHTML = this.html(); App.icons(); } },
  setCtx(k, v) { this.cur.ctx[k] = v; if (this.cur.step === 'preview') this.run(); this.redraw(); },
  setMap(i, v) { this.cur.map[i] = v; this.redraw(); },
  go(step) { const c = this.cur; if (step === 'preview') this.run(); c.step = step; this.redraw(); },
  reset() { const c = this.cur; Object.assign(c, { step: 'file', grid: null, map: [], rows: null, fileName: '', done: null }); this.redraw(); },
  load(text, fileName) {
    const c = this.cur, s = this.specs[c.id], grid = this.parse(text);
    if (!grid.length) return toast('ফাইলে কোনো সারি পাওয়া যায়নি।', 'error');
    if (grid.length < 2) return toast('শুধু শিরোনাম-সারি আছে — কোনো তথ্য-সারি নেই।', 'warn');
    if (grid.length > 5001) return toast('একবারে সর্বোচ্চ ৫,০০০ সারি আমদানি করা যায় — ফাইলটি ভাগ করে নিন।', 'error');
    c.grid = grid; c.fileName = fileName; c.map = this.autoMap(grid[0], s.fields); c.done = null;
    const req = s.fields.filter(f => f.required && !c.map.includes(f.k));
    c.step = req.length || c.map.some(m => !m) ? 'map' : 'preview';
    if (c.step === 'preview') this.run();
    this.redraw();
  },
  file(f) {
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => this.load(fr.result, f.name);
    fr.onerror = () => toast('ফাইলটি পড়া যায়নি।', 'error');
    fr.readAsText(f, 'utf-8');
  },
  paste() { const t = $('#csvk-paste')?.value || ''; if (!t.trim()) return toast('আগে সিএসভি লেখা পেস্ট করুন।', 'warn'); this.load(t, 'pasted.csv'); },
  /** Parse + validate every row with the current column mapping. */
  run() {
    const c = this.cur, s = this.specs[c.id], fields = s.fields;
    c.rows = c.grid.slice(1).map((cells, i) => {
      const raw = {}; c.map.forEach((k, j) => { if (k) raw[k] = U.asciiDigits(String(cells[j] ?? '')).trim(); });
      fields.forEach(f => { if (f.keepDigits && c.map.includes(f.k)) raw[f.k] = String(cells[c.map.indexOf(f.k)] ?? '').trim(); });
      return { line: i + 2, raw, val: {}, errors: [], warnings: [] };
    });
    // fields marked selfCheck are checked by the spec's own validate (no duplicate messages)
    c.rows.forEach(r => fields.forEach(f => { if (f.selfCheck) return; if (f.required && !r.raw[f.k]) r.errors.push(`${f.label} ফাঁকা`); else this.typed(r, f); }));
    try { s.validate?.(c.rows, c.ctx); } catch (e) { console.error(e); toast(e.message, 'error'); }
  },
  commit() {
    const c = this.cur, s = this.specs[c.id];
    if (s.can && !s.can(c.ctx)) return toast('আমদানির অনুমতি নেই।', 'error');
    this.run();
    const ok = c.rows.filter(r => !r.errors.length);
    if (!ok.length) return toast('আমদানি করার মতো কোনো বৈধ সারি নেই।', 'error');
    let msg = '';
    try { msg = s.commit(ok, c.ctx, { fileName: c.fileName, skipped: c.rows.length - ok.length }) || ''; } catch (e) { console.error(e); return toast(e.message, 'error'); }
    c.done = { n: ok.length, skipped: c.rows.length - ok.length, msg };
    c.step = 'done'; c.rows = null; c.grid = null;
    toast(`${bnNum(ok.length)}টি সারি আমদানি হয়েছে।`, 'success');
    this.redraw();
  },
  template(id, lang = 'bn', ctx) {
    const s = this.specs[id]; if (!s) return;
    ctx = ctx || (this.cur?.id === id ? this.cur.ctx : {}) || {};
    this._tplCtx = ctx;
    try { this._template(id, s, lang, ctx); } finally { this._tplCtx = null; }
  },
  _template(id, s, lang, ctx) {
    const fs = s.fields, rows = s.templateRows ? s.templateRows(ctx) : [Object.fromEntries(fs.map(f => [f.k, f.example ?? '']))];
    this.download(`${id}-template${lang === 'en' ? '-en' : ''}.csv`, [fs.map(f => lang === 'en' ? (f.en || f.k) : f.label), ...rows.map(r => fs.map(f => r[f.k] ?? ''))]);
  },

  html() {
    const c = this.cur, s = this.specs[c.id];
    if (!s) return '';
    if (s.can && !s.can(c.ctx)) return `<div class="card p-6">${emptyState(`${esc(s.label)} আমদানির অনুমতি আপনার নেই।`, 'lock')}</div>`;
    const ctxHtml = s.context ? `<div class="card p-4 mb-4 flex flex-wrap gap-3 items-end">${s.context(c.ctx)}</div>` : '';
    const notReady = s.ready ? s.ready(c.ctx) : '';
    const steps = [['file', 'ফাইল'], ['map', 'কলাম মেলানো'], ['preview', 'প্রিভিউ ও আমদানি']];
    const idx = steps.findIndex(x => x[0] === c.step);
    const stepper = `<ol class="flex flex-wrap gap-2 mb-4" aria-label="ধাপ">${steps.map(([k, l], i) => `<li class="pill ${k === c.step ? 'pill-on' : ''}" ${k === c.step ? 'aria-current="step"' : ''}>${bnNum(i + 1)}. ${l}${i < idx || c.step === 'done' ? icon('check', 'w-4 h-4') : ''}</li>`).join('')}</ol>`;
    if (notReady) return ctxHtml + `<div class="card p-6">${emptyState(esc(notReady), 'circle-slash')}</div>`;
    if (c.step === 'done') return ctxHtml + `<div class="card p-6 text-center space-y-3">${icon('circle-check', 'w-10 h-10 mx-auto text-emerald-600')}<div class="text-lg font-bold">${bnNum(c.done.n)}টি সারি আমদানি হয়েছে${c.done.skipped ? ` · ${bnNum(c.done.skipped)}টি বাদ` : ''}</div>${c.done.msg ? `<p class="text-slate-600">${esc(c.done.msg)}</p>` : ''}<button class="btn btn-primary" onclick="CSVKit.reset()">${icon('file-up')} আরও একটি ফাইল আমদানি করুন</button></div>`;
    if (c.step === 'file') {
      return ctxHtml + stepper + `<div class="grid lg:grid-cols-2 gap-5"><div class="card p-5 space-y-3"><div class="font-semibold">কলামসমূহ</div>
          <ul class="space-y-1">${s.fields.map(f => `<li class="flex flex-wrap gap-x-2"><span class="font-semibold">${esc(f.label)}${f.required ? ' <span class="text-red-600">*</span>' : ''}</span><span class="text-slate-500 font-mono">${esc(f.en || f.k)}</span>${f.help ? `<span class="text-slate-500 w-full">${esc(f.help)}</span>` : ''}</li>`).join('')}</ul>
          ${s.notes ? `<p class="text-slate-600">${esc(s.notes)}</p>` : ''}          <div class="flex flex-wrap gap-2"><button class="btn btn-ghost btn-sm" onclick="CSVKit.template('${c.id}','bn')">${icon('file-spreadsheet')} নমুনা ফাইল (বাংলা শিরোনাম)</button><button class="btn btn-ghost btn-sm" onclick="CSVKit.template('${c.id}','en')">${icon('file-spreadsheet')} নমুনা ফাইল (English headers)</button></div></div>
        <div class="card p-5 space-y-3"><label class="block border-2 border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/40">${icon('upload', 'w-7 h-7 mx-auto text-slate-400')}<span class="block font-semibold mt-1">সিএসভি ফাইল বেছে নিন</span><input type="file" accept=".csv,text/csv,text/plain" class="hidden" onchange="CSVKit.file(this.files[0]);this.value=''"></label>
          <details><summary class="cursor-pointer text-slate-600">অথবা সিএসভি লেখা পেস্ট করুন</summary><textarea id="csvk-paste" class="textarea mt-2 font-mono" rows="5" placeholder="${esc(s.fields.map(f => f.label).join(','))}"></textarea><button class="btn btn-ghost btn-sm mt-2" onclick="CSVKit.paste()">${icon('scan-eye')} যাচাই করুন</button></details></div></div>`;
    }
    if (c.step === 'map') {
      const head = c.grid[0], sample = c.grid[1] || [], missing = s.fields.filter(f => f.required && !c.map.includes(f.k));
      const dup = c.map.filter((k, i) => k && c.map.indexOf(k) !== i);
      return ctxHtml + stepper + `<div class="card"><div class="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2"><div class="font-semibold mr-auto">কলাম মেলানো · ${esc(c.fileName)} <span class="font-normal text-slate-500">${bnNum(c.grid.length - 1)}টি সারি</span></div><button class="btn btn-ghost btn-sm" onclick="CSVKit.reset()">${icon('arrow-left')} অন্য ফাইল</button><button class="btn btn-primary btn-sm" ${missing.length || dup.length ? 'disabled' : ''} onclick="CSVKit.go('preview')">${icon('scan-eye')} প্রিভিউ দেখুন</button></div>
        ${missing.length ? `<div class="px-5 py-2 bg-red-50 text-red-700">আবশ্যক ঘর মেলানো হয়নি: <b>${esc(missing.map(f => f.label).join(', '))}</b></div>` : ''}${dup.length ? `<div class="px-5 py-2 bg-red-50 text-red-700">একই ঘর একাধিক কলামে মেলানো হয়েছে: ${esc([...new Set(dup)].map(k => s.fields.find(f => f.k === k)?.label || k).join(', '))}</div>` : ''}
        <div class="scroll-x"><table class="table"><thead><tr><th>ফাইলের কলাম</th><th>প্রথম সারির মান</th><th>যে ঘরে যাবে</th></tr></thead><tbody>${head.map((h, i) => `<tr><td class="font-semibold">${esc(h)}</td><td class="text-slate-500">${esc(sample[i] ?? '')}</td><td><select class="select !py-1" aria-label="${esc(h)} কলাম কোন ঘরে যাবে" onchange="CSVKit.setMap(${i},this.value)"><option value="">— বাদ দিন —</option>${s.fields.map(f => `<option value="${f.k}" ${c.map[i] === f.k ? 'selected' : ''}>${esc(f.label)}${f.required ? ' *' : ''}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div></div>`;
    }
    // preview
    const rows = c.rows || [], ok = rows.filter(r => !r.errors.length).length, bad = rows.length - ok, warn = rows.filter(r => !r.errors.length && r.warnings.length).length;
    const cols = s.fields.filter(f => c.map.includes(f.k));
    const show = (r, f) => { const v = r.val[f.k]; if (v !== undefined && v !== null && v !== '' && typeof v !== 'object') return esc(f.type === 'enum' ? bn(v) : v); return esc(r.raw[f.k] || ''); };
    const filt = c.filter || 'all', list = rows.filter(r => filt === 'all' || (filt === 'bad' ? r.errors.length : filt === 'warn' ? r.warnings.length && !r.errors.length : !r.errors.length));
    return ctxHtml + stepper + `<div class="card"><div class="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2"><div class="font-semibold mr-auto">প্রিভিউ · ${esc(c.fileName)}</div>
        <button class="btn btn-ghost btn-sm" onclick="CSVKit.go('map')">${icon('columns-3')} কলাম মেলানো</button><button class="btn btn-ghost btn-sm" onclick="CSVKit.reset()">বাতিল</button>
        <button class="btn btn-success btn-sm" ${ok ? '' : 'disabled'} onclick="CSVKit.commit()">${icon('check')} ${bnNum(ok)}টি বৈধ সারি আমদানি করুন</button></div>
      <div class="px-5 py-2 flex flex-wrap gap-2">${[['all', `সকল ${bnNum(rows.length)}`, 'slate'], ['ok', `বৈধ ${bnNum(ok)}`, 'green'], ['warn', `সতর্কতা ${bnNum(warn)}`, 'amber'], ['bad', `ত্রুটি ${bnNum(bad)} (বাদ যাবে)`, 'red']].map(([k, l]) => `<button class="pill ${filt === k ? 'pill-on' : ''}" onclick="CSVKit.cur.filter='${k}';CSVKit.redraw()">${l}</button>`).join('')}</div>
      <div class="scroll-x max-h-[60vh] overflow-y-auto"><table class="table"><thead><tr><th>সারি</th><th>অবস্থা</th>${cols.map(f => `<th>${esc(f.label)}</th>`).join('')}</tr></thead><tbody>
      ${list.slice(0, 500).map(r => `<tr class="${r.errors.length ? 'bg-red-50/60' : ''}"><td class="text-slate-500">${bnNum(r.line)}</td><td class="min-w-[14rem]">${r.errors.length ? r.errors.map(e => `<div class="text-red-700">${icon('circle-x', 'w-4 h-4 inline -mt-0.5')} ${esc(e)}</div>`).join('') : `<div class="text-emerald-700 font-semibold">${icon('circle-check', 'w-4 h-4 inline -mt-0.5')} প্রস্তুত</div>`}${r.warnings.map(w => `<div class="text-amber-700">${icon('triangle-alert', 'w-4 h-4 inline -mt-0.5')} ${esc(w)}</div>`).join('')}</td>${cols.map(f => `<td class="whitespace-nowrap">${show(r, f)}</td>`).join('')}</tr>`).join('')}
      </tbody></table>${list.length ? '' : emptyState('এই ছাঁকনিতে কোনো সারি নেই।')}${list.length > 500 ? `<p class="p-3 text-slate-500">প্রথম ৫০০টি সারি দেখানো হচ্ছে।</p>` : ''}</div></div>`;
  },

  /* ---------- export with chosen columns ---------- */
  exportDialog({ title = 'সিএসভি রপ্তানি', filename = 'export.csv', cols = [], rows = [] } = {}) {
    const key = 'dhee.csvx.' + filename.replace(/[-\d]+\.csv$/, '');
    let saved = null; try { saved = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { }
    this._x = { cols, rows, filename, key };
    const on = c => saved?.cols ? saved.cols.includes(c.k) : c.on !== false;
    Modal.open({
      title, size: 'md',
      body: `<form id="csvx" class="space-y-4"><div class="text-slate-600">${bnNum(rows.length)}টি সারি রপ্তানি হবে।</div>
        <fieldset><legend class="font-semibold mb-2">কলাম</legend><div class="grid sm:grid-cols-2 gap-1.5">${cols.map(c => `<label class="flex items-center gap-2"><input type="checkbox" class="w-4 h-4" name="col" value="${esc(c.k)}" ${on(c) ? 'checked' : ''}> ${esc(c.label)}</label>`).join('')}</div>
          <div class="flex gap-2 mt-2"><button type="button" class="btn btn-ghost btn-sm" onclick="$$('#csvx [name=col]').forEach(i=>i.checked=true)">সব</button><button type="button" class="btn btn-ghost btn-sm" onclick="$$('#csvx [name=col]').forEach(i=>i.checked=false)">কোনোটি নয়</button></div></fieldset>
        <fieldset class="grid sm:grid-cols-2 gap-3"><div><legend class="font-semibold mb-1">শিরোনাম</legend><label class="flex items-center gap-2"><input type="radio" name="lang" value="bn" ${saved?.lang !== 'en' ? 'checked' : ''}> বাংলা</label><label class="flex items-center gap-2"><input type="radio" name="lang" value="en" ${saved?.lang === 'en' ? 'checked' : ''}> English</label></div>
          <div><div class="font-semibold mb-1">সংখ্যা</div><label class="flex items-center gap-2"><input type="radio" name="digits" value="en" ${saved?.digits !== 'bn' ? 'checked' : ''}> ইংরেজি অঙ্ক (0-9)</label><label class="flex items-center gap-2"><input type="radio" name="digits" value="bn" ${saved?.digits === 'bn' ? 'checked' : ''}> বাংলা অঙ্ক (০-৯)</label></div></fieldset>
        <button class="btn btn-primary w-full">${icon('download')} সিএসভি ডাউনলোড করুন</button></form>`,
    });
    $('#csvx').addEventListener('submit', e => {
      e.preventDefault();
      const f = e.target, pick = $$('[name=col]', f).filter(i => i.checked).map(i => i.value), lang = f.lang.value, digits = f.digits.value;
      if (!pick.length) return toast('অন্তত একটি কলাম বেছে নিন।', 'error');
      try { localStorage.setItem(key, JSON.stringify({ cols: pick, lang, digits })); } catch (err) { }
      const C = cols.filter(c => pick.includes(c.k)), d = v => (digits === 'bn' ? U.bn(v ?? '') : (v ?? ''));
      this.download(filename, [C.map(c => lang === 'en' ? (c.en || c.k) : c.label), ...rows.map(r => C.map(c => { let v; try { v = c.get ? c.get(r) : r[c.k]; } catch (err) { v = ''; } return d(v); }))]);
      DB.audit('DATA_EXPORT', 'csv', `${filename}: ${rows.length}টি সারি, ${C.length}টি কলাম`); DB.save();
      Modal.close(); toast(`${bnNum(rows.length)}টি সারি রপ্তানি হয়েছে।`, 'success');
    });
  },
};
