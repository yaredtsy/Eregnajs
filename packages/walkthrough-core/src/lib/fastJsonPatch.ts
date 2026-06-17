// fast-json-patch is CJS; Vite SSR and some bundlers reject named ESM imports.
// Import once here and re-export — all app code should use this module.
import jsonPatch from "fast-json-patch";

export const applyOperation = jsonPatch.applyOperation;
export const observe = jsonPatch.observe;
export const generate = jsonPatch.generate;

export type { Operation, Observer } from "fast-json-patch";
