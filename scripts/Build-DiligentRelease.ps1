[CmdletBinding()]
param(
    [string]$ProjectRoot = (Resolve-Path "$PSScriptRoot\..").Path,
    [switch]$SkipTauriBuild
)

$ErrorActionPreference = 'Stop'

function Write-Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

Write-Step "Project root: $ProjectRoot"
Set-Location $ProjectRoot

if (-not (Test-Path ".\package.json")) {
    throw "package.json was not found in $ProjectRoot"
}

Write-Step "Running npm build"
npm.cmd run build

if (-not $SkipTauriBuild) {
    Write-Step "Running Tauri build"
    npm.cmd run tauri:build
}

$package = Get-Content ".\package.json" -Raw | ConvertFrom-Json
$version = $package.version
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$bundleRoot = Join-Path $ProjectRoot "src-tauri\target\release\bundle"
$releaseRoot = Join-Path $ProjectRoot "releases"
$releaseDir = Join-Path $releaseRoot "DiligentCodeStudio_v$version`_$stamp"

Write-Step "Creating release folder"
New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null

$artifacts = @()
if (Test-Path $bundleRoot) {
    $artifacts = Get-ChildItem $bundleRoot -Recurse -File -Include *.exe,*.msi,*.zip,*.msix,*.appx,*.dmg,*.deb,*.rpm
}

if ($artifacts.Count -eq 0) {
    Write-Warning "No installer artifacts were found under $bundleRoot"
} else {
    foreach ($artifact in $artifacts) {
        Copy-Item $artifact.FullName -Destination (Join-Path $releaseDir $artifact.Name) -Force
    }
}

Write-Step "Writing release notes"
@"
# Diligent Code Studio v$version

## Release Notes

- Built with the Diligent Code Studio release script.
- SHA-256 checksums are included in SHA256SUMS.txt.
"@ | Set-Content (Join-Path $releaseDir "RELEASE_NOTES.md") -Encoding UTF8

Write-Step "Generating SHA-256 checksums"
$checksumPath = Join-Path $releaseDir "SHA256SUMS.txt"
$releaseFiles = Get-ChildItem $releaseDir -File | Where-Object { $_.Name -ne "SHA256SUMS.txt" -and $_.Name -ne "RELEASE_NOTES.md" }
if ($releaseFiles.Count -eq 0) {
    "No installer artifacts were available when this checksum file was generated." | Set-Content $checksumPath -Encoding UTF8
} else {
    $lines = foreach ($file in $releaseFiles) {
        $hash = Get-FileHash -Algorithm SHA256 -Path $file.FullName
        "$($hash.Hash.ToLowerInvariant())  $($file.Name)"
    }
    $lines | Set-Content $checksumPath -Encoding UTF8
}

Write-Step "Creating ZIP package"
$zipPath = Join-Path $releaseRoot "DiligentCodeStudio_v$version`_$stamp.zip"
Compress-Archive -Path (Join-Path $releaseDir "*") -DestinationPath $zipPath -Force

Write-Host "`nRelease folder: $releaseDir" -ForegroundColor Green
Write-Host "ZIP package:    $zipPath" -ForegroundColor Green
Write-Host "Checksums:      $checksumPath" -ForegroundColor Green
