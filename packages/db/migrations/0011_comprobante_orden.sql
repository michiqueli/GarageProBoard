ALTER TABLE "orden" DROP CONSTRAINT "orden_facturada_con_comprobante";--> statement-breakpoint
ALTER TABLE "orden" DROP CONSTRAINT "orden_comprobante_id_comprobante_id_fk";
--> statement-breakpoint
ALTER TABLE "comprobante" ADD COLUMN "orden_id" uuid;--> statement-breakpoint
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_orden_id_orden_id_fk" FOREIGN KEY ("orden_id") REFERENCES "public"."orden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comprobante_orden_uq" ON "comprobante" USING btree ("orden_id") WHERE estado in ('emitiendo', 'autorizado', 'incierto') and orden_id is not null and comprobante_asociado_id is null;--> statement-breakpoint
ALTER TABLE "orden" DROP COLUMN "comprobante_id";