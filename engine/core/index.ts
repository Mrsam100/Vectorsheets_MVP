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
export { NavigationManager } from './navigation/NavigationManager.js';
export type { NavigationOptions } from './navigation/NavigationManager.js';
export { KeyboardHandler } from './navigation/KeyboardHandler.js';
export type {
  KeyboardEvent as SpreadsheetKeyboardEvent,
  KeyboardHandlerCallbacks,
} from './navigation/KeyboardHandler.js';
