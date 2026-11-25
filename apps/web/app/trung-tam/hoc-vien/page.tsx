"use client";

import { PeopleList } from "@/components/people-list";
import { PageHeader } from "@/components/ui";
import { useOrgId } from "@/components/workspace";

export default function StudentsPage() {
  const orgId = useOrgId();
  return (
    <>
      <PageHeader title="Học viên" />
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
