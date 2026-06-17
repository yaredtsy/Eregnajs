import { setState as _setState, getState } from "./hostState.js";
import { registerTool as _registerTool, getToolDescriptors } from "./hostTools.js";
import { addKnowledge as _addKnowledge, getKnowledgeEntries } from "./hostKnowledge.js";
import { configure as _configure, applyRedaction } from "./hostConfig.js";
import { debugResolve } from "../engine/selectors.js";
import type { HostApi } from "./host-api.js";
import type { ToolSpec } from "./hostTools.js";

type AskFn = (
  query: string,
  hostState: Record<string, unknown>,
  hostTools: ReturnType<typeof getToolDescriptors>,
  hostKnowledge: Array<{ title: string; content: string }>,
) => Promise<void>;

let _ask: AskFn | null = null;
let _ready = false;
let _openFn: (() => void) | null = null;
let _closeFn: (() => void) | null = null;

let _readyResolve!: () => void;
const _readyPromise = new Promise<void>((res) => {
  _readyResolve = res;
});

const readyCallbacks = new Set<() => void>();

export function mountReady(
  askFn: AskFn,
  ui?: { open: () => void; close: () => void },
): void {
  _ask = askFn;
  _openFn = ui?.open ?? null;
  _closeFn = ui?.close ?? null;
  _ready = true;
  _readyResolve();
  for (const cb of readyCallbacks) cb();
}

export function createHostApi(): HostApi {
  return {
    setState(partial) {
      try {
        _setState(partial);
      } catch (err) {
        console.warn("[eregna] setState failed", err);
      }
    },

    registerTool(spec: ToolSpec) {
      try {
        return _registerTool(spec);
      } catch (err) {
        console.warn("[eregna] registerTool failed", err);
        return () => {};
      }
    },

    addKnowledge(entry) {
      try {
        return _addKnowledge(entry);
      } catch (err) {
        console.warn("[eregna] addKnowledge failed", err);
        return () => {};
      }
    },

    configure(opts) {
      try {
        _configure(opts);
      } catch (err) {
        console.warn("[eregna] configure failed", err);
      }
    },

    get ready() {
      return _ready;
    },

    onReady(cb) {
      if (_ready) {
        cb();
        return () => {};
      }
      readyCallbacks.add(cb);
      return () => {
        readyCallbacks.delete(cb);
      };
    },

    open() {
      try {
        _openFn?.();
      } catch (err) {
        console.warn("[eregna] open failed", err);
      }
    },

    close() {
      try {
        _closeFn?.();
      } catch (err) {
        console.warn("[eregna] close failed", err);
      }
    },

    async ask(query: string) {
      if (!_ready) await _readyPromise;
      if (!_ask) throw new Error("Widget not mounted");
      await _ask(
        query,
        applyRedaction(getState()),
        getToolDescriptors(),
        getKnowledgeEntries(),
      );
    },

    __debugResolve(keyOrQuery) {
      return debugResolve(keyOrQuery);
    },
  };
}
