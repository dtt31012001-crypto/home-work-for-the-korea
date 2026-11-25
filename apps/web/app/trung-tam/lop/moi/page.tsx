"use client";

import type { ClassPreview, GrantedEdition, OrganizationDetail, PersonRow, WeeklyRuleInput } from "@th/contracts";
import { ArrowLeft, CalendarCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { WeeklyRulesEditor } from "@/components/weekly-rules";
import { useOrgId } from "@/components/workspace";
import { ApiError, api } from "@/lib/api";
import { fmtDate, fmtMoney } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { ErrorBox, Field, PageHeader, PrimaryButton, Section, SecondaryButton, SelectField, Spinner, WarnBox } from "@/components/ui";

interface Lesson {
  id: string;
  number: number;
  titleVi: string;
}

const vnDate = (d: string) => fmtDate(d + "T00:00:00Z", "UTC", { weekday: "short" });

export default function NewClassPage() {
  const orgId = useOrgId();
  const router = useRouter();
  const org = useResource<OrganizationDetail>(`/api/organizations/${orgId}`);
  const grants = useResource<GrantedEdition[]>(`/api/organizations/${orgId}/curricula`);
  const teachers = useResource<PersonRow[]>(`/api/organizations/${orgId}/accounts?role=TEACHER`);
  const [v, setV] = useState({
    name: "",
    branchId: "",
    defaultRoomId: "",
    editionId: "",
    startLessonNumber: "",
    sessionsPerLesson: "1",
    teacherUserId: "",
    startDate: "",
    plannedSessions: "24",
    tuitionAmount: "",
  });
  const [rules, setRules] = useState<WeeklyRuleInput[]>([
    { weekday: 1, startTime: "18:00", endTime: "19:30" },
    { weekday: 3, startTime: "18:00", endTime: "19:30" },
    { weekday: 5, startTime: "18:00", endTime: "19:30" },
  ]);
  const lessons = useResource<Lesson[]>(v.editionId ? `/api/organizations/${orgId}/curricula/${v.editionId}/lessons` : null);
  const [preview, setPreview] = useState<ClassPreview>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState<"preview" | "create">();

  const branches = org.data?.branches.filter((b) => b.status === "ACTIVE") ?? [];
  const rooms = branches.find((b) => b.id === v.branchId)?.rooms.filter((r) => r.status === "ACTIVE") ?? [];
  const editions = grants.data?.filter((g) => g.edition.status === "ACTIVE") ?? [];
  const activeTeachers = teachers.data?.filter((t) => t.status === "ACTIVE") ?? [];

  useEffect(() => {
    if (!v.branchId && branches.length === 1) setV((x) => ({ ...x, branchId: branches[0]!.id }));
  }, [branches, v.branchId]);
  useEffect(() => {
    if (lessons.data?.length && !lessons.data.some((l) => String(l.number) === v.startLessonNumber)) setV((x) => ({ ...x, startLessonNumber: String(lessons.data![0]!.number) }));
  }, [lessons.data, v.startLessonNumber]);
  useEffect(() => setPreview(undefined), [v, rules]);

  const body = useMemo(
    () => ({
      name: v.name,
      branchId: v.branchId,
      editionId: v.editionId,
      teacherUserId: v.teacherUserId,
      defaultRoomId: v.defaultRoomId || null,
      startDate: v.startDate,
      plannedSessions: Number(v.plannedSessions),
      startLessonNumber: Number(v.startLessonNumber),
      sessionsPerLesson: Number(v.sessionsPerLesson) || 1,
      rules,
      tuitionAmount: v.tuitionAmount ? Number(v.tuitionAmount) : null,
    }),
    [v, rules],
  );

  function missing(): string | undefined {
    if (!v.name.trim()) return "Vui lòng nhập tên lớp.";
    if (!v.branchId) return "Vui lòng chọn cơ sở.";
    if (!v.editionId) return "Vui lòng chọn giáo trình.";
    if (!v.teacherUserId) return "Vui lòng chọn giáo viên.";
    if (!v.startDate) return "Vui lòng chọn ngày khai giảng.";
    if (!Number(v.plannedSessions)) return "Vui lòng nhập số buổi.";
  }

  async function run(kind: "preview" | "create") {
    const m = missing();
    if (m) return setError(m);
    setError(undefined);
    setLoading(kind);
    try {
      if (kind === "preview") setPreview(await api<ClassPreview>("POST", `/api/organizations/${orgId}/classes/preview`, body));
      else {
        const r = await api<{ id: string }>("POST", `/api/organizations/${orgId}/classes`, body);
        router.push(`/trung-tam/lop/${r.id}`);
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === "SCHEDULE_CONFLICT") setPreview(await api<ClassPreview>("POST", `/api/organizations/${orgId}/classes/preview`, body).catch(() => undefined));
      setError(e instanceof ApiError ? e.message : "Đã có lỗi xảy ra.");
    } finally {
      setLoading(undefined);
    }
  }

  if (org.error || grants.error) return <ErrorBox message={(org.error ?? grants.error)!.message} />;
  if (!org.data || !grants.data || !teachers.data) return <Spinner />;

  const setupMissing = branches.length === 0 ? "Chưa có cơ sở – hãy thêm trong Cài đặt." : editions.length === 0 ? "Trung tâm chưa được cấp giáo trình đang dùng." : activeTeachers.length === 0 ? "Chưa có giáo viên – hãy thêm trong mục Giáo viên." : undefined;

  return (
    <>
      <Link href="/trung-tam/lop" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Lớp học
      </Link>
      <PageHeader title="Tạo lớp" />
      {setupMissing && (
        <div className="mb-4">
          <WarnBox>{setupMissing}</WarnBox>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Section title="Thông tin lớp">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tên lớp" hint="vd. TH01-K12" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
              <SelectField label="Cơ sở" value={v.branchId} onChange={(e) => setV({ ...v, branchId: e.target.value, defaultRoomId: "" })} placeholder="Chọn cơ sở" options={branches.map((b) => ({ value: b.id, label: b.name }))} />
              <SelectField
                label="Giáo trình"
                value={v.editionId}
                onChange={(e) => setV({ ...v, editionId: e.target.value, startLessonNumber: "" })}
                placeholder="Chọn giáo trình"
                options={editions.map((g) => ({ value: g.edition.id, label: `${g.level.code} – ${g.level.nameVi} · ${g.edition.name}` }))}
              />
              <SelectField label="Giáo viên" value={v.teacherUserId} onChange={(e) => setV({ ...v, teacherUserId: e.target.value })} placeholder="Chọn giáo viên" options={activeTeachers.map((t) => ({ value: t.id, label: t.displayName }))} />
              <SelectField
                label="Bài bắt đầu"
                value={v.startLessonNumber}
                onChange={(e) => setV({ ...v, startLessonNumber: e.target.value })}
                options={(lessons.data ?? []).map((l) => ({ value: String(l.number), label: `Bài ${l.number}. ${l.titleVi}` }))}
                disabled={!lessons.data}
              />
              <Field label="Số buổi cho mỗi bài" inputMode="numeric" value={v.sessionsPerLesson} onChange={(e) => setV({ ...v, sessionsPerLesson: e.target.value.replace(/\D/g, "") })} />
              <Field label="Học phí tham chiếu (VND)" inputMode="numeric" hint={v.tuitionAmount ? fmtMoney(Number(v.tuitionAmount)) : "Không bắt buộc"} value={v.tuitionAmount} onChange={(e) => setV({ ...v, tuitionAmount: e.target.value.replace(/\D/g, "") })} />
            </div>
          </Section>
          <Section title="Lịch học">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Ngày khai giảng" type="date" value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value })} />
                <Field label="Số buổi" inputMode="numeric" value={v.plannedSessions} onChange={(e) => setV({ ...v, plannedSessions: e.target.value.replace(/\D/g, "") })} />
                <SelectField label="Phòng" value={v.defaultRoomId} onChange={(e) => setV({ ...v, defaultRoomId: e.target.value })} placeholder="Chưa xếp phòng" options={rooms.map((r) => ({ value: r.id, label: r.name }))} />
              </div>
              <WeeklyRulesEditor value={rules} onChange={setRules} />
            </div>
          </Section>
        </div>
        <div className="lg:col-span-2">
          <Section title="Xem trước lịch">
            <div className="space-y-3">
              {error && <ErrorBox message={error} />}
              {!preview && <p className="text-sm text-muted">Xem trước để kiểm tra số buổi, ngày kết thúc và trùng lịch trước khi tạo lớp.</p>}
              {preview && (
                <>
                  <dl className="grid grid-cols-2 gap-y-1 text-sm">
                    <dt className="text-muted">Số buổi</dt>
                    <dd className="font-semibold">{preview.sessions.length}</dd>
                    <dt className="text-muted">Khai giảng</dt>
                    <dd>{preview.sessions[0] ? vnDate(preview.sessions[0].date) : "—"}</dd>
                    <dt className="text-muted">Dự kiến kết thúc</dt>
                    <dd>{preview.expectedEndDate ? vnDate(preview.expectedEndDate) : "—"}</dd>
                  </dl>
                  {preview.conflicts.length > 0 ? (
                    <div className="rounded-lg bg-danger-bg p-3 text-sm text-danger">
                      <p className="font-semibold">Trùng lịch {preview.conflicts.length} buổi</p>
                      <ul className="mt-1 list-disc pl-5">
                        {preview.conflicts.slice(0, 5).map((c, i) => (
                          <li key={i}>
                            {vnDate(c.date)} {c.startTime}: trùng {c.type === "ROOM" ? "phòng" : "giáo viên"} với lớp {c.withClass}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="flex items-center gap-2 text-sm text-brand-700">
                      <CalendarCheck className="size-4" aria-hidden /> Không trùng phòng, không trùng giáo viên.
                    </p>
                  )}
                  <ol className="max-h-64 space-y-1 overflow-y-auto text-xs text-muted">
                    {preview.sessions.map((s) => (
                      <li key={s.number}>
                        Buổi {s.number}: {vnDate(s.date)} {s.startTime}–{s.endTime}
                        {s.plannedLesson && ` · Bài ${s.plannedLesson.number}`}
                      </li>
                    ))}
                  </ol>
                </>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <SecondaryButton onClick={() => run("preview")} loading={loading === "preview"}>
                  Xem trước
                </SecondaryButton>
                <PrimaryButton onClick={() => run("create")} loading={loading === "create"} disabled={Boolean(setupMissing) || Boolean(preview?.conflicts.length)}>
                  Tạo lớp
                </PrimaryButton>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
