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

export function registerPlaygroundTools(
  configs: Record<string, ToolConfig>,
  onLog: (entry: ToolCallLogEntry) => void,
): () => void {
  const api = window.eregna;
  if (!api) return () => {};

  const unsubs: Array<() => void> = [];

  const stage = () => (window as Stage).__eregnaPlayground;

  if (configs.openPricingDialog?.enabled) {
    unsubs.push(
      api.registerTool({
        name: "openPricingDialog",
        description: "Opens the pricing upgrade dialog",
        parameters: { type: "object", properties: {} },
        run: wrapTool(
          "openPricingDialog",
          configs.openPricingDialog,
          () => {
            stage()?.openPricingDialog();
            return { opened: true };
          },
          onLog,
        ),
      }),
    );
  }

  if (configs.switchTab?.enabled) {
    unsubs.push(
      api.registerTool({
        name: "switchTab",
        description: "Switch to tab a, b, or c",
        parameters: {
          type: "object",
          properties: { tab: { type: "string", enum: ["a", "b", "c"] } },
          required: ["tab"],
        },
        run: wrapTool(
          "switchTab",
          configs.switchTab,
          (args) => {
            const tab = String(args.tab ?? "a");
            stage()?.switchTab(tab);
            return { tab };
          },
          onLog,
        ),
      }),
    );
  }

  if (configs.prefillForm?.enabled) {
    unsubs.push(
      api.registerTool({
        name: "prefillForm",
        description: "Prefill the email field; invalid emails trigger validation error",
        parameters: {
          type: "object",
          properties: { email: { type: "string" } },
        },
        run: wrapTool(
          "prefillForm",
          configs.prefillForm,
          (args) => {
            stage()?.prefillForm({ email: String(args.email ?? "") });
            return { email: args.email };
          },
          onLog,
        ),
      }),
    );
  }

  if (configs.table_summary?.enabled) {
    unsubs.push(
      api.registerTool({
        name: "table_summary",
        description: "Summarize the orders table",
        parameters: { type: "object", properties: {} },
        run: wrapTool(
          "table_summary",
          configs.table_summary,
          () => stage()?.getTableSummary() ?? {},
          onLog,
        ),
      }),
    );
  }

  if (configs.table_sum_column?.enabled) {
    unsubs.push(
      api.registerTool({
        name: "table_sum_column",
        description: "Sum a numeric column in the orders table",
        parameters: {
          type: "object",
          properties: { column: { type: "string" } },
          required: ["column"],
        },
        run: wrapTool(
          "table_sum_column",
          configs.table_sum_column,
          (args) => stage()?.sumColumn({ column: String(args.column) }) ?? 0,
          onLog,
        ),
      }),
    );
  }

  if (configs.fetchUsage?.enabled) {
    unsubs.push(
      api.registerTool({
        name: "fetchUsage",
        kind: "api",
        description: "Fetch usage stats from same-origin mock API",
        parameters: { type: "object", properties: {} },
        endpoint: { method: "GET", url: "/api/playground-usage" },
      }),
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
