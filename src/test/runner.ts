import * as fs from 'fs';
import * as path from 'path';

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

export interface SuiteResult {
  name: string;
  results: TestResult[];
  duration: number;
}

export type TestFn = () => Promise<void> | void;
export type TestMap = Record<string, TestFn>;

export function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    const prefix = message ? `${message}: ` : '';
    throw new Error(`${prefix}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertDeepEqual<T>(actual: T, expected: T, message?: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    const prefix = message ? `${message}: ` : '';
    throw new Error(`${prefix}expected ${b}, got ${a}`);
  }
}

export function assertThrows(fn: () => unknown, message?: string): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error(message ?? 'Expected function to throw, but it did not');
  }
}

export async function runSuite(name: string, tests: TestMap): Promise<SuiteResult> {
  const results: TestResult[] = [];
  const suiteStart = Date.now();

  for (const [testName, fn] of Object.entries(tests)) {
    const start = Date.now();
    try {
      await fn();
      results.push({ name: testName, passed: true, duration: Date.now() - start });
    } catch (err) {
      results.push({
        name: testName,
        passed: false,
        error: err instanceof Error ? err.message : String(err),
        duration: Date.now() - start,
      });
    }
  }

  return { name, results, duration: Date.now() - suiteStart };
}

export function printSuiteResult(suite: SuiteResult): void {
  const passed = suite.results.filter(r => r.passed).length;
  const failed = suite.results.filter(r => !r.passed).length;
  const status = failed === 0 ? '\u2713' : '\u2717';

  console.log(`\n${status} ${suite.name} (${suite.duration}ms)`);
  for (const result of suite.results) {
    const icon = result.passed ? '  \u2713' : '  \u2717';
    console.log(`${icon} ${result.name} (${result.duration}ms)`);
    if (result.error) {
      console.log(`      Error: ${result.error}`);
    }
  }
  console.log(`  ${passed} passed, ${failed} failed`);
}

export function printSummary(suites: SuiteResult[]): void {
  const totalPassed = suites.reduce((n, s) => n + s.results.filter(r => r.passed).length, 0);
  const totalFailed = suites.reduce((n, s) => n + s.results.filter(r => !r.passed).length, 0);
  const totalDuration = suites.reduce((n, s) => n + s.duration, 0);
  console.log('\n─────────────────────────────');
  console.log(`Total: ${totalPassed} passed, ${totalFailed} failed (${totalDuration}ms)`);
}

export function logResults(suites: SuiteResult[], logDir: string): string {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = path.join(logDir, `test-${timestamp}.log`);

  const lines: string[] = [`Test Run: ${new Date().toISOString()}`, ''];

  for (const suite of suites) {
    const passed = suite.results.filter(r => r.passed).length;
    const failed = suite.results.filter(r => !r.passed).length;
    lines.push(`Suite: ${suite.name} (${suite.duration}ms)`);
    for (const result of suite.results) {
      const status = result.passed ? 'PASS' : 'FAIL';
      lines.push(`  [${status}] ${result.name} (${result.duration}ms)`);
      if (result.error) {
        lines.push(`         Error: ${result.error}`);
      }
    }
    lines.push(`  Total: ${passed} passed, ${failed} failed`);
    lines.push('');
  }

  fs.writeFileSync(logFile, lines.join('\n'));
  return logFile;
}
