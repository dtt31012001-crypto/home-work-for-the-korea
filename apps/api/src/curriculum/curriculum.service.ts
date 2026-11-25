import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  type CreateEditionInput,
  type CreateLevelInput,
  type CurriculumTree,
  type EditionDetail,
  type GrantedEdition,
  type LessonInput,
  type UpdateEditionInput,
  type UpdateLessonInput,
  type UpdateLevelInput,
  type UpdateSeriesInput,
  parseLessonLines,
} from "@th/contracts";
import { AppException, notFound } from "../common/app-exception";
import { AuditService } from "../audit/audit.service";
import type { Actor } from "../auth/access.service";
import { PrismaService } from "../prisma/prisma.service";
import { TenantDb } from "../prisma/tenant-db.service";

const conflict = (code: string, message: string) => new AppException(HttpStatus.CONFLICT, code, message);
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(`${v}T00:00:00Z`));

/**
 * Quản lý giáo trình (D-B03): mã chương trình là dữ liệu; nhập dần danh sách bài theo phiên bản.
 * Hệ thống KHÔNG tự tạo nội dung giáo trình.
 */
@Injectable()
export class CurriculumService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly db: TenantDb,
    private readonly audit: AuditService,
  ) {}

  async tree(): Promise<CurriculumTree> {
    const series = await this.prisma.curriculumSeries.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        levels: {
          orderBy: { sortOrder: "asc" },
          include: { editions: { orderBy: { createdAt: "asc" }, include: { _count: { select: { lessons: { where: { status: "ACTIVE" } } } } } } },
        },
      },
    });
    return {
      series: series.map((s) => ({
        id: s.id,
        code: s.code,
        nameVi: s.nameVi,
        nameKo: s.nameKo,
        status: s.status,
        levels: s.levels.map((l) => ({
          id: l.id,
          code: l.code,
          nameVi: l.nameVi,
          nameKo: l.nameKo,
          structure: l.structure,
          status: l.status,
          editions: l.editions.map((e) => ({ id: e.id, name: e.name, status: e.status, licenseStatus: e.licenseStatus, lessonCount: e._count.lessons })),
        })),
      })),
    };
  }

  async updateSeries(actorId: string, id: string, input: UpdateSeriesInput) {
    if (!(await this.prisma.curriculumSeries.findUnique({ where: { id } }))) throw notFound();
    await this.prisma.$transaction(async (tx) => {
      await tx.curriculumSeries.update({ where: { id }, data: input });
      await this.audit.record({ action: "curriculum.series_updated", resourceType: "curriculum_series", resourceId: id, actorUserId: actorId, data: input }, tx);
    });
  }

  async createLevel(actorId: string, input: CreateLevelInput) {
    if (!(await this.prisma.curriculumSeries.findUnique({ where: { id: input.seriesId } }))) throw notFound();
    const max = await this.prisma.curriculumLevel.aggregate({ where: { seriesId: input.seriesId }, _max: { sortOrder: true } });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const level = await tx.curriculumLevel.create({ data: { ...input, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
        await this.audit.record({ action: "curriculum.level_created", resourceType: "curriculum_level", resourceId: level.id, actorUserId: actorId, data: { code: level.code } }, tx);
        return level;
      });
    } catch (e) {
      if (isUnique(e)) throw conflict("LEVEL_CODE_TAKEN", "Mã chương trình đã tồn tại.");
      throw e;
    }
  }

  async updateLevel(actorId: string, id: string, input: UpdateLevelInput) {
    if (!(await this.prisma.curriculumLevel.findUnique({ where: { id } }))) throw notFound();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.curriculumLevel.update({ where: { id }, data: input });
        await this.audit.record({ action: "curriculum.level_updated", resourceType: "curriculum_level", resourceId: id, actorUserId: actorId, data: input }, tx);
      });
    } catch (e) {
      if (isUnique(e)) throw conflict("LEVEL_CODE_TAKEN", "Mã chương trình đã tồn tại.");
      throw e;
    }
  }

  async createEdition(actorId: string, input: CreateEditionInput) {
    if (!(await this.prisma.curriculumLevel.findUnique({ where: { id: input.levelId } }))) throw notFound();
    const { licenseValidUntil, ...rest } = input;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const e = await tx.curriculumEdition.create({ data: { ...rest, licenseValidUntil: toDate(licenseValidUntil), createdById: actorId } });
        await this.audit.record(
          { action: "curriculum.edition_created", resourceType: "curriculum_edition", resourceId: e.id, actorUserId: actorId, data: { name: e.name, licenseStatus: e.licenseStatus } },
          tx,
        );
        return { id: e.id };
      });
    } catch (e) {
      if (isUnique(e)) throw conflict("EDITION_NAME_TAKEN", "Cấp độ này đã có phiên bản cùng tên.");
      throw e;
    }
  }

  async edition(id: string): Promise<EditionDetail> {
    const e = await this.prisma.curriculumEdition.findUnique({
      where: { id },
      include: { level: { include: { series: true } }, lessons: { orderBy: { number: "asc" } } },
    });
    if (!e) throw notFound();
    return {
      id: e.id,
      name: e.name,
      publishYear: e.publishYear,
      publisher: e.publisher,
      rightsHolder: e.rightsHolder,
      licenseStatus: e.licenseStatus,
      allowedChannels: e.allowedChannels,
      licenseValidUntil: e.licenseValidUntil ? e.licenseValidUntil.toISOString().slice(0, 10) : null,
      licenseNote: e.licenseNote,
      status: e.status,
      level: { id: e.level.id, code: e.level.code, nameVi: e.level.nameVi, series: { code: e.level.series.code, nameVi: e.level.series.nameVi } },
      lessons: e.lessons.map((l) => ({ id: l.id, number: l.number, titleVi: l.titleVi, titleKo: l.titleKo, status: l.status })),
    };
  }

  async updateEdition(actorId: string, id: string, input: UpdateEditionInput) {
    const current = await this.prisma.curriculumEdition.findUnique({ where: { id }, include: { _count: { select: { lessons: { where: { status: "ACTIVE" } } } } } });
    if (!current) throw notFound();
    if (input.status === "ACTIVE" && current._count.lessons === 0) {
      throw new AppException(HttpStatus.BAD_REQUEST, "EDITION_HAS_NO_LESSONS", "Cần nhập ít nhất một bài trước khi đưa phiên bản vào sử dụng.");
    }
    const { licenseValidUntil, ...rest } = input;
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.curriculumEdition.update({ where: { id }, data: { ...rest, licenseValidUntil: toDate(licenseValidUntil) } });
        await this.audit.record({ action: "curriculum.edition_updated", resourceType: "curriculum_edition", resourceId: id, actorUserId: actorId, data: input }, tx);
      });
    } catch (e) {
      if (isUnique(e)) throw conflict("EDITION_NAME_TAKEN", "Cấp độ này đã có phiên bản cùng tên.");
      throw e;
    }
  }

  async addLesson(actorId: string, editionId: string, input: LessonInput) {
    if (!(await this.prisma.curriculumEdition.findUnique({ where: { id: editionId } }))) throw notFound();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const l = await tx.lesson.create({ data: { editionId, ...input } });
        await this.audit.record({ action: "curriculum.lesson_added", resourceType: "lesson", resourceId: l.id, actorUserId: actorId, data: { editionId, number: l.number } }, tx);
        return { id: l.id };
      });
    } catch (e) {
      if (isUnique(e)) throw conflict("LESSON_NUMBER_TAKEN", `Bài số ${input.number} đã có trong phiên bản này.`);
      throw e;
    }
  }

  /** Nhập nhiều bài: kiểm tra toàn bộ trước, có lỗi thì không ghi gì (tất cả hoặc không). */
  async addLessonsBulk(actorId: string, editionId: string, text: string) {
    if (!(await this.prisma.curriculumEdition.findUnique({ where: { id: editionId } }))) throw notFound();
    const parsed = parseLessonLines(text);
    if (parsed.length === 0) throw new AppException(HttpStatus.BAD_REQUEST, "NOTHING_TO_IMPORT", "Chưa có dòng nào để nhập.");
    const existing = new Set((await this.prisma.lesson.findMany({ where: { editionId }, select: { number: true } })).map((l) => l.number));
    const seen = new Set<number>();
    const errors = parsed.flatMap((p) => {
      if (p.error) return [{ line: p.line, message: p.error }];
      const n = p.value!.number;
      if (existing.has(n)) return [{ line: p.line, message: `Bài số ${n} đã có` }];
      if (seen.has(n)) return [{ line: p.line, message: `Bài số ${n} bị lặp trong danh sách` }];
      seen.add(n);
      return [];
    });
    if (errors.length) throw new AppException(HttpStatus.BAD_REQUEST, "IMPORT_INVALID", "Danh sách có dòng chưa hợp lệ. Chưa có bài nào được thêm.", errors);
    await this.prisma.$transaction(async (tx) => {
      await tx.lesson.createMany({ data: parsed.map((p) => ({ editionId, ...p.value! })) });
      await this.audit.record({ action: "curriculum.lessons_imported", resourceType: "curriculum_edition", resourceId: editionId, actorUserId: actorId, data: { count: parsed.length } }, tx);
    });
    return { created: parsed.length };
  }

  async updateLesson(actorId: string, lessonId: string, input: UpdateLessonInput) {
    if (!(await this.prisma.lesson.findUnique({ where: { id: lessonId } }))) throw notFound();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.lesson.update({ where: { id: lessonId }, data: input });
        await this.audit.record({ action: "curriculum.lesson_updated", resourceType: "lesson", resourceId: lessonId, actorUserId: actorId, data: input }, tx);
      });
    } catch (e) {
      if (isUnique(e)) throw conflict("LESSON_NUMBER_TAKEN", "Số bài đã tồn tại trong phiên bản này.");
      throw e;
    }
  }

  // ----- Cấp giáo trình cho trung tâm -----

  async granted(actor: Actor, organizationId: string): Promise<GrantedEdition[]> {
    const grants = await this.db.run(actor.dbScope(), (tx) =>
      tx.organizationCurriculum.findMany({ where: { organizationId, revokedAt: null }, orderBy: { grantedAt: "asc" } }),
    );
    const editions = await this.prisma.curriculumEdition.findMany({
      where: { id: { in: grants.map((g) => g.editionId) } },
      include: { level: { include: { series: true } }, _count: { select: { lessons: { where: { status: "ACTIVE" } } } } },
    });
    return grants
      .map((g) => {
        const e = editions.find((x) => x.id === g.editionId)!;
        return {
          grantId: g.id,
          edition: { id: e.id, name: e.name, status: e.status, licenseStatus: e.licenseStatus, lessonCount: e._count.lessons },
          level: { code: e.level.code, nameVi: e.level.nameVi },
          series: { code: e.level.series.code, nameVi: e.level.series.nameVi },
        };
      })
      .sort((a, b) => a.level.code.localeCompare(b.level.code));
  }

  async grant(actor: Actor, organizationId: string, editionId: string) {
    if (!(await this.prisma.organization.findUnique({ where: { id: organizationId } }))) throw notFound();
    if (!(await this.prisma.curriculumEdition.findUnique({ where: { id: editionId } }))) throw notFound();
    try {
      return await this.db.run(actor.dbScope(), async (tx) => {
        const g = await tx.organizationCurriculum.create({ data: { organizationId, editionId, grantedById: actor.userId } });
        await this.audit.record(
          { action: "curriculum.granted", resourceType: "organization_curriculum", resourceId: g.id, actorUserId: actor.userId, organizationId, data: { editionId } },
          tx,
        );
        return { id: g.id };
      });
    } catch (e) {
      if (isUnique(e)) throw conflict("ALREADY_GRANTED", "Trung tâm đã được cấp phiên bản này.");
      throw e;
    }
  }

  /** Thu hồi: không tạo lớp mới với phiên bản này; lớp đang học không bị gián đoạn. */
  async revokeGrant(actor: Actor, organizationId: string, grantId: string) {
    await this.db.run(actor.dbScope(), async (tx) => {
      const { count } = await tx.organizationCurriculum.updateMany({ where: { id: grantId, organizationId, revokedAt: null }, data: { revokedAt: new Date() } });
      if (count === 0) throw notFound();
      await this.audit.record({ action: "curriculum.grant_revoked", resourceType: "organization_curriculum", resourceId: grantId, actorUserId: actor.userId, organizationId }, tx);
    });
  }

  /** Danh sách bài của phiên bản trung tâm được cấp (cho form tạo lớp, giáo viên chọn bài đã dạy). */
  async grantedLessons(actor: Actor, organizationId: string, editionId: string) {
    const granted = await this.db.run(actor.dbScope(), (tx) => tx.organizationCurriculum.count({ where: { organizationId, editionId, revokedAt: null } }));
    if (!granted) throw notFound();
    return this.prisma.lesson.findMany({ where: { editionId, status: "ACTIVE" }, orderBy: { number: "asc" }, select: { id: true, number: true, titleVi: true, titleKo: true } });
  }
}
