/* Recover a lost password from the server console (for the Root User / IT office).
   Sets a new temporary password for one account, signs it out everywhere and forces a change at next login.

     npm run set-password                       lists the Root User accounts
     npm run set-password -- <username>         new random temporary password, printed once
     npm run set-password -- <username> <pw>    use this temporary password instead

   Stop the server first — a running server keeps its in-memory copy and would overwrite the change. */
'use strict';
const crypto = require('node:crypto');
const { createStore } = require('./store');
const { hashPassword } = require('./lib/password');

(async () => {
  const run = require('./backup').runningServer();
  if (run && !process.argv.includes('--force')) { console.error(`The Dhee server is running (pid ${run.pid}). Stop it first (Ctrl+C), then run this again.`); process.exit(1); }
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const store = createStore();
  try {
    await store.init();
    const rows = await store.getKeys(['users', 'userRoles']);
    const users = rows.find(r => r.key === 'users')?.value || [], roles = rows.find(r => r.key === 'userRoles')?.value || [];
    if (!users.length) { console.error('No users in this database. Open the site to run the first-run setup.'); process.exit(1); }
    const rootIds = new Set(roles.filter(r => r.role === 'ADMIN' || r.role === 'SUPERADMIN').map(r => r.userId));
    if (!args[0]) {
      console.log('Root User accounts:');
      users.filter(u => rootIds.has(u.id)).forEach(u => console.log(`  ${u.username}   (${u.name || ''}${u.active === false ? ', inactive' : ''})`));
      console.log('\nUsage: npm run set-password -- <username> [new-temporary-password]');
      return;
    }
    const want = String(args[0]).trim().toLowerCase();
    const u = users.find(x => String(x.username || '').toLowerCase() === want || x.id === args[0]);
    if (!u) { console.error(`No account with user ID "${args[0]}".`); process.exit(1); }
    const pw = args[1] || crypto.randomBytes(9).toString('base64url');
    u.pwHash = await hashPassword(pw); u.mustChange = true; u.active = true;
    await store.putKeys({ users }, 'console');
    await store.deleteUserSessions(u.id, '');
    console.log(`\nTemporary password for "${u.username}": ${pw}\nSign in with it; you will be asked to choose a new password.\n`);
  } catch (e) { console.error(`Failed: ${e.message}`); process.exit(1); }
  finally { await store.close().catch(() => { }); }
})();
