/* Dhee SMS — Node.js server.
   Serves the static front end (index.html, css/, js/) and the JSON API under /api.

     npm start                 production mode (default)
     npm run dev               development: restarts on server changes, OTP messages printed on the console

   See README → "Run it" and .env.example for the environment variables, DEPLOY.md for running it
   for a school (service, HTTPS proxy, backups). */
'use strict';
const path = require('node:path');
const express = require('express');
const config = require('./config');
const { Logger, accessLog } = require('./lib/logger');
const backup = require('./backup');

const log = new Logger();

/* Content-Security-Policy.
   · script-src needs 'unsafe-inline' (the app renders inline onclick="…" handlers and index.html has
     an inline Tailwind config) and 'unsafe-eval' (the Tailwind Play CDN compiles its config at run time,
     and two small helpers use new Function). Hosts: the pinned CDNs in index.html.
   · style-src needs 'unsafe-inline' (Tailwind injects a <style> element; templates use style="…").
   · img/media: data: and blob: (photos, documents, QR codes are data URLs); https: for website images.
   · frame-src: YouTube (study materials) and Google Maps (website footer map).
   · connect-src: 'self' plus https: — the optional payment server and identity-registry gateway are
     URLs the school configures in the app.
   Everything else is 'self' only; the app cannot be framed by other sites (frame-ancestors 'self'). */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://unpkg.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "frame-src 'self' blob: data: https://www.youtube-nocookie.com https://www.youtube.com https://maps.google.com https://www.google.com https://player.vimeo.com https://kuula.co https://momento360.com",
  "connect-src 'self' https:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), payment=(), usb=()');
  res.setHeader('Content-Security-Policy', CSP);
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  next();
}

function staticSite(app) {
  const root = config.ROOT, opts = { etag: true, lastModified: true, maxAge: 0, index: false, dotfiles: 'deny', fallthrough: false };
  const noCache = (req, res, next) => { res.setHeader('Cache-Control', 'no-cache'); next(); };
  app.get(['/', '/index.html'], noCache, (req, res) => res.sendFile(path.join(root, 'index.html')));
  app.use('/css', noCache, express.static(path.join(root, 'css'), opts));
  app.use('/js', noCache, express.static(path.join(root, 'js'), opts));
  // SPA fallback: clean History-API URLs (/results, /admin/database, /print/<id>) all load index.html.
  // Paths with a file extension stay 404 (missing static files), /api is handled above.
  app.get(/^\/(?!api(?:\/|$)|css\/|js\/)(?!.*\.[A-Za-z0-9]{1,8}$)[^.]*$/, noCache, (req, res) => res.sendFile(path.join(root, 'index.html')));
}

async function main() {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  app.use(securityHeaders);

  const { createStore } = require('./store');
  const { State } = require('./state');
  const { makeApi } = require('./api');
  const store = createStore({ log });
  await store.init();
  const state = await new State(store, log).load();
  const health = { stopping: false };
  log.info(`[store] ${store.name} ready · ${state.keys().length} keys${state.users().length ? '' : ' · no users yet: open the site to run the first-run setup'}`);
  if (config.logRequests) app.use('/api', accessLog(log));
  app.use('/api', makeApi({ state, store, log, health }));
  setInterval(() => store.purgeSessions().catch(e => log.error('[sessions] purge failed', e.message)), 3600e3).unref();
  const stopBackups = config.backupAuto ? backup.scheduleDaily(store, log) : () => { };
  staticSite(app);
  app.use((req, res) => res.status(404).type('text/plain').send('Not found'));
  // Errors: log the detail, never send a stack trace to the client.
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) log.error(`[error] ${req.method} ${String(req.originalUrl).split('?')[0]}`, { error: err.message, stack: err.stack, ip: req.ip, user: req.user ? req.user.id : null });
    if (res.headersSent) return next(err);
    const code = err.type === 'entity.too.large' ? 'too_large' : err.type === 'entity.parse.failed' ? 'bad_json' : status === 404 ? 'not_found' : status < 500 ? 'bad_request' : 'server_error';
    res.status(status).json({ error: code });
  });

  const server = app.listen(config.port, config.host, () => {
    backup.writePid();
    log.info(`Dhee SMS (${process.env.NODE_ENV}) running at http://localhost:${config.port}/`);
  });
  server.on('error', e => { log.error(`[startup] cannot listen on ${config.host}:${config.port}: ${e.message}`); process.exit(1); });

  /* Graceful shutdown: stop accepting requests, let running ones finish, write every queued change,
     then close the database. Forced exit after 15 s. */
  let stopping = false;
  const stop = async sig => {
    if (stopping) return; stopping = true; health.stopping = true;
    log.info(`[shutdown] ${sig}: finishing requests and pending writes …`);
    const force = setTimeout(() => { log.error('[shutdown] timed out — exiting'); process.exit(1); }, 15000); force.unref();
    stopBackups();
    await new Promise(r => { server.close(r); server.closeIdleConnections?.(); });
    try { await state.drain(); } catch (e) { log.error('[shutdown] pending write failed', e.message); }
    await store.close().catch(() => { });
    backup.removePid();
    log.info('[shutdown] done');
    log.close();
    setTimeout(() => process.exit(0), 100);
  };
  process.on('SIGINT', () => stop('SIGINT')); process.on('SIGTERM', () => stop('SIGTERM'));
  if (process.platform === 'win32') process.on('SIGBREAK', () => stop('SIGBREAK'));
  process.on('unhandledRejection', e => log.error('[unhandled]', e && e.stack || String(e)));
}

main().catch(e => { log.error('[startup]', e.message); process.exit(1); });
