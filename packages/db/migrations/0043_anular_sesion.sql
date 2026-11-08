ALTER TABLE "sesion_trabajo" ADD COLUMN "anulada_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sesion_trabajo" ADD COLUMN "anulada_por" uuid;--> statement-breakpoint
ALTER TABLE "sesion_trabajo" ADD COLUMN "anulacion_motivo" text;--> statement-breakpoint
ALTER TABLE "sesion_trabajo" ADD CONSTRAINT "sesion_trabajo_anulada_por_usuario_id_fk" FOREIGN KEY ("anulada_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesion_trabajo" ADD CONSTRAINT "sesion_trabajo_anulada_valida" CHECK ("sesion_trabajo"."anulada_en" is null or ("sesion_trabajo"."fin" is not null and length(btrim("sesion_trabajo"."anulacion_motivo")) >= 5));