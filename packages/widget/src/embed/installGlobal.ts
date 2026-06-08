import { createHostApi } from "./host-api.impl.js";
import type { HostApi } from "./host-api.js";

declare global {
  interface Window {
    eregna: HostApi;
  }
}

export function installGlobal(): HostApi {
  if (typeof window === "undefined") {
    throw new Error("installGlobal must be called in a browser context");
  }
  if (window.eregna) return window.eregna;
  const api = createHostApi();
  window.eregna = api;
  return api;
}
