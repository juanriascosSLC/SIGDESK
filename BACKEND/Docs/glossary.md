# Glosario de Lenguaje Ubicuo — SIG-Desk

Este documento define, sin ambigüedad, cada término del dominio usado en
SIG-Desk. Un mismo término debe significar exactamente lo mismo en código,
documentación, conversación de equipo y en cualquier prompt o contexto que
se le dé a una IA. Si un término no está acá, no se usa hasta definirlo.

**Regla de mantenimiento**: cada vez que se agregue una entidad o lógica de
negocio nueva a `sig-desk-architecture-spec.yaml`, agregar su entrada
correspondiente acá en la misma sesión de trabajo.

---

## Organization

**Company**
Nodo del árbol jerárquico Empresa → Departamento → Equipo. No es
multi-tenant: todos los usuarios y agentes conviven en un único árbol de
companies. Relación de jerarquía consigo misma vía `parent_id`.

**Usuario**
Persona que pertenece a un nodo del árbol de `Company` y que puede crear
tickets. Todo usuario tiene un rol asociado.

**Agente IT / Support**
Staff de soporte IT. A diferencia de otros sistemas de service desk, el
agente **no es un actor externo**: es un usuario que además pertenece a un
nodo del árbol de `Company` (el equipo de IT es un departamento más, no una
entidad aparte). Tiene una `especialidad_o_categoria` que determina qué
tickets puede resolver.

> ⚠️ **Nota de nomenclatura pendiente**: el spec YAML (`sig-desk-architecture-spec.yaml`)
> y los diagramas actuales usan `agentes` / `Agente` / `AgenteValidatorPort` /
> `AgenteCreado` / `AgenteEspecialidadActualizada`, etc. Si se adopta
> formalmente "Agente IT / Support" como término del lenguaje ubicuo, este
> cambio debería propagarse también a:
> - `sig-desk-architecture-spec.yaml` (entidad `agentes` y todas sus lógicas de negocio asociadas)
> - Catálogo de eventos (`AgenteCreado`, `AgenteEspecialidadActualizada`, `AgenteCapacidadCargaActualizada`)
> - Puertos/adaptadores del hexagonal (`AgenteValidatorPort`, `OrganizationServiceHttpAdapter`)
> - Diagramas (`hexagonal-tickets-service`, DER)
>
> Hasta que ese cambio se confirme y ejecute de forma consistente en todos
> esos artefactos, "Agente" sigue siendo el término vigente en código y
> spec — tratar "Agente IT / Support" como el nombre objetivo, no como
> sinónimo intercambiable, para evitar inconsistencia entre documentación y
> código.

**Habilidad (de un Agente)**
Categoría o categorías de ticket que un agente está habilitado para
atender. Es el dato que alimenta directamente `asignacion_de_ticket` y
`asignacion_de_it`. No confundir con "rol": la habilidad determina *qué*
puede resolver; el rol determina *qué acciones* puede ejecutar en el
sistema. No confundir tampoco con "Capacidad" (ver más abajo), que se
refiere a la carga máxima de tickets simultáneos, no a qué categorías
resuelve.

> ⚠️ **Nota de nomenclatura pendiente**: el spec YAML usa
> `especialidad_o_categoria` como atributo del agente, y el catálogo de
> eventos usa `AgenteEspecialidadActualizada`. Si se adopta formalmente
> "Habilidad" como término del lenguaje ubicuo, este cambio debería
> propagarse también a:
> - `sig-desk-architecture-spec.yaml` (atributo `especialidad_o_categoria`, lógica `gestion_especialidad_agente`)
> - Catálogo de eventos (`AgenteEspecialidadActualizada` → payload `especialidad_nueva`)
> - Diagramas (DER: `Agentes.especialidad`)
>
> Hasta que esto se confirme y ejecute de forma consistente, "Especialidad"
> sigue siendo el término vigente en código y spec.

**Capacidad (de un Agente)**
Carga máxima de tickets que un agente puede tener asignados
simultáneamente. Corresponde al evento `AgenteCapacidadCargaActualizada`
(payload `capacidad`). No confundir con "Habilidad": la capacidad es un
número (cuántos tickets), la habilidad es una lista de categorías (qué
tipo de tickets).

**Rol**
Conjunto de permisos configurable por la organización. Los roles **no son
fijos ni predefinidos por el sistema** — cada organización los define. Un
rol determina, vía `permisos_por_rol`, qué acción sobre qué entidad puede
ejecutar cada usuario, y vía `capacidad_gestion_ticket_por_rol`, qué
alcance de tickets puede ver/editar (propios / de su equipo / de su
departamento / todos).

**Permiso**
Regla atómica que vincula un rol con una acción permitida sobre una
entidad específica. El conjunto de permisos de un rol forma la matriz de
`permisos_por_rol`.

---

## Resource Management

**Recurso**
Activo físico o de IT (hardware, licencia de software, o infraestructura
de red). Todo ticket debe referenciar un recurso obligatoriamente al
crearse. Un recurso puede compartirse entre varios departamentos/equipos
(relación muchos-a-muchos con `Company`, nunca uno-a-uno).

**Responsable de recurso**
Usuario que actúa como manager o propietario funcional de un recurso. No
es quien lo usa, sino quien es notificado cuando algo le ocurre al
recurso (ver `administracion_destinatarios`). Distinto del "creador del
ticket".

**Lifecycle del recurso**
Serie de estados por los que pasa un recurso: adquisición → en uso →
mantenimiento → baja. No confundir con el `lifecycle_ticket`, que es una
máquina de estados independiente.

**Vencimiento / mantenimiento programado**
Evento temporal asociado a un recurso (vencimiento de licencia,
mantenimiento programado) que dispara una alerta automática hacia
Notificaciones. Es lógica crítica: requiere automatización, no revisión
manual.

---

## Operational Modules — Tickets

**Ticket**
Aggregate root del dominio `tickets_service`. Representa una solicitud o
incidente que referencia obligatoriamente un recurso y tiene un creador,
una categoría, un lifecycle propio, un primer responsable (vía
`asignacion_de_ticket`) y, opcionalmente, un agente IT especializado (vía
`asignacion_de_it`).

**Lifecycle de ticket**
Máquina de estados del ticket: abierto → en progreso → resuelto → cerrado
→ reabierto. Es distinta y no debe confundirse con el lifecycle de un
recurso.

**Asignación de ticket**
Proceso que determina el **primer responsable** de un ticket, por regla
automática basada en la especialidad del agente y la categoría del
ticket, con opción de reasignación manual posterior. Es independiente de
`administracion_destinatarios` — asignar no es lo mismo que notificar.

**Asignación de IT**
Proceso de derivación de un ticket a un agente o equipo IT especializado,
que ocurre **solo si** el responsable inicial (definido en
`asignacion_de_ticket`) determina que se necesita esa derivación. No todo
ticket pasa por esta etapa.

> ⚠️ Pendiente de confirmar (ver `pendientes_abiertos` en la spec): si el
> paso de `asignacion_de_ticket` a `asignacion_de_it` es siempre una
> decisión manual del agente, o si también puede dispararse
> automáticamente por categoría.

**Administración de destinatarios**
Lógica que determina **a quién se notifica** sobre eventos de un ticket
(creador, responsables del recurso, otros stakeholders). Es
conceptualmente distinta de "quién resuelve el ticket" (eso lo define
`asignacion_de_ticket` / `asignacion_de_it`).

**Historial de ticket**
Registro de todos los cambios y eventos ocurridos sobre un ticket. Es la
salida/output del proceso `gestion_ticket`, no una entidad que se edita
directamente.

**Historial múltiple de IT**
Registro agregado que se genera cuando **más de un equipo IT** interviene
sobre el mismo ticket a lo largo de su ciclo de vida.

**SLA (Service Level Agreement) del ticket**
Conjunto de tiempos límite, timers y alertas de incumplimiento asociados
a un ticket. Un ticket no puede cerrarse sin que su SLA esté cumplido o
justificado explícitamente (invariante de dominio).

---

## Operational Modules — Workflows

**Workflow**
Regla de automatización tipo if/then asociada a una categoría de ticket.
Un workflow **no declara** intención — es ejecutado activamente por el
`motor_ejecucion_reglas`.

**Motor de ejecución de reglas**
Componente que evalúa las condiciones de los workflows activos y dispara
acciones concretas sobre: `asignacion_de_ticket`, `asignacion_de_it`,
`administracion_slas`, `administracion_destinatarios` y notificaciones.
Es la pieza que convierte una regla declarada en un efecto real sobre
otro dominio.

---

## Operational Modules — Notificaciones

**Canal (de notificación)**
Medio de entrega de una notificación: email, push, SMS o in-app.

**Plantilla de notificación**
Configuración de contenido asociada a un tipo de evento disparador. Una
plantilla por tipo de evento.

**Resolución de destinatarios**
Proceso que toma la lista producida por `administracion_destinatarios`
(de Tickets) o por `gestion_responsables_recurso` (de Resource
Management) y decide el envío efectivo por canal.

---

## Capas Transversales

> Estas capas no son dominios de negocio con datos maestros propios. Leen,
> observan o sugieren sobre las entidades de Organization, Resource
> Management y Operational Modules.

**Agente de IA**
Componente que **nunca ejecuta acciones autónomas** sobre el sistema.
Solo opera en dos modos:
- **Triage asistido**: sugiere categoría, prioridad o primer responsable
  de un ticket nuevo. Requiere confirmación humana antes de ejecutarse.
- **Atención directa (chatbot)**: interactúa con el usuario final, pero
  **nunca cierra un ticket por sí solo** — en algún punto siempre escala
  a un agente humano.

También cumple un rol de **copiloto de agentes**: sugerencias de
respuesta, resumen de contexto, recomendación de soluciones previas
basadas en el historial de tickets.

**Sugerencia (de IA)**
Output concreto generado por el Agente de IA (categoría sugerida,
prioridad sugerida, respuesta sugerida, etc.). Toda sugerencia tiene un
estado: aplicada (un humano la confirmó) o descartada (un humano la
rechazó). Este feedback alimenta las métricas de efectividad de IA.

**Reportes / Auditoría**
Capa transversal de mayor acoplamiento del sistema: registra el CRUD
completo (quién, qué, cuándo, valor anterior/nuevo) de **todas** las
entidades de **todos** los dominios. No tiene datos maestros propios más
allá del propio log.

**Alcance de rol (en reportes)**
Filtro que reutiliza `permisos_por_rol` de Organization para determinar
qué porción del log de auditoría o de los dashboards puede ver cada
usuario (ej.: un manager de departamento solo ve su propio alcance).

---

## Arquitectura y patrones (términos técnicos del proyecto)

**Bounded context**
Límite explícito de un dominio dentro del cual un término tiene un único
significado y un modelo de datos propio. En SIG-Desk, mientras dure la
fase de monolito modular (ver ADR-0006), cada bounded context corresponde
a un **módulo Go** (paquete bajo `internal/`, ej. `internal/tickets`,
`internal/catalog`) con su propio dominio/aplicación/puertos/adaptadores,
no necesariamente a un microservicio con base de datos propia. La
extracción a microservicio con base de datos propia es una posibilidad
futura — condicionada a necesidades demostrables de escalabilidad,
despliegue independiente o aislamiento operacional (ver ADR-0006) — no el
estado actual del proyecto.

**Puerto (hexagonal)**
Interfaz que define un contrato de entrada o salida del dominio, sin
conocer detalles de infraestructura. Ej.: `RecursoValidatorPort` es un
puerto de salida que el dominio invoca sin saber que, por detrás, hay una
llamada HTTP.

**Adaptador (hexagonal)**
Implementación concreta de un puerto, que sí conoce el detalle técnico
(HTTP, Kafka, Postgres, etc.). Ej.: `ResourceServiceHttpAdapter` es el
adaptador de salida que implementa `RecursoValidatorPort` vía HTTP.

**Coreografía basada en eventos**
Patrón de comunicación entre servicios donde cada servicio publica
eventos de dominio y los demás se suscriben, sin que exista un
orquestador central. Es el patrón por defecto en SIG-Desk, con una única
excepción documentada (ver ADR-0001).

**Evento de dominio**
Hecho inmutable que ocurrió en el sistema (ej.: `TicketCreado`,
`AgenteEspecialidadActualizada`). Tiene trigger, payload y consumidores
definidos explícitamente en el catálogo de eventos.

**Core domain**
Clasificación DDD para el subdominio que constituye el corazón
diferenciador del negocio y justifica la mayor inversión de diseño. En
SIG-Desk: `tickets_service`.

**Supporting subdomain**
Subdominio necesario pero no diferenciador; casi CRUD con validaciones.
En SIG-Desk: `organization_service`, `resource_service`.

**Generic subdomain**
Subdominio que resuelve un problema genérico, no específico del negocio,
y es candidato a resolverse con producto de terceros en vez de
construcción propia. En SIG-Desk: `workflow_service` (candidato a
Temporal/Camunda), `notification_service`, `audit_service`,
`ai_advisor_service`.

---

## Antónimos y distinciones que generan confusión frecuente

Esta sección existe porque son los pares de términos que más se confunden
en discusión de equipo o en prompts a una IA.

| Término A | Término B | Diferencia clave |
|---|---|---|
| Asignación de ticket | Administración de destinatarios | La primera define **quién resuelve**; la segunda define **a quién se notifica**. Son independientes entre sí. |
| Asignación de ticket | Asignación de IT | La primera es el **primer** responsable (siempre ocurre); la segunda es una **derivación posterior** (solo si es necesaria). |
| Lifecycle de ticket | Lifecycle de recurso | Son dos máquinas de estados distintas, sobre dos entidades distintas, sin relación de dependencia directa. |
| Rol | Habilidad de agente | El rol define **qué acciones** puede ejecutar un usuario en el sistema; la habilidad define **qué categorías de ticket** puede resolver un agente. |
| Workflow (regla declarada) | Motor de ejecución de reglas | El workflow es la **declaración** (if/then); el motor es el **componente que la ejecuta** en tiempo real. |
| Sugerencia de IA | Acción ejecutada | El Agente de IA **nunca** pasa de sugerencia a acción sin una confirmación humana explícita en el medio. |
