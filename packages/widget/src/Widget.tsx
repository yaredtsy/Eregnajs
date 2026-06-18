import { useCallback, useEffect } from "react";
import { SAMPLE_CONVERSATION } from "./data/sample-conversation";
import { createEmptyConversation } from "./data/empty-conversation";
import {
  WidgetProvider,
  useWidget,
  useWidgetDispatch,
} from "./store/widget-context";
import { usePlayer } from "./hooks/usePlayer";
import { useLiveEngine } from "./hooks/useLiveEngine";
import { useHistoryDrift } from "./hooks/useHistoryDrift";
import { RunSessionProvider } from "./hooks/useAgentRun";
import { BubbleFAB } from "./components/BubbleFAB";
import { ChatPopup } from "./components/ChatPopup";
import { DetachedPlayer } from "./components/DetachedPlayer";
import { WalkthroughOverlay } from "./components/WalkthroughOverlay";
import { DriftDialog } from "./components/DriftDialog";
import { setActiveManifest } from "./engine/selectors.js";

function WidgetInner() {
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

  const manifest = activeWt?.manifest ?? null;
  useEffect(() => {
    setActiveManifest(manifest);
    return () => setActiveManifest(null);
  }, [manifest]);

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
            if (q) {
              void (window as { eregna?: { ask(q: string): Promise<void> } }).eregna
                ?.ask(q)
                .catch((err: unknown) => console.error("[eregna] ask failed", err));
            }
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

  const initialConversation = agentPublicId
    ? createEmptyConversation("Eregna Guide")
    : SAMPLE_CONVERSATION;

  return (
    <WidgetProvider conversation={initialConversation}>
      <RunSessionProvider apiBase={resolvedApiBase} agentPublicId={agentPublicId ?? ""}>
        <WidgetInner />
      </RunSessionProvider>
    </WidgetProvider>
  );
}
