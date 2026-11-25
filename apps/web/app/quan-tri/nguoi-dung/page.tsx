"use client";

import { ROLE_LABEL, type IssueAccountResponse, type PlatformUserRow } from "@th/contracts";
import { KeyRound, Lock, LockOpen, ScrollText, Search, UserCog } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { Badge, DangerButton, Dialog, EmptyState, ErrorBox, PageHeader, Section, SecondaryButton, SelectField, Spinner, TemporaryPasswordNotice } from "@/components/ui";

type Action = { kind: "lock" | "unlock" | "reset"; user: PlatformUserRow };

/** SA-03: tìm người dùng toàn nền tảng; khóa/mở khóa; đặt lại mật khẩu. */
export default function PlatformUsersPage() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const qs = new URLSearchParams({ ...(debounced ? { q: debounced } : {}), ...(status ? { status } : {}) });
  const { data, error, reload } = useResource<PlatformUserRow[]>(`/api/admin/users?${qs}`);
  const [action, setAction] = useState<Action>();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const [issued, setIssued] = useState<IssueAccountResponse & { identifier?: string }>();

  const run = async () => {
    if (!action) return;
    setBusy(true);
    setActionError(undefined);
    try {
      const path = `/api/admin/users/${action.user.id}/${action.kind === "reset" ? "reset-password" : action.kind}`;
      const r = await api<IssueAccountResponse>("POST", path, {});
      if (action.kind === "reset") setIssued({ ...r, identifier: action.user.identities[0]?.value });
      else setAction(undefined);
      reload();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Không thực hiện được.");
    } finally {
      setBusy(false);
    }
  };
  const close = () => {
    setAction(undefined);
    setIssued(undefined);
    setActionError(undefined);
  };

  return (
    <>
      <PageHeader title="Người dùng" subtitle="Tìm trên toàn nền tảng. Hiển thị tối đa 100 kết quả mới nhất." />
      <Section>
        <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_12rem]">
          <label className="relative self-end">
            <span className="sr-only">Tìm theo tên, số điện thoại hoặc email</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm theo tên, số điện thoại hoặc email"
              className="h-12 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <SelectField
            label="Trạng thái"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            placeholder="Tất cả"
            options={[
              { value: "ACTIVE", label: "Đang hoạt động" },
              { value: "LOCKED", label: "Đã khóa" },
            ]}
          />
        </div>
        {error && <ErrorBox message={error.message} />}
        {!data && !error && <Spinner />}
        {data && data.length === 0 && <EmptyState icon={<UserCog className="size-8" />} title="Không tìm thấy người dùng" />}
        {data && data.length > 0 && (
          <ul className="divide-y divide-line">
            {data.map((u) => (
              <li key={u.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {u.displayName}
                    {u.status === "LOCKED" && <Badge tone="red">Đã khóa</Badge>}
                    {u.mustChangePassword && <Badge tone="orange">Chưa đổi mật khẩu tạm</Badge>}
                  </p>
                  <p className="text-sm text-muted">{u.identities.map((i) => i.value).join(" · ")}</p>
                  <p className="mt-1 flex flex-wrap gap-1">
                    {u.roles.length === 0 && <span className="text-xs text-muted">Không có vai trò</span>}
                    {u.roles.map((r, i) => (
                      <Badge key={i} tone={r.role === "SUPER_ADMIN" || r.role === "CENTER_ADMIN" ? "green" : "gray"}>
                        {ROLE_LABEL[r.role]}
                        {r.organization ? ` · ${r.organization.name}` : ""}
                      </Badge>
                    ))}
                  </p>
                  <p className="text-xs text-muted">
                    Tạo {fmtDate(u.createdAt)} · {u.lastLoginAt ? `Đăng nhập gần nhất ${fmtDate(u.lastLoginAt)}` : "Chưa đăng nhập"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/quan-tri/nhat-ky?resourceId=${u.id}`}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold hover:bg-canvas"
                    aria-label={`Nhật ký của ${u.displayName}`}
                  >
                    <ScrollText className="size-4" aria-hidden />
                  </Link>
                  <SecondaryButton onClick={() => setAction({ kind: "reset", user: u })} icon={<KeyRound className="size-4" aria-hidden />}>
                    Đặt lại mật khẩu
                  </SecondaryButton>
                  {u.status === "LOCKED" ? (
                    <SecondaryButton onClick={() => setAction({ kind: "unlock", user: u })} icon={<LockOpen className="size-4" aria-hidden />}>
                      Mở khóa
                    </SecondaryButton>
                  ) : (
                    <DangerButton onClick={() => setAction({ kind: "lock", user: u })} icon={<Lock className="size-4" aria-hidden />}>
                      Khóa
                    </DangerButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Dialog
        open={Boolean(action)}
        title={action?.kind === "lock" ? "Khóa tài khoản" : action?.kind === "unlock" ? "Mở khóa tài khoản" : "Đặt lại mật khẩu"}
        onClose={close}
        footer={
          issued ? (
            <SecondaryButton onClick={close}>Xong</SecondaryButton>
          ) : (
            <>
              <SecondaryButton onClick={close}>Hủy</SecondaryButton>
              {action?.kind === "lock" ? (
                <DangerButton loading={busy} onClick={() => void run()}>
                  Khóa tài khoản
                </DangerButton>
              ) : (
                <SecondaryButton loading={busy} onClick={() => void run()}>
                  Xác nhận
                </SecondaryButton>
              )}
            </>
          )
        }
      >
        {actionError && <ErrorBox message={actionError} />}
        {issued?.temporaryPassword ? (
          <TemporaryPasswordNotice password={issued.temporaryPassword} expiresAt={issued.temporaryPasswordExpiresAt} identifier={issued.identifier} />
        ) : (
          action && (
            <p className="text-sm">
              {action.kind === "lock" && (
                <>
                  <b>{action.user.displayName}</b> sẽ bị đăng xuất khỏi mọi thiết bị và không đăng nhập được ở <b>tất cả trung tâm</b> cho tới khi mở khóa.
                </>
              )}
              {action.kind === "unlock" && (
                <>
                  <b>{action.user.displayName}</b> sẽ đăng nhập lại được bằng mật khẩu hiện tại.
                </>
              )}
              {action.kind === "reset" && (
                <>
                  Cấp mật khẩu tạm mới cho <b>{action.user.displayName}</b>. Mọi phiên đăng nhập hiện tại bị thu hồi; người dùng phải đổi mật khẩu ở lần đăng nhập đầu.
                </>
              )}
            </p>
          )
        )}
      </Dialog>
    </>
  );
}
