"use client";

import type { ChildSummary, LearnerOverview } from "@th/contracts";
import { WithChild } from "@/components/child-picker";
import { OverviewView } from "@/components/learner-views";
import { fmtDate } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";

function ChildOverview({ child }: { child: ChildSummary }) {
  const { data, error } = useResource<LearnerOverview>(`/api/family/children/${child.studentId}/overview`);
  if (error) return <ErrorBox message={error.message} />;
  if (!data || data.student.id !== child.studentId) return <Spinner />;
  return (
    <>
      <PageHeader title={data.student.displayName} subtitle={fmtDate(data.today + "T00:00:00Z", "UTC", { weekday: "long" })} />
      <OverviewView data={data} audience="PARENT" />
    </>
  );
}

/** PH-01: phụ huynh mở ứng dụng để biết con hôm nay có học không, có đi học không, đang học tới đâu. */
export default function ParentToday() {
  return <WithChild>{(c) => <ChildOverview key={c.studentId} child={c} />}</WithChild>;
}
