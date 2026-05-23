import { SAMPLE_CONVERSATION } from "./data/sample-conversation";
import { WidgetProvider, useWidget } from "./store/widget-context";
import { usePlayer } from "./hooks/usePlayer";
import { BubbleFAB } from "./components/BubbleFAB";
import { ChatPopup } from "./components/ChatPopup";
import { PlayerBar } from "./components/PlayerBar";
import { WalkthroughOverlay } from "./components/WalkthroughOverlay";

function WidgetInner() {
  const { state } = useWidget();
  usePlayer();

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

export function WidgetRoot() {
  return (
    <WidgetProvider conversation={SAMPLE_CONVERSATION}>
      <WidgetInner />
    </WidgetProvider>
  );
}
