import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { api, downloadCsv } from '../lib/api';
import { useUser } from '../lib/auth';
import type { Options, Semester } from '../lib/types';
import { FilterSelect } from './ui/form';
import { Button } from './ui/primitives';

/**
 * Department admins and the super admin share the same admin pages. The super
 * admin sees every department (plus a department filter); department admins
 * are scoped server-side to their own.
 */
export function useAdminScope() {
  const user = useUser();
  const isSuper = user.role === 'SUPER_ADMIN';
  return {
    user,
    isSuper,
    base: isSuper ? '/admin' : '/dept',
    departmentName: user.department?.name ?? 'All departments',
  };
}

export function useSemesters() {
  return useQuery({
    queryKey: ['semesters'],
    queryFn: () => api.get<{ items: Semester[] }>('/meta/semesters'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useOptions() {
  return useQuery({
    queryKey: ['options'],
    queryFn: () => api.get<Options>('/meta/options'),
    staleTime: 5 * 60 * 1000,
  });
}

/** Empty value means "current semester". */
export function SemesterSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const semesters = useSemesters();
  return (
    <FilterSelect label="Semester" value={value} onChange={onChange}>
      <option value="">Current semester</option>
      {semesters.data?.items.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label}
          {s.isCurrent ? ' (current)' : ''}
        </option>
      ))}
    </FilterSelect>
  );
}

/** Only rendered for the super admin; department admins cannot change department. */
export function DepartmentFilter({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { isSuper } = useAdminScope();
  const options = useOptions();
  if (!isSuper) return null;
  return (
    <FilterSelect label="Department" value={value} onChange={onChange}>
      <option value="">All departments</option>
      {options.data?.departments.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </FilterSelect>
  );
}

export function CsvButton({ path, query, label = 'Export CSV' }: { path: string; query?: Record<string, string | number | undefined>; label?: string }) {
  return (
    <Button variant="secondary" size="sm" icon={Download} onClick={() => downloadCsv(path, query)}>
      {label}
    </Button>
  );
}

export const LEVELS = [100, 200, 300, 400, 500];
