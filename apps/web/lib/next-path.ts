/** Chỉ cho phép chuyển hướng nội bộ (chống open redirect). */
export function safeNext(value: string | null | undefined, fallback = "/tai-khoan"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
