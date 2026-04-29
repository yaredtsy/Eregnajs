import { useState, type FormEvent } from 'react'
import type { AgentModel, CreateAgentBody } from '#/lib/api-types'

const MODELS: AgentModel[] = ['gpt-4o-mini', 'gpt-4o', 'claude-3-5-haiku']

type Props = {
  onSubmit: (body: CreateAgentBody) => Promise<void>
  submitting?: boolean
}

export function AgentForm({ onSubmit, submitting }: Props) {
  const [name, setName] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [description, setDescription] = useState('')
  const [model, setModel] = useState<AgentModel>('gpt-4o-mini')
  const [systemPrompt, setSystemPrompt] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    await onSubmit({
      name: name.trim(),
      website_url: websiteUrl.trim(),
      description: description.trim() || null,
      model,
      system_prompt: systemPrompt.trim() || null,
    })
    setName('')
    setWebsiteUrl('')
    setDescription('')
    setSystemPrompt('')
    setModel('gpt-4o-mini')
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="rounded-2xl border border-border bg-card p-6 space-y-4"
    >
      <h2 className="font-display text-xl font-semibold text-cream">New agent</h2>

      <div>
        <label htmlFor="agent-name" className="block text-xs font-medium text-muted-foreground mb-1">
          Name
        </label>
        <input
          id="agent-name"
          required
          minLength={2}
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
          placeholder="Acme Docs Agent"
        />
      </div>

      <div>
        <label htmlFor="agent-url" className="block text-xs font-medium text-muted-foreground mb-1">
          Website URL
        </label>
        <input
          id="agent-url"
          type="url"
          required
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
          placeholder="https://example.com"
        />
      </div>

      <div>
        <label htmlFor="agent-desc" className="block text-xs font-medium text-muted-foreground mb-1">
          Description (optional)
        </label>
        <textarea
          id="agent-desc"
          maxLength={500}
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground resize-y min-h-[72px]"
        />
      </div>

      <div>
        <label htmlFor="agent-model" className="block text-xs font-medium text-muted-foreground mb-1">
          Model
        </label>
        <select
          id="agent-model"
          value={model}
          onChange={(e) => setModel(e.target.value as AgentModel)}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
        >
          {MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="agent-prompt" className="block text-xs font-medium text-muted-foreground mb-1">
          System prompt (optional)
        </label>
        <textarea
          id="agent-prompt"
          maxLength={2000}
          rows={3}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground resize-y min-h-[88px]"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-gradient-to-r from-copper to-copper-dark px-4 py-2.5 text-sm font-semibold text-charcoal transition hover:opacity-95 disabled:opacity-50"
      >
        {submitting ? 'Creating…' : 'Create agent'}
      </button>
    </form>
  )
}
