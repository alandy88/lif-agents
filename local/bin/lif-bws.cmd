@echo off
pwsh -NoProfile -File "%~dp0lif-bws.ps1" %*
exit /b %ERRORLEVEL%
