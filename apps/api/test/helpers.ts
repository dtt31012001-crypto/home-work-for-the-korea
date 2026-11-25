import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient, Role } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap-app";
import { PasswordService } from "../src/auth/password.service";

import { TEST_OWNER_URL } from "./env";

/** Client role CHỦ: chỉ để tạo/xóa dữ liệu thử (bỏ qua RLS). Ứng dụng dùng role th_app. */
export const prisma = new PrismaClient({ datasources: { db: { url: TEST_OWNER_URL } } });
const passwords = new PasswordService();

export async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(moduleRef.createNestApplication());
  await app.init();
  return app;
}

export async function resetDb() {
  // TRUNCATE không kích hoạt trigger chặn UPDATE/DELETE của audit_log
  await prisma.$executeRawUnsafe(
    'TRUNCATE "audit_log", "session", "role_assignment", "password_credential", "user_identity", "app_user", "organization" CASCADE',
  );
}

let ipCounter = 1;

/** Trình duyệt giả lập: giữ cookie, tự gửi CSRF, mỗi client có IP riêng (tránh dính giới hạn tần suất giữa các test). */
export class Client {
  readonly agent: ReturnType<typeof request.agent>;
  readonly ip = `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;
  private csrf?: string;

  constructor(app: INestApplication) {
    this.agent = request.agent(app.getHttpServer());
  }

  private async token() {
    if (!this.csrf) {
      const res = await this.agent.get("/api/auth/csrf").set("x-forwarded-for", this.ip);
      this.csrf = res.body.csrfToken;
    }
    return this.csrf!;
  }

  get(path: string) {
    return this.agent.get(path).set("x-forwarded-for", this.ip);
  }

  async post(path: string, body?: object) {
    const t = await this.token();
    return this.agent.post(path).set("x-forwarded-for", this.ip).set("x-csrf-token", t).send(body ?? {});
  }

  login(identifier: string, password: string) {
    return this.post("/api/auth/login", { identifier, password });
  }
}

export interface SeedUser {
  name?: string;
  phone?: string;
  email?: string;
  password?: string;
  mustChange?: boolean;
  tempExpiresAt?: Date | null;
  roles?: { role: Role; organizationId?: string | null }[];
}

export const DEFAULT_PASSWORD = "song-han-mua-thu-2026";

export async function seedUser(u: SeedUser) {
  return prisma.user.create({
    data: {
      displayName: u.name ?? "Người dùng thử",
      identities: {
        create: [
          ...(u.phone ? [{ type: "PHONE" as const, value: u.phone }] : []),
          ...(u.email ? [{ type: "EMAIL" as const, value: u.email }] : []),
        ],
      },
      credential: {
        create: {
          hash: await passwords.hash(u.password ?? DEFAULT_PASSWORD),
          mustChange: u.mustChange ?? false,
          tempExpiresAt: u.tempExpiresAt ?? null,
        },
      },
      roleAssignments: { create: (u.roles ?? []).map((r) => ({ role: r.role, organizationId: r.organizationId ?? null })) },
    },
  });
}

export function seedOrg(code: string, name = `Trung tâm ${code}`) {
  return prisma.organization.create({ data: { code, name } });
}

/** Tạo tài khoản và đăng nhập sẵn. */
export async function loggedIn(app: INestApplication, u: SeedUser & { phone: string }) {
  const user = await seedUser(u);
  const client = new Client(app);
  const res = await client.login(u.phone, u.password ?? DEFAULT_PASSWORD);
  if (res.status !== 200) throw new Error(`login failed ${res.status} ${JSON.stringify(res.body)}`);
  return { user, client };
}
