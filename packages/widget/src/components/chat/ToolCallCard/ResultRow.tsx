import { useState } from "react";
import { DISPLAY_TRUNCATE_CHARS, isTruncated, summarizeValue } from "../../../chat/tools/format.js";

export function ResultRow({
  result,
  show,
}: {
  result: unknown;
  show: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!show || result === undefined) return null;

  const full = typeof result === "string" ? result : summarizeValue(result, Infinity);
  const truncated = isTruncated(full);
  const display =
    expanded || !truncated ? full : `${full.slice(0, DISPLAY_TRUNCATE_CHARS)}…`;

  return (
    <div className="eregna-tool-call-card__result">
      <span className="eregna-tool-call-card__result-label">Result</span>
      <pre>
        <code>{display}</code>
      </pre>
      {truncated && (
        <button
          type="button"
          className="eregna-tool-call-card__expand"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
