@echo off
pwsh -NoProfile -File "%~dp0deploy-test.ps1" %*
exit /b %ERRORLEVEL%
