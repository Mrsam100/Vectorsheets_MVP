/**
 * VectorSheet Engine - Data Module Exports
 */

export { SparseDataStore } from './SparseDataStore.js';
export type {
  DataStoreStats,
} from './SparseDataStore.js';

export { MergeManager, createMergeManager } from './MergeManager.js';
export type {
  MergeInfo,
  MergeResult,
  UnmergeResult,
  MergeManagerEvents,
} from './MergeManager.js';
