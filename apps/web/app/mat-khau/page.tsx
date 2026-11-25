"use client";

import { PASSWORD_MIN_LENGTH, PASSWORD_PROBLEM_MESSAGE, checkPassword, type MeResponse } from "@th/contracts";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { ApiError, api } from "@/lib/api";
import { safeNext } from "@/lib/next-path";
import { Brand, Button, Card, ErrorBox, Field, Page, Spinner } from "@/components/ui";

function ChangePasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [me, setMe] = useState<MeResponse>();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ form?: string; next?: string; confirm?: string }>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<MeResponse>("GET", "/api/auth/me")
      .then(setMe)
      .catch(() => router.replace(`/dang-nhap?next=${encodeURIComponent("/mat-khau")}`));
  }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = checkPassword(next);
    const errs: typeof errors = {};
    if (problem) errs.next = PASSWORD_PROBLEM_MESSAGE[problem];
    if (next !== confirm) errs.confirm = "Mật khẩu nhập lại không khớp.";
    if (!current) errs.form = "Vui lòng nhập mật khẩu hiện tại.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      await api("POST", "/api/auth/password", { currentPassword: current, newPassword: next });
      router.replace(safeNext(params.get("next")));
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Đã có lỗi xảy ra. Vui lòng thử lại.";
      setErrors(err instanceof ApiError && err.code.startsWith("PASSWORD_") ? { next: msg } : { form: msg });
      setLoading(false);
    }
  }

  if (!me) return <Spinner />;
  const temp = me.mustChangePassword;

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <h1 className="text-lg font-semibold">{temp ? "Đặt mật khẩu mới" : "Đổi mật khẩu"}</h1>
          {temp && <p className="mt-1 text-sm text-muted">Bạn đang dùng mật khẩu tạm do trung tâm cấp. Hãy đặt mật khẩu của riêng bạn.</p>}
        </div>
        {errors.form && <ErrorBox message={errors.form} />}
        <Field
          label={temp ? "Mật khẩu tạm" : "Mật khẩu hiện tại"}
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <Field
          label="Mật khẩu mới"
          type="password"
          autoComplete="new-password"
          hint={`Ít nhất ${PASSWORD_MIN_LENGTH} ký tự. Nên dùng một cụm từ dễ nhớ.`}
          error={errors.next}
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <Field
          label="Nhập lại mật khẩu mới"
          type="password"
          autoComplete="new-password"
          error={errors.confirm}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <Button type="submit" loading={loading}>
          Lưu mật khẩu
        </Button>
      </form>
    </Card>
  );
}

export default function ChangePasswordPage() {
  return (
    <Page>
      <Brand />
      <Suspense fallback={<Spinner />}>
        <ChangePasswordForm />
      </Suspense>
    </Page>
  );
}
