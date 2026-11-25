"use client";

import { LINK_STATUS_LABEL, ROLE_LABEL, type ConsentRequest, type GuardianLinkView, type MeResponse } from "@th/contracts";
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
  const [linksVersion, setLinksVersion] = useState(0);

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

          <ConsentRequests version={linksVersion} onChanged={() => setLinksVersion((v) => v + 1)} />
          <MyLinks version={linksVersion} onChanged={() => setLinksVersion((v) => v + 1)} />
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

/** Học viên trưởng thành: đồng ý/từ chối chia sẻ dữ liệu với phụ huynh (D-B21). */
function ConsentRequests({ version, onChanged }: { version: number; onChanged: () => void }) {
  const [items, setItems] = useState<ConsentRequest[]>([]);
  useEffect(() => {
    api<ConsentRequest[]>("GET", "/api/me/guardian-requests").then(setItems).catch(() => setItems([]));
  }, [version]);
  const load = onChanged;
  if (items.length === 0) return null;
  return (
    <Card>
      <h2 className="text-sm font-semibold">Yêu cầu liên kết phụ huynh</h2>
      <ul className="mt-2 space-y-3">
        {items.map((r) => (
          <li key={r.id} className="rounded-lg bg-warn-bg p-3 text-sm">
            <p>
              <b>{r.organization.name}</b> đề nghị liên kết <b>{r.guardian.displayName}</b> ({r.relationship}) với tài khoản của bạn. Người này sẽ xem được lịch học, điểm danh và kết quả học tập của bạn.
            </p>
            {r.status === "PAUSED_ADULT" && <p className="mt-1 text-xs">Bạn đã đủ 18 tuổi nên cần xác nhận lại.</p>}
            <div className="mt-2 flex gap-2">
              <button
                onClick={async () => {
                  await api("POST", `/api/me/guardian-links/${r.id}/consent`, { accept: true });
                  load();
                }}
                className="h-9 rounded-lg bg-brand-700 px-3 text-sm font-semibold text-white"
              >
                Đồng ý
              </button>
              <button
                onClick={async () => {
                  await api("POST", `/api/me/guardian-links/${r.id}/consent`, { accept: false });
                  load();
                }}
                className="h-9 rounded-lg border border-line bg-surface px-3 text-sm font-semibold"
              >
                Từ chối
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MyLinks({ version, onChanged }: { version: number; onChanged: () => void }) {
  const [data, setData] = useState<{ asStudent: GuardianLinkView[]; asGuardian: GuardianLinkView[] }>();
  useEffect(() => {
    api<{ asStudent: GuardianLinkView[]; asGuardian: GuardianLinkView[] }>("GET", "/api/me/guardian-links").then(setData).catch(() => undefined);
  }, [version]);
  const load = onChanged;
  const rows = [
    ...(data?.asStudent.filter((l) => l.status === "ACTIVE").map((l) => ({ l, label: `Phụ huynh: ${l.guardian.displayName} (${l.relationship})` })) ?? []),
    ...(data?.asGuardian.filter((l) => l.status === "ACTIVE" || l.status === "PAUSED_ADULT").map((l) => ({ l, label: `Con: ${l.student.displayName}` })) ?? []),
  ];
  if (rows.length === 0) return null;
  return (
    <Card>
      <h2 className="text-sm font-semibold">Liên kết gia đình</h2>
      <ul className="mt-2 divide-y divide-line">
        {rows.map(({ l, label }) => (
          <li key={l.id} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span>
              {label}
              {l.status !== "ACTIVE" && <span className="ml-1 text-xs text-warn">· {LINK_STATUS_LABEL[l.status]}</span>}
            </span>
            <button
              onClick={async () => {
                if (!confirm("Thu hồi liên kết này? Có hiệu lực ngay.")) return;
                try {
                  await api("POST", `/api/me/guardian-links/${l.id}/revoke`);
                } catch (e) {
                  alert(e instanceof ApiError ? e.message : "Không thực hiện được.");
                }
                load();
              }}
              className="text-xs font-semibold text-danger"
            >
              Thu hồi
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
