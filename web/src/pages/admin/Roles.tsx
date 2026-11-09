import { Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ShieldCheck } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { ROLE_LABEL } from '../../lib/format';
import type { Role } from '../../lib/types';
import { Banner, Card, Skeleton, PageHeader } from '../../components/ui/primitives';

type Scope = 'OWN' | 'ASSIGNED' | 'DEPARTMENT' | 'UNIVERSITY';
type Permission = { key: string; label: string; group: string; grants: Partial<Record<Role, Scope>> };

const ROLES: Role[] = ['STUDENT', 'LECTURER', 'DEPT_ADMIN', 'SUPER_ADMIN'];
const SHORT: Record<Role, string> = { STUDENT: 'Student', LECTURER: 'Lecturer', DEPT_ADMIN: 'Dept Admin', SUPER_ADMIN: 'Super Admin' };

const SCOPE_LABEL: Record<Scope, string> = {
  OWN: 'Own record',
  ASSIGNED: 'Assigned courses',
  DEPARTMENT: 'Own department',
  UNIVERSITY: 'University-wide',
};

const thCls = 'border-b border-line bg-subtle px-4 py-3 text-xs font-semibold tracking-[0.04em] whitespace-nowrap text-[#555F5A] uppercase';

export function RolesPage() {
  const query = useQuery({
    queryKey: ['permissions'],
    queryFn: () => api.get<{ items: Permission[] }>('/meta/permissions'),
    staleTime: Infinity,
  });

  const groups: { name: string; items: Permission[] }[] = [];
  for (const p of query.data?.items ?? []) {
    const group = groups.find((g) => g.name === p.group);
    if (group) group.items.push(p);
    else groups.push({ name: p.group, items: [p] });
  }

  return (
    <>
      <PageHeader title="Roles & Permissions" description="Read-only reference of what each role can do, and over which records." />

      <div role="note" className="flex gap-2.5 rounded-lg border border-info-line bg-info-bg px-3.5 py-3 text-sm text-info-fg">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Permissions are fixed by university policy and enforced on the server for every request. Hiding a button in the interface is never the only check, and
          scope (own record, assigned courses or own department) is applied in the database query itself.
        </span>
      </div>

      {query.error && <Banner kind="error" title="We couldn’t load the permission matrix.">{errorMessage(query.error)}</Banner>}

      <Card className="overflow-hidden">
        <div className="relative overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Permissions by role</caption>
            <thead>
              <tr>
                <th scope="col" className={`${thCls} text-left`}>
                  Permission
                </th>
                {ROLES.map((r) => (
                  <th key={r} scope="col" className={`${thCls} w-[120px] text-center`}>
                    <abbr title={ROLE_LABEL[r]} className="no-underline">
                      {SHORT[r]}
                    </abbr>
                  </th>
                ))}
                <th scope="col" className={`${thCls} text-left`}>
                  Scope
                </th>
              </tr>
            </thead>
            <tbody>
              {query.isPending &&
                Array.from({ length: 8 }, (_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }, (_, j) => (
                      <td key={j} className="border-b border-line-soft px-4 py-3.5">
                        <Skeleton className="h-3" />
                      </td>
                    ))}
                  </tr>
                ))}
              {groups.map((group) => (
                <Fragment key={group.name}>
                  <tr>
                    <th colSpan={6} scope="colgroup" className="border-b border-line-soft bg-subtle px-4 py-2 text-left text-xs font-semibold tracking-[0.05em] text-ink-2 uppercase">
                      {group.name}
                    </th>
                  </tr>
                  {group.items.map((p) => {
                    const scopes = [...new Set(ROLES.map((r) => p.grants[r]).filter((s): s is Scope => !!s))];
                    return (
                      <tr key={p.key}>
                        <th scope="row" className="border-b border-line-soft px-4 py-[11px] text-left font-medium">
                          {p.label}
                        </th>
                        {ROLES.map((r) => {
                          const scope = p.grants[r];
                          return (
                            <td key={r} className="border-b border-line-soft px-4 py-[11px] text-center">
                              {scope ? (
                                <span title={`${ROLE_LABEL[r]}: ${SCOPE_LABEL[scope]}`} className="inline-flex size-[26px] items-center justify-center rounded-full bg-ok-bg text-ok-fg">
                                  <Check className="size-[15px]" strokeWidth={3} aria-hidden />
                                  <span className="sr-only">
                                    Allowed, {SCOPE_LABEL[scope].toLowerCase()}
                                  </span>
                                </span>
                              ) : (
                                <>
                                  <span aria-hidden className="text-lg text-faint">
                                    –
                                  </span>
                                  <span className="sr-only">Not allowed</span>
                                </>
                              )}
                            </td>
                          );
                        })}
                        <td className="border-b border-line-soft px-4 py-[11px]">
                          <span className="rounded bg-[#EEF1EF] px-2 py-[3px] text-xs font-semibold whitespace-nowrap text-ink-2">
                            {scopes.map((s) => SCOPE_LABEL[s]).join(' · ')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="flex flex-col gap-2 p-5 text-sm text-ink-2">
        <h2 className="m-0 text-[15px] font-semibold text-ink">Rules the matrix cannot show</h2>
        <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5">
          <li>Students only ever see results from approved result sheets.</li>
          <li>Lecturers can only edit scores while a sheet is a draft or has been returned, and only for courses they are assigned to.</li>
          <li>Only the department admin who owns a course can approve or reject its results, and nobody can review a sheet they submitted.</li>
          <li>Super admins can reopen approved results but cannot approve them.</li>
          <li>Suspending or deactivating an account signs the user out on every device immediately.</li>
        </ul>
      </Card>
    </>
  );
}
