CREATE TABLE "visita" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"letra" text NOT NULL,
	"numero" integer NOT NULL,
	"origen" text NOT NULL,
	"motivo" text NOT NULL,
	"entidad_id" uuid,
	"nombre" text,
	"telefono" text,
	"derivada_a" uuid,
	"atendida_por" uuid,
	"atendida_en" timestamp with time zone,
	"cerrada_en" timestamp with time zone,
	"resultado" text,
	"orden_id" uuid,
	"nota" text,
	"creada_por" uuid,
	"llego_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visita_numero_uq" UNIQUE("sucursal_id","fecha","letra","numero"),
	CONSTRAINT "visita_motivo_valido" CHECK ("visita"."motivo" in ('servicio', 'venta', 'plan_ahorro', 'usados', 'repuestos', 'administracion', 'otro')),
	CONSTRAINT "visita_origen_valido" CHECK ("visita"."origen" in ('recepcion', 'totem')),
	CONSTRAINT "visita_resultado_valido" CHECK ("visita"."resultado" is null or "visita"."resultado" in ('atendida', 'se_fue', 'orden')),
	CONSTRAINT "visita_cierre_con_resultado" CHECK (("visita"."cerrada_en" is null) = ("visita"."resultado" is null)),
	CONSTRAINT "visita_orden_con_resultado" CHECK ("visita"."orden_id" is null or "visita"."resultado" = 'orden')
);
--> statement-breakpoint
CREATE TABLE "visita_secuencia" (
	"tenant_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"letra" text NOT NULL,
	"ultimo" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "visita_secuencia_sucursal_id_fecha_letra_pk" PRIMARY KEY("sucursal_id","fecha","letra")
);
--> statement-breakpoint
ALTER TABLE "visita" ADD CONSTRAINT "visita_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita" ADD CONSTRAINT "visita_sucursal_id_sucursal_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita" ADD CONSTRAINT "visita_entidad_id_entidad_comercial_id_fk" FOREIGN KEY ("entidad_id") REFERENCES "public"."entidad_comercial"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita" ADD CONSTRAINT "visita_derivada_a_empleado_id_fk" FOREIGN KEY ("derivada_a") REFERENCES "public"."empleado"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita" ADD CONSTRAINT "visita_atendida_por_usuario_id_fk" FOREIGN KEY ("atendida_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita" ADD CONSTRAINT "visita_orden_id_orden_id_fk" FOREIGN KEY ("orden_id") REFERENCES "public"."orden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita" ADD CONSTRAINT "visita_creada_por_usuario_id_fk" FOREIGN KEY ("creada_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_secuencia" ADD CONSTRAINT "visita_secuencia_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_secuencia" ADD CONSTRAINT "visita_secuencia_sucursal_id_sucursal_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visita_dia_idx" ON "visita" USING btree ("tenant_id","sucursal_id","fecha");