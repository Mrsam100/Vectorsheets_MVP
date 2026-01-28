/**
 * VectorSheet Engine - Formula Calculation Engine
 *
 * Handles formula evaluation with:
 * - Result caching (only recalculate dirty cells)
 * - Non-blocking async calculation for large workloads
 * - Dependency-aware calculation order
 * - Error handling with Excel-compatible error types
 */

import {
  CellKey,
  CellRef,
  FormulaError,
  isFormulaError,
  cellKey,
  parseKey,
} from '../types/index.js';
import { SparseDataStore } from '../data/SparseDataStore.js';
import {
  DependencyGraph,
  parseFormulaReferences,
  containsVolatileFunction,
} from './DependencyGraph.js';

export type FormulaValue = string | number | boolean | null | FormulaError;

export interface CalculationProgress {
  total: number;
  completed: number;
  currentCell?: CellKey;
  errors: Array<{ cell: CellKey; error: FormulaError }>;
}

export interface CalculationResult {
  success: boolean;
  calculatedCount: number;
  errors: Array<{ cell: CellKey; error: FormulaError }>;
  duration: number;
}

export type CalculationProgressCallback = (progress: CalculationProgress) => void;

/**
 * Formula evaluation function type
 * Implement this to provide actual formula parsing/evaluation
 */
export type FormulaEvaluator = (
  formula: string,
  getCellValue: (row: number, col: number) => FormulaValue
) => FormulaValue;

export class FormulaEngine {
  private dataStore: SparseDataStore;
  private dependencyGraph: DependencyGraph;
  private evaluator: FormulaEvaluator;

  /** Calculation in progress flag */
  private isCalculating: boolean = false;

  /** Abort controller for cancellation */
  private abortController: AbortController | null = null;

  /** Time slice for async calculation (ms) */
  private readonly TIME_SLICE_MS = 16; // ~60fps

  /** Maximum cells per time slice */
  private readonly CELLS_PER_SLICE = 100;

  constructor(
    dataStore: SparseDataStore,
    evaluator: FormulaEvaluator
  ) {
    this.dataStore = dataStore;
    this.dependencyGraph = new DependencyGraph();
    this.evaluator = evaluator;
  }

  // ===========================================================================
  // Formula Management
  // ===========================================================================

  /**
   * Set a formula for a cell
   * Parses references, updates dependencies, marks for calculation
   */
  setFormula(row: number, col: number, formula: string): FormulaError | null {
    const key = cellKey(row, col);

    // Parse references from formula
    const references = parseFormulaReferences(formula);
    const isVolatile = containsVolatileFunction(formula);

    // Update dependency graph
    const circularError = this.dependencyGraph.setDependencies(
      key,
      references,
      isVolatile
    );

    if (circularError) {
      return '#REF!' as FormulaError;
    }

    // Mark cell and dependents as dirty
    this.dependencyGraph.markDirty(key);

    return null;
  }

  /**
   * Remove formula from a cell
   */
  removeFormula(row: number, col: number): void {
    const key = cellKey(row, col);
    this.dependencyGraph.removeDependencies(key);
  }

  /**
   * Mark a cell as dirty (needs recalculation)
   */
  markDirty(row: number, col: number): void {
    this.dependencyGraph.markDirty(cellKey(row, col));
  }

  // ===========================================================================
  // Synchronous Calculation
  // ===========================================================================

  /**
   * Calculate all dirty cells synchronously
   * Use for small workloads only
   */
  calculateSync(): CalculationResult {
    const startTime = performance.now();
    const errors: Array<{ cell: CellKey; error: FormulaError }> = [];

    // Mark volatile cells as dirty
    this.dependencyGraph.markVolatileDirty();

    // Get calculation order
    const order = this.dependencyGraph.getCalculationOrder();

    // Calculate each cell
    for (const key of order) {
      const error = this.calculateCell(key);
      if (error) {
        errors.push({ cell: key, error });
      }
    }

    // Clear dirty flags
    this.dependencyGraph.clearAllDirty();

    return {
      success: errors.length === 0,
      calculatedCount: order.length,
      errors,
      duration: performance.now() - startTime,
    };
  }

  /**
   * Calculate a single cell
   */
  private calculateCell(key: CellKey): FormulaError | null {
    const { row, col } = parseKey(key);
    const cell = this.dataStore.getCell(row, col);

    if (!cell || !cell.formula) {
      this.dependencyGraph.clearDirty(key);
      return null;
    }

    // Check for circular reference
    if (this.dependencyGraph.hasCircularReference(key)) {
      cell.formulaResult = '#REF!' as FormulaError;
      cell.isDirty = false;
      this.dataStore.setCell(row, col, cell);
      return '#REF!' as FormulaError;
    }

    try {
      // Evaluate the formula
      const result = this.evaluator(
        cell.formula,
        (r, c) => this.getCellValue(r, c)
      );

      cell.formulaResult = result;
      cell.value = result;
      cell.isDirty = false;
      this.dataStore.setCell(row, col, cell);

      if (isFormulaError(result)) {
        return result;
      }

      return null;
    } catch (error) {
      const formulaError = '#VALUE!' as FormulaError;
      cell.formulaResult = formulaError;
      cell.value = formulaError;
      cell.isDirty = false;
      this.dataStore.setCell(row, col, cell);
      return formulaError;
    }
  }

  /**
   * Get cell value for formula evaluation
   */
  private getCellValue(row: number, col: number): FormulaValue {
    const cell = this.dataStore.getCell(row, col);

    if (!cell) return null;

    // If cell has formula and is dirty, calculate it first
    if (cell.formula && cell.isDirty) {
      this.calculateCell(cellKey(row, col));
    }

    // Return formula result if available, otherwise raw value
    if (cell.formula !== undefined) {
      return cell.formulaResult ?? null;
    }

    return cell.value;
  }

  // ===========================================================================
  // Asynchronous Non-Blocking Calculation
  // ===========================================================================

  /**
   * Calculate all dirty cells asynchronously
   * Yields control to the browser periodically to prevent UI freezing
   */
  async calculateAsync(
    progressCallback?: CalculationProgressCallback
  ): Promise<CalculationResult> {
    // If already calculating, cancel previous
    if (this.isCalculating && this.abortController) {
      this.abortController.abort();
    }

    this.isCalculating = true;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    const startTime = performance.now();
    const errors: Array<{ cell: CellKey; error: FormulaError }> = [];

    // Mark volatile cells as dirty
    this.dependencyGraph.markVolatileDirty();

    // Get calculation order
    const order = this.dependencyGraph.getCalculationOrder();
    const total = order.length;
    let completed = 0;

    // Process in time slices
    let sliceStart = performance.now();
    let cellsInSlice = 0;

    for (const key of order) {
      // Check for cancellation
      if (signal.aborted) {
        this.isCalculating = false;
        return {
          success: false,
          calculatedCount: completed,
          errors,
          duration: performance.now() - startTime,
        };
      }

      // Calculate the cell
      const error = this.calculateCell(key);
      if (error) {
        errors.push({ cell: key, error });
      }

      completed++;
      cellsInSlice++;

      // Report progress
      if (progressCallback) {
        progressCallback({
          total,
          completed,
          currentCell: key,
          errors,
        });
      }

      // Check if we should yield
      const elapsed = performance.now() - sliceStart;
      if (elapsed >= this.TIME_SLICE_MS || cellsInSlice >= this.CELLS_PER_SLICE) {
        // Yield control to the browser
        await this.yieldToMain();
        sliceStart = performance.now();
        cellsInSlice = 0;
      }
    }

    // Clear dirty flags
    this.dependencyGraph.clearAllDirty();
    this.isCalculating = false;

    return {
      success: errors.length === 0,
      calculatedCount: completed,
      errors,
      duration: performance.now() - startTime,
    };
  }

  /**
   * Yield control back to the main thread
   */
  private yieldToMain(): Promise<void> {
    return new Promise(resolve => {
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => resolve(), { timeout: 50 });
      } else {
        setTimeout(resolve, 0);
      }
    });
  }

  /**
   * Cancel any in-progress calculation
   */
  cancelCalculation(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Check if calculation is in progress
   */
  isCalculationInProgress(): boolean {
    return this.isCalculating;
  }

  // ===========================================================================
  // Quick Calculation for Single Cell Changes
  // ===========================================================================

  /**
   * Recalculate just the affected cells after a single cell change
   * Much faster than full recalc for typical user edits
   */
  recalculateAffected(row: number, col: number): CalculationResult {
    const startTime = performance.now();
    const errors: Array<{ cell: CellKey; error: FormulaError }> = [];
    const key = cellKey(row, col);

    // Mark the cell and its dependents dirty
    this.dependencyGraph.markDirty(key);

    // Get only the dirty cells in order
    const order = this.dependencyGraph.getCalculationOrder();

    // Calculate each cell
    for (const cellKey of order) {
      const error = this.calculateCell(cellKey);
      if (error) {
        errors.push({ cell: cellKey, error });
      }
    }

    // Clear dirty flags
    this.dependencyGraph.clearAllDirty();

    return {
      success: errors.length === 0,
      calculatedCount: order.length,
      errors,
      duration: performance.now() - startTime,
    };
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  /**
   * Get the dependency graph (for debugging/visualization)
   */
  getDependencyGraph(): DependencyGraph {
    return this.dependencyGraph;
  }

  /**
   * Get calculation statistics
   */
  getStats(): {
    graphStats: ReturnType<DependencyGraph['getStats']>;
    isCalculating: boolean;
  } {
    return {
      graphStats: this.dependencyGraph.getStats(),
      isCalculating: this.isCalculating,
    };
  }

  /**
   * Clear all formula data
   */
  clear(): void {
    this.dependencyGraph.clear();
    this.cancelCalculation();
  }
}

// ===========================================================================
// Simple Built-in Formula Evaluator
// ===========================================================================

/**
 * A simple formula evaluator for testing
 * In production, replace with a full parser (like @formulajs/formulajs)
 */
export function createSimpleEvaluator(): FormulaEvaluator {
  return (formula: string, getCellValue: (row: number, col: number) => FormulaValue): FormulaValue => {
    // Remove leading = if present
    let expr = formula.startsWith('=') ? formula.slice(1) : formula;
    expr = expr.trim();

    // Handle simple cell reference (e.g., "A1")
    const cellRefMatch = expr.match(/^([A-Z]+)(\d+)$/i);
    if (cellRefMatch) {
      const col = columnLetterToIndex(cellRefMatch[1]);
      const row = parseInt(cellRefMatch[2], 10) - 1;
      return getCellValue(row, col);
    }

    // Handle SUM function
    const sumMatch = expr.match(/^SUM\(([A-Z]+\d+):([A-Z]+\d+)\)$/i);
    if (sumMatch) {
      const start = parseCellRef(sumMatch[1]);
      const end = parseCellRef(sumMatch[2]);
      if (start && end) {
        let sum = 0;
        for (let r = start.row; r <= end.row; r++) {
          for (let c = start.col; c <= end.col; c++) {
            const val = getCellValue(r, c);
            if (typeof val === 'number') {
              sum += val;
            }
          }
        }
        return sum;
      }
    }

    // Handle simple arithmetic with cell refs
    // This is a very basic implementation
    try {
      // Replace cell references with values
      const withValues = expr.replace(/([A-Z]+)(\d+)/gi, (_match, col, row) => {
        const c = columnLetterToIndex(col);
        const r = parseInt(row, 10) - 1;
        const val = getCellValue(r, c);
        if (val === null || val === undefined) return '0';
        if (typeof val === 'string' && isFormulaError(val)) return 'NaN';
        return String(val);
      });

      // Evaluate simple arithmetic (unsafe for production!)
      // A real implementation would use a proper parser
      const result = Function(`"use strict"; return (${withValues})`)();
      return typeof result === 'number' ? result : '#VALUE!';
    } catch {
      return '#VALUE!' as FormulaError;
    }
  };
}

function columnLetterToIndex(letters: string): number {
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.toUpperCase().charCodeAt(i) - 64);
  }
  return col - 1;
}

function parseCellRef(ref: string): CellRef | null {
  const match = ref.match(/^([A-Z]+)(\d+)$/i);
  if (!match) return null;
  return {
    row: parseInt(match[2], 10) - 1,
    col: columnLetterToIndex(match[1]),
  };
}
