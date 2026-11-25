import type { AttendanceCounts, AttendanceStatus } from "./attendance";
import type { EnrollmentStatus, SessionView } from "./classes";

/** Buổi học nhìn từ phía học viên/phụ huynh: kèm điểm danh của chính học viên. */
export interface LearnerSession extends SessionView {
  class: { id: string; name: string; levelCode: string };
  organization: { id: string; name: string };
  branch: { name: string; address: string | null };
  attendance: AttendanceStatus | null;
  onHold: boolean;
}

export interface LearnerOverview {
  student: { id: string; displayName: string };
  today: string;
  classes: {
    id: string;
    name: string;
    level: { code: string; nameVi: string };
    organization: { id: string; name: string };
    enrollmentStatus: EnrollmentStatus;
    teacher: string | null;
    schedule: string;
    currentLesson: { number: number; titleVi: string } | null;
    completedSessions: number;
    plannedSessions: number;
  }[];
  todaySessions: LearnerSession[];
  nextSession: LearnerSession | null;
  /** 30 ngày gần nhất */
  attendance: AttendanceCounts;
  recentAttendance: LearnerSession[];
  comments: { date: string; class: string; teacher: string; body: string }[];
}

export interface ChildSummary {
  linkId: string;
  organizationId: string;
  studentId: string;
  displayName: string;
  relationship: string;
}
