import {
  createContext,
  use,
  useReducer,
  type ReactNode,
} from "react";
import type {
  Conversation,
  WalkthroughPart,
  WalkthroughPosition,
  PlaybackStatus,
  PlaybackSpeed,
  PatchFrame,
  StepStatus,
  StepToolResult,
} from "../types/conversation";
import { computeStepDuration, applyPatchFrame } from "../types/conversation";

import type { ToolCallUiState } from "../chat/tools/types.js";

export type WidgetMode = "closed" | "bubble" | "detached";
export type PlayMode = "history" | "live";
// "live": steps play as frames arrive. "on-demand": frames buffer; playback
// starts (as history) once the run completes. (docs/v2/4-client/02 §5)
export type PlaybackChoice = "live" | "on-demand";

export interface WidgetState {
  mode: WidgetMode;
  bubbleHasUnread: boolean;
  conversation: Conversation;
  activeWalkthroughId: string | null;
  status: PlaybackStatus;
  speed: PlaybackSpeed;
  stepOffsetMs: number;
  composerValue: string;
  playMode: PlayMode;
  playbackChoice: PlaybackChoice;
  planPanelOpen: boolean;
  driftDialog: { walkthroughId: string; query: string | null } | null;
  /** History replay: step indices that fail manifest resolve at play time. */
  runtimeSkips: Record<number, string>;
  /** True while an agent run fetch is in flight (including pre-hello). */
  streamActive: boolean;
  /** Client tool calls for the active assistant turn. */
  toolCalls: ToolCallUiState[];
  activeMessageId: string | null;
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
  | { type: "MARK_READ" }
  | { type: "APPLY_PATCH"; frame: PatchFrame }
  | { type: "SET_PLAY_MODE"; playMode: PlayMode }
  | {
      type: "SET_STEP_STATUS";
      walkthroughId: string;
      stepIndex: number;
      status: StepStatus;
      skipReason?: string;
      toolResult?: StepToolResult;
    }
  | { type: "SET_CONVERSATION"; conversation: Conversation }
  | { type: "RUN_HELLO"; conversation: Conversation }
  | { type: "NEW_CHAT" }
  | { type: "SET_PLAYBACK_CHOICE"; choice: PlaybackChoice }
  | { type: "TOGGLE_PLAN_PANEL" }
  | { type: "SHOW_DRIFT_DIALOG"; walkthroughId: string; query: string | null }
  | { type: "CLOSE_DRIFT_DIALOG" }
  | { type: "RUN_START" }
  | { type: "RUN_END" }
  | { type: "STOP_RUN" }
  | { type: "SET_ACTIVE_MESSAGE_ID"; messageId: string | null }
  | { type: "UPSERT_TOOL_CALL"; toolCall: ToolCallUiState }
  | { type: "CLEAR_TOOL_CALLS" }
  | { type: "STOP_WALKTHROUGH" }
  | {
      type: "SET_RUNTIME_SKIP";
      walkthroughId: string;
      stepIndex: number;
      reason: string;
    }
  | { type: "CLEAR_RUNTIME_SKIPS" };

// ---------------------------------------------------------------------------
// Pure helpers (no side effects)
// ---------------------------------------------------------------------------

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

function findWalkthroughByStatus(
  conversation: Conversation,
  status: WalkthroughPart["status"],
): WalkthroughPart | null {
  for (let m = conversation.messages.length - 1; m >= 0; m--) {
    for (const part of conversation.messages[m]!.parts) {
      if (part.type === "walkthrough" && part.status === status) return part;
    }
  }
  return null;
}

// The walkthrough currently being streamed into the document, if any —
// the player shows the ticker for it before it is activated for playback.
export function findStreamingWalkthrough(
  conversation: Conversation,
): WalkthroughPart | null {
  return (
    findWalkthroughByStatus(conversation, "planning") ??
    findWalkthroughByStatus(conversation, "playing")
  );
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

function markStoppedConversation(conversation: Conversation): Conversation {
  const wasStreaming = conversation.messages.some((m) => m.status === "streaming");
  let changed = false;

  let messages = conversation.messages.map((msg) => {
    if (msg.status !== "streaming") return msg;
    changed = true;
    return {
      ...msg,
      status: "complete" as const,
      metadata: { ...msg.metadata, stopped: true },
    };
  });

  if (!wasStreaming) {
    const last = messages[messages.length - 1];
    if (last?.role === "user") {
      changed = true;
      messages = [
        ...messages,
        {
          id: `stopped_${Date.now()}`,
          role: "assistant" as const,
          parts: [],
          status: "complete" as const,
          metadata: { stopped: true },
          createdAt: Date.now(),
        },
      ];
    }
  }

  return changed ? { ...conversation, messages } : conversation;
}

function stopRunState(state: WidgetState): WidgetState {
  return {
    ...state,
    streamActive: false,
    activeWalkthroughId: null,
    status: "idle",
    stepOffsetMs: 0,
    driftDialog: null,
    runtimeSkips: {},
    mode: state.mode === "detached" ? "bubble" : state.mode,
    conversation: markStoppedConversation(state.conversation),
  };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function reducer(state: WidgetState, action: WidgetAction): WidgetState {
  switch (action.type) {
    case "SET_MODE":
      return {
        ...state,
        mode: action.mode,
        bubbleHasUnread: action.mode === "bubble" ? false : state.bubbleHasUnread,
      };

    case "PLAY_WALKTHROUGH":
      return {
        ...state,
        activeWalkthroughId: action.walkthroughId,
        stepOffsetMs: 0,
        status: "playing",
        mode: state.mode === "closed" ? "bubble" : state.mode,
        bubbleHasUnread: false,
        runtimeSkips: {},
        driftDialog: null,
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

    case "APPLY_PATCH": {
      const newConv = applyPatchFrame(state.conversation, action.frame);
      // Sidebar chat first: don't auto-activate walkthroughs while patches stream in.
      // Re-enable live/on-demand activation when walkthrough playback is wired up.
      return { ...state, conversation: newConv };
    }

    case "SET_PLAY_MODE":
      return { ...state, playMode: action.playMode };

    case "SET_STEP_STATUS": {
      const conv = state.conversation;
      const messages = conv.messages.map((msg) => ({
        ...msg,
        parts: msg.parts.map((part) => {
          if (part.type !== "walkthrough" || part.walkthroughId !== action.walkthroughId)
            return part;
          return {
            ...part,
            steps: part.steps.map((s, i) =>
              i === action.stepIndex
                ? {
                    ...s,
                    status: action.status,
                    ...(action.skipReason !== undefined ? { skipReason: action.skipReason } : {}),
                    ...(action.toolResult !== undefined ? { toolResult: action.toolResult } : {}),
                  }
                : s,
            ),
          };
        }),
      }));
      return { ...state, conversation: { ...conv, messages } };
    }

    case "SET_CONVERSATION":
      return { ...state, conversation: action.conversation };

    case "RUN_HELLO": {
      const incoming = action.conversation;
      // Defensive: never wipe client history if the server hello is behind.
      if (incoming.messages.length < state.conversation.messages.length) {
        return {
          ...state,
          conversation: {
            ...state.conversation,
            sessionId: incoming.sessionId,
            agentName: incoming.agentName,
          },
        };
      }
      return { ...state, conversation: incoming };
    }

    case "NEW_CHAT":
      return {
        ...stopRunState(state),
        conversation: {
          sessionId: `sess_${crypto.randomUUID()}`,
          agentName: state.conversation.agentName,
          messages: [],
        },
        composerValue: "",
      };

    case "SET_PLAYBACK_CHOICE":
      return { ...state, playbackChoice: action.choice };

    case "TOGGLE_PLAN_PANEL":
      return { ...state, planPanelOpen: !state.planPanelOpen };

    case "SHOW_DRIFT_DIALOG":
      return {
        ...state,
        driftDialog: { walkthroughId: action.walkthroughId, query: action.query },
        status: "paused",
      };

    case "CLOSE_DRIFT_DIALOG":
      return { ...state, driftDialog: null };

    case "RUN_START":
      return { ...state, streamActive: true, toolCalls: [], activeMessageId: null };

    case "RUN_END":
      return { ...state, streamActive: false };

    case "SET_ACTIVE_MESSAGE_ID":
      return { ...state, activeMessageId: action.messageId };

    case "UPSERT_TOOL_CALL": {
      const idx = state.toolCalls.findIndex(
        (t) => t.toolCallId === action.toolCall.toolCallId,
      );
      const toolCalls =
        idx >= 0
          ? state.toolCalls.map((t, i) => (i === idx ? action.toolCall : t))
          : [...state.toolCalls, action.toolCall];
      return { ...state, toolCalls };
    }

    case "CLEAR_TOOL_CALLS":
      return { ...state, toolCalls: [] };

    case "STOP_RUN":
      return stopRunState(state);

    case "STOP_WALKTHROUGH":
      return {
        ...state,
        activeWalkthroughId: null,
        status: "idle",
        stepOffsetMs: 0,
        driftDialog: null,
        runtimeSkips: {},
        mode: state.mode === "detached" ? "bubble" : state.mode,
      };

    case "SET_RUNTIME_SKIP":
      if (state.activeWalkthroughId !== action.walkthroughId) return state;
      return {
        ...state,
        runtimeSkips: {
          ...state.runtimeSkips,
          [action.stepIndex]: action.reason,
        },
      };

    case "CLEAR_RUNTIME_SKIPS":
      return { ...state, runtimeSkips: {} };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context + Provider
// ---------------------------------------------------------------------------

interface WidgetContextValue {
  state: WidgetState;
  dispatch: React.Dispatch<WidgetAction>;
  activeWt: WalkthroughPart | null;
  stepIndex: number;
  localOffsetMs: number;
  totalMs: number;
}

// Non-null: consuming components must be inside WidgetProvider.
export const WidgetContext = createContext<WidgetContextValue | null>(null);

export function WidgetProvider({
  conversation,
  initialState,
  children,
}: {
  conversation: Conversation;
  /** Component gallery fixtures — merge over reducer defaults. */
  initialState?: Partial<WidgetState>;
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
    playMode: "history",
    playbackChoice: "live",
    planPanelOpen: false,
    driftDialog: null,
    runtimeSkips: {},
    streamActive: false,
    toolCalls: [],
    activeMessageId: null,
    ...initialState,
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

// ---------------------------------------------------------------------------
// Hooks — use(Context) is the React 19 pattern; works in loops/conditions
// ---------------------------------------------------------------------------

export function useWidget(): WidgetContextValue {
  const ctx = use(WidgetContext);
  if (!ctx) throw new Error("useWidget must be used inside WidgetProvider");
  return ctx;
}

// dispatch from useReducer is guaranteed stable by React — safe to expose.
export function useWidgetDispatch(): React.Dispatch<WidgetAction> {
  return useWidget().dispatch;
}
