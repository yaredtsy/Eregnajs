import { useWidgetDispatch, useWidget } from "../../store/widget-context.js";

export function DebugToggle() {
  const { state } = useWidget();
  const dispatch = useWidgetDispatch();

  return (
    <button
      aria-label={state.inspectorOpen ? "Show chat" : "Show debug inspector"}
      aria-pressed={state.inspectorOpen}
      className={`eregna-icon-btn eregna-icon-btn--debug${state.inspectorOpen ? " eregna-icon-btn--debug-on" : ""}`}
      onClick={() => dispatch({ type: "TOGGLE_INSPECTOR" })}
      title={state.inspectorOpen ? "Back to chat" : "Debug inspector"}
      type="button"
    >
      ⓘ
    </button>
  );
}
