import { getClientTool } from "../../../chat/tools/registry.js";
import type { ToolCallUiState } from "../../../chat/tools/types.js";
import { ArgsRow } from "./ArgsRow.js";
import { ResultRow } from "./ResultRow.js";
import { Status } from "./Status.js";
import { Timing } from "./Timing.js";

export function ToolCallCard({ call }: { call: ToolCallUiState }) {
  const spec = getClientTool(call.name);
  const display = call.display ?? spec?.display;
  const label = display?.label ?? call.name;
  const showArgs = display?.showArgs !== false;
  const showResult = display?.showResult !== false;

  return (
    <article
      className={`eregna-tool-call-card eregna-tool-call-card--${call.status}`}
      aria-label={`Tool call: ${label}`}
    >
      <header className="eregna-tool-call-card__header">
        {display?.icon && (
          <span className="eregna-tool-call-card__icon" aria-hidden>
            {display.icon}
          </span>
        )}
        <span className="eregna-tool-call-card__label">{label}</span>
        <Status status={call.status} />
        <Timing elapsedMs={call.elapsedMs} />
      </header>

      <ArgsRow args={call.args} show={showArgs} />

      {call.status === "error" && call.error && (
        <p className="eregna-tool-call-card__error" role="alert">
          {call.error}
        </p>
      )}

      {call.status === "done" && <ResultRow result={call.result} show={showResult} />}
    </article>
  );
}
