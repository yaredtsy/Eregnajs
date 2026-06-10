import type { Thought, WalkthroughPart } from "../../types/conversation";
import { useWidgetDispatch } from "../../store/widget-context";

const VISIBLE = 3;

interface Props {
  wt: WalkthroughPart | null;
  // While planning with no thoughts yet, the ticker is the only feedback.
  planning: boolean;
}

export function ThinkingTicker({ wt, planning }: Props) {
  const dispatch = useWidgetDispatch();
  const thoughts: Thought[] = wt?.thoughts ?? [];
  const visible = thoughts.slice(-VISIBLE);

  if (visible.length === 0 && !planning) return null;

  return (
    <button
      type="button"
      className="eregna-ticker"
      onClick={() => dispatch({ type: "TOGGLE_PLAN_PANEL" })}
      aria-label="Show plan"
    >
      {visible.length === 0 ? (
        <span className="eregna-ticker__line eregna-ticker__line--shimmer">
          <span className="eregna-ticker__spark" aria-hidden>✦</span>
          Thinking…
        </span>
      ) : (
        visible.map((thought, i) => (
          <span
            key={thought.id}
            className={`eregna-ticker__line ${
              i === visible.length - 1 ? "eregna-ticker__line--latest" : ""
            }`}
            style={{ opacity: (i + 1) / visible.length }}
          >
            <span className="eregna-ticker__spark" aria-hidden>✦</span>
            {thought.label}
          </span>
        ))
      )}
    </button>
  );
}
