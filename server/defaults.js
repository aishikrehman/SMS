/* Structural defaults for a new institution (first-run setup).
   No people, no transactions, no sample content — only what the app needs to work:
   grading scale, role permissions, feature switches, chart of accounts, pay grades, theme,
   website skeleton, one campus, three academic sessions and an empty list for every collection.
   Collections that feature modules fill through DB.addSeeder are left out on purpose:
   the browser's module seeders create them on the Root User's first sign-in. */
'use strict';

const NCTB_BANDS = [
  { min: 80, letter: 'A+', point: 5.0 }, { min: 70, letter: 'A', point: 4.0 }, { min: 60, letter: 'A-', point: 3.5 },
  { min: 50, letter: 'B', point: 3.0 }, { min: 40, letter: 'C', point: 2.0 }, { min: 33, letter: 'D', point: 1.0 }, { min: 0, letter: 'F', point: 0 },
];
const ROLES = ['ADMIN', 'PRINCIPAL', 'TEACHER', 'STUDENT', 'GUARDIAN'];
const PERM_ACTIONS = ['view', 'edit', 'delete', 'print', 'export'];
const PERM_MODULES = ['dashboard', 'students', 'admissions', 'academics', 'exams', 'attendance', 'fees', 'accounts', 'hr', 'services', 'logistics', 'comms', 'print', 'settings', 'system'];
const BN_DIGITS = s => String(s).replace(/[0-9]/g, d => '০১২৩৪৫৬৭৮৯'[d]);

/** Same matrix as DB.defaultRbac() in js/db.js. */
function defaultRbac() {
  const all = Object.fromEntries(PERM_ACTIONS.map(a => [a, true])), none = Object.fromEntries(PERM_ACTIONS.map(a => [a, false]));
  const viewPrint = { ...none, view: true, print: true }, grid = {};
  ROLES.forEach(role => { grid[role] = {}; PERM_MODULES.forEach(m => { grid[role][m] = { ...none }; }); });
  PERM_MODULES.forEach(m => { grid.ADMIN[m] = { ...all }; grid.PRINCIPAL[m] = { ...all }; });
  grid.PRINCIPAL.system = { ...viewPrint };
  ['dashboard', 'students', 'academics', 'exams', 'attendance', 'services', 'print', 'comms'].forEach(m => { grid.TEACHER[m] = { ...all, delete: false }; });
  grid.TEACHER.logistics = { ...viewPrint };
  grid.TEACHER.admissions = { ...none, view: true, edit: true, print: true };
  ['dashboard', 'students', 'academics', 'exams', 'attendance', 'fees', 'services', 'logistics'].forEach(m => { grid.STUDENT[m] = { ...viewPrint }; grid.GUARDIAN[m] = { ...viewPrint }; });
  return grid;
}

const ACCOUNTS = [
  ['1000', 'হাতে নগদ অর্থ', 'Asset'], ['1010', 'ব্যাংক হিসাব', 'Asset'], ['1020', 'এমএফএস ওয়ালেট (বিকাশ/নগদ/রকেট)', 'Asset'],
  ['1100', 'প্রাপ্য মাসিক বেতন', 'Asset'], ['2100', 'প্রদেয় ভবিষ্য তহবিল', 'Liability'], ['2200', 'ভর্তি জমা (অনুপার্জিত)', 'Liability'], ['2300', 'প্রদেয় বেতন', 'Liability'],
  ['2400', 'জামানত জমা', 'Liability'], ['3000', 'সাধারণ তহবিল (মূলধন)', 'Equity'],
  ['4000', 'মাসিক বেতন বাবদ আয়', 'Income'], ['4100', 'ভর্তি ফি বাবদ আয়', 'Income'], ['4200', 'পরীক্ষার ফি বাবদ আয়', 'Income'], ['4300', 'সনদ ও সেবা ফি', 'Income'],
  ['4400', 'পরিবহন ফি বাবদ আয়', 'Income'], ['4500', 'ছাত্রাবাস ও খাবার ফি বাবদ আয়', 'Income'], ['4600', 'অন্যান্য ফি (নিবন্ধন, গবেষণাগার, ক্রীড়া)', 'Income'], ['4700', 'জরিমানা (বিলম্ব ফি, গ্রন্থাগার)', 'Income'],
  ['5000', 'বেতন ও মজুরি', 'Expense', 'কর্মী ব্যয়'], ['5100', 'পরিষেবা বিল (বিদ্যুৎ, পানি, ইন্টারনেট)', 'Expense', 'পরিচালনা'], ['5200', 'বৃত্তি ও মওকুফ', 'Expense', 'শিক্ষার্থী সহায়তা'],
  ['5300', 'রক্ষণাবেক্ষণ ও মেরামত', 'Expense', 'পরিচালনা'], ['5400', 'শিক্ষা উপকরণ ও গবেষণাগার', 'Expense', 'শিক্ষা কার্যক্রম'], ['5500', 'পরিবহন', 'Expense', 'পরিচালনা'], ['5600', 'অনুষ্ঠান ও সহশিক্ষা কার্যক্রম', 'Expense', 'শিক্ষা কার্যক্রম'],
].map(([code, name, type, category]) => ({ code, name, type, category: category || null }));

/**
 * A fresh institution. `school` = { name, nameBn, type, eiin }.
 */
function institutionDefaults(school, now = new Date()) {
  const year = now.getFullYear(), session = String(year);
  const fixed = (md, name) => ({ id: `HOL-${md}`, date: `${year}-${md}`, to: null, name, type: 'Public', campusId: null });
  return {
    meta: { version: 4, seededAt: now.toISOString(), setupAt: now.toISOString(), seq: 1000, lastReminderRun: null, lastAutoBackup: null },
    school: {
      name: school.name, nameBn: school.nameBn, shortName: (school.name || school.nameBn || '').replace(/[^A-Za-z]/g, '').slice(0, 6).toUpperCase() || 'SCH',
      eiin: school.eiin || '', founded: null, type: school.type || 'সাধারণ বিদ্যালয়',
      address: '', phone: '', email: '', website: '', motto: '', mottoBn: '',
      passGpa: 2.0, minAttendance: 75, lateThreshold: 5, lateMinutes: 10,   // late = check-in after the shift start + lateMinutes
      principalName: '', directorName: '', directorTitle: '', principalPhoto: null, directorPhoto: null, directorMessage: '',
      logo: null, stampImage: null, signature: null, directorSignature: null, stampText: [school.name, school.eiin ? `EIIN ${school.eiin}` : ''].filter(Boolean).join(' · ').toUpperCase(),
      stats: { passRate: 0, scholars: 0, faculty: 0, aPlus: 0 },
      merchant: { bKash: '', Nagad: '', Rocket: '' },
      welcome: '',
      shifts: [{ id: 'MORNING', name: 'প্রভাতি', start: '07:30', end: '12:00' }, { id: 'DAY', name: 'দিবা', start: '12:30', end: '17:00' }],
      sectionCapacity: 45, roomRules: { maxPerRoom: 45, examSeatsPerBench: 2, keepLabsForPractical: true },
    },
    theme: { primary: '#006a4e', accent: '#f42a41', font: 'Inter', headingFont: 'Source Serif 4', bnFont: 'Noto Serif Bengali', baseSize: 15, radius: 10, surface: '#f6f8f7' },
    site: {
      hero: { title: school.nameBn || school.name, subtitle: '', image: null, ctaText: 'ভর্তির আবেদন করুন', ctaLink: '/admissions', cta2Text: 'ফলাফল দেখুন', cta2Link: '/results', showStats: false, align: 'left' },
      ticker: true, programs: [], gallery: [],
    },
    campuses: [{ id: 'MAIN', name: 'প্রধান ক্যাম্পাস', short: 'প্রধান', address: '', phone: '', levels: '' }],
    sessions: [
      { id: String(year - 1), name: `শিক্ষাবর্ষ ${BN_DIGITS(year - 1)}`, status: 'closed' },
      { id: session, name: `শিক্ষাবর্ষ ${BN_DIGITS(year)}`, status: 'active' },
      { id: String(year + 1), name: `শিক্ষাবর্ষ ${BN_DIGITS(year + 1)}`, status: 'planning' },
    ],
    activeSession: session,
    users: [], userRoles: [], classes: [], subjects: [], teachers: [], students: [], guardianLinks: [],
    attendance: {}, exams: [], marks: [], invoices: [], payments: [], admissions: [], feeConfigs: [],
    gradingSchemes: [{ id: 'GS-NCTB', name: 'এনসিটিবি ৫.০ স্কেল (পাস ৩৩%)', scale: '5', session, campusId: null, bands: NCTB_BANDS.map(b => ({ ...b })) }],
    coupons: {},
    notices: [], certificates: [], routine: [], routineOverrides: [], routineVersions: { baseName: 'নিয়মিত রুটিন', list: [], schedule: [] }, sessionStore: {}, incidents: [], achievements: [], homework: [], submissions: [], syllabus: [], leaves: [],
    ptcBookings: [], accounts: ACCOUNTS.map(a => ({ ...a })), journal: [], payroll: [], teacherAbsences: {}, audit: [], broadcasts: [], outbox: [],
    documents: [], serviceRequests: [], installmentPlans: [], proxies: [], evaluations: [], mfsStatements: [], reconciliations: [],
    calendar: {
      weekends: [5],   // Friday only (JS day 5); editable in the calendar settings
      holidays: [fixed('02-21', 'শহিদ দিবস ও আন্তর্জাতিক মাতৃভাষা দিবস'), fixed('03-26', 'স্বাধীনতা দিবস'), fixed('04-14', 'পহেলা বৈশাখ (বাংলা নববর্ষ)'), fixed('05-01', 'মে দিবস'), fixed('12-16', 'বিজয় দিবস')],
    },
    featureFlags: {
      publishedMarksPrincipal: false,
      onlineAdmissions: true, publicResults: true, gallery: true, careers: true, onlineServices: true, noticeTicker: true,
      gatewayBkash: true, gatewayNagad: true, gatewayRocket: true, gatewayCard: true, smsGateway: true, emailGateway: true, pushNotifications: true,
      transport: true, hostel: true, library: true, biometric: true, studyMaterials: true, homework: true, aiPlanner: true, proxy: true,
      installments: true, autoReminders: true, lateFines: true, promotion: true, autoBackup: true,
    },
    rooms: { MAIN: [] },
    salaryGrades: { G1: 62000, G2: 48000, G3: 39000, G4: 32000 },
    staffGrades: { S1: 30000, S2: 22000, S3: 16000, S4: 12000 },
    staff: [], staffAttendance: {}, materials: [], examRemarks: {}, feedback: [], feeStructure: [], concessions: [], promotions: [],
    roomLayout: { show: false, campuses: {} },   // buildings → floors → rooms with seat plans; the campus map (public only when show)
    instAchievements: [],   // the institution's achievements (website অর্জন page and homepage section)
    quizzes: [], quizAttempts: [],   // online tests (js/modules/examops.js); attempts are written only by server/quiz.js
    examAttendance: [],
    recheckReqs: [],
    pubResultSets: {},      // published result snapshots for the public result views (server/public.js resultBoard)        // result re-check applications (POST /api/recheck/apply, server/recheck.js)     // exam sitting attendance, one row per student and paper (js/modules/examops.js)
    seatPlans: [],          // automatic exam seat plans per sitting (js/modules/seatplan.js)
    qbank: [],              // question bank (js/modules/qbuilder.js; teachers write their own subjects, server/access.js)
    rbac: defaultRbac(),
    backups: [], apiKeys: [], otps: {}, pwRequests: [], inquiries: [], payClaims: [],
  };
}

module.exports = { institutionDefaults, defaultRbac, NCTB_BANDS };
