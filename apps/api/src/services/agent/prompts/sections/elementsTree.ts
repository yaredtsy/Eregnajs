import type { PromptSection } from "../types.js";
import type { ElementRow } from "../../context/types.js";

function renderElement(el: ElementRow, indent: number): string {
  const pad = "  ".repeat(indent);
  const id = el.dom_id ? ` [id="${el.dom_id}"]` : "";
  const desc = el.description ? ` — ${el.description}` : "";
  return `${pad}- ${el.label}${id}${desc}`;
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
Use the element id values exactly as shown when referencing elements.
${tree}
`.trim();
  },
};
