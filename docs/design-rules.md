# Reglas de diseño — SIG-Desk Frontend

Reglas duras y verificables. Cada una se puede chequear leyendo un diff o
corriendo un test; ninguna es una preferencia de gusto.

**Alcance de este documento:** reglas de *aplicación*. El sistema de diseño en
sí (paleta completa, escala tipográfica, inventario de componentes) es
`DESIGN.md`, hoy parcial — solo la sección de Services. El sistema completo del
repo es un TODO propio (P3, `TODOS.md`).

Origen: extraídas del código real de `FRONTEND/src/index.css` y de las
decisiones ya aprobadas en `docs/designs/services-department-frontend.md`
(Design Review Passes 1-7). No son propuestas nuevas: son la codificación de lo
que ya está decidido, para que una feature nueva no vuelva a derivarlo de cero.

---

## R-1 — Los tokens mandan. Ningún color literal en un componente.

Todo color sale de un token de `index.css`. Prohibido en `src/`:

- Hex crudo (`#0e7490`) en un componente.
- `rgb()` / `hsl()` literal en un componente.

Excepción única y ya existente: las utilidades de Tailwind por escala
(`text-red-300`, `bg-emerald-500/10`) que el repo ya usa para tono semántico.
No se agregan colores de marca nuevos por esa vía.

**Verificable:** `grep -rnE "#[0-9a-fA-F]{6}" FRONTEND/src --include=*.tsx`
no devuelve nada nuevo.

## R-2 — Un departamento no introduce un color de marca nuevo.

Un skin de departamento redefine los valores de su propio eje
(`--services-*`), reusando el acento ya establecido de la app. Services hereda
el cian/azul de `Brand` (`AgentLayout.tsx:41`). Un departamento que quiera un
color de marca propio es una decisión de producto, no de implementación.

## R-3 — El skin de departamento es un eje independiente del claro/oscuro.

`[data-department="x"]` y `.dark` son dos selectores que aportan cada uno su
parte del token set. Un skin define **su propio par de variantes** claro y
oscuro, nunca un set plano.

**Corolario no negociable:** `AgentLayout` pinta fondo en ancestros
(`bg-background`, `bg-surface`) que un `data-department` puesto dentro de
`{children}` **no** recolorea por cascada. Cada página scopeada pinta su propio
fondo en su wrapper raíz. "El atributo en un ancestro alcanza" es falso en este
layout y ya costó una corrección.

## R-4 — Cuatro significados de estado, cuatro tonos. No se inventa un quinto.

| Significado | Tono |
|---|---|
| Requiere acción / bloqueado / faltante | `danger` |
| Listo / entregado / confirmado | `success` |
| Esperando / en tránsito / falta info | `warning` |
| Informativo / programado / completado | `info` |

Un estado nuevo se mapea a uno de los cuatro. Si de verdad no entra en ninguno,
eso es una conversación de producto antes que un color nuevo.

**Un símbolo, un significado.** `⚠` ámbar ya significa "el backend no pudo
confirmar la transición". No se reusa para otra falla. Una falla distinta lleva
tratamiento distinto (ver spec de PR2 §5, devolución).

## R-5 — Una pantalla, un botón primario.

La acción siguiente es una sola y es visualmente única. Todo lo demás es
secundario o terciario.

**Un botón primario nunca miente.** Si la acción le corresponde a otro rol o
departamento, va deshabilitado y acompañado de una frase que diga a quién se
espera. Prohibido un primario habilitado que al pulsarlo no hace nada, o que
abre un flujo que el usuario no puede completar.

## R-6 — Los blockers nunca van detrás de un tab.

Si algo impide avanzar, se ve al abrir la pantalla, sin interacción previa. Esta
regla es la que descarta reproducir estructuras de tabs de herramientas legacy
cuando el contenido incluye blockers.

## R-7 — Todo estado no-feliz existe antes de que exista el feliz.

Ninguna pieza que consulte datos se da por terminada sin sus estados de carga,
vacío y error. El estado vacío dice qué pasa y, cuando hay una, ofrece la acción
que lo resuelve. Prohibido:

- Un spinner de pantalla completa donde alcanza un skeleton local.
- Un error de un panel que tumbe la página entera.
- Un conteo en cero que se oculte. Un cero se muestra: es información.

**Los estados de error se ejercitan con centinelas deterministas** en los mocks
(el patrón `ERROR_DEMO_*` de `features/services/mockData.ts`), nunca con
inyección aleatoria de fallos: una corrida de Playwright no puede asertar contra
azar. Un centinela que se vería como una fila normal en una lista se excluye de
esa lista.

## R-8 — El frontend no calcula dinero.

Subtotales, impuestos, descuentos y totales llegan calculados desde el backend
(o del mock que lo representa). La UI los muestra. No los deriva.

Motivo: las reglas de redondeo e impuestos son del dominio. Un frontend que
recalcula termina mostrando un número distinto al de la factura de registro, y
gana el que está mal.

**Formato:** `Intl.NumberFormat` con moneda explícita. Prohibido concatenar
`'$' + número` o usar `toFixed(2)` para presentar importes.

## R-9 — Ninguna ruta se escribe a mano dentro de un componente reusable.

Un componente que puede montarse en más de un árbol de rutas recibe su
`basePath` por prop o contexto, con un default que preserva el comportamiento
actual. Ya hay deuda de esto (6 call sites `/app/automations` en
`WorkflowBuilder.tsx`, `WorkflowCanvasEditor.tsx` y `AutomationsList.tsx`).

Navegación global desde el shell (sidebar, dashboard) sí es absoluta: es global
a propósito.

**Verificable:** una ruta absoluta nueva dentro de `src/features/*` que no sea
navegación de shell es un hallazgo de review.

## R-10 — El filtrado en el cliente nunca es autorización.

Filtrar una lista por departamento, propietario o alcance es presentación. La
autorización la hace el Gateway. Todo filtro de ese tipo lleva un comentario en
el código diciendo exactamente eso, y una entrada en el handoff pidiendo el
enforcement real.

## R-11 — La puerta de permisos combina departamento y capacidad.

Una superficie dentro de un área de departamento que además ofrece una capacidad
transversal exige **ambos** permisos, componiendo `ProtectedRoute`. Nunca se
hereda el permiso del área para conceder una capacidad que el área no otorga.

**Prohibido bajo cualquier justificación**, incluida "temporal para probar":
tocar `AuthProvider.tsx` para saltear una verificación, o inventar un permiso
que SIGTools no otorga. Un permiso que falta es una solicitud al backend.

## R-12 — Vocabulario del glosario, o marca explícita de que no lo es.

Un término que no está en `SIG-Desk-Backend/Docs/glossary.md` no se usa como si
fuera dominio. Si hace falta antes de que exista, va como tipo local con un
comentario "forma propuesta, pendiente de ADR" y una solicitud de entrada de
glosario en el handoff. El precedente aprobado es `Subcontractor` /
`DealershipPOC` de PR1.

Cuidado con sinónimos: "asignación de ticket" y "asignación de IT" son procesos
distintos. INC / PRB / RFC son dominios separados, no estados de ticket.

## R-13 — Accesibilidad: cuatro chequeos, ninguno opcional.

1. Target táctil mínimo 44px en cualquier cosa clickeable (el estándar que
   `AgentLayout` ya aplica).
2. Todo lo que se puede clickear se puede enfocar y activar con `Enter`/`Space`.
3. Contraste 4.5:1 sobre su fondo, en **los dos temas**. El ámbar es el tono con
   más riesgo: se verifica explícitamente.
4. Una secuencia de progreso es una lista ordenada con `aria-current="step"` en
   la etapa actual, no un adorno de divs.

## R-14 — Responsive: se reusa el patrón del shell, no se inventa uno.

Bajo el breakpoint `lg`, la navegación es la que `AgentLayout` ya provee (bottom
nav + drawer). Una fila de tiles colapsa a scroll horizontal con indicador.
Contenido ancho (tablas, diagramas, bloques de código) scrollea dentro de su
propio contenedor: **el body nunca scrollea en horizontal**.

## R-15 — Densidad: una tabla de datos es una tabla.

Un conjunto de filas homogéneas con columnas numéricas se renderiza como tabla,
no como una grilla de tarjetas. Las tarjetas se reservan para objetos
heterogéneos o accionables individualmente.

Contrapartida ya decidida y deliberada: las 4 tarjetas KPI del dashboard de
Services **se quedan como tarjetas**. Son accionables (filtran la lista), lo que
las saca de la categoría de mosaico decorativo. Documentado para que nadie las
"limpie" a una tabla creyendo que son slop genérico.

## R-16 — Espaciado y radios: se usa la escala, no valores sueltos.

Espaciado por la escala de Tailwind (múltiplos de 0.25rem). Padding de página
`p-6 lg:p-8`; separación entre secciones de una página `space-y-6`; separación
dentro de una card `gap-3`/`gap-4`. Radios por los tokens `--radius-*`
(`--radius: 1rem`). Prohibido un valor arbitrario (`p-[13px]`,
`rounded-[7px]`) sin un motivo escrito al lado.

## R-17 — Tipografía: Inter y Rubik, y nada más.

Ya están definidas en `index.css`. Una feature nueva no agrega una fuente.
Jerarquía por peso y tamaño dentro de la familia existente.

---

## Cómo se usa este documento

En review de un PR de frontend, cada regla es una pregunta con respuesta sí/no.
Una regla que se rompe a propósito se anota en el PR con el motivo. Una regla
que se rompe tres veces por el mismo motivo es una regla mal escrita: se cambia
acá, no se ignora en silencio.
