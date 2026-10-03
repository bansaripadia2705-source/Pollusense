@echo off
title Smart Industrial Pollution Monitor — START ALL
color 0A
echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║   Smart Industrial Pollution Monitoring System           ║
echo  ║   Golden Corridor — Vapi · Ankleshwar · Vatva           ║
echo  ║   Powered by IBM Granite LLM + IBM Watsonx.AI           ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.

echo  [1/4] Checking Python...
python --version
if %errorlevel% neq 0 (
    color 0C
    echo  ERROR: Python not found. Install from https://www.python.org
    pause
    exit /b 1
)

echo  [2/4] Installing dependencies...
pip install flask flask-cors requests python-dotenv --quiet
echo  Dependencies OK.

echo  [3/4] Launching Backend API in new window...
start "Pollution Monitor — Backend" cmd /k "cd /d "%~dp0backend" && python app.py"

echo  [4/4] Waiting for backend to initialize (4 seconds)...
timeout /t 4 /nobreak >nul

echo  Opening Dashboard in browser...
start "" "http://localhost:5000"

echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║  ✅  System Started Successfully!                       ║
echo  ║                                                          ║
echo  ║  Dashboard  →  http://localhost:5000                    ║
echo  ║  API Base   →  http://localhost:5000/api                ║
echo  ║  API Status →  http://localhost:5000/api/status         ║
echo  ║  API Alerts →  http://localhost:5000/api/alerts         ║
echo  ║                                                          ║
echo  ║  Close the "Backend" window to stop monitoring.         ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.
pause
