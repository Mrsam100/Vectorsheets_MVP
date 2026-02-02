/**
 * Ribbon icon components — inline SVGs, no external dependency.
 *
 * All icons: 16×16 viewBox, currentColor for theming.
 */

import React from 'react';

interface IconProps {
  className?: string;
}

// =============================================================================
// Clipboard
// =============================================================================

export const CutIcon: React.FC<IconProps> = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="4" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <path d="M5.5 10.5L12 2M10.5 10.5L4 2" />
  </svg>
);

export const CopyIcon: React.FC<IconProps> = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="5" width="8" height="8" rx="1" />
    <path d="M11 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v7a1 1 0 001 1h2" />
  </svg>
);

export const PasteIcon: React.FC<IconProps> = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="10" height="10" rx="1" />
    <path d="M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1" />
    <path d="M6 8h4M6 11h4" />
  </svg>
);

export const FormatPainterIcon: React.FC<IconProps> = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="6" y="1" width="8" height="5" rx="1" />
    <path d="M9 6v2H7a1 1 0 00-1 1v5" />
  </svg>
);

// =============================================================================
// History
// =============================================================================

export const UndoIcon: React.FC<IconProps> = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h7a3 3 0 110 6H8" />
    <path d="M6 3L3 6l3 3" />
  </svg>
);

export const RedoIcon: React.FC<IconProps> = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 6H6a3 3 0 100 6h2" />
    <path d="M10 3l3 3-3 3" />
  </svg>
);

// =============================================================================
// Font
// =============================================================================

export const BoldIcon: React.FC<IconProps> = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4 2h5a3 3 0 012.08 5.162A3.5 3.5 0 019.5 14H4V2zm2 5h3a1 1 0 100-2H6v2zm0 5h3.5a1.5 1.5 0 000-3H6v3z" />
  </svg>
);

export const ItalicIcon: React.FC<IconProps> = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M6 2h6M4 14h6M9.5 2L6.5 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
  </svg>
);

export const UnderlineIcon: React.FC<IconProps> = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M4 2v5a4 4 0 008 0V2" />
    <path d="M3 14h10" />
  </svg>
);

export const StrikethroughIcon: React.FC<IconProps> = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 8h12" />
    <path d="M10.5 5.5C10.5 4.12 9.38 3 8 3S5 4 5 5.5" />
    <path d="M5.5 10.5C5.5 11.88 6.62 13 8 13s3-1 3-2.5" />
  </svg>
);

export const FontColorIcon: React.FC<IconProps> = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M6 11L8 3l2 8M6.5 9h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

export const BgColorIcon: React.FC<IconProps> = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 11l5-8 5 8H2z" />
    <path d="M13 10a2 2 0 11-1 3.5" />
  </svg>
);

// =============================================================================
// Alignment
// =============================================================================

export const AlignLeftIcon: React.FC<IconProps> = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M2 3h12M2 6h8M2 9h10M2 12h6" />
  </svg>
);

export const AlignCenterIcon: React.FC<IconProps> = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M2 3h12M4 6h8M3 9h10M5 12h6" />
  </svg>
);

export const AlignRightIcon: React.FC<IconProps> = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M2 3h12M6 6h8M4 9h10M8 12h6" />
  </svg>
);

export const WrapTextIcon: React.FC<IconProps> = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h12M2 7h9a2 2 0 110 4H9" />
    <path d="M11 13l-2-2 2-2" />
    <path d="M2 11h4" />
  </svg>
);

// =============================================================================
// Utility
// =============================================================================

export const ChevronDownIcon: React.FC<IconProps> = ({ className }) => (
  <svg className={className} width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 2.5l3 3 3-3" />
  </svg>
);
