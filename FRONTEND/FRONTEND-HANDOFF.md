# SIG-DESK Frontend — guía de arquitectura e integración

> Fuente de verdad para el equipo que implementará el nuevo backend.
>
> Estado del documento: 4 de agosto de 2026. El backend anterior fue eliminado deliberadamente. Los contratos descritos aquí se obtienen del frontend que permanece en este repositorio; no implican que exista una API ejecutándose.

## 1. Qué es esta entrega

SIG-DESK es una interfaz ITSM/ESM construida con React. Separa tres dominios de negocio que se relacionan, pero no se mezclan:

- **INC / Tickets & Issues:** fallas puntuales cuya meta es restaurar el servicio.
- **PRB / Problem Management:** causa raíz detrás de uno o varios incidentes repetidos.
- **RFC / Change Management:** modificación controlada, administrada por Services.

Un INC puede relacionarse con un PRB y un PRB puede requerir uno o varios RFC. Esas relaciones son registros explícitos; PRB y RFC no son estados ni subtipos de un ticket.

El principio arquitectónico central es:

> Propiedad distribuida por módulos, composición centralizada en Catalog Builder y ejecución dirigida por metadatos.

IAM, SLA, Automatizaciones, Integraciones, Notificaciones, Reportes y Assets/CMDB deben ser propietarios de sus recursos. Catalog Builder solo guarda referencias estables y versionadas para ensamblar una definición ejecutable. No debe almacenar credenciales, calcular SLA ni ejecutar workflows.

## 2. Stack y comandos

| Área | Tecnología |
|---|---|
| UI | React 19 + TypeScript 6 |
| Bundler | Vite 8 |
| Estilos | Tailwind CSS 4 y tokens propios en `src/index.css` |
| Navegación | React Router |
| Datos remotos | TanStack Query 5 |
| Estado local persistente | Zustand, actualmente solo tema |
| Drag-and-drop | dnd-kit |
| Workflows visuales | XYFlow |
| Animación e iconos | Framer Motion y Lucide |
| E2E | Playwright |

Requisitos: Node según `.nvmrc` y npm 10 o superior.

```bash
cd FRONTEND
npm ci
npm run dev       # http://localhost:3003
npm run lint
npm run build     # typecheck + bundle en dist/
npm run preview
```

El contenedor de producción se construye con `FRONTEND/Dockerfile`; Nginx sirve el SPA y `nginx.conf` contiene el fallback de rutas hacia `index.html`.

## 3. Configuración

Copiar `.env.example` a `.env.local`:

| Variable | Uso | Predeterminado en código |
|---|---|---|
| `VITE_API_URL` | Base de la API propia de SIG-DESK | `http://localhost:8080/api/v1` |
| `VITE_SIGTOOLS_API_URL` | Servicio corporativo de autenticación | `http://api.sig.systems:8091` |

No guardar secretos en variables `VITE_*`: Vite las incluye en el JavaScript público.

## 4. Mapa del frontend

```text
FRONTEND/
├─ public/                       Logo, favicon e iconos públicos
├─ e2e/                          Contratos/recorridos Playwright
├─ src/
│  ├─ App.tsx                    Rutas, guards y composición de layouts
│  ├─ main.tsx                   React root, QueryClient y error boundary
│  ├─ index.css                  Tema, tokens y estilos globales
│  ├─ components/                Componentes transversales y error boundary
│  ├─ layouts/                   Workspace de agente y portal de usuario
│  ├─ lib/                       Clientes HTTP, token y utilidades
│  ├─ store/                     Persistencia del tema
│  └─ features/
│     ├─ auth/                   Sesión SIGTools y autorización SIG-DESK
│     ├─ admin/                  Users & Roles y Catalog Builder
│     ├─ catalog/                Metamodelo, formularios y renderers dinámicos
│     ├─ tickets/                INC: listas, kanban, detalle y widgets
│     ├─ problems/               PRB y relaciones ITSM
│     ├─ changes/                RFC y transiciones
│     ├─ sla/                    Tipos y cliente de SLA
│     ├─ automations/            Diseñador visual de workflows
│     ├─ knowledge/              Base de conocimiento
│     ├─ reports/                Reportes
│     ├─ dashboard/              Tablero general
│     ├─ endUser/                Portal y solicitudes del usuario
│     └─ settings/               SLA, ChatOps y API keys
├─ package.json                  Scripts y dependencias
├─ vite.config.ts               Alias `@`, React, Tailwind y puerto 3003
├─ playwright.config.ts         Configuración E2E
├─ Dockerfile / nginx.conf      Entrega productiva del SPA
└─ BACKEND-REQUIREMENTS.md      Documento histórico; no es el contrato actual
```

## 5. Rutas y superficies

### Públicas

| Ruta | Pantalla |
|---|---|
| `/login` | Inicio de sesión corporativo |
| `/forgot-password` | Flujo visual aún no conectado |
| `/` | Redirección según permisos |

### Portal autenticado

| Ruta | Pantalla |
|---|---|
| `/portal` | Inicio de usuario final |
| `/portal/catalog/:categoryId` | Formulario dinámico del catálogo |
| `/portal/knowledge` | Knowledge Base |
| `/portal/knowledge/:id` | Artículo |
| `/portal/tickets` | Mis solicitudes |
| `/portal/tickets/:id` | Detalle compartido del ticket |

### Workspace de agentes

| Ruta | Permiso principal |
|---|---|
| `/app` | Uno de tickets, changes o problems view |
| `/app/catalog` | Usuario autenticado del workspace |
| `/app/tickets`, `/app/tickets/list`, `/app/tickets/:id` | `sigdesk.tickets.view` |
| `/app/problems`, `/app/problems/:id` | `sigdesk.problems.view` |
| `/app/changes`, `/app/changes/:id` | `sigdesk.changes.view` |
| `/app/knowledge*` | Usuario autenticado del workspace |
| `/app/reports` | Usuario autenticado del workspace |
| `/app/automations*` | Usuario autenticado del workspace |
| `/app/admin/users` | Actualmente sin guard específico adicional |
| `/app/admin/catalog-builder` | Actualmente sin guard específico adicional |
| `/app/settings/sla` | Actualmente sin guard específico adicional |
| `/app/settings/chatops` | Actualmente sin guard específico adicional |
| `/app/settings/api-keys` | Actualmente sin guard específico adicional |

El backend siempre debe volver a comprobar permisos. Ocultar una ruta o botón en React no es autorización.

## 6. Autenticación y autorización

Hay dos responsabilidades diferentes:

1. **SIGTools autentica** contra las identidades corporativas. El frontend usa cookies con `credentials: include`, CSRF para métodos inseguros y bearer token como respaldo entre orígenes.
2. **SIG-DESK autoriza** con roles y permisos propios. Después de restaurar la sesión, el frontend consulta `GET /me` en la API de SIG-DESK.

Endpoints SIGTools, relativos a `{VITE_SIGTOOLS_API_URL}/api/v1/web-auth`:

| Método | Ruta | Resultado esperado |
|---|---|---|
| POST | `/login/` | `{ user, access_level, access_token? }` |
| GET | `/me/` | Usuario corporativo |
| POST | `/logout/` | 204 o respuesta exitosa |
| POST | `/logout-all/` | Revoca todas las sesiones |

La API SIG-DESK recibe `Authorization: Bearer <token>` cuando existe. Un `401` cierra la sesión global; un `403` solo deniega esa operación.

Permisos tipados actualmente en `src/features/auth/permissions.ts`:

- `sigdesk.tickets.{view,create,edit,assign,resolve,merge,comment,attach}`
- `sigdesk.catalog.{view,author,publish}`
- `sigdesk.sla.{view,manage}`
- `sigdesk.changes.{view,create,edit,approve,implement}`
- `sigdesk.problems.{view,create,edit,resolve}`

También se reconoce `*`, `admin.*` y comodines por módulo. El backend nuevo debe definir formalmente los permisos faltantes de Knowledge, Automations, Reports, ChatOps, API Keys y administración, y después agregar sus guards al frontend.

## 7. Cliente HTTP y convenciones

`src/lib/apiClient.ts` concatena la ruta a `VITE_API_URL`, envía JSON, cookie y bearer. Convenciones actuales:

- Respuestas y cuerpos en JSON con nombres `camelCase`.
- Listas como `{ items: [...] }`; tickets además usan `{ nextCursor, hasMore }`.
- `204 No Content` para operaciones sin cuerpo.
- Error JSON preferido: `{ "error": "mensaje accionable" }`.
- `401` significa sesión inválida; `403`, sesión válida sin permiso.
- Creaciones sensibles aceptan `Idempotency-Key`.
- Actualizaciones de entidad usan `expectedUpdatedAt` para concurrencia optimista.
- Fechas en ISO 8601 UTC.
- Los IDs se tratan como strings opacos; nunca se debe inferir su formato.

CORS debe permitir el origen del frontend y los headers `Authorization`, `Content-Type`, `Idempotency-Key` y `X-CSRFToken` cuando corresponda.

## 8. Contratos HTTP que ya consume la UI

Todas las rutas siguientes son relativas a `VITE_API_URL` y, por tanto, normalmente a `/api/v1`.

### Identidad y RBAC

| Método | Ruta | Uso |
|---|---|---|
| GET | `/me` | `{ identity: { roles, permissions } }` |
| GET | `/admin/permissions` | Catálogo `{ items }` |
| GET/POST | `/admin/roles` | Listar/crear roles |
| PATCH/DELETE | `/admin/roles/:roleId` | Editar/eliminar rol |
| PUT | `/admin/roles/:roleId/permissions` | Reemplazar grants |
| GET | `/admin/users` | Usuarios conocidos por SIG-DESK |
| PUT | `/admin/users/:username/roles` | Reemplazar roles del usuario |

Las cuentas siguen perteneciendo a SIGTools/Active Directory. SIG-DESK solo registra identidad conocida y asignaciones locales.

### Catalog Builder, definiciones y runtime genérico

| Método | Ruta | Uso |
|---|---|---|
| GET/POST | `/catalog/definitions` | Listar versiones / crear draft |
| GET | `/catalog/definitions?status=published` | Catálogo publicado |
| GET | `/catalog/definitions/:entityKey` | Definición publicada |
| POST | `/catalog/definitions/:key/versions/:version/validate` | Validación previa |
| POST | `/catalog/definitions/:key/versions/:version/publish` | Publicación inmutable |
| GET | `/catalog/definitions/:key/versions/:version/manifest` | Manifiesto compilado |
| GET | `/catalog/resources` | Recursos versionados de módulos especializados |
| GET/POST | `/entities/:entityKey` | Listar/crear registros genéricos |
| GET/PATCH | `/entities/:entityKey/:entityId` | Leer/actualizar registro |
| POST | `/entities/:key/:id/transitions/:transitionKey` | Ejecutar transición |
| GET | `/entities/:key/:id/manifest` | Manifiesto histórico fijado |
| GET | `/entities/:key/:id/resolved-definition` | Definición y layout históricos resueltos |
| GET | `/entities/:entityKey/presentation` | Presentación publicada para intake |
| GET/POST | `/entities/:key/:id/relations` | Listar/crear relación ITSM |
| DELETE | `/entities/:key/:id/relations/:relationId` | Eliminar relación |

Crear una entidad envía `{ data }`; actualizar envía `{ data, expectedUpdatedAt }`. Una relación envía `{ relationKey, targetEntityKey, targetEntityId }`.

### Versiones separadas de layout

| Método | Ruta | Uso |
|---|---|---|
| GET/POST/PUT | `/catalog/layouts/:entityKey/draft` | Leer/crear/actualizar draft |
| POST | `/catalog/layouts/:entityKey/publish` | Publicar layout |
| GET | `/catalog/layouts/:entityKey/versions` | Historial |
| GET | `/catalog/layouts/:entityKey/active` | Versión activa |
| POST | `/catalog/layouts/:key/versions/:version/activate` | Activar una compatible |

### Tickets / INC

| Método | Ruta | Uso |
|---|---|---|
| GET | `/tickets` | Lista paginada y filtrable |
| GET | `/tickets/:id` | Proyección de ticket |
| POST | `/tickets` | Compatibilidad legado; intake nuevo usa `/entities/INC` |
| PATCH | `/tickets/:id/status` | Compatibilidad de estado |
| POST | `/tickets/:id/assign` | Asignación |
| POST | `/tickets/:primaryId/merge` | Combinar `{ mergedIds, actorName? }` |
| POST | `/tickets/:primaryId/unmerge/:mergedId` | Separar ticket |
| GET/POST | `/tickets/:id/comments` | Comentarios |
| GET/POST | `/tickets/:id/attachments` | Listar/subir multipart |
| GET | `/attachments/:attachmentId/download` | Descargar archivo |
| GET/POST | `/tickets/:id/watchers` | Listar/agregar observadores |
| DELETE | `/tickets/:id/watchers/:watcherName` | Quitar observador |
| GET | `/tickets/:id/activity` | Actividad versionada |

Filtros soportados: `status`, `priority`, `category`, `site`, `assignee`, `unassigned`, `q`, `cursor`, `limit`, `mergedInto`.

La proyección de ticket debe exponer como mínimo `id`, `entityId`, `title`, `description`, `status`, `priority`, `category`, `requesterName`, `assigneeName`, `createdAt`, `assetId`, `site`, `mergedCount` y `mergedIntoId`.

### Change Management / RFC

| Método | Ruta | Uso |
|---|---|---|
| GET | `/changes/definition` | Definición RFC |
| GET/POST | `/changes` | Listar/crear |
| GET/PATCH | `/changes/:id` | Leer/actualizar |
| GET | `/changes/:id/manifest` | Manifiesto histórico |
| POST | `/changes/:id/transitions/:transitionKey` | Transición |

Crear envía `{ data }`; actualizar envía `{ data, expectedUpdatedAt }`. El módulo es una fachada del runtime genérico RFC, no otro modelo con reglas duplicadas.

### Problem Management / PRB

Problem Management usa directamente las rutas genéricas con `entityKey=PRB` y las relaciones. La UI consulta también `INC` y RFC/changes para asociarlos. El backend debe soportar causa raíz, known error, incidentes asociados y cambios relacionados dentro de los campos/metadatos publicados, no mezclarlos en la tabla de tickets.

### SLA

| Método | Ruta | Uso |
|---|---|---|
| GET/POST | `/sla/policies` | Listar/crear draft |
| PUT | `/sla/policies/:resourceId/versions/:version` | Actualizar draft |
| POST | `/sla/policies/:resourceId/versions/:version/publish` | Publicar |
| POST | `/sla/preview` | Calcular vencimientos simulados |
| GET | `/sla/assessments` | Todas las evaluaciones |
| GET | `/sla/assessments/:entityId` | Evaluación de un registro |

Una política incluye calendario/timezone, ventanas, objetivos por prioridad, estados de pausa/respuesta/resolución y escalaciones. Catalog Builder únicamente referencia `resourceId`, versión y versión de contrato.

## 9. Metamodelo y versionado

Los tipos canónicos del cliente están en `src/features/catalog/metamodel.ts`.

Una `CatalogDefinition` contiene identidad, campos, lifecycle, bindings externos, relaciones, eventos, acciones y layouts. Al publicar debe producir un `ExecutableDefinitionManifest` con:

- `definitionVersionId`
- `entityKey` y `version`
- `metamodelVersion`
- especificación completa
- recursos externos resueltos y versionados
- `checksum`
- `compiledAt`

Reglas no negociables:

1. Draft es editable; Published es inmutable; Archived/Deprecated no se reescriben.
2. Cada registro conserva `definitionVersionId`, `definitionVersion`, `schemaVersion` y `manifestChecksum`.
3. Publicar una definición nueva no cambia silenciosamente registros históricos.
4. Las transiciones válidas de un registro provienen de su definición histórica.
5. Las referencias a IAM/SLA/Automations/etc. llevan módulo, tipo, ID, versión de recurso, versión de contrato y obligatoriedad.
6. Validar/publicar falla si un recurso requerido no existe o es incompatible.
7. Idempotencia, outbox transaccional y consumidores idempotentes deben proteger las proyecciones y side effects.

Los campos soportan `text`, `textarea`, `select`, `boolean`, `number`, `date` y `datetime`, además de reglas condicionales `visibleWhen` y `requiredWhen` con expresiones anidadas `all`/`any`.

## 10. Formularios y diseñador WYSIWYG

Hay dos niveles compatibles:

- **Metamodelo 1.4:** layouts de formularios `create`, `edit` y detalle por secciones/columnas/audiencias.
- **Metamodelo 1.5:** `detailPage`, diseñador de la página completa del ticket.

El detalle 1.5 usa regiones fijas `header`, `actions`, `main`, `sidebar` y `footer`. Cada región posee una grilla; un placement define fila, columna, spans, orden móvil, condición y si está bloqueado. Los placements pueden ser campos, widgets o contenido estructural.

Widgets registrados:

- `ticketHeader`, `ticketActions`
- `sla`, `attachments`, `activity`
- `mergedTickets`, `itsmRelations`, `assetDetails`
- `description`, `suggestedSolutions`
- `requesterDetails`, `statusHistory`

Catalog Builder guarda posición y configuración, pero no implementa la lógica de negocio del widget. La vista previa usa datos simulados; la página real usa `PageLayoutRenderer` y `TicketWidgetRegistry`. El backend debe devolver el layout histórico resuelto, no HTML ni coordenadas absolutas.

La resolución declara uno de estos modos: `latest-compatible`, `previous-compatible` o `legacy-synthesized`. Esto permite mostrar registros anteriores aunque la versión activa introduzca widgets incompatibles.

## 11. Estado real de los módulos

| Módulo | Estado del frontend | Dependencia del backend nuevo |
|---|---|---|
| Auth | Conectado a SIGTools y `/me` | Validación bearer y autorización local |
| Users & Roles | Cliente real | Persistencia RBAC y enforcement |
| Catalog Builder | Cliente, editor, validación/publicación y diseñadores reales | Definiciones, recursos, manifiestos y versiones |
| Service Catalog | Render dinámico real | Definiciones publicadas y runtime de entidades |
| Tickets / INC | Listas, kanban, detalle, merge, comentarios, adjuntos, watchers y widgets | Proyección consistente del runtime INC |
| Problems / PRB | UI y operaciones genéricas reales | Runtime PRB y relaciones |
| Changes / RFC | Board, detalle, edición y transición reales | Fachada RFC/runtime genérico |
| SLA Policies | CRUD de draft, publish, preview y assessments conectado | Motor de calendarios y evaluación |
| Automations | Diseñador visual principalmente demostrativo/local | CRUD, publicación, ejecución, delays, logs y retries |
| Knowledge Base | Datos locales/demostrativos | Artículos, categorías, búsqueda, permisos y publicación |
| Dashboard | Métricas demostrativas | Agregaciones reales |
| Reports | Visualización demostrativa | Métricas, consultas y exportaciones |
| End-user dashboard / My Tickets | Parcialmente demostrativo | Consultas acotadas al solicitante |
| ChatOps | Demostrativo | Conectores, secretos y pruebas de canal |
| API Keys | Demostrativo | Emisión, scopes, hash, revocación y auditoría |
| Assets/CMDB | Solo referencias/widgets | API de sitios/activos e integración SIGInventory |
| Notificaciones | Sin módulo funcional completo | Canales, templates, preferencias, cola y entregas |

No confundir una pantalla visualmente completa con una integración terminada. La tabla anterior debe usarse para priorizar.

## 12. Estado y renderizado React

- `main.tsx` crea un `QueryClient` con `staleTime` de 15 segundos, un retry y sin refetch al enfocar.
- TanStack Query administra datos remotos e invalidaciones por módulo.
- Zustand persiste únicamente el tema; el dominio no debe trasladarse a stores globales.
- `AppErrorBoundary` evita que un fallo de render destruya toda la aplicación.
- `React.lazy` carga Catalog Builder de forma diferida.
- Estados, prioridades y opciones vienen de metadatos; TypeScript no los trata como enums cerrados.

El backend debe ser la autoridad. El caché del navegador y los guards son optimizaciones de experiencia, no fuentes de verdad.

## 13. E2E conservados como contrato

| Spec | Intención |
|---|---|
| `incident-flow.spec.ts` | Recorrido principal de un INC |
| `itsm-golden-path.spec.ts` | Relación INC → PRB → RFC |
| `catalog-builder-runtime.spec.ts` | Publicación y preservación histórica |
| `catalog-layout-versions.spec.ts` | Versiones/activación de layout |
| `catalog-page-designer.spec.ts` | Diseñador WYSIWYG del detalle |
| `catalog-template-designer.spec.ts` | Formularios y drag-and-drop |

`npm run test:e2e` necesita un frontend y una API compatibles. Hasta que exista el backend nuevo, CI ejecuta typecheck, lint y build, pero no la suite integrada.

## 14. Orden recomendado para el backend nuevo

1. Publicar OpenAPI 3.1 con el envelope de errores y generar contract tests.
2. Integrar autenticación SIGTools y RBAC SIG-DESK; cerrar los guards administrativos faltantes.
3. Implementar Catalog Definitions, manifests inmutables, recursos versionados y runtime genérico.
4. Implementar INC y su proyección `/tickets` mediante outbox transaccional.
5. Implementar relaciones y fachadas PRB/RFC sin duplicar reglas del catálogo.
6. Implementar SLA como módulo propietario y conectarlo por binding versionado.
7. Reemplazar módulos demostrativos en este orden: Assets/CMDB, Knowledge, Automations, Notificaciones, Dashboard/Reports, ChatOps y API Keys.
8. Activar los E2E progresivamente y hacerlos obligatorios en CI.

## 15. Criterios empresariales mínimos

- PostgreSQL con migraciones revisables y estrategia de backup/restore probada.
- Auditoría inmutable de mutaciones, publicaciones, permisos y accesos sensibles.
- Outbox transaccional, idempotencia, retry con backoff y dead-letter para consumidores.
- Paginación por cursor, filtros e índices acordes a los listados del frontend.
- Object storage para adjuntos, validación de tipo/tamaño y escaneo antimalware.
- Secretos cifrados; Catalog Builder nunca recibe credenciales.
- Observabilidad con request/correlation ID, logs estructurados, métricas y health checks.
- Autorización por recurso: el portal solo puede consultar registros permitidos.
- Compatibilidad de contratos y migraciones explícitas; nunca editar versiones publicadas.
- Pruebas de concurrencia, calendarios/timezones SLA, relaciones, merge e historial.

## 16. Archivos que son contrato vivo

Antes de cambiar un endpoint o modelo, revisar conjuntamente:

- `src/lib/apiClient.ts` y `src/lib/sigtoolsClient.ts`
- `src/features/catalog/metamodel.ts` y `src/features/catalog/api.ts`
- `src/features/tickets/api.ts`, `types.ts`, `hooks.ts`
- `src/features/changes/api.ts`
- `src/features/sla/api.ts`
- `src/features/admin/rbac.service.ts`
- `src/features/auth/permissions.ts`
- `src/features/catalog/runtime/`
- `src/features/tickets/widgets/`
- `e2e/`

Cuando el backend introduzca OpenAPI, estos tipos manuales deben converger gradualmente hacia un cliente generado, sin romper los nombres que el renderer y los tests ya consumen.
