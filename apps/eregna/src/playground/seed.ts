import { api } from "#/lib/api";
import type { CreateElementBody } from "#/lib/api-types";

export const PLAYGROUND_URL_PATTERN = "*/playground";
export const PLAYGROUND_PAGE_TITLE = "Playground";

type SeedElement = Omit<CreateElementBody, "page_id">;

export const PLAYGROUND_ELEMENTS: SeedElement[] = [
  {
    label: "Hero",
    key: "home.hero",
    dom_id: "pg-hero",
    selectors: [{ kind: "dom-id", value: "pg-hero" }],
    description: "Main hero section — happy-path control",
    sort_order: 0,
  },
  {
    label: "Orders table",
    key: "orders.table",
    dom_id: "pg-orders-table",
    selectors: [{ kind: "dom-id", value: "pg-orders-table" }],
    description: "Selectable orders grid; use table_summary or table_sum_column read tools for live data",
    sort_order: 1,
  },
  {
    label: "Export button",
    key: "orders.export-btn",
    dom_id: "pg-export-btn",
    selectors: [{ kind: "dom-id", value: "pg-export-btn" }],
    description: "Exports selected order — disabled until a row is selected in the orders table",
    sort_order: 2,
  },
  {
    label: "Details section",
    key: "home.details",
    dom_id: "pg-details",
    selectors: [{ kind: "dom-id", value: "pg-details" }],
    description: "Long-scroll section ~3 viewports down",
    sort_order: 3,
  },
  {
    label: "Tab panel B",
    key: "tabs.panel-b",
    dom_id: "pg-tab-b",
    selectors: [{ kind: "dom-id", value: "pg-tab-b" }],
    description: "Hidden until the B tab is active — use switchTab tool",
    sort_order: 4,
  },
  {
    label: "Upgrade CTA",
    key: "dialog.upgrade-cta",
    dom_id: "pg-upgrade-cta",
    selectors: [{ kind: "dom-id", value: "pg-upgrade-cta" }],
    description: "Only visible after openPricingDialog tool runs",
    sort_order: 5,
  },
  {
    label: "Email input",
    key: "form.email-input",
    dom_id: "pg-email",
    selectors: [{ kind: "dom-id", value: "pg-email" }],
    description: "Form email field with validation",
    sort_order: 6,
  },
  {
    label: "Submit button",
    key: "form.submit",
    dom_id: "pg-submit",
    selectors: [{ kind: "dom-id", value: "pg-submit" }],
    description: "Form submit — shows error on invalid email",
    sort_order: 7,
  },
  {
    label: "Usage table",
    key: "usage.table",
    dom_id: "pg-usage-table",
    selectors: [{ kind: "dom-id", value: "pg-usage-table" }],
    description: "Loads asynchronously ~2s after mount",
    sort_order: 8,
  },
  {
    label: "Promo banner",
    key: "promo.banner",
    dom_id: "pg-promo-banner",
    selectors: [{ kind: "dom-id", value: "pg-promo-banner" }],
    description: "Removes itself after 5 seconds — not-found path test",
    sort_order: 9,
  },
  {
    label: "Ghost button",
    key: "ghost.button",
    selectors: [{ kind: "dom-id", value: "pg-ghost-never" }],
    description: "Registered in KB but never rendered on the page",
    sort_order: 10,
  },
  {
    label: "Twin action",
    key: "twins.action",
    css_selector: ".pg-twin-btn",
    selectors: [{ kind: "css", value: ".pg-twin-btn" }],
    description: "CSS selector matches two nodes — ambiguity test",
    sort_order: 11,
  },
  {
    label: "CSS-only card",
    key: "card.css-only",
    css_selector: ".pg-css-card",
    selectors: [{ kind: "css", value: ".pg-css-card" }],
    description: "No dom id — css selector only",
    sort_order: 12,
  },
];

export async function ensurePlaygroundSeed(agentId: string): Promise<string> {
  const pages = await api.get<Array<{ id: string; title: string; url_pattern: string | null }>>(
    `/v1/pages?agentId=${encodeURIComponent(agentId)}`,
  );

  let page = pages.find((p) => p.title === PLAYGROUND_PAGE_TITLE);
  if (!page) {
    const created = await api.post<{ id: string; title: string; url_pattern: string | null }>(
      "/v1/pages",
      {
        agent_id: agentId,
        title: PLAYGROUND_PAGE_TITLE,
        url_pattern: PLAYGROUND_URL_PATTERN,
        description: "Fake host page for integration testing",
        sort_order: 999,
      },
    );
    page = created;
  }

  const pageId = page.id;
  const existing = await api.get<Array<{ key: string }>>(
    `/v1/elements?pageId=${encodeURIComponent(pageId)}`,
  );
  const have = new Set(existing.map((e) => e.key));

  for (const el of PLAYGROUND_ELEMENTS) {
    if (have.has(el.key ?? "")) continue;
    await api.post("/v1/elements", { page_id: pageId, ...el });
  }

  return pageId;
}
