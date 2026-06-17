import { useMutation } from "@tanstack/react-query";
import { api } from "#/lib/api";

export type DebugBaseBody = {
  agentId: string;
  pageUrl: string;
  query: string;
  hostState?: Record<string, unknown>;
  hostTools?: Array<{ name: string; description: string; parameters?: Record<string, unknown> }>;
  hostKnowledge?: Array<{ title: string; content: string }>;
};

export function useDebugContext() {
  return useMutation({
    mutationFn: (body: DebugBaseBody) =>
      api.post<unknown>("/v1/agent/debug/context", body),
  });
}

export function useDebugPlan() {
  return useMutation({
    mutationFn: (body: DebugBaseBody) =>
      api.post<unknown>("/v1/agent/debug/plan", body),
  });
}

export function useDebugStep() {
  return useMutation({
    mutationFn: (body: DebugBaseBody & { chapterIndex?: number }) =>
      api.post<unknown>("/v1/agent/debug/step", body),
  });
}

export function useDebugNarrate() {
  return useMutation({
    mutationFn: (body: DebugBaseBody & { chapter: unknown; step: unknown; stepIndex?: number }) =>
      api.post<unknown>("/v1/agent/debug/narrate", body),
  });
}
