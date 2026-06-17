import { useCallback, useEffect, useRef } from "react";
import { SAMPLE_CONVERSATION } from "./data/sample-conversation";
import {
  WidgetProvider,
  useWidget,
  useWidgetDispatch,
  findStreamingWalkthrough,
} from "./store/widget-context";
import { usePlayer } from "./hooks/usePlayer";
import { useLiveEngine } from "./hooks/useLiveEngine";
import { useHistoryDrift } from "./hooks/useHistoryDrift";
import { BubbleFAB } from "./components/BubbleFAB";
import { ChatPopup } from "./components/ChatPopup";
import { DetachedPlayer } from "./components/DetachedPlayer";
import { WalkthroughOverlay } from "./components/WalkthroughOverlay";
import { DriftDialog } from "./components/DriftDialog";
import { setActiveManifest } from "./engine/selectors.js";
import { mountReady } from "./embed/host-api.impl.js";
import { getState } from "./embed/hostState.js";
import { getToolDescriptors } from "./embed/hostTools.js";
import { getVisitorId } from "./embed/visitorId.js";
import { runStream } from "./agent/runStream.js";

interface WidgetInnerProps {
  apiBase: string;
  agentPublicId: string;
}

function WidgetInner({ apiBase, agentPublicId }: WidgetInnerProps) {
  const { state, activeWt } = useWidget();
  const dispatch = useWidgetDispatch();
  usePlayer();
  useLiveEngine();

  const handleDriftEscalation = useCallback(
    (walkthroughId: string, query: string | null) => {
      dispatch({ type: "SHOW_DRIFT_DIALOG", walkthroughId, query });
    },
    [dispatch],
  );
  useHistoryDrift(handleDriftEscalation);

  const askRef = useRef<((query: string) => Promise<void>) | null>(null);
  const manifest = activeWt?.manifest ?? null;
  useEffect(() => {
    setActiveManifest(manifest);
    return () => setActiveManifest(null);
  }, [manifest]);

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

    mountReady(async (query) => {
      const startRun = async (q: string, signal: AbortSignal) => {
        const { apiBase: base, agentPublicId: id } = ctxRef.current;
        await runStream({
          apiBase: base,
          agentPublicId: id,
          pageUrl: window.location.href,
          query: q,
          hostState: getState(),
          hostTools: getToolDescriptors(),
          visitorId: getVisitorId(),
          signal,
          onFrame: (frame) => {
            const d2 = ctxRef.current.dispatch;
            if (frame.kind === "hello") {
              d2({ type: "SET_CONVERSATION", conversation: frame.conversation });
            } else if (frame.kind === "patch") {
              d2({ type: "APPLY_PATCH", frame });
            } else if (frame.kind === "end" && frame.status === "error") {
              console.error("[eregna] run failed:", frame.message);
            }
          },
        });
      };

      controllerRef.current?.abort();
      controllerRef.current = new AbortController();
      askRef.current = async (q) => {
        controllerRef.current?.abort();
        controllerRef.current = new AbortController();
        ctxRef.current.dispatch({ type: "SET_PLAY_MODE", playMode: "live" });
        ctxRef.current.dispatch({ type: "SET_MODE", mode: "bubble" });
        try {
          await startRun(q, controllerRef.current.signal);
        } catch (err) {
          if ((err as DOMException).name !== "AbortError") {
            console.error("[eregna] runStream error", err);
          }
        }
      };

      const { dispatch: d } = ctxRef.current;
      d({ type: "SET_PLAY_MODE", playMode: "live" });
      d({ type: "SET_MODE", mode: "bubble" });

      try {
        await startRun(query, controllerRef.current.signal);
      } catch (err) {
        if ((err as DOMException).name !== "AbortError") {
          console.error("[eregna] runStream error", err);
        }
      }
    });
  }

  // Abort any in-flight stream on unmount. Single cleanup-only effect.
  useEffect(() => () => { controllerRef.current?.abort(); }, []);

  // Auto-detach once per walkthrough: when one activates for playback, or a
  // live run starts streaming (the ticker is the only planning feedback).
  // The ref makes it once-per-id so a user-closed bar stays closed.
  const streamingWt =
    state.playMode === "live" ? findStreamingWalkthrough(state.conversation) : null;
  const detachKey =
    state.activeWalkthroughId ??
    (streamingWt ? `pending:${streamingWt.walkthroughId}` : null);
  const lastDetachKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!detachKey || lastDetachKeyRef.current === detachKey) return;
    lastDetachKeyRef.current = detachKey;
    dispatch({ type: "SET_MODE", mode: "detached" });
  }, [detachKey]); // dispatch is stable by React contract — omitted

  const drift = state.driftDialog;

  return (
    <>
      <WalkthroughOverlay />
      {drift ? (
        <DriftDialog
          onRegenerate={() => {
            dispatch({ type: "CLOSE_DRIFT_DIALOG" });
            dispatch({ type: "STOP_WALKTHROUGH" });
            const q = drift.query?.trim();
            if (q && askRef.current) void askRef.current(q);
          }}
          onStop={() => {
            dispatch({ type: "CLOSE_DRIFT_DIALOG" });
            dispatch({ type: "STOP_WALKTHROUGH" });
          }}
        />
      ) : null}
      <div className="eregna-widget-root">
        {state.mode === "bubble" && <ChatPopup />}
        {state.mode === "detached" && <DetachedPlayer />}
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
