const POPOVER_WIDTH = 300;
const MARGIN = 12;

interface Props {
  title?: string;
  visibleText: string;
  anchorRect: DOMRect | null;
  footer?: string;
  variant?: "default" | "notice";
  onContinue?: () => void;
  onStop?: () => void;
}

export function Popover({
  title,
  visibleText,
  anchorRect,
  footer,
  variant = "default",
  onContinue,
  onStop,
}: Props) {
  const style = anchorRect
    ? computePosition(anchorRect)
    : { position: "fixed" as const, top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  const isNotice = variant === "notice";

  return (
    <div
      style={{
        ...style,
        zIndex: 2147483645,
        pointerEvents: isNotice ? "auto" : "none",
        width: POPOVER_WIDTH,
        background: "#1e1e2e",
        border: isNotice ? "1px solid rgba(244,63,94,0.5)" : "1px solid rgba(99,102,241,0.4)",
        borderRadius: 12,
        padding: "12px 14px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        color: "#e2e8f0",
        fontFamily: "system-ui, sans-serif",
        fontSize: 13,
        lineHeight: 1.55,
      }}
    >
      {title && (
        <p
          style={{
            margin: "0 0 6px",
            fontWeight: 600,
            fontSize: 12,
            color: "#a5b4fc",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {title}
        </p>
      )}
      <p style={{ margin: 0 }}>
        {visibleText}
        {!isNotice && (
          <span
            style={{
              display: "inline-block",
              width: 2,
              height: "0.85em",
              background: "#a5b4fc",
              marginLeft: 2,
              verticalAlign: "middle",
              animation: "eregna-blink 1s step-end infinite",
            }}
          />
        )}
      </p>
      {footer && (
        <p
          style={{
            margin: "8px 0 0",
            paddingTop: 8,
            borderTop: "1px solid rgba(255,255,255,0.08)",
            fontFamily: "ui-monospace, monospace",
            fontSize: 11,
            color: "#7c85c0",
            overflowWrap: "anywhere",
          }}
        >
          {footer}
        </p>
      )}
      {isNotice && onContinue && onStop ? (
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 12,
            pointerEvents: "auto",
          }}
        >
          <button
            type="button"
            onClick={onContinue}
            style={{
              flex: 1,
              border: "none",
              borderRadius: 8,
              padding: "8px 10px",
              background: "#6366f1",
              color: "#fff",
              fontWeight: 600,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Continue
          </button>
          <button
            type="button"
            onClick={onStop}
            style={{
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 8,
              padding: "8px 10px",
              background: "transparent",
              color: "#94a3b8",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Stop
          </button>
        </div>
      ) : null}
    </div>
  );
}

function computePosition(rect: DOMRect): React.CSSProperties {
  const vpW = window.innerWidth;
  const vpH = window.innerHeight;

  const spaceBelow = vpH - rect.bottom;
  const spaceAbove = rect.top;

  let top: number;
  let left: number;

  if (spaceBelow >= 120 || spaceBelow >= spaceAbove) {
    top = rect.bottom + MARGIN;
  } else {
    top = rect.top - 120 - MARGIN;
  }

  left = rect.left;
  if (left + POPOVER_WIDTH + MARGIN > vpW) {
    left = vpW - POPOVER_WIDTH - MARGIN;
  }
  if (left < MARGIN) left = MARGIN;

  return { position: "fixed", top, left };
}
