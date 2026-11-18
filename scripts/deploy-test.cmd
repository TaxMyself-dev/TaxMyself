@echo off
powershell.exe -NoProfile -File "%~dp0deploy-test.ps1" %*
exit /b %ERRORLEVEL%
