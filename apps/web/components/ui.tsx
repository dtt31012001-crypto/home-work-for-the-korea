"use client";

import { AlertCircle, Copy, Eye, EyeOff, Loader2, X } from "lucide-react";
import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";

export function Brand() {
  return (
    <div className="text-center">
      <p className="text-xl font-semibold text-brand-800">TH – Tiếng Hàn</p>
      <p className="mt-1 text-sm text-muted" lang="ko">
        배움으로 세상을 넓히다
      </p>
    </div>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6">{children}</div>;
}

export function Page({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-8">{children}</main>;
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div role="alert" className="flex gap-2 rounded-lg bg-danger-bg p-3 text-sm text-danger">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string };

export function Field({ label, hint, error, type, ...input }: FieldProps) {
  const id = useId();
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && show ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="h-12 w-full rounded-lg border border-line bg-surface px-3 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100 aria-invalid:border-danger"
          {...input}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted"
            aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          >
            {show ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
          </button>
        )}
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function Button({ children, loading, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={loading || rest.disabled}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
    >
      {loading && <Loader2 className="size-5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Spinner({ label = "Đang tải…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-muted" role="status">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

/* ---------- Thành phần dùng chung cho các workspace ---------- */

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Section({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; icon?: ReactNode };

export function PrimaryButton({ children, loading, icon, className = "", ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={loading || rest.disabled}
      className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60 ${className}`}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function SecondaryButton({ children, loading, icon, className = "", ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={loading || rest.disabled}
      className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-line bg-surface px-4 text-sm font-semibold hover:bg-canvas disabled:opacity-60 ${className}`}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function DangerButton({ children, loading, icon, className = "", ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={loading || rest.disabled}
      className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-danger/30 bg-surface px-4 text-sm font-semibold text-danger hover:bg-danger-bg disabled:opacity-60 ${className}`}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

const BADGE_TONES = {
  green: "bg-brand-50 text-brand-800",
  gray: "bg-canvas text-muted border border-line",
  orange: "bg-warn-bg text-warn",
  red: "bg-danger-bg text-danger",
} as const;

export function Badge({ tone = "gray", children }: { tone?: keyof typeof BADGE_TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE_TONES[tone]}`}>{children}</span>;
}

export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function WarnBox({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="flex gap-2 rounded-lg bg-warn-bg p-3 text-sm text-warn">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function Dialog({ open, title, onClose, children, footer }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-xl sm:max-w-lg sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="-m-2 rounded-lg p-2 text-muted hover:bg-canvas" aria-label="Đóng">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="space-y-4">{children}</div>
        {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; options: { value: string; label: string }[]; placeholder?: string };

export function SelectField({ label, error, options, placeholder, ...rest }: SelectProps) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        className="h-12 w-full rounded-lg border border-line bg-surface px-3 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export function TextArea({ label, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      <textarea
        id={id}
        rows={3}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
        {...rest}
      />
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-line px-1" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={t.value === value}
          onClick={() => onChange(t.value)}
          className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-semibold ${t.value === value ? "border-brand-700 text-brand-800" : "border-transparent text-muted hover:text-ink"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Hiển thị mật khẩu tạm MỘT LẦN sau khi cấp/đặt lại (D-B17). */
export function TemporaryPasswordNotice({ password, expiresAt, identifier }: { password: string; expiresAt?: string; identifier?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3">
      <WarnBox>Mật khẩu tạm chỉ hiển thị <b>một lần</b>. Hãy gửi trực tiếp cho người dùng. Họ phải đổi mật khẩu ở lần đăng nhập đầu.</WarnBox>
      {identifier && (
        <p className="text-sm">
          Đăng nhập bằng: <b>{identifier}</b>
        </p>
      )}
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-lg border border-line bg-canvas px-3 py-3 text-center font-mono text-xl tracking-widest">{password}</code>
        <SecondaryButton
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(password).then(() => setCopied(true));
          }}
          icon={<Copy className="size-4" aria-hidden />}
        >
          {copied ? "Đã chép" : "Chép"}
        </SecondaryButton>
      </div>
      {expiresAt && <p className="text-xs text-muted">Hết hạn: {new Date(expiresAt).toLocaleString("vi-VN")}</p>}
    </div>
  );
}
