# SIG-DESK Frontend

Cliente React de SIG-DESK.

## Integración actual

El flujo de tickets ya consume el backend:

- listado y Kanban;
- detalle;
- creación desde el catálogo;
- cambio de estado a resuelto;
- cache e invalidación con TanStack Query;
- estados de carga, error y vacío.

El resto de las pantallas continúa siendo una maqueta y se conectará por
módulos.

## Configuración

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

La API predeterminada es `http://localhost:8080/api/v1`. Se puede cambiar con:

```text
VITE_API_URL=http://localhost:8080/api/v1
```

## Validación

```powershell
npm run build
npm run lint
```

El build es obligatorio. El lint todavía reporta deuda previa de la maqueta,
principalmente en el constructor de workflows y la pantalla mock de API keys.
