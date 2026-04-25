import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  slug?: string;
}

interface State {
  hasError: boolean;
  message: string | null;
}

/**
 * Wraps the public partner portal so an unexpected render crash from
 * malformed partner data (missing sections, broken theme, bad asset URL,
 * etc.) shows a clean, useful message instead of a blank white page.
 *
 * Logs the error to the console so admins can inspect it via browser
 * devtools when previewing.
 */
export class PartnerPortalErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message || String(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[PartnerPortal] render crash", { error, info, slug: this.props.slug });
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <div className="max-w-md text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-amber-600" />
          </div>
          <h1 className="text-xl font-semibold">This portal couldn't be displayed</h1>
          <p className="text-sm text-muted-foreground">
            One of the partner's configured sections has missing or invalid data.
            Open the partner in admin and review their setup, then try the preview again.
          </p>
          {this.state.message && (
            <details className="text-left text-xs text-muted-foreground bg-card border rounded-md p-3">
              <summary className="cursor-pointer font-medium text-foreground">
                Technical details
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-words">{this.state.message}</pre>
            </details>
          )}
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-primary hover:underline"
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
