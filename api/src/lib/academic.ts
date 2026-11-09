import type { AcademicSession, Semester, SemesterTerm } from '@prisma/client';
import type { Db } from '../db';

export const termLabel = (term: SemesterTerm) => (term === 'FIRST' ? 'First Semester' : 'Second Semester');

export const semesterLabel = (s: Semester & { session: AcademicSession }) =>
  `${s.session.name} · ${termLabel(s.term)}`;

export function getCurrentSemester(db: Db) {
  return db.semester.findFirst({ where: { isCurrent: true }, include: { session: true } });
}

/** Defaults to the current semester when no id is given. */
export async function resolveSemester(db: Db, semesterId?: string) {
  if (semesterId) return db.semester.findUnique({ where: { id: semesterId }, include: { session: true } });
  return getCurrentSemester(db);
}

export function formatSemester(s: (Semester & { session: AcademicSession }) | null) {
  if (!s) return null;
  return {
    id: s.id,
    term: s.term,
    isCurrent: s.isCurrent,
    registrationOpen: s.registrationOpen,
    session: { id: s.session.id, name: s.session.name },
    label: semesterLabel(s),
  };
}

/** Chronological ordering for semesters: by session start date, then first before second. */
export const semesterOrder = (s: Semester & { session: AcademicSession }) =>
  s.session.startDate.getTime() * 10 + (s.term === 'FIRST' ? 0 : 1);

type Named = { title?: string | null; firstName: string; lastName: string };

export const fullName = (u: Named) => [u.title, u.firstName, u.lastName].filter(Boolean).join(' ');

export const programLabel = (p: { award: string; name: string }) => `${p.award} ${p.name}`;
