import { STATE_PRESETS } from "../presets";

export function StatePanel({
  stateJson,
  onChange,
  onApply,
}: {
  stateJson: string;
  onChange: (v: string) => void;
  onApply: () => void;
}) {
  let redactedPreview = "{}";
  try {
    const parsed = JSON.parse(stateJson) as Record<string, unknown>;
    redactedPreview = JSON.stringify(parsed, null, 2);
  } catch {
    redactedPreview = "(invalid JSON)";
  }

  return (
    <div className="flex flex-col gap-3 text-xs">
      <p className="text-muted-foreground">
        Injected via <code className="text-foreground">eregna.setState</code> — snapshot sent at ask time.
      </p>
      <div className="flex flex-wrap gap-2">
        {Object.entries(STATE_PRESETS).map(([label, preset]) => (
          <button
            key={label}
            type="button"
            className="rounded border border-border px-2 py-1 hover:bg-muted"
            onClick={() => onChange(JSON.stringify(preset, null, 2))}
          >
            {label}
          </button>
        ))}
      </div>
      <textarea
        className="min-h-[140px] w-full rounded-md border border-border bg-background p-2 font-mono text-[11px]"
        value={stateJson}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="self-start rounded-md bg-blue-600 px-3 py-1.5 text-white"
        onClick={onApply}
      >
        Apply to host
      </button>
      <div>
        <p className="mb-1 font-medium text-foreground">Wire snapshot preview</p>
        <pre className="max-h-32 overflow-auto rounded border border-border bg-muted/30 p-2 font-mono text-[10px]">
          {redactedPreview}
        </pre>
      </div>
    </div>
  );
}
