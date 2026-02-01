/**
 * StatusBar - Application status bar
 *
 * Displays:
 * - Current cell/selection info
 * - Edit mode indicator
 * - Quick stats (sum, average, count for selection)
 * - Zoom control
 * - Sheet tabs (placeholder)
 */

import React, { useState } from 'react';

export interface StatusBarProps {
  /** Optional class name */
  className?: string;
  /** Current cell address */
  cellAddress?: string;
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
}

const ZOOM_LEVELS = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2];

export const StatusBar: React.FC<StatusBarProps> = ({
  className = '',
  cellAddress: _cellAddress = 'A1', // Reserved for future use
  mode = 'ready',
  stats,
  zoom = 1,
  onZoomChange,
}) => {
  const [showZoomMenu, setShowZoomMenu] = useState(false);

  const modeLabels: Record<string, { text: string; color: string }> = {
    ready: { text: 'Ready', color: 'text-gray-500' },
    edit: { text: 'Edit', color: 'text-blue-600' },
    enter: { text: 'Enter', color: 'text-green-600' },
  };

  const currentMode = modeLabels[mode] || modeLabels.ready;

  // Format number for display
  const formatNumber = (num: number | undefined): string => {
    if (num === undefined) return '—';
    if (Number.isInteger(num)) return num.toLocaleString();
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  const handleZoomClick = (level: number) => {
    onZoomChange?.(level);
    setShowZoomMenu(false);
  };

  return (
    <footer
      className={`statusbar flex items-center h-6 px-2 border-t border-gray-200 bg-gray-50 text-xs ${className}`}
    >
      {/* Left Section - Sheet Tabs Placeholder */}
      <div className="flex items-center gap-1 mr-4">
        <button
          className="flex items-center gap-1 px-2 py-0.5 bg-white border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
          title="Sheet 1"
        >
          <span>Sheet1</span>
        </button>
        <button
          className="w-5 h-5 flex items-center justify-center text-gray-500 hover:bg-gray-200 rounded"
          title="Add sheet"
        >
          <PlusIcon className="w-3 h-3" />
        </button>
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-gray-300 mr-3" />

      {/* Mode Indicator */}
      <div className="flex items-center gap-2 mr-4">
        <span className={`font-medium ${currentMode.color}`}>
          {currentMode.text}
        </span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Selection Stats */}
      {stats && (
        <div className="flex items-center gap-4 mr-4 text-gray-600">
          {stats.sum !== undefined && (
            <div className="flex items-center gap-1">
              <span className="text-gray-400">Sum:</span>
              <span className="font-medium">{formatNumber(stats.sum)}</span>
            </div>
          )}
          {stats.average !== undefined && (
            <div className="flex items-center gap-1">
              <span className="text-gray-400">Avg:</span>
              <span className="font-medium">{formatNumber(stats.average)}</span>
            </div>
          )}
          {stats.count !== undefined && (
            <div className="flex items-center gap-1">
              <span className="text-gray-400">Count:</span>
              <span className="font-medium">{formatNumber(stats.count)}</span>
            </div>
          )}
        </div>
      )}

      {/* Divider */}
      <div className="w-px h-4 bg-gray-300 mr-3" />

      {/* Zoom Control */}
      <div className="relative flex items-center gap-1">
        <button
          className="p-0.5 hover:bg-gray-200 rounded disabled:opacity-50"
          onClick={() => {
            const idx = ZOOM_LEVELS.findIndex((z) => z >= zoom);
            if (idx > 0) onZoomChange?.(ZOOM_LEVELS[idx - 1]);
          }}
          disabled={zoom <= ZOOM_LEVELS[0]}
          title="Zoom out"
        >
          <MinusIcon className="w-3 h-3 text-gray-500" />
        </button>

        <button
          className="w-14 text-center text-gray-600 hover:bg-gray-200 rounded px-1 py-0.5"
          onClick={() => setShowZoomMenu(!showZoomMenu)}
          title="Zoom level"
        >
          {Math.round(zoom * 100)}%
        </button>

        <button
          className="p-0.5 hover:bg-gray-200 rounded disabled:opacity-50"
          onClick={() => {
            const idx = ZOOM_LEVELS.findIndex((z) => z > zoom);
            if (idx !== -1) onZoomChange?.(ZOOM_LEVELS[idx]);
          }}
          disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
          title="Zoom in"
        >
          <PlusIcon className="w-3 h-3 text-gray-500" />
        </button>

        {/* Zoom Menu */}
        {showZoomMenu && (
          <div className="absolute bottom-full right-0 mb-1 w-20 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
            {ZOOM_LEVELS.map((level) => (
              <button
                key={level}
                className={`w-full px-3 py-1 text-left text-xs hover:bg-gray-100 ${
                  level === zoom ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
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

export default StatusBar;
