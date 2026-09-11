CREATE TABLE "usuario_atajo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"ambito" text NOT NULL,
	"accion" text NOT NULL,
	"tecla" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuario_atajo_accion_uq" UNIQUE("usuario_id","accion"),
	CONSTRAINT "usuario_atajo_tecla_uq" UNIQUE("usuario_id","ambito","tecla"),
	CONSTRAINT "usuario_atajo_ambito_coherente" CHECK ("usuario_atajo"."accion" like "usuario_atajo"."ambito" || '.%'),
	CONSTRAINT "usuario_atajo_tecla_permitida" CHECK ("usuario_atajo"."tecla" not in ('F11', 'F12', 'Tab', 'Shift+Tab',
                             'Ctrl+W', 'Ctrl+T', 'Ctrl+N',
                             'Ctrl+Shift+W', 'Ctrl+Shift+T', 'Ctrl+Shift+N'))
);
--> statement-breakpoint
CREATE TABLE "usuario_config" (
	"usuario_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tema" text DEFAULT 'sistema' NOT NULL,
	"densidad" text DEFAULT 'compacta' NOT NULL,
	"filas_por_pagina" integer DEFAULT 50 NOT NULL,
	"sucursal_predeterminada_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuario_config_tema_valido" CHECK ("usuario_config"."tema" in ('claro', 'oscuro', 'sistema')),
	CONSTRAINT "usuario_config_densidad_valida" CHECK ("usuario_config"."densidad" in ('compacta', 'comoda')),
	CONSTRAINT "usuario_config_filas_rango" CHECK ("usuario_config"."filas_por_pagina" between 10 and 200)
);
--> statement-breakpoint
ALTER TABLE "usuario_atajo" ADD CONSTRAINT "usuario_atajo_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_atajo" ADD CONSTRAINT "usuario_atajo_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_config" ADD CONSTRAINT "usuario_config_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_config" ADD CONSTRAINT "usuario_config_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_config" ADD CONSTRAINT "usuario_config_sucursal_predeterminada_id_sucursal_id_fk" FOREIGN KEY ("sucursal_predeterminada_id") REFERENCES "public"."sucursal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usuario_atajo_usuario_idx" ON "usuario_atajo" USING btree ("usuario_id");