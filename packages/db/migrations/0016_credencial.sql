CREATE TABLE "credencial" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empleado_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"emitida_en" timestamp with time zone DEFAULT now() NOT NULL,
	"revocada_en" timestamp with time zone,
	"motivo_revocacion" text,
	CONSTRAINT "credencial_codigo_uq" UNIQUE("codigo"),
	CONSTRAINT "credencial_codigo_formato" CHECK ("credencial"."codigo" ~ '^[0-9A-HJKMNP-TV-Z]{8}$'),
	CONSTRAINT "credencial_revocacion_con_motivo" CHECK (("credencial"."revocada_en" is null) = ("credencial"."motivo_revocacion" is null))
);
--> statement-breakpoint
ALTER TABLE "orden" DROP CONSTRAINT "orden_mecanico_id_usuario_id_fk";
--> statement-breakpoint
ALTER TABLE "usuario" ADD COLUMN "empleado_id" uuid;--> statement-breakpoint
ALTER TABLE "empleado" ADD COLUMN "puesto" text DEFAULT 'otro' NOT NULL;--> statement-breakpoint
ALTER TABLE "credencial" ADD CONSTRAINT "credencial_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credencial" ADD CONSTRAINT "credencial_empleado_id_empleado_id_fk" FOREIGN KEY ("empleado_id") REFERENCES "public"."empleado"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credencial_vigente_uq" ON "credencial" USING btree ("empleado_id") WHERE "credencial"."revocada_en" is null;--> statement-breakpoint
CREATE INDEX "credencial_empleado_idx" ON "credencial" USING btree ("tenant_id","empleado_id");--> statement-breakpoint
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_empleado_id_empleado_id_fk" FOREIGN KEY ("empleado_id") REFERENCES "public"."empleado"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- El mecanico de una orden pasa de ser un usuario del sistema a ser un empleado, que es
-- el mismo que ficha con su credencial. Los mecanicos que habia asignados apuntaban a
-- usuario.id y no existe forma honesta de convertirlos: un empleado necesita su identidad
-- fiscal (documento, razon social), que un usuario no tiene. Se sueltan, y la orden queda
-- sin mecanico asignado hasta que alguien lo elija del personal.
UPDATE "orden" SET "mecanico_id" = NULL WHERE "mecanico_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "orden" ADD CONSTRAINT "orden_mecanico_id_empleado_id_fk" FOREIGN KEY ("mecanico_id") REFERENCES "public"."empleado"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_empleado_uq" UNIQUE("empleado_id");--> statement-breakpoint
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_puesto_valido" CHECK ("empleado"."puesto" in ('mecanico', 'asesor', 'repuestero', 'cajero', 'administrativo', 'lavador', 'chofer', 'vendedor', 'gerente', 'otro'));