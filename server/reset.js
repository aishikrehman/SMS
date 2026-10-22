/* Wipe the database back to empty (state, sessions, meta) for the configured DB_DRIVER.
   The next visit shows the first-run setup page (প্রাথমিক সেটআপ).

     npm run reset            asks for confirmation
     npm run reset -- --yes   no question

   Stop the server first — a running server keeps its in-memory copy and would write it back. */
'use strict';
const readline = require('node:readline');
const config = require('./config');
const { createStore } = require('./store');

(async () => {
  const run = require('./backup').runningServer();
  if (run && !process.argv.includes('--force')) { console.error(`The Dhee server is running (pid ${run.pid}). Stop it first.`); process.exit(1); }
  const target = config.driver === 'sqlite' ? config.sqlitePath : config.driver === 'postgres' ? 'DATABASE_URL' : `both (${config.sqlitePath} + DATABASE_URL)`;
  if (!process.argv.includes('--yes')) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ans = await new Promise(r => rl.question(`Delete ALL data in ${config.driver} store [${target}]? Type "yes": `, r));
    rl.close();
    if (ans.trim().toLowerCase() !== 'yes') { console.log('Cancelled.'); process.exit(1); }
  }
  const store = createStore();
  try { await store.init(); await store.wipe(); console.log(`Database wiped (${store.name}). Restart the server; the next visit shows the first-run setup page.`); }
  catch (e) { console.error(`Reset failed: ${e.message}`); process.exit(1); }
  finally { await store.close().catch(() => { }); }
})();
