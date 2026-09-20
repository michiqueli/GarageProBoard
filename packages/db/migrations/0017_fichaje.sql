CREATE TABLE "estacion_fichaje" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text NOT NULL,
	"token_hash" text NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"ultimo_visto_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "estacion_token_uq" UNIQUE("token_hash"),
	CONSTRAINT "estacion_tipo_valido" CHECK ("estacion_fichaje"."tipo" in ('taller', 'reloj'))
);
--> statement-breakpoint
CREATE TABLE "evento_escaneo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"estacion_id" uuid,
	"codigo_crudo" text NOT NULL,
	"tipo_detectado" text,
	"empleado_id" uuid,
	"orden_id" uuid,
	"resultado" text NOT NULL,
	"accion" text,
	"mensaje" text,
	"latencia_ms" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evento_escaneo_resultado_valido" CHECK ("evento_escaneo"."resultado" in ('ok', 'rechazado', 'error'))
);
--> statement-breakpoint
CREATE TABLE "jornada" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empleado_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"entrada" timestamp with time zone,
	"salida" timestamp with time zone,
	"fuente" text DEFAULT 'escaneo' NOT NULL,
	"estacion_entrada_id" uuid,
	"estacion_salida_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jornada_fuente_valida" CHECK ("jornada"."fuente" in ('escaneo', 'manual', 'auto')),
	CONSTRAINT "jornada_salida_despues" CHECK ("jornada"."salida" is null or "jornada"."entrada" is null or "jornada"."salida" >= "jornada"."entrada")
);
--> statement-breakpoint
CREATE TABLE "sesion_trabajo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"orden_id" uuid NOT NULL,
	"empleado_id" uuid NOT NULL,
	"inicio" timestamp with time zone DEFAULT now() NOT NULL,
	"fin" timestamp with time zone,
	"duracion_seg" integer GENERATED ALWAYS AS ((extract(epoch from (fin - inicio)))::int) STORED,
	"cerrada_por" text,
	"estacion_inicio_id" uuid,
	"estacion_fin_id" uuid,
	"nota" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sesion_trabajo_cierre_valido" CHECK ("sesion_trabajo"."cerrada_por" in ('mecanico', 'auto', 'jefe')),
	CONSTRAINT "sesion_trabajo_fin_despues" CHECK ("sesion_trabajo"."fin" is null or "sesion_trabajo"."fin" >= "sesion_trabajo"."inicio")
);
--> statement-breakpoint
ALTER TABLE "estacion_fichaje" ADD CONSTRAINT "estacion_fichaje_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estacion_fichaje" ADD CONSTRAINT "estacion_fichaje_sucursal_id_sucursal_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_escaneo" ADD CONSTRAINT "evento_escaneo_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_escaneo" ADD CONSTRAINT "evento_escaneo_estacion_id_estacion_fichaje_id_fk" FOREIGN KEY ("estacion_id") REFERENCES "public"."estacion_fichaje"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_escaneo" ADD CONSTRAINT "evento_escaneo_empleado_id_empleado_id_fk" FOREIGN KEY ("empleado_id") REFERENCES "public"."empleado"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_escaneo" ADD CONSTRAINT "evento_escaneo_orden_id_orden_id_fk" FOREIGN KEY ("orden_id") REFERENCES "public"."orden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jornada" ADD CONSTRAINT "jornada_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jornada" ADD CONSTRAINT "jornada_empleado_id_empleado_id_fk" FOREIGN KEY ("empleado_id") REFERENCES "public"."empleado"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jornada" ADD CONSTRAINT "jornada_estacion_entrada_id_estacion_fichaje_id_fk" FOREIGN KEY ("estacion_entrada_id") REFERENCES "public"."estacion_fichaje"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jornada" ADD CONSTRAINT "jornada_estacion_salida_id_estacion_fichaje_id_fk" FOREIGN KEY ("estacion_salida_id") REFERENCES "public"."estacion_fichaje"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesion_trabajo" ADD CONSTRAINT "sesion_trabajo_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesion_trabajo" ADD CONSTRAINT "sesion_trabajo_orden_id_orden_id_fk" FOREIGN KEY ("orden_id") REFERENCES "public"."orden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesion_trabajo" ADD CONSTRAINT "sesion_trabajo_empleado_id_empleado_id_fk" FOREIGN KEY ("empleado_id") REFERENCES "public"."empleado"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesion_trabajo" ADD CONSTRAINT "sesion_trabajo_estacion_inicio_id_estacion_fichaje_id_fk" FOREIGN KEY ("estacion_inicio_id") REFERENCES "public"."estacion_fichaje"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesion_trabajo" ADD CONSTRAINT "sesion_trabajo_estacion_fin_id_estacion_fichaje_id_fk" FOREIGN KEY ("estacion_fin_id") REFERENCES "public"."estacion_fichaje"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "estacion_sucursal_idx" ON "estacion_fichaje" USING btree ("tenant_id","sucursal_id");--> statement-breakpoint
CREATE INDEX "evento_escaneo_fecha_idx" ON "evento_escaneo" USING btree ("tenant_id","creado_en");--> statement-breakpoint
CREATE INDEX "evento_escaneo_empleado_idx" ON "evento_escaneo" USING btree ("tenant_id","empleado_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jornada_empleado_fecha_uq" ON "jornada" USING btree ("empleado_id","fecha");--> statement-breakpoint
CREATE INDEX "jornada_fecha_idx" ON "jornada" USING btree ("tenant_id","fecha");--> statement-breakpoint
CREATE INDEX "sesion_trabajo_abierta_idx" ON "sesion_trabajo" USING btree ("empleado_id") WHERE "sesion_trabajo"."fin" is null;--> statement-breakpoint
CREATE INDEX "sesion_trabajo_orden_idx" ON "sesion_trabajo" USING btree ("orden_id");--> statement-breakpoint
CREATE INDEX "sesion_trabajo_rango_idx" ON "sesion_trabajo" USING btree ("tenant_id","empleado_id","inicio");