"use client";

import type { SessionWorkspace } from "@th/contracts";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { SessionEditor } from "@/components/session-editor";
import { useOrgId } from "@/components/workspace";
import { useResource } from "@/lib/use-resource";
import { ErrorBox, Spinner } from "@/components/ui";

/** Quản lý trung tâm xem/sửa điểm danh một buổi (sau thời hạn cần lý do). */
export default function CenterSessionPage() {
  const orgId = useOrgId();
  const { id } = useParams<{ id: string }>();
  const url = `/api/organizations/${orgId}/sessions/${id}/attendance`;
  const { data, error, reload } = useResource<SessionWorkspace>(url);
  return (
    <>
      {data && (
        <Link href={`/trung-tam/lop/${data.class.id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> {data.class.name}
        </Link>
      )}
      {error && <ErrorBox message={error.message} />}
      {!data && !error && <Spinner />}
      {data && <SessionEditor key={data.session.id} ws={data} mode="CENTER_ADMIN" saveUrl={url} onSaved={reload} />}
    </>
  );
}
