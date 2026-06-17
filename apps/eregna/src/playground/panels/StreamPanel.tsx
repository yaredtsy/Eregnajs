export type StreamFrame = {
  kind: string;
  seq?: number;
  raw: string;
  ts: number;
};

export function StreamPanel({ frames }: { frames: StreamFrame[] }) {
  return (
    <div className="flex flex-col gap-2 text-xs">
      <p className="text-muted-foreground">
        Raw NDJSON frames from full runs (<code className="text-foreground">eregna:frame</code> events).
      </p>
      <div className="max-h-[420px] overflow-auto rounded border border-border bg-slate-950 p-2 font-mono text-[10px] text-slate-300">
        {frames.length === 0 ? (
          <span className="text-muted-foreground">Run a full walkthrough to see frames</span>
        ) : (
          frames.map((f, i) => (
            <div key={`${f.ts}-${i}`} className="mb-2 border-b border-slate-800 pb-2">
              <span className="text-blue-400">{f.kind}</span>
              {f.seq !== undefined ? <span className="text-slate-500"> seq={f.seq}</span> : null}
              <pre className="mt-1 whitespace-pre-wrap break-all text-slate-400">{f.raw}</pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
