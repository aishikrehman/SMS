/* npm run check — (1) syntax-check every JavaScript file of the server and the front end,
                    (2) validate the configuration (.env / environment) and the folders the server writes to.
   Exit code 1 when anything is wrong; warnings alone do not fail. `--syntax` or `--config` runs one part. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const only = process.argv.find(a => a === '--syntax' || a === '--config');
let bad = 0;

if (only !== '--config') {
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', 'data', 'logs', 'backups'].includes(e.name) || e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js')) files.push(p);
    }
  })(root);
  let n = 0;
  for (const f of files) {
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
    catch (e) { n++; console.error(`✗ ${path.relative(root, f)}\n${String(e.stderr || e.message).trim()}\n`); }
  }
  console.log(`${files.length - n}/${files.length} files parse cleanly.`);
  bad += n;
}

if (only !== '--syntax') {
  const config = require('./config');
  const env = process.env, errors = [], warns = [];
  const [maj, min] = process.versions.node.split('.').map(Number);
  if (maj < 22 || (maj === 22 && min < 13)) errors.push(`Node.js ${process.versions.node} is too old — 22.13 or newer is required.`);
  if (!(config.port > 0 && config.port < 65536)) errors.push(`PORT "${env.PORT}" is not a valid port.`);
  if (!['sqlite', 'postgres', 'both'].includes(config.driver)) errors.push(`DB_DRIVER "${config.driver}" must be sqlite, postgres or both.`);
  if (config.driver === 'both' && !['sqlite', 'postgres'].includes(config.primary)) errors.push(`DB_PRIMARY "${config.primary}" must be sqlite or postgres.`);
  if (config.driver !== 'sqlite') {
    if (!config.databaseUrl) errors.push('DATABASE_URL is required for DB_DRIVER=postgres or both.');
    else if (!/^postgres(ql)?:\/\//.test(config.databaseUrl)) errors.push('DATABASE_URL must start with postgres://');
    try { require.resolve('pg'); } catch (_) { errors.push('The "pg" package is not installed (npm install pg).'); }
  }
  const writable = (dir, what) => { try { fs.mkdirSync(dir, { recursive: true }); const t = path.join(dir, `.check-${process.pid}`); fs.writeFileSync(t, 'x'); fs.rmSync(t); } catch (e) { errors.push(`${what} folder ${dir} is not writable: ${e.message}`); } };
  if (config.driver !== 'postgres') writable(path.dirname(config.sqlitePath), 'SQLITE_PATH');
  writable(config.backupDir, 'BACKUP_DIR');
  writable(config.logDir, 'LOG_DIR');
  const pos = (name, v) => { if (!(Number.isFinite(v) && v > 0)) errors.push(`${name} must be a positive number (now "${env[name]}").`); };
  pos('SESSION_TTL_HOURS', config.sessionTtlHours); pos('SESSION_IDLE_MINUTES', config.sessionIdleMinutes);
  pos('KEY_MAX_MB', config.keyMaxMb); pos('USER_JSON_MAX_MB', config.userJsonMaxMb);
  pos('BACKUP_KEEP_DAYS', config.backupKeepDays); pos('LOG_KEEP_DAYS', config.logKeepDays);
  pos('LOGIN_MAX_PER_ACCOUNT', config.loginMaxPerAccount); pos('LOGIN_MAX_PER_IP', config.loginMaxPerIp); pos('LOCK_MINUTES', config.lockMinutes);
  if (!(config.backupHour >= 0 && config.backupHour <= 23)) errors.push('BACKUP_HOUR must be 0–23.');
  if (!/^\d+(\.\d+)?(kb|mb)$/i.test(config.jsonLimit)) errors.push(`JSON_LIMIT "${config.jsonLimit}" must look like 50mb.`);
  if (env.COOKIE_SECURE && !/^(auto|true|false|1|0|yes|no|on|off)$/i.test(env.COOKIE_SECURE)) errors.push('COOKIE_SECURE must be auto, true or false.');
  if (env.COOKIE_SAMESITE && !/^(lax|strict)$/i.test(env.COOKIE_SAMESITE)) errors.push('COOKIE_SAMESITE must be Lax or Strict.');
  if (config.production) {
    if (config.cookieSecure === false) warns.push('COOKIE_SECURE=false in production: the session cookie may travel over plain HTTP.');
    if (!config.trustProxy && config.host !== '127.0.0.1' && config.host !== 'localhost') warns.push('TRUST_PROXY is off: behind nginx/Caddy set TRUST_PROXY=true (real client IPs, Secure cookies). Without a proxy, serve HTTPS some other way.');
    if (config.allowDemoLoad) warns.push('ALLOW_DEMO_LOAD is on: the Root User can replace all data with the demo school or wipe it (a backup is taken first). Set ALLOW_DEMO_LOAD=false on a live school.');
    if (env.PAY_API_KEY && !env.PAY_WEBHOOK_SECRET) warns.push('PAY_API_KEY is set but PAY_WEBHOOK_SECRET is not: online checkout stays off until the gateway callback can be verified.');
    if (!env.SMS_API_URL && !env.EMAIL_API_URL) warns.push('No SMS_API_URL / EMAIL_API_URL: password recovery by one-time code is unavailable (the office resets passwords instead).');
  }
  if (path.resolve(config.backupDir) === path.dirname(config.sqlitePath)) warns.push('BACKUP_DIR is the database folder; keep backups on another disk or copy them off the server.');
  for (const w of warns) console.warn(`! ${w}`);
  for (const e of errors) console.error(`✗ ${e}`);
  console.log(errors.length ? `Configuration: ${errors.length} error(s).` : `Configuration OK (${config.driver}${config.driver !== 'postgres' ? ` · ${config.sqlitePath}` : ''} · backups ${config.backupDir} · logs ${config.logDir}).`);
  bad += errors.length;
}
process.exit(bad ? 1 : 0);
