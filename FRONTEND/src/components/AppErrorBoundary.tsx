import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export default class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled SIG-DESK render error', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="min-h-screen bg-surface-container-lowest text-on-surface flex items-center justify-center p-6">
        <section className="w-full max-w-lg rounded-2xl border border-red-500/30 bg-surface-container-low p-8 shadow-2xl">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
            <AlertTriangle size={24} aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold">Could not display this screen</h1>
          <p className="mt-2 text-sm leading-6 text-on-surface-variant">
            Your data is safe. Reload the application to retry the request.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-opacity hover:opacity-90"
          >
            <RefreshCw size={16} aria-hidden="true" />
            Reload application
          </button>
        </section>
      </main>
    );
  }
}
