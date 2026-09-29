ALTER TABLE "orden" ADD COLUMN "silueta" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "modelo" ADD COLUMN "carroceria" text;--> statement-breakpoint
ALTER TABLE "orden" ADD CONSTRAINT "orden_silueta_valida" CHECK ("orden"."silueta" in ('auto', 'pickup', 'furgon'));--> statement-breakpoint
ALTER TABLE "modelo" ADD CONSTRAINT "modelo_carroceria_valida" CHECK ("modelo"."carroceria" is null
          or "modelo"."carroceria" in ('sedan', 'hatchback', 'coupe', 'familiar', 'suv', 'pickup', 'furgon'));