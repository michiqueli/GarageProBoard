CREATE TABLE "certificado_afip" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"alias" text NOT NULL,
	"pedido" text NOT NULL,
	"clave_privada_cifrada" text NOT NULL,
	"certificado" text,
	"entorno" text,
	"vigente_desde" timestamp with time zone,
	"vigente_hasta" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certificado_afip_estado_valido" CHECK ("certificado_afip"."estado" in ('pendiente', 'activo', 'reemplazado', 'descartado')),
	CONSTRAINT "certificado_afip_entorno_valido" CHECK ("certificado_afip"."entorno" is null or "certificado_afip"."entorno" in ('produccion', 'homologacion')),
	CONSTRAINT "certificado_afip_activo_completo" CHECK ("certificado_afip"."estado" <> 'activo' or ("certificado_afip"."certificado" is not null and "certificado_afip"."entorno" is not null and "certificado_afip"."vigente_hasta" is not null))
);
--> statement-breakpoint
ALTER TABLE "certificado_afip" ADD CONSTRAINT "certificado_afip_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificado_afip" ADD CONSTRAINT "certificado_afip_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "certificado_afip_empresa_idx" ON "certificado_afip" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "certificado_afip_activo_uq" ON "certificado_afip" USING btree ("empresa_id") WHERE estado = 'activo';--> statement-breakpoint
CREATE UNIQUE INDEX "certificado_afip_pendiente_uq" ON "certificado_afip" USING btree ("empresa_id") WHERE estado = 'pendiente';