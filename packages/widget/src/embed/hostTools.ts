export interface ToolSpec {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
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
