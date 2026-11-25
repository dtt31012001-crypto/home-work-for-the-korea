"use client";

import { EDITION_STATUS_LABEL, LICENSE_STATUS_LABEL, parseLessonLines, type EditionDetail } from "@th/contracts";
import { Archive, ArchiveRestore, ArrowLeft, ListPlus, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { EditionForm, editionToForm, formToBody } from "@/components/curriculum/edition-form";
import { ApiError, api } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { Badge, Dialog, EmptyState, ErrorBox, Field, PageHeader, PrimaryButton, Section, SecondaryButton, Spinner, TextArea, WarnBox } from "@/components/ui";

type Lesson = EditionDetail["lessons"][number];

export default function EditionPage() {
  const { editionId } = useParams<{ editionId: string }>();
  const { data, error, reload } = useResource<EditionDetail>(`/api/admin/curricula/editions/${editionId}`);
  const [bulk, setBulk] = useState(false);
  const [edit, setEdit] = useState<Lesson | "new">();
  const [statusError, setStatusError] = useState<string>();

  if (error) return <ErrorBox message={error.message} />;
  if (!data) return <Spinner />;

  async function setStatus(status: EditionDetail["status"]) {
    setStatusError(undefined);
    try {
      await api("PATCH", `/api/admin/curricula/editions/${editionId}`, { status });
      reload();
    } catch (e) {
      setStatusError(e instanceof ApiError ? e.message : "Đã có lỗi xảy ra.");
    }
  }

  const nextNumber = (data.lessons.at(-1)?.number ?? 0) + 1;

  return (
    <>
      <Link href="/quan-tri/giao-trinh" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Giáo trình
      </Link>
      <PageHeader
        title={`${data.level.code} · ${data.name}`}
        subtitle={`${data.level.series.nameVi} – ${data.level.nameVi}`}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={data.status === "ACTIVE" ? "green" : data.status === "DRAFT" ? "gray" : "orange"}>{EDITION_STATUS_LABEL[data.status]}</Badge>
            {data.status !== "ACTIVE" ? (
              <PrimaryButton onClick={() => setStatus("ACTIVE")}>Đưa vào sử dụng</PrimaryButton>
            ) : (
              <SecondaryButton onClick={() => setStatus("ARCHIVED")}>Ngừng dùng</SecondaryButton>
            )}
          </div>
        }
      />
      {statusError && (
        <div className="mb-4">
          <ErrorBox message={statusError} />
        </div>
      )}
      {data.licenseStatus === "UNCONFIRMED" && (
        <div className="mb-4">
          <WarnBox>
            <b>{LICENSE_STATUS_LABEL.UNCONFIRMED}.</b> Chỉ lưu khung (số và tên bài) để quản lý lớp. Không số hóa nội dung giáo trình cho tới khi có văn bản cho phép.
          </WarnBox>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Section
            title={`Danh sách bài (${data.lessons.filter((l) => l.status === "ACTIVE").length})`}
            action={
              <div className="flex gap-2">
                <SecondaryButton onClick={() => setBulk(true)} icon={<ListPlus className="size-4" aria-hidden />}>
                  Nhập nhiều bài
                </SecondaryButton>
                <PrimaryButton onClick={() => setEdit("new")} icon={<Plus className="size-4" aria-hidden />}>
                  Thêm bài
                </PrimaryButton>
              </div>
            }
          >
            {data.lessons.length === 0 ? (
              <EmptyState title="Chưa có bài nào" hint="Nhập dần từng bài theo phiên bản giáo trình (số bài, tên tiếng Việt, tên tiếng Hàn)." />
            ) : (
              <ul className="divide-y divide-line">
                {data.lessons.map((l) => (
                  <li key={l.id} className={`flex items-center gap-3 py-2.5 ${l.status === "ARCHIVED" ? "opacity-50" : ""}`}>
                    <span className="w-10 shrink-0 text-right font-mono text-sm text-muted">{l.number}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{l.titleVi}</p>
                      {l.titleKo && (
                        <p className="text-xs text-muted" lang="ko">
                          {l.titleKo}
                        </p>
                      )}
                    </div>
                    <button onClick={() => setEdit(l)} className="rounded-lg p-2 text-muted hover:bg-canvas" aria-label={`Sửa bài ${l.number}`}>
                      <Pencil className="size-4" aria-hidden />
                    </button>
                    <button
                      onClick={async () => {
                        await api("PATCH", `/api/admin/curricula/lessons/${l.id}`, { status: l.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE" });
                        reload();
                      }}
                      className="rounded-lg p-2 text-muted hover:bg-canvas"
                      aria-label={l.status === "ACTIVE" ? `Ẩn bài ${l.number}` : `Hiện lại bài ${l.number}`}
                    >
                      {l.status === "ACTIVE" ? <Archive className="size-4" aria-hidden /> : <ArchiveRestore className="size-4" aria-hidden />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
        <div className="lg:col-span-2">
          <Section title="Nguồn và quyền sử dụng">
            <EditionForm
              key={data.id + data.licenseStatus}
              initial={editionToForm(data)}
              submitLabel="Lưu"
              onSubmit={async (v) => {
                try {
                  await api("PATCH", `/api/admin/curricula/editions/${editionId}`, formToBody(v));
                  reload();
                } catch (e) {
                  throw new Error(e instanceof ApiError ? e.message : "Đã có lỗi xảy ra.");
                }
              }}
            />
          </Section>
        </div>
      </div>
      {edit && <LessonDialog editionId={editionId} lesson={edit === "new" ? undefined : edit} defaultNumber={nextNumber} onClose={() => setEdit(undefined)} onSaved={reload} />}
      <BulkDialog open={bulk} editionId={editionId} onClose={() => setBulk(false)} onSaved={reload} />
    </>
  );
}

function LessonDialog({ editionId, lesson, defaultNumber, onClose, onSaved }: { editionId: string; lesson?: Lesson; defaultNumber: number; onClose: () => void; onSaved: () => void }) {
  const [number, setNumber] = useState(String(lesson?.number ?? defaultNumber));
  const [titleVi, setTitleVi] = useState(lesson?.titleVi ?? "");
  const [titleKo, setTitleKo] = useState(lesson?.titleKo ?? "");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(undefined);
    const body = { number: Number(number), titleVi, titleKo };
    try {
      if (lesson) await api("PATCH", `/api/admin/curricula/lessons/${lesson.id}`, body);
      else await api("POST", `/api/admin/curricula/editions/${editionId}/lessons`, body);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Đã có lỗi xảy ra.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <Dialog open title={lesson ? `Sửa bài ${lesson.number}` : "Thêm bài"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <ErrorBox message={error} />}
        <Field label="Số bài" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, ""))} />
        <Field label="Tên bài (tiếng Việt)" value={titleVi} onChange={(e) => setTitleVi(e.target.value)} />
        <Field label="Tên bài (tiếng Hàn)" lang="ko" value={titleKo} onChange={(e) => setTitleKo(e.target.value)} />
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

function BulkDialog({ open, editionId, onClose, onSaved }: { open: boolean; editionId: string; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<{ line: number; message: string }[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const preview = parseLessonLines(text);
  const valid = preview.filter((p) => p.value).length;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(undefined);
    setErrors([]);
    try {
      await api("POST", `/api/admin/curricula/editions/${editionId}/lessons/bulk`, { text });
      setText("");
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (Array.isArray(err.details)) setErrors(err.details as { line: number; message: string }[]);
      } else setError("Đã có lỗi xảy ra.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <Dialog open={open} title="Nhập nhiều bài" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-sm text-muted">
          Mỗi dòng một bài: <code className="rounded bg-canvas px-1">số | tên tiếng Việt | tên tiếng Hàn</code> (tên tiếng Hàn không bắt buộc). Có thể dán trực tiếp từ Excel.
        </p>
        {error && <ErrorBox message={error} />}
        {errors.length > 0 && (
          <ul className="space-y-1 text-sm text-danger">
            {errors.map((e) => (
              <li key={e.line}>
                Dòng {e.line}: {e.message}
              </li>
            ))}
          </ul>
        )}
        <TextArea label="Danh sách bài" rows={8} value={text} onChange={(e) => setText(e.target.value)} />
        <p className="text-xs text-muted">
          {preview.length} dòng · {valid} hợp lệ
        </p>
        <div className="flex justify-end gap-2">
          <SecondaryButton type="button" onClick={onClose}>
            Hủy
          </SecondaryButton>
          <PrimaryButton type="submit" loading={loading} disabled={valid === 0}>
            Nhập {valid > 0 ? `${valid} bài` : ""}
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}
