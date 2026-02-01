/**
 * VectorSheet Headless Test Harness - Regression Runner
 *
 * Batch execution of .vsheet scripts as regression tests.
 *
 * Features:
 * - File discovery via glob patterns
 * - Isolated execution (fresh engine per file)
 * - Per-file and global reporting
 * - Golden file comparison for snapshots
 * - CI-grade exit codes
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHarnessRunner } from './HarnessRunner.js';
import { HarnessConfig, DEFAULT_CONFIG, Output } from './types.js';

// =============================================================================
// Types
// =============================================================================

/** Error classification for test failures */
export type ErrorType = 'Timeout' | 'StepLimit' | 'Assertion' | 'Runtime' | 'Golden';

/** Result of executing a single test file */
export interface TestFileResult {
  /** Path to the test file */
  filePath: string;
  /** File name (for display) */
  fileName: string;
  /** Whether the test passed */
  passed: boolean;
  /** Execution time in milliseconds */
  durationMs: number;
  /** Number of commands executed */
  commandCount: number;
  /** Error details if failed */
  error?: {
    type: ErrorType;
    message: string;
    lineNumber?: number;
    command?: string;
  };
  /** Golden file status */
  golden?: {
    created: boolean;
    matched: boolean;
    diffSummary?: string;
  };
  /** All outputs from the test (for golden comparison) */
  outputs: Output[];
}

/** Result of batch test execution */
export interface BatchResult {
  /** All test file results */
  results: TestFileResult[];
  /** Total number of tests */
  total: number;
  /** Number of passed tests */
  passed: number;
  /** Number of failed tests */
  failed: number;
  /** Total execution time in milliseconds */
  totalDurationMs: number;
  /** Whether all tests passed */
  allPassed: boolean;
}

/** Options for the regression runner */
export interface RegressionRunnerOptions {
  /** Enable golden file comparison */
  golden: boolean;
  /** Update golden files even if they exist */
  updateGolden: boolean;
  /** Harness configuration overrides */
  config: Partial<HarnessConfig>;
  /** Verbose output */
  verbose: boolean;
  /** Output format */
  outputFormat: 'pretty' | 'json';
  /** Filter to run only specific tests (substring match) */
  filter?: string;
  /** Stop on first failure */
  failFast: boolean;
}

/** Default options */
export const DEFAULT_REGRESSION_OPTIONS: RegressionRunnerOptions = {
  golden: false,
  updateGolden: false,
  config: {},
  verbose: false,
  outputFormat: 'pretty',
  failFast: false,
};

// =============================================================================
// File Discovery
// =============================================================================

/**
 * Simple glob pattern matching for file discovery.
 * Supports:
 * - Exact paths: tests/basic.vsheet
 * - Wildcards: tests/*.vsheet
 * - Recursive: tests/**\/*.vsheet
 */
export function discoverFiles(pattern: string, basePath: string = process.cwd()): string[] {
  // Normalize the pattern
  const normalizedPattern = pattern.replace(/\\/g, '/');

  // Check if it's an exact file path
  const exactPath = path.resolve(basePath, pattern);
  if (fs.existsSync(exactPath) && fs.statSync(exactPath).isFile()) {
    return [exactPath];
  }

  // Check if it's a directory - run all .vsheet files in it
  if (fs.existsSync(exactPath) && fs.statSync(exactPath).isDirectory()) {
    return discoverFilesInDirectory(exactPath, '*.vsheet', false);
  }

  // Handle glob patterns
  const parts = normalizedPattern.split('/');
  const hasRecursive = parts.includes('**');
  const hasWildcard = parts.some(p => p.includes('*'));

  if (!hasWildcard) {
    // No wildcards, file doesn't exist
    return [];
  }

  // Find the base directory (before any wildcards)
  let baseDir = basePath;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].includes('*')) {
      break;
    }
    baseDir = path.join(baseDir, parts[i]);
  }

  if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) {
    return [];
  }

  // Get the file pattern (last part)
  const filePattern = parts[parts.length - 1];

  // Discover files
  return discoverFilesInDirectory(baseDir, filePattern, hasRecursive);
}

/**
 * Recursively discover files matching a pattern in a directory.
 */
function discoverFilesInDirectory(dir: string, pattern: string, recursive: boolean): string[] {
  const files: string[] = [];
  const regex = patternToRegex(pattern);

  function scan(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory() && recursive) {
        scan(fullPath);
      } else if (entry.isFile() && regex.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  scan(dir);

  // Sort for deterministic order
  return files.sort();
}

/**
 * Convert a simple glob pattern to a regex.
 * Supports: * (any chars except /), ? (single char)
 */
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

// =============================================================================
// Golden File Handling
// =============================================================================

/**
 * Get the golden file path for a test file.
 */
export function getGoldenPath(testFilePath: string): string {
  const dir = path.dirname(testFilePath);
  const base = path.basename(testFilePath, path.extname(testFilePath));
  return path.join(dir, `${base}.golden`);
}

/**
 * Load a golden file if it exists.
 */
export function loadGoldenFile(goldenPath: string): string | null {
  if (!fs.existsSync(goldenPath)) {
    return null;
  }
  return fs.readFileSync(goldenPath, 'utf-8');
}

/**
 * Save a golden file.
 */
export function saveGoldenFile(goldenPath: string, content: string): void {
  fs.writeFileSync(goldenPath, content, 'utf-8');
}

/**
 * Convert outputs to golden file content.
 * Only includes deterministic output (excludes timestamps).
 */
export function outputsToGoldenContent(outputs: Output[]): string {
  const lines: string[] = [];

  for (const output of outputs) {
    // Create a deterministic copy without timestamps
    const { timestamp, ...rest } = output;
    lines.push(JSON.stringify(rest, null, 2));
  }

  return lines.join('\n---\n') + '\n';
}

/**
 * Compare two golden file contents.
 * Returns null if they match, or a diff summary if they differ.
 */
export function compareGolden(expected: string, actual: string): string | null {
  const expectedLines = expected.trim().split('\n');
  const actualLines = actual.trim().split('\n');

  // Find first difference
  const maxLines = Math.max(expectedLines.length, actualLines.length);
  let firstDiffLine = -1;
  let expectedLine = '';
  let actualLine = '';

  for (let i = 0; i < maxLines; i++) {
    const exp = expectedLines[i] ?? '';
    const act = actualLines[i] ?? '';
    if (exp !== act) {
      firstDiffLine = i + 1;
      expectedLine = exp;
      actualLine = act;
      break;
    }
  }

  if (firstDiffLine === -1) {
    return null; // Match
  }

  // Count total differences
  let diffCount = 0;
  for (let i = 0; i < maxLines; i++) {
    if ((expectedLines[i] ?? '') !== (actualLines[i] ?? '')) {
      diffCount++;
    }
  }

  return [
    `First difference at line ${firstDiffLine}:`,
    `  Expected: ${expectedLine.substring(0, 80)}${expectedLine.length > 80 ? '...' : ''}`,
    `  Actual:   ${actualLine.substring(0, 80)}${actualLine.length > 80 ? '...' : ''}`,
    `Total: ${diffCount} line(s) differ`,
  ].join('\n');
}

// =============================================================================
// Test Execution
// =============================================================================

/**
 * Execute a single test file.
 */
export async function executeTestFile(
  filePath: string,
  options: RegressionRunnerOptions
): Promise<TestFileResult> {
  const fileName = path.basename(filePath);
  const startTime = Date.now();
  const outputs: Output[] = [];

  // Create isolated runner for this file
  const config: HarnessConfig = {
    ...DEFAULT_CONFIG,
    ...options.config,
    // Always collect output, don't print during test
    outputFormat: 'json',
  };

  const runner = createHarnessRunner(config, (output) => {
    outputs.push(output);
  });

  // Read the script
  let script: string;
  try {
    script = fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    return {
      filePath,
      fileName,
      passed: false,
      durationMs: Date.now() - startTime,
      commandCount: 0,
      outputs: [],
      error: {
        type: 'Runtime',
        message: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }

  // Execute the script
  try {
    await runner.executeScript(script);
  } catch (error) {
    // Script threw an error (e.g., stopOnError)
    // Error should already be in outputs
  }

  const durationMs = Date.now() - startTime;
  const commandCount = runner.getStepCount();

  // Check for errors in outputs (includes assertion failures)
  const errorOutput = outputs.find(o => {
    if (o.type === 'error') return true;
    if (o.type === 'assert' && !o.passed) return true;
    return false;
  });

  // Determine error type and details
  let error: TestFileResult['error'] | undefined;
  if (errorOutput) {
    if (errorOutput.type === 'error') {
      const errOut = errorOutput as Output & { errorType?: string };
      let errorType: ErrorType = 'Runtime';
      if (errOut.errorType === 'CommandTimeout') errorType = 'Timeout';
      else if (errOut.errorType === 'StepLimitExceeded') errorType = 'StepLimit';
      else if (errOut.errorType === 'ScriptAborted') errorType = 'Runtime';

      error = {
        type: errorType,
        message: errorOutput.message,
        lineNumber: errorOutput.lineNumber,
        command: errorOutput.command,
      };
    } else if (errorOutput.type === 'assert' && !errorOutput.passed) {
      // Assertion failure
      error = {
        type: 'Assertion',
        message: errorOutput.message ?? `Expected ${errorOutput.expected}, got ${errorOutput.actual}`,
        lineNumber: errorOutput.lineNumber,
        command: errorOutput.command,
      };
    }
  }

  // Handle golden file comparison
  let golden: TestFileResult['golden'] | undefined;
  if (options.golden) {
    const goldenPath = getGoldenPath(filePath);
    const actualContent = outputsToGoldenContent(outputs);
    const existingGolden = loadGoldenFile(goldenPath);

    if (existingGolden === null || options.updateGolden) {
      // Create or update golden file
      saveGoldenFile(goldenPath, actualContent);
      golden = {
        created: true,
        matched: true,
      };
    } else {
      // Compare with existing
      const diffSummary = compareGolden(existingGolden, actualContent);
      if (diffSummary) {
        golden = {
          created: false,
          matched: false,
          diffSummary,
        };
        // Mark as error if golden mismatch
        if (!error) {
          error = {
            type: 'Golden',
            message: 'Golden file mismatch',
          };
        }
      } else {
        golden = {
          created: false,
          matched: true,
        };
      }
    }
  }

  return {
    filePath,
    fileName,
    passed: !error,
    durationMs,
    commandCount,
    error,
    golden,
    outputs,
  };
}

// =============================================================================
// Batch Execution
// =============================================================================

/**
 * Execute multiple test files.
 */
export async function executeBatch(
  files: string[],
  options: RegressionRunnerOptions,
  onFileComplete?: (result: TestFileResult, index: number, total: number) => void
): Promise<BatchResult> {
  const results: TestFileResult[] = [];
  const startTime = Date.now();

  // Apply filter if specified
  let filesToRun = files;
  if (options.filter) {
    const filterLower = options.filter.toLowerCase();
    filesToRun = files.filter(f =>
      path.basename(f).toLowerCase().includes(filterLower)
    );
  }

  for (let i = 0; i < filesToRun.length; i++) {
    const file = filesToRun[i];
    const result = await executeTestFile(file, options);
    results.push(result);

    if (onFileComplete) {
      onFileComplete(result, i, filesToRun.length);
    }

    // Stop on first failure if failFast
    if (options.failFast && !result.passed) {
      break;
    }
  }

  const totalDurationMs = Date.now() - startTime;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  return {
    results,
    total: results.length,
    passed,
    failed,
    totalDurationMs,
    allPassed: failed === 0,
  };
}

// =============================================================================
// Reporting
// =============================================================================

/** ANSI color codes for terminal output */
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

/**
 * Format a single test result for display.
 */
export function formatTestResult(result: TestFileResult, verbose: boolean = false): string {
  const status = result.passed
    ? `${colors.green}PASS${colors.reset}`
    : `${colors.red}FAIL${colors.reset}`;

  const duration = `${colors.gray}(${result.durationMs}ms)${colors.reset}`;

  let line = `${status} ${result.fileName} ${duration}`;

  // Add golden status
  if (result.golden) {
    if (result.golden.created) {
      line += ` ${colors.yellow}[golden created]${colors.reset}`;
    } else if (!result.golden.matched) {
      line += ` ${colors.red}[golden mismatch]${colors.reset}`;
    }
  }

  // Add error details for failures
  if (!result.passed && result.error) {
    const errorLines: string[] = [];
    errorLines.push(`     ${colors.red}${result.error.type}: ${result.error.message}${colors.reset}`);
    if (result.error.lineNumber !== undefined) {
      errorLines.push(`     at line ${result.error.lineNumber}: ${result.error.command ?? ''}`);
    }
    if (result.golden?.diffSummary && verbose) {
      errorLines.push(`     ${result.golden.diffSummary.replace(/\n/g, '\n     ')}`);
    }
    line += '\n' + errorLines.join('\n');
  }

  return line;
}

/**
 * Format the batch summary for display.
 */
export function formatBatchSummary(batch: BatchResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('─'.repeat(50));

  lines.push(
    `${colors.bold}Total:${colors.reset}  ${batch.total}   ` +
    `${colors.green}Passed:${colors.reset} ${batch.passed}   ` +
    `${colors.red}Failed:${colors.reset} ${batch.failed}   ` +
    `${colors.gray}Time:${colors.reset} ${batch.totalDurationMs}ms`
  );

  if (batch.allPassed) {
    lines.push(`${colors.green}${colors.bold}All tests passed!${colors.reset}`);
  } else {
    lines.push(`${colors.red}${colors.bold}${batch.failed} test(s) failed${colors.reset}`);
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * Format batch result as JSON.
 */
export function formatBatchAsJson(batch: BatchResult): string {
  const output = {
    total: batch.total,
    passed: batch.passed,
    failed: batch.failed,
    durationMs: batch.totalDurationMs,
    allPassed: batch.allPassed,
    results: batch.results.map(r => ({
      file: r.fileName,
      passed: r.passed,
      durationMs: r.durationMs,
      commandCount: r.commandCount,
      error: r.error,
      golden: r.golden ? {
        created: r.golden.created,
        matched: r.golden.matched,
      } : undefined,
    })),
  };
  return JSON.stringify(output, null, 2);
}

// =============================================================================
// Main Runner Class
// =============================================================================

/**
 * Regression test runner for .vsheet scripts.
 */
export class RegressionRunner {
  private options: RegressionRunnerOptions;

  constructor(options: Partial<RegressionRunnerOptions> = {}) {
    this.options = { ...DEFAULT_REGRESSION_OPTIONS, ...options };
  }

  /**
   * Run tests matching a glob pattern.
   */
  async run(pattern: string, basePath?: string): Promise<BatchResult> {
    // Discover files
    const files = discoverFiles(pattern, basePath);

    if (files.length === 0) {
      console.error(`No test files found matching: ${pattern}`);
      return {
        results: [],
        total: 0,
        passed: 0,
        failed: 0,
        totalDurationMs: 0,
        allPassed: true,
      };
    }

    if (this.options.verbose) {
      console.log(`Found ${files.length} test file(s)`);
      console.log('');
    }

    // Execute batch
    const batch = await executeBatch(files, this.options, (result, _index, _total) => {
      if (this.options.outputFormat === 'pretty') {
        console.log(formatTestResult(result, this.options.verbose));
      }
    });

    // Print summary
    if (this.options.outputFormat === 'pretty') {
      console.log(formatBatchSummary(batch));
    } else {
      console.log(formatBatchAsJson(batch));
    }

    return batch;
  }

  /**
   * Run tests from multiple patterns.
   */
  async runMultiple(patterns: string[], basePath?: string): Promise<BatchResult> {
    // Collect all files from all patterns
    const allFiles = new Set<string>();
    for (const pattern of patterns) {
      const patternFiles = discoverFiles(pattern, basePath);
      patternFiles.forEach(f => allFiles.add(f));
    }

    // Sort for deterministic order
    const files = Array.from(allFiles).sort();

    if (files.length === 0) {
      console.error(`No test files found matching: ${patterns.join(', ')}`);
      return {
        results: [],
        total: 0,
        passed: 0,
        failed: 0,
        totalDurationMs: 0,
        allPassed: true,
      };
    }

    if (this.options.verbose) {
      console.log(`Found ${files.length} test file(s)`);
      console.log('');
    }

    // Execute batch
    const batch = await executeBatch(files, this.options, (result, _index, _total) => {
      if (this.options.outputFormat === 'pretty') {
        console.log(formatTestResult(result, this.options.verbose));
      }
    });

    // Print summary
    if (this.options.outputFormat === 'pretty') {
      console.log(formatBatchSummary(batch));
    } else {
      console.log(formatBatchAsJson(batch));
    }

    return batch;
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createRegressionRunner(
  options?: Partial<RegressionRunnerOptions>
): RegressionRunner {
  return new RegressionRunner(options);
}
