"use client";

import { TIMEZONE_OPTIONS, type OrganizationDetail } from "@th/contracts";
import { Archive, ArchiveRestore, DoorOpen, MapPin, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useOrgId } from "@/components/workspace";
import { ApiError, api } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { Badge, Dialog, EmptyState, ErrorBox, Field, PageHeader, PrimaryButton, Section, SecondaryButton, SelectField, Spinner } from "@/components/ui";

export default function SettingsPage() {
  const orgId = useOrgId();
  const { data, error, reload } = useResource<OrganizationDetail>(`/api/organizations/${orgId}`);
  if (error) return <ErrorBox message={error.message} />;
  if (!data) return <Spinner />;
  return (
    <>
      <PageHeader title="Cài đặt" subtitle={data.name} />
      <div className="grid gap-4 lg:grid-cols-2">
        <InfoForm org={data} onSaved={reload} />
        <RulesForm org={data} onSaved={reload} />
      </div>
      <div className="mt-4">
        <Branches org={data} onChanged={reload} />
      </div>
    </>
  );
}

function useSave(orgId: string, onSaved: () => void) {
  const [state, setState] = useState<{ loading?: boolean; error?: string; ok?: boolean }>({});
  return {
    state,
    save: async (body: object) => {
      setState({ loading: true });
      try {
        await api("PATCH", `/api/organizations/${orgId}`, body);
        setState({ ok: true });
        onSaved();
      } catch (e) {
        setState({ error: e instanceof ApiError ? e.message : "Đã có lỗi xảy ra." });
      }
    },
  };
}

function InfoForm({ org, onSaved }: { org: OrganizationDetail; onSaved: () => void }) {
  const [v, setV] = useState({ name: org.name, contactPhone: org.contactPhone ?? "", contactEmail: org.contactEmail ?? "", address: org.address ?? "" });
  const { state, save } = useSave(org.id, onSaved);
  return (
    <Section title="Thông tin trung tâm">
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void save(v);
        }}
        className="space-y-4"
        noValidate
      >
        {state.error && <ErrorBox message={state.error} />}
        <Field label="Tên trung tâm" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <Field label="Số điện thoại liên hệ" inputMode="tel" value={v.contactPhone} onChange={(e) => setV({ ...v, contactPhone: e.target.value })} />
        <Field label="Email liên hệ" type="email" value={v.contactEmail} onChange={(e) => setV({ ...v, contactEmail: e.target.value })} />
        <Field label="Địa chỉ" value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} />
        <div className="flex items-center gap-3">
          <PrimaryButton type="submit" loading={state.loading}>
            Lưu
          </PrimaryButton>
          {state.ok && <span className="text-sm text-brand-700">Đã lưu.</span>}
        </div>
      </form>
    </Section>
  );
}

function RulesForm({ org, onSaved }: { org: OrganizationDetail; onSaved: () => void }) {
  const [hours, setHours] = useState(String(org.attendanceEditHours));
  const [behind, setBehind] = useState(String(org.behindThresholdLessons));
  const { state, save } = useSave(org.id, onSaved);
  return (
    <Section title="Quy tắc vận hành">
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void save({ attendanceEditHours: Number(hours), behindThresholdLessons: Number(behind) });
        }}
        className="space-y-4"
        noValidate
      >
        {state.error && <ErrorBox message={state.error} />}
        <Field
          label="Giáo viên được sửa điểm danh trong (giờ)"
          inputMode="numeric"
          hint="Sau thời hạn này, giáo viên gửi yêu cầu sửa để quản lý duyệt."
          value={hours}
          onChange={(e) => setHours(e.target.value.replace(/\D/g, ""))}
        />
        <Field
          label="Cảnh báo lớp chậm từ (bài)"
          inputMode="numeric"
          hint="Lớp dạy chậm hơn kế hoạch từ số bài này trở lên sẽ được cảnh báo."
          value={behind}
          onChange={(e) => setBehind(e.target.value.replace(/\D/g, ""))}
        />
        <div className="flex items-center gap-3">
          <PrimaryButton type="submit" loading={state.loading}>
            Lưu
          </PrimaryButton>
          {state.ok && <span className="text-sm text-brand-700">Đã lưu.</span>}
        </div>
        <dl className="grid grid-cols-2 gap-2 border-t border-line pt-3 text-sm">
          <dt className="text-muted">Học viên</dt>
          <dd>
            {org.counts.students}
            {org.maxStudents != null && ` / ${org.maxStudents}`}
          </dd>
          <dt className="text-muted">Giáo viên</dt>
          <dd>
            {org.counts.teachers}
            {org.maxTeachers != null && ` / ${org.maxTeachers}`}
          </dd>
        </dl>
      </form>
    </Section>
  );
}

function Branches({ org, onChanged }: { org: OrganizationDetail; onChanged: () => void }) {
  const [branchDialog, setBranchDialog] = useState(false);
  const [roomFor, setRoomFor] = useState<string>();

  async function toggleRoom(roomId: string, status: "ACTIVE" | "ARCHIVED") {
    await api("PATCH", `/api/organizations/${org.id}/rooms/${roomId}`, { status });
    onChanged();
  }
  async function toggleBranch(branchId: string, status: "ACTIVE" | "ARCHIVED") {
    await api("PATCH", `/api/organizations/${org.id}/branches/${branchId}`, { status });
    onChanged();
  }

  return (
    <Section
      title="Cơ sở và phòng học"
      action={
        <PrimaryButton onClick={() => setBranchDialog(true)} icon={<Plus className="size-4" aria-hidden />}>
          Thêm cơ sở
        </PrimaryButton>
      }
    >
      {org.branches.length === 0 ? (
        <EmptyState icon={<MapPin className="size-8" />} title="Chưa có cơ sở" hint="Thêm cơ sở và phòng học trước khi tạo lớp." />
      ) : (
        <div className="space-y-4">
          {org.branches.map((b) => (
            <div key={b.id} className="rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-2 font-semibold">
                    {b.name} {b.status === "ARCHIVED" && <Badge>Ngừng dùng</Badge>}
                  </p>
                  <p className="text-sm text-muted">
                    {b.address ?? "Chưa có địa chỉ"} · {TIMEZONE_OPTIONS.find((t) => t.value === b.timezone)?.label ?? b.timezone}
                  </p>
                </div>
                <div className="flex gap-2">
                  {b.status === "ACTIVE" && (
                    <SecondaryButton onClick={() => setRoomFor(b.id)} icon={<DoorOpen className="size-4" aria-hidden />}>
                      Thêm phòng
                    </SecondaryButton>
                  )}
                  <SecondaryButton
                    onClick={() => toggleBranch(b.id, b.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE")}
                    icon={b.status === "ACTIVE" ? <Archive className="size-4" aria-hidden /> : <ArchiveRestore className="size-4" aria-hidden />}
                  >
                    {b.status === "ACTIVE" ? "Ngừng dùng" : "Dùng lại"}
                  </SecondaryButton>
                </div>
              </div>
              {b.rooms.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {b.rooms.map((r) => (
                    <li key={r.id} className={`flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm ${r.status === "ARCHIVED" ? "text-muted line-through" : ""}`}>
                      {r.name}
                      {r.capacity ? <span className="text-xs text-muted">{r.capacity} chỗ</span> : null}
                      <button
                        onClick={() => toggleRoom(r.id, r.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE")}
                        className="text-muted hover:text-ink"
                        aria-label={r.status === "ACTIVE" ? `Ngừng dùng phòng ${r.name}` : `Dùng lại phòng ${r.name}`}
                      >
                        {r.status === "ACTIVE" ? <Archive className="size-4" aria-hidden /> : <ArchiveRestore className="size-4" aria-hidden />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
      <BranchDialog open={branchDialog} orgId={org.id} onClose={() => setBranchDialog(false)} onSaved={onChanged} />
      <RoomDialog branchId={roomFor} orgId={org.id} onClose={() => setRoomFor(undefined)} onSaved={onChanged} />
    </Section>
  );
}

function BranchDialog({ open, orgId, onClose, onSaved }: { open: boolean; orgId: string; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ name: "", address: "", timezone: "Asia/Ho_Chi_Minh" });
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(undefined);
    try {
      await api("POST", `/api/organizations/${orgId}/branches`, v);
      setV({ name: "", address: "", timezone: "Asia/Ho_Chi_Minh" });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Đã có lỗi xảy ra.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <Dialog open={open} title="Thêm cơ sở" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <ErrorBox message={error} />}
        <Field label="Tên cơ sở" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <Field label="Địa chỉ" value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} />
        <SelectField label="Múi giờ" value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })} options={TIMEZONE_OPTIONS.map((t) => ({ ...t }))} />
        <div className="flex justify-end gap-2">
          <SecondaryButton type="button" onClick={onClose}>
            Hủy
          </SecondaryButton>
          <PrimaryButton type="submit" loading={loading}>
            Thêm
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}

function RoomDialog({ branchId, orgId, onClose, onSaved }: { branchId?: string; orgId: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(undefined);
    try {
      await api("POST", `/api/organizations/${orgId}/rooms`, { branchId, name, capacity: capacity ? Number(capacity) : null });
      setName("");
      setCapacity("");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Đã có lỗi xảy ra.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <Dialog open={Boolean(branchId)} title="Thêm phòng học" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <ErrorBox message={error} />}
        <Field label="Tên phòng" value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Sức chứa (không bắt buộc)" inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value.replace(/\D/g, ""))} />
        <div className="flex justify-end gap-2">
          <SecondaryButton type="button" onClick={onClose}>
            Hủy
          </SecondaryButton>
          <PrimaryButton type="submit" loading={loading}>
            Thêm
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}
