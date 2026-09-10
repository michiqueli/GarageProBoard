CREATE TABLE "auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"usuario_id" uuid,
	"tabla" text NOT NULL,
	"registro_id" uuid,
	"accion" text NOT NULL,
	"datos_antes" jsonb,
	"datos_despues" jsonb,
	"ip" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auditoria_accion_valida" CHECK ("auditoria"."accion" in ('alta', 'modificacion', 'baja'))
);
--> statement-breakpoint
CREATE TABLE "rol" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"habilidades" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rol_nombre_uq" UNIQUE("tenant_id","nombre")
);
--> statement-breakpoint
CREATE TABLE "usuario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"hash_password" text NOT NULL,
	"nombre" text NOT NULL,
	"apellido" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"ultimo_acceso" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuario_email_uq" UNIQUE("tenant_id","email")
);
--> statement-breakpoint
CREATE TABLE "usuario_rol" (
	"tenant_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"rol_id" uuid NOT NULL,
	CONSTRAINT "usuario_rol_usuario_id_rol_id_pk" PRIMARY KEY("usuario_id","rol_id")
);
--> statement-breakpoint
CREATE TABLE "usuario_sucursal" (
	"tenant_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	CONSTRAINT "usuario_sucursal_usuario_id_sucursal_id_pk" PRIMARY KEY("usuario_id","sucursal_id")
);
--> statement-breakpoint
CREATE TABLE "condicion_iva" (
	"codigo" smallint PRIMARY KEY NOT NULL,
	"descripcion" text NOT NULL,
	"discrimina_iva" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provincia" (
	"codigo" smallint PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"codigo_iibb" text
);
--> statement-breakpoint
CREATE TABLE "regla_comprobante" (
	"condicion_emisor" smallint NOT NULL,
	"condicion_receptor" smallint NOT NULL,
	"tipo_comprobante" smallint NOT NULL,
	CONSTRAINT "regla_comprobante_condicion_emisor_condicion_receptor_pk" PRIMARY KEY("condicion_emisor","condicion_receptor")
);
--> statement-breakpoint
CREATE TABLE "tipo_comprobante" (
	"codigo" smallint PRIMARY KEY NOT NULL,
	"descripcion" text NOT NULL,
	"letra" char(1),
	"signo" smallint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cliente" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"limite_credito" numeric(18, 4),
	"dias_credito" integer DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"observaciones" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "empleado" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"legajo" text NOT NULL,
	"sucursal_id" uuid,
	"convenio" text,
	"categoria" text,
	"fecha_ingreso" text,
	"fecha_egreso" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "empleado_legajo_uq" UNIQUE("tenant_id","legajo")
);
--> statement-breakpoint
CREATE TABLE "entidad_comercial" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tipo_documento" smallint NOT NULL,
	"numero_documento" text NOT NULL,
	"tipo_persona" text NOT NULL,
	"razon_social" text NOT NULL,
	"nombre" text,
	"apellido" text,
	"condicion_iva" smallint NOT NULL,
	"domicilio" text,
	"provincia_codigo" smallint,
	"localidad" text,
	"codigo_postal" text,
	"email" text,
	"telefono" text,
	"numero_iibb" text,
	"condicion_iibb" text DEFAULT 'no_inscripto' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entidad_documento_uq" UNIQUE("tenant_id","tipo_documento","numero_documento"),
	CONSTRAINT "entidad_tipo_persona_valido" CHECK ("entidad_comercial"."tipo_persona" in ('fisica', 'juridica')),
	CONSTRAINT "entidad_condicion_iibb_valida" CHECK ("entidad_comercial"."condicion_iibb" in ('local', 'convenio', 'exento', 'no_inscripto'))
);
--> statement-breakpoint
CREATE TABLE "proveedor" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"condicion_pago" text,
	"cuenta_contable" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comprobante_secuencia" (
	"tenant_id" uuid NOT NULL,
	"punto_venta_id" uuid NOT NULL,
	"tipo_comprobante" smallint NOT NULL,
	"ultimo_numero" bigint DEFAULT 0 NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comprobante_secuencia_punto_venta_id_tipo_comprobante_pk" PRIMARY KEY("punto_venta_id","tipo_comprobante")
);
--> statement-breakpoint
CREATE TABLE "empresa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"razon_social" text NOT NULL,
	"nombre_fantasia" text,
	"cuit" char(11) NOT NULL,
	"condicion_iva" smallint NOT NULL,
	"inicio_actividades" text,
	"domicilio_fiscal" text,
	"provincia_codigo" smallint,
	"convenio_multilateral" boolean DEFAULT false NOT NULL,
	"numero_iibb" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "empresa_tenant_cuit_uq" UNIQUE("tenant_id","cuit"),
	CONSTRAINT "empresa_cuit_formato" CHECK ("empresa"."cuit" ~ '^[0-9]{11}$')
);
--> statement-breakpoint
CREATE TABLE "punto_venta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"uso" text NOT NULL,
	"predeterminado" boolean DEFAULT false NOT NULL,
	"modo" text DEFAULT 'CAE' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "punto_venta_empresa_numero_uq" UNIQUE("empresa_id","numero"),
	CONSTRAINT "punto_venta_uso_valido" CHECK ("punto_venta"."uso" in ('facturacion', 'remito', 'otro')),
	CONSTRAINT "punto_venta_modo_valido" CHECK ("punto_venta"."modo" in ('CAE', 'CAEA')),
	CONSTRAINT "punto_venta_numero_rango" CHECK ("punto_venta"."numero" between 1 and 99999)
);
--> statement-breakpoint
CREATE TABLE "sucursal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"domicilio" text,
	"provincia_codigo" smallint,
	"localidad" text,
	"telefono" text,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sucursal_id_empresa_uq" UNIQUE("id","empresa_id")
);
--> statement-breakpoint
CREATE TABLE "tenant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"slug" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marca" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"es_terminal" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marca_nombre_uq" UNIQUE("tenant_id","nombre")
);
--> statement-breakpoint
CREATE TABLE "modelo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"marca_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"version" text,
	"anio_desde" integer,
	"anio_hasta" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "modelo_nombre_uq" UNIQUE("tenant_id","marca_id","nombre","version")
);
--> statement-breakpoint
CREATE TABLE "titularidad" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"vehiculo_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"desde" date NOT NULL,
	"hasta" date,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "titularidad_rango_valido" CHECK ("titularidad"."hasta" is null or "titularidad"."hasta" >= "titularidad"."desde")
);
--> statement-breakpoint
CREATE TABLE "vehiculo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"chasis" text NOT NULL,
	"motor" text,
	"dominio" text,
	"modelo_id" uuid,
	"anio" integer,
	"color" text,
	"combustible" text,
	"kilometraje" integer,
	"fecha_venta" date,
	"observaciones" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehiculo_chasis_uq" UNIQUE("tenant_id","chasis"),
	CONSTRAINT "vehiculo_chasis_formato" CHECK ("vehiculo"."chasis" ~ '^[A-HJ-NPR-Z0-9]{6,17}$'),
	CONSTRAINT "vehiculo_dominio_formato" CHECK ("vehiculo"."dominio" is null
          or "vehiculo"."dominio" ~ '^[A-Z]{3}[0-9]{3}$'
          or "vehiculo"."dominio" ~ '^[A-Z]{2}[0-9]{3}[A-Z]{2}$')
);
--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rol" ADD CONSTRAINT "rol_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_rol" ADD CONSTRAINT "usuario_rol_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_rol" ADD CONSTRAINT "usuario_rol_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_rol" ADD CONSTRAINT "usuario_rol_rol_id_rol_id_fk" FOREIGN KEY ("rol_id") REFERENCES "public"."rol"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_sucursal" ADD CONSTRAINT "usuario_sucursal_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_sucursal" ADD CONSTRAINT "usuario_sucursal_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_sucursal" ADD CONSTRAINT "usuario_sucursal_sucursal_id_sucursal_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regla_comprobante" ADD CONSTRAINT "regla_comprobante_condicion_emisor_condicion_iva_codigo_fk" FOREIGN KEY ("condicion_emisor") REFERENCES "public"."condicion_iva"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regla_comprobante" ADD CONSTRAINT "regla_comprobante_condicion_receptor_condicion_iva_codigo_fk" FOREIGN KEY ("condicion_receptor") REFERENCES "public"."condicion_iva"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regla_comprobante" ADD CONSTRAINT "regla_comprobante_tipo_comprobante_tipo_comprobante_codigo_fk" FOREIGN KEY ("tipo_comprobante") REFERENCES "public"."tipo_comprobante"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_id_entidad_comercial_id_fk" FOREIGN KEY ("id") REFERENCES "public"."entidad_comercial"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_id_entidad_comercial_id_fk" FOREIGN KEY ("id") REFERENCES "public"."entidad_comercial"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_sucursal_id_sucursal_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entidad_comercial" ADD CONSTRAINT "entidad_comercial_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entidad_comercial" ADD CONSTRAINT "entidad_comercial_condicion_iva_condicion_iva_codigo_fk" FOREIGN KEY ("condicion_iva") REFERENCES "public"."condicion_iva"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entidad_comercial" ADD CONSTRAINT "entidad_comercial_provincia_codigo_provincia_codigo_fk" FOREIGN KEY ("provincia_codigo") REFERENCES "public"."provincia"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proveedor" ADD CONSTRAINT "proveedor_id_entidad_comercial_id_fk" FOREIGN KEY ("id") REFERENCES "public"."entidad_comercial"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proveedor" ADD CONSTRAINT "proveedor_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobante_secuencia" ADD CONSTRAINT "comprobante_secuencia_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobante_secuencia" ADD CONSTRAINT "comprobante_secuencia_punto_venta_id_punto_venta_id_fk" FOREIGN KEY ("punto_venta_id") REFERENCES "public"."punto_venta"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobante_secuencia" ADD CONSTRAINT "comprobante_secuencia_tipo_comprobante_tipo_comprobante_codigo_fk" FOREIGN KEY ("tipo_comprobante") REFERENCES "public"."tipo_comprobante"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa" ADD CONSTRAINT "empresa_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa" ADD CONSTRAINT "empresa_condicion_iva_condicion_iva_codigo_fk" FOREIGN KEY ("condicion_iva") REFERENCES "public"."condicion_iva"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa" ADD CONSTRAINT "empresa_provincia_codigo_provincia_codigo_fk" FOREIGN KEY ("provincia_codigo") REFERENCES "public"."provincia"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punto_venta" ADD CONSTRAINT "punto_venta_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punto_venta" ADD CONSTRAINT "punto_venta_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punto_venta" ADD CONSTRAINT "punto_venta_sucursal_empresa_fk" FOREIGN KEY ("sucursal_id","empresa_id") REFERENCES "public"."sucursal"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sucursal" ADD CONSTRAINT "sucursal_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sucursal" ADD CONSTRAINT "sucursal_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sucursal" ADD CONSTRAINT "sucursal_provincia_codigo_provincia_codigo_fk" FOREIGN KEY ("provincia_codigo") REFERENCES "public"."provincia"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marca" ADD CONSTRAINT "marca_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modelo" ADD CONSTRAINT "modelo_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modelo" ADD CONSTRAINT "modelo_marca_id_marca_id_fk" FOREIGN KEY ("marca_id") REFERENCES "public"."marca"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titularidad" ADD CONSTRAINT "titularidad_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titularidad" ADD CONSTRAINT "titularidad_vehiculo_id_vehiculo_id_fk" FOREIGN KEY ("vehiculo_id") REFERENCES "public"."vehiculo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titularidad" ADD CONSTRAINT "titularidad_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehiculo" ADD CONSTRAINT "vehiculo_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehiculo" ADD CONSTRAINT "vehiculo_modelo_id_modelo_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_tabla_registro_idx" ON "auditoria" USING btree ("tenant_id","tabla","registro_id");--> statement-breakpoint
CREATE INDEX "auditoria_fecha_idx" ON "auditoria" USING btree ("tenant_id","creado_en");--> statement-breakpoint
CREATE INDEX "entidad_razon_social_idx" ON "entidad_comercial" USING btree ("tenant_id","razon_social");--> statement-breakpoint
CREATE UNIQUE INDEX "punto_venta_predeterminado_uq" ON "punto_venta" USING btree ("sucursal_id","uso") WHERE predeterminado;--> statement-breakpoint
CREATE INDEX "sucursal_empresa_idx" ON "sucursal" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_slug_uq" ON "tenant" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "modelo_marca_idx" ON "modelo" USING btree ("marca_id");--> statement-breakpoint
CREATE UNIQUE INDEX "titularidad_vigente_uq" ON "titularidad" USING btree ("vehiculo_id") WHERE hasta is null;--> statement-breakpoint
CREATE INDEX "titularidad_cliente_idx" ON "titularidad" USING btree ("cliente_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vehiculo_dominio_uq" ON "vehiculo" USING btree ("tenant_id","dominio") WHERE dominio is not null;