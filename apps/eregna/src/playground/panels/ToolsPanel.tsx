import type {
  ToolCallLogEntry,
  ToolConfig,
  ToolFailureMode,
} from "../registerPlaygroundTools";

const LATENCIES = [0, 500, 3000] as const;
const FAILURES: ToolFailureMode[] = ["off", "throw", "timeout"];

export function ToolsPanel({
  configs,
  onChange,
  callLog,
}: {
  configs: Record<string, ToolConfig>;
  onChange: (name: string, patch: Partial<ToolConfig>) => void;
  callLog: ToolCallLogEntry[];
}) {
  return (
    <div className="flex flex-col gap-3 text-xs">
      <p className="text-muted-foreground">
        Client tools register through{" "}
        <code className="text-foreground">eregna.registerClientTool</code> with{" "}
        <code className="text-foreground">runsIn: &quot;client&quot;</code> — same
        v2 wire format as <code className="text-foreground">initWidget(&#123; tools &#125;)</code>.
      </p>
      <div className="space-y-2">
        {Object.entries(configs).map(([name, cfg]) => (
          <div key={name} className="rounded border border-border p-2">
            <label className="flex items-center gap-2 font-medium text-foreground">
              <input
                type="checkbox"
                checked={cfg.enabled}
                onChange={(e) => onChange(name, { enabled: e.target.checked })}
              />
              {name}
            </label>
            <div className="mt-2 flex flex-wrap gap-3 text-muted-foreground">
              <label className="flex items-center gap-1">
                latency
                <select
                  className="rounded border border-border bg-background px-1 py-0.5"
                  value={cfg.latencyMs}
                  onChange={(e) =>
                    onChange(name, { latencyMs: Number(e.target.value) })
                  }
                >
                  {LATENCIES.map((ms) => (
                    <option key={ms} value={ms}>
                      {ms}ms
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1">
                failure
                <select
                  className="rounded border border-border bg-background px-1 py-0.5"
                  value={cfg.failure}
                  onChange={(e) =>
                    onChange(name, {
                      failure: e.target.value as ToolFailureMode,
                    })
                  }
                >
                  {FAILURES.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ))}
      </div>
      <div>
        <p className="mb-1 font-medium text-foreground">Call log</p>
        <div className="max-h-40 overflow-auto rounded border border-border bg-muted/20 p-2 font-mono text-[10px]">
          {callLog.length === 0 ? (
            <span className="text-muted-foreground">No tool calls yet</span>
          ) : (
            callLog
              .slice()
              .reverse()
              .map((e) => (
                <div
                  key={`${e.ts}-${e.name}`}
                  className="mb-1 border-b border-border/50 pb-1"
                >
                  <span
                    className={
                      e.status === "ok" ? "text-emerald-400" : "text-red-400"
                    }
                  >
                    {e.status}
                  </span>{" "}
                  {e.name} {JSON.stringify(e.args)} → {e.summary}
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}
