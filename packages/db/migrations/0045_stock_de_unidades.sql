CREATE TABLE "cartera_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"traslado_entre_empresas" text NOT NULL,
	"reserva_modo" text NOT NULL,
	"reserva_dias" smallint,
	"reserva_exige_sena" boolean NOT NULL,
	"tenencia_usado" text NOT NULL,
	"moneda" text NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	CONSTRAINT "cartera_config_tenant_uq" UNIQUE("tenant_id"),
	CONSTRAINT "cartera_config_traslado_valido" CHECK ("cartera_config"."traslado_entre_empresas" in ('solo_ubicacion', 'con_comprobante')),
	CONSTRAINT "cartera_config_reserva_valida" CHECK ("cartera_config"."reserva_modo" in ('bloquea', 'avisa')),
	CONSTRAINT "cartera_config_dias_validos" CHECK ("cartera_config"."reserva_dias" is null or "cartera_config"."reserva_dias" between 1 and 365),
	CONSTRAINT "cartera_config_tenencia_valida" CHECK ("cartera_config"."tenencia_usado" in ('propia', 'consignacion')),
	CONSTRAINT "cartera_config_moneda_valida" CHECK ("cartera_config"."moneda" in ('ARS', 'USD'))
);
--> statement-breakpoint
CREATE TABLE "unidad" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"vehiculo_id" uuid NOT NULL,
	"condicion" text NOT NULL,
	"tenencia" text NOT NULL,
	"origen" text NOT NULL,
	"estado" text DEFAULT 'disponible' NOT NULL,
	"empresa_id" uuid,
	"consignante_id" uuid,
	"sucursal_id" uuid NOT NULL,
	"precio" numeric(18, 2),
	"moneda" text DEFAULT 'ARS' NOT NULL,
	"fecha_ingreso" date DEFAULT current_date NOT NULL,
	"observaciones" text,
	"retiro_motivo" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	CONSTRAINT "unidad_condicion_valida" CHECK ("unidad"."condicion" in ('0km', 'usado')),
	CONSTRAINT "unidad_tenencia_valida" CHECK ("unidad"."tenencia" in ('propia', 'consignacion')),
	CONSTRAINT "unidad_origen_valido" CHECK ("unidad"."origen" in ('fabrica', 'compra', 'parte_de_pago', 'consignacion', 'otro')),
	CONSTRAINT "unidad_estado_valido" CHECK ("unidad"."estado" in ('disponible', 'reservada', 'vendida', 'retirada')),
	CONSTRAINT "unidad_moneda_valida" CHECK ("unidad"."moneda" in ('ARS', 'USD')),
	CONSTRAINT "unidad_precio_no_negativo" CHECK ("unidad"."precio" is null or "unidad"."precio" >= 0),
	CONSTRAINT "unidad_dueno_valido" CHECK (("unidad"."tenencia" = 'propia' and "unidad"."empresa_id" is not null and "unidad"."consignante_id" is null)
          or ("unidad"."tenencia" = 'consignacion' and "unidad"."consignante_id" is not null and "unidad"."empresa_id" is null))
);
--> statement-breakpoint
CREATE TABLE "unidad_movimiento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"unidad_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"detalle" text NOT NULL,
	"comprobante" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	CONSTRAINT "unidad_movimiento_tipo_valido" CHECK ("unidad_movimiento"."tipo" in ('ingreso', 'traslado', 'reserva', 'liberacion', 'precio', 'retiro'))
);
--> statement-breakpoint
CREATE TABLE "unidad_reserva" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"unidad_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"estado" text DEFAULT 'activa' NOT NULL,
	"sena" numeric(18, 2),
	"moneda" text DEFAULT 'ARS' NOT NULL,
	"vence" date,
	"nota" text,
	"cierre_motivo" text,
	"cerrada_en" timestamp with time zone,
	"cerrada_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	CONSTRAINT "unidad_reserva_estado_valido" CHECK ("unidad_reserva"."estado" in ('activa', 'vencida', 'liberada', 'desplazada')),
	CONSTRAINT "unidad_reserva_sena_no_negativa" CHECK ("unidad_reserva"."sena" is null or "unidad_reserva"."sena" >= 0),
	CONSTRAINT "unidad_reserva_moneda_valida" CHECK ("unidad_reserva"."moneda" in ('ARS', 'USD'))
);
--> statement-breakpoint
ALTER TABLE "cartera_config" ADD CONSTRAINT "cartera_config_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cartera_config" ADD CONSTRAINT "cartera_config_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidad" ADD CONSTRAINT "unidad_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidad" ADD CONSTRAINT "unidad_vehiculo_id_vehiculo_id_fk" FOREIGN KEY ("vehiculo_id") REFERENCES "public"."vehiculo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidad" ADD CONSTRAINT "unidad_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidad" ADD CONSTRAINT "unidad_consignante_id_entidad_comercial_id_fk" FOREIGN KEY ("consignante_id") REFERENCES "public"."entidad_comercial"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidad" ADD CONSTRAINT "unidad_sucursal_id_sucursal_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidad" ADD CONSTRAINT "unidad_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidad_movimiento" ADD CONSTRAINT "unidad_movimiento_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidad_movimiento" ADD CONSTRAINT "unidad_movimiento_unidad_id_unidad_id_fk" FOREIGN KEY ("unidad_id") REFERENCES "public"."unidad"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidad_movimiento" ADD CONSTRAINT "unidad_movimiento_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidad_reserva" ADD CONSTRAINT "unidad_reserva_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidad_reserva" ADD CONSTRAINT "unidad_reserva_unidad_id_unidad_id_fk" FOREIGN KEY ("unidad_id") REFERENCES "public"."unidad"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidad_reserva" ADD CONSTRAINT "unidad_reserva_cliente_id_entidad_comercial_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."entidad_comercial"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidad_reserva" ADD CONSTRAINT "unidad_reserva_cerrada_por_usuario_id_fk" FOREIGN KEY ("cerrada_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidad_reserva" ADD CONSTRAINT "unidad_reserva_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unidad_en_stock_uq" ON "unidad" USING btree ("tenant_id","vehiculo_id") WHERE estado in ('disponible', 'reservada');--> statement-breakpoint
CREATE INDEX "unidad_estado_idx" ON "unidad" USING btree ("tenant_id","estado");--> statement-breakpoint
CREATE INDEX "unidad_sucursal_idx" ON "unidad" USING btree ("sucursal_id");--> statement-breakpoint
CREATE INDEX "unidad_movimiento_unidad_idx" ON "unidad_movimiento" USING btree ("unidad_id","creado_en");--> statement-breakpoint
CREATE INDEX "unidad_reserva_unidad_idx" ON "unidad_reserva" USING btree ("unidad_id","estado");