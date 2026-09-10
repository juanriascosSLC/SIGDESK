import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Keeps an editor-only render failure from replacing the entire SIG-DESK UI. */
export class CatalogBuilderErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Entity Builder render error', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="flex min-h-[70vh] items-center justify-center p-6">
        <section
          data-testid="catalog-builder-render-error"
          className="panel-card w-full max-w-xl p-8 text-center"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-400">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="mt-5 text-2xl font-black text-on-surface">
            Entity Builder encountered an issue
          </h1>
          <p className="mt-2 text-sm leading-6 text-on-surface-variant">
            Your definitions remain safe. You can retry the module without reloading or losing the rest of your session.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a href="/app" className="secondary-button">
              <ArrowLeft className="h-4 w-4" /> Back to home
            </a>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="primary-button"
            >
              <RefreshCw className="h-4 w-4" /> Retry module
            </button>
          </div>
        </section>
      </main>
    );
  }
}

