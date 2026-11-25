"use client";

import type { AttendanceReport, ClassSummary } from "@th/contracts";
import { BarChart3, Download } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useOrgId } from "@/components/workspace";
import { downloadCsv } from "@/lib/csv";
import { localDay } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { Badge, EmptyState, ErrorBox, PageHeader, Section, SecondaryButton, SelectField, Spinner, Tabs } from "@/components/ui";

const addDays = (d: string, n: number) => {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10);
};
const pct = (r: number | null) => (r == null ? "—" : `${Math.round(r * 100)}%`);
const tone = (r: number | null) => (r == null ? "gray" : r >= 0.9 ? "green" : r >= 0.75 ? "orange" : "red");

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-semibold">{label}</span>
      <input type="date" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} className="h-12 w-full rounded-lg border border-line bg-surface px-3 text-base" />
    </label>
  );
}

/** CA-07: báo cáo chuyên cần theo lớp và học viên. */
export default function AttendanceReportPage() {
  const orgId = useOrgId();
  const today = localDay(new Date());
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);
  const [classId, setClassId] = useState("");
  const [view, setView] = useState<"classes" | "students">("classes");
  const classes = useResource<ClassSummary[]>(`/api/organizations/${orgId}/classes`);
  const valid = from <= to;
  const { data, error } = useResource<AttendanceReport>(valid ? `/api/organizations/${orgId}/reports/attendance?from=${from}&to=${to}${classId ? `&classId=${classId}` : ""}` : null);

  const exportCsv = () => {
    if (!data) return;
    if (view === "classes")
      downloadCsv(`chuyen-can-lop-${from}-${to}.csv`, [
        ["Lớp", "Cấp độ", "Giáo viên", "Buổi đã học", "Buổi đã điểm danh", "Có mặt", "Đi muộn", "Vắng có phép", "Vắng", "Tỷ lệ đi học"],
        ...data.classes.map((c) => [c.name, c.levelCode, c.teacher, c.heldSessions, c.recordedSessions, c.counts.PRESENT, c.counts.LATE, c.counts.EXCUSED, c.counts.ABSENT, pct(c.rate)]),
      ]);
    else
      downloadCsv(`chuyen-can-hoc-vien-${from}-${to}.csv`, [
        ["Học viên", "Lớp", "Có mặt", "Đi muộn", "Vắng có phép", "Vắng", "Tỷ lệ đi học", "Vắng liên tiếp gần nhất"],
        ...data.students.map((s) => [s.displayName, s.classes.join("; "), s.counts.PRESENT, s.counts.LATE, s.counts.EXCUSED, s.counts.ABSENT, pct(s.rate), s.absentStreak]),
      ]);
  };

  return (
    <>
      <PageHeader
        title="Báo cáo chuyên cần"
        subtitle="Tỷ lệ đi học = (có mặt + đi muộn) / số lượt điểm danh"
        action={
          <SecondaryButton onClick={exportCsv} disabled={!data} icon={<Download className="size-4" aria-hidden />}>
            Tải CSV
          </SecondaryButton>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <DateInput label="Từ ngày" value={from} onChange={setFrom} />
        <DateInput label="Đến ngày" value={to} onChange={setTo} />
        <div className="sm:col-span-2">
          <SelectField label="Lớp" value={classId} onChange={(e) => setClassId(e.target.value)} placeholder="Tất cả lớp" options={(classes.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          ["7 ngày", 6],
          ["30 ngày", 29],
          ["90 ngày", 89],
        ].map(([label, n]) => (
          <SecondaryButton
            key={label}
            onClick={() => {
              setFrom(addDays(today, -(n as number)));
              setTo(today);
            }}
          >
            {label}
          </SecondaryButton>
        ))}
      </div>
      {!valid && <ErrorBox message="Ngày bắt đầu phải trước ngày kết thúc." />}
      {error && <ErrorBox message={error.message} />}
      {valid && !data && !error && <Spinner />}
      {data && (
        <>
          <Tabs
            tabs={[
              { value: "classes", label: `Theo lớp (${data.classes.length})` },
              { value: "students", label: `Theo học viên (${data.students.length})` },
            ]}
            value={view}
            onChange={setView}
          />
          {view === "classes" && (
            <Section>
              {data.classes.length === 0 ? (
                <EmptyState icon={<BarChart3 className="size-8" />} title="Chưa có buổi học nào trong khoảng này" />
              ) : (
                <ul className="divide-y divide-line">
                  {data.classes.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                      <div className="min-w-0 flex-1">
                        <Link href={`/trung-tam/lop/${c.id}`} className="font-semibold hover:underline">
                          {c.name}
                        </Link>{" "}
                        <Badge>{c.levelCode}</Badge>
                        <p className="text-sm text-muted">
                          {c.teacher ?? "Chưa có giáo viên"} · Đã điểm danh {c.recordedSessions}/{c.heldSessions} buổi
                          {c.recordedSessions < c.heldSessions && <span className="text-warn"> · thiếu {c.heldSessions - c.recordedSessions}</span>}
                        </p>
                        <p className="text-sm text-muted">
                          Có mặt {c.counts.PRESENT} · Muộn {c.counts.LATE} · Có phép {c.counts.EXCUSED} · Vắng {c.counts.ABSENT}
                        </p>
                      </div>
                      <Badge tone={tone(c.rate)}>{pct(c.rate)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}
          {view === "students" && (
            <Section>
              {data.students.length === 0 ? (
                <EmptyState icon={<BarChart3 className="size-8" />} title="Chưa có dữ liệu điểm danh" />
              ) : (
                <ul className="divide-y divide-line">
                  {data.students.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                      <div className="min-w-0 flex-1">
                        <Link href={`/trung-tam/hoc-vien/${s.id}`} className="font-semibold hover:underline">
                          {s.displayName}
                        </Link>
                        {s.absentStreak >= 2 && (
                          <>
                            {" "}
                            <Badge tone="red">Vắng {s.absentStreak} buổi liền</Badge>
                          </>
                        )}
                        <p className="text-sm text-muted">{s.classes.join(", ")}</p>
                        <p className="text-sm text-muted">
                          Có mặt {s.counts.PRESENT} · Muộn {s.counts.LATE} · Có phép {s.counts.EXCUSED} · Vắng {s.counts.ABSENT}
                        </p>
                      </div>
                      <Badge tone={tone(s.rate)}>{pct(s.rate)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}
        </>
      )}
    </>
  );
}
