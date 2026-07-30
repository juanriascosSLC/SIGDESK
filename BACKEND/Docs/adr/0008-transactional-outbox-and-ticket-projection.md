# ADR-0008: Outbox transaccional y proyección de Tickets

- Estado: aceptado
- Fecha: 2026-07-28

## Contexto

El runtime genérico es la única autoridad para crear entidades y ejecutar sus
transiciones. Tickets necesita añadir comentarios, adjuntos, watchers, merge y
una vista optimizada de INC sin volver a implementar el esquema o workflow.

Una llamada síncrona mediante `ModuleGateway` no sirve para proyectar registros:
se ejecuta antes de persistir y no garantiza que exista `entityId`/`humanId`.

## Decisión

La creación y transición de una entidad escriben, en la misma transacción de
base de datos, uno de estos eventos:

- `catalog.entity.created.v1`
- `catalog.entity.transitioned.v1`

Los eventos se almacenan en `catalog_event_outbox`. Un dispatcher reclama lotes
con lease, `FOR UPDATE SKIP LOCKED`, reintentos exponenciales y entrega al menos
una vez.

Cada evento incluye `eventId`, identidad de entidad y definición, checksum del
manifiesto, estado, datos y referencias versionadas a capacidades. Las
credenciales nunca forman parte del evento.

Tickets consume únicamente eventos con `entityKey=INC` y mantiene una
proyección vinculada mediante `entity_id`. La deduplicación de `eventId` y la
actualización de la proyección se ejecutan en una sola transacción.

## Propiedad

- Catalog/runtime: esquema, validación, lifecycle, creación y transición.
- Tickets: read model, comentarios, adjuntos, watchers, asignación y merge.
- IAM: autorización síncrona de comandos.
- SLA, Automatizaciones, Notificaciones, Integraciones y Reportes: reacción
  idempotente a eventos cuando su referencia está fijada en el manifiesto.

## Compatibilidad

`POST /catalog/definitions/{entityKey}/submit` es un alias obsoleto del runtime
genérico. Los endpoints directos de `/tickets` permanecen temporalmente para
registros legados, pero no son la ruta canónica de creación/transición de INC.

