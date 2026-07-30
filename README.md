# SIG-DESK

SIG-DESK está evolucionando desde una maqueta React hacia una aplicación
funcional con un backend Go modular y PostgreSQL.

## Estado funcional

El primer corte vertical ya conecta:

1. Formulario del catálogo.
2. Creación de un ticket por API.
3. Persistencia en PostgreSQL.
4. Listado y Kanban.
5. Detalle del ticket.
6. Resolución del ticket.

Los demás módulos de la maqueta continúan siendo visuales y se migrarán
gradualmente.

## Servicios locales

| Servicio | Dirección |
|---|---|
| Frontend | http://localhost:3003 |
| API | http://localhost:8080 |
| PostgreSQL | localhost:5432 |
| Health API | http://localhost:8080/health/ready |

La base local usa:

- Database: `sigdesk`
- User: `sigdesk`
- Password: `sigdesk`

Estas credenciales son exclusivamente para desarrollo local.

## Arranque

### 1. PostgreSQL

```powershell
cd BACKEND
docker compose up -d postgres
```

### 2. API Go

```powershell
cd BACKEND
$env:DATABASE_URL="postgres://sigdesk:sigdesk@localhost:5432/sigdesk?sslmode=disable"
$env:FRONTEND_ORIGIN="http://localhost:3003"
go run ./cmd/api
```

### 3. Frontend

```powershell
cd FRONTEND
npm install
npm run dev
```

También se puede ejecutar PostgreSQL y la API juntos:

```powershell
cd BACKEND
docker compose up --build
```

## Verificación

Backend:

```powershell
cd BACKEND
go test ./...
go vet ./...
```

Frontend:

```powershell
cd FRONTEND
npm run build
```

## Próximo corte vertical

El siguiente bloque recomendado es identidad y autorización:

- usuarios y roles en PostgreSQL;
- login local;
- access token corto;
- refresh token seguro;
- `GET /api/v1/me`;
- protección real de rutas administrativas.
