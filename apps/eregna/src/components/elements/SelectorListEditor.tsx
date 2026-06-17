import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "@repo/ui/lucide-react";
import type { SelectorQuery } from "#/lib/api-types";
import { debugResolveSnippet } from "#/lib/selectors";

interface Props {
	selectors: SelectorQuery[];
	onChange: (next: SelectorQuery[]) => void;
	componentKey: string;
}

export function SelectorListEditor({ selectors, onChange, componentKey }: Props) {
	function updateAt(index: number, patch: Partial<SelectorQuery>) {
		onChange(selectors.map((s, i) => (i === index ? { ...s, ...patch } : s)));
	}

	function move(index: number, dir: -1 | 1) {
		const next = index + dir;
		if (next < 0 || next >= selectors.length) return;
		const copy = [...selectors];
		[copy[index], copy[next]] = [copy[next]!, copy[index]!];
		onChange(copy);
	}

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="text-xs text-muted-foreground">
					Ordered selector queries — most stable first. Text is the resilient
					fallback.
				</p>
				{componentKey ? (
					<button
						type="button"
						className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
						onClick={() => {
							void navigator.clipboard.writeText(debugResolveSnippet(componentKey));
						}}
					>
						<Copy className="h-3 w-3" />
						Copy test snippet
					</button>
				) : null}
			</div>

			{selectors.map((sel, i) => (
				<div
					key={i}
					className="grid gap-2 rounded-lg border border-border bg-background/50 p-3 sm:grid-cols-[auto_1fr_1fr_auto]"
				>
					<select
						value={sel.kind}
						onChange={(e) =>
							updateAt(i, {
								kind: e.target.value as SelectorQuery["kind"],
							})
						}
						className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
						aria-label={`Selector ${i + 1} strategy`}
					>
						<option value="dom-id">DOM id</option>
						<option value="css">CSS</option>
						<option value="text">Visible text</option>
					</select>
					<input
						value={sel.value}
						onChange={(e) => updateAt(i, { value: e.target.value })}
						placeholder={
							sel.kind === "dom-id"
								? "export-btn"
								: sel.kind === "css"
									? "#billing-export"
									: "Export"
						}
						className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm sm:col-span-1"
					/>
					{sel.kind === "text" ? (
						<input
							value={sel.tag ?? ""}
							onChange={(e) =>
								updateAt(i, { tag: e.target.value || undefined })
							}
							placeholder="tag filter (optional)"
							className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
						/>
					) : (
						<div />
					)}
					<div className="flex items-center gap-1">
						<button
							type="button"
							disabled={i === 0}
							onClick={() => move(i, -1)}
							className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
							aria-label="Move up"
						>
							<ArrowUp className="h-3.5 w-3.5" />
						</button>
						<button
							type="button"
							disabled={i === selectors.length - 1}
							onClick={() => move(i, 1)}
							className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
							aria-label="Move down"
						>
							<ArrowDown className="h-3.5 w-3.5" />
						</button>
						<button
							type="button"
							disabled={selectors.length <= 1}
							onClick={() => onChange(selectors.filter((_, j) => j !== i))}
							className="rounded p-1 text-destructive hover:bg-destructive/10 disabled:opacity-30"
							aria-label="Remove selector"
						>
							<Trash2 className="h-3.5 w-3.5" />
						</button>
					</div>
				</div>
			))}

			<button
				type="button"
				onClick={() =>
					onChange([...selectors, { kind: "css", value: "" }])
				}
				className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
			>
				<Plus className="h-3.5 w-3.5" />
				Add selector
			</button>
		</div>
	);
}
