import { useEffect, useRef } from "react";
import { startLiveEngine } from "../engine/index.js";
import { useWidget, useWidgetDispatch } from "../store/widget-context.js";

// Starts and stops the live action engine based on play mode and active walkthrough.
// Does nothing in history mode.
export function useLiveEngine() {
  const { state, activeWt } = useWidget();
  const dispatch = useWidgetDispatch();

  // Always-current getter so the engine closure never becomes stale.
  const activeWtRef = useRef(activeWt);
  activeWtRef.current = activeWt;

  const walkthroughId = state.playMode === "live" ? state.activeWalkthroughId : null;

  useEffect(() => {
    if (!walkthroughId) return;

    const handle = startLiveEngine(
      walkthroughId,
      () => activeWtRef.current,
      (stepIndex) =>
        dispatch({ type: "SET_STEP_STATUS", walkthroughId, stepIndex, status: "running" }),
      (stepIndex) =>
        dispatch({ type: "SET_STEP_STATUS", walkthroughId, stepIndex, status: "done" }),
    );

    return () => handle.stop();
  }, [walkthroughId]); // dispatch is stable by React contract — omitted
}
