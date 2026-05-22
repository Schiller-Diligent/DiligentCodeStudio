[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$VersionTag,

    [switch]$SkipStatusCheck
)

$ErrorActionPreference = 'Stop'

if ($VersionTag -notmatch '^v\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$') {
    throw "VersionTag must look like v0.3.6 or v1.0.0-beta.1"
}

if (-not $SkipStatusCheck) {
    $status = git status --porcelain
    if ($status) {
        Write-Host "Git working tree is not clean:" -ForegroundColor Yellow
        $status | ForEach-Object { Write-Host $_ }
        throw "Commit or stash changes before creating a release tag."
    }
}

Write-Host "Creating tag $VersionTag..." -ForegroundColor Cyan
git tag $VersionTag

Write-Host "Pushing main and $VersionTag to origin..." -ForegroundColor Cyan
git push origin main
git push origin $VersionTag

Write-Host "GitHub Actions should now build Windows, macOS, and Linux artifacts." -ForegroundColor Green
Write-Host "Open GitHub > Actions > Build Diligent Code Studio Cross-Platform to monitor progress."
