/* Demo institution — feature-module records (transport, hostel, library, attendance devices and gate logs,
   message gateways, careers, feedback, fee heads, admission rules/tests, syllabus topics, study materials,
   exam routines and papers, gallery …). Like base.js this is a sandbox script, not a Node module:
   build.js runs it after js/db.js and base.js. */

/** Placeholder artwork for the demo gallery: an SVG data URL (no external images). */
function demoArt(seed, title) {
  const hues = [[0, 106, 78], [15, 118, 110], [14, 116, 144], [161, 98, 7], [30, 64, 120], [21, 128, 61]];
  let h = 0; for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [r, g, b] = hues[h % hues.length], shape = h % 3;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="rgb(${r},${g},${b})"/><stop offset="1" stop-color="rgb(${r * .55 | 0},${g * .55 | 0},${b * .55 | 0})"/></linearGradient></defs><rect width="400" height="260" fill="url(#g)"/>`
    + (shape === 0 ? '<circle cx="320" cy="70" r="38" fill="#fff" opacity=".85"/><path d="M0 210 L90 120 L170 200 L250 110 L400 230 L400 260 L0 260Z" fill="#fff" opacity=".25"/>' : shape === 1 ? '<rect x="60" y="90" width="120" height="110" fill="#fff" opacity=".2"/><rect x="200" y="60" width="140" height="140" fill="#fff" opacity=".28"/><polygon points="270,20 350,60 190,60" fill="#fff" opacity=".35"/>' : '<circle cx="110" cy="130" r="60" fill="#fff" opacity=".18"/><circle cx="250" cy="110" r="80" fill="#fff" opacity=".14"/><circle cx="330" cy="190" r="40" fill="#fff" opacity=".22"/>')
    + `<rect y="214" width="400" height="46" fill="#000" opacity=".28"/><text x="16" y="243" font-family="Noto Sans Bengali,Arial" font-size="18" font-weight="700" fill="#fff">${String(title).replace(/[<&>]/g, '')}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function demoModules(ctx) {
  const { s, days } = ctx, now = new Date(), y = now.getFullYear(), ses = s.activeSession;
  const rngFor = key => U.rng(key.length * 7919 + 20261012);
  const off = n => U.iso(U.addDays(now, n));
  const trx = rng => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let x = ''; for (let i = 0; i < 10; i++) x += a[Math.floor(rng() * a.length)]; return x; };
  const studentUser = s.users.find(u => u.username === 'student'), demoSt = studentUser && s.students.find(x => x.userId === studentUser.id);
  const campusOf = st => s.classes.find(c => c.id === st.classId)?.campusId;
  const act = s.students.filter(x => x.status === 'active');

  /* ---------- fee heads (the client creates the built-in ones; the demo adds four optional heads) ---------- */
  s.feeHeads = [
    { id: 'FH-TUI', name: 'মাসিক বেতন', type: 'Recurring', frequency: 'Monthly', account: '4000', amount: null, source: 'শ্রেণিভিত্তিক ফি নির্ধারণ', builtin: true },
    { id: 'FH-LAB', name: 'কম্পিউটার ল্যাব ফি', type: 'Recurring', frequency: 'Monthly', account: '4600', amount: 250, optIn: true },
    { id: 'FH-TRN', name: 'পরিবহন ফি', type: 'Recurring', frequency: 'Monthly', account: '4400', amount: null, source: 'পরিবহন রুট', builtin: true },
    { id: 'FH-HST', name: 'ছাত্রাবাস ও খাবার ফি', type: 'Recurring', frequency: 'Monthly', account: '4500', amount: null, source: 'ছাত্রাবাস বরাদ্দ', builtin: true },
    { id: 'FH-ADM', name: 'ভর্তি ফি', type: 'One-time', frequency: 'Once', account: '4100', amount: null, source: 'শ্রেণিভিত্তিক ফি নির্ধারণ', builtin: true },
    { id: 'FH-REG', name: 'নিবন্ধন ফি', type: 'One-time', frequency: 'Yearly', account: '4600', amount: 1000 },
    { id: 'FH-CAU', name: 'জামানত (ফেরতযোগ্য)', type: 'One-time', frequency: 'Once', account: '2400', amount: 2000 },
    { id: 'FH-SPT', name: 'বার্ষিক ক্রীড়া ফি', type: 'One-time', frequency: 'Yearly', account: '4600', amount: 500 },
    { id: 'FH-EXM', name: 'পরীক্ষার ফি', type: 'Recurring', frequency: 'Per term', account: '4200', amount: null, source: 'শ্রেণিভিত্তিক ফি নির্ধারণ', builtin: true },
    { id: 'FH-LATE', name: 'বিলম্ব জরিমানা', type: 'One-time', frequency: 'Per late invoice', account: '4700', amount: 100, builtin: true },
  ];
  s.students.filter((st, i) => s.classes.find(c => c.id === st.classId).grade >= 8 && i % 3 === 0).forEach(st => st.optHeads = ['FH-LAB']);

  /* ---------- transport ---------- */
  {
    const rng = rngFor('transport');
    const staff = (type, campus) => (s.staff || []).filter(x => x.type === type && (!campus || x.campusId === campus));
    const dM = staff('Driver', 'MAIN'), dN = staff('Driver', 'NORTH'), hl = staff('Transport Helper');
    const routes = [
      { id: 'RT1', name: 'ধানমন্ডি', campusId: 'MAIN', zone: 'অঞ্চল এ — ধানমন্ডি ও কলাবাগান', fee: 2500, stops: [['ধানমন্ডি ২৭ (রাপা প্লাজা)', '06:55'], ['শংকর বাসস্ট্যান্ড', '07:05'], ['জিগাতলা বাসস্ট্যান্ড', '07:12'], ['সায়েন্স ল্যাব মোড়', '07:22']] },
      { id: 'RT2', name: 'মোহাম্মদপুর', campusId: 'MAIN', zone: 'অঞ্চল বি — মোহাম্মদপুর ও শ্যামলী', fee: 3000, stops: [['শ্যামলী স্কয়ার', '06:40'], ['মোহাম্মদপুর বাসস্ট্যান্ড', '06:50'], ['আসাদ গেট', '07:00'], ['লালমাটিয়া ব্লক ডি', '07:08'], ['সোবহানবাগ', '07:18']] },
      { id: 'RT3', name: 'উত্তরা', campusId: 'NORTH', zone: 'অঞ্চল সি — উত্তরা', fee: 2800, stops: [['উত্তরা সেক্টর ১৩ (পার্ক)', '07:00'], ['সেক্টর ১১ কাঁচাবাজার', '07:08'], ['রাজলক্ষ্মী (সেক্টর ৭)', '07:15'], ['আজমপুর বাসস্ট্যান্ড', '07:22']] },
    ].map(r => ({ ...r, stops: r.stops.map(([name, time], i) => ({ id: `${r.id}-S${i + 1}`, name, time })) }));
    const vehicles = [
      { id: 'VEH1', regNo: 'Dhaka Metro-Ba 11-2345', model: 'Ashok Leyland Viking', type: 'Bus', capacity: 52, campusId: 'MAIN', driverId: dM[0]?.id || null, helperId: hl[0]?.id || null, routeId: 'RT1', fitnessExpiry: off(214), taxExpiry: off(96), status: 'Active' },
      { id: 'VEH2', regNo: 'Dhaka Metro-Ba 14-7810', model: 'Tata LP 909', type: 'Bus', capacity: 40, campusId: 'MAIN', driverId: dM[1]?.id || null, helperId: null, routeId: 'RT2', fitnessExpiry: off(12), taxExpiry: off(155), status: 'Active' },
      { id: 'VEH3', regNo: 'Dhaka Metro-Cha 53-1198', model: 'Toyota HiAce', type: 'Microbus', capacity: 14, campusId: 'NORTH', driverId: dN[0]?.id || null, helperId: null, routeId: 'RT3', fitnessExpiry: off(301), taxExpiry: off(24), status: 'Active' },
      { id: 'VEH4', regNo: 'Dhaka Metro-Cha 56-4402', model: 'Toyota Noah', type: 'Microbus', capacity: 11, campusId: 'MAIN', driverId: null, helperId: null, routeId: null, fitnessExpiry: off(88), taxExpiry: off(-5), status: 'In workshop' },
    ];
    const allocations = [], from = `${y}-01-05`;
    const add = (st, rid, si) => { if (st && !allocations.some(a => a.studentId === st.id)) allocations.push({ id: `TA${allocations.length + 1}`, studentId: st.id, routeId: rid, stopId: `${rid}-S${si}`, from, to: null, active: true }); };
    add(demoSt, 'RT1', 2);
    const main = act.filter(x => campusOf(x) === 'MAIN' && x !== demoSt), north = act.filter(x => campusOf(x) === 'NORTH');
    const take = arr => arr.length ? arr.splice(Math.floor(rng() * arr.length), 1)[0] : null;
    const rayan = north.find(x => x.name === 'Rayan Hossain'); if (rayan) { add(rayan, 'RT3', 2); north.splice(north.indexOf(rayan), 1); }
    [['RT1', 1], ['RT1', 3], ['RT1', 4], ['RT2', 1], ['RT2', 2], ['RT2', 3], ['RT2', 5]].forEach(([r, si]) => add(take(main), r, si));
    [['RT3', 1], ['RT3', 4]].forEach(([r, si]) => add(take(north), r, si));
    const maintenance = [
      { id: 'VM1', vehicleId: 'VEH1', date: off(-62), description: 'ইঞ্জিন অয়েল ও ফিল্টার পরিবর্তন, ব্রেক পরীক্ষা', cost: 6800, vendor: 'র‍্যাংগস ওয়ার্কশপ, তেজগাঁও', voucherId: null },
      { id: 'VM2', vehicleId: 'VEH2', date: off(-35), description: 'সামনের ব্রেক প্যাড পরিবর্তন', cost: 9500, vendor: 'নাভানা সার্ভিস সেন্টার, তেজগাঁও', voucherId: null },
      { id: 'VM3', vehicleId: 'VEH3', date: off(-20), description: 'এসি গ্যাস রিফিল ও সার্ভিসিং', cost: 4200, vendor: 'উত্তরা অটো কেয়ার', voucherId: null },
      { id: 'VM4', vehicleId: 'VEH4', date: off(-6), description: 'গিয়ারবক্স ওভারহল', cost: 28500, vendor: 'বিসমিল্লাহ মোটরস, বিজয় সরণি', voucherId: null },
    ];
    s.transport = { vehicles, routes, allocations, maintenance };
  }

  /* ---------- hostel ---------- */
  {
    const rng = rngFor('hostel'), warden = (s.staff || []).find(x => x.type === 'Hostel Warden');
    const buildings = [{ id: 'HB1', name: 'আবাসিক অংশ', campusId: 'MAIN', wardenId: warden?.id || null, note: '১ম তলা ছাত্র · ২য় তলা ছাত্রী' }];
    const rooms = [['101', 1, 'Male', 4], ['102', 1, 'Male', 4], ['103', 1, 'Male', 3], ['104', 1, 'Male', 2], ['201', 2, 'Female', 4], ['202', 2, 'Female', 3], ['203', 2, 'Female', 3], ['204', 2, 'Female', 2]]
      .map(([no, floor, gender, beds], i) => ({ id: `HR${i + 1}`, buildingId: 'HB1', no: `R-${no}`, floor, gender, beds, rent: beds >= 4 ? 3000 : beds === 3 ? 3500 : 4500 }));
    const mealPlans = [
      { id: 'MP1', name: 'সাধারণ — ৩ বেলা খাবার', fee: 4500, desc: 'সকাল, দুপুর ও রাতের খাবার (বাংলা মেনু)' },
      { id: 'MP2', name: 'পূর্ণ খাবার + নাশতা', fee: 5500, desc: '৩ বেলা খাবার, বিকেলের নাশতা ও দুধ' },
      { id: 'MP3', name: 'কর্মদিবসে দুপুর ও রাতের খাবার', fee: 3200, desc: 'কেবল রবি–বৃহস্পতিবার; সাপ্তাহিক ছুটিতে আবাসিকরা বাড়ি যায়' },
    ];
    const busy = new Set(s.transport.allocations.map(a => a.studentId)); if (demoSt) busy.add(demoSt.id);
    const pool = act.filter(x => ['C8', 'C9', 'C10'].includes(x.classId) && !busy.has(x.id));
    const boys = pool.filter(x => x.gender === 'Male'), girls = pool.filter(x => x.gender === 'Female');
    const take = arr => arr.length ? arr.splice(Math.floor(rng() * arr.length), 1)[0] : null;
    const allocations = [];
    const put = (st, roomId, bed) => { if (st) allocations.push({ id: `HA${allocations.length + 1}`, studentId: st.id, roomId, bed, mealPlanId: ['MP1', 'MP1', 'MP2', 'MP3'][Math.floor(rng() * 4)], from: `${y}-01-0${2 + Math.floor(rng() * 6)}`, to: null, active: true }); };
    [['HR1', 1], ['HR1', 2], ['HR1', 3], ['HR2', 1], ['HR2', 2], ['HR3', 1]].forEach(([r, b]) => put(take(boys), r, b));
    [['HR5', 1], ['HR5', 2], ['HR6', 1], ['HR7', 1]].forEach(([r, b]) => put(take(girls), r, b));
    s.hostel = { buildings, rooms, mealPlans, allocations };
  }

  /* ---------- library ---------- */
  {
    const rng = rngFor('library');
    const list = [
      ['Mathematics — Class 9–10', 'NCTB', 'Textbook', 6, 'MAIN', 'NCTB'], ['Physics — Class 9–10', 'NCTB', 'Textbook', 5, 'MAIN', 'NCTB'],
      ['English for Today — Class 9–10', 'NCTB', 'Textbook', 5, 'MAIN', 'NCTB'], ['বাংলা সাহিত্য — নবম-দশম শ্রেণি', 'NCTB', 'Textbook', 5, 'MAIN', 'NCTB'],
      ['General Science — Class 8', 'NCTB', 'Textbook', 4, 'MAIN', 'NCTB'], ['পথের পাঁচালী', 'বিভূতিভূষণ বন্দ্যোপাধ্যায়', 'Bangla Literature', 3, 'MAIN', 'Mitra & Ghosh'],
      ['হাজার বছর ধরে', 'জহির রায়হান', 'Bangla Literature', 2, 'MAIN', 'Anupam Prakashani'], ['লালসালু', 'সৈয়দ ওয়ালীউল্লাহ', 'Bangla Literature', 3, 'MAIN', 'Naoroze Kitabistan'],
      ['গীতাঞ্জলি', 'রবীন্দ্রনাথ ঠাকুর', 'Bangla Literature', 2, 'MAIN', 'Visva-Bharati'], ['অগ্নিবীণা', 'কাজী নজরুল ইসলাম', 'Bangla Literature', 2, 'MAIN', 'Nazrul Institute'],
      ['একাত্তরের দিনগুলি', 'জাহানারা ইমাম', 'History & Liberation War', 3, 'MAIN', 'Sandhani Prakashani'], ['অসমাপ্ত আত্মজীবনী', 'শেখ মুজিবুর রহমান', 'History & Liberation War', 2, 'MAIN', 'The University Press Ltd'],
      ['আমার ছেলেবেলা', 'হুমায়ূন আহমেদ', 'Bangla Literature', 2, 'MAIN', 'Annesha Prokashon'], ['দীপু নাম্বার টু', 'মুহম্মদ জাফর ইকবাল', 'Bangla Literature', 3, 'MAIN', 'Protik Prokashana'],
      ['ফেলুদা সমগ্র (১ম খণ্ড)', 'সত্যজিৎ রায়', 'Bangla Literature', 2, 'MAIN', 'Ananda Publishers'], ['Harry Potter and the Philosopher\'s Stone', 'J. K. Rowling', 'English Fiction', 3, 'MAIN', 'Bloomsbury'],
      ['Treasure Island', 'Robert Louis Stevenson', 'English Fiction', 2, 'MAIN', 'Penguin Classics'], ['Oliver Twist', 'Charles Dickens', 'English Fiction', 2, 'MAIN', 'Penguin Classics'],
      ['The Old Man and the Sea', 'Ernest Hemingway', 'English Fiction', 2, 'MAIN', 'Scribner'], ['Wonder', 'R. J. Palacio', 'English Fiction', 2, 'MAIN', 'Knopf'],
      ['A Brief History of Time', 'Stephen Hawking', 'Science', 2, 'MAIN', 'Bantam'], ['Oxford Advanced Learner\'s Dictionary', 'A. S. Hornby', 'Reference', 2, 'MAIN', 'Oxford University Press'],
      ['Bangla Academy English–Bangla Dictionary', 'Bangla Academy', 'Reference', 2, 'MAIN', 'Bangla Academy'], ['Banglapedia — Vol. 1', 'Asiatic Society of Bangladesh', 'Reference', 1, 'MAIN', 'Asiatic Society'],
      ['Oxford School Atlas', 'Oxford', 'Reference', 2, 'MAIN', 'Oxford University Press'], ['ঠাকুরমার ঝুলি', 'দক্ষিণারঞ্জন মিত্র মজুমদার', 'Children', 3, 'NORTH', 'Mitra & Ghosh'],
      ['হাতকাটা রবিন', 'মুহম্মদ জাফর ইকবাল', 'Children', 2, 'NORTH', 'Protik Prokashana'], ['Charlotte\'s Web', 'E. B. White', 'Children', 2, 'NORTH', 'HarperCollins'],
      ['Matilda', 'Roald Dahl', 'Children', 2, 'NORTH', 'Puffin'], ['The Little Prince', 'Antoine de Saint-Exupéry', 'Children', 2, 'NORTH', 'Harcourt'],
      ['আমার বাংলা বই — প্রথম শ্রেণি', 'NCTB', 'Textbook', 4, 'NORTH', 'NCTB'], ['Primary English — Class 5', 'NCTB', 'Textbook', 4, 'NORTH', 'NCTB'],
    ];
    const shelfL = { Textbook: 'T', 'Bangla Literature': 'B', 'History & Liberation War': 'H', 'English Fiction': 'E', Science: 'S', Reference: 'R', Children: 'J' };
    const isbn = bnBook => { const d = Array.from({ length: 9 }, () => Math.floor(rng() * 10)).join(''); const base = (bnBook ? '978984' : '978014') + d.slice(0, 6); let sum = 0; for (let i = 0; i < 12; i++) sum += (+base[i]) * (i % 2 ? 3 : 1); return `${base.slice(0, 3)}-${base.slice(3, 6)}-${base.slice(6, 9)}-${base.slice(9, 12)}-${(10 - sum % 10) % 10}`; };
    const books = list.map(([title, author, category, copies, campusId, publisher], i) => ({ id: `LIB${U.pad(i + 1, 4)}`, isbn: isbn(/[ঀ-৿]/.test(title) || author === 'NCTB'), title, author, category, shelf: `${shelfL[category] || 'G'}-${1 + Math.floor(rng() * 4)}`, copies, campusId, publisher, addedOn: off(-200 - Math.floor(rng() * 400)) }));
    const main = act.filter(x => campusOf(x) === 'MAIN' && x !== demoSt), north = act.filter(x => campusOf(x) === 'NORTH');
    const take = arr => arr.length ? arr.splice(Math.floor(rng() * arr.length), 1)[0] : null;
    const loans = [];
    const lend = (st, bookId, outAgo, returnedAgo) => { if (!st) return; const out = off(-outAgo), due = off(-outAgo + 14); loans.push({ id: `LN${U.pad(loans.length + 1, 3)}`, bookId, studentId: st.id, out, due, returned: returnedAgo != null ? off(-returnedAgo) : null, fine: 0, by: null }); };
    lend(demoSt, 'LIB0014', 40, 30); lend(take(main), 'LIB0016', 35, 24);
    lend(demoSt, 'LIB0017', 18); lend(demoSt, 'LIB0021', 6);
    const m1 = take(main), m2 = take(main), m3 = take(main), m4 = take(main);
    lend(m1, 'LIB0006', 23); lend(m2, 'LIB0011', 30); lend(m3, 'LIB0001', 4); lend(m4, 'LIB0020', 9);
    lend(take(north), 'LIB0026', 5); lend(take(north), 'LIB0029', 11);
    s.library = { books, loans };
  }

  /* ---------- attendance devices, gate logs, staff register ---------- */
  {
    const rng = rngFor('gateLogs'), ts = new Date(Date.now() - 18 * 60e3).toISOString();
    s.devices = [
      { id: 'DV1', name: 'প্রধান ফটকের আরএফআইডি রিডার', location: 'প্রধান ক্যাম্পাস — সম্মুখ ফটক', type: 'RFID', campusId: 'MAIN', status: 'Online', lastSync: ts, serial: 'ZK-RF-20481', endpoint: null },
      { id: 'DV2', name: 'কর্মীদের আঙুলের ছাপ টার্মিনাল', location: 'প্রধান ক্যাম্পাস — শিক্ষক-কর্মী কক্ষ', type: 'Fingerprint', campusId: 'MAIN', status: 'Online', lastSync: ts, serial: 'ZK-F22-11873', endpoint: null },
      { id: 'DV3', name: 'উত্তর ফটকের আরএফআইডি রিডার', location: 'উত্তর শাখা ক্যাম্পাস — ফটক', type: 'RFID', campusId: 'NORTH', status: 'Online', lastSync: ts, serial: 'ZK-RF-20502', endpoint: null },
      { id: 'DV4', name: 'মুখাবয়ব শনাক্তকরণ টার্মিনাল', location: 'উত্তর শাখা ক্যাম্পাস — অফিস লবি', type: 'Face', campusId: 'NORTH', status: 'Online', lastSync: ts, serial: 'HK-FR-77310', endpoint: null },
    ];
    const logs = [], cal = s.calendar, today = U.today();
    // late = after the (morning) shift start + school.lateMinutes (the old fixed clock time lateAfter is still read)
    const st0 = ((s.school.shifts || [])[0]?.start || '07:30').split(':').map(Number), late = (s.school.lateAfter || '').split(':').map(Number);
    const lateMin = s.school.lateMinutes != null ? st0[0] * 60 + st0[1] + +s.school.lateMinutes : late.length === 2 ? late[0] * 60 + late[1] : 490;
    const hm = m => `${U.pad(Math.floor(m / 60))}:${U.pad(Math.round(m) % 60)}`;
    const between = (a, b) => a + Math.floor(rng() * (b - a + 1));
    const devFor = { student: { MAIN: ['DV1', 'RFID'], NORTH: ['DV3', 'RFID'] }, staff: { MAIN: ['DV2', 'Fingerprint'], NORTH: ['DV4', 'Face'] } };
    const dayList = cp => { const out = []; for (let d = U.addDays(now, -1), i = 0; out.length < 20 && i < 60; d = U.addDays(d, -1), i++) if (U.isSchoolDay(d, cal, cp)) out.unshift(U.iso(d)); return out; };
    const dayset = { MAIN: dayList('MAIN'), NORTH: dayList('NORTH') };
    let n = 1;
    const push = (personType, personId, date, inMin, outMin, cp) => { const [device, method] = devFor[personType][cp] || devFor[personType].MAIN; logs.push({ id: 'GL' + (n++), personType, personId, date, in: hm(inMin), out: outMin ? hm(outMin) : null, device, method }); };
    act.forEach(st => {
      const cp = campusOf(st), rec = s.attendance[st.id] || {};
      (dayset[cp] || []).forEach(d => {
        const v = rec[d];
        if (v === 'P') push('student', st.id, d, between(455, 485), between(795, 870), cp);
        else if (v === 'L') push('student', st.id, d, between(lateMin + 1, lateMin + 40), between(795, 870), cp);
      });
    });
    const sa = s.staffAttendance || (s.staffAttendance = {});
    [...s.teachers, ...(s.staff || [])].forEach(e => {
      const rec = sa[e.id] || (sa[e.id] = {});
      (dayset[e.campusId] || []).forEach(d => {
        if (!rec[d]) { const x = rng(); rec[d] = x < 0.025 ? 'A' : x < 0.045 ? 'E' : x < 0.11 ? 'L' : 'P'; }
        const v = rec[d];
        if (v === 'P') push('staff', e.id, d, between(435, 480), between(840, 990), e.campusId);
        else if (v === 'L') push('staff', e.id, d, between(lateMin + 1, lateMin + 35), between(840, 990), e.campusId);
      });
      const mk = today.slice(0, 7), vals = Object.entries(rec).filter(([k]) => k.startsWith(mk)).map(([, v]) => v);
      (s.teacherAbsences[e.id] = s.teacherAbsences[e.id] || {})[mk] = { unexcused: vals.filter(v => v === 'A').length, excused: vals.filter(v => v === 'E').length };
    });
    s.gateLogs = logs;
  }

  /* ---------- message gateways (settings only — the demo sends nothing) ---------- */
  s.gateways = {
    sms: { provider: 'Teletalk', senderId: 'DHEE ACAD', username: 'dheeacademy', apiKeyMasked: '••••a91f', endpoint: 'https://bulksms.teletalk.com.bd/api/sendSMS', active: false },
    email: { host: 'smtp.gmail.com', port: 587, security: 'TLS', username: 'noreply@dheeacademy.edu.bd', passwordMasked: '••••7c2e', fromName: 'Dhee Academy', fromEmail: 'noreply@dheeacademy.edu.bd', active: false },
    push: { provider: 'Firebase Cloud Messaging', projectId: 'dhee-academy-app', serverKeyMasked: '••••0d4b', active: false },
    updatedAt: null,
  };

  /* ---------- careers ---------- */
  s.jobs = [
    { id: 'JOB1', title: 'সহকারী শিক্ষক — পদার্থবিজ্ঞান', department: 'বিজ্ঞান', type: 'Full-time', campusId: 'MAIN', vacancies: 1, salaryRange: '৳২৮,০০০ – ৳৩৫,০০০', deadline: off(18), postedOn: off(-6), status: 'Open',
      description: '৯ম–১০ম শ্রেণিতে পদার্থবিজ্ঞান পাঠদান (এসএসসি, এনসিটিবি শিক্ষাক্রম), ব্যবহারিক ল্যাব সেশন পরিচালনা এবং বিজ্ঞান অলিম্পিয়াডের জন্য শিক্ষার্থীদের দিকনির্দেশনা প্রদান।',
      requirements: ['পদার্থবিজ্ঞান বা ফলিত পদার্থবিজ্ঞানে বি.এসসি./এম.এসসি.', 'এনটিআরসিএ সনদধারীদের অগ্রাধিকার', 'শ্রেণিকক্ষে পাঠদানে ন্যূনতম ২ বছরের অভিজ্ঞতা', 'বাংলা ও ইংরেজিতে পাঠদানে দক্ষ'] },
    { id: 'JOB2', title: 'প্রভাষক — ইংরেজি (এইচএসসি)', department: 'ভাষা', type: 'Full-time', campusId: 'MAIN', vacancies: 2, salaryRange: '৳৩৫,০০০ – ৳৪৫,০০০', deadline: off(25), postedOn: off(-3), status: 'Open',
      description: 'উচ্চমাধ্যমিক শাখায় ইংরেজি ১ম ও ২য় পত্র পাঠদান, বিতর্ক ক্লাব পরিচালনা এবং ভাষা ল্যাবে সহায়তা প্রদান।',
      requirements: ['ইংরেজিতে এম.এ. (সাহিত্য বা ইএলটি)', 'এইচএসসি স্তরে ন্যূনতম ৩ বছরের পাঠদান অভিজ্ঞতা', 'কথ্য ও লিখিত ইংরেজিতে চমৎকার দক্ষতা', 'আইইএলটিএস ৭.০+ থাকলে অগ্রাধিকার'] },
    { id: 'JOB3', title: 'হিসাবরক্ষক', department: 'হিসাব', type: 'Full-time', campusId: 'ALL', vacancies: 1, salaryRange: '৳৩০,০০০ – ৳৩৮,০০০', deadline: off(10), postedOn: off(-9), status: 'Open',
      description: 'উভয় ক্যাম্পাসের প্রতিষ্ঠানের লেজার সংরক্ষণ, ফি আদায়ের হিসাব মিলিয়ে দেখা (বিকাশ/নগদ/রকেট বিবরণী), বেতন-ভাতা প্রক্রিয়াকরণ ও মাসিক প্রতিবেদন প্রস্তুত।',
      requirements: ['হিসাববিজ্ঞানে এম.কম/এমবিএ', 'দ্বৈত-দাখিলা হিসাবরক্ষণ ও ভ্যাট/টিডিএস বিষয়ে অভিজ্ঞতা', 'এক্সেলে দক্ষ', 'আংশিক যোগ্যতাসম্পন্ন সিএ/সিএমএ হলে অগ্রাধিকার'] },
    { id: 'JOB4', title: 'জুনিয়র শাখার শিক্ষক — বাংলা', department: 'জুনিয়র ক্যাম্পাস', type: 'Part-time', campusId: 'NORTH', vacancies: 1, salaryRange: '৳১৫,০০০ – ৳১৮,০০০', deadline: off(-20), postedOn: off(-50), status: 'Closed',
      description: 'জুনিয়র ক্যাম্পাসে ১ম–৫ম শ্রেণিতে বাংলা পাঠদান (প্রভাতি শিফট)।',
      requirements: ['বাংলায় বি.এ. (সম্মান)', 'প্রারম্ভিক শৈশবের সাক্ষরতা বিষয়ে অভিজ্ঞতা'] },
  ];
  {
    const ts = (n, h = 10) => { const x = U.addDays(now, -n); x.setHours(h, 15, 0, 0); return x.toISOString(); };
    const iv = n => `${U.iso(U.addDays(now, n))}T11:00`;
    const cv = () => ({ fileName: 'cv.pdf', fileType: 'application/pdf', dataUrl: null });
    s.jobApplications = [
      { id: 'JA1', jobId: 'JOB1', name: 'Tanvir Ahmed', email: 'tanvir.ahmed@example.com', phone: '01712345601', qualification: 'পদার্থবিজ্ঞানে এম.এসসি., ঢাকা বিশ্ববিদ্যালয়', experienceYears: 4, coverLetter: 'আমি চার বছর ধরে এসএসসি পদার্থবিজ্ঞান পড়াচ্ছি এবং জাতীয় অলিম্পিয়াডে পদকজয়ী দুজন শিক্ষার্থীকে প্রশিক্ষণ দিয়েছি।', cv: cv(), status: 'Interview', notes: 'ভালো ক্লাস নেবেন বলে আশা করা যায়।', interviewDate: iv(3), appliedAt: ts(5) },
      { id: 'JA2', jobId: 'JOB1', name: 'Sabrina Yasmin', email: 'sabrina.y@example.com', phone: '01812345602', qualification: 'পদার্থবিজ্ঞানে বি.এসসি. (সম্মান), জাহাঙ্গীরনগর বিশ্ববিদ্যালয়', experienceYears: 2, coverLetter: 'হাতে-কলমে ল্যাবের কাজ ও প্রকল্পভিত্তিক শিখনে আমার গভীর আগ্রহ রয়েছে।', cv: cv(), status: 'Shortlisted', notes: '', interviewDate: null, appliedAt: ts(4) },
      { id: 'JA3', jobId: 'JOB1', name: 'Mahmudul Hasan', email: 'mahmud.h@example.com', phone: '01912345603', qualification: 'ইইই-তে বি.এসসি., আহসানউল্লাহ বিজ্ঞান ও প্রযুক্তি বিশ্ববিদ্যালয়', experienceYears: 0, coverLetter: '', cv: cv(), status: 'Rejected', notes: 'পাঠদানের অভিজ্ঞতা নেই; পদার্থবিজ্ঞানে স্নাতক নন।', interviewDate: null, appliedAt: ts(4, 15) },
      { id: 'JA4', jobId: 'JOB2', name: 'Farhana Kabir', email: 'farhana.kabir@example.com', phone: '01612345604', qualification: 'ইএলটি-তে এম.এ., ইস্ট ওয়েস্ট ইউনিভার্সিটি', experienceYears: 6, coverLetter: 'ঢাকার একটি স্বনামধন্য কলেজে ছয় বছর এইচএসসি ইংরেজি পড়িয়েছি; আইইএলটিএস ৮.০।', cv: cv(), status: 'New', notes: '', interviewDate: null, appliedAt: ts(1) },
      { id: 'JA5', jobId: 'JOB2', name: 'Rezaul Karim', email: 'rezaul.k@example.com', phone: '01512345605', qualification: 'ইংরেজি সাহিত্যে এম.এ., রাজশাহী বিশ্ববিদ্যালয়', experienceYears: 3, coverLetter: 'আমি একটি জেলা পর্যায়ের বিতর্ক ক্লাব পরিচালনা করি এবং সাহিত্য পড়াতে ভালোবাসি।', cv: cv(), status: 'New', notes: '', interviewDate: null, appliedAt: ts(2) },
      { id: 'JA6', jobId: 'JOB4', name: 'Nasrin Akter', email: 'nasrin.akter@example.com', phone: '01312345606', qualification: 'বাংলায় বি.এ. (সম্মান), চট্টগ্রাম বিশ্ববিদ্যালয়', experienceYears: 5, coverLetter: '', cv: cv(), status: 'Hired', notes: 'জুনিয়র ক্যাম্পাসে যোগ দিয়েছেন।', interviewDate: `${off(-30)}T10:00`, appliedAt: ts(45) },
    ];
  }

  /* ---------- guardian feedback on teachers ---------- */
  {
    const rng = rngFor('feedbackSeeded'), comments = ['স্পষ্ট ও ধৈর্যের সঙ্গে বুঝিয়ে দেন।', 'পরীক্ষার প্রস্তুতিতে অত্যন্ত সহায়ক।', 'বাড়ির কাজের চাপ কিছুটা বেশি।', 'আমার সন্তান এই ক্লাস উপভোগ করে।', 'আরও অনুশীলন-উপকরণ দিতে পারেন।', 'সর্বদা সময়নিষ্ঠ ও ভালোভাবে প্রস্তুত।'];
    s.feedback = [];
    s.guardianLinks.slice(0, 40).forEach((l, i) => {
      const st = s.students.find(x => x.id === l.studentId), tids = [...new Set(s.routine.filter(r => r.classId === st.classId).map(r => r.teacherId))];
      s.feedback.push({ id: 'FB' + (i + 1), teacherId: tids[i % tids.length], studentId: st.id, by: l.guardianUserId, role: 'GUARDIAN', rating: 3 + Math.floor(rng() * 3), comment: comments[Math.floor(rng() * comments.length)], term: `অর্ধবার্ষিক ${U.bn(y)}`, date: off(-Math.floor(rng() * 60)) });
    });
  }

  /* ---------- admissions: rules, test schedule, more applicants with test rolls and scores ---------- */
  {
    const rng = rngFor('admissionsUpgraded');
    s.admissionRules = Object.fromEntries(s.classes.map(c => [c.id, { minAge: c.grade + 4, maxAge: c.grade + 7, seats: c.grade >= 9 ? 3 : 2, waitlist: 2, testRequired: c.campusId === 'MAIN', minPrevGpa: c.grade >= 9 ? 3 : 0 }]));
    s.admissionTests = {};
    s.classes.filter(c => c.campusId === 'MAIN').forEach((c, i) => { s.admissionTests[c.id] = { date: `${y}-12-${String(5 + i).padStart(2, '0')}`, time: '09:30', venue: 'প্রধান ক্যাম্পাস — হল এ', total: 100, pass: 40, published: false, nextRoll: 1 }; });
    s.admissions.forEach(a => { a.eligibility = a.eligibility || { ok: true, reasons: [] }; });
    [['Sadia Rahman', 'C6', '01712000101'], ['Tamim Hasan', 'C6', '01812000102'], ['Labiba Sultana', 'C6', '01912000103'], ['Fardin Ahmed', 'C6', '01612000104'], ['Mim Akter', 'C6', '01512000105']].forEach(([n, cls, phone], i) => {
      const ln = n.split(' ')[1];
      s.admissions.push({ id: `APP-${y + 1}-${String(s.admissions.length + 1).padStart(4, '0')}`, campusId: 'MAIN', studentName: n, studentNameBn: demoBnName(n), classId: cls, dob: `${y - 11}-0${2 + i}-1${i}`, gender: i % 2 ? 'Male' : 'Female', blood: 'O+', birthRegNo: String(20150000000000000 + i * 7919), previousSchool: 'উদয়ন প্রাথমিক বিদ্যালয়', previousGpa: (4 + rng()).toFixed(2), guardianName: `Mr. ${ln}`, guardianNameBn: demoBnName(`Mr. ${ln}`), guardianRelation: 'Father', guardianPhone: phone, address: 'ঢাকা', fatherName: `Mr. ${ln}`, fatherNameBn: demoBnName(`Mr. ${ln}`), motherName: `Mrs. ${ln}`, motherNameBn: demoBnName(`Mrs. ${ln}`), docs: [], fee: 5500, coupon: null, discountPct: 0, netPaid: 5500, payment: { method: 'bKash', txn: trx(rng), channel: 'Online checkout', verified: true, at: U.addDays(now, -6 - i).toISOString() }, status: 'Pending', submittedAt: U.addDays(now, -6 - i).toISOString(), decidedAt: null, note: '', eligibility: { ok: true, reasons: [] } });
    });
    s.admissions.filter(a => a.status === 'Pending' && s.admissionTests[a.classId]).forEach(a => { const t = s.admissionTests[a.classId]; a.testRoll = `T${s.classes.find(c => c.id === a.classId).grade}-${String(t.nextRoll++).padStart(3, '0')}`; });
    s.admissions.filter(a => a.classId === 'C6' && a.testRoll).forEach(a => { a.score = 35 + Math.round(rng() * 60); });
  }

  /* ---------- syllabus: chapters → dated topics tagged to exams ---------- */
  {
    const rng = rngFor('syllabusV2'), PARTS = ['ধারণা ও সংজ্ঞা', 'সমাধানকৃত উদাহরণ', 'অনুশীলনী'];
    const majors = s.exams.filter(e => e.session === ses && MAJOR_EXAMS.includes(e.type)).sort((a, b) => a.start.localeCompare(b.start));
    s.syllabus.forEach(sy => {
      const n = sy.chapters.length;
      sy.chapters = sy.chapters.map((c, i) => {
        const exam = majors[Math.min(majors.length - 1, Math.floor(i / n * majors.length))];
        const doneDate = U.iso(U.addDays(c.deadline, -Math.floor(rng() * 10)));
        const topics = PARTS.map((p, k) => {
          let status = c.done ? 'Done' : 'Not started';
          if (!c.done && i > 0 && sy.chapters[i - 1].done && k === 0) status = 'Ongoing';
          if (c.done && rng() < 0.08) status = 'Revision';
          const history = status === 'Not started' ? [] : [{ status: status === 'Revision' ? 'Done' : status, date: status === 'Ongoing' ? off(-2) : doneDate, by: sy.teacherId }];
          if (status === 'Revision') history.push({ status: 'Revision', date: off(-Math.floor(rng() * 20)), by: sy.teacherId });
          return { name: `${c.name}: ${p}`, status, history };
        });
        return { name: c.name, examId: exam?.id || null, topics };
      });
      delete sy.termEnd;
    });
  }

  /* ---------- study materials (records only; no files attached) ---------- */
  {
    const t = s.teachers, prinT = t.find(x => x.designation === 'অধ্যক্ষ') || t[1];
    s.materials = [];
    [['C10', 'MATH', 'দ্বিঘাত সমীকরণ — সূত্রপত্র', 'Notes', t[0]], ['C10', 'MATH', 'অনুশীলনী ৫.২-এর সমাধান', 'Worksheet', t[0]], ['C9', 'MATH', 'সেট ও ভেনচিত্র অনুশীলন', 'Worksheet', t[0]], ['C10', 'ENG', 'অনুচ্ছেদ লেখার নির্দেশিকা', 'Notes', prinT],
     ['C10', 'SCI', 'অম্ল-ক্ষারক টাইট্রেশন ব্যবহারিক নির্দেশিকা', 'Lab Manual', t[3]], ['C9', 'BAN', 'রচনা লেখার নিয়ম', 'Notes', t[2]], ['J3', 'MATH', '১–২০ পর্যন্ত নামতা', 'Worksheet', t[8]], ['C10', 'MATH', `প্রাক-নির্বাচনী পরীক্ষা ${U.bn(y)} পাঠ্যসূচির রূপরেখা`, 'Syllabus', t[0]]]
      .forEach(([cls, subj, title, type, tt], i) => s.materials.push({ id: 'MAT' + (i + 1), classId: cls, subjectId: subj, title, type, fileName: `material-${i + 1}.pdf`, fileType: 'application/pdf', dataUrl: null, teacherId: tt.id, date: off(-i * 3), downloads: Math.floor(i * 7 % 23) }));
  }

  /* ---------- Exam Centre: routines, a carried-forward exam, a question paper with solution, a syllabus note ---------- */
  {
    const hy = s.exams.find(e => e.id === `HY${ses}`), pt = s.exams.find(e => e.id === `PT${ses}`);
    [hy, pt].filter(Boolean).forEach(e => e.schedule = s.subjects.map((sb, i) => ({ date: U.iso(U.addDays(e.start, i + Math.floor(i / 5) * 2)), start: '10:00', end: '13:00', subjectId: sb.id, room: 'আসনবিন্যাস অনুযায়ী' })));
    if (hy && pt) Object.assign(pt, { combine: [{ examId: hy.id, weight: 40 }], combineSelf: 60, combineRule: 'redistribute' });
    const by = s.users.find(u => u.username === 'principal')?.id || null;
    const base = { examId: hy.id, classId: 'C10', subjectId: 'MATH', mode: 'text', status: 'approved', published: true, by, approvedBy: by, createdAt: `${ses}-05-28`, updatedAt: `${ses}-06-01`, note: '' };
    s.examPapers = [
      { ...base, id: 'XP1001', kind: 'question', text: 'সৃজনশীল প্রশ্ন — যেকোনো দুটির উত্তর দাও\n\n১। x² − 5x + 6 = 0 একটি দ্বিঘাত সমীকরণ।\n   ক) সমীকরণটির নিশ্চায়ক নির্ণয় করো।  ২\n   খ) উৎপাদকে বিশ্লেষণ করে সমীকরণটি সমাধান করো।  ৪\n   গ) মূলদ্বয়ের যোগফল ও গুণফল নির্ণয় করে সহগের সঙ্গে মিলিয়ে দেখাও।  ৪\n\n২। U = {১, ২, ৩, ৪, ৫}, A = {১, ২}, B = {২, ৩, ৪}\n   ক) A ∪ B নির্ণয় করো।  ২\n   খ) A′ ∩ B নির্ণয় করো।  ৪\n   গ) ভেনচিত্রের সাহায্যে (A ∪ B)′ দেখাও।  ৪\n\n৩। একটি আয়তক্ষেত্রের দৈর্ঘ্য প্রস্থের চেয়ে ৪ মিটার বেশি এবং ক্ষেত্রফল ৯৬ বর্গমিটার।\n   ক) তথ্যটিকে সমীকরণে প্রকাশ করো।  ২\n   খ) আয়তক্ষেত্রটির দৈর্ঘ্য ও প্রস্থ নির্ণয় করো।  ৪\n   গ) পরিসীমা অপরিবর্তিত রেখে বর্গক্ষেত্র বানালে ক্ষেত্রফল কত বাড়বে?  ৪' },
      { ...base, id: 'XP1002', kind: 'solution', text: 'সমাধান ও নম্বর বণ্টনের নির্দেশিকা\n\n১। ক) নিশ্চায়ক = b² − 4ac = ২৫ − ২৪ = ১।\n   খ) x² − 5x + 6 = (x − 2)(x − 3) = 0 ⇒ x = ২ অথবা ৩।\n   গ) যোগফল = ৫ = −b/a, গুণফল = ৬ = c/a — মিলে যায়।\n\n২। ক) A ∪ B = {১, ২, ৩, ৪}\n   খ) A′ = {৩, ৪, ৫} ⇒ A′ ∩ B = {৩, ৪}\n   গ) (A ∪ B)′ = {৫} — ভেনচিত্রে আয়তের ভেতরে কিন্তু দুই বৃত্তের বাইরে।\n\n৩। ক) x(x + 4) = 96\n   খ) x² + 4x − 96 = 0 ⇒ (x + 12)(x − 8) = 0 ⇒ প্রস্থ ৮ মি, দৈর্ঘ্য ১২ মি।\n   গ) পরিসীমা ৪০ মি ⇒ বাহু ১০ মি, ক্ষেত্রফল ১০০ বর্গমি — ৪ বর্গমি বেশি।' },
    ];
    s.examSyllabus = pt ? [{ examId: pt.id, classId: 'C10', subjectId: 'BAN', text: 'রচনা: আমার প্রিয় শিক্ষক / বাংলাদেশের ষড়ঋতু।\nব্যাকরণ: সমাস, কারক ও বিভক্তি।\nপত্রলিখন: ছুটির আবেদনপত্র।', by: null, updated: ses + '-09-15' }] : [];
  }

  /* ---------- gallery (generated artwork) ---------- */
  [['বার্ষিক ক্রীড়া দিবস', 'ক্রীড়া', `${y}-02-08`], ['আন্তঃহাউস বিজ্ঞান মেলা', 'বিজ্ঞান মেলা', `${y}-08-14`], ['বিজয় দিবসের কুচকাওয়াজ', 'জাতীয় দিবস', `${y - 1}-12-16`], ['ভাষা দিবস — শহীদ মিনার', 'জাতীয় দিবস', `${y}-02-21`],
   ['রোবোটিক্স ক্লাব প্রদর্শনী', 'ক্লাব', `${y}-05-11`], ['গ্রন্থাগারের নতুন ভবন', 'ক্যাম্পাস', `${y}-01-20`], ['জুনিয়র ক্যাম্পাস চিত্রকলা সপ্তাহ', 'জুনিয়র ক্যাম্পাস', `${y}-04-02`], ['এসএসসি কৃতী শিক্ষার্থী সংবর্ধনা', 'অর্জন', `${y}-07-15`], ['বিতর্ক প্রতিযোগিতা', 'ক্লাব', `${y}-09-03`]]
    .forEach(([title, album, date], i) => s.site.gallery.push({ id: 'GAL' + (i + 1), title, album, date, dataUrl: demoArt('GAL' + (i + 1) + title, title) }));

  demoExamExtras(ctx);
  return s;
}

/* Exam module demo records: question bank, exam syllabus, papers and solutions, online tests (upcoming / open /
   closed with graded attempts), OMR-evaluated marks, exam attendance, a seat plan, re-check requests, and the
   public result snapshots + statistics (computed with js/db.js's own DB.result, so they match the app). */
function demoExamExtras(ctx) {
  const { s } = ctx, now = new Date(), ses = s.activeSession, rng = U.rng(20261022);
  const iso = d => new Date(d).toISOString(), at = (days, h = 10) => { const d = U.addDays(now, days); d.setHours(h, 0, 0, 0); return iso(d); };
  const hy = s.exams.find(e => e.id === `HY${ses}`), pt = s.exams.find(e => e.id === `PT${ses}`), ct2 = s.exams.find(e => e.id === `CT2-${ses}`);
  const tByUser = name => { const u = s.users.find(x => x.username === name); return s.teachers.find(t => t.userId === u?.id); };
  const mathT = tByUser('teacher') || s.teachers[0], prin = s.users.find(u => u.username === 'principal'), byP = prin?.id || null, byT = mathT?.userId || null;
  const tFor = sub => s.teachers.find(t => (t.subjects || []).includes(sub)) || mathT;
  const inCls = c => s.students.filter(x => x.classId === c && x.status === 'active').sort((a, b) => (+a.roll || 0) - (+b.roll || 0));
  s._demoAudit = s._demoAudit || [];

  /* ---------- question bank ---------- */
  const qb = (classId, subjectId, type, q, chapter, diff = 'medium', tags = []) => s.qbank.push({ id: 'QB' + (s.qbank.length + 1001), subjectId, classId, chapter, tags, diff, type, q: { type, img: '', model: '', chapter, tags: tags.join(', '), diff, ...q }, by: tFor(subjectId).userId, at: U.iso(U.addDays(now, -40 + s.qbank.length)) });
  s.qbank = [];
  qb('C10', 'MATH', 'mcq', { text: 'x² − 7x + 12 = 0 সমীকরণের মূলদ্বয় কোনটি?', marks: 1, opts: ['৩ ও ৪', '২ ও ৬', '−৩ ও −৪', '১ ও ১২'], ans: 0 }, 'দ্বিঘাত সমীকরণ', 'easy', ['সমীকরণ']);
  qb('C10', 'MATH', 'mcq', { text: 'একটি বৃত্তের ব্যাসার্ধ ৭ সেমি হলে পরিধি কত? (π = ২২/৭)', marks: 1, opts: ['২২ সেমি', '৪৪ সেমি', '১৫৪ সেমি', '৪৯ সেমি'], ans: 1 }, 'বৃত্ত', 'easy');
  qb('C10', 'MATH', 'cq', { text: 'একটি সমকোণী ত্রিভুজের অতিভুজ ১৩ সেমি এবং একটি বাহু ৫ সেমি।', marks: 10, parts: [{ t: 'অপর বাহুর দৈর্ঘ্য নির্ণয় করো।', m: 2, a: '১২ সেমি' }, { t: 'ত্রিভুজটির ক্ষেত্রফল নির্ণয় করো।', m: 4, a: '৩০ বর্গসেমি' }, { t: 'অতিভুজের ওপর অঙ্কিত লম্বের দৈর্ঘ্য নির্ণয় করো।', m: 4, a: '৬০/১৩ সেমি' }] }, 'পিথাগোরাসের উপপাদ্য', 'medium', ['জ্যামিতি']);
  qb('C10', 'MATH', 'short', { text: 'সমান্তর ধারার সাধারণ পদের সূত্রটি লেখো।', marks: 2, model: 'a + (n − 1)d' }, 'অনুক্রম ও ধারা', 'easy');
  qb('C10', 'BAN', 'essay', { text: 'রচনা লেখো: “বাংলাদেশের মুক্তিযুদ্ধ”।', marks: 10 }, 'রচনা', 'medium');
  qb('C10', 'BAN', 'fill', { text: '“বিদ্যালয়” শব্দটির সন্ধিবিচ্ছেদ ______।', marks: 1, model: 'বিদ্যা + আলয়' }, 'সন্ধি', 'easy');
  qb('C10', 'ENG', 'trans', { text: 'Translate into English: সে প্রতিদিন সকালে হাঁটতে যায়।', marks: 5, model: 'He goes for a walk every morning.' }, 'Translation', 'easy');
  qb('C10', 'ENG', 'one', { text: 'Write the antonym of “ancient”.', marks: 1, model: 'modern' }, 'Vocabulary', 'easy');
  qb('C10', 'SCI', 'mcq', { text: 'কোনটি ক্ষারক?', marks: 1, opts: ['HCl', 'NaOH', 'H₂SO₄', 'CO₂'], ans: 1 }, 'অম্ল, ক্ষারক ও লবণ', 'easy');
  qb('C9', 'SCI', 'tf', { text: 'আলো শূন্য মাধ্যমে চলতে পারে।', marks: 1, ans: 'T' }, 'আলো', 'easy');
  qb('C9', 'SCI', 'mcqm', { text: 'নিচের কোনগুলো নবায়নযোগ্য শক্তির উৎস?', marks: 1, opts: ['সৌরশক্তি', 'কয়লা', 'বায়ুশক্তি', 'প্রাকৃতিক গ্যাস'], ans: [0, 2] }, 'শক্তি', 'medium');
  qb('C9', 'MATH', 'match', { text: 'বাম পাশের সঙ্গে ডান পাশ মেলাও।', marks: 4, pairs: [['বর্গের ক্ষেত্রফল', 'a²'], ['আয়তের ক্ষেত্রফল', 'ab'], ['বৃত্তের ক্ষেত্রফল', 'πr²'], ['ত্রিভুজের ক্ষেত্রফল', '½ × ভূমি × উচ্চতা']] }, 'পরিমিতি', 'medium');
  qb('J3', 'MATH', 'mcq', { text: '৭ × ৮ = ?', marks: 1, opts: ['৫৪', '৫৬', '৬৩', '৪৮'], ans: 1 }, 'গুণ', 'easy');

  /* ---------- exam syllabus (প্রাক-নির্বাচনী) ---------- */
  if (pt) {
    [['C10', 'MATH', 'বীজগাণিতিক রাশি, দ্বিঘাত সমীকরণ, সূচক ও লগারিদম।\nজ্যামিতি: পিথাগোরাসের উপপাদ্য, বৃত্তসংক্রান্ত উপপাদ্য।\nপরিমিতি: ত্রিভুজ ও চতুর্ভুজের ক্ষেত্রফল।'],
     ['C10', 'ENG', 'Reading: Unit 1–6 (seen passages).\nGrammar: Tense, Voice, Narration.\nWriting: Paragraph, Formal letter, Dialogue.'],
     ['C10', 'SCI', 'অধ্যায় ১–৮: জীবনের রাসায়নিক ভিত্তি থেকে অম্ল-ক্ষারক সমতা পর্যন্ত।\nব্যবহারিক: টাইট্রেশন, আলোর প্রতিফলন।'],
     ['C9', 'BAN', 'গদ্য: “বই পড়া”, “সুভা”।\nপদ্য: “কপোতাক্ষ নদ”, “আমার পরিচয়”।\nব্যাকরণ: সন্ধি, সমাস, কারক।'],
     ['C9', 'MATH', 'বাস্তব সংখ্যা, সেট ও ফাংশন, বীজগাণিতিক রাশি, সূচক।']]
      .forEach(([classId, subjectId, text]) => s.examSyllabus.push({ examId: pt.id, classId, subjectId, text, by: tFor(subjectId).userId, updated: U.iso(U.addDays(now, -20)) }));
  }

  /* ---------- papers and solutions ---------- */
  const paper = (o) => s.examPapers.push({ mode: 'text', note: '', createdAt: U.iso(U.addDays(now, -30)), updatedAt: U.iso(U.addDays(now, -25)), ...o });
  if (ct2) {
    paper({ id: 'XP1003', kind: 'question', examId: ct2.id, classId: 'C9', subjectId: 'MATH', status: 'approved', published: true, by: byT, approvedBy: byP, text: 'শ্রেণি পরীক্ষা — গণিত (পূর্ণমান ২০)\n১। A = {১, ২, ৩} হলে P(A) নির্ণয় করো।  ৫\n২। (a + b)² − (a − b)² = 4ab প্রমাণ করো।  ৫\n৩। ২^x = ৩২ হলে x-এর মান নির্ণয় করো।  ৫\n৪। একটি বর্গের কর্ণ ১০ সেমি হলে এর ক্ষেত্রফল কত?  ৫' });
    paper({ id: 'XP1004', kind: 'solution', examId: ct2.id, classId: 'C9', subjectId: 'MATH', status: 'approved', published: true, by: byT, approvedBy: byP, text: '১। P(A) = {∅, {১}, {২}, {৩}, {১,২}, {১,৩}, {২,৩}, {১,২,৩}}\n২। বাম পক্ষ = 4ab = ডান পক্ষ।\n৩। ২^x = ২^৫ ⇒ x = ৫\n৪। ক্ষেত্রফল = কর্ণ²/২ = ৫০ বর্গসেমি' });
  }
  if (pt) {
    paper({ id: 'XP1005', kind: 'question', examId: pt.id, classId: 'C10', subjectId: 'ENG', status: 'submitted', published: false, by: tFor('ENG').userId, text: 'Part A — Reading (20)\nRead the passage and answer the questions …\n\nPart B — Writing (30)\nWrite a paragraph on “Digital Bangladesh”.' });
    paper({ id: 'XP1006', kind: 'question', examId: pt.id, classId: 'C10', subjectId: 'BAN', status: 'draft', published: false, by: tFor('BAN').userId, text: 'খসড়া — সৃজনশীল প্রশ্ন ১–৪' });
    // a structured MCQ paper (one set) — the answer key the OMR reader uses
    const mq = [['পানির রাসায়নিক সংকেত কোনটি?', ['H₂O', 'CO₂', 'O₂', 'NaCl'], 0], ['কোনটি জড় গ্যাস?', ['নাইট্রোজেন', 'আর্গন', 'অক্সিজেন', 'হাইড্রোজেন'], 1], ['আলোর বেগ প্রায় কত কিমি/সেকেন্ড?', ['৩ লক্ষ', '৩ হাজার', '৩০ হাজার', '৩ কোটি'], 0], ['উদ্ভিদের খাদ্য তৈরি হয় কোথায়?', ['মূলে', 'কাণ্ডে', 'পাতায়', 'ফুলে'], 2], ['pH ৭-এর কম হলে দ্রবণটি—', ['ক্ষারীয়', 'নিরপেক্ষ', 'অম্লীয়', 'লবণাক্ত'], 2]];
    const content = { time: '৩০ মিনিট', instr: '', sets: 1, sections: [{ id: 'sMCQ', title: 'বহুনির্বাচনি অংশ', instr: 'সঠিক উত্তরের বৃত্তটি ভরাট করো।', any: 0, comp: 'mcq', time: '', qs: mq.map(([text, opts, ans], i) => ({ id: 'qm' + (i + 1), type: 'mcq', text, img: '', marks: 1, opts, ans, model: '', chapter: '', tags: '', diff: 'easy' })) }] };
    paper({ id: 'XP1007', kind: 'question', examId: hy.id, classId: 'C10', subjectId: 'SCI', mode: 'builder', status: 'approved', published: true, by: tFor('SCI').userId, approvedBy: byP, content, text: mq.map((q, i) => `${i + 1}. ${q[0]}`).join('\n') });
  }

  /* ---------- online tests: upcoming, open, closed (graded attempts) ---------- */
  const QS = [['mcq', '২ + ৩ × ৪ = ?', ['২০', '১৪', '২৪', '১০'], 1], ['tf', 'সব মৌলিক সংখ্যা বিজোড়।', null, 'F'], ['mcq', '√১৪৪ = ?', ['১১', '১২', '১৩', '১৪'], 1], ['mcqm', 'কোনগুলো জোড় সংখ্যা?', ['২', '৩', '৮', '৯'], [0, 2]], ['one', '১ ডজন = কয়টি?', null, '১২|12']];
  const questions = QS.map(([type, text, opts, ans], i) => ({ id: 'z' + (i + 1), type, text, img: '', marks: type === 'mcqm' ? 2 : 1, opts: opts || [], ans }));
  const quiz = (id, title, start, end, extra = {}) => ({ id, title, classId: 'C10', subjectId: 'MATH', by: byT, status: 'published', start, end, duration: 20, attempts: 1, negative: 0, shuffle: true, shuffleOpts: true, resultPolicy: 'close', released: false, questions, push: null, ...extra });
  s.quizzes = [
    quiz('QZ1001', 'সাপ্তাহিক কুইজ — বীজগণিত', at(3, 10), at(3, 12)),
    quiz('QZ1002', 'অনুশীলন কুইজ — পাটিগণিত', at(-1, 8), at(2, 22), { resultPolicy: 'instant' }),
    quiz('QZ1003', 'মাসিক কুইজ — সংখ্যা পদ্ধতি', at(-10, 10), at(-9, 10)),
  ];
  const ok = (q, a) => (q.type === 'mcqm' ? JSON.stringify([...a].sort()) === JSON.stringify(q.ans) : q.type === 'one' ? String(q.ans).split('|').includes(String(a)) : String(a) === String(q.ans));
  s.quizAttempts = [];
  inCls('C10').slice(0, 9).forEach((st, k) => {
    const answers = {}, detail = {}; let score = 0, correct = 0, wrong = 0, empty = 0;
    questions.forEach(q => {
      const right = rng() < 0.55 + (k % 4) * 0.1;
      const a = q.type === 'mcq' ? (right ? q.ans : (q.ans + 1) % 4) : q.type === 'tf' ? (right ? q.ans : q.ans === 'T' ? 'F' : 'T') : q.type === 'mcqm' ? (right ? q.ans : [0]) : (right ? '১২' : '১০');
      if (k === 8 && q.id === 'z5') { empty++; detail[q.id] = { ok: null, pts: 0 }; return; }
      answers[q.id] = a; const g = ok(q, a); g ? (correct++, score += q.marks) : wrong++; detail[q.id] = { ok: g, pts: g ? q.marks : 0 };
    });
    const st0 = U.addDays(now, -10); st0.setHours(10, 5 + k, 0, 0);
    s.quizAttempts.push({ id: `QAD${k + 1}`, quizId: 'QZ1003', studentId: st.id, by: st.userId, no: 1, startedAt: iso(st0), deadline: iso(+st0 + 20 * 60e3), order: questions.map(q => q.id), optOrder: Object.fromEntries(questions.filter(q => q.opts.length).map(q => [q.id, q.opts.map((_, i) => i)])), answers, status: 'submitted', submittedAt: iso(+st0 + (12 + k) * 60e3), score, max: U.sum(questions, q => q.marks), correct, wrong, empty, detail });
  });

  /* ---------- OMR: the অর্ধবার্ষিক বিজ্ঞান MCQ marks of class 10 were read from OMR sheets ---------- */
  if (hy) {
    const om = s.marks.filter(m => m.examId === hy.id && m.subjectId === 'SCI' && inCls('C10').some(x => x.id === m.studentId));
    om.forEach(m => { m.src = 'omr'; });
    s._demoAudit.push({ action: 'OMR_MARKS', entity: 'marks', detail: `${hy.id} · C10 · SCI: ওএমআর থেকে ${om.length} জনের বহুনির্বাচনি নম্বর` });
  }

  /* ---------- exam attendance (অর্ধবার্ষিক, classes 9 and 10, every paper) ---------- */
  s.examAttendance = [];
  if (hy) {
    const absent = new Set();
    ['C9', 'C10'].forEach(c => {
      const list = inCls(c), miss = list[list.length - 1];
      (hy.schedule || []).forEach((slot, i) => list.forEach(st => {
        const a = st === miss && i === 1;
        if (a) { absent.add(`${st.id}|${slot.subjectId}`); const m = s.marks.find(x => x.examId === hy.id && x.studentId === st.id && x.subjectId === slot.subjectId); if (m) Object.assign(m, { cq: 0, mcq: 0, absent: true }); }
        s.examAttendance.push({ id: `XA-${hy.id}-${slot.subjectId}-${st.id}`, examId: hy.id, subjectId: slot.subjectId, studentId: st.id, classId: c, date: slot.date, room: c === 'C10' ? 'Hall-A' : '901', status: a ? 'A' : 'P', by: byT, at: iso(slot.date + 'T10:15:00') });
      }));
    });
  }

  /* ---------- seat plan (প্রাক-নির্বাচনী, first sitting, classes 9 and 10 mixed two per bench) ---------- */
  if (pt && (pt.schedule || []).length) {
    const first = pt.schedule[0], q9 = inCls('C9'), q10 = inCls('C10'), seq = [];
    for (let i = 0; i < Math.max(q9.length, q10.length); i++) { if (q10[i]) seq.push(q10[i].id); if (q9[i]) seq.push(q9[i].id); }
    const mk = (roomId, name, rows, cols, take, blocked = []) => { const grid = []; for (let r = 0; r < rows; r++) { const row = []; for (let c = 0; c < cols; c++) row.push(blocked.includes(`${r},${c}`) ? '#' : (take.shift() || null)); grid.push(row); } return { roomId, name, no: roomId, rows, cols, per: 2, grid }; };
    const pool = [...seq];
    s.seatPlans = [{ id: 'SP1001', examId: pt.id, sitting: `${first.date}|${first.start || ''}`, campusId: 'MAIN', rules: { mix: 2, gap: 1, order: 'roll', bySection: false }, rooms: [mk('Hall-A', 'হল এ', 4, 6, pool, ['0,5']), mk('901', 'কক্ষ ৯০১', 3, 4, pool)], unseated: pool, at: iso(U.addDays(now, -2)), by: byP }];
  }

  /* ---------- re-check requests (অর্ধবার্ষিক) ---------- */
  s.recheckReqs = [];
  if (hy) {
    const c10 = inCls('C10'), mk = (i, st, subjectId, status, extra = {}) => s.recheckReqs.push({ id: `RCD${i}`, examId: hy.id, studentId: st.id, subjectId, reason: 'প্রাপ্ত নম্বর প্রত্যাশার চেয়ে কম মনে হচ্ছে।', fee: 0, invoiceId: null, status, by: st.userId, byOffice: false, at: iso(U.addDays(now, -12 + i)), ...extra });
    const vals = (st, sub) => { const m = s.marks.find(x => x.examId === hy.id && x.studentId === st.id && x.subjectId === sub) || {}; return { cq: +m.cq || 0, mcq: +m.mcq || 0 }; };
    if (c10[2]) mk(1, c10[2], 'MATH', 'Pending');
    if (c10[3]) mk(2, c10[3], 'ENG', 'Assigned', { reviewerId: tFor('ENG').id });
    if (c10[4]) { const o = vals(c10[4], 'BAN'); mk(3, c10[4], 'BAN', 'Accepted', { reviewerId: tFor('BAN').id, oldVals: o, newVals: o, decidedBy: byP, decidedAt: iso(U.addDays(now, -3)), decision: 'পুনঃনিরীক্ষায় নম্বর অপরিবর্তিত' }); }
    if (c10[5]) mk(4, c10[5], 'SCI', 'Rejected', { decidedBy: byP, decidedAt: iso(U.addDays(now, -4)), decision: 'বাতিল: আবেদনের সময়সীমা পেরিয়ে গেছে' });
  }

  /* ---------- public results: snapshots, views and statistics ---------- */
  const prevS = DB.s; DB.s = s;
  try {
    s.pubResultSets = {}; const statsData = {};
    s.exams.filter(e => e.published).forEach(ex => {
      const classes = {}, rows = [], subj = {}, grades = {}, order = []; let topLabel = '';
      s.classes.forEach(c => {
        const bands = Grade.bands(c.campusId, ex.session, ex), top = bands[0]?.letter; if (!topLabel) topLabel = top;
        bands.forEach(b => { if (!order.includes(b.letter)) order.push(b.letter); });
        const list = DB.studentsIn(c.id).map(st => ({ st, r: DB.result(st.id, ex.id) })).filter(x => x.r.rows.length);
        if (!list.length) return;
        list.sort((a, b) => ((b.r.gpa ?? b.r.pct / 20) - (a.r.gpa ?? a.r.pct / 20)) || (b.r.total - a.r.total));
        classes[c.id] = { name: c.name, rows: list.map((x, i) => ({ id: x.st.id, roll: +x.st.roll, name: x.st.nameBn || x.st.name, section: x.st.section || '', gpa: x.r.gpa ?? null, letter: x.r.letter, passed: !!x.r.passed, total: Math.round(x.r.total * 10) / 10, max: x.r.max, pos: i + 1 })) };
        list.forEach(({ st, r }) => {
          rows.push({ c: c.id, sec: st.section || '', grp: st.stream || '', passed: !!r.passed, top: r.letter === top });
          grades[r.letter] = (grades[r.letter] || 0) + 1;
          r.rows.forEach(x => { const o = subj[x.subject.id] || (subj[x.subject.id] = { id: x.subject.id, name: x.subject.name, n: 0, pass: 0 }); o.n++; if (!x.failed) o.pass++; });
        });
      });
      s.pubResultSets[ex.id] = { at: iso(now), by: null, seed: true, classes };
      const agg = rs => ({ n: rs.length, pass: rs.filter(r => r.passed).length, top: rs.filter(r => r.top).length });
      const by = (rs, k) => [...new Set(rs.map(r => r[k]).filter(Boolean))].map(name => ({ name, ...agg(rs.filter(r => r[k] === name)) }));
      if (rows.length) statsData[ex.id] = { at: iso(now), combined: false, topLabel, ...agg(rows), grades: order.filter(l => grades[l]).map(l => [l, grades[l]]), subjects: Object.values(subj), classes: [...new Set(rows.map(r => r.c))].map(id => { const rs = rows.filter(r => r.c === id); return { id, name: s.classes.find(c => c.id === id)?.name || id, ...agg(rs), sections: by(rs, 'sec'), groups: by(rs, 'grp') }; }) };
    });
    s.school.pubViews = { list: { on: true, showName: true, showId: false, showTotal: true, by: 'section' }, summary: { on: true }, merit: { on: true, top: 10, showName: true, showId: false, showTotal: true } };
    s.config = s.config || {};
    s.config.publicResult = { ...(s.config.publicResult || {}), stats: { on: true, blocks: { examinees: true, passRate: true, aplus: true, grades: true, subjects: true, breakdown: true } }, statsData };
  } finally { DB.s = prevS; }
}
