import type { JSONSchema, ToolDescriptor, ToolKind, WireToolDescriptor } from "./types.js";

export class ToolValidationError extends Error {
  constructor(
    message: string,
    readonly path: string,
  ) {
    super(message);
    this.name = "ToolValidationError";
  }
}

const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const MAX_NAME_LEN = 40;
const VALID_RUNS_IN = new Set<ToolKind>(["client", "server"]);

function assertPropertyDescriptions(schema: JSONSchema, path: string): void {
  const props = schema.properties ?? {};
  for (const [key, prop] of Object.entries(props)) {
    const fieldPath = `${path}.${key}`;
    if (!prop.description || typeof prop.description !== "string" || !prop.description.trim()) {
      throw new ToolValidationError(`missing description`, fieldPath);
    }
    if (prop.type === "object" || prop.properties) {
      assertPropertyDescriptions(prop, fieldPath);
    }
    if (prop.type === "array" && prop.items?.properties) {
      assertPropertyDescriptions(prop.items, `${fieldPath}[]`);
    }
  }
}

function assertJsonSchema(schema: JSONSchema, path: string): void {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    throw new ToolValidationError(`must be a JSON Schema object`, path);
  }
  if (schema.type !== "object") {
    throw new ToolValidationError(`root type must be "object"`, path);
  }
  if (!schema.properties || typeof schema.properties !== "object") {
    throw new ToolValidationError(`must define properties`, path);
  }
  assertPropertyDescriptions(schema, path);
}

function validateOne(raw: WireToolDescriptor, index: number): ToolDescriptor {
  const base = `tools[${index}]`;

  if (!raw.name || typeof raw.name !== "string") {
    throw new ToolValidationError(`name is required`, `${base}.name`);
  }
  if (raw.name.length > MAX_NAME_LEN) {
    throw new ToolValidationError(`name must be ≤ ${MAX_NAME_LEN} chars`, `${base}.name`);
  }
  if (!NAME_RE.test(raw.name) || /\s/.test(raw.name)) {
    throw new ToolValidationError(`name must be alphanumeric/underscore`, `${base}.name`);
  }

  if (!raw.description || typeof raw.description !== "string" || !raw.description.trim()) {
    throw new ToolValidationError(`description is required`, `${base}.description`);
  }

  const runsIn = raw.runsIn ?? "client";
  if (!VALID_RUNS_IN.has(runsIn)) {
    throw new ToolValidationError(`runsIn must be "client" or "server"`, `${base}.runsIn`);
  }

  assertJsonSchema(raw.parameters, `${base}.parameters`);

  return {
    name: raw.name,
    description: raw.description.trim(),
    parameters: raw.parameters,
    runsIn,
    display: raw.display,
  };
}

/** Validate host-declared tools. Throws ToolValidationError on failure. */
export function validateTools(tools: WireToolDescriptor[]): ToolDescriptor[] {
  const seen = new Set<string>();
  return tools.map((t, i) => {
    const validated = validateOne(t, i);
    if (seen.has(validated.name)) {
      throw new ToolValidationError(`duplicate tool name`, `tools[${i}].name`);
    }
    seen.add(validated.name);
    return validated;
  });
}
