# SIG-DESK Backend

Backend de SIG-DESK en Go, organizado como monolito modular evolutivo.

## Estado actual de módulos

### Funcionales y Persistidos (PostgreSQL)
- **Tickets / Incidentes**: Listado, creación, detalle, cambio de estado, outbox transaccional y proyección idempotente.
- **Catalog Builder**: Formulario, borradores, versiones publicadas inmutables y manifiestos de metadatos con checksum SHA-256.
- **RBAC / IAM**: Gestión de roles y permisos almacenados en PostgreSQL.
- **SLA Engine**: Evaluación de políticas SLA e hitos de tiempo.
- **Problemas y Cambios**: Entidades y transiciones de ciclo de vida dirigidas por metadatos.

### Provisionales (Sin persistencia en DB)
- **Automatizaciones**, **Notificaciones**, **Integraciones** y **Reportes**: Operan con mapas en memoria. Cada reinicio limpia sus estados y contadores.

---

## Ejecución

### Desarrollo Local (`task dev`)
```bash
docker compose up -d postgres
go run ./cmd/api
```
La API arranca en `http://localhost:8080`.

### Stack Contenerizado (`docker compose up`)
```bash
docker compose up -d --build
```
La API corre en el puerto `8080` y PostgreSQL en el `5432`.

---

## Comandos de utilidad

- **Aplicar migraciones**:
  ```bash
  go run ./cmd/migrate
  ```
- **Sembrar datos demo** (opcional, en entornos no productivos):
  ```bash
  go run ./cmd/seeddemo
  ```
- **Pruebas unitarias e integración**:
  ```bash
  go test -v ./...
  ```
- **Pruebas de migraciones contra PostgreSQL real**:
  ```bash
  $env:SIGDESK_TEST_DATABASE_URL = "postgres://sigdesk:sigdesk@localhost:5432/postgres?sslmode=disable"
  go test -count=1 -v ./migrations/...
  ```

---

## Endpoints Principales

- `GET /health/live`
- `GET /health/ready`
- `GET /api/v1/version`
- `GET /api/v1/tickets`
- `POST /api/v1/tickets`
- `GET /api/v1/tickets/{id}`
- `PATCH /api/v1/tickets/{id}/status`
- `GET|POST /api/v1/catalog/definitions`
- `GET /api/v1/catalog/definitions/{entityKey}`
- `POST /api/v1/catalog/definitions/{entityKey}/versions/{version}/publish`
- `GET|POST /api/v1/entities/{entityKey}`
- `POST /api/v1/entities/{entityKey}/{entityID}/transitions/{transitionKey}`
