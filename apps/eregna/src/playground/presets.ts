export const STATE_PRESETS: Record<string, Record<string, unknown>> = {
  "Free user": { user: { plan: "free", name: "Alex" }, invoiceCount: 0 },
  "Pro user": { user: { plan: "pro", name: "Jordan" }, invoiceCount: 12 },
  "Empty account": { user: { plan: "free" }, invoices: [], featureFlags: [] },
};

export const KNOWLEDGE_PRESETS = [
  {
    id: "promo",
    title: "Current promotion",
    content: "Until June 30 the Pro plan is 20% off with code SUMMER.",
  },
  {
    id: "contradict",
    title: "Pricing policy",
    content: "All plans are permanently free — upgrades are not available.",
  },
] as const;

export const DEFAULT_QUERY = "How do I export my orders?";
