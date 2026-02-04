/**
 * useOnboarding - First-use tutorial state management
 *
 * Tracks onboarding progress with localStorage persistence.
 * Key: vs-onboarding-complete
 *
 * Steps target DOM elements via CSS selectors for spotlight positioning.
 */

import { useState, useCallback } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  targetSelector: string;
  placement: 'top' | 'bottom' | 'left' | 'right';
}

export interface UseOnboardingReturn {
  /** Whether onboarding should display */
  isActive: boolean;
  /** Current step index */
  currentStep: number;
  /** Total step count */
  totalSteps: number;
  /** The current step definition */
  step: OnboardingStep | null;
  /** Advance to next step (or complete if last) */
  next: () => void;
  /** Go back one step */
  prev: () => void;
  /** Skip all remaining steps and mark complete */
  skipAll: () => void;
  /** Restart onboarding (for testing / help menu) */
  restart: () => void;
}

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY = 'vs-onboarding-complete';

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to VectorSheet',
    description: 'A professional spreadsheet in your browser. Let us show you around.',
    targetSelector: '.topbar',
    placement: 'bottom',
  },
  {
    id: 'formula-bar',
    title: 'Formula Bar',
    description: 'View and edit cell contents and formulas here. Click a cell, then type in the formula bar.',
    targetSelector: '.formula-bar',
    placement: 'bottom',
  },
  {
    id: 'ribbon',
    title: 'Formatting Toolbar',
    description: 'Format cells, manage clipboard, and apply styles. Buttons reflect the active cell\'s formatting.',
    targetSelector: '.ribbon',
    placement: 'bottom',
  },
  {
    id: 'grid',
    title: 'The Spreadsheet Grid',
    description: 'Click any cell to select it. Double-click or press F2 to edit. Drag to select a range.',
    targetSelector: '.grid-viewport',
    placement: 'top',
  },
  {
    id: 'statusbar',
    title: 'Status Bar & Sheet Tabs',
    description: 'Switch between sheets, view selection statistics, and control zoom level.',
    targetSelector: '.statusbar',
    placement: 'top',
  },
];

// =============================================================================
// Helpers
// =============================================================================

function isOnboardingComplete(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function markOnboardingComplete(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    // Storage unavailable — silently ignore
  }
}

function clearOnboardingComplete(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable — silently ignore
  }
}

// =============================================================================
// Hook
// =============================================================================

export function useOnboarding(): UseOnboardingReturn {
  const [isActive, setIsActive] = useState<boolean>(() => !isOnboardingComplete());
  const [currentStep, setCurrentStep] = useState(0);

  const complete = useCallback(() => {
    setIsActive(false);
    markOnboardingComplete();
  }, []);

  const next = useCallback(() => {
    if (currentStep >= ONBOARDING_STEPS.length - 1) {
      complete();
    } else {
      setCurrentStep((s) => s + 1);
    }
  }, [currentStep, complete]);

  const prev = useCallback(() => {
    setCurrentStep((s) => Math.max(0, s - 1));
  }, []);

  const skipAll = useCallback(() => {
    complete();
  }, [complete]);

  const restart = useCallback(() => {
    setCurrentStep(0);
    setIsActive(true);
    clearOnboardingComplete();
  }, []);

  return {
    isActive,
    currentStep,
    totalSteps: ONBOARDING_STEPS.length,
    step: isActive ? ONBOARDING_STEPS[currentStep] ?? null : null,
    next,
    prev,
    skipAll,
    restart,
  };
}

export default useOnboarding;
