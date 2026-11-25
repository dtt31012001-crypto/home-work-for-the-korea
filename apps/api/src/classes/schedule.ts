/**
 * Tính lịch học thuần (không truy cập DB) – dễ kiểm thử.
 * Giờ học nhập theo giờ địa phương của cơ sở; lưu UTC.
 */

export interface WeeklyRule {
  weekday: number; // ISO 1 = Thứ 2 … 7 = Chủ nhật
  startTime: string; // HH:MM
  endTime: string;
}

export interface GeneratedSlot {
  number: number;
  localDate: string; // YYYY-MM-DD
  startsAt: Date;
  endsAt: Date;
}

/** Chênh lệch (phút) giữa giờ địa phương của múi giờ và UTC tại một thời điểm. */
export function tzOffsetMinutes(at: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** Ngày + giờ địa phương → thời điểm UTC (xử lý cả múi giờ có giờ mùa hè). */
export function zonedToUtc(localDate: string, time: string, timeZone: string): Date {
  const [y, m, d] = localDate.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let result = guess - tzOffsetMinutes(new Date(guess), timeZone) * 60000;
  const second = guess - tzOffsetMinutes(new Date(result), timeZone) * 60000;
  if (second !== result) result = second;
  return new Date(result);
}

/** Ngày địa phương (YYYY-MM-DD) của một thời điểm. */
export function localDateOf(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function localTimeOf(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
}

export function addDays(localDate: string, days: number): string {
  const [y, m, d] = localDate.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Thứ ISO (1 = Thứ 2 … 7 = Chủ nhật) của một ngày. */
export function isoWeekday(localDate: string): number {
  const [y, m, d] = localDate.split("-").map(Number) as [number, number, number];
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

/**
 * Sinh các buổi theo lịch cố định, bắt đầu từ `fromDate`, cho tới khi đủ `numbers`.
 * `numbers` là danh sách số thứ tự buổi cần sinh (cho phép sinh lại phần còn lại khi đổi lịch).
 */
export function generateSlots(fromDate: string, rules: WeeklyRule[], numbers: number[], timeZone: string): GeneratedSlot[] {
  if (rules.length === 0 || numbers.length === 0) return [];
  const sorted = [...rules].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
  const out: GeneratedSlot[] = [];
  let date = fromDate;
  for (let guard = 0; out.length < numbers.length && guard < 366 * 5; guard++) {
    const wd = isoWeekday(date);
    for (const r of sorted.filter((x) => x.weekday === wd)) {
      if (out.length >= numbers.length) break;
      out.push({ number: numbers[out.length]!, localDate: date, startsAt: zonedToUtc(date, r.startTime, timeZone), endsAt: zonedToUtc(date, r.endTime, timeZone) });
    }
    date = addDays(date, 1);
  }
  return out;
}

/** Bài dự kiến của buổi chính khóa thứ `number` (1-based), hoặc null nếu vượt quá số bài. */
export function plannedLessonFor<T extends { number: number }>(number: number, lessons: T[], startLessonNumber: number, sessionsPerLesson: number): T | null {
  const startIdx = lessons.findIndex((l) => l.number === startLessonNumber);
  if (startIdx < 0) return null;
  return lessons[startIdx + Math.floor((number - 1) / sessionsPerLesson)] ?? null;
}

export const WEEKDAY_LABEL: Record<number, string> = { 1: "T2", 2: "T3", 3: "T4", 4: "T5", 5: "T6", 6: "T7", 7: "CN" };

export function scheduleSummary(rules: WeeklyRule[]): string {
  const byTime = new Map<string, number[]>();
  for (const r of rules) {
    const k = `${r.startTime}–${r.endTime}`;
    byTime.set(k, [...(byTime.get(k) ?? []), r.weekday]);
  }
  return [...byTime.entries()].map(([t, days]) => `${days.sort().map((d) => WEEKDAY_LABEL[d]).join(", ")} · ${t}`).join("; ");
}
