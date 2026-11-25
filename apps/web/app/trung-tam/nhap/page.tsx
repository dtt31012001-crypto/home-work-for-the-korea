"use client";

import { IMPORT_MAX_ROWS, type ImportOutcome, type ImportResult } from "@th/contracts";
import { ArrowLeft, Download, FileUp, Upload } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useOrgId } from "@/components/workspace";
import { ApiError, api } from "@/lib/api";
import { downloadCsv, parseCsv } from "@/lib/csv";
import { Badge, ErrorBox, PageHeader, PrimaryButton, Section, SecondaryButton, Tabs, WarnBox } from "@/components/ui";

type Role = "STUDENT" | "TEACHER";
type Row = { displayName: string; phone?: string; email?: string; dateOfBirth?: string };

const HEADERS = ["Họ và tên", "Số điện thoại", "Email", "Ngày sinh (NNNN-TT-NN)"];
const OUTCOME: Record<ImportOutcome, { label: string; tone: "green" | "gray" | "orange" | "red" }> = {
  CREATE: { label: "Tạo mới", tone: "green" },
  LINK_EXISTING: { label: "Gắn vào tài khoản sẵn có", tone: "orange" },
  ALREADY_HAS_ROLE: { label: "Đã có – bỏ qua", tone: "gray" },
  ERROR: { label: "Lỗi", tone: "red" },
};
const ROLE_LABEL: Record<Role, string> = { STUDENT: "học viên", TEACHER: "giáo viên" };

/** Đọc file theo vị trí cột của mẫu; bỏ dòng tiêu đề. */
function toRows(table: string[][]): Row[] {
  const [, ...body] = table;
  return body.map((r) => ({
    displayName: (r[0] ?? "").trim(),
    phone: (r[1] ?? "").trim() || undefined,
    email: (r[2] ?? "").trim() || undefined,
    dateOfBirth: (r[3] ?? "").trim() || undefined,
  }));
}

function ImportPage() {
  const orgId = useOrgId();
  const params = useSearchParams();
  const [role, setRole] = useState<Role>(params.get("role") === "TEACHER" ? "TEACHER" : "STUDENT");
  const [fileName, setFileName] = useState<string>();
  const [rows, setRows] = useState<Row[]>();
  const [preview, setPreview] = useState<ImportResult>();
  const [done, setDone] = useState<ImportResult>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const back = role === "STUDENT" ? "/trung-tam/hoc-vien" : "/trung-tam/giao-vien";

  const reset = () => {
    setRows(undefined);
    setPreview(undefined);
    setDone(undefined);
    setError(undefined);
    setFileName(undefined);
  };

  const run = async (data: Row[], dryRun: boolean) => {
    setBusy(true);
    setError(undefined);
    try {
      const r = await api<ImportResult>("POST", `/api/organizations/${orgId}/accounts/import`, { role, rows: data, dryRun });
      if (dryRun) setPreview(r);
      else setDone(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Không gửi được dữ liệu.");
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File) => {
    reset();
    setFileName(file.name);
    if (!/\.csv$/i.test(file.name)) {
      setError("Vui lòng chọn file .csv (trong Excel: Lưu thành → CSV UTF-8).");
      return;
    }
    const parsed = toRows(parseCsv(await file.text()));
    if (parsed.length === 0) return setError("File không có dòng dữ liệu nào dưới dòng tiêu đề.");
    if (parsed.length > IMPORT_MAX_ROWS) return setError(`File có ${parsed.length} dòng; tối đa ${IMPORT_MAX_ROWS} dòng mỗi lần.`);
    setRows(parsed);
    await run(parsed, true);
  };

  const result = done ?? preview;
  const willChange = preview ? preview.summary.CREATE + preview.summary.LINK_EXISTING : 0;

  return (
    <>
      <Link href={back} className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Quay lại
      </Link>
      <PageHeader title="Nhập danh sách từ file" subtitle="Tạo nhiều tài khoản một lần. Mỗi dòng áp dụng đúng quy tắc như thêm từng người." />
      <div className="space-y-4">
        {!done && (
          <Tabs<Role>
            tabs={[
              { value: "STUDENT", label: "Học viên" },
              { value: "TEACHER", label: "Giáo viên" },
            ]}
            value={role}
            onChange={(r) => {
              setRole(r);
              reset();
            }}
          />
        )}

        {!done && (
          <Section title="1. Chuẩn bị file">
            <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm">
              <li>Tải file mẫu, điền mỗi người một dòng (giữ nguyên dòng tiêu đề).</li>
              <li>Cần ít nhất số điện thoại hoặc email. Ngày sinh giúp xác định học viên chưa thành niên.</li>
              <li>Người đã có tài khoản (cùng SĐT/email) sẽ được gắn thêm vai trò, không tạo trùng.</li>
            </ol>
            <SecondaryButton
              onClick={() => downloadCsv(`mau-nhap-${role === "STUDENT" ? "hoc-vien" : "giao-vien"}.csv`, [HEADERS, ["Nguyễn Văn A", "0912345678", "", role === "STUDENT" ? "2010-05-31" : ""]])}
              icon={<Download className="size-4" aria-hidden />}
            >
              Tải file mẫu
            </SecondaryButton>
          </Section>
        )}

        {!done && (
          <Section title="2. Chọn file và kiểm tra">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line p-6 text-center hover:bg-canvas">
              <Upload className="size-6 text-muted" aria-hidden />
              <span className="font-semibold">{fileName ?? "Chọn file CSV"}</span>
              <span className="text-xs text-muted">Hệ thống kiểm tra trước, chưa tạo tài khoản nào.</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                aria-label="Chọn file CSV"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                  e.target.value = "";
                }}
              />
            </label>
          </Section>
        )}

        {error && <ErrorBox message={error} />}

        {result && (
          <Section title={done ? "Kết quả" : `Kết quả kiểm tra (${result.rows.length} dòng)`}>
            <div className="mb-3 flex flex-wrap gap-2">
              {(Object.keys(OUTCOME) as ImportOutcome[]).map((k) =>
                result.summary[k] ? (
                  <Badge key={k} tone={OUTCOME[k].tone}>
                    {OUTCOME[k].label}: {result.summary[k]}
                  </Badge>
                ) : null,
              )}
            </div>
            {done && done.rows.some((r) => r.temporaryPassword) && (
              <div className="mb-3 space-y-2">
                <WarnBox>
                  Mật khẩu tạm chỉ hiển thị <b>một lần</b>. Hãy tải danh sách và gửi trực tiếp cho từng người; họ phải đổi mật khẩu ở lần đăng nhập đầu
                  {done.temporaryPasswordExpiresAt ? ` (hết hạn ${new Date(done.temporaryPasswordExpiresAt).toLocaleDateString("vi-VN")})` : ""}. Không lưu file này ở nơi dùng chung.
                </WarnBox>
                <PrimaryButton
                  onClick={() =>
                    downloadCsv(`mat-khau-tam-${ROLE_LABEL[role].replace(" ", "-")}.csv`, [
                      ["Họ và tên", "Đăng nhập bằng", "Mật khẩu tạm"],
                      ...done.rows.filter((r) => r.temporaryPassword).map((r) => [r.displayName, r.identifier, r.temporaryPassword]),
                    ])
                  }
                  icon={<Download className="size-4" aria-hidden />}
                >
                  Tải danh sách mật khẩu tạm
                </PrimaryButton>
              </div>
            )}
            <ul className="divide-y divide-line">
              {result.rows.map((r) => (
                <li key={r.line} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2 text-sm">
                  <span className="w-12 shrink-0 font-mono text-xs text-muted">Dòng {r.line}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{r.displayName || <span className="text-muted">(không có tên)</span>}</p>
                    <p className="text-muted">{r.identifier || "—"}</p>
                    {r.message && <p className={r.outcome === "ERROR" ? "text-danger" : "text-muted"}>{r.message}</p>}
                  </div>
                  <Badge tone={OUTCOME[r.outcome].tone}>{OUTCOME[r.outcome].label}</Badge>
                  {r.temporaryPassword && <code className="w-full rounded bg-canvas px-2 py-1 font-mono sm:w-auto">{r.temporaryPassword}</code>}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              {!done && rows && (
                <PrimaryButton disabled={willChange === 0} loading={busy} onClick={() => void run(rows, false)} icon={<FileUp className="size-4" aria-hidden />}>
                  {willChange === 0 ? "Không có dòng nào để tạo" : `Xác nhận tạo ${willChange} ${ROLE_LABEL[role]}`}
                </PrimaryButton>
              )}
              {done && (
                <>
                  <Link href={back} className="inline-flex h-10 items-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white">
                    Xem danh sách {ROLE_LABEL[role]}
                  </Link>
                  <SecondaryButton onClick={reset}>Nhập file khác</SecondaryButton>
                </>
              )}
            </div>
            {!done && preview && preview.summary.ERROR > 0 && <p className="mt-2 text-xs text-muted">Dòng lỗi sẽ được bỏ qua. Bạn có thể sửa file và chọn lại.</p>}
          </Section>
        )}
      </div>
    </>
  );
}

/** C-07: nhập danh sách học viên/giáo viên (giai đoạn 1). */
export default function Page() {
  return (
    <Suspense>
      <ImportPage />
    </Suspense>
  );
}
