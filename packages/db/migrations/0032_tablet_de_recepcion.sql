ALTER TABLE "estacion_fichaje" DROP CONSTRAINT "estacion_tipo_valido";--> statement-breakpoint
ALTER TABLE "sesion" ADD COLUMN "estacion_id" uuid;--> statement-breakpoint
ALTER TABLE "sesion" ADD CONSTRAINT "sesion_estacion_id_estacion_fichaje_id_fk" FOREIGN KEY ("estacion_id") REFERENCES "public"."estacion_fichaje"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estacion_fichaje" ADD CONSTRAINT "estacion_tipo_valido" CHECK ("estacion_fichaje"."tipo" in ('taller', 'reloj', 'tablero', 'totem', 'llamador', 'recepcion'));