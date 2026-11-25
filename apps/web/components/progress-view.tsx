import type { ClassProgress } from "@th/contracts";
import { CheckCircle2, Circle, CircleDot } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { Section, WarnBox } from "./ui";

/** Tiến độ giáo trình của lớp so với kế hoạch (D-B19: cảnh báo khi chậm từ ngưỡng). */
export function ProgressView({ p }: { p: ClassProgress }) {
  return (
    <Section title="Tiến độ giáo trình">
      <div className="mb-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted">Đã dạy xong đến</p>
          <p className="font-semibold">{p.lastDoneLesson ? `Bài ${p.lastDoneLesson.number}` : "Chưa có"}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Theo kế hoạch đến</p>
          <p className="font-semibold">{p.plannedLesson ? `Bài ${p.plannedLesson.number}` : "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Buổi đã học</p>
          <p className="font-semibold">
            {p.completedSessions}/{p.plannedSessions}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">Chênh lệch</p>
          <p className={`font-semibold ${p.behind ? "text-warn" : "text-brand-700"}`}>{p.behindBy ? `Chậm ${p.behindBy} bài` : "Đúng tiến độ"}</p>
        </div>
      </div>
      {p.behind && (
        <div className="mb-3">
          <WarnBox>Lớp đang chậm {p.behindBy} bài so với kế hoạch (ngưỡng cảnh báo: {p.threshold} bài).</WarnBox>
        </div>
      )}
      <ul className="divide-y divide-line">
        {p.lessons.map((l) => (
          <li key={l.id} className="flex items-center gap-3 py-2 text-sm">
            {l.status === "DONE" ? (
              <CheckCircle2 className="size-5 text-brand-700" aria-label="Đã dạy xong" />
            ) : l.status === "PARTIAL" ? (
              <CircleDot className="size-5 text-warn" aria-label="Dạy một phần" />
            ) : (
              <Circle className="size-5 text-line" aria-label="Chưa dạy" />
            )}
            <span className="flex-1">
              <b>Bài {l.number}.</b> {l.titleVi}
            </span>
            <span className="text-xs text-muted">{l.plannedDate ? fmtDate(l.plannedDate + "T00:00:00Z", "UTC") : ""}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
