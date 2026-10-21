@echo off
rem Sobe o ai-job-search-dashboard e abre o navegador (dois cliques).
rem Se o painel ja estiver rodando, so abre o navegador.
rem O workspace e a pasta irma ..\ai-job-search, ou a variavel AJS_ROOT.
title Painel de Vagas - ai-job-search-dashboard
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js nao encontrado. Instale em https://nodejs.org & pause & exit /b 1)
if not exist node_modules (
  echo Instalando dependencias do painel...
  call npm install --no-fund --no-audit || (pause & exit /b 1)
)
node bin\ajs-dashboard.js %*
if errorlevel 1 pause
