/* Anonymous (not logged-in) access.

   publicView()  — the subset of the state a public-website visitor receives. Every key of the
                   state is present (so the browser's seeders don't recreate it), but anything not
                   on the allow-list is emptied ([] / {} / null). A few collections are redacted.
   lookup()      — small read endpoints for public flows that need one private record
                   (result look-up, verify, application/service tracking, service-desk identity,
                   job-application tracking). The browser merges the returned records into memory.
   submit()      — append-only writes from public flows (admission, service request, enquiry,
                   job application, password-help request) plus the audit/SMS lines and the
                   receipt voucher they create. Each item is validated; ids that collide are
                   re-numbered and the new ids returned. */
'use strict';
const crypto = require('node:crypto');
const { hash, asciiDigits } = require('./lib/hash');
const { hashPassword, weakness } = require('./lib/password');
const notify = require('./lib/notify');

/* Shared freely with every visitor. */
const PUBLIC_FULL = new Set([
  'meta', 'school', 'theme', 'site', 'campuses', 'sessions', 'activeSession', 'classes', 'subjects', 'levels', 'rooms',
  'feeConfigs', 'feeStructure', 'feeHeads', 'calendar', 'featureFlags', 'coupons', 'gradingSchemes', 'menus',
  'admissionForm', 'admissionRules', 'admissionTests', 'jobs', 'rbac', 'pageAccess', 'customRoles', 'homepage', 'pages',
]);

/* Optional public content (Root User → ফিচার ও সেটিংস → পাবলিক কনটেন্ট; config.publicSite, every switch off by default).
   Only the switched-on part leaves the server, and only the fields below. */
function publicSiteCfg(state) { const c = (state.get('config') || {}).publicSite || {}; return { syllabus: c.syllabus === true, materials: c.materials === true, library: c.library === true, studentAch: c.studentAch === true }; }
/** Institution achievements; student achievements copied into the list stay hidden unless the switch is on and consent is recorded. */
function pubInstAchievements(list, P) {
  return (Array.isArray(list) ? list : []).filter(a => a && a.show !== false && (a.kind !== 'student' || (P.studentAch && a.consent === true)))
    .map(a => pick(a, ['id', 'kind', 'title', 'year', 'level', 'text', 'image', 'studentName', 'className', 'date', 'order']));
}
/** Syllabus: chapter and topic names per class and subject (no teacher, no progress). */
function pubSyllabus(list) {
  // per subject "পাবলিক" switch: a record with public === false stays off the website
  return (Array.isArray(list) ? list : []).filter(s => s && s.classId && s.subjectId && s.public !== false).map(s => ({ id: s.id, classId: s.classId, subjectId: s.subjectId,
    chapters: (s.chapters || []).map(c => ({ name: c.name, examId: c.examId || null, no: c.no || '', outcomes: c.outcomes || '', periods: c.periods || '', month: c.month || '', book: c.book || '', topics: (c.topics || []).map(t => ({ name: t && t.name })).filter(t => t.name) })) }));
}
/** Study materials the teacher marked "পাবলিক". */
function pubMaterials(list) { return (Array.isArray(list) ? list : []).filter(m => m && m.public === true).map(m => pick(m, ['id', 'classId', 'subjectId', 'title', 'type', 'note', 'date', 'url', 'fileName', 'fileType', 'dataUrl', 'public'])); }
/** Book catalogue with availability counts; never loans or borrowers. */
function pubLibrary(lib) {
  const loans = (lib && Array.isArray(lib.loans) ? lib.loans : []).filter(l => l && !l.returned), out = new Map();
  for (const l of loans) out.set(l.bookId, (out.get(l.bookId) || 0) + 1);
  return { books: (lib && Array.isArray(lib.books) ? lib.books : []).map(b => ({ ...pick(b, ['id', 'title', 'author', 'publisher', 'year', 'category', 'subject', 'shelf', 'copies', 'campusId', 'isbn']), avail: Math.max(0, (+b.copies || 0) - (out.get(b.id) || 0)) })) };
}

const empty = v => (Array.isArray(v) ? [] : v && typeof v === 'object' ? {} : (typeof v === 'boolean' || typeof v === 'number') ? v : null);
const pick = (o, keys) => { const r = {}; for (const k of keys) if (o && o[k] !== undefined) r[k] = o[k]; return r; };

/** Public fields of a student (`full` adds parents' names for an own-result marksheet). */
function pubStudent(st, full) {
  if (!st) return null;
  return pick(st, ['id', 'userId', 'name', 'nameBn', 'classId', 'section', 'roll', 'status', 'photo', 'batchId', 'stream', 'shift',
    ...(full ? ['regNo', 'fatherName', 'fatherNameBn', 'motherName', 'motherNameBn', 'dob', 'admissionDate'] : [])]);
}
function pubTeacher(t) { return pick(t, ['id', 'userId', 'campusId', 'dept', 'designation', 'subjects', 'isHead', 'qualification', 'bio', 'showContact', 'status', 'joinDate', 'experienceYears', 'assignments']); }

/* Public faculty directory: the Root User / Principal choose which teacher fields are public
   (site.faculty.fields; see js/modules/teacherpage.js). A field switched off never leaves the server. */
const FAC_FIELDS = { photo: true, designation: true, dept: true, subjects: true, classes: true, qualification: true, experience: true, bio: true, contact: true, joinDate: false };
function facultyFields(state) { const f = ((state.get('site') || {}).faculty || {}).fields || {}; const o = {}; for (const k of Object.keys(FAC_FIELDS)) o[k] = typeof f[k] === 'boolean' ? f[k] : FAC_FIELDS[k]; return o; }
function pubTeacherFor(t, F) {
  const r = pubTeacher(t);
  if (!F.designation) delete r.designation; if (!F.dept) delete r.dept; if (!F.subjects) delete r.subjects; if (!F.classes) delete r.assignments;
  if (!F.qualification) delete r.qualification; if (!F.experience) delete r.experienceYears; if (!F.bio) delete r.bio; if (!F.joinDate && !F.experience) delete r.joinDate;
  if (!F.contact) r.showContact = false;
  if (Array.isArray(r.assignments)) r.assignments = r.assignments.filter(a => a && a.classId).map(a => ({ classId: a.classId, subjectId: a.subjectId }));
  return r;
}
function pubInvoice(i) { return pick(i, ['id', 'studentId', 'item', 'amount', 'status', 'due', 'month', 'kind']); }
function noFiles(o) { const r = { ...o }; for (const k of ['attachment', 'documents', 'docs', 'photoData', 'cv']) delete r[k]; return r; }
function pubAdmission(a) { const r = noFiles(a); delete r.birthRegNo; delete r.nid; delete r.fatherNid; delete r.motherNid; return r; }

function publicNotice(n, today) {
  return (!n.expires || n.expires >= today) && (!n.channels || n.channels.includes('Website'))
    && (!n.audience || ['Everyone', 'Guardians', 'Students'].includes(n.audience) || String(n.audience).startsWith('Campus:'));
}

/** The state an anonymous visitor receives. */
function publicView(state) {
  const out = {}, today = new Date().toISOString().slice(0, 10);
  for (const k of state.keys()) {
    const v = state.get(k);
    out[k] = PUBLIC_FULL.has(k) ? v : empty(v);
  }
  // Notices: only those meant for the website.
  out.notices = (state.get('notices') || []).filter(n => publicNotice(n, today));
  // Exams: the timetable is public; question papers/solutions never are.
  out.exams = (state.get('exams') || []).map(e => { const r = { ...e }; delete r.papers; delete r.solutions; delete r.questions; return r; });
  // Teachers: public directory fields; their users: name/photo (+ contact when the teacher allows it).
  const teachers = (state.get('teachers') || []).filter(t => t.status !== 'Resigned'), F = facultyFields(state);
  out.teachers = teachers.map(t => pubTeacherFor(t, F));
  const users = new Map();
  for (const t of teachers) {
    const u = state.user(t.userId); if (!u) continue;
    users.set(u.id, { id: u.id, name: u.name, nameBn: u.nameBn, photo: F.photo ? u.photo || null : null, username: '', loginPolicy: 'v1', active: true,
      ...(F.contact && t.showContact !== false ? { email: u.email || '', phone: u.phone || '' } : {}) });
  }
  out.users = [...users.values()];
  out.userRoles = (state.get('userRoles') || []).filter(r => users.has(r.userId));
  // Optional public content (each off by default).
  const P = publicSiteCfg(state), ff = state.get('featureFlags') || {};
  out.instAchievements = pubInstAchievements(state.get('instAchievements'), P);
  // campus map (buildings, floors, rooms): only while the Root User has switched it on
  const rl = state.get('roomLayout'); out.roomLayout = rl && rl.show === true ? rl : { show: false, campuses: {} };
  if (P.syllabus) { out.syllabus = pubSyllabus(state.get('syllabus')); out.examSyllabus = (state.get('examSyllabus') || []).map(n => pick(n, ['examId', 'classId', 'subjectId', 'text'])); }
  if (P.materials && ff.studyMaterials !== false) out.materials = pubMaterials(state.get('materials'));
  if (P.library && ff.library !== false) out.library = pubLibrary(state.get('library'));
  // Admissions: id/class/status only — enough for application numbering and test rolls.
  out.admissions = (state.get('admissions') || []).map(a => pick(a, ['id', 'classId', 'campusId', 'status', 'session', 'testRoll']));
  // Configuration minus secrets.
  const cfg = state.get('config');
  if (cfg && typeof cfg === 'object') {
    out.config = JSON.parse(JSON.stringify(cfg)); if (out.config.registry) delete out.config.registry.apiKey;
    if (out.config.payGw) { delete out.config.payGw.secret; delete out.config.payGw.apiKey; }
    if (out.config.publicResult) out.config.publicResult = publicResultView(out.config.publicResult, state);
  }
  return out;
}

/* ---------- public results: configuration and aggregate statistics ----------
   config.publicResult = { fields: { exam|session|cls|section|group|roll|reg|sid|dob|phone: 'off'|'opt'|'req' }, phoneDigits,
     card: {…}, combined: {…}, stats: { on, blocks: {…} }, statsData: { examId: aggregate snapshot } }
   The snapshot holds counts only (it is computed in a staff browser with the same grading code as the marksheet).
   Visitors receive it only while statistics are on, only for published exams, only the blocks that are on,
   and never a group smaller than STATS_MIN examinees. */
const RES_FIELDS = ['exam', 'session', 'cls', 'section', 'group', 'roll', 'reg', 'sid', 'dob', 'phone'];
const RES_DEF = { exam: 'req', session: 'off', cls: 'req', section: 'off', group: 'off', roll: 'req', reg: 'req', sid: 'off', dob: 'off', phone: 'off' };
const STATS_MIN = 5;
/** Identifying strength of a field set: registration no., student ID, date of birth and guardian mobile count one each; roll counts only together with the class. */
function resultStrength(f) { return ['reg', 'sid', 'dob', 'phone'].filter(k => f[k] === 'req').length + (f.roll === 'req' && f.cls === 'req' ? 1 : 0); }
function resultFields(state) {
  const c = (state.get('config') || {}).publicResult || {}, f = {};
  for (const k of RES_FIELDS) { const v = c.fields && c.fields[k]; f[k] = ['off', 'opt', 'req'].includes(v) ? v : RES_DEF[k]; }
  // a configuration that identifies a student by fewer than two identifiers is never used
  return resultStrength(f) >= 2 ? f : { ...RES_DEF };
}
const num = v => (Number.isFinite(+v) ? +v : 0);
const pct = (a, n) => (num(n) ? Math.round(num(a) / num(n) * 1000) / 10 : 0);
function cleanGroup(g) { return { n: num(g.n), passPct: pct(g.pass, g.n), top: num(g.top) }; }
function publicResultView(pr, state) {
  const out = { fields: resultFields(state), phoneDigits: Math.max(4, Math.min(6, +pr.phoneDigits || 4)), card: pr.card || {}, combined: pr.combined || {}, stats: pr.stats || {} };
  const blocks = (pr.stats && pr.stats.blocks) || {}, on = k => blocks[k] !== false;
  if (!(pr.stats && pr.stats.on) || !pr.statsData || typeof pr.statsData !== 'object') return out;
  const published = new Set((state.get('exams') || []).filter(e => e.published).map(e => e.id)), data = {};
  for (const [exId, s] of Object.entries(pr.statsData)) {
    if (!published.has(exId) || !s || typeof s !== 'object') continue;
    const small = num(s.n) < STATS_MIN, x = { at: String(s.at || '').slice(0, 30), combined: !!s.combined, topLabel: String(s.topLabel || '').slice(0, 20), min: STATS_MIN };
    if (on('examinees')) x.n = num(s.n);
    if (!small) {
      if (on('passRate')) x.passPct = pct(s.pass, s.n);
      if (on('aplus')) x.top = num(s.top);
      if (on('grades') && Array.isArray(s.grades)) x.grades = s.grades.filter(g => Array.isArray(g)).map(([l, c]) => [String(l).slice(0, 20), num(c)]);
      if (on('subjects') && Array.isArray(s.subjects)) x.subjects = s.subjects.filter(r => r && num(r.n) >= STATS_MIN).map(r => ({ id: String(r.id || '').slice(0, 30), name: String(r.name || '').slice(0, 80), passPct: pct(r.pass, r.n) }));
      if (on('breakdown') && Array.isArray(s.classes)) x.classes = s.classes.filter(c => c && num(c.n) >= STATS_MIN).map(c => ({ id: String(c.id || '').slice(0, 30), name: String(c.name || '').slice(0, 80), ...cleanGroup(c),
        sections: (Array.isArray(c.sections) ? c.sections : []).filter(g => g && num(g.n) >= STATS_MIN).map(g => ({ name: String(g.name || '').slice(0, 40), ...cleanGroup(g) })),
        groups: (Array.isArray(c.groups) ? c.groups : []).filter(g => g && num(g.n) >= STATS_MIN).map(g => ({ name: String(g.name || '').slice(0, 40), ...cleanGroup(g) })) }));
    }
    data[exId] = x;
  }
  out.statsData = data;
  return out;
}

/* ---------- look-ups ---------- */
/** Verified identities from the public service desk: pubId → { sids:Set, exp }. */
const verified = new Map();
function verifiedSet(pubId) { const v = verified.get(pubId); if (!v || v.exp < Date.now()) return new Set(); return v.sids; }
function remember(pubId, sid) { const v = verified.get(pubId) && verified.get(pubId).exp > Date.now() ? verified.get(pubId) : { sids: new Set() }; v.sids.add(sid); v.exp = Date.now() + 30 * 60000; verified.set(pubId, v); }
setInterval(() => { const n = Date.now(); for (const [k, v] of verified) if (v.exp < n) verified.delete(k); }, 10 * 60000).unref();

/** Public result look-up. Exactly the configured identifiers are checked (config.publicResult.fields):
    every required one must be given and match, an optional one must match when given, the rest are ignored.
    Exactly one student must match. Nothing is revealed for fewer identifiers than configured. */
function resultLookup(state, body, { S, published, marksOf }) {
  if (state.get('featureFlags')?.publicResults === false) return { found: false };
  const f = resultFields(state), pr = (state.get('config') || {}).publicResult || {}, card = pr.card || {};
  const val = k => asciiDigits(body[k] == null ? '' : String(body[k])).trim().slice(0, 40);
  const given = k => f[k] !== 'off' && val(k) !== '';
  if (RES_FIELDS.some(k => f[k] === 'req' && !given(k))) return { found: false, reason: 'missing' };
  const up = v => String(v ?? '').trim().toUpperCase(), digits = Math.max(4, Math.min(6, +pr.phoneDigits || 4));
  const phones = s => [s.emergency, ...S('guardianLinks').filter(l => l.studentId === s.id).map(l => state.user(l.guardianUserId)?.phone)].map(p => String(p || '').replace(/\D/g, '')).filter(p => p.length >= digits);
  const ph = val('phone').replace(/\D/g, '');
  if (given('phone') && ph.length < digits) return { found: false, reason: 'missing' };
  const test = {
    cls: s => s.classId === val('cls'), section: s => up(s.section) === up(val('section')), group: s => up(s.stream) === up(val('group')),
    roll: s => String(s.roll) === String(+val('roll')), reg: s => up(s.regNo) === up(val('reg')), sid: s => up(s.id) === up(val('sid')),
    dob: s => String(s.dob || '').slice(0, 10) === val('dob'), phone: s => phones(s).some(p => p.slice(-digits) === ph.slice(-digits)),
  };
  const checks = Object.keys(test).filter(given);
  if (!checks.length) return { found: false, reason: 'missing' };
  const hits = S('students').filter(s => s && !String(s.id).startsWith('_') && checks.every(k => test[k](s)));
  if (hits.length !== 1) return { found: false };
  const s = hits[0];
  const exams = S('exams').filter(e => published.has(e.id) && (!given('session') || String(e.session) === val('session')) && (!e.classes || !e.classes.length || e.classes.includes(s.classId)));
  const hasMarks = e => S('marks').some(m => m.examId === e.id && m.studentId === s.id);
  const ex = given('exam') ? exams.find(e => e.id === val('exam')) : exams.filter(hasMarks).sort((a, b) => String(b.start || '').localeCompare(String(a.start || '')))[0];
  if (!ex || !hasMarks(ex)) return { found: false };
  // the exam's own marks plus the earlier exams it carries forward (combined result)
  const examIds = [ex.id, ...(Array.isArray(ex.combine) ? ex.combine.map(c => c && c.examId).filter(Boolean) : [])];
  const extra = {};
  if (card.attendance) {
    const vals = Object.values((state.get('attendance') || {})[s.id] || {}), c = { P: 0, A: 0, L: 0, E: 0 };
    vals.forEach(v => { c[v] = (c[v] || 0) + 1; });
    const counted = vals.length - c.E;
    extra.attendance = { days: vals.length, present: c.P + c.L, pct: counted ? (c.P + c.L) / counted * 100 : null };
  }
  if (card.remarks) { const r = ((state.get('examRemarks') || {})[ex.id] || {})[s.id]; if (r) extra.remark = String(typeof r === 'object' ? r.text || '' : r).slice(0, 600); }
  // Classmates as anonymous stand-ins (no name, no roll), so class position and averages stay correct.
  const needPeers = card.position !== false || card.download !== false;
  const peers = needPeers ? S('students').filter(x => x.classId === s.classId && x.id !== s.id) : [];
  const peerIds = new Map(peers.map((p, i) => [p.id, `_P${i + 1}`]));
  const peerMarks = S('marks').filter(m => examIds.includes(m.examId) && peerIds.has(m.studentId)).map(m => ({ ...m, studentId: peerIds.get(m.studentId) }));
  return {
    found: true, sid: s.id, examId: ex.id, extra,
    hydrate: {
      students: [pubStudent(s, card.download !== false), ...peers.map(p => ({ id: peerIds.get(p.id), name: '', classId: p.classId, section: p.section, stream: p.stream, status: p.status }))],
      marks: [...marksOf(s.id, [...new Set([...published, ...examIds])]), ...peerMarks],
    },
  };
}

function lookup(state, body, pubId) {
  const kind = String(body.kind || ''), S = k => state.get(k) || [];
  const st = id => state.student(id);
  const marksOf = (sid, examIds) => S('marks').filter(m => m.studentId === sid && (!examIds || examIds.includes(m.examId)));
  const published = new Set(S('exams').filter(e => e.published).map(e => e.id));

  if (kind === 'result') return resultLookup(state, body, { S, published, marksOf });

  if (kind === 'verify') {
    const code = String(body.code || '').trim(), C = code.toUpperCase(), type = String(body.type || '');
    const h = {};
    const addSt = (sid, full) => { const s = st(sid); if (s) (h.students = h.students || []).push(pubStudent(s, full)); return s; };
    if (type === 'application') {
      const hits = S('admissions').filter(a => String(a.id).toUpperCase() === C || a.guardianPhone === code);
      h.admissions = hits.map(pubAdmission); hits.forEach(a => a.studentId && addSt(a.studentId));
    } else if (type === 'tc') {
      h.certificates = S('certificates').filter(c => String(c.serial).toUpperCase() === C);
    } else if (type === 'marksheet') {
      const [reg, ex] = code.split('_'); const s = S('students').find(x => x.regNo === reg);
      if (s && published.has(ex)) { addSt(s.id); h.marks = marksOf(s.id, [ex]); }
    } else if (type === 'receipt') {
      h.payments = S('payments').filter(p => p.id === C).map(p => pick(p, ['id', 'studentId', 'amount', 'method', 'date', 'txn', 'verified', 'teller', 'channel', 'invoiceIds']));
      h.payments.forEach(p => addSt(p.studentId));
    } else if (type === 'service') {
      h.serviceRequests = S('serviceRequests').filter(r => r.id === C).map(noFiles); h.serviceRequests.forEach(r => addSt(r.studentId));
    } else if (type === 'voucher') {
      h.journal = S('journal').filter(v => v.id === C);
    } else if (type === 'plan') {
      h.installmentPlans = S('installmentPlans').filter(p => p.id === C); h.installmentPlans.forEach(p => addSt(p.studentId));
    } else if (type === 'admit') {
      const [reg, ex] = code.split('|'); const s = S('students').find(x => x.regNo === reg);
      if (s) { addSt(s.id); h.invoices = S('invoices').filter(i => i.studentId === s.id).map(pubInvoice); h.admitWaivers = S('admitWaivers').filter(w => w.studentId === s.id && w.examId === ex); }
    } else if (type === 'student' || type === 'invoice') {
      // ID card QR / manual entry: Student ID, or (students only) the registration number
      const byReg = type === 'student' && !st(C) ? S('students').find(x => String(x.regNo || '').toUpperCase() === C) : null;
      const s = addSt(byReg ? byReg.id : C);
      if (byReg && h.students) h.students[h.students.length - 1].regNo = byReg.regNo;   // the visitor typed it; lets the page match it
      if (s && type === 'invoice') h.invoices = S('invoices').filter(i => i.studentId === s.id).map(pubInvoice);
    } else if (type === 'employee') {
      const t = S('teachers').find(x => x.id === C);
      if (t) { h.teachers = [pubTeacherFor(t, facultyFields(state))]; const u = state.user(t.userId); if (u) h.users = [{ id: u.id, name: u.name, nameBn: u.nameBn, photo: u.photo || null, username: '', loginPolicy: 'v1', active: true }]; }
      const f = S('staff').find(x => x.id === C); if (f) h.staff = [pick(f, ['id', 'name', 'nameBn', 'designation', 'type', 'campusId', 'status', 'photo'])];
    }
    return { hydrate: h };
  }

  if (kind === 'identity') {
    const s = st(String(body.sid || '').trim().toUpperCase());
    const phone = String(body.phone || '').trim();
    const links = s ? S('guardianLinks').filter(l => l.studentId === s.id) : [];
    const ok = !!s && String(s.regNo) === String(body.reg || '').trim() && links.some(l => state.user(l.guardianUserId)?.phone === phone);
    if (!ok) return { ok: false };
    remember(pubId, s.id);
    return {
      ok: true,
      hydrate: {
        students: [pubStudent(s, false)],
        guardianLinks: links,
        users: links.map(l => { const u = state.user(l.guardianUserId); return u && { id: u.id, name: u.name, nameBn: u.nameBn, username: '', loginPolicy: 'v1', active: true, phone: u.phone === phone ? phone : '' }; }).filter(Boolean),
        serviceRequests: S('serviceRequests').filter(r => r.studentId === s.id).map(noFiles),
        invoices: S('invoices').filter(i => i.studentId === s.id).map(pubInvoice),
      },
    };
  }

  if (kind === 'service') {
    const r = S('serviceRequests').find(x => x.id.toUpperCase() === String(body.id || '').trim().toUpperCase());
    if (!r) return { hydrate: {} };
    const s = st(r.studentId);
    return { hydrate: { serviceRequests: [noFiles(r)], students: s ? [pubStudent(s, false)] : [] } };
  }

  /* Lost application form (লস্ট ফর্ম উদ্ধার): the applicant proves who they are with the guardian's mobile
     number + the date of birth, or with the birth registration number (+ date of birth when given).
     Rate-limited like every look-up (api.js: lookupWin, and lookupMiss for misses). Returns the
     application without uploaded files or NID numbers; the birth registration number is masked. */
  if (kind === 'appRecover') {
    const digits = v => asciiDigits(String(v || '')).replace(/\D/g, '');
    const phone = digits(body.phone).slice(-11), dob = String(body.dob || '').trim().slice(0, 10), brn = digits(body.brn);
    if (!((/^01\d{9}$/.test(phone) && /^\d{4}-\d{2}-\d{2}$/.test(dob)) || /^\d{17}$/.test(brn))) return { found: false, error: 'bad_input' };
    const hits = S('admissions').filter(a => a && a.status !== 'Draft' && (brn
      ? digits(a.birthRegNo) === brn && (!dob || a.dob === dob)
      : digits(a.guardianPhone).slice(-11) === phone && a.dob === dob)).slice(-5);
    if (!hits.length) return { found: false };
    return {
      found: true,
      hydrate: {
        admissions: hits.map(a => {
          const r = pubAdmission(a), b = digits(a.birthRegNo);
          if (b) r.birthRegNoMasked = b.slice(0, 4) + '•'.repeat(Math.max(0, b.length - 7)) + b.slice(-3);
          const ph = (a.docs || []).find(d => d && d.kind === 'Student Photo' && d.dataUrl && d.fileType !== 'application/pdf' && String(d.dataUrl).length < 400000);
          if (ph) r.photoUrl = ph.dataUrl;
          return r;
        }),
      },
    };
  }

  if (kind === 'jobapp') {
    const p = String(body.phone || '').replace(/\D/g, '').slice(-11);
    const a = S('jobApplications').find(x => x.id.toUpperCase() === String(body.ref || '').trim().toUpperCase() && String(x.phone || '').replace(/\D/g, '').slice(-11) === p);
    return { hydrate: { jobApplications: a ? [pick(a, ['id', 'jobId', 'name', 'phone', 'status', 'interviewDate', 'appliedAt'])] : [] } };
  }
  return { error: 'unknown_kind' };
}

/* ---------- append-only public submissions ---------- */
const LIMIT = { admissions: 3, serviceRequests: 3, jobApplications: 2, inquiries: 3, pwRequests: 2, journal: 4, outbox: 8, audit: 15 };
const MAX_ITEM = 3.5e6;   // bytes of JSON per item (a CV or scanned document)

function auditEntry(prev, e, ip, userId = null) {
  const ts = typeof e.ts === 'string' && Math.abs(Date.parse(e.ts) - Date.now()) < 864e5 ? e.ts : new Date().toISOString();
  const entry = { seq: (prev ? prev.seq : 0) + 1, ts, userId, role: e.role === 'SYSTEM' ? 'SYSTEM' : 'PUBLIC', action: String(e.action || 'PUBLIC').slice(0, 40), entity: String(e.entity || '').slice(0, 40), detail: String(e.detail || '').slice(0, 500), ip: ip || '0.0.0.0', prevHash: prev ? prev.hash : '0'.repeat(14) };
  entry.hash = hash(JSON.stringify([entry.seq, entry.ts, entry.userId, entry.role, entry.action, entry.entity, entry.detail, entry.ip, entry.prevHash]));
  return entry;
}
/** Server-side audit line (login failures, OTP …) — same hash chain as the browser's DB.audit. */
function appendAudit(audit, e, ip, userId = null) { const list = Array.isArray(audit) ? audit.slice() : []; list.push(auditEntry(list[list.length - 1], e, ip, userId)); return list; }
function pushOutbox(outbox, msg, seqRef) { const list = Array.isArray(outbox) ? outbox.slice() : []; list.unshift({ id: `MSG${String(++seqRef.seq).padStart(4, '0')}`, ts: new Date().toISOString(), status: 'Delivered', kind: 'SMS', ...msg }); if (list.length > 500) list.length = 500; return list; }

async function submit(state, body, { pubId, ip }) {
  const items = body && typeof body.items === 'object' ? body.items : {};
  let remap = {}, rejected = [], pwNew = [];
  await state.mutate(get => {
    remap = {}; rejected = []; pwNew = [];
    const put = {}, refs = new Map(), recipients = new Set();
    const meta = { ...(get('meta') || {}) };
    const seqRef = { seq: Math.max(+meta.seq || 1000, Math.min(+body.seq || 0, (+meta.seq || 1000) + 500)) };
    const list = k => put[k] || (put[k] = (get(k) || []).slice());
    const taken = (k, id) => list(k).some(x => x && x.id === id);
    const freshId = (k, id) => { const p = String(id).replace(/[\d-]+$/, '') || 'X'; let n; do { n = `${p}${String(++seqRef.seq).padStart(4, '0')}`; } while (taken(k, n)); return n; };
    const take = k => { const arr = Array.isArray(items[k]) ? items[k] : []; if (arr.length > LIMIT[k]) rejected.push(`${k}:limit`); return arr.slice(0, LIMIT[k]).filter(x => x && typeof x === 'object' && JSON.stringify(x).length < MAX_ITEM); };
    const vSet = verifiedSet(pubId);
    const classes = get('classes') || [];

    for (const a of take('admissions')) {
      if (a.status !== 'Pending' || !/^APP-\d{4}-\d+$/.test(a.id) || !classes.some(c => c.id === a.classId)) { rejected.push(`admissions:${a.id}`); continue; }
      // stored as submitted (birth registration / NID numbers and the uploaded documents are needed by the office
      // and by the lost-form look-up); pubAdmission() strips them only when an application is sent back out
      const x = { ...a }; delete x.studentId; delete x.studentIdLink;
      // an anonymous visitor never confirms a payment: the office or the accounts desk verifies it
      if (x.payment && typeof x.payment === 'object') x.payment = { ...x.payment, verified: false };
      if (taken('admissions', x.id)) {
        const y = x.id.split('-')[1], n = Math.max(0, ...list('admissions').filter(z => String(z.id).startsWith(`APP-${y}-`)).map(z => +String(z.id).split('-')[2] || 0)) + 1;
        remap[a.id] = x.id = `APP-${y}-${String(n).padStart(4, '0')}`;
      }
      if (x.testRoll) {   // test rolls stay unique per class; the counter follows the highest issued roll
        const tests = put.admissionTests || (put.admissionTests = JSON.parse(JSON.stringify(get('admissionTests') || {}))), t = tests[x.classId];
        if (t) {
          const used = list('admissions').some(z => z.classId === x.classId && z.testRoll === x.testRoll), num = +String(x.testRoll).split('-').pop() || 0;
          if (used) { const g = classes.find(c => c.id === x.classId)?.grade; x.testRoll = `T${g}-${String(t.nextRoll++).padStart(3, '0')}`; }
          else t.nextRoll = Math.max(+t.nextRoll || 1, num + 1);
        }
      }
      list('admissions').push(x); refs.set(a.id, { kind: 'admission', amount: +x.netPaid || 0, id: x.id }); refs.set(x.id, refs.get(a.id));
      if (x.guardianPhone) recipients.add(x.guardianPhone); if (x.guardianEmail) recipients.add(x.guardianEmail);
    }
    for (const r of take('serviceRequests')) {
      if (r.status !== 'Pending' || !vSet.has(r.studentId)) { rejected.push(`serviceRequests:${r.id}`); continue; }
      const x = { ...r, requestedBy: 'PUBLIC' };
      if (x.payment && typeof x.payment === 'object') x.payment = { ...x.payment, verified: false };
      if (!x.id || taken('serviceRequests', x.id)) { remap[r.id] = x.id = freshId('serviceRequests', r.id || 'SR'); }
      list('serviceRequests').push(x); refs.set(r.id, { kind: 'service', amount: +x.fee || 0, id: x.id }); refs.set(x.id, refs.get(r.id));
      (get('guardianLinks') || []).filter(l => l.studentId === x.studentId).forEach(l => { const u = state.user(l.guardianUserId); if (u?.phone) recipients.add(u.phone); });
    }
    for (const a of take('jobApplications')) {
      const job = (get('jobs') || []).find(j => j.id === a.jobId);
      if (!job || a.status !== 'New') { rejected.push(`jobApplications:${a.id}`); continue; }
      const x = { ...a, notes: '', interviewDate: null };
      if (!x.id || taken('jobApplications', x.id)) remap[a.id] = x.id = freshId('jobApplications', a.id || 'JA');
      list('jobApplications').push(x); if (x.phone) recipients.add(x.phone); if (x.email) recipients.add(x.email);
    }
    for (const q of take('inquiries')) {
      const x = { name: String(q.name || '').slice(0, 120), contact: String(q.contact || '').slice(0, 120), message: String(q.message || '').slice(0, 4000), ts: new Date().toISOString() };
      if (!x.name || !x.message) { rejected.push('inquiries'); continue; }
      list('inquiries').push(x);
    }
    for (const r of take('pwRequests')) {
      const u = state.findAccount(r.given);
      const x = { id: String(r.id || 'PR').slice(0, 20), userId: u ? u.id : null, given: String(r.given || '').slice(0, 80), at: new Date().toISOString(), status: 'Pending' };
      if (taken('pwRequests', x.id)) remap[r.id] = x.id = freshId('pwRequests', 'PR');
      list('pwRequests').unshift(x); pwNew.push(x);
    }
    for (const v of take('journal')) {
      const ref = refs.get(v.ref), lines = Array.isArray(v.lines) ? v.lines : [];
      const dr = lines.reduce((s, l) => s + (+l.dr || 0), 0), cr = lines.reduce((s, l) => s + (+l.cr || 0), 0);
      if (!ref || v.kind !== 'RV' || Math.abs(dr - cr) > 0.001 || Math.abs(dr - ref.amount) > 0.001 || lines.length > 4) { rejected.push(`journal:${v.id}`); continue; }
      const x = { ...v, ref: ref.id, postedBy: null };
      if (!x.id || taken('journal', x.id)) remap[v.id] = x.id = freshId('journal', v.id || 'RV');
      list('journal').push(x);
    }
    const out = take('outbox').filter(m => recipients.has(m.to));
    if (out.length) {
      const ob = list('outbox');
      for (const m of out.reverse()) { const x = { ...m, message: String(m.message || '').slice(0, 1000) }; if (!x.id || ob.some(o => o.id === x.id)) x.id = `MSG${String(++seqRef.seq).padStart(4, '0')}`; ob.unshift(x); }
      if (ob.length > 500) ob.length = 500;
    }
    const aud = take('audit').filter(e => e.role === 'PUBLIC' || (e.role === 'SYSTEM' && e.action === 'ADMISSION_SCREEN'));
    if (aud.length) { let al = list('audit'); for (const e of aud) al = appendAudit(al, e, ip); put.audit = al; }

    if (seqRef.seq > (+meta.seq || 0)) { meta.seq = seqRef.seq; put.meta = meta; }
    // keys we touched but did not change stay out of the write
    for (const k of Object.keys(put)) if (JSON.stringify(put[k]) === JSON.stringify(get(k))) delete put[k];
    return put;
  }, 'PUBLIC');
  return { remap, rejected, pwNew };
}

/* ---------- OTP password recovery ---------- */
const mask = v => { v = String(v || ''); return v.includes('@') ? v.replace(/^(.).*(@.*)$/, '$1•••$2') : v.replace(/^(\d{3})\d+(\d{3})$/, '$1•••••$2'); };
const lastSent = new Map();
const otpHash = (code, uid) => crypto.createHash('sha256').update(`${uid}:${code}`).digest('hex');

async function otpRequest(state, body, { ip }) {
  const via = body.via === 'email' ? 'email' : 'sms', u = state.findAccount(body.id);
  const to = u ? (via === 'email' ? u.email : u.phone) : '';
  if (u && !to) return { ok: false, reason: 'nocontact', via };
  const masked = mask(to || (via === 'email' ? 'x@x' : '01700000000'));
  if (!u) return { ok: true, masked };                       // unknown ID: same answer, no code (no account enumeration)
  if (Date.now() - (lastSent.get(u.id) || 0) < 60000) return { ok: false, reason: 'wait' };
  const code = String(crypto.randomInt(100000, 1000000));
  const school = state.get('school') || {};
  const sent = await notify.send(via, to, `${school.nameBn || school.name || ''}: পাসওয়ার্ড বদলানোর কোড ${code}। ১০ মিনিট কার্যকর। কাউকে জানাবেন না।`);
  if (!sent.ok) return { ok: false, reason: 'unavailable' };
  lastSent.set(u.id, Date.now());
  await state.mutate(get => {
    const otps = { ...(get('otps') || {}) }; otps[u.id] = { hash: otpHash(code, u.id), exp: Date.now() + 10 * 60000, tries: 0 };
    const meta = { ...(get('meta') || {}) }, seqRef = { seq: +meta.seq || 1000 };
    // the message log records that a code went out — never the code itself
    const outbox = pushOutbox(get('outbox'), { to, kind: via === 'email' ? 'Email' : 'SMS', message: `${school.nameBn || school.name || ''}: পাসওয়ার্ড বদলানোর কোড পাঠানো হয়েছে (কোড গোপন রাখা হয়েছে)।` }, seqRef);
    meta.seq = seqRef.seq;
    const audit = appendAudit(get('audit'), { role: 'PUBLIC', action: 'OTP_SENT', entity: 'users', detail: `${u.username}: পাসওয়ার্ড পুনরুদ্ধারের কোড পাঠানো হয়েছে (${via === 'email' ? 'ই-মেইল' : 'এসএমএস'})` }, ip);
    return { otps, outbox, meta, audit };
  }, 'PUBLIC');
  return { ok: true, masked };
}

async function otpVerify(state, body, { ip }) {
  const u = state.findAccount(body.id), pw = String(body.pw || '');
  const weak = weakness(pw, u && u.username);
  if (weak) return { ok: false, reason: 'weak', message: weak };
  const newHash = await hashPassword(pw);
  let result = { ok: false, reason: 'expired' };
  await state.mutate(get => {
    const otps = { ...(get('otps') || {}) }, o = u && otps[u.id] ? { ...otps[u.id] } : null;
    if (!o || Date.now() > o.exp) { result = { ok: false, reason: 'expired' }; return {}; }
    if (++o.tries > 5) { delete otps[u.id]; result = { ok: false, reason: 'toomany' }; return { otps }; }
    if (o.hash !== otpHash(asciiDigits(body.code).trim(), u.id)) { otps[u.id] = o; result = { ok: false, reason: 'wrong' }; return { otps }; }
    delete otps[u.id];
    const users = (get('users') || []).map(x => { if (x.id !== u.id) return x; const y = { ...x, pwHash: newHash, pwDefault: false, pwChangedAt: new Date().toISOString() }; delete y.mustChange; return y; });
    const audit = appendAudit(get('audit'), { role: 'PUBLIC', action: 'PASSWORD_RESET_OTP', entity: 'users', detail: `${u.username}: ওটিপি যাচাই করে পাসওয়ার্ড বদলানো হয়েছে` }, ip);
    result = { ok: true, userId: u.id };
    return { otps, users, audit };
  }, 'PUBLIC');
  return result;
}

/** Headline counts computed from the stored records (homepage "একনজরে প্রতিষ্ঠান"); numbers only, never records. */
function publicStats(state) {
  const arr = k => (Array.isArray(state.get(k)) ? state.get(k) : []), ff = state.get('featureFlags') || {}, school = state.get('school') || {};
  const classes = arr('classes'), lib = state.get('library') || {};
  const year = new Date().getFullYear(), founded = +school.founded || 0;
  return {
    students: arr('students').filter(s => s && s.status === 'active').length,
    teachers: arr('teachers').filter(t => t && t.status !== 'Resigned').length,
    staff: arr('staff').filter(s => s && s.status !== 'Resigned' && s.status !== 'Inactive').length,
    classes: classes.length,
    sections: classes.reduce((n, c) => n + (Array.isArray(c.sections) && c.sections.length ? c.sections.length : 1), 0),
    campuses: arr('campuses').length,
    subjects: arr('subjects').filter(s => s && s.active !== false).length,
    books: ff.library !== false && Array.isArray(lib.books) ? lib.books.reduce((n, b) => n + (+b.copies || 0), 0) : 0,
    years: founded > 1800 && founded <= year ? year - founded : 0,
  };
}

/* Public result views (school.pubViews, edited in ফলাফল → পাবলিক ফলাফল): a class / section result list, a
   whole-school summary and a merit list. They are served from the snapshot staff build when publishing
   (`pubResultSets`: computed fields only — roll, ID, name, section, GPA, grade, pass/fail, total, position), and
   only the fields switched on for that view leave the server; never phone numbers or other personal data. */
function resultBoard(state, b = {}) {
  const cfg = ((state.get('school') || {}).pubViews) || {}, kind = String(b.kind || ''), v = cfg[kind];
  if (!['list', 'summary', 'merit'].includes(kind) || !v || v.on !== true) return { status: 404, body: { error: 'off' } };
  const examId = String(b.examId || ''), ex = (state.get('exams') || []).find(e => e.id === examId && e.published);
  const snap = ex && (state.get('pubResultSets') || {})[examId];
  if (!ex || !snap || !snap.classes) return { status: 404, body: { error: 'not_found' } };
  const num = x => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  const pick = r => ({ roll: num(+r.roll), section: String(r.section || '').slice(0, 20), gpa: num(r.gpa), letter: String(r.letter || '').slice(0, 20), passed: !!r.passed, pos: num(r.pos),
    ...(v.showId ? { id: String(r.id || '').slice(0, 20) } : {}), ...(v.showName ? { name: String(r.name || '').slice(0, 80) } : {}), ...(v.showTotal ? { total: num(r.total), max: num(r.max) } : {}) });
  const head = { exam: { id: ex.id, name: ex.name }, at: snap.at || null };
  if (kind === 'summary') {
    const classes = Object.entries(snap.classes).map(([id, c]) => { const rows = c.rows || [], n = rows.length, p = rows.filter(r => r.passed).length, gs = rows.map(r => r.gpa).filter(g => typeof g === 'number');
      return { classId: id, name: String(c.name || id), n, passed: p, rate: n ? Math.round(p / n * 1000) / 10 : 0, top: rows.filter(r => r.gpa === 5).length, avgGpa: gs.length ? Math.round(gs.reduce((s, g) => s + g, 0) / gs.length * 100) / 100 : null }; });
    const n = classes.reduce((s, c) => s + c.n, 0), p = classes.reduce((s, c) => s + c.passed, 0);
    return { status: 200, body: { ...head, classes, total: { n, passed: p, rate: n ? Math.round(p / n * 1000) / 10 : 0 } } };
  }
  const classId = String(b.classId || ''), section = String(b.section || '');
  if (kind === 'list') {
    const c = snap.classes[classId]; if (!c) return { status: 404, body: { error: 'not_found' } };
    const rows = (c.rows || []).filter(r => (v.by === 'section' ? !section || r.section === section : true)).map(pick).sort((a, b2) => (a.section || '').localeCompare(b2.section || '') || (a.roll || 0) - (b2.roll || 0));
    return { status: 200, body: { ...head, className: String(c.name || classId), sections: [...new Set((c.rows || []).map(r => r.section).filter(Boolean))], rows } };
  }
  const pool = classId ? (snap.classes[classId]?.rows || []).map(r => ({ ...r, cls: classId })) : Object.entries(snap.classes).flatMap(([id, c]) => (c.rows || []).map(r => ({ ...r, cls: id })));
  const top = Math.max(1, Math.min(100, +v.top || 10));
  const rows = pool.filter(r => r.passed).sort((a, b2) => ((b2.gpa ?? -1) - (a.gpa ?? -1)) || ((b2.total ?? 0) - (a.total ?? 0))).slice(0, top).map((r, i) => ({ ...pick(r), rank: i + 1, className: String(snap.classes[r.cls]?.name || r.cls) }));
  return { status: 200, body: { ...head, rows } };
}

module.exports = { publicView, publicStats, lookup, submit, otpRequest, otpVerify, appendAudit, resultBoard };
