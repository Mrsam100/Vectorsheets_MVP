# 🚨 EMERGENCY AUDIT - Cell Data Vanishing Bug

**Date**: 2026-02-16
**Severity**: P0 - PRODUCTION BLOCKER
**Symptom**: Cell value disappears on navigation, reappears after seconds
**Status**: 🔴 CRITICAL INVESTIGATION IN PROGRESS

---

## 🔍 Symptom Analysis

**User Report**:
> "I write in cell, move to next cell, written text VANISHES, comes back after some seconds"

**This indicates**:
1. ✅ Data IS being saved to engine (it comes back)
2. ❌ UI is NOT immediately reflecting saved data
3. ⚠️ Something triggers delayed re-render (async issue)
4. ⚠️ Possible race condition between commit → save → render

---

## 🎯 Hypothesis Tree

### Hypothesis #1: VirtualRenderer Cache Stale ⚠️ HIGH PROBABILITY
**Theory**: VirtualRenderer is caching old cell data, not invalidating cache on setCellValue()

**Evidence**:
- VirtualRenderer has internal cell cache
- Cache may not be invalidated when engine.setCellValue() is called
- Old cached value displayed until next full re-render

**Test**:
```typescript
// Check if VirtualRenderer.getRenderFrame() returns old data
engine.setCellValue(0, 0, "TEST");
const frame = virtualRenderer.getRenderFrame();
console.log(frame.cells); // Does it show "TEST" or old value?
```

**Fix**: Force VirtualRenderer to invalidate cache on every setCellValue()

---

### Hypothesis #2: React 18 Subscription Delay ⚠️ MEDIUM PROBABILITY
**Theory**: useSyncExternalStore has race condition with commit timing

**Evidence**:
- Commit happens in EditModeManager
- engine.setCellValue() called from handleCommit
- notifyListeners() increments version
- useSyncExternalStore triggers re-render
- But re-render may use OLD dimensionProvider snapshot

**Test**:
```typescript
// Add logging to track timing
handleCommit(row, col, value) {
  console.log('[1] Commit START:', value);
  engine.setCellValue(row, col, value);
  console.log('[2] SetCellValue DONE');
  console.log('[3] Engine version:', engine.getVersion());
  console.log('[4] Cell from engine:', engine.getCell(row, col));
}
```

**Fix**: Ensure getVersion() triggers IMMEDIATE snapshot read, not delayed

---

### Hypothesis #3: EditSession Not Clearing ⚠️ HIGH PROBABILITY
**Theory**: EditSession still has old value after commit, UI shows EditSession instead of engine

**Evidence**:
- CellEditorOverlay and FormulaBar subscribe to EditSession
- EditSession may not clear immediately after commit
- UI may show EditSession.text instead of engine cell value

**Test**:
```typescript
// Check if EditSession is still active after commit
console.log('[After commit] EditSession:', editModeManager.getSnapshot());
// Should be null or cleared
```

**Fix**: Ensure EditSession is IMMEDIATELY cleared after commit

---

### Hypothesis #4: Dimension Provider Stale ⚠️ CRITICAL
**Theory**: EngineDimensionProvider created once, never updates with fresh engine data

**Evidence**:
```typescript
// SpreadsheetContainer.tsx line 169
const dimensionProvider = useMemo(
  () => new EngineDimensionProvider(engine),
  [engine] // ← Only recreates if engine reference changes (NEVER)
);
```

**Problem**: dimensionProvider is cached forever, getCell() may return stale data

**Test**:
```typescript
// Check if dimensionProvider.getCell() returns fresh data
engine.setCellValue(0, 0, "TEST");
console.log(dimensionProvider.getCell(0, 0)); // Does it show "TEST"?
```

**Fix**: dimensionProvider should read FRESH data from engine, not cache

---

### Hypothesis #5: GridViewport Not Re-rendering ⚠️ MEDIUM PROBABILITY
**Theory**: GridViewport has key={} or memo() preventing re-render

**Evidence**:
- useSyncExternalStore triggers SpreadsheetContainer re-render
- But GridViewport may be memoized or have static key
- GridViewport doesn't re-render even though parent did

**Test**:
```typescript
// Add logging to GridViewport render
const GridViewport = memo(({ dimensionProvider }) => {
  console.log('[GridViewport] Rendering with provider:', dimensionProvider);
  // ...
});
```

**Fix**: Remove memo() or ensure GridViewport re-renders on data changes

---

## 🔧 Diagnostic Steps (Execute NOW)

### Step 1: Add Comprehensive Logging

**File**: `app/src/components/SpreadsheetContainer.tsx`

```typescript
const handleCommit = useCallback(
  (row: number, col: number, value: string) => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[1] COMMIT START:', { row, col, value });
    console.log('[2] Engine version BEFORE:', engine.getVersion());
    console.log('[3] Cell BEFORE:', engine.getCell(row, col));

    engine.setCellValue(row, col, value);

    console.log('[4] Engine version AFTER:', engine.getVersion());
    console.log('[5] Cell AFTER:', engine.getCell(row, col));
    console.log('[6] DimensionProvider cell:', dimensionProvider.getCell(row, col));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  },
  [engine, dimensionProvider]
);
```

**Expected Output**:
```
[1] COMMIT START: { row: 0, col: 0, value: 'Hello' }
[2] Engine version BEFORE: 0
[3] Cell BEFORE: null
[4] Engine version AFTER: 1
[5] Cell AFTER: { value: 'Hello', type: 'string' }
[6] DimensionProvider cell: { value: 'Hello', type: 'string' }
```

**If [6] shows OLD value**: ❌ DimensionProvider is stale
**If [5] shows OLD value**: ❌ Engine setCellValue() is broken
**If [4] doesn't increment**: ❌ notifyListeners() not called

---

### Step 2: Check EditSession State

**File**: `app/src/components/GridViewport.tsx` (in useEditMode)

```typescript
const { state, actions, manager } = useEditMode({
  onCommit: (cell, value) => {
    console.log('[EditMode] onCommit:', { cell, value });
    console.log('[EditMode] EditSession BEFORE clear:', manager.getSnapshot());

    onCommit?.(cell.row, cell.col, value);

    console.log('[EditMode] EditSession AFTER clear:', manager.getSnapshot());
  },
  // ...
});
```

**Expected**: EditSession should be NULL after commit

**If EditSession is NOT null**: ❌ EditModeManager not clearing session

---

### Step 3: Check VirtualRenderer State

**File**: `app/src/components/GridViewport.tsx`

```typescript
useEffect(() => {
  console.log('[GridViewport] Dimension provider changed');
  console.log('[GridViewport] Sample cells:');
  for (let i = 0; i < 5; i++) {
    console.log(`  [${i},0]:`, dimensionProvider?.getCell(i, 0));
  }
}, [dimensionProvider]);
```

**Expected**: Should log on every re-render with FRESH cell data

---

### Step 4: Track Re-render Count

**File**: `app/src/components/SpreadsheetContainer.tsx`

```typescript
const renderCountRef = useRef(0);
renderCountRef.current++;

console.log('[SpreadsheetContainer] Render #', renderCountRef.current);
console.log('[SpreadsheetContainer] Engine version:', engine.getVersion());
```

**Expected**: Render count should increment IMMEDIATELY after commit

**If render count doesn't increment**: ❌ useSyncExternalStore not triggering re-render

---

## 🎯 Fix Strategy Matrix

| Hypothesis | Likelihood | Fix Complexity | Fix Time |
|------------|-----------|----------------|----------|
| #1 VirtualRenderer cache | HIGH | MEDIUM | 30 min |
| #2 Subscription delay | MEDIUM | HIGH | 1 hour |
| #3 EditSession not clearing | HIGH | LOW | 15 min |
| #4 DimensionProvider stale | CRITICAL | HIGH | 2 hours |
| #5 GridViewport not re-rendering | MEDIUM | LOW | 30 min |

---

## 🚀 Immediate Action Plan

### Phase 1: Diagnostics (15 minutes)

1. ✅ Add logging to handleCommit (Step 1)
2. ✅ Add logging to useEditMode (Step 2)
3. ✅ Add logging to GridViewport (Step 3)
4. ✅ Add render counter (Step 4)
5. ✅ User refreshes browser, types in cell, moves to next cell
6. ✅ User copies ALL console logs and sends to me

---

### Phase 2: Root Cause Identified (Based on Logs)

**If logs show "DimensionProvider cell: OLD VALUE"**:
→ Fix: Make dimensionProvider reactive, not cached
→ Solution: Remove useMemo, create new provider on every render
→ Or: Make EngineDimensionProvider.getCell() call engine.getCell() EVERY TIME (no cache)

**If logs show "EditSession AFTER: { isActive: true }"**:
→ Fix: Force EditModeManager to clear session on commit
→ Solution: Call manager.endEdit() in handleCommit

**If logs show "Render count doesn't increment"**:
→ Fix: useSyncExternalStore not working
→ Solution: Check engine.subscribe implementation, ensure listeners array is mutable

---

### Phase 3: Nuclear Option (If All Else Fails)

**Scrap current approach, use DIRECT ENGINE REFERENCE**:

```typescript
// SpreadsheetContainer.tsx - NUCLEAR FIX

// Remove useSyncExternalStore
// Remove dimensionProvider caching

const [forceRenderKey, setForceRenderKey] = useState(0);

const handleCommit = useCallback((row, col, value) => {
  engine.setCellValue(row, col, value);
  setForceRenderKey(k => k + 1); // Force FULL re-mount
}, [engine]);

return (
  <SpreadsheetShell
    key={forceRenderKey} // ← Force full re-mount on every commit
    dimensionProvider={new EngineDimensionProvider(engine)} // ← Fresh every render
    onCommit={handleCommit}
    // ...
  />
);
```

**Pros**: GUARANTEED to work (full re-mount = fresh everything)
**Cons**: Loses UI state (selection, scroll position)

---

## 🔬 Expected Root Cause (My Prediction)

**Most Likely**: Hypothesis #4 - DimensionProvider Stale

**Reason**:
```typescript
// Current code (BROKEN):
const dimensionProvider = useMemo(
  () => new EngineDimensionProvider(engine),
  [engine] // ← engine ref NEVER changes
);
// → EngineDimensionProvider created ONCE
// → getCell() may use stale snapshot
```

**The Fix**:
```typescript
// Option A: Remove useMemo (create fresh every render)
const dimensionProvider = new EngineDimensionProvider(engine);

// Option B: Make EngineDimensionProvider ALWAYS read fresh
export class EngineDimensionProvider {
  getCell(row, col) {
    // Always call engine.getCell() - NEVER cache
    return this.engine.getCell(row, col);
  }
}
```

---

## 📊 Debug Checklist

User must execute these steps and report results:

1. ✅ Open browser DevTools (F12)
2. ✅ Clear console
3. ✅ Refresh page (Ctrl+R)
4. ✅ Type "TEST" in cell A1
5. ✅ Press Enter to move to A2
6. ✅ **CRITICAL**: Copy ALL console logs IMMEDIATELY
7. ✅ Send console logs to me
8. ✅ Tell me: Does "TEST" disappear from A1? For how long?

---

## 🎯 Success Criteria

**Fix is successful when**:
1. ✅ Type "Hello" in A1
2. ✅ Press Enter to move to A2
3. ✅ A1 IMMEDIATELY shows "Hello" (no flicker, no delay)
4. ✅ Type "World" in A2
5. ✅ Press Enter to move to A3
6. ✅ A1 still shows "Hello", A2 shows "World"
7. ✅ Click randomly on B5, C3, D10 → All previous values STAY VISIBLE
8. ✅ No console errors
9. ✅ No delays, no flickering

---

**NEXT STEP**: Execute Phase 1 diagnostics NOW. Send me console logs.

I will analyze logs and implement IMMEDIATE fix.

**Timeline**: 30 minutes to fix once I see logs.

---

**End of Emergency Audit Plan**
