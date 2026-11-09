import { ShieldX } from 'lucide-react';
import { useNavigate } from 'react-router';
import { ButtonLink, Button } from '../components/ui/primitives';
import { useAuth } from '../lib/auth';
import { fullName, ROLE_HOME, ROLE_LABEL } from '../lib/format';

function ErrorCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface p-4">
      <main className="flex w-full max-w-[640px] flex-col items-center justify-center gap-4 rounded-xl border border-line bg-white px-6 py-12 text-center sm:px-12">
        {children}
      </main>
    </div>
  );
}

export function Forbidden({ inShell }: { inShell?: boolean }) {
  const { user } = useAuth();
  const body = (
    <>
      <span className="flex size-16 items-center justify-center rounded-full bg-danger-50 text-danger-ink">
        <ShieldX className="size-[30px]" aria-hidden />
      </span>
      <span className="text-[13px] font-semibold tracking-[0.08em] text-muted">ERROR 403 · ACCESS DENIED</span>
      <h1 className="m-0 max-w-[420px] text-[28px] font-bold text-balance">You don’t have permission to view this page</h1>
      {user && (
        <p className="m-0 max-w-[420px] text-[15px] leading-[23px] text-muted">
          You’re signed in as{' '}
          <strong className="text-ink">
            {fullName(user)} ({ROLE_LABEL[user.role]})
          </strong>
          . This page belongs to another role.
        </p>
      )}
      <ButtonLink to={user ? ROLE_HOME[user.role] : '/login'}>{user ? 'Back to my dashboard' : 'Sign in'}</ButtonLink>
    </>
  );
  if (inShell) return <div className="flex flex-col items-center gap-4 rounded-xl border border-line bg-white px-6 py-12 text-center">{body}</div>;
  return <ErrorCard>{body}</ErrorCard>;
}

export function NotFound() {
  const { user } = useAuth();
  const navigate = useNavigate();
  return (
    <ErrorCard>
      <span className="num text-[72px] leading-none font-bold tracking-[-0.02em] text-brand">404</span>
      <span className="text-[13px] font-semibold tracking-[0.08em] text-muted">PAGE NOT FOUND</span>
      <h1 className="m-0 max-w-[420px] text-[28px] font-bold">We couldn’t find that page</h1>
      <p className="m-0 max-w-[420px] text-[15px] leading-[23px] text-muted">
        The link may be old, or the page may have moved. Check the address or go back to your dashboard.
      </p>
      <div className="flex flex-wrap justify-center gap-2.5">
        <Button variant="secondary" onClick={() => navigate(-1)}>
          Go back
        </Button>
        <ButtonLink to={user ? ROLE_HOME[user.role] : '/login'}>{user ? 'My dashboard' : 'Sign in'}</ButtonLink>
      </div>
    </ErrorCard>
  );
}
