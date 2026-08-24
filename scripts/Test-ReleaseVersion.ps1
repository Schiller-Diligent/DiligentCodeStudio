[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$')]
    [string]$ReleaseVersion
)

$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$packageVersion = (Get-Content -LiteralPath (Join-Path $workspace 'package.json') -Raw | ConvertFrom-Json).version
$tauriVersion = (Get-Content -LiteralPath (Join-Path $workspace 'src-tauri\tauri.conf.json') -Raw | ConvertFrom-Json).version
$cargoText = Get-Content -LiteralPath (Join-Path $workspace 'src-tauri\Cargo.toml') -Raw
$cargoMatch = [regex]::Match($cargoText, '(?ms)^\[package\].*?^version\s*=\s*"([^"]+)"')
if (-not $cargoMatch.Success) { throw 'Could not read [package] version from src-tauri/Cargo.toml.' }
$cargoVersion = $cargoMatch.Groups[1].Value

$versions = [ordered]@{
    'workflow input' = $ReleaseVersion
    'package.json' = [string]$packageVersion
    'src-tauri/tauri.conf.json' = [string]$tauriVersion
    'src-tauri/Cargo.toml' = [string]$cargoVersion
}
$mismatches = @($versions.GetEnumerator() | Where-Object { $_.Value -ne $ReleaseVersion })
if ($mismatches.Count -gt 0) {
    $details = ($versions.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ', '
    throw "Release version consistency check failed: $details"
}

Write-Host "PASS: all release version sources match $ReleaseVersion."
