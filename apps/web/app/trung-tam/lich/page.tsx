"use client";

import type { CalendarSession, OrganizationDetail, PersonRow } from "@th/contracts";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { SessionBadges } from "@/components/class-badges";
import { useOrgId } from "@/components/workspace";
import { fmtDate, localDay } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { EmptyState, ErrorBox, PageHeader, Section, SecondaryButton, SelectField, Spinner } from "@/components/ui";

const addDays = (d: string, n: number) => {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10);
};
const mondayOf = (d: string) => {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  const wd = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  return addDays(d, -((wd + 6) % 7));
};

/** CA-06: lịch tuần của trung tâm, lọc theo cơ sở/giáo viên. */
export default function CenterCalendarPage() {
  const orgId = useOrgId();
  const today = localDay(new Date());
  const [week, setWeek] = useState(mondayOf(today));
  const [branchId, setBranchId] = useState("");
  const [teacherUserId, setTeacherUserId] = useState("");
  const org = useResource<OrganizationDetail>(`/api/organizations/${orgId}`);
  const teachers = useResource<PersonRow[]>(`/api/organizations/${orgId}/accounts?role=TEACHER`);
  const qs = new URLSearchParams({ from: week, to: addDays(week, 6), ...(branchId ? { branchId } : {}), ...(teacherUserId ? { teacherUserId } : {}) });
  const { data, error } = useResource<CalendarSession[]>(`/api/organizations/${orgId}/calendar?${qs}`);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));

  return (
    <>
      <PageHeader title="Lịch học" subtitle={`Tuần ${fmtDate(week + "T00:00:00Z", "UTC")} – ${fmtDate(addDays(week, 6) + "T00:00:00Z", "UTC")}`} />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <SecondaryButton onClick={() => setWeek(addDays(week, -7))} aria-label="Tuần trước" icon={<ChevronLeft className="size-4" aria-hidden />} />
        <SecondaryButton onClick={() => setWeek(mondayOf(today))}>Tuần này</SecondaryButton>
        <SecondaryButton onClick={() => setWeek(addDays(week, 7))} aria-label="Tuần sau" icon={<ChevronRight className="size-4" aria-hidden />} />
        <div className="w-full sm:w-48">
          <SelectField label="Cơ sở" value={branchId} onChange={(e) => setBranchId(e.target.value)} placeholder="Tất cả" options={(org.data?.branches ?? []).map((b) => ({ value: b.id, label: b.name }))} />
        </div>
        <div className="w-full sm:w-48">
          <SelectField label="Giáo viên" value={teacherUserId} onChange={(e) => setTeacherUserId(e.target.value)} placeholder="Tất cả" options={(teachers.data ?? []).map((t) => ({ value: t.id, label: t.displayName }))} />
        </div>
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
              <Section key={d} title={`${fmtDate(d + "T00:00:00Z", "UTC", { weekday: "long" })}${d === today ? " · Hôm nay" : ""}`}>
                <ul className="divide-y divide-line">
                  {items.map((s) => (
                    <li key={s.id} className={s.status === "CANCELLED" ? "opacity-60" : ""}>
                      <Link href={`/trung-tam/lop/${s.class.id}`} className="flex flex-wrap items-center gap-3 py-2.5">
                        <span className="w-24 shrink-0 font-mono text-sm">
                          {s.startTime}–{s.endTime}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                            {s.class.name} <span className="font-normal text-muted">{s.class.levelCode}</span> <SessionBadges kind={s.kind} status={s.status} />
                          </p>
                          <p className="text-xs text-muted">
                            {s.room?.name ?? "Chưa xếp phòng"} · {s.teacher?.displayName ?? "—"} · {s.branch.name}
                          </p>
                        </div>
                      </Link>
                    </li>
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
