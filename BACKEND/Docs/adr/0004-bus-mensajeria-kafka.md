# ADR-0004: Bus de mensajería — Apache Kafka

## Estado
Aceptada

> **Nota de superación (2026-07-28):** esta decisión queda **diferida**
> por ADR-0006 (monolito modular en Go), no descartada. Kafka se evaluó
> como bus de mensajería entre microservicios separados; hoy SIG-DESK es
> un único binario sin servicios separados, por lo que no hay
> "comunicación entre servicios" que resolver con un bus externo. Mientras
> no exista esa necesidad, la coreografía de eventos, si se necesita,
> puede resolverse in-process (ej. un bus de eventos en memoria dentro del
> mismo binario). Kafka se mantiene como tecnología candidata a futuro si
> se extraen módulos a microservicios separados. Ver ADR-0006 para el
> detalle.

## Fecha
2026-07-03

## Contexto

SIG-Desk usa coreografía basada en eventos como patrón de comunicación
por defecto entre microservicios (excepción: validación síncrona de
recurso/agente IT al crear un ticket, ver ADR-0001). Faltaba elegir la
tecnología concreta de bus de mensajería (ver `pendientes_abiertos` en el
spec).

Dos requisitos del spec pesaron especialmente en esta decisión:

1. **`audit_service` se suscribe a TODOS los eventos de TODOS los
   servicios** y debe soportar `dashboards_tiempo_real` con "arquitectura
   basada en eventos, no solo consultas periódicas".
2. El diagrama hexagonal de `tickets_service` ya nombraba el adaptador de
   salida como `KafkaEventPublisher`, anticipando esta elección desde el
   diseño hexagonal inicial.

## Decisión

Se adopta **Apache Kafka** (idealmente operado por un proveedor
gestionado — Confluent Cloud, AWS MSK o Aiven — en vez de self-hosted, al
menos en las primeras etapas) como bus de mensajería para toda la
coreografía de eventos de SIG-Desk.

## Alternativas consideradas

| Alternativa | Por qué se descartó |
|---|---|
| RabbitMQ | Es un modelo de cola, no de log persistente: un mensaje desaparece al ser consumido. El requisito de `audit_service` (suscribirse a todo, con posibilidad implícita de reconstruir/auditar el historial completo) no es el patrón natural de una cola — hubiera forzado a construir un event store aparte solo para auditoría, duplicando infraestructura. |
| NATS JetStream | Técnicamente capaz de streaming con retención, pero con menor ecosistema de conectores/herramientas de analítica que Kafka, y menor pool de talento en el mercado con experiencia previa. |
| AWS SQS + SNS | Sin replay real (retención corta, sin log persistente) — un bug en `audit_service` que pierda o procese mal un evento no se podría "recuperar" reproduciendo el historial. Además, ata el proyecto a AWS específicamente sin que haya, hasta ahora, una decisión de proveedor cloud confirmada en el spec. |
| Kafka self-hosted (descartado como *primera* opción, no como tecnología) | La complejidad operativa de Kafka (tuning de particiones/réplicas, monitoreo especializado) es alta — operarlo mal sin un especialista dedicado es peor que no tenerlo. Se prefiere empezar con un proveedor gestionado y reevaluar self-hosting solo si el costo recurrente se vuelve significativo a mayor escala. |

Ver `tech-research-bus-y-workflows.md` sección 1 para el detalle completo
de la comparativa (throughput, latencia, costos estimados, casos de uso
similares).

## Consecuencias

**Positivas:**
- El modelo de retención/replay de Kafka encaja directamente con el
  requisito de auditoría universal — `audit_service` puede reconstruir
  estado histórico reprocesando el log si hace falta, algo que una cola
  tradicional no ofrece.
- Habilita `dashboards_tiempo_real` de forma nativa (streaming), sin
  depender de polling periódico.
- Consistente con lo que el diagrama hexagonal de `tickets_service` ya
  anticipaba (`KafkaEventPublisher`).

**Negativas / riesgos aceptados:**
- Complejidad operativa intrínsecamente alta si en algún momento se migra
  a self-hosted — mitigado, por ahora, usando un proveedor gestionado.
- Curva de aprendizaje del equipo con el modelo de particiones/tópicos de
  Kafka, mayor que con una cola tradicional tipo RabbitMQ.
- Costo recurrente de un proveedor gestionado, que escala con volumen de
  mensajes — a monitorear a medida que crece el uso real del sistema.

## Pendiente para terminar de cerrar la implementación
- Elegir proveedor gestionado específico (Confluent Cloud vs. AWS MSK vs.
  Aiven vs. otro) — no evaluado en profundidad, depende en parte de si ya
  hay un proveedor cloud elegido para el resto de la infraestructura.
- Definir estrategia de particionado por tópico (ej. por servicio
  productor, por tipo de evento, o por entidad como `ticket_id`) antes de
  implementar `KafkaEventPublisher` y los consumidores.
- Definir política de retención por tópico — `audit_service` probablemente
  necesita retención larga/ilimitada, mientras que tópicos operacionales
  (ej. `TicketSLAEnRiesgo`) pueden tener retención corta.

## Referencias
- `sig-desk-architecture-spec.yaml` → `arquitectura_general.comunicacion_entre_servicios`
- `sig-desk-architecture-spec.yaml` → `hexagonal_tickets_service.adaptadores_salida` (`KafkaEventPublisher`)
- `domain-events.yaml` — catálogo completo de eventos que viajarán por este bus
- `tech-research-bus-y-workflows.md` — análisis comparativo completo (sección 1)
