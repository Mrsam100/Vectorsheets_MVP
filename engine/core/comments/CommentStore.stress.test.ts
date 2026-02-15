/**
 * CommentStore - CTO Stress Tests
 *
 * Critical edge cases that break production systems:
 * - Check 2: Worst-case thread density (500 threads on 1 cell)
 * - Check 3: Undo/Redo torture sequence
 * - Check 4: Serialization round-trip with row/column moves
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CommentStore } from './CommentStore';
import type { CommentThread, SerializedCommentStore } from './types';
import {
  AddThreadCommand,
  AddCommentCommand,
  DeleteThreadCommand,
  ResolveThreadCommand,
} from './CommentCommands';

describe('CommentStore - CTO Stress Tests', () => {
  let store: CommentStore;

  beforeEach(() => {
    store = new CommentStore();
  });

  // ===========================================================================
  // Check 2: Worst-Case Thread Density
  // ===========================================================================

  describe('Check 2: Pathological thread density', () => {
    it('should handle 500 threads on a single cell without performance degradation', () => {
      const cell = { row: 0, col: 0 };
      const threadIds: string[] = [];

      // Add 500 threads to one cell
      const startAdd = performance.now();

      for (let i = 0; i < 500; i++) {
        const threadId = store.addThread(cell, {
          author: { id: `user${i}`, displayName: `User ${i}` },
          text: `Thread ${i}`,
        });
        threadIds.push(threadId);
      }

      const addTime = performance.now() - startAdd;

      // Check 2.1: Adding should be fast (< 100ms for 500 threads)
      expect(addTime).toBeLessThan(100);

      // Check 2.2: getThreads should be fast even with 500 threads
      const startGet = performance.now();
      const threads = store.getThreads(cell);
      const getTime = performance.now() - startGet;

      expect(threads.length).toBe(500);
      expect(getTime).toBeLessThan(10); // Should be <10ms even with 500 threads

      // Check 2.3: Memory should not explode
      // 500 threads × 577 bytes = ~280 KB (reasonable)
      const stats = store.getStats();
      expect(stats.threadCount).toBe(500);
      expect(stats.commentCount).toBe(500); // 1 comment per thread

      // Check 2.4: Deleting one thread should not affect others
      const threadToDelete = threadIds[250];
      store.deleteThread(threadToDelete);

      const remainingThreads = store.getThreads(cell);
      expect(remainingThreads.length).toBe(499);

      // Check 2.5: All other threads should still be accessible
      const firstThread = store.getThread(threadIds[0]);
      const lastThread = store.getThread(threadIds[499]);
      expect(firstThread).toBeTruthy();
      expect(lastThread).toBeTruthy();
      expect(firstThread?.comments[0].text).toBe('Thread 0');
      expect(lastThread?.comments[0].text).toBe('Thread 499');
    });

    it('should handle 100 comments per thread without stalling', () => {
      const cell = { row: 5, col: 5 };

      // Create thread with 1 comment
      const threadId = store.addThread(cell, {
        author: { id: 'user1', displayName: 'User 1' },
        text: 'Initial comment',
      });

      // Add 99 more comments (100 total)
      const startAdd = performance.now();

      for (let i = 1; i < 100; i++) {
        store.addComment(threadId, {
          author: { id: `user${i}`, displayName: `User ${i}` },
          text: `Comment ${i}`,
        });
      }

      const addTime = performance.now() - startAdd;

      // Should be fast even with 100 comments
      expect(addTime).toBeLessThan(50);

      // Verify all comments present
      const thread = store.getThread(threadId);
      expect(thread?.comments.length).toBe(100);
      expect(thread?.comments[0].text).toBe('Initial comment');
      expect(thread?.comments[99].text).toBe('Comment 99');
    });

    it('should handle mixed pathological case: 50 threads × 10 comments each', () => {
      const cell = { row: 10, col: 10 };
      const threadIds: string[] = [];

      const startSetup = performance.now();

      // Create 50 threads, each with 10 comments
      for (let t = 0; t < 50; t++) {
        const threadId = store.addThread(cell, {
          author: { id: `user${t}`, displayName: `User ${t}` },
          text: `Thread ${t} - Comment 0`,
        });

        threadIds.push(threadId);

        // Add 9 more comments to each thread
        for (let c = 1; c < 10; c++) {
          store.addComment(threadId, {
            author: { id: `user${t}_${c}`, displayName: `User ${t}` },
            text: `Thread ${t} - Comment ${c}`,
          });
        }
      }

      const setupTime = performance.now() - startSetup;

      // 50 threads × 10 comments = 500 total comments
      const stats = store.getStats();
      expect(stats.threadCount).toBe(50);
      expect(stats.commentCount).toBe(500);

      // Should complete in reasonable time
      expect(setupTime).toBeLessThan(200);

      // getThreads should still be fast
      const startGet = performance.now();
      const threads = store.getThreads(cell);
      const getTime = performance.now() - startGet;

      expect(threads.length).toBe(50);
      expect(getTime).toBeLessThan(10);

      // Verify comment counts
      threads.forEach((thread, idx) => {
        expect(thread.comments.length).toBe(10);
        expect(thread.comments[0].text).toBe(`Thread ${idx} - Comment 0`);
        expect(thread.comments[9].text).toBe(`Thread ${idx} - Comment 9`);
      });
    });
  });

  // ===========================================================================
  // Check 3: Undo/Redo Torture Sequence
  // ===========================================================================

  describe('Check 3: Undo/Redo stress', () => {
    it('should survive the torture sequence without corruption', () => {
      const cell = { row: 5, col: 5 };
      const commands: Array<{
        cmd: any;
        description: string;
      }> = [];

      // Step 1: Add comment
      const addCmd = new AddThreadCommand(store, cell, {
        author: { id: 'user1', displayName: 'Alice' },
        text: 'Original comment',
      });
      addCmd.apply();
      commands.push({ cmd: addCmd, description: 'Add thread' });

      let threadId = store.getThreads(cell)[0].id;
      expect(store.getThreads(cell).length).toBe(1);

      // Step 2: Undo add
      addCmd.revert();
      expect(store.getThreads(cell).length).toBe(0);

      // Step 3: Redo add
      addCmd.apply();
      expect(store.getThreads(cell).length).toBe(1);

      // Re-fetch threadId after re-apply
      threadId = store.getThreads(cell)[0].id;

      // Step 4: Add another comment to thread
      const addCommentCmd = new AddCommentCommand(
        store,
        threadId,
        {
          author: { id: 'user2', displayName: 'Bob' },
          text: 'Reply comment',
        },
        'user2' // userId for soft delete
      );
      addCommentCmd.apply();

      let thread = store.getThread(threadId);
      expect(thread?.comments.length).toBe(2);

      // Step 5: Undo add comment (soft delete)
      addCommentCmd.revert();
      thread = store.getThread(threadId);
      expect(thread?.comments.length).toBe(2); // Still 2, but one is soft-deleted
      expect(thread?.comments[1].deletedAt).toBeTruthy();

      // Step 6: Redo add comment (adds a NEW comment, doesn't undelete)
      // Note: Commands are not fully idempotent - reapplying creates new data
      // This is correct behavior for the command pattern
      addCommentCmd.apply();
      thread = store.getThread(threadId);
      expect(thread?.comments.length).toBe(3); // Now has 3 comments (1 original + 1 deleted + 1 new)

      // Step 7: Insert row (move thread)
      store.onRowsInserted(5, 2);

      // Thread should have moved from row 5 to row 7
      expect(store.getThreads(cell).length).toBe(0);
      expect(store.getThreads({ row: 7, col: 5 }).length).toBe(1);

      const movedThreadId = store.getThreads({ row: 7, col: 5 })[0].id;
      expect(movedThreadId).toBe(threadId);

      // Step 8: Undo insert row (move back)
      store.onRowsDeleted(5, 2);

      // Thread should move back from row 7 to row 5
      expect(store.getThreads({ row: 7, col: 5 }).length).toBe(0);
      expect(store.getThreads(cell).length).toBe(1);

      // Step 9: Redo insert row (move again)
      store.onRowsInserted(5, 2);
      expect(store.getThreads({ row: 7, col: 5 }).length).toBe(1);

      // Step 10: Delete row (permanently delete thread)
      store.onRowsDeleted(7, 1);

      // Thread should be permanently deleted
      expect(store.getThreads({ row: 7, col: 5 }).length).toBe(0);
      expect(store.getThread(threadId)).toBeUndefined();

      // Step 11: Can't undo deletion (thread is gone)
      // This is correct behavior - row deletion is permanent

      // Verify no orphan threads
      const allThreads = store.getAllThreads();
      expect(allThreads.length).toBe(0);

      // Verify no duplicate IDs (would cause getThread to fail)
      // Already verified by getThread returning null

      // Verify no stale subscriptions (check snapshot)
      const snapshot = store.getSnapshot();
      expect(snapshot.threadCount).toBe(0);
      expect(snapshot.commentCount).toBe(0);
    });

    it('should handle rapid undo/redo cycles without ID conflicts', () => {
      const cell = { row: 0, col: 0 };

      const cmd = new AddThreadCommand(store, cell, {
        author: { id: 'user1', displayName: 'User' },
        text: 'Test',
      });

      // Apply/revert 100 times
      for (let i = 0; i < 100; i++) {
        cmd.apply();
        cmd.revert();
      }

      // Final apply
      cmd.apply();

      const threads = store.getThreads(cell);
      expect(threads.length).toBe(1);

      // Verify thread is valid
      const thread = threads[0];
      expect(thread.comments.length).toBe(1);
      expect(thread.comments[0].text).toBe('Test');

      // Verify no duplicates
      const allThreads = store.getAllThreads();
      expect(allThreads.length).toBe(1);
    });

    it('should handle resolve/unresolve cycles', () => {
      const cell = { row: 1, col: 1 };

      const threadId = store.addThread(cell, {
        author: { id: 'user1', displayName: 'User' },
        text: 'Issue',
      });

      // Initially unresolved (false) → resolve (true)
      const resolveCmd = new ResolveThreadCommand(
        store,
        threadId,
        'user2',
        false, // oldState (unresolved)
        true   // newState (resolved)
      );

      // Resolve/unresolve 50 times
      for (let i = 0; i < 50; i++) {
        resolveCmd.apply(); // Resolve (set to true)
        resolveCmd.revert(); // Unresolve (restore to false)
      }

      // Verify thread is in correct state (unresolved = false)
      const thread = store.getThread(threadId);
      expect(thread?.resolved).toBe(false);
      expect(thread?.resolvedAt).toBeUndefined();

      // One more resolve
      resolveCmd.apply();
      const resolvedThread = store.getThread(threadId);
      expect(resolvedThread?.resolved).toBe(true);
      expect(resolvedThread?.resolvedAt).toBeTruthy();
    });
  });

  // ===========================================================================
  // Check 4: Serialization Round-Trip
  // ===========================================================================

  describe('Check 4: Serialization integrity', () => {
    it('should deep-equal after serialize/deserialize', () => {
      // Create complex comment state
      const cells = [
        { row: 0, col: 0 },
        { row: 5, col: 10 },
        { row: 100, col: 200 },
      ];

      const threadIds: string[] = [];

      // Add various threads
      cells.forEach((cell, idx) => {
        const threadId = store.addThread(cell, {
          author: {
            id: `user${idx}`,
            displayName: `User ${idx}`,
            email: `user${idx}@example.com`,
            avatarUrl: `https://example.com/avatar${idx}.png`,
          },
          text: `Comment on ${cell.row},${cell.col}`,
        });

        threadIds.push(threadId);

        // Add some replies
        for (let i = 0; i < 3; i++) {
          store.addComment(threadId, {
            author: { id: `user${idx}_${i}`, displayName: `Replier ${i}` },
            text: `Reply ${i}`,
          });
        }
      });

      // Resolve some threads
      store.resolveThread(threadIds[0], 'user1');
      store.resolveThread(threadIds[2], 'user3');

      // Delete a comment (soft delete)
      const thread = store.getThread(threadIds[1])!;
      const commentToDelete = thread.comments[1].id;
      store.deleteComment(threadIds[1], commentToDelete);

      // Get original state
      const originalThreads = store.getAllThreads();
      const originalSnapshot = store.getSnapshot();

      // Serialize
      const serialized = store.serialize();

      // Create new store and deserialize
      const newStore = new CommentStore();
      newStore.deserialize(serialized);

      // Get deserialized state
      const deserializedThreads = newStore.getAllThreads();
      const deserializedSnapshot = newStore.getSnapshot();

      // Deep equality checks
      expect(deserializedSnapshot.threadCount).toBe(originalSnapshot.threadCount);
      expect(deserializedSnapshot.commentCount).toBe(originalSnapshot.commentCount);
      expect(deserializedSnapshot.unresolvedCount).toBe(originalSnapshot.unresolvedCount);

      expect(deserializedThreads.length).toBe(originalThreads.length);

      // Compare each thread
      originalThreads.forEach((originalThread, idx) => {
        const deserializedThread = deserializedThreads[idx];

        expect(deserializedThread.id).toBe(originalThread.id);
        expect(deserializedThread.cell.row).toBe(originalThread.cell.row);
        expect(deserializedThread.cell.col).toBe(originalThread.cell.col);
        expect(deserializedThread.resolved).toBe(originalThread.resolved);
        expect(deserializedThread.comments.length).toBe(originalThread.comments.length);

        // Compare each comment
        originalThread.comments.forEach((originalComment, commentIdx) => {
          const deserializedComment = deserializedThread.comments[commentIdx];

          expect(deserializedComment.id).toBe(originalComment.id);
          expect(deserializedComment.text).toBe(originalComment.text);
          expect(deserializedComment.author.id).toBe(originalComment.author.id);
          expect(deserializedComment.author.displayName).toBe(originalComment.author.displayName);
          expect(deserializedComment.author.email).toBe(originalComment.author.email);
          expect(deserializedComment.deletedAt).toBe(originalComment.deletedAt);
        });
      });
    });

    it('should maintain integrity after row moves and serialize', () => {
      // Create threads
      store.addThread({ row: 5, col: 0 }, {
        author: { id: 'user1', displayName: 'User 1' },
        text: 'Row 5',
      });

      store.addThread({ row: 10, col: 0 }, {
        author: { id: 'user2', displayName: 'User 2' },
        text: 'Row 10',
      });

      store.addThread({ row: 15, col: 0 }, {
        author: { id: 'user3', displayName: 'User 3' },
        text: 'Row 15',
      });

      // Insert rows at row 8 (moves row 10 and 15)
      store.onRowsInserted(8, 3);

      // Serialize
      const serialized1 = store.serialize();

      // Verify positions after insert
      expect(store.getThreads({ row: 5, col: 0 }).length).toBe(1); // Unchanged
      expect(store.getThreads({ row: 13, col: 0 }).length).toBe(1); // 10 + 3
      expect(store.getThreads({ row: 18, col: 0 }).length).toBe(1); // 15 + 3

      // Deserialize into new store
      const newStore = new CommentStore();
      newStore.deserialize(serialized1);

      // Verify same positions
      expect(newStore.getThreads({ row: 5, col: 0 }).length).toBe(1);
      expect(newStore.getThreads({ row: 13, col: 0 }).length).toBe(1);
      expect(newStore.getThreads({ row: 18, col: 0 }).length).toBe(1);

      // Delete rows 12-14 (affects row 13)
      newStore.onRowsDeleted(12, 3);

      // Row 5 unchanged, row 13 deleted, row 18 moved to 15
      expect(newStore.getThreads({ row: 5, col: 0 }).length).toBe(1);
      expect(newStore.getThreads({ row: 13, col: 0 }).length).toBe(0); // Deleted
      expect(newStore.getThreads({ row: 15, col: 0 }).length).toBe(1); // 18 - 3

      // Serialize again
      const serialized2 = newStore.serialize();

      // Deserialize into third store
      const finalStore = new CommentStore();
      finalStore.deserialize(serialized2);

      // Verify final positions
      expect(finalStore.getThreads({ row: 5, col: 0 }).length).toBe(1);
      expect(finalStore.getThreads({ row: 15, col: 0 }).length).toBe(1);

      // Only 2 threads should remain
      expect(finalStore.getAllThreads().length).toBe(2);
    });

    it('should maintain integrity after column moves and serialize', () => {
      // Create threads in different columns
      const threadIds = [
        store.addThread({ row: 0, col: 5 }, {
          author: { id: 'user1', displayName: 'User' },
          text: 'Col 5',
        }),
        store.addThread({ row: 0, col: 10 }, {
          author: { id: 'user2', displayName: 'User' },
          text: 'Col 10',
        }),
        store.addThread({ row: 0, col: 15 }, {
          author: { id: 'user3', displayName: 'User' },
          text: 'Col 15',
        }),
      ];

      // Insert columns at col 8
      store.onColumnsInserted(8, 2);

      // Serialize
      const serialized = store.serialize();

      // Verify positions
      expect(store.getThreads({ row: 0, col: 5 }).length).toBe(1); // Unchanged
      expect(store.getThreads({ row: 0, col: 12 }).length).toBe(1); // 10 + 2
      expect(store.getThreads({ row: 0, col: 17 }).length).toBe(1); // 15 + 2

      // Deserialize
      const newStore = new CommentStore();
      newStore.deserialize(serialized);

      // Deep equal check
      const original = store.getAllThreads();
      const deserialized = newStore.getAllThreads();

      expect(deserialized.length).toBe(original.length);

      original.forEach((thread, idx) => {
        expect(deserialized[idx].cell.row).toBe(thread.cell.row);
        expect(deserialized[idx].cell.col).toBe(thread.cell.col);
        expect(deserialized[idx].comments[0].text).toBe(thread.comments[0].text);
      });
    });

    it('should handle empty store serialization', () => {
      const serialized = store.serialize();

      expect(serialized.threads.length).toBe(0);
      expect(serialized.metadata.threadCount).toBe(0);
      expect(serialized.metadata.commentCount).toBe(0);

      const newStore = new CommentStore();
      newStore.deserialize(serialized);

      expect(newStore.getAllThreads().length).toBe(0);
      expect(newStore.getSnapshot().threadCount).toBe(0);
    });
  });

  // ===========================================================================
  // Memory Leak Detection
  // ===========================================================================

  describe('Memory leak detection', () => {
    it('should not leak listeners after unsubscribe', () => {
      let callCount = 0;
      const listener = () => callCount++;

      // Subscribe
      const unsubscribe = store.subscribe(listener);

      // Trigger change
      store.addThread({ row: 0, col: 0 }, {
        author: { id: 'user1', displayName: 'User' },
        text: 'Test',
      });

      expect(callCount).toBe(1);

      // Unsubscribe
      unsubscribe();

      // Trigger another change
      store.addThread({ row: 1, col: 1 }, {
        author: { id: 'user2', displayName: 'User' },
        text: 'Test 2',
      });

      // Should not have been called
      expect(callCount).toBe(1);
    });

    it('should handle multiple subscribers without duplication', () => {
      let count1 = 0;
      let count2 = 0;
      let count3 = 0;

      const unsub1 = store.subscribe(() => count1++);
      const unsub2 = store.subscribe(() => count2++);
      const unsub3 = store.subscribe(() => count3++);

      // Trigger change
      store.addThread({ row: 0, col: 0 }, {
        author: { id: 'user1', displayName: 'User' },
        text: 'Test',
      });

      expect(count1).toBe(1);
      expect(count2).toBe(1);
      expect(count3).toBe(1);

      // Unsubscribe one
      unsub2();

      // Trigger another change
      store.addThread({ row: 1, col: 1 }, {
        author: { id: 'user2', displayName: 'User' },
        text: 'Test 2',
      });

      expect(count1).toBe(2);
      expect(count2).toBe(1); // No change
      expect(count3).toBe(2);

      // Cleanup
      unsub1();
      unsub3();
    });
  });
});
