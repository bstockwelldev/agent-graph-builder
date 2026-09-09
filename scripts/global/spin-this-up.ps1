# Legacy wrapper for spin-this-up -> dev
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$App = "",

    [switch]$Detached,
    [switch]$Down,
    [switch]$NoBuild,
    [switch]$Volumes,
    [switch]$List
)

$devScript = Join-Path $PSScriptRoot "dev.ps1"
$devArgs = @()

if ($List -or [string]::IsNullOrWhiteSpace($App)) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $devScript ls
    if ([string]::IsNullOrWhiteSpace($App)) { exit $LASTEXITCODE }
}

if ($Down) {
    $devArgs = @("down", $App)
    if ($Volumes) { $devArgs += "-v" }
} else {
    $devArgs = @("up", $App)
    if ($Detached) { $devArgs += "-d" }
    if ($NoBuild) { $devArgs += "--no-build" }
}

& powershell -NoProfile -ExecutionPolicy Bypass -File $devScript @devArgs
exit $LASTEXITCODE
