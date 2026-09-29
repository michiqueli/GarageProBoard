CREATE TABLE "hoja_imagen" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"vista" text NOT NULL,
	"ruta" text NOT NULL,
	"formato" text NOT NULL,
	"ancho" integer NOT NULL,
	"alto" integer NOT NULL,
	"bytes" integer NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"reemplazada_en" timestamp with time zone,
	CONSTRAINT "hoja_imagen_tipo_valido" CHECK ("hoja_imagen"."tipo" in ('sedan', 'hatchback', 'pickup')),
	CONSTRAINT "hoja_imagen_vista_valida" CHECK ("hoja_imagen"."vista" in ('frente', 'atras', 'izquierda', 'derecha', 'arriba')),
	CONSTRAINT "hoja_imagen_formato_valido" CHECK ("hoja_imagen"."formato" in ('image/png', 'image/jpeg')),
	CONSTRAINT "hoja_imagen_medidas_positivas" CHECK ("hoja_imagen"."ancho" > 0 and "hoja_imagen"."alto" > 0 and "hoja_imagen"."bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "hoja_imagen" ADD CONSTRAINT "hoja_imagen_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hoja_imagen" ADD CONSTRAINT "hoja_imagen_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hoja_imagen_vigente_uq" ON "hoja_imagen" USING btree ("tenant_id","tipo","vista") WHERE reemplazada_en is null;