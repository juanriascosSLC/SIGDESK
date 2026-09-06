# DESIGN.md — Sistema de diseño de SIG-Desk Frontend

> **Estado: parcial, a propósito.** Hoy este documento cubre **solo el
> departamento Services**. El sistema de diseño de todo el frontend (paleta
> base completa, escala tipográfica, inventario de componentes de
> `components/ui/`) es un trabajo aparte con su propia sesión de consultoría —
> ver `TODOS.md`, ítem "DESIGN.md formal para SIG-Desk-Frontend" (P3).
>
> Escribir esa parte como efecto secundario de un PR de feature es exactamente
> el scope creep que ese TODO existe para evitar. Cuando esa sesión ocurra, esta
> sección de Services pasa a ser un capítulo de un documento más grande, no se
> reemplaza.

Las reglas de *aplicación* (qué está permitido y qué no) viven en
`docs/design-rules.md`. Este documento describe **qué existe**; ese otro
describe **cómo se usa**.

---

## Departamento Services

### Por qué existe un skin de departamento

SIG-Desk trataba a todos los departamentos igual. Services es el primero con
necesidades reales de personalización, y el caso de prueba para construir el
mecanismo antes de que un segundo departamento lo necesite. El mecanismo es
genérico desde el día uno: nada de lo que sigue es específico de Services salvo
los valores.

### Mecanismo: `data-department`

Un atributo `data-department="services"` en el wrapper raíz de cada página del
área activa un set paralelo de variables CSS. Es un **eje independiente** del
toggle claro/oscuro global de `themeStore.ts`: los dos componen, ninguno
reemplaza al otro.

La primitiva es `components/layout/DepartmentScope.tsx`. No sabe nada de
Services: recibe la clave del departamento y la estampa. El próximo departamento
la reusa sin tocarla.

**Restricción real, no teórica:** `AgentLayout` pinta fondo propio en dos
niveles de ancestro (`bg-background` en el shell externo, `bg-surface` en el
contenedor directo de `{children}`). Un `data-department` montado dentro de
`{children}` **no** recolorea esos fondos por cascada. Por eso cada página de
Services aplica su propia clase de fondo (`bg-services-background`) en su
wrapper. El scoping es "cada página se pinta a sí misma", no "un atributo en un
ancestro alcanza".

Los `Dialog`/`Drawer` se montan por portal en `document.body`, fuera del árbol
DOM del área. Un modal abierto desde Services **no hereda el skin**. Hoy quedan
neutrales a propósito: es alcance, no bug.

### Tokens

Definidos en `FRONTEND/src/index.css`. `[data-department="services"]` lleva los
valores claros; `.dark [data-department="services"]` los oscuros.

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--services-background` | `#eef7fb` | `#061019` | Fondo de página |
| `--services-surface` | `#ffffff` | `#0b1a22` | Superficie de card |
| `--services-surface-container` | `#e0f2fa` | `#0f232c` | Contenedor dentro de una card (ítem de lista) |
| `--services-surface-container-low` | `#f2fafd` | `#0d1c24` | Contenedor de menor énfasis |
| `--services-on-surface` | `#0f172a` | `#e1e2eb` | Texto principal |
| `--services-on-surface-variant` | `#475569` | `#9fb4bc` | Texto secundario, labels |
| `--services-border` | `rgba(14,116,144,.16)` | `rgba(6,182,212,.18)` | Bordes |
| `--services-accent` | `#0e7490` | `#06b6d4` | Enlaces, énfasis |
| `--services-accent-foreground` | `#ffffff` | `#020617` | Texto sobre el acento |

Se consumen como utilidades de Tailwind: `bg-services-surface`,
`text-services-on-surface-variant`, `border-services-border`.

**El acento no es un color de marca nuevo.** Es el mismo cian/azul que `Brand`
(`AgentLayout.tsx:41`, `from-cyan-500 to-blue-500`) ya usa. El departamento
hereda el acento de la app y lo aplica a sus componentes.

### Tipografía

Inter y Rubik, ya definidas en `index.css`. Services **no** agrega una fuente.

### Tonos de estado

Services no define colores de estado propios. Reusa los cuatro significados de
`components/ui/Badge` (`danger` / `success` / `warning` / `info`), que son los
mismos que severidad de SLA ya usa. Los mapeos concretos viven en
`features/services/presentation.ts`, en un solo lugar:

- `SRV_STATUS_TONES` — los 7 estados de pill de ticket SRV.
- `EQUIPMENT_ITEM_TONES` — `confirmed` / `missing` / `in_transit`.
- `PROBLEM_SEVERITY_TONES` — severidad de problema recurrente.

Regla: un estado nuevo se mapea a uno de los cuatro tonos. No se inventa un
quinto (`docs/design-rules.md` §R-4).

### Componentes del área

Todos en `FRONTEND/src/features/services/`. Ninguno reimplementa una primitiva:
se construyen sobre `components/ui/` (`Card`, `Badge`, `StatusBadge`, `Button`,
`PageHeader`, `states.tsx`).

| Componente | Qué es |
|---|---|
| `ServicesDashboard` | 4 tarjetas KPI accionables (filtran la lista al click) + tabs My Work/Team/All + lista de tickets |
| `DealershipView` | Vista de un dealership, contenedor del panel de problemas recurrentes |
| `RecurringProblemsPanel` | Otros problemas abiertos del mismo sitio. La pantalla que no existía en ningún módulo |
| `SrvDetail` | Detalle de un ticket SRV: Next Action, blockers, POC, checklist de equipamiento, subcontractor |
| `SubcontractorPicker` | Selección de subcontractor filtrada por región |
| `POCCard` | Contacto receptor del dealership |

### Jerarquía de información en `SrvDetail`

Orden de prominencia, decidido en `/plan-design-review` y no reordenable sin
volver a esa revisión:

1. Progress stepper
2. Next Action (el único botón primario de la pantalla)
3. Blockers (nunca detrás de un tab)
4. People (Primary Owner, Service Coordinator, POC)
5. Affected Equipment

### Las 4 tarjetas KPI son intencionales

Se mantienen como tarjetas y no se "limpian" a una tabla. Son accionables:
filtran la lista al click, no decoran. Vienen del mockup de referencia real.
Documentado para que una pasada futura de limpieza no las confunda con mosaico
genérico.

### Datos

Todo el área es mock-only. Los datos salen de `features/services/api.ts` sobre
`lib/mockQuery.ts`, una utilidad compartida (no específica de Services) que
simula latencia y rechazo para que los caminos de carga y error sean
ejercitables desde Playwright. Los fallos son **centinelas deterministas**
(`ERROR_DEMO_*` en `mockData.ts`), no azar.

Los tipos de `types.ts` que no corresponden a una entidad de dominio existente
llevan comentario de "forma propuesta, pendiente de ADR" — `Subcontractor` y
`DealershipPOC` son el precedente. Ninguno de esos términos está en el glosario
del backend todavía.

### Permisos

`/app/services/*` se gatea con `sigdesk.changes.view`
(`PERMISSIONS.changesView`) — Services ya administra Change Management — hasta
que `sigdesk.services.view` exista de verdad en SIGTools. Ese día es un cambio
de una línea en `permissions.ts`, sin tocar `AuthProvider.tsx`.

**No hay bypass de rol.** Toda capacidad es un permission string explícito. Una
superficie dentro del área que además ofrece una capacidad transversal exige
ambos permisos, componiendo `ProtectedRoute` (`docs/design-rules.md` §R-11).

### Responsive y accesibilidad

Reusa el patrón del shell: bottom nav + drawer bajo `lg`. Las 4 tarjetas KPI
colapsan a scroll horizontal. Targets táctiles de 44px mínimo. Tarjetas KPI y
filas de ticket enfocables y activables con `Enter`/`Space`. Contraste 4.5:1 en
los dos temas, con verificación explícita del ámbar.

---

## Pendiente

- Sistema de diseño del resto del frontend (TODO P3).
- Theming del shell completo (sidebar + header) si el producto lo pide
  (TODO P4). Hoy el skin cubre solo el área de contenido, decisión 1A de
  `/plan-eng-review`, para no tocar código compartido por todos los
  departamentos.
- Skin de los `Dialog`/`Drawer` abiertos desde un área con departamento.
