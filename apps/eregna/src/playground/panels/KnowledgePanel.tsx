import { KNOWLEDGE_PRESETS } from "../presets";

export type KnowledgeEntry = { id: string; title: string; content: string };

export function KnowledgePanel({
  entries,
  onAdd,
  onRemove,
}: {
  entries: KnowledgeEntry[];
  onAdd: (entry: { title: string; content: string }) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 text-xs">
      <p className="text-muted-foreground">
        Runtime facts via <code className="text-foreground">eregna.addKnowledge</code> — tagged (source: page) in prompts.
      </p>
      <div className="flex flex-wrap gap-2">
        {KNOWLEDGE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="rounded border border-border px-2 py-1 hover:bg-muted"
            onClick={() => onAdd({ title: p.title, content: p.content })}
          >
            {p.id}
          </button>
        ))}
      </div>
      <ul className="space-y-2">
        {entries.map((e) => (
          <li key={e.id} className="rounded border border-border p-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-foreground">{e.title}</p>
                <p className="mt-0.5 text-muted-foreground">{e.content}</p>
              </div>
              <button
                type="button"
                className="shrink-0 text-red-400 hover:underline"
                onClick={() => onRemove(e.id)}
              >
                remove
              </button>
            </div>
          </li>
        ))}
        {entries.length === 0 ? (
          <li className="text-muted-foreground">No page knowledge entries</li>
        ) : null}
      </ul>
    </div>
  );
}
