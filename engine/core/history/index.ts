/**
 * VectorSheet Engine - History Module Exports
 */

export {
  UndoRedoManager,
  createUndoRedoManager,
  createCustomCommand,
  createBatchCommand,
  CellSnapshotCommand,
  BatchCommandImpl,
  CustomCommand,
} from './UndoRedoManager.js';

export type {
  // Core Command types
  Command,
  BatchCommand,
  // Operation types
  OperationType,
  CellSnapshot,
  Operation,
  BatchOperation,
  // State & Events
  UndoRedoState,
  UndoRedoEvents,
  UndoRedoConfig,
  // Mutation target interface
  MutationTarget,
} from './UndoRedoManager.js';
