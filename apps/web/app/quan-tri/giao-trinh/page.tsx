"use client";

import { EDITION_STATUS_LABEL, type CurriculumTree } from "@th/contracts";
import { BookOpen, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { EditionForm, emptyEdition, formToBody } from "@/components/curriculum/edition-form";
import { ApiError, api } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { Badge, Dialog, ErrorBox, Field, PageHeader, PrimaryButton, Section, SecondaryButton, SelectField, Spinner } from "@/components/ui";

type Level = CurriculumTree["series"][number]["levels"][number];

export default function CurriculumPage() {
  const { data, error, reload } = useResource<CurriculumTree>("/api/admin/curricula");
  const router = useRouter();
  const [editionFor, setEditionFor] = useState<Level>();
  const [levelEdit, setLevelEdit] = useState<{ seriesId: string; level?: Level }>();

  if (error) return <ErrorBox message={error.message} />;
  if (!data) return <Spinner />;

  return (
    <>
      <PageHeader title="Giáo trình" subtitle="Mã chương trình, phiên bản giáo trình và danh sách bài. Hệ thống không tự tạo nội dung giáo trình." />
      <div className="space-y-4">
        {data.series.map((s) => (
          <Section
            key={s.id}
            title={`${s.nameVi} · ${s.code}`}
            action={
              <SecondaryButton onClick={() => setLevelEdit({ seriesId: s.id })} icon={<Plus className="size-4" aria-hidden />}>
                Thêm cấp độ
              </SecondaryButton>
            }
          >
            {s.nameKo && (
              <p className="-mt-2 mb-3 text-sm text-muted" lang="ko">
                {s.nameKo}
              </p>
            )}
            <ul className="divide-y divide-line">
              {s.levels.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="w-20 shrink-0 font-mono text-sm font-semibold text-brand-800">{l.code}</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {l.nameVi}
                      {l.nameKo && (
                        <span className="font-normal text-muted" lang="ko">
                          {l.nameKo}
                        </span>
                      )}
                      {l.structure === "SOCIETY" && <Badge>Theo chủ đề xã hội</Badge>}
                      {l.status === "ARCHIVED" && <Badge tone="orange">Ngừng dùng</Badge>}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {l.editions.length === 0 && <span className="text-xs text-muted">Chưa có phiên bản</span>}
                      {l.editions.map((e) => (
                        <Link key={e.id} href={`/quan-tri/giao-trinh/${e.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-xs hover:border-brand-600">
                          <BookOpen className="size-3.5" aria-hidden />
                          {e.name} · {e.lessonCount} bài
                          <Badge tone={e.status === "ACTIVE" ? "green" : e.status === "DRAFT" ? "gray" : "orange"}>{EDITION_STATUS_LABEL[e.status]}</Badge>
                        </Link>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <SecondaryButton onClick={() => setLevelEdit({ seriesId: s.id, level: l })} aria-label={`Sửa ${l.code}`} icon={<Pencil className="size-4" aria-hidden />} />
                    <SecondaryButton onClick={() => setEditionFor(l)} icon={<Plus className="size-4" aria-hidden />}>
                      Phiên bản
                    </SecondaryButton>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        ))}
      </div>

      <Dialog open={Boolean(editionFor)} title={`Thêm phiên bản – ${editionFor?.code ?? ""}`} onClose={() => setEditionFor(undefined)}>
        {editionFor && (
          <EditionForm
            initial={emptyEdition}
            submitLabel="Tạo phiên bản"
            onSubmit={async (v) => {
              try {
                const r = await api<{ id: string }>("POST", "/api/admin/curricula/editions", { levelId: editionFor.id, ...formToBody(v) });
                router.push(`/quan-tri/giao-trinh/${r.id}`);
              } catch (e) {
                throw new Error(e instanceof ApiError ? e.message : "Đã có lỗi xảy ra.");
              }
            }}
          />
        )}
      </Dialog>
      {levelEdit && <LevelDialog seriesId={levelEdit.seriesId} level={levelEdit.level} onClose={() => setLevelEdit(undefined)} onSaved={reload} />}
    </>
  );
}

function LevelDialog({ seriesId, level, onClose, onSaved }: { seriesId: string; level?: Level; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({
    code: level?.code ?? "",
    nameVi: level?.nameVi ?? "",
    nameKo: level?.nameKo ?? "",
    structure: level?.structure ?? "LANGUAGE",
    status: level?.status ?? "ACTIVE",
  });
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(undefined);
    try {
      if (level) await api("PATCH", `/api/admin/curricula/levels/${level.id}`, v);
      else await api("POST", "/api/admin/curricula/levels", { seriesId, code: v.code, nameVi: v.nameVi, nameKo: v.nameKo, structure: v.structure });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Đã có lỗi xảy ra.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <Dialog open title={level ? `Sửa cấp độ ${level.code}` : "Thêm cấp độ"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <ErrorBox message={error} />}
        <Field label="Mã chương trình" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} />
        <Field label="Tên tiếng Việt" value={v.nameVi} onChange={(e) => setV({ ...v, nameVi: e.target.value })} />
        <Field label="Tên tiếng Hàn" lang="ko" value={v.nameKo} onChange={(e) => setV({ ...v, nameKo: e.target.value })} />
        <SelectField
          label="Cấu trúc bài học"
          value={v.structure}
          onChange={(e) => setV({ ...v, structure: e.target.value as typeof v.structure })}
          options={[
            { value: "LANGUAGE", label: "Theo kỹ năng ngôn ngữ" },
            { value: "SOCIETY", label: "Theo chủ đề xã hội (vd. KIIP cấp 5)" },
          ]}
        />
        {level && (
          <SelectField
            label="Trạng thái"
            value={v.status}
            onChange={(e) => setV({ ...v, status: e.target.value as typeof v.status })}
            options={[
              { value: "ACTIVE", label: "Đang dùng" },
              { value: "ARCHIVED", label: "Ngừng dùng" },
            ]}
          />
        )}
        <div className="flex justify-end gap-2">
          <SecondaryButton type="button" onClick={onClose}>
            Hủy
          </SecondaryButton>
          <PrimaryButton type="submit" loading={loading}>
            Lưu
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}
