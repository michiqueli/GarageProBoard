CREATE TABLE "vehiculo_pendiente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"vehiculo_id" uuid NOT NULL,
	"orden_id" uuid NOT NULL,
	"origen" text NOT NULL,
	"descripcion" text NOT NULL,
	"semaforo" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"resuelto_en" timestamp with time zone,
	"resolucion" text,
	"resuelto_orden_id" uuid,
	"motivo" text,
	"resuelto_por" uuid,
	CONSTRAINT "vehiculo_pendiente_origen_valido" CHECK ("vehiculo_pendiente"."origen" in ('presupuesto', 'revision')),
	CONSTRAINT "vehiculo_pendiente_semaforo_valido" CHECK ("vehiculo_pendiente"."semaforo" is null or "vehiculo_pendiente"."semaforo" in ('ambar', 'rojo')),
	CONSTRAINT "vehiculo_pendiente_resolucion_valida" CHECK (("vehiculo_pendiente"."resuelto_en" is null and "vehiculo_pendiente"."resolucion" is null) or ("vehiculo_pendiente"."resuelto_en" is not null and "vehiculo_pendiente"."resolucion" in ('en_orden', 'descartado'))),
	CONSTRAINT "vehiculo_pendiente_descarte_con_motivo" CHECK ("vehiculo_pendiente"."resolucion" is distinct from 'descartado' or "vehiculo_pendiente"."motivo" is not null)
);
--> statement-breakpoint
ALTER TABLE "vehiculo_pendiente" ADD CONSTRAINT "vehiculo_pendiente_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehiculo_pendiente" ADD CONSTRAINT "vehiculo_pendiente_vehiculo_id_vehiculo_id_fk" FOREIGN KEY ("vehiculo_id") REFERENCES "public"."vehiculo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehiculo_pendiente" ADD CONSTRAINT "vehiculo_pendiente_orden_id_orden_id_fk" FOREIGN KEY ("orden_id") REFERENCES "public"."orden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehiculo_pendiente" ADD CONSTRAINT "vehiculo_pendiente_resuelto_orden_id_orden_id_fk" FOREIGN KEY ("resuelto_orden_id") REFERENCES "public"."orden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehiculo_pendiente" ADD CONSTRAINT "vehiculo_pendiente_resuelto_por_usuario_id_fk" FOREIGN KEY ("resuelto_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vehiculo_pendiente_vehiculo_idx" ON "vehiculo_pendiente" USING btree ("vehiculo_id") WHERE resuelto_en is null;