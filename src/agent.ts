import { chromium, Browser, Page } from 'playwright';
import { Ollama } from '@langchain/ollama';
import { retrieveRelevantContext, saveTestMemory } from './memory';
import path from 'path';
import fs from 'fs';

const llm = new Ollama({
  model: 'qwen2.5:7b-instruct',
  baseUrl: 'http://localhost:11434',
  temperature: 0.1,
});

export interface StepLog {
  step: number;
  thought: string;
  action: string;
  targetId?: number;
  textToType?: string;
  status: 'SUCCESS' | 'RETRIED' | 'FAILED';
}

export interface AgentRunOutcome {
  success: boolean;
  steps: number;
  finalAnswer?: string;
  error?: string;
  screenshotPath?: string;
  logs: StepLog[];
}

interface InteractiveElement {
  id: number;
  tagName: string;
  type?: string;
  text?: string;
  placeholder?: string;
  name?: string;
  value?: string;
}

async function getInteractiveDOMSnapshot(page: Page): Promise<InteractiveElement[]> {
  return await page.evaluate(() => {
    const selector = 'a, button, input, select, textarea, [role="button"], [onclick]';
    const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));

    const visibleElements: InteractiveElement[] = [];

    elements.forEach((el, index) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const isVisible =
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none';

      if (isVisible) {
        el.setAttribute('data-ai-id', index.toString());
        visibleElements.push({
          id: index,
          tagName: el.tagName.toLowerCase(),
          type: (el as HTMLInputElement).type || undefined,
          text: el.innerText ? el.innerText.trim().replace(/\s+/g, ' ').slice(0, 40) : undefined,
          placeholder: (el as HTMLInputElement).placeholder || undefined,
          name: (el as HTMLInputElement).name || undefined,
          value: (el as HTMLInputElement).value || undefined,
        });
      }
    });

    return visibleElements;
  });
}

function parseQwenJSONResponse(rawResponse: string): any {
  let cleaned = rawResponse.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error(`No se pudo parsear el JSON de Qwen: ${rawResponse}`);
  }
}

export async function runAgent(
  testId: string,
  startUrl: string,
  goal: string,
  maxSteps: number = 10,
  assertions?: {
    expectedUrlContains?: string;
    expectedSelectorVisible?: string;
    expectedTextVisible?: string[];
  }
): Promise<AgentRunOutcome> {
  const logs: StepLog[] = [];
  let currentStep = 1;
  let isSuccess = false;
  let globalError: string | undefined;
  let relativeScreenshotPath: string | undefined;

  // 1. RAG: Consultar memoria previa
  const historicalMemory = await retrieveRelevantContext(goal);

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    page = await context.newPage();

    console.log(`🚀 [${testId}] Navegando a ${startUrl}`);
    await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    while (currentStep <= maxSteps && !isSuccess) {
      const elements = await getInteractiveDOMSnapshot(page);
      const currentUrl = page.url();

      const prompt = `
<|im_start|>system
Eres un QA Automation Agent experto ejecutando pruebas en Playwright.
Tu misión es cumplir el OBJETIVO proporcionado interactuando paso a paso con los elementos disponibles.

REGLAS DE SALIDA:
- Responde UNICAMENTE en formato JSON válido.
- No agregues explicaciones fuera del JSON.
- Formato esperado:
{
  "thought": "Explicación breve de lo que observas y la acción a tomar",
  "action": "click" | "type" | "navigate" | "wait" | "finish",
  "targetId": número_de_id_del_elemento,
  "text": "texto a escribir (solo para action type)",
  "url": "https://..." (solo para action navigate)
}
<|im_end|>
<|im_start|>user
OBJETIVO DEL CASO: "${goal}"
URL ACTUAL: "${currentUrl}"
PASO ACTUAL: ${currentStep} / ${maxSteps}

=== MEMORIA RAG (HISTORIAL DE EXPERIENCIAS PREVIAS) ===
${historicalMemory}
=====================================================

ELEMENTOS INTERACTIVOS EN LA PÁGINA ACTUAL:
${JSON.stringify(elements, null, 2)}

PASOS EJECUTADOS HASTA AHORA:
${JSON.stringify(logs, null, 2)}

¿Cuál es la siguiente acción en formato JSON?
<|im_end|>
<|im_start|>assistant
`;

      let decision: {
        thought: string;
        action: 'click' | 'type' | 'navigate' | 'wait' | 'finish';
        targetId?: number;
        text?: string;
        url?: string;
      };

      try {
        const rawResponse = await llm.invoke(prompt);
        decision = parseQwenJSONResponse(rawResponse);
      } catch (parseError: any) {
        console.error(`❌ Error parseando respuesta de Qwen en paso ${currentStep}:`, parseError.message);
        logs.push({
          step: currentStep,
          thought: `Error al parsear respuesta del LLM: ${parseError.message}`,
          action: 'INVALID_JSON',
          status: 'FAILED',
        });
        currentStep++;
        continue;
      }

      console.log(`🤖 Paso ${currentStep}: [${decision.action.toUpperCase()}] ${decision.thought}`);

      try {
        if (decision.action === 'click' && decision.targetId !== undefined) {
          const selector = `[data-ai-id="${decision.targetId}"]`;
          await page.waitForSelector(selector, { state: 'visible', timeout: 5000 });
          await page.click(selector);
          await page.waitForLoadState('networkidle').catch(() => {});
        } else if (decision.action === 'type' && decision.targetId !== undefined) {
          const selector = `[data-ai-id="${decision.targetId}"]`;
          await page.waitForSelector(selector, { state: 'visible', timeout: 5000 });
          await page.fill(selector, decision.text || '');
        } else if (decision.action === 'navigate' && decision.url) {
          await page.goto(decision.url, { waitUntil: 'domcontentloaded' });
        } else if (decision.action === 'wait') {
          await page.waitForTimeout(2000);
        } else if (decision.action === 'finish') {
          isSuccess = true;
          logs.push({
            step: currentStep,
            thought: decision.thought,
            action: 'FINISH',
            status: 'SUCCESS',
          });
          break;
        }

        logs.push({
          step: currentStep,
          thought: decision.thought,
          action: decision.action,
          targetId: decision.targetId,
          textToType: decision.text,
          status: 'SUCCESS',
        });
      } catch (actionError: any) {
        console.warn(`⚠️ Fallo en acción [${decision.action}] id ${decision.targetId}: ${actionError.message}`);
        logs.push({
          step: currentStep,
          thought: `Fallo al ejecutar ${decision.action}: ${actionError.message}`,
          action: decision.action,
          targetId: decision.targetId,
          status: 'FAILED',
        });
      }

      currentStep++;
    }

    // Aserciones finales
    if (assertions && page) {
      if (assertions.expectedUrlContains) {
        const currentUrl = page.url();
        if (!currentUrl.includes(assertions.expectedUrlContains)) {
          isSuccess = false;
          globalError = `Aserción fallida: La URL "${currentUrl}" no contiene "${assertions.expectedUrlContains}"`;
        }
      }

      if (assertions.expectedSelectorVisible) {
        const isVisible = await page.isVisible(assertions.expectedSelectorVisible).catch(() => false);
        if (!isVisible) {
          isSuccess = false;
          globalError = `Aserción fallida: El selector "${assertions.expectedSelectorVisible}" no está visible.`;
        }
      }

      if (assertions.expectedTextVisible && assertions.expectedTextVisible.length > 0) {
        const pageText = await page.innerText('body').catch(() => '');
        for (const text of assertions.expectedTextVisible) {
          if (!pageText.includes(text)) {
            isSuccess = false;
            globalError = `Aserción fallida: Texto esperado "${text}" no encontrado.`;
            break;
          }
        }
      }
    }

    // Captura de pantalla final
    if (page) {
      const reportsDir = path.join(process.cwd(), 'reports');
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }

      const fileName = `screenshot_${testId}_${Date.now()}.png`;
      const fullPath = path.join(reportsDir, fileName);
      await page.screenshot({ path: fullPath, fullPage: true });
      relativeScreenshotPath = `/reports/${fileName}`;
    }

  } catch (err: any) {
    globalError = err.message;
    isSuccess = false;
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  // 2. RAG: Guardar experiencia en ChromaDB
  await saveTestMemory(testId, goal, isSuccess, logs, globalError);

  return {
    success: isSuccess,
    steps: logs.length,
    screenshotPath: relativeScreenshotPath,
    error: globalError,
    logs,
  };
}