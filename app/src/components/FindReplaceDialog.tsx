/**
 * FindReplaceDialog - Excel-style Find & Replace dialog
 *
 * Non-modal overlay positioned top-right of the grid. Delegates all search
 * logic to the engine's FindReplace module — never searches itself.
 *
 * Behaviour:
 * - Live search: onFind fires on every input change (debounced 150ms)
 * - Match counter: "N of M" from parent-supplied props
 * - Enter = Find Next (Find input), Replace Current (Replace input)
 * - Shift+Enter = Find Previous
 * - F3 / Shift+F3 = Find Next / Find Previous
 * - Escape closes, Ctrl+F re-focuses Find input if already open
 * - Draggable by header — resets position each time dialog opens
 * - role="dialog" with aria-label and aria-live for match count
 *
 * Always mounted (controlled by isOpen) so internal state (query, options)
 * persists across open/close cycles — matches Excel/Sheets behaviour.
 */

import React, { memo, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { FindOptions } from '../../../engine/core/operations/FindReplace';
import { useFocusTrap } from '../hooks/useFocusTrap';

// =============================================================================
// Types
// =============================================================================

export interface FindReplaceDialogProps {
  /** Whether the dialog is visible */
  isOpen: boolean;
  /** Initial mode */
  mode: 'find' | 'replace';
  /** Total match count (from engine) */
  matchCount: number;
  /** Current match index, 0-based (-1 if none) */
  currentMatchIndex: number;
  /** Trigger a find with query and options */
  onFind: (query: string, options: FindOptions) => void;
  /** Navigate to next match */
  onFindNext: () => void;
  /** Navigate to previous match */
  onFindPrevious: () => void;
  /** Replace current match */
  onReplaceCurrent: (value: string) => void;
  /** Replace all matches */
  onReplaceAll: (query: string, options: FindOptions, value: string) => void;
  /** Close the dialog */
  onClose: () => void;
}

// =============================================================================
// Constants
// =============================================================================

const DEBOUNCE_MS = 150;
/** Maximum regex query length to prevent catastrophic backtracking (ReDoS) */
const MAX_REGEX_LENGTH = 200;

// =============================================================================
// Component
// =============================================================================

const FindReplaceDialogInner: React.FC<FindReplaceDialogProps> = ({
  isOpen,
  mode,
  matchCount,
  currentMatchIndex,
  onFind,
  onFindNext,
  onFindPrevious,
  onReplaceCurrent,
  onReplaceAll,
  onClose,
}) => {
  // --- Core state ---
  const [query, setQuery] = useState('');
  const [replaceValue, setReplaceValue] = useState('');
  const [activeTab, setActiveTab] = useState<'find' | 'replace'>(mode);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeCell, setWholeCell] = useState(false);
  const [regex, setRegex] = useState(false);
  const [regexError, setRegexError] = useState<string | null>(null);

  // --- Drag state ---
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  dragOffsetRef.current = dragOffset;

  // --- Refs ---
  const findInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hasSearchedRef = useRef(false);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  // --- Focus trap for dialog ---
  useFocusTrap({ containerRef: dialogRef, enabled: isOpen, onEscape: onClose });

  // Stable refs for callbacks to avoid effect churn
  const onFindRef = useRef(onFind);
  const onFindNextRef = useRef(onFindNext);
  const onReplaceCurrentRef = useRef(onReplaceCurrent);
  onFindRef.current = onFind;
  onFindNextRef.current = onFindNext;
  onReplaceCurrentRef.current = onReplaceCurrent;

  // Sync activeTab when mode prop changes (e.g., Ctrl+F vs Ctrl+H)
  useEffect(() => {
    setActiveTab(mode);
  }, [mode]);

  // Auto-focus find input on open or mode change; reset drag position
  useEffect(() => {
    let rafId: number | undefined;
    if (isOpen) {
      setDragOffset({ x: 0, y: 0 });
      rafId = requestAnimationFrame(() => {
        findInputRef.current?.focus();
        findInputRef.current?.select();
      });
    }
    return () => { if (rafId !== undefined) cancelAnimationFrame(rafId); };
  }, [isOpen, mode]);

  // Clean up drag listeners on unmount (defense against force-close during drag)
  useEffect(() => () => { dragCleanupRef.current?.(); }, []);

  // Build options object (memoized to avoid recreation)
  const options = useMemo<FindOptions>(() => ({
    caseSensitive,
    wholeCell,
    regex,
  }), [caseSensitive, wholeCell, regex]);

  // Debounced find — fires on query or options change
  // Uses onFindRef to keep dependency array stable
  useEffect(() => {
    clearTimeout(debounceRef.current);
    setRegexError(null);

    // Empty query: clear results (only after first search to skip mount fire)
    if (!query) {
      if (hasSearchedRef.current) {
        onFindRef.current('', options);
      }
      return;
    }

    hasSearchedRef.current = true;

    // Validate regex before sending to engine
    if (regex) {
      if (query.length > MAX_REGEX_LENGTH) {
        setRegexError(`Regex too long (max ${MAX_REGEX_LENGTH} characters)`);
        return;
      }
      try {
        new RegExp(query);
      } catch (e) {
        setRegexError(e instanceof SyntaxError ? e.message : 'Invalid regular expression');
        return;
      }
    }

    debounceRef.current = setTimeout(() => {
      onFindRef.current(query, options);
    }, DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [query, options, regex]);

  // --- Draggable header ---
  const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // Don't start drag from the close button
    if ((e.target as HTMLElement).closest('.find-replace-close-btn')) return;

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
    e.preventDefault(); // Prevent text selection during drag
  }, []);

  // --- Keyboard handling ---
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Handle Ctrl+F/H inside the dialog — re-focus find input, block browser Find
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      if (e.key === 'f' || e.key === 'h') {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'h') setActiveTab('replace');
        else setActiveTab('find');
        findInputRef.current?.focus();
        findInputRef.current?.select();
        return;
      }
    }

    switch (e.key) {
      // Escape is handled by useFocusTrap({ onEscape: onClose }) — no duplicate handler needed

      case 'F3':
        // Standard Excel shortcut: F3 = Find Next, Shift+F3 = Find Previous
        e.preventDefault();
        if (!query || matchCount === 0) break;
        if (e.shiftKey) {
          onFindPrevious();
        } else {
          onFindNext();
        }
        break;

      case 'Enter': {
        e.preventDefault();
        // In Replace input: replace current match + auto-advance
        const isReplaceFocused = document.activeElement === replaceInputRef.current;
        if (isReplaceFocused && activeTab === 'replace' && matchCount > 0 && currentMatchIndex >= 0) {
          onReplaceCurrentRef.current(replaceValue);
          // Advance after a tick so engine processes the replace first
          requestAnimationFrame(() => onFindNextRef.current());
          break;
        }
        // In Find input or elsewhere: Find Next / Find Previous
        if (!query || matchCount === 0) break;
        if (e.shiftKey) {
          onFindPrevious();
        } else {
          onFindNext();
        }
        break;
      }
    }
  }, [onFindNext, onFindPrevious, query, matchCount, currentMatchIndex, activeTab, replaceValue]);

  // Stop keyboard events from reaching the grid — selective to preserve
  // native input behaviour (Ctrl+A/C/V/X/Z work in text fields)
  const handleKeyDownCapture = useCallback((e: React.KeyboardEvent) => {
    // Let standard text editing shortcuts through to the input natively
    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase();
      if (['a', 'c', 'v', 'x', 'z'].includes(key)) {
        return; // Don't stop propagation — native input behaviour needed
      }
    }
    // Stop all other keys from leaking to grid KeyboardAdapter
    e.stopPropagation();
  }, []);

  // --- Action handlers ---
  const handleReplace = useCallback(() => {
    onReplaceCurrent(replaceValue);
    // Auto-advance to next match (matches Excel/Sheets behaviour)
    requestAnimationFrame(() => onFindNextRef.current());
  }, [onReplaceCurrent, replaceValue]);

  const handleReplaceAll = useCallback(() => {
    onReplaceAll(query, options, replaceValue);
  }, [onReplaceAll, query, options, replaceValue]);

  // --- Match count display ---
  const matchText = useMemo(() => {
    if (!query) return '';
    if (regexError) return regexError;
    if (matchCount === 0) return 'No matches';
    if (currentMatchIndex < 0) return `${matchCount} matches`;
    return `${currentMatchIndex + 1} of ${matchCount}`;
  }, [query, matchCount, currentMatchIndex, regexError]);

  // Always mounted — return null only when closed to preserve state
  if (!isOpen) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-label="Find and Replace"
      className="find-replace-dialog"
      style={dragOffset.x || dragOffset.y ? { transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` } : undefined}
      onKeyDown={handleKeyDown}
      onKeyDownCapture={handleKeyDownCapture}
    >
      {/* Header — draggable */}
      <div className="find-replace-header" onMouseDown={handleHeaderMouseDown}>
        <span className="find-replace-title">Find and Replace</span>
        <button
          type="button"
          className="find-replace-close-btn"
          aria-label="Close"
          onClick={onClose}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M3 3l8 8M11 3l-8 8" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="find-replace-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={`find-replace-tab ${activeTab === 'find' ? 'find-replace-tab-active' : ''}`}
          aria-selected={activeTab === 'find'}
          onClick={() => setActiveTab('find')}
        >
          Find
        </button>
        <button
          type="button"
          role="tab"
          className={`find-replace-tab ${activeTab === 'replace' ? 'find-replace-tab-active' : ''}`}
          aria-selected={activeTab === 'replace'}
          onClick={() => setActiveTab('replace')}
        >
          Replace
        </button>
      </div>

      {/* Body */}
      <div className="find-replace-body">
        {/* Find row */}
        <div className="find-replace-row">
          <label className="find-replace-label" htmlFor="fr-find-input">Find:</label>
          <input
            id="fr-find-input"
            ref={findInputRef}
            type="text"
            className="find-replace-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            className="find-replace-nav-btn"
            aria-label="Previous match"
            title="Previous match (Shift+Enter / Shift+F3)"
            disabled={matchCount === 0}
            onClick={onFindPrevious}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 8l4-4 4 4" />
            </svg>
          </button>
          <button
            type="button"
            className="find-replace-nav-btn"
            aria-label="Next match"
            title="Next match (Enter / F3)"
            disabled={matchCount === 0}
            onClick={onFindNext}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 4l4 4 4-4" />
            </svg>
          </button>
        </div>

        {/* Replace row (only in replace tab) */}
        {activeTab === 'replace' && (
          <div className="find-replace-row">
            <label className="find-replace-label" htmlFor="fr-replace-input">Replace:</label>
            <input
              id="fr-replace-input"
              ref={replaceInputRef}
              type="text"
              className="find-replace-input"
              value={replaceValue}
              onChange={(e) => setReplaceValue(e.target.value)}
              placeholder="Replace with..."
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        )}

        {/* Options */}
        <div className="find-replace-options">
          <label className="find-replace-checkbox">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
            />
            <span>Case sensitive</span>
          </label>
          <label className="find-replace-checkbox">
            <input
              type="checkbox"
              checked={wholeCell}
              onChange={(e) => setWholeCell(e.target.checked)}
            />
            <span>Match entire cell</span>
          </label>
          <label className="find-replace-checkbox">
            <input
              type="checkbox"
              checked={regex}
              onChange={(e) => setRegex(e.target.checked)}
            />
            <span>Regular expressions</span>
          </label>
        </div>

        {/* Match count — always rendered for aria-live announcements */}
        <div
          className={`find-replace-match-count ${regexError ? 'find-replace-error' : ''}`}
          aria-live="polite"
        >
          {matchText}
        </div>
      </div>

      {/* Actions */}
      <div className="find-replace-actions">
        {activeTab === 'replace' && (
          <>
            <button
              type="button"
              className="find-replace-btn"
              disabled={matchCount === 0 || currentMatchIndex < 0}
              onClick={handleReplace}
              title="Replace current match and advance (Enter in Replace field)"
            >
              Replace
            </button>
            <button
              type="button"
              className="find-replace-btn"
              disabled={matchCount === 0 || !query}
              onClick={handleReplaceAll}
            >
              Replace All
            </button>
          </>
        )}
        <div className="find-replace-actions-spacer" />
        <button
          type="button"
          className="find-replace-btn"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
};

FindReplaceDialogInner.displayName = 'FindReplaceDialog';

export const FindReplaceDialog = memo(FindReplaceDialogInner);
export default FindReplaceDialog;
