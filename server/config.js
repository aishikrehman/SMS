/* Runtime configuration from environment variables (and an optional .env file in the project root).
   A real environment variable always wins over the .env file. No dependency on dotenv. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

(function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
})();

const env = process.env;
// Production is the default. `npm run dev` passes --dev (development: console fallback for OTP messages).
if (process.argv.includes('--dev')) env.NODE_ENV = 'development';
if (!env.NODE_ENV) env.NODE_ENV = 'production';
const portArg = process.argv.indexOf('--port');
if (portArg > 0 && process.argv[portArg + 1]) env.PORT = process.argv[portArg + 1];
const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(String(v)));
const production = env.NODE_ENV === 'production';
const driver = String(env.DB_DRIVER || 'sqlite').toLowerCase();

const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(+v) ? d : +v);
/** TRUST_PROXY: false (default) · true (= exactly one proxy hop in front) · a hop count · Express subnet list ("loopback, 10.0.0.0/8"). */
function trustProxy(v) {
  if (v === undefined || v === '' || /^(0|false|no|off)$/i.test(v)) return false;
  if (/^(1|true|yes|on)$/i.test(v)) return 1;
  if (/^\d+$/.test(v)) return +v;
  return String(v);
}

const config = {
  ROOT,
  production,
  port: +env.PORT || 3000,
  host: env.HOST || '0.0.0.0',
  driver,                                                        // sqlite | postgres | both
  primary: String(env.DB_PRIMARY || 'sqlite').toLowerCase(),     // which driver serves reads in "both" mode
  sqlitePath: path.resolve(ROOT, env.SQLITE_PATH || 'data/dhee.sqlite'),
  databaseUrl: env.DATABASE_URL || '',
  pgSsl: bool(env.PGSSL, false),
  // Sessions: absolute lifetime and idle timeout (whichever ends first).
  sessionTtlHours: num(env.SESSION_TTL_HOURS, 12),
  sessionIdleMinutes: num(env.SESSION_IDLE_MINUTES, 120),
  // Secure cookie flag: "auto" (default) = whenever the request came over HTTPS (set TRUST_PROXY behind a proxy).
  cookieSecure: env.COOKIE_SECURE === undefined || env.COOKIE_SECURE === '' || env.COOKIE_SECURE === 'auto' ? 'auto' : bool(env.COOKIE_SECURE, false),
  cookieSameSite: /^strict$/i.test(env.COOKIE_SAMESITE || '') ? 'Strict' : 'Lax',
  jsonLimit: env.JSON_LIMIT || '50mb',
  keyMaxMb: num(env.KEY_MAX_MB, 25),                             // largest single top-level key a client may save
  userJsonMaxMb: num(env.USER_JSON_MAX_MB, 8),                   // largest save request from a student / guardian
  trustProxy: trustProxy(env.TRUST_PROXY),
  // Rate limits (failed sign-ins etc.): see server/lib/ratelimit.js
  loginMaxPerAccount: num(env.LOGIN_MAX_PER_ACCOUNT, 5),
  loginMaxPerIp: num(env.LOGIN_MAX_PER_IP, 30),
  lockMinutes: num(env.LOCK_MINUTES, 15),
  // Logs (daily files, JSON lines)
  logDir: path.resolve(ROOT, env.LOG_DIR || 'logs'),
  logKeepDays: num(env.LOG_KEEP_DAYS, 30),
  logRequests: bool(env.LOG_REQUESTS, true),
  // Backups
  backupDir: path.resolve(ROOT, env.BACKUP_DIR || 'backups'),
  backupKeepDays: num(env.BACKUP_KEEP_DAYS, 30),
  backupHour: num(env.BACKUP_HOUR, 2),                           // local hour after which the daily backup runs
  backupAuto: bool(env.BACKUP_AUTO, true),
  // Root User → পরীক্ষামূলক ডেটা: load the demo school / start afresh from the UI. Set ALLOW_DEMO_LOAD=false for a live school.
  allowDemoLoad: bool(env.ALLOW_DEMO_LOAD, true),
  // Product / developer information ("ডেভেলপার তথ্য"). Set by the vendor through the environment or .env;
  // schools cannot change it in the app. DEVELOPER_CREDIT=false hides the public website's footer credit (per plan).
  developer: {
    product: env.DEVELOPER_PRODUCT || 'Dhee SMS',
    version: (() => { try { return require(path.join(ROOT, 'package.json')).version || ''; } catch (_) { return ''; } })(),
    company: env.DEVELOPER_COMPANY || 'DHEE',
    website: env.DEVELOPER_WEBSITE || '',
    email: env.DEVELOPER_EMAIL || '',
    phone: env.DEVELOPER_PHONE || '',
    address: env.DEVELOPER_ADDRESS || '',
    hours: env.DEVELOPER_SUPPORT_HOURS || '',
    credit: bool(env.DEVELOPER_CREDIT, true),
  },
  // Licence (vendor-set): LICENSE_KEY, LICENSE_PLAN, LICENSE_EXPIRES (YYYY-MM-DD), LICENSE_MODULES (comma list).
  license: {
    key: env.LICENSE_KEY || '',
    plan: env.LICENSE_PLAN || '',
    expires: env.LICENSE_EXPIRES || '',
    modules: String(env.LICENSE_MODULES || '').split(',').map(s => s.trim()).filter(Boolean),
  },
};

module.exports = config;
