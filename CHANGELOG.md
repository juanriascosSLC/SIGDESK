# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/).

## [0.2.0-beta] - 2026-09-05

### Agregado

- Nuevo módulo de departamento **Services** (`/app/services/*`, PR1 mock-only): dashboard con tarjetas KPI accionables y tabs My Work/Team/All, vista de dealership con panel de problemas recurrentes, y detalle de ticket SRV con checklist de equipamiento, selector de subcontractor y tarjeta de contacto (POC).
- Tema visual propio para Services (`data-department="services"`), independiente del toggle claro/oscuro global, vía una primitiva de scope por departamento reutilizable para futuros módulos.
- Entrada de navegación "Services" en el sidebar/drawer, gateada con el permiso ya existente `sigdesk.changes.view`.

### Corregido

- El estado de subcontractor seleccionado ya no queda pegado al navegar entre distintos tickets SRV.
- El ticket de fixture usado por las pruebas de error ya no aparece como una fila normal en la lista de tickets.
- Las tarjetas KPI exponen `aria-pressed`, y los tres tabs de scope tienen su panel accesible correspondiente en el DOM.
- Las tarjetas KPI ahora sí hacen scroll horizontal real en mobile, en vez de quedar en una grilla estática de 2×2.

## [Unreleased]

### Changed

- El repositorio se convirtió en una entrega frontend-only.
- Se retiraron el backend histórico, su configuración local y los workflows que dependían de él.
- CI y release ahora validan y empaquetan únicamente `FRONTEND`.
- Se agregó `FRONTEND/FRONTEND-HANDOFF.md` como fuente de verdad para implementar el backend nuevo.

## [0.1.0-beta] - En progreso

Interfaz React de SIG-DESK con formularios dinámicos, Catalog Builder, diseñador de página, módulos ITSM y contratos HTTP tipados.
