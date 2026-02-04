/**
 * DataValidationDialog - Data validation rule editor
 *
 * Excel-style validation dialog with three tabs: Settings, Input Message,
 * Error Alert. Supports all validation types: any, wholeNumber, decimal,
 * list, date, time, textLength, custom.
 *
 * Behaviour:
 * - Draggable by header
 * - Type selector changes visible fields
 * - Operator selector for numeric/date/textLength types
 * - List type shows comma-separated source input
 * - Apply builds ValidationRuleConfig from form state
 * - Remove deletes existing rule
 * - Escape / Cancel closes without applying
 * - Populate from initialRule on open (edit mode) or defaults (new)
 * - onKeyDownCapture stops propagation to grid
 * - position: fixed, centered, z-index 350
 */

import React, { memo, useState, useEffect, useRef, useCallback } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';

// =============================================================================
// Types (local copies to avoid engine import at runtime)
// =============================================================================

export type ValidationType = 'any' | 'wholeNumber' | 'decimal' | 'list' | 'date' | 'time' | 'textLength' | 'custom';
export type ValidationOperator = 'between' | 'notBetween' | 'equal' | 'notEqual' | 'greaterThan' | 'lessThan' | 'greaterThanOrEqual' | 'lessThanOrEqual';
export type ErrorStyle = 'stop' | 'warning' | 'information';

export interface ValidationRuleConfig {
  type: ValidationType;
  operator?: ValidationOperator;
  value1?: string;
  value2?: string;
  listItems?: string[];
  allowBlank?: boolean;
  showDropdown?: boolean;
  showInputMessage?: boolean;
  inputTitle?: string;
  inputMessage?: string;
  showErrorAlert?: boolean;
  errorStyle?: ErrorStyle;
  errorTitle?: string;
  errorMessage?: string;
}

export interface DataValidationDialogProps {
  isOpen: boolean;
  initialRule?: ValidationRuleConfig | null;
  onApply: (rule: ValidationRuleConfig) => void;
  onRemove: () => void;
  onClose: () => void;
}

// =============================================================================
// Constants
// =============================================================================

const TYPE_LABELS: Record<ValidationType, string> = {
  any: 'Any value',
  wholeNumber: 'Whole number',
  decimal: 'Decimal',
  list: 'List',
  date: 'Date',
  time: 'Time',
  textLength: 'Text length',
  custom: 'Custom',
};

const OPERATOR_LABELS: Record<ValidationOperator, string> = {
  between: 'between',
  notBetween: 'not between',
  equal: 'equal to',
  notEqual: 'not equal to',
  greaterThan: 'greater than',
  lessThan: 'less than',
  greaterThanOrEqual: 'greater than or equal to',
  lessThanOrEqual: 'less than or equal to',
};

const TYPES_WITH_OPERATOR: ValidationType[] = ['wholeNumber', 'decimal', 'date', 'time', 'textLength'];
const TYPES_WITH_VALUES: ValidationType[] = ['wholeNumber', 'decimal', 'date', 'time', 'textLength', 'custom'];

type TabId = 'settings' | 'inputMessage' | 'errorAlert';

function getDefaultRule(): ValidationRuleConfig {
  return {
    type: 'any',
    operator: 'between',
    value1: '',
    value2: '',
    listItems: [],
    allowBlank: true,
    showDropdown: true,
    showInputMessage: false,
    inputTitle: '',
    inputMessage: '',
    showErrorAlert: true,
    errorStyle: 'stop',
    errorTitle: '',
    errorMessage: '',
  };
}

// =============================================================================
// Component
// =============================================================================

const DataValidationDialogInner: React.FC<DataValidationDialogProps> = ({
  isOpen,
  initialRule,
  onApply,
  onRemove,
  onClose,
}) => {
  // --- Tab state ---
  const [activeTab, setActiveTab] = useState<TabId>('settings');

  // --- Form state ---
  const [rule, setRule] = useState<ValidationRuleConfig>(getDefaultRule);
  const [listSource, setListSource] = useState('');

  // --- Drag state ---
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  dragOffsetRef.current = dragOffset;

  // --- Refs ---
  const dialogRef = useRef<HTMLDivElement>(null);
  const typeSelectRef = useRef<HTMLSelectElement>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  // --- Focus trap for modal dialog ---
  useFocusTrap({ containerRef: dialogRef, enabled: isOpen, onEscape: onClose });

  // Stable ref for onApply
  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;

  // Whether this is editing an existing rule (for Remove button visibility)
  const isEditing = initialRule != null;

  // Reset state on open; auto-focus type selector
  useEffect(() => {
    let rafId: number | undefined;
    if (isOpen) {
      setActiveTab('settings');
      setDragOffset({ x: 0, y: 0 });
      if (initialRule) {
        setRule({ ...getDefaultRule(), ...initialRule });
        setListSource(initialRule.listItems?.join(', ') ?? '');
      } else {
        setRule(getDefaultRule());
        setListSource('');
      }
      rafId = requestAnimationFrame(() => {
        typeSelectRef.current?.focus();
      });
    }
    return () => { if (rafId !== undefined) cancelAnimationFrame(rafId); };
  }, [isOpen, initialRule]);

  // Clean up drag listeners on unmount (defense against force-close during drag)
  useEffect(() => () => { dragCleanupRef.current?.(); }, []);

  // --- Field updaters ---
  const updateField = useCallback(<K extends keyof ValidationRuleConfig>(
    field: K,
    value: ValidationRuleConfig[K],
  ) => {
    setRule((prev) => ({ ...prev, [field]: value }));
  }, []);

  // --- Apply ---
  const handleApply = useCallback(() => {
    if (rule.type === 'any') return; // "Any value" has nothing to apply
    const final = { ...rule };
    if (final.type === 'list') {
      final.listItems = listSource
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
    onApplyRef.current(final);
  }, [rule, listSource]);

  // --- Draggable header ---
  const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.validation-dialog-close-btn')) return;

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
      case 'Enter': {
        // Don't submit from selects or textareas
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'SELECT' || tag === 'TEXTAREA') break;
        e.preventDefault();
        if (rule.type === 'any') {
          onClose();
          return;
        }
        handleApply();
        break;
      }
    }
  }, [onClose, rule.type, handleApply]);

  const handleKeyDownCapture = useCallback((e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase();
      if (['a', 'c', 'v', 'x', 'z'].includes(key)) return;
    }
    e.stopPropagation();
  }, []);

  if (!isOpen) return null;

  const showOperator = TYPES_WITH_OPERATOR.includes(rule.type);
  const showValues = TYPES_WITH_VALUES.includes(rule.type);
  const showSecondValue = showValues && (rule.operator === 'between' || rule.operator === 'notBetween');
  const showListSource = rule.type === 'list';
  const showCustomFormula = rule.type === 'custom';

  // Value field labels
  let value1Label = 'Value:';
  let value2Label = 'Maximum:';
  if (rule.operator === 'between' || rule.operator === 'notBetween') {
    value1Label = 'Minimum:';
    value2Label = 'Maximum:';
  }
  if (rule.type === 'date') {
    value1Label = rule.operator === 'between' || rule.operator === 'notBetween' ? 'Start date:' : 'Date:';
    value2Label = 'End date:';
  }
  if (rule.type === 'custom') {
    value1Label = 'Formula:';
  }

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
      aria-label="Data Validation"
      className="validation-dialog"
      style={transform ? { transform } : undefined}
      onKeyDown={handleKeyDown}
      onKeyDownCapture={handleKeyDownCapture}
    >
      {/* Header — draggable */}
      <div className="validation-dialog-header" onMouseDown={handleHeaderMouseDown}>
        <span className="validation-dialog-title">Data Validation</span>
        <button
          type="button"
          className="validation-dialog-close-btn"
          aria-label="Close"
          onClick={onClose}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M3 3l8 8M11 3l-8 8" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="validation-dialog-tabs" role="tablist">
        {(['settings', 'inputMessage', 'errorAlert'] as TabId[]).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`vd-tab-${tab}`}
            aria-controls={`vd-panel-${tab}`}
            className={`validation-dialog-tab ${activeTab === tab ? 'validation-dialog-tab-active' : ''}`}
            aria-selected={activeTab === tab}
            tabIndex={activeTab === tab ? 0 : -1}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'settings' ? 'Settings' : tab === 'inputMessage' ? 'Input Message' : 'Error Alert'}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="validation-dialog-body" role="tabpanel" id={`vd-panel-${activeTab}`} aria-labelledby={`vd-tab-${activeTab}`}>
        {/* ===== Settings Tab ===== */}
        {activeTab === 'settings' && (
          <>
            {/* Type selector */}
            <div className="validation-dialog-row">
              <label className="validation-dialog-label" htmlFor="vd-type">Allow:</label>
              <select
                id="vd-type"
                ref={typeSelectRef}
                className="validation-dialog-select"
                value={rule.type}
                onChange={(e) => updateField('type', e.target.value as ValidationType)}
              >
                {(Object.keys(TYPE_LABELS) as ValidationType[]).map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>

            {/* Operator selector */}
            {showOperator && (
              <div className="validation-dialog-row">
                <label className="validation-dialog-label" htmlFor="vd-operator">Data:</label>
                <select
                  id="vd-operator"
                  className="validation-dialog-select"
                  value={rule.operator ?? 'between'}
                  onChange={(e) => updateField('operator', e.target.value as ValidationOperator)}
                >
                  {(Object.keys(OPERATOR_LABELS) as ValidationOperator[]).map((op) => (
                    <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Value 1 */}
            {(showValues || showCustomFormula) && (
              <div className="validation-dialog-row">
                <label className="validation-dialog-label" htmlFor="vd-value1">{value1Label}</label>
                <input
                  id="vd-value1"
                  type="text"
                  className="validation-dialog-input"
                  value={rule.value1 ?? ''}
                  onChange={(e) => updateField('value1', e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            )}

            {/* Value 2 (between/notBetween only) */}
            {showSecondValue && (
              <div className="validation-dialog-row">
                <label className="validation-dialog-label" htmlFor="vd-value2">{value2Label}</label>
                <input
                  id="vd-value2"
                  type="text"
                  className="validation-dialog-input"
                  value={rule.value2 ?? ''}
                  onChange={(e) => updateField('value2', e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            )}

            {/* List source */}
            {showListSource && (
              <>
                <div className="validation-dialog-row">
                  <label className="validation-dialog-label" htmlFor="vd-source">Source:</label>
                  <input
                    id="vd-source"
                    type="text"
                    className="validation-dialog-input"
                    value={listSource}
                    onChange={(e) => setListSource(e.target.value)}
                    placeholder="Item1, Item2, Item3"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                <label className="validation-dialog-checkbox">
                  <input
                    type="checkbox"
                    checked={rule.showDropdown ?? true}
                    onChange={(e) => updateField('showDropdown', e.target.checked)}
                  />
                  <span>In-cell dropdown</span>
                </label>
              </>
            )}

            {/* Ignore blank */}
            <label className="validation-dialog-checkbox">
              <input
                type="checkbox"
                checked={rule.allowBlank ?? true}
                onChange={(e) => updateField('allowBlank', e.target.checked)}
              />
              <span>Ignore blank</span>
            </label>
          </>
        )}

        {/* ===== Input Message Tab ===== */}
        {activeTab === 'inputMessage' && (
          <>
            <label className="validation-dialog-checkbox">
              <input
                type="checkbox"
                checked={rule.showInputMessage ?? false}
                onChange={(e) => updateField('showInputMessage', e.target.checked)}
              />
              <span>Show input message when cell is selected</span>
            </label>
            <div className="validation-dialog-row">
              <label className="validation-dialog-label" htmlFor="vd-input-title">Title:</label>
              <input
                id="vd-input-title"
                type="text"
                className="validation-dialog-input"
                value={rule.inputTitle ?? ''}
                onChange={(e) => updateField('inputTitle', e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className="validation-dialog-row validation-dialog-row-textarea">
              <label className="validation-dialog-label" htmlFor="vd-input-msg">Message:</label>
              <textarea
                id="vd-input-msg"
                className="validation-dialog-textarea"
                value={rule.inputMessage ?? ''}
                onChange={(e) => updateField('inputMessage', e.target.value)}
                rows={3}
                spellCheck={false}
              />
            </div>
          </>
        )}

        {/* ===== Error Alert Tab ===== */}
        {activeTab === 'errorAlert' && (
          <>
            <label className="validation-dialog-checkbox">
              <input
                type="checkbox"
                checked={rule.showErrorAlert ?? true}
                onChange={(e) => updateField('showErrorAlert', e.target.checked)}
              />
              <span>Show error alert after invalid data is entered</span>
            </label>
            <div className="validation-dialog-row">
              <label className="validation-dialog-label" htmlFor="vd-error-style">Style:</label>
              <select
                id="vd-error-style"
                className="validation-dialog-select"
                value={rule.errorStyle ?? 'stop'}
                onChange={(e) => updateField('errorStyle', e.target.value as ErrorStyle)}
              >
                <option value="stop">Stop</option>
                <option value="warning">Warning</option>
                <option value="information">Information</option>
              </select>
            </div>
            <div className="validation-dialog-row">
              <label className="validation-dialog-label" htmlFor="vd-error-title">Title:</label>
              <input
                id="vd-error-title"
                type="text"
                className="validation-dialog-input"
                value={rule.errorTitle ?? ''}
                onChange={(e) => updateField('errorTitle', e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className="validation-dialog-row validation-dialog-row-textarea">
              <label className="validation-dialog-label" htmlFor="vd-error-msg">Message:</label>
              <textarea
                id="vd-error-msg"
                className="validation-dialog-textarea"
                value={rule.errorMessage ?? ''}
                onChange={(e) => updateField('errorMessage', e.target.value)}
                rows={3}
                spellCheck={false}
              />
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="validation-dialog-actions">
        {isEditing && (
          <button type="button" className="dialog-btn dialog-btn-danger" onClick={onRemove}>
            Remove
          </button>
        )}
        <div className="validation-dialog-actions-spacer" />
        <button type="button" className="dialog-btn" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="dialog-btn dialog-btn-primary"
          disabled={rule.type === 'any'}
          onClick={handleApply}
        >
          Apply
        </button>
      </div>
    </div>
    </>
  );
};

DataValidationDialogInner.displayName = 'DataValidationDialog';

export const DataValidationDialog = memo(DataValidationDialogInner);
export default DataValidationDialog;
