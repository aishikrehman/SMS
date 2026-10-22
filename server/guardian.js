/* Guardian desk (student profile guardian card, user profile, user management). Staff with students: edit,
   the Principal or the Root User; every action is audited.
     POST /api/guardian/save     { studentId, userId?, name, nameBn, phone, email, nid, address, occupation, relation, primary }
                                  link an existing account (it gets the GUARDIAN role on the same account), create a
                                  new guardian, or edit a linked guardian's details and relation
     POST /api/guardian/info     { userId, name, nameBn, phone, email, nid, address, occupation }   details only
     POST /api/guardian/relation { studentId, userId, relation }
     POST /api/guardian/primary  { studentId, userId }
     POST /api/guardian/unlink   { studentId, userId }
     POST /api/guardian/replace  { studentId, oldUserId, userId? | new details }   one step; relation and primary kept
     POST /api/guardian/remove   { userId, mode: 'role' | 'deactivate' | 'delete' }   unlinks every child first
   Details of an account that also has other roles: only the Root User or staff with users: edit.
   Granting GUARDIAN never touches the account's password or other roles. A new guardian gets a sign-in
   (user ID = password = mobile, changed at first sign-in) only while guardian accounts are on. */
'use strict';
const { hashPassword } = require('./lib/password');
const { appendAudit } = require('./public');
const bin = require('./bin');

const RELATIONS = ['Father', 'Mother', 'Guardian', 'Other'];
const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const digits = v => String(v || '').replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d)).replace(/[\s-]/g, '').replace(/^\+?88/, '');
const R = (status, body) => ({ status, body });

module.exports = function makeGuardian(state) {
  const ctxOf = uid => state.context(uid);
  const allowed = uid => { const c = ctxOf(uid); return !!c && (c.root || (c.staff && (c.privileged || c.perm('students', 'edit')))); };
  const rolesOf = id => (state.get('userRoles') || []).filter(x => x.userId === id).map(x => x.role);
  const isGuardianOnly = id => { const r = rolesOf(id); return r.includes('GUARDIAN') && r.every(x => x === 'GUARDIAN'); };
  /** May this viewer change this account's details? Guardian-only: guardian-desk staff; otherwise Root / users: edit. */
  const canEditUser = (uid, id) => { const c = ctxOf(uid); if (!c) return false; if (rolesOf(id).some(r => r === 'ADMIN' || r === 'SUPERADMIN') && !c.root) return false; return isGuardianOnly(id) ? allowed(uid) : (c.root || c.perm('users', 'edit')); };
  const audit = (get, uid, ip, action, detail) => appendAudit(get('audit'), { role: 'SYSTEM', action, entity: 'students', detail }, ip, uid);
  const student = id => (state.get('students') || []).find(s => s && s.id === id);
  const safe = u => { if (!u) return u; const { pwHash: _, demoKey: __, ...x } = u; return x; };
  const linksOf = (L, sid) => L.filter(l => l.studentId === sid);

  /** Clean the detail fields; returns { v } or { error }. */
  function details(b) {
    const v = { name: str(b.name, 120), nameBn: str(b.nameBn, 120), phone: digits(str(b.phone, 20)), email: str(b.email, 120).toLowerCase(), nid: digits(str(b.nid, 20)), address: str(b.address, 300), occupation: str(b.occupation, 120) };
    if (!v.name && !v.nameBn) return { error: 'name' };
    if (!/^01[3-9]\d{8}$/.test(v.phone)) return { error: 'phone' };
    if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return { error: 'email' };
    if (v.nid && !/^(\d{10}|\d{13}|\d{17})$/.test(v.nid)) return { error: 'nid' };
    return { v };
  }
  const phoneTaken = (phone, exceptId) => (state.get('users') || []).some(u => u.id !== exceptId && (u.username === phone || (u.phone === phone && isGuardianOnly(u.id))));
  const applyDetails = (u, v) => ({ ...u, name: v.name || u.name, nameBn: v.nameBn || u.nameBn, phone: v.phone, email: v.email, nid: v.nid, address: v.address, occupation: v.occupation, ...(u.username === u.phone && isGuardianOnly(u.id) ? { username: v.phone } : {}) });

  /** A new guardian-only account (not yet stored). */
  async function newGuardian(uid, v) {
    const users = state.get('users') || [], on = (state.get('featureFlags') || {}).guardianAccounts !== false;
    void users;
    const u = { id: null, name: v.name || v.nameBn, nameBn: v.nameBn || v.name, username: v.phone, phone: v.phone, email: v.email, nid: v.nid, address: v.address, occupation: v.occupation, active: on, createdAt: new Date().toISOString(), createdBy: uid, photo: null };
    if (on) { u.pwHash = await hashPassword(v.phone); u.pwDefault = true; u.mustChange = true; }
    return u;
  }
  /** Resolve the guardian for save / replace: { target, created, edit, v } or { error, status }. */
  async function resolve(uid, b) {
    const users = state.get('users') || [];
    let target = b.userId ? users.find(u => u.id === b.userId) : null;
    if (b.userId && !target) return { status: 404, error: 'user_not_found' };
    const wantsEdit = !target || ['name', 'nameBn', 'phone', 'email', 'nid', 'address', 'occupation'].some(k => k in b && str(b[k], 300) !== str(target[k], 300));
    let v = null;
    if (!target || (wantsEdit && canEditUser(uid, target.id))) { const d = details(b); if (d.error) return { status: 400, error: d.error }; v = d.v; }
    if (!target) target = users.find(u => u.phone === v.phone && isGuardianOnly(u.id)) || null;
    if (target && v && !canEditUser(uid, target.id)) v = null;   // link only; details stay
    // only the Root User adds a role to a Root User account
    if (target && !rolesOf(target.id).includes('GUARDIAN') && rolesOf(target.id).some(x => x === 'ADMIN' || x === 'SUPERADMIN') && !ctxOf(uid).root) return { status: 403, error: 'forbidden' };
    if (target && v && phoneTaken(v.phone, target.id)) return { status: 409, error: 'phone_taken' };
    let created = null;
    if (!target) { if (phoneTaken(v.phone)) return { status: 409, error: 'phone_taken' }; created = await newGuardian(uid, v); }
    return { target, created, v };
  }
  /** users / userRoles after linking `r` (adds the account, its details or the GUARDIAN role as needed). */
  function writeUser(get, r) {
    const U = get('users') || []; let roles = get('userRoles') || [], users = U, out;
    let meta;
    if (r.created) {
      // the same id sequence as the browser (meta.seq, DB.id), so ids never collide with records made in the app
      const m = get('meta') || {}, used = new Set(U.map(u => u.id)); let seq = Math.max(+m.seq || 1000, ...U.map(u => +(String(u.id).match(/^U(\d+)$/) || [])[1] || 0));
      do seq++; while (used.has(`U${String(seq).padStart(4, '0')}`));
      r.created.id = `U${String(seq).padStart(4, '0')}`; meta = { ...m, seq };
      users = [...U, r.created]; roles = [...roles, { userId: r.created.id, role: 'GUARDIAN' }]; out = r.created;
    }
    else {
      users = r.v ? U.map(u => (u.id === r.target.id ? (out = applyDetails(u, r.v)) : u)) : U; out = out || U.find(u => u.id === r.target.id);
      if (!roles.some(x => x.userId === out.id && x.role === 'GUARDIAN')) roles = [...roles, { userId: out.id, role: 'GUARDIAN' }];
    }
    return { users, userRoles: roles, out, extra: meta ? { meta } : {} };
  }

  async function save(uid, b, ip) {
    if (!allowed(uid)) return R(403, { error: 'forbidden' });
    b = b || {}; const st = student(str(b.studentId, 40)); if (!st) return R(404, { error: 'student_not_found' });
    const relation = RELATIONS.includes(b.relation) ? b.relation : 'Guardian';
    const r = await resolve(uid, b); if (r.error) return R(r.status, { error: r.error });
    let out = null;
    await state.mutate(get => {
      const w = writeUser(get, r), L = get('guardianLinks') || []; out = w.out;
      const gid = out.id, old = L.find(l => l.studentId === st.id && l.guardianUserId === gid) || {};
      const primary = b.primary === true || (b.primary !== false && !!old.primary) || !L.some(l => l.studentId === st.id && l.guardianUserId !== gid);
      let links = L.filter(l => !(l.studentId === st.id && l.guardianUserId === gid));
      if (primary) links = links.map(l => (l.studentId === st.id && l.primary ? { ...l, primary: false } : l));
      links.push({ ...old, guardianUserId: gid, studentId: st.id, relation, primary });
      return { ...w.extra, users: w.users, userRoles: w.userRoles, guardianLinks: links, audit: audit(get, uid, ip, r.created ? 'GUARDIAN_CREATE' : 'GUARDIAN_LINK', `${st.id} ← ${out.nameBn || out.name} (${out.id}) · ${relation}`) };
    }, uid);
    return R(200, { ok: true, created: !!r.created, user: safe(out) });
  }

  async function info(uid, b, ip) {
    b = b || {}; const id = str(b.userId, 40), u = (state.get('users') || []).find(x => x.id === id);
    if (!u || !rolesOf(id).includes('GUARDIAN')) return R(404, { error: 'not_found' });
    if (!allowed(uid) || !canEditUser(uid, id)) return R(403, { error: 'forbidden' });
    const d = details(b); if (d.error) return R(400, { error: d.error });
    if (phoneTaken(d.v.phone, id)) return R(409, { error: 'phone_taken' });
    let out = null;
    await state.mutate(get => ({ users: (get('users') || []).map(x => (x.id === id ? (out = applyDetails(x, d.v)) : x)), audit: audit(get, uid, ip, 'GUARDIAN_INFO', `${id}: ${d.v.nameBn || d.v.name} · ${d.v.phone}`) }), uid);
    return R(200, { ok: true, user: safe(out) });
  }

  async function relation(uid, b, ip) {
    if (!allowed(uid)) return R(403, { error: 'forbidden' });
    const sid = str(b?.studentId, 40), gid = str(b?.userId, 40), rel = RELATIONS.includes(b?.relation) ? b.relation : null;
    if (!rel || !(state.get('guardianLinks') || []).some(l => l.studentId === sid && l.guardianUserId === gid)) return R(404, { error: 'link_not_found' });
    await state.mutate(get => ({ guardianLinks: (get('guardianLinks') || []).map(l => (l.studentId === sid && l.guardianUserId === gid ? { ...l, relation: rel } : l)), audit: audit(get, uid, ip, 'GUARDIAN_RELATION', `${sid} · ${gid} → ${rel}`) }), uid);
    return R(200, { ok: true });
  }

  async function primary(uid, b, ip) {
    if (!allowed(uid)) return R(403, { error: 'forbidden' });
    const sid = str(b?.studentId, 40), gid = str(b?.userId, 40);
    if (!student(sid) || !(state.get('guardianLinks') || []).some(l => l.studentId === sid && l.guardianUserId === gid)) return R(404, { error: 'not_found' });
    await state.mutate(get => ({ guardianLinks: (get('guardianLinks') || []).map(l => (l.studentId === sid ? { ...l, primary: l.guardianUserId === gid } : l)), audit: audit(get, uid, ip, 'GUARDIAN_PRIMARY', `${sid} → ${gid}`) }), uid);
    return R(200, { ok: true });
  }

  /** Links without (studentId, gid); the child's first remaining guardian becomes primary when needed. */
  const without = (L, sid, gid) => {
    let out = L.filter(l => !(l.studentId === sid && l.guardianUserId === gid));
    if (!out.some(l => l.studentId === sid && l.primary)) { const i = out.findIndex(l => l.studentId === sid); if (i >= 0) out = out.map((l, j) => (j === i ? { ...l, primary: true } : l)); }
    return out;
  };

  async function unlink(uid, b, ip) {
    if (!allowed(uid)) return R(403, { error: 'forbidden' });
    const sid = str(b?.studentId, 40), gid = str(b?.userId, 40);
    if (!student(sid) || !(state.get('guardianLinks') || []).some(l => l.studentId === sid && l.guardianUserId === gid)) return R(404, { error: 'not_found' });
    let left = 0;
    await state.mutate(get => { const L = without(get('guardianLinks') || [], sid, gid); left = linksOf(L, sid).length; return { guardianLinks: L, audit: audit(get, uid, ip, 'GUARDIAN_UNLINK', `${sid} ✕ ${gid}${left ? '' : ' · কোনো অভিভাবক নেই'}`) }; }, uid);
    return R(200, { ok: true, left });
  }

  /** অভিভাবক বদল: the new guardian takes the old one's place (relation and primary kept), in one write. */
  async function replace(uid, b, ip) {
    if (!allowed(uid)) return R(403, { error: 'forbidden' });
    b = b || {}; const sid = str(b.studentId, 40), oldId = str(b.oldUserId, 40);
    const old = (state.get('guardianLinks') || []).find(l => l.studentId === sid && l.guardianUserId === oldId); if (!old) return R(404, { error: student(sid) ? 'link_not_found' : 'student_not_found' });
    if (b.userId === oldId) return R(400, { error: 'same' });
    const r = await resolve(uid, b); if (r.error) return R(r.status, { error: r.error });
    let out = null;
    await state.mutate(get => {
      const w = writeUser(get, r); out = w.out;
      const L = (get('guardianLinks') || []).filter(l => !(l.studentId === sid && (l.guardianUserId === oldId || l.guardianUserId === out.id)));
      L.push({ ...old, guardianUserId: out.id, relation: RELATIONS.includes(b.relation) ? b.relation : old.relation, primary: !!old.primary });
      return { ...w.extra, users: w.users, userRoles: w.userRoles, guardianLinks: L, audit: audit(get, uid, ip, 'GUARDIAN_REPLACE', `${sid}: ${oldId} → ${out.id}${r.created ? ' (নতুন)' : ''}`) };
    }, uid);
    return R(200, { ok: true, user: safe(out), created: !!r.created });
  }

  /** অপসারণ: unlink every child, then drop the GUARDIAN role (other roles kept) or deactivate / delete a
      guardian-only account (a deleted account goes to the recycle bin). */
  async function remove(uid, b, ip) {
    b = b || {}; const id = str(b.userId, 40), u = (state.get('users') || []).find(x => x.id === id), mode = b.mode;
    if (!u || !rolesOf(id).includes('GUARDIAN')) return R(404, { error: 'not_found' });
    if (!allowed(uid)) return R(403, { error: 'forbidden' });
    const only = isGuardianOnly(id), c = ctxOf(uid);
    if (only ? !['deactivate', 'delete'].includes(mode) : mode !== 'role') return R(400, { error: 'mode' });
    if (mode === 'delete' && !(c.root || c.privileged || c.perm('users', 'delete'))) return R(403, { error: 'forbidden' });
    if (id === uid) return R(400, { error: 'self' });
    const who = { uid, name: (state.user(uid) || {}).username || '', ip };
    await state.mutate(get => {
      let L = get('guardianLinks') || [];
      [...new Set(L.filter(l => l.guardianUserId === id).map(l => l.studentId))].forEach(sid => { L = without(L, sid, id); });
      const put = { guardianLinks: L };
      if (mode === 'role') put.userRoles = (get('userRoles') || []).filter(x => !(x.userId === id && x.role === 'GUARDIAN'));
      else if (mode === 'deactivate') put.users = (get('users') || []).map(x => (x.id === id ? { ...x, active: false } : x));
      else {
        put.users = (get('users') || []).filter(x => x.id !== id);
        put.userRoles = (get('userRoles') || []).filter(x => x.userId !== id);
        put[bin.KEY] = bin.add(get(bin.KEY), bin.entries([{ kind: 'record', recId: id, record: safe(u) }], 'users', who, 'G' + Date.now()));
      }
      put.audit = audit(get, uid, ip, 'GUARDIAN_REMOVE', `${id} (${u.nameBn || u.name}): ${mode === 'role' ? 'অভিভাবক ভূমিকা সরানো' : mode === 'deactivate' ? 'নিষ্ক্রিয়' : 'মুছে রিসাইকেল বিনে'}`);
      return put;
    }, uid);
    return R(200, { ok: true });
  }

  /* Searches run here, on the full stored data: the browser's copy may be role-filtered or not yet saved. */
  const norm = q => String(q || '').replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d)).trim().toLowerCase().slice(0, 60);
  function lookupUsers(uid, q) {
    if (!allowed(uid)) return R(403, { error: 'forbidden' });
    const n = norm(q), nd = n.replace(/[\s-]/g, '').replace(/^\+?88/, ''); if (n.length < 2) return R(200, { items: [] });
    const items = (state.get('users') || []).filter(u => u && [u.id, u.username, u.name, u.nameBn].some(x => String(x || '').toLowerCase().includes(n)) || (nd.length >= 3 && String(u.phone || '').includes(nd)))
      .slice(0, 12).map(u => ({ id: u.id, name: u.name, nameBn: u.nameBn, username: u.username, phone: u.phone || '', active: u.active !== false, roles: rolesOf(u.id), photo: u.photo || null }));
    return R(200, { items });
  }
  function lookupStudents(uid, q) {
    if (!allowed(uid)) return R(403, { error: 'forbidden' });
    const n = norm(q); if (!n) return R(200, { items: [] });
    const items = (state.get('students') || []).filter(s => s && s.status !== 'deleted' && (String(s.id).toLowerCase() === n || String(s.roll) === n || String(s.regNo || '').toLowerCase().includes(n) || String(s.name || '').toLowerCase().includes(n) || String(s.nameBn || '').includes(n)))
      .slice(0, 15).map(s => ({ id: s.id, name: s.name, nameBn: s.nameBn, classId: s.classId, section: s.section || '', roll: s.roll, photo: s.photo || null }));
    return R(200, { items });
  }

  return { save, info, relation, primary, unlink, replace, remove, lookupUsers, lookupStudents };
};
