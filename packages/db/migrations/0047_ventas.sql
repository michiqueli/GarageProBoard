CREATE TABLE "venta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"numero" bigint NOT NULL,
	"unidad_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"vendedor_id" uuid,
	"sucursal_id" uuid NOT NULL,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"precio" numeric(18, 2) NOT NULL,
	"moneda" text NOT NULL,
	"fecha" date DEFAULT current_date NOT NULL,
	"observaciones" text,
	"autorizacion_motivo" text,
	"autorizada_por" uuid,
	"confirmada_en" timestamp with time zone,
	"anulacion_motivo" text,
	"anulada_en" timestamp with time zone,
	"anulada_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venta_numero_uq" UNIQUE("tenant_id","numero"),
	CONSTRAINT "venta_estado_valido" CHECK ("venta"."estado" in ('borrador', 'confirmada', 'anulada')),
	CONSTRAINT "venta_moneda_valida" CHECK ("venta"."moneda" in ('ARS', 'USD')),
	CONSTRAINT "venta_precio_no_negativo" CHECK ("venta"."precio" >= 0)
);
--> statement-breakpoint
CREATE TABLE "venta_concepto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"venta_id" uuid NOT NULL,
	"orden" smallint NOT NULL,
	"tipo" text NOT NULL,
	"descripcion" text NOT NULL,
	"importe" numeric(18, 2) NOT NULL,
	"moneda" text NOT NULL,
	"cotizacion" numeric(18, 4),
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venta_concepto_tipo_valido" CHECK ("venta_concepto"."tipo" in ('gasto_cliente', 'descuento', 'costo_venta')),
	CONSTRAINT "venta_concepto_importe_positivo" CHECK ("venta_concepto"."importe" > 0),
	CONSTRAINT "venta_concepto_moneda_valida" CHECK ("venta_concepto"."moneda" in ('ARS', 'USD'))
);
--> statement-breakpoint
CREATE TABLE "venta_pago" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"venta_id" uuid NOT NULL,
	"orden" smallint NOT NULL,
	"medio" text NOT NULL,
	"importe" numeric(18, 2) NOT NULL,
	"moneda" text NOT NULL,
	"cotizacion" numeric(18, 4),
	"detalle" text,
	"entidad" text,
	"cuotas" smallint,
	"unidad_usada_id" uuid,
	"reserva_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venta_pago_medio_valido" CHECK ("venta_pago"."medio" in ('efectivo', 'transferencia', 'cheque', 'tarjeta', 'financiacion', 'usado', 'sena', 'otro')),
	CONSTRAINT "venta_pago_importe_positivo" CHECK ("venta_pago"."importe" > 0),
	CONSTRAINT "venta_pago_moneda_valida" CHECK ("venta_pago"."moneda" in ('ARS', 'USD')),
	CONSTRAINT "venta_pago_cuotas_validas" CHECK ("venta_pago"."cuotas" is null or "venta_pago"."cuotas" between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "venta_secuencia" (
	"tenant_id" uuid NOT NULL,
	"ultimo" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "venta_secuencia_tenant_id_pk" PRIMARY KEY("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "ventas_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"descuento_maximo" numeric(5, 2),
	"exige_saldo_cero" boolean NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	CONSTRAINT "ventas_config_tenant_uq" UNIQUE("tenant_id"),
	CONSTRAINT "ventas_config_descuento_valido" CHECK ("ventas_config"."descuento_maximo" is null or "ventas_config"."descuento_maximo" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "unidad_movimiento" DROP CONSTRAINT "unidad_movimiento_tipo_valido";--> statement-breakpoint
ALTER TABLE "unidad_reserva" DROP CONSTRAINT "unidad_reserva_estado_valido";--> statement-breakpoint
ALTER TABLE "venta" ADD CONSTRAINT "venta_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venta" ADD CONSTRAINT "venta_unidad_id_unidad_id_fk" FOREIGN KEY ("unidad_id") REFERENCES "public"."unidad"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venta" ADD CONSTRAINT "venta_cliente_id_entidad_comercial_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."entidad_comercial"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venta" ADD CONSTRAINT "venta_vendedor_id_usuario_id_fk" FOREIGN KEY ("vendedor_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venta" ADD CONSTRAINT "venta_sucursal_id_sucursal_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venta" ADD CONSTRAINT "venta_autorizada_por_usuario_id_fk" FOREIGN KEY ("autorizada_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venta" ADD CONSTRAINT "venta_anulada_por_usuario_id_fk" FOREIGN KEY ("anulada_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venta_concepto" ADD CONSTRAINT "venta_concepto_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venta_concepto" ADD CONSTRAINT "venta_concepto_venta_id_venta_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."venta"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venta_pago" ADD CONSTRAINT "venta_pago_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venta_pago" ADD CONSTRAINT "venta_pago_venta_id_venta_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."venta"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venta_pago" ADD CONSTRAINT "venta_pago_unidad_usada_id_unidad_id_fk" FOREIGN KEY ("unidad_usada_id") REFERENCES "public"."unidad"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venta_pago" ADD CONSTRAINT "venta_pago_reserva_id_unidad_reserva_id_fk" FOREIGN KEY ("reserva_id") REFERENCES "public"."unidad_reserva"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venta_secuencia" ADD CONSTRAINT "venta_secuencia_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas_config" ADD CONSTRAINT "ventas_config_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas_config" ADD CONSTRAINT "ventas_config_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "venta_unidad_viva_uq" ON "venta" USING btree ("unidad_id") WHERE estado <> 'anulada';--> statement-breakpoint
CREATE INDEX "venta_estado_idx" ON "venta" USING btree ("tenant_id","estado");--> statement-breakpoint
CREATE INDEX "venta_concepto_venta_idx" ON "venta_concepto" USING btree ("venta_id","orden");--> statement-breakpoint
CREATE INDEX "venta_pago_venta_idx" ON "venta_pago" USING btree ("venta_id","orden");--> statement-breakpoint
ALTER TABLE "unidad_movimiento" ADD CONSTRAINT "unidad_movimiento_tipo_valido" CHECK ("unidad_movimiento"."tipo" in ('ingreso', 'traslado', 'reserva', 'liberacion', 'precio', 'retiro', 'venta'));--> statement-breakpoint
ALTER TABLE "unidad_reserva" ADD CONSTRAINT "unidad_reserva_estado_valido" CHECK ("unidad_reserva"."estado" in ('activa', 'vencida', 'liberada', 'desplazada', 'convertida'));