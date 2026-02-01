/**
 * VectorSheet Engine - Undo/Redo Manager (Command Pattern)
 *
 * Production-grade undo/redo system using the Command Pattern.
 * Each mutation is encapsulated as a Command with apply() and revert().
 *
 * Features:
 * - Command Pattern: All mutations are reversible commands
 * - Batch Operations: Group multiple commands into a single undo step
 * - Configurable History: Limit memory usage with max history
 * - Memory-Safe: Deep clones to prevent reference corruption
 * - Event System: Hooks for UI state synchronization
 * - Deterministic: Same commands always produce same results
 *
 * Design:
 * - Commands are immutable after creation
 * - Batches automatically combine nested commands
 * - History trimming prevents memory leaks
 * - No UI/DOM dependencies
 */

import { Cell, CellRange, CellFormat } from '../types/index.js';

// =============================================================================
// Types - Operation Types
// =============================================================================

export type OperationType =
  | 'setCellValue'
  | 'setCellFormat'
  | 'setMultipleCells'
  | 'insertRows'
  | 'deleteRows'
  | 'insertCols'
  | 'deleteCols'
  | 'mergeCells'
  | 'unmergeCells'
  | 'setRowHeight'
  | 'setColWidth'
  | 'sortRange'
  | 'filterRange'
  | 'paste'
  | 'fill'
  | 'clear'
  | 'batch'
  | 'custom';

// =============================================================================
// Types - Command Interface
// =============================================================================

/**
 * Core Command interface.
 * Every undoable operation must implement this interface.
 */
export interface Command {
  /** Unique command ID */
  readonly id: string;
  /** Command type for categorization */
  readonly type: OperationType;
  /** Human-readable description for UI */
  readonly description: string;
  /** Timestamp when command was created */
  readonly timestamp: number;

  /**
   * Apply the command (execute the mutation).
   * Must be idempotent - calling multiple times has same effect.
   */
  apply(): void;

  /**
   * Revert the command (undo the mutation).
   * Must restore state to exactly before apply() was called.
   */
  revert(): void;

  /**
   * Get memory size estimate for this command (bytes).
   * Used for memory management and history trimming.
   */
  getMemorySize(): number;
}

/**
 * A batch of commands executed as a single unit.
 */
export interface BatchCommand extends Command {
  readonly type: 'batch';
  /** Commands in this batch */
  readonly commands: ReadonlyArray<Command>;
}

// =============================================================================
// Types - Cell Snapshot (for snapshot-based commands)
// =============================================================================

export interface CellSnapshot {
  row: number;
  col: number;
  cell: Cell | null;
}

// =============================================================================
// Types - Operation (legacy compatibility + serialization)
// =============================================================================

export interface Operation {
  /** Unique operation ID */
  id: string;
  /** Operation type */
  type: OperationType;
  /** Timestamp */
  timestamp: number;
  /** Description for UI */
  description: string;
  /** Data needed to undo */
  undoData: CellSnapshot[];
  /** Data needed to redo */
  redoData: CellSnapshot[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface BatchOperation extends Operation {
  type: 'batch';
  /** Child operations in this batch */
  operations: Operation[];
}

// =============================================================================
// Types - State & Events
// =============================================================================

export interface UndoRedoState {
  /** Can undo */
  canUndo: boolean;
  /** Can redo */
  canRedo: boolean;
  /** Undo stack size */
  undoCount: number;
  /** Redo stack size */
  redoCount: number;
  /** Last undo description */
  undoDescription: string | null;
  /** Last redo description */
  redoDescription: string | null;
  /** Total memory usage estimate (bytes) */
  memoryUsage: number;
}

export interface UndoRedoEvents {
  /** Called when a command is recorded */
  onRecord?: (command: Command) => void;
  /** Called when undo is performed */
  onUndo?: (command: Command) => void;
  /** Called when redo is performed */
  onRedo?: (command: Command) => void;
  /** Called when state changes */
  onStateChange?: (state: UndoRedoState) => void;
  /** Called before apply (for validation) */
  onBeforeApply?: (command: Command) => boolean;
  /** Called after apply */
  onAfterApply?: (command: Command) => void;
}

export interface UndoRedoConfig {
  /** Maximum number of operations to keep (default: 100) */
  maxHistory?: number;
  /** Maximum memory usage in bytes (default: 50MB) */
  maxMemory?: number;
  /** Enable grouping of rapid changes (default: true) */
  groupRapidChanges?: boolean;
  /** Time window for grouping in ms (default: 500) */
  groupingWindow?: number;
}

// =============================================================================
// Types - Mutation Target (for command creation)
// =============================================================================

/**
 * Interface for the mutation target (typically SparseDataStore).
 * Commands operate on this interface, enabling decoupling.
 */
export interface MutationTarget {
  getCell(row: number, col: number): Cell | null;
  setCell(row: number, col: number, cell: Cell): void;
  deleteCell(row: number, col: number): void;
  getRowHeight?(row: number): number;
  setRowHeight?(row: number, height: number): void;
  getColumnWidth?(col: number): number;
  setColumnWidth?(col: number, width: number): void;
}

// =============================================================================
// Command Implementations
// =============================================================================

/** Counter for generating unique IDs */
let commandIdCounter = 0;

function generateCommandId(): string {
  return `cmd_${++commandIdCounter}_${Date.now()}`;
}

/**
 * Base class for snapshot-based commands.
 * Stores before/after state for any cell mutations.
 */
export class CellSnapshotCommand implements Command {
  readonly id: string;
  readonly type: OperationType;
  readonly description: string;
  readonly timestamp: number;

  private target: MutationTarget;
  private beforeSnapshots: CellSnapshot[];
  private afterSnapshots: CellSnapshot[];

  constructor(
    target: MutationTarget,
    type: OperationType,
    description: string,
    beforeSnapshots: CellSnapshot[],
    afterSnapshots: CellSnapshot[]
  ) {
    this.id = generateCommandId();
    this.type = type;
    this.description = description;
    this.timestamp = Date.now();
    this.target = target;
    this.beforeSnapshots = beforeSnapshots;
    this.afterSnapshots = afterSnapshots;
  }

  apply(): void {
    for (const snapshot of this.afterSnapshots) {
      if (snapshot.cell) {
        this.target.setCell(snapshot.row, snapshot.col, this.deepCloneCell(snapshot.cell));
      } else {
        this.target.deleteCell(snapshot.row, snapshot.col);
      }
    }
  }

  revert(): void {
    for (const snapshot of this.beforeSnapshots) {
      if (snapshot.cell) {
        this.target.setCell(snapshot.row, snapshot.col, this.deepCloneCell(snapshot.cell));
      } else {
        this.target.deleteCell(snapshot.row, snapshot.col);
      }
    }
  }

  getMemorySize(): number {
    // Estimate: ~200 bytes per cell snapshot
    return (this.beforeSnapshots.length + this.afterSnapshots.length) * 200;
  }

  private deepCloneCell(cell: Cell): Cell {
    return JSON.parse(JSON.stringify(cell));
  }

  /** Get the Operation representation (for serialization) */
  toOperation(): Operation {
    return {
      id: this.id,
      type: this.type,
      timestamp: this.timestamp,
      description: this.description,
      undoData: this.beforeSnapshots.map(s => ({
        ...s,
        cell: s.cell ? this.deepCloneCell(s.cell) : null,
      })),
      redoData: this.afterSnapshots.map(s => ({
        ...s,
        cell: s.cell ? this.deepCloneCell(s.cell) : null,
      })),
    };
  }
}

/**
 * Batch command that groups multiple commands.
 */
export class BatchCommandImpl implements BatchCommand {
  readonly id: string;
  readonly type: 'batch' = 'batch';
  readonly description: string;
  readonly timestamp: number;
  readonly commands: ReadonlyArray<Command>;

  constructor(description: string, commands: Command[]) {
    this.id = generateCommandId();
    this.description = description;
    this.timestamp = Date.now();
    this.commands = commands;
  }

  apply(): void {
    // Apply in order
    for (const cmd of this.commands) {
      cmd.apply();
    }
  }

  revert(): void {
    // Revert in reverse order
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].revert();
    }
  }

  getMemorySize(): number {
    return this.commands.reduce((sum, cmd) => sum + cmd.getMemorySize(), 0);
  }
}

/**
 * Custom command with user-defined apply/revert functions.
 */
export class CustomCommand implements Command {
  readonly id: string;
  readonly type: OperationType;
  readonly description: string;
  readonly timestamp: number;

  private applyFn: () => void;
  private revertFn: () => void;
  private memorySizeEstimate: number;

  constructor(
    type: OperationType,
    description: string,
    applyFn: () => void,
    revertFn: () => void,
    memorySizeEstimate: number = 100
  ) {
    this.id = generateCommandId();
    this.type = type;
    this.description = description;
    this.timestamp = Date.now();
    this.applyFn = applyFn;
    this.revertFn = revertFn;
    this.memorySizeEstimate = memorySizeEstimate;
  }

  apply(): void {
    this.applyFn();
  }

  revert(): void {
    this.revertFn();
  }

  getMemorySize(): number {
    return this.memorySizeEstimate;
  }
}

// =============================================================================
// Undo/Redo Manager
// =============================================================================

export class UndoRedoManager {
  /** Undo stack (most recent at end) */
  private undoStack: Command[] = [];

  /** Redo stack (most recent at end) */
  private redoStack: Command[] = [];

  /** Event handlers */
  private events: UndoRedoEvents = {};

  /** Configuration */
  private config: Required<UndoRedoConfig>;

  /** Current batch being recorded */
  private batchStack: Command[][] = [];
  private batchDescriptions: string[] = [];

  /** For grouping rapid changes */
  private lastCommandTime: number = 0;
  private pendingCommands: Command[] = [];
  private pendingFlushTimer: ReturnType<typeof setTimeout> | null = null;

  /** Mutation target (optional, for snapshot capture) */
  private target: MutationTarget | null = null;

  /** Total memory usage */
  private totalMemory: number = 0;

  constructor(config: UndoRedoConfig = {}) {
    this.config = {
      maxHistory: config.maxHistory ?? 100,
      maxMemory: config.maxMemory ?? 50 * 1024 * 1024, // 50MB
      groupRapidChanges: config.groupRapidChanges ?? true,
      groupingWindow: config.groupingWindow ?? 500,
    };
  }

  // ===========================================================================
  // Configuration & Initialization
  // ===========================================================================

  /**
   * Set the mutation target (data store).
   * Required for snapshot-based command creation helpers.
   */
  setTarget(target: MutationTarget): void {
    this.target = target;
  }

  /**
   * Set event handlers.
   */
  setEventHandlers(events: UndoRedoEvents): void {
    this.events = { ...this.events, ...events };
  }

  /**
   * Update configuration.
   */
  setConfig(config: Partial<UndoRedoConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ===========================================================================
  // State Queries
  // ===========================================================================

  /**
   * Get current undo/redo state.
   */
  getState(): UndoRedoState {
    return {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      undoDescription: this.undoStack.length > 0
        ? this.undoStack[this.undoStack.length - 1].description
        : null,
      redoDescription: this.redoStack.length > 0
        ? this.redoStack[this.redoStack.length - 1].description
        : null,
      memoryUsage: this.totalMemory,
    };
  }

  /**
   * Check if undo is available.
   */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Check if redo is available.
   */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Check if currently recording a batch.
   */
  isInBatch(): boolean {
    return this.batchStack.length > 0;
  }

  // ===========================================================================
  // Command Execution
  // ===========================================================================

  /**
   * Execute a command and record it for undo.
   * This is the primary way to perform undoable mutations.
   */
  execute(command: Command): boolean {
    // Check if blocked by event handler
    if (this.events.onBeforeApply) {
      if (!this.events.onBeforeApply(command)) {
        return false;
      }
    }

    // Apply the command
    command.apply();

    // Notify after apply
    this.events.onAfterApply?.(command);

    // Record for undo
    this.record(command);

    return true;
  }

  /**
   * Record a command that has already been applied.
   * Use this when the mutation was done externally.
   */
  record(command: Command): void {
    // If in a batch, add to batch
    if (this.batchStack.length > 0) {
      this.batchStack[this.batchStack.length - 1].push(command);
      return;
    }

    // Handle rapid change grouping
    if (this.config.groupRapidChanges) {
      const now = Date.now();
      if (now - this.lastCommandTime < this.config.groupingWindow &&
          this.pendingCommands.length > 0 &&
          this.shouldGroupCommands(this.pendingCommands[0], command)) {
        this.pendingCommands.push(command);
        this.lastCommandTime = now;
        this.schedulePendingFlush();
        return;
      } else {
        // Flush pending and start new group
        this.flushPending();
        this.pendingCommands = [command];
        this.lastCommandTime = now;
        this.schedulePendingFlush();
        return;
      }
    }

    // Direct push
    this.pushCommand(command);
  }

  // ===========================================================================
  // Undo/Redo Operations
  // ===========================================================================

  /**
   * Undo the last command.
   */
  undo(): Command | null {
    // Flush any pending commands first
    this.flushPending();

    if (this.undoStack.length === 0) return null;

    const command = this.undoStack.pop()!;
    this.totalMemory -= command.getMemorySize();

    // Revert the command
    command.revert();

    // Move to redo stack
    this.redoStack.push(command);
    this.totalMemory += command.getMemorySize();

    this.events.onUndo?.(command);
    this.notifyStateChange();

    return command;
  }

  /**
   * Redo the last undone command.
   */
  redo(): Command | null {
    // Flush any pending commands first
    this.flushPending();

    if (this.redoStack.length === 0) return null;

    const command = this.redoStack.pop()!;
    this.totalMemory -= command.getMemorySize();

    // Apply the command
    command.apply();

    // Move back to undo stack
    this.undoStack.push(command);
    this.totalMemory += command.getMemorySize();

    this.events.onRedo?.(command);
    this.notifyStateChange();

    return command;
  }

  /**
   * Undo multiple commands.
   */
  undoMultiple(count: number): Command[] {
    const undone: Command[] = [];
    for (let i = 0; i < count && this.canUndo(); i++) {
      const cmd = this.undo();
      if (cmd) undone.push(cmd);
    }
    return undone;
  }

  /**
   * Redo multiple commands.
   */
  redoMultiple(count: number): Command[] {
    const redone: Command[] = [];
    for (let i = 0; i < count && this.canRedo(); i++) {
      const cmd = this.redo();
      if (cmd) redone.push(cmd);
    }
    return redone;
  }

  // ===========================================================================
  // Batch Operations
  // ===========================================================================

  /**
   * Begin a batch operation.
   * All commands recorded until endBatch() are grouped as one undo step.
   * Supports nesting.
   */
  beginBatch(description: string): void {
    this.flushPending();
    this.batchStack.push([]);
    this.batchDescriptions.push(description);
  }

  /**
   * End a batch operation and commit it.
   */
  endBatch(): void {
    if (this.batchStack.length === 0) return;

    const commands = this.batchStack.pop()!;
    const description = this.batchDescriptions.pop()!;

    if (commands.length === 0) return;

    // Create batch command
    const batchCommand = new BatchCommandImpl(description, commands);

    // If nested, add to parent batch
    if (this.batchStack.length > 0) {
      this.batchStack[this.batchStack.length - 1].push(batchCommand);
      return;
    }

    // Push to undo stack
    this.pushCommand(batchCommand);
  }

  /**
   * Cancel current batch without recording.
   * Optionally revert all commands in the batch.
   */
  cancelBatch(revert: boolean = false): void {
    if (this.batchStack.length === 0) return;

    const commands = this.batchStack.pop()!;
    this.batchDescriptions.pop();

    if (revert) {
      // Revert in reverse order
      for (let i = commands.length - 1; i >= 0; i--) {
        commands[i].revert();
      }
    }
  }

  // ===========================================================================
  // History Management
  // ===========================================================================

  /**
   * Get undo history (most recent first).
   */
  getUndoHistory(): Array<{ id: string; description: string; timestamp: number }> {
    return this.undoStack
      .map(cmd => ({
        id: cmd.id,
        description: cmd.description,
        timestamp: cmd.timestamp,
      }))
      .reverse();
  }

  /**
   * Get redo history (most recent first).
   */
  getRedoHistory(): Array<{ id: string; description: string; timestamp: number }> {
    return this.redoStack
      .map(cmd => ({
        id: cmd.id,
        description: cmd.description,
        timestamp: cmd.timestamp,
      }))
      .reverse();
  }

  /**
   * Clear all history.
   */
  clear(): void {
    this.flushPending();
    this.undoStack = [];
    this.redoStack = [];
    this.batchStack = [];
    this.batchDescriptions = [];
    this.totalMemory = 0;
    this.notifyStateChange();
  }

  /**
   * Clear redo history only.
   */
  clearRedo(): void {
    const redoMemory = this.redoStack.reduce((sum, cmd) => sum + cmd.getMemorySize(), 0);
    this.totalMemory -= redoMemory;
    this.redoStack = [];
  }

  // ===========================================================================
  // Command Creation Helpers
  // ===========================================================================

  /**
   * Create a cell value change command.
   * Requires setTarget() to be called first.
   */
  createCellCommand(
    row: number,
    col: number,
    newValue: string | number | boolean | null,
    description?: string
  ): Command | null {
    if (!this.target) return null;

    const oldCell = this.target.getCell(row, col);
    const beforeSnapshot: CellSnapshot = {
      row,
      col,
      cell: oldCell ? JSON.parse(JSON.stringify(oldCell)) : null,
    };

    // Create new cell
    const newCell: Cell = oldCell
      ? { ...JSON.parse(JSON.stringify(oldCell)), value: newValue }
      : {
          value: newValue,
          type: newValue === null ? 'empty' :
                typeof newValue === 'number' ? 'number' :
                typeof newValue === 'boolean' ? 'boolean' : 'string',
        };

    const afterSnapshot: CellSnapshot = { row, col, cell: newCell };

    return new CellSnapshotCommand(
      this.target,
      'setCellValue',
      description ?? `Edit ${this.cellToAddress(row, col)}`,
      [beforeSnapshot],
      [afterSnapshot]
    );
  }

  /**
   * Create a format change command.
   */
  createFormatCommand(
    cells: Array<{ row: number; col: number }>,
    format: Partial<CellFormat>,
    description?: string
  ): Command | null {
    if (!this.target) return null;

    const beforeSnapshots: CellSnapshot[] = [];
    const afterSnapshots: CellSnapshot[] = [];

    for (const { row, col } of cells) {
      const oldCell = this.target.getCell(row, col);
      const beforeCell = oldCell ? JSON.parse(JSON.stringify(oldCell)) : null;
      beforeSnapshots.push({ row, col, cell: beforeCell });

      const newCell: Cell = oldCell
        ? { ...JSON.parse(JSON.stringify(oldCell)) }
        : { value: null, type: 'empty' };
      newCell.format = { ...newCell.format, ...format };
      afterSnapshots.push({ row, col, cell: newCell });
    }

    return new CellSnapshotCommand(
      this.target,
      'setCellFormat',
      description ?? `Format ${cells.length} cells`,
      beforeSnapshots,
      afterSnapshots
    );
  }

  /**
   * Create a range operation command.
   */
  createRangeCommand(
    range: CellRange,
    operation: (row: number, col: number, cell: Cell | null) => Cell | null,
    type: OperationType,
    description?: string
  ): Command | null {
    if (!this.target) return null;

    const beforeSnapshots: CellSnapshot[] = [];
    const afterSnapshots: CellSnapshot[] = [];

    for (let row = range.startRow; row <= range.endRow; row++) {
      for (let col = range.startCol; col <= range.endCol; col++) {
        const oldCell = this.target.getCell(row, col);
        const beforeCell = oldCell ? JSON.parse(JSON.stringify(oldCell)) : null;
        beforeSnapshots.push({ row, col, cell: beforeCell });

        const newCell = operation(row, col, beforeCell);
        afterSnapshots.push({
          row,
          col,
          cell: newCell ? JSON.parse(JSON.stringify(newCell)) : null,
        });
      }
    }

    return new CellSnapshotCommand(
      this.target,
      type,
      description ?? this.getDefaultDescription(type),
      beforeSnapshots,
      afterSnapshots
    );
  }

  /**
   * Capture current state of a range.
   */
  captureRangeState(range: CellRange): Map<string, Cell | null> {
    const cells = new Map<string, Cell | null>();

    if (!this.target) return cells;

    for (let row = range.startRow; row <= range.endRow; row++) {
      for (let col = range.startCol; col <= range.endCol; col++) {
        const key = `${row}_${col}`;
        const cell = this.target.getCell(row, col);
        cells.set(key, cell ? JSON.parse(JSON.stringify(cell)) : null);
      }
    }

    return cells;
  }

  /**
   * Create a command from before/after range states.
   */
  createCommandFromStates(
    range: CellRange,
    beforeState: Map<string, Cell | null>,
    afterState: Map<string, Cell | null>,
    type: OperationType,
    description?: string
  ): Command | null {
    if (!this.target) return null;

    const beforeSnapshots: CellSnapshot[] = [];
    const afterSnapshots: CellSnapshot[] = [];

    for (let row = range.startRow; row <= range.endRow; row++) {
      for (let col = range.startCol; col <= range.endCol; col++) {
        const key = `${row}_${col}`;
        beforeSnapshots.push({
          row,
          col,
          cell: beforeState.get(key) ?? null,
        });
        afterSnapshots.push({
          row,
          col,
          cell: afterState.get(key) ?? null,
        });
      }
    }

    return new CellSnapshotCommand(
      this.target,
      type,
      description ?? this.getDefaultDescription(type),
      beforeSnapshots,
      afterSnapshots
    );
  }

  // ===========================================================================
  // Legacy API (for backward compatibility)
  // ===========================================================================

  /**
   * Record a cell value change (legacy API).
   * @deprecated Use execute() with createCellCommand() instead
   */
  recordCellChange(
    row: number,
    col: number,
    oldCell: Cell | null,
    newCell: Cell | null,
    description?: string
  ): void {
    if (!this.target) return;

    const command = new CellSnapshotCommand(
      this.target,
      'setCellValue',
      description ?? `Edit ${this.cellToAddress(row, col)}`,
      [{ row, col, cell: oldCell ? JSON.parse(JSON.stringify(oldCell)) : null }],
      [{ row, col, cell: newCell ? JSON.parse(JSON.stringify(newCell)) : null }]
    );

    this.record(command);
  }

  /**
   * Record a format change (legacy API).
   * @deprecated Use execute() with createFormatCommand() instead
   */
  recordFormatChange(
    cells: Array<{ row: number; col: number; oldFormat: CellFormat | undefined; newFormat: CellFormat }>,
    description?: string
  ): void {
    if (!this.target) return;

    const beforeSnapshots: CellSnapshot[] = [];
    const afterSnapshots: CellSnapshot[] = [];

    for (const { row, col, oldFormat, newFormat } of cells) {
      const existingCell = this.target.getCell(row, col);
      const beforeCell: Cell = existingCell
        ? { ...JSON.parse(JSON.stringify(existingCell)), format: oldFormat }
        : { value: null, type: 'empty', format: oldFormat };
      const afterCell: Cell = existingCell
        ? { ...JSON.parse(JSON.stringify(existingCell)), format: newFormat }
        : { value: null, type: 'empty', format: newFormat };

      beforeSnapshots.push({ row, col, cell: beforeCell });
      afterSnapshots.push({ row, col, cell: afterCell });
    }

    const command = new CellSnapshotCommand(
      this.target,
      'setCellFormat',
      description ?? 'Format cells',
      beforeSnapshots,
      afterSnapshots
    );

    this.record(command);
  }

  /**
   * Record multiple cell changes (legacy API).
   * @deprecated Use beginBatch/endBatch with execute() instead
   */
  recordMultipleCellChanges(
    changes: Array<{ row: number; col: number; oldCell: Cell | null; newCell: Cell | null }>,
    description?: string
  ): void {
    if (!this.target) return;

    const beforeSnapshots: CellSnapshot[] = [];
    const afterSnapshots: CellSnapshot[] = [];

    for (const { row, col, oldCell, newCell } of changes) {
      beforeSnapshots.push({
        row,
        col,
        cell: oldCell ? JSON.parse(JSON.stringify(oldCell)) : null,
      });
      afterSnapshots.push({
        row,
        col,
        cell: newCell ? JSON.parse(JSON.stringify(newCell)) : null,
      });
    }

    const command = new CellSnapshotCommand(
      this.target,
      'setMultipleCells',
      description ?? `Edit ${changes.length} cells`,
      beforeSnapshots,
      afterSnapshots
    );

    this.record(command);
  }

  /**
   * Record a range operation (legacy API).
   * @deprecated Use createCommandFromStates() instead
   */
  recordRangeOperation(
    type: OperationType,
    range: CellRange,
    oldCells: Map<string, Cell | null>,
    newCells: Map<string, Cell | null>,
    description?: string
  ): void {
    const command = this.createCommandFromStates(range, oldCells, newCells, type, description);
    if (command) {
      this.record(command);
    }
  }

  /**
   * Start batch (legacy API - alias for beginBatch).
   * @deprecated Use beginBatch() instead
   */
  startBatch(description: string): void {
    this.beginBatch(description);
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  private pushCommand(command: Command): void {
    // Clear redo stack on new command
    this.clearRedo();

    // Add to undo stack
    this.undoStack.push(command);
    this.totalMemory += command.getMemorySize();

    // Trim history by count
    while (this.undoStack.length > this.config.maxHistory) {
      const removed = this.undoStack.shift()!;
      this.totalMemory -= removed.getMemorySize();
    }

    // Trim history by memory
    while (this.totalMemory > this.config.maxMemory && this.undoStack.length > 1) {
      const removed = this.undoStack.shift()!;
      this.totalMemory -= removed.getMemorySize();
    }

    this.events.onRecord?.(command);
    this.notifyStateChange();
  }

  private shouldGroupCommands(first: Command, second: Command): boolean {
    // Only group same-type single-cell edits
    if (first.type !== second.type) return false;
    if (first.type !== 'setCellValue') return false;

    // Check if they're CellSnapshotCommands on same cell
    if (first instanceof CellSnapshotCommand && second instanceof CellSnapshotCommand) {
      const firstOp = first.toOperation();
      const secondOp = second.toOperation();

      if (firstOp.undoData.length !== 1 || secondOp.undoData.length !== 1) return false;

      const firstCell = firstOp.undoData[0];
      const secondCell = secondOp.undoData[0];

      return firstCell.row === secondCell.row && firstCell.col === secondCell.col;
    }

    return false;
  }

  private schedulePendingFlush(): void {
    if (this.pendingFlushTimer) {
      clearTimeout(this.pendingFlushTimer);
    }
    this.pendingFlushTimer = setTimeout(
      () => this.flushPending(),
      this.config.groupingWindow
    );
  }

  private flushPending(): void {
    if (this.pendingFlushTimer) {
      clearTimeout(this.pendingFlushTimer);
      this.pendingFlushTimer = null;
    }

    if (this.pendingCommands.length === 0) return;

    if (this.pendingCommands.length === 1) {
      this.pushCommand(this.pendingCommands[0]);
    } else {
      // Combine into batch
      const first = this.pendingCommands[0];
      const last = this.pendingCommands[this.pendingCommands.length - 1];

      // For cell edits, combine first's undo with last's redo
      if (first instanceof CellSnapshotCommand && last instanceof CellSnapshotCommand) {
        const firstOp = first.toOperation();
        const lastOp = last.toOperation();

        const combined = new CellSnapshotCommand(
          this.target!,
          first.type,
          first.description,
          firstOp.undoData,
          lastOp.redoData
        );

        this.pushCommand(combined);
      } else {
        // Fallback: create batch
        const batch = new BatchCommandImpl(
          first.description,
          this.pendingCommands
        );
        this.pushCommand(batch);
      }
    }

    this.pendingCommands = [];
  }

  private notifyStateChange(): void {
    this.events.onStateChange?.(this.getState());
  }

  private cellToAddress(row: number, col: number): string {
    return `${this.colToLetter(col)}${row + 1}`;
  }

  private colToLetter(col: number): string {
    let letter = '';
    let c = col;
    while (c >= 0) {
      letter = String.fromCharCode((c % 26) + 65) + letter;
      c = Math.floor(c / 26) - 1;
    }
    return letter;
  }

  private getDefaultDescription(type: OperationType): string {
    const descriptions: Record<OperationType, string> = {
      setCellValue: 'Edit cell',
      setCellFormat: 'Format cells',
      setMultipleCells: 'Edit cells',
      insertRows: 'Insert rows',
      deleteRows: 'Delete rows',
      insertCols: 'Insert columns',
      deleteCols: 'Delete columns',
      mergeCells: 'Merge cells',
      unmergeCells: 'Unmerge cells',
      setRowHeight: 'Resize row',
      setColWidth: 'Resize column',
      sortRange: 'Sort',
      filterRange: 'Filter',
      paste: 'Paste',
      fill: 'Fill',
      clear: 'Clear',
      batch: 'Multiple changes',
      custom: 'Edit',
    };
    return descriptions[type] ?? 'Edit';
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a new UndoRedoManager instance.
 */
export function createUndoRedoManager(config?: UndoRedoConfig): UndoRedoManager {
  return new UndoRedoManager(config);
}

/**
 * Create a custom command with explicit apply/revert functions.
 */
export function createCustomCommand(
  type: OperationType,
  description: string,
  applyFn: () => void,
  revertFn: () => void,
  memorySizeEstimate?: number
): Command {
  return new CustomCommand(type, description, applyFn, revertFn, memorySizeEstimate);
}

/**
 * Create a batch command from an array of commands.
 */
export function createBatchCommand(description: string, commands: Command[]): BatchCommand {
  return new BatchCommandImpl(description, commands);
}
