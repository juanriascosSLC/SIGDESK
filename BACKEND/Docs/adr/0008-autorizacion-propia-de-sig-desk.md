# ADR-0008: La autorización es propia de SIG-DESK (autenticación compartida, permisos no)

## Estado
Aceptada

## Fecha
2026-07-29

## Contexto

ADR-0007 delegó en **SIGTools** tanto la autenticación como la autorización:
SIG-DESK definía sus claves `sigdesk.*` pero pretendía almacenarlas en el
registro compartido (`sigtools_beta`), asignarlas a los roles de esa
plataforma y leerlas desde `GET /web-auth/me/`.

Al implementarlo salieron a la luz tres problemas concretos:

1. **Los endpoints de administración están namespaceados bajo otra
   aplicación**: `/api/v1/installations/admin/roles/`,
   `.../permissions/`, `.../users/`. SIG-DESK tendría que escribir permisos de
   service desk a través de la API de SIGInstallations.
2. **Los roles compartidos no son roles de service desk.** El registro define
   `admin`, `designer`, `field_tech`, `inventory_op`, `viewer` — roles de
   instalaciones e inventario. SIG-DESK necesita `agent`, `manager` y
   equivalentes, y crearlos allá los impondría a las otras dos apps.
3. **Dependencia externa para avanzar**: ninguna clave `sigdesk.*` podía
   otorgarse hasta que el equipo de Django la sembrara en su base, lo que
   dejaba la autorización de SIG-DESK bloqueada por otro equipo.

Además, las dos bases de datos son distintas: SIGTools usa MySQL
(`sigtools_beta`) y SIG-DESK usa PostgreSQL. Compartir tablas de autorización
habría implicado o acceso cruzado a la base de otro contexto —prohibido por
ADR-0006— o acoplarse a la API de otro módulo para cada cambio de permiso.

## Decisión

**La autenticación sigue compartida; la autorización pasa a ser propia.**

| Responsabilidad | Dueño |
|---|---|
| ¿Quién eres? (credenciales AD, sesión, perfil) | **SIGTools** — sin cambios respecto a ADR-0007 |
| ¿Qué puedes hacer *aquí*? (roles y permisos) | **SIG-DESK**, en su propio PostgreSQL |
| El directorio de personas (altas, bajas, contraseñas) | **Active Directory / SIGTools** |

Concretamente:

1. **Nuevo módulo `internal/rbac`** (hexagonal, como el resto): dominio
   `Role`/`Assignment`/`Grants`, puerto `Repository`, adaptadores PostgreSQL y
   memoria. Migración `000012_create_rbac` con `rbac_roles`,
   `rbac_role_permissions`, `rbac_user_roles` y `rbac_known_users`.

2. **Las claves de permiso NO son una tabla.** Se definen en Go
   (`internal/identity/domain/permissions.go`) porque son las mismas
   constantes que las rutas verifican; una tabla podría derivar de lo que el
   código realmente exige. Solo se almacenan los *otorgamientos*, y una clave
   desconocida se **rechaza** al guardar en lugar de quedar guardada
   pareciendo concedida sin coincidir nunca con nada.

3. **Las asignaciones se llavean por `username` de SIGTools**, no por su id
   numérico: es el identificador estable que la sesión transporta, es lo que
   un administrador escribe, y permite otorgar un rol antes del primer ingreso.

4. **Nuevo puerto `identity.Authorizer`.** El middleware conserva de SIGTools
   el id, nombre, correo y username, pero **reemplaza roles y permisos** por
   los de SIG-DESK. Los roles que la plataforma compartida reporta para sus
   otras aplicaciones nunca gobiernan el acceso aquí.

5. **Roles sembrados**: `admin` (de sistema, omite toda verificación),
   `manager` y `agent`, con permisos propios de un service desk. Son de
   SIG-DESK y no afectan a las otras dos apps.

6. **`SIGDESK_BOOTSTRAP_ADMINS`**: lista de usernames que siempre resuelven
   como administradores. Sin ella, una instalación nueva no tiene a nadie que
   pueda entrar a la administración de roles y por lo tanto no hay forma de
   otorgar el primer rol. `main` avisa con un `WARN` si está vacía.

7. **API propia** bajo `/api/v1/admin/` (permisos, roles, usuarios), protegida
   por la clave `sigdesk.admin.roles`. El frontend dejó de llamar a
   `/installations/admin/*` por completo.

8. **`rbac_known_users`** registra a quien inicia sesión (con throttle, no en
   cada request) para que la pantalla de administración pueda ofrecer un
   selector real y para que alguien a quien se le negó el acceso por falta de
   rol sea encontrable y se le pueda otorgar uno. No es un espejo del
   directorio: las cuentas siguen viviendo en AD.

## Alternativas consideradas

| Alternativa | Por qué se descartó |
|---|---|
| Mantener ADR-0007: permisos en el registro compartido | Los endpoints están bajo `/installations/`, los roles compartidos son de otras apps, y cada cambio de permiso dependería del equipo de Django. |
| SIG-DESK lee/escribe directo en `sigtools_beta` (MySQL) | Acceso cruzado a la base de otro bounded context; prohibido por ADR-0006 y frágil ante cualquier cambio de esquema allá. |
| Roles derivados del `access_level` de AD | El nivel viene de grupos de AD pensados para otra cosa, y el backend asigna nivel 1 a cualquiera con algún rol (ver la trampa documentada en ADR-0007). No expresa permisos de service desk. |
| Permisos también en una tabla, no en código | Podrían derivar de las constantes que las rutas verifican: una clave existiría en base sin que nada la comprobara, o al revés. Se prefirió código como fuente de verdad y validación al escribir. |

## Consecuencias

**Positivas:**
- SIG-DESK puede definir y cambiar sus roles sin coordinar con otro equipo ni
  con las otras dos aplicaciones.
- Los roles de instalaciones e inventario dejan de tener efecto aquí, y
  viceversa: crear un rol en SIG-DESK no aparece en las otras apps.
- La autenticación sigue siendo única para toda la compañía: una sola cuenta,
  una sola contraseña, una sola baja de empleado.
- Una clave de permiso mal escrita falla al guardarse en lugar de aparentar
  estar concedida.

**Negativas / riesgos aceptados:**
- **Dos lugares que administrar**: las cuentas en la plataforma corporativa y
  los roles en SIG-DESK. Es el costo de no imponer roles de service desk al
  resto de la compañía.
- Los permisos ya no se resuelven en la misma llamada que la identidad, así
  que hay una consulta adicional a PostgreSQL por validación de sesión
  (mitigado por la caché de identidad de ~60 s de ADR-0007).
- Alguien con cuenta corporativa válida entra a SIG-DESK **sin permisos** hasta
  que se le asigne un rol. Es el comportamiento correcto (denegar por
  omisión), pero requiere que un administrador otorgue el rol; por eso la
  pantalla lista a quien ya inició sesión aunque no tenga roles.
- Si el `Authorizer` falla, el middleware responde 503 en lugar de "sin
  permisos": un fallo de base de datos no debe parecerse a una cuenta mal
  configurada.

## Pendiente

- **Alcance por fila para el portal de usuario final.** Hoy
  `sigdesk.tickets.view` permite ver *todos* los tickets, así que no existe un
  rol `end_user` significativo: haría falta distinguir "ver los míos" de "ver
  todos" y filtrar por solicitante. Mientras no exista, el portal solo debería
  usarse con datos propios.
- Definir `SIGDESK_BOOTSTRAP_ADMINS` en cada despliegue.

## Referencias
- ADR-0007 (autenticación delegada a SIGTools) — enmendado por este ADR en su parte de autorización
- ADR-0006 (monolito modular) — la regla de no acceder a la base de otro contexto
- ADR-0002 (hexagonal por módulo) — `internal/rbac` sigue el mismo patrón
- `migrations/000012_create_rbac.up.sql`
- `internal/identity/domain/permissions.go` — el catálogo de claves, fuente de verdad
