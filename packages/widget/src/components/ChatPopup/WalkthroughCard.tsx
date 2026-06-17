import type { WalkthroughPart } from "../../types/conversation";
import { usePreflightPlay } from "../../hooks/useHistoryDrift";

interface Props {
  wt: WalkthroughPart;
  isActive: boolean;
}

export function WalkthroughCard({ wt, isActive }: Props) {
  const playWalkthrough = usePreflightPlay();

  return (
    <button
      className={`eregna-wt-card ${isActive ? "eregna-wt-card--active" : ""}`}
      onClick={() => playWalkthrough(wt.walkthroughId, wt)}
      type="button"
    >
      <span className="eregna-wt-card__icon" aria-hidden>
        ▶
      </span>
      <span className="eregna-wt-card__body">
        <span className="eregna-wt-card__goal">{wt.planGoal}</span>
        <span className="eregna-wt-card__meta">
          {wt.chapters.length} chapter{wt.chapters.length !== 1 ? "s" : ""}
          {isActive ? " · playing" : ""}
        </span>
      </span>
    </button>
  );
}
