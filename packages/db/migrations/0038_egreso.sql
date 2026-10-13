ALTER TABLE "orden" ADD COLUMN "entregada_por" uuid;--> statement-breakpoint
ALTER TABLE "orden" ADD COLUMN "kilometraje_salida" integer;--> statement-breakpoint
ALTER TABLE "orden" ADD COLUMN "combustible_salida" text;--> statement-breakpoint
ALTER TABLE "orden" ADD COLUMN "inventario_salida" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "orden" ADD COLUMN "danios_egreso" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "orden" ADD COLUMN "sin_factura_autorizado_por" uuid;--> statement-breakpoint
ALTER TABLE "orden" ADD COLUMN "sin_factura_motivo" text;--> statement-breakpoint
ALTER TABLE "orden" ADD CONSTRAINT "orden_entregada_por_usuario_id_fk" FOREIGN KEY ("entregada_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden" ADD CONSTRAINT "orden_sin_factura_autorizado_por_usuario_id_fk" FOREIGN KEY ("sin_factura_autorizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden" ADD CONSTRAINT "orden_combustible_salida_valido" CHECK ("orden"."combustible_salida" is null or "orden"."combustible_salida" in ('vacio', 'cuarto', 'medio', 'tres_cuartos', 'lleno'));--> statement-breakpoint
ALTER TABLE "orden" ADD CONSTRAINT "orden_kilometraje_salida_positivo" CHECK ("orden"."kilometraje_salida" is null or "orden"."kilometraje_salida" >= 0);--> statement-breakpoint
ALTER TABLE "orden" ADD CONSTRAINT "orden_sin_factura_con_motivo" CHECK (("orden"."sin_factura_autorizado_por" is null) = ("orden"."sin_factura_motivo" is null));