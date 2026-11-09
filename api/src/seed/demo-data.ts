/**
 * Demo data for evaluating the portal. `seed` wipes every table and rebuilds
 * the same dataset, so it doubles as "reset demo data".
 *
 * Timeline: 2024/2025 and 2025/2026 are complete with approved results;
 * 2026/2027 First Semester is current with registration open and result
 * sheets in every workflow state.
 */
import { PrismaClient, type ResultStatus, type Role, type SemesterTerm } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { computeResult, DEFAULT_BANDS } from '../lib/grading';

export const DEMO_PASSWORD = 'Password@123';

// Deterministic pseudo-random numbers so every reset produces the same data.
function rng(seed: number) {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const days = (n: number) => n * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Static reference data
// ---------------------------------------------------------------------------

const FACULTIES = [
  { code: 'SCI', name: 'Faculty of Science' },
  { code: 'ENG', name: 'Faculty of Engineering' },
  { code: 'MSC', name: 'Faculty of Management Sciences' },
];

const DEPARTMENTS = [
  { code: 'CSC', name: 'Computer Science', faculty: 'SCI' },
  { code: 'MTH', name: 'Mathematics', faculty: 'SCI' },
  { code: 'EEE', name: 'Electrical & Electronic Engineering', faculty: 'ENG' },
  { code: 'ACC', name: 'Accounting', faculty: 'MSC' },
];

const PROGRAMS = [
  { code: 'BSC-CSC', name: 'Computer Science', award: 'B.Sc.', durationYears: 4, dept: 'CSC' },
  { code: 'BSC-SEN', name: 'Software Engineering', award: 'B.Sc.', durationYears: 4, dept: 'CSC' },
  { code: 'BSC-MTH', name: 'Mathematics', award: 'B.Sc.', durationYears: 4, dept: 'MTH' },
  { code: 'BENG-EEE', name: 'Electrical & Electronic Engineering', award: 'B.Eng.', durationYears: 5, dept: 'EEE' },
  { code: 'BSC-ACC', name: 'Accounting', award: 'B.Sc.', durationYears: 4, dept: 'ACC' },
];

type CourseSeed = { code: string; title: string; units: number; level: number; term: SemesterTerm; dept: string };
const C = (code: string, title: string, units: number, level: number, term: SemesterTerm): CourseSeed => ({
  code,
  title,
  units,
  level,
  term,
  dept: code.startsWith('SEN') ? 'CSC' : code.slice(0, 3),
});

const COURSES: CourseSeed[] = [
  C('CSC 101', 'Introduction to Computing', 3, 100, 'FIRST'),
  C('CSC 103', 'Introduction to Programming', 3, 100, 'FIRST'),
  C('CSC 102', 'Introduction to Problem Solving', 3, 100, 'SECOND'),
  C('CSC 104', 'Computer Hardware Fundamentals', 2, 100, 'SECOND'),
  C('CSC 201', 'Computer Programming I', 3, 200, 'FIRST'),
  C('CSC 203', 'Discrete Structures', 3, 200, 'FIRST'),
  C('CSC 205', 'Digital Logic Design', 2, 200, 'FIRST'),
  C('CSC 202', 'Computer Programming II', 3, 200, 'SECOND'),
  C('CSC 204', 'Data Structures', 3, 200, 'SECOND'),
  C('CSC 206', 'Computer Architecture', 2, 200, 'SECOND'),
  C('CSC 301', 'Algorithms and Complexity', 3, 300, 'FIRST'),
  C('CSC 303', 'Operating Systems', 3, 300, 'FIRST'),
  C('CSC 305', 'Database Management Systems', 3, 300, 'FIRST'),
  C('CSC 302', 'Computer Networks', 3, 300, 'SECOND'),
  C('CSC 304', 'Compiler Construction', 3, 300, 'SECOND'),
  C('SEN 201', 'Software Engineering Fundamentals', 3, 200, 'FIRST'),
  C('SEN 202', 'Requirements Engineering', 3, 200, 'SECOND'),
  C('MTH 101', 'Elementary Mathematics I', 3, 100, 'FIRST'),
  C('MTH 102', 'Elementary Mathematics II', 3, 100, 'SECOND'),
  C('MTH 201', 'Mathematical Methods I', 3, 200, 'FIRST'),
  C('MTH 203', 'Linear Algebra I', 3, 200, 'FIRST'),
  C('MTH 202', 'Mathematical Methods II', 3, 200, 'SECOND'),
  C('MTH 301', 'Real Analysis I', 3, 300, 'FIRST'),
  C('MTH 302', 'Abstract Algebra', 3, 300, 'SECOND'),
  C('EEE 101', 'Introduction to Electrical Engineering', 3, 100, 'FIRST'),
  C('EEE 103', 'Engineering Drawing', 2, 100, 'FIRST'),
  C('EEE 102', 'Basic Circuit Theory', 3, 100, 'SECOND'),
  C('ACC 101', 'Principles of Accounting I', 3, 100, 'FIRST'),
  C('ACC 103', 'Introduction to Business', 2, 100, 'FIRST'),
  C('ACC 102', 'Principles of Accounting II', 3, 100, 'SECOND'),
];

/** Program curricula: course code -> core (true) or elective (false). */
const CURRICULA: Record<string, Record<string, boolean>> = {
  'BSC-CSC': {
    'CSC 101': true, 'CSC 103': true, 'MTH 101': true, 'CSC 102': true, 'CSC 104': true, 'MTH 102': true,
    'CSC 201': true, 'CSC 203': true, 'CSC 205': true, 'MTH 201': true, 'MTH 203': true, 'SEN 201': false,
    'CSC 202': true, 'CSC 204': true, 'CSC 206': true, 'MTH 202': true,
    'CSC 301': true, 'CSC 303': true, 'CSC 305': true, 'CSC 302': true, 'CSC 304': true,
  },
  'BSC-SEN': {
    'CSC 101': true, 'CSC 103': true, 'MTH 101': true, 'CSC 102': true, 'CSC 104': true, 'MTH 102': true,
    'CSC 201': true, 'CSC 203': true, 'SEN 201': true, 'MTH 201': true, 'CSC 202': true, 'CSC 204': true, 'SEN 202': true,
  },
  'BSC-MTH': {
    'MTH 101': true, 'CSC 101': false, 'MTH 102': true,
    'MTH 201': true, 'MTH 203': true, 'CSC 201': false, 'MTH 202': true,
    'MTH 301': true, 'MTH 302': true,
  },
  'BENG-EEE': { 'EEE 101': true, 'EEE 103': true, 'MTH 101': true, 'EEE 102': true, 'MTH 102': true },
  'BSC-ACC': { 'ACC 101': true, 'ACC 103': true, 'ACC 102': true },
};

const SESSIONS = [
  { name: '2024/2025', start: '2024-10-07', end: '2025-08-29' },
  { name: '2025/2026', start: '2025-10-06', end: '2026-08-28' },
  { name: '2026/2027', start: '2026-10-05', end: '2027-08-27' },
];

type Person = { title?: string; first: string; last: string; email?: string };

const SUPER_ADMIN: Person = { first: 'Grace', last: 'Adeyemi', email: 'admin@uemp.test' };

const DEPT_ADMINS: Record<string, Person> = {
  CSC: { title: 'Dr.', first: 'Emeka', last: 'Nwosu', email: 'csc.admin@uemp.test' },
  MTH: { title: 'Dr.', first: 'Funmilayo', last: 'Bello', email: 'mth.admin@uemp.test' },
  EEE: { title: 'Engr.', first: 'Chidi', last: 'Okeke', email: 'eee.admin@uemp.test' },
  ACC: { title: 'Mrs.', first: 'Bisi', last: 'Adewale', email: 'acc.admin@uemp.test' },
};

type LecturerSeed = Person & { dept: string; rank: string; key: string };
const LECTURERS: LecturerSeed[] = [
  { key: 'bakare', title: 'Dr.', first: 'Tunde', last: 'Bakare', email: 'lecturer@uemp.test', dept: 'CSC', rank: 'Senior Lecturer' },
  { key: 'chukwu', title: 'Prof.', first: 'Ifeoma', last: 'Chukwu', dept: 'CSC', rank: 'Professor' },
  { key: 'okon', title: 'Dr.', first: 'Samuel', last: 'Okon', dept: 'CSC', rank: 'Lecturer I' },
  { key: 'sani', title: 'Dr.', first: 'Halima', last: 'Sani', dept: 'CSC', rank: 'Lecturer II' },
  { key: 'adeleke', title: 'Mr.', first: 'Bayo', last: 'Adeleke', dept: 'CSC', rank: 'Assistant Lecturer' },
  { key: 'ogunleye', title: 'Dr.', first: 'Kunle', last: 'Ogunleye', dept: 'MTH', rank: 'Senior Lecturer' },
  { key: 'amaka', title: 'Dr.', first: 'Amaka', last: 'Eze', dept: 'MTH', rank: 'Lecturer I' },
  { key: 'lawal', title: 'Mrs.', first: 'Rukayat', last: 'Lawal', dept: 'MTH', rank: 'Lecturer II' },
  { key: 'udo', title: 'Engr.', first: 'Peter', last: 'Udo', dept: 'EEE', rank: 'Senior Lecturer' },
  { key: 'garba', title: 'Dr.', first: 'Musa', last: 'Garba', dept: 'EEE', rank: 'Lecturer I' },
  { key: 'ekpo', title: 'Dr.', first: 'Joy', last: 'Ekpo', dept: 'ACC', rank: 'Senior Lecturer' },
  { key: 'akpan', title: 'Mr.', first: 'Daniel', last: 'Akpan', dept: 'ACC', rank: 'Lecturer II' },
];

/** Who teaches what (the same lecturers every session). */
const TEACHING: Record<string, string[]> = {
  'CSC 101': ['adeleke'], 'CSC 103': ['bakare'], 'CSC 102': ['adeleke'], 'CSC 104': ['okon'],
  'CSC 201': ['bakare'], 'CSC 203': ['bakare'], 'CSC 205': ['okon'], 'CSC 202': ['bakare'],
  'CSC 204': ['chukwu'], 'CSC 206': ['okon'], 'CSC 301': ['chukwu'], 'CSC 303': ['sani'],
  'CSC 305': ['chukwu', 'sani'], 'CSC 302': ['sani'], 'CSC 304': ['chukwu'],
  'SEN 201': ['sani'], 'SEN 202': ['sani'],
  'MTH 101': ['lawal'], 'MTH 102': ['lawal'], 'MTH 201': ['ogunleye'], 'MTH 203': ['amaka'],
  'MTH 202': ['ogunleye'], 'MTH 301': ['ogunleye'], 'MTH 302': ['amaka'],
  'EEE 101': ['udo'], 'EEE 103': ['garba'], 'EEE 102': ['udo'],
  'ACC 101': ['ekpo'], 'ACC 103': ['akpan'], 'ACC 102': ['ekpo'],
};

type Cohort = { program: string; dept: string; entryYear: number; firstSeq: number; names: [string, string][] };

const COHORTS: Cohort[] = [
  {
    program: 'BSC-CSC', dept: 'CSC', entryYear: 2025, firstSeq: 11,
    names: [
      ['Chinedu', 'Eze'], ['Ngozi', 'Okonkwo'], ['Ibrahim', 'Musa'], ['Adaeze', 'Okafor'], ['Temitope', 'Ajayi'],
      ['Chiamaka', 'Obi'], ['Yusuf', 'Abdullahi'], ['Blessing', 'Nnamdi'], ['Kelechi', 'Uche'], ['Zainab', 'Lawal'],
    ],
  },
  {
    program: 'BSC-SEN', dept: 'CSC', entryYear: 2025, firstSeq: 21,
    names: [['Fatima', 'Bello'], ['Tobi', 'Adeyemo'], ['Emmanuel', 'Okoro'], ['Aisha', 'Danjuma'], ['Victor', 'Etim']],
  },
  {
    program: 'BSC-CSC', dept: 'CSC', entryYear: 2024, firstSeq: 3,
    names: [['Oluwaseun', 'Adebayo'], ['Halima', 'Yakubu'], ['Chukwuemeka', 'Nwankwo'], ['Precious', 'Idowu'], ['Segun', 'Ogunbiyi'], ['Esther', 'Akande']],
  },
  {
    program: 'BSC-CSC', dept: 'CSC', entryYear: 2026, firstSeq: 1,
    names: [['David', 'Onyeka'], ['Grace', 'Umeh'], ['Abdul', 'Sule'], ['Joy', 'Effiong'], ['Michael', 'Ojo']],
  },
  {
    program: 'BSC-MTH', dept: 'MTH', entryYear: 2025, firstSeq: 8,
    names: [['Ifeanyi', 'Okeke'], ['Rachael', 'Ola'], ['Hauwa', 'Ibrahim'], ['Samuel', 'Bassey'], ['Kemi', 'Afolabi']],
  },
  {
    program: 'BSC-MTH', dept: 'MTH', entryYear: 2024, firstSeq: 4,
    names: [['Uche', 'Madu'], ['Bola', 'Salami'], ['Nkechi', 'Agu']],
  },
  {
    program: 'BENG-EEE', dept: 'EEE', entryYear: 2026, firstSeq: 1,
    names: [['Obinna', 'Chukwu'], ['Maryam', 'Aliyu'], ['Tolu', 'Babatunde'], ['Ekene', 'Igwe']],
  },
  {
    program: 'BSC-ACC', dept: 'ACC', entryYear: 2026, firstSeq: 1,
    names: [['Funke', 'Akinola'], ['Chidinma', 'Ude'], ['Ahmed', 'Bala'], ['Ruth', 'Oyelaran']],
  },
];

const TEST_STUDENT_EMAIL = 'student@uemp.test';
const TEST_STUDENT_MATRIC = 'CSC/2025/014';

/** Hand-set 2025/2026 scores for the demo student so the CGPA is a tidy 4.12. */
const TEST_STUDENT_HISTORY: Record<string, [number, number]> = {
  'CSC 101': [34, 42], 'CSC 103': [31, 41], 'MTH 101': [27, 36],
  'CSC 102': [26, 39], 'CSC 104': [19, 28], 'MTH 102': [28, 33],
};

/** Current-semester demo states for each sheet (everything else stays an empty draft). */
const CURRENT_STATES: Record<string, { status: ResultStatus; fill: 'all' | 'half' | 'none'; comment?: string }> = {
  'CSC 201': { status: 'SUBMITTED', fill: 'all' },
  'CSC 203': { status: 'DRAFT', fill: 'half' },
  'CSC 205': {
    status: 'REJECTED',
    fill: 'all',
    comment: 'CA and exam scores look swapped for CSC/2025/017 and CSC/2025/018. Please recheck against the mark sheets.',
  },
  'MTH 201': { status: 'SUBMITTED', fill: 'all' },
  'CSC 301': { status: 'SUBMITTED', fill: 'all' },
  'CSC 305': { status: 'APPROVED', fill: 'all' },
};

/** Courses the demo student has already registered for this semester (CSC 203, MTH 203 and SEN 201 are left to register live). */
const TEST_STUDENT_CURRENT = ['CSC 201', 'CSC 205', 'MTH 201'];

const STATUS_OVERRIDES: Record<string, 'INACTIVE' | 'SUSPENDED'> = {
  'CSC/2024/003': 'SUSPENDED',
  'CSC/2025/021': 'INACTIVE',
};

// ---------------------------------------------------------------------------

export async function seed(prisma: PrismaClient, log: (msg: string) => void = () => {}) {
  const rand = rng(20261109);
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const now = Date.now();

  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "AuditLog", "AuthSession", "Result", "Enrollment", "ResultSheet", "CourseAllocation",
      "CourseOffering", "ProgramCourse", "Course", "Student", "Lecturer", "User", "Program",
      "Semester", "AcademicSession", "Department", "Faculty", "GradeBand" RESTART IDENTITY CASCADE`);

  await prisma.gradeBand.createMany({ data: DEFAULT_BANDS });

  // Structure ---------------------------------------------------------------
  const faculty: Record<string, string> = {};
  for (const f of FACULTIES) faculty[f.code] = (await prisma.faculty.create({ data: { code: f.code, name: f.name } })).id;

  const dept: Record<string, string> = {};
  for (const d of DEPARTMENTS) {
    dept[d.code] = (await prisma.department.create({ data: { code: d.code, name: d.name, facultyId: faculty[d.faculty] } })).id;
  }

  const program: Record<string, { id: string; durationYears: number }> = {};
  for (const p of PROGRAMS) {
    const created = await prisma.program.create({
      data: { code: p.code, name: p.name, award: p.award, durationYears: p.durationYears, departmentId: dept[p.dept] },
    });
    program[p.code] = { id: created.id, durationYears: p.durationYears };
  }

  const course: Record<string, { id: string } & CourseSeed> = {};
  for (const c of COURSES) {
    const created = await prisma.course.create({
      data: { code: c.code, title: c.title, units: c.units, level: c.level, term: c.term, departmentId: dept[c.dept] },
    });
    course[c.code] = { id: created.id, ...c };
  }

  for (const [programCode, courses] of Object.entries(CURRICULA)) {
    await prisma.programCourse.createMany({
      data: Object.entries(courses).map(([code, isCore]) => ({ programId: program[programCode].id, courseId: course[code].id, isCore })),
    });
  }

  type SemesterInfo = { id: string; term: SemesterTerm; startYear: number; start: Date; end: Date; isCurrent: boolean };
  const semesters: SemesterInfo[] = [];
  for (const s of SESSIONS) {
    const session = await prisma.academicSession.create({
      data: { name: s.name, startDate: new Date(s.start), endDate: new Date(s.end) },
    });
    const start = new Date(s.start);
    const end = new Date(s.end);
    const mid = new Date((start.getTime() + end.getTime()) / 2);
    for (const term of ['FIRST', 'SECOND'] as const) {
      const isCurrent = s.name === '2026/2027' && term === 'FIRST';
      const created = await prisma.semester.create({
        data: { sessionId: session.id, term, isCurrent, registrationOpen: isCurrent },
      });
      semesters.push({
        id: created.id,
        term,
        startYear: start.getFullYear(),
        start: term === 'FIRST' ? start : mid,
        end: term === 'FIRST' ? mid : end,
        isCurrent,
      });
    }
  }
  log(`Structure: ${FACULTIES.length} faculties, ${DEPARTMENTS.length} departments, ${COURSES.length} courses`);

  // People ------------------------------------------------------------------
  const emailFor = (p: Person) => p.email ?? `${p.first}.${p.last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@uemp.test';

  const createUser = async (p: Person, role: Role, departmentId: string | null, status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' = 'ACTIVE') =>
    prisma.user.create({
      data: {
        email: emailFor(p),
        title: p.title ?? null,
        firstName: p.first,
        lastName: p.last,
        phone: `080${Math.floor(10000000 + rand() * 89999999)}`,
        role,
        status,
        departmentId,
        passwordHash,
      },
    });

  await createUser(SUPER_ADMIN, 'SUPER_ADMIN', null);
  const admin: Record<string, string> = {};
  for (const [code, p] of Object.entries(DEPT_ADMINS)) admin[code] = (await createUser(p, 'DEPT_ADMIN', dept[code])).id;

  const lecturer: Record<string, string> = {};
  for (const [i, l] of LECTURERS.entries()) {
    const user = await createUser(l, 'LECTURER', dept[l.dept]);
    await prisma.lecturer.create({ data: { userId: user.id, staffId: `STF/${l.dept}/${String(i + 1).padStart(3, '0')}`, rank: l.rank } });
    lecturer[l.key] = user.id;
  }

  type StudentInfo = { id: string; matricNo: string; programCode: string; entryYear: number; ability: number; isTest: boolean };
  const students: StudentInfo[] = [];
  for (const cohort of COHORTS) {
    for (const [i, [first, last]] of cohort.names.entries()) {
      const seq = cohort.firstSeq + i;
      const matricNo = `${cohort.dept}/${cohort.entryYear}/${String(seq).padStart(3, '0')}`;
      const isTest = matricNo === TEST_STUDENT_MATRIC;
      const status = STATUS_OVERRIDES[matricNo] ?? 'ACTIVE';
      const user = await createUser({ first, last, email: isTest ? TEST_STUDENT_EMAIL : undefined }, 'STUDENT', dept[cohort.dept], status);
      const levelNow = (2026 - cohort.entryYear + 1) * 100;
      await prisma.student.create({
        data: {
          userId: user.id,
          matricNo,
          programId: program[cohort.program].id,
          level: levelNow,
          entryYear: cohort.entryYear,
          gender: ['Adaeze', 'Ngozi', 'Temitope', 'Chiamaka', 'Blessing', 'Zainab', 'Fatima', 'Aisha', 'Halima', 'Precious', 'Esther', 'Grace', 'Joy', 'Rachael', 'Hauwa', 'Kemi', 'Bola', 'Nkechi', 'Maryam', 'Funke', 'Chidinma', 'Ruth'].includes(first) ? 'Female' : 'Male',
          dateOfBirth: new Date(Date.UTC(cohort.entryYear - 18 - Math.floor(rand() * 2), Math.floor(rand() * 12), 1 + Math.floor(rand() * 27))),
          address: isTest ? '14 Unity Close, Bodija, Ibadan' : null,
        },
      });
      students.push({ id: user.id, matricNo, programCode: cohort.program, entryYear: cohort.entryYear, ability: 48 + rand() * 30, isTest });
    }
  }
  log(`People: ${students.length} students, ${LECTURERS.length} lecturers, ${Object.keys(DEPT_ADMINS).length + 1} admins`);

  // Offerings, registrations and results ------------------------------------
  const randomScores = (ability: number): [number, number] => {
    const total = Math.max(22, Math.min(92, Math.round(ability + (rand() - 0.5) * 26)));
    const ca = Math.max(8, Math.min(40, Math.round(total * (0.36 + rand() * 0.1))));
    return [ca, Math.max(0, Math.min(60, total - ca))];
  };

  let enrollmentCount = 0;
  const activeSemesters = semesters.slice(0, semesters.findIndex((s) => s.isCurrent) + 1);
  for (const semester of activeSemesters) {

    // Which offerings this semester needs, based on who is studying at what level.
    const needed = new Map<string, StudentInfo[]>();
    for (const s of students) {
      const levelThen = (semester.startYear - s.entryYear + 1) * 100;
      if (levelThen < 100 || levelThen > program[s.programCode].durationYears * 100) continue;
      for (const [code, isCore] of Object.entries(CURRICULA[s.programCode])) {
        const c = course[code];
        if (c.level !== levelThen || c.term !== semester.term) continue;
        const takesElective = isCore || (s.isTest ? false : rand() < 0.5);
        if (!takesElective) continue;
        if (semester.isCurrent && s.isTest && !TEST_STUDENT_CURRENT.includes(code)) continue;
        needed.set(code, [...(needed.get(code) ?? []), s]);
      }
    }
    // Courses in a current curriculum are offered even if nobody has registered yet.
    if (semester.isCurrent) {
      for (const s of students) {
        const levelNow = (2026 - s.entryYear + 1) * 100;
        for (const code of Object.keys(CURRICULA[s.programCode])) {
          const c = course[code];
          if (c.level === levelNow && c.term === semester.term && !needed.has(code)) needed.set(code, []);
        }
      }
    }

    for (const [code, enrolled] of needed) {
      const c = course[code];
      const state = semester.isCurrent ? (CURRENT_STATES[code] ?? { status: 'DRAFT' as const, fill: 'none' as const }) : { status: 'APPROVED' as const, fill: 'all' as const };
      const teachers = TEACHING[code].map((k) => lecturer[k]);
      const submitter = teachers[0];
      const reviewer = admin[c.dept];

      const submittedAt = semester.isCurrent ? new Date(now - days(2) - rand() * days(2)) : new Date(semester.end.getTime() - days(20));
      const reviewedAt = semester.isCurrent ? new Date(submittedAt.getTime() + days(1)) : new Date(semester.end.getTime() - days(10));
      const submitted = state.status !== 'DRAFT';
      const reviewed = state.status === 'APPROVED' || state.status === 'REJECTED';

      const offering = await prisma.courseOffering.create({
        data: {
          courseId: c.id,
          semesterId: semester.id,
          capacity: semester.isCurrent && c.level === 100 ? 120 : null,
          createdAt: new Date(semester.start.getTime() + days(3)),
          allocations: { create: teachers.map((lecturerId) => ({ lecturerId })) },
          resultSheet: {
            create: {
              status: state.status,
              submittedById: submitted ? submitter : null,
              submittedAt: submitted ? submittedAt : null,
              reviewedById: reviewed ? reviewer : null,
              reviewedAt: reviewed ? reviewedAt : null,
              reviewComment: state.comment ?? null,
            },
          },
        },
      });

      const registeredAt = new Date(semester.start.getTime() + days(7) + rand() * days(10));
      const enrollments = enrolled.length
        ? await prisma.enrollment.createManyAndReturn({
            data: enrolled.map((s) => ({ studentId: s.id, offeringId: offering.id, units: c.units, createdAt: registeredAt })),
          })
        : [];
      enrollmentCount += enrollments.length;

      const byStudent = new Map(enrolled.map((s) => [s.id, s]));
      const results = enrollments.flatMap((e, index) => {
        const s = byStudent.get(e.studentId)!;
        if (state.fill === 'none') return [];
        let [ca, exam]: [number | null, number | null] = s.isTest && TEST_STUDENT_HISTORY[code] && !semester.isCurrent
          ? TEST_STUDENT_HISTORY[code]
          : s.isTest && code === 'CSC 201'
            ? [32, 45]
            : randomScores(s.ability);
        if (state.fill === 'half') {
          if (index % 2 === 1) return [];
          if (index % 4 === 2) exam = null;
        }
        return [{ enrollmentId: e.id, caScore: ca, examScore: exam, ...computeResult(ca, exam, DEFAULT_BANDS), updatedById: submitter }];
      });
      if (results.length) await prisma.result.createMany({ data: results });

      // Audit history for the sheet so the review timeline is populated.
      const history: { action: string; actorId: string; role: Role; at: Date; summary: string; metadata?: object }[] = [];
      if (state.fill !== 'none') {
        history.push({
          action: 'SCORES_SAVED',
          actorId: submitter,
          role: 'LECTURER',
          at: new Date(submittedAt.getTime() - days(3)),
          summary: `Updated ${results.length} scores for ${code}`,
        });
      }
      if (submitted) {
        history.push({
          action: 'RESULT_SUBMITTED',
          actorId: submitter,
          role: 'LECTURER',
          at: submittedAt,
          summary: `${code} results submitted for approval (${enrollments.length} students)`,
        });
      }
      if (reviewed) {
        const approved = state.status === 'APPROVED';
        history.push({
          action: approved ? 'RESULT_APPROVED' : 'RESULT_REJECTED',
          actorId: reviewer,
          role: 'DEPT_ADMIN',
          at: reviewedAt,
          summary: `${code} results ${approved ? 'approved' : 'rejected'}${state.comment ? `: “${state.comment}”` : ''}`,
          metadata: { comment: state.comment ?? null },
        });
      }
      if (history.length) {
        await prisma.auditLog.createMany({
          data: history.map((h) => ({
            actorId: h.actorId,
            actorRole: h.role,
            action: h.action,
            entityType: 'ResultSheet',
            entityId: offering.id,
            departmentId: dept[c.dept],
            summary: h.summary,
            metadata: h.metadata,
            ipAddress: '10.0.4.21',
            createdAt: h.at,
          })),
        });
      }
    }
  }
  log(`Registrations: ${enrollmentCount} course registrations across ${activeSemesters.length} semesters`);

  // A few current-semester registration events for the activity feeds.
  const current = semesters.find((s) => s.isCurrent)!;
  const recent = students.filter((s) => s.entryYear === 2025 && s.programCode === 'BSC-CSC').slice(0, 4);
  await prisma.auditLog.createMany({
    data: recent.map((s, i) => ({
      actorId: s.id,
      actorRole: 'STUDENT' as const,
      action: 'COURSES_REGISTERED',
      entityType: 'Student',
      entityId: s.id,
      departmentId: dept.CSC,
      summary: `${s.matricNo} registered ${s.isTest ? TEST_STUDENT_CURRENT.join(', ') : 'CSC 201, CSC 203, CSC 205, MTH 201, MTH 203'}`,
      metadata: { semesterId: current.id },
      ipAddress: '10.0.7.' + (30 + i),
      createdAt: new Date(now - days(6) + i * days(1)),
    })),
  });
}
