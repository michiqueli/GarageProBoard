ALTER TABLE "usuario" DROP CONSTRAINT "usuario_email_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "usuario_email_uq" ON "usuario" USING btree ("email");--> statement-breakpoint
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_email_minuscula" CHECK ("usuario"."email" = lower("usuario"."email"));