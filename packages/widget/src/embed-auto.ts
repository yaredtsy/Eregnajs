// Self-bootstrapping entry point for the CDN IIFE build.
// Reads data-agent-id (and optional data-api-base, data-debug) from the <script> tag,
// installs window.eregna, then mounts the widget automatically.
//
// With `defer`, document.currentScript is null at run time, so we locate the
// script element by its data-agent-id attribute instead.

import { installGlobal } from "./embed/installGlobal.js";
import { parseScriptDataFlag } from "./embed/parseDataAttr.js";
import { initWidget } from "./embed.js";

// Install window.eregna synchronously so host-page code that runs right after
// the script loads can call registerTool / setState without error.
if (typeof window !== "undefined") {
  installGlobal();
}

function bootstrap() {
  const scriptEl =
    (document.currentScript as HTMLScriptElement | null) ??
    (document.querySelector("script[data-agent-id]") as HTMLScriptElement | null);

  const agentPublicId = scriptEl?.dataset.agentId ?? "";
  const apiBase = scriptEl?.dataset.apiBase ?? "";
  const debug = parseScriptDataFlag(scriptEl?.dataset.debug);

  if (!agentPublicId) {
    console.warn("[eregna] embed.iife.js: missing data-agent-id attribute");
    return;
  }

  initWidget({ agentPublicId, apiBase: apiBase || undefined, debug });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
} else {
  bootstrap();
}
