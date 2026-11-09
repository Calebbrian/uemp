import type { Role } from './types';

export const ROLE_LABEL: Record<Role, string> = {
  STUDENT: 'Student',
  LECTURER: 'Lecturer',
  DEPT_ADMIN: 'Department Admin',
  SUPER_ADMIN: 'Super Admin',
};

export const ROLE_HOME: Record<Role, string> = {
  STUDENT: '/student',
  LECTURER: '/lecturer',
  DEPT_ADMIN: '/dept',
  SUPER_ADMIN: '/admin',
};

export const fullName = (u: { title?: string | null; firstName: string; lastName: string }) =>
  [u.title, u.firstName, u.lastName].filter(Boolean).join(' ');

export const initials = (u: { firstName: string; lastName: string }) =>
  `${u.firstName[0] ?? ''}${u.lastName[0] ?? ''}`.toUpperCase();

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const longDateFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export const formatDate = (value?: string | Date | null) => (value ? dateFmt.format(new Date(value)) : '—');
export const formatDateTime = (value?: string | Date | null) => (value ? dateTimeFmt.format(new Date(value)) : '—');
export const formatLongDate = (value: string | Date) => longDateFmt.format(new Date(value));

export function timeAgo(value: string | Date) {
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatDate(value);
}

export const gpaText = (value: number | null | undefined) => (value === null || value === undefined ? '—' : value.toFixed(2));

export const levelLabel = (level: number) => `${level} Level`;

export const plural = (n: number, word: string, pluralWord = `${word}s`) => `${n} ${n === 1 ? word : pluralWord}`;
