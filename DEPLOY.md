# Dhee SMS — সার্ভারে বসানো ও চালানোর নির্দেশিকা

এই নির্দেশিকা প্রতিষ্ঠানের আইটি দায়িত্বপ্রাপ্ত ব্যক্তির জন্য। কমান্ডগুলো যেমন আছে তেমনই চালাবেন। প্রতিষ্ঠানকে যা যা জোগাড় করতে হবে, তার তালিকা আছে [HANDOVER.md](HANDOVER.md)-এ।

সূচি:

1. প্রয়োজনীয় জিনিস
2. Node.js ২২ বা নতুন সংস্করণ বসানো (Windows Server ও Ubuntu)
3. অ্যাপ বসানো (`npm ci --omit=dev`)
4. কনফিগারেশন (`.env`) ও যাচাই (`npm run check`)
5. প্রথমবার চালু করা ও প্রাথমিক সেটআপ পাতা
6. সার্ভিস হিসেবে চালানো (PM2, NSSM, systemd, Docker)
7. HTTPS: Nginx বা Caddy রিভার্স প্রক্সি ও `TRUST_PROXY`
8. PostgreSQL-এ যাওয়া ও তথ্য স্থানান্তর
9. ব্যাকআপ ও পুনরুদ্ধার
10. নতুন সংস্করণে হালনাগাদ
11. নিরাপত্তা: সার্ভার কী কী নিয়ন্ত্রণ করে
12. সমস্যা সমাধান

---

## ১. প্রয়োজনীয় জিনিস

- একটি সার্ভার (ভিপিএস বা প্রতিষ্ঠানের নিজস্ব কম্পিউটার), যা সব সময় চালু থাকবে। ৫০০–২০০০ শিক্ষার্থীর জন্য ২ সিপিইউ, ২–৪ জিবি র‍্যাম ও ২০ জিবি ডিস্ক যথেষ্ট।
- Windows Server 2019/2022, অথবা Ubuntu 22.04/24.04 LTS।
- একটি ডোমেইন বা সাবডোমেইন (যেমন `sms.school.edu.bd`), যার DNS-এর A রেকর্ড সার্ভারের আইপিতে নির্দেশ করে।
- Node.js **২২.১৩ বা নতুন** (এতে SQLite আগে থেকেই আছে, আলাদা কিছু কম্পাইল করতে হয় না)।
- ঐচ্ছিক: PostgreSQL ১৪+, এসএমএস বা ই-মেইল সেবাদাতা (পাসওয়ার্ড পুনরুদ্ধারের কোডের জন্য)।

## ২. Node.js বসানো

### Ubuntu

```bash
sudo apt update && sudo apt install -y curl ca-certificates
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version          # v22.13.0 বা তার বেশি হতে হবে
```

### Windows Server

1. <https://nodejs.org> থেকে **Node.js 22 LTS**-এর Windows Installer (`.msi`, x64) নামিয়ে চালান। "Add to PATH" চালু রাখুন।
2. নতুন PowerShell খুলে যাচাই করুন:

```powershell
node --version
npm --version
```

## ৩. অ্যাপ বসানো

প্রকল্পের ফোল্ডারটি সার্ভারে কপি করুন (zip বা `git clone`)। উদাহরণে Linux-এ `/opt/dhee` আর Windows-এ `C:\dhee` ব্যবহার করা হয়েছে।

```bash
# Ubuntu
sudo useradd --system --create-home --home-dir /opt/dhee dhee   # আলাদা ব্যবহারকারী, যাতে অ্যাপ root হিসেবে না চলে
sudo cp -r ./SMS/* /opt/dhee/ && sudo chown -R dhee:dhee /opt/dhee
cd /opt/dhee
sudo -u dhee npm ci --omit=dev
```

```powershell
# Windows
cd C:\dhee
npm ci --omit=dev
```

`npm ci --omit=dev` কেবল চালানোর জন্য দরকারি প্যাকেজ বসায় (`express`; PostgreSQL ব্যবহার করলে ঐচ্ছিক `pg`)।

## ৪. কনফিগারেশন

```bash
cp .env.example .env          # Windows: copy .env.example .env
```

`.env` ফাইলে প্রতিটি সেটিং ব্যাখ্যাসহ দেওয়া আছে। সাধারণত যা বদলাতে হয়:

| সেটিং | কখন |
|---|---|
| `HOST=127.0.0.1` | সামনে Nginx বা Caddy থাকলে, যাতে বাইরে থেকে সরাসরি Node-এ ঢোকা না যায় |
| `TRUST_PROXY=true` | সামনে রিভার্স প্রক্সি থাকলে (আসল আইপি ও Secure কুকির জন্য জরুরি) |
| `BACKUP_DIR` | ব্যাকআপ অন্য ডিস্কে রাখতে |
| `SMS_API_URL` … / `EMAIL_API_URL` … | পাসওয়ার্ড পুনরুদ্ধারের কোড পাঠাতে |
| `DB_DRIVER`, `DATABASE_URL` | PostgreSQL ব্যবহার করলে (৮ নম্বর অংশ) |
| `ALLOW_DEMO_LOAD=false` | **চালু প্রতিষ্ঠানে অবশ্যই।** এতে রুট ব্যবহারকারীর "পরীক্ষামূলক ডেটা" পাতার "ডেমো ডেটা লোড করুন" ও "সব ডেটা মুছে নতুন করে শুরু" বোতাম বন্ধ থাকে |
| `IT_OFFICE_PHONE` / `IT_OFFICE_EMAIL` | পাসওয়ার্ড সহায়তার নতুন অনুরোধ এলে আইটি অফিসকে এসএমএস / ই-মেইলে জানাতে (অ্যাপের ফিচার ও সেটিংস → আইটি অফিস থেকেও দেওয়া যায়) |
| `PAY_API_KEY`, `PAY_WEBHOOK_SECRET` | অনলাইন পেমেন্ট চালু করলে: পেমেন্ট সার্ভারের গোপন কী এবং গেটওয়ের কলব্যাক (`POST /api/pay/webhook`) যাচাইয়ের গোপন শব্দ। গেটওয়েতে কলব্যাকের ঠিকানা দিন `https://আপনার-ডোমেইন/api/pay/webhook` |

তারপর যাচাই করুন:

```bash
npm run check
```

এই কমান্ড সব জাভাস্ক্রিপ্ট ফাইলের সিনট্যাক্স, Node-এর সংস্করণ, সেটিংগুলোর মান এবং `data/`, `backups/`, `logs/` ফোল্ডারে লেখা যায় কি না, তা পরীক্ষা করে। কোনো ভুল (✗) থাকলে সার্ভার চালানোর আগে ঠিক করুন। সতর্কবার্তা (!) পড়ে দেখুন।

## ৫. প্রথমবার চালু করা

```bash
npm start
```

ব্রাউজারে `http://সার্ভারের-আইপি:3000` (অথবা HTTPS সেটআপের পর আপনার ডোমেইন) খুলুন। ডেটাবেস খালি থাকলে **প্রাথমিক সেটআপ** পাতা আসবে:

1. প্রতিষ্ঠানের বাংলা ও ইংরেজি নাম, ধরন ও (ঐচ্ছিক) ইআইআইএন দিন।
2. **রুট ব্যবহারকারী** তৈরি করুন: ইউজার আইডি, মোবাইল, ই-মেইল ও শক্ত পাসওয়ার্ড (কমপক্ষে ১০ অক্ষর, অক্ষর ও সংখ্যা)। এই অ্যাকাউন্টই সব সেটিংস ও ব্যবহারকারী তৈরি করবে। পাসওয়ার্ডটি নিরাপদে লিখে রাখুন।
3. সেটআপ পাতা কেবল একবারই কাজ করে। কোনো ব্যবহারকারী তৈরি হয়ে গেলে সার্ভার আর সেটআপ গ্রহণ করে না।

পরের ধাপগুলো (অধ্যক্ষ, শ্রেণি, বিষয়, ফি, শিক্ষক, শিক্ষার্থী) [HANDOVER.md](HANDOVER.md)-এ আছে।

> **সতর্কতা:** `npm run seed:demo` একটি পূর্ণ ডেমো তথ্যভান্ডার লেখে (প্রদর্শন ও পরীক্ষার জন্য)। এটি **কখনো চালু প্রতিষ্ঠানের ডেটাবেসে চালাবেন না**, কারণ এতে প্রকৃত তথ্য নষ্ট বা মিশে যেতে পারে। শুধু আলাদা পরীক্ষামূলক ডেটাবেসে (`SQLITE_PATH=...` দিয়ে) ব্যবহার করুন।

> **পরীক্ষামূলক ডেটা (অ্যাপের ভেতর থেকে):** রুট ব্যবহারকারী → সিস্টেম → পরীক্ষামূলক ডেটা পাতায় নিশ্চিতকরণ বাক্য লিখে ডেমো ডেটা লোড করা বা সব মুছে নতুন করে শুরু করা যায়। দুটির আগেই `backups/`-এ স্বয়ংক্রিয় ব্যাকআপ (`…-predemo` / `…-prereset`) নেওয়া হয়, রুট ব্যবহারকারীর অ্যাকাউন্ট ও পাসওয়ার্ড থাকে, অন্য সবাই লগআউট হন, আর অডিট লগে লেখা থাকে। চালু প্রতিষ্ঠানে `.env`-এ `ALLOW_DEMO_LOAD=false` দিয়ে এটি বন্ধ রাখুন।
>
> **রিসাইকেল বিন:** কেউ কোনো রেকর্ড মুছলে তা সার্ভারের রিসাইকেল বিনে জমা থাকে (কে, কখন, কোন আইপি থেকে)। শুধু রুট ব্যবহারকারী সিস্টেম → রিসাইকেল বিন থেকে দেখতে, ফেরত আনতে বা স্থায়ীভাবে মুছতে পারেন; নির্ধারিত দিন (শুরুতে ৯০) পরে নিজে থেকেই মুছে যায়।

## ৬. সার্ভিস হিসেবে চালানো

সার্ভার কম্পিউটার চালু হলেই অ্যাপ নিজে থেকে চালু হওয়া উচিত, আর বন্ধ হয়ে গেলে আবার চালু হওয়া উচিত। **একটি ডেটাবেসের জন্য একটিই সার্ভার প্রসেস চালাবেন**, কারণ সার্ভার তথ্যের একটি কপি মেমরিতে রাখে। PM2-এর cluster মোড বা একাধিক instance ব্যবহার করবেন না।

### Linux: systemd (প্রস্তাবিত)

```bash
sudo cp /opt/dhee/deploy/dhee.service /etc/systemd/system/dhee.service
sudo systemctl daemon-reload
sudo systemctl enable --now dhee
sudo systemctl status dhee
journalctl -u dhee -f            # চলমান লগ
```

বন্ধ করলে (`systemctl stop dhee`) সার্ভার চলমান অনুরোধ ও জমে থাকা লেখাগুলো শেষ করে তারপর বন্ধ হয়।

### PM2 (Linux বা Windows)

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup                      # Linux: যে কমান্ড দেখাবে সেটি চালান
pm2 logs dhee
```

### Windows: NSSM (প্রস্তাবিত)

1. <https://nssm.cc> থেকে NSSM নামিয়ে `C:\nssm\nssm.exe`-এ রাখুন।
2. অ্যাডমিন PowerShell-এ চালান:

```powershell
C:\nssm\nssm.exe install DheeSMS "C:\Program Files\nodejs\node.exe" "server\index.js"
C:\nssm\nssm.exe set DheeSMS AppDirectory C:\dhee
C:\nssm\nssm.exe set DheeSMS AppEnvironmentExtra NODE_ENV=production
C:\nssm\nssm.exe set DheeSMS AppStdout C:\dhee\logs\service-out.log
C:\nssm\nssm.exe set DheeSMS AppStderr C:\dhee\logs\service-err.log
C:\nssm\nssm.exe set DheeSMS AppStopMethodConsole 20000
C:\nssm\nssm.exe set DheeSMS Start SERVICE_AUTO_START
Start-Service DheeSMS
Get-Service DheeSMS
```

`AppStopMethodConsole` সার্ভারকে Ctrl+C পাঠায়, ফলে সার্ভার নিয়মমতো বন্ধ হয়।

### Docker (ঐচ্ছিক)

```bash
docker compose up -d                        # SQLite
docker compose --profile postgres up -d     # PostgreSQL সহ (.env-এ POSTGRES_PASSWORD, DB_DRIVER, DATABASE_URL দিন)
docker compose logs -f app
```

ডেটা, ব্যাকআপ ও লগ নামযুক্ত volume-এ থাকে (`dhee-data`, `dhee-backups`, `dhee-logs`)। অ্যাপ কেবল `127.0.0.1:3000`-এ শোনে, তাই সামনে Caddy বা Nginx দিন।

## ৭. HTTPS: রিভার্স প্রক্সি

পাসওয়ার্ড ও শিক্ষার্থীর তথ্য ইন্টারনেটে সবসময় HTTPS দিয়ে চলা উচিত। Node-কে `HOST=127.0.0.1`-এ রাখুন, সামনে Caddy বা Nginx বসান, আর `.env`-এ দিন:

```
HOST=127.0.0.1
TRUST_PROXY=true
```

`TRUST_PROXY=true` থাকলে সার্ভার প্রক্সির পাঠানো আসল ক্লায়েন্ট-আইপি অডিট লগ ও রেট লিমিটে ব্যবহার করে, আর সেশন কুকিতে `Secure` ফ্ল্যাগ দেয়। প্রক্সি **না থাকলে** এটি চালু করবেন না, তাহলে যে কেউ নিজের আইপি জাল করতে পারবে।

### Caddy (সবচেয়ে সহজ; Let's Encrypt সার্টিফিকেট নিজে নেয় ও নবায়ন করে)

```bash
sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`:

```
sms.school.edu.bd {
    encode gzip
    request_body {
        max_size 60MB
    }
    reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo systemctl reload caddy
```

Windows-এ Caddy-র `caddy_windows_amd64.exe` নামিয়ে একই Caddyfile দিয়ে `caddy run` চালান, অথবা NSSM দিয়ে সার্ভিস বানান।

### Nginx + Certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

`/etc/nginx/sites-available/dhee`:

```nginx
server {
    listen 80;
    server_name sms.school.edu.bd;
    client_max_body_size 60m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/dhee /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d sms.school.edu.bd       # HTTPS চালু ও স্বয়ংক্রিয় নবায়ন
```

ফায়ারওয়ালে কেবল ২২ (SSH), ৮০ ও ৪৪৩ খোলা রাখুন:

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable
```

## ৮. PostgreSQL-এ যাওয়া

SQLite এক সার্ভারের জন্য যথেষ্ট। বড় প্রতিষ্ঠান বা আলাদা ডেটাবেস সার্ভার থাকলে PostgreSQL ব্যবহার করা যায়।

```bash
sudo apt install -y postgresql
sudo -u postgres psql -c "CREATE USER dhee WITH PASSWORD 'শক্ত-পাসওয়ার্ড';"
sudo -u postgres psql -c "CREATE DATABASE dhee OWNER dhee;"
npm install pg                          # npm ci-তেও optional হিসেবে আসে
```

বিদ্যমান SQLite তথ্য স্থানান্তর:

```bash
sudo systemctl stop dhee                # আগে সার্ভার বন্ধ করুন
npm run backup                          # নিরাপত্তার জন্য একটি ব্যাকআপ
DATABASE_URL=postgres://dhee:পাসওয়ার্ড@localhost:5432/dhee npm run migrate -- --from sqlite --to postgres
```

তারপর `.env`-এ লিখুন:

```
DB_DRIVER=postgres
DATABASE_URL=postgres://dhee:পাসওয়ার্ড@localhost:5432/dhee
```

এরপর `npm run check` চালিয়ে সার্ভার আবার চালু করুন। স্থানান্তরের সময় প্রতিটি কী-র revision নম্বর ঠিক থাকে এবং কপি শেষে যাচাই করা হয়। সেশন কপি হয় না, তাই সবাইকে আবার লগইন করতে হবে। `DB_DRIVER=both` দিলে প্রতিটি লেখা দুই ডেটাবেসেই যায়, আর পড়া হয় `DB_PRIMARY` থেকে। এটি পরিবর্তনের সময়ের জন্য উপযোগী।

## ৯. ব্যাকআপ ও পুনরুদ্ধার

### স্বয়ংক্রিয় দৈনিক ব্যাকআপ

সার্ভার প্রতিদিন `BACKUP_HOUR`-এর (ডিফল্ট রাত ২টা, সার্ভারের স্থানীয় সময়) পর একবার ব্যাকআপ নেয়:

- SQLite: `backups/dhee-YYYY-MM-DD.sqlite`। এটি `VACUUM INTO` দিয়ে নেওয়া একটি সম্পূর্ণ, সরাসরি খোলা যায় এমন কপি; সার্ভার চলার সময়ও নিরাপদ।
- PostgreSQL: `backups/dhee-YYYY-MM-DD.json.gz` (সব সারির gzip করা JSON)।

`BACKUP_KEEP_DAYS` (ডিফল্ট ৩০) দিনের পুরোনো ব্যাকআপ মুছে যায়, তবে সর্বশেষ তিনটি সবসময় থাকে। ব্যাকআপ ফোল্ডার নিয়মিত সার্ভারের বাইরে কপি করুন (অন্য কম্পিউটার, এক্সটার্নাল ডিস্ক বা ক্লাউড স্টোরেজ, এনক্রিপ্ট করে)। সার্ভার নষ্ট হলে শুধু সার্ভারে থাকা ব্যাকআপ কাজে আসবে না।

```bash
# উদাহরণ (Linux, প্রতিদিন রাত ৩টায় অন্য সার্ভারে কপি): crontab -e
0 3 * * * rsync -a /opt/dhee/backups/ backup@অন্য-সার্ভার:/srv/dhee-backups/
```

### হাতে ব্যাকআপ

- অ্যাপে: রুট ব্যবহারকারী → **ইমপোর্ট / এক্সপোর্ট ও ব্যাকআপ → ব্যাকআপ ও পুনরুদ্ধার** → "এখনই ব্যাকআপ নিন"। সেখান থেকে যেকোনো ব্যাকআপ ডাউনলোডও করা যায়। এই তালিকা ও ডাউনলোড শুধু রুট ব্যবহারকারী দেখতে পান।
- কমান্ডে (সার্ভার চলার সময়ও চলে):

```bash
npm run backup
```

### পুনরুদ্ধার

পুনরুদ্ধার **সব** বর্তমান তথ্য প্রতিস্থাপন করে, তাই এটি শুধু সার্ভারে করা যায়, ব্রাউজার থেকে নয়।

```bash
sudo systemctl stop dhee                         # বা: pm2 stop dhee / Stop-Service DheeSMS
npm run restore -- dhee-2026-10-16.sqlite        # BACKUP_DIR-এর ফাইলের নাম, অথবা পূর্ণ পথ
sudo systemctl start dhee
```

- সার্ভার চালু থাকলে restore কাজ করে না, কারণ সার্ভার মেমরির কপি আবার লিখে দিত। Windows-এ সার্ভার হঠাৎ বন্ধ হলে পুরোনো pid ফাইল থেকে যেতে পারে; নিশ্চিত হলে `--force` দিন।
- পুনরুদ্ধারের ঠিক আগে বর্তমান তথ্যের একটি `-prerestore` ব্যাকআপ স্বয়ংক্রিয়ভাবে নেওয়া হয়, যাতে ভুল হলে ফেরত আসা যায়।
- `.sqlite` ও `.json.gz` দুই ধরনের ব্যাকআপই যেকোনো ড্রাইভারে (SQLite বা PostgreSQL) পুনরুদ্ধার করা যায়।
- পুনরুদ্ধারের পর সবাইকে আবার লগইন করতে হয়।
- প্রশ্ন ছাড়া চালাতে `--yes` দিন। Docker-এ: `docker compose stop app && docker compose run --rm app npm run restore -- ফাইল --yes && docker compose start app`

মাসে অন্তত একবার একটি ব্যাকআপ আলাদা পরীক্ষামূলক কম্পিউটারে পুনরুদ্ধার করে দেখুন যে ব্যাকআপ সত্যিই কাজ করে।

## ১০. নতুন সংস্করণে হালনাগাদ

```bash
npm run backup                          # ১. আগে ব্যাকআপ
sudo systemctl stop dhee                # ২. সার্ভার বন্ধ
# ৩. নতুন ফাইলগুলো কপি করুন (data/, backups/, logs/ ও .env রেখে দিন), অথবা: git pull
npm ci --omit=dev                       # ৪. প্যাকেজ হালনাগাদ
npm run check                           # ৫. যাচাই
sudo systemctl start dhee               # ৬. চালু
curl -s http://127.0.0.1:3000/api/health
```

রুট ব্যবহারকারী হালনাগাদের পর প্রথমবার লগইন করলে নতুন মডিউলের কাঠামোগত ডিফল্ট তৈরি হয়। তাই হালনাগাদের পর প্রথমে রুট ব্যবহারকারী একবার লগইন করুন।

## ১১. নিরাপত্তা: সার্ভার কী কী নিয়ন্ত্রণ করে

- **ভূমিকাভিত্তিক তথ্য:** প্রত্যেক ব্যবহারকারী শুধু নিজের ভূমিকার প্রয়োজনীয় তথ্য পান।
  - শিক্ষার্থী নিজের তথ্য পান, অভিভাবক সংযুক্ত সন্তানদের তথ্য পান। সহপাঠীরা আসে শুধু নামহীন প্রতিনিধি হিসেবে, যাতে মেধাক্রম ও শ্রেণি-গড় ঠিক থাকে।
  - শিক্ষক নিজের শ্রেণি ও উপদেশপ্রাপ্ত শিক্ষার্থীদের তথ্য এবং নিজের বেতন-তথ্য পান। তিনি হিসাবের খাতা পান না।
  - অধ্যক্ষ ও রুট ব্যবহারকারী সব তথ্য পান।
- **লেখার অনুমতি:** কে কোন রেকর্ড বদলাতে পারবে, তা সার্ভার রেকর্ড ধরে যাচাই করে। অনুমতি নেই এমন অংশ বাদ দেওয়া হয় এবং ব্যবহারকারী একটি বার্তা দেখেন।
- **একই রেকর্ড দুজন বদলালে:** আগের পরিবর্তনটি থাকে, আর পরের জনকে তথ্য আবার লোড করে নিতে বলা হয়।
- **লগইন সুরক্ষা:**
  - একই অ্যাকাউন্টে ৫ বার ভুল পাসওয়ার্ড দিলে অ্যাকাউন্ট আটকে যায়: প্রথমে ১ মিনিট, এরপর প্রতিবার দ্বিগুণ, সর্বোচ্চ ১৫ মিনিট।
  - একই আইপি থেকে ১৫ মিনিটে ৩০ বার ভুল হলে সেই আইপি আটকে যায়।
  - ওটিপি পাঠানো, ওটিপি যাচাই এবং পাবলিক ফলাফল বা তথ্য খোঁজাতেও আলাদা সীমা আছে।
- **সেশন:** httpOnly ও SameSite কুকি ব্যবহৃত হয়; HTTPS থাকলে কুকি Secure হয়। সেশন সর্বোচ্চ ১২ ঘণ্টা চলে, আর ২ ঘণ্টা নিষ্ক্রিয় থাকলে শেষ হয়।
  - পাসওয়ার্ড বদলালে অন্য সব ডিভাইসের সেশন বন্ধ হয়।
  - অফিস অস্থায়ী পাসওয়ার্ড দিলে, বা নতুন অ্যাকাউন্টে, প্রথম লগইনে পাসওয়ার্ড বদলাতে হয়। না বদলানো পর্যন্ত আর কিছু করা যায় না।
- **নিরাপত্তা হেডার:** Content-Security-Policy (কেবল index.html-এর CDN-গুলোর অনুমতি), X-Frame-Options ও nosniff। HTTPS-এ HSTS যোগ হয়।
  - CSP-তে `'unsafe-inline'` ও `'unsafe-eval'` রাখতে হয়েছে, কারণ অ্যাপে inline `onclick` আছে আর Tailwind CDN রানটাইমে কাজ করে।
- **লগ:** `logs/app-YYYY-MM-DD.log` ও `logs/access-YYYY-MM-DD.log` প্রতিদিনের আলাদা JSON-লাইন ফাইল। এগুলো `LOG_KEEP_DAYS` দিন পর মুছে যায়। এতে পাসওয়ার্ড, কোড বা অনুরোধের বডি থাকে না।
- **অডিট লগ:** অডিট লগ শুধু যোগ করা যায়, মোছা বা বদলানো যায় না, আর প্রতিটি এন্ট্রি আগেরটির হ্যাশের সঙ্গে যুক্ত। প্রতিটি এন্ট্রিতে ব্যবহারকারী ও আসল আইপি সার্ভার নিজে বসায়।

## ১২. সমস্যা সমাধান

| সমস্যা | কী দেখবেন |
|---|---|
| সাইট খোলে না | `systemctl status dhee` / `pm2 status` / `Get-Service DheeSMS`; তারপর `curl http://127.0.0.1:3000/api/health` |
| `/api/health` থেকে 503 আসে | ডেটাবেস সাড়া দিচ্ছে না: ডিস্ক ভরা কি না, PostgreSQL চালু কি না, `DATABASE_URL` ঠিক কি না |
| "cannot listen" / EADDRINUSE | ওই পোর্টে অন্য প্রোগ্রাম চলছে, বা আগের সার্ভার এখনো চালু; `PORT` বদলান অথবা আগেরটি বন্ধ করুন |
| Node সংস্করণের ত্রুটি / `node:sqlite` পাওয়া যায় না | Node ২২.১৩ বা নতুন সংস্করণ বসান (`node --version`) |
| লগইনের পর সাথে সাথে আবার লগআউট হয়ে যায় | HTTPS ছাড়া `COOKIE_SECURE=true` দেওয়া আছে, অথবা প্রক্সি থাকা সত্ত্বেও `TRUST_PROXY` বন্ধ |
| অডিট লগে সব আইপি 127.0.0.1 | প্রক্সির পেছনে `TRUST_PROXY=true` দিন এবং প্রক্সিতে `X-Forwarded-For` পাঠান |
| "অনেকবার ভুল চেষ্টা হয়েছে" | কিছুক্ষণ অপেক্ষা করুন। জরুরি হলে সার্ভার রিস্টার্ট করলে সব অস্থায়ী আটকানো মুছে যায়। |
| পাসওয়ার্ড ভুলে গেছেন (রুট নয়) | রুট ব্যবহারকারী: **পাসওয়ার্ড ডেস্ক** থেকে অস্থায়ী পাসওয়ার্ড দিন |
| রুট ব্যবহারকারীর পাসওয়ার্ড ভুলে গেছেন | এসএমএস বা ই-মেইল সেবাদাতা থাকলে "পাসওয়ার্ড ভুলে গেছেন?" ব্যবহার করুন; না থাকলে সর্বশেষ ব্যাকআপ থেকে পুনরুদ্ধার ছাড়া অন্য উপায় নেই। তাই রুটের ই-মেইল ও মোবাইল সঠিক রাখুন। |
| "সার্ভার এই পরিবর্তন গ্রহণ করেনি" বার্তা | ব্যবহারকারীর ভূমিকায় ওই পরিবর্তনের অনুমতি নেই। `logs/app-*.log`-এ "save by …" লাইনে কোন তথ্যটি বাদ পড়েছে তা দেখা যায়। |
| "অন্য একজন ব্যবহারকারী একই তথ্য এইমাত্র বদলেছেন" | দুজন একই রেকর্ড একসঙ্গে বদলেছেন; তথ্য আবার লোড হয়েছে। পরিবর্তনটি আবার করুন। |
| ব্যাকআপ হচ্ছে না | `logs/app-*.log`-এ `[backup]` লাইন দেখুন; `BACKUP_DIR`-এ লেখার অনুমতি আছে কি না দেখতে `npm run check` চালান |
| ডিস্ক ভরে যাচ্ছে | `BACKUP_KEEP_DAYS` ও `LOG_KEEP_DAYS` কমান; পুরোনো ব্যাকআপ অন্য জায়গায় সরিয়ে রাখুন |

লগ দেখার জন্য: `tail -f logs/app-$(date +%F).log` (Linux), বা `Get-Content logs\app-2026-10-16.log -Wait` (Windows)।
