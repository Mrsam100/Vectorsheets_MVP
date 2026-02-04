/**
 * SortDialog - Multi-column sort dialog
 *
 * Excel-style sort dialog with add/remove sort levels, column selector,
 * ascending/descending order, and "My data has headers" checkbox.
 *
 * Behaviour:
 * - Draggable by header
 * - Reset internal state on open; auto-focus first column selector
 * - Add up to columnCount sort levels with stable IDs
 * - Remove levels (minimum 1); duplicate columns visually warned
 * - Enter confirms, Escape / Cancel closes without applying
 * - onKeyDownCapture stops propagation to grid
 * - position: fixed, centered, z-index 350
 */

import React, { memo, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';

// =============================================================================
// Types
// =============================================================================

export interface SortRule {
  column: number;
  order: 'ascending' | 'descending';
}

export interface SortDialogProps {
  isOpen: boolean;
  columnCount: number;
  getColumnName: (col: number) => string;
  onApply: (rules: SortRule[], hasHeader: boolean) => void;
  onClose: () => void;
}

/** Internal sort level with stable ID for React keys */
interface SortLevel {
  id: number;
  column: number;
  order: 'ascending' | 'descending';
}

// =============================================================================
// Component
// =============================================================================

const SortDialogInner: React.FC<SortDialogProps> = ({
  isOpen,
  columnCount,
  getColumnName,
  onApply,
  onClose,
}) => {
  // --- Internal state ---
  const [levels, setLevels] = useState<SortLevel[]>([{ id: 1, column: 0, order: 'ascending' }]);
  const [hasHeader, setHasHeader] = useState(false);
  const nextIdRef = useRef(2);

  // --- Drag state ---
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  dragOffsetRef.current = dragOffset;

  // --- Refs ---
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstSelectRef = useRef<HTMLSelectElement>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  // --- Focus trap for modal dialog ---
  useFocusTrap({ containerRef: dialogRef, enabled: isOpen, onEscape: onClose });

  // Stable ref for onApply to avoid effect churn
  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;

  // Reset state on open; auto-focus first selector
  useEffect(() => {
    let rafId: number | undefined;
    if (isOpen) {
      nextIdRef.current = 2;
      setLevels([{ id: 1, column: 0, order: 'ascending' }]);
      setHasHeader(false);
      setDragOffset({ x: 0, y: 0 });
      rafId = requestAnimationFrame(() => {
        firstSelectRef.current?.focus();
      });
    }
    return () => { if (rafId !== undefined) cancelAnimationFrame(rafId); };
  }, [isOpen]);

  // Clean up drag listeners on unmount (defense against force-close during drag)
  useEffect(() => () => { dragCleanupRef.current?.(); }, []);

  // Detect duplicate columns
  const duplicateCols = useMemo(() => {
    const dupes = new Set<number>();
    const seen = new Set<number>();
    for (const level of levels) {
      if (seen.has(level.column)) dupes.add(level.column);
      seen.add(level.column);
    }
    return dupes;
  }, [levels]);

  // --- Level management ---
  const addLevel = useCallback(() => {
    setLevels((prev) => {
      if (prev.length >= columnCount) return prev;
      const usedCols = new Set(prev.map((l) => l.column));
      let nextCol = 0;
      for (let i = 0; i < columnCount; i++) {
        if (!usedCols.has(i)) { nextCol = i; break; }
      }
      const id = nextIdRef.current++;
      return [...prev, { id, column: nextCol, order: 'ascending' }];
    });
  }, [columnCount]);

  const removeLevel = useCallback((id: number) => {
    setLevels((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((l) => l.id !== id);
    });
  }, []);

  const updateLevel = useCallback((id: number, field: 'column' | 'order', value: number | string) => {
    setLevels((prev) =>
      prev.map((level) =>
        level.id === id
          ? { ...level, [field]: field === 'column' ? Number(value) : value }
          : level
      )
    );
  }, []);

  // --- Apply ---
  const handleApply = useCallback(() => {
    const rules: SortRule[] = levels.map(({ column, order }) => ({ column, order }));
    onApplyRef.current(rules, hasHeader);
  }, [levels, hasHeader]);

  // --- Draggable header ---
  const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.sort-dialog-close-btn')) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const startOffset = { ...dragOffsetRef.current };

    const handleMouseMove = (me: MouseEvent) => {
      setDragOffset({
        x: startOffset.x + (me.clientX - startX),
        y: startOffset.y + (me.clientY - startY),
      });
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      dragCleanupRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    dragCleanupRef.current = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    e.preventDefault();
  }, []);

  // --- Keyboard handling ---
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      // Escape is handled by useFocusTrap({ onEscape: onClose }) — no duplicate handler needed
      case 'Enter':
        // Don't submit if focus is on a select (Enter opens native select)
        if ((e.target as HTMLElement).tagName === 'SELECT') break;
        e.preventDefault();
        handleApply();
        break;
    }
  }, [handleApply]);

  const handleKeyDownCapture = useCallback((e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase();
      if (['a', 'c', 'v', 'x', 'z'].includes(key)) return;
    }
    e.stopPropagation();
  }, []);

  if (!isOpen) return null;

  const transform = dragOffset.x || dragOffset.y
    ? `translate(calc(-50% + ${dragOffset.x}px), calc(-50% + ${dragOffset.y}px))`
    : undefined;

  return (
    <>
    <div className="dialog-backdrop" aria-hidden="true" onClick={onClose} />
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Sort"
      className="sort-dialog"
      style={transform ? { transform } : undefined}
      onKeyDown={handleKeyDown}
      onKeyDownCapture={handleKeyDownCapture}
    >
      {/* Header — draggable */}
      <div className="sort-dialog-header" onMouseDown={handleHeaderMouseDown}>
        <span className="sort-dialog-title">Sort</span>
        <button
          type="button"
          className="sort-dialog-close-btn"
          aria-label="Close"
          onClick={onClose}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M3 3l8 8M11 3l-8 8" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="sort-dialog-body">
        {/* Header row checkbox */}
        <label className="sort-dialog-checkbox">
          <input
            type="checkbox"
            checked={hasHeader}
            onChange={(e) => setHasHeader(e.target.checked)}
          />
          <span>My data has headers</span>
        </label>

        {/* Sort levels */}
        {levels.map((level, index) => (
          <div key={level.id} className="sort-dialog-level">
            <span className="sort-dialog-level-label">
              {index === 0 ? 'Sort by:' : 'Then by:'}
            </span>
            <select
              ref={index === 0 ? firstSelectRef : undefined}
              className={`sort-dialog-select ${duplicateCols.has(level.column) ? 'sort-dialog-select-warn' : ''}`}
              value={level.column}
              onChange={(e) => updateLevel(level.id, 'column', e.target.value)}
            >
              {Array.from({ length: columnCount }, (_, i) => (
                <option key={i} value={i}>
                  {getColumnName(i)}
                </option>
              ))}
            </select>
            <select
              className="sort-dialog-select sort-dialog-order-select"
              value={level.order}
              onChange={(e) => updateLevel(level.id, 'order', e.target.value)}
            >
              <option value="ascending">A → Z</option>
              <option value="descending">Z → A</option>
            </select>
            {levels.length > 1 && (
              <button
                type="button"
                className="sort-dialog-remove-btn"
                aria-label={`Remove sort level ${index + 1}`}
                onClick={() => removeLevel(level.id)}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M2 2l8 8M10 2l-8 8" />
                </svg>
              </button>
            )}
          </div>
        ))}

        {/* Duplicate column warning */}
        {duplicateCols.size > 0 && (
          <div className="sort-dialog-warning" role="alert">
            Duplicate columns will be ignored
          </div>
        )}

        {/* Add level button */}
        {levels.length < columnCount && (
          <button
            type="button"
            className="sort-dialog-add-btn"
            onClick={addLevel}
          >
            + Add Level
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="sort-dialog-actions">
        <button type="button" className="dialog-btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="dialog-btn dialog-btn-primary" onClick={handleApply}>
          Sort
        </button>
      </div>
    </div>
    </>
  );
};

SortDialogInner.displayName = 'SortDialog';

export const SortDialog = memo(SortDialogInner);
export default SortDialog;
