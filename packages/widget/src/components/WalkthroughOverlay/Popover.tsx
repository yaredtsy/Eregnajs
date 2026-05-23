const POPOVER_WIDTH = 300;
const MARGIN = 12;

interface Props {
  title?: string;
  visibleText: string;
  anchorRect: DOMRect | null;
}

export function Popover({ title, visibleText, anchorRect }: Props) {
  const style = anchorRect
    ? computePosition(anchorRect)
    : { position: "fixed" as const, top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

  return (
    <div
      style={{
        ...style,
        zIndex: 2147483645,
        pointerEvents: "none",
        width: POPOVER_WIDTH,
        background: "#1e1e2e",
        border: "1px solid rgba(99,102,241,0.4)",
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
      </p>
    </div>
  );
}

function computePosition(rect: DOMRect): React.CSSProperties {
  const vpW = window.innerWidth;
  const vpH = window.innerHeight;

  // prefer below, then above, then right
  const spaceBelow = vpH - rect.bottom;
  const spaceAbove = rect.top;
  const spaceRight = vpW - rect.right;

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

  void spaceRight;

  return { position: "fixed", top, left };
}
