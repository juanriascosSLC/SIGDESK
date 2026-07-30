# ADR-0007: Autenticación delegada a SIGTools (identidad compartida con SIGInstallations y SIGInventory)

## Estado
Aceptada — **enmendada el 2026-07-29** (ver ADR-0008)

> **Nota de enmienda:** este ADR delegaba en SIGTools tanto la autenticación
> como la **autorización** (roles y permisos en el registro compartido). Esa
> segunda parte quedó revertida por **ADR-0008**: los roles y permisos de
> SIG-DESK viven en su propia base de datos. Lo que sigue vigente sin cambios
> es la delegación de la **autenticación**: credenciales de Active Directory,
> cookie `sig_token`, `/web-auth/{login,logout,me}` y el fallback bearer. Al
> leer las secciones 5, 6 y las de pendientes sobre sembrar claves `sigdesk.*`
> en SIGTools, interpretarlas según ADR-0008.

## Fecha
2026-07-29

## Contexto

SIG-DESK es la tercera aplicación web de SIG Systems, junto con
**SIGInstallations** y **SIGInventory**. Las dos primeras ya autentican
contra **SIGTools**, el backend Django corporativo que valida credenciales
contra **Active Directory** (LDAP, dominio `sig.com`) y emite una cookie
HttpOnly `sig_token`.

Antes de esta decisión, SIG-DESK tenía:

- Un login **mock** en el frontend: se elegía el rol con un selector de demo
  y se guardaba en `localStorage`. No había autenticación real.
- Una capa de **autorización sin autenticación debajo** en el backend Go: el
  middleware construía el `Principal` leyendo los headers
  `X-Actor-ID` y `X-Actor-Roles` que enviaba el cliente. Cualquiera podía
  hacerse administrador con `curl -H "X-Actor-Roles: admin"`. El módulo IAM
  evaluaba políticas contra una identidad que el propio llamante afirmaba.
- Campos de auditoría (`actorName`, `authorName`, `uploaderName`,
  `watcherName`) tomados del **body del request**, es decir, el cliente
  decidía a nombre de quién quedaba registrada cada acción.
- Además, `allowMissingPrincipal` estaba activo fuera de producción, con lo
  cual en desarrollo todo pasaba y en producción la UI se habría caído con
  403 en toda operación (nunca enviaba esos headers).

Construir un sistema de identidad propio (tabla `users`, contraseñas,
recuperación, JWT) habría significado un tercer directorio de usuarios en la
compañía, con su propia política de contraseñas y su propio flujo de baja de
empleados — precisamente el problema que SIGTools ya resuelve.

## Decisión

**SIG-DESK no implementa autenticación propia: la delega en SIGTools.**

1. **Frontend**: replica el patrón ya usado por las otras dos apps —
   `POST /api/v1/web-auth/login/`, `POST /api/v1/web-auth/logout/`,
   `GET /api/v1/web-auth/me/`, con `credentials: 'include'`, `X-CSRFToken`
   desde la cookie `csrftoken` en métodos no seguros, y el evento global
   `sig:auth-failure` para limpiar la sesión una sola vez ante un 401.
   `GET /me/` es la fuente canónica de roles y permisos.

2. **Backend Go**: el middleware de autenticación extrae la credencial del
   request y la **valida contra `GET /api/v1/web-auth/me/`**, construyendo la
   `Identity` con la respuesta real. Reemplaza por completo los headers
   `X-Actor-*`. Se cachea la validación ~60 s por hash de token para no
   añadir un round-trip por request, con invalidación explícita en logout.

3. **La credencial viaja como Bearer hacia el API de SIG-DESK.** La cookie
   `sig_token` es HttpOnly y está acotada al dominio del servicio de auth, y
   con `SameSite=Lax` tampoco viajaría en fetch cross-site; por lo tanto el
   navegador nunca la enviaría al API Go en otro origen. El login devuelve
   `access_token`, que el SPA guarda en `sessionStorage` (no `localStorage`)
   y adjunta como `Authorization: Bearer`. Es el mismo mecanismo de respaldo
   que ya usa SIGInstallations, y el backend acepta cookie primero y bearer
   después.

4. **Los campos de auditoría se derivan de la sesión verificada**, nunca del
   body. Los campos `actorName`/`authorName`/`watcherName` siguen declarados
   en los DTOs pero se ignoran (el decoder rechaza campos desconocidos, así
   que quitarlos convertiría requests de clientes viejos en 400 en lugar de
   descartar silenciosamente un valor en el que ya no se confía).

5. **Permisos**: SIG-DESK define sus claves con la convención del registro
   compartido, `<módulo>.<recurso>.<acción>` con prefijo `sigdesk.` (igual
   que `installations.projects.create` e `inventory.view`). Cada ruta declara
   la clave que exige. `admin` omite todas las verificaciones, y se soporta
   el comodín de módulo `sigdesk.*`.

6. **El módulo de Usuarios y Roles solo otorga y revoca acceso.** Los
   usuarios se aprovisionan en la plataforma corporativa (AD + SIGTools), así
   que SIG-DESK no ofrece crear, borrar ni restablecer contraseñas: solo
   asignar permisos a roles y roles a usuarios.

7. **`access_level` no implica administrador.** El backend compartido asigna
   nivel 1 a cualquier usuario que tenga algún rol, así que usarlo como
   atajo de admin daría acceso total a todo el mundo — un bug real que las
   otras dos apps sufrieron y documentaron en su código. `Identity` no
   siquiera transporta `access_level`, de modo que el error no está
   disponible.

8. **Modo de desarrollo explícito**: si `SIGTOOLS_API_URL` está vacío, la
   autenticación queda deshabilitada con un `WARN` al arrancar y el actor
   registrado es el literal `"Local Dev"` — nunca un valor tomado del body.
   Con `APP_ENV=production` y sin esa variable, el proceso **se niega a
   arrancar**.

## Alternativas consideradas

| Alternativa | Por qué se descartó |
|---|---|
| Identidad propia en SIG-DESK (tabla `users`, argon2id, JWT propio) | Crearía un tercer directorio de usuarios en la compañía, con su propia política de contraseñas y su propio proceso de alta/baja. Un empleado dado de baja en AD seguiría entrando a SIG-DESK. |
| El backend Go lee directamente la base `sigtools_beta` (MySQL) para validar el hash del token | Más rápido, pero acopla SIG-DESK al esquema interno de otro servicio y viola la regla de no acceder a la base de datos de otro bounded context (ver ADR-0006). Cualquier cambio de esquema allá rompería SIG-DESK en silencio. |
| Confiar en que el frontend envíe la identidad (statu quo con `X-Actor-*`) | No es autenticación: el cliente se declara a sí mismo. Es exactamente la vulnerabilidad que este ADR cierra. |
| Validar el token verificando su firma localmente, sin llamar a `/me/` | Los tokens son estilo Sanctum (opacos, con hash en base), no JWT firmados; no hay nada que verificar localmente. Además perdería la revocación inmediata. |

## Consecuencias

**Positivas:**
- Un solo lugar donde existe un usuario, una sola contraseña y un solo
  proceso de baja. Dar de baja a alguien en AD lo saca de las tres apps.
- Una sesión iniciada en cualquiera de las tres aplicaciones sirve en las
  demás; el `logout-all` las cierra todas.
- La autorización que el otro agente ya había construido (políticas IAM,
  `Principal`, dispatch por capacidades) pasa a operar sobre una identidad
  verificada en lugar de una declarada.
- La auditoría deja de ser falsificable: quien firma un comentario o un
  cambio de estado es quien realmente tiene la sesión.

**Negativas / riesgos aceptados:**
- **SIG-DESK queda acoplado operativamente a la disponibilidad de
  SIGTools**: si el servicio de auth cae, no se pueden iniciar sesiones
  nuevas (las existentes siguen sirviendo mientras dure la caché). Mitigado
  distinguiendo explícitamente "autoridad inalcanzable" (→ 503 con
  `Retry-After`) de "credencial inválida" (→ 401): una caída de un sistema
  que SIG-DESK no controla no debe desconectar a los usuarios.
- La caché de ~60 s implica que un cambio de permisos o una revocación puede
  tardar hasta un minuto en reflejarse en el API de SIG-DESK. Se aceptó a
  cambio de no añadir un round-trip HTTP por request; el logout invalida su
  entrada de inmediato.
- El token en `sessionStorage` es legible por JavaScript, a diferencia de la
  cookie HttpOnly. Es una concesión inevitable del despliegue cross-origin y
  es el mismo compromiso que ya asumió SIGInstallations; se acota usando
  `sessionStorage` (muere al cerrar la pestaña) en lugar de `localStorage`.

## Pendiente para terminar de cerrar la implementación

- **Registrar las claves de permiso de SIG-DESK en SIGTools** con
  `app = "sigdesk"` (ver `internal/identity/domain/permissions.go` y
  `FRONTEND/src/features/auth/permissions.ts`). Requiere un cambio del lado
  Django, fuera de este repositorio. Hasta entonces ningún rol puede
  tenerlas y solo los administradores podrán operar — la pantalla de roles
  avisa explícitamente qué claves faltan.
- **Confirmar que `GET /web-auth/me/` devuelve `roles` y `permissions`.** Los
  tipos de las otras dos apps los declaran opcionales y la documentación
  (más antigua) solo describe el perfil. Si no vinieran, todo usuario no
  administrador quedaría sin permisos. El código degrada de forma segura
  (deniega), pero hay que verificarlo contra el despliegue real.
- **Confirmar que el login devuelve `access_token`.** Es indispensable para
  que el API Go pueda autenticar (la cookie no le llega). SIGInstallations lo
  declara opcional, así que el despliegue debe tenerlo habilitado.
- Añadir el origen de producción de SIG-DESK a `CORS_ALLOWED_ORIGINS` del
  backend Django cuando se despliegue (los `localhost:<puerto>` de
  desarrollo ya están cubiertos por su regex).
- Evaluar si el portal de usuario final debe restringirse por `access_level`
  además de por permisos.

## Referencias
- `docs/auth/Api_info/sigtools-web-auth.md` en SIGInstallations — contrato completo del sistema de auth
- `SIGInstallations/src/shared/hooks/useAuth.tsx`, `src/shared/lib/apiClient.ts`, `src/shared/lib/authToken.ts` — implementación de referencia (incluye el fallback bearer)
- `SIGInventory/src/features/auth/` — segunda implementación de referencia
- ADR-0006 (monolito modular en Go) — la regla de no acceder a la base de datos de otro contexto, que descarta leer `sigtools_beta` directamente
- ADR-0002 (hexagonal por módulo) — `internal/identity` sigue el mismo patrón: dominio, puerto `Provider`, adaptador `sigtools`
