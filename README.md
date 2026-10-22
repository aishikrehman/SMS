# Dhee SMS — School, College & Madrasah Management Platform

**Dhee SMS** is a multi-campus school ERP and public website. The front end is plain HTML, Tailwind (CDN) and vanilla JavaScript with no build step; it runs only with its **Node.js server** (`server/`), which stores the data in **SQLite** (default) or **PostgreSQL**, or in both at once.

## Run it

Requires Node.js 22.13 or newer (SQLite comes built in as `node:sqlite`; no native compile).

```bash
npm install
npm start          # production mode (the default) on http://localhost:3000
npm run dev        # development: restarts when server files change; OTP messages are printed on the console
```

Copy `.env.example` to `.env` to change settings (real environment variables win over the file):

| Variable | Default | Meaning |
|---|---|---|
| `PORT` / `HOST` | `3000` / `0.0.0.0` | Where the server listens (`--port 4000` also works) |
| `NODE_ENV` | `production` | `npm run dev` sets `development` |
| `DB_DRIVER` | `sqlite` | `sqlite`, `postgres` or `both` |
| `SQLITE_PATH` | `data/dhee.sqlite` | SQLite file |
| `DATABASE_URL` | — | PostgreSQL connection string (`postgres://user:pass@host:5432/db`); `PGSSL=true` for TLS |
| `DB_PRIMARY` | `sqlite` | In `both` mode: the store that serves reads |
| `SESSION_TTL_HOURS` / `SESSION_IDLE_MINUTES` | `12` / `120` | Longest sign-in, and how long it survives without use |
| `COOKIE_SAMESITE` | `Lax` | `Strict` is also possible |
| `COOKIE_SECURE` | `auto` | Secure cookie flag: `auto` = when the request is HTTPS; set `TRUST_PROXY=true` behind nginx/Caddy |
| `JSON_LIMIT` / `KEY_MAX_MB` / `USER_JSON_MAX_MB` | `50mb` / `25` / `8` | Largest save request; largest single collection; largest save from a student or guardian |
| `LOGIN_MAX_PER_ACCOUNT` / `LOGIN_MAX_PER_IP` / `LOCK_MINUTES` | `5` / `30` / `15` | Sign-in lockout (see "Sign-in") |
| `BACKUP_DIR` / `BACKUP_KEEP_DAYS` / `BACKUP_HOUR` / `BACKUP_AUTO` | `backups` / `30` / `2` / `true` | Daily server backup (see DEPLOY.md) |
| `LOG_DIR` / `LOG_KEEP_DAYS` / `LOG_REQUESTS` | `logs` / `30` / `true` | Daily JSON-line log files |
| `SMS_API_URL`, `SMS_API_TOKEN`, `SMS_SENDER_ID` | — | SMS provider for one-time codes (POST JSON `{to, message, sender}`, Bearer token) |
| `EMAIL_API_URL`, `EMAIL_API_TOKEN`, `EMAIL_FROM` | — | E-mail provider for one-time codes (POST JSON `{from, to, subject, text}`) |

Without an SMS / e-mail provider, password-recovery codes are printed on the server console in development; in production the request fails and the user is told to ask the IT office. Adapt `server/lib/notify.js` if your provider expects other field names.

### First run

With an empty database the site opens **প্রাথমিক সেটআপ** (first-run setup): the institution's Bangla and English name, type and (optional) EIIN, and the single **Root User** (user ID, mobile, e-mail, password). The server accepts it only while no user exists. It writes the structural defaults from `server/defaults.js` (grading scale, role permissions, feature switches, chart of accounts, pay grades, theme, one campus, three sessions, empty collections) and signs the Root User in. No sample people or transactions are created. Collections owned by feature modules are filled by their `DB.addSeeder` functions on the Root User's first sign-in.

`npm run reset` (stop the server first; `-- --yes` skips the question) wipes the database back to the setup state.

### PostgreSQL, both stores, migration

```bash
# PostgreSQL only
DB_DRIVER=postgres DATABASE_URL=postgres://dhee:secret@localhost:5432/dhee npm start

# both: every write goes to both stores, reads come from DB_PRIMARY;
# a failed write to the secondary is logged, never fatal; an empty secondary is filled from the primary at start-up
DB_DRIVER=both DB_PRIMARY=sqlite DATABASE_URL=postgres://… npm start

# copy all data between drivers (rows keep their revision numbers; verified after copying)
npm run migrate -- --from sqlite --to postgres      # add --force to overwrite a non-empty target
npm run migrate -- --from postgres --to sqlite
```

The tables are created automatically (`server/store/sqlite.sql`, `server/store/postgres.sql`). `npm run check` syntax-checks every JavaScript file and validates the configuration. `npm run backup` and `npm run restore -- <file>` make and restore backups. **DEPLOY.md** (Bangla) covers running the server for a school; **HANDOVER.md** is the handover checklist.

### Data store

The browser works on one state object (`DB.s`). The server keeps it **one row per top-level key** in `app_state(key, value, rev, updated_at, updated_by)` (JSON text in SQLite, JSONB in PostgreSQL), plus `app_sessions` and `app_meta`. This key-value store is the bridge toward a fully normalised schema (one table per collection), which can be introduced key by key behind the same API.

- **Load:** `GET /api/state` before the app starts. Signed in: what the user's roles allow (see "Data access by role" below). Anonymous visitors (public website): only the public part (institution, theme, website, campuses, classes, subjects, fee structures, website notices, calendar, exam list, gallery, teacher directory fields, admission form and test schedule, job posts); everything else arrives empty.
- **Save:** `DB.save()` sends only the top-level keys whose JSON changed (debounced 300 ms, `PUT /api/state`). A failed save shows a Bangla message and is retried. Open tabs pick up keys changed elsewhere every 20 s and when the tab becomes visible.
- **Public flows:** result look-up, Track & Verify (also QR links), service-desk identity check and tracking, and job-application tracking fetch only the record they need (`POST /api/public/lookup`). New admission applications, service requests, enquiries, job applications and password-help requests are appended by `POST /api/public/submit`, which validates every item (and its receipt voucher, SMS line and audit line) and re-numbers colliding ids.
- **Secrets never sent to the browser:** password hashes and one-time codes. Password hashes (scrypt, per-user salt) are made only on the server and change only through `POST /api/password` (own password), `POST /api/users/:id/password` (Root User issues a temporary password), first-run setup and OTP recovery (`/api/public/otp/request`, `/otp/verify`). A new account created in the browser carries its first temporary password once; the server hashes it and the browser drops it.
- **Writes:** the browser sends whole changed keys plus the revision it loaded them at. The server (`server/merge.js`) turns that into record operations, applies only those the user's role allows (`server/access.js`), keeps everything else as stored, and merges with changes others made meanwhile. A record changed by two people is a conflict: the first change stays and the browser reloads the key with a Bangla message. Users, roles, permissions, custom roles, API keys and configuration only by the Root User, the Principal or a role with *system: edit*; only the Root User grants or edits a Root User account. The audit log is append-only, and the server sets the user and the real client IP of new entries. Core collections cannot be deleted.

### Data access by role

| Role | Receives | May change |
|---|---|---|
| Root User, Principal, custom roles | everything minus secrets (custom roles: sensitive keys such as invoices, payroll, ledgers and audit only with *view* on that module) | per RBAC module *edit* / *delete* |
| Teacher | students of the classes they teach, class-/section-teach, mentor, batch-teach, proxy for or advise; their marks, attendance, documents; class-level academics; own leave, payroll, evaluations, feedback; their students' invoices only as amount/status | attendance and marks of their students (marks only for subjects they teach), own homework/materials/lesson plans, syllabus of their classes, incidents, own leave and profile; never fees or ledgers |
| Student / Guardian | own record (guardian: each linked child), own marks, attendance, invoices, payments, submissions, documents, service requests; class routine, homework, syllabus, materials, published exams and approved papers after the sitting; notices for their audience; fee structure, calendar, teachers' public fields; their transport/hostel/library rows. Classmates only as anonymous stand-ins (`_P…`) with marks of published exams, so rank and class averages work | own submissions, service requests, TrxID payment claims for own invoices (`payClaims`; never `payments` or an invoice's paid status — only the server sets those, see Payments; a reused transaction ID is refused), own PTC bookings and feedback; guardian: documents and photo of a child; own profile fields |
- Run a single server process per database: it keeps an in-memory copy of the state.
- **Recycle bin:** whenever a save removes records from an array key (or entries from a map key), the server keeps each one in the server-owned key `recycleBin` with key, record, user, time, IP and a label (`server/bin.js`). It is never sent through `/api/state`; only the Root User reads it (Root User → সিস্টেম → রিসাইকেল বিন, `/api/admin/bin`): search, filter by type and date, preview, restore (409 when the id exists again, then optionally overwrite; a whole save's deletions can be restored together), delete one for ever or empty the bin (typed phrase). Entries older than the configured days (default 90) are purged hourly. Every action is audited.
- **Demo data from the UI:** Root User → সিস্টেম → পরীক্ষামূলক ডেটা loads the demo school or wipes back to the first-run state (`/api/admin/demo/load`, `/reset`). Both need a typed phrase, take a backup first (`…-predemo` / `…-prereset`), keep the Root User's account and password (reset also keeps the institution's identity and theme), sign out every other session and are audited. `ALLOW_DEMO_LOAD=false` switches both off (do this on a live school).
- **Password help:** a request to the IT office shows as a count on the পাসওয়ার্ড রিসেট menu item and as a card on the Root User's and the Principal's dashboards; the office is told by SMS / e-mail (`IT_OFFICE_PHONE` / `IT_OFFICE_EMAIL` or ফিচার ও সেটিংস → আইটি অফিস) through `server/lib/notify.js`. The requester checks the status on the public reset page with the reference and the account's mobile number (`POST /api/public/pwstatus`). The desk is open to the Root User and to anyone given *system: edit*.

## Sign-in

Students and guardians sign in with their own IDs:

- **Students:** user ID = Student ID or registration number; password = registration number (set once by the login-ID policy).
- **Guardians:** user ID and password = their mobile number.

Under ফিচার ও সেটিংস → লগইন ও পাসওয়ার্ড, the Root User can require a password change at first login. This is recommended, because these IDs are easy for others to know. Passwords people choose need at least 10 characters with a letter and a digit, and must not contain the user ID. Five failed attempts lock an account (1 minute, doubling up to 15 minutes); thirty failures from one address within 15 minutes lock the address. One-time codes and public look-ups are rate-limited too. A password issued by the office (or the first password of a new account) must be changed at the next sign-in before anything else works; changing a password signs out every other device.

### Payments

Online payment is **off by default**. Students and guardians then see "অনলাইন পেমেন্ট চালু নেই — অফিসে বা TrxID দিয়ে পরিশোধ করুন" and can:

- pay at the office counter (Fees → counter desk), or
- send money to the school's bKash / Nagad / Rocket merchant number (Institution Settings → identity) and enter the **TrxID**. This creates a *claim* (`payClaims`), not a payment: the invoice stays unpaid until an accountant (fees: edit) compares it with the merchant statement on **TrxID যাচাই** and accepts it (`POST /api/pay/claims/:id/verify`, which creates the receipt, marks the invoices paid and posts the RV voucher on the server) or rejects it with a reason. The payer is told by SMS either way.
- Only the server marks an invoice paid for a student or guardian; their browsers can no longer write `payments` or an invoice's status. Counter payments by staff are unchanged.
- Online admission applicants can also submit and pay the admission fee at the office.

Online checkout starts working only when the Root User sets ফিচার ও সেটিংস → পেমেন্ট গেটওয়ে to Hyperswitch or a custom payment server **and** gives the server's address, and the server has `PAY_WEBHOOK_SECRET` (plus `PAY_API_KEY` for Hyperswitch). `POST /api/pay/checkout` creates the payment session on the payment server with the secret key (which never reaches the browser) and remembers the intent; the gateway's signed callback `POST /api/pay/webhook` (HMAC-SHA512 `x-webhook-signature-512` or HMAC-SHA256 `x-dhee-signature` of the raw body) confirms it, Hyperswitch payments are fetched again from the gateway, and only then are the invoices marked paid. A paid amount that does not match, or an invoice that changed meanwhile, is left for the accounts office (intent status *Review*). Coupons are created by the school; a new institution has none.

## ডেমো ডেটা (ঐচ্ছিক)

A real institution starts with the empty first-run setup page. For training or evaluation you can fill an **empty** database with a complete demo school, "ধী একাডেমি" (two campuses, 15 classes, 19 teachers, 12 support staff, 160 students and their guardians, ~45 days of attendance, three published exams with marks, a year of tuition invoices and payments, the ledger and payroll, notices, admissions with test rolls, transport, hostel, library, attendance devices and gate logs, careers, gallery artwork …):

```bash
npm run seed:demo                          # refuses when the database already has data
npm run seed:demo -- --force               # WIPES the configured database, then loads the demo
npm run seed:demo -- --out demo.sqlite     # writes a separate SQLite demo database instead
DB_DRIVER=postgres DATABASE_URL=postgres://… npm run seed:demo   # fill PostgreSQL
```

Stop the server first. It honours `DB_DRIVER`, `SQLITE_PATH` and `DATABASE_URL` like the server; with `--out`, start the server with `SQLITE_PATH=demo.sqlite`. The demo code lives only in `server/seed/` (`base.js`, `modules.js`, `build.js`, `demo.js`); nothing in the browser code creates demo records. Demo passwords are stored as scrypt hashes like any other.

| Sign in as | User ID | Password |
|---|---|---|
| Root User | `root` | `Demo@2026dhee` |
| Principal (also teacher and guardian) | `principal` | `Demo@2026dhee` |
| Teacher (Mathematics, class teacher of Class 10) | `teacher` | `Demo@2026dhee` |
| Student (Ayaan Hossain, Class 10) | the Student ID printed at the end of the seed | the registration number printed with it |
| Guardian (Kamal Hossain, three children) | the mobile number printed at the end of the seed | the same mobile number |

Every other teacher uses their user name with `Demo@2026dhee`; students sign in with Student ID + registration number and guardians with their mobile number. Demo coupons: `EARLYBIRD2027` (50%), `TALENT100` (100%), `SIBLING20` (20%).

**Never run `seed:demo` against a live school's database** — `--force` deletes everything in it. The demo's names, phone numbers and figures are invented.

## What's where

| Area | Where |
|---|---|
| **Branding & theme** | Institution Settings (IT Admin / Principal). Covers type (School / Madrasah / KG / Pre-school / College), English and Bangla names, motto, ESTD, logo, stamp, principal and director signatures, colours (Bangladesh-green default), fonts, base size, corner radius and presets. |
| **Homepage** | Institution Settings → Website & Homepage. Covers the hero section, statistics, programmes and image gallery. |
| **Structure** | Institution Settings → Campuses, Sessions & Classes. Covers campuses, sessions, shifts, sections, capacities, class teachers, rooms and room rules. |
| **Feature modules** | Institution Settings → Feature Modules. About 30 switches, including Transport, Hostel, Library, Biometric, the MFS gateways, Careers and Gallery. |
| **Permissions (RBAC)** | Institution Settings → Roles & Permissions. A role × module × {view, edit, delete, print, export} matrix. |
| **Users** | IT Admin → User Provisioning. Create any type of user, enable/disable, delete, reset passwords, bind roles. |
| **Public website** | Government-style menu with a notice ticker. Pages: Programs, Prospectus & fee estimator, Notices, Calendar, Faculty directory, Gallery and Results. Track & Verify, the service desk, Careers and Privacy are linked from the footer, which also shows the date in English and Bangla. The header shows **Apply online**, then **Portal login**. The notice ticker can be switched on or off in Institution Settings → Website. |
| **Admissions** | Admissions desk (Principal / IT Admin / teachers). Form builder, eligibility rules, test schedule and test rolls, admit cards, score entry, merit and waiting lists, and enrolment with class / section / roll / shift / concession. **Direct admission (office)** opens a full form in the page, with breadcrumbs. **Save draft** keeps it even when fields are blank (see the Drafts filter); **Admit now** records the fee and enrols the student. Each application opens as its own page with Approve, Edit, Decline and Admit. When the class requires a test, Admit is blocked until the applicant passes, unless the Principal overrides; overrides are audited. |
| **Academics** | Syllabus topics are marked Ongoing / Done / Revision / Rework, stamped with the date they are marked. Five views: Past, Exam-based, Current term, Upcoming, Full year. Also: "taught in class" ticks during roll-call, study materials, homework with attachments and notifications, the promotion engine, and the routine builder. |
| **Exams** | Exams & Grading. Covers exam types, CQ / MCQ / Practical marks, weights, 5.00 / 4.00 / letter-only scales and the exam timetable. Each exam has its own **Setup** page: which subjects are included, CQ / MCQ / Practical maximum and pass marks per subject, the grading scale (default, a named scheme, or custom bands), the pass rule (each component, or total %), the fail rule (any F, or average), and marksheet options. A setup can be copied to other exams. The teacher gradebook and the marksheet follow it. Also: tabulation sheets and merit lists. |
| **Fees** | Fees & Billing. Covers fee heads, the class fee structure, bulk billing, automatic late fines, concessions and manual fee changes, and a counter desk with teller-stamped receipts. |
| **Accounts** | Accounts, Journal, Chart of Accounts, MFS Reconciliation, and Financial Statements (Balance Sheet, Income & Expenditure, Daily Cash Flow). |
| **HR** | Faculty lifecycle, Support Staff, Performance Scorecard, Emergency Proxy, Payroll & Payouts (teachers and staff, with overtime and allowances), Recruitment, and the teacher's "My Profile". |
| **Attendance** | Biometric & RFID page with the হাজিরা ডেস্ক (QR scanner or typed IDs) and, for devices that have a connector URL, "এখনই সিঙ্ক করুন" (GET …?date=YYYY-MM-DD returning JSON `[{code, time}]`); staff attendance register, attendance analytics, and the student heatmap in the profile. |
| **Logistics** | Transport & fleet, hostel, and library circulation desk with automatic fines. |
| **Communication** | Notices & circulars (with channels and attachments), messaging gateways (SMS / SMTP / push), message log, and SOS broadcast. |
| **Student profile** | Seven tabs: personal & documents, ID, fees & MFS log, attendance & achievements, results, leave & services, admission & activity. Staff see it in the page, with Back and breadcrumbs; students and guardians get it as "My / Child Profile". |
| **Service desk** | Leave (class teacher → Principal), scholarship, installment plan, TC, testimonial, character certificate, transcript and ID-card replacement. Pay online or at the counter. |
| **Print Studio** | 16 document types on A4, Letter or Legal paper, in portrait or landscape, picked from grouped pills. Every print preview opens in a new window, or in the page if pop-ups are blocked. |
| **Customisation** | All under Institution Settings:<br>• **Theme & Colours:** sidebar colour (same as page, brand, dark or custom).<br>• **Menus & URLs:** rename, reorder, hide and give a custom URL to any page in any portal, set a URL prefix per portal, choose sidebar groups, place pages in the public header or footer, and add custom links. Old links keep working.<br>• **Homepage builder:** show, hide and reorder sections; add text blocks, call-to-action, notice cards, campuses and a statistics band; edit quick links.<br>• **Pages & Footer:** custom content pages, page banners, About page text and footer text. |
| **Structure** | Campuses, Classes & Groups. Covers levels and groups (Pre-primary, Primary, Junior Secondary, Secondary, Nurani, Kitabkhana, Hifz, and custom levels), and a per-class editor for sections with their teachers, batches with a teacher or mentor, streams, an optional class teacher and mentors. |
| **Features & Settings** | Each feature switch, together with its parameters: merchant numbers, late fine, library fine, loan period and limit, service-desk fees, attendance thresholds and others. |
| **Language** | The interface is **Bangla only**, in everyday standard Bangla, with Noto Serif Bengali as the default font. All wording is written directly in the source files; there is no translation layer.<br>• Values the code compares or stores stay English internally (statuses, types, methods, days …). They are displayed through `bn()` and the `BN_LABELS` map in `js/core.js`. Add a pair there when a new stored value appears.<br>• Display helpers: `bnNum()` for numbers, `pn()` for a person's Bangla name, `U.fmtDate`/`U.money`/`U.monthName` (already Bangla), `U.dayBn()` for days.<br>• Bangla digits typed into forms (roll, registration, phone, codes) work like 0-9.<br>• Receipts write amounts out in Bangla words ("…টাকা মাত্র"). |
| **Subjects** | Settings → বিষয়সমূহ. Add, rename, switch off or delete subjects, and tick which subjects each class takes. Results, marksheets and exam setup (নম্বর বণ্টন) use only the class's subjects. |
| **Attendance mode** | Features & Settings → উপস্থিতি. Choose daily attendance (one mark per day) or period-wise (one mark per period; the day's mark is derived from them). |
| **Advisors** | উপদেষ্টা ও শ্রেণিশিক্ষক: a teacher can be class teacher of several classes and advisor to any number of students from different classes. Teachers see them on **আমার শিক্ষার্থী**. |
| **Access control** | Settings → ভূমিকা ও অনুমতি has three views:<br>• role × module permissions<br>• each page switched on or off per role; a switched-off page leaves the menu and its link is blocked<br>• yes/no overrides for an individual user |
| **Study materials** | PDF, image, audio and video files, or links. YouTube links play embedded. |
| **Syllabus booklet** | পাঠ্যসূচি বুকলেট: the full syllabus for a class as a book-style PDF, with a cover, contents and subject-by-subject chapters showing their exams. |
| **Website** | **Homepage sections:** image banner / slider, video, feature cards, testimonials, FAQ, teachers, and map. Every section has a background (white, light, brand, dark, accent, or your own image), spacing and alignment.<br>**Footer:** colour, social links, an extra link column and a map.<br>**Menu:** drop-down sub-menus, bar colour, sticky menu and icons. |
| **Names** | Every person has an English and a Bangla name: students, fathers, mothers, guardians, teachers, staff and admins. The interface shows the Bangla name. Admission, student, staff and user forms have both fields. |
| **Identity look-up** | The admission form has a "জন্মনিবন্ধন থেকে তথ্য পূরণ করুন" button, and staff and user forms have an NID / birth-registration button. By default the details are typed in and the auto-fill button is hidden; it appears only when an approved API gateway is configured in Features & Settings (পরিচয় যাচাই). BDRIS itself has no open API and its public page is CAPTCHA-protected. |
| **Classes** | Added by the school (Institution Settings → ক্যাম্পাস, শ্রেণি ও স্তর). Sections are named ক, খ, গ …. Each class can offer বিভাগ (group) choices: বিজ্ঞান, মানবিক, ব্যবসায় শিক্ষা, কারিগরি, সাধারণ, মুজাব্বিদ, or custom groups. These appear on the admission form together with a preferred শাখা (section). |
| **Display & accessibility** | Available from the header button on the website and dashboards: theme (default/light/dark), text size, high contrast, underlined links, wider spacing, reduced motion, and a skip-to-content link. Every page fits a 375 px phone screen. |
| **Undo / restore** | The dashboard header has Undo, Redo and History buttons. Keyboard shortcuts are Ctrl+Z and Ctrl+Y.<br>• A bar with an Undo button appears after each change. History can roll back to before any of the last 15 changes.<br>• The audit log and the SMS outbox are never rolled back, and every undo is itself audited.<br>• Teachers can undo only their own changes.<br>• History is kept until you sign out or reload. For older states, use Backup & restore. |
| **Admit cards with dues** | On the admit-card page or in Print Studio, the Principal or Root User can use **Allow with dues** (with a reason and a promised payment date). The dues stay on the account. The exemption is audited, can be revoked, and the QR verifier shows it as "exempted". |
| **Open days** | In the calendar, hover a weekend or holiday and click **Open**, or click a weekend day. This adds an "Open day" that makes it a working day for attendance, timetables and other day-based features. |
| **UI conventions** | Large forms and records open in the page, with **Back** and breadcrumbs, instead of pop-ups. Tabs are wrapping pills (never scrolling strips). Students are chosen with a live-search picker instead of a long dropdown. Sidebar sections are grouped and collapsible, and Institution Settings comes first. The Academic Calendar is editable: click a day to add an event, or click an event to change it. |
| **Exam Centre** | পরীক্ষা কেন্দ্র (`js/modules/examhub.js`), one page in every portal with tabs: পরীক্ষাসমূহ, রুটিন, পাঠ্যসূচি (exam-based), প্রশ্নপত্র, মানবণ্টন, সমাধান, ফলাফল. Principal and Root User manage everything. Teachers submit papers and solutions for their own classes and subjects. Students and guardians see the routine, syllabus and results, and see approved papers after the exam has ended.<br>Each exam's setup chooses the participating classes and subjects, and can carry earlier exams' results forward by weight. A subject missing from an earlier exam is handled by a rule: redistribute, count as zero, or this exam only. The marksheet shows class averages and the combined table. |
| **Teacher presence gate** | Features & Settings → শিক্ষক উপস্থিতি (off by default). When it is on, a teacher with no biometric entry today cannot take class attendance until the Principal, or a person the Principal names, confirms them on **শিক্ষক উপস্থিতি নিশ্চিতকরণ**. Individual teachers can be exempted. |
| **Teaching assignments** | A teacher can teach several subjects, and different subjects in different classes. |
| **Homework marking** | Homework is marked with numbers; a grade is optional. The Principal sets this in Features & Settings. |
| **Users & custom types** | After **নতুন প্রতিষ্ঠান শুরু** (Root User), only the Root User remains. The Root User adds the Principal and other posts; the Principal adds teachers, students, guardians and any custom user types the Root User allows. **Custom user types** (ভূমিকা ও অনুমতি → কাস্টম ব্যবহারকারী ধরন) copy permissions from an existing role and can then be adjusted. |
| **Password recovery** | **পাসওয়ার্ড ভুলে গেছেন?** opens a page, not a pop-up. Recovery uses a one-time code by SMS or e-mail (valid 10 minutes, 5 tries), or a request to the IT office. The office resets it on **পাসওয়ার্ড ডেস্ক**. |
| **Payment gateway** | Features & Settings → পেমেন্ট গেটওয়ে. Off by default; choose Hyperswitch (open source, self-hosted) or a custom server and give its address. Live payments need the school's own server; secret keys never go in the browser. |
| **Fee structure** | **ফি কাঠামো** for each class, shown on every dashboard. A switch in Features & Settings → পাবলিক ওয়েবসাইট shows or hides it on the public prospectus. |
| **Cards** | ID cards and admit cards: portrait or landscape, and how many per A4 sheet, with a live preview. Card QR codes open the public verifier. |
| **MIS / Data** | MIS Analytics; Import / Export & Backup (CSV import and export, JSON backup and restore, SQL dump). |

## Project layout

```
index.html               shell, CDN libraries, Tailwind palette bound to theme CSS variables
css/app.css              UI primitives, government-style chrome, print stylesheet
js/db.js                 DB API (multi-campus, RBAC, employees, billing, grading scales) + server sync
js/sync.js               start-up (first-run setup page), sign-in/out, public look-ups (loaded last)
js/core.js               session, roles, router, theme engine, page flags/permissions, helpers
js/print.js              print engine (paper sizes, ID cards, marksheet, receipts, certificates…)
js/views/*.js            the six original portals
js/modules/*.js          feature modules that add pages to the portals (settings, website, admissions,
                         academics, exams, fees, finance, installments, faculty, hr, attendance,
                         logistics, comms, services, dossier, calendar, clone, mis, dataio, printstudio,
                         examhub, customize, ops, people, school, account, staffgate)
js/modules/wiring.js     RBAC tags, public menu order, user management, daily jobs
server/index.js          Express app: static front end + /api, security headers, error handling
server/api.js            API routes (state, setup, login/logout, passwords, public endpoints)
server/auth.js           sessions (httpOnly cookie, SHA-256 of the token stored), login, passwords, first-run setup
server/state.js          in-memory state cache, per-key revisions, applying client saves
server/access.js         per-role views and write rules
server/merge.js          record-level three-way merge of one key (optimistic concurrency)
server/backup.js         npm run backup, daily schedule; server/restore.js — npm run restore
server/public.js         anonymous view, public look-ups and append-only submissions, OTP recovery
server/defaults.js       structural defaults of a new institution
server/lib/              password (scrypt), notify (SMS/e-mail provider), hash (audit chain), logger (daily JSON logs), ratelimit
server/store/            drivers: sqlite.js (node:sqlite), postgres.js (pg), index.js (selects / "both");
                         DDL in sqlite.sql and postgres.sql
server/migrate.js        npm run migrate — copy all rows between drivers
server/reset.js          npm run reset — wipe back to the first-run setup
server/check.js          npm run check — syntax-check every JavaScript file and validate the configuration
data/                    SQLite database (not in version control)
```

Modules create their own collections with `DB.addSeeder(key, fn)` (an empty collection, a default or a shape migration — never sample records), so a module can be added without touching `db.js`.

## Production notes

- **Data and security:** data lives on the Node server (SQLite or PostgreSQL); passwords are scrypt hashes; sessions are httpOnly cookies. The server filters what each role receives and enforces record-level write rules (see "Data access by role"); detailed field validation of staff edits (for example, that an invoice amount matches the fee structure) still runs in the browser.
- **External services:** nothing is simulated. SMS / e-mail / push notices are written to the Message Log as *সারিতে আছে* (queued); only one-time passwords are sent today (server/lib/notify.js). Online payment, the identity registry and attendance devices work only when configured; otherwise the app says so and offers the manual path (counter / TrxID, typed details, the হাজিরা ডেস্ক). Gateway secrets are only ever stored masked.
- **Demo data:** only `npm run seed:demo` creates it (see "ডেমো ডেটা (ঐচ্ছিক)"); it books the rest of its stated enrolment in the ledger as clearly labelled monthly bulk entries.
- **Holiday dates:** lunar holiday dates (Eid, Puja) are approximate and editable in the Academic Calendar.
- **Printing:** in the print dialog, choose the same paper size, margins *None*, scale 100%, and *Background graphics* on.
