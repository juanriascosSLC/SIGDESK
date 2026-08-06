# SIG-DESK Frontend

Este repositorio contiene deliberadamente **solo el frontend** de SIG-DESK. El backend anterior fue retirado para que el equipo responsable implemente una API nueva a partir de los contratos que consume la interfaz, sin heredar reglas o arquitectura histórica.

La aplicación está en [`FRONTEND/`](FRONTEND/). El documento principal para el equipo de backend es [`FRONTEND-HANDOFF.md`](FRONTEND/FRONTEND-HANDOFF.md); allí se explican la arquitectura, módulos, rutas, metamodelo, contratos HTTP, funcionalidades reales, pantallas demostrativas y criterios de integración.

## Inicio rápido

```bash
cd FRONTEND
npm ci
copy .env.example .env.local
npm run dev
```

La interfaz queda disponible en `http://localhost:3003`. Por defecto espera:

- API SIG-DESK: `http://localhost:8080/api/v1`
- Autenticación SIGTools: `http://api.sig.systems:8091`

## Verificación local

```bash
cd FRONTEND
npm run lint
npm run build
```

Los E2E de Playwright se conservan como especificación ejecutable, pero los recorridos integrados requieren que el nuevo backend implemente los contratos documentados.
