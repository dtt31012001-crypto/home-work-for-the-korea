"use client";

import { AUDIT_ACTION_LABEL, type AuditPage, type AuditRow } from "@th/contracts";
import { ScrollText, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { EmptyState, ErrorBox, PageHeader, Section, SecondaryButton, SelectField, Spinner } from "@/components/ui";

const GROUPS = [
  ["auth.", "Đăng nhập & mật khẩu"],
  ["account.", "Tài khoản"],
  ["organization.", "Trung tâm"],
  ["curriculum.", "Giáo trình"],
  ["guardian_link.", "Liên kết phụ huynh"],
  ["class.", "Lớp học"],
  ["session.", "Buổi học"],
  ["enrollment.", "Ghi danh"],
  ["attendance.", "Điểm danh"],
] as const;

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(iso));

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-semibold">{label}</span>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="h-12 w-full rounded-lg border border-line bg-surface px-3 text-base" />
    </label>
  );
}

function AuditLog() {
  const params = useSearchParams();
  const resourceId = params.get("resourceId") ?? "";
  const [organizationId, setOrg] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const orgs = useResource<{ id: string; name: string }[]>("/api/admin/organizations");
  const qs = new URLSearchParams(Object.entries({ organizationId, action, from, to, resourceId }).filter(([, v]) => v));
  const [items, setItems] = useState<AuditRow[]>();
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [more, setMore] = useState(false);
  const key = qs.toString();

  useEffect(() => {
    let cancelled = false;
    setItems(undefined);
    setError(undefined);
    api<AuditPage>("GET", `/api/admin/audit?${key}`)
      .then((p) => {
        if (cancelled) return;
        setItems(p.items);
        setCursor(p.nextCursor);
      })
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "Không tải được nhật ký."));
    return () => {
      cancelled = true;
    };
  }, [key]);

  const loadMore = async () => {
    if (!cursor) return;
    setMore(true);
    try {
      const p = await api<AuditPage>("GET", `/api/admin/audit?${key}${key ? "&" : ""}before=${cursor}`);
      setItems((x) => [...(x ?? []), ...p.items]);
      setCursor(p.nextCursor);
    } finally {
      setMore(false);
    }
  };

  return (
    <>
      <PageHeader title="Nhật ký hệ thống" subtitle="Ghi lại thao tác quan trọng; không ai sửa hoặc xóa được." />
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <SelectField label="Trung tâm" value={organizationId} onChange={(e) => setOrg(e.target.value)} placeholder="Tất cả" options={(orgs.data ?? []).map((o) => ({ value: o.id, label: o.name }))} />
        <SelectField label="Loại thao tác" value={action} onChange={(e) => setAction(e.target.value)} placeholder="Tất cả" options={GROUPS.map(([value, label]) => ({ value, label }))} />
        <DateInput label="Từ ngày" value={from} onChange={setFrom} />
        <DateInput label="Đến ngày" value={to} onChange={setTo} />
      </div>
      {resourceId && (
        <p className="mb-3 flex items-center gap-2 text-sm">
          Đang lọc theo một người dùng/đối tượng.
          <a href="/quan-tri/nhat-ky" className="inline-flex items-center gap-1 font-semibold text-brand-800 underline">
            <X className="size-3.5" aria-hidden /> Bỏ lọc
          </a>
        </p>
      )}
      {error && <ErrorBox message={error} />}
      {!items && !error && <Spinner />}
      {items && (
        <Section>
          {items.length === 0 ? (
            <EmptyState icon={<ScrollText className="size-8" />} title="Không có mục nào" />
          ) : (
            <ul className="divide-y divide-line">
              {items.map((r) => (
                <li key={r.id} className="py-2.5 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="font-semibold">
                      {AUDIT_ACTION_LABEL[r.action] ?? r.action}
                      {r.target && <span className="font-normal"> · {r.target}</span>}
                    </p>
                    <p className="font-mono text-xs text-muted">{fmt(r.at)}</p>
                  </div>
                  <p className="text-muted">
                    {r.actor?.displayName ?? "Hệ thống / chưa đăng nhập"}
                    {r.organization ? ` · ${r.organization.name}` : ""}
                    {r.ip ? ` · IP ${r.ip}` : ""}
                  </p>
                  {r.data != null && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-muted">Chi tiết</summary>
                      <pre className="mt-1 overflow-x-auto rounded bg-canvas p-2 text-xs">{JSON.stringify({ resource: `${r.resourceType}${r.resourceId ? `:${r.resourceId}` : ""}`, ...(r.data as object) }, null, 2)}</pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
          {cursor && (
            <div className="mt-3 text-center">
              <SecondaryButton loading={more} onClick={() => void loadMore()}>
                Xem thêm
              </SecondaryButton>
            </div>
          )}
        </Section>
      )}
    </>
  );
}

/** SA-04: nhật ký hệ thống, lọc theo trung tâm/loại/ngày. */
export default function Page() {
  return (
    <Suspense>
      <AuditLog />
    </Suspense>
  );
}
