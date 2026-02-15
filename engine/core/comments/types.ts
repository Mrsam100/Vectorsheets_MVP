/**
 * Comment System Types
 *
 * Type hierarchy:
 * - CommentAuthor: User information
 * - Comment: Single comment with text, author, timestamps
 * - CommentThread: Thread of comments attached to a cell
 * - CommentEvent: Events emitted by CommentStore
 * - SerializedCommentStore: JSON format for file storage
 * - CommentStoreSnapshot: React 18 useSyncExternalStore snapshot
 *
 * @module types
 */

import type { CellRef, CellRange } from '../types/index';
import type { CommentId, ThreadId } from './CommentId';

// =============================================================================
// Core Types
// =============================================================================

/**
 * Comment author with full user information
 *
 * Design: Rich author model for multi-user scenarios
 * - id: Unique user identifier (for permissions, filtering)
 * - displayName: Human-readable name shown in UI
 * - avatarUrl: Profile picture (optional)
 * - email: For notifications (optional, privacy-sensitive)
 */
export interface CommentAuthor {
  /** Unique user identifier */
  id: string;

  /** Display name (e.g., "John Smith") */
  displayName: string;

  /** Profile picture URL (optional) */
  avatarUrl?: string;

  /** Email address (optional, for notifications) */
  email?: string;
}

/**
 * Single comment within a thread
 *
 * Features:
 * - Edit tracking (editedAt timestamp)
 * - Soft delete (deletedAt, deletedBy)
 * - Full author information
 *
 * Memory: ~258 bytes per comment
 * - id: 36 bytes (UUID string)
 * - author: ~106 bytes (id + displayName + avatarUrl)
 * - text: ~100 bytes (average)
 * - timestamps: 24 bytes (createdAt + editedAt + deletedAt)
 */
export interface Comment {
  /** Unique comment ID */
  id: CommentId;

  /** Author information */
  author: CommentAuthor;

  /** Comment text content (max 10,000 characters) */
  text: string;

  /** Creation timestamp (milliseconds since epoch) */
  createdAt: number;

  /** Last edit timestamp (undefined if never edited) */
  editedAt?: number;

  /** Soft delete timestamp (undefined if not deleted) */
  deletedAt?: number;

  /** User who deleted this comment (user ID) */
  deletedBy?: string;
}

/**
 * Thread of comments attached to a cell
 *
 * Design:
 * - Flat comment array (not nested replies for v1.0)
 * - Version number for conflict resolution in multi-user scenarios
 * - Resolution tracking (resolved, resolvedAt, resolvedBy)
 *
 * Memory: ~577 bytes per thread (with 2 comments avg)
 * - id: 36 bytes
 * - cell: 8 bytes
 * - comments: Array overhead + 2 * 258 = 516 bytes
 * - metadata: 17 bytes
 */
export interface CommentThread {
  /** Unique thread ID */
  id: ThreadId;

  /** Cell this thread is attached to */
  cell: CellRef;

  /** All comments in chronological order */
  comments: Comment[];

  /** Is this thread resolved? */
  resolved: boolean;

  /** When was thread resolved? */
  resolvedAt?: number;

  /** Who resolved this thread? (user ID) */
  resolvedBy?: string;

  /** Thread creation timestamp */
  createdAt: number;

  /**
   * Version number for conflict resolution
   * Incremented on every modification
   * Used for optimistic locking in multi-user scenarios
   */
  version: number;
}

// =============================================================================
// Events
// =============================================================================

/**
 * Event types emitted by CommentStore
 *
 * Used for:
 * - Analytics tracking
 * - Logging
 * - Real-time sync in multi-user mode (future)
 * - UI notifications
 *
 * Design: Discriminated union for type safety
 */
export type CommentEvent =
  | { type: 'thread-added'; threadId: ThreadId; cell: CellRef }
  | { type: 'comment-added'; threadId: ThreadId; commentId: CommentId }
  | { type: 'comment-updated'; threadId: ThreadId; commentId: CommentId }
  | { type: 'comment-deleted'; threadId: ThreadId; commentId: CommentId }
  | { type: 'thread-resolved'; threadId: ThreadId }
  | { type: 'thread-unresolved'; threadId: ThreadId }
  | { type: 'thread-deleted'; threadId: ThreadId; cell: CellRef }
  | { type: 'thread-moved'; threadId: ThreadId; fromCell: CellRef; toCell: CellRef };

// =============================================================================
// Serialization
// =============================================================================

/**
 * Serialized format for file storage
 *
 * Design:
 * - Version number for future migrations
 * - Flat threads array (Maps don't serialize to JSON)
 * - Metadata for validation and stats
 *
 * File size estimate:
 * - 100k comments (50k threads): ~31 MB JSON
 * - Compresses well (gzip: ~10-15 MB)
 */
export interface SerializedCommentStore {
  /** File format version (current: 1) */
  version: number;

  /** All threads (flat array for JSON serialization) */
  threads: CommentThread[];

  /** Metadata for validation */
  metadata: {
    /** When was this file created? */
    createdAt: number;

    /** Last modification timestamp */
    lastModified: number;

    /** Total comment count (for validation) */
    commentCount: number;

    /** Total thread count (for validation) */
    threadCount: number;
  };
}

// =============================================================================
// React 18 Subscription
// =============================================================================

/**
 * Snapshot for React 18 useSyncExternalStore
 *
 * Design:
 * - Lightweight (no full data copy)
 * - Stable reference when unchanged (version number)
 * - Enough info for UI to decide if re-render needed
 *
 * Usage:
 * ```typescript
 * const snapshot = useSyncExternalStore(
 *   commentStore.subscribe,
 *   commentStore.getSnapshot
 * );
 *
 * // Re-renders only when snapshot.version changes
 * ```
 */
export interface CommentStoreSnapshot {
  /** Incremented on every change (enables stable reference) */
  version: number;

  /** Total number of threads */
  threadCount: number;

  /** Total number of comments (across all threads) */
  commentCount: number;

  /** Number of unresolved threads */
  unresolvedCount: number;
}

// =============================================================================
// Query Filters
// =============================================================================

/**
 * Filter options for querying comments
 *
 * Used by search and filter APIs (future enhancement)
 */
export interface CommentFilter {
  /** Filter by author ID */
  authorId?: string;

  /** Filter by resolution status */
  resolved?: boolean;

  /** Filter by date range */
  dateRange?: {
    start: number;
    end: number;
  };

  /** Filter by cell range */
  cellRange?: CellRange;

  /** Text search query (case-insensitive) */
  textQuery?: string;
}

// =============================================================================
// Permissions (Future Enhancement)
// =============================================================================

/**
 * Permission model for multi-user scenarios
 *
 * Phase 1 (v1.0): Not used (all users have full access)
 * Phase 2 (v2.0): Inject custom permission checks
 *
 * Example:
 * ```typescript
 * const permissions: CommentPermissions = {
 *   canAddComment: () => true,
 *   canEditComment: (userId, comment) => userId === comment.author.id,
 *   canDeleteComment: (userId) => isAdmin(userId),
 *   canResolveThread: () => true,
 * };
 * ```
 */
export interface CommentPermissions {
  /** Can user add comment to this cell? */
  canAddComment: (userId: string, cell: CellRef) => boolean;

  /** Can user edit this comment? */
  canEditComment: (userId: string, comment: Comment) => boolean;

  /** Can user delete this comment? */
  canDeleteComment: (userId: string, comment: Comment) => boolean;

  /** Can user resolve/unresolve this thread? */
  canResolveThread: (userId: string, thread: CommentThread) => boolean;
}

/**
 * Default permissions: All users can do everything
 */
export const defaultPermissions: CommentPermissions = {
  canAddComment: () => true,
  canEditComment: () => true,
  canDeleteComment: () => true,
  canResolveThread: () => true,
};

// =============================================================================
// Excel Compatibility Types
// =============================================================================

/**
 * Excel comment format (simplified)
 *
 * Excel's actual XML format is more complex, but this captures
 * the essential data for import/export.
 */
export interface ExcelComment {
  /** Cell reference (e.g., A1, B5) */
  ref: CellRef;

  /** Author ID (Excel's numeric author index) */
  authorId: number;

  /** Author name */
  authorName: string;

  /** Comment text (plain text or rich text XML) */
  text: string | ExcelRichText;

  /** Creation time (not in Excel format, added during import) */
  createdAt?: number;
}

/**
 * Excel rich text format (simplified)
 */
export interface ExcelRichText {
  /** Text runs with formatting */
  runs: Array<{
    text: string;
    bold?: boolean;
    italic?: boolean;
    fontSize?: number;
    fontFamily?: string;
  }>;
}

// =============================================================================
// Statistics
// =============================================================================

/**
 * CommentStore statistics for debugging and monitoring
 */
export interface CommentStoreStats {
  /** Total number of threads */
  threadCount: number;

  /** Total number of comments */
  commentCount: number;

  /** Number of unresolved threads */
  unresolvedThreads: number;

  /** Number of cells with comments */
  cellsWithComments: number;

  /** Estimated memory usage (MB) */
  memoryUsageMB: string;

  /** Average comments per thread */
  avgCommentsPerThread: string;
}
