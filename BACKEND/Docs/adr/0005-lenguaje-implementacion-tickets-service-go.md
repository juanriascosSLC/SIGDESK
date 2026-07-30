# ADR-0005: Lenguaje de implementación de tickets_service — Go full-stack, con instrumentación para evaluar migración selectiva a Rust

## Estado
Aceptada

> **Nota de superación (2026-07-28):** la elección de Go para el core
> domain sigue siendo correcta y no cambia. Lo que sí queda
> recontextualizado por ADR-0006 (monolito modular en Go) es el marco de
> referencia: este ADR menciona `tickets_service` como microservicio
> separado, con Kafka y Temporal como integraciones ya decididas. Hoy
> `tickets_service` es el **módulo** `internal/tickets` dentro de un único
> binario Go, y Kafka (ADR-0004) y Temporal (ADR-0003) están diferidos, no
> activos. El razonamiento de fondo sobre Go vs. Rust (equipo, escala,
> madurez de SDKs, criterio de revisión basado en métricas) se mantiene
> íntegro y aplica igual dentro del monolito. Ver ADR-0006 para el
> detalle.

## Fecha
2026-07-21

## Contexto

Con el crecimiento de alcance de SIG-Desk (workflows más sofisticados vía
Temporal, agentes IT, conectividad con herramientas externas), surgió la
propuesta de una arquitectura polyglot para `tickets_service` (core
domain, ver ADR-0002):

- **Rust** para el dominio y la capa de aplicación (domain + application
  layer de la arquitectura hexagonal).
- **Go** como capa de API (adaptadores de entrada: HTTP/REST, gRPC,
  mensajería), exponiendo la lógica de negocio en Rust vía bindings/FFI
  en el mismo proceso.
- **Python (PyO3)** como "andamiaje" (scaffolding).

Esta propuesta se evaluó en profundidad (research previo, ver referencias)
contra el contexto real del proyecto:

1. **Equipo**: experiencia sólida en Go y Python, poca experiencia en
   Rust.
2. **Escala**: sistema de ticketing empresarial (decenas a cientos de
   miles de tickets, 10-50 agentes IT concurrentes, 100-500
   tickets/día según `nfr.md`) — un régimen de throughput bajo, con
   latencia dominada por I/O (base de datos, Kafka, validación síncrona
   HTTP con circuit breaker, ver ADR-0001), no por CPU del dominio.
3. **Integraciones ya decididas**: Apache Kafka (ADR-0004) y Temporal
   (ADR-0003) como bus de mensajería y motor de workflows. El SDK
   oficial de Temporal para Go es de primera clase (GA); el soporte
   nativo de Rust es sensiblemente menos maduro. Los clientes Kafka en
   Go (confluent-kafka-go, franz-go, sarama) son igualmente maduros y
   ampliamente probados en producción.
4. **Rol real de PyO3 en la industria**: el patrón dominante es
   Rust-core expuesto como paquete Python (Polars, Pydantic-core, ruff),
   no Python como "andamiaje" embebido dentro de un binario de
   producción escrito en otro lenguaje. Usar Python vía PyO3 dentro del
   proceso de `tickets_service` no tiene un análogo sostenido en la
   industria y agrega una tercera superficie de mantenimiento sin
   beneficio de dominio.
5. **Riesgo del binding Go↔Rust en el mismo proceso**: cruzar el ABI de
   C (cgo + cbindgen) reintroduce en la frontera exactamente las clases
   de bug que Rust existe para eliminar (use-after-free, leaks, mal
   manejo de lifetimes), agravado por un equipo sin experiencia previa
   en Rust. El overhead de cgo por llamada, combinado con las reglas
   estrictas de paso de punteros del GC móvil de Go, hace que este
   patrón sea el más caro y frágil de todas las alternativas evaluadas,
   sin ganancia de rendimiento real para el volumen de este dominio.
6. **Casos reales de adopción de Rust en producción** (Discord Read
   States, Cloudflare Pingora, AWS Firecracker) corresponden a
   infraestructura de altísimo volumen o sensibilidad extrema a
   latencia de cola por GC — no a lógica de dominio CRUD-transaccional
   como un core domain de ticketing.

En síntesis: la arquitectura polyglot de 3 lenguajes en un mismo proceso
es sobre-ingeniería para el estado y la escala actuales del proyecto, y
su coste de mantenimiento (onboarding, debugging cross-language,
toolchains de build separados) supera cualquier beneficio de rendimiento
hoy inexistente. Al mismo tiempo, no se descarta que en el futuro, a
medida que el sistema escale (mayor volumen de eventos Kafka, reglas de
negocio más pesadas, mayor concurrencia), aparezcan hotspots concretos
que sí justifiquen introducir Rust de forma aislada.

## Decisión

Se decide lo siguiente para `tickets_service`:

1. **Desarrollo full Go**: dominio, capa de aplicación, puertos y
   adaptadores de `tickets_service` se implementan enteramente en Go,
   con arquitectura hexagonal (ver ADR-0002) — aggregate root `Ticket`,
   entidades hijas (`TicketAsignacion`, `TicketSLA`,
   `TicketDestinatarios`, `TicketHistorial`), casos de uso
   (`CrearTicketUseCase`, `AsignarTicketUseCase`, `EscalarAITUseCase`,
   `CerrarTicketUseCase`), puertos de entrada/salida y adaptadores
   concretos. Se usan generics e interfaces de Go para expresar
   puertos/adaptadores y modelar invariantes de dominio (p.ej. la
   máquina de estados del ticket) mediante tipos y tests, sin necesidad
   de un segundo lenguaje.

2. **Python queda reservado exclusivamente como adaptador hacia las
   capas de IA**, es decir, para `ai_advisor_service` (triage, copiloto,
   chatbot) y cualquier integración futura con modelos/herramientas de
   IA. Python **no** se embebe dentro del proceso de `tickets_service`;
   vive en su propio servicio, consumiendo/publicando eventos vía Kafka
   según la coreografía ya definida (ver `domain-events.yaml`).

3. **Rust queda descartado para esta etapa**, tanto en la forma de
   dominio-en-Rust-tras-API-Go (FFI en el mismo proceso) como en
   cualquier otra forma, hasta que se cumpla la condición de la sección
   siguiente.

4. **Se instrumenta el sistema desde el día uno** para poder tomar una
   decisión de migración basada en datos, no en especulación:
   - Métricas de goroutines: conteo activo, tiempo en scheduler,
     contención de canales/mutex, en los puntos calientes de
     `tickets_service` (creación de ticket, consumo de eventos Kafka,
     motor de asignación).
   - Métricas de garbage collector de Go: frecuencia y duración de
     pausas (`GOGC`/`GOMEMLIMIT` como primera palanca de ajuste antes de
     considerar cualquier reescritura).
   - Latencia end-to-end por caso de uso (p50/p95/p99/p999).
   - Lag de consumidores Kafka por tópico.
   - Uso de CPU por servicio/goroutine bajo carga real (no sintética).

5. **Criterio explícito de revisión**: esta decisión se revisita — no
   automáticamente, sino como un ADR complementario — únicamente si la
   instrumentación anterior muestra, de forma sostenida y no puntual,
   alguno de estos síntomas en un componente identificado:
   - Degradación de p99/p999 atribuible a pausas de GC, después de haber
     agotado el tuning de Go (pooling de objetos, ajuste de
     `GOGC`/`GOMEMLIMIT`).
   - Un consumidor Kafka que no logra mantener el ritmo de ingesta pese
     a scaling horizontal y optimización de Go.
   - Un motor de reglas/evaluación con cómputo pesado por ticket que
     sature CPU de forma medible y consistente.
   Si se cumple alguno de estos criterios, la migración se evalúa
   **por componente aislado** (microservicio Rust separado vía
   gRPC/Kafka, o Rust→WASM embebido con un runtime puro-Go como
   `wazero`), nunca como binding FFI en el mismo proceso que
   `tickets_service`.

## Alternativas consideradas

| Alternativa | Por qué se descartó (o se deja en espera) |
|---|---|
| Rust (dominio) + Go (API) vía FFI en el mismo proceso + Python/PyO3 andamiaje | Máximo coste de mantenimiento (3 toolchains, debugging cross-language Go→Rust→Python) sin ganancia de rendimiento medible para el volumen actual del dominio; reintroduce riesgos de memoria en la frontera FFI justo donde Rust debería evitarlos; el equipo no tiene experiencia previa en Rust. |
| Todo en Rust (dominio + API, ej. Axum/Actix) | Curva de aprendizaje pronunciada para un equipo sin experiencia Rust, retrasando la entrega del core domain; SDK de Temporal en Rust menos maduro que el de Go; talento Rust más escaso en el mercado. Se descarta por ahora, no de forma permanente. |
| Rust solo en hotspots, decidido de antemano sin medir | Se descarta decidir *a priori* qué sería un hotspot — el research mostró que la intuición sobre dónde "necesitaríamos" Rust suele no coincidir con los cuellos de botella reales medidos en producción. Se prefiere instrumentar primero y decidir con datos. |
| PyO3 como adaptador/andamiaje dentro del binario de `tickets_service` | El patrón dominante en la industria es la dirección inversa (Rust-core expuesto como paquete Python); no hay un caso de uso claro que justifique un tercer runtime dentro del proceso del core domain. |

## Consecuencias

**Positivas:**
- Desarrollo del core domain a máxima velocidad posible, aprovechando la
  experiencia real del equipo (Go y Python), sin curva de aprendizaje
  adicional.
- Un solo toolchain de build or CI/CD para `tickets_service` (Go
  modules), consistente con el resto de servicios de la plataforma.
- Integración directa y de bajo riesgo con Kafka (ADR-0004) y Temporal
  (ADR-0003), ambos con SDKs de Go maduros y de primera clase.
- Decisión de migración futura basada en métricas reales de producción,
  no en especulación sobre requerimientos de rendimiento que hoy no
  existen.
- Python queda con un rol único y coherente en el sistema: adaptador de
  IA en `ai_advisor_service`, sin ambigüedad sobre dónde vive cada
  lenguaje.

**Negativas / riesgos aceptados:**
- Si en el futuro aparece un hotspot real, migrar ese componente aislado
  a Rust (o a WASM) tendrá un costo de reescritura e integración que no
  se paga hoy. Se acepta este costo diferido a cambio de no pagar hoy el
  costo (mayor y cierto) de una arquitectura polyglot sin necesidad
  comprobada.
- Requiere disciplina de instrumentación sostenida — si las métricas
  definidas en la Decisión no se implementan o no se revisan
  periódicamente, la futura decisión de migración volvería a tomarse sin
  datos, replicando el problema que este ADR busca evitar.
- Go, al no tener un sistema de ownership tan estricto como Rust, exige
  más disciplina propia del equipo (tests, encapsulación) para expresar
  invariantes de dominio que en Rust el compilador forzaría de forma
  nativa (p.ej. transiciones de estado del ticket). Se acepta este costo
  porque el research mostró que es abordable con buen diseño en Go y no
  requiere cambiar de lenguaje.

## Pendiente para terminar de cerrar la implementación

- Definir e implementar el dashboard de métricas (goroutines, GC, latencia
  por caso de uso, lag de Kafka) antes o durante el desarrollo inicial de
  `tickets_service` — no como tarea posterior al MVP.
- Definir umbrales numéricos concretos (SLOs) para cada síntoma listado
  en el criterio de revisión de la Decisión (p.ej. p99 máximo aceptable
  para `CrearTicketUseCase`, lag máximo aceptable por tópico Kafka) —
  hoy están descritos cualitativamente, falta cuantificarlos contra
  `nfr.md`.
- Confirmar con qué SDK de Kafka en Go se implementa el adaptador de
  salida (`KafkaEventPublisher`) — confluent-kafka-go, franz-go o
  sarama — evaluación pendiente, no bloqueante para esta decisión.
- Si en el futuro se activa el criterio de revisión: abrir un ADR
  complementario (no modificar este) que documente el componente
  aislado a migrar y la técnica elegida (microservicio Rust vía
  gRPC/Kafka vs. Rust→WASM embebido con `wazero`).

## Referencias
- `sig-desk-architecture-spec.yaml` → `clasificacion_estrategica_ddd.core_domain` (tickets_service)
- `sig-desk-architecture-spec.yaml` → `hexagonal_tickets_service`
- ADR-0001 (comunicación síncrona con circuit breaker — parte del perfil de latencia I/O-bound del dominio)
- ADR-0002 (hexagonal por servicio + clasificación DDD — origen de por qué tickets_service es core domain)
- ADR-0003 (Temporal como motor de workflows — SDK Go de primera clase, factor a favor de esta decisión)
- ADR-0004 (Kafka como bus de mensajería — clientes Go maduros, factor a favor de esta decisión)
- `nfr.md` → sección de escala (100-500 tickets/día, 10-50 agentes IT concurrentes) — base del argumento de que el volumen actual no justifica Rust
- Research previo (sesión 2026-07-21): comparativa Rust/Go/Python para tickets_service, casos de estudio de adopción de Rust en producción (Discord, Cloudflare Pingora, AWS Firecracker), y evaluación de madurez de SDKs Kafka/Temporal en Go vs. Rust
