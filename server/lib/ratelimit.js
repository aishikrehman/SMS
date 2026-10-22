/* In-memory rate limiting (single server process; see README → "Run a single server process").

   Window(max, windowMs)          at most `max` events per key in a fixed window → retry-after seconds
   Guard(max, windowMs, lockMs)   counts FAILURES per key; `max` failures inside the window lock the key.
                                  Each new lock of the same key doubles (backoff) up to `maxLockMs`; the
                                  strike count is forgotten after a day without failures. A success resets it.

   Keys are opaque strings (an IP address, "acct:<login id>" …). Entries are swept every minute and the
   maps are capped, so a flood of random keys cannot exhaust memory. */
'use strict';

const CAP = 100000;
const sweepers = new Set();
setInterval(() => { for (const f of sweepers) f(); }, 60e3).unref();

function capMap(m) { if (m.size <= CAP) return; let n = m.size - CAP; for (const k of m.keys()) { m.delete(k); if (--n <= 0) break; } }

class Window {
  constructor({ max, windowMs }) {
    this.max = max; this.windowMs = windowMs; this.m = new Map();
    sweepers.add(() => { const n = Date.now(); for (const [k, v] of this.m) if (n - v.t > this.windowMs) this.m.delete(k); });
  }
  /** Count one event; returns 0 when allowed, otherwise the seconds to wait. */
  hit(key) {
    const n = Date.now(), h = this.m.get(key);
    if (!h || n - h.t > this.windowMs) { this.m.set(key, { t: n, c: 1 }); capMap(this.m); return 0; }
    if (++h.c > this.max) return Math.max(1, Math.ceil((h.t + this.windowMs - n) / 1000));
    return 0;
  }
}

class Guard {
  constructor({ max, windowMs, lockMs, maxLockMs = lockMs }) {
    this.max = max; this.windowMs = windowMs; this.lockMs = lockMs; this.maxLockMs = maxLockMs; this.m = new Map();
    sweepers.add(() => { const n = Date.now(); for (const [k, v] of this.m) if (v.lockUntil < n && n - v.last > 864e5) this.m.delete(k); });
  }
  /** Seconds the key is still locked (0 = free). */
  locked(key) { const e = this.m.get(key); const ms = e ? e.lockUntil - Date.now() : 0; return ms > 0 ? Math.ceil(ms / 1000) : 0; }
  /** Record a failure; returns the lock in seconds when this failure triggered one, else 0. */
  fail(key) {
    const n = Date.now();
    let e = this.m.get(key);
    if (!e) { e = { n: 0, first: n, last: n, lockUntil: 0, strikes: 0 }; this.m.set(key, e); capMap(this.m); }
    if (n - e.last > 864e5) e.strikes = 0;
    if (n - e.first > this.windowMs) { e.n = 0; e.first = n; }
    e.n++; e.last = n;
    if (e.n >= this.max) {
      const ms = Math.min(this.lockMs * 2 ** e.strikes, this.maxLockMs);
      e.strikes++; e.n = 0; e.first = n; e.lockUntil = n + ms;
      return Math.ceil(ms / 1000);
    }
    return 0;
  }
  success(key) { this.m.delete(key); }
}

/** Send a 429 with Retry-After. */
function tooMany(res, seconds, error = 'too_many') {
  res.setHeader('Retry-After', String(seconds));
  return res.status(429).json({ error, retryAfter: seconds });
}

module.exports = { Window, Guard, tooMany };
