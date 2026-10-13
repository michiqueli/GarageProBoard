ALTER TABLE "visita" DROP CONSTRAINT "visita_motivo_valido";--> statement-breakpoint
ALTER TABLE "visita" DROP CONSTRAINT "visita_resultado_valido";--> statement-breakpoint
ALTER TABLE "visita" DROP CONSTRAINT "visita_orden_con_resultado";--> statement-breakpoint
ALTER TABLE "visita" ADD CONSTRAINT "visita_motivo_valido" CHECK ("visita"."motivo" in ('servicio', 'retiro', 'venta', 'plan_ahorro', 'usados', 'repuestos', 'administracion', 'otro'));--> statement-breakpoint
ALTER TABLE "visita" ADD CONSTRAINT "visita_resultado_valido" CHECK ("visita"."resultado" is null or "visita"."resultado" in ('atendida', 'se_fue', 'orden', 'entrega'));--> statement-breakpoint
ALTER TABLE "visita" ADD CONSTRAINT "visita_orden_con_resultado" CHECK ("visita"."orden_id" is null or "visita"."resultado" in ('orden', 'entrega'));