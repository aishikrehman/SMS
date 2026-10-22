/* ==========================================================================
   COMMUNICATION — notice & circular manager, messaging gateways, message log
   CAREERS — public job board with online applications + recruitment pipeline
   ========================================================================== */

const NOTICE_CATEGORIES = ['Academic', 'Exam', 'Holiday', 'Admission', 'Fees', 'General'];
const NOTICE_CHANNELS = ['Website', 'SMS', 'Email', 'Push'];
const JOB_STATUSES = ['New', 'Shortlisted', 'Interview', 'Rejected', 'Hired'];
const JOB_TYPES = ['Full-time', 'Part-time', 'Contract'];
const JOB_DEPTS = ['বিজ্ঞান', 'ভাষা', 'মানবিক', 'গণিত', 'জুনিয়র ক্যাম্পাস', 'হিসাব', 'প্রশাসন', 'সহায়ক সেবা'];

const Comms = {
  /* ---------------- shared helpers ---------------- */
  mask(v) { v = String(v || ''); return v ? '••••' + v.slice(-4) : ''; },
  blobOf(dataUrl) {
    const [h, b] = dataUrl.split(','); const mime = (h.match(/:(.*?);/) || [])[1] || 'application/octet-stream';
    const bin = atob(b); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  },
  gw() { return DB.s.gateways || {}; },
  /** Is a channel switched on (feature flag + gateway active)? */
  channelOn(kind) {
    const f = DB.s.featureFlags, g = this.gw();
    if (kind === 'Email') return f.emailGateway !== false && g.email?.active !== false;
    if (kind === 'Push') return f.pushNotifications !== false && g.push?.active !== false;
    return f.smsGateway !== false && g.sms?.active !== false;
  },
  flagKey(kind) { return { SMS: 'smsGateway', Email: 'emailGateway', Push: 'pushNotifications' }[kind]; },
  provider(kind) {
    const g = this.gw();
    if (kind === 'Email') return g.email ? `SMTP ${g.email.host || ''}`.trim() : 'SMTP';
    if (kind === 'Push') return g.push?.provider || 'Push';
    return g.sms?.provider || 'SMS';
  },
  /** Send one message through DB.sms and tag it with the gateway provider + per-channel delivery status. */
  send(to, message, kind = 'SMS', extra = {}) {
    if (!to) return null;
    DB.sms(to, message, kind);
    const m = DB.s.outbox[0];
    // 'Delivered' is set only when a provider confirms delivery; until then the message waits in the queue.
    m.status = this.channelOn(kind) ? 'Queued' : 'Queued (gateway off)';
    m.provider = extra.provider || this.provider(kind);
    if (extra.tag) m.tag = extra.tag;
    if (extra.test) m.test = true;
    return m;
  },
  audiences() { return ['Everyone', ...(multiCampus() ? DB.s.campuses.map(c => `Campus:${c.id}`) : []), 'Guardians', 'Staff', 'Students', ...DB.classesIn('ALL').map(c => `Class:${c.id}`)]; },
  audLabel(a) {
    if (!a || a === 'Everyone') return 'সকলে';
    if (a.startsWith('Campus:')) return 'শুধু ' + (DB.campus(a.slice(7))?.name || a);
    if (a.startsWith('Class:')) return DB.className(a.slice(6)) + ' (শিক্ষার্থী + অভিভাবক)';
    return { Guardians: 'অভিভাবকগণ', Staff: 'কর্মী', Students: 'শিক্ষার্থী' }[a] || a;
  },
  recipients(aud) { try { return Principal.audience(aud || 'Everyone').filter(Boolean); } catch (e) { return []; } },
  campusName(id) { if (!multiCampus()) return ''; return id === 'ALL' || !id ? 'সকল ক্যাম্পাস' : (DB.campus(id)?.name || id); },
  schoolName() { return DB.s.school.nameBn || DB.s.school.name; },

  /* ---------------- notices ---------------- */
  notice(id) { return DB.s.notices.find(n => n.id === id); },
  expired(n) { return !!n.expires && n.expires < U.today(); },
  /** Public API: download a notice's attachment, or open the generated PDF preview when there is none. */
  download(noticeId) {
    const n = this.notice(noticeId);
    if (!n) return toast('নোটিশটি পাওয়া যায়নি।', 'error');
    if (n.attachment?.dataUrl) {
      try { downloadFile(n.attachment.fileName || `${n.id}`, this.blobOf(n.attachment.dataUrl), n.attachment.fileType); }
      catch (e) { toast('সংযুক্তিটি পড়া যায়নি।', 'error'); }
      return;
    }
    Pub.noticePdf(noticeId);
  },
  toggle(id, field) {
    const n = this.notice(id); if (!n) return;
    if (!App.perm('comms', 'edit')) return toast('আপনার ভূমিকায় নোটিশ এডিট করার অনুমতি নেই।', 'error');
    n[field] = !(field === 'ticker' ? n.ticker !== false : n[field]);
    DB.audit('NOTICE_UPDATE', 'notices', `${n.id} ${field} → ${n[field] ? 'চালু' : 'বন্ধ'}`); DB.save(); App.refresh();
  },
  removeNotice(id) {
    const n = this.notice(id); if (!n) return;
    if (!App.perm('comms', 'delete')) return toast('আপনার ভূমিকায় নোটিশ মুছে ফেলার অনুমতি নেই।', 'error');
    if (!confirm(`নোটিশ "${n.title}" মুছে ফেলবেন? এটি ওয়েবসাইট ও টিকার থেকে সরিয়ে দেওয়া হবে।`)) return;
    DB.s.notices = DB.s.notices.filter(x => x.id !== id);
    DB.audit('NOTICE_DELETE', 'notices', `${n.id} "${n.title}"`); DB.save(); toast('নোটিশ মুছে ফেলা হয়েছে।'); App.refresh();
  },
  editNotice(id) {
    if (!App.perm('comms', 'edit')) return toast('আপনার ভূমিকায় নোটিশ এডিট করার অনুমতি নেই।', 'error');
    const n = id ? this.notice(id) : null;
    const v = n || { category: 'General', title: '', date: U.today(), body: '', pinned: false, ticker: true, channels: ['Website'], audience: 'Everyone', expires: '' };
    const ch = v.channels || ['Website'];
    let att = n?.attachment || null;
    const attHtml = () => att ? `<div class="flex items-center gap-2 text-sm card p-2">${icon(att.fileType === 'application/pdf' ? 'file-text' : 'image')}<span class="flex-1 truncate">${esc(att.fileName)}</span><button type="button" class="btn btn-ghost btn-sm" id="nt-att-rm">${icon('x')} অপসারণ করুন</button></div>` : '<div class="text-xs text-slate-400">কোনো সংযুক্তি নেই</div>';
    Modal.open({
      title: n ? `নোটিশ এডিট · ${esc(n.id)}` : 'নতুন নোটিশ / সার্কুলার', size: 'lg',
      body: `<form id="nt-form" class="space-y-3">
        <div><label class="label">শিরোনাম</label><input class="input" name="title" required maxlength="160" value="${esc(v.title)}"></div>
        <div class="grid sm:grid-cols-3 gap-3">
          <div><label class="label">শ্রেণিবিভাগ</label><select class="select" name="category">${NOTICE_CATEGORIES.map(c => `<option value="${c}" ${c === v.category ? 'selected' : ''}>${bn(c)}</option>`).join('')}</select></div>
          <div><label class="label">প্রকাশের তারিখ</label><input type="date" class="input" name="date" required value="${esc(v.date)}"></div>
          <div><label class="label">মেয়াদ শেষ (ঐচ্ছিক)</label><input type="date" class="input" name="expires" value="${esc(v.expires || '')}"></div>
        </div>
        <div><label class="label">মূল বক্তব্য</label><textarea class="textarea" name="body" rows="5" required maxlength="4000">${esc(v.body)}</textarea></div>
        <div class="grid sm:grid-cols-2 gap-3">
          <div><label class="label">প্রাপক</label><select class="select" name="audience">${this.audiences().map(a => `<option value="${esc(a)}" ${a === (v.audience || 'Everyone') ? 'selected' : ''}>${esc(this.audLabel(a))}</option>`).join('')}</select></div>
          <div><div class="label">মাধ্যম</div><div class="flex flex-wrap gap-3 text-sm pt-2">${NOTICE_CHANNELS.map(c => `<label class="flex items-center gap-1.5"><input type="checkbox" name="ch" value="${c}" ${ch.includes(c) ? 'checked' : ''}> ${bn(c)}${c !== 'Website' && !this.channelOn(c) ? ' <span class="text-[10px] text-amber-600">(গেটওয়ে বন্ধ)</span>' : ''}</label>`).join('')}</div></div>
        </div>
        <div class="flex flex-wrap gap-4 text-sm">
          <label class="flex items-center gap-1.5"><input type="checkbox" name="pinned" ${v.pinned ? 'checked' : ''}> শীর্ষে পিন করুন</label>
          <label class="flex items-center gap-1.5"><input type="checkbox" name="ticker" ${v.ticker !== false ? 'checked' : ''}> পাবলিক স্ক্রলিং টিকারে দেখান</label>
          <label class="flex items-center gap-1.5"><input type="checkbox" name="notify" ${n ? '' : 'checked'}> সংরক্ষণের সময় এসএমএস/ই-মেইল/পুশের মাধ্যমে প্রাপকদের কাছে পাঠান</label>
        </div>
        <div><label class="label">সংযুক্তি (পিডিএফ / ছবি)</label><input type="file" class="input" id="nt-file" accept="application/pdf,image/*"><div id="nt-att" class="mt-2">${attHtml()}</div></div>
        <div id="nt-count" class="text-sm text-slate-600"></div>
        <button class="btn btn-primary w-full">${icon('send')} ${n ? 'পরিবর্তন সংরক্ষণ করুন' : 'নোটিশ প্রকাশ করুন'}</button></form>`,
    });
    const f = $('#nt-form');
    const bindRm = () => { const b = $('#nt-att-rm'); if (b) b.onclick = () => { att = null; $('#nt-att').innerHTML = attHtml(); App.icons(); bindRm(); }; };
    bindRm();
    const upd = () => {
      const chs = $$('input[name=ch]:checked', f).map(x => x.value).filter(c => c !== 'Website');
      const cnt = this.recipients(f.audience.value).length;
      $('#nt-count').innerHTML = f.notify.checked && chs.length ? `${icon('users', 'w-4 h-4 inline')} ${chs.map(c => bn(c)).join(', ')}-এর মাধ্যমে <b>${bnNum(cnt)}</b>টি প্রাপক অ্যাকাউন্টে নোটিশ পাঠানো হবে।` : '';
      App.icons();
    };
    f.addEventListener('change', upd); upd();
    $('#nt-file').addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      try {
        if (file.type.startsWith('image/') && file.size > 8e6) throw new Error('ছবিটি অনেক বড় (সংকোচনের আগে সর্বোচ্চ ৮ এমবি)।');
        const dataUrl = await readUpload(file);
        att = { fileName: file.type === 'application/pdf' ? file.name : file.name.replace(/\.[^.]+$/, '') + '.jpg', fileType: file.type === 'application/pdf' ? 'application/pdf' : 'image/jpeg', dataUrl };
        $('#nt-att').innerHTML = attHtml(); App.icons(); bindRm();
      } catch (err) { toast(err.message, 'error'); e.target.value = ''; }
    });
    f.addEventListener('submit', e => {
      e.preventDefault();
      const d = formData(f), chs = $$('input[name=ch]:checked', f).map(x => x.value);
      if (!chs.length) return toast('অন্তত একটি মাধ্যম নির্বাচন করুন।', 'error');
      if (d.expires && d.expires < d.date) return toast('মেয়াদ শেষের তারিখ প্রকাশের তারিখের পরে হতে হবে।', 'error');
      const sendCh = f.notify.checked ? chs.filter(c => c !== 'Website') : [];
      const users = sendCh.length ? this.recipients(d.audience) : [];
      if (sendCh.length) {
        const msgs = U.sum(users, u => sendCh.filter(c => c === 'Email' ? u.email : u.phone).length);
        if (!confirm(`"${d.title}" ${sendCh.map(c => bn(c)).join(', ')}-এর মাধ্যমে ${bnNum(users.length)} জন প্রাপকের কাছে পাঠাবেন (${bnNum(msgs)}টি বার্তা)?`)) return;
      }
      const rec = n || { id: DB.id('N') };
      Object.assign(rec, { title: d.title, category: d.category, date: d.date, expires: d.expires || null, body: d.body, audience: d.audience, channels: chs, pinned: !!f.pinned.checked, ticker: !!f.ticker.checked, attachment: att });
      if (!n) { rec.createdBy = App.session.userId; DB.s.notices.unshift(rec); }
      rec.updatedAt = new Date().toISOString();
      if (sendCh.length) {
        const msg = `${DB.s.school.shortName} নোটিশ: ${d.title}। ${d.body.slice(0, 220)}${d.body.length > 220 ? '…' : ''}`;
        let sent = 0;
        users.forEach(u => sendCh.forEach(c => { if (this.send(c === 'Email' ? u.email : u.phone, msg, c, { tag: `notice:${rec.id}` })) sent++; }));
        rec.sentAt = new Date().toISOString(); rec.sentCount = (rec.sentCount || 0) + sent;
        DB.audit('NOTICE_SEND', 'notices', `${rec.id} → ${this.audLabel(d.audience)} (${bnNum(users.length)}) — ${sendCh.map(c => bn(c)).join('/')} — ${bnNum(sent)}টি বার্তা`);
      }
      DB.audit(n ? 'NOTICE_UPDATE' : 'NOTICE_CREATE', 'notices', `${rec.id} "${rec.title}" [${bn(rec.category)}]`); DB.save();
      Modal.close(); toast(n ? 'নোটিশ আপডেট করা হয়েছে।' : 'নোটিশ প্রকাশিত হয়েছে।', 'success'); App.refresh();
    });
  },
  noticesPage() {
    const ui = App.ui.cmN || (App.ui.cmN = { cat: '', q: '', st: '' });
    const q = ui.q.toLowerCase();
    const list = [...DB.s.notices].filter(n => (!ui.cat || n.category === ui.cat) && (!q || `${n.title} ${n.body}`.toLowerCase().includes(q))
      && (!ui.st || (ui.st === 'expired' ? this.expired(n) : ui.st === 'active' ? !this.expired(n) : ui.st === 'ticker' ? n.ticker !== false : n.pinned)))
      .sort((a, b) => (!!b.pinned - !!a.pinned) || b.date.localeCompare(a.date));
    const canE = App.perm('comms', 'edit'), canD = App.perm('comms', 'delete');
    const all = DB.s.notices;
    const tog = (n, f, on) => `<button class="badge ${on ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}" ${canE ? `onclick="Comms.toggle('${esc(n.id)}','${f}')"` : 'disabled'} title="${f === 'pinned' ? 'পিন চালু / বন্ধ করুন' : 'টিকার চালু / বন্ধ করুন'}">${on ? 'চালু' : 'বন্ধ'}</button>`;
    return pageHeader('নোটিশ ও সার্কুলার', '',canE ? `<button class="btn btn-primary" onclick="Comms.editNotice()">${icon('plus')} নতুন নোটিশ</button>` : '')
      + `<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">${kpi('নোটিশ', bnNum(all.length), `${bnNum(all.filter(n => n.pinned).length)}টি পিন করা`, 'megaphone', 'blue')}${kpi('টিকারে প্রদর্শিত', bnNum(all.filter(n => n.ticker !== false && !this.expired(n)).length), 'পাবলিক স্ক্রলিং বার', 'radio', 'green')}${kpi('মেয়াদোত্তীর্ণ', bnNum(all.filter(n => this.expired(n)).length), 'মেয়াদ পেরিয়ে গেছে', 'calendar-x', 'amber')}${kpi('সংযুক্তিসহ', bnNum(all.filter(n => n.attachment?.dataUrl).length), 'পিডিএফ / ছবি', 'paperclip', 'violet')}</div>
      <div class="card p-3 mb-4 flex flex-wrap gap-2 items-center">
        <select class="select !w-auto" onchange="App.ui.cmN.cat=this.value;App.refresh()"><option value="">সকল শ্রেণিবিভাগ</option>${NOTICE_CATEGORIES.map(c => `<option value="${c}" ${c === ui.cat ? 'selected' : ''}>${bn(c)}</option>`).join('')}</select>
        <select class="select !w-auto" onchange="App.ui.cmN.st=this.value;App.refresh()">${[['', 'যেকোনো অবস্থা'], ['active', 'সক্রিয়'], ['expired', 'মেয়াদোত্তীর্ণ'], ['ticker', 'টিকারে প্রদর্শিত'], ['pinned', 'পিন করা']].map(([k, l]) => `<option value="${k}" ${k === ui.st ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input class="input !w-auto flex-1 min-w-[180px]" placeholder="শিরোনাম বা লেখা অনুসন্ধান করুন…" value="${esc(ui.q)}" onchange="App.ui.cmN.q=this.value;App.refresh()">
      </div>
      <div class="card scroll-x"><table class="table"><thead><tr><th>তারিখ</th><th>নোটিশ</th><th>প্রাপক ও মাধ্যম</th><th>পিন করা</th><th>টিকার</th><th>মেয়াদ শেষ</th><th class="text-right">কার্যক্রম</th></tr></thead><tbody>
      ${list.map(n => `<tr class="${this.expired(n) ? 'opacity-60' : ''}"><td class="whitespace-nowrap text-sm">${U.fmtDate(n.date)}</td>
        <td><div class="font-semibold text-sm">${esc(n.title)}</div><div class="flex flex-wrap gap-1 mt-1">${badge(bn(n.category), { Academic: 'blue', Exam: 'violet', Holiday: 'green', Admission: 'pink', Fees: 'amber' }[n.category] || 'slate')}${n.attachment?.dataUrl ? badge(icon('paperclip', 'w-3.5 h-3.5 inline -mt-0.5') + ' ' + (n.attachment.fileType === 'application/pdf' ? 'পিডিএফ' : 'ছবি'), 'slate') : ''}${n.sentCount ? badge(`${bnNum(n.sentCount)}টি পাঠানো হয়েছে`, 'green') : ''}</div></td>
        <td class="text-xs"><div>${esc(this.audLabel(n.audience))}</div><div class="text-slate-500">${esc((n.channels || ['Website']).map(c => bn(c)).join(' · '))}</div></td>
        <td>${tog(n, 'pinned', !!n.pinned)}</td><td>${tog(n, 'ticker', n.ticker !== false)}</td>
        <td class="text-xs whitespace-nowrap">${n.expires ? (this.expired(n) ? badge('মেয়াদোত্তীর্ণ ' + U.fmtDate(n.expires), 'red') : U.fmtDate(n.expires)) : '—'}</td>
        <td class="text-right whitespace-nowrap"><button class="btn btn-ghost btn-sm" title="ডাউনলোড" onclick="Comms.download('${esc(n.id)}')">${icon('file-down')}</button>${canE ? `<button class="btn btn-ghost btn-sm" title="এডিট" onclick="Comms.editNotice('${esc(n.id)}')">${icon('pencil')}</button>` : ''}${canD ? `<button class="btn btn-ghost btn-sm text-red-600" title="মুছে ফেলুন" onclick="Comms.removeNotice('${esc(n.id)}')">${icon('trash-2')}</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="7">${emptyState('এই ফিল্টারের সাথে মেলে এমন কোনো নোটিশ নেই।', 'megaphone')}</td></tr>`}
      </tbody></table></div>`;
  },

  /* ---------------- gateways ---------------- */
  gatewaysPage() {
    const g = this.gw(), f = DB.s.featureFlags, canE = App.perm('system', 'edit');
    const off = k => f[k] === false;
    const flagNote = (k, name) => off(k) ? `<div class="mb-3 rounded-lg bg-amber-50 text-amber-800 text-xs p-2.5 flex gap-2">${icon('ban', 'w-4 h-4 shrink-0')}<span>${name} নিষ্ক্রিয় — <b>${k}</b> ফিচার ফ্ল্যাগ বন্ধ। বার্তা পৌঁছানো হচ্ছে না।</span></div>` : '';
    const head = (ic, title, on, k) => `<div class="flex items-center gap-2 mb-3"><div class="rounded-lg p-2 bg-brand-50 text-brand-700">${icon(ic, 'w-5 h-5')}</div><div class="font-bold flex-1">${title}</div>${off(k) ? badge('ফ্ল্যাগ বন্ধ', 'amber') : on ? badge('সক্রিয়', 'green') : badge('নিষ্ক্রিয়', 'slate')}</div>`;
    const inp = (name, label, val, extra = '') => `<div><label class="label">${label}</label><input class="input" name="${name}" value="${esc(val || '')}" ${extra}></div>`;
    const secret = (name, label, masked) => `<div><label class="label">${label}</label><input class="input font-mono" type="password" name="${name}" autocomplete="new-password" placeholder="${masked ? 'সংরক্ষিত: ' + esc(masked) + ' — অপরিবর্তিত রাখতে ফাঁকা রাখুন' : 'নির্ধারিত নয়'}"></div>`;
    const test = (kind, ph) => `<div class="mt-4 pt-3 border-t border-slate-100 flex gap-2"><input class="input" id="gw-test-${kind}" placeholder="${ph}"><button type="button" class="btn btn-ghost shrink-0" ${off(this.flagKey(kind)) ? 'disabled title="ফিচার ফ্ল্যাগ বন্ধ"' : ''} onclick="Comms.testGateway('${kind}')">${icon('send')} পরীক্ষামূলক বার্তা পাঠান</button></div>`;
    const s = g.sms || {}, e = g.email || {}, p = g.push || {};
    const dis = k => (!canE || off(k)) ? 'disabled' : '';
    const cur = ['sms', 'email', 'push'].includes(App.ui.gwTab) ? App.ui.gwTab : 'sms', hid = k => k === cur ? '' : 'hidden';
    return pageHeader('বার্তা গেটওয়ে', '')
      + `${pills([['sms', `এসএমএস · ${esc(s.provider || '—')}`, 'message-square'], ['email', 'ই-মেইল (SMTP)', 'mail'], ['push', 'অ্যাপ পুশ', 'bell-ring']], cur, id => `App.ui.gwTab='${id}';App.refresh()`)}
      <div class="max-w-2xl">
        <form class="card p-5 ${hid('sms')} ${off('smsGateway') ? 'opacity-75' : ''}" data-gw="sms">${head('message-square', 'এসএমএস গেটওয়ে', s.active, 'smsGateway')}${flagNote('smsGateway', 'এসএমএস')}
          <fieldset class="space-y-3" ${dis('smsGateway')}>
          <div><label class="label">সেবাদাতা</label><select class="select" name="provider">${[['Teletalk', 'Teletalk'], ['Twilio', 'Twilio'], ['Local SMS API', 'স্থানীয় এসএমএস এপিআই']].map(([x, l]) => `<option value="${x}" ${x === s.provider ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="grid grid-cols-2 gap-3">${inp('senderId', 'প্রেরক আইডি / মাস্ক', s.senderId, 'maxlength="11"')}${inp('username', 'ব্যবহারকারীর নাম / অ্যাকাউন্ট SID', s.username || s.accountSid)}</div>
          ${secret('apiKey', 'এপিআই কী / অথ টোকেন', s.apiKeyMasked)}${inp('endpoint', 'এপিআই এন্ডপয়েন্ট', s.endpoint, 'type="url"')}
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="active" ${s.active ? 'checked' : ''}> গেটওয়ে সক্রিয়</label>
          <button class="btn btn-primary w-full">${icon('save')} এসএমএস সেটিংস সংরক্ষণ করুন</button></fieldset>${test('SMS', '01XXXXXXXXX')}</form>
        <form class="card p-5 ${hid('email')} ${off('emailGateway') ? 'opacity-75' : ''}" data-gw="email">${head('mail', 'ই-মেইল (SMTP)', e.active, 'emailGateway')}${flagNote('emailGateway', 'ই-মেইল')}
          <fieldset class="space-y-3" ${dis('emailGateway')}>
          <div class="grid grid-cols-3 gap-3"><div class="col-span-2">${inp('host', 'SMTP হোস্ট', e.host)}</div>${inp('port', 'পোর্ট', e.port, 'type="number" min="1" max="65535"')}</div>
          <div><label class="label">নিরাপত্তা</label><select class="select" name="security">${[['TLS', 'TLS'], ['SSL', 'SSL'], ['None', 'কোনোটি নয়']].map(([x, l]) => `<option value="${x}" ${x === e.security ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          ${inp('username', 'ব্যবহারকারীর নাম', e.username)}${secret('password', 'পাসওয়ার্ড / অ্যাপ পাসওয়ার্ড', e.passwordMasked)}
          <div class="grid grid-cols-2 gap-3">${inp('fromName', 'প্রেরকের নাম', e.fromName)}${inp('fromEmail', 'প্রেরকের ই-মেইল', e.fromEmail, 'type="email"')}</div>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="active" ${e.active ? 'checked' : ''}> গেটওয়ে সক্রিয়</label>
          <button class="btn btn-primary w-full">${icon('save')} ই-মেইল সেটিংস সংরক্ষণ করুন</button></fieldset>${test('Email', 'name@example.com')}</form>
        <form class="card p-5 ${hid('push')} ${off('pushNotifications') ? 'opacity-75' : ''}" data-gw="push">${head('bell-ring', 'অ্যাপ পুশ', p.active, 'pushNotifications')}${flagNote('pushNotifications', 'পুশ নোটিফিকেশন')}
          <fieldset class="space-y-3" ${dis('pushNotifications')}>
          <div><label class="label">সেবাদাতা</label><select class="select" name="provider"><option value="Firebase Cloud Messaging">Firebase Cloud Messaging</option></select></div>
          ${inp('projectId', 'প্রজেক্ট আইডি', p.projectId)}${secret('serverKey', 'সার্ভার কী', p.serverKeyMasked)}
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> গেটওয়ে সক্রিয়</label>
          <button class="btn btn-primary w-full">${icon('save')} পুশ সেটিংস সংরক্ষণ করুন</button></fieldset>${test('Push', 'ডিভাইস / ব্যবহারকারী (যেমন 01XXXXXXXXX)')}</form>
      </div>
      <div class="text-xs text-slate-400 mt-3">সর্বশেষ পরিবর্তন: ${g.updatedAt ? U.fmtTime(g.updatedAt) : '—'}</div>`;
  },
  gatewaysMount() {
    $$('form[data-gw]').forEach(form => form.addEventListener('submit', e => {
      e.preventDefault();
      if (!App.perm('system', 'edit')) return toast('আপনার ভূমিকায় গেটওয়ে সেটিংস পরিবর্তনের অনুমতি নেই।', 'error');
      const kind = form.dataset.gw, d = formData(form), g = DB.s.gateways || (DB.s.gateways = {}), cur = g[kind] || {};
      const active = !!form.active.checked;
      if (kind === 'sms') {
        g.sms = { ...cur, provider: d.provider, senderId: d.senderId, username: d.username, endpoint: d.endpoint, active };
        if (d.provider === 'Twilio') g.sms.accountSid = d.username;
        if (d.apiKey) g.sms.apiKeyMasked = this.mask(d.apiKey);
      } else if (kind === 'email') {
        if (d.fromEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.fromEmail)) return toast('প্রেরকের ই-মেইল সঠিক নয়।', 'error');
        g.email = { ...cur, host: d.host, port: +d.port || 587, security: d.security, username: d.username, fromName: d.fromName, fromEmail: d.fromEmail, active };
        if (d.password) g.email.passwordMasked = this.mask(d.password);
      } else {
        g.push = { ...cur, provider: d.provider, projectId: d.projectId, active };
        if (d.serverKey) g.push.serverKeyMasked = this.mask(d.serverKey);
      }
      g.updatedAt = new Date().toISOString();
      const kl = { sms: 'এসএমএস', email: 'ই-মেইল', push: 'পুশ' }[kind];
      DB.audit('GATEWAY_UPDATE', 'gateways', `${kl} গেটওয়ে সেটিংস সংরক্ষিত${d.apiKey || d.password || d.serverKey ? ' (গোপন কী পরিবর্তিত, আড়াল করা)' : ''}; সক্রিয়=${active ? 'হ্যাঁ' : 'না'}`); DB.save();
      toast(`${kl} গেটওয়ে সংরক্ষিত হয়েছে।`, 'success'); App.refresh();
    }));
  },
  testGateway(kind) {
    const k = this.flagKey(kind);
    if (DB.s.featureFlags[k] === false) return toast(`ফিচার ফ্ল্যাগের কারণে ${bn(kind)} নিষ্ক্রিয় রয়েছে।`, 'warn');
    const to = $(`#gw-test-${kind}`)?.value.trim();
    if (!to) return toast('একজন পরীক্ষামূলক প্রাপক লিখুন।', 'error');
    if (kind === 'SMS' && !/^(\+?88)?01[3-9]\d{8}$/.test(to)) return toast('একটি সঠিক বাংলাদেশি মোবাইল নম্বর লিখুন।', 'error');
    if (kind === 'Email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return toast('একটি সঠিক ই-মেইল ঠিকানা লিখুন।', 'error');
    const m = this.send(to, `${DB.s.school.shortName}: ${this.provider(kind)}-এর মাধ্যমে পরীক্ষামূলক বার্তা, সময় ${U.bn(new Date().toLocaleTimeString('en-GB'))}।`, kind, { test: true, tag: 'gateway-test' });
    DB.audit('GATEWAY_TEST', 'gateways', `${bn(kind)} পরীক্ষা → ${to}, ${m.provider}-এর মাধ্যমে (${bn(m.status)})`); DB.save();
    toast(m.status === 'Queued' ? `পরীক্ষামূলক ${bn(kind)} পাঠানোর সারিতে রাখা হয়েছে (${m.provider})। সেবাদাতা নিশ্চিত করলে বার্তা লগে “পৌঁছেছে” দেখাবে।` : `পরীক্ষামূলক ${bn(kind)} সারিতে রাখা হয়েছে — ${m.provider} গেটওয়ে নিষ্ক্রিয়।`, 'warn');
  },

  /* ---------------- message log ---------------- */
  logRows() {
    const ui = App.ui.cmLog || (App.ui.cmLog = { ch: '', st: '', q: '' });
    const q = ui.q.toLowerCase();
    return DB.s.outbox.filter(m => (!ui.ch || (m.kind || 'SMS') === ui.ch) && (!ui.st || m.status === ui.st) && (!q || `${m.to} ${m.message} ${m.provider || ''}`.toLowerCase().includes(q)));
  },
  messagesPage() {
    const ui = App.ui.cmLog || (App.ui.cmLog = { ch: '', st: '', q: '' });
    const ob = DB.s.outbox, rows = this.logRows(), shown = rows.slice(0, 300);
    const cnt = k => ob.filter(m => (m.kind || 'SMS') === k).length;
    const statuses = [...new Set(ob.map(m => m.status))];
    return pageHeader('বার্তা লগ', `${bnNum(ob.length, true)}টি সংরক্ষিত`,`<button class="btn btn-ghost" onclick="Comms.exportLog()">${icon('download')} সিএসভি এক্সপোর্ট করুন</button>`)
      + `<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">${kpi('এসএমএস', bnNum(cnt('SMS'), true), this.provider('SMS'), 'message-square', 'green')}${kpi('ই-মেইল', bnNum(cnt('Email'), true), this.provider('Email'), 'mail', 'blue')}${kpi('পুশ', bnNum(cnt('Push'), true), this.provider('Push'), 'bell-ring', 'violet')}${kpi('সারিতে / ব্যর্থ', bnNum(ob.filter(m => m.status !== 'Delivered').length, true), 'পৌঁছায়নি', 'clock', 'amber')}</div>
      <div class="card p-3 mb-4 flex flex-wrap gap-2 items-center">
        <select class="select !w-auto" onchange="App.ui.cmLog.ch=this.value;App.refresh()"><option value="">সকল মাধ্যম</option>${['SMS', 'Email', 'Push'].map(c => `<option value="${c}" ${c === ui.ch ? 'selected' : ''}>${bn(c)}</option>`).join('')}</select>
        <select class="select !w-auto" onchange="App.ui.cmLog.st=this.value;App.refresh()"><option value="">যেকোনো অবস্থা</option>${statuses.map(s => `<option value="${esc(s)}" ${s === ui.st ? 'selected' : ''}>${esc(bn(s))}</option>`).join('')}</select>
        <input class="input !w-auto flex-1 min-w-[180px]" placeholder="প্রাপক, লেখা বা সেবাদাতা অনুসন্ধান করুন…" value="${esc(ui.q)}" onchange="App.ui.cmLog.q=this.value;App.refresh()">
        <span class="text-sm text-slate-500">${bnNum(rows.length, true)}টি মিল</span>
      </div>
      <div class="card scroll-x"><table class="table"><thead><tr><th>সময়</th><th>মাধ্যম</th><th>প্রাপক</th><th>বার্তা</th><th>সেবাদাতা</th><th>অবস্থা</th></tr></thead><tbody>
      ${shown.map(m => `<tr class="cursor-pointer hover:bg-slate-50" onclick="Comms.showMsg('${esc(m.id)}')"><td class="whitespace-nowrap text-xs">${U.fmtTime(m.ts)}</td><td>${badge(bn(m.kind || 'SMS'), { SMS: 'green', Email: 'blue', Push: 'violet' }[m.kind || 'SMS'])}</td><td class="text-sm whitespace-nowrap">${esc(m.to)}</td><td class="text-sm max-w-md"><div class="truncate">${esc(m.message)}</div></td><td class="text-xs text-slate-500 whitespace-nowrap">${esc(m.provider || '—')}${m.test ? ' ' + badge('পরীক্ষামূলক', 'amber') : ''}</td><td>${badge(bn(m.status), m.status === 'Delivered' ? 'green' : 'amber')}</td></tr>`).join('') || `<tr><td colspan="6">${emptyState('মিলে যায় এমন কোনো বার্তা নেই।', 'mail')}</td></tr>`}
      </tbody></table>${rows.length > shown.length ? `<div class="text-xs text-slate-400 p-3">${bnNum(rows.length)}টির মধ্যে প্রথম ${bnNum(shown.length)}টি দেখানো হচ্ছে</div>` : ''}</div>`;
  },
  showMsg(id) {
    const m = DB.s.outbox.find(x => x.id === id); if (!m) return;
    Modal.open({ title: `${esc(bn(m.kind || 'SMS'))} · ${esc(m.id)}`, size: 'md', body: `<dl class="grid grid-cols-3 gap-2 text-sm"><dt class="text-slate-500">প্রাপক</dt><dd class="col-span-2">${esc(m.to)}</dd><dt class="text-slate-500">সময়</dt><dd class="col-span-2">${U.fmtTime(m.ts)}</dd><dt class="text-slate-500">সেবাদাতা</dt><dd class="col-span-2">${esc(m.provider || '—')}</dd><dt class="text-slate-500">অবস্থা</dt><dd class="col-span-2">${esc(bn(m.status))}</dd>${m.tag ? `<dt class="text-slate-500">উৎস</dt><dd class="col-span-2">${esc(m.tag)}</dd>` : ''}</dl><div class="mt-4 p-3 rounded-lg bg-slate-50 text-sm whitespace-pre-wrap">${esc(m.message)}</div>` });
  },
  exportLog() {
    const rows = this.logRows();
    downloadFile(`message-log-${U.today()}.csv`, U.csv([['আইডি', 'সময়', 'মাধ্যম', 'প্রাপক', 'বার্তা', 'সেবাদাতা', 'অবস্থা', 'উৎস'], ...rows.map(m => [m.id, m.ts, bn(m.kind || 'SMS'), m.to, m.message, m.provider || '', bn(m.status), m.tag || ''])]), 'text/csv');
    DB.audit('EXPORT', 'outbox', `বার্তা লগ সিএসভি (${bnNum(rows.length)}টি সারি)`); DB.save();
  },

  /* ---------------- careers: shared ---------------- */
  job(id) { return (DB.s.jobs || []).find(j => j.id === id); },
  app(id) { return (DB.s.jobApplications || []).find(a => a.id === id); },
  appsOf(jobId) { return (DB.s.jobApplications || []).filter(a => a.jobId === jobId); },
  jobOpen(j) { return j.status === 'Open' && (!j.deadline || j.deadline >= U.today()); },
  statusTone(s) { return { New: 'blue', Shortlisted: 'violet', Interview: 'amber', Rejected: 'red', Hired: 'green', Open: 'green', Closed: 'slate' }[s] || 'slate'; },
  viewCv(appId) {
    const a = this.app(appId); if (!a) return;
    const cv = a.cv || {};
    if (!cv.dataUrl) return Modal.open({ title: `জীবনবৃত্তান্ত · ${esc(a.name)}`, size: 'sm', body: `<div class="text-center py-4">${icon('file-question', 'w-10 h-10 mx-auto text-slate-300 mb-2')}<p class="text-sm text-slate-600">এই আবেদনের জন্য কোনো জীবনবৃত্তান্ত ফাইল সংরক্ষিত নেই।</p><p class="text-xs text-slate-400 mt-1">${esc(cv.fileName || '')}</p></div>` });
    if (cv.fileType === 'application/pdf') {
      try { const url = URL.createObjectURL(this.blobOf(cv.dataUrl)); const w = window.open(url, '_blank'); if (!w) toast('পপ-আপ বন্ধ রয়েছে — জীবনবৃত্তান্ত দেখতে পপ-আপের অনুমতি দিন।', 'warn'); setTimeout(() => URL.revokeObjectURL(url), 60000); }
      catch (e) { toast('জীবনবৃত্তান্ত খোলা যায়নি।', 'error'); }
      return;
    }
    Modal.open({ title: `জীবনবৃত্তান্ত · ${esc(a.name)}`, size: 'lg', body: `<img src="${esc(cv.dataUrl)}" alt="${esc(a.name)}-এর জীবনবৃত্তান্ত" class="w-full rounded-lg border border-slate-200">` });
  },

  /* ---------------- careers: public ---------------- */
  careersPage() {
    const jobs = (DB.s.jobs || []).filter(j => this.jobOpen(j)).sort((a, b) => b.postedOn.localeCompare(a.postedOn));
    const done = App.ui.carDone && this.app(App.ui.carDone);
    if (done) {
      const j = this.job(done.jobId);
      return Pub.wrap(Pub.hero('আবেদন গৃহীত হয়েছে', 'আমাদের সাথে যুক্ত হওয়ার আগ্রহের জন্য আপনাকে ধন্যবাদ।') + `<section class="max-w-2xl mx-auto px-4 py-12"><div class="card p-8 text-center">
        <div class="mx-auto w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">${icon('check', 'w-7 h-7')}</div>
        <h2 class="text-xl font-bold">আপনার রেফারেন্স আইডি <span class="font-mono text-brand-700">${esc(done.id)}</span></h2>
        <p class="text-sm text-slate-600 mt-2">আবেদনকৃত পদ: <b>${esc(j?.title || '')}</b>। ${esc(done.phone)} নম্বরে এসএমএস এবং ${esc(done.email)} ঠিকানায় ই-মেইলের মাধ্যমে একটি নিশ্চিতকরণ বার্তা পাঠানো হয়েছে। সংক্ষিপ্ত তালিকাভুক্ত প্রার্থীদের সাক্ষাৎকারের জন্য যোগাযোগ করা হবে।</p>
        <button class="btn btn-primary mt-6" onclick="App.ui.carDone=null;App.refresh()">${icon('arrow-left')} শূন্যপদের তালিকায় ফিরে যান</button></div></section>`);
    }
    const sel = App.ui.carJob && this.job(App.ui.carJob);
    if (sel && this.jobOpen(sel)) {
      return Pub.wrap(Pub.hero(esc(sel.title), [sel.department, bn(sel.type), this.campusName(sel.campusId)].filter(Boolean).map(esc).join(' · ')) + `<section class="max-w-5xl mx-auto px-4 py-10 grid lg:grid-cols-5 gap-6">
        <div class="lg:col-span-2 space-y-4"><button class="btn btn-ghost btn-sm" onclick="App.ui.carJob=null;App.refresh()">${icon('arrow-left')} সকল শূন্যপদ</button>
          <div class="card p-5 space-y-2 text-sm"><div class="flex justify-between"><span class="text-slate-500">শূন্যপদ</span><b>${bnNum(+sel.vacancies || 1)}</b></div><div class="flex justify-between"><span class="text-slate-500">বেতন</span><b>${esc(sel.salaryRange || 'আলোচনা সাপেক্ষ')}</b></div><div class="flex justify-between"><span class="text-slate-500">শেষ তারিখ</span><b>${U.fmtDate(sel.deadline)}</b></div><div class="flex justify-between"><span class="text-slate-500">প্রকাশিত</span><span>${U.fmtDate(sel.postedOn)}</span></div></div>
          <div class="card p-5"><div class="font-semibold mb-2">পদ সম্পর্কে</div><p class="text-sm text-slate-600 whitespace-pre-line">${esc(sel.description)}</p>
          ${(sel.requirements || []).length ? `<div class="font-semibold mt-4 mb-2">যোগ্যতা ও শর্তাবলি</div><ul class="list-disc pl-5 text-sm text-slate-600 space-y-1">${sel.requirements.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}</div></div>
        <form id="car-form" class="card p-5 sm:p-6 lg:col-span-3 space-y-3"><h2 class="font-bold text-lg">অনলাইনে আবেদন করুন</h2>
          <div class="grid sm:grid-cols-2 gap-3"><div><label class="label">পূর্ণ নাম</label><input class="input" name="name" required maxlength="80"></div><div><label class="label">মোবাইল</label><input class="input" name="phone" required placeholder="01XXXXXXXXX" pattern="(\\+?88)?01[3-9][0-9]{8}"></div></div>
          <div class="grid sm:grid-cols-2 gap-3"><div><label class="label">ই-মেইল</label><input class="input" type="email" name="email" required maxlength="120"></div><div><label class="label">অভিজ্ঞতা (বছর)</label><input class="input" type="number" name="experienceYears" min="0" max="50" value="0" required></div></div>
          <div><label class="label">সর্বোচ্চ শিক্ষাগত যোগ্যতা</label><input class="input" name="qualification" required maxlength="160" placeholder="যেমন: পদার্থবিজ্ঞানে এম.এসসি., ঢাকা বিশ্ববিদ্যালয়"></div>
          <div><label class="label">আবেদনপত্র (কভার লেটার)</label><textarea class="textarea" name="coverLetter" rows="5" maxlength="3000" placeholder="এই পদের জন্য আপনি কেন উপযুক্ত?"></textarea></div>
          <div><label class="label">জীবনবৃত্তান্ত (পিডিএফ বা ছবি, সর্বোচ্চ ১.৫ এমবি)</label><input class="input" type="file" name="cv" accept="application/pdf,image/*" required></div>
          <label class="flex items-start gap-2 text-xs text-slate-600"><input type="checkbox" required class="mt-0.5"> আমি নিশ্চিত করছি যে প্রদত্ত তথ্য সঠিক এবং নিয়োগের উদ্দেশ্যে প্রতিষ্ঠান কর্তৃক আমার তথ্য প্রক্রিয়াকরণে সম্মতি দিচ্ছি (দেখুন <a href="${App.href('public', 'privacy')}" class="underline">গোপনীয়তা নীতি</a>)।</label>
          <button class="btn btn-primary w-full" id="car-submit">${icon('send')} আবেদন জমা দিন</button></form></section>`);
    }
    const dept = App.ui.carDept || '';
    const depts = [...new Set(jobs.map(j => j.department))];
    const list = jobs.filter(j => !dept || j.department === dept);
    return Pub.wrap(Pub.hero('ক্যারিয়ার', `${esc(this.schoolName())}-এ যোগ দিন — আমরা নিবেদিতপ্রাণ শিক্ষক ও কর্মী খুঁজছি।`)
      + Pub.section('বর্তমান শূন্যপদ', 'আমাদের সাথে কাজ করুন', `<div class="flex flex-wrap gap-2 mb-5">${['', ...depts].map(d => `<button class="btn btn-sm ${d === dept ? 'btn-primary' : 'btn-ghost'}" onclick="App.ui.carDept='${esc(d)}';App.refresh()">${d ? esc(d) : 'সকল বিভাগ'}</button>`).join('')}</div>
        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">${list.map(j => `<article class="card p-5 flex flex-col gap-2 hover:shadow-md transition">
          <div class="flex flex-wrap gap-1.5">${badge(j.department, 'blue')}${badge(bn(j.type), 'violet')}</div>
          <h3 class="font-semibold text-slate-900 text-lg leading-snug">${esc(j.title)}</h3>
          <div class="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1">${multiCampus() ? `<span>${icon('school', 'w-3.5 h-3.5 inline')} ${esc(this.campusName(j.campusId))}</span>` : ''}<span>${icon('users', 'w-3.5 h-3.5 inline')} ${bnNum(+j.vacancies || 1)}টি পদ</span><span>${icon('wallet', 'w-3.5 h-3.5 inline')} ${esc(j.salaryRange || 'আলোচনা সাপেক্ষ')}</span></div>
          <p class="text-sm text-slate-600 line-clamp-3">${esc(j.description)}</p>
          <div class="mt-auto pt-2 flex items-center justify-between"><span class="text-xs text-red-600 font-semibold">আবেদনের শেষ তারিখ ${U.fmtDate(j.deadline)}</span><button class="btn btn-primary btn-sm" onclick="App.ui.carJob='${esc(j.id)}';App.go('public','careers')">দেখুন ও আবেদন করুন ${icon('arrow-right')}</button></div></article>`).join('') || `<div class="md:col-span-3">${emptyState('এই মুহূর্তে কোনো শূন্যপদ নেই। অনুগ্রহ করে পরে আবার দেখুন।', 'briefcase')}</div>`}</div>`)
      + `<div class="bg-white border-y border-slate-200">${Pub.section('আবেদনের অবস্থা জানুন', 'ইতোমধ্যে আবেদন করেছেন?', `<form id="car-track" class="card p-4 max-w-2xl grid sm:grid-cols-3 gap-3 items-end"><div><label class="label">রেফারেন্স আইডি</label><input class="input" name="ref" required></div><div><label class="label">মোবাইল</label><input class="input" name="phone" required placeholder="01XXXXXXXXX"></div><button class="btn btn-ghost">${icon('search')} যাচাই করুন</button></form><div id="car-track-out" class="mt-3 max-w-2xl"></div>`)}</div>`);
  },
  careersMount() {
    const tr = $('#car-track');
    if (tr) tr.addEventListener('submit', e => {
      e.preventDefault(); const d = formData(tr);
      const a = (DB.s.jobApplications || []).find(x => x.id.toUpperCase() === d.ref.toUpperCase() && x.phone.replace(/\D/g, '').slice(-11) === d.phone.replace(/\D/g, '').slice(-11));
      $('#car-track-out').innerHTML = a ? `<div class="card p-4 text-sm"><b>${esc(this.job(a.jobId)?.title || '')}</b> · ${esc(a.name)} — অবস্থা ${badge(a.status === 'Rejected' ? 'নির্বাচিত হননি' : bn(a.status), this.statusTone(a.status))}${a.status === 'Interview' && a.interviewDate ? `<div class="mt-1 text-slate-600">সাক্ষাৎকার: ${U.fmtTime(a.interviewDate)}</div>` : ''}</div>` : `<div class="text-sm text-red-600">এই রেফারেন্স আইডি ও মোবাইল নম্বরে কোনো আবেদন পাওয়া যায়নি।</div>`;
    });
    const f = $('#car-form'); if (!f) return;
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const j = this.job(App.ui.carJob); if (!j || !this.jobOpen(j)) return toast('এই পদে এখন আর আবেদন গ্রহণ করা হচ্ছে না।', 'error');
      const d = formData(f), file = f.cv.files[0];
      const phone = d.phone.replace(/[\s-]/g, '');
      if (!/^(\+?88)?01[3-9]\d{8}$/.test(phone)) return toast('একটি সঠিক বাংলাদেশি মোবাইল নম্বর লিখুন।', 'error');
      if (!file) return toast('আপনার জীবনবৃত্তান্ত সংযুক্ত করুন।', 'error');
      if (file.size > 1.5e6) return toast('জীবনবৃত্তান্ত ১.৫ এমবি বা তার কম হতে হবে।', 'error');
      if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) return toast('জীবনবৃত্তান্ত অবশ্যই পিডিএফ বা ছবি হতে হবে।', 'error');
      if ((DB.s.jobApplications || []).some(a => a.jobId === j.id && a.phone.slice(-11) === phone.slice(-11))) return toast('এই মোবাইল নম্বর থেকে এই পদে ইতোমধ্যে একটি আবেদন রয়েছে।', 'warn');
      const btn = $('#car-submit'); btn.disabled = true;
      let dataUrl;
      try { dataUrl = await readUpload(file); } catch (err) { btn.disabled = false; return toast(err.message, 'error'); }
      const isPdf = file.type === 'application/pdf';
      const a = { id: DB.id('JA'), jobId: j.id, name: d.name, email: d.email, phone, qualification: d.qualification, experienceYears: U.clamp(+d.experienceYears || 0, 0, 50), coverLetter: d.coverLetter, cv: { fileName: isPdf ? file.name : file.name.replace(/\.[^.]+$/, '') + '.jpg', fileType: isPdf ? 'application/pdf' : 'image/jpeg', dataUrl }, status: 'New', notes: '', interviewDate: null, appliedAt: new Date().toISOString() };
      (DB.s.jobApplications || (DB.s.jobApplications = [])).push(a);
      const sn = DB.s.school.shortName;
      this.send(phone, `${sn}: প্রিয় ${d.name}, ${j.title} পদের জন্য আপনার আবেদন আমরা পেয়েছি। রেফারেন্স: ${a.id}। সংক্ষিপ্ত তালিকাভুক্ত প্রার্থীদের সাথে যোগাযোগ করা হবে।`, 'SMS', { tag: `job:${a.id}` });
      this.send(d.email, `${this.schoolName()} — আবেদন গৃহীত হয়েছে\n\nপ্রিয় ${d.name},\n${j.title} পদে আবেদন করার জন্য আপনাকে ধন্যবাদ। আপনার রেফারেন্স আইডি ${a.id}। ক্যারিয়ার পৃষ্ঠা থেকে আপনি আবেদনের অবস্থা জানতে পারবেন।`, 'Email', { tag: `job:${a.id}` });
      DB.audit('JOB_APPLY', 'jobApplications', `${a.id} ${d.name} → ${j.id} ${j.title}`, { role: 'PUBLIC' });
      if (!DB.save()) { /* storage full: still show reference */ }
      App.ui.carDone = a.id; App.ui.carJob = null; App.refresh(); window.scrollTo(0, 0);
    });
  },

  /* ---------------- careers: recruitment (admin / principal) ---------------- */
  editJob(id) {
    if (!App.perm('hr', 'edit')) return toast('আপনার ভূমিকায় নিয়োগ নোটিশ এডিট করার অনুমতি নেই।', 'error');
    const j = id ? this.job(id) : null;
    const v = j || { title: '', department: JOB_DEPTS[0], type: 'Full-time', campusId: DB.campusId(), vacancies: 1, salaryRange: '', deadline: U.iso(U.addDays(new Date(), 21)), description: '', requirements: [], status: 'Open' };
    Modal.open({
      title: j ? `নিয়োগ নোটিশ এডিট · ${esc(j.id)}` : 'নতুন নিয়োগ নোটিশ', size: 'lg',
      body: `<form id="job-form" class="space-y-3">
        <div><label class="label">পদের নাম</label><input class="input" name="title" required maxlength="120" value="${esc(v.title)}"></div>
        <div class="grid sm:grid-cols-3 gap-3"><div><label class="label">বিভাগ</label><input class="input" name="department" list="job-depts" required value="${esc(v.department)}"><datalist id="job-depts">${JOB_DEPTS.map(d => `<option value="${d}">`).join('')}</datalist></div>
          <div><label class="label">ধরন</label><select class="select" name="type">${JOB_TYPES.map(t => `<option value="${t}" ${t === v.type ? 'selected' : ''}>${bn(t)}</option>`).join('')}</select></div>
          <div><label class="label">ক্যাম্পাস</label><select class="select" name="campusId"><option data-cmp value="ALL" ${v.campusId === 'ALL' ? 'selected' : ''}>সকল ক্যাম্পাস</option>${campusOptions(v.campusId)}</select></div></div>
        <div class="grid sm:grid-cols-4 gap-3"><div><label class="label">শূন্যপদ</label><input class="input" type="number" min="1" max="50" name="vacancies" value="${+v.vacancies || 1}"></div>
          <div class="sm:col-span-2"><label class="label">বেতন সীমা</label><input class="input" name="salaryRange" value="${esc(v.salaryRange)}" placeholder="৳৩০,০০০ – ৳৪০,০০০"></div>
          <div><label class="label">শেষ তারিখ</label><input class="input" type="date" name="deadline" required value="${esc(v.deadline)}"></div></div>
        <div><label class="label">বিবরণ</label><textarea class="textarea" name="description" rows="4" required>${esc(v.description)}</textarea></div>
        <div><label class="label">যোগ্যতা ও শর্তাবলি (প্রতি লাইনে একটি)</label><textarea class="textarea" name="requirements" rows="4">${esc((v.requirements || []).join('\n'))}</textarea></div>
        <div><label class="label">অবস্থা</label><select class="select" name="status">${['Open', 'Closed'].map(s => `<option value="${s}" ${s === v.status ? 'selected' : ''}>${bn(s)}</option>`).join('')}</select></div>
        <button class="btn btn-primary w-full">${icon('save')} ${j ? 'নিয়োগ নোটিশ সংরক্ষণ করুন' : 'নিয়োগ নোটিশ প্রকাশ করুন'}</button></form>`,
    });
    $('#job-form').addEventListener('submit', e => {
      e.preventDefault(); const d = formData(e.target);
      const rec = j || { id: DB.id('JOB'), postedOn: U.today() };
      Object.assign(rec, { title: d.title, department: d.department, type: d.type, campusId: d.campusId, vacancies: U.clamp(+d.vacancies || 1, 1, 50), salaryRange: d.salaryRange, deadline: d.deadline, description: d.description, requirements: d.requirements.split('\n').map(x => x.trim()).filter(Boolean), status: d.status });
      if (!j) (DB.s.jobs || (DB.s.jobs = [])).unshift(rec);
      DB.audit(j ? 'JOB_UPDATE' : 'JOB_CREATE', 'jobs', `${rec.id} ${rec.title} (${bn(rec.status)})`); DB.save();
      App.ui.recJob = rec.id; Modal.close(); toast(j ? 'নিয়োগ নোটিশ আপডেট করা হয়েছে।' : 'নিয়োগ নোটিশ ক্যারিয়ার পৃষ্ঠায় প্রকাশিত হয়েছে।', 'success'); App.refresh();
    });
  },
  setJobStatus(id, status) {
    const j = this.job(id); if (!j) return;
    if (!App.perm('hr', 'edit')) return toast('আপনার ভূমিকায় নিয়োগ নোটিশ এডিট করার অনুমতি নেই।', 'error');
    if (status === 'Closed' && !confirm(`"${j.title}" বন্ধ করবেন? এটি পাবলিক ক্যারিয়ার পৃষ্ঠা থেকে সরিয়ে দেওয়া হবে।`)) return;
    j.status = status; DB.audit('JOB_UPDATE', 'jobs', `${j.id} ${j.title} → ${bn(status)}`); DB.save(); App.refresh();
  },
  setAppStatus(id, status) {
    const a = this.app(id); if (!a) return;
    if (!App.perm('hr', 'edit')) { toast('আপনার ভূমিকায় আবেদনকারীর তথ্য আপডেটের অনুমতি নেই।', 'error'); return App.refresh(); }
    if (status === 'Interview' && !a.interviewDate) { App.refresh(); return this.openApp(id, 'Interview'); }
    const old = a.status; a.status = status;
    DB.audit('APPLICANT_STATUS', 'jobApplications', `${a.id} ${a.name}: ${bn(old)} → ${bn(status)}`); DB.save(); toast(`${a.name} → ${bn(status)}`); App.refresh();
  },
  openApp(id, preset) {
    const a = this.app(id); if (!a) return; const j = this.job(a.jobId);
    const curSt = preset || a.status;
    const canE = App.perm('hr', 'edit');
    Modal.open({
      title: `${esc(a.name)} · ${esc(a.id)}`, size: 'lg',
      body: `<div class="grid sm:grid-cols-2 gap-4 text-sm mb-4">
          <div class="space-y-1"><div><span class="text-slate-500">পদ:</span> <b>${esc(j?.title || a.jobId)}</b></div><div><span class="text-slate-500">মোবাইল:</span> ${esc(a.phone)}</div><div><span class="text-slate-500">ই-মেইল:</span> ${esc(a.email)}</div><div><span class="text-slate-500">আবেদনের সময়:</span> ${U.fmtTime(a.appliedAt)}</div></div>
          <div class="space-y-1"><div><span class="text-slate-500">শিক্ষাগত যোগ্যতা:</span> ${esc(a.qualification)}</div><div><span class="text-slate-500">অভিজ্ঞতা:</span> ${bnNum(+a.experienceYears || 0)} বছর</div><div><button type="button" class="btn btn-ghost btn-sm mt-1" onclick="Comms.viewCv('${esc(a.id)}')">${icon('file-text')} জীবনবৃত্তান্ত দেখুন</button></div></div></div>
        ${a.coverLetter ? `<div class="p-3 rounded-lg bg-slate-50 text-sm whitespace-pre-wrap mb-4">${esc(a.coverLetter)}</div>` : ''}
        <form id="app-form" class="space-y-3"><fieldset ${canE ? '' : 'disabled'} class="space-y-3">
          <div class="grid sm:grid-cols-2 gap-3"><div><label class="label">অবস্থা</label><select class="select" name="status">${JOB_STATUSES.map(s => `<option value="${s}" ${s === curSt ? 'selected' : ''}>${bn(s)}</option>`).join('')}</select></div>
            <div><label class="label">সাক্ষাৎকারের তারিখ ও সময়</label><input class="input" type="datetime-local" name="interviewDate" value="${esc((a.interviewDate || '').slice(0, 16))}"></div></div>
          <div><label class="label">অভ্যন্তরীণ মন্তব্য</label><textarea class="textarea" name="notes" rows="3">${esc(a.notes || '')}</textarea></div>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="notify"> আবেদনকারীকে জানান (এসএমএস + ই-মেইল)</label>
          <div class="text-xs text-slate-500">সাক্ষাৎকারের তারিখ বদলালে এসএমএস যাবে।</div>
          <button class="btn btn-primary w-full">${icon('save')} সংরক্ষণ করুন</button></fieldset></form>`,
    });
    $('#app-form').addEventListener('submit', e => {
      e.preventDefault(); const d = formData(e.target);
      if (d.status === 'Interview' && !d.interviewDate) return toast('সাক্ষাৎকার ধাপের জন্য একটি সাক্ষাৎকারের তারিখ নির্ধারণ করুন।', 'error');
      const sn = DB.s.school.shortName, title = j?.title || 'পদটি';
      const oldStatus = a.status, oldDate = a.interviewDate || '';
      a.status = d.status; a.notes = d.notes; a.interviewDate = d.interviewDate || null;
      const tag = { tag: `job:${a.id}` };
      if (a.interviewDate && a.interviewDate !== oldDate) {
        const when = `${U.dayBn(new Date(a.interviewDate))}, ${U.fmtTime(a.interviewDate)}`;
        this.send(a.phone, `${sn}: প্রিয় ${a.name}, ${title} পদের সাক্ষাৎকারের জন্য আপনাকে ${when} তারিখে ${this.campusName(j?.campusId) || DB.s.school.nameBn || DB.s.school.name}-এ আমন্ত্রণ জানানো হচ্ছে। রেফারেন্স ${a.id}। অনুগ্রহ করে মূল সনদপত্র সঙ্গে আনুন।`, 'SMS', tag);
        DB.audit('INTERVIEW_SCHEDULED', 'jobApplications', `${a.id} ${a.name} — ${a.interviewDate}`);
      }
      if (e.target.notify.checked && a.status !== oldStatus) {
        const text = { Shortlisted: `${title} পদের জন্য আপনাকে সংক্ষিপ্ত তালিকাভুক্ত করা হয়েছে। সাক্ষাৎকারের বিস্তারিত জানিয়ে আপনার সাথে যোগাযোগ করা হবে।`, Rejected: `${title} পদে আবেদন করার জন্য ধন্যবাদ। দুঃখের সাথে জানাচ্ছি যে আপনার আবেদনটি আর বিবেচনা করা সম্ভব হচ্ছে না।`, Hired: `অভিনন্দন! ${title} পদের জন্য আপনি নির্বাচিত হয়েছেন। মানবসম্পদ বিভাগ নিয়োগপত্রসহ আপনার সাথে যোগাযোগ করবে।`, Interview: `${title} পদের জন্য আপনার সাক্ষাৎকার নির্ধারিত হয়েছে। বিস্তারিত জানতে এসএমএস দেখুন।`, New: `${title} পদের জন্য আপনার আবেদনটি পর্যালোচনাধীন।` }[a.status];
        this.send(a.phone, `${sn}: প্রিয় ${a.name}, ${text} রেফারেন্স ${a.id}।`, 'SMS', tag);
        this.send(a.email, `প্রিয় ${a.name},\n\n${text}\n\nরেফারেন্স: ${a.id}\n${this.schoolName()}`, 'Email', tag);
      }
      DB.audit('APPLICANT_UPDATE', 'jobApplications', `${a.id} ${a.name}: ${bn(oldStatus)} → ${bn(a.status)}`); DB.save();
      Modal.close(); toast('আবেদনকারীর তথ্য আপডেট করা হয়েছে।', 'success'); App.refresh();
    });
  },
  recruitmentPage() {
    const cp = DB.campusId();
    const jobs = (DB.s.jobs || []).filter(j => j.campusId === 'ALL' || j.campusId === cp).sort((a, b) => (a.status === 'Open' ? 0 : 1) - (b.status === 'Open' ? 0 : 1) || b.postedOn.localeCompare(a.postedOn));
    const ids = jobs.map(j => j.id), apps = (DB.s.jobApplications || []).filter(a => ids.includes(a.jobId));
    if (!App.ui.recJob || !ids.includes(App.ui.recJob)) App.ui.recJob = jobs[0]?.id || null;
    const j = this.job(App.ui.recJob), canE = App.perm('hr', 'edit');
    const fs = App.ui.recSt || '';
    const pipe = j ? this.appsOf(j.id) : [];
    const rows = pipe.filter(a => !fs || a.status === fs).sort((a, b) => JOB_STATUSES.indexOf(a.status) - JOB_STATUSES.indexOf(b.status) || b.appliedAt.localeCompare(a.appliedAt));
    return pageHeader('নিয়োগ', multiCampus() ? esc(DB.campus().name) : '',`<a class="btn btn-ghost" href="${App.href('public', 'careers')}" target="_blank">${icon('external-link')} পাবলিক ক্যারিয়ার পৃষ্ঠা</a>${canE ? `<button class="btn btn-primary" onclick="Comms.editJob()">${icon('plus')} নতুন নিয়োগ নোটিশ</button>` : ''}`)
      + (DB.s.featureFlags.careers === false ? `<div class="mb-4 rounded-lg bg-amber-50 text-amber-800 text-sm p-3"><b>careers</b> ফিচার ফ্ল্যাগ বন্ধ — পাবলিক ক্যারিয়ার পৃষ্ঠাটি লুকানো রয়েছে।</div>` : '')
      + `<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">${kpi('চলমান শূন্যপদ', bnNum(jobs.filter(x => this.jobOpen(x)).length), `মোট ${bnNum(jobs.length)}`, 'briefcase', 'blue')}${kpi('আবেদনকারী', bnNum(apps.length), `${bnNum(apps.filter(a => a.status === 'New').length)} জন নতুন`, 'users', 'violet')}${kpi('সাক্ষাৎকার', bnNum(apps.filter(a => a.status === 'Interview').length), `${bnNum(apps.filter(a => a.status === 'Interview' && a.interviewDate >= U.today()).length)}টি আসন্ন`, 'calendar-clock', 'amber')}${kpi('নিয়োগপ্রাপ্ত', bnNum(apps.filter(a => a.status === 'Hired').length), 'এই নিয়োগচক্রে', 'badge-check', 'green')}</div>
      <div class="grid lg:grid-cols-3 gap-5">
        <div class="space-y-2">${jobs.map(x => { const n = this.appsOf(x.id); return `<button class="card p-3 w-full text-left ${x.id === App.ui.recJob ? 'ring-2 ring-brand-500' : 'hover:border-brand-300'}" onclick="App.ui.recJob='${esc(x.id)}';App.ui.recSt='';App.refresh()">
          <div class="flex items-start gap-2"><div class="flex-1 min-w-0"><div class="font-semibold text-sm truncate">${esc(x.title)}</div><div class="text-xs text-slate-500">${[x.department, bn(x.type), this.campusName(x.campusId)].filter(Boolean).map(esc).join(' · ')}</div></div>${badge(x.status === 'Open' && !this.jobOpen(x) ? 'শেষ তারিখ পেরিয়ে গেছে' : bn(x.status), x.status === 'Open' && this.jobOpen(x) ? 'green' : 'slate')}</div>
          <div class="text-xs text-slate-500 mt-1.5">${bnNum(n.length)} জন আবেদনকারী · ${bnNum(n.filter(a => a.status === 'New').length)} জন নতুন · শেষ তারিখ ${U.fmtDate(x.deadline)}</div></button>`; }).join('') || `<div class="card">${emptyState('এখনো কোনো নিয়োগ নোটিশ নেই।', 'briefcase')}</div>`}</div>
        <div class="lg:col-span-2">${j ? `<div class="card p-4 mb-4"><div class="flex flex-wrap items-start gap-2"><div class="flex-1 min-w-0"><div class="font-bold">${esc(j.title)}</div><div class="text-xs text-slate-500">${esc(j.id)} · প্রকাশ ${U.fmtDate(j.postedOn)} · ${bnNum(+j.vacancies || 1)}টি শূন্যপদ · ${esc(j.salaryRange || '')}</div></div>
            ${canE ? `<button class="btn btn-ghost btn-sm" onclick="Comms.editJob('${esc(j.id)}')">${icon('pencil')} এডিট</button>${j.status === 'Open' ? `<button class="btn btn-ghost btn-sm text-red-600" onclick="Comms.setJobStatus('${esc(j.id)}','Closed')">${icon('lock')} বন্ধ করুন</button>` : `<button class="btn btn-ghost btn-sm" onclick="Comms.setJobStatus('${esc(j.id)}','Open')">${icon('unlock')} পুনরায় চালু করুন</button>`}` : ''}</div>
            <div class="flex flex-wrap gap-1.5 mt-3">${['', ...JOB_STATUSES].map(s => { const c = s ? pipe.filter(a => a.status === s).length : pipe.length; return `<button class="btn btn-sm ${s === fs ? 'btn-primary' : 'btn-ghost'}" onclick="App.ui.recSt='${s}';App.refresh()">${s ? bn(s) : 'সকল'} <span class="opacity-70">${bnNum(c)}</span></button>`; }).join('')}</div></div>
          <div class="card scroll-x"><table class="table"><thead><tr><th>আবেদনকারী</th><th>শিক্ষাগত যোগ্যতা</th><th>অভিজ্ঞতা</th><th>আবেদনের তারিখ</th><th>অবস্থা</th><th>সাক্ষাৎকার</th><th class="text-right"></th></tr></thead><tbody>
          ${rows.map(a => `<tr><td><div class="font-semibold text-sm">${esc(a.name)}</div><div class="text-xs text-slate-500">${esc(a.phone)} · ${esc(a.email)}</div></td><td class="text-xs max-w-[200px]">${esc(a.qualification)}</td><td class="text-sm">${bnNum(+a.experienceYears || 0)} বছর</td><td class="text-xs whitespace-nowrap">${U.fmtDate(a.appliedAt)}</td>
            <td>${canE ? `<select class="select !py-1 !w-auto text-xs" onchange="Comms.setAppStatus('${esc(a.id)}',this.value)">${JOB_STATUSES.map(s => `<option value="${s}" ${s === a.status ? 'selected' : ''}>${bn(s)}</option>`).join('')}</select>` : badge(bn(a.status), this.statusTone(a.status))}</td>
            <td class="text-xs whitespace-nowrap">${a.interviewDate ? U.fmtTime(a.interviewDate) : '—'}</td>
            <td class="text-right whitespace-nowrap"><button class="btn btn-ghost btn-sm" title="জীবনবৃত্তান্ত দেখুন" onclick="Comms.viewCv('${esc(a.id)}')">${icon('file-text')}</button><button class="btn btn-ghost btn-sm" onclick="Comms.openApp('${esc(a.id)}')">${icon('clipboard-pen')} পর্যালোচনা করুন</button></td></tr>`).join('') || `<tr><td colspan="7">${emptyState('এই ধাপে কোনো আবেদনকারী নেই।', 'users')}</td></tr>`}
          </tbody></table></div>` : `<div class="card">${emptyState('একটি নিয়োগ নোটিশ নির্বাচন বা তৈরি করুন।', 'briefcase')}</div>`}</div>
      </div>`;
  },
};

/* ---------------- seeders ---------------- */
DB.addSeeder('gateways', () => ({
  sms: { provider: '', senderId: '', username: '', apiKeyMasked: '', endpoint: '', active: false },
  email: { host: '', port: 587, security: 'TLS', username: '', passwordMasked: '', fromName: '', fromEmail: '', active: false },
  push: { provider: '', projectId: '', serverKeyMasked: '', active: false },
  updatedAt: null,
}));
DB.addSeeder('jobs', () => []);
DB.addSeeder('jobApplications', () => []);
/** One-time migration of existing notices: ticker / channel / audience fields. */
DB.addSeeder('commsSeeded', s => {
  const cut = U.iso(U.addDays(new Date(), -14));
  (s.notices || []).forEach(n => {
    if (n.ticker === undefined) n.ticker = !!n.pinned || n.date >= cut;
    if (!n.channels) n.channels = ['Website'];
    if (!n.audience) n.audience = 'Everyone';
    if (n.expires === undefined) n.expires = null;
  });
  return true;
});

/* ---------------- pages ---------------- */
const commsNoticesPage = { id: 'notices', label: 'নোটিশ ও সার্কুলার', icon: 'megaphone', module: 'comms', render: () => Comms.noticesPage() };
App.addPage('principal', commsNoticesPage, 'sos');
App.addPage('admin', commsNoticesPage, 'audit');
App.addPage('admin', { id: 'messages', label: 'বার্তা লগ', icon: 'mail-search', module: 'comms', render: () => Comms.messagesPage() }, 'notices');
App.addPage('admin', { id: 'gateways', label: 'বার্তা গেটওয়ে', icon: 'radio-tower', module: 'system', render: () => Comms.gatewaysPage(), mount: () => Comms.gatewaysMount() }, 'system');

const commsRecruitPage = { id: 'recruitment', label: 'নিয়োগ', icon: 'briefcase', module: 'hr', flag: 'careers', render: () => Comms.recruitmentPage(), count: () => (DB.s.jobApplications || []).filter(a => a.status === 'New').length };
App.addPage('principal', commsRecruitPage, 'staff');
App.addPage('admin', commsRecruitPage);

App.addPage('public', { id: 'careers', label: 'ক্যারিয়ার', icon: 'briefcase', flag: 'careers', render: () => Comms.careersPage(), mount: () => Comms.careersMount() });
if (!App.portals.public.nav.some(([p]) => p === 'careers')) App.portals.public.nav.push(['careers', 'ক্যারিয়ার']);
