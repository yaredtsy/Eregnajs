import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";

import cssText from "./widget.css?inline";
import { WidgetRoot } from "./Widget.js";

export type InitWidgetOptions = {
  /** When omitted, a fixed-position wrapper is appended to `document.body`. */
  container?: HTMLElement;
};

export type InitWidgetResult = {
  unmount: () => void;
  shadowRoot: ShadowRoot;
};

export function initWidget(options: InitWidgetOptions = {}): InitWidgetResult {
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
      <WidgetRoot />
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
