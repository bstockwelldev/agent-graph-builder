# DEPRECATED: Install moved to agent-context-factory.
# Forwards to factory install-dev-cli.ps1 with this repo as -RepoRoot.

[CmdletBinding()]
param(
    [switch]$SkipPathUpdate
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$FactoryRoot = $null

if ($env:AGENT_CONTEXT_FACTORY_ROOT -and (Test-Path $env:AGENT_CONTEXT_FACTORY_ROOT)) {
    $FactoryRoot = (Resolve-Path $env:AGENT_CONTEXT_FACTORY_ROOT).Path
} else {
    $candidate = Join-Path (Split-Path $RepoRoot -Parent) "agent-context-factory"
    if (Test-Path $candidate) {
        $FactoryRoot = (Resolve-Path $candidate).Path
    }
}

if (-not $FactoryRoot) {
    Write-Error "agent-context-factory not found. Set AGENT_CONTEXT_FACTORY_ROOT or clone next to this repo."
}

Write-Warning "scripts/install-dev-cli.ps1 is deprecated. Use agent-context-factory/scripts/install-dev-cli.ps1"
$installArgs = @("-File", (Join-Path $FactoryRoot "scripts\install-dev-cli.ps1"), "-RepoRoot", $RepoRoot)
if ($SkipPathUpdate) { $installArgs += "-SkipPathUpdate" }
& powershell -NoProfile -ExecutionPolicy Bypass @installArgs
