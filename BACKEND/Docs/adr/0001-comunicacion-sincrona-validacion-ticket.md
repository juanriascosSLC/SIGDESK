# ADR-0001: Comunicación síncrona para validación de recurso y agente al crear un ticket

## Estado
Aceptada

> **Nota de superación (2026-07-28):** el contexto de este ADR asumía
> "microservicios con bounded context por servicio" (`resource_service` y
> `organization_service` como servicios HTTP separados). Eso está
> superado por ADR-0006 (monolito modular en Go): SIG-DESK es hoy un
> único binario Go con módulos bajo `internal/`, no servicios separados.
> La decisión de fondo de este ADR se mantiene íntegra — validar
> sincrónicamente el recurso y el agente IT al crear un ticket, antes de
> persistir el agregado — pero el mecanismo cambia: hoy es una **llamada
> de función in-process** dentro del mismo binario, no una llamada HTTP
> entre servicios. Ver ADR-0006 para el detalle.

## Fecha
2026-07-03

## Contexto

SIG-Desk está diseñado como una arquitectura de microservicios con un
bounded context por servicio, base de datos propia por servicio (sin FK
cruzadas) y comunicación por coreografía de eventos como patrón general
(ver `catalogo_domain_events` en la spec de arquitectura).

Sin embargo, `tickets_service` tiene una restricción de negocio no
negociable: **todo ticket debe referenciar un recurso específico
obligatoriamente al crearse** (`resource_management.vinculacion_obligatoria_con_tickets`),
y ese recurso/agente debe existir y estar en un estado válido en el
momento exacto de la creación.

Un modelo puramente asíncrono (crear el ticket y validar el recurso/agente
después, vía eventos) introduce dos problemas inaceptables para este caso
de uso:

1. **Estado transitorio inválido**: existiría una ventana de tiempo en la
   que un ticket está "creado" pero referencia un recurso o agente que
   podría no existir, estar dado de baja, o no tener la especialidad
   requerida — violando una invariante de dominio en el momento de la
   creación, no después.
2. **Complejidad de compensación**: manejar el caso de "ticket creado
   pero recurso inválido" requeriría un flujo de compensación (Saga) para
   un caso que en el 99% de los casos es instantáneo y de bajo costo de
   validación.

## Decisión

`tickets_service` valida sincrónicamente contra `resource_service` y
`organization_service` (vía HTTP) en el momento de crear un ticket, antes
de persistir el agregado `Ticket`. Esta es la **única excepción explícita**
al patrón general de coreografía basada en eventos.

Los puertos de salida correspondientes son:

- `RecursoValidatorPort` → adaptador `ResourceServiceHttpAdapter`
- `AgenteValidatorPort` → adaptador `OrganizationServiceHttpAdapter`

Ambos puertos viven en la capa de aplicación de `tickets_service`
(ver `hexagonal_tickets_service.puertos_salida`), preservando el
aislamiento del dominio: el dominio (`Ticket` aggregate root) nunca
conoce HTTP, solo conoce la interfaz del puerto.

## Alternativas consideradas

| Alternativa | Por qué se descartó |
|---|---|
| Validación asíncrona + Saga de compensación | Complejidad desproporcionada para una validación que en la mayoría de los casos es de milisegundos; requiere estado intermedio "ticket pendiente de validación" que no existe en el modelo de negocio actual. |
| Réplica local de datos de recurso/agente en `tickets_service` (vista materializada vía eventos) | Introduce inconsistencia eventual justo en el dato más crítico para la invariante de creación; agrega complejidad de sincronización sin eliminar la necesidad de una validación "fresca" en el instante de creación. |
| Ticket en estado "borrador" hasta validación asíncrona | Cambia el modelo de negocio (el usuario ya espera confirmación inmediata al crear un ticket); no está soportado por `lifecycle_ticket` tal como está definido (abierto → en progreso → resuelto → cerrado → reabierto, sin estado "borrador"). |

## Consecuencias

**Positivas:**
- Garantiza que la invariante de dominio ("todo ticket referencia un
  recurso/agente válido") se cumple en el instante de creación, sin
  estados intermedios inválidos.
- Modelo mental simple: crear un ticket es una operación atómica desde
  la perspectiva del usuario.

**Negativas (riesgo aceptado):**
- `tickets_service` queda acoplado operativamente a la disponibilidad de
  `resource_service` y `organization_service`. Si cualquiera de los dos
  cae, **no se pueden crear tickets nuevos** (aunque el resto del sistema
  siga funcionando: tickets existentes, notificaciones, reportes, etc.).
- Introduce latencia de red síncrona en el flujo de creación (dos llamadas
  HTTP adicionales antes de responder al cliente).

## Mitigación requerida

Circuit breaker + timeout + reintentos en ambos adaptadores de salida
(`ResourceServiceHttpAdapter` y `OrganizationServiceHttpAdapter`).

**Restricción de diseño explícita**: esta mitigación se implementa
exclusivamente en la capa de adaptadores de salida (infraestructura).
El dominio y la capa de aplicación (`CrearTicketUseCase`) nunca deben
conocer conceptos de circuit breaker, timeout o reintentos — solo
invocan el puerto (`RecursoValidatorPort`, `AgenteValidatorPort`) y
reciben éxito o fallo.

## Pendiente

Los parámetros concretos (umbral de apertura del circuit breaker,
duración del timeout, cantidad y estrategia de reintentos) **no están
definidos aún** — ver `pendientes_abiertos` en la spec de arquitectura.
Este ADR debe actualizarse (o generarse un ADR complementario) una vez
se fijen esos valores.

## Referencias
- `sig-desk-architecture-spec.yaml` → `arquitectura_general.riesgo_aceptado`
- `sig-desk-architecture-spec.yaml` → `hexagonal_tickets_service.puertos_salida`
- Diagrama: `hexagonal-tickets-service.mermaid` (adaptadores de salida `ResourceServiceHttpAdapter` / `OrganizationServiceHttpAdapter`, ambos marcados "circuit breaker")
