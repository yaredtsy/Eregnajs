# 9.3 — Tool descriptor v2

> The shape every tool takes. **Client tools are the focus**; server
> tools exist in the type union as a placeholder so the design doesn't
> break when we wire them up later.

---

## The descriptor, in one piece

```ts
export type ToolKind = "client" | "server";   // "server" is a placeholder for now

export interface ToolDescriptor<Args = unknown, Result = unknown> {
  /** Stable identifier the model sees. snake_case or camelCase, ≤ 40 chars. */
  name: string;

  /** One sentence the model uses to decide WHEN to call this tool. */
  description: string;

  /** JSON Schema for the args object. Every property carries a description (see below). */
  parameters: JSONSchema;

  /** Where the body runs. Default "client" while server is stubbed. */
  runsIn: ToolKind;

  /** Client only — the JS function the widget runs. Required when runsIn === "client". */
  handler?: (args: Args) => Promise<Result> | Result;

  /** Optional UI hint for the tool-call card (chapter 07). */
  display?: {
    icon?: string;          // emoji or icon name
    label?: string;         // shown on the card; falls back to name
    showArgs?: boolean;     // default true
    showResult?: boolean;   // default true
  };
}
```

Two design choices worth noting:

- **`runsIn` is part of the spec, not inferred.** The host says
  explicitly which side runs the tool. Implicit ("if `handler` is
  present, it's client") is too easy to misread.
- **`parameters` is JSON Schema.** Zod is fine for the developer-facing
  surface (we'll convert), but the wire format is JSON Schema so the
  host can declare tools from any framework.

---

## Every parameter field MUST carry a description

This is non-negotiable for LLM tool-calling quality. The model picks
values for each arg using its `description`. A field without a
description means the model guesses.

```ts
// ❌ Bad — no descriptions
parameters: {
  type: "object",
  properties: {
    productId: { type: "string" },
    quantity:  { type: "integer" },
  },
  required: ["productId"],
}

// ✅ Good — every field tells the model what it is
parameters: {
  type: "object",
  properties: {
    productId: {
      type: "string",
      description: "The product's stable ID (e.g. \"sku-blue-mug-12\"). Get it from the visible product card on the page.",
    },
    quantity: {
      type: "integer",
      description: "How many units to add. Default 1 if the visitor didn't say.",
      minimum: 1,
      default: 1,
    },
  },
  required: ["productId"],
  additionalProperties: false,
}
```

Three rules of thumb:

1. **Field description ≠ field name.** Don't write `productId: "the product id"`. Tell the model *where the value comes from* (page state? a visible card? the user's question?).
2. **Examples in descriptions are gold.** `"sku-blue-mug-12"` shape hint > "stable ID".
3. **State defaults explicitly.** A missing `quantity` is ambiguous; `default: 1` (in schema) plus a sentence in the description ("Default 1 if the visitor didn't say.") removes the ambiguity.

The top-level tool `description` answers *when*; the per-field
descriptions answer *what value goes here*.

---

## Where each tool's pieces live

```
                      ToolDescriptor
                            │
        ┌───────────────────┴────────────────────┐
        ▼                                        ▼
    runsIn: "client"                       runsIn: "server"  ◄── placeholder
        │                                        │
        ▼                                        ▼
    declared by host page                  name + description + params
    name + description + params            declared by host, body added later
    handler in initWidget({...})           ── not wired in this design pass ──
        │
        ▼
    widget.clientTools.registry
    (host-owned, per page load)
```

The right column stays in the type union and in `bindTools` so the
model can be told about a server tool *name*, but execution is a
stub: chapter 04 routes server calls to a no-op handler that returns
`{ ok: false, error: "server-tools-not-wired-yet" }` for now.

---

## Host declaration (the only path that runs today)

```ts
initWidget({
  agentPublicId: "abc",
  state: { user: "alice", cartCount: 0 },
  knowledge: [
    { title: "Returns", content: "30-day window, original packaging." },
  ],
  tools: [
    {
      name: "addToCart",
      description:
        "Add a product to the visitor's cart. Use when the visitor asks to buy, add, or get a specific product.",
      parameters: {
        type: "object",
        properties: {
          productId: {
            type: "string",
            description:
              "Stable product ID (e.g. \"sku-blue-mug-12\"). Take it from the product card the visitor is looking at.",
          },
          quantity: {
            type: "integer",
            description: "How many units. Default 1 if not specified.",
            minimum: 1,
            default: 1,
          },
        },
        required: ["productId"],
        additionalProperties: false,
      },
      runsIn: "client",
      handler: async ({ productId, quantity = 1 }) => {
        const res = await fetch("/api/cart", {
          method: "POST",
          body: JSON.stringify({ productId, quantity }),
        });
        if (!res.ok) throw new Error(`cart failed: ${res.status}`);
        return await res.json();   // returned to the model
      },
      display: { icon: "🛒", label: "Add to cart" },
    },
  ],
});
```

The widget keeps a registry keyed by `name`:

```ts
Map<string, { spec: ToolDescriptor; handler: (args) => Promise<unknown> }>
```

---

## What gets sent to the server

Only the spec — never the handler:

```jsonc
// POST /agent/run
{
  "agentPublicId": "abc",
  "query": "add the blue mug to my cart",
  "context": {
    "state":     { "user": "alice", "cartCount": 0 },
    "knowledge": [ { "title": "Returns", "content": "..." } ],
    "tools": [
      {
        "name": "addToCart",
        "description": "Add a product to the visitor's cart...",
        "parameters": { /* full JSON Schema with per-field descriptions */ },
        "runsIn": "client",
        "display": { "icon": "🛒", "label": "Add to cart" }
      }
    ]
  }
}
```

Wire shape is `Omit<ToolDescriptor, "handler">`.

---

## What the server does on receive (minimal version)

```
   incoming tools[]
        │
        ▼
   for each:
     - parameters is valid JSON Schema?            (sanity)
     - every property has a `description` string?  (quality gate)
     - name ≤ 40 chars, no whitespace?
        │
        ▼
   surviving list → bindTools(modelWithTools)
```

That's it for now. No per-agent allow-list yet — placeholder for when
we cross the server-tool work. The quality gate ("every property has
a description") is the one rule worth enforcing today so bad specs
don't reach the model.

---

## How tools meet the model

```ts
import { tool } from "@langchain/core/tools";
import { jsonSchemaToZod } from "...";   // small helper

const langchainTools = validated.map((t) =>
  tool(
    async () => {
      throw new Error("body provided by node");  // never called directly
    },
    {
      name: t.name,
      description: t.description,
      schema: jsonSchemaToZod(t.parameters),
    },
  ),
);

const modelWithTools = chatModel.bindTools(langchainTools);
```

The body on each `tool()` is a stub. Our own `chatNode` inspects the
returned `tool_calls` field and routes — for `runsIn === "client"`,
that means `interrupt()` (chapter 04).

---

## Versioning and growth (named, not built)

| Future thing | Effect on this format |
|---|---|
| Server-tool execution | Wire the placeholder branch; no descriptor change |
| Streaming tool results | Add optional `streaming: true`; server emits incremental events |
| Long-running client tools | Already handled — the widget can take its time |
| Per-agent allow-list | Adds a server-side filter step; descriptor unchanged |
| Per-call result schema | Add optional `returns: JSONSchema`; surfaced in cards |

The descriptor is additive. Today's fields stay; tomorrow's fields are
optional.

---

## Anti-patterns to avoid

- **Don't ship a tool with un-described params.** The validation gate
  exists so this fails loudly.
- **Don't `eval()` client handlers from a string.** Handlers are *real
  JS functions* passed at `initWidget({...})` time. Strings on the
  wire would invite injection.
- **Don't mix `runsIn` for one name.** A tool is either client or
  server for its lifetime.
- **Don't put PII in any description.** Descriptions ship to the model
  and to logs.

---

## Cross-references

- `02-architecture.md` — where the widget registry lives
- `04-execution-model.md` — how `runsIn: "client"` actually runs
- `05-chat-loop.md` — the routing uses `runsIn`
