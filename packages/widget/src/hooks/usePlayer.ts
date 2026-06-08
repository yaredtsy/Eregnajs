import { useEffect, useRef } from "react";
import { useWidget, useWidgetDispatch } from "../store/widget-context";

export function usePlayer() {
  const { state } = useWidget();
  const dispatch = useWidgetDispatch();
  const lastTsRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Live mode: the engine drives step advancement, not the rAF timer.
    if (state.playMode === "live") return;
    if (state.status !== "playing") {
      lastTsRef.current = null;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    function tick(ts: number) {
      if (lastTsRef.current === null) lastTsRef.current = ts;
      const delta = ts - lastTsRef.current;
      lastTsRef.current = ts;
      dispatch({ type: "TICK", deltaMs: delta });
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTsRef.current = null;
    };
  // dispatch is guaranteed stable by React (useReducer contract) — omitted from deps.
  }, [state.status, state.playMode]);
}
