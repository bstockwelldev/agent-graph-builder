# Deprecated: use .\scripts\dev.ps1 instead.
[CmdletBinding()]
param(
    [switch]$Detached,
    [switch]$Down,
    [switch]$NoBuild,
    [switch]$Volumes
)

$devScript = Join-Path $PSScriptRoot "dev.ps1"
$devArgs = if ($Down) { @("down") } else { @("up") }

if ($Detached) { $devArgs += "-d" }
if ($Volumes) { $devArgs += "-v" }
if ($NoBuild) { $devArgs += "-NoBuild" }

Write-Warning "spin-up.ps1 is deprecated; use: .\scripts\dev.ps1 $($devArgs -join ' ')"
& powershell -NoProfile -ExecutionPolicy Bypass -File $devScript @devArgs
exit $LASTEXITCODE
