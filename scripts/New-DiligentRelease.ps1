<#
.SYNOPSIS
  Builds Diligent Code Studio and creates SHA-256 checksums for release artifacts.

.EXAMPLE
  PowerShell -ExecutionPolicy Bypass -File .\scripts\New-DiligentRelease.ps1
#>
[CmdletBinding()]
param(
    [string]$ProjectRoot = (Resolve-Path "$PSScriptRoot\..").Path
)

$ErrorActionPreference = 'Stop'

Write-Host "Diligent Code Studio Release Build" -ForegroundColor Cyan
Write-Host "ProjectRoot: $ProjectRoot"

Push-Location $ProjectRoot
try {
    if (Test-Path ".\package-lock.json") { npm.cmd ci } else { npm.cmd install }
    npm.cmd run tauri:build

    $BundleRoot = Join-Path $ProjectRoot "src-tauri\target\release\bundle"
    $Manifest = Join-Path $ProjectRoot "DiligentCodeStudio_SHA256SUMS.txt"

    if (Test-Path $Manifest) { Remove-Item $Manifest -Force }

    Get-ChildItem $BundleRoot -Recurse -File |
        Where-Object { $_.Extension -in '.exe', '.msi', '.zip', '.msix', '.appx' } |
        ForEach-Object {
            $hash = Get-FileHash -Algorithm SHA256 -Path $_.FullName
            "{0}  {1}" -f $hash.Hash.ToLowerInvariant(), $_.FullName.Replace($ProjectRoot, '').TrimStart('\') |
                Add-Content -Path $Manifest
        }

    Write-Host "Release checksum manifest created:" -ForegroundColor Green
    Write-Host $Manifest
}
finally {
    Pop-Location
}
