/* Password hashing: scrypt with a per-user random salt (Node's built-in crypto, no native module).
   Stored format:  scrypt$<N>$<r>$<p>$<salt base64url>$<hash base64url>
   Parameters can be raised later; verify() reads them from the stored string. */
'use strict';
const crypto = require('node:crypto');

const N = 16384, R = 8, P = 1, KEYLEN = 64;
const scrypt = (pw, salt, n, r, p) => new Promise((ok, no) => crypto.scrypt(String(pw).normalize('NFC'), salt, KEYLEN, { N: n, r, p, maxmem: 256 * n * r }, (e, k) => (e ? no(e) : ok(k))));

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

async function verifyPassword(pw, stored) {
  const m = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([\w-]+)\$([\w-]+)$/.exec(String(stored || ''));
  if (!m) { await scrypt(pw, 'dummy-salt', N, R, P); return false; }   // same time for unknown formats
  const want = Buffer.from(m[5], 'base64url');
  const got = await scrypt(pw, Buffer.from(m[4], 'base64url'), +m[1], +m[2], +m[3]);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

/** Rule for passwords people choose: at least 10 characters, with a letter and a digit, not the user name. Returns a Bangla message or ''. */
function weakness(pw, username = '') {
  pw = String(pw || '');
  if (pw.length < 10) return 'পাসওয়ার্ড কমপক্ষে ১০ অক্ষরের হতে হবে।';
  if (!/[A-Za-zঀ-৿]/.test(pw) || !/[0-9০-৯]/.test(pw)) return 'পাসওয়ার্ডে অন্তত একটি অক্ষর ও একটি সংখ্যা থাকতে হবে।';
  if (username && pw.toLowerCase().includes(String(username).toLowerCase())) return 'পাসওয়ার্ডে ইউজার আইডি রাখা যাবে না।';
  return '';
}

module.exports = { hashPassword, verifyPassword, weakness };
