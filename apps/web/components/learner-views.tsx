"use client";

import { ATTENDANCE_LABEL, type AttendanceStatus, type LearnerOverview, type LearnerSession } from "@th/contracts";
import { BookOpen, CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, MessageSquareText, UserRound } from "lucide-react";
import { useState } from "react";
import { fmtDate, localDay } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { Badge, EmptyState, ErrorBox, PageHeader, Section, SecondaryButton, Spinner } from "./ui";

const TONE: Record<AttendanceStatus, "green" | "orange" | "gray" | "red"> = { PRESENT: "green", LATE: "orange", EXCUSED: "gray", ABSENT: "red" };
const dayLabel = (d: string, opts: Intl.DateTimeFormatOptions = { weekday: "long" }) => fmtDate(d + "T00:00:00Z", "UTC", opts);

export function AttendanceBadge({ s }: { s: LearnerSession }) {
  if (s.status === "CANCELLED") return <Badge tone="gray">Nghỉ</Badge>;
  if (s.onHold) return <Badge tone="gray">Bảo lưu</Badge>;
  if (s.attendance) return <Badge tone={TONE[s.attendance]}>{ATTENDANCE_LABEL[s.attendance]}</Badge>;
  if (new Date(s.endsAt) < new Date()) return <Badge tone="gray">Chưa có điểm danh</Badge>;
  return null;
}

function SessionLine({ s, showDate, showOrg }: { s: LearnerSession; showDate?: boolean; showOrg?: boolean }) {
  return (
    <li className="flex items-start gap-3 py-3">
      <div className="w-16 shrink-0 text-center">
        {showDate && <p className="text-xs text-muted">{dayLabel(s.date, { weekday: "short", day: "2-digit", month: "2-digit", year: undefined })}</p>}
        <p className="font-mono text-sm font-semibold">{s.startTime}</p>
        <p className="font-mono text-xs text-muted">{s.endTime}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          {s.class.name} <AttendanceBadge s={s} />
        </p>
        <p className="text-sm text-muted">
          {s.plannedLesson ? `Bài ${s.plannedLesson.number}: ${s.plannedLesson.titleVi}` : s.kind === "MAKEUP" ? "Buổi học bù" : ""}
        </p>
        <p className="flex items-center gap-1 text-sm text-muted">
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {[s.room?.name, s.branch.name, showOrg ? s.organization.name : null].filter(Boolean).join(" · ")}
          </span>
        </p>
        {s.status === "CANCELLED" && s.cancelReason && <p className="text-sm text-danger">Lý do nghỉ: {s.cancelReason}</p>}
      </div>
    </li>
  );
}

/** Thẻ trả lời nhanh một câu hỏi (phụ huynh mở ứng dụng để biết ngay). */
function AnswerCard({ icon, question, answer, detail, tone = "default" }: { icon: React.ReactNode; question: string; answer: React.ReactNode; detail?: React.ReactNode; tone?: "default" | "good" | "warn" }) {
  const ring = tone === "good" ? "border-brand-100 bg-brand-50" : tone === "warn" ? "border-warn/30 bg-warn-bg" : "border-line bg-white";
  return (
    <div className={`rounded-xl border p-4 ${ring}`}>
      <p className="flex items-center gap-2 text-sm text-muted">
        {icon} {question}
      </p>
      <p className="mt-1 text-lg font-semibold">{answer}</p>
      {detail && <div className="mt-1 text-sm text-muted">{detail}</div>}
    </div>
  );
}

/** HV-01 / PH-01: tổng quan một học viên. `audience` quyết định cách xưng hô. */
export function OverviewView({ data, audience }: { data: LearnerOverview; audience: "STUDENT" | "PARENT" }) {
  const who = audience === "PARENT" ? data.student.displayName : "Bạn";
  const today = data.todaySessions.filter((s) => s.status !== "CANCELLED" && !s.onHold);
  const multiOrg = new Set(data.classes.map((c) => c.organization.id)).size > 1;
  const recordedToday = today.filter((s) => s.attendance);
  const absentToday = recordedToday.some((s) => s.attendance === "ABSENT" || s.attendance === "EXCUSED");
  const a = data.attendance;
  const attended = a.PRESENT + a.LATE;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <AnswerCard
          icon={<CalendarCheck className="size-4" aria-hidden />}
          question="Hôm nay có lịch học không?"
          answer={today.length === 0 ? "Không có buổi học" : today.map((s) => `${s.startTime}–${s.endTime}`).join(", ")}
          detail={today.length > 0 ? today.map((s) => `${s.class.name}${s.room ? ` · ${s.room.name}` : ""} · ${s.branch.name}`).join("; ") : undefined}
        />
        <AnswerCard
          icon={<UserRound className="size-4" aria-hidden />}
          question={`${who} có đi học hôm nay không?`}
          tone={recordedToday.length === 0 ? "default" : absentToday ? "warn" : "good"}
          answer={
            today.length === 0
              ? "Không có buổi học"
              : recordedToday.length === 0
                ? "Giáo viên chưa điểm danh"
                : recordedToday.map((s) => ATTENDANCE_LABEL[s.attendance!]).join(", ")
          }
        />
        <AnswerCard
          icon={<Clock className="size-4" aria-hidden />}
          question="Buổi học tiếp theo"
          answer={data.nextSession ? `${dayLabel(data.nextSession.date, { weekday: "long", day: "2-digit", month: "2-digit", year: undefined })}, ${data.nextSession.startTime}` : "Chưa có lịch"}
          detail={
            data.nextSession
              ? [data.nextSession.class.name, data.nextSession.room?.name, data.nextSession.branch.name, data.nextSession.branch.address].filter(Boolean).join(" · ")
              : undefined
          }
        />
        <AnswerCard
          icon={<BookOpen className="size-4" aria-hidden />}
          question="Chuyên cần 30 ngày qua"
          tone={a.total === 0 ? "default" : a.ABSENT > 0 ? "warn" : "good"}
          answer={a.total === 0 ? "Chưa có dữ liệu" : `${attended}/${a.total} buổi có mặt`}
          detail={a.total > 0 ? `Đi muộn ${a.LATE} · Vắng có phép ${a.EXCUSED} · Vắng ${a.ABSENT}` : undefined}
        />
      </div>

      <Section title="Lớp đang học">
        {data.classes.length === 0 ? (
          <EmptyState icon={<BookOpen className="size-8" />} title="Chưa ghi danh lớp nào" hint="Trung tâm sẽ xếp lớp và lịch học sẽ hiện ở đây." />
        ) : (
          <ul className="divide-y divide-line">
            {data.classes.map((c) => (
              <li key={c.id} className="py-3">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {c.name} <Badge>{c.level.code}</Badge>
                  {c.enrollmentStatus === "ON_HOLD" && <Badge tone="gray">Đang bảo lưu</Badge>}
                </p>
                <p className="text-sm text-muted">
                  {c.level.nameVi}
                  {multiOrg || audience === "PARENT" ? ` · ${c.organization.name}` : ""}
                </p>
                <p className="text-sm">
                  Đang học: <strong>{c.currentLesson ? `Bài ${c.currentLesson.number} – ${c.currentLesson.titleVi}` : "Chưa bắt đầu"}</strong>
                </p>
                <p className="text-sm text-muted">
                  {c.schedule}
                  {c.teacher ? ` · GV ${c.teacher}` : ""} · Đã học {c.completedSessions}/{c.plannedSessions} buổi
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Nhận xét của giáo viên">
        {data.comments.length === 0 ? (
          <EmptyState icon={<MessageSquareText className="size-8" />} title="Chưa có nhận xét" />
        ) : (
          <ul className="space-y-3">
            {data.comments.map((c, i) => (
              <li key={i} className="rounded-lg bg-canvas p-3">
                <p className="text-sm">{c.body}</p>
                <p className="mt-1 text-xs text-muted">
                  {c.teacher} · {c.class} · {dayLabel(c.date, {})}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {data.recentAttendance.length > 0 && (
        <Section title="Điểm danh gần đây">
          <ul className="divide-y divide-line">
            {data.recentAttendance.map((s) => (
              <SessionLine key={s.id} s={s} showDate showOrg={multiOrg} />
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

const addDays = (d: string, n: number) => {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10);
};
const mondayOf = (d: string) => {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  const wd = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  return addDays(d, -((wd + 6) % 7));
};

/** HV-02 / PH-02: lịch học theo tuần kèm điểm danh của học viên. `base` là đường dẫn API trả về lịch. */
export function ScheduleView({ base, title, subtitle }: { base: string; title: string; subtitle?: string }) {
  const today = localDay(new Date());
  const [week, setWeek] = useState(mondayOf(today));
  const { data, error } = useResource<LearnerSession[]>(`${base}?from=${week}&to=${addDays(week, 6)}`);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const multiOrg = new Set((data ?? []).map((s) => s.organization.id)).size > 1;
  return (
    <>
      <PageHeader title={title} subtitle={subtitle ?? `Tuần ${dayLabel(week, {})} – ${dayLabel(addDays(week, 6), {})}`} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SecondaryButton onClick={() => setWeek(addDays(week, -7))} aria-label="Tuần trước" icon={<ChevronLeft className="size-4" aria-hidden />} />
        <SecondaryButton onClick={() => setWeek(mondayOf(today))}>Tuần này</SecondaryButton>
        <SecondaryButton onClick={() => setWeek(addDays(week, 7))} aria-label="Tuần sau" icon={<ChevronRight className="size-4" aria-hidden />} />
        {subtitle && <span className="text-sm text-muted">Tuần {dayLabel(week, {})} – {dayLabel(addDays(week, 6), {})}</span>}
      </div>
      {error && <ErrorBox message={error.message} />}
      {!data && !error && <Spinner />}
      {data && data.length === 0 && (
        <Section>
          <EmptyState icon={<CalendarDays className="size-8" />} title="Không có buổi học trong tuần này" />
        </Section>
      )}
      {data && data.length > 0 && (
        <div className="space-y-3">
          {days.map((d) => {
            const items = data.filter((s) => s.date === d);
            if (items.length === 0) return null;
            return (
              <Section key={d} title={`${dayLabel(d, { weekday: "long", day: "2-digit", month: "2-digit", year: undefined })}${d === today ? " · Hôm nay" : ""}`}>
                <ul className="divide-y divide-line">
                  {items.map((s) => (
                    <SessionLine key={s.id} s={s} showOrg={multiOrg} />
                  ))}
                </ul>
              </Section>
            );
          })}
        </div>
      )}
    </>
  );
}
