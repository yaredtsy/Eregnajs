import type { PageItem } from "#/lib/api-types";

export function buildPageRows(pages: PageItem[]): { page: PageItem; depth: number }[] {
	const byParent = new Map<string | null, PageItem[]>();
	for (const p of pages) {
		const key = p.parent_id;
		const arr = byParent.get(key) ?? [];
		arr.push(p);
		byParent.set(key, arr);
	}
	for (const arr of byParent.values()) {
		arr.sort(
			(a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title),
		);
	}
	const out: { page: PageItem; depth: number }[] = [];
	function walk(parentId: string | null, depth: number) {
		for (const p of byParent.get(parentId) ?? []) {
			out.push({ page: p, depth });
			walk(p.id, depth + 1);
		}
	}
	walk(null, 0);
	return out;
}

export function parentIdsWithChildren(pages: PageItem[]): Set<string> {
	const s = new Set<string>();
	for (const p of pages) {
		if (p.parent_id) s.add(p.parent_id);
	}
	return s;
}
