"use client";

import { ATTENDANCE_LABEL, type CenterToday } from "@th/contracts";
import { AlertTriangle, CalendarCheck, ClipboardList, UserX } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AttendanceSummary, SessionRow } from "@/components/session-list";
import { useOrgId } from "@/components/workspace";
import { ApiError, api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { Badge, EmptyState, ErrorBox, PageHeader, PrimaryButton, Section, SecondaryButton, Spinner } from "@/components/ui";

function Stat({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone?: "warn" }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className={`flex items-center gap-2 text-sm ${tone === "warn" && value ? "text-warn" : "text-muted"}`}>
        {icon} {label}
      </div>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

/** CA-01: hôm nay lớp nào học, ai dạy, ai vắng, buổi chưa điểm danh, lớp chậm tiến độ, yêu cầu sửa điểm danh. */
export default function CenterToday() {
  const orgId = useOrgId();
  const { data, error, reload } = useResource<CenterToday>(`/api/organizations/${orgId}/today`);
  const [busy, setBusy] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  if (error) return <ErrorBox message={error.message} />;
  if (!data) return <Spinner />;

  async function decide(id: string, approve: boolean) {
    setBusy(id);
    setActionError(undefined);
    try {
      await api("POST", `/api/organizations/${orgId}/attendance-requests/${id}/${approve ? "approve" : "reject"}`, {});
      reload();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Đã có lỗi xảy ra.");
    } finally {
      setBusy(undefined);
    }
  }

  const sessionsToday = data.sessions.filter((s) => s.status !== "CANCELLED");
  return (
    <>
      <PageHeader title="Hôm nay" subtitle={fmtDate(data.date + "T00:00:00Z", "UTC", { weekday: "long" })} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<CalendarCheck className="size-4" aria-hidden />} label="Buổi học hôm nay" value={sessionsToday.length} />
        <Stat icon={<ClipboardList className="size-4" aria-hidden />} label="Chưa điểm danh" value={data.unrecorded.length} tone="warn" />
        <Stat icon={<UserX className="size-4" aria-hidden />} label="Học viên vắng" value={data.absentees.length} tone="warn" />
        <Stat icon={<AlertTriangle className="size-4" aria-hidden />} label="Lớp chậm tiến độ" value={data.behindClasses.length} tone="warn" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Lớp học hôm nay">
          {data.sessions.length === 0 ? (
            <EmptyState title="Hôm nay không có buổi học" />
          ) : (
            <ul className="divide-y divide-line">
              {data.sessions.map((s) => (
                <SessionRow
                  key={s.id}
                  href={`/trung-tam/buoi/${s.id}`}
                  date={s.date}
                  startTime={s.startTime}
                  endTime={s.endTime}
                  title={s.class.name}
                  subtitle={`${s.room?.name ?? "Chưa xếp phòng"} · ${s.teacher?.displayName ?? "—"}`}
                  badge={s.status === "CANCELLED" ? <Badge tone="red">Nghỉ</Badge> : <AttendanceSummary recorded={s.recorded} counts={s.counts} />}
                />
              ))}
            </ul>
          )}
        </Section>
        <Section title="Học viên vắng hôm nay">
          {data.absentees.length === 0 ? (
            <p className="py-4 text-sm text-muted">Chưa có học viên vắng.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.absentees.map((a) => (
                <li key={a.sessionId + a.student.id} className="flex items-center gap-2 py-2.5 text-sm">
                  <span className="flex-1 font-semibold">{a.student.displayName}</span>
                  <span className="text-muted">{a.class.name}</span>
                  <Badge tone={a.status === "ABSENT" ? "red" : "gray"}>{ATTENDANCE_LABEL[a.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Section>
        {data.pendingRequests.length > 0 && (
          <Section title={`Yêu cầu sửa điểm danh (${data.pendingRequests.length})`}>
            {actionError && <ErrorBox message={actionError} />}
            <ul className="divide-y divide-line">
              {data.pendingRequests.map((r) => (
                <li key={r.id} className="space-y-2 py-3 text-sm">
                  <p>
                    <b>{r.requestedBy.displayName}</b> · {r.class.name} · {fmtDate(r.session.date + "T00:00:00Z", "UTC", { weekday: "short" })} {r.session.startTime}
                  </p>
                  <ul className="rounded-lg bg-canvas p-2">
                    {r.changes.map((c) => (
                      <li key={c.student.id}>
                        {c.student.displayName}: {c.from ? ATTENDANCE_LABEL[c.from] : "—"} → <b>{ATTENDANCE_LABEL[c.to]}</b>
                      </li>
                    ))}
                  </ul>
                  <p className="text-muted">Lý do: {r.reason}</p>
                  <div className="flex gap-2">
                    <PrimaryButton onClick={() => decide(r.id, true)} loading={busy === r.id}>
                      Duyệt
                    </PrimaryButton>
                    <SecondaryButton onClick={() => decide(r.id, false)} disabled={busy === r.id}>
                      Từ chối
                    </SecondaryButton>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}
        <Section title="Buổi chưa điểm danh (7 ngày)">
          {data.unrecorded.length === 0 ? (
            <p className="py-4 text-sm text-muted">Tất cả buổi đã được điểm danh.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.unrecorded.map((s) => (
                <SessionRow
                  key={s.id}
                  href={`/trung-tam/buoi/${s.id}`}
                  date={s.date}
                  startTime={s.startTime}
                  endTime={s.endTime}
                  title={s.class.name}
                  subtitle={`${s.teacher?.displayName ?? "—"} · ${s.room?.name ?? "Chưa xếp phòng"}`}
                  showDate
                />
              ))}
            </ul>
          )}
        </Section>
        <Section title="Lớp chậm tiến độ">
          {data.behindClasses.length === 0 ? (
            <p className="py-4 text-sm text-muted">Các lớp đều đúng tiến độ.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.behindClasses.map((c) => (
                <li key={c.id}>
                  <Link href={`/trung-tam/lop/${c.id}`} className="flex items-center gap-2 py-2.5 text-sm">
                    <span className="flex-1 font-semibold">{c.name}</span>
                    <span className="text-muted">
                      Đã dạy đến bài {c.lastDoneLesson ?? "—"} / kế hoạch bài {c.plannedLesson ?? "—"}
                    </span>
                    <Badge tone="orange">Chậm {c.behindBy} bài</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
