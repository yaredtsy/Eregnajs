import { useCallback, useEffect, useState } from "react";

const storageKey = (agentId: string) => `eregna:playground:${agentId}`;

export interface PlaygroundConfig {
  stateJson: string;
  query: string;
  activePanel: "state" | "tools" | "knowledge" | "run" | "stream";
  runMode: "context" | "plan" | "step" | "narrate" | "full";
  chapterIndex: number;
}

const DEFAULT: PlaygroundConfig = {
  stateJson: JSON.stringify({ user: { plan: "free" }, invoiceCount: 0 }, null, 2),
  query: "How do I export my orders?",
  activePanel: "run",
  runMode: "full",
  chapterIndex: 0,
};

export function usePlaygroundConfig(agentId: string) {
  const [config, setConfig] = useState<PlaygroundConfig>(() => {
    if (typeof window === "undefined") return DEFAULT;
    try {
      const raw = localStorage.getItem(storageKey(agentId));
      return raw ? { ...DEFAULT, ...JSON.parse(raw) } : DEFAULT;
    } catch {
      return DEFAULT;
    }
  });

  useEffect(() => {
    localStorage.setItem(storageKey(agentId), JSON.stringify(config));
  }, [agentId, config]);

  const patch = useCallback((partial: Partial<PlaygroundConfig>) => {
    setConfig((c) => ({ ...c, ...partial }));
  }, []);

  return { config, patch };
}
