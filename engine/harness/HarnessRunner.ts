/**
 * VectorSheet Headless Test Harness - Runner
 *
 * Executes parsed commands against the SpreadsheetEngine
 * and produces structured output.
 */

import {
  ParsedCommand,
  Output,
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
  CellChange,
  HarnessConfig,
  DEFAULT_CONFIG,
} from './types.js';
import { parseA1Reference, parseA1Range, toA1Reference } from './CommandParser.js';
import { SpreadsheetEngine } from '../core/SpreadsheetEngine.js';
import { SparseDataStore } from '../core/data/SparseDataStore.js';
import { MergeManager } from '../core/formatting/MergeManager.js';
import { FindReplace } from '../core/operations/FindReplace.js';
import { SortFilter, SortRule } from '../core/operations/SortFilter.js';
import { DataValidation, ValidationType, ValidationOperator } from '../core/validation/DataValidation.js';
import { ConditionalFormatting } from '../core/formatting/ConditionalFormatting.js';
import { UndoRedoManager } from '../core/history/UndoRedoManager.js';
import { ClipboardManager, PasteType } from '../core/clipboard/ClipboardManager.js';
import { FillSeries, FillDirection } from '../core/clipboard/FillSeries.js';
import {
  FormatPainter,
  createFormatReaderFromDataStore,
  createFormatWriterFromDataStore,
} from '../core/formatting/FormatPainter.js';
import { CellRange, CellFormat, Cell } from '../core/types/index.js';
import {
  TimeoutErrorOutput,
  StepLimitErrorOutput,
  AbortErrorOutput,
} from './types.js';

// =============================================================================
// Custom Error Classes
// =============================================================================

/**
 * Error thrown when a command exceeds its timeout.
 */
export class CommandTimeoutError extends Error {
  command: string;
  timeoutMs: number;

  constructor(command: string, timeoutMs: number) {
    super(`Command timed out after ${timeoutMs}ms: ${command}`);
    this.name = 'CommandTimeoutError';
    this.command = command;
    this.timeoutMs = timeoutMs;
  }
}

// =============================================================================
// Harness Runner
// =============================================================================

export class HarnessRunner {
  private config: HarnessConfig;
  private engine: SpreadsheetEngine;
  private dataStore: SparseDataStore;

  // Additional components
  private mergeManager: MergeManager;
  private findReplace: FindReplace;
  private sortFilter: SortFilter;
  private validation: DataValidation;
  private conditionalFormatting: ConditionalFormatting;
  private undoRedo: UndoRedoManager;
  private clipboard: ClipboardManager;
  private fillSeries: FillSeries;
  private formatPainter: FormatPainter;

  // State tracking for diffs
  private lastSnapshot: Map<string, CellSnapshot> = new Map();
  private expectError: boolean = false;

  // === Safety state ===
  /** Abort controller for cancellation */
  private abortController: AbortController | null = null;
  /** Current step count in script execution */
  private stepCount: number = 0;
  /** Whether the runner is currently executing */
  private isExecuting: boolean = false;

  // Output handler
  private outputHandler: (output: Output) => void;

  constructor(
    config: Partial<HarnessConfig> = {},
    outputHandler?: (output: Output) => void
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.outputHandler = outputHandler ?? this.defaultOutputHandler.bind(this);

    // Initialize engine and components
    this.engine = new SpreadsheetEngine();
    this.dataStore = this.engine.getComponents().dataStore;

    // Initialize additional components
    this.mergeManager = new MergeManager();
    this.findReplace = new FindReplace(this.dataStore, this.dataStore);
    this.sortFilter = new SortFilter(this.dataStore, this.dataStore);
    this.validation = new DataValidation();
    this.conditionalFormatting = new ConditionalFormatting();
    this.undoRedo = new UndoRedoManager();
    this.undoRedo.setTarget(this.dataStore);
    this.clipboard = new ClipboardManager(this.dataStore);
    this.fillSeries = new FillSeries();
    this.formatPainter = new FormatPainter();

    // Take initial snapshot
    this.takeSnapshot();
  }

  // ===========================================================================
  // Command Execution
  // ===========================================================================

  /**
   * Execute a single command with timeout protection.
   * This is the primary async entry point for command execution.
   */
  async execute(cmd: ParsedCommand): Promise<Output> {
    // Check for abort
    if (this.abortController?.signal.aborted) {
      return this.createAbortError('Script was aborted', cmd);
    }

    try {
      if (this.config.echoCommands) {
        this.emit(this.createEcho(cmd.raw, cmd));
      }

      // Execute with timeout protection
      const result = await this.executeWithTimeout(cmd);

      // Check if we expected an error but didn't get one
      if (this.expectError) {
        this.expectError = false;
        return this.createError('Expected error but command succeeded', cmd);
      }

      return result;
    } catch (error) {
      // Check if error was expected
      if (this.expectError) {
        this.expectError = false;
        return this.createResult(true, { expectedError: true }, cmd);
      }

      const err = error instanceof Error ? error : new Error(String(error));
      return this.createError(err.message, cmd, err.stack);
    }
  }

  /**
   * Execute a command with timeout wrapper.
   * @internal
   */
  private async executeWithTimeout(cmd: ParsedCommand): Promise<Output> {
    const timeoutMs = this.config.commandTimeoutMs;

    // Create a promise that rejects after timeout
    const timeoutPromise = new Promise<Output>((_, reject) => {
      setTimeout(() => {
        reject(new CommandTimeoutError(cmd.raw, timeoutMs));
      }, timeoutMs);
    });

    // Race between command execution and timeout
    try {
      return await Promise.race([
        this.executeCommand(cmd),
        timeoutPromise,
      ]);
    } catch (error) {
      if (error instanceof CommandTimeoutError) {
        return this.createTimeoutError(error.command, error.timeoutMs, cmd);
      }
      throw error;
    }
  }

  /**
   * Execute multiple commands with step limit protection.
   */
  async executeAll(commands: ParsedCommand[]): Promise<Output[]> {
    const outputs: Output[] = [];
    this.stepCount = 0;
    this.abortController = new AbortController();
    this.isExecuting = true;

    try {
      for (const cmd of commands) {
        // Check abort signal
        if (this.abortController.signal.aborted) {
          outputs.push(this.createAbortError('Script was aborted', cmd));
          break;
        }

        // Check step limit
        this.stepCount++;
        if (this.stepCount > this.config.maxStepsPerScript) {
          outputs.push(this.createStepLimitError(this.stepCount, this.config.maxStepsPerScript, cmd));
          break;
        }

        const output = await this.execute(cmd);
        outputs.push(output);
        this.emit(output);

        // Handle timeout error based on config
        if (output.type === 'error') {
          const errorOutput = output as ErrorOutput & { errorType?: string };
          if (errorOutput.errorType === 'CommandTimeout' && !this.config.continueOnTimeout) {
            break;
          }
          if (this.config.stopOnError) {
            break;
          }
        }

        if (cmd.type === 'QUIT') {
          break;
        }
      }
    } finally {
      this.isExecuting = false;
      this.abortController = null;
    }

    return outputs;
  }

  /**
   * Route command to appropriate handler.
   * Returns a promise to support async commands like SLEEP.
   */
  private async executeCommand(cmd: ParsedCommand): Promise<Output> {
    switch (cmd.type) {
      // Cell operations
      case 'SET': return this.cmdSet(cmd);
      case 'GET': return this.cmdGet(cmd);
      case 'DELETE': return this.cmdDelete(cmd);
      case 'CLEAR': return this.cmdClear(cmd);

      // Range operations
      case 'GET_RANGE': return this.cmdGetRange(cmd);
      case 'FILL': return this.cmdFill(cmd);

      // Clipboard operations
      case 'COPY': return this.cmdCopy(cmd);
      case 'CUT': return this.cmdCut(cmd);
      case 'PASTE': return this.cmdPaste(cmd);

      // Format operations
      case 'FORMAT': return this.cmdFormat(cmd);
      case 'FORMAT_RANGE': return this.cmdFormatRange(cmd);
      case 'NUMBER_FORMAT': return this.cmdNumberFormat(cmd);

      // Format painter
      case 'PAINTER_PICK': return this.cmdPainterPick(cmd);
      case 'PAINTER_APPLY': return this.cmdPainterApply(cmd);

      // Merge operations
      case 'MERGE': return this.cmdMerge(cmd);
      case 'UNMERGE': return this.cmdUnmerge(cmd);
      case 'GET_MERGE': return this.cmdGetMerge(cmd);

      // Selection
      case 'SELECT': return this.cmdSelect(cmd);
      case 'GET_SELECTION': return this.cmdGetSelection(cmd);

      // Find/Replace
      case 'FIND': return this.cmdFind(cmd);
      case 'REPLACE': return this.cmdReplace(cmd);
      case 'REPLACE_ALL': return this.cmdReplaceAll(cmd);

      // Sort/Filter
      case 'SORT': return this.cmdSort(cmd);
      case 'FILTER': return this.cmdFilter(cmd);
      case 'CLEAR_FILTER': return this.cmdClearFilter(cmd);

      // Validation
      case 'VALIDATE': return this.cmdValidate(cmd);
      case 'VALIDATE_ADD': return this.cmdValidateAdd(cmd);
      case 'VALIDATE_REMOVE': return this.cmdValidateRemove(cmd);
      case 'ADD_VALIDATION': return this.cmdAddValidation(cmd); // legacy
      case 'REMOVE_VALIDATION': return this.cmdRemoveValidation(cmd); // legacy

      // Conditional formatting
      case 'COND_ADD': return this.cmdCondAdd(cmd);
      case 'COND_REMOVE': return this.cmdCondRemove(cmd);
      case 'ADD_CF_RULE': return this.cmdAddCFRule(cmd); // legacy
      case 'REMOVE_CF_RULE': return this.cmdRemoveCFRule(cmd); // legacy
      case 'EVAL_CF': return this.cmdEvalCF(cmd);

      // History
      case 'UNDO': return this.cmdUndo(cmd);
      case 'REDO': return this.cmdRedo(cmd);
      case 'BEGIN_BATCH': return this.cmdBeginBatch(cmd);
      case 'END_BATCH': return this.cmdEndBatch(cmd);

      // State inspection
      case 'SNAPSHOT': return this.cmdSnapshot(cmd);
      case 'DIFF': return this.cmdDiff(cmd);
      case 'STATS': return this.cmdStats(cmd);
      case 'DUMP': return this.cmdDump(cmd);

      // Utility
      case 'ECHO': return this.cmdEcho(cmd);
      case 'SLEEP': return await this.cmdSleep(cmd); // Async SLEEP
      case 'ASSERT': return this.cmdAssert(cmd);
      case 'ASSERT_ERROR': return this.cmdAssertError(cmd);

      // Control
      case 'RESET': return this.cmdReset(cmd);
      case 'QUIT': return this.cmdQuit(cmd);

      default:
        throw new Error(`Unhandled command: ${cmd.type}`);
    }
  }

  // ===========================================================================
  // Cell Commands
  // ===========================================================================

  private cmdSet(cmd: ParsedCommand): Output {
    const [cellRef, ...valueParts] = cmd.args;
    if (!cellRef) throw new Error('SET requires cell reference');

    const cell = parseA1Reference(cellRef);
    if (!cell) throw new Error(`Invalid cell reference: ${cellRef}`);

    const valueStr = valueParts.join(' ');
    let value: string | number | boolean | null = valueStr;

    // Parse value type
    if (valueStr === '' || valueStr.toLowerCase() === 'null') {
      value = null;
    } else if (valueStr.toLowerCase() === 'true') {
      value = true;
    } else if (valueStr.toLowerCase() === 'false') {
      value = false;
    } else if (!valueStr.startsWith('=') && !isNaN(parseFloat(valueStr))) {
      value = parseFloat(valueStr);
    }

    this.engine.setCellValue(cell.row, cell.col, value);

    return this.createResult(true, { cell: cellRef, value }, cmd);
  }

  private cmdGet(cmd: ParsedCommand): Output {
    const [cellRef] = cmd.args;
    if (!cellRef) throw new Error('GET requires cell reference');

    const cell = parseA1Reference(cellRef);
    if (!cell) throw new Error(`Invalid cell reference: ${cellRef}`);

    const cellData = this.engine.getCell(cell.row, cell.col);
    const displayValue = this.engine.getCellDisplayValue(cell.row, cell.col);

    return this.createValue(
      { row: cell.row, col: cell.col },
      {
        raw: cellData?.value,
        display: displayValue,
        formula: cellData?.formula,
        type: cellData?.type,
      },
      cmd
    );
  }

  private cmdDelete(cmd: ParsedCommand): Output {
    const [ref] = cmd.args;
    if (!ref) throw new Error('DELETE requires cell or range reference');

    const range = parseA1Range(ref);
    if (!range) throw new Error(`Invalid reference: ${ref}`);

    let count = 0;
    for (let row = range.startRow; row <= range.endRow; row++) {
      for (let col = range.startCol; col <= range.endCol; col++) {
        this.dataStore.deleteCell(row, col);
        count++;
      }
    }

    return this.createResult(true, { deleted: count }, cmd);
  }

  private cmdClear(cmd: ParsedCommand): Output {
    const [ref] = cmd.args;

    if (!ref) {
      // Clear all
      this.engine.clear();
      return this.createResult(true, { cleared: 'all' }, cmd);
    }

    const range = parseA1Range(ref);
    if (!range) throw new Error(`Invalid range: ${ref}`);

    for (let row = range.startRow; row <= range.endRow; row++) {
      for (let col = range.startCol; col <= range.endCol; col++) {
        this.dataStore.deleteCell(row, col);
      }
    }

    return this.createResult(true, { cleared: ref }, cmd);
  }

  // ===========================================================================
  // Range Commands
  // ===========================================================================

  private cmdGetRange(cmd: ParsedCommand): Output {
    const [rangeRef] = cmd.args;
    if (!rangeRef) throw new Error('GET_RANGE requires range reference');

    const range = parseA1Range(rangeRef);
    if (!range) throw new Error(`Invalid range: ${rangeRef}`);

    const values: (string | number | boolean | null)[][] = [];

    for (let row = range.startRow; row <= range.endRow; row++) {
      const rowValues: (string | number | boolean | null)[] = [];
      for (let col = range.startCol; col <= range.endCol; col++) {
        const cell = this.dataStore.getCell(row, col);
        rowValues.push(cell?.value ?? null);
      }
      values.push(rowValues);
    }

    return this.createValue(undefined, values, cmd, range);
  }

  /**
   * FILL <direction> <count>
   * Fills from the current selection in the specified direction.
   * Uses FillSeries for intelligent pattern detection.
   *
   * Examples:
   *   FILL down 5
   *   FILL right 3
   *   FILL up 2
   *   FILL left 4
   */
  private cmdFill(cmd: ParsedCommand): Output {
    const [directionArg, countArg] = cmd.args;
    if (!directionArg) throw new Error('FILL requires direction (up|down|left|right)');

    const direction = directionArg.toLowerCase() as FillDirection;
    if (!['down', 'up', 'left', 'right'].includes(direction)) {
      throw new Error(`Invalid direction: ${directionArg}. Use: up, down, left, right`);
    }

    const count = parseInt(countArg ?? '1', 10);
    if (isNaN(count) || count < 1) {
      throw new Error(`Invalid count: ${countArg}. Must be positive integer`);
    }

    // Get current selection
    const selection = this.engine.getSelection();
    if (!selection || selection.ranges.length === 0) {
      throw new Error('FILL requires a selection. Use SELECT first.');
    }

    const sourceRange = selection.ranges[0];
    let filledCells = 0;

    if (direction === 'down' || direction === 'up') {
      // Fill vertically - source is first/last row
      const sourceRow = direction === 'down' ? sourceRange.startRow : sourceRange.endRow;
      const sourceCells: (Cell | null)[] = [];
      for (let col = sourceRange.startCol; col <= sourceRange.endCol; col++) {
        sourceCells.push(this.dataStore.getCell(sourceRow, col));
      }

      // Analyze pattern using FillSeries
      const pattern = this.fillSeries.analyze(sourceCells);

      // Generate fill values
      const fillResult = this.fillSeries.generate(pattern, count, direction);

      // Apply fill values
      for (let i = 0; i < count; i++) {
        const targetRow = direction === 'down'
          ? sourceRange.endRow + 1 + i
          : sourceRange.startRow - 1 - i;

        if (targetRow < 0) continue;

        for (let col = sourceRange.startCol; col <= sourceRange.endCol; col++) {
          const colIndex = col - sourceRange.startCol;
          const fillValue = fillResult.values[i * sourceCells.length + colIndex];

          if (fillValue) {
            this.dataStore.setCell(targetRow, col, {
              value: fillValue.value,
              type: fillValue.type,
              formula: fillValue.formula,
            });
            filledCells++;
          }
        }
      }
    } else {
      // Fill horizontally - source is first/last column
      const sourceCol = direction === 'right' ? sourceRange.startCol : sourceRange.endCol;
      const sourceCells: (Cell | null)[] = [];
      for (let row = sourceRange.startRow; row <= sourceRange.endRow; row++) {
        sourceCells.push(this.dataStore.getCell(row, sourceCol));
      }

      // Analyze pattern using FillSeries
      const pattern = this.fillSeries.analyze(sourceCells);

      // Generate fill values
      const fillResult = this.fillSeries.generate(pattern, count, direction);

      // Apply fill values
      for (let i = 0; i < count; i++) {
        const targetCol = direction === 'right'
          ? sourceRange.endCol + 1 + i
          : sourceRange.startCol - 1 - i;

        if (targetCol < 0) continue;

        for (let row = sourceRange.startRow; row <= sourceRange.endRow; row++) {
          const rowIndex = row - sourceRange.startRow;
          const fillValue = fillResult.values[i * sourceCells.length + rowIndex];

          if (fillValue) {
            this.dataStore.setCell(row, targetCol, {
              value: fillValue.value,
              type: fillValue.type,
              formula: fillValue.formula,
            });
            filledCells++;
          }
        }
      }
    }

    return this.createResult(true, {
      direction,
      count,
      filledCells,
    }, cmd);
  }

  // ===========================================================================
  // Clipboard Commands
  // ===========================================================================

  /**
   * COPY <range>
   * Copy cells to clipboard.
   *
   * Example: COPY A1:B3
   */
  private cmdCopy(cmd: ParsedCommand): Output {
    const [rangeRef] = cmd.args;
    if (!rangeRef) throw new Error('COPY requires range reference');

    const range = parseA1Range(rangeRef);
    if (!range) throw new Error(`Invalid range: ${rangeRef}`);

    const clipboardData = this.clipboard.copyRange(range);

    return this.createResult(true, {
      range: rangeRef,
      rows: clipboardData.rows,
      cols: clipboardData.cols,
      cellCount: clipboardData.cells.length,
    }, cmd);
  }

  /**
   * CUT <range>
   * Cut cells to clipboard (will be cleared after paste).
   *
   * Example: CUT A1:B3
   */
  private cmdCut(cmd: ParsedCommand): Output {
    const [rangeRef] = cmd.args;
    if (!rangeRef) throw new Error('CUT requires range reference');

    const range = parseA1Range(rangeRef);
    if (!range) throw new Error(`Invalid range: ${rangeRef}`);

    const clipboardData = this.clipboard.cutRange(range);

    return this.createResult(true, {
      range: rangeRef,
      rows: clipboardData.rows,
      cols: clipboardData.cols,
      cellCount: clipboardData.cells.length,
      isCut: true,
    }, cmd);
  }

  /**
   * PASTE <cell> [all|values|formats|formulas]
   * Paste clipboard at target cell.
   *
   * Examples:
   *   PASTE C1
   *   PASTE C1 values
   *   PASTE C1 formats
   *   PASTE C1 formulas
   *   PASTE C1 all
   */
  private cmdPaste(cmd: ParsedCommand): Output {
    const [cellRef, modeArg] = cmd.args;
    if (!cellRef) throw new Error('PASTE requires target cell reference');

    const cell = parseA1Reference(cellRef);
    if (!cell) throw new Error(`Invalid cell reference: ${cellRef}`);

    if (!this.clipboard.hasData()) {
      throw new Error('Clipboard is empty. Use COPY or CUT first.');
    }

    // Parse paste mode
    const validModes = ['all', 'values', 'formats', 'formulas', 'valuesAndFormats'];
    const mode: PasteType = validModes.includes(modeArg?.toLowerCase() ?? '')
      ? (modeArg?.toLowerCase() as PasteType)
      : 'all';

    const result = this.clipboard.paste(cell, mode);

    if (!result.success) {
      throw new Error(result.error ?? 'Paste failed');
    }

    // Clear source cells if this was a cut operation
    if (this.clipboard.isCutOperation()) {
      const sourceRange = this.clipboard.getSourceRange();
      if (sourceRange) {
        for (let row = sourceRange.startRow; row <= sourceRange.endRow; row++) {
          for (let col = sourceRange.startCol; col <= sourceRange.endCol; col++) {
            this.dataStore.deleteCell(row, col);
          }
        }
      }
      // Clear clipboard after cut-paste
      this.clipboard.clear();
    }

    return this.createResult(true, {
      target: cellRef,
      mode,
      pastedCells: result.pastedCells.length,
    }, cmd);
  }

  // ===========================================================================
  // Format Commands
  // ===========================================================================

  /**
   * FORMAT <range> <json>
   * Apply formatting to a range using JSON specification.
   *
   * Examples:
   *   FORMAT A1 {"bold":true}
   *   FORMAT A1:B10 {"bold":true,"fontSize":14,"backgroundColor":"#ff0"}
   */
  private cmdFormat(cmd: ParsedCommand): Output {
    const [rangeRef, ...jsonParts] = cmd.args;
    if (!rangeRef) throw new Error('FORMAT requires range reference');

    const range = parseA1Range(rangeRef);
    if (!range) throw new Error(`Invalid range: ${rangeRef}`);

    // Parse format from JSON or options
    let format: Partial<CellFormat>;
    const jsonStr = jsonParts.join(' ');

    if (jsonStr.startsWith('{')) {
      // JSON format
      format = this.parseJSON(jsonStr, 'FORMAT');
    } else if (Object.keys(cmd.options).length > 0) {
      // Legacy key=value format
      format = this.parseFormatOptions(cmd.options);
    } else {
      throw new Error('FORMAT requires JSON format or key=value options');
    }

    // Apply format to range
    for (let row = range.startRow; row <= range.endRow; row++) {
      for (let col = range.startCol; col <= range.endCol; col++) {
        this.engine.setCellFormat(row, col, format);
      }
    }

    return this.createResult(true, { range: rangeRef, format }, cmd);
  }

  private cmdFormatRange(cmd: ParsedCommand): Output {
    const [rangeRef] = cmd.args;
    if (!rangeRef) throw new Error('FORMAT_RANGE requires range reference');

    const range = parseA1Range(rangeRef);
    if (!range) throw new Error(`Invalid range: ${rangeRef}`);

    const format = this.parseFormatOptions(cmd.options);

    for (let row = range.startRow; row <= range.endRow; row++) {
      for (let col = range.startCol; col <= range.endCol; col++) {
        this.engine.setCellFormat(row, col, format);
      }
    }

    return this.createResult(true, { range: rangeRef, format }, cmd);
  }

  private cmdNumberFormat(cmd: ParsedCommand): Output {
    const [cellRef, formatStr] = cmd.args;
    if (!cellRef || !formatStr) throw new Error('NUMBER_FORMAT requires cell and format');

    const cell = parseA1Reference(cellRef);
    if (!cell) throw new Error(`Invalid cell reference: ${cellRef}`);

    this.engine.setCellFormat(cell.row, cell.col, { numberFormat: formatStr });

    return this.createResult(true, { cell: cellRef, numberFormat: formatStr }, cmd);
  }

  // ===========================================================================
  // Format Painter Commands
  // ===========================================================================

  /**
   * PAINTER_PICK <range> [persistent]
   * Pick format from a range for painting.
   *
   * Examples:
   *   PAINTER_PICK A1
   *   PAINTER_PICK A1:B2
   *   PAINTER_PICK A1 persistent
   */
  private cmdPainterPick(cmd: ParsedCommand): Output {
    const [rangeRef, modeArg] = cmd.args;
    if (!rangeRef) throw new Error('PAINTER_PICK requires range reference');

    const range = parseA1Range(rangeRef);
    if (!range) throw new Error(`Invalid range: ${rangeRef}`);

    const persistent = modeArg?.toLowerCase() === 'persistent';

    // Create format reader from data store
    const formatReader = createFormatReaderFromDataStore(this.dataStore);

    this.formatPainter.pick(range, formatReader, { persistent });

    const state = this.formatPainter.getState();

    return this.createResult(true, {
      range: rangeRef,
      mode: state.mode,
      formatCount: state.formats.length,
    }, cmd);
  }

  /**
   * PAINTER_APPLY <range>
   * Apply picked format to target range.
   *
   * Example: PAINTER_APPLY C1:D4
   */
  private cmdPainterApply(cmd: ParsedCommand): Output {
    const [rangeRef] = cmd.args;
    if (!rangeRef) throw new Error('PAINTER_APPLY requires range reference');

    const range = parseA1Range(rangeRef);
    if (!range) throw new Error(`Invalid range: ${rangeRef}`);

    if (!this.formatPainter.isActive()) {
      throw new Error('Format painter is not active. Use PAINTER_PICK first.');
    }

    // Create format writer from data store (cast needed due to type strictness)
    const formatWriter = createFormatWriterFromDataStore(this.dataStore as Parameters<typeof createFormatWriterFromDataStore>[0]);

    const result = this.formatPainter.apply(range, formatWriter);

    if (result.error) {
      throw new Error(result.error);
    }

    return this.createResult(true, {
      range: rangeRef,
      modifiedCells: result.modifiedCells.length,
      stillActive: result.stillActive,
    }, cmd);
  }

  private parseFormatOptions(options: Record<string, unknown>): Partial<CellFormat> {
    const format: Partial<CellFormat> = {};

    if ('bold' in options) format.bold = Boolean(options.bold);
    if ('italic' in options) format.italic = Boolean(options.italic);
    if ('underline' in options) format.underline = options.underline ? 1 : 0;
    if ('fontSize' in options) format.fontSize = Number(options.fontSize);
    if ('fontColor' in options) format.fontColor = String(options.fontColor);
    if ('backgroundColor' in options) format.backgroundColor = String(options.backgroundColor);
    if ('horizontalAlign' in options) format.horizontalAlign = String(options.horizontalAlign) as CellFormat['horizontalAlign'];
    if ('verticalAlign' in options) format.verticalAlign = String(options.verticalAlign) as CellFormat['verticalAlign'];
    if ('wrap' in options) format.wrap = Boolean(options.wrap);
    if ('numberFormat' in options) format.numberFormat = String(options.numberFormat);

    return format;
  }

  /**
   * Parse JSON string with error handling.
   */
  private parseJSON<T>(jsonStr: string, commandName: string): T {
    try {
      return JSON.parse(jsonStr) as T;
    } catch (error) {
      throw new Error(`${commandName}: Invalid JSON - ${error instanceof Error ? error.message : 'parse error'}`);
    }
  }

  /**
   * Convert column letter(s) to 0-based index.
   * A -> 0, B -> 1, Z -> 25, AA -> 26, etc.
   */
  private columnLetterToIndex(col: string): number {
    const upper = col.toUpperCase();
    let index = 0;
    for (let i = 0; i < upper.length; i++) {
      index = index * 26 + (upper.charCodeAt(i) - 64);
    }
    return index - 1;
  }

  // ===========================================================================
  // Merge Commands
  // ===========================================================================

  private cmdMerge(cmd: ParsedCommand): Output {
    const [rangeRef] = cmd.args;
    if (!rangeRef) throw new Error('MERGE requires range reference');

    const range = parseA1Range(rangeRef);
    if (!range) throw new Error(`Invalid range: ${rangeRef}`);

    const result = this.mergeManager.merge(range);

    return this.createResult(result.success, result, cmd);
  }

  private cmdUnmerge(cmd: ParsedCommand): Output {
    const [rangeRef] = cmd.args;
    if (!rangeRef) throw new Error('UNMERGE requires range reference');

    const range = parseA1Range(rangeRef);
    if (!range) throw new Error(`Invalid range: ${rangeRef}`);

    const result = this.mergeManager.unmerge(range);

    return this.createResult(result.success, result, cmd);
  }

  private cmdGetMerge(cmd: ParsedCommand): Output {
    const [cellRef] = cmd.args;
    if (!cellRef) throw new Error('GET_MERGE requires cell reference');

    const cell = parseA1Reference(cellRef);
    if (!cell) throw new Error(`Invalid cell reference: ${cellRef}`);

    const mergeInfo = this.mergeManager.getMergeInfo(cell);

    return this.createValue({ row: cell.row, col: cell.col }, mergeInfo, cmd);
  }

  // ===========================================================================
  // Selection Commands
  // ===========================================================================

  private cmdSelect(cmd: ParsedCommand): Output {
    const [ref] = cmd.args;
    if (!ref) throw new Error('SELECT requires cell or range reference');

    const range = parseA1Range(ref);
    if (!range) throw new Error(`Invalid reference: ${ref}`);

    this.engine.setSelection({
      ranges: [range],
      activeCell: { row: range.startRow, col: range.startCol },
      anchorCell: { row: range.startRow, col: range.startCol },
      activeRangeIndex: 0,
    });

    return this.createResult(true, { selected: ref }, cmd);
  }

  private cmdGetSelection(cmd: ParsedCommand): Output {
    const selection = this.engine.getSelection();

    return this.createValue(undefined, selection, cmd);
  }

  // ===========================================================================
  // Find/Replace Commands
  // ===========================================================================

  private cmdFind(cmd: ParsedCommand): Output {
    const [query] = cmd.args;
    if (!query) throw new Error('FIND requires search query');

    const options = {
      caseSensitive: Boolean(cmd.options.caseSensitive),
      wholeCell: Boolean(cmd.options.wholeCell),
      regex: Boolean(cmd.options.regex),
    };

    const matches = this.findReplace.find(query, options);

    return this.createResult(true, { query, matchCount: matches.length, matches }, cmd);
  }

  private cmdReplace(cmd: ParsedCommand): Output {
    const [oldText, newText] = cmd.args;
    if (!oldText || newText === undefined) throw new Error('REPLACE requires old and new text');

    const matches = this.findReplace.find(oldText);
    if (matches.length === 0) {
      return this.createResult(true, { replaced: 0 }, cmd);
    }

    const result = this.findReplace.replace(matches[0], newText);

    return this.createResult(result.success, result, cmd);
  }

  private cmdReplaceAll(cmd: ParsedCommand): Output {
    const [oldText, newText] = cmd.args;
    if (!oldText || newText === undefined) throw new Error('REPLACE_ALL requires old and new text');

    const options = {
      caseSensitive: Boolean(cmd.options.caseSensitive),
      wholeCell: Boolean(cmd.options.wholeCell),
      regex: Boolean(cmd.options.regex),
    };

    const result = this.findReplace.replaceAll(oldText, options, newText);

    return this.createResult(true, result, cmd);
  }

  // ===========================================================================
  // Sort/Filter Commands
  // ===========================================================================

  /**
   * SORT <range> <json>
   * Sort a range using JSON configuration.
   *
   * Examples:
   *   SORT A1:C100 [{"col":"B","dir":"asc"}]
   *   SORT A1:D10 [{"col":0,"dir":"desc"},{"col":1,"dir":"asc"}]
   *   SORT A1:C10 col=0 order=asc (legacy)
   */
  private cmdSort(cmd: ParsedCommand): Output {
    const [rangeRef, ...jsonParts] = cmd.args;
    if (!rangeRef) throw new Error('SORT requires range reference');

    const range = parseA1Range(rangeRef);
    if (!range) throw new Error(`Invalid range: ${rangeRef}`);

    let sortRules: SortRule[];
    const jsonStr = jsonParts.join(' ');

    if (jsonStr.startsWith('[')) {
      // JSON array format
      const configs = this.parseJSON<Array<{ col?: number | string; column?: number | string; dir?: string; order?: string }>>(jsonStr, 'SORT');
      sortRules = configs.map(cfg => {
        const col = cfg.col ?? cfg.column ?? 0;
        const colNum = typeof col === 'string' ? this.columnLetterToIndex(col) : col;
        return {
          column: colNum + range.startCol,
          order: (cfg.dir ?? cfg.order ?? 'asc') as 'asc' | 'desc',
        };
      });
    } else if (Object.keys(cmd.options).length > 0) {
      // Legacy key=value format
      const col = Number(cmd.options.col ?? cmd.options.column ?? 0);
      const order = String(cmd.options.order ?? 'asc') as 'asc' | 'desc';
      sortRules = [{ column: col + range.startCol, order }];
    } else {
      throw new Error('SORT requires JSON array or key=value options');
    }

    const hasHeader = cmd.options.hasHeader !== false;
    const result = this.sortFilter.sort(range, sortRules, { hasHeader });

    return this.createResult(result.success, result, cmd);
  }

  /**
   * FILTER <range> <json>
   * Apply filter to a range using JSON configuration.
   *
   * Examples:
   *   FILTER A1:D10 {"col":0,"values":["a","b"]}
   *   FILTER A1:C10 {"col":"B","condition":"greaterThan","value":100}
   *   FILTER A1:C10 col=0 values=a,b,c (legacy)
   */
  private cmdFilter(cmd: ParsedCommand): Output {
    const [rangeRef, ...jsonParts] = cmd.args;
    if (!rangeRef) throw new Error('FILTER requires range reference');

    const range = parseA1Range(rangeRef);
    if (!range) throw new Error(`Invalid range: ${rangeRef}`);

    const jsonStr = jsonParts.join(' ');

    if (jsonStr.startsWith('{')) {
      // JSON format
      const config = this.parseJSON<{
        col?: number | string;
        column?: number | string;
        values?: string[];
        condition?: string;
        value?: number | string;
      }>(jsonStr, 'FILTER');

      const col = config.col ?? config.column ?? 0;
      const colNum = typeof col === 'string' ? this.columnLetterToIndex(col) : col;
      const absCol = colNum + range.startCol;

      if (config.values) {
        // Value filter
        const result = this.sortFilter.applyValueFilter(range, absCol, new Set(config.values));
        return this.createResult(result.success, result, cmd);
      } else if (config.condition) {
        // Condition filter - pass as array with operator field
        // Map common aliases to FilterOperator values
        const operatorMap: Record<string, string> = {
          equal: 'equals', eq: 'equals', '=': 'equals',
          gt: 'greaterThan', '>': 'greaterThan',
          lt: 'lessThan', '<': 'lessThan',
          gte: 'greaterThanOrEqual', '>=': 'greaterThanOrEqual',
          lte: 'lessThanOrEqual', '<=': 'lessThanOrEqual',
        };
        const operator = operatorMap[config.condition] ?? config.condition;
        const result = this.sortFilter.applyConditionFilter(range, absCol, [{
          operator: operator as 'equals' | 'greaterThan' | 'lessThan' | 'greaterThanOrEqual' | 'lessThanOrEqual',
          value: config.value,
        }]);
        return this.createResult(result.success, result, cmd);
      } else {
        throw new Error('FILTER JSON must include "values" or "condition"');
      }
    } else if (Object.keys(cmd.options).length > 0) {
      // Legacy key=value format
      const col = Number(cmd.options.col ?? cmd.options.column ?? 0);
      const valuesStr = String(cmd.options.values ?? '');
      const values = new Set(valuesStr.split(',').map(v => v.trim()));
      const result = this.sortFilter.applyValueFilter(range, col + range.startCol, values);
      return this.createResult(result.success, result, cmd);
    } else {
      throw new Error('FILTER requires JSON object or key=value options');
    }
  }

  private cmdClearFilter(cmd: ParsedCommand): Output {
    const [rangeRef] = cmd.args;
    if (!rangeRef) throw new Error('CLEAR_FILTER requires range reference');

    const range = parseA1Range(rangeRef);
    if (!range) throw new Error(`Invalid range: ${rangeRef}`);

    const result = this.sortFilter.clearFilter(range);

    return this.createResult(result.success, result, cmd);
  }

  // ===========================================================================
  // Validation Commands
  // ===========================================================================

  private cmdValidate(cmd: ParsedCommand): Output {
    const [cellRef, ...valueParts] = cmd.args;
    if (!cellRef) throw new Error('VALIDATE requires cell reference');

    const cell = parseA1Reference(cellRef);
    if (!cell) throw new Error(`Invalid cell reference: ${cellRef}`);

    const value = valueParts.join(' ');
    const result = this.validation.validate(cell, value);

    return this.createResult(result.isValid, result, cmd);
  }

  /**
   * VALIDATE_ADD <range> <json>
   * Add data validation rule with JSON configuration.
   *
   * Examples:
   *   VALIDATE_ADD A1:A10 {"type":"list","values":["Yes","No"]}
   *   VALIDATE_ADD B1:B10 {"type":"wholeNumber","operator":"between","value1":1,"value2":100}
   *   VALIDATE_ADD C1:C10 {"type":"decimal","operator":"greaterThan","value1":0}
   *   VALIDATE_ADD D1:D10 {"type":"textLength","operator":"lessThanOrEqual","value1":50}
   */
  private cmdValidateAdd(cmd: ParsedCommand): Output {
    const [rangeRef, ...jsonParts] = cmd.args;
    if (!rangeRef) throw new Error('VALIDATE_ADD requires range reference');

    const range = parseA1Range(rangeRef);
    if (!range) throw new Error(`Invalid range: ${rangeRef}`);

    const jsonStr = jsonParts.join(' ');
    if (!jsonStr.startsWith('{')) {
      throw new Error('VALIDATE_ADD requires JSON configuration');
    }

    const config = this.parseJSON<{
      type: string;
      values?: string[];
      listItems?: string[];
      operator?: string;
      value1?: number | string;
      value2?: number | string;
      allowBlank?: boolean;
      errorStyle?: string;
      errorTitle?: string;
      errorMessage?: string;
    }>(jsonStr, 'VALIDATE_ADD');

    const ruleId = this.validation.addRule(range, {
      type: config.type as ValidationType,
      listItems: config.values ?? config.listItems,
      operator: config.operator as ValidationOperator,
      value1: config.value1,
      value2: config.value2,
      allowBlank: config.allowBlank,
      errorStyle: config.errorStyle as 'stop' | 'warning' | 'information',
      errorTitle: config.errorTitle,
      errorMessage: config.errorMessage,
    });

    return this.createResult(true, { ruleId, range: rangeRef }, cmd);
  }

  /**
   * VALIDATE_REMOVE <ruleId>
   * Remove a validation rule by ID.
   *
   * Example: VALIDATE_REMOVE val_1_123456789
   */
  private cmdValidateRemove(cmd: ParsedCommand): Output {
    const [ruleId] = cmd.args;
    if (!ruleId) throw new Error('VALIDATE_REMOVE requires rule ID');

    const removed = this.validation.removeRule(ruleId);

    return this.createResult(removed, { ruleId, removed }, cmd);
  }

  // Legacy validation commands
  private cmdAddValidation(cmd: ParsedCommand): Output {
    const [rangeRef] = cmd.args;
    if (!rangeRef) throw new Error('ADD_VALIDATION requires range reference');

    const range = parseA1Range(rangeRef);
    if (!range) throw new Error(`Invalid range: ${rangeRef}`);

    const type = String(cmd.options.type ?? 'any');
    const itemsStr = String(cmd.options.items ?? '');
    const items = itemsStr ? itemsStr.split(',').map(v => v.trim()) : undefined;

    const ruleId = this.validation.addRule(range, {
      type: type as ValidationType,
      listItems: items,
    });

    return this.createResult(true, { ruleId }, cmd);
  }

  private cmdRemoveValidation(cmd: ParsedCommand): Output {
    const [ruleId] = cmd.args;
    if (!ruleId) throw new Error('REMOVE_VALIDATION requires rule ID');

    const removed = this.validation.removeRule(ruleId);

    return this.createResult(removed, { ruleId, removed }, cmd);
  }

  // ===========================================================================
  // History Commands
  // ===========================================================================

  private cmdUndo(cmd: ParsedCommand): Output {
    const result = this.undoRedo.undo();
    return this.createResult(result !== null, { undone: result?.description }, cmd);
  }

  private cmdRedo(cmd: ParsedCommand): Output {
    const result = this.undoRedo.redo();
    return this.createResult(result !== null, { redone: result?.description }, cmd);
  }

  private cmdBeginBatch(cmd: ParsedCommand): Output {
    const description = cmd.args.join(' ') || 'Batch operation';
    this.undoRedo.beginBatch(description);
    return this.createResult(true, { batch: 'started', description }, cmd);
  }

  private cmdEndBatch(cmd: ParsedCommand): Output {
    this.undoRedo.endBatch();
    return this.createResult(true, { batch: 'ended' }, cmd);
  }

  // ===========================================================================
  // State Inspection Commands
  // ===========================================================================

  private cmdSnapshot(cmd: ParsedCommand): Output {
    const snapshot = this.takeSnapshot();

    const output: SnapshotOutput = {
      type: 'snapshot',
      timestamp: Date.now(),
      command: cmd.raw,
      lineNumber: cmd.lineNumber,
      cells: Object.fromEntries(snapshot),
      selection: this.getSelectionSnapshot(),
      usedRange: this.dataStore.getUsedRange(),
      stats: {
        cellCount: snapshot.size,
        formulaCount: Array.from(snapshot.values()).filter(c => c.formula).length,
      },
    };

    return output;
  }

  private cmdDiff(cmd: ParsedCommand): Output {
    const currentSnapshot = this.getCurrentSnapshot();
    const changes = this.computeDiff(this.lastSnapshot, currentSnapshot);

    const output: DiffOutput = {
      type: 'diff',
      timestamp: Date.now(),
      command: cmd.raw,
      lineNumber: cmd.lineNumber,
      changes,
      selectionChanged: false, // TODO: track selection changes
    };

    // Update last snapshot
    this.lastSnapshot = currentSnapshot;

    return output;
  }

  private cmdStats(cmd: ParsedCommand): Output {
    const engineStats = this.engine.getStats();
    const undoState = this.undoRedo.getState();

    const output: StatsOutput = {
      type: 'stats',
      timestamp: Date.now(),
      command: cmd.raw,
      lineNumber: cmd.lineNumber,
      cellCount: engineStats.dataStats.cellCount,
      formulaCount: engineStats.formulaStats.graphStats.totalCells,
      memoryKB: engineStats.dataStats.memoryEstimateKB,
      undoStackSize: undoState.undoCount,
      redoStackSize: undoState.redoCount,
    };

    return output;
  }

  private cmdDump(cmd: ParsedCommand): Output {
    const [rangeRef] = cmd.args;
    if (!rangeRef) throw new Error('DUMP requires range reference');

    const range = parseA1Range(rangeRef);
    if (!range) throw new Error(`Invalid range: ${rangeRef}`);

    // Build headers (column letters)
    const headers: string[] = [''];
    for (let col = range.startCol; col <= range.endCol; col++) {
      headers.push(toA1Reference(0, col).replace('1', ''));
    }

    // Build rows
    const rows: string[][] = [];
    for (let row = range.startRow; row <= range.endRow; row++) {
      const rowData: string[] = [String(row + 1)];
      for (let col = range.startCol; col <= range.endCol; col++) {
        const cell = this.dataStore.getCell(row, col);
        const value = cell?.formula ?? cell?.value ?? '';
        rowData.push(String(value));
      }
      rows.push(rowData);
    }

    const output: TableOutput = {
      type: 'table',
      timestamp: Date.now(),
      command: cmd.raw,
      lineNumber: cmd.lineNumber,
      headers,
      rows,
    };

    return output;
  }

  // ===========================================================================
  // Conditional Formatting Commands
  // ===========================================================================

  /**
   * COND_ADD <range> <json>
   * Add conditional formatting rule with JSON configuration.
   *
   * Examples:
   *   COND_ADD A1:A10 {"type":"gt","value":100,"format":{"backgroundColor":"#ff0000"}}
   *   COND_ADD B1:B10 {"type":"between","value1":0,"value2":50,"format":{"fontColor":"#00ff00"}}
   *   COND_ADD C1:C10 {"type":"text","operator":"contains","value":"error","format":{"bold":true}}
   */
  private cmdCondAdd(cmd: ParsedCommand): Output {
    const [rangeRef, ...jsonParts] = cmd.args;
    if (!rangeRef) throw new Error('COND_ADD requires range reference');

    const range = parseA1Range(rangeRef);
    if (!range) throw new Error(`Invalid range: ${rangeRef}`);

    const jsonStr = jsonParts.join(' ');
    if (!jsonStr.startsWith('{')) {
      throw new Error('COND_ADD requires JSON configuration');
    }

    const config = this.parseJSON<{
      type: string;
      operator?: string;
      value?: number | string;
      value1?: number | string;
      value2?: number | string;
      format?: Partial<CellFormat>;
      priority?: number;
      stopIfTrue?: boolean;
    }>(jsonStr, 'COND_ADD');

    // Map simplified types to conditional formatting config
    const typeMap: Record<string, string> = {
      gt: 'greaterThan',
      gte: 'greaterThanOrEqual',
      lt: 'lessThan',
      lte: 'lessThanOrEqual',
      eq: 'equal',
      neq: 'notEqual',
      between: 'between',
      text: 'text',
      contains: 'containsText',
      blank: 'blank',
      notblank: 'notBlank',
    };

    const operator = typeMap[config.type] ?? config.operator ?? config.type;

    // Build the conditional format rule
    const ruleId = this.conditionalFormatting.addRule(range, {
      type: 'cellValue',
      priority: config.priority ?? 0,
      stopIfTrue: config.stopIfTrue ?? false,
      format: config.format ?? { backgroundColor: '#FFFF00' },
      config: {
        type: 'cellValue',
        operator: operator as 'greaterThan' | 'lessThan' | 'equal' | 'between',
        value1: config.value ?? config.value1 ?? 0,
        value2: config.value2,
      },
    });

    return this.createResult(true, { ruleId, range: rangeRef }, cmd);
  }

  /**
   * COND_REMOVE <ruleId>
   * Remove a conditional formatting rule by ID.
   *
   * Example: COND_REMOVE cf_1_123456789
   */
  private cmdCondRemove(cmd: ParsedCommand): Output {
    const [ruleId] = cmd.args;
    if (!ruleId) throw new Error('COND_REMOVE requires rule ID');

    const removed = this.conditionalFormatting.removeRule(ruleId);

    return this.createResult(removed, { ruleId, removed }, cmd);
  }

  // Legacy conditional formatting commands
  private cmdAddCFRule(cmd: ParsedCommand): Output {
    const [rangeRef] = cmd.args;
    if (!rangeRef) throw new Error('ADD_CF_RULE requires range reference');

    const range = parseA1Range(rangeRef);
    if (!range) throw new Error(`Invalid range: ${rangeRef}`);

    const ruleType = String(cmd.options.type ?? 'cellValue') as 'cellValue';
    const ruleId = this.conditionalFormatting.addRule(range, {
      type: ruleType,
      priority: 0,
      stopIfTrue: false,
      format: { backgroundColor: String(cmd.options.color ?? '#FFFF00') },
      config: {
        type: 'cellValue',
        operator: String(cmd.options.operator ?? 'greaterThan') as 'greaterThan',
        value1: cmd.options.value !== undefined ? Number(cmd.options.value) : 0,
      },
    });

    return this.createResult(true, { ruleId }, cmd);
  }

  private cmdRemoveCFRule(cmd: ParsedCommand): Output {
    const [ruleId] = cmd.args;
    if (!ruleId) throw new Error('REMOVE_CF_RULE requires rule ID');

    const removed = this.conditionalFormatting.removeRule(ruleId);

    return this.createResult(removed, { ruleId, removed }, cmd);
  }

  private cmdEvalCF(cmd: ParsedCommand): Output {
    const [cellRef, valueStr] = cmd.args;
    if (!cellRef) throw new Error('EVAL_CF requires cell reference');

    const cell = parseA1Reference(cellRef);
    if (!cell) throw new Error(`Invalid cell reference: ${cellRef}`);

    const value = valueStr !== undefined ? parseFloat(valueStr) : null;
    const result = this.conditionalFormatting.evaluate(cell, value);

    return this.createResult(true, { cell: cellRef, format: result }, cmd);
  }

  // ===========================================================================
  // Utility Commands
  // ===========================================================================

  private cmdEcho(cmd: ParsedCommand): Output {
    const message = cmd.args.join(' ');
    return this.createEcho(message, cmd);
  }

  private async cmdSleep(cmd: ParsedCommand): Promise<Output> {
    const requestedMs = parseInt(cmd.args[0] ?? '0', 10);

    if (isNaN(requestedMs) || requestedMs < 0) {
      throw new Error(`SLEEP requires a positive integer, got: ${cmd.args[0]}`);
    }

    // Cap sleep duration to maxSleepMs for safety
    const maxSleepMs = this.config.maxSleepMs;
    const actualMs = Math.min(requestedMs, maxSleepMs);
    const wasCapped = requestedMs > maxSleepMs;

    // Non-blocking async sleep
    await new Promise<void>((resolve) => setTimeout(resolve, actualMs));

    return this.createResult(true, {
      slept: actualMs,
      requested: requestedMs,
      capped: wasCapped,
    }, cmd);
  }

  private cmdAssert(cmd: ParsedCommand): Output {
    const [cellRef, operator, expected] = cmd.args;
    if (!cellRef || !operator) throw new Error('ASSERT requires cell, operator, and expected value');

    const cell = parseA1Reference(cellRef);
    if (!cell) throw new Error(`Invalid cell reference: ${cellRef}`);

    const cellData = this.dataStore.getCell(cell.row, cell.col);
    const actual = cellData?.value;

    let passed = false;
    const expectedValue = this.parseAssertValue(expected);

    switch (operator) {
      case '==':
      case '=':
        passed = actual == expectedValue;
        break;
      case '===':
        passed = actual === expectedValue;
        break;
      case '!=':
      case '<>':
        passed = actual != expectedValue;
        break;
      case '>':
        passed = Number(actual) > Number(expectedValue);
        break;
      case '<':
        passed = Number(actual) < Number(expectedValue);
        break;
      case '>=':
        passed = Number(actual) >= Number(expectedValue);
        break;
      case '<=':
        passed = Number(actual) <= Number(expectedValue);
        break;
      default:
        throw new Error(`Unknown operator: ${operator}`);
    }

    const output: AssertOutput = {
      type: 'assert',
      timestamp: Date.now(),
      command: cmd.raw,
      lineNumber: cmd.lineNumber,
      passed,
      expected: expectedValue,
      actual,
      message: passed ? undefined : `Assertion failed: ${cellRef} ${operator} ${expected}`,
    };

    return output;
  }

  private parseAssertValue(value: string | undefined): unknown {
    if (value === undefined || value === 'null') return null;
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (!isNaN(parseFloat(value))) return parseFloat(value);
    return value;
  }

  private cmdAssertError(cmd: ParsedCommand): Output {
    this.expectError = true;
    return this.createInfo('Expecting error on next command', cmd);
  }

  // ===========================================================================
  // Control Commands
  // ===========================================================================

  private cmdReset(cmd: ParsedCommand): Output {
    this.engine.clear();
    this.mergeManager = new MergeManager();
    this.validation = new DataValidation();
    this.conditionalFormatting = new ConditionalFormatting();
    this.undoRedo.clear();
    this.clipboard.clear();
    this.formatPainter.clear();
    // Create new SortFilter since it doesn't have a clearAll method
    this.sortFilter = new SortFilter(this.dataStore, this.dataStore);
    this.lastSnapshot.clear();

    return this.createResult(true, { reset: true }, cmd);
  }

  private cmdQuit(cmd: ParsedCommand): Output {
    return this.createInfo('Quitting', cmd);
  }

  // ===========================================================================
  // Snapshot/Diff Helpers
  // ===========================================================================

  private takeSnapshot(): Map<string, CellSnapshot> {
    const snapshot = this.getCurrentSnapshot();
    this.lastSnapshot = snapshot;
    return snapshot;
  }

  private getCurrentSnapshot(): Map<string, CellSnapshot> {
    const snapshot = new Map<string, CellSnapshot>();
    const cells = this.dataStore.getAllCells();

    for (const [key, cell] of cells) {
      snapshot.set(key, {
        value: cell.value,
        formula: cell.formula,
        type: cell.type,
        format: cell.format as Record<string, unknown> | undefined,
      });
    }

    return snapshot;
  }

  private getSelectionSnapshot(): { activeCell: { row: number; col: number }; ranges: CellRange[] } | null {
    const selection = this.engine.getSelection();
    if (!selection) return null;

    return {
      activeCell: selection.activeCell,
      ranges: selection.ranges,
    };
  }

  private computeDiff(before: Map<string, CellSnapshot>, after: Map<string, CellSnapshot>): CellChange[] {
    const changes: CellChange[] = [];
    const allKeys = new Set([...before.keys(), ...after.keys()]);

    for (const key of allKeys) {
      const [row, col] = key.split('_').map(Number);
      const beforeCell = before.get(key) ?? null;
      const afterCell = after.get(key) ?? null;

      const changed = JSON.stringify(beforeCell) !== JSON.stringify(afterCell);

      if (changed) {
        changes.push({
          row,
          col,
          address: toA1Reference(row, col),
          before: beforeCell,
          after: afterCell,
        });
      }
    }

    return changes;
  }

  // ===========================================================================
  // Output Helpers
  // ===========================================================================

  private createResult(success: boolean, data: unknown, cmd: ParsedCommand): ResultOutput {
    return {
      type: 'result',
      timestamp: Date.now(),
      command: cmd.raw,
      lineNumber: cmd.lineNumber,
      success,
      data,
    };
  }

  private createValue(
    cell: { row: number; col: number } | undefined,
    value: unknown,
    cmd: ParsedCommand,
    range?: CellRange
  ): ValueOutput {
    return {
      type: 'value',
      timestamp: Date.now(),
      command: cmd.raw,
      lineNumber: cmd.lineNumber,
      cell,
      range,
      value,
    };
  }

  private createError(message: string, cmd: ParsedCommand, stack?: string): ErrorOutput {
    return {
      type: 'error',
      timestamp: Date.now(),
      command: cmd.raw,
      lineNumber: cmd.lineNumber,
      message,
      stack,
    };
  }

  private createInfo(message: string, cmd: ParsedCommand): InfoOutput {
    return {
      type: 'info',
      timestamp: Date.now(),
      command: cmd.raw,
      lineNumber: cmd.lineNumber,
      message,
    };
  }

  private createEcho(message: string, cmd: ParsedCommand): EchoOutput {
    return {
      type: 'echo',
      timestamp: Date.now(),
      command: cmd.raw,
      lineNumber: cmd.lineNumber,
      message,
    };
  }

  // ===========================================================================
  // Safety Error Helpers
  // ===========================================================================

  /**
   * Create a timeout error output.
   */
  private createTimeoutError(command: string, timeoutMs: number, cmd: ParsedCommand): TimeoutErrorOutput {
    return {
      type: 'error',
      timestamp: Date.now(),
      command: cmd.raw,
      lineNumber: cmd.lineNumber,
      message: `Command timed out after ${timeoutMs}ms: ${command}`,
      errorType: 'CommandTimeout',
      timeoutMs,
    };
  }

  /**
   * Create a step limit exceeded error output.
   */
  private createStepLimitError(stepCount: number, maxSteps: number, cmd: ParsedCommand): StepLimitErrorOutput {
    return {
      type: 'error',
      timestamp: Date.now(),
      command: cmd.raw,
      lineNumber: cmd.lineNumber,
      message: `Step limit exceeded: ${stepCount} steps (max: ${maxSteps})`,
      errorType: 'StepLimitExceeded',
      stepCount,
      maxSteps,
    };
  }

  /**
   * Create an abort error output.
   */
  private createAbortError(reason: string, cmd: ParsedCommand): AbortErrorOutput {
    return {
      type: 'error',
      timestamp: Date.now(),
      command: cmd.raw,
      lineNumber: cmd.lineNumber,
      message: `Script aborted: ${reason}`,
      errorType: 'ScriptAborted',
      reason,
    };
  }

  private emit(output: Output): void {
    this.outputHandler(output);
  }

  private defaultOutputHandler(output: Output): void {
    if (this.config.outputFormat === 'json') {
      console.log(JSON.stringify(output));
    } else {
      this.prettyPrint(output);
    }
  }

  private prettyPrint(output: Output): void {
    const prefix = output.lineNumber ? `[${output.lineNumber}] ` : '';

    switch (output.type) {
      case 'result':
        console.log(`${prefix}${output.success ? '✓' : '✗'} ${output.command}`);
        if (output.data && this.config.verbose) {
          console.log(`  → ${JSON.stringify(output.data)}`);
        }
        break;

      case 'value':
        console.log(`${prefix}= ${JSON.stringify(output.value)}`);
        break;

      case 'error':
        console.error(`${prefix}ERROR: ${output.message}`);
        break;

      case 'info':
        console.log(`${prefix}INFO: ${output.message}`);
        break;

      case 'echo':
        console.log(`${prefix}${output.message}`);
        break;

      case 'assert':
        if (output.passed) {
          console.log(`${prefix}✓ ASSERT passed`);
        } else {
          console.log(`${prefix}✗ ASSERT failed: expected ${output.expected}, got ${output.actual}`);
        }
        break;

      case 'table':
        console.log(`${prefix}TABLE:`);
        console.log('  ' + output.headers.join('\t'));
        for (const row of output.rows) {
          console.log('  ' + row.join('\t'));
        }
        break;

      default:
        console.log(`${prefix}${JSON.stringify(output)}`);
    }
  }

  // ===========================================================================
  // CLI Interface Methods
  // ===========================================================================

  /**
   * Set a custom output handler.
   */
  onOutput(handler: (output: Output) => void): void {
    this.outputHandler = handler;
  }

  /**
   * Execute a single line of input (for interactive mode).
   * Returns false if QUIT command was executed.
   */
  async executeLine(line: string): Promise<boolean> {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('//')) {
      return true;
    }

    // Parse the command
    const { CommandParser } = await import('./CommandParser.js');
    const parser = new CommandParser();
    const cmd = parser.parse(trimmed, 0);

    if (!cmd) {
      return true;
    }

    // Execute and emit output (await async execute)
    const output = await this.execute(cmd);
    this.emit(output);

    // Check for quit or error with stop-on-error
    if (cmd.type === 'QUIT') {
      return false;
    }

    if (output.type === 'error' && this.config.stopOnError) {
      throw new Error((output as ErrorOutput).message);
    }

    return true;
  }

  /**
   * Execute a script (multiple lines).
   * Uses executeAll for full safety features (timeouts, step limits, abort handling).
   */
  async executeScript(script: string): Promise<void> {
    const { CommandParser } = await import('./CommandParser.js');
    const parser = new CommandParser();
    const commands = parser.parseScript(script);

    // Use executeAll for full safety features
    await this.executeAll(commands);
  }

  /**
   * Request abort of running script.
   * Can be called from signal handlers (e.g., SIGINT).
   */
  abort(reason: string = 'User requested abort'): void {
    if (this.abortController && this.isExecuting) {
      this.abortController.abort();
      // Log abort request if verbose
      if (this.config.verbose) {
        console.log(`[Abort] ${reason}`);
      }
    }
  }

  /**
   * Check if the runner is currently executing a script.
   */
  isRunning(): boolean {
    return this.isExecuting;
  }

  /**
   * Get current step count (for monitoring/progress).
   */
  getStepCount(): number {
    return this.stepCount;
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createHarnessRunner(
  config?: Partial<HarnessConfig>,
  outputHandler?: (output: Output) => void
): HarnessRunner {
  return new HarnessRunner(config, outputHandler);
}
