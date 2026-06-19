export { initWidget, type InitWidgetOptions, type InitWidgetResult } from "./embed.js";
export { isChatEvent, type ChatEvent } from "./chat/protocol/events.js";
export type { ClientToolSpec, ToolCallUiState } from "./chat/tools/types.js";
export { getMergedWireToolDescriptors } from "./chat/tools/wire.js";
export { applyWidgetInit, isDebugMode, type WidgetInitOptions } from "./api/init.js";
export { ToolCallCard } from "./components/chat/ToolCallCard/index.js";
