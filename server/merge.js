/* Record-level merge of one top-level key.

   The browser always sends a whole top-level key. The server turns that into record operations by
   comparing it with what this user was shown, keeps the server copy of everything the user may not
   touch, and merges with changes other users made meanwhile (optimistic concurrency, per record):

     stored    current server value of the key
     incoming  the value the browser sent
     base      record fingerprints of the revision the browser started from (null = unknown)
     rules     { view(rec,id) → record as this user sees it, or undefined when hidden
                 add(rec,id) / edit(newRec, oldRec, id) / del(oldRec, id) → boolean }

   Records are identified by `idOf(key, rec)`: `id` for most collections, a composite key for a few
   (marks, guardianLinks, userRoles …), a content hash for id-less lists. Objects are merged property
   by property (a singleton's fields, a map's entries); for a few nested maps (attendance …) one level
   deeper. Primitive values are replaced as a whole.

   Result: { value, changed, ignored: n, conflicts: n } — `ignored` counts record operations the user's
   role does not allow, `conflicts` those that lost against a newer change of the same record. */
'use strict';
const crypto = require('node:crypto');

const fp = v => crypto.createHash('sha1').update(JSON.stringify(v) ?? 'undefined').digest('base64').slice(0, 16);
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

const COMPOSITE = {
  marks: r => `${r.examId}|${r.studentId}|${r.subjectId}`,
  guardianLinks: r => `${r.guardianUserId}|${r.studentId}`,
  userRoles: r => `${r.userId}|${r.role}`,
  certificates: r => r.serial || r.id,
  accounts: r => r.code,
  feeStructure: r => `${r.session}|${r.classId}|${r.headId}`,
  feeConfigs: r => `${r.classId}|${r.session}`,
  examSyllabus: r => r.id || `${r.examId}|${r.classId}|${r.subjectId}`,
  summons: r => `${r.studentId}|${r.ts}`,
  apiKeys: r => r.id || r.name,
};
/** Identity of a record inside an array key. */
function idOf(key, r) {
  if (!r || typeof r !== 'object') return '#' + fp(r);
  const f = COMPOSITE[key];
  const id = f ? f(r) : r.id;
  return id === undefined || id === null || id === '' ? '#' + fp(r) : String(id);
}
/** Nested maps merged one level deeper: { outerKey: { innerKey: value } }. */
const DEEP = new Set(['attendance', 'periodAttendance', 'staffAttendance', 'teacherAbsences', 'examRemarks', 'admissionTests', 'admissionRules', 'userPerms', 'userPages', 'pageAccess', 'rbac', 'menus', 'sessionStore']);

/** Fingerprints of a value: Map(id → fp) for arrays/objects, or a single fp for primitives. */
function fingerprints(key, value) {
  if (Array.isArray(value)) { const m = new Map(); for (const r of value) m.set(idOf(key, r), fp(r)); return m; }
  if (isObj(value)) { const m = new Map(); for (const [k, v] of Object.entries(value)) m.set(k, fp(v)); return m; }
  return fp(value);
}

const ALLOW = { view: r => r, add: () => true, edit: () => true, del: () => true };

/**
 * Merge `incoming` into `stored` for one key.
 * opts: { rules, base (fingerprints of the client's base revision or null), sameRev (client's rev is current) }
 */
function mergeKey(key, stored, incoming, { rules = ALLOW, base = null, sameRev = false } = {}) {
  const R = { ...ALLOW, ...rules };
  const out = { value: stored, changed: false, ignored: 0, conflicts: 0 };

  // primitive or type change: whole-value replacement
  if (!(Array.isArray(stored) && Array.isArray(incoming)) && !(isObj(stored) && isObj(incoming))) {
    if (JSON.stringify(stored) === JSON.stringify(incoming)) return out;
    if (stored !== undefined && !R.edit(incoming, stored, '')) { out.ignored++; return out; }
    if (stored === undefined && !R.add(incoming, '')) { out.ignored++; return out; }
    if (!sameRev && (base === null || (stored !== undefined && base !== fp(stored)))) { out.conflicts++; return out; }
    out.value = incoming; out.changed = true; return out;
  }

  const arr = Array.isArray(stored);
  const sEntries = arr ? stored.map(r => [idOf(key, r), r]) : Object.entries(stored);
  const iEntries = arr ? incoming.map(r => [idOf(key, r), r]) : Object.entries(incoming);
  const sMap = new Map(sEntries), iMap = new Map(iEntries);
  const result = new Map(sEntries);                     // id → record, starts as the server copy
  const changedBy = new Set();                          // ids replaced/added from the client
  // server record unchanged since the client's base revision?
  const fresh = (id, rec) => sameRev || (base instanceof Map && base.get(id) === fp(rec));
  const knewIt = id => sameRev ? sMap.has(id) : base instanceof Map && base.has(id);

  for (const [id, rec] of iEntries) {
    if (R.skip && R.skip(rec, id)) continue;               // view-only stand-ins (anonymous classmates)
    const old = sMap.get(id);
    if (old !== undefined) {
      const seen = R.view(old, id);
      if (seen !== undefined && JSON.stringify(seen) === JSON.stringify(rec)) continue;     // untouched
      if (seen === undefined) { out.ignored++; continue; }                                  // hidden record: never writable
      if (!R.edit(rec, old, id)) { out.ignored++; continue; }
      if (!fresh(id, old)) {
        // nested map: try one level deeper before calling it a conflict
        if (DEEP.has(key) && isObj(old) && isObj(rec) && isObj(seen)) {
          const sub = mergeNested(old, seen, rec, base instanceof Map ? base.get(id + '\u0000sub') : null);
          if (sub.ok) { result.set(id, sub.value); changedBy.add(id); continue; }
        }
        out.conflicts++; continue;
      }
      result.set(id, keepHidden(old, seen, rec)); changedBy.add(id);
    } else {
      if (knewIt(id)) { out.conflicts++; continue; }       // deleted on the server meanwhile
      if (!R.add(rec, id)) { out.ignored++; continue; }
      result.set(id, rec); changedBy.add(id);
    }
  }
  // deletions: records the user could see, that existed in their base, and are missing now
  for (const [id, old] of sEntries) {
    if (iMap.has(id)) continue;
    if (R.view(old, id) === undefined) continue;            // never shown: not a deletion
    if (!knewIt(id)) continue;                              // added on the server after the client's base
    if (!fresh(id, old)) { out.conflicts++; continue; }
    if (!R.del(old, id)) { out.ignored++; continue; }
    result.delete(id); changedBy.add(id);
  }
  if (!changedBy.size) return out;

  // order: the client's order for records it sent, server-only records stay near their old position
  let value;
  if (arr) {
    const list = [], placed = new Set();
    for (const [id, r] of iEntries) if (result.has(id) && !placed.has(id) && !(R.skip && R.skip(r, id))) { list.push(result.get(id)); placed.add(id); }
    sEntries.forEach(([id], i) => { if (result.has(id) && !placed.has(id)) { list.splice(Math.min(i, list.length), 0, result.get(id)); placed.add(id); } });
    value = list;
  } else {
    value = {};
    for (const [id] of iEntries) if (result.has(id)) value[id] = result.get(id);
    for (const [id] of sEntries) if (result.has(id) && !(id in value)) value[id] = result.get(id);
  }
  out.value = value; out.changed = true;
  return out;
}

/** Fields of the stored record the user was not shown (redacted) are kept. */
function keepHidden(old, seen, rec) {
  if (!isObj(old) || !isObj(rec) || old === seen) return rec;
  const r = { ...rec };
  for (const k of Object.keys(old)) if (!(k in seen) && !(k in r)) r[k] = old[k];
  return r;
}

/** Second level of a nested map: apply the client's sub-entries that differ from what it was shown. */
function mergeNested(old, seen, rec) {
  const value = { ...old };
  for (const [k, v] of Object.entries(rec)) if (JSON.stringify(seen[k]) !== JSON.stringify(v)) value[k] = v;
  for (const k of Object.keys(seen)) if (!(k in rec)) delete value[k];
  return { ok: true, value };
}

module.exports = { mergeKey, fingerprints, idOf, fp, isObj };
