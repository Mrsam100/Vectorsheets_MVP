/**
 * VectorSheet Engine - Navigation Module Exports
 */

// NavigationManager
export {
  NavigationManager,
  createNavigationManager,
  createDataProviderAdapter,
} from './NavigationManager.js';

export type {
  NavigationDataProvider,
  NavigationAction,
  NavigationConfig,
  MoveOptions,
  JumpOptions,
  NavigationResult,
  NavigationEvents,
} from './NavigationManager.js';

// KeyboardHandler
export {
  KeyboardHandler,
  createKeyboardHandler,
  createIntentDispatcher,
  getModifiers,
} from './KeyboardHandler.js';

export type {
  // Event interfaces
  KeyboardEvent,
  MouseEvent,

  // Intent types
  BaseIntent,
  NavigateIntent,
  PageIntent,
  HomeEndIntent,
  TabEnterIntent,
  GoToIntent,
  SelectionIntent,
  CellClickIntent,
  EditIntent,
  ClipboardIntent,
  HistoryIntent,
  DeleteIntent,
  FormatIntent,
  DialogIntent,
  FileIntent,
  EscapeIntent,
  UnknownIntent,
  SpreadsheetIntent,
  IntentType,

  // Configuration types
  ModifierState,
  KeyCombo,
  Keybinding,
  KeyboardHandlerConfig,

  // Listener types
  IntentListener,
  TypedIntentListener,

  // Legacy compatibility
  KeyboardHandlerCallbacks,
  LegacyNavigationAdapter,
  LegacySelectionAdapter,
} from './KeyboardHandler.js';

// Re-export SpreadsheetKeyboardEvent for backward compatibility
export type { KeyboardEvent as SpreadsheetKeyboardEvent } from './KeyboardHandler.js';
