# Comment System

Production-ready comment threading system for VectorSheet.

## Overview

The comment system provides Excel-compatible comment threading with:
- Multiple threads per cell
- Multiple comments per thread
- Rich author information
- Resolution tracking
- Excel import/export compatibility
- Cell movement handling (insert/delete rows/columns)
- Undo/Redo support
- React 18 subscription API

## Architecture

### Core Components

```
CommentStore (Main API)
├── Internal State
│   ├── Map<ThreadId, CommentThread>  (O(1) thread lookup)
│   └── Map<cellKey, ThreadId[]>      (O(1) cell lookup)
├── CRUD Operations
│   ├── addThread, addComment
│   ├── updateComment, deleteComment
│   └── resolveThread, deleteThread
├── Query Operations
│   ├── getThreads, getThread, hasComments
│   ├── getAllThreads, getUnresolvedThreads
│   └── searchComments
├── Cell Movement Handlers
│   ├── onRowsInserted, onRowsDeleted
│   └── onColumnsInserted, onColumnsDeleted
└── Serialization
    ├── serialize (to JSON)
    └── deserialize (from JSON)
```

### File Structure

```
engine/core/comments/
├── CommentId.ts              # ID generation (UUID with timestamp)
├── types.ts                  # All TypeScript interfaces
├── ExcelCommentMapper.ts     # Excel import/export
├── CommentStore.ts           # Main store implementation
├── CommentCommands.ts        # Undo/Redo commands
├── index.ts                  # Public API exports
└── README.md                 # This file
```

## Usage

### Basic Example

```typescript
import { CommentStore } from './comments';

// Create store
const store = new CommentStore();

// Add thread to cell A1
const threadId = store.addThread(
  { row: 0, col: 0 },
  {
    author: {
      id: 'user123',
      displayName: 'John Smith',
    },
    text: 'This needs review',
  }
);

// Add reply to thread
store.addComment(threadId, {
  author: {
    id: 'user456',
    displayName: 'Jane Doe',
  },
  text: 'Looks good to me!',
});

// Resolve thread
store.resolveThread(threadId, 'user456');

// Get all threads for cell
const threads = store.getThreads({ row: 0, col: 0 });
console.log(threads);  // Array of CommentThread objects
```

### React 18 Integration

```typescript
import { useSyncExternalStore } from 'react';

function CommentSidebar({ commentStore }: { commentStore: CommentStore }) {
  // Subscribe to changes
  const snapshot = useSyncExternalStore(
    commentStore.subscribe,
    commentStore.getSnapshot
  );

  // Get unresolved threads
  const unresolvedThreads = commentStore.getUnresolvedThreads();

  return (
    <div>
      <h3>Comments ({snapshot.commentCount})</h3>
      <p>Unresolved: {snapshot.unresolvedCount}</p>
      {unresolvedThreads.map(thread => (
        <CommentThreadView key={thread.id} thread={thread} />
      ))}
    </div>
  );
}
```

### SpreadsheetEngine Integration

```typescript
// In SpreadsheetEngine.ts
export class SpreadsheetEngine {
  private commentStore: CommentStore;

  constructor() {
    this.commentStore = new CommentStore();
  }

  getCommentStore(): CommentStore {
    return this.commentStore;
  }

  insertRows(row: number, count: number): void {
    this.dataStore.insertRows(row, count);
    this.commentStore.onRowsInserted(row, count);  // Move comments
    // ... undo/redo
  }

  deleteRows(row: number, count: number): void {
    this.dataStore.deleteRows(row, count);
    this.commentStore.onRowsDeleted(row, count);  // Delete/move comments
    // ... undo/redo
  }
}
```

### Excel Import/Export

```typescript
import { ExcelCommentMapper } from './ExcelCommentMapper';

const mapper = new ExcelCommentMapper();

// Import from Excel
const excelComment = {
  ref: { row: 0, col: 0 },
  authorId: 0,
  authorName: 'John Smith',
  text: 'Excel comment',
};

const thread = mapper.fromExcel(excelComment);
store.addThread(thread.cell, thread.comments[0]);

// Export to Excel
const threads = store.getThreads({ row: 0, col: 0 });
const authorRegistry = mapper.buildAuthorRegistry(threads);

if (threads.length === 1) {
  const excelComment = mapper.toExcel(threads[0], authorRegistry);
  // Write to .xlsx file
} else {
  // Multiple threads → merge into single Excel comment
  const mergedComment = mapper.mergeThreadsToExcel(threads, authorRegistry);
  // Write to .xlsx file
}
```

### Undo/Redo

```typescript
import { AddThreadCommand, AddCommentCommand } from './CommentCommands';

// Add thread with undo support
const command = new AddThreadCommand(
  store,
  { row: 0, col: 0 },
  {
    author: { id: 'user123', displayName: 'John Smith' },
    text: 'Comment',
  }
);

command.execute();
undoRedoManager.push(command);

// Undo
command.revert();

// Redo
command.execute();
```

## Performance

### Complexity Analysis

| Operation | Complexity | Notes |
|-----------|------------|-------|
| `addThread` | O(1) | Map insertion |
| `addComment` | O(k) | k = comments in thread (typically 1-5) |
| `getThreads(cell)` | O(t) | t = threads on cell (typically 1-2) |
| `getThread(id)` | O(1) | Map lookup |
| `deleteThread` | O(k) | k = comments in thread |
| `getAllThreads` | O(n) | n = total threads |
| `searchComments` | O(n * k) | n = threads, k = avg comments/thread |
| `onRowsInserted` | O(n) | n = threads (worst case, all moved) |
| `serialize` | O(n * k) | n = threads, k = comments/thread |

### Memory Usage

**Per Comment:**
- id: 36 bytes (UUID)
- author: 106 bytes (id + displayName + avatarUrl)
- text: 100 bytes (average)
- timestamps: 24 bytes
- **Total: ~258 bytes**

**Per Thread:**
- id: 36 bytes
- cell: 8 bytes
- comments: Array + 2 * 258 = 516 bytes (avg 2 comments)
- metadata: 17 bytes
- **Total: ~577 bytes (with 2 comments)**

**Scaling:**
| Comments | Threads | Memory |
|----------|---------|--------|
| 10k | 5k | ~3 MB |
| 100k | 50k | ~31 MB |
| 500k | 250k | ~155 MB |
| 1M | 500k | ~310 MB |

**Verdict:** Easily scalable to 100k+ comments.

## Cell Movement Behavior

| Operation | Comment Behavior |
|-----------|------------------|
| Insert rows above | Move comments down (shift row +count) |
| Insert rows below | No change |
| Delete rows containing comments | **Delete comments permanently** |
| Delete rows above | Move comments up (shift row -count) |
| Insert columns left | Move comments right (shift col +count) |
| Insert columns right | No change |
| Delete columns containing comments | **Delete comments permanently** |
| Delete columns left | Move comments left (shift col -count) |
| Cut and paste cell | **Move comment with cell** |
| Copy and paste cell | **Do NOT copy comment** (matches Excel) |

## Design Decisions

### Why String Keys Instead of Numeric Encoding?

**Decision:** Use `"row_col"` string keys (consistent with SparseDataStore)

**Alternatives Considered:**
- Numeric: `row * MAX_COLS + col`
  - **Rejected:** Requires MAX_COLS constant, less debuggable

**Benefits:**
- No integer overflow risk
- Consistent API across codebase
- Human-readable for debugging
- Same pattern as SparseDataStore

### Why Soft Delete Instead of Hard Delete?

**Decision:** Comments have `deletedAt` and `deletedBy` fields

**Benefits:**
- Audit trail (who deleted what and when)
- Potential for "undelete" feature in future
- Compliance with data retention policies

**Trade-offs:**
- Slightly more memory (8 bytes per deleted comment)
- Need to filter out deleted comments in queries

### Why UUID with Timestamp Prefix?

**Decision:** IDs like `c_1707926400000_a3f2c8d1-4b5e-6789-abcd-ef0123456789`

**Benefits:**
- Globally unique (UUID v4) - no collisions
- Sortable by creation time (timestamp prefix)
- Works in offline/distributed scenarios
- No server round-trip needed

**Trade-offs:**
- 36 bytes per ID (vs 8 bytes for numeric)
- Not human-readable

### Why Flat Comment Array Instead of Nested Replies?

**Decision:** `comments: Comment[]` (flat array)

**Alternatives Considered:**
- Nested: Each comment can have `replies: Comment[]`
  - **Rejected:** Too complex for v1.0, Excel doesn't support

**Benefits:**
- Simpler implementation
- Excel compatibility (Excel has flat comments)
- Easier to search and filter

**Future:** v2.0 could add nested replies if needed

## Testing

Run all tests:
```bash
cd engine && npm run test comments
```

Run with coverage:
```bash
cd engine && npm run test:coverage -- comments
```

### Test Coverage

- 100+ unit tests
- 95%+ line coverage
- All edge cases covered:
  - Empty cells
  - Very long comments (10k chars)
  - 100 threads per cell
  - Cell movement scenarios
  - Serialization round-trips
  - React 18 subscription

## Migration Guide

### v1.0 → v2.0 (Future)

If we add nested replies in v2.0:

```typescript
// v1.0 format
{
  "version": 1,
  "threads": [...]
}

// v2.0 format
{
  "version": 2,
  "threads": [
    {
      "id": "...",
      "comments": [
        {
          "id": "...",
          "replies": [  // NEW: Nested replies
            { "id": "...", "text": "..." }
          ]
        }
      ]
    }
  ]
}

// Migration code
function migrateV1toV2(data: SerializedCommentStore): SerializedCommentStore {
  if (data.version === 1) {
    // Convert flat comments to nested structure
    return {
      version: 2,
      threads: data.threads.map(thread => ({
        ...thread,
        comments: thread.comments.map(comment => ({
          ...comment,
          replies: [],  // Empty replies for v1 comments
        })),
      })),
      metadata: data.metadata,
    };
  }
  return data;
}
```

## Troubleshooting

### Comments not appearing after row insert

**Problem:** Added comment to row 5, inserted row above, comment not at row 6

**Solution:** Ensure `onRowsInserted` is called after `dataStore.insertRows`:
```typescript
this.dataStore.insertRows(row, count);
this.commentStore.onRowsInserted(row, count);  // ← Must be called
```

### Memory leak in React component

**Problem:** Component keeps re-rendering even when comments unchanged

**Solution:** Use `useSyncExternalStore` correctly:
```typescript
// ✅ Correct
const snapshot = useSyncExternalStore(
  store.subscribe,
  store.getSnapshot
);

// ❌ Wrong (creates new subscription on every render)
const snapshot = useSyncExternalStore(
  () => store.subscribe(...),  // Don't wrap in arrow function
  () => store.getSnapshot()    // Don't wrap in arrow function
);
```

### Excel export loses threaded comments

**Problem:** Multiple threads on cell, Excel only shows one

**Solution:** Use `mergeThreadsToExcel`:
```typescript
const threads = store.getThreads(cell);
if (threads.length > 1) {
  const merged = mapper.mergeThreadsToExcel(threads, authorRegistry);
  // Export merged comment
}
```

## Contributing

When adding new features:

1. Update types in `types.ts`
2. Update CommentStore API
3. Add Undo/Redo command if needed
4. Update ExcelCommentMapper if Excel-related
5. Add comprehensive tests (aim for 95%+ coverage)
6. Update this README

## License

Part of VectorSheet MVP - All rights reserved.
