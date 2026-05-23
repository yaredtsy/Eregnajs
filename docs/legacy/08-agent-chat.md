# 08 — Agent Chat (MVP)

This document covers the MVP chat pipeline: how a visitor message becomes a streamed LLM response using the agent's knowledge base.

The full LangGraph multi-node agent is Phase 2. For Phase 1, the pipeline is a **single-pass RAG loop**:

```
User message
    │
    ▼
1. Embed the message        (OpenAI text-embedding-3-small)
    │
    ▼
2. Retrieve top-K elements  (pgvector cosine similarity → match_elements RPC)
    │
    ▼
3. Build prompt             (system prompt + retrieved context + chat history)
    │
    ▼
4. Stream LLM response      (OpenAI chat completions, streaming=true)
    │
    ▼
5. Emit JSON-Patch SSE      (token by token to widget)
    │
    ▼
6. Persist conversation     (insert messages to DB after stream ends)
```

---

## `services/chat.service.ts`

```typescript
import { createServerClient } from '@repo/db'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const db     = createServerClient()

export type SendPatch = (ops: object[]) => Promise<void>

export type ChatInput = {
  publicId:        string
  conversationId:  string | null
  message:         string
  pageUrl:         string
  visitorId?:      string
  sendPatch:       SendPatch
}

export const chatService = {
  async run(input: ChatInput) {
    const { publicId, message, pageUrl, sendPatch } = input

    // ── 0. Resolve agent ───────────────────────────────────────────
    const { data: agent, error: agentErr } = await db
      .from('agents')
      .select('id, model, system_prompt, is_active')
      .eq('public_id', publicId)
      .single()

    if (agentErr || !agent) throw new Error('Agent not found')
    if (!agent.is_active) throw new Error('Agent is inactive')

    // ── 1. Signal "thinking" ───────────────────────────────────────
    await sendPatch([{ op: 'replace', path: '/status', value: 'thinking' }])

    // ── 2. Resolve / create conversation ──────────────────────────
    const conversationId = input.conversationId
      ?? await chatService.createConversation(agent.id, pageUrl, input.visitorId)

    await sendPatch([
      { op: 'replace', path: '/conversation_id', value: conversationId },
    ])

    // ── 3. Load recent history (last 10 turns) ─────────────────────
    const { data: history } = await db
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(10)

    // ── 4. Embed the incoming message ─────────────────────────────
    const { data: embResp } = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: message,
      dimensions: 1536,
    })
    const queryEmbedding = embResp[0].embedding

    // ── 5. Retrieve relevant elements ─────────────────────────────
    const { data: elements } = await db.rpc('match_elements', {
      query_embedding:  queryEmbedding,
      agent_id_filter:  agent.id,
      match_count:      5,
      match_threshold:  0.72,
    })

    // ── 6. Build context block ────────────────────────────────────
    const contextBlock = buildContextBlock(elements ?? [], pageUrl)

    // ── 7. Build messages array for LLM ──────────────────────────
    const systemPrompt = buildSystemPrompt(agent.system_prompt, contextBlock)
    const llmMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...(history ?? []).map(h => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      })),
      { role: 'user', content: message },
    ]

    // ── 8. Stream response ────────────────────────────────────────
    const assistantMsgId = crypto.randomUUID()
    await sendPatch([
      { op: 'add', path: '/messages/-', value: { id: assistantMsgId, role: 'assistant', content: '' } },
      { op: 'replace', path: '/status', value: 'streaming' },
    ])

    const startMs     = Date.now()
    let fullContent   = ''
    let promptTokens  = 0
    let outputTokens  = 0

    const stream = await openai.chat.completions.create({
      model:       agent.model,
      messages:    llmMessages,
      stream:      true,
      max_tokens:  1024,
      temperature: 0.4,
    })

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? ''
      if (delta) {
        fullContent += delta
        await sendPatch([
          { op: 'replace', path: '/messages/0/content', value: fullContent },
        ])
      }
      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens
        outputTokens = chunk.usage.completion_tokens
      }
    }

    // ── 9. Done ───────────────────────────────────────────────────
    await sendPatch([{ op: 'replace', path: '/status', value: 'done' }])

    // ── 10. Persist messages (fire-and-forget) ────────────────────
    const latencyMs = Date.now() - startMs
    const retrievedIds = (elements ?? []).map(e => e.id)
    await chatService.persistMessages({
      conversationId,
      userMessage: message,
      assistantMessage: fullContent,
      model: agent.model,
      retrievedIds,
      promptTokens,
      outputTokens,
      latencyMs,
    })
  },

  // ── Helpers ──────────────────────────────────────────────────────

  async createConversation(agentId: string, pageUrl: string, visitorId?: string) {
    const { data, error } = await db
      .from('conversations')
      .insert({ agent_id: agentId, page_url: pageUrl, visitor_id: visitorId ?? null })
      .select('id')
      .single()
    if (error) throw error
    return data.id
  },

  async persistMessages(opts: {
    conversationId: string
    userMessage: string
    assistantMessage: string
    model: string
    retrievedIds: string[]
    promptTokens: number
    outputTokens: number
    latencyMs: number
  }) {
    await db.from('messages').insert([
      {
        conversation_id: opts.conversationId,
        role: 'user',
        content: opts.userMessage,
      },
      {
        conversation_id: opts.conversationId,
        role: 'assistant',
        content: opts.assistantMessage,
        model: opts.model,
        retrieved_elements: opts.retrievedIds,
        token_usage: {
          prompt_tokens: opts.promptTokens,
          completion_tokens: opts.outputTokens,
        },
        latency_ms: opts.latencyMs,
      },
    ])
  },
}
```

---

## Prompt construction

```typescript
function buildSystemPrompt(customPrompt: string | null, context: string): string {
  const base = customPrompt?.trim() || DEFAULT_SYSTEM_PROMPT
  return `${base}\n\n---\n\n## Relevant page elements\n\n${context}`
}

const DEFAULT_SYSTEM_PROMPT = `\
You are a helpful assistant embedded on a website. 
Your job is to help visitors navigate the site and understand its features.
Answer concisely. If you don't know the answer, say so — do not make things up.
When referring to UI elements, use their labels exactly as provided in the context below.`

function buildContextBlock(
  elements: { label: string; description: string; dom_id: string | null; css_selector: string | null }[],
  pageUrl: string,
): string {
  if (!elements.length) return 'No specific page elements found for this query.'

  const lines = elements.map((e, i) => {
    const selector = e.dom_id ?? e.css_selector ?? 'unknown'
    return `${i + 1}. **${e.label}** (selector: \`${selector}\`)\n   ${e.description}`
  })

  return `Current page: ${pageUrl}\n\n${lines.join('\n\n')}`
}
```

---

## Embedding generation (on element save)

When an element's `description` is created or updated, the API generates and stores its embedding:

```typescript
// services/element.service.ts
import OpenAI from 'openai'
import { createServerClient } from '@repo/db'

const openai = new OpenAI()
const db = createServerClient()

async function upsertEmbedding(elementId: string, text: string) {
  if (!text.trim()) return   // no embedding for empty descriptions

  const { data } = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 1536,
  })

  await db
    .from('elements')
    .update({ embedding: data[0].embedding })
    .eq('id', elementId)
}

// Call after insert or after description update:
export const elementService = {
  async create(input: CreateElementInput) {
    const { data: element, error } = await db.from('elements').insert(input).select().single()
    if (error) throw error
    // async, don't block the HTTP response
    void upsertEmbedding(element.id, input.description ?? '')
    return element
  },

  async update(id: string, patch: UpdateElementInput) {
    const { data: element, error } = await db.from('elements')
      .update(patch).eq('id', id).select().single()
    if (error) throw error
    if (patch.description !== undefined) {
      void upsertEmbedding(element.id, patch.description)
    }
    return element
  },
}
```

---

## SSE event reference

All events sent by `POST /v1/chat/:publicId`:

| Event name | Data | Description |
|------------|------|-------------|
| `patch` | JSON-Patch array | State update — apply to widget state |
| `done` | `{}` | Stream complete — close connection |
| `error` | `{ message }` | Unrecoverable error |

**JSON-Patch path reference:**

| Path | Type | Set when |
|------|------|----------|
| `/status` | `'idle'|'thinking'|'streaming'|'done'|'error'` | State transitions |
| `/conversation_id` | `string` | First turn (new conversation) |
| `/messages/-` | `Message` | New message added |
| `/messages/0/content` | `string` | Token streamed (replace accumulates) |

> **Note on `/messages/0/content`**: the assistant message is always the _last_ item added via `/messages/-`. The widget tracks message index for in-place replacement. In Phase 2 this will use a stable message ID path.

---

## Phase 2 upgrade path

The service layer is designed so the single-pass `chatService.run()` can be replaced with a **LangGraph** graph call with no changes to the route handler:

```typescript
// Phase 2 — drop-in replacement in chat.service.ts
import { runAgentGraph } from '@repo/ai'

export const chatService = {
  async run(input: ChatInput) {
    await runAgentGraph(input)    // LangGraph handles everything
  },
}
```

The SSE protocol (`sendPatch`) is already the right abstraction — LangGraph nodes just call `sendPatch` at each step.

---

## Model support matrix (MVP)

| Model ID | Provider | Notes |
|----------|----------|-------|
| `gpt-4o-mini` | OpenAI | Default — fast + cheap |
| `gpt-4o` | OpenAI | Higher quality |
| `claude-3-5-haiku-20241022` | Anthropic (Phase 2) | Needs `@anthropic-ai/sdk` |

For Phase 1, only the OpenAI SDK is required.
