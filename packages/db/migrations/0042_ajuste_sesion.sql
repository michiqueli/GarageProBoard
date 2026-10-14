CREATE TABLE "ajuste_sesion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sesion_id" uuid NOT NULL,
	"inicio_antes" timestamp with time zone NOT NULL,
	"fin_antes" timestamp with time zone,
	"inicio_despues" timestamp with time zone NOT NULL,
	"fin_despues" timestamp with time zone NOT NULL,
	"motivo" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	CONSTRAINT "ajuste_sesion_motivo_valido" CHECK (length(btrim("ajuste_sesion"."motivo")) >= 5),
	CONSTRAINT "ajuste_sesion_rango_valido" CHECK ("ajuste_sesion"."fin_despues" > "ajuste_sesion"."inicio_despues")
);
--> statement-breakpoint
ALTER TABLE "ajuste_sesion" ADD CONSTRAINT "ajuste_sesion_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajuste_sesion" ADD CONSTRAINT "ajuste_sesion_sesion_id_sesion_trabajo_id_fk" FOREIGN KEY ("sesion_id") REFERENCES "public"."sesion_trabajo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajuste_sesion" ADD CONSTRAINT "ajuste_sesion_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ajuste_sesion_sesion_idx" ON "ajuste_sesion" USING btree ("sesion_id");