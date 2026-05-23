import { useWidget, useWidgetDispatch, cumulativeMsAtStep } from "../../store/widget-context";
import { computeStepDuration } from "../../types/conversation";

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function Scrubber() {
  const { activeWt, state, totalMs } = useWidget();
  const dispatch = useWidgetDispatch();

  if (!activeWt) return null;

  const pct = totalMs > 0 ? Math.min(1, state.stepOffsetMs / totalMs) * 100 : 0;

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    if (!activeWt) return;
    const targetMs = (Number(e.target.value) / 100) * totalMs;
    let cumMs = 0;
    for (let i = 0; i < activeWt.steps.length; i++) {
      const step = activeWt.steps[i];
      if (!step) break;
      const dur = computeStepDuration(step);
      if (cumMs + dur >= targetMs || i === activeWt.steps.length - 1) {
        dispatch({
          type: "SEEK",
          position: {
            messageId: "",
            walkthroughId: activeWt.walkthroughId,
            stepIndex: i,
            stepOffsetMs: Math.max(0, targetMs - cumMs),
          },
        });
        return;
      }
      cumMs += dur;
    }
  }

  return (
    <div className="eregna-scrubber">
      <span className="eregna-scrubber__time">{formatTime(state.stepOffsetMs)}</span>
      <input
        aria-label="Seek"
        className="eregna-scrubber__track"
        max={100}
        min={0}
        onChange={handleSeek}
        step={0.1}
        type="range"
        value={pct}
      />
      <span className="eregna-scrubber__time">{formatTime(totalMs)}</span>
    </div>
  );
}
