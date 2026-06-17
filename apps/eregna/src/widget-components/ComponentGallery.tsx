import { useMemo, useState, type ReactNode } from "react";
import { ThinkingTicker } from "@repo/widget-internals/components/DetachedPlayer/ThinkingTicker";
import { PlanPanel } from "@repo/widget-internals/components/DetachedPlayer/PlanPanel";
import { ChapterTimeline } from "@repo/widget-internals/components/DetachedPlayer/ChapterTimeline";
import { PlayerBar } from "@repo/widget-internals/components/PlayerBar";
import { DetachedPlayer } from "@repo/widget-internals/components/DetachedPlayer";
import { Popover } from "@repo/widget-internals/components/WalkthroughOverlay/Popover";
import { DriftDialog } from "@repo/widget-internals/components/DriftDialog";
import { ChatPopup } from "@repo/widget-internals/components/ChatPopup";
import { ComponentsProvider } from "#/widget-components/ComponentsProvider";
import { ComponentsShell } from "#/widget-components/ComponentsShell";
import {
  CHAT_DOCKED,
  CHAT_WITH_ACTIVE,
  PLAN_PANEL_OPEN,
  PLAYER_COMPOSER_ERROR,
  PLAYER_PREPARING,
  PLAYER_STREAMING,
  TICKER_IDLE,
  TICKER_LONG_LABEL,
  TICKER_ONE_THOUGHT,
  TICKER_RAPID,
  TIMELINE_1CH,
  TIMELINE_4CH,
  TIMELINE_8CH,
  TIMELINE_FAILED,
  TIMELINE_LIVE,
  TIMELINE_SKIPS,
  conversationPlanning,
  getComponentsWalkthrough,
  playerState,
} from "#/widget-components/fixtures";
import { SAMPLE_CONVERSATION } from "@repo/widget-internals/data/sample-conversation";
import type { WidgetState } from "@repo/widget-internals/store/widget-context";
import "@repo/widget-internals/widget.css";
import "#/widget-components/components.css";

type Variant = {
  id: string;
  label: string;
  description: string;
  render: () => ReactNode;
};

type Section = {
  id: string;
  title: string;
  variants: Variant[];
};

function withPlayer(
  initialState: Partial<WidgetState>,
  render: () => ReactNode,
  opts?: { narrow?: boolean; minHeight?: number },
) {
  const conv = initialState.conversation ?? SAMPLE_CONVERSATION;
  return (
    <ComponentsShell narrow={opts?.narrow} minHeight={opts?.minHeight}>
      <ComponentsProvider conversation={conv} initialState={initialState}>
        {render()}
      </ComponentsProvider>
    </ComponentsShell>
  );
}

const SECTIONS: Section[] = [
  {
    id: "popover",
    title: "Popover",
    variants: [
      {
        id: "streaming",
        label: "Streaming",
        description: "Live mode — body grows via patches; cursor blinks at the end.",
        render: () => (
          <ComponentsShell label="Anchored · streaming">
            <div className="eregna-components-popover-item">
              <Popover
                title="Export your data"
                visibleText="First I'll show you where the export button lives on this page"
                anchorRect={new DOMRect(120, 80, 160, 40)}
              />
            </div>
          </ComponentsShell>
        ),
      },
      {
        id: "complete",
        label: "Complete",
        description: "History mode — full body visible after typewriter finishes.",
        render: () => (
          <ComponentsShell label="Anchored · complete">
            <div className="eregna-components-popover-item">
              <Popover
                title="Your agents"
                visibleText="All your agents appear here as cards. Click any card to open settings, knowledge, and the embed snippet."
                anchorRect={new DOMRect(80, 60, 200, 48)}
              />
            </div>
          </ComponentsShell>
        ),
      },
      {
        id: "tool-result",
        label: "Tool result",
        description: "Footer card when a read-tool returns data (flow 01).",
        render: () => (
          <ComponentsShell label="Anchored · tool footer">
            <div className="eregna-components-popover-item">
              <Popover
                title="Table summary"
                visibleText="Here's what your orders table contains right now."
                anchorRect={new DOMRect(100, 70, 180, 36)}
                footer="table_sum_column → total: $4,280.00"
              />
            </div>
          </ComponentsShell>
        ),
      },
      {
        id: "not-found",
        label: "Not found",
        description: "Viewport-center notice when highlight target never resolves.",
        render: () => (
          <ComponentsShell label="Notice · element-not-found" minHeight={180}>
            <Popover
              title="Heads up"
              visibleText="I couldn't find Export button on this page — it may be hidden, or this page may have changed."
              anchorRect={null}
              variant="notice"
            />
          </ComponentsShell>
        ),
      },
      {
        id: "tool-error",
        label: "Tool error",
        description: "Skipped step when a host tool throws a structured error.",
        render: () => (
          <ComponentsShell label="Notice · tool-error" minHeight={180}>
            <Popover
              title="Heads up"
              visibleText="Select a row in the table first, then try Export again."
              anchorRect={null}
              variant="notice"
            />
          </ComponentsShell>
        ),
      },
      {
        id: "connection-lost",
        label: "Connection lost",
        description: "Generic skip message when the stream dies mid-run.",
        render: () => (
          <ComponentsShell label="Notice · generic skip" minHeight={180}>
            <Popover
              title="Heads up"
              visibleText="This step couldn't run — continuing with the rest of the guide."
              anchorRect={null}
              variant="notice"
            />
          </ComponentsShell>
        ),
      },
    ],
  },
  {
    id: "ticker",
    title: "Thinking ticker",
    variants: [
      {
        id: "idle",
        label: "Idle shimmer",
        description: "Planning with no thoughts yet — shimmer is the only feedback.",
        render: () =>
          withPlayer(TICKER_IDLE, () => {
            const wt = getComponentsWalkthrough(conversationPlanning());
            return <ThinkingTicker wt={wt} planning />;
          }),
      },
      {
        id: "one",
        label: "One thought",
        description: "Single line with ✦ spark and latest highlight.",
        render: () =>
          withPlayer(TICKER_ONE_THOUGHT, () => {
            const wt = getComponentsWalkthrough(TICKER_ONE_THOUGHT.conversation!);
            return <ThinkingTicker wt={wt} planning />;
          }),
      },
      {
        id: "rapid",
        label: "Rapid thoughts",
        description: "Up to three visible lines; older thoughts fade upward.",
        render: () =>
          withPlayer(TICKER_RAPID, () => {
            const wt = getComponentsWalkthrough(TICKER_RAPID.conversation!);
            return <ThinkingTicker wt={wt} planning />;
          }),
      },
      {
        id: "long",
        label: "Long label",
        description: "Stress test for ellipsis / overflow on narrow bars.",
        render: () =>
          withPlayer(TICKER_LONG_LABEL, () => {
            const wt = getComponentsWalkthrough(TICKER_LONG_LABEL.conversation!);
            return <ThinkingTicker wt={wt} planning />;
          }, { narrow: true }),
      },
    ],
  },
  {
    id: "timeline",
    title: "Chapter timeline",
    variants: [
      {
        id: "1ch",
        label: "1 chapter",
        description: "Single segment; fill tracks playback position.",
        render: () =>
          withPlayer(TIMELINE_1CH, () => (
            <div className="eregna-detached-bar">
              <PlayerBar />
            </div>
          )),
      },
      {
        id: "4ch",
        label: "4 chapters",
        description: "Segment width proportional to step duration; seek on click (history).",
        render: () =>
          withPlayer(TIMELINE_4CH, () => (
            <div className="eregna-detached-bar">
              <PlayerBar />
            </div>
          )),
      },
      {
        id: "8ch",
        label: "8 chapters",
        description: "Dense timeline — hover a segment to see the YouTube-style tooltip.",
        render: () =>
          withPlayer(TIMELINE_8CH, () => (
            <div className="eregna-detached-bar">
              <PlayerBar />
            </div>
          ), { minHeight: 120 }),
      },
      {
        id: "failed",
        label: "Failed chapter",
        description: "Whole segment red when chapter.status === failed.",
        render: () =>
          withPlayer(TIMELINE_FAILED, () => (
            <div className="eregna-detached-bar">
              <PlayerBar />
            </div>
          )),
      },
      {
        id: "skips",
        label: "Red slice",
        description: "Chapter with skipped steps — gradient fill shows partial failure.",
        render: () =>
          withPlayer(TIMELINE_SKIPS, () => (
            <div className="eregna-detached-bar">
              <PlayerBar />
            </div>
          )),
      },
      {
        id: "live",
        label: "Live pulse",
        description: "Streaming run — segments inert; last segment pulses.",
        render: () =>
          withPlayer(TIMELINE_LIVE, () => (
            <div className="eregna-detached-bar">
              <PlayerBar />
            </div>
          )),
      },
    ],
  },
  {
    id: "plan",
    title: "Plan panel",
    variants: [
      {
        id: "states",
        label: "Chapter states",
        description: "Checklist: done ✓, active ▸, pending ○, failed ⚠ with step warnings.",
        render: () =>
          withPlayer(PLAN_PANEL_OPEN, () => {
            const wt = getComponentsWalkthrough(PLAN_PANEL_OPEN.conversation!);
            return <PlanPanel wt={wt} />;
          }, { minHeight: 320 }),
      },
      {
        id: "thoughts",
        label: "Thought expansion",
        description: "Plan-level and per-chapter thoughts; detail in expandable rows.",
        render: () =>
          withPlayer(
            playerState({ planPanelOpen: true, conversation: SAMPLE_CONVERSATION }),
            () => {
              const wt = getComponentsWalkthrough();
              return <PlanPanel wt={wt} />;
            },
            { minHeight: 360 },
          ),
      },
    ],
  },
  {
    id: "player",
    title: "Player bar",
    variants: [
      {
        id: "history",
        label: "History playback",
        description: "Full detached bar — play/pause, timeline, speed, composer.",
        render: () =>
          withPlayer(
            playerState({ status: "paused", stepOffsetMs: 3000 }),
            () => <DetachedPlayer />,
            { minHeight: 140 },
          ),
      },
      {
        id: "preparing",
        label: "Preparing",
        description: "On-demand mode — choice toggle before the run finishes buffering.",
        render: () =>
          withPlayer(PLAYER_PREPARING, () => <DetachedPlayer />, { minHeight: 120 }),
      },
      {
        id: "live",
        label: "Live streaming",
        description: "Composer disabled for scrubbing; live dot instead of speed control.",
        render: () =>
          withPlayer(PLAYER_STREAMING, () => <DetachedPlayer />, { minHeight: 140 }),
      },
      {
        id: "narrow",
        label: "Narrow (360px)",
        description: "Mobile-width bar — controls wrap without breaking layout.",
        render: () =>
          withPlayer(
            playerState({ status: "playing", stepOffsetMs: 2000 }),
            () => <DetachedPlayer />,
            { narrow: true, minHeight: 160 },
          ),
      },
      {
        id: "composer",
        label: "Composer filled",
        description: "Follow-up typed mid-replay — send aborts and starts a new ask().",
        render: () =>
          withPlayer(PLAYER_COMPOSER_ERROR, () => (
            <div className="eregna-detached-bar">
              <PlayerBar />
            </div>
          )),
      },
    ],
  },
  {
    id: "chat",
    title: "Docked chat",
    variants: [
      {
        id: "idle",
        label: "Idle",
        description: "Bubble mode popup with message list and composer.",
        render: () =>
          withPlayer(CHAT_DOCKED, () => <ChatPopup />, { minHeight: 420 }),
      },
      {
        id: "active",
        label: "Walkthrough active",
        description: "Docked popup with inline player bar while a guide plays.",
        render: () =>
          withPlayer(CHAT_WITH_ACTIVE, () => <ChatPopup />, { minHeight: 480 }),
      },
    ],
  },
  {
    id: "drift",
    title: "Drift dialog",
    variants: [
      {
        id: "dialog",
        label: "Replay drift",
        description: "Shown when chapter-1 pre-flight fails or escalation triggers.",
        render: () => (
          <ComponentsShell label="Modal overlay" minHeight={240}>
            <DriftDialog onRegenerate={() => {}} onStop={() => {}} />
          </ComponentsShell>
        ),
      },
    ],
  },
  {
    id: "timeline-only",
    title: "Timeline (isolated)",
    variants: [
      {
        id: "hover",
        label: "Seek hover",
        description: "Timeline row alone — hover segments to preview tooltips.",
        render: () =>
          withPlayer(TIMELINE_4CH, () => (
            <div className="eregna-player-bar" style={{ padding: "12px 16px" }}>
              <ChapterTimeline />
            </div>
          ), { minHeight: 80 }),
      },
    ],
  },
];

export function ComponentGallery() {
  const [sectionId, setSectionId] = useState(SECTIONS[0]!.id);
  const [variantId, setVariantId] = useState(SECTIONS[0]!.variants[0]!.id);

  const section = useMemo(
    () => SECTIONS.find((s) => s.id === sectionId) ?? SECTIONS[0]!,
    [sectionId],
  );

  const variant = useMemo(() => {
    const v = section.variants.find((x) => x.id === variantId) ?? section.variants[0]!;
    return v;
  }, [section, variantId]);

  function pickSection(id: string) {
    setSectionId(id);
    const next = SECTIONS.find((s) => s.id === id);
    if (next?.variants[0]) setVariantId(next.variants[0].id);
  }

  return (
    <div className="eregna-component-gallery">
      <nav className="eregna-component-gallery__nav" aria-label="Widget components">
        <p className="eregna-component-gallery__nav-title">Components</p>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`eregna-component-gallery__section-btn ${
              s.id === sectionId ? "eregna-component-gallery__section-btn--active" : ""
            }`}
            onClick={() => pickSection(s.id)}
          >
            {s.title}
          </button>
        ))}
      </nav>

      <div className="eregna-component-gallery__main">
        <div className="eregna-component-gallery__variants" role="tablist">
          {section.variants.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={v.id === variant.id}
              className={`eregna-component-gallery__variant-btn ${
                v.id === variant.id ? "eregna-component-gallery__variant-btn--active" : ""
              }`}
              onClick={() => setVariantId(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>

        <p className="eregna-component-gallery__meta">
          <strong>{variant.label}</strong> — {variant.description}
        </p>

        <div className="eregna-component-gallery__preview" key={`${sectionId}:${variant.id}`}>
          {variant.render()}
        </div>
      </div>
    </div>
  );
}

export { SECTIONS as COMPONENTS_SECTIONS };
