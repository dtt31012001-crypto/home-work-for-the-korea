"use client";

import type { ClassDetail, ClassProgress } from "@th/contracts";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { EnrollmentBadge, SessionBadges } from "@/components/class-badges";
import { ProgressView } from "@/components/progress-view";
import { fmtDate } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { ErrorBox, PageHeader, Section, Spinner, Tabs } from "@/components/ui";

type Tab = "sessions" | "students" | "progress";

export default function TeacherClassPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useResource<ClassDetail & { progress: ClassProgress }>(`/api/teaching/classes/${id}`);
  const [tab, setTab] = useState<Tab>("sessions");
  if (error) return <ErrorBox message={error.message} />;
  if (!data) return <Spinner />;
  return (
    <>
      <Link href="/giao-vien/lop" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Lớp của tôi
      </Link>
      <PageHeader title={data.name} subtitle={`${data.level.code} · ${data.schedule} · ${data.branch.name}`} />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "sessions", label: "Buổi học" },
          { value: "students", label: `Học viên (${data.activeStudents})` },
          { value: "progress", label: "Tiến độ" },
        ]}
      />
      {tab === "sessions" && (
        <Section>
          <ul className="divide-y divide-line">
            {data.sessions.map((s) => (
              <li key={s.id}>
                <Link href={`/giao-vien/buoi/${s.id}`} className={`flex items-center gap-3 py-2.5 ${s.status === "CANCELLED" ? "opacity-60" : ""}`}>
                  <span className="w-8 text-right font-mono text-sm text-muted">{s.number ?? "·"}</span>
                  <span className="flex-1 text-sm">
                    <span className="font-semibold">
                      {fmtDate(s.date + "T00:00:00Z", "UTC", { weekday: "short" })} · {s.startTime}
                    </span>{" "}
                    <SessionBadges kind={s.kind} status={s.status} />
                    {s.plannedLesson && <span className="block text-xs text-muted">Bài {s.plannedLesson.number}. {s.plannedLesson.titleVi}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {tab === "students" && (
        <Section>
          <ul className="divide-y divide-line">
            {data.enrollments.map((e) => (
              <li key={e.id} className="flex items-center gap-2 py-2.5 text-sm">
                <span className="flex-1 font-semibold">{e.student.displayName}</span> <EnrollmentBadge status={e.status} />
              </li>
            ))}
          </ul>
        </Section>
      )}
      {tab === "progress" && <ProgressView p={data.progress} />}
    </>
  );
}
