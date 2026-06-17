import type { ReactNode } from "react";

interface Props {
	children: ReactNode;
	narrow?: boolean;
	minHeight?: number;
	label?: string;
}

export function ComponentsShell({
	children,
	narrow,
	minHeight = 200,
	label,
}: Props) {
	return (
		<div
			className="eregna-components-stage"
			style={{ minHeight }}
			data-narrow={narrow ? "" : undefined}
		>
			{label ? <p className="eregna-components-stage__label">{label}</p> : null}
			<div
				className="eregna-components-stage__canvas"
				style={narrow ? { maxWidth: 360, margin: "0 auto" } : undefined}
			>
				{children}
			</div>
		</div>
	);
}
