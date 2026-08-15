; InsureCRM Desktop — NSIS hooks
; Keep PowerShell out of macros: NSIS treats $_ as variables and breaks makensis.
; taskkill + sc stop are enough for install/uninstall force-stop.

!macro customHeader
  CRCCheck off
!macroend

!macro insurecrmForceStop
  DetailPrint "Stopping InsureCRM Desktop and PostgreSQL..."

  nsExec::ExecToLog '"$SYSDIR\cmd.exe" /C sc stop InsuredHubServer >nul 2>&1'
  nsExec::ExecToLog '"$SYSDIR\cmd.exe" /C net stop InsuredHubServer /y >nul 2>&1'
  nsExec::ExecToLog '"$SYSDIR\cmd.exe" /C sc stop InsureCRMDesktop >nul 2>&1'

  nsExec::ExecToLog '"$SYSDIR\cmd.exe" /C taskkill /F /IM InsureCRM-Desktop.exe /T >nul 2>&1'
  nsExec::ExecToLog '"$SYSDIR\cmd.exe" /C taskkill /F /IM postgres.exe /T >nul 2>&1'
  nsExec::ExecToLog '"$SYSDIR\cmd.exe" /C taskkill /F /IM pg_ctl.exe /T >nul 2>&1'
  nsExec::ExecToLog '"$SYSDIR\cmd.exe" /C taskkill /F /IM initdb.exe /T >nul 2>&1'
  nsExec::ExecToLog '"$SYSDIR\cmd.exe" /C taskkill /F /IM pg_controldata.exe /T >nul 2>&1'
  nsExec::ExecToLog '"$SYSDIR\cmd.exe" /C taskkill /F /IM electron.exe /T >nul 2>&1'
  Sleep 2000

  nsExec::ExecToLog '"$SYSDIR\cmd.exe" /C taskkill /F /IM InsureCRM-Desktop.exe /T >nul 2>&1'
  nsExec::ExecToLog '"$SYSDIR\cmd.exe" /C taskkill /F /IM postgres.exe /T >nul 2>&1'
  nsExec::ExecToLog '"$SYSDIR\cmd.exe" /C taskkill /F /IM pg_ctl.exe /T >nul 2>&1'
  Sleep 2000

  nsExec::ExecToLog '"$SYSDIR\cmd.exe" /C taskkill /F /IM InsureCRM-Desktop.exe /T >nul 2>&1'
  nsExec::ExecToLog '"$SYSDIR\cmd.exe" /C taskkill /F /IM postgres.exe /T >nul 2>&1'
  Sleep 1500
!macroend

!macro customCheckAppRunning
  !insertmacro insurecrmForceStop
!macroend

!macro customInit
  !insertmacro insurecrmForceStop
!macroend

!macro customUnInit
  !insertmacro insurecrmForceStop
!macroend

!macro customUnInstall
  !insertmacro insurecrmForceStop
  Delete "$APPDATA\InsureCRM Desktop\install-mode.json"
!macroend

!macro customUnInstallCheck
  ClearErrors
  StrCpy $R0 0
!macroend

!macro customUnInstallCheckCurrentUser
  ClearErrors
  StrCpy $R0 0
!macroend
