CREATE TABLE "unidad_categoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unidad_concepto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"unidad_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"categoria_id" uuid,
	"descripcion" text NOT NULL,
	"proveedor_id" uuid,
	"comprobante" text,
	"fecha" date DEFAULT current_date NOT NULL,
	"importe" numeric(18, 2) NOT NULL,
	"moneda" text NOT NULL,
	"cotizacion" numeric(18, 4),
	"anulado_en" timestamp with time zone,
	"anulado_por" uuid,
	"anulacion_motivo" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	CONSTRAINT "unidad_concepto_tipo_valido" CHECK ("unidad_concepto"."tipo" in ('compra', 'gasto', 'bonificacion')),
	CONSTRAINT "unidad_concepto_importe_positivo" CHECK ("unidad_concepto"."importe" > 0),
	CONSTRAINT "unidad_concepto_moneda_valida" CHECK ("unidad_concepto"."moneda" in ('ARS', 'USD')),
	CONSTRAINT "unidad_concepto_cotizacion_valida" CHECK ("unidad_concepto"."cotizacion" is null or "unidad_concepto"."cotizacion" > 0)
);
--> statement-breakpoint
ALTER TABLE "unidad_categoria" ADD CONSTRAINT "unidad_categoria_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidad_concepto" ADD CONSTRAINT "unidad_concepto_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidad_concepto" ADD CONSTRAINT "unidad_concepto_unidad_id_unidad_id_fk" FOREIGN KEY ("unidad_id") REFERENCES "public"."unidad"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidad_concepto" ADD CONSTRAINT "unidad_concepto_categoria_id_unidad_categoria_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."unidad_categoria"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidad_concepto" ADD CONSTRAINT "unidad_concepto_proveedor_id_proveedor_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidad_concepto" ADD CONSTRAINT "unidad_concepto_anulado_por_usuario_id_fk" FOREIGN KEY ("anulado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidad_concepto" ADD CONSTRAINT "unidad_concepto_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unidad_categoria_uq" ON "unidad_categoria" USING btree ("tenant_id",lower("nombre"));--> statement-breakpoint
CREATE INDEX "unidad_concepto_unidad_idx" ON "unidad_concepto" USING btree ("unidad_id","fecha");