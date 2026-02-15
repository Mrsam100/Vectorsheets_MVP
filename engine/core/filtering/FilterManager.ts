/**
 * Filter Manager
 * Manages filter state and calculates filtered rows for the spreadsheet
 */

import type { FilterPredicate, SerializedPredicate, CellValue } from './types.js';
import { deserializePredicate } from './FilterPredicate.js';
import type { CellRef } from '../types/index.js';

/**
 * Column filter state
 */
export interface ColumnFilter {
  column: number;
  predicate: FilterPredicate;
}

/**
 * Serialized filter manager state
 */
export interface SerializedFilterState {
  version: string;
  filters: Array<{
    column: number;
    predicate: SerializedPredicate;
  }>;
}

/**
 * Data source interface for reading cell values
 */
export interface FilterDataSource {
  /**
   * Get cell value at position
   */
  getCellValue(row: number, col: number): CellValue;

  /**
   * Get the range of used rows (0 to maxRow)
   */
  getUsedRange(): { startRow: number; endRow: number; startCol: number; endCol: number };
}

/**
 * Filter event listener
 */
export type FilterListener = () => void;

/**
 * Filter Manager
 * Manages filter state for all columns and calculates visible rows
 */
export class FilterManager {
  private filters: Map<number, FilterPredicate> = new Map();
  private cachedFilteredRows: Set<number> | null = null;
  private version: number = 0;
  private listeners: Set<FilterListener> = new Set();
  private dataSource: FilterDataSource;

  /**
   * Create a new FilterManager
   * @param dataSource - Data source for reading cell values
   */
  constructor(dataSource: FilterDataSource) {
    this.dataSource = dataSource;
  }

  // ===========================================================================
  // Filter Management
  // ===========================================================================

  /**
   * Apply a filter to a column
   * @param column - Column index (0-based)
   * @param predicate - Filter predicate to apply
   */
  applyFilter(column: number, predicate: FilterPredicate): void {
    if (column < 0) {
      throw new Error(`Invalid column: ${column}`);
    }

    this.filters.set(column, predicate);
    this.invalidateCache();
    this.notifyListeners();
  }

  /**
   * Clear filter from a specific column
   * @param column - Column index (0-based)
   * @returns true if a filter was removed
   */
  clearFilter(column: number): boolean {
    const had = this.filters.has(column);
    if (had) {
      this.filters.delete(column);
      this.invalidateCache();
      this.notifyListeners();
    }
    return had;
  }

  /**
   * Clear all filters
   */
  clearAllFilters(): void {
    if (this.filters.size > 0) {
      this.filters.clear();
      this.invalidateCache();
      this.notifyListeners();
    }
  }

  /**
   * Get filter for a specific column
   * @param column - Column index
   * @returns Filter predicate or undefined
   */
  getFilter(column: number): FilterPredicate | undefined {
    return this.filters.get(column);
  }

  /**
   * Get all active filters
   * @returns Array of column filters
   */
  getAllFilters(): ColumnFilter[] {
    const result: ColumnFilter[] = [];
    for (const [column, predicate] of this.filters) {
      result.push({ column, predicate });
    }
    return result;
  }

  /**
   * Check if any filters are active
   * @returns true if at least one filter is active
   */
  hasFilters(): boolean {
    return this.filters.size > 0;
  }

  /**
   * Get count of active filters
   */
  getFilterCount(): number {
    return this.filters.size;
  }

  // ===========================================================================
  // Filtered Row Calculation
  // ===========================================================================

  /**
   * Get set of visible row indices after applying filters
   * Uses cached result if available
   * @returns Set of visible row indices
   */
  getFilteredRows(): Set<number> {
    // Return cached result if available
    if (this.cachedFilteredRows !== null) {
      return this.cachedFilteredRows;
    }

    // If no filters, all rows are visible
    if (this.filters.size === 0) {
      const usedRange = this.dataSource.getUsedRange();
      const allRows = new Set<number>();
      for (let row = usedRange.startRow; row <= usedRange.endRow; row++) {
        allRows.add(row);
      }
      this.cachedFilteredRows = allRows;
      return allRows;
    }

    // Calculate filtered rows
    const visibleRows = new Set<number>();
    const usedRange = this.dataSource.getUsedRange();

    // Test each row against all filters
    for (let row = usedRange.startRow; row <= usedRange.endRow; row++) {
      if (this.isRowVisible(row)) {
        visibleRows.add(row);
      }
    }

    this.cachedFilteredRows = visibleRows;
    return visibleRows;
  }

  /**
   * Check if a specific row is visible (passes all filters)
   * @param row - Row index
   * @returns true if row passes all filters
   */
  isRowVisible(row: number): boolean {
    // If no filters, row is visible
    if (this.filters.size === 0) {
      return true;
    }

    // Row must pass ALL column filters (AND logic)
    for (const [column, predicate] of this.filters) {
      const cellValue = this.dataSource.getCellValue(row, column);
      if (!predicate.test(cellValue)) {
        return false; // Failed this filter
      }
    }

    return true; // Passed all filters
  }

  /**
   * Get count of visible rows
   */
  getVisibleRowCount(): number {
    return this.getFilteredRows().size;
  }

  /**
   * Invalidate cached filtered rows
   * Call this when data changes
   */
  invalidateCache(): void {
    this.cachedFilteredRows = null;
    this.version++;
  }

  // ===========================================================================
  // React 18 Subscription
  // ===========================================================================

  /**
   * Subscribe to filter changes
   * Compatible with React 18's useSyncExternalStore
   * @param listener - Callback to invoke on changes
   * @returns Unsubscribe function
   */
  subscribe = (listener: FilterListener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Get snapshot of current filter state
   * Compatible with React 18's useSyncExternalStore
   * @returns Current version number
   */
  getSnapshot = (): number => {
    return this.version;
  };

  /**
   * Notify all listeners of changes
   */
  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  // ===========================================================================
  // Serialization
  // ===========================================================================

  /**
   * Serialize filter state for save/load
   * @returns Serialized filter state
   */
  serialize(): SerializedFilterState {
    const filters = [];
    for (const [column, predicate] of this.filters) {
      filters.push({
        column,
        predicate: predicate.serialize(),
      });
    }

    return {
      version: '1.0',
      filters,
    };
  }

  /**
   * Deserialize filter state from saved data
   * @param data - Serialized filter state
   */
  deserialize(data: SerializedFilterState): void {
    // Clear existing filters
    this.filters.clear();

    // Restore filters
    for (const item of data.filters) {
      const predicate = deserializePredicate(item.predicate);
      this.filters.set(item.column, predicate);
    }

    this.invalidateCache();
    this.notifyListeners();
  }

  // ===========================================================================
  // Debug/Inspection
  // ===========================================================================

  /**
   * Get human-readable summary of active filters
   * @returns Array of filter descriptions
   */
  getFilterSummary(): Array<{ column: number; description: string }> {
    const summary = [];
    for (const [column, predicate] of this.filters) {
      summary.push({
        column,
        description: predicate.description,
      });
    }
    return summary;
  }

  /**
   * Get current version number
   */
  getVersion(): number {
    return this.version;
  }
}
