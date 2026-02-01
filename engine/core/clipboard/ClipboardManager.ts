/**
 * VectorSheet Engine - Clipboard Manager (Production Grade)
 *
 * Excel-grade clipboard operations with full fidelity.
 *
 * Features:
 * - Copy/Cut/Paste for single cells, ranges, and multi-range selections
 * - Paste Special: All, Values, Formulas, Formats, Values+Formats
 * - Paste Operations: None, Add, Subtract, Multiply, Divide
 * - Transpose and Skip Blanks options
 * - Relative formula adjustment on paste
 * - Multi-range selection support (Ctrl+Click)
 * - Pattern fill when pasting to larger range
 *
 * Architecture:
 * - Pure engine-level clipboard (no DOM/browser APIs in core logic)
 * - Integration with SelectionManager via Selection type
 * - Integration with SpreadsheetEngine via SparseDataStore
 * - Deterministic, testable, strict-mode compliant
 *
 * Excel Behavior:
 * - Cut clears source after first paste only
 * - Copy allows unlimited pastes
 * - Marching ants indicator via isCutOperation()
 * - Multi-range copies serialize all ranges
 */

import {
  Cell,
  CellRef,
  CellRange,
  CellFormat,
  Selection,
} from '../types/index.js';
import { SparseDataStore } from '../data/SparseDataStore.js';

export interface ClipboardCell {
  /** Row offset from top-left of copied range */
  rowOffset: number;
  /** Column offset from top-left of copied range */
  colOffset: number;
  /** Cell data */
  cell: Cell;
  /** Original cell reference (for formula adjustment) */
  originalRef: CellRef;
}

export interface ClipboardData {
  /** Type of clipboard operation */
  type: 'copy' | 'cut';
  /** Source ranges (supports multi-range selections) */
  sourceRanges: CellRange[];
  /** Primary source range (bounding box of all ranges) */
  sourceRange: CellRange;
  /** Cells data organized by range index */
  cells: ClipboardCell[];
  /** Number of rows in bounding box */
  rows: number;
  /** Number of columns in bounding box */
  cols: number;
  /** Timestamp of copy operation */
  timestamp: number;
  /** Plain text representation (for external paste) */
  plainText: string;
  /** HTML representation (for external paste) */
  html: string;
  /** Whether this is a multi-range selection */
  isMultiRange: boolean;
}

/**
 * Result of a paste operation.
 */
export interface PasteResult {
  /** The range(s) that were pasted to */
  pastedRanges: CellRange[];
  /** All cells that were modified */
  pastedCells: CellRef[];
  /** Whether the operation succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

export type PasteType =
  | 'all'           // Values, formulas, and formatting
  | 'values'        // Values only (formula results)
  | 'formulas'      // Formulas and values
  | 'formats'       // Formatting only
  | 'columnWidths'  // Column widths only
  | 'valuesAndFormats' // Values and formatting (no formulas)
  | 'link'          // Create link to source
  | 'transpose';    // Transpose rows and columns

export type PasteOperation =
  | 'none'          // Normal paste
  | 'add'           // Add to existing values
  | 'subtract'      // Subtract from existing
  | 'multiply'      // Multiply by existing
  | 'divide';       // Divide existing

export interface PasteOptions {
  type: PasteType;
  operation: PasteOperation;
  skipBlanks: boolean;
  transpose: boolean;
}

export interface ClipboardManagerEvents {
  /** Called when clipboard data changes */
  onClipboardChange?: (data: ClipboardData | null) => void;
  /** Called when cells are pasted */
  onPaste?: (targetRange: CellRange, pastedCells: CellRef[]) => void;
  /** Called when cut operation completes (source cells should be cleared) */
  onCutComplete?: (sourceRange: CellRange) => void;
}

export class ClipboardManager {
  private dataStore: SparseDataStore;
  private clipboardData: ClipboardData | null = null;
  private events: ClipboardManagerEvents = {};

  constructor(dataStore: SparseDataStore) {
    this.dataStore = dataStore;
  }

  // ===========================================================================
  // Event Handling
  // ===========================================================================

  setEventHandlers(events: ClipboardManagerEvents): void {
    this.events = { ...this.events, ...events };
  }

  // ===========================================================================
  // State Queries
  // ===========================================================================

  /**
   * Check if clipboard has data.
   */
  hasData(): boolean {
    return this.clipboardData !== null;
  }

  /**
   * Get raw clipboard data.
   */
  getData(): ClipboardData | null {
    return this.clipboardData;
  }

  /**
   * Get the primary source range (bounding box).
   */
  getSourceRange(): CellRange | null {
    return this.clipboardData?.sourceRange ?? null;
  }

  /**
   * Get all source ranges (for multi-range selections).
   */
  getSourceRanges(): CellRange[] {
    return this.clipboardData?.sourceRanges ?? [];
  }

  /**
   * Check if this is a cut operation (for marching ants).
   */
  isCutOperation(): boolean {
    return this.clipboardData?.type === 'cut';
  }

  /**
   * Check if a cell is in the cut source (for visual indicator).
   */
  isCellInCutSource(row: number, col: number): boolean {
    if (!this.clipboardData || this.clipboardData.type !== 'cut') {
      return false;
    }
    return this.clipboardData.sourceRanges.some(range =>
      row >= range.startRow && row <= range.endRow &&
      col >= range.startCol && col <= range.endCol
    );
  }

  // ===========================================================================
  // Copy Operations
  // ===========================================================================

  /**
   * Copy cells from a Selection (supports multi-range).
   *
   * @param selection - The selection to copy from
   * @returns ClipboardData with copied cells
   */
  copy(selection: Selection | CellRange | CellRange[]): ClipboardData {
    const ranges = this.normalizeToRanges(selection);
    return this.performCopy(ranges, 'copy');
  }

  /**
   * Copy a single range (convenience method).
   */
  copyRange(range: CellRange): ClipboardData {
    return this.performCopy([range], 'copy');
  }

  /**
   * Copy multiple ranges (Ctrl+Click selections).
   */
  copyRanges(ranges: CellRange[]): ClipboardData {
    return this.performCopy(ranges, 'copy');
  }

  // ===========================================================================
  // Cut Operations
  // ===========================================================================

  /**
   * Cut cells from a Selection (supports multi-range).
   * Source cells will be cleared after first paste.
   *
   * @param selection - The selection to cut from
   * @returns ClipboardData with cut cells
   */
  cut(selection: Selection | CellRange | CellRange[]): ClipboardData {
    const ranges = this.normalizeToRanges(selection);
    return this.performCopy(ranges, 'cut');
  }

  /**
   * Cut a single range (convenience method).
   */
  cutRange(range: CellRange): ClipboardData {
    return this.performCopy([range], 'cut');
  }

  /**
   * Cut multiple ranges (Ctrl+Click selections).
   */
  cutRanges(ranges: CellRange[]): ClipboardData {
    return this.performCopy(ranges, 'cut');
  }

  // ===========================================================================
  // Internal Copy/Cut Implementation
  // ===========================================================================

  /**
   * Perform copy or cut operation on ranges.
   */
  private performCopy(ranges: CellRange[], type: 'copy' | 'cut'): ClipboardData {
    // Normalize ranges (ensure startRow <= endRow, etc.)
    const normalizedRanges = ranges.map(r => this.normalizeRange(r));

    // Calculate bounding box
    const boundingBox = this.calculateBoundingBox(normalizedRanges);

    // Extract cells from all ranges
    const cells = this.extractCellsFromRanges(normalizedRanges, boundingBox);

    // Generate text representations
    const plainText = this.toPlainText(cells, boundingBox);
    const html = this.toHtml(cells, boundingBox);

    this.clipboardData = {
      type,
      sourceRanges: normalizedRanges,
      sourceRange: boundingBox,
      cells,
      rows: boundingBox.endRow - boundingBox.startRow + 1,
      cols: boundingBox.endCol - boundingBox.startCol + 1,
      timestamp: Date.now(),
      plainText,
      html,
      isMultiRange: normalizedRanges.length > 1,
    };

    // Write to system clipboard if available
    this.writeToSystemClipboard(plainText, html);

    this.events.onClipboardChange?.(this.clipboardData);
    return this.clipboardData;
  }

  /**
   * Normalize input to array of CellRange.
   */
  private normalizeToRanges(input: Selection | CellRange | CellRange[]): CellRange[] {
    if (Array.isArray(input)) {
      return input;
    }
    if ('ranges' in input) {
      // It's a Selection
      return input.ranges;
    }
    // It's a single CellRange
    return [input];
  }

  /**
   * Normalize a range so startRow <= endRow and startCol <= endCol.
   */
  private normalizeRange(range: CellRange): CellRange {
    return {
      startRow: Math.min(range.startRow, range.endRow),
      endRow: Math.max(range.startRow, range.endRow),
      startCol: Math.min(range.startCol, range.endCol),
      endCol: Math.max(range.startCol, range.endCol),
    };
  }

  /**
   * Calculate bounding box containing all ranges.
   */
  private calculateBoundingBox(ranges: CellRange[]): CellRange {
    if (ranges.length === 0) {
      return { startRow: 0, endRow: 0, startCol: 0, endCol: 0 };
    }

    let minRow = Infinity, maxRow = -Infinity;
    let minCol = Infinity, maxCol = -Infinity;

    for (const range of ranges) {
      minRow = Math.min(minRow, range.startRow);
      maxRow = Math.max(maxRow, range.endRow);
      minCol = Math.min(minCol, range.startCol);
      maxCol = Math.max(maxCol, range.endCol);
    }

    return {
      startRow: minRow,
      endRow: maxRow,
      startCol: minCol,
      endCol: maxCol,
    };
  }

  /**
   * Extract cells from multiple ranges, with offsets relative to bounding box.
   */
  private extractCellsFromRanges(ranges: CellRange[], boundingBox: CellRange): ClipboardCell[] {
    const cells: ClipboardCell[] = [];
    const includedCells = new Set<string>();

    for (const range of ranges) {
      for (let row = range.startRow; row <= range.endRow; row++) {
        for (let col = range.startCol; col <= range.endCol; col++) {
          const key = `${row},${col}`;
          if (includedCells.has(key)) continue;
          includedCells.add(key);

          const cell = this.dataStore.getCell(row, col);
          cells.push({
            rowOffset: row - boundingBox.startRow,
            colOffset: col - boundingBox.startCol,
            cell: cell ? this.deepCloneCell(cell) : { value: null, type: 'empty' },
            originalRef: { row, col },
          });
        }
      }
    }

    return cells;
  }

  // ===========================================================================
  // Paste Operations
  // ===========================================================================

  /**
   * Paste clipboard data at the target cell.
   *
   * @param target - Target cell or range for paste
   * @param mode - Paste mode: 'all' | 'values' | 'formulas' | 'formats' | etc.
   * @returns PasteResult with details of what was pasted
   */
  paste(
    target: CellRef | CellRange,
    mode: PasteType | Partial<PasteOptions> = 'all'
  ): PasteResult {
    if (!this.clipboardData) {
      return {
        pastedRanges: [],
        pastedCells: [],
        success: false,
        error: 'No clipboard data',
      };
    }

    // Normalize options
    const opts: PasteOptions = typeof mode === 'string'
      ? { type: mode, operation: 'none', skipBlanks: false, transpose: false }
      : {
          type: mode.type ?? 'all',
          operation: mode.operation ?? 'none',
          skipBlanks: mode.skipBlanks ?? false,
          transpose: mode.transpose ?? false,
        };

    // Get target cell
    const targetCell: CellRef = 'row' in target && !('startRow' in target)
      ? target as CellRef
      : { row: (target as CellRange).startRow, col: (target as CellRange).startCol };

    // Calculate target range dimensions
    const rows = opts.transpose ? this.clipboardData.cols : this.clipboardData.rows;
    const cols = opts.transpose ? this.clipboardData.rows : this.clipboardData.cols;

    const targetRange: CellRange = {
      startRow: targetCell.row,
      startCol: targetCell.col,
      endRow: targetCell.row + rows - 1,
      endCol: targetCell.col + cols - 1,
    };

    const pastedCells: CellRef[] = [];

    // Paste each cell
    for (const clipCell of this.clipboardData.cells) {
      let targetRow: number;
      let targetCol: number;

      if (opts.transpose) {
        targetRow = targetCell.row + clipCell.colOffset;
        targetCol = targetCell.col + clipCell.rowOffset;
      } else {
        targetRow = targetCell.row + clipCell.rowOffset;
        targetCol = targetCell.col + clipCell.colOffset;
      }

      // Skip blanks if option is set
      if (opts.skipBlanks && this.isCellBlank(clipCell.cell)) {
        continue;
      }

      // Apply paste based on type
      this.pasteCell(
        clipCell,
        targetRow,
        targetCol,
        opts,
        this.clipboardData.sourceRange
      );

      pastedCells.push({ row: targetRow, col: targetCol });
    }

    // If this was a cut operation, clear source cells
    if (this.clipboardData.type === 'cut') {
      this.clearSourceRanges(this.clipboardData.sourceRanges);
      this.events.onCutComplete?.(this.clipboardData.sourceRange);
      // Clear clipboard after cut-paste (Excel behavior)
      this.clipboardData = null;
      this.events.onClipboardChange?.(null);
    }

    this.events.onPaste?.(targetRange, pastedCells);

    return {
      pastedRanges: [targetRange],
      pastedCells,
      success: true,
    };
  }

  /**
   * Paste to fill a target range (repeating source pattern).
   * Useful for filling a larger area with a smaller copied pattern.
   */
  pasteToRange(
    targetRange: CellRange,
    options: Partial<PasteOptions> = {}
  ): PasteResult {
    if (!this.clipboardData) {
      return {
        pastedRanges: [],
        pastedCells: [],
        success: false,
        error: 'No clipboard data',
      };
    }

    const opts: PasteOptions = {
      type: options.type ?? 'all',
      operation: options.operation ?? 'none',
      skipBlanks: options.skipBlanks ?? false,
      transpose: options.transpose ?? false,
    };

    const sourceRows = opts.transpose ? this.clipboardData.cols : this.clipboardData.rows;
    const sourceCols = opts.transpose ? this.clipboardData.rows : this.clipboardData.cols;

    const pastedCells: CellRef[] = [];

    // Fill target range by repeating source pattern
    for (let row = targetRange.startRow; row <= targetRange.endRow; row++) {
      for (let col = targetRange.startCol; col <= targetRange.endCol; col++) {
        const sourceRowOffset = (row - targetRange.startRow) % sourceRows;
        const sourceColOffset = (col - targetRange.startCol) % sourceCols;

        // Find matching source cell
        const clipCell = this.clipboardData.cells.find(c => {
          if (opts.transpose) {
            return c.colOffset === sourceRowOffset && c.rowOffset === sourceColOffset;
          }
          return c.rowOffset === sourceRowOffset && c.colOffset === sourceColOffset;
        });

        if (clipCell) {
          if (opts.skipBlanks && this.isCellBlank(clipCell.cell)) {
            continue;
          }

          this.pasteCell(
            clipCell,
            row,
            col,
            opts,
            this.clipboardData.sourceRange
          );
          pastedCells.push({ row, col });
        }
      }
    }

    // Handle cut operation
    if (this.clipboardData.type === 'cut') {
      this.clearSourceRanges(this.clipboardData.sourceRanges);
      this.events.onCutComplete?.(this.clipboardData.sourceRange);
      this.clipboardData = null;
      this.events.onClipboardChange?.(null);
    }

    this.events.onPaste?.(targetRange, pastedCells);

    return {
      pastedRanges: [targetRange],
      pastedCells,
      success: true,
    };
  }

  // ===========================================================================
  // Clear
  // ===========================================================================

  /**
   * Clear clipboard data
   */
  clear(): void {
    this.clipboardData = null;
    this.events.onClipboardChange?.(null);
  }

  // ===========================================================================
  // System Clipboard Integration
  // ===========================================================================

  /**
   * Write to system clipboard
   */
  private writeToSystemClipboard(plainText: string, html: string): void {
    // This is a simplified version - actual implementation would use
    // navigator.clipboard API or document.execCommand
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      // Modern clipboard API
      const items: Record<string, Blob> = {
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      };

      try {
        navigator.clipboard.write([
          new ClipboardItem(items)
        ]).catch(() => {
          // Fallback to text-only
          navigator.clipboard.writeText(plainText).catch(() => {});
        });
      } catch {
        // ClipboardItem not supported
        navigator.clipboard.writeText(plainText).catch(() => {});
      }
    }
  }

  /**
   * Read from system clipboard
   */
  async readFromSystemClipboard(): Promise<{ text: string; html?: string } | null> {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        // Try to read HTML first
        const items = await navigator.clipboard.read();
        for (const item of items) {
          if (item.types.includes('text/html')) {
            const htmlBlob = await item.getType('text/html');
            const html = await htmlBlob.text();
            const textBlob = await item.getType('text/plain');
            const text = await textBlob.text();
            return { text, html };
          }
        }
      } catch {
        // Fall back to text only
        try {
          const text = await navigator.clipboard.readText();
          return { text };
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  /**
   * Paste from external source (system clipboard text)
   */
  pasteExternal(
    text: string,
    targetCell: CellRef
  ): { pastedRange: CellRange; pastedCells: CellRef[] } {
    // Parse tab/newline separated text
    const rows = text.split(/\r?\n/).filter(row => row.length > 0);
    const cells: ClipboardCell[] = [];

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const columns = rows[rowIndex].split('\t');
      for (let colIndex = 0; colIndex < columns.length; colIndex++) {
        const value = columns[colIndex];
        cells.push({
          rowOffset: rowIndex,
          colOffset: colIndex,
          cell: {
            value: this.parseValue(value),
            type: this.detectValueType(value),
          },
          originalRef: { row: rowIndex, col: colIndex },
        });
      }
    }

    const maxRow = Math.max(...cells.map(c => c.rowOffset));
    const maxCol = Math.max(...cells.map(c => c.colOffset));

    const sourceRange: CellRange = { startRow: 0, startCol: 0, endRow: maxRow, endCol: maxCol };

    // Temporarily set clipboard data
    this.clipboardData = {
      type: 'copy',
      sourceRanges: [sourceRange],
      sourceRange,
      cells,
      rows: maxRow + 1,
      cols: maxCol + 1,
      timestamp: Date.now(),
      plainText: text,
      html: '',
      isMultiRange: false,
    };

    const result = this.paste(targetCell, { type: 'all' });

    // Clear temporary clipboard data
    this.clipboardData = null;

    // Return in expected format
    const pastedRange = result.pastedRanges[0] ?? {
      startRow: targetCell.row,
      startCol: targetCell.col,
      endRow: targetCell.row,
      endCol: targetCell.col,
    };

    return { pastedRange, pastedCells: result.pastedCells };
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private deepCloneCell(cell: Cell): Cell {
    return {
      ...cell,
      format: cell.format ? { ...cell.format } : undefined,
      borders: cell.borders ? {
        top: cell.borders.top ? { ...cell.borders.top } : undefined,
        right: cell.borders.right ? { ...cell.borders.right } : undefined,
        bottom: cell.borders.bottom ? { ...cell.borders.bottom } : undefined,
        left: cell.borders.left ? { ...cell.borders.left } : undefined,
      } : undefined,
      merge: cell.merge ? { ...cell.merge } : undefined,
      mergeParent: cell.mergeParent ? { ...cell.mergeParent } : undefined,
      hyperlink: cell.hyperlink ? { ...cell.hyperlink } : undefined,
      validation: cell.validation ? { ...cell.validation } : undefined,
    };
  }

  private pasteCell(
    clipCell: ClipboardCell,
    targetRow: number,
    targetCol: number,
    options: PasteOptions,
    sourceRange: CellRange
  ): void {
    let existingCell = this.dataStore.getCell(targetRow, targetCol);
    const newCell: Cell = existingCell ? this.deepCloneCell(existingCell) : {
      value: null,
      type: 'empty',
    };

    // Apply based on paste type
    switch (options.type) {
      case 'all':
        this.applyAllPaste(newCell, clipCell.cell, targetRow, targetCol, sourceRange, options);
        break;
      case 'values':
        this.applyValuesPaste(newCell, clipCell.cell, options);
        break;
      case 'formulas':
        this.applyFormulasPaste(newCell, clipCell.cell, targetRow, targetCol, sourceRange, options);
        break;
      case 'formats':
        this.applyFormatsPaste(newCell, clipCell.cell);
        break;
      case 'valuesAndFormats':
        this.applyValuesPaste(newCell, clipCell.cell, options);
        this.applyFormatsPaste(newCell, clipCell.cell);
        break;
      case 'transpose':
        this.applyAllPaste(newCell, clipCell.cell, targetRow, targetCol, sourceRange, options);
        break;
      default:
        this.applyAllPaste(newCell, clipCell.cell, targetRow, targetCol, sourceRange, options);
    }

    this.dataStore.setCell(targetRow, targetCol, newCell);
  }

  private applyAllPaste(
    target: Cell,
    source: Cell,
    targetRow: number,
    targetCol: number,
    sourceRange: CellRange,
    options: PasteOptions
  ): void {
    // Copy everything
    target.type = source.type;
    target.displayValue = source.displayValue;
    target.format = source.format ? { ...source.format } : undefined;
    target.borders = source.borders ? { ...source.borders } : undefined;
    target.comment = source.comment;
    target.hyperlink = source.hyperlink ? { ...source.hyperlink } : undefined;

    // Handle formula adjustment
    if (source.formula) {
      target.formula = this.adjustFormula(
        source.formula,
        targetRow - sourceRange.startRow,
        targetCol - sourceRange.startCol
      );
      target.value = target.formula;
      target.isDirty = true;
    } else {
      target.value = this.applyOperation(target.value, source.value, options.operation);
      target.formula = undefined;
      target.formulaResult = undefined;
    }
  }

  private applyValuesPaste(
    target: Cell,
    source: Cell,
    options: PasteOptions
  ): void {
    // Paste formula results or values
    const sourceValue = source.formula !== undefined ? source.formulaResult : source.value;
    target.value = this.applyOperation(target.value, sourceValue, options.operation);
    target.type = source.type === 'formula' ?
      (typeof target.value === 'number' ? 'number' :
       typeof target.value === 'boolean' ? 'boolean' : 'string') :
      source.type;
    // Clear any existing formula
    target.formula = undefined;
    target.formulaResult = undefined;
    target.isDirty = false;
  }

  private applyFormulasPaste(
    target: Cell,
    source: Cell,
    targetRow: number,
    targetCol: number,
    sourceRange: CellRange,
    options: PasteOptions
  ): void {
    if (source.formula) {
      target.formula = this.adjustFormula(
        source.formula,
        targetRow - sourceRange.startRow,
        targetCol - sourceRange.startCol
      );
      target.value = target.formula;
      target.type = 'formula';
      target.isDirty = true;
    } else {
      target.value = this.applyOperation(target.value, source.value, options.operation);
      target.type = source.type;
    }
  }

  private applyFormatsPaste(target: Cell, source: Cell): void {
    target.format = source.format ? { ...source.format } : undefined;
    target.borders = source.borders ? {
      top: source.borders.top ? { ...source.borders.top } : undefined,
      right: source.borders.right ? { ...source.borders.right } : undefined,
      bottom: source.borders.bottom ? { ...source.borders.bottom } : undefined,
      left: source.borders.left ? { ...source.borders.left } : undefined,
    } : undefined;
  }

  private applyOperation(
    targetValue: string | number | boolean | null,
    sourceValue: string | number | boolean | null | undefined,
    operation: PasteOperation
  ): string | number | boolean | null {
    if (operation === 'none') {
      return sourceValue ?? null;
    }

    const targetNum = typeof targetValue === 'number' ? targetValue : 0;
    const sourceNum = typeof sourceValue === 'number' ? sourceValue : 0;

    switch (operation) {
      case 'add':
        return targetNum + sourceNum;
      case 'subtract':
        return targetNum - sourceNum;
      case 'multiply':
        return targetNum * sourceNum;
      case 'divide':
        return sourceNum !== 0 ? targetNum / sourceNum : '#DIV/0!';
      default:
        return sourceValue ?? null;
    }
  }

  private adjustFormula(
    formula: string,
    rowDelta: number,
    colDelta: number
  ): string {
    // Adjust relative cell references in formula
    // This regex matches cell references like A1, $A1, A$1, $A$1, AA1, etc.
    const cellRefRegex = /(\$?)([A-Z]+)(\$?)(\d+)/gi;

    return formula.replace(cellRefRegex, (_match, colAbs, col, rowAbs, row) => {
      let newCol = col;
      let newRow = parseInt(row, 10);

      // Adjust column if not absolute
      if (!colAbs) {
        const colIndex = this.columnLetterToIndex(col);
        const newColIndex = Math.max(0, colIndex + colDelta);
        newCol = this.indexToColumnLetter(newColIndex);
      }

      // Adjust row if not absolute
      if (!rowAbs) {
        newRow = Math.max(1, newRow + rowDelta);
      }

      return `${colAbs}${newCol}${rowAbs}${newRow}`;
    });
  }

  private columnLetterToIndex(letters: string): number {
    let col = 0;
    for (let i = 0; i < letters.length; i++) {
      col = col * 26 + (letters.toUpperCase().charCodeAt(i) - 64);
    }
    return col - 1;
  }

  private indexToColumnLetter(index: number): string {
    let result = '';
    let n = index + 1;
    while (n > 0) {
      const remainder = (n - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      n = Math.floor((n - 1) / 26);
    }
    return result;
  }

  /**
   * Clear cells in multiple source ranges.
   */
  private clearSourceRanges(ranges: CellRange[]): void {
    for (const range of ranges) {
      this.clearSourceCells(range);
    }
  }

  /**
   * Clear cells in a single range.
   */
  private clearSourceCells(range: CellRange): void {
    for (let row = range.startRow; row <= range.endRow; row++) {
      for (let col = range.startCol; col <= range.endCol; col++) {
        this.dataStore.deleteCell(row, col);
      }
    }
  }

  private isCellBlank(cell: Cell): boolean {
    return cell.type === 'empty' || cell.value === null || cell.value === '';
  }

  private toPlainText(cells: ClipboardCell[], range: CellRange): string {
    const rows: string[][] = [];
    const numRows = range.endRow - range.startRow + 1;
    const numCols = range.endCol - range.startCol + 1;

    // Initialize empty grid
    for (let i = 0; i < numRows; i++) {
      rows.push(new Array(numCols).fill(''));
    }

    // Fill in values
    for (const clipCell of cells) {
      const value = clipCell.cell.formula !== undefined
        ? clipCell.cell.formulaResult
        : clipCell.cell.value;
      rows[clipCell.rowOffset][clipCell.colOffset] = value === null ? '' : String(value);
    }

    // Join with tabs and newlines
    return rows.map(row => row.join('\t')).join('\n');
  }

  private toHtml(cells: ClipboardCell[], range: CellRange): string {
    const numRows = range.endRow - range.startRow + 1;
    const numCols = range.endCol - range.startCol + 1;

    // Initialize empty grid
    const grid: Cell[][] = [];
    for (let i = 0; i < numRows; i++) {
      grid.push(new Array(numCols).fill(null));
    }

    // Fill in cells
    for (const clipCell of cells) {
      grid[clipCell.rowOffset][clipCell.colOffset] = clipCell.cell;
    }

    // Build HTML table
    let html = '<table>';
    for (const row of grid) {
      html += '<tr>';
      for (const cell of row) {
        const value = cell?.formula !== undefined
          ? cell.formulaResult
          : cell?.value;
        const style = this.cellFormatToStyle(cell?.format);
        html += `<td${style ? ` style="${style}"` : ''}>${this.escapeHtml(value === null ? '' : String(value))}</td>`;
      }
      html += '</tr>';
    }
    html += '</table>';

    return html;
  }

  private cellFormatToStyle(format: CellFormat | undefined): string {
    if (!format) return '';

    const styles: string[] = [];

    if (format.bold) styles.push('font-weight:bold');
    if (format.italic) styles.push('font-style:italic');
    if (format.underline) styles.push('text-decoration:underline');
    if (format.fontFamily) styles.push(`font-family:${format.fontFamily}`);
    if (format.fontSize) styles.push(`font-size:${format.fontSize}pt`);
    if (format.fontColor) styles.push(`color:${format.fontColor}`);
    if (format.backgroundColor) styles.push(`background-color:${format.backgroundColor}`);
    if (format.horizontalAlign) styles.push(`text-align:${format.horizontalAlign}`);

    return styles.join(';');
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private parseValue(text: string): string | number | boolean | null {
    if (text === '') return null;

    // Try to parse as number
    const num = parseFloat(text);
    if (!isNaN(num) && isFinite(num) && String(num) === text.trim()) {
      return num;
    }

    // Try to parse as boolean
    if (text.toUpperCase() === 'TRUE') return true;
    if (text.toUpperCase() === 'FALSE') return false;

    return text;
  }

  private detectValueType(value: string): Cell['type'] {
    if (value === '') return 'empty';
    if (value.startsWith('=')) return 'formula';

    const num = parseFloat(value);
    if (!isNaN(num) && isFinite(num)) return 'number';

    if (value.toUpperCase() === 'TRUE' || value.toUpperCase() === 'FALSE') {
      return 'boolean';
    }

    return 'string';
  }
}
