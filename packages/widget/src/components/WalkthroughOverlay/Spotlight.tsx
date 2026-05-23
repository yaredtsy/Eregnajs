const PADDING = 8;
const RADIUS = 12;

interface Props {
  rect: DOMRect;
}

export function Spotlight({ rect }: Props) {
  const x = rect.left - PADDING;
  const y = rect.top - PADDING;
  const w = rect.width + PADDING * 2;
  const h = rect.height + PADDING * 2;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 2147483640,
      }}
    >
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        <defs>
          <mask id="eregna-spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              rx={RADIUS}
              ry={RADIUS}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.55)"
          mask="url(#eregna-spotlight-mask)"
        />
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx={RADIUS}
          ry={RADIUS}
          fill="none"
          stroke="rgba(99,102,241,0.9)"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}
