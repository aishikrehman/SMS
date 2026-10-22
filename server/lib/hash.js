/* cyrb53 — port of U.hash in js/db.js. Used ONLY for the audit-log hash chain, which the browser
   re-verifies with the same function (Audit → verify). Passwords use scrypt (./password.js). */
'use strict';

function hash(str, seed = 0) {
  str = String(str);
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** Bangla digits (০-৯) → ASCII, as U.asciiDigits does in the browser. */
function asciiDigits(s) { return String(s ?? '').replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d)); }

module.exports = { hash, asciiDigits };
