import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { HttpExceptionFilter } from "./common/http-exception.filter";
import { requestIdMiddleware } from "./common/request-context";

/** Cấu hình dùng chung cho server thật và test tích hợp. */
export function configureApp(app: INestApplication): INestApplication {
  const express = app as NestExpressApplication;
  express.set("trust proxy", 1); // chạy sau reverse proxy / Next.js rewrite
  express.disable("x-powered-by");
  app.setGlobalPrefix("api");
  app.use(requestIdMiddleware);
  app.use(cookieParser());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
  return app;
}
