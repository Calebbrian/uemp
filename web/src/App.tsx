import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation, type RouteObject } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import { Spinner } from './components/ui/primitives';
import { useAuth } from './lib/auth';
import { ROLE_HOME } from './lib/format';
import type { Role } from './lib/types';
import { Forbidden, NotFound } from './pages/Errors';
import { LoginPage } from './pages/Login';
import { StudentDashboardPage } from './pages/student/Dashboard';
import { StudentProfilePage } from './pages/student/Profile';
import { CourseRegistrationPage } from './pages/student/Registration';
import { MyCoursesPage } from './pages/student/Courses';
import { ResultsPage } from './pages/student/Results';
import { PrintRegistrationPage, PrintResultsPage } from './pages/print/Print';
import { LecturerDashboardPage } from './pages/lecturer/Dashboard';
import { LecturerCoursesPage } from './pages/lecturer/Courses';
import { ScoreSheetPage } from './pages/lecturer/ScoreSheet';
import { LecturerActivityPage } from './pages/lecturer/Activity';
import { DeptDashboardPage } from './pages/admin/DeptDashboard';
import { SuperDashboardPage } from './pages/admin/SuperDashboard';
import { ResultsApprovalPage } from './pages/admin/ResultsApproval';
import { ResultReviewPage } from './pages/admin/ResultReview';
import { StudentsPage } from './pages/admin/Students';
import { StudentDetailPage } from './pages/admin/StudentDetail';
import { LecturersPage } from './pages/admin/Lecturers';
import { LecturerDetailPage } from './pages/admin/LecturerDetail';
import { CoursesPage } from './pages/admin/Courses';
import { ProgrammesPage } from './pages/admin/Programmes';
import { ProgrammeDetailPage } from './pages/admin/ProgrammeDetail';
import { OfferingsPage } from './pages/admin/Offerings';
import { RegistrationsPage } from './pages/admin/Registrations';
import { ReportsPage } from './pages/admin/Reports';
import { AuditLogPage } from './pages/admin/AuditLog';
import { FacultiesPage } from './pages/admin/Faculties';
import { DepartmentsPage } from './pages/admin/Departments';
import { SessionsPage } from './pages/admin/Sessions';
import { UsersPage } from './pages/admin/Users';
import { GradingScalePage } from './pages/admin/GradingScale';
import { RolesPage } from './pages/admin/Roles';

/** Client-side guard for navigation. The API enforces the same rules on every request. */
function RequireRole({ roles }: { roles: Role[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label="Loading your account" />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (!roles.includes(user.role)) return <Forbidden />;
  return <Outlet />;
}

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Loading your account" />;
  return <Navigate to={user ? ROLE_HOME[user.role] : '/login'} replace />;
}

const sharedAdminPages: RouteObject[] = [
  { path: 'students/:id', element: <StudentDetailPage /> },
  { path: 'lecturers/:id', element: <LecturerDetailPage /> },
  { path: 'courses', element: <CoursesPage /> },
  { path: 'programmes', element: <ProgrammesPage /> },
  { path: 'programmes/:id', element: <ProgrammeDetailPage /> },
  { path: 'offerings', element: <OfferingsPage /> },
  { path: 'registrations', element: <RegistrationsPage /> },
  { path: 'results', element: <ResultsApprovalPage /> },
  { path: 'results/:offeringId', element: <ResultReviewPage /> },
  { path: 'reports', element: <ReportsPage /> },
];

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/', element: <Home /> },
  {
    path: '/student',
    element: <RequireRole roles={['STUDENT']} />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <StudentDashboardPage /> },
          { path: 'profile', element: <StudentProfilePage /> },
          { path: 'registration', element: <CourseRegistrationPage /> },
          { path: 'courses', element: <MyCoursesPage /> },
          { path: 'results', element: <ResultsPage /> },
        ],
      },
      { path: 'print/registration', element: <PrintRegistrationPage /> },
      { path: 'print/results', element: <PrintResultsPage /> },
    ],
  },
  {
    path: '/lecturer',
    element: <RequireRole roles={['LECTURER']} />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <LecturerDashboardPage /> },
          { path: 'courses', element: <LecturerCoursesPage /> },
          { path: 'courses/:offeringId', element: <ScoreSheetPage /> },
          { path: 'activity', element: <LecturerActivityPage /> },
        ],
      },
    ],
  },
  {
    path: '/dept',
    element: <RequireRole roles={['DEPT_ADMIN']} />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <DeptDashboardPage /> },
          { path: 'students', element: <StudentsPage /> },
          { path: 'lecturers', element: <LecturersPage /> },
          ...sharedAdminPages,
          { path: 'activity', element: <AuditLogPage /> },
        ],
      },
    ],
  },
  {
    path: '/admin',
    element: <RequireRole roles={['SUPER_ADMIN']} />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <SuperDashboardPage /> },
          { path: 'faculties', element: <FacultiesPage /> },
          { path: 'departments', element: <DepartmentsPage /> },
          { path: 'sessions', element: <SessionsPage /> },
          { path: 'users', element: <UsersPage /> },
          ...sharedAdminPages,
          { path: 'audit', element: <AuditLogPage /> },
          { path: 'grading', element: <GradingScalePage /> },
          { path: 'roles', element: <RolesPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFound /> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
