CREATE TABLE "orden_presupuesto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"orden_id" uuid NOT NULL,
	"numero" smallint NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"total" numeric(18, 2) NOT NULL,
	"enviado_a" text,
	"creado_por" uuid NOT NULL,
	"autoriza_nombre" text,
	"autoriza_medio" text,
	"nota" text,
	"respondido_por" uuid,
	"respondido_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orden_presupuesto_numero_uq" UNIQUE("orden_id","numero"),
	CONSTRAINT "orden_presupuesto_estado_valido" CHECK ("orden_presupuesto"."estado" in ('pendiente', 'respondido')),
	CONSTRAINT "orden_presupuesto_medio_valido" CHECK ("orden_presupuesto"."autoriza_medio" is null or "orden_presupuesto"."autoriza_medio" in ('presencial', 'telefono', 'whatsapp', 'mail')),
	CONSTRAINT "orden_presupuesto_respuesta_completa" CHECK ("orden_presupuesto"."estado" <> 'respondido' or ("orden_presupuesto"."respondido_en" is not null and "orden_presupuesto"."autoriza_nombre" is not null and "orden_presupuesto"."autoriza_medio" is not null))
);
--> statement-breakpoint
ALTER TABLE "orden" ADD COLUMN "autoriza_nombre" text;--> statement-breakpoint
ALTER TABLE "orden" ADD COLUMN "autoriza_telefono" text;--> statement-breakpoint
ALTER TABLE "orden_item" ADD COLUMN "autorizacion" text;--> statement-breakpoint
ALTER TABLE "orden_item" ADD COLUMN "presupuesto_id" uuid;--> statement-breakpoint
ALTER TABLE "orden_presupuesto" ADD CONSTRAINT "orden_presupuesto_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_presupuesto" ADD CONSTRAINT "orden_presupuesto_orden_id_orden_id_fk" FOREIGN KEY ("orden_id") REFERENCES "public"."orden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_presupuesto" ADD CONSTRAINT "orden_presupuesto_creado_por_usuario_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_presupuesto" ADD CONSTRAINT "orden_presupuesto_respondido_por_usuario_id_fk" FOREIGN KEY ("respondido_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_item" ADD CONSTRAINT "orden_item_presupuesto_id_orden_presupuesto_id_fk" FOREIGN KEY ("presupuesto_id") REFERENCES "public"."orden_presupuesto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_item" ADD CONSTRAINT "orden_item_autorizacion_valida" CHECK ("orden_item"."autorizacion" is null or "orden_item"."autorizacion" in ('pendiente', 'autorizado', 'rechazado'));--> statement-breakpoint
ALTER TABLE "orden_item" ADD CONSTRAINT "orden_item_autorizacion_con_presupuesto" CHECK (("orden_item"."autorizacion" is null) = ("orden_item"."presupuesto_id" is null));