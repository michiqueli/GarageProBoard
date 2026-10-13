CREATE TABLE "orden_firma" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"orden_id" uuid NOT NULL,
	"momento" text NOT NULL,
	"aclaracion" text NOT NULL,
	"ruta" text NOT NULL,
	"ancho" integer NOT NULL,
	"alto" integer NOT NULL,
	"bytes" integer NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"reemplazada_en" timestamp with time zone,
	CONSTRAINT "orden_firma_momento_valido" CHECK ("orden_firma"."momento" in ('ingreso', 'egreso'))
);
--> statement-breakpoint
ALTER TABLE "orden_firma" ADD CONSTRAINT "orden_firma_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_firma" ADD CONSTRAINT "orden_firma_orden_id_orden_id_fk" FOREIGN KEY ("orden_id") REFERENCES "public"."orden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_firma" ADD CONSTRAINT "orden_firma_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "orden_firma_vigente_uq" ON "orden_firma" USING btree ("orden_id","momento") WHERE reemplazada_en is null;