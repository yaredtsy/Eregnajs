import { useEffect, useRef } from "react";
import type { Conversation } from "../types/conversation";
import {
  chapterIndexForStep,
  highlightKeyOfStep,
  preflightChapter1,
  stepNeedsHighlight,
} from "../engine/drift.js";
import { resolveKey } from "../engine/selectors.js";
import { useWidget, useWidgetDispatch } from "../store/widget-context.js";

export function findWalkthroughQuery(
  conversation: Conversation,
  walkthroughId: string,
): string | null {
  for (let i = 0; i < conversation.messages.length; i++) {
    const msg = conversation.messages[i];
    if (msg?.role !== "assistant") continue;
    for (const part of msg.parts) {
      if (part.type === "walkthrough" && part.walkthroughId === walkthroughId) {
        for (let j = i - 1; j >= 0; j--) {
          const user = conversation.messages[j];
          if (user?.role === "user") {
            const text = user.parts.find((p) => p.type === "text");
            if (text?.type === "text") return text.text;
          }
        }
        return null;
      }
    }
  }
  return null;
}

// History replay: re-validate highlight targets against the stored manifest.
// One miss → runtime skip UI; two chapter-level misses → drift dialog (flow 04 §1).
export function useHistoryDrift(
  onDriftEscalation: (walkthroughId: string, query: string | null) => void,
) {
  const { state, activeWt, stepIndex } = useWidget();
  const dispatch = useWidgetDispatch();
  const missChaptersRef = useRef<Set<number>>(new Set());
  const lastStepRef = useRef(-1);

  useEffect(() => {
    if (state.playMode !== "history" || !state.activeWalkthroughId) {
      missChaptersRef.current = new Set();
      lastStepRef.current = -1;
      dispatch({ type: "CLEAR_RUNTIME_SKIPS" });
    }
  }, [state.playMode, state.activeWalkthroughId, dispatch]);

  useEffect(() => {
    if (state.playMode !== "history" || !activeWt || state.status !== "playing") return;
    if (stepIndex === lastStepRef.current) return;
    lastStepRef.current = stepIndex;

    const step = activeWt.steps[stepIndex];
    if (!step || step.status === "skipped") return;

    const key = highlightKeyOfStep(step);
    if (!key || !stepNeedsHighlight(step)) return;
    if (resolveKey(key)) return;

    const chapter = chapterIndexForStep(activeWt, stepIndex);
    dispatch({
      type: "SET_RUNTIME_SKIP",
      walkthroughId: activeWt.walkthroughId,
      stepIndex,
      reason: `element-not-found:${key}`,
    });
    dispatch({ type: "SET_STATUS", status: "paused" });

    missChaptersRef.current.add(chapter);
    if (missChaptersRef.current.size >= 2) {
      onDriftEscalation(
        activeWt.walkthroughId,
        findWalkthroughQuery(state.conversation, activeWt.walkthroughId),
      );
      dispatch({ type: "SET_STATUS", status: "paused" });
    }
  }, [
    stepIndex,
    state.playMode,
    state.status,
    activeWt,
    state.conversation,
    dispatch,
    onDriftEscalation,
  ]);
}

export function usePreflightPlay() {
  const { state } = useWidget();
  const dispatch = useWidgetDispatch();

  return function playWalkthrough(walkthroughId: string, wt: { manifest?: unknown; chapters: unknown[] }) {
    if (state.playMode === "history" && wt.manifest && wt.chapters.length > 0) {
      const check = preflightChapter1(wt as Parameters<typeof preflightChapter1>[0]);
      if (!check.ok) {
        dispatch({
          type: "SHOW_DRIFT_DIALOG",
          walkthroughId,
          query: findWalkthroughQuery(state.conversation, walkthroughId),
        });
        return;
      }
    }
    dispatch({ type: "PLAY_WALKTHROUGH", walkthroughId });
  };
}
