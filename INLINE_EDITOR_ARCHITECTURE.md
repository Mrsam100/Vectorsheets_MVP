# Inline Editor Architecture Design

## Design Constraints

### Must Preserve
✅ **Intent-based architecture** - All mutations via SpreadsheetIntent
✅ **EditModeManager authority** - Engine owns edit state
✅ **No engine contract changes** - SpreadsheetEngine API stays stable
✅ **VirtualRenderer untouched** - No changes to viewport calculation
✅ **No new mousemove handlers** - Use existing PointerAdapter

### Must Change
❌ **CellEditorOverlay** - Remove popup, render inline
❌ **EditSession model** - Add rich text support
❌ **Toolbar integration** - Preserve edit on button click
❌ **Focus management** - Excel-like behavior

---

## Part 1: EditSession Model

### Current State (EditModeManager)

```typescript
// engine/core/editing/EditModeManager.ts
interface EditState {
  isEditing: boolean;
  mode: 'navigate' | 'enter' | 'edit' | 'point';
  editingCell: CellRef | null;
  value: string;  // ← PLAIN TEXT ONLY
  cursorPosition: number;
  textSelection: { start: number; end: number } | null;
}
```

**Limitation**: `value` is plain string, no formatting

### Proposed: Rich Edit Session

```typescript
// app/src/components/grid/editing/types.ts (NEW FILE)

/**
 * Character-level format span (like Excel format runs)
 */
export interface FormatSpan {
  start: number;      // Character index (inclusive)
  end: number;        // Character index (exclusive)
  format: Partial<CellFormat>;
}

/**
 * Rich text edit session
 * Maintains text + character-level formatting during edit
 */
export interface EditSession {
  /** Plain text content */
  text: string;

  /** Character-level format runs */
  formatSpans: FormatSpan[];

  /** Cursor position (0-indexed) */
  cursor: number;

  /** Text selection range (null if no selection) */
  selection: { start: number; end: number } | null;

  /** Base cell format (inherited when no span covers character) */
  baseCellFormat: Partial<CellFormat>;

  /** Is this a formula (starts with =) */
  isFormula: boolean;
}

/**
 * Actions to mutate EditSession (UI layer only, not engine)
 */
export interface EditSessionActions {
  /** Insert text at cursor (or replace selection) */
  insertText(text: string): void;

  /** Delete text (backspace or delete key) */
  deleteText(direction: 'backward' | 'forward', count?: number): void;

  /** Apply format to selection (or from cursor forward if no selection) */
  applyFormat(format: Partial<CellFormat>): void;

  /** Set cursor position */
  setCursor(position: number): void;

  /** Set text selection */
  setSelection(start: number, end: number): void;

  /** Clear selection (keep cursor) */
  clearSelection(): void;

  /** Get format at cursor position (for toolbar state) */
  getFormatAtCursor(): Partial<CellFormat>;

  /** Serialize to plain text (for commit to engine) */
  toPlainText(): string;

  /** Serialize to rich text cell value (when engine supports it) */
  toRichText(): { text: string; runs: FormatSpan[] };
}
```

**Key Points**:
- Lives in **UI layer** (app/src), not engine
- Engine continues to receive plain text on commit
- Rich text rendering is **presentation-only** until engine supports it
- Format spans maintained during edit, discarded on commit (Phase 1)

---

## Part 2: Inline Editor Component

### Current: CellEditorOverlay (Popup)

```tsx
// app/src/components/grid/editing/CellEditorOverlay.tsx (CURRENT)
<div
  style={{
    position: 'absolute',
    zIndex: 50,
    top: cellPosition.y,
    left: cellPosition.x,
    // ↑ PROBLEM: Positioned as overlay, detached from cell
  }}
>
  <textarea>{value}</textarea>
</div>
```

### Proposed: InlineCellEditor (Embedded)

```tsx
// app/src/components/grid/editing/InlineCellEditor.tsx (NEW)

/**
 * Inline cell editor - renders INSIDE the cell layer, not as overlay
 *
 * Architecture:
 * - Rendered by CellLayer for the editing cell
 * - Uses <canvas> text rendering (not DOM input)
 * - Caret drawn as 1px line using canvas rect
 * - Selection drawn as blue highlight rect
 * - Synchronized with FormulaBar
 */

interface InlineCellEditorProps {
  /** Edit session state */
  session: EditSession;

  /** Edit session actions */
  actions: EditSessionActions;

  /** Cell bounds (from VirtualRenderer.getCellRect) */
  cellBounds: { x: number; y: number; width: number; height: number };

  /** Canvas 2D context for rendering */
  ctx: CanvasRenderingContext2D;

  /** Current zoom level */
  zoom: number;

  /** Is formula bar focused (vs cell editor) */
  isFormulaBarFocused: boolean;
}

export function InlineCellEditor(props: InlineCellEditorProps) {
  const { session, actions, cellBounds, ctx, zoom } = props;

  // Render text with format spans
  const renderRichText = () => {
    let x = cellBounds.x + 2; // 2px padding
    const y = cellBounds.y + cellBounds.height / 2;

    for (const span of session.formatSpans) {
      const text = session.text.slice(span.start, span.end);

      // Apply format to canvas context
      ctx.font = formatToFont(span.format);
      ctx.fillStyle = span.format.fontColor || '#000';

      // Draw text
      ctx.fillText(text, x, y);

      // Advance x position
      const metrics = ctx.measureText(text);
      x += metrics.width;
    }
  };

  // Render caret (blinking 1px line)
  const renderCaret = () => {
    if (!session.selection) {
      const caretX = getCaretXPosition(session.cursor);
      ctx.fillStyle = '#000';
      ctx.fillRect(caretX, cellBounds.y + 2, 1, cellBounds.height - 4);
    }
  };

  // Render selection highlight
  const renderSelection = () => {
    if (session.selection) {
      const startX = getCaretXPosition(session.selection.start);
      const endX = getCaretXPosition(session.selection.end);

      ctx.fillStyle = 'rgba(0, 120, 215, 0.3)'; // Excel blue
      ctx.fillRect(startX, cellBounds.y, endX - startX, cellBounds.height);
    }
  };

  return (
    <>
      {/* Background (white during edit, like Excel) */}
      <rect
        x={cellBounds.x}
        y={cellBounds.y}
        width={cellBounds.width}
        height={cellBounds.height}
        fill="#fff"
      />

      {renderRichText()}
      {renderSelection()}
      {renderCaret()}
    </>
  );
}
```

**Rendering Strategy**:
- NOT a DOM `<input>` or `<textarea>`
- Canvas-based text rendering (like Excel)
- Caret = 1px rect drawn every 500ms (requestAnimationFrame)
- Selection = blue overlay rect
- Text measured with `canvas.measureText()` for caret positioning

**Why Canvas**:
✅ Matches grid rendering (already canvas)
✅ No DOM layout reflow
✅ Pixel-perfect alignment with cell bounds
✅ Easy overflow into adjacent cells
❌ Requires manual IME handling (separate component)

---

## Part 3: State Management Flow

### State Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      EDIT MODE STATES                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────┐      type char      ┌─────────────┐            │
│   │ NAVIGATE │ ────────────────────>│ ENTER MODE  │            │
│   │          │                      │             │            │
│   │ Cell     │      F2 / dblclick   │ - Replaces  │            │
│   │ selected │ ─────────────┐       │   content   │            │
│   │ No edit  │              │       │ - Cursor    │            │
│   └──────────┘              │       │   at end    │            │
│        ↑                    │       └─────────────┘            │
│        │                    │             │                    │
│        │                    ▼             │                    │
│        │              ┌─────────────┐     │                    │
│        │              │  EDIT MODE  │<────┘                    │
│        │              │             │                          │
│        │              │ - Preserves │                          │
│        │              │   content   │                          │
│        │              │ - Cursor    │                          │
│   Enter/Tab/         │   at click  │                          │
│   Click cell         └─────────────┘                          │
│   (commits)                │                                   │
│        │                   │ toolbar click                     │
│        │                   │ (ApplyFormatToEditSession)        │
│        │                   ▼                                   │
│        │              ┌─────────────┐                          │
│        └──────────────│  EDIT MODE  │                          │
│                       │ (formatting │                          │
│   Escape              │   applied)  │                          │
│   (cancels)           └─────────────┘                          │
│        ↑                    │                                   │
│        └────────────────────┘                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Event Flow Table

| User Action | Current Intent | Proposed Intent | Edit Session Change | Navigate? |
|-------------|----------------|-----------------|---------------------|-----------|
| Type "h" while NAVIGATE | `StartEdit {initialValue:"h"}` | Same | Create session, text="h", cursor=1 | No |
| Press F2 while NAVIGATE | `StartEdit` | Same | Create session, text=cellValue, cursor=end | No |
| Double-click cell | `BeginEdit` | Same | Create session, text=cellValue, cursor=clickPos | No |
| Click Bold while EDIT | ❌ (cancels) | `ApplyFormatToEditSession {bold:true}` | Add formatSpan to session | No |
| Click another cell | `SetActiveCell` | Same | Commit session → engine | Yes |
| Press Enter | `TabEnterNavigate` | Same | Commit session → engine | Yes |
| Press Escape | `CancelEdit` | Same | Discard session | No |
| Click formula bar | N/A | `FocusFormulaBar` | Transfer focus, keep session | No |

**New Intent**:
```typescript
export interface ApplyFormatToEditSessionIntent extends BaseIntent {
  type: 'ApplyFormatToEditSession';
  format: Partial<CellFormat>;
  // Applied to current selection, or from cursor forward if no selection
}
```

---

## Part 4: Toolbar Integration

### Current Flow (BROKEN)

```
User clicks Bold button
  ↓
<button onClick={() => onIntent({type:'ApplyFormat', ...})}>
  ↓
processIntent in GridViewport
  ↓
SpreadsheetEngine.applyFormat(selection)
  ↓
Edit session lost (blur event fired)
```

### Proposed Flow (FIXED)

```
User clicks Bold button
  ↓
<button
  data-preserve-edit="true"
  onMouseDown={(e) => e.preventDefault()}  // Prevent blur
  onClick={() => onIntent({type:'ApplyFormatToEditSession', ...})}
>
  ↓
processIntent in GridViewport
  ↓
Check: isEditing?
  YES → Apply to EditSession (character-level)
  NO  → Apply to cell selection (cell-level, engine)
  ↓
Edit session PRESERVED
```

**Key Changes**:
1. **Prevent blur**: `onMouseDown={e => e.preventDefault()}`
2. **New intent type**: `ApplyFormatToEditSession`
3. **Conditional routing**: Edit mode vs Navigate mode
4. **Session mutation**: Update formatSpans, don't commit

---

## Part 5: Focus Management

### Excel Focus Rules

```
┌──────────────────────────────────────────────────────────────┐
│  Focus Source       │ Behavior                               │
├──────────────────────────────────────────────────────────────┤
│ Cell editor         │ - Typing goes to cell                  │
│                     │ - Formula bar shows text               │
│                     │ - Caret in cell                        │
├──────────────────────────────────────────────────────────────┤
│ Formula bar         │ - Typing goes to formula bar           │
│                     │ - Cell shows text                      │
│                     │ - Caret in formula bar                 │
├──────────────────────────────────────────────────────────────┤
│ Toolbar button      │ - Edit session PRESERVED               │
│ (Bold/Italic/etc)   │ - Focus returns to previous (cell/bar) │
│                     │ - Format applied, typing continues     │
├──────────────────────────────────────────────────────────────┤
│ Ribbon dropdown     │ - Edit session PRESERVED               │
│ (Font/Size)         │ - Dropdown opens                       │
│                     │ - Format applied on selection          │
└──────────────────────────────────────────────────────────────┘
```

### Implementation

```typescript
// app/src/components/grid/editing/useFocusManager.ts (NEW)

export function useFocusManager(editSession: EditSession | null) {
  const [focusLocation, setFocusLocation] = useState<'cell' | 'formulaBar' | null>(null);
  const lastFocusRef = useRef<'cell' | 'formulaBar'>('cell');

  const handleCellFocus = () => {
    setFocusLocation('cell');
    lastFocusRef.current = 'cell';
  };

  const handleFormulaBarFocus = () => {
    setFocusLocation('formulaBar');
    lastFocusRef.current = 'formulaBar';
  };

  const handleToolbarAction = () => {
    // Toolbar button clicked - return focus to last location
    if (editSession) {
      setFocusLocation(lastFocusRef.current);
    }
  };

  return {
    focusLocation,
    handleCellFocus,
    handleFormulaBarFocus,
    handleToolbarAction,
  };
}
```

---

## Part 6: Backward Compatibility

### Engine Compatibility

**Phase 1: UI-Only Rich Text** (MVP)
```typescript
// On commit, flatten to plain text
editSession.toPlainText() → "Good morning world"
// Format spans discarded
// Engine receives: Cell { value: "Good morning world" }
```

**Phase 2: Engine Rich Text** (Post-MVP)
```typescript
// On commit, send rich text structure
editSession.toRichText() → {
  text: "Good morning world",
  runs: [
    {start: 0, end: 12, format: {}},
    {start: 13, end: 18, format: {bold: true}}
  ]
}
// Engine stores rich text
```

### API Changes

**No Breaking Changes**:
- `EditModeManager` keeps `value: string`
- `SpreadsheetEngine.setCell()` still accepts string
- Rich text is **opt-in** via new `setCellRichText()` method

**New APIs (additive)**:
```typescript
// engine/core/SpreadsheetEngine.ts
interface SpreadsheetEngine {
  // Existing (unchanged)
  setCell(row: number, col: number, value: string): void;

  // New (Phase 2)
  setCellRichText?(row: number, col: number, richText: RichText): void;
  getCellRichText?(row: number, col: number): RichText | null;
}
```

---

## Part 7: Migration Notes

### Phase 1: Inline Editor (No Rich Text)

**Changes**:
- Replace `CellEditorOverlay` with `InlineCellEditor`
- Render text using canvas (not DOM textarea)
- Caret drawn manually (canvas rect)
- No format spans yet (plain text only)

**Benefits**:
✅ Fixes popup overlay issue
✅ Matches Excel visual appearance
✅ No engine changes required

**Limitations**:
❌ Still no character-level formatting
❌ Bold button applies to whole cell

### Phase 2: EditSession with Rich Text

**Changes**:
- Add `EditSession` model with `formatSpans`
- Toolbar buttons emit `ApplyFormatToEditSession`
- Render formatted text spans in InlineCellEditor
- On commit, flatten to plain text (Phase 1) or send rich text (Phase 2)

**Benefits**:
✅ Toolbar buttons preserve edit session
✅ Character-level formatting in UI
✅ Excel-like rich text editing

**Limitations**:
⚠️ Formats discarded on commit until engine supports rich text

### Phase 3: Engine Rich Text Support

**Changes**:
- Update `Cell` type to include `richText?: RichText`
- Update `SparseDataStore` to store rich text
- Update `FormulaEngine` to handle rich text in formulas
- Update serialization (XLSX export/import)

**Benefits**:
✅ Full rich text persistence
✅ Rich text in formulas (e.g., `CONCATENATE` preserves formatting)
✅ XLSX compatibility

---

## Part 8: Component Tree (After Refactor)

```
App
└── SpreadsheetShell
    ├── TopBar
    │   ├── MenuBar
    │   └── Ribbon
    │       └── RibbonButton (data-preserve-edit="true")
    │
    └── GridViewport
        ├── FormulaBar (synced with edit session)
        │
        └── GridProvider
            ├── ColumnHeaders
            ├── RowHeaders
            └── CellLayer
                ├── StaticCells (non-editing cells)
                │
                └── InlineCellEditor (for editing cell)
                    ├── EditSessionProvider (context)
                    ├── RichTextRenderer (canvas-based)
                    ├── CaretRenderer (blinking line)
                    └── SelectionRenderer (blue highlight)
```

**Key Points**:
- `InlineCellEditor` is a **child** of `CellLayer` (not overlay)
- `EditSession` passed via context (not props drilling)
- Ribbon buttons have `data-preserve-edit` attribute
- Formula bar synced with edit session via shared context

---

## Summary: Architecture Principles

1. **Separation of Concerns**:
   - Engine: Plain text storage (Phase 1)
   - UI: Rich text presentation
   - EditSession: Temporary rich text buffer

2. **Intent-Driven**:
   - All mutations via SpreadsheetIntent
   - New intent: `ApplyFormatToEditSession`
   - Toolbar routing based on edit mode

3. **Canvas-First**:
   - Text rendering on canvas (not DOM)
   - Caret and selection drawn manually
   - Matches grid's existing canvas architecture

4. **Backward Compatible**:
   - Engine API unchanged
   - Opt-in rich text support
   - Graceful degradation (formats discarded on commit)

5. **Progressive Enhancement**:
   - Phase 1: Inline editor (fixes popup)
   - Phase 2: Rich text UI (fixes toolbar)
   - Phase 3: Rich text engine (full persistence)
