"use client";

import { LINK_STATUS_LABEL, ageOn, isMinor, todayVN, type GuardianLinkView, type IssueAccountResponse, type StudentDetail } from "@th/contracts";
import { ArrowLeft, Link2Off, Pencil, UserPlus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AccountActions, PersonBadges } from "@/components/people-list";
import { useOrgId } from "@/components/workspace";
import { ApiError, api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
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
  TemporaryPasswordNotice,
  TextArea,
  WarnBox,
} from "@/components/ui";

const LINK_TONE: Record<GuardianLinkView["status"], "green" | "orange" | "gray" | "red"> = {
  ACTIVE: "green",
  PENDING_CONSENT: "orange",
  PAUSED_ADULT: "orange",
  REJECTED: "red",
  REVOKED: "gray",
};

export default function StudentDetailPage() {
  const orgId = useOrgId();
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useResource<StudentDetail>(`/api/organizations/${orgId}/students/${id}`);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);

  if (error) return <ErrorBox message={error.message} />;
  if (!data) return <Spinner />;
  const minor = isMinor(data.dateOfBirth);

  return (
    <>
      <Link href="/trung-tam/hoc-vien" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Học viên
      </Link>
      <PageHeader title={data.displayName} subtitle={data.identities.map((i) => i.value).join(" · ")} action={<div className="flex flex-wrap gap-2"><PersonBadges p={data} /></div>} />
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-2">
          <Section
            title="Hồ sơ"
            action={
              !data.otherCenters && (
                <SecondaryButton onClick={() => setEditing(true)} icon={<Pencil className="size-4" aria-hidden />}>
                  Sửa
                </SecondaryButton>
              )
            }
          >
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-muted">Ngày sinh</dt>
              <dd>{data.dateOfBirth ? `${fmtDate(data.dateOfBirth + "T00:00:00Z", "UTC")} (${ageOn(data.dateOfBirth, todayVN())} tuổi)` : "Chưa có"}</dd>
              <dt className="text-muted">Phân loại</dt>
              <dd>{data.dateOfBirth ? (minor ? "Chưa thành niên" : "Đã thành niên") : "Chưa xác định"}</dd>
            </dl>
          </Section>
          <Section title="Tài khoản">
            <AccountActions p={data} orgId={orgId} role="STUDENT" onChanged={reload} />
          </Section>
        </div>
        <div className="lg:col-span-3">
          <Section
            title="Phụ huynh"
            action={
              <PrimaryButton onClick={() => setAdding(true)} icon={<UserPlus className="size-4" aria-hidden />}>
                Thêm phụ huynh
              </PrimaryButton>
            }
          >
            {data.guardians.length === 0 ? (
              <EmptyState title="Chưa liên kết phụ huynh" hint="Không bắt buộc. Phụ huynh được liên kết sẽ xem lịch học và điểm danh của học viên." />
            ) : (
              <ul className="divide-y divide-line">
                {data.guardians.map((g) => (
                  <GuardianItem key={g.id} g={g} orgId={orgId} onChanged={reload} />
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
      {editing && <ProfileDialog orgId={orgId} student={data} onClose={() => setEditing(false)} onSaved={reload} />}
      {adding && <AddGuardianDialog orgId={orgId} student={data} onClose={() => setAdding(false)} onSaved={reload} />}
    </>
  );
}

function GuardianItem({ g, orgId, onChanged }: { g: GuardianLinkView; orgId: string; onChanged: () => void }) {
  const open = g.status === "ACTIVE" || g.status === "PENDING_CONSENT" || g.status === "PAUSED_ADULT";
  return (
    <li className="flex flex-wrap items-start gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          {g.guardian.displayName} <span className="text-sm font-normal text-muted">· {g.relationship}</span>
          <Badge tone={LINK_TONE[g.status]}>{LINK_STATUS_LABEL[g.status]}</Badge>
        </p>
        <p className="text-sm text-muted">{g.guardian.identities.map((i) => i.value).join(" · ")}</p>
        {g.verificationNote && <p className="mt-1 text-xs text-muted">Xác minh: {g.verificationNote}</p>}
      </div>
      {open && (
        <SecondaryButton
          onClick={async () => {
            const reason = prompt(`Thu hồi liên kết với ${g.guardian.displayName}? Phụ huynh mất quyền xem ngay. Lý do (không bắt buộc):`);
            if (reason === null) return;
            await api("POST", `/api/organizations/${orgId}/guardian-links/${g.id}/revoke`, { reason: reason || undefined });
            onChanged();
          }}
          icon={<Link2Off className="size-4" aria-hidden />}
        >
          Thu hồi
        </SecondaryButton>
      )}
    </li>
  );
}

function ProfileDialog({ orgId, student, onClose, onSaved }: { orgId: string; student: StudentDetail; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(student.displayName);
  const [dob, setDob] = useState(student.dateOfBirth ?? "");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api("PATCH", `/api/organizations/${orgId}/accounts/${student.id}`, { displayName: name, dateOfBirth: dob || null });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Đã có lỗi xảy ra.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <Dialog open title="Sửa hồ sơ" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <ErrorBox message={error} />}
        <Field label="Họ và tên" value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Ngày sinh" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
        <div className="flex justify-end gap-2">
          <SecondaryButton type="button" onClick={onClose}>
            Hủy
          </SecondaryButton>
          <PrimaryButton type="submit" loading={loading}>
            Lưu
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}

const RELATIONSHIPS = ["Mẹ", "Bố", "Ông", "Bà", "Anh/Chị", "Người giám hộ khác"];

function AddGuardianDialog({ orgId, student, onClose, onSaved }: { orgId: string; student: StudentDetail; onClose: () => void; onSaved: () => void }) {
  const minor = isMinor(student.dateOfBirth);
  const [v, setV] = useState({ displayName: "", phone: "", email: "", relationship: "Mẹ", verificationNote: "" });
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ link: GuardianLinkView; account: IssueAccountResponse }>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (minor && !v.verificationNote.trim()) return setError("Học viên chưa thành niên: cần ghi cách trung tâm đã xác minh người giám hộ.");
    setLoading(true);
    try {
      const r = await api<{ link: GuardianLinkView; account: IssueAccountResponse }>("POST", `/api/organizations/${orgId}/students/${student.id}/guardians`, {
        ...v,
        phone: v.phone || undefined,
        email: v.email || undefined,
        verificationNote: v.verificationNote || undefined,
      });
      setResult(r);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Đã có lỗi xảy ra.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open title={`Thêm phụ huynh cho ${student.displayName}`} onClose={onClose} footer={result ? <PrimaryButton onClick={onClose}>Xong</PrimaryButton> : undefined}>
      {result ? (
        <div className="space-y-4">
          <p className="text-sm">
            Trạng thái liên kết: <Badge tone={LINK_TONE[result.link.status]}>{LINK_STATUS_LABEL[result.link.status]}</Badge>
          </p>
          {result.link.status === "PENDING_CONSENT" && <WarnBox>Học viên đã thành niên: phụ huynh chỉ xem được dữ liệu sau khi học viên đồng ý trong ứng dụng.</WarnBox>}
          {result.account.temporaryPassword ? (
            <TemporaryPasswordNotice password={result.account.temporaryPassword} expiresAt={result.account.temporaryPasswordExpiresAt} identifier={v.phone || v.email} />
          ) : (
            <p className="text-sm">Phụ huynh đã có tài khoản – tiếp tục đăng nhập bằng mật khẩu hiện tại.</p>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <ErrorBox message={error} />}
          {student.dateOfBirth === null && <WarnBox>Học viên chưa có ngày sinh nên được coi là đã thành niên: liên kết cần học viên đồng ý.</WarnBox>}
          <Field label="Họ và tên phụ huynh" value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })} />
          <Field label="Số điện thoại" inputMode="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
          <Field label="Email (không bắt buộc)" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
          <SelectField label="Quan hệ" value={v.relationship} onChange={(e) => setV({ ...v, relationship: e.target.value })} options={RELATIONSHIPS.map((r) => ({ value: r, label: r }))} />
          {minor && (
            <TextArea
              label="Cách xác minh người giám hộ (bắt buộc)"
              placeholder="vd. Đối chiếu giấy khai sinh tại quầy ngày …"
              value={v.verificationNote}
              onChange={(e) => setV({ ...v, verificationNote: e.target.value })}
            />
          )}
          <div className="flex justify-end gap-2">
            <SecondaryButton type="button" onClick={onClose}>
              Hủy
            </SecondaryButton>
            <PrimaryButton type="submit" loading={loading}>
              Liên kết
            </PrimaryButton>
          </div>
        </form>
      )}
    </Dialog>
  );
}
