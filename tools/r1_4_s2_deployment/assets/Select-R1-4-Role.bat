@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Select WorkBuddy R1-4 test role

set "DEPLOY_ROOT=%~dp0"
set "ENTRY_DIR=!DEPLOY_ROOT!entry"
set "STATE_FILE=!ENTRY_DIR!\selected-role.ini"

if not "%~2"=="" goto invalid_args
if not exist "!ENTRY_DIR!" mkdir "!ENTRY_DIR!" || goto create_failed
tasklist /FI "IMAGENAME eq WorkBuddy.exe" /NH | findstr /I /B /C:"WorkBuddy.exe" >nul
if not errorlevel 1 goto app_running

set "SELECTED_ROLE="
if /I "%~1"=="GPT" set "SELECTED_ROLE=GPT"
if /I "%~1"=="USER" set "SELECTED_ROLE=USER"
if defined SELECTED_ROLE goto resolve_date
if not "%~1"=="" goto invalid_args

echo ============================================
echo  WorkBuddy R1-4 QA2/S2 role selector
echo  This selector does not start WorkBuddy.
echo ============================================
echo  [1] R1-4 / GPT
echo  [2] R1-4 / USER
echo.
choice /C 12 /N /M "Select role: "
if errorlevel 2 set "SELECTED_ROLE=USER"
if errorlevel 1 if not defined SELECTED_ROLE set "SELECTED_ROLE=GPT"
if not defined SELECTED_ROLE goto invalid_choice

:resolve_date
set "RUN_DATE="
for /f "usebackq delims=" %%D in (`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "(Get-Date).ToString('yyyyMMdd')"`) do set "RUN_DATE=%%D"
if not defined RUN_DATE goto date_failed

set "REG_FILE=!ENTRY_DIR!\registered-R1-4-!SELECTED_ROLE!.ini"
set "REG_DATE="
if exist "!REG_FILE!" for /f "usebackq eol=# tokens=1,* delims==" %%A in ("!REG_FILE!") do if /I "%%A"=="DATE" set "REG_DATE=%%B"

set "REUSED=0"
if exist "!REG_FILE!" (
  if not defined REG_DATE goto invalid_registry
  echo(!REG_DATE!| findstr /R /X "[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]" >nul || goto invalid_registry
  set "USE_DATE=!REG_DATE!"
  set "DATA_DIR=!DEPLOY_ROOT!data\!SELECTED_ROLE!-!USE_DATE!\userData"
  if not exist "!DATA_DIR!" goto missing_registered_data
  set "REUSED=1"
) else (
  set "USE_DATE=!RUN_DATE!"
  set "DATA_DIR=!DEPLOY_ROOT!data\!SELECTED_ROLE!-!USE_DATE!\userData"
)
set "SELECTED_PREFIX=v0.3-R1-4-!SELECTED_ROLE!-!USE_DATE!"

if "!REUSED!"=="0" (
  if exist "!DATA_DIR!" goto unregistered_data_exists
  mkdir "!DATA_DIR!" || goto create_failed
  (
    echo # R1-4 per-role registered date; maintained by this selector only.
    echo PLAN=R1-4
    echo ROLE=!SELECTED_ROLE!
    echo DATE=!USE_DATE!
    echo PREFIX=!SELECTED_PREFIX!
  ) > "!REG_FILE!"
)

(
  echo # R1-4 one-role selection; do not edit by hand.
  echo PLAN=R1-4
  echo ROLE=!SELECTED_ROLE!
  echo DATE=!USE_DATE!
  echo PREFIX=!SELECTED_PREFIX!
  echo DATA=!DATA_DIR!
  echo SELECTED_AT=%date% %time%
) > "!STATE_FILE!"

echo.
echo Selected: R1-4 / !SELECTED_ROLE!
if "!REUSED!"=="1" (
  echo Reusing registered date copy: !USE_DATE! ^(same plan+role, keep data^)
) else (
  echo Registered new date copy:     !USE_DATE!
)
echo Prefix: !SELECTED_PREFIX!
echo Data:   !DATA_DIR!
echo.
echo Now run the R1-4 launcher in this directory.
if /I not "!R1_4_NO_PAUSE!"=="1" pause
endlocal & exit /b 0

:invalid_args
echo [ERROR] Usage: select with no argument, or pass exactly GPT or USER for controlled preflight.
if /I not "!R1_4_NO_PAUSE!"=="1" pause
endlocal & exit /b 2

:app_running
echo [ERROR] A WorkBuddy process is running. Close it before switching R1-4 roles.
if /I not "!R1_4_NO_PAUSE!"=="1" pause
endlocal & exit /b 4

:date_failed
echo [ERROR] Could not determine the local test date.
if /I not "!R1_4_NO_PAUSE!"=="1" pause
endlocal & exit /b 5

:invalid_choice
echo [ERROR] No valid role was selected.
if /I not "!R1_4_NO_PAUSE!"=="1" pause
endlocal & exit /b 6

:invalid_registry
echo [ERROR] The existing role registry is invalid. Stop and preserve it for review.
if /I not "!R1_4_NO_PAUSE!"=="1" pause
endlocal & exit /b 7

:missing_registered_data
echo [ERROR] The registered role data directory is missing. Refusing to create a replacement date copy.
echo         Registry: !REG_FILE!
echo         Data:     !DATA_DIR!
if /I not "!R1_4_NO_PAUSE!"=="1" pause
endlocal & exit /b 8

:unregistered_data_exists
echo [ERROR] An unregistered R1-4 data directory already exists. Refusing to reuse or overwrite it.
echo         Data: !DATA_DIR!
if /I not "!R1_4_NO_PAUSE!"=="1" pause
endlocal & exit /b 9

:create_failed
echo [ERROR] Could not create the isolated R1-4 role data directory.
if /I not "!R1_4_NO_PAUSE!"=="1" pause
endlocal & exit /b 10
