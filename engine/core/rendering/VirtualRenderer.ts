/**
 * VectorSheet Engine - Virtual Renderer
 *
 * Handles efficient rendering of large spreadsheets by:
 * - Only rendering visible cells (virtualization)
 * - Binary search for scroll position mapping
 * - Caching row/column positions
 * - Buffer zones for smooth scrolling
 */

import {
  CellRef,
  Viewport,
  RenderCell,
  MAX_ROWS,
  MAX_COLS,
  DEFAULT_ROW_HEIGHT,
  DEFAULT_COL_WIDTH,
  HEADER_HEIGHT,
  HEADER_WIDTH,
} from '../types/index.js';
import { SparseDataStore } from '../data/SparseDataStore.js';

export interface ViewportConfig {
  /** Width of the viewport in pixels */
  width: number;
  /** Height of the viewport in pixels */
  height: number;
  /** Number of rows to render above/below viewport */
  rowBuffer: number;
  /** Number of columns to render left/right of viewport */
  colBuffer: number;
  /** Frozen rows (0 = none) */
  frozenRows: number;
  /** Frozen columns (0 = none) */
  frozenCols: number;
}

export interface RowPosition {
  row: number;
  top: number;
  height: number;
}

export interface ColPosition {
  col: number;
  left: number;
  width: number;
}

export class VirtualRenderer {
  private dataStore: SparseDataStore;
  private config: ViewportConfig;

  /** Cached cumulative row positions for binary search */
  private rowPositions: number[] = [];

  /** Cached cumulative column positions for binary search */
  private colPositions: number[] = [];

  /** Whether position caches need rebuild */
  private cachesDirty: boolean = true;

  /** Current scroll position */
  private scrollX: number = 0;
  private scrollY: number = 0;

  /** Current viewport state */
  private viewport: Viewport | null = null;

  constructor(dataStore: SparseDataStore, config: Partial<ViewportConfig> = {}) {
    this.dataStore = dataStore;
    this.config = {
      width: 800,
      height: 600,
      rowBuffer: 5,
      colBuffer: 3,
      frozenRows: 0,
      frozenCols: 0,
      ...config,
    };
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  setViewportSize(width: number, height: number): void {
    this.config.width = width;
    this.config.height = height;
    this.viewport = null;
  }

  setFrozenPanes(rows: number, cols: number): void {
    this.config.frozenRows = rows;
    this.config.frozenCols = cols;
    this.viewport = null;
  }

  invalidateCache(): void {
    this.cachesDirty = true;
    this.viewport = null;
  }

  // ===========================================================================
  // Scroll Management
  // ===========================================================================

  /**
   * Set scroll position
   */
  setScroll(x: number, y: number): void {
    this.scrollX = Math.max(0, x);
    this.scrollY = Math.max(0, y);
    this.viewport = null;
  }

  /**
   * Get current scroll position
   */
  getScroll(): { x: number; y: number } {
    return { x: this.scrollX, y: this.scrollY };
  }

  /**
   * Scroll to bring a cell into view
   */
  scrollToCell(row: number, col: number): { x: number; y: number } {
    this.ensureCachesValid();

    const cellTop = this.getRowTop(row);
    const cellLeft = this.getColLeft(col);
    const cellHeight = this.dataStore.getRowHeight(row);
    const cellWidth = this.dataStore.getColumnWidth(col);

    const viewableWidth = this.config.width - HEADER_WIDTH;
    const viewableHeight = this.config.height - HEADER_HEIGHT;

    let newScrollX = this.scrollX;
    let newScrollY = this.scrollY;

    // Adjust horizontal scroll
    const frozenWidth = this.getFrozenColsWidth();
    if (col >= this.config.frozenCols) {
      if (cellLeft < this.scrollX + frozenWidth) {
        newScrollX = cellLeft - frozenWidth;
      } else if (cellLeft + cellWidth > this.scrollX + viewableWidth) {
        newScrollX = cellLeft + cellWidth - viewableWidth;
      }
    }

    // Adjust vertical scroll
    const frozenHeight = this.getFrozenRowsHeight();
    if (row >= this.config.frozenRows) {
      if (cellTop < this.scrollY + frozenHeight) {
        newScrollY = cellTop - frozenHeight;
      } else if (cellTop + cellHeight > this.scrollY + viewableHeight) {
        newScrollY = cellTop + cellHeight - viewableHeight;
      }
    }

    this.setScroll(newScrollX, newScrollY);
    return { x: newScrollX, y: newScrollY };
  }

  // ===========================================================================
  // Viewport Calculation
  // ===========================================================================

  /**
   * Get the current viewport (visible cell range)
   */
  getViewport(): Viewport {
    if (this.viewport) return this.viewport;

    this.ensureCachesValid();

    const viewableWidth = this.config.width - HEADER_WIDTH;
    const viewableHeight = this.config.height - HEADER_HEIGHT;

    // Find first visible row (using binary search)
    const frozenHeight = this.getFrozenRowsHeight();
    const startRow = this.findRowAtPosition(this.scrollY + frozenHeight);

    // Find last visible row
    const endRow = this.findRowAtPosition(this.scrollY + viewableHeight);

    // Find first visible column
    const frozenWidth = this.getFrozenColsWidth();
    const startCol = this.findColAtPosition(this.scrollX + frozenWidth);

    // Find last visible column
    const endCol = this.findColAtPosition(this.scrollX + viewableWidth);

    // Apply buffer
    const bufferedStartRow = Math.max(this.config.frozenRows, startRow - this.config.rowBuffer);
    const bufferedEndRow = Math.min(MAX_ROWS - 1, endRow + this.config.rowBuffer);
    const bufferedStartCol = Math.max(this.config.frozenCols, startCol - this.config.colBuffer);
    const bufferedEndCol = Math.min(MAX_COLS - 1, endCol + this.config.colBuffer);

    this.viewport = {
      startRow: bufferedStartRow,
      endRow: bufferedEndRow,
      startCol: bufferedStartCol,
      endCol: bufferedEndCol,
      scrollX: this.scrollX,
      scrollY: this.scrollY,
    };

    return this.viewport;
  }

  /**
   * Get cells to render in the current viewport
   */
  getCellsToRender(): RenderCell[] {
    const viewport = this.getViewport();
    const cells: RenderCell[] = [];

    // Render frozen rows first (they're always visible)
    for (let row = 0; row < this.config.frozenRows; row++) {
      for (let col = viewport.startCol; col <= viewport.endCol; col++) {
        cells.push(this.createRenderCell(row, col, true, false));
      }
      // Also render frozen columns in frozen rows
      for (let col = 0; col < this.config.frozenCols; col++) {
        if (col < viewport.startCol) {
          cells.push(this.createRenderCell(row, col, true, true));
        }
      }
    }

    // Render frozen columns (non-frozen rows)
    for (let col = 0; col < this.config.frozenCols; col++) {
      for (let row = viewport.startRow; row <= viewport.endRow; row++) {
        if (row >= this.config.frozenRows) {
          cells.push(this.createRenderCell(row, col, false, true));
        }
      }
    }

    // Render main scrollable area
    for (let row = viewport.startRow; row <= viewport.endRow; row++) {
      if (row < this.config.frozenRows) continue;

      for (let col = viewport.startCol; col <= viewport.endCol; col++) {
        if (col < this.config.frozenCols) continue;

        cells.push(this.createRenderCell(row, col, false, false));
      }
    }

    return cells;
  }

  private createRenderCell(
    row: number,
    col: number,
    isFrozenRow: boolean,
    isFrozenCol: boolean
  ): RenderCell {
    let x = this.getColLeft(col);
    let y = this.getRowTop(row);

    // Adjust position for frozen panes
    if (!isFrozenCol) {
      x -= this.scrollX;
    }
    if (!isFrozenRow) {
      y -= this.scrollY;
    }

    // Add header offset
    x += HEADER_WIDTH;
    y += HEADER_HEIGHT;

    return {
      row,
      col,
      x,
      y,
      width: this.dataStore.getColumnWidth(col),
      height: this.dataStore.getRowHeight(row),
      cell: this.dataStore.getCell(row, col),
    };
  }

  // ===========================================================================
  // Position Calculations
  // ===========================================================================

  /**
   * Get the top position of a row (cumulative height)
   */
  getRowTop(row: number): number {
    this.ensureCachesValid();

    if (row === 0) return 0;
    if (row > this.rowPositions.length) {
      // Extend cache if needed
      this.extendRowCache(row);
    }
    return this.rowPositions[row - 1];
  }

  /**
   * Get the left position of a column (cumulative width)
   */
  getColLeft(col: number): number {
    this.ensureCachesValid();

    if (col === 0) return 0;
    if (col > this.colPositions.length) {
      this.extendColCache(col);
    }
    return this.colPositions[col - 1];
  }

  /**
   * Find which row is at a given Y position (binary search)
   */
  findRowAtPosition(y: number): number {
    this.ensureCachesValid();

    if (y <= 0) return 0;

    // Extend cache if needed
    const lastCachedY = this.rowPositions[this.rowPositions.length - 1] ?? 0;
    if (y > lastCachedY) {
      // Estimate and extend
      const estimatedRow = Math.ceil(y / DEFAULT_ROW_HEIGHT);
      this.extendRowCache(Math.min(estimatedRow + 100, MAX_ROWS));
    }

    // Binary search
    let left = 0;
    let right = this.rowPositions.length - 1;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (this.rowPositions[mid] < y) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    return left;
  }

  /**
   * Find which column is at a given X position (binary search)
   */
  findColAtPosition(x: number): number {
    this.ensureCachesValid();

    if (x <= 0) return 0;

    // Extend cache if needed
    const lastCachedX = this.colPositions[this.colPositions.length - 1] ?? 0;
    if (x > lastCachedX) {
      const estimatedCol = Math.ceil(x / DEFAULT_COL_WIDTH);
      this.extendColCache(Math.min(estimatedCol + 50, MAX_COLS));
    }

    // Binary search
    let left = 0;
    let right = this.colPositions.length - 1;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (this.colPositions[mid] < x) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    return left;
  }

  /**
   * Get cell at screen coordinates
   */
  getCellAtPoint(screenX: number, screenY: number): CellRef | null {
    // Adjust for headers
    const x = screenX - HEADER_WIDTH;
    const y = screenY - HEADER_HEIGHT;

    if (x < 0 || y < 0) return null;

    // Check frozen panes first
    const frozenWidth = this.getFrozenColsWidth();
    const frozenHeight = this.getFrozenRowsHeight();

    let col: number;
    let row: number;

    if (x < frozenWidth && this.config.frozenCols > 0) {
      col = this.findColAtPosition(x);
    } else {
      col = this.findColAtPosition(x + this.scrollX - frozenWidth);
    }

    if (y < frozenHeight && this.config.frozenRows > 0) {
      row = this.findRowAtPosition(y);
    } else {
      row = this.findRowAtPosition(y + this.scrollY - frozenHeight);
    }

    if (row >= MAX_ROWS || col >= MAX_COLS) return null;

    return { row, col };
  }

  // ===========================================================================
  // Frozen Pane Helpers
  // ===========================================================================

  private getFrozenRowsHeight(): number {
    if (this.config.frozenRows === 0) return 0;

    let height = 0;
    for (let i = 0; i < this.config.frozenRows; i++) {
      height += this.dataStore.getRowHeight(i);
    }
    return height;
  }

  private getFrozenColsWidth(): number {
    if (this.config.frozenCols === 0) return 0;

    let width = 0;
    for (let i = 0; i < this.config.frozenCols; i++) {
      width += this.dataStore.getColumnWidth(i);
    }
    return width;
  }

  // ===========================================================================
  // Cache Management
  // ===========================================================================

  private ensureCachesValid(): void {
    if (!this.cachesDirty) return;

    // Build initial caches for visible area + buffer
    const estimatedVisibleRows = Math.ceil(this.config.height / DEFAULT_ROW_HEIGHT) + 20;
    const estimatedVisibleCols = Math.ceil(this.config.width / DEFAULT_COL_WIDTH) + 10;

    this.buildRowCache(estimatedVisibleRows);
    this.buildColCache(estimatedVisibleCols);

    this.cachesDirty = false;
  }

  private buildRowCache(upToRow: number): void {
    this.rowPositions = [];
    let cumulative = 0;

    for (let i = 0; i < upToRow; i++) {
      cumulative += this.dataStore.getRowHeight(i);
      this.rowPositions.push(cumulative);
    }
  }

  private buildColCache(upToCol: number): void {
    this.colPositions = [];
    let cumulative = 0;

    for (let i = 0; i < upToCol; i++) {
      cumulative += this.dataStore.getColumnWidth(i);
      this.colPositions.push(cumulative);
    }
  }

  private extendRowCache(upToRow: number): void {
    const startRow = this.rowPositions.length;
    let cumulative = startRow > 0 ? this.rowPositions[startRow - 1] : 0;

    for (let i = startRow; i < upToRow; i++) {
      cumulative += this.dataStore.getRowHeight(i);
      this.rowPositions.push(cumulative);
    }
  }

  private extendColCache(upToCol: number): void {
    const startCol = this.colPositions.length;
    let cumulative = startCol > 0 ? this.colPositions[startCol - 1] : 0;

    for (let i = startCol; i < upToCol; i++) {
      cumulative += this.dataStore.getColumnWidth(i);
      this.colPositions.push(cumulative);
    }
  }

  // ===========================================================================
  // Scroll Bounds
  // ===========================================================================

  /**
   * Get the maximum scroll position
   */
  getMaxScroll(): { x: number; y: number } {
    const usedRange = this.dataStore.getUsedRange();

    // Calculate total content size up to used range + some buffer
    const lastRow = Math.min(usedRange.endRow + 100, MAX_ROWS - 1);
    const lastCol = Math.min(usedRange.endCol + 20, MAX_COLS - 1);

    this.extendRowCache(lastRow + 1);
    this.extendColCache(lastCol + 1);

    const contentHeight = this.rowPositions[lastRow] ?? 0;
    const contentWidth = this.colPositions[lastCol] ?? 0;

    const viewableHeight = this.config.height - HEADER_HEIGHT;
    const viewableWidth = this.config.width - HEADER_WIDTH;

    return {
      x: Math.max(0, contentWidth - viewableWidth + this.getFrozenColsWidth()),
      y: Math.max(0, contentHeight - viewableHeight + this.getFrozenRowsHeight()),
    };
  }

  // ===========================================================================
  // Row/Column Visibility
  // ===========================================================================

  /**
   * Get visible row range accounting for hidden rows
   */
  getVisibleRows(): RowPosition[] {
    const viewport = this.getViewport();
    const rows: RowPosition[] = [];

    for (let row = viewport.startRow; row <= viewport.endRow; row++) {
      if (!this.dataStore.isRowHidden(row)) {
        rows.push({
          row,
          top: this.getRowTop(row) - this.scrollY,
          height: this.dataStore.getRowHeight(row),
        });
      }
    }

    return rows;
  }

  /**
   * Get visible column range accounting for hidden columns
   */
  getVisibleColumns(): ColPosition[] {
    const viewport = this.getViewport();
    const cols: ColPosition[] = [];

    for (let col = viewport.startCol; col <= viewport.endCol; col++) {
      if (!this.dataStore.isColumnHidden(col)) {
        cols.push({
          col,
          left: this.getColLeft(col) - this.scrollX,
          width: this.dataStore.getColumnWidth(col),
        });
      }
    }

    return cols;
  }

  // ===========================================================================
  // Page Navigation
  // ===========================================================================

  /**
   * Calculate rows visible in one page (for Page Up/Down)
   */
  getPageRowCount(): number {
    const viewableHeight = this.config.height - HEADER_HEIGHT - this.getFrozenRowsHeight();
    return Math.floor(viewableHeight / DEFAULT_ROW_HEIGHT);
  }

  /**
   * Calculate columns visible in one page (for Page Left/Right)
   */
  getPageColCount(): number {
    const viewableWidth = this.config.width - HEADER_WIDTH - this.getFrozenColsWidth();
    return Math.floor(viewableWidth / DEFAULT_COL_WIDTH);
  }
}
