# ADR-0003: Motor de workflows — Temporal

## Estado
Aceptada

> **Nota de superación (2026-07-28):** esta decisión queda **diferida**
> por ADR-0006 (monolito modular en Go), no descartada. Temporal se
> evaluó para un `workflow_service` como microservicio separado; hoy no
> existe tal servicio ni el caso de uso real de workflows de larga
> duración que justificaría adoptarlo. Mientras eso no ocurra, cualquier
> workflow simple (reglas if/then por categoría de ticket) puede vivir
> como lógica in-process dentro del monolito. Temporal se mantiene como
> tecnología candidata a futuro si aparece un caso de uso real de
> orquestación de larga duración. Ver ADR-0006 para el detalle.

## Fecha
2026-07-03 (análisis inicial) — decisión confirmada 2026-07-03

## Decisión final

Se adopta **Temporal** como motor de workflows para `workflow_service`,
descartando construcción propia, Camunda y la opción de librería de
reglas embebida evaluadas originalmente.

**Motivo de la decisión**: a diferencia de lo asumido en el análisis
inicial de este ADR (que suponía reglas if/then simples y reactivas), se
confirmó que los workflows reales de SIG-Desk **sí requieren pasos de
larga duración con decisiones humanas intermedias** — procesos que se
extienden en el orden de días, no de milisegundos, con esperas de
aprobación/acción humana entre pasos. Esto cambia el caso de uso de
"evaluar una condición y disparar una acción inmediata" a "orquestar un
proceso que puede estar en pausa por días esperando una decisión humana,
con necesidad de reintentos, timeouts y recuperación de estado ante
fallos". Ese es exactamente el problema que Temporal resuelve (durable
execution), y el que la librería de reglas embebida (Opción C, descartada)
no puede cubrir sin reconstruir gran parte de lo que Temporal ya
resuelve.

Camunda quedó descartado frente a Temporal por preferencia del equipo por
un modelo código-first en vez de modelado BPMN visual — no hubo un motivo
técnico de exclusión adicional a lo ya documentado en el análisis
original (ver más abajo).

## Contexto

`workflow_service` es el motor de reglas if/then que **ejecuta** —no solo
declara— la automatización de otros dominios: asignación de ticket,
asignación de IT, administración de SLAs, administración de destinatarios
y disparo de notificaciones (ver
`operational_modules.modulo_workflows.motor_ejecucion_reglas` en el spec).

En la clasificación estratégica DDD (ADR-0002), `workflow_service` quedó
marcado como **generic subdomain**: resuelve un problema genérico (motor
de reglas / orquestación de procesos), no algo específico y diferenciador
del negocio de SIG-Desk. El propio spec lo señala explícitamente como
`"Candidato a producto de terceros (Temporal, Camunda) en vez de
construcción propia"` — evaluación que se resolvió con este ADR.

Esta decisión importa porque `workflow_service` está en el camino crítico
de casi toda la automatización del sistema: si se construye mal o tarde,
retrasa la entrega de features que dependen de reglas (SLA, asignación
automática, notificaciones condicionales).

## Opciones evaluadas (análisis original, mantenido como referencia)

### Opción A — Construcción propia
Un servicio propio con editor de reglas if/then, versionado de workflows,
activación/desactivación, y un motor de ejecución que reacciona a
`TicketCreado` (y otros eventos) para evaluar condiciones y publicar
`ReglaEjecutada`.

**A favor:**
- Control total sobre el modelo de datos y la semántica exacta de las
  reglas (condiciones sobre categoría de ticket, habilidad de agente,
  estado de SLA, etc. — todo modelado a medida).
- Sin dependencia de infraestructura externa ni curva de aprendizaje de
  una herramienta de terceros.
- Integración más simple con el resto del sistema, que ya está pensado en
  eventos de dominio propios (`catalogo_domain_events` / `domain-events.yaml`).

**En contra:**
- Reinventar un motor de reglas/orquestación es un problema ya resuelto
  por otros — alto costo de desarrollo y mantenimiento (versionado de
  reglas, manejo de errores en ejecución, reintentos, observabilidad) para
  un subdominio que la propia clasificación DDD dice que no es
  diferenciador.
- El equipo asume el costo de mantener correcto un motor de ejecución de
  reglas a largo plazo, incluyendo casos borde (reglas conflictivas,
  orden de evaluación, fallos parciales).

### Opción B — Adoptar un motor existente (Temporal o Camunda)
Usar Temporal o Camunda como motor de orquestación, con `workflow_service`
reducido a una capa fina de integración (traduce eventos de dominio de
SIG-Desk hacia/desde el motor).

**A favor:**
- Evita reconstruir capacidades ya maduras: versionado de workflows,
  reintentos, observabilidad, manejo de fallos, escalado — es
  literalmente el problema que estas herramientas resuelven.
- Coherente con la propia clasificación DDD del proyecto: invertir el
  esfuerzo de ingeniería propio en el core domain (`tickets_service`), no
  en un generic subdomain.
- Curva de mejora futura: si el negocio necesita workflows más complejos
  (aprobaciones multi-paso, timeouts largos, compensaciones), un motor
  maduro ya lo soporta.

**En contra:**
- Introduce una dependencia de infraestructura externa nueva (otro
  componente para operar, versionar y monitorear).
- Curva de aprendizaje del equipo con la herramienta elegida.
- El modelo de "reglas if/then simples por categoría de ticket" que
  describe el spec (`workflow_por_categoria_ticket`) es más simple que lo
  que Temporal/Camunda están pensados para resolver (orquestación de
  procesos de negocio complejos, de larga duración) — **posible
  sobre-ingeniería** si el caso de uso real de SIG-Desk nunca crece más
  allá de reglas simples de asignación/notificación.
- Costo de integración: hay que decidir cómo el resto del sistema
  (coreografía basada en eventos, con `TicketCreado` disparando
  `ReglaEjecutada`) se traduce al modelo de ejecución del motor elegido.

### Opción C — Librería de reglas embebida (sin motor separado)
Usar una librería de reglas (ej. un rules engine embebido en el propio
`tickets_service` o como librería compartida) en vez de un servicio
separado y en vez de un motor de orquestación completo.

**A favor:**
- Evita tanto el costo de reinventar un motor completo (Opción A) como el
  de operar infraestructura de orquestación pesada para un caso de uso
  simple (Opción B).
- Más simple de razonar si las reglas son, en efecto, solo condiciones
  if/then sin pasos de larga duración ni compensaciones complejas.

**En contra:**
- Debilita el principio de diseño ya establecido en el spec de que
  Workflows es un motor **transversal** que ejecuta automatización sobre
  *varios* dominios (no solo tickets) — embeberlo en `tickets_service`
  rompe esa transversalidad y probablemente requiera duplicar lógica en
  otros servicios más adelante.
- Pierde la ventaja de versionado/activación-desactivación de workflows
  como entidad de primera clase si no se elige una librería que lo
  soporte explícitamente.

## Consecuencias

**Positivas:**
- Temporal maneja de forma nativa lo que era el mayor riesgo de la
  opción de librería embebida: procesos que esperan días por una decisión
  humana, con reintentos, timeouts y recuperación de estado ante fallos
  sin que el equipo tenga que construir esa infraestructura de
  durabilidad desde cero.
- Alta observabilidad: Temporal UI muestra el historial completo de
  ejecución de cada workflow, lo cual además complementa
  (no reemplaza) el requisito de `historial_ticket` y
  `reportes_auditoria.log_auditoria_universal` del spec.
- Modelo código-first: los workflows se escriben en el mismo lenguaje que
  el resto de los servicios, sin requerir que el equipo aprenda BPMN.

**Negativas / riesgos aceptados:**
- Se suma un componente de infraestructura nuevo (Temporal Server o
  Temporal Cloud) que hay que operar, monitorear y mantener actualizado.
- Curva de aprendizaje del paradigma de "durable execution" — el equipo
  necesita entender el modelo de workflows/activities de Temporal antes
  de ser productivo.
- Costo recurrente si se opta por Temporal Cloud (pricing por "actions" /
  unidades de ejecución) — pendiente de cuantificar contra el costo de
  operar Temporal Server self-hosted.

## Pendiente para terminar de cerrar la implementación
- Elegir entre **Temporal Cloud (gestionado)** y **Temporal Server
  self-hosted (open source)** — no evaluado en profundidad en este ADR,
  ver `tech-research-bus-y-workflows.md` sección 2.3 para el análisis de
  costo preliminar.
- Definir los workflows reales (al menos 2-3) con pasos humanos
  explícitos, para dimensionar timeouts, política de reintentos y qué
  ocurre si nadie responde a tiempo (escalamiento automático vía
  Workflows → Notificaciones).
- Reflejar esta decisión en `sig-desk-architecture-spec.yaml` →
  `clasificacion_estrategica_ddd.generic_subdomains` (ya actualizado, ver
  changelog v0.4).

## Referencias
- `sig-desk-architecture-spec.yaml` → `clasificacion_estrategica_ddd.generic_subdomains` (nota sobre `workflow_service`)
- `sig-desk-architecture-spec.yaml` → `pendientes_abiertos` ("Evaluar si workflow_service se construye propio o se adopta un motor existente")
- `domain-events.yaml` → sección `workflow_service` (eventos `WorkflowPublicado`, `WorkflowDesactivado`, `ReglaEjecutada`)
- ADR-0002 (clasificación estratégica DDD — origen de por qué `workflow_service` es candidato a terceros)
