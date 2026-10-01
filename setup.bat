@echo off
title AI QA Agent - Setup & Launch
echo ===================================================
echo   Preparando el Entorno de QA con IA...
echo ===================================================
echo.

echo [1/4] Instalando dependencias de Node.js (Express, TypeScript, LangChain, etc.)...
call npm install
echo.

echo [2/4] Instalando el navegador Chromium para Playwright...
call npx playwright install chromium
echo.

echo [3/4] Descargando el modelo de lenguaje en Ollama (qwen2.5:7b-instruct)...
echo (Esto puede tardar unos minutos si es la primera vez dependiendo de tu internet)
call ollama pull qwen2.5:7b-instruct
echo.

echo [4/4] Levantando el servidor backend...
call npx ts-node src/server.ts

pause