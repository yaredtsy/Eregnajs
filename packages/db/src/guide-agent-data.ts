/** Shared constants for the dev guide agent (docs/v2/7-guide-agent). */

export const GUIDE_EMAIL = "guide@eregna.dev";
export const GUIDE_PASSWORD_DEFAULT = "guide-dev-password";

export const GUIDE_PUBLIC_ID_DEFAULT = "eregna-guide-dev";
export const GUIDE_ALLOWED_ORIGINS_DEFAULT = ["http://localhost:3000"];

export const GUIDE_AGENT = {
  name: "Eregna Guide",
  description:
    "Dev helper that walks you through the Eregna dashboard. Not shown to end visitors on customer sites.",
  website_url: "http://localhost:3000",
  model: "gpt-4o-mini",
  system_prompt: `You are helping someone use the Eregna dashboard for the first time.

Rules:
- Answer only about this dashboard: creating agents, finding the agents list, opening an agent card.
- Prefer short walkthroughs (3–5 chapters) over long lectures.
- If they already have agents in the grid, mention they can click a card instead of creating another.
- Do not invent features that are not on the page (no billing, no team invites).
- Optional form fields (description, model, system prompt) exist but you may skip them — name and website URL are enough to create an agent.`,
} as const;

export const GUIDE_PAGE = {
  title: "Dashboard",
  url_pattern: "/dashboard",
  description:
    "Agents list in the Eregna app. Users create agents, open cards, and copy embed snippets from each agent's page.",
  sort_order: 0,
  path: "dashboard",
} as const;

export type GuideElementSeed = {
  key: string;
  path: string;
  label: string;
  dom_id: string;
  selectors: Array<{ kind: "dom-id"; value: string }>;
  description: string;
  notes: string;
  sort_order: number;
};

export const GUIDE_ELEMENTS: GuideElementSeed[] = [
  {
    key: "dashboard.hero",
    path: "hero",
    label: "Dashboard hero",
    dom_id: "agents-page-hero",
    selectors: [{ kind: "dom-id", value: "agents-page-hero" }],
    description:
      'Top of the agents page: "Dashboard" label, "Agents" heading, and short subtitle about managing embedded agents.',
    notes: "Always visible after login. Good opening step to orient the user.",
    sort_order: 0,
  },
  {
    key: "dashboard.agents-grid",
    path: "agents_grid",
    label: "Agents grid",
    dom_id: "agents-grid",
    selectors: [{ kind: "dom-id", value: "agents-grid" }],
    description:
      'Area showing agent cards in a grid, or an empty state ("No agents yet") when the user has none.',
    notes: "Clicking a card opens that agent's embed and settings tabs.",
    sort_order: 1,
  },
  {
    key: "dashboard.new-agent-btn",
    path: "new_agent_btn",
    label: "New agent button",
    dom_id: "new-agent-btn",
    selectors: [{ kind: "dom-id", value: "new-agent-btn" }],
    description:
      'Primary button labeled "+ New agent" (or "Cancel" while the form is open). Toggles the create form below the hero.',
    notes:
      "User must click this before the name and URL fields are visible. Plan a step that highlights this before the form fields.",
    sort_order: 2,
  },
  {
    key: "dashboard.agent-name",
    path: "agent_name",
    label: "Agent name field",
    dom_id: "agent-name-field",
    selectors: [{ kind: "dom-id", value: "agent-name-field" }],
    description:
      'Text input for the agent display name (placeholder "Acme Docs Agent"). Required, 2–80 characters.',
    notes:
      "Wrapper around the label and input. Only visible when the create form is open.",
    sort_order: 3,
  },
  {
    key: "dashboard.agent-url",
    path: "agent_url",
    label: "Agent website URL field",
    dom_id: "agent-url-field",
    selectors: [{ kind: "dom-id", value: "agent-url-field" }],
    description:
      "URL input for the customer's website where the widget will be embedded (placeholder https://example.com). Required.",
    notes: "Same visibility rule as the name field — form must be open.",
    sort_order: 4,
  },
  {
    key: "dashboard.create-form",
    path: "create_form",
    label: "Create agent form",
    dom_id: "new-agent-form-section",
    selectors: [{ kind: "dom-id", value: "new-agent-form-section" }],
    description:
      'Card containing the full "New agent" form and the "Create agent" submit button.',
    notes:
      "Use for the final step: highlight the submit button area. Optional fields inside can be skipped.",
    sort_order: 5,
  },
];

export const GUIDE_SITE_FACTS = [
  {
    title: "What is Eregna",
    content:
      "Eregna is an embeddable walkthrough widget: visitors ask questions on a customer's site and the agent highlights real page elements step by step.",
    sort_order: 0,
  },
  {
    title: "After you create an agent",
    content:
      "A new card appears in the agents grid. Click it to get the embed script, settings, and knowledge base tabs.",
    sort_order: 1,
  },
] as const;
