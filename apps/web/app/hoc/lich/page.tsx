"use client";

import { ScheduleView } from "@/components/learner-views";

/** HV-02: lịch học theo tuần kèm điểm danh của chính học viên. */
export default function StudentSchedule() {
  return <ScheduleView base="/api/learning/schedule" title="Lịch học" />;
}
