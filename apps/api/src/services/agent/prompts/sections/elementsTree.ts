import type { PromptSection } from "../types.js";
import type { ElementRow } from "../../context/types.js";
import { elementKey } from "../../context/util/elementKey.js";
import { truncateText } from "../util/budget.js";

// ~2k tokens (docs/v2/3-server/01 §5)
const MAX_CHARS = 8000;

function renderElement(el: ElementRow, indent: number): string {
  const pad = "  ".repeat(indent);
  const desc = el.description ? ` — ${el.description}` : "";
  return `${pad}- ${el.label} [key="${elementKey(el)}"]${desc}`;
}

function renderTree(elements: ElementRow[], parentId: string | null, indent: number): string {
  return elements
    .filter((e) => e.parent_id === parentId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((e) => [renderElement(e, indent), renderTree(elements, e.id, indent + 1)])
    .flat()
    .filter(Boolean)
    .join("\n");
}

export const elementsTreeSection: PromptSection = {
  name: "elementsTree",
  render: (ctx) => {
    if (!ctx.elements.length) return "";
    const tree = renderTree(ctx.elements, null, 0);
    const { text } = truncateText(tree, MAX_CHARS);
    return `
## Registered Elements (element tree)
Reference elements by their key, exactly as shown. Never invent a key.
${text}
`.trim();
  },
};
