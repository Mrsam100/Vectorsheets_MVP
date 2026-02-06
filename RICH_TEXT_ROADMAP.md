# Rich Text Roadmap - Character-Level Formatting

## Overview

This document outlines the path from VectorSheet's current **cell-level formatting** to Excel-compatible **character-level formatting** (rich text). This enables users to apply bold, italic, color, and other formats to individual characters within a cell.

## Current State (Cell-Level Only)

### Engine Model

```typescript
// engine/core/types/index.ts
interface Cell {
  value: string | number | boolean | null;
  format?: CellFormat;  // ← Applied to ENTIRE cell
  formula?: string;
  // ...
}

interface CellFormat {
  bold?: boolean;
  italic?: boolean;
  underline?: 0 | 1 | 2;
  strikethrough?: boolean;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  backgroundColor?: string;
  // ...
}
```

### Limitations

- **Entire cell has one format**: "Hello World" cannot have "Hello" normal and "World" bold
- **Toolbar during edit**: Currently commits edit instead of applying format to selection
- **No character ranges**: Format applies universally

## Target State (Character-Level)

### Desired User Experience

```
User types: "Good morning"
User selects: "morning" (with mouse or Shift+Arrows)
User clicks: Bold button
Result: "Good **morning**" (mixed formatting)
```

### Data Model

```typescript
// New type: FormattedText (rich text cell value)
interface FormattedText {
  text: string;           // Plain text content
  runs: FormatRun[];      // Character-level format ranges
}

interface FormatRun {
  start: number;          // Start index (inclusive)
  end: number;            // End index (exclusive)
  format: CellFormat;     // Format for this range
}

// Example:
const cell: FormattedText = {
  text: "Good morning",
  runs: [
    { start: 0, end: 5, format: { bold: false } },        // "Good "
    { start: 5, end: 12, format: { bold: true } },        // "morning"
  ]
};
```

### Updated Cell Type

```typescript
interface Cell {
  value: string | number | boolean | FormattedText | null;  // ← NEW: FormattedText
  format?: CellFormat;  // Fallback/default format
  formula?: string;
}
```

## Implementation Phases

### Phase 1: ✅ Preserve Edit Session (COMPLETED)

**Goal:** Toolbar clicks during edit do NOT cancel the session.

**Changes Made:**
1. ✅ Added `data-preserve-edit` attribute to formatting buttons
2. ✅ Updated `CellEditorOverlay` blur handler to check attribute
3. ✅ Toolbar clicks now preserve edit session
4. ✅ Format still applies to entire cell (cell-level)

**Outcome:** Users can click Bold/Italic while editing without losing their work.

---

### Phase 2: ✅ EditSession Model (COMPLETED)

**Goal:** UI-side wrapper to track pending formats.

**Changes Made:**
1. ✅ Created `EditSessionManager` class
2. ✅ Tracks `pendingFormat` during edit
3. ✅ Merges pending format on commit
4. ✅ Placeholder methods for future character-level formatting

**Outcome:** Infrastructure ready for deferred format application.

---

### Phase 3: Rich Text Engine Support (FUTURE)

**Goal:** Engine can store and process `FormattedText` values.

**Required Changes:**

#### 3.1 Core Types

```typescript
// engine/core/types/index.ts

export interface FormattedText {
  text: string;
  runs: FormatRun[];
}

export interface FormatRun {
  start: number;
  end: number;
  format: Partial<CellFormat>;
}

// Update Cell type
export type CellValue = string | number | boolean | FormattedText | null;

export interface Cell {
  value: CellValue;  // ← Updated
  format?: CellFormat;
  formula?: string;
  // ...
}
```

#### 3.2 SparseDataStore

```typescript
// engine/core/data/SparseDataStore.ts

setCell(row: number, col: number, value: CellValue): void {
  // Handle FormattedText
  if (isFormattedText(value)) {
    // Store runs in cell metadata
    const cell: Cell = {
      value,
      // ...
    };
    this.data.set(toKey(row, col), cell);
  } else {
    // Existing logic for primitives
  }
}

function isFormattedText(value: any): value is FormattedText {
  return value && typeof value === 'object' && 'text' in value && 'runs' in value;
}
```

#### 3.3 FormulaEngine

```typescript
// engine/core/formula/FormulaEngine.ts

// When evaluating formulas, extract plain text from FormattedText
getCellValue(row: number, col: number): string | number | boolean | null {
  const cell = this.dataStore.getCell(row, col);
  if (!cell?.value) return null;

  // If FormattedText, extract plain text
  if (isFormattedText(cell.value)) {
    return cell.value.text;
  }

  return cell.value;
}
```

---

### Phase 4: Renderer Support (FUTURE)

**Goal:** VirtualRenderer displays mixed formatting.

**Required Changes:**

#### 4.1 Text Measurement

```typescript
// engine/core/rendering/VirtualRenderer.ts

private measureFormattedText(
  formatted: FormattedText,
  cellFormat: CellFormat,
  ctx: CanvasRenderingContext2D
): number {
  let totalWidth = 0;

  for (const run of formatted.runs) {
    // Apply run format (merged with cell format)
    const mergedFormat = { ...cellFormat, ...run.format };
    this.applyFormat(ctx, mergedFormat);

    // Measure this run's text
    const runText = formatted.text.slice(run.start, run.end);
    totalWidth += ctx.measureText(runText).width;
  }

  return totalWidth;
}
```

#### 4.2 Text Rendering

```typescript
private renderFormattedText(
  ctx: CanvasRenderingContext2D,
  formatted: FormattedText,
  cellFormat: CellFormat,
  x: number,
  y: number
): void {
  let currentX = x;

  for (const run of formatted.runs) {
    const mergedFormat = { ...cellFormat, ...run.format };
    this.applyFormat(ctx, mergedFormat);

    const runText = formatted.text.slice(run.start, run.end);
    ctx.fillText(runText, currentX, y);

    currentX += ctx.measureText(runText).width;
  }
}
```

---

### Phase 5: UI Integration (FUTURE)

**Goal:** CellEditorOverlay applies format to selected text range.

**Required Changes:**

#### 5.1 EditSessionManager Enhancement

```typescript
// Already has placeholder methods - implement them:

applyFormatToRange(start: number, end: number, format: Partial<CellFormat>): void {
  if (!this.session.runs) {
    // Initialize runs from cell format
    this.session.runs = [{
      start: 0,
      end: this.session.text.length,
      format: this.session.baseCellFormat || {}
    }];
  }

  // Split runs at start/end positions
  this.splitRunsAt(start);
  this.splitRunsAt(end);

  // Apply format to runs in range
  for (const run of this.session.runs) {
    if (run.start >= start && run.end <= end) {
      run.format = { ...run.format, ...format };
    }
  }

  // Optimize (merge adjacent runs with identical formats)
  this.session.runs = optimizeFormatRuns(this.session.runs);
}
```

#### 5.2 CellEditorOverlay

```typescript
// app/src/components/grid/editing/CellEditorOverlay.tsx

const handleBoldClick = () => {
  const selection = inputRef.current?.selectionStart;
  const selectionEnd = inputRef.current?.selectionEnd;

  if (selection !== undefined && selectionEnd !== undefined && selection !== selectionEnd) {
    // Apply bold to selected range
    editSessionManager.applyFormatToRange(selection, selectionEnd, { bold: true });
  } else {
    // Apply bold from cursor forward (toggle pending format)
    editSessionManager.applyPendingFormat({ bold: true });
  }
};
```

---

### Phase 6: Clipboard Support (FUTURE)

**Goal:** Copy/paste preserves character-level formatting.

**Required Changes:**

#### 6.1 ClipboardManager

```typescript
// engine/core/managers/ClipboardManager.ts

copy(range: CellRange): ClipboardData {
  const cells: ClipboardCell[] = [];

  for (let row = range.startRow; row <= range.endRow; row++) {
    for (let col = range.startCol; col <= range.endCol; col++) {
      const cell = this.dataStore.getCell(row, col);

      if (cell && isFormattedText(cell.value)) {
        // Include runs in clipboard
        cells.push({
          row: row - range.startRow,
          col: col - range.startCol,
          value: cell.value,  // FormattedText with runs
          format: cell.format,
        });
      } else {
        // Existing logic for primitives
      }
    }
  }

  return { cells, range };
}
```

#### 6.2 HTML Clipboard Format

```typescript
// Convert FormattedText to HTML for system clipboard

function formattedTextToHTML(formatted: FormattedText): string {
  let html = '<span>';

  for (const run of formatted.runs) {
    const style = formatToCSS(run.format);
    const runText = formatted.text.slice(run.start, run.end);
    html += `<span style="${style}">${escapeHTML(runText)}</span>`;
  }

  html += '</span>';
  return html;
}

function formatToCSS(format: Partial<CellFormat>): string {
  const styles: string[] = [];
  if (format.bold) styles.push('font-weight: bold');
  if (format.italic) styles.push('font-style: italic');
  if (format.fontColor) styles.push(`color: ${format.fontColor}`);
  // ...
  return styles.join('; ');
}
```

---

### Phase 7: Fill Handle Support (FUTURE)

**Goal:** Auto-fill preserves rich text formatting.

**Required Changes:**

```typescript
// engine/core/managers/FillManager.ts

fillRange(source: CellRange, target: CellRange): void {
  // ...existing logic...

  if (isFormattedText(sourceCell.value)) {
    // Clone FormattedText with deep copy of runs
    const clonedValue: FormattedText = {
      text: sourceCell.value.text,
      runs: sourceCell.value.runs.map(run => ({
        start: run.start,
        end: run.end,
        format: { ...run.format }
      }))
    };

    targetCell.value = clonedValue;
  }
}
```

---

## Migration Strategy

### Backward Compatibility

**Existing cells (primitives):**
- No change needed
- `value: "Hello"` continues to work
- Cell-level `format` applies to entire value

**New cells (rich text):**
- `value: { text: "Hello", runs: [...] }`
- Cell-level `format` is fallback for unformatted runs

### File Format

```json
{
  "cells": [
    {
      "row": 0,
      "col": 0,
      "value": "Simple text",
      "format": { "bold": true }
    },
    {
      "row": 1,
      "col": 0,
      "value": {
        "text": "Mixed formatting",
        "runs": [
          { "start": 0, "end": 5, "format": { "bold": false } },
          { "start": 5, "end": 15, "format": { "bold": true } }
        ]
      },
      "format": { "fontFamily": "Arial" }
    }
  ]
}
```

### Import from Excel

```typescript
// importer/src/ExcelImporter.ts

function importCell(excelCell: any): Cell {
  if (excelCell.richText) {
    // Excel has rich text runs
    const runs: FormatRun[] = excelCell.richText.map(rt => ({
      start: rt.start,
      end: rt.end,
      format: convertExcelFormat(rt.format)
    }));

    return {
      value: {
        text: excelCell.text,
        runs
      }
    };
  } else {
    // Plain text
    return {
      value: excelCell.text,
      format: convertExcelFormat(excelCell.format)
    };
  }
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// engine/core/editing/EditSessionManager.test.ts

describe('EditSessionManager - Rich Text', () => {
  it('should apply bold to selected range', () => {
    const manager = new EditSessionManager();
    manager.startSession({ row: 0, col: 0 }, 'Hello World');
    manager.setSelection(6, 11); // "World"

    manager.applyFormatToRange(6, 11, { bold: true });

    const formatted = manager.toFormattedText();
    expect(formatted.runs).toEqual([
      { start: 0, end: 6, format: { bold: false } },
      { start: 6, end: 11, format: { bold: true } },
    ]);
  });

  it('should merge adjacent runs with identical formats', () => {
    const manager = new EditSessionManager();
    manager.startSession({ row: 0, col: 0 }, 'ABC');
    manager.applyFormatToRange(0, 1, { bold: true });
    manager.applyFormatToRange(1, 2, { bold: true });

    const formatted = manager.toFormattedText();
    // Should merge into single run
    expect(formatted.runs).toHaveLength(2);
    expect(formatted.runs[0]).toEqual({ start: 0, end: 2, format: { bold: true } });
  });
});
```

### Integration Tests

```typescript
describe('Rich Text Integration', () => {
  it('should preserve formatting through copy-paste', () => {
    const engine = new SpreadsheetEngine();
    engine.setCell(0, 0, {
      text: 'Bold Text',
      runs: [{ start: 0, end: 9, format: { bold: true } }]
    });

    engine.copy({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
    engine.paste(1, 0);

    const copied = engine.getCell(1, 0);
    expect(isFormattedText(copied.value)).toBe(true);
    expect((copied.value as FormattedText).runs[0].format.bold).toBe(true);
  });
});
```

### Manual Test Scenarios

1. **Basic Formatting:**
   - Type "Hello World"
   - Select "World", click Bold
   - Result: "Hello **World**"

2. **Multiple Formats:**
   - Type "Test"
   - Select "T", apply Bold
   - Select "e", apply Italic
   - Result: "**T***e*st"

3. **Copy-Paste:**
   - Create rich text cell
   - Copy to another cell
   - Verify formatting preserved

4. **Fill Handle:**
   - Create rich text cell
   - Drag fill handle
   - Verify formatting copied

---

## Performance Considerations

### Rendering Optimization

- **Canvas caching**: Pre-render formatted text to off-screen canvas
- **Run merging**: Minimize run count via `optimizeFormatRuns()`
- **Lazy formatting**: Only format visible cells during scroll

### Memory Optimization

- **Run deduplication**: Share format objects between runs
- **Sparse runs**: Only store runs that differ from cell format
- **String interning**: Reuse identical format objects

---

## Summary: Roadmap Phases

| Phase | Status | Scope | Impact |
|-------|--------|-------|--------|
| Phase 1 | ✅ Complete | Preserve edit on toolbar clicks | UI only |
| Phase 2 | ✅ Complete | EditSession model | UI only |
| Phase 3 | 🔜 Next | Engine FormattedText support | Engine core |
| Phase 4 | 🔜 Future | Renderer mixed formatting | Rendering |
| Phase 5 | 🔜 Future | UI character selection | UI integration |
| Phase 6 | 🔜 Future | Clipboard rich text | Clipboard |
| Phase 7 | 🔜 Future | Fill handle rich text | Fill manager |

**Current Status:** MVP complete (Phases 1-2). Users can now click toolbar buttons during edit without losing work. Format applies to entire cell for now.

**Next Step:** Phase 3 - Add `FormattedText` type to engine and update `SparseDataStore` / `FormulaEngine` to handle it.
