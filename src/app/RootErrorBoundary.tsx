// TERAGON AI BUSINESS OS — Gate S10.0-B: root render error boundary.
//
// Catches an UNEXPECTED render/lifecycle failure anywhere below it, reports ONE
// sanitized event through the provider-neutral sink, and shows a calm Hebrew
// recovery screen with a retry action.
//
// Two deliberate decisions:
//  * The fallback uses PLAIN elements and CSS variables — no design-system,
//    theme, toast or router hooks. A fallback that depends on the providers it
//    sits above can crash again while rendering the crash screen.
//  * NOTHING technical is shown or reported: no message, no stack, no component
//    trace. The user gets a recovery path; the sink gets kind/code/route only.
import { Component } from "react";
import type { ErrorInfo, ReactElement, ReactNode } from "react";
import { reportError } from "@/observability/errorSink";

interface Props {
  readonly children: ReactNode;
  /** Test seam so a test can retry without a real page reload. */
  readonly onReload?: () => void;
}
interface State {
  readonly crashed: boolean;
}

const panel: React.CSSProperties = {
  maxInlineSize: "34rem",
  margin: "10vh auto",
  padding: "var(--os-space-6, 24px)",
  display: "grid",
  gap: "var(--os-space-4, 16px)",
  textAlign: "center",
  background: "var(--os-raised, #fff)",
  border: "1px solid var(--os-border, #ddd)",
  borderRadius: "var(--os-radius-md, 10px)",
  color: "var(--os-text, #111)",
};

export class RootErrorBoundary extends Component<Props, State> {
  override state: State = { crashed: false };
  /** Guards against a duplicate report when React re-invokes the boundary. */
  private reported = false;

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // `_error` and `_info` are intentionally NOT forwarded: message, stack and
    // the component trace are exactly what leaks rows and personal data.
    if (this.reported) return;
    this.reported = true;
    reportError({
      kind: "render_error",
      code: "UNCAUGHT_RENDER_ERROR",
      route: typeof window !== "undefined" ? window.location.pathname : "",
    });
  }

  private handleRetry = (): void => {
    this.reported = false;
    this.setState({ crashed: false });
    if (this.props.onReload) this.props.onReload();
    else if (typeof window !== "undefined") window.location.reload();
  };

  override render(): ReactNode {
    if (!this.state.crashed) return this.props.children;
    return (
      <div role="alert" data-testid="root-error-boundary" style={panel}>
        <h1 style={{ fontSize: "var(--os-text-lg, 18px)", margin: 0 }}>אירעה תקלה בלתי צפויה</h1>
        <p style={{ margin: 0, color: "var(--os-text-2, #555)" }}>
          המסך לא נטען כראוי. הנתונים שלכם לא נפגעו. נסו לרענן את המסך; אם התקלה חוזרת, פנו למנהל המערכת.
        </p>
        <div>
          <button
            type="button"
            onClick={this.handleRetry}
            style={{
              padding: "8px 16px",
              borderRadius: "var(--os-radius-sm, 6px)",
              border: "1px solid var(--os-border, #ddd)",
              background: "var(--os-raised, #fff)",
              color: "var(--os-text, #111)",
              cursor: "pointer",
            }}
          >
            רענון המסך
          </button>
        </div>
      </div>
    );
  }
}

export default function RootErrorBoundaryWrapper(props: Props): ReactElement {
  return <RootErrorBoundary {...props} />;
}
