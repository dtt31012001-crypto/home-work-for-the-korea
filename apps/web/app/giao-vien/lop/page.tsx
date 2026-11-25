"use client";

import type { ClassDetail } from "@th/contracts";
import { ChevronRight, School } from "lucide-react";
import Link from "next/link";
import { PhaseBadge } from "@/components/class-badges";
import { useResource } from "@/lib/use-resource";
import { EmptyState, ErrorBox, PageHeader, Section, Spinner } from "@/components/ui";

/** T-03: lớp giáo viên đang phụ trách. */
export default function TeacherClasses() {
  const { data, error } = useResource<(ClassDetail & { organizationId: string })[]>("/api/teaching/classes");
  return (
    <>
      <PageHeader title="Lớp của tôi" />
      {error && <ErrorBox message={error.message} />}
      {!data && !error && <Spinner />}
      {data && (
        <Section>
          {data.length === 0 ? (
            <EmptyState icon={<School className="size-8" />} title="Chưa được phân công lớp nào" />
          ) : (
            <ul className="divide-y divide-line">
              {data.map((c) => (
                <li key={c.id}>
                  <Link href={`/giao-vien/lop/${c.id}`} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        {c.name} <PhaseBadge phase={c.phase} />
                      </p>
                      <p className="text-sm text-muted">
                        {c.level.code} · {c.schedule} · {c.activeStudents} học viên
                      </p>
                    </div>
                    <ChevronRight className="size-5 text-muted" aria-hidden />
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
