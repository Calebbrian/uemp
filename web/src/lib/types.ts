export type Role = 'STUDENT' | 'LECTURER' | 'DEPT_ADMIN' | 'SUPER_ADMIN';
export type AccountStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
export type ResultStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
export type Term = 'FIRST' | 'SECOND';

export type DeptRef = { id: string; code: string; name: string };

export type Semester = {
  id: string;
  term: Term;
  isCurrent: boolean;
  registrationOpen: boolean;
  session: { id: string; name: string };
  label: string;
};

export type Me = {
  id: string;
  email: string;
  title: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: Role;
  status: AccountStatus;
  lastLoginAt: string | null;
  department: (DeptRef & { faculty: DeptRef }) | null;
  student: {
    matricNo: string;
    level: number;
    entryYear: number;
    gender: string | null;
    dateOfBirth: string | null;
    address: string | null;
    program: { id: string; code: string; name: string };
  } | null;
  lecturer: { staffId: string; rank: string | null } | null;
  permissions: string[];
};

export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

export type Band = { grade: string; minScore: number; maxScore: number; point: number; remark: string };

export type ScoreSummary = {
  students: number;
  graded: number;
  average: number | null;
  highest: number | null;
  lowest: number | null;
  passRate: number | null;
  distribution: Record<string, number>;
};

export type HistoryEntry = {
  id: string;
  action: string;
  label: string;
  actor: string | null;
  actorRole: Role | null;
  summary: string;
  metadata: unknown;
  createdAt: string;
};

export type SheetStudent = {
  enrollmentId: string;
  matricNo: string;
  name: string;
  level: number;
  caScore: number | null;
  examScore: number | null;
  totalScore: number | null;
  grade: string | null;
  gradePoint: number | null;
};

export type SheetDetail = {
  offering: {
    id: string;
    capacity: number | null;
    course: { id: string; code: string; title: string; units: number; level: number; department: DeptRef };
    semester: Semester;
    lecturers: { id: string; name: string }[];
  };
  sheet: {
    status: ResultStatus;
    submittedAt: string | null;
    submittedBy: string | null;
    submittedById: string | null;
    reviewedAt: string | null;
    reviewedBy: string | null;
    reviewComment: string | null;
    updatedAt: string | null;
  };
  students: SheetStudent[];
  summary: ScoreSummary;
  gradeBands: Band[];
  limits: { caMax: number; examMax: number };
  history: HistoryEntry[];
  actions?: { canApprove: boolean; canReject: boolean; canReopen: boolean };
};

export type TranscriptCourse = {
  code: string;
  title: string;
  units: number;
  caScore: number;
  examScore: number;
  totalScore: number;
  grade: string;
  gradePoint: number;
};

export type Transcript = {
  cgpa: number | null;
  classOfDegree: string | null;
  unitsAttempted: number;
  unitsPassed: number;
  lastGpa: number | null;
  semesters: {
    semester: Semester;
    courses: TranscriptCourse[];
    pending: number;
    units: number;
    gpa: number | null;
    cgpa: number | null;
  }[];
};

export type Options = {
  faculties: { id: string; code: string; name: string }[];
  departments: { id: string; code: string; name: string; facultyId: string }[];
  programs: { id: string; code: string; name: string; departmentId: string; durationYears: number }[];
};

export type AuditEntry = {
  id: string;
  action: string;
  label: string;
  actor: { id: string; name: string; email: string } | null;
  actorRole: Role | null;
  entityType: string;
  entityId: string | null;
  department: { id: string; code: string } | null;
  summary: string;
  metadata: unknown;
  ipAddress: string | null;
  createdAt: string;
};
