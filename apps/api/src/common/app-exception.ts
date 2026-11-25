import { HttpException, HttpStatus } from "@nestjs/common";

/** Lỗi nghiệp vụ có mã ổn định cho frontend + thông điệp tiếng Việt ngắn. */
export class AppException extends HttpException {
  constructor(status: HttpStatus, readonly code: string, message: string, readonly details?: unknown) {
    super({ error: { code, message, details } }, status);
  }
}

export const notFound = () => new AppException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Không tìm thấy.");
export const forbidden = (message = "Bạn không có quyền thực hiện thao tác này.") =>
  new AppException(HttpStatus.FORBIDDEN, "FORBIDDEN", message);
