<#
.SYNOPSIS
    Levanta todo el stack local de SIG-Desk: infra (Docker), los
    microservicios Go que ya tienen implementación, y el frontend.

.DESCRIPTION
    Sigue el flujo documentado en
    SIG-Desk-Backend/Docs/howto/run-kong-gateway-dev.md:
      1. docker compose up -d --build  (stack completo, incluyendo
         knowledge_service y rag_service)
      2. organization_service, resource_service, tickets_service,
         workflow_service, notification_service, change_service y
         problem_service como procesos de host (`go run .`), cada uno en
         su propia ventana de PowerShell.
      3. Frontend (npm run dev) en SIG-Desk-Frontend/FRONTEND.

    audit_service NO se arranca a propósito porque todavía no tiene un
    adaptador de entrada. `knowledge_service`, `rag_service` y
    `ai_advisor_service` forman parte del stack Docker principal.

.PARAMETER SkipDocker
    No corre `docker compose up -d --build` (usalo si la infra ya está arriba).

.PARAMETER SkipFrontend
    No arranca el frontend.

.PARAMETER SkipInstall
    No corre `npm ci` en el frontend aunque falte node_modules.

.PARAMETER WithRag
    Compatibilidad hacia atrás. RAG ya forma parte obligatoria del stack
    Docker principal y se levanta siempre; este switch no cambia el
    comportamiento.

.PARAMETER Down
    En vez de levantar todo, baja la infra de Docker (`docker compose down`).
    Los procesos Go y el frontend corren en ventanas separadas: cerralas o
    Ctrl+C ahí para bajarlos.

.PARAMETER PortOffset
    Suma este valor a TODOS los puertos del stack (Docker + los 7 Go +
    frontend + Kong), para levantar una instancia completa en paralelo a otra
    que ya está corriendo en los puertos default (ej. otra sesión/worktree).
    Default 0: comportamiento idéntico al de siempre, ningún puerto cambia. El
    override es de sesión (variables de entorno del proceso) — nunca se
    persiste en `.env` ni en `.env.local`.

    kong.yml (config declarativa de Kong) es estático — sin -PortOffset se
    monta tal cual, sin cambios. Con -PortOffset, este script genera
    `SIG-Desk-Backend/kong.generated.yml` (gitignored, derivado de kong.yml
    con las 7 URLs de servicio Go y el origin CORS del frontend desplazados
    +offset) y exporta `KONG_CONFIG_FILE` para que compose.yaml monte ese
    derivado en vez del kong.yml fijo — Kong con offset rutea correctamente
    a los 7 Go con offset y acepta CORS del frontend con offset.

.EXAMPLE
    .\levantar-todo.ps1

.EXAMPLE
    .\levantar-todo.ps1 -SkipDocker -SkipFrontend

.EXAMPLE
    .\levantar-todo.ps1 -PortOffset 100
#>
param(
    [switch]$SkipDocker,
    [switch]$SkipFrontend,
    [switch]$SkipInstall,
    [switch]$WithRag, # Deprecated: RAG es parte del stack principal.
    [switch]$Live,
    [switch]$Down,
    [int]$PortOffset = 0
)

$ErrorActionPreference = 'Stop'

$root     = $PSScriptRoot

$backendCandidates = @(
    (Join-Path $root 'BACKEND'),
    (Join-Path $root 'SIG-Desk-Backend')
)
$backend = $backendCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $backend) {
    $backend = Join-Path $root 'BACKEND'
}

$frontendCandidates = @(
    (Join-Path $root 'FRONTEND'),
    (Join-Path $root 'SIG-Desk-Frontend\FRONTEND'),
    (Join-Path $root 'SIG-Desk-Frontend')
)
$frontend = $frontendCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $frontend) {
    $frontend = Join-Path $root 'FRONTEND'
}

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Warn2($msg) { Write-Host "!! $msg" -ForegroundColor Yellow }

if (-not (Test-Path $backend)) {
    throw "No encuentro la carpeta del backend en '$backend'. Corré este script desde la raíz del repo SIG-DESK."
}

# --- Modo Down: solo baja la infra de Docker ------------------------------
if ($Down) {
    Write-Step "Bajando infra de Docker (docker compose down)..."
    Push-Location $backend
    try { docker compose down } finally { Pop-Location }
    Write-Warn2 "Los procesos Go y el frontend corren en sus propias ventanas: cerralas o hacé Ctrl+C ahí."
    return
}

# --- Puertos base + offset (-PortOffset) ------------------------------------
# Mismos defaults que compose.override.yaml / .env.example / cada main.go de
# los 7 servicios Go que siguen como procesos de host / vite.config.ts.
# `knowledge_service` corre dentro de Docker y usa el puerto interno 8089.
# Con -PortOffset 0 (default), Get-Port
# devuelve exactamente el default de siempre — el resto del script queda
# byte a byte equivalente al comportamiento anterior a este parámetro.
$basePorts = @{
    Postgres     = 5432
    Kafka        = 9092
    Temporal     = 7233
    TemporalUI   = 8233
    KongProxy    = 8000
    KongAdmin    = 8001
    RagPostgres  = 5433
    Tei          = 8090
    Organization = 8081
    Resource     = 8082
    Tickets      = 8080
    Workflow     = 8083
    Notification = 8084
    Change       = 8087
    Problem      = 8088
    Frontend     = 3003
}
function Get-Port([string]$Name) { $basePorts[$Name] + $PortOffset }

# --- Verificación de herramientas ------------------------------------------
foreach ($tool in 'docker', 'go', 'npm') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        if ($Live) { throw "Perfil vivo: no encuentro '$tool' en PATH." }
        Write-Warn2 "No encuentro '$tool' en PATH. Instalalo o agregalo al PATH antes de continuar."
    }
}

# --- .env del backend (ADR-0011: nunca commiteado, se copia de .env.example) -
$envFile = Join-Path $backend '.env'
$envExampleFile = Join-Path $backend '.env.example'
if (-not (Test-Path $envFile)) {
    Write-Step "No existe $envFile — lo creo desde .env.example"
    Copy-Item $envExampleFile $envFile
}

# --- Sincronizar claves nuevas de .env.example -> .env ----------------------
# Un `.env` que sobrevive a un `git merge` de otra rama queda desactualizado
# si esa rama agregó variables nuevas a .env.example (p.ej. el merge que trajo
# change_service/problem_service agregó ORGANIZATION_INTERNAL_SECRET,
# RESOURCE_INTERNAL_SECRET, SIGTOOLS_API_URL, CHANGE_DATABASE_URL,
# PROBLEM_DATABASE_URL). organization_service/resource_service/tickets_service
# fallan cerrado sin esas claves (ver sus main.go) y mueren al instante en su
# propia ventana de `go run .` — mientras este script sigue de largo e imprime
# "Listo", así que la falla queda enterrada. Cualquier clave presente en
# .env.example y ausente en .env se agrega acá con el valor de ejemplo (son
# placeholders de desarrollo documentados, nunca secretos reales — mismo
# criterio que ADR-0011).
function Get-EnvKeys([string]$path) {
    Get-Content $path |
        Where-Object { $_ -match '^\s*[^#\s][^=]*=' } |
        ForEach-Object { (($_ -split '=', 2)[0]).Trim() }
}

$existingKeys = @(Get-EnvKeys $envFile)
$missingLines = @(
    Get-Content $envExampleFile | Where-Object {
        if ($_ -notmatch '^\s*[^#\s][^=]*=') { return $false }
        $key = (($_ -split '=', 2)[0]).Trim()
        $existingKeys -notcontains $key
    }
)
if ($missingLines.Count -gt 0) {
    Write-Warn2 "$envFile no tenía $($missingLines.Count) clave(s) nueva(s) de .env.example (probablemente un merge de otra rama) — las agrego con el valor de ejemplo:"
    $missingLines | ForEach-Object { Write-Warn2 "  + $((($_ -split '=', 2)[0]).Trim())" }
    $linesToAppend = @(
        ''
        '# --- Sincronizado automáticamente por levantar-todo.ps1 desde .env.example ---'
    ) + $missingLines
    Add-Content -Path $envFile -Value $linesToAppend
}

# --- .env.local del frontend -------------------------------------------------
$frontEnvExample = Join-Path $frontend '.env.example'
$frontEnvFile    = Join-Path $frontend '.env.local'
if ((Test-Path $frontEnvExample) -and -not (Test-Path $frontEnvFile)) {
    Write-Step "No existe $frontEnvFile — lo creo desde .env.example"
    Copy-Item $frontEnvExample $frontEnvFile
}

# Los servicios Go leen os.Getenv directo (no hay godotenv en el repo), así
# que para correrlos como procesos de host hay que exportar las variables
# del .env en la sesión donde corre cada `go run .`. Convertimos el .env en
# un snippet de `$env:CLAVE = 'valor'` para inyectarlo en cada ventana nueva.
#
# -PortOffset: estas claves traen un puerto EMBEBIDO en el valor (cadena de
# conexión o URL de sincronización entre Go), no como variable de puerto
# separada — hay que reescribir ese número puntual. Mapeadas a la entrada de
# $basePorts que le corresponde; nunca un regex genérico sobre todo el
# snippet, porque .env también trae secretos y otros valores con dígitos que
# no son puertos.
$portOffsetKeys = @{
    TICKETS_DATABASE_URL      = 'Postgres'
    ORGANIZATION_DATABASE_URL = 'Postgres'
    RESOURCE_DATABASE_URL     = 'Postgres'
    WORKFLOW_DATABASE_URL     = 'Postgres'
    NOTIFICATION_DATABASE_URL = 'Postgres'
    AUDIT_DATABASE_URL        = 'Postgres'
    AI_ADVISOR_DATABASE_URL   = 'Postgres'
    CHANGE_DATABASE_URL       = 'Postgres'
    PROBLEM_DATABASE_URL      = 'Postgres'
    RAG_DATABASE_URL          = 'RagPostgres'
    KAFKA_BROKERS              = 'Kafka'
    TEMPORAL_HOST              = 'Temporal'
    ORGANIZATION_SERVICE_URL  = 'Organization'
    RESOURCE_SERVICE_URL      = 'Resource'
    TICKETS_SERVICE_URL       = 'Tickets'
    CATALOG_SERVICE_URL       = 'Tickets'
    CHANGE_SERVICE_URL        = 'Change'
}

$envSetSnippet = (
    Get-Content $envFile |
    Where-Object { $_ -match '^\s*[^#\s][^=]*=' } |
    ForEach-Object {
        $key, $val = $_ -split '=', 2
        $key = $key.Trim()
        $val = $val.Trim()
        if ($PortOffset -ne 0 -and $portOffsetKeys.ContainsKey($key)) {
            $basePort = $basePorts[$portOffsetKeys[$key]]
            $val = $val -replace ":$basePort(?=[/,]|$)", ":$($basePort + $PortOffset)"
        }
        "`$env:$key = '$val'"
    }
) -join '; '

if ($Live) {
    $requiredLive = @('JWT_SECRET','ORGANIZATION_SERVICE_URL','RESOURCE_SERVICE_URL','KAFKA_BROKERS','TEMPORAL_HOST','TICKETS_INTERNAL_SECRET')
    $envKeys = Get-Content $envFile | Where-Object { $_ -match '^\s*[^#\s][^=]*=' } | ForEach-Object { ($_ -split '=',2)[0].Trim() }
    foreach ($key in $requiredLive) {
        if ($envKeys -notcontains $key) { throw "Perfil vivo: falta $key en $envFile." }
    }
    $envSetSnippet += "; `$env:SIGDESK_LIVE_PROFILE = 'true'; `$env:REQUIRE_LIVE_INTEGRATIONS = 'true'"
}

function Start-InNewWindow {
    param([string]$Title, [string]$WorkDir, [string]$Command)
    $fullCommand = "`$Host.UI.RawUI.WindowTitle = '$Title'; Set-Location -LiteralPath '$WorkDir'; $Command"
    Start-Process powershell -ArgumentList @('-NoExit', '-NoProfile', '-Command', $fullCommand) | Out-Null
}

# Corre un comando nativo cuyo stderr se redirige (*> / 2>&1) sin dejar que
# $ErrorActionPreference = 'Stop' lo ascienda a excepción terminante. En
# PowerShell 5.1, redirigir el stream de error de un ejecutable envuelve
# cada línea en un NativeCommandError — con 'Stop' eso corta el script
# entero en vez de dejar que $LASTEXITCODE se chequee normalmente (visto en
# la práctica: `docker compose exec` contra un Postgres caído mataba el
# loop de reintento de 60s en el primer intento). $LASTEXITCODE sigue
# reflejando el código real del proceso después de llamar a esto.
function Invoke-Native([scriptblock]$Command) {
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & $Command }
    catch { Write-Warn2 "  (stderr nativo, ignorado: $($_.Exception.Message))" }
    finally { $ErrorActionPreference = $prevEAP }
}

# --- Override de puertos para Docker Compose (solo si -PortOffset) ---------
# Variables de entorno DEL PROCESO: Compose las resuelve con prioridad sobre
# el .env que carga automáticamente desde $backend (comportamiento estándar
# de Docker Compose: shell env > `.env` de Compose) — alcanza con exportarlas
# acá, en esta sesión, sin escribir nada a disco. Cubre exactamente las 8
# variables que compose.override.yaml ya acepta con `${VAR:-default}`.
if ($PortOffset -ne 0) {
    Write-Step "PortOffset=${PortOffset}: exportando puertos de Docker Compose para esta sesión..."
    $env:POSTGRES_PORT     = "$(Get-Port 'Postgres')"
    $env:KAFKA_PORT        = "$(Get-Port 'Kafka')"
    $env:TEMPORAL_PORT     = "$(Get-Port 'Temporal')"
    $env:TEMPORAL_UI_PORT  = "$(Get-Port 'TemporalUI')"
    $env:KONG_PROXY_PORT   = "$(Get-Port 'KongProxy')"
    $env:KONG_ADMIN_PORT   = "$(Get-Port 'KongAdmin')"
    $env:RAG_POSTGRES_PORT = "$(Get-Port 'RagPostgres')"
    $env:TEI_PORT          = "$(Get-Port 'Tei')"

    # --- kong.yml con offset: generar kong.generated.yml -------------------
    # kong.yml es DB-less y estático (sin sustitución de variables propia —
    # ver su comentario de cabecera): sus 7 `service.url` hardcodean
    # host.docker.internal:8080..8088 (puertos DEFAULT) y su plugin `cors`
    # hardcodea los orígenes localhost:3003/3004 y 127.0.0.1:3003/3004.
    # Derivamos kong.generated.yml (gitignored) reemplazando esos 7 puertos
    # y ese origin por sus equivalentes +offset, y apuntamos el bind mount
    # de compose.yaml (`${KONG_CONFIG_FILE:-./kong.yml}`, ver `volumes:` del
    # servicio kong) a ese derivado — kong.yml en sí nunca se toca.
    $kongSource    = Join-Path $backend 'kong.yml'
    $kongGenerated = Join-Path $backend 'kong.generated.yml'
    Write-Step "PortOffset=${PortOffset}: generando kong.generated.yml (rutas Go + CORS con offset)..."
    $kongContent = Get-Content -Raw -LiteralPath $kongSource
    # Mismos 7 servicios Go que $goServices arranca más abajo. ai-advisor-service
    # NO se toca: corre en la red interna de Compose (http://ai_advisor_service:8086),
    # un puerto de contenedor fijo que -PortOffset nunca desplaza.
    foreach ($portName in @('Tickets', 'Organization', 'Resource', 'Workflow', 'Notification', 'Change', 'Problem')) {
        $base = $basePorts[$portName]
        $kongContent = $kongContent -replace "host\.docker\.internal:$base(?!\d)", "host.docker.internal:$($base + $PortOffset)"
    }
    $frontendPortForKong = Get-Port 'Frontend'
    $kongContent = $kongContent -replace [regex]::Escape('http://localhost:3003'), "http://localhost:$frontendPortForKong"
    $kongContent = $kongContent -replace [regex]::Escape('http://127.0.0.1:3003'), "http://127.0.0.1:$frontendPortForKong"
    $kongContent = $kongContent -replace [regex]::Escape('http://localhost:3004'), "http://localhost:$($frontendPortForKong + 1)"
    $kongContent = $kongContent -replace [regex]::Escape('http://127.0.0.1:3004'), "http://127.0.0.1:$($frontendPortForKong + 1)"
    Set-Content -LiteralPath $kongGenerated -Value $kongContent -NoNewline
    $env:KONG_CONFIG_FILE = $kongGenerated
    # rag_indexador corre dentro de Compose, pero su backfill consulta los
    # servicios Go que este script levanta en el host. Con un offset, no puede
    # seguir usando los defaults 8080/8081 o queda Exited y los ArticuloPublicado
    # se acumulan en Kafka sin llegar a chunks.
    $env:TICKETS_SERVICE_URL      = "http://host.docker.internal:$(Get-Port 'Tickets')"
    $env:ORGANIZATION_SERVICE_URL = "http://host.docker.internal:$(Get-Port 'Organization')"
    Write-Step "  kong.generated.yml listo: rutea a los 7 Go en +${PortOffset} y acepta CORS de :$frontendPortForKong."
}

# --- 1. Stack principal Docker ---------------------------------------------
# ADR-0011 define `docker compose up -d` sin flags como el arranque del stack
# completo de desarrollo. RAG es el octavo servicio (ADR-0010), por lo que no
# se filtra fuera del arranque normal: postgres_rag, tei, rag_indexador y
# rag_buscador deben compartir la red Compose con Kafka y el resto de la
# infraestructura.

if (-not $SkipDocker) {
    Write-Step "Levantando stack principal completo (docker compose up -d --build), incluyendo Knowledge Base y RAG..."
    Push-Location $backend
    try {
        docker compose up -d --build
        $composeExitCode = $LASTEXITCODE
    }
    finally { Pop-Location }
    if ($WithRag) {
        Write-Warn2 "-WithRag está deprecado: RAG ya se levanta siempre como parte del stack principal."
    }
    if ($composeExitCode -ne 0) {
        throw "docker compose up -d falló con código $composeExitCode — no continúo con los servicios Go. Revisá 'docker compose ps -a' y liberá los puertos ocupados en $backend."
    }
}
else {
    Write-Warn2 "SkipDocker: asumo que la infra ya está arriba — igual verifico que Postgres responda antes de arrancar los Go."
}

# Se verifica SIEMPRE, incluso con -SkipDocker: abrir 7 ventanas de Go contra
# un Postgres caído es peor que no abrir ninguna — cada `go run .` moriría
# por separado con "connection refused" (visto en la práctica: el
# contenedor puede haberse detenido entre sesiones, o `-SkipDocker` haber
# asumido infra que ya no estaba arriba) y el script principal ya habría
# terminado imprimiendo "Listo", enterrando la falla real.
Write-Step "Esperando a que Postgres acepte conexiones (hasta 60s)..."
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Push-Location $backend
    try { Invoke-Native { docker compose exec -T postgres pg_isready -U sigdesk *> $null } } finally { Pop-Location }
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 2
}
if (-not $ready) {
    throw "Postgres no respondió pg_isready en 60s — no arranco los servicios Go ni el frontend (fallarían todos al conectar). Revisá 'docker compose ps -a' y 'docker compose logs postgres' en $backend (o sacá -SkipDocker si la infra en realidad no estaba arriba)."
}
Write-Step "Postgres listo."

# --- Bases de datos por servicio: crear las que falten en el volumen actual -
# scripts/init-multiple-dbs.sh (docker-entrypoint-initdb.d) solo corre la
# PRIMERA vez que Postgres inicializa un volumen vacío. Un volumen que ya
# existía de antes de un merge que agregó un servicio nuevo (y su propia
# *_DATABASE_URL en .env.example) nunca vuelve a correrlo, así que esa base
# nunca se crea — el `go run .` de ese servicio muere con "database ...
# does not exist" aunque Postgres esté sano. Se detectan acá todas las
# claves *_DATABASE_URL del .env (menos RAG_DATABASE_URL: vive en el
# contenedor `postgres_rag` aparte) y se crea, de forma idempotente (mismo
# patrón SQL que init-multiple-dbs.sh), cualquier base que falte.
$dbUrlLines = Get-Content $envFile | Where-Object {
    $_ -match '^\s*[A-Z_]+_DATABASE_URL\s*=' -and $_ -notmatch '^\s*RAG_DATABASE_URL\s*='
}
foreach ($line in $dbUrlLines) {
    $dbUrl = (($line -split '=', 2)[1]).Trim()
    $dbName = (($dbUrl -replace '.*/', '') -replace '\?.*', '')
    if (-not $dbName) { continue }
    $sql = "SELECT 'CREATE DATABASE $dbName OWNER sigdesk' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$dbName')\gexec"
    Push-Location $backend
    try { $out = Invoke-Native { $sql | docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U sigdesk 2>&1 } } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) {
        Write-Warn2 "No pude verificar/crear la base '$dbName': $out"
    }
    elseif ($out -match 'CREATE DATABASE') {
        Write-Warn2 "  + '$dbName' no existía en el volumen actual de Postgres — la creé."
    }
}

# --- 2. Microservicios Go como procesos de host -----------------------------
# Orden: organization_service/resource_service antes que tickets_service,
# porque CrearTicketUseCase los valida de forma síncrona (ADR-0001).
# notification_service/change_service/problem_service van al final: los dos
# últimos llaman por HTTP a organization_service/resource_service/
# tickets_service (ver sus adapters/*/client.go), y aunque el circuit
# breaker tolera que arranquen antes, mantener el orden evita ruido de
# reintentos al levantar todo por primera vez.
#
# DbVar: organization_service/resource_service/tickets_service/
# workflow_service leen la variable genérica `DATABASE_URL` (main.go,
# `env("DATABASE_URL", ...)`), así que hace falta remapear su
# *_DATABASE_URL específica antes de correrlos. notification_service/
# change_service/problem_service en cambio leen su propia variable con
# nombre (`NOTIFICATION_DATABASE_URL`/`CHANGE_DATABASE_URL`/
# `PROBLEM_DATABASE_URL`) directo del .env que $envSetSnippet ya exporta —
# no necesitan remapeo (DbVar = $null).
# Los puertos vienen de Get-Port/$basePorts (arriba) — con -PortOffset 0 son
# exactamente los mismos 8081/8082/8080/8083/8084/8087/8088 de siempre.
$goServices = @(
    @{ Name = 'organization_service'; Port = (Get-Port 'Organization'); DbVar = 'ORGANIZATION_DATABASE_URL' },
    @{ Name = 'resource_service';     Port = (Get-Port 'Resource');     DbVar = 'RESOURCE_DATABASE_URL' },
    @{ Name = 'tickets_service';      Port = (Get-Port 'Tickets');     DbVar = 'TICKETS_DATABASE_URL' },
    @{ Name = 'workflow_service';     Port = (Get-Port 'Workflow');     DbVar = 'WORKFLOW_DATABASE_URL' },
    @{ Name = 'notification_service'; Port = (Get-Port 'Notification'); DbVar = $null },
    @{ Name = 'change_service';       Port = (Get-Port 'Change');       DbVar = $null },
    @{ Name = 'problem_service';      Port = (Get-Port 'Problem');      DbVar = $null }
)

foreach ($svc in $goServices) {
    $dir = Join-Path $backend $svc.Name
    Write-Step "Arrancando $($svc.Name) en :$($svc.Port) (go run .)..."
    $dbSnippet = if ($svc.DbVar) { "`$env:DATABASE_URL = `$env:$($svc.DbVar); " } else { '' }
    $cmd = "$envSetSnippet; $dbSnippet`$env:PORT = '$($svc.Port)'; go run ."
    Start-InNewWindow -Title "SIG-Desk: $($svc.Name)" -WorkDir $dir -Command $cmd
}

# `rag_indexador` vive en Compose pero su backfill inicial consulta los
# servicios Go del host. Compose no puede expresar esa dependencia cruzada:
# cuando se levanta antes de estas ventanas, sale con ErrorDirectorioUsuarios
# y queda detenido aunque sus dependencias Docker estén sanas. Esperamos ambos
# puertos y lo reiniciamos una vez; el timeout no impide que los demás
# servicios sigan disponibles, pero deja un diagnóstico accionable.
function Test-HostPort([int]$Port) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $connection = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        if (-not $connection.AsyncWaitHandle.WaitOne(500)) { return $false }
        $client.EndConnect($connection)
        return $true
    }
    catch { return $false }
    finally { $client.Dispose() }
}

Write-Step "Esperando organization_service y tickets_service para iniciar rag_indexador (hasta 45s)..."
$ragPrerequisitesReady = $false
$ragDeadline = [DateTime]::UtcNow.AddSeconds(45)
while ([DateTime]::UtcNow -lt $ragDeadline) {
    if ((Test-HostPort (Get-Port 'Organization')) -and (Test-HostPort (Get-Port 'Tickets'))) {
        $ragPrerequisitesReady = $true
        break
    }
    Start-Sleep -Seconds 2
}
if ($ragPrerequisitesReady) {
    Write-Step "Reiniciando rag_indexador después de que sus dependencias del host están listas..."
    Push-Location $backend
    try {
        docker compose restart rag_indexador
        $ragRestartExitCode = $LASTEXITCODE
    }
    finally { Pop-Location }
    if ($ragRestartExitCode -ne 0) {
        Write-Warn2 "No pude reiniciar rag_indexador (código $ragRestartExitCode). Revisá 'docker compose logs rag_indexador'."
    }
}
else {
    Write-Warn2 "organization_service o tickets_service no abrió su puerto en 45s; rag_indexador puede quedar Exited. Revisá sus ventanas y luego corré: cd $backend; docker compose restart rag_indexador"
}

Write-Warn2 "audit_service sigue fuera del arranque local: todavía no tiene adaptador HTTP. knowledge_service, rag_service y ai_advisor_service forman parte del stack Docker principal."

# --- 3. Frontend -------------------------------------------------------------
if (-not $SkipFrontend) {
    if (-not (Test-Path $frontend)) {
        Write-Warn2 "No encuentro '$frontend' — salteo el frontend."
    }
    else {
        if (-not $SkipInstall -and -not (Test-Path (Join-Path $frontend 'node_modules'))) {
            Write-Step "Instalando dependencias del frontend (npm ci)..."
            Push-Location $frontend
            try { npm ci } finally { Pop-Location }
        }
        $frontendPort = Get-Port 'Frontend'
        Write-Step "Arrancando frontend en :${frontendPort} (npm run dev)..."
        # -PortOffset: vite.config.ts hardcodea 3003, pero Vite acepta
        # `--port` por CLI para overridearlo sin tocar el config file.
        # VITE_API_URL como env var de sesión: Vite (loadEnv, ver
        # node_modules/vite/dist/node/chunks/node.js) mezcla process.env
        # SOBRE lo cargado de .env.local para toda clave con prefijo VITE_ —
        # así el frontend con offset habla con SU Kong (puerto con offset),
        # no con el de otra instancia, sin escribir nada a .env.local.
        $frontendCmd = 'npm run dev'
        if ($PortOffset -ne 0) {
            $frontendCmd = "`$env:VITE_API_URL = 'http://localhost:$(Get-Port 'KongProxy')'; npm run dev -- --port $frontendPort"
        }
        Start-InNewWindow -Title 'SIG-Desk: frontend' -WorkDir $frontend -Command $frontendCmd
    }
}
else {
    Write-Warn2 "SkipFrontend: no arranco el frontend."
}

$serviceNames = ($goServices | ForEach-Object { $_.Name }) -join ', '
Write-Host ""
Write-Host "Listo. Ventanas abiertas: $serviceNames$(if (-not $SkipFrontend) { ', frontend' })." -ForegroundColor Green
Write-Host "Gateway (Kong):  http://localhost:$(Get-Port 'KongProxy')" -ForegroundColor Green
Write-Host "Frontend:        http://localhost:$(Get-Port 'Frontend')" -ForegroundColor Green
Write-Host "Temporal UI:     http://localhost:$(Get-Port 'TemporalUI')" -ForegroundColor Green
Write-Host ""
if ($PortOffset -ne 0) {
    Write-Warn2 "PortOffset=${PortOffset}: Postgres/Kafka/Temporal/Kong y los 7 Go quedaron en sus puertos default +${PortOffset}."
    Write-Step "  Kong rutea vía kong.generated.yml (derivado, gitignored): los 7 Go en +${PortOffset} y CORS habilitado para http://localhost:$(Get-Port 'Frontend')."
}
Write-Host "Para bajar todo: cerrá las ventanas (o Ctrl+C en cada una) y corré '.\levantar-todo.ps1 -Down' para bajar la infra de Docker." -ForegroundColor DarkGray
