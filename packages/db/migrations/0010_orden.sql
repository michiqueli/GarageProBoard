CREATE TABLE "orden" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"numero" bigint NOT NULL,
	"codigo_qr" text NOT NULL,
	"estado" text DEFAULT 'recibida' NOT NULL,
	"vehiculo_id" uuid NOT NULL,
	"titular_id" uuid,
	"paga_id" uuid,
	"trae_nombre" text,
	"trae_telefono" text,
	"kilometraje" integer,
	"combustible" text,
	"pedido" text NOT NULL,
	"observaciones" text,
	"prometida_para" date,
	"asesor_id" uuid NOT NULL,
	"mecanico_id" uuid,
	"terminada_en" timestamp with time zone,
	"comprobante_id" uuid,
	"entregada_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orden_sucursal_numero_uq" UNIQUE("sucursal_id","numero"),
	CONSTRAINT "orden_codigo_qr_uq" UNIQUE("codigo_qr"),
	CONSTRAINT "orden_estado_valido" CHECK ("orden"."estado" in ('recibida', 'en_proceso', 'esperando_repuesto', 'esperando_autorizacion', 'terminada', 'facturada', 'entregada', 'anulada')),
	CONSTRAINT "orden_combustible_valido" CHECK ("orden"."combustible" is null or "orden"."combustible" in ('vacio', 'cuarto', 'medio', 'tres_cuartos', 'lleno')),
	CONSTRAINT "orden_kilometraje_positivo" CHECK ("orden"."kilometraje" is null or "orden"."kilometraje" >= 0),
	CONSTRAINT "orden_codigo_qr_formato" CHECK ("orden"."codigo_qr" ~ '^[0-9A-HJKMNP-TV-Z]{8}$'),
	CONSTRAINT "orden_facturada_con_comprobante" CHECK ("orden"."estado" <> 'facturada' or "orden"."comprobante_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "orden_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"orden_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"orden" smallint NOT NULL,
	"codigo" text,
	"descripcion" text NOT NULL,
	"cantidad" numeric(18, 4) DEFAULT '1' NOT NULL,
	"precio_unitario" numeric(18, 4) DEFAULT '0' NOT NULL,
	"codigo_alicuota" smallint DEFAULT 5 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orden_item_tipo_valido" CHECK ("orden_item"."tipo" in ('trabajo', 'repuesto')),
	CONSTRAINT "orden_item_cantidad_positiva" CHECK ("orden_item"."cantidad" > 0),
	CONSTRAINT "orden_item_precio_no_negativo" CHECK ("orden_item"."precio_unitario" >= 0)
);
--> statement-breakpoint
CREATE TABLE "orden_secuencia" (
	"tenant_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"ultimo" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "orden_secuencia_sucursal_id_pk" PRIMARY KEY("sucursal_id")
);
--> statement-breakpoint
ALTER TABLE "orden" ADD CONSTRAINT "orden_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden" ADD CONSTRAINT "orden_sucursal_id_sucursal_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden" ADD CONSTRAINT "orden_vehiculo_id_vehiculo_id_fk" FOREIGN KEY ("vehiculo_id") REFERENCES "public"."vehiculo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden" ADD CONSTRAINT "orden_titular_id_entidad_comercial_id_fk" FOREIGN KEY ("titular_id") REFERENCES "public"."entidad_comercial"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden" ADD CONSTRAINT "orden_paga_id_entidad_comercial_id_fk" FOREIGN KEY ("paga_id") REFERENCES "public"."entidad_comercial"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden" ADD CONSTRAINT "orden_asesor_id_usuario_id_fk" FOREIGN KEY ("asesor_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden" ADD CONSTRAINT "orden_mecanico_id_usuario_id_fk" FOREIGN KEY ("mecanico_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden" ADD CONSTRAINT "orden_comprobante_id_comprobante_id_fk" FOREIGN KEY ("comprobante_id") REFERENCES "public"."comprobante"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_item" ADD CONSTRAINT "orden_item_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_item" ADD CONSTRAINT "orden_item_orden_id_orden_id_fk" FOREIGN KEY ("orden_id") REFERENCES "public"."orden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_secuencia" ADD CONSTRAINT "orden_secuencia_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_secuencia" ADD CONSTRAINT "orden_secuencia_sucursal_id_sucursal_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orden_estado_idx" ON "orden" USING btree ("sucursal_id","estado");--> statement-breakpoint
CREATE INDEX "orden_vehiculo_idx" ON "orden" USING btree ("vehiculo_id");--> statement-breakpoint
CREATE INDEX "orden_item_orden_idx" ON "orden_item" USING btree ("orden_id","orden");