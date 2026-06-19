import type {
  ClientToolSpec,
  ClientToolWireDescriptor,
  RegisteredClientTool,
} from "./types.js";

const registry = new Map<string, RegisteredClientTool>();

export function registerClientTool(spec: ClientToolSpec): () => void {
  const entry: RegisteredClientTool = { ...spec, runsIn: "client" };
  registry.set(spec.name, entry);
  return () => registry.delete(spec.name);
}

export function getClientTool(name: string): RegisteredClientTool | undefined {
  return registry.get(name);
}

export function listClientTools(): RegisteredClientTool[] {
  return Array.from(registry.values());
}

export function getClientToolWireDescriptors(): ClientToolWireDescriptor[] {
  return listClientTools().map(({ name, description, parameters, display }) => ({
    name,
    description,
    parameters,
    runsIn: "client" as const,
    ...(display ? { display } : {}),
  }));
}

export function clearClientTools(): void {
  registry.clear();
}
