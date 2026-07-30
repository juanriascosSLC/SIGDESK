# ADR-0006: Monolito modular en Go vs. microservicios

## Estado
Aceptada

## Fecha
2026-07-28

## Contexto

Los ADR-0001, ADR-0002, ADR-0003 y ADR-0004, y la sección
`arquitectura_general` de `sig-desk-architecture-spec.yaml`, se escribieron
asumiendo una arquitectura de **microservicios**: un servicio por bounded
context (`tickets_service`, `organization_service`, `resource_service`,
`workflow_service`, `notification_service`, `ai_advisor_service`,
`audit_service`), cada uno con base de datos propia y sin FK cruzadas,
comunicados por coreografía de eventos vía Kafka (ADR-0004), con
`workflow_service` apoyado en Temporal (ADR-0003) como motor de workflows
de larga duración.

La implementación real, sin embargo, avanzó — y de hecho ya funciona en un
corte vertical completo (crear ticket, listar, kanban, detalle, cambiar
estado) — como algo distinto:

- **Un solo binario Go** (`cmd/api/main.go`), no siete servicios
  desplegables por separado.
- **Módulos bajo `internal/`** (`internal/tickets`, `internal/catalog`,
  `internal/platform`, y los que sigan agregándose), cada uno con
  arquitectura hexagonal propia (`domain/`, `application/`, `ports/`,
  `adapters/` — incluyendo `adapters/httpapi`, `adapters/postgres`,
  `adapters/memory`), tal como describe ADR-0002, pero como paquetes Go
  dentro de un mismo proceso, no como servicios independientes.
- **Una sola base de datos PostgreSQL compartida** (ver
  `BACKEND/migrations/`), no una base propia por bounded context.
- **Sin Kafka, sin Temporal, sin bus de eventos entre servicios**: no hay
  "entre servicios" porque no hay servicios separados — todo vive en el
  mismo binario.

Esta divergencia entre lo documentado y lo implementado no es un error de
código: es una decisión de arquitectura que nunca se declaró formalmente
por escrito, y que hoy genera contradicción activa entre la documentación
de arquitectura y la implementación real. Eso confunde a cualquier
desarrollador o agente de código que llegue al proyecto y lea primero los
ADRs o el spec YAML: asumiría microservicios, Kafka y Temporal donde en
realidad hay un monolito modular sin mensajería externa.

Además, el patrón de este proyecto ya tiene un precedente directo:
ADR-0005 resolvió una disyuntiva de lenguaje (Go vs. Rust) con el mismo
método que aplica acá — instrumentar y decidir con datos en vez de
comprometerse de antemano a la opción más compleja. Este ADR aplica el
mismo método a la disyuntiva de unidad de despliegue (monolito modular vs.
microservicios).

## Decisión

**SIG-DESK comenzará como un monolito modular en Go. Los módulos podrán
extraerse como microservicios únicamente cuando existan necesidades
demostrables de escalabilidad, despliegue independiente o aislamiento
operacional.**

Esto implica, en concreto:

1. **Unidad de despliegue**: un único binario Go (`cmd/api/main.go`) que
   agrupa todos los módulos del sistema. No hay despliegue independiente
   por bounded context mientras dure esta etapa.
2. **Unidad de modularización**: el paquete Go bajo `internal/` (ej.
   `internal/tickets`, `internal/catalog`) reemplaza al "servicio" como
   límite de bounded context. Cada módulo mantiene su propia arquitectura
   hexagonal interna (`domain/`, `application/`, `ports/`, `adapters/`),
   exactamente como describe ADR-0002 — solo cambia la unidad de
   despliegue de "servicio" a "módulo dentro de un binario".
3. **Base de datos**: una sola base PostgreSQL compartida por todos los
   módulos (ver migraciones en `BACKEND/migrations/`), no una base propia
   por bounded context. Los módulos deben seguir evitando acoplarse por
   FK cruzadas de forma indiscriminada cuando el dominio no lo justifique,
   pero ya no aplica la restricción estricta de microservicios de "sin FK
   cruzadas entre servicios" — se evalúa caso a caso dentro de la misma
   base.
4. **Comunicación entre módulos**: llamadas de función in-process
   (invocación directa de un puerto/caso de uso de un módulo desde otro,
   o desde la capa de composición en `cmd/api/main.go`), no HTTP ni
   eventos sobre un bus externo.

### Qué se mantiene de los ADRs anteriores (no se descartan sus ideas de fondo)

- **ADR-0001** sigue vigente como principio: validar síncronamente las
  invariantes de dominio críticas al crear un ticket (que el recurso y el
  agente IT referenciados existan y sean válidos) **antes** de persistir
  el agregado. Lo único que cambia es el mecanismo: hoy esa validación es
  una **llamada de función in-process** dentro del mismo binario (el
  puerto de salida invoca directamente el paquete/módulo correspondiente,
  no un adaptador HTTP contra un servicio remoto). El razonamiento de
  fondo — por qué debe ser síncrona y no un flujo asíncrono con
  compensación — se mantiene íntegro.
- **ADR-0002** sigue vigente en cuanto a "hexagonal por módulo" (antes
  "por servicio") y en cuanto a la clasificación estratégica DDD
  core/supporting/generic, que no depende de si la unidad de despliegue
  es un servicio o un módulo. Solo cambia la unidad de despliegue.
- **ADR-0005** (Go vs. Rust para el core domain) no se ve afectado por
  este ADR: sigue aplicando íntegramente, ahora en el contexto de un
  módulo (`internal/tickets`) en vez de un servicio separado
  (`tickets_service`).

### Qué queda superado explícitamente

Este ADR **supersede**:

- La parte de `arquitectura_general.despliegue` de ADR-0002 ("Microservicios
  — un servicio por bounded context, base de datos propia por servicio").
- La parte de "Kafka como bus de mensajería entre microservicios" de
  ADR-0004 (`arquitectura_general.comunicacion_entre_servicios`).
- El supuesto de servicios HTTP separados (`resource_service`,
  `organization_service`) de ADR-0001 — el mecanismo de validación
  síncrona se mantiene, pero como llamada in-process, no HTTP entre
  servicios.

### Qué queda en pausa/diferido (no descartado)

- **ADR-0003 (Temporal)**: en pausa. No se descarta Temporal como
  tecnología futura, pero no aplica mientras no exista un caso de uso
  real de workflows de larga duración (procesos de días con decisiones
  humanas intermedias) que no pueda resolverse con lógica in-process
  dentro del monolito. Hoy, cualquier workflow simple (reglas if/then por
  categoría de ticket) puede vivir como lógica de aplicación dentro del
  mismo binario, sin motor de orquestación externo.
- **ADR-0004 (Kafka)**: en pausa. No se descarta Kafka como tecnología
  futura, pero no aplica mientras no exista comunicación entre servicios
  separados. Hoy no hay "coreografía entre servicios" porque no hay
  servicios separados — si se necesita un patrón de publicación/suscripción
  de eventos de dominio, puede resolverse in-process (ej. un bus de
  eventos en memoria dentro del mismo binario) sin infraestructura de
  mensajería externa.

## Criterio explícito de extracción a microservicio

Siguiendo el mismo método que ADR-0005 aplicó a la decisión de lenguaje
(instrumentar primero, decidir con datos, no por especulación), un módulo
se extrae a microservicio únicamente cuando la operación real del sistema
muestra, de forma sostenida y no puntual, alguna de estas tres
necesidades:

1. **Escalabilidad independiente**: un módulo requiere escalar
   horizontalmente (más réplicas, más recursos de cómputo/memoria) a un
   ritmo claramente distinto del resto del sistema, y esa asimetría es
   medible (ej. métricas de CPU/memoria/latencia por módulo, no
   intuición).
2. **Despliegue independiente**: un módulo necesita su propio ciclo de
   release — cambios más frecuentes, o con mayor riesgo, que justifiquen
   desacoplar su despliegue del resto del binario para no bloquear ni ser
   bloqueado por cambios en otros módulos.
3. **Aislamiento operacional**: un módulo tiene requisitos de
   seguridad/compliance distintos al resto (ej. datos regulados que
   exigen un perímetro de red o de acceso separado), o consume recursos de
   forma muy dispar al resto del sistema (ej. cómputo pesado que no debe
   competir con el resto de las peticiones del monolito).

Mientras ninguno de estos tres criterios se cumpla de forma demostrable
(con datos de operación real, no anticipación), el módulo permanece dentro
del monolito. Cuando alguno se cumpla, la extracción se decide y
documenta con un ADR complementario específico para ese módulo — nunca de
forma implícita ni como refactor silencioso.

## Alternativas consideradas

| Alternativa | Por qué se descartó |
|---|---|
| Mantener microservicios desde el día uno (como asumían los ADRs 0001-0004 y el spec original) | El equipo es pequeño y el dominio todavía está en validación (el propio corte vertical actual es la primera prueba real de flujo end-to-end). La complejidad operativa de N bases de datos propias más un bus de eventos (Kafka) no se justifica todavía: no hay necesidad demostrada de escalar módulos de forma independiente, ni de desplegarlos por separado, ni de aislarlos operacionalmente. Pagar ese costo de infraestructura y coordinación desde el día uno, sin esa necesidad, hubiera retrasado la entrega del corte vertical funcional sin beneficio real hoy. |
| Monolito sin modularización interna (un solo paquete `internal` sin separación por dominio) | Perdería la separación de bounded contexts y la arquitectura hexagonal por módulo que ya está construida (`internal/tickets`, `internal/catalog`, cada uno con `domain/application/ports/adapters` propios). Además dificultaría una futura extracción a microservicio: si los módulos no están ya separados con puertos explícitos, extraer uno más adelante requeriría primero deshacer el acoplamiento, en vez de simplemente mover un módulo ya desacoplado a su propio proceso. |

## Consecuencias

**Positivas:**
- Elimina la contradicción activa entre documentación de arquitectura
  (microservicios, Kafka, Temporal) e implementación real (monolito
  modular en Go, sin Kafka, sin Temporal) — cualquier desarrollador o
  agente de código que lea los ADRs y el spec ahora encuentra una
  declaración explícita y actualizada.
- Reduce drásticamente la complejidad operativa inicial: un solo binario
  para desplegar, una sola base de datos para operar, sin bus de mensajería
  ni motor de workflows externos que mantener.
- Preserva el trabajo de diseño ya invertido (hexagonal por módulo,
  clasificación DDD, puertos/adaptadores) como base directa para una
  futura extracción, si llega a ser necesaria.
- Aplica el mismo rigor metodológico que ADR-0005: decisiones de
  arquitectura basadas en necesidad demostrable, no en anticipación.

**Negativas / riesgos aceptados:**
- Si en el futuro se cumple alguno de los tres criterios de extracción, el
  trabajo de separar un módulo en microservicio (definir su propia base de
  datos, su propio despliegue, reemplazar llamadas in-process por HTTP o
  eventos) tiene un costo que no se paga hoy. Se acepta ese costo diferido
  a cambio de no pagar hoy el costo cierto de operar microservicios sin
  necesidad comprobada.
- Todos los módulos comparten el mismo proceso y la misma base de datos:
  un bug grave o una fuga de recursos en un módulo puede afectar la
  disponibilidad del resto del sistema (no hay aislamiento de fallos entre
  módulos como sí lo habría entre servicios separados). Se acepta este
  riesgo mientras la escala y complejidad del sistema no lo justifiquen.
- Requiere disciplina de equipo para no comprometer la separación de
  módulos ya lograda (ej. no acoplar directamente el dominio de un módulo
  con el de otro sin pasar por sus puertos) — si esa disciplina no se
  mantiene, una futura extracción a microservicio sería mucho más costosa.

## Referencias
- ADR-0001 (comunicación síncrona para validación de recurso/agente al
  crear un ticket) — se mantiene el principio, cambia el mecanismo a
  in-process.
- ADR-0002 (hexagonal por servicio + clasificación DDD) — se mantiene como
  "hexagonal por módulo"; supersede la parte de `despliegue: microservicios`.
- ADR-0003 (Temporal como motor de workflows) — queda diferido, no
  descartado.
- ADR-0004 (Kafka como bus de mensajería) — queda diferido, no descartado.
- ADR-0005 (Go vs. Rust para tickets_service) — precedente metodológico
  directo: instrumentar y decidir con datos, aplicado acá a "cuándo
  extraer un módulo a microservicio" en vez de "cuándo migrar de
  lenguaje".
- `sig-desk-architecture-spec (3).yaml` → `arquitectura_general` (sección
  actualizada para reflejar monolito modular, ver changelog v0.5).
- `BACKEND/cmd/api/main.go`, `BACKEND/internal/tickets`,
  `BACKEND/internal/catalog`, `BACKEND/internal/platform` — implementación
  real que motiva este ADR.
- `BACKEND/migrations/` — base de datos PostgreSQL única y compartida.
