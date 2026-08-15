@echo off
REM Emergency cleanup when Add/Remove Programs fails (NSIS integrity / cannot close).
REM Right-click → Run as administrator if files remain locked.
setlocal EnableExtensions

echo.
echo === InsureCRM Desktop force uninstall ===
echo.

echo [1/4] Stopping processes and services...
sc stop InsuredHubServer >nul 2>&1
sc stop InsureCRMDesktop >nul 2>&1
net stop InsuredHubServer /y >nul 2>&1

powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match '^(InsureCRM-Desktop|postgres|pg_ctl|initdb|pg_controldata|electron)$' } | Stop-Process -Force -ErrorAction SilentlyContinue" >nul 2>&1

taskkill /F /IM InsureCRM-Desktop.exe /T >nul 2>&1
taskkill /F /IM postgres.exe /T >nul 2>&1
taskkill /F /IM pg_ctl.exe /T >nul 2>&1
taskkill /F /IM initdb.exe /T >nul 2>&1
timeout /t 3 /nobreak >nul

taskkill /F /IM InsureCRM-Desktop.exe /T >nul 2>&1
taskkill /F /IM postgres.exe /T >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/4] Removing install folders...
set "DIRS=%LOCALAPPDATA%\Programs\InsureCRM Desktop"
set "DIRS=%DIRS%;%PROGRAMFILES%\InsureCRM Desktop"
set "DIRS=%DIRS%;%PROGRAMFILES(X86)%\InsureCRM Desktop"
set "DIRS=%DIRS%;%LOCALAPPDATA%\InsureCRM Desktop"

for %%D in ("%LOCALAPPDATA%\Programs\InsureCRM Desktop" "%PROGRAMFILES%\InsureCRM Desktop" "%PROGRAMFILES(X86)%\InsureCRM Desktop") do (
  if exist %%~D (
    echo   Removing %%~D
    attrib -r -s -h "%%~D\*.*" /s /d >nul 2>&1
    rmdir /s /q "%%~D" 2>nul
    if exist "%%~D" (
      powershell -NoProfile -ExecutionPolicy Bypass -Command "Remove-Item -LiteralPath '%%~D' -Recurse -Force -ErrorAction SilentlyContinue"
    )
  )
)

echo [3/4] Clearing role / app data leftovers...
if exist "%APPDATA%\InsureCRM Desktop\install-mode.json" del /f /q "%APPDATA%\InsureCRM Desktop\install-mode.json" >nul 2>&1

echo [4/4] Removing uninstall registry keys...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\com.insurecrm.desktop" /f >nul 2>&1
reg delete "HKCU\Software\InsureCRM Desktop" /f >nul 2>&1
reg delete "HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\com.insurecrm.desktop" /f >nul 2>&1
reg delete "HKLM\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\com.insurecrm.desktop" /f >nul 2>&1

echo.
echo Done. Install InsureCRM-Desktop-1.4.48-Setup.exe (or newer) now.
echo If Windows still lists the app, reboot once then run this bat again.
echo.
pause
