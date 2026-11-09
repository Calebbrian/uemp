import type { ButtonHTMLAttributes, ComponentType, ReactNode } from 'react';
import { CircleX, Info, LoaderCircle, TriangleAlert, type LucideProps } from 'lucide-react';
import { Link } from 'react-router';
import type { AccountStatus, ResultStatus } from '../../lib/types';

export const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');

type Icon = ComponentType<LucideProps>;

// Buttons ---------------------------------------------------------------------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'sm';
  icon?: Icon;
  loading?: boolean;
};

const VARIANTS = {
  primary: 'border-transparent bg-brand text-white hover:bg-brand-hover',
  secondary: 'border-line-strong bg-white text-ink hover:bg-surface',
  ghost: 'border-transparent bg-transparent text-ink hover:bg-[#EEF1EF]',
  danger: 'border-transparent bg-danger text-white hover:bg-[#9A1D14]',
};

export function buttonClass(variant: ButtonProps['variant'] = 'primary', size: ButtonProps['size'] = 'md') {
  return cx(
    'inline-flex items-center justify-center gap-2 rounded-lg border font-semibold whitespace-nowrap cursor-pointer transition-colors no-underline',
    'disabled:opacity-45 disabled:cursor-not-allowed',
    size === 'md' ? 'h-10 px-4 text-sm' : 'h-8 px-3 text-[13px]',
    VARIANTS[variant],
  );
}

export function Button({ variant = 'primary', size = 'md', icon: IconCmp, loading, children, className, disabled, ...rest }: ButtonProps) {
  return (
    <button type="button" className={cx(buttonClass(variant, size), className)} disabled={disabled || loading} {...rest}>
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : IconCmp && <IconCmp className="size-4" aria-hidden />}
      {children}
    </button>
  );
}

export function IconButton({ label, icon: IconCmp, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: Icon }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx(buttonClass('ghost', 'sm'), 'w-8 px-0', className)} {...rest}>
      <IconCmp className="size-4" aria-hidden />
    </button>
  );
}

export function ButtonLink({ to, variant = 'primary', size = 'md', icon: IconCmp, children }: { to: string; variant?: ButtonProps['variant']; size?: ButtonProps['size']; icon?: Icon; children: ReactNode }) {
  return (
    <Link to={to} className={cx(buttonClass(variant, size), variant === 'primary' ? 'text-white! hover:text-white!' : 'text-ink! hover:text-ink!')}>
      {IconCmp && <IconCmp className="size-4" aria-hidden />}
      {children}
    </Link>
  );
}

// Badges and tags -------------------------------------------------------------

const TONES = {
  draft: 'bg-draft-bg text-draft-fg',
  sub: 'bg-sub-bg text-sub-fg',
  ok: 'bg-ok-bg text-ok-fg',
  rej: 'bg-danger-50 text-danger-ink',
  info: 'bg-info-bg text-info-fg',
} as const;

export type Tone = keyof typeof TONES;

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-[9px] text-xs font-semibold whitespace-nowrap',
        "before:size-1.5 before:rounded-full before:bg-current before:content-['']",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

const STATUS: Record<ResultStatus | AccountStatus, { tone: Tone; label: string }> = {
  DRAFT: { tone: 'draft', label: 'Draft' },
  SUBMITTED: { tone: 'sub', label: 'Submitted' },
  APPROVED: { tone: 'ok', label: 'Approved' },
  REJECTED: { tone: 'rej', label: 'Rejected' },
  ACTIVE: { tone: 'ok', label: 'Active' },
  INACTIVE: { tone: 'draft', label: 'Inactive' },
  SUSPENDED: { tone: 'rej', label: 'Suspended' },
};

export function StatusBadge({ status }: { status: ResultStatus | AccountStatus }) {
  const s = STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function RegistrationBadge({ open }: { open: boolean }) {
  return <Badge tone={open ? 'ok' : 'draft'}>{open ? 'Registration open' : 'Registration closed'}</Badge>;
}

export function Tag({ kind, children }: { kind: 'core' | 'elective' | 'neutral'; children: ReactNode }) {
  const tone = { core: 'bg-brand-50 text-brand', elective: 'bg-info-bg text-elective-fg', neutral: 'bg-draft-bg text-draft-fg' }[kind];
  return <span className={cx('inline-block rounded px-2 py-[3px] text-xs font-semibold', tone)}>{children}</span>;
}

// Layout pieces ---------------------------------------------------------------

export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-lg border border-line bg-white', className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionCard({ title, action, children, className, bodyClass }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <Card className={cx('flex flex-col', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 className="m-0 text-[15px] font-semibold">{title}</h2>
        {action}
      </div>
      <div className={cx('flex-1', bodyClass ?? 'p-5')}>{children}</div>
    </Card>
  );
}

export function PageHeader({ title, description, actions, breadcrumb }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; breadcrumb?: { label: string; to?: string }[] }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        {breadcrumb && (
          <nav aria-label="Breadcrumb" className="flex flex-wrap gap-1.5 text-[13px] text-muted">
            {breadcrumb.map((b, i) => (
              <span key={i} className="flex gap-1.5">
                {i > 0 && <span aria-hidden>/</span>}
                {b.to ? (
                  <Link to={b.to} className="text-muted! hover:text-ink!">
                    {b.label}
                  </Link>
                ) : (
                  <span>{b.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="m-0 text-2xl font-semibold tracking-[-0.01em]">{title}</h1>
        {description && <p className="m-0 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, sub, icon: IconCmp, highlight, loading, to }: { label: string; value: ReactNode; sub?: ReactNode; icon?: Icon; highlight?: boolean; loading?: boolean; to?: string }) {
  const body = (
    <div className={cx('flex h-full flex-col gap-1.5 rounded-lg border p-5', highlight ? 'border-sub-line bg-[#FFFBF0]' : 'border-line bg-white')}>
      <div className="flex items-center justify-between gap-2">
        <span className={cx('text-[13px]', highlight ? 'font-semibold text-sub-fg' : 'font-medium text-muted')}>{label}</span>
        {IconCmp && <IconCmp className={cx('size-4 shrink-0', highlight ? 'text-sub-fg' : 'text-brand-600')} aria-hidden />}
      </div>
      {loading ? (
        <>
          <Skeleton className="h-[30px] w-[90px]" />
          <Skeleton className="h-3 w-[140px]" />
        </>
      ) : (
        <>
          <span className={cx('num text-[30px] leading-9 font-bold', highlight ? 'text-[#5C3900]' : 'text-ink')}>{value}</span>
          {sub && <span className={cx('text-[13px]', highlight ? 'text-sub-fg' : 'text-ink-2')}>{sub}</span>}
        </>
      )}
    </div>
  );
  return to ? (
    <Link to={to} className="block no-underline text-inherit! hover:[&>div]:border-line-strong">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span className={cx('block animate-pulse rounded-md bg-draft-bg', className)} aria-hidden />;
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted" role="status">
      <LoaderCircle className="size-5 animate-spin" aria-hidden />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

// Banners and empty states ------------------------------------------------------

const BANNERS = {
  info: { cls: 'bg-info-bg border-info-line text-info-fg', icon: Info, role: 'status' },
  warning: { cls: 'bg-sub-bg border-[#EBCB85] text-[#5C3900]', icon: TriangleAlert, role: 'status' },
  error: { cls: 'bg-danger-50 border-danger-line text-[#7F1A13]', icon: CircleX, role: 'alert' },
  success: { cls: 'bg-ok-bg border-[#A9D8BA] text-ok-fg', icon: Info, role: 'status' },
} as const;

export function Banner({ kind = 'info', title, children, action }: { kind?: keyof typeof BANNERS; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const b = BANNERS[kind];
  const IconCmp = b.icon;
  return (
    <div role={b.role} className={cx('flex gap-3 rounded-lg border px-4 py-3.5', b.cls)}>
      <IconCmp className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex flex-1 flex-col gap-1 text-sm">
        {title && <strong>{title}</strong>}
        {children && <div>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ icon: IconCmp, message, action, tone = 'brand' }: { icon: Icon; message: ReactNode; action?: ReactNode; tone?: 'brand' | 'muted' | 'danger' }) {
  const toneCls = { brand: 'bg-brand-50 text-brand', muted: 'bg-surface text-muted', danger: 'bg-danger-50 text-danger' }[tone];
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <span className={cx('flex size-12 items-center justify-center rounded-full', toneCls)}>
        <IconCmp className="size-[22px]" aria-hidden />
      </span>
      <p className="m-0 max-w-sm text-sm text-ink-2">{message}</p>
      {action}
    </div>
  );
}

export function DescriptionList({ items, columns = 2 }: { items: { label: string; value: ReactNode }[]; columns?: number }) {
  return (
    <dl className="m-0 grid gap-x-6 gap-y-4" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${columns > 2 ? 160 : 200}px, 1fr))` }}>
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-col gap-1">
          <dt className="text-xs font-semibold tracking-[0.04em] text-muted uppercase">{item.label}</dt>
          <dd className="m-0 text-sm font-medium break-words text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
