# TODOS

## Services Department

### PR2: cotización/invoice + embed de WorkflowBuilder + stepper

**What:** construir los pasos 5-7 del design doc de Services (`docs/designs/services-department-frontend.md`) — resumen de cotización/invoice, embed de `WorkflowBuilder.tsx` scopeado, stepper de estado — cortados de PR1 por el scope gate de `/plan-eng-review` (2026-09-04).

**Why:** completan el ciclo end-to-end que motivó la sesión de `/office-hours` original, incluida la pieza con más evidencia de demanda (el screenshot de ManageEngine con Work Order/PO/Invoice).

**Context:** bloqueado por 4 cosas, no solo el fix de `basePath` (ver ítem siguiente, actualizado tras la revisión de Codex en `/plan-eng-review`): (1) el fix de navegación hardcodeada, (2) un adapter mock alrededor de las llamadas reales de `features/automations/api.ts` (`WorkflowBuilder.tsx` hoy pega contra backend real, no mock), (3) scoping real de los datos de `WorkflowDefinition` por departamento (hoy no existe el campo), (4) el ADR de `WF-TODO-001`/`WF-TODO-006`. No arranca hasta que PR1 esté mergeado. Ver el design doc completo para el detalle de cada paso.

**Effort:** L
**Priority:** P1
**Depends on:** Fix de basePath + adapter mock + scoping de datos (ver ítem siguiente), PR1 mergeado.

**Estado (2026-09-05, tras `/plan-ceo-review`):** PR2 entregó los pasos **5 y 7**
más el fix de `basePath` (6a). El **paso 6 (embed de `WorkflowBuilder`) quedó
sostenido**, no cancelado. Motivo: su única justificación declarada era empujar
el ADR de `WF-TODO-001`/`WF-TODO-006`, y contra el código real el costo es mucho
mayor de lo que decía este ítem — 4 archivos y 9 endpoints (no 1 y 3),
`categoria_id` hardcodeado a `'INC'` en `visual-model.ts:283` (un workflow
creado desde Services sería de INC), `mockQuery.ts` incapaz de sostener
guardar/publicar/recargar sin reimplementar el camino de escritura de
`workflow_service`, sin entrada en `navigation.ts`, y sin tomar el skin de
departamento. La presión del ADR se ejerce desde
`docs/handoff/2026-09-05-services-pr2.md`, a costo cero de código compartido.
Ver `docs/specs/2026-09-05-services-pr2-invoice-workflow-stepper.md` §7.

---

### 15 specs de `automations-*` fallan en `riascos` (preexistente, no es de PR2)

**What:** `automations-draft-designer` (4), `automations-execution-plan` (3),
`automations-status-block` (2) y `automations-visual-editor` (6) fallan contra el
dev server local. Síntoma típico: timeout esperando controles del canvas (ej.
`getByRole('button', { name: /Cambiar estado/ })`).

**Why:** se descubrió al usar esa suite como red de regresión del fix de
`basePath` en PR2. Importa dejarlo escrito porque la próxima persona que toque
`features/automations/` va a ver 15 rojos y va a creer que los rompió.

**Context:** verificado por comparación directa durante PR2 (2026-09-05):
se revirtieron los 3 archivos de automations al estado de `riascos`, se corrió
la suite, y fallan **los mismos 15 tests, con los mismos nombres**, con y sin el
cambio. O sea: preexistentes en `riascos`, no introducidos por el fix de
`basePath`. No se investigó la causa raíz — puede ser dependencia de backend
real, del stack aislado, o deriva de fixtures. Nadie corrió esta suite en el
baseline antes de PR2, así que no se sabe desde cuándo.

**Effort:** M (investigación, no arreglo conocido)
**Priority:** P2
**Depends on:** None.

---

### Fix de basePath en WorkflowBuilder.tsx y WorkflowCanvasEditor.tsx (navigate hardcodeado)

**What:** agregar un prop/context `basePath` a `PublishedViewer` y `NewWorkflow` (`src/features/automations/WorkflowBuilder.tsx`) **y** al botón de `WorkflowCanvasEditor.tsx:379` (hallazgo de Codex, no visto en la primera pasada de esta revisión) — los tres navegan a un path absoluto hardcodeado. Default `/app/automations` para preservar el comportamiento actual.

**Why:** sin esto, cualquier embed scopeado (Services u otro departamento futuro) saca al agente del área al crear/guardar/publicar un workflow, o al usar el editor de canvas.

**Context:** hallazgo verificado leyendo el archivo real durante `/plan-eng-review` (2026-09-04), ampliado por el outside voice de Codex — `PublishedViewer`/`NewWorkflow` llaman `navigate(\`/app/automations/${id}\`)`, y `WorkflowCanvasEditor.tsx:379` tiene el mismo patrón. Bloquea el PR2 de Services (ver ítem anterior) — pero **no es el único bloqueador**, ver ese ítem para el resto.

**Effort:** S
**Priority:** P1
**Depends on:** None

---

### Jerarquía interna del departamento Services

**What:** modelar niveles jerárquicos dentro de Services (mencionado por el usuario en la sesión de `/office-hours` original, punto 3 de su pedido).

**Why:** el usuario lo marcó explícitamente como diferido, no parte de esta planificación de frontend.

**Context:** no se sabe todavía si es un caso particular de la jerarquía `Empresa → Departamento → Equipo` ya existente en `organization_service`, o si necesita un nivel nuevo. Depende de una decisión de producto y posiblemente un ADR de backend.

**Effort:** M (sin explorar aún)
**Priority:** P3
**Depends on:** None identificado todavía.

---

### Reconsiderar theming de shell completo (sidebar+header) si el producto lo pide

**What:** extender `AgentLayout.tsx` para que el rail de navegación y el header también tomen el skin de departamento, no solo el área de contenido.

**Why:** `/plan-eng-review` (2026-09-04) eligió contenido-only (decisión 1A) para no tocar código compartido por todos los departamentos; si el negocio insiste en el look completo del mockup original, este es el camino a seguir.

**Context:** requiere modificar `AgentLayout.tsx`, usado hoy por todos los departamentos — blast radius real, no trivial. Solo vale la pena si el feedback de uso real de Services (post-PR1) lo pide.

**Effort:** S-M
**Priority:** P4
**Depends on:** Feedback de uso real de PR1.

### DESIGN.md formal para SIG-Desk-Frontend

**What:** correr `/design-consultation` para armar un sistema de diseño documentado (paleta, tipografía, espaciado, componentes) para todo el frontend, no solo Services.

**Why:** sin `DESIGN.md`, cada nueva feature extrae tokens ad hoc de mockups sueltos en vez de calibrar contra una fuente de verdad.

**Context:** surge del Pass 5 de `/plan-design-review` (2026-09-05). Alcance de todo el repo, no solo del departamento Services.

**Effort:** M (su propia sesión de consultoría)
**Priority:** P3
**Depends on:** None.

## Completed

### Estado por ítem del checklist de equipamiento (faltante/confirmado/en tránsito)

Implementado en PR1 como `EquipmentItemStatus` (`'confirmed' | 'missing' | 'in_transit'`) en `features/services/types.ts`, con badge por estado en el checklist de `SrvDetail.tsx`. El modelo real (post-ADR de SRV) sigue pendiente, pero el enum de placeholder que este ítem pedía ya está en el mock.

**Completed:** v0.2.0-beta (2026-09-05)
