/**
 * VectorSheet Engine - Editing Module Exports
 */

export { EditModeManager } from './EditModeManager.js';
export type {
  EditState,
  EditModeManagerEvents,
  HandleKeyResult,
} from './EditModeManager.js';

export { FormulaAutoComplete, FUNCTION_LIBRARY } from './FormulaAutoComplete.js';
export type {
  FunctionInfo,
  FunctionArg,
  AutoCompleteSuggestion,
  AutoCompleteState,
  FunctionCallInfo,
  FormulaContext,
  FunctionSuggestion,
  ArgumentHint,
} from './FormulaAutoComplete.js';
