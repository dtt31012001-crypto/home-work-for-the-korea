"use client";

import { PeopleList } from "@/components/people-list";
import { PageHeader } from "@/components/ui";
import { useOrgId } from "@/components/workspace";

export default function TeachersPage() {
  const orgId = useOrgId();
  return (
    <>
      <PageHeader title="Giáo viên" />
      <PeopleList orgId={orgId} role="TEACHER" issueTitle="Thêm giáo viên" emptyTitle="Chưa có giáo viên" emptyHint="Thêm giáo viên để phân công lớp và điểm danh." />
    </>
  );
}
