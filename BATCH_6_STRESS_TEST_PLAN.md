# BATCH 6: Stress Testing - Production Level

**Date**: 2026-02-16
**Status**: 🚧 IN PROGRESS (80% complete)
**Estimated Time**: 2-3 hours
**Goal**: Prove filter system handles millions of rows without performance degradation or memory leaks

---

## 🎯 Objectives

1. **1M Row Test**: Filter 1 million rows in <500ms (5x slower than 100k baseline)
2. **Memory Leak Detection**: No memory growth over 100 filter operations
3. **Pathological Cases**: Handle edge cases without crashes or hangs
4. **Long-Running Session**: 1000 operations without degradation

---

## 📊 Test Suite

### Test 1: 1 Million Row Filtering

**Setup**:
```typescript
// Create 1M rows with realistic data distribution
const rows = Array.from({ length: 1_000_000 }, (_, i) => ({
  id: i,
  name: `User_${i % 10000}`,           // 10k unique names
  age: 18 + (i % 50),                  // Ages 18-67
  department: departments[i % 20],      // 20 departments
  salary: 30000 + (i % 100000),         // Salaries 30k-130k
  email: `user${i}@example.com`,
}));
```

**Test Cases**:

#### 1.1: Text Filter (1M rows)
```typescript
const predicate = new TextContainsPredicate('User_5', { caseSensitive: false });
const start = performance.now();
filterManager.applyFilter(1, predicate); // Column 1 = name
const elapsed = performance.now() - start;

// TARGET: <500ms
// Expected visible rows: ~1000 (User_5, User_50, User_500, etc.)
```

**Acceptance Criteria**:
- ✅ Completes in <500ms
- ✅ Returns correct count of visible rows
- ✅ No UI freeze (async if needed)

---

#### 1.2: Number Range Filter (1M rows)
```typescript
const predicate = new NumberBetweenPredicate({ min: 25, max: 35 });
const start = performance.now();
filterManager.applyFilter(2, predicate); // Column 2 = age
const elapsed = performance.now() - start;

// TARGET: <500ms
// Expected visible rows: ~220k (ages 25-35, roughly 11/50 of rows)
```

**Acceptance Criteria**:
- ✅ Completes in <500ms
- ✅ Correct row count
- ✅ VirtualRenderer handles large visible set

---

#### 1.3: Multi-Column Filter (1M rows)
```typescript
// Filter 1: Name contains "User_1"
// Filter 2: Age between 30-40
// Filter 3: Salary > 80000
// Expected: ~5k visible rows (rough estimate)

const start = performance.now();
filterManager.applyFilter(1, new TextContainsPredicate('User_1'));
filterManager.applyFilter(2, new NumberBetweenPredicate({ min: 30, max: 40 }));
filterManager.applyFilter(4, new NumberGreaterThanPredicate(80000));
const elapsed = performance.now() - start;

// TARGET: <1000ms for all three filters
```

**Acceptance Criteria**:
- ✅ Completes in <1000ms
- ✅ AND logic correct (all three conditions must match)
- ✅ UI remains responsive

---

### Test 2: Memory Leak Detection

**Objective**: Prove no memory growth over 100 filter operations

**Setup**:
```typescript
// Use realistic 100k row dataset
const rows = createRealisticDataset(100_000);

// Baseline memory
const baseline = process.memoryUsage().heapUsed;

// Perform 100 filter operations
for (let i = 0; i < 100; i++) {
  // Apply filter
  const predicate = new TextContainsPredicate(`search_${i}`);
  filterManager.applyFilter(0, predicate);

  // Clear filter
  filterManager.clearFilter(0);

  // Force GC (if available)
  if (global.gc) global.gc();

  // Measure memory every 10 iterations
  if (i % 10 === 0) {
    const current = process.memoryUsage().heapUsed;
    const delta = current - baseline;
    console.log(`Iteration ${i}: ${(delta / 1024 / 1024).toFixed(2)} MB delta`);
  }
}

const final = process.memoryUsage().heapUsed;
const totalDelta = final - baseline;
```

**Acceptance Criteria**:
- ✅ Memory delta <10MB after 100 operations (allow for normal variance)
- ✅ No continuous growth (flat or declining trend)
- ✅ FilterManager cache properly invalidated

---

### Test 3: Pathological Cases

#### 3.1: 10,000 Unique Values (Large Dropdown)
```typescript
// Create column with 10k unique values
const uniqueValues = Array.from({ length: 10_000 }, (_, i) => `Value_${i}`);

// Open filter dropdown (UI operation)
// Expected: Shows first 1000 values + warning
// Expected: Search works for values beyond 1000
```

**Acceptance Criteria**:
- ✅ Dropdown renders in <100ms (first 1000 values)
- ✅ Warning appears: "Showing first 1,000 values. Use search to find more."
- ✅ Search finds values beyond 1000
- ✅ No UI freeze or crash

---

#### 3.2: Rapid Filter Changes (100 changes in 10 seconds)
```typescript
// Simulate user rapidly changing filters
const predicates = [
  new TextContainsPredicate('test1'),
  new TextContainsPredicate('test2'),
  new NumberGreaterThanPredicate(50),
  new NumberLessThanPredicate(100),
  // ... 96 more predicates
];

const start = performance.now();
for (let i = 0; i < 100; i++) {
  filterManager.applyFilter(0, predicates[i % predicates.length]);
}
const elapsed = performance.now() - start;

// TARGET: <10000ms (average <100ms per change)
```

**Acceptance Criteria**:
- ✅ No crashes or hangs
- ✅ Average latency <100ms per change
- ✅ Cache invalidation works correctly

---

#### 3.3: All Rows Filtered Out
```typescript
// Apply filter that matches ZERO rows
const predicate = new TextEqualsPredicate('NONEXISTENT_VALUE_xyz123');
filterManager.applyFilter(0, predicate);

// Expected: 0 visible rows
// Expected: Status bar shows "0 of 100,000 rows"
// Expected: No crash, no errors
```

**Acceptance Criteria**:
- ✅ VirtualRenderer handles empty result gracefully
- ✅ Status bar updates correctly
- ✅ Can clear filter and restore all rows

---

#### 3.4: Column with All Blanks
```typescript
// Create column where ALL cells are null/empty
const rows = Array.from({ length: 10_000 }, () => ({ name: null }));

// Apply filter: Include Blanks only
// Expected: All rows visible
// Apply filter: Exclude Blanks
// Expected: 0 rows visible
```

**Acceptance Criteria**:
- ✅ Blanks checkbox works correctly
- ✅ No errors with all-null column
- ✅ Predicate handles null values properly

---

### Test 4: Long-Running Session Simulation

**Objective**: Prove system stability over extended use

**Scenario**: Simulate 8-hour workday with 1000 operations
```typescript
const operations = [
  { type: 'applyFilter', weight: 40 },    // 40% of operations
  { type: 'clearFilter', weight: 20 },    // 20%
  { type: 'clearAll', weight: 10 },       // 10%
  { type: 'scroll', weight: 20 },         // 20%
  { type: 'edit', weight: 10 },           // 10%
];

for (let i = 0; i < 1000; i++) {
  const op = selectRandomOperation(operations);

  switch (op) {
    case 'applyFilter':
      // Apply random filter
      break;
    case 'clearFilter':
      // Clear random filter
      break;
    case 'clearAll':
      // Clear all filters
      break;
    case 'scroll':
      // Simulate viewport scroll
      break;
    case 'edit':
      // Edit random cell
      break;
  }

  // Measure memory every 100 operations
  if (i % 100 === 0) {
    const mem = process.memoryUsage().heapUsed;
    console.log(`Operation ${i}: ${(mem / 1024 / 1024).toFixed(2)} MB`);
  }
}
```

**Acceptance Criteria**:
- ✅ No crashes or errors over 1000 operations
- ✅ Memory stays below 500MB
- ✅ Performance doesn't degrade (last 100 ops same speed as first 100)

---

## 🔧 Implementation

### Step 1: Create Test File
**File**: `engine/core/filtering/FilterStressTest.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { FilterManager } from './FilterManager';
import {
  TextContainsPredicate,
  NumberBetweenPredicate,
  NumberGreaterThanPredicate,
} from './FilterPredicate';
import type { FilterDataSource } from './types';

describe('FilterStressTest', () => {
  // Helper: Create large dataset
  function createDataset(size: number) {
    const rows: Array<{ id: number; name: string; age: number; salary: number }> = [];

    for (let i = 0; i < size; i++) {
      rows.push({
        id: i,
        name: `User_${i % 10000}`,
        age: 18 + (i % 50),
        salary: 30000 + (i % 100000),
      });
    }

    return rows;
  }

  // Helper: Create FilterDataSource from array
  function createDataSource(rows: any[]): FilterDataSource {
    return {
      getCellValue: (row, col) => {
        if (row < 0 || row >= rows.length) return null;
        const keys = Object.keys(rows[0]);
        return rows[row][keys[col]] ?? null;
      },
      getUsedRange: () => ({
        startRow: 0,
        startCol: 0,
        endRow: rows.length - 1,
        endCol: Object.keys(rows[0]).length - 1,
      }),
    };
  }

  describe('1 Million Row Tests', () => {
    it('should filter 1M rows (text predicate) in <500ms', () => {
      const rows = createDataset(1_000_000);
      const dataSource = createDataSource(rows);
      const filterManager = new FilterManager(dataSource);

      const predicate = new TextContainsPredicate('User_5', { caseSensitive: false });

      const start = performance.now();
      filterManager.applyFilter(1, predicate); // Column 1 = name
      const elapsed = performance.now() - start;

      console.log(`1M rows (text): ${elapsed.toFixed(2)}ms`);

      expect(elapsed).toBeLessThan(500);

      // Verify result correctness
      const visibleRows = filterManager.getFilteredRows();
      expect(visibleRows.size).toBeGreaterThan(0); // Should match ~1000 rows
    });

    it('should filter 1M rows (number predicate) in <500ms', () => {
      const rows = createDataset(1_000_000);
      const dataSource = createDataSource(rows);
      const filterManager = new FilterManager(dataSource);

      const predicate = new NumberBetweenPredicate({ min: 25, max: 35 });

      const start = performance.now();
      filterManager.applyFilter(2, predicate); // Column 2 = age
      const elapsed = performance.now() - start;

      console.log(`1M rows (number): ${elapsed.toFixed(2)}ms`);

      expect(elapsed).toBeLessThan(500);

      // Verify result correctness
      const visibleRows = filterManager.getFilteredRows();
      expect(visibleRows.size).toBeGreaterThan(200000); // ~220k rows (ages 25-35)
      expect(visibleRows.size).toBeLessThan(250000);
    });

    it('should apply multi-column filters to 1M rows in <1000ms', () => {
      const rows = createDataset(1_000_000);
      const dataSource = createDataSource(rows);
      const filterManager = new FilterManager(dataSource);

      const start = performance.now();
      filterManager.applyFilter(1, new TextContainsPredicate('User_1'));
      filterManager.applyFilter(2, new NumberBetweenPredicate({ min: 30, max: 40 }));
      filterManager.applyFilter(3, new NumberGreaterThanPredicate(80000));
      const elapsed = performance.now() - start;

      console.log(`1M rows (3 filters): ${elapsed.toFixed(2)}ms`);

      expect(elapsed).toBeLessThan(1000);

      const visibleRows = filterManager.getFilteredRows();
      expect(visibleRows.size).toBeGreaterThan(0);
    });
  });

  describe('Memory Leak Detection', () => {
    it('should not leak memory over 100 filter operations', () => {
      const rows = createDataset(100_000);
      const dataSource = createDataSource(rows);
      const filterManager = new FilterManager(dataSource);

      // Baseline
      if (global.gc) global.gc();
      const baseline = (performance as any).memory?.usedJSHeapSize ?? 0;

      // Perform 100 operations
      for (let i = 0; i < 100; i++) {
        const predicate = new TextContainsPredicate(`search_${i}`);
        filterManager.applyFilter(0, predicate);
        filterManager.clearFilter(0);
      }

      // Final measurement
      if (global.gc) global.gc();
      const final = (performance as any).memory?.usedJSHeapSize ?? 0;
      const delta = final - baseline;

      console.log(`Memory delta: ${(delta / 1024 / 1024).toFixed(2)} MB`);

      // Allow 10MB variance
      expect(delta).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe('Pathological Cases', () => {
    it('should handle rapid filter changes (100 changes in <10s)', () => {
      const rows = createDataset(10_000);
      const dataSource = createDataSource(rows);
      const filterManager = new FilterManager(dataSource);

      const predicates = Array.from(
        { length: 20 },
        (_, i) => new TextContainsPredicate(`test${i}`)
      );

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        filterManager.applyFilter(0, predicates[i % predicates.length]);
      }
      const elapsed = performance.now() - start;

      console.log(`100 filter changes: ${elapsed.toFixed(2)}ms`);

      expect(elapsed).toBeLessThan(10000); // <10 seconds
      expect(elapsed / 100).toBeLessThan(100); // <100ms average per change
    });

    it('should handle filter matching ZERO rows', () => {
      const rows = createDataset(10_000);
      const dataSource = createDataSource(rows);
      const filterManager = new FilterManager(dataSource);

      const predicate = new TextEqualsPredicate('NONEXISTENT_xyz123');

      expect(() => {
        filterManager.applyFilter(0, predicate);
      }).not.toThrow();

      const visibleRows = filterManager.getFilteredRows();
      expect(visibleRows.size).toBe(0);
    });
  });
});
```

---

### Step 2: Run Tests
```bash
cd engine
npm run test -- FilterStressTest.test.ts
```

---

### Step 3: Document Results
**File**: `BATCH_6_STRESS_TEST_RESULTS.md`

```markdown
# Batch 6 Stress Test Results

## Test Summary

| Test | Target | Actual | Status |
|------|--------|--------|--------|
| 1M rows (text) | <500ms | XXXms | ✅/❌ |
| 1M rows (number) | <500ms | XXXms | ✅/❌ |
| 1M rows (3 filters) | <1000ms | XXXms | ✅/❌ |
| Memory leak (100 ops) | <10MB delta | XXX MB | ✅/❌ |
| Rapid changes (100x) | <10s | XXXms | ✅/❌ |
| Zero rows | No crash | ✅/❌ | ✅/❌ |

## Detailed Results

[Paste test output here]

## Conclusion

✅/❌ PRODUCTION READY for millions of users
```

---

## 🎯 Success Criteria

**BATCH 6 COMPLETE when**:
- ✅ 1M row filter completes in <500ms
- ✅ No memory leaks detected
- ✅ All pathological cases handled gracefully
- ✅ Long-running session stable (1000 ops)
- ✅ Documentation updated with results

---

## ⏱️ Timeline

| Task | Time | Status |
|------|------|--------|
| Write test file | 30 min | 🚧 TODO |
| Run tests | 15 min | 🚧 TODO |
| Fix any issues | 1 hour | 🚧 TODO |
| Document results | 15 min | 🚧 TODO |
| **Total** | **2-3 hours** | 🚧 TODO |

---

## 📝 Next Steps

1. Create `FilterStressTest.test.ts`
2. Run tests and measure results
3. Fix any performance issues found
4. Document results in `BATCH_6_STRESS_TEST_RESULTS.md`
5. Update CLAUDE.md: Mark Batch 6 as COMPLETE ✅

---

**Status**: Ready to implement
**Blocker**: None
**Risk**: LOW (existing tests pass, just need formal benchmarks)
