# ADR-0007: Catalog Builder como plano de control y runtime dirigido por metadatos

- Estado: aceptado
- Fecha: 2026-07-28

## Contexto

IAM, SLA, Automatizaciones, Integraciones, Notificaciones y Reportes son
propietarios de recursos reutilizables. Las entidades de negocio (INC, RFC,
PRB y futuras) necesitan combinarlos sin copiar su configuración ni introducir
reglas específicas en cada módulo.

## Decisión

Se separan explícitamente dos responsabilidades:

1. **Catalog Builder (plano de control):** autoriza la edición, compone,
   valida y publica definiciones.
2. **Metadata Runtime (plano de ejecución):** interpreta un manifiesto
   publicado, valida datos y transiciones y delega capacidades a los módulos
   propietarios mediante `ModuleGateway`.

Los borradores usan `ResourceBinding`. Durante la publicación, el módulo
propietario resuelve cada binding a un `ResourceReference` que fija:

- `module`
- `resourceType`
- `resourceId`
- `resourceVersion`
- `contractVersion`

La publicación genera un `ExecutableDefinitionManifest` inmutable y un
checksum SHA-256. El checksum no depende de la fecha de compilación. Cada
registro conserva `definitionVersionId`, `definitionVersion`,
`schemaVersion` y `manifestChecksum`.

Las transiciones de registros se resuelven exclusivamente desde el lifecycle
del manifiesto usado al crear el registro. Una actualización concurrente del
estado se rechaza mediante control optimista.

## Límites de propiedad

- Catalog no almacena secretos ni la configuración interna de recursos.
- Catalog no calcula SLA ni ejecuta automatizaciones.
- Los módulos especializados registran y resuelven únicamente sus recursos.
- El runtime coordina la invocación a través del contrato; no conoce detalles
  internos del módulo.
- Las versiones publicadas no se editan. Una evolución crea un nuevo borrador
  y una nueva versión.

## Consecuencias

- Las referencias flotantes se resuelven y bloquean antes de publicar.
- Un recurso inexistente o un contrato incompatible bloquea la publicación.
- Los registros históricos siguen siendo reproducibles aunque exista una
  versión más reciente de la entidad.
- La implementación actual usa un registro en proceso porque SIG-DESK es un
  monolito modular. El puerto permite reemplazarlo por HTTP o mensajería sin
  cambiar el dominio del catálogo.

## Trabajo posterior

Los módulos reales deberán sustituir los handlers de desarrollo del registro,
incorporar autorización del actor y usar outbox transaccional para señales
asíncronas posteriores a la persistencia.

