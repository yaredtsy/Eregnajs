import { X } from "@repo/ui/lucide-react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
	title: string;
	onClose: () => void;
	children: ReactNode;
	width?: string;
}

export function Modal({ title, onClose, children, width = "max-w-lg" }: ModalProps) {
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	return createPortal(
		<div
			className="fixed inset-0 z-50 flex items-center justify-center p-4"
			aria-modal="true"
			role="dialog"
		>
			{/* Backdrop */}
			<div
				className="absolute inset-0 bg-black/60 backdrop-blur-sm"
				onClick={onClose}
			/>

			{/* Panel */}
			<div
				className={`relative z-10 w-full ${width} rounded-2xl border border-border bg-card shadow-2xl`}
			>
				<div className="flex items-center justify-between border-b border-border px-5 py-4">
					<h2 className="text-sm font-semibold text-foreground">{title}</h2>
					<button
						type="button"
						onClick={onClose}
						className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
					>
						<X className="h-4 w-4" />
					</button>
				</div>
				<div className="p-5">{children}</div>
			</div>
		</div>,
		document.body,
	);
}
