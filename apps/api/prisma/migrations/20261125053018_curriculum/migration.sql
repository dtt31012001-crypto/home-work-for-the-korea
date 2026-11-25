-- CreateEnum
CREATE TYPE "LevelStructure" AS ENUM ('LANGUAGE', 'SOCIETY');

-- CreateEnum
CREATE TYPE "EditionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('UNCONFIRMED', 'CONFIRMED', 'OWN_CONTENT');

-- CreateEnum
CREATE TYPE "DistributionChannel" AS ENUM ('CLASS_INTERNAL', 'B2C', 'MARKETPLACE');

-- CreateTable
CREATE TABLE "curriculum_series" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_vi" TEXT NOT NULL,
    "name_ko" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "curriculum_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_level" (
    "id" UUID NOT NULL,
    "series_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_vi" TEXT NOT NULL,
    "name_ko" TEXT,
    "structure" "LevelStructure" NOT NULL DEFAULT 'LANGUAGE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "curriculum_level_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_edition" (
    "id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "publish_year" INTEGER,
    "publisher" TEXT,
    "rights_holder" TEXT,
    "license_status" "LicenseStatus" NOT NULL DEFAULT 'UNCONFIRMED',
    "allowed_channels" "DistributionChannel"[] DEFAULT ARRAY[]::"DistributionChannel"[],
    "license_valid_until" DATE,
    "license_note" TEXT,
    "status" "EditionStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "curriculum_edition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson" (
    "id" UUID NOT NULL,
    "edition_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "title_vi" TEXT NOT NULL,
    "title_ko" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_curriculum" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "edition_id" UUID NOT NULL,
    "granted_by" UUID,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "organization_curriculum_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_series_code_key" ON "curriculum_series"("code");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_level_code_key" ON "curriculum_level"("code");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_edition_level_id_name_key" ON "curriculum_edition"("level_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_edition_id_number_key" ON "lesson"("edition_id", "number");

-- CreateIndex
CREATE INDEX "organization_curriculum_organization_id_idx" ON "organization_curriculum"("organization_id");

-- AddForeignKey
ALTER TABLE "curriculum_level" ADD CONSTRAINT "curriculum_level_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "curriculum_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_edition" ADD CONSTRAINT "curriculum_edition_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "curriculum_level"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "curriculum_edition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_curriculum" ADD CONSTRAINT "organization_curriculum_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_curriculum" ADD CONSTRAINT "organization_curriculum_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "curriculum_edition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Một phiên bản chỉ được cấp một lần (đang hiệu lực) cho mỗi trung tâm
CREATE UNIQUE INDEX "organization_curriculum_active_unique"
  ON "organization_curriculum" ("organization_id", "edition_id") WHERE "revoked_at" IS NULL;

ALTER TABLE "organization_curriculum" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "organization_curriculum"
  USING (app_org_visible("organization_id")) WITH CHECK (app_org_visible("organization_id"));

ALTER TABLE "lesson" ADD CONSTRAINT "lesson_number_check" CHECK ("number" BETWEEN 0 AND 999);
ALTER TABLE "curriculum_edition" ADD CONSTRAINT "edition_year_check" CHECK ("publish_year" IS NULL OR "publish_year" BETWEEN 1900 AND 2100);

-- ---------------------------------------------------------------------------
-- Dữ liệu tham chiếu đã duyệt (D-B03): mã chương trình hai hệ giáo trình.
-- Là DỮ LIỆU (sửa được trên giao diện Super Admin), không phải hằng số trong code.
-- KHÔNG tạo phiên bản, bài học hay nội dung giáo trình.
-- ---------------------------------------------------------------------------
INSERT INTO "curriculum_series" ("id", "code", "name_vi", "name_ko", "sort_order") VALUES
  ('01900000-0000-7000-8000-000000000001', 'TH', 'Tiếng Hàn tổng hợp dành cho người Việt Nam', '베트남인을 위한 종합 한국어', 1),
  ('01900000-0000-7000-8000-000000000002', 'KIIP', 'Chương trình hội nhập xã hội Hàn Quốc (KIIP)', '사회통합프로그램', 2);

INSERT INTO "curriculum_level" ("id", "series_id", "code", "name_vi", "name_ko", "structure", "sort_order") VALUES
  ('01900000-0000-7000-8000-000000000101', '01900000-0000-7000-8000-000000000001', 'TH01', 'Sơ cấp 1', '초급 1', 'LANGUAGE', 1),
  ('01900000-0000-7000-8000-000000000102', '01900000-0000-7000-8000-000000000001', 'TH02', 'Sơ cấp 2', '초급 2', 'LANGUAGE', 2),
  ('01900000-0000-7000-8000-000000000103', '01900000-0000-7000-8000-000000000001', 'TH03', 'Trung cấp 1', '중급 1', 'LANGUAGE', 3),
  ('01900000-0000-7000-8000-000000000104', '01900000-0000-7000-8000-000000000001', 'TH04', 'Trung cấp 2', '중급 2', 'LANGUAGE', 4),
  ('01900000-0000-7000-8000-000000000105', '01900000-0000-7000-8000-000000000001', 'TH05', 'Cao cấp 1', '고급 1', 'LANGUAGE', 5),
  ('01900000-0000-7000-8000-000000000106', '01900000-0000-7000-8000-000000000001', 'TH06', 'Cao cấp 2', '고급 2', 'LANGUAGE', 6),
  ('01900000-0000-7000-8000-000000000200', '01900000-0000-7000-8000-000000000002', 'KIIP00', 'Cấp 0 – Nhập môn', '기초', 'LANGUAGE', 1),
  ('01900000-0000-7000-8000-000000000201', '01900000-0000-7000-8000-000000000002', 'KIIP01', 'Cấp 1 – Sơ cấp 1', '초급 1', 'LANGUAGE', 2),
  ('01900000-0000-7000-8000-000000000202', '01900000-0000-7000-8000-000000000002', 'KIIP02', 'Cấp 2 – Sơ cấp 2', '초급 2', 'LANGUAGE', 3),
  ('01900000-0000-7000-8000-000000000203', '01900000-0000-7000-8000-000000000002', 'KIIP03', 'Cấp 3 – Trung cấp 1', '중급 1', 'LANGUAGE', 4),
  ('01900000-0000-7000-8000-000000000204', '01900000-0000-7000-8000-000000000002', 'KIIP04', 'Cấp 4 – Trung cấp 2', '중급 2', 'LANGUAGE', 5),
  ('01900000-0000-7000-8000-000000000206', '01900000-0000-7000-8000-000000000002', 'KIIP05-B', 'Cấp 5 – Hiểu biết xã hội Hàn Quốc (Cơ bản)', NULL, 'SOCIETY', 6),
  ('01900000-0000-7000-8000-000000000205', '01900000-0000-7000-8000-000000000002', 'KIIP05-A', 'Cấp 5 – Hiểu biết xã hội Hàn Quốc (Nâng cao)', NULL, 'SOCIETY', 7);
