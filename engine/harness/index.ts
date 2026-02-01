/**
 * VectorSheet Headless Test Harness - Module Exports
 *
 * A text-based testing harness for the VectorSheet engine.
 * Enables automated testing via stdin/stdout command protocol.
 */

export { CommandParser, createCommandParser, ParseError } from './CommandParser.js';
export { parseA1Reference, parseA1Range, toA1Reference } from './CommandParser.js';

export { HarnessRunner, createHarnessRunner, CommandTimeoutError } from './HarnessRunner.js';

export {
  RegressionRunner,
  createRegressionRunner,
  discoverFiles,
  executeTestFile,
  executeBatch,
  getGoldenPath,
  loadGoldenFile,
  saveGoldenFile,
  outputsToGoldenContent,
  compareGolden,
  formatTestResult,
  formatBatchSummary,
  formatBatchAsJson,
} from './RegressionRunner.js';

export type {
  CommandType,
  ParsedCommand,
  OutputType,
  Output,
  OutputBase,
  ResultOutput,
  ValueOutput,
  SnapshotOutput,
  DiffOutput,
  ErrorOutput,
  InfoOutput,
  StatsOutput,
  TableOutput,
  AssertOutput,
  EchoOutput,
  CellSnapshot,
  SelectionSnapshot,
  RangeSnapshot,
  StatsSnapshot,
  CellChange,
  HarnessConfig,
  TimeoutErrorOutput,
  StepLimitErrorOutput,
  AbortErrorOutput,
} from './types.js';

export type {
  ErrorType,
  TestFileResult,
  BatchResult,
  RegressionRunnerOptions,
} from './RegressionRunner.js';

export { DEFAULT_CONFIG } from './types.js';
export { DEFAULT_REGRESSION_OPTIONS } from './RegressionRunner.js';
