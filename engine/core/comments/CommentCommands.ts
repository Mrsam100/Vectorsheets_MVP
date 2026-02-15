/**
 * Comment System - Undo/Redo Commands
 *
 * Production-ready undo/redo support for comment operations using the Command Pattern.
 *
 * Command Types:
 * - AddThreadCommand: Add new comment thread to cell
 * - AddCommentCommand: Add reply to existing thread
 * - UpdateCommentCommand: Edit comment text
 * - ResolveThreadCommand: Resolve/unresolve thread
 * - DeleteThreadCommand: Delete entire thread
 *
 * Design:
 * - Commands store before/after state for full reversibility
 * - Deep cloning prevents reference corruption
 * - Memory size estimation for history management
 * - Consistent with UndoRedoManager's Command interface
 *
 * @module CommentCommands
 */

import { Command, OperationType } from '../history/UndoRedoManager.js';
import type { CommentStore } from './CommentStore.js';
import type { CommentThread, Comment, CommentAuthor } from './types.js';
import type { ThreadId, CommentId } from './CommentId.js';
import type { CellRef } from '../types/index.js';

// =============================================================================
// Helper: Generate Command ID
// =============================================================================

let commentCommandIdCounter = 0;

function generateCommentCommandId(): string {
  return `comment_cmd_${++commentCommandIdCounter}_${Date.now()}`;
}

// =============================================================================
// AddThreadCommand - Add new comment thread
// =============================================================================

/**
 * Command to add a new comment thread to a cell.
 *
 * Apply: Create thread with initial comment
 * Revert: Delete the created thread
 *
 * Memory: ~600 bytes (thread + 1 comment)
 */
export class AddThreadCommand implements Command {
  readonly id: string;
  readonly type: OperationType = 'custom';
  readonly description: string;
  readonly timestamp: number;

  private commentStore: CommentStore;
  private cell: CellRef;
  private initialComment: {
    author: CommentAuthor;
    text: string;
  };
  private threadId: ThreadId | null = null; // Captured during apply

  constructor(
    commentStore: CommentStore,
    cell: CellRef,
    initialComment: {
      author: CommentAuthor;
      text: string;
    }
  ) {
    this.id = generateCommentCommandId();
    this.timestamp = Date.now();
    this.description = `Add comment to ${this.cellToAddress(cell)}`;
    this.commentStore = commentStore;
    this.cell = { ...cell }; // Clone
    this.initialComment = {
      author: { ...initialComment.author },
      text: initialComment.text,
    };
  }

  apply(): void {
    // Add thread (CommentStore generates ID)
    this.threadId = this.commentStore.addThread(this.cell, this.initialComment);
  }

  revert(): void {
    if (!this.threadId) {
      throw new Error('Cannot revert AddThreadCommand: threadId not set');
    }
    // Delete the thread we created
    this.commentStore.deleteThread(this.threadId);
  }

  getMemorySize(): number {
    // Thread overhead + comment
    // ~577 bytes per thread (with 2 comments avg), we have 1 comment
    return 600;
  }

  private cellToAddress(cell: CellRef): string {
    const col = String.fromCharCode(65 + cell.col);
    return `${col}${cell.row + 1}`;
  }
}

// =============================================================================
// AddCommentCommand - Add reply to existing thread
// =============================================================================

/**
 * Command to add a reply to an existing comment thread.
 *
 * Apply: Add comment to thread
 * Revert: Delete the added comment
 *
 * Memory: ~258 bytes (1 comment)
 */
export class AddCommentCommand implements Command {
  readonly id: string;
  readonly type: OperationType = 'custom';
  readonly description: string;
  readonly timestamp: number;

  private commentStore: CommentStore;
  private threadId: ThreadId;
  private commentData: {
    author: CommentAuthor;
    text: string;
  };
  private commentId: CommentId | null = null; // Captured during apply
  private userId: string; // For soft delete on revert

  constructor(
    commentStore: CommentStore,
    threadId: ThreadId,
    commentData: {
      author: CommentAuthor;
      text: string;
    },
    userId: string
  ) {
    this.id = generateCommentCommandId();
    this.timestamp = Date.now();
    this.description = `Add reply to thread`;
    this.commentStore = commentStore;
    this.threadId = threadId;
    this.commentData = {
      author: { ...commentData.author },
      text: commentData.text,
    };
    this.userId = userId;
  }

  apply(): void {
    // Add comment to thread (CommentStore generates ID)
    this.commentId = this.commentStore.addComment(this.threadId, this.commentData);
  }

  revert(): void {
    if (!this.commentId) {
      throw new Error('Cannot revert AddCommentCommand: commentId not set');
    }
    // Delete the comment we added (soft delete)
    this.commentStore.deleteComment(this.threadId, this.commentId, this.userId);
  }

  getMemorySize(): number {
    // Single comment: ~258 bytes
    return 258;
  }
}

// =============================================================================
// UpdateCommentCommand - Edit comment text
// =============================================================================

/**
 * Command to update a comment's text.
 *
 * Apply: Set comment to new text
 * Revert: Restore comment to old text
 *
 * Memory: ~200 bytes (old + new text)
 */
export class UpdateCommentCommand implements Command {
  readonly id: string;
  readonly type: OperationType = 'custom';
  readonly description: string;
  readonly timestamp: number;

  private commentStore: CommentStore;
  private threadId: ThreadId;
  private commentId: CommentId;
  private oldText: string;
  private newText: string;

  constructor(
    commentStore: CommentStore,
    threadId: ThreadId,
    commentId: CommentId,
    oldText: string,
    newText: string
  ) {
    this.id = generateCommentCommandId();
    this.timestamp = Date.now();
    this.description = `Edit comment`;
    this.commentStore = commentStore;
    this.threadId = threadId;
    this.commentId = commentId;
    this.oldText = oldText;
    this.newText = newText;
  }

  apply(): void {
    this.commentStore.updateComment(this.threadId, this.commentId, this.newText);
  }

  revert(): void {
    this.commentStore.updateComment(this.threadId, this.commentId, this.oldText);
  }

  getMemorySize(): number {
    // old + new text (2 bytes per char)
    return (this.oldText.length + this.newText.length) * 2;
  }
}

// =============================================================================
// ResolveThreadCommand - Resolve/unresolve thread
// =============================================================================

/**
 * Command to resolve or unresolve a comment thread.
 *
 * Apply: Set resolution status to newState
 * Revert: Restore resolution status to oldState
 *
 * Memory: ~50 bytes (minimal state)
 */
export class ResolveThreadCommand implements Command {
  readonly id: string;
  readonly type: OperationType = 'custom';
  readonly description: string;
  readonly timestamp: number;

  private commentStore: CommentStore;
  private threadId: ThreadId;
  private userId: string;
  private oldState: boolean; // Was resolved before?
  private newState: boolean; // Should be resolved after?

  constructor(
    commentStore: CommentStore,
    threadId: ThreadId,
    userId: string,
    oldState: boolean,
    newState: boolean
  ) {
    this.id = generateCommentCommandId();
    this.timestamp = Date.now();
    this.description = newState ? `Resolve thread` : `Unresolve thread`;
    this.commentStore = commentStore;
    this.threadId = threadId;
    this.userId = userId;
    this.oldState = oldState;
    this.newState = newState;
  }

  apply(): void {
    if (this.newState) {
      this.commentStore.resolveThread(this.threadId, this.userId);
    } else {
      this.commentStore.unresolveThread(this.threadId);
    }
  }

  revert(): void {
    if (this.oldState) {
      this.commentStore.resolveThread(this.threadId, this.userId);
    } else {
      this.commentStore.unresolveThread(this.threadId);
    }
  }

  getMemorySize(): number {
    // Minimal state: thread ID + user ID + 2 booleans
    return 50;
  }
}

// =============================================================================
// DeleteThreadCommand - Delete entire thread
// =============================================================================

/**
 * Command to delete a comment thread.
 *
 * Apply: Delete thread
 * Revert: Restore thread from snapshot
 *
 * Memory: ~577 bytes (full thread snapshot)
 */
export class DeleteThreadCommand implements Command {
  readonly id: string;
  readonly type: OperationType = 'custom';
  readonly description: string;
  readonly timestamp: number;

  private commentStore: CommentStore;
  private threadId: ThreadId;
  private threadSnapshot: CommentThread | null = null; // Captured before delete

  constructor(commentStore: CommentStore, threadId: ThreadId) {
    this.id = generateCommentCommandId();
    this.timestamp = Date.now();
    this.description = `Delete comment thread`;
    this.commentStore = commentStore;
    this.threadId = threadId;

    // Capture snapshot BEFORE deletion
    const thread = this.commentStore.getThread(threadId);
    if (thread) {
      this.threadSnapshot = this.deepCloneThread(thread);
    }
  }

  apply(): void {
    this.commentStore.deleteThread(this.threadId);
  }

  revert(): void {
    if (!this.threadSnapshot) {
      throw new Error('Cannot revert DeleteThreadCommand: no snapshot');
    }

    // Restore thread by re-adding it
    // Strategy: Add thread with first comment, then add remaining comments
    const snapshot = this.threadSnapshot;

    if (snapshot.comments.length === 0) {
      throw new Error('Cannot restore thread with no comments');
    }

    // Add thread with first comment
    const firstComment = snapshot.comments[0];
    const restoredThreadId = this.commentStore.addThread(snapshot.cell, {
      author: firstComment.author,
      text: firstComment.text,
    });

    // Add remaining comments
    for (let i = 1; i < snapshot.comments.length; i++) {
      const comment = snapshot.comments[i];
      this.commentStore.addComment(restoredThreadId, {
        author: comment.author,
        text: comment.text,
      });
    }

    // Restore resolution state
    if (snapshot.resolved && snapshot.resolvedBy) {
      this.commentStore.resolveThread(restoredThreadId, snapshot.resolvedBy);
    }

    // NOTE: We cannot restore exact IDs or timestamps.
    // This is acceptable for undo/redo - the logical state is preserved.
  }

  getMemorySize(): number {
    if (!this.threadSnapshot) return 0;

    // Thread overhead + comments
    // ~577 bytes per thread (2 comments avg)
    const commentCount = this.threadSnapshot.comments.length;
    return 100 + commentCount * 258; // Base + comments
  }

  /**
   * Deep clone a thread to prevent reference corruption
   */
  private deepCloneThread(thread: CommentThread): CommentThread {
    return {
      id: thread.id,
      cell: { ...thread.cell },
      comments: thread.comments.map(comment => ({
        id: comment.id,
        author: { ...comment.author },
        text: comment.text,
        createdAt: comment.createdAt,
        editedAt: comment.editedAt,
        deletedAt: comment.deletedAt,
        deletedBy: comment.deletedBy,
      })),
      resolved: thread.resolved,
      resolvedAt: thread.resolvedAt,
      resolvedBy: thread.resolvedBy,
      createdAt: thread.createdAt,
      version: thread.version,
    };
  }
}

// =============================================================================
// DeleteCommentCommand - Delete single comment (soft delete)
// =============================================================================

/**
 * Command to delete a single comment from a thread.
 *
 * Apply: Soft-delete the comment
 * Revert: Restore the comment
 *
 * Memory: ~258 bytes (comment snapshot)
 */
export class DeleteCommentCommand implements Command {
  readonly id: string;
  readonly type: OperationType = 'custom';
  readonly description: string;
  readonly timestamp: number;

  private commentStore: CommentStore;
  private threadId: ThreadId;
  private commentId: CommentId;
  private userId: string;
  private commentSnapshot: Comment | null = null;

  constructor(
    commentStore: CommentStore,
    threadId: ThreadId,
    commentId: CommentId,
    userId: string
  ) {
    this.id = generateCommentCommandId();
    this.timestamp = Date.now();
    this.description = `Delete comment`;
    this.commentStore = commentStore;
    this.threadId = threadId;
    this.commentId = commentId;
    this.userId = userId;

    // Capture comment state before deletion
    const thread = this.commentStore.getThread(threadId);
    if (thread) {
      const comment = thread.comments.find(c => c.id === commentId);
      if (comment) {
        this.commentSnapshot = {
          id: comment.id,
          author: { ...comment.author },
          text: comment.text,
          createdAt: comment.createdAt,
          editedAt: comment.editedAt,
          deletedAt: comment.deletedAt,
          deletedBy: comment.deletedBy,
        };
      }
    }
  }

  apply(): void {
    this.commentStore.deleteComment(this.threadId, this.commentId, this.userId);
  }

  revert(): void {
    if (!this.commentSnapshot) {
      throw new Error('Cannot revert DeleteCommentCommand: no snapshot');
    }

    // Undelete the soft-deleted comment
    this.commentStore.undeleteComment(this.threadId, this.commentId);
  }

  getMemorySize(): number {
    // Single comment: ~258 bytes
    return 258;
  }
}
