# SIG-DESK Frontend

Cliente React de SIG-DESK (Vite + TypeScript + TailwindCSS).

## Integración y Puerto

- **Puerto principal de desarrollo local**: `http://localhost:3003`
- Configuración en `vite.config.ts` y `package.json`.

---

## Ejecución Local

```bash
npm install
npm run dev
```

La aplicación abre en `http://localhost:3003` conectándose por defecto a `http://localhost:8080/api/v1`.

### Modificar URL de la API

Crea `.env.local`:
```text
VITE_API_URL=http://localhost:8080/api/v1
```

---

## Validación

```bash
# Comprobación de tipos TypeScript
npx tsc -b

# Linter
npm run lint

# Build de producción
npm run build
```

---

## Contenedor Nginx (Producción / Docker Compose)

El archivo `Dockerfile` compila el bundle estático en un build multi-etapa y lo sirve mediante Nginx en el puerto `80` (mapeado al `3003` del host en `compose.yaml`).

`nginx.conf` incluye la directiva `try_files $uri $uri/ /index.html;` para soportar las rutas cliente de React Router sin errores 404 al recargar.
