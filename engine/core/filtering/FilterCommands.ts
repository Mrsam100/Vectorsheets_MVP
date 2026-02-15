/**
 * Filter System - Undo/Redo Commands
 *
 * Production-ready undo/redo support for filter operations using the Command Pattern.
 *
 * Command Types:
 * - ApplyFilterCommand: Apply filter to column with full revert capability
 * - ClearFilterCommand: Remove filter from column with full revert capability
 *
 * Design:
 * - Commands store before/after state for full reversibility
 * - Predicates are immutable (no cloning needed)
 * - Memory size estimation for history management
 * - Consistent with UndoRedoManager's Command interface
 *
 * @module FilterCommands
 */

import { Command, OperationType } from '../history/UndoRedoManager.js';
import type { FilterManager } from './FilterManager.js';
import type { FilterPredicate } from './types.js';

// =============================================================================
// Helper: Generate Command ID
// =============================================================================

let filterCommandIdCounter = 0;

function generateFilterCommandId(): string {
  return `filter_cmd_${++filterCommandIdCounter}_${Date.now()}`;
}

// =============================================================================
// ApplyFilterCommand - Apply filter to column
// =============================================================================

/**
 * Command to apply a filter predicate to a column.
 *
 * Apply: Set column filter to new predicate
 * Revert: Restore column to old predicate (or clear if no previous filter)
 *
 * Memory: ~100 bytes (predicates are immutable, just store references)
 */
export class ApplyFilterCommand implements Command {
  readonly id: string;
  readonly type: OperationType = 'filterRange';
  readonly description: string;
  readonly timestamp: number;

  private filterManager: FilterManager;
  private column: number;
  private newPredicate: FilterPredicate;
  private oldPredicate: FilterPredicate | undefined; // Captured during construction

  constructor(
    filterManager: FilterManager,
    column: number,
    newPredicate: FilterPredicate
  ) {
    this.id = generateFilterCommandId();
    this.timestamp = Date.now();
    this.description = `Apply filter to column ${this.columnToLetter(column)}`;
    this.filterManager = filterManager;
    this.column = column;
    this.newPredicate = newPredicate;

    // Capture old predicate before applying new one
    this.oldPredicate = this.filterManager.getFilter(column);
  }

  apply(): void {
    this.filterManager.applyFilter(this.column, this.newPredicate);
  }

  revert(): void {
    if (this.oldPredicate) {
      // Restore old filter
      this.filterManager.applyFilter(this.column, this.oldPredicate);
    } else {
      // No previous filter - clear it
      this.filterManager.clearFilter(this.column);
    }
  }

  getMemorySize(): number {
    // Predicates are immutable, just storing references
    // Command overhead: ~100 bytes
    return 100;
  }

  private columnToLetter(col: number): string {
    let letter = '';
    let num = col;
    while (num >= 0) {
      letter = String.fromCharCode(65 + (num % 26)) + letter;
      num = Math.floor(num / 26) - 1;
    }
    return letter;
  }
}

// =============================================================================
// ClearFilterCommand - Remove filter from column
// =============================================================================

/**
 * Command to clear a filter from a column.
 *
 * Apply: Remove filter from column
 * Revert: Restore previous filter predicate
 *
 * Memory: ~100 bytes (predicates are immutable, just store references)
 */
export class ClearFilterCommand implements Command {
  readonly id: string;
  readonly type: OperationType = 'filterRange';
  readonly description: string;
  readonly timestamp: number;

  private filterManager: FilterManager;
  private column: number;
  private oldPredicate: FilterPredicate | undefined; // Captured during construction

  constructor(filterManager: FilterManager, column: number) {
    this.id = generateFilterCommandId();
    this.timestamp = Date.now();
    this.description = `Clear filter from column ${this.columnToLetter(column)}`;
    this.filterManager = filterManager;
    this.column = column;

    // Capture old predicate before clearing
    this.oldPredicate = this.filterManager.getFilter(column);
  }

  apply(): void {
    this.filterManager.clearFilter(this.column);
  }

  revert(): void {
    if (this.oldPredicate) {
      // Restore old filter
      this.filterManager.applyFilter(this.column, this.oldPredicate);
    }
    // If no old predicate, nothing to restore (already cleared)
  }

  getMemorySize(): number {
    // Predicates are immutable, just storing references
    // Command overhead: ~100 bytes
    return 100;
  }

  private columnToLetter(col: number): string {
    let letter = '';
    let num = col;
    while (num >= 0) {
      letter = String.fromCharCode(65 + (num % 26)) + letter;
      num = Math.floor(num / 26) - 1;
    }
    return letter;
  }
}

// =============================================================================
// ClearAllFiltersCommand - Remove all filters
// =============================================================================

/**
 * Command to clear all filters from all columns.
 *
 * Apply: Remove all filters
 * Revert: Restore all previous filters
 *
 * Memory: ~100 bytes per filter
 */
export class ClearAllFiltersCommand implements Command {
  readonly id: string;
  readonly type: OperationType = 'filterRange';
  readonly description: string;
  readonly timestamp: number;

  private filterManager: FilterManager;
  private oldFilters: Array<{ column: number; predicate: FilterPredicate }>; // Captured during construction

  constructor(filterManager: FilterManager) {
    this.id = generateFilterCommandId();
    this.timestamp = Date.now();
    this.description = `Clear all filters`;
    this.filterManager = filterManager;

    // Capture all current filters before clearing
    this.oldFilters = this.filterManager.getAllFilters();
  }

  apply(): void {
    this.filterManager.clearAllFilters();
  }

  revert(): void {
    // Restore all old filters
    for (const { column, predicate } of this.oldFilters) {
      this.filterManager.applyFilter(column, predicate);
    }
  }

  getMemorySize(): number {
    // ~100 bytes per filter
    return this.oldFilters.length * 100;
  }
}
