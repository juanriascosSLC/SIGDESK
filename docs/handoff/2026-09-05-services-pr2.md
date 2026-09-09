# Handoff a backend — Services PR2 (cotización/invoice, embed de workflows, stepper)

Fecha: 2026-09-05
Origen: `docs/specs/2026-09-05-services-pr2-invoice-workflow-stepper.md`
Design doc: `docs/designs/services-department-frontend.md` (APPROVED)

**Extiende** `FRONTEND/FRONTEND-HANDOFF.md`, que sigue siendo la guía de
arquitectura e integración vigente. Este documento no la reemplaza: agrega lo
que Services PR2 necesita y que esa guía todavía no cubre. Cuando algo de acá se
acepte, su lugar definitivo es §8 de ese documento ("Contratos HTTP que ya
consume la UI").

**Todo lo de acá es solicitud, no contrato acordado.** Nada está implementado en
el frontend contra backend real: PR1 y PR2 son mock-only por decisión explícita.

---

## 0. Cómo leer este documento

Tres categorías, y la diferencia importa:

| Marca | Significado |
|---|---|
| **[PREGUNTA]** | Una decisión de dominio que el frontend no puede tomar. Necesitamos la respuesta antes de diseñar el contrato, no después |
| **[SOLICITUD]** | Algo concreto que pedimos, con forma propuesta |
| **[REQUIERE ADR]** | No se puede implementar sin una decisión arquitectónica nueva. No la escribimos nosotros |

Todo ruteo es contra el **API Gateway** (`/v1/<dominio>/...`), nunca contra un
microservicio directo ni contra Kafka (ADR-0006). Las rutas propuestas acá
respetan eso.

---

## 1. Lo primero: no pedimos un dominio de facturación

Leímos `SIG-Desk-Backend/Docs/glossary.md` completo antes de escribir esto.
Ninguno de los términos que la UI de PR2 necesita existe en el glosario:

`work order` · `cotización` / `quote` · `invoice` / `factura` ·
`purchase order` · `vendor` / `proveedor` · `subcontractor` ·
`point of contact` · `SRV`

Cero ocurrencias de cada uno. Y el glosario tiene una regla dura: *"Si un
término no está acá, no se usa hasta definirlo."*

Pero **RQS ya es el hogar del procurement**, y eso cambia la pregunta. El
glosario define RQS como:

> "una solicitud operativa dirigida a un cliente o a otro departamento de la
> compañía (ej. una compra) — corresponde al proceso ITSM de *Request
> Fulfillment*"

...creada por Services, y la tabla de departamentos dice que Purchasing "no crea
entidades; ejecuta el cumplimiento (ej. la compra) de los RQS que recibe".

Entonces:

### [PREGUNTA 1] ¿El resumen de cotización/invoice proyecta desde RQS?

Tres lecturas posibles, y no queremos elegir por ustedes:

- **(a)** La cotización a un subcontractor **es** un RQS creado por Services.
  El resumen que la UI muestra es una proyección de ese RQS. No hace falta
  entidad comercial nueva.
- **(b)** Es un concepto nuevo del dominio de Services, adyacente a RQS.
- **(c)** Vive fuera de SIG-Desk (queda en un sistema contable) y SIG-Desk solo
  guarda una referencia y un estado.

La respuesta cambia el contrato entero de §3. Si es (a), casi todo lo que sigue
se reduce a campos sobre un endpoint de RQS que ya está definido — aunque el
propio glosario aclara que "RQS y otros tipos custom todavía no tienen dominio
ejecutable".

### [PREGUNTA 2] `cliente` está usado pero no definido

El glosario usa `cliente` dentro de la definición de RQS ("dirigida a un
cliente") y en la tabla de departamentos, pero **no tiene entrada propia**. Por
su propia regla de mantenimiento, está en falta.

En el frontend, el concepto se llama **Dealership**. Antes de que fijemos ese
nombre en una URL o un contrato, necesitamos saber si `cliente` va a ser el
término de dominio, y si un dealership es un caso de `cliente` o algo distinto.

### [SOLICITUD 1] Entradas de glosario

Para cada término que sobreviva a las preguntas 1 y 2, pedimos su entrada en
`glossary.md` en la misma sesión en que se defina, como manda la regla de
mantenimiento. El frontend hoy usa nombres locales marcados "forma propuesta,
pendiente de ADR" (§6) precisamente para no fijar vocabulario que no nos
corresponde.

---

## 2. `SRV` como `entity_key`

### [REQUIERE ADR] `entity_key SRV`

Ya está documentado como dependencia en el design doc, y su sección
`The Assignment` lo llama "el único bloqueador real entre 'Services tiene
placeholders bonitos' y 'Services tiene un dominio ejecutable'". Lo repetimos
acá porque PR2 lo vuelve más urgente, no menos: el filtrado de workflows por
Services (§4) depende de que `SRV` exista como `entity_key`.

El ADR tiene que resolver explícitamente, además de lo ya listado en el design
doc:

- La relación con el invariante ya vigente de que **todo ticket referencia un
  `Recurso` obligatoriamente** (`tickets_service`, `ErrRecursoIDVacio`). El
  checklist de equipamiento de un SRV se superpone conceptualmente con `Recurso`
  (glosario: "Activo físico... hardware... infraestructura de red"). Si SRV
  define un modelo propio de equipamiento, ¿cómo satisface ese invariante?
- **[PREGUNTA 3]** ¿Un SRV genera RQS hacia Purchasing para el procurement del
  equipamiento? Si sí, esa es probablemente también la respuesta a la pregunta 1.

Nota de forma que sale de la evidencia de demanda: la captura de la herramienta
que hoy se usa muestra **una fila por ticket** bajo un mismo work order. Nuestra
lectura es que **un SRV es la visita, y sus line items son los tickets INC/PRB
que se resuelven en ella** — coherente con la definición de SRV del design doc
("una visita/despacho en curso"). Si el ADR toma otro camino, avísennos: cambia
la forma de la pantalla, no solo un campo.

---

## 3. Contratos para el resumen de cotización/invoice (paso 5)

Sujeto por completo a la pregunta 1. Lo proponemos con forma concreta para que
sea discutible, no porque asumamos que va así.

### [SOLICITUD 2] Lectura del resumen de una visita

```
GET /v1/services/srv/{srvId}/quote
```

Respuesta propuesta:

```jsonc
{
  "currency": "USD",
  "invoice_status": "pendiente",       // pendiente|recibido|verificado|enviado_a_accounting
  "subcontractor_id": "...",           // referencia, no objeto embebido
  "line_items": [
    {
      "ticket_id": "...",              // id interno
      "ticket_numero_visible": "INC-1042",
      "descripcion": "...",
      "travel_rate": "125.00",
      "price": "480.00",
      "tax_rate_pct": "8.5",
      "additional_hour_rate": "95.00",
      "hour_quantity": "2.5"
    }
  ],
  "totals": {
    "sub_total": "...",
    "discount": "...",
    "total_net": "...",
    "shipping_cost": "...",
    "sales_tax": "...",
    "total": "..."
  }
}
```

Tres cosas que pedimos explícitamente:

1. **Los totales vienen calculados del backend.** El frontend no deriva ninguno.
   Las reglas de redondeo e impuestos son del dominio; si las recalculamos,
   terminamos mostrando un número distinto al de la factura de registro
   (`docs/design-rules.md` §R-8). No nos manden solo line items.
2. **Importes como string decimal, no float.** Un `number` de JSON es un double
   y pierde centavos. Es la razón por la que están entrecomillados arriba.
3. **`ticket_numero_visible`** siguiendo la convención ya definida en el
   glosario (`entity_key` + "-" + `numero_secuencial`). El id interno viene
   aparte, para navegar sin exponer el visible como clave.

### [PREGUNTA 4] ¿Los cuatro estados de invoice son los correctos?

La UI muestra `pendiente` → `recibido` → `verificado` → `enviado a Accounting`.
Salen del design doc, que los tomó del flujo que describió el usuario. ¿Es esa
la máquina de estados real? ¿Puede volver hacia atrás? ¿Hay un estado terminal
de "pagado" que la UI debería mostrar?

### Lo que NO pedimos

- **Dirección de facturación de la organización.** SIG-Desk es de una sola
  organización (no multi-tenant): es una constante, no dato por ticket. Si
  alguna vez hace falta, es configuración de nivel organización, no un campo de
  esta respuesta.
- **Fax del subcontractor.** Ruido de la herramienta legacy.
- **Un endpoint de creación/edición de cotización.** PR2 es de lectura. Cuando
  haga falta autoría, es su propia conversación.

---

## 4. Lo que bloquea el embed de workflows (paso 6)

### [REQUIERE ADR] `departamento` / `origen` como condición de workflow — `WF-TODO-001` / `WF-TODO-006`

Este es el bloqueador estructural, y es peor de lo que el design doc suponía.

No es solo que `WorkflowDefinition` no tenga campo de departamento. El propio
glosario documenta que la entidad sobre la que los workflows actúan **tampoco lo
tiene**:

> **Departamento (de un Ticket)** — ⚠️ *Pendiente de ADR*: hoy `domain.Ticket`
> no modela este campo — ver `Docs/domains/workflows/GOALS.md` §3 (N1) y
> `Docs/domains/workflows/TODOS.md` → `WF-TODO-001`.

Consecuencia concreta: **no existe hoy ninguna forma correcta de scopear
workflows por departamento**, ni en la definición ni en la ejecución. Una UI de
Services que muestre "los workflows de Services" está mostrando una ficción
hasta que ese ADR se acepte.

El caso de uso de Services es la justificación de negocio para priorizarlo. Es
literalmente para lo que el design doc dice que sirve el paso 6.

### [SOLICITUD 3] Scoping del lado del servidor, cuando ese ADR exista

```
GET /v1/workflows?departamento={departamentoId}
```

Con enforcement en el Gateway, no solo filtro. Mientras tanto, si PR2 avanza,
el frontend filtra por `categoria_id` en el cliente y **lo marca en el código
como presentacional, no autorización** (`docs/design-rules.md` §R-10). No lo
tomen como que el problema está resuelto: no lo está.

### [SOLICITUD 4] Un permiso propio para automatizaciones por departamento

Hallazgo de esta revisión, verificado en código:

- `/app/services/*` se gatea con `sigdesk.changes.view` (`changes:read`).
- La superficie de autoría de workflows exige `sigdesk.automations.manage`
  (`workflows:update`).
- La identidad supervisor que usa toda nuestra suite e2e tiene
  `workflows:read:global` pero **no** `workflows:update`.

Con los permisos que existen hoy, la única forma correcta de gatear un embed de
autoría dentro de un área de departamento es exigir los dos permisos a la vez.
Lo vamos a hacer así (composición de `ProtectedRoute`, cero código nuevo en
`AuthProvider.tsx`).

Lo que pedimos a futuro: si el modelo va a soportar "puede autorear
automatizaciones **de su departamento**", eso es un permiso que hoy no existe.
Hoy `workflows:update` es global o nada.

### [SOLICITUD 5] `sigdesk.services.view`

Ya está documentado en el design doc, se repite por completitud: el día que
exista en SIGTools, el gating de `/app/services/*` pasa de `changesView` al
permiso propio. Es un cambio de una línea en `permissions.ts`.

---

## 5. Eventos de dominio

**Ninguno se solicita todavía.** Lo decimos explícitamente para que no se lea un
pedido implícito entre líneas.

La UI de PR2 es de lectura y no observa ningún evento. Si en algún momento la
card de cotización tiene que reaccionar en vivo a un cambio de estado de invoice,
eso sería un evento de dominio nuevo, y entonces:

- **[REQUIERE ADR]** — todo evento nuevo se registra en `domain-events.yaml` +
  `asyncapi.yaml`, con **`audit_service` siempre como consumidor**
  (`Docs/howto/add-domain-event.md`).
- El frontend igual no lo consumiría directo: llegaría por el Gateway, nunca por
  Kafka.

No lo pedimos ahora porque no lo necesitamos ahora.

---

## 6. Qué está mockeado hoy en el frontend

Para que nadie lea la UI de Services como evidencia de que algo existe.

| Pieza | Estado | Dónde |
|---|---|---|
| `Dealership` | Mock tipado | `features/services/types.ts` |
| `RecurringProblem` | Mock tipado. **La regla de negocio no está definida**: qué cuenta como "recurrente" (ventana temporal, umbral, deduplicación) no lo decidió nadie todavía. Hoy agrupa por `dealershipId` | idem |
| `SrvTicket` | Mock tipado. `SRV` no es un `entity_key` real | idem |
| `EquipmentChecklistItem` | Mock tipado. Se superpone con `Recurso` (ver §2) | idem |
| `Subcontractor` | Mock tipado, marcado "pendiente de ADR" | idem |
| `DealershipPOC` | Mock tipado, marcado "pendiente de ADR" | idem |
| `assignedScope` (`mine`/`team`/`unassigned`) | **Placeholder puro.** SRV no tiene modelo de asignación. No es filtrado por identidad real | idem |
| `QuoteSummary` / `InvoiceStatus` (PR2) | Propuesto, mock tipado | `features/services/types.ts` (PR2) |
| Stepper de 6 etapas (PR2) | Proyección de solo lectura sobre mock. **No es una máquina de estados real** | idem |
| Embed de workflows (PR2) | Adapter mock sobre `features/automations/api.ts` | idem |

Todo corre sobre `lib/mockQuery.ts`, que simula latencia y rechazo. Los fallos
son centinelas deterministas, no azar.

### [PREGUNTA 5] ¿Qué es un "problema recurrente"?

Ventana temporal, umbral de ocurrencias, deduplicación. Ninguno está definido.
No bloquea el mock, pero bloquea el día que deje de serlo. Es lógica de negocio,
no un detalle de UI.

### [PREGUNTA 6] Dos fuentes de estado

La UI de un SRV tendrá dos ejes de estado a la vez: la pill de estado del ticket
(7 valores) y el stepper de 6 etapas. Para PR2, mock-only, decidimos que la
etapa manda el copy del botón de acción y la pill manda el tono de urgencia.

Cuál de las dos es **autoritativa** con wiring real, y si el stepper es una
proyección derivada del workflow o una máquina de estados propia, es trabajo del
ADR de `SRV`. No lo resolvimos y no deberíamos.

---

## 7. Resumen de lo que necesitamos, en orden

1. **Respuesta a la pregunta 1** (¿RQS o entidad nueva?). Bloquea el diseño del
   contrato de §3.
2. **ADR de `entity_key SRV`**. Bloquea todo lo demás de Services.
3. **ADR de `WF-TODO-001`/`WF-TODO-006`**. Bloquea el scoping honesto del paso 6.
4. Entradas de glosario para los términos que sobrevivan (§1).
5. Definición de "problema recurrente" (§6). No urgente, pero no se olvida.

Nada de esto pide código nuevo antes que decisiones. Si la respuesta a la
pregunta 1 es "todavía no sabemos", eso también es una respuesta útil: significa
que el paso 5 se queda como placeholder mock más tiempo, y lo planificamos así.
