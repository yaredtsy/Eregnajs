import { useCallback, useEffect, useMemo, useState } from "react";
import { getToolDescriptors } from "@repo/widget-internals/embed/hostTools";
import { applyRedaction } from "@repo/widget-internals/embed/hostConfig";
import type { AgentListItem } from "#/lib/api-types";
import { ensurePlaygroundSeed } from "./seed";
import { PlaygroundStage } from "./PlaygroundStage";
import { usePlaygroundConfig } from "./usePlaygroundConfig";
import {
  DEFAULT_TOOL_CONFIGS,
  registerPlaygroundTools,
  type ToolCallLogEntry,
} from "./registerPlaygroundTools";
import { StatePanel } from "./panels/StatePanel";
import { ToolsPanel } from "./panels/ToolsPanel";
import { KnowledgePanel, type KnowledgeEntry } from "./panels/KnowledgePanel";
import { RunPanel } from "./panels/RunPanel";
import { StreamPanel, type StreamFrame } from "./panels/StreamPanel";
import {
  useDebugContext,
  useDebugPlan,
  useDebugStep,
  useDebugNarrate,
} from "./useDebugAgent";
import "./playground.css";

const PANELS = [
  { id: "state" as const, label: "State" },
  { id: "tools" as const, label: "Tools" },
  { id: "knowledge" as const, label: "Knowledge" },
  { id: "run" as const, label: "Run" },
  { id: "stream" as const, label: "Stream" },
];

export function PlaygroundShell({ agent }: { agent: AgentListItem }) {
  const { config, patch } = usePlaygroundConfig(agent.id);
  const [seedReady, setSeedReady] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [toolConfigs, setToolConfigs] = useState(DEFAULT_TOOL_CONFIGS);
  const [callLog, setCallLog] = useState<ToolCallLogEntry[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  const [knowledgeUnsubs, setKnowledgeUnsubs] = useState<Record<string, () => void>>({});
  const [runResult, setRunResult] = useState<unknown>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [frames, setFrames] = useState<StreamFrame[]>([]);

  const debugContext = useDebugContext();
  const debugPlan = useDebugPlan();
  const debugStep = useDebugStep();
  const debugNarrate = useDebugNarrate();

  const pageUrl = useMemo(
    () => `${window.location.origin}/dashboard/${agent.id}/playground`,
    [agent.id],
  );

  const running =
    debugContext.isPending ||
    debugPlan.isPending ||
    debugStep.isPending ||
    debugNarrate.isPending;

  useEffect(() => {
    let cancelled = false;
    ensurePlaygroundSeed(agent.id)
      .then(() => {
        if (!cancelled) setSeedReady(true);
      })
      .catch((err) => {
        if (!cancelled) setSeedError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [agent.id]);

  const onToolLog = useCallback((entry: ToolCallLogEntry) => {
    setCallLog((log) => [...log, entry]);
  }, []);

  useEffect(() => {
    if (!seedReady || !window.eregna) return;
    const unregister = registerPlaygroundTools(toolConfigs, onToolLog);
    return unregister;
  }, [seedReady, toolConfigs, onToolLog]);

  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail;
      setFrames((f) => [
        ...f,
        {
          kind: detail?.kind ?? "unknown",
          seq: detail?.seq,
          raw: JSON.stringify(detail),
          ts: Date.now(),
        },
      ]);
    };
    window.addEventListener("eregna:frame", handler);
    return () => window.removeEventListener("eregna:frame", handler);
  }, []);

  const parseState = useCallback((): Record<string, unknown> => {
    try {
      return JSON.parse(config.stateJson) as Record<string, unknown>;
    } catch {
      return {};
    }
  }, [config.stateJson]);

  const buildDebugBody = useCallback(() => {
    const hostState = applyRedaction(parseState());
    return {
      agentId: agent.id,
      pageUrl,
      query: config.query,
      hostState,
      hostTools: getToolDescriptors(),
      hostKnowledge: knowledge.map(({ title, content }) => ({ title, content })),
    };
  }, [agent.id, pageUrl, config.query, parseState, knowledge]);

  const applyState = useCallback(() => {
    try {
      const parsed = parseState();
      window.eregna?.setState(parsed);
    } catch {
      setRunError("Invalid state JSON");
    }
  }, [parseState]);

  const addKnowledge = useCallback(
    (entry: { title: string; content: string }) => {
      const id = crypto.randomUUID();
      const unsub = window.eregna?.addKnowledge({ id, ...entry }) ?? (() => {});
      setKnowledge((k) => [...k, { id, ...entry }]);
      setKnowledgeUnsubs((m) => ({ ...m, [id]: unsub }));
    },
    [],
  );

  const removeKnowledge = useCallback(
    (id: string) => {
      knowledgeUnsubs[id]?.();
      setKnowledge((k) => k.filter((e) => e.id !== id));
      setKnowledgeUnsubs((m) => {
        const next = { ...m };
        delete next[id];
        return next;
      });
    },
    [knowledgeUnsubs],
  );

  const handleRun = useCallback(async () => {
    setRunError(null);
    setRunResult(null);
    if (config.runMode === "full") {
      setFrames([]);
      try {
        applyState();
        await window.eregna?.ask(config.query);
        setRunResult({ ok: true, mode: "full" });
      } catch (err) {
        setRunError(err instanceof Error ? err.message : String(err));
      }
      return;
    }

    const body = buildDebugBody();
    try {
      if (config.runMode === "context") {
        setRunResult(await debugContext.mutateAsync(body));
      } else if (config.runMode === "plan") {
        setRunResult(await debugPlan.mutateAsync(body));
      } else if (config.runMode === "step") {
        setRunResult(
          await debugStep.mutateAsync({ ...body, chapterIndex: config.chapterIndex }),
        );
      } else if (config.runMode === "narrate") {
        const stepRes = await debugStep.mutateAsync({ ...body, chapterIndex: config.chapterIndex });
        const data = stepRes as {
          stepList?: { steps?: unknown[] };
          chapter?: unknown;
        };
        const step = data.stepList?.steps?.[0];
        const chapter = data.chapter;
        if (!step || !chapter) {
          setRunError("Run Steps first — need a chapter and step");
          return;
        }
        setRunResult(
          await debugNarrate.mutateAsync({
            ...body,
            chapter,
            step,
            stepIndex: 0,
          }),
        );
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
    }
  }, [
    config,
    applyState,
    buildDebugBody,
    debugContext,
    debugPlan,
    debugStep,
    debugNarrate,
  ]);

  if (seedError) {
    return (
      <p className="text-sm text-red-400">
        Failed to seed playground knowledge base: {seedError}
      </p>
    );
  }

  if (!seedReady) {
    return <p className="text-sm text-muted-foreground">Seeding playground page…</p>;
  }

  return (
    <div className="eregna-playground -mx-6 grid lg:-mx-10 lg:grid-cols-[1fr_auto]">
      <div className="eregna-playground__stage min-h-[420px]">
        <PlaygroundStage
          sceneId={config.activeScene}
          onSceneChange={(id) => patch({ activeScene: id })}
        />
      </div>
      <aside className="eregna-playground__controls">
        <nav className="eregna-playground__panel-nav" aria-label="Control panels">
          <p className="eregna-playground__panel-nav-title">Controls</p>
          {PANELS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`eregna-playground__panel-nav-btn ${
                config.activePanel === p.id ? "eregna-playground__panel-nav-btn--active" : ""
              }`}
              onClick={() => patch({ activePanel: p.id })}
            >
              {p.label}
            </button>
          ))}
        </nav>
        <div className="eregna-playground__panel-body">
          {config.activePanel === "state" ? (
            <StatePanel
              stateJson={config.stateJson}
              onChange={(v) => patch({ stateJson: v })}
              onApply={applyState}
            />
          ) : null}
          {config.activePanel === "tools" ? (
            <ToolsPanel
              configs={toolConfigs}
              callLog={callLog}
              onChange={(name, p) =>
                setToolConfigs((c) => ({ ...c, [name]: { ...c[name]!, ...p } }))
              }
            />
          ) : null}
          {config.activePanel === "knowledge" ? (
            <KnowledgePanel entries={knowledge} onAdd={addKnowledge} onRemove={removeKnowledge} />
          ) : null}
          {config.activePanel === "run" ? (
            <RunPanel
              config={config}
              onPatch={patch}
              onRun={handleRun}
              running={running}
              result={runResult}
              error={runError}
            />
          ) : null}
          {config.activePanel === "stream" ? <StreamPanel frames={frames} /> : null}
        </div>
      </aside>
    </div>
  );
}
