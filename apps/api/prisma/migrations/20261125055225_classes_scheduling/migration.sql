-- CreateEnum
CREATE TYPE "ClassStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SessionKind" AS ENUM ('REGULAR', 'MAKEUP', 'EXTRA', 'EXAM');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'ON_HOLD', 'TRANSFERRED', 'WITHDRAWN', 'COMPLETED');

-- CreateTable
CREATE TABLE "class" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "edition_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "planned_sessions" INTEGER NOT NULL,
    "start_lesson_number" INTEGER NOT NULL,
    "sessions_per_lesson" INTEGER NOT NULL DEFAULT 1,
    "default_room_id" UUID,
    "tuition_amount" INTEGER,
    "status" "ClassStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_teacher" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_teacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_rule" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_session" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "number" INTEGER,
    "kind" "SessionKind" NOT NULL DEFAULT 'REGULAR',
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "room_id" UUID,
    "teacher_user_id" UUID,
    "planned_lesson_id" UUID,
    "status" "SessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "cancel_reason" TEXT,
    "makeup_for_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_change" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "change_type" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "by_user_id" UUID NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "student_user_id" UUID NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "hold_from" DATE,
    "hold_until" DATE,
    "transferred_to_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "class_organization_id_id_key" ON "class"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "class_organization_id_name_key" ON "class"("organization_id", "name");

-- CreateIndex
CREATE INDEX "class_teacher_organization_id_teacher_user_id_idx" ON "class_teacher"("organization_id", "teacher_user_id");

-- CreateIndex
CREATE INDEX "class_teacher_class_id_idx" ON "class_teacher"("class_id");

-- CreateIndex
CREATE INDEX "schedule_rule_class_id_idx" ON "schedule_rule"("class_id");

-- CreateIndex
CREATE INDEX "class_session_organization_id_starts_at_idx" ON "class_session"("organization_id", "starts_at");

-- CreateIndex
CREATE INDEX "class_session_class_id_starts_at_idx" ON "class_session"("class_id", "starts_at");

-- CreateIndex
CREATE INDEX "class_session_teacher_user_id_starts_at_idx" ON "class_session"("teacher_user_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "class_session_organization_id_id_key" ON "class_session"("organization_id", "id");

-- CreateIndex
CREATE INDEX "session_change_session_id_idx" ON "session_change"("session_id");

-- CreateIndex
CREATE INDEX "enrollment_organization_id_student_user_id_idx" ON "enrollment"("organization_id", "student_user_id");

-- CreateIndex
CREATE INDEX "enrollment_class_id_idx" ON "enrollment"("class_id");

-- ---------------------------------------------------------------------------
-- Khóa ngoại kép (organization_id, id): không thể tham chiếu dữ liệu trung tâm khác
-- ---------------------------------------------------------------------------
ALTER TABLE "class" ADD CONSTRAINT "class_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id");
ALTER TABLE "class" ADD CONSTRAINT "class_branch_fk" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branch"("organization_id", "id");
ALTER TABLE "class" ADD CONSTRAINT "class_room_fk" FOREIGN KEY ("organization_id", "default_room_id") REFERENCES "room"("organization_id", "id");
ALTER TABLE "class" ADD CONSTRAINT "class_edition_fk" FOREIGN KEY ("edition_id") REFERENCES "curriculum_edition"("id");
ALTER TABLE "class_teacher" ADD CONSTRAINT "class_teacher_class_fk" FOREIGN KEY ("organization_id", "class_id") REFERENCES "class"("organization_id", "id");
ALTER TABLE "class_teacher" ADD CONSTRAINT "class_teacher_user_fk" FOREIGN KEY ("teacher_user_id") REFERENCES "app_user"("id");
ALTER TABLE "schedule_rule" ADD CONSTRAINT "schedule_rule_class_fk" FOREIGN KEY ("organization_id", "class_id") REFERENCES "class"("organization_id", "id");
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_class_fk" FOREIGN KEY ("organization_id", "class_id") REFERENCES "class"("organization_id", "id");
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_room_fk" FOREIGN KEY ("organization_id", "room_id") REFERENCES "room"("organization_id", "id");
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_teacher_fk" FOREIGN KEY ("teacher_user_id") REFERENCES "app_user"("id");
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_lesson_fk" FOREIGN KEY ("planned_lesson_id") REFERENCES "lesson"("id");
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_makeup_fk" FOREIGN KEY ("organization_id", "makeup_for_id") REFERENCES "class_session"("organization_id", "id");
ALTER TABLE "session_change" ADD CONSTRAINT "session_change_session_fk" FOREIGN KEY ("organization_id", "session_id") REFERENCES "class_session"("organization_id", "id");
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_class_fk" FOREIGN KEY ("organization_id", "class_id") REFERENCES "class"("organization_id", "id");
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_student_fk" FOREIGN KEY ("student_user_id") REFERENCES "app_user"("id");

-- ---------------------------------------------------------------------------
-- Ràng buộc nghiệp vụ
-- ---------------------------------------------------------------------------
ALTER TABLE "class" ADD CONSTRAINT "class_values_check" CHECK (
  "planned_sessions" BETWEEN 1 AND 500 AND "sessions_per_lesson" BETWEEN 1 AND 20
  AND ("tuition_amount" IS NULL OR "tuition_amount" >= 0));
ALTER TABLE "schedule_rule" ADD CONSTRAINT "schedule_rule_check" CHECK (
  "weekday" BETWEEN 1 AND 7 AND "start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  AND "end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "start_time" < "end_time");
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_time_check" CHECK ("starts_at" < "ends_at");
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_number_check" CHECK (("kind" = 'REGULAR') = ("number" IS NOT NULL));
CREATE UNIQUE INDEX "class_session_regular_number_unique" ON "class_session" ("class_id", "number") WHERE "number" IS NOT NULL;

-- Không trùng phòng, không trùng giáo viên trong cùng trung tâm (buổi chưa hủy)
ALTER TABLE "class_session" ADD CONSTRAINT "session_room_no_overlap" EXCLUDE USING gist (
  "organization_id" WITH =, "room_id" WITH =, tstzrange("starts_at", "ends_at") WITH &&
) WHERE ("status" <> 'CANCELLED' AND "room_id" IS NOT NULL);
ALTER TABLE "class_session" ADD CONSTRAINT "session_teacher_no_overlap" EXCLUDE USING gist (
  "organization_id" WITH =, "teacher_user_id" WITH =, tstzrange("starts_at", "ends_at") WITH &&
) WHERE ("status" <> 'CANCELLED' AND "teacher_user_id" IS NOT NULL);

-- Một học viên chỉ có một ghi danh đang học/bảo lưu trong một lớp
CREATE UNIQUE INDEX "enrollment_open_unique" ON "enrollment" ("class_id", "student_user_id") WHERE "status" IN ('ACTIVE', 'ON_HOLD');
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_dates_check" CHECK ("end_date" IS NULL OR "end_date" >= "start_date");
-- Một giáo viên phụ trách tại một thời điểm (không chồng khoảng hiệu lực)
ALTER TABLE "class_teacher" ADD CONSTRAINT "class_teacher_no_overlap" EXCLUDE USING gist (
  "class_id" WITH =, daterange("valid_from", "valid_to", '[]') WITH &&
);

-- Lịch sử thay đổi buổi học: chỉ thêm
CREATE TRIGGER session_change_no_update_delete
  BEFORE UPDATE OR DELETE ON "session_change"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['class', 'class_teacher', 'schedule_rule', 'class_session', 'session_change', 'enrollment'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (app_org_visible(organization_id)) WITH CHECK (app_org_visible(organization_id))', t);
  END LOOP;
END $$;
