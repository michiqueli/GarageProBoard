CREATE TABLE "repuesto_codigo_barras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"repuesto_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	CONSTRAINT "repuesto_codigo_barras_uq" UNIQUE("tenant_id","codigo"),
	CONSTRAINT "repuesto_codigo_barras_formato" CHECK ("repuesto_codigo_barras"."codigo" ~ '^[A-Z0-9./-]{4,64}$')
);
--> statement-breakpoint
ALTER TABLE "orden_item" ADD COLUMN "codigos_barras" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "pedido_repuestos_item" ADD COLUMN "codigos_barras" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "repuesto_codigo_barras" ADD CONSTRAINT "repuesto_codigo_barras_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repuesto_codigo_barras" ADD CONSTRAINT "repuesto_codigo_barras_repuesto_id_repuesto_id_fk" FOREIGN KEY ("repuesto_id") REFERENCES "public"."repuesto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repuesto_codigo_barras" ADD CONSTRAINT "repuesto_codigo_barras_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "repuesto_codigo_barras_repuesto_idx" ON "repuesto_codigo_barras" USING btree ("repuesto_id");