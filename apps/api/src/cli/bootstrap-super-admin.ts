/**
 * Tạo tài khoản Quản trị nền tảng đầu tiên (chạy một lần trên server).
 *
 *   pnpm --filter @th/api bootstrap:super-admin --name "Tên" --email admin@example.com
 *   pnpm --filter @th/api bootstrap:super-admin --name "Tên" --phone 0912345678
 *   Thêm --reset-password để cấp lại mật khẩu tạm cho tài khoản đã có.
 *
 * Mật khẩu tạm chỉ in ra một lần trên terminal, bắt buộc đổi ở lần đăng nhập đầu.
 */
import { PrismaClient } from "@prisma/client";
import { normalizeEmail, normalizePhone } from "@th/contracts";
import { parseArgs } from "node:util";
import { AUTH_POLICY } from "../config";
import { PasswordService } from "../auth/password.service";

async function main() {
  const { values } = parseArgs({
    options: {
      name: { type: "string" },
      email: { type: "string" },
      phone: { type: "string" },
      "reset-password": { type: "boolean", default: false },
    },
  });
  const email = values.email ? normalizeEmail(values.email) : null;
  const phone = values.phone ? normalizePhone(values.phone) : null;
  if ((values.email && !email) || (values.phone && !phone) || (!email && !phone)) {
    throw new Error("Cần --email hoặc --phone hợp lệ.");
  }
  const prisma = new PrismaClient();
  const passwords = new PasswordService();
  try {
    const identifier = email ? { type: "EMAIL" as const, value: email } : { type: "PHONE" as const, value: phone! };
    const existing = await prisma.userIdentity.findUnique({ where: { type_value: identifier } });
    const temp = passwords.generateTemporary();
    const hash = await passwords.hash(temp);
    const tempExpiresAt = new Date(Date.now() + AUTH_POLICY.temporaryPasswordTtlDays * 86_400_000);

    if (!existing) {
      if (!values.name) throw new Error("Tài khoản mới cần --name.");
      const user = await prisma.user.create({
        data: {
          displayName: values.name,
          identities: { create: [identifier] },
          credential: { create: { hash, mustChange: true, tempExpiresAt } },
          roleAssignments: { create: { role: "SUPER_ADMIN" } },
        },
      });
      await prisma.auditLog.create({ data: { action: "bootstrap.super_admin_created", resourceType: "user", resourceId: user.id } });
      print(temp, tempExpiresAt);
      return;
    }

    const has = await prisma.roleAssignment.count({ where: { userId: existing.userId, role: "SUPER_ADMIN", revokedAt: null } });
    if (!has) {
      await prisma.roleAssignment.create({ data: { userId: existing.userId, role: "SUPER_ADMIN" } });
      await prisma.auditLog.create({ data: { action: "bootstrap.super_admin_granted", resourceType: "user", resourceId: existing.userId } });
      console.log("Đã gắn vai trò Quản trị nền tảng cho tài khoản sẵn có.");
    }
    if (values["reset-password"]) {
      await prisma.$transaction([
        prisma.passwordCredential.upsert({
          where: { userId: existing.userId },
          create: { userId: existing.userId, hash, mustChange: true, tempExpiresAt },
          update: { hash, mustChange: true, tempExpiresAt, changedAt: new Date() },
        }),
        prisma.user.update({ where: { id: existing.userId }, data: { tokenVersion: { increment: 1 } } }),
        prisma.session.updateMany({ where: { userId: existing.userId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: "PASSWORD_RESET" } }),
        prisma.auditLog.create({ data: { action: "bootstrap.super_admin_password_reset", resourceType: "user", resourceId: existing.userId } }),
      ]);
      print(temp, tempExpiresAt);
    } else if (has) {
      console.log("Tài khoản đã là Quản trị nền tảng. Dùng --reset-password nếu cần cấp lại mật khẩu tạm.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

function print(temp: string, expires: Date) {
  console.log("\nMật khẩu tạm (chỉ hiển thị một lần):", temp);
  console.log("Hết hạn lúc:", expires.toISOString(), "– bắt buộc đổi ở lần đăng nhập đầu.\n");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
