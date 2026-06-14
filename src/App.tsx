import { ErrorBoundary } from './components/ErrorBoundary';
import { RfsShell } from './app/RfsShell';

export function App() {
  return (
    <ErrorBoundary>
      <RfsShell />
    </ErrorBoundary>
  );
}
