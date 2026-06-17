import type {
	Conversation,
	WalkthroughChapter,
	WalkthroughPart,
	Thought,
} from "@repo/widget-internals/types/conversation";
import type { WidgetState } from "@repo/widget-internals/store/widget-context";
import { SAMPLE_CONVERSATION } from "@repo/widget-internals/data/sample-conversation";

export const COMPONENTS_WT_ID = "w_01";

export function getComponentsWalkthrough(
	conv: Conversation = SAMPLE_CONVERSATION,
): WalkthroughPart {
	for (const msg of conv.messages) {
		for (const part of msg.parts) {
			if (part.type === "walkthrough" && part.walkthroughId === COMPONENTS_WT_ID) {
				return part;
			}
		}
	}
	throw new Error("components walkthrough not found in fixture");
}

function patchWalkthrough(
  conv: Conversation,
  patch: (wt: WalkthroughPart) => WalkthroughPart,
): Conversation {
  return {
    ...conv,
    messages: conv.messages.map((msg) => ({
      ...msg,
      parts: msg.parts.map((part) =>
        part.type === "walkthrough" && part.walkthroughId === COMPONENTS_WT_ID
          ? patch(part)
          : part,
      ),
    })),
  };
}

function chapter(
  i: number,
  title: string,
  status: WalkthroughChapter["status"] = "pending",
): WalkthroughChapter {
  return {
    title,
    description: `Description for chapter ${i + 1}.`,
    elementId: `el-${i}`,
    stepIndex: i,
    status,
  };
}

export function conversationWithChapters(
  count: number,
  opts?: { failedIndex?: number; skippedStepIndex?: number },
): Conversation {
  const chapters = Array.from({ length: count }, (_, i) =>
    chapter(
      i,
      `Chapter ${i + 1}`,
      opts?.failedIndex === i
        ? "failed"
        : i < 2
          ? "done"
          : i === 2
            ? "active"
            : "pending",
    ),
  );

  return patchWalkthrough(SAMPLE_CONVERSATION, (wt) => {
    const steps = chapters.map((c, i) => ({
      id: `step_${i}`,
      status: (opts?.skippedStepIndex === i ? "skipped" : "done") as "skipped" | "done",
      skipReason:
        opts?.skippedStepIndex === i ? "element-not-found:el-missing" : undefined,
      actions: [
        { type: "scroll-to" as const, elementId: c.elementId },
        { type: "highlight" as const, elementId: c.elementId },
      ],
      popover: {
        title: c.title,
        body: `Step body for ${c.title}.`,
        elementId: c.elementId,
      },
    }));

    return {
      ...wt,
      chapters,
      steps,
      status: count > 2 ? "playing" : "complete",
    };
  });
}

export function conversationPlanning(): Conversation {
  return patchWalkthrough(SAMPLE_CONVERSATION, (wt) => ({
    ...wt,
    status: "planning",
    thoughts: [],
    steps: [],
    chapters: [
      chapter(0, "Orientation", "pending"),
      chapter(1, "Main action", "pending"),
    ],
  }));
}

export function conversationWithThoughts(thoughts: Thought[]): Conversation {
  return patchWalkthrough(SAMPLE_CONVERSATION, (wt) => ({
    ...wt,
    status: "planning",
    thoughts,
  }));
}

export function playerState(
  overrides: Partial<WidgetState> & { conversation?: Conversation },
): Partial<WidgetState> {
  const { conversation, ...rest } = overrides;
  return {
    mode: "detached",
    activeWalkthroughId: COMPONENTS_WT_ID,
    status: "paused",
    playMode: "history",
    planPanelOpen: false,
    ...rest,
    ...(conversation ? { conversation } : {}),
  };
}

export const TICKER_IDLE = playerState({
  conversation: conversationPlanning(),
  status: "paused",
});

export const TICKER_ONE_THOUGHT = playerState({
  conversation: conversationWithThoughts([
    {
      id: "t1",
      phase: "plan",
      label: "Reading your question — you want to export billing data",
      ts: 0,
    },
  ]),
});

export const TICKER_RAPID = playerState({
  conversation: conversationWithThoughts([
    { id: "t1", phase: "plan", label: "Scanning registered components", ts: 0 },
    { id: "t2", phase: "plan", label: "Found the orders table and export button", ts: 100 },
    {
      id: "t3",
      phase: "chapter",
      chapterIndex: 0,
      label: "Starting with the table overview",
      ts: 200,
    },
    {
      id: "t4",
      phase: "chapter",
      chapterIndex: 1,
      label: "The export button needs a selected row first",
      ts: 300,
    },
  ]),
});

export const TICKER_LONG_LABEL = playerState({
  conversation: conversationWithThoughts([
    {
      id: "t-long",
      phase: "plan",
      label:
        "This is an intentionally very long thinking label that should ellipsize or fade gracefully in the ticker without breaking the detached bar layout on narrow viewports",
      ts: 0,
    },
  ]),
});

export const TIMELINE_1CH = playerState({
  conversation: conversationWithChapters(1),
  stepOffsetMs: 500,
});

export const TIMELINE_4CH = playerState({
  conversation: conversationWithChapters(4),
  stepOffsetMs: 4000,
});

export const TIMELINE_8CH = playerState({
  conversation: conversationWithChapters(8),
  stepOffsetMs: 12000,
});

export const TIMELINE_FAILED = playerState({
  conversation: conversationWithChapters(4, { failedIndex: 2 }),
});

export const TIMELINE_SKIPS = playerState({
  conversation: conversationWithChapters(4, { skippedStepIndex: 2 }),
});

export const TIMELINE_LIVE = playerState({
  conversation: patchWalkthrough(SAMPLE_CONVERSATION, (wt) => ({
    ...wt,
    status: "playing",
    steps: wt.steps.map((s, i) => ({
      ...s,
      status: i < 2 ? ("done" as const) : ("pending" as const),
    })),
  })),
  playMode: "live",
  status: "playing",
});

export const PLAN_PANEL_OPEN = playerState({
  conversation: patchWalkthrough(SAMPLE_CONVERSATION, (wt) => ({
    ...wt,
    chapters: wt.chapters.map((c, i) => ({
      ...c,
      status:
        i === 0
          ? ("done" as const)
          : i === 2
            ? ("failed" as const)
            : i === 3
              ? ("active" as const)
              : ("pending" as const),
    })),
  })),
  planPanelOpen: true,
  stepOffsetMs: 8000,
});

export const PLAYER_PREPARING = playerState({
  conversation: conversationPlanning(),
  activeWalkthroughId: null,
  playMode: "live",
  playbackChoice: "on-demand",
});

export const PLAYER_STREAMING = playerState({
  conversation: patchWalkthrough(SAMPLE_CONVERSATION, (wt) => ({
    ...wt,
    status: "playing",
  })),
  playMode: "live",
  status: "playing",
});

export const PLAYER_COMPOSER_ERROR = playerState({
  conversation: SAMPLE_CONVERSATION,
  composerValue: "Why did the connection drop?",
  status: "paused",
});

export const CHAT_DOCKED = playerState({
  mode: "bubble",
  activeWalkthroughId: null,
  status: "idle",
});

export const CHAT_WITH_ACTIVE = playerState({
  mode: "bubble",
  status: "playing",
});
