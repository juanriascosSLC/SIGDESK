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

## Migraciones y datos demo

Las migraciones (`migrations/`) se aplican automáticamente al arrancar la API
cuando `DATABASE_URL` no está vacío — no hay un paso manual.

**Las bases de datos nuevas ya NO reciben datos demo automáticamente.** Antes,
las migraciones `000002_seed_demo` y `000005_ticket_core_features` insertaban
siete tickets de ejemplo (`INC-000001..4` y tres tickets fusionados) en
**cualquier** base migrada, incluida producción. La migración
`000019_remove_legacy_demo_data` elimina esos registros exactos (identificados
por id, nunca por contenido) como parte del mismo `Apply()`, así que una base
recién migrada queda limpia.

Si quieres esos datos de ejemplo (por ejemplo, para una demo o para probar la
UI con tickets ya poblados), pídelos explícitamente:

```powershell
go run ./cmd/seeddemo
```

`cmd/seeddemo` es idempotente (no hace nada si el dato ya existe) y se niega a
ejecutarse con `APP_ENV=production`. Nunca se invoca automáticamente desde
migraciones ni desde el arranque de la API.

### Pruebas de migraciones contra PostgreSQL real

`go test ./...` es verde sin ninguna base de datos — usa repositorios en
memoria. Las pruebas específicas de migraciones
(`migrations/apply_postgres_test.go`) necesitan PostgreSQL real y se **omiten**
(`t.Skip`) si la variable `SIGDESK_TEST_DATABASE_URL` no está definida:

```powershell
docker compose up -d --wait postgres
$env:SIGDESK_TEST_DATABASE_URL = "postgres://sigdesk:sigdesk@localhost:5432/postgres?sslmode=disable"
go test -count=1 -v ./migrations/...
```

Apunta a la base de **mantenimiento** (`postgres`), no a una base con datos
reales: estas pruebas crean y destruyen (`DROP DATABASE ... WITH (FORCE)`) una
base desechable por prueba, y nunca tocan la base nombrada en la URL.

### Antes de desplegar un renombrado de migración en una base compartida

`schema_migrations` identifica cada migración por **nombre de archivo**, no por
número — renombrar un archivo ya aplicado hace que se vuelva a ejecutar bajo el
nuevo nombre (inocuo solo si el SQL es idempotente). Antes de desplegar un
cambio así en una base compartida:

1. Revisa qué ya se aplicó: `SELECT name, applied_at FROM schema_migrations ORDER BY applied_at;`
2. Haz un backup de la base.
3. Confirma que el archivo renombrado usa `IF NOT EXISTS`/`ON CONFLICT DO NOTHING`
   en todo su contenido, para que una segunda ejecución sea un no-op real.

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
