@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title GitHub Upload Assistant
color 0A

:: Hardcoded Git Path found on system
set "GIT_EXE=C:\Program Files\Git\cmd\git.exe"

echo ========================================================
echo          Composite Calc - GitHub Upload Assistant
echo ========================================================
echo.

:: Verify Git exists at the specific path
if not exist "%GIT_EXE%" (
    echo [ERROR] Could not find Git at: %GIT_EXE%
    echo Please reinstall Git for Windows.
    pause
    exit
)

echo [1/5] Initializing Git repository...
if not exist .git (
    "%GIT_EXE%" init
    echo Repository initialized.
) else (
    echo Repository already exists.
)
echo.

echo [2/5] Adding files...
"%GIT_EXE%" add .
echo Files added.
echo.

echo [3/5] Committing files...
"%GIT_EXE%" commit -m "Initial commit of Composite Calc"
echo Files committed.
echo.

echo [4/5] Setting main branch...
"%GIT_EXE%" branch -M main
echo Branch set to 'main'.
echo.

echo ========================================================
echo                 STEP: LINK GITHUB REPO
echo ========================================================
echo 1. Go to https://github.com/new
echo 2. Create a repository named: composite-calc
echo 3. Copy the HTTPS URL (ends in .git)
echo.
echo    Example: https://github.com/Start-Moon/composite-calc.git
echo.
echo ========================================================
echo    PLEASE PASTE THE URL BELOW AND PRESS ENTER
echo ========================================================
echo.

set /p REPO_URL="Paste URL here: "

if "%REPO_URL%"=="" (
    echo.
    echo [ERROR] No URL provided.
    echo Please run the script again and paste the URL.
    pause
    exit
)

echo.
echo [5/5] Pushing to GitHub...
echo (A browser window or login prompt may appear)
echo.

"%GIT_EXE%" remote remove origin >nul 2>&1
"%GIT_EXE%" remote add origin %REPO_URL%
"%GIT_EXE%" push -u origin main

if %errorlevel% EQU 0 (
    echo.
    echo ========================================================
    echo               UPLOAD SUCCESSFUL!
    echo ========================================================
    echo You can now verify your files on GitHub.
) else (
    echo.
    echo ========================================================
    echo               UPLOAD FAILED
    echo ========================================================
    echo Check the error message above.
)

echo.
echo Press any key to close...
pause >nul
