# tutorial/11 — Prompt composition

Files:

```
apps/api/src/services/agent/prompts/
  ├── compose.ts
  ├── types.ts
  └── sections/
      ├── rules.ts
      ├── customerOverlay.ts
      ├── pageContext.ts
      ├── elementsTree.ts
      ├── hostStateBlock.ts
      ├── hostToolsBlock.ts
      └── knowledgeBlock.ts
```

The system prompt is **built from sections**. Each section is a small object that reads from `AgentContext` and returns a string. `composeSystemPrompt(ctx)` joins them with blank lines.

## The `PromptSection` type

```ts
// prompts/types.ts
export interface PromptSection {
  name: string
  render(ctx: AgentContext): string
}
```

Two fields. `name` is for logging and the inspector. `render(ctx)` returns the section text — or `""` to skip it.

## The default section list

```ts
// prompts/compose.ts
const DEFAULT_SECTIONS: PromptSection[] = [
  rulesSection,
  customerOverlaySection,
  pageContextSection,
  elementsTreeSection,
  knowledgeSection,
  hostStateSection,
  hostToolsSection,
]
```

Order matters because LLMs weight earlier instructions more. We put rules first, then page-level facts, then per-call data.

| # | Section | What it adds |
|---|---|---|
| 1 | `rules` | The non-negotiables: "only reference elements that exist", "never invent IDs", "plain language". |
| 2 | `customerOverlay` | A free-text block the dashboard owner writes per agent. The owner's voice. |
| 3 | `pageContext` | Page URL, title, type, and other row-level facts. |
| 4 | `elementsTree` | A serialised tree of indexed page elements (the ones the agent is allowed to point at). |
| 5 | `knowledge` | Dashboard "site facts" + page-injected knowledge entries. Tagged by source. |
| 6 | `hostState` | Whatever the page passed as `hostState` (current user, route, feature flags). |
| 7 | `hostTools` | Names + descriptions of registered tools so the model knows what is available. (LangChain also binds them as actual tool schemas.) |

## The compose function

```ts
export function composeSystemPrompt(ctx, sections = DEFAULT_SECTIONS): string {
  return sections.map((s) => s.render(ctx)).filter(Boolean).join("\n\n")
}
```

That is it. No templating engine. No partials. Each section is plain TypeScript and has full access to `ctx`.

## The rules section, in full

```ts
export const rulesSection: PromptSection = {
  name: "rules",
  render: () => `
## Rules
- You are a guided walkthrough agent. Your job is to help visitors navigate the host page.
- Only reference elements that exist in the provided element tree.
- Never invent element IDs or DOM selectors.
- Keep walkthrough steps concise and action-focused.
- Use plain language; avoid jargon unless the user's question uses it.
- Never fetch or scrape external URLs. All context is provided to you.
`.trim(),
}
```

Short and direct. The other sections follow the same style — a header in `##` markdown and a few bullets.

## The inspector

```ts
export function inspectPrompt(ctx, sections = DEFAULT_SECTIONS) {
  // returns { prompt, sections: PromptSectionInfo[], charCount, tokenEstimate }
}
```

Useful for the debug page: render every section, report its character count, and estimate tokens (`util/budget.ts` uses chars / 4 as a rough estimate). Lets you see which section is blowing up the prompt before a model call.

## How the prompt reaches the model

```ts
return createAgent({
  model,
  tools,
  systemPrompt: composeSystemPrompt(ctx),
  middleware,
  checkpointer: getCheckpointer(),
})
```

`createAgent` puts the string into a `SystemMessage` and prepends it to the conversation on every model call. The system prompt is the same for every turn within a run.

The **user turn** for "answer this question" is added separately by `buildChatAgentMessages`. That separation keeps the system prompt static (cacheable, comparable across runs) and the user turn focused on the current question.

## Adding a section

1. Create `prompts/sections/yourSection.ts`:
   ```ts
   export const yourSection: PromptSection = {
     name: "your-section",
     render: (ctx) => {
       if (!ctx.something) return ""    // return empty to skip
       return `## Your Section\n${ctx.something}`
     },
   }
   ```
2. Add it to `DEFAULT_SECTIONS` in `compose.ts` at the right spot in the order.
3. Done. The prompt now includes it on the next run.

You do not have to update tests for unrelated sections — `composeSystemPrompt` only joins what is given.

## When to NOT use a section

If the thing you want to tell the model is **specific to one user turn** (like the visitor's question or an explicit instruction for this turn), put it in `buildChatAgentMessages` instead. The system prompt is for facts that hold for the whole run.

Next: [the full pause / resume flow →](12-pause-resume.md)
