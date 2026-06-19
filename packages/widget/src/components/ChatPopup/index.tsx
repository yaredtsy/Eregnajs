import { useWidget, useWidgetDispatch } from "../../store/widget-context";
import { useRunSession } from "../../hooks/useAgentRun";
import { isDebugMode } from "../../api/init.js";
import { DebugToggle } from "../header/DebugToggle";
import { Inspector } from "../debug/Inspector";
import { PlayerBar } from "../PlayerBar";
import { Composer } from "../Composer";
import { MessageList } from "./MessageList";

export function ChatPopup() {
  const { state } = useWidget();
  const dispatch = useWidgetDispatch();
  const { stop } = useRunSession();
  const isActive = !!state.activeWalkthroughId;

  function close() {
    stop();
    dispatch({ type: "SET_MODE", mode: "closed" });
  }

  return (
    <div className="eregna-chat-popup">
      <div className="eregna-chat-popup__header">
        <div className="eregna-chat-popup__header-info">
          <div className="eregna-chat-popup__avatar" aria-hidden>
            E
          </div>
          <div>
            <p className="eregna-chat-popup__agent-name">
              {state.conversation.agentName}
            </p>
            <p className="eregna-chat-popup__status">
              {state.streamActive
                ? "Responding…"
                : state.status === "playing"
                  ? "Playing walkthrough…"
                  : state.status === "paused"
                    ? "Paused"
                    : state.status === "complete"
                      ? "Done"
                      : "Online"}
            </p>
          </div>
        </div>
        <div className="eregna-chat-popup__header-actions">
          {isDebugMode() && <DebugToggle />}
          {state.conversation.messages.length > 0 && (
            <button
              aria-label="New chat"
              className="eregna-icon-btn eregna-icon-btn--text"
              disabled={state.streamActive}
              onClick={() => {
                stop();
                dispatch({ type: "NEW_CHAT" });
              }}
              title="New chat"
              type="button"
            >
              New
            </button>
          )}
          {isActive && (
            <button
              aria-label="Detach player"
              className="eregna-icon-btn"
              onClick={() => dispatch({ type: "SET_MODE", mode: "detached" })}
              title="Detach to floating bar"
              type="button"
            >
              ⤢
            </button>
          )}
          <button
            aria-label="Close"
            className="eregna-icon-btn"
            onClick={close}
            type="button"
          >
            ×
          </button>
        </div>
      </div>

      <div className="eregna-chat-popup__body">
        {state.inspectorOpen ? <Inspector /> : <MessageList />}
      </div>

      {isActive ? <PlayerBar /> : <Composer />}
    </div>
  );
}
