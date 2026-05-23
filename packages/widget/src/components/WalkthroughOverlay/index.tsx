import { createPortal } from "react-dom";
import { useWidget } from "../../store/widget-context";
import { useElementRect } from "../../hooks/useElementRect";
import { TYPEWRITER_MS_PER_CHAR } from "../../types/conversation";
import { Spotlight } from "./Spotlight";
import { Popover } from "./Popover";

export function WalkthroughOverlay() {
  const { activeWt, stepIndex, localOffsetMs, state } = useWidget();

  const isActive =
    state.status === "playing" ||
    state.status === "paused" ||
    state.status === "complete";

  const step = activeWt && isActive ? activeWt.steps[stepIndex] : null;

  const highlightAction = step?.actions.find((a) => a.type === "highlight");
  const highlightId =
    highlightAction?.type === "highlight" ? highlightAction.elementId : null;

  const rect = useElementRect(highlightId ?? null);

  if (!step || !isActive) return null;

  const popover = step.popover;
  const visibleText = popover
    ? popover.body.slice(0, Math.floor(localOffsetMs / TYPEWRITER_MS_PER_CHAR))
    : "";

  return createPortal(
    <>
      {rect && <Spotlight rect={rect} />}
      {popover && (
        <Popover title={popover.title} visibleText={visibleText} anchorRect={rect} />
      )}
    </>,
    document.body,
  );
}
