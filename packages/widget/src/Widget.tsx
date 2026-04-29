import { useId, useState } from "react";

export function WidgetRoot() {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="eregna-widget-root">
      {open ? (
        <div
          aria-labelledby={`${panelId}-title`}
          className="eregna-chat-panel"
          id={panelId}
          role="dialog"
        >
          <header className="eregna-chat-panel__header">
            <h2 className="eregna-chat-panel__title" id={`${panelId}-title`}>
              Chat
            </h2>
            <button
              aria-label="Close chat"
              className="eregna-chat-panel__close"
              onClick={() => setOpen(false)}
              type="button"
            >
              ×
            </button>
          </header>
          <div className="eregna-chat-panel__body">
            <p className="eregna-chat-panel__placeholder">
              Messages will appear here.
            </p>
          </div>
        </div>
      ) : null}

      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        className="eregna-float-btn"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <span className="eregna-float-btn__icon" aria-hidden>
          <svg fill="none" height="24" viewBox="0 0 24 24" width="24">
            <path
              d="M12 3a8 8 0 0 0-8 8v4l-3 3 7-1h1a8 8 0 1 0 0-14Z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
        </span>
        <span className="sr-only">{open ? "Close chat" : "Open chat"}</span>
      </button>
    </div>
  );
}
