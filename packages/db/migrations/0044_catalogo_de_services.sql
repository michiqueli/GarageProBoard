CREATE TABLE "service_catalogo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"marca" text,
	"modelo" text,
	"nombre" text NOT NULL,
	"kilometros" integer,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_catalogo_km_valido" CHECK ("service_catalogo"."kilometros" is null or "service_catalogo"."kilometros" >= 0)
);
--> statement-breakpoint
CREATE TABLE "service_catalogo_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"orden" smallint NOT NULL,
	"tipo" text NOT NULL,
	"repuesto_id" uuid,
	"codigo" text,
	"descripcion" text NOT NULL,
	"cantidad" numeric(18, 4) DEFAULT '1' NOT NULL,
	"precio_unitario" numeric(18, 4) DEFAULT '0' NOT NULL,
	"codigo_alicuota" smallint DEFAULT 5 NOT NULL,
	"minutos" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_catalogo_item_tipo_valido" CHECK ("service_catalogo_item"."tipo" in ('trabajo', 'repuesto')),
	CONSTRAINT "service_catalogo_item_cantidad_positiva" CHECK ("service_catalogo_item"."cantidad" > 0),
	CONSTRAINT "service_catalogo_item_precio_no_negativo" CHECK ("service_catalogo_item"."precio_unitario" >= 0),
	CONSTRAINT "service_catalogo_item_minutos_validos" CHECK ("service_catalogo_item"."minutos" is null or ("service_catalogo_item"."minutos" >= 0 and "service_catalogo_item"."tipo" = 'trabajo'))
);
--> statement-breakpoint
ALTER TABLE "orden_item" ADD COLUMN "minutos_estipulados" integer;--> statement-breakpoint
ALTER TABLE "service_catalogo" ADD CONSTRAINT "service_catalogo_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_catalogo_item" ADD CONSTRAINT "service_catalogo_item_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_catalogo_item" ADD CONSTRAINT "service_catalogo_item_service_id_service_catalogo_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service_catalogo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_catalogo_item" ADD CONSTRAINT "service_catalogo_item_repuesto_id_repuesto_id_fk" FOREIGN KEY ("repuesto_id") REFERENCES "public"."repuesto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "service_catalogo_uq" ON "service_catalogo" USING btree ("tenant_id",lower(coalesce("marca", '')),lower(coalesce("modelo", '')),lower("nombre"));--> statement-breakpoint
CREATE INDEX "service_catalogo_item_service_idx" ON "service_catalogo_item" USING btree ("service_id","orden");