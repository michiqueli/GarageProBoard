CREATE TABLE "motivo_espera" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"clave" text,
	"nombre" text NOT NULL,
	"orden" smallint NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "motivo_espera_nombre_valido" CHECK (length(btrim("motivo_espera"."nombre")) between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "orden_espera" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"orden_id" uuid NOT NULL,
	"motivo_id" uuid NOT NULL,
	"nota" text,
	"desde" timestamp with time zone DEFAULT now() NOT NULL,
	"hasta" timestamp with time zone,
	"abierta_por" uuid,
	"cerrada_por" uuid,
	CONSTRAINT "orden_espera_rango_valido" CHECK ("orden_espera"."hasta" is null or "orden_espera"."hasta" >= "orden_espera"."desde")
);
--> statement-breakpoint
ALTER TABLE "motivo_espera" ADD CONSTRAINT "motivo_espera_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_espera" ADD CONSTRAINT "orden_espera_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_espera" ADD CONSTRAINT "orden_espera_orden_id_orden_id_fk" FOREIGN KEY ("orden_id") REFERENCES "public"."orden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_espera" ADD CONSTRAINT "orden_espera_motivo_id_motivo_espera_id_fk" FOREIGN KEY ("motivo_id") REFERENCES "public"."motivo_espera"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_espera" ADD CONSTRAINT "orden_espera_abierta_por_usuario_id_fk" FOREIGN KEY ("abierta_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_espera" ADD CONSTRAINT "orden_espera_cerrada_por_usuario_id_fk" FOREIGN KEY ("cerrada_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "motivo_espera_clave_uq" ON "motivo_espera" USING btree ("tenant_id","clave") WHERE clave is not null;--> statement-breakpoint
CREATE INDEX "orden_espera_orden_idx" ON "orden_espera" USING btree ("orden_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orden_espera_abierta_uq" ON "orden_espera" USING btree ("orden_id") WHERE hasta is null;