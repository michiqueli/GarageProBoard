CREATE TABLE "agenda_cupo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"minutos_franja" smallint NOT NULL,
	"cupo" smallint NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	CONSTRAINT "agenda_cupo_sucursal_uq" UNIQUE("tenant_id","sucursal_id"),
	CONSTRAINT "agenda_cupo_franja_valida" CHECK ("agenda_cupo"."minutos_franja" in (15, 30, 60, 120)),
	CONSTRAINT "agenda_cupo_cupo_valido" CHECK ("agenda_cupo"."cupo" between 1 and 50)
);
--> statement-breakpoint
ALTER TABLE "turno" ADD COLUMN "sobreturno" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agenda_cupo" ADD CONSTRAINT "agenda_cupo_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_cupo" ADD CONSTRAINT "agenda_cupo_sucursal_id_sucursal_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_cupo" ADD CONSTRAINT "agenda_cupo_actualizado_por_usuario_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;