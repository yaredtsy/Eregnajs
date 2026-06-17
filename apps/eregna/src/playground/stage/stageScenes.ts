export type StageSceneId =
  | "hero"
  | "orders"
  | "details"
  | "tabs"
  | "dialog"
  | "form"
  | "usage"
  | "promo"
  | "ghost"
  | "twins"
  | "css-card";

export interface StageScene {
  id: StageSceneId;
  title: string;
  keys: string[];
  exercise: string;
  hint?: string;
}

export const STAGE_SCENES: StageScene[] = [
  {
    id: "hero",
    title: "Hero",
    keys: ["home.hero"],
    exercise: "Happy path — scroll, highlight, narrate",
  },
  {
    id: "orders",
    title: "Orders + export",
    keys: ["orders.table", "orders.export-btn"],
    exercise: "Select a row, then export. Export stays disabled until selection.",
    hint: "Try table_summary / table_sum_column tools",
  },
  {
    id: "details",
    title: "Long scroll",
    keys: ["home.details"],
    exercise: "Target sits far below the fold — scroll-into-view test",
  },
  {
    id: "tabs",
    title: "Tabs",
    keys: ["tabs.panel-b"],
    exercise: "Panel B is hidden until tab B is active — use switchTab tool",
  },
  {
    id: "dialog",
    title: "Pricing dialog",
    keys: ["dialog.upgrade-cta"],
    exercise: "CTA only exists after openPricingDialog runs",
    hint: "Enable the tool in the Tools panel, then ask or call it",
  },
  {
    id: "form",
    title: "Form",
    keys: ["form.email-input", "form.submit"],
    exercise: "Invalid email shows validation error — try prefillForm",
  },
  {
    id: "usage",
    title: "Async table",
    keys: ["usage.table"],
    exercise: "Table rows load ~2s after opening this scene",
  },
  {
    id: "promo",
    title: "Vanishing banner",
    keys: ["promo.banner"],
    exercise: "Banner removes itself after 5 seconds — not-found path",
    hint: "Re-open this scene to reset the timer",
  },
  {
    id: "ghost",
    title: "Ghost (KB only)",
    keys: ["ghost.button"],
    exercise: "Registered in knowledge but never rendered — not-found chapter",
  },
  {
    id: "twins",
    title: "Twin buttons",
    keys: ["twins.action"],
    exercise: "One CSS selector matches two nodes — ambiguity handling",
  },
  {
    id: "css-card",
    title: "CSS-only card",
    keys: ["card.css-only"],
    exercise: "No dom id — resolver uses css selector only",
  },
];

export function sceneById(id: StageSceneId): StageScene {
  return STAGE_SCENES.find((s) => s.id === id) ?? STAGE_SCENES[0]!;
}
