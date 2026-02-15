/**
 * CommentCommands Tests
 *
 * Test suite for undo/redo command pattern implementation.
 *
 * Coverage:
 * - AddThreadCommand (add/revert)
 * - AddCommentCommand (add/revert)
 * - UpdateCommentCommand (update/revert)
 * - ResolveThreadCommand (resolve/unresolve)
 * - DeleteThreadCommand (delete/restore)
 * - DeleteCommentCommand (soft-delete/undelete)
 * - Memory size estimation
 * - Command metadata (id, type, description, timestamp)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CommentStore } from './CommentStore';
import {
  AddThreadCommand,
  AddCommentCommand,
  UpdateCommentCommand,
  ResolveThreadCommand,
  DeleteThreadCommand,
  DeleteCommentCommand,
} from './CommentCommands';
import type { CommentAuthor, ThreadId, CommentId } from './types';
import type { CellRef } from '../types/index';

describe('AddThreadCommand', () => {
  let store: CommentStore;
  let author: CommentAuthor;
  let cell: CellRef;

  beforeEach(() => {
    store = new CommentStore();
    author = { id: 'user1', displayName: 'Test User' };
    cell = { row: 5, col: 10 };
  });

  it('should add thread on apply', () => {
    const command = new AddThreadCommand(store, cell, {
      author,
      text: 'Test comment',
    });

    command.apply();

    const threads = store.getThreads(cell);
    expect(threads).toHaveLength(1);
    expect(threads[0].comments[0].text).toBe('Test comment');
  });

  it('should delete thread on revert', () => {
    const command = new AddThreadCommand(store, cell, {
      author,
      text: 'Test comment',
    });

    command.apply();
    expect(store.getThreads(cell)).toHaveLength(1);

    command.revert();
    expect(store.getThreads(cell)).toHaveLength(0);
  });

  it('should support redo after revert', () => {
    const command = new AddThreadCommand(store, cell, {
      author,
      text: 'Test',
    });

    command.apply();
    command.revert();
    command.apply(); // Redo

    const threads = store.getThreads(cell);
    expect(threads).toHaveLength(1);
    expect(threads[0].comments[0].text).toBe('Test');
  });

  it('should have valid command metadata', () => {
    const command = new AddThreadCommand(store, cell, {
      author,
      text: 'Test',
    });

    expect(command.id).toBeDefined();
    expect(command.type).toBe('custom');
    expect(command.description).toContain('Add comment to');
    expect(command.timestamp).toBeGreaterThan(0);
  });

  it('should estimate memory size', () => {
    const command = new AddThreadCommand(store, cell, {
      author,
      text: 'Test',
    });

    const memorySize = command.getMemorySize();
    expect(memorySize).toBe(600); // Thread + 1 comment overhead
  });

  it('should throw on revert before apply', () => {
    const command = new AddThreadCommand(store, cell, {
      author,
      text: 'Test',
    });

    expect(() => {
      command.revert();
    }).toThrow('threadId not set');
  });
});

describe('AddCommentCommand', () => {
  let store: CommentStore;
  let author: CommentAuthor;
  let threadId: ThreadId;

  beforeEach(() => {
    store = new CommentStore();
    author = { id: 'user1', displayName: 'Test User' };

    // Create initial thread
    threadId = store.addThread({ row: 0, col: 0 }, {
      author,
      text: 'Initial comment',
    });
  });

  it('should add comment on apply', () => {
    const command = new AddCommentCommand(
      store,
      threadId,
      {
        author,
        text: 'Reply comment',
      },
      'user1'
    );

    command.apply();

    const thread = store.getThread(threadId)!;
    expect(thread.comments).toHaveLength(2);
    expect(thread.comments[1].text).toBe('Reply comment');
  });

  it('should soft-delete comment on revert', () => {
    const command = new AddCommentCommand(
      store,
      threadId,
      {
        author,
        text: 'Reply',
      },
      'user1'
    );

    command.apply();
    const commentsBefore = store.getThread(threadId)!.comments.length;

    command.revert();

    const thread = store.getThread(threadId)!;
    expect(thread.comments).toHaveLength(commentsBefore); // Still there (soft delete)
    expect(thread.comments[1].deletedAt).toBeGreaterThan(0);
    expect(thread.comments[1].deletedBy).toBe('user1');
  });

  it('should support redo after revert', () => {
    const command = new AddCommentCommand(
      store,
      threadId,
      {
        author,
        text: 'Reply',
      },
      'user1'
    );

    command.apply();
    command.revert();
    command.apply(); // Redo

    const thread = store.getThread(threadId)!;
    expect(thread.comments).toHaveLength(3); // Initial + deleted + new
  });

  it('should estimate memory size', () => {
    const command = new AddCommentCommand(
      store,
      threadId,
      {
        author,
        text: 'Reply',
      },
      'user1'
    );

    const memorySize = command.getMemorySize();
    expect(memorySize).toBe(258); // Single comment
  });
});

describe('UpdateCommentCommand', () => {
  let store: CommentStore;
  let author: CommentAuthor;
  let threadId: ThreadId;
  let commentId: CommentId;

  beforeEach(() => {
    store = new CommentStore();
    author = { id: 'user1', displayName: 'Test User' };

    threadId = store.addThread({ row: 0, col: 0 }, {
      author,
      text: 'Original text',
    });
    commentId = store.getThread(threadId)!.comments[0].id;
  });

  it('should update comment text on apply', () => {
    const command = new UpdateCommentCommand(
      store,
      threadId,
      commentId,
      'Original text',
      'Updated text'
    );

    command.apply();

    const thread = store.getThread(threadId)!;
    expect(thread.comments[0].text).toBe('Updated text');
    expect(thread.comments[0].editedAt).toBeGreaterThan(0);
  });

  it('should restore original text on revert', () => {
    const command = new UpdateCommentCommand(
      store,
      threadId,
      commentId,
      'Original text',
      'Updated text'
    );

    command.apply();
    expect(store.getThread(threadId)!.comments[0].text).toBe('Updated text');

    command.revert();
    expect(store.getThread(threadId)!.comments[0].text).toBe('Original text');
  });

  it('should support multiple undo/redo cycles', () => {
    const command = new UpdateCommentCommand(
      store,
      threadId,
      commentId,
      'Original',
      'Updated'
    );

    command.apply();
    command.revert();
    command.apply();
    command.revert();

    expect(store.getThread(threadId)!.comments[0].text).toBe('Original');
  });

  it('should estimate memory size based on text length', () => {
    const oldText = 'Short';
    const newText = 'A much longer text that takes more memory';

    const command = new UpdateCommentCommand(
      store,
      threadId,
      commentId,
      oldText,
      newText
    );

    const memorySize = command.getMemorySize();
    expect(memorySize).toBe((oldText.length + newText.length) * 2);
  });
});

describe('ResolveThreadCommand', () => {
  let store: CommentStore;
  let author: CommentAuthor;
  let threadId: ThreadId;

  beforeEach(() => {
    store = new CommentStore();
    author = { id: 'user1', displayName: 'Test User' };

    threadId = store.addThread({ row: 0, col: 0 }, {
      author,
      text: 'Test comment',
    });
  });

  it('should resolve thread on apply (when newState=true)', () => {
    const command = new ResolveThreadCommand(
      store,
      threadId,
      'user1',
      false, // oldState
      true   // newState
    );

    command.apply();

    const thread = store.getThread(threadId)!;
    expect(thread.resolved).toBe(true);
    expect(thread.resolvedBy).toBe('user1');
  });

  it('should unresolve thread on apply (when newState=false)', () => {
    // First resolve it
    store.resolveThread(threadId, 'user1');

    const command = new ResolveThreadCommand(
      store,
      threadId,
      'user1',
      true,  // oldState
      false  // newState
    );

    command.apply();

    const thread = store.getThread(threadId)!;
    expect(thread.resolved).toBe(false);
    expect(thread.resolvedBy).toBeUndefined();
  });

  it('should restore original state on revert', () => {
    const command = new ResolveThreadCommand(
      store,
      threadId,
      'user1',
      false,
      true
    );

    command.apply();
    expect(store.getThread(threadId)!.resolved).toBe(true);

    command.revert();
    expect(store.getThread(threadId)!.resolved).toBe(false);
  });

  it('should handle already-resolved thread', () => {
    store.resolveThread(threadId, 'user1');

    const command = new ResolveThreadCommand(
      store,
      threadId,
      'user2',
      true,
      true
    );

    command.apply(); // Should work (no-op in store)
    expect(store.getThread(threadId)!.resolved).toBe(true);
  });

  it('should have minimal memory footprint', () => {
    const command = new ResolveThreadCommand(
      store,
      threadId,
      'user1',
      false,
      true
    );

    const memorySize = command.getMemorySize();
    expect(memorySize).toBe(50); // Minimal state
  });

  it('should have descriptive command description', () => {
    const resolveCommand = new ResolveThreadCommand(
      store,
      threadId,
      'user1',
      false,
      true
    );
    expect(resolveCommand.description).toBe('Resolve thread');

    const unresolveCommand = new ResolveThreadCommand(
      store,
      threadId,
      'user1',
      true,
      false
    );
    expect(unresolveCommand.description).toBe('Unresolve thread');
  });
});

describe('DeleteThreadCommand', () => {
  let store: CommentStore;
  let author: CommentAuthor;
  let threadId: ThreadId;

  beforeEach(() => {
    store = new CommentStore();
    author = { id: 'user1', displayName: 'Test User' };

    threadId = store.addThread({ row: 0, col: 0 }, {
      author,
      text: 'Test comment',
    });
  });

  it('should delete thread on apply', () => {
    const command = new DeleteThreadCommand(store, threadId);

    command.apply();

    expect(store.getThread(threadId)).toBeUndefined();
    expect(store.getThreads({ row: 0, col: 0 })).toHaveLength(0);
  });

  it('should restore thread on revert', () => {
    const command = new DeleteThreadCommand(store, threadId);

    command.apply();
    expect(store.getThread(threadId)).toBeUndefined();

    command.revert();

    // Thread is restored (new ID but same content)
    const threads = store.getThreads({ row: 0, col: 0 });
    expect(threads).toHaveLength(1);
    expect(threads[0].comments[0].text).toBe('Test comment');
  });

  it('should capture thread snapshot in constructor', () => {
    const command = new DeleteThreadCommand(store, threadId);

    // Delete the thread directly
    store.deleteThread(threadId);

    // Command should still be able to restore from snapshot
    command.revert();

    const threads = store.getThreads({ row: 0, col: 0 });
    expect(threads).toHaveLength(1);
  });

  it('should restore multi-comment thread', () => {
    store.addComment(threadId, {
      author,
      text: 'Second comment',
    });
    store.addComment(threadId, {
      author,
      text: 'Third comment',
    });

    const command = new DeleteThreadCommand(store, threadId);

    command.apply();
    command.revert();

    const threads = store.getThreads({ row: 0, col: 0 });
    expect(threads[0].comments).toHaveLength(3);
    expect(threads[0].comments[0].text).toBe('Test comment');
    expect(threads[0].comments[1].text).toBe('Second comment');
    expect(threads[0].comments[2].text).toBe('Third comment');
  });

  it('should restore resolved state', () => {
    store.resolveThread(threadId, 'user1');

    const command = new DeleteThreadCommand(store, threadId);

    command.apply();
    command.revert();

    const threads = store.getThreads({ row: 0, col: 0 });
    expect(threads[0].resolved).toBe(true);
  });

  it('should estimate memory size based on thread size', () => {
    // Add more comments to increase memory
    store.addComment(threadId, {
      author,
      text: 'Comment 2',
    });

    const command = new DeleteThreadCommand(store, threadId);

    const memorySize = command.getMemorySize();
    expect(memorySize).toBe(100 + 2 * 258); // Base + 2 comments
  });
});

describe('DeleteCommentCommand', () => {
  let store: CommentStore;
  let author: CommentAuthor;
  let threadId: ThreadId;
  let commentId: CommentId;

  beforeEach(() => {
    store = new CommentStore();
    author = { id: 'user1', displayName: 'Test User' };

    threadId = store.addThread({ row: 0, col: 0 }, {
      author,
      text: 'Test comment',
    });
    commentId = store.getThread(threadId)!.comments[0].id;
  });

  it('should soft-delete comment on apply', () => {
    const command = new DeleteCommentCommand(
      store,
      threadId,
      commentId,
      'user1'
    );

    command.apply();

    const thread = store.getThread(threadId)!;
    expect(thread.comments[0].deletedAt).toBeGreaterThan(0);
    expect(thread.comments[0].deletedBy).toBe('user1');
  });

  it('should undelete comment on revert', () => {
    const command = new DeleteCommentCommand(
      store,
      threadId,
      commentId,
      'user1'
    );

    command.apply();
    expect(store.getThread(threadId)!.comments[0].deletedAt).toBeDefined();

    command.revert();

    const thread = store.getThread(threadId)!;
    expect(thread.comments[0].deletedAt).toBeUndefined();
    expect(thread.comments[0].deletedBy).toBeUndefined();
  });

  it('should support multiple undo/redo cycles', () => {
    const command = new DeleteCommentCommand(
      store,
      threadId,
      commentId,
      'user1'
    );

    command.apply();
    command.revert();
    command.apply();
    command.revert();

    const thread = store.getThread(threadId)!;
    expect(thread.comments[0].deletedAt).toBeUndefined();
  });

  it('should capture comment snapshot in constructor', () => {
    const command = new DeleteCommentCommand(
      store,
      threadId,
      commentId,
      'user1'
    );

    expect(command.getMemorySize()).toBe(258); // Snapshot captured
  });

  it('should estimate memory size', () => {
    const command = new DeleteCommentCommand(
      store,
      threadId,
      commentId,
      'user1'
    );

    const memorySize = command.getMemorySize();
    expect(memorySize).toBe(258);
  });
});

describe('Command Integration', () => {
  let store: CommentStore;
  let author: CommentAuthor;

  beforeEach(() => {
    store = new CommentStore();
    author = { id: 'user1', displayName: 'Test User' };
  });

  it('should support complex undo/redo workflow', () => {
    const cell: CellRef = { row: 0, col: 0 };

    // Step 1: Add thread
    const cmd1 = new AddThreadCommand(store, cell, {
      author,
      text: 'Initial comment',
    });
    cmd1.apply();

    let threadId = store.getThreads(cell)[0].id;

    // Step 2: Add reply
    const cmd2 = new AddCommentCommand(
      store,
      threadId,
      {
        author,
        text: 'Reply',
      },
      'user1'
    );
    cmd2.apply();

    // Step 3: Resolve thread
    const cmd3 = new ResolveThreadCommand(
      store,
      threadId,
      'user1',
      false,
      true
    );
    cmd3.apply();

    // Verify final state
    expect(store.getThreads(cell)[0].comments).toHaveLength(2);
    expect(store.getThreads(cell)[0].resolved).toBe(true);

    // Undo in reverse order
    cmd3.revert();
    expect(store.getThreads(cell)[0].resolved).toBe(false);

    cmd2.revert();
    expect(store.getThreads(cell)[0].comments[1].deletedAt).toBeGreaterThan(0);

    cmd1.revert();
    expect(store.getThreads(cell)).toHaveLength(0);
  });

  it('should handle command failures gracefully', () => {
    const threadId = 't_invalid_thread' as ThreadId;

    const command = new AddCommentCommand(
      store,
      threadId,
      {
        author,
        text: 'Test',
      },
      'user1'
    );

    expect(() => {
      command.apply();
    }).toThrow('Thread not found');
  });

  it('should maintain command independence', () => {
    const cell: CellRef = { row: 0, col: 0 };

    const cmd1 = new AddThreadCommand(store, cell, {
      author,
      text: 'Thread 1',
    });
    const cmd2 = new AddThreadCommand(store, cell, {
      author,
      text: 'Thread 2',
    });

    cmd1.apply();
    cmd2.apply();

    expect(store.getThreads(cell)).toHaveLength(2);

    // Undo only cmd1
    cmd1.revert();

    // cmd2 should still be there
    expect(store.getThreads(cell)).toHaveLength(1);
    expect(store.getThreads(cell)[0].comments[0].text).toBe('Thread 2');
  });
});
