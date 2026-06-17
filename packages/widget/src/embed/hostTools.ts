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

// Either a Standard Schema or a plain predicate returning true | error-message.
// Functions cover state-dependent rules a schema can't express.
export type ToolValidator =
  | StandardSchemaV1
  | ((args: Record<string, unknown>) => true | string);

export interface ToolSpec {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  // Client-side last line of defense, run before run() (docs/v2/3-server/04 §4.1).
  validate?: ToolValidator;
  run: (args: Record<string, unknown>) => unknown | Promise<unknown>;
}

const registry = new Map<string, ToolSpec>();

export function registerTool(spec: ToolSpec): void {
  registry.set(spec.name, spec);
}

export function getTool(name: string): ToolSpec | undefined {
  return registry.get(name);
}

export function listTools(): ToolSpec[] {
  return Array.from(registry.values());
}

// Returns null when args pass, otherwise a human-readable message.
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
  // validate and run stay on the page — only the descriptor crosses the wire.
  return listTools().map(({ name, description, parameters }) => ({
    name,
    description,
    ...(parameters ? { parameters } : {}),
  }));
}
