@echo off
title Drishti Poshan — Startup
color 0B
echo.
echo ================================================================
echo    DRISHTI POSHAN — Vision for Nutrition
echo    AI-Powered Child Nutrition Monitoring
echo ================================================================
echo.

:: ─── Check Prerequisites ───────────────────────────────────

echo [1/5] Checking Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found! Install Python 3.13+ from python.org
    pause
    exit /b 1
)
python --version
echo       OK
echo.

echo [2/5] Checking Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found! Install from nodejs.org
    pause
    exit /b 1
)
node --version
echo       OK
echo.

echo [3/5] Checking FFmpeg (required for Whisper)...
ffmpeg -version >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] FFmpeg not found in PATH.
    echo          Voice transcription will NOT work without FFmpeg.
    echo          Install from: https://ffmpeg.org/download.html
    echo          Add ffmpeg.exe to your system PATH.
    echo.
    echo          Continuing without FFmpeg...
    echo.
) else (
    echo       OK
)
echo.

:: ─── Backend Setup ─────────────────────────────────────────

echo [4/5] Setting up Backend...
cd /d "%~dp0Backend"

if not exist "venv" (
    echo       Creating virtual environment...
    python -m venv venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
)

echo       Activating venv and installing dependencies...
call venv\Scripts\activate.bat
pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    echo [WARNING] Some packages may have failed to install.
    echo          The server will start but some AI features may be disabled.
)
echo       Backend ready.
echo.

:: ─── Frontend Setup ────────────────────────────────────────

echo [5/5] Setting up Frontend...
cd /d "%~dp0Frontend"

if not exist "node_modules" (
    echo       Installing npm dependencies...
    call npm install --force
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)
echo       Frontend ready.
echo.

:: ─── Launch Servers ────────────────────────────────────────

echo ================================================================
echo    LAUNCHING SERVERS
echo ================================================================
echo.
echo    Backend:  http://127.0.0.1:8000
echo    Frontend: http://localhost:5173
echo    API Docs: http://127.0.0.1:8000/docs
echo.
echo    Close this window to stop all servers.
echo ================================================================
echo.

:: Start Backend in a new window
cd /d "%~dp0Backend"
start "Drishti Poshan — Backend" cmd /k "call venv\Scripts\activate.bat && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

:: Wait a moment for backend to initialize
timeout /t 3 /nobreak >nul

:: Start Frontend in a new window
cd /d "%~dp0Frontend"
start "Drishti Poshan — Frontend" cmd /k "npm run dev"

:: Wait and open browser
timeout /t 4 /nobreak >nul
start http://localhost:5173

echo Servers are running. Press any key to stop all servers...
pause >nul

:: Kill servers on exit
taskkill /FI "WINDOWTITLE eq Drishti Poshan*" /F >nul 2>&1
echo Servers stopped. Goodbye!
