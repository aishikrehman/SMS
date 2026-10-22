/* Recycle bin (রিসাইকেল বিন) — every record a save removes is kept here instead of disappearing.

   Stored in its own server-owned key `recycleBin` (an array, newest first). It is never sent to any
   browser through /api/state (server/access.js returns an empty list); only the Root User reads it,
   through /api/admin/bin (server/api.js).

   Entry: { id, key, recId, kind, record, label, deletedBy, deletedByName, deletedAt, ip, batch }
     kind  'record'  a record removed from an array key (recId = merge identity, server/merge.js idOf)
           'entry'   an entry removed from a map key (recId = the map key)
           'key'     a whole top-level key dropped (record = the whole value)
   batch   every entry removed by the same save shares one batch id (restore them together).

   Entries older than the configured number of days (default 90, app_meta "recycleBinDays") are purged. */
'use strict';
const crypto = require('node:crypto');
const { idOf } = require('./merge');

const KEY = 'recycleBin';
const MAX_ENTRIES = 50000;
const DEFAULT_DAYS = 90;
/** Keys whose removals are not "deletions": logs with caps, counters, secrets, the bin itself. */
const SKIP = new Set([KEY, 'audit', 'outbox', 'meta', 'otps', 'payIntents', 'activeSession']);
/** Singleton settings objects: a removed property is a setting change, not a deleted record. */
const SINGLETON = new Set(['config', 'school', 'theme', 'site', 'featureFlags', 'homepage', 'menus', 'rbac', 'pageAccess', 'userPerms', 'userPages', 'salaryGrades', 'staffGrades', 'rooms', 'calendar', 'coupons', 'admissionForm', 'admissionRules', 'gateways', 'pages']);

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const newId = () => 'BIN' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(3).toString('hex').toUpperCase();

/** A short human label for a record. */
function labelOf(key, rec, recId) {
  if (!rec || typeof rec !== 'object') return String(rec ?? recId ?? '').slice(0, 120);
  const v = rec.nameBn || rec.name || rec.title || rec.studentNameBn || rec.studentName || rec.item || rec.label || rec.subject || rec.memo || rec.username || rec.fileName || rec.message || rec.note;
  const parts = [v, rec.id && rec.id !== v ? rec.id : (recId && recId !== v && !String(recId).startsWith('#') ? recId : '')].filter(Boolean);
  return (parts.join(' · ') || key).slice(0, 160);
}

/**
 * Records present in `before` and missing from `after` for one key.
 * Returns [{ kind, recId, record }].
 */
function removed(key, before, after) {
  if (SKIP.has(key) || before === undefined || before === null) return [];
  if (Array.isArray(before)) {
    const keep = new Set((Array.isArray(after) ? after : []).map(r => idOf(key, r)));
    const out = [];
    for (const r of before) { const id = idOf(key, r); if (!keep.has(id) && r !== null && r !== undefined) out.push({ kind: 'record', recId: id, record: r }); }
    return out;
  }
  if (isObj(before) && !SINGLETON.has(key)) {
    const a = isObj(after) ? after : {};
    const out = [];
    for (const [k, v] of Object.entries(before)) if (!(k in a) && v !== null && typeof v === 'object') out.push({ kind: 'entry', recId: k, record: v });
    return out;
  }
  return [];
}

/** Bin entries for one save. who = { uid, name, ip }. */
function entries(list, key, who, batch) {
  const at = new Date().toISOString();
  return list.map(x => ({ id: newId(), key, recId: x.recId, kind: x.kind, record: x.record, label: x.kind === 'key' ? key : labelOf(key, x.record, x.recId), deletedBy: who.uid || null, deletedByName: who.name || '', deletedAt: at, ip: String(who.ip || '').slice(0, 60), batch }));
}

/** New bin list: fresh entries first, oldest dropped beyond MAX_ENTRIES. */
function add(bin, fresh) {
  const list = [...fresh, ...(Array.isArray(bin) ? bin : [])];
  if (list.length > MAX_ENTRIES) list.length = MAX_ENTRIES;
  return list;
}

/** Entries older than `days`. */
function expired(bin, days) {
  const limit = Date.now() - Math.max(1, +days || DEFAULT_DAYS) * 864e5;
  return (Array.isArray(bin) ? bin : []).filter(e => Date.parse(e.deletedAt) < limit);
}

/** Does the record still exist (or exist again) in the current value? */
function exists(entry, current) {
  if (entry.kind === 'key') return current !== undefined;
  if (entry.kind === 'entry') return isObj(current) && entry.recId in current;
  return Array.isArray(current) && current.some(r => idOf(entry.key, r) === entry.recId);
}

/** Current value of the key with the entry put back (overwrite replaces an existing record of the same id). */
function reinsert(entry, current) {
  if (entry.kind === 'key') return entry.record;
  if (entry.kind === 'entry') return { ...(isObj(current) ? current : {}), [entry.recId]: entry.record };
  const list = Array.isArray(current) ? current.slice() : [];
  const i = list.findIndex(r => idOf(entry.key, r) === entry.recId);
  if (i >= 0) list[i] = entry.record; else list.push(entry.record);
  return list;
}

/** List view without the record bodies (they can be large); a short preview instead. */
function summary(e) {
  let json = '';
  try { json = JSON.stringify(e.record, (k, v) => (k === 'pwHash' || k === 'demoKey' ? undefined : v)) || ''; } catch (_) { }
  const { record: _, ...rest } = e;
  return { ...rest, preview: json.slice(0, 240), size: json.length };
}

module.exports = { KEY, DEFAULT_DAYS, removed, entries, add, expired, exists, reinsert, summary, labelOf, SKIP };
