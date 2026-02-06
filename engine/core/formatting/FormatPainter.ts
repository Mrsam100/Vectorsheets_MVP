/**
 * VectorSheet Engine - Format Painter (Production Grade)
 *
 * Excel-grade format copying and application.
 * Pure engine logic - no UI, no DOM, no rendering.
 *
 * Features:
 * - Pick format from single cell or rectangular range
 * - Apply to target cell/range of any size (with tiling)
 * - Single-use mode: auto-clears after one apply
 * - Persistent mode: stays active for multiple applies (double-click behavior)
 * - Partial format support (font only, borders only, etc.)
 * - Deep cloning of formats (immutable internal state)
 *
 * Excel Behavior:
 * - Single click: pick format, apply once, auto-clear
 * - Double click: pick format, apply multiple times, Escape to clear
 * - Format includes: font, fill, borders, number format, alignment
 *
 * Architecture:
 * - Imports only from types/ (no circular dependencies)
 * - Uses FormatReader/FormatWriter interfaces for decoupling
 * - Pure data operations (deterministic)
 * - Event-based integration with UI layer
 *
 * Integration:
 * - Adapter functions for SparseDataStore/SpreadsheetEngine
 * - Works with SelectionManager ranges
 * - No direct engine coupling
 */

import {
  CellRef,
  CellRange,
  CellFormat,
  CellBorders,
  CellBorder,
  type FormatRun,
} from '../types/index.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Format painter mode.
 */
export type FormatPainterMode = 'inactive' | 'single' | 'persistent';

/**
 * A stored cell format with position info.
 */
export interface StoredFormat {
  /** Row offset from top-left of picked range */
  rowOffset: number;
  /** Column offset from top-left of picked range */
  colOffset: number;
  /** The cell format (deep cloned) */
  format: CellFormat | undefined;
  /** The cell borders (deep cloned) */
  borders: CellBorders | undefined;
  /** Character-level format runs (deep cloned, Excel-compatible) */
  characterFormats: FormatRun[] | null;
}

/**
 * Format painter state (immutable snapshot).
 */
export interface FormatPainterState {
  /** Current mode */
  mode: FormatPainterMode;
  /** Source range that was picked */
  sourceRange: CellRange | null;
  /** Stored formats from source */
  formats: StoredFormat[];
  /** Dimensions of picked format block */
  rows: number;
  /** Dimensions of picked format block */
  cols: number;
  /** Whether any format data is stored */
  hasFormat: boolean;
}

/**
 * Result of an apply operation.
 */
export interface ApplyResult {
  /** Cells that were modified */
  modifiedCells: CellRef[];
  /** Whether the painter is still active */
  stillActive: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Options for picking formats.
 */
export interface PickOptions {
  /** Whether to stay active for multiple applies */
  persistent?: boolean;
  /** Which format properties to pick (null = all) */
  include?: FormatProperty[];
  /** Which format properties to exclude */
  exclude?: FormatProperty[];
}

/**
 * Format properties that can be selectively copied.
 */
export type FormatProperty =
  | 'font'           // fontFamily, fontSize, fontColor, bold, italic, underline, strikethrough
  | 'fill'           // backgroundColor
  | 'borders'        // all border properties
  | 'alignment'      // horizontalAlign, verticalAlign, wrap, rotation, indent
  | 'numberFormat';  // numberFormat

/**
 * Events emitted by FormatPainter.
 */
export interface FormatPainterEvents {
  /** Called when format is picked */
  onPick?: (sourceRange: CellRange, mode: FormatPainterMode) => void;
  /** Called when format is applied */
  onApply?: (targetRange: CellRange, modifiedCells: CellRef[]) => void;
  /** Called when painter is cleared */
  onClear?: () => void;
  /** Called when mode changes */
  onModeChange?: (mode: FormatPainterMode) => void;
}

/**
 * Interface for reading cell formats.
 * Decouples from SpreadsheetEngine/SparseDataStore.
 */
export interface FormatReader {
  /** Get format for a cell */
  getFormat(row: number, col: number): CellFormat | undefined;
  /** Get borders for a cell */
  getBorders(row: number, col: number): CellBorders | undefined;
  /** Get character-level format runs for a cell (optional, Excel-compatible) */
  getCharacterFormats?(row: number, col: number): FormatRun[] | null;
}

/**
 * Interface for writing cell formats.
 */
export interface FormatWriter {
  /** Set format for a cell */
  setFormat(row: number, col: number, format: CellFormat | undefined): void;
  /** Set borders for a cell */
  setBorders(row: number, col: number, borders: CellBorders | undefined): void;
  /** Set character-level format runs for a cell (optional, Excel-compatible) */
  setCharacterFormats?(row: number, col: number, runs: FormatRun[] | null): void;
}

// =============================================================================
// Legacy Types (for backward compatibility)
// =============================================================================

/** @deprecated Use StoredFormat instead */
export interface CopiedFormat {
  format: CellFormat | undefined;
  borders: CellBorders | undefined;
  characterFormats?: FormatRun[] | null;
  timestamp: number;
}

// =============================================================================
// FormatPainter Class
// =============================================================================

export class FormatPainter {
  private mode: FormatPainterMode = 'inactive';
  private sourceRange: CellRange | null = null;
  private formats: StoredFormat[] = [];
  private rows: number = 0;
  private cols: number = 0;
  private includeFilter: Set<FormatProperty> | null = null;
  private excludeFilter: Set<FormatProperty> | null = null;
  private events: FormatPainterEvents = {};
  private pickTimestamp: number = 0;

  constructor() {
    // Initialize with inactive state
  }

  // ===========================================================================
  // Event Handling
  // ===========================================================================

  /**
   * Set event handlers.
   */
  setEventHandlers(events: FormatPainterEvents): void {
    this.events = { ...this.events, ...events };
  }

  // ===========================================================================
  // State Queries
  // ===========================================================================

  /**
   * Check if format painter is active.
   */
  isActive(): boolean {
    return this.mode !== 'inactive';
  }

  /**
   * Check if in persistent (locked) mode.
   */
  isPersistent(): boolean {
    return this.mode === 'persistent';
  }

  /**
   * Check if in locked mode (alias for isPersistent).
   */
  isLocked(): boolean {
    return this.mode === 'persistent';
  }

  /**
   * Get current mode.
   */
  getMode(): FormatPainterMode {
    return this.mode;
  }

  /**
   * Get immutable state snapshot.
   */
  getState(): Readonly<FormatPainterState> {
    return {
      mode: this.mode,
      sourceRange: this.sourceRange ? { ...this.sourceRange } : null,
      formats: this.formats.map(f => this.cloneStoredFormat(f)),
      rows: this.rows,
      cols: this.cols,
      hasFormat: this.formats.length > 0,
    };
  }

  /**
   * Get the source range that was picked.
   */
  getSourceRange(): CellRange | null {
    return this.sourceRange ? { ...this.sourceRange } : null;
  }

  /**
   * Get copied format (legacy compatibility).
   * Returns the first cell's format if multiple cells were picked.
   */
  getCopiedFormat(): CopiedFormat | null {
    if (this.formats.length === 0) return null;

    const first = this.formats[0];
    return {
      format: first.format ? this.cloneFormat(first.format) : undefined,
      borders: first.borders ? this.cloneBorders(first.borders) : undefined,
      characterFormats: this.cloneCharacterFormats(first.characterFormats),
      timestamp: this.pickTimestamp,
    };
  }

  // ===========================================================================
  // Pick Operation
  // ===========================================================================

  /**
   * Pick format from a source range.
   *
   * @param sourceRange - Range to pick format from
   * @param reader - Interface to read cell formats
   * @param options - Pick options (persistent mode, filters)
   *
   * @example
   * ```typescript
   * // Single-use: pick and apply once
   * formatPainter.pick({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 }, reader);
   *
   * // Persistent: pick and apply multiple times
   * formatPainter.pick(range, reader, { persistent: true });
   *
   * // Partial: only font properties
   * formatPainter.pick(range, reader, { include: ['font'] });
   * ```
   */
  pick(
    sourceRange: CellRange,
    reader: FormatReader,
    options: PickOptions = {}
  ): void {
    const {
      persistent = false,
      include = null,
      exclude = null,
    } = options;

    // Normalize range
    const normalized = this.normalizeRange(sourceRange);

    // Calculate dimensions
    this.rows = normalized.endRow - normalized.startRow + 1;
    this.cols = normalized.endCol - normalized.startCol + 1;
    this.sourceRange = normalized;
    this.pickTimestamp = Date.now();

    // Set filters
    this.includeFilter = include ? new Set(include) : null;
    this.excludeFilter = exclude ? new Set(exclude) : null;

    // Extract formats
    this.formats = [];
    for (let row = normalized.startRow; row <= normalized.endRow; row++) {
      for (let col = normalized.startCol; col <= normalized.endCol; col++) {
        const format = reader.getFormat(row, col);
        const borders = reader.getBorders(row, col);
        const characterFormats = reader.getCharacterFormats?.(row, col) ?? null;

        // Apply filters and deep clone
        const filteredFormat = this.filterFormat(format);
        const filteredBorders = this.shouldIncludeBorders()
          ? this.cloneBorders(borders)
          : undefined;
        const clonedCharacterFormats = this.cloneCharacterFormats(characterFormats);

        this.formats.push({
          rowOffset: row - normalized.startRow,
          colOffset: col - normalized.startCol,
          format: filteredFormat,
          borders: filteredBorders,
          characterFormats: clonedCharacterFormats,
        });
      }
    }

    // Set mode
    const previousMode = this.mode;
    this.mode = persistent ? 'persistent' : 'single';

    // Emit events
    if (this.mode !== previousMode) {
      this.events.onModeChange?.(this.mode);
    }
    this.events.onPick?.(normalized, this.mode);
  }

  /**
   * Pick format from a single cell.
   * Convenience method for single-cell picks.
   */
  pickCell(
    row: number,
    col: number,
    reader: FormatReader,
    persistent: boolean = false
  ): void {
    this.pick(
      { startRow: row, endRow: row, startCol: col, endCol: col },
      reader,
      { persistent }
    );
  }

  // ===========================================================================
  // Apply Operation
  // ===========================================================================

  /**
   * Apply picked format to a target range.
   *
   * Behavior:
   * - If target is smaller than source, only applies overlapping portion
   * - If target is larger than source, tiles the source pattern
   * - Single-use mode auto-clears after apply
   * - Persistent mode stays active
   *
   * @param targetRange - Range to apply format to
   * @param writer - Interface to write cell formats
   * @returns Result with modified cells and status
   */
  apply(targetRange: CellRange, writer: FormatWriter): ApplyResult {
    if (!this.isActive() || this.formats.length === 0) {
      return {
        modifiedCells: [],
        stillActive: false,
        error: 'Format painter is not active',
      };
    }

    const normalized = this.normalizeRange(targetRange);
    const modifiedCells: CellRef[] = [];

    // Apply formats with tiling
    for (let row = normalized.startRow; row <= normalized.endRow; row++) {
      for (let col = normalized.startCol; col <= normalized.endCol; col++) {
        // Calculate source position using modulo for tiling
        const sourceRowOffset = (row - normalized.startRow) % this.rows;
        const sourceColOffset = (col - normalized.startCol) % this.cols;

        // Find matching stored format
        const storedFormat = this.formats.find(
          f => f.rowOffset === sourceRowOffset && f.colOffset === sourceColOffset
        );

        if (storedFormat) {
          // Apply format (deep clone to prevent mutation)
          writer.setFormat(row, col, this.cloneFormat(storedFormat.format));

          // Apply borders (deep clone)
          if (this.shouldIncludeBorders()) {
            writer.setBorders(row, col, this.cloneBorders(storedFormat.borders));
          }

          // Apply character-level formats (deep clone, Excel-compatible)
          if (writer.setCharacterFormats && storedFormat.characterFormats) {
            writer.setCharacterFormats(
              row,
              col,
              this.cloneCharacterFormats(storedFormat.characterFormats)
            );
          }

          modifiedCells.push({ row, col });
        }
      }
    }

    // Handle mode transition
    const stillActive = this.mode === 'persistent';
    if (this.mode === 'single') {
      this.clear();
    }

    // Emit event
    this.events.onApply?.(normalized, modifiedCells);

    return {
      modifiedCells,
      stillActive,
    };
  }

  /**
   * Apply format to a single cell.
   * Convenience method for single-cell applies.
   */
  applyToCell(row: number, col: number, writer: FormatWriter): ApplyResult {
    return this.apply(
      { startRow: row, endRow: row, startCol: col, endCol: col },
      writer
    );
  }

  // ===========================================================================
  // Clear Operation
  // ===========================================================================

  /**
   * Clear the format painter state.
   * Returns to inactive mode.
   */
  clear(): void {
    const wasActive = this.isActive();

    this.mode = 'inactive';
    this.sourceRange = null;
    this.formats = [];
    this.rows = 0;
    this.cols = 0;
    this.includeFilter = null;
    this.excludeFilter = null;
    this.pickTimestamp = 0;

    if (wasActive) {
      this.events.onModeChange?.('inactive');
      this.events.onClear?.();
    }
  }

  /**
   * Alias for clear() - deactivate format painter.
   */
  deactivate(): void {
    this.clear();
  }

  // ===========================================================================
  // Mode Control
  // ===========================================================================

  /**
   * Toggle persistent mode.
   * If currently single-use, switches to persistent.
   * If currently persistent, stays persistent.
   * If inactive, does nothing.
   */
  togglePersistent(): void {
    if (this.mode === 'single') {
      this.mode = 'persistent';
      this.events.onModeChange?.('persistent');
    }
  }

  /**
   * Lock painter into persistent mode.
   * Useful for double-click behavior.
   */
  lock(): void {
    if (this.isActive() && this.mode !== 'persistent') {
      this.mode = 'persistent';
      this.events.onModeChange?.('persistent');
    }
  }

  /**
   * Unlock painter (switch to single-use mode).
   * Next apply will clear the painter.
   */
  unlock(): void {
    if (this.mode === 'persistent') {
      this.mode = 'single';
      this.events.onModeChange?.('single');
    }
  }

  /**
   * Toggle format painter on/off for a cell.
   * @returns true if now active, false if now inactive
   */
  toggle(cell: CellRef, reader: FormatReader): boolean {
    if (this.isActive()) {
      this.clear();
      return false;
    } else {
      this.pickCell(cell.row, cell.col, reader);
      return true;
    }
  }

  // ===========================================================================
  // Format Filtering
  // ===========================================================================

  /**
   * Check if a format property should be included.
   */
  private shouldIncludeProperty(property: FormatProperty): boolean {
    if (this.excludeFilter?.has(property)) {
      return false;
    }
    if (this.includeFilter !== null) {
      return this.includeFilter.has(property);
    }
    return true;
  }

  /**
   * Check if borders should be included.
   */
  private shouldIncludeBorders(): boolean {
    return this.shouldIncludeProperty('borders');
  }

  /**
   * Filter format based on include/exclude settings.
   */
  private filterFormat(format: CellFormat | undefined): CellFormat | undefined {
    if (!format) return undefined;

    const filtered: CellFormat = {};
    let hasAny = false;

    // Font properties
    if (this.shouldIncludeProperty('font')) {
      if (format.fontFamily !== undefined) {
        filtered.fontFamily = format.fontFamily;
        hasAny = true;
      }
      if (format.fontSize !== undefined) {
        filtered.fontSize = format.fontSize;
        hasAny = true;
      }
      if (format.fontColor !== undefined) {
        filtered.fontColor = format.fontColor;
        hasAny = true;
      }
      if (format.bold !== undefined) {
        filtered.bold = format.bold;
        hasAny = true;
      }
      if (format.italic !== undefined) {
        filtered.italic = format.italic;
        hasAny = true;
      }
      if (format.underline !== undefined) {
        filtered.underline = format.underline;
        hasAny = true;
      }
      if (format.strikethrough !== undefined) {
        filtered.strikethrough = format.strikethrough;
        hasAny = true;
      }
    }

    // Fill properties
    if (this.shouldIncludeProperty('fill')) {
      if (format.backgroundColor !== undefined) {
        filtered.backgroundColor = format.backgroundColor;
        hasAny = true;
      }
    }

    // Alignment properties
    if (this.shouldIncludeProperty('alignment')) {
      if (format.horizontalAlign !== undefined) {
        filtered.horizontalAlign = format.horizontalAlign;
        hasAny = true;
      }
      if (format.verticalAlign !== undefined) {
        filtered.verticalAlign = format.verticalAlign;
        hasAny = true;
      }
      if (format.wrap !== undefined) {
        filtered.wrap = format.wrap;
        hasAny = true;
      }
      if (format.rotation !== undefined) {
        filtered.rotation = format.rotation;
        hasAny = true;
      }
      if (format.indent !== undefined) {
        filtered.indent = format.indent;
        hasAny = true;
      }
    }

    // Number format
    if (this.shouldIncludeProperty('numberFormat')) {
      if (format.numberFormat !== undefined) {
        filtered.numberFormat = format.numberFormat;
        hasAny = true;
      }
    }

    return hasAny ? filtered : undefined;
  }

  // ===========================================================================
  // Deep Cloning Helpers
  // ===========================================================================

  /**
   * Deep clone a CellFormat.
   */
  private cloneFormat(format: CellFormat | undefined): CellFormat | undefined {
    if (!format) return undefined;

    return {
      numberFormat: format.numberFormat,
      fontFamily: format.fontFamily,
      fontSize: format.fontSize,
      fontColor: format.fontColor,
      backgroundColor: format.backgroundColor,
      bold: format.bold,
      italic: format.italic,
      underline: format.underline,
      strikethrough: format.strikethrough,
      horizontalAlign: format.horizontalAlign,
      verticalAlign: format.verticalAlign,
      wrap: format.wrap,
      rotation: format.rotation,
      indent: format.indent,
    };
  }

  /**
   * Deep clone a CellBorder.
   */
  private cloneBorderStyle(border: CellBorder | undefined): CellBorder | undefined {
    if (!border) return undefined;

    return {
      style: border.style,
      color: border.color,
    };
  }

  /**
   * Deep clone CellBorders.
   */
  private cloneBorders(borders: CellBorders | undefined): CellBorders | undefined {
    if (!borders) return undefined;

    return {
      top: this.cloneBorderStyle(borders.top),
      right: this.cloneBorderStyle(borders.right),
      bottom: this.cloneBorderStyle(borders.bottom),
      left: this.cloneBorderStyle(borders.left),
    };
  }

  /**
   * Deep clone character-level format runs (Excel-compatible).
   * Prevents mutation bugs when applying format painter.
   */
  private cloneCharacterFormats(runs: FormatRun[] | null): FormatRun[] | null {
    if (!runs) return null;

    return runs.map(run => ({
      start: run.start,
      end: run.end,
      format: run.format ? { ...run.format } : undefined,
    }));
  }

  /**
   * Deep clone a StoredFormat.
   */
  private cloneStoredFormat(stored: StoredFormat): StoredFormat {
    return {
      rowOffset: stored.rowOffset,
      colOffset: stored.colOffset,
      format: this.cloneFormat(stored.format),
      borders: this.cloneBorders(stored.borders),
      characterFormats: this.cloneCharacterFormats(stored.characterFormats),
    };
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

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
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new FormatPainter instance.
 */
export function createFormatPainter(): FormatPainter {
  return new FormatPainter();
}

// =============================================================================
// Adapter for SparseDataStore Integration
// =============================================================================

/**
 * Create a FormatReader adapter from a data store.
 *
 * @example
 * ```typescript
 * const reader = createFormatReaderFromDataStore(dataStore);
 * formatPainter.pick(range, reader);
 * ```
 */
export function createFormatReaderFromDataStore(
  dataStore: {
    getCell(row: number, col: number): { format?: CellFormat; borders?: CellBorders } | null;
  }
): FormatReader {
  return {
    getFormat(row: number, col: number): CellFormat | undefined {
      const cell = dataStore.getCell(row, col);
      return cell?.format;
    },
    getBorders(row: number, col: number): CellBorders | undefined {
      const cell = dataStore.getCell(row, col);
      return cell?.borders;
    },
  };
}

/**
 * Create a FormatWriter adapter for a data store.
 *
 * @example
 * ```typescript
 * const writer = createFormatWriterFromDataStore(dataStore);
 * formatPainter.apply(range, writer);
 * ```
 */
export function createFormatWriterFromDataStore(
  dataStore: {
    getCell(row: number, col: number): { format?: CellFormat; borders?: CellBorders; value?: unknown; type?: string } | null;
    setCell(row: number, col: number, cell: { format?: CellFormat; borders?: CellBorders; value?: unknown; type?: string }): void;
  }
): FormatWriter {
  return {
    setFormat(row: number, col: number, format: CellFormat | undefined): void {
      const existing = dataStore.getCell(row, col);
      if (existing) {
        dataStore.setCell(row, col, { ...existing, format });
      } else {
        dataStore.setCell(row, col, { value: null, type: 'empty', format });
      }
    },
    setBorders(row: number, col: number, borders: CellBorders | undefined): void {
      const existing = dataStore.getCell(row, col);
      if (existing) {
        dataStore.setCell(row, col, { ...existing, borders });
      } else {
        dataStore.setCell(row, col, { value: null, type: 'empty', borders });
      }
    },
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Apply format to multiple cells at once.
 * Utility function for bulk format application.
 */
export function applyFormatToRange(
  writer: FormatWriter,
  range: CellRange,
  format: Partial<CellFormat>,
  borders?: Partial<CellBorders>
): CellRef[] {
  const modified: CellRef[] = [];

  for (let row = range.startRow; row <= range.endRow; row++) {
    for (let col = range.startCol; col <= range.endCol; col++) {
      writer.setFormat(row, col, format as CellFormat);
      if (borders) {
        writer.setBorders(row, col, borders as CellBorders);
      }
      modified.push({ row, col });
    }
  }

  return modified;
}

/**
 * Clear formatting from a range.
 */
export function clearFormatFromRange(
  writer: FormatWriter,
  range: CellRange
): CellRef[] {
  const cleared: CellRef[] = [];

  for (let row = range.startRow; row <= range.endRow; row++) {
    for (let col = range.startCol; col <= range.endCol; col++) {
      writer.setFormat(row, col, undefined);
      writer.setBorders(row, col, undefined);
      cleared.push({ row, col });
    }
  }

  return cleared;
}
