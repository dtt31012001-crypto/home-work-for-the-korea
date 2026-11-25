"use client";

import { Building2, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ApiError, api } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { Badge, Dialog, EmptyState, ErrorBox, Field, PageHeader, PrimaryButton, Section, SecondaryButton, Spinner } from "@/components/ui";

interface OrgRow {
  id: string;
  code: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED";
  maxStudents: number | null;
  maxTeachers: number | null;
  counts: { students: number; teachers: number; parents: number };
}

const usage = (n: number, max: number | null) => (max == null ? `${n}` : `${n}/${max}`);

export default function CentersPage() {
  const { data, error, loading, reload } = useResource<OrgRow[]>("/api/admin/organizations");
  const [open, setOpen] = useState(false);

  return (
    <>
      <PageHeader
        title="Trung tâm"
        subtitle="Các trung tâm sử dụng nền tảng"
        action={
          <PrimaryButton onClick={() => setOpen(true)} icon={<Plus className="size-4" aria-hidden />}>
            Thêm trung tâm
          </PrimaryButton>
        }
      />
      {error && <ErrorBox message={error.message} />}
      {loading && !data && <Spinner />}
      {data && (
        <Section>
          {data.length === 0 ? (
            <EmptyState icon={<Building2 className="size-8" />} title="Chưa có trung tâm" hint="Thêm trung tâm đầu tiên để bắt đầu." />
          ) : (
            <ul className="divide-y divide-line">
              {data.map((o) => (
                <li key={o.id}>
                  <Link href={`/quan-tri/trung-tam/${o.id}`} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-semibold">
                        {o.name} <span className="text-xs font-normal text-muted">{o.code}</span>
                        {o.status === "SUSPENDED" && <Badge tone="orange">Tạm ngưng</Badge>}
                      </p>
                      <p className="text-sm text-muted">
                        Học viên {usage(o.counts.students, o.maxStudents)} · Giáo viên {usage(o.counts.teachers, o.maxTeachers)} · Phụ huynh {o.counts.parents}
                      </p>
                    </div>
                    <ChevronRight className="size-5 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
      <CreateCenterDialog open={open} onClose={() => setOpen(false)} onCreated={reload} />
    </>
  );
}

function CreateCenterDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(undefined);
    try {
      await api("POST", "/api/admin/organizations", { code, name });
      setCode("");
      setName("");
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Đã có lỗi xảy ra.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} title="Thêm trung tâm" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <ErrorBox message={error} />}
        <Field label="Tên trung tâm" value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Mã trung tâm" hint="Chữ, số, - và _ (vd. HORIZON)" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <div className="flex justify-end gap-2">
          <SecondaryButton type="button" onClick={onClose}>
            Hủy
          </SecondaryButton>
          <PrimaryButton type="submit" loading={loading}>
            Tạo
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}
