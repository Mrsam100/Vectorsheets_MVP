# Excel Editing Behavior Analysis & Implementation Plan

## Issue 1: Cell Editor Popup Behavior

### Excel's Actual Behavior (Observed)

1. **Single Click on Empty Cell**:
   - Cell is selected (blue border)
   - NO editor appears
   - Typing starts edit mode, shows editor

2. **Single Click on Cell with Content**:
   - Cell is selected
   - NO editor appears immediately
   - Typing starts edit mode, REPLACES content (Enter mode)
   - F2 starts edit mode, shows EXISTING content with cursor (Edit mode)

3. **Double Click on Cell**:
   - Immediately enters Edit mode
   - Cursor placed at click position in text
   - Editor appears in-cell

4. **Click in Formula Bar**:
   - Enters Edit mode
   - Editor appears in both formula bar AND in-cell
   - Both are synchronized

### Current VectorSheet Behavior (WRONG)

- Single click → IMMEDIATELY shows cell editor overlay
- This is jarring and not Excel-like

### Root Cause

In `PointerAdapter.ts:620-626`, we emit `BeginEdit` on every single click:

```typescript
if (e.type !== 'pointercancel' && !this.state.isExtending && !this.state.isAdditive && this.state.dragStartCell) {
  this.emit(createIntent<BeginEditIntent>({
    type: 'BeginEdit',
    row: this.state.dragStartCell.row,
    col: this.state.dragStartCell.col,
  }));
}
```

This immediately triggers `editActions.startEditing()` which shows the editor.

### Solution: "Ready-to-Type" State

Excel has an intermediate state between Navigate and Edit:

```
Navigate Mode → Ready-to-Type Mode → Edit Mode
     ↑              (cell selected,       ↑
     |              no editor shown)      |
     |                    ↓                |
     |              User types → Enter mode
     |              User presses F2 → Edit mode
     └──────────────────────────────────────┘
```

**Implementation Plan:**

1. **Remove BeginEdit from single-click**
   - `PointerAdapter` should ONLY emit `SetActiveCell` on single click
   - Remove the `BeginEdit` emission on `pointerup`

2. **Add "type-to-edit" trigger in KeyboardAdapter**
   - When user presses a printable character, emit `StartEdit` with `initialValue`
   - This triggers Enter mode (replaces content)

3. **Keep F2 and double-click behavior**
   - F2 → Edit mode (cursor, existing content)
   - Double-click → Edit mode (cursor at click position)

---

## Issue 2: Formatting Buttons Click Loses Edit State

### Problem

User types "Good soul", wants to:
1. Type "Good "
2. Click **Bold** button
3. Type "soul"
4. Result: "Good " is lost when clicking Bold

### Excel's Behavior

1. **Toolbar buttons during edit**:
   - Clicking Bold/Italic/etc DOES NOT commit the edit
   - The button applies to the CURRENT SELECTION in the cell
   - If no selection, applies to the insertion point forward

2. **Rich text editing in cells**:
   - Excel supports inline formatting (part of text bold, part normal)
   - Formatting is character-level, not cell-level
   - FormatPainter can copy character formats

### Current VectorSheet Issue

When clicking a toolbar button:
1. Button triggers a `mousedown` event
2. `PointerAdapter` does NOT receive it (button is outside grid)
3. BUT: Focus leaves the cell editor
4. Edit mode integration sees focus loss → calls `confirmEdit()`
5. Edit state is committed and cleared

### Root Cause

The edit mode is auto-committing on ANY click outside the editor. This is in `processEditingIntent` at line 509:

```typescript
case 'SetActiveCell': {
  if (mode === 'point') {
    // Point mode behavior...
  }
  // Other modes: commit and select new cell
  editActions.confirmEdit();  // ← This fires on ANY cell click
  return { handled: false, result: {} };
}
```

BUT — toolbar buttons should NOT trigger `SetActiveCell` because they're outside the grid.

The REAL issue is likely in `CellEditorOverlay` or `FormulaBar` — they're losing focus and calling `confirmEdit()`.

### Solution: Detect "Safe Clicks"

1. **Add data attribute to toolbar buttons**:
   ```tsx
   <button data-preserve-edit="true">Bold</button>
   ```

2. **Check click target before confirming edit**:
   ```typescript
   // In handleClickOutside or blur handler:
   const target = e.target as HTMLElement;
   if (target.closest('[data-preserve-edit="true"]')) {
     return; // Don't commit, toolbar action will apply format
   }
   editActions.confirmEdit();
   ```

3. **Modify toolbar to accept edit state**:
   - Toolbar receives `editState` and `editActions` as props
   - Bold button calls `editActions.applyInlineFormat({ bold: true })`
   - This modifies the edit buffer WITHOUT committing

### Implementation Requirements

This requires:
- **Engine support for rich text** (character-level formatting)
- **Edit buffer to store formatted runs**, not just plain string
- **Toolbar integration** with edit mode

**Complexity**: HIGH — requires engine changes

---

## Issue 3: Edit Progress Vanishes on Click

### Problem Statement

User types in cell, clicks another cell or button → progress lost.

This is the SAME as Issue 2, but generalized.

### Excel's Behavior

1. **Click another cell while editing**:
   - Excel COMMITS the edit (saves value)
   - Then selects the new cell
   - Edit is NOT lost — it's saved

2. **Click toolbar while editing**:
   - Excel keeps edit active
   - Applies toolbar action to edit buffer
   - Does NOT commit yet

3. **Press Escape while editing**:
   - Excel CANCELS the edit (discards changes)

### Current VectorSheet Behavior

✅ **CORRECT**: Clicking another cell commits the edit
❌ **WRONG**: Clicking toolbar buttons commits the edit (should preserve)

### Root Cause

`processEditingIntent` in `useEditModeIntegration.ts:501-511`:

```typescript
case 'SetActiveCell': {
  if (mode === 'point') {
    // ... Point mode handling
  }
  // Other modes: commit and select new cell
  editActions.confirmEdit();
  return { handled: false, result: {} };
}
```

This is CORRECT for cell clicks, WRONG for toolbar clicks.

### Solution: Click Source Detection

1. **Intent metadata**:
   ```typescript
   interface SetActiveCellIntent {
     type: 'SetActiveCell';
     row: number;
     col: number;
     source?: 'cell-click' | 'toolbar-click' | 'keyboard-nav';
   }
   ```

2. **Only commit on cell-click**:
   ```typescript
   case 'SetActiveCell': {
     if (mode === 'point') { /* ... */ }

     // Only commit if clicking another CELL (not toolbar)
     if (intent.source === 'cell-click') {
       editActions.confirmEdit();
     }
     return { handled: false, result: {} };
   }
   ```

3. **Toolbar buttons emit different intent**:
   ```typescript
   <button onClick={() => onIntent({ type: 'ApplyFormat', format: { bold: true } })}>
     Bold
   </button>
   ```

---

## Implementation Priority

### Phase 1: Fix Issue 1 (Cell Editor Popup) — HIGH PRIORITY ✅

**Impact**: UX is jarring, doesn't match Excel
**Complexity**: LOW — remove one line, add keyboard trigger
**Time**: 30 minutes

**Steps**:
1. Remove `BeginEdit` emission from `PointerAdapter.handlePointerUp`
2. Add type-to-edit trigger in `KeyboardAdapter`
3. Test: single-click should NOT show editor, typing should

### Phase 2: Fix Issue 3 (Auto-commit on Cell Click) — MEDIUM PRIORITY ✅

**Impact**: Edit loss is confusing, but clicking another cell SHOULD commit
**Complexity**: LOW — already working correctly
**Time**: 10 minutes (verification only)

**Steps**:
1. Verify `confirmEdit()` is called on `SetActiveCell`
2. Verify edit value is passed to `onCommit` callback
3. Test: type "hello", click another cell → "hello" saved

### Phase 3: Fix Issue 2 (Toolbar Formatting) — LOW PRIORITY ⚠️

**Impact**: Users can't apply inline formatting (Excel feature parity)
**Complexity**: VERY HIGH — requires engine support for rich text
**Time**: 2-3 days

**Blockers**:
- Engine `Cell` type only supports cell-level formatting, not character-level
- Edit buffer is `string`, not `FormattedText`
- Need to implement `editActions.applyInlineFormat()`

**Recommendation**: Defer until rich text support is added to engine

---

## Summary

| Issue | Description | Severity | Complexity | Status |
|-------|-------------|----------|------------|--------|
| 1 | Cell pops up on click | HIGH | LOW | **FIX NOW** |
| 3 | Edit lost on cell click | MEDIUM | LOW | **Already correct** |
| 2 | Edit lost on toolbar click | MEDIUM | VERY HIGH | **Defer** |

**Next Steps**:
1. Implement Phase 1 fix (remove auto-edit on click)
2. Verify Phase 2 (cell click commits correctly)
3. Document Phase 3 requirements for future rich text support
