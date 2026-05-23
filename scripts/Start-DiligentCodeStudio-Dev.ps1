<#
Starts Diligent Code Studio in Tauri development mode.
This is intended to be launched by Start-DiligentCodeStudio-Dev-Minimized.cmd so the console window starts minimized.
#>

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogFolder = Join-Path $ProjectRoot "logs"
$LogFile = Join-Path $LogFolder "dev-launch.log"

New-Item -ItemType Directory -Path $LogFolder -Force | Out-Null
Set-Location $ProjectRoot

function Write-LaunchLog {
    param([string]$Message)
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Add-Content -Path $LogFile -Value $line
    Write-Host $line
}

Write-LaunchLog "Starting Diligent Code Studio dev mode..."
Write-LaunchLog "Project root: $ProjectRoot"

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    Write-LaunchLog "ERROR: npm.cmd was not found on PATH. Install Node.js LTS and reopen PowerShell."
    Read-Host "Press Enter to close"
    exit 1
}

try {
    & npm.cmd run tauri:dev
    $exitCode = $LASTEXITCODE
    Write-LaunchLog "npm.cmd run tauri:dev exited with code $exitCode"
    if ($exitCode -ne 0) {
        Read-Host "Diligent Code Studio stopped with an error. Press Enter to close"
    }
    exit $exitCode
}
catch {
    Write-LaunchLog "ERROR: $($_.Exception.Message)"
    Read-Host "Diligent Code Studio stopped with an error. Press Enter to close"
    exit 1
}
