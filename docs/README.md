# Documentación de GaragePro

Todo lo que decidimos queda escrito acá y versionado con el código. La regla es
simple: si una decisión costó una conversación, se escribe. Dentro de seis meses
nadie se acuerda por qué el punto de venta cuelga de dos padres.

## Estructura

| Carpeta | Qué va | Nombre de archivo |
| --- | --- | --- |
| `sessions/` | Bitácora de cada sesión de trabajo: qué se decidió, qué se construyó, qué quedó abierto | `session-dd-mm-yyyy.md` |
| `roadmaps/` | Planes por hitos, con su estado | `roadmap-<tema>.md` |
| `tecnicos/` | Informes técnicos: modelo de datos, integraciones, arquitectura | `<tema>.md` |

## Por qué las bitácoras de sesión

No son un diario. Sirven para tres cosas concretas:

1. **Recuperar el contexto de una decisión** sin tener que releer código para
   deducirla. El *por qué* casi nunca sobrevive en el *qué*.
2. **Distinguir lo decidido de lo supuesto.** Estamos modelando sin acceso a una
   concesionaria real: todo supuesto va marcado como tal, para poder revisarlo
   cuando aparezca un piloto en vez de que se convierta en verdad por costumbre.
3. **Registrar los callejones sin salida.** Saber que ts-rest se descartó por
   incompatibilidad de versiones evita que alguien lo proponga de nuevo en marzo.
