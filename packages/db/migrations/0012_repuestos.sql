CREATE TABLE "compra" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"numero" bigint NOT NULL,
	"estado" text DEFAULT 'pedida' NOT NULL,
	"proveedor_id" uuid NOT NULL,
	"comprobante_proveedor" text,
	"fecha_comprobante" date,
	"nota" text,
	"creado_por" uuid NOT NULL,
	"recibida_por" uuid,
	"recibida_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compra_numero_uq" UNIQUE("sucursal_id","numero"),
	CONSTRAINT "compra_estado_valido" CHECK ("compra"."estado" in ('pedida', 'recibida', 'anulada')),
	CONSTRAINT "compra_recibida_con_fecha" CHECK ("compra"."estado" <> 'recibida' or "compra"."recibida_en" is not null)
);
--> statement-breakpoint
CREATE TABLE "compra_renglon" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"compra_id" uuid NOT NULL,
	"orden" smallint NOT NULL,
	"repuesto_id" uuid NOT NULL,
	"cantidad" numeric(18, 4) NOT NULL,
	"costo_unitario" numeric(18, 4) DEFAULT '0' NOT NULL,
	"cantidad_recibida" numeric(18, 4),
	CONSTRAINT "compra_renglon_cantidad_positiva" CHECK ("compra_renglon"."cantidad" > 0),
	CONSTRAINT "compra_renglon_recibida_no_negativa" CHECK ("compra_renglon"."cantidad_recibida" is null or "compra_renglon"."cantidad_recibida" >= 0),
	CONSTRAINT "compra_renglon_costo_no_negativo" CHECK ("compra_renglon"."costo_unitario" >= 0)
);
--> statement-breakpoint
CREATE TABLE "movimiento_stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"repuesto_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"cantidad" numeric(18, 4) NOT NULL,
	"saldo" numeric(18, 4) NOT NULL,
	"costo_unitario" numeric(18, 4),
	"orden_id" uuid,
	"pedido_id" uuid,
	"compra_id" uuid,
	"otra_sucursal_id" uuid,
	"motivo" text,
	"usuario_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movimiento_stock_tipo_valido" CHECK ("movimiento_stock"."tipo" in ('inicial', 'ajuste', 'compra', 'orden', 'mostrador', 'transferencia')),
	CONSTRAINT "movimiento_stock_cantidad_no_cero" CHECK ("movimiento_stock"."cantidad" <> 0),
	CONSTRAINT "movimiento_stock_ajuste_con_motivo" CHECK ("movimiento_stock"."tipo" <> 'ajuste' or coalesce(trim("movimiento_stock"."motivo"), '') <> '')
);
--> statement-breakpoint
CREATE TABLE "pedido_repuestos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"numero" bigint NOT NULL,
	"estado" text DEFAULT 'abierto' NOT NULL,
	"chasis" text NOT NULL,
	"vehiculo_id" uuid,
	"orden_id" uuid,
	"cliente_id" uuid,
	"solicitante" text,
	"nota" text,
	"creado_por" uuid NOT NULL,
	"en_caja_en" timestamp with time zone,
	"entregado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pedido_repuestos_numero_uq" UNIQUE("sucursal_id","numero"),
	CONSTRAINT "pedido_repuestos_estado_valido" CHECK ("pedido_repuestos"."estado" in ('abierto', 'en_caja', 'facturado', 'entregado', 'anulado')),
	CONSTRAINT "pedido_repuestos_chasis_formato" CHECK ("pedido_repuestos"."chasis" ~ '^[A-HJ-NPR-Z0-9]{6,17}$'),
	CONSTRAINT "pedido_repuestos_orden_o_cliente" CHECK ("pedido_repuestos"."orden_id" is null or "pedido_repuestos"."cliente_id" is null),
	CONSTRAINT "pedido_repuestos_estado_segun_destino" CHECK (("pedido_repuestos"."orden_id" is not null and "pedido_repuestos"."estado" in ('abierto', 'entregado', 'anulado')) or ("pedido_repuestos"."orden_id" is null and "pedido_repuestos"."estado" in ('abierto', 'en_caja', 'facturado', 'anulado')))
);
--> statement-breakpoint
CREATE TABLE "pedido_repuestos_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"pedido_id" uuid NOT NULL,
	"orden" smallint NOT NULL,
	"repuesto_id" uuid,
	"codigo" text,
	"descripcion" text NOT NULL,
	"cantidad" numeric(18, 4) DEFAULT '1' NOT NULL,
	"precio_unitario" numeric(18, 4) DEFAULT '0' NOT NULL,
	"codigo_alicuota" smallint DEFAULT 5 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pedido_repuestos_item_cantidad_positiva" CHECK ("pedido_repuestos_item"."cantidad" > 0),
	CONSTRAINT "pedido_repuestos_item_precio_no_negativo" CHECK ("pedido_repuestos_item"."precio_unitario" >= 0)
);
--> statement-breakpoint
CREATE TABLE "repuesto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"descripcion" text NOT NULL,
	"marca" text,
	"rubro" text,
	"aplicacion" text,
	"precio_venta" numeric(18, 4) DEFAULT '0' NOT NULL,
	"costo" numeric(18, 4),
	"codigo_alicuota" smallint DEFAULT 5 NOT NULL,
	"proveedor_id" uuid,
	"activo" boolean DEFAULT true NOT NULL,
	"observaciones" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repuesto_codigo_uq" UNIQUE("tenant_id","codigo"),
	CONSTRAINT "repuesto_codigo_formato" CHECK ("repuesto"."codigo" ~ '^[A-Z0-9./]{2,40}$'),
	CONSTRAINT "repuesto_precio_no_negativo" CHECK ("repuesto"."precio_venta" >= 0),
	CONSTRAINT "repuesto_costo_no_negativo" CHECK ("repuesto"."costo" is null or "repuesto"."costo" >= 0)
);
--> statement-breakpoint
CREATE TABLE "repuesto_stock" (
	"tenant_id" uuid NOT NULL,
	"repuesto_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"cantidad" numeric(18, 4) DEFAULT '0' NOT NULL,
	"minimo" numeric(18, 4),
	"ubicacion" text,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repuesto_stock_sucursal_id_repuesto_id_pk" PRIMARY KEY("sucursal_id","repuesto_id")
);
--> statement-breakpoint
CREATE TABLE "repuestos_secuencia" (
	"tenant_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"ultimo" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "repuestos_secuencia_sucursal_id_tipo_pk" PRIMARY KEY("sucursal_id","tipo"),
	CONSTRAINT "repuestos_secuencia_tipo_valido" CHECK ("repuestos_secuencia"."tipo" in ('pedido', 'compra'))
);
--> statement-breakpoint
ALTER TABLE "comprobante" ADD COLUMN "pedido_repuestos_id" uuid;--> statement-breakpoint
ALTER TABLE "orden_item" ADD COLUMN "repuesto_id" uuid;--> statement-breakpoint
ALTER TABLE "compra" ADD CONSTRAINT "compra_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra" ADD CONSTRAINT "compra_sucursal_id_sucursal_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra" ADD CONSTRAINT "compra_proveedor_id_proveedor_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra" ADD CONSTRAINT "compra_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra" ADD CONSTRAINT "compra_recibida_por_usuario_id_fk" FOREIGN KEY ("recibida_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra_renglon" ADD CONSTRAINT "compra_renglon_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra_renglon" ADD CONSTRAINT "compra_renglon_compra_id_compra_id_fk" FOREIGN KEY ("compra_id") REFERENCES "public"."compra"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra_renglon" ADD CONSTRAINT "compra_renglon_repuesto_id_repuesto_id_fk" FOREIGN KEY ("repuesto_id") REFERENCES "public"."repuesto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_stock_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_stock_repuesto_id_repuesto_id_fk" FOREIGN KEY ("repuesto_id") REFERENCES "public"."repuesto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_stock_sucursal_id_sucursal_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_stock_orden_id_orden_id_fk" FOREIGN KEY ("orden_id") REFERENCES "public"."orden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_stock_pedido_id_pedido_repuestos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedido_repuestos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_stock_compra_id_compra_id_fk" FOREIGN KEY ("compra_id") REFERENCES "public"."compra"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_stock_otra_sucursal_id_sucursal_id_fk" FOREIGN KEY ("otra_sucursal_id") REFERENCES "public"."sucursal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_stock_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_repuestos" ADD CONSTRAINT "pedido_repuestos_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_repuestos" ADD CONSTRAINT "pedido_repuestos_sucursal_id_sucursal_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_repuestos" ADD CONSTRAINT "pedido_repuestos_vehiculo_id_vehiculo_id_fk" FOREIGN KEY ("vehiculo_id") REFERENCES "public"."vehiculo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_repuestos" ADD CONSTRAINT "pedido_repuestos_orden_id_orden_id_fk" FOREIGN KEY ("orden_id") REFERENCES "public"."orden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_repuestos" ADD CONSTRAINT "pedido_repuestos_cliente_id_entidad_comercial_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."entidad_comercial"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_repuestos" ADD CONSTRAINT "pedido_repuestos_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_repuestos_item" ADD CONSTRAINT "pedido_repuestos_item_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_repuestos_item" ADD CONSTRAINT "pedido_repuestos_item_pedido_id_pedido_repuestos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedido_repuestos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_repuestos_item" ADD CONSTRAINT "pedido_repuestos_item_repuesto_id_repuesto_id_fk" FOREIGN KEY ("repuesto_id") REFERENCES "public"."repuesto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repuesto" ADD CONSTRAINT "repuesto_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repuesto" ADD CONSTRAINT "repuesto_proveedor_id_proveedor_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repuesto_stock" ADD CONSTRAINT "repuesto_stock_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repuesto_stock" ADD CONSTRAINT "repuesto_stock_repuesto_id_repuesto_id_fk" FOREIGN KEY ("repuesto_id") REFERENCES "public"."repuesto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repuesto_stock" ADD CONSTRAINT "repuesto_stock_sucursal_id_sucursal_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repuestos_secuencia" ADD CONSTRAINT "repuestos_secuencia_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repuestos_secuencia" ADD CONSTRAINT "repuestos_secuencia_sucursal_id_sucursal_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compra_estado_idx" ON "compra" USING btree ("sucursal_id","estado");--> statement-breakpoint
CREATE INDEX "compra_renglon_compra_idx" ON "compra_renglon" USING btree ("compra_id","orden");--> statement-breakpoint
CREATE INDEX "movimiento_stock_repuesto_idx" ON "movimiento_stock" USING btree ("repuesto_id","sucursal_id","creado_en");--> statement-breakpoint
CREATE INDEX "pedido_repuestos_estado_idx" ON "pedido_repuestos" USING btree ("sucursal_id","estado");--> statement-breakpoint
CREATE INDEX "pedido_repuestos_orden_idx" ON "pedido_repuestos" USING btree ("orden_id");--> statement-breakpoint
CREATE INDEX "pedido_repuestos_item_pedido_idx" ON "pedido_repuestos_item" USING btree ("pedido_id","orden");--> statement-breakpoint
CREATE INDEX "repuesto_descripcion_idx" ON "repuesto" USING btree ("tenant_id","descripcion");--> statement-breakpoint
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_pedido_repuestos_id_pedido_repuestos_id_fk" FOREIGN KEY ("pedido_repuestos_id") REFERENCES "public"."pedido_repuestos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_item" ADD CONSTRAINT "orden_item_repuesto_id_repuesto_id_fk" FOREIGN KEY ("repuesto_id") REFERENCES "public"."repuesto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comprobante_pedido_repuestos_uq" ON "comprobante" USING btree ("pedido_repuestos_id") WHERE estado in ('emitiendo', 'autorizado', 'incierto') and pedido_repuestos_id is not null and comprobante_asociado_id is null;