/**
 * VectorSheet Headless Test Harness - Types
 *
 * Command protocol and output types for stdin/stdout testing.
 */

// =============================================================================
// Command Types
// =============================================================================

export type CommandType =
  // Cell operations
  | 'SET'           // SET A1 100 | SET A1 =SUM(B1:B10)
  | 'GET'           // GET A1
  | 'DELETE'        // DELETE A1 | DELETE A1:B10
  | 'CLEAR'         // CLEAR (all) | CLEAR A1:B10

  // Range operations
  | 'GET_RANGE'     // GET_RANGE A1:B10
  | 'FILL'          // FILL <up|down|left|right> <count>

  // Clipboard operations
  | 'COPY'          // COPY A1:B3
  | 'CUT'           // CUT A1:B3
  | 'PASTE'         // PASTE C1 [all|values|formats|formulas]

  // Format operations
  | 'FORMAT'        // FORMAT A1:B10 {"bold":true,"fontSize":12}
  | 'FORMAT_RANGE'  // FORMAT_RANGE A1:B10 bold=true (legacy)
  | 'NUMBER_FORMAT' // NUMBER_FORMAT A1 #,##0.00

  // Format painter
  | 'PAINTER_PICK'  // PAINTER_PICK A1:B2 [persistent]
  | 'PAINTER_APPLY' // PAINTER_APPLY C1:D4

  // Merge operations
  | 'MERGE'         // MERGE A1:B2
  | 'UNMERGE'       // UNMERGE A1:B2
  | 'GET_MERGE'     // GET_MERGE A1

  // Selection
  | 'SELECT'        // SELECT A1 | SELECT A1:B10
  | 'GET_SELECTION' // GET_SELECTION

  // Find/Replace
  | 'FIND'          // FIND "text" [options]
  | 'REPLACE'       // REPLACE "old" "new" [options]
  | 'REPLACE_ALL'   // REPLACE_ALL "old" "new" [options]

  // Sort/Filter (with JSON support)
  | 'SORT'          // SORT A1:D10 [{"col":"B","dir":"asc"}]
  | 'FILTER'        // FILTER A1:D10 {"col":0,"values":["a","b"]}
  | 'CLEAR_FILTER'  // CLEAR_FILTER A1:D10

  // Validation (with JSON support)
  | 'VALIDATE'      // VALIDATE A1 100
  | 'VALIDATE_ADD'  // VALIDATE_ADD A1:A10 {"type":"list","values":["Yes","No"]}
  | 'VALIDATE_REMOVE' // VALIDATE_REMOVE rule_id
  | 'ADD_VALIDATION'// ADD_VALIDATION A1:A10 type=list items=a,b,c (legacy)
  | 'REMOVE_VALIDATION' // REMOVE_VALIDATION rule_id (legacy)

  // Conditional formatting (with JSON support)
  | 'COND_ADD'      // COND_ADD A1:A10 {"type":"gt","value":100,"format":{"color":"red"}}
  | 'COND_REMOVE'   // COND_REMOVE rule_id
  | 'ADD_CF_RULE'   // ADD_CF_RULE A1:A10 type=cellValue operator=greaterThan value=100 (legacy)
  | 'REMOVE_CF_RULE'// REMOVE_CF_RULE rule_id (legacy)
  | 'EVAL_CF'       // EVAL_CF A1 100

  // History
  | 'UNDO'          // UNDO
  | 'REDO'          // REDO
  | 'BEGIN_BATCH'   // BEGIN_BATCH "description"
  | 'END_BATCH'     // END_BATCH

  // State inspection
  | 'SNAPSHOT'      // SNAPSHOT (full state)
  | 'DIFF'          // DIFF (changes since last snapshot)
  | 'STATS'         // STATS (engine statistics)
  | 'DUMP'          // DUMP A1:B10 (dump range as table)

  // Utility
  | 'ECHO'          // ECHO message (for debugging)
  | 'SLEEP'         // SLEEP 100 (ms, for timing tests)
  | 'ASSERT'        // ASSERT A1 == 100
  | 'ASSERT_ERROR'  // ASSERT_ERROR (next command should fail)

  // Control
  | 'RESET'         // RESET (clear all state)
  | 'QUIT';         // QUIT

export interface ParsedCommand {
  type: CommandType;
  args: string[];
  options: Record<string, string | boolean | number>;
  raw: string;
  lineNumber: number;
}

// =============================================================================
// Output Types
// =============================================================================

export type OutputType =
  | 'result'    // Command result
  | 'value'     // Cell/range value
  | 'snapshot'  // Full state snapshot
  | 'diff'      // State diff
  | 'error'     // Error message
  | 'info'      // Info message
  | 'stats'     // Statistics
  | 'table'     // Tabular data dump
  | 'assert'    // Assertion result
  | 'echo';     // Echo output

export interface OutputBase {
  type: OutputType;
  timestamp: number;
  command?: string;
  lineNumber?: number;
}

export interface ResultOutput extends OutputBase {
  type: 'result';
  success: boolean;
  data?: unknown;
}

export interface ValueOutput extends OutputBase {
  type: 'value';
  cell?: { row: number; col: number };
  range?: { startRow: number; startCol: number; endRow: number; endCol: number };
  value: unknown;
}

export interface SnapshotOutput extends OutputBase {
  type: 'snapshot';
  cells: Record<string, CellSnapshot>;
  selection: SelectionSnapshot | null;
  usedRange: RangeSnapshot;
  stats: StatsSnapshot;
}

export interface DiffOutput extends OutputBase {
  type: 'diff';
  changes: CellChange[];
  selectionChanged: boolean;
}

export interface ErrorOutput extends OutputBase {
  type: 'error';
  message: string;
  stack?: string;
}

export interface InfoOutput extends OutputBase {
  type: 'info';
  message: string;
}

export interface StatsOutput extends OutputBase {
  type: 'stats';
  cellCount: number;
  formulaCount: number;
  memoryKB: number;
  undoStackSize: number;
  redoStackSize: number;
}

export interface TableOutput extends OutputBase {
  type: 'table';
  headers: string[];
  rows: string[][];
}

export interface AssertOutput extends OutputBase {
  type: 'assert';
  passed: boolean;
  expected: unknown;
  actual: unknown;
  message?: string;
}

export interface EchoOutput extends OutputBase {
  type: 'echo';
  message: string;
}

export type Output =
  | ResultOutput
  | ValueOutput
  | SnapshotOutput
  | DiffOutput
  | ErrorOutput
  | InfoOutput
  | StatsOutput
  | TableOutput
  | AssertOutput
  | EchoOutput;

// =============================================================================
// Snapshot Types
// =============================================================================

export interface CellSnapshot {
  value: string | number | boolean | null;
  formula?: string;
  type: string;
  format?: Record<string, unknown>;
}

export interface SelectionSnapshot {
  activeCell: { row: number; col: number };
  ranges: Array<{ startRow: number; startCol: number; endRow: number; endCol: number }>;
}

export interface RangeSnapshot {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface StatsSnapshot {
  cellCount: number;
  formulaCount: number;
}

export interface CellChange {
  row: number;
  col: number;
  address: string;
  before: CellSnapshot | null;
  after: CellSnapshot | null;
}

// =============================================================================
// Harness Configuration
// =============================================================================

export interface HarnessConfig {
  /** Output format: 'json' (one JSON per line) or 'pretty' (human readable) */
  outputFormat: 'json' | 'pretty';
  /** Include timestamps in output */
  includeTimestamps: boolean;
  /** Include line numbers in output */
  includeLineNumbers: boolean;
  /** Stop on first error */
  stopOnError: boolean;
  /** Echo commands before executing */
  echoCommands: boolean;
  /** Verbose mode (extra logging) */
  verbose: boolean;

  // === Safety Configuration ===
  /** Per-command timeout in milliseconds (default: 2000ms) */
  commandTimeoutMs: number;
  /** Maximum commands per script execution (default: 10000) */
  maxStepsPerScript: number;
  /** Maximum SLEEP duration in ms (default: 10000ms) */
  maxSleepMs: number;
  /** Continue execution on timeout (vs. abort script) */
  continueOnTimeout: boolean;
}

export const DEFAULT_CONFIG: HarnessConfig = {
  outputFormat: 'json',
  includeTimestamps: true,
  includeLineNumbers: true,
  stopOnError: false,
  echoCommands: false,
  verbose: false,
  // Safety defaults
  commandTimeoutMs: 2000,
  maxStepsPerScript: 10000,
  maxSleepMs: 10000,
  continueOnTimeout: false,
};

// =============================================================================
// Safety Error Types
// =============================================================================

export interface TimeoutErrorOutput extends OutputBase {
  type: 'error';
  message: string;
  errorType: 'CommandTimeout';
  timeoutMs: number;
}

export interface StepLimitErrorOutput extends OutputBase {
  type: 'error';
  message: string;
  errorType: 'StepLimitExceeded';
  stepCount: number;
  maxSteps: number;
}

export interface AbortErrorOutput extends OutputBase {
  type: 'error';
  message: string;
  errorType: 'ScriptAborted';
  reason: string;
}
