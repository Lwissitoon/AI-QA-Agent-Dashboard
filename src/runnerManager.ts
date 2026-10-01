// src/runnerManager.ts
import { runAgent, AgentRunOutcome } from './agent';

interface ActiveRun {
  controller: AbortController;
  testId: string;
}

// Guarda los AbortController de pruebas en ejecución
const activeRuns = new Map<string, ActiveRun>();

// Guarda los ÚLTIMOS RESULTADOS obtenidos por cada testId
const lastResults = new Map<string, AgentRunOutcome>();

/**
 * Obtener el último resultado de un caso sin volver a ejecutarlo.
 */
export function getLastResult(testId: string): AgentRunOutcome | undefined {
  return lastResults.get(testId);
}

/**
 * Iniciar la ejecución de un caso de prueba.
 */
export async function startTestRun(
  testId: string,
  startUrl: string,
  goal: string
): Promise<AgentRunOutcome> {
  // Si ya se está ejecutando, no lanzar otra instancia
  if (activeRuns.has(testId)) {
    throw new Error(`La prueba ${testId} ya se encuentra en ejecución.`);
  }

  const controller = new AbortController();
  activeRuns.set(testId, { controller, testId });

  try {
    const outcome = await runAgent(
      testId,
      startUrl,
      goal,
      10,
      undefined,
      controller.signal
    );

    // Guardar resultado como el más reciente
    lastResults.set(testId, outcome);
    return outcome;
  } finally {
    activeRuns.delete(testId);
  }
}

/**
 * Detener/Cancelar un caso de prueba en ejecución.
 */
export function stopTestRun(testId: string): boolean {
  const activeRun = activeRuns.get(testId);
  if (activeRun) {
    activeRun.controller.abort(); // Dispara la señal de cancelación
    activeRuns.delete(testId);
    return true;
  }
  return false;
}

/**
 * Verificar si una prueba está corriendo actualmente.
 */
export function isTestRunning(testId: string): boolean {
  return activeRuns.has(testId);
}