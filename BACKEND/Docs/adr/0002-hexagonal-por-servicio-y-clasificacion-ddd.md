# ADR-0002: Arquitectura hexagonal por servicio + clasificación estratégica DDD

## Estado
Aceptada

> **Nota de superación (2026-07-28):** la parte de este ADR que asumía
> `arquitectura_general.despliegue` como microservicios (un servicio por
> bounded context, base de datos propia por servicio) está superada por
> ADR-0006 (monolito modular en Go). La decisión de fondo se mantiene: la
> arquitectura sigue siendo **hexagonal**, solo que ahora "por módulo"
> (paquete bajo `internal/`, ej. `internal/tickets`) en vez de "por
> servicio", y la clasificación estratégica DDD (core/supporting/generic)
> se mantiene sin cambios — no depende de si la unidad de despliegue es un
> servicio o un módulo. Ver ADR-0006 para el detalle.

## Fecha
2026-07-03

## Contexto

SIG-Desk se descompone en microservicios, uno por bounded context
(`tickets_service`, `organization_service`, `resource_service`,
`workflow_service`, `notification_service`, `ai_advisor_service`,
`audit_service`), cada uno con base de datos propia y sin FK cruzadas
entre servicios.

Antes de escribir código, había que responder dos preguntas separadas
que suelen confundirse:

1. **¿Qué patrón interno usa cada servicio?** (hexagonal, capas, CRUD
   simple, etc.)
2. **¿Cuánto rigor de diseño justifica cada servicio?** (no todos los
   servicios tienen la misma complejidad de negocio ni el mismo riesgo
   si están mal diseñados)

Tratar a los 7 servicios de forma homogénea — todos con hexagonal
completo, o todos con CRUD simple — hubiera sido un error en ambas
direcciones: sobre-diseñar un servicio que es casi CRUD (ej.
`audit_service`, que es un sumidero puro de eventos) desperdicia tiempo
de desarrollo; sub-diseñar el servicio que concentra la lógica de negocio
más compleja (`tickets_service`, con lifecycle, SLA y reglas de
asignación) genera deuda técnica temprana en la pieza más crítica del
sistema.

## Decisión

**Patrón interno**: todos los servicios usan **arquitectura hexagonal
(ports & adapters)** como estilo base — dominio en el centro, puertos de
entrada/salida como interfaces, adaptadores concretos (HTTP, mensajería,
persistencia) como implementación. Esto se mantiene incluso en los
servicios más simples, para preservar consistencia y que cualquier
desarrollador (o IA) que pase de un servicio a otro encuentre la misma
estructura.

**Rigor de diseño**: se aplica clasificación estratégica DDD para decidir
*cuánta* inversión de diseño justifica cada servicio:

| Clasificación | Servicios | Justificación |
|---|---|---|
| **Core domain** | `tickets_service` | Corazón del negocio: lifecycle, SLA, asignación por habilidad/categoría — reglas propias no triviales. Justifica hexagonal completo con rigor: invariantes de dominio explícitas, entidades hijas del aggregate root bien modeladas, casos de uso separados por operación. |
| **Supporting subdomain** | `organization_service`, `resource_service` | Necesarios pero no diferenciadores. Hexagonal más ligero, casi CRUD con validaciones — el patrón se mantiene por consistencia, pero sin la profundidad de modelado del core domain. |
| **Generic subdomain** | `workflow_service`, `notification_service`, `audit_service`, `ai_advisor_service` | Resuelven un problema genérico, no específico del negocio de SIG-Desk. Candidatos a resolverse con librerías o productos de terceros en vez de construcción 100% propia (ver ADR-0003 para el caso concreto de `workflow_service`). |

Esta clasificación **no cambia el patrón arquitectónico** (todos siguen
siendo hexagonales), pero sí determina cuánto tiempo del equipo se invierte
en el modelado fino de cada uno.

## Alternativas consideradas

| Alternativa | Por qué se descartó |
|---|---|
| Hexagonal solo en `tickets_service`, resto con arquitectura en capas simple (MVC) | Rompe la consistencia entre servicios — un desarrollador que pasa de `tickets_service` a `organization_service` tendría que cambiar de mentalidad arquitectónica sin necesidad real. El costo de mantener hexagonal en un servicio simple es bajo; el costo de tener dos estilos conviviendo es alto. |
| Monolito modular en vez de microservicios | Ya estaba fuera de discusión por decisión previa de `arquitectura_general.despliegue` (microservicios, un servicio por bounded context). No se reconsideró en esta sesión. |
| Mismo nivel de rigor de diseño en los 7 servicios | Sobre-invertir en servicios genéricos (`audit_service`, sumidero puro de eventos) no aporta valor proporcional; sub-invertir en `tickets_service` es el riesgo más caro del proyecto porque ahí vive la lógica de negocio real. |

## Consecuencias

**Positivas:**
- Consistencia estructural entre todos los servicios: mismo vocabulario
  (`puertos_entrada`, `puertos_salida`, `adaptadores_entrada`,
  `adaptadores_salida`) en toda la base de código.
- El presupuesto de tiempo de diseño se concentra donde más impacta:
  `tickets_service` recibe el modelado más cuidadoso (ver
  `hexagonal_tickets_service` en el spec, con aggregate root, entidades
  hijas e invariantes explícitas).
- La clasificación DDD deja documentado, de forma visible, qué servicios
  son candidatos a reemplazarse por soluciones de terceros sin que eso se
  perciba como una regresión arquitectónica (es una decisión ya prevista).

**Negativas / riesgos:**
- Hexagonal en servicios casi-CRUD (`organization_service`,
  `resource_service`) agrega una capa de indirección (puertos/adaptadores)
  que, en el caso más simple, es más código del estrictamente necesario
  para un CRUD con validaciones. Se acepta este costo a cambio de
  consistencia.
- La clasificación core/supporting/generic requiere disciplina de equipo:
  si no se respeta (ej. se empieza a meter lógica de negocio compleja en
  un "generic subdomain"), la clasificación deja de reflejar la realidad
  y pierde utilidad como guía de dónde invertir esfuerzo.

## Referencias
- `sig-desk-architecture-spec.yaml` → `arquitectura_general.estilo`
- `sig-desk-architecture-spec.yaml` → `clasificacion_estrategica_ddd`
- `sig-desk-architecture-spec.yaml` → `hexagonal_tickets_service` (único servicio con el detalle hexagonal completo documentado, por ser core domain)
- ADR-0003 (workflow_service: construcción propia vs. adopción de motor de terceros) — decisión derivada directamente de que `workflow_service` está clasificado como generic subdomain acá
