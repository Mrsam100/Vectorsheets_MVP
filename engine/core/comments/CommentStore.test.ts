/**
 * CommentStore Tests
 *
 * Comprehensive test suite for production-ready comment system.
 *
 * Coverage:
 * - CRUD operations (add, get, update, delete)
 * - Validation and error handling
 * - Cell movement (insert/delete rows/columns)
 * - Resolution management
 * - React 18 subscription API
 * - Serialization/deserialization
 * - Edge cases and boundary conditions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CommentStore } from './CommentStore';
import type { CommentAuthor, CommentThread, ThreadId, CommentId } from './types';
import type { CellRef } from '../types/index';

describe('CommentStore - CRUD Operations', () => {
  let store: CommentStore;
  let author1: CommentAuthor;
  let author2: CommentAuthor;

  beforeEach(() => {
    store = new CommentStore();
    author1 = {
      id: 'user1',
      displayName: 'Alice Smith',
      email: 'alice@example.com',
    };
    author2 = {
      id: 'user2',
      displayName: 'Bob Jones',
      avatarUrl: 'https://example.com/bob.jpg',
    };
  });

  describe('addThread', () => {
    it('should add a thread to a cell', () => {
      const cell: CellRef = { row: 0, col: 0 };
      const threadId = store.addThread(cell, {
        author: author1,
        text: 'First comment',
      });

      expect(threadId).toBeDefined();
      expect(threadId.startsWith('t_')).toBe(true);

      const threads = store.getThreads(cell);
      expect(threads).toHaveLength(1);
      expect(threads[0].id).toBe(threadId);
      expect(threads[0].comments).toHaveLength(1);
      expect(threads[0].comments[0].text).toBe('First comment');
      expect(threads[0].comments[0].author.displayName).toBe('Alice Smith');
    });

    it('should allow multiple threads per cell', () => {
      const cell: CellRef = { row: 5, col: 10 };

      const threadId1 = store.addThread(cell, {
        author: author1,
        text: 'Thread 1',
      });

      const threadId2 = store.addThread(cell, {
        author: author2,
        text: 'Thread 2',
      });

      const threads = store.getThreads(cell);
      expect(threads).toHaveLength(2);
      expect(threads[0].id).toBe(threadId1);
      expect(threads[1].id).toBe(threadId2);
    });

    it('should initialize thread with correct defaults', () => {
      const cell: CellRef = { row: 1, col: 2 };
      const threadId = store.addThread(cell, {
        author: author1,
        text: 'Test',
      });

      const thread = store.getThread(threadId);
      expect(thread).toBeDefined();
      expect(thread!.resolved).toBe(false);
      expect(thread!.resolvedAt).toBeUndefined();
      expect(thread!.resolvedBy).toBeUndefined();
      expect(thread!.version).toBe(1);
      expect(thread!.createdAt).toBeGreaterThan(0);
    });

    it('should throw on invalid cell coordinates', () => {
      expect(() => {
        store.addThread({ row: -1, col: 0 }, {
          author: author1,
          text: 'Test',
        });
      }).toThrow('Invalid cell');

      expect(() => {
        store.addThread({ row: 0, col: -5 }, {
          author: author1,
          text: 'Test',
        });
      }).toThrow('Invalid cell');
    });

    it('should throw on empty comment text', () => {
      expect(() => {
        store.addThread({ row: 0, col: 0 }, {
          author: author1,
          text: '',
        });
      }).toThrow('Comment text cannot be empty');

      expect(() => {
        store.addThread({ row: 0, col: 0 }, {
          author: author1,
          text: '   ',
        });
      }).toThrow('Comment text cannot be empty');
    });

    it('should throw on comment text exceeding max length', () => {
      const longText = 'a'.repeat(10001);
      expect(() => {
        store.addThread({ row: 0, col: 0 }, {
          author: author1,
          text: longText,
        });
      }).toThrow('Comment text too long');
    });

    it('should throw on invalid author', () => {
      expect(() => {
        store.addThread({ row: 0, col: 0 }, {
          author: { id: '', displayName: 'Test' },
          text: 'Test',
        });
      }).toThrow('Author must have valid id');

      expect(() => {
        store.addThread({ row: 0, col: 0 }, {
          author: { id: 'user1', displayName: '' },
          text: 'Test',
        });
      }).toThrow('Author must have valid displayName');
    });
  });

  describe('addComment', () => {
    it('should add a comment to existing thread', () => {
      const cell: CellRef = { row: 0, col: 0 };
      const threadId = store.addThread(cell, {
        author: author1,
        text: 'First comment',
      });

      const commentId = store.addComment(threadId, {
        author: author2,
        text: 'Reply comment',
      });

      expect(commentId).toBeDefined();
      expect(commentId.startsWith('c_')).toBe(true);

      const thread = store.getThread(threadId);
      expect(thread!.comments).toHaveLength(2);
      expect(thread!.comments[1].id).toBe(commentId);
      expect(thread!.comments[1].text).toBe('Reply comment');
      expect(thread!.comments[1].author.displayName).toBe('Bob Jones');
    });

    it('should throw on non-existent thread', () => {
      expect(() => {
        store.addComment('t_invalid_thread' as ThreadId, {
          author: author1,
          text: 'Test',
        });
      }).toThrow('Thread not found');
    });

    it('should increment thread version on add comment', () => {
      const cell: CellRef = { row: 0, col: 0 };
      const threadId = store.addThread(cell, {
        author: author1,
        text: 'First',
      });

      const initialVersion = store.getThread(threadId)!.version;

      store.addComment(threadId, {
        author: author2,
        text: 'Second',
      });

      const newVersion = store.getThread(threadId)!.version;
      expect(newVersion).toBe(initialVersion + 1);
    });
  });

  describe('updateComment', () => {
    it('should update comment text', () => {
      const cell: CellRef = { row: 0, col: 0 };
      const threadId = store.addThread(cell, {
        author: author1,
        text: 'Original text',
      });

      const thread = store.getThread(threadId)!;
      const commentId = thread.comments[0].id;

      store.updateComment(threadId, commentId, 'Updated text');

      const updatedThread = store.getThread(threadId)!;
      expect(updatedThread.comments[0].text).toBe('Updated text');
      expect(updatedThread.comments[0].editedAt).toBeGreaterThan(0);
    });

    it('should throw on empty updated text', () => {
      const cell: CellRef = { row: 0, col: 0 };
      const threadId = store.addThread(cell, {
        author: author1,
        text: 'Original',
      });

      const commentId = store.getThread(threadId)!.comments[0].id;

      expect(() => {
        store.updateComment(threadId, commentId, '');
      }).toThrow('Comment text cannot be empty');
    });

    it('should throw on non-existent comment', () => {
      const cell: CellRef = { row: 0, col: 0 };
      const threadId = store.addThread(cell, {
        author: author1,
        text: 'Test',
      });

      expect(() => {
        store.updateComment(threadId, 'c_invalid_comment' as CommentId, 'New text');
      }).toThrow('Comment not found');
    });
  });

  describe('deleteComment', () => {
    it('should soft-delete comment', () => {
      const cell: CellRef = { row: 0, col: 0 };
      const threadId = store.addThread(cell, {
        author: author1,
        text: 'Test comment',
      });

      const commentId = store.getThread(threadId)!.comments[0].id;

      store.deleteComment(threadId, commentId, 'user1');

      const thread = store.getThread(threadId)!;
      expect(thread.comments[0].deletedAt).toBeGreaterThan(0);
      expect(thread.comments[0].deletedBy).toBe('user1');
    });

    it('should not remove comment from array (soft delete)', () => {
      const cell: CellRef = { row: 0, col: 0 };
      const threadId = store.addThread(cell, {
        author: author1,
        text: 'Test',
      });

      const commentId = store.getThread(threadId)!.comments[0].id;

      store.deleteComment(threadId, commentId, 'user1');

      const thread = store.getThread(threadId)!;
      expect(thread.comments).toHaveLength(1);
      expect(thread.comments[0].id).toBe(commentId);
    });
  });

  describe('undeleteComment', () => {
    it('should restore soft-deleted comment', () => {
      const cell: CellRef = { row: 0, col: 0 };
      const threadId = store.addThread(cell, {
        author: author1,
        text: 'Test',
      });

      const commentId = store.getThread(threadId)!.comments[0].id;

      // Delete
      store.deleteComment(threadId, commentId, 'user1');
      expect(store.getThread(threadId)!.comments[0].deletedAt).toBeDefined();

      // Undelete
      store.undeleteComment(threadId, commentId);
      const thread = store.getThread(threadId)!;
      expect(thread.comments[0].deletedAt).toBeUndefined();
      expect(thread.comments[0].deletedBy).toBeUndefined();
    });

    it('should no-op if comment not deleted', () => {
      const cell: CellRef = { row: 0, col: 0 };
      const threadId = store.addThread(cell, {
        author: author1,
        text: 'Test',
      });

      const commentId = store.getThread(threadId)!.comments[0].id;

      // Should not throw
      expect(() => {
        store.undeleteComment(threadId, commentId);
      }).not.toThrow();
    });
  });

  describe('deleteThread', () => {
    it('should delete thread completely', () => {
      const cell: CellRef = { row: 0, col: 0 };
      const threadId = store.addThread(cell, {
        author: author1,
        text: 'Test',
      });

      store.deleteThread(threadId);

      expect(store.getThread(threadId)).toBeUndefined();
      expect(store.getThreads(cell)).toHaveLength(0);
    });

    it('should only delete specified thread (multiple threads on cell)', () => {
      const cell: CellRef = { row: 0, col: 0 };
      const threadId1 = store.addThread(cell, {
        author: author1,
        text: 'Thread 1',
      });
      const threadId2 = store.addThread(cell, {
        author: author2,
        text: 'Thread 2',
      });

      store.deleteThread(threadId1);

      expect(store.getThread(threadId1)).toBeUndefined();
      expect(store.getThread(threadId2)).not.toBeUndefined();
      expect(store.getThreads(cell)).toHaveLength(1);
      expect(store.getThreads(cell)[0].id).toBe(threadId2);
    });
  });

  describe('getThreads', () => {
    it('should return empty array for cell with no threads', () => {
      const threads = store.getThreads({ row: 10, col: 20 });
      expect(threads).toEqual([]);
    });

    it('should return threads in insertion order', () => {
      const cell: CellRef = { row: 0, col: 0 };
      const threadId1 = store.addThread(cell, {
        author: author1,
        text: 'First',
      });
      const threadId2 = store.addThread(cell, {
        author: author2,
        text: 'Second',
      });
      const threadId3 = store.addThread(cell, {
        author: author1,
        text: 'Third',
      });

      const threads = store.getThreads(cell);
      expect(threads.map(t => t.id)).toEqual([threadId1, threadId2, threadId3]);
    });
  });

  describe('hasComments', () => {
    it('should return false for empty cell', () => {
      expect(store.hasComments({ row: 0, col: 0 })).toBe(false);
    });

    it('should return true for cell with thread', () => {
      const cell: CellRef = { row: 5, col: 10 };
      store.addThread(cell, {
        author: author1,
        text: 'Test',
      });

      expect(store.hasComments(cell)).toBe(true);
    });

    it('should return false after all threads deleted', () => {
      const cell: CellRef = { row: 0, col: 0 };
      const threadId = store.addThread(cell, {
        author: author1,
        text: 'Test',
      });

      expect(store.hasComments(cell)).toBe(true);

      store.deleteThread(threadId);

      expect(store.hasComments(cell)).toBe(false);
    });
  });
});

describe('CommentStore - Resolution', () => {
  let store: CommentStore;
  let author: CommentAuthor;

  beforeEach(() => {
    store = new CommentStore();
    author = {
      id: 'user1',
      displayName: 'Test User',
    };
  });

  it('should resolve thread', () => {
    const threadId = store.addThread({ row: 0, col: 0 }, {
      author,
      text: 'Test',
    });

    store.resolveThread(threadId, 'user2');

    const thread = store.getThread(threadId)!;
    expect(thread.resolved).toBe(true);
    expect(thread.resolvedBy).toBe('user2');
    expect(thread.resolvedAt).toBeGreaterThan(0);
  });

  it('should unresolve thread', () => {
    const threadId = store.addThread({ row: 0, col: 0 }, {
      author,
      text: 'Test',
    });

    store.resolveThread(threadId, 'user2');
    store.unresolveThread(threadId);

    const thread = store.getThread(threadId)!;
    expect(thread.resolved).toBe(false);
    expect(thread.resolvedBy).toBeUndefined();
    expect(thread.resolvedAt).toBeUndefined();
  });

  it('should no-op if already resolved', () => {
    const threadId = store.addThread({ row: 0, col: 0 }, {
      author,
      text: 'Test',
    });

    store.resolveThread(threadId, 'user1');
    const version1 = store.getThread(threadId)!.version;

    store.resolveThread(threadId, 'user1');
    const version2 = store.getThread(threadId)!.version;

    expect(version1).toBe(version2); // No version increment
  });

  it('should no-op if already unresolved', () => {
    const threadId = store.addThread({ row: 0, col: 0 }, {
      author,
      text: 'Test',
    });

    const version1 = store.getThread(threadId)!.version;
    store.unresolveThread(threadId);
    const version2 = store.getThread(threadId)!.version;

    expect(version1).toBe(version2);
  });
});

describe('CommentStore - Cell Movement', () => {
  let store: CommentStore;
  let author: CommentAuthor;

  beforeEach(() => {
    store = new CommentStore();
    author = {
      id: 'user1',
      displayName: 'Test User',
    };
  });

  describe('onRowsInserted', () => {
    it('should move comments down when rows inserted above', () => {
      // Add comment at row 10
      const threadId = store.addThread({ row: 10, col: 5 }, {
        author,
        text: 'Test',
      });

      // Insert 3 rows at row 5 (above comment)
      store.onRowsInserted(5, 3);

      // Comment should now be at row 13
      expect(store.getThreads({ row: 10, col: 5 })).toHaveLength(0);
      expect(store.getThreads({ row: 13, col: 5 })).toHaveLength(1);
      expect(store.getThreads({ row: 13, col: 5 })[0].id).toBe(threadId);
    });

    it('should not move comments when rows inserted below', () => {
      const threadId = store.addThread({ row: 5, col: 3 }, {
        author,
        text: 'Test',
      });

      // Insert rows at row 10 (below comment at row 5)
      store.onRowsInserted(10, 5);

      // Comment should stay at row 5
      expect(store.getThreads({ row: 5, col: 3 })).toHaveLength(1);
      expect(store.getThreads({ row: 5, col: 3 })[0].id).toBe(threadId);
    });

    it('should move multiple threads on same row', () => {
      const threadId1 = store.addThread({ row: 8, col: 0 }, {
        author,
        text: 'Thread 1',
      });
      const threadId2 = store.addThread({ row: 8, col: 1 }, {
        author,
        text: 'Thread 2',
      });

      store.onRowsInserted(5, 2);

      expect(store.getThreads({ row: 10, col: 0 })[0].id).toBe(threadId1);
      expect(store.getThreads({ row: 10, col: 1 })[0].id).toBe(threadId2);
    });
  });

  describe('onRowsDeleted', () => {
    it('should delete comments on deleted rows', () => {
      const threadId = store.addThread({ row: 10, col: 5 }, {
        author,
        text: 'Will be deleted',
      });

      // Delete rows 10-12
      store.onRowsDeleted(10, 3);

      expect(store.getThread(threadId)).toBeUndefined();
      expect(store.getThreads({ row: 10, col: 5 })).toHaveLength(0);
    });

    it('should move comments up when rows deleted above', () => {
      const threadId = store.addThread({ row: 15, col: 3 }, {
        author,
        text: 'Test',
      });

      // Delete rows 5-9 (5 rows)
      store.onRowsDeleted(5, 5);

      // Comment should move from row 15 to row 10
      expect(store.getThreads({ row: 15, col: 3 })).toHaveLength(0);
      expect(store.getThreads({ row: 10, col: 3 })).toHaveLength(1);
      expect(store.getThreads({ row: 10, col: 3 })[0].id).toBe(threadId);
    });

    it('should not move comments when rows deleted below', () => {
      const threadId = store.addThread({ row: 5, col: 2 }, {
        author,
        text: 'Test',
      });

      // Delete rows 10-14
      store.onRowsDeleted(10, 5);

      // Comment should stay at row 5
      expect(store.getThreads({ row: 5, col: 2 })).toHaveLength(1);
      expect(store.getThreads({ row: 5, col: 2 })[0].id).toBe(threadId);
    });
  });

  describe('onColumnsInserted', () => {
    it('should move comments right when columns inserted left', () => {
      const threadId = store.addThread({ row: 5, col: 10 }, {
        author,
        text: 'Test',
      });

      // Insert 3 columns at col 5 (left of comment)
      store.onColumnsInserted(5, 3);

      // Comment should now be at col 13
      expect(store.getThreads({ row: 5, col: 10 })).toHaveLength(0);
      expect(store.getThreads({ row: 5, col: 13 })).toHaveLength(1);
      expect(store.getThreads({ row: 5, col: 13 })[0].id).toBe(threadId);
    });

    it('should not move comments when columns inserted right', () => {
      const threadId = store.addThread({ row: 3, col: 5 }, {
        author,
        text: 'Test',
      });

      // Insert columns at col 10 (right of comment at col 5)
      store.onColumnsInserted(10, 2);

      // Comment should stay at col 5
      expect(store.getThreads({ row: 3, col: 5 })).toHaveLength(1);
      expect(store.getThreads({ row: 3, col: 5 })[0].id).toBe(threadId);
    });
  });

  describe('onColumnsDeleted', () => {
    it('should delete comments on deleted columns', () => {
      const threadId = store.addThread({ row: 5, col: 10 }, {
        author,
        text: 'Will be deleted',
      });

      // Delete columns 10-12
      store.onColumnsDeleted(10, 3);

      expect(store.getThread(threadId)).toBeUndefined();
      expect(store.getThreads({ row: 5, col: 10 })).toHaveLength(0);
    });

    it('should move comments left when columns deleted left', () => {
      const threadId = store.addThread({ row: 3, col: 15 }, {
        author,
        text: 'Test',
      });

      // Delete columns 5-9 (5 columns)
      store.onColumnsDeleted(5, 5);

      // Comment should move from col 15 to col 10
      expect(store.getThreads({ row: 3, col: 15 })).toHaveLength(0);
      expect(store.getThreads({ row: 3, col: 10 })).toHaveLength(1);
      expect(store.getThreads({ row: 3, col: 10 })[0].id).toBe(threadId);
    });
  });
});

describe('CommentStore - Query Operations', () => {
  let store: CommentStore;
  let author1: CommentAuthor;
  let author2: CommentAuthor;

  beforeEach(() => {
    store = new CommentStore();
    author1 = { id: 'user1', displayName: 'Alice' };
    author2 = { id: 'user2', displayName: 'Bob' };
  });

  describe('getAllThreads', () => {
    it('should return empty array when no threads', () => {
      expect(store.getAllThreads()).toEqual([]);
    });

    it('should return all threads across all cells', () => {
      const threadId1 = store.addThread({ row: 0, col: 0 }, {
        author: author1,
        text: 'Thread 1',
      });
      const threadId2 = store.addThread({ row: 5, col: 10 }, {
        author: author2,
        text: 'Thread 2',
      });
      const threadId3 = store.addThread({ row: 0, col: 0 }, {
        author: author1,
        text: 'Thread 3',
      });

      const allThreads = store.getAllThreads();
      expect(allThreads).toHaveLength(3);
      expect(allThreads.map(t => t.id).sort()).toEqual([threadId1, threadId2, threadId3].sort());
    });
  });

  describe('getUnresolvedThreads', () => {
    it('should return only unresolved threads', () => {
      const threadId1 = store.addThread({ row: 0, col: 0 }, {
        author: author1,
        text: 'Unresolved 1',
      });
      const threadId2 = store.addThread({ row: 1, col: 1 }, {
        author: author2,
        text: 'Will be resolved',
      });
      const threadId3 = store.addThread({ row: 2, col: 2 }, {
        author: author1,
        text: 'Unresolved 2',
      });

      store.resolveThread(threadId2, 'user1');

      const unresolved = store.getUnresolvedThreads();
      expect(unresolved).toHaveLength(2);
      expect(unresolved.map(t => t.id).sort()).toEqual([threadId1, threadId3].sort());
    });
  });

  describe('searchComments', () => {
    beforeEach(() => {
      store.addThread({ row: 0, col: 0 }, {
        author: author1,
        text: 'The quick brown fox',
      });
      store.addThread({ row: 1, col: 1 }, {
        author: author2,
        text: 'Jumped over the lazy dog',
      });
      store.addThread({ row: 2, col: 2 }, {
        author: author1,
        text: 'QUICK test',
      });
    });

    it('should find threads by case-insensitive text search', () => {
      const results = store.searchComments('quick');
      expect(results).toHaveLength(2);
      expect(results[0].comments[0].text).toContain('quick');
      expect(results[1].comments[0].text).toContain('QUICK');
    });

    it('should return empty array when no matches', () => {
      const results = store.searchComments('nonexistent');
      expect(results).toEqual([]);
    });

    it('should search in all comments of thread', () => {
      const threadId = store.addThread({ row: 3, col: 3 }, {
        author: author1,
        text: 'First comment',
      });
      store.addComment(threadId, {
        author: author2,
        text: 'Reply with SEARCHTERM',
      });

      const results = store.searchComments('searchterm');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(threadId);
    });
  });

  describe('resolveAllThreads', () => {
    it('should resolve all threads at once', () => {
      store.addThread({ row: 0, col: 0 }, {
        author: author1,
        text: 'Thread 1',
      });
      store.addThread({ row: 1, col: 1 }, {
        author: author2,
        text: 'Thread 2',
      });
      store.addThread({ row: 2, col: 2 }, {
        author: author1,
        text: 'Thread 3',
      });

      store.resolveAllThreads('user1');

      const allThreads = store.getAllThreads();
      expect(allThreads.every(t => t.resolved)).toBe(true);
      expect(allThreads.every(t => t.resolvedBy === 'user1')).toBe(true);
    });

    it('should handle empty store', () => {
      expect(() => {
        store.resolveAllThreads('user1');
      }).not.toThrow();
    });
  });
});

describe('CommentStore - React 18 Subscription', () => {
  let store: CommentStore;
  let author: CommentAuthor;

  beforeEach(() => {
    store = new CommentStore();
    author = { id: 'user1', displayName: 'Test' };
  });

  it('should notify listeners on addThread', () => {
    let notified = false;
    const unsubscribe = store.subscribe(() => {
      notified = true;
    });

    store.addThread({ row: 0, col: 0 }, {
      author,
      text: 'Test',
    });

    expect(notified).toBe(true);
    unsubscribe();
  });

  it('should notify listeners on addComment', () => {
    const threadId = store.addThread({ row: 0, col: 0 }, {
      author,
      text: 'Test',
    });

    let notified = false;
    const unsubscribe = store.subscribe(() => {
      notified = true;
    });

    store.addComment(threadId, {
      author,
      text: 'Reply',
    });

    expect(notified).toBe(true);
    unsubscribe();
  });

  it('should notify listeners on deleteThread', () => {
    const threadId = store.addThread({ row: 0, col: 0 }, {
      author,
      text: 'Test',
    });

    let notified = false;
    const unsubscribe = store.subscribe(() => {
      notified = true;
    });

    store.deleteThread(threadId);

    expect(notified).toBe(true);
    unsubscribe();
  });

  it('should provide snapshot with correct counts', () => {
    store.addThread({ row: 0, col: 0 }, {
      author,
      text: 'Thread 1',
    });
    const threadId2 = store.addThread({ row: 1, col: 1 }, {
      author,
      text: 'Thread 2',
    });
    store.addThread({ row: 2, col: 2 }, {
      author,
      text: 'Thread 3',
    });

    store.resolveThread(threadId2, 'user1');

    const snapshot = store.getSnapshot();
    expect(snapshot.threadCount).toBe(3);
    expect(snapshot.commentCount).toBe(3);
    expect(snapshot.unresolvedCount).toBe(2);
    expect(snapshot.version).toBeGreaterThan(0);
  });

  it('should increment snapshot version on mutations', () => {
    const snapshot1 = store.getSnapshot();

    store.addThread({ row: 0, col: 0 }, {
      author,
      text: 'Test',
    });

    const snapshot2 = store.getSnapshot();
    expect(snapshot2.version).toBeGreaterThan(snapshot1.version);
  });

  it('should allow multiple subscriptions', () => {
    let count1 = 0;
    let count2 = 0;

    const unsub1 = store.subscribe(() => { count1++; });
    const unsub2 = store.subscribe(() => { count2++; });

    store.addThread({ row: 0, col: 0 }, {
      author,
      text: 'Test',
    });

    expect(count1).toBe(1);
    expect(count2).toBe(1);

    unsub1();
    unsub2();
  });

  it('should not notify after unsubscribe', () => {
    let count = 0;
    const unsubscribe = store.subscribe(() => { count++; });

    store.addThread({ row: 0, col: 0 }, {
      author,
      text: 'Test',
    });
    expect(count).toBe(1);

    unsubscribe();

    store.addThread({ row: 1, col: 1 }, {
      author,
      text: 'Test 2',
    });
    expect(count).toBe(1); // No change
  });
});

describe('CommentStore - Serialization', () => {
  let store: CommentStore;
  let author: CommentAuthor;

  beforeEach(() => {
    store = new CommentStore();
    author = { id: 'user1', displayName: 'Test', email: 'test@example.com' };
  });

  it('should serialize empty store', () => {
    const data = store.serialize();
    expect(data.version).toBe(1);
    expect(data.threads).toEqual([]);
    expect(data.metadata.threadCount).toBe(0);
    expect(data.metadata.commentCount).toBe(0);
  });

  it('should serialize store with threads', () => {
    store.addThread({ row: 0, col: 0 }, {
      author,
      text: 'Thread 1',
    });
    const threadId2 = store.addThread({ row: 5, col: 10 }, {
      author,
      text: 'Thread 2',
    });

    store.addComment(threadId2, {
      author,
      text: 'Reply',
    });

    const data = store.serialize();
    expect(data.threads).toHaveLength(2);
    expect(data.metadata.threadCount).toBe(2);
    expect(data.metadata.commentCount).toBe(3);
    expect(data.threads[1].comments).toHaveLength(2);
  });

  it('should deserialize and restore threads', () => {
    const threadId = store.addThread({ row: 0, col: 0 }, {
      author,
      text: 'Test thread',
    });
    store.resolveThread(threadId, 'user1');

    const data = store.serialize();

    // Create new store and deserialize
    const newStore = new CommentStore();
    newStore.deserialize(data);

    const threads = newStore.getAllThreads();
    expect(threads).toHaveLength(1);
    expect(threads[0].comments[0].text).toBe('Test thread');
    expect(threads[0].resolved).toBe(true);
  });

  it('should preserve all comment fields on round-trip', () => {
    const threadId = store.addThread({ row: 5, col: 10 }, {
      author,
      text: 'Original',
    });

    const commentId = store.getThread(threadId)!.comments[0].id;
    store.updateComment(threadId, commentId, 'Updated');

    const data = store.serialize();
    const newStore = new CommentStore();
    newStore.deserialize(data);

    const restoredThread = newStore.getAllThreads()[0];
    expect(restoredThread.comments[0].text).toBe('Updated');
    expect(restoredThread.comments[0].editedAt).toBeDefined();
    expect(restoredThread.comments[0].author.email).toBe('test@example.com');
  });

  it('should clear existing data on deserialize', () => {
    store.addThread({ row: 0, col: 0 }, {
      author,
      text: 'Old thread',
    });

    const emptyData = {
      version: 1,
      threads: [],
      metadata: {
        createdAt: Date.now(),
        lastModified: Date.now(),
        threadCount: 0,
        commentCount: 0,
      },
    };

    store.deserialize(emptyData);

    expect(store.getAllThreads()).toHaveLength(0);
  });
});

describe('CommentStore - Edge Cases', () => {
  let store: CommentStore;
  let author: CommentAuthor;

  beforeEach(() => {
    store = new CommentStore();
    author = { id: 'user1', displayName: 'Test' };
  });

  it('should handle very long comment text (up to max)', () => {
    const longText = 'a'.repeat(10000);
    const threadId = store.addThread({ row: 0, col: 0 }, {
      author,
      text: longText,
    });

    const thread = store.getThread(threadId)!;
    expect(thread.comments[0].text).toHaveLength(10000);
  });

  it('should handle 100 threads on single cell', () => {
    const cell: CellRef = { row: 0, col: 0 };

    for (let i = 0; i < 100; i++) {
      store.addThread(cell, {
        author,
        text: `Thread ${i}`,
      });
    }

    const threads = store.getThreads(cell);
    expect(threads).toHaveLength(100);
  });

  it('should handle 100 comments in single thread', () => {
    const threadId = store.addThread({ row: 0, col: 0 }, {
      author,
      text: 'First',
    });

    for (let i = 1; i < 100; i++) {
      store.addComment(threadId, {
        author,
        text: `Comment ${i}`,
      });
    }

    const thread = store.getThread(threadId)!;
    expect(thread.comments).toHaveLength(100);
  });

  it('should handle clear operation', () => {
    store.addThread({ row: 0, col: 0 }, {
      author,
      text: 'Thread 1',
    });
    store.addThread({ row: 5, col: 10 }, {
      author,
      text: 'Thread 2',
    });

    store.clear();

    expect(store.getAllThreads()).toHaveLength(0);
    expect(store.getSnapshot().threadCount).toBe(0);
    expect(store.getSnapshot().commentCount).toBe(0);
  });

  it('should handle author with all optional fields', () => {
    const fullAuthor: CommentAuthor = {
      id: 'user1',
      displayName: 'Full Name',
      email: 'test@example.com',
      avatarUrl: 'https://example.com/avatar.jpg',
    };

    const threadId = store.addThread({ row: 0, col: 0 }, {
      author: fullAuthor,
      text: 'Test',
    });

    const thread = store.getThread(threadId)!;
    expect(thread.comments[0].author.email).toBe('test@example.com');
    expect(thread.comments[0].author.avatarUrl).toBe('https://example.com/avatar.jpg');
  });

  it('should handle rapid mutations without losing data', () => {
    const threadId = store.addThread({ row: 0, col: 0 }, {
      author,
      text: 'Initial',
    });

    // Rapid mutations
    for (let i = 0; i < 50; i++) {
      store.addComment(threadId, {
        author,
        text: `Comment ${i}`,
      });
    }

    const thread = store.getThread(threadId)!;
    expect(thread.comments).toHaveLength(51); // Initial + 50 replies
  });
});

describe('CommentStore - Statistics', () => {
  let store: CommentStore;
  let author: CommentAuthor;

  beforeEach(() => {
    store = new CommentStore();
    author = { id: 'user1', displayName: 'Test' };
  });

  it('should provide accurate statistics', () => {
    store.addThread({ row: 0, col: 0 }, {
      author,
      text: 'Thread 1',
    });
    const threadId2 = store.addThread({ row: 1, col: 1 }, {
      author,
      text: 'Thread 2',
    });
    store.addComment(threadId2, {
      author,
      text: 'Reply',
    });

    const stats = store.getStats();
    expect(stats.threadCount).toBe(2);
    expect(stats.commentCount).toBe(3);
    expect(stats.unresolvedThreads).toBe(2);
    expect(stats.cellsWithComments).toBe(2);
    expect(stats.avgCommentsPerThread).toBe('1.50');
  });

  it('should estimate memory usage', () => {
    // Create enough threads to exceed 0.01 MB (need ~23 threads)
    for (let i = 0; i < 50; i++) {
      store.addThread({ row: i, col: i }, {
        author,
        text: 'Test comment with some content',
      });
    }

    const stats = store.getStats();
    const memoryMB = parseFloat(stats.memoryUsageMB);
    expect(memoryMB).toBeGreaterThan(0); // Should be ~0.02 MB
    expect(memoryMB).toBeLessThan(1); // 50 threads should be well under 1MB
  });
});
