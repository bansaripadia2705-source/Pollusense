@echo off
title Smart Industrial Pollution Monitor — Dashboard
color 0B
echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║   Opening Pollution Monitoring Dashboard                 ║
echo  ║   Make sure start-backend.bat is already running!       ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.
echo  Waiting 2 seconds for backend to be ready...
timeout /t 2 /nobreak >nul

echo  Opening dashboard in your default browser...
start "" "http://localhost:5000"

echo.
echo  ✅ Dashboard should open at http://localhost:5000
echo  ✅ If it doesn't open, manually go to http://localhost:5000
echo.
pause
