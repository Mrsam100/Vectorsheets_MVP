/**
 * VectorSheet - Main Application Entry
 *
 * This is the root component that renders the SpreadsheetShell.
 * The UI is a pure consumer of SpreadsheetEngine - no engine logic here.
 */

import React from 'react';
import { SpreadsheetContainer } from './components';
import { ThemeProvider } from './components/ThemeProvider';
import { ToastProvider } from './components/ToastProvider';
import './styles/index.css';

// =============================================================================
// Error Boundary — catches render errors so the entire app doesn't white-screen
// =============================================================================

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to console so developers can diagnose the issue
    console.error('[VectorSheet] Uncaught render error:', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleDismiss = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            backgroundColor: 'var(--color-bg-primary, #ffffff)',
            color: 'var(--color-text-primary, #1e293b)',
            padding: 32,
            textAlign: 'center',
          }}
          role="alert"
        >
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary, #64748b)', marginBottom: 24, maxWidth: 480 }}>
            An unexpected error occurred. Your data is safe — try reloading the page.
          </p>
          {this.state.error && (
            <pre
              style={{
                fontSize: 12,
                padding: 12,
                marginBottom: 24,
                maxWidth: 600,
                maxHeight: 120,
                overflow: 'auto',
                backgroundColor: 'var(--color-bg-tertiary, #f1f5f9)',
                borderRadius: 6,
                border: '1px solid var(--color-border-primary, #e2e8f0)',
                textAlign: 'left',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {this.state.error.message}
            </pre>
          )}
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={this.handleReload}
              style={{
                padding: '8px 20px',
                fontSize: 14,
                fontWeight: 500,
                backgroundColor: 'var(--color-accent, #1a73e8)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Reload Page
            </button>
            <button
              onClick={this.handleDismiss}
              style={{
                padding: '8px 20px',
                fontSize: 14,
                fontWeight: 500,
                backgroundColor: 'transparent',
                color: 'var(--color-text-secondary, #64748b)',
                border: '1px solid var(--color-border-secondary, #cbd5e1)',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Try to Continue
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// =============================================================================
// App Root
// =============================================================================

const App: React.FC = () => {
  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <div className="app h-screen w-screen overflow-hidden">
            <SpreadsheetContainer />
          </div>
        </ToastProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  );
};

export default App;
