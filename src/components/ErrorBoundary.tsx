import { Component, lazy, Suspense, type ReactNode } from 'react';

const DiagnosticExport = lazy(() => import('./DiagnosticExport').then((m) => ({ default: m.DiagnosticExport })));

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            color: '#f44',
            fontFamily: 'monospace',
            padding: 40,
            background: '#111',
            height: '100%',
          }}
        >
          <h1>Something went wrong</h1>
          <pre style={{ marginTop: 16, fontSize: 12 }}>
            {this.state.error.message}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 16,
              padding: '8px 16px',
              background: '#333',
              color: '#0f0',
              border: '1px solid #0f0',
              cursor: 'pointer',
              fontFamily: 'monospace',
            }}
          >
            Try Again
          </button>
          <Suspense fallback={null}><DiagnosticExport uiFailure /></Suspense>
        </div>
      );
    }
    return this.props.children;
  }
}
