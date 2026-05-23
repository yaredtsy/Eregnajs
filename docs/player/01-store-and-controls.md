# player/01 — Store & Controls

Two layout pieces and one persistent thing.

- **The Bar** — always present. Carries the text input. Morphs visually by **activity**: idle = just input + send; active (a walkthrough is being shown, streamed, paused, scrubbed, or completed) = music-player controls stacked above the same input.
- **The Popup** — the traditional chat history, anchored bottom-right. Open or closed.
- **Mode** — where the Bar lives and whether the Popup is visible:
  - **bubble**: Popup open at bottom-right. Bar docked at the bottom of the Popup.
  - **detached**: Popup closed. Bar floating, centered at the bottom of the viewport.

Walkthroughs play on the host DOM (popovers anchored to real elements) in **both** modes. The Popup is a chat side-surface — it lists messages, surfaces walkthrough cards, and lets the visitor replay any past walkthrough. The Popup never typesets the answer; the answer is the walkthrough.

This doc renders the conversation model from `00-timeline-model.md`. The pause-and-ask flow in `02-pause-and-branch.md` reads from the same store.

---

## Modes at a glance

```
┌── bubble mode (resting / chatting) ──┐    ┌── detached mode (eyes on the page) ──┐
│                                       │    │                                       │
│                      ┌──────────────┐ │    │                                       │
│                      │ Acme Guide ×↗│ │    │                                       │
│                      ├──────────────┤ │    │                                       │
│                      │ messages…    │ │    │                                       │
│                      ├──────────────┤ │    │     ┌────── THE BAR ───────┐          │
│                      │  THE BAR     │ │    │     └──────────────────────┘          │
│                      └──────────────┘ │    │                                       │
│                                  ●    │    │                                  ●    │
│                              FAB icon │    │                            FAB icon   │
└───────────────────────────────────────┘    └───────────────────────────────────────┘
```

Bubble feels like a normal chat widget. Detached feels like a video player. Same Bar, two homes.

| | bubble | detached |
|---|---|---|
| Popup | open, bottom-right | closed |
| Bar location | docked at bottom of Popup | floating, middle-bottom of viewport |
| Walkthrough plays on host DOM | yes | yes |
| Resting footprint | 360–420 px popup, or 48 px FAB when collapsed | 520–760 px bar |
| Detach control | "↗" icon in Popup header | n/a |
| Re-attach control | n/a | click the floating FAB |
| Close everything | "×" in Popup header → just the FAB | re-attach first, then × |

### Mode state

```ts
export type WidgetMode =
  | { kind: 'closed' }                   // only the floating FAB is visible
  | { kind: 'bubble' }                   // Popup open, Bar docked inside it
  | { kind: 'detached' }                 // Popup closed, Bar floats middle-bottom
```

| From | To | Trigger |
|---|---|---|
| closed | bubble | click FAB |
| bubble | detached | click "↗ detach" in Popup header |
| detached | bubble | click FAB |
| bubble | closed | click "×" in Popup header |
| detached | closed | not direct — re-attach first |

Mode switches never abort the engine. They pause it, tear down popovers/spotlights via the cleanup stack, and rehydrate on the next play. Walkthroughs survive across mode switches.

---

## The Bar — activity morph

The Bar has two visual states. The text input row is **identical** across both — same DOM node, same focus, same value. Active mode adds a controls row above it.

### Idle (no active walkthrough)

```
┌───────────────────────────────────────────────────────────┐
│  [ Ask a question or describe what you need…       ]  ▶  │
└───────────────────────────────────────────────────────────┘
```

Submitting opens a new user `Message`, kicks off an SSE stream, and the assistant message starts building. The Bar flips to active as soon as the assistant's first part lands.

### Active (`activeWalkthroughId != null`)

```
┌───────────────────────────────────────────────────────────┐
│  ◁  ▶▮  ▷   ●────────────│live   0:32 / 1:15   1×   ⋯    │  ← controls row
│  [ Type a follow-up or press space to pause…       ]  ▶  │  ← text input row (same DOM as idle)
└───────────────────────────────────────────────────────────┘
```

The controls row is the music-player. The input row stays — typing while playing triggers pause-to-ask (`02-pause-and-branch.md`).

| Control | Behavior |
|---|---|
| ◁ Prev | Snap playhead to previous Chapter start. |
| ▶▮▮ Play / Pause | Toggle `status` ↔ `paused`. Space-bar when input is empty. |
| ▷ Next | Snap playhead to next Chapter start (capped at `liveEdge`). |
| Scrubber | Track with chapter ticks. Filled = `playhead / totalDurationMs`. Lighter fill = buffered region (between playhead and `liveEdge`). Notched cap at `liveEdge`. Click/drag to scrub. |
| `\|live` pill | Visible only when `!isAtLive`. Click → `playhead := liveEdge`, status: `playing`. |
| Time | `M:SS / M:SS`. Right side reads "live" when `isAtLive`. |
| 1× Speed | Cycles 0.75 / 1 / 1.5 / 2. Applies on the next sleep boundary. |
| ⋯ Menu | Restart current walkthrough; exit walkthrough (sets `activeWalkthroughId = null` → Bar returns to idle); mute typewriter (Phase 2). |

### When the Bar morphs

```
activeWalkthroughId === null   →  idle
activeWalkthroughId !== null   →  active
```

Status (`playing` / `paused` / `awaiting-stream` / `complete` / `error`) only changes the icon inside the play/pause button. A finished walkthrough still shows the music-player so the visitor can rewind/replay; the ⋯ → exit affordance returns to idle.

---

## The Popup — chat history (bubble mode only)

```
┌─── 380 px wide, anchored bottom-right ──┐
│  Acme Guide                  ↗     ×    │  ← detach + close
├─────────────────────────────────────────┤
│                                         │
│  You                                    │
│  how do I subscribe to pro?             │
│                                         │
│  Agent                                  │
│  Okay, let me show you on the           │  ← TextPart  (acknowledgment / intent)
│  pricing page.                          │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ ▶  Subscribe to Pro               │  │  ← WalkthroughPart card
│  │    3 chapters · streaming…        │  │     (lazy: title + meta only)
│  └───────────────────────────────────┘  │
│                                         │
│  You · paused at "Highlight Subscribe"  │
│  what is team tier?                     │
│                                         │
│  Agent                                  │
│  Sure — quick comparison.               │
│  ┌───────────────────────────────────┐  │
│  │ ▶  Compare Team vs Pro            │  │
│  │    2 chapters                     │  │
│  └───────────────────────────────────┘  │
├─────────────────────────────────────────┤
│             [ THE BAR ]                 │  ← docked at the bottom
└─────────────────────────────────────────┘
```

### The two assistant part-types in the Popup

A typical assistant message has two parts in this order: a short `TextPart` followed by a `WalkthroughPart`. Either is allowed independently; both is the norm.

| Part | Purpose | Source |
|---|---|---|
| `TextPart` (assistant) | A short acknowledgment / intent line — *"Okay, let me show you on the pricing page."* — so the visitor isn't staring at a silent card while the planner runs (≈1–2 s) and the streamer warms up. Typeset as plain text in the message list. | Phase 1: derived deterministically from the committed Plan (e.g. *"Okay, let me show you {plan.goal}."*). Phase 2: generated as a separate, fast LLM call alongside the plan. |
| `WalkthroughPart` card | The handle into the walkthrough. Shows `plan.goal` as the title, chapter count, stream-status badge. Click → set `activeWalkthroughId` to this walkthrough, seek playhead to its start, status: `playing`. | The planner's Plan + the streamer's Steps. |

The card is **lazy**. The message-list row renders only what's on the part's metadata (`walkthroughId`, `plan.goal`, `plan.steps.length`, `streamStatus`). The full `steps[]` are kept on the active walkthrough in memory; for inactive past walkthroughs (history scroll-back), the heavy data is fetched on click via the replay endpoint. This keeps the Popup cheap to scroll even after many turns.

### Streaming sequence inside the Popup

While the agent answers, the message list grows like this:

```
t0   You: "how do I subscribe to pro?"

t1   Agent: "Okay, let me show you on the pricing page."          ← TextPart lands
                                                                   (Bar morphs to active here)

t2   Agent: [card placeholder, "preparing…"]                       ← empty WalkthroughPart appended

t3   Agent: [card "Subscribe to Pro · 1 chapter · streaming…"]     ← plan arrives, chapters fill

t4   Agent: [card "Subscribe to Pro · 3 chapters · streaming…"]    ← steps stream in
            (on host DOM: scroll → highlight → popover plays live)

t5   Agent: [card "Subscribe to Pro · 3 chapters · ready"]         ← stream closed
```

The walkthrough plays on the host DOM **while** the card is filling — the visitor reads "Okay, let me show you" in the Popup as the page scrolls and the first popover types itself in. The card is a record/handle; the live experience is on the page.

### Other Popup elements

| Element | Behavior |
|---|---|
| Header | Agent name. "↗" → `mode: detached` (Popup closes, Bar slides to middle-bottom). "×" → `mode: closed`. |
| User message | TextPart, plain typeset. If the message has `parentContext` set (see `00-timeline-model.md`), an inline tag reads *"paused at '{chapter.title}'"*. |
| Auto-scroll | List scrolls to bottom on new part unless the visitor has scrolled up. |
| Card stream-status badge | `streaming…` (pulsing), `ready` (green dot), `aborted` (grey), `error` (red). |
| The Bar | Docked at the bottom. Same controls as detached mode; constrained to Popup width. |

---

## Floating FAB

A 48 px circular icon, always anchored bottom-right of the viewport, sitting **below** any open Popup or Bar. Visible in every mode.

- closed → click → `mode: bubble`
- bubble → click → `mode: closed`
- detached → click → `mode: bubble` (Bar slides from middle-bottom into the Popup's bottom slot; same DOM, animated)

Carries an unread dot when `bubbleHasUnread` is true (the walkthrough finished, hit an error, or new agent text landed while the Popup was closed).

---

## `useWidgetStore`

Single source of truth for both surfaces. The engine writes via a `WalkthroughStoreContract` adapter; React subscribes via Zustand selectors.

```ts
// packages/widget/src/store/useWidgetStore.ts
import { create } from 'zustand'
import type {
  Conversation, Timeline, Position, WalkthroughPart, Message,
  PopoverConfig, Step,
} from '@repo/walkthrough-core'

interface State {
  // ─── Surface ───────────────────────────────────────────────
  mode: WidgetMode
  bubbleHasUnread: boolean

  // ─── Source of truth ──────────────────────────────────────
  conversation: Conversation
  activeWalkthroughId: string | null      // Bar morphs on this

  // ─── DVR view (derived) ───────────────────────────────────
  timeline: Timeline | null

  // ─── Playback ─────────────────────────────────────────────
  status: 'idle' | 'playing' | 'paused' | 'awaiting-stream' | 'complete' | 'error'
  speed: 0.75 | 1 | 1.5 | 2

  // ─── Popover + typewriter on host DOM (any mode) ─────────
  popover: (PopoverConfig & { anchorRect?: DOMRectReadOnly }) | null
  typewriter: { fullText: string; visibleText: string; charIndex: number; isTyping: boolean }

  // ─── Stream stats ─────────────────────────────────────────
  queueSize: number
  streamOpen: boolean
  streamError: string | null

  // ─── Composer ─────────────────────────────────────────────
  composer: { value: string; sending: boolean }

  // ─── Mutators ─────────────────────────────────────────────
  setMode: (m: WidgetMode) => void
  setStatus: (s: State['status']) => void
  setSpeed: (n: State['speed']) => void

  appendMessage: (m: Message) => void
  appendPart: (messageId: string, part: Message['parts'][number]) => void
  appendStep: (walkthroughId: string, step: Step) => void
  setStreamStatus: (walkthroughId: string, s: WalkthroughPart['streamStatus']) => void

  setActiveWalkthrough: (id: string | null) => void
  setPlayhead: (p: Position) => void
  setLiveEdge: (p: Position) => void
  setTimeline: (t: Timeline) => void

  setPopover: (p: State['popover']) => void
  setTypewriter: (partial: Partial<State['typewriter']>) => void
  resetTypewriter: (fullText: string) => void

  setComposerValue: (v: string) => void
  resetComposer: () => void

  reset: () => void
}
```

### Selectors discipline

Components subscribe to the minimum slice. Updates from the engine are high-frequency; tight selectors keep re-renders local.

```ts
// The Bar's controls row — re-renders only on these:
const status   = useWidgetStore(s => s.status)
const playhead = useWidgetStore(s => s.timeline?.playhead)
const liveEdge = useWidgetStore(s => s.timeline?.liveEdge)
const isAtLive = useWidgetStore(s => s.timeline?.isAtLive ?? true)
const isActive = useWidgetStore(s => s.activeWalkthroughId !== null)

// The Popup message list:
const messages = useWidgetStore(s => s.conversation.messages)

// The host-DOM popover layer (renders in both modes):
const popover     = useWidgetStore(s => s.popover)
const visibleText = useWidgetStore(s => s.typewriter.visibleText)
```

Avoid `useShallow` unless we genuinely need a multi-key selector.

---

## The Composer (the Bar's text input)

Same DOM element in every state. Behavior depends on `activeWalkthroughId + status + composer.value`.

| Activity | Composer empty | Composer non-empty |
|---|---|---|
| idle (no active walkthrough) | placeholder "Ask a question…"; Enter no-op | Enter → open new user message → start new walkthrough; Bar morphs to active |
| active, `playing` | placeholder "Press space to pause…"; Space toggles | typing pauses engine; Enter submits follow-up (carries `parentContext = playhead`) |
| active, `paused` | placeholder "Press Enter to resume…"; Enter resumes | Enter submits follow-up |
| active, `awaiting-stream` | disabled | Enter aborts active stream + submits follow-up |
| active, `complete` | placeholder "Ask a follow-up…" | Enter submits next turn |

Cursor focus never moves on mode/activity change. Placeholder text is the only signal.

---

## Scrubber details

- One tick per Chapter. Larger/highlighted tick where `Chapter.isWalkthroughStart` is true (start of each new walkthrough — visually demarcates turn boundaries on the same Timeline).
- Hover shows `Chapter.title` in a tooltip.
- Click on a tick = snap to that Chapter's start.
- Drag = continuous scrub. Engine debounces redraw at 60 ms; final `setPlayhead` fires on `mouseup`.
- Cap at `liveEdge`: dragging past lands at `liveEdge` and flips status to `awaiting-stream` if the stream is still open. If `closed`, dragging past is silently clamped.
- The `liveEdge` notch advances on its own as Steps stream in, even while the visitor is scrubbed back. No re-render storm — the notch is its own selector.

### Status badges

Above the time readout in the controls row:

| Status | Text | Dot |
|---|---|---|
| `playing` | "Playing" | solid green |
| `paused` | "Paused" | yellow |
| `awaiting-stream` | "Thinking…" | pulsing blue |
| `complete` | "Done" | grey |
| `error` | error message | red |

---

## Keyboard shortcuts

Active when the Composer is focused and empty. Standard video-player conventions.

| Key | Action |
|---|---|
| Space | Toggle play/pause |
| → | Next chapter |
| ← | Previous chapter |
| Shift+→ | Seek +5 s |
| Shift+← | Seek −5 s |
| L | Go live (if `!isAtLive`) |
| M | Toggle mute (Phase 2) |
| Esc | bubble mode → close Popup; detached mode → re-attach |

We deliberately do not grab global hotkeys. If the Composer has any content, only Enter is intercepted; everything else passes through to typing.

---

## Engine ↔ store wiring

```ts
// packages/widget/src/hooks/usePlayer.ts
export function usePlayer(agentId: string) {
  const adapter = useMemo(() => new DomHostAdapter(overlay, storeApi()), [])
  const queue   = useMemo(() => new StepQueue(), [])
  const engine  = useMemo(() => new WalkthroughEngine({
    registry: createDefaultRegistry(),
    adapter,
    store: storeApi(),
    queue,
    onTick: (p) => useWidgetStore.getState().setPlayhead(p),
  }), [])

  useEffect(() => () => engine.abort(), [])
  useEffect(() => queue.onStateChange(s =>
    useWidgetStore.getState().setStreamStats?.(s)),
  [])

  return { engine, queue }
}
```

The engine writes through a `WalkthroughStoreContract` adapter that maps onto `useWidgetStore` (status, popover, typewriter). `walkthrough-core` does not depend on Zustand.

When the user scrubs, `setPlayhead` jumps the engine's playhead. The engine treats a backward jump as a seek: cleanup-stack tears down current state, replays the target Step's actions from a clean baseline, then resumes ticking from the new playhead. See `00-timeline-model.md` §"A Step is a scrubbable span".

---

## Lazy loading walkthrough content

For history scroll-back, the Popup renders `WalkthroughPart` cards without ever loading their `steps[]`. The card only needs:

- `walkthroughId`
- `plan.goal` (title)
- `plan.steps.length` (chapter count)
- `streamStatus`

When the visitor clicks a card:

1. If `walkthroughId === activeWalkthroughId`, just seek playhead to the walkthrough's start.
2. Otherwise: set `activeWalkthroughId := walkthroughId`. If the steps aren't in memory, fetch them from the replay endpoint (MVP follow-up — see `00-timeline-model.md`). Once loaded, hydrate the in-memory part's `steps[]`, recompute Timeline, set status: `playing`.

The active walkthrough's full data stays in memory for the session. Inactive past walkthroughs are evicted on demand. This means a long conversation never bloats the Popup or the store.

---

## Why this split

A single static layout could not do both jobs:

- A floating bottom-right bubble that **also** had DVR controls would be too small to scrub or too large at rest. Splitting the surface — bubble for resting/chatting, music-player at the bottom of the open Popup, free-floating at the middle-bottom when detached — lets each state present at the right size.
- The Bar morphs by **activity**, not by mode. A visitor who likes the chat-popup metaphor (`mode: bubble`) still gets the full DVR — it just lives inside the Popup. A visitor who wants the page out of their way (`mode: detached`) loses the message list but keeps every control.

The Bar is the constant. The Popup is the optional context. The DOM popovers and spotlights are where the answer actually lives.

---

## Out of scope for this doc

- Pause-to-ask flow + server protocol: `02-pause-and-branch.md`.
- Popover/spotlight rendering and host-DOM isolation: `widget/02-overlay-and-isolation.md`.
- Engine step execution and replay-from-mid: `engine/02-engine-and-executor.md`.
- Persistence of `Conversation` + SSE message/part streaming events: MVP follow-ups in `00-timeline-model.md`.
