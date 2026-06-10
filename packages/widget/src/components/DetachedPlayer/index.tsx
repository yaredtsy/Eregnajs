import { useWidget, useWidgetDispatch, findStreamingWalkthrough } from "../../store/widget-context";
import { PlayerBar } from "../PlayerBar";
import { ThinkingTicker } from "./ThinkingTicker";
import { PlanPanel } from "./PlanPanel";

// The detached player: thinking ticker floating above, plan panel expanding
// from the bar, and either the full player bar (a walkthrough is active) or
// the "preparing" pill (a run is streaming but not yet playable).
export function DetachedPlayer() {
  const { state, activeWt } = useWidget();
  const dispatch = useWidgetDispatch();

  const streamingWt =
    state.playMode === "live" ? findStreamingWalkthrough(state.conversation) : null;
  const pendingWt = !activeWt ? streamingWt : null;
  const wt = activeWt ?? pendingWt;
  if (!wt) return null;

  const planning = wt.status === "planning";
  const showChoiceToggle = pendingWt !== null && planning;

  return (
    <div className="eregna-detached-player">
      <ThinkingTicker wt={wt} planning={planning || pendingWt !== null} />
      <PlanPanel wt={wt} />

      {activeWt ? (
        <div className="eregna-detached-bar">
          <PlayerBar />
        </div>
      ) : (
        <div className="eregna-detached-bar eregna-preparing">
          <span className="eregna-preparing__label">
            {planning
              ? "Planning your walkthrough…"
              : `Preparing… ${wt.steps.length} step${wt.steps.length !== 1 ? "s" : ""} ready`}
          </span>
          {showChoiceToggle && (
            <div className="eregna-preparing__choice" role="radiogroup" aria-label="Playback">
              <button
                type="button"
                className={`eregna-choice-btn ${state.playbackChoice === "live" ? "eregna-choice-btn--on" : ""}`}
                onClick={() => dispatch({ type: "SET_PLAYBACK_CHOICE", choice: "live" })}
              >
                ▶ Watch live
              </button>
              <button
                type="button"
                className={`eregna-choice-btn ${state.playbackChoice === "on-demand" ? "eregna-choice-btn--on" : ""}`}
                onClick={() => dispatch({ type: "SET_PLAYBACK_CHOICE", choice: "on-demand" })}
              >
                ≡ Wait for the full guide
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
