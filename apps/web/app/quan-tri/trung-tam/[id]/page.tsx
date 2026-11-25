"use client";

import { EDITION_STATUS_LABEL, ROLE_LABEL, type CurriculumTree, type GrantedEdition, type OrganizationDetail } from "@th/contracts";
import { ArrowLeft, KeyRound, UserPlus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { IssueAccountDialog } from "@/components/account-issue";
import { ApiError, api } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import {
  Badge,
  Dialog,
  EmptyState,
  ErrorBox,
  Field,
  PageHeader,
  PrimaryButton,
  Section,
  SecondaryButton,
  SelectField,
  Spinner,
  Tabs,
  TemporaryPasswordNotice,
} from "@/components/ui";

interface AccountRow {
  id: string;
  displayName: string;
  status: "ACTIVE" | "LOCKED" | "DEACTIVATED";
  roles: (keyof typeof ROLE_LABEL)[];
  identities: { type: "PHONE" | "EMAIL"; value: string }[];
  mustChangePassword: boolean;
}

type Tab = "info" | "admins" | "curricula" | "branches";

export default function CenterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useResource<OrganizationDetail>(`/api/organizations/${id}`);
  const [tab, setTab] = useState<Tab>("info");

  if (error) return <ErrorBox message={error.message} />;
  if (!data) return <Spinner />;

  return (
    <>
      <Link href="/quan-tri" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Trung tâm
      </Link>
      <PageHeader title={data.name} subtitle={`Mã ${data.code}`} action={data.status === "SUSPENDED" ? <Badge tone="orange">Tạm ngưng</Badge> : <Badge tone="green">Đang hoạt động</Badge>} />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "info", label: "Thông tin & giới hạn" },
          { value: "admins", label: "Quản trị trung tâm" },
          { value: "curricula", label: "Giáo trình được cấp" },
          { value: "branches", label: "Cơ sở" },
        ]}
      />
      {tab === "info" && <InfoTab org={data} onSaved={reload} />}
      {tab === "admins" && <AdminsTab orgId={data.id} />}
      {tab === "curricula" && <GrantsTab orgId={data.id} />}
      {tab === "branches" && (
        <Section>
          {data.branches.length === 0 ? (
            <EmptyState title="Trung tâm chưa khai báo cơ sở" hint="Quản trị trung tâm tự thêm cơ sở và phòng trong mục Cài đặt." />
          ) : (
            <ul className="divide-y divide-line">
              {data.branches.map((b) => (
                <li key={b.id} className="py-3">
                  <p className="font-semibold">{b.name}</p>
                  <p className="text-sm text-muted">
                    {b.address ?? "—"} · {b.rooms.length} phòng · {b.timezone}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </>
  );
}

function InfoTab({ org, onSaved }: { org: OrganizationDetail; onSaved: () => void }) {
  const [name, setName] = useState(org.name);
  const [status, setStatus] = useState(org.status);
  const [maxStudents, setMaxStudents] = useState(org.maxStudents?.toString() ?? "");
  const [maxTeachers, setMaxTeachers] = useState(org.maxTeachers?.toString() ?? "");
  const [msg, setMsg] = useState<string>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  useEffect(() => setMsg(undefined), [name, status, maxStudents, maxTeachers]);

  const toLimit = (v: string) => (v.trim() === "" ? null : Number(v));

  async function save(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(undefined);
    try {
      await api("PATCH", `/api/admin/organizations/${org.id}`, { name, status, maxStudents: toLimit(maxStudents), maxTeachers: toLimit(maxTeachers) });
      setMsg("Đã lưu.");
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Đã có lỗi xảy ra.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section>
      <form onSubmit={save} className="grid gap-4 sm:max-w-lg" noValidate>
        {error && <ErrorBox message={error} />}
        <Field label="Tên trung tâm" value={name} onChange={(e) => setName(e.target.value)} />
        <SelectField
          label="Trạng thái"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          options={[
            { value: "ACTIVE", label: "Đang hoạt động" },
            { value: "SUSPENDED", label: "Tạm ngưng (người dùng của trung tâm mất quyền truy cập)" },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Giới hạn học viên" inputMode="numeric" hint={`Đang dùng ${org.counts.students}. Để trống = không giới hạn`} value={maxStudents} onChange={(e) => setMaxStudents(e.target.value.replace(/\D/g, ""))} />
          <Field label="Giới hạn giáo viên" inputMode="numeric" hint={`Đang dùng ${org.counts.teachers}`} value={maxTeachers} onChange={(e) => setMaxTeachers(e.target.value.replace(/\D/g, ""))} />
        </div>
        <p className="text-xs text-muted">Vượt giới hạn chỉ chặn cấp tài khoản mới; người đang dùng không bị ảnh hưởng.</p>
        <div className="flex items-center gap-3">
          <PrimaryButton type="submit" loading={loading}>
            Lưu
          </PrimaryButton>
          {msg && <span className="text-sm text-brand-700">{msg}</span>}
        </div>
      </form>
    </Section>
  );
}

function AdminsTab({ orgId }: { orgId: string }) {
  const { data, error, reload } = useResource<AccountRow[]>(`/api/organizations/${orgId}/accounts`);
  const [issue, setIssue] = useState(false);
  const [reset, setReset] = useState<{ password: string; expiresAt?: string; name: string }>();
  const admins = data?.filter((a) => a.roles.includes("CENTER_ADMIN"));

  async function doReset(a: AccountRow) {
    if (!confirm(`Cấp lại mật khẩu tạm cho ${a.displayName}? Mọi phiên đăng nhập của người này sẽ bị đăng xuất.`)) return;
    const r = await api<{ temporaryPassword: string; temporaryPasswordExpiresAt: string }>("POST", `/api/organizations/${orgId}/accounts/${a.id}/reset-password`);
    setReset({ password: r.temporaryPassword, expiresAt: r.temporaryPasswordExpiresAt, name: a.displayName });
    reload();
  }

  return (
    <Section
      title="Quản trị trung tâm"
      action={
        <PrimaryButton onClick={() => setIssue(true)} icon={<UserPlus className="size-4" aria-hidden />}>
          Cấp tài khoản
        </PrimaryButton>
      }
    >
      {error && <ErrorBox message={error.message} />}
      {!data && !error && <Spinner />}
      {admins && admins.length === 0 && <EmptyState title="Chưa có quản trị trung tâm" hint="Cấp tài khoản để trung tâm tự quản lý giáo viên, học viên và lớp học." />}
      {admins && admins.length > 0 && (
        <ul className="divide-y divide-line">
          {admins.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{a.displayName}</p>
                <p className="text-sm text-muted">{a.identities.map((i) => i.value).join(" · ")}</p>
              </div>
              {a.mustChangePassword && <Badge tone="orange">Chưa đổi mật khẩu tạm</Badge>}
              {a.status === "LOCKED" && <Badge tone="red">Đã khóa</Badge>}
              <SecondaryButton onClick={() => doReset(a)} icon={<KeyRound className="size-4" aria-hidden />}>
                Cấp lại mật khẩu
              </SecondaryButton>
            </li>
          ))}
        </ul>
      )}
      <IssueAccountDialog
        open={issue}
        onClose={() => setIssue(false)}
        onDone={reload}
        title="Cấp tài khoản quản trị trung tâm"
        endpoint={`/api/organizations/${orgId}/accounts`}
        body={{ role: "CENTER_ADMIN" }}
      />
      <Dialog open={Boolean(reset)} title={`Mật khẩu tạm mới – ${reset?.name ?? ""}`} onClose={() => setReset(undefined)} footer={<PrimaryButton onClick={() => setReset(undefined)}>Xong</PrimaryButton>}>
        {reset && <TemporaryPasswordNotice password={reset.password} expiresAt={reset.expiresAt} />}
      </Dialog>
    </Section>
  );
}

function GrantsTab({ orgId }: { orgId: string }) {
  const grants = useResource<GrantedEdition[]>(`/api/organizations/${orgId}/curricula`);
  const tree = useResource<CurriculumTree>("/api/admin/curricula");
  const [editionId, setEditionId] = useState("");
  const [error, setError] = useState<string>();
  const granted = new Set(grants.data?.map((g) => g.edition.id));
  const options =
    tree.data?.series.flatMap((s) =>
      s.levels.flatMap((l) =>
        l.editions.filter((e) => e.status !== "ARCHIVED" && !granted.has(e.id)).map((e) => ({ value: e.id, label: `${l.code} – ${l.nameVi} · ${e.name}` })),
      ),
    ) ?? [];

  async function grant() {
    setError(undefined);
    try {
      await api("POST", `/api/organizations/${orgId}/curricula`, { editionId });
      setEditionId("");
      grants.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Đã có lỗi xảy ra.");
    }
  }

  async function revoke(g: GrantedEdition) {
    if (!confirm(`Thu hồi ${g.level.code} · ${g.edition.name}? Lớp đang học không bị gián đoạn, nhưng không tạo được lớp mới với phiên bản này.`)) return;
    await api("POST", `/api/organizations/${orgId}/curricula/${g.grantId}/revoke`);
    grants.reload();
  }

  return (
    <Section title="Giáo trình được cấp">
      {error && <ErrorBox message={error} />}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <SelectField label="Cấp thêm phiên bản" value={editionId} onChange={(e) => setEditionId(e.target.value)} options={options} placeholder="Chọn phiên bản giáo trình" />
        </div>
        <PrimaryButton onClick={grant} disabled={!editionId}>
          Cấp
        </PrimaryButton>
      </div>
      {grants.data && grants.data.length === 0 && <EmptyState title="Chưa cấp giáo trình" hint="Trung tâm chỉ tạo được lớp với phiên bản giáo trình được cấp." />}
      <ul className="divide-y divide-line">
        {grants.data?.map((g) => (
          <li key={g.grantId} className="flex flex-wrap items-center gap-3 py-3">
            <span className="w-20 font-mono text-sm font-semibold text-brand-800">{g.level.code}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {g.level.nameVi} · {g.edition.name}
              </p>
              <p className="text-xs text-muted">
                {g.series.nameVi} · {g.edition.lessonCount} bài · {EDITION_STATUS_LABEL[g.edition.status]}
              </p>
            </div>
            <SecondaryButton onClick={() => revoke(g)}>Thu hồi</SecondaryButton>
          </li>
        ))}
      </ul>
    </Section>
  );
}
