# agent/04 — LLM Providers

We support two providers behind a thin interface:

- **LangChain + OpenAI** (`@langchain/openai`) — default, the easy path.
- **Claude Agent SDK** (`@anthropic-ai/sdk`) — direct, exposes native features like fine-grained tool streaming.

Both implement the same `LlmProvider` interface. The planner and streamer code is provider-agnostic.

```
services/
├── llm/
│   ├── provider.ts            ← the LlmProvider interface
│   ├── langchain-openai.ts    ← OpenAI via LangChain
│   ├── claude-sdk.ts          ← Anthropic via Claude Agent SDK (@anthropic-ai/sdk)
│   └── pickProvider.ts        ← agent.model → provider instance
├── planner.service.ts         ← uses LlmProvider.generatePlan
└── streamer.service.ts        ← uses LlmProvider.streamSteps
```

---

## The provider interface

Small. Two methods. Returns typed data; provider details (tool definitions, streaming bookkeeping) are encapsulated.

```ts
// services/llm/provider.ts
import type { Plan } from '../schemas/plan.schema'
import type { Step } from '../schemas/step.schema'

export interface LlmProvider {
  /** Non-streaming. Returns a validated Plan or throws. */
  generatePlan(input: PlannerInput, signal: AbortSignal): Promise<Plan>

  /** Streaming. Calls `onStep` once per validated Step in order. */
  streamSteps(
    input: StreamerInput,
    onStep: (step: Step) => Promise<void>,
    signal: AbortSignal,
  ): Promise<{ usage: TokenUsage }>
}

export interface PlannerInput {
  systemPrompt: string
  userPrompt: string
  model: string
}

export interface StreamerInput {
  systemPrompt: string
  userPrompt: string
  model: string
  /** Starting stream_index, in case we're resuming */
  startIndex: number
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}
```

---

## Picking a provider

```ts
// services/llm/pickProvider.ts
import { langchainOpenAIProvider } from './langchain-openai'
import { claudeSdkProvider } from './claude-sdk'
import type { LlmProvider } from './provider'

const OPENAI_MODELS    = new Set(['gpt-4o-mini', 'gpt-4o', 'gpt-4.1'])
const ANTHROPIC_MODELS = new Set(['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5'])

export function pickProvider(model: string): LlmProvider {
  if (OPENAI_MODELS.has(model))    return langchainOpenAIProvider
  if (ANTHROPIC_MODELS.has(model)) return claudeSdkProvider
  throw new Error(`Unsupported model: ${model}`)
}
```

The allowlist is validated at agent-create time so an invalid `agent.model` can never reach `pickProvider`.

Both providers receive the model id and pass it to their respective SDK. The interface doesn't care which.

---

## Implementation A — LangChain + OpenAI

`@langchain/openai` calls OpenAI via the Chat Completions API with strict tool schemas. Easy and idiomatic.

```ts
// services/llm/langchain-openai.ts
import { ChatOpenAI } from '@langchain/openai'
import type { AIMessageChunk } from '@langchain/core/messages'
import { PlanSchema } from '../schemas/plan.schema'
import { StepSchema, emitStepToolDef } from '../schemas/step.schema'
import type { LlmProvider } from './provider'

function makeChat(model: string, opts: { streaming?: boolean; temperature?: number }) {
  return new ChatOpenAI({
    apiKey: process.env.EREGNA_OPENAI_API_KEY,
    model,
    temperature: opts.temperature ?? 0.3,
    streaming: opts.streaming ?? false,
    maxRetries: 1,
    timeout: 60_000,
  })
}

export const langchainOpenAIProvider: LlmProvider = {
  async generatePlan({ systemPrompt, userPrompt, model }, signal) {
    const llm = makeChat(model, { temperature: 0.2 })
    const structured = llm.withStructuredOutput(PlanSchema, { name: 'save_plan' })
    return await structured.invoke(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      { signal },
    )
  },

  async streamSteps({ systemPrompt, userPrompt, model, startIndex }, onStep, signal) {
    const llm = makeChat(model, { streaming: true, temperature: 0.5 })
      .bindTools([emitStepToolDef], { tool_choice: 'required' })

    const stream = await llm.stream(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      { signal },
    )

    let usage = { inputTokens: 0, outputTokens: 0 }
    let streamIndex = startIndex

    for await (const chunk of stream as AsyncIterable<AIMessageChunk>) {
      for (const call of chunk.tool_calls ?? []) {
        if (call.name !== 'emit_step' || call.args === undefined) continue
        const parsed = StepSchema.safeParse({ ...call.args, streamIndex })
        if (!parsed.success) continue
        await onStep(parsed.data)
        streamIndex++
      }
      if (chunk.usage_metadata) {
        usage.inputTokens  += chunk.usage_metadata.input_tokens  ?? 0
        usage.outputTokens += chunk.usage_metadata.output_tokens ?? 0
      }
    }
    return { usage }
  },
}
```

`withStructuredOutput` registers a tool with the Plan JSON schema and uses OpenAI's strict mode. `tool_calls` on streamed `AIMessageChunk`s carries finalized calls — that's our emission trigger.

---

## Implementation B — Claude Agent SDK

`@anthropic-ai/sdk` direct. We use:

- **`messages.create(...)` with `tool_choice: { type: 'tool', name: 'save_plan' }`** to force a single structured tool call for the planner.
- **`messages.stream(...)` with `eager_input_streaming: true`** on `emit_step` to observe tool-call starts early and emit the moment a call's input finalizes.

```ts
// services/llm/claude-sdk.ts
import Anthropic from '@anthropic-ai/sdk'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { PlanSchema } from '../schemas/plan.schema'
import { StepSchema } from '../schemas/step.schema'
import type { LlmProvider } from './provider'

const claude = new Anthropic({ apiKey: process.env.EREGNA_ANTHROPIC_API_KEY! })

const SAVE_PLAN_TOOL = {
  name: 'save_plan',
  description: 'Save the walkthrough plan with picked page and step outline.',
  strict: true,
  input_schema: zodToJsonSchema(PlanSchema, { target: 'openApi3' }) as any,
} as const

const EMIT_STEP_TOOL = {
  name: 'emit_step',
  description: 'Emit one walkthrough step. Call once per step, in plan order.',
  strict: true,
  eager_input_streaming: true,
  input_schema: zodToJsonSchema(StepSchema, { target: 'openApi3' }) as any,
} as const

export const claudeSdkProvider: LlmProvider = {
  async generatePlan({ systemPrompt, userPrompt, model }, signal) {
    const res = await claude.messages.create(
      {
        model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        tools: [SAVE_PLAN_TOOL],
        tool_choice: { type: 'tool', name: 'save_plan' },
      },
      { signal },
    )

    const toolUse = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    if (!toolUse) throw new Error('Planner did not call save_plan')
    return PlanSchema.parse(toolUse.input)
  },

  async streamSteps({ systemPrompt, userPrompt, model, startIndex }, onStep, signal) {
    const stream = claude.messages.stream(
      {
        model,
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        tools: [EMIT_STEP_TOOL],
        tool_choice: { type: 'tool', name: 'emit_step' },
      },
      { signal },
    )

    // Accumulate input JSON per content_block_index until content_block_stop fires.
    const pending = new Map<number, string>()
    let usage = { inputTokens: 0, outputTokens: 0 }
    let streamIndex = startIndex

    for await (const event of stream) {
      if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        pending.set(event.index, '')
      }
      if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
        pending.set(event.index, (pending.get(event.index) ?? '') + event.delta.partial_json)
      }
      if (event.type === 'content_block_stop' && pending.has(event.index)) {
        const raw = pending.get(event.index)!
        pending.delete(event.index)
        try {
          const parsed = StepSchema.safeParse({ ...JSON.parse(raw), streamIndex })
          if (parsed.success) {
            await onStep(parsed.data)
            streamIndex++
          }
        } catch { /* skip malformed step */ }
      }
    }

    const final = await stream.finalMessage()
    usage.inputTokens  = final.usage.input_tokens
    usage.outputTokens = final.usage.output_tokens
    return { usage }
  },
}
```

`eager_input_streaming: true` is the key Anthropic feature: each `emit_step` tool call streams its JSON input as `input_json_delta` events. We detect a new call has started (`content_block_start`) and emit the Step as soon as its `content_block_stop` fires — **before** the model has begun the next call. This matches what LangChain's `tool_calls` gives us on the OpenAI side.

`zod-to-json-schema` converts our Zod schema to the JSON Schema Anthropic expects. We use `target: 'openApi3'` because Anthropic's strict mode tracks that subset closely.

---

## Why two implementations instead of LangChain everywhere

LangChain has `@langchain/anthropic` and we could use `ChatAnthropic` to call Claude through the same code path as OpenAI. We're not doing that as the primary Anthropic route. Two reasons:

1. **`eager_input_streaming: true` isn't exposed by LangChain.** It's an Anthropic-specific knob that materially affects perceived latency on the streamer. Going through the SDK gives us access.
2. **Independent escape hatches.** If LangChain has a bug or version mismatch we hit in production, we want a non-LangChain code path for at least one provider.

If neither matters to you, drop `claude-sdk.ts` and use `@langchain/anthropic` instead — the `LlmProvider` interface is the same. The doc above is the reference; the implementation is swappable.

---

## Provider selection at runtime

```ts
// planner.service.ts
const provider = pickProvider(input.agent.model)
const plan = await provider.generatePlan({
  systemPrompt: plannerSystemPrompt(input.agent),
  userPrompt:   plannerUserPrompt(input),
  model:        input.agent.model,
}, signal)
```

The service code knows nothing about LangChain or Anthropic. Adding Gemini, OpenRouter, or a local model is a new file under `services/llm/` and one line in `pickProvider`.

---

## Abort handling

Both providers accept an `AbortSignal` passed through from Hono's request signal (`c.req.raw.signal`). LangChain forwards it to the OpenAI fetch; the Anthropic SDK accepts it as `{ signal }` on every call. A disconnected client stops billing immediately.

---

## Token accounting

Both providers return `{ usage: TokenUsage }` from `streamSteps`. We persist:

```ts
await db.update(walkthroughSessions).set({
  tokenUsage: usage,
  provider:   providerLabel,   // 'openai' | 'anthropic'
}).where(eq(walkthroughSessions.id, session.id))
```

The `provider` column is added so the eval rig and replay tool can correlate quality with provider — not just with model name.

---

## What's identical across providers

- System + user prompts (`05-prompts.md`).
- Plan and Step schemas (`03-plan-json-schema.md`, `engine/01-action-schema.md`).
- SSE event protocol (`api/02-streaming-protocol.md`).
- Persistence (`walkthrough_sessions`, `walkthrough_steps`).

What changes when you switch providers is **per-token cost**, **strictness of tool-input enforcement**, and **streaming feel** (Anthropic's eager streaming is noticeably more responsive on long streams). Quality differences exist but are small for this task and are tracked in the eval rig.

---

## Choosing per-agent

The dashboard's agent-settings page exposes a model picker:

```
Model (provider)
  ◯ GPT-4o mini       (OpenAI · fastest, cheapest)
  ◉ GPT-4o            (OpenAI · default, balanced)
  ◯ GPT-4.1           (OpenAI · highest quality)
  ◯ Claude Haiku 4.5  (Anthropic · fast, cheap)
  ◯ Claude Sonnet 4.6 (Anthropic · balanced)
  ◯ Claude Opus 4.7   (Anthropic · highest quality)
```

Customers can switch any time. Existing sessions are unaffected; the next session uses the new model. We surface the provider in the dashboard's session log so customers can see which model produced which walkthrough.

---

## What's not in this doc

- Exact prompt text — `05-prompts.md`.
- What context (page snapshot, branch history) goes into prompts — `06-context-strategy.md`.
- How we evolve schema/prompts safely — `07-iteration-workflow.md`.
