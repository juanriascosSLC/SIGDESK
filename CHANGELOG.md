# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/).

## [0.2.1-beta] - 2026-09-10

### Cambiado

- Sidebar del workspace reagrupado por función real, no por framework: "Cases" reúne los pools de creación de caso (Incidents, Problems, Changes, New Case) que antes estaban repartidos entre "Service Desk (ITSM)" y "Change & Config (ITIL)"; "Reference" separa lo que se consulta (Knowledge Base, Assets/CMDB) de lo que se crea.
- "Service Catalog" renombrado a "New Case" (workspace) y "Home" (portal): la pantalla es el selector de definiciones publicadas para crear un caso, no un catálogo de servicios — "Catálogo" fue deprecado de cara al usuario el 2026-09-08 junto con el rename Catalog Builder → Entity Builder.
- "Tickets & Issues" → "Incidents", "Change Mgmt" → "Changes", "Problem Mgmt" → "Problems", "Mis tareas" → "My Tasks": los tres pools de caso ahora se leen en paralelo, sin abreviaturas ni idiomas mezclados.
- Íconos duplicados de nav eliminados; "Assistant Feedback" movido al final de Administration con ícono propio.

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
