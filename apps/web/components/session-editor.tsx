"use client";

import { ATTENDANCE_LABEL, ATTENDANCE_ORDER, type AttendanceStatus, type SessionWorkspace } from "@th/contracts";
import { CheckCheck, Clock, MessageSquare, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { SessionBadges } from "./class-badges";
import { Badge, ErrorBox, PrimaryButton, Section, SecondaryButton, TextArea, WarnBox } from "./ui";

const TONE: Record<AttendanceStatus, string> = {
  PRESENT: "bg-brand-700 text-white border-brand-700",
  LATE: "bg-warn text-white border-warn",
  EXCUSED: "bg-ink text-white border-ink",
  ABSENT: "bg-danger text-white border-danger",
};
const SHORT: Record<AttendanceStatus, string> = { PRESENT: "Có mặt", LATE: "Muộn", EXCUSED: "Có phép", ABSENT: "Vắng" };

type Coverage = "" | "DONE" | "PARTIAL";

/**
 * Ghi buổi học (T-02 / quản lý trung tâm): điểm danh một chạm, bài đã dạy, ghi chú, nhận xét học viên.
 * Sau thời hạn: giáo viên chuyển sang gửi yêu cầu sửa (D-B19).
 */
export function SessionEditor({ ws, mode, saveUrl, requestUrl, onSaved }: { ws: SessionWorkspace; mode: "TEACHER" | "CENTER_ADMIN"; saveUrl: string; requestUrl?: string; onSaved: () => void }) {
  const marked = ws.roster.filter((r) => !r.onHold);
  const [status, setStatus] = useState<Record<string, AttendanceStatus | undefined>>(() => Object.fromEntries(ws.roster.map((r) => [r.student.id, r.attendance?.status])));
  const [notes, setNotes] = useState<Record<string, string>>(() => Object.fromEntries(ws.roster.map((r) => [r.student.id, r.attendance?.note ?? ""])));
  const [comments, setComments] = useState<Record<string, { body: string; visibleToFamily: boolean }>>(() =>
    Object.fromEntries(ws.roster.map((r) => [r.student.id, r.comment ?? { body: "", visibleToFamily: true }])),
  );
  const [openComment, setOpenComment] = useState<string>();
  const [coverage, setCoverage] = useState<Record<string, Coverage>>(() => Object.fromEntries(ws.taught.map((t) => [t.lessonId, t.coverage])));
  const [showAllLessons, setShowAllLessons] = useState(false);
  const [note, setNote] = useState(ws.note ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState<string>();
  const [loading, setLoading] = useState(false);

  const requestMode = mode === "TEACHER" && ws.needsRequest;
  const readOnly = !ws.editable && !requestMode;
  const deadline = new Date(ws.editDeadline);
  const deadlineText = new Intl.DateTimeFormat("vi-VN", { timeZone: ws.class.timezone, dateStyle: "short", timeStyle: "short" }).format(deadline);
  const afterDeadline = new Date() > deadline;
  const done = marked.filter((r) => status[r.student.id]).length;

  const plannedIdx = ws.lessons.findIndex((l) => l.id === ws.session.plannedLesson?.id);
  const visibleLessons = useMemo(() => {
    if (showAllLessons || plannedIdx < 0) return ws.lessons;
    const taughtIds = new Set(Object.keys(coverage).filter((k) => coverage[k]));
    return ws.lessons.filter((l, i) => (i >= plannedIdx - 2 && i <= plannedIdx + 1) || taughtIds.has(l.id));
  }, [showAllLessons, plannedIdx, ws.lessons, coverage]);

  async function submit() {
    setError(undefined);
    setSaved(undefined);
    const records = marked.filter((r) => status[r.student.id]).map((r) => ({ studentUserId: r.student.id, status: status[r.student.id]!, note: notes[r.student.id] || undefined }));
    setLoading(true);
    try {
      if (requestMode) {
        const changes = records.filter((r) => {
          const prev = ws.roster.find((x) => x.student.id === r.studentUserId)?.attendance;
          return !prev || prev.status !== r.status || (prev.note ?? "") !== (r.note ?? "");
        });
        if (changes.length === 0) throw new ApiError(400, "NO_CHANGES", "Chưa có thay đổi nào để gửi.");
        if (!reason.trim()) throw new ApiError(400, "REASON", "Vui lòng ghi lý do sửa.");
        await api("POST", requestUrl!, { changes, reason });
        setSaved("Đã gửi yêu cầu sửa. Quản lý trung tâm sẽ duyệt.");
      } else {
        if (done < marked.length) throw new ApiError(400, "INCOMPLETE", `Còn ${marked.length - done} học viên chưa điểm danh.`);
        await api("PUT", saveUrl, {
          records,
          lessons: Object.entries(coverage)
            .filter(([, c]) => c)
            .map(([lessonId, c]) => ({ lessonId, coverage: c })),
          note: note || undefined,
          comments: ws.roster.map((r) => ({ studentUserId: r.student.id, ...comments[r.student.id]! })).filter((c) => c.body || ws.roster.find((r) => r.student.id === c.studentUserId)?.comment),
          reason: reason || undefined,
        });
        setSaved("Đã lưu.");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Đã có lỗi xảy ra.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 pb-24">
      <div>
        <p className="text-sm text-muted">{ws.class.organizationName}</p>
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
          {ws.class.name} <SessionBadges kind={ws.session.kind} status={ws.session.status} />
        </h1>
        <p className="text-sm text-muted">
          {fmtDate(ws.session.date + "T00:00:00Z", "UTC", { weekday: "long" })} · {ws.session.startTime}–{ws.session.endTime} · {ws.session.room?.name ?? "Chưa xếp phòng"}
        </p>
        {ws.session.plannedLesson && (
          <p className="mt-1 text-sm">
            Bài dự kiến: <b>Bài {ws.session.plannedLesson.number}. {ws.session.plannedLesson.titleVi}</b>
          </p>
        )}
      </div>

      {ws.session.status === "CANCELLED" && <WarnBox>Buổi học đã nghỉ{ws.session.cancelReason ? `: ${ws.session.cancelReason}` : ""}.</WarnBox>}
      {requestMode && (
        <WarnBox>
          Đã quá thời hạn sửa ({deadlineText}). Thay đổi sẽ được gửi thành <b>yêu cầu sửa</b> để quản lý trung tâm duyệt.
        </WarnBox>
      )}
      {ws.pendingRequest && (
        <WarnBox>
          Đang có yêu cầu sửa chờ duyệt: “{ws.pendingRequest.reason}”.
        </WarnBox>
      )}
      {readOnly && ws.session.status !== "CANCELLED" && <WarnBox>Chưa đến ngày học – chưa điểm danh được.</WarnBox>}
      {mode === "CENTER_ADMIN" && afterDeadline && ws.session.status === "COMPLETED" && <WarnBox>Đã quá thời hạn của giáo viên: sửa trực tiếp cần ghi lý do.</WarnBox>}

      <Section
        title={`Điểm danh (${done}/${marked.length})`}
        action={
          !readOnly && (
            <SecondaryButton onClick={() => setStatus(Object.fromEntries(ws.roster.map((r) => [r.student.id, r.onHold ? undefined : "PRESENT"])))} icon={<CheckCheck className="size-4" aria-hidden />}>
              Tất cả có mặt
            </SecondaryButton>
          )
        }
      >
        {ws.roster.length === 0 && <p className="text-sm text-muted">Lớp chưa có học viên trong ngày này.</p>}
        <ul className="divide-y divide-line">
          {ws.roster.map((r) => (
            <li key={r.student.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  {r.student.displayName}
                  {r.onHold && (
                    <span className="ml-2">
                      <Badge tone="orange">Bảo lưu</Badge>
                    </span>
                  )}
                </p>
                {!r.onHold && (
                  <button
                    type="button"
                    onClick={() => setOpenComment(openComment === r.student.id ? undefined : r.student.id)}
                    className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs ${comments[r.student.id]?.body ? "text-brand-700" : "text-muted"}`}
                    aria-expanded={openComment === r.student.id}
                  >
                    <MessageSquare className="size-4" aria-hidden /> Nhận xét
                  </button>
                )}
              </div>
              {!r.onHold && (
                <div className="mt-2 grid grid-cols-4 gap-1.5" role="group" aria-label={`Điểm danh ${r.student.displayName}`}>
                  {ATTENDANCE_ORDER.map((st) => (
                    <button
                      key={st}
                      type="button"
                      disabled={readOnly}
                      aria-pressed={status[r.student.id] === st}
                      aria-label={`${r.student.displayName}: ${ATTENDANCE_LABEL[st]}`}
                      onClick={() => setStatus({ ...status, [r.student.id]: st })}
                      className={`h-11 rounded-lg border text-sm font-semibold disabled:opacity-60 ${status[r.student.id] === st ? TONE[st] : "border-line bg-surface text-ink"}`}
                    >
                      {SHORT[st]}
                    </button>
                  ))}
                </div>
              )}
              {openComment === r.student.id && (
                <div className="mt-2 space-y-2 rounded-lg bg-canvas p-3">
                  {(status[r.student.id] === "ABSENT" || status[r.student.id] === "EXCUSED" || status[r.student.id] === "LATE") && (
                    <input
                      aria-label="Ghi chú điểm danh"
                      placeholder="Ghi chú điểm danh (vd. lý do vắng)"
                      value={notes[r.student.id] ?? ""}
                      disabled={readOnly}
                      onChange={(e) => setNotes({ ...notes, [r.student.id]: e.target.value })}
                      className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm"
                    />
                  )}
                  <textarea
                    aria-label={`Nhận xét ${r.student.displayName}`}
                    rows={2}
                    placeholder="Nhận xét về học viên trong buổi này"
                    value={comments[r.student.id]?.body ?? ""}
                    disabled={readOnly || requestMode}
                    onChange={(e) => setComments({ ...comments, [r.student.id]: { ...comments[r.student.id]!, body: e.target.value } })}
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                  />
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="size-4 accent-brand-700"
                      checked={comments[r.student.id]?.visibleToFamily ?? true}
                      disabled={readOnly || requestMode}
                      onChange={(e) => setComments({ ...comments, [r.student.id]: { ...comments[r.student.id]!, visibleToFamily: e.target.checked } })}
                    />
                    Học viên và phụ huynh xem được nhận xét này
                  </label>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Section>

      {!requestMode && (
        <Section
          title="Bài đã dạy"
          action={
            ws.lessons.length > visibleLessons.length || showAllLessons ? (
              <button type="button" onClick={() => setShowAllLessons(!showAllLessons)} className="text-sm font-semibold text-brand-700">
                {showAllLessons ? "Thu gọn" : "Xem tất cả bài"}
              </button>
            ) : undefined
          }
        >
          <ul className="divide-y divide-line">
            {visibleLessons.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1 text-sm">
                  <b>Bài {l.number}.</b> {l.titleVi}
                  {l.id === ws.session.plannedLesson?.id && <span className="ml-1 text-xs text-brand-700">(dự kiến)</span>}
                </span>
                <div className="flex gap-1" role="group" aria-label={`Bài ${l.number}`}>
                  {(
                    [
                      ["DONE", "Xong"],
                      ["PARTIAL", "Một phần"],
                    ] as const
                  ).map(([c, label]) => (
                    <button
                      key={c}
                      type="button"
                      disabled={readOnly}
                      aria-pressed={coverage[l.id] === c}
                      onClick={() => setCoverage({ ...coverage, [l.id]: coverage[l.id] === c ? "" : c })}
                      className={`h-9 rounded-lg border px-3 text-xs font-semibold ${coverage[l.id] === c ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-surface"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <TextArea label="Ghi chú buổi học" value={note} disabled={readOnly} onChange={(e) => setNote(e.target.value)} placeholder="Nội dung đã dạy, bài tập về nhà…" />
          </div>
        </Section>
      )}

      {(requestMode || (mode === "CENTER_ADMIN" && afterDeadline && ws.session.status === "COMPLETED")) && (
        <Section>
          <TextArea label={requestMode ? "Lý do sửa (bắt buộc)" : "Lý do sửa sau thời hạn (bắt buộc)"} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Section>
      )}

      {!readOnly && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 p-3 backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            {error && <ErrorBox message={error} />}
            {saved && <p className="text-center text-sm font-semibold text-brand-700">{saved}</p>}
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-xs text-muted">
                <Clock className="size-3.5" aria-hidden /> Sửa đến {deadlineText}
              </span>
              <PrimaryButton className="ml-auto" onClick={submit} loading={loading} icon={requestMode ? <Send className="size-4" aria-hidden /> : undefined}>
                {requestMode ? "Gửi yêu cầu sửa" : ws.session.status === "COMPLETED" ? "Lưu thay đổi" : "Lưu điểm danh"}
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
