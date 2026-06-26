import type { Thought } from "../../../types/conversation";

interface Props {
  thoughts?: Thought[];
  status: string;
}

export function ThoughtTicker({ thoughts, status }: Props) {
  const planThoughts = (thoughts ?? []).filter((t) => t.phase === "plan");
  const latest = planThoughts[planThoughts.length - 1];

  if (!latest) {
    if (status === "planning") {
      return <p className="eregna-wt-card__ticker">Reading your goal…</p>;
    }
    return null;
  }

  if (status === "planned" && planThoughts.length > 1) {
    const frameThought = planThoughts.find(
      (t, i) => i > 0 && !t.label.endsWith("…"),
    );
    if (frameThought) {
      return <p className="eregna-wt-card__ticker">{frameThought.label}</p>;
    }
  }

  return <p className="eregna-wt-card__ticker">{latest.label}</p>;
}
