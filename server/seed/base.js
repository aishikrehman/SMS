/* Demo institution — core records (people, classes, attendance, exams and marks, fees, ledger, payroll,
   routine, notices, admissions, homework, syllabus, service requests …).
   This file is NOT a Node module: server/seed/build.js runs it inside a sandbox that has first loaded
   js/db.js, so the browser's own helpers (U, CLASS_BN, NCTB_BANDS, DB_calcPay, DAYS, PERIODS …) shape
   the data exactly as the app expects. Only `npm run seed:demo` uses it. */

/* English → Bangla for the demo's personal names (every word must be known, otherwise no Bangla name). */
const DEMO_NAME_BN = {
  'Mr.': 'জনাব', 'Mrs.': 'মিসেস', 'Dr.': 'ড.', 'Md.': 'মো.', 'Mst.': 'মোসা.',
  Arif: 'আরিফ', Nafisa: 'নাফিসা', Tahmid: 'তাহমিদ', Raisa: 'রাইসা', Sakib: 'সাকিব', Mehjabin: 'মেহজাবিন', Fahim: 'ফাহিম', Tasnia: 'তাসনিয়া', Ayaan: 'আয়ান', Lamia: 'লামিয়া',
  Rifat: 'রিফাত', Sumaiya: 'সুমাইয়া', Zarif: 'জারিফ', Anika: 'আনিকা', Imran: 'ইমরান', Nabila: 'নাবিলা', Shafin: 'শাফিন', Orpa: 'অর্পা', Tanzim: 'তানজিম', Maliha: 'মালিহা',
  Rayan: 'রায়ান', Samiha: 'সামিহা', Junaid: 'জুনায়েদ', Prova: 'প্রভা', Adnan: 'আদনান', Farzana: 'ফারজানা', Nayeem: 'নাঈম', Ishrat: 'ইশরাত', Siam: 'সিয়াম', Tahsin: 'তাহসিন',
  Hossain: 'হোসেন', Rahman: 'রহমান', Ahmed: 'আহমেদ', Chowdhury: 'চৌধুরী', Islam: 'ইসলাম', Khan: 'খান', Siddiqui: 'সিদ্দিকী', Sarker: 'সরকার', Haque: 'হক', Uddin: 'উদ্দিন', Talukder: 'তালুকদার', Mia: 'মিয়া',
  Abul: 'আবুল', Jahangir: 'জাহাঙ্গীর', Habib: 'হাবিব', Mostafa: 'মোস্তফা', Shamsul: 'শামসুল', Kabir: 'কবির', Selim: 'সেলিম', Anwar: 'আনোয়ার',
  Rokeya: 'রোকেয়া', Selina: 'সেলিনা', Nasima: 'নাসিমা', Rehana: 'রেহানা', Taslima: 'তাসলিমা', Dilruba: 'দিলরুবা', Shirin: 'শিরিন', Nazma: 'নাজমা', Begum: 'বেগম',
  Mahmudul: 'মাহমুদুল', Karim: 'করিম', Nusrat: 'নুসরাত', Jahan: 'জাহান', Abdul: 'আব্দুল', Mannan: 'মান্নান', Sharmin: 'শারমিন', Akter: 'আক্তার', Rafiqul: 'রফিকুল',
  Shahana: 'শাহানা', Parvin: 'পারভীন', Sultana: 'সুলতানা', Imtiaz: 'ইমতিয়াজ', Lutfun: 'লুৎফুন', Nahar: 'নাহার', Sohel: 'সোহেল', Rana: 'রানা', Farida: 'ফরিদা', Yasmin: 'ইয়াসমিন',
  Kamrul: 'কামরুল', Hasan: 'হাসান', Mosharraf: 'মোশাররফ', Jannatul: 'জান্নাতুল', Ferdous: 'ফেরদৌস', Aminul: 'আমিনুল', Tahmina: 'তাহমিনা', Zahid: 'জাহিদ', Farhana: 'ফারহানা',
  Tanvir: 'তানভীর', Kamal: 'কামাল', Shamim: 'শামীম', Mizanur: 'মিজানুর', Kader: 'কাদের', Jalal: 'জালাল', Rubel: 'রুবেল', Nasrin: 'নাসরিন', Halima: 'হালিমা', Sumon: 'সুমন',
  Das: 'দাস', Monowara: 'মনোয়ারা', Khatun: 'খাতুন', Nurul: 'নুরুল', Mushfiq: 'মুশফিক', Rahim: 'রহিম', Abdur: 'আব্দুর', Tasfia: 'তাসফিয়া', Noor: 'নূর', Amin: 'আমিন',
  Saad: 'সাদ', Bin: 'বিন', Humayun: 'হুমায়ুন', Tasnim: 'তাসনিম', Rafsan: 'রাফসান', Mahir: 'মাহির', Arnob: 'অর্ণব', Sadia: 'সাদিয়া', Nusaiba: 'নুসাইবা', Fariha: 'ফারিহা',
  Mahira: 'মাহিরা', Ehsan: 'এহসান', Nowshin: 'নওশীন', Tabassum: 'তাবাসসুম', Saha: 'সাহা', Tamim: 'তামিম', Fardin: 'ফারদিন', Mahin: 'মাহিন', Ariyan: 'আরিয়ান', Labiba: 'লাবিবা', Tanha: 'তানহা', Rafi: 'রাফি', Afsana: 'আফসানা', Mim: 'মীম', Ali: 'আলী', Hasina: 'হাসিনা', Momin: 'মমিন',
  Sabrina: 'সাবরিনা', Rezaul: 'রেজাউল',
};
function demoBnName(en) { if (!en) return null; const t = String(en).trim().split(/\s+/); return t.every(x => DEMO_NAME_BN[x]) ? t.map(x => DEMO_NAME_BN[x]).join(' ') : null; }

/** → the demo state (without the module collections, which server/seed/modules.js adds). */
function demoBase(opts) {
  const r = U.rng(20261012);
  const pick = arr => arr[Math.floor(r() * arr.length)];
  const digits = n => Array.from({ length: n }, (_, i) => i === 0 ? 1 + Math.floor(r() * 9) : Math.floor(r() * 10)).join('');
  const trx = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let x = ''; for (let i = 0; i < 10; i++) x += a[Math.floor(r() * a.length)]; return x; };
  const now = opts.now || new Date();
  const year = now.getFullYear(), session = String(year);
  const s = {
    school: {
      name: 'Dhee Academy', nameBn: 'ধী একাডেমি', shortName: 'DHEE', eiin: '108245', founded: 1998, type: 'সাধারণ বিদ্যালয়',
      address: '৪২ লেক সার্কাস রোড, কলাবাগান, ঢাকা ১২০৫', phone: '+880 2-9112045', email: 'info@dheeacademy.edu.bd', website: 'www.dheeacademy.edu.bd',
      motto: 'জ্ঞান · শৃঙ্খলা · সেবা', mottoBn: 'জ্ঞান · শৃঙ্খলা · সেবা', passGpa: 2.0, minAttendance: 75, lateThreshold: 5, lateAfter: '08:10',
      principalName: 'ড. ফারহানা রহমান', directorName: 'প্রকৌ. আমিনুল হক', directorTitle: 'সভাপতি, পরিচালনা পর্ষদ',
      directorMessage: 'পরিচালনা পর্ষদের পক্ষ থেকে সবাইকে শুভেচ্ছা। শিক্ষার্থীদের নিরাপদ, আধুনিক ও আনন্দময় শিক্ষার পরিবেশ নিশ্চিত করাই আমাদের অঙ্গীকার। অভিভাবক, শিক্ষক ও শিক্ষার্থীদের সম্মিলিত প্রচেষ্টায় প্রতিষ্ঠানটি আরও এগিয়ে যাবে।',
      logo: null, stampImage: null, signature: null, directorSignature: null, stampText: 'DHEE ACADEMY · EIIN 108245 · DHAKA',
      stats: { passRate: 98.6, scholars: 3412, faculty: 146, aPlus: 412 },
      merchant: { bKash: '01799-112045', Nagad: '01899-112045', Rocket: '01699-1120457' },
      welcome: '১৯৯৮ সাল থেকে ধী একাডেমি অনুসন্ধিৎসু, সুশৃঙ্খল ও সহমর্মী নাগরিক গড়ে তুলছে। আমাদের শ্রেণিকক্ষে জাতীয় শিক্ষাক্রমের নিবিড় পাঠদানের সঙ্গে বিজ্ঞানমেলা, বিতর্ক, খেলাধুলা ও সমাজসেবার সমন্বয় ঘটানো হয় — যাতে প্রতিটি শিক্ষার্থী বিশ্বের জন্য প্রস্তুত হয়ে বিদ্যালয় ত্যাগ করে।',
      shifts: [{ id: 'MORNING', name: 'প্রভাতি', start: '07:30', end: '12:00' }, { id: 'DAY', name: 'দিবা', start: '12:30', end: '17:00' }],
      sectionCapacity: 45, roomRules: { maxPerRoom: 45, examSeatsPerBench: 2, keepLabsForPractical: true },
    },
    site: {
      hero: { title: 'ধী একাডেমি', subtitle: 'জ্ঞান · শৃঙ্খলা · সেবা — ১৯৯৮ সাল থেকে প্রাক-প্রাথমিক থেকে উচ্চ মাধ্যমিক পর্যন্ত শিক্ষার্থীদের গড়ে তুলছি।', image: null, ctaText: 'ভর্তির আবেদন করুন', ctaLink: '/admissions', cta2Text: 'ফলাফল দেখুন', cta2Link: '/results', showStats: true, align: 'left' },
      ticker: true,
      programs: [
        { id: 'PG1', name: 'প্রাক-প্রাথমিক ও কিন্ডারগার্টেন', ages: '৩–৫ বছর', desc: 'ধ্বনিবিজ্ঞান, সংখ্যাজ্ঞান ও চলন-দক্ষতাসহ বাংলা ও ইংরেজিতে খেলাভিত্তিক প্রারম্ভিক শিক্ষা।', icon: 'baby' },
        { id: 'PG2', name: 'প্রাথমিক (প্রথম–পঞ্চম শ্রেণি)', ages: '৬–১০ বছর', desc: 'উত্তর শাখা ক্যাম্পাসে ছোট শ্রেণি-আকার ও কার্যক্রমভিত্তিক শিখনসহ এনসিটিবি শিক্ষাক্রম।', icon: 'blocks' },
        { id: 'PG3', name: 'মাধ্যমিক (ষষ্ঠ–দশম শ্রেণি)', ages: '১১–১৬ বছর', desc: 'এসএসসি পরীক্ষার লক্ষ্যে বিজ্ঞান, ব্যবসায় শিক্ষা ও মানবিক বিভাগ।', icon: 'book-open' },
        { id: 'PG4', name: 'উচ্চ মাধ্যমিক (এইচএসসি)', ages: '১৬–১৮ বছর', desc: 'গবেষণাগারনির্ভর ব্যবহারিক কাজসহ বিজ্ঞান, ব্যবসায় ও মানবিক বিভাগ।', icon: 'graduation-cap' },
        { id: 'PG5', name: 'মাদ্রাসা (দাখিল)', ages: '১১–১৬ বছর', desc: 'সাধারণ বিষয়ের সঙ্গে আরবি ও ইসলামি শিক্ষার সমন্বয়ে দাখিল শিক্ষাক্রম।', icon: 'moon-star' },
      ],
      gallery: [],
    },
    campuses: [
      { id: 'MAIN', name: 'প্রধান ক্যাম্পাস', short: 'প্রধান', address: '৪২ লেক সার্কাস রোড, কলাবাগান, ঢাকা ১২০৫', phone: '+880 2-9112045', levels: 'প্রথম–দশম শ্রেণি (প্রাথমিক ও মাধ্যমিক)' },
      { id: 'NORTH', name: 'উত্তর শাখা ক্যাম্পাস (জুনিয়র ক্যাম্পাস)', short: 'উত্তর', address: 'বাড়ি ১৪, রোড ৭, সেক্টর ৪, উত্তরা, ঢাকা ১২৩০', phone: '+880 2-8951120', levels: 'প্রথম–পঞ্চম শ্রেণি (প্রাথমিক)' },
    ],
    users: [], userRoles: [], classes: [], subjects: [], teachers: [], students: [], guardianLinks: [],
    attendance: {}, exams: [], marks: [], invoices: [], payments: [], admissions: [], feeConfigs: [], gradingSchemes: [],
    coupons: { EARLYBIRD2027: { pct: 50, label: 'আগাম ভর্তিতে ৫০% ছাড়' }, TALENT100: { pct: 100, label: 'মেধা বৃত্তি — সম্পূর্ণ মওকুফ' }, SIBLING20: { pct: 20, label: 'ভাই-বোন ছাড় ২০%' } },
    notices: [], certificates: [], routine: [], incidents: [], achievements: [], homework: [], submissions: [], syllabus: [], leaves: [],
    journal: [], payroll: [], teacherAbsences: {}, broadcasts: [], documents: [], serviceRequests: [], installmentPlans: [], proxies: [], evaluations: [],
    calendar: { weekends: [5], holidays: [] },
    staff: [], staffAttendance: {},
  };
  let seq = 1;
  const id = p => `${p}${String(seq++).padStart(4, '0')}`;

  /* --- Academic calendar (weekly holiday Friday; lunar holiday dates are approximate) --- */
  const H = (date, name, type = 'Public', to = null, campusId = null) => s.calendar.holidays.push({ id: id('HOL'), date, to, name, type, campusId });
  H(`${year}-02-21`, 'শহিদ দিবস ও আন্তর্জাতিক মাতৃভাষা দিবস');
  H(`${year}-03-19`, 'ঈদুল ফিতরের ছুটি', 'Public', `${year}-03-24`);
  H(`${year}-03-26`, 'স্বাধীনতা দিবস');
  H(`${year}-04-14`, 'পহেলা বৈশাখ (বাংলা নববর্ষ)');
  H(`${year}-05-01`, 'মে দিবস');
  H(`${year}-05-25`, 'ঈদুল আজহার ছুটি', 'Public', `${year}-06-01`);
  H(`${year}-06-08`, 'অর্ধবার্ষিক পরীক্ষা', 'Exam', `${year}-06-18`);
  H(`${year}-08-26`, 'ঈদে মিলাদুন্নবী');
  H(`${year}-09-04`, 'জন্মাষ্টমী');
  H(`${year}-09-17`, 'জুনিয়র ক্যাম্পাস ক্রীড়া দিবস', 'School', null, 'NORTH');
  H(`${year}-10-18`, 'দুর্গাপূজার ছুটি', 'Public', `${year}-10-22`);
  H(`${year}-11-02`, 'প্রাক-নির্বাচনী পরীক্ষা', 'Exam', `${year}-11-12`);
  H(`${year}-12-16`, 'বিজয় দিবস');
  H(`${year}-12-20`, 'শীতকালীন ছুটি', 'School', `${year}-12-31`);
  const cal = s.calendar;

  /* Users: `password` is replaced by a scrypt hash in build.js; the browser never sees it. */
  const addUser = (name, username, roles, extra = {}) => {
    const u = { id: id('U'), name, nameBn: demoBnName(name) || name, username, email: `${username}@dheeacademy.edu.bd`, phone: extra.phone || `01${pick(['7', '8', '9', '5', '3'])}${String(Math.floor(r() * 1e8)).padStart(8, '0')}`, password: opts.password, pwDefault: false, loginPolicy: 'v1', active: true, createdAt: now.toISOString(), createdBy: extra.createdBy || null, photo: null };
    s.users.push(u);
    roles.forEach(role => s.userRoles.push({ userId: u.id, role }));
    return u;
  };
  const userName = uid => s.users.find(u => u.id === uid)?.name;

  /* --- Provisioning chain: Root User → Principal → teachers --- */
  const root = addUser('Tanvir Hasan', 'root', ['ADMIN']), it = root;
  const prin = addUser('Dr. Farhana Rahman', 'principal', ['PRINCIPAL', 'TEACHER', 'GUARDIAN'], { createdBy: root.id });

  /* --- Classes, subjects, fee configs --- */
  const tuition = { 1: 1400, 2: 1450, 3: 1500, 4: 1600, 5: 1700, 6: 1800, 7: 1900, 8: 2000, 9: 2400, 10: 2500 };
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].forEach(g => s.classes.push({ id: `C${g}`, campusId: 'MAIN', grade: g, name: CLASS_BN[g], sections: ['ক'] }));
  [1, 2, 3, 4, 5].forEach(g => s.classes.push({ id: `J${g}`, campusId: 'NORTH', grade: g, name: CLASS_BN[g], sections: ['ক'] }));
  s.classes.forEach(c => s.feeConfigs.push({ session, campusId: c.campusId, classId: c.id, tuition: tuition[c.grade], admissionFee: 4000 + c.grade * 250, examFee: c.grade >= 6 ? 800 : 500 }));
  [['BAN', 'বাংলা'], ['ENG', 'ইংরেজি'], ['MATH', 'গণিত'], ['SCI', 'সাধারণ বিজ্ঞান'], ['ICT', 'তথ্য ও যোগাযোগ প্রযুক্তি'], ['BGS', 'বাংলাদেশ ও বিশ্বপরিচয়']].forEach(([code, name]) => s.subjects.push({ id: code, code, name }));
  s.rooms = { MAIN: ['101', '201', '301', '401', '501', '601', '701', '801', '901', '1001', 'Lab-1', 'Lab-2', 'ICT-Lab', 'Library', 'Hall-A'], NORTH: ['J-101', 'J-102', 'J-103', 'J-104', 'J-105', 'J-Hall', 'J-Lab'] };
  const homeRoom = c => c.campusId === 'MAIN' ? `${c.grade}01` : `J-10${c.grade}`;

  /* --- Grading schemes --- */
  s.gradingSchemes = [
    { id: 'GS-NCTB', name: 'এনসিটিবি ৫.০ স্কেল (পাস ৩৩%)', scale: '5', session, campusId: null, bands: NCTB_BANDS.map(b => ({ ...b })) },
    { id: 'GS-JR', name: 'জুনিয়র ক্যাম্পাস স্কেল (পাস ৪০%)', scale: '5', session, campusId: 'NORTH', bands: [{ min: 80, letter: 'A+', point: 5 }, { min: 70, letter: 'A', point: 4 }, { min: 60, letter: 'A-', point: 3.5 }, { min: 50, letter: 'B', point: 3 }, { min: 45, letter: 'C', point: 2 }, { min: 40, letter: 'D', point: 1 }, { min: 0, letter: 'F', point: 0 }] },
    { id: 'GS-NCTB-' + (year - 1), name: 'এনসিটিবি ৫.০ স্কেল (পাস ৩৩%)', scale: '5', session: String(year - 1), campusId: null, bands: NCTB_BANDS.map(b => ({ ...b })) },
  ];

  /* --- Teachers (one set per campus / wing so the routine never double-books) --- */
  const grades = { G1: 62000, G2: 48000, G3: 39000, G4: 32000 };
  s.salaryGrades = grades;
  const SR = 'সিনিয়র শিক্ষক', AS = 'সহকারী শিক্ষক', SCI = 'বিজ্ঞান', HUM = 'মানবিক', PRI = 'প্রাথমিক';
  const mkTeacher = (name, uname, subj, dept, desig, grade, head, campusId) => {
    const u = addUser(name, uname, ['TEACHER'], { createdBy: prin.id });
    const method = pick(['Bank', 'Bank', 'bKash', 'Nagad', 'Cash']);
    const t = { id: id('T'), userId: u.id, campusId, dept, designation: desig, salaryGrade: grade, baseSalary: grades[grade], isHead: head, subjects: [subj], joinDate: `${2010 + Math.floor(r() * 12)}-0${1 + Math.floor(r() * 8)}-01`, status: 'Confirmed', payoutMethod: method, payoutAccount: method === 'Bank' ? `SB-${digits(13)}` : method === 'Cash' ? '' : u.phone };
    s.teachers.push(t); return t;
  };
  [
    ['Mahmudul Karim', 'teacher', 'MATH', SCI, SR, 'G2', true], ['Nusrat Jahan', 'nusrat', 'ENG', HUM, AS, 'G3', false],
    ['Abdul Mannan', 'mannan', 'BAN', HUM, SR, 'G2', true], ['Sharmin Akter', 'sharmin', 'SCI', SCI, AS, 'G3', false],
    ['Rafiqul Islam', 'rafiq', 'ICT', SCI, AS, 'G4', false], ['Shahana Parvin', 'shahana', 'BGS', HUM, AS, 'G3', false],
  ].forEach(d => mkTeacher(...d, 'MAIN'));
  [
    ['Shirin Akter', 'shirin', 'BAN', PRI, AS, 'G3', true], ['Mosharraf Hossain', 'mosharraf', 'ENG', PRI, AS, 'G3', false],
    ['Jannatul Ferdous', 'jannat', 'MATH', PRI, AS, 'G3', false], ['Aminul Haque', 'aminul', 'SCI', PRI, AS, 'G4', false],
    ['Tahmina Begum', 'tahmina', 'ICT', PRI, AS, 'G4', false], ['Zahid Hasan', 'zahid', 'BGS', PRI, AS, 'G4', false],
  ].forEach(d => mkTeacher(...d, 'MAIN'));
  [
    ['Rokeya Sultana', 'rokeya', 'BAN', PRI, 'ক্যাম্পাস সমন্বয়ক', 'G2', true], ['Imtiaz Ahmed', 'imtiaz', 'ENG', PRI, AS, 'G3', false],
    ['Lutfun Nahar', 'lutfun', 'MATH', PRI, AS, 'G3', false], ['Sohel Rana', 'sohel', 'SCI', PRI, AS, 'G4', false],
    ['Farida Yasmin', 'farida', 'ICT', PRI, AS, 'G4', false], ['Kamrul Hasan', 'kamrul', 'BGS', PRI, AS, 'G4', false],
  ].forEach(d => mkTeacher(...d, 'NORTH'));
  s.teachers.find(t => userName(t.userId) === 'Rafiqul Islam').status = 'Probation';
  const prinT = { id: id('T'), userId: prin.id, campusId: 'MAIN', dept: 'প্রশাসন', designation: 'অধ্যক্ষ', salaryGrade: 'G1', baseSalary: grades.G1, isHead: true, subjects: ['ENG'], joinDate: '2008-01-01', status: 'Confirmed', payoutMethod: 'Bank', payoutAccount: `SB-${digits(13)}` };
  s.teachers.push(prinT);
  const wing = c => c.campusId === 'MAIN' && c.grade <= 5 ? PRI : null;
  const teacherFor = (subj, c) => (subj === 'ENG' && c.id === 'C10') ? prinT : s.teachers.find(t => t.campusId === c.campusId && t.subjects.includes(subj) && t !== prinT && (c.campusId !== 'MAIN' || (wing(c) ? t.dept === PRI : t.dept !== PRI)));
  const quals = ['এম.এসসি. (গণিত), বি.এড.', 'এম.এ. (ইংরেজি), বি.এড.', 'এম.এ. (বাংলা), বি.এড.', 'এম.এসসি. (রসায়ন), বি.এড.', 'বি.এসসি. (সিএসই)', 'এম.এস.এস. (রাষ্ট্রবিজ্ঞান), বি.এড.', 'বি.এ. (সম্মান), ডিপ-ইন-এড', 'এম.এ. (ইংরেজি), সি-ইন-এড', 'বি.এসসি. (গণিত), সি-ইন-এড', 'বি.এসসি. (পদার্থবিজ্ঞান), সি-ইন-এড', 'কম্পিউটার বিজ্ঞানে ডিপ্লোমা', 'বি.এস.এস. (সম্মান), সি-ইন-এড'];
  s.teachers.forEach((t, i) => { t.qualification = t === prinT ? 'পিএইচ.ডি. (শিক্ষা), ঢাকা বিশ্ববিদ্যালয়' : quals[i % quals.length]; t.bio = ''; t.showContact = true; t.overtimeHours = {}; });

  /* --- Support staff (payroll + attendance, no dashboard sign-in) --- */
  const sGrades = { S1: 30000, S2: 22000, S3: 16000, S4: 12000 };
  s.staffGrades = sGrades;
  [
    ['Shamim Ahmed', 'Accountant', 'জ্যেষ্ঠ হিসাবরক্ষক', 'S1', 'MAIN'], ['Rehana Akter', 'Administrative Staff', 'অফিস সুপারিনটেনডেন্ট', 'S2', 'MAIN'], ['Mizanur Rahman', 'Librarian', 'গ্রন্থাগারিক', 'S2', 'MAIN'],
    ['Abdul Kader', 'Driver', 'বাসচালক (রুট ১)', 'S3', 'MAIN'], ['Jalal Uddin', 'Driver', 'বাসচালক (রুট ২)', 'S3', 'MAIN'], ['Rubel Mia', 'Transport Helper', 'বাস সহকারী', 'S4', 'MAIN'],
    ['Nasrin Sultana', 'Nurse', 'বিদ্যালয়ের নার্স (সিকবে)', 'S2', 'MAIN'], ['Kamal Uddin', 'Security Guard', 'ফটক নিরাপত্তারক্ষী', 'S4', 'MAIN'], ['Halima Begum', 'Hostel Warden', 'ছাত্রাবাস তত্ত্বাবধায়ক (আবাসিক অংশ)', 'S3', 'MAIN'],
    ['Sumon Das', 'Office Assistant', 'অফিস সহকারী', 'S4', 'NORTH'], ['Monowara Khatun', 'Cleaner', 'পরিচ্ছন্নতাকর্মী', 'S4', 'NORTH'], ['Nurul Islam', 'Driver', 'বাসচালক (রুট ৩)', 'S3', 'NORTH'],
  ].forEach(([name, type, designation, grade, campusId]) => {
    const method = pick(['Bank', 'bKash', 'Nagad', 'Cash']);
    const phone = `01${pick(['7', '8', '9', '5', '3'])}${String(Math.floor(r() * 1e8)).padStart(8, '0')}`;
    s.staff.push({ id: id('ST'), name, nameBn: demoBnName(name) || name, type, designation, campusId, phone, email: '', joinDate: `${2012 + Math.floor(r() * 10)}-0${1 + Math.floor(r() * 8)}-01`, salaryGrade: grade, baseSalary: sGrades[grade], payoutMethod: method, payoutAccount: method === 'Bank' ? `SB-${digits(13)}` : method === 'Cash' ? '' : phone, status: 'Confirmed', blood: pick(['A+', 'B+', 'O+', 'AB+', 'A-', 'O-']), nid: digits(10), photo: null, userId: null, overtimeHours: {} });
  });

  /* --- Students & guardians --- */
  const first = ['Arif', 'Nafisa', 'Tahmid', 'Raisa', 'Sakib', 'Mehjabin', 'Fahim', 'Tasnia', 'Ayaan', 'Lamia', 'Rifat', 'Sumaiya', 'Zarif', 'Anika', 'Imran', 'Nabila', 'Shafin', 'Orpa', 'Tanzim', 'Maliha', 'Rayan', 'Samiha', 'Junaid', 'Prova', 'Adnan', 'Farzana', 'Nayeem', 'Ishrat', 'Siam', 'Tahsin'];
  const female = /^(Nafisa|Raisa|Mehjabin|Tasnia|Lamia|Sumaiya|Anika|Nabila|Orpa|Maliha|Samiha|Prova|Farzana|Ishrat|Tasnim|Mahira|Nowshin|Sadia|Labiba|Mim)$/;
  const last = ['Hossain', 'Rahman', 'Ahmed', 'Chowdhury', 'Islam', 'Khan', 'Siddiqui', 'Sarker', 'Haque', 'Uddin', 'Talukder', 'Mia'];
  const bloods = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
  const medNotes = ['None', 'None', 'None', 'None', 'হালকা হাঁপানি — ব্যাগে ইনহেলার থাকে', 'বাদামে অ্যালার্জি', 'চশমা ব্যবহার করে', 'দুধ হজমে সমস্যা', 'None', 'পেনিসিলিনে অ্যালার্জি'];
  const fNames = ['Abul', 'Jahangir', 'Habib', 'Mostafa', 'Shamsul', 'Kabir', 'Selim', 'Anwar'], mNames = ['Rokeya', 'Selina', 'Nasima', 'Rehana', 'Taslima', 'Dilruba', 'Shirin', 'Nazma'];
  const ability = {};
  const mkGuardian = (name, username) => addUser(name, username, ['GUARDIAN'], { createdBy: prin.id });
  const kamal = mkGuardian('Kamal Hossain', 'guardian');

  const mkStudent = (c, roll, o = {}) => {
    const grade = c.grade;
    const lastName = o.last || pick(last);
    const fn = o.name ? o.name.split(' ')[0] : pick(first);
    const name = o.name || `${fn} ${lastName}`;
    const uname = o.username || `s${c.id.toLowerCase()}${U.pad(roll)}`;
    const su = addUser(name, uname, ['STUDENT'], { createdBy: prin.id });
    const father = o.father || `${pick(fNames)} ${lastName}`, mother = o.mother || `${pick(mNames)} Begum`;
    const st = {
      id: id('S'), userId: su.id, name, nameBn: demoBnName(name), classId: c.id, section: c.sections[0], roll, regNo: `${year}${c.campusId === 'MAIN' ? 'M' : 'N'}${U.pad(grade)}${U.pad(roll, 3)}${Math.floor(r() * 9)}`,
      dob: `${year - grade - 6}-${U.pad(1 + Math.floor(r() * 12))}-${U.pad(1 + Math.floor(r() * 27))}`, gender: female.test(fn) ? 'Female' : 'Male',
      blood: pick(bloods), medical: pick(medNotes), emergency: '', admissionDate: `${year - Math.max(0, grade - (c.campusId === 'MAIN' ? 6 : 1))}-01-0${1 + Math.floor(r() * 8)}`,
      previousSchool: c.campusId === 'MAIN' ? pick(['উদয়ন প্রাথমিক বিদ্যালয়', 'গ্রিন ভ্যালি প্রিপারেটরি', 'মতিঝিল সরকারি প্রাথমিক বিদ্যালয়', 'ধী একাডেমি উত্তর শাখা']) : pick(['লিটল এঞ্জেলস কিন্ডারগার্টেন', 'সানবিম প্রি-স্কুল', '—']),
      status: 'active', photo: null, fatherName: father, fatherNameBn: demoBnName(father), motherName: mother, motherNameBn: demoBnName(mother),
      birthRegNo: digits(17), fatherNid: digits(10), motherNid: digits(10), address: pick(['ধানমন্ডি', 'কলাবাগান', 'লালমাটিয়া', 'মোহাম্মদপুর', 'উত্তরা সেক্টর ৪', 'উত্তরা সেক্টর ৭']) + ', ঢাকা', scholarshipPct: 0,
    };
    s.students.push(st);
    const g = o.guardian || mkGuardian(`Mr. ${father}`, `g_${uname}`);
    st.emergency = g.phone;
    s.guardianLinks.push({ guardianUserId: g.id, studentId: st.id, relation: o.relation || 'Father' });
    ability[st.id] = o.ability ?? (0.45 + r() * 0.5);
    return st;
  };
  const special = {
    'C10-1': { name: 'Ayaan Hossain', username: 'student', guardian: kamal, relation: 'Father', last: 'Hossain', father: 'Kamal Hossain', ability: 0.86 },
    'C7-3': { name: 'Raisa Hossain', guardian: kamal, relation: 'Father', last: 'Hossain', father: 'Kamal Hossain', ability: 0.78 },
    'J3-2': { name: 'Rayan Hossain', guardian: kamal, relation: 'Father', last: 'Hossain', father: 'Kamal Hossain', ability: 0.8 },
    'C9-2': { name: 'Zarif Rahman', guardian: prin, relation: 'Mother', last: 'Rahman', ability: 0.9 },
    'C6-4': { name: 'Anika Rahman', guardian: prin, relation: 'Mother', last: 'Rahman', ability: 0.82 },
    'C8-7': { ability: 0.28 }, 'C9-9': { ability: 0.31 }, 'C10-11': { ability: 0.35 }, 'J4-6': { ability: 0.3 },
  };
  s.classes.forEach(c => { const n = c.campusId === 'MAIN' ? 12 : 8; for (let roll = 1; roll <= n; roll++) mkStudent(c, roll, special[`${c.id}-${roll}`] || {}); });
  const stBy = (cid, roll) => s.students.find(x => x.classId === cid && x.roll === roll);
  const tagSet = keys => new Set(keys.map(k => { const [c, n] = k.split('-'); return stBy(c, +n)?.id; }));

  /* --- Attendance (last ~45 school days, honouring weekends and holidays) --- */
  const days = [];
  for (let d = U.addDays(now, -1), n = 0; n < 45; d = U.addDays(d, -1)) if (U.isSchoolDay(d, cal)) { days.unshift(U.iso(d)); n++; }
  const lowAtt = tagSet(['C8-7', 'C9-9', 'C7-11', 'C10-11', 'J4-6']), lateBirds = tagSet(['C6-9', 'C9-5', 'C8-2', 'J2-3']);
  s.students.forEach(st => {
    const rec = {}, campus = s.classes.find(c => c.id === st.classId).campusId;
    days.forEach(d => {
      if (!U.isSchoolDay(d, cal, campus)) return;
      const x = r(), pAbs = lowAtt.has(st.id) ? 0.34 : 0.05, pLate = lateBirds.has(st.id) ? 0.22 : 0.03;
      rec[d] = x < pAbs ? 'A' : x < pAbs + pLate ? 'L' : x < pAbs + pLate + 0.01 ? 'E' : 'P';
    });
    s.attendance[st.id] = rec;
  });

  /* --- Exams (typed + weighted) & marks --- */
  const term = { type: 'Term', cqMax: 70, mcqMax: 30, prMax: 0, cqPass: 23, mcqPass: 10, prPass: 0 };
  const ct = { type: 'Class Test', cqMax: 20, mcqMax: 0, prMax: 0, cqPass: 7, mcqPass: 0, prPass: 0 };
  s.exams = [
    { id: `AN${year - 1}`, name: `বার্ষিক পরীক্ষা ${U.bn(year - 1)}`, session: String(year - 1), ...term, weight: 100, published: true, start: `${year - 1}-11-20` },
    { id: `CT1-${year}`, name: `শ্রেণি পরীক্ষা ১ — ${U.bn(year)}`, session, ...ct, weight: 10, published: true, start: `${year}-03-10` },
    { id: `HY${year}`, name: `অর্ধবার্ষিক পরীক্ষা ${U.bn(year)}`, session, ...term, weight: 40, published: true, start: `${year}-06-08` },
    { id: `CT2-${year}`, name: `শ্রেণি পরীক্ষা ২ — ${U.bn(year)}`, session, ...ct, weight: 10, published: true, start: `${year}-08-20` },
    { id: `PT${year}`, name: `প্রাক-নির্বাচনী পরীক্ষা ${U.bn(year)}`, session, ...term, weight: 40, published: false, start: `${year}-11-02` },
  ];
  s.exams.filter(e => e.published).forEach(ex => {
    s.students.forEach(st => {
      const a = ability[st.id] + (ex.id === `HY${year}` && ability[st.id] < 0.4 ? -0.06 : 0);
      s.subjects.forEach(sub => {
        const noise = () => (r() - 0.5) * 0.22;
        const cq = Math.round(U.clamp((a + noise()) * ex.cqMax, ex.cqMax * 0.12, ex.cqMax));
        const mcq = ex.mcqMax ? Math.round(U.clamp((a + 0.05 + noise()) * ex.mcqMax, 4, ex.mcqMax)) : 0;
        s.marks.push({ examId: ex.id, studentId: st.id, subjectId: sub.id, cq, mcq });
      });
    });
  });

  /* --- Ledger (the chart of accounts comes from server/defaults.js) --- */
  const jv = (date, memo, lines, extra = {}) => s.journal.push({ id: id('JV'), date, memo, lines, ref: extra.ref || null, postedBy: it.id, kind: extra.kind || 'JV', campusId: extra.campusId || null, payee: extra.payee || null });
  jv(`${year}-01-01`, 'প্রারম্ভিক জের আনীত', [{ acct: '1010', dr: 4500000, cr: 0 }, { acct: '1000', dr: 120000, cr: 0 }, { acct: '3000', dr: 0, cr: 4620000 }]);

  /* --- Monthly tuition invoices + payments (per campus) --- */
  const curMonth = now.getMonth() + 1;
  const debtors = tagSet(['C8-7', 'C9-9', 'C10-11', 'C6-5', 'C7-8', 'C9-4', 'C10-6', 'J4-6', 'J2-5', 'C10-1']);   // C10-1 = demo student: current dues to try the payment flow
  const fee = cid => s.feeConfigs.find(f => f.classId === cid && f.session === session);
  const mkPay = (st, invs, method, date, channel = 'Online checkout', verified = true) => {
    const amount = U.sum(invs, i => i.amount);
    const isM = MFS.includes(method);
    const p = { id: id('PAY'), invoiceIds: invs.map(i => i.id), studentId: st.id, amount, method, txn: isM ? trx() : method === 'Card' ? `CH_${digits(10)}` : `BNK${digits(9)}`, msisdn: isM ? st.emergency : null, channel, verified, date, by: null };
    s.payments.push(p); invs.forEach(i => { i.status = 'paid'; i.paymentId = p.id; });
    return p;
  };
  for (let m = 1; m <= curMonth; m++) {
    const mk = `${year}-${U.pad(m)}`;
    ['MAIN', 'NORTH'].forEach(campusId => {
      let billed = 0; const coll = { '1010': 0, '1020': 0 };
      s.students.filter(st => s.classes.find(c => c.id === st.classId).campusId === campusId).forEach(st => {
        const inv = { id: id('INV'), studentId: st.id, month: mk, item: `মাসিক বেতন — ${U.monthName(mk)}`, amount: fee(st.classId).tuition, status: 'unpaid', due: `${mk}-10`, kind: 'tuition' };
        s.invoices.push(inv); billed += inv.amount;
        const owes = debtors.has(st.id) && m > curMonth - (st.roll % 3 + 1);
        if (!owes && !(m === curMonth && r() < 0.15)) {
          const method = pick(['bKash', 'Nagad', 'Rocket', 'Card', 'Bank', 'bKash']);
          const manual = m === curMonth && MFS.includes(method) && r() < 0.25;
          mkPay(st, [inv], method, `${mk}-${U.pad(2 + Math.floor(r() * 8))}`, manual ? 'Manual TrxID' : 'Online checkout', !manual);
          coll[MFS.includes(method) ? '1020' : '1010'] += inv.amount;
        }
      });
      jv(`${mk}-01`, `মাসিক বেতনের বিল — ${U.monthName(mk)}`, [{ acct: '1100', dr: billed, cr: 0 }, { acct: '4000', dr: 0, cr: billed }], { campusId });
      jv(`${mk}-10`, `মাসিক বেতন আদায় — ${U.monthName(mk)}`, [{ acct: '1010', dr: coll['1010'], cr: 0 }, { acct: '1020', dr: coll['1020'], cr: 0 }, { acct: '1100', dr: 0, cr: coll['1010'] + coll['1020'] }], { campusId, kind: 'RV' });
    });
  }
  /* Only a sample of students is stored individually; the rest of the stated enrolment (school.stats.scholars)
     is booked as clearly labelled monthly bulk entries so the accounts reflect a whole institution. */
  const otherStudents = s.school.stats.scholars - s.students.length, share = { MAIN: 0.7, NORTH: 0.3 }, avgTuition = { MAIN: 2100, NORTH: 1550 };
  for (let m = 1; m <= curMonth; m++) {
    const mk = `${year}-${U.pad(m)}`;
    ['MAIN', 'NORTH'].forEach(campusId => {
      const n = Math.round(otherStudents * share[campusId]), billed = n * avgTuition[campusId], coll = Math.round(billed * (m === curMonth ? 0.8 : 0.97));
      jv(`${mk}-01`, `মাসিক বেতনের বিল — অন্যান্য ${U.bn(n)} জন শিক্ষার্থী (একত্রে) — ${U.monthName(mk)}`, [{ acct: '1100', dr: billed, cr: 0 }, { acct: '4000', dr: 0, cr: billed }], { campusId });
      jv(`${mk}-10`, `মাসিক বেতন আদায় — একত্রে (${U.monthName(mk)})`, [{ acct: '1010', dr: Math.round(coll * 0.55), cr: 0 }, { acct: '1020', dr: coll - Math.round(coll * 0.55), cr: 0 }, { acct: '1100', dr: 0, cr: coll }], { campusId, kind: 'RV' });
    });
    const mfsIn = U.sum(s.journal.filter(v => v.date.startsWith(mk)), v => U.sum(v.lines.filter(l => l.acct === '1020'), l => l.dr - l.cr));
    if (m < curMonth && mfsIn > 0) jv(`${mk}-15`, `এমএফএস মার্চেন্ট হিসাব থেকে ব্যাংকে স্থানান্তর — ${U.monthName(mk)}`, [{ acct: '1010', dr: mfsIn, cr: 0 }, { acct: '1020', dr: 0, cr: mfsIn }]);
  }
  // Exam fee for the upcoming pre-test (drives the fee-gated admit cards)
  let examBilled = 0, examPaid = 0;
  s.students.forEach(st => {
    const amt = fee(st.classId).examFee;
    const inv = { id: id('INV'), studentId: st.id, month: `${year}-${U.pad(curMonth)}`, item: `পরীক্ষার ফি — প্রাক-নির্বাচনী ${U.bn(year)}`, amount: amt, status: 'unpaid', due: `${year}-${U.pad(curMonth)}-25`, kind: 'exam' };
    s.invoices.push(inv); examBilled += amt;
    if (!debtors.has(st.id)) { mkPay(st, [inv], 'bKash', `${year}-${U.pad(curMonth)}-0${1 + Math.floor(r() * 9)}`); examPaid += amt; }
  });
  jv(`${year}-${U.pad(curMonth)}-01`, `পরীক্ষার ফির বিল — প্রাক-নির্বাচনী ${U.bn(year)}`, [{ acct: '1100', dr: examBilled, cr: 0 }, { acct: '4200', dr: 0, cr: examBilled }]);
  jv(`${year}-${U.pad(curMonth)}-09`, `পরীক্ষার ফি আদায় — প্রাক-নির্বাচনী ${U.bn(year)}`, [{ acct: '1020', dr: examPaid, cr: 0 }, { acct: '1100', dr: 0, cr: examPaid }], { kind: 'RV' });

  /* --- Payroll history + operating expenses --- */
  const employees = [...s.teachers, ...s.staff];
  employees.forEach(t => { s.teacherAbsences[t.id] = {}; });
  for (let m = 1; m < curMonth; m++) {
    const mk = `${year}-${U.pad(m)}`;
    ['MAIN', 'NORTH'].forEach(campusId => {
      let gross = 0, pf = 0, net = 0;
      employees.filter(t => t.campusId === campusId).forEach(t => {
        const unexcused = r() < 0.2 ? 1 + Math.floor(r() * 2) : 0, ot = t.type === 'Driver' ? 10 + Math.floor(r() * 12) : 0;
        s.teacherAbsences[t.id][mk] = { unexcused, excused: r() < 0.3 ? 1 : 0 };
        if (ot) t.overtimeHours[mk] = ot;
        const p = DB_calcPay(t, unexcused, ot);
        s.payroll.push({ id: id('PR'), month: mk, empId: t.id, ...p, installments: 1, payouts: [{ n: 1, amount: p.net, method: t.payoutMethod, account: t.payoutAccount, date: `${mk}-28`, ref: t.payoutMethod === 'Cash' ? 'নগদ ভাউচার' : trx() }], status: 'disbursed' });
        gross += p.gross - p.lop; pf += p.pf; net += p.net;
      });
      jv(`${mk}-28`, `কর্মীদের বেতন-ভাতা — ${U.monthName(mk)}`, [{ acct: '5000', dr: gross, cr: 0 }, { acct: '1010', dr: 0, cr: net }, { acct: '2100', dr: 0, cr: pf }], { campusId, kind: 'PV', payee: 'কর্মীবৃন্দ' });
      const otherStaff = Math.round((s.school.stats.faculty - employees.length) * (campusId === 'MAIN' ? 0.7 : 0.3)), base = 30000, bg = otherStaff * (base * 1.5 + 2500), bpf = otherStaff * base * 0.1;
      jv(`${mk}-28`, `বেতন-ভাতা — অন্যান্য ${U.bn(otherStaff)} জন শিক্ষক-কর্মী (একত্রে) — ${U.monthName(mk)}`, [{ acct: '5000', dr: bg, cr: 0 }, { acct: '1010', dr: 0, cr: bg - bpf }, { acct: '2100', dr: 0, cr: bpf }], { campusId, kind: 'PV', payee: 'কর্মীবৃন্দ (একত্রে)' });
      const k = campusId === 'MAIN' ? 1 : 0.45;
      const ex = (acct, amt, memo, payee) => jv(`${mk}-${U.pad(12 + Math.floor(r() * 12))}`, memo, [{ acct, dr: Math.round(amt), cr: 0 }, { acct: '1010', dr: 0, cr: Math.round(amt) }], { campusId, kind: 'PV', payee });
      ex('5100', (38000 + r() * 9000) * k, `বিদ্যুৎ, পানি ও ইন্টারনেট — ${U.monthName(mk)}`, 'ডেসকো / ওয়াসা / লিংক৩');
      if (r() < 0.6) ex('5300', (8000 + r() * 30000) * k, 'ভবন ও আসবাব মেরামত', 'রহিম এন্টারপ্রাইজ');
      ex('5400', (6000 + r() * 14000) * k, 'চক, কাগজ ও গবেষণাগারের উপকরণ', 'নীলক্ষেত বুক অ্যান্ড স্টেশনারি');
      ex('5500', (18000 + r() * 4000) * k, 'স্কুলবাসের জ্বালানি ও রক্ষণাবেক্ষণ', 'মেঘনা ফিলিং স্টেশন');
      if (m % 3 === 0) ex('5600', (15000 + r() * 25000) * k, pick(['বিজ্ঞান মেলা', 'বার্ষিক ক্রীড়া', 'সাংস্কৃতিক অনুষ্ঠান', 'বিতর্ক প্রতিযোগিতা']), 'অনুষ্ঠান সরবরাহকারী');
    });
  }
  employees.forEach(t => { s.teacherAbsences[t.id][`${year}-${U.pad(curMonth)}`] = { unexcused: r() < 0.3 ? 1 : 0, excused: 0 }; });

  /* --- Collision-free routine per teacher group: subject index = (period + class + day) mod 6 --- */
  [['MAIN', false], ['MAIN', true], ['NORTH', false]].forEach(([campusId, primary]) => s.classes.filter(c => c.campusId === campusId && (campusId !== 'MAIN' || !!wing(c) === primary)).forEach((c, ci) => DAYS.forEach((day, di) => PERIODS.forEach((p, pi) => {
    const sub = s.subjects[(pi + ci + di) % s.subjects.length];
    s.routine.push({ id: id('RT'), classId: c.id, section: c.sections[0], day, period: p.n, subjectId: sub.id, teacherId: teacherFor(sub.id, c).id, room: homeRoom(c) });
  }))));
  // Class teachers (first-tier approver for student leave). The demo teacher is class teacher of Class 10.
  const byName = n => s.teachers.find(t => userName(t.userId) === n);
  [['C10', 'Mahmudul Karim'], ['C9', 'Nusrat Jahan'], ['C8', 'Abdul Mannan'], ['C7', 'Sharmin Akter'], ['C6', 'Shahana Parvin'], ['J1', 'Kamrul Hasan'], ['J2', 'Imtiaz Ahmed'], ['J3', 'Rokeya Sultana'], ['J4', 'Lutfun Nahar'], ['J5', 'Sohel Rana']]
    .forEach(([cid, n]) => { s.classes.find(c => c.id === cid).classTeacherId = byName(n).id; });
  s.classes.forEach(c => { c.shift = 'MORNING'; c.capacity = 45; });

  /* --- Notices --- */
  const nd = k => U.iso(U.addDays(now, -k));
  s.notices = [
    { id: id('N'), category: 'Academic', title: `প্রাক-নির্বাচনী পরীক্ষা ${U.bn(year)} — রুটিন প্রকাশিত`, date: nd(2), body: 'ষষ্ঠ–দশম শ্রেণির প্রাক-নির্বাচনী পরীক্ষা ২ নভেম্বর শুরু হবে। বকেয়া পরিশোধকারী শিক্ষার্থীরাই কেবল প্রবেশপত্র পাবে। বিস্তারিত রুটিন সংযুক্ত।', pinned: true },
    { id: id('N'), category: 'Admission', title: `ভর্তি ${U.bn(year + 1)}: অনলাইন আবেদন চলছে`, date: nd(5), body: `${U.bn(year + 1)} শিক্ষাবর্ষে উভয় ক্যাম্পাসে ভর্তির অনলাইন আবেদন চলছে। ৩০ নভেম্বরের আগে EARLYBIRD2027 কোড ব্যবহার করলে ভর্তি ফিতে ৫০% ছাড়।`, pinned: true },
    { id: id('N'), category: 'Holiday', title: 'দুর্গাপূজার ছুটি', date: nd(9), body: 'দুর্গাপূজা উপলক্ষে (১৮–২২ অক্টোবর) উভয় ক্যাম্পাস বন্ধ থাকবে। পরবর্তী রবিবার থেকে ক্লাস যথারীতি চলবে।' },
    { id: id('N'), category: 'Fees', title: 'প্রয়োজনে কিস্তিতে ফি পরিশোধের সুযোগ', date: nd(12), body: 'অভিভাবকগণ হিসাব শাখা থেকে অথবা অনলাইন সেবার মাধ্যমে মাসিক বেতন ও বার্ষিক ফির জন্য মাসিক বা ত্রৈমাসিক কিস্তির আবেদন করতে পারবেন।' },
    { id: id('N'), category: 'Academic', title: 'আন্তঃহাউস বিজ্ঞান মেলার নিবন্ধন', date: nd(16), body: 'সর্বোচ্চ তিনজনের দল পদার্থবিজ্ঞান, রসায়ন, জীববিজ্ঞান বা রোবোটিক্সে প্রকল্প নিয়ে শ্রেণিশিক্ষকের কাছে নিবন্ধন করতে পারবে।' },
    { id: id('N'), category: 'Fees', title: 'বিকাশ, নগদ বা রকেটে পরিশোধ করে TrxID দিন', date: nd(20), body: 'প্রতিষ্ঠানের মার্চেন্ট নম্বরে সেন্ড মানি করে অভিভাবক পোর্টালে TrxID লিখুন। এক কর্মদিবসের মধ্যে এমএফএস বিবরণীর সঙ্গে মিলিয়ে পরিশোধ নিশ্চিত করা হয়।' },
    { id: id('N'), category: 'Academic', title: `অর্ধবার্ষিক ${U.bn(year)} পরীক্ষার ফলাফল প্রকাশিত`, date: nd(70), body: 'ওয়েবসাইটের ফলাফল পাতায় রোল ও নিবন্ধন নম্বর দিয়ে ফলাফল দেখা যাবে।' },
  ];

  /* --- Certificates (TC & testimonials) --- */
  s.certificates = [
    { serial: `TC-${year}-00041`, type: 'Transfer Certificate', studentName: 'Mushfiq Rahim', studentNameBn: 'মুশফিক রহিম', fatherName: 'Abdur Rahim', fatherNameBn: 'আব্দুর রহিম', classLeft: CLASS_BN[8], roll: 6, issueDate: `${year}-02-14`, reason: 'পরিবারের চট্টগ্রামে স্থানান্তর', conduct: 'চমৎকার', duesCleared: true },
    { serial: `TC-${year}-00057`, type: 'Transfer Certificate', studentName: 'Tasfia Noor', studentNameBn: 'তাসফিয়া নূর', fatherName: 'Nurul Amin', fatherNameBn: 'নুরুল আমিন', classLeft: CLASS_BN[9], roll: 14, issueDate: `${year}-05-03`, reason: 'ক্যাডেট কলেজে ভর্তি', conduct: 'অত্যন্ত ভালো', duesCleared: true },
    { serial: `TST-${year - 1}-0112`, type: 'Testimonial', studentName: 'Saad Bin Kabir', studentNameBn: 'সাদ বিন কবির', fatherName: 'Humayun Kabir', fatherNameBn: 'হুমায়ুন কবির', classLeft: `${CLASS_BN[10]} (এসএসসি)`, roll: 3, issueDate: `${year - 1}-12-28`, reason: `এসএসসি ${U.bn(year - 1)}-এ জিপিএ ৫.০০ পেয়ে উত্তীর্ণ`, conduct: 'চমৎকার', duesCleared: true },
  ];

  /* --- Admissions --- */
  const app = (name, cls, phone, status, method, coupon, daysAgo, channel = 'Online checkout') => {
    const c = s.classes.find(x => x.id === cls), f = fee(cls);
    const disc = coupon ? s.coupons[coupon].pct : 0, net = Math.round(f.admissionFee * (1 - disc / 100));
    const gName = `${pick(['Mr.', 'Mrs.'])} ${pick(['Kabir', 'Nazma', 'Selim', 'Dilruba'])} ${name.split(' ')[1]}`;
    s.admissions.push({ id: `APP-${year + 1}-${String(s.admissions.length + 1).padStart(4, '0')}`, campusId: c.campusId, studentName: name, studentNameBn: demoBnName(name), classId: cls, dob: `${year - c.grade - 5}-0${3 + s.admissions.length}-12`, gender: female.test(name.split(' ')[0]) ? 'Female' : 'Male', previousSchool: pick(['গ্রিন ভ্যালি প্রিপারেটরি', 'উদয়ন প্রাথমিক বিদ্যালয়', 'সানবিমস', 'স্কলাস্টিকা']), guardianName: gName, guardianNameBn: demoBnName(gName), guardianPhone: phone, guardianRelation: 'Father', address: 'ধানমন্ডি, ঢাকা', blood: pick(bloods), birthRegNo: digits(17), fatherNid: digits(10), motherNid: digits(10), docs: DOC_KINDS.slice(0, 3).map(k => ({ kind: k, fileName: `${k.toLowerCase().replace(/ /g, '-')}.jpg`, dataUrl: null })), fee: f.admissionFee, coupon: coupon || null, discountPct: disc, netPaid: net, payment: net > 0 ? { method, txn: MFS.includes(method) ? trx() : `CH_${digits(10)}`, channel, verified: channel !== 'Manual TrxID', at: U.addDays(now, -daysAgo).toISOString() } : { method: 'Waiver', txn: 'WAIVED', channel: 'Waiver', verified: true, at: U.addDays(now, -daysAgo).toISOString() }, status, submittedAt: U.addDays(now, -daysAgo).toISOString(), decidedAt: status !== 'Pending' ? U.addDays(now, -daysAgo + 1).toISOString() : null, note: '' });
  };
  app('Tasnim Ferdous', 'C6', '01711223344', 'Pending', 'bKash', 'EARLYBIRD2027', 1);
  app('Rafsan Chowdhury', 'C7', '01811556677', 'Pending', 'Nagad', null, 2, 'Manual TrxID');
  app('Mahira Islam', 'C9', '01911889900', 'Pending', 'Card', 'TALENT100', 3);
  app('Ehsan Kabir', 'J1', '01611334455', 'Pending', 'Rocket', 'SIBLING20', 4);
  app('Nowshin Tabassum', 'C6', '01511778899', 'Approved', 'Card', null, 9);
  app('Arnob Saha', 'J2', '01311990011', 'Declined', 'bKash', null, 12);

  /* --- Documents vault: records only (no files; the profile shows "ফাইল নেই") --- */
  s.students.forEach((st, i) => DOC_KINDS.slice(0, i % 4 === 3 ? 1 : 3).forEach(kind => s.documents.push({ id: id('DOC'), studentId: st.id, kind, fileName: `${kind.toLowerCase().replace(/ /g, '-')}-${st.id}.jpg`, fileType: 'image/jpeg', dataUrl: null, uploadedAt: st.admissionDate + 'T10:00:00', by: prin.id, verified: i % 5 !== 0 })));

  /* --- Incidents & achievements --- */
  const inc = (st, type, note, by, k) => s.incidents.push({ id: id('INC'), studentId: st.id, type, note, by, date: nd(k) });
  const tk = s.teachers[0].userId, tn = s.teachers[1].userId;
  inc(stBy('C10', 1), 'Commendation', 'বিভাগীয় গণিত অলিম্পিয়াডে বিদ্যালয়ের প্রতিনিধিত্ব করে দ্বিতীয় স্থান অর্জন করেছে।', tk, 6);
  inc(stBy('C7', 3), 'Commendation', 'ভাষা দিবসের অনুষ্ঠানে অসাধারণ আবৃত্তি।', s.teachers[2].userId, 14);
  inc(stBy('C7', 3), 'Counselor', 'পরীক্ষা নিয়ে হালকা উদ্বেগের কথা জানিয়েছে। শ্বাস-প্রশ্বাসের কৌশল শেখানো হয়েছে; ২ সপ্তাহ পর পুনরায় পর্যবেক্ষণ।', prin.id, 20);
  inc(stBy('C8', 7), 'Disciplinary', 'টিফিন বিরতিতে অনুমতি ছাড়া ক্যাম্পাস ত্যাগ করেছে।', tn, 4);
  inc(stBy('C8', 7), 'Counselor', 'পারিবারিক যাতায়াত সমস্যার কারণে ঘন ঘন অনুপস্থিতি। অভিভাবকের সঙ্গে সভার পরামর্শ দেওয়া হয়েছে।', prin.id, 3);
  inc(stBy('C9', 9), 'Disciplinary', 'টানা তিন সপ্তাহ বাড়ির কাজ অসম্পূর্ণ (গণিত)।', tk, 8);
  inc(stBy('C9', 2), 'Commendation', 'আন্তঃবিদ্যালয় বিতর্ক প্রতিযোগিতার চূড়ান্ত পর্বে বিজয়ী।', tn, 11);
  inc(stBy('C6', 9), 'Disciplinary', 'নিয়মিত বিলম্বে উপস্থিতি — এই সাময়িকে ৮ বার।', s.teachers[2].userId, 2);
  inc(stBy('C10', 1), 'Disciplinary', 'ক্লাস চলাকালে ফোন ব্যবহার — ডিভাইসটি অভিভাবকের কাছে ফেরত দেওয়া হয়েছে।', tn, 25);
  inc(stBy('J3', 2), 'Commendation', 'সেরা হাতের লেখা পুরস্কার — জুনিয়র ক্যাম্পাস।', s.teachers[6].userId, 9);
  const ach = (st, title, level, k) => s.achievements.push({ id: id('ACH'), studentId: st.id, title, level, date: nd(k) });
  ach(stBy('C10', 1), 'বিভাগীয় গণিত অলিম্পিয়াড — দ্বিতীয় স্থান', 'Divisional', 6);
  ach(stBy('C10', 1), 'জাতীয় বিজ্ঞানমেলা — অংশগ্রহণকারী', 'National', 120);
  ach(stBy('C9', 2), 'আন্তঃবিদ্যালয় বিতর্ক — চ্যাম্পিয়ন', 'District', 11);
  ach(stBy('C7', 3), 'ভাষা দিবস আবৃত্তি — প্রথম', 'School', 14);
  ach(stBy('J3', 2), 'সেরা হাতের লেখা — জুনিয়র ক্যাম্পাস', 'Campus', 9);
  // the institution's own achievements (website অর্জন page) — demo only
  s.instAchievements = [
    { id: 'IA1', title: 'জেলার শ্রেষ্ঠ শিক্ষাপ্রতিষ্ঠান', year: String(now.getFullYear() - 1), level: 'District', text: 'জাতীয় শিক্ষা সপ্তাহে জেলা পর্যায়ে শ্রেষ্ঠ মাধ্যমিক বিদ্যালয় নির্বাচিত।', image: null, show: true },
    { id: 'IA2', title: 'এসএসসি পরীক্ষায় শতভাগ পাস', year: String(now.getFullYear() - 1), level: 'Board', text: 'পরপর তিন বছর এসএসসি পরীক্ষায় সব পরীক্ষার্থী উত্তীর্ণ।', image: null, show: true },
    { id: 'IA3', title: 'বিভাগীয় বিজ্ঞানমেলা — দলগত প্রথম', year: String(now.getFullYear() - 2), level: 'Divisional', text: 'নবায়নযোগ্য জ্বালানি প্রকল্পের জন্য দলগত প্রথম পুরস্কার।', image: null, show: true },
  ];

  /* --- Homework + submissions --- */
  const hw = (cls, subj, title, dueIn, teacher) => { const h = { id: id('HW'), classId: cls, section: 'ক', subjectId: subj, title, instructions: 'সব ধাপ দেখিয়ে সমাধান করো। ওয়ার্কশিটের স্পষ্ট ছবি বা পিডিএফ আপলোড করো।', due: U.iso(U.addDays(now, dueIn)), teacherId: teacher.id, createdAt: nd(4) }; s.homework.push(h); return h; };
  const mathT = s.teachers[0];
  const h1 = hw('C10', 'MATH', 'দ্বিঘাত সমীকরণ — অনুশীলনী ৫.২ (প্রশ্ন ১–৮)', 2, mathT);
  const h2 = hw('C9', 'MATH', 'সেট — ভেনচিত্রের ওয়ার্কশিট', -1, mathT);
  hw('C7', 'MATH', 'অনুপাত ও সমানুপাতের সমস্যা', 4, mathT);
  hw('C10', 'ENG', 'অনুচ্ছেদ: "শিক্ষায় প্রযুক্তির ভূমিকা"', 3, prinT);
  hw('C10', 'SCI', 'ব্যবহারিক প্রতিবেদন: অম্ল–ক্ষার টাইট্রেশন', 5, s.teachers[3]);
  [stBy('C10', 1), stBy('C10', 2), stBy('C10', 4)].forEach((st, i) => s.submissions.push({ id: id('SUB'), homeworkId: h1.id, studentId: st.id, fileName: `exercise5-2_${st.roll}.jpg`, fileType: 'image/jpeg', dataUrl: null, submittedAt: U.addDays(now, -1 + i * 0.1).toISOString(), status: i === 2 ? 'Graded' : 'Submitted', grade: i === 2 ? 'A' : null, feedback: i === 2 ? 'পরিচ্ছন্ন কাজ। ৬ নম্বর প্রশ্নের চিহ্ন আবার দেখো।' : '', annotatedUrl: null }));
  [stBy('C9', 1), stBy('C9', 2)].forEach(st => s.submissions.push({ id: id('SUB'), homeworkId: h2.id, studentId: st.id, fileName: `venn_${st.roll}.jpg`, fileType: 'image/jpeg', dataUrl: null, submittedAt: nd(2) + 'T18:00:00', status: 'Submitted', grade: null, feedback: '', annotatedUrl: null }));

  /* --- Syllabus trackers (chapters; modules.js turns them into dated topics) --- */
  const chapters = {
    MATH: ['বাস্তব সংখ্যা', 'সেট ও ফাংশন', 'বীজগাণিতিক রাশি', 'সূচক ও লগারিদম', 'এক চলকবিশিষ্ট সমীকরণ', 'রেখা, কোণ ও ত্রিভুজ', 'ব্যবহারিক জ্যামিতি', 'বৃত্ত', 'ত্রিকোণমিতিক অনুপাত', 'দূরত্ব ও উচ্চতা', 'বীজগাণিতিক অনুপাত ও সমানুপাত', 'পরিসংখ্যান'],
    ENG: ['ইউনিট ১: শিক্ষা ও জীবন', 'ইউনিট ২: আশা ও উচ্চাকাঙ্ক্ষা', 'ইউনিট ৩: গণমাধ্যম ও ই-যোগাযোগ', 'ইউনিট ৪: আমাদের পরিবেশ', 'ইউনিট ৫: মানবাধিকার', 'ব্যাকরণ: উক্তি পরিবর্তন', 'ব্যাকরণ: বাচ্য', 'রচনা: আনুষ্ঠানিক পত্র'],
  };
  s.teachers.forEach(t => {
    const subj = t.subjects[0], list = chapters[subj] || ['অধ্যায় ১', 'অধ্যায় ২', 'অধ্যায় ৩', 'অধ্যায় ৪', 'অধ্যায় ৫', 'অধ্যায় ৬', 'অধ্যায় ৭', 'অধ্যায় ৮'];
    const classes = t === prinT ? ['C10'] : t.campusId === 'MAIN' ? ['C9', 'C10'] : ['J4', 'J5'];
    classes.forEach(cid => {
      const doneN = Math.floor(list.length * (0.45 + r() * 0.35));
      s.syllabus.push({ id: id('SYL'), teacherId: t.id, classId: cid, subjectId: subj, termEnd: `${year}-11-01`, chapters: list.map((name, i) => ({ name, done: i < doneN, deadline: U.iso(new Date(year, 0, 15 + Math.round(i * (290 / list.length)))) })) });
    });
  });

  /* --- Leaves, evaluations, proxies --- */
  s.leaves = [
    { id: id('LV'), teacherId: s.teachers[3].id, from: U.iso(U.addDays(now, 3)), to: U.iso(U.addDays(now, 4)), type: 'Casual', reason: 'সিলেটে পারিবারিক বিয়ের অনুষ্ঠান', status: 'Pending', submittedAt: nd(1) },
    { id: id('LV'), teacherId: s.teachers[0].id, from: nd(20), to: nd(20), type: 'Medical', reason: 'দাঁতের অস্ত্রোপচার', status: 'Approved', submittedAt: nd(24) },
  ];
  s.teachers.forEach(t => { if (r() < 0.75) s.evaluations.push({ id: id('EV'), teacherId: t.id, term: `অর্ধবার্ষিক ${U.bn(year)}`, date: `${year}-07-05`, by: prin.id, scores: { pedagogy: 3 + Math.floor(r() * 3), punctuality: 3 + Math.floor(r() * 3), classroom: 3 + Math.floor(r() * 3), results: 2 + Math.floor(r() * 4), collaboration: 3 + Math.floor(r() * 3) }, remarks: pick(['নিয়মিত ও সুপ্রস্তুত।', 'শিক্ষার্থীদের ভালোভাবে সম্পৃক্ত করেন; বাড়ির কাজের তদারকি বাড়াতে হবে।', 'ফলাফল ভালো; নবীন শিক্ষকদের সহায়তা করুন।', 'পাঠ পরিকল্পনা সময়মতো জমা দিতে হবে।']) }); });
  const pastProxyDay = days[days.length - 3];
  const absentT = s.teachers[1], cover = s.teachers[5];
  s.routine.filter(x => x.teacherId === absentT.id && x.day === U.dayName(pastProxyDay)).slice(0, 2).forEach(x => s.proxies.push({ id: id('PX'), date: pastProxyDay, period: x.period, classId: x.classId, subjectId: x.subjectId, room: x.room, absentTeacherId: absentT.id, proxyTeacherId: cover.id, reason: 'হঠাৎ অসুস্থতা', by: prin.id, createdAt: pastProxyDay + 'T07:40:00' }));

  /* --- Online service requests --- */
  const sr = (st, type, details, status, k, payment, extra = {}) => s.serviceRequests.push({ id: id('SR'), type, studentId: st.id, requestedBy: s.guardianLinks.find(l => l.studentId === st.id).guardianUserId, details, fee: SERVICE_FEES[type] || 0, payment, status, createdAt: U.addDays(now, -k).toISOString(), decidedAt: status === 'Pending' ? null : U.addDays(now, -k + 1).toISOString(), outcome: '', ...extra });
  sr(stBy('C10', 6), 'Testimonial', 'বিদেশে বৃত্তির আবেদনের জন্য প্রয়োজন।', 'Pending', 1, { mode: 'Online', method: 'bKash', trxId: trx(), verified: false, paid: true, msisdn: stBy('C10', 6).emergency });
  sr(stBy('C7', 3), 'Leave', 'কক্সবাজারে পারিবারিক ভ্রমণ', 'Pending', 0, null, { from: U.iso(U.addDays(now, 5)), to: U.iso(U.addDays(now, 7)) });
  sr(stBy('C9', 4), 'Scholarship', 'জুলাই মাসে পিতা চাকরি হারিয়েছেন; মাসিক বেতনে সহায়তার আবেদন।', 'Pending', 3, null, { pct: 50 });
  sr(stBy('C8', 3), 'Character Certificate', 'অলিম্পিয়াড ক্যাম্পে নিবন্ধনের জন্য।', 'Completed', 15, { mode: 'Counter', method: 'Cash', trxId: 'COUNTER', verified: true, paid: true }, { outcome: 'ইস্যু করা হয়েছে: CC-' + year + '-0019' });

  /* --- Installment plan for a family needing support --- */
  const planSt = stBy('C8', 7);
  const owed = s.invoices.filter(i => i.studentId === planSt.id && i.status === 'unpaid');
  if (owed.length) {
    const total = U.sum(owed, i => i.amount), n = 3, per = Math.ceil(total / n / 10) * 10;
    const plan = { id: id('IP'), studentId: planSt.id, title: 'বকেয়া পুনঃনির্ধারিত', total, frequency: 'Monthly', count: n, startDate: U.iso(U.addDays(now, 2)), replacedInvoiceIds: owed.map(i => i.id), invoiceIds: [], reason: 'অভিভাবকের অনুরোধ — যাতায়াত ব্যয়', createdBy: prin.id, createdAt: nd(1) };
    owed.forEach(i => i.status = 'rescheduled');
    for (let k = 0; k < n; k++) { const inv = { id: id('INV'), studentId: planSt.id, month: U.monthKey(U.addMonths(plan.startDate, k)), item: `কিস্তি ${U.bn(k + 1)}/${U.bn(n)} — ${plan.title}`, amount: k < n - 1 ? per : total - per * (n - 1), status: 'unpaid', due: U.iso(U.addMonths(plan.startDate, k)), kind: 'installment', planId: plan.id }; s.invoices.push(inv); plan.invoiceIds.push(inv.id); }
    s.installmentPlans.push(plan);
  }

  /* --- SOS broadcast history --- */
  s.broadcasts = [{ id: id('BC'), ts: U.addDays(now, -15).toISOString(), template: 'Weather closure', message: '৭ নম্বর ঘূর্ণিঝড় সংকেতের কারণে আগামীকাল বিদ্যালয় বন্ধ থাকবে। রুটিন অনুযায়ী অনলাইন ক্লাস চলবে।', channels: ['SMS', 'Email', 'Push'], audience: 'Everyone', recipients: 3604, by: prin.id }];

  return { s, seq, rng: r, days, prin, root };
}
