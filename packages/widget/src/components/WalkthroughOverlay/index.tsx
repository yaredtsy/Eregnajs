import { createPortal } from "react-dom";
import { useWidget, useWidgetDispatch } from "../../store/widget-context";
import { useElementRect } from "../../hooks/useElementRect";
import { TYPEWRITER_MS_PER_CHAR } from "../../types/conversation";
import { getActiveManifest } from "../../engine/selectors.js";
import { Spotlight } from "./Spotlight";
import { Popover } from "./Popover";

function targetKeyOf(actions: { type: string; elementId?: string }[]): string | null {
  const highlight = actions.find((a) => a.type === "highlight");
  return highlight?.elementId ?? null;
}

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
  const dispatch = useWidgetDispatch();

  const isActive =
    state.status === "playing" ||
    state.status === "paused" ||
    state.status === "complete";

  const step = activeWt && isActive ? activeWt.steps[stepIndex] : null;
  const runtimeSkip = state.runtimeSkips[stepIndex];
  const isSkipped = step?.status === "skipped" || Boolean(runtimeSkip);
  const skipReason = step?.skipReason ?? runtimeSkip;
  const highlightKey = step && !isSkipped ? targetKeyOf(step.actions) : null;

  const rect = useElementRect(highlightKey);

  if (!step || !isActive) return null;

  if (isSkipped) {
    return createPortal(
      <Popover
        title="Heads up"
        visibleText={skipMessage(skipReason, step.toolResult?.hint)}
        anchorRect={null}
        variant="notice"
        onContinue={() => dispatch({ type: "NEXT_STEP" })}
        onStop={() => dispatch({ type: "STOP_WALKTHROUGH" })}
      />,
      document.body,
    );
  }

  const popover = step.popover;

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
