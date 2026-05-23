import {
  createContext,
  useContext,
  useReducer,
  type ReactNode,
} from "react";
import type {
  Conversation,
  WalkthroughPart,
  WalkthroughPosition,
  PlaybackStatus,
  PlaybackSpeed,
} from "../types/conversation";
import { computeStepDuration } from "../types/conversation";

export type WidgetMode = "closed" | "bubble" | "detached";

export interface WidgetState {
  mode: WidgetMode;
  bubbleHasUnread: boolean;
  conversation: Conversation;
  activeWalkthroughId: string | null;
  status: PlaybackStatus;
  speed: PlaybackSpeed;
  stepOffsetMs: number;
  composerValue: string;
}

export type WidgetAction =
  | { type: "SET_MODE"; mode: WidgetMode }
  | { type: "PLAY_WALKTHROUGH"; walkthroughId: string }
  | { type: "SET_STATUS"; status: PlaybackStatus }
  | { type: "TICK"; deltaMs: number }
  | { type: "SEEK"; position: WalkthroughPosition }
  | { type: "PREV_STEP" }
  | { type: "NEXT_STEP" }
  | { type: "SET_SPEED"; speed: PlaybackSpeed }
  | { type: "SET_COMPOSER"; value: string }
  | { type: "MARK_READ" };

function findWalkthrough(
  conversation: Conversation,
  walkthroughId: string,
): WalkthroughPart | null {
  for (const msg of conversation.messages) {
    for (const part of msg.parts) {
      if (part.type === "walkthrough" && part.walkthroughId === walkthroughId) {
        return part;
      }
    }
  }
  return null;
}

export function totalDurationMs(wt: WalkthroughPart): number {
  return wt.steps.reduce((sum, s) => sum + computeStepDuration(s), 0);
}

export function cumulativeMsAtStep(wt: WalkthroughPart, stepIndex: number): number {
  let ms = 0;
  for (let i = 0; i < stepIndex && i < wt.steps.length; i++) {
    const step = wt.steps[i];
    if (step) ms += computeStepDuration(step);
  }
  return ms;
}

function deriveStepIndex(wt: WalkthroughPart, globalMs: number): number {
  let cum = 0;
  for (let i = 0; i < wt.steps.length; i++) {
    const step = wt.steps[i];
    if (!step) break;
    const dur = computeStepDuration(step);
    if (cum + dur > globalMs) return i;
    cum += dur;
  }
  return Math.max(0, wt.steps.length - 1);
}

function deriveLocalOffset(wt: WalkthroughPart, globalMs: number): number {
  let cum = 0;
  for (let i = 0; i < wt.steps.length; i++) {
    const step = wt.steps[i];
    if (!step) break;
    const dur = computeStepDuration(step);
    if (cum + dur > globalMs) return globalMs - cum;
    cum += dur;
  }
  return 0;
}

function getActiveWt(state: WidgetState): WalkthroughPart | null {
  if (!state.activeWalkthroughId) return null;
  return findWalkthrough(state.conversation, state.activeWalkthroughId);
}

function reducer(state: WidgetState, action: WidgetAction): WidgetState {
  switch (action.type) {
    case "SET_MODE":
      return {
        ...state,
        mode: action.mode,
        bubbleHasUnread:
          action.mode === "bubble" ? false : state.bubbleHasUnread,
      };

    case "PLAY_WALKTHROUGH":
      return {
        ...state,
        activeWalkthroughId: action.walkthroughId,
        stepOffsetMs: 0,
        status: "playing",
        mode: state.mode === "closed" ? "bubble" : state.mode,
        bubbleHasUnread: false,
      };

    case "SET_STATUS":
      return { ...state, status: action.status };

    case "TICK": {
      if (state.status !== "playing") return state;
      const wt = getActiveWt(state);
      if (!wt) return state;
      const total = totalDurationMs(wt);
      const next = state.stepOffsetMs + action.deltaMs * state.speed;
      if (next >= total) return { ...state, stepOffsetMs: total, status: "complete" };
      return { ...state, stepOffsetMs: next };
    }

    case "SEEK": {
      const wt = findWalkthrough(state.conversation, action.position.walkthroughId);
      if (!wt) return state;
      const globalMs =
        cumulativeMsAtStep(wt, action.position.stepIndex) +
        action.position.stepOffsetMs;
      return {
        ...state,
        activeWalkthroughId: action.position.walkthroughId,
        stepOffsetMs: globalMs,
        status: "paused",
      };
    }

    case "PREV_STEP": {
      const wt = getActiveWt(state);
      if (!wt) return state;
      const idx = deriveStepIndex(wt, state.stepOffsetMs);
      const target = Math.max(0, idx - 1);
      return { ...state, stepOffsetMs: cumulativeMsAtStep(wt, target), status: "paused" };
    }

    case "NEXT_STEP": {
      const wt = getActiveWt(state);
      if (!wt) return state;
      const idx = deriveStepIndex(wt, state.stepOffsetMs);
      const target = Math.min(wt.steps.length - 1, idx + 1);
      return {
        ...state,
        stepOffsetMs: cumulativeMsAtStep(wt, target),
        status: target === wt.steps.length - 1 ? "paused" : "playing",
      };
    }

    case "SET_SPEED":
      return { ...state, speed: action.speed };

    case "SET_COMPOSER":
      return { ...state, composerValue: action.value };

    case "MARK_READ":
      return { ...state, bubbleHasUnread: false };

    default:
      return state;
  }
}

interface WidgetContextValue {
  state: WidgetState;
  dispatch: React.Dispatch<WidgetAction>;
  activeWt: WalkthroughPart | null;
  stepIndex: number;
  localOffsetMs: number;
  totalMs: number;
}

const WidgetContext = createContext<WidgetContextValue | null>(null);

export function WidgetProvider({
  conversation,
  children,
}: {
  conversation: Conversation;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, {
    mode: "closed",
    bubbleHasUnread: false,
    conversation,
    activeWalkthroughId: null,
    status: "idle",
    speed: 1,
    stepOffsetMs: 0,
    composerValue: "",
  });

  const activeWt = getActiveWt(state);
  const stepIdx = activeWt ? deriveStepIndex(activeWt, state.stepOffsetMs) : 0;
  const localOffset = activeWt ? deriveLocalOffset(activeWt, state.stepOffsetMs) : 0;
  const totalMs = activeWt ? totalDurationMs(activeWt) : 0;

  return (
    <WidgetContext.Provider
      value={{ state, dispatch, activeWt, stepIndex: stepIdx, localOffsetMs: localOffset, totalMs }}
    >
      {children}
    </WidgetContext.Provider>
  );
}

export function useWidget() {
  const ctx = useContext(WidgetContext);
  if (!ctx) throw new Error("useWidget must be used inside WidgetProvider");
  return ctx;
}

export function useWidgetDispatch() {
  return useWidget().dispatch;
}
