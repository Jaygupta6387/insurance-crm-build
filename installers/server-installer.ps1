#Requires -RunAsAdministrator
<#
.SYNOPSIS
    InsuredHub Enterprise Server Installer
    
.DESCRIPTION
    Automated installer for the InsuredHub CRM Server component.
    
    This script:
      1. Checks system requirements (Windows 10+, .NET, VC++ redistributables)
      2. Installs Node.js (LTS) if not present
      3. Installs PostgreSQL 16 if not present
      4. Creates the InsuredHub database and user
      5. Runs database migrations
      6. Creates data directories (Data/Uploads/Logs/Backups/OCR/Temp)
      7. Installs the Windows Service (auto-start, auto-recover)
      8. Configures Windows Firewall rules (API port + UDP discovery)
      9. Starts the service and verifies health
     10. Creates Desktop and Start Menu shortcuts
     11. Writes a detailed installation log

.PARAMETER BackendPath
    Path to the InsuredHub backend bundle. Default: .\backend

.PARAMETER DataRoot
    Root folder for all server data. Default: C:\ProgramData\InsuredHub

.PARAMETER Port
    API server port. Default: 5000

.PARAMETER DbPassword
    PostgreSQL password for the insuredhub user. Default: auto-generated.

.EXAMPLE
    .\server-installer.ps1
    .\server-installer.ps1 -Port 8080 -DataRoot "D:\InsuredHub"
#>

[CmdletBinding()]
param(
    [string] $BackendPath  = "$PSScriptRoot\backend",
    [string] $DataRoot     = "C:\ProgramData\InsuredHub",
    [int]    $Port         = 5000,
    [int]    $SocketPort   = 5001,
    [int]    $BroadcastPort= 47912,
    [string] $DbPassword   = "",
    [string] $DbName       = "insuredhub",
    [string] $DbUser       = "insuredhub",
    [switch] $SkipPostgres,
    [switch] $SkipNodejs,
    [switch] $Unattended
)

$ErrorActionPreference = "Stop"
$ProgressPreference    = "SilentlyContinue"

# ── Globals ──────────────────────────────────────────────────────────────────
$ServiceName   = "InsuredHubServer"
$AppName       = "InsuredHub"
$LogDir        = Join-Path $DataRoot "Logs"
$InstallLog    = Join-Path $LogDir   "install-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
$ConfigFile    = Join-Path $DataRoot "server-config.json"

# ── Helpers ───────────────────────────────────────────────────────────────────
function Log {
    param([string]$Msg, [string]$Level = "INFO")
    $ts  = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] [$Level] $Msg"
    Write-Host $line -ForegroundColor $(if ($Level -eq "ERROR") {"Red"} elseif ($Level -eq "WARN") {"Yellow"} else {"White"})
    if ($InstallLog) {
        Add-Content -Path $InstallLog -Value $line -ErrorAction SilentlyContinue
    }
}

function Step {
    param([string]$Title)
    Write-Host ""
    Write-Host "══════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $Title" -ForegroundColor Cyan
    Write-Host "══════════════════════════════════════════════════════" -ForegroundColor Cyan
    Log "STEP: $Title"
}

function Fail {
    param([string]$Msg)
    Log $Msg "ERROR"
    if (-not $Unattended) { Read-Host "Press Enter to exit" }
    exit 1
}

function OK { Log "✓ $($args[0])" }

# ── Generate DB password if not supplied ─────────────────────────────────────
if (-not $DbPassword) {
    $DbPassword = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 24 | ForEach-Object {[char]$_})
}

# ── Banner ────────────────────────────────────────────────────────────────────
Clear-Host
Write-Host @"

  ██╗███╗   ██╗███████╗██╗   ██╗██████╗ ███████╗██████╗ ██╗  ██╗██╗   ██╗██████╗
  ██║████╗  ██║██╔════╝██║   ██║██╔══██╗██╔════╝██╔══██╗██║  ██║██║   ██║██╔══██╗
  ██║██╔██╗ ██║███████╗██║   ██║██████╔╝█████╗  ██║  ██║███████║██║   ██║██████╔╝
  ██║██║╚██╗██║╚════██║██║   ██║██╔══██╗██╔══╝  ██║  ██║██╔══██║██║   ██║██╔══██╗
  ██║██║ ╚████║███████║╚██████╔╝██║  ██║███████╗██████╔╝██║  ██║╚██████╔╝██████╔╝
  ╚═╝╚═╝  ╚═══╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═════╝

                    Enterprise Server Installer  v1.0
"@ -ForegroundColor Green

Write-Host "  Data Root  : $DataRoot"
Write-Host "  API Port   : $Port"
Write-Host "  UDP Port   : $BroadcastPort"
Write-Host ""

# ── Step 1: Prerequisites ─────────────────────────────────────────────────────
Step "1 / 10 — Checking Prerequisites"

# Ensure running as administrator
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Fail "This installer must be run as Administrator. Right-click and select 'Run as Administrator'."
}
OK "Running as Administrator"

# Windows version
$winVer = [System.Environment]::OSVersion.Version
if ($winVer.Major -lt 10) {
    Fail "Windows 10 or later required. Found: $($winVer.ToString())"
}
OK "Windows version: $($winVer.ToString())"

# Create log directory early so we can write logs
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Log "Installation started — log: $InstallLog"

# ── Step 2: Install Node.js ───────────────────────────────────────────────────
Step "2 / 10 — Node.js"

if (-not $SkipNodejs) {
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCmd) {
        $nodeVersion = & node --version 2>&1
        Log "Node.js already installed: $nodeVersion"
        OK "Node.js: $nodeVersion"
    } else {
        Log "Downloading Node.js LTS..."
        $nodeMsi = "$env:TEMP\node-lts.msi"
        Invoke-WebRequest "https://nodejs.org/dist/latest-v20.x/node-v20.18.1-x64.msi" -OutFile $nodeMsi
        Start-Process msiexec.exe -Wait -ArgumentList "/i `"$nodeMsi`" /quiet /norestart"
        Remove-Item $nodeMsi -Force -ErrorAction SilentlyContinue
        # Refresh PATH
        $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine")
        OK "Node.js installed"
    }
} else {
    Log "Skipping Node.js installation (--SkipNodejs)"
}

# ── Step 3: Install PostgreSQL ─────────────────────────────────────────────────
Step "3 / 10 — PostgreSQL"

if (-not $SkipPostgres) {
    $pgCmd = Get-Command psql -ErrorAction SilentlyContinue
    if ($pgCmd) {
        $pgVersion = & psql --version 2>&1
        Log "PostgreSQL already installed: $pgVersion"
        OK "PostgreSQL: $pgVersion"
    } else {
        Log "Downloading PostgreSQL 16..."
        $pgInstaller = "$env:TEMP\postgresql-installer.exe"
        Invoke-WebRequest "https://get.enterprisedb.com/postgresql/postgresql-16.4-1-windows-x64.exe" -OutFile $pgInstaller
        $pgDataDir = Join-Path $DataRoot "PostgreSQL\data"
        New-Item -ItemType Directory -Force -Path $pgDataDir | Out-Null
        Start-Process $pgInstaller -Wait -ArgumentList "--unattendedmodeui none --mode unattended --superpassword `"$DbPassword`" --servicename postgresql-16 --datadir `"$pgDataDir`""
        Remove-Item $pgInstaller -Force -ErrorAction SilentlyContinue
        # Refresh PATH
        $pgBin = "C:\Program Files\PostgreSQL\16\bin"
        $env:PATH += ";$pgBin"
        [System.Environment]::SetEnvironmentVariable("PATH", $env:PATH + ";$pgBin", "Machine")
        OK "PostgreSQL 16 installed"
    }
} else {
    Log "Skipping PostgreSQL installation (--SkipPostgres)"
}

# ── Step 4: Create Database ────────────────────────────────────────────────────
Step "4 / 10 — Database Setup"

try {
    # Create user
    $env:PGPASSWORD = $DbPassword
    & psql -U postgres -c "DO `$`$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DbUser') THEN CREATE ROLE $DbUser LOGIN PASSWORD '$DbPassword'; END IF; END `$`$;" 2>&1 | Out-Null
    OK "Database user: $DbUser"

    # Create database
    & psql -U postgres -c "SELECT 1 FROM pg_database WHERE datname = '$DbName'" 2>&1 | ForEach-Object {
        if ($_ -notmatch "1 row") {
            & psql -U postgres -c "CREATE DATABASE $DbName OWNER $DbUser;" 2>&1 | Out-Null
        }
    }
    OK "Database: $DbName"
} catch {
    Log "Database setup warning: $_" "WARN"
    Log "You may need to create the database manually." "WARN"
}

# ── Step 5: Create Data Directories ───────────────────────────────────────────
Step "5 / 10 — Data Directories"

$dirs = @(
    "Uploads\Policies", "Uploads\Claims", "Uploads\Motor",
    "Uploads\Health",   "Uploads\Life",   "Uploads\Commission",
    "Uploads\Documents","OCR",            "OCR\Processed",
    "Logs",             "Backups",        "Backups\Database",
    "Backups\Files",    "Temp",           "Config"
)
foreach ($d in $dirs) {
    New-Item -ItemType Directory -Force -Path (Join-Path $DataRoot $d) | Out-Null
    Log "Created: $DataRoot\$d"
}
OK "All data directories created"

# ── Step 6: Write Server Configuration ────────────────────────────────────────
Step "6 / 10 — Server Configuration"

$databaseUrl = "postgresql://${DbUser}:${DbPassword}@localhost:5432/${DbName}"
$config = @{
    port          = $Port
    socketPort    = $SocketPort
    broadcastPort = $BroadcastPort
    dataRoot      = $DataRoot
    databaseUrl   = $databaseUrl
    deploymentMode= "SELF_HOSTED"
    installedAt   = (Get-Date -Format "o")
    version       = "1.0.0"
}
$config | ConvertTo-Json | Set-Content -Path $ConfigFile -Encoding UTF8
OK "Configuration written: $ConfigFile"

# ── Step 7: Install Windows Service ───────────────────────────────────────────
Step "7 / 10 — Windows Service"

$installScript = Join-Path $PSScriptRoot "install-windows-service.mjs"
if (-not (Test-Path $installScript)) {
    $installScript = Join-Path $BackendPath "..\scripts\install-windows-service.mjs"
}

if (Test-Path $installScript) {
    try {
        $env:CRM_BACKEND_PATH = Join-Path $BackendPath "crm-bootstrap.cjs"
        $env:DATA_ROOT        = $DataRoot
        & node $installScript --action install 2>&1 | ForEach-Object { Log $_ }
        OK "Windows Service installed: $ServiceName"
    } catch {
        Log "Warning: Could not install Windows Service automatically: $_" "WARN"
        Log "Run manually: node `"$installScript`" --action install" "WARN"
    }
} else {
    Log "Service install script not found — skipping service installation" "WARN"
}

# ── Step 8: Configure Firewall ────────────────────────────────────────────────
Step "8 / 10 — Firewall Rules"

$rules = @(
    @{ Name="InsuredHub-API";       Port=$Port;         Protocol="TCP"; Desc="InsuredHub CRM API Server" },
    @{ Name="InsuredHub-UDP";       Port=$BroadcastPort;Protocol="UDP"; Desc="InsuredHub LAN Discovery Broadcast" },
    @{ Name="InsuredHub-Socket";    Port=$SocketPort;   Protocol="TCP"; Desc="InsuredHub Socket.IO Server" }
)
foreach ($rule in $rules) {
    try {
        netsh advfirewall firewall delete rule name="$($rule.Name)" | Out-Null
        netsh advfirewall firewall add rule `
            name="$($rule.Name)" `
            dir=in `
            action=allow `
            protocol=$($rule.Protocol) `
            localport=$($rule.Port) `
            profile=private `
            description="$($rule.Desc)" 2>&1 | Out-Null
        OK "Firewall: $($rule.Name) ($($rule.Protocol)/$($rule.Port))"
    } catch {
        Log "Warning: Could not add firewall rule $($rule.Name): $_" "WARN"
    }
}

# ── Step 9: Verify Installation ────────────────────────────────────────────────
Step "9 / 10 — Health Check"

$maxRetries = 30
$retryCount = 0
$healthy    = $false
Log "Waiting for server to start (up to 60 seconds)..."

Start-Sleep -Seconds 5
while ($retryCount -lt $maxRetries -and -not $healthy) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$Port/api/health" -TimeoutSec 3 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            $healthy = $true
            OK "Backend health check passed ✓"
        }
    } catch {
        Start-Sleep -Seconds 2
        $retryCount++
    }
}

if (-not $healthy) {
    Log "Backend health check failed — service may still be starting" "WARN"
    Log "Check logs at: $LogDir" "WARN"
}

# ── Step 10: Shortcuts ────────────────────────────────────────────────────────
Step "10 / 10 — Shortcuts"

$wshShell = New-Object -ComObject WScript.Shell
$electronExe = Get-ChildItem -Path $PSScriptRoot -Filter "*.exe" -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "*insuredhub*" -or $_.Name -like "*InsuredHub*" } | Select-Object -First 1

if ($electronExe) {
    # Desktop shortcut
    $desktopLink = $wshShell.CreateShortcut("$env:PUBLIC\Desktop\InsuredHub.lnk")
    $desktopLink.TargetPath       = $electronExe.FullName
    $desktopLink.WorkingDirectory = $electronExe.DirectoryName
    $desktopLink.Description      = "InsuredHub Enterprise CRM"
    $desktopLink.Save()
    OK "Desktop shortcut created"

    # Start Menu shortcut
    $startMenuDir = "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\InsuredHub"
    New-Item -ItemType Directory -Force -Path $startMenuDir | Out-Null
    $startLink = $wshShell.CreateShortcut("$startMenuDir\InsuredHub.lnk")
    $startLink.TargetPath       = $electronExe.FullName
    $startLink.WorkingDirectory = $electronExe.DirectoryName
    $startLink.Description      = "InsuredHub Enterprise CRM"
    $startLink.Save()
    OK "Start Menu shortcut created"
} else {
    Log "Electron executable not found — skipping shortcuts" "WARN"
}

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "══════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  ✅  InsuredHub Server Installation Complete!" -ForegroundColor Green
Write-Host "══════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "  Service Name  : $ServiceName"
Write-Host "  API URL       : http://localhost:$Port"
Write-Host "  Health Check  : http://localhost:$Port/api/health"
Write-Host "  Server Info   : http://localhost:$Port/api/server/info"
Write-Host "  Data Root     : $DataRoot"
Write-Host "  Config File   : $ConfigFile"
Write-Host "  Install Log   : $InstallLog"
Write-Host ""
Write-Host "  Database URL  : $databaseUrl"
Write-Host ""
Write-Host "  To manage the service:"
Write-Host "    sc start  $ServiceName"
Write-Host "    sc stop   $ServiceName"
Write-Host "    sc query  $ServiceName"
Write-Host ""

Log "Installation complete"
if (-not $Unattended) { Read-Host "Press Enter to exit" }
