"use client";

import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";
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
