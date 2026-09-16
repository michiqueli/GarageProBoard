CREATE TABLE "auditoria_backoffice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operador_id" uuid NOT NULL,
	"tenant_afectado" uuid,
	"accion" text NOT NULL,
	"motivo" text,
	"datos_antes" jsonb,
	"datos_despues" jsonb,
	"ip" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operador" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"hash_password" text NOT NULL,
	"nombre" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"ultimo_acceso" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operador_email_minuscula" CHECK ("operador"."email" = lower("operador"."email"))
);
--> statement-breakpoint
CREATE TABLE "sesion_operador" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operador_id" uuid NOT NULL,
	"hash_token" text NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"anulada_en" timestamp with time zone,
	"agente" text,
	"ip" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auditoria_backoffice" ADD CONSTRAINT "auditoria_backoffice_operador_id_operador_id_fk" FOREIGN KEY ("operador_id") REFERENCES "public"."operador"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria_backoffice" ADD CONSTRAINT "auditoria_backoffice_tenant_afectado_tenant_id_fk" FOREIGN KEY ("tenant_afectado") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesion_operador" ADD CONSTRAINT "sesion_operador_operador_id_operador_id_fk" FOREIGN KEY ("operador_id") REFERENCES "public"."operador"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_backoffice_tenant_idx" ON "auditoria_backoffice" USING btree ("tenant_afectado","creado_en");--> statement-breakpoint
CREATE UNIQUE INDEX "operador_email_uq" ON "operador" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "sesion_operador_hash_uq" ON "sesion_operador" USING btree ("hash_token");