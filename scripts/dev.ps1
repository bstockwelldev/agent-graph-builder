# Start or stop this repo's Docker Compose stack.
# Usage:
#   .\scripts\dev.ps1 up              # foreground, rebuild
#   .\scripts\dev.ps1 up -d           # detached
#   .\scripts\dev.ps1 up --no-build   # skip image rebuild
#   .\scripts\dev.ps1 down            # stop stack
#   .\scripts\dev.ps1 down -v         # stop and remove graph volume

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet("up", "down")]
    [string]$Command = "up",

    [Alias("d")]
    [switch]$Detached,

    [Alias("v")]
    [switch]$Volumes,

    [switch]$NoBuild
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker is not on PATH. Install Docker Desktop and retry."
}

function Invoke-Compose {
    param([string[]]$ComposeArgs)
    Write-Host ">> docker $($ComposeArgs -join ' ')  (cwd: $RepoRoot)" -ForegroundColor Cyan
    & docker @ComposeArgs
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

if ($Command -eq "down") {
    $args = @("compose", "down")
    if ($Volumes) { $args += "-v" }
    Invoke-Compose $args
    exit 0
}

$upArgs = @("compose", "up")
if (-not $NoBuild) { $upArgs += "--build" }
if ($Detached) { $upArgs += "-d" }

Write-Host ""
Write-Host "Agent Graph Builder POC" -ForegroundColor Green
Write-Host "  App:  http://localhost:5173"
Write-Host "  API:  http://localhost:8000"
Write-Host ""

Invoke-Compose $upArgs

if ($Detached) {
    Write-Host "Stack started in the background. Stop with: .\scripts\dev.ps1 down" -ForegroundColor Yellow
}
