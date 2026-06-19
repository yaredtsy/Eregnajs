import { createContext, use, useCallback, useEffect, useRef, type ReactNode } from "react";
import { runStream } from "../chat/agent/runStream.js";
import { mountReady } from "../embed/host-api.impl.js";
import { getVisitorId } from "../embed/visitorId.js";
import { useWidget, useWidgetDispatch } from "../store/widget-context";

interface RunSession {
  stop: () => void;
}

const RunSessionContext = createContext<RunSession | null>(null);

export function useRunSession(): RunSession {
  return use(RunSessionContext) ?? { stop: () => {} };
}

export function RunSessionProvider({
  apiBase,
  agentPublicId,
  children,
}: {
  apiBase: string;
  agentPublicId: string;
  children: ReactNode;
}) {
  const { state } = useWidget();
  const dispatch = useWidgetDispatch();
  const ctxRef = useRef({
    dispatch,
    apiBase,
    agentPublicId,
    getConversation: () => state.conversation,
    activeMessageId: null as string | null,
  });
  ctxRef.current = {
    dispatch,
    apiBase,
    agentPublicId,
    getConversation: () => state.conversation,
    activeMessageId: state.activeMessageId,
  };

  const controllerRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    dispatch({ type: "STOP_RUN" });
  }, [dispatch]);

  const stopRef = useRef(stop);
  stopRef.current = stop;

  const registeredRef = useRef(false);
  if (!registeredRef.current) {
    registeredRef.current = true;

    mountReady(
      async (query, hostState, hostTools, hostKnowledge) => {
        const runOnce = async (q: string, signal: AbortSignal) => {
          const { apiBase: base, agentPublicId: id, getConversation } = ctxRef.current;

          const resolveMessageId = (): string | null => {
            if (ctxRef.current.activeMessageId) return ctxRef.current.activeMessageId;
            const conv = getConversation();
            for (let i = conv.messages.length - 1; i >= 0; i--) {
              const msg = conv.messages[i];
              if (msg?.role === "assistant") return msg.id;
            }
            return null;
          };

          await runStream({
            apiBase: base,
            agentPublicId: id,
            pageUrl: window.location.href,
            query: q,
            conversation: getConversation(),
            hostState,
            hostTools,
            hostKnowledge,
            visitorId: getVisitorId(),
            signal,
            getMessageId: resolveMessageId,
            onToolCallUpdate: (toolCall) => {
              ctxRef.current.dispatch({ type: "UPSERT_TOOL_CALL", toolCall });
            },
            onChatEvent: (event) => {
              const d2 = ctxRef.current.dispatch;
              if (event.kind === "message-started") {
                ctxRef.current.activeMessageId = event.messageId;
                d2({ type: "SET_ACTIVE_MESSAGE_ID", messageId: event.messageId });
              }
            },
            onFrame: (frame) => {
              const d2 = ctxRef.current.dispatch;
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("eregna:frame", { detail: frame }));
              }
              if (frame.kind === "hello") {
                d2({ type: "RUN_HELLO", conversation: frame.conversation });
              } else if (frame.kind === "patch") {
                d2({ type: "APPLY_PATCH", frame });
              } else if (frame.kind === "end") {
                if (frame.status === "error") {
                  console.error("[eregna] run failed:", frame.message);
                }
                d2({ type: "RUN_END" });
              }
            },
          });
        };

        const beginRun = async (q: string) => {
          controllerRef.current?.abort();
          const controller = new AbortController();
          controllerRef.current = controller;

          const { dispatch: d } = ctxRef.current;
          d({ type: "RUN_START" });
          d({ type: "SET_PLAY_MODE", playMode: "live" });
          d({ type: "SET_MODE", mode: "bubble" });

          try {
            await runOnce(q, controller.signal);
          } catch (err) {
            if ((err as DOMException).name !== "AbortError") {
              console.error("[eregna] runStream error", err);
            }
          } finally {
            if (controllerRef.current === controller) {
              controllerRef.current = null;
              ctxRef.current.dispatch({ type: "RUN_END" });
            }
          }
        };

        await beginRun(query);
      },
      {
        open: () => ctxRef.current.dispatch({ type: "SET_MODE", mode: "bubble" }),
        close: () => {
          stopRef.current();
          ctxRef.current.dispatch({ type: "SET_MODE", mode: "closed" });
        },
        stop: () => stopRef.current(),
      },
    );
  }

  useEffect(() => () => { controllerRef.current?.abort(); }, []);

  return (
    <RunSessionContext.Provider value={{ stop }}>
      {children}
    </RunSessionContext.Provider>
  );
}
