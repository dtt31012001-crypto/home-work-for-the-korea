/** Chỉ cho phép chuyển hướng nội bộ (chống open redirect). */
export function safeNext(value: string | null | undefined, fallback = "/vao"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
