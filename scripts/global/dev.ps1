# Global dev stack dispatcher for polyrepo apps in ~/.ai/dev-registry.json
# Usage:
#   dev ls
#   dev up graph [-d] [--no-build]
#   dev down graph [-v]

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Command = "",

    [Parameter(Position = 1)]
    [string]$App = "",

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$RemainingArgs = @(),

    [Alias("d")]
    [switch]$Detached,

    [Alias("v")]
    [switch]$Volumes,

    [switch]$NoBuild
)

$ErrorActionPreference = "Stop"

function Get-DevRoot {
    if ($env:BSTOCKWELL_DEV_ROOT -and (Test-Path $env:BSTOCKWELL_DEV_ROOT)) {
        return (Resolve-Path $env:BSTOCKWELL_DEV_ROOT).Path
    }

    $candidates = @(
        (Join-Path $env:USERPROFILE "bstockwelldev"),
        (Join-Path $env:USERPROFILE "dev"),
        (Join-Path $env:USERPROFILE "src")
    )

    foreach ($candidate in $candidates) {
        if ((Test-Path $candidate) -and (Test-Path (Join-Path $candidate "AGENTS.md"))) {
            return (Resolve-Path $candidate).Path
        }
    }

    return $null
}

function Get-RegistryCandidates {
    $aiDir = Join-Path $env:USERPROFILE ".ai"
    return @(
        (Join-Path $aiDir "dev-registry.json"),
        (Join-Path $aiDir "spin-registry.json")
    )
}

function Get-RegistryPath {
    foreach ($candidate in (Get-RegistryCandidates)) {
        if (Test-Path $candidate) { return $candidate }
    }

    $devRoot = Get-DevRoot
    if ($devRoot) {
        $devRegistry = Join-Path $devRoot ".ai\dev-registry.json"
        if (Test-Path $devRegistry) { return $devRegistry }
    }

    return (Join-Path $env:USERPROFILE ".ai\dev-registry.json")
}

function Load-Registry {
    $path = Get-RegistryPath
    if (-not (Test-Path $path)) {
        return @{ apps = @{}; registryPath = $path }
    }

    $raw = Get-Content -Raw -Path $path | ConvertFrom-Json
    $apps = @{}
    if ($raw.apps) {
        $raw.apps.PSObject.Properties | ForEach-Object { $apps[$_.Name] = $_.Value }
    } elseif ($raw.PSObject.Properties.Name -contains "graph-builder") {
        $raw.PSObject.Properties | ForEach-Object { $apps[$_.Name] = $_.Value }
    }
    return @{ apps = $apps; registryPath = $path }
}

function Get-AppAliases {
    param($Entry)

    $aliases = @()
    if ($Entry.aliases) {
        $aliases += @($Entry.aliases)
    }
    return $aliases
}

function Resolve-AppKey {
    param(
        [string]$Name,
        $Apps
    )

    if ([string]::IsNullOrWhiteSpace($Name)) { return $null }
    if ($Apps.ContainsKey($Name)) { return $Name }

    foreach ($key in $Apps.Keys) {
        $aliases = Get-AppAliases $Apps[$key]
        if ($aliases -contains $Name) { return $key }
    }

    return $null
}

function Show-AppList {
    param($Apps, [string]$RegistryPath)

    Write-Host "Registered dev stacks ($RegistryPath):" -ForegroundColor Cyan
    if ($Apps.Count -eq 0) {
        Write-Host "  (none - run scripts/install-dev-cli.ps1 from a registered repo)"
        return
    }

    foreach ($key in ($Apps.Keys | Sort-Object)) {
        $entry = $Apps[$key]
        $title = if ($entry.title) { $entry.title } else { $key }
        $url = if ($entry.urls -and $entry.urls.app) { $entry.urls.app } else { "" }
        if ($url) {
            Write-Host "  $key - $title ($url)"
        } else {
            Write-Host "  $key - $title"
        }
    }
}

function Show-Usage {
    Write-Host "Usage:" -ForegroundColor Cyan
    Write-Host "  dev ls"
    Write-Host "  dev up <app> [-d] [--no-build]"
    Write-Host "  dev down <app> [-v]"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  dev up graph -d"
    Write-Host "  dev down graph"
}

function Parse-TrailingFlags {
    param([string[]]$Args)

    foreach ($arg in $Args) {
        switch -Regex ($arg) {
            "^(-d|--detached)$" { $script:Detached = $true }
            "^(-v|--volumes)$" { $script:Volumes = $true }
            "^(--no-build)$" { $script:NoBuild = $true }
            default {
                Write-Error "Unknown flag: $arg"
            }
        }
    }
}

function Invoke-RepoDev {
    param(
        [string]$RepoPath,
        [string]$DevScript,
        [string]$Verb,
        [switch]$DetachedFlag,
        [switch]$VolumesFlag,
        [switch]$NoBuildFlag
    )

    $devArgs = @($Verb)
    if ($DetachedFlag) { $devArgs += "-d" }
    if ($VolumesFlag) { $devArgs += "-v" }
    if ($NoBuildFlag) { $devArgs += "-NoBuild" }

    & powershell -NoProfile -ExecutionPolicy Bypass -File $DevScript @devArgs
    exit $LASTEXITCODE
}

$loaded = Load-Registry
$apps = $loaded.apps
$registryPath = $loaded.registryPath

if ([string]::IsNullOrWhiteSpace($Command)) {
    Show-AppList $apps $registryPath
    exit 0
}

if ($Command -in @("help", "-h", "--help")) {
    Show-Usage
    exit 0
}

if ($Command -eq "ls") {
    Show-AppList $apps $registryPath
    exit 0
}

if ($Command -notin @("up", "down")) {
    Write-Error "Unknown command '$Command'. Expected ls, up, or down."
}

if ([string]::IsNullOrWhiteSpace($App)) {
    Write-Error "App name required for 'dev $Command'. Run 'dev ls' to see registered stacks."
}

Parse-TrailingFlags $RemainingArgs

$appKey = Resolve-AppKey $App $apps
if (-not $appKey) {
    Write-Error "Unknown app '$App'. Run 'dev ls' to see registered stacks."
}

$entry = $apps[$appKey]

$repoPath = $null
if ($entry.repoPath -and (Test-Path $entry.repoPath)) {
    $repoPath = (Resolve-Path $entry.repoPath).Path
} else {
    $devRoot = if ($entry.devRoot -and (Test-Path $entry.devRoot)) {
        (Resolve-Path $entry.devRoot).Path
    } else {
        Get-DevRoot
    }
    if (-not $devRoot) {
        Write-Error "Could not resolve dev root. Set `$env:BSTOCKWELL_DEV_ROOT or re-run scripts/install-dev-cli.ps1 from the repo."
    }
    $repoPath = Join-Path $devRoot $entry.repo
}

if (-not (Test-Path $repoPath)) {
    Write-Error "Repo not found: $repoPath (registry repo='$($entry.repo)')"
}

$devScript = Join-Path $repoPath $entry.devScript
if (-not (Test-Path $devScript)) {
    $legacyScript = Join-Path $repoPath $entry.spinScript
    if (Test-Path $legacyScript) {
        $devScript = $legacyScript
    } else {
        Write-Error "Dev script missing: $devScript"
    }
}

Write-Host "dev $Command $appKey ($($entry.title))..." -ForegroundColor Green
Invoke-RepoDev -RepoPath $repoPath -DevScript $devScript -Verb $Command `
    -DetachedFlag:$Detached -VolumesFlag:$Volumes -NoBuildFlag:$NoBuild
