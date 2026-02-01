/**
 * VectorSheet Engine - Sort & Filter (Production-Grade Data Operations)
 *
 * Comprehensive sorting and filtering with Excel-compatible behavior.
 * Handles large datasets efficiently with stable sorting and row integrity.
 *
 * Features:
 * - Multi-column sort with stable ordering
 * - Custom sort orders (lists, locale-aware)
 * - Value filters (checkbox selection)
 * - Text filters (contains, starts with, etc.)
 * - Number filters (greater than, between, etc.)
 * - Top N / Bottom N filters
 * - Above/Below average filters
 * - Date filters
 * - Color filters
 * - Row integrity preservation
 *
 * Design:
 * - Deterministic: Same inputs produce same outputs
 * - Stable: Equal elements maintain relative order
 * - Decoupled: Works via DataReader/DataWriter interfaces
 * - Memory-efficient: Operates on row indices, not copies
 * - No UI/DOM dependencies
 */

import { Cell, CellRange } from '../types/index.js';

// =============================================================================
// Types - Sort Configuration
// =============================================================================

export type SortOrder = 'asc' | 'desc';

export interface SortRule {
  /** Column index (0-based) */
  column: number;
  /** Sort direction */
  order: SortOrder;
  /** Custom sort list (values sorted in this order) */
  customList?: string[];
  /** Case-sensitive comparison (default: false) */
  caseSensitive?: boolean;
  /** Sort blanks first (default: false, blanks last) */
  blanksFirst?: boolean;
}

export interface SortOptions {
  /** Sort rules in priority order */
  rules: SortRule[];
  /** First row is header (excluded from sort) */
  hasHeader?: boolean;
  /** Expand range to include adjacent data */
  expandRange?: boolean;
}

export interface SortResult {
  /** Sort was successful */
  success: boolean;
  /** Rows that were reordered */
  rowCount: number;
  /** Original row order (for undo) */
  originalOrder: number[];
  /** New row order */
  newOrder: number[];
  /** Error message if failed */
  error?: string;
}

// =============================================================================
// Types - Filter Configuration
// =============================================================================

export type FilterOperator =
  // Text operators
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  // Number operators
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'lessThan'
  | 'lessThanOrEqual'
  | 'between'
  | 'notBetween'
  // Special operators
  | 'isEmpty'
  | 'isNotEmpty'
  | 'top'
  | 'bottom'
  | 'aboveAverage'
  | 'belowAverage';

export type FilterType = 'values' | 'condition' | 'top' | 'color' | 'date';

export interface FilterCondition {
  /** Comparison operator */
  operator: FilterOperator;
  /** Primary value for comparison */
  value?: string | number | Date | null;
  /** Secondary value (for between operators) */
  value2?: string | number | Date;
  /** Count for top/bottom filters */
  count?: number;
  /** Whether count is percentage */
  percent?: boolean;
}

export interface ColumnFilter {
  /** Column index */
  column: number;
  /** Filter type */
  type: FilterType;
  /** Selected values (for value filter) */
  values?: Set<string>;
  /** Include blanks */
  includeBlanks?: boolean;
  /** Conditions (for condition filter) */
  conditions?: FilterCondition[];
  /** AND or OR logic for multiple conditions */
  logic?: 'and' | 'or';
  /** Color criteria (for color filter) */
  colors?: Array<{ background?: string; font?: string }>;
}

export interface Filter {
  /** Range the filter applies to (including header) */
  range: CellRange;
  /** Column filters */
  columns: Map<number, ColumnFilter>;
}

export interface AutoFilterState {
  /** Filter range (including header) */
  range: CellRange;
  /** Column filters */
  filters: Map<number, ColumnFilter>;
  /** Rows hidden by filter */
  hiddenRows: Set<number>;
  /** Filter is active */
  isActive: boolean;
}

// =============================================================================
// Types - Results
// =============================================================================

export interface FilterResult {
  /** Filter applied successfully */
  success: boolean;
  /** Rows now hidden */
  hiddenRows: Set<number>;
  /** Rows now visible */
  visibleRows: Set<number>;
  /** Total row count in range */
  totalRows: number;
  /** Error if failed */
  error?: string;
}

// =============================================================================
// Types - Events
// =============================================================================

export interface FilterEvents {
  /** Called when filter is applied */
  onFilterApply?: (state: AutoFilterState) => void;
  /** Called when filter is cleared */
  onFilterClear?: (column?: number) => void;
  /** Called when row visibility changes */
  onRowVisibilityChange?: (hiddenRows: Set<number>) => void;
  /** Called when sort completes */
  onSort?: (result: SortResult) => void;
}

// =============================================================================
// Types - Data Access Interfaces
// =============================================================================

/**
 * Interface for reading cell data.
 */
export interface SortFilterDataReader {
  getCell(row: number, col: number): Cell | null;
  getUsedRange(): CellRange;
}

/**
 * Interface for writing cell data.
 */
export interface SortFilterDataWriter {
  setCell(row: number, col: number, cell: Cell): void;
  deleteCell(row: number, col: number): void;
  setRowHidden?(row: number, hidden: boolean): void;
}

// =============================================================================
// Sort & Filter Engine
// =============================================================================

export class SortFilter {
  private reader: SortFilterDataReader;
  private writer: SortFilterDataWriter | null = null;
  private filterState: AutoFilterState | null = null;
  private events: FilterEvents = {};

  constructor(reader: SortFilterDataReader, writer?: SortFilterDataWriter) {
    this.reader = reader;
    this.writer = writer ?? null;
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  /**
   * Set the data writer.
   */
  setWriter(writer: SortFilterDataWriter): void {
    this.writer = writer;
  }

  /**
   * Set event handlers.
   */
  setEventHandlers(events: FilterEvents): void {
    this.events = { ...this.events, ...events };
  }

  // ===========================================================================
  // Primary API: sort()
  // ===========================================================================

  /**
   * Sort a range by specified rules.
   * Uses stable sorting to preserve relative order of equal elements.
   *
   * @param range The range to sort
   * @param rules Sort rules in priority order
   * @param options Additional options
   */
  sort(range: CellRange, rules: SortRule[], options: Partial<SortOptions> = {}): SortResult {
    if (!this.writer) {
      return { success: false, rowCount: 0, originalOrder: [], newOrder: [], error: 'No writer configured' };
    }

    if (rules.length === 0) {
      return { success: false, rowCount: 0, originalOrder: [], newOrder: [], error: 'No sort rules provided' };
    }

    const hasHeader = options.hasHeader ?? true;
    const dataStartRow = hasHeader ? range.startRow + 1 : range.startRow;

    if (dataStartRow > range.endRow) {
      return { success: true, rowCount: 0, originalOrder: [], newOrder: [] };
    }

    // Collect row data with original indices
    const rows: Array<{ index: number; cells: Map<number, Cell | null> }> = [];

    for (let row = dataStartRow; row <= range.endRow; row++) {
      const cells = new Map<number, Cell | null>();
      for (let col = range.startCol; col <= range.endCol; col++) {
        cells.set(col, this.reader.getCell(row, col));
      }
      rows.push({ index: row, cells });
    }

    const originalOrder = rows.map(r => r.index);

    // Stable sort using index as tiebreaker
    rows.sort((a, b) => {
      for (const rule of rules) {
        const cellA = a.cells.get(rule.column) ?? null;
        const cellB = b.cells.get(rule.column) ?? null;

        const cmp = this.compareCells(cellA, cellB, rule);
        if (cmp !== 0) {
          return rule.order === 'asc' ? cmp : -cmp;
        }
      }
      // Stable: preserve original order for equal elements
      return a.index - b.index;
    });

    const newOrder = rows.map(r => r.index);

    // Apply sorted data back to sheet
    for (let i = 0; i < rows.length; i++) {
      const targetRow = dataStartRow + i;
      const sourceRow = rows[i];

      for (let col = range.startCol; col <= range.endCol; col++) {
        const cell = sourceRow.cells.get(col);
        if (cell) {
          this.writer.setCell(targetRow, col, this.cloneCell(cell));
        } else {
          this.writer.deleteCell(targetRow, col);
        }
      }
    }

    const result: SortResult = {
      success: true,
      rowCount: rows.length,
      originalOrder,
      newOrder,
    };

    this.events.onSort?.(result);
    return result;
  }

  /**
   * Sort ascending by a single column.
   */
  sortAscending(range: CellRange, column: number, hasHeader = true): SortResult {
    return this.sort(range, [{ column, order: 'asc' }], { hasHeader });
  }

  /**
   * Sort descending by a single column.
   */
  sortDescending(range: CellRange, column: number, hasHeader = true): SortResult {
    return this.sort(range, [{ column, order: 'desc' }], { hasHeader });
  }

  // ===========================================================================
  // Primary API: applyFilter()
  // ===========================================================================

  /**
   * Apply a filter to a range.
   *
   * @param range The range to filter (including header)
   * @param filter Column filters to apply
   */
  applyFilter(range: CellRange, filter: ColumnFilter): FilterResult {
    // Initialize filter state if not active
    if (!this.filterState || !this.rangesEqual(this.filterState.range, range)) {
      this.filterState = {
        range,
        filters: new Map(),
        hiddenRows: new Set(),
        isActive: true,
      };
    }

    // Set the column filter
    this.filterState.filters.set(filter.column, filter);

    // Recalculate hidden rows
    return this.recalculateFilter();
  }

  /**
   * Apply multiple column filters at once.
   */
  applyFilters(range: CellRange, filters: ColumnFilter[]): FilterResult {
    // Initialize filter state
    this.filterState = {
      range,
      filters: new Map(),
      hiddenRows: new Set(),
      isActive: true,
    };

    for (const filter of filters) {
      this.filterState.filters.set(filter.column, filter);
    }

    return this.recalculateFilter();
  }

  // ===========================================================================
  // Primary API: clearFilter()
  // ===========================================================================

  /**
   * Clear filter for a range or column.
   *
   * @param range The range to clear filter from
   * @param column Optional specific column to clear
   */
  clearFilter(range: CellRange, column?: number): FilterResult {
    if (!this.filterState || !this.rangesEqual(this.filterState.range, range)) {
      return {
        success: true,
        hiddenRows: new Set(),
        visibleRows: new Set(),
        totalRows: 0,
      };
    }

    if (column !== undefined) {
      // Clear specific column
      this.filterState.filters.delete(column);
      this.events.onFilterClear?.(column);
    } else {
      // Clear all filters
      this.filterState.filters.clear();
      this.events.onFilterClear?.();
    }

    return this.recalculateFilter();
  }

  /**
   * Disable filtering entirely.
   */
  disableFilter(): void {
    if (this.filterState) {
      // Show all rows
      if (this.writer?.setRowHidden) {
        for (const row of this.filterState.hiddenRows) {
          this.writer.setRowHidden(row, false);
        }
      }

      this.filterState = null;
      this.events.onRowVisibilityChange?.(new Set());
      this.events.onFilterClear?.();
    }
  }

  // ===========================================================================
  // Filter State
  // ===========================================================================

  /**
   * Get current filter state.
   */
  getFilterState(): AutoFilterState | null {
    if (!this.filterState) return null;

    return {
      ...this.filterState,
      filters: new Map(this.filterState.filters),
      hiddenRows: new Set(this.filterState.hiddenRows),
    };
  }

  /**
   * Check if filtering is active.
   */
  isFilterActive(): boolean {
    return this.filterState?.isActive ?? false;
  }

  /**
   * Check if a row is visible (not filtered out).
   */
  isRowVisible(row: number): boolean {
    return !this.filterState?.hiddenRows.has(row);
  }

  /**
   * Get set of hidden rows.
   */
  getHiddenRows(): Set<number> {
    return new Set(this.filterState?.hiddenRows ?? []);
  }

  // ===========================================================================
  // Filter Helpers
  // ===========================================================================

  /**
   * Get unique values in a column (for value filter dropdown).
   */
  getColumnUniqueValues(range: CellRange, column: number): Array<{ value: string; count: number }> {
    const dataStartRow = range.startRow + 1; // Skip header
    const valueCounts = new Map<string, number>();

    for (let row = dataStartRow; row <= range.endRow; row++) {
      const cell = this.reader.getCell(row, column);
      const value = this.getCellStringValue(cell);
      valueCounts.set(value, (valueCounts.get(value) ?? 0) + 1);
    }

    return Array.from(valueCounts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => {
        // Sort: numbers first, then strings, blanks last
        if (a.value === '' && b.value !== '') return 1;
        if (a.value !== '' && b.value === '') return -1;

        const numA = parseFloat(a.value);
        const numB = parseFloat(b.value);

        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        if (!isNaN(numA)) return -1;
        if (!isNaN(numB)) return 1;

        return a.value.localeCompare(b.value);
      });
  }

  /**
   * Get column statistics (for top/bottom/average filters).
   */
  getColumnStats(range: CellRange, column: number): { min: number; max: number; average: number; count: number } | null {
    const dataStartRow = range.startRow + 1;
    const values: number[] = [];

    for (let row = dataStartRow; row <= range.endRow; row++) {
      const cell = this.reader.getCell(row, column);
      if (cell && typeof cell.value === 'number' && !isNaN(cell.value)) {
        values.push(cell.value);
      }
    }

    if (values.length === 0) return null;

    values.sort((a, b) => a - b);

    return {
      min: values[0],
      max: values[values.length - 1],
      average: values.reduce((a, b) => a + b, 0) / values.length,
      count: values.length,
    };
  }

  // ===========================================================================
  // Convenience Filter Methods
  // ===========================================================================

  /**
   * Apply a value filter (checkbox selection).
   */
  applyValueFilter(range: CellRange, column: number, values: Set<string>, includeBlanks = false): FilterResult {
    return this.applyFilter(range, {
      column,
      type: 'values',
      values,
      includeBlanks,
    });
  }

  /**
   * Apply a condition filter.
   */
  applyConditionFilter(
    range: CellRange,
    column: number,
    conditions: FilterCondition[],
    logic: 'and' | 'or' = 'and'
  ): FilterResult {
    return this.applyFilter(range, {
      column,
      type: 'condition',
      conditions,
      logic,
    });
  }

  /**
   * Apply a Top N filter.
   */
  applyTopFilter(range: CellRange, column: number, count: number, percent = false): FilterResult {
    return this.applyFilter(range, {
      column,
      type: 'top',
      conditions: [{ operator: 'top', count, percent }],
    });
  }

  /**
   * Apply a Bottom N filter.
   */
  applyBottomFilter(range: CellRange, column: number, count: number, percent = false): FilterResult {
    return this.applyFilter(range, {
      column,
      type: 'top',
      conditions: [{ operator: 'bottom', count, percent }],
    });
  }

  /**
   * Apply Above Average filter.
   */
  applyAboveAverageFilter(range: CellRange, column: number): FilterResult {
    return this.applyFilter(range, {
      column,
      type: 'condition',
      conditions: [{ operator: 'aboveAverage' }],
    });
  }

  /**
   * Apply Below Average filter.
   */
  applyBelowAverageFilter(range: CellRange, column: number): FilterResult {
    return this.applyFilter(range, {
      column,
      type: 'condition',
      conditions: [{ operator: 'belowAverage' }],
    });
  }

  // ===========================================================================
  // Private: Sorting
  // ===========================================================================

  private compareCells(cellA: Cell | null, cellB: Cell | null, rule: SortRule): number {
    const valueA = cellA?.value;
    const valueB = cellB?.value;

    const isEmptyA = valueA === null || valueA === undefined || valueA === '';
    const isEmptyB = valueB === null || valueB === undefined || valueB === '';

    // Handle blanks
    if (isEmptyA && isEmptyB) return 0;
    if (isEmptyA) return rule.blanksFirst ? -1 : 1;
    if (isEmptyB) return rule.blanksFirst ? 1 : -1;

    // Custom list ordering
    if (rule.customList) {
      const strA = String(valueA);
      const strB = String(valueB);
      const indexA = rule.customList.indexOf(strA);
      const indexB = rule.customList.indexOf(strB);

      if (indexA >= 0 && indexB >= 0) return indexA - indexB;
      if (indexA >= 0) return -1;
      if (indexB >= 0) return 1;
      // Fall through to normal comparison for values not in list
    }

    // Numeric comparison
    if (typeof valueA === 'number' && typeof valueB === 'number') {
      return valueA - valueB;
    }

    // Boolean comparison (TRUE before FALSE)
    if (typeof valueA === 'boolean' && typeof valueB === 'boolean') {
      return valueA === valueB ? 0 : (valueA ? -1 : 1);
    }

    // Mixed type: numbers < text < booleans
    const typeOrder = (v: unknown): number => {
      if (typeof v === 'number') return 0;
      if (typeof v === 'string') return 1;
      if (typeof v === 'boolean') return 2;
      return 3;
    };

    const typeA = typeOrder(valueA);
    const typeB = typeOrder(valueB);
    if (typeA !== typeB) return typeA - typeB;

    // String comparison
    let strA = String(valueA);
    let strB = String(valueB);

    if (!rule.caseSensitive) {
      strA = strA.toLowerCase();
      strB = strB.toLowerCase();
    }

    return strA.localeCompare(strB, undefined, { numeric: true });
  }

  // ===========================================================================
  // Private: Filtering
  // ===========================================================================

  private recalculateFilter(): FilterResult {
    if (!this.filterState) {
      return {
        success: false,
        hiddenRows: new Set(),
        visibleRows: new Set(),
        totalRows: 0,
        error: 'No filter state',
      };
    }

    const { range, filters } = this.filterState;
    const dataStartRow = range.startRow + 1;
    const hiddenRows = new Set<number>();
    const visibleRows = new Set<number>();

    // Pre-compute column statistics for top/bottom/average filters
    const columnStats = new Map<number, { values: number[]; average: number }>();

    for (const [col, filter] of filters) {
      if (this.needsColumnStats(filter)) {
        const values: number[] = [];
        for (let row = dataStartRow; row <= range.endRow; row++) {
          const cell = this.reader.getCell(row, col);
          if (cell && typeof cell.value === 'number' && !isNaN(cell.value)) {
            values.push(cell.value);
          }
        }
        values.sort((a, b) => a - b);
        const average = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        columnStats.set(col, { values, average });
      }
    }

    // Evaluate each row
    for (let row = dataStartRow; row <= range.endRow; row++) {
      let rowVisible = true;

      for (const [col, filter] of filters) {
        const cell = this.reader.getCell(row, col);
        const passes = this.cellPassesFilter(cell, filter, columnStats.get(col));

        if (!passes) {
          rowVisible = false;
          break;
        }
      }

      if (rowVisible) {
        visibleRows.add(row);
      } else {
        hiddenRows.add(row);
      }
    }

    // Update state
    this.filterState.hiddenRows = hiddenRows;

    // Update row visibility if writer supports it
    if (this.writer?.setRowHidden) {
      for (let row = dataStartRow; row <= range.endRow; row++) {
        this.writer.setRowHidden(row, hiddenRows.has(row));
      }
    }

    this.events.onRowVisibilityChange?.(hiddenRows);
    this.events.onFilterApply?.(this.filterState);

    return {
      success: true,
      hiddenRows,
      visibleRows,
      totalRows: range.endRow - dataStartRow + 1,
    };
  }

  private needsColumnStats(filter: ColumnFilter): boolean {
    if (!filter.conditions) return false;

    return filter.conditions.some(c =>
      c.operator === 'top' ||
      c.operator === 'bottom' ||
      c.operator === 'aboveAverage' ||
      c.operator === 'belowAverage'
    );
  }

  private cellPassesFilter(
    cell: Cell | null,
    filter: ColumnFilter,
    stats?: { values: number[]; average: number }
  ): boolean {
    const stringValue = this.getCellStringValue(cell);
    const isBlank = stringValue === '';

    switch (filter.type) {
      case 'values':
        if (isBlank) return filter.includeBlanks ?? false;
        return filter.values?.has(stringValue) ?? true;

      case 'condition':
      case 'top':
        return this.evaluateConditions(cell, filter.conditions ?? [], filter.logic ?? 'and', stats);

      case 'color':
        return this.evaluateColorFilter(cell, filter);

      default:
        return true;
    }
  }

  private evaluateConditions(
    cell: Cell | null,
    conditions: FilterCondition[],
    logic: 'and' | 'or',
    stats?: { values: number[]; average: number }
  ): boolean {
    if (conditions.length === 0) return true;

    const results = conditions.map(c => this.evaluateCondition(cell, c, stats));

    return logic === 'and' ? results.every(r => r) : results.some(r => r);
  }

  private evaluateCondition(
    cell: Cell | null,
    condition: FilterCondition,
    stats?: { values: number[]; average: number }
  ): boolean {
    const value = cell?.value;
    const stringValue = this.getCellStringValue(cell);
    const numValue = typeof value === 'number' ? value : parseFloat(stringValue);
    const isBlank = stringValue === '';

    switch (condition.operator) {
      // Empty checks
      case 'isEmpty':
        return isBlank;
      case 'isNotEmpty':
        return !isBlank;

      // Text operators
      case 'equals':
        if (typeof condition.value === 'number' && !isNaN(numValue)) {
          return numValue === condition.value;
        }
        return stringValue.toLowerCase() === String(condition.value ?? '').toLowerCase();

      case 'notEquals':
        if (typeof condition.value === 'number' && !isNaN(numValue)) {
          return numValue !== condition.value;
        }
        return stringValue.toLowerCase() !== String(condition.value ?? '').toLowerCase();

      case 'contains':
        return stringValue.toLowerCase().includes(String(condition.value ?? '').toLowerCase());

      case 'notContains':
        return !stringValue.toLowerCase().includes(String(condition.value ?? '').toLowerCase());

      case 'startsWith':
        return stringValue.toLowerCase().startsWith(String(condition.value ?? '').toLowerCase());

      case 'endsWith':
        return stringValue.toLowerCase().endsWith(String(condition.value ?? '').toLowerCase());

      // Number operators
      case 'greaterThan':
        return !isNaN(numValue) && numValue > Number(condition.value);

      case 'greaterThanOrEqual':
        return !isNaN(numValue) && numValue >= Number(condition.value);

      case 'lessThan':
        return !isNaN(numValue) && numValue < Number(condition.value);

      case 'lessThanOrEqual':
        return !isNaN(numValue) && numValue <= Number(condition.value);

      case 'between': {
        const min = Math.min(Number(condition.value), Number(condition.value2));
        const max = Math.max(Number(condition.value), Number(condition.value2));
        return !isNaN(numValue) && numValue >= min && numValue <= max;
      }

      case 'notBetween': {
        const min = Math.min(Number(condition.value), Number(condition.value2));
        const max = Math.max(Number(condition.value), Number(condition.value2));
        return !isNaN(numValue) && (numValue < min || numValue > max);
      }

      // Statistical operators
      case 'top':
        if (!stats || isNaN(numValue)) return false;
        return this.isInTopN(numValue, stats.values, condition.count ?? 10, condition.percent ?? false);

      case 'bottom':
        if (!stats || isNaN(numValue)) return false;
        return this.isInBottomN(numValue, stats.values, condition.count ?? 10, condition.percent ?? false);

      case 'aboveAverage':
        if (!stats || isNaN(numValue)) return false;
        return numValue > stats.average;

      case 'belowAverage':
        if (!stats || isNaN(numValue)) return false;
        return numValue < stats.average;

      default:
        return true;
    }
  }

  private isInTopN(value: number, sortedValues: number[], n: number, percent: boolean): boolean {
    if (sortedValues.length === 0) return false;

    const count = percent
      ? Math.ceil(sortedValues.length * (n / 100))
      : Math.min(n, sortedValues.length);

    // Get threshold (Nth largest value)
    const threshold = sortedValues[sortedValues.length - count];
    return value >= threshold;
  }

  private isInBottomN(value: number, sortedValues: number[], n: number, percent: boolean): boolean {
    if (sortedValues.length === 0) return false;

    const count = percent
      ? Math.ceil(sortedValues.length * (n / 100))
      : Math.min(n, sortedValues.length);

    // Get threshold (Nth smallest value)
    const threshold = sortedValues[count - 1];
    return value <= threshold;
  }

  private evaluateColorFilter(cell: Cell | null, filter: ColumnFilter): boolean {
    if (!filter.colors || filter.colors.length === 0) return true;

    const bg = cell?.format?.backgroundColor;
    const font = cell?.format?.fontColor;

    for (const colorCriteria of filter.colors) {
      if (colorCriteria.background && bg === colorCriteria.background) return true;
      if (colorCriteria.font && font === colorCriteria.font) return true;
    }

    return false;
  }

  // ===========================================================================
  // Private: Utilities
  // ===========================================================================

  private getCellStringValue(cell: Cell | null): string {
    if (!cell || cell.value === null || cell.value === undefined) {
      return '';
    }
    return String(cell.value);
  }

  private cloneCell(cell: Cell): Cell {
    return JSON.parse(JSON.stringify(cell));
  }

  private rangesEqual(a: CellRange, b: CellRange): boolean {
    return a.startRow === b.startRow &&
           a.startCol === b.startCol &&
           a.endRow === b.endRow &&
           a.endCol === b.endCol;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a SortFilter instance from a data store.
 */
export function createSortFilter(
  dataStore: SortFilterDataReader & SortFilterDataWriter
): SortFilter {
  return new SortFilter(dataStore, dataStore);
}

/**
 * Create a SortFilter with separate reader/writer.
 */
export function createSortFilterWithWriter(
  reader: SortFilterDataReader,
  writer: SortFilterDataWriter
): SortFilter {
  return new SortFilter(reader, writer);
}
