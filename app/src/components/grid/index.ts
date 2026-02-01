/**
 * Grid Components
 *
 * Production-grade virtualized grid system for spreadsheet rendering.
 *
 * Architecture:
 * - Render Contract: Engine produces RenderFrame, UI renders DOM
 * - Intent Model: UI emits SpreadsheetIntents, never mutates state directly
 * - Selection: Managed via IntentHandler
 * - No spreadsheet logic in UI layer
 */

// Types - the render contract
export * from './types';

// Context
export { GridProvider, useGridContext } from './GridContext';
export type { GridContextValue } from './GridContext';

// Components
export { CornerCell } from './CornerCell';
export { ColumnHeaders } from './ColumnHeaders';
export { RowHeaders } from './RowHeaders';
export { CellLayer } from './CellLayer';
export { SelectionOverlay } from './SelectionOverlay';
export type { SelectionOverlayProps } from './SelectionOverlay';
export { FillHandleOverlay } from './FillHandleOverlay';
export type { FillHandleOverlayProps } from './FillHandleOverlay';
export { FormatPainterOverlay } from './FormatPainterOverlay';
export type { FormatPainterOverlayProps } from './FormatPainterOverlay';

// Interaction handling
export { PointerAdapter, usePointerAdapter } from './PointerAdapter';
export type { SpreadsheetIntent as PointerIntent } from './PointerAdapter';
export { IntentHandler, useIntentHandler } from './IntentHandler';
export type { IntentResult, DragState, SpreadsheetIntent } from './IntentHandler';
export { useKeyboardAdapter } from './KeyboardAdapter';
export type { KeyboardIntent } from './KeyboardAdapter';

// Auto-scroll
export {
  AutoScrollController,
  useAutoScroll,
  calculateScrollToCell,
} from './AutoScrollController';
export type {
  ScrollDirection,
  ScrollState,
  ViewportBounds,
  ScrollLimits,
  AutoScrollConfig,
  EdgeDetectionResult,
} from './AutoScrollController';

// Editing
export {
  useEditMode,
  EditModeManager,
  CellEditorOverlay,
  FormulaBar,
  formatCellAddress,
  columnToLetter,
  useEditModeIntegration,
} from './editing';
export type {
  EditModeState,
  EditModeActions,
  UseEditModeOptions,
  UseEditModeReturn,
  EditState,
  EditMode,
  CellRef,
  CellEditorOverlayProps,
  FormulaBarProps,
  FunctionHint,
  EditModeIntegrationOptions,
  EditModeIntegrationResult,
} from './editing';
