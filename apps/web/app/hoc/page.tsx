"use client";

import type { LearnerOverview } from "@th/contracts";
import { ShieldQuestion } from "lucide-react";
import Link from "next/link";
import { OverviewView } from "@/components/learner-views";
import { fmtDate } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { ErrorBox, PageHeader, Spinner, WarnBox } from "@/components/ui";

/** HV-01: học viên mở ứng dụng để biết hôm nay học gì, ở đâu, đã học tới đâu. */
export default function StudentToday() {
  const { data, error } = useResource<LearnerOverview>("/api/learning/overview");
  const requests = useResource<unknown[]>("/api/me/guardian-requests");
  if (error) return <ErrorBox message={error.message} />;
  if (!data) return <Spinner />;
  return (
    <>
      <PageHeader title={`Chào ${data.student.displayName}`} subtitle={fmtDate(data.today + "T00:00:00Z", "UTC", { weekday: "long" })} />
      {(requests.data?.length ?? 0) > 0 && (
        <div className="mb-4">
          <WarnBox>
            <span className="flex flex-wrap items-center gap-2">
              <ShieldQuestion className="size-4" aria-hidden /> Có {requests.data!.length} yêu cầu liên kết phụ huynh đang chờ bạn đồng ý.
              <Link href="/tai-khoan" className="font-semibold underline">
                Xem và trả lời
              </Link>
            </span>
          </WarnBox>
        </div>
      )}
      <OverviewView data={data} audience="STUDENT" />
    </>
  );
}
