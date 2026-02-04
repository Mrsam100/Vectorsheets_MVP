/**
 * DevPerfOverlay - Development-only performance monitoring overlay
 *
 * Shows FPS counter, JS heap memory usage, and slow operation warnings.
 * Gated behind `import.meta.env.PROD` so Vite tree-shakes it from production builds.
 *
 * Toggle: Ctrl+Shift+P (registered in SpreadsheetShell)
 * Position: fixed top-left, z-index 500
 */

import React, { useState, useEffect, useRef, memo } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface DevPerfOverlayProps {
  visible: boolean;
}

interface SlowOpEntry {
  id: number;
  label: string;
  duration: number;
  timestamp: number;
}

// =============================================================================
// Slow Operation Reporter (module-level, callable from anywhere)
// =============================================================================

const slowOps: SlowOpEntry[] = [];
let slowOpId = 0;
let slowOpListener: (() => void) | null = null;

const MAX_SLOW_OPS = 20;

/**
 * Report a slow operation. Call from anywhere in the app.
 * Only has effect in development mode.
 */
export function reportSlowOp(label: string, durationMs: number): void {
  if (import.meta.env.PROD) return;

  slowOps.push({ id: ++slowOpId, label, duration: durationMs, timestamp: Date.now() });
  if (slowOps.length > MAX_SLOW_OPS) {
    slowOps.shift();
  }
  slowOpListener?.();
}

// =============================================================================
// Component
// =============================================================================

const DevPerfOverlayInner: React.FC<DevPerfOverlayProps> = ({ visible }) => {
  // Production guard — Vite eliminates this branch
  if (import.meta.env.PROD) return null;
  if (!visible) return null;

  return <DevPerfPanel />;
};

/**
 * Separated panel so hooks only run when visible
 */
const DevPerfPanel: React.FC = memo(() => {
  const [fps, setFps] = useState(0);
  const [frameTime, setFrameTime] = useState(0);
  const [heapMB, setHeapMB] = useState<number | null>(null);
  const [heapTrend, setHeapTrend] = useState<number | null>(null);
  const [, forceRender] = useState(0);

  const frameCountRef = useRef(0);
  const lastSecondRef = useRef(performance.now());
  const lastFrameRef = useRef(performance.now());
  const prevHeapRef = useRef<number | null>(null);

  // FPS measurement via RAF loop
  useEffect(() => {
    let rafId: number;

    const measure = () => {
      const now = performance.now();
      lastFrameRef.current = now;
      frameCountRef.current++;

      // Update FPS once per second
      if (now - lastSecondRef.current >= 1000) {
        const elapsed = now - lastSecondRef.current;
        const measuredFps = Math.round((frameCountRef.current * 1000) / elapsed);
        const avgFrameTime = +(elapsed / frameCountRef.current).toFixed(1);

        setFps(measuredFps);
        setFrameTime(avgFrameTime);

        frameCountRef.current = 0;
        lastSecondRef.current = now;
      }

      rafId = requestAnimationFrame(measure);
    };

    rafId = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Memory measurement (Chrome only)
  useEffect(() => {
    const mem = (performance as any).memory;
    if (!mem) {
      setHeapMB(null);
      return;
    }

    const read = () => {
      const usedMB = +(mem.usedJSHeapSize / (1024 * 1024)).toFixed(1);
      setHeapMB(usedMB);

      if (prevHeapRef.current !== null) {
        const delta = +(usedMB - prevHeapRef.current).toFixed(2);
        setHeapTrend(delta);
      }
      prevHeapRef.current = usedMB;
    };

    read();
    const interval = setInterval(read, 2000);
    return () => clearInterval(interval);
  }, []);

  // Subscribe to slow-op notifications
  useEffect(() => {
    slowOpListener = () => forceRender((n) => n + 1);
    return () => { slowOpListener = null; };
  }, []);

  const fpsColor = fps >= 55 ? '#4ade80' : fps >= 30 ? '#facc15' : '#f87171';

  return (
    <div className="dev-perf-overlay">
      <div className="dev-perf-header">Performance</div>

      <div className="dev-perf-metric">
        <span className="dev-perf-label">FPS</span>
        <span className="dev-perf-value" style={{ color: fpsColor }}>{fps}</span>
      </div>

      <div className="dev-perf-metric">
        <span className="dev-perf-label">Frame</span>
        <span className="dev-perf-value">{frameTime}ms</span>
      </div>

      <div className="dev-perf-metric">
        <span className="dev-perf-label">Heap</span>
        <span className="dev-perf-value">
          {heapMB !== null ? `${heapMB}MB` : 'N/A'}
          {heapTrend !== null && heapTrend !== 0 && (
            <span style={{ color: heapTrend > 0 ? '#facc15' : '#4ade80', marginLeft: 4 }}>
              {heapTrend > 0 ? '+' : ''}{heapTrend}
            </span>
          )}
        </span>
      </div>

      {slowOps.length > 0 && (
        <div className="dev-perf-slow-ops">
          <div className="dev-perf-label" style={{ marginTop: 6, marginBottom: 2 }}>Slow Ops</div>
          {slowOps.slice(-5).reverse().map((op) => (
            <div key={op.id} className="dev-perf-slow-op">
              {op.label}: {op.duration.toFixed(1)}ms
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

DevPerfPanel.displayName = 'DevPerfPanel';

export const DevPerfOverlay: React.FC<DevPerfOverlayProps> = memo(DevPerfOverlayInner);
DevPerfOverlay.displayName = 'DevPerfOverlay';
export default DevPerfOverlay;
