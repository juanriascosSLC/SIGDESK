# SIG-DESK

SIG-DESK es una plataforma ITSM/ESM con backend modular en Go y frontend React.

## Requisitos previos

- **Docker Desktop** (o Docker Engine en Linux)
- **Go 1.25+**
- **Node.js 22+** y **npm**
- **Task CLI** (opcional pero recomendado):
  - Windows: `winget install Task.Task`
  - Alternativa Go: `go install github.com/go-task/task/v3/cmd/task@latest`

---

## Modos de Ejecución

Existen dos modos de ejecución claramente separados:

### Modo 1: Desarrollo Local (`task dev`)
Para desarrollo rápido con hot reload:
```bash
task dev
```
1. **PostgreSQL** se inicia automáticamente en Docker (`localhost:5432`).
2. **Backend API**: `cd BACKEND && go run ./cmd/api` (`http://localhost:8080`).
3. **Frontend Vite**: `cd FRONTEND && npm run dev` (`http://localhost:3003`).

### Modo 2: Stack Contenerizado (`docker compose up`)
Para un entorno completo 100% aislado con Nginx sirviendo la aplicación React compilada:
```bash
docker compose up -d --build
```
- **Frontend Nginx**: [http://localhost:3003](http://localhost:3003) (con `try_files` SPA routing)
- **API Health**: [http://localhost:8080/health/ready](http://localhost:8080/health/ready)
- **PostgreSQL**: `localhost:5432`

---

## Puertos y Servicios

| Servicio | Dirección Local | Tipo |
|---|---|---|
| Frontend Vite (Dev) | http://localhost:3003 | Local / Hot Reload |
| Frontend Nginx (Docker) | http://localhost:3003 | Contenedor Nginx |
| API Go | http://localhost:8080 | Local / Contenedor |
| API Health Check | http://localhost:8080/health/ready | Endpoint público |
| PostgreSQL | localhost:5432 | Contenedor Docker |

---

## Comandos Principales (`Taskfile.yml`)

`Taskfile.yml` (y `Makefile`) sirven como fuente de verdad para los comandos del proyecto:

| Comando | Descripción |
|---|---|
| `task dev` | Inicia PostgreSQL en Docker y muestra comandos para API y Frontend. |
| `task test` | Corre pruebas de backend y comprobación de tipos de frontend. |
| `task lint` | Ejecuta linters (`go vet` y `eslint`). |
| `task build` | Compila binarios de producción para backend y bundle de frontend. |
| `task migrate` | Aplica migraciones pendientes con `cmd/migrate` sin destruir información. |
| `task reset` | **Destructivo**: Solicita confirmación y destruye los volúmenes de PostgreSQL. |
| `task e2e` | Ejecuta pruebas End-to-End con Playwright. |
| `task ci` | Reproduce localmente los pasos del pipeline de GitHub Actions. |

> Nota: **No existe `task seed`**. Los datos demo no se siembran automáticamente. Para cargar datos demo en entornos no productivos, invoca explícitamente:
> `cd BACKEND && go run ./cmd/seeddemo`

---

## Tabla de Módulos (Estado del Proyecto)

| Módulo | Estado | Descripción |
|---|---|---|
| **Catalog Builder** | Funcional | Borradores, versiones publicadas inmutables y manifiestos de metadatos. |
| **Tickets / Incidentes** | Funcional | Listado, Kanban, detalle, resolución, outbox y proyección idempotente. |
| **RBAC / IAM** | Funcional | Roles, permisos y políticas en PostgreSQL. |
| **SLA Engine** | Funcional | Evaluación de políticas e hitos de tiempo. |
| **Problemas / Cambios** | Funcional | Definiciones y transiciones de ciclo de vida dirigidas por metadatos. |
| **Automatizaciones** | Provisional | Ejecuciones en memoria, sin persistencia ni reintentos tras reinicio. |
| **Notificaciones** | Provisional | Envíos en memoria (`queued`), sin transporte ni reintentos reales. |
| **Integraciones** | Provisional | Webhooks en memoria, sin HTTP client real ni reintentos. |
| **Reportes** | Provisional | Contadores en memoria, sin persistencia en PostgreSQL. |

---

## Variables de Entorno y Autenticación

El archivo `.env.example` incluye las variables predeterminadas:

- En desarrollo autocontenido, `SIGTOOLS_API_URL` se encuentra vacío por defecto, lo que desactiva la autenticación para facilitar el desarrollo local y las pruebas Playwright.
- Con `APP_ENV=production`, la API se niega a iniciar si `SIGTOOLS_API_URL` no está configurada.
