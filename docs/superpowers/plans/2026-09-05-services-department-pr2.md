# Plan de implementación — Services PR2

Rama: `services/pr2-invoice-workflow-embed-stepper` (base `riascos`)
Spec: `docs/specs/2026-09-05-services-pr2-invoice-workflow-stepper.md` (revisión 2)
Handoff: `docs/handoff/2026-09-05-services-pr2.md`
Estado: **pendiente del gate del orchestrator.** Nada implementado.

## Alcance tras `/plan-ceo-review`

| Paso | Decisión |
|---|---|
| 6 — embed de `WorkflowBuilder` | **Sostenido.** Fuera de PR2 |
| 6a — `basePath` en automations | Entra, como cambio independiente |
| 5 — cotización/invoice | Entra, **bloqueado por preguntas A y B** |
| 7 — stepper | Entra |

## Bloqueo de entrada

Las tareas T3-T6 no arrancan hasta que el orchestrator responda:

- **Pregunta A** — ¿un SRV cubre un ticket o varios? (variante A1 vs A2)
- **Pregunta B** — ¿la cotización es al dealership (cobro) o al subcontractor (pago)?

T1-T2 y T7-T8 no dependen de ninguna de las dos y pueden arrancar antes.

---

## Tareas

### T1 (P1) — `basePath` en los componentes de automations
Prop/contexto con default `/app/automations`, aplicado a los 6 call sites:
`WorkflowBuilder.tsx:184,240,250`, `WorkflowCanvasEditor.tsx:379`,
`AutomationsList.tsx:51,109`.
- Sin consumidor nuevo. Services **no** se conecta.
- Verificación: `automations-visual-editor` (9), `automations-draft-designer` (6),
  `automations-status-block` (4) sin modificar.

### T2 (P1) — Corregir `fallbackTo` en las rutas de Services
`/app/services/*` hoy cae al default `/portal` (`App.tsx:110`), que expulsa al
agente del workspace. Pasar `fallbackTo="/app"` explícito.
- Hallazgo de la revisión; no estaba en el alcance original.
- Verificación: spec nuevo que entra sin `changes.view` y aserta que no aterriza
  en `/portal`.

### T3 (P1) — Tipos y mock de la cotización
`QuoteSummary`, `InvoiceStatus` en `features/services/types.ts`, con comentario
"forma propuesta, pendiente de ADR" (precedente `Subcontractor` de PR1).
Forma según la respuesta a A y B. Importes como string decimal, nunca float.
- Centinela `ERROR_DEMO_*` para el camino de error.

### T4 (P1) — `QuoteCard` en `SrvDetail`
Card con desglose (+ tabla si A2). Estados: carga / vacío / error / éxito.
- El error de la card **no** tumba `SrvDetail`.
- `Intl.NumberFormat` con moneda explícita. Cero cálculo en el cliente.
- Si A2: números de ticket como enlace, **deshabilitados sin permiso** (nunca un
  enlace que expulse a `/portal`).

### T5 (P1) — Campos de etapa en el mock de SRV
`currentStage`, actor esperado, marca de devolución, marca de transición sin
confirmar. Hoy no existen: `SrvStatus` tiene 7 valores que no son las 6 etapas.
Tabla de mapeo explícita en `presentation.ts`.

### T6 (P1) — `StatusStepper` en `SrvDetail`
Variante **S2** (§ recomendación). Lista ordenada, `aria-current="step"`, solo
lectura.
- Devolución: retrocede + ícono de retorno en `danger` + banner de página.
- Sin confirmar: punto punteado + texto. **No usa ⚠ ámbar** (ya significa "no se
  pudo validar" por ítem en `SrvDetail.tsx:131`).

### T7 (P2) — Dar comportamiento al Next Action
Hoy el botón de PR1 no tiene handler (`SrvDetail.tsx:102`). Copy por etapa según
spec §4, y deshabilitado + "esperando a \<rol\>" cuando el actor es otro.

### T8 (P2) — Specs e2e
`services-quote-invoice.spec.ts`, `services-status-stepper.spec.ts`. Van a
`FRONTEND/e2e/`, son permanentes.

---

## Verificación de cierre

- `npm --prefix FRONTEND run build`
- `npm --prefix FRONTEND run lint`
- `npm --prefix FRONTEND run test:e2e` — specs nuevos + `services-*` de PR1 sin
  modificar + `automations-*` sin modificar (para T1).

## Limpieza (Fase 7)

`rm -rf .design-scratch/2026-09-05-services-pr2` una vez integrado. No se borra
nada de `docs/`, `DESIGN.md`, ni `FRONTEND/e2e/`.
