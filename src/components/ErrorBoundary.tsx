import React from 'react';

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected application error occurred.',
    };
  }

  render() {
    if (this.state.hasError) {
      let readable = this.state.errorMessage;
      try {
        const parsed = JSON.parse(this.state.errorMessage);
        if (parsed?.error) {
          readable = `${parsed.operationType?.toUpperCase() || 'OP'} (${parsed.path || 'db'}): ${parsed.error}`;
        }
      } catch {
        // plain text error
      }

      return (
        <div className="min-h-screen bg-[#070709] text-zinc-100 flex items-center justify-center p-6">
          <div className="max-w-lg w-full border border-white/10 bg-[#0d0d11] p-8 space-y-5">
            <p className="text-xs tracking-[0.2em] uppercase text-red-400">
              Application Notice
            </p>
            <h1 className="font-display text-2xl font-bold text-white">
              Unable to complete operation
            </h1>
            <p className="text-sm text-zinc-400 leading-relaxed break-words">
              {readable}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, errorMessage: '' })}
              className="px-5 py-2.5 text-xs font-semibold tracking-wider uppercase bg-white text-black hover:bg-zinc-200 transition-colors cursor-pointer"
            >
              Return to Studio
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
