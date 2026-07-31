# ADR 0010 — Layout como recurso versionado

**Estado:** Aceptado  
**Fecha:** 2026-07-31  
**Autores:** Equipo SIG-DESK  
**Hilo relacionado:** PR 4 – `catalog/pr4-versioned-layouts`

---

## Contexto

El metamodelo 1.5 introdujo `PageLayout` como estructura de detalle basada en
regiones fijas. Hasta este ADR el layout se derivaba en el cliente a partir de
la especificación publicada (`CatalogDefinition.specification.detailPage`) usando
`resolveTicketPageLayout`. Esto implicaba que:

1. El diseño de la página de un ticket de incidente histórico dependía de que
   el frontend ejecutara una resolución "cliente-side" antes de renderizar.
2. No había versionado explícito: un cambio en `detailPage` se aplicaba
   globalmente de inmediato sin trazabilidad.
3. No existía mecanismo de rollback ni compatibilidad garantizada entre el
   layout y el schema vigente en el momento de creación del ticket.

---

## Decisión

Se introduce la tabla `catalog_layout_versions` y el ciclo de vida:

```
draft (version=0) → published (version≥1, active=true) → deprecated → archived
```

Reglas invariantes:
- Una sola fila puede estar en `draft` por `entity_key`.
- `version=0` solo para `draft`.
- Toda fila `published/deprecated/archived` es **inmutable** (trigger PostgreSQL).
- Un borrador nunca revierte a `published`; solo sube.
- Solo `published` puede ser `active`; solo una fila por `entity_key` puede ser `active`.

### Locking concurrente

Toda escritura sobre layouts de una entidad adquiere previamente
`pg_advisory_xact_lock( hashtext('catalog_layout:' || entity_key) )`.
Esto serializa `CreateDraft`, `UpdateDraft`, `PublishDraft` y `ActivateVersion`
sin bloquear al resto del catálogo.

`PublishDraft` aplica el lock y a continuación:

1. `SELECT … FOR UPDATE` del draft.
2. Valida compatibilidad sobre el documento bloqueado.
3. Deriva `CompatibilityFingerprint` y calcula el checksum SHA-256 canónico.
4. Calcula `nextVersion = MAX(version) + 1`.
5. Desactiva la versión activa anterior (`is_active = false`).
6. Actualiza draft → `published/active` con `RETURNING version`.
7. `COMMIT`.

### Resolver `GET /entities/{entityKey}/{entityID}/resolved-definition`

El endpoint selecciona el layout en este orden sin ejecutar escrituras:

1. Versión activa para el `entity_key` (**`active`**).
2. Si incompatible, la última versión publicada compatible (**`latest-compatible`**).
3. Si ninguna existe, sintetiza desde la especificación publicada en memoria
   (**`legacy-synthesized`**).

El campo `layoutResolution` en la respuesta indica cuál de las tres estrategias
se usó.

### `FieldDefinition.id`

Se añade el campo `ID string` a `FieldDefinition`. El accessor `FieldID()`
retorna `ID` si no vacío, y `Key` como fallback.  Los bindings del layout usan
`fieldId`; `entity_records.data` continúa usando `key` para compatibilidad.

---

## RecordAuthorizer

`DefaultRecordAuthorizer` es un puerto de aplicación en
`catalog/application/record_authorizer.go`. Valida:

1. Que el actor tenga credencial (no anónimo).
2. El permiso de lectura del módulo asociado al `entityKey` (`sigdesk.tickets.view`,
   `sigdesk.problems.view`, etc.).

No depende de `ticket.Domain` ni de ningún tipo de ticket específico.

---

## Consecuencias

### Positivas
- Historial auditado y reversible de layouts.
- Compatibilidad garantizada: nunca se activa un layout que no es compatible
  con el schema del momento.
- Separación clara entre schema versionado (definición) y presentación
  versionada (layout).
- La resolución pasa al backend; el frontend consume un único endpoint
  (`/resolved-definition`) que retorna el layout correcto sin lógica de
  selección en cliente.
- `resolveTicketPageLayout` queda en el cliente solo como fallback de
  degradación graciosa cuando el backend no devuelve `layouts`.

### Negativas / Compensaciones
- Nueva tabla y conjunto de endpoints aumentan la superficie de la API.
- El advisory lock serializa todas las escrituras de layout por entidad
  (aceptable dado que el tráfico de escritura es administrativo y esporádico).
- El diseñador visual de layouts versionados (drag-and-drop sobre `PageDesigner`)
  queda pendiente para PR 5; en PR 4 se expone un editor JSON como puente.

---

## Alternativas descartadas

| Alternativa | Razón del descarte |
|---|---|
| Versionado embedido en `catalog_definitions` | Mezcla schema y presentación; hace inmutables los cambios de layout ligados a los de schema. |
| Versionado sin advisory lock (optimistic) | Condición de carrera en `MAX(version)+1` bajo concurrencia. |
| Resolución cliente-side completa | No permitiría rollback ni auditoría en servidor; expone lógica de selección sensible al frontend. |
