import { z } from "zod";

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const LICENSE_STATUS_LABEL = {
  UNCONFIRMED: "Chưa xác nhận quyền",
  CONFIRMED: "Đã xác nhận quyền",
  OWN_CONTENT: "Nội dung tự biên soạn",
} as const;
export type LicenseStatus = keyof typeof LICENSE_STATUS_LABEL;

export const CHANNEL_LABEL = { CLASS_INTERNAL: "Dạy trong lớp tại trung tâm", B2C: "Học online (B2C)", MARKETPLACE: "Bán trên Marketplace" } as const;
export type Channel = keyof typeof CHANNEL_LABEL;

export const EDITION_STATUS_LABEL = { DRAFT: "Đang nhập", ACTIVE: "Đang dùng", ARCHIVED: "Ngừng dùng" } as const;
export type EditionStatus = keyof typeof EDITION_STATUS_LABEL;

export const updateSeriesSchema = z.object({
  nameVi: text(1, 200).optional(),
  nameKo: optionalText(200),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
});
export type UpdateSeriesInput = z.infer<typeof updateSeriesSchema>;

export const createLevelSchema = z.object({
  seriesId: z.string().uuid(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/, "Mã gồm chữ in hoa, số và dấu - (2–20 ký tự)"),
  nameVi: text(1, 200),
  nameKo: optionalText(200),
  structure: z.enum(["LANGUAGE", "SOCIETY"]).default("LANGUAGE"),
});
export type CreateLevelInput = z.infer<typeof createLevelSchema>;

export const updateLevelSchema = createLevelSchema.omit({ seriesId: true }).partial().extend({ status: z.enum(["ACTIVE", "ARCHIVED"]).optional() });
export type UpdateLevelInput = z.infer<typeof updateLevelSchema>;

export const editionSchema = z.object({
  name: text(1, 120),
  publishYear: z.number().int().min(1900).max(2100).nullable().optional(),
  publisher: optionalText(200),
  rightsHolder: optionalText(200),
  licenseStatus: z.enum(["UNCONFIRMED", "CONFIRMED", "OWN_CONTENT"]).default("UNCONFIRMED"),
  allowedChannels: z.array(z.enum(["CLASS_INTERNAL", "B2C", "MARKETPLACE"])).default([]),
  licenseValidUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  licenseNote: optionalText(2000),
});
export type EditionInput = z.infer<typeof editionSchema>;

export const createEditionSchema = editionSchema.extend({ levelId: z.string().uuid() });
export type CreateEditionInput = z.infer<typeof createEditionSchema>;

export const updateEditionSchema = editionSchema.partial().extend({ status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional() });
export type UpdateEditionInput = z.infer<typeof updateEditionSchema>;

export const lessonSchema = z.object({
  number: z.number().int().min(0).max(999),
  titleVi: text(1, 300),
  titleKo: optionalText(300),
});
export type LessonInput = z.infer<typeof lessonSchema>;

export const updateLessonSchema = lessonSchema.partial().extend({ status: z.enum(["ACTIVE", "ARCHIVED"]).optional() });
export type UpdateLessonInput = z.infer<typeof updateLessonSchema>;

/** Nhập nhiều bài một lần: mỗi dòng "số | tên tiếng Việt | tên tiếng Hàn (tùy chọn)". */
export const bulkLessonsSchema = z.object({ text: z.string().max(50_000) });

export interface ParsedLessonLine {
  line: number;
  value?: LessonInput;
  error?: string;
}

export function parseLessonLines(textValue: string): ParsedLessonLine[] {
  return textValue
    .split(/\r?\n/)
    .map((raw, i) => ({ raw: raw.trim(), line: i + 1 }))
    .filter((l) => l.raw.length > 0)
    .map(({ raw, line }) => {
      const parts = raw.split(/\s*[|\t]\s*/);
      const number = Number(parts[0]);
      if (!Number.isInteger(number) || number < 0 || number > 999) return { line, error: "Số bài không hợp lệ" };
      const titleVi = (parts[1] ?? "").trim();
      if (!titleVi) return { line, error: "Thiếu tên bài" };
      const titleKo = (parts[2] ?? "").trim() || null;
      return { line, value: { number, titleVi, titleKo } };
    });
}

export const grantSchema = z.object({ editionId: z.string().uuid() });

export interface CurriculumTree {
  series: {
    id: string;
    code: string;
    nameVi: string;
    nameKo: string | null;
    status: "ACTIVE" | "ARCHIVED";
    levels: {
      id: string;
      code: string;
      nameVi: string;
      nameKo: string | null;
      structure: "LANGUAGE" | "SOCIETY";
      status: "ACTIVE" | "ARCHIVED";
      editions: { id: string; name: string; status: EditionStatus; licenseStatus: LicenseStatus; lessonCount: number }[];
    }[];
  }[];
}

export interface EditionDetail {
  id: string;
  name: string;
  publishYear: number | null;
  publisher: string | null;
  rightsHolder: string | null;
  licenseStatus: LicenseStatus;
  allowedChannels: Channel[];
  licenseValidUntil: string | null;
  licenseNote: string | null;
  status: EditionStatus;
  level: { id: string; code: string; nameVi: string; series: { code: string; nameVi: string } };
  lessons: { id: string; number: number; titleVi: string; titleKo: string | null; status: "ACTIVE" | "ARCHIVED" }[];
}

/** Giáo trình trung tâm được dùng (cho form tạo lớp). */
export interface GrantedEdition {
  grantId: string;
  edition: { id: string; name: string; status: EditionStatus; licenseStatus: LicenseStatus; lessonCount: number };
  level: { code: string; nameVi: string };
  series: { code: string; nameVi: string };
}
