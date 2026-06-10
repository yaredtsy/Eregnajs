import type { Thought, WalkthroughChapter, WalkthroughPart } from "../../types/conversation";
import { useWidget, useWidgetDispatch } from "../../store/widget-context";

function chapterIcon(
  chapter: WalkthroughChapter,
  index: number,
  currentChapterIndex: number,
): string {
  if (chapter.status === "failed") return "⚠";
  if (chapter.status === "done" || index < currentChapterIndex) return "✓";
  if (chapter.status === "active" || index === currentChapterIndex) return "▸";
  return "○";
}

function currentChapterOf(wt: WalkthroughPart, stepIndex: number): number {
  let current = 0;
  wt.chapters.forEach((c, i) => {
    if (c.stepIndex >= 0 && c.stepIndex <= stepIndex) current = i;
  });
  return current;
}

interface Props {
  wt: WalkthroughPart;
}

export function PlanPanel({ wt }: Props) {
  const { state, stepIndex } = useWidget();
  const dispatch = useWidgetDispatch();

  if (!state.planPanelOpen) return null;

  const thoughts = wt.thoughts ?? [];
  const planThoughts = thoughts.filter((t) => t.chapterIndex === undefined);
  const byChapter = new Map<number, Thought[]>();
  for (const t of thoughts) {
    if (t.chapterIndex === undefined) continue;
    const list = byChapter.get(t.chapterIndex) ?? [];
    list.push(t);
    byChapter.set(t.chapterIndex, list);
  }
  const currentChapter = currentChapterOf(wt, stepIndex);

  return (
    <div className="eregna-plan-panel">
      <div className="eregna-plan-panel__header">
        <span className="eregna-plan-panel__goal">{wt.planGoal || "Walkthrough plan"}</span>
        <button
          type="button"
          className="eregna-icon-btn"
          aria-label="Close plan"
          onClick={() => dispatch({ type: "TOGGLE_PLAN_PANEL" })}
        >
          ✕
        </button>
      </div>

      {planThoughts.length > 0 && (
        <ul className="eregna-plan-panel__thoughts">
          {planThoughts.map((t) => (
            <ThoughtLine key={t.id} thought={t} />
          ))}
        </ul>
      )}

      <ol className="eregna-plan-panel__chapters">
        {wt.chapters.map((chapter, i) => (
          <li
            key={i}
            className={`eregna-plan-panel__chapter ${
              chapter.status === "failed" ? "eregna-plan-panel__chapter--failed" : ""
            } ${i === currentChapter ? "eregna-plan-panel__chapter--current" : ""}`}
          >
            <span className="eregna-plan-panel__icon" aria-hidden>
              {chapterIcon(chapter, i, currentChapter)}
            </span>
            <span className="eregna-plan-panel__chapter-body">
              <span className="eregna-plan-panel__chapter-title">{chapter.title}</span>
              <span className="eregna-plan-panel__chapter-desc">{chapter.description}</span>
              {(byChapter.get(i) ?? []).map((t) => (
                <ThoughtLine key={t.id} thought={t} />
              ))}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ThoughtLine({ thought }: { thought: Thought }) {
  if (!thought.detail) {
    return (
      <span className="eregna-plan-panel__thought">
        <span aria-hidden>✦</span> {thought.label}
      </span>
    );
  }
  return (
    <details className="eregna-plan-panel__thought">
      <summary>
        <span aria-hidden>✦</span> {thought.label}
      </summary>
      <p className="eregna-plan-panel__thought-detail">{thought.detail}</p>
    </details>
  );
}
