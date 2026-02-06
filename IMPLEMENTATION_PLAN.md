# Implementation Plan: Excel-Like Inline Editing

## Executive Summary

This plan implements Excel-like inline editing in 3 phases:
- **Phase 1** (Critical): Remove popup overlay, add inline canvas editor
- **Phase 2** (High): Add EditSession with rich text support
- **Phase 3** (Medium): Toolbar integration during edit

**Estimated Time**: Phase 1 = 4 hours, Phase 2 = 6 hours, Phase 3 = 2 hours

---

## Phase 1: Inline Canvas Editor (CRITICAL)

### Goal
Replace floating `CellEditorOverlay` with inline canvas-based editor that renders directly in the cell.

### Files to Modify

#### 1. Create `InlineCellEditor.tsx`
**Location**: `app/src/components/grid/editing/InlineCellEditor.tsx`

**Purpose**: Canvas-based text editor that renders inside cell bounds

**Implementation**:
```typescript
import React, { useRef, useEffect, useCallback } from 'react';
import type { EditModeState } from './useEditMode';

interface InlineCellEditorProps {
  state: EditModeState;
  cellBounds: { x: number; y: number; width: number; height: number };
  getCellValue: (row: number, col: number) => string;
  zoom: number;
}

export function InlineCellEditor(props: InlineCellEditorProps) {
  const { state, cellBounds, zoom } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Render text on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw white background (Excel edit mode indicator)
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw text
    ctx.fillStyle = '#000';
    ctx.font = `${11 * zoom}px Calibri, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText(state.value, 4, canvas.height / 2);

    // Draw caret
    if (state.cursorPosition !== null) {
      const textWidth = ctx.measureText(state.value.slice(0, state.cursorPosition)).width;
      ctx.fillStyle = '#000';
      ctx.fillRect(4 + textWidth, 2, 1, canvas.height - 4);
    }
  }, [state.value, state.cursorPosition, cellBounds, zoom]);

  return (
    <canvas
      ref={canvasRef}
      width={cellBounds.width}
      height={cellBounds.height}
      style={{
        position: 'absolute',
        left: cellBounds.x,
        top: cellBounds.y,
        pointerEvents: 'none', // Input handled by GridViewport
      }}
    />
  );
}
```

#### 2. Update `CellLayer.tsx`
**Location**: `app/src/components/grid/CellLayer.tsx`

**Changes**:
```typescript
// Add inline editor rendering
import { InlineCellEditor } from './editing/InlineCellEditor';

// In render function, after cells:
{editState.isEditing && editState.editingCell && (
  <InlineCellEditor
    state={editState}
    cellBounds={getCellPosition(editState.editingCell.row, editState.editingCell.col)}
    getCellValue={getCellValue}
    zoom={zoom}
  />
)}
```

#### 3. Remove `CellEditorOverlay` usage
**Location**: `app/src/components/GridViewport.tsx`

**Changes**:
```typescript
// DELETE or comment out:
{editState.isEditing && editorPosition && (
  <CellEditorOverlay ... />
)}
```

### Testing
- [ ] Single-click cell → NO popup appears
- [ ] Type "h" → Text appears INSIDE cell, not overlay
- [ ] F2 → Caret appears in cell
- [ ] Double-click → Caret appears at click position
- [ ] Long text → Overflows into adjacent cells (not clipped)

---

## Phase 2: EditSession Model (HIGH PRIORITY)

### Goal
Add rich text support to edit buffer (character-level formatting).

### Files to Create

#### 1. `EditSession.ts`
**Location**: `app/src/components/grid/editing/EditSession.ts`

**Implementation**:
```typescript
import type { CellFormat } from '../../../../../engine/core/types/index';

export interface FormatSpan {
  start: number;
  end: number;
  format: Partial<CellFormat>;
}

export interface EditSession {
  text: string;
  formatSpans: FormatSpan[];
  cursor: number;
  selection: { start: number; end: number } | null;
  baseCellFormat: Partial<CellFormat>;
  isFormula: boolean;
}

export class EditSessionManager {
  private session: EditSession | null = null;

  createSession(initialText: string, baseCellFormat: Partial<CellFormat>): EditSession {
    this.session = {
      text: initialText,
      formatSpans: [{
        start: 0,
        end: initialText.length,
        format: baseCellFormat,
      }],
      cursor: initialText.length,
      selection: null,
      baseCellFormat,
      isFormula: initialText.startsWith('='),
    };
    return this.session;
  }

  insertText(text: string): void {
    if (!this.session) return;

    const { cursor, selection } = this.session;

    if (selection) {
      // Replace selection
      const before = this.session.text.slice(0, selection.start);
      const after = this.session.text.slice(selection.end);
      this.session.text = before + text + after;
      this.session.cursor = selection.start + text.length;
      this.session.selection = null;
    } else {
      // Insert at cursor
      const before = this.session.text.slice(0, cursor);
      const after = this.session.text.slice(cursor);
      this.session.text = before + text + after;
      this.session.cursor = cursor + text.length;
    }

    // Update format spans
    this.updateFormatSpansAfterInsert(cursor, text.length);
  }

  applyFormat(format: Partial<CellFormat>): void {
    if (!this.session) return;

    const { cursor, selection } = this.session;

    if (selection) {
      // Apply to selection
      this.applyFormatToRange(selection.start, selection.end, format);
    } else {
      // Apply from cursor forward (Excel behavior)
      this.applyFormatToRange(cursor, this.session.text.length, format);
    }
  }

  private applyFormatToRange(start: number, end: number, format: Partial<CellFormat>): void {
    // Split existing spans and merge format
    // Complex logic - see full implementation in actual file
  }

  toPlainText(): string {
    return this.session?.text ?? '';
  }

  toRichText(): { text: string; runs: FormatSpan[] } {
    return {
      text: this.session?.text ?? '',
      runs: this.session?.formatSpans ?? [],
    };
  }
}
```

#### 2. Update `InlineCellEditor.tsx`
**Changes**: Render formatted text spans

```typescript
// In render function:
const renderFormattedText = (ctx: CanvasRenderingContext2D, session: EditSession) => {
  let x = 4;
  const y = canvas.height / 2;

  for (const span of session.formatSpans) {
    const text = session.text.slice(span.start, span.end);

    // Apply format
    const fontFamily = span.format.fontFamily ?? 'Calibri';
    const fontSize = (span.format.fontSize ?? 11) * zoom;
    const isBold = span.format.bold ?? false;
    const isItalic = span.format.italic ?? false;

    ctx.font = `${isItalic ? 'italic ' : ''}${isBold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
    ctx.fillStyle = span.format.fontColor ?? '#000';

    // Draw text
    ctx.fillText(text, x, y);

    // Advance position
    x += ctx.measureText(text).width;
  }
};
```

### Testing
- [ ] Type "Good soul"
- [ ] Select "soul" → Click Bold → "soul" becomes bold
- [ ] Edit session preserved (not committed)
- [ ] Formula bar shows formatted text

---

## Phase 3: Toolbar Integration (MEDIUM PRIORITY)

### Goal
Prevent edit session loss when clicking toolbar buttons.

### Files to Modify

#### 1. `RibbonButton.tsx`
**Location**: `app/src/components/ribbon/RibbonButton.tsx`

**Changes**:
```typescript
export function RibbonButton(props: RibbonButtonProps) {
  return (
    <button
      data-preserve-edit="true"  // ← ADD THIS
      onMouseDown={(e) => {
        e.preventDefault();  // ← ADD THIS (prevents blur)
      }}
      onClick={props.onClick}
      className={props.className}
    >
      {props.children}
    </button>
  );
}
```

#### 2. `IntentHandler.ts`
**Location**: `app/src/components/grid/IntentHandler.ts`

**Add new intent type**:
```typescript
export interface ApplyFormatToEditSessionIntent extends BaseIntent {
  type: 'ApplyFormatToEditSession';
  format: Partial<CellFormat>;
}

export type SpreadsheetIntent =
  | /* existing types */
  | ApplyFormatToEditSessionIntent;
```

**Add handler**:
```typescript
case 'ApplyFormatToEditSession': {
  // This is handled in useEditModeIntegration, not here
  // Just pass through
  return { applyFormatToEditSession: intent.format };
}
```

#### 3. `useEditModeIntegration.ts`
**Location**: `app/src/components/grid/editing/useEditModeIntegration.ts`

**Add handler**:
```typescript
case 'ApplyFormatToEditSession': {
  if (currentEditState.isEditing) {
    // Apply to edit session (character-level)
    editSessionManager.applyFormat(intent.format);
    return { handled: true, result: {} };
  }
  // Not editing, fall through to normal ApplyFormat
  return { handled: false, result: {} };
}
```

#### 4. `TopBar.tsx` and `Ribbon.tsx`
**Changes**: Emit new intent type

```typescript
// OLD:
onClick={() => onIntent({ type: 'ApplyFormat', format: { bold: true } })}

// NEW:
onClick={() => onIntent({ type: 'ApplyFormatToEditSession', format: { bold: true } })}
```

### Testing
- [ ] Type "Good soul"
- [ ] Click Bold button
- [ ] Edit session preserved (text still visible)
- [ ] Click Bold again
- [ ] "Good soul" becomes bold (whole text, since no selection)
- [ ] Continue typing → new text is bold

---

## State Diagram

```
┌───────────────────────────────────────────────────────────────────┐
│                       EDIT SESSION LIFECYCLE                       │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  START: User types or presses F2                                 │
│    ↓                                                              │
│  ┌──────────────────────────────────────┐                        │
│  │ CREATE EDIT SESSION                  │                        │
│  │ - text = cell value or ""            │                        │
│  │ - formatSpans = [default format]     │                        │
│  │ - cursor = end                       │                        │
│  └──────────────────────────────────────┘                        │
│    ↓                                                              │
│  ┌──────────────────────────────────────┐                        │
│  │ EDITING LOOP                         │                        │
│  │                                      │                        │
│  │  User types                          │                        │
│  │    → insertText()                    │                        │
│  │    → update formatSpans              │                        │
│  │                                      │                        │
│  │  User clicks Bold                    │                        │
│  │    → applyFormat({bold:true})        │                        │
│  │    → merge into formatSpans          │                        │
│  │    → session PRESERVED               │                        │
│  │                                      │                        │
│  │  User selects text                   │                        │
│  │    → setSelection(start, end)        │                        │
│  │                                      │                        │
│  │  User clicks Bold (with selection)   │                        │
│  │    → applyFormat to range            │                        │
│  │    → split formatSpans               │                        │
│  └──────────────────────────────────────┘                        │
│    ↓                                                              │
│  COMMIT: User presses Enter / clicks another cell               │
│    ↓                                                              │
│  ┌──────────────────────────────────────┐                        │
│  │ SERIALIZE SESSION                    │                        │
│  │ - Phase 1: toPlainText() → engine    │                        │
│  │ - Phase 2: toRichText() → engine     │                        │
│  └──────────────────────────────────────┘                        │
│    ↓                                                              │
│  DESTROY SESSION                                                 │
│                                                                   │
│  CANCEL: User presses Escape                                     │
│    ↓                                                              │
│  DESTROY SESSION (discard changes)                               │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## Migration Steps

### Step 1: Phase 1 Implementation (Inline Editor)
```bash
# Create new inline editor
touch app/src/components/grid/editing/InlineCellEditor.tsx

# Update CellLayer to use it
# Update GridViewport to remove overlay
# Test rendering
```

### Step 2: Phase 2 Implementation (EditSession)
```bash
# Create EditSession model
touch app/src/components/grid/editing/EditSession.ts

# Update InlineCellEditor to use EditSession
# Test rich text rendering
```

### Step 3: Phase 3 Implementation (Toolbar)
```bash
# Update RibbonButton to prevent blur
# Add new intent type
# Update intent handlers
# Test toolbar interaction
```

---

## Rollback Plan

If issues arise, phases can be rolled back independently:

**Phase 1 Rollback**:
- Restore `CellEditorOverlay` in `GridViewport.tsx`
- Remove `InlineCellEditor` from `CellLayer.tsx`

**Phase 2 Rollback**:
- Remove `EditSession` model
- Revert `InlineCellEditor` to plain text rendering

**Phase 3 Rollback**:
- Remove `data-preserve-edit` from `RibbonButton`
- Revert to `ApplyFormat` intent (cell-level)

---

## Performance Considerations

### Canvas Rendering
- Text drawn once per edit (not per frame)
- Caret animation: requestAnimationFrame (60fps)
- Selection rendering: canvas rect (hardware accelerated)

### Format Span Merging
- O(n) where n = number of existing spans
- Typical case: 1-5 spans per cell (fast)
- Worst case: 100+ spans (still <1ms)

### Memory Usage
- EditSession: ~1KB per edit session (1 active at a time)
- formatSpans array: ~100 bytes per span
- Negligible impact on 8GB+ systems

---

## Testing Plan

### Manual Tests

#### Test 1: Inline Rendering
1. Click cell A1
2. Type "hello"
3. **Expected**: Text appears INSIDE cell, not popup
4. **Expected**: Caret visible after "hello"

#### Test 2: Rich Text Edit
1. Type "Good morning world"
2. Select "morning" (click-drag)
3. Click Bold button
4. **Expected**: "morning" is bold, rest is normal
5. **Expected**: Edit session preserved

#### Test 3: Toolbar Interaction
1. Type "test"
2. Click Bold button
3. **Expected**: Edit NOT committed
4. **Expected**: Text still visible
5. Type " text"
6. **Expected**: " text" is also bold

#### Test 4: Commit/Cancel
1. Type "hello"
2. Click another cell
3. **Expected**: "hello" saved to first cell
4. Type "world"
5. Press Escape
6. **Expected**: "world" discarded

### Automated Tests (Vitest)

```typescript
// app/src/components/grid/editing/EditSession.test.ts

describe('EditSession', () => {
  it('should insert text at cursor', () => {
    const session = new EditSessionManager();
    session.createSession('', {});
    session.insertText('hello');
    expect(session.toPlainText()).toBe('hello');
  });

  it('should apply format to selection', () => {
    const session = new EditSessionManager();
    session.createSession('Good morning', {});
    session.setSelection(5, 12); // "morning"
    session.applyFormat({ bold: true });
    const richText = session.toRichText();
    expect(richText.runs[1].format.bold).toBe(true);
  });

  it('should merge adjacent spans with same format', () => {
    // Test format span optimization
  });
});
```

---

## Summary

**Total Files Modified**: ~8
**Total Files Created**: ~3
**Estimated Lines of Code**: ~800

**Critical Path**:
Phase 1 → Phase 2 → Phase 3

**Backward Compatibility**: ✅ 100%
**Engine Changes**: ❌ None
**Intent System**: ✅ Preserved
**Performance**: ✅ No regressions

**Risk Level**: MEDIUM
- Phase 1: Low risk (isolated change)
- Phase 2: Medium risk (new state model)
- Phase 3: Low risk (UI-only)
