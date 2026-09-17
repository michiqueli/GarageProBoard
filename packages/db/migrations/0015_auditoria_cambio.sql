CREATE TABLE "auditoria_cambio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"usuario_id" uuid,
	"tabla" text NOT NULL,
	"registro_id" uuid,
	"accion" text NOT NULL,
	"antes" jsonb,
	"despues" jsonb,
	"ip" text,
	"transaccion" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auditoria_cambio_accion_valida" CHECK ("auditoria_cambio"."accion" in ('alta', 'modificacion', 'baja'))
);
--> statement-breakpoint
ALTER TABLE "auditoria" ADD COLUMN "transaccion" text;--> statement-breakpoint
ALTER TABLE "auditoria_cambio" ADD CONSTRAINT "auditoria_cambio_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_cambio_fecha_idx" ON "auditoria_cambio" USING btree ("tenant_id","creado_en");--> statement-breakpoint
CREATE INDEX "auditoria_cambio_registro_idx" ON "auditoria_cambio" USING btree ("tenant_id","tabla","registro_id");--> statement-breakpoint
CREATE INDEX "auditoria_cambio_transaccion_idx" ON "auditoria_cambio" USING btree ("tenant_id","transaccion");--> statement-breakpoint
CREATE INDEX "auditoria_transaccion_idx" ON "auditoria" USING btree ("tenant_id","transaccion");