import { useEffect, useState, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDateTime, formatLongDate, ROLE_LABEL } from '../../lib/format';
import type { AuditEntry, Paged } from '../../lib/types';
import { Button, cx, EmptyState, PageHeader } from '../../components/ui/primitives';
import { FilterSelect, inputClass, SearchInput } from '../../components/ui/form';
import { Drawer } from '../../components/ui/overlay';
import { DataTable, Pagination, type Column } from '../../components/ui/table';
import { CsvButton, DepartmentFilter, useAdminScope } from '../../components/shared';

const ACTION_TONE: Record<string, string> = {
  RESULT_SUBMITTED: 'bg-sub-bg text-sub-fg',
  RESULT_APPROVED: 'bg-ok-bg text-ok-fg',
  REGISTRATION_OPENED: 'bg-ok-bg text-ok-fg',
  USER_CREATED: 'bg-ok-bg text-ok-fg',
  COURSES_REGISTERED: 'bg-ok-bg text-ok-fg',
  RESULT_REJECTED: 'bg-danger-50 text-danger-ink',
  RESULT_REOPENED: 'bg-danger-50 text-danger-ink',
  LOGIN_FAILED: 'bg-danger-50 text-danger-ink',
  USER_STATUS_CHANGED: 'bg-danger-50 text-danger-ink',
  COURSE_DROPPED: 'bg-sub-bg text-sub-fg',
};

function ActionChip({ action, label }: { action: string; label: string }) {
  return <span className={cx('rounded px-2 py-[3px] text-xs font-semibold whitespace-nowrap', ACTION_TONE[action] ?? 'bg-[#EEF1EF] text-ink-2')}>{label}</span>;
}

function useDebounced<T>(value: T, ms = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// Metadata rendering -----------------------------------------------------------

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

const isRecord = (v: unknown): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);

const STATUS_AFTER: Record<string, string> = {
  RESULT_SUBMITTED: 'SUBMITTED',
  RESULT_APPROVED: 'APPROVED',
  RESULT_REJECTED: 'REJECTED',
  RESULT_REOPENED: 'REJECTED',
};

const FIELD_LABELS: Record<string, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  phone: 'Phone',
  title: 'Title',
  matricNo: 'Matric number',
  programId: 'Programme',
  departmentId: 'Department',
  level: 'Level',
  entryYear: 'Entry year',
  staffId: 'Staff ID',
  rank: 'Rank',
  units: 'Units',
  code: 'Code',
  name: 'Name',
  isActive: 'Active',
  capacity: 'Capacity',
  startDate: 'Start date',
  endDate: 'End date',
  durationYears: 'Duration (years)',
  award: 'Award',
  term: 'Semester',
  totalUnits: 'Total units',
  courses: 'Courses',
  semesterId: 'Semester',
  students: 'Students',
  reason: 'Reason',
  role: 'Role',
};

const humanize = (key: string) => FIELD_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

function show(value: Json | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.map((v) => (isRecord(v) ? JSON.stringify(v) : show(v))).join(', ') : '—';
  if (isRecord(value)) return JSON.stringify(value);
  const text = String(value);
  return text.replace(/_/g, ' ').replace(/^(ACTIVE|INACTIVE|SUSPENDED|DRAFT|SUBMITTED|APPROVED|REJECTED|STUDENT|LECTURER|DEPT ADMIN|SUPER ADMIN)$/, (m) => m.charAt(0) + m.slice(1).toLowerCase());
}

function Before({ children }: { children: ReactNode }) {
  return <span className="rounded bg-danger-50 px-1.5 py-0.5 text-[#7F1A13] line-through">{children}</span>;
}

function After({ children }: { children: ReactNode }) {
  return <span className="rounded bg-ok-bg px-1.5 py-0.5 font-semibold text-[#0B4526]">{children}</span>;
}

function DiffTable({ rows }: { rows: { field: ReactNode; before: ReactNode; after: ReactNode }[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {['Field', 'Before', 'After'].map((h) => (
              <th key={h} scope="col" className="border-b border-line bg-subtle px-3.5 py-2.5 text-left text-xs font-semibold tracking-[0.04em] text-[#555F5A] uppercase">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="num">
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="border-b border-line-soft px-3.5 py-2.5 last:border-b-0">{r.field}</td>
              <td className="border-b border-line-soft px-3.5 py-2.5">{r.before}</td>
              <td className="border-b border-line-soft px-3.5 py-2.5">{r.after}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type ScoreChange = { matricNo: string; before: { ca: number | null; exam: number | null }; after: { ca: number | null; exam: number | null } };

const isScoreChanges = (v: Json | undefined): v is Json[] =>
  Array.isArray(v) && v.every((c) => isRecord(c) && 'matricNo' in c && isRecord(c.before) && isRecord(c.after));

const isBands = (v: Json | undefined): v is Json[] => Array.isArray(v) && v.every((b) => isRecord(b) && 'grade' in b && 'minScore' in b);

const bandText = (bands: Json[]) =>
  bands
    .filter(isRecord)
    .map((b) => `${b.grade} ${b.minScore}–${b.maxScore} (${b.point})`)
    .join(', ');

function MetadataView({ entry }: { entry: AuditEntry }) {
  const meta = entry.metadata;
  if (!isRecord(meta)) return null;
  const sections: ReactNode[] = [];
  const handled = new Set<string>();

  if (isScoreChanges(meta.changes)) {
    handled.add('changes');
    const changes = meta.changes as unknown as ScoreChange[];
    sections.push(
      <div key="scores" className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Score changes ({changes.length})</span>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {['Student', 'CA', 'Exam'].map((h) => (
                  <th key={h} scope="col" className="border-b border-line bg-subtle px-3.5 py-2.5 text-left text-xs font-semibold tracking-[0.04em] text-[#555F5A] uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="num">
              {changes.map((c) => (
                <tr key={c.matricNo}>
                  <td className="border-b border-line-soft px-3.5 py-2.5 font-medium whitespace-nowrap">{c.matricNo}</td>
                  {(['ca', 'exam'] as const).map((k) => (
                    <td key={k} className="border-b border-line-soft px-3.5 py-2.5 whitespace-nowrap">
                      {c.before[k] === c.after[k] ? (
                        <span className="text-muted">{c.after[k] ?? '—'}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <Before>{c.before[k] ?? '—'}</Before>
                          <span aria-hidden>→</span>
                          <span className="sr-only">changed to</span>
                          <After>{c.after[k] ?? '—'}</After>
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>,
    );
  } else if (isRecord(meta.changes)) {
    handled.add('changes');
    const fields = Object.entries(meta.changes).filter(([, v]) => v !== undefined);
    if (fields.length) {
      sections.push(
        <div key="fields" className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Changed fields</span>
          <dl className="m-0 grid grid-cols-[minmax(110px,auto)_1fr] gap-x-3 gap-y-2 rounded-lg bg-subtle px-3.5 py-3 text-sm">
            {fields.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{humanize(k)}</dt>
                <dd className="m-0 font-medium break-words">{show(v)}</dd>
              </div>
            ))}
          </dl>
        </div>,
      );
    }
  }

  const diffRows: { field: ReactNode; before: ReactNode; after: ReactNode }[] = [];
  if ('from' in meta && 'to' in meta) {
    handled.add('from').add('to');
    const field = entry.action === 'USER_ROLE_CHANGED' ? 'Role' : entry.action === 'USER_STATUS_CHANGED' ? 'Status' : 'Value';
    diffRows.push({ field, before: <Before>{show(meta.from)}</Before>, after: <After>{show(meta.to)}</After> });
  }
  if ('previousStatus' in meta) {
    handled.add('previousStatus');
    const after = STATUS_AFTER[entry.action];
    if (after) diffRows.push({ field: 'Status', before: <Before>{show(meta.previousStatus)}</Before>, after: <After>{show(after)}</After> });
  }
  if (isBands(meta.before) && isBands(meta.after)) {
    handled.add('before').add('after');
    diffRows.push({ field: 'Grading scale', before: <Before>{bandText(meta.before)}</Before>, after: <After>{bandText(meta.after)}</After> });
  } else if (Array.isArray(meta.before) && Array.isArray(meta.after)) {
    handled.add('before').add('after');
    diffRows.push({
      field: entry.action === 'LECTURERS_ASSIGNED' ? 'Lecturers (account IDs)' : 'Value',
      before: <Before>{meta.before.length ? meta.before.length + ' assigned' : 'None'}</Before>,
      after: <After>{meta.after.length ? meta.after.length + ' assigned' : 'None'}</After>,
    });
  }
  if (diffRows.length) {
    sections.push(
      <div key="diff" className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Changes</span>
        <DiffTable rows={diffRows} />
      </div>,
    );
  }

  const note = [meta.comment, meta.reason].find((v) => typeof v === 'string' && v.trim());
  handled.add('comment').add('reason');
  if (typeof note === 'string') {
    sections.push(
      <div key="note" className="rounded-md bg-subtle px-3 py-2.5 text-sm">
        “{note}”
      </div>,
    );
  }

  const rest = Object.entries(meta).filter(([k, v]) => !handled.has(k) && v !== null && v !== undefined && !k.endsWith('Id'));
  if (rest.length) {
    sections.push(
      <div key="rest" className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Details</span>
        <dl className="m-0 grid grid-cols-[minmax(110px,auto)_1fr] gap-x-3 gap-y-2 text-sm">
          {rest.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{humanize(k)}</dt>
              <dd className="m-0 font-medium break-words">{show(v)}</dd>
            </div>
          ))}
        </dl>
      </div>,
    );
  }

  return sections.length ? <>{sections}</> : null;
}

function EntryDrawer({ entry, onClose }: { entry: AuditEntry | null; onClose: () => void }) {
  return (
    <Drawer open={!!entry} onClose={onClose} title={entry?.label ?? 'Audit entry'}>
      {entry && (
        <>
          <p className="m-0 text-sm text-ink-2">{entry.summary}</p>
          <dl className="m-0 grid grid-cols-[110px_1fr] gap-x-3 gap-y-2.5 text-sm">
            <dt className="text-[13px] font-medium text-muted">Time</dt>
            <dd className="num m-0">
              {formatLongDate(entry.createdAt)}, {new Date(entry.createdAt).toLocaleTimeString('en-GB')}
            </dd>
            <dt className="text-[13px] font-medium text-muted">Actor</dt>
            <dd className="m-0">
              {entry.actor ? (
                <>
                  {entry.actor.name}
                  {entry.actorRole && ` (${ROLE_LABEL[entry.actorRole]})`}
                  <div className="text-xs text-muted">{entry.actor.email}</div>
                </>
              ) : (
                <span className="text-muted">System or signed-out user</span>
              )}
            </dd>
            <dt className="text-[13px] font-medium text-muted">Department</dt>
            <dd className="m-0">{entry.department?.code ?? 'University-wide'}</dd>
            <dt className="text-[13px] font-medium text-muted">Record</dt>
            <dd className="m-0">{entry.entityType}</dd>
            <dt className="text-[13px] font-medium text-muted">IP address</dt>
            <dd className="num m-0 font-mono text-[13px]">{entry.ipAddress ?? '—'}</dd>
          </dl>
          <MetadataView entry={entry} />
          <p className="m-0 text-xs text-muted">Audit entries are append-only and cannot be edited or deleted.</p>
        </>
      )}
    </Drawer>
  );
}

// Page ------------------------------------------------------------------------

export function AuditLogPage() {
  const { isSuper } = useAdminScope();
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const q = useDebounced(search.trim());

  useEffect(() => setPage(1), [action, from, to, departmentId, q]);

  const filters = { action, from, to, departmentId, q };

  const actions = useQuery({
    queryKey: ['audit-actions'],
    queryFn: () => api.get<{ items: { value: string; label: string }[] }>('/audit-logs/actions'),
    staleTime: Infinity,
  });

  const query = useQuery({
    queryKey: ['audit-logs', { ...filters, page }],
    queryFn: () => api.get<Paged<AuditEntry>>('/audit-logs', { ...filters, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });

  const columns: Column<AuditEntry>[] = [
    {
      key: 'time',
      header: 'Time',
      render: (e) => (
        <button
          type="button"
          onClick={(ev) => {
            ev.stopPropagation();
            setSelected(e);
          }}
          aria-label={`Open details: ${e.label}, ${formatDateTime(e.createdAt)}`}
          className="num cursor-pointer border-0 bg-transparent p-0 text-left text-ink-2 underline-offset-2 hover:underline"
        >
          {formatDateTime(e.createdAt)}
        </button>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (e) =>
        e.actor ? (
          <span>
            <strong className="font-semibold">{e.actor.name}</strong>
            {e.actorRole && <span className="text-[13px] text-muted"> · {ROLE_LABEL[e.actorRole]}</span>}
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    { key: 'action', header: 'Action', render: (e) => <ActionChip action={e.action} label={e.label} /> },
    { key: 'summary', header: 'Details', className: 'max-w-[420px] truncate', render: (e) => <span title={e.summary}>{e.summary}</span> },
    { key: 'dept', header: 'Department', className: 'text-ink-2', render: (e) => e.department?.code ?? <span className="text-muted">—</span> },
    { key: 'ip', header: 'IP', className: 'num font-mono text-[13px] text-muted', render: (e) => e.ipAddress ?? '—' },
  ];

  const filtered = action || from || to || departmentId || q;

  return (
    <>
      <PageHeader
        title={isSuper ? 'Audit Log' : 'Activity Log'}
        description={
          isSuper
            ? 'Every change to accounts, scores and results across the university. Entries can’t be edited or deleted.'
            : 'Changes to your department’s records, scores and results. Entries can’t be edited or deleted.'
        }
        actions={<CsvButton path="/audit-logs" query={filters} />}
      />
      <DataTable
        caption={isSuper ? 'Audit log' : 'Activity log'}
        columns={columns}
        rows={query.data?.items}
        rowKey={(e) => e.id}
        loading={query.isPending}
        error={query.error}
        onRetry={() => query.refetch()}
        onRowClick={setSelected}
        rowClassName={(e) => (selected?.id === e.id ? '[&>td]:bg-[#F4FAF6]' : undefined)}
        toolbar={
          <div className="flex w-full flex-wrap items-end gap-2.5">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">From</span>
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={cx(inputClass(), 'w-auto!')} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">To</span>
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={cx(inputClass(), 'w-auto!')} />
            </label>
            <FilterSelect label="Action" value={action} onChange={setAction}>
              <option value="">All actions</option>
              {actions.data?.items.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </FilterSelect>
            <DepartmentFilter value={departmentId} onChange={setDepartmentId} />
            <SearchInput label="Search audit log" placeholder="Search details, e.g. CSC 201 or an email" value={search} onChange={setSearch} />
            {filtered && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAction('');
                  setFrom('');
                  setTo('');
                  setDepartmentId('');
                  setSearch('');
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        }
        empty={<EmptyState icon={History} tone="muted" message={filtered ? 'No entries match these filters.' : 'No activity recorded yet.'} />}
        footer={query.data && <Pagination page={page} pageSize={query.data.pageSize} total={query.data.total} onPage={setPage} noun="entries" />}
      />
      <EntryDrawer entry={selected} onClose={() => setSelected(null)} />
    </>
  );
}
