/**
 * VectorSheet Engine - Core Module Exports
 *
 * This is the main entry point for the VectorSheet spreadsheet engine.
 */

// Main Engine
export { SpreadsheetEngine } from './SpreadsheetEngine.js';
export type {
  SpreadsheetEngineConfig,
  SpreadsheetEngineEvents,
} from './SpreadsheetEngine.js';

// Types - export all
export * from './types/index.js';

// Data Store
export { SparseDataStore } from './data/SparseDataStore.js';
export type { DataStoreStats } from './data/SparseDataStore.js';

// Formula Engine
export { DependencyGraph } from './formula/DependencyGraph.js';
export type { DependencyInfo, CircularReferenceError } from './formula/DependencyGraph.js';
export {
  parseFormulaReferences,
  parseCellReference,
  cellToReference,
  containsVolatileFunction,
} from './formula/DependencyGraph.js';
export { FormulaEngine, createSimpleEvaluator } from './formula/FormulaEngine.js';
export type {
  FormulaValue,
  CalculationProgress,
  CalculationResult,
  CalculationProgressCallback,
  FormulaEvaluator,
} from './formula/FormulaEngine.js';

// Virtual Rendering
export { VirtualRenderer } from './rendering/VirtualRenderer.js';
export type { ViewportConfig, RowPosition, ColPosition } from './rendering/VirtualRenderer.js';

// Selection Management
export { SelectionManager } from './selection/SelectionManager.js';
export type { SelectionBounds } from './selection/SelectionManager.js';

// Navigation & Keyboard
export {
  NavigationManager,
  createNavigationManager,
  createDataProviderAdapter,
} from './navigation/NavigationManager.js';
export type {
  NavigationDataProvider,
  NavigationAction,
  NavigationConfig,
  MoveOptions,
  MoveOptions as NavigationOptions,  // Deprecated alias
  JumpOptions,
  NavigationResult,
  NavigationEvents,
} from './navigation/NavigationManager.js';

export {
  KeyboardHandler,
  createKeyboardHandler,
  createIntentDispatcher,
  getModifiers,
} from './navigation/KeyboardHandler.js';
export type {
  KeyboardEvent as SpreadsheetKeyboardEvent,
  KeyboardHandlerCallbacks,
  SpreadsheetIntent,
  IntentType,
  IntentDefinition,
  IntentListener,
  NavigateIntent,
  EditIntent,
  ClipboardIntent,
  SelectionIntent,
  KeyboardHandlerConfig,
  Keybinding,
  KeyCombo,
  ModifierState,
} from './navigation/KeyboardHandler.js';

// Editing
export { EditModeManager } from './editing/EditModeManager.js';
export type {
  EditState,
  EditModeManagerEvents,
  HandleKeyResult,
} from './editing/EditModeManager.js';
export { FormulaAutoComplete, FUNCTION_LIBRARY } from './editing/FormulaAutoComplete.js';
export type {
  FunctionInfo,
  FunctionArg,
  AutoCompleteSuggestion,
  AutoCompleteState,
  FunctionCallInfo,
  FormulaContext,
  FunctionSuggestion,
  ArgumentHint,
} from './editing/FormulaAutoComplete.js';

// Clipboard & Fill
export { ClipboardManager } from './clipboard/ClipboardManager.js';
export type {
  ClipboardCell,
  ClipboardData,
  PasteType,
  PasteOperation,
  PasteOptions,
  ClipboardManagerEvents,
} from './clipboard/ClipboardManager.js';
export { FillSeries } from './clipboard/FillSeries.js';
export type {
  FillDirection,
  SeriesType,
  DateUnit,
  FillOptions,
  DetectedPattern,
} from './clipboard/FillSeries.js';
export { FillHandle } from './clipboard/FillHandle.js';
export type {
  FillHandleState,
  FillHandlePosition,
  FillHandleEvents,
} from './clipboard/FillHandle.js';

// Formatting & Styles
export { FormatPainter, applyFormatToRange, clearFormatFromRange } from './formatting/FormatPainter.js';
export type {
  CopiedFormat,
  FormatPainterState,
  FormatPainterEvents,
} from './formatting/FormatPainter.js';

export { MergeManager } from './formatting/MergeManager.js';
export type {
  MergedRegion,
  MergeManagerEvents,
} from './formatting/MergeManager.js';

export { ConditionalFormatting } from './formatting/ConditionalFormatting.js';
export type {
  RuleType,
  ComparisonOperator,
  TextOperator,
  DateOperator,
  TopBottomType,
  TopBottomUnit,
  ConditionalFormatRule,
  RuleConfig,
  CellValueConfig,
  TopBottomConfig,
  TextConfig,
  DateConfig,
  ColorScaleConfig,
  DataBarConfig,
  IconSetConfig,
  FormulaConfig,
  ComputedCellFormat,
} from './formatting/ConditionalFormatting.js';

export { NumberFormat, numberFormat, BUILTIN_FORMATS } from './formatting/NumberFormat.js';
export type {
  FormatResult,
  ParsedFormat,
  FormatSection,
  FormatToken,
} from './formatting/NumberFormat.js';

// History (Undo/Redo)
export { UndoRedoManager } from './history/UndoRedoManager.js';
export type {
  OperationType,
  CellSnapshot,
  Operation,
  BatchOperation,
  UndoRedoState,
  UndoRedoEvents,
  UndoRedoConfig,
} from './history/UndoRedoManager.js';

// Operations (Find/Replace, Sort/Filter)
export { FindReplace } from './operations/FindReplace.js';
export type {
  SearchScope,
  SearchIn,
  SearchDirection,
  FindOptions,
  ReplaceOptions,
  FindResult,
  FindAllResult,
  ReplaceResult,
  ReplaceAllResult,
  FindReplaceState,
  FindReplaceEvents,
} from './operations/FindReplace.js';

export { SortFilter, createSortFilter, createSortFilterWithWriter } from './operations/SortFilter.js';
export type {
  SortOrder,
  SortRule,
  SortOptions,
  SortResult,
  FilterOperator,
  FilterType,
  FilterCondition,
  ColumnFilter,
  Filter,
  AutoFilterState,
  FilterResult,
  FilterEvents,
  SortFilterDataReader,
  SortFilterDataWriter,
} from './operations/SortFilter.js';

// Data Validation
export { DataValidation, createDataValidation } from './validation/DataValidation.js';
export type {
  ValidationType,
  ValidationOperator,
  ErrorStyle,
  RuleID,
  ValidationRuleConfig,
  ValidationRule,
  ValidationResult,
  DataValidationEvents,
  FormulaEvaluator as ValidationFormulaEvaluator,
} from './validation/DataValidation.js';
