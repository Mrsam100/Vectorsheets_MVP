/**
 * SheetTabs - Excel-style sheet tab strip
 *
 * Stateless: receives sheet list via props, emits actions via callbacks.
 * Does NOT manage sheet state locally — all mutations go through parent.
 * Follows the same callback-based pattern as the Ribbon component.
 *
 * Features:
 * - Click to activate sheet
 * - Double-click to inline-rename
 * - Right-click context menu (Rename, Delete, Move Left/Right)
 * - Drag-to-reorder tabs
 * - "+" button to add sheet
 * - Tab color accent (from SheetTabInfo.color)
 */

import React, { memo, useState, useRef, useCallback, useEffect } from 'react';

// =============================================================================
// Types
// =============================================================================

/**
 * Immutable descriptor for a single sheet tab.
 * The UI receives this from the parent — never constructs or mutates it.
 */
export interface SheetTabInfo {
  readonly id: string;
  readonly name: string;
  readonly color?: string;
  readonly isActive: boolean;
}

export interface SheetTabsProps {
  /** Ordered list of sheets. Render order = array order. */
  sheets: ReadonlyArray<SheetTabInfo>;
  /** Activate a sheet (click on tab). */
  onActivateSheet: (id: string) => void;
  /** Add a new sheet (click "+" button). */
  onAddSheet: () => void;
  /** Rename a sheet after inline edit. Parent validates uniqueness. */
  onRenameSheet: (id: string, newName: string) => void;
  /** Delete a sheet. Parent handles confirmation if last sheet. */
  onDeleteSheet: (id: string) => void;
  /** Reorder a sheet to a new position index. */
  onReorderSheet: (id: string, newIndex: number) => void;
  /** Optional class name */
  className?: string;
}

// =============================================================================
// Constants
// =============================================================================

/** Minimum pointer movement before drag starts */
const DRAG_THRESHOLD = 3;
/** Minimum width of the inline rename input */
const RENAME_INPUT_MIN_WIDTH = 32;
/** Maximum width of the inline rename input */
const RENAME_INPUT_MAX_WIDTH = 200;

// Hoisted icon elements — stable references, avoids per-render allocation
const ICON_PLUS = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4v16m8-8H4" />
  </svg>
);

const ICON_CLOSE = (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

// =============================================================================
// Drag State
// =============================================================================

interface DragState {
  draggedId: string;
  startX: number;
  currentX: number;
  isDragging: boolean;
  dropIndex: number | null;
}

// =============================================================================
// Context Menu State
// =============================================================================

interface ContextMenuState {
  x: number;
  y: number;
  sheetId: string;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Calculate the drop index by comparing pointer X to tab center positions.
 */
function calculateDropIndex(
  clientX: number,
  sheets: ReadonlyArray<SheetTabInfo>,
  tabElements: Map<string, HTMLElement>,
  draggedId: string,
): number {
  const draggedIndex = sheets.findIndex((s) => s.id === draggedId);

  for (let i = 0; i < sheets.length; i++) {
    const el = tabElements.get(sheets[i].id);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    if (clientX < center) {
      // Adjust: if dragging right, the visual slot shifts by 1
      return i <= draggedIndex ? i : i - 1;
    }
  }

  return sheets.length - 1;
}

/**
 * Get the pixel left position for the drop indicator line.
 */
function getDropIndicatorLeft(
  dropIndex: number,
  sheets: ReadonlyArray<SheetTabInfo>,
  tabElements: Map<string, HTMLElement>,
  scrollContainer: HTMLElement | null,
): number | null {
  if (!scrollContainer) return null;
  const containerRect = scrollContainer.getBoundingClientRect();

  if (dropIndex <= 0) {
    // Before first tab
    const firstEl = tabElements.get(sheets[0]?.id ?? '');
    if (!firstEl) return null;
    const rect = firstEl.getBoundingClientRect();
    return rect.left - containerRect.left + scrollContainer.scrollLeft;
  }

  // After the tab at dropIndex - 1
  const prevSheet = sheets[dropIndex - 1];
  if (!prevSheet) return null;
  const prevEl = tabElements.get(prevSheet.id);
  if (!prevEl) return null;
  const rect = prevEl.getBoundingClientRect();
  return rect.right - containerRect.left + scrollContainer.scrollLeft;
}

// =============================================================================
// Component
// =============================================================================

export const SheetTabs: React.FC<SheetTabsProps> = memo(
  ({ sheets, onActivateSheet, onAddSheet, onRenameSheet, onDeleteSheet, onReorderSheet, className }) => {
    // =========================================================================
    // Refs
    // =========================================================================

    const tabRefs = useRef<Map<string, HTMLElement>>(new Map());
    const editInputRef = useRef<HTMLInputElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const renameCommittedRef = useRef(false);
    const dragStateRef = useRef<DragState | null>(null);
    const skipNextClickRef = useRef(false);
    const pointerCaptureRef = useRef<{ element: Element; pointerId: number } | null>(null);

    // =========================================================================
    // Local State (transient UI only)
    // =========================================================================

    const [editingTabId, setEditingTabId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [dragState, setDragState] = useState<DragState | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

    // =========================================================================
    // Auto-scroll active tab into view
    // =========================================================================

    const activeId = sheets.find((s) => s.isActive)?.id;
    useEffect(() => {
      if (!activeId) return;
      const el = tabRefs.current.get(activeId);
      if (el) {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      }
    }, [activeId]);

    // =========================================================================
    // Click to Activate
    // =========================================================================

    const handleTabClick = useCallback(
      (id: string) => {
        // Suppress the click that fires after a drag-drop completes
        if (skipNextClickRef.current) {
          skipNextClickRef.current = false;
          return;
        }
        if (editingTabId || dragState?.isDragging) return;
        onActivateSheet(id);
      },
      [onActivateSheet, editingTabId, dragState?.isDragging],
    );

    // =========================================================================
    // Arrow-Key Navigation (WAI-ARIA tabs pattern)
    // =========================================================================

    const handleTabKeyDown = useCallback(
      (e: React.KeyboardEvent, sheetId: string) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          const idx = sheets.findIndex((s) => s.id === sheetId);
          const nextIdx = e.key === 'ArrowLeft' ? idx - 1 : idx + 1;
          if (nextIdx >= 0 && nextIdx < sheets.length) {
            const nextSheet = sheets[nextIdx];
            onActivateSheet(nextSheet.id);
            tabRefs.current.get(nextSheet.id)?.focus();
          }
        }
      },
      [sheets, onActivateSheet],
    );

    // =========================================================================
    // Inline Rename
    // =========================================================================

    const handleTabDoubleClick = useCallback((id: string, currentName: string) => {
      renameCommittedRef.current = false;
      setEditingTabId(id);
      setEditValue(currentName);
    }, []);

    // Auto-focus and select-all when entering rename mode
    useEffect(() => {
      if (editingTabId && editInputRef.current) {
        editInputRef.current.focus();
        editInputRef.current.select();
      }
    }, [editingTabId]);

    const commitRename = useCallback(() => {
      // Guard: prevent double-fire (Enter commits, then blur fires on unmount)
      if (!editingTabId || renameCommittedRef.current) return;
      renameCommittedRef.current = true;
      const trimmed = editValue.trim();
      const current = sheets.find((s) => s.id === editingTabId);
      if (trimmed && current && trimmed !== current.name) {
        onRenameSheet(editingTabId, trimmed);
      }
      setEditingTabId(null);
      setEditValue('');
    }, [editingTabId, editValue, sheets, onRenameSheet]);

    const cancelRename = useCallback(() => {
      renameCommittedRef.current = true;
      setEditingTabId(null);
      setEditValue('');
    }, []);

    const handleRenameKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitRename();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelRename();
        }
        e.stopPropagation();
      },
      [commitRename, cancelRename],
    );

    // =========================================================================
    // Drag to Reorder
    // =========================================================================

    const handleTabPointerDown = useCallback(
      (e: React.PointerEvent, sheetId: string) => {
        if (e.button !== 0) return;
        if (editingTabId) return;

        // Capture pointer for reliable tracking even outside the browser window
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        pointerCaptureRef.current = { element: e.currentTarget as Element, pointerId: e.pointerId };

        const initial: DragState = {
          draggedId: sheetId,
          startX: e.clientX,
          currentX: e.clientX,
          isDragging: false,
          dropIndex: null,
        };
        dragStateRef.current = initial;
        setDragState(initial);
      },
      [editingTabId],
    );

    // Keep ref in sync for the document-level event handlers
    useEffect(() => {
      dragStateRef.current = dragState;
    }, [dragState]);

    // Stable refs for values used inside document-level handlers
    const sheetsRef = useRef(sheets);
    sheetsRef.current = sheets;
    const onReorderRef = useRef(onReorderSheet);
    onReorderRef.current = onReorderSheet;

    // Attach document listeners only when drag starts; remove when it ends.
    // Handlers read from refs — no stale closures, no re-registration per move.
    const isDragActive = dragState !== null;
    useEffect(() => {
      if (!isDragActive) return;

      const releaseCapture = () => {
        if (pointerCaptureRef.current) {
          const { element, pointerId } = pointerCaptureRef.current;
          if (element.hasPointerCapture(pointerId)) {
            element.releasePointerCapture(pointerId);
          }
          pointerCaptureRef.current = null;
        }
      };

      const handlePointerMove = (e: PointerEvent) => {
        const ds = dragStateRef.current;
        if (!ds) return;
        const dx = Math.abs(e.clientX - ds.startX);

        if (!ds.isDragging && dx < DRAG_THRESHOLD) return;

        // Set grabbing cursor on first real drag
        if (!ds.isDragging) {
          document.body.style.cursor = 'grabbing';
        }

        const dropIndex = calculateDropIndex(e.clientX, sheetsRef.current, tabRefs.current, ds.draggedId);

        const next: DragState = {
          ...ds,
          currentX: e.clientX,
          isDragging: true,
          dropIndex,
        };
        dragStateRef.current = next;
        setDragState(next);
      };

      const handlePointerUp = () => {
        const ds = dragStateRef.current;
        if (ds?.isDragging) {
          // Suppress the click event that follows pointerup after a real drag
          skipNextClickRef.current = true;
          if (ds.dropIndex !== null) {
            const currentSheets = sheetsRef.current;
            const currentIndex = currentSheets.findIndex((s) => s.id === ds.draggedId);
            if (currentIndex !== -1 && ds.dropIndex !== currentIndex) {
              onReorderRef.current(ds.draggedId, ds.dropIndex);
            }
          }
        }
        releaseCapture();
        document.body.style.cursor = '';
        dragStateRef.current = null;
        setDragState(null);
      };

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          releaseCapture();
          document.body.style.cursor = '';
          dragStateRef.current = null;
          setDragState(null);
          e.stopPropagation();
        }
      };

      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
      document.addEventListener('keydown', handleKeyDown, true);

      return () => {
        releaseCapture();
        document.body.style.cursor = '';
        document.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('pointerup', handlePointerUp);
        document.removeEventListener('keydown', handleKeyDown, true);
      };
    }, [isDragActive]);

    // =========================================================================
    // Context Menu
    // =========================================================================

    const handleContextMenu = useCallback(
      (e: React.MouseEvent, sheetId: string) => {
        e.preventDefault();
        onActivateSheet(sheetId);
        setContextMenu({ x: e.clientX, y: e.clientY, sheetId });
      },
      [onActivateSheet],
    );

    // Dismiss context menu on click-outside, Escape, and provide arrow key navigation
    useEffect(() => {
      if (!contextMenu) return;

      // Restore focus to the tab that triggered the context menu
      const restoreFocus = () => {
        const tabEl = tabRefs.current.get(contextMenu.sheetId);
        if (tabEl) requestAnimationFrame(() => tabEl.focus());
      };

      const handleClickOutside = (e: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
          setContextMenu(null);
          restoreFocus();
        }
      };

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setContextMenu(null);
          restoreFocus();
          e.stopPropagation();
          return;
        }

        const menu = menuRef.current;
        if (!menu) return;
        const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        if (items.length === 0) return;
        const currentIdx = items.indexOf(document.activeElement as HTMLButtonElement);

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const next = currentIdx < items.length - 1 ? currentIdx + 1 : 0;
          items[next].focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const prev = currentIdx > 0 ? currentIdx - 1 : items.length - 1;
          items[prev].focus();
        } else if (e.key === 'Home') {
          e.preventDefault();
          items[0].focus();
        } else if (e.key === 'End') {
          e.preventDefault();
          items[items.length - 1].focus();
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown, true);

      // Focus first item on open
      const rafId = requestAnimationFrame(() => {
        const menu = menuRef.current;
        if (menu) {
          const firstItem = menu.querySelector<HTMLButtonElement>('button:not(:disabled)');
          firstItem?.focus();
        }
      });

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown, true);
        cancelAnimationFrame(rafId);
      };
    }, [contextMenu]);

    // Close context menu if the targeted sheet was removed from props
    useEffect(() => {
      if (contextMenu && !sheets.some((s) => s.id === contextMenu.sheetId)) {
        setContextMenu(null);
      }
    }, [contextMenu, sheets]);

    const handleContextRename = useCallback(() => {
      if (!contextMenu) return;
      const sheet = sheets.find((s) => s.id === contextMenu.sheetId);
      if (sheet) {
        renameCommittedRef.current = false;
        setEditingTabId(sheet.id);
        setEditValue(sheet.name);
      }
      setContextMenu(null);
    }, [contextMenu, sheets]);

    const handleContextDelete = useCallback(() => {
      if (!contextMenu) return;
      onDeleteSheet(contextMenu.sheetId);
      setContextMenu(null);
    }, [contextMenu, onDeleteSheet]);

    const handleContextMoveLeft = useCallback(() => {
      if (!contextMenu) return;
      const idx = sheets.findIndex((s) => s.id === contextMenu.sheetId);
      if (idx > 0) {
        onReorderSheet(contextMenu.sheetId, idx - 1);
      }
      setContextMenu(null);
    }, [contextMenu, sheets, onReorderSheet]);

    const handleContextMoveRight = useCallback(() => {
      if (!contextMenu) return;
      const idx = sheets.findIndex((s) => s.id === contextMenu.sheetId);
      if (idx >= 0 && idx < sheets.length - 1) {
        onReorderSheet(contextMenu.sheetId, idx + 1);
      }
      setContextMenu(null);
    }, [contextMenu, sheets, onReorderSheet]);

    // =========================================================================
    // Delete
    // =========================================================================

    const handleDelete = useCallback(
      (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        onDeleteSheet(id);
      },
      [onDeleteSheet],
    );

    // =========================================================================
    // Context menu position helpers
    // =========================================================================

    const contextMenuIndex = contextMenu ? sheets.findIndex((s) => s.id === contextMenu.sheetId) : -1;
    const isContextFirst = contextMenuIndex === 0;
    const isContextLast = contextMenuIndex === sheets.length - 1;

    // =========================================================================
    // Drop indicator position
    // =========================================================================

    const dropIndicatorLeft =
      dragState?.isDragging && dragState.dropIndex !== null
        ? getDropIndicatorLeft(dragState.dropIndex, sheets, tabRefs.current, scrollContainerRef.current)
        : null;

    // =========================================================================
    // Render
    // =========================================================================

    return (
      <div className={`sheet-tabs ${className ?? ''}`}>
        {/* Scrollable tab container */}
        <div className="sheet-tabs-scroll" ref={scrollContainerRef} role="tablist" aria-label="Sheet tabs">
          {sheets.map((sheet) => (
            <div
              key={sheet.id}
              ref={(el) => {
                if (el) tabRefs.current.set(sheet.id, el);
                else tabRefs.current.delete(sheet.id);
              }}
              className={`sheet-tab${sheet.isActive ? ' sheet-tab-active' : ''}${
                dragState?.draggedId === sheet.id && dragState.isDragging ? ' sheet-tab-dragging' : ''
              }`}
              style={sheet.color ? { borderBottomColor: sheet.color } : undefined}
              onClick={() => handleTabClick(sheet.id)}
              onDoubleClick={() => handleTabDoubleClick(sheet.id, sheet.name)}
              onContextMenu={(e) => handleContextMenu(e, sheet.id)}
              onPointerDown={(e) => handleTabPointerDown(e, sheet.id)}
              onKeyDown={(e) => handleTabKeyDown(e, sheet.id)}
              role="tab"
              aria-selected={sheet.isActive}
              tabIndex={sheet.isActive ? 0 : -1}
            >
              {editingTabId === sheet.id ? (
                <input
                  ref={editInputRef}
                  type="text"
                  className="sheet-tab-rename-input"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleRenameKeyDown}
                  onBlur={commitRename}
                  maxLength={128}
                  style={{
                    width: Math.min(
                      RENAME_INPUT_MAX_WIDTH,
                      Math.max(RENAME_INPUT_MIN_WIDTH, editValue.length * 7 + 16),
                    ),
                  }}
                  spellCheck={false}
                  autoComplete="off"
                  aria-label="Rename sheet"
                />
              ) : (
                <>
                  <span className="sheet-tab-label">{sheet.name}</span>
                  {!sheet.isActive && sheets.length > 1 && (
                    <button
                      type="button"
                      className="sheet-tab-close"
                      onClick={(e) => handleDelete(e, sheet.id)}
                      title="Delete sheet"
                    >
                      {ICON_CLOSE}
                    </button>
                  )}
                </>
              )}
            </div>
          ))}

          {/* Drop indicator line */}
          {dropIndicatorLeft !== null && (
            <div className="sheet-tab-drop-indicator" style={{ left: dropIndicatorLeft }} />
          )}
        </div>

        {/* Add sheet button */}
        <button type="button" className="sheet-tab-add" onClick={onAddSheet} title="Add sheet">
          {ICON_PLUS}
        </button>

        {/* Context menu — opens upward when room, downward otherwise */}
        {contextMenu && (
          <div
            ref={menuRef}
            className="sheet-tab-context-menu"
            role="menu"
            aria-label="Sheet tab options"
            style={{
              position: 'fixed',
              left: Math.min(contextMenu.x, window.innerWidth - 160),
              top: contextMenu.y,
              transform: contextMenu.y > 160 ? 'translateY(-100%)' : undefined,
            }}
          >
            <button type="button" role="menuitem" onClick={handleContextRename}>
              Rename
            </button>
            <button type="button" role="menuitem" onClick={handleContextDelete} disabled={sheets.length <= 1}>
              Delete
            </button>
            <div className="sheet-tab-context-separator" role="separator" />
            <button type="button" role="menuitem" onClick={handleContextMoveLeft} disabled={isContextFirst}>
              Move Left
            </button>
            <button type="button" role="menuitem" onClick={handleContextMoveRight} disabled={isContextLast}>
              Move Right
            </button>
          </div>
        )}
      </div>
    );
  },
);

SheetTabs.displayName = 'SheetTabs';
