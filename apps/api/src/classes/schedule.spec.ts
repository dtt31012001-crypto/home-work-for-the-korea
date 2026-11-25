import { addDays, generateSlots, isoWeekday, localDateOf, plannedLessonFor, scheduleSummary, zonedToUtc } from "./schedule";

describe("Tính lịch học", () => {
  it("đổi giờ địa phương sang UTC theo múi giờ cơ sở", () => {
    expect(zonedToUtc("2026-12-07", "18:00", "Asia/Ho_Chi_Minh").toISOString()).toBe("2026-12-07T11:00:00.000Z");
    expect(zonedToUtc("2026-12-07", "18:00", "Asia/Seoul").toISOString()).toBe("2026-12-07T09:00:00.000Z");
    // Múi giờ có giờ mùa hè vẫn đúng
    expect(zonedToUtc("2026-07-01", "09:00", "Europe/Berlin").toISOString()).toBe("2026-07-01T07:00:00.000Z");
    expect(zonedToUtc("2026-01-15", "09:00", "Europe/Berlin").toISOString()).toBe("2026-01-15T08:00:00.000Z");
    expect(localDateOf(new Date("2026-12-07T18:30:00Z"), "Asia/Ho_Chi_Minh")).toBe("2026-12-08");
  });

  it("thứ trong tuần và cộng ngày", () => {
    expect(isoWeekday("2026-11-30")).toBe(1); // Thứ 2
    expect(isoWeekday("2026-12-06")).toBe(7); // Chủ nhật
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("sinh đúng 24 buổi T2-T4-T6 từ ngày khai giảng", () => {
    const rules = [
      { weekday: 1, startTime: "18:00", endTime: "19:30" },
      { weekday: 3, startTime: "18:00", endTime: "19:30" },
      { weekday: 5, startTime: "18:00", endTime: "19:30" },
    ];
    const slots = generateSlots("2026-12-02", rules, Array.from({ length: 24 }, (_, i) => i + 1), "Asia/Ho_Chi_Minh");
    expect(slots).toHaveLength(24);
    expect(slots[0]).toMatchObject({ number: 1, localDate: "2026-12-02" }); // khai giảng thứ 4
    expect(slots[1]!.localDate).toBe("2026-12-04");
    expect(slots[2]!.localDate).toBe("2026-12-07");
    expect(slots[23]!.localDate).toBe("2027-01-25");
    expect(slots.every((s) => [1, 3, 5].includes(isoWeekday(s.localDate)))).toBe(true);
    expect(slots[0]!.endsAt.getTime() - slots[0]!.startsAt.getTime()).toBe(90 * 60000);
  });

  it("hai buổi trong cùng một ngày được sắp theo giờ", () => {
    const slots = generateSlots(
      "2026-12-05",
      [
        { weekday: 6, startTime: "14:00", endTime: "15:30" },
        { weekday: 6, startTime: "08:00", endTime: "09:30" },
      ],
      [1, 2, 3],
      "Asia/Ho_Chi_Minh",
    );
    expect(slots.map((s) => `${s.localDate} ${s.startsAt.toISOString().slice(11, 16)}`)).toEqual(["2026-12-05 01:00", "2026-12-05 07:00", "2026-12-12 01:00"]);
  });

  it("bài dự kiến theo bài bắt đầu và số buổi mỗi bài", () => {
    const lessons = [1, 2, 3, 4].map((n) => ({ number: n }));
    expect(plannedLessonFor(1, lessons, 1, 2)?.number).toBe(1);
    expect(plannedLessonFor(2, lessons, 1, 2)?.number).toBe(1);
    expect(plannedLessonFor(3, lessons, 1, 2)?.number).toBe(2);
    expect(plannedLessonFor(1, lessons, 3, 1)?.number).toBe(3);
    expect(plannedLessonFor(3, lessons, 3, 1)).toBeNull();
  });

  it("tóm tắt lịch", () => {
    expect(
      scheduleSummary([
        { weekday: 3, startTime: "18:00", endTime: "19:30" },
        { weekday: 1, startTime: "18:00", endTime: "19:30" },
        { weekday: 6, startTime: "09:00", endTime: "11:00" },
      ]),
    ).toBe("T2, T4 · 18:00–19:30; T7 · 09:00–11:00");
  });
});
