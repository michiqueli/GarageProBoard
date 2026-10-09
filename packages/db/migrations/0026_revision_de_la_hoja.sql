CREATE TABLE "revision_punto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"clave" text,
	"seccion" text NOT NULL,
	"nombre" text NOT NULL,
	"orden" smallint NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revision_punto_seccion_valida" CHECK ("revision_punto"."seccion" in ('exterior', 'interior', 'motor', 'dinamica', 'neumaticos')),
	CONSTRAINT "revision_punto_nombre_valido" CHECK (length(btrim("revision_punto"."nombre")) between 1 and 60)
);
--> statement-breakpoint
ALTER TABLE "orden" ADD COLUMN "revision" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "revision_punto" ADD CONSTRAINT "revision_punto_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "revision_punto_clave_uq" ON "revision_punto" USING btree ("tenant_id","clave") WHERE clave is not null;--> statement-breakpoint
CREATE INDEX "revision_punto_seccion_idx" ON "revision_punto" USING btree ("tenant_id","seccion","orden");--> statement-breakpoint
ALTER TABLE "orden" ADD CONSTRAINT "orden_revision_objeto" CHECK (jsonb_typeof("orden"."revision") = 'object');