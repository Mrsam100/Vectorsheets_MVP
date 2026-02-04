/**
 * AutoScrollController - Manages viewport auto-scroll during drag operations
 *
 * Features:
 * - Edge detection using viewport bounds
 * - Smooth acceleration based on distance from edge
 * - Cell-metric-aware scrolling (uses VirtualRenderer)
 * - Bounded scrolling (respects max scroll limits)
 * - RAF-based animation for smooth 60fps scrolling
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                      AUTO-SCROLL ZONES                                  │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │                                                                         │
 * │   ┌─────────────────────────────────────────────────────────────────┐   │
 * │   │         TOP SCROLL ZONE (threshold pixels)                      │   │
 * │   ├─────┬───────────────────────────────────────────────────┬───────┤   │
 * │   │     │                                                   │       │   │
 * │   │  L  │                                                   │   R   │   │
 * │   │  E  │            CONTENT AREA                           │   I   │   │
 * │   │  F  │            (no auto-scroll)                       │   G   │   │
 * │   │  T  │                                                   │   H   │   │
 * │   │     │                                                   │   T   │   │
 * │   ├─────┴───────────────────────────────────────────────────┴───────┤   │
 * │   │        BOTTOM SCROLL ZONE (threshold pixels)                    │   │
 * │   └─────────────────────────────────────────────────────────────────┘   │
 * │                                                                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Speed increases as cursor moves closer to edge:
 * - At threshold boundary: minimum speed
 * - At edge: maximum speed
 */

// =============================================================================
// Types
// =============================================================================

export type ScrollDirection = 'up' | 'down' | 'left' | 'right';

export interface ScrollState {
  scrollLeft: number;
  scrollTop: number;
}

export interface ViewportBounds {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export interface ScrollLimits {
  maxScrollX: number;
  maxScrollY: number;
}

export interface AutoScrollConfig {
  /** Distance from edge where auto-scroll activates (pixels) */
  threshold: number;
  /** Minimum scroll speed (pixels per frame) */
  minSpeed: number;
  /** Maximum scroll speed (pixels per frame) */
  maxSpeed: number;
  /** Acceleration curve (1 = linear, 2 = quadratic, etc.) */
  accelerationCurve: number;
  /** Target frame rate for smooth scrolling */
  targetFps: number;
}

export interface EdgeDetectionResult {
  /** Is cursor in any scroll zone? */
  isInScrollZone: boolean;
  /** Primary direction to scroll (null if not in zone) */
  direction: ScrollDirection | null;
  /** Calculated scroll speed based on distance from edge */
  speed: number;
  /** Distance from edge (0 = at edge, threshold = at boundary) */
  distanceFromEdge: number;
  /** Secondary direction for corner-zone diagonal scrolling (null if single-axis) */
  secondaryDirection: ScrollDirection | null;
  /** Secondary speed for corner-zone scrolling */
  secondarySpeed: number;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: AutoScrollConfig = {
  threshold: 50,
  minSpeed: 2,
  maxSpeed: 20,
  accelerationCurve: 1.5,
  targetFps: 60,
};

// =============================================================================
// AutoScrollController Class
// =============================================================================

export class AutoScrollController {
  private config: AutoScrollConfig;
  private animationFrameId: number | null = null;
  private lastFrameTime: number = 0;
  private currentDirection: ScrollDirection | null = null;
  private currentSpeed: number = 0;
  private secondaryDirection: ScrollDirection | null = null;
  private secondarySpeed: number = 0;
  private isActive: boolean = false;

  // Callbacks
  private onScroll: ((delta: { x: number; y: number }) => void) | null = null;
  private onScrollComplete: (() => void) | null = null;
  private getViewportBounds: (() => ViewportBounds) | null = null;
  private getScrollLimits: (() => ScrollLimits) | null = null;
  private getCurrentScroll: (() => ScrollState) | null = null;

  constructor(config: Partial<AutoScrollConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  /**
   * Set callbacks for scroll operations
   */
  setCallbacks(callbacks: {
    onScroll: (delta: { x: number; y: number }) => void;
    onScrollComplete?: () => void;
    getViewportBounds: () => ViewportBounds;
    getScrollLimits: () => ScrollLimits;
    getCurrentScroll: () => ScrollState;
  }): void {
    this.onScroll = callbacks.onScroll;
    this.onScrollComplete = callbacks.onScrollComplete ?? null;
    this.getViewportBounds = callbacks.getViewportBounds;
    this.getScrollLimits = callbacks.getScrollLimits;
    this.getCurrentScroll = callbacks.getCurrentScroll;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<AutoScrollConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ===========================================================================
  // Edge Detection
  // ===========================================================================

  /**
   * Detect if cursor is in auto-scroll zone and calculate scroll parameters
   */
  detectEdge(clientX: number, clientY: number): EdgeDetectionResult {
    if (!this.getViewportBounds) {
      return { isInScrollZone: false, direction: null, speed: 0, distanceFromEdge: 0, secondaryDirection: null, secondarySpeed: 0 };
    }

    const bounds = this.getViewportBounds();
    const { threshold } = this.config;

    // Check each edge independently to support compound (diagonal) scrolling
    const topDistance = clientY - bounds.top;
    const bottomDistance = bounds.bottom - clientY;
    const leftDistance = clientX - bounds.left;
    const rightDistance = bounds.right - clientX;

    const result: EdgeDetectionResult = {
      isInScrollZone: false,
      direction: null,
      speed: 0,
      distanceFromEdge: threshold,
      secondaryDirection: null,
      secondarySpeed: 0,
    };

    // Vertical axis (primary when in corner zones)
    if (topDistance < threshold && topDistance >= 0) {
      result.isInScrollZone = true;
      result.direction = 'up';
      result.speed = this.calculateSpeed(threshold - topDistance);
      result.distanceFromEdge = topDistance;
    } else if (bottomDistance < threshold && bottomDistance >= 0) {
      result.isInScrollZone = true;
      result.direction = 'down';
      result.speed = this.calculateSpeed(threshold - bottomDistance);
      result.distanceFromEdge = bottomDistance;
    }

    // Horizontal axis (secondary when vertical is active, primary otherwise)
    if (leftDistance < threshold && leftDistance >= 0) {
      if (result.direction) {
        result.secondaryDirection = 'left';
        result.secondarySpeed = this.calculateSpeed(threshold - leftDistance);
      } else {
        result.isInScrollZone = true;
        result.direction = 'left';
        result.speed = this.calculateSpeed(threshold - leftDistance);
        result.distanceFromEdge = leftDistance;
      }
    } else if (rightDistance < threshold && rightDistance >= 0) {
      if (result.direction) {
        result.secondaryDirection = 'right';
        result.secondarySpeed = this.calculateSpeed(threshold - rightDistance);
      } else {
        result.isInScrollZone = true;
        result.direction = 'right';
        result.speed = this.calculateSpeed(threshold - rightDistance);
        result.distanceFromEdge = rightDistance;
      }
    }

    return result;
  }

  /**
   * Calculate scroll speed based on distance into scroll zone
   * Uses acceleration curve for natural feel
   */
  private calculateSpeed(distanceIntoZone: number): number {
    const { threshold, minSpeed, maxSpeed, accelerationCurve } = this.config;

    // Normalize distance (0 = at boundary, 1 = at edge)
    const normalizedDistance = Math.min(1, Math.max(0, distanceIntoZone / threshold));

    // Apply acceleration curve
    const acceleratedDistance = Math.pow(normalizedDistance, accelerationCurve);

    // Interpolate between min and max speed
    return minSpeed + (maxSpeed - minSpeed) * acceleratedDistance;
  }

  // ===========================================================================
  // Scroll Animation
  // ===========================================================================

  /**
   * Start auto-scrolling in a direction
   */
  start(direction: ScrollDirection, speed: number, secondaryDirection?: ScrollDirection | null, secondarySpeed?: number): void {
    // If already scrolling in same directions with similar speeds, just update
    if (
      this.isActive &&
      this.currentDirection === direction &&
      this.secondaryDirection === (secondaryDirection ?? null) &&
      Math.abs(this.currentSpeed - speed) < 2
    ) {
      this.currentSpeed = speed;
      this.secondarySpeed = secondarySpeed ?? 0;
      return;
    }

    this.stop();
    this.currentDirection = direction;
    this.currentSpeed = speed;
    this.secondaryDirection = secondaryDirection ?? null;
    this.secondarySpeed = secondarySpeed ?? 0;
    this.isActive = true;
    this.lastFrameTime = performance.now();
    this.animate();
  }

  /**
   * Stop auto-scrolling
   */
  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.isActive) {
      this.isActive = false;
      this.currentDirection = null;
      this.currentSpeed = 0;
      this.secondaryDirection = null;
      this.secondarySpeed = 0;
      this.onScrollComplete?.();
    }
  }

  /**
   * Update scroll speed during animation
   */
  updateSpeed(speed: number): void {
    this.currentSpeed = speed;
  }

  /**
   * Check if currently auto-scrolling
   */
  isScrolling(): boolean {
    return this.isActive;
  }

  /**
   * Get current scroll direction
   */
  getDirection(): ScrollDirection | null {
    return this.currentDirection;
  }

  /**
   * Animation frame handler
   */
  private animate = (): void => {
    if (!this.isActive || !this.onScroll || !this.getCurrentScroll || !this.getScrollLimits) {
      this.stop();
      return;
    }

    const now = performance.now();
    const deltaTime = now - this.lastFrameTime;
    this.lastFrameTime = now;

    // Calculate frame-rate-independent scroll amount
    const targetFrameTime = 1000 / this.config.targetFps;
    const timeMultiplier = deltaTime / targetFrameTime;
    const scrollAmount = this.currentSpeed * timeMultiplier;

    // Get current scroll and limits
    const currentScroll = this.getCurrentScroll();
    const limits = this.getScrollLimits();

    // Calculate scroll delta for primary direction
    let deltaX = 0;
    let deltaY = 0;

    switch (this.currentDirection) {
      case 'up':
        deltaY = -scrollAmount;
        break;
      case 'down':
        deltaY = scrollAmount;
        break;
      case 'left':
        deltaX = -scrollAmount;
        break;
      case 'right':
        deltaX = scrollAmount;
        break;
    }

    // Calculate scroll delta for secondary direction (corner-zone diagonal)
    if (this.secondaryDirection) {
      const secondaryAmount = this.secondarySpeed * timeMultiplier;
      switch (this.secondaryDirection) {
        case 'left':
          deltaX += -secondaryAmount;
          break;
        case 'right':
          deltaX += secondaryAmount;
          break;
        case 'up':
          deltaY += -secondaryAmount;
          break;
        case 'down':
          deltaY += secondaryAmount;
          break;
      }
    }

    // Check bounds — stop only when ALL active axes are at their limits
    const newScrollX = currentScroll.scrollLeft + deltaX;
    const newScrollY = currentScroll.scrollTop + deltaY;

    const xAtBoundary = deltaX === 0 || (deltaX < 0 && newScrollX <= 0) || (deltaX > 0 && newScrollX >= limits.maxScrollX);
    const yAtBoundary = deltaY === 0 || (deltaY < 0 && newScrollY <= 0) || (deltaY > 0 && newScrollY >= limits.maxScrollY);
    const atBoundary = xAtBoundary && yAtBoundary;

    // Apply bounded delta
    const boundedDeltaX = Math.max(-currentScroll.scrollLeft, Math.min(deltaX, limits.maxScrollX - currentScroll.scrollLeft));
    const boundedDeltaY = Math.max(-currentScroll.scrollTop, Math.min(deltaY, limits.maxScrollY - currentScroll.scrollTop));

    // Only emit scroll if there's actual movement
    if (boundedDeltaX !== 0 || boundedDeltaY !== 0) {
      this.onScroll({ x: boundedDeltaX, y: boundedDeltaY });
    }

    // Continue animation only if not at boundary and still active
    // At boundary: fully stop to reset state and avoid zombie animation
    if (atBoundary) {
      this.stop();
      return;
    }
    if (this.isActive) {
      this.animationFrameId = requestAnimationFrame(this.animate);
    }
  };

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Dispose of controller and clean up resources
   */
  dispose(): void {
    this.stop();
    this.onScroll = null;
    this.onScrollComplete = null;
    this.getViewportBounds = null;
    this.getScrollLimits = null;
    this.getCurrentScroll = null;
  }
}

// =============================================================================
// React Hook
// =============================================================================

import { useRef, useEffect, useCallback } from 'react';

export interface UseAutoScrollOptions {
  /** Container element ref */
  containerRef: React.RefObject<HTMLElement>;
  /** Scroll container element ref (the element that actually scrolls) */
  scrollContainerRef: React.RefObject<HTMLElement>;
  /** Callback when scroll position changes */
  onScroll: (scroll: ScrollState) => void;
  /** Get maximum scroll bounds */
  getMaxScroll: () => { x: number; y: number };
  /** Auto-scroll configuration */
  config?: Partial<AutoScrollConfig>;
  /** Whether auto-scroll is enabled */
  enabled?: boolean;
}

/**
 * React hook for auto-scroll functionality
 *
 * Usage:
 * ```tsx
 * const autoScroll = useAutoScroll({
 *   containerRef,
 *   scrollContainerRef,
 *   onScroll: (scroll) => setScroll(scroll),
 *   getMaxScroll: () => renderer.getMaxScroll(),
 * });
 *
 * // During drag:
 * autoScroll.update(clientX, clientY);
 *
 * // On drag end:
 * autoScroll.stop();
 * ```
 */
export function useAutoScroll(options: UseAutoScrollOptions) {
  const {
    containerRef,
    scrollContainerRef,
    onScroll,
    getMaxScroll,
    config,
    enabled = true,
  } = options;

  const controllerRef = useRef<AutoScrollController | null>(null);
  const onScrollRef = useRef(onScroll);
  const getMaxScrollRef = useRef(getMaxScroll);

  // Keep refs up to date
  onScrollRef.current = onScroll;
  getMaxScrollRef.current = getMaxScroll;

  // Initialize controller
  useEffect(() => {
    controllerRef.current = new AutoScrollController(config);

    return () => {
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, []);

  // Update config when it changes
  useEffect(() => {
    if (config) {
      controllerRef.current?.setConfig(config);
    }
  }, [config]);

  // Set up callbacks
  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;

    controller.setCallbacks({
      onScroll: (delta) => {
        const scrollContainer = scrollContainerRef.current;
        if (!scrollContainer) return;

        const newScrollLeft = scrollContainer.scrollLeft + delta.x;
        const newScrollTop = scrollContainer.scrollTop + delta.y;

        // Apply to DOM
        scrollContainer.scrollLeft = newScrollLeft;
        scrollContainer.scrollTop = newScrollTop;

        // Notify parent
        onScrollRef.current({
          scrollLeft: scrollContainer.scrollLeft,
          scrollTop: scrollContainer.scrollTop,
        });
      },
      getViewportBounds: () => {
        const container = containerRef.current;
        if (!container) {
          return { top: 0, left: 0, right: 0, bottom: 0 };
        }
        const rect = container.getBoundingClientRect();
        return {
          top: rect.top,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom,
        };
      },
      getScrollLimits: () => {
        const max = getMaxScrollRef.current();
        return { maxScrollX: max.x, maxScrollY: max.y };
      },
      getCurrentScroll: () => {
        const scrollContainer = scrollContainerRef.current;
        if (!scrollContainer) {
          return { scrollLeft: 0, scrollTop: 0 };
        }
        return {
          scrollLeft: scrollContainer.scrollLeft,
          scrollTop: scrollContainer.scrollTop,
        };
      },
    });
  }, [containerRef, scrollContainerRef]);

  /**
   * Update auto-scroll based on cursor position
   * Call this during drag operations
   */
  const update = useCallback((clientX: number, clientY: number) => {
    const controller = controllerRef.current;
    if (!controller || !enabled) return;

    const result = controller.detectEdge(clientX, clientY);

    if (result.isInScrollZone && result.direction) {
      controller.start(result.direction, result.speed, result.secondaryDirection, result.secondarySpeed);
    } else {
      controller.stop();
    }
  }, [enabled]);

  /**
   * Stop auto-scrolling
   */
  const stop = useCallback(() => {
    controllerRef.current?.stop();
  }, []);

  /**
   * Check if currently auto-scrolling
   */
  const isScrolling = useCallback(() => {
    return controllerRef.current?.isScrolling() ?? false;
  }, []);

  /**
   * Get current scroll direction
   */
  const getDirection = useCallback(() => {
    return controllerRef.current?.getDirection() ?? null;
  }, []);

  return {
    update,
    stop,
    isScrolling,
    getDirection,
  };
}

// =============================================================================
// Scroll-to-Cell Utility
// =============================================================================

export interface ScrollToCellOptions {
  /** Row to scroll to */
  row: number;
  /** Column to scroll to */
  col: number;
  /** Whether to animate the scroll */
  animate?: boolean;
  /** Padding from viewport edge (in pixels) */
  padding?: number;
}

/**
 * Calculate scroll position to bring a cell into view
 *
 * @param options - Cell coordinates and options
 * @param getCellBounds - Function to get cell bounds in content coordinates
 * @param getViewportInfo - Function to get viewport information
 * @param currentScroll - Current scroll position
 * @returns New scroll position, or null if cell is already visible
 */
export function calculateScrollToCell(
  options: ScrollToCellOptions,
  getCellBounds: (row: number, col: number) => { x: number; y: number; width: number; height: number },
  getViewportInfo: () => {
    viewableWidth: number;
    viewableHeight: number;
    frozenWidth: number;
    frozenHeight: number;
  },
  currentScroll: ScrollState
): ScrollState | null {
  const { row, col, padding = 0 } = options;
  const cell = getCellBounds(row, col);
  const viewport = getViewportInfo();

  let newScrollLeft = currentScroll.scrollLeft;
  let newScrollTop = currentScroll.scrollTop;
  let changed = false;

  // Check horizontal visibility (accounting for frozen columns)
  const effectiveCellLeft = cell.x - viewport.frozenWidth;
  const effectiveCellRight = effectiveCellLeft + cell.width;
  const visibleWidth = viewport.viewableWidth - viewport.frozenWidth;

  if (effectiveCellLeft < currentScroll.scrollLeft + padding) {
    // Cell is to the left of visible area
    newScrollLeft = Math.max(0, effectiveCellLeft - padding);
    changed = true;
  } else if (effectiveCellRight > currentScroll.scrollLeft + visibleWidth - padding) {
    // Cell is to the right of visible area
    newScrollLeft = effectiveCellRight - visibleWidth + padding;
    changed = true;
  }

  // Check vertical visibility (accounting for frozen rows)
  const effectiveCellTop = cell.y - viewport.frozenHeight;
  const effectiveCellBottom = effectiveCellTop + cell.height;
  const visibleHeight = viewport.viewableHeight - viewport.frozenHeight;

  if (effectiveCellTop < currentScroll.scrollTop + padding) {
    // Cell is above visible area
    newScrollTop = Math.max(0, effectiveCellTop - padding);
    changed = true;
  } else if (effectiveCellBottom > currentScroll.scrollTop + visibleHeight - padding) {
    // Cell is below visible area
    newScrollTop = effectiveCellBottom - visibleHeight + padding;
    changed = true;
  }

  if (!changed) return null;

  return { scrollLeft: newScrollLeft, scrollTop: newScrollTop };
}
