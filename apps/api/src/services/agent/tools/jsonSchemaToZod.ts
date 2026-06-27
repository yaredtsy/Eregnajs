import { z, type ZodTypeAny } from "zod";
import type { JSONSchema } from "./types.js";

function schemaForProperty(prop: JSONSchema, path: string): ZodTypeAny {
  const types = prop.type ? [prop.type] : ["string", "number", "integer", "boolean", "array", "object"];

  let schema: ZodTypeAny;
  if (types.includes("object") && prop.properties) {
    schema = jsonSchemaToZod(prop, path);
  } else if (types.includes("array") && prop.items) {
    schema = z.array(schemaForProperty(prop.items, `${path}[]`));
  } else if (types.includes("integer") || types.includes("number")) {
    let num = z.number();
    if (typeof prop.minimum === "number") num = num.min(prop.minimum);
    if (typeof prop.maximum === "number") num = num.max(prop.maximum);
    schema = types.includes("integer") ? num.int() : num;
  } else if (types.includes("boolean")) {
    schema = z.boolean();
  } else {
    schema = z.string();
  }

  if (prop.enum?.length) {
    schema = z.enum(prop.enum.map(String) as [string, ...string[]]);
  }

  if (prop.default !== undefined) {
    schema = schema.default(prop.default as never);
  }

  return schema;
}

/** Convert a JSON Schema object to a Zod schema for LangChain tool binding. */
export function jsonSchemaToZod(
  schema: JSONSchema,
  path = "parameters",
): z.ZodObject<z.ZodRawShape, z.UnknownKeysParam> {
  if (schema.type && schema.type !== "object") {
    throw new Error(`${path}: root schema must be type "object"`);
  }

  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const shape: z.ZodRawShape = {};

  for (const [key, prop] of Object.entries(properties)) {
    const fieldPath = `${path}.${key}`;
    let field = schemaForProperty(prop, fieldPath);
    if (!required.has(key)) {
      field = field.optional();
    }
    shape[key] = field;
  }

  const obj = z.object(shape);
  return schema.additionalProperties === false ? obj.strict() : obj;
}
