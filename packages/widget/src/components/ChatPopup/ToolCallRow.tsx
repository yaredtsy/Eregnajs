import type { ToolCallUiState } from "../../runtime/clientTools/types.js";
import { getClientTool } from "../../runtime/clientTools/registry.js";

function summarize(value: unknown): string {
  if (value === undefined || value === null) return "";
  try {
    const s = typeof value === "string" ? value : JSON.stringify(value);
    return s.length > 120 ? `${s.slice(0, 120)}…` : s;
  } catch {
    return String(value);
  }
}

function maskArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (/password|token|secret/i.test(key)) {
      out[key] = "••••••";
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function ToolCallRow({ call }: { call: ToolCallUiState }) {
  const spec = getClientTool(call.name);
  const display = call.display ?? spec?.display;
  const label = display?.label ?? call.name;
  const showArgs = display?.showArgs !== false;
  const showResult = display?.showResult !== false;

  return (
    <div className={`eregna-tool-call eregna-tool-call--${call.status}`}>
      <div className="eregna-tool-call__header">
        {display?.icon && <span className="eregna-tool-call__icon">{display.icon}</span>}
        <span className="eregna-tool-call__label">{label}</span>
        <span className="eregna-tool-call__status">{call.status}</span>
        {call.elapsedMs != null && (
          <span className="eregna-tool-call__timing">{call.elapsedMs} ms</span>
        )}
      </div>
      {showArgs && Object.keys(call.args).length > 0 && (
        <pre className="eregna-tool-call__args">
          {JSON.stringify(maskArgs(call.args), null, 2)}
        </pre>
      )}
      {call.status === "error" && call.error && (
        <p className="eregna-tool-call__error">{call.error}</p>
      )}
      {showResult && call.status === "done" && call.result !== undefined && (
        <pre className="eregna-tool-call__result">{summarize(call.result)}</pre>
      )}
    </div>
  );
}
