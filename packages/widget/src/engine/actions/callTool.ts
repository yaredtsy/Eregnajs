import { getTool } from "../../embed/hostTools.js";

export async function callTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<"ok" | "unknown-tool"> {
  const tool = getTool(toolName);
  if (!tool) return "unknown-tool";
  await Promise.resolve(tool.run(args));
  return "ok";
}
