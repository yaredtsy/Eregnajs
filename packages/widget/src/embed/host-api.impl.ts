import { setState as _setState, getState } from "./hostState.js";
import { registerTool as _registerTool, getToolDescriptors } from "./hostTools.js";
import type { HostApi } from "./host-api.js";
import type { ToolSpec } from "./hostTools.js";

type AskFn = (query: string, hostState: Record<string, unknown>, hostTools: ReturnType<typeof getToolDescriptors>) => Promise<void>;

let _ask: AskFn | null = null;
let _ready = false;

// Resolved when the widget mounts and wires up the ask function.
let _readyResolve!: () => void;
const _readyPromise = new Promise<void>((res) => {
  _readyResolve = res;
});

export function mountReady(askFn: AskFn): void {
  _ask = askFn;
  _ready = true;
  _readyResolve();
}

export function createHostApi(): HostApi {
  return {
    setState(partial) {
      _setState(partial);
    },

    registerTool(spec: ToolSpec) {
      _registerTool(spec);
    },

    async ask(query: string) {
      if (!_ready) await _readyPromise;
      if (!_ask) throw new Error("Widget not mounted");
      await _ask(query, getState(), getToolDescriptors());
    },
  };
}
