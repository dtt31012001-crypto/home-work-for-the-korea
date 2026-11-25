export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

const COMMON = new Set([
  "12345678", "123456789", "1234567890", "87654321", "11111111", "00000000",
  "password", "password1", "matkhau", "matkhau1", "abc12345", "abcd1234",
  "qwerty123", "qwertyuiop", "iloveyou", "11223344", "88888888", "66666666",
  "anhyeuem", "123123123", "admin123", "hanquoc1", "korea123",
]);

export type PasswordProblem = "TOO_SHORT" | "TOO_LONG" | "TOO_COMMON" | "CONTAINS_PHONE";

/** Kiểm tra mật khẩu mới. Không áp quy tắc ký tự phức tạp (theo khuyến nghị NIST), chỉ chặn mật khẩu yếu phổ biến. */
export function checkPassword(password: string, phoneE164?: string | null): PasswordProblem | null {
  if (password.length < PASSWORD_MIN_LENGTH) return "TOO_SHORT";
  if (password.length > PASSWORD_MAX_LENGTH) return "TOO_LONG";
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) return "TOO_COMMON";
  if (phoneE164) {
    const local = "0" + phoneE164.slice(3);
    if (phoneE164.startsWith("+84") && password.includes(local)) return "CONTAINS_PHONE";
    if (password.includes(phoneE164.slice(1))) return "CONTAINS_PHONE";
  }
  return null;
}

export const PASSWORD_PROBLEM_MESSAGE: Record<PasswordProblem, string> = {
  TOO_SHORT: `Mật khẩu cần ít nhất ${PASSWORD_MIN_LENGTH} ký tự.`,
  TOO_LONG: `Mật khẩu tối đa ${PASSWORD_MAX_LENGTH} ký tự.`,
  TOO_COMMON: "Mật khẩu quá dễ đoán. Hãy chọn mật khẩu khác.",
  CONTAINS_PHONE: "Mật khẩu không được chứa số điện thoại.",
};
