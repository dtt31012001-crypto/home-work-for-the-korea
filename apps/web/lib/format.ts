/** Định dạng ngày giờ tiếng Việt theo múi giờ của cơ sở. */
export function fmtDate(iso: string | Date, timeZone = "Asia/Ho_Chi_Minh", opts: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("vi-VN", { timeZone, day: "2-digit", month: "2-digit", year: "numeric", ...opts }).format(new Date(iso));
}

export function fmtTime(iso: string | Date, timeZone = "Asia/Ho_Chi_Minh") {
  return new Intl.DateTimeFormat("vi-VN", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export function fmtWeekday(iso: string | Date, timeZone = "Asia/Ho_Chi_Minh") {
  return new Intl.DateTimeFormat("vi-VN", { timeZone, weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(iso));
}

export function fmtMoney(vnd: number | null | undefined) {
  if (vnd == null) return "—";
  return new Intl.NumberFormat("vi-VN").format(vnd) + " ₫";
}

/** Ngày YYYY-MM-DD theo múi giờ (dùng cho so sánh "hôm nay"). */
export function localDay(d: Date | string, timeZone = "Asia/Ho_Chi_Minh") {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
}
