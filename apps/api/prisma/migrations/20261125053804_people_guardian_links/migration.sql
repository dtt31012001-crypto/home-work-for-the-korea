-- CreateEnum
CREATE TYPE "GuardianLinkStatus" AS ENUM ('PENDING_CONSENT', 'ACTIVE', 'REJECTED', 'REVOKED');

-- AlterTable
ALTER TABLE "app_user" ADD COLUMN     "date_of_birth" DATE;

-- CreateTable
CREATE TABLE "guardian_link" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "guardian_user_id" UUID NOT NULL,
    "student_user_id" UUID NOT NULL,
    "relationship" TEXT NOT NULL,
    "status" "GuardianLinkStatus" NOT NULL,
    "verified_by" UUID NOT NULL,
    "verified_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verification_note" TEXT,
    "consent_at" TIMESTAMPTZ(6),
    "rejected_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by" UUID,
    "revoked_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guardian_link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guardian_link_organization_id_student_user_id_idx" ON "guardian_link"("organization_id", "student_user_id");

-- CreateIndex
CREATE INDEX "guardian_link_guardian_user_id_idx" ON "guardian_link"("guardian_user_id");

ALTER TABLE "guardian_link" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "guardian_link"
  USING (app_org_visible("organization_id")) WITH CHECK (app_org_visible("organization_id"));

-- Mỗi cặp phụ huynh – học viên chỉ có một liên kết đang chờ/hiệu lực tại một trung tâm
CREATE UNIQUE INDEX "guardian_link_open_unique" ON "guardian_link" ("organization_id", "guardian_user_id", "student_user_id")
  WHERE "status" IN ('PENDING_CONSENT', 'ACTIVE');
ALTER TABLE "guardian_link" ADD CONSTRAINT "guardian_link_not_self" CHECK ("guardian_user_id" <> "student_user_id");
