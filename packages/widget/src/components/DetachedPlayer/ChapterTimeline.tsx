import type { WalkthroughChapter, WalkthroughPart } from "../../types/conversation";
import { useWidget, useWidgetDispatch, cumulativeMsAtStep } from "../../store/widget-context";

interface Segment {
  chapter: WalkthroughChapter;
  index: number;
  startStep: number;
  endStep: number;     // exclusive
  weight: number;      // flex-grow share
  fillPct: number;     // 0..100 played portion
  failed: boolean;
  hasSkips: boolean;
  isCurrent: boolean;
}

function buildSegments(
  wt: WalkthroughPart,
  isLive: boolean,
  stepOffsetMs: number,
  currentStepIndex: number,
  runtimeSkips: Record<number, string>,
): Segment[] {
  return wt.chapters.map((chapter, i) => {
    const startStep = chapter.stepIndex >= 0 ? chapter.stepIndex : wt.steps.length;
    const next = wt.chapters[i + 1];
    const endStep =
      next && next.stepIndex >= 0 ? next.stepIndex : wt.steps.length;
    const steps = wt.steps.slice(startStep, Math.max(startStep, endStep));

    let weight: number;
    let fillPct: number;
    if (isLive) {
      // Streaming: counts are still growing — share by known step count,
      // fill by steps the engine has finished.
      weight = Math.max(steps.length, 1);
      const done = steps.filter((s) => s.status === "done" || s.status === "skipped").length;
      fillPct = steps.length > 0 ? (done / steps.length) * 100 : 0;
    } else {
      const startMs = cumulativeMsAtStep(wt, startStep);
      const endMs = cumulativeMsAtStep(wt, endStep);
      const duration = Math.max(endMs - startMs, 1);
      weight = duration;
      fillPct = Math.min(100, Math.max(0, ((stepOffsetMs - startMs) / duration) * 100));
    }

    return {
      chapter,
      index: i,
      startStep,
      endStep,
      weight,
      fillPct,
      failed: chapter.status === "failed",
      hasSkips: steps.some(
        (s, j) => s.status === "skipped" || runtimeSkips[startStep + j],
      ),
      isCurrent: currentStepIndex >= startStep && currentStepIndex < endStep,
    };
  });
}

export function ChapterTimeline() {
  const { state, activeWt, stepIndex } = useWidget();
  const dispatch = useWidgetDispatch();

  if (!activeWt || activeWt.chapters.length === 0) return null;

  const isLive = state.playMode === "live";
  const segments = buildSegments(
    activeWt,
    isLive,
    state.stepOffsetMs,
    stepIndex,
    state.runtimeSkips,
  );

  function seekTo(seg: Segment) {
    if (isLive || !activeWt || seg.startStep >= activeWt.steps.length) return;
    dispatch({
      type: "SEEK",
      position: {
        messageId: "",
        walkthroughId: activeWt.walkthroughId,
        stepIndex: seg.startStep,
        stepOffsetMs: 0,
      },
    });
  }

  return (
    <div
      className={`eregna-timeline ${isLive ? "eregna-timeline--live" : ""}`}
      role="group"
      aria-label="Chapters"
    >
      {segments.map((seg) => {
        const stepCount = Math.max(seg.endStep - seg.startStep, 0);
        const classes = [
          "eregna-timeline__segment",
          seg.failed ? "eregna-timeline__segment--failed" : "",
          !seg.failed && seg.hasSkips ? "eregna-timeline__segment--has-skips" : "",
          seg.isCurrent ? "eregna-timeline__segment--current" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <button
            key={seg.index}
            type="button"
            className={classes}
            style={{ flexGrow: seg.weight }}
            disabled={isLive}
            onClick={() => seekTo(seg)}
            aria-label={`Chapter ${seg.index + 1}: ${seg.chapter.title}`}
          >
            <span className="eregna-timeline__track">
              <span
                className="eregna-timeline__fill"
                style={{ width: `${seg.fillPct}%` }}
              />
            </span>
            <span className="eregna-timeline__tooltip" role="tooltip">
              <span className="eregna-timeline__tooltip-title">
                {seg.failed ? "⚠ " : ""}
                {seg.chapter.title}
              </span>
              <span className="eregna-timeline__tooltip-meta">
                {seg.chapter.description}
                {stepCount > 0 ? ` · ${stepCount} step${stepCount !== 1 ? "s" : ""}` : ""}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
