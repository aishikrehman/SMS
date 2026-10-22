/* ফলাফল পুননিরীক্ষণ (result re-check) — applications are created only here, so a learner never writes
   `recheckReqs` or an invoice directly.

   POST /api/recheck/apply { examId, studentId, subjectIds[], reason }
     · student / guardian for their own child, or staff with exams: edit (the office on the applicant's behalf)
     · the exam's result must be published; one open application per student, exam and subject
     · fee (school.recheck.fee per subject, optional) → one unpaid invoice (kind 'recheck'), paid through the
       usual fee flows (counter, TrxID claim, online checkout)
   The review queue itself (assign a reviewer, re-checked marks, accept / reject) is written by staff and the
   assigned teacher under server/access.js rules. */
'use strict';
const { appendAudit } = require('./public');

const today = () => new Date().toISOString().slice(0, 10);
const OPEN = new Set(['Pending', 'Assigned', 'Reviewed']);

function makeRecheck(state) {
  async function apply(uid, body, ip) {
    const ctx = state.context(uid), b = body || {};
    const examId = String(b.examId || ''), studentId = String(b.studentId || ''), reason = String(b.reason || '').trim().slice(0, 500);
    const subjectIds = [...new Set((Array.isArray(b.subjectIds) ? b.subjectIds : []).map(String))].slice(0, 20);
    const staff = ctx.staff && (ctx.root || ctx.perm('exams', 'edit'));
    if (!staff && !ctx.own.has(studentId) && !ctx.kids.has(studentId)) return { status: 403, body: { error: 'forbidden' } };
    const ex = (state.get('exams') || []).find(e => e.id === examId), st = state.student(studentId);
    if (!ex || !st) return { status: 404, body: { error: 'not_found' } };
    if (!ex.published) return { status: 409, body: { error: 'not_published' } };
    const cfg = ((state.get('school') || {}).recheck) || {};
    if (cfg.on === false) return { status: 409, body: { error: 'closed' } };
    if (cfg.until && today() > cfg.until) return { status: 409, body: { error: 'closed' } };
    const marks = (state.get('marks') || []).filter(m => m.examId === examId && m.studentId === studentId);
    if (!subjectIds.length || subjectIds.some(s => !marks.some(m => m.subjectId === s))) return { status: 400, body: { error: 'bad_subject' } };
    let out = null;
    await state.mutate(get => {
      const list = (get('recheckReqs') || []).slice();
      const dup = subjectIds.filter(s => list.some(r => r.examId === examId && r.studentId === studentId && r.subjectId === s && OPEN.has(r.status)));
      if (dup.length) { out = { status: 409, body: { error: 'duplicate', subjects: dup } }; return {}; }
      const fee = Math.max(0, +cfg.fee || 0) * subjectIds.length, t = Date.now().toString(36).toUpperCase(), put = {};
      let invoiceId = null;
      if (fee > 0) {
        invoiceId = `INV-RC${t}`;
        put.invoices = [...(get('invoices') || []), { id: invoiceId, studentId, item: `ফলাফল পুননিরীক্ষণ ফি — ${ex.name} (${String(subjectIds.length).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d])}টি বিষয়)`, amount: fee, status: 'unpaid', due: today(), month: today().slice(0, 7), kind: 'recheck' }];
      }
      const made = subjectIds.map((s, i) => ({ id: `RC${t}${i}`, examId, studentId, subjectId: s, reason, fee: fee ? fee / subjectIds.length : 0, invoiceId, status: 'Pending', by: uid, byOffice: !!staff && !ctx.own.has(studentId) && !ctx.kids.has(studentId), at: new Date().toISOString() }));
      put.recheckReqs = [...list, ...made];
      put.audit = appendAudit(get('audit'), { role: 'SYSTEM', action: 'RECHECK_APPLY', entity: 'exams', detail: `${studentId} · ${examId} · ${subjectIds.join(', ')}${fee ? ` · ফি ৳${fee}` : ''}` }, ip, uid);
      out = { status: 200, body: { ok: true, ids: made.map(r => r.id), invoiceId, fee } };
      return put;
    }, uid);
    return out;
  }
  return { apply };
}

module.exports = { makeRecheck };
