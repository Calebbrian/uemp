import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronDown, GraduationCap, Lock, LogOut, Menu, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useUser, useAuth } from '../../lib/auth';
import { fullName, initials, ROLE_HOME, ROLE_LABEL } from '../../lib/format';
import type { Me, Semester } from '../../lib/types';
import { activeItem, NAV } from './nav';
import { cx } from '../ui/primitives';
import { Button } from '../ui/primitives';
import { TextField, useForm } from '../ui/form';
import { Drawer } from '../ui/overlay';
import { useToast } from '../ui/toast';

export function useCurrentSemester() {
  return useQuery({
    queryKey: ['current-semester'],
    queryFn: () => api.get<{ semester: Semester | null }>('/meta/current-semester'),
    staleTime: 60 * 1000,
  });
}

function Logo({ to }: { to: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 px-1.5 text-ink! no-underline">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand text-white">
        <GraduationCap className="size-5" aria-hidden />
      </span>
      <span className="flex flex-col">
        <span className="text-base font-bold tracking-[0.02em]">UEMP</span>
        <span className="text-[11px] leading-[14px] text-muted">University Education Management Portal</span>
      </span>
    </Link>
  );
}

function ScopeCard({ user }: { user: Me }) {
  if (user.role === 'DEPT_ADMIN' && user.department) {
    return (
      <div className="flex flex-col gap-0.5 rounded-lg border border-line bg-surface px-3 py-2.5">
        <span className="text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">Department</span>
        <span className="text-sm font-semibold">{user.department.name}</span>
        <span className="text-xs text-muted">{user.department.faculty.name}</span>
      </div>
    );
  }
  if (user.role === 'SUPER_ADMIN') {
    return (
      <div className="flex flex-col gap-0.5 rounded-lg border border-line bg-surface px-3 py-2.5">
        <span className="text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">Scope</span>
        <span className="text-sm font-semibold">University-wide</span>
        <span className="text-xs text-muted">All faculties and departments</span>
      </div>
    );
  }
  if (user.role === 'STUDENT' && user.student) {
    return (
      <div className="flex flex-col gap-0.5 rounded-lg bg-surface px-3 py-2.5 text-[13px]">
        <strong className="text-sm">{fullName(user)}</strong>
        <span className="text-muted">
          {user.student.matricNo} · {user.student.level} Level
        </span>
      </div>
    );
  }
  return null;
}

function NavList({ user, onNavigate }: { user: Me; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main">
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {NAV[user.role].map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cx(
                  'flex h-10 items-center gap-2.5 rounded-md px-3 text-sm no-underline',
                  isActive ? 'bg-brand-50 font-semibold text-brand!' : 'font-medium text-ink-2! hover:bg-[#F1F4F2]',
                )
              }
            >
              <item.icon className="size-[18px] shrink-0" aria-hidden />
              <span>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ChangePasswordDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const form = useForm({ currentPassword: '', newPassword: '', confirm: '' });
  const mutation = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword: form.values.currentPassword, newPassword: form.values.newPassword }),
    onSuccess: () => {
      toast.success('Password changed', 'Other devices have been signed out.');
      form.reset();
      onClose();
    },
    onError: (err) => {
      if (!form.applyError(err)) toast.error('Couldn’t change password', (err as Error).message);
    },
  });
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Change password"
      onSubmit={() => {
        if (form.values.newPassword !== form.values.confirm) {
          form.setErrors({ confirm: 'Passwords do not match' });
          return;
        }
        mutation.mutate();
      }}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Change password
          </Button>
        </>
      }
    >
      <TextField label="Current password" type="password" autoComplete="current-password" required {...form.bind('currentPassword')} />
      <TextField label="New password" type="password" autoComplete="new-password" required help="At least 8 characters, with letters and numbers." {...form.bind('newPassword')} />
      <TextField label="Confirm new password" type="password" autoComplete="new-password" required {...form.bind('confirm')} />
    </Drawer>
  );
}

function UserMenu({ user, onChangePassword }: { user: Me; onChangePassword: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent pr-2 pl-1 text-ink hover:bg-surface"
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-brand-50 text-[13px] font-bold text-brand">{initials(user)}</span>
        <span className="hidden flex-col items-start leading-4 md:flex">
          <span className="text-sm font-semibold">{fullName(user)}</span>
          <span className="text-xs text-muted">{ROLE_LABEL[user.role]}</span>
        </span>
        <ChevronDown className="size-4" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute top-[52px] right-0 z-20 flex w-[260px] flex-col gap-0.5 rounded-xl border border-line bg-white p-2 shadow-overlay">
          <div className="mb-1 flex flex-col gap-0.5 border-b border-line-soft px-3 pt-2.5 pb-3">
            <span className="text-sm font-semibold">{fullName(user)}</span>
            <span className="text-[13px] text-muted">
              {ROLE_LABEL[user.role]} · {user.department?.name ?? 'All departments'}
            </span>
            <span className="text-xs text-muted">{user.email}</span>
          </div>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              onChangePassword();
            }}
            className="flex h-10 cursor-pointer items-center gap-2.5 rounded-md border-0 bg-transparent px-3 text-left text-sm text-ink hover:bg-surface"
          >
            <Lock className="size-4" aria-hidden />
            Change password
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={async () => {
              await signOut();
              navigate('/login', { replace: true });
            }}
            className="flex h-10 cursor-pointer items-center gap-2.5 rounded-md border-0 bg-transparent px-3 text-left text-sm text-danger-ink hover:bg-surface"
          >
            <LogOut className="size-4" aria-hidden />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  const user = useUser();
  const location = useLocation();
  const semester = useCurrentSemester();
  const [menuOpen, setMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const crumb = activeItem(user.role, location.pathname)?.label ?? 'Dashboard';
  const home = ROLE_HOME[user.role];

  useEffect(() => {
    document.title = `${crumb} · UEMP`;
  }, [crumb]);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className="flex min-h-dvh">
      <div className="no-print hidden w-[248px] shrink-0 border-r border-line bg-white lg:block">
        <aside className="sticky top-0 flex h-dvh flex-col gap-[18px] overflow-y-auto px-3.5 pt-5 pb-6">
          <Logo to={home} />
          <ScopeCard user={user} />
          <NavList user={user} />
        </aside>
      </div>

      {menuOpen && (
        <div className="no-print fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 cursor-default border-0 bg-[rgba(16,24,20,.45)]" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[300px] max-w-[85vw] flex-col gap-4 overflow-y-auto bg-white px-3 pt-3 pb-5 shadow-overlay">
            <div className="flex items-center justify-between">
              <Logo to={home} />
              <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} className="flex size-11 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent">
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <ScopeCard user={user} />
            <NavList user={user} onNavigate={() => setMenuOpen(false)} />
            <span className="flex-1" />
            <button type="button" onClick={() => setPasswordOpen(true)} className="flex h-12 cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-3.5 text-[15px] font-medium text-ink-2">
              <Lock className="size-5" aria-hidden /> Change password
            </button>
            <button
              type="button"
              onClick={async () => {
                await signOut();
                navigate('/login', { replace: true });
              }}
              className="flex h-12 cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-3.5 text-[15px] font-medium text-danger-ink"
            >
              <LogOut className="size-5" aria-hidden /> Log out
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex min-h-[60px] items-center gap-3 border-b border-line bg-white py-2 pr-2 pl-1 md:min-h-16 md:px-8">
          <button type="button" aria-label="Open menu" onClick={() => setMenuOpen(true)} className="flex size-11 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent lg:hidden">
            <Menu className="size-[22px]" aria-hidden />
          </button>
          <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-2 text-sm">
            <span className="hidden text-muted sm:inline">{ROLE_LABEL[user.role]}</span>
            <span className="hidden text-faint sm:inline" aria-hidden>
              /
            </span>
            <span className="truncate text-base font-semibold sm:text-sm">{crumb}</span>
          </nav>
          {semester.data?.semester && (
            <span className="hidden h-8 items-center gap-1.5 rounded-full border border-line-strong px-3 text-[13px] font-medium whitespace-nowrap md:inline-flex">
              <CalendarDays className="size-[15px] text-brand" aria-hidden />
              {semester.data.semester.label}
            </span>
          )}
          <UserMenu user={user} onChangePassword={() => setPasswordOpen(true)} />
        </header>
        <main id="main" className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col gap-6 px-4 py-5 md:px-8 md:py-7">
          <Outlet />
        </main>
      </div>
      <ChangePasswordDrawer open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  );
}
