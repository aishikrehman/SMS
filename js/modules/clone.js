/* ==========================================================================
   MULTI-CAMPUS COPY / IMPORT CONFIGURATION ENGINE
   One-click cloning of routines, grading schemes, fee configs and exam
   structures between academic sessions and campuses, plus JSON settings
   bundles for export / import.
   ========================================================================== */

const Clone = {
  /** Map source classes to target classes: same campus → identity; other campus → by grade order. */
  classMap(srcCampus, dstCampus) {
    const a = DB.classesIn(srcCampus), b = DB.classesIn(dstCampus);
    return Object.fromEntries(a.map((c, i) => [c.id, srcCampus === dstCampus ? c.id : b[i]?.id]).filter(([, v]) => v));
  },
  routine(o) {
    const src = DB.routineSet(o.srcSes).filter(r => DB.campusOf(r.classId) === o.srcCampus && (!o.srcClass || r.classId === o.srcClass));
    const map = o.srcClass ? { [o.srcClass]: o.dstClass } : this.classMap(o.srcCampus, o.dstCampus);
    const dst = DB.routineSet(o.dstSes);
    if (o.srcSes === o.dstSes && o.srcCampus === o.dstCampus && !o.srcClass) return { error: 'উৎস ও লক্ষ্য একই।' };
    const targets = new Set(Object.values(map));
    if (o.overwrite) for (let i = dst.length - 1; i >= 0; i--) if (targets.has(dst[i].classId)) dst.splice(i, 1);
    let copied = 0; const skipped = [];
    const sameCampus = o.srcCampus === o.dstCampus;
    src.forEach(r => {
      const cls = map[r.classId]; if (!cls) return;
      if (dst.some(x => x.classId === cls && x.day === r.day && x.period === r.period && (x.date || '') === (r.date || ''))) { skipped.push(`${DB.className(cls)} ${U.dayBn(r.day)} পিরিয়ড ${bnNum(r.period)}: এই সময়ঘর ইতোমধ্যে পূর্ণ`); return; }
      const subs = RT.subs(r), tids = sameCampus ? RT.tchs(r).filter(id => DB.teacher(id)) : [...new Set(subs.map(s => DB.teachersIn(o.dstCampus).find(t => (t.subjects || []).includes(s))?.id).filter(Boolean))];
      if (!tids.length) { skipped.push(`${DB.className(cls)} ${U.dayBn(r.day)} পিরিয়ড ${bnNum(r.period)}: লক্ষ্য ক্যাম্পাসে ${RT.subName(r)}-এর কোনো শিক্ষক নেই`); return; }
      const room = sameCampus && r.classId === cls ? (r.room || '') : (dst.find(x => x.classId === cls && x.room)?.room || DB.routineSet(DB.session()).find(x => x.classId === cls && x.room)?.room || DB.rooms(o.dstCampus)[0] || '');
      const slot = { id: DB.id('RT'), classId: cls, section: DB.cls(cls)?.sections[0] || '', day: r.day, period: r.period, subjectId: subs[0] || '', teacherId: tids[0], subjectIds: subs, teacherIds: tids, room };
      if (RT.span(r) > 1) slot.span = RT.span(r);
      if (r.supp) slot.supp = true;
      if (r.date) slot.date = r.date;
      if (r.brk) slot.brk = r.brk;
      if (r.intoBreak) slot.intoBreak = true;
      const clash = Principal.conflicts(slot, null, dst);
      if (clash.length) { skipped.push(`${DB.className(cls)} ${U.dayBn(r.day)} পিরিয়ড ${bnNum(r.period)}: ${clash[0]}`); return; }
      dst.push(slot); copied++;
    });
    return { copied, skipped };
  },
  grading(o) {
    const src = DB.s.gradingSchemes.find(g => g.id === o.srcScheme); if (!src) return { error: 'একটি উৎস স্কিম নির্বাচন করুন।' };
    const campusId = o.dstCampus === 'ALL' ? null : o.dstCampus;
    const existing = DB.s.gradingSchemes.find(g => g.session === o.dstSes && (g.campusId || null) === campusId);
    if (existing && !o.overwrite) return { error: `শিক্ষাবর্ষ ${bnNum(o.dstSes)}-এ এই পরিসরের জন্য ইতোমধ্যে একটি স্কিম আছে — "প্রতিস্থাপন" ঘরে টিক দিন।` };
    if (existing) existing.bands = src.bands.map(b => ({ ...b }));
    else DB.s.gradingSchemes.push({ id: `GS-${campusId || 'ALL'}-${o.dstSes}-${Date.now().toString().slice(-4)}`, name: src.name, session: o.dstSes, campusId, bands: src.bands.map(b => ({ ...b })) });
    return { copied: 1, skipped: [] };
  },
  fees(o) {
    const map = this.classMap(o.srcCampus, o.dstCampus), adj = 1 + (+o.adjust || 0) / 100, round = v => Math.round(v * adj / 50) * 50;
    let copied = 0; const skipped = [];
    Object.entries(map).forEach(([s, d]) => {
      const f = DB.s.feeConfigs.find(x => x.classId === s && x.session === o.srcSes); if (!f) { skipped.push(`${DB.className(s)}: ${bnNum(o.srcSes)}-এ কোনো ফি কনফিগারেশন নেই`); return; }
      const ex = DB.s.feeConfigs.find(x => x.classId === d && x.session === o.dstSes);
      if (ex && !o.overwrite) { skipped.push(`${DB.className(d)}: ${bnNum(o.dstSes)}-এর জন্য ইতোমধ্যে কনফিগার করা আছে`); return; }
      const row = { session: o.dstSes, campusId: o.dstCampus, classId: d, tuition: round(f.tuition), admissionFee: round(f.admissionFee), examFee: round(f.examFee) };
      ex ? Object.assign(ex, row) : DB.s.feeConfigs.push(row); copied++;
    });
    return { copied, skipped };
  },
  exams(o) {
    const src = DB.examsOf(o.srcSes); if (!src.length) return { error: `${bnNum(o.srcSes)}-এ কোনো পরীক্ষা নেই।` };
    if (DB.examsOf(o.dstSes).length && !o.overwrite) return { error: `শিক্ষাবর্ষ ${bnNum(o.dstSes)}-এ ইতোমধ্যে পরীক্ষা আছে — তবুও যোগ করতে "প্রতিস্থাপন" ঘরে টিক দিন।` };
    const shift = (+o.dstSes - +o.srcSes) || 0;
    const skipped = []; let copied = 0;
    src.forEach(e => {
      const id = `${e.id.replace(/-?\d{4}$/, '')}-${o.dstSes}`.replace(/^(AN|HY|PT)-/, '$1');
      if (DB.exam(id)) { skipped.push(`${id} ইতোমধ্যে বিদ্যমান`); return; }
      DB.s.exams.push({ ...e, id, name: e.name.replace(o.srcSes, o.dstSes).replace(U.bn(o.srcSes), U.bn(o.dstSes)), session: o.dstSes, start: `${+e.start.slice(0, 4) + shift}${e.start.slice(4)}`, published: false }); copied++;
    });
    return { copied, skipped };
  },
  run(kind) {
    const o = formData($(`#cl-${kind}`)); o.overwrite = !!$(`#cl-${kind} [name=overwrite]`)?.checked;
    const res = this[kind](o);
    if (res.error) return toast(res.error, 'error');
    DB.audit('CONFIG_CLONE', kind, `${kind}: ${JSON.stringify({ ...o, overwrite: o.overwrite })} → ${res.copied} copied, ${res.skipped.length} skipped`); DB.save();
    App.ui.clRes = { kind, ...res };
    toast(`${bnNum(res.copied)}টি আইটেম কপি হয়েছে${res.skipped.length ? `, ${bnNum(res.skipped.length)}টি বাদ পড়েছে` : ''}।`,res.skipped.length ? 'warn' : 'success'); App.refresh();
  },

  /* ---------- settings bundles ---------- */
  exportBundle() {
    const s = DB.s, b = { kind: 'dhee-settings', version: 1, exportedAt: new Date().toISOString(), school: s.school.name, feeConfigs: s.feeConfigs, gradingSchemes: s.gradingSchemes, exams: s.exams.map(({ ...e }) => e), routine: { [s.activeSession]: s.routine, ...Object.fromEntries(Object.entries(s.sessionStore).map(([k, v]) => [k, v.routine || []])) }, calendar: s.calendar, coupons: s.coupons, sessions: s.sessions };
    downloadFile(`dhee-settings-${U.today()}.json`, JSON.stringify(b, null, 1));
    DB.audit('SETTINGS_EXPORT', 'system', 'সেটিংস বান্ডেল রপ্তানি করা হয়েছে'); DB.save();
  },
  importBundle(file) {
    const fr = new FileReader();
    fr.onload = () => {
      let b; try { b = JSON.parse(fr.result); if (b.kind !== 'dhee-settings') throw 0; } catch (e) { return toast('এটি Dhee SMS-এর সেটিংস বান্ডেল নয়।', 'error'); }
      const parts = [['feeConfigs', `${bnNum(b.feeConfigs?.length || 0)}টি ফি কনফিগারেশন`], ['gradingSchemes', `${bnNum(b.gradingSchemes?.length || 0)}টি গ্রেডিং স্কিম`], ['exams', `${bnNum(b.exams?.length || 0)}টি পরীক্ষা`], ['routine', `${bnNum(Object.values(b.routine || {}).flat().length)}টি রুটিন সময়ঘর`], ['calendar', `${bnNum(b.calendar?.holidays?.length || 0)}টি ছুটির দিন`], ['coupons', `${bnNum(Object.keys(b.coupons || {}).length)}টি কুপন`]];
      Modal.open({
        title: 'সেটিংস বান্ডেল আমদানি', size: 'md',
        body: `<p class="text-sm text-slate-600 mb-3">উৎস: <b>${esc(b.school || '?')}</b>, রপ্তানির সময় ${U.fmtTime(b.exportedAt)}। কী আমদানি করবেন তা নির্বাচন করুন — নির্বাচিত অংশগুলো বর্তমান তথ্য <b>প্রতিস্থাপন করবে</b>।</p><form id="imp" class="space-y-2">${parts.map(([k, l]) => `<label class="flex items-center gap-2 text-sm"><input type="checkbox" name="${k}" ${b[k] ? 'checked' : 'disabled'}> ${l}</label>`).join('')}<button class="btn btn-primary w-full mt-3">নির্বাচিতগুলো আমদানি করুন</button></form>`,
      });
      $('#imp').addEventListener('submit', e => {
        e.preventDefault(); const pick = $$('#imp input:checked').map(x => x.name);
        if (!pick.length) return toast('কিছুই নির্বাচন করা হয়নি।', 'warn');
        const used = new Set(DB.s.marks.map(m => m.examId));
        pick.forEach(k => {
          if (k === 'routine') Object.entries(b.routine).forEach(([ses, list]) => { const set = DB.routineSet(ses); set.splice(0, set.length, ...list); });
          else if (k === 'exams') DB.s.exams = [...DB.s.exams.filter(x => used.has(x.id)), ...b.exams.filter(x => !used.has(x.id))];
          else DB.s[k] = b[k];
        });
        DB.audit('SETTINGS_IMPORT', 'system', `Imported: ${pick.join(', ')}`); DB.save();
        Modal.close(); toast('সেটিংস আমদানি করা হয়েছে।', 'success'); App.render();
      });
    };
    fr.readAsText(file);
  },
  activate(ses) {
    const cur = DB.session(); if (ses === cur) return;
    const next = DB.routineSet(ses);
    if (!confirm(`শিক্ষাবর্ষ ${bnNum(ses)} সক্রিয় করবেন?\n\n• ${bnNum(cur)}-এর সময়সূচি সংরক্ষণাগারে যাবে এবং ${bnNum(ses)}-এর সময়সূচি (${bnNum(next.length)}টি সময়ঘর) চালু হবে।\n• ${bnNum(ses)}-এর ফি কনফিগারেশন ও গ্রেডিং কার্যকর হবে।\n• ${(() => { const n = (DB.s.promotions || []).filter(p => p.kind === 'provisional' && p.status === 'Provisional' && +p.to.session <= +ses).length; return n ? `অস্থায়ীভাবে উন্নীত ${bnNum(n)} জন শিক্ষার্থী নতুন শ্রেণিতে চলে যাবে (চূড়ান্ত হবে); বাকিরা স্বয়ংক্রিয়ভাবে উন্নীত হবে না।` : 'শিক্ষার্থীরা স্বয়ংক্রিয়ভাবে পরবর্তী শ্রেণিতে উন্নীত হবে না।'; })()}`)) return;
    DB.s.sessionStore[cur] = { ...(DB.s.sessionStore[cur] || {}), routine: DB.s.routine };
    DB.s.routine = next; delete DB.s.sessionStore[ses].routine;
    // class structure per session: the new session's own structure becomes the live one; the old one is kept
    DB.s.sessionStore[cur].classes = JSON.parse(JSON.stringify(DB.s.classes));
    if (DB.s.sessionStore[ses].classes) { DB.s.classes = DB.s.sessionStore[ses].classes; delete DB.s.sessionStore[ses].classes; }
    DB.s.sessions.forEach(s => { if (s.id === cur) s.status = 'closed'; if (s.id === ses) s.status = 'active'; });
    DB.s.activeSession = ses;
    DB.audit('SESSION_ACTIVATE', 'sessions', `${cur} → ${ses}`); DB.save(); toast(`শিক্ষাবর্ষ ${bnNum(ses)} এখন সক্রিয়।`, 'success'); App.render();
  },
};

const clonePage = {
  id: 'clone', label: 'কপি ও আমদানি', icon: 'copy',
  render() {
    const cur = DB.session(), next = String(+cur + 1), res = App.ui.clRes;
    const field = (name, label, opts) => `<div><label class="label">${label}</label><select class="select" name="${name}">${opts}</select></div>`;
    const ow = `<label class="flex items-center gap-2 text-sm"><input type="checkbox" name="overwrite"> লক্ষ্যের বিদ্যমান তথ্য প্রতিস্থাপন করুন</label>`;
    const stat = ses => `${bnNum(DB.routineSet(ses).length)}টি সময়ঘর · ${bnNum(DB.s.feeConfigs.filter(f => f.session === ses).length)}টি ফি সারি · ${bnNum(DB.s.gradingSchemes.filter(g => g.session === ses).length)}টি স্কিম · ${bnNum(DB.examsOf(ses).length)}টি পরীক্ষা`;
    return pageHeader('কনফিগারেশন কপি / আমদানি ব্যবস্থা', '',`<button class="btn btn-ghost" onclick="Clone.exportBundle()">${icon('download')} সেটিংস রপ্তানি করুন</button><label class="btn btn-ghost cursor-pointer">${icon('upload')} সেটিংস আমদানি করুন<input type="file" accept=".json" class="hidden" onchange="this.files[0]&&Clone.importBundle(this.files[0])"></label>`)
      + `<div class="card mb-5 scroll-x"><table class="table"><thead><tr><th>শিক্ষাবর্ষ</th><th>অবস্থা</th><th>কনফিগারেশন</th><th></th></tr></thead><tbody>${DB.s.sessions.map(s => `<tr><td class="font-semibold">${esc(U.bn(s.name))}</td><td>${badge(bn(s.status),{ active: 'green', planning: 'blue', closed: 'slate' }[s.status])}</td><td class="text-xs text-slate-600">${stat(s.id)}</td><td>${s.status === 'planning' && App.has('SUPERADMIN') || s.status === 'planning' && App.has('ADMIN') ? `<button class="btn btn-ghost btn-sm" onclick="Clone.activate('${s.id}')">সক্রিয় করুন</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
      ${res ? `<div class="card p-4 mb-5 ${res.skipped.length ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'} text-sm"><b>সর্বশেষ ${esc({ routine: 'রুটিন', fees: 'ফি', grading: 'গ্রেডিং', exams: 'পরীক্ষা' }[res.kind] || res.kind)} কপি:</b> ${bnNum(res.copied)}টি কপি হয়েছে, ${bnNum(res.skipped.length)}টি বাদ পড়েছে।${res.skipped.length ? `<ul class="list-disc ml-5 mt-1 text-xs max-h-32 overflow-y-auto">${res.skipped.slice(0, 30).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>` : ''}
      <div class="grid lg:grid-cols-2 gap-5">
        <form id="cl-routine" class="card p-5 space-y-3" onsubmit="event.preventDefault();Clone.run('routine')"><div class="font-semibold flex items-center gap-2">${icon('calendar-range', 'w-5 h-5 text-brand-600')} রুটিন / সময়সূচি</div>
          <div class="grid grid-cols-2 gap-3">${field('srcSes', 'উৎস শিক্ষাবর্ষ', sessionOptions(cur))}${field('dstSes', 'লক্ষ্য শিক্ষাবর্ষ', sessionOptions(next))}${field('srcCampus', 'উৎস ক্যাম্পাস', campusOptions('MAIN'))}${field('dstCampus', 'লক্ষ্য ক্যাম্পাস', campusOptions('MAIN'))}</div>
          <div class="grid grid-cols-2 gap-3">${field('srcClass', 'একক শ্রেণি (ঐচ্ছিক)', `<option value="">সকল শ্রেণি</option>${classOptions('', false, 'ALL')}`)}${field('dstClass', 'লক্ষ্য শ্রেণি', `<option value="">(স্বয়ংক্রিয়ভাবে মিলানো হবে)</option>${classOptions('', false, 'ALL')}`)}</div>
          ${ow}<button class="btn btn-primary w-full">${icon('copy')} রুটিন কপি করুন</button></form>
        <form id="cl-fees" class="card p-5 space-y-3" onsubmit="event.preventDefault();Clone.run('fees')"><div class="font-semibold flex items-center gap-2">${icon('receipt', 'w-5 h-5 text-brand-600')} ফি কনফিগারেশন</div>
          <div class="grid grid-cols-2 gap-3">${field('srcSes', 'উৎস শিক্ষাবর্ষ', sessionOptions(cur))}${field('dstSes', 'লক্ষ্য শিক্ষাবর্ষ', sessionOptions(next))}${field('srcCampus', 'উৎস ক্যাম্পাস', campusOptions('MAIN'))}${field('dstCampus', 'লক্ষ্য ক্যাম্পাস', campusOptions('MAIN'))}</div>
          <div><label class="label">সকল ফি % হারে সমন্বয় করুন</label><input type="number" class="input" name="adjust" value="8" step="0.5"></div>${ow}<button class="btn btn-primary w-full">${icon('copy')} ফি কপি করুন</button></form>
        <form id="cl-grading" class="card p-5 space-y-3" onsubmit="event.preventDefault();Clone.run('grading')"><div class="font-semibold flex items-center gap-2">${icon('award', 'w-5 h-5 text-brand-600')} গ্রেডিং স্কিম</div>
          ${field('srcScheme', 'উৎস স্কিম', DB.s.gradingSchemes.map(g => `<option value="${g.id}">${esc(g.name)} · ${bnNum(g.session)} · ${g.campusId ? DB.campus(g.campusId).short : 'সকল'}</option>`).join(''))}
          <div class="grid grid-cols-2 gap-3">${field('dstSes', 'লক্ষ্য শিক্ষাবর্ষ', sessionOptions(next))}${field('dstCampus', 'পরিসর', campusOptions('ALL', true))}</div>${ow}<button class="btn btn-primary w-full">${icon('copy')} গ্রেডিং স্কিম কপি করুন</button></form>
        <form id="cl-exams" class="card p-5 space-y-3" onsubmit="event.preventDefault();Clone.run('exams')"><div class="font-semibold flex items-center gap-2">${icon('clipboard-list', 'w-5 h-5 text-brand-600')} পরীক্ষার কাঠামো ও মান-বণ্টন</div>
          <div class="grid grid-cols-2 gap-3">${field('srcSes', 'উৎস শিক্ষাবর্ষ', sessionOptions(cur))}${field('dstSes', 'লক্ষ্য শিক্ষাবর্ষ', sessionOptions(next))}</div>${ow}<button class="btn btn-primary w-full">${icon('copy')} পরীক্ষার কাঠামো কপি করুন</button></form>
      </div>`;
  },
};
App.addPage('admin', clonePage, 'users');
App.addPage('principal', clonePage, 'calendar');
