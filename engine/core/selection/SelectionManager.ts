/**
 * VectorSheet Engine - Selection Manager
 *
 * Manages cell selection state and operations:
 * - Multi-range selection (Ctrl+Click)
 * - Selection operations (delete, format, etc.)
 * - Copy/Paste with selection
 * - Selection highlighting for rendering
 */

import {
  Cell,
  CellRef,
  CellRange,
  Selection,
  CellKey,
  rangeContains,
} from '../types/index.js';
import { SparseDataStore } from '../data/SparseDataStore.js';

export interface SelectionBounds {
  range: CellRange;
  isActive: boolean;
}

export class SelectionManager {
  private dataStore: SparseDataStore;
  private selection: Selection;

  /** Listeners for selection changes */
  private listeners: Array<(selection: Selection) => void> = [];

  constructor(dataStore: SparseDataStore) {
    this.dataStore = dataStore;

    // Initialize with A1 selected
    this.selection = {
      ranges: [{ startRow: 0, startCol: 0, endRow: 0, endCol: 0 }],
      activeCell: { row: 0, col: 0 },
      anchorCell: { row: 0, col: 0 },
      activeRangeIndex: 0,
    };
  }

  // ===========================================================================
  // Selection State
  // ===========================================================================

  getSelection(): Selection {
    return this.selection;
  }

  setSelection(selection: Selection): void {
    this.selection = selection;
    this.notifyListeners();
  }

  addSelectionListener(listener: (selection: Selection) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.selection);
    }
  }

  // ===========================================================================
  // Selection Queries
  // ===========================================================================

  /**
   * Check if a cell is in any selection range
   */
  isCellSelected(row: number, col: number): boolean {
    for (const range of this.selection.ranges) {
      if (rangeContains(range, row, col)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a cell is the active cell
   */
  isActiveCell(row: number, col: number): boolean {
    return this.selection.activeCell.row === row &&
           this.selection.activeCell.col === col;
  }

  /**
   * Get all selection bounds for rendering
   */
  getSelectionBounds(): SelectionBounds[] {
    return this.selection.ranges.map((range, index) => ({
      range,
      isActive: index === this.selection.activeRangeIndex,
    }));
  }

  /**
   * Get all cells in current selection
   */
  getSelectedCells(): CellRef[] {
    const cells: CellRef[] = [];
    const seen = new Set<string>();

    for (const range of this.selection.ranges) {
      for (let row = range.startRow; row <= range.endRow; row++) {
        for (let col = range.startCol; col <= range.endCol; col++) {
          const key = `${row}_${col}`;
          if (!seen.has(key)) {
            seen.add(key);
            cells.push({ row, col });
          }
        }
      }
    }

    return cells;
  }

  /**
   * Get count of selected cells
   */
  getSelectedCellCount(): number {
    let count = 0;
    const seen = new Set<string>();

    for (const range of this.selection.ranges) {
      for (let row = range.startRow; row <= range.endRow; row++) {
        for (let col = range.startCol; col <= range.endCol; col++) {
          const key = `${row}_${col}`;
          if (!seen.has(key)) {
            seen.add(key);
            count++;
          }
        }
      }
    }

    return count;
  }

  // ===========================================================================
  // Selection Operations
  // ===========================================================================

  /**
   * Delete contents of all selected cells
   */
  deleteSelectedContents(): CellRef[] {
    const deletedCells: CellRef[] = [];

    for (const range of this.selection.ranges) {
      for (let row = range.startRow; row <= range.endRow; row++) {
        if (this.dataStore.isRowHidden(row)) continue;

        for (let col = range.startCol; col <= range.endCol; col++) {
          if (this.dataStore.isColumnHidden(col)) continue;

          const cell = this.dataStore.getCell(row, col);
          if (cell) {
            // Clear value and formula but keep formatting
            const updatedCell: Cell = {
              ...cell,
              value: null,
              formula: undefined,
              formulaResult: undefined,
              type: 'empty',
            };
            this.dataStore.setCell(row, col, updatedCell);
            deletedCells.push({ row, col });
          }
        }
      }
    }

    return deletedCells;
  }

  /**
   * Apply a function to all selected cells
   */
  applyToSelection<T>(
    fn: (row: number, col: number, cell: Cell | null) => T
  ): T[] {
    const results: T[] = [];

    for (const range of this.selection.ranges) {
      for (let row = range.startRow; row <= range.endRow; row++) {
        if (this.dataStore.isRowHidden(row)) continue;

        for (let col = range.startCol; col <= range.endCol; col++) {
          if (this.dataStore.isColumnHidden(col)) continue;

          const cell = this.dataStore.getCell(row, col);
          results.push(fn(row, col, cell));
        }
      }
    }

    return results;
  }

  /**
   * Apply formatting to all selected cells
   */
  applyFormat(format: Partial<Cell['format']>): void {
    for (const range of this.selection.ranges) {
      for (let row = range.startRow; row <= range.endRow; row++) {
        for (let col = range.startCol; col <= range.endCol; col++) {
          let cell = this.dataStore.getCell(row, col);

          if (!cell) {
            cell = { value: null, type: 'empty' };
          }

          cell = {
            ...cell,
            format: { ...cell.format, ...format },
          };

          this.dataStore.setCell(row, col, cell);
        }
      }
    }
  }

  // ===========================================================================
  // Selection Statistics (for status bar)
  // ===========================================================================

  /**
   * Calculate statistics for selected numeric values
   */
  calculateSelectionStats(): {
    sum: number | null;
    average: number | null;
    count: number;
    numericCount: number;
    min: number | null;
    max: number | null;
  } {
    const values: number[] = [];
    let totalCount = 0;

    for (const range of this.selection.ranges) {
      for (let row = range.startRow; row <= range.endRow; row++) {
        for (let col = range.startCol; col <= range.endCol; col++) {
          totalCount++;
          const cell = this.dataStore.getCell(row, col);

          if (cell && typeof cell.value === 'number') {
            values.push(cell.value);
          }
        }
      }
    }

    if (values.length === 0) {
      return {
        sum: null,
        average: null,
        count: totalCount,
        numericCount: 0,
        min: null,
        max: null,
      };
    }

    const sum = values.reduce((a, b) => a + b, 0);

    return {
      sum,
      average: sum / values.length,
      count: totalCount,
      numericCount: values.length,
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }

  // ===========================================================================
  // Copy/Paste Support
  // ===========================================================================

  /**
   * Get selection data for copy operation
   */
  getCopyData(): {
    range: CellRange;
    cells: Map<CellKey, Cell>;
  } {
    // For multi-range, only copy the active range
    const range = this.selection.ranges[this.selection.activeRangeIndex];
    const cells = this.dataStore.getCellsInRange(range);

    return { range, cells };
  }

  /**
   * Check if ranges can be pasted (same shape for multi-range)
   */
  canPasteToSelection(sourceRange: CellRange): boolean {
    if (this.selection.ranges.length === 1) {
      return true; // Single target range always works
    }

    // Multiple target ranges: all must be same size as source
    const sourceRows = sourceRange.endRow - sourceRange.startRow + 1;
    const sourceCols = sourceRange.endCol - sourceRange.startCol + 1;

    for (const range of this.selection.ranges) {
      const rows = range.endRow - range.startRow + 1;
      const cols = range.endCol - range.startCol + 1;

      if (rows !== sourceRows || cols !== sourceCols) {
        return false;
      }
    }

    return true;
  }

  // ===========================================================================
  // Fill Handle Support
  // ===========================================================================

  /**
   * Get the fill handle position (bottom-right of active range)
   */
  getFillHandlePosition(): CellRef {
    const range = this.selection.ranges[this.selection.activeRangeIndex];
    return {
      row: range.endRow,
      col: range.endCol,
    };
  }

  /**
   * Get the source range for a fill operation
   */
  getFillSourceRange(): CellRange {
    return this.selection.ranges[this.selection.activeRangeIndex];
  }
}
