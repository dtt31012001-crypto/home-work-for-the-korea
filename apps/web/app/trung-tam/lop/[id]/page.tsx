"use client";

import { SESSION_KIND_LABEL, type ClassDetail, type ClassSummary, type OrganizationDetail, type PersonRow, type SessionView, type WeeklyRuleInput } from "@th/contracts";
import { ArrowLeft, CalendarClock, CalendarPlus, CalendarX, Pencil, UserCog, UserPlus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { EnrollmentBadge, PhaseBadge, SessionBadges } from "@/components/class-badges";
import { WeeklyRulesEditor } from "@/components/weekly-rules";
import { useOrgId } from "@/components/workspace";
import { ApiError, api } from "@/lib/api";
import { fmtDate, fmtMoney, localDay } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { Dialog, EmptyState, ErrorBox, Field, PageHeader, PrimaryButton, Section, SecondaryButton, SelectField, Spinner, Tabs, TextArea } from "@/components/ui";

type Tab = "students" | "sessions" | "info";
const vnDate = (d: string) => fmtDate(d + "T00:00:00Z", "UTC", { weekday: "short" });

/** Gửi form trong hộp thoại: quản lý trạng thái tải/lỗi dùng chung. */
function useSubmit(onDone: () => void) {
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  return {
    error,
    loading,
    submit: async (fn: () => Promise<unknown>) => {
      setError(undefined);
      setLoading(true);
      try {
        await fn();
        onDone();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Đã có lỗi xảy ra.");
      } finally {
        setLoading(false);
      }
    },
  };
}

function FormDialog({ title, onClose, onSubmit, loading, error, submitLabel, children }: { title: string; onClose: () => void; onSubmit: () => void; loading: boolean; error?: string; submitLabel: string; children: ReactNode }) {
  return (
    <Dialog open title={title} onClose={onClose}>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          onSubmit();
        }}
        className="space-y-4"
        noValidate
      >
        {error && <ErrorBox message={error} />}
        {children}
        <div className="flex justify-end gap-2">
          <SecondaryButton type="button" onClick={onClose}>
            Hủy
          </SecondaryButton>
          <PrimaryButton type="submit" loading={loading}>
            {submitLabel}
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}

export default function ClassDetailPage() {
  const orgId = useOrgId();
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useResource<ClassDetail>(`/api/organizations/${orgId}/classes/${id}`);
  const [tab, setTab] = useState<Tab>("students");
  const [dialog, setDialog] = useState<"teacher" | "schedule">();

  if (error) return <ErrorBox message={error.message} />;
  if (!data) return <Spinner />;

  return (
    <>
      <Link href="/trung-tam/lop" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Lớp học
      </Link>
      <PageHeader
        title={data.name}
        subtitle={`${data.level.code} – ${data.level.nameVi} · ${data.edition.name} · ${data.branch.name}`}
        action={
          <div className="flex flex-wrap gap-2">
            <SecondaryButton onClick={() => setDialog("teacher")} icon={<UserCog className="size-4" aria-hidden />}>
              Đổi giáo viên
            </SecondaryButton>
            <SecondaryButton onClick={() => setDialog("schedule")} icon={<CalendarClock className="size-4" aria-hidden />}>
              Đổi lịch cố định
            </SecondaryButton>
          </div>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Trạng thái" value={<PhaseBadge phase={data.phase} />} />
        <Stat label="Lịch" value={data.schedule || "—"} />
        <Stat label="Giáo viên" value={data.teacher?.displayName ?? "—"} />
        <Stat label="Thời gian" value={`${vnDate(data.startDate)} → ${data.expectedEndDate ? vnDate(data.expectedEndDate) : "—"}`} />
      </div>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "students", label: `Học viên (${data.activeStudents})` },
          { value: "sessions", label: `Buổi học (${data.sessions.filter((s) => s.status !== "CANCELLED").length})` },
          { value: "info", label: "Thông tin" },
        ]}
      />
      {tab === "students" && <StudentsTab orgId={orgId} cls={data} onChanged={reload} />}
      {tab === "sessions" && <SessionsTab orgId={orgId} cls={data} onChanged={reload} />}
      {tab === "info" && <InfoTab orgId={orgId} cls={data} onChanged={reload} />}
      {dialog === "teacher" && <ChangeTeacherDialog orgId={orgId} cls={data} onClose={() => setDialog(undefined)} onDone={reload} />}
      {dialog === "schedule" && <ChangeScheduleDialog orgId={orgId} cls={data} onClose={() => setDialog(undefined)} onDone={reload} />}
    </>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------- Học viên

function StudentsTab({ orgId, cls, onChanged }: { orgId: string; cls: ClassDetail; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [action, setAction] = useState<{ kind: "hold" | "resume" | "transfer" | "withdraw"; e: ClassDetail["enrollments"][number] }>();
  return (
    <Section
      action={
        cls.status === "OPEN" && (
          <PrimaryButton onClick={() => setAdding(true)} icon={<UserPlus className="size-4" aria-hidden />}>
            Thêm học viên
          </PrimaryButton>
        )
      }
      title="Học viên"
    >
      {cls.enrollments.length === 0 ? (
        <EmptyState title="Lớp chưa có học viên" hint="Thêm học viên đã có tài khoản tại trung tâm." />
      ) : (
        <ul className="divide-y divide-line">
          {cls.enrollments.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {e.student.displayName} <EnrollmentBadge status={e.status} />
                </p>
                <p className="text-sm text-muted">
                  Từ {vnDate(e.startDate)}
                  {e.endDate && ` đến ${vnDate(e.endDate)}`}
                  {e.status === "ON_HOLD" && e.holdFrom && ` · Bảo lưu từ ${vnDate(e.holdFrom)}${e.holdUntil ? ` đến ${vnDate(e.holdUntil)}` : ""}`}
                  {e.note && ` · ${e.note}`}
                </p>
              </div>
              {(e.status === "ACTIVE" || e.status === "ON_HOLD") && (
                <div className="flex flex-wrap gap-2">
                  {e.status === "ACTIVE" ? (
                    <SecondaryButton onClick={() => setAction({ kind: "hold", e })}>Bảo lưu</SecondaryButton>
                  ) : (
                    <SecondaryButton onClick={() => setAction({ kind: "resume", e })}>Học tiếp</SecondaryButton>
                  )}
                  <SecondaryButton onClick={() => setAction({ kind: "transfer", e })}>Chuyển lớp</SecondaryButton>
                  <SecondaryButton onClick={() => setAction({ kind: "withdraw", e })}>Nghỉ học</SecondaryButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding && <EnrollDialog orgId={orgId} cls={cls} onClose={() => setAdding(false)} onDone={onChanged} />}
      {action && <EnrollmentActionDialog orgId={orgId} cls={cls} {...action} onClose={() => setAction(undefined)} onDone={onChanged} />}
    </Section>
  );
}

function EnrollDialog({ orgId, cls, onClose, onDone }: { orgId: string; cls: ClassDetail; onClose: () => void; onDone: () => void }) {
  const { data } = useResource<PersonRow[]>(`/api/organizations/${orgId}/accounts?role=STUDENT`);
  const open = new Set(cls.enrollments.filter((e) => e.status === "ACTIVE" || e.status === "ON_HOLD").map((e) => e.student.id));
  const candidates = data?.filter((p) => !open.has(p.id)) ?? [];
  const [picked, setPicked] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(cls.startDate > localDay(new Date()) ? cls.startDate : localDay(new Date()));
  const s = useSubmit(() => {
    onDone();
    onClose();
  });
  return (
    <FormDialog
      title="Thêm học viên vào lớp"
      onClose={onClose}
      loading={s.loading}
      error={s.error}
      submitLabel={`Thêm ${picked.length || ""} học viên`}
      onSubmit={() => s.submit(() => api("POST", `/api/organizations/${orgId}/classes/${cls.id}/enrollments`, { studentUserIds: picked, startDate }))}
    >
      <Field label="Học từ ngày" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      {!data && <Spinner />}
      {data && candidates.length === 0 && <p className="text-sm text-muted">Tất cả học viên của trung tâm đã ở trong lớp.</p>}
      <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line">
        {candidates.map((p) => (
          <li key={p.id}>
            <label className="flex items-center gap-3 px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-brand-700"
                checked={picked.includes(p.id)}
                onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))}
              />
              <span className="flex-1">{p.displayName}</span>
              <span className="text-xs text-muted">{p.identities[0]?.value}</span>
            </label>
          </li>
        ))}
      </ul>
    </FormDialog>
  );
}

function EnrollmentActionDialog({
  orgId,
  cls,
  kind,
  e,
  onClose,
  onDone,
}: {
  orgId: string;
  cls: ClassDetail;
  kind: "hold" | "resume" | "transfer" | "withdraw";
  e: ClassDetail["enrollments"][number];
  onClose: () => void;
  onDone: () => void;
}) {
  const today = localDay(new Date());
  const [date, setDate] = useState(today);
  const [until, setUntil] = useState("");
  const [note, setNote] = useState("");
  const [toClassId, setToClassId] = useState("");
  const classes = useResource<ClassSummary[]>(kind === "transfer" ? `/api/organizations/${orgId}/classes` : null);
  const s = useSubmit(() => {
    onDone();
    onClose();
  });
  const base = `/api/organizations/${orgId}/enrollments/${e.id}`;
  const titles = { hold: "Bảo lưu", resume: "Học tiếp", transfer: "Chuyển lớp", withdraw: "Nghỉ học" } as const;
  return (
    <FormDialog
      title={`${titles[kind]} – ${e.student.displayName}`}
      onClose={onClose}
      loading={s.loading}
      error={s.error}
      submitLabel={titles[kind]}
      onSubmit={() =>
        s.submit(() =>
          kind === "hold"
            ? api("POST", `${base}/hold`, { fromDate: date, untilDate: until || null, note: note || undefined })
            : kind === "resume"
              ? api("POST", `${base}/resume`, { date })
              : kind === "transfer"
                ? api("POST", `${base}/transfer`, { toClassId, date, note: note || undefined })
                : api("POST", `${base}/withdraw`, { date, note: note || undefined }),
        )
      }
    >
      {kind === "transfer" && (
        <SelectField
          label="Lớp đích"
          value={toClassId}
          onChange={(ev) => setToClassId(ev.target.value)}
          placeholder="Chọn lớp"
          options={(classes.data ?? []).filter((c) => c.id !== cls.id && c.status === "OPEN").map((c) => ({ value: c.id, label: `${c.name} · ${c.level.code} · ${c.schedule}` }))}
        />
      )}
      <Field label={kind === "hold" ? "Bảo lưu từ ngày" : kind === "resume" ? "Học lại từ ngày" : kind === "transfer" ? "Chuyển từ ngày" : "Nghỉ từ ngày"} type="date" value={date} onChange={(ev) => setDate(ev.target.value)} />
      {kind === "hold" && <Field label="Dự kiến quay lại (không bắt buộc)" type="date" value={until} onChange={(ev) => setUntil(ev.target.value)} />}
      {kind !== "resume" && <TextArea label="Ghi chú (không bắt buộc)" value={note} onChange={(ev) => setNote(ev.target.value)} />}
      {kind === "transfer" && <p className="text-xs text-muted">Lịch sử điểm danh ở lớp hiện tại được giữ nguyên.</p>}
      {kind === "hold" && <p className="text-xs text-muted">Trong thời gian bảo lưu học viên không bị tính vắng.</p>}
    </FormDialog>
  );
}

// ---------------------------------------------------------------- Buổi học

function SessionsTab({ orgId, cls, onChanged }: { orgId: string; cls: ClassDetail; onChanged: () => void }) {
  const [edit, setEdit] = useState<SessionView>();
  const [cancel, setCancel] = useState<SessionView>();
  const [adding, setAdding] = useState(false);
  const today = localDay(new Date(), cls.branch.timezone);
  return (
    <Section
      title="Buổi học"
      action={
        <SecondaryButton onClick={() => setAdding(true)} icon={<CalendarPlus className="size-4" aria-hidden />}>
          Thêm buổi
        </SecondaryButton>
      }
    >
      <ul className="divide-y divide-line">
        {cls.sessions.map((s) => (
          <li key={s.id} className={`flex flex-wrap items-center gap-3 py-2.5 ${s.status === "CANCELLED" ? "opacity-60" : ""} ${s.date === today ? "rounded-lg bg-brand-50 px-2" : ""}`}>
            <span className="w-10 shrink-0 text-right font-mono text-sm text-muted">{s.number ?? "·"}</span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {vnDate(s.date)} · {s.startTime}–{s.endTime} <SessionBadges kind={s.kind} status={s.status} />
              </p>
              <p className="text-xs text-muted">
                {s.room?.name ?? "Chưa xếp phòng"} · {s.teacher?.displayName ?? "—"}
                {s.plannedLesson && ` · Bài ${s.plannedLesson.number}. ${s.plannedLesson.titleVi}`}
                {s.cancelReason && ` · Lý do nghỉ: ${s.cancelReason}`}
              </p>
            </div>
            {s.status === "SCHEDULED" && (
              <div className="flex gap-1">
                <button onClick={() => setEdit(s)} className="rounded-lg p-2 text-muted hover:bg-canvas" aria-label={`Đổi buổi ${vnDate(s.date)}`}>
                  <Pencil className="size-4" aria-hidden />
                </button>
                <button onClick={() => setCancel(s)} className="rounded-lg p-2 text-muted hover:bg-canvas" aria-label={`Nghỉ buổi ${vnDate(s.date)}`}>
                  <CalendarX className="size-4" aria-hidden />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {edit && <EditSessionDialog orgId={orgId} cls={cls} s={edit} onClose={() => setEdit(undefined)} onDone={onChanged} />}
      {cancel && <CancelSessionDialog orgId={orgId} cls={cls} s={cancel} onClose={() => setCancel(undefined)} onDone={onChanged} />}
      {adding && <AddSessionDialog orgId={orgId} cls={cls} onClose={() => setAdding(false)} onDone={onChanged} />}
    </Section>
  );
}

function useRooms(orgId: string, branchId: string) {
  const org = useResource<OrganizationDetail>(`/api/organizations/${orgId}`);
  return org.data?.branches.find((b) => b.id === branchId)?.rooms.filter((r) => r.status === "ACTIVE") ?? [];
}

function EditSessionDialog({ orgId, cls, s, onClose, onDone }: { orgId: string; cls: ClassDetail; s: SessionView; onClose: () => void; onDone: () => void }) {
  const rooms = useRooms(orgId, cls.branch.id);
  const teachers = useResource<PersonRow[]>(`/api/organizations/${orgId}/accounts?role=TEACHER`);
  const [v, setV] = useState({ date: s.date, startTime: s.startTime, endTime: s.endTime, roomId: s.room?.id ?? "", teacherUserId: s.teacher?.id ?? "", reason: "" });
  const sub = useSubmit(() => {
    onDone();
    onClose();
  });
  return (
    <FormDialog
      title={`Đổi buổi ${vnDate(s.date)}`}
      onClose={onClose}
      loading={sub.loading}
      error={sub.error}
      submitLabel="Lưu"
      onSubmit={() =>
        sub.submit(() =>
          api("PATCH", `/api/organizations/${orgId}/sessions/${s.id}`, { ...v, roomId: v.roomId || null, teacherUserId: v.teacherUserId || null, reason: v.reason || undefined }),
        )
      }
    >
      <Field label="Ngày" type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Bắt đầu" type="time" value={v.startTime} onChange={(e) => setV({ ...v, startTime: e.target.value })} />
        <Field label="Kết thúc" type="time" value={v.endTime} onChange={(e) => setV({ ...v, endTime: e.target.value })} />
      </div>
      <SelectField label="Phòng" value={v.roomId} onChange={(e) => setV({ ...v, roomId: e.target.value })} placeholder="Chưa xếp phòng" options={rooms.map((r) => ({ value: r.id, label: r.name }))} />
      <SelectField
        label="Giáo viên"
        value={v.teacherUserId}
        onChange={(e) => setV({ ...v, teacherUserId: e.target.value })}
        options={(teachers.data ?? []).filter((t) => t.status === "ACTIVE").map((t) => ({ value: t.id, label: t.displayName }))}
      />
      <Field label="Lý do (không bắt buộc)" value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} />
    </FormDialog>
  );
}

function CancelSessionDialog({ orgId, cls, s, onClose, onDone }: { orgId: string; cls: ClassDetail; s: SessionView; onClose: () => void; onDone: () => void }) {
  const rooms = useRooms(orgId, cls.branch.id);
  const [reason, setReason] = useState("");
  const [makeup, setMakeup] = useState(false);
  const [m, setM] = useState({ date: "", startTime: s.startTime, endTime: s.endTime, roomId: s.room?.id ?? "" });
  const sub = useSubmit(() => {
    onDone();
    onClose();
  });
  return (
    <FormDialog
      title={`Nghỉ buổi ${vnDate(s.date)}`}
      onClose={onClose}
      loading={sub.loading}
      error={sub.error}
      submitLabel="Xác nhận nghỉ"
      onSubmit={() =>
        sub.submit(() => api("POST", `/api/organizations/${orgId}/sessions/${s.id}/cancel`, { reason, makeup: makeup ? { ...m, roomId: m.roomId || null } : undefined }))
      }
    >
      <Field label="Lý do nghỉ" value={reason} onChange={(e) => setReason(e.target.value)} />
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" className="size-4 accent-brand-700" checked={makeup} onChange={(e) => setMakeup(e.target.checked)} /> Tạo buổi học bù
      </label>
      {makeup && (
        <>
          <Field label="Ngày học bù" type="date" value={m.date} onChange={(e) => setM({ ...m, date: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bắt đầu" type="time" value={m.startTime} onChange={(e) => setM({ ...m, startTime: e.target.value })} />
            <Field label="Kết thúc" type="time" value={m.endTime} onChange={(e) => setM({ ...m, endTime: e.target.value })} />
          </div>
          <SelectField label="Phòng" value={m.roomId} onChange={(e) => setM({ ...m, roomId: e.target.value })} placeholder="Chưa xếp phòng" options={rooms.map((r) => ({ value: r.id, label: r.name }))} />
          {s.plannedLesson && <p className="text-xs text-muted">Buổi bù học bài dự kiến: Bài {s.plannedLesson.number}.</p>}
        </>
      )}
    </FormDialog>
  );
}

function AddSessionDialog({ orgId, cls, onClose, onDone }: { orgId: string; cls: ClassDetail; onClose: () => void; onDone: () => void }) {
  const rooms = useRooms(orgId, cls.branch.id);
  const [v, setV] = useState({ kind: "EXAM" as "EXAM" | "EXTRA", date: "", startTime: "18:00", endTime: "19:30", roomId: cls.defaultRoom?.id ?? "" });
  const sub = useSubmit(() => {
    onDone();
    onClose();
  });
  return (
    <FormDialog
      title="Thêm buổi"
      onClose={onClose}
      loading={sub.loading}
      error={sub.error}
      submitLabel="Thêm"
      onSubmit={() => sub.submit(() => api("POST", `/api/organizations/${orgId}/classes/${cls.id}/sessions`, { ...v, roomId: v.roomId || null }))}
    >
      <SelectField
        label="Loại buổi"
        value={v.kind}
        onChange={(e) => setV({ ...v, kind: e.target.value as typeof v.kind })}
        options={[
          { value: "EXAM", label: SESSION_KIND_LABEL.EXAM },
          { value: "EXTRA", label: SESSION_KIND_LABEL.EXTRA },
        ]}
      />
      <Field label="Ngày" type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Bắt đầu" type="time" value={v.startTime} onChange={(e) => setV({ ...v, startTime: e.target.value })} />
        <Field label="Kết thúc" type="time" value={v.endTime} onChange={(e) => setV({ ...v, endTime: e.target.value })} />
      </div>
      <SelectField label="Phòng" value={v.roomId} onChange={(e) => setV({ ...v, roomId: e.target.value })} placeholder="Chưa xếp phòng" options={rooms.map((r) => ({ value: r.id, label: r.name }))} />
    </FormDialog>
  );
}

function ChangeTeacherDialog({ orgId, cls, onClose, onDone }: { orgId: string; cls: ClassDetail; onClose: () => void; onDone: () => void }) {
  const teachers = useResource<PersonRow[]>(`/api/organizations/${orgId}/accounts?role=TEACHER`);
  const [teacherUserId, setTeacher] = useState("");
  const [fromDate, setFrom] = useState(localDay(new Date()));
  const sub = useSubmit(() => {
    onDone();
    onClose();
  });
  return (
    <FormDialog title="Đổi giáo viên phụ trách" onClose={onClose} loading={sub.loading} error={sub.error} submitLabel="Đổi giáo viên" onSubmit={() => sub.submit(() => api("POST", `/api/organizations/${orgId}/classes/${cls.id}/teacher`, { teacherUserId, fromDate }))}>
      <SelectField
        label="Giáo viên mới"
        value={teacherUserId}
        onChange={(e) => setTeacher(e.target.value)}
        placeholder="Chọn giáo viên"
        options={(teachers.data ?? []).filter((t) => t.status === "ACTIVE" && t.id !== cls.teacher?.id).map((t) => ({ value: t.id, label: t.displayName }))}
      />
      <Field label="Áp dụng từ ngày" type="date" value={fromDate} onChange={(e) => setFrom(e.target.value)} />
      <p className="text-xs text-muted">Các buổi chưa học từ ngày này chuyển sang giáo viên mới. Giáo viên cũ không còn mở được các buổi đó.</p>
    </FormDialog>
  );
}

function ChangeScheduleDialog({ orgId, cls, onClose, onDone }: { orgId: string; cls: ClassDetail; onClose: () => void; onDone: () => void }) {
  const [rules, setRules] = useState<WeeklyRuleInput[]>(cls.rules.length ? cls.rules : [{ weekday: 1, startTime: "18:00", endTime: "19:30" }]);
  const [fromDate, setFrom] = useState(localDay(new Date()));
  const sub = useSubmit(() => {
    onDone();
    onClose();
  });
  return (
    <FormDialog title="Đổi lịch cố định" onClose={onClose} loading={sub.loading} error={sub.error} submitLabel="Đổi lịch" onSubmit={() => sub.submit(() => api("POST", `/api/organizations/${orgId}/classes/${cls.id}/schedule`, { fromDate, rules }))}>
      <Field label="Áp dụng từ ngày" type="date" value={fromDate} onChange={(e) => setFrom(e.target.value)} />
      <WeeklyRulesEditor value={rules} onChange={setRules} />
      <p className="text-xs text-muted">Các buổi chính khóa chưa học từ ngày này được dời theo lịch mới, giữ nguyên số buổi và bài dự kiến.</p>
    </FormDialog>
  );
}

// ---------------------------------------------------------------- Thông tin

function InfoTab({ orgId, cls, onChanged }: { orgId: string; cls: ClassDetail; onChanged: () => void }) {
  const rooms = useRooms(orgId, cls.branch.id);
  const [v, setV] = useState({ name: cls.name, defaultRoomId: cls.defaultRoom?.id ?? "", tuitionAmount: cls.tuitionAmount?.toString() ?? "", status: cls.status });
  const [saved, setSaved] = useState(false);
  const sub = useSubmit(() => {
    setSaved(true);
    onChanged();
  });
  return (
    <Section title="Thông tin lớp">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(false);
          void sub.submit(() =>
            api("PATCH", `/api/organizations/${orgId}/classes/${cls.id}`, {
              name: v.name,
              defaultRoomId: v.defaultRoomId || null,
              tuitionAmount: v.tuitionAmount ? Number(v.tuitionAmount) : null,
              status: v.status,
            }),
          );
        }}
        className="grid gap-4 sm:max-w-lg"
        noValidate
      >
        {sub.error && <ErrorBox message={sub.error} />}
        <Field label="Tên lớp" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <SelectField label="Phòng mặc định" value={v.defaultRoomId} onChange={(e) => setV({ ...v, defaultRoomId: e.target.value })} placeholder="Chưa xếp phòng" options={rooms.map((r) => ({ value: r.id, label: r.name }))} />
        <Field
          label="Học phí tham chiếu (VND)"
          inputMode="numeric"
          hint={v.tuitionAmount ? fmtMoney(Number(v.tuitionAmount)) : "Chỉ để tham chiếu – chưa quản lý thu tiền"}
          value={v.tuitionAmount}
          onChange={(e) => setV({ ...v, tuitionAmount: e.target.value.replace(/\D/g, "") })}
        />
        <SelectField
          label="Trạng thái lớp"
          value={v.status}
          onChange={(e) => setV({ ...v, status: e.target.value as typeof v.status })}
          options={[
            { value: "OPEN", label: "Đang mở" },
            { value: "COMPLETED", label: "Đã kết thúc" },
            { value: "CANCELLED", label: "Đã hủy" },
          ]}
        />
        <dl className="grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-muted">Bài bắt đầu</dt>
          <dd>Bài {cls.startLessonNumber}</dd>
          <dt className="text-muted">Số buổi mỗi bài</dt>
          <dd>{cls.sessionsPerLesson}</dd>
          <dt className="text-muted">Lịch sử giáo viên</dt>
          <dd>
            {cls.teachers.map((t) => (
              <span key={t.validFrom} className="block">
                {t.teacher.displayName}: {vnDate(t.validFrom)} → {t.validTo ? vnDate(t.validTo) : "nay"}
              </span>
            ))}
          </dd>
        </dl>
        <div className="flex items-center gap-3">
          <PrimaryButton type="submit" loading={sub.loading}>
            Lưu
          </PrimaryButton>
          {saved && <span className="text-sm text-brand-700">Đã lưu.</span>}
        </div>
      </form>
    </Section>
  );
}
