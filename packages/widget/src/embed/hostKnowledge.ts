export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
}

const MAX_ENTRIES = 20;
const MAX_TOTAL_CHARS = 32_000;

let entries: KnowledgeEntry[] = [];

export function addKnowledge(entry: {
  id?: string;
  title: string;
  content: string;
}): () => void {
  const id = entry.id ?? crypto.randomUUID();
  const next = { id, title: entry.title, content: entry.content };

  if (entries.length >= MAX_ENTRIES && !entries.some((e) => e.id === id)) {
    console.warn("[eregna] addKnowledge: max entries reached (20)");
    return () => {};
  }

  const without = entries.filter((e) => e.id !== id);
  const projected = [...without, next];
  const chars = projected.reduce((n, e) => n + e.title.length + e.content.length, 0);
  if (chars > MAX_TOTAL_CHARS) {
    console.warn("[eregna] addKnowledge: 32KB total cap exceeded");
    return () => {};
  }

  entries = projected;
  return () => {
    entries = entries.filter((e) => e.id !== id);
  };
}

export function getKnowledgeEntries(): Array<{ title: string; content: string }> {
  return entries.map(({ title, content }) => ({ title, content }));
}

export function clearKnowledge(): void {
  entries = [];
}
