/**
 * VectorSheet Engine - Core Type Definitions
 * Excel-grade spreadsheet engine types
 */

// ============================================================================
// Cell Types
// ============================================================================

export type CellValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'error'
  | 'date'
  | 'formula'
  | 'empty';

export interface CellFormat {
  /** Number format string (e.g., "0.00", "yyyy-mm-dd") */
  numberFormat?: string;
  /** Font family */
  fontFamily?: string;
  /** Font size in points */
  fontSize?: number;
  /** Font color (hex) */
  fontColor?: string;
  /** Bold */
  bold?: boolean;
  /** Italic */
  italic?: boolean;
  /** Underline: 0=none, 1=single, 2=double */
  underline?: number;
  /** Strikethrough */
  strikethrough?: boolean;
  /** Background color (hex) */
  backgroundColor?: string;
  /** Horizontal alignment: 'left' | 'center' | 'right' | 'justify' */
  horizontalAlign?: 'left' | 'center' | 'right' | 'justify';
  /** Vertical alignment: 'top' | 'middle' | 'bottom' */
  verticalAlign?: 'top' | 'middle' | 'bottom';
  /** Text wrap */
  wrap?: boolean;
  /** Text rotation in degrees */
  rotation?: number;
  /** Indent level */
  indent?: number;
}

export interface CellBorder {
  style: 'none' | 'thin' | 'medium' | 'thick' | 'dashed' | 'dotted' | 'double';
  color: string;
}

export interface CellBorders {
  top?: CellBorder;
  right?: CellBorder;
  bottom?: CellBorder;
  left?: CellBorder;
}

export interface Cell {
  /** Raw value (what user entered or formula result) */
  value: string | number | boolean | null;
  /** Display value (formatted for display) */
  displayValue?: string;
  /** Value type */
  type: CellValueType;
  /** Formula string (without leading =) */
  formula?: string;
  /** Cached formula result */
  formulaResult?: string | number | boolean | null;
  /** Is formula result dirty (needs recalculation) */
  isDirty?: boolean;
  /** Cell format */
  format?: CellFormat;
  /** Cell borders */
  borders?: CellBorders;
  /** Merge info: if this is the top-left of a merge */
  merge?: { rowSpan: number; colSpan: number };
  /** Merge info: if this cell is part of a merge (points to top-left) */
  mergeParent?: { row: number; col: number };
  /** Comment/note */
  comment?: string;
  /** Hyperlink */
  hyperlink?: { url: string; tooltip?: string };
  /** Data validation */
  validation?: DataValidation;
}

export interface DataValidation {
  type: 'list' | 'number' | 'date' | 'textLength' | 'custom';
  operator?: 'between' | 'notBetween' | 'equal' | 'notEqual' | 'greaterThan' | 'lessThan' | 'greaterOrEqual' | 'lessOrEqual';
  value1?: string | number;
  value2?: string | number;
  formula1?: string;
  formula2?: string;
  allowBlank?: boolean;
  showDropdown?: boolean;
  showError?: boolean;
  errorTitle?: string;
  errorMessage?: string;
  showInput?: boolean;
  inputTitle?: string;
  inputMessage?: string;
}

// ============================================================================
// Cell Reference Types
// ============================================================================

export interface CellRef {
  row: number;
  col: number;
}

export interface CellRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

/** Key format: "row_col" */
export type CellKey = string;

export function cellKey(row: number, col: number): CellKey {
  return `${row}_${col}`;
}

export function parseKey(key: CellKey): CellRef {
  const [row, col] = key.split('_').map(Number);
  return { row, col };
}

export function rangeContains(range: CellRange, row: number, col: number): boolean {
  return row >= range.startRow && row <= range.endRow &&
         col >= range.startCol && col <= range.endCol;
}

export function rangesOverlap(a: CellRange, b: CellRange): boolean {
  return !(a.endRow < b.startRow || b.endRow < a.startRow ||
           a.endCol < b.startCol || b.endCol < a.startCol);
}

// ============================================================================
// Selection Types
// ============================================================================

export interface Selection {
  /** The ranges selected (supports multi-select with Ctrl+Click) */
  ranges: CellRange[];
  /** The active cell (where typing goes) */
  activeCell: CellRef;
  /** The anchor cell (for Shift+Click extending) */
  anchorCell: CellRef;
  /** Index of the active range in ranges array */
  activeRangeIndex: number;
}

// ============================================================================
// Sheet Types
// ============================================================================

export interface RowInfo {
  height: number;
  hidden: boolean;
  customHeight: boolean;
}

export interface ColumnInfo {
  width: number;
  hidden: boolean;
  customWidth: boolean;
}

export interface SheetConfig {
  /** Default row height in pixels */
  defaultRowHeight: number;
  /** Default column width in pixels */
  defaultColWidth: number;
  /** Frozen rows (0 = none) */
  frozenRows: number;
  /** Frozen columns (0 = none) */
  frozenCols: number;
  /** Show grid lines */
  showGridLines: boolean;
  /** Show row headers */
  showRowHeaders: boolean;
  /** Show column headers */
  showColHeaders: boolean;
  /** Zoom level (1 = 100%) */
  zoom: number;
  /** Tab color */
  tabColor?: string;
  /** Is sheet hidden */
  hidden: boolean;
  /** Is sheet protected */
  protected: boolean;
}

// ============================================================================
// Formula Types
// ============================================================================

export interface FormulaDependency {
  /** Cell that has the formula */
  cell: CellKey;
  /** Cells that this formula depends on */
  dependsOn: Set<CellKey>;
  /** Cells that depend on this cell */
  dependents: Set<CellKey>;
}

export type FormulaError =
  | '#NULL!'
  | '#DIV/0!'
  | '#VALUE!'
  | '#REF!'
  | '#NAME?'
  | '#NUM!'
  | '#N/A'
  | '#SPILL!'
  | '#CALC!'
  | '#GETTING_DATA';

export function isFormulaError(value: unknown): value is FormulaError {
  return typeof value === 'string' && value.startsWith('#') && value.endsWith('!') || value === '#NAME?' || value === '#N/A';
}

// ============================================================================
// Navigation Types
// ============================================================================

export type Direction = 'up' | 'down' | 'left' | 'right';

export type EditMode = 'navigate' | 'enter' | 'edit' | 'point';

export interface NavigationState {
  /** Current edit mode */
  editMode: EditMode;
  /** Is currently editing a cell */
  isEditing: boolean;
  /** The cell being edited */
  editingCell?: CellRef;
  /** Original value before editing (for cancel) */
  originalValue?: string | number | boolean | null;
}

// ============================================================================
// Rendering Types
// ============================================================================

export interface Viewport {
  /** First visible row */
  startRow: number;
  /** Last visible row */
  endRow: number;
  /** First visible column */
  startCol: number;
  /** Last visible column */
  endCol: number;
  /** Scroll position X */
  scrollX: number;
  /** Scroll position Y */
  scrollY: number;
}

export interface RenderCell {
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
  cell: Cell | null;
}

// ============================================================================
// Event Types
// ============================================================================

export interface CellChangeEvent {
  row: number;
  col: number;
  oldValue: Cell | null;
  newValue: Cell | null;
  source: 'user' | 'formula' | 'paste' | 'fill' | 'api';
}

export interface SelectionChangeEvent {
  oldSelection: Selection;
  newSelection: Selection;
}

export interface ScrollEvent {
  scrollX: number;
  scrollY: number;
  viewport: Viewport;
}

// ============================================================================
// Undo/Redo Types
// ============================================================================

export interface UndoAction {
  type: 'cell' | 'row' | 'column' | 'format' | 'multi';
  timestamp: number;
  changes: CellChangeEvent[];
  selectionBefore: Selection;
  selectionAfter: Selection;
}

// ============================================================================
// Constants
// ============================================================================

export const MAX_ROWS = 1_048_576;
export const MAX_COLS = 16_384;
export const DEFAULT_ROW_HEIGHT = 21;
export const DEFAULT_COL_WIDTH = 72;
export const HEADER_HEIGHT = 24;
export const HEADER_WIDTH = 40;
