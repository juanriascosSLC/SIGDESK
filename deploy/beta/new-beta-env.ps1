param(
    [Parameter(Mandatory = $true)][string]$Destination,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$betaDir = Split-Path -Parent $PSCommandPath
$template = Join-Path $betaDir 'beta.env.example'
if ((Test-Path -LiteralPath $Destination) -and -not $Force) {
    throw "Destination already exists: $Destination"
}

function New-Secret([int]$Bytes = 32) {
    $buffer = [byte[]]::new($Bytes)
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
    return ([BitConverter]::ToString($buffer) -replace '-', '').ToLowerInvariant()
}

$secretNames = @(
    'JWT_SECRET', 'ORGANIZATION_INTERNAL_SECRET', 'RESOURCE_INTERNAL_SECRET',
    'TICKETS_INTERNAL_SECRET', 'CHANGE_INTERNAL_SECRET', 'POSTGRES_ADMIN_PASSWORD',
    'ORGANIZATION_DB_PASSWORD', 'RESOURCE_DB_PASSWORD', 'TICKETS_DB_PASSWORD',
    'CHANGE_DB_PASSWORD', 'PROBLEM_DB_PASSWORD', 'WORKFLOW_DB_PASSWORD',
    'NOTIFICATION_DB_PASSWORD', 'AUDIT_DB_PASSWORD', 'KNOWLEDGE_DB_PASSWORD',
    'RAG_DB_PASSWORD', 'AI_ADVISOR_DB_PASSWORD', 'TEMPORAL_DB_PASSWORD',
    'OBJECT_STORAGE_ACCESS_KEY', 'OBJECT_STORAGE_SECRET_KEY',
    'KNOWLEDGE_S3_ACCESS_KEY', 'KNOWLEDGE_S3_SECRET_KEY',
    'RAG_S3_ACCESS_KEY', 'RAG_S3_SECRET_KEY'
)
$content = Get-Content -LiteralPath $template -Raw
foreach ($name in $secretNames) {
    $content = [regex]::Replace(
        $content,
        "(?m)^$([regex]::Escape($name))=CHANGE_ME$",
        "$name=$(New-Secret)"
    )
}
$clusterBytes = [byte[]]::new(16)
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($clusterBytes) } finally { $rng.Dispose() }
$clusterId = [Convert]::ToBase64String($clusterBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
$content = [regex]::Replace($content, '(?m)^KAFKA_CLUSTER_ID=CHANGE_ME$', "KAFKA_CLUSTER_ID=$clusterId")

$parent = Split-Path -Parent $Destination
if ($parent) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
[System.IO.File]::WriteAllText($Destination, $content, [System.Text.UTF8Encoding]::new($false))
$runningOnWindows = ($PSVersionTable.PSVersion.Major -lt 6) -or $IsWindows
if (-not $runningOnWindows) { & chmod 600 -- $Destination }
Write-Host "Created protected configuration template: $Destination" -ForegroundColor Green
Write-Host 'Image digests, certificates, SIGTools, Microsoft Graph and AI settings still require operator input.'
