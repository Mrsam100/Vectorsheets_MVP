# Edit Mode Test Scenarios

## Overview

This document provides comprehensive test scenarios to verify that VectorSheet's editing behavior matches Microsoft Excel. All scenarios should be tested manually and validated against Excel's behavior.

---

## Scenario 1: Type → Click Bold → Continue Typing

**Goal:** Verify toolbar clicks preserve edit session

### Steps

1. Click cell A1
2. Type: `"Hello"`
3. Click the **Bold** button on the ribbon
4. Type: `" World"`
5. Press **Enter**

### Expected Result

- ✅ Edit session remains active after clicking Bold
- ✅ Cell A1 contains: `"Hello World"`
- ✅ **Entire cell** is bold (cell-level formatting)
- ✅ Text is NOT lost when clicking Bold

### Current Behavior (Before Fix)

- ❌ Clicking Bold cancelled edit
- ❌ Cell contained only `"Hello"`
- ❌ Second part `" World"` was lost

### Excel Behavior

- Edit session continues
- In Excel: `"Hello"` would be normal, `" World"` would be bold (character-level)
- In VectorSheet MVP: Entire cell is bold (cell-level limitation)

---

## Scenario 2: Type → Click Another Cell → Verify Commit

**Goal:** Verify clicking another cell commits (not cancels) edit

### Steps

1. Click cell A1
2. Type: `"Test"`
3. Click cell B1 (different cell)
4. Check cell A1 content

### Expected Result

- ✅ Cell A1 contains: `"Test"`
- ✅ Edit was **committed** (not cancelled)
- ✅ Cell B1 is now active
- ✅ B1 is NOT in edit mode (just selected)

### Excel Behavior

- Matches expected result above

---

## Scenario 3: Type → Press Escape → Verify Cancel

**Goal:** Verify Escape cancels edit

### Steps

1. Click cell A1 (already contains `"Original"`)
2. Type: `"New Value"`
3. Press **Escape**
4. Check cell A1 content

### Expected Result

- ✅ Cell A1 contains: `"Original"` (original value restored)
- ✅ Text `"New Value"` was discarded
- ✅ Edit was **cancelled**

### Excel Behavior

- Matches expected result above

---

## Scenario 4: Partial Select → Bold → Continue

**Goal:** Verify text selection during edit (MVP: applies to whole cell)

### Steps

1. Click cell A1
2. Type: `"Good morning"`
3. **Double-click** the word `"morning"` to select it
   - OR use **Shift+Ctrl+Left** to select the word
4. Click the **Bold** button
5. Click elsewhere to commit

### Expected Result (MVP - Cell-Level)

- ✅ Edit session continues after Bold click
- ✅ Cell A1 contains: `"Good morning"`
- ✅ **Entire cell** is bold (cell-level limitation)

### Expected Result (Future - Character-Level)

- Cell A1 contains: `"Good "` (normal) + `"morning"` (bold)
- Only selected text is bold

### Excel Behavior

- Only `"morning"` is bold (character-level)
- VectorSheet will match this in Phase 3 (rich text)

---

## Scenario 5: Type → Click Font Dropdown → Select Font

**Goal:** Verify dropdown interactions preserve edit

### Steps

1. Click cell A1
2. Type: `"Arial Test"`
3. Click the **Font Family** dropdown
4. Select `"Times New Roman"`
5. Type: `" Extended"`
6. Press **Enter**

### Expected Result

- ✅ Edit session remains active during dropdown
- ✅ Cell A1 contains: `"Arial Test Extended"`
- ✅ **Entire cell** is in Times New Roman
- ✅ No text lost

### Excel Behavior

- Matches expected result (cell-level font change)

---

## Scenario 6: Type → Click Color Picker → Select Color

**Goal:** Verify color picker preserves edit

### Steps

1. Click cell A1
2. Type: `"Red Text"`
3. Click the **Font Color** button
4. Select red color (#FF0000)
5. Type: `" More"`
6. Press **Enter**

### Expected Result

- ✅ Edit session continues after color selection
- ✅ Cell A1 contains: `"Red Text More"`
- ✅ **Entire cell** text is red
- ✅ No text lost

### Excel Behavior

- Matches (cell-level color change)

---

## Scenario 7: Type → Click Italic → Click Bold → Continue

**Goal:** Verify multiple toolbar clicks preserve edit

### Steps

1. Click cell A1
2. Type: `"Multi"`
3. Click **Italic** button
4. Type: `" Format"`
5. Click **Bold** button
6. Type: `" Test"`
7. Press **Enter**

### Expected Result

- ✅ All toolbar clicks preserve edit
- ✅ Cell A1 contains: `"Multi Format Test"`
- ✅ **Entire cell** is bold + italic (both applied)

### Excel Behavior (Character-Level)

- `"Multi"` = normal
- `" Format"` = italic
- `" Test"` = bold + italic
- VectorSheet will match in Phase 3

---

## Scenario 8: Type → Tab → Verify Commit & Navigate

**Goal:** Verify Tab commits and navigates

### Steps

1. Click cell A1
2. Type: `"Value"`
3. Press **Tab**
4. Check A1 and active cell

### Expected Result

- ✅ Cell A1 contains: `"Value"`
- ✅ Edit committed
- ✅ Active cell moved to **B1**
- ✅ B1 is NOT in edit mode

### Excel Behavior

- Matches expected result

---

## Scenario 9: Type → Enter → Verify Commit & Navigate Down

**Goal:** Verify Enter commits and navigates down

### Steps

1. Click cell A1
2. Type: `"Value"`
3. Press **Enter**
4. Check A1 and active cell

### Expected Result

- ✅ Cell A1 contains: `"Value"`
- ✅ Edit committed
- ✅ Active cell moved to **A2**
- ✅ A2 is NOT in edit mode

### Excel Behavior

- Matches expected result

---

## Scenario 10: Type → Shift+Enter → Navigate Up

**Goal:** Verify Shift+Enter navigates up

### Steps

1. Click cell A2
2. Type: `"Value"`
3. Press **Shift+Enter**
4. Check A2 and active cell

### Expected Result

- ✅ Cell A2 contains: `"Value"`
- ✅ Edit committed
- ✅ Active cell moved to **A1**

### Excel Behavior

- Matches expected result

---

## Scenario 11: Type → Click Outside Grid → Verify Commit

**Goal:** Verify clicking outside grid commits edit

### Steps

1. Click cell A1
2. Type: `"Test"`
3. Click on the window border or empty space outside grid
4. Check cell A1

### Expected Result

- ✅ Cell A1 contains: `"Test"`
- ✅ Edit committed

### Excel Behavior

- Matches (clicking window chrome commits)

---

## Scenario 12: Formula Bar Sync

**Goal:** Verify formula bar and in-cell editor stay synced

### Steps

1. Click cell A1
2. Type: `"Hello"`
3. Observe formula bar
4. Click in formula bar
5. Type: `" World"` in formula bar
6. Observe cell
7. Press **Enter**

### Expected Result

- ✅ Formula bar shows `"Hello"` after step 2
- ✅ Typing in formula bar updates cell in real-time
- ✅ Cell shows `"Hello World"` during edit
- ✅ Final value: `"Hello World"`

### Excel Behavior

- Formula bar and cell are perfectly synced
- VectorSheet should match this

---

## Scenario 13: F2 Mode Cycling

**Goal:** Verify F2 cycles between Edit and Enter modes

### Steps

1. Click cell A1 (contains `"Test"`)
2. Press **F2**
   - Mode: **Edit** (cursor at end)
3. Press **F2** again
   - Mode: **Enter** (text selected)
4. Press **F2** again
   - Mode: **Edit**

### Expected Result

- ✅ First F2: Edit mode, cursor at end
- ✅ Second F2: Enter mode, text selected
- ✅ Cycles correctly

### Excel Behavior

- F2 cycles: Edit → Enter → Edit → ...
- If formula: Edit → Point → Enter → Edit

---

## Scenario 14: Undo/Redo Should Commit Edit

**Goal:** Verify Undo/Redo commit current edit

### Steps

1. Click cell A1, type `"Old"`
2. Press **Enter**
3. Click cell A1, type `"New"`
4. Press **Ctrl+Z** (Undo)
5. Check cell A1

### Expected Result

- ✅ Undo commits current edit first
- ✅ Cell A1 contains: `"New"` (committed)
- ✅ Second Undo would change to `"Old"`

### Excel Behavior

- Undo commits edit before undoing
- Note: `preserveEdit={false}` on Undo button prevents this issue

---

## Scenario 15: Cut/Copy/Paste Should Commit Edit

**Goal:** Verify clipboard operations commit edit

### Steps

1. Click cell A1, type `"Test"`
2. Press **Ctrl+C** (Copy)
3. Check cell A1

### Expected Result

- ✅ Copy commits current edit
- ✅ Cell A1 contains: `"Test"`

### Excel Behavior

- Clipboard operations commit edit
- Note: `preserveEdit={false}` on clipboard buttons ensures this

---

## Scenario 16: Point Mode (Formula Reference)

**Goal:** Verify Point mode for formula editing

### Steps

1. Click cell A1
2. Type: `"=SUM("`
3. Click cell B1
4. Observe edit buffer
5. Type: `")"`
6. Press **Enter**

### Expected Result

- ✅ Clicking B1 does NOT commit edit
- ✅ Instead inserts reference: `"B1"`
- ✅ Edit buffer shows: `"=SUM(B1)"`
- ✅ Formula evaluates correctly

### Excel Behavior

- Point mode activates for formulas
- Cell clicks insert references
- VectorSheet should match this

---

## Scenario 17: Clicking Same Cell During Edit

**Goal:** Verify clicking the currently edited cell

### Steps

1. Click cell A1
2. Type: `"Hello"`
3. Click cell A1 again (same cell)
4. Observe behavior

### Expected Result

- ✅ Edit continues (no commit/cancel)
- ✅ Cursor repositions to click location
- ✅ Text remains: `"Hello"`

### Excel Behavior

- Matches expected result

---

## Scenario 18: Toolbar During Point Mode

**Goal:** Verify toolbar behavior during formula Point mode

### Steps

1. Click cell A1
2. Type: `"=SUM(B1)"`
3. Click **Bold** button
4. Observe behavior

### Expected Result

- ⚠️ Toolbar may not apply during formula edit
- ✅ Edit session preserved
- ✅ Formula remains editable

### Excel Behavior

- Formatting buttons disabled during formula edit
- VectorSheet may need to disable `editDisabled` for formulas

---

## Scenario 19: Multi-Cell Selection Then Type

**Goal:** Verify typing into multi-cell selection

### Steps

1. Select range A1:A3 (multiple cells)
2. Type: `"Bulk"`
3. Press **Enter**
4. Check cells A1, A2, A3

### Expected Result

- ✅ Only active cell (A1) receives text
- ✅ A1 contains: `"Bulk"`
- ✅ A2, A3 unchanged
- ✅ Active cell moves to A2

### Excel Behavior

- Only active cell in range is edited
- VectorSheet should match

---

## Scenario 20: Edit During Scroll

**Goal:** Verify editing while viewport scrolls

### Steps

1. Click cell A1
2. Type: `"Testing"`
3. Scroll viewport down (wheel or scrollbar)
4. Scroll back up to A1
5. Observe edit state
6. Press **Enter**

### Expected Result

- ✅ Edit session persists during scroll
- ✅ Editor may disappear when off-screen
- ✅ Typing still works (formula bar shows text)
- ✅ Final value: `"Testing"`

### Excel Behavior

- Edit continues during scroll
- Editor auto-scrolls to keep cell visible

---

## Regression Test Checklist

After implementing the fix, verify these don't break:

- [ ] **Basic typing**: Type characters, see them appear
- [ ] **Backspace/Delete**: Remove characters during edit
- [ ] **Arrow keys (Edit mode)**: Move cursor within text
- [ ] **Arrow keys (Enter mode)**: Commit and navigate
- [ ] **Enter commits**: Edit ends, cell moves down
- [ ] **Tab commits**: Edit ends, cell moves right
- [ ] **Escape cancels**: Original value restored
- [ ] **Click another cell**: Edit commits, new cell selected
- [ ] **F2 mode cycle**: Edit ↔ Enter ↔ Point
- [ ] **Formula bar sync**: Typing in bar updates cell
- [ ] **Undo/Redo**: Commits edit before undoing
- [ ] **Cut/Copy/Paste**: Commits edit before operation
- [ ] **Point mode**: Formula cell clicks insert references
- [ ] **Toolbar formatting**: Bold/Italic/Color apply correctly
- [ ] **Dropdown menus**: Font/Size selection works
- [ ] **Color picker**: Color selection works
- [ ] **Multi-cell selection**: Only active cell edits
- [ ] **Scroll during edit**: Session persists
- [ ] **Zoom during edit**: Editor scales correctly

---

## Performance Test Scenarios

### Large Cell Content

1. Paste 10,000 characters into cell
2. Click **Bold** button
3. Verify: No lag, edit continues

### Rapid Toolbar Clicks

1. Type text
2. Click Bold 5 times rapidly
3. Click Italic 5 times rapidly
4. Verify: Edit session stable, no crashes

### Formula Bar Large Content

1. Type very long formula (500+ chars)
2. Click toolbar buttons
3. Verify: No lag, UI responsive

---

## Accessibility Test Scenarios

### Screen Reader

1. Enable screen reader (NVDA/JAWS)
2. Start editing cell
3. Click Bold button
4. Verify: Announces "Bold toggled on/off"
5. Verify: Edit session preserved

### Keyboard-Only

1. Navigate to cell with Tab
2. Press **F2** to edit
3. Type text
4. Press **Alt+H** (Ribbon shortcut)
5. Press **B** (Bold)
6. Verify: Bold applied, edit continues

---

## Browser Compatibility

Test all scenarios in:

- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

Known issues:
- Safari: Input focus quirks
- Firefox: IME composition handling

---

## Summary

| Scenario | Focus | Priority |
|----------|-------|----------|
| 1-7 | Toolbar interactions preserve edit | **CRITICAL** |
| 8-11 | Navigation commits correctly | **HIGH** |
| 12-13 | Formula bar sync, F2 cycling | **MEDIUM** |
| 14-15 | Undo/Redo/Clipboard commit | **HIGH** |
| 16 | Point mode for formulas | **MEDIUM** |
| 17-20 | Edge cases | **LOW** |

**Test Coverage Goal:** All CRITICAL and HIGH scenarios must pass before release.

**Manual Testing Required:** Automated tests cannot fully capture edit session behavior. Manual verification against Excel is essential.
