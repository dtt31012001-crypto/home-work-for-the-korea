import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { HttpExceptionFilter } from "./common/http-exception.filter";
import { requestIdMiddleware } from "./common/request-context";

/** Cấu hình dùng chung cho server thật và test tích hợp. */
export function configureApp(app: INestApplication): INestApplication {
  const express = app as NestExpressApplication;
  // Số proxy đứng trước API (reverse proxy / Next.js rewrite). Render: biên Render → Next.js → API = 2.
  const hops = Number(process.env.TRUST_PROXY ?? 1);
  express.set("trust proxy", Number.isInteger(hops) && hops >= 0 ? hops : 1);
  express.disable("x-powered-by");
  app.setGlobalPrefix("api");
  app.use(requestIdMiddleware);
  app.use(cookieParser());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
  return app;
}
