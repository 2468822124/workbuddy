@echo off
setlocal EnableExtensions EnableDelayedExpansion
title WorkBuddy v0.3 R1-4 QA2/S2 user test

set "DEPLOY_ROOT=%~dp0"
set "ENTRY_DIR=!DEPLOY_ROOT!entry"
set "STATE_FILE=!ENTRY_DIR!\selected-role.ini"
set "LOG_FILE=!ENTRY_DIR!\R1-4-entry.log"
set "WORKBUDDY_APP=!DEPLOY_ROOT!app\WorkBuddy.exe"
set "S2_MANIFEST=E:\workbuddy-snapshots\v0.3.0-qa.2-r1-fix2-s2\S2-manifest.sha256"
set "EXPECTED_EXE_SHA256=D952D488A0878D0A8B9BC65E5063FFFFD4A7EDE58C99C2981407B96E1DDC7577"
set "EXPECTED_MANIFEST_SHA256=316D3CF6318ED5F268375DC24C8CBA0EF0AEF8B6C7B11D17FE2C9841ACEAD5A0"

if not "%~1"=="" goto invalid_args
if not exist "!WORKBUDDY_APP!" goto missing_app
if not exist "!STATE_FILE!" goto missing_selection

set "SELECTED_PLAN="
set "SELECTED_ROLE="
set "SELECTED_DATE="
set "SELECTED_PREFIX="
set "SELECTED_DATA="
for /f "usebackq eol=# tokens=1,* delims==" %%A in ("!STATE_FILE!") do (
  if /I "%%A"=="PLAN" set "SELECTED_PLAN=%%B"
  if /I "%%A"=="ROLE" set "SELECTED_ROLE=%%B"
  if /I "%%A"=="DATE" set "SELECTED_DATE=%%B"
  if /I "%%A"=="PREFIX" set "SELECTED_PREFIX=%%B"
  if /I "%%A"=="DATA" set "SELECTED_DATA=%%B"
)

if /I not "!SELECTED_PLAN!"=="R1-4" goto invalid_selection
if /I "!SELECTED_ROLE!"=="GPT" goto map_role
if /I "!SELECTED_ROLE!"=="USER" goto map_role
goto invalid_selection

:map_role
if not defined SELECTED_DATE goto invalid_selection
echo(!SELECTED_DATE!| findstr /R /X "[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]" >nul || goto invalid_selection
set "EXPECTED_PREFIX=v0.3-R1-4-!SELECTED_ROLE!-!SELECTED_DATE!"
set "EXPECTED_DATA=!DEPLOY_ROOT!data\!SELECTED_ROLE!-!SELECTED_DATE!\userData"
if /I not "!SELECTED_PREFIX!"=="!EXPECTED_PREFIX!" goto invalid_selection
if /I not "!SELECTED_DATA!"=="!EXPECTED_DATA!" goto invalid_selection
set "WORKBUDDY_USER_DATA=!EXPECTED_DATA!"
set "REG_FILE=!ENTRY_DIR!\registered-R1-4-!SELECTED_ROLE!.ini"
if not exist "!REG_FILE!" goto invalid_selection

set "REG_PLAN="
set "REG_ROLE="
set "REG_DATE="
set "REG_PREFIX="
for /f "usebackq eol=# tokens=1,* delims==" %%A in ("!REG_FILE!") do (
  if /I "%%A"=="PLAN" set "REG_PLAN=%%B"
  if /I "%%A"=="ROLE" set "REG_ROLE=%%B"
  if /I "%%A"=="DATE" set "REG_DATE=%%B"
  if /I "%%A"=="PREFIX" set "REG_PREFIX=%%B"
)
if /I not "!REG_PLAN!"=="R1-4" goto invalid_selection
if /I not "!REG_ROLE!"=="!SELECTED_ROLE!" goto invalid_selection
if /I not "!REG_DATE!"=="!SELECTED_DATE!" goto invalid_selection
if /I not "!REG_PREFIX!"=="!SELECTED_PREFIX!" goto invalid_selection
if not exist "!WORKBUDDY_USER_DATA!" goto missing_data

tasklist /FI "IMAGENAME eq WorkBuddy.exe" /NH | findstr /I /B /C:"WorkBuddy.exe" >nul
if not errorlevel 1 goto app_running

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "!ENTRY_DIR!\Verify-R1-4-Package.ps1" -AppRoot "!DEPLOY_ROOT!app" -ManifestPath "!S2_MANIFEST!"
if errorlevel 1 goto wrong_package
set "ACTUAL_EXE_SHA256=!EXPECTED_EXE_SHA256!"
set "ACTUAL_MANIFEST_SHA256=!EXPECTED_MANIFEST_SHA256!"

if not exist "!WORKBUDDY_USER_DATA!\workbuddy.db" set "DATABASE_STATE=clean-before-first-run"
if exist "!WORKBUDDY_USER_DATA!\workbuddy.db" set "DATABASE_STATE=existing-this-role"
set "WORKBUDDY_TEST_PREFIX=!SELECTED_PREFIX!"

>>"!LOG_FILE!" echo [%date% %time%] plan=!SELECTED_PLAN! role=!SELECTED_ROLE! date=!SELECTED_DATE! prefix=!SELECTED_PREFIX!
>>"!LOG_FILE!" echo [%date% %time%] app=!WORKBUDDY_APP! exeSha256=!ACTUAL_EXE_SHA256! manifestSha256=!ACTUAL_MANIFEST_SHA256!
>>"!LOG_FILE!" echo [%date% %time%] userData=!WORKBUDDY_USER_DATA! databaseState=!DATABASE_STATE!

echo ============================================
echo  WorkBuddy v0.3 R1-4 QA2/S2 user test
echo  Plan: R1-4
echo  Role: !SELECTED_ROLE!
echo  Date: !SELECTED_DATE!
echo  Prefix: !SELECTED_PREFIX!
echo  Snapshot: QA2/S2
echo  App: !WORKBUDDY_APP!
echo  WORKBUDDY_USER_DATA: !WORKBUDDY_USER_DATA!
echo  Data state: !DATABASE_STATE!
echo  Real user data is not touched.
echo ============================================
echo Starting WorkBuddy from the R1-4 formal wrapper...
echo Close the WorkBuddy window to end this test run.
echo.

start "" /wait "!WORKBUDDY_APP!"
set "APP_EXIT=!ERRORLEVEL!"
echo WorkBuddy exited with code !APP_EXIT!.
if /I not "!R1_4_NO_PAUSE!"=="1" pause
endlocal & exit /b !APP_EXIT!

:invalid_args
echo [ERROR] This R1-4 entry accepts no command-line arguments.
if /I not "!R1_4_NO_PAUSE!"=="1" pause
endlocal & exit /b 2

:missing_app
echo [ERROR] The deployed QA2/S2 WorkBuddy.exe is missing.
if /I not "!R1_4_NO_PAUSE!"=="1" pause
endlocal & exit /b 3

:missing_selection
echo [ERROR] No R1-4 role is selected. Run the R1-4 selector first.
if /I not "!R1_4_NO_PAUSE!"=="1" pause
endlocal & exit /b 4

:invalid_selection
echo [ERROR] The selected R1-4 role state or registry is invalid.
if /I not "!R1_4_NO_PAUSE!"=="1" pause
endlocal & exit /b 5

:missing_data
echo [ERROR] The registered R1-4 userData directory is missing.
if /I not "!R1_4_NO_PAUSE!"=="1" pause
endlocal & exit /b 6

:app_running
echo [ERROR] A WorkBuddy process is already running. Close it before launching R1-4.
if /I not "!R1_4_NO_PAUSE!"=="1" pause
endlocal & exit /b 7

:wrong_package
echo [ERROR] The deployed R1-4 program copy does not match the full S2 manifest.
if /I not "!R1_4_NO_PAUSE!"=="1" pause
endlocal & exit /b 8
