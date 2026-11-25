import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeIdentifier, normalizePhone, maskIdentifier } from "./identifier";
import { checkPassword } from "./password";

test("chuẩn hóa SĐT Việt Nam về E.164", () => {
  assert.equal(normalizePhone("0912 345 678"), "+84912345678");
  assert.equal(normalizePhone("+84 912.345.678"), "+84912345678");
  assert.equal(normalizePhone("84912345678"), "+84912345678");
  assert.equal(normalizePhone("0084912345678"), "+84912345678");
});

test("từ chối SĐT không hợp lệ", () => {
  assert.equal(normalizePhone("0212345678"), null);
  assert.equal(normalizePhone("12345"), null);
  assert.equal(normalizePhone("abc"), null);
});

test("chấp nhận SĐT quốc tế (vd. Hàn Quốc cho học viên KIIP)", () => {
  assert.equal(normalizePhone("+82 10-1234-5678"), "+821012345678");
});

test("email được chuyển chữ thường, SĐT/email phân biệt đúng loại", () => {
  assert.deepEqual(normalizeIdentifier(" An.Nguyen@Example.COM "), { type: "EMAIL", value: "an.nguyen@example.com" });
  assert.deepEqual(normalizeIdentifier("0912345678"), { type: "PHONE", value: "+84912345678" });
  assert.equal(normalizeIdentifier("not-an-email@"), null);
});

test("che định danh", () => {
  assert.equal(maskIdentifier({ type: "PHONE", value: "+84912345678" }), "+84•••••5678");
  assert.equal(maskIdentifier({ type: "EMAIL", value: "an@example.com" }), "a•••@example.com");
});

test("chính sách mật khẩu", () => {
  assert.equal(checkPassword("short"), "TOO_SHORT");
  assert.equal(checkPassword("12345678"), "TOO_COMMON");
  assert.equal(checkPassword("aaaaaaaaaa"), "TOO_COMMON");
  assert.equal(checkPassword("xin0912345678", "+84912345678"), "CONTAINS_PHONE");
  assert.equal(checkPassword("bien-xanh-mua-thu"), null);
});

import { parseLessonLines } from "./curriculum";

test("đọc danh sách bài nhập nhiều dòng", () => {
  const r = parseLessonLines("1 | Chào hỏi | 인사\n2\tGia đình\n\nx | Lỗi\n3 |");
  assert.deepEqual(r[0], { line: 1, value: { number: 1, titleVi: "Chào hỏi", titleKo: "인사" } });
  assert.deepEqual(r[1], { line: 2, value: { number: 2, titleVi: "Gia đình", titleKo: null } });
  assert.equal(r[2]!.error, "Số bài không hợp lệ");
  assert.equal(r[3]!.error, "Thiếu tên bài");
});

import { ageOn, isMinor } from "./people";

test("tính tuổi và chưa thành niên theo ngày", () => {
  assert.equal(ageOn("2008-11-26", "2026-11-25"), 17);
  assert.equal(ageOn("2008-11-25", "2026-11-25"), 18);
  assert.equal(isMinor("2010-01-01", "2026-11-25"), true);
  assert.equal(isMinor("2000-01-01", "2026-11-25"), false);
  assert.equal(isMinor(null, "2026-11-25"), false);
});
