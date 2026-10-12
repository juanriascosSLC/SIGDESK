param(
    [Parameter(Mandatory = $true)][string]$EnvFile,
    [string]$BackupRoot
)

$ErrorActionPreference = 'Stop'
$betaDir = Split-Path -Parent $PSCommandPath
$repoRoot = Split-Path -Parent (Split-Path -Parent $betaDir)
$backendDir = Join-Path $repoRoot 'BACKEND'
$adminUserLine = Get-Content -LiteralPath $EnvFile | Where-Object { $_ -match '^POSTGRES_ADMIN_USER=' } | Select-Object -First 1
$adminUser = if ($adminUserLine) { ($adminUserLine -split '=', 2)[1].Trim() } else { '' }
if ($adminUser -notmatch '^[a-zA-Z_][a-zA-Z0-9_]*$') { throw 'POSTGRES_ADMIN_USER is missing or invalid.' }
if (-not $BackupRoot) { $BackupRoot = Join-Path $backendDir '.backups/beta' }
$stamp = [DateTimeOffset]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$destination = Join-Path $BackupRoot $stamp
New-Item -ItemType Directory -Path $destination -Force | Out-Null

$compose = @(
    'compose', '--project-name', 'sigdesk-beta', '--project-directory', $backendDir,
    '--env-file', (Resolve-Path -LiteralPath $EnvFile).Path,
    '--file', (Join-Path $backendDir 'compose.prod.yaml'),
    '--file', (Join-Path $betaDir 'compose.infra.yaml'),
    '--file', (Join-Path $betaDir 'compose.overlay.yaml')
)
$databases = @(
    'sigdesk_organization_beta', 'sigdesk_resource_beta', 'sigdesk_tickets_beta',
    'sigdesk_change_beta', 'sigdesk_problem_beta', 'sigdesk_workflow_beta',
    'sigdesk_notification_beta', 'sigdesk_audit_beta', 'sigdesk_knowledge_beta',
    'sigdesk_rag_beta', 'sigdesk_ai_advisor_beta', 'sigdesk_temporal_beta',
    'sigdesk_temporal_visibility_beta'
)

$quiescedServices = @(
    'edge', 'kong', 'ai_advisor_service', 'rag_buscador', 'rag_indexador',
    'knowledge_service', 'audit_service', 'notification_service',
    'workflow_service', 'problem_service', 'change_service', 'tickets_service',
    'resource_service', 'organization_service', 'temporal', 'kafka'
)
$manifest = [ordered]@{
    created_at = [DateTimeOffset]::UtcNow.ToString('O')
    environment_sha256 = (Get-FileHash -LiteralPath $EnvFile -Algorithm SHA256).Hash.ToLowerInvariant()
    databases = @()
    assets = @()
}
$servicesStopped = $false
try {
    Write-Host 'Entering the backup maintenance window...'
    & docker @compose stop --timeout 90 @quiescedServices
    if ($LASTEXITCODE -ne 0) { throw 'Could not quiesce every beta writer.' }
    $servicesStopped = $true

    foreach ($database in $databases) {
        $containerFile = "/tmp/$database-$stamp.dump"
        & docker @compose exec -T postgres pg_dump --username $adminUser --format custom --file $containerFile $database
        if ($LASTEXITCODE -ne 0) { throw "pg_dump failed for $database" }
        & docker @compose exec -T postgres pg_restore --list $containerFile *> $null
        if ($LASTEXITCODE -ne 0) { throw "pg_restore --list rejected the container dump for $database" }
        $hostFile = Join-Path $destination "$database.dump"
        & docker @compose cp "postgres:$containerFile" $hostFile
        if ($LASTEXITCODE -ne 0) { throw "docker cp failed for $database" }
        & docker @compose exec -T postgres rm -f $containerFile
        if ($LASTEXITCODE -ne 0) { throw "temporary-file cleanup failed for $database" }
        $item = Get-Item -LiteralPath $hostFile
        if ($item.Length -le 0) { throw "Empty backup produced for $database" }
        $hash = (Get-FileHash -LiteralPath $hostFile -Algorithm SHA256).Hash.ToLowerInvariant()
        $manifest.databases += [ordered]@{ database = $database; file = "$database.dump"; bytes = $item.Length; sha256 = $hash }
        Write-Host "[ok] $database ($($item.Length) bytes, $hash)"
    }

    foreach ($asset in @(
        @{ Service = 'object_storage'; ContainerPath = '/data'; Directory = 'object-storage' },
        @{ Service = 'kafka'; ContainerPath = '/var/lib/kafka/data'; Directory = 'kafka-data' }
    )) {
        $hostDirectory = Join-Path $destination $asset.Directory
        New-Item -ItemType Directory -Path $hostDirectory -Force | Out-Null
        & docker @compose cp "$($asset.Service):$($asset.ContainerPath)/." $hostDirectory
        if ($LASTEXITCODE -ne 0) { throw "Could not back up $($asset.Service)." }
        $assetFiles = @(Get-ChildItem -LiteralPath $hostDirectory -File -Recurse)
        foreach ($file in $assetFiles) {
            $relative = $file.FullName.Substring($destination.Length).TrimStart('\', '/') -replace '\\', '/'
            $manifest.assets += [ordered]@{
                service = $asset.Service
                file = $relative
                bytes = $file.Length
                sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
            }
        }
        Write-Host "[ok] $($asset.Service): $($assetFiles.Count) file(s)"
    }

    $manifestPath = Join-Path $destination 'manifest.json'
    [System.IO.File]::WriteAllText(
        $manifestPath,
        ($manifest | ConvertTo-Json -Depth 5),
        [System.Text.UTF8Encoding]::new($false)
    )
    $manifestHash = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
    Set-Content -LiteralPath (Join-Path $destination 'manifest.sha256') -Value "$manifestHash  manifest.json" -Encoding ascii
    Write-Host "BACKUP VERIFIED: $destination" -ForegroundColor Green
    Write-Host 'Copy this directory to storage outside the SIG-DESK server.'
}
finally {
    if ($servicesStopped) {
        Write-Host 'Leaving the maintenance window and restoring the beta stack...'
        & docker @compose up --detach --remove-orphans --wait
        if ($LASTEXITCODE -ne 0) {
            Write-Error 'Backup finished or failed, and the beta stack did not restore cleanly. Operator action is required.'
        }
    }
}
