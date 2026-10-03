@echo off
title Smart Industrial Pollution Monitor — Backend
color 0A
echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║   Smart Industrial Pollution Monitoring System           ║
echo  ║   Golden Corridor — Vapi · Ankleshwar · Vatva           ║
echo  ║   Powered by IBM Granite LLM + Watsonx.AI               ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.
echo  [1/3] Checking Python installation...
python --version
if %errorlevel% neq 0 (
    color 0C
    echo  ERROR: Python is not installed or not in PATH.
    echo  Please install Python from https://www.python.org/downloads/
    pause
    exit /b 1
)

echo  [2/3] Installing required packages...
pip install flask flask-cors requests python-dotenv --quiet

echo  [3/3] Starting Backend API Server on http://localhost:5000
echo.
echo  ┌─────────────────────────────────────────────────────────┐
echo  │  Backend running at: http://localhost:5000              │
echo  │  Open frontend.bat in another window to launch UI      │
echo  │  Press CTRL+C to stop the server                       │
echo  └─────────────────────────────────────────────────────────┘
echo.
cd /d "%~dp0backend"
python app.py
pause
