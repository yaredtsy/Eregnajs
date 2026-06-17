import { createPortal } from "react-dom";
import { useWidget } from "../../store/widget-context";
import { useElementRect } from "../../hooks/useElementRect";
import { TYPEWRITER_MS_PER_CHAR } from "../../types/conversation";
import { getActiveManifest } from "../../engine/selectors.js";
import { Spotlight } from "./Spotlight";
import { Popover } from "./Popover";

function targetKeyOf(actions: { type: string; elementId?: string }[]): string | null {
  const highlight = actions.find((a) => a.type === "highlight");
  return highlight?.elementId ?? null;
}

// Visitor-facing message for a skipped step (docs/v2/4-client/03 §3).
function skipMessage(skipReason: string | undefined, hint?: string): string {
  if (hint) return hint;
  const [code, key] = (skipReason ?? "").split(":");
  const label = key ? (getActiveManifest()?.[key]?.label ?? key) : "this part";
  switch (code) {
    case "element-not-found":
      return `I couldn't find ${label} on this page — it may be hidden, or this page may have changed.`;
    case "click-timeout":
      return `Skipped waiting for a click on ${label}.`;
    case "tool-error":
      return `This action (${key ?? "tool"}) didn't work — you can do it manually.`;
    default:
      return "This step couldn't run — continuing with the rest of the guide.";
  }
}

export function WalkthroughOverlay() {
  const { activeWt, stepIndex, localOffsetMs, state } = useWidget();

  const isActive =
    state.status === "playing" ||
    state.status === "paused" ||
    state.status === "complete";

  const step = activeWt && isActive ? activeWt.steps[stepIndex] : null;
  const highlightKey = step ? targetKeyOf(step.actions) : null;

  const rect = useElementRect(highlightKey);

  if (!step || !isActive) return null;

  // Skipped step: a viewport-center notice instead of a broken spotlight.
  if (step.status === "skipped") {
    return createPortal(
      <Popover
        title="Heads up"
        visibleText={skipMessage(step.skipReason, step.toolResult?.hint)}
        anchorRect={null}
        variant="notice"
      />,
      document.body,
    );
  }

  const popover = step.popover;

  // Live mode: body grows via patches — render what's arrived in the store.
  // History mode: simulate typewriter effect via offset-driven slice.
  const visibleText = popover
    ? state.playMode === "live"
      ? popover.body
      : popover.body.slice(0, Math.floor(localOffsetMs / TYPEWRITER_MS_PER_CHAR))
    : "";

  const footer =
    step.toolResult && step.toolResult.status === "ok"
      ? `${step.toolResult.name} → ${step.toolResult.summary}`
      : undefined;

  return createPortal(
    <>
      {rect && <Spotlight rect={rect} />}
      {popover && (
        <Popover
          title={popover.title}
          visibleText={visibleText}
          anchorRect={rect}
          footer={footer}
        />
      )}
    </>,
    document.body,
  );
}
