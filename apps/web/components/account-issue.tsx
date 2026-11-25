"use client";

import type { IssueAccountResponse } from "@th/contracts";
import { useState, type FormEvent, type ReactNode } from "react";
import { ApiError, api } from "@/lib/api";
import { Dialog, ErrorBox, Field, PrimaryButton, SecondaryButton, TemporaryPasswordNotice } from "./ui";

/**
 * Hộp thoại cấp tài khoản dùng chung (D-B17): nhập tên + SĐT/email → nhận mật khẩu tạm hiển thị một lần.
 * SĐT/email đã có tài khoản → chỉ gắn vai trò, báo rõ cho người dùng.
 */
export function IssueAccountDialog({
  open,
  onClose,
  onDone,
  title,
  endpoint,
  body,
  extraFields,
  withDateOfBirth,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  title: string;
  endpoint: string;
  body: Record<string, unknown>;
  extraFields?: ReactNode;
  /** Hiện ô ngày sinh (học viên – để xác định chưa thành niên khi liên kết phụ huynh) */
  withDateOfBirth?: boolean;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IssueAccountResponse>();

  function close() {
    if (result) onDone();
    setName("");
    setPhone("");
    setEmail("");
    setDob("");
    setError(undefined);
    setResult(undefined);
    onClose();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (!name.trim()) return setError("Vui lòng nhập họ tên.");
    if (!phone.trim() && !email.trim()) return setError("Cần số điện thoại hoặc email để đăng nhập.");
    setLoading(true);
    try {
      const res = await api<IssueAccountResponse>("POST", endpoint, {
        displayName: name,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        dateOfBirth: withDateOfBirth && dob ? dob : undefined,
        ...body,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Đã có lỗi xảy ra.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} title={title} onClose={close} footer={result ? <PrimaryButton onClick={close}>Xong</PrimaryButton> : undefined}>
      {result ? (
        result.temporaryPassword ? (
          <TemporaryPasswordNotice password={result.temporaryPassword} expiresAt={result.temporaryPasswordExpiresAt} identifier={phone || email} />
        ) : (
          <p className="text-sm">
            Số điện thoại/email này <b>đã có tài khoản</b>. Hệ thống đã gắn thêm vai trò vào tài khoản sẵn có – người dùng tiếp tục đăng nhập bằng mật khẩu hiện tại.
          </p>
        )
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <ErrorBox message={error} />}
          <Field label="Họ và tên" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          <Field label="Số điện thoại" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
          <Field label="Email (không bắt buộc)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          {withDateOfBirth && (
            <Field label="Ngày sinh" type="date" hint="Cần để xác định học viên chưa thành niên khi liên kết phụ huynh." value={dob} onChange={(e) => setDob(e.target.value)} />
          )}
          {extraFields}
          <div className="flex justify-end gap-2">
            <SecondaryButton type="button" onClick={close}>
              Hủy
            </SecondaryButton>
            <PrimaryButton type="submit" loading={loading}>
              Cấp tài khoản
            </PrimaryButton>
          </div>
        </form>
      )}
    </Dialog>
  );
}
