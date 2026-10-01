import * as fs from 'fs';
import * as path from 'path';
import { testSuite } from './tests/testSuite';
import { runAgent } from './agent';
import { TestResult } from './types/testCase';

function generateHtmlReport(results: TestResult[], totalTimeMs: number) {
  const reportsDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.length - passedCount;
  const passRate = ((passedCount / results.length) * 100).toFixed(1);

  const rows = results
    .map((r) => {
      const statusBadge = r.passed
        ? `<span style="background:#22c55e;color:white;padding:4px 8px;border-radius:4px;font-weight:bold;">PASSED</span>`
        : `<span style="background:#ef4444;color:white;padding:4px 8px;border-radius:4px;font-weight:bold;">FAILED</span>`;

      const relativeScreenshot = r.screenshotPath
        ? path.relative(reportsDir, r.screenshotPath).replace(/\\/g, '/')
        : '';

      const logsHtml = r.logs
        .map(
          (l) => `
        <div style="font-size:12px;margin-bottom:4px;padding:4px;background:#f8fafc;border-left:3px solid #3b82f6;">
          <strong>Step ${l.step} [${l.action}]:</strong> ${l.thought}
        </div>`
        )
        .join('');

      return `
      <tr style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:12px;"><strong>${r.testId}</strong></td>
        <td style="padding:12px;">${r.testName}</td>
        <td style="padding:12px;">${statusBadge}</td>
        <td style="padding:12px;">${r.stepsUsed}</td>
        <td style="padding:12px;">${(r.durationMs / 1000).toFixed(2)}s</td>
        <td style="padding:12px;">
          <details>
            <summary style="cursor:pointer;color:#2563eb;">View Step Logs (${r.logs.length})</summary>
            <div style="margin-top:8px;">${logsHtml}</div>
          </details>
          ${r.error ? `<div style="color:#dc2626;font-size:12px;margin-top:4px;">❌ ${r.error}</div>` : ''}
          ${r.finalAnswer ? `<div style="color:#16a34a;font-size:12px;margin-top:4px;">💬 ${r.finalAnswer}</div>` : ''}
        </td>
        <td style="padding:12px;">
          ${
            relativeScreenshot
              ? `<a href="${relativeScreenshot}" target="_blank">
                  <img src="${relativeScreenshot}" style="width:100px;border-radius:4px;border:1px solid #ccc;"/>
                 </a>`
              : 'N/A'
          }
        </td>
      </tr>`;
    })
    .join('');

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QA Agent Test Execution Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f1f5f9; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 24px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
    .stats { display: flex; gap: 16px; margin: 20px 0; }
    .card { flex: 1; padding: 16px; border-radius: 6px; background: #f8fafc; text-align: center; border: 1px solid #e2e8f0; }
    .card h3 { margin: 0; font-size: 14px; color: #64748b; }
    .card p { margin: 8px 0 0; font-size: 24px; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; text-align: left; }
    th { background: #f8fafc; padding: 12px; border-bottom: 2px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <h2>🧪 QA Agent Test Execution Report</h2>
    <p style="color:#64748b;font-size:14px;">Executed on: ${new Date().toLocaleString()}</p>
    
    <div class="stats">
      <div class="card"><h3>Total Tests</h3><p>${results.length}</p></div>
      <div class="card"><h3>Passed</h3><p style="color:#22c55e;">${passedCount}</p></div>
      <div class="card"><h3>Failed</h3><p style="color:#ef4444;">${failedCount}</p></div>
      <div class="card"><h3>Pass Rate</h3><p>${passRate}%</p></div>
      <div class="card"><h3>Total Duration</h3><p>${(totalTimeMs / 1000).toFixed(1)}s</p></div>
    </div>

    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Name</th>
          <th>Status</th>
          <th>Steps</th>
          <th>Duration</th>
          <th>Logs / Output</th>
          <th>Evidence</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>
</body>
</html>
`;

  const htmlPath = path.join(reportsDir, 'report-latest.html');
  const jsonPath = path.join(reportsDir, 'report-latest.json');

  fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2), 'utf-8');

  console.log(`\n📄 Reports generated successfully:`);
  console.log(`   └ HTML: ${htmlPath}`);
  console.log(`   └ JSON: ${jsonPath}`);
}

async function executeSuite() {
  console.log(`====================================================`);
  console.log(`🧪 Starting Test Suite Execution (${testSuite.length} tests)`);
  console.log(`====================================================\n`);

  const results: TestResult[] = [];
  const suiteStartTime = Date.now();

  for (const test of testSuite) {
    console.log(`▶ Running [${test.id}] ${test.name}...`);
    const startTime = Date.now();

    const outcome = await runAgent(test.id, test.startUrl, test.goal, test.maxSteps,test.assertions);
    const durationMs = Date.now() - startTime;

    const testResult: TestResult = {
      testId: test.id,
      testName: test.name,
      passed: outcome.success,
      stepsUsed: outcome.steps,
      finalAnswer: outcome.finalAnswer,
      error: outcome.error,
      durationMs,
      screenshotPath: outcome.screenshotPath,
      logs: outcome.logs
    };

    results.push(testResult);

    const statusSymbol = outcome.success ? '✅ PASSED' : '❌ FAILED';
    console.log(`   Result: ${statusSymbol} (${(durationMs / 1000).toFixed(2)}s, ${outcome.steps} steps)\n`);
  }

  const totalTimeMs = Date.now() - suiteStartTime;

  console.log(`====================================================`);
  console.log(`📊 TEST EXECUTION SUMMARY`);
  console.log(`====================================================`);
  results.forEach((r) => {
    const symbol = r.passed ? '✅' : '❌';
    console.log(`${symbol} [${r.testId}] ${r.testName} - ${r.stepsUsed} steps - ${(r.durationMs / 1000).toFixed(2)}s`);
  });

  generateHtmlReport(results, totalTimeMs);
}

executeSuite();