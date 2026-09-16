CREATE TYPE "public"."cerrada_por" AS ENUM('mecanico', 'auto', 'jefe');--> statement-breakpoint
CREATE TYPE "public"."estado_operacion" AS ENUM('pendiente', 'en_curso', 'hecha');--> statement-breakpoint
CREATE TYPE "public"."estado_orden" AS ENUM('abierta', 'en_proceso', 'en_espera', 'terminada', 'facturada', 'anulada');--> statement-breakpoint
CREATE TYPE "public"."motivo_espera" AS ENUM('repuestos', 'autorizacion_cliente', 'autorizacion_garantia', 'diagnostico', 'elevador', 'turno_cliente', 'otro');--> statement-breakpoint
CREATE TYPE "public"."origen_orden" AS ENUM('manual', 'dms', 'import');--> statement-breakpoint
CREATE TYPE "public"."resultado_escaneo" AS ENUM('ok', 'rechazado', 'error');--> statement-breakpoint
CREATE TYPE "public"."rol" AS ENUM('admin', 'jefe_taller', 'mecanico');--> statement-breakpoint
CREATE TYPE "public"."tipo_dispositivo" AS ENUM('kiosco', 'escritorio');--> statement-breakpoint
CREATE TYPE "public"."tipo_orden" AS ENUM('service', 'mecanica', 'garantia', 'pdi', 'interno', 'otro');--> statement-breakpoint
CREATE TABLE "ajuste_sesion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sesion_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"campo" text NOT NULL,
	"valor_anterior" text,
	"valor_nuevo" text,
	"motivo" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config" (
	"tenant_id" uuid NOT NULL,
	"clave" text NOT NULL,
	"valor" text NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "config_tenant_id_clave_pk" PRIMARY KEY("tenant_id","clave")
);
--> statement-breakpoint
CREATE TABLE "credencial" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"emitida_en" timestamp with time zone DEFAULT now() NOT NULL,
	"revocada_en" timestamp with time zone,
	"motivo_revocacion" text,
	CONSTRAINT "credencial_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "dispositivo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"tipo" "tipo_dispositivo" NOT NULL,
	"token_hash" text NOT NULL,
	"ultimo_visto_en" timestamp with time zone,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evento_escaneo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"dispositivo_id" uuid,
	"codigo_crudo" text NOT NULL,
	"tipo_detectado" text,
	"usuario_id" uuid,
	"orden_id" uuid,
	"resultado" "resultado_escaneo" NOT NULL,
	"accion" text,
	"mensaje" text,
	"latencia_ms" integer,
	"diferida" boolean DEFAULT false NOT NULL,
	"idempotency_key" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jornada" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"entrada" timestamp with time zone,
	"salida" timestamp with time zone,
	"fuente" text DEFAULT 'manual' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"orden_id" uuid NOT NULL,
	"codigo" text,
	"descripcion" text NOT NULL,
	"estado" "estado_operacion" DEFAULT 'pendiente' NOT NULL,
	"tiempo_baremo_min" integer,
	"orden_visual" smallint DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orden" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"numero" text NOT NULL,
	"numero_dms" text,
	"codigo_qr" text NOT NULL,
	"tipo" "tipo_orden" NOT NULL,
	"vehiculo_id" uuid,
	"descripcion" text,
	"estado" "estado_orden" DEFAULT 'abierta' NOT NULL,
	"prioridad" smallint DEFAULT 0 NOT NULL,
	"abierta_en" timestamp with time zone DEFAULT now() NOT NULL,
	"terminada_en" timestamp with time zone,
	"cerrada_en" timestamp with time zone,
	"creada_por_id" uuid,
	"origen" "origen_orden" DEFAULT 'manual' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orden_codigo_qr_unique" UNIQUE("codigo_qr")
);
--> statement-breakpoint
CREATE TABLE "orden_espera" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"orden_id" uuid NOT NULL,
	"motivo" "motivo_espera" NOT NULL,
	"desde" timestamp with time zone DEFAULT now() NOT NULL,
	"hasta" timestamp with time zone,
	"nota" text,
	"registrada_por_id" uuid
);
--> statement-breakpoint
CREATE TABLE "sesion_trabajo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"orden_id" uuid NOT NULL,
	"operacion_id" uuid,
	"usuario_id" uuid NOT NULL,
	"inicio" timestamp with time zone DEFAULT now() NOT NULL,
	"fin" timestamp with time zone,
	"duracion_seg" integer GENERATED ALWAYS AS (EXTRACT(EPOCH FROM (fin - inicio))::int) STORED,
	"cerrada_por" "cerrada_por",
	"dispositivo_inicio_id" uuid,
	"dispositivo_fin_id" uuid,
	"diferida" boolean DEFAULT false NOT NULL,
	"nota" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sucursal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"direccion" text,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"slug" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "usuario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sucursal_id" uuid,
	"legajo" text NOT NULL,
	"nombre" text NOT NULL,
	"apellido" text NOT NULL,
	"email" text,
	"password_hash" text,
	"rol" "rol" NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehiculo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patente" text,
	"vin" text,
	"marca" text,
	"modelo" text,
	"anio" smallint,
	"cliente_nombre" text,
	"cliente_telefono" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ajuste_sesion" ADD CONSTRAINT "ajuste_sesion_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajuste_sesion" ADD CONSTRAINT "ajuste_sesion_sesion_id_sesion_trabajo_id_fk" FOREIGN KEY ("sesion_id") REFERENCES "public"."sesion_trabajo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajuste_sesion" ADD CONSTRAINT "ajuste_sesion_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config" ADD CONSTRAINT "config_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credencial" ADD CONSTRAINT "credencial_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credencial" ADD CONSTRAINT "credencial_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispositivo" ADD CONSTRAINT "dispositivo_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispositivo" ADD CONSTRAINT "dispositivo_sucursal_id_sucursal_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_escaneo" ADD CONSTRAINT "evento_escaneo_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_escaneo" ADD CONSTRAINT "evento_escaneo_dispositivo_id_dispositivo_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_escaneo" ADD CONSTRAINT "evento_escaneo_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_escaneo" ADD CONSTRAINT "evento_escaneo_orden_id_orden_id_fk" FOREIGN KEY ("orden_id") REFERENCES "public"."orden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jornada" ADD CONSTRAINT "jornada_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jornada" ADD CONSTRAINT "jornada_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacion" ADD CONSTRAINT "operacion_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacion" ADD CONSTRAINT "operacion_orden_id_orden_id_fk" FOREIGN KEY ("orden_id") REFERENCES "public"."orden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden" ADD CONSTRAINT "orden_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden" ADD CONSTRAINT "orden_sucursal_id_sucursal_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden" ADD CONSTRAINT "orden_vehiculo_id_vehiculo_id_fk" FOREIGN KEY ("vehiculo_id") REFERENCES "public"."vehiculo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden" ADD CONSTRAINT "orden_creada_por_id_usuario_id_fk" FOREIGN KEY ("creada_por_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_espera" ADD CONSTRAINT "orden_espera_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_espera" ADD CONSTRAINT "orden_espera_orden_id_orden_id_fk" FOREIGN KEY ("orden_id") REFERENCES "public"."orden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_espera" ADD CONSTRAINT "orden_espera_registrada_por_id_usuario_id_fk" FOREIGN KEY ("registrada_por_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesion_trabajo" ADD CONSTRAINT "sesion_trabajo_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesion_trabajo" ADD CONSTRAINT "sesion_trabajo_orden_id_orden_id_fk" FOREIGN KEY ("orden_id") REFERENCES "public"."orden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesion_trabajo" ADD CONSTRAINT "sesion_trabajo_operacion_id_operacion_id_fk" FOREIGN KEY ("operacion_id") REFERENCES "public"."operacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesion_trabajo" ADD CONSTRAINT "sesion_trabajo_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesion_trabajo" ADD CONSTRAINT "sesion_trabajo_dispositivo_inicio_id_dispositivo_id_fk" FOREIGN KEY ("dispositivo_inicio_id") REFERENCES "public"."dispositivo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesion_trabajo" ADD CONSTRAINT "sesion_trabajo_dispositivo_fin_id_dispositivo_id_fk" FOREIGN KEY ("dispositivo_fin_id") REFERENCES "public"."dispositivo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sucursal" ADD CONSTRAINT "sucursal_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_sucursal_id_sucursal_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehiculo" ADD CONSTRAINT "vehiculo_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_ajuste_sesion" ON "ajuste_sesion" USING btree ("sesion_id");--> statement-breakpoint
CREATE INDEX "ix_credencial_usuario" ON "credencial" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "ix_credencial_activa" ON "credencial" USING btree ("tenant_id") WHERE revocada_en IS NULL;--> statement-breakpoint
CREATE INDEX "ix_dispositivo_tenant" ON "dispositivo" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_escaneo_idem" ON "evento_escaneo" USING btree ("idempotency_key") WHERE idempotency_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_escaneo_fecha" ON "evento_escaneo" USING btree ("tenant_id","creado_en");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_jornada" ON "jornada" USING btree ("usuario_id","fecha");--> statement-breakpoint
CREATE INDEX "ix_operacion_orden" ON "operacion" USING btree ("orden_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_orden_numero" ON "orden" USING btree ("tenant_id","sucursal_id","numero");--> statement-breakpoint
CREATE INDEX "ix_orden_estado" ON "orden" USING btree ("tenant_id","sucursal_id","estado");--> statement-breakpoint
CREATE INDEX "ix_orden_dms" ON "orden" USING btree ("tenant_id","numero_dms");--> statement-breakpoint
CREATE INDEX "ix_espera_orden" ON "orden_espera" USING btree ("orden_id");--> statement-breakpoint
CREATE INDEX "ix_espera_abierta" ON "orden_espera" USING btree ("tenant_id") WHERE hasta IS NULL;--> statement-breakpoint
CREATE INDEX "ix_sesion_abierta" ON "sesion_trabajo" USING btree ("usuario_id") WHERE fin IS NULL;--> statement-breakpoint
CREATE INDEX "ix_sesion_orden" ON "sesion_trabajo" USING btree ("orden_id");--> statement-breakpoint
CREATE INDEX "ix_sesion_rango" ON "sesion_trabajo" USING btree ("tenant_id","usuario_id","inicio");--> statement-breakpoint
CREATE INDEX "ix_sucursal_tenant" ON "sucursal" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_usuario_legajo" ON "usuario" USING btree ("tenant_id","legajo");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_usuario_email" ON "usuario" USING btree ("email") WHERE email IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_usuario_tenant" ON "usuario" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "ix_vehiculo_patente" ON "vehiculo" USING btree ("tenant_id","patente");