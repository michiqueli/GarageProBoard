ALTER TABLE "rol" ADD COLUMN "predefinido" text;--> statement-breakpoint
ALTER TABLE "rol" ADD COLUMN "version_sistema" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "rol_predefinido_uq" ON "rol" USING btree ("tenant_id","predefinido") WHERE "rol"."predefinido" is not null;--> statement-breakpoint
-- Los roles de las concesionarias que ya existían se reconocen por el nombre con el que se
-- sembraron, y se toman como intactos: todavía no hay ninguna concesionaria de verdad, y en
-- las de prueba lo que importa es que les llegue lo que les faltaba —al Asesor, la
-- recepción—, y la sincronización que corre después de las migraciones se lo aplica.
UPDATE "rol" SET
  "predefinido" = v.clave,
  "version_sistema" = "rol"."habilidades"
FROM (VALUES
  ('Gerente', 'gerente'),
  ('Asesor de servicios', 'asesor'),
  ('Mecánico', 'mecanico'),
  ('Cajero', 'cajero'),
  ('Repuestero', 'repuestero'),
  ('Administrativo', 'administrativo'),
  ('Recepcionista', 'recepcionista'),
  ('Vendedor', 'vendedor'),
  ('Administrador de sistema', 'administrador-sistema')
) AS v(nombre, clave)
WHERE "rol"."nombre" = v.nombre;
