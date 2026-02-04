/**
 * OnboardingOverlay - First-use tutorial with spotlight callouts
 *
 * Renders a semi-transparent backdrop with a spotlight cutout over
 * each target element, plus a callout tooltip with step navigation.
 *
 * Positioning is derived from DOM queries (targetSelector + getBoundingClientRect).
 * A ResizeObserver repositions the spotlight on layout change.
 *
 * Accessibility:
 * - Focus trapped inside callout via useFocusTrap
 * - aria-modal="true" on the dialog
 * - Focus auto-moved to Next button on step change
 * - Escape → skipAll
 */

import React, { useEffect, useState, useCallback, useRef, memo } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { UseOnboardingReturn, OnboardingStep } from '../hooks/useOnboarding';

// =============================================================================
// Types
// =============================================================================

export interface OnboardingOverlayProps {
  onboarding: UseOnboardingReturn;
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// =============================================================================
// Helpers
// =============================================================================

const CALLOUT_PADDING = 12;
const SPOTLIGHT_PADDING = 6;

function getCalloutPosition(
  placement: OnboardingStep['placement'],
  target: TargetRect,
  calloutWidth: number,
  calloutHeight: number,
): { top: number; left: number } {
  const centerX = target.left + target.width / 2 - calloutWidth / 2;
  const centerY = target.top + target.height / 2 - calloutHeight / 2;

  let top: number;
  let left: number;

  switch (placement) {
    case 'bottom':
      top = target.top + target.height + SPOTLIGHT_PADDING + CALLOUT_PADDING;
      left = centerX;
      break;
    case 'top':
      top = target.top - calloutHeight - SPOTLIGHT_PADDING - CALLOUT_PADDING;
      left = centerX;
      break;
    case 'right':
      top = centerY;
      left = target.left + target.width + SPOTLIGHT_PADDING + CALLOUT_PADDING;
      break;
    case 'left':
      top = centerY;
      left = target.left - calloutWidth - SPOTLIGHT_PADDING - CALLOUT_PADDING;
      break;
    default:
      top = target.top + target.height + CALLOUT_PADDING;
      left = centerX;
  }

  // Clamp to viewport
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  left = Math.max(8, Math.min(left, vw - calloutWidth - 8));
  top = Math.max(8, Math.min(top, vh - calloutHeight - 8));

  return { top, left };
}

// =============================================================================
// Component
// =============================================================================

const OnboardingOverlayInner: React.FC<OnboardingOverlayProps> = ({ onboarding }) => {
  const { step, currentStep, totalSteps, next, prev, skipAll } = onboarding;
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const calloutRef = useRef<HTMLDivElement>(null);
  const nextBtnRef = useRef<HTMLButtonElement>(null);
  const [calloutSize, setCalloutSize] = useState({ width: 320, height: 200 });

  // Focus trap — traps Tab within the callout, Escape → skipAll
  useFocusTrap({
    containerRef: calloutRef,
    enabled: !!step,
    onEscape: skipAll,
  });

  // -------------------------------------------------------------------------
  // Find and observe target element
  // -------------------------------------------------------------------------

  const updateRect = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(step.targetSelector);
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    } else {
      setTargetRect(null);
    }
  }, [step]);

  useEffect(() => {
    updateRect();

    if (!step) return;

    const el = document.querySelector(step.targetSelector);
    if (!el) return;

    const ro = new ResizeObserver(() => updateRect());
    ro.observe(el);

    // Also reposition on window resize/scroll
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [step, updateRect]);

  // Measure callout after render
  useEffect(() => {
    if (calloutRef.current) {
      const rect = calloutRef.current.getBoundingClientRect();
      setCalloutSize({ width: rect.width, height: rect.height });
    }
  }, [step]);

  // Focus the Next button on step change for keyboard/screen reader users
  useEffect(() => {
    if (step && nextBtnRef.current) {
      const rafId = requestAnimationFrame(() => {
        nextBtnRef.current?.focus();
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [step]);

  if (!step) return null;

  const spotlightStyle: React.CSSProperties = targetRect
    ? {
        top: targetRect.top - SPOTLIGHT_PADDING,
        left: targetRect.left - SPOTLIGHT_PADDING,
        width: targetRect.width + SPOTLIGHT_PADDING * 2,
        height: targetRect.height + SPOTLIGHT_PADDING * 2,
      }
    : { display: 'none' };

  const calloutPos = targetRect
    ? getCalloutPosition(step.placement, targetRect, calloutSize.width, calloutSize.height)
    : { top: window.innerHeight / 2 - 100, left: window.innerWidth / 2 - 160 };

  return (
    <>
      {/* Backdrop — click to skip */}
      <div
        className="onboarding-backdrop"
        onClick={skipAll}
        aria-hidden="true"
      />

      {/* Spotlight cutout */}
      <div className="onboarding-spotlight" style={spotlightStyle} />

      {/* Callout tooltip */}
      <div
        ref={calloutRef}
        className="onboarding-callout"
        style={{ top: calloutPos.top, left: calloutPos.left }}
        role="dialog"
        aria-label={step.title}
        aria-modal="true"
        aria-describedby={`onboarding-desc-${step.id}`}
        onKeyDownCapture={(e) => {
          // Prevent grid keyboard shortcuts from firing while onboarding is active
          if (e.key !== 'Escape' && e.key !== 'Tab') {
            e.stopPropagation();
          }
        }}
      >
        <div className="onboarding-callout-header">
          <h3 className="onboarding-callout-title">{step.title}</h3>
          <span
            className="onboarding-callout-counter"
            aria-label={`Step ${currentStep + 1} of ${totalSteps}`}
          >
            {currentStep + 1} / {totalSteps}
          </span>
        </div>

        <p id={`onboarding-desc-${step.id}`} className="onboarding-callout-desc">
          {step.description}
        </p>

        <div className="onboarding-callout-actions">
          <button
            type="button"
            className="onboarding-skip-btn"
            onClick={skipAll}
            aria-label="Skip onboarding tutorial"
          >
            Skip
          </button>
          <div className="onboarding-callout-nav">
            {currentStep > 0 && (
              <button
                type="button"
                className="dialog-btn onboarding-prev-btn"
                onClick={prev}
              >
                Back
              </button>
            )}
            <button
              ref={nextBtnRef}
              type="button"
              className="dialog-btn dialog-btn-primary onboarding-next-btn"
              onClick={next}
            >
              {currentStep === totalSteps - 1 ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

OnboardingOverlayInner.displayName = 'OnboardingOverlay';

export const OnboardingOverlay = memo(OnboardingOverlayInner);
export default OnboardingOverlay;
