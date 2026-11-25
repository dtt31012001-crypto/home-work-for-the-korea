"use client";

import type { TeacherDay } from "@th/contracts";
import { CalendarCheck } from "lucide-react";
import { AttendanceSummary, SessionRow } from "@/components/session-list";
import { fmtDate } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { EmptyState, ErrorBox, PageHeader, Section, Spinner } from "@/components/ui";

/** T-01: lịch dạy hôm nay và buổi chưa điểm danh. */
export default function TeacherToday() {
  const { data, error } = useResource<TeacherDay>("/api/teaching/today");
  if (error) return <ErrorBox message={error.message} />;
  if (!data) return <Spinner />;
  return (
    <>
      <PageHeader title="Hôm nay" subtitle={fmtDate(data.date + "T00:00:00Z", "UTC", { weekday: "long" })} />
      <div className="space-y-4">
        {data.unrecorded.length > 0 && (
          <Section title={`Chưa điểm danh (${data.unrecorded.length})`}>
            <ul className="divide-y divide-line">
              {data.unrecorded.map((s) => (
                <SessionRow
                  key={s.id}
                  href={`/giao-vien/buoi/${s.id}`}
                  date={s.date}
                  startTime={s.startTime}
                  endTime={s.endTime}
                  title={s.class.name}
                  subtitle={`${s.room?.name ?? "Chưa xếp phòng"} · ${s.organization.name}`}
                  showDate
                />
              ))}
            </ul>
          </Section>
        )}
        <Section title="Lịch dạy hôm nay">
          {data.sessions.length === 0 ? (
            <EmptyState icon={<CalendarCheck className="size-8" />} title="Hôm nay không có buổi dạy" />
          ) : (
            <ul className="divide-y divide-line">
              {data.sessions.map((s) => (
                <SessionRow
                  key={s.id}
                  href={`/giao-vien/buoi/${s.id}`}
                  date={s.date}
                  startTime={s.startTime}
                  endTime={s.endTime}
                  title={s.class.name}
                  subtitle={`${s.room?.name ?? "Chưa xếp phòng"} · ${s.organization.name}${s.plannedLesson ? ` · Bài ${s.plannedLesson.number}` : ""}`}
                  badge={s.status === "CANCELLED" ? undefined : <AttendanceSummary recorded={s.recorded} counts={s.counts} />}
                />
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
