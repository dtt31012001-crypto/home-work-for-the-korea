-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "address" TEXT,
ADD COLUMN     "attendance_edit_hours" INTEGER NOT NULL DEFAULT 48,
ADD COLUMN     "behind_threshold_lessons" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "contact_email" TEXT,
ADD COLUMN     "contact_phone" TEXT,
ADD COLUMN     "max_students" INTEGER,
ADD COLUMN     "max_teachers" INTEGER,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "branch" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branch_organization_id_id_key" ON "branch"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_organization_id_name_key" ON "branch"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "room_organization_id_id_key" ON "room"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "room_branch_id_name_key" ON "room"("branch_id", "name");

-- AddForeignKey
ALTER TABLE "branch" ADD CONSTRAINT "branch_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room" ADD CONSTRAINT "room_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branch"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Row-Level Security: chỉ thấy/ghi dữ liệu của trung tâm trong phạm vi request
-- ---------------------------------------------------------------------------
ALTER TABLE "branch" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "branch"
  USING (app_org_visible("organization_id")) WITH CHECK (app_org_visible("organization_id"));

ALTER TABLE "room" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "room"
  USING (app_org_visible("organization_id")) WITH CHECK (app_org_visible("organization_id"));

ALTER TABLE "organization" ADD CONSTRAINT "organization_settings_check" CHECK (
  "attendance_edit_hours" BETWEEN 0 AND 720
  AND "behind_threshold_lessons" BETWEEN 1 AND 50
  AND ("max_students" IS NULL OR "max_students" >= 0)
  AND ("max_teachers" IS NULL OR "max_teachers" >= 0)
);
ALTER TABLE "room" ADD CONSTRAINT "room_capacity_check" CHECK ("capacity" IS NULL OR "capacity" > 0);
