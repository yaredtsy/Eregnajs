import type { SelectorQuery } from "#/lib/api-types";

export function slugifyComponentKey(label: string): string {
	const s = label
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	return (s || "component").slice(0, 80);
}

export function selectorsFromElement(el: {
	selectors?: SelectorQuery[];
	dom_id?: string | null;
	css_selector?: string | null;
	label: string;
}): SelectorQuery[] {
	if (el.selectors?.length) return el.selectors;
	const out: SelectorQuery[] = [];
	if (el.dom_id?.trim()) out.push({ kind: "dom-id", value: el.dom_id.trim() });
	if (el.css_selector?.trim())
		out.push({ kind: "css", value: el.css_selector.trim() });
	if (out.length === 0 && el.label.trim())
		out.push({ kind: "text", value: el.label.trim() });
	return out;
}

export function emptySelector(): SelectorQuery {
	return { kind: "dom-id", value: "" };
}

export function debugResolveSnippet(key: string): string {
	return `eregna.__debugResolve("${key}")`;
}
