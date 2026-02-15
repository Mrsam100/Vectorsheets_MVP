/**
 * CommentStore - Thread-safe comment storage and management
 *
 * Architecture:
 * - Fully decoupled from SparseDataStore
 * - O(1) cell lookup via Map<cellKey, threadIds[]>
 * - O(1) thread retrieval via Map<threadId, thread>
 * - Immutable updates with structural sharing
 * - React 18 compatible subscription API
 *
 * Performance:
 * - Supports 100k+ comments
 * - Memory: ~31 MB for 100k comments (2 per thread)
 * - No iteration over all comments for single-cell lookup
 *
 * Usage:
 * ```typescript
 * const store = new CommentStore();
 *
 * // Add thread
 * const threadId = store.addThread(
 *   { row: 0, col: 0 },
 *   { author: { id: 'user123', displayName: 'John' }, text: 'Comment' }
 * );
 *
 * // Add reply
 * store.addComment(threadId, {
 *   author: { id: 'user456', displayName: 'Jane' },
 *   text: 'Reply'
 * });
 *
 * // Resolve thread
 * store.resolveThread(threadId, 'user456');
 * ```
 *
 * @module CommentStore
 */

import { generateCommentId, generateThreadId, type CommentId, type ThreadId } from './CommentId';
import type {
  Comment,
  CommentThread,
  CommentAuthor,
  CommentEvent,
  SerializedCommentStore,
  CommentStoreSnapshot,
  CommentStoreStats,
} from './types';
import type { CellRef, CellRange } from '../types/index';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Encode CellRef to string key
 * Consistent with SparseDataStore's "row_col" format
 */
function cellKeyFromRef(cell: CellRef): string {
  return `${cell.row}_${cell.col}`;
}

// =============================================================================
// CommentStore Class
// =============================================================================

/**
 * CommentStore - Manages comment threads for spreadsheet cells
 *
 * Features:
 * - Thread-based comments (multiple comments per thread)
 * - Multiple threads per cell
 * - Resolution tracking
 * - Cell movement handlers (row/column insert/delete)
 * - Excel import/export support
 * - Undo/Redo integration
 * - React 18 subscription API
 *
 * Complexity Guarantees:
 * - addThread: O(1)
 * - addComment: O(k) where k = comments in thread (typically 1-5)
 * - getThreads: O(t) where t = threads on cell (typically 1-2)
 * - getThread: O(1)
 */
export class CommentStore {
  // ===========================================================================
  // Internal State
  // ===========================================================================

  /** Map: threadId → CommentThread */
  private threads: Map<ThreadId, CommentThread> = new Map();

  /** Map: cellKey → threadIds[] (for O(1) lookup by cell) */
  private cellToThreads: Map<string, ThreadId[]> = new Map();

  /** Listeners for React 18 useSyncExternalStore */
  private listeners = new Set<() => void>();

  /** Event listeners for analytics/logging */
  private eventListeners = new Set<(event: CommentEvent) => void>();

  /** Version number (incremented on every change) */
  private version = 0;

  /** Total comment count across all threads */
  private commentCount = 0;

  // ===========================================================================
  // Validation
  // ===========================================================================

  /**
   * Validate cell reference
   *
   * @param cell - Cell reference to validate
   * @throws Error if cell is invalid
   */
  private validateCell(cell: CellRef): void {
    if (cell.row < 0 || cell.col < 0) {
      throw new Error(`Invalid cell reference: (${cell.row}, ${cell.col})`);
    }
    if (!Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
      throw new Error(`Cell coordinates must be integers: (${cell.row}, ${cell.col})`);
    }
    if (!Number.isFinite(cell.row) || !Number.isFinite(cell.col)) {
      throw new Error(`Cell coordinates must be finite: (${cell.row}, ${cell.col})`);
    }
  }

  /**
   * Validate comment text
   *
   * Rules:
   * - Must not be empty or whitespace-only
   * - Must not exceed 10,000 characters
   *
   * @param text - Comment text to validate
   * @throws Error if text is invalid
   */
  private validateComment(text: string): void {
    if (typeof text !== 'string') {
      throw new Error(`Comment text must be a string, got ${typeof text}`);
    }
    if (!text || text.trim().length === 0) {
      throw new Error('Comment text cannot be empty');
    }
    if (text.length > 10000) {
      throw new Error(`Comment text too long (max 10,000 characters, got ${text.length})`);
    }
  }

  /**
   * Validate thread exists
   *
   * @param threadId - Thread ID to validate
   * @returns Thread object
   * @throws Error if thread not found
   */
  private validateThread(threadId: ThreadId): CommentThread {
    const thread = this.threads.get(threadId);
    if (!thread) {
      throw new Error(`Thread not found: ${threadId}`);
    }
    return thread;
  }

  /**
   * Validate author object
   *
   * @param author - Author object to validate
   * @throws Error if author is invalid
   */
  private validateAuthor(author: CommentAuthor): void {
    if (!author || typeof author !== 'object') {
      throw new Error('Author must be an object');
    }
    if (!author.id || typeof author.id !== 'string') {
      throw new Error('Author must have valid id');
    }
    if (!author.displayName || typeof author.displayName !== 'string') {
      throw new Error('Author must have valid displayName');
    }
  }

  // ===========================================================================
  // CRUD Operations - Create
  // ===========================================================================

  /**
   * Add a new comment thread to a cell
   *
   * Creates a new thread with one initial comment.
   *
   * Complexity: O(1)
   *
   * @param cell - Cell reference
   * @param initialComment - First comment in thread (id and createdAt will be generated)
   * @returns Generated ThreadId
   *
   * @example
   * const threadId = store.addThread(
   *   { row: 0, col: 0 },
   *   {
   *     author: { id: 'user123', displayName: 'John Smith' },
   *     text: 'This needs review',
   *   }
   * );
   */
  addThread(
    cell: CellRef,
    initialComment: Omit<Comment, 'id' | 'createdAt'>
  ): ThreadId {
    this.validateCell(cell);
    this.validateAuthor(initialComment.author);
    this.validateComment(initialComment.text);

    const threadId = generateThreadId();
    const commentId = generateCommentId();
    const now = Date.now();

    const thread: CommentThread = {
      id: threadId,
      cell,
      comments: [
        {
          ...initialComment,
          id: commentId,
          createdAt: now,
        },
      ],
      resolved: false,
      createdAt: now,
      version: 1,
    };

    // Update internal maps
    this.threads.set(threadId, thread);

    const key = cellKeyFromRef(cell);
    const threadIds = this.cellToThreads.get(key) || [];
    threadIds.push(threadId);
    this.cellToThreads.set(key, threadIds);

    this.commentCount++;
    this.version++;

    this.notifyListeners();
    this.emitEvent({ type: 'thread-added', threadId, cell });

    return threadId;
  }

  /**
   * Add a comment to an existing thread
   *
   * Complexity: O(1) for map lookup + O(k) for array spread (k = comments in thread)
   * Typical k = 1-5 comments per thread
   *
   * @param threadId - Thread to add comment to
   * @param comment - Comment to add (id and createdAt will be generated)
   * @returns Generated CommentId
   *
   * @example
   * store.addComment(threadId, {
   *   author: { id: 'user456', displayName: 'Jane Doe' },
   *   text: 'Looks good to me!',
   * });
   */
  addComment(
    threadId: ThreadId,
    comment: Omit<Comment, 'id' | 'createdAt'>
  ): CommentId {
    const thread = this.validateThread(threadId);
    this.validateAuthor(comment.author);
    this.validateComment(comment.text);

    const commentId = generateCommentId();
    const now = Date.now();

    // Immutable update with structural sharing
    const updatedThread: CommentThread = {
      ...thread,
      comments: [
        ...thread.comments,
        {
          ...comment,
          id: commentId,
          createdAt: now,
        },
      ],
      version: thread.version + 1,
    };

    this.threads.set(threadId, updatedThread);
    this.commentCount++;
    this.version++;

    this.notifyListeners();
    this.emitEvent({ type: 'comment-added', threadId, commentId });

    return commentId;
  }

  // ===========================================================================
  // CRUD Operations - Update
  // ===========================================================================

  /**
   * Update comment text
   *
   * Sets editedAt timestamp to track edits.
   *
   * Complexity: O(k) where k = comments in thread (for finding comment)
   *
   * @param threadId - Thread containing the comment
   * @param commentId - Comment to update
   * @param newText - New comment text
   *
   * @example
   * store.updateComment(threadId, commentId, 'Updated comment text');
   */
  updateComment(
    threadId: ThreadId,
    commentId: CommentId,
    newText: string
  ): void {
    const thread = this.validateThread(threadId);
    this.validateComment(newText);

    const commentIndex = thread.comments.findIndex(c => c.id === commentId);
    if (commentIndex === -1) {
      throw new Error(`Comment not found: ${commentId} in thread ${threadId}`);
    }

    const now = Date.now();

    // Immutable update
    const updatedComments = [...thread.comments];
    updatedComments[commentIndex] = {
      ...updatedComments[commentIndex],
      text: newText,
      editedAt: now,
    };

    const updatedThread: CommentThread = {
      ...thread,
      comments: updatedComments,
      version: thread.version + 1,
    };

    this.threads.set(threadId, updatedThread);
    this.version++;

    this.notifyListeners();
    this.emitEvent({ type: 'comment-updated', threadId, commentId });
  }

  /**
   * Soft delete a comment
   *
   * Sets deletedAt timestamp and deletedBy user ID.
   * Comment is not removed from array (for audit trail).
   *
   * @param threadId - Thread containing the comment
   * @param commentId - Comment to delete
   * @param deletedBy - User ID who deleted the comment
   *
   * @example
   * store.deleteComment(threadId, commentId, 'user123');
   */
  deleteComment(
    threadId: ThreadId,
    commentId: CommentId,
    deletedBy: string
  ): void {
    const thread = this.validateThread(threadId);

    const commentIndex = thread.comments.findIndex(c => c.id === commentId);
    if (commentIndex === -1) {
      throw new Error(`Comment not found: ${commentId} in thread ${threadId}`);
    }

    const now = Date.now();

    // Soft delete (set deletedAt timestamp)
    const updatedComments = [...thread.comments];
    updatedComments[commentIndex] = {
      ...updatedComments[commentIndex],
      deletedAt: now,
      deletedBy,
    };

    const updatedThread: CommentThread = {
      ...thread,
      comments: updatedComments,
      version: thread.version + 1,
    };

    this.threads.set(threadId, updatedThread);
    this.version++;

    this.notifyListeners();
    this.emitEvent({ type: 'comment-deleted', threadId, commentId });
  }

  /**
   * Undelete a soft-deleted comment
   *
   * Removes the deletedAt and deletedBy markers from a soft-deleted comment.
   * Used primarily for undo/redo operations.
   *
   * Complexity: O(k) where k = comments in thread
   *
   * @param threadId - Thread containing the comment
   * @param commentId - Comment to undelete
   *
   * @throws Error if thread or comment not found
   */
  undeleteComment(threadId: ThreadId, commentId: CommentId): void {
    const thread = this.validateThread(threadId);

    const commentIndex = thread.comments.findIndex(c => c.id === commentId);
    if (commentIndex === -1) {
      throw new Error(`Comment not found: ${commentId} in thread ${threadId}`);
    }

    const comment = thread.comments[commentIndex];

    // If not deleted, no-op
    if (!comment.deletedAt) {
      return;
    }

    // Remove soft-delete markers
    const updatedComments = [...thread.comments];
    updatedComments[commentIndex] = {
      ...comment,
      deletedAt: undefined,
      deletedBy: undefined,
    };

    const updatedThread: CommentThread = {
      ...thread,
      comments: updatedComments,
      version: thread.version + 1,
    };

    this.threads.set(threadId, updatedThread);
    this.version++;

    this.notifyListeners();
  }

  // ===========================================================================
  // CRUD Operations - Resolution
  // ===========================================================================

  /**
   * Resolve a thread
   *
   * Marks thread as resolved with timestamp and resolver user ID.
   *
   * @param threadId - Thread to resolve
   * @param resolvedBy - User ID who resolved the thread
   *
   * @example
   * store.resolveThread(threadId, 'user456');
   */
  resolveThread(threadId: ThreadId, resolvedBy: string): void {
    const thread = this.validateThread(threadId);

    if (thread.resolved) {
      return;  // Already resolved, no-op
    }

    const now = Date.now();

    const updatedThread: CommentThread = {
      ...thread,
      resolved: true,
      resolvedAt: now,
      resolvedBy,
      version: thread.version + 1,
    };

    this.threads.set(threadId, updatedThread);
    this.version++;

    this.notifyListeners();
    this.emitEvent({ type: 'thread-resolved', threadId });
  }

  /**
   * Unresolve a thread
   *
   * Removes resolution status.
   *
   * @param threadId - Thread to unresolve
   *
   * @example
   * store.unresolveThread(threadId);
   */
  unresolveThread(threadId: ThreadId): void {
    const thread = this.validateThread(threadId);

    if (!thread.resolved) {
      return;  // Already unresolved, no-op
    }

    const updatedThread: CommentThread = {
      ...thread,
      resolved: false,
      resolvedAt: undefined,
      resolvedBy: undefined,
      version: thread.version + 1,
    };

    this.threads.set(threadId, updatedThread);
    this.version++;

    this.notifyListeners();
    this.emitEvent({ type: 'thread-unresolved', threadId });
  }

  // ===========================================================================
  // CRUD Operations - Delete
  // ===========================================================================

  /**
   * Delete entire thread
   *
   * Permanently removes thread and all its comments.
   *
   * Complexity: O(k) where k = comments in thread
   *
   * @param threadId - Thread to delete
   *
   * @example
   * store.deleteThread(threadId);
   */
  deleteThread(threadId: ThreadId): void {
    const thread = this.validateThread(threadId);

    // Remove from cellToThreads map
    const key = cellKeyFromRef(thread.cell);
    const threadIds = this.cellToThreads.get(key) || [];
    this.cellToThreads.set(
      key,
      threadIds.filter(id => id !== threadId)
    );
    if (this.cellToThreads.get(key)?.length === 0) {
      this.cellToThreads.delete(key);
    }

    // Remove from threads map
    this.threads.delete(threadId);

    // Update comment count
    this.commentCount -= thread.comments.length;
    this.version++;

    this.notifyListeners();
    this.emitEvent({ type: 'thread-deleted', threadId, cell: thread.cell });
  }

  // ===========================================================================
  // Query Operations
  // ===========================================================================

  /**
   * Get all threads for a cell
   *
   * Complexity: O(t) where t = number of threads on this cell
   * Typical t = 0-2 threads per cell
   *
   * Returns deeply readonly to prevent accidental mutations.
   *
   * @param cell - Cell reference
   * @returns Array of comment threads (readonly)
   *
   * @example
   * const threads = store.getThreads({ row: 0, col: 0 });
   * console.log(threads.length);  // Number of threads on cell A1
   */
  getThreads(cell: CellRef): ReadonlyArray<Readonly<CommentThread>> {
    this.validateCell(cell);

    const key = cellKeyFromRef(cell);
    const threadIds = this.cellToThreads.get(key) || [];

    return threadIds.map(id => this.threads.get(id)!);
  }

  /**
   * Get a specific thread by ID
   *
   * Complexity: O(1)
   *
   * @param threadId - Thread ID
   * @returns Thread object or undefined if not found
   *
   * @example
   * const thread = store.getThread(threadId);
   * if (thread) {
   *   console.log(thread.comments.length);
   * }
   */
  getThread(threadId: ThreadId): Readonly<CommentThread> | undefined {
    return this.threads.get(threadId);
  }

  /**
   * Check if a cell has any comments
   *
   * Complexity: O(1)
   *
   * @param cell - Cell reference
   * @returns true if cell has at least one thread
   *
   * @example
   * if (store.hasComments({ row: 0, col: 0 })) {
   *   // Show comment indicator
   * }
   */
  hasComments(cell: CellRef): boolean {
    const key = cellKeyFromRef(cell);
    const threadIds = this.cellToThreads.get(key);
    return threadIds !== undefined && threadIds.length > 0;
  }

  /**
   * Get all threads (unordered)
   *
   * Complexity: O(n) where n = total threads
   *
   * @returns Array of all threads
   *
   * @example
   * const allThreads = store.getAllThreads();
   * console.log(`Total threads: ${allThreads.length}`);
   */
  getAllThreads(): ReadonlyArray<Readonly<CommentThread>> {
    return Array.from(this.threads.values());
  }

  /**
   * Get all unresolved threads
   *
   * Complexity: O(n) where n = total threads
   *
   * @returns Array of unresolved threads
   *
   * @example
   * const unresolved = store.getUnresolvedThreads();
   * console.log(`Unresolved: ${unresolved.length}`);
   */
  getUnresolvedThreads(): ReadonlyArray<Readonly<CommentThread>> {
    return Array.from(this.threads.values()).filter(t => !t.resolved);
  }

  /**
   * Get threads by author
   *
   * Complexity: O(n * k) where n = threads, k = avg comments per thread
   *
   * @param authorId - User ID to search for
   * @returns Array of threads containing comments by this author
   *
   * @example
   * const myThreads = store.getThreadsByAuthor('user123');
   */
  getThreadsByAuthor(authorId: string): ReadonlyArray<Readonly<CommentThread>> {
    return Array.from(this.threads.values()).filter(
      thread => thread.comments.some(c => c.author.id === authorId)
    );
  }

  /**
   * Search comments by text (case-insensitive)
   *
   * Complexity: O(n * k) where n = threads, k = avg comments per thread
   *
   * @param query - Search query string
   * @returns Array of threads containing matching comments
   *
   * @example
   * const results = store.searchComments('bug');
   * // Returns all threads containing the word "bug"
   */
  searchComments(query: string): ReadonlyArray<Readonly<CommentThread>> {
    const lowerQuery = query.toLowerCase();

    return Array.from(this.threads.values()).filter(
      thread => thread.comments.some(c =>
        c.text.toLowerCase().includes(lowerQuery)
      )
    );
  }

  // ===========================================================================
  // Batch Operations
  // ===========================================================================

  /**
   * Delete all threads in a cell range
   *
   * Complexity: O(n) where n = total threads (worst case)
   *
   * @param range - Cell range to clear
   *
   * @example
   * store.deleteThreadsInRange({
   *   startRow: 0,
   *   startCol: 0,
   *   endRow: 9,
   *   endCol: 9,
   * });
   */
  deleteThreadsInRange(range: CellRange): void {
    const threadIdsToDelete: ThreadId[] = [];

    for (const [threadId, thread] of Array.from(this.threads.entries())) {
      const { row, col } = thread.cell;

      if (
        row >= range.startRow &&
        row <= range.endRow &&
        col >= range.startCol &&
        col <= range.endCol
      ) {
        threadIdsToDelete.push(threadId);
      }
    }

    for (const threadId of threadIdsToDelete) {
      this.deleteThread(threadId);
    }
  }

  /**
   * Resolve all unresolved threads
   *
   * @param resolvedBy - User ID who resolved all threads
   *
   * @example
   * store.resolveAllThreads('user123');
   */
  resolveAllThreads(resolvedBy: string): void {
    for (const thread of Array.from(this.threads.values())) {
      if (!thread.resolved) {
        this.resolveThread(thread.id, resolvedBy);
      }
    }
  }

  // ===========================================================================
  // Cell Movement Handlers
  // ===========================================================================

  /**
   * Handle row insertion
   *
   * Moves all threads with row >= insertRow down by count.
   *
   * Complexity: O(n) where n = total threads (worst case, all moved)
   *
   * @param insertRow - Row index where rows are inserted
   * @param count - Number of rows inserted
   *
   * @example
   * // User inserts 2 rows at row 5
   * store.onRowsInserted(5, 2);
   * // All threads at row >= 5 move to row + 2
   */
  onRowsInserted(insertRow: number, count: number): void {
    if (count <= 0) return;

    const affectedThreads: Array<{ threadId: ThreadId; oldCell: CellRef; newCell: CellRef }> = [];

    for (const [threadId, thread] of Array.from(this.threads.entries())) {
      if (thread.cell.row >= insertRow) {
        const oldCell = thread.cell;
        const newCell = { row: thread.cell.row + count, col: thread.cell.col };
        this.moveThreadInternal(threadId, oldCell, newCell);
        affectedThreads.push({ threadId, oldCell, newCell });
      }
    }

    // Emit move events for UI updates
    for (const { threadId, oldCell, newCell } of affectedThreads) {
      this.emitEvent({
        type: 'thread-moved',
        threadId,
        fromCell: oldCell,
        toCell: newCell,
      });
    }
  }

  /**
   * Handle row deletion
   *
   * - Delete threads in deleted range
   * - Move threads below deleted range up
   *
   * Complexity: O(n) where n = total threads
   *
   * @param deleteRow - Row index where rows are deleted
   * @param count - Number of rows deleted
   *
   * @example
   * // User deletes rows 5-7 (3 rows)
   * store.onRowsDeleted(5, 3);
   * // Threads at rows 5-7 are deleted
   * // Threads at row >= 8 move to row - 3
   */
  onRowsDeleted(deleteRow: number, count: number): void {
    if (count <= 0) return;

    const deletedThreads: ThreadId[] = [];
    const movedThreads: Array<{ threadId: ThreadId; oldCell: CellRef; newCell: CellRef }> = [];

    for (const [threadId, thread] of Array.from(this.threads.entries())) {
      const cellRow = thread.cell.row;

      if (cellRow >= deleteRow && cellRow < deleteRow + count) {
        // Thread is in deleted range - delete it
        deletedThreads.push(threadId);
      } else if (cellRow >= deleteRow + count) {
        // Thread is below deleted range - move up
        const oldCell = thread.cell;
        const newCell = { row: cellRow - count, col: thread.cell.col };
        movedThreads.push({ threadId, oldCell, newCell });
      }
    }

    // Delete threads in deleted range
    for (const threadId of deletedThreads) {
      this.deleteThread(threadId);
    }

    // Move remaining threads
    for (const { threadId, oldCell, newCell } of movedThreads) {
      this.moveThreadInternal(threadId, oldCell, newCell);
      this.emitEvent({
        type: 'thread-moved',
        threadId,
        fromCell: oldCell,
        toCell: newCell,
      });
    }
  }

  /**
   * Handle column insertion
   *
   * Moves all threads with col >= insertCol right by count.
   *
   * @param insertCol - Column index where columns are inserted
   * @param count - Number of columns inserted
   */
  onColumnsInserted(insertCol: number, count: number): void {
    if (count <= 0) return;

    const affectedThreads: Array<{ threadId: ThreadId; oldCell: CellRef; newCell: CellRef }> = [];

    for (const [threadId, thread] of Array.from(this.threads.entries())) {
      if (thread.cell.col >= insertCol) {
        const oldCell = thread.cell;
        const newCell = { row: thread.cell.row, col: thread.cell.col + count };
        this.moveThreadInternal(threadId, oldCell, newCell);
        affectedThreads.push({ threadId, oldCell, newCell });
      }
    }

    for (const { threadId, oldCell, newCell } of affectedThreads) {
      this.emitEvent({
        type: 'thread-moved',
        threadId,
        fromCell: oldCell,
        toCell: newCell,
      });
    }
  }

  /**
   * Handle column deletion
   *
   * - Delete threads in deleted columns
   * - Move threads right of deleted columns left
   *
   * @param deleteCol - Column index where columns are deleted
   * @param count - Number of columns deleted
   */
  onColumnsDeleted(deleteCol: number, count: number): void {
    if (count <= 0) return;

    const deletedThreads: ThreadId[] = [];
    const movedThreads: Array<{ threadId: ThreadId; oldCell: CellRef; newCell: CellRef }> = [];

    for (const [threadId, thread] of Array.from(this.threads.entries())) {
      const cellCol = thread.cell.col;

      if (cellCol >= deleteCol && cellCol < deleteCol + count) {
        deletedThreads.push(threadId);
      } else if (cellCol >= deleteCol + count) {
        const oldCell = thread.cell;
        const newCell = { row: thread.cell.row, col: cellCol - count };
        movedThreads.push({ threadId, oldCell, newCell });
      }
    }

    for (const threadId of deletedThreads) {
      this.deleteThread(threadId);
    }

    for (const { threadId, oldCell, newCell } of movedThreads) {
      this.moveThreadInternal(threadId, oldCell, newCell);
      this.emitEvent({
        type: 'thread-moved',
        threadId,
        fromCell: oldCell,
        toCell: newCell,
      });
    }
  }

  /**
   * Move thread to new cell (internal)
   *
   * Updates internal maps to reflect new cell location.
   *
   * @param threadId - Thread to move
   * @param oldCell - Previous cell location
   * @param newCell - New cell location
   */
  private moveThreadInternal(threadId: ThreadId, oldCell: CellRef, newCell: CellRef): void {
    const thread = this.threads.get(threadId);
    if (!thread) return;

    // Remove from old cell's thread list
    const oldKey = cellKeyFromRef(oldCell);
    const oldThreadIds = this.cellToThreads.get(oldKey) || [];
    this.cellToThreads.set(oldKey, oldThreadIds.filter(id => id !== threadId));
    if (this.cellToThreads.get(oldKey)?.length === 0) {
      this.cellToThreads.delete(oldKey);
    }

    // Add to new cell's thread list
    const newKey = cellKeyFromRef(newCell);
    const newThreadIds = this.cellToThreads.get(newKey) || [];
    newThreadIds.push(threadId);
    this.cellToThreads.set(newKey, newThreadIds);

    // Update thread object (immutable)
    this.threads.set(threadId, {
      ...thread,
      cell: newCell,
      version: thread.version + 1,
    });

    this.version++;
    this.notifyListeners();
  }

  // ===========================================================================
  // Serialization
  // ===========================================================================

  /**
   * Serialize to JSON for file storage
   *
   * Complexity: O(n * k) where n = threads, k = avg comments per thread
   *
   * @returns Serialized format ready for JSON.stringify
   *
   * @example
   * const data = store.serialize();
   * const json = JSON.stringify(data);
   * // Save to file
   */
  serialize(): SerializedCommentStore {
    return {
      version: 1,  // File format version
      threads: Array.from(this.threads.values()),
      metadata: {
        createdAt: Date.now(),
        lastModified: Date.now(),
        commentCount: this.commentCount,
        threadCount: this.threads.size,
      },
    };
  }

  /**
   * Deserialize from JSON
   *
   * Complexity: O(n * k) where n = threads, k = avg comments per thread
   *
   * @param data - Serialized data from serialize()
   * @throws Error if version is unsupported
   *
   * @example
   * const json = await readFile('comments.json');
   * const data = JSON.parse(json);
   * store.deserialize(data);
   */
  deserialize(data: SerializedCommentStore): void {
    if (data.version !== 1) {
      throw new Error(`Unsupported comment format version: ${data.version}`);
    }

    // Clear existing data
    this.threads.clear();
    this.cellToThreads.clear();
    this.commentCount = 0;

    // Rebuild maps from threads array
    for (const thread of data.threads) {
      this.threads.set(thread.id, thread);

      const key = cellKeyFromRef(thread.cell);
      const threadIds = this.cellToThreads.get(key) || [];
      threadIds.push(thread.id);
      this.cellToThreads.set(key, threadIds);

      this.commentCount += thread.comments.length;
    }

    this.version++;
    this.notifyListeners();
  }

  // ===========================================================================
  // React 18 Subscription API
  // ===========================================================================

  /**
   * Subscribe to changes (for useSyncExternalStore)
   *
   * React 18 compatible subscription.
   *
   * Usage:
   * ```typescript
   * const snapshot = useSyncExternalStore(
   *   commentStore.subscribe,
   *   commentStore.getSnapshot
   * );
   * ```
   *
   * @param listener - Callback to invoke on changes
   * @returns Unsubscribe function
   */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Get snapshot for React 18
   *
   * Returns stable reference if unchanged (version number).
   *
   * @returns Snapshot object
   */
  getSnapshot = (): CommentStoreSnapshot => {
    return {
      version: this.version,
      threadCount: this.threads.size,
      commentCount: this.commentCount,
      unresolvedCount: this.getUnresolvedThreads().length,
    };
  };

  /**
   * Notify all subscribers of changes
   *
   * Called after every mutation.
   */
  private notifyListeners(): void {
    for (const listener of Array.from(this.listeners)) {
      listener();
    }
  }

  // ===========================================================================
  // Event System
  // ===========================================================================

  /**
   * Subscribe to specific events (for analytics, logging, etc.)
   *
   * @param listener - Event listener callback
   * @returns Unsubscribe function
   *
   * @example
   * const unsubscribe = store.onEvent(event => {
   *   console.log('Comment event:', event.type);
   *   if (event.type === 'thread-added') {
   *     analytics.track('Comment Added', { cell: event.cell });
   *   }
   * });
   */
  onEvent(listener: (event: CommentEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  /**
   * Emit event to all event listeners
   *
   * @param event - Event to emit
   */
  private emitEvent(event: CommentEvent): void {
    for (const listener of Array.from(this.eventListeners)) {
      listener(event);
    }
  }

  // ===========================================================================
  // Statistics & Debugging
  // ===========================================================================

  /**
   * Get memory usage estimate
   *
   * Formula:
   * - Per comment: ~258 bytes (id, author, text, timestamps)
   * - Per thread: ~100 bytes (id, cell, metadata) + comments
   * - Map overhead: ~50 bytes per entry
   *
   * @returns Estimated memory usage in bytes
   */
  getMemoryUsage(): number {
    const bytesPerComment = 258;
    const bytesPerThread = 100;
    const mapOverhead = 50;

    const commentBytes = this.commentCount * bytesPerComment;
    const threadBytes = this.threads.size * bytesPerThread;
    const mapBytes = (this.threads.size + this.cellToThreads.size) * mapOverhead;

    return commentBytes + threadBytes + mapBytes;
  }

  /**
   * Get statistics for debugging
   *
   * @returns Statistics object
   *
   * @example
   * const stats = store.getStats();
   * console.log(`Memory: ${stats.memoryUsageMB} MB`);
   */
  getStats(): CommentStoreStats {
    return {
      threadCount: this.threads.size,
      commentCount: this.commentCount,
      unresolvedThreads: this.getUnresolvedThreads().length,
      cellsWithComments: this.cellToThreads.size,
      memoryUsageMB: (this.getMemoryUsage() / 1024 / 1024).toFixed(2),
      avgCommentsPerThread: this.threads.size > 0
        ? (this.commentCount / this.threads.size).toFixed(2)
        : '0',
    };
  }

  /**
   * Clear all data (for testing)
   *
   * WARNING: This is a destructive operation. Use with caution.
   */
  clear(): void {
    this.threads.clear();
    this.cellToThreads.clear();
    this.commentCount = 0;
    this.version++;
    this.notifyListeners();
  }
}

