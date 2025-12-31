@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title GitHub One-Click Update
color 0A

:: Hardcoded Git Path
set "GIT_EXE=C:\Program Files\Git\cmd\git.exe"

echo ========================================================
echo          Web-MSteel Update Assistant
echo ========================================================
echo.

:: 1. Verify Git
if not exist "%GIT_EXE%" (
    echo [ERROR] Could not find Git at: %GIT_EXE%
    echo Please reinstall Git for Windows.
    pause
    exit
)

:: 2. Initialize if needed
if not exist .git (
    echo [Init] Initializing repository...
    "%GIT_EXE%" init
)

:: 3. Auto-Sync index.html
echo [Sync] Updating index.html from 首页.html...
copy /Y 首页.html index.html >nul
echo Done.
echo.

:: 4. Add Files
echo [Add] Adding changes...
"%GIT_EXE%" add .

:: 5. Commit
echo.
set /p COMMIT_MSG="Enter update description (Press Enter for 'Update'): "
if "!COMMIT_MSG!"=="" set "COMMIT_MSG=Update"
"%GIT_EXE%" commit -m "!COMMIT_MSG!"
echo.

:: 6. Check Remote
"%GIT_EXE%" remote get-url origin >nul 2>&1
if %errorlevel% NEQ 0 (
    echo ========================================================
    echo    FIRST TIME SETUP: LINK REPOSITORY
    echo ========================================================
    echo Please paste your GitHub URL (e.g., https://github.com/user/repo.git)
    echo.
    set /p REPO_URL="Repository URL: "
    if "!REPO_URL!"=="" (
        echo [ERROR] No URL provided.
        pause
        exit
    )
    "%GIT_EXE%" branch -M main
    "%GIT_EXE%" remote add origin !REPO_URL!
)

:: 7. Push
echo [Push] Uploading to GitHub...
"%GIT_EXE%" push -u origin main

if %errorlevel% EQU 0 (
    echo.
    echo ========================================================
    echo               UPDATE SUCCESSFUL!
    echo ========================================================
) else (
    echo.
    echo ========================================================
    echo               UPDATE FAILED
    echo ========================================================
    echo Check your internet connection or GitHub permissions.
)

echo.
echo Press any key to close...
pause >nul
