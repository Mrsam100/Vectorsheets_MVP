# VectorSheet MVP

High-performance Excel-like spreadsheet application. Monorepo with three packages: `app/` (React UI), `engine/` (spreadsheet engine library), `importer/` (Excel file import).

## Project Structure

```
app/          React frontend (Vite + React 18 + TypeScript + Tailwind CSS 4)
engine/       Spreadsheet engine (TypeScript library, no UI dependencies)
importer/     Excel import (FortuneSheet-based XLSX parser)
```

## Commands

### App (React UI)
```bash
cd app && npm run dev          # Dev server on port 3000
cd app && npm run build        # Production build to dist/
```

### Engine
```bash
cd engine && npm run build          # Compile to dist/
cd engine && npm run check          # Type-check only
cd engine && npm run test           # Run all tests (Vitest)
cd engine && npm run test:watch     # Watch mode
cd engine && npm run test:coverage  # Coverage report
cd engine && npm run harness        # Interactive CLI harness
```

### Importer
```bash
cd importer && npm run prepare      # Build
cd importer && npm run storybook    # Storybook on port 6006
```

## Architecture

- **Engine-first**: All business logic lives in `engine/core/`. The React UI is a thin presentation layer.
- **SpreadsheetEngine** (`engine/core/SpreadsheetEngine.ts`) is the central orchestrator. Subsystems: SparseDataStore, FormulaEngine, VirtualRenderer, SelectionManager, NavigationManager, EditModeManager, ClipboardManager, UndoRedoManager, FormatPainter, MergeManager, SortFilter, FindReplace, DataValidation, ConditionalFormatting, NumberFormat.
- **SparseDataStore** uses `Map<"row_col", Cell>` for O(1) access, supporting 1M+ rows.
- **FormulaEngine** has a DependencyGraph for incremental recalculation and circular reference detection.
- **VirtualRenderer** handles viewport calculation with frozen pane support and buffer zones.
- **React UI hierarchy**: `App > ThemeProvider > SpreadsheetShell > {TopBar, GridViewport, StatusBar, dialogs}`. SpreadsheetShell is the main orchestrator component.
- **GridViewport** contains: ColumnHeaders, RowHeaders, CellLayer, SelectionOverlay, FillHandleOverlay, FormatPainterOverlay, CellEditorOverlay.

## Key Types

Core types are in `engine/core/types/index.ts`: Cell, CellFormat, Selection, CellRange, RenderCell, Viewport.

## Testing

- Framework: Vitest with v8 coverage
- Tests are colocated: `*.test.ts` next to source files in `engine/core/`
- Pattern: `import { describe, it, expect, beforeEach } from 'vitest'`
- Run a single test: `cd engine && npx vitest run path/to/file.test.ts`

## Code Conventions

- Strict TypeScript everywhere (`strict: true`)
- ES Modules (`"type": "module"`)
- React components use default exports; engine modules use named exports
- JSX transform: `react-jsx` (no `import React` needed)
- Tailwind CSS for styling with custom spreadsheet theme tokens in `app/tailwind.config.js`
- Engine has zero production dependencies; designed as a publishable library
