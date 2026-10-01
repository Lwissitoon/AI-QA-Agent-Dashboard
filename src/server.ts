import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { runAgent } from './agent';
import { TestCase, TestResult } from './types/testCase';

const app = express();
const PORT = process.env.PORT || 3000;

// Garantizar rutas relativas a la raíz del proyecto
const rootDir = process.cwd();
const dbDir = path.join(rootDir, 'data');
const dbPath = path.join(dbDir, 'tests.json');
const reportsDir = path.join(rootDir, 'reports');
const publicDir = path.join(rootDir, 'public');

if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

// Inicializar tests.json si no existe o está vacío
if (!fs.existsSync(dbPath) || fs.readFileSync(dbPath, 'utf-8').trim() === '') {
  fs.writeFileSync(dbPath, JSON.stringify([], null, 2));
}

const resultsStore: Record<string, TestResult> = {};

function getTests(): TestCase[] {
  try {
    const content = fs.readFileSync(dbPath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error("Error leyendo tests.json:", err);
    return [];
  }
}

function saveTests(tests: TestCase[]): void {
  fs.writeFileSync(dbPath, JSON.stringify(tests, null, 2));
}

function getLatestTestResult(testId: string): TestResult | null {
  if (resultsStore[testId]) return resultsStore[testId];

  try {
    if (!fs.existsSync(reportsDir)) return null;

    const files = fs.readdirSync(reportsDir)
      .filter((file: string) => file === `${testId}.json` || (file.startsWith(`report-${testId}-`) && file.endsWith('.json')))
      .map((file: string) => ({
        file,
        time: fs.statSync(path.join(reportsDir, file)).mtimeMs
      }))
      .sort((a, b) => b.time - a.time);

    if (files.length === 0) return null;

    const latestFile = path.join(reportsDir, files[0].file);
    const result: TestResult = JSON.parse(fs.readFileSync(latestFile, 'utf-8'));
    resultsStore[testId] = result;
    return result;
  } catch (error: unknown) {
    return null;
  }
}

app.use(express.json({ limit: '10mb' }));
app.use(express.static(publicDir));
app.use('/reports', express.static(reportsDir));
app.use('/reports/reports', express.static(reportsDir));

// --- API CRUD ---

app.get('/api/tests', (_req: Request, res: Response) => {
  res.json(getTests());
});

app.post('/api/tests', (req: Request, res: Response) => {
  const tests = getTests();
  const newTest: TestCase = req.body;
  if (tests.some((t: TestCase) => t.id === newTest.id)) {
    return res.status(400).json({ error: 'El ID de la prueba ya existe' });
  }
  tests.push(newTest);
  saveTests(tests);
  res.json(newTest);
});

app.put('/api/tests/:id', (req: Request, res: Response) => {
  let tests = getTests();
  const testId = req.params.id as string;
  const index = tests.findIndex((t: TestCase) => t.id === testId);
  if (index === -1) return res.status(404).json({ error: 'Prueba no encontrada' });
  tests[index] = { ...tests[index], ...req.body, id: testId };
  saveTests(tests);
  res.json(tests[index]);
});

app.delete('/api/tests/:id', (req: Request, res: Response) => {
  let tests = getTests();
  const testId = req.params.id as string;
  tests = tests.filter((t: TestCase) => t.id !== testId);
  saveTests(tests);

  delete resultsStore[testId];
  const reportFile = path.join(reportsDir, `${testId}.json`);
  if (fs.existsSync(reportFile)) fs.unlinkSync(reportFile);

  res.json({ success: true });
});

app.post('/api/tests/import', (req: Request, res: Response) => {
  try {
    const incomingTests: TestCase[] = req.body;
    if (!Array.isArray(incomingTests)) {
      return res.status(400).json({ error: 'Formato inválido. Se esperaba un arreglo.' });
    }

    let existingTests = getTests();
    incomingTests.forEach((incoming: TestCase) => {
      const index = existingTests.findIndex((t: TestCase) => t.id === incoming.id);
      if (index !== -1) existingTests[index] = incoming;
      else existingTests.push(incoming);
    });

    saveTests(existingTests);
    res.json({ success: true, count: incomingTests.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

const handleGetResult = (req: Request, res: Response) => {
  const testId = (req.params.testId || req.params.id) as string;
  const lastResult = getLatestTestResult(testId);
  if (lastResult) {
    res.json(lastResult);
  } else {
    res.status(404).json({ error: 'No hay registros previos para este caso' });
  }
};

app.get('/api/results/:testId', handleGetResult);
app.get('/api/tests/:id/result', handleGetResult);

app.post('/api/run/:id', async (req: Request, res: Response) => {
  const testId = req.params.id as string;
  const test = getTests().find((t: TestCase) => t.id === testId);
  if (!test) return res.status(404).json({ error: 'Prueba no encontrada' });

  const startTime = Date.now();
  try {
    const outcome = await runAgent(
      test.id,
      test.startUrl,
      test.goal,
      test.maxSteps || 10,
      test.assertions
    );

    const result: TestResult = {
      testId: test.id,
      testName: test.name,
      passed: outcome.success,
      stepsUsed: outcome.steps,
      finalAnswer: outcome.finalAnswer,
      error: outcome.error,
      durationMs: Date.now() - startTime,
      screenshotPath: outcome.screenshotPath, // Asignación directa, sin duplicar rutas
      logs: outcome.logs,
      timestamp: new Date().toISOString()
    };

    resultsStore[testId] = result;
    fs.writeFileSync(path.join(reportsDir, `${test.id}.json`), JSON.stringify(result, null, 2));
    
    // Guardar en el historial de métricas
    saveExecutionHistory(test.id, result);

    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

app.post('/api/run-batch', async (req: Request, res: Response) => {
  const { testIds }: { testIds: string[] } = req.body;
  if (!testIds || !Array.isArray(testIds) || testIds.length === 0) {
    return res.status(400).json({ error: 'Debes proporcionar una lista de testIds' });
  }

  const allTests = getTests();
  const selectedTests = allTests.filter((t: TestCase) => testIds.includes(t.id));

  const suiteStartTime = Date.now();
  const results: TestResult[] = [];

  for (const test of selectedTests) {
    const startTime = Date.now();
    try {
      const outcome = await runAgent(
        test.id,
        test.startUrl,
        test.goal,
        test.maxSteps || 10,
        test.assertions
      );

      const result: TestResult = {
        testId: test.id,
        testName: test.name,
        passed: outcome.success,
        stepsUsed: outcome.steps,
        finalAnswer: outcome.finalAnswer,
        error: outcome.error,
        durationMs: Date.now() - startTime,
        screenshotPath: outcome.screenshotPath, // Asignación directa
        logs: outcome.logs,
        timestamp: new Date().toISOString()
      };

      resultsStore[test.id] = result;
      fs.writeFileSync(path.join(reportsDir, `${test.id}.json`), JSON.stringify(result, null, 2));
      
      // Guardar en el historial
      saveExecutionHistory(test.id, result);
      
      results.push(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const failedResult: TestResult = {
        testId: test.id,
        testName: test.name,
        passed: false,
        stepsUsed: 0,
        error: message,
        durationMs: Date.now() - startTime,
        logs: [],
        timestamp: new Date().toISOString()
      };

      resultsStore[test.id] = failedResult;
      fs.writeFileSync(path.join(reportsDir, `${test.id}.json`), JSON.stringify(failedResult, null, 2));
      
      // Guardar fallo en el historial
      saveExecutionHistory(test.id, failedResult);
      
      results.push(failedResult);
    }
  }

  const passedCount = results.filter((r: TestResult) => r.passed).length;
  res.json({
    total: results.length,
    passedCount,
    failedCount: results.length - passedCount,
    totalDurationMs: Date.now() - suiteStartTime,
    results
  });
});


// 1. Definición de Interfaces para el Historial
interface ExecutionResult {
    passed: boolean;
    durationMs: number;
    stepsUsed: number;
    error?: string | null;
}

interface ExecutionRecord extends ExecutionResult {
    timestamp: string;
}

type HistoryData = Record<string, ExecutionRecord[]>;

interface TestMetric {
    totalRuns: number;
    passRate: string;
    averageDurationSec: string;
}

interface MetricsResponse {
    totalExecutions: number;
    passed: number;
    failed: number;
    testMetrics: Record<string, TestMetric>;
}

// 2. Lógica del archivo de historial
const HISTORY_FILE = path.join(dbDir, 'history.json'); // Guarda correctamente en 'data'

if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify({}));
}

// 3. Función Tipada
function saveExecutionHistory(testId: string, result: ExecutionResult): void {
    let history: HistoryData = {};
    
    try {
        history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    } catch (e) {
        console.error("Error leyendo history.json, inicializando vacío.");
    }
    
    if (!history[testId]) {
        history[testId] = [];
    }

    const executionRecord: ExecutionRecord = {
        timestamp: new Date().toISOString(),
        passed: result.passed,
        durationMs: result.durationMs,
        stepsUsed: result.stepsUsed,
        error: result.error || null
    };

    history[testId].push(executionRecord);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

// 4. Endpoint de Métricas
app.get('/api/metrics', (req: Request, res: Response) => {
    let history: HistoryData = {};
    try {
        history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    } catch (e) {
        history = {};
    }
    
    const metrics: MetricsResponse = { 
        totalExecutions: 0, 
        passed: 0, 
        failed: 0, 
        testMetrics: {} 
    };

    for (const [testId, runs] of Object.entries(history)) {
        const testTotal = runs.length;
        const testPassed = runs.filter((r: ExecutionRecord) => r.passed).length;
        const avgTime = runs.reduce((acc: number, r: ExecutionRecord) => acc + r.durationMs, 0) / testTotal;

        metrics.totalExecutions += testTotal;
        metrics.passed += testPassed;
        metrics.failed += (testTotal - testPassed);

        metrics.testMetrics[testId] = {
            totalRuns: testTotal,
            passRate: ((testPassed / testTotal) * 100).toFixed(1) + '%',
            averageDurationSec: (avgTime / 1000).toFixed(2)
        };
    }

    res.json(metrics);
});

app.listen(PORT, () => console.log(`🚀 AI QA Dashboard ejecutándose en http://localhost:${PORT}`));