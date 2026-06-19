export type ToolKind = "client" | "server";

export interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  additionalProperties?: boolean;
  description?: string;
  items?: JSONSchema;
  minimum?: number;
  maximum?: number;
  default?: unknown;
  enum?: unknown[];
  [key: string]: unknown;
}

export interface ToolDescriptor<Args = unknown, Result = unknown> {
  name: string;
  description: string;
  parameters: JSONSchema;
  runsIn: ToolKind;
  handler?: (args: Args) => Promise<Result> | Result;
  display?: {
    icon?: string;
    label?: string;
    showArgs?: boolean;
    showResult?: boolean;
  };
}

/** Wire shape — handler never crosses the network. */
export type WireToolDescriptor = Omit<ToolDescriptor, "handler">;
