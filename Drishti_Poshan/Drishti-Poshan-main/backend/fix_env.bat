@echo off
title Drishti Poshan - Environment Fix for Python 3.13
color 0A

echo ================================================================
echo    Fixing Python 3.13 Environment for Drishti Poshan
echo ================================================================
echo.

cd /d "%~dp0"

if not exist "venv" (
    echo [1/5] Creating virtual environment...
    python -m venv venv
)

echo [2/5] Activating venv...
call venv\Scripts\activate.bat

echo [3/5] Upgrading pip, setuptools, and wheel...
python -m pip install --upgrade pip setuptools wheel

echo [4/5] Installing openai-whisper from GitHub master to fix pkg_resources...
pip install git+https://github.com/openai/whisper.git

echo [5/5] Installing remaining requirements...
pip install -r requirements.txt

echo.
echo ================================================================
echo Validating AI environment...
python -c "import whisper; import torch; print('\n[OK] AI Environment Verified!')"
pause
