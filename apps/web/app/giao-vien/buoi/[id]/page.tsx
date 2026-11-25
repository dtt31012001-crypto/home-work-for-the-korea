"use client";

import type { SessionWorkspace } from "@th/contracts";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { SessionEditor } from "@/components/session-editor";
import { useResource } from "@/lib/use-resource";
import { ErrorBox, Spinner } from "@/components/ui";

/** T-02: buổi học – điểm danh, bài đã dạy, nhận xét. */
export default function TeacherSessionPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useResource<SessionWorkspace>(`/api/teaching/sessions/${id}`);
  return (
    <>
      <Link href="/giao-vien" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Hôm nay
      </Link>
      {error && <ErrorBox message={error.message} />}
      {!data && !error && <Spinner />}
      {data && <SessionEditor key={data.session.id} ws={data} mode="TEACHER" saveUrl={`/api/teaching/sessions/${id}`} requestUrl={`/api/teaching/sessions/${id}/change-requests`} onSaved={reload} />}
    </>
  );
}
