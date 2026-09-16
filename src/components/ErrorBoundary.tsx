import { Component, type ReactNode } from "react";

/**
 * Catches render/runtime errors anywhere in the tree so a single component
 * crash shows a recoverable screen instead of a blank white page. Uses inline
 * styles so it renders even if the stylesheet failed to load. The "reset" action
 * clears localStorage + sessionStorage (config, session, caches) but NOT the
 * IndexedDB keystore, so the user's wallet survives — they just re-unlock.
 */
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // Surface it for anyone with the console open.
    console.error("RouGee crashed:", error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
          textAlign: "center",
          background: "#0a0c12",
          color: "#eafffe",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div style={{ fontSize: 40 }}>🛠️</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Something went wrong</h1>
        <p style={{ maxWidth: 360, fontSize: 14, color: "#8b95a7", margin: 0 }}>
          The app hit an unexpected error. A reload usually fixes it. If not,
          resetting local data will clear caches and settings — your wallet stays
          safe (you'll just re-enter your password).
        </p>
        <pre
          style={{
            maxWidth: "90vw",
            maxHeight: 120,
            overflow: "auto",
            fontSize: 11,
            color: "#ff8a9c",
            background: "rgba(255,255,255,.04)",
            borderRadius: 8,
            padding: "8px 12px",
            margin: 0,
            whiteSpace: "pre-wrap",
          }}
        >
          {error.message}
        </pre>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <button
            onClick={() => location.reload()}
            style={btn("#00d2be", "#0a0c12")}
          >
            Reload
          </button>
          <button
            onClick={() => {
              try {
                localStorage.clear();
                sessionStorage.clear();
              } catch {
                /* ignore */
              }
              location.reload();
            }}
            style={btn("rgba(255,255,255,.08)", "#eafffe")}
          >
            Reset data &amp; reload
          </button>
        </div>
      </div>
    );
  }
}

function btn(bg: string, color: string): React.CSSProperties {
  return {
    appearance: "none",
    border: "none",
    borderRadius: 10,
    padding: "10px 18px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    background: bg,
    color,
  };
}
