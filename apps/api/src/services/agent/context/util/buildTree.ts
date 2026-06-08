import type { ElementRow } from "../types.js";

export interface ElementNode extends ElementRow {
  children: ElementNode[];
}

export function buildTree(elements: ElementRow[]): ElementNode[] {
  const byId = new Map<string, ElementNode>(
    elements.map((e) => [e.id, { ...e, children: [] }]),
  );
  const roots: ElementNode[] = [];

  for (const node of byId.values()) {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort by sort_order at each level
  const sort = (nodes: ElementNode[]) => {
    nodes.sort((a, b) => a.sort_order - b.sort_order);
    nodes.forEach((n) => sort(n.children));
  };
  sort(roots);

  return roots;
}

export function flattenTree(nodes: ElementNode[]): ElementRow[] {
  const result: ElementRow[] = [];
  const visit = (n: ElementNode) => {
    result.push(n);
    n.children.forEach(visit);
  };
  nodes.forEach(visit);
  return result;
}
