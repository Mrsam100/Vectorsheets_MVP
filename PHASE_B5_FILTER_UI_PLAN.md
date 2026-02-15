# PHASE B5: FILTER UI - IMPLEMENTATION PLAN

**Status**: 🔵 PLANNING
**Estimated Time**: 3 days
**Dependencies**: Batch 1-4 complete (Predicates, Manager, Commands, Rendering) ✅

---

## 📋 EXECUTIVE SUMMARY

**Goal**: Connect the existing FilterDropdown UI to the engine's FilterManager system, add visual indicators, and provide a complete filtering experience.

**What Exists** ✅:
- `FilterDropdown.tsx` - Value-based checkbox filter UI (300 lines, production-ready)
- `ColumnHeaders.tsx` - Column header rendering
- FilterManager - Engine-level filter state (Batch 2)
- FilterPredicate system - 16 predicate types (Batch 1)
- FilterCommands - Undo/redo support (Batch 3)
- FilteredDimensionProvider - VirtualRenderer integration (Batch 4)

**What's Missing** ❌:
- Connection between FilterDropdown and FilterManager
- Filter icon indicators on column headers
- Filter state management in React
- Conversion from checkbox selections to predicates
- Advanced predicate builder UI (optional)

**Key Challenge**: Bridge the gap between value-based UI (checkboxes) and predicate-based engine (TextContains, NumberGreaterThan, etc.)

---

## 🏗️ ARCHITECTURE DECISIONS

### Decision 1: Hybrid Approach - Value Selection → Predicate Conversion

**Problem**: FilterDropdown uses value checkboxes, FilterManager uses predicates.

**Solution**: Convert checkbox selections to predicates:
```typescript
// User selects: ["Alice", "Bob", "Charlie"]
// → Generate: OrPredicate([
//     TextEqualsPredicate("Alice"),
//     TextEqualsPredicate("Bob"),
//     TextEqualsPredicate("Charlie")
//   ])

// User selects all except ["David"]
// → Generate: TextNotEqualsPredicate("David")
//   (simpler than OR of all others)
```

**Benefits**:
- ✅ Leverage existing FilterDropdown UI (no rebuild needed)
- ✅ Users get familiar Excel-like checkbox interface
- ✅ Engine uses powerful predicate system
- ✅ Can add "Advanced" mode later for custom predicates

**Trade-offs**:
- ⚠️ Value-based filtering only (no "contains" or "greater than" from UI yet)
- ⚠️ Need to scan column for unique values (can be slow for large columns)
- ✅ Mitigation: Cache unique values, limit to viewport range

---

### Decision 2: Filter State Management - React Hook + Engine Sync

**Pattern**: Create `useFilterState` hook that:
1. Subscribes to FilterManager via `useSyncExternalStore` (React 18)
2. Provides UI actions (openFilter, applyFilter, clearFilter)
3. Maintains dropdown open/close state locally
4. Syncs with engine on apply/clear

**Architecture**:
```
┌─────────────────────────────────────────────────────┐
│  SpreadsheetShell (top-level coordinator)          │
├─────────────────────────────────────────────────────┤
│  useFilterState(engine.getFilterManager())          │
│    ├─ Subscribe to FilterManager changes            │
│    ├─ Local state: dropdownState { isOpen, col }   │
│    ├─ Actions: openFilter, applyFilter, clear       │
│    └─ Pass to children via context or props         │
├─────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌──────────────────────────┐ │
│  │ ColumnHeaders   │  │ FilterDropdown           │ │
│  │ - Filter icons  │←→│ - Checkbox UI            │ │
│  │ - Click handler │  │ - Apply → convert to     │ │
│  │                 │  │   predicate → FilterMgr  │ │
│  └─────────────────┘  └──────────────────────────┘ │
└─────────────────────────────────────────────────────┘
                    ↓
        ┌───────────────────────┐
        │ FilterManager (engine)│
        │ - Predicate storage   │
        │ - Filtered rows cache │
        └───────────────────────┘
```

**Benefits**:
- ✅ Single source of truth (FilterManager)
- ✅ React 18 concurrent-safe
- ✅ Clean separation (UI state vs engine state)

---

### Decision 3: Filter Icon Indicators - Column Header Extension

**Design**: Add filter funnel icon to column headers when filter is active.

**Visual States**:
1. **No filter**: No icon (clean headers)
2. **Filter active**: Blue funnel icon (🔽) on right side
3. **Filter hovered**: Highlight icon + show tooltip

**Implementation**:
```tsx
// ColumnHeader.tsx
<div className="column-header">
  <span>{label}</span>

  {hasFilter && (
    <svg className="filter-icon" aria-label="Filtered">
      {/* Funnel icon */}
    </svg>
  )}

  <button
    className="filter-button"
    onClick={onFilterClick}
    aria-label="Open filter"
  >
    <svg>{/* Down arrow */}</svg>
  </button>
</div>
```

**Benefits**:
- ✅ Visual feedback for active filters
- ✅ Excel-compatible UX
- ✅ Click anywhere on header to open filter

---

## 📐 COMPONENT DESIGN

### Component 1: `useFilterState` Hook (NEW)

**Purpose**: Manage filter state and bridge UI ↔ Engine

**API**:
```typescript
interface UseFilterStateOptions {
  filterManager: FilterManager;
  dataStore: SparseDataStore; // For scanning unique values
}

interface FilterState {
  // Current state
  activeFilters: Map<number, FilterPredicate>;

  // Dropdown state
  dropdownState: {
    isOpen: boolean;
    column: number | null;
    anchorRect: DOMRect | null;
  };

  // Actions
  openFilter(column: number, anchorRect: DOMRect): void;
  closeFilter(): void;
  applyFilter(column: number, selectedValues: Set<string>, includeBlanks: boolean): void;
  clearFilter(column: number): void;
  clearAllFilters(): void;

  // Helpers
  getUniqueValues(column: number): string[];
  isColumnFiltered(column: number): boolean;
}

function useFilterState(options: UseFilterStateOptions): FilterState;
```

**Implementation Strategy**:
```typescript
function useFilterState({ filterManager, dataStore }: UseFilterStateOptions) {
  // React 18 subscription to FilterManager
  const version = useSyncExternalStore(
    filterManager.subscribe,
    filterManager.getSnapshot
  );

  // Local dropdown state
  const [dropdownState, setDropdownState] = useState({
    isOpen: false,
    column: null,
    anchorRect: null,
  });

  // Get unique values for a column (cached)
  const getUniqueValues = useCallback((column: number) => {
    const values = new Set<string>();
    const range = dataStore.getUsedRange();

    for (let row = range.startRow; row <= range.endRow; row++) {
      const cell = dataStore.getCell(row, column);
      const value = cell?.value?.toString() ?? '';
      values.add(value);
    }

    return Array.from(values).sort();
  }, [dataStore]);

  // Convert checkbox selections to predicate
  const applyFilter = useCallback((
    column: number,
    selectedValues: Set<string>,
    includeBlanks: boolean
  ) => {
    // Build predicate from selections
    const predicates: FilterPredicate[] = [];

    for (const value of selectedValues) {
      predicates.push(new TextEqualsPredicate(value));
    }

    if (includeBlanks) {
      predicates.push(new IsEmptyPredicate());
    }

    // Combine with OR
    const predicate = predicates.length === 1
      ? predicates[0]
      : new OrPredicate(predicates);

    // Apply to FilterManager
    filterManager.applyFilter(column, predicate);

    // Close dropdown
    setDropdownState({ isOpen: false, column: null, anchorRect: null });
  }, [filterManager]);

  // ... other actions

  return {
    activeFilters: filterManager.getAllFilters(),
    dropdownState,
    openFilter,
    closeFilter,
    applyFilter,
    clearFilter: (col) => filterManager.clearFilter(col),
    clearAllFilters: () => filterManager.clearAllFilters(),
    getUniqueValues,
    isColumnFiltered: (col) => filterManager.getFilter(col) !== undefined,
  };
}
```

---

### Component 2: Enhanced `ColumnHeaders` (MODIFIED)

**Changes**:
1. Add filter button to each header
2. Show filter icon when column is filtered
3. Handle filter button click → open FilterDropdown

**Modifications**:
```tsx
// Add to ColumnHeader component
const ColumnHeader: React.FC<{
  column: ColPosition;
  isSelected: boolean;
  isFiltered: boolean; // NEW
  onFilterClick: (col: number, rect: DOMRect) => void; // NEW
}> = ({ column, isSelected, isFiltered, onFilterClick }) => {
  const headerRef = useRef<HTMLDivElement>(null);

  const handleFilterClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (headerRef.current) {
      const rect = headerRef.current.getBoundingClientRect();
      onFilterClick(column.col, rect);
    }
  };

  return (
    <div ref={headerRef} className="column-header">
      <span>{getColumnLabel(column.col)}</span>

      {/* Filter icon (when active) */}
      {isFiltered && (
        <svg className="filter-icon-active">
          {/* Blue funnel icon */}
        </svg>
      )}

      {/* Filter button */}
      <button
        className="filter-button"
        onClick={handleFilterClick}
        aria-label={`Filter column ${getColumnLabel(column.col)}`}
      >
        <svg className="filter-icon-button">
          {/* Down arrow icon */}
        </svg>
      </button>

      {/* Resize handle (existing) */}
    </div>
  );
};
```

---

### Component 3: `FilterDropdown` Integration (MODIFIED)

**Current State**: Standalone component with callbacks
**Required Changes**: Minimal - already has the right API!

**Integration**:
```tsx
// In SpreadsheetShell
const filterState = useFilterState({
  filterManager: engine.getFilterManager(),
  dataStore: engine.getDataStore(),
});

return (
  <>
    <GridViewport
      onColumnHeaderClick={(col, rect) => filterState.openFilter(col, rect)}
      isColumnFiltered={filterState.isColumnFiltered}
    />

    <FilterDropdown
      isOpen={filterState.dropdownState.isOpen}
      column={filterState.dropdownState.column ?? 0}
      anchorRect={filterState.dropdownState.anchorRect}
      columnName={getColumnLabel(filterState.dropdownState.column ?? 0)}
      uniqueValues={filterState.getUniqueValues(filterState.dropdownState.column ?? 0)}
      currentFilter={null} // Convert from predicate to Set<string>
      onApply={filterState.applyFilter}
      onClear={filterState.clearFilter}
      onClose={filterState.closeFilter}
    />
  </>
);
```

**Challenge**: Need to convert predicate back to Set<string> for currentFilter prop.

**Solution**:
```typescript
function predicateToValueSet(predicate: FilterPredicate): Set<string> | null {
  // If OrPredicate of TextEquals, extract values
  if (predicate.type === 'or') {
    const orPred = predicate as OrPredicate;
    const values = new Set<string>();

    for (const p of orPred.predicates) {
      if (p.type === 'text.equals') {
        values.add((p as TextEqualsPredicate).value);
      }
    }

    return values.size > 0 ? values : null;
  }

  // Single TextEquals
  if (predicate.type === 'text.equals') {
    return new Set([(predicate as TextEqualsPredicate).value]);
  }

  // Complex predicate - can't convert to value set
  return null;
}
```

---

## 🎯 IMPLEMENTATION STEPS

### Step 1: Create `useFilterState` Hook (1 day)

**File**: `app/src/hooks/useFilterState.ts`

**Tasks**:
- [ ] Create hook skeleton
- [ ] Add React 18 subscription to FilterManager
- [ ] Implement `getUniqueValues()` with caching
- [ ] Implement `applyFilter()` with predicate conversion
- [ ] Implement `clearFilter()` and `clearAllFilters()`
- [ ] Add dropdown state management
- [ ] Write unit tests (15+ tests)

**Tests**:
- Subscribe to FilterManager changes
- Apply filter converts values to predicates
- Clear filter updates state
- Dropdown state management
- Unique values extraction
- Edge cases (empty column, large columns)

**Success Criteria**:
- ✅ All tests passing
- ✅ FilterManager state syncs with React
- ✅ Predicates generated correctly

---

### Step 2: Enhance ColumnHeaders (0.5 days)

**File**: `app/src/components/grid/ColumnHeaders.tsx`

**Tasks**:
- [ ] Add `isFiltered` prop to ColumnHeader
- [ ] Add `onFilterClick` callback
- [ ] Add filter button to header
- [ ] Add active filter icon
- [ ] Add CSS styles for filter icons
- [ ] Handle click events

**Visual Design**:
```
┌──────────────────────┐
│  A    [↓]  [filter]  │  ← No filter: just down arrow
└──────────────────────┘

┌──────────────────────┐
│  B  🔽 [↓]  [filter] │  ← Active filter: blue funnel
└──────────────────────┘
```

**CSS Classes**:
```css
.filter-button {
  /* Invisible until hover */
  opacity: 0;
  transition: opacity 0.2s;
}

.column-header:hover .filter-button {
  opacity: 1;
}

.filter-icon-active {
  color: #2563eb; /* Blue-600 */
}
```

---

### Step 3: Integrate FilterDropdown (0.5 days)

**File**: `app/src/components/SpreadsheetShell.tsx`

**Tasks**:
- [ ] Add `useFilterState` hook
- [ ] Pass filter state to GridViewport
- [ ] Connect FilterDropdown to filter state
- [ ] Implement predicate ↔ value set conversion
- [ ] Test filter open/close
- [ ] Test filter apply/clear

**Integration Points**:
```tsx
// SpreadsheetShell.tsx
const filterState = useFilterState({
  filterManager: gridViewportRef.current?.getFilterManager(),
  dataStore: gridViewportRef.current?.getDataStore(),
});

// GridViewport needs onFilterClick callback
<GridViewport
  ref={gridViewportRef}
  onColumnHeaderClick={filterState.openFilter}
  isColumnFiltered={filterState.isColumnFiltered}
/>

// FilterDropdown renders when open
{filterState.dropdownState.isOpen && (
  <FilterDropdown {...filterState.dropdownState} />
)}
```

---

### Step 4: Add Visual Polish (0.5 days)

**Tasks**:
- [ ] Add filter tooltips
- [ ] Add keyboard shortcuts (Alt+Down to open filter)
- [ ] Add "Clear All Filters" button to ribbon/menu
- [ ] Add status bar indicator ("X rows filtered")
- [ ] Add smooth transitions
- [ ] Test with large datasets (10k rows)

**Status Bar**:
```
┌─────────────────────────────────────────────┐
│ Ready | 1,523 of 10,000 rows visible (filtered) │
└─────────────────────────────────────────────┘
```

---

### Step 5: Testing & QA (0.5 days)

**Test Scenarios**:
- [ ] Open filter dropdown on column header click
- [ ] Apply filter with checkbox selections
- [ ] Clear filter removes filtering
- [ ] Multiple column filters (AND logic)
- [ ] Filter persists on scroll
- [ ] Undo/redo filter operations
- [ ] Performance: Filter 10k rows in <100ms
- [ ] Keyboard navigation in dropdown
- [ ] Click-outside closes dropdown
- [ ] ESC closes dropdown

**Edge Cases**:
- [ ] Empty column (no values)
- [ ] Column with 1000+ unique values
- [ ] Very long text values
- [ ] Mixed data types (numbers, text, dates)
- [ ] Filtered column deleted
- [ ] Filter active during sort

---

## 🚀 PERFORMANCE CONSIDERATIONS

### 1. Unique Values Extraction

**Problem**: Scanning 100k rows to find unique values is slow.

**Optimizations**:
1. **Cache results**: Memoize unique values per column
2. **Limit range**: Only scan visible/used range
3. **Max limit**: Cap at 1000 unique values (Excel does this)
4. **Async loading**: Show "Loading..." while scanning

**Implementation**:
```typescript
const getUniqueValues = useMemo(() => {
  const cache = new Map<number, string[]>();

  return (column: number): string[] => {
    if (cache.has(column)) return cache.get(column)!;

    const values = new Set<string>();
    const range = dataStore.getUsedRange();
    const MAX_VALUES = 1000;

    for (let row = range.startRow; row <= range.endRow; row++) {
      if (values.size >= MAX_VALUES) break; // Cap

      const cell = dataStore.getCell(row, column);
      const value = cell?.value?.toString() ?? '';
      values.add(value);
    }

    const sorted = Array.from(values).sort();
    cache.set(column, sorted);
    return sorted;
  };
}, [dataStore]);
```

---

### 2. Predicate Generation Overhead

**Problem**: Creating OrPredicate with 100s of TextEquals is expensive.

**Optimization**: Use specialized predicates when possible:
```typescript
// Instead of: Or([TextEquals("A"), TextEquals("B"), ..., TextEquals("Z")])
// Use: TextInSetPredicate(Set(["A", "B", ..., "Z"])) // NEW predicate type

// Add to Batch 1 (optional enhancement):
export class TextInSetPredicate implements FilterPredicate {
  private readonly values: Set<string>;

  test(value: CellValue): boolean {
    const text = toPlainText(value);
    return this.values.has(text);
  }
}
```

**Decision**: Add TextInSetPredicate in Batch 5 for performance.

---

## 🎨 UI/UX SPECIFICATIONS

### Filter Button Behavior

**States**:
1. **Default**: Hidden (opacity: 0)
2. **Header hover**: Visible (opacity: 1, fade in)
3. **Filter active**: Always visible + blue icon
4. **Button hover**: Highlight background
5. **Dropdown open**: Pressed state

**Interactions**:
- Click anywhere on header → Select column
- Click filter button → Open dropdown (stop propagation)
- Click outside dropdown → Close
- ESC → Close dropdown
- Enter in search → Apply filter
- Alt+Down → Open filter for selected column

---

### Filter Dropdown Enhancements

**Current** ✅:
- Checkbox list of unique values
- Search filter
- Select All
- Blanks checkbox
- Apply/Clear/Cancel buttons

**Additions** (Optional - Advanced Mode):
- "Show Advanced" button → Opens predicate builder
- Predicate builder UI:
  - Dropdown: Text/Number/Date
  - Dropdown: Contains/Equals/Greater Than/etc.
  - Input: Value
  - Add/Remove conditions
  - Preview: "5 of 100 rows match"

---

## 📊 SUCCESS METRICS

**Functional**:
- ✅ Users can open filter dropdown on column header click
- ✅ Users can select/deselect values via checkboxes
- ✅ Apply filter hides non-matching rows
- ✅ Filter icon shows on filtered columns
- ✅ Clear filter restores all rows
- ✅ Multiple column filters work (AND logic)
- ✅ Undo/redo filter operations work

**Performance**:
- ✅ Filter dropdown opens in <100ms
- ✅ Unique values scan: <500ms for 10k rows
- ✅ Apply filter: <100ms for 10k rows
- ✅ Smooth scrolling with filters active (60fps)

**Quality**:
- ✅ Zero TypeScript errors
- ✅ All unit tests passing
- ✅ Manual QA checklist complete
- ✅ Works in Chrome, Firefox, Safari, Edge
- ✅ Keyboard accessible
- ✅ Screen reader compatible

---

## 🧪 TESTING STRATEGY

### Unit Tests (20+ tests)

**useFilterState.test.ts**:
- Subscribe to FilterManager changes
- Open/close dropdown state
- Apply filter generates correct predicates
- Clear filter updates state
- Get unique values with caching
- Edge cases (empty column, large columns)

**ColumnHeaders.test.tsx**:
- Filter button renders when hovered
- Filter icon shows when column filtered
- Click filter button opens dropdown
- Click header selects column (not filter)

**FilterDropdown.test.tsx** (existing):
- Already has 15+ tests ✅
- Add: Convert selections to predicates
- Add: Handle complex predicate types

---

### Integration Tests (10+ tests)

**Filter.integration.test.tsx** (NEW):
- Open filter dropdown from column header
- Apply filter hides rows
- Multiple column filters (AND logic)
- Clear filter shows all rows
- Undo/redo filter operations
- Filter persists on scroll
- Status bar shows filter count
- Performance: Filter 10k rows in <100ms

---

### Manual QA Checklist

**Basic Functionality**:
- [ ] Click column header filter button opens dropdown
- [ ] Search filters checkbox list
- [ ] Select/deselect values
- [ ] Apply filter hides rows
- [ ] Filter icon appears on header
- [ ] Clear filter shows all rows

**Multiple Filters**:
- [ ] Apply filter to column A
- [ ] Apply filter to column B
- [ ] Both filters active (AND logic)
- [ ] Clear one filter keeps other active
- [ ] Clear all filters removes all

**Edge Cases**:
- [ ] Filter empty column
- [ ] Filter column with 1000+ values
- [ ] Filter very long text values
- [ ] Filter mixed data types
- [ ] Delete filtered column
- [ ] Sort filtered data

**Performance**:
- [ ] 10k rows: Filter opens in <100ms
- [ ] 10k rows: Apply filter in <100ms
- [ ] Smooth scrolling with filters active

**Accessibility**:
- [ ] Keyboard navigation (Tab, Enter, ESC)
- [ ] Screen reader announces filter state
- [ ] Focus trap in dropdown
- [ ] ARIA labels present

---

## 🔄 ROLLOUT PLAN

### Phase 1: Core Integration (Days 1-2)
- Implement useFilterState hook
- Enhance ColumnHeaders with filter buttons
- Connect FilterDropdown to FilterManager
- Basic testing

### Phase 2: Polish & Testing (Day 3)
- Add visual indicators
- Add status bar integration
- Performance optimization
- Full QA testing

### Phase 3: Documentation & Handoff
- Update CLAUDE.md with Batch 5 docs
- Create user-facing docs
- Record demo video (optional)

---

## 🚧 KNOWN LIMITATIONS & FUTURE WORK

**Current Limitations**:
- ❌ Value-based filtering only (no "contains" or "greater than" from UI)
- ❌ Max 1000 unique values per column
- ❌ No custom predicate builder (Advanced mode)
- ❌ No column-level filter shortcuts (Ctrl+Shift+L)

**Future Enhancements** (Batch 6 or later):
- [ ] Advanced predicate builder UI
- [ ] Filter by color/formatting
- [ ] Top 10/Bottom 10 filters
- [ ] Date range picker
- [ ] Filter templates/presets
- [ ] Export filters as JSON
- [ ] Import filters from Excel

---

## ✅ APPROVAL CHECKLIST

Before starting implementation, confirm:

- [ ] Architecture decisions approved
- [ ] Component design approved
- [ ] Integration approach approved
- [ ] Performance targets acceptable
- [ ] Testing strategy sufficient
- [ ] Timeline realistic (3 days)

**Estimated LOC**:
- useFilterState.ts: ~200 lines
- ColumnHeaders.tsx: +50 lines
- SpreadsheetShell.tsx: +30 lines
- Tests: ~300 lines
- CSS: ~50 lines
**Total**: ~630 new lines of code

---

## 🎯 READY TO IMPLEMENT?

This plan provides a clear path from current state (existing UI components) to production-ready filter system. The hybrid approach (value checkboxes → predicates) leverages existing work while maintaining engine power.

**Next Step**: Get approval on this plan, then start with Step 1 (useFilterState hook).

**Questions?**
1. Is the hybrid approach (checkboxes → predicates) acceptable?
2. Should we add TextInSetPredicate for performance?
3. Should we include Advanced predicate builder in Batch 5 or defer to Batch 6?

---

**Plan Status**: 🔵 AWAITING APPROVAL
**Complexity**: 🟡 MEDIUM (UI integration, state management)
**Risk**: 🟢 LOW (building on proven components)
