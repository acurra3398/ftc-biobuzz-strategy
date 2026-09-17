@echo off
REM ===================================================================
REM  FTC Strategy Lab - Windows launcher.  Just double-click this file.
REM ===================================================================
cd /d "%~dp0"

REM Prefer "py", the launcher that ships with python.org installs. Plain
REM "python" on a clean Windows opens the Microsoft Store instead of running
REM anything, which is a confusing way to fail.
where py >nul 2>nul
if %errorlevel%==0 (
    py -3 serve.py %*
    if errorlevel 1 pause
    goto :eof
)

where python >nul 2>nul
if %errorlevel%==0 (
    python serve.py %*
    if errorlevel 1 pause
    goto :eof
)

REM No Python? Node serves it just as well.
where node >nul 2>nul
if %errorlevel%==0 (
    node tools\serve.mjs %*
    if errorlevel 1 pause
    goto :eof
)

echo.
echo   FTC Strategy Lab needs either Python or Node to serve the files.
echo.
echo   A browser will not run the app straight off the disk - it refuses to
echo   load JavaScript modules over file:// for security reasons, so the
echo   folder has to be served over http.
echo.
echo   Install either one, then double-click this file again:
echo.
echo     Python   https://www.python.org/downloads/
echo              IMPORTANT: tick "Add python.exe to PATH" in the installer
echo     Node     https://nodejs.org/
echo.
pause
