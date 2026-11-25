"use client";

import { FileUp } from "lucide-react";
import Link from "next/link";
import { PeopleList } from "@/components/people-list";
import { PageHeader } from "@/components/ui";
import { useOrgId } from "@/components/workspace";

export default function StudentsPage() {
  const orgId = useOrgId();
  return (
    <>
      <PageHeader
        title="Học viên"
        action={
          <Link href="/trung-tam/nhap?role=STUDENT" className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border border-line bg-surface px-4 text-sm font-semibold hover:bg-canvas">
            <FileUp className="size-4" aria-hidden /> Nhập từ file
          </Link>
        }
      />
      <PeopleList
        orgId={orgId}
        role="STUDENT"
        issueTitle="Thêm học viên"
        emptyTitle="Chưa có học viên"
        emptyHint="Thêm học viên để ghi danh vào lớp và liên kết phụ huynh."
        detailHref={(id) => `/trung-tam/hoc-vien/${id}`}
        withDateOfBirth
      />
    </>
  );
}
