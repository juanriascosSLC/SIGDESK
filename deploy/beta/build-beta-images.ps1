param(
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-zA-Z0-9._:/-]+$')][string]$Registry,
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-zA-Z0-9._-]+$')][string]$Release,
    [Parameter(Mandatory = $true)][string]$OutputFile,
    [switch]$Push
)

$ErrorActionPreference = 'Stop'
$betaDir = Split-Path -Parent $PSCommandPath
$root = Split-Path -Parent (Split-Path -Parent $betaDir)
$backend = Join-Path $root 'BACKEND'
$frontend = Join-Path $root 'FRONTEND'
$images = [ordered]@{}
if (-not $Push) {
    throw 'Digest locking requires -Push to an approved registry; mutable local tags are intentionally unsupported.'
}

function Build-And-Lock([string]$Variable, [string]$Name, [string]$Context, [string]$Dockerfile, [string[]]$BuildArgs = @()) {
    $tag = "$Registry/$Name`:$Release"
    $args = @('build', '--file', $Dockerfile, '--tag', $tag) + $BuildArgs + @($Context)
    & docker @args
    if ($LASTEXITCODE -ne 0) { throw "Build failed: $Name" }
    & docker push $tag
    if ($LASTEXITCODE -ne 0) { throw "Push failed: $Name" }
    $digest = (& docker image inspect $tag --format '{{index .RepoDigests 0}}').Trim()
    if ($digest -notmatch '@sha256:[0-9a-f]{64}$') { throw "Registry digest unavailable for $Name" }
    $images[$Variable] = $digest
}

$goServices = [ordered]@{
    SIGDESK_ORGANIZATION_IMAGE = 'organization_service'
    SIGDESK_RESOURCE_IMAGE = 'resource_service'
    SIGDESK_TICKETS_IMAGE = 'tickets_service'
    SIGDESK_CHANGE_IMAGE = 'change_service'
    SIGDESK_PROBLEM_IMAGE = 'problem_service'
    SIGDESK_WORKFLOW_IMAGE = 'workflow_service'
    SIGDESK_NOTIFICATION_IMAGE = 'notification_service'
    SIGDESK_AUDIT_IMAGE = 'audit_service'
}
foreach ($entry in $goServices.GetEnumerator()) {
    Build-And-Lock $entry.Key ($entry.Value -replace '_service$', '') $backend (Join-Path $backend 'build/go-service.Dockerfile') @('--build-arg', "SERVICE=$($entry.Value)")
}
Build-And-Lock 'SIGDESK_KNOWLEDGE_IMAGE' 'knowledge' $backend (Join-Path $backend 'knowledge_service/Dockerfile')
Build-And-Lock 'SIGDESK_RAG_IMAGE' 'rag' $backend (Join-Path $backend 'rag_service/Dockerfile')
Build-And-Lock 'SIGDESK_AI_ADVISOR_IMAGE' 'ai-advisor' $backend (Join-Path $backend 'ai_advisor_service/Dockerfile')
Build-And-Lock 'SIGDESK_FRONTEND_IMAGE' 'frontend' $frontend (Join-Path $frontend 'Dockerfile.beta')

$lines = @('# Generated image lock; contains no credentials.')
foreach ($entry in $images.GetEnumerator()) { $lines += "$($entry.Key)=$($entry.Value)" }
[System.IO.File]::WriteAllLines($OutputFile, $lines, [System.Text.UTF8Encoding]::new($false))
Write-Host "Immutable image lock written to $OutputFile" -ForegroundColor Green
