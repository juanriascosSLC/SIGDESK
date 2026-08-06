# SIG-DESK — Requerimientos históricos para backend

> **Documento histórico, no contractual.** Fue escrito antes de la integración y contiene supuestos de stack y estados de pantalla que ya no representan completamente el frontend actual. La fuente de verdad para el equipo que implementará el backend nuevo es [`FRONTEND-HANDOFF.md`](FRONTEND-HANDOFF.md), junto con los tipos TypeScript y los E2E del repositorio. Este archivo se conserva únicamente como inventario amplio de capacidades empresariales deseadas.

> Documento de requerimientos para convertir la maqueta SIG-DESK (React 19 + TS + Vite) en una aplicación totalmente funcional con backend en Rust. Cada requerimiento está numerado (RF = funcional, RNF = no funcional) para poder rastrearlo en issues/PRs.

> ## ⚠️ Nota de estado (2026-07-28): stack real = Go, no Rust
>
> Este documento se escribió asumiendo un backend en **Rust**. La
> implementación real que existe hoy usa **Go** (no Rust) como stack de
> backend, con arquitectura de **monolito modular** (no microservicios) —
> ver `BACKEND/Docs/adr/0006-monolito-modular-go-vs-microservicios.md`
> para la decisión formal, y `BACKEND/Docs/adr/0005-lenguaje-implementacion-tickets-service-go.md`
> para la decisión de lenguaje (Go vs. Rust).
>
> El resto de este documento — modelo de datos, requerimientos
> funcionales RF-1 a RF-16, roadmap — **sigue siendo válido** como
> documento de **requerimientos de producto/dominio**: qué debe hacer el
> backend, no con qué tecnología está construido. Sin embargo, la
> **sección 2 ("Stack recomendado (Rust)")** y cualquier mención a crates
> específicas de Rust en el resto del documento deben leerse como
> **obsoletas**. El stack real usado hoy es Go — ver `BACKEND/go.mod` para
> las dependencias reales (`net/http` estándar de la librería, `pgx/v5`
> para PostgreSQL, sin framework HTTP de terceros).

---

## 1. Objetivo y alcance

Construir el backend que dé vida a **todas** las pantallas que hoy existen en la maqueta:

| Módulo (pantalla actual) | Estado en maqueta | Requiere backend |
|---|---|---|
| Dashboard | Estático | Agregaciones en tiempo real |
| Tickets (Kanban / Lista / Detalle) | Store en memoria (Zustand) | CRUD completo + SLA + merge + adjuntos |
| Service Catalog + formulario | Crea ticket en memoria | Catálogo dinámico + intake real |
| Knowledge Base + artículos | Estático | CRUD + votos + búsqueda + sugerencias |
| Change Management + CAB | Estado local | CRUD RFC + flujo de aprobaciones |
| Problem Management | Estático | CRUD + vínculos a incidentes/changes |
| SLA Policies | Estático | Motor de SLA con timers y escalamiento |
| Automations + Workflow Builder | Grafo en memoria | Persistencia del grafo + motor de ejecución |
| Reports & Analytics | Estático | Consultas agregadas + export |
| Notificaciones (campana) | Mock | Centro de notificaciones en tiempo real |
| Búsqueda global | Mock | Full-text search multi-entidad |
| ChatOps (Slack/Teams/WhatsApp) | Toggles visuales | Integraciones reales |
| API Keys | Genera key en cliente | Emisión/validación/scopes en servidor |
| Detalle de ticket: asset SIGInventory | Hardcodeado | Integración con SIGInventory |
| CSAT (aparece en Dashboard/Reports) | No existe pantalla | Encuesta post-resolución |
| Login + SSO Microsoft | **Maqueta con selector de rol** (`Login.tsx`, `authStore` con persist) | Autenticación real + RBAC |
| Portal de usuario final (`/portal`) | **Maqueta** (`EndUserLayout`, `EndUserDashboard`, `MyTickets`) | Mismos endpoints con scope de "mis tickets" |
| Administración (Users & Roles, Catalog Builder) | **Maqueta** (`UsersManager`, `CatalogBuilder`) | CRUD usuarios/roles + persistencia de `form_schema` |
| Preferencia de tema (claro/oscuro/sistema) | **Funcional** (`themeStore` + tokens theme-aware en `index.css`) — modo claro y oscuro reales | Persistir preferencia en perfil de usuario |

> **Nota de estado (actualizado):** desde la última ronda la maqueta ya incorpora **autenticación mock con roles** (`admin`/`agent`/`manager`/`end_user`), **rutas divididas** `/app` (staff) y `/portal` (end user), **layouts dedicados**, **guard de rutas** (`ProtectedRoute`) y **gating de navegación por rol**. Todo esto es visual/cliente: el rol se elige en el login de demo y se guarda en `localStorage` vía Zustand `persist`. **No hay seguridad real** — es exactamente lo que el backend debe reemplazar (ver RF-1 y §9).

---

## 2. Stack recomendado (Rust)

> **Obsoleto** — ver la nota de estado al inicio del documento. El stack
> real es Go, no Rust. La tabla siguiente se conserva sin modificar como
> contexto histórico de la decisión evaluada, no como stack vigente.

| Capa | Crate recomendada | Alternativa |
|---|---|---|
| Framework HTTP | `axum` 0.8 | `actix-web` |
| Runtime async | `tokio` | — |
| Base de datos | PostgreSQL 16+ con `sqlx` (queries verificadas en compile-time, migraciones) | `sea-orm` |
| Serialización | `serde`, `serde_json` | — |
| Auth / JWT | `jsonwebtoken`, `oauth2` (Azure AD / Entra ID) | `openidconnect` |
| Hash de contraseñas | `argon2` | — |
| Validación de payloads | `validator` | `garde` |
| OpenAPI / docs | `utoipa` + `utoipa-swagger-ui` | — |
| WebSockets | `axum` WS nativo (`axum::extract::ws`) | `socketioxide` |
| Jobs / scheduler | `tokio-cron-scheduler` (SLA ticks, delays) + `apalis` (colas con Postgres) | `sidekiq-rs` |
| Email | `lettre` (SMTP) | API de SendGrid vía `reqwest` |
| HTTP client (integraciones) | `reqwest` | — |
| Almacenamiento de archivos | `object_store` (S3 / Azure Blob / filesystem local) | `aws-sdk-s3` |
| Observabilidad | `tracing` + `tracing-subscriber` + `tower-http` (TraceLayer) | — |
| Rate limiting | `governor` + `tower_governor` | — |
| Cache | `moka` (in-process) | Redis vía `fred` |
| Config | `dotenvy` + `config` | `figment` |
| Errores | `thiserror` (dominio) + `anyhow` (glue) | — |
| IDs | `uuid` v7 (orden temporal) para PKs internas + IDs legibles (`INC-`, `PRB-`, `CHG-`, `KB-`) como columna única | — |
| Fechas | `chrono` (con `chrono-tz` para business hours) | `time` |
| Tests | `cargo test` + `testcontainers` (Postgres efímero) + `insta` (snapshots) | — |

**Estructura de workspace sugerida:**

```
sig-desk-api/
├── crates/
│   ├── api/          # axum: routers, handlers, extractors, middleware
│   ├── domain/       # entidades, lógica de negocio pura, máquinas de estado
│   ├── infra/        # sqlx repos, object storage, email, integraciones externas
│   ├── engine-sla/   # motor de SLA (timers, calendarios, escalamiento)
│   ├── engine-flow/  # motor de workflows (ejecución del grafo)
│   └── shared/       # tipos comunes, errores, config
├── migrations/       # sqlx migrate
└── docker-compose.yml
```

---

## 3. Arquitectura general

- **API REST JSON** bajo `/api/v1/*` + **WebSocket** en `/ws` para tiempo real.
- **Monolito modular** (un binario, crates separadas por dominio). No microservicios: el equipo es pequeño y el dominio es cohesivo.
- **PostgreSQL** como única fuente de verdad; full-text search nativo (`tsvector`) para la búsqueda global (Meilisearch opcional en fase 2).
- **Jobs en background** dentro del mismo proceso (tokio tasks + apalis sobre Postgres): ticks de SLA, delays de workflows, envío de emails, webhooks salientes.
- **Archivos** en object storage (S3-compatible o disco local en dev) — nunca en la DB; la DB guarda metadatos.
- **Migraciones** versionadas con `sqlx migrate`.
- **OpenAPI** generada desde el código (`utoipa`) y servida en `/docs`.

---

## 4. Modelo de datos completo

> Convenciones: todas las tablas llevan `id UUID PK (v7)`, `created_at`, `updated_at`. Soft-delete (`deleted_at`) solo donde se indica. Los IDs "humanos" (`INC-000123`) se generan con secuencias por tipo.

### 4.1 Identidad y organización

**users** — `email (unique)`, `password_hash (nullable si SSO)`, `display_name`, `initials`, `avatar_url`, `phone`, `role_id FK`, `is_active`, `last_login_at`, `azure_ad_oid (nullable, unique)`, `locale`, `timezone`
**roles** — `name` (`admin`, `agent`, `manager`, `end_user`), `permissions JSONB` (matriz de permisos)
**support_groups** — `name` (Hardware Team, Network Team…), `email_alias`
**group_members** — `group_id FK`, `user_id FK`, `is_lead bool`
**sites** — `name` (Site #401, HQ, Building A…), `address`, `timezone`, `contact_user_id FK`

### 4.2 Tickets (núcleo)

**tickets**
- `human_id` (`INC-000123`, unique, secuencia)
- `title`, `description (text)`, `status` enum: `new | open | in_progress | pending_review | on_hold | resolved | closed | cancelled`
- `priority` enum: `low | medium | high | critical`
- `category_id FK`, `subcategory_id FK (nullable)`
- `requester_id FK users`, `assignee_id FK users (nullable)`, `group_id FK support_groups (nullable)`
- `site_id FK (nullable)`, `asset_external_id (nullable — ID en SIGInventory)`
- `source` enum: `portal | agent | email | chatops | api | automation`
- `merged_into_id FK tickets (nullable)` — si no es NULL, este ticket fue absorbido
- `resolved_at`, `closed_at`, `first_response_at`, `reopened_count`
- `sla_policy_id FK (nullable)`, `custom_fields JSONB`
- Índices: `(status)`, `(assignee_id, status)`, `(site_id)`, `(priority, status)`, GIN sobre `tsvector(title || description)`

**ticket_comments** — `ticket_id FK`, `author_id FK`, `body (text/markdown)`, `is_internal bool` (Internal Note vs Reply), `edited_at`
**ticket_attachments** — `ticket_id FK`, `comment_id FK (nullable)`, `uploader_id FK`, `file_name`, `content_type`, `size_bytes`, `storage_key`, `checksum_sha256`
**ticket_watchers** — `ticket_id FK`, `user_id FK`
**ticket_activity** — `ticket_id FK`, `actor_id FK (nullable — sistema)`, `kind` enum: `created | status_changed | assigned | priority_changed | commented | attached | merged | unmerged | escalated | sla_warning | sla_breached | linked | automation`, `payload JSONB` (before/after), `created_at` — **inmutable, append-only** (alimenta el Activity Stream)
**ticket_links** — `ticket_id FK`, `linked_type` enum: `problem | change | kb_article | ticket`, `linked_id UUID`, `relation` enum: `caused_by | related_to | solves | duplicate_of` (alimenta Related Records)

### 4.3 Catálogo de servicios

**catalog_categories** — `name`, `description`, `icon`, `sort_order`, `is_active` (Hardware & Assets, Software & Access, Network & Infrastructure…)
**catalog_items** — `category_id FK`, `name`, `description`, `form_schema JSONB` (definición de campos dinámicos: tipo, label, required, condicionales — hoy la maqueta tiene Short Title / Asset ID / Description / Attachments), `default_priority`, `default_group_id FK`, `sla_policy_id FK (nullable)`

### 4.4 Knowledge Base

**kb_categories** — `name`, `description`, `icon`, `sort_order`
**kb_articles** — `human_id (KB-1024)`, `category_id FK`, `title`, `body (markdown)`, `status` enum: `draft | published | archived`, `author_id FK`, `views_count`, `helpful_yes`, `helpful_no`, `published_at`, GIN full-text
**kb_article_votes** — `article_id FK`, `user_id FK`, `vote` enum: `up | down` (unique por user+article)
**kb_article_links** — vínculo artículo↔ticket (para "Linked to 12 tickets" y la tarjeta "Suggested solution")

### 4.5 SLA

**sla_policies** — `name`, `priority` enum, `first_response_minutes`, `resolution_minutes`, `business_calendar_id FK (nullable = 24×7)`, `is_active`
**business_calendars** — `name`, `timezone`, `week_schedule JSONB` (Mon–Fri 8am–6pm…), `holidays JSONB`
**sla_escalations** — `policy_id FK`, `threshold_pct` (75, 100…), `target` enum: `first_response | resolution`, `action` enum: `notify_assignee | notify_lead | notify_manager | reassign_group | raise_priority`, `action_params JSONB`
**ticket_sla_timers** — `ticket_id FK`, `target` enum, `started_at`, `paused_at (nullable)`, `paused_total_seconds`, `due_at`, `completed_at (nullable)`, `breached bool`, `consumed_pct` (materializado por el motor) — alimenta las barras de la UI y la columna SLA de la lista

### 4.6 Changes (ITIL)

**changes** — `human_id (CHG-002)`, `title`, `change_type` enum: `normal | standard | emergency`, `status` enum: `planning | pending_cab | approved | in_progress | completed | rejected | cancelled`, `risk` enum: `low | medium | high | critical`, `risk_answers JSONB` (respuestas del wizard de Risk Assessment), `reason (text)`, `implementation_plan (text)`, `rollback_plan (text)`, `requestor_id FK`, `planned_start`, `planned_end` (ventana de mantenimiento), `services_affected text[]`
**cab_approvals** — `change_id FK`, `approver_id FK`, `decision` enum: `pending | approved | rejected`, `justification (text, requerida en rechazo)`, `decided_at`, `sort_order` (cadena de aprobación)
**change_links** — change↔ticket / change↔problem

### 4.7 Problems (ITIL)

**problems** — `human_id (PRB-001)`, `title`, `description`, `status` enum: `under_investigation | known_error | resolved | closed`, `impact` enum: `low | medium | high`, `owner_id FK`, `workaround (text, nullable)`, `root_cause (text, nullable)`, `resolved_at`
(vínculos incidente↔problema vía `ticket_links`)

### 4.8 Automations / Workflows

**workflows** — `name`, `description`, `status` enum: `draft | published | disabled`, `trigger_type` enum: `ticket_created | ticket_updated | status_changed | sla_warning | schedule | webhook`, `trigger_config JSONB`, `graph JSONB` (nodes + edges tal como los exporta el builder — el botón "JSON" de la maqueta ya genera este formato), `version int`, `created_by FK`
**workflow_versions** — snapshot inmutable de `graph` por cada publish (rollback)
**workflow_runs** — `workflow_id FK`, `trigger_payload JSONB`, `status` enum: `running | succeeded | failed | cancelled | waiting_approval | waiting_delay`, `started_at`, `finished_at`, `error (text)`
**workflow_run_steps** — `run_id FK`, `node_id (del grafo)`, `node_type`, `status`, `input JSONB`, `output JSONB`, `started_at`, `finished_at` — alimenta el modal "Logs" del builder
**workflow_approvals** — `run_step_id FK`, `approver_id FK`, `decision`, `decided_at` (para el nodo Approval)

### 4.9 Notificaciones

**notifications** — `user_id FK`, `kind` enum: `sla_warning | ticket_assigned | cab_pending | mention | ticket_resolved | workflow_failed | kb_feedback`, `title`, `body`, `entity_type`, `entity_id`, `read_at (nullable)`, `created_at`
**notification_preferences** — `user_id FK`, `kind`, `channel` enum: `in_app | email | chatops`, `enabled bool`

### 4.10 CSAT

**csat_surveys** — `ticket_id FK (unique)`, `token (unique — link público)`, `sent_at`, `responded_at (nullable)`, `score smallint 1–5`, `comment (text)`

### 4.11 Integraciones y API

**api_keys** — `name`, `prefix` (visible: `sk_live_ab12…`), `key_hash` (SHA-256 — **nunca** se guarda la key completa), `scopes text[]` (`tickets:read`, `tickets:write`, `webhooks:inventory`…), `created_by FK`, `last_used_at`, `revoked_at (nullable)`
**integrations** — `provider` enum: `slack | teams | whatsapp | siginventory | email_inbound`, `status` enum: `connected | disconnected | error`, `config JSONB` (tokens cifrados), `connected_by FK`, `connected_at`
**webhook_events** — log de webhooks entrantes (provider, payload, processed_at, error) — idempotencia y debugging

### 4.12 Auditoría

**audit_log** — `actor_id`, `action`, `entity_type`, `entity_id`, `ip`, `user_agent`, `payload JSONB`, `created_at` — append-only, para acciones administrativas (login, cambios de rol, revocación de keys, cambios de política SLA)

---

## 5. Requerimientos funcionales

### RF-1 · Autenticación y usuarios
- **RF-1.1** Login con email/contraseña (argon2id) y **SSO con Microsoft Entra ID (Azure AD)** vía OAuth2/OIDC — la empresa usa Microsoft.
- **RF-1.2** Sesión con **JWT de acceso corto (15 min) + refresh token httpOnly rotativo**; logout revoca el refresh.
- **RF-1.3** RBAC con 4 roles: `admin` (todo), `manager` (aprobaciones CAB, reportes, SLA), `agent` (operar tickets/changes/problems/KB), `end_user` (portal: crear/ver sus tickets, KB, catálogo). Permisos evaluados por middleware en cada endpoint. **Estos 4 roles ya están cableados en el frontend** (`authStore.UserRole`) y gobiernan qué layout (`/app` vs `/portal`) y qué items de navegación se muestran — el backend debe ser la fuente de verdad del rol, no el cliente.
- **RF-1.4** CRUD de usuarios, grupos de soporte y sites (solo admin). Desactivar ≠ borrar (soft). La UI ya tiene la pantalla `UsersManager` (nombre/email, rol, grupos, estado activo/inactivo).
- **RF-1.5** Recuperación de contraseña por email con token de un solo uso (solo cuentas locales). La UI ya tiene `ForgotPassword.tsx`.
- **RF-1.6** Endpoint `GET /me` con perfil, rol, permisos y **preferencias (incluida la de tema: `light|dark|system`)**. El frontend lo consume para: pintar el avatar/iniciales del `UserProfilePopover`, elegir layout, gatear la navegación y aplicar el tema. Hoy el rol y el tema se guardan en `localStorage`; deben migrar a este endpoint.
- **RF-1.7** **Landing por rol tras login**: `end_user` → `/portal`; `admin`/`agent`/`manager` → `/app`. El login mock ya hace este redirect; el backend debe devolver el rol para que el guard real lo respete. Un `end_user` que intente entrar a `/app` (o viceversa) debe ser redirigido/403.

### RF-2 · Tickets
- **RF-2.1** CRUD completo. Crear desde: portal/catálogo, vista de agente ("New Ticket"), API, ChatOps, email entrante (fase 2) y automatizaciones.
- **RF-2.2** **Máquina de estados** con transiciones válidas: `new→open→in_progress→pending_review→resolved→closed`, más `on_hold` (pausa SLA) y `reopen` (resolved→open, incrementa `reopened_count`). Transiciones inválidas → 409. Cada transición escribe en `ticket_activity`.
- **RF-2.3** Asignación: a usuario y/o grupo; "Assign to me"; auto-asignación por reglas de workflow.
- **RF-2.4** **Merge**: fusionar N tickets en uno; los absorbidos pasan a `closed` con `merged_into_id`, sus comentarios/adjuntos quedan visibles en el principal; **unmerge** revierte. (La UI ya tiene el panel expandible.)
- **RF-2.5** **Acciones masivas** (la barra flotante de la lista): assign, merge, close, change priority sobre un array de IDs — transaccional, con resultado parcial reportado.
- **RF-2.6** Comentarios con dos visibilidades: `reply` (visible al solicitante) e `internal note` (solo agentes). Soporte de **@menciones** → genera notificación.
- **RF-2.7** **Adjuntos**: upload multipart (límite 25 MB/archivo, tipos permitidos configurables), almacenados en object storage, descarga vía URL firmada con expiración. Antivirus scan opcional (fase 2).
- **RF-2.8** **Listado con filtros combinables**: status, priority, site, assignee, group, category, requester, texto libre, rango de fechas, `unassigned`, `breaching_sla` — con **paginación por cursor** (la maqueta muestra "Prev/Next") y ordenamiento por cualquier columna. Estos filtros alimentan los quick-view tabs (All / Unassigned / Breaching SLA / Resolved) y los selects de Sites/Assignees.
- **RF-2.9** Kanban: `PATCH /tickets/:id/status` optimista (drag & drop); el WebSocket propaga el movimiento a otros agentes viendo el board.
- **RF-2.10** Watchers: seguir/dejar de seguir un ticket; los watchers reciben notificaciones de cambios.
- **RF-2.11** Activity Stream: `GET /tickets/:id/activity` paginado, con filtros All/Comments/History (la UI ya tiene los tabs).
- **RF-2.12** Related Records: link/unlink a problems, changes, artículos KB y otros tickets con tipo de relación (`caused_by`, `related_to`, `solves`).
- **RF-2.13** Campos custom por categoría (JSONB) definidos en el catálogo.

### RF-3 · Catálogo de servicios
- **RF-3.1** CRUD de categorías e items del catálogo (admin), con `form_schema` JSONB que define los campos dinámicos del formulario (la maqueta muestra Asset ID solo para hardware/network — eso se expresa como condición en el schema). La UI ya tiene el `CatalogBuilder` (constructor visual de formularios) con tipos de campo **single-line text, multi-line text, dropdown (con lista de opciones) y checkbox**, más flag `required` y reordenamiento por arrastre — el `form_schema` debe poder representar exactamente estos tipos y metadatos.
- **RF-3.2** `POST /catalog/:item/submit` valida el payload contra el `form_schema` y crea el ticket con categoría, prioridad, grupo y SLA por defecto del item.
- **RF-3.3** Adjuntos en el intake (la zona drag & drop del formulario).
- **RF-3.4** Sugerencia de artículos KB mientras el usuario escribe el título (deflection): `GET /kb/suggest?q=` — evita tickets duplicados.

### RF-4 · Knowledge Base
- **RF-4.1** CRUD de artículos (markdown) con estados draft/published/archived; solo agentes/managers editan; end-users solo leen publicados.
- **RF-4.2** Contador de vistas (dedup por usuario/día) y votos 👍/👎 (uno por usuario, cambiable).
- **RF-4.3** Búsqueda full-text con ranking + filtro por categoría.
- **RF-4.4** Vinculación artículo↔ticket ("resolved 12 similar tickets") — al resolver un ticket el agente puede marcar qué artículo lo resolvió.
- **RF-4.5** **Suggested solution**: `GET /tickets/:id/suggestions` — v1: similitud full-text entre título/categoría del ticket y artículos publicados. v2 (opcional): embeddings.
- **RF-4.6** Artículos relacionados por categoría/co-vinculación (sidebar del artículo).

### RF-5 · SLA (motor)
- **RF-5.1** CRUD de políticas SLA (la pantalla ya existe): objetivo de primera respuesta y resolución por prioridad, calendario hábil o 24×7, activo/inactivo.
- **RF-5.2** Al crear un ticket se resuelve la política aplicable (por prioridad y/o item de catálogo) y se crean los dos timers (`first_response`, `resolution`) calculando `due_at` **respetando el calendario hábil y su timezone** (horas hábiles Mon–Fri 8am–6pm, festivos).
- **RF-5.3** El timer de primera respuesta se completa con el primer comentario público de un agente; el de resolución con la transición a `resolved`. `on_hold` **pausa** ambos timers; reopen los reanuda.
- **RF-5.4** **Job periódico (cada 60 s)** recalcula `consumed_pct` y dispara los escalamientos configurados (75% → notificar asignado; 100% → breach: notificar lead/manager, marcar `breached`, evento en activity, badge "SLA Violated" del dashboard).
- **RF-5.5** Endpoint `GET /tickets/:id/sla` devuelve estado de ambos timers (pct, restante, breached, política) — alimenta las barras del detalle y los chips de la lista.
- **RF-5.6** Cambios de prioridad re-evalúan la política (recalcular due_at proporcionalmente al tiempo consumido).

### RF-6 · Change Management
- **RF-6.1** CRUD de RFCs con los campos del wizard (General → Risk Assessment → Implementation). El score de riesgo se calcula server-side a partir de `risk_answers`.
- **RF-6.2** Máquina de estados: `planning → pending_cab → approved → in_progress → completed`, con `rejected`/`cancelled`. El drag & drop del board llama `PATCH /changes/:id/status`; transiciones que requieren CAB no se pueden saltar (p.ej. no se puede pasar a `approved` sin todas las aprobaciones).
- **RF-6.3** **Cadena de aprobación CAB**: lista ordenada de aprobadores; approve/reject con justificación obligatoria en rechazo; un rechazo devuelve el RFC a `planning` y notifica al requestor. Los managers ven "CAB approval pending" en su campana.
- **RF-6.4** Ventana de mantenimiento (`planned_start/end`) con validación de colisiones contra otros changes del mismo site (warning, no bloqueo).
- **RF-6.5** Vinculación change↔tickets (tab "Related Tickets") y change↔problem.
- **RF-6.6** Changes tipo `standard` (pre-aprobados) saltan CAB automáticamente; `emergency` notifican al manager con prioridad.

### RF-7 · Problem Management
- **RF-7.1** CRUD de problemas con estados `under_investigation → known_error → resolved → closed`, impact, owner, workaround y root cause.
- **RF-7.2** Vincular/desvincular incidentes; el contador "12 linked incidents" es un agregado real.
- **RF-7.3** Al registrar un workaround, opción de notificarlo a todos los tickets vinculados abiertos (comentario automático).
- **RF-7.4** "Crear problema desde ticket" (promoción de incidente recurrente).

### RF-8 · Automations (motor de workflows)
- **RF-8.1** Persistir el grafo del builder tal cual (nodes/edges JSON que ya genera el botón "JSON"); guardar como `draft`, `publish` crea versión inmutable.
- **RF-8.2** **Motor de ejecución** que interpreta el grafo:
  - **Trigger**: ticket_created, ticket_updated, status_changed, sla_warning, cron (`schedule`), webhook entrante.
  - **Condition**: expresiones sobre el contexto (`ticket.priority == "Critical"`), salidas yes/no.
  - **Action**: send_email (lettre), send_slack/teams (webhook), http_request (reqwest con timeout/retry), assign_group/user, change_status, change_priority, add_comment. Handle "On Error" del nodo → rama alternativa.
  - **Delay**: pausa durable (job programado — sobrevive reinicios del servidor).
  - **Approval**: crea `workflow_approval`, notifica al aprobador, la ejecución queda `waiting_approval` hasta decisión (con timeout configurable).
  - **Parser**: mapeo JSON (jsonpath) del payload al contexto.
  - **ForEach**: itera colecciones del contexto con las salidas loop/done.
- **RF-8.3** **Interpolación de variables** `{{ticket.id}}`, `{{ticket.priority}}`, `{{user.name}}` en todos los campos de texto de las acciones (la UI ya las inserta).
- **RF-8.4** Registro completo de ejecuciones y pasos (modal "Logs"): input/output por nodo, duración, error. Retención configurable (90 días).
- **RF-8.5** **Test Flow**: `POST /workflows/:id/test` ejecuta contra un payload de prueba en modo dry-run (las acciones externas se simulan) y devuelve la traza paso a paso — la UI ya anima los edges.
- **RF-8.6** Toggle activo/inactivo por workflow; contador de ejecuciones y `last_run` (las cards de la lista).
- **RF-8.7** Límites de seguridad: máx. profundidad/pasos por run (p.ej. 200), máx. iteraciones ForEach, timeout global por run, protección contra ciclos en el grafo (validación al publicar).

### RF-9 · Notificaciones
- **RF-9.1** Centro de notificaciones: listar (paginado), marcar leída, marcar todas, contador de no leídas (el badge "3" de la campana).
- **RF-9.2** Generadas por: asignación, mención, SLA warning/breach, CAB pendiente, ticket resuelto (al requester), workflow fallido (al owner), respuesta del solicitante (al asignado).
- **RF-9.3** Entrega **in-app en tiempo real por WebSocket** + email (plantillas HTML con lettre) según `notification_preferences` del usuario.
- **RF-9.4** Digest opcional por email (diario) en lugar de email por evento.

### RF-10 · Búsqueda global
- **RF-10.1** `GET /search?q=` busca en tickets (título, descripción, human_id), artículos KB, problems, changes y assets cacheados de SIGInventory; resultados agrupados por tipo (como el dropdown del header), limitados a 5 por grupo, respetando permisos del usuario (un end_user solo ve sus tickets).
- **RF-10.2** Latencia objetivo < 150 ms p95 (tsvector + índices GIN); debounce lo maneja el frontend.
- **RF-10.3** Búsqueda por ID exacto (`INC-202601`) redirige directo.

### RF-11 · Dashboard y Reports
- **RF-11.1** `GET /dashboard?site=&group=` devuelve en una sola respuesta: KPIs (open, overdue, due_today, avg CSAT), requests by category (onhold/open/overdue), unassigned/open, SLA violated, open by priority, requests últimos 7 días. **Los filtros de Site y Support Group deben funcionar.**
- **RF-11.2** Reports: agent performance (resueltos, avg first response, CSAT por agente, tendencia semanal), SLA compliance (met/breached por política, 30/7/90 días), volumen incoming vs resolved mensual, distribución CSAT.
- **RF-11.3** **Export CSV/XLSX** de cualquier reporte y del listado de tickets filtrado.
- **RF-11.4** Agregaciones con queries SQL directas + cache corto (60 s, moka); si el volumen crece, vistas materializadas refrescadas por job.

### RF-12 · CSAT
- **RF-12.1** Al pasar un ticket a `resolved`, job envía email al requester con link público tokenizado (sin login) a la encuesta: score 1–5 + comentario.
- **RF-12.2** Token de un solo uso, expira a los 14 días; reenvío manual permitido una vez.
- **RF-12.3** Resultados alimentan el KPI del dashboard y el reporte CSAT; comentario visible en el ticket.

### RF-13 · ChatOps
- **RF-13.1** **Slack**: OAuth de instalación, slash command `/sigdesk new …` crea ticket, notificaciones a canal configurado, acciones básicas desde el mensaje (assign to me, resolve) vía interactivity. Métricas de la card (tickets creados desde Slack).
- **RF-13.2** **Microsoft Teams**: bot equivalente (Bot Framework / webhook entrante saliente).
- **RF-13.3** **WhatsApp Business** (Meta Cloud API): crear ticket desde mensaje entrante de números registrados + notificar resolución. (Fase 2 — la más costosa por el onboarding de Meta.)
- **RF-13.4** Estado connect/disconnect por integración con tokens cifrados (AES-GCM con key del entorno) en `integrations.config`.

### RF-14 · API pública y API Keys
- **RF-14.1** Emisión de API keys **server-side**: se muestra una sola vez, se persiste solo hash; prefijo visible para identificarla en la tabla.
- **RF-14.2** Scopes por key (`tickets:read`, `tickets:write`, `webhooks:inventory`, `kb:read`…); middleware valida scope por endpoint.
- **RF-14.3** Revocación inmediata; `last_used_at` actualizado (async, no en el hot path).
- **RF-14.4** Rate limit por key (p.ej. 120 req/min) con headers `X-RateLimit-*`.

### RF-15 · Integración SIGInventory
- **RF-15.1** `GET /assets/:external_id` — proxy con cache (5 min) contra la API de SIGInventory: modelo, site, estado (Online/Offline), EOL, specs — alimenta el panel "Asset Details".
- **RF-15.2** **Webhook entrante** `POST /webhooks/siginventory` (autenticado con API key + firma HMAC): eventos de asset (offline, EOL) pueden disparar workflows (trigger `webhook`) — p.ej. crear ticket automático cuando una cámara se cae.
- **RF-15.3** Botón "View in Inventory" → deep-link construido con config de la integración.
- **RF-15.4** Definir con el equipo de SIGInventory: contrato de API (auth, endpoints, esquema de asset) — **dependencia externa a resolver antes de la fase 3**.

### RF-16 · Administración y auditoría
- **RF-16.1** CRUD de: usuarios, roles/permisos, grupos, sites, categorías de tickets, categorías/items de catálogo, calendarios hábiles.
- **RF-16.2** `audit_log` de toda acción administrativa y de auth; consulta filtrable solo para admins.
- **RF-16.3** Configuración global (nombre de instancia, email remitente, límites de adjuntos, retención de logs) en tabla `settings` clave-valor.

---

## 6. API — inventario de endpoints (v1)

> Todos bajo `/api/v1`. 🔒 = requiere auth; los de portal aceptan rol `end_user`.

**Auth**: `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/oidc/login` · `GET /auth/oidc/callback` · `POST /auth/forgot-password` · `POST /auth/reset-password` · `GET /me` · `PATCH /me`

**Tickets**: `GET /tickets` (filtros+cursor) · `POST /tickets` · `GET /tickets/:id` · `PATCH /tickets/:id` · `PATCH /tickets/:id/status` · `POST /tickets/:id/assign` · `POST /tickets/:id/comments` · `GET /tickets/:id/activity` · `POST /tickets/:id/attachments` · `GET /attachments/:id/download` · `POST /tickets/:id/watchers` · `DELETE /tickets/:id/watchers/me` · `POST /tickets/merge` · `POST /tickets/:id/unmerge/:childId` · `POST /tickets/bulk` · `GET /tickets/:id/sla` · `GET /tickets/:id/suggestions` · `POST /tickets/:id/links` · `DELETE /tickets/:id/links/:linkId`

**Catálogo**: `GET /catalog` · `GET /catalog/items/:id` · `POST /catalog/items/:id/submit` · CRUD admin `POST|PATCH|DELETE /admin/catalog/...`

**KB**: `GET /kb/articles` (búsqueda+filtros) · `GET /kb/articles/:id` · `POST /kb/articles/:id/vote` · `POST /kb/articles/:id/view` · `GET /kb/suggest` · CRUD agente `POST|PATCH|DELETE /kb/articles...`

**SLA**: `GET|POST|PATCH|DELETE /sla/policies` · `GET|POST|PATCH /sla/calendars` · `GET|POST|PATCH|DELETE /sla/policies/:id/escalations`

**Changes**: `GET /changes` · `POST /changes` · `GET /changes/:id` · `PATCH /changes/:id` · `PATCH /changes/:id/status` · `POST /changes/:id/approvals/:approvalId/decide` · `GET /changes/:id/tickets` · `POST /changes/:id/links`

**Problems**: `GET /problems` · `POST /problems` · `GET /problems/:id` · `PATCH /problems/:id` · `POST /problems/:id/incidents` · `DELETE /problems/:id/incidents/:ticketId` · `POST /problems/:id/notify-workaround`

**Workflows**: `GET /workflows` · `POST /workflows` · `GET /workflows/:id` · `PUT /workflows/:id/graph` · `POST /workflows/:id/publish` · `POST /workflows/:id/toggle` · `POST /workflows/:id/test` · `GET /workflows/:id/runs` · `GET /runs/:id/steps` · `POST /workflow-approvals/:id/decide`

**Notificaciones**: `GET /notifications` · `POST /notifications/:id/read` · `POST /notifications/read-all` · `GET|PUT /notifications/preferences`

**Búsqueda**: `GET /search?q=`

**Dashboard/Reports**: `GET /dashboard` · `GET /reports/agents` · `GET /reports/sla` · `GET /reports/volume` · `GET /reports/csat` · `GET /reports/:kind/export`

**CSAT** (público): `GET /csat/:token` · `POST /csat/:token`

**Integraciones**: `GET /integrations` · `POST /integrations/:provider/connect` · `DELETE /integrations/:provider` · `POST /webhooks/siginventory` · `POST /webhooks/slack` · `POST /webhooks/teams` · `POST /webhooks/whatsapp` · `GET /assets/:externalId`

**API Keys**: `GET /api-keys` · `POST /api-keys` · `DELETE /api-keys/:id`

**Admin**: CRUD `/admin/users`, `/admin/roles`, `/admin/groups`, `/admin/sites`, `/admin/settings`, `GET /admin/audit-log`

---

## 7. Tiempo real (WebSocket `/ws`)

Autenticado con el JWT. Suscripción por tópicos:

| Evento | Payload | Consumidor en la UI |
|---|---|---|
| `ticket.created` / `ticket.updated` / `ticket.status_changed` | ticket resumido | Kanban/Lista se actualizan sin refrescar |
| `ticket.commented` | comment | Activity Stream en vivo |
| `notification.new` | notification | Badge de la campana |
| `sla.warning` / `sla.breached` | ticket_id, timer | Chips SLA / badge SLA Risk |
| `workflow.run_step` | run_id, step | Animación del Test Flow con datos reales |
| `presence` (opcional) | quién ve el ticket | "Laura is viewing" |

---

## 8. Requerimientos no funcionales

### RNF-1 · Seguridad
- HTTPS obligatorio; HSTS. CORS restringido al origen del frontend.
- Argon2id para contraseñas; JWT firmado (RS256 o EdDSA, keys rotables); refresh tokens en cookie `httpOnly; Secure; SameSite=Strict`.
- Validación de **todo** input (`validator`); límites de tamaño de body; sanitización del markdown de KB/comentarios (render seguro en frontend, lista blanca de tags).
- Autorización a nivel de recurso (un end_user solo accede a sus tickets) — probada con tests.
- Secrets solo por variables de entorno; tokens de integraciones cifrados en reposo (AES-256-GCM).
- Rate limiting global por IP y por API key; lockout progresivo en login fallido.
- Cabeceras de seguridad (tower-http `SetResponseHeader`): CSP, X-Content-Type-Options, etc.
- Dependencias auditadas con `cargo audit` en CI.

### RNF-2 · Rendimiento y capacidad
- Objetivo inicial: 200 usuarios, ~50 concurrentes, 10k tickets/año — sobra con una instancia y un Postgres pequeño; dimensionar índices para 500k tickets.
- p95 < 200 ms en endpoints de lectura; < 500 ms en escrituras con side-effects.
- Paginación por cursor en todas las listas; N+1 prohibido (queries con joins/agregados).
- Pool de conexiones sqlx (max ~20); statement timeout en Postgres.

### RNF-3 · Confiabilidad
- Jobs **durables** (apalis sobre Postgres): un delay de workflow de 3 días sobrevive reinicios y deploys.
- Idempotencia en webhooks entrantes (dedup por event id) y en acciones de workflow con retry (máx 3, backoff exponencial).
- Transacciones para operaciones compuestas (merge, bulk, submit de catálogo).
- Backups automáticos de Postgres (diario + WAL) y del object storage; restore probado.
- Graceful shutdown (terminar requests en vuelo, no perder jobs).

### RNF-4 · Observabilidad
- `tracing` estructurado (JSON) con request-id propagado; log de toda mutación con actor.
- Métricas Prometheus (`/metrics`): latencias, error rate, jobs pendientes, breaches SLA, runs de workflows.
- Health checks: `/health/live` y `/health/ready` (DB + storage).

### RNF-5 · Entrega y entorno
- Dockerfile multi-stage (binario estático, imagen distroless ~20 MB) + `docker-compose` (api + postgres + minio para dev).
- CI: fmt + clippy (deny warnings) + tests + `sqlx prepare` + cargo audit.
- Migraciones automáticas al arrancar (con lock) o paso explícito de deploy.
- Config 12-factor: todo por env vars, `.env.example` documentado.
- Entornos: dev / staging / prod.

### RNF-6 · Calidad
- Tests de integración por módulo con Postgres real (testcontainers): máquina de estados de tickets, cálculo de SLA con calendarios (casos: festivo, cruce de medianoche, timezone), motor de workflows (cada tipo de nodo), permisos por rol.
- Contract tests del OpenAPI (el frontend genera su cliente desde el spec).
- Seed de datos demo (los mocks actuales de la maqueta convertidos a fixtures) para staging.

---

## 9. Cambios requeridos en el frontend (para conectar)

**Ya hecho en la maqueta (scaffolding cliente, sin backend real):**
- ✅ Estructura de rutas dividida `/app/*` (staff) y `/portal/*` (end user) con `ProtectedRoute` y redirect por rol.
- ✅ `authStore` (Zustand + persist) con roles `admin|agent|manager|end_user`; pantalla `Login` (con botón SSO Microsoft y selector de rol demo) y `ForgotPassword`.
- ✅ Layouts dedicados: `AgentLayout` (sidebar + header) y `EndUserLayout` (top-nav); navegación gateada por rol.
- ✅ `UserProfilePopover` (perfil, tema, logout) y `themeStore` con persist.
- ✅ Pantallas admin mock: `UsersManager`, `CatalogBuilder`.
- ✅ Acciones masivas en la lista de tickets (`BulkActionBar`) y `MergeTicketsModal` (lee títulos reales del store).
- ✅ Componentes reutilizables `EmptyState` y `LoadingSkeleton` **creados pero aún no cableados** en ninguna vista (pendiente conectarlos a los estados de carga/vacío cuando entre react-query).

**Pendiente para conectar al backend:**
1. **Capa de API**: cliente generado desde OpenAPI (`openapi-typescript` + `openapi-fetch`) o axios tipado; base URL por `import.meta.env.VITE_API_URL`.
2. **TanStack Query (react-query)** para fetching/cache/invalidación — reemplaza los mocks locales; Zustand queda solo para estado de UI (vista kanban/list, selección, modales, tema).
3. **Auth real**: reemplazar el login mock (que hoy elige rol en el cliente y guarda en `localStorage`) por login contra la API + OIDC; interceptor de refresh token; el rol debe venir de `GET /me`, no elegirse en el cliente; el guard `ProtectedRoute` ya existe y solo cambia su fuente de verdad.
4. **Migrar cada mock a su endpoint**: dashboard, tickets (lista/kanban/detalle/actividad/SLA/adjuntos/merged/related), catálogo dinámico (render del `form_schema` producido por `CatalogBuilder`), KB, changes+CAB, problems, SLA policies, workflows (cargar/guardar grafo, logs y test reales), notificaciones, búsqueda, reports, integraciones, api keys, admin (users), portal (mis tickets — hoy filas estáticas).
5. **WebSocket client** con reconexión para los eventos de la sección 7.
6. **Uploads** multipart con progreso; descargas vía URL firmada.
7. **Manejo de errores** homogéneo (toasts + estados de error/loading/empty en cada vista) — cablear aquí los `EmptyState`/`LoadingSkeleton` ya creados.
8. **Tema claro/oscuro**: ✅ ya funcional — `index.css` usa tokens theme-aware (`:root` claro / `.dark` oscuro) y el toggle del `UserProfilePopover` conmuta la clase `.dark` en `<html>`, persistiendo en `localStorage`. El backend solo debe persistir esta preferencia en el perfil (`GET/PATCH /me`) para que siga al usuario entre dispositivos.
9. Eliminar los datos seed del store y el `confirm()` nativo de ApiKeys (reemplazar por modal propio).
10. Los "New Ticket" (header) y el intake del catálogo deben apuntar a un flujo de creación real (hoy el header enlaza a `/app/catalog`).

---

## 10. Roadmap sugerido

| Fase | Contenido | Resultado |
|---|---|---|
| **0 — Fundaciones** (2-3 sem) | Workspace, CI, Postgres, migraciones, auth (local + OIDC), RBAC, users/groups/sites, OpenAPI, WebSocket base | Login real y esqueleto sólido |
| **1 — Núcleo de tickets** (3-4 sem) | RF-2 completo + catálogo (RF-3) + notificaciones básicas (RF-9) + búsqueda de tickets | El flujo principal funciona end-to-end |
| **2 — SLA + KB** (2-3 sem) | Motor SLA (RF-5), KB completa (RF-4), CSAT (RF-12), dashboard real (RF-11.1) | El diferenciador visual cobra vida |
| **3 — ITIL** (2-3 sem) | Changes+CAB (RF-6), Problems (RF-7), related records, SIGInventory (RF-15) | Historia ITIL completa |
| **4 — Automations** (3-4 sem) | Motor de workflows (RF-8) con todos los nodos, logs, test mode | La feature estrella |
| **5 — Integraciones y reportes** (2-3 sem) | Slack/Teams (RF-13), API keys (RF-14), reports+export (RF-11), auditoría | Producto completo |
| **6 — Pulido** | WhatsApp, email entrante, embeddings para sugerencias, portal móvil | Extras |

> Total estimado: ~4-5 meses de un desarrollador full-time con experiencia en Rust, o ~3 meses de dos.

---

## 11. Decisiones que debes tomar antes de empezar

1. **¿Dónde se hospeda?** (Azure encaja por el stack Microsoft: App Service/Container Apps + Azure Database for PostgreSQL + Blob Storage) — condiciona el object storage y el SSO.
2. **¿Solo SSO Microsoft o también cuentas locales?** (recomiendo ambos: locales para contratistas).
3. **Contrato con SIGInventory**: ¿tiene API REST? ¿puede emitir webhooks? ¿qué auth usa? — bloquea RF-15.
4. **Email**: ¿SMTP corporativo (M365) o proveedor (Resend/SendGrid)? — bloquea RF-9.3 y RF-12.
5. **Dominio y branding** del portal público de CSAT (link que sale por email).
6. **Retención de datos**: ¿cuánto tiempo se conservan tickets cerrados, logs de workflows y audit log?
7. **Idioma**: la UI está en inglés — ¿se queda así o i18n ES/EN? (mejor decidirlo antes de escribir las plantillas de email).
