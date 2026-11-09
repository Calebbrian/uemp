import { Prisma } from '@prisma/client';
import { rules } from '../config';
import { prisma } from '../db';
import { audit } from '../lib/audit';
import { formatSemester, fullName, getCurrentSemester } from '../lib/academic';
import { conflict, notFound, unprocessable } from '../lib/errors';
import type { AuthUser } from '../middleware/auth';

const offeringInclude = (programId: string) =>
  ({
    course: { include: { department: true, programs: { where: { programId } } } },
    allocations: { include: { lecturer: { include: { user: true } } } },
    resultSheet: true,
    _count: { select: { enrollments: true } },
  }) satisfies Prisma.CourseOfferingInclude;

type OfferingRow = Prisma.CourseOfferingGetPayload<{ include: ReturnType<typeof offeringInclude> }>;

function describeOffering(o: OfferingRow) {
  return {
    offeringId: o.id,
    code: o.course.code,
    title: o.course.title,
    units: o.course.units,
    level: o.course.level,
    department: o.course.department.code,
    isCore: o.course.programs[0]?.isCore ?? false,
    lecturers: o.allocations.map((a) => fullName(a.lecturer.user)),
    capacity: o.capacity,
    registeredCount: o._count.enrollments,
    seatsLeft: o.capacity === null ? null : Math.max(o.capacity - o._count.enrollments, 0),
  };
}

async function loadStudent(userId: string) {
  const student = await prisma.student.findUnique({ where: { userId }, include: { program: true } });
  if (!student) throw notFound('Student record');
  return student;
}

/** Everything the registration screen needs for the current semester. */
export async function registrationOverview(userId: string) {
  const student = await loadStudent(userId);
  const semester = await getCurrentSemester(prisma);
  if (!semester) {
    return { semester: null, maxUnits: rules.maxUnitsPerSemester, registered: [], available: [], registeredUnits: 0 };
  }

  const include = offeringInclude(student.programId);
  const [enrollments, offerings] = await Promise.all([
    prisma.enrollment.findMany({
      where: { studentId: userId, offering: { semesterId: semester.id } },
      include: { result: true, offering: { include } },
      orderBy: { offering: { course: { code: 'asc' } } },
    }),
    prisma.courseOffering.findMany({
      where: {
        semesterId: semester.id,
        course: {
          isActive: true,
          level: student.level,
          term: semester.term,
          programs: { some: { programId: student.programId } },
        },
      },
      include,
      orderBy: { course: { code: 'asc' } },
    }),
  ]);

  const registeredIds = new Set(enrollments.map((e) => e.offeringId));

  const registered = enrollments.map((e) => {
    const hasScores = e.result !== null && (e.result.caScore !== null || e.result.examScore !== null);
    const sheetStarted = (e.offering.resultSheet?.status ?? 'DRAFT') !== 'DRAFT' || hasScores;
    return {
      enrollmentId: e.id,
      ...describeOffering(e.offering),
      units: e.units,
      registeredAt: e.createdAt,
      canDrop: semester.registrationOpen && !sheetStarted,
      dropBlockedReason: !semester.registrationOpen
        ? 'Registration is closed'
        : sheetStarted
          ? 'Results have started'
          : null,
    };
  });

  const available = offerings
    .filter((o) => !registeredIds.has(o.id))
    .map((o) => {
      const sheetStatus = o.resultSheet?.status ?? 'DRAFT';
      const full = o.capacity !== null && o._count.enrollments >= o.capacity;
      return {
        ...describeOffering(o),
        blockedReason: sheetStatus !== 'DRAFT' ? 'Results already submitted' : full ? 'Full' : null,
      };
    });

  return {
    semester: formatSemester(semester),
    maxUnits: rules.maxUnitsPerSemester,
    registered,
    registeredUnits: registered.reduce((sum, r) => sum + r.units, 0),
    available,
  };
}

/**
 * Registers the signed-in student for one or more offerings in the current
 * semester. The student id always comes from the session, never the request.
 */
export async function registerCourses(user: AuthUser, offeringIds: string[], ip: string | null) {
  const ids = [...new Set(offeringIds)];

  try {
    return await prisma.$transaction(
      async (tx) => {
        const semester = await getCurrentSemester(tx);
        if (!semester) throw conflict('There is no active semester.');
        if (!semester.registrationOpen) throw conflict('Course registration is closed for this semester.');

        const student = await tx.student.findUnique({ where: { userId: user.id }, include: { program: true } });
        if (!student) throw notFound('Student record');

        const offerings = await tx.courseOffering.findMany({
          where: { id: { in: ids } },
          include: offeringInclude(student.programId),
        });
        if (offerings.length !== ids.length) throw unprocessable('One or more selected courses no longer exist.');

        const problems: string[] = [];
        for (const o of offerings) {
          const code = o.course.code;
          if (o.semesterId !== semester.id) problems.push(`${code} is not offered this semester.`);
          else if (!o.course.isActive) problems.push(`${code} is no longer active.`);
          else if (o.course.level !== student.level)
            problems.push(`${code} is a ${o.course.level} level course; you are in ${student.level} level.`);
          else if (o.course.programs.length === 0)
            problems.push(`${code} is not part of the ${student.program.award} ${student.program.name} curriculum.`);
          else if ((o.resultSheet?.status ?? 'DRAFT') !== 'DRAFT')
            problems.push(`${code}: results are already being processed.`);
          else if (o.capacity !== null && o._count.enrollments >= o.capacity) problems.push(`${code} is full.`);
        }
        if (problems.length) throw unprocessable('Some courses cannot be registered.', { courses: problems });

        const existing = await tx.enrollment.findMany({
          where: { studentId: user.id, offering: { semesterId: semester.id } },
          include: { offering: { include: { course: true } } },
        });
        const duplicates = existing.filter((e) => ids.includes(e.offeringId));
        if (duplicates.length) {
          throw conflict(
            `You are already registered for ${duplicates.map((d) => d.offering.course.code).join(', ')}.`,
          );
        }

        const currentUnits = existing.reduce((sum, e) => sum + e.units, 0);
        const addedUnits = offerings.reduce((sum, o) => sum + o.course.units, 0);
        if (currentUnits + addedUnits > rules.maxUnitsPerSemester) {
          throw unprocessable(
            `This would bring you to ${currentUnits + addedUnits} units. The maximum per semester is ${rules.maxUnitsPerSemester}.`,
          );
        }

        await tx.enrollment.createMany({
          data: offerings.map((o) => ({ studentId: user.id, offeringId: o.id, units: o.course.units })),
        });

        const codes = offerings.map((o) => o.course.code).sort();
        await audit(tx, {
          actor: user,
          action: 'COURSES_REGISTERED',
          entityType: 'Student',
          entityId: user.id,
          departmentId: user.departmentId,
          summary: `${student.matricNo} registered ${codes.join(', ')}`,
          metadata: { semesterId: semester.id, courses: codes, totalUnits: currentUnits + addedUnits },
          ip,
        });

        return { registered: codes, totalUnits: currentUnits + addedUnits };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (err) {
    // Unique (studentId, offeringId) or a serialization conflict from a parallel request.
    if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === 'P2002' || err.code === 'P2034')) {
      throw conflict('You are already registered for one of these courses. Refresh and try again.');
    }
    throw err;
  }
}

export async function dropCourse(user: AuthUser, enrollmentId: string, ip: string | null) {
  return prisma.$transaction(async (tx) => {
    const enrollment = await tx.enrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        result: true,
        student: true,
        offering: { include: { course: true, resultSheet: true, semester: true } },
      },
    });
    // Another student's enrollment is reported as missing rather than forbidden.
    if (!enrollment || enrollment.studentId !== user.id) throw notFound('Registration');

    const { offering } = enrollment;
    if (!offering.semester.isCurrent || !offering.semester.registrationOpen) {
      throw conflict('Registration is closed, so courses can no longer be dropped.');
    }
    const hasScores =
      enrollment.result !== null && (enrollment.result.caScore !== null || enrollment.result.examScore !== null);
    if ((offering.resultSheet?.status ?? 'DRAFT') !== 'DRAFT' || hasScores) {
      throw conflict(`${offering.course.code} already has results recorded and cannot be dropped.`);
    }

    if (enrollment.result) await tx.result.delete({ where: { enrollmentId } });
    await tx.enrollment.delete({ where: { id: enrollmentId } });

    await audit(tx, {
      actor: user,
      action: 'COURSE_DROPPED',
      entityType: 'Student',
      entityId: user.id,
      departmentId: user.departmentId,
      summary: `${enrollment.student.matricNo} dropped ${offering.course.code}`,
      metadata: { offeringId: offering.id, course: offering.course.code },
      ip,
    });
    return { dropped: offering.course.code };
  });
}
