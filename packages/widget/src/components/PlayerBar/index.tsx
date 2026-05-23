import type { WalkthroughChapter } from "../../types/conversation";
import { useWidget, useWidgetDispatch } from "../../store/widget-context";
import { Scrubber } from "./Scrubber";

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

function PrevIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M13 2L5 8l8 6V2z" />
      <rect x="2" y="2" width="3" height="12" rx="1" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M3 2l8 6-8 6V2z" />
      <rect x="11" y="2" width="3" height="12" rx="1" />
    </svg>
  );
}

const SPEED_OPTIONS = [0.75, 1, 1.5, 2] as const;

function findChapter(
  chapters: WalkthroughChapter[],
  stepIndex: number,
): WalkthroughChapter | undefined {
  return chapters
    .filter((c) => c.stepIndex <= stepIndex)
    .sort((a, b) => b.stepIndex - a.stepIndex)[0];
}

export function PlayerBar() {
  const { state, activeWt, stepIndex } = useWidget();
  const dispatch = useWidgetDispatch();

  if (!activeWt) return null;

  const isPlaying = state.status === "playing";
  const chapter = findChapter(activeWt.chapters, stepIndex);

  function togglePlay() {
    dispatch({ type: "SET_STATUS", status: isPlaying ? "paused" : "playing" });
  }

  function handleComposerKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === " " && state.composerValue === "") {
      e.preventDefault();
      togglePlay();
    }
  }

  return (
    <div className="eregna-player-bar">
      <div className="eregna-player-bar__chapter">
        <span className="eregna-player-bar__chapter-label">
          {chapter?.title ?? ""}
        </span>
        <span className="eregna-player-bar__step-count">
          {stepIndex + 1} / {activeWt.steps.length}
        </span>
      </div>

      <Scrubber />

      <div className="eregna-player-bar__controls">
        <div className="eregna-player-bar__transport">
          <button
            aria-label="Previous step"
            className="eregna-icon-btn"
            onClick={() => dispatch({ type: "PREV_STEP" })}
            type="button"
          >
            <PrevIcon />
          </button>
          <button
            aria-label={isPlaying ? "Pause" : "Play"}
            className="eregna-icon-btn eregna-icon-btn--primary"
            onClick={togglePlay}
            type="button"
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            aria-label="Next step"
            className="eregna-icon-btn"
            onClick={() => dispatch({ type: "NEXT_STEP" })}
            type="button"
          >
            <NextIcon />
          </button>
        </div>

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
      </div>

      <div className="eregna-composer">
        <input
          className="eregna-composer__input"
          onChange={(e) =>
            dispatch({ type: "SET_COMPOSER", value: e.target.value })
          }
          onKeyDown={handleComposerKey}
          placeholder={isPlaying ? "Space to pause · type to ask…" : "Ask a follow-up…"}
          type="text"
          value={state.composerValue}
        />
        {state.composerValue && (
          <button
            aria-label="Send"
            className="eregna-composer__send"
            type="button"
            onClick={() => dispatch({ type: "SET_COMPOSER", value: "" })}
          >
            ↵
          </button>
        )}
      </div>
    </div>
  );
}
