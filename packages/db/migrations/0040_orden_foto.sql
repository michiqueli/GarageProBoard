CREATE TABLE "orden_foto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"orden_id" uuid NOT NULL,
	"momento" text NOT NULL,
	"nota" text,
	"ruta" text NOT NULL,
	"tipo" text NOT NULL,
	"ancho" integer NOT NULL,
	"alto" integer NOT NULL,
	"bytes" integer NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"borrada_en" timestamp with time zone,
	"borrada_por" uuid,
	CONSTRAINT "orden_foto_momento_valido" CHECK ("orden_foto"."momento" in ('ingreso', 'egreso')),
	CONSTRAINT "orden_foto_tipo_valido" CHECK ("orden_foto"."tipo" in ('image/jpeg', 'image/png'))
);
--> statement-breakpoint
ALTER TABLE "orden_foto" ADD CONSTRAINT "orden_foto_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_foto" ADD CONSTRAINT "orden_foto_orden_id_orden_id_fk" FOREIGN KEY ("orden_id") REFERENCES "public"."orden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_foto" ADD CONSTRAINT "orden_foto_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_foto" ADD CONSTRAINT "orden_foto_borrada_por_usuario_id_fk" FOREIGN KEY ("borrada_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orden_foto_orden_idx" ON "orden_foto" USING btree ("orden_id");