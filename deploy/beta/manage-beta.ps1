param(
    [Parameter(Position = 0, Mandatory = $true)]
    [ValidateSet('validate', 'pull', 'up', 'start', 'down', 'status', 'logs', 'smoke', 'backup')]
    [string]$Command,
    [Parameter(Mandatory = $true)][string]$EnvFile,
    [switch]$LocalAI,
    [string]$BackupRoot
)

$ErrorActionPreference = 'Stop'
$betaDir = Split-Path -Parent $PSCommandPath
$repoRoot = Split-Path -Parent (Split-Path -Parent $betaDir)
$backendDir = Join-Path $repoRoot 'BACKEND'
$baseCompose = Join-Path $backendDir 'compose.prod.yaml'
$infraCompose = Join-Path $betaDir 'compose.infra.yaml'
$overlayCompose = Join-Path $betaDir 'compose.overlay.yaml'
$runningOnWindows = ($PSVersionTable.PSVersion.Major -lt 6) -or $IsWindows

function Read-EnvMap([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Environment file not found: $Path"
    }
    $map = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
        $parts = $line -split '=', 2
        if ($parts.Count -ne 2 -or -not $parts[0].Trim()) {
            throw "Invalid environment entry (expected NAME=value)."
        }
        $map[$parts[0].Trim()] = $parts[1].Trim()
    }
    return $map
}

function Get-ComposeArgs {
    $args = @(
        'compose', '--project-name', 'sigdesk-beta',
        '--project-directory', $backendDir,
        '--env-file', (Resolve-Path -LiteralPath $EnvFile).Path,
        '--file', $baseCompose,
        '--file', $infraCompose,
        '--file', $overlayCompose
    )
    if ($LocalAI) { $args += @('--profile', 'ai-local') }
    return $args
}

function Invoke-Compose([string[]]$Arguments, [switch]$Capture) {
    $allArgs = @(Get-ComposeArgs) + $Arguments
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = & docker @allArgs 2>&1
        $exitCode = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = $previousPreference }
    if ($Capture) {
        if ($exitCode -ne 0) { throw ($output -join "`n") }
        return ($output -join "`n")
    }
    $output | ForEach-Object { Write-Host $_ }
    if ($exitCode -ne 0) { throw "docker compose failed with exit code $exitCode" }
}

function Assert-DeploymentConfiguration {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Docker CLI is not installed or not in PATH.'
    }
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & docker compose version *> $null
        $composeVersionExit = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = $previousPreference }
    if ($composeVersionExit -ne 0) { throw 'Docker Compose v2 is unavailable.' }

    $envMap = Read-EnvMap $EnvFile
    $required = @(
        'SIGDESK_HOSTNAME', 'BETA_TLS_CERT_FILE', 'BETA_TLS_KEY_FILE',
        'SIGTOOLS_UPSTREAM', 'SIGTOOLS_TLS_NAME', 'SIGTOOLS_CA_FILE',
        'SIGTOOLS_ASSETS_API_URL', 'SIGTOOLS_ASSETS_READ_TOKEN', 'JWT_SECRET',
        'POSTGRES_ADMIN_PASSWORD', 'KAFKA_CLUSTER_ID'
    )
    foreach ($name in $required) {
        if (-not $envMap.ContainsKey($name) -or -not $envMap[$name]) {
            throw "Required setting is missing: $name"
        }
    }
    foreach ($entry in $envMap.GetEnumerator()) {
        if ($entry.Value -match 'CHANGE_ME|example\.invalid') {
            throw "Placeholder remains in setting $($entry.Key)."
        }
        if ($entry.Value -match '_local(?:\b|_)') {
            throw "Local database reference is forbidden in $($entry.Key)."
        }
        if ($entry.Value -match 'e2e_inventory_server|localhost|127\.0\.0\.1') {
            if ($entry.Key -notin @('BETA_BIND_ADDRESS')) {
                throw "Development-only endpoint is forbidden in $($entry.Key)."
            }
        }
    }
    foreach ($name in @($envMap.Keys | Where-Object { $_ -match '(_DB_PASSWORD|^POSTGRES_ADMIN_PASSWORD$)' })) {
        if ($envMap[$name] -notmatch '^[a-zA-Z0-9_-]{32,}$') {
            throw "$name must be URL-safe and at least 32 characters."
        }
    }

    $imageKeys = @($envMap.Keys | Where-Object { $_ -match '^(SIGDESK_.*_IMAGE|BETA_.*_IMAGE)$' })
    foreach ($name in $imageKeys) {
        if ($envMap[$name] -notmatch '@sha256:[0-9a-fA-F]{64}$') {
            throw "$name must be pinned to an immutable sha256 digest."
        }
    }

    foreach ($name in @('BETA_TLS_CERT_FILE', 'BETA_TLS_KEY_FILE', 'SIGTOOLS_CA_FILE')) {
        if (-not (Test-Path -LiteralPath $envMap[$name] -PathType Leaf)) {
            throw "$name does not point to a readable file: $($envMap[$name])"
        }
    }
    if (-not $envMap['SIGTOOLS_UPSTREAM'].StartsWith('https://')) {
        throw 'SIGTOOLS_UPSTREAM must use HTTPS.'
    }
    if (-not $envMap['SIGTOOLS_ASSETS_API_URL'].StartsWith('https://')) {
        throw 'SIGTOOLS_ASSETS_API_URL must use HTTPS.'
    }
    $localAiEndpoints =
        $envMap['TEI_URL'] -match '^http://tei(?::|/)' -or
        $envMap['RERANKER_URL'] -match '^http://reranker(?::|/)' -or
        $envMap['LLM_BASE_URL'] -match '^http://ollama(?::|/)'
    if ($localAiEndpoints -and -not $LocalAI) {
        throw 'Internal AI endpoints require -LocalAI; otherwise configure approved remote HTTPS endpoints.'
    }
    if (-not $LocalAI) {
        foreach ($name in @('TEI_URL', 'RERANKER_URL', 'LLM_BASE_URL')) {
            if (-not $envMap[$name].StartsWith('https://')) {
                throw "$name must use HTTPS when local AI is disabled."
            }
        }
    }

    if (-not $runningOnWindows) {
        $mode = [System.IO.File]::GetUnixFileMode((Resolve-Path -LiteralPath $EnvFile).Path)
        $unsafe = [System.IO.UnixFileMode]::GroupRead -bor
            [System.IO.UnixFileMode]::GroupWrite -bor
            [System.IO.UnixFileMode]::GroupExecute -bor
            [System.IO.UnixFileMode]::OtherRead -bor
            [System.IO.UnixFileMode]::OtherWrite -bor
            [System.IO.UnixFileMode]::OtherExecute
        if (($mode -band $unsafe) -ne 0) {
            throw 'The environment file must be private (chmod 600).'
        }
    }

    $json = Invoke-Compose @('config', '--format', 'json') -Capture
    $jsonStart = $json.IndexOf('{')
    $jsonEnd = $json.LastIndexOf('}')
    if ($jsonStart -lt 0 -or $jsonEnd -lt $jsonStart) {
        throw 'Docker Compose did not return a JSON configuration.'
    }
    $json = $json.Substring($jsonStart, $jsonEnd - $jsonStart + 1)
    $config = $json | ConvertFrom-Json
    foreach ($service in $config.services.PSObject.Properties) {
        $ports = @($service.Value.ports | Where-Object { $null -ne $_ })
        if ($ports.Count -gt 0 -and $service.Name -ne 'edge') {
            throw "Only edge may publish host ports; found published port on $($service.Name)."
        }
    }
    if (@($config.services.edge.ports | Where-Object { $null -ne $_ }).Count -ne 1) {
        throw 'Edge must publish exactly one HTTPS port.'
    }
    Write-Host 'BETA DEPLOYMENT CONFIGURATION: VALID' -ForegroundColor Green
}

function Invoke-Smoke {
    $envMap = Read-EnvMap $EnvFile
    $port = if ($envMap['BETA_HTTPS_PORT']) { $envMap['BETA_HTTPS_PORT'] } else { '443' }
    $authority = if ($port -eq '443') { $envMap['SIGDESK_HOSTNAME'] } else { "$($envMap['SIGDESK_HOSTNAME']):$port" }
    $base = "https://$authority"
    $checks = @(
        @{ Name = 'edge'; Url = "$base/healthz"; Expected = 200 },
        @{ Name = 'frontend'; Url = "$base/"; Expected = 200 },
        @{ Name = 'audit'; Url = "$base/sigdesk-api/auditoria/health"; Expected = 200 }
    )
    foreach ($check in $checks) {
        try {
            $response = Invoke-WebRequest -Uri $check.Url -Method Get -TimeoutSec 15 -UseBasicParsing
            if ([int]$response.StatusCode -ne $check.Expected) {
                throw "expected $($check.Expected), got $($response.StatusCode)"
            }
            Write-Host "[ok] $($check.Name): $($response.StatusCode)"
        }
        catch { throw "Smoke check '$($check.Name)' failed at $($check.Url): $($_.Exception.Message)" }
    }
}

switch ($Command) {
    'validate' { Assert-DeploymentConfiguration }
    'pull' {
        Assert-DeploymentConfiguration
        Invoke-Compose @('pull')
    }
    'up' {
        Assert-DeploymentConfiguration
        Invoke-Compose @('pull')
        Invoke-Compose @('up', '--detach', '--remove-orphans', '--wait')
    }
    'start' {
        Assert-DeploymentConfiguration
        Invoke-Compose @('up', '--detach', '--remove-orphans', '--wait', '--pull', 'never')
    }
    'down' { Invoke-Compose @('down', '--remove-orphans') }
    'status' { Invoke-Compose @('ps') }
    'logs' { Invoke-Compose @('logs', '--tail', '250') }
    'smoke' { Invoke-Smoke }
    'backup' {
        Assert-DeploymentConfiguration
        $script = Join-Path $betaDir 'backup-beta.ps1'
        $parameters = @{ EnvFile = $EnvFile }
        if ($BackupRoot) { $parameters.BackupRoot = $BackupRoot }
        & $script @parameters
    }
}
