-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'EXCUSED', 'ABSENT');

-- CreateEnum
CREATE TYPE "LessonCoverage" AS ENUM ('DONE', 'PARTIAL');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- DropForeignKey
ALTER TABLE "class" DROP CONSTRAINT "class_branch_fk";

-- DropForeignKey
ALTER TABLE "class" DROP CONSTRAINT "class_edition_fk";

-- DropForeignKey
ALTER TABLE "class" DROP CONSTRAINT "class_org_fk";

-- DropForeignKey
ALTER TABLE "class" DROP CONSTRAINT "class_room_fk";

-- DropForeignKey
ALTER TABLE "class_session" DROP CONSTRAINT "class_session_class_fk";

-- DropForeignKey
ALTER TABLE "class_session" DROP CONSTRAINT "class_session_lesson_fk";

-- DropForeignKey
ALTER TABLE "class_session" DROP CONSTRAINT "class_session_makeup_fk";

-- DropForeignKey
ALTER TABLE "class_session" DROP CONSTRAINT "class_session_room_fk";

-- DropForeignKey
ALTER TABLE "class_session" DROP CONSTRAINT "class_session_teacher_fk";

-- DropForeignKey
ALTER TABLE "class_teacher" DROP CONSTRAINT "class_teacher_class_fk";

-- DropForeignKey
ALTER TABLE "class_teacher" DROP CONSTRAINT "class_teacher_user_fk";

-- DropForeignKey
ALTER TABLE "enrollment" DROP CONSTRAINT "enrollment_class_fk";

-- DropForeignKey
ALTER TABLE "enrollment" DROP CONSTRAINT "enrollment_student_fk";

-- DropForeignKey
ALTER TABLE "schedule_rule" DROP CONSTRAINT "schedule_rule_class_fk";

-- DropForeignKey
ALTER TABLE "session_change" DROP CONSTRAINT "session_change_session_fk";

-- CreateTable
CREATE TABLE "attendance" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "student_user_id" UUID NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "note" TEXT,
    "recorded_by" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_event" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "student_user_id" UUID NOT NULL,
    "before" "AttendanceStatus",
    "after" "AttendanceStatus" NOT NULL,
    "note" TEXT,
    "reason" TEXT,
    "source" TEXT NOT NULL,
    "by_user_id" UUID NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_log" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "note" TEXT,
    "recorded_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_lesson" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "coverage" "LessonCoverage" NOT NULL,

    CONSTRAINT "session_lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_comment" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "student_user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "visible_to_family" BOOLEAN NOT NULL DEFAULT false,
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_change_request" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "changes" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_change_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_organization_id_student_user_id_idx" ON "attendance"("organization_id", "student_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_session_id_student_user_id_key" ON "attendance"("session_id", "student_user_id");

-- CreateIndex
CREATE INDEX "attendance_event_session_id_idx" ON "attendance_event"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_log_session_id_key" ON "session_log"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_lesson_session_id_lesson_id_key" ON "session_lesson"("session_id", "lesson_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_comment_session_id_student_user_id_key" ON "student_comment"("session_id", "student_user_id");

-- CreateIndex
CREATE INDEX "attendance_change_request_organization_id_status_idx" ON "attendance_change_request"("organization_id", "status");

-- Khóa ngoại kép: không tham chiếu được buổi học / bài của nơi khác
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_session_fk" FOREIGN KEY ("organization_id", "session_id") REFERENCES "class_session"("organization_id", "id");
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_student_fk" FOREIGN KEY ("student_user_id") REFERENCES "app_user"("id");
ALTER TABLE "attendance_event" ADD CONSTRAINT "attendance_event_session_fk" FOREIGN KEY ("organization_id", "session_id") REFERENCES "class_session"("organization_id", "id");
ALTER TABLE "session_log" ADD CONSTRAINT "session_log_session_fk" FOREIGN KEY ("organization_id", "session_id") REFERENCES "class_session"("organization_id", "id");
ALTER TABLE "session_lesson" ADD CONSTRAINT "session_lesson_session_fk" FOREIGN KEY ("organization_id", "session_id") REFERENCES "class_session"("organization_id", "id");
ALTER TABLE "session_lesson" ADD CONSTRAINT "session_lesson_lesson_fk" FOREIGN KEY ("lesson_id") REFERENCES "lesson"("id");
ALTER TABLE "student_comment" ADD CONSTRAINT "student_comment_session_fk" FOREIGN KEY ("organization_id", "session_id") REFERENCES "class_session"("organization_id", "id");
ALTER TABLE "attendance_change_request" ADD CONSTRAINT "attendance_cr_session_fk" FOREIGN KEY ("organization_id", "session_id") REFERENCES "class_session"("organization_id", "id");
ALTER TABLE "student_comment" ADD CONSTRAINT "student_comment_body_check" CHECK (length("body") BETWEEN 1 AND 2000);

-- Chỉ một yêu cầu sửa đang chờ cho mỗi buổi
CREATE UNIQUE INDEX "attendance_cr_pending_unique" ON "attendance_change_request" ("session_id") WHERE "status" = 'PENDING';

-- Lịch sử điểm danh: chỉ thêm
CREATE TRIGGER attendance_event_no_update_delete
  BEFORE UPDATE OR DELETE ON "attendance_event"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['attendance', 'attendance_event', 'session_log', 'session_lesson', 'student_comment', 'attendance_change_request'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (app_org_visible(organization_id)) WITH CHECK (app_org_visible(organization_id))', t);
  END LOOP;
END $$;
