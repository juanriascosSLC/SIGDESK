# ADR-0009: partición interna de repositorios PostgreSQL

## Estado

Aceptada como refactor preventivo. No cambia contratos ni comportamiento.

## Contexto

Los adaptadores PostgreSQL de Catalog y Tickets han crecido hasta 825 y 671
líneas. Todavía mantienen una responsabilidad coherente por módulo, pero ya
mezclan varias familias de consultas y transacciones en un solo archivo. Seguir
agregando capacidades así aumentaría el riesgo de conflictos y dificultaría
revisar límites transaccionales.

## Decisión

Mantener un único `Repository` por módulo y dividir su implementación en
archivos del mismo paquete. No se crearán repositorios artificiales por tabla ni
se romperán transacciones que abarcan varias operaciones.

Catalog se separará en:

- `repository.go`: tipo `Repository`, constructor y utilidades comunes.
- `definitions_repository.go`: borradores, publicación y consulta de definiciones.
- `entities_repository.go`: creación, idempotencia, actualización y transición.
- `relations_repository.go`: relaciones tipadas entre entidades.
- `outbox_repository.go`: claim, estado, publicación y reintentos del outbox.

Tickets se separará en:

- `repository.go`: tipo `Repository`, constructor y scanners comunes.
- `tickets_repository.go`: listado, consulta, estado y asignación.
- `merge_repository.go`: merge y unmerge transaccional.
- `collaboration_repository.go`: comentarios, adjuntos y watchers.
- `activity_repository.go`: actividad y auditoría.
- `catalog_projection_repository.go`: proyecciones idempotentes del outbox.

## Restricciones

- Las interfaces de puertos no cambian.
- Cada operación conserva exactamente su límite transaccional actual.
- Las consultas SQL solo se mueven; no se reescriben durante la partición.
- El refactor se hará módulo por módulo y debe pasar las pruebas existentes
  antes de continuar con el siguiente.

## Consecuencias

La navegación y revisión de consultas mejora sin introducir una abstracción
adicional. El tamaño total del código no disminuye, pero cada archivo representa
una responsabilidad operativa identificable y reduce conflictos entre cambios
paralelos.
