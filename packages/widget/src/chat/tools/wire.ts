import { getClientToolWireDescriptors } from "./registry.js";
import { getToolDescriptors } from "../../embed/hostTools.js";

/** Client-tool wire descriptors plus legacy host tools (client wins on name clash). */
export function getMergedWireToolDescriptors() {
  const client = getClientToolWireDescriptors();
  const legacy = getToolDescriptors();
  const names = new Set(client.map((t) => t.name));
  return [...client, ...legacy.filter((t) => !names.has(t.name))];
}
