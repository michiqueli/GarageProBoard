ALTER TABLE "hoja_imagen" DROP CONSTRAINT "hoja_imagen_vista_valida";--> statement-breakpoint
ALTER TABLE "hoja_imagen" DROP CONSTRAINT "hoja_imagen_tipo_valido";--> statement-breakpoint
DROP INDEX "hoja_imagen_vigente_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "hoja_imagen_vigente_uq" ON "hoja_imagen" USING btree ("tenant_id","tipo") WHERE reemplazada_en is null;--> statement-breakpoint
ALTER TABLE "hoja_imagen" DROP COLUMN "vista";--> statement-breakpoint
ALTER TABLE "hoja_imagen" ADD CONSTRAINT "hoja_imagen_tipo_valido" CHECK ("hoja_imagen"."tipo" in ('sedan', 'hatchback', 'suv', 'pickup'));