import { Router } from 'express';
import { auditRouter } from './audit';
import { authRouter } from './auth';
import { coursesRouter } from './courses';
import { dashboardRouter } from './dashboard';
import { gradingRouter } from './grading';
import { lecturerRouter } from './lecturer';
import { lecturersRouter } from './lecturers';
import { metaRouter } from './meta';
import { offeringsRouter } from './offerings';
import { programsRouter } from './programs';
import { registrationsRouter } from './registrations';
import { reportsRouter } from './reports';
import { resultsRouter } from './results';
import { sessionsRouter } from './sessions';
import { structureRouter } from './structure';
import { studentRouter } from './student';
import { studentsRouter } from './students';
import { usersRouter } from './users';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/meta', metaRouter);

// Self-service
apiRouter.use('/student', studentRouter);
apiRouter.use('/lecturer', lecturerRouter);

// Administration (department-scoped for department admins)
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/', structureRouter);
apiRouter.use('/programs', programsRouter);
apiRouter.use('/courses', coursesRouter);
apiRouter.use('/offerings', offeringsRouter);
apiRouter.use('/students', studentsRouter);
apiRouter.use('/lecturers', lecturersRouter);
apiRouter.use('/registrations', registrationsRouter);
apiRouter.use('/results', resultsRouter);
apiRouter.use('/reports', reportsRouter);
apiRouter.use('/audit-logs', auditRouter);
apiRouter.use('/sessions', sessionsRouter);
apiRouter.use('/grading-scale', gradingRouter);
apiRouter.use('/users', usersRouter);
