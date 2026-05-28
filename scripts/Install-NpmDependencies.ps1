<#
.SYNOPSIS
  Installs npm dependencies for Diligent Code Studio with CI-safe retry logic.

.DESCRIPTION
  GitHub-hosted Windows runners can occasionally hit transient npm network
  timeouts or Windows file-lock cleanup warnings. This script forces the public
  npm registry, applies conservative fetch retry settings, and retries npm ci
  after verifying the npm cache and cleaning node_modules.
#>

param(
    [int]$MaxAttempts = 3
)

$ErrorActionPreference = 'Stop'

function Invoke-NpmConfig {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    & npm @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "npm $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
    }
}


function Assert-PackageLockUsesPublicRegistry {
    if (Test-Path "package-lock.json") {
        $badRegistryMatches = Select-String -Path "package-lock.json" -Pattern "packages\.applied-caas-gateway|internal\.api\.openai|artifactory/api/npm" -SimpleMatch:$false -ErrorAction SilentlyContinue
        if ($badRegistryMatches) {
            Write-Error "package-lock.json contains internal/private npm registry URLs. Regenerate or patch package-lock.json so all resolved tarball URLs use https://registry.npmjs.org/."
            $badRegistryMatches | Select-Object -First 10 | ForEach-Object { Write-Error $_.Line }
            throw "Refusing to run npm ci with internal/private registry URLs in package-lock.json."
        }
    }
}

function Remove-NodeModulesSafely {
    if (Test-Path "node_modules") {
        Write-Host "Removing existing node_modules folder..."
        for ($i = 1; $i -le 3; $i++) {
            try {
                Remove-Item "node_modules" -Recurse -Force -ErrorAction Stop
                return
            }
            catch {
                Write-Warning "node_modules cleanup attempt $i failed: $($_.Exception.Message)"
                Start-Sleep -Seconds (5 * $i)
            }
        }

        Write-Warning "Continuing after node_modules cleanup warnings. npm ci will attempt a clean install."
    }
}

Write-Host "Configuring npm for reliable CI installs..."
Invoke-NpmConfig @('config', 'set', 'registry', 'https://registry.npmjs.org/')
Invoke-NpmConfig @('config', 'set', 'fetch-retries', '5')
Invoke-NpmConfig @('config', 'set', 'fetch-retry-mintimeout', '20000')
Invoke-NpmConfig @('config', 'set', 'fetch-retry-maxtimeout', '120000')
Invoke-NpmConfig @('config', 'set', 'fetch-timeout', '120000')
Invoke-NpmConfig @('config', 'set', 'fund', 'false')
Invoke-NpmConfig @('config', 'set', 'update-notifier', 'false')

Write-Host "npm registry:"
Invoke-NpmConfig @('config', 'get', 'registry')

Assert-PackageLockUsesPublicRegistry

for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    Write-Host "npm ci attempt $attempt of $MaxAttempts..."

    if ($attempt -gt 1) {
        Write-Host "Verifying npm cache before retry..."
        & npm cache verify
        Remove-NodeModulesSafely
    }

    & npm ci --no-audit --no-fund
    if ($LASTEXITCODE -eq 0) {
        Write-Host "npm dependencies installed successfully."
        exit 0
    }

    Write-Warning "npm ci failed with exit code $LASTEXITCODE."

    if ($attempt -lt $MaxAttempts) {
        $delay = 15 * $attempt
        Write-Host "Waiting $delay seconds before retry..."
        Start-Sleep -Seconds $delay
    }
}

throw "npm ci failed after $MaxAttempts attempts."
