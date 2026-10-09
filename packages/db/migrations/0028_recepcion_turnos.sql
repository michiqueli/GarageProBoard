CREATE TABLE "turno" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"fecha_hora" timestamp with time zone NOT NULL,
	"vehiculo_id" uuid,
	"dominio" text,
	"entidad_id" uuid,
	"nombre" text,
	"telefono" text,
	"pedido" text NOT NULL,
	"asesor_id" uuid,
	"estado" text DEFAULT 'agendado' NOT NULL,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "turno_estado_valido" CHECK ("turno"."estado" in ('agendado', 'llego', 'ausente', 'cancelado')),
	CONSTRAINT "turno_pedido_valido" CHECK (length(btrim("turno"."pedido")) between 3 and 500)
);
--> statement-breakpoint
ALTER TABLE "visita" ADD COLUMN "turno_id" uuid;--> statement-breakpoint
ALTER TABLE "turno" ADD CONSTRAINT "turno_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turno" ADD CONSTRAINT "turno_sucursal_id_sucursal_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turno" ADD CONSTRAINT "turno_vehiculo_id_vehiculo_id_fk" FOREIGN KEY ("vehiculo_id") REFERENCES "public"."vehiculo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turno" ADD CONSTRAINT "turno_entidad_id_entidad_comercial_id_fk" FOREIGN KEY ("entidad_id") REFERENCES "public"."entidad_comercial"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turno" ADD CONSTRAINT "turno_asesor_id_empleado_id_fk" FOREIGN KEY ("asesor_id") REFERENCES "public"."empleado"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turno" ADD CONSTRAINT "turno_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "turno_fecha_idx" ON "turno" USING btree ("tenant_id","sucursal_id","fecha_hora");--> statement-breakpoint
ALTER TABLE "visita" ADD CONSTRAINT "visita_turno_id_turno_id_fk" FOREIGN KEY ("turno_id") REFERENCES "public"."turno"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "visita_turno_uq" ON "visita" USING btree ("turno_id") WHERE turno_id is not null;