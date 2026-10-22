/* ==========================================================================
   TRANSPORT, HOSTEL & LIBRARY  (RBAC module `logistics`; flags transport / hostel / library)
   - Transport & fleet: vehicles (fitness / tax-token expiry), maintenance log → Payment Vouchers,
     zone-based routes with ordered stops, student allocations, rosters, monthly transport billing.
   - Hostel: buildings, rooms & beds, meal plans, occupancy, bed allocation / vacate, monthly billing.
   - Library: barcode catalogue, labels, circulation desk (check-out / check-in), late fines, reminders.
   State: DB.s.transport {vehicles, routes, allocations, maintenance}
          DB.s.hostel    {buildings, rooms, mealPlans, allocations}
          DB.s.library   {books, loans}
   ========================================================================== */

const Logistics = {
  FINE_PER_DAY: 5, LOAN_DAYS: 14, MAX_LOANS: 3,

  /* ---------- generic helpers ---------- */
  /* Collections are always complete objects, even on a new install or a filtered (student / guardian) view. */
  T() { const t = DB.s.transport || (DB.s.transport = {}); ['vehicles', 'routes', 'allocations', 'maintenance'].forEach(k => { if (!Array.isArray(t[k])) t[k] = []; }); return t; },
  H() { const h = DB.s.hostel || (DB.s.hostel = {}); ['buildings', 'rooms', 'mealPlans', 'allocations'].forEach(k => { if (!Array.isArray(h[k])) h[k] = []; }); return h; },
  L() { const l = DB.s.library || (DB.s.library = {}); ['books', 'loans'].forEach(k => { if (!Array.isArray(l[k])) l[k] = []; }); return l; },
  ed() { return App.perm('logistics', 'edit'); },
  days(a, b) { return Math.round((U.d(a) - U.d(b)) / 864e5); },
  commit(action, entity, detail) { DB.audit(action, entity, detail); DB.save(); },
  _on(id, fn) { const f = $('#' + id); if (f) f.addEventListener('submit', e => { e.preventDefault(); fn(formData(e.target), e.target); }); },
  staff(id) { return (DB.s.staff || []).find(x => x.id === id) || null; },
  staffOpts(type, sel) {
    return `<option value="">— নেই —</option>` + (DB.s.staff || []).filter(x => x.type === type).map(x => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${[pn(x), multiCampus() ? DB.campus(x.campusId)?.short || '' : '', x.phone || ''].filter(Boolean).map(esc).join(' · ')}</option>`).join('');
  },
  /** Resolve a student from an ID, Reg. no, class-roll ("C10-1"), username or (unique) name. */
  findStudent(q) {
    q = String(q || '').trim(); if (!q) return null;
    const L = q.toLowerCase(), S = DB.s.students.filter(s => s.status === 'active');
    let st = S.find(s => s.id.toLowerCase() === L || String(s.regNo || '').toLowerCase() === L);
    if (st) return st;
    const m = q.match(/^([A-Za-z]+\d+)\s*[-\/ ]\s*(\d+)$/);
    if (m) { st = S.find(s => s.classId.toLowerCase() === m[1].toLowerCase() && +s.roll === +m[2]); if (st) return st; }
    const u = DB.s.users.find(x => x.username.toLowerCase() === L);
    if (u) { st = S.find(s => s.userId === u.id); if (st) return st; }
    const exact = S.filter(s => s.name.toLowerCase() === L); if (exact.length === 1) return exact[0];
    const part = S.filter(s => s.name.toLowerCase().includes(L)); return part.length === 1 ? part[0] : null;
  },
  studentInput(name, sel, campus, label = 'শিক্ষার্থী') {
    return `<div><label class="label">${label}</label>${studentPicker(name, sel && DB.student(sel) ? sel : '', { campus: campus || 'ALL', required: true })}</div>`;
  },
  expiry(date) {
    if (!date) return '<span class="text-xs text-slate-400">—</span>';
    const n = this.days(date, U.today());
    return `<div class="text-xs whitespace-nowrap ${n < 0 ? 'text-red-600 font-semibold' : n <= 30 ? 'text-amber-700 font-semibold' : ''}">${U.fmtDate(date)}</div>${n < 0 ? badge(`${bnNum(-n)} দিন আগে মেয়াদোত্তীর্ণ`, 'red') : n <= 30 ? badge(`${bnNum(n)} দিন বাকি`, 'amber') : ''}`;
  },
  monthBounds(month) { const [y, m] = month.split('-').map(Number); return [`${month}-01`, U.iso(new Date(y, m, 0))]; },
  hasInvoice(studentId, kind, month) { return DB.s.invoices.some(i => i.studentId === studentId && i.kind === kind && i.month === month && i.status !== 'cancelled'); },
  billModal(kind) {
    const cp = DB.campusId();
    Modal.open({
      title: kind === 'transport' ? 'পরিবহন ফির বিল তৈরি করুন' : 'ছাত্রাবাস ফির বিল তৈরি করুন', size: 'sm',
      body: `<form id="lg-bill" class="space-y-3"><div><label class="label">বিলের মাস</label><input type="month" class="input" name="month" value="${U.monthKey(new Date())}" required></div>
        <div><label class="label">ক্যাম্পাস</label><select class="select" name="campus">${campusOptions(cp, true)}</select></div>
        <p class="text-xs text-slate-500">${kind === 'transport' ? 'বরাদ্দপ্রাপ্ত প্রত্যেক যাত্রীর জন্য একটি করে বিল তৈরি হবে' : 'প্রত্যেক আবাসিক শিক্ষার্থীর জন্য একটি করে বিল (কক্ষ ভাড়া + খাবার পরিকল্পনা) তৈরি হবে'}, পরিশোধের শেষ তারিখ মাসের ১০ তারিখ। ওই মাসের বিল ইতোমধ্যে তৈরি হয়ে থাকলে সংশ্লিষ্ট শিক্ষার্থীকে বাদ দেওয়া হয়, তাই পুনরায় চালানো নিরাপদ।</p>
        <button class="btn btn-primary w-full">${icon('receipt')} বিল তৈরি করুন</button></form>`,
    });
    this._on('lg-bill', f => {
      const r = kind === 'transport' ? this.billTransport(f.month, f.campus) : this.billHostel(f.month, f.campus);
      Modal.close(); App.refresh();
      toast(`${U.monthName(f.month)}: ${bnNum(r.created)}টি বিল তৈরি হয়েছে (${U.money(r.amount)}), ${bnNum(r.skipped)}টি ইতোমধ্যে বিল করা ছিল।`, r.created ? 'success' : 'ok');
    });
  },

  /* ==================== TRANSPORT ==================== */
  route(id) { return this.T().routes.find(r => r.id === id); },
  vehicle(id) { return this.T().vehicles.find(v => v.id === id); },
  vehicleOf(routeId) { return this.T().vehicles.find(v => v.routeId === routeId) || null; },
  stop(route, stopId) { return route?.stops.find(s => s.id === stopId) || null; },
  activeAllocs(campus = DB.campusId()) {
    return this.T().allocations.filter(a => a.active !== false && DB.student(a.studentId)?.status === 'active' && (campus === 'ALL' || this.route(a.routeId)?.campusId === campus));
  },
  transportOf(studentId) { return this.T().allocations.find(a => a.studentId === studentId && a.active !== false) || null; },
  riders(routeId) { return this.activeAllocs('ALL').filter(a => a.routeId === routeId); },

  editVehicle(id) {
    const v = id ? this.vehicle(id) : { regNo: '', model: '', type: 'Bus', capacity: 40, campusId: DB.campusId(), status: 'Active', fitnessExpiry: '', taxExpiry: '', routeId: '', driverId: '', helperId: '' };
    Modal.open({
      title: id ? `যানবাহন সম্পাদনা · ${esc(v.regNo)}` : 'যানবাহন যোগ করুন', size: 'lg',
      body: `<form id="lg-veh" class="grid sm:grid-cols-2 gap-3">
        <div><label class="label">নিবন্ধন নম্বর</label><input class="input" name="regNo" required value="${esc(v.regNo)}" placeholder="ঢাকা মেট্রো-ব ১১-২৩৪৫"></div>
        <div><label class="label">নির্মাতা / মডেল</label><input class="input" name="model" value="${esc(v.model || '')}"></div>
        <div><label class="label">ধরন</label><select class="select" name="type">${['Bus', 'Microbus'].map(t => `<option value="${t}" ${t === v.type ? 'selected' : ''}>${bn(t)}</option>`).join('')}</select></div>
        <div><label class="label">ধারণক্ষমতা (আসন)</label><input type="number" min="1" max="90" class="input" name="capacity" value="${+v.capacity || 0}" required></div>
        <div><label class="label">ক্যাম্পাস</label><select class="select" name="campusId">${campusOptions(v.campusId)}</select></div>
        <div><label class="label">রুট</label><select class="select" name="routeId"><option value="">— নির্ধারিত নয় —</option>${this.T().routes.map(r => `<option value="${r.id}" ${r.id === v.routeId ? 'selected' : ''}>${esc(r.name)} · ${esc(DB.campus(r.campusId)?.short || '')}</option>`).join('')}</select></div>
        <div><label class="label">চালক</label><select class="select" name="driverId">${this.staffOpts('Driver', v.driverId)}</select></div>
        <div><label class="label">সহকারী</label><select class="select" name="helperId">${this.staffOpts('Transport Helper', v.helperId)}</select></div>
        <div><label class="label">ফিটনেস সনদের মেয়াদ</label><input type="date" class="input" name="fitnessExpiry" value="${esc(v.fitnessExpiry || '')}"></div>
        <div><label class="label">ট্যাক্স টোকেনের মেয়াদ</label><input type="date" class="input" name="taxExpiry" value="${esc(v.taxExpiry || '')}"></div>
        <div><label class="label">অবস্থা</label><select class="select" name="status">${['Active', 'In workshop', 'Off-road'].map(t => `<option value="${t}" ${t === v.status ? 'selected' : ''}>${bn(t)}</option>`).join('')}</select></div>
        <div class="flex items-end"><button class="btn btn-primary w-full">${icon('save')} যানবাহন সংরক্ষণ করুন</button></div></form>`,
    });
    this._on('lg-veh', f => {
      if (this.T().vehicles.some(x => x.id !== id && x.regNo.toLowerCase() === f.regNo.toLowerCase())) return toast('এই নিবন্ধন নম্বরটি ইতোমধ্যে অন্য একটি যানবাহনে ব্যবহৃত হয়েছে।', 'error');
      const rec = { regNo: f.regNo, model: f.model, type: f.type, capacity: +f.capacity || 0, campusId: f.campusId, routeId: f.routeId || null, driverId: f.driverId || null, helperId: f.helperId || null, fitnessExpiry: f.fitnessExpiry || null, taxExpiry: f.taxExpiry || null, status: f.status };
      if (rec.routeId) this.T().vehicles.filter(x => x.id !== id && x.routeId === rec.routeId).forEach(x => { x.routeId = null; toast(`${x.regNo}-কে ওই রুট থেকে অব্যাহতি দেওয়া হয়েছে।`, 'warn'); });
      if (id) Object.assign(v, rec); else this.T().vehicles.push({ id: DB.id('VEH'), ...rec });
      this.commit(id ? 'VEHICLE_UPDATE' : 'VEHICLE_ADD', 'transport_vehicles', `${rec.regNo} (${rec.type}, ${rec.capacity} seats, ${rec.status})`);
      Modal.close(); App.refresh(); toast('যানবাহনের তথ্য সংরক্ষিত হয়েছে।', 'success');
    });
  },
  maintenance(vehicleId) {
    const v = this.vehicle(vehicleId), logs = this.T().maintenance.filter(m => m.vehicleId === vehicleId).sort((a, b) => b.date.localeCompare(a.date));
    Modal.open({
      title: `রক্ষণাবেক্ষণ খাতা · ${esc(v.regNo)}`, size: 'lg',
      body: `<div class="card scroll-x mb-4"><table class="table"><thead><tr><th>তারিখ</th><th>সম্পাদিত কাজ</th><th>সরবরাহকারী</th><th class="text-right">ব্যয়</th><th>ভাউচার</th></tr></thead><tbody>
          ${logs.map(m => `<tr><td class="text-xs whitespace-nowrap">${U.fmtDate(m.date)}</td><td class="text-sm">${esc(m.description)}</td><td class="text-xs">${esc(m.vendor || '—')}</td><td class="text-right font-semibold">${U.money(m.cost)}</td><td class="text-xs">${m.voucherId ? badge(m.voucherId, 'violet') : '<span class="text-slate-400">প্রারম্ভিক</span>'}</td></tr>`).join('')}</tbody></table>${logs.length ? '' : emptyState('এখনো কোনো রক্ষণাবেক্ষণ লিপিবদ্ধ হয়নি।', 'wrench')}
          <div class="px-4 py-2 text-sm text-right border-t border-slate-100">মোট ব্যয়: <b>${U.money(U.sum(logs, m => m.cost))}</b></div></div>
        ${this.ed() ? `<form id="lg-mt" class="grid sm:grid-cols-4 gap-3 items-end">
          <div><label class="label">তারিখ</label><input type="date" class="input" name="date" value="${U.today()}" max="${U.today()}" required></div>
          <div class="sm:col-span-3"><label class="label">বিবরণ</label><input class="input" name="description" required placeholder="যেমন: টায়ার পরিবর্তন (পেছনের জোড়া)"></div>
          <div class="sm:col-span-2"><label class="label">সরবরাহকারী / ওয়ার্কশপ</label><input class="input" name="vendor" placeholder="যেমন: র‍্যাংগস ওয়ার্কশপ, তেজগাঁও"></div>
          <div><label class="label">ব্যয় (৳)</label><input type="number" min="0" class="input" name="cost" value="0"></div>
          <button class="btn btn-primary">${icon('plus')} লিপিবদ্ধ করুন</button>
          <p class="sm:col-span-4 text-xs text-slate-500">৳০-এর বেশি ব্যয় হলে একটি পরিশোধ ভাউচার পোস্ট হবে: ডেবিট ৫৫০০ পরিবহন / ক্রেডিট ১০১০ ব্যাংক।</p></form>` : ''}`,
    });
    this._on('lg-mt', f => { const r = this.addMaintenance(vehicleId, f); if (r) { App.refresh(); this.maintenance(vehicleId); toast(r.voucherId ? `লিপিবদ্ধ হয়েছে — ভাউচার ${r.voucherId} পোস্ট করা হয়েছে।` : 'লিপিবদ্ধ হয়েছে।', 'success'); } });
  },
  /** Record a maintenance job; a positive cost posts a PV (Dr 5500 / Cr 1010). Returns the log entry. */
  addMaintenance(vehicleId, { date, description, cost, vendor }) {
    const v = this.vehicle(vehicleId); if (!v || !description) return null;
    cost = Math.round(+cost || 0); date = date || U.today();
    const m = { id: DB.id('VM'), vehicleId, date, description, cost, vendor: vendor || '', voucherId: null, by: App.session?.userId || null };
    if (cost > 0) m.voucherId = DB.postJournal(`যানবাহন রক্ষণাবেক্ষণ — ${v.regNo}: ${description}`, [{ acct: '5500', dr: cost, cr: 0 }, { acct: '1010', dr: 0, cr: cost }], m.id, App.session?.userId || null, date, { kind: 'PV', campusId: v.campusId, payee: vendor || 'ওয়ার্কশপ' }).id;
    this.T().maintenance.push(m);
    this.commit('VEHICLE_MAINTENANCE', 'transport_maintenance', `${v.regNo}: ${description} — ${U.money(cost)}${m.voucherId ? ` (${m.voucherId})` : ''}`);
    return m;
  },
  editRoute(id) {
    const r = id ? this.route(id) : { name: '', campusId: DB.campusId(), zone: '', fee: 2500, stops: [] };
    const inUse = id ? this.riders(id).length : 0;
    Modal.open({
      title: id ? `রুট সম্পাদনা · ${esc(r.name)}` : 'রুট যোগ করুন', size: 'md',
      body: `<form id="lg-rt" class="space-y-3"><div class="grid sm:grid-cols-2 gap-3">
          <div><label class="label">রুটের নাম</label><input class="input" name="name" required value="${esc(r.name)}" placeholder="যেমন: ধানমন্ডি"></div>
          <div><label class="label">ক্যাম্পাস</label><select class="select" name="campusId">${campusOptions(r.campusId)}</select></div>
          <div><label class="label">ভাড়া অঞ্চল</label><input class="input" name="zone" required value="${esc(r.zone)}" placeholder="অঞ্চল এ — ধানমন্ডি"></div>
          <div><label class="label">মাসিক ফি (৳)</label><input type="number" min="0" class="input" name="fee" required value="${+r.fee || 0}"></div></div>
          <div><label class="label">পিকআপের ক্রমানুসারে স্টপেজ — প্রতি লাইনে একটি: <code>স্টপেজের নাম | ঘণ্টা:মিনিট</code></label><textarea class="textarea font-mono text-sm" rows="6" name="stops" required>${esc(r.stops.map(s => `${s.name} | ${s.time}`).join('\n'))}</textarea></div>
          <div class="flex gap-2"><button class="btn btn-primary flex-1">${icon('save')} রুট সংরক্ষণ করুন</button>${id ? `<button type="button" class="btn btn-danger" ${inUse ? `disabled title="${bnNum(inUse)} জন যাত্রী বরাদ্দপ্রাপ্ত"` : ''} onclick="Logistics.deleteRoute('${id}')">${icon('trash-2')} মুছে ফেলুন</button>` : ''}</div></form>`,
    });
    this._on('lg-rt', f => {
      const stops = f.stops.split('\n').map(l => l.trim()).filter(Boolean).map((l, i) => {
        const [name, time] = l.split('|').map(x => (x || '').trim());
        const old = r.stops.find(s => s.name.toLowerCase() === name.toLowerCase());
        return { id: old ? old.id : `${id || 'RT'}-S${Date.now().toString(36)}${i}`, name, time: /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, '0') : '07:00' };
      });
      if (!stops.length) return toast('অন্তত একটি স্টপেজ যোগ করুন।', 'error');
      const rec = { name: f.name, campusId: f.campusId, zone: f.zone, fee: Math.round(+f.fee || 0), stops };
      if (id) Object.assign(r, rec); else this.T().routes.push({ id: DB.id('RT'), ...rec });
      this.commit(id ? 'ROUTE_UPDATE' : 'ROUTE_ADD', 'transport_routes', `${rec.name} · ${rec.zone} · ${U.money(rec.fee)}/month · ${stops.length} stops`);
      Modal.close(); App.refresh(); toast('রুট সংরক্ষিত হয়েছে।', 'success');
    });
  },
  deleteRoute(id) {
    const r = this.route(id); if (this.riders(id).length) return toast('এই রুটে যাত্রী রয়েছে — আগে তাঁদের অন্য রুটে বরাদ্দ করুন।', 'error');
    if (!confirm(`${r.name} রুটটি মুছে ফেলবেন?`)) return;
    this.T().routes = this.T().routes.filter(x => x.id !== id);
    this.T().vehicles.forEach(v => { if (v.routeId === id) v.routeId = null; });
    this.commit('ROUTE_DELETE', 'transport_routes', r.name); Modal.close(); App.refresh();
  },
  _fillStops(routeId, sel) {
    const r = this.route(routeId), el = $('#lg-al-stop'); if (!el) return;
    el.innerHTML = (r?.stops || []).map(s => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(U.bn(s.time))} · ${esc(s.name)}</option>`).join('');
  },
  allocate(studentId) {
    const cp = DB.campusId(), routes = this.T().routes.filter(r => r.campusId === cp);
    if (!routes.length) return toast('এই ক্যাম্পাসে কোনো রুট নেই — আগে একটি রুট যোগ করুন।', 'warn');
    Modal.open({
      title: 'শিক্ষার্থীকে বাস রুটে বরাদ্দ করুন', size: 'md',
      body: `<form id="lg-al" class="space-y-3">${this.studentInput('student', studentId, cp)}
        <div class="grid sm:grid-cols-2 gap-3"><div><label class="label">রুট</label><select class="select" name="routeId" onchange="Logistics._fillStops(this.value)">${routes.map(r => { const v = this.vehicleOf(r.id); return `<option value="${r.id}">${esc(r.name)} · ${U.money(r.fee)} · ${bnNum(this.riders(r.id).length)}/${v ? bnNum(v.capacity) : '—'}</option>`; }).join('')}</select></div>
        <div><label class="label">পিকআপ স্টপেজ</label><select class="select" name="stopId" id="lg-al-stop"></select></div></div>
        <div><label class="label">শুরুর তারিখ</label><input type="date" class="input" name="from" value="${U.today()}" required></div>
        <p class="text-xs text-slate-500">শিক্ষার্থী ইতোমধ্যে অন্য কোনো রুটে যাতায়াত করলে সেই বরাদ্দ আগের দিন শেষ হবে। অভিভাবকগণ পিকআপের স্থান, সময় ও চালকের নম্বরসহ একটি এসএমএস পাবেন।</p>
        <button class="btn btn-primary w-full">${icon('bus')} বরাদ্দ করুন</button></form>`,
    });
    this._fillStops(routes[0].id);
    this._on('lg-al', f => { const st = this.findStudent(f.student); if (!st) return toast('শিক্ষার্থী পাওয়া যায়নি — আইডি, নিবন্ধন নম্বর অথবা শ্রেণি-রোল ব্যবহার করুন।', 'error'); if (this.allocateStudent(st.id, f.routeId, f.stopId, f.from)) { Modal.close(); App.refresh(); } });
  },
  /** Allocate a student to a route/stop from a date (closes any previous allocation). Returns the allocation or null. */
  allocateStudent(studentId, routeId, stopId, from = U.today()) {
    const st = DB.student(studentId), r = this.route(routeId), sp = this.stop(r, stopId) || r?.stops[0];
    if (!st || !r || !sp) { toast('শিক্ষার্থী, রুট ও স্টপেজ নির্বাচন করুন।', 'error'); return null; }
    const v = this.vehicleOf(r.id), prev = this.transportOf(st.id);
    if (prev && prev.routeId === r.id && prev.stopId === sp.id) { toast(`${pn(st)} ইতোমধ্যে ওই স্টপেজ থেকে এই রুটে যাতায়াত করে।`, 'warn'); return null; }
    if (v && (!prev || prev.routeId !== r.id) && this.riders(r.id).length >= v.capacity) { toast(`${r.name} পূর্ণ (${v.regNo}-এ ${bnNum(v.capacity)}টি আসন)।`, 'error'); return null; }
    if (prev) { prev.active = false; prev.to = U.iso(U.addDays(from, -1)); }
    const a = { id: DB.id('TA'), studentId: st.id, routeId: r.id, stopId: sp.id, from, to: null, active: true };
    this.T().allocations.push(a);
    const d = v && this.staff(v.driverId);
    DB.guardiansOf(st.id).forEach(g => DB.sms(g.phone, `${DB.s.school.nameBn || DB.s.school.shortName}: ${U.fmtDate(from)} থেকে ${pn(st)}-কে ${r.name} রুটের স্কুল বাসে বরাদ্দ করা হয়েছে। পিকআপ: ${sp.name}, সময় ${U.bn(sp.time)}।${v ? ` বাস ${v.regNo}` : ''}${d ? `, চালক ${pn(d)} ${d.phone}` : ''}। মাসিক ফি ${U.money(r.fee)}।`));
    this.commit('TRANSPORT_ALLOCATE', 'transport_allocations', `${st.name} (${st.id}) → ${r.name} @ ${sp.name} from ${from}`);
    toast(`${pn(st)}-কে ${r.name} রুটে বরাদ্দ করা হয়েছে।`, 'success');
    return a;
  },
  endAllocation(id) {
    const a = this.T().allocations.find(x => x.id === id), st = DB.student(a.studentId);
    if (!confirm(`আজ থেকে ${pn(st)}-এর পরিবহন সুবিধা বন্ধ করবেন?`)) return;
    a.active = false; a.to = U.today();
    this.commit('TRANSPORT_END', 'transport_allocations', `${st.name} (${st.id}) left route ${this.route(a.routeId)?.name}`); App.refresh();
  },
  /** Idempotent monthly transport billing. Returns {created, skipped, amount}. */
  billTransport(month, campus = 'ALL') {
    const [first, last] = this.monthBounds(month); let created = 0, skipped = 0, amount = 0;
    this.T().allocations.filter(a => a.from <= last && (!a.to || a.to >= first) && (a.active !== false || a.to)).forEach(a => {
      const st = DB.student(a.studentId), r = this.route(a.routeId);
      if (!st || st.status !== 'active' || !r || (campus !== 'ALL' && r.campusId !== campus)) return;
      if (this.hasInvoice(st.id, 'transport', month)) { skipped++; return; }
      const inv = DB.bill(st.id, { item: `পরিবহন ফি — ${U.monthName(month)} (${r.name})`, amount: r.fee, due: `${month}-10`, kind: 'transport', incomeAcct: '4400', month, ref: a.id, by: App.session?.userId });
      if (inv) { created++; amount += inv.amount; }
    });
    if (created) this.commit('TRANSPORT_BILLING', 'invoices', `${created} transport invoice(s) for ${month} (${campus}) — ${U.money(amount)}`);
    return { created, skipped, amount };
  },
  printRoster(routeId) {
    const routes = routeId ? [this.route(routeId)] : this.T().routes.filter(r => r.campusId === DB.campusId());
    if (!routes.length) return toast('মুদ্রণের জন্য কোনো রুট নেই।', 'warn');
    const sheets = routes.map(r => {
      const v = this.vehicleOf(r.id), d = v && this.staff(v.driverId), h = v && this.staff(v.helperId), riders = this.riders(r.id);
      let n = 0;
      const group = (title, list) => `<tr style="background:#f1f5f9"><td colspan="5" style="font-weight:700">${title} <span style="font-weight:400;color:#64748b">(${bnNum(list.length)})</span></td></tr>` + list.map(a => DB.student(a.studentId)).sort((x, y) => x.name.localeCompare(y.name)).map(st => `<tr><td>${bnNum(++n)}</td><td>${esc(pn(st))}</td><td>${esc(DB.className(st.classId))} · রোল ${bnNum(st.roll)}</td><td>${esc(DB.guardiansOf(st.id)[0]?.phone || st.emergency || '')}</td><td></td></tr>`).join('');
      const orphans = riders.filter(a => !this.stop(r, a.stopId));
      const body = r.stops.map(sp => group(`${esc(U.bn(sp.time))} · ${esc(sp.name)}`, riders.filter(a => a.stopId === sp.id))).join('') + (orphans.length ? group('স্টপেজ নির্ধারিত নয়', orphans) : '');
      return Print.sheet({ paper: 'A4' }, 'padded') + Print.header(`রুটের যাত্রী তালিকা — ${esc(r.name)}`)
        + `<div style="display:flex;justify-content:space-between;gap:6mm;font-size:9pt;margin-bottom:4mm"><div><b>অঞ্চল:</b> ${esc(r.zone)}<br><b>মাসিক ফি:</b> ${U.money(r.fee)}</div><div><b>যানবাহন:</b> ${v ? `${esc(v.regNo)} (${esc(bn(v.type))}, ${bnNum(v.capacity)}টি আসন)` : '—'}<br><b>যাত্রী:</b> ${bnNum(riders.length)}</div><div><b>চালক:</b> ${d ? `${esc(pn(d))} · ${esc(d.phone)}` : '—'}<br><b>সহকারী:</b> ${h ? `${esc(pn(h))} · ${esc(h.phone)}` : '—'}</div></div>`
        + `<table class="ms-table" style="width:100%;font-size:9pt"><thead><tr><th style="width:8mm">#</th><th>শিক্ষার্থী</th><th>শ্রেণি · রোল</th><th>অভিভাবকের ফোন</th><th style="width:22mm">উঠেছে ✓</th></tr></thead><tbody>${body}</tbody></table>`
        + `<div style="display:flex;justify-content:space-between;margin-top:16mm;font-size:8.5pt"><div style="border-top:.25mm solid #0f172a;width:50mm;text-align:center;padding-top:1mm">চালক</div><div style="border-top:.25mm solid #0f172a;width:50mm;text-align:center;padding-top:1mm">পরিবহন তত্ত্বাবধায়ক</div></div>`
        + `<div style="font-size:7.5pt;color:#64748b;margin-top:4mm">মুদ্রণের তারিখ ${U.fmtDate(U.today())} · ${esc(DB.campus(r.campusId)?.name || '')}</div></div>`;
    });
    Print.preview(routeId ? 'রুটের যাত্রী তালিকা' : 'রুটের যাত্রী তালিকাসমূহ', sheets, { paper: 'A4', re: ['Logistics.printRoster', routeId || null] });
  },

  renderTransport() {
    const cp = DB.campusId(), T = this.T(), ed = this.ed(), tab = App.ui.lgT || 'fleet';
    const routes = T.routes.filter(r => r.campusId === cp), vehicles = T.vehicles.filter(v => v.campusId === cp), allocs = this.activeAllocs(cp);
    const alerts = vehicles.filter(v => [v.fitnessExpiry, v.taxExpiry].some(d => d && this.days(d, U.today()) <= 30));
    const mk = U.monthKey(new Date()), billed = allocs.filter(a => this.hasInvoice(a.studentId, 'transport', mk)).length;
    const logs = T.maintenance.filter(m => vehicles.some(v => v.id === m.vehicleId));
    const vehRow = v => {
      const r = this.route(v.routeId), d = this.staff(v.driverId), h = this.staff(v.helperId), n = r ? this.riders(r.id).length : 0;
      return `<tr><td><div class="font-semibold whitespace-nowrap">${esc(v.regNo)}</div><div class="text-xs text-slate-500">${badge(bn(v.type), v.type === 'Bus' ? 'blue' : 'violet')} ${esc(v.model || '')}</div></td>
        <td class="w-36"><div class="text-xs mb-1">${bnNum(n)}/${bnNum(v.capacity)} আসন</div>${progressBar(v.capacity ? n / v.capacity * 100 : 0, n >= v.capacity ? 'bg-red-500' : 'bg-brand-600')}</td>
        <td class="text-xs">${d ? `<b>${esc(pn(d))}</b><div class="text-slate-500">${esc(d.phone)}</div>` : '<span class="text-amber-700">চালক নেই</span>'}</td>
        <td class="text-xs">${h ? `${esc(pn(h))}<div class="text-slate-500">${esc(h.phone)}</div>` : '—'}</td>
        <td class="text-sm">${r ? esc(r.name) : '<span class="text-slate-400">—</span>'}</td>
        <td>${this.expiry(v.fitnessExpiry)}</td><td>${this.expiry(v.taxExpiry)}</td>
        <td>${badge(bn(v.status), v.status === 'Active' ? 'green' : v.status === 'In workshop' ? 'amber' : 'red')}</td>
        <td><div class="flex gap-1 justify-end"><button class="btn btn-ghost btn-sm" title="রক্ষণাবেক্ষণ খাতা" onclick="Logistics.maintenance('${v.id}')">${icon('wrench')}</button>${ed ? `<button class="btn btn-ghost btn-sm" title="সম্পাদনা" onclick="Logistics.editVehicle('${v.id}')">${icon('pencil')}</button>` : ''}</div></td></tr>`;
    };
    let body = '';
    if (tab === 'fleet') body = `<div class="card scroll-x"><div class="px-5 py-3 border-b border-slate-100 flex items-center justify-between"><b>যানবহর</b>${ed ? `<button class="btn btn-ghost btn-sm" onclick="Logistics.editVehicle()">${icon('plus')} যানবাহন যোগ করুন</button>` : ''}</div>
        <table class="table"><thead><tr><th>যানবাহন</th><th>যাত্রীভার</th><th>চালক</th><th>সহকারী</th><th>রুট</th><th>ফিটনেস</th><th>ট্যাক্স টোকেন</th><th>অবস্থা</th><th></th></tr></thead><tbody>${vehicles.map(vehRow).join('')}</tbody></table>${vehicles.length ? '' : emptyState('এই ক্যাম্পাসে কোনো যানবাহন নেই।', 'bus')}</div>`;
    else if (tab === 'routes') body = `<div class="grid md:grid-cols-2 xl:grid-cols-3 gap-4">${routes.map(r => {
        const v = this.vehicleOf(r.id), rs = this.riders(r.id);
        return `<div class="card p-4 flex flex-col"><div class="flex items-start justify-between gap-2"><div><div class="font-bold text-slate-900">${icon('route', 'w-4 h-4 inline text-brand-600')} ${esc(r.name)}</div><div class="text-xs text-slate-500">${esc(r.zone)}</div></div><div class="text-right"><div class="font-extrabold text-brand-700">${U.money(r.fee)}</div><div class="text-[11px] text-slate-400">প্রতি মাসে</div></div></div>
          <div class="text-xs text-slate-600 mt-2">${v ? `${icon('bus', 'w-3.5 h-3.5 inline')} ${esc(v.regNo)} · ${bnNum(rs.length)}/${bnNum(v.capacity)} জন যাত্রী` : '<span class="text-amber-700">কোনো যানবাহন নির্ধারিত নয়</span>'}</div>
          <ol class="mt-3 space-y-1.5 flex-1">${r.stops.map((s, i) => `<li class="flex items-center gap-2 text-sm"><span class="w-5 h-5 rounded-full bg-brand-50 text-brand-700 text-[11px] font-bold flex items-center justify-center shrink-0">${bnNum(i + 1)}</span><span class="flex-1 min-w-0 truncate">${esc(s.name)}</span><span class="text-xs font-mono text-slate-500">${esc(U.bn(s.time))}</span>${badge(bnNum(rs.filter(a => a.stopId === s.id).length), 'slate')}</li>`).join('')}</ol>
          <div class="flex gap-2 mt-3 pt-3 border-t border-slate-100"><button class="btn btn-ghost btn-sm flex-1" onclick="Logistics.printRoster('${r.id}')">${icon('printer')} যাত্রী তালিকা</button>${ed ? `<button class="btn btn-ghost btn-sm" onclick="Logistics.editRoute('${r.id}')">${icon('pencil')} সম্পাদনা</button>` : ''}</div></div>`;
      }).join('')}${ed ? `<button class="card p-4 border-dashed flex flex-col items-center justify-center gap-2 text-slate-500 hover:text-brand-700 hover:border-brand-400 min-h-[160px]" onclick="Logistics.editRoute()">${icon('plus', 'w-6 h-6')}<span class="text-sm font-semibold">রুট যোগ করুন</span></button>` : ''}</div>${routes.length || ed ? '' : emptyState('এই ক্যাম্পাসে কোনো রুট নেই।', 'route')}`;
    else if (tab === 'riders') body = `<div class="card scroll-x"><table class="table"><thead><tr><th>শিক্ষার্থী</th><th>রুট</th><th>স্টপেজ · পিকআপ</th><th>হতে</th><th class="text-right">ফি</th><th>${U.monthName(mk)}</th><th></th></tr></thead><tbody>
        ${allocs.map(a => ({ a, st: DB.student(a.studentId), r: this.route(a.routeId) })).sort((x, y) => x.r.name.localeCompare(y.r.name) || x.st.name.localeCompare(y.st.name)).map(({ a, st, r }) => { const sp = this.stop(r, a.stopId);
          return `<tr><td><div class="flex items-center gap-2">${avatar(st, 28)}<div><div class="font-semibold text-sm">${esc(pn(st))}</div><div class="text-xs text-slate-400">${esc(DB.className(st.classId))} · রোল ${bnNum(st.roll)}</div></div></div></td><td class="text-sm">${esc(r.name)}</td><td class="text-xs">${sp ? `${esc(sp.name)}<div class="font-mono text-slate-500">${esc(U.bn(sp.time))}</div>` : '—'}</td><td class="text-xs">${U.fmtDate(a.from)}</td><td class="text-right text-sm">${U.money(r.fee)}</td><td>${this.hasInvoice(st.id, 'transport', mk) ? badge('বিল করা হয়েছে', 'green') : badge('বিল করা হয়নি', 'amber')}</td>
            <td><div class="flex gap-1 justify-end">${ed ? `<button class="btn btn-ghost btn-sm" title="রুট / স্টপেজ পরিবর্তন করুন" onclick="Logistics.allocate('${st.id}')">${icon('arrow-left-right')}</button><button class="btn btn-ghost btn-sm text-red-600" title="পরিবহন সুবিধা বন্ধ করুন" onclick="Logistics.endAllocation('${a.id}')">${icon('x')}</button>` : ''}</div></td></tr>`; }).join('')}</tbody></table>${allocs.length ? '' : emptyState('এই ক্যাম্পাসে কোনো শিক্ষার্থী বরাদ্দ করা হয়নি।', 'users')}</div>`;
    else body = `<div class="card scroll-x"><table class="table"><thead><tr><th>তারিখ</th><th>যানবাহন</th><th>সম্পাদিত কাজ</th><th>সরবরাহকারী</th><th class="text-right">ব্যয়</th><th>ভাউচার</th></tr></thead><tbody>
        ${[...logs].sort((a, b) => b.date.localeCompare(a.date)).map(m => `<tr><td class="text-xs whitespace-nowrap">${U.fmtDate(m.date)}</td><td class="text-sm"><button class="hover:underline font-semibold" onclick="Logistics.maintenance('${m.vehicleId}')">${esc(this.vehicle(m.vehicleId)?.regNo || '')}</button></td><td class="text-sm">${esc(m.description)}</td><td class="text-xs">${esc(m.vendor || '—')}</td><td class="text-right font-semibold">${U.money(m.cost)}</td><td class="text-xs">${m.voucherId ? badge(m.voucherId, 'violet') : '<span class="text-slate-400">প্রারম্ভিক</span>'}</td></tr>`).join('')}</tbody></table>${logs.length ? '' : emptyState('কোনো রক্ষণাবেক্ষণ লিপিবদ্ধ নেই।', 'wrench')}</div>`;

    return pageHeader('পরিবহন ও যানবহর', `${esc(DB.campus().name)} · যানবাহন, অঞ্চলভিত্তিক রুট, স্টপেজ, যাত্রী ও মাসিক পরিবহন বিল।`,
      `<button class="btn btn-ghost" onclick="Logistics.printRoster()">${icon('printer')} যাত্রী তালিকা মুদ্রণ</button>${ed ? `<button class="btn btn-ghost" onclick="Logistics.billModal('transport')">${icon('receipt')} বিল তৈরি করুন</button><button class="btn btn-primary" onclick="Logistics.allocate()">${icon('user-plus')} শিক্ষার্থী বরাদ্দ করুন</button>` : ''}`)
      + `<div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">${kpi('যানবাহন', bnNum(vehicles.length), `${bnNum(vehicles.filter(v => v.status === 'Active').length)}টি সক্রিয় · ${bnNum(U.sum(vehicles, v => v.capacity))}টি আসন`, 'bus', 'blue')}${kpi('রুট', bnNum(routes.length), `${bnNum(U.sum(routes, r => r.stops.length))}টি স্টপেজ`, 'route', 'violet')}${kpi('যাত্রী', bnNum(allocs.length), `${U.money(U.sum(allocs, a => this.route(a.routeId)?.fee || 0))}/মাস · ${U.monthName(mk)}-এর জন্য ${bnNum(billed)} জনের বিল করা হয়েছে`, 'users', 'green')}${kpi('মেয়াদোত্তীর্ণপ্রায় কাগজপত্র', bnNum(alerts.length), alerts.length ? alerts.map(v => esc(v.regNo.replace('Dhaka Metro-', ''))).join(', ') : 'ফিটনেস ও ট্যাক্স টোকেন আপডেট', 'shield-alert', alerts.length ? 'red' : 'green')}</div>`
      + tabs('lgT', [['fleet', 'যানবহর', 'bus'], ['routes', 'রুট ও স্টপেজ', 'route'], ['riders', `যাত্রী (${bnNum(allocs.length)})`, 'users'], ['maint', `রক্ষণাবেক্ষণ (${bnNum(logs.length)})`, 'wrench']], tab) + body;
  },

  /* ==================== HOSTEL ==================== */
  building(id) { return this.H().buildings.find(b => b.id === id); },
  room(id) { return this.H().rooms.find(r => r.id === id); },
  mealPlan(id) { return this.H().mealPlans.find(m => m.id === id); },
  hostelOf(studentId) { return this.H().allocations.find(a => a.studentId === studentId && a.active !== false) || null; },
  occupant(roomId, bed) { return this.H().allocations.find(a => a.active !== false && a.roomId === roomId && +a.bed === +bed) || null; },
  residents(campus = DB.campusId()) { return this.H().allocations.filter(a => a.active !== false && DB.student(a.studentId) && (campus === 'ALL' || this.building(this.room(a.roomId)?.buildingId)?.campusId === campus)); },
  freeBeds(room) { return Array.from({ length: room.beds }, (_, i) => i + 1).filter(b => !this.occupant(room.id, b)); },
  monthlyHostel(a) { const r = this.room(a.roomId), m = this.mealPlan(a.mealPlanId); return (r?.rent || 0) + (m?.fee || 0); },
  occupancy(buildingId) { const rooms = this.H().rooms.filter(r => r.buildingId === buildingId), total = U.sum(rooms, r => r.beds), occ = U.sum(rooms, r => r.beds - this.freeBeds(r).length); return { total, occ, free: total - occ }; },

  editBuilding(id) {
    const b = id ? this.building(id) : { name: '', campusId: DB.campusId(), wardenId: '', note: '' };
    Modal.open({
      title: id ? `ভবন সম্পাদনা · ${esc(b.name)}` : 'ছাত্রাবাস ভবন যোগ করুন', size: 'sm',
      body: `<form id="lg-hb" class="space-y-3"><div><label class="label">ভবনের নাম</label><input class="input" name="name" required value="${esc(b.name)}" placeholder="আবাসিক অংশ"></div>
        <div><label class="label">ক্যাম্পাস</label><select class="select" name="campusId">${campusOptions(b.campusId)}</select></div>
        <div><label class="label">তত্ত্বাবধায়ক</label><select class="select" name="wardenId">${this.staffOpts('Hostel Warden', b.wardenId)}</select></div>
        <div><label class="label">মন্তব্য</label><input class="input" name="note" value="${esc(b.note || '')}" placeholder="১ম তলা ছাত্র · ২য় তলা ছাত্রী"></div>
        <button class="btn btn-primary w-full">সংরক্ষণ করুন</button></form>`,
    });
    this._on('lg-hb', f => {
      const rec = { name: f.name, campusId: f.campusId, wardenId: f.wardenId || null, note: f.note };
      if (id) Object.assign(b, rec); else this.H().buildings.push({ id: DB.id('HB'), ...rec });
      this.commit(id ? 'HOSTEL_BUILDING_UPDATE' : 'HOSTEL_BUILDING_ADD', 'hostel_buildings', rec.name); Modal.close(); App.refresh();
    });
  },
  editRoom(id, buildingId) {
    const cp = DB.campusId(), blds = this.H().buildings.filter(b => b.campusId === cp);
    if (!blds.length) return toast('আগে এই ক্যাম্পাসে একটি ছাত্রাবাস ভবন যোগ করুন।', 'warn');
    const r = id ? this.room(id) : { buildingId: buildingId || blds[0].id, no: '', floor: 1, beds: 4, rent: 3000, gender: 'Male' };
    const maxUsed = id ? Math.max(0, ...this.H().allocations.filter(a => a.active !== false && a.roomId === id).map(a => +a.bed)) : 0;
    Modal.open({
      title: id ? `কক্ষ সম্পাদনা · ${esc(r.no)}` : 'কক্ষ যোগ করুন', size: 'sm',
      body: `<form id="lg-hr" class="grid grid-cols-2 gap-3"><div class="col-span-2"><label class="label">ভবন</label><select class="select" name="buildingId">${blds.map(b => `<option value="${b.id}" ${b.id === r.buildingId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>
        <div><label class="label">কক্ষ নম্বর</label><input class="input" name="no" required value="${esc(r.no)}" placeholder="R-105"></div>
        <div><label class="label">তলা</label><input type="number" min="0" max="20" class="input" name="floor" value="${r.floor}"></div>
        <div><label class="label">শয্যা</label><input type="number" min="${Math.max(1, maxUsed)}" max="12" class="input" name="beds" value="${r.beds}" required></div>
        <div><label class="label">কক্ষ ভাড়া / মাস (৳)</label><input type="number" min="0" class="input" name="rent" value="${r.rent}" required></div>
        <div class="col-span-2"><label class="label">আবাসিক</label><select class="select" name="gender">${[['Male', 'ছাত্র'], ['Female', 'ছাত্রী'], ['', 'যেকোনো']].map(([v, l]) => `<option value="${v}" ${v === (r.gender || '') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <button class="btn btn-primary col-span-2">কক্ষ সংরক্ষণ করুন</button></form>`,
    });
    this._on('lg-hr', f => {
      if (+f.beds < maxUsed) return toast(`শয্যা ${bnNum(maxUsed)} বরাদ্দকৃত — ${bnNum(maxUsed)}-এর কম করা যাবে না।`, 'error');
      const rec = { buildingId: f.buildingId, no: f.no, floor: +f.floor || 0, beds: U.clamp(+f.beds || 1, 1, 12), rent: Math.round(+f.rent || 0), gender: f.gender || null };
      if (id) Object.assign(r, rec); else this.H().rooms.push({ id: DB.id('HR'), ...rec });
      this.commit(id ? 'HOSTEL_ROOM_UPDATE' : 'HOSTEL_ROOM_ADD', 'hostel_rooms', `${rec.no}: ${rec.beds} beds, ${U.money(rec.rent)}/month`); Modal.close(); App.refresh();
    });
  },
  editMealPlan(id) {
    const m = id ? this.mealPlan(id) : { name: '', fee: 4000, desc: '' };
    Modal.open({
      title: id ? 'খাবার পরিকল্পনা সম্পাদনা' : 'খাবার পরিকল্পনা যোগ করুন', size: 'sm',
      body: `<form id="lg-mp" class="space-y-3"><div><label class="label">পরিকল্পনার নাম</label><input class="input" name="name" required value="${esc(m.name)}"></div>
        <div><label class="label">মাসিক ফি (৳)</label><input type="number" min="0" class="input" name="fee" required value="${m.fee}"></div>
        <div><label class="label">যা অন্তর্ভুক্ত</label><input class="input" name="desc" value="${esc(m.desc || '')}"></div><button class="btn btn-primary w-full">সংরক্ষণ করুন</button></form>`,
    });
    this._on('lg-mp', f => {
      const rec = { name: f.name, fee: Math.round(+f.fee || 0), desc: f.desc };
      if (id) Object.assign(m, rec); else this.H().mealPlans.push({ id: DB.id('MP'), ...rec });
      this.commit(id ? 'MEAL_PLAN_UPDATE' : 'MEAL_PLAN_ADD', 'hostel_meal_plans', `${rec.name} ${U.money(rec.fee)}`); Modal.close(); App.refresh();
    });
  },
  _fillBeds(roomId, sel) {
    const r = this.room(roomId), el = $('#lg-ha-bed'); if (!el || !r) return;
    const free = this.freeBeds(r);
    el.innerHTML = free.map(b => `<option value="${b}" ${+sel === b ? 'selected' : ''}>শয্যা ${bnNum(b)}</option>`).join('') || '<option value="">কোনো খালি শয্যা নেই</option>';
  },
  allocateBed(roomId, bed) {
    const cp = DB.campusId(), rooms = this.H().rooms.filter(r => this.building(r.buildingId)?.campusId === cp);
    if (!rooms.length) return toast('এই ক্যাম্পাসে ছাত্রাবাসের কোনো কক্ষ নেই।', 'warn');
    if (!this.H().mealPlans.length) return toast('আগে একটি খাবার পরিকল্পনা যোগ করুন।', 'warn');
    const first = roomId ? this.room(roomId) : rooms.find(r => this.freeBeds(r).length) || rooms[0];
    Modal.open({
      title: 'ছাত্রাবাসের শয্যা বরাদ্দ করুন', size: 'md',
      body: `<form id="lg-ha" class="space-y-3">${this.studentInput('student', '', cp)}
        <div class="grid sm:grid-cols-2 gap-3"><div><label class="label">কক্ষ</label><select class="select" name="roomId" onchange="Logistics._fillBeds(this.value)">${rooms.map(r => `<option value="${r.id}" ${r.id === first.id ? 'selected' : ''}>${esc(r.no)} · ${r.gender === 'Female' ? 'ছাত্রী' : r.gender === 'Male' ? 'ছাত্র' : 'যেকোনো'} · ${bnNum(this.freeBeds(r).length)}/${bnNum(r.beds)} খালি · ${U.money(r.rent)}</option>`).join('')}</select></div>
        <div><label class="label">শয্যা</label><select class="select" name="bed" id="lg-ha-bed"></select></div>
        <div><label class="label">খাবার পরিকল্পনা</label><select class="select" name="mealPlanId">${this.H().mealPlans.map(m => `<option value="${m.id}">${esc(m.name)} · ${U.money(m.fee)}</option>`).join('')}</select></div>
        <div><label class="label">শুরুর তারিখ</label><input type="date" class="input" name="from" value="${U.today()}" required></div></div>
        <button class="btn btn-primary w-full">${icon('bed-double')} শয্যা বরাদ্দ করুন</button></form>`,
    });
    this._fillBeds(first.id, bed);
    this._on('lg-ha', f => { const st = this.findStudent(f.student); if (!st) return toast('শিক্ষার্থী পাওয়া যায়নি।', 'error'); if (this.allocateHostel(st.id, f.roomId, +f.bed, f.mealPlanId, f.from)) { Modal.close(); App.refresh(); } });
  },
  /** Bed-level hostel allocation. Returns the allocation or null. */
  allocateHostel(studentId, roomId, bed, mealPlanId, from = U.today()) {
    const st = DB.student(studentId), r = this.room(roomId), m = this.mealPlan(mealPlanId);
    if (!st || !r || !m || !bed) { toast('শিক্ষার্থী, কক্ষ, শয্যা ও খাবার পরিকল্পনা নির্বাচন করুন।', 'error'); return null; }
    if (this.hostelOf(st.id)) { toast(`${pn(st)}-এর নামে ইতোমধ্যে একটি শয্যা বরাদ্দ আছে — আগে সেটি খালি করুন।`, 'error'); return null; }
    if (this.occupant(r.id, bed)) { toast(`${r.no}-এর শয্যা ${bnNum(bed)} বরাদ্দকৃত।`, 'error'); return null; }
    if (bed > r.beds) { toast('শয্যা নম্বর সঠিক নয়।', 'error'); return null; }
    if (r.gender && st.gender && r.gender !== st.gender) { toast(`${r.no} ${r.gender === 'Female' ? 'ছাত্রীদের' : 'ছাত্রদের'} কক্ষ।`, 'error'); return null; }
    const a = { id: DB.id('HA'), studentId: st.id, roomId: r.id, bed: +bed, mealPlanId: m.id, from, to: null, active: true };
    this.H().allocations.push(a);
    DB.guardiansOf(st.id).forEach(g => DB.sms(g.phone, `${DB.s.school.nameBn || DB.s.school.shortName}: ${U.fmtDate(from)} থেকে ${pn(st)}-কে ${this.building(r.buildingId)?.name || 'ছাত্রাবাস'}-এর কক্ষ ${r.no}, শয্যা ${bnNum(bed)} বরাদ্দ করা হয়েছে। খাবার পরিকল্পনা: ${m.name}। মাসিক খরচ ${U.money(r.rent + m.fee)}।`));
    this.commit('HOSTEL_ALLOCATE', 'hostel_allocations', `${st.name} (${st.id}) → ${r.no} bed ${bed}, ${m.name}`);
    toast(`${pn(st)}-কে ${r.no} · শয্যা ${bnNum(bed)} বরাদ্দ করা হয়েছে।`, 'success');
    return a;
  },
  vacate(allocId) {
    const a = this.H().allocations.find(x => x.id === allocId), st = DB.student(a.studentId), r = this.room(a.roomId);
    if (!confirm(`আজ থেকে ${r.no}-এর শয্যা ${bnNum(a.bed)} (${pn(st)}) খালি করবেন?`)) return;
    a.active = false; a.to = U.today();
    this.commit('HOSTEL_VACATE', 'hostel_allocations', `${st.name} (${st.id}) vacated ${r.no} bed ${a.bed}`); Modal.close(); App.refresh(); toast('শয্যা খালি করা হয়েছে।', 'success');
  },
  changeMeal(allocId) {
    const a = this.H().allocations.find(x => x.id === allocId), st = DB.student(a.studentId);
    Modal.open({ title: `খাবার পরিকল্পনা · ${esc(pn(st))}`, size: 'sm', body: `<form id="lg-cm" class="space-y-3"><select class="select" name="mealPlanId">${this.H().mealPlans.map(m => `<option value="${m.id}" ${m.id === a.mealPlanId ? 'selected' : ''}>${esc(m.name)} · ${U.money(m.fee)}</option>`).join('')}</select><p class="text-xs text-slate-500">ছাত্রাবাসের পরবর্তী বিল প্রস্তুতকালে কার্যকর হবে।</p><button class="btn btn-primary w-full">সংরক্ষণ করুন</button></form>` });
    this._on('lg-cm', f => { a.mealPlanId = f.mealPlanId; this.commit('HOSTEL_MEAL_CHANGE', 'hostel_allocations', `${st.name} → ${this.mealPlan(f.mealPlanId)?.name}`); Modal.close(); App.refresh(); });
  },
  bedInfo(allocId) {
    const a = this.H().allocations.find(x => x.id === allocId), st = DB.student(a.studentId), r = this.room(a.roomId), m = this.mealPlan(a.mealPlanId), g = DB.guardiansOf(st.id)[0];
    Modal.open({
      title: `${esc(r.no)} · শয্যা ${bnNum(a.bed)}`, size: 'sm',
      body: `<div class="flex items-center gap-3 mb-3">${avatar(st, 44)}<div><div class="font-bold">${esc(pn(st))}</div><div class="text-xs text-slate-500">${esc(DB.className(st.classId))} · রোল ${bnNum(st.roll)} · ${esc(st.id)}</div></div></div>
        <dl class="text-sm grid grid-cols-2 gap-y-1"><dt class="text-slate-500">যেদিন থেকে</dt><dd>${U.fmtDate(a.from)}</dd><dt class="text-slate-500">খাবার পরিকল্পনা</dt><dd>${esc(m?.name || '—')}</dd><dt class="text-slate-500">মাসিক</dt><dd>${U.money(this.monthlyHostel(a))}</dd><dt class="text-slate-500">অভিভাবক</dt><dd>${esc(pn(g) || '—')} ${g ? `· ${esc(g.phone)}` : ''}</dd><dt class="text-slate-500">স্বাস্থ্যগত তথ্য</dt><dd>${esc(st.medical || '—')}</dd></dl>`,
      footer: this.ed() ? `<button class="btn btn-ghost" onclick="Logistics.changeMeal('${a.id}')">${icon('utensils')} খাবার পরিকল্পনা পরিবর্তন করুন</button><button class="btn btn-danger" onclick="Logistics.vacate('${a.id}')">${icon('log-out')} শয্যা খালি করুন</button>` : '',
    });
  },
  /** Idempotent monthly hostel billing (room rent + meal plan). Returns {created, skipped, amount}. */
  billHostel(month, campus = 'ALL') {
    const [first, last] = this.monthBounds(month); let created = 0, skipped = 0, amount = 0;
    this.H().allocations.filter(a => a.from <= last && (!a.to || a.to >= first) && (a.active !== false || a.to)).forEach(a => {
      const st = DB.student(a.studentId), r = this.room(a.roomId), m = this.mealPlan(a.mealPlanId), b = r && this.building(r.buildingId);
      if (!st || st.status !== 'active' || !r || (campus !== 'ALL' && b?.campusId !== campus)) return;
      if (this.hasInvoice(st.id, 'hostel', month)) { skipped++; return; }
      const inv = DB.bill(st.id, { item: `ছাত্রাবাস ফি — ${U.monthName(month)} (কক্ষ ${r.no}, শয্যা ${bnNum(a.bed)}${m ? ` · ${m.name}` : ''})`, amount: (r.rent || 0) + (m?.fee || 0), due: `${month}-10`, kind: 'hostel', incomeAcct: '4500', month, ref: a.id, by: App.session?.userId });
      if (inv) { created++; amount += inv.amount; }
    });
    if (created) this.commit('HOSTEL_BILLING', 'invoices', `${created} hostel invoice(s) for ${month} (${campus}) — ${U.money(amount)}`);
    return { created, skipped, amount };
  },

  renderHostel() {
    const cp = DB.campusId(), H = this.H(), ed = this.ed(), blds = H.buildings.filter(b => b.campusId === cp), res = this.residents(cp);
    const occ = blds.map(b => ({ b, ...this.occupancy(b.id) })), total = U.sum(occ, o => o.total), used = U.sum(occ, o => o.occ);
    const mk = U.monthKey(new Date()), billed = res.filter(a => this.hasInvoice(a.studentId, 'hostel', mk)).length;
    const header = pageHeader('ছাত্রাবাস ও আবাসন', `${esc(DB.campus().name)} · কক্ষ, শয্যা, খাবার পরিকল্পনা ও মাসিক ছাত্রাবাস বিল।`,
      ed ? `<button class="btn btn-ghost" onclick="Logistics.editBuilding()">${icon('building-2')} ভবন যোগ করুন</button>${blds.length ? `<button class="btn btn-ghost" onclick="Logistics.editRoom()">${icon('plus')} কক্ষ যোগ করুন</button><button class="btn btn-ghost" onclick="Logistics.billModal('hostel')">${icon('receipt')} বিল তৈরি করুন</button><button class="btn btn-primary" onclick="Logistics.allocateBed()">${icon('bed-double')} শয্যা বরাদ্দ করুন</button>` : ''}` : '');
    if (!blds.length) return header + `<div class="card">${emptyState(multiCampus() ? `${esc(DB.campus().name)}-এ কোনো ছাত্রাবাস নেই। ক্যাম্পাস পরিবর্তন করুন অথবা একটি ভবন যোগ করুন।` : 'কোনো ছাত্রাবাস ভবন নেই। একটি ভবন যোগ করুন।', 'bed-double')}</div>`;
    const bedChip = (r, n) => {
      const a = this.occupant(r.id, n), st = a && DB.student(a.studentId);
      return st ? `<button class="text-left rounded-lg border border-brand-200 bg-brand-50 px-2 py-1.5 hover:border-brand-500" onclick="Logistics.bedInfo('${a.id}')"><div class="text-[10px] font-bold text-brand-700">শয্যা ${bnNum(n)}</div><div class="text-xs font-semibold truncate">${esc(pn(st))}</div></button>`
        : `<button class="text-left rounded-lg border border-dashed border-slate-300 px-2 py-1.5 text-slate-400 ${ed ? 'hover:border-brand-500 hover:text-brand-700' : ''}" ${ed ? `onclick="Logistics.allocateBed('${r.id}',${n})"` : 'disabled'}><div class="text-[10px] font-bold">শয্যা ${bnNum(n)}</div><div class="text-xs">খালি</div></button>`;
    };
    return header
      + `<div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">${kpi('শয্যা', bnNum(total), `${bnNum(blds.length)}টি ভবন · ${bnNum(H.rooms.filter(r => blds.some(b => b.id === r.buildingId)).length)}টি কক্ষ`, 'bed-double', 'blue')}${kpi('বরাদ্দকৃত', bnNum(used), `${bnNum(total ? Math.round(used / total * 100) : 0)}% শয্যা পূর্ণ`, 'users', 'green')}${kpi('খালি শয্যা', bnNum(total - used), 'এখন খালি', 'door-open', 'amber')}${kpi('মাসিক বিল', U.money(U.sum(res, a => this.monthlyHostel(a))), `${U.monthName(mk)}-এর জন্য ${bnNum(billed)}/${bnNum(res.length)} জনের বিল করা হয়েছে`, 'receipt', 'violet')}</div>`
      + `<div class="grid xl:grid-cols-3 gap-5 mb-5"><div class="card p-5 xl:col-span-2"><div class="font-semibold mb-3">ভবনভিত্তিক শয্যা বরাদ্দ</div><div class="space-y-4">${occ.map(o => { const w = this.staff(o.b.wardenId); return `<div><div class="flex flex-wrap justify-between gap-2 text-sm mb-1"><span><b>${esc(o.b.name)}</b> <span class="text-xs text-slate-500">${esc(o.b.note || '')}${w ? ` · তত্ত্বাবধায়ক ${esc(pn(w))} (${esc(w.phone)})` : ''}</span></span><span class="text-xs"><b>${bnNum(o.occ)}</b> বরাদ্দকৃত · <b>${bnNum(o.free)}</b> খালি · মোট ${bnNum(o.total)} ${ed ? `<button class="ml-1 text-brand-700 hover:underline" onclick="Logistics.editBuilding('${o.b.id}')">সম্পাদনা</button>` : ''}</span></div>${progressBar(o.total ? o.occ / o.total * 100 : 0, 'bg-brand-600')}</div>`; }).join('')}</div></div>
        <div class="card"><div class="px-5 py-3 border-b border-slate-100 flex items-center justify-between"><b>খাবার পরিকল্পনা</b>${ed ? `<button class="btn btn-ghost btn-sm" onclick="Logistics.editMealPlan()">${icon('plus')}</button>` : ''}</div><div class="divide-y divide-slate-100">${H.mealPlans.map(m => `<div class="px-5 py-2.5 flex items-center gap-2 text-sm"><div class="flex-1 min-w-0"><div class="font-semibold">${esc(m.name)}</div><div class="text-xs text-slate-500">${esc(m.desc || '')} · ${bnNum(res.filter(a => a.mealPlanId === m.id).length)} জন আবাসিক</div></div><b>${U.money(m.fee)}</b>${ed ? `<button class="btn btn-ghost btn-sm" onclick="Logistics.editMealPlan('${m.id}')">${icon('pencil')}</button>` : ''}</div>`).join('') || emptyState('কোনো খাবার পরিকল্পনা নেই।')}</div></div></div>`
      + blds.map(b => `<div class="card p-5 mb-5"><div class="font-semibold mb-3">${icon('building-2', 'w-4 h-4 inline text-brand-600')} ${esc(b.name)} — কক্ষ ও শয্যা</div><div class="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">${H.rooms.filter(r => r.buildingId === b.id).sort((x, y) => x.no.localeCompare(y.no)).map(r => `<div class="rounded-xl border border-slate-200 p-3"><div class="flex items-center justify-between mb-2"><div><b>${esc(r.no)}</b> <span class="text-xs text-slate-500">${bnNum(r.floor)} তলা · ${U.money(r.rent)}</span></div><div class="flex items-center gap-1">${r.gender ? badge(r.gender === 'Female' ? 'ছাত্রী' : 'ছাত্র', r.gender === 'Female' ? 'pink' : 'blue') : ''}${ed ? `<button class="p-1 rounded hover:bg-slate-100" title="কক্ষ সম্পাদনা" onclick="Logistics.editRoom('${r.id}')">${icon('pencil', 'w-3.5 h-3.5')}</button>` : ''}</div></div><div class="grid grid-cols-2 gap-1.5">${Array.from({ length: r.beds }, (_, i) => bedChip(r, i + 1)).join('')}</div></div>`).join('')}</div></div>`).join('')
      + `<div class="card scroll-x"><div class="px-5 py-3 border-b border-slate-100 font-semibold">আবাসিক (${bnNum(res.length)})</div><table class="table"><thead><tr><th>শিক্ষার্থী</th><th>কক্ষ · শয্যা</th><th>খাবার পরিকল্পনা</th><th>যেদিন থেকে</th><th class="text-right">মাসিক</th><th>${U.monthName(mk)}</th><th></th></tr></thead><tbody>
        ${res.map(a => ({ a, st: DB.student(a.studentId), r: this.room(a.roomId) })).sort((x, y) => x.r.no.localeCompare(y.r.no) || x.a.bed - y.a.bed).map(({ a, st, r }) => `<tr><td><div class="flex items-center gap-2">${avatar(st, 28)}<div><div class="font-semibold text-sm">${esc(pn(st))}</div><div class="text-xs text-slate-400">${esc(DB.className(st.classId))} · রোল ${bnNum(st.roll)}</div></div></div></td><td class="text-sm">${esc(r.no)} · শয্যা ${bnNum(a.bed)}</td><td class="text-xs">${esc(this.mealPlan(a.mealPlanId)?.name || '—')}</td><td class="text-xs">${U.fmtDate(a.from)}</td><td class="text-right text-sm">${U.money(this.monthlyHostel(a))}</td><td>${this.hasInvoice(st.id, 'hostel', mk) ? badge('বিল করা হয়েছে', 'green') : badge('বিল করা হয়নি', 'amber')}</td><td><div class="flex gap-1 justify-end">${ed ? `<button class="btn btn-ghost btn-sm" title="খাবার পরিকল্পনা" onclick="Logistics.changeMeal('${a.id}')">${icon('utensils')}</button><button class="btn btn-ghost btn-sm text-red-600" title="খালি করুন" onclick="Logistics.vacate('${a.id}')">${icon('log-out')}</button>` : ''}</div></td></tr>`).join('')}</tbody></table>${res.length ? '' : emptyState('কোনো আবাসিক নেই।')}</div>`;
  },

  /* ==================== LIBRARY ==================== */
  book(id) { return this.L().books.find(b => b.id === id); },
  bookByCode(code) {
    const c = String(code || '').trim().toLowerCase(), digits = c.replace(/[^0-9x]/g, '');
    return c ? this.L().books.find(b => b.id.toLowerCase() === c || (digits.length >= 10 && String(b.isbn || '').replace(/[^0-9x]/gi, '').toLowerCase() === digits)) || null : null;
  },
  activeLoans(filterFn) { return this.L().loans.filter(l => !l.returned && (!filterFn || filterFn(l))); },
  loansOf(studentId) { return this.activeLoans(l => l.studentId === studentId); },
  available(b) { return Math.max(0, (+b.copies || 0) - this.activeLoans(l => l.bookId === b.id).length); },
  daysLate(l, asOf = U.today()) { return Math.max(0, this.days(l.returned || asOf, l.due)); },
  fineFor(l) { return l.returned ? (l.fine || 0) : this.daysLate(l) * this.FINE_PER_DAY; },
  overdue(campus = DB.campusId()) { const t = U.today(); return this.activeLoans(l => l.due < t && (campus === 'ALL' || this.book(l.bookId)?.campusId === campus)); },
  categories() { return [...new Set(this.L().books.map(b => b.category))].sort(); },
  filteredBooks() {
    const cp = DB.campusId(), q = (App.ui.libQ || '').toLowerCase(), cat = App.ui.libCat || '', av = App.ui.libAv || '';
    return this.L().books.filter(b => b.campusId === cp && (!cat || b.category === cat) && (!q || this.hay(b).includes(q)) && (!av || (av === 'avail' ? this.available(b) > 0 : this.available(b) === 0)))
      .sort((a, b) => a.id.localeCompare(b.id));
  },
  hay(b) { return `${b.id} ${b.isbn} ${b.title} ${b.author} ${b.category} ${bn(b.category)} ${b.shelf}`.toLowerCase(); },
  _filterRows(q) { App.ui.libQ = q; q = q.toLowerCase(); $$('#lg-cat-body tr[data-s]').forEach(tr => { tr.style.display = tr.dataset.s.includes(q) ? '' : 'none'; }); },
  nextAccession() { const n = Math.max(0, ...this.L().books.map(b => +String(b.id).replace(/\D/g, '') || 0)) + 1; return `LIB${U.pad(n, 4)}`; },
  editBook(id) {
    const b = id ? this.book(id) : { id: this.nextAccession(), isbn: '', title: '', author: '', category: 'Textbook', shelf: '', copies: 1, campusId: DB.campusId(), publisher: '', year: '' };
    const out = id ? (+b.copies - this.available(b)) : 0;
    Modal.open({
      title: id ? `বই সম্পাদনা · ${esc(b.id)}` : 'তালিকায় বই যোগ করুন', size: 'lg',
      body: `<form id="lg-bk" class="grid sm:grid-cols-2 gap-3">
        <div><label class="label">পরিগ্রহণ নম্বর (বারকোড)</label><input class="input font-mono" name="acc" value="${esc(b.id)}" ${id ? 'readonly' : ''} required></div>
        <div><label class="label">আইএসবিএন</label><input class="input font-mono" name="isbn" value="${esc(b.isbn || '')}" placeholder="978-984-…"></div>
        <div class="sm:col-span-2"><label class="label">শিরোনাম</label><input class="input" name="title" required value="${esc(b.title)}"></div>
        <div><label class="label">লেখক</label><input class="input" name="author" value="${esc(b.author || '')}"></div>
        <div><label class="label">প্রকাশক</label><input class="input" name="publisher" value="${esc(b.publisher || '')}"></div>
        <div><label class="label">শ্রেণিবিভাগ</label><input class="input" name="category" list="lg-cats" required value="${esc(b.category)}"><datalist id="lg-cats">${this.categories().map(c => `<option value="${esc(c)}">${esc(bn(c))}</option>`).join('')}</datalist></div>
        <div><label class="label">তাক / র‍্যাক</label><input class="input" name="shelf" value="${esc(b.shelf || '')}" placeholder="B-2"></div>
        <div><label class="label">কপি${out ? ` (${bnNum(out)}টি ধারে দেওয়া)` : ''}</label><input type="number" min="${Math.max(1, out)}" max="200" class="input" name="copies" value="${b.copies}" required></div>
        <div><label class="label">ক্যাম্পাস গ্রন্থাগার</label><select class="select" name="campusId">${campusOptions(b.campusId)}</select></div>
        <div class="sm:col-span-2"><button class="btn btn-primary w-full">${icon('save')} বই সংরক্ষণ করুন</button></div></form>`,
    });
    this._on('lg-bk', f => {
      if (+f.copies < out) return toast(`${bnNum(out)}টি কপি ধারে দেওয়া আছে।`, 'error');
      const acc = f.acc.toUpperCase().replace(/\s+/g, '');
      if (!id && this.book(acc)) return toast('এই পরিগ্রহণ নম্বরটি ইতোমধ্যে বিদ্যমান।', 'error');
      const rec = { isbn: f.isbn, title: f.title, author: f.author, publisher: f.publisher, category: f.category, shelf: f.shelf, copies: U.clamp(+f.copies || 1, 1, 200), campusId: f.campusId };
      if (id) Object.assign(b, rec); else this.L().books.push({ id: acc, ...rec, addedOn: U.today() });
      this.commit(id ? 'BOOK_UPDATE' : 'BOOK_ADD', 'library_books', `${id || acc}: ${rec.title} × ${rec.copies}`);
      Modal.close(); App.refresh(); toast('বইয়ের তথ্য সংরক্ষিত হয়েছে।', 'success');
    });
  },
  /** Printable barcode labels (3 × 8 per A4), one label per copy. */
  printLabels(ids) {
    const books = ids ? ids.map(i => this.book(i)).filter(Boolean) : this.filteredBooks();
    const labels = books.flatMap(b => Array.from({ length: Math.max(1, +b.copies || 1) }, (_, k) => ({ b, k: k + 1 })));
    if (!labels.length) return toast('লেবেল তৈরির জন্য কোনো বই নেই।', 'warn');
    const sheets = [];
    for (let i = 0; i < labels.length; i += 24) {
      sheets.push(Print.sheet({ paper: 'A4' }) + `<div style="padding:12mm 7mm;display:grid;grid-template-columns:repeat(3,64mm);grid-auto-rows:33.9mm;column-gap:2.5mm">${labels.slice(i, i + 24).map(({ b, k }) => `<div style="border:.2mm dashed #cbd5e1;border-radius:1.5mm;padding:2mm 3mm;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between">
        <div style="display:flex;justify-content:space-between;font-size:6.5pt;color:#475569"><b style="color:var(--brand)">${esc(DB.s.school.nameBn || DB.s.school.shortName)} গ্রন্থাগার</b><span>তাক ${esc(b.shelf || '—')} · কপি ${bnNum(k)}/${bnNum(b.copies)}</span></div>
        <div style="font-size:7.5pt;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(b.title)}</div>
        <div style="display:flex;justify-content:center">${barcode(b.id, { height: 30, width: 1.2, fontSize: 9 })}</div></div>`).join('')}</div></div>`);
    }
    Print.preview(`বইয়ের লেবেল (${bnNum(labels.length)})`, sheets, { paper: 'A4', re: ['Logistics.printLabels', books.map(b => b.id)] });
  },
  /** Issue a book. Returns the loan or null (errors are toasted). */
  checkout(code, studentQuery, due) {
    const b = this.bookByCode(code); if (!b) { toast(`"${code}" বারকোডের কোনো বই নেই।`, 'error'); return null; }
    const st = typeof studentQuery === 'object' ? studentQuery : this.findStudent(studentQuery);
    if (!st) { toast('শিক্ষার্থী পাওয়া যায়নি — পরিচয়পত্র স্ক্যান করুন অথবা আইডি / নিবন্ধন নম্বর / শ্রেণি-রোল লিখুন।', 'error'); return null; }
    if (this.available(b) <= 0) { toast(`"${b.title}"-এর ${bnNum(b.copies)}টি কপির সবই ধারে দেওয়া আছে।`, 'error'); return null; }
    const mine = this.loansOf(st.id);
    if (mine.length >= this.MAX_LOANS) { toast(`${pn(st)}-এর কাছে ইতোমধ্যে ${bnNum(mine.length)}টি বই আছে — সর্বোচ্চ সীমা ${bnNum(this.MAX_LOANS)}টি।`, 'error'); return null; }
    if (mine.some(l => l.bookId === b.id)) { toast(`${pn(st)}-এর কাছে ইতোমধ্যে এই বইয়ের একটি কপি আছে।`, 'error'); return null; }
    const today = U.today(), l = { id: DB.id('LN'), bookId: b.id, studentId: st.id, out: today, due: due && due >= today ? due : U.iso(U.addDays(today, this.LOAN_DAYS)), returned: null, fine: 0, by: App.session?.userId || null };
    this.L().loans.push(l);
    this.commit('LIBRARY_CHECKOUT', 'library_loans', `${b.id} "${b.title}" → ${st.name} (${st.id}), due ${l.due}`);
    toast(`"${b.title}" বইটি ${pn(st)}-কে দেওয়া হয়েছে — ফেরতের শেষ তারিখ ${U.fmtDate(l.due)}।`, 'success');
    return l;
  },
  /** Return a loan; bills ৳5/day late fine. Returns {loan, fine, invoice}. */
  checkin(loanId) {
    const l = this.L().loans.find(x => x.id === loanId); if (!l || l.returned) { toast('ধারের তথ্য পাওয়া যায়নি অথবা বইটি ইতোমধ্যে ফেরত দেওয়া হয়েছে।', 'error'); return null; }
    const b = this.book(l.bookId), st = DB.student(l.studentId), today = U.today();
    const late = Math.max(0, this.days(today, l.due)), fine = late * this.FINE_PER_DAY;
    l.returned = today; l.fine = fine; l.returnedBy = App.session?.userId || null;
    let inv = null;
    if (fine > 0) { inv = DB.bill(l.studentId, { item: `গ্রন্থাগারের বিলম্ব জরিমানা — ${b.title}`, amount: fine, kind: 'fine', incomeAcct: '4700', ref: l.id, by: App.session?.userId }); l.fineInvoiceId = inv?.id || null; }
    this.commit('LIBRARY_CHECKIN', 'library_loans', `${b.id} "${b.title}" returned by ${st?.name} (${l.studentId})${fine ? ` — ${late} day(s) late, fine ${U.money(fine)} (${inv?.id})` : ''}`);
    toast(fine ? `${bnNum(late)} দিন বিলম্বে ফেরত — ${pn(st)}-এর নামে ${U.money(fine)} জরিমানার বিল করা হয়েছে।` : 'যথাসময়ে ফেরত দেওয়া হয়েছে। ধন্যবাদ!', fine ? 'warn' : 'success');
    return { loan: l, fine, invoice: inv };
  },
  _deskOut(form) { const f = formData(form); if (this.checkout(f.code, f.student, f.due)) { App.refresh(); setTimeout(() => $('#lg-code')?.focus(), 30); } },
  _deskIn(form) {
    const f = formData(form), b = this.bookByCode(f.code);
    if (!b) return toast(`"${f.code}" বারকোডের কোনো বই নেই।`, 'error');
    const ls = this.activeLoans(l => l.bookId === b.id);
    if (!ls.length) return toast(`"${b.title}"-এর কোনো কপি ধারে দেওয়া নেই।`, 'warn');
    if (ls.length === 1) { this.checkin(ls[0].id); App.refresh(); setTimeout(() => $('#lg-in')?.focus(), 30); return; }
    Modal.open({ title: `"${esc(b.title)}"-এর কোন কপি?`, size: 'sm', body: `<div class="space-y-2">${ls.map(l => { const st = DB.student(l.studentId); return `<button class="w-full card p-3 text-left hover:border-brand-400" onclick="Logistics.checkin('${l.id}');Modal.close();App.refresh()"><b>${esc(pn(st) || l.studentId)}</b><div class="text-xs text-slate-500">ফেরতের শেষ তারিখ ${U.fmtDate(l.due)} · এ পর্যন্ত জরিমানা ${U.money(this.fineFor(l))}</div></button>`; }).join('')}</div>` });
  },
  /** SMS guardians of students with overdue books (once per loan per day). Returns count. */
  remindOverdue(campus = DB.campusId()) {
    const today = U.today(); let n = 0;
    this.overdue(campus).forEach(l => {
      if (l.remindedOn === today) return;
      const st = DB.student(l.studentId), b = this.book(l.bookId); if (!st || !b) return;
      DB.guardiansOf(st.id).forEach(g => DB.sms(g.phone, `${DB.s.school.nameBn || DB.s.school.shortName} গ্রন্থাগার: ${pn(st)}-এর নেওয়া "${b.title}" বইটি ফেরতের শেষ তারিখ ছিল ${U.fmtDate(l.due)} (${bnNum(this.daysLate(l))} দিন মেয়াদোত্তীর্ণ)। এ পর্যন্ত বিলম্ব জরিমানা ${U.money(this.fineFor(l))} (প্রতিদিন ৳${bnNum(this.FINE_PER_DAY)})। অনুগ্রহ করে বইটি ফেরত দিন।`));
      l.remindedOn = today; n++;
    });
    if (n) this.commit('LIBRARY_REMINDERS', 'library_loans', `${n} overdue reminder(s) sent`);
    toast(n ? `অভিভাবকদের কাছে ${bnNum(n)}টি মেয়াদোত্তীর্ণ অনুস্মারক পাঠানো হয়েছে।` : 'পাঠানোর মতো কোনো অনুস্মারক নেই (প্রতিটি মেয়াদোত্তীর্ণ ধারের জন্য দিনে সর্বোচ্চ একবার অনুস্মারক পাঠানো হয়)।', n ? 'success' : 'ok');
    App.refresh(); return n;
  },
  loanRow(l, ed) {
    const b = this.book(l.bookId), st = DB.student(l.studentId), late = this.daysLate(l), od = !l.returned && late > 0;
    return `<tr class="${od ? 'bg-red-50/60' : ''}"><td><div class="font-semibold text-sm">${esc(b?.title || l.bookId)}</div><div class="text-xs text-slate-400 font-mono">${esc(l.bookId)}</div></td>
      <td><div class="text-sm">${esc(pn(st) || l.studentId)}</div><div class="text-xs text-slate-400">${st ? `${esc(DB.className(st.classId))} · রোল ${bnNum(st.roll)}` : ''}</div></td>
      <td class="text-xs whitespace-nowrap">${U.fmtDate(l.out)}</td><td class="text-xs whitespace-nowrap ${od ? 'text-red-600 font-semibold' : ''}">${U.fmtDate(l.due)}</td>
      <td>${l.returned ? badge(`ফেরত ${U.fmtDate(l.returned)}`, 'slate') : od ? badge(`${bnNum(late)} দিন মেয়াদোত্তীর্ণ`, 'red') : badge('ধারে দেওয়া', 'blue')}${l.remindedOn ? `<div class="text-[10px] text-slate-400">অনুস্মারক ${U.fmtDate(l.remindedOn)}</div>` : ''}</td>
      <td class="text-right text-sm ${this.fineFor(l) ? 'text-red-600 font-semibold' : 'text-slate-400'}">${U.money(this.fineFor(l))}${!l.returned && this.fineFor(l) ? '<div class="text-[10px] font-normal">বাড়ছে</div>' : ''}</td>
      <td class="text-right">${!l.returned && ed ? `<button class="btn btn-ghost btn-sm" onclick="Logistics.checkin('${l.id}');App.refresh()">${icon('undo-2')} ফেরত গ্রহণ</button>` : ''}</td></tr>`;
  },
  renderLibrary() {
    const cp = DB.campusId(), ed = this.ed(), tab = App.ui.lgL || 'catalog', books = this.L().books.filter(b => b.campusId === cp);
    const loans = this.L().loans.filter(l => this.book(l.bookId)?.campusId === cp), active = loans.filter(l => !l.returned), od = this.overdue(cp);
    const copies = U.sum(books, b => b.copies), q = App.ui.libQ || '';
    let body = '';
    if (tab === 'catalog') {
      const list = this.L().books.filter(b => b.campusId === cp && (!App.ui.libCat || b.category === App.ui.libCat) && (!App.ui.libAv || (App.ui.libAv === 'avail' ? this.available(b) > 0 : this.available(b) === 0))).sort((a, b) => a.id.localeCompare(b.id));
      body = `<div class="card p-3 mb-3 flex flex-wrap gap-2 items-center"><div class="relative flex-1 min-w-[200px]"><input class="input" placeholder="শিরোনাম, লেখক, আইএসবিএন, পরিগ্রহণ নম্বর, তাক অনুসন্ধান করুন…" value="${esc(q)}" oninput="Logistics._filterRows(this.value)"></div>
          <select class="select !w-auto" onchange="App.ui.libCat=this.value;App.refresh()"><option value="">সকল শ্রেণিবিভাগ</option>${this.categories().map(c => `<option value="${esc(c)}" ${c === App.ui.libCat ? 'selected' : ''}>${esc(bn(c))}</option>`).join('')}</select>
          <select class="select !w-auto" onchange="App.ui.libAv=this.value;App.refresh()">${[['', 'সকল প্রাপ্যতা'], ['avail', 'প্রাপ্য'], ['out', 'সব কপি ধারে']].map(([v, l]) => `<option value="${v}" ${v === (App.ui.libAv || '') ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <button class="btn btn-ghost" onclick="Logistics.printLabels()">${icon('barcode')} প্রদর্শিত বইয়ের লেবেল</button></div>
        <div class="card scroll-x"><table class="table"><thead><tr><th>পরিগ্রহণ নম্বর</th><th>শিরোনাম</th><th>শ্রেণিবিভাগ</th><th>তাক</th><th>প্রাপ্য</th><th></th></tr></thead><tbody id="lg-cat-body">
          ${list.map(b => { const av = this.available(b); return `<tr data-s="${esc(this.hay(b))}" style="${q && !this.hay(b).includes(q.toLowerCase()) ? 'display:none' : ''}"><td class="font-mono text-xs whitespace-nowrap">${esc(b.id)}<div class="text-slate-400">${esc(b.isbn || '')}</div></td><td><div class="font-semibold text-sm">${esc(b.title)}</div><div class="text-xs text-slate-500">${esc(b.author || '')}${b.publisher ? ` · ${esc(b.publisher)}` : ''}</div></td><td>${badge(bn(b.category), 'violet')}</td><td class="text-sm font-mono">${esc(b.shelf || '—')}</td><td class="text-sm"><b class="${av ? 'text-emerald-700' : 'text-red-600'}">${bnNum(av)}</b> / ${bnNum(b.copies)}</td>
            <td><div class="flex gap-1 justify-end"><button class="btn btn-ghost btn-sm" title="লেবেল মুদ্রণ" onclick="Logistics.printLabels(['${b.id}'])">${icon('barcode')}</button>${ed && av ? `<button class="btn btn-ghost btn-sm" title="ইস্যু করুন" onclick="App.ui.lgL='desk';App.ui.lgCode='${b.id}';App.refresh()">${icon('log-out')}</button>` : ''}${ed ? `<button class="btn btn-ghost btn-sm" title="সম্পাদনা" onclick="Logistics.editBook('${b.id}')">${icon('pencil')}</button>` : ''}</div></td></tr>`; }).join('')}</tbody></table>${list.length ? '' : emptyState('কোনো মিল পাওয়া যায়নি।', 'library')}</div>`;
    } else if (tab === 'desk') {
      const recent = [...loans].sort((a, b) => (b.returned || b.out).localeCompare(a.returned || a.out) || b.id.localeCompare(a.id)).slice(0, 8);
      const code = App.ui.lgCode || ''; App.ui.lgCode = '';
      body = ed ? `<div class="grid lg:grid-cols-2 gap-5 mb-5">
          <form class="card p-5 space-y-3" onsubmit="event.preventDefault();Logistics._deskOut(this)"><div class="font-semibold flex items-center gap-2">${icon('log-out', 'w-4 h-4 text-brand-600')} বই ইস্যু</div>
            <div><label class="label">বইয়ের বারকোড (পরিগ্রহণ নম্বর) অথবা আইএসবিএন</label><input id="lg-code" class="input font-mono" name="code" required list="lg-bkl" value="${esc(code)}" placeholder="বারকোড স্ক্যান করুন…" autocomplete="off"><datalist id="lg-bkl">${books.filter(b => this.available(b) > 0).map(b => `<option value="${b.id}">${esc(b.title)}</option>`).join('')}</datalist></div>
            ${this.studentInput('student', '', cp, 'শিক্ষার্থী')}
            <div><label class="label">ফেরতের শেষ তারিখ (স্বাভাবিক মেয়াদ ${bnNum(this.LOAN_DAYS)} দিন)</label><input type="date" class="input" name="due" value="${U.iso(U.addDays(new Date(), this.LOAN_DAYS))}" min="${U.today()}"></div>
            <button class="btn btn-primary w-full">${icon('scan-barcode')} বই ইস্যু করুন</button><p class="text-xs text-slate-500">প্রত্যেক শিক্ষার্থী সর্বোচ্চ ${bnNum(this.MAX_LOANS)}টি বই নিতে পারবে। ফেরতের শেষ তারিখের পর বিলম্ব জরিমানা প্রতিদিন ৳${bnNum(this.FINE_PER_DAY)}।</p></form>
          <form class="card p-5 space-y-3" onsubmit="event.preventDefault();Logistics._deskIn(this)"><div class="font-semibold flex items-center gap-2">${icon('undo-2', 'w-4 h-4 text-brand-600')} ফেরত গ্রহণ</div>
            <div><label class="label">বইয়ের বারকোড (পরিগ্রহণ নম্বর) অথবা আইএসবিএন</label><input id="lg-in" class="input font-mono" name="code" required placeholder="ফেরত দেওয়া বই স্ক্যান করুন…" autocomplete="off"></div>
            <button class="btn btn-success w-full">${icon('undo-2')} বই ফেরত নিন</button>
            <p class="text-xs text-slate-500">বিলম্বে ফেরতের ক্ষেত্রে স্বয়ংক্রিয়ভাবে "গ্রন্থাগারের বিলম্ব জরিমানা" বিল তৈরি হয় (আয় ৪৭০০ জরিমানা)।</p>
            <div class="rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><b>${bnNum(active.length)}</b> ধারে দেওয়া · <b class="text-red-600">${bnNum(od.length)}</b> মেয়াদোত্তীর্ণ · জমে ওঠা জরিমানা <b>${U.money(U.sum(od, l => this.fineFor(l)))}</b></div></form></div>` : '';
      body += `<div class="card scroll-x"><div class="px-5 py-3 border-b border-slate-100 font-semibold">সাম্প্রতিক লেনদেন</div><table class="table"><thead><tr><th>বই</th><th>শিক্ষার্থী</th><th>ইস্যুর তারিখ</th><th>ফেরতের শেষ তারিখ</th><th>অবস্থা</th><th class="text-right">জরিমানা</th><th></th></tr></thead><tbody>${recent.map(l => this.loanRow(l, ed)).join('')}</tbody></table>${recent.length ? '' : emptyState('এখনো কোনো বই আদান-প্রদান হয়নি।')}</div>`;
    } else {
      const f = App.ui.lgLF || 'active', t = U.today();
      const list = loans.filter(l => f === 'all' || (f === 'active' ? !l.returned : f === 'overdue' ? !l.returned && l.due < t : !!l.returned)).sort((a, b) => a.due.localeCompare(b.due));
      body = `<div class="flex flex-wrap gap-1 mb-3">${[['active', 'ধারে দেওয়া'], ['overdue', 'মেয়াদোত্তীর্ণ'], ['returned', 'ফেরত দেওয়া'], ['all', 'সকল']].map(([v, l]) => `<button class="btn btn-sm ${v === f ? 'btn-primary' : 'btn-ghost'}" onclick="App.ui.lgLF='${v}';App.refresh()">${l}</button>`).join('')}</div>
        <div class="card scroll-x"><table class="table"><thead><tr><th>বই</th><th>শিক্ষার্থী</th><th>ইস্যুর তারিখ</th><th>ফেরতের শেষ তারিখ</th><th>অবস্থা</th><th class="text-right">জরিমানা</th><th></th></tr></thead><tbody>${list.map(l => this.loanRow(l, ed)).join('')}</tbody></table>${list.length ? '' : emptyState('এখানে কিছু নেই।', 'book-open')}</div>`;
    }
    return pageHeader('গ্রন্থাগার', `${esc(DB.campus().name)} · বারকোডভিত্তিক বই তালিকা, আদান-প্রদান ডেস্ক, বিলম্ব জরিমানা (প্রতিদিন ৳${bnNum(this.FINE_PER_DAY)}) ও মেয়াদোত্তীর্ণ অনুস্মারক।`,
      `${ed ? `<button class="btn btn-ghost" onclick="Logistics.remindOverdue()">${icon('bell-ring')} মেয়াদোত্তীর্ণ অনুস্মারক${od.length ? ` (${bnNum(od.length)})` : ''}</button><button class="btn btn-primary" onclick="Logistics.editBook()">${icon('book-plus')} বই যোগ করুন</button>` : ''}`)
      + `<div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">${kpi('শিরোনাম', bnNum(books.length), `${bnNum(this.categories().filter(c => books.some(b => b.category === c)).length)}টি শ্রেণিবিভাগ`, 'library', 'blue')}${kpi('কপি', bnNum(copies), `${bnNum(copies - active.length)}টি তাকে আছে`, 'book-open', 'green')}${kpi('ধারে দেওয়া', bnNum(active.length), `${bnNum(new Set(active.map(l => l.studentId)).size)} জন গ্রহীতা`, 'arrow-left-right', 'violet')}${kpi('মেয়াদোত্তীর্ণ', bnNum(od.length), `${U.money(U.sum(od, l => this.fineFor(l)))} জরিমানা জমেছে`, 'alarm-clock', od.length ? 'red' : 'green')}</div>`
      + tabs('lgL', [['catalog', 'বই তালিকা', 'library'], ['desk', 'আদান-প্রদান ডেস্ক', 'scan-barcode'], ['loans', `ধার${od.length ? ` · ${bnNum(od.length)}টি মেয়াদোত্তীর্ণ` : ''}`, 'list']], tab) + body;
  },

  /* ==================== STUDENT / GUARDIAN VIEW ==================== */
  mine(st) {
    if (!st) return emptyState('এই অ্যাকাউন্টের সঙ্গে কোনো শিক্ষার্থীর তথ্য যুক্ত নেই।', 'user-x');
    const ff = DB.s.featureFlags, cards = [];
    if (ff.transport !== false) {
      const a = this.transportOf(st.id), r = a && this.route(a.routeId), sp = r && this.stop(r, a.stopId), v = r && this.vehicleOf(r.id), d = v && this.staff(v.driverId), h = v && this.staff(v.helperId);
      cards.push(`<div class="card p-5"><div class="font-semibold mb-3 flex items-center gap-2">${icon('bus', 'w-4 h-4 text-brand-600')} বিদ্যালয়ের পরিবহন</div>${r ? `
        <div class="flex items-center gap-4 mb-3"><div class="rounded-2xl bg-brand-50 text-brand-700 px-4 py-3 text-center"><div class="text-[10px] font-bold uppercase">পিকআপ</div><div class="text-2xl font-extrabold font-mono">${esc(sp?.time ? U.bn(sp.time) : '—')}</div></div><div class="min-w-0"><div class="font-bold">${esc(sp?.name || 'স্টপেজ নির্ধারিত নয়')}</div><div class="text-sm text-slate-500">${esc(r.name)} রুট · ${esc(r.zone)}</div></div></div>
        <dl class="grid grid-cols-2 gap-y-1.5 text-sm"><dt class="text-slate-500">বাস</dt><dd>${v ? `${esc(v.regNo)} <span class="text-xs text-slate-400">(${esc(bn(v.type))})</span>` : '—'}</dd>
          <dt class="text-slate-500">চালক</dt><dd>${d ? `${esc(pn(d))}<br><a class="text-brand-700 font-semibold" href="tel:${esc(d.phone)}">${icon('phone', 'w-3.5 h-3.5 inline')} ${esc(d.phone)}</a>` : '—'}</dd>
          ${h ? `<dt class="text-slate-500">সহকারী</dt><dd>${esc(pn(h))} · <a class="text-brand-700" href="tel:${esc(h.phone)}">${esc(h.phone)}</a></dd>` : ''}
          <dt class="text-slate-500">মাসিক ফি</dt><dd>${U.money(r.fee)}</dd><dt class="text-slate-500">যেদিন থেকে</dt><dd>${U.fmtDate(a.from)}</dd></dl>
        <details class="mt-3"><summary class="text-xs text-slate-500 cursor-pointer">এই রুটের সকল স্টপেজ</summary><ol class="mt-2 text-xs space-y-1">${r.stops.map(s => `<li class="${s.id === sp?.id ? 'font-bold text-brand-700' : ''}">${esc(U.bn(s.time))} · ${esc(s.name)}</li>`).join('')}</ol></details>`
        : emptyState('বিদ্যালয়ের পরিবহন ব্যবহার করা হচ্ছে না। নিবন্ধনের জন্য বিদ্যালয়ের অফিসে যোগাযোগ করুন।', 'bus')}</div>`);
    }
    if (ff.hostel !== false) {
      const a = this.hostelOf(st.id), r = a && this.room(a.roomId), b = r && this.building(r.buildingId), m = a && this.mealPlan(a.mealPlanId), w = b && this.staff(b.wardenId);
      cards.push(`<div class="card p-5"><div class="font-semibold mb-3 flex items-center gap-2">${icon('bed-double', 'w-4 h-4 text-brand-600')} ছাত্রাবাস</div>${a ? `
        <div class="flex items-center gap-4 mb-3"><div class="rounded-2xl bg-violet-50 text-violet-700 px-4 py-3 text-center"><div class="text-[10px] font-bold uppercase">কক্ষ</div><div class="text-xl font-extrabold">${esc(r.no)}</div></div><div><div class="font-bold">শয্যা ${bnNum(a.bed)}</div><div class="text-sm text-slate-500">${esc(b?.name || '')} · ${bnNum(r.floor)} তলা</div></div></div>
        <dl class="grid grid-cols-2 gap-y-1.5 text-sm"><dt class="text-slate-500">খাবার পরিকল্পনা</dt><dd>${esc(m?.name || '—')}<div class="text-xs text-slate-400">${esc(m?.desc || '')}</div></dd><dt class="text-slate-500">কক্ষ ভাড়া</dt><dd>${U.money(r.rent)}</dd><dt class="text-slate-500">খাবার</dt><dd>${U.money(m?.fee || 0)}</dd><dt class="text-slate-500">মাসিক মোট</dt><dd class="font-bold">${U.money(this.monthlyHostel(a))}</dd>
          ${w ? `<dt class="text-slate-500">তত্ত্বাবধায়ক</dt><dd>${esc(pn(w))}<br><a class="text-brand-700" href="tel:${esc(w.phone)}">${esc(w.phone)}</a></dd>` : ''}<dt class="text-slate-500">যেদিন থেকে</dt><dd>${U.fmtDate(a.from)}</dd></dl>`
        : emptyState('ছাত্রাবাসের আবাসিক নয়।', 'bed-double')}</div>`);
    }
    let lib = '';
    if (ff.library !== false) {
      const loans = this.L().loans.filter(l => l.studentId === st.id), act = loans.filter(l => !l.returned).sort((a, b) => a.due.localeCompare(b.due));
      const hist = loans.filter(l => l.returned).sort((a, b) => b.returned.localeCompare(a.returned)).slice(0, 5);
      const fineRe = /^(Library late fine|গ্রন্থাগারের বিলম্ব জরিমানা)( — )?/;
      const fines = DB.invoices(st.id).filter(i => i.kind === 'fine' && fineRe.test(String(i.item)));
      lib = `<div class="card scroll-x mt-5"><div class="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2"><b class="flex items-center gap-2">${icon('library', 'w-4 h-4 text-brand-600')} গ্রন্থাগার থেকে নেওয়া বই</b><span class="text-xs text-slate-500">${bnNum(act.length)}/${bnNum(this.MAX_LOANS)}টি নেওয়া · ${bnNum(this.LOAN_DAYS)} দিনের মেয়াদ · বিলম্ব জরিমানা প্রতিদিন ৳${bnNum(this.FINE_PER_DAY)}</span></div>
        <table class="table"><thead><tr><th>বই</th><th>নেওয়ার তারিখ</th><th>ফেরতের শেষ তারিখ</th><th>অবস্থা</th><th class="text-right">জরিমানা</th></tr></thead><tbody>
        ${act.map(l => { const b = this.book(l.bookId), late = this.daysLate(l), left = this.days(l.due, U.today()); return `<tr class="${late ? 'bg-red-50/60' : ''}"><td><div class="font-semibold text-sm">${esc(b?.title || l.bookId)}</div><div class="text-xs text-slate-400">${esc(b?.author || '')} · ${esc(l.bookId)}</div></td><td class="text-xs">${U.fmtDate(l.out)}</td><td class="text-xs ${late ? 'text-red-600 font-semibold' : ''}">${U.fmtDate(l.due)}</td><td>${late ? badge(`${bnNum(late)} দিন মেয়াদোত্তীর্ণ`, 'red') : left <= 2 ? badge(left === 0 ? 'আজই ফেরতের শেষ দিন' : `${bnNum(left)} দিনের মধ্যে ফেরত দিতে হবে`, 'amber') : badge('ধারে দেওয়া', 'blue')}</td><td class="text-right text-sm ${late ? 'text-red-600 font-semibold' : 'text-slate-400'}">${U.money(this.fineFor(l))}</td></tr>`; }).join('')}
        ${hist.map(l => { const b = this.book(l.bookId); return `<tr class="text-slate-500"><td class="text-sm">${esc(b?.title || l.bookId)}</td><td class="text-xs">${U.fmtDate(l.out)}</td><td class="text-xs">${U.fmtDate(l.due)}</td><td>${badge(`ফেরত ${U.fmtDate(l.returned)}`, 'slate')}</td><td class="text-right text-sm">${U.money(l.fine || 0)}</td></tr>`; }).join('')}</tbody></table>
        ${act.length || hist.length ? '' : emptyState('এখনো কোনো বই নেওয়া হয়নি।', 'book-open')}
        ${fines.length ? `<div class="px-5 py-3 border-t border-slate-100 text-sm"><b>গ্রন্থাগারের জরিমানার বিল:</b> ${fines.map(i => `${esc(String(i.item).replace(fineRe, ''))} ${U.money(i.amount)} ${statusBadge(i.status)}`).join(' · ')}</div>` : ''}</div>`;
    }
    return (cards.length ? `<div class="grid lg:grid-cols-2 gap-5">${cards.join('')}</div>` : '') + lib;
  },
};

/* ==========================================================================
   EMPTY COLLECTIONS (structural — the demo data lives in server/seed, npm run seed:demo)
   ========================================================================== */
DB.addSeeder('transport', () => ({ vehicles: [], routes: [], allocations: [], maintenance: [] }));
DB.addSeeder('hostel', () => ({ buildings: [], rooms: [], mealPlans: [], allocations: [] }));
DB.addSeeder('library', () => ({ books: [], loans: [] }));
/* ==========================================================================
   PAGES
   ========================================================================== */
const lgTransportPage = { id: 'transport', label: 'পরিবহন ও যানবহর', icon: 'bus', module: 'logistics', flag: 'transport', render() { return Logistics.renderTransport(); } };
const lgHostelPage = { id: 'hostel', label: 'ছাত্রাবাস ও আবাসন', icon: 'bed-double', module: 'logistics', flag: 'hostel', render() { return Logistics.renderHostel(); } };
const lgLibraryPage = {
  id: 'library', label: 'গ্রন্থাগার', icon: 'library', module: 'logistics', flag: 'library',
  render() { return Logistics.renderLibrary(); },
  mount() { if ((App.ui.lgL || 'catalog') === 'desk') $('#lg-code')?.focus(); },
  count() { return Logistics.overdue(DB.campusId()).length || ''; },
};
['admin', 'principal'].forEach(p => [lgTransportPage, lgHostelPage, lgLibraryPage].forEach(pg => App.addPage(p, pg)));

const lgAnyFlag = () => ['transport', 'hostel', 'library'].some(f => DB.s.featureFlags[f] !== false);
App.addPage('student', {
  id: 'logistics', label: 'পরিবহন, ছাত্রাবাস ও গ্রন্থাগার', icon: 'bus', module: 'logistics', when: lgAnyFlag,
  render() { return pageHeader('পরিবহন, ছাত্রাবাস ও গ্রন্থাগার', 'তোমার বাস রুট ও পিকআপের সময়, ছাত্রাবাসের কক্ষ এবং গ্রন্থাগার থেকে নেওয়া বই।') + Logistics.mine(Student.me()); },
});
App.addPage('guardian', {
  id: 'logistics', label: 'পরিবহন, ছাত্রাবাস ও গ্রন্থাগার', icon: 'bus', module: 'logistics', when: lgAnyFlag,
  render() {
    const c = Guardian.child(); if (!c) return pageHeader('পরিবহন, ছাত্রাবাস ও গ্রন্থাগার') + emptyState('এই অ্যাকাউন্টের সঙ্গে কোনো সন্তান যুক্ত নেই।', 'users');
    return pageHeader('পরিবহন, ছাত্রাবাস ও গ্রন্থাগার', 'আপনার সন্তানের বাস রুট ও চালকের যোগাযোগ, ছাত্রাবাসের কক্ষ এবং গ্রন্থাগার থেকে নেওয়া বই।') + Guardian.switcher() + Logistics.mine(c);
  },
});
