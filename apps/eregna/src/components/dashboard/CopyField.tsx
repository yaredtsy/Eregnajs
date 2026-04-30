import { Check, Copy } from "@repo/ui/lucide-react";
import { useCallback, useState } from "react";

type Props = {
	value: string;
	label: string;
	masked?: boolean;
};

export function CopyField({ value, label, masked }: Props) {
	const [copied, setCopied] = useState(false);
	const [visible, setVisible] = useState(false);

	const copy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(value);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			/* ignore */
		}
	}, [value]);

	const display =
		masked && !visible
			? "•".repeat(Math.min(32, Math.max(12, value.length)))
			: value;

	return (
		<div>
			<div className="mb-1 flex items-center justify-between gap-2">
				<span className="text-xs font-medium text-muted-foreground">
					{label}
				</span>
				<div className="flex items-center gap-1">
					{masked ? (
						<button
							type="button"
							onClick={() => setVisible((v) => !v)}
							className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
							aria-label={visible ? "Hide value" : "Show value"}
						>
							{visible ? (
								<span className="text-xs font-medium">Hide</span>
							) : (
								<span className="text-xs font-medium">Show</span>
							)}
						</button>
					) : null}
					<button
						type="button"
						onClick={() => void copy()}
						className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
						aria-label="Copy to clipboard"
					>
						{copied ? (
							<Check className="h-4 w-4 text-emerald-500" />
						) : (
							<Copy className="h-4 w-4" />
						)}
					</button>
				</div>
			</div>
			<div className="rounded-xl border border-border bg-background/80 px-3 py-2 font-mono text-xs text-foreground break-all">
				{display}
			</div>
		</div>
	);
}
