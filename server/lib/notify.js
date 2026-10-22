/* Outgoing SMS / e-mail for one-time codes.
   Configure a provider with environment variables (see .env.example):

     SMS_API_URL     HTTPS endpoint that sends an SMS. Receives POST JSON { to, message, sender }.
     SMS_API_TOKEN   sent as "Authorization: Bearer <token>"
     SMS_SENDER_ID   sender ID / masking name (optional)

     EMAIL_API_URL   HTTPS endpoint that sends an e-mail. Receives POST JSON { from, to, subject, text }.
     EMAIL_API_TOKEN sent as "Authorization: Bearer <token>"
     EMAIL_FROM      sender address

   Most Bangladeshi SMS gateways and transactional e-mail services accept such a call directly or
   through a small relay; adapt `body()` below if your provider needs other field names.
   Without a provider: in development (NODE_ENV !== 'production') the message is printed on the
   server console; in production sending fails and the user is told to contact the office. */
'use strict';
const config = require('../config');

const env = process.env;
const body = {
  sms: (to, text) => ({ to, message: text, sender: env.SMS_SENDER_ID || undefined }),
  email: (to, text, subject) => ({ from: env.EMAIL_FROM, to, subject, text }),
};

function configured(kind) { return kind === 'email' ? !!env.EMAIL_API_URL : !!env.SMS_API_URL; }

async function send(kind, to, text, subject = 'পাসওয়ার্ড পুনরুদ্ধার') {
  kind = kind === 'email' ? 'email' : 'sms';
  const url = kind === 'email' ? env.EMAIL_API_URL : env.SMS_API_URL;
  const token = kind === 'email' ? env.EMAIL_API_TOKEN : env.SMS_API_TOKEN;
  if (!url) {
    if (config.production) return { ok: false, reason: 'not_configured' };
    console.log(`\n┌── DEVELOPMENT ONLY: no ${kind.toUpperCase()} provider configured — message not sent ──\n│ to: ${to}\n│ ${text}\n└──────────────────────────────────────────────────────────────\n`);
    return { ok: true, via: 'console' };
  }
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body[kind](to, text, subject)), signal: AbortSignal.timeout(10000) });
    if (!r.ok) { console.error(`[notify] ${kind} provider answered HTTP ${r.status}`); return { ok: false, reason: 'provider_error' }; }
    return { ok: true, via: 'provider' };
  } catch (e) {
    console.error(`[notify] ${kind} provider unreachable: ${e.message}`);
    return { ok: false, reason: 'provider_error' };
  }
}

module.exports = { send, configured };
