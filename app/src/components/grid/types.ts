/**
 * Grid Render Contract Types
 *
 * This file defines the render contract between UI and Engine.
 * The UI layer ONLY receives pre-computed render instructions - no spreadsheet logic.
 *
 * Design principles:
 * 1. UI is a pure renderer - receives RenderFrame, outputs DOM
 * 2. All position calculations done by engine's VirtualRenderer
 * 3. All formatting decisions made by engine
 * 4. Future-proof for merged cells, conditional formatting, frozen panes
 */

// =============================================================================
// Cell Formatting Types (What the cell looks like)
// =============================================================================

/**
 * Text alignment options
 */
export type HorizontalAlign = 'left' | 'center' | 'right' | 'justify';
export type VerticalAlign = 'top' | 'middle' | 'bottom';

/**
 * Border style for a single edge
 */
export interface BorderStyle {
  style: 'none' | 'thin' | 'medium' | 'thick' | 'dashed' | 'dotted' | 'double';
  color: string;
}

/**
 * Complete border specification
 */
export interface CellBorders {
  top?: BorderStyle;
  right?: BorderStyle;
  bottom?: BorderStyle;
  left?: BorderStyle;
}

/**
 * Cell visual format - everything needed to style a cell
 * Engine computes this; UI just applies it
 */
export interface CellFormat {
  // Typography
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;

  // Alignment
  horizontalAlign?: HorizontalAlign;
  verticalAlign?: VerticalAlign;
  textWrap?: boolean;
  textRotation?: number; // degrees, 0-180

  // Background
  backgroundColor?: string;
  backgroundPattern?: string; // for future pattern fills

  // Borders
  borders?: CellBorders;

  // Number format (for display hints)
  numberFormat?: string;
  isPercentage?: boolean;
  isCurrency?: boolean;
  currencySymbol?: string;
}

// =============================================================================
// Render Cell Types (What to render)
// =============================================================================

/**
 * Merge information for a cell
 */
export interface MergeInfo {
  /** Is this the top-left anchor cell of a merge? */
  isAnchor: boolean;
  /** Is this cell hidden because it's part of a merge (not the anchor)? */
  isHidden: boolean;
  /** Row span (only on anchor) */
  rowSpan?: number;
  /** Column span (only on anchor) */
  colSpan?: number;
  /** Reference to anchor cell (for hidden cells) */
  anchorRow?: number;
  anchorCol?: number;
}

/**
 * Conditional formatting result
 */
export interface ConditionalFormatResult {
  /** Format overrides from conditional formatting rules */
  formatOverrides?: Partial<CellFormat>;
  /** Data bar percentage (0-100) */
  dataBar?: {
    percentage: number;
    color: string;
    direction: 'ltr' | 'rtl';
  };
  /** Icon set icon */
  icon?: {
    type: string; // e.g., 'arrow-up', 'circle-red'
    position: 'left' | 'right';
  };
  /** Color scale background */
  colorScale?: string;
}

/**
 * Validation status for a cell
 */
export interface ValidationStatus {
  isValid: boolean;
  errorMessage?: string;
  showErrorIndicator?: boolean;
}

/**
 * Character format for rich text (re-exported from engine for UI layer)
 * Subset of CellFormat for per-character formatting
 */
export interface CharacterFormat {
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: number;
  strikethrough?: boolean;
}

/**
 * Format run - text range with consistent character formatting
 */
export interface FormatRun {
  start: number;
  end: number;
  format?: CharacterFormat;
}

/**
 * Rich text value with character-level formatting (Excel-compatible)
 */
export interface FormattedText {
  _type: 'FormattedText';
  text: string;
  runs: FormatRun[];
}

/**
 * RenderCell - Complete render instructions for a single cell
 *
 * This is the primary data structure the UI receives.
 * Contains everything needed to render a cell - no computation required.
 */
export interface RenderCell {
  // === Position (screen coordinates, already computed) ===
  /** Row index in the spreadsheet */
  row: number;
  /** Column index in the spreadsheet */
  col: number;
  /** X position in pixels (screen coordinates) */
  x: number;
  /** Y position in pixels (screen coordinates) */
  y: number;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;

  // === Content ===
  /** Pre-formatted display value (already formatted by engine) */
  displayValue: string;
  /** Rich text value (for character-level formatting) - takes precedence over displayValue */
  richText?: FormattedText;
  /** Raw value type hint for UI (for cursor positioning, etc.) */
  valueType: 'string' | 'number' | 'boolean' | 'error' | 'empty';
  /** Is this a formula cell? (for formula bar display) */
  isFormula?: boolean;
  /** Error code if cell has error */
  errorCode?: string;

  // === Formatting ===
  /** Visual format to apply */
  format: CellFormat;

  // === Merge Support ===
  /** Merge information (if cell is part of a merge) */
  merge?: MergeInfo;

  // === Conditional Formatting ===
  /** Results of conditional formatting rules */
  conditionalFormat?: ConditionalFormatResult;

  // === Validation ===
  /** Data validation status */
  validation?: ValidationStatus;

  // === Frozen Pane Info ===
  /** Is this cell in a frozen row? */
  frozenRow?: boolean;
  /** Is this cell in a frozen column? */
  frozenCol?: boolean;

  // === Interaction State (set by UI, not engine) ===
  // Note: These are NOT in the engine's output - UI manages these
  // isSelected?: boolean;
  // isActive?: boolean;
  // isEditing?: boolean;
}

// =============================================================================
// Row/Column Position Types
// =============================================================================

/**
 * RowPosition - Render instructions for a row header
 */
export interface RowPosition {
  /** Row index (0-based) */
  row: number;
  /** Y position in screen pixels */
  top: number;
  /** Row height in pixels */
  height: number;
  /** Is this row frozen? */
  frozen: boolean;
  /** Is this row hidden? (for UI to show hidden row indicator) */
  hidden?: boolean;
  /** Row outline level (for grouping) */
  outlineLevel?: number;
}

/**
 * ColPosition - Render instructions for a column header
 */
export interface ColPosition {
  /** Column index (0-based) */
  col: number;
  /** X position in screen pixels */
  left: number;
  /** Column width in pixels */
  width: number;
  /** Is this column frozen? */
  frozen: boolean;
  /** Is this column hidden? */
  hidden?: boolean;
  /** Column outline level (for grouping) */
  outlineLevel?: number;
}

// =============================================================================
// Render Frame (Complete frame of render instructions)
// =============================================================================

/**
 * Freeze line positions for drawing pane dividers
 */
export interface FreezeLines {
  /** Y position of horizontal freeze line (null if no frozen rows) */
  horizontal: number | null;
  /** X position of vertical freeze line (null if no frozen cols) */
  vertical: number | null;
}

/**
 * Content bounds for scroll calculation
 */
export interface ContentBounds {
  /** Total content width in pixels */
  width: number;
  /** Total content height in pixels */
  height: number;
}

/**
 * Visible range in cell coordinates
 */
export interface VisibleRange {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

/**
 * RenderFrame - Complete render instructions for one frame
 *
 * This is THE contract between engine and UI.
 * Engine produces this; UI consumes it and renders.
 *
 * Invariants:
 * - All positions are screen coordinates (after scroll, zoom, headers)
 * - All cells in `cells` array are visible (no off-screen cells)
 * - Cells are sorted: frozen-frozen, frozen-row, frozen-col, scrollable
 * - displayValue is pre-formatted (no formatting logic in UI)
 */
export interface RenderFrame {
  // === Render Instructions ===
  /** Visible cells to render (in render order) */
  cells: RenderCell[];
  /** Visible row positions (for row headers) */
  rows: RowPosition[];
  /** Visible column positions (for column headers) */
  columns: ColPosition[];

  // === Scroll State ===
  /** Current scroll position */
  scroll: {
    x: number;
    y: number;
  };

  // === Bounds ===
  /** Total content size (for scrollbar) */
  contentBounds: ContentBounds;
  /** Visible cell range */
  visibleRange: VisibleRange;

  // === Frozen Panes ===
  /** Freeze line positions */
  freezeLines: FreezeLines;

  // === Metadata ===
  /** Frame timestamp (for debugging/profiling) */
  timestamp?: number;
  /** Zoom level applied */
  zoom?: number;
}

// =============================================================================
// UI Configuration (Not from engine)
// =============================================================================

/**
 * Grid configuration for UI layout
 */
export interface GridConfig {
  /** Row header width in pixels */
  rowHeaderWidth: number;
  /** Column header height in pixels */
  colHeaderHeight: number;
  /** Default cell width (for new columns) */
  defaultCellWidth: number;
  /** Default cell height (for new rows) */
  defaultCellHeight: number;
  /** Number of frozen rows */
  frozenRows: number;
  /** Number of frozen columns */
  frozenCols: number;
  /** Current zoom level (1.0 = 100%) */
  zoom: number;
  /** Overscan rows for smooth scrolling */
  overscanRows: number;
  /** Overscan columns for smooth scrolling */
  overscanCols: number;
}

/**
 * Default grid configuration
 */
export const DEFAULT_GRID_CONFIG: GridConfig = {
  rowHeaderWidth: 46,
  colHeaderHeight: 24,
  defaultCellWidth: 100,
  defaultCellHeight: 24,
  frozenRows: 0,
  frozenCols: 0,
  zoom: 1.0,
  overscanRows: 5,
  overscanCols: 3,
};

// =============================================================================
// Selection State (UI-managed)
// =============================================================================

/**
 * Selection range
 */
export interface SelectionRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

/**
 * Selection state (managed by UI, not engine)
 */
export interface SelectionState {
  /** Active cell (cursor position) */
  activeCell: { row: number; col: number } | null;
  /** Selection ranges (can be multiple for Ctrl+click) */
  ranges: SelectionRange[];
}

/**
 * Format painter UI state — passed from parent, reflects engine state.
 * The UI never evaluates or applies formats; it only renders visual affordances.
 */
export interface FormatPainterUIState {
  /** Current mode: inactive (off), single (one-shot), persistent (locked on) */
  mode: 'inactive' | 'single' | 'persistent';
  /** Source range whose format was picked (null when inactive) */
  sourceRange: SelectionRange | null;
}

// =============================================================================
// Context Menu
// =============================================================================

/** Which area of the grid was right-clicked. */
export type ContextMenuTargetArea = 'cell' | 'rowHeader' | 'colHeader';

/** Describes the right-click target for context menu routing. */
export interface ContextMenuTarget {
  area: ContextMenuTargetArea;
  row: number;
  col: number;
}

// =============================================================================
// Viewport/Scroll State
// =============================================================================

/**
 * Viewport dimensions
 */
export interface ViewportDimensions {
  width: number;
  height: number;
}

/**
 * Scroll state
 */
export interface ScrollState {
  scrollLeft: number;
  scrollTop: number;
}

// =============================================================================
// Event Handler Types
// =============================================================================

export type CellClickHandler = (
  row: number,
  col: number,
  event: React.MouseEvent
) => void;

export type CellDoubleClickHandler = (
  row: number,
  col: number,
  event: React.MouseEvent
) => void;

export type HeaderClickHandler = (
  index: number,
  event: React.MouseEvent
) => void;

export type CellRenderer = (cell: RenderCell) => React.ReactNode;

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Convert column index to letter (A, B, ... Z, AA, AB, ...)
 */
export function getColumnLabel(index: number): string {
  let label = '';
  let num = index;
  while (num >= 0) {
    label = String.fromCharCode(65 + (num % 26)) + label;
    num = Math.floor(num / 26) - 1;
  }
  return label;
}

/** Alias for getColumnLabel — converts 0-based column index to letter (A, B, ..., Z, AA, ...) */
export const columnToLetter = getColumnLabel;

/**
 * Convert column letter to index (A=0, B=1, ..., AA=26, ...)
 */
export function getColumnIndex(label: string): number {
  const upper = label.toUpperCase();
  let index = 0;
  for (let i = 0; i < upper.length; i++) {
    index = index * 26 + (upper.charCodeAt(i) - 64);
  }
  return index - 1;
}

/**
 * Format cell address (e.g., "A1", "B2")
 */
export function formatCellAddress(row: number, col: number): string {
  return `${getColumnLabel(col)}${row + 1}`;
}

/**
 * Check if a cell is within a selection range
 */
export function isCellInRange(
  row: number,
  col: number,
  range: SelectionRange
): boolean {
  const minRow = Math.min(range.startRow, range.endRow);
  const maxRow = Math.max(range.startRow, range.endRow);
  const minCol = Math.min(range.startCol, range.endCol);
  const maxCol = Math.max(range.startCol, range.endCol);
  return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol;
}
