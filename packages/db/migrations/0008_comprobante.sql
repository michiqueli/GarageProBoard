CREATE TABLE "comprobante" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"punto_venta_id" uuid NOT NULL,
	"punto_venta" integer NOT NULL,
	"tipo_comprobante" smallint NOT NULL,
	"numero" bigint NOT NULL,
	"fecha" date NOT NULL,
	"concepto" smallint NOT NULL,
	"servicio_desde" date,
	"servicio_hasta" date,
	"vencimiento_pago" date,
	"cliente_id" uuid,
	"tipo_doc_receptor" smallint NOT NULL,
	"numero_doc_receptor" text NOT NULL,
	"receptor_nombre" text NOT NULL,
	"receptor_condicion_iva" smallint NOT NULL,
	"receptor_domicilio" text,
	"condicion_venta" text NOT NULL,
	"importe_neto" numeric(18, 2) NOT NULL,
	"importe_iva" numeric(18, 2) NOT NULL,
	"importe_exento" numeric(18, 2) NOT NULL,
	"importe_total" numeric(18, 2) NOT NULL,
	"alicuotas" jsonb NOT NULL,
	"estado" text DEFAULT 'emitiendo' NOT NULL,
	"entorno" text NOT NULL,
	"cae" text,
	"vencimiento_cae" date,
	"observaciones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"errores" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"respuesta_afip" jsonb,
	"emitido_por" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comprobante_estado_valido" CHECK ("comprobante"."estado" in ('emitiendo', 'autorizado', 'rechazado', 'incierto')),
	CONSTRAINT "comprobante_entorno_valido" CHECK ("comprobante"."entorno" in ('produccion', 'homologacion')),
	CONSTRAINT "comprobante_concepto_valido" CHECK ("comprobante"."concepto" in (1, 2, 3)),
	CONSTRAINT "comprobante_autorizado_con_cae" CHECK ("comprobante"."estado" <> 'autorizado' or ("comprobante"."cae" is not null and "comprobante"."vencimiento_cae" is not null)),
	CONSTRAINT "comprobante_servicio_con_periodo" CHECK ("comprobante"."concepto" = 1 or ("comprobante"."servicio_desde" is not null and "comprobante"."servicio_hasta" is not null and "comprobante"."vencimiento_pago" is not null))
);
--> statement-breakpoint
CREATE TABLE "comprobante_renglon" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"comprobante_id" uuid NOT NULL,
	"orden" smallint NOT NULL,
	"codigo" text,
	"descripcion" text NOT NULL,
	"cantidad" numeric(18, 4) NOT NULL,
	"unidad" text DEFAULT 'unidades' NOT NULL,
	"precio_unitario" numeric(18, 4) NOT NULL,
	"bonificacion_porcentaje" numeric(5, 2) DEFAULT '0' NOT NULL,
	"total" numeric(18, 2) NOT NULL,
	"codigo_alicuota" smallint NOT NULL,
	CONSTRAINT "comprobante_renglon_cantidad_positiva" CHECK ("comprobante_renglon"."cantidad" > 0),
	CONSTRAINT "comprobante_renglon_total_positivo" CHECK ("comprobante_renglon"."total" >= 0)
);
--> statement-breakpoint
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_sucursal_id_sucursal_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_punto_venta_id_punto_venta_id_fk" FOREIGN KEY ("punto_venta_id") REFERENCES "public"."punto_venta"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_tipo_comprobante_tipo_comprobante_codigo_fk" FOREIGN KEY ("tipo_comprobante") REFERENCES "public"."tipo_comprobante"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_cliente_id_entidad_comercial_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."entidad_comercial"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_receptor_condicion_iva_condicion_iva_codigo_fk" FOREIGN KEY ("receptor_condicion_iva") REFERENCES "public"."condicion_iva"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_emitido_por_usuario_id_fk" FOREIGN KEY ("emitido_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobante_renglon" ADD CONSTRAINT "comprobante_renglon_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobante_renglon" ADD CONSTRAINT "comprobante_renglon_comprobante_id_comprobante_id_fk" FOREIGN KEY ("comprobante_id") REFERENCES "public"."comprobante"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comprobante_empresa_fecha_idx" ON "comprobante" USING btree ("empresa_id","fecha");--> statement-breakpoint
CREATE INDEX "comprobante_cliente_idx" ON "comprobante" USING btree ("cliente_id");--> statement-breakpoint
CREATE UNIQUE INDEX "comprobante_numero_uq" ON "comprobante" USING btree ("punto_venta_id","tipo_comprobante","numero") WHERE estado in ('emitiendo', 'autorizado', 'incierto');--> statement-breakpoint
CREATE UNIQUE INDEX "comprobante_en_vuelo_uq" ON "comprobante" USING btree ("punto_venta_id","tipo_comprobante") WHERE estado in ('emitiendo', 'incierto');--> statement-breakpoint
CREATE INDEX "comprobante_renglon_comprobante_idx" ON "comprobante_renglon" USING btree ("comprobante_id","orden");--> statement-breakpoint
-- RG 5.003: un Responsable Inscripto le factura A a los monotributistas. La semilla ya lo
-- tiene; esto corrige las bases sembradas antes.
UPDATE "regla_comprobante" SET "tipo_comprobante" = 1 WHERE "condicion_emisor" = 1 AND "condicion_receptor" IN (6, 13);
