/* Builds the demo institution's full state (one object, one property per database row).
   js/db.js (the browser's data layer) is loaded into a sandbox first, so the demo records are shaped by
   the same helpers the app uses; base.js and modules.js then add the records. Passwords become scrypt
   hashes here — the browser never sees them. Used only by `npm run seed:demo` (server/seed/demo.js). */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { institutionDefaults } = require('../defaults');
const { hashPassword } = require('../lib/password');
const { appendAudit } = require('../public');

const ROOT = path.resolve(__dirname, '..', '..');
/** The one documented password of the demo staff accounts (Root User, Principal, teachers). */
const DEMO_PASSWORD = 'Demo@2026dhee';

function sandbox() {
  const ctx = { console, crypto: globalThis.crypto, setTimeout, clearTimeout, setInterval() { }, document: { addEventListener() { }, visibilityState: 'hidden' }, addEventListener() { }, fetch() { throw new Error('offline'); } };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of [path.join(ROOT, 'js', 'db.js'), path.join(__dirname, 'base.js'), path.join(__dirname, 'modules.js')]) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
  return ctx;
}

/** Run `fn` over `items` with at most `n` at a time (scrypt is CPU-bound and uses the thread pool). */
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } })); }

async function buildDemo({ now = new Date(), log = () => { } } = {}) {
  const ctx = sandbox();
  ctx.__opts = { now, password: DEMO_PASSWORD };
  const out = vm.runInContext('(() => { const c = demoBase(__opts); return c; })()', ctx);
  // structural defaults first (grading, RBAC, flags, chart of accounts, sessions …), then the demo records
  const defs = institutionDefaults({ name: 'Dhee Academy', nameBn: 'ধী একাডেমি', type: 'সাধারণ বিদ্যালয়', eiin: '108245' }, now);
  const school = { ...defs.school, ...out.s.school };
  out.s = Object.assign(defs, out.s, { school });
  ctx.__ctx = out;
  vm.runInContext('demoModules(__ctx)', ctx);
  const s = JSON.parse(JSON.stringify(out.s));   // leave the sandbox realm
  s.meta = { ...s.meta, seq: out.seq + 10, seededAt: now.toISOString(), demo: true };
  delete s.meta.setupAt;

  /* Sign-in IDs, as the app's login policy sets them: student → Student ID / registration no.;
     a guardian-only account → mobile number for both. Staff accounts use DEMO_PASSWORD. */
  const roles = id => s.userRoles.filter(r => r.userId === id).map(r => r.role);
  const logins = [];
  for (const u of s.users) {
    const st = s.students.find(x => x.userId === u.id), rs = roles(u.id);
    let pw = DEMO_PASSWORD;
    if (st) { u.username = st.id; pw = st.regNo; u.pwDefault = true; }
    else if (rs.length === 1 && rs[0] === 'GUARDIAN') { u.username = u.phone; pw = u.phone; u.pwDefault = true; }
    u._pw = pw;
  }
  const kamal = s.users.find(u => u.email === 'guardian@dheeacademy.edu.bd'), ayaan = s.students.find(x => s.users.find(u => u.id === x.userId)?.email === 'student@dheeacademy.edu.bd');
  logins.push(['রুট ব্যবহারকারী', 'root', DEMO_PASSWORD], ['অধ্যক্ষ (+ শিক্ষক, অভিভাবক)', 'principal', DEMO_PASSWORD], ['শিক্ষক (গণিত, দশম শ্রেণির শ্রেণিশিক্ষক)', 'teacher', DEMO_PASSWORD]);
  if (ayaan) logins.push(['শিক্ষার্থী (আয়ান হোসেন, দশম শ্রেণি)', ayaan.id, ayaan.regNo]);
  if (kamal) logins.push(['অভিভাবক (কামাল হোসেন — ৩ সন্তান)', kamal.username, kamal._pw]);
  log(`Hashing ${s.users.length} demo passwords …`);
  await pool(s.users, 8, async u => { u.pwHash = await hashPassword(u._pw); delete u._pw; delete u.password; });

  s.audit = appendAudit([], { role: 'SYSTEM', action: 'DEMO_SEED', entity: 'system', detail: 'ডেমো তথ্য দিয়ে ডেটাবেস তৈরি (npm run seed:demo)' }, '');
  // audit lines the demo modules describe (e.g. the OMR-read marks), chained after the seed line
  (s._demoAudit || []).forEach(a => { s.audit = appendAudit(s.audit, { role: 'SYSTEM', ...a }, ''); });
  delete s._demoAudit;
  return { state: s, logins, password: DEMO_PASSWORD };
}

module.exports = { buildDemo, DEMO_PASSWORD };
