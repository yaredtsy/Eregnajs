import type { PromptSection } from "../types.js";
import type { ElementRow } from "../../context/types.js";
import { elementKey } from "../../context/util/elementKey.js";

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
    return `
## Registered Elements (element tree)
Reference elements by their key, exactly as shown. Never invent a key.
${tree}
`.trim();
  },
};
