import {
  Award,
  BookOpen,
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarDays,
  ChartColumn,
  ClipboardCheck,
  History,
  LayoutDashboard,
  Layers,
  List,
  Network,
  Shield,
  SlidersHorizontal,
  SquareCheckBig,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '../../lib/types';

export type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };

export const NAV: Record<Role, NavItem[]> = {
  STUDENT: [
    { to: '/student', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/student/profile', label: 'My Profile', icon: User },
    { to: '/student/registration', label: 'Course Registration', icon: ClipboardCheck },
    { to: '/student/courses', label: 'My Courses', icon: BookOpen },
    { to: '/student/results', label: 'Results', icon: Award },
  ],
  LECTURER: [
    { to: '/lecturer', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/lecturer/courses', label: 'My Courses', icon: BookOpen },
    { to: '/lecturer/activity', label: 'Activity', icon: History },
  ],
  DEPT_ADMIN: [
    { to: '/dept', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/dept/students', label: 'Students', icon: Users },
    { to: '/dept/lecturers', label: 'Lecturers', icon: Briefcase },
    { to: '/dept/courses', label: 'Courses', icon: BookOpen },
    { to: '/dept/programmes', label: 'Programmes', icon: Layers },
    { to: '/dept/offerings', label: 'Course Offerings', icon: CalendarCheck },
    { to: '/dept/registrations', label: 'Registrations', icon: List },
    { to: '/dept/results', label: 'Results Approval', icon: SquareCheckBig },
    { to: '/dept/reports', label: 'Reports', icon: ChartColumn },
    { to: '/dept/activity', label: 'Activity Log', icon: History },
  ],
  SUPER_ADMIN: [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/faculties', label: 'Faculties', icon: Building2 },
    { to: '/admin/departments', label: 'Departments', icon: Network },
    { to: '/admin/programmes', label: 'Programmes', icon: Layers },
    { to: '/admin/sessions', label: 'Sessions & Semesters', icon: CalendarDays },
    { to: '/admin/users', label: 'Users', icon: Users },
    { to: '/admin/courses', label: 'Courses', icon: BookOpen },
    { to: '/admin/offerings', label: 'Course Offerings', icon: CalendarCheck },
    { to: '/admin/registrations', label: 'Registrations', icon: List },
    { to: '/admin/results', label: 'Result Approvals', icon: SquareCheckBig },
    { to: '/admin/reports', label: 'Reports', icon: ChartColumn },
    { to: '/admin/audit', label: 'Audit Log', icon: History },
    { to: '/admin/grading', label: 'Grading Scale', icon: SlidersHorizontal },
    { to: '/admin/roles', label: 'Roles & Permissions', icon: Shield },
  ],
};

/** The nav item whose path is the longest prefix of the current location. */
export function activeItem(role: Role, pathname: string): NavItem | undefined {
  return NAV[role]
    .filter((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0];
}
