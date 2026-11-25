import type { ClassSummary, EnrollmentStatus, SessionKind, SessionStatus } from "@th/contracts";
import { ENROLLMENT_STATUS_LABEL, SESSION_KIND_LABEL, SESSION_STATUS_LABEL } from "@th/contracts";
import { Badge } from "./ui";

export const PHASE_LABEL: Record<ClassSummary["phase"], string> = { UPCOMING: "Sắp khai giảng", RUNNING: "Đang học", ENDED: "Đã kết thúc", CANCELLED: "Đã hủy" };

export function PhaseBadge({ phase }: { phase: ClassSummary["phase"] }) {
  return <Badge tone={phase === "RUNNING" ? "green" : phase === "UPCOMING" ? "orange" : "gray"}>{PHASE_LABEL[phase]}</Badge>;
}

export function EnrollmentBadge({ status }: { status: EnrollmentStatus }) {
  return <Badge tone={status === "ACTIVE" ? "green" : status === "ON_HOLD" ? "orange" : "gray"}>{ENROLLMENT_STATUS_LABEL[status]}</Badge>;
}

export function SessionBadges({ kind, status }: { kind: SessionKind; status: SessionStatus }) {
  return (
    <>
      {kind !== "REGULAR" && <Badge tone={kind === "EXAM" ? "orange" : "gray"}>{SESSION_KIND_LABEL[kind]}</Badge>}
      {status !== "SCHEDULED" && <Badge tone={status === "COMPLETED" ? "green" : "red"}>{SESSION_STATUS_LABEL[status]}</Badge>}
    </>
  );
}
