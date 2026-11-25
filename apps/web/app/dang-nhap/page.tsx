"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { ApiError, api } from "@/lib/api";
import { safeNext } from "@/lib/next-path";
import { Brand, Button, Card, ErrorBox, Field, Page } from "@/components/ui";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (!identifier.trim() || !password) {
      setError("Vui lòng nhập số điện thoại/email và mật khẩu.");
      return;
    }
    setLoading(true);
    try {
      const res = await api<{ mustChangePassword: boolean }>("POST", "/api/auth/login", { identifier, password });
      const next = safeNext(params.get("next"));
      router.replace(res.mustChangePassword ? `/mat-khau?next=${encodeURIComponent(next)}` : next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Đã có lỗi xảy ra. Vui lòng thử lại.");
      setLoading(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <h1 className="text-lg font-semibold">Đăng nhập</h1>
        {error && <ErrorBox message={error} />}
        <Field
          label="Số điện thoại hoặc email"
          name="identifier"
          autoComplete="username"
          inputMode="email"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />
        <Field
          label="Mật khẩu"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" loading={loading}>
          Đăng nhập
        </Button>
        <p className="text-center text-xs text-muted">Quên mật khẩu? Liên hệ trung tâm để được cấp mật khẩu tạm.</p>
      </form>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Page>
      <Brand />
      <Suspense>
        <LoginForm />
      </Suspense>
    </Page>
  );
}
