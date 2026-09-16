ALTER TYPE "public"."rol" ADD VALUE 'super_admin' BEFORE 'admin';--> statement-breakpoint
ALTER TYPE "public"."rol" ADD VALUE 'recepcion' BEFORE 'mecanico';--> statement-breakpoint
CREATE TABLE "funcionalidad" (
	"tenant_id" uuid NOT NULL,
	"clave" text NOT NULL,
	"habilitada" boolean DEFAULT false NOT NULL,
	"nota" text,
	"actualizado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "funcionalidad_tenant_id_clave_pk" PRIMARY KEY("tenant_id","clave")
);
--> statement-breakpoint
ALTER TABLE "funcionalidad" ADD CONSTRAINT "funcionalidad_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funcionalidad" ADD CONSTRAINT "funcionalidad_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;