# Auditoría de integración frontend/backend — 29 de agosto de 2026

## Resultado ejecutivo

`main` fue actualizado por fast-forward hasta `db3daa6`, el mismo commit que
`origin/main` y `origin/Hector` al momento de la revisión. El repositorio
remoto contiene únicamente `FRONTEND/`; no contiene el código, migraciones,
OpenAPI, Compose ni tests de los servicios backend mencionados por los commits.

Por tanto, esta revisión valida la **adaptación del frontend a los contratos**
del equipo, pero no puede certificar implementación, seguridad, persistencia ni
despliegue de `organization_service`, `tickets_service`, `resource_service` o
Kong. El equipo backend debe compartir la URL/repositorio exacto y un entorno
reproducible para cerrar esa segunda mitad.

## Cambios del equipo que sí llegaron

| Commit | Alcance observado |
|---|---|
| `6cb3dff` | Sesión SIG-DESK, JWT, RBAC y pantalla Users & Roles |
| `2367e44` | `BindingPicker` para recursos y agentes IT |
| `11b24b9` | Lista/detalle de Tickets adaptados a `/entities/INC` |
| `197bdf3` | Documentación/ADR de handoff y artefactos auxiliares |
| `db3daa6` | Merge publicado en `main` |

## Integraciones comprobadas en el código

- SIGTools autentica y `POST /v1/session` obtiene el JWT propio de SIG-DESK.
- RBAC consume roles, usuarios y catálogo de permisos con el shape real en
  español/snake_case, encapsulado por `rbac.service.ts`.
- Los permisos `entidad:acción:alcance` gobiernan rutas y acciones; las claves
  punteadas antiguas se traducen temporalmente para no romper módulos previos.
- Users & Roles diferencia lectura de mutación: leer no habilita crear,
  eliminar, modificar grants ni asignar roles.
- El pool de Tickets consulta `/entities/INC`; el intake crea sobre el runtime
  y vuelve a consultar usando el `id` interno, no el `humanId` de presentación.
- Los bindings de recursos/agentes están disponibles en formularios staff.

## Brechas backend que bloquean funcionalidad completa

1. **Código backend ausente.** No se puede ejecutar migraciones, pruebas de
   dominio, autorización real, contratos ni health checks desde este repo.
2. **Intercambio de sesión.** `/v1/session` debe validar criptográficamente el
   bearer SIGTools y derivar la identidad del token. Aceptar solo el email del
   cuerpo permitiría suplantación. El frontend ya reenvía ese bearer cuando
   existe.
3. **Tickets incompletos.** El cliente recibido declara todavía inexistentes
   los endpoints de estado, asignación, merge/unmerge, comentarios, adjuntos,
   watchers y actividad. La UI existe, pero esas acciones no están integradas.
4. **Filtros y paginación.** La UI filtra una página descargada para varios
   criterios. La API debe filtrar antes de paginar y devolver cursor/conteos
   consistentes para listas y kanban.
5. **Solo INC confirmado.** PRB y RFC están preparados en frontend, pero los
   comentarios del adaptador recibido indican que el runtime actual solo
   soporta `INC`; PRB/RFC responderían 501.
6. **Aprovisionamiento.** `/admin/users` distingue identidad conocida de
   usuario operativo, pero falta un flujo backend acordado para crear la cuenta
   local/empresa antes de asignar rol.
7. **Contrato ejecutable.** Falta OpenAPI 3.1 publicado y versionado para
   generar cliente y contract tests; hoy la fuente de verdad sigue repartida
   entre TypeScript, comentarios y ADR externas.
8. **Catalog/SLA/relaciones.** Sus clientes existen, pero sin los servicios no
   se verificaron publicación inmutable, manifiestos históricos, cálculo SLA,
   relaciones ni enforcement de definiciones.

## Correcciones aplicadas durante esta auditoría

- Se alinearon guards antiguos con permisos `entidad:acción:alcance` y `*`.
- Se protegieron por capacidad las mutaciones de Users & Roles.
- Se reenvía el bearer SIGTools en el intercambio de sesión.
- Se corrigió la consulta posterior a crear un ticket para usar el ID interno.
- Se normalizaron las bases/rutas E2E hacia Kong (`:8000`, rutas bare) y se
  agregó el mock de `POST /v1/session`.
- Se restauró React Router `7.18.0` y se regeneró el lockfile.
- Se retiraron `desktop.ini` y el lockfile vacío accidental de la raíz, y se
  ignora `desktop.ini` en adelante.

## Verificación realizada

| Comprobación | Resultado |
|---|---|
| `npm run lint` | Pasa |
| `npm run build` | Pasa |
| TypeScript | Pasa como parte del build |
| Bundle | Construye; deuda: chunk principal ~921 kB minificado |
| E2E integrado | No certificable sin servicios backend; el runner local además no pudo mantener un navegador/servidor disponible en esta sesión |
| Dependencias | Se identificó `nanoid <3.3.18` vía PostCSS; el lockfile se actualizó a la versión parcheada compatible y npm reporta 0 vulnerabilidades |

## Gate para declarar la vertical funcional

El siguiente paso debe hacerse con el repositorio backend disponible:

1. Levantar Kong y los servicios con datos semilla versionados.
2. Publicar OpenAPI y validar los DTO contra los adaptadores TypeScript.
3. Ejecutar sesión real SIGTools → SIG-DESK y probar 401/403/scope por recurso.
4. Completar un recorrido real: publicar INC, crear ticket, listar, abrir,
   transicionar, asignar, comentar, adjuntar, merge/unmerge y consultar
   actividad/SLA.
5. Ejecutar `npm run test:e2e` en CI y bloquear merges si falla.
6. Repetir la vertical para PRB y RFC manteniendo modelos y responsabilidades
   separados.
