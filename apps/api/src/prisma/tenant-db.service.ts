import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "./prisma.service";

export type Tx = Prisma.TransactionClient;

/** Phạm vi dữ liệu trung tâm của một request: tất cả (Super Admin) hoặc danh sách trung tâm. */
export type DbScope = { all: true } | { all: false; organizationIds: string[] };

/**
 * Mọi truy vấn bảng dữ liệu trung tâm phải chạy qua đây. Hàm đặt biến phiên trong
 * cùng transaction để PostgreSQL Row-Level Security lọc hàng – lớp bảo vệ thứ hai
 * ngoài kiểm tra quyền ở tầng ứng dụng.
 */
@Injectable()
export class TenantDb {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(scope: DbScope, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        if (scope.all) {
          await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
        } else {
          await tx.$executeRaw`SELECT set_config('app.org_ids', ${scope.organizationIds.join(",")}, true)`;
        }
        return fn(tx);
      },
      { timeout: 15_000 },
    );
  }

  /** Tác vụ hệ thống (không gắn người dùng), vd. sinh buổi học. Dùng hạn chế, có lý do rõ ràng. */
  system<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.run({ all: true }, fn);
  }
}
