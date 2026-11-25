/**
 * Chuẩn hóa định danh đăng nhập (SĐT hoặc email) để so khớp và chống trùng tài khoản.
 * SĐT lưu dạng E.164. Số bắt đầu bằng 0 được hiểu là số Việt Nam (+84).
 */
export type IdentifierType = "PHONE" | "EMAIL";

export interface NormalizedIdentifier {
  type: IdentifierType;
  value: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(input: string): string | null {
  const v = input.trim().toLowerCase();
  if (v.length > 254 || !EMAIL_RE.test(v)) return null;
  return v;
}

export function normalizePhone(input: string): string | null {
  let v = input.trim().replace(/[\s.\-()]/g, "");
  if (v.startsWith("00")) v = "+" + v.slice(2);
  if (/^0\d{9}$/.test(v)) v = "+84" + v.slice(1);
  else if (/^84\d{9}$/.test(v)) v = "+" + v;
  if (!/^\+\d{8,15}$/.test(v)) return null;
  if (v.startsWith("+84") && !/^\+84[35789]\d{8}$/.test(v)) return null;
  return v;
}

export function normalizeIdentifier(input: string): NormalizedIdentifier | null {
  if (input.includes("@")) {
    const email = normalizeEmail(input);
    return email ? { type: "EMAIL", value: email } : null;
  }
  const phone = normalizePhone(input);
  return phone ? { type: "PHONE", value: phone } : null;
}

/** Hiển thị định danh đã che bớt, vd. +84•••••4567, a•••@gmail.com */
export function maskIdentifier(id: NormalizedIdentifier): string {
  if (id.type === "PHONE") return id.value.slice(0, 3) + "•••••" + id.value.slice(-4);
  const [local, domain] = id.value.split("@");
  return (local?.[0] ?? "") + "•••@" + domain;
}
