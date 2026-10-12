param(
    [Parameter(Mandatory = $true)][string]$EnvFile,
    [Parameter(Mandatory = $true)][string]$ManifestPath,
    [Parameter(Mandatory = $true)][string]$SourceDatabase,
    [Parameter(Mandatory = $true)][ValidatePattern('^sigdesk_[a-z0-9_]+_restore_[0-9]{8,}$')][string]$TargetDatabase,
    [Parameter(Mandatory = $true)][string]$ConfirmToken
)

$ErrorActionPreference = 'Stop'
if ($ConfirmToken -ne "RESTORE_TO_NEW_DATABASE:$TargetDatabase") {
    throw 'Confirmation token mismatch.'
}
$active = @(
    'sigdesk_organization_beta', 'sigdesk_resource_beta', 'sigdesk_tickets_beta',
    'sigdesk_change_beta', 'sigdesk_problem_beta', 'sigdesk_workflow_beta',
    'sigdesk_notification_beta', 'sigdesk_audit_beta', 'sigdesk_knowledge_beta',
    'sigdesk_rag_beta', 'sigdesk_ai_advisor_beta', 'sigdesk_temporal_beta',
    'sigdesk_temporal_visibility_beta'
)
if ($active -contains $TargetDatabase) { throw 'In-place restore is forbidden.' }

$manifestFile = Resolve-Path -LiteralPath $ManifestPath
$manifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
$entry = @($manifest.databases | Where-Object { $_.database -eq $SourceDatabase })
if ($entry.Count -ne 1) { throw 'Source database is absent or ambiguous in the manifest.' }
$dump = Join-Path (Split-Path -Parent $manifestFile) $entry[0].file
if (-not (Test-Path -LiteralPath $dump -PathType Leaf)) { throw "Dump not found: $dump" }
$actual = (Get-FileHash -LiteralPath $dump -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne [string]$entry[0].sha256) { throw 'Dump SHA-256 does not match the manifest.' }

$betaDir = Split-Path -Parent $PSCommandPath
$repoRoot = Split-Path -Parent (Split-Path -Parent $betaDir)
$backendDir = Join-Path $repoRoot 'BACKEND'
$adminUserLine = Get-Content -LiteralPath $EnvFile | Where-Object { $_ -match '^POSTGRES_ADMIN_USER=' } | Select-Object -First 1
$adminUser = if ($adminUserLine) { ($adminUserLine -split '=', 2)[1].Trim() } else { '' }
if ($adminUser -notmatch '^[a-zA-Z_][a-zA-Z0-9_]*$') { throw 'POSTGRES_ADMIN_USER is missing or invalid.' }
$compose = @(
    'compose', '--project-name', 'sigdesk-beta', '--project-directory', $backendDir,
    '--env-file', (Resolve-Path -LiteralPath $EnvFile).Path,
    '--file', (Join-Path $backendDir 'compose.prod.yaml'),
    '--file', (Join-Path $betaDir 'compose.infra.yaml'),
    '--file', (Join-Path $betaDir 'compose.overlay.yaml')
)
$exists = & docker @compose exec -T postgres psql --username $adminUser --dbname postgres --tuples-only --no-align --command "SELECT 1 FROM pg_database WHERE datname = '$TargetDatabase'"
if ($LASTEXITCODE -ne 0) { throw 'Could not query PostgreSQL.' }
if (($exists | Out-String).Trim() -eq '1') { throw 'Target restore database already exists.' }

$containerDump = "/tmp/$TargetDatabase.dump"
& docker @compose cp $dump "postgres:$containerDump"
if ($LASTEXITCODE -ne 0) { throw 'Could not copy dump into PostgreSQL container.' }
try {
    & docker @compose exec -T postgres createdb --username $adminUser $TargetDatabase
    if ($LASTEXITCODE -ne 0) { throw 'Could not create restore database.' }
    & docker @compose exec -T postgres pg_restore --username $adminUser --dbname $TargetDatabase --no-owner --no-privileges --exit-on-error $containerDump
    if ($LASTEXITCODE -ne 0) { throw 'Restore failed; target database requires operator cleanup.' }
    Write-Host "RESTORE VERIFIED INTO NEW DATABASE: $TargetDatabase" -ForegroundColor Green
    Write-Host 'No application URL was changed. Review the restored database before cutover.'
}
finally {
    & docker @compose exec -T postgres rm -f $containerDump *> $null
}
