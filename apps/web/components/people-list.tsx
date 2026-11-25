"use client";

import type { PersonRow } from "@th/contracts";
import { ChevronRight, KeyRound, Lock, LockOpen, Search, UserMinus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { IssueAccountDialog } from "./account-issue";
import { Badge, Dialog, EmptyState, ErrorBox, PrimaryButton, Section, SecondaryButton, Spinner, TemporaryPasswordNotice } from "./ui";
import { ApiError, api } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

const normalize = (v: string) => v.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Danh sách người theo vai trò (giáo viên/học viên) với thao tác tài khoản dùng chung. */
export function PeopleList({
  orgId,
  role,
  issueTitle,
  emptyTitle,
  emptyHint,
  detailHref,
  withDateOfBirth,
}: {
  orgId: string;
  role: "TEACHER" | "STUDENT";
  issueTitle: string;
  emptyTitle: string;
  emptyHint: string;
  detailHref?: (id: string) => string;
  withDateOfBirth?: boolean;
}) {
  const { data, error, loading, reload } = useResource<PersonRow[]>(`/api/organizations/${orgId}/accounts?role=${role}`);
  const [q, setQ] = useState("");
  const [issue, setIssue] = useState(false);
  const filtered = useMemo(() => {
    const n = normalize(q.trim());
    if (!n) return data;
    return data?.filter((p) => normalize(p.displayName).includes(n) || p.identities.some((i) => i.value.includes(q.trim().replace(/^0/, ""))));
  }, [data, q]);

  return (
    <Section>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Tìm theo tên hoặc số điện thoại</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo tên hoặc số điện thoại"
            className="h-10 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <PrimaryButton onClick={() => setIssue(true)} icon={<UserPlus className="size-4" aria-hidden />}>
          {issueTitle}
        </PrimaryButton>
      </div>
      {error && <ErrorBox message={error.message} />}
      {loading && !data && <Spinner />}
      {data && data.length === 0 && <EmptyState title={emptyTitle} hint={emptyHint} />}
      {filtered && filtered.length > 0 && (
        <ul className="divide-y divide-line">
          {filtered.map((p) => (
            <PersonItem key={p.id} p={p} orgId={orgId} role={role} detailHref={detailHref} onChanged={reload} />
          ))}
        </ul>
      )}
      {data && data.length > 0 && filtered?.length === 0 && <p className="py-6 text-center text-sm text-muted">Không tìm thấy.</p>}
      <IssueAccountDialog
        open={issue}
        onClose={() => setIssue(false)}
        onDone={reload}
        title={issueTitle}
        endpoint={`/api/organizations/${orgId}/accounts`}
        body={{ role }}
        withDateOfBirth={withDateOfBirth}
      />
    </Section>
  );
}

export function PersonBadges({ p }: { p: PersonRow }) {
  return (
    <>
      {p.mustChangePassword && <Badge tone="orange">Chưa đổi mật khẩu tạm</Badge>}
      {p.status === "LOCKED" && <Badge tone="red">Đã khóa</Badge>}
      {p.otherCenters && <Badge>Thuộc nhiều trung tâm</Badge>}
    </>
  );
}

/** Thao tác tài khoản: cấp lại mật khẩu, khóa/mở, rút khỏi trung tâm. */
export function AccountActions({ p, orgId, role, onChanged }: { p: PersonRow; orgId: string; role: string; onChanged: () => void }) {
  const [temp, setTemp] = useState<{ password: string; expiresAt?: string }>();
  const [error, setError] = useState<string>();
  const base = `/api/organizations/${orgId}/accounts/${p.id}`;

  async function run(fn: () => Promise<void>) {
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Đã có lỗi xảy ra.");
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <SecondaryButton
        onClick={() =>
          run(async () => {
            if (!confirm(`Cấp lại mật khẩu tạm cho ${p.displayName}? Mọi phiên đăng nhập của người này sẽ bị đăng xuất.`)) return;
            const r = await api<{ temporaryPassword: string; temporaryPasswordExpiresAt: string }>("POST", `${base}/reset-password`);
            setTemp({ password: r.temporaryPassword, expiresAt: r.temporaryPasswordExpiresAt });
            onChanged();
          })
        }
        icon={<KeyRound className="size-4" aria-hidden />}
      >
        Cấp lại mật khẩu
      </SecondaryButton>
      <SecondaryButton
        onClick={() =>
          run(async () => {
            const lock = p.status !== "LOCKED";
            if (lock && !confirm(`Khóa tài khoản ${p.displayName}? Người này bị đăng xuất ngay.`)) return;
            await api("POST", `${base}/${lock ? "lock" : "unlock"}`);
            onChanged();
          })
        }
        icon={p.status === "LOCKED" ? <LockOpen className="size-4" aria-hidden /> : <Lock className="size-4" aria-hidden />}
      >
        {p.status === "LOCKED" ? "Mở khóa" : "Khóa"}
      </SecondaryButton>
      <SecondaryButton
        onClick={() =>
          run(async () => {
            if (!confirm(`Rút ${p.displayName} khỏi trung tâm? Tài khoản vẫn còn nhưng mất quyền truy cập dữ liệu trung tâm. Lịch sử học tập được giữ nguyên.`)) return;
            await api("POST", `${base}/roles/${role}/revoke`);
            onChanged();
          })
        }
        icon={<UserMinus className="size-4" aria-hidden />}
      >
        Rút khỏi trung tâm
      </SecondaryButton>
      {error && (
        <div className="w-full">
          <ErrorBox message={error} />
        </div>
      )}
      <Dialog open={Boolean(temp)} title={`Mật khẩu tạm mới – ${p.displayName}`} onClose={() => setTemp(undefined)} footer={<PrimaryButton onClick={() => setTemp(undefined)}>Xong</PrimaryButton>}>
        {temp && <TemporaryPasswordNotice password={temp.password} expiresAt={temp.expiresAt} identifier={p.identities[0]?.value} />}
      </Dialog>
    </div>
  );
}

function PersonItem({ p, orgId, role, detailHref, onChanged }: { p: PersonRow; orgId: string; role: string; detailHref?: (id: string) => string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const info = (
    <div className="min-w-0 flex-1">
      <p className="flex flex-wrap items-center gap-2 font-semibold">
        {p.displayName} <PersonBadges p={p} />
      </p>
      <p className="truncate text-sm text-muted">{p.identities.map((i) => i.value).join(" · ")}</p>
    </div>
  );
  if (detailHref) {
    return (
      <li>
        <Link href={detailHref(p.id)} className="flex items-center gap-3 py-3">
          {info}
          <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
        </Link>
      </li>
    );
  }
  return (
    <li className="py-3">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 text-left" aria-expanded={open}>
        {info}
        <ChevronRight className={`size-5 shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
      </button>
      {open && (
        <div className="mt-3">
          <AccountActions p={p} orgId={orgId} role={role} onChanged={onChanged} />
        </div>
      )}
    </li>
  );
}
