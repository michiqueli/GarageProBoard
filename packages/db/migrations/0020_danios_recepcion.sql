ALTER TABLE "orden" ADD COLUMN "danios" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "orden" ADD COLUMN "inventario" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "orden" ADD CONSTRAINT "orden_danios_lista" CHECK (jsonb_typeof("orden"."danios") = 'array');--> statement-breakpoint
ALTER TABLE "orden" ADD CONSTRAINT "orden_inventario_objeto" CHECK (jsonb_typeof("orden"."inventario") = 'object');