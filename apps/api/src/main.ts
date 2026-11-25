import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureApp } from "./bootstrap-app";
import { config } from "./config";

async function main() {
  // Dev: nạp apps/api/.env nếu có. Production: biến môi trường do máy chủ cung cấp.
  try {
    process.loadEnvFile?.();
  } catch {
    /* không có file .env */
  }
  const cfg = config();
  const app = configureApp(await NestFactory.create(AppModule, { bodyParser: true }));
  await app.listen(cfg.API_PORT);
  Logger.log(`API đang chạy tại cổng ${cfg.API_PORT}`, "Bootstrap");
}

void main();
