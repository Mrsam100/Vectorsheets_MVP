/**
 * Comment System - Public API
 *
 * Production-ready comment threading system for VectorSheet.
 *
 * Features:
 * - Multiple threads per cell
 * - Multiple comments per thread
 * - Excel import/export compatibility
 * - Cell movement handling
 * - Undo/Redo support
 * - React 18 subscription API
 *
 * @example
 * ```typescript
 * import { CommentStore } from './comments';
 *
 * const store = new CommentStore();
 *
 * // Add thread
 * const threadId = store.addThread(
 *   { row: 0, col: 0 },
 *   {
 *     author: { id: 'user123', displayName: 'John Smith' },
 *     text: 'This needs review',
 *   }
 * );
 *
 * // Add reply
 * store.addComment(threadId, {
 *   author: { id: 'user456', displayName: 'Jane Doe' },
 *   text: 'Looks good!',
 * });
 *
 * // Resolve thread
 * store.resolveThread(threadId, 'user456');
 * ```
 *
 * @module comments
 */

// =============================================================================
// Main Store
// =============================================================================

export { CommentStore } from './CommentStore';

// =============================================================================
// Undo/Redo Commands
// =============================================================================

export {
  AddThreadCommand,
  AddCommentCommand,
  UpdateCommentCommand,
  ResolveThreadCommand,
  DeleteThreadCommand,
  DeleteCommentCommand,
} from './CommentCommands.js';

// =============================================================================
// ID Generation
// =============================================================================

export {
  generateCommentId,
  generateThreadId,
  getIdTimestamp,
  compareIds,
  isValidId,
  isCommentId,
  isThreadId,
  type CommentId,
  type ThreadId,
} from './CommentId';

// =============================================================================
// Types
// =============================================================================

export type {
  CommentAuthor,
  Comment,
  CommentThread,
  CommentEvent,
  SerializedCommentStore,
  CommentStoreSnapshot,
  CommentFilter,
  CommentPermissions,
  ExcelComment,
  ExcelRichText,
  CommentStoreStats,
} from './types';

export { defaultPermissions } from './types';

// =============================================================================
// Excel Compatibility
// =============================================================================

export {
  ExcelCommentMapper,
  escapeHtml,
  unescapeHtml,
} from './ExcelCommentMapper';
