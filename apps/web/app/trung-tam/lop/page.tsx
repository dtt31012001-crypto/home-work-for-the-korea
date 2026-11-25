"use client";

import type { ClassSummary } from "@th/contracts";
import { CalendarDays, ChevronRight, Plus, School } from "lucide-react";
import Link from "next/link";
import { PhaseBadge } from "@/components/class-badges";
import { useOrgId } from "@/components/workspace";
import { fmtDate } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { EmptyState, ErrorBox, PageHeader, Section, Spinner } from "@/components/ui";

export default function ClassesPage() {
  const orgId = useOrgId();
  const { data, error } = useResource<ClassSummary[]>(`/api/organizations/${orgId}/classes`);
  return (
    <>
      <PageHeader
        title="Lớp học"
        action={
          <Link href="/trung-tam/lop/moi" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-semibold whitespace-nowrap text-white hover:bg-brand-800">
            <Plus className="size-4" aria-hidden /> Tạo lớp
          </Link>
        }
      />
      {error && <ErrorBox message={error.message} />}
      {!data && !error && <Spinner />}
      {data && (
        <Section>
          {data.length === 0 ? (
            <EmptyState icon={<School className="size-8" />} title="Chưa có lớp học" hint="Tạo lớp, chọn giáo trình và lịch cố định – hệ thống tự sinh các buổi học." />
          ) : (
            <ul className="divide-y divide-line">
              {data.map((c) => (
                <li key={c.id}>
                  <Link href={`/trung-tam/lop/${c.id}`} className="flex items-center gap-3 py-3">
                    <span className="hidden w-16 shrink-0 font-mono text-sm font-semibold text-brand-800 sm:block">{c.level.code}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        {c.name} <PhaseBadge phase={c.phase} />
                      </p>
                      <p className="text-sm text-muted">
                        {c.schedule} · {c.branch.name} · {c.teacher?.displayName ?? "Chưa có giáo viên"} · {c.activeStudents} học viên
                      </p>
                      {c.nextSession && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                          <CalendarDays className="size-3.5" aria-hidden /> Buổi tới: {fmtDate(c.nextSession.date + "T00:00:00Z", "UTC", { weekday: "short" })} {c.nextSession.startTime}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </>
  );
}
