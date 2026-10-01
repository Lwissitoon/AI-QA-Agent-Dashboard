# AI QA Automation Agent

Un framework de automatización de pruebas impulsado por IA que integra **Playwright** para la interacción web y **Ollama (Qwen2.5:7b-instruct)** como motor de toma de decisiones agéntico. El sistema utiliza arquitectura **RAG (Retrieval-Augmented Generation)** y memoria vectorial para auto-sanación (self-healing) de selectores y análisis de historial de ejecuciones.

## 🚀 Características Principales

- **Agente QA Autónomo:** Toma de decisiones dinámicas (Click, Type, Navigate) basadas en la lectura del DOM mediante LangChain y un LLM local.
- **Arquitectura RAG & Self-Healing:** Almacena experiencias previas y selectores exitosos para resolver problemas de cambios en la UI de forma automática.
- **Panel de Métricas (Dashboard):** Interfaz web servida con Express para gestionar, ejecutar e importar casos de prueba en formato JSON.
- **Reportes Visuales:** Generación automática de capturas de pantalla de Playwright y logs de pasos (Step Logs) para cada caso ejecutado.
- **Ejecución en Lote (Batch):** Soporte para correr suites completas de pruebas con métricas agregadas de rendimiento y tasa de éxito (Pass Rate).

## 🛠️ Stack Tecnológico

- **Backend:** Node.js, Express.js, TypeScript.
- **Automatización:** Playwright (Chromium).
- **Inteligencia Artificial:** Ollama, LangChain, Qwen2.5 (7B).
- **Almacenamiento:** JSON persistente (Local Storage), ChromaDB (Vector Store).

## ⚙️ Requisitos Previos

Antes de iniciar, asegúrate de tener instalados:
- [Node.js](https://nodejs.org/) (v18 o superior).
- [Ollama](https://ollama.com/) ejecutándose en tu máquina local.

## 📦 Instalación y Configuración

Puedes usar el script automatizado (si estás en Windows) haciendo doble clic en `setup_y_arrancar.bat`, o ejecutar los pasos manualmente:

1. **Clonar el repositorio e instalar dependencias:**
   ```bash
   git clone <tu-repositorio-url>
   cd <nombre-carpeta>
   npm install