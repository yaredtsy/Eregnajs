import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";

import cssText from "./widget.css?inline";
import { WidgetRoot } from "./Widget";
import { installGlobal } from "./embed/installGlobal.js";
import { applyWidgetInit, type WidgetInitOptions } from "./api/init.js";

// Install window.eregna synchronously so host-page scripts that run before
// the widget mounts can call setState / registerTool without error.
if (typeof window !== "undefined") {
  installGlobal();
}

export type InitWidgetOptions = WidgetInitOptions & {
  /** When omitted, a fixed-position wrapper is appended to `document.body`. */
  container?: HTMLElement;
  apiBase?: string;
  agentPublicId?: string;
};

export type InitWidgetResult = {
  unmount: () => void;
  shadowRoot: ShadowRoot;
};

export function initWidget(options: InitWidgetOptions = {}): InitWidgetResult {
  applyWidgetInit(options);

  const host =
    options.container ??
    (() => {
      const el = document.createElement("div");
      el.id = "eregna-widget-host";
      Object.assign(el.style, {
        position: "fixed",
        bottom: "0",
        right: "0",
        pointerEvents: "none",
        zIndex: "2147483647",
      } as CSSStyleDeclaration);
      document.body.appendChild(el);
      return el;
    })();

  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = cssText;
  shadow.appendChild(style);

  const mount = document.createElement("div");
  mount.className = "eregna-widget-mount";
  Object.assign(mount.style, {
    pointerEvents: "none",
  } as CSSStyleDeclaration);
  shadow.appendChild(mount);

  let root: Root | undefined;
  root = createRoot(mount);
  root.render(
    <StrictMode>
      <WidgetRoot
        apiBase={options.apiBase}
        agentPublicId={options.agentPublicId}
      />
    </StrictMode>,
  );

  return {
    unmount() {
      root?.unmount();
      root = undefined;
      if (!options.container && host.parentNode) {
        host.parentNode.removeChild(host);
      }
    },
    shadowRoot: shadow,
  };
}
