# Spec funcional — Services PR2: cotización/invoice, embed de WorkflowBuilder, stepper

Fecha: 2026-09-05
Rama: `services/pr2-invoice-workflow-embed-stepper` (base: `riascos`)
Design doc de origen: `docs/designs/services-department-frontend.md` (status APPROVED)
Alcance propuesto originalmente: pasos 5, 6 y 7 de `Recommended Approach`.
Estado: **propuesta, pendiente del gate del orchestrator.** Nada implementado.

**Revisión 2 (2026-09-05), tras `/plan-ceo-review`.** Dos revisores independientes
(Codex `gpt-5.6` y un subagente Claude sin contexto de esta sesión) llegaron por
separado al mismo veredicto y tiraron abajo una afirmación central de la revisión
1. Este documento incorpora esas objeciones. Lo que cambió está marcado con
**[CORREGIDO R2]**.

**Revisión 3 (2026-09-05), tras el gate del orchestrator.** Las preguntas A y B
de la revisión 2 quedaron **respondidas**. Ya no son preguntas abiertas: son
decisiones tomadas, con su consecuencia de modelo de datos. Marcado
**[DECIDIDO R3]**.

---

## 0. Veredicto de la revisión

| Paso | Decisión |
|---|---|
| 5 — Resumen de cotización/invoice | **Ship.** Preguntas A y B resueltas en §2 |
| 6 — Embed de `WorkflowBuilder` | **SE SOSTIENE.** No entra en PR2 (§7) |
| 6a — Fix de `basePath` (sacado del paso 6) | **Ship como cambio independiente**, sin acoplamiento a Services |
| 7 — Stepper de estado | **Ship** (§4, §5). Variante **S2** |

Razón corta para sostener el 6: su única justificación declarada en el design
doc es presionar un ADR de backend, no una necesidad de un agente de Services.
El costo real, medido contra el código y no contra el `TODOS.md`, es mucho mayor
de lo que la revisión 1 estimó, y el artefacto que produciría sería
**engañoso**, no una demo del futuro. Detalle en §7.

---

## 1. Qué se construye

| Paso | Entregable | Superficie |
|---|---|---|
| 5 | Resumen de cotización + estado de invoice | Card dentro de `SrvDetail` |
| 6a | Prop/contexto `basePath` en los componentes de automations | `features/automations/*`, sin tocar Services |
| 7 | Stepper de progreso de estado (6 etapas) | Card superior de `SrvDetail` |

Pasos 5 y 7 son mock-only, con el mismo constraint que PR1. El 6a no toca
Services en absoluto: es deuda técnica compartida que se paga sola.

---

## 2. Paso 5: dos preguntas de producto sin responder **[CORREGIDO R2]**

**La revisión 1 de este documento afirmó lo siguiente, y era incorrecto:**

> "Un SRV es la visita. La visita es el work order. Sus line items son los
> tickets de IT (INC/PRB) que se resuelven durante esa visita." ... "reconcilia
> la evidencia con el design doc APPROVED sin reabrirlo."

No lo reconcilia: **lo reabre**, y contradice el código de PR1. Verificado:

- `features/services/types.ts` — `SrvTicket` tiene `equipment[]`,
  `subcontractorId?`, `dealershipId`, `assignedScope`. **No hay ningún campo**
  que exprese "los tickets de IT que esta visita cubre", ni fila en `mockData.ts`
  que lo insinúe.
- `RecurringProblem` es de alcance dealership, sin `humanId`, sin id de ticket,
  sin ruta. Por lo tanto la afirmación de que `RecurringProblemsPanel` y la tabla
  de line items son "dos vistas del mismo bundle" es **falsa a nivel de tipos**:
  las filas del panel y los supuestos line items no comparten clave.
- El design doc apunta a la contención **opuesta**: su wedge es "un agente de
  Services, recibiendo **un PRB** escalado por IT", y sus Dependencies dicen
  "relación con PRB (`resolvedBy`-like)", en singular. Uno a uno, no uno a N.

Construir el paso 5 sobre esa lectura exige **una relación SRV→tickets nueva,
inventada en PR2** — que es exactamente la "entidad de agrupación" que la
revisión 1 declaró innecesaria. La relación *es* la entidad; el documento
simplemente se negaba a nombrarla.

### [DECIDIDO R3] A — un SRV es la visita y agrupa varios tickets

**Decisión del orchestrator: `SRV → tickets[]`, no 1:1.** Un SRV/Work Order
puede cubrir varios INC/PRB distintos resueltos en la misma visita. Es
consistente con el bundling de problemas recurrentes que PR1 ya construyó y con
el Work Order real de referencia, que traía 3 tickets en una tabla.

Consecuencia de modelo de datos, que es lo que la revisión 2 exigía nombrar en
vez de asumir:

- Se agrega una relación explícita **`SrvTicket.coveredTickets: CoveredTicket[]`**.
- `CoveredTicket` lleva `id`, `humanId`, `entityKey` (`'INC' | 'PRB'`) y `title`.
- Es un **tipo local marcado "forma propuesta, pendiente de ADR"**, mismo
  precedente aprobado que `Subcontractor` / `DealershipPOC` de PR1. No se declara
  vocabulario de dominio: `work order` no está en el glosario (§9).
- Sigue en pie que el ADR de `SRV` tiene que decir si esta relación es la forma
  correcta. Va en el handoff (§2 de ese documento).

**Grano del traslado.** `travel rate` es un costo **por visita**, no por ticket.
El mock lo carga en una sola línea y las demás muestran "—". Si estuviera en cada
fila, N tickets inflarían el total por N viajes que no ocurrieron. La regla "el
frontend nunca calcula dinero" no tapa esto: la forma del dato lo previene.

### [DECIDIDO R3] B — son dos documentos, no uno

**Decisión del orchestrator: el paso 5 modela los dos lados.** El design doc no
se contradecía; describía dos documentos distintos:

| Documento | Contraparte | Dirección | Origen en la evidencia |
|---|---|---|---|
| **Cotización del subcontractor** | Subcontractor | Lo que SIG Systems **paga** | Panel "Vendor Details" del WO real |
| **Invoice al dealership** | Dealership | Lo que SIG Systems **cobra** | "Billing Address" propia de SIG Systems en ese WO |

Consecuencias:

- Dos tipos separados: `VendorQuote` (costo) y `CustomerInvoice` (cobro). No un
  `QuoteSummary` ambiguo.
- Los line items por ticket pertenecen a la **cotización del subcontractor**: es
  ahí donde el desglose por ticket tiene sentido operativo (qué trabajo se le
  pidió al proveedor).
- El estado de invoice (`pendiente` → `recibido` → `verificado` →
  `enviado a Accounting`) pertenece al **invoice del dealership**.
- La card muestra los dos lados con etiqueta explícita de dirección. Un agente
  nunca tiene que adivinar de quién es la plata que está mirando.
- **No se calcula margen ni diferencia entre los dos.** Sería calcular dinero en
  el cliente (§R-8). Si el negocio lo quiere, lo entrega el backend.

**[CORREGIDO R2 → resuelto R3]** El "descarte" de la Billing Address de la
revisión 2 era correcto como *dato de dirección postal* (constante de la
organización) pero escondía la señal real: ese panel indicaba que existe un
segundo documento, el que SIG Systems cobra. Se descarta la dirección; se adopta
el documento.

### Qué se adapta de la herramienta legacy y qué se descarta

Vale para las dos opciones de la pregunta A.

| Elemento de la captura | Decisión | Motivo |
|---|---|---|
| Desglose al pie (Sub Total, Discount, Total Net, Shipping, Sales Tax) | **Se adopta** | Es la forma con evidencia real |
| Tabla de line items | **Depende de la pregunta A** | Solo existe si un SRV cubre varios tickets |
| Panel Vendor Details | **No se duplica** | `SubcontractorPicker` ya existe (PR1). La card lo referencia |
| Panel Site/Location | **No se duplica** | `SrvDetail` ya enlaza al dealership en su `PageHeader` |
| Campo **fax** | **Se descarta** | Ruido de herramienta legacy |
| Billing Address de SIG Systems | **Se descarta de la card** | Organización única, no multi-tenant: es constante, no dato por ticket |
| Estructura de 4 tabs | **Se descarta** | Los blockers nunca van detrás de un tab (design doc Pass 1) |

### Regla dura de dinero

**El frontend nunca calcula dinero.** El mock entrega totales ya calculados; la
UI muestra lo que recibe. Las reglas de redondeo e impuestos son del backend, y
un frontend que recalcula termina mostrando un número distinto al de la factura
de registro. Importes con `Intl.NumberFormat` y moneda explícita, nunca
`'$' + número`. Ver `docs/design-rules.md` §R-8.

---

## 3. User stories y criterios de aceptación

### US-1 — Ver los dos lados del dinero de una visita (paso 5)

**[DECIDIDO R3]** Desbloqueada. Criterios:

1. La card aparece en `SrvDetail`, sin desplazar los blockers de su prioridad.
2. Muestra **dos secciones rotuladas por dirección**: "Cotización del
   subcontractor — lo que pagamos" y "Invoice al dealership — lo que cobramos".
   Ninguna cifra aparece sin decir de quién es.
3. La cotización del subcontractor lista **una fila por ticket cubierto** con
   traslado, precio, % de impuesto, hora extra y cantidad de horas.
4. El traslado aparece **una sola vez**; las demás filas muestran "—".
5. Los dos pies muestran su desglose **tomado del mock**, nunca calculado en el
   cliente. No se muestra margen ni diferencia entre ambos.
6. El estado del invoice se muestra como pill con cuatro valores: `pendiente`,
   `recibido`, `verificado`, `enviado a Accounting`.
7. Los importes se formatean con `Intl.NumberFormat` y moneda explícita.
8. **[CORREGIDO R2]** Cada ticket cubierto se muestra por su número visible, y
   hay que manejar **dos** fallas, no una: ticket sin ruta conocida y **ticket
   con ruta pero sin permiso**. SRV es standalone a propósito (no está en
   `TicketWidgetRegistry`), y `/app/tickets/:id` está gateado por permisos
   distintos a `/app/services/*`. Como `ProtectedRoute` cae a `/portal`
   (`App.tsx:110`), un enlace así **expulsa al agente del workspace entero**.
   Se resuelve con `can()`: con permiso, enlace; sin permiso, texto con
   `title` explicando por qué no es navegable. Nunca un enlace que expulsa.

### US-2 — Ver el progreso de la visita de un vistazo (paso 7)

1. Stepper de 6 etapas fijas: Diagnosis → Approval → Equipment → Scheduling →
   Service → Closure.
2. Etapas previas con check, actual resaltada, siguientes atenuadas.
3. **Proyección de solo lectura.** Ningún paso es clickeable ni dispara
   transición.
4. El botón Next Action toma su copy de la etapa actual (§4), no un genérico.
5. Cuando la acción le corresponde a otro rol, el botón queda **deshabilitado**
   con una frase explícita de a quién se espera.
6. El estado "devuelto por el departamento destino" se renderiza según §5.
7. Navegable por lector de pantalla como lista ordenada con `aria-current="step"`.
8. **[CORREGIDO R2]** El stepper necesita una **fuente de estado que hoy no
   existe**. `SrvStatus` tiene 7 valores que no son las 6 etapas, y `SrvTicket`
   no tiene `currentStage`, ni actor esperado, ni marca de devolución. Hay que
   agregar esos campos al mock y una tabla de mapeo explícita. No es "leer lo que
   ya está".
9. **[CORREGIDO R2]** El "Next Action" de PR1 **no tiene handler**
   (`SrvDetail.tsx:102`): hoy es un botón sin comportamiento. "Habilitado" tiene
   que significar algo antes de que el copy por etapa signifique algo.

### US-3 — Embed de workflows (paso 6)

**Retirada de PR2.** Ver §7. Su contenido pasa al handoff como solicitud de ADR.

### US-4 — `basePath` en los componentes de automations (paso 6a)

1. Los 6 call sites de §7.1 reciben su ruta base por prop/contexto.
2. Default `/app/automations`, preservando el comportamiento actual.
3. Ningún consumidor nuevo. Services **no** se conecta en este PR.
4. La suite `automations-*.spec.ts` existente pasa sin modificarse (§10).

---

## 4. Copy de Next Action por etapa

| Etapa | Copy del botón | Actor | Estado |
|---|---|---|---|
| Diagnosis | Submit for approval | Agente de Services | Habilitado |
| Approval | Waiting on approval | Aprobador | Deshabilitado + "Esperando aprobación de \<rol\>" |
| Equipment | Confirm equipment checklist | Agente de Services | Habilitado. Con ítems `missing`, pasa a **Resolve blockers** (comportamiento de PR1, no se rompe) |
| Scheduling | Schedule dispatch | Agente de Services | Habilitado |
| Service | Record service outcome | Agente / subcontractor | Habilitado |
| Closure | Close ticket | Agente de Services | Habilitado |

**[CORREGIDO R2]** La revisión 1 ponía "Send invoice to Accounting" en Closure,
con el botón dependiendo del estado del invoice. Eso creaba una **dependencia
oculta del paso 7 sobre el paso 5**: si el 5 se atrasa por las preguntas A/B, el
criterio US-2.4 quedaba insatisfacible. Closure ya no depende de la card de
cotización. El envío a Accounting es una acción de la card, no del stepper.

Regla: **una pantalla, un botón primario** (`docs/design-rules.md` §R-5).

---

## 5. "Devuelto por el departamento destino"

**No es una séptima etapa.** Agregar un paso implicaría avance por rechazo. Es
una reversión:

1. El stepper retrocede a la etapa que hay que rehacer.
2. Esa etapa se marca con tratamiento propio: tono `danger` + ícono de retorno.
3. Banner de blocker a nivel página (patrón de PR1), nunca detrás de un tab.

**[CORREGIDO R2] Colisión de símbolos, tres significados y dos símbolos en una
pantalla.** PR1 ya usa ⚠ ámbar dentro de `SrvDetail` para "no se pudo validar"
por ítem de equipamiento (`SrvDetail.tsx:131-138`), y el design doc asigna ⚠ a
"el backend no pudo confirmar la transición" en el stepper. Son dos significados
distintos con el mismo símbolo, en la misma pantalla, más la devolución.

Resolución: el stepper **no usa ⚠**. La transición no confirmada se marca con un
punto hueco y el texto "sin confirmar"; la devolución con el ícono de retorno en
`danger`; el ⚠ ámbar queda reservado a la validación por ítem, que ya lo tiene.
Un símbolo, un significado (`docs/design-rules.md` §R-4).

---

## 6. Estados de carga, vacío y error

| Pieza | Loading | Empty | Error | Success |
|---|---|---|---|---|
| Card de cotización | Skeleton de 3 filas + pie | "Todavía no se cotizó esta visita" + acción secundaria | "No se pudo cargar la cotización" + reintentar. **No** tumba el resto de `SrvDetail` | Desglose (+ tabla si A2) |
| Pill de invoice | Skeleton inline | No aplica sin cotización | Pill en "—" + tooltip; la card sigue | Uno de los 4 estados |
| Stepper | No aplica: siempre hay etapa | No aplica | Etapa con punto hueco + "sin confirmar" (§5) | Etapa actual resaltada |

Errores ejercitados con centinelas deterministas en `mockData.ts`, siguiendo el
patrón `ERROR_DEMO_*` de PR1, no con inyección aleatoria.

---

## 7. Por qué se sostiene el paso 6 **[CORREGIDO R2]**

La revisión 1 listó 4 bloqueadores del `TODOS.md` + 1 propio. Contra el código
real son más, y peores.

### 7.1 Navegación hardcodeada: 6 call sites

| Archivo:línea | Acción |
|---|---|
| `WorkflowBuilder.tsx:184` | `PublishedViewer` → crear borrador |
| `WorkflowBuilder.tsx:240` | `NewWorkflow` → publicar |
| `WorkflowBuilder.tsx:250` | `NewWorkflow` → guardar borrador |
| `WorkflowCanvasEditor.tsx:379` | Botón "Back" |
| `AutomationsList.tsx:51` | "Create workflow" |
| `AutomationsList.tsx:109` | "View definition" |

`navigation.ts:202` y `Dashboard.tsx:104` también son absolutos, pero
correctamente: son navegación global al área de IT.

Esto **sí** se arregla en PR2, como paso 6a independiente. Es efort S, no tiene
acoplamiento con Services, y le sirve a cualquier departamento futuro.

### 7.2 La costura no es una: son 4 archivos y 9 endpoints

La revisión 1 dijo "`WorkflowBuilder.tsx` importa de `./api`". También lo hacen:

- `WorkflowCanvasEditor.tsx:221` → `getWorkflowAssignmentDirectory`
- `AssignmentActionEditor.tsx:18` → `getWorkflowAssignmentDirectory`
- `StatusActionEditor.tsx:33` → `listCatalogTransitions(entityKey)`

Un `dataSource` consumido solo en `WorkflowBuilder.tsx` deja tres descendientes
pegando contra el **backend real** desde dentro de un área "mock-only".

Y los endpoints de `features/automations/api.ts` no son 3 sino 9: `/workflows`,
`/workflows/:id`, `/workflows/drafts`, `/workflows/:id/borradores`,
`/workflows/:id/publicar`, `/workflows/:id/desactivar`,
`/workflows/:id/executions`, `/catalog/definitions/:entityKey`,
`/organization/assignment-directory`. Entre ellos `deactivateWorkflow`, una
**mutación destructiva** que la revisión 1 listó solo como call site de
navegación.

### 7.3 `mockQuery.ts` no puede sostener el embed

`lib/mockQuery.ts` es un `setTimeout` sobre un valor estático. Sin store, sin
generación de ids. El criterio "guardar → navegar al id nuevo → recargar el
borrador" exige un repositorio en memoria con `revision` (control optimista,
`api.ts:104`), semántica de `workflow_family_id`, y validación de
`execution_plan` al publicar — que el propio código dice que **la hace el
backend** ("un grafo sin ciclos... que el backend valida al publicar").

Un mock que nunca rechaza un grafo inválido le enseña al usuario un
comportamiento que el builder real prohíbe, y cualquier e2e escrito contra él
asserta ficción. No es "un adapter mock": es reimplementar el camino de
escritura de `workflow_service` en TypeScript.

### 7.4 El scoping por `categoria_id` no funciona

Era la mitigación propuesta en la revisión 1. No sobrevive al código:

- `visual-model.ts:283` compila el payload de publicación con
  `categoria_id: 'INC'` **hardcodeado**. Un workflow creado desde Services sería
  un workflow de INC.
- `WorkflowCanvasEditor.tsx:284` y `:646` caen a `'INC'` por defecto, y ese
  `entityKey` es el que `StatusActionEditor` usa para pedir
  `/catalog/definitions/:entityKey`. Con `SRV` inexistente como `entity_key`, el
  editor de acciones de estado del embed queda **vacío o en 404 por
  construcción**.

Y el problema de fondo sigue: el glosario documenta que `Departamento (de un
Ticket)` **no está modelado en `domain.Ticket`** (⚠ Pendiente de ADR,
`WF-TODO-001`). No es solo que `WorkflowDefinition` no sepa de qué departamento
es; la entidad sobre la que los workflows actúan tampoco.

### 7.5 El embed no tiene puerta de entrada

`config/navigation.ts` es la única fuente de verdad de sidebar/drawer/bottomnav,
y solo tiene la entrada `services` de nivel superior. Sin entrada hija,
`/app/services/automations/*` es alcanzable únicamente tecleando la URL. El
criterio "abro el builder desde mi área" es inimplementable como estaba escrito.

### 7.6 La doble puerta expulsa al usuario del workspace

`ProtectedRoute` cae a `fallbackTo ?? '/portal'` (`App.tsx:110`). Un agente con
`changes.view` pero sin `automations.manage` no vuelve a Services: **sale al
portal de usuario final.** La doble puerta sigue siendo la forma correcta de
gatear (§R-11), pero necesita `fallbackTo="/app/services"` explícito.

### 7.7 El embed sería un agujero sin tema dentro del departamento temático

`WorkflowCanvasEditor` está pintado contra tokens globales (`bg-background`,
`bg-surface-container-low`, emerald/red/amber hardcodeados) y planta un botón
`fixed bottom-24 right-7`. No toma el skin `data-department="services"` — la
Premisa 2 del design doc ya concede que ancestros y portales no cascadean.

O sea: el paso 6 embebería una superficie visiblemente ajena dentro del
departamento, lo que **contradice la tesis de personalización por departamento
que es el punto entero del slice**.

### 7.8 Claves de React Query globales

`['workflows']`, `['workflow', id]` son globales. Compartirlas entre IT y
Services puede servir datos de una superficie en la otra.

### Conclusión

El argumento a favor de shippear el 6 ahora es real y hay que decirlo: el ADR
está trabado, los pedidos abstractos no mueven colas de backend, y una
superficie mergeada y visiblemente degradada sí. Pero ese argumento solo
funciona si la cosa se llama **spike interno detrás de un feature flag**. Como
feature de autoría crea workflows con categoría INC, sin scoping real, con
persistencia simulada incompleta, sin editor de estados, sin puerta de entrada y
sin tema. Convierte presión organizacional en deuda permanente de un componente
que usan todos los departamentos.

Y si el ADR aterriza en una forma distinta a "`categoria_id` como departamento"
— probable, dado que `domain.Ticket` no modela departamento — el adapter entero
y su suite de e2e se tiran.

**Se sostiene el 6. La presión del ADR se ejerce con el handoff (§4 de
`docs/handoff/2026-09-05-services-pr2.md`), que cuesta cero riesgo de código
compartido, y con el 6a, que es el único pedazo del paso 6 cuyo valor no depende
del ADR.**

---

## 8. Fuera de alcance

- Paso 6 completo (embed). Sostenido, ver §7.
- Builder de cotización interactivo. La card es de lectura.
- Wiring real contra el Gateway.
- Escribir el ADR de `SRV`, el de Subcontractor/POC, o el de
  `WF-TODO-001`/`WF-TODO-006`. Se solicitan en el handoff.
- `DESIGN.md` completo del frontend. PR2 aporta solo la sección de Services.
- Theming del shell completo (TODO P4).
- Jerarquía interna de Services (TODO P3).
- Registrar `SRV` en `TicketWidgetRegistry.tsx`.

---

## 9. Vocabulario: términos que el dominio no posee

Verificado leyendo `SIG-Desk-Backend/Docs/glossary.md` completo. **Ninguno**
existe: `work order` · `cotización` · `invoice` · `purchase order` · `vendor` ·
`subcontractor` · `point of contact` · `SRV`.

Regla del glosario: "Si un término no está acá, no se usa hasta definirlo."

Se sigue el precedente aprobado de PR1: tipos locales de `features/services/`
con comentario "forma propuesta, pendiente de ADR", más solicitud de entrada de
glosario en el handoff. Ningún término se declara vigente.

**[CORREGIDO R2]** La revisión 1 escribía esta advertencia y a la vez construía
semántica de `work order` en §2. Se contradecía. Con la pregunta A abierta, la
contradicción desaparece: no se afirma ninguna estructura hasta que se responda.

**RQS ya es el hogar del procurement** (glosario: "solicitud operativa dirigida
a un cliente o a otro departamento, ej. una compra", creada por Services,
cumplida por Purchasing). La pregunta correcta al backend no es "denos un
dominio de facturación" sino "¿esto proyecta desde RQS?". Ver handoff §3.

`cliente` se usa en el glosario pero no está definido. "Dealership" es la
palabra del frontend para ese concepto. Se señala en el handoff.

---

## 10. Verificación **[CORREGIDO R2]**

- `npm --prefix FRONTEND run build`
- `npm --prefix FRONTEND run lint`
- `npm --prefix FRONTEND run test:e2e`, con foco en:
  - specs nuevos: `services-quote-invoice.spec.ts`,
    `services-status-stepper.spec.ts`;
  - toda la suite `services-*.spec.ts` de PR1, sin modificar;
  - para el 6a, la suite `automations-*.spec.ts` sin modificar.

**Corrección del alcance real de esa red de regresión.** La revisión 1 dijo "~25
aserciones de ruta en 6 specs". Los números reales, contados:

| Spec | Ocurrencias de `app/automations` |
|---|---|
| `automations-visual-editor.spec.ts` | 9 |
| `automations-draft-designer.spec.ts` | 6 |
| `automations-status-block.spec.ts` | 4 |
| `automations-designer-live.spec.ts` | 1 — **`test.skip` sin `PLAYWRIGHT_LIVE_STACK=1`** |
| `automations-execution-plan.spec.ts` | 0 |

O sea: **20 ocurrencias en 4 specs, de los cuales uno no corre por defecto.** Es
una red útil para el 6a, pero más chica de lo que la revisión 1 declaró, y
declararla de más era precisamente el tipo de afirmación no verificada que este
pipeline existe para atrapar.
