import { useMemo, useState } from "react";
import {
  DISPLAY_TRUNCATE_CHARS,
  isTruncated,
  maskSensitiveArgs,
} from "../../../chat/tools/format.js";

function formatArgValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function ArgsRow({
  args,
  show,
}: {
  args: Record<string, unknown>;
  show: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const masked = useMemo(() => maskSensitiveArgs(args), [args]);
  const entries = Object.entries(masked);

  if (!show || entries.length === 0) return null;

  return (
    <dl className="eregna-tool-call-card__args">
      {entries.map(([key, value]) => {
        const full = formatArgValue(value);
        const truncated = isTruncated(full);
        const display = expanded || !truncated ? full : `${full.slice(0, DISPLAY_TRUNCATE_CHARS)}…`;

        return (
          <div key={key} className="eregna-tool-call-card__kv">
            <dt>{key}</dt>
            <dd>
              <code>{display}</code>
              {truncated && (
                <button
                  type="button"
                  className="eregna-tool-call-card__expand"
                  onClick={() => setExpanded((v) => !v)}
                >
                  {expanded ? "Show less" : "Show more"}
                </button>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
