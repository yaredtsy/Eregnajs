import type { ReactNode } from "react";
import type { Conversation } from "@repo/widget-internals/types/conversation";
import type { WidgetState } from "@repo/widget-internals/store/widget-context";
import { WidgetProvider } from "@repo/widget-internals/store/widget-context";
import { SAMPLE_CONVERSATION } from "@repo/widget-internals/data/sample-conversation";

interface Props {
	children: ReactNode;
	conversation?: Conversation;
	initialState?: Partial<WidgetState>;
}

export function ComponentsProvider({
	children,
	conversation = SAMPLE_CONVERSATION,
	initialState,
}: Props) {
	return (
		<WidgetProvider conversation={conversation} initialState={initialState}>
			<div className="eregna-components-root">{children}</div>
		</WidgetProvider>
	);
}
