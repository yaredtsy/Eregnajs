import type { ClientToolSpec } from "@repo/widget-internals/chat/tools/types";

export type ToolFailureMode = "off" | "throw" | "timeout";

export interface ToolConfig {
  enabled: boolean;
  latencyMs: number;
  failure: ToolFailureMode;
}

export type ToolCallLogEntry = {
  ts: number;
  name: string;
  args: Record<string, unknown>;
  status: "ok" | "error";
  summary: string;
};

type Stage = Window & {
  __eregnaPlayground?: {
    openPricingDialog: () => void;
    switchTab: (tab: string) => void;
    prefillForm: (args: { email?: string }) => void;
    getTableSummary: () => unknown;
    sumColumn: (args: { column: string }) => number;
  };
};

function delay(ms: number): Promise<void> {
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}

function wrapTool<T>(
  name: string,
  cfg: ToolConfig,
  fn: (args: Record<string, unknown>) => T | Promise<T>,
  onLog: (entry: ToolCallLogEntry) => void,
): (args: Record<string, unknown>) => Promise<T> {
  return async (args) => {
    const started = Date.now();
    try {
      await delay(cfg.latencyMs);
      if (cfg.failure === "timeout") {
        await delay(15_000);
      }
      if (cfg.failure === "throw") {
        throw Object.assign(new Error("injected failure"), {
          code: "injected",
          hint: "Toggle failure off in the Tools panel",
        });
      }
      const result = await fn(args);
      onLog({
        ts: started,
        name,
        args,
        status: "ok",
        summary: JSON.stringify(result).slice(0, 120),
      });
      return result;
    } catch (err) {
      const e = err as Error & { hint?: string };
      onLog({
        ts: started,
        name,
        args,
        status: "error",
        summary: e.message,
      });
      throw err;
    }
  };
}

function clientTool(
  spec: Omit<ClientToolSpec, "handler" | "runsIn"> & {
    handler: ClientToolSpec["handler"];
  },
  cfg: ToolConfig,
  onLog: (entry: ToolCallLogEntry) => void,
): ClientToolSpec {
  const { handler, ...rest } = spec;
  return {
    ...rest,
    runsIn: "client",
    handler: wrapTool(spec.name, cfg, handler, onLog),
  };
}

const EMPTY_PARAMS = {
  type: "object" as const,
  properties: {},
  additionalProperties: false,
};

export function registerPlaygroundTools(
  configs: Record<string, ToolConfig>,
  onLog: (entry: ToolCallLogEntry) => void,
): () => void {
  const api = window.eregna;
  if (!api?.registerClientTool) return () => {};

  const unsubs: Array<() => void> = [];
  const stage = () => (window as Stage).__eregnaPlayground;

  if (configs.openPricingDialog?.enabled) {
    unsubs.push(
      api.registerClientTool(
        clientTool(
          {
            name: "openPricingDialog",
            description: "Opens the pricing upgrade dialog on the playground stage.",
            parameters: EMPTY_PARAMS,
            display: { icon: "💳", label: "Open pricing dialog" },
            handler: () => {
              stage()?.openPricingDialog();
              return { opened: true };
            },
          },
          configs.openPricingDialog,
          onLog,
        ),
      ),
    );
  }

  if (configs.switchTab?.enabled) {
    unsubs.push(
      api.registerClientTool(
        clientTool(
          {
            name: "switchTab",
            description: "Switch the playground stage to tab a, b, or c.",
            parameters: {
              type: "object",
              properties: {
                tab: {
                  type: "string",
                  enum: ["a", "b", "c"],
                  description: "Tab id to show on the playground stage.",
                },
              },
              required: ["tab"],
              additionalProperties: false,
            },
            display: { icon: "📑", label: "Switch tab" },
            handler: (args) => {
              const tab = String(args.tab ?? "a");
              stage()?.switchTab(tab);
              return { tab };
            },
          },
          configs.switchTab,
          onLog,
        ),
      ),
    );
  }

  if (configs.prefillForm?.enabled) {
    unsubs.push(
      api.registerClientTool(
        clientTool(
          {
            name: "prefillForm",
            description: "Prefill the demo email field on the playground form.",
            parameters: {
              type: "object",
              properties: {
                email: {
                  type: "string",
                  description: "Email address to place in the form field.",
                },
              },
              additionalProperties: false,
            },
            display: { icon: "✉️", label: "Prefill form" },
            handler: (args) => {
              stage()?.prefillForm({ email: String(args.email ?? "") });
              return { email: args.email };
            },
          },
          configs.prefillForm,
          onLog,
        ),
      ),
    );
  }

  if (configs.table_summary?.enabled) {
    unsubs.push(
      api.registerClientTool(
        clientTool(
          {
            name: "table_summary",
            description: "Summarize row and column counts in the orders table.",
            parameters: EMPTY_PARAMS,
            display: { icon: "📋", label: "Table summary" },
            handler: () => stage()?.getTableSummary() ?? {},
          },
          configs.table_summary,
          onLog,
        ),
      ),
    );
  }

  if (configs.table_sum_column?.enabled) {
    unsubs.push(
      api.registerClientTool(
        clientTool(
          {
            name: "table_sum_column",
            description: "Sum a numeric column in the playground orders table.",
            parameters: {
              type: "object",
              properties: {
                column: {
                  type: "string",
                  description: "Column name to sum (must be numeric).",
                },
              },
              required: ["column"],
              additionalProperties: false,
            },
            display: { icon: "➕", label: "Sum column" },
            handler: (args) => stage()?.sumColumn({ column: String(args.column) }) ?? 0,
          },
          configs.table_sum_column,
          onLog,
        ),
      ),
    );
  }

  if (configs.fetchUsage?.enabled) {
    unsubs.push(
      api.registerClientTool(
        clientTool(
          {
            name: "fetchUsage",
            description: "Fetch usage stats from the same-origin playground mock API.",
            parameters: EMPTY_PARAMS,
            display: { icon: "📊", label: "Fetch usage" },
            handler: async () => {
              const res = await fetch("/api/playground-usage");
              if (!res.ok) throw new Error(`fetchUsage failed: ${res.status}`);
              return res.json();
            },
          },
          configs.fetchUsage,
          onLog,
        ),
      ),
    );
  }

  return () => {
    for (const u of unsubs) u();
  };
}

export const DEFAULT_TOOL_CONFIGS: Record<string, ToolConfig> = {
  openPricingDialog: { enabled: true, latencyMs: 0, failure: "off" },
  switchTab: { enabled: true, latencyMs: 0, failure: "off" },
  prefillForm: { enabled: true, latencyMs: 0, failure: "off" },
  table_summary: { enabled: true, latencyMs: 0, failure: "off" },
  table_sum_column: { enabled: true, latencyMs: 0, failure: "off" },
  fetchUsage: { enabled: true, latencyMs: 0, failure: "off" },
};
