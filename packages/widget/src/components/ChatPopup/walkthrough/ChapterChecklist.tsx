import type { WalkthroughChapter } from "../../../types/conversation";

interface ItemProps {
  chapter: WalkthroughChapter;
  index: number;
}

function intentLabel(intent?: WalkthroughChapter["intent"]): string {
  return intent ?? "show";
}

export function ChapterChecklistItem({ chapter, index }: ItemProps) {
  return (
    <li className="eregna-wt-chapter">
      <span className="eregna-wt-chapter__dot" aria-hidden>
        ☐
      </span>
      <div className="eregna-wt-chapter__body">
        <span className="eregna-wt-chapter__title">
          {index + 1}. {chapter.title}
        </span>
        <span className="eregna-wt-chapter__meta">
          <span className={`eregna-wt-chapter__intent eregna-wt-chapter__intent--${intentLabel(chapter.intent)}`}>
            {intentLabel(chapter.intent)}
          </span>
          {" · "}
          ~{chapter.expectedSteps ?? 1} step{(chapter.expectedSteps ?? 1) !== 1 ? "s" : ""}
        </span>
      </div>
    </li>
  );
}

interface Props {
  chapters: WalkthroughChapter[];
  planning: boolean;
}

export function ChapterChecklist({ chapters, planning }: Props) {
  if (chapters.length === 0) {
    if (!planning) return null;
    return (
      <div className="eregna-wt-skeleton" aria-hidden>
        <div className="eregna-wt-skeleton__bar" />
        <div className="eregna-wt-skeleton__bar" />
        <div className="eregna-wt-skeleton__bar eregna-wt-skeleton__bar--short" />
      </div>
    );
  }

  return (
    <ol className="eregna-wt-chapters">
      {chapters.map((chapter, i) => (
        <ChapterChecklistItem key={`${chapter.elementId}-${i}`} chapter={chapter} index={i} />
      ))}
    </ol>
  );
}
