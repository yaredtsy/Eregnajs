import { setState } from "../embed/hostState.js";
import { addKnowledge } from "../embed/hostKnowledge.js";
import type { KnowledgeInput } from "../embed/host-api.js";
import { registerClientTool } from "../runtime/clientTools/registry.js";
import type { ClientToolSpec } from "../runtime/clientTools/types.js";

let debugMode = false;

export function isDebugMode(): boolean {
  return debugMode;
}

export function setDebugMode(enabled: boolean): void {
  debugMode = enabled;
}

export interface WidgetInitOptions {
  tools?: ClientToolSpec[];
  state?: Record<string, unknown>;
  knowledge?: KnowledgeInput[];
  debug?: boolean;
}

/** Apply host-provided tools, state, and knowledge at init time. */
export function applyWidgetInit(opts: WidgetInitOptions): void {
  if (opts.state) setState(opts.state);
  if (opts.knowledge) {
    for (const entry of opts.knowledge) {
      addKnowledge(entry);
    }
  }
  if (opts.tools) {
    for (const tool of opts.tools) {
      registerClientTool(tool);
    }
  }
  if (opts.debug !== undefined) setDebugMode(opts.debug);
}
