/* Online tests (অনলাইন পরীক্ষা) — timing, answers and grading on the server.

   quizzes       written by staff (exams: edit) and teachers (own class + subject) through PUT /api/state.
                 Learners receive only the test's metadata (server/access.js strips the questions), so the
                 answer key never reaches a learner before the test closes.
   quizAttempts  server-owned (client writes ignored). An attempt is created by POST /api/quiz/:id/start,
                 answers are saved by …/attempt/:aid/save and graded by …/attempt/:aid/submit. An attempt
                 whose deadline (start + duration, never later than the test's end) has passed is graded
                 with its saved answers (sweep, every minute and on each call).

   quiz = { id, title, classId, subjectId, by, status: 'draft'|'published', start, end (ISO), duration (min),
            shuffle, shuffleOpts, attempts, negative (marks per wrong objective answer),
            resultPolicy: 'instant'|'close'|'manual', released, questions: [{ id, type, text, img, opts, ans, marks }],
            push: { examId, comp } }
   Types: mcq (ans = option index), mcqm (ans = [indexes]), tf (ans = 'T'|'F'), one / fill / num (ans = text,
   alternatives separated by |). */
'use strict';
const crypto = require('node:crypto');
const { appendAudit } = require('./public');

const GRACE = 20e3;                 // network slack after the deadline
const OBJ = new Set(['mcq', 'mcqm', 'tf']);
const TYPES = new Set(['mcq', 'mcqm', 'tf', 'one', 'fill', 'num']);
const ts = s => { const t = Date.parse(s); return Number.isFinite(t) ? t : NaN; };
const r2 = n => Math.round(n * 100) / 100;

const quizOf = (state, id) => (state.get('quizzes') || []).find(q => q && q.id === id) || null;
const closed = (q, t = Date.now()) => t > ts(q.end);
const keyVisible = (q, t = Date.now()) => t > ts(q.end) + GRACE &&(q.resultPolicy !== 'manual' || q.released === true);
const scoreVisible = (q, t = Date.now()) => q.resultPolicy === 'instant' || keyVisible(q, t);

/** Staff with exams: edit, or the teacher who wrote it / teaches that class and subject. */
function canManage(ctx, q) {
  if (ctx.staff) return ctx.root || ctx.perm('exams', 'edit');
  return !!ctx.teacher && !!q && (q.by === ctx.uid || ctx.pairs.has(`${q.classId}|${q.subjectId}`) || ctx.classTeach.has(q.classId));
}
function canSee(ctx, q) { return ctx.staff ? (ctx.root || ctx.perm('exams', 'view')) : canManage(ctx, q); }

const norm = s => String(s ?? '').trim().toLowerCase().replace(/[০-৯]/g, d => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).replace(/\s+/g, ' ');
const blank = a => a === undefined || a === null || a === '' || (Array.isArray(a) && !a.length);

function gradeOne(q, a) {
  if (blank(a)) return null;
  if (q.type === 'mcq') return +a === +q.ans;
  if (q.type === 'mcqm') { const k = [...new Set((q.ans || []).map(Number))].sort(), v = [...new Set([].concat(a).map(Number))].sort(); return k.length === v.length && k.every((x, i) => x === v[i]); }
  if (q.type === 'tf') return String(a) === String(q.ans);
  if (q.type === 'num') { const x = parseFloat(norm(a)); return String(q.ans ?? '').split('|').some(y => Math.abs(parseFloat(norm(y)) - x) < 1e-9); }
  return String(q.ans ?? '').split('|').map(norm).filter(Boolean).includes(norm(a));
}

/** Score an attempt with the test's current key. */
function grade(quiz, answers) {
  let score = 0, max = 0, correct = 0, wrong = 0, empty = 0;
  const detail = {}, neg = Math.max(0, +quiz.negative || 0);
  for (const q of quiz.questions || []) {
    const m = Math.max(0, +q.marks || 0); max += m;
    const ok = gradeOne(q, answers ? answers[q.id] : undefined);
    let pts = 0;
    if (ok === null) empty++;
    else if (ok) { correct++; pts = m; } else { wrong++; if (OBJ.has(q.type)) pts = -neg; }
    score += pts; detail[q.id] = { ok, pts: r2(pts) };
  }
  return { score: r2(Math.max(0, score)), max: r2(max), correct, wrong, empty, detail };
}

/** An attempt ends at its deadline, or earlier when the test's end was moved forward (the key is shown after the end). */
const until = (a, q) => Math.min(ts(a.deadline), q ? ts(q.end) : Infinity);

/** Grade open attempts whose time is up (mutates `list`). */
function sweep(list, get, t = Date.now()) {
  let changed = false;
  const quizzes = new Map((get('quizzes') || []).map(q => [q.id, q]));
  for (let i = 0; i < list.length; i++) {
    const a = list[i]; if (!a || a.status !== 'open') continue;
    const q = quizzes.get(a.quizId), dl = until(a, q);
    if (t <= dl + GRACE) continue;
    list[i] = { ...a, status: 'submitted', auto: true, submittedAt: new Date(Math.min(t, dl)).toISOString(), ...(q ? grade(q, a.answers) : {}) };
    changed = true;
  }
  return changed;
}

function shuffle(a) { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [x[i], x[j]] = [x[j], x[i]]; } return x; }

/** What the learner sees of a question while taking the test (never the key). */
function paperFor(quiz, a) {
  const byId = new Map((quiz.questions || []).map(q => [q.id, q]));
  return (a.order || []).map(id => byId.get(id)).filter(Boolean).map(q => {
    const out = { id: q.id, type: q.type, text: String(q.text || ''), img: q.img || '', marks: +q.marks || 0 };
    if (q.type === 'mcq' || q.type === 'mcqm') { const ord = (a.optOrder || {})[q.id] || (q.opts || []).map((_, i) => i); out.opts = ord.map(i => ({ i, t: String((q.opts || [])[i] ?? '') })); }
    return out;
  });
}

/** Keep only answers to this test's questions, in the expected shape. */
function cleanAnswers(quiz, ans) {
  const out = {};
  if (!ans || typeof ans !== 'object') return out;
  for (const q of quiz.questions || []) {
    const v = ans[q.id]; if (blank(v)) continue;
    const n = (q.opts || []).length;
    if (q.type === 'mcq') { const i = parseInt(v, 10); if (i >= 0 && i < n) out[q.id] = i; }
    else if (q.type === 'mcqm') { const xs = [...new Set([].concat(v).map(x => parseInt(x, 10)).filter(i => i >= 0 && i < n))].sort(); if (xs.length) out[q.id] = xs; }
    else if (q.type === 'tf') { if (v === 'T' || v === 'F') out[q.id] = v; }
    else out[q.id] = String(v).slice(0, 200);
  }
  return out;
}

/** Attempt as the learner receives it (score only when the result policy allows it, per-question detail only with the key). */
function learnerAttempt(q, a, t = Date.now()) {
  const base = { id: a.id, quizId: a.quizId, studentId: a.studentId, no: a.no, startedAt: a.startedAt, deadline: a.deadline, status: a.status, submittedAt: a.submittedAt || null, auto: !!a.auto, answers: a.answers || {} };
  if (!q) return base;
  if (a.status === 'submitted' && scoreVisible(q, t)) Object.assign(base, { score: a.score, max: a.max, correct: a.correct, wrong: a.wrong, empty: a.empty });
  if (a.status === 'submitted' && keyVisible(q, t)) base.detail = a.detail;
  return base;
}
/** Test as the learner receives it in /api/state: no questions (so no key), only counts. */
function learnerQuiz(q) {
  const qs = Array.isArray(q.questions) ? q.questions : [];
  const { questions, push, ...rest } = q;
  return { ...rest, qCount: qs.length, total: r2(qs.reduce((s, x) => s + (+x.marks || 0), 0)) };
}

function makeQuiz(state, log) {
  const fail = (status, error) => ({ status, body: { error } });
  const learnerOk = (ctx, sid) => ctx.own.has(sid) || ctx.kids.has(sid);

  async function start(uid, quizId, studentId) {
    const ctx = state.context(uid), q = quizOf(state, quizId), t = Date.now();
    if (!q || q.status !== 'published') return fail(404, 'not_found');
    if (!learnerOk(ctx, studentId)) return fail(403, 'forbidden');
    const st = state.student(studentId);
    if (!st || st.classId !== q.classId || st.status === 'Left') return fail(403, 'not_eligible');
    if (t < ts(q.start)) return fail(409, 'not_open');
    if (t > ts(q.end)) return fail(409, 'closed');
    let out = null;
    await state.mutate(get => {
      const list = (get('quizAttempts') || []).slice(), swept = sweep(list, get, t);
      const mine = list.filter(a => a && a.quizId === q.id && a.studentId === studentId);
      const open = mine.find(a => a.status === 'open');
      if (open) { out = { attempt: open }; return swept ? { quizAttempts: list } : {}; }
      if (mine.length >= Math.max(1, +q.attempts || 1)) { out = fail(409, 'no_attempts'); return swept ? { quizAttempts: list } : {}; }
      const ids = (q.questions || []).map(x => x.id), optOrder = {};
      (q.questions || []).forEach(x => { if (x.type === 'mcq' || x.type === 'mcqm') { const o = (x.opts || []).map((_, i) => i); optOrder[x.id] = q.shuffleOpts ? shuffle(o) : o; } });
      const dur = Math.max(1, +q.duration || 30) * 60e3;
      const a = { id: `QA${t.toString(36)}${crypto.randomBytes(3).toString('hex')}`, quizId: q.id, studentId, by: uid, no: mine.length + 1, startedAt: new Date(t).toISOString(), deadline: new Date(Math.min(t + dur, ts(q.end))).toISOString(), order: q.shuffle ? shuffle(ids) : ids, optOrder, answers: {}, status: 'open' };
      list.push(a); out = { attempt: a };
      return { quizAttempts: list, audit: appendAudit(get('audit'), { role: 'SYSTEM', action: 'QUIZ_START', entity: 'exams', detail: `${q.id} · ${studentId} · চেষ্টা ${a.no}` }, '', uid) };
    }, uid);
    if (out.status) return out;
    const a = out.attempt;
    return { status: 200, body: { attempt: learnerAttempt(q, a), questions: paperFor(q, a), now: new Date().toISOString(), title: q.title, duration: q.duration } };
  }

  /** Save (final=false) or submit (final=true) the answers of an open attempt. */
  async function answer(uid, aid, answers, final) {
    const ctx = state.context(uid), t = Date.now();
    let out = fail(404, 'not_found');
    await state.mutate(get => {
      const list = (get('quizAttempts') || []).slice(), i = list.findIndex(a => a && a.id === aid);
      if (i < 0) return {};
      const a = list[i], q = (get('quizzes') || []).find(x => x.id === a.quizId);
      if (!q || !learnerOk(ctx, a.studentId)) { out = fail(403, 'forbidden'); return {}; }
      if (a.status !== 'open') { out = fail(409, 'submitted'); return {}; }
      if (t > until(a, q) + GRACE) { sweep(list, get, t); out = fail(409, 'time_up'); return { quizAttempts: list }; }
      const ans = { ...(a.answers || {}), ...cleanAnswers(q, answers) };
      Object.keys(answers || {}).forEach(k => { if (blank(answers[k])) delete ans[k]; });
      list[i] = final ? { ...a, answers: ans, status: 'submitted', submittedAt: new Date(t).toISOString(), ...grade(q, ans) } : { ...a, answers: ans, savedAt: new Date(t).toISOString() };
      out = { status: 200, body: { ok: true, attempt: learnerAttempt(q, list[i], t) } };
      return { quizAttempts: list, ...(final ? { audit: appendAudit(get('audit'), { role: 'SYSTEM', action: 'QUIZ_SUBMIT', entity: 'exams', detail: `${q.id} · ${a.studentId} · চেষ্টা ${a.no}` }, '', uid) } : {}) };
    }, uid);
    return out;
  }

  /** Learner: own attempts of a test, with the key and per-question result once visible. */
  function review(uid, quizId, studentId) {
    const ctx = state.context(uid), q = quizOf(state, quizId), t = Date.now();
    if (!q || q.status !== 'published') return fail(404, 'not_found');
    if (!learnerOk(ctx, studentId)) return fail(403, 'forbidden');
    const atts = (state.get('quizAttempts') || []).filter(a => a && a.quizId === q.id && a.studentId === studentId).map(a => learnerAttempt(q, a, t));
    const kv = keyVisible(q, t);
    return { status: 200, body: { keyVisible: kv, scoreVisible: scoreVisible(q, t), closed: closed(q, t), attempts: atts, questions: kv ? (q.questions || []).map(x => ({ id: x.id, type: x.type, text: x.text, img: x.img || '', opts: x.opts || [], ans: x.ans, marks: +x.marks || 0 })) : null } };
  }

  /** Staff / teacher: grade expired attempts, optionally re-grade every submitted one with the current key. */
  async function results(uid, quizId, regrade) {
    const ctx = state.context(uid), q = quizOf(state, quizId);
    if (!q) return fail(404, 'not_found');
    if (!(regrade ? canManage(ctx, q) : canSee(ctx, q))) return fail(403, 'forbidden');
    await state.mutate(get => {
      const list = (get('quizAttempts') || []).slice();
      let changed = sweep(list, get);
      if (regrade) list.forEach((a, i) => { if (a && a.quizId === q.id && a.status === 'submitted') { list[i] = { ...a, ...grade(q, a.answers) }; changed = true; } });
      return changed ? { quizAttempts: list } : {};
    }, uid);
    return { status: 200, body: { attempts: (state.get('quizAttempts') || []).filter(a => a && a.quizId === q.id) } };
  }

  /** Every minute: grade attempts whose time is up. */
  async function tick() {
    const t = Date.now();
    const qs = new Map((state.get('quizzes') || []).map(q => [q.id, q]));
    if (!(state.get('quizAttempts') || []).some(a => a && a.status === 'open' && t > until(a, qs.get(a.quizId)) + GRACE)) return;
    await state.mutate(get => { const list = (get('quizAttempts') || []).slice(); return sweep(list, get, t) ? { quizAttempts: list } : {}; }, 'SERVER');
  }
  setInterval(() => tick().catch(e => log.error('[quiz] sweep failed', e.message)), 60e3).unref();

  return { start, answer, review, results, tick };
}

module.exports = { makeQuiz, grade, learnerQuiz, learnerAttempt, canManage, keyVisible, scoreVisible, TYPES };
