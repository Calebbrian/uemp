import { useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Search } from 'lucide-react';
import { ApiError } from '../../lib/api';
import { cx } from './primitives';

const inputBase =
  'h-10 w-full rounded-md border bg-white px-3 text-sm text-ink placeholder:text-faint disabled:bg-surface disabled:text-muted';

export const inputClass = (error?: string | boolean) =>
  cx(inputBase, error ? 'border-danger shadow-[0_0_0_3px_var(--color-danger-50)]' : 'border-line-strong');

type FieldProps = { label: ReactNode; error?: string; help?: ReactNode; required?: boolean; children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode; className?: string };

export function Field({ label, error, help, required, children, className }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : help ? `${id}-help` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold text-ink-2">
        {label}
        {required && (
          <span className="text-danger-ink" aria-hidden>
            {' '}
            *
          </span>
        )}
      </label>
      {children({ id, describedBy, invalid: !!error })}
      {error ? (
        <div id={`${id}-error`} className="mt-1.5 text-xs font-medium text-danger-ink">
          {error}
        </div>
      ) : help ? (
        <div id={`${id}-help`} className="mt-1.5 text-xs text-muted">
          {help}
        </div>
      ) : null}
    </div>
  );
}

type Common = { label: ReactNode; error?: string; help?: ReactNode; className?: string };

export function TextField({ label, error, help, className, required, ...input }: Common & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} error={error} help={help} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <input id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} required={required} className={inputClass(error)} {...input} />
      )}
    </Field>
  );
}

export function SelectField({ label, error, help, className, required, children, ...select }: Common & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field label={label} error={error} help={help} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <select id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} required={required} className={inputClass(error)} {...select}>
          {children}
        </select>
      )}
    </Field>
  );
}

export function TextAreaField({ label, error, help, className, required, ...area }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} error={error} help={help} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          required={required}
          className={cx(inputClass(error), 'h-[88px] resize-y py-2.5')}
          {...area}
        />
      )}
    </Field>
  );
}

export function Checkbox({ label, ...input }: { label: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-ink-2">
      <input type="checkbox" className="size-4 accent-brand" {...input} />
      {label}
    </label>
  );
}

/** Compact select used in table toolbars. */
export function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={cx(inputClass(), 'w-auto! max-w-full pr-8')}>
      {children}
    </select>
  );
}

export function SearchInput({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <label className="relative block max-w-[360px] min-w-[200px] flex-[1_1_260px]">
      <span className="sr-only">{label}</span>
      <Search className="pointer-events-none absolute top-3 left-3 size-4 text-muted" aria-hidden />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cx(inputClass(), 'pl-9')} />
    </label>
  );
}

/** Minimal form state with server-side field errors mapped onto inputs. */
export function useForm<T extends Record<string, unknown>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof T>(key: K, value: T[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => {
      if (!e[key as string]) return e;
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  };

  const bind = (key: keyof T & string) => ({
    value: (values[key] ?? '') as string,
    onChange: (e: { target: { value: string } }) => set(key, e.target.value as T[typeof key]),
    error: errors[key],
    name: key,
  });

  /** Returns true when the error was a field validation error that is now shown inline. */
  const applyError = (err: unknown) => {
    if (err instanceof ApiError && Object.keys(err.fields).length) {
      setErrors(err.fields);
      return true;
    }
    return false;
  };

  return { values, set, setValues, errors, setErrors, bind, applyError, reset: () => (setValues(initial), setErrors({})) };
}
