"use client";

import { FileUp } from "lucide-react";
import Link from "next/link";
import { PeopleList } from "@/components/people-list";
import { PageHeader } from "@/components/ui";
import { useOrgId } from "@/components/workspace";

export default function TeachersPage() {
  const orgId = useOrgId();
  return (
    <>
      <PageHeader
        title="Giáo viên"
        action={
          <Link href="/trung-tam/nhap?role=TEACHER" className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border border-line bg-surface px-4 text-sm font-semibold hover:bg-canvas">
            <FileUp className="size-4" aria-hidden /> Nhập từ file
          </Link>
        }
      />
      <PeopleList orgId={orgId} role="TEACHER" issueTitle="Thêm giáo viên" emptyTitle="Chưa có giáo viên" emptyHint="Thêm giáo viên để phân công lớp và điểm danh." />
    </>
  );
}
