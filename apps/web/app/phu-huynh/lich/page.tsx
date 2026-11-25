"use client";

import { WithChild } from "@/components/child-picker";
import { ScheduleView } from "@/components/learner-views";

/** PH-02: lịch học và lịch sử điểm danh của con. */
export default function ParentSchedule() {
  return (
    <WithChild>
      {(c) => <ScheduleView key={c.studentId} base={`/api/family/children/${c.studentId}/schedule`} title="Lịch học" subtitle={c.displayName} />}
    </WithChild>
  );
}
