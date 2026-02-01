/**
 * VectorSheet Engine - Find & Replace (Sheet-Wide Search Engine)
 *
 * Production-grade find & replace with Excel-compatible behavior.
 * Supports values, formulas, and format searching.
 *
 * Features:
 * - Search in values, formulas, or formats
 * - Case-sensitive matching
 * - Whole-cell matching
 * - Regular expression support
 * - Range-constrained or whole-sheet search
 * - Single and batch replacement
 * - Efficient sparse traversal
 *
 * Design:
 * - Deterministic: Same query always returns same results in same order
 * - Memory-efficient: Iterates sparse data, no full sheet scan
 * - Decoupled: Works via DataReader interface
 * - No UI/DOM dependencies
 */

import { Cell, CellRef, CellRange, CellFormat } from '../types/index.js';

// =============================================================================
// Types - Search Configuration
// =============================================================================

export type SearchScope = 'sheet' | 'selection' | 'workbook';
export type SearchIn = 'values' | 'formulas' | 'formats' | 'all';
export type SearchDirection = 'next' | 'previous' | 'all';

export interface FindOptions {
  /** Case-sensitive search (default: false) */
  caseSensitive?: boolean;
  /** Match entire cell content only (default: false) */
  wholeCell?: boolean;
  /** Use regular expression (default: false) */
  regex?: boolean;
  /** Where to search (default: 'values') */
  searchIn?: SearchIn;
  /** Search scope (default: 'sheet') */
  scope?: SearchScope;
  /** Constrain search to this range */
  range?: CellRange;
  /** Search by rows first, then columns (default: true) */
  byRows?: boolean;
  /** Include hidden cells (default: false) */
  includeHidden?: boolean;
  /** Format properties to match (when searchIn includes 'formats') */
  formatMatch?: Partial<CellFormat>;
}

export interface ReplaceOptions extends FindOptions {
  /** Preserve case when replacing (default: false) */
  preserveCase?: boolean;
}

// =============================================================================
// Types - Results
// =============================================================================

/**
 * A single match result.
 */
export interface Match {
  /** Cell location */
  cell: CellRef;
  /** The text that matched */
  matchedText: string;
  /** Start index within the cell value/formula */
  startIndex: number;
  /** Length of the match */
  length: number;
  /** Whether the match is in a formula */
  inFormula: boolean;
  /** Whether the match is in format properties */
  inFormat: boolean;
  /** The full cell value (for context) */
  cellValue: string | number | boolean | null;
  /** The cell's formula if any */
  formula?: string;
}

export interface FindResult {
  /** All matches found */
  matches: Match[];
  /** Total match count */
  count: number;
  /** Search completed (not interrupted) */
  complete: boolean;
}

export interface FindAllResult extends FindResult {
  // Alias for backward compatibility
}

export interface ReplaceResult {
  /** Whether replacement was successful */
  success: boolean;
  /** The match that was replaced */
  match?: Match;
  /** Previous value */
  oldValue?: string;
  /** New value after replacement */
  newValue?: string;
  /** Error message if failed */
  error?: string;
}

export interface ReplaceAllResult {
  /** Number of replacements made */
  count: number;
  /** Cells that were modified */
  modifiedCells: CellRef[];
  /** Any errors encountered */
  errors: Array<{ cell: CellRef; error: string }>;
}

// =============================================================================
// Types - State & Events
// =============================================================================

export interface FindReplaceState {
  /** Current search query */
  query: string | null;
  /** Current search options */
  options: FindOptions | null;
  /** All current matches */
  matches: Match[];
  /** Current match index (-1 if none) */
  currentIndex: number;
  /** Whether search is active */
  isActive: boolean;
}

export interface FindReplaceEvents {
  /** Called when search completes */
  onFind?: (result: FindResult) => void;
  /** Called when current match changes */
  onMatchChange?: (match: Match | null, index: number, total: number) => void;
  /** Called when a replacement is made */
  onReplace?: (result: ReplaceResult) => void;
  /** Called when replace all completes */
  onReplaceAll?: (result: ReplaceAllResult) => void;
  /** Called when state changes */
  onStateChange?: (state: FindReplaceState) => void;
}

// =============================================================================
// Types - Data Access Interface
// =============================================================================

/**
 * Interface for reading cell data.
 * Decouples FindReplace from SparseDataStore.
 */
export interface DataReader {
  getCell(row: number, col: number): Cell | null;
  getAllCells(): Map<string, Cell>;
  getUsedRange(): CellRange;
  isRowHidden?(row: number): boolean;
  isColumnHidden?(col: number): boolean;
}

/**
 * Interface for writing cell data.
 */
export interface DataWriter {
  setCell(row: number, col: number, cell: Cell): void;
}

// =============================================================================
// Find & Replace Engine
// =============================================================================

export class FindReplace {
  private reader: DataReader;
  private writer: DataWriter | null = null;
  private state: FindReplaceState;
  private events: FindReplaceEvents = {};

  constructor(reader: DataReader, writer?: DataWriter) {
    this.reader = reader;
    this.writer = writer ?? null;
    this.state = this.createInitialState();
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  /**
   * Set the data writer for replace operations.
   */
  setWriter(writer: DataWriter): void {
    this.writer = writer;
  }

  /**
   * Set event handlers.
   */
  setEventHandlers(events: FindReplaceEvents): void {
    this.events = { ...this.events, ...events };
  }

  // ===========================================================================
  // State Access
  // ===========================================================================

  /**
   * Get current state.
   */
  getState(): Readonly<FindReplaceState> {
    return {
      ...this.state,
      matches: [...this.state.matches],
    };
  }

  /**
   * Get current match.
   */
  getCurrentMatch(): Match | null {
    if (this.state.currentIndex >= 0 && this.state.currentIndex < this.state.matches.length) {
      return this.state.matches[this.state.currentIndex];
    }
    return null;
  }

  /**
   * Get match count.
   */
  getMatchCount(): number {
    return this.state.matches.length;
  }

  // ===========================================================================
  // Primary API: find()
  // ===========================================================================

  /**
   * Find all matches for a query.
   *
   * @param query Search string or regex pattern
   * @param options Search options
   * @returns Array of matches
   */
  find(query: string, options: FindOptions = {}): Match[] {
    const result = this.findAll(query, options);
    return result.matches;
  }

  /**
   * Find all matches with full result metadata.
   */
  findAll(query: string, options: FindOptions = {}): FindResult {
    // Update state
    this.state.query = query;
    this.state.options = { ...options };
    this.state.isActive = true;

    // Build search pattern
    const pattern = this.buildPattern(query, options);
    if (!pattern) {
      const result: FindResult = { matches: [], count: 0, complete: true };
      this.state.matches = [];
      this.state.currentIndex = -1;
      this.notifyStateChange();
      return result;
    }

    // Determine search range
    const searchRange = options.range ?? this.reader.getUsedRange();
    const searchIn = options.searchIn ?? 'values';

    // Search all cells
    const matches = this.searchCells(pattern, searchRange, searchIn, options);

    // Sort results
    this.sortMatches(matches, options.byRows !== false);

    // Update state
    this.state.matches = matches;
    this.state.currentIndex = matches.length > 0 ? 0 : -1;

    const result: FindResult = {
      matches,
      count: matches.length,
      complete: true,
    };

    this.events.onFind?.(result);
    if (matches.length > 0) {
      this.events.onMatchChange?.(matches[0], 0, matches.length);
    }
    this.notifyStateChange();

    return result;
  }

  /**
   * Find next match from current position.
   */
  findNext(): Match | null {
    if (this.state.matches.length === 0) return null;

    this.state.currentIndex = (this.state.currentIndex + 1) % this.state.matches.length;
    const match = this.state.matches[this.state.currentIndex];

    this.events.onMatchChange?.(match, this.state.currentIndex, this.state.matches.length);
    this.notifyStateChange();

    return match;
  }

  /**
   * Find previous match from current position.
   */
  findPrevious(): Match | null {
    if (this.state.matches.length === 0) return null;

    this.state.currentIndex = this.state.currentIndex <= 0
      ? this.state.matches.length - 1
      : this.state.currentIndex - 1;
    const match = this.state.matches[this.state.currentIndex];

    this.events.onMatchChange?.(match, this.state.currentIndex, this.state.matches.length);
    this.notifyStateChange();

    return match;
  }

  /**
   * Navigate to a specific match by index.
   */
  goToMatch(index: number): Match | null {
    if (index < 0 || index >= this.state.matches.length) return null;

    this.state.currentIndex = index;
    const match = this.state.matches[index];

    this.events.onMatchChange?.(match, index, this.state.matches.length);
    this.notifyStateChange();

    return match;
  }

  // ===========================================================================
  // Primary API: replace()
  // ===========================================================================

  /**
   * Replace a specific match with a new value.
   *
   * @param match The match to replace
   * @param value The replacement value
   * @returns Replacement result
   */
  replace(match: Match, value: string): ReplaceResult {
    if (!this.writer) {
      return { success: false, error: 'No writer configured' };
    }

    const cell = this.reader.getCell(match.cell.row, match.cell.col);
    if (!cell) {
      return { success: false, error: 'Cell not found' };
    }

    try {
      let oldValue: string;
      let newValue: string;

      if (match.inFormula && cell.formula) {
        // Replace in formula
        oldValue = cell.formula;
        newValue = this.replaceInString(oldValue, match.startIndex, match.length, value);

        this.writer.setCell(match.cell.row, match.cell.col, {
          ...cell,
          formula: newValue,
        });
      } else {
        // Replace in value
        oldValue = String(cell.value ?? '');
        newValue = this.replaceInString(oldValue, match.startIndex, match.length, value);

        this.writer.setCell(match.cell.row, match.cell.col, {
          ...cell,
          value: newValue,
          type: 'string',
          formula: undefined,
          formulaResult: undefined,
        });
      }

      const result: ReplaceResult = {
        success: true,
        match,
        oldValue,
        newValue,
      };

      this.events.onReplace?.(result);

      // Refresh search if query is set
      if (this.state.query && this.state.options) {
        this.findAll(this.state.query, this.state.options);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Replace current match.
   */
  replaceCurrent(value: string): ReplaceResult {
    const match = this.getCurrentMatch();
    if (!match) {
      return { success: false, error: 'No current match' };
    }
    return this.replace(match, value);
  }

  // ===========================================================================
  // Primary API: replaceAll()
  // ===========================================================================

  /**
   * Replace all matches.
   *
   * @param query Search query
   * @param options Search options
   * @param value Replacement value
   * @returns Replace all result
   */
  replaceAll(query: string, options: FindOptions, value: string): ReplaceAllResult {
    if (!this.writer) {
      return { count: 0, modifiedCells: [], errors: [{ cell: { row: 0, col: 0 }, error: 'No writer configured' }] };
    }

    // Find all matches first
    const matches = this.find(query, options);
    if (matches.length === 0) {
      return { count: 0, modifiedCells: [], errors: [] };
    }

    // Group matches by cell
    const cellMatches = new Map<string, { row: number; col: number; matches: Match[] }>();
    for (const match of matches) {
      const key = `${match.cell.row}_${match.cell.col}`;
      if (!cellMatches.has(key)) {
        cellMatches.set(key, { row: match.cell.row, col: match.cell.col, matches: [] });
      }
      cellMatches.get(key)!.matches.push(match);
    }

    const modifiedCells: CellRef[] = [];
    const errors: Array<{ cell: CellRef; error: string }> = [];
    let count = 0;

    // Process each cell
    for (const [, { row, col, matches: cellMatchList }] of cellMatches) {
      const cell = this.reader.getCell(row, col);
      if (!cell) continue;

      try {
        // Sort matches in reverse order by position for correct replacement
        const sortedMatches = [...cellMatchList].sort((a, b) => b.startIndex - a.startIndex);

        // Determine which string to modify
        const isFormulaReplace = sortedMatches[0].inFormula && cell.formula;
        let currentValue = isFormulaReplace ? cell.formula! : String(cell.value ?? '');

        // Replace each match (in reverse order to preserve indices)
        for (const match of sortedMatches) {
          currentValue = this.replaceInString(currentValue, match.startIndex, match.length, value);
          count++;
        }

        // Update cell
        if (isFormulaReplace) {
          this.writer.setCell(row, col, {
            ...cell,
            formula: currentValue,
          });
        } else {
          this.writer.setCell(row, col, {
            ...cell,
            value: currentValue,
            type: 'string',
            formula: undefined,
            formulaResult: undefined,
          });
        }

        modifiedCells.push({ row, col });
      } catch (error) {
        errors.push({
          cell: { row, col },
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const result: ReplaceAllResult = { count, modifiedCells, errors };

    this.events.onReplaceAll?.(result);

    // Clear matches after replace all
    this.state.matches = [];
    this.state.currentIndex = -1;
    this.notifyStateChange();

    return result;
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Clear search state.
   */
  clear(): void {
    this.state = this.createInitialState();
    this.notifyStateChange();
  }

  /**
   * Close find/replace (alias for clear).
   */
  close(): void {
    this.clear();
  }

  // ===========================================================================
  // Private: Search Implementation
  // ===========================================================================

  private searchCells(
    pattern: RegExp,
    range: CellRange,
    searchIn: SearchIn,
    options: FindOptions
  ): Match[] {
    const matches: Match[] = [];
    const cells = this.reader.getAllCells();

    for (const [key, cell] of cells) {
      const [row, col] = key.split('_').map(Number);

      // Check range bounds
      if (row < range.startRow || row > range.endRow ||
          col < range.startCol || col > range.endCol) {
        continue;
      }

      // Check hidden cells
      if (!options.includeHidden) {
        if (this.reader.isRowHidden?.(row) || this.reader.isColumnHidden?.(col)) {
          continue;
        }
      }

      // Search in values
      if (searchIn === 'values' || searchIn === 'all') {
        const valueStr = cell.value === null ? '' : String(cell.value);
        const valueMatches = this.findInString(valueStr, pattern, options.wholeCell);

        for (const m of valueMatches) {
          matches.push({
            cell: { row, col },
            matchedText: m.text,
            startIndex: m.start,
            length: m.length,
            inFormula: false,
            inFormat: false,
            cellValue: cell.value,
            formula: cell.formula,
          });
        }
      }

      // Search in formulas
      if ((searchIn === 'formulas' || searchIn === 'all') && cell.formula) {
        const formulaMatches = this.findInString(cell.formula, pattern, options.wholeCell);

        for (const m of formulaMatches) {
          matches.push({
            cell: { row, col },
            matchedText: m.text,
            startIndex: m.start,
            length: m.length,
            inFormula: true,
            inFormat: false,
            cellValue: cell.value,
            formula: cell.formula,
          });
        }
      }

      // Search in formats
      if ((searchIn === 'formats' || searchIn === 'all') && options.formatMatch && cell.format) {
        if (this.matchesFormat(cell.format, options.formatMatch)) {
          matches.push({
            cell: { row, col },
            matchedText: '[format match]',
            startIndex: 0,
            length: 0,
            inFormula: false,
            inFormat: true,
            cellValue: cell.value,
            formula: cell.formula,
          });
        }
      }
    }

    return matches;
  }

  private buildPattern(query: string, options: FindOptions): RegExp | null {
    if (!query && !options.formatMatch) return null;
    if (!query && options.formatMatch) {
      // Format-only search - return dummy pattern
      return /.*/;
    }

    let pattern = query;

    // Escape special characters if not using regex
    if (!options.regex) {
      pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Whole cell match
    if (options.wholeCell) {
      pattern = `^${pattern}$`;
    }

    const flags = options.caseSensitive ? 'g' : 'gi';

    try {
      return new RegExp(pattern, flags);
    } catch {
      return null;
    }
  }

  private findInString(
    str: string,
    pattern: RegExp,
    wholeCell?: boolean
  ): Array<{ text: string; start: number; length: number }> {
    const results: Array<{ text: string; start: number; length: number }> = [];

    // Reset regex state
    pattern.lastIndex = 0;

    if (wholeCell) {
      // For whole cell match, test entire string
      if (pattern.test(str)) {
        results.push({ text: str, start: 0, length: str.length });
      }
    } else {
      // Find all matches
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(str)) !== null) {
        results.push({
          text: match[0],
          start: match.index,
          length: match[0].length,
        });

        // Prevent infinite loop on zero-length matches
        if (match.index === pattern.lastIndex) {
          pattern.lastIndex++;
        }
      }
    }

    return results;
  }

  private matchesFormat(cellFormat: CellFormat, match: Partial<CellFormat>): boolean {
    for (const [key, value] of Object.entries(match)) {
      const cellValue = cellFormat[key as keyof CellFormat];
      if (cellValue !== value) {
        return false;
      }
    }
    return true;
  }

  private sortMatches(matches: Match[], byRows: boolean): void {
    matches.sort((a, b) => {
      if (byRows) {
        if (a.cell.row !== b.cell.row) return a.cell.row - b.cell.row;
        if (a.cell.col !== b.cell.col) return a.cell.col - b.cell.col;
        return a.startIndex - b.startIndex;
      } else {
        if (a.cell.col !== b.cell.col) return a.cell.col - b.cell.col;
        if (a.cell.row !== b.cell.row) return a.cell.row - b.cell.row;
        return a.startIndex - b.startIndex;
      }
    });
  }

  private replaceInString(str: string, start: number, length: number, replacement: string): string {
    return str.substring(0, start) + replacement + str.substring(start + length);
  }

  private createInitialState(): FindReplaceState {
    return {
      query: null,
      options: null,
      matches: [],
      currentIndex: -1,
      isActive: false,
    };
  }

  private notifyStateChange(): void {
    this.events.onStateChange?.(this.getState());
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a FindReplace instance from a SparseDataStore.
 * For backward compatibility.
 */
export function createFindReplace(dataStore: DataReader & DataWriter): FindReplace {
  return new FindReplace(dataStore, dataStore);
}

/**
 * Create a FindReplace instance with separate reader/writer.
 */
export function createFindReplaceWithWriter(reader: DataReader, writer: DataWriter): FindReplace {
  return new FindReplace(reader, writer);
}
