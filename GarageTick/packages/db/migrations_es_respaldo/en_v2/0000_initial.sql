CREATE TYPE "public"."charge" AS ENUM('customer', 'warranty', 'internal', 'other');--> statement-breakpoint
CREATE TYPE "public"."closed_by" AS ENUM('mechanic', 'auto', 'manager');--> statement-breakpoint
CREATE TYPE "public"."device_type" AS ENUM('kiosk', 'desktop');--> statement-breakpoint
CREATE TYPE "public"."hold_reason" AS ENUM('parts', 'customer_approval', 'warranty_approval', 'diagnosis', 'lift', 'customer_appointment', 'other');--> statement-breakpoint
CREATE TYPE "public"."operation_status" AS ENUM('pending', 'in_progress', 'done');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('super_admin', 'admin', 'shop_manager', 'front_desk', 'mechanic');--> statement-breakpoint
CREATE TYPE "public"."scan_outcome" AS ENUM('ok', 'rejected', 'error');--> statement-breakpoint
CREATE TYPE "public"."work_order_source" AS ENUM('manual', 'dms', 'import');--> statement-breakpoint
CREATE TYPE "public"."work_order_status" AS ENUM('open', 'in_progress', 'on_hold', 'finished', 'invoiced', 'cancelled');--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid,
	"employee_number" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"password_hash" text,
	"role" "role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"clock_in" timestamp with time zone,
	"clock_out" timestamp with time zone,
	"source" text DEFAULT 'manual' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credential" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revocation_reason" text,
	CONSTRAINT "credential_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "device" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "device_type" NOT NULL,
	"token_hash" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature" (
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"note" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_tenant_id_key_pk" PRIMARY KEY("tenant_id","key")
);
--> statement-breakpoint
CREATE TABLE "operation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"code" text,
	"description" text NOT NULL,
	"status" "operation_status" DEFAULT 'pending' NOT NULL,
	"flat_rate_minutes" integer,
	"display_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"device_id" uuid,
	"raw_code" text NOT NULL,
	"detected_type" text,
	"user_id" uuid,
	"work_order_id" uuid,
	"outcome" "scan_outcome" NOT NULL,
	"action" text,
	"message" text,
	"latency_ms" integer,
	"deferred" boolean DEFAULT false NOT NULL,
	"idempotency_key" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_adjustment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setting" (
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "setting_tenant_id_key_pk" PRIMARY KEY("tenant_id","key")
);
--> statement-breakpoint
CREATE TABLE "tenant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "vehicle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"license_plate" text,
	"vin" text,
	"make" text,
	"model" text,
	"year" smallint,
	"customer_name" text,
	"customer_phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"number" text NOT NULL,
	"dms_number" text,
	"qr_code" text NOT NULL,
	"charge" charge NOT NULL,
	"dms_charge_raw" text,
	"vehicle_id" uuid,
	"description" text,
	"status" "work_order_status" DEFAULT 'open' NOT NULL,
	"priority" smallint DEFAULT 0 NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_by_id" uuid,
	"source" "work_order_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_order_qr_code_unique" UNIQUE("qr_code")
);
--> statement-breakpoint
CREATE TABLE "work_order_hold" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"reason" "hold_reason" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"note" text,
	"recorded_by_id" uuid
);
--> statement-breakpoint
CREATE TABLE "work_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"operation_id" uuid,
	"user_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer GENERATED ALWAYS AS (EXTRACT(EPOCH FROM (ended_at - started_at))::int) STORED,
	"closed_by" "closed_by",
	"start_device_id" uuid,
	"end_device_id" uuid,
	"deferred" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch" ADD CONSTRAINT "branch_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential" ADD CONSTRAINT "credential_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential" ADD CONSTRAINT "credential_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device" ADD CONSTRAINT "device_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device" ADD CONSTRAINT "device_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature" ADD CONSTRAINT "feature_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature" ADD CONSTRAINT "feature_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation" ADD CONSTRAINT "operation_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation" ADD CONSTRAINT "operation_work_order_id_work_order_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_event" ADD CONSTRAINT "scan_event_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_event" ADD CONSTRAINT "scan_event_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."device"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_event" ADD CONSTRAINT "scan_event_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_event" ADD CONSTRAINT "scan_event_work_order_id_work_order_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_adjustment" ADD CONSTRAINT "session_adjustment_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_adjustment" ADD CONSTRAINT "session_adjustment_session_id_work_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."work_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_adjustment" ADD CONSTRAINT "session_adjustment_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setting" ADD CONSTRAINT "setting_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_vehicle_id_vehicle_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicle"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_created_by_id_app_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_hold" ADD CONSTRAINT "work_order_hold_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_hold" ADD CONSTRAINT "work_order_hold_work_order_id_work_order_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_hold" ADD CONSTRAINT "work_order_hold_recorded_by_id_app_user_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_session" ADD CONSTRAINT "work_session_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_session" ADD CONSTRAINT "work_session_work_order_id_work_order_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_session" ADD CONSTRAINT "work_session_operation_id_operation_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_session" ADD CONSTRAINT "work_session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_session" ADD CONSTRAINT "work_session_start_device_id_device_id_fk" FOREIGN KEY ("start_device_id") REFERENCES "public"."device"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_session" ADD CONSTRAINT "work_session_end_device_id_device_id_fk" FOREIGN KEY ("end_device_id") REFERENCES "public"."device"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_app_user_employee_number" ON "app_user" USING btree ("tenant_id","employee_number");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_app_user_email" ON "app_user" USING btree ("email") WHERE email IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_app_user_tenant" ON "app_user" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_attendance" ON "attendance" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "ix_branch_tenant" ON "branch" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "ix_credential_user" ON "credential" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_credential_active" ON "credential" USING btree ("tenant_id") WHERE revoked_at IS NULL;--> statement-breakpoint
CREATE INDEX "ix_device_tenant" ON "device" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "ix_operation_work_order" ON "operation" USING btree ("work_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_scan_event_idempotency" ON "scan_event" USING btree ("idempotency_key") WHERE idempotency_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_scan_event_date" ON "scan_event" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_session_adjustment_session" ON "session_adjustment" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "ix_vehicle_license_plate" ON "vehicle" USING btree ("tenant_id","license_plate");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_work_order_number" ON "work_order" USING btree ("tenant_id","branch_id","number");--> statement-breakpoint
CREATE INDEX "ix_work_order_status" ON "work_order" USING btree ("tenant_id","branch_id","status");--> statement-breakpoint
CREATE INDEX "ix_work_order_dms" ON "work_order" USING btree ("tenant_id","dms_number");--> statement-breakpoint
CREATE INDEX "ix_work_order_hold_work_order" ON "work_order_hold" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "ix_work_order_hold_open" ON "work_order_hold" USING btree ("tenant_id") WHERE ended_at IS NULL;--> statement-breakpoint
CREATE INDEX "ix_work_session_open" ON "work_session" USING btree ("user_id") WHERE ended_at IS NULL;--> statement-breakpoint
CREATE INDEX "ix_work_session_work_order" ON "work_session" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "ix_work_session_range" ON "work_session" USING btree ("tenant_id","user_id","started_at");