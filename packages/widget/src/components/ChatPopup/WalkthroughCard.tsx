import type { WalkthroughPart } from "../../types/conversation";
import { ThoughtTicker } from "./walkthrough/ThoughtTicker";
import { ReasoningDisclosure } from "./walkthrough/ReasoningDisclosure";
import { ChapterChecklist } from "./walkthrough/ChapterChecklist";

interface Props {
  wt: WalkthroughPart;
  isActive: boolean;
}

export function WalkthroughCard({ wt, isActive }: Props) {
  const planning = wt.status === "planning";
  const displayGoal = wt.planGoal || (planning ? "Planning your tour…" : "Walkthrough");

  return (
    <div
      className={`eregna-wt-card ${isActive ? "eregna-wt-card--active" : ""} ${planning ? "eregna-wt-card--planning" : ""}`}
      role="region"
      aria-label="Walkthrough plan"
    >
      <div className="eregna-wt-card__header">
        <span className="eregna-wt-card__icon eregna-wt-card__icon--dimmed" aria-hidden title="Playback coming soon">
          ▶
        </span>
        <div className="eregna-wt-card__body">
          <span className="eregna-wt-card__goal">{displayGoal}</span>
          {wt.planRationale && (
            <span className="eregna-wt-card__rationale">{wt.planRationale}</span>
          )}
          <ThoughtTicker thoughts={wt.thoughts} status={wt.status} />
          {!planning && wt.chapters.length > 0 && (
            <span className="eregna-wt-card__meta">
              {wt.chapters.length} chapter{wt.chapters.length !== 1 ? "s" : ""}
              {wt.status === "planned" ? " · ready" : ""}
            </span>
          )}
        </div>
      </div>

      {wt.reasoning && (
        <ReasoningDisclosure walkthroughId={wt.walkthroughId} reasoning={wt.reasoning} />
      )}

      <ChapterChecklist chapters={wt.chapters} planning={planning} />

      {wt.status === "error" && (
        <p className="eregna-wt-card__error">
          I couldn&apos;t plan a full tour. Try asking with a more specific goal.
        </p>
      )}
    </div>
  );
}
