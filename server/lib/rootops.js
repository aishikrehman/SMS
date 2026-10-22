/* Root User operations that the server enforces itself:
     · maintenance mode   state key `maintenance` = { site, system, message, until, by, at } (server-owned:
                          only POST /api/admin/maintenance changes it). `site` takes the public website and
                          the public API offline; `system` takes everything offline except for signed-in Root
                          Users. Either ends by itself at `until`.
     · website reset      design keys back to the first-run defaults (theme, hero, homepage sections, menus,
                          custom pages, page banners, About page, footer). School data is never touched.
   The developer information comes from server/config.js (DEVELOPER_*), never from the database. */
'use strict';
const config = require('../config');
const { institutionDefaults } = require('../defaults');

/** Active maintenance (null when off or past its end time). */
function maintenance(state) {
  const m = state.get('maintenance');
  if (!m || typeof m !== 'object' || (!m.site && !m.system)) return null;
  const end = m.until ? Date.parse(m.until) : NaN;
  if (Number.isFinite(end) && end <= Date.now()) return null;
  return { site: !!m.site, system: !!m.system, message: String(m.message || ''), until: m.until || null };
}

/** What a browser is told: the active mode, and whether this viewer is kept out of the website / the whole app. */
function maintenanceInfo(state, uid) {
  const m = maintenance(state); if (!m) return null;
  const root = !!uid && state.isRoot(uid);
  return { ...m, root, blockedSite: !root && (m.site || m.system), blockedSystem: !root && m.system };
}

/** Clean a request body into a stored maintenance record. */
function cleanMaintenance(body, uid) {
  const b = body && typeof body === 'object' ? body : {};
  let until = null;
  if (b.until) { const t = Date.parse(String(b.until)); if (!Number.isFinite(t)) return { error: 'bad_until' }; if (t <= Date.now()) return { error: 'past_until' }; until = new Date(t).toISOString(); }
  return { value: { site: !!b.site || !!b.system, system: !!b.system, message: String(b.message || '').slice(0, 500).trim(), until, by: uid, at: new Date().toISOString() } };
}

/** Express middleware for /api: 503 while the viewer is kept out. Sign-in, sign-out, health and the boot
    payload stay open (the boot payload carries the maintenance page's data). */
function maintenanceGuard(state) {
  const OPEN = new Set(['/health', '/state', '/login', '/logout', '/session', '/password', '/about', '/pay/webhook']);
  return (req, res, next) => {
    const m = maintenance(state); if (!m) return next();
    if (req.user && state.isRoot(req.user.id)) return next();
    if (OPEN.has(req.path) && !(req.path === '/state' && req.method !== 'GET')) return next();   // saving (PUT /state) is blocked
    const pub = req.path.startsWith('/public/');
    if (m.system || (m.site && pub)) {
      if (m.until) res.setHeader('Retry-After', Math.max(60, Math.round((Date.parse(m.until) - Date.now()) / 1000)));
      return res.status(503).json({ error: 'maintenance', message: m.message, until: m.until });
    }
    next();
  };
}

/** The little a maintenance page needs: names, logo and colours. */
function maintenanceView(state) {
  const s = state.get('school') || {}, t = state.get('theme') || {};
  const school = {}; for (const k of ['name', 'nameBn', 'shortName', 'logo', 'type', 'phone', 'email', 'address', 'motto', 'mottoBn']) if (s[k] !== undefined) school[k] = s[k];
  return { school, theme: t };
}

/** Public developer information (server/config.js → DEVELOPER_*). */
function about() { return { ...config.developer }; }
/** Licence (LICENSE_* env): the key is only ever sent masked; null when no licence is configured. */
function licenseInfo() {
  const L = config.license || {}; if (!L.key && !L.plan && !L.expires) return null;
  const k = String(L.key || ''), masked = k ? (k.length > 8 ? `${k.slice(0, 4)}••••••••${k.slice(-4)}` : '••••••••') : '';
  const exp = /^\d{4}-\d{2}-\d{2}$/.test(L.expires || '') ? L.expires : '';
  const daysLeft = exp ? Math.ceil((Date.parse(exp + 'T23:59:59Z') - Date.now()) / 86400000) : null;
  return { plan: L.plan || '', key: masked, expires: exp, daysLeft, modules: L.modules || [] };
}

/** New values of the design keys (only keys that exist are written; programmes and gallery are content and stay). */
function siteReset(state) {
  const school = state.get('school') || {}, def = institutionDefaults({ name: school.name, nameBn: school.nameBn, type: school.type, eiin: school.eiin });
  const site = state.get('site') || {};
  const put = {
    theme: def.theme,
    site: { ...def.site, programs: Array.isArray(site.programs) ? site.programs : [], gallery: Array.isArray(site.gallery) ? site.gallery : [] },
    menus: {},
  };
  for (const k of ['homepage', 'pages']) { const v = state.get(k); if (v !== undefined) put[k] = Array.isArray(v) ? [] : {}; }
  return put;
}

module.exports = { maintenance, maintenanceInfo, cleanMaintenance, maintenanceGuard, maintenanceView, about, licenseInfo, siteReset };
