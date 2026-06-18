import { useWidget, useWidgetDispatch } from "../store/widget-context";
import { useRunSession } from "../hooks/useAgentRun";

interface ComposerProps {
  placeholder?: string;
  onSubmit?: (query: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export function Composer({ placeholder = "Ask anything…", onSubmit, onKeyDown }: ComposerProps) {
  const { state } = useWidget();
  const dispatch = useWidgetDispatch();
  const { stop } = useRunSession();
  const streaming = state.streamActive;

  function submit() {
    const query = state.composerValue.trim();
    if (!query || streaming) return;
    dispatch({ type: "SET_COMPOSER", value: "" });
    if (onSubmit) {
      onSubmit(query);
      return;
    }
    void (window as { eregna?: { ask(q: string): Promise<void> } }).eregna
      ?.ask(query)
      .catch((err: unknown) => console.error("[eregna] ask failed", err));
  }

  return (
    <div className="eregna-composer">
      <input
        className="eregna-composer__input"
        disabled={streaming}
        onChange={(e) => dispatch({ type: "SET_COMPOSER", value: e.target.value })}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.key !== "Enter" || streaming) return;
          e.preventDefault();
          submit();
        }}
        placeholder={streaming ? "Responding…" : placeholder}
        type="text"
        value={state.composerValue}
      />
      {streaming ? (
        <button
          aria-label="Stop"
          className="eregna-composer__stop"
          onClick={stop}
          title="Stop"
          type="button"
        >
          ■
        </button>
      ) : state.composerValue ? (
        <button
          aria-label="Send"
          className="eregna-composer__send"
          onClick={submit}
          type="button"
        >
          ↵
        </button>
      ) : null}
    </div>
  );
}
