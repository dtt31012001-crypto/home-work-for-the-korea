"use client";

import { ROLE_LABEL, type MeResponse } from "@th/contracts";
import { Building2, KeyRound, LogOut, Mail, Phone, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { Brand, Card, ErrorBox, Page, Spinner } from "@/components/ui";

export default function AccountPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    api<MeResponse>("GET", "/api/auth/me")
      .then((m) => (m.mustChangePassword ? router.replace("/mat-khau?next=/tai-khoan") : setMe(m)))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.replace("/dang-nhap?next=/tai-khoan");
        else setError(e instanceof ApiError ? e.message : "Đã có lỗi xảy ra.");
      });
  }, [router]);

  async function logout() {
    await api("POST", "/api/auth/logout").catch(() => undefined);
    router.replace("/dang-nhap");
  }

  return (
    <Page>
      <Brand />
      {error && <ErrorBox message={error} />}
      {!me && !error && <Spinner />}
      {me && (
        <>
          <Card>
            <h1 className="text-lg font-semibold">{me.user.displayName}</h1>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              {me.identities.map((i) => (
                <li key={i.type} className="flex items-center gap-2">
                  {i.type === "PHONE" ? <Phone className="size-4" aria-hidden /> : <Mail className="size-4" aria-hidden />}
                  {i.masked}
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold">Vai trò</h2>
            {me.contexts.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Tài khoản chưa được gán vai trò. Vui lòng liên hệ trung tâm.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {me.contexts.map((c) => (
                  <li key={`${c.role}-${c.organization?.id ?? "platform"}`} className="flex items-center gap-3 py-2.5">
                    {c.organization ? (
                      <Building2 className="size-5 text-brand-700" aria-hidden />
                    ) : (
                      <ShieldCheck className="size-5 text-brand-700" aria-hidden />
                    )}
                    <div>
                      <p className="text-sm font-semibold">{ROLE_LABEL[c.role]}</p>
                      <p className="text-xs text-muted">{c.organization?.name ?? "Nền tảng TH – Tiếng Hàn"}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {me.contexts.length > 0 && (
            <Link href="/vao" className="flex h-12 items-center justify-center rounded-lg bg-brand-700 font-semibold text-white hover:bg-brand-800">
              Vào làm việc
            </Link>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/mat-khau?next=/tai-khoan"
              className="flex h-12 items-center justify-center gap-2 rounded-lg border border-line bg-surface text-sm font-semibold"
            >
              <KeyRound className="size-4" aria-hidden />
              Đổi mật khẩu
            </Link>
            <button
              onClick={logout}
              className="flex h-12 items-center justify-center gap-2 rounded-lg border border-line bg-surface text-sm font-semibold text-danger"
            >
              <LogOut className="size-4" aria-hidden />
              Đăng xuất
            </button>
          </div>
        </>
      )}
    </Page>
  );
}
