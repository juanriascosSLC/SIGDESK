# SIG-DESK Backend

Backend inicial de SIG-DESK en Go, organizado como monolito modular evolutivo.

## Estado actual

- Health checks.
- Listado, creación, detalle y cambio de estado de tickets.
- Dominio y casos de uso separados de HTTP y persistencia.
- Repositorio PostgreSQL y repositorio temporal en memoria.
- Migraciones y datos demo.
- Catalog Builder con borradores y versiones publicadas inmutables.
- Validación y resolución de recursos propiedad de IAM, SLA, Automatizaciones,
  Integraciones, Notificaciones y Reportes mediante contratos versionados.
- Compilación de `ExecutableDefinitionManifest` con checksum SHA-256.
- Runtime genérico para crear registros y ejecutar transiciones declaradas en
  metadatos.
- Registros vinculados a `definitionVersionId`, versión de esquema y checksum.
- Outbox transaccional con lease, reintentos y entrega al menos una vez.
- Proyección idempotente de entidades INC en el read model de Tickets.
- Implementaciones versionadas de IAM, SLA, Automatizaciones, Notificaciones,
  Integraciones y Reportes conectadas al `ModuleGateway` y al bus interno.
- Contrato OpenAPI del runtime y del plano de control.

## Ejecución rápida sin base de datos

```powershell
go run ./cmd/api
```

Cuando `DATABASE_URL` está vacío, la API usa datos demo en memoria.

## Ejecución con PostgreSQL

```powershell
docker compose up --build
```

La API queda en `http://localhost:8080` y PostgreSQL en el puerto `5432`.

## Endpoints

- `GET /health/live`
- `GET /health/ready`
- `GET /api/v1/tickets`
- `POST /api/v1/tickets`
- `GET /api/v1/tickets/{id}`
- `PATCH /api/v1/tickets/{id}/status`
- `GET|POST /api/v1/catalog/definitions`
- `GET /api/v1/catalog/definitions/{entityKey}`
- `POST /api/v1/catalog/definitions/{entityKey}/versions/{version}/validate`
- `POST /api/v1/catalog/definitions/{entityKey}/versions/{version}/publish`
- `GET /api/v1/catalog/definitions/{entityKey}/versions/{version}/manifest`
- `GET|POST /api/v1/entities/{entityKey}`
- `POST /api/v1/entities/{entityKey}/{entityID}/transitions/{transitionKey}`

## Principio arquitectónico

Propiedad distribuida por módulos, composición centralizada en Catalog Builder
y ejecución dirigida por metadatos. Catalog Builder es el plano de control; el
runtime genérico es el plano de ejecución.

Consulte
[`Docs/adr/0007-catalog-control-plane-and-metadata-runtime.md`](Docs/adr/0007-catalog-control-plane-and-metadata-runtime.md).
La entrega de eventos y la convergencia de Tickets están descritas en
[`Docs/adr/0008-transactional-outbox-and-ticket-projection.md`](Docs/adr/0008-transactional-outbox-and-ticket-projection.md).

## Próximos pasos

1. Reemplazar las cabeceras provisionales de principal por tokens verificados
   del proveedor de identidad.
2. Sustituir el bus en proceso por el broker elegido conservando el contrato.
3. Retirar `POST /tickets` y `PATCH /tickets/{id}/status` cuando todos los
   consumidores utilicen el runtime y la proyección.
4. Añadir políticas explícitas de migración entre versiones de definición.
