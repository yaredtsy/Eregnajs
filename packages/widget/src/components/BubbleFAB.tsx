import { useWidget, useWidgetDispatch } from "../store/widget-context";

export function BubbleFAB() {
  const { state } = useWidget();
  const dispatch = useWidgetDispatch();
  const isOpen = state.mode === "bubble";

  return (
    <button
      aria-expanded={isOpen}
      aria-label={isOpen ? "Close guide" : "Open guide"}
      className="eregna-fab"
      onClick={() =>
        dispatch({ type: "SET_MODE", mode: isOpen ? "closed" : "bubble" })
      }
      type="button"
    >
      {state.bubbleHasUnread && !isOpen && (
        <span className="eregna-fab__dot" aria-hidden />
      )}
      {isOpen ? (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M4 4l12 12M16 4L4 16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 3a8 8 0 0 0-8 8v4l-3 3 7-1h1a8 8 0 1 0 0-14Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </svg>
      )}
    </button>
  );
}
