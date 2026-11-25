"use client";

import type { ChildSummary } from "@th/contracts";
import { Users } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useResource } from "@/lib/use-resource";
import { EmptyState, ErrorBox, Section, Spinner } from "./ui";

const KEY = "th.activeChild";

/**
 * Chọn con đang xem (phụ huynh có nhiều con). Chỉ các liên kết đang hiệu lực được trả về;
 * lựa chọn được nhớ trên trình duyệt này.
 */
export function WithChild({ children }: { children: (child: ChildSummary) => ReactNode }) {
  const { data, error } = useResource<ChildSummary[]>("/api/family/children");
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    try {
      setSelected(localStorage.getItem(KEY));
    } catch {
      /* không lưu được: dùng con đầu tiên */
    }
  }, []);
  if (error) return <ErrorBox message={error.message} />;
  if (!data) return <Spinner />;
  // Một học viên có thể được liên kết ở nhiều trung tâm: gộp theo học viên
  const kids = [...new Map(data.map((c) => [c.studentId, c])).values()];
  if (kids.length === 0)
    return (
      <Section>
        <EmptyState
          icon={<Users className="size-8" />}
          title="Chưa có liên kết với học viên"
          hint="Trung tâm sẽ liên kết tài khoản của bạn với con sau khi xác minh. Nếu con từ 18 tuổi, con cần đồng ý liên kết."
        />
      </Section>
    );
  const child = kids.find((c) => c.studentId === selected) ?? kids[0]!;
  const pick = (id: string) => {
    setSelected(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* bỏ qua */
    }
  };
  return (
    <>
      {kids.length > 1 && (
        <div role="tablist" aria-label="Chọn con" className="mb-4 flex gap-2 overflow-x-auto">
          {kids.map((c) => (
            <button
              key={c.studentId}
              role="tab"
              aria-selected={c.studentId === child.studentId}
              onClick={() => pick(c.studentId)}
              className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold ${c.studentId === child.studentId ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-white"}`}
            >
              {c.displayName}
            </button>
          ))}
        </div>
      )}
      {children(child)}
    </>
  );
}
