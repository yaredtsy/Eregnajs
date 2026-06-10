import { useWidget, useWidgetDispatch } from "../../store/widget-context";
import { ChapterTimeline } from "../DetachedPlayer/ChapterTimeline";

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M3 2l10 6-10 6V2z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <rect x="3" y="2" width="4" height="12" rx="1" />
      <rect x="9" y="2" width="4" height="12" rx="1" />
    </svg>
  );
}

const SPEED_OPTIONS = [0.75, 1, 1.5, 2] as const;

export function PlayerBar() {
  const { state, activeWt, stepIndex } = useWidget();
  const dispatch = useWidgetDispatch();

  if (!activeWt) return null;

  const isLive = state.playMode === "live";
  const isPlaying = state.status === "playing";

  function togglePlay() {
    dispatch({ type: "SET_STATUS", status: isPlaying ? "paused" : "playing" });
  }

  function handleComposerKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === " " && state.composerValue === "" && !isLive) {
      e.preventDefault();
      togglePlay();
    }
    if (e.key === "Enter") {
      e.preventDefault();
      submitAsk();
    }
  }

  function submitAsk() {
    const query = state.composerValue.trim();
    if (!query) return;
    dispatch({ type: "SET_COMPOSER", value: "" });
    // Asking mid-walkthrough aborts the current run and starts a new one —
    // the host API's ask() is the single entry point for both.
    void (window as { eregna?: { ask(q: string): Promise<void> } }).eregna
      ?.ask(query)
      .catch((err: unknown) => console.error("[eregna] ask failed", err));
  }

  function close() {
    dispatch({ type: "SET_STATUS", status: "paused" });
    dispatch({ type: "SET_MODE", mode: "bubble" });
  }

  return (
    <div className="eregna-player-bar">
      <div className="eregna-player-bar__row">
        <button
          aria-label={isPlaying ? "Pause" : "Play"}
          className="eregna-icon-btn eregna-icon-btn--primary"
          onClick={togglePlay}
          disabled={isLive}
          type="button"
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>

        <ChapterTimeline />

        <span className="eregna-player-bar__step-count">
          {Math.min(stepIndex + 1, activeWt.steps.length)} / {activeWt.steps.length}
        </span>

        {!isLive && (
          <select
            aria-label="Playback speed"
            className="eregna-speed-select"
            onChange={(e) =>
              dispatch({
                type: "SET_SPEED",
                speed: Number(e.target.value) as typeof state.speed,
              })
            }
            value={state.speed}
          >
            {SPEED_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        )}

        {isLive && <span className="eregna-player-bar__live-dot" aria-label="Live" />}

        <button
          aria-label="Close player"
          className="eregna-icon-btn"
          onClick={close}
          type="button"
        >
          ✕
        </button>
      </div>

      <div className="eregna-composer">
        <input
          className="eregna-composer__input"
          onChange={(e) => dispatch({ type: "SET_COMPOSER", value: e.target.value })}
          onKeyDown={handleComposerKey}
          placeholder={
            isLive
              ? "Ask a follow-up (stops this walkthrough)…"
              : isPlaying
                ? "Space to pause · type to ask…"
                : "Ask a follow-up…"
          }
          type="text"
          value={state.composerValue}
        />
        {state.composerValue && (
          <button
            aria-label="Send"
            className="eregna-composer__send"
            type="button"
            onClick={submitAsk}
          >
            ↵
          </button>
        )}
      </div>
    </div>
  );
}
