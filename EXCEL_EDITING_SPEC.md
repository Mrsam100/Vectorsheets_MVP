# Excel Editing Behavior Specification

## Part A: Typing Flow

### 1. Single-Click → Type Behavior

**Excel 2019/365 Observed Behavior**:

```
Step 1: Click empty cell A1
  → Cell border turns blue (selected state)
  → NO editor visible
  → NO caret visible
  → Formula bar shows empty

Step 2: Type "h"
  → Character "h" appears INSIDE the cell (not a popup)
  → Thin blinking caret appears after "h"
  → Formula bar shows "h"
  → Cell background turns white (edit mode indicator)
  → Previous content (if any) is REPLACED

Step 3: Type "ello"
  → Text flows: "hello"
  → Caret moves right with each character
  → Both cell AND formula bar update in sync
```

**Key Observations**:
- **No popup overlay** - Text renders directly in the cell bounds
- **Inline caret** - Standard text cursor, not a separate component
- **Replace mode** - Typing replaces existing content (Enter mode)
- **Dual rendering** - Cell + Formula bar show same content

---

### 2. F2 vs Direct Typing

#### F2 Key Behavior (Edit Mode)

```
Cell A1 contains: "hello"

Step 1: Click A1 → Type F2
  → Caret appears at END of text: "hello|"
  → Cell background turns white
  → Formula bar shows "hello" with caret
  → Existing content is PRESERVED

Step 2: Type "world"
  → Text becomes: "helloworld|"
  → NOT replaced, APPENDED
```

#### Direct Type Behavior (Enter Mode)

```
Cell A1 contains: "hello"

Step 1: Click A1 → Type "w"
  → Existing text VANISHES
  → New text: "w|"
  → Previous "hello" is replaced
```

**Mode Summary**:
| Trigger | Mode | Behavior | Caret Position |
|---------|------|----------|----------------|
| Type char | **Enter Mode** | Replace content | After typed char |
| Press F2 | **Edit Mode** | Keep content | End of text |
| Double-click | **Edit Mode** | Keep content | At click position |

---

### 3. When Caret Appears

**Caret Visibility Rules**:

✅ **Caret IS visible**:
- During typing (Enter or Edit mode)
- After F2 press
- After double-click
- While formula bar is focused
- During text selection (selection handles visible)

❌ **Caret NOT visible**:
- Cell selected but not editing
- After Escape pressed
- After committing edit (Enter/Tab/Click away)
- While dragging selection range

**Caret Rendering**:
- Standard OS text cursor (1px black line)
- Blinks at ~500ms interval
- Position calculated from text metrics (canvas.measureText)
- Z-index above cell content, below selection overlay

---

### 4. In-Cell vs Formula Bar Editing

#### In-Cell Editor

**Characteristics**:
- **Location**: Rendered inside cell boundaries
- **Overflow**: Text exceeds cell width → extends into adjacent cells
- **Font**: Inherits cell's font family/size/color
- **Background**: White (opaque) during edit
- **Z-index**: Above grid, below selection overlay
- **Scrolling**: If text too long, horizontal scroll NOT visible (just overflows)

**Example**:
```
Cell A1 width: 100px
User types: "This is a very long text that exceeds bounds"
Display:
┌─────────────────────────────────────┐
│ A1: This is a very long text that... │ ← Overflows into B1, C1
└─────────────────────────────────────┘
```

#### Formula Bar Editor

**Characteristics**:
- **Location**: Fixed UI element above grid
- **Overflow**: Horizontal scroll appears if needed
- **Font**: Calibri 11pt (fixed, ignores cell format)
- **Background**: White always
- **Sync**: Typing in formula bar updates cell, vice versa
- **Focus**: Click either editor → both show caret

**Synchronization**:
```
User types in cell: "hello"
  → Formula bar shows: "hello"

User clicks formula bar, types " world"
  → Cell shows: "hello world"

Caret position synced across both surfaces
```

---

## Part B: Interaction Rules

### 1. Clicking Ribbon Buttons While Editing

**Excel Behavior**:

```
Scenario: Apply Bold During Edit

Step 1: Cell A1 selected, type "Good soul"
  → Cell shows: "Good soul|"
  → Caret at end

Step 2: Select "soul" (click-drag or Shift+Arrows)
  → Selection: "Good [soul]"
  → Highlighted text turns blue

Step 3: Click Bold button (or Ctrl+B)
  → Edit session CONTINUES
  → "soul" becomes bold
  → Cell shows: "Good **soul**|" (formatting applied)
  → Edit buffer NOT committed
  → Caret still visible

Step 4: Type " here"
  → Text becomes: "Good **soul** here|"
  → New text inherits format BEFORE selection (normal, not bold)
```

**Key Rules**:
- ✅ Edit session PERSISTS when clicking toolbar
- ✅ Format applies to text selection (character-level)
- ✅ If no selection, format applies from cursor forward
- ✅ Typing after format continues edit
- ❌ Edit is NOT committed or canceled

---

### 2. Clicking Another Cell

**Excel Behavior**:

```
Scenario: Edit in progress, click different cell

Step 1: Cell A1, type "hello"
  → Edit buffer: "hello|"

Step 2: Click cell B1
  → A1 edit is COMMITTED (saved to cell)
  → A1 now contains: "hello"
  → B1 becomes active
  → NO edit mode on B1 (just selected)

Step 3: Type "w"
  → B1 enters Enter mode
  → B1 shows: "w|"
```

**Rules**:
- ✅ Clicking another cell COMMITS current edit
- ✅ Calls save operation (value persisted)
- ✅ New cell becomes active
- ❌ Edit is NOT canceled (not discarded)

---

### 3. Pressing Enter / Tab

**Enter Key**:
```
Cell A1, typing "hello|"

Press Enter:
  → Commit edit (save "hello" to A1)
  → Move DOWN to A2
  → A2 selected (not editing)

Press Shift+Enter:
  → Commit edit
  → Move UP to A0 (if exists)
```

**Tab Key**:
```
Cell A1, typing "hello|"

Press Tab:
  → Commit edit
  → Move RIGHT to B1
  → B1 selected (not editing)

Press Shift+Tab:
  → Commit edit
  → Move LEFT (if exists)
```

**Rules**:
- ✅ Always COMMITS edit
- ✅ Triggers navigation
- ✅ Destination cell NOT in edit mode

---

### 4. Clicking Outside Grid

**Excel Behavior**:

```
Scenario: Click toolbar, scroll bar, or ribbon

Step 1: Cell A1, type "hello|"

Step 2: Click Ribbon dropdown (Font Family)
  → Edit session CONTINUES
  → Dropdown opens
  → Caret still visible in cell

Step 3: Select "Arial"
  → Font changes for edit buffer
  → Edit NOT committed
  → Still typing "hello|" in Arial

Alt scenario: Click window border
  → Edit COMMITS
  → Window resized
```

**Rules**:
- ✅ Toolbar/Ribbon clicks PRESERVE edit
- ✅ Window chrome clicks COMMIT edit
- ✅ Scroll bar clicks PRESERVE edit

---

### 5. Selecting Part of Text and Applying Format

**Selection Flow**:

```
Cell A1: "Good morning world"

Step 1: Double-click cell
  → Edit mode: "Good morning world|"
  → Caret at end

Step 2: Shift+Ctrl+Left (select word "world")
  → Selection: "Good morning [world]"

Step 3: Click Bold button
  → "world" becomes bold
  → Text: "Good morning **world**|"
  → Selection cleared, caret after "world"

Step 4: Type "!"
  → Text: "Good morning **world**!|"
  → "!" inherits format BEFORE it (bold)

Step 5: Press Left arrow, type "s"
  → Text: "Good morning **worlds**!|"
  → "s" inserted in bold region, inherits bold
```

**Selection Rules**:
- ✅ Selection works with mouse (click-drag) or Shift+Arrows
- ✅ Format button applies ONLY to selected characters
- ✅ Typing replaces selection
- ✅ New characters inherit format of character BEFORE cursor
- ✅ If at start of text, inherits default cell format

---

## Part C: Rich Text Behavior

### 1. Multiple Formats in One Cell

**Excel Storage Model**:

```typescript
// Conceptual representation (not actual Excel internals)
interface CellWithRichText {
  plainText: "Good morning world";
  formatRuns: [
    { start: 0,  end: 4,  format: { bold: false } },  // "Good"
    { start: 5,  end: 12, format: { bold: false } },  // "morning"
    { start: 13, end: 18, format: { bold: true } },   // "world"
  ];
  cellFormat: { fontFamily: "Calibri", fontSize: 11 }; // Base format
}
```

**Visual Rendering**:
```
Cell displays:
"Good morning world"
      ↑         ↑
   normal     bold
```

**Rules**:
- Each character has independent formatting
- Formats: bold, italic, underline, strikethrough, color, size, family
- Cell-level format is the DEFAULT
- Character format OVERRIDES cell format

---

### 2. Format Applied to Selection

**Granularity**:

```
Text: "Hello world"
Select: "wo"
Apply: Bold

Result runs:
[
  { start: 0,  end: 6,  bold: false },  // "Hello "
  { start: 6,  end: 8,  bold: true },   // "wo"
  { start: 8,  end: 11, bold: false },  // "rld"
]
```

**Multiple Formats**:
```
Text: "Hello"
Step 1: Select "ello", apply Bold
  → "H ello"
       ^^^^
Step 2: Select "ll", apply Italic
  → "H e**ll**o"
        ^^^^
       bold+italic
```

**Format Merging**:
- Formats are CUMULATIVE (bold + italic = both)
- Clicking format button again TOGGLES it
- If selection has mixed formats, button shows "indeterminate" state

---

### 3. No Cancellation of Edit Buffer

**Critical Excel Rule**:

❌ **Never cancels edit on toolbar action**

```
User typing: "This is a test|"

Clicks: Bold button
  → Edit continues: "This is a test|" (now bold from cursor forward)

Clicks: Font dropdown
  → Edit continues, dropdown opens

Clicks: Italic button
  → Edit continues, text becomes bold+italic

Presses: Escape
  → NOW edit is canceled (text discarded)
```

**Only Cancel Triggers**:
- Escape key
- Undo (Ctrl+Z) while editing
- Error in formula (invalid syntax)
- Cell protection violation

**All Other Actions Commit**:
- Enter, Tab, Arrow keys (commit + move)
- Click another cell (commit + select)
- Click formula bar then click outside (commit)

---

## Part D: Additional Observations

### Formula Bar Behavior

**Focus Rules**:
```
Click formula bar while editing cell:
  → Focus moves to formula bar
  → Cell editor remains visible
  → Typing goes to formula bar
  → Cell updates in real-time

Click cell while editing formula bar:
  → Focus moves to cell
  → Formula bar remains visible
  → Typing goes to cell
  → Formula bar updates in real-time
```

**Synchronization**:
- Both surfaces share same edit buffer
- Caret position synced
- Text selection synced
- Format changes reflect in both

---

### Overflow Behavior

**Cell Width Exceeded**:
```
Cell A1 width: 100px
Text: "This is a very long sentence that exceeds the cell width"

Display:
┌──────────────────────────────────────────────────┐
│ A1: This is a very long sentence that exceeds... │
└──────────────────────────────────────────────────┘
     ↑
     Extends into B1, C1 (overlays them)

If B1 has content:
  → A1 text is CLIPPED at B1 border (visual only)
  → Full text still in edit buffer
```

**Vertical Growth**:
- Single-line cells: Text does NOT wrap during edit
- Wrap Text cells: Text wraps, cell height grows
- Alt+Enter: Manual line break (creates multi-line cell)

---

### Point Mode (Formula Editing)

**Special Case**:
```
Cell A1, type: "=SUM("

Behavior:
  → Cell shows: "=SUM(|"
  → Formula bar shows: "=SUM(|"
  → Grid enters "Point mode"
  → Clicking cell B1 DOES NOT commit
  → Instead: Inserts "B1" into formula
  → Text becomes: "=SUM(B1|"
  → Click-drag B1:B5 inserts "B1:B5"
```

**Point Mode Rules**:
- Triggered by "=" character
- Cells clicked are converted to references
- Clicking outside grid commits formula
- Escape exits Point mode without committing

---

## Summary: Core Principles

1. **Inline Editing**: No popup overlay, text renders in cell
2. **Persistent Session**: Toolbar clicks do NOT cancel edit
3. **Rich Text**: Character-level formatting (not cell-level)
4. **Dual Surface**: Cell + Formula bar synced
5. **Commit vs Cancel**: Most actions commit, only Escape cancels
6. **Replace vs Append**: Type = replace, F2 = append
7. **Format Inheritance**: New chars inherit format before cursor

---

## Comparison: VectorSheet vs Excel

| Aspect | Excel | Current VectorSheet | Gap |
|--------|-------|---------------------|-----|
| Editor location | In-cell | Popup overlay | ❌ Architecture change |
| Format granularity | Character-level | Cell-level | ❌ Engine change |
| Toolbar during edit | Preserves session | Cancels edit | ❌ Focus management |
| Click another cell | Commits | Commits | ✅ Correct |
| Typing mode | Enter vs Edit | Only Edit | ⚠️ Mode missing |
| Formula bar sync | Real-time | Independent | ⚠️ Sync missing |

**Priority Gaps**:
1. **CRITICAL**: Popup overlay → Inline editor
2. **HIGH**: Character-level formatting support
3. **MEDIUM**: Toolbar preserves edit session
4. **LOW**: Enter vs Edit mode distinction
