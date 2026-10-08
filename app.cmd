@echo off
rem Pembungkus Windows: app.cmd {build|start|stop|restart|status|logs}
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js belum terpasang ^(butuh versi 18+^). 1>&2
  exit /b 1
)

node scripts\app.mjs %*
exit /b %errorlevel%
