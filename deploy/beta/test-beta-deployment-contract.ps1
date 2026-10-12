$ErrorActionPreference = 'Stop'
$betaDir = Split-Path -Parent $PSCommandPath
$root = Split-Path -Parent (Split-Path -Parent $betaDir)
$scratch = Join-Path $root '.tmp/beta-deployment-contract-test'
if (Test-Path -LiteralPath $scratch) { Remove-Item -LiteralPath $scratch -Recurse -Force }
New-Item -ItemType Directory -Path $scratch -Force | Out-Null

function Write-Utf8NoBom([string]$Path, [string]$Content) {
    [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

function Invoke-Validation([string]$EnvPath, [bool]$ShouldPass, [switch]$LocalAI) {
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $betaDir 'manage-beta.ps1'), 'validate', '-EnvFile', $EnvPath)
        if ($LocalAI) { $arguments += '-LocalAI' }
        $output = & powershell.exe @arguments 2>&1
        $passed = $LASTEXITCODE -eq 0
    }
    finally { $ErrorActionPreference = $previousPreference }
    if ($passed -ne $ShouldPass) {
        throw "Validation expectation failed (expected=$ShouldPass): $($output -join "`n")"
    }
}

try {
    $envPath = Join-Path $scratch 'valid.env'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $betaDir 'new-beta-env.ps1') -Destination $envPath -Force *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Environment generator failed.' }
    foreach ($name in @('cert.pem', 'key.pem', 'ca.pem')) { Write-Utf8NoBom (Join-Path $scratch $name) 'contract-test' }

    $content = [System.IO.File]::ReadAllText($envPath)
    $content = $content.Replace('registry.example.invalid', 'registry.contract.test')
    $content = $content.Replace('sha256:CHANGE_ME', ('sha256:' + ('a' * 64)))
    $content = $content.Replace('SIGTOOLS_ASSETS_READ_TOKEN=CHANGE_ME', 'SIGTOOLS_ASSETS_READ_TOKEN=contract-read-token')
    foreach ($name in @('MICROSOFT_TENANT_ID', 'MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_SENDER')) {
        $content = $content.Replace("$name=CHANGE_ME", "$name=contract-test")
    }
    $content = $content.Replace('OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://CHANGE_ME/v1/traces', 'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://otel.contract.test/v1/traces')
    $content = $content.Replace('TEI_URL=http://tei:80', 'TEI_URL=https://tei.contract.test')
    $content = $content.Replace('RERANKER_URL=http://reranker:80', 'RERANKER_URL=https://reranker.contract.test')
    $content = $content.Replace('LLM_BASE_URL=http://ollama:11434', 'LLM_BASE_URL=https://llm.contract.test')
    $paths = @{
        BETA_TLS_CERT_FILE = Join-Path $scratch 'cert.pem'
        BETA_TLS_KEY_FILE = Join-Path $scratch 'key.pem'
        SIGTOOLS_CA_FILE = Join-Path $scratch 'ca.pem'
        KONG_TLS_CERT_FILE = Join-Path $scratch 'cert.pem'
        KONG_TLS_KEY_FILE = Join-Path $scratch 'key.pem'
        TEMPORAL_TLS_CA_FILE = Join-Path $scratch 'ca.pem'
        TEMPORAL_TLS_CERT_FILE = Join-Path $scratch 'cert.pem'
        TEMPORAL_TLS_KEY_FILE = Join-Path $scratch 'key.pem'
    }
    foreach ($entry in $paths.GetEnumerator()) {
        $content = [regex]::Replace($content, "(?m)^$($entry.Key)=.*$", "$($entry.Key)=$($entry.Value)")
    }
    Write-Utf8NoBom $envPath $content
    Invoke-Validation $envPath $true

    $localAiPath = Join-Path $scratch 'local-ai.env'
    $localAiContent = $content.Replace('TEI_URL=https://tei.contract.test', 'TEI_URL=http://tei:80')
    $localAiContent = $localAiContent.Replace('RERANKER_URL=https://reranker.contract.test', 'RERANKER_URL=http://reranker:80')
    $localAiContent = $localAiContent.Replace('LLM_BASE_URL=https://llm.contract.test', 'LLM_BASE_URL=http://ollama:11434')
    Write-Utf8NoBom $localAiPath $localAiContent
    Invoke-Validation $localAiPath $true -LocalAI

    $mutations = @(
        @{ Name = 'placeholder'; Find = 'SIGTOOLS_ASSETS_READ_TOKEN=contract-read-token'; Replace = 'SIGTOOLS_ASSETS_READ_TOKEN=CHANGE_ME' },
        @{ Name = 'local-db'; Find = 'sigdesk_tickets_beta'; Replace = 'sigdesk_tickets_local' },
        @{ Name = 'e2e-upstream'; Find = 'SIGTOOLS_ASSETS_API_URL=https://api.sig.systems:8091'; Replace = 'SIGTOOLS_ASSETS_API_URL=https://e2e_inventory_server:8091' },
        @{ Name = 'mutable-image'; Find = 'SIGDESK_FRONTEND_IMAGE=registry.contract.test/sigdesk/frontend@sha256:' + ('a' * 64); Replace = 'SIGDESK_FRONTEND_IMAGE=registry.contract.test/sigdesk/frontend:latest' }
    )
    foreach ($mutation in $mutations) {
        $mutated = Join-Path $scratch "$($mutation.Name).env"
        Write-Utf8NoBom $mutated $content.Replace($mutation.Find, $mutation.Replace)
        Invoke-Validation $mutated $false
    }

    $scripts = Get-ChildItem -LiteralPath $betaDir -Filter '*.ps1'
    foreach ($script in $scripts) {
        $tokens = $null
        $errors = $null
        [System.Management.Automation.Language.Parser]::ParseFile($script.FullName, [ref]$tokens, [ref]$errors) | Out-Null
        if ($errors.Count -gt 0) { throw "PowerShell parse failed: $($script.Name)" }
    }
    Write-Host 'BETA DEPLOYMENT CONTRACT: 6/6 scenarios passed' -ForegroundColor Green
}
finally {
    if (Test-Path -LiteralPath $scratch) { Remove-Item -LiteralPath $scratch -Recurse -Force }
}
