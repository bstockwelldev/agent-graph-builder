import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorFallback } from "./ErrorFallback";

type ErrorBoundaryProps = {
  regionLabel: string;
  children: ReactNode;
  onReset?: () => void;
  onReload?: () => void;
  fallbackHeight?: string | number;
};

type ErrorBoundaryState = {
  error: Error | null;
  resetKey: number;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, resetKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error(`[ErrorBoundary:${this.props.regionLabel}]`, error, info.componentStack);
    }
  }

  private handleRetry = () => {
    this.props.onReset?.();
    this.setState((state) => ({ error: null, resetKey: state.resetKey + 1 }));
  };

  render() {
    const { error, resetKey } = this.state;
    const { regionLabel, children, onReload, fallbackHeight = "100%" } = this.props;

    if (error) {
      return (
        <div style={{ height: fallbackHeight, width: "100%", minHeight: 0 }}>
          <ErrorFallback
            regionLabel={regionLabel}
            message={import.meta.env.DEV ? error.message : undefined}
            onRetry={this.handleRetry}
            onReload={onReload}
          />
        </div>
      );
    }

    return <div key={resetKey} style={{ height: "100%", minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column", flex: 1 }}>{children}</div>;
  }
}
