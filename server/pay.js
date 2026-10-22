/* Payments confirmed on the server.

   Only the server marks an invoice paid for a student or guardian (server/access.js refuses their own
   `payments` and invoice-status writes). Two paths:

   1. Manual TrxID: the payer sends money to the school's merchant number and submits a claim
      (DB.s.payClaims, status Pending). An accountant (fees: edit) verifies it against the wallet
      statement → POST /api/pay/claims/:id/verify creates the payment, marks the invoices paid and
      posts the receipt voucher; …/reject closes the claim with a reason.
   2. Online checkout: POST /api/pay/checkout asks the configured payment server (Hyperswitch or a
      custom server, Features & Settings → পেমেন্ট গেটওয়ে) for a payment session with the secret key
      from the environment (PAY_API_KEY), remembers the intent (server-owned key `payIntents`) and
      returns the redirect URL. The gateway's signed callback (POST /api/pay/webhook, HMAC with
      PAY_WEBHOOK_SECRET) confirms it; for Hyperswitch the payment is fetched again from the gateway
      before the invoices are marked paid.

   Accountants' counter payments are unchanged (staff write `payments` directly under RBAC). */
'use strict';
const crypto = require('node:crypto');
const { appendAudit } = require('./public');
const { trxUsed } = require('./access');

const MFS = ['bKash', 'Nagad', 'Rocket'];
const env = process.env;
const z = n => String(n).padStart(2, '0');
const today = (d = new Date()) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
const mfsAccount = m => (MFS.includes(m) ? '1020' : m === 'Cash' ? '1000' : '1010');
const money = n => `৳${Number(n || 0).toLocaleString('en-IN')}`;

/** May this user pay (or check out) for this student? Learner: own / child. Staff: fees edit. */
function canPayFor(state, uid, studentId) {
  const ctx = state.context(uid);
  if (ctx.staff) return ctx.root || ctx.perm('fees', 'edit');
  return ctx.own.has(studentId) || ctx.kids.has(studentId);
}
function canVerify(state, uid) { const ctx = state.context(uid); return ctx.staff && (ctx.root || ctx.perm('fees', 'edit')); }

/**
 * Build the writes that record a confirmed payment (same shape as DB.recordPayment in js/db.js).
 * get(key) → current value. Returns { put, pay } or { error }.
 */
function settle(state, get, { studentId, invoiceIds, method, txn, msisdn = null, channel, by, ip, note = '' }) {
  const invoices = (get('invoices') || []).slice();
  const ids = new Set(invoiceIds || []);
  const invs = invoices.filter(i => ids.has(i.id));
  if (!invs.length || invs.length !== ids.size || invs.some(i => i.studentId !== studentId)) return { error: 'invoice_missing' };
  if (invs.some(i => i.status !== 'unpaid')) return { error: 'invoice_changed' };
  const meta = { ...(get('meta') || {}) };
  let seq = +meta.seq || 1000;
  const nid = p => `${p}${String(++seq).padStart(4, '0')}`;
  const amount = invs.reduce((s, i) => s + (+i.amount || 0), 0);
  const st = state.student(studentId) || {};
  const cls = (get('classes') || []).find(c => c.id === st.classId);
  const pay = { id: nid('PAY'), invoiceIds: invs.map(i => i.id), studentId, amount, method, txn: String(txn || '').toUpperCase(), msisdn, channel, verified: true, date: today(), by: by || null, confirmedBy: 'SERVER' };
  const nextInv = invoices.map(i => (ids.has(i.id) ? { ...i, status: 'paid', paymentId: pay.id } : i));
  const v = { id: nid('RV'), date: today(), memo: `ফি রসিদ ${pay.id} — ${st.nameBn || st.name || studentId}${note ? ` (${note})` : ''}`, lines: [{ acct: mfsAccount(method), dr: amount, cr: 0 }, { acct: '1100', dr: 0, cr: amount }], ref: pay.id, postedBy: by || null, kind: 'RV', campusId: cls ? cls.campusId : null, payee: null };
  meta.seq = seq;
  const put = {
    payments: [...(get('payments') || []), pay], invoices: nextInv, journal: [...(get('journal') || []), v], meta,
    audit: appendAudit(get('audit'), { role: 'SYSTEM', action: 'FEE_PAYMENT_CONFIRMED', entity: 'payments', detail: `${st.nameBn || st.name || studentId}: ${money(amount)} — ${method} ${channel} (${pay.id}, TrxID ${pay.txn})${note ? ` · ${note}` : ''}` }, ip, by || null),
  };
  return { put, pay };
}

/** SMS line in the message log for the payer (and the phone the wallet paid from). */
function outboxLine(get, to, message) {
  if (!to) return null;
  const list = (get('outbox') || []).slice(), meta = get('meta') || {};
  list.unshift({ id: `MSG${Date.now().toString().slice(-8)}`, ts: new Date().toISOString(), status: 'Delivered', kind: 'SMS', to, message });
  if (list.length > 500) list.length = 500;
  return list;
}

/* ---------- 1. manual TrxID claims ---------- */
async function verifyClaim(state, id, { uid, ip }) {
  let result = { ok: false, error: 'not_found' };
  await state.mutate(get => {
    const claims = (get('payClaims') || []).slice(), i = claims.findIndex(c => c.id === id);
    if (i < 0) { result = { ok: false, error: 'not_found' }; return {}; }
    const c = claims[i];
    if (c.status !== 'Pending') { result = { ok: false, error: 'not_pending', status: c.status }; return {}; }
    // the same TrxID already used by another payment / admission / service request
    const others = { ...state, get: k => (k === 'payClaims' ? claims.filter(x => x.id !== id) : get(k)) };
    if (trxUsed(others, c.txn)) { result = { ok: false, error: 'trx_used' }; return {}; }
    const r = settle(state, get, { studentId: c.studentId, invoiceIds: c.invoiceIds, method: c.method, txn: c.txn, msisdn: c.msisdn || null, channel: 'Manual TrxID', by: uid, ip, note: `TrxID দাবি ${c.id} যাচাইকৃত` });
    if (r.error) { result = { ok: false, error: r.error }; return {}; }
    claims[i] = { ...c, status: 'Verified', paymentId: r.pay.id, decidedBy: uid, decidedAt: new Date().toISOString() };
    const payer = state.user(c.by), school = get('school') || {};
    const ob = outboxLine(get, payer && payer.phone, `${school.shortName || school.nameBn || ''}: আপনার ${money(r.pay.amount)} পরিশোধ (TrxID ${c.txn}) যাচাই করে গ্রহণ করা হয়েছে। রসিদ ${r.pay.id}।`);
    result = { ok: true, payment: r.pay };
    return { ...r.put, payClaims: claims, ...(ob ? { outbox: ob } : {}) };
  }, uid);
  return result;
}

async function rejectClaim(state, id, { uid, ip, reason }) {
  let result = { ok: false, error: 'not_found' };
  const why = String(reason || '').trim().slice(0, 300);
  await state.mutate(get => {
    const claims = (get('payClaims') || []).slice(), i = claims.findIndex(c => c.id === id);
    if (i < 0) return {};
    const c = claims[i];
    if (c.status !== 'Pending') { result = { ok: false, error: 'not_pending', status: c.status }; return {}; }
    claims[i] = { ...c, status: 'Rejected', reason: why, decidedBy: uid, decidedAt: new Date().toISOString() };
    const payer = state.user(c.by), school = get('school') || {};
    const ob = outboxLine(get, payer && payer.phone, `${school.shortName || school.nameBn || ''}: আপনার TrxID ${c.txn} দিয়ে ${money(c.amount)} পরিশোধের দাবি মেলেনি${why ? ` — ${why}` : ''}। প্রয়োজনে অফিসে যোগাযোগ করুন।`);
    result = { ok: true };
    return { payClaims: claims, ...(ob ? { outbox: ob } : {}), audit: appendAudit(get('audit'), { role: 'SYSTEM', action: 'PAY_CLAIM_REJECTED', entity: 'payments', detail: `${c.id} (TrxID ${c.txn}, ${money(c.amount)}) বাতিল${why ? `: ${why}` : ''}` }, ip, uid) };
  }, uid);
  return result;
}

/* ---------- 2. online checkout through the configured gateway ---------- */
function gw(state) {
  const g = ((state.get('config') || {}).payGw) || {};
  return { provider: g.provider || '', server: String(g.server || '').replace(/\/$/, ''), publishable: g.publishable || '', returnUrl: g.returnUrl || '', key: env.PAY_API_KEY || '', hookSecret: env.PAY_WEBHOOK_SECRET || '' };
}
function gatewayReady(state) { const g = gw(state); return !!(g.provider && g.server && g.hookSecret && (g.provider !== 'hyperswitch' || g.key)); }

async function checkout(state, { uid, studentId, invoiceIds, method, origin, portal }) {
  const g = gw(state);
  if (!gatewayReady(state)) return { ok: false, error: 'not_configured' };
  if (!canPayFor(state, uid, studentId)) return { ok: false, error: 'forbidden' };
  const ids = Array.isArray(invoiceIds) ? invoiceIds.map(String).slice(0, 60) : [];
  const invs = (state.get('invoices') || []).filter(i => ids.includes(i.id));
  if (!invs.length || invs.length !== ids.length || invs.some(i => i.studentId !== studentId || i.status !== 'unpaid')) return { ok: false, error: 'invoice_changed' };
  const open = (state.get('payClaims') || []).filter(c => c.status === 'Pending').flatMap(c => c.invoiceIds || []);
  if (invs.some(i => open.includes(i.id))) return { ok: false, error: 'claim_pending' };
  const amount = invs.reduce((s, i) => s + (+i.amount || 0), 0);
  const ref = 'OP' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase();
  const back = g.returnUrl || `${origin}/${portal === 'student' ? 'student' : 'guardian'}/fees`;
  let body, headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (g.provider === 'hyperswitch') {
    headers['api-key'] = g.key;
    body = { amount: Math.round(amount * 100), currency: 'BDT', confirm: false, capture_method: 'automatic', return_url: back, payment_link: true, description: `Fees ${ref}`, metadata: { dhee_ref: ref } };
  } else {
    if (g.key) headers.Authorization = `Bearer ${g.key}`;
    body = { provider: g.provider, method, amount, currency: 'BDT', reference: ref, return_url: back, callback_url: `${origin}/api/pay/webhook`, publishable_key: g.publishable };
  }
  let j;
  try {
    const r = await fetch(`${g.server}/payments`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    if (!r.ok) return { ok: false, error: 'gateway_error', status: r.status };
    j = await r.json();
  } catch (e) { return { ok: false, error: 'gateway_unreachable' }; }
  const url = j.redirect_url || (j.next_action && j.next_action.redirect_to_url) || (j.payment_link && j.payment_link.link);
  if (!url || !/^https:\/\//i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(url)) return { ok: false, error: 'gateway_no_link' };
  const intent = { ref, providerId: String(j.payment_id || j.id || ''), studentId, invoiceIds: ids, amount, method, by: uid, status: 'Pending', at: new Date().toISOString() };
  await state.mutate(get => {
    const list = [intent, ...(get('payIntents') || [])];
    if (list.length > 5000) list.length = 5000;
    return { payIntents: list };
  }, uid);
  return { ok: true, ref, url };
}

const OK_STATUS = new Set(['succeeded', 'success', 'paid', 'charged', 'completed']);
const FAIL_STATUS = new Set(['failed', 'cancelled', 'canceled', 'expired', 'declined']);
const safeEq = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); };

/** Signed gateway callback. Returns { status, body } for the HTTP answer. */
async function webhook(state, raw, headers, { ip, log }) {
  const g = gw(state);
  if (!g.hookSecret) return { status: 503, body: { error: 'not_configured' } };
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw || ''));
  const s512 = crypto.createHmac('sha512', g.hookSecret).update(buf).digest('hex');
  const s256 = crypto.createHmac('sha256', g.hookSecret).update(buf).digest('hex');
  const sig = String(headers['x-webhook-signature-512'] || headers['x-dhee-signature'] || '').replace(/^sha(256|512)=/, '').toLowerCase();
  if (!sig || !(safeEq(sig, s512) || safeEq(sig, s256))) { log.warn('[pay] webhook with a bad signature', { ip }); return { status: 401, body: { error: 'bad_signature' } }; }
  let b; try { b = JSON.parse(buf.toString('utf8')); } catch (_) { return { status: 400, body: { error: 'bad_json' } }; }
  // Hyperswitch: { event_type, content: { object: { payment_id, status, amount, metadata } } } · custom: { reference, status, amount, txn }
  const o = (b.content && b.content.object) || b;
  const ref = String((o.metadata && o.metadata.dhee_ref) || o.reference || '');
  const pid = String(o.payment_id || o.id || '');
  const intent = (state.get('payIntents') || []).find(x => (ref && x.ref === ref) || (pid && x.providerId === pid));
  if (!intent) return { status: 404, body: { error: 'unknown_payment' } };
  if (intent.status === 'Paid') return { status: 200, body: { ok: true, already: true } };
  let status = String(o.status || '').toLowerCase();
  let paid = g.provider === 'hyperswitch' ? (+o.amount || 0) / 100 : +o.amount || 0;
  // Hyperswitch: confirm with the gateway itself before money is booked
  if (g.provider === 'hyperswitch' && g.key && pid) {
    try {
      const r = await fetch(`${g.server}/payments/${encodeURIComponent(pid)}`, { headers: { 'api-key': g.key, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { status: 502, body: { error: 'gateway_check_failed' } };
      const p = await r.json(); status = String(p.status || '').toLowerCase(); paid = (+p.amount_received || +p.amount || 0) / 100;
    } catch (_) { return { status: 502, body: { error: 'gateway_check_failed' } }; }
  }
  const setIntent = (get, patch) => (get('payIntents') || []).map(x => (x.ref === intent.ref ? { ...x, ...patch } : x));
  if (FAIL_STATUS.has(status)) { await state.mutate(get => ({ payIntents: setIntent(get, { status: 'Failed', at2: new Date().toISOString() }) }), 'GATEWAY'); return { status: 200, body: { ok: true } }; }
  if (!OK_STATUS.has(status)) return { status: 202, body: { ok: true, pending: true } };
  let out = { status: 200, body: { ok: true } };
  await state.mutate(get => {
    if (Math.abs(paid - intent.amount) > 0.5) {
      out = { status: 200, body: { ok: true, review: true } };
      return { payIntents: setIntent(get, { status: 'Review', note: `amount ${paid} ≠ ${intent.amount}`, providerId: pid || intent.providerId }), audit: appendAudit(get('audit'), { role: 'SYSTEM', action: 'PAY_GATEWAY_REVIEW', entity: 'payments', detail: `${intent.ref}: গেটওয়ের পরিমাণ ${paid} বিলের ${intent.amount}-এর সঙ্গে মেলেনি — হিসাব শাখা দেখবে` }, ip, null) };
    }
    const r = settle(state, get, { studentId: intent.studentId, invoiceIds: intent.invoiceIds, method: intent.method || 'Card', txn: pid || o.txn || intent.ref, channel: 'Online checkout', by: intent.by, ip, note: `গেটওয়ে ${intent.ref}` });
    if (r.error) {
      out = { status: 200, body: { ok: true, review: true } };
      return { payIntents: setIntent(get, { status: 'Review', note: r.error, providerId: pid || intent.providerId }), audit: appendAudit(get('audit'), { role: 'SYSTEM', action: 'PAY_GATEWAY_REVIEW', entity: 'payments', detail: `${intent.ref}: অর্থ গৃহীত, কিন্তু বিল বদলে গেছে (${r.error}) — হিসাব শাখা দেখবে` }, ip, null) };
    }
    return { ...r.put, payIntents: setIntent(get, { status: 'Paid', paymentId: r.pay.id, providerId: pid || intent.providerId, paidAt: new Date().toISOString() }) };
  }, 'GATEWAY');
  return out;
}

function intentStatus(state, ref, uid) {
  const x = (state.get('payIntents') || []).find(i => i.ref === ref);
  if (!x || (x.by !== uid && !canVerify(state, uid))) return null;
  return { ref: x.ref, status: x.status, amount: x.amount, paymentId: x.paymentId || null };
}

module.exports = { settle, verifyClaim, rejectClaim, checkout, webhook, intentStatus, canVerify, gatewayReady };
