/**
 * Editing Layer Components
 *
 * Production-grade cell editing system for spreadsheet interaction.
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                         EDITING ARCHITECTURE                            │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │                                                                         │
 * │   Engine Layer (Single Source of Truth)                                 │
 * │   ┌───────────────────────────────────────────────────────────────────┐ │
 * │   │                    EditModeManager                                │ │
 * │   │  - Mode: navigate | edit | enter | point                          │ │
 * │   │  - Edit buffer, cursor position, text selection                   │ │
 * │   │  - Formula detection and parsing                                  │ │
 * │   └───────────────────────────────────────────────────────────────────┘ │
 * │                              │                                          │
 * │                              │ events                                   │
 * │                              ▼                                          │
 * │   UI Layer (React Subscription)                                         │
 * │   ┌───────────────────────────────────────────────────────────────────┐ │
 * │   │                      useEditMode Hook                             │ │
 * │   │  - Subscribes to EditModeManager                                  │ │
 * │   │  - Provides state and actions to components                       │ │
 * │   │  - Handles React state synchronization                            │ │
 * │   └─────────────────────┬───────────────────┬─────────────────────────┘ │
 * │                         │                   │                           │
 * │               ┌─────────▼─────────┐ ┌───────▼─────────┐                │
 * │               │ CellEditorOverlay │ │   FormulaBar    │                │
 * │               │                   │ │                 │                │
 * │               │ - Over active cell│ │ - Always visible│                │
 * │               │ - Captures keys   │ │ - Function hints│                │
 * │               │ - IME support     │ │ - Name box      │                │
 * │               └───────────────────┘ └─────────────────┘                │
 * │                                                                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Usage:
 * ```tsx
 * import { useEditMode, CellEditorOverlay, FormulaBar } from './editing';
 *
 * function SpreadsheetGrid() {
 *   const { state, actions, manager } = useEditMode({
 *     onCommit: (cell, value) => engine.setCell(cell.row, cell.col, value),
 *   });
 *
 *   return (
 *     <>
 *       <FormulaBar
 *         state={state}
 *         actions={actions}
 *         activeCellAddress={formatAddress(activeRow, activeCol)}
 *         activeCellValue={getCellValue(activeRow, activeCol)}
 *       />
 *       <GridArea>
 *         {state.isEditing && state.editingCell && (
 *           <CellEditorOverlay
 *             state={state}
 *             actions={actions}
 *             cellPosition={getCellPosition(state.editingCell)}
 *           />
 *         )}
 *       </GridArea>
 *     </>
 *   );
 * }
 * ```
 */

// =============================================================================
// Hook
// =============================================================================

export {
  useEditMode,
  EditModeManager,
} from './useEditMode';

export type {
  EditModeState,
  EditModeActions,
  UseEditModeOptions,
  UseEditModeReturn,
  EditState,
  EditMode,
  CellRef,
} from './useEditMode';

// =============================================================================
// Components
// =============================================================================

export {
  CellEditorOverlay,
} from './CellEditorOverlay';

export type {
  CellEditorOverlayProps,
} from './CellEditorOverlay';

export {
  FormulaBar,
} from './FormulaBar';

export type {
  FormulaBarProps,
  FunctionHint,
} from './FormulaBar';

// =============================================================================
// Integration
// =============================================================================

export {
  useEditModeIntegration,
} from './useEditModeIntegration';

export type {
  EditModeIntegrationOptions,
  EditModeIntegrationResult,
} from './useEditModeIntegration';

// =============================================================================
// Formula Auto-Complete
// =============================================================================

export {
  useFormulaAutoComplete,
  FormulaAutoComplete,
} from './useFormulaAutoComplete';

export type {
  FormulaAutoCompleteState,
  FormulaAutoCompleteActions,
  AcceptResult,
  UseFormulaAutoCompleteOptions,
  UseFormulaAutoCompleteReturn,
  FormulaContext,
  FunctionSuggestion,
  ArgumentHint,
} from './useFormulaAutoComplete';

export {
  FormulaHintsPanel,
} from './FormulaHintsPanel';

export type {
  FormulaHintsPanelProps,
} from './FormulaHintsPanel';

// =============================================================================
// Point Mode (Formula Reference Selection)
// =============================================================================

export {
  usePointMode,
  formatCellRef,
  formatRangeRef,
} from './usePointMode';

export type {
  PointModeState,
  PointModeActions,
  UsePointModeReturn,
} from './usePointMode';

export {
  FormulaReferenceHighlight,
  parseFormulaReferences,
  getReferenceColor,
  REFERENCE_COLORS,
  columnToIndex,
  parseReference,
} from './FormulaReferenceHighlight';

export type {
  CellReference,
  PointModeState as ReferenceHighlightPointMode,
  FormulaReferenceHighlightProps,
} from './FormulaReferenceHighlight';
