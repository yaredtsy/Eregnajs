import type { PlaygroundConfig } from "../usePlaygroundConfig";

const MODES: Array<{ id: PlaygroundConfig["runMode"]; label: string }> = [
  { id: "context", label: "Context" },
  { id: "plan", label: "Plan" },
  { id: "step", label: "Steps" },
  { id: "narrate", label: "Narrate" },
  { id: "full", label: "Full run" },
];

export function RunPanel({
  config,
  onPatch,
  onRun,
  running,
  result,
  error,
}: {
  config: PlaygroundConfig;
  onPatch: (p: Partial<PlaygroundConfig>) => void;
  onRun: () => void;
  running: boolean;
  result: unknown;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-3 text-xs">
      <p className="text-muted-foreground">
        Subsystem isolator — maps to <code className="text-foreground">/v1/agent/debug/*</code> or full widget run.
      </p>
      <div className="flex flex-wrap gap-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`rounded px-2 py-1 ${config.runMode === m.id ? "bg-blue-600 text-white" : "border border-border"}`}
            onClick={() => onPatch({ runMode: m.id })}
          >
            {m.label}
          </button>
        ))}
      </div>
      {config.runMode === "step" ? (
        <label className="flex items-center gap-2">
          chapter index
          <input
            type="number"
            min={0}
            className="w-16 rounded border border-border bg-background px-2 py-1"
            value={config.chapterIndex}
            onChange={(e) => onPatch({ chapterIndex: Number(e.target.value) })}
          />
        </label>
      ) : null}
      <label className="block">
        <span className="text-muted-foreground">Query</span>
        <textarea
          className="mt-1 w-full rounded border border-border bg-background p-2 font-mono text-[11px]"
          rows={2}
          value={config.query}
          onChange={(e) => onPatch({ query: e.target.value })}
        />
      </label>
      <button
        type="button"
        disabled={running}
        className="self-start rounded-md bg-emerald-600 px-4 py-2 font-medium text-white disabled:opacity-50"
        onClick={onRun}
      >
        {running ? "Running…" : "Run"}
      </button>
      {error ? <p className="text-red-400">{error}</p> : null}
      {result ? (
        <pre className="max-h-64 overflow-auto rounded border border-border bg-muted/20 p-2 font-mono text-[10px]">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
