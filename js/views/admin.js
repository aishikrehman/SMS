/* ==========================================================================
   D. ADMIN / IT DEPT & DEVELOPER DESK
   ========================================================================== */

const Admin = {
  /* ---------- Seat plan: alternate grades so no neighbours share a paper ---------- */
  buildSeatPlan(classIds, rooms, rows, cols) {
    const queues = classIds.map(id => ({ id, grade: DB.cls(id).grade, q: DB.studentsIn(id).map(s => ({ id: s.id, name: pn(s), roll: s.roll, grade: DB.cls(id).grade })) }));
    const plan = [];
    const remaining = () => U.sum(queues, x => x.q.length);
    rooms.forEach(room => {
      if (!remaining()) return;
      const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const left = c > 0 ? grid[r][c - 1] : null, up = r > 0 ? grid[r - 1][c] : null;
        // Preferred queue follows a checkerboard; fall back to any queue whose grade differs from both neighbours.
        const order = queues.map((q, i) => ({ q, i })).sort((a, b) => ((a.i - (r + c)) % queues.length + queues.length) % queues.length - ((b.i - (r + c)) % queues.length + queues.length) % queues.length);
        const pick = order.find(({ q }) => q.q.length && (!left || left.grade !== q.grade) && (!up || up.grade !== q.grade));
        grid[r][c] = pick ? pick.q.q.shift() : null;
      }
      plan.push({ room, rows, cols, grid, filled: grid.flat().filter(Boolean).length });
    });
    let violations = 0;
    plan.forEach(p => p.grid.forEach((row, r) => row.forEach((cell, c) => { if (!cell) return; if (c > 0 && row[c - 1]?.grade === cell.grade) violations++; if (r > 0 && p.grid[r - 1][c]?.grade === cell.grade) violations++; })));
    return { plan, unseated: remaining(), violations };
  },

  /* ---------- Provisioning ---------- */
  provision(role) {
    const label = bn(role);
    Modal.open({
      title: `${label} অ্যাকাউন্ট সৃজন করুন`, size: 'md',
      body: `<form id="prov-form" class="space-y-3"><div class="card p-3 bg-amber-50 border-amber-200 text-xs text-amber-800">${icon('shield-alert', 'w-4 h-4 inline')} রুট অনুমোদন: এটি একটি বিশেষাধিকারপ্রাপ্ত ${label} অ্যাকাউন্ট তৈরি করবে এবং অডিট লগে স্থায়ীভাবে লিপিবদ্ধ থাকবে।</div>
        <div><label class="label">পূর্ণ নাম</label><input class="input" name="name" required></div>${People.fields()}
        <div class="grid grid-cols-2 gap-3"><div><label class="label">ব্যবহারকারীর নাম</label><input class="input" name="username" pattern="[a-z0-9_.]{3,20}" required></div><div><label class="label">মোবাইল</label><input class="input" name="phone" pattern="01[3-9][0-9]{8}" required></div></div>
        <div><label class="label">ই-মেইল</label><input class="input" type="email" name="email" required></div>
        ${role === 'PRINCIPAL' ? '<label class="flex items-center gap-2 text-sm"><input type="checkbox" name="alsoTeacher"> শিক্ষক ভূমিকাও যুক্ত করুন (পাঠদানকারী অধ্যক্ষ)</label>' : ''}
        <button class="btn btn-primary w-full">${icon('user-plus')} ${label} তৈরি করুন</button></form>`,
    });
    $('#prov-form').addEventListener('submit', e => {
      e.preventDefault(); const f = formData(e.target);
      if (!App.can('provision.root')) return toast('শুধু রুট ব্যবহারকারী এই ভূমিকা প্রদান করতে পারেন।', 'error');
      if (DB.s.users.some(u => u.username === f.username)) return toast('এই ব্যবহারকারীর নাম ইতোমধ্যে বিদ্যমান।', 'error');
      const temp = U.tempPw();
      const u = { id: DB.id('U'), name: f.name, username: f.username, email: f.email, phone: f.phone, pwHash: U.pw(temp), active: true, createdAt: new Date().toISOString(), createdBy: App.session.userId, photo: null };
      DB.s.users.push(u); DB.s.userRoles.push({ userId: u.id, role });
      if (f.alsoTeacher) { DB.s.userRoles.push({ userId: u.id, role: 'TEACHER' }); DB.s.teachers.push({ id: DB.id('T'), userId: u.id, campusId: DB.campusId(), dept: 'প্রশাসন', designation: 'অধ্যক্ষ', salaryGrade: 'G1', baseSalary: DB.s.salaryGrades.G1, isHead: true, subjects: [], joinDate: U.today(), status: 'Confirmed', qualification: '', showContact: true, overtimeHours: {} }); }
      DB.audit('PROVISION_' + role, 'users', `রুট ব্যবহারকারী ${f.username}-কে ${label} হিসেবে সৃজন করেছেন`); DB.save();
      Modal.body(`<div class="text-center space-y-2"><div class="text-emerald-600 font-bold">${icon('check-circle-2', 'w-8 h-8 mx-auto')} ${label} অ্যাকাউন্ট তৈরি হয়েছে</div><p class="text-sm">এককালীন পাসওয়ার্ড — <b>@${esc(f.username)}</b></p><code class="text-lg bg-slate-100 px-3 py-1 rounded">${esc(temp)}</code><p class="text-xs text-slate-500">পৃথক ও নিরাপদ মাধ্যমে পৌঁছে দিন। এটি আর দেখানো হবে না।</p></div>`);
      App.refresh();
    });
  },
  async resetPassword(userId) {
    const u = DB.user(userId);
    if (!App.can('credentials.reset')) return toast('অনুমতি নেই।', 'error');
    if (DB.roles(userId).includes('SUPERADMIN') && !App.has('SUPERADMIN')) return toast('রুট ব্যবহারকারীর লগইন তথ্য শুধু রুট ব্যবহারকারীই পুনঃনির্ধারণ করতে পারেন।', 'error');
    if (!confirm(`@${u.username}-এর পাসওয়ার্ড পুনঃনির্ধারণ করবেন? বর্তমান পাসওয়ার্ডটি তাৎক্ষণিকভাবে অকার্যকর হয়ে যাবে।`)) return;
    let temp;   // the server creates the temporary password and stores only its hash
    try { temp = await DB.setTempPassword(userId); } catch (e) { return toast(e.status === 403 ? 'অনুমতি নেই।' : 'সার্ভারের সঙ্গে যোগাযোগ করা যায়নি — আবার চেষ্টা করুন।', 'error'); }
    DB.audit('CREDENTIAL_RESET', 'users', `${u.username}-এর পাসওয়ার্ড পুনঃনির্ধারণ`); DB.save();
    Modal.open({ title: 'অস্থায়ী পাসওয়ার্ড প্রদান করা হয়েছে', size: 'sm', body: `<div class="text-center space-y-2"><p class="text-sm">@${esc(u.username)}</p><code class="text-lg bg-slate-100 px-3 py-1 rounded">${esc(temp)}</code><p class="text-xs text-slate-500">একবারই দেখানো হবে। নিরাপদে পৌঁছে দিন।</p></div>` });
  },
  toggleRole(userId, role, on) {
    if (!App.can('roles.bind')) return toast('অনুমতি নেই।', 'error');
    if ((role === 'SUPERADMIN' || role === 'PRINCIPAL' || role === 'ADMIN') && !App.has('SUPERADMIN') && !App.has('ADMIN')) { toast(`শুধু রুট ব্যবহারকারী ${bn(role)} ভূমিকা প্রদান বা প্রত্যাহার করতে পারেন।`, 'error'); return App.refresh(); }
    if (userId === App.session.userId && !on && (role === 'SUPERADMIN' || role === 'ADMIN')) { toast('আপনি নিজের প্রশাসনিক ভূমিকা প্রত্যাহার করতে পারবেন না।', 'error'); return App.refresh(); }
    if (on) {
      DB.s.userRoles.push({ userId, role });
      if (role === 'TEACHER' && !DB.teacherByUser(userId)) DB.s.teachers.push({ id: DB.id('T'), userId, campusId: DB.campusId(), dept: 'অনির্ধারিত', designation: 'সহকারী শিক্ষক', salaryGrade: 'G4', baseSalary: DB.s.salaryGrades.G4, isHead: false, subjects: [], joinDate: U.today(), status: 'Probation', qualification: '', showContact: true, overtimeHours: {} });
    } else DB.s.userRoles = DB.s.userRoles.filter(r => !(r.userId === userId && r.role === role));
    DB.audit(on ? 'ROLE_BIND' : 'ROLE_REVOKE', 'user_roles', `${DB.user(userId).username} ${on ? '+' : '−'} ${role}`); DB.save();
    toast(on ? `@${DB.user(userId).username}-কে ${bn(role)} ভূমিকা প্রদান করা হয়েছে` : `@${DB.user(userId).username}-এর ${bn(role)} ভূমিকা প্রত্যাহার করা হয়েছে`, 'success'); App.refresh();
  },
  toggleActive(userId) {
    const u = DB.user(userId);
    if (userId === App.session.userId) return toast('আপনি নিজের অ্যাকাউন্ট নিষ্ক্রিয় করতে পারবেন না।', 'error');
    if (DB.roles(userId).includes('SUPERADMIN')) return toast('কনসোল থেকে রুট ব্যবহারকারী নিষ্ক্রিয় করা যায় না।', 'error');
    u.active = !u.active; DB.audit(u.active ? 'USER_ENABLE' : 'USER_DISABLE', 'users', u.username); DB.save(); App.refresh();
  },

  /* Backup and restore run on the server (ServerBackup in js/sync.js sets Admin.backup / Admin.restore). */
};

App.register('admin', {
  title: 'রুট ব্যবহারকারী ডেস্ক',
  pages: [
    /* ---------------- System overview ---------------- */
    {
      id: 'system', label: 'সিস্টেমের অবস্থা', icon: 'server',
      render() {
        let size = 0; try { size = JSON.stringify(DB.s).length; } catch (e) { }
        const v = DB.verifyAudit(), flags = DB.s.featureFlags;
        return pageHeader('সিস্টেমের অবস্থা ও অবকাঠামো')
          + `<div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">${kpi('অ্যাকাউন্ট', bnNum(DB.s.users.length), `${bnNum(DB.s.users.filter(u => !u.active).length)}টি নিষ্ক্রিয়`, 'users', 'blue')}${kpi('ডেটাবেসের আকার', bnNum((size / 1024).toFixed(0)) + ' কেবি', 'সার্ভারে সংরক্ষিত', 'database', 'violet')}${kpi('অডিট শৃঙ্খল', v.ok ? 'অক্ষত' : 'বিচ্ছিন্ন', `${bnNum(DB.s.audit.length)}টি এন্ট্রি`, v.ok ? 'shield-check' : 'shield-x', v.ok ? 'green' : 'red')}${kpi('প্রেরিত বার্তা', bnNum(DB.s.outbox.length), flags.smsGateway ? 'গেটওয়ে সচল' : 'গেটওয়ে বন্ধ', 'message-square', 'amber')}</div>
          <div class="grid lg:grid-cols-2 gap-5">
            <div class="card"><div class="px-5 py-3 border-b border-slate-100 font-semibold">বৈশিষ্ট্য নিয়ন্ত্রণ</div><div class="divide-y divide-slate-100">${Object.entries(flags).map(([k, on]) => `<label class="px-5 py-3 flex items-center justify-between text-sm cursor-pointer"><span><b>${esc(typeof Settings !== 'undefined' && Settings.flagLabel ? Settings.flagLabel(k) : k)}</b><div class="text-xs text-slate-500">${{ onlineAdmissions: 'অনলাইন ভর্তি ফরম', smsGateway: 'বহির্গামী এসএমএস প্রেরণ', gatewayBkash: 'বিকাশে পরিশোধ', gatewayNagad: 'নগদে পরিশোধ', gatewayCard: 'Visa / Mastercard-এ পরিশোধ', aiPlanner: 'শিক্ষকের পাঠ পরিকল্পনা টেমপ্লেট', publicResults: 'পাবলিক ফলাফল পোর্টাল', maintenanceBanner: 'সমগ্র সাইটে রক্ষণাবেক্ষণ ব্যানার' }[k] || ''}</div></span><input type="checkbox" class="w-5 h-5" ${on ? 'checked' : ''} onchange="DB.s.featureFlags['${k}']=this.checked;DB.audit('FEATURE_FLAG','system','${k}='+this.checked);DB.save();App.render()"></label>`).join('')}</div></div>
            <div class="space-y-5"><div class="card p-5"><div class="font-semibold mb-3">ডেটাবেস ব্যাকআপ</div><button class="btn btn-primary btn-sm" onclick="App.ui.dataTab='backup';App.go('admin','database')">${icon('database-backup')} ব্যাকআপ ও পুনরুদ্ধার</button></div></div></div>
          <div class="card mt-5"><div class="px-5 py-3 border-b border-slate-100 font-semibold">এসএমএস / ই-মেইল / পুশ আউটবক্স</div><div class="scroll-x max-h-80 overflow-y-auto"><table class="table"><thead><tr><th>সময়</th><th>মাধ্যম</th><th>প্রাপক</th><th>বার্তা</th><th>অবস্থা</th></tr></thead><tbody>${DB.s.outbox.slice(0, 60).map(m => `<tr><td class="whitespace-nowrap text-xs">${U.fmtTime(m.ts)}</td><td>${esc(bn(m.kind))}</td><td class="font-mono text-xs">${esc(m.to)}</td><td class="text-xs text-slate-600 max-w-md">${esc(m.message)}</td><td>${m.status.startsWith('Delivered') ? badge('পৌঁছেছে', 'green') : badge('অপেক্ষমাণ', 'amber')}</td></tr>`).join('')}</tbody></table>${DB.s.outbox.length ? '' : emptyState('এখনো কোনো বার্তা নেই।')}</div></div>`;
      },
    },
    /* ---------------- Audit log ---------------- */
    {
      id: 'audit', label: 'অডিট লগ', icon: 'scroll-text',
      render() {
        const ui = App.ui.au || (App.ui.au = { q: '' });
        const q = ui.q.toLowerCase(), v = DB.verifyAudit();
        const list = [...DB.s.audit].reverse().filter(a => !q || [a.action, a.entity, a.detail, a.role, DB.user(a.userId)?.username].join(' ').toLowerCase().includes(q));
        return pageHeader('অডিট লগ', '',`<button class="btn btn-ghost" onclick="downloadFile('audit-${U.today()}.json', JSON.stringify(DB.s.audit,null,1))">${icon('download')} রপ্তানি করুন</button>`)
          + `<div class="card p-4 mb-4 flex flex-wrap gap-3 items-center ${v.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}">${icon(v.ok ? 'shield-check' : 'shield-x', 'w-5 h-5 ' + (v.ok ? 'text-emerald-600' : 'text-red-600'))}<div class="flex-1 text-sm">${v.ok ? `<b>শৃঙ্খল যাচাইকৃত।</b> ${bnNum(v.count)}টি এন্ট্রি, কোনো কারসাজি শনাক্ত হয়নি।` : `<b>কারসাজি শনাক্ত হয়েছে</b> #${bnNum(v.brokenAt)} নং এন্ট্রিতে।`}</div>
            <div class="relative"><span class="absolute left-3 top-2.5 text-slate-400">${icon('search')}</span><input id="au-q" class="input pl-9 !w-64" placeholder="কার্যক্রম, ব্যবহারকারী ফিল্টার করুন…" value="${esc(ui.q)}"></div></div>
          <div class="card scroll-x"><table class="table"><thead><tr><th>#</th><th>সময়মুদ্রা</th><th>ব্যবহারকারী</th><th>ভূমিকা</th><th>কার্যক্রম</th><th>বিবরণ</th><th>আইপি</th><th>হ্যাশ</th></tr></thead><tbody>
          ${list.slice(0, 200).map(a => `<tr><td class="font-mono text-xs">${bnNum(a.seq)}</td><td class="whitespace-nowrap text-xs">${U.fmtTime(a.ts)}</td><td class="text-xs">${esc(DB.user(a.userId)?.username || '—')}</td><td>${badge(bn(a.role), a.role === 'PUBLIC' ? 'slate' : 'blue')}</td><td class="font-semibold text-xs ${/DENIED|FAILED|DECLINE|REVOKE|DISABLE|RESET/.test(a.action) ? 'text-red-600' : ''}">${a.action}</td><td class="text-xs text-slate-600 max-w-sm">${esc(a.detail)}</td><td class="font-mono text-xs">${a.ip}</td><td class="font-mono text-[10px] text-slate-400" title="পূর্ববর্তী ${a.prevHash}">${a.hash.slice(0, 10)}…</td></tr>`).join('')}</tbody></table></div>`;
      },
      mount() { let t; $('#au-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { App.ui.au.q = e.target.value; App.refresh(); const el = $('#au-q'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 250); }); },
    },
    /* ---------------- User provisioning desk ---------------- */
    {
      id: 'users', label: 'ব্যবহারকারী সৃজন', icon: 'user-cog',
      render() {
        const ui = App.ui.us || (App.ui.us = { q: '', role: 'staff' });
        const q = ui.q.toLowerCase();
        const roleKeys = ['ADMIN', 'PRINCIPAL', 'TEACHER', 'GUARDIAN', 'STUDENT', ...(DB.s.customRoles || []).map(r => r.key).filter(k => ROLES[k])];
        const users = DB.s.users.filter(u => {
          const r = DB.roles(u.id);
          if (ui.role === 'staff' && !r.some(x => ['SUPERADMIN', 'ADMIN', 'PRINCIPAL', 'TEACHER'].includes(x))) return false;
          if (ui.role !== 'staff' && ui.role !== 'all' && !r.includes(ui.role)) return false;
          return !q || u.name.toLowerCase().includes(q) || (u.nameBn || '').includes(ui.q) || u.username.includes(q);
        });
        const isRoot = App.has('SUPERADMIN') || App.has('ADMIN');   // the first-run Root User holds ADMIN
        return `<div class="flex flex-wrap gap-2 mb-4">${isRoot ? `<button class="btn btn-primary" onclick="Users.create()">${icon('user-plus')} ব্যবহারকারী তৈরি করুন</button><button class="btn btn-ghost" onclick="Admin.provision('PRINCIPAL')">${icon('crown')} অধ্যক্ষ সৃজন করুন</button><button class="btn btn-ghost" onclick="Admin.provision('ADMIN')">${icon('cpu')} রুট ব্যবহারকারী সৃজন করুন</button>` : `<button class="btn btn-primary" onclick="Users.create()">${icon('user-plus')} ব্যবহারকারী তৈরি করুন</button>`}</div>
          <div class="card p-4 mb-4 flex flex-wrap gap-3"><div class="relative flex-1 min-w-[200px]"><span class="absolute left-3 top-2.5 text-slate-400">${icon('search')}</span><input id="us-q" class="input pl-9" placeholder="নাম বা ব্যবহারকারীর নাম অনুসন্ধান করুন" value="${esc(ui.q)}"></div>
            <select class="select !w-auto" onchange="App.ui.us.role=this.value;App.refresh()">${[['staff', 'কর্মী ও প্রশাসক'], ['all', 'সকল ব্যবহারকারী'], ...roleKeys.map(r => [r, bn(r)])].map(([k, l]) => `<option value="${k}" ${k === ui.role ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="card scroll-x"><table class="table"><thead><tr><th>ব্যবহারকারী</th>${roleKeys.map(r => `<th class="text-center" title="${bn(r)}">${roleIcon(r)}<div class="text-[9px]">${bn(r)}</div></th>`).join('')}<th>তৈরি করেছেন</th><th>অবস্থা</th><th></th></tr></thead><tbody>
          ${users.slice(0, 120).map(u => { const r = DB.roles(u.id); return `<tr class="${u.active ? '' : 'opacity-50'}"><td><div class="flex items-center gap-2.5">${avatar(u, 30)}<div><div class="font-semibold">${typeof UserProfile !== 'undefined' ? `<button class="text-left hover:underline text-brand-700" onclick="UserProfile.open('${u.id}')">${esc(pn(u))}</button>` : esc(pn(u))}</div><div class="text-xs text-slate-400">@${esc(u.username)}</div></div></div></td>
            ${roleKeys.map(k => { const locked = (['SUPERADMIN', 'ADMIN', 'PRINCIPAL'].includes(k) && !isRoot) || k === 'SUPERADMIN' || k === 'STUDENT'; return `<td class="text-center"><input type="checkbox" class="w-4 h-4" ${r.includes(k) ? 'checked' : ''} ${locked ? 'disabled' : ''} onchange="Admin.toggleRole('${u.id}','${k}',this.checked)"></td>`; }).join('')}
            <td class="text-xs text-slate-500">${esc(DB.user(u.createdBy)?.username || 'সিস্টেম')}</td><td>${u.active ? badge('সক্রিয়', 'green') : badge('নিষ্ক্রিয়', 'red')}</td>
            <td><div class="flex gap-1 justify-end"><button class="btn btn-ghost btn-sm" title="পাসওয়ার্ড পুনঃনির্ধারণ করুন" onclick="Admin.resetPassword('${u.id}')">${icon('key-round')}</button><button class="btn btn-ghost btn-sm" title="সক্রিয় / নিষ্ক্রিয় করুন" onclick="Admin.toggleActive('${u.id}')">${icon(u.active ? 'user-x' : 'user-check')}</button><button class="btn btn-ghost btn-sm text-red-600" title="অ্যাকাউন্ট মুছে ফেলুন" onclick="Users.remove('${u.id}')">${icon('trash-2')}</button></div></td></tr>`; }).join('')}</tbody></table>
          ${users.length > 120 ? `<div class="p-3 text-xs text-slate-500">${bnNum(users.length)}টির মধ্যে ১২০টি দেখানো হচ্ছে।</div>` : ''}</div>`;
      },
      mount() { let t; $('#us-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { App.ui.us.q = e.target.value; App.refresh(); const el = $('#us-q'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 250); }); },
    },
  ],
});

