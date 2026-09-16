CREATE TABLE "tenant_modulo" (
	"tenant_id" uuid NOT NULL,
	"modulo" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"vigente_desde" timestamp with time zone DEFAULT now() NOT NULL,
	"vigente_hasta" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_modulo_tenant_id_modulo_pk" PRIMARY KEY("tenant_id","modulo"),
	CONSTRAINT "tenant_modulo_conocido" CHECK ("tenant_modulo"."modulo" in ('nucleo', 'contable', 'servicios', 'repuestos', 'cartera', 'ventas', 'rrhh')),
	CONSTRAINT "tenant_modulo_vigencia" CHECK ("tenant_modulo"."vigente_hasta" is null or "tenant_modulo"."vigente_hasta" > "tenant_modulo"."vigente_desde")
);
--> statement-breakpoint
ALTER TABLE "tenant_modulo" ADD CONSTRAINT "tenant_modulo_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Las concesionarias que ya existían tenían todo, porque no había módulos que apagar.
-- Sin esto, migrar las dejaría sin ninguno: sin fila, el módulo está apagado.
INSERT INTO "tenant_modulo" ("tenant_id", "modulo")
SELECT t.id, m.modulo
  FROM "tenant" t
 CROSS JOIN unnest(array['nucleo', 'contable', 'servicios', 'repuestos', 'cartera', 'ventas', 'rrhh']) AS m(modulo);
