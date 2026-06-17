import { useState, type FormEvent } from "react";
import { useCreateElement } from "#/hooks/useElements";
import { Modal } from "#/components/ui/Modal";

interface Props {
	pageId: string;
	pageTitle: string;
	onClose: () => void;
}

export function AddElementModal({ pageId, pageTitle, onClose }: Props) {
	const createEl = useCreateElement(pageId);

	const [label, setLabel] = useState("");
	const [domId, setDomId] = useState("");
	const [cssSel, setCssSel] = useState("");
	const [desc, setDesc] = useState("");
	const [err, setErr] = useState<string | null>(null);

	async function submit(e: FormEvent) {
		e.preventDefault();
		setErr(null);
		if (!label.trim()) {
			setErr("Label is required.");
			return;
		}
		const selectors = [];
		if (domId.trim()) selectors.push({ kind: "dom-id" as const, value: domId.trim() });
		if (cssSel.trim()) selectors.push({ kind: "css" as const, value: cssSel.trim() });
		if (selectors.length === 0) {
			setErr("Provide a DOM id or CSS selector.");
			return;
		}
		try {
			await createEl.mutateAsync({
				label: label.trim(),
				selectors,
				description: desc.trim() || null,
				parent_id: null,
			});
			onClose();
		} catch (e) {
			setErr(e instanceof Error ? e.message : "Create failed");
		}
	}

	return (
		<Modal title={`Add element — ${pageTitle}`} onClose={onClose}>
			<form onSubmit={(e) => void submit(e)} className="space-y-4">
				<div>
					<label
						htmlFor="el-label"
						className="mb-1 block text-xs font-medium text-muted-foreground"
					>
						Label <span className="text-destructive">*</span>
					</label>
					<input
						id="el-label"
						autoFocus
						value={label}
						onChange={(e) => setLabel(e.target.value)}
						maxLength={120}
						placeholder="Hero section"
						className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
					/>
				</div>

				<div className="grid gap-3 sm:grid-cols-2">
					<div>
						<label
							htmlFor="el-dom"
							className="mb-1 block text-xs font-medium text-muted-foreground"
						>
							DOM id
						</label>
						<input
							id="el-dom"
							value={domId}
							onChange={(e) => setDomId(e.target.value)}
							placeholder="hero-section"
							className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
						/>
					</div>
					<div>
						<label
							htmlFor="el-css"
							className="mb-1 block text-xs font-medium text-muted-foreground"
						>
							CSS selector
						</label>
						<input
							id="el-css"
							value={cssSel}
							onChange={(e) => setCssSel(e.target.value)}
							placeholder="#main article"
							className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
						/>
					</div>
				</div>

				<div>
					<label
						htmlFor="el-desc"
						className="mb-1 block text-xs font-medium text-muted-foreground"
					>
						Description
					</label>
					<textarea
						id="el-desc"
						value={desc}
						onChange={(e) => setDesc(e.target.value)}
						rows={2}
						maxLength={500}
						className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
					/>
				</div>

				{err && (
					<p className="text-xs text-destructive" role="alert">
						{err}
					</p>
				)}

				<div className="flex justify-end gap-2 pt-1">
					<button
						type="button"
						onClick={onClose}
						className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={createEl.isPending}
						className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
					>
						{createEl.isPending ? "Adding…" : "Add element"}
					</button>
				</div>
			</form>
		</Modal>
	);
}
