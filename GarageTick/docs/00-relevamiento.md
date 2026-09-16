# Relevamiento — preguntas para la concesionaria

Lista para llevar a la reunión. Marcá las respuestas acá mismo.

---

## A. Bloqueantes (definen el diseño, hay que responderlas antes de codear)

### A1. ~~El elefante en la sala: Oversoft ya tiene esto~~ ✅ RESPONDIDO

Oversoft tiene un módulo de "Tablero de Mano de Obra" que hace esto. **El
cliente no lo usa porque no es práctico, no es cómodo y no es rápido — y encima
se lo cobran caro.**

**Consecuencia — esta es la definición del producto:**

> GarageTick no gana por tener más funciones que Oversoft. Gana porque fichar
> tarda 3 segundos y no requiere buscar nada en una grilla.

Todo lo demás es secundario. Si el fichaje es lento o incómodo, el proyecto
fracasa igual que el módulo de Oversoft, con las mismas funcionalidades.
Ver el **presupuesto de latencia** en `01-arquitectura.md`.

Preguntas de seguimiento (para saber exactamente qué duele):

- [ ] ¿Qué tiene que hacer hoy un mecánico para cargar tiempo en Oversoft?
      Que lo muestren en pantalla, paso por paso, cronómetro en mano.
- [ ] ¿Cuántos clics/pantallas son? ¿Tiene que loguearse? ¿Buscar la OT en una
      lista? ¿Tipear el número?
- [ ] ¿Dónde está la PC que usarían? ¿A cuántos metros del banco de trabajo?
- [ ] ¿Lo intentaron y lo abandonaron, o nunca arrancó?

> Grabá o anotá esos pasos. Es el "antes" contra el que se mide el "después", y
> es el argumento de venta más fuerte que vas a tener.

**Precio — sacarle el número:**

- [ ] ¿Cuánto les cobra/cobraba Oversoft por el módulo de mano de obra?
      ¿Es licencia única, abono mensual, o por usuario?
- [ ] ¿Ese costo lo pagan igual hoy aunque no lo usen? (a veces viene bundleado)
- [ ] ¿Cobran aparte el soporte o las modificaciones?

> **Ese número es tu ancla de precio.** No cobres por horas de desarrollo:
> cobrá contra lo que ya les cotizaron y no compraron. Y si es abono mensual,
> ahí tenés el modelo de negocio del soporte/mantenimiento.
> También confirma que pedirle a Oversoft el QR en la OT impresa va a salir caro
> → refuerza la etiquetadora térmica propia (ver `04-oversoft.md`).

### A1-bis. Layout físico del taller ⚠️ NUEVO BLOQUEANTE

Si el mecánico tiene que **caminar** para fichar, el sistema muere. Es
exactamente el mismo problema que tiene Oversoft hoy.

- [ ] ¿Cuántas bahías/elevadores hay?
- [ ] ¿Qué distancia hay de la bahía más lejana a un puesto de escaneo central?
- [ ] ¿El auto se mueve durante el trabajo o se queda en la misma bahía?
- [ ] ¿Los mecánicos andan con la credencial encima o la dejan en el locker?

**Plano a mano alzada del taller con medidas aproximadas.** Define cuántos
puestos hacen falta y si conviene lector inalámbrico. Ver `01-arquitectura.md`.

### A2. ¿Un mecánico puede estar en varias OT a la vez?

- [ ] Nunca, un trabajo por vez
- [ ] Sí, es normal (arranca otra mientras espera repuestos)
- [ ] Depende del tipo de trabajo

Si es "sí", segunda pregunta: **¿cómo se imputa el tiempo?** ¿Los 60 minutos van
enteros a las dos OT (suma > tiempo real) o se prorratean 30/30?

### A3. ¿Esto alimenta liquidación de sueldos, incentivos o comisiones?

- [ ] No, es solo para costeo y gestión interna
- [ ] Sí, se paga por productividad
- [ ] A futuro sí

> Si es sí, cambia el nivel de rigor: auditoría de cada modificación, política
> de correcciones firmada, y hay que revisar registro de jornada (LCT 20.744).
> **Y la credencial QR pasa a ser insuficiente como identificación** — un QR se
> fotocopia, cualquiera puede fichar por otro. Habría que sumar PIN o huella.

### A4. Estructura del grupo — ⬆️ AHORA ES LA PREGUNTA MÁS IMPORTANTE

El grupo tiene **~50 concesionarias**. El piloto es la puerta de entrada a un
canal, no un proyecto suelto. Ver `05-presupuesto.md` §5.

- [ ] ¿Las 50 son del **mismo grupo** con dueño común?
- [ ] ¿La compra de software es **centralizada** o decide cada concesionaria?
- [ ] ¿Todas usan Oversoft? → si sí, el mismo dolor se repite 50 veces
- [ ] ¿Quién es el sponsor **con alcance de grupo**, no solo de esta sucursal?
- [ ] ¿Hay IT corporativo? ¿Exigen revisión de seguridad, SLA, proveedor
      registrado, facturación con condiciones?

> Multi-sucursal y multi-tenant se deciden **ahora**. `tenant_id`/`sucursal_id`
> van en el esquema desde la primera migración: cuesta casi nada hoy y cuesta
> el proyecto en el sitio #8.
>
> Y del lado comercial: **el precio de las concesionarias adicionales se fija en
> el mismo contrato del piloto.** Si se deja para después, se negocia desde una
> posición pésima.

### A5. Volumen

- [ ] Cantidad de mecánicos: ____
- [ ] OT promedio por día: ____
- [ ] Puestos de escaneo necesarios: ____ (¿uno solo o varios en el taller?)
- [ ] ¿Turnos? ¿Horarios? ____

---

## B. Proceso actual del taller

- [ ] ¿Cómo se mide hoy el tiempo? (planilla, nada, a ojo, Oversoft)
- [ ] ¿Quién crea la OT y en qué momento? ¿El asesor de servicio?
- [ ] ¿La OT se imprime en papel? **¿Trae código de barras con el número?**
      → Traer una OT impresa de muestra. Si ya tiene código de barras, nos
        ahorramos toda la etiquetadora.
- [ ] ¿Cómo se asigna el trabajo al mecánico? (jefe reparte, se toman solos,
      hay tablero)
- [ ] ¿Qué pasa cuando falta un repuesto? ¿Se anota en algún lado?
- [ ] ¿Hay más de un mecánico en la misma OT? (ej. ayudante)
- [ ] ¿Los mecánicos tienen acceso a alguna PC hoy? ¿Saben usarla?

---

## C. Tipos de trabajo

- [ ] Confirmar los tipos: service, mecánica general, garantía. ¿Falta alguno?
      (chapa y pintura, preentrega/PDI, diagnóstico, alistamiento de usados,
      reacondicionamiento)
- [ ] ¿La preentrega (PDI) de 0km pasa por el mismo taller?
- [ ] **Garantías**: ¿la terminal exige un formato/evidencia de tiempos para el
      reclamo? ¿Cuál? ¿Sirve que esto lo genere?
- [ ] ¿Hay trabajos internos (autos de la agencia) que no se facturan?

---

## D. Tiempos baremo (fase 2, pero relevar ahora)

- [ ] ¿Manejan tiempo estándar por operación?
- [ ] ¿De dónde sale? (tabla de la terminal, Oversoft, criterio del jefe)
- [ ] ¿En qué formato lo pueden entregar? (Excel, PDF, sistema)
- [ ] ¿Miden hoy eficiencia/productividad de alguna forma?

---

## E. Reportes — qué quieren ver realmente

Preguntar abierto y después contrastar contra esta lista:

- [ ] Tiempo real por OT
- [ ] Tiempo por mecánico (día / semana / mes)
- [ ] OT abiertas ahora y hace cuánto
- [ ] Ranking de mecánicos
- [ ] Tiempo muerto por motivo (repuestos, autorizaciones)
- [ ] Lead time: cuánto estuvo el auto en el taller de punta a punta
- [ ] Comparación real vs. baremo (fase 2)
- [ ] ¿Necesitan exportar a Excel? ¿Para qué?
- [ ] ¿Alguien quiere esto en el celular?

---

## F. Infraestructura y IT

- [ ] ¿Hay un área de IT del grupo? ¿Quién autoriza instalar software?
- [ ] ¿Las PC son del dominio? ¿Hay políticas que bloqueen instalaciones?
- [ ] ¿Hay una PC que pueda quedar prendida 24/7 como servidor?
      → **Que no sea la PC de trabajo de nadie.**
- [ ] ¿El taller tiene red cableada o WiFi? ¿Llega bien la señal?
- [ ] ¿Hay UPS?
- [ ] ~~¿Aceptan instalar Tailscale para soporte remoto?~~ → **cerrado**: el
      acceso remoto queda fuera del MVP y se cotiza aparte (decisión 12). Lo que
      sí hay que preguntar: **¿el jefe o el dueño van a querer ver los números
      desde afuera del taller?** Si es sí, es una venta adicional, no un
      requisito
- [ ] ¿Dónde se guardan los backups? ¿Hay NAS, carpeta de red, nube corporativa?
- [ ] ¿El servidor de Oversoft está on-premise o en la nube de ellos?

---

## G. Hardware

- [ ] ¿Compran ellos el hardware o lo proveés vos?
- [ ] ¿Ya tienen lector de código de barras en algún sector? (repuestos suele
      tener) → si tienen, probar si lee QR (2D) o solo 1D
- [ ] ¿Tienen impresora de etiquetas?
- [ ] ¿Dónde va físicamente el puesto de escaneo? Sacar fotos del lugar.
      (enchufe, red, luz, si se ensucia, si hay lugar para un monitor)

---

## H. Contrato y expectativas

- [ ] ¿Plazo esperado?
- [ ] ¿Es desarrollo llave en mano o hay soporte/mantenimiento mensual?
- [ ] ¿Quién es el sponsor del proyecto? ¿Y el usuario que lo va a defender
      internamente?
- [ ] **¿Cómo se les va a comunicar a los mecánicos?** El principal riesgo de
      fracaso no es técnico: si lo perciben como control y castigo, no lo
      cargan y el proyecto muere. Idealmente lo anuncia el jefe de taller
      enmarcado en "para que no te carguen trabajos que no hiciste" y "para
      justificar tiempos ante garantía".
