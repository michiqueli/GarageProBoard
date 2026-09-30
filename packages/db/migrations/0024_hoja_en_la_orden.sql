ALTER TABLE "orden" DROP CONSTRAINT "orden_silueta_valida";--> statement-breakpoint
ALTER TABLE "orden" ADD COLUMN "hoja_tipo" text DEFAULT 'sedan' NOT NULL;--> statement-breakpoint
ALTER TABLE "orden" ADD COLUMN "hoja_imagen_id" uuid;--> statement-breakpoint
ALTER TABLE "orden" ADD CONSTRAINT "orden_hoja_imagen_id_hoja_imagen_id_fk" FOREIGN KEY ("hoja_imagen_id") REFERENCES "public"."hoja_imagen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Las tres siluetas dibujadas al vocabulario nuevo. El furgon va con la pickup, que es el
-- dibujo mas parecido de los cuatro que hay.
UPDATE "orden" SET "hoja_tipo" = CASE "silueta"
  WHEN 'auto' THEN 'sedan'
  WHEN 'pickup' THEN 'pickup'
  WHEN 'furgon' THEN 'pickup'
  ELSE 'sedan'
END;--> statement-breakpoint
-- Y las marcas: de pixeles del dibujo que se tiro (240 x 372) a fraccion del ancho y del alto.
-- La zona se pierde, que es lo decidido: sobre una imagen que sube cada taller el sistema no
-- puede saber que chapa es un punto. Ver docs/tecnicos/hoja-de-recepcion.md.
UPDATE "orden" SET "danios" = coalesce((
  SELECT jsonb_agg(jsonb_build_object(
    'tipo', d->>'tipo',
    'x', round((d->>'x')::numeric / 240, 4),
    'y', round((d->>'y')::numeric / 372, 4),
    'nota', d->'nota'
  ))
  FROM jsonb_array_elements("danios") AS d
), '[]'::jsonb) WHERE jsonb_array_length("danios") > 0;--> statement-breakpoint
ALTER TABLE "orden" ADD CONSTRAINT "orden_hoja_tipo_valido" CHECK ("orden"."hoja_tipo" in ('sedan', 'hatchback', 'suv', 'pickup'));
