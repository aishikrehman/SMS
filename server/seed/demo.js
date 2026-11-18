/* npm run seed:demo — fill an EMPTY database with the demo institution "ধী একাডেমি" (two campuses,
   teachers, ~140 students and their guardians, a year of attendance, exams and marks, fees, ledger,
   payroll, transport, hostel, library …). Never run it on a live school's database.

     npm run seed:demo                         refuses when the database already has users
     npm run seed:demo -- --force              wipes the database first, then seeds
     npm run seed:demo -- --mysql-url mysql://user:pass@host:3306/dhee_demo   fills a separate demo database instead

   Honours DB_DRIVER / MYSQL_URL / DATABASE_URL like the server.
   Stop the server first: a running server keeps its own in-memory copy. */
'use strict';
const path = require('node:path');
const config = require('../config');
const { createStore, describe } = require('../store');
const { buildDemo } = require('./build');

(async () => {
  const argv = process.argv.slice(2), force = argv.includes('--force'), oi = argv.indexOf('--mysql-url');
  const out = oi >= 0 ? argv[oi + 1] : null;
  if (oi >= 0 && !out) { console.error('--mysql-url needs a URL, e.g. --mysql-url mysql://dhee:secret@localhost:3306/dhee_demo'); process.exit(1); }
  if (!out) {
    let run = null; try { run = require('../backup').runningServer(); } catch (_) { }
    if (run && !force) { console.error(`The Dhee server is running (pid ${run.pid}). Stop it first.`); process.exit(1); }
  }
  const store = out ? createStore({ driver: 'mysql', mysql: { url: out } }) : createStore();
  const target = out ? out.replace(/:[^:@/]*@/, '@') : describe();
  try {
    await store.init();
    const rows = await store.getKeys(['users']), users = rows[0] && Array.isArray(rows[0].value) ? rows[0].value : [];
    if ((users.length || (await store.count()) > 0) && !force) {
      console.error(`The database [${target}] already has data${users.length ? ` (${users.length} users)` : ''}. Nothing was changed.\nUse --force to WIPE it and load the demo, or --mysql-url <url> for a separate demo database.`);
      process.exitCode = 1; return;
    }
    if (force) { await store.wipe(); console.log(`Wiped ${store.name} [${target}].`); }
    console.log('Building the demo institution …');
    const { state, logins } = await buildDemo({ log: m => console.log(m) });
    const ok = await store.bootstrap(state, 'DEMO_SEED');
    if (!ok) { console.error('The database is not empty — nothing written.'); process.exitCode = 1; return; }
    await store.setMeta('setup', { at: new Date().toISOString(), demo: true });
    console.log(`\nDemo data written to ${store.name} [${target}]: ${Object.keys(state).length} keys, ${state.users.length} users, ${state.students.length} students.\n`);
    console.log('Demo sign-ins (ডেমো লগইন):');
    const w = Math.max(...logins.map(l => l[0].length));
    logins.forEach(([who, id, pw]) => console.log(`  ${who.padEnd(w)}  ইউজার আইডি: ${id}   পাসওয়ার্ড: ${pw}`));
    console.log('\nOther students: user ID = Student ID, password = registration number. Guardians: mobile number for both.');
    console.log('This is DEMO data — never use it for a real school.');
  } catch (e) { console.error(`Demo seed failed: ${e.stack || e.message}`); process.exitCode = 1; }
  finally { await store.close().catch(() => { }); }
})();
