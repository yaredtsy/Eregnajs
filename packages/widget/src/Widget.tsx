import { useEffect, useRef } from "react";
import { SAMPLE_CONVERSATION } from "./data/sample-conversation";
import { WidgetProvider, useWidget, useWidgetDispatch } from "./store/widget-context";
import { usePlayer } from "./hooks/usePlayer";
import { useLiveEngine } from "./hooks/useLiveEngine";
import { BubbleFAB } from "./components/BubbleFAB";
import { ChatPopup } from "./components/ChatPopup";
import { PlayerBar } from "./components/PlayerBar";
import { WalkthroughOverlay } from "./components/WalkthroughOverlay";
import { mountReady } from "./embed/host-api.impl.js";
import { runStream } from "./agent/runStream.js";

interface WidgetInnerProps {
  apiBase: string;
  agentPublicId: string;
}

function WidgetInner({ apiBase, agentPublicId }: WidgetInnerProps) {
  const { state } = useWidget();
  const dispatch = useWidgetDispatch();
  usePlayer();
  useLiveEngine();

  // Ref that always holds the latest callback values.
  // Written every render — before any effect or event fires — so the
  // ask handler can never close over stale props.
  const ctxRef = useRef({ dispatch, apiBase, agentPublicId });
  ctxRef.current = { dispatch, apiBase, agentPublicId };

  // Tracks the AbortController for the in-flight ask() call.
  const controllerRef = useRef<AbortController | null>(null);

  // Register the ask handler with the global singleton exactly once —
  // done during render with a ref guard so there is no async timing gap
  // (no waiting for the browser to flush effects).
  const registeredRef = useRef(false);
  if (!registeredRef.current) {
    registeredRef.current = true;

    mountReady(async (query, hostState, hostTools) => {
      controllerRef.current?.abort();
      controllerRef.current = new AbortController();

      const { dispatch: d, apiBase: base, agentPublicId: id } = ctxRef.current;
      d({ type: "SET_PLAY_MODE", playMode: "live" });
      d({ type: "SET_MODE", mode: "bubble" });

      try {
        await runStream({
          apiBase: base,
          agentPublicId: id,
          pageUrl: window.location.href,
          query,
          hostState,
          hostTools,
          signal: controllerRef.current.signal,
          onFrame: (frame) => {
            const d2 = ctxRef.current.dispatch;
            if (frame.kind === "hello") {
              // Replace the local document with the server's seeded one so
              // patches apply onto exactly what the server is mutating.
              d2({ type: "SET_CONVERSATION", conversation: frame.conversation });
            } else if (frame.kind === "patch") {
              d2({ type: "APPLY_PATCH", frame });
            } else if (frame.kind === "end" && frame.status === "error") {
              console.error("[eregna] run failed:", frame.message);
            }
          },
        });
      } catch (err) {
        if ((err as DOMException).name !== "AbortError") {
          console.error("[eregna] runStream error", err);
        }
      }
    });
  }

  // Abort any in-flight stream on unmount. Single cleanup-only effect.
  useEffect(() => () => { controllerRef.current?.abort(); }, []);

  return (
    <>
      <WalkthroughOverlay />
      <div className="eregna-widget-root">
        {state.mode === "bubble" && <ChatPopup />}
        {state.mode === "detached" && (
          <div className="eregna-detached-bar">
            <PlayerBar />
          </div>
        )}
        <BubbleFAB />
      </div>
    </>
  );
}

export interface WidgetRootProps {
  apiBase?: string;
  agentPublicId?: string;
}

export function WidgetRoot({ apiBase, agentPublicId }: WidgetRootProps) {
  const resolvedApiBase =
    apiBase ?? (typeof window !== "undefined" ? window.location.origin : "");

  return (
    <WidgetProvider conversation={SAMPLE_CONVERSATION}>
      <WidgetInner apiBase={resolvedApiBase} agentPublicId={agentPublicId ?? ""} />
    </WidgetProvider>
  );
}
