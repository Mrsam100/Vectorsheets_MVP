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

// ============================================================================
// Rich Text Types (Character-Level Formatting)
// ============================================================================

/**
 * Character format (subset of CellFormat for per-character formatting)
 * Used within FormattedText for character-level styling
 */
export interface CharacterFormat {
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
}

/**
 * Format run - a text range with consistent character formatting
 * Used to represent character-level formatting within a cell
 */
export interface FormatRun {
  /** Start index in text (inclusive, 0-based) */
  start: number;
  /** End index in text (exclusive) */
  end: number;
  /** Format for this text range */
  format?: CharacterFormat;
}

/**
 * Rich text value with character-level formatting
 * Enables Excel-compatible mixed formatting within a single cell
 * Example: "Good morning" with "Good " (normal) + "morning" (bold)
 */
export interface FormattedText {
  /** Type discriminator for type guards */
  _type: 'FormattedText';
  /** Plain text content */
  text: string;
  /** Format runs (sorted, non-overlapping character ranges) */
  runs: FormatRun[];
}

/**
 * Type guard for FormattedText
 */
export function isFormattedText(value: unknown): value is FormattedText {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_type' in value &&
    (value as FormattedText)._type === 'FormattedText'
  );
}

/**
 * Convert Cell.value to plain value (extract text from FormattedText)
 * Used for operations that don't support rich text (formulas, find/replace, etc.)
 */
export function valueToPlainValue(
  value: string | number | boolean | FormattedText | null
): string | number | boolean | null {
  if (isFormattedText(value)) {
    return value.text;
  }
  return value;
}

export interface Cell {
  /** Raw value (what user entered or formula result) */
  value: string | number | boolean | FormattedText | null;
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
// Edit Session Types (Character-Level Editing State)
// ============================================================================

/**
 * Edit session state - single source of truth for all editing operations.
 * Owned exclusively by EditModeManager.
 *
 * @remarks
 * This interface unifies editing between CellEditorOverlay and FormulaBar,
 * ensuring they always stay in sync with zero duplication.
 *
 * Design principles:
 * - Immutable: All updates create a new EditSession object
 * - Complete: Contains all state needed for editing (text, cursor, IME, etc.)
 * - Observable: Components subscribe via useSyncExternalStore
 * - Excel-compatible: Supports formula editing, point mode, absolute refs
 *
 * @example
 * ```typescript
 * // Subscribe to edit session in React component
 * const editSession = useSyncExternalStore(
 *   editModeManager.subscribe,
 *   editModeManager.getSnapshot
 * );
 *
 * // Check if editing
 * if (editSession) {
 *   console.log('Editing cell:', editSession.editingCell);
 *   console.log('Current text:', editSession.text);
 * }
 * ```
 */
export interface EditSession {
  // ===== Core Edit State =====

  /** Current edit text (what user is typing) */
  text: string;

  /**
   * Formatted value during editing (for character-level formatting).
   * If null, editing plain text (use text field).
   * If set, this is the actual editing value with format runs.
   */
  formattedValue: FormattedText | null;

  /** Cursor position (0-based index into text) */
  cursor: number;

  /** Selection start (for text selection, -1 if none) */
  selectionStart: number;

  /** Selection end (for text selection, -1 if none) */
  selectionEnd: number;

  /** Current edit mode */
  mode: EditMode;

  // ===== Cell Context =====

  /** Which cell is being edited (null if not editing) */
  editingCell: CellRef | null;

  /** Original cell value before editing (for cancel/undo) */
  originalValue: string | number | boolean | FormattedText | null;

  /** Has text been modified from original value? */
  isDirty: boolean;

  // ===== Formula Editing =====

  /** Is this a formula? (text starts with '=') */
  isFormula: boolean;

  /**
   * Referenced cells for highlighting (e.g., =A1+B2 → [A1, B2])
   * Used to draw blue borders around referenced cells during formula editing
   */
  referencedCells: CellRef[];

  // ===== IME Composition (for CJK input) =====

  /**
   * Is IME composition active? (e.g., typing Japanese hiragana)
   * When true, don't trigger recalculation or formula parsing
   */
  isComposing: boolean;

  /** Composition range start (index into text) */
  compositionStart: number;

  /** Composition range end (index into text) */
  compositionEnd: number;

  // ===== Character Formatting =====

  /**
   * Pending character format to apply on next text insert.
   * Used for Excel-like toolbar behavior (toggle Bold when no selection).
   */
  pendingFormat?: Partial<CharacterFormat>;
}

/**
 * Edit session subscriber callback.
 * Called when EditSession changes.
 * Compatible with React's useSyncExternalStore.
 */
export type EditSessionSubscriber = () => void;

/**
 * Edit session unsubscribe function.
 * Call this to stop receiving EditSession change notifications.
 */
export type EditSessionUnsubscribe = () => void;

/**
 * Type guard to check if currently editing
 */
export function isEditingSession(session: EditSession | null): session is EditSession {
  return session !== null && session.editingCell !== null;
}

/**
 * Helper to check if edit session has a text selection
 */
export function hasTextSelection(session: EditSession): boolean {
  return session.selectionStart !== -1 && session.selectionEnd !== -1 && session.selectionStart !== session.selectionEnd;
}

/**
 * Helper to get selected text from edit session
 */
export function getSelectedText(session: EditSession): string {
  if (!hasTextSelection(session)) return '';
  const start = Math.min(session.selectionStart, session.selectionEnd);
  const end = Math.max(session.selectionStart, session.selectionEnd);
  return session.text.slice(start, end);
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
