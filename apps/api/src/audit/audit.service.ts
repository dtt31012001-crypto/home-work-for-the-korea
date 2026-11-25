import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface AuditEntry {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  actorUserId?: string | null;
  organizationId?: string | null;
  data?: Prisma.InputJsonValue;
  ip?: string | null;
  requestId?: string | null;
}

type Tx = Prisma.TransactionClient | PrismaService;

/** Ghi nhật ký hệ thống (bảng chỉ-thêm). Không ghi mật khẩu, token hay SĐT/email đầy đủ. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, tx: Tx = this.prisma) {
    await tx.auditLog.create({
      data: {
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        actorUserId: entry.actorUserId ?? null,
        organizationId: entry.organizationId ?? null,
        data: entry.data,
        ip: entry.ip ?? null,
        requestId: entry.requestId ?? null,
      },
    });
  }
}
