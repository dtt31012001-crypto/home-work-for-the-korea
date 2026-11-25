import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
import type { Request, Response } from "express";

/** Định dạng lỗi thống nhất { error: { code, message } }; không lộ stack trace. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("HttpExceptionFilter");

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<Request & { requestId?: string }>();

    if (exception instanceof ThrottlerException) {
      res.status(HttpStatus.TOO_MANY_REQUESTS).json({
        error: { code: "TOO_MANY_REQUESTS", message: "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút." },
      });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "object" && body !== null && "error" in body) {
        res.status(status).json(body);
        return;
      }
      const code = status === 404 ? "NOT_FOUND" : status === 401 ? "UNAUTHENTICATED" : status === 403 ? "FORBIDDEN" : "HTTP_ERROR";
      const message = status === 404 ? "Không tìm thấy." : status === 401 ? "Vui lòng đăng nhập." : "Yêu cầu không hợp lệ.";
      res.status(status).json({ error: { code, message } });
      return;
    }
    this.logger.error({ requestId: req.requestId, err: exception });
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: { code: "INTERNAL_ERROR", message: "Đã có lỗi xảy ra. Vui lòng thử lại." },
    });
  }
}
