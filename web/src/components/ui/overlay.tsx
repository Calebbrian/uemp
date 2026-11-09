import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { Button, cx, IconButton } from './primitives';
import { TextAreaField, TextField } from './form';

/** Native <dialog> gives focus trapping, Escape to close and an inert background for free. */
function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handle = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', handle);
    return () => dialog.removeEventListener('cancel', handle);
  }, [onClose]);
  return ref;
}

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onSubmit?: (e: FormEvent) => void;
  width?: number;
};

export function Drawer({ open, onClose, title, children, footer, onSubmit, width = 440 }: DrawerProps) {
  const ref = useDialog(open, onClose);
  const Body = onSubmit ? 'form' : 'div';
  return (
    <dialog
      ref={ref}
      aria-labelledby="drawer-title"
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-full border-0 bg-white p-0 shadow-overlay"
      style={{ width: `min(${width}px, 100vw)` }}
    >
      {open && (
        <Body
          className="flex h-full flex-col"
          onSubmit={
            onSubmit
              ? (e: FormEvent) => {
                  e.preventDefault();
                  onSubmit(e);
                }
              : undefined
          }
          noValidate
        >
          <header className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 id="drawer-title" className="m-0 text-lg font-semibold">
              {title}
            </h2>
            <IconButton label="Close" icon={X} onClick={onClose} className="size-10" />
          </header>
          <div className="flex flex-1 flex-col gap-3.5 overflow-auto p-5">{children}</div>
          {footer && <footer className="flex justify-end gap-2.5 border-t border-line px-5 py-4">{footer}</footer>}
        </Body>
      )}
    </dialog>
  );
}

type DialogProps = { open: boolean; onClose: () => void; title: ReactNode; children?: ReactNode; footer?: ReactNode; role?: 'dialog' | 'alertdialog'; icon?: ReactNode };

export function Dialog({ open, onClose, title, children, footer, role = 'dialog', icon }: DialogProps) {
  const ref = useDialog(open, onClose);
  return (
    <dialog ref={ref} role={role} aria-labelledby="dialog-title" className="m-auto w-[calc(100%-32px)] max-w-[440px] rounded-xl border-0 bg-white p-0 shadow-overlay">
      {open && (
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-center gap-3">
            {icon}
            <h2 id="dialog-title" className="m-0 text-lg font-semibold">
              {title}
            </h2>
          </div>
          {children && <div className="text-sm leading-[21px] text-ink-2">{children}</div>}
          {footer && <div className="flex flex-wrap justify-end gap-2.5">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

type ConfirmProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (comment: string) => unknown;
  title: ReactNode;
  message?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
  comment?: { label: string; required?: boolean; placeholder?: string; multiline?: boolean; minLength?: number; requiredMessage?: string };
  error?: string | null;
};

/** Confirmation for final or destructive actions, optionally collecting a comment. */
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel, danger, loading, comment, error }: ConfirmProps) {
  const [text, setText] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setText('');
      setLocalError(null);
    }
  }, [open]);

  const submit = () => {
    const min = comment?.minLength ?? 5;
    if (comment?.required && text.trim().length < min) {
      setLocalError(comment.requiredMessage ?? `Please write at least ${min} characters.`);
      return;
    }
    onConfirm(text.trim());
  };

  const Comment = comment?.multiline === false ? TextField : TextAreaField;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      role="alertdialog"
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={submit} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {message && <div>{message}</div>}
        {comment && (
          <Comment
            label={
              <>
                {comment.label} {comment.required ? <span className="text-danger-ink">(required)</span> : <span className="font-normal text-muted">(optional)</span>}
              </>
            }
            value={text}
            placeholder={comment.placeholder}
            onChange={(e: { target: { value: string } }) => {
              setText(e.target.value);
              setLocalError(null);
            }}
            error={localError ?? error ?? undefined}
          />
        )}
        {!comment && error && <p className="m-0 text-sm font-medium text-danger-ink">{error}</p>}
      </div>
    </Dialog>
  );
}

/** Shown once after creating an account or resetting a password. */
export function TempPasswordDialog({ open, onClose, title, name, password }: { open: boolean; onClose: () => void; title: string; name: string; password: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      icon={
        <span className="flex size-9 items-center justify-center rounded-full bg-ok-bg text-ok-fg">
          <Check className="size-4" strokeWidth={2.5} aria-hidden />
        </span>
      }
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="flex flex-col gap-4">
        <p className="m-0">
          Share this temporary password with <strong>{name}</strong>. It won’t be shown again; ask them to change it after signing in.
        </p>
        <div className="flex gap-2">
          <input readOnly value={password} aria-label="Temporary password" className={cx('h-10 w-full rounded-md border border-line-strong bg-subtle px-3 font-mono text-base')} />
          <Button
            variant="secondary"
            icon={copied ? Check : Copy}
            onClick={() => {
              navigator.clipboard?.writeText(password);
              setCopied(true);
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
