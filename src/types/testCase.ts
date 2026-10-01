export interface TestCase {
  id: string;
  name: string;
  group?: string;
  description: string;
  startUrl: string;
  goal: string;
  maxSteps?: number;
  assertions?: {
    expectedUrlContains?: string;
    expectedSelectorVisible?: string;
    expectedTextVisible?: string[];
  };
}

export interface StepLog {
  step: number;
  thought: string;
  action: string;
  targetId?: number;
  textToType?: string;
  status: 'SUCCESS' | 'RETRIED' | 'FAILED';
}

export interface TestResult {
  testId: string;
  testName: string;
  passed: boolean;
  stepsUsed: number;
  finalAnswer?: string;
  error?: string;
  durationMs: number;
  screenshotPath?: string;
  logs: StepLog[];
  timestamp?: string;
}