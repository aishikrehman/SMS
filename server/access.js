/* Per-role access: what each signed-in user receives (view) and which record operations they may
   send back (rules for server/merge.js). README → "Data access by role" explains it in prose.

   Who is who (union over all roles of the user):
     root       ADMIN / SUPERADMIN (the Root User)
     staff      root, PRINCIPAL, and custom roles (DB.s.customRoles; portal principal/admin). RBAC decides
                writes per module; custom roles without view on a sensitive module do not receive its keys.
     teacher    TEACHER: students of the classes they teach, class-teach, section-teach, mentor, batch-
                teach, proxy for, or advise; their own HR records; no finance ledgers.
     learner    STUDENT (own record) and GUARDIAN (linked children, guardianLinks): own records plus class-
                level shared data. Classmates appear only as anonymous stand-ins (id "_P…", no name) with
                their marks of published exams, so rank and class averages still work.

   Every key of the state is present in every view (empty when withheld), so the browser's seeders never
   recreate a key from partial data. Secrets (password hashes, OTPs, API keys) are never sent. */
'use strict';
const crypto = require('node:crypto');

const ROOT = new Set(['ADMIN', 'SUPERADMIN']);
const BASE_ROLES = new Set(['ADMIN', 'SUPERADMIN', 'PRINCIPAL', 'TEACHER', 'STUDENT', 'GUARDIAN']);

/* ---------- key → RBAC module ---------- */
const MODULE_KEYS = {
  students: ['students', 'guardianLinks', 'incidents', 'achievements', 'documents', 'promotions', 'summons'],
  admissions: ['admissions', 'coupons', 'admissionForm', 'admissionRules', 'admissionTests', 'inquiries'],
  academics: ['classes', 'subjects', 'routine', 'routineOverrides', 'routineVersions', 'sessionStore', 'homework', 'submissions', 'syllabus', 'ptcBookings', 'calendar', 'materials', 'lessonPlans'],
  exams: ['exams', 'marks', 'gradingSchemes', 'examRemarks', 'examPapers', 'examSyllabus', 'qbank', 'admitWaivers', 'academicStructure', 'semesters', 'courseRegs', 'suppRegs', 'quizzes', 'quizAttempts', 'examAttendance', 'recheckReqs', 'pubResultSets', 'seatPlans'],
  attendance: ['attendance', 'periodAttendance', 'staffAttendance', 'devices', 'gateLogs', 'staffConfirms', 'staffConfirmReqs'],
  fees: ['invoices', 'payments', 'payClaims', 'feeConfigs', 'installmentPlans', 'feeStructure', 'concessions', 'feeHeads'],
  accounts: ['accounts', 'journal', 'mfsStatements', 'reconciliations'],
  hr: ['teachers', 'leaves', 'payroll', 'teacherAbsences', 'proxies', 'evaluations', 'salaryGrades', 'staffGrades', 'staff', 'feedback', 'jobs', 'jobApplications'],
  services: ['certificates', 'serviceRequests'],
  logistics: ['transport', 'hostel', 'library'],
  comms: ['notices', 'broadcasts', 'outbox'],
  settings: ['school', 'theme', 'site', 'campuses', 'sessions', 'activeSession', 'featureFlags', 'rooms', 'menus', 'levels', 'homepage', 'pages', 'instAchievements', 'roomLayout'],
  system: ['users', 'userRoles', 'rbac', 'pageAccess', 'customRoles', 'apiKeys', 'config', 'backups', 'pwRequests', 'audit', 'gateways', 'userPerms', 'userPages'],
};
const KEY_MODULE = {};
for (const [m, keys] of Object.entries(MODULE_KEYS)) for (const k of keys) KEY_MODULE[k] = m;
const moduleOf = k => KEY_MODULE[k] || 'settings';

/** Keys only the Root User, the Principal or a role with system:edit may change. */
const GUARDED = new Set(['users', 'userRoles', 'rbac', 'pageAccess', 'customRoles', 'apiKeys', 'config', 'userPerms', 'userPages', 'gateways', 'backups']);
/** Custom roles receive these only with view permission on the module. */
const SENSITIVE = new Set(['invoices', 'payments', 'payClaims', 'installmentPlans', 'concessions', 'accounts', 'journal', 'mfsStatements', 'reconciliations', 'payroll', 'teacherAbsences', 'evaluations', 'jobApplications', 'apiKeys', 'backups', 'pwRequests', 'audit', 'gateways']);
/** Shared with every signed-in user as stored. */
const SHARED = new Set(['meta', 'school', 'theme', 'site', 'campuses', 'sessions', 'activeSession', 'classes', 'subjects', 'levels', 'rooms',
  'feeConfigs', 'feeStructure', 'feeHeads', 'calendar', 'featureFlags', 'coupons', 'gradingSchemes', 'menus', 'admissionForm', 'admissionRules',
  'admissionTests', 'jobs', 'rbac', 'pageAccess', 'customRoles', 'homepage', 'pages', 'routine', 'routineVersions', 'sessionStore', 'exams',
  'academicStructure', 'semesters']);
/** Extra keys shared with teachers. */
const TEACHER_SHARED = new Set(['proxies', 'salaryGrades', 'staffGrades', 'notices', 'broadcasts']);
/** Never written by a teacher, whatever the RBAC says (finance ledgers). */
const FINANCE = new Set(['invoices', 'payments', 'payClaims', 'journal', 'accounts', 'mfsStatements', 'reconciliations', 'installmentPlans', 'concessions', 'payroll', 'feeConfigs', 'feeStructure', 'feeHeads', 'coupons']);

const empty = v => (Array.isArray(v) ? [] : v && typeof v === 'object' ? {} : (typeof v === 'boolean' || typeof v === 'number') ? v : null);
const pick = (o, keys) => { const r = {}; if (o) for (const k of keys) if (o[k] !== undefined) r[k] = o[k]; return r; };
const omit = (o, keys) => { const r = { ...o }; for (const k of keys) delete r[k]; return r; };
const today = () => new Date().toISOString().slice(0, 10);
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

const PUB_TEACHER = ['id', 'userId', 'campusId', 'dept', 'designation', 'subjects', 'isHead', 'qualification', 'bio', 'showContact', 'status', 'joinDate', 'signature', 'assignments'];
const TEACHER_PRIVATE = ['baseSalary', 'salaryGrade', 'payoutMethod', 'payoutAccount', 'overtimeHours', 'nid', 'bankAccount'];
const PUB_STAFF = ['id', 'name', 'nameBn', 'designation', 'type', 'campusId', 'status', 'photo', 'phone', 'userId'];
const PUB_INVOICE = ['id', 'studentId', 'item', 'amount', 'status', 'due', 'month', 'kind'];
const USER_SECRET = ['pwHash', 'demoKey'];

/* ---------- context: who the user is and what they reach ---------- */
function buildContext(state, uid, pseudoSecret) {
  const S = k => state.get(k);
  const roles = state.roles(uid);
  const rbac = S('rbac') || {};
  const custom = new Map((S('customRoles') || []).map(c => [c.key, c]));
  const root = roles.some(r => ROOT.has(r));
  const staffRoles = roles.filter(r => ROOT.has(r) || r === 'PRINCIPAL' || (!BASE_ROLES.has(r)));
  const staff = staffRoles.length > 0;
  const overrides = (S('userPerms') || {})[uid] || {};
  const roleGrid = r => rbac[r] || (custom.get(r) && rbac[custom.get(r).copyFrom]) || {};
  const perm = (module, action = 'view') => {
    if (root) return true;
    const o = overrides[module] && overrides[module][action];
    if (o !== undefined) return o === true;
    return roles.some(r => roleGrid(r)?.[module]?.[action] === true);
  };
  const privileged = root || roles.includes('PRINCIPAL') || roles.some(r => roleGrid(r)?.system?.edit === true);

  const ctx = { uid, roles, root, staff, privileged, perm, teacher: null, tid: null, own: new Set(), kids: new Set(), teachS: new Set(), S: new Set(), C: new Set(), learnerClasses: new Set(), pairs: new Set(), classTeach: new Set(), confirmer: false, user: state.user(uid) };
  if (staff) return ctx;

  const students = S('students') || [];
  const byId = new Map(students.map(s => [s.id, s]));
  if (roles.includes('STUDENT')) students.filter(s => s.userId === uid).forEach(s => ctx.own.add(s.id));
  if (roles.includes('GUARDIAN')) (S('guardianLinks') || []).filter(l => l.guardianUserId === uid).forEach(l => byId.has(l.studentId) && ctx.kids.add(l.studentId));
  for (const id of [...ctx.own, ...ctx.kids]) { ctx.S.add(id); const s = byId.get(id); if (s) ctx.learnerClasses.add(s.classId); }

  if (roles.includes('TEACHER')) {
    const t = (S('teachers') || []).find(x => x.userId === uid);
    if (t) {
      ctx.teacher = t; ctx.tid = t.id;
      const C = ctx.C;
      (t.assignments || []).forEach(a => { if (a && a.classId) { C.add(a.classId); if (a.subjectId) ctx.pairs.add(`${a.classId}|${a.subjectId}`); } });
      // routine slots may list several teachers / subjects (teacherIds[], subjectIds[]); old slots carry teacherId / subjectId only
      const arr = (a, one) => (Array.isArray(a) && a.filter(Boolean).length ? a.filter(Boolean) : (one ? [one] : []));
      const rv = S('routineVersions'), verSlots = rv && Array.isArray(rv.list) ? rv.list.flatMap(v => (Array.isArray(v && v.routine) ? v.routine : [])) : [];
      [...(S('routine') || []), ...verSlots].forEach(r => { if (r && arr(r.teacherIds, r.teacherId).includes(t.id)) { C.add(r.classId); arr(r.subjectIds, r.subjectId).forEach(s => ctx.pairs.add(`${r.classId}|${s}`)); } });
      (S('classes') || []).forEach(c => {
        const sec = c.sectionTeachers && Object.values(c.sectionTeachers).includes(t.id);
        if (c.classTeacherId === t.id) ctx.classTeach.add(c.id);
        if (c.classTeacherId === t.id || sec || (c.mentors || []).includes(t.id) || (c.batches || []).some(b => b && b.teacherId === t.id)) C.add(c.id);
      });
      const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
      (S('proxies') || []).forEach(p => { if (p.proxyTeacherId === t.id && String(p.date || '') >= yesterday) { C.add(p.classId); if (p.subjectId) ctx.pairs.add(`${p.classId}|${p.subjectId}`); } });
      students.forEach(s => { if (C.has(s.classId) || s.advisorId === t.id) ctx.teachS.add(s.id); });
      // retake / carry-over students registered for a course taken with a class this teacher teaches (js/modules/semester.js)
      (S('courseRegs') || []).forEach(r => { if (r && r.status !== 'dropped' && C.has(r.classId) && byId.has(r.studentId)) ctx.teachS.add(r.studentId); });
      (S('ptcBookings') || []).forEach(b => { if (b.teacherId === t.id && byId.has(b.studentId)) ctx.teachS.add(b.studentId); });
      ctx.teachS.forEach(id => ctx.S.add(id));
      const g = (S('config') || {}).staffGate || {};
      ctx.confirmer = (g.confirmers || []).includes(uid);
    }
  }
  const secret = pseudoSecret || 'dhee';
  ctx.pseudo = sid => '_P' + crypto.createHmac('sha256', secret).update(`${uid}|${sid}`).digest('base64url').slice(0, 10);
  ctx.learner = ctx.own.size > 0 || ctx.kids.size > 0;
  ctx.peers = new Map();                              // learners: classmates → pseudonym
  if (ctx.learner) students.forEach(s => { if (!ctx.S.has(s.id) && ctx.learnerClasses.has(s.classId) && s.status !== 'Left') ctx.peers.set(s.id, ctx.pseudo(s.id)); });
  // users the viewer may know about
  ctx.staffUsers = new Set((S('userRoles') || []).filter(r => r.role !== 'STUDENT' && r.role !== 'GUARDIAN').map(r => r.userId));
  ctx.studentUsers = new Set(students.filter(s => ctx.S.has(s.id)).map(s => s.userId).filter(Boolean));
  ctx.guardianUsers = new Set((S('guardianLinks') || []).filter(l => ctx.S.has(l.studentId)).map(l => l.guardianUserId));
  return ctx;
}

/* ---------- reads ---------- */
const publishedExams = state => new Set((state.get('exams') || []).filter(e => e.published).map(e => e.id));

function paperVisible(state, p) {
  if (p.status !== 'approved' || !p.published) return false;
  const ex = (state.get('exams') || []).find(e => e.id === p.examId); if (!ex) return false;
  const slot = (ex.schedule || []).find(r => r.subjectId === p.subjectId && (!r.classIds?.length || r.classIds.includes(p.classId)));
  if (!slot) return !!ex.published;
  const d = new Date(), z = n => String(n).padStart(2, '0');
  return `${today()} ${z(d.getHours())}:${z(d.getMinutes())}` >= `${slot.date} ${slot.end || '23:59'}`;
}

function publicUser(u, contact) {
  return { id: u.id, name: u.name, nameBn: u.nameBn, photo: u.photo || null, username: '', loginPolicy: 'v1', active: u.active !== false, ...(contact ? { email: u.email || '', phone: u.phone || '' } : {}) };
}

/**
 * Per-record view for non-staff users: (key, rec, id) → record as shown, or undefined when hidden.
 * Returns null when the key is not record-filtered (shared or withheld as a whole).
 */
function recordView(state, ctx, key) {
  const S = ctx.S, has = id => S.has(id), T = !!ctx.teacher, tid = ctx.tid, uid = ctx.uid;
  const classes = new Set([...ctx.C, ...ctx.learnerClasses]);
  const ownOrTeach = sid => ctx.own.has(sid) || ctx.kids.has(sid) || ctx.teachS.has(sid);
  switch (key) {
    case 'students': return r => (has(r.id) ? r : undefined);
    case 'guardianLinks': return r => (has(r.studentId) ? r : undefined);
    case 'marks': {
      // teachers: marks of the subjects they teach (class teachers: their class); every subject only when the Root
      // User allows read-only viewing (school.teacherMarksView). Writes stay limited to their own subjects (rulesFor).
      const all = !T || ((state.get('school') || {}).teacherMarksView === true);
      if (all) return r => (has(r.studentId) ? r : undefined);
      const byId = new Map((state.get('students') || []).map(s => [s.id, s]));
      const teaches = (cls, subj) => ctx.classTeach.has(cls) || ctx.pairs.has(`${cls}|${subj}`) || (![...ctx.pairs].some(p => p.startsWith(cls + '|')) && ctx.C.has(cls));
      const regs = (state.get('courseRegs') || []).filter(x => x && x.status !== 'dropped');
      return r => {
        if (!has(r.studentId)) return undefined;
        if (ctx.own.has(r.studentId) || ctx.kids.has(r.studentId)) return r;
        const cls = byId.get(r.studentId)?.classId;
        return teaches(cls, r.subjectId) || regs.some(x => x.studentId === r.studentId && x.subjectId === r.subjectId && teaches(x.classId, r.subjectId)) ? r : undefined;
      };
    }
    case 'courseRegs': case 'suppRegs': case 'examAttendance': return r => (has(r.studentId) ? r : undefined);
    // result re-check: the applicant's family sees its own applications; a teacher the ones assigned to them
    case 'recheckReqs': return r => (ctx.own.has(r.studentId) || ctx.kids.has(r.studentId) || (T && r.reviewerId === tid) ? r : undefined);
    // online tests (server/quiz.js): teachers their own / their class + subject in full; learners only the
    // published tests of their class, without questions (so never the answer key)
    case 'quizzes': return r => {
      if (T && (r.by === uid || ctx.pairs.has(`${r.classId}|${r.subjectId}`) || ctx.classTeach.has(r.classId))) return r;
      if (ctx.learnerClasses.has(r.classId) && r.status === 'published') return require('./quiz').learnerQuiz(r);
      return undefined;
    };
    case 'quizAttempts': {
      const Q = require('./quiz'), qs = new Map((state.get('quizzes') || []).map(q => [q.id, q])), t = Date.now();
      return r => {
        const q = qs.get(r.quizId);
        if (T && q && Q.canManage(ctx, q)) return r;
        if (ctx.own.has(r.studentId) || ctx.kids.has(r.studentId)) return Q.learnerAttempt(q, r, t);
        return undefined;
      };
    }
    case 'attendance': case 'periodAttendance': return (r, id) => (has(id) ? r : undefined);
    case 'invoices': return r => (ctx.own.has(r.studentId) || ctx.kids.has(r.studentId) ? r : ctx.teachS.has(r.studentId) ? pick(r, PUB_INVOICE) : undefined);
    case 'payments': case 'payClaims': return r => (ctx.own.has(r.studentId) || ctx.kids.has(r.studentId) ? r : undefined);
    case 'installmentPlans': case 'concessions': case 'incidents': case 'achievements': case 'documents': case 'serviceRequests': case 'admitWaivers': case 'summons':
      return r => (ownOrTeach(r.studentId) ? r : undefined);
    case 'admissions': return r => (r.studentId && has(r.studentId) ? omit(r, ['nid', 'fatherNid', 'motherNid']) : undefined);
    case 'feedback': return r => (r.by === uid || (T && r.teacherId === tid) ? (r.by === uid ? r : omit(r, ['by'])) : undefined);
    case 'submissions': {
      const hw = new Map((state.get('homework') || []).map(h => [h.id, h]));
      return r => (has(r.studentId) && (ctx.own.has(r.studentId) || ctx.kids.has(r.studentId) || (T && (hw.get(r.homeworkId)?.teacherId === tid || ctx.C.has(hw.get(r.homeworkId)?.classId)))) ? r : undefined);
    }
    case 'homework': case 'materials': case 'syllabus': case 'examSyllabus':
      return r => (classes.has(r.classId) || (T && r.teacherId === tid) ? r : undefined);
    case 'examPapers':
      return r => {
        if (T && (r.by === uid || ctx.pairs.has(`${r.classId}|${r.subjectId}`) || ctx.classTeach.has(r.classId))) return r;
        if (ctx.learnerClasses.has(r.classId)) return paperVisible(state, r) ? r : omit(r, ['text', 'dataUrl', 'fileName', 'note', 'content', 'src', 'keys']);
        return undefined;
      };
    case 'qbank': {
      // question bank: teachers see the questions of the subjects they teach (and their own); learners nothing
      const subj = new Set([...ctx.pairs].map(p => p.split('|')[1]));
      return r => (T && (r.by === uid || subj.has(r.subjectId)) ? r : undefined);
    }
    // temporary routine changes: only those touching the viewer's classes (empty classIds = every class), or naming the teacher
    case 'routineOverrides': return r => (!r.classIds?.length || r.classIds.some(c => classes.has(c)) || (T && (r.teacherIds || []).includes(tid)) ? r : undefined);
    // learners: proxies (teacher replacements) of their own classes, without who arranged them
    case 'proxies': return r => (classes.has(r.classId) ? pick(r, ['id', 'groupId', 'date', 'period', 'span', 'classId', 'subjectId', 'subjectIds', 'room', 'absentTeacherId', 'proxyTeacherId']) : undefined);
    case 'lessonPlans': case 'leaves': case 'evaluations': return r => (T && r.teacherId === tid ? r : undefined);
    case 'payroll': return r => (T && r.empId === tid ? r : undefined);
    case 'teacherAbsences': case 'staffAttendance': return (r, id) => (T && (id === tid || ctx.confirmer) ? r : undefined);
    case 'staffConfirms': case 'staffConfirmReqs': return r => (T && (r.teacherId === tid || ctx.confirmer) ? r : undefined);
    case 'gateLogs': return r => (r.personType === 'student' ? (has(r.personId) ? r : undefined) : T && (r.personId === tid || ctx.confirmer) ? r : undefined);
    case 'ptcBookings': return r => (r.guardianUserId === uid || (T && r.teacherId === tid) ? r : ctx.kids.size ? pick(r, ['id', 'teacherId', 'date', 'time']) : undefined);
    case 'notices': {
      const campuses = new Set((state.get('classes') || []).filter(c => classes.has(c.id)).map(c => `Campus:${c.campusId}`));
      if (T && !ctx.learner) return r => r;
      const want = new Set(['Everyone', ...(ctx.own.size ? ['Students'] : []), ...(ctx.kids.size ? ['Guardians'] : []), ...(T ? ['Teachers', 'Staff'] : [])]);
      return r => (!r.audience || want.has(r.audience) || campuses.has(r.audience) || (T && /^Campus:/.test(r.audience)) ? r : undefined);
    }
    case 'teachers': return r => (r.id === tid ? r : T ? omit(r, TEACHER_PRIVATE) : r.status === 'Resigned' ? undefined : pick(r, PUB_TEACHER));
    case 'staff': return r => pick(r, PUB_STAFF);
    case 'users': {
      return u => {
        if (!u) return undefined;
        if (u.id === uid) return omit(u, USER_SECRET);
        if (ctx.studentUsers.has(u.id)) return isKidUser(state, ctx, u.id) ? omit(u, USER_SECRET) : publicUser(u, T);
        if (ctx.guardianUsers.has(u.id)) return publicUser(u, true);
        if (ctx.staffUsers.has(u.id)) { const t = (state.get('teachers') || []).find(x => x.userId === u.id); return publicUser(u, T || (t && t.showContact !== false)); }
        return undefined;
      };
    }
    case 'userRoles': {
      return r => (r.userId === uid || ctx.studentUsers.has(r.userId) || ctx.guardianUsers.has(r.userId) || ctx.staffUsers.has(r.userId) ? r : undefined);
    }
    case 'audit': {
      const ids = [...S];
      return e => (e.userId === uid || (ids.length && ids.some(id => String(e.detail || '').includes(id))) ? e : undefined);
    }
    default: return null;
  }
}
function isKidUser(state, ctx, userId) { return (state.get('students') || []).some(s => s.userId === userId && (ctx.own.has(s.id) || ctx.kids.has(s.id))); }

/** Value of one key as this user receives it. */
function viewKey(state, ctx, key, v = state.get(key)) {
  if (key === 'otps') return {};
  if (key === 'recycleBin' || key === 'payIntents') return [];       // server-owned: Root User API / server/pay.js only
  if (ctx.staff) {
    if (!ctx.root && SENSITIVE.has(key) && !ctx.perm(moduleOf(key), 'view') && !(key === 'audit' && ctx.privileged)) return empty(v);
    if (key === 'users') return Array.isArray(v) ? v.map(u => (u && typeof u === 'object' ? omit(u, ['pwHash']) : u)) : v;
    if (key === 'config') return ctx.privileged ? v : redactConfig(v);
    if (key === 'apiKeys' && !ctx.privileged) return empty(v);
    return v;
  }
  if (v === undefined || v === null) return v;
  if (typeof v !== 'object') return v;                         // markers and primitives (activeSession …)
  if (key === 'config') return redactConfig(v);
  if (key === 'userPerms' || key === 'userPages') return v[ctx.uid] ? { [ctx.uid]: v[ctx.uid] } : {};
  if (key === 'examRemarks') { const o = {}; for (const [ex, m] of Object.entries(v)) { const f = filterMap(m, id => ctx.S.has(id)); if (Object.keys(f).length) o[ex] = f; } return o; }
  if (key === 'transport' || key === 'hostel' || key === 'library') return logisticsView(v, ctx, key);
  if (key === 'instAchievements') {   // a student's achievement copied to the website list: only with consent and while the switch is on
    const on = ((state.get('config') || {}).publicSite || {}).studentAch === true;
    return Array.isArray(v) ? v.filter(a => a && a.show !== false && (a.kind !== 'student' || (on && a.consent === true))) : [];
  }
  // buildings, rooms and seat plans: only while the Root User shows the campus map
  if (key === 'roomLayout') return v.show === true ? v : { show: false, campuses: {} };
  if (SHARED.has(key) || (ctx.teacher && TEACHER_SHARED.has(key))) return v;
  if (key === 'admissions' && ctx.teacher && ctx.perm('admissions', 'view')) return v;

  const rv = recordView(state, ctx, key);
  if (!rv) return empty(v);
  let out;
  if (Array.isArray(v)) { out = []; for (const r of v) { if (!r || typeof r !== 'object') continue; const x = rv(r, r.id); if (x !== undefined) out.push(x); } }
  else { out = {}; for (const [id, r] of Object.entries(v)) { const x = rv(r, id); if (x !== undefined) out[id] = x; } }
  if (key === 'audit' && out.length > 400) out = out.slice(-400);
  // classmates as anonymous stand-ins (rank, class average, highest mark)
  if (ctx.peers && ctx.peers.size) {
    if (key === 'students') for (const s of v) { const p = ctx.peers.get(s.id); if (p) out.push({ id: p, name: '', nameBn: '', classId: s.classId, section: s.section, status: s.status, stream: s.stream, synthetic: true }); }
    if (key === 'marks') { const pub = publishedExams(state); for (const m of v) { const p = ctx.peers.get(m.studentId); if (p && pub.has(m.examId)) out.push({ ...m, studentId: p }); } }
  }
  return out;
}
function filterMap(m, keep) { const o = {}; if (isObj(m)) for (const [k, v] of Object.entries(m)) if (keep(k)) o[k] = v; return o; }
function redactConfig(v) {
  if (!isObj(v)) return v;
  const c = JSON.parse(JSON.stringify(v));
  if (c.registry) delete c.registry.apiKey;
  if (c.payGw) { delete c.payGw.secret; delete c.payGw.apiKey; }
  return c;
}
function logisticsView(v, ctx, key) {
  if (!isObj(v)) return v;
  const o = { ...v };
  // library catalogue: copies on the shelf counted from every loan before the loans are cut to the user's own
  if (key === 'library' && Array.isArray(o.books)) {
    const out = new Map(); for (const l of Array.isArray(o.loans) ? o.loans : []) if (l && !l.returned) out.set(l.bookId, (out.get(l.bookId) || 0) + 1);
    o.books = o.books.map(b => (b && typeof b === 'object' ? { ...b, avail: Math.max(0, (+b.copies || 0) - (out.get(b.id) || 0)) } : b));
  }
  for (const k of ['allocations', 'loans']) if (Array.isArray(o[k])) o[k] = o[k].filter(a => !a.studentId || ctx.S.has(a.studentId));
  return o;
}

/** Whole state as this user receives it. */
function viewFor(state, ctx) {
  const out = {};
  for (const k of state.keys()) out[k] = viewKey(state, ctx, k);
  return out;
}

/* ---------- writes ---------- */
const sameExcept = (a, b, fields) => { const x = { ...a }, y = { ...b }; for (const f of fields) { delete x[f]; delete y[f]; } return JSON.stringify(x) === JSON.stringify(y); };
const NO = () => false;
const DENY = { add: NO, edit: NO, del: NO };

/**
 * Rules for one key, or null when the key is not writable by this user at all.
 * `pending(key)` returns the value already merged earlier in the same request (or the stored one).
 */
function rulesFor(state, ctx, key, pending) {
  const uid = ctx.uid, view = recordView(state, ctx, key);
  const viewFn = ctx.staff ? (key === 'users' ? (u => (u && typeof u === 'object' ? omit(u, ['pwHash']) : u)) : (r => r)) : view ? (r, id) => view(r, id) : (r => r);
  const synthetic = key === 'students' ? (r => String(r?.id || '').startsWith('_P')) : key === 'marks' ? (r => String(r?.studentId || '').startsWith('_P')) : null;
  const base = { view: viewFn, skip: synthetic };

  // marks of an exam whose result is published are locked: only the Root User (and the Principal when the Root User
  // switched on featureFlags.publishedMarksPrincipal) may change them; unpublishing re-opens editing
  const pubNow = () => new Set(((pending && pending('exams')) || state.get('exams') || []).filter(e => e && e.published).map(e => e.id));
  const marksOpen = () => ctx.root || (ctx.roles.includes('PRINCIPAL') && (state.get('featureFlags') || {}).publishedMarksPrincipal === true);
  const unlocked = r => { if (marksOpen()) return true; return !pubNow().has(r && r.examId); };

  /* --- staff: RBAC per module --- */
  if (ctx.staff) {
    const m = moduleOf(key);
    if (GUARDED.has(key) && !ctx.privileged && key !== 'users') return null;
    if (key === 'users') return { ...base, ...usersRules(state, ctx) };
    if (key === 'userRoles') {
      const adminRow = r => ROOT.has(r.role);
      if (!ctx.privileged) return null;
      return { ...base, add: r => ctx.root || !adminRow(r), edit: (n, o) => ctx.root || (!adminRow(n) && !adminRow(o)), del: o => ctx.root || !adminRow(o) };
    }
    if (key === 'rbac' || key === 'pageAccess') return { ...base, add: (r, id) => ctx.root || !ROOT.has(id), edit: (n, o, id) => ctx.root || !ROOT.has(id), del: (o, id) => ctx.root || !ROOT.has(id) };
    if (!ctx.root && !GUARDED.has(key) && !ctx.perm(m, 'edit')) return null;
    const canDel = ctx.root || GUARDED.has(key) || ctx.perm(m, 'delete');
    if (key === 'marks') {
      // no exceptions: a published result's marks (re-check corrections included) only by marksOpen()
      return { ...base, add: r => unlocked(r), edit: (n, o) => unlocked(o) && unlocked(n), del: o => canDel && unlocked(o) };
    }
    // only the Root User decides whether the Principal may change marks of a published result
    if (key === 'featureFlags' && !ctx.root) {
      const RO = 'publishedMarksPrincipal';
      return { ...base, add: (r, id) => id !== RO, edit: (n, o, id) => id !== RO || n === o, del: (o, id) => canDel && id !== RO };
    }
    return { ...base, add: () => true, edit: () => true, del: () => canDel };
  }

  /* --- non-staff --- */
  const S = ctx.S, mine = sid => ctx.own.has(sid) || ctx.kids.has(sid), T = !!ctx.teacher, tid = ctx.tid;
  const R = rules => ({ ...base, ...DENY, ...rules });
  const teachClass = cls => ctx.C.has(cls);
  const studentClass = sid => (state.get('students') || []).find(s => s.id === sid)?.classId;
  const teachesIn = (c, subj) => ctx.classTeach.has(c) || ctx.pairs.has(`${c}|${subj}`) || (![...ctx.pairs].some(p => p.startsWith(c + '|')) && ctx.C.has(c));
  // a retake course is marked by the teacher of the class it is taken with (courseRegs[].classId)
  const teachesSubject = (sid, subj) => teachesIn(studentClass(sid), subj) || (state.get('courseRegs') || []).some(r => r && r.studentId === sid && r.subjectId === subj && r.status !== 'dropped' && teachesIn(r.classId, subj));
  const teacherRbac = mod => T && ctx.perm(mod, 'edit');

  switch (key) {
    case 'users': return { ...base, ...usersRules(state, ctx) };
    /* learners */
    case 'submissions': return R({
      add: r => ctx.own.has(r.studentId) && r.status !== 'Graded' && r.grade == null && r.marks == null,
      edit: (n, o) => (ctx.own.has(o.studentId) && n.studentId === o.studentId && o.status !== 'Graded' && sameFields(n, o, ['status', 'grade', 'feedback', 'marks', 'annotatedUrl', 'gradedAt', 'evalMode']))
        || (T && teacherRbac('academics') && ctx.teachS.has(o.studentId) && sameExcept(n, o, ['status', 'grade', 'feedback', 'marks', 'fullMarks', 'annotatedUrl', 'gradedAt', 'evalMode'])),
      del: o => ctx.own.has(o.studentId) && o.status !== 'Graded',
    });
    case 'serviceRequests': return R({
      add: r => mine(r.studentId) && r.status === 'Pending' && (!r.requestedBy || r.requestedBy === uid) && !(r.payment && r.payment.verified === true) && (!r.payment?.trxId || !trxUsed(state, r.payment.trxId)),
      edit: (n, o) => (o.requestedBy === uid && o.status === 'Pending' && n.studentId === o.studentId && sameFields(n, o, ['stage', 'approvedBy', 'decidedBy', 'decidedAt']) && ['Pending', 'Cancelled'].includes(n.status))
        || (T && ctx.classTeach.has(studentClass(o.studentId)) && n.studentId === o.studentId && sameFields(n, o, ['type', 'fee', 'payment'])),
    });
    // Learners never create payments or mark invoices paid: only the server does (server/pay.js — an
    // accountant verifies a TrxID claim, or the payment gateway's signed callback confirms a checkout).
    case 'payments': case 'invoices': return R({});
    case 'payClaims': return R({
      add: r => {
        if (!mine(r.studentId) || r.status !== 'Pending' || r.by !== uid || !/^[A-Z0-9]{6,20}$/.test(String(r.txn || '')) || trxUsed(state, r.txn)) return false;
        const ids = Array.isArray(r.invoiceIds) ? r.invoiceIds : [], invs = (state.get('invoices') || []).filter(i => ids.includes(i.id));
        const open = (state.get('payClaims') || []).filter(c => c.status === 'Pending').flatMap(c => c.invoiceIds || []);
        return ids.length > 0 && invs.length === ids.length && invs.every(i => i.studentId === r.studentId && i.status === 'unpaid' && !open.includes(i.id))
          && Math.abs(invs.reduce((s, i) => s + (+i.amount || 0), 0) - (+r.amount || 0)) < 0.001;
      },
      edit: (n, o) => o.by === uid && o.status === 'Pending' && n.status === 'Cancelled' && sameExcept(n, o, ['status', 'cancelledAt']),
    });
    case 'journal': return R({
      add: v => {
        if (v.kind !== 'RV' || !Array.isArray(v.lines) || v.lines.length > 4) return false;
        const dr = v.lines.reduce((s, l) => s + (+l.dr || 0), 0), cr = v.lines.reduce((s, l) => s + (+l.cr || 0), 0);
        if (Math.abs(dr - cr) > 0.001) return false;
        // fee payments are posted by the server (server/pay.js); a learner posts only a service request's receipt
        const sr = (pending('serviceRequests') || []).find(r => r.id === v.ref && mine(r.studentId) && r.payment && r.payment.verified !== true);
        return !!sr && Math.abs(dr - (+sr.fee || +sr.payment?.amount || 0)) < 0.001;
      },
    });
    case 'ptcBookings': return R({
      add: r => ctx.kids.has(r.studentId) && r.guardianUserId === uid && !(state.get('ptcBookings') || []).some(b => b.teacherId === r.teacherId && b.date === r.date && b.time === r.time),
      edit: (n, o) => (o.guardianUserId === uid && n.guardianUserId === uid && ctx.kids.has(n.studentId)) || (T && o.teacherId === tid && sameFields(n, o, ['status', 'note', 'outcome'])),
      del: o => o.guardianUserId === uid || (T && o.teacherId === tid),
    });
    case 'feedback': return R({ add: r => r.by === uid && mine(r.studentId), edit: (n, o) => o.by === uid && n.by === uid, del: o => o.by === uid });
    case 'documents': return R({ add: r => (ctx.kids.has(r.studentId) || (T && ctx.teachS.has(r.studentId))) && (!r.by || r.by === uid), del: o => o.by === uid });
    case 'students': return R({
      edit: (n, o) => (ctx.kids.has(o.id) && sameExcept(n, o, ['photo']))
        || (T && teacherRbac('students') && ctx.teachS.has(o.id) && sameFields(n, o, ['id', 'userId', 'regNo', 'classId', 'section', 'roll', 'status', 'campusId', 'optHeads', 'admissionDate'])),
    });
    case 'materials': return R({
      add: r => T && r.teacherId === tid && teachClass(r.classId),
      edit: (n, o) => (T && o.teacherId === tid && n.teacherId === tid) || (sameExcept(n, o, ['downloads']) && +n.downloads >= +o.downloads),
      del: o => T && o.teacherId === tid,
    });
    /* teachers */
    case 'attendance': case 'periodAttendance': return T && ctx.perm('attendance', 'edit') ? R({ add: (r, id) => ctx.teachS.has(id), edit: (n, o, id) => ctx.teachS.has(id), del: (o, id) => ctx.teachS.has(id) }) : null;
    case 'marks': return T && ctx.perm('exams', 'edit') ? R({
      add: r => ctx.teachS.has(r.studentId) && teachesSubject(r.studentId, r.subjectId) && unlocked(r),
      edit: (n, o) => ctx.teachS.has(o.studentId) && teachesSubject(o.studentId, o.subjectId) && unlocked(o) && unlocked(n),
      del: o => ctx.teachS.has(o.studentId) && teachesSubject(o.studentId, o.subjectId) && unlocked(o),
    }) : null;
    case 'examRemarks': return T ? R({ add: (r, id) => onlyKeys(r, {}, ctx.teachS), edit: (n, o) => onlyKeys(n, o, ctx.teachS) }) : null;
    case 'qbank': {
      // a teacher writes question-bank entries only for the subjects they teach, and changes / deletes only their own
      const subj = new Set([...ctx.pairs].map(p => p.split('|')[1]));
      return T && teacherRbac('exams') ? R({ add: r => r.by === uid && subj.has(r.subjectId), edit: (n, o) => o.by === uid && n.by === uid && subj.has(n.subjectId), del: o => o.by === uid }) : null;
    }
    case 'homework': return T && teacherRbac('academics') ? R({ add: r => r.teacherId === tid && teachClass(r.classId), edit: (n, o) => o.teacherId === tid && n.teacherId === tid && teachClass(n.classId), del: o => o.teacherId === tid }) : null;
    // curriculum: a teacher writes only the subjects they teach in that class (no subject list for the class = legacy: the class)
    case 'syllabus': {
      const own = (c, s) => ctx.pairs.has(`${c}|${s}`) || (![...ctx.pairs].some(p => p.startsWith(c + '|')) && teachClass(c));
      return T && teacherRbac('academics') ? R({ add: r => own(r.classId, r.subjectId), edit: (n, o) => own(o.classId, o.subjectId) && n.classId === o.classId && n.subjectId === o.subjectId, del: o => o.teacherId === tid && own(o.classId, o.subjectId) }) : null;
    }
    case 'lessonPlans': return T ? R({ add: r => r.teacherId === tid, edit: (n, o) => o.teacherId === tid && n.teacherId === tid, del: o => o.teacherId === tid }) : null;
    case 'examPapers': return T && teacherRbac('exams') ? R({
      add: r => r.by === uid && (ctx.pairs.has(`${r.classId}|${r.subjectId}`) || ctx.classTeach.has(r.classId)) && r.status !== 'approved',
      edit: (n, o) => (o.by === uid || ctx.pairs.has(`${o.classId}|${o.subjectId}`)) && o.status !== 'approved' && n.status !== 'approved' && !n.published,
      del: o => o.by === uid && o.status !== 'approved',
    }) : null;
    case 'quizzes': {
      const mayTeach = r => ctx.pairs.has(`${r.classId}|${r.subjectId}`) || ctx.classTeach.has(r.classId);
      const used = id => (state.get('quizAttempts') || []).some(a => a && a.quizId === id);
      return T && teacherRbac('exams') ? R({ add: r => r.by === uid && mayTeach(r), edit: (n, o) => o.by === uid && n.by === uid && mayTeach(n), del: o => o.by === uid && !used(o.id) }) : null;
    }
    // the assigned reviewer enters the re-checked marks only; accepting / rejecting is the office's (staff RBAC)
    case 'recheckReqs': return T ? R({ edit: (n, o) => o.reviewerId === tid && o.status === 'Assigned' && ['Assigned', 'Reviewed'].includes(n.status) && sameExcept(n, o, ['newVals', 'reviewNote', 'reviewedAt', 'status']) }) : null;
    case 'examAttendance': return T && (ctx.perm('exams', 'edit') || ctx.perm('attendance', 'edit')) ? R({ add: r => ctx.teachS.has(r.studentId) && r.by === uid, edit: (n, o) => ctx.teachS.has(o.studentId) && n.studentId === o.studentId, del: o => ctx.teachS.has(o.studentId) }) : null;
    case 'examSyllabus': return T && teacherRbac('exams') ? R({ add: r => teachClass(r.classId), edit: (n, o) => teachClass(o.classId) && n.classId === o.classId, del: o => teachClass(o.classId) }) : null;
    case 'incidents': return T ? R({ add: r => ctx.teachS.has(r.studentId) && r.by === uid, edit: (n, o) => o.by === uid && n.by === uid, del: o => o.by === uid }) : null;
    case 'achievements': return T && teacherRbac('students') ? R({ add: r => ctx.teachS.has(r.studentId), edit: (n, o) => ctx.teachS.has(o.studentId) && n.studentId === o.studentId, del: o => ctx.teachS.has(o.studentId) }) : null;
    case 'leaves': return T ? R({ add: r => r.teacherId === tid && (!r.status || r.status === 'Pending'), edit: (n, o) => o.teacherId === tid && o.status === 'Pending' && ['Pending', 'Cancelled', 'Withdrawn'].includes(n.status), del: o => o.teacherId === tid && o.status === 'Pending' }) : null;
    case 'teachers': return T ? R({ edit: (n, o) => o.id === tid && sameExcept(n, o, ['qualification', 'bio', 'showContact', 'signature', 'photo']) }) : null;
    case 'staffConfirmReqs': return T ? R({ add: r => r.teacherId === tid || ctx.confirmer, edit: () => ctx.confirmer }) : null;
    case 'staffConfirms': return T && ctx.confirmer ? R({ add: () => true, edit: () => true }) : null;
    case 'staffAttendance': case 'teacherAbsences': return T && ctx.confirmer ? R({ add: () => true, edit: () => true }) : null;
    default:
      // teachers: plain RBAC for the admissions desk and notices (never finance)
      if (T && !FINANCE.has(key) && ['admissions', 'comms'].includes(moduleOf(key)) && key !== 'outbox' && ctx.perm(moduleOf(key), 'edit')) return { ...base, add: () => true, edit: () => true, del: () => ctx.perm(moduleOf(key), 'delete') };
      return null;
  }
}
/** Rules for `users`: own profile for everyone; full edit for privileged users, but only the Root User edits a Root User. */
function usersRules(state, ctx) {
  const rootIds = new Set((state.get('userRoles') || []).filter(r => ROOT.has(r.role)).map(r => r.userId));
  const PROTECTED = ['username', 'active', 'pwDefault', 'mustChange', 'loginPolicy', 'demoKey', 'createdBy', 'createdAt', 'pwChangedAt'];
  if (ctx.privileged) return { add: () => true, edit: (n, o) => ctx.root || !rootIds.has(o.id) || o.id === ctx.uid, del: o => (ctx.root || !rootIds.has(o.id)) && o.id !== ctx.uid };
  return {
    add: NO, del: NO,
    edit: (n, o) => (o.id === ctx.uid && n.id === o.id && sameFields(n, o, PROTECTED))
      || (ctx.kids.size && isKidUser(state, ctx, o.id) && sameExcept(n, o, ['photo'])),
  };
}
/** The listed fields are unchanged (missing on both sides counts as unchanged). */
function sameFields(n, o, fields) { return fields.every(f => JSON.stringify(n[f]) === JSON.stringify(o[f])); }
/** Every changed entry of a nested map belongs to `allowed`. */
function onlyKeys(n, o, allowed) {
  if (!isObj(n)) return false;
  const keys = new Set([...Object.keys(n), ...Object.keys(o || {})]);
  for (const k of keys) if (JSON.stringify(n[k]) !== JSON.stringify((o || {})[k]) && !allowed.has(k)) return false;
  return true;
}
function trxUsed(state, txn) {
  const t = String(txn || '').toUpperCase(); if (!t) return false;
  return (state.get('payments') || []).some(p => String(p.txn || '').toUpperCase() === t) || (state.get('admissions') || []).some(a => String(a.payment?.txn || '').toUpperCase() === t)
    || (state.get('serviceRequests') || []).some(r => String(r.payment?.trxId || '').toUpperCase() === t)
    || (state.get('payClaims') || []).some(c => c.status !== 'Rejected' && c.status !== 'Cancelled' && String(c.txn || '').toUpperCase() === t);
}

/* Outbox: every signed-in user may append messages (their actions notify guardians and teachers); only
   staff with comms:edit change or remove entries. At most 25 new entries per save. */
function outboxRules(ctx) {
  let n = 0;
  const ok = m => m && typeof m === 'object' && typeof m.to === 'string' && typeof m.message === 'string' && m.message.length <= 2000 && ++n <= 25;
  // staff: deleting = the browser's 500-entry cap; editing an entry needs comms:edit
  if (ctx.staff) { const ed = ctx.root || ctx.perm('comms', 'edit'); return { view: r => r, add: m => ed || ok(m), edit: () => ed, del: () => true }; }
  return { view: () => undefined, add: ok, edit: NO, del: NO };
}

module.exports = { buildContext, viewFor, viewKey, rulesFor, outboxRules, moduleOf, trxUsed, KEY_MODULE, GUARDED, SHARED, ROOT };
