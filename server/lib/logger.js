/* Structured logs: one JSON object per line, written to LOG_DIR (default logs/) in daily files
     logs/app-YYYY-MM-DD.log       start-up, warnings, errors
     logs/access-YYYY-MM-DD.log    one line per API request (method, path, status, ms, ip, user)
   Files older than LOG_KEEP_DAYS (default 30) are deleted. Every line is also echoed to the console
   (access lines only in development), so `pm2 logs` / `journalctl` keep working.

   Never log secrets: request bodies are not logged, query strings are cut off, and any field whose
   name looks like a secret is replaced with "[redacted]". */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');

const SECRET = /pass|pwd|token|secret|otp|code|cookie|authorization|hash|apikey|api_key/i;
const day = (d = new Date()) => {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};

function redact(v, depth = 0) {
  if (v instanceof Error) return { message: v.message, stack: v.stack };
  if (!v || typeof v !== 'object' || depth > 4) return typeof v === 'string' && v.length > 4000 ? v.slice(0, 4000) + '…' : v;
  if (Array.isArray(v)) return v.slice(0, 50).map(x => redact(x, depth + 1));
  const o = {};
  for (const [k, x] of Object.entries(v)) o[k] = SECRET.test(k) ? '[redacted]' : redact(x, depth + 1);
  return o;
}

class Logger {
  constructor({ dir = config.logDir, keepDays = config.logKeepDays, console: echo = true } = {}) {
    this.dir = dir; this.keepDays = keepDays; this.echo = echo; this.streams = new Map(); this.ok = true;
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { this.ok = false; console.error(`[log] cannot create ${dir}: ${e.message} — logging to the console only`); }
    this.prune();
    this.timer = setInterval(() => this.prune(), 6 * 3600e3); this.timer.unref();
  }
  stream(kind) {
    const d = day(), cur = this.streams.get(kind);
    if (cur && cur.day === d) return cur.s;
    if (cur) cur.s.end();
    const s = fs.createWriteStream(path.join(this.dir, `${kind}-${d}.log`), { flags: 'a' });
    s.on('error', e => { if (this.ok) console.error(`[log] write failed: ${e.message}`); this.ok = false; });
    this.streams.set(kind, { day: d, s });
    return s;
  }
  write(kind, level, msg, fields) {
    const line = { ts: new Date().toISOString(), level, msg: String(msg), ...(fields ? redact(fields) : {}) };
    const json = JSON.stringify(line);
    if (this.ok) { try { this.stream(kind).write(json + '\n'); } catch (_) { } }
    if (this.echo && (kind !== 'access' || !config.production)) {
      const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      out(`${line.ts} ${level === 'info' ? '' : level.toUpperCase() + ' '}${line.msg}${fields && kind !== 'access' ? ' ' + JSON.stringify(redact(fields)) : ''}`);
    }
  }
  /** (msg, fields?) or console style (a, b, c …) — non-object extras are appended to the message. */
  args(level, a) {
    let fields;
    if (a.length > 1 && a[a.length - 1] && typeof a[a.length - 1] === 'object' && !(a[a.length - 1] instanceof Error)) fields = a.pop();
    const msg = a.map(x => (x instanceof Error ? x.stack || x.message : String(x))).join(' ');
    this.write('app', level, msg, fields);
  }
  info(...a) { this.args('info', a); }
  warn(...a) { this.args('warn', a); }
  error(...a) { this.args('error', a); }
  access(f) { this.write('access', 'info', `${f.method} ${f.path} ${f.status} ${f.ms}ms`, f); }
  /* console-style helpers used by the older code: log.log('[x]', 'text', …) */
  log(...a) { this.args('info', a); }
  prune() {
    if (!this.ok) return;
    const limit = Date.now() - this.keepDays * 864e5;
    try {
      for (const f of fs.readdirSync(this.dir)) {
        const m = /^(app|access)-(\d{4}-\d{2}-\d{2})\.log$/.exec(f);
        if (m && Date.parse(m[2]) < limit) fs.rmSync(path.join(this.dir, f), { force: true });
      }
    } catch (_) { }
  }
  close() { clearInterval(this.timer); for (const { s } of this.streams.values()) s.end(); this.streams.clear(); }
}

/** Express middleware: one access line per /api request (no bodies, no query strings). */
function accessLog(logger) {
  return (req, res, next) => {
    const t0 = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number((process.hrtime.bigint() - t0) / 1000000n);
      logger.access({ method: req.method, path: String(req.originalUrl || req.url).split('?')[0].slice(0, 200), status: res.statusCode, ms, ip: req.ip, user: req.user ? req.user.id : null, bytes: +res.getHeader('Content-Length') || undefined });
    });
    next();
  };
}

module.exports = { Logger, accessLog, redact, day };
