# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/).

## [Unreleased]

### Added

- CI en GitHub Actions (`.github/workflows/ci.yml`): verificación de consistencia
  de versión, build/vet/test del backend y typecheck/lint/build del frontend en
  cada push y pull request.
- `VERSION` como fuente única de verdad de la versión del producto.
- `.gitattributes` para normalizar finales de línea entre Windows y CI
  (`ubuntu-latest`), prerrequisito para cualquier verificación de contenido
  determinista (checksums de migraciones, etc.).

## [0.1.0-beta] - En progreso

Primera fase de estabilización técnica de SIG-DESK: CI, migraciones seguras,
entorno reproducible y versionado explícito del layout de Detalle. Ver el plan
de estabilización para el detalle completo de cada incremento.
