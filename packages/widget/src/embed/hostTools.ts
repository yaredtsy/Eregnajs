// Minimal Standard Schema interface (https://standardschema.dev) — lets
// customers pass Zod 3.24+/Valibot/ArkType schemas as validators without us
// depending on any of them.
export interface StandardSchemaV1 {
  "~standard": {
    version: 1;
    vendor: string;
    validate(value: unknown):
      | StandardSchemaResult
      | Promise<StandardSchemaResult>;
  };
}

interface StandardSchemaResult {
  issues?: ReadonlyArray<{ message: string }>;
  value?: unknown;
}

export type ToolValidator =
  | StandardSchemaV1
  | ((args: Record<string, unknown>) => true | string);

export interface ToolSpecBase {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  validate?: ToolValidator;
}

export interface FnToolSpec extends ToolSpecBase {
  kind?: "fn";
  run: (args: Record<string, unknown>) => unknown | Promise<unknown>;
}

export interface ApiEndpointSpec {
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  bodyTemplate?: Record<string, unknown>;
}

export interface ApiToolSpec extends ToolSpecBase {
  kind: "api";
  endpoint: ApiEndpointSpec;
}

export type ToolSpec = FnToolSpec | ApiToolSpec;

const registry = new Map<string, ToolSpec>();

export function registerTool(spec: ToolSpec): () => void {
  registry.set(spec.name, spec);
  return () => {
    registry.delete(spec.name);
  };
}

export function getTool(name: string): ToolSpec | undefined {
  return registry.get(name);
}

export function listTools(): ToolSpec[] {
  return Array.from(registry.values());
}

export async function validateToolArgs(
  spec: ToolSpec,
  args: Record<string, unknown>,
): Promise<string | null> {
  const v = spec.validate;
  if (!v) return null;
  try {
    if (typeof v === "function") {
      const r = v(args);
      return r === true ? null : String(r);
    }
    const result = await v["~standard"].validate(args);
    if (result.issues && result.issues.length > 0) {
      return result.issues.map((i) => i.message).join("; ");
    }
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "validation failed";
  }
}

export function getToolDescriptors(): Array<{
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}> {
  return listTools().map(({ name, description, parameters }) => ({
    name,
    description,
    ...(parameters ? { parameters } : {}),
  }));
}
