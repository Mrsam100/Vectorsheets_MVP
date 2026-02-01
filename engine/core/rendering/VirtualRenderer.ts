/**
 * VectorSheet Engine - Virtual Renderer (Production Grade)
 *
 * High-performance virtualized rendering for spreadsheets with 1M+ rows.
 *
 * Architecture:
 * - Framework-agnostic: Emits render instructions, not DOM
 * - Decoupled: Uses DimensionProvider interface, not direct store access
 * - O(visible_cells) render cost guaranteed
 * - O(log n) position lookups via binary search on lazy-extended prefix sums
 * - Extensible: Frozen panes, zoom, RTL-ready infrastructure
 *
 * Key invariants:
 * - getViewport() is idempotent for same scroll/config
 * - getRenderInstructions() produces deterministic output
 * - Position caches extend lazily (no upfront 1M row allocation)
 * - All mutations flow through explicit setters
 */

import {
  CellRef,
  CellRange,
  Viewport,
  RenderCell,
  Cell,
  MAX_ROWS,
  MAX_COLS,
  DEFAULT_ROW_HEIGHT,
  DEFAULT_COL_WIDTH,
  HEADER_HEIGHT,
  HEADER_WIDTH,
} from '../types/index.js';

// =============================================================================
// Dimension Provider Interface (Decoupling Layer)
// =============================================================================

/**
 * Interface for providing row/column dimensions.
 * Allows VirtualRenderer to work with any data source, not just SparseDataStore.
 * This is the key abstraction that enables testing and framework independence.
 */
export interface DimensionProvider {
  /** Get height of a specific row in pixels */
  getRowHeight(row: number): number;
  /** Get width of a specific column in pixels */
  getColumnWidth(col: number): number;
  /** Check if row is hidden */
  isRowHidden(row: number): boolean;
  /** Check if column is hidden */
  isColumnHidden(col: number): boolean;
  /** Get cell data (optional - for render cell construction) */
  getCell?(row: number, col: number): Cell | null;
  /** Get the used data range (for scroll bounds calculation) */
  getUsedRange?(): CellRange;
}

// =============================================================================
// Configuration Types
// =============================================================================

export interface ViewportConfig {
  /** Viewport width in pixels (including headers) */
  width: number;
  /** Viewport height in pixels (including headers) */
  height: number;
  /** Overscan rows above/below visible area (improves scroll smoothness) */
  overscanRows: number;
  /** Overscan columns left/right of visible area */
  overscanCols: number;
  /** @deprecated Use overscanRows */
  rowBuffer?: number;
  /** @deprecated Use overscanCols */
  colBuffer?: number;
  /** Number of frozen rows (always visible, don't scroll) */
  frozenRows: number;
  /** Number of frozen columns (always visible, don't scroll) */
  frozenCols: number;
  /** Zoom level: 1.0 = 100%, 0.5 = 50%, 2.0 = 200% */
  zoom: number;
  /** Right-to-left layout mode */
  rtl: boolean;
  /** Row header width in pixels */
  headerWidth: number;
  /** Column header height in pixels */
  headerHeight: number;
}

/**
 * Scroll position in content coordinates (not screen pixels)
 */
export interface ScrollPosition {
  /** Horizontal scroll offset in pixels */
  x: number;
  /** Vertical scroll offset in pixels */
  y: number;
}

// =============================================================================
// Render Instruction Types (Output - Framework Agnostic)
// =============================================================================

/**
 * Describes a visible row for rendering.
 * Consumer maps this to actual DOM/Canvas/WebGL elements.
 */
export interface RowPosition {
  /** Row index (0-based) */
  row: number;
  /** Y position in screen coordinates (after scroll/zoom) */
  top: number;
  /** Row height in screen pixels (after zoom) */
  height: number;
  /** Whether this row is in the frozen pane */
  frozen: boolean;
}

/**
 * Describes a visible column for rendering.
 */
export interface ColPosition {
  /** Column index (0-based) */
  col: number;
  /** X position in screen coordinates (after scroll/zoom, RTL-aware) */
  left: number;
  /** Column width in screen pixels (after zoom) */
  width: number;
  /** Whether this column is in the frozen pane */
  frozen: boolean;
}

/**
 * Complete render instructions for one frame.
 * This is the primary output - framework renders based on this.
 */
export interface RenderFrame {
  /** Visible row descriptors (sorted by row index) */
  rows: RowPosition[];
  /** Visible column descriptors (sorted by column index) */
  columns: ColPosition[];
  /** Cells to render (frozen cells first, then scrollable) */
  cells: RenderCell[];
  /** Viewport state for this frame */
  viewport: Viewport;
  /** Scroll position used for this frame */
  scroll: ScrollPosition;
  /** Content bounds (total scrollable area) */
  contentBounds: { width: number; height: number };
  /** Visible area bounds in content coordinates */
  visibleBounds: CellRange;
  /** Frozen pane divider positions (for drawing freeze lines) */
  freezeLines: {
    horizontal: number | null; // Y position of horizontal freeze line
    vertical: number | null;   // X position of vertical freeze line
  };
}

/**
 * Extended RenderCell with additional metadata for advanced rendering.
 */
export interface ExtendedRenderCell extends RenderCell {
  /** Is this cell in a frozen row? */
  frozenRow: boolean;
  /** Is this cell in a frozen column? */
  frozenCol: boolean;
  /** Z-index hint (frozen cells render above scrollable) */
  zIndex: number;
  /** Screen bounds after all transforms */
  screenBounds: { x: number; y: number; width: number; height: number };
}

// =============================================================================
// Position Cache (Lazy Prefix Sum Array)
// =============================================================================

/**
 * Lazy-extending prefix sum cache for O(log n) position lookups.
 * Only computes positions up to the requested index, extending as needed.
 * This avoids O(n) upfront cost for million-row sheets.
 */
class PositionCache {
  /** Cumulative positions: positions[i] = sum of sizes from 0 to i (inclusive) */
  private positions: number[] = [];
  /** Default size when no custom size is set */
  private defaultSize: number;
  /** Size getter function */
  private getSizeFn: (index: number) => number;
  /** Hidden checker function */
  private isHiddenFn: (index: number) => boolean;
  /** Maximum valid index */
  private maxIndex: number;
  /** Flag to invalidate entire cache */
  private isDirty: boolean = true;

  constructor(
    defaultSize: number,
    getSize: (index: number) => number,
    isHidden: (index: number) => boolean,
    maxIndex: number
  ) {
    this.defaultSize = defaultSize;
    this.getSizeFn = getSize;
    this.isHiddenFn = isHidden;
    this.maxIndex = maxIndex;
  }

  /**
   * Invalidate the cache (call when sizes change).
   * Cheap operation - actual rebuild is lazy.
   */
  invalidate(): void {
    this.isDirty = true;
  }

  /**
   * Force rebuild from scratch (use after bulk size changes).
   */
  reset(): void {
    this.positions = [];
    this.isDirty = false;
  }

  /**
   * Get the start position of an item at given index.
   * O(1) if already cached, O(n) on first access to extend cache.
   */
  getPosition(index: number): number {
    if (this.isDirty) {
      this.reset();
    }

    if (index <= 0) return 0;
    if (index > this.maxIndex) index = this.maxIndex;

    // Extend cache if needed
    this.extendTo(index);

    // Position of index = cumulative sum up to (index - 1)
    return this.positions[index - 1];
  }

  /**
   * Get size of item at index (respecting hidden state).
   */
  getSize(index: number): number {
    if (this.isHiddenFn(index)) return 0;
    return this.getSizeFn(index);
  }

  /**
   * Get the end position of an item (start + size).
   */
  getEndPosition(index: number): number {
    return this.getPosition(index) + this.getSize(index);
  }

  /**
   * Find which index contains a given position using binary search.
   * Returns the index whose range [start, end) contains the position.
   * O(log n) after cache is extended.
   */
  findIndexAtPosition(position: number): number {
    if (position <= 0) return 0;

    // First, ensure we have enough cache
    // Estimate based on default size, then extend
    const estimate = Math.ceil(position / this.defaultSize);
    const searchLimit = Math.min(estimate * 2 + 100, this.maxIndex);
    this.extendTo(searchLimit);

    // If position is beyond our cache, keep extending
    while (
      this.positions.length > 0 &&
      this.positions[this.positions.length - 1] < position &&
      this.positions.length < this.maxIndex
    ) {
      this.extendTo(Math.min(this.positions.length + 100, this.maxIndex));
    }

    // Binary search for the index
    // We want to find i where positions[i-1] <= position < positions[i]
    let left = 0;
    let right = this.positions.length;

    while (left < right) {
      const mid = (left + right) >>> 1; // Unsigned right shift for floor division
      if (this.positions[mid] <= position) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    return Math.min(left, this.maxIndex - 1);
  }

  /**
   * Extend the cache to include positions up to (but not including) targetIndex.
   */
  private extendTo(targetIndex: number): void {
    if (this.isDirty) {
      this.reset();
    }

    const startIndex = this.positions.length;
    if (startIndex >= targetIndex) return;

    let cumulative = startIndex > 0 ? this.positions[startIndex - 1] : 0;

    for (let i = startIndex; i < targetIndex && i < this.maxIndex; i++) {
      cumulative += this.getSize(i);
      this.positions.push(cumulative);
    }
  }

  /**
   * Get total size up to and including given index.
   * Useful for calculating content bounds.
   */
  getTotalSize(upToIndex: number): number {
    if (upToIndex < 0) return 0;
    this.extendTo(upToIndex + 1);
    return this.positions[upToIndex] ?? 0;
  }
}

// =============================================================================
// Virtual Renderer Class
// =============================================================================

/**
 * Production-grade virtual renderer for spreadsheet grids.
 *
 * Usage:
 * ```typescript
 * const renderer = new VirtualRenderer(dimensionProvider, config);
 * renderer.setScroll(scrollX, scrollY);
 * const frame = renderer.getRenderFrame();
 * // Use frame.cells, frame.rows, frame.columns to render
 * ```
 */
export class VirtualRenderer {
  private dimensions: DimensionProvider;
  private config: ViewportConfig;
  private rowCache: PositionCache;
  private colCache: PositionCache;

  // Current scroll state
  private scrollX: number = 0;
  private scrollY: number = 0;

  // Cached viewport (invalidated on scroll/config change)
  private cachedViewport: Viewport | null = null;

  // Compatibility: maintain dataStore reference for existing code
  // TODO: Remove after migrating all consumers to DimensionProvider
  private _dataStore: DimensionProvider;

  /**
   * Create a new VirtualRenderer.
   *
   * @param dimensions - Provider for row heights, column widths, and cell data
   * @param config - Viewport and rendering configuration
   */
  constructor(
    dimensions: DimensionProvider,
    config: Partial<ViewportConfig> = {}
  ) {
    this.dimensions = dimensions;
    this._dataStore = dimensions; // Compatibility alias

    // Merge with sensible defaults (support deprecated rowBuffer/colBuffer)
    this.config = {
      width: config.width ?? 1200,
      height: config.height ?? 800,
      overscanRows: config.overscanRows ?? config.rowBuffer ?? 5,
      overscanCols: config.overscanCols ?? config.colBuffer ?? 3,
      frozenRows: config.frozenRows ?? 0,
      frozenCols: config.frozenCols ?? 0,
      zoom: config.zoom ?? 1.0,
      rtl: config.rtl ?? false,
      headerWidth: config.headerWidth ?? HEADER_WIDTH,
      headerHeight: config.headerHeight ?? HEADER_HEIGHT,
    };

    // Initialize position caches with dimension provider callbacks
    this.rowCache = new PositionCache(
      DEFAULT_ROW_HEIGHT,
      (row) => this.dimensions.getRowHeight(row),
      (row) => this.dimensions.isRowHidden(row),
      MAX_ROWS
    );

    this.colCache = new PositionCache(
      DEFAULT_COL_WIDTH,
      (col) => this.dimensions.getColumnWidth(col),
      (col) => this.dimensions.isColumnHidden(col),
      MAX_COLS
    );
  }

  // ===========================================================================
  // Configuration Setters
  // ===========================================================================

  /**
   * Update viewport dimensions (typically on container resize).
   */
  setViewportSize(width: number, height: number): void {
    this.config.width = width;
    this.config.height = height;
    this.invalidateViewport();
  }

  /**
   * Set frozen pane configuration.
   * Frozen rows/columns are always visible and don't scroll.
   */
  setFrozenPanes(rows: number, cols: number): void {
    this.config.frozenRows = Math.max(0, rows);
    this.config.frozenCols = Math.max(0, cols);
    this.invalidateViewport();
  }

  /**
   * Set zoom level (1.0 = 100%).
   * Affects all rendered positions and sizes.
   */
  setZoom(zoom: number): void {
    // Clamp to reasonable range
    this.config.zoom = Math.max(0.1, Math.min(4.0, zoom));
    this.invalidateViewport();
  }

  /**
   * Enable/disable RTL (right-to-left) layout.
   */
  setRTL(rtl: boolean): void {
    this.config.rtl = rtl;
    this.invalidateViewport();
  }

  /**
   * Get current configuration (readonly copy).
   */
  getConfig(): Readonly<ViewportConfig> {
    return { ...this.config };
  }

  // ===========================================================================
  // Scroll Management
  // ===========================================================================

  /**
   * Set scroll position.
   * Values are clamped to valid range.
   */
  setScroll(x: number, y: number): void {
    const maxScroll = this.getMaxScroll();
    this.scrollX = Math.max(0, Math.min(x, maxScroll.x));
    this.scrollY = Math.max(0, Math.min(y, maxScroll.y));
    this.invalidateViewport();
  }

  /**
   * Get current scroll position.
   */
  getScroll(): ScrollPosition {
    return { x: this.scrollX, y: this.scrollY };
  }

  /**
   * Scroll to bring a specific cell into view.
   * Returns the new scroll position.
   */
  scrollToCell(row: number, col: number): ScrollPosition {
    const cellTop = this.getRowTop(row);
    const cellLeft = this.getColLeft(col);
    const cellHeight = this.dimensions.getRowHeight(row);
    const cellWidth = this.dimensions.getColumnWidth(col);

    const viewableWidth = this.getViewableWidth();
    const viewableHeight = this.getViewableHeight();
    const frozenWidth = this.getFrozenColsWidth();
    const frozenHeight = this.getFrozenRowsHeight();

    let newScrollX = this.scrollX;
    let newScrollY = this.scrollY;

    // Only scroll for non-frozen cells
    if (col >= this.config.frozenCols) {
      const effectiveLeft = cellLeft - frozenWidth;
      if (effectiveLeft < this.scrollX) {
        newScrollX = effectiveLeft;
      } else if (effectiveLeft + cellWidth > this.scrollX + viewableWidth - frozenWidth) {
        newScrollX = effectiveLeft + cellWidth - viewableWidth + frozenWidth;
      }
    }

    if (row >= this.config.frozenRows) {
      const effectiveTop = cellTop - frozenHeight;
      if (effectiveTop < this.scrollY) {
        newScrollY = effectiveTop;
      } else if (effectiveTop + cellHeight > this.scrollY + viewableHeight - frozenHeight) {
        newScrollY = effectiveTop + cellHeight - viewableHeight + frozenHeight;
      }
    }

    this.setScroll(newScrollX, newScrollY);
    return { x: this.scrollX, y: this.scrollY };
  }

  /**
   * Get maximum valid scroll position.
   */
  getMaxScroll(): { x: number; y: number } {
    const contentBounds = this.getContentBounds();
    const viewableWidth = this.getViewableWidth();
    const viewableHeight = this.getViewableHeight();

    return {
      x: Math.max(0, contentBounds.width - viewableWidth),
      y: Math.max(0, contentBounds.height - viewableHeight),
    };
  }

  // ===========================================================================
  // Cache Management
  // ===========================================================================

  /**
   * Invalidate position caches (call after row height or column width changes).
   */
  invalidateCache(): void {
    this.rowCache.invalidate();
    this.colCache.invalidate();
    this.invalidateViewport();
  }

  /**
   * Force complete cache reset (call after bulk changes).
   */
  resetCache(): void {
    this.rowCache.reset();
    this.colCache.reset();
    this.invalidateViewport();
  }

  private invalidateViewport(): void {
    this.cachedViewport = null;
  }

  // ===========================================================================
  // Position Calculations (Public API)
  // ===========================================================================

  /**
   * Get the top position of a row in content coordinates.
   * O(1) for cached rows, O(n) first access.
   */
  getRowTop(row: number): number {
    return this.rowCache.getPosition(row);
  }

  /**
   * Get the left position of a column in content coordinates.
   */
  getColLeft(col: number): number {
    return this.colCache.getPosition(col);
  }

  /**
   * Find which row is at a given Y position in content coordinates.
   * O(log n) via binary search.
   */
  findRowAtPosition(y: number): number {
    return this.rowCache.findIndexAtPosition(y);
  }

  /**
   * Find which column is at a given X position in content coordinates.
   */
  findColAtPosition(x: number): number {
    return this.colCache.findIndexAtPosition(x);
  }

  /**
   * Get cell at screen coordinates (accounting for headers, scroll, zoom).
   * Returns null if coordinates are in header area or out of bounds.
   */
  getCellAtPoint(screenX: number, screenY: number): CellRef | null {
    const zoom = this.config.zoom;

    // Convert screen coordinates to content coordinates
    const x = (screenX - this.config.headerWidth) / zoom;
    const y = (screenY - this.config.headerHeight) / zoom;

    if (x < 0 || y < 0) return null;

    const frozenWidth = this.getFrozenColsWidth();
    const frozenHeight = this.getFrozenRowsHeight();

    let col: number;
    let row: number;

    // Handle frozen panes
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

    // Bounds check
    if (row >= MAX_ROWS || col >= MAX_COLS) return null;

    return { row, col };
  }

  // ===========================================================================
  // Viewport Calculation (Core Logic)
  // ===========================================================================

  /**
   * Get the current viewport (visible cell range with scroll state).
   * Cached and recomputed only on scroll/config changes.
   */
  getViewport(): Viewport {
    if (this.cachedViewport) {
      return this.cachedViewport;
    }

    const viewableWidth = this.getViewableWidth();
    const viewableHeight = this.getViewableHeight();
    const frozenWidth = this.getFrozenColsWidth();
    const frozenHeight = this.getFrozenRowsHeight();

    // Find visible range in scrollable area (excluding frozen panes)
    const scrollableLeft = this.scrollX + frozenWidth;
    const scrollableTop = this.scrollY + frozenHeight;
    const scrollableRight = scrollableLeft + viewableWidth - frozenWidth;
    const scrollableBottom = scrollableTop + viewableHeight - frozenHeight;

    // Find first and last visible rows/columns
    let startRow = this.findRowAtPosition(scrollableTop);
    let endRow = this.findRowAtPosition(scrollableBottom);
    let startCol = this.findColAtPosition(scrollableLeft);
    let endCol = this.findColAtPosition(scrollableRight);

    // Apply overscan (buffer for smooth scrolling)
    startRow = Math.max(this.config.frozenRows, startRow - this.config.overscanRows);
    endRow = Math.min(MAX_ROWS - 1, endRow + this.config.overscanRows);
    startCol = Math.max(this.config.frozenCols, startCol - this.config.overscanCols);
    endCol = Math.min(MAX_COLS - 1, endCol + this.config.overscanCols);

    this.cachedViewport = {
      startRow,
      endRow,
      startCol,
      endCol,
      scrollX: this.scrollX,
      scrollY: this.scrollY,
    };

    return this.cachedViewport;
  }

  // ===========================================================================
  // Render Instructions (Primary Output)
  // ===========================================================================

  /**
   * Get complete render instructions for the current frame.
   * This is the main output method - returns everything needed to render.
   *
   * Guarantees:
   * - O(visible_cells) complexity
   * - Deterministic output for same input state
   * - Cells are ordered: frozen-frozen, frozen-row, frozen-col, scrollable
   */
  getRenderFrame(): RenderFrame {
    const viewport = this.getViewport();
    const rows = this.getVisibleRows();
    const columns = this.getVisibleColumns();
    const cells = this.getCellsToRender();
    const contentBounds = this.getContentBounds();

    return {
      rows,
      columns,
      cells,
      viewport,
      scroll: { x: this.scrollX, y: this.scrollY },
      contentBounds,
      visibleBounds: {
        startRow: viewport.startRow,
        endRow: viewport.endRow,
        startCol: viewport.startCol,
        endCol: viewport.endCol,
      },
      freezeLines: {
        horizontal: this.config.frozenRows > 0
          ? this.getFrozenRowsHeight() * this.config.zoom + this.config.headerHeight
          : null,
        vertical: this.config.frozenCols > 0
          ? this.getFrozenColsWidth() * this.config.zoom + this.config.headerWidth
          : null,
      },
    };
  }

  /**
   * Get cells to render in the current viewport.
   * Returns cells in render order (frozen first, then scrollable).
   *
   * Complexity: O(visible_rows * visible_cols) = O(visible_cells)
   */
  getCellsToRender(): RenderCell[] {
    const viewport = this.getViewport();
    const cells: RenderCell[] = [];
    const zoom = this.config.zoom;

    // 1. Frozen corner (frozen rows AND frozen columns)
    for (let row = 0; row < this.config.frozenRows; row++) {
      if (this.dimensions.isRowHidden(row)) continue;
      for (let col = 0; col < this.config.frozenCols; col++) {
        if (this.dimensions.isColumnHidden(col)) continue;
        cells.push(this.createRenderCell(row, col, true, true, zoom));
      }
    }

    // 2. Frozen rows (frozen row, scrollable column)
    for (let row = 0; row < this.config.frozenRows; row++) {
      if (this.dimensions.isRowHidden(row)) continue;
      for (let col = viewport.startCol; col <= viewport.endCol; col++) {
        if (col < this.config.frozenCols) continue; // Skip frozen corner
        if (this.dimensions.isColumnHidden(col)) continue;
        cells.push(this.createRenderCell(row, col, true, false, zoom));
      }
    }

    // 3. Frozen columns (scrollable row, frozen column)
    for (let col = 0; col < this.config.frozenCols; col++) {
      if (this.dimensions.isColumnHidden(col)) continue;
      for (let row = viewport.startRow; row <= viewport.endRow; row++) {
        if (row < this.config.frozenRows) continue; // Skip frozen corner
        if (this.dimensions.isRowHidden(row)) continue;
        cells.push(this.createRenderCell(row, col, false, true, zoom));
      }
    }

    // 4. Scrollable area (non-frozen rows and columns)
    for (let row = viewport.startRow; row <= viewport.endRow; row++) {
      if (row < this.config.frozenRows) continue;
      if (this.dimensions.isRowHidden(row)) continue;

      for (let col = viewport.startCol; col <= viewport.endCol; col++) {
        if (col < this.config.frozenCols) continue;
        if (this.dimensions.isColumnHidden(col)) continue;

        cells.push(this.createRenderCell(row, col, false, false, zoom));
      }
    }

    return cells;
  }

  /**
   * Create a single render cell with computed screen position.
   */
  private createRenderCell(
    row: number,
    col: number,
    frozenRow: boolean,
    frozenCol: boolean,
    zoom: number
  ): RenderCell {
    // Content coordinates
    let x = this.getColLeft(col);
    let y = this.getRowTop(row);
    const width = this.dimensions.getColumnWidth(col);
    const height = this.dimensions.getRowHeight(row);

    // Apply scroll offset for non-frozen cells
    if (!frozenCol) {
      x -= this.scrollX;
    }
    if (!frozenRow) {
      y -= this.scrollY;
    }

    // Apply zoom and add header offset
    x = x * zoom + this.config.headerWidth;
    y = y * zoom + this.config.headerHeight;

    // RTL adjustment
    if (this.config.rtl && !frozenCol) {
      x = this.config.width - x - width * zoom;
    }

    return {
      row,
      col,
      x,
      y,
      width: width * zoom,
      height: height * zoom,
      cell: this.dimensions.getCell?.(row, col) ?? null,
    };
  }

  /**
   * Get visible rows with their screen positions.
   */
  getVisibleRows(): RowPosition[] {
    const viewport = this.getViewport();
    const rows: RowPosition[] = [];
    const zoom = this.config.zoom;

    // Frozen rows
    for (let row = 0; row < this.config.frozenRows; row++) {
      if (this.dimensions.isRowHidden(row)) continue;
      const top = this.getRowTop(row) * zoom + this.config.headerHeight;
      rows.push({
        row,
        top,
        height: this.dimensions.getRowHeight(row) * zoom,
        frozen: true,
      });
    }

    // Scrollable rows
    for (let row = viewport.startRow; row <= viewport.endRow; row++) {
      if (row < this.config.frozenRows) continue;
      if (this.dimensions.isRowHidden(row)) continue;

      const contentTop = this.getRowTop(row) - this.scrollY;
      const top = contentTop * zoom + this.config.headerHeight;

      rows.push({
        row,
        top,
        height: this.dimensions.getRowHeight(row) * zoom,
        frozen: false,
      });
    }

    return rows;
  }

  /**
   * Get visible columns with their screen positions.
   */
  getVisibleColumns(): ColPosition[] {
    const viewport = this.getViewport();
    const cols: ColPosition[] = [];
    const zoom = this.config.zoom;

    // Frozen columns
    for (let col = 0; col < this.config.frozenCols; col++) {
      if (this.dimensions.isColumnHidden(col)) continue;
      let left = this.getColLeft(col) * zoom + this.config.headerWidth;

      if (this.config.rtl) {
        left = this.config.width - left - this.dimensions.getColumnWidth(col) * zoom;
      }

      cols.push({
        col,
        left,
        width: this.dimensions.getColumnWidth(col) * zoom,
        frozen: true,
      });
    }

    // Scrollable columns
    for (let col = viewport.startCol; col <= viewport.endCol; col++) {
      if (col < this.config.frozenCols) continue;
      if (this.dimensions.isColumnHidden(col)) continue;

      const contentLeft = this.getColLeft(col) - this.scrollX;
      let left = contentLeft * zoom + this.config.headerWidth;

      if (this.config.rtl) {
        left = this.config.width - left - this.dimensions.getColumnWidth(col) * zoom;
      }

      cols.push({
        col,
        left,
        width: this.dimensions.getColumnWidth(col) * zoom,
        frozen: false,
      });
    }

    return cols;
  }

  // ===========================================================================
  // Dimension Helpers
  // ===========================================================================

  /**
   * Get total width of frozen columns.
   */
  private getFrozenColsWidth(): number {
    let width = 0;
    for (let col = 0; col < this.config.frozenCols; col++) {
      if (!this.dimensions.isColumnHidden(col)) {
        width += this.dimensions.getColumnWidth(col);
      }
    }
    return width;
  }

  /**
   * Get total height of frozen rows.
   */
  private getFrozenRowsHeight(): number {
    let height = 0;
    for (let row = 0; row < this.config.frozenRows; row++) {
      if (!this.dimensions.isRowHidden(row)) {
        height += this.dimensions.getRowHeight(row);
      }
    }
    return height;
  }

  /**
   * Get viewable width (viewport minus headers).
   */
  private getViewableWidth(): number {
    return (this.config.width - this.config.headerWidth) / this.config.zoom;
  }

  /**
   * Get viewable height (viewport minus headers).
   */
  private getViewableHeight(): number {
    return (this.config.height - this.config.headerHeight) / this.config.zoom;
  }

  /**
   * Get content bounds based on used data range.
   */
  private getContentBounds(): { width: number; height: number } {
    const usedRange = this.dimensions.getUsedRange?.() ?? {
      startRow: 0,
      startCol: 0,
      endRow: 100,
      endCol: 26,
    };

    // Add buffer beyond used range for scrolling into empty space
    const lastRow = Math.min(usedRange.endRow + 100, MAX_ROWS - 1);
    const lastCol = Math.min(usedRange.endCol + 26, MAX_COLS - 1);

    return {
      width: this.colCache.getTotalSize(lastCol),
      height: this.rowCache.getTotalSize(lastRow),
    };
  }

  // ===========================================================================
  // Page Navigation Helpers
  // ===========================================================================

  /**
   * Get number of rows that fit in one page (for Page Up/Down).
   */
  getPageRowCount(): number {
    const viewableHeight = this.getViewableHeight() - this.getFrozenRowsHeight();
    return Math.max(1, Math.floor(viewableHeight / DEFAULT_ROW_HEIGHT));
  }

  /**
   * Get number of columns that fit in one page.
   */
  getPageColCount(): number {
    const viewableWidth = this.getViewableWidth() - this.getFrozenColsWidth();
    return Math.max(1, Math.floor(viewableWidth / DEFAULT_COL_WIDTH));
  }

  // ===========================================================================
  // Compatibility Layer (For Existing Code)
  // ===========================================================================

  // These methods maintain backward compatibility with existing SpreadsheetEngine

  /** @deprecated Use config.overscanRows */
  get rowBuffer(): number {
    return this.config.overscanRows;
  }

  /** @deprecated Use config.overscanCols */
  get colBuffer(): number {
    return this.config.overscanCols;
  }

  /** @deprecated Access dimensions directly */
  get dataStore(): DimensionProvider {
    return this._dataStore;
  }
}

// =============================================================================
// Factory Function (Alternative Constructor)
// =============================================================================

/**
 * Create a VirtualRenderer with default configuration.
 * Convenience function for common use cases.
 */
export function createVirtualRenderer(
  dimensions: DimensionProvider,
  options?: {
    width?: number;
    height?: number;
    frozenRows?: number;
    frozenCols?: number;
  }
): VirtualRenderer {
  return new VirtualRenderer(dimensions, {
    width: options?.width ?? 1200,
    height: options?.height ?? 800,
    frozenRows: options?.frozenRows ?? 0,
    frozenCols: options?.frozenCols ?? 0,
  });
}
