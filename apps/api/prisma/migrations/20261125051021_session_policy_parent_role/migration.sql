-- CreateEnum
CREATE TYPE "SessionPolicy" AS ENUM ('ADMIN', 'TEACHER', 'LEARNER');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'PARENT';

-- AlterTable
ALTER TABLE "session" ADD COLUMN     "family_expires_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "family_started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "policy" "SessionPolicy" NOT NULL DEFAULT 'LEARNER';

-- Phiên đang tồn tại: giữ thời hạn hiện tại làm thời hạn tối đa
UPDATE "session" SET "family_expires_at" = "expires_at", "family_started_at" = "created_at";
