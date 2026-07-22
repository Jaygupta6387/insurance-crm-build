#Requires -RunAsAdministrator
<#
.SYNOPSIS
    InsuredHub Enterprise Client Installer
    
.DESCRIPTION
    Installs ONLY the Electron client component on employee workstations.
    
    This installer does NOT install:
      - PostgreSQL
      - Node.js backend
      - Windows Service
      - OCR engine
      - Storage engine
      
    It only installs:
      - The Electron / Frontend application
      - Desktop and Start Menu shortcuts
      - Optional: auto-start on login (for auto-discovery)

.PARAMETER ServerAddress
    Pre-configure the server address so employees don't need to manually enter it.
    Format: 192.168.1.10:5000

.PARAMETER AutoStart
    If specified, configures Electron to start automatically at login.

.EXAMPLE
    .\client-installer.ps1 -ServerAddress "192.168.1.10:5000"
    .\client-installer.ps1 -AutoStart
#>

[CmdletBinding()]
param(
    [string] $ServerAddress = "",
    [switch] $AutoStart,
    [switch] $Unattended
)

$ErrorActionPreference = "Stop"

$AppName      = "InsuredHub"
$ConfigRoot   = Join-Path $env:APPDATA "InsuredHub"
$ConfigFile   = Join-Path $ConfigRoot  "client-config.json"
$LogDir       = Join-Path $ConfigRoot  "logs"
$InstallLog   = Join-Path $LogDir      "client-install-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

function Log {
    param([string]$Msg, [string]$Level = "INFO")
    $ts   = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] [$Level] $Msg"
    Write-Host $line
    Add-Content -Path $InstallLog -Value $line -ErrorAction SilentlyContinue
}

function OK { Log "✓ $($args[0])" }

# Ensure config directories exist
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

Clear-Host
Write-Host ""
Write-Host "  InsuredHub Client Installer" -ForegroundColor Cyan
Write-Host "  ──────────────────────────────────────────────────"
Write-Host ""

# ── Step 1: Write client config ─────────────────────────────────────────────
Log "Writing client configuration..."

$clientConfig = @{
    serverAddress   = $ServerAddress
    deploymentMode  = "CLIENT"
    autoDiscover    = ($ServerAddress -eq "")
    installedAt     = (Get-Date -Format "o")
    version         = "1.0.0"
}
$clientConfig | ConvertTo-Json | Set-Content -Path $ConfigFile -Encoding UTF8
OK "Config written: $ConfigFile"

# ── Step 2: Find Electron executable ────────────────────────────────────────
$electronExe = Get-ChildItem -Path $PSScriptRoot -Filter "InsuredHub*.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $electronExe) {
    $electronExe = Get-ChildItem -Path $PSScriptRoot -Filter "*.exe" -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notmatch "uninstall" } | Select-Object -First 1
}

if (-not $electronExe) {
    Log "Electron executable not found in $PSScriptRoot — skipping shortcuts" "WARN"
} else {
    OK "Found: $($electronExe.FullName)"

    # ── Desktop shortcut ──────────────────────────────────────────────────────
    $wsh     = New-Object -ComObject WScript.Shell
    $deskLnk = $wsh.CreateShortcut("$env:USERPROFILE\Desktop\InsuredHub.lnk")
    $deskLnk.TargetPath       = $electronExe.FullName
    $deskLnk.WorkingDirectory = $electronExe.DirectoryName
    $deskLnk.Description      = "InsuredHub CRM"
    $deskLnk.Save()
    OK "Desktop shortcut created"

    # ── Start Menu ────────────────────────────────────────────────────────────
    $menuDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\InsuredHub"
    New-Item -ItemType Directory -Force -Path $menuDir | Out-Null
    $menuLnk = $wsh.CreateShortcut("$menuDir\InsuredHub.lnk")
    $menuLnk.TargetPath       = $electronExe.FullName
    $menuLnk.WorkingDirectory = $electronExe.DirectoryName
    $menuLnk.Save()
    OK "Start Menu shortcut created"

    # ── Auto-start at login ───────────────────────────────────────────────────
    if ($AutoStart) {
        $runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
        Set-ItemProperty -Path $runKey -Name "InsuredHub" -Value "`"$($electronExe.FullName)`""
        OK "Auto-start at login enabled"
    }
}

# ── Summary ──────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ✅  InsuredHub Client installed successfully!" -ForegroundColor Green
Write-Host ""
if ($ServerAddress) {
    Write-Host "  Server    : $ServerAddress"
} else {
    Write-Host "  Server    : Auto-discover via LAN broadcast"
}
Write-Host "  Config    : $ConfigFile"
Write-Host "  Log       : $InstallLog"
Write-Host ""
Log "Client installation complete"
if (-not $Unattended) { Read-Host "Press Enter to exit" }
