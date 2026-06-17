import type { ElementManifest, SelectorQuery } from "../types/conversation";

// ---------------------------------------------------------------------------
// Active manifest — the key→selector map of the walkthrough being played.
// Set by the widget when a walkthrough activates; read by the engine, the
// overlay's rect hook, and __debugResolve. (docs/v2/2-system/02 §4)
// ---------------------------------------------------------------------------

let activeManifest: ElementManifest | null = null;

export function setActiveManifest(manifest: ElementManifest | null): void {
  activeManifest = manifest;
}

export function getActiveManifest(): ElementManifest | null {
  return activeManifest;
}

// ---------------------------------------------------------------------------
// Selector strategies
// ---------------------------------------------------------------------------

// Usable = attached, not hidden, and occupying space.
export function isUsable(el: Element): boolean {
  if (!el.isConnected) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

function normalizeText(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

// Visible-text match: smallest (innermost) usable element whose text contains
// the value — innermost wins so "Export" matches the button, not <body>.
function byText(value: string, tag?: string): Element | null {
  const needle = normalizeText(value);
  if (!needle) return null;
  const candidates = document.querySelectorAll(tag ?? "*");
  let best: Element | null = null;
  let bestLength = Infinity;
  for (const el of candidates) {
    const text = normalizeText(el.textContent ?? "");
    if (!text.includes(needle)) continue;
    if (text.length < bestLength && isUsable(el)) {
      best = el;
      bestLength = text.length;
    }
  }
  return best;
}

export interface Resolution {
  element: Element;
  ambiguous: boolean; // css matched more than one node; first usable in doc order won
}

export function trySelector(sel: SelectorQuery): Resolution | null {
  switch (sel.kind) {
    case "dom-id": {
      const el = document.getElementById(sel.value);
      return el && isUsable(el) ? { element: el, ambiguous: false } : null;
    }
    case "css": {
      let matches: NodeListOf<Element>;
      try {
        matches = document.querySelectorAll(sel.value);
      } catch {
        return null; // malformed selector from the KB — never throw at play time
      }
      for (const el of matches) {
        if (isUsable(el)) return { element: el, ambiguous: matches.length > 1 };
      }
      return null;
    }
    case "text": {
      const el = byText(sel.value, sel.tag);
      return el ? { element: el, ambiguous: false } : null;
    }
  }
}

// ---------------------------------------------------------------------------
// Key resolution through the manifest
// ---------------------------------------------------------------------------

export function resolveKey(key: string): Resolution | null {
  const entry = activeManifest?.[key];
  if (entry) {
    for (const sel of entry.selectors) {
      const hit = trySelector(sel);
      if (hit) return hit;
    }
    return null;
  }
  // No manifest entry (pre-manifest runs, the sample fixture's plain ids):
  // the key itself is its best selector guess.
  const el = document.getElementById(key);
  return el && isUsable(el) ? { element: el, ambiguous: false } : null;
}

// The retry ladder (docs/v2/4-client/03 §2): components legitimately appear
// late — lazy renders, the dialog a previous tool call just opened. Re-resolve
// on DOM mutations (debounced) with an interval backstop, bounded at 3s.
const LADDER_TIMEOUT_MS = 3_000;

export async function resolveKeyWithRetry(
  key: string,
  timeoutMs: number = LADDER_TIMEOUT_MS,
): Promise<Resolution | null> {
  const immediate = resolveKey(key);
  if (immediate) return immediate;

  return new Promise((resolve) => {
    let settled = false;

    const retry = () => {
      const hit = resolveKey(key);
      if (hit) finish(hit);
    };

    let pending = false;
    const observer = new MutationObserver(() => {
      // Batch mutation bursts into one retry per microtask.
      if (pending) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
        retry();
      });
    });

    const interval = setInterval(retry, 250);
    const deadline = setTimeout(() => finish(null), timeoutMs);

    function finish(result: Resolution | null) {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearInterval(interval);
      clearTimeout(deadline);
      resolve(result);
    }

    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  });
}

// ---------------------------------------------------------------------------
// Back-compat + debug
// ---------------------------------------------------------------------------

export async function resolveElementWithRetry(key: string): Promise<Element | null> {
  const hit = await resolveKeyWithRetry(key);
  return hit?.element ?? null;
}

// Console helper for customers tuning selectors (docs/v2/4-client/04 §3):
// resolves a key (or a raw selector query) and flashes the match.
export function debugResolve(keyOrQuery: string | SelectorQuery): Element | null {
  const hit = typeof keyOrQuery === "string" ? resolveKey(keyOrQuery) : trySelector(keyOrQuery);
  if (!hit) {
    console.warn("[eregna] __debugResolve: no usable element for", keyOrQuery);
    return null;
  }
  const el = hit.element as HTMLElement;
  console.info("[eregna] __debugResolve →", el, hit.ambiguous ? "(ambiguous match)" : "");
  const prev = el.style.outline;
  el.style.outline = "3px solid #f43f5e";
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => { el.style.outline = prev; }, 2_500);
  return el;
}
