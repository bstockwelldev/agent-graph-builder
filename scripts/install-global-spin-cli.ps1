# Deprecated: use scripts/install-dev-cli.ps1 instead.
Write-Warning "install-global-spin-cli.ps1 is deprecated; running install-dev-cli.ps1"
& (Join-Path $PSScriptRoot "install-dev-cli.ps1") @PSBoundParameters
