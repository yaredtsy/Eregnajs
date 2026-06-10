import { useWidget, useWidgetDispatch } from "../../store/widget-context";
import { PlayerBar } from "../PlayerBar";
import { MessageList } from "./MessageList";

export function ChatPopup() {
  const { state } = useWidget();
  const dispatch = useWidgetDispatch();
  const isActive = !!state.activeWalkthroughId;

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
              {state.status === "playing"
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
            onClick={() => dispatch({ type: "SET_MODE", mode: "closed" })}
            type="button"
          >
            ×
          </button>
        </div>
      </div>

      <div className="eregna-chat-popup__body">
        <MessageList />
      </div>

      {isActive ? (
        <PlayerBar />
      ) : (
        <div className="eregna-composer">
          <input
            className="eregna-composer__input"
            onChange={(e) =>
              dispatch({ type: "SET_COMPOSER", value: e.target.value })
            }
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const query = state.composerValue.trim();
              if (!query) return;
              dispatch({ type: "SET_COMPOSER", value: "" });
              void (window as { eregna?: { ask(q: string): Promise<void> } }).eregna
                ?.ask(query)
                .catch((err: unknown) => console.error("[eregna] ask failed", err));
            }}
            placeholder="Ask anything…"
            type="text"
            value={state.composerValue}
          />
        </div>
      )}
    </div>
  );
}
