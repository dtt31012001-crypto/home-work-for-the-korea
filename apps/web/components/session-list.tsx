import type { AttendanceCounts } from "@th/contracts";
import { ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";
import { fmtDate } from "@/lib/format";
import { Badge } from "./ui";

export function AttendanceSummary({ recorded, counts }: { recorded: boolean; counts: AttendanceCounts | null }) {
  if (!recorded || !counts) return <Badge tone="orange">Chưa điểm danh</Badge>;
  const absent = counts.ABSENT + counts.EXCUSED;
  return <Badge tone={absent ? "red" : "green"}>{absent ? `Vắng ${absent}/${counts.total}` : `Đủ ${counts.total}/${counts.total}`}</Badge>;
}

/** Dòng buổi học (thời gian, lớp, phòng) dẫn tới trang điểm danh. */
export function SessionRow({
  href,
  date,
  startTime,
  endTime,
  title,
  subtitle,
  badge,
  showDate,
}: {
  href: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
  showDate?: boolean;
}) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 py-3">
        <div className="w-16 shrink-0 text-center">
          {showDate && <p className="text-xs text-muted">{fmtDate(date + "T00:00:00Z", "UTC", { weekday: "short", year: undefined })}</p>}
          <p className="font-mono text-sm font-semibold">{startTime}</p>
          <p className="font-mono text-xs text-muted">{endTime}</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            {title} {badge}
          </p>
          <p className="flex items-center gap-1 truncate text-sm text-muted">
            <MapPin className="size-3.5 shrink-0" aria-hidden /> {subtitle}
          </p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
      </Link>
    </li>
  );
}
