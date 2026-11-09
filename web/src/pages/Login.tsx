import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { Eye, EyeOff, GraduationCap, TriangleAlert } from 'lucide-react';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ROLE_HOME } from '../lib/format';
import type { Me } from '../lib/types';
import { Button, cx } from '../components/ui/primitives';

const DEMO_PASSWORD = 'Password@123';

const DEMO_ACCOUNTS = [
  { role: 'Super Admin', name: 'Grace Adeyemi', email: 'admin@uemp.test' },
  { role: 'Department Admin', name: 'Dr. Emeka Nwosu', email: 'csc.admin@uemp.test' },
  { role: 'Lecturer', name: 'Dr. Tunde Bakare', email: 'lecturer@uemp.test' },
  { role: 'Student', name: 'Adaeze Okafor', email: 'student@uemp.test' },
];

const inputCls = 'h-11 w-full rounded-md border border-line-strong bg-white px-3 text-[15px] text-ink';

export function LoginPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<{ text: string; tone: 'error' | 'warning' } | null>(null);
  const [busy, setBusy] = useState(false);

  // Only follow ?next= into the signed-in user's own area.
  const destination = (role: Me['role']) => {
    const home = ROLE_HOME[role];
    const next = params.get('next');
    return next && (next === home || next.startsWith(`${home}/`)) ? next : home;
  };

  if (user) return <Navigate to={destination(user.role)} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError({ text: 'Enter your email and password.', tone: 'error' });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const me = await signIn(email.trim(), password);
      navigate(destination(me.role), { replace: true });
    } catch (err) {
      const rateLimited = err instanceof ApiError && err.status === 429;
      const fieldMessage = err instanceof ApiError ? Object.values(err.fields)[0] : undefined;
      setError({ text: fieldMessage ?? (err instanceof Error ? err.message : 'Sign in failed.'), tone: rateLimited ? 'warning' : 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-wrap bg-surface">
      <section className="flex min-w-0 flex-[1_1_420px] flex-col justify-between gap-10 bg-brand px-6 py-10 text-white sm:px-[clamp(24px,5vw,72px)] sm:py-14">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-[10px] bg-white text-brand">
            <GraduationCap className="size-6" aria-hidden />
          </span>
          <span className="text-xl font-bold tracking-[0.03em]">UEMP</span>
        </div>
        <div className="flex max-w-[460px] flex-col gap-4">
          <h1 className="m-0 text-[clamp(28px,3.2vw,40px)] leading-[1.15] font-bold tracking-[-0.01em] text-balance">University Education Management Portal</h1>
          <p className="m-0 text-[17px] leading-[26px] text-[#D3E7DB]">
            Course registration, score sheets and result approval for every department, in one place.
          </p>
        </div>
        <p className="m-0 text-[13px] text-[#B9D6C5]">Secure access for students, lecturers and administrators.</p>
      </section>

      <main className="flex min-w-0 flex-[999_1_520px] items-center justify-center px-4 py-12">
        <div className="flex w-full max-w-[440px] flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <h2 className="m-0 text-2xl font-semibold">Sign in</h2>
            <p className="m-0 text-sm text-muted">Use the email and password issued by the registry.</p>
          </div>

          {error && (
            <div
              role="alert"
              className={cx(
                'flex gap-2.5 rounded-lg border px-3.5 py-3 text-sm',
                error.tone === 'warning' ? 'border-[#EBCB85] bg-sub-bg text-[#5C3900]' : 'border-danger-line bg-danger-50 text-[#7F1A13]',
              )}
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{error.text}</span>
            </div>
          )}

          <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-[13px] font-semibold text-ink-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                className={inputCls}
                placeholder="name@uemp.test"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-[13px] font-semibold text-ink-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className={cx(inputCls, 'pr-[84px]')}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute top-1 right-1 flex h-9 cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent px-3 text-[13px] font-semibold text-brand"
                >
                  {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <Button type="submit" loading={busy} className="h-11 w-full text-[15px]">
              Sign in
            </Button>
          </form>

          <section aria-labelledby="demo-title" className="overflow-hidden rounded-lg border border-line bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-subtle px-4 py-3.5">
              <h3 id="demo-title" className="m-0 text-sm font-semibold">
                Demo accounts for evaluators
              </h3>
              <span className="text-[13px] text-ink-2">
                Password for all: <code className="rounded bg-brand-50 px-1.5 py-0.5 font-mono text-brand">{DEMO_PASSWORD}</code>
              </span>
            </div>
            <ul className="m-0 list-none p-0">
              {DEMO_ACCOUNTS.map((d) => (
                <li key={d.email} className="flex items-center gap-3 border-b border-line-soft px-4 py-3 last:border-b-0">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-semibold">{d.role}</span>
                    <span className="truncate text-[13px] text-muted">
                      {d.name} · {d.email}
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label={`Use the ${d.role} account`}
                    onClick={() => {
                      setEmail(d.email);
                      setPassword(DEMO_PASSWORD);
                      setError(null);
                    }}
                    className="h-9 shrink-0 cursor-pointer rounded-lg border border-line-strong bg-white px-3 text-[13px] font-semibold whitespace-nowrap text-brand hover:bg-brand-50"
                  >
                    Use this account
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
