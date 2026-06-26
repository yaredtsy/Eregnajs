import { useState } from "react";
import type { PlanReasoning } from "../../../types/conversation";

interface Props {
  walkthroughId: string;
  reasoning: PlanReasoning;
}

function storageKey(walkthroughId: string): string {
  return `eregna-wt-reasoning-${walkthroughId}`;
}

export function ReasoningDisclosure({ walkthroughId, reasoning }: Props) {
  const [open, setOpen] = useState(() => {
    try {
      return sessionStorage.getItem(storageKey(walkthroughId)) === "open";
    } catch {
      return false;
    }
  });

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      sessionStorage.setItem(storageKey(walkthroughId), next ? "open" : "closed");
    } catch {
      // ignore
    }
  };

  return (
    <div className="eregna-wt-reasoning">
      <button
        type="button"
        className="eregna-wt-reasoning__toggle"
        onClick={toggle}
        aria-expanded={open}
      >
        {open ? "▼" : "▶"} Reasoning
      </button>
      {open && (
        <div className="eregna-wt-reasoning__body">
          <section>
            <h4 className="eregna-wt-reasoning__heading">What you asked for</h4>
            <p>{reasoning.understanding}</p>
          </section>
          {reasoning.knowledgeAnchors.length > 0 && (
            <section>
              <h4 className="eregna-wt-reasoning__heading">Anchored facts</h4>
              <ul className="eregna-wt-reasoning__anchors">
                {reasoning.knowledgeAnchors.map((title) => (
                  <li key={title}>{title}</li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h4 className="eregna-wt-reasoning__heading">Why these components</h4>
            <p>{reasoning.componentMapping}</p>
          </section>
        </div>
      )}
    </div>
  );
}
