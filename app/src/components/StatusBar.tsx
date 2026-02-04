/**
 * StatusBar - Application status bar
 *
 * Displays:
 * - Current cell/selection info
 * - Edit mode indicator
 * - Quick stats (sum, average, count for selection)
 * - Zoom control
 * - Sheet tabs (via SheetTabs component)
 */

import React, { useState, useRef, useEffect, memo } from 'react';
import { SheetTabs, type SheetTabInfo } from './SheetTabs';

export interface StatusBarProps {
  /** Optional class name */
  className?: string;

  /** Edit mode: 'ready' | 'edit' | 'enter' */
  mode?: 'ready' | 'edit' | 'enter';
  /** Selection statistics */
  stats?: {
    sum?: number;
    average?: number;
    count?: number;
    min?: number;
    max?: number;
  };
  /** Current zoom level (1 = 100%) */
  zoom?: number;
  /** Zoom change handler */
  onZoomChange?: (zoom: number) => void;
  /** Sheet tab data */
  sheets?: ReadonlyArray<SheetTabInfo>;
  /** Activate a sheet */
  onActivateSheet?: (id: string) => void;
  /** Add a new sheet */
  onAddSheet?: () => void;
  /** Rename a sheet */
  onRenameSheet?: (id: string, newName: string) => void;
  /** Delete a sheet */
  onDeleteSheet?: (id: string) => void;
  /** Reorder a sheet */
  onReorderSheet?: (id: string, newIndex: number) => void;
}

const ZOOM_LEVELS = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2];

const MODE_LABELS: Record<string, { text: string; color: string }> = {
  ready: { text: 'Ready', color: 'statusbar-mode-ready' },
  edit: { text: 'Edit', color: 'statusbar-mode-edit' },
  enter: { text: 'Enter', color: 'statusbar-mode-enter' },
};

function formatStatNumber(num: number | undefined): string {
  if (num === undefined) return '—';
  if (Number.isInteger(num)) return num.toLocaleString();
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const StatusBarInner: React.FC<StatusBarProps> = ({
  className = '',
  mode = 'ready',
  stats,
  zoom = 1,
  onZoomChange,
  sheets,
  onActivateSheet,
  onAddSheet,
  onRenameSheet,
  onDeleteSheet,
  onReorderSheet,
}) => {
  const [showZoomMenu, setShowZoomMenu] = useState(false);
  const zoomContainerRef = useRef<HTMLDivElement>(null);

  const currentMode = MODE_LABELS[mode] || MODE_LABELS.ready;

  const handleZoomClick = (level: number) => {
    onZoomChange?.(level);
    setShowZoomMenu(false);
  };

  // Dismiss zoom menu on click-outside
  useEffect(() => {
    if (!showZoomMenu) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (zoomContainerRef.current && !zoomContainerRef.current.contains(e.target as Node)) {
        setShowZoomMenu(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [showZoomMenu]);

  return (
    <footer
      className={`statusbar flex items-center h-6 px-2 border-t text-xs ${className}`}
    >
      {/* Left Section - Sheet Tabs */}
      <div className="flex items-center mr-4" style={{ maxWidth: '40%' }}>
        {sheets && onActivateSheet && onAddSheet && onRenameSheet && onDeleteSheet && onReorderSheet ? (
          <SheetTabs
            sheets={sheets}
            onActivateSheet={onActivateSheet}
            onAddSheet={onAddSheet}
            onRenameSheet={onRenameSheet}
            onDeleteSheet={onDeleteSheet}
            onReorderSheet={onReorderSheet}
          />
        ) : (
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="statusbar-sheet-btn flex items-center gap-1 px-2 py-0.5 rounded"
              title="Sheet 1"
            >
              <span>Sheet1</span>
            </button>
            <button
              type="button"
              className="statusbar-add-btn w-5 h-5 flex items-center justify-center rounded"
              title="Add sheet"
            >
              <PlusIcon className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="statusbar-divider w-px h-4 mr-3" />

      {/* Mode Indicator */}
      <div className="flex items-center gap-2 mr-4">
        <span className={`font-medium ${currentMode.color}`}>
          {currentMode.text}
        </span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Selection Stats (hidden on narrow viewports via CSS) */}
      {stats && (
        <div className="statusbar-stats flex items-center gap-4 mr-4 statusbar-stat-value">
          {stats.sum !== undefined && (
            <div className="flex items-center gap-1">
              <span className="statusbar-stat-label">Sum:</span>
              <span className="font-medium">{formatStatNumber(stats.sum)}</span>
            </div>
          )}
          {stats.average !== undefined && (
            <div className="flex items-center gap-1">
              <span className="statusbar-stat-label">Avg:</span>
              <span className="font-medium">{formatStatNumber(stats.average)}</span>
            </div>
          )}
          {stats.count !== undefined && (
            <div className="flex items-center gap-1">
              <span className="statusbar-stat-label">Count:</span>
              <span className="font-medium">{formatStatNumber(stats.count)}</span>
            </div>
          )}
        </div>
      )}

      {/* Divider (hidden with stats on narrow viewports) */}
      <div className="statusbar-divider statusbar-stats w-px h-4 mr-3" />

      {/* Zoom Control */}
      <div className="relative flex items-center gap-1" ref={zoomContainerRef}>
        <button
          type="button"
          className="statusbar-zoom-btn p-0.5 rounded disabled:opacity-50"
          onClick={() => {
            const idx = ZOOM_LEVELS.findIndex((z) => z >= zoom);
            if (idx > 0) onZoomChange?.(ZOOM_LEVELS[idx - 1]);
          }}
          disabled={zoom <= ZOOM_LEVELS[0]}
          title="Zoom out"
        >
          <MinusIcon className="w-3 h-3" />
        </button>

        <button
          type="button"
          className="statusbar-zoom-text w-14 text-center rounded px-1 py-0.5"
          onClick={() => setShowZoomMenu(!showZoomMenu)}
          title="Zoom level"
        >
          {Math.round(zoom * 100)}%
        </button>

        <button
          type="button"
          className="statusbar-zoom-btn p-0.5 rounded disabled:opacity-50"
          onClick={() => {
            const idx = ZOOM_LEVELS.findIndex((z) => z > zoom);
            if (idx !== -1) onZoomChange?.(ZOOM_LEVELS[idx]);
          }}
          disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
          title="Zoom in"
        >
          <PlusIcon className="w-3 h-3" />
        </button>

        {/* Zoom Menu */}
        {showZoomMenu && (
          <div className="statusbar-zoom-menu absolute bottom-full right-0 mb-1 w-20 rounded-md py-1 z-50">
            {ZOOM_LEVELS.map((level) => (
              <button
                type="button"
                key={level}
                className={`statusbar-zoom-option w-full px-3 py-1 text-left text-xs ${
                  level === zoom ? 'statusbar-zoom-option-active' : ''
                }`}
                onClick={() => handleZoomClick(level)}
              >
                {Math.round(level * 100)}%
              </button>
            ))}
          </div>
        )}
      </div>
    </footer>
  );
};

// Simple icon components
const PlusIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const MinusIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
  </svg>
);

StatusBarInner.displayName = 'StatusBar';

export const StatusBar = memo(StatusBarInner);
export default StatusBar;
