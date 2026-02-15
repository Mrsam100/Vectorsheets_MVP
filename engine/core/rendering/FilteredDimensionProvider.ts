/**
 * Filtered Dimension Provider
 *
 * Wrapper for DimensionProvider that adds filter awareness.
 * Makes VirtualRenderer respect filtered rows by treating them as hidden.
 *
 * Design:
 * - Wraps an existing DimensionProvider (typically SparseDataStore)
 * - Injects FilterManager to check if rows are filtered out
 * - isRowHidden() returns true for both manually hidden AND filtered rows
 * - All other methods delegate to the wrapped provider
 *
 * Integration:
 * - Used in SpreadsheetEngine to make VirtualRenderer filter-aware
 * - Zero performance overhead when no filters active
 * - O(1) filtered row check (FilterManager uses Set<number>)
 */

import type { DimensionProvider } from './VirtualRenderer.js';
import type { FilterManager } from '../filtering/FilterManager.js';
import type { Cell, CellRange } from '../types/index.js';

/**
 * Dimension provider that respects filtered rows.
 * Wraps a base provider and adds filter awareness.
 */
export class FilteredDimensionProvider implements DimensionProvider {
  private baseProvider: DimensionProvider;
  private filterManager: FilterManager;

  constructor(baseProvider: DimensionProvider, filterManager: FilterManager) {
    this.baseProvider = baseProvider;
    this.filterManager = filterManager;
  }

  /**
   * Get row height (delegates to base provider)
   */
  getRowHeight(row: number): number {
    return this.baseProvider.getRowHeight(row);
  }

  /**
   * Get column width (delegates to base provider)
   */
  getColumnWidth(col: number): number {
    return this.baseProvider.getColumnWidth(col);
  }

  /**
   * Check if row is hidden.
   * Returns true if:
   * 1. Row is manually hidden in base provider, OR
   * 2. Row is filtered out by FilterManager
   *
   * Performance: O(1) for both checks
   * - Base provider check: Map lookup
   * - Filter check: Set.has() lookup
   */
  isRowHidden(row: number): boolean {
    // Check if manually hidden
    if (this.baseProvider.isRowHidden(row)) {
      return true;
    }

    // Check if filtered out
    if (this.filterManager.hasFilters()) {
      // If filters are active, row is hidden if NOT in visible set
      return !this.filterManager.isRowVisible(row);
    }

    return false;
  }

  /**
   * Check if column is hidden (delegates to base provider)
   * Note: Column filtering is not supported in this version
   */
  isColumnHidden(col: number): boolean {
    return this.baseProvider.isColumnHidden(col);
  }

  /**
   * Get cell data (optional, delegates to base provider)
   */
  getCell?(row: number, col: number): Cell | null {
    return this.baseProvider.getCell?.(row, col) ?? null;
  }

  /**
   * Get used range (optional, delegates to base provider)
   */
  getUsedRange?(): CellRange {
    return this.baseProvider.getUsedRange?.() ?? { startRow: 0, endRow: 0, startCol: 0, endCol: 0 };
  }

  /**
   * Update the filter manager reference.
   * Call this if FilterManager instance changes.
   */
  setFilterManager(filterManager: FilterManager): void {
    this.filterManager = filterManager;
  }

  /**
   * Get the base provider (for testing/debugging)
   */
  getBaseProvider(): DimensionProvider {
    return this.baseProvider;
  }

  /**
   * Get the filter manager (for testing/debugging)
   */
  getFilterManager(): FilterManager {
    return this.filterManager;
  }
}
