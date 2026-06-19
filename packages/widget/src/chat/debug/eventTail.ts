import { useSyncExternalStore } from "react";
import { nanoid } from "nanoid";
import { isDebugMode } from "../../api/init.js";
import { formatDebugEvent } from "./formatEvent.js";
import type { ChatEvent } from "../protocol/events.js";
import type { RunFrame } from "../../types/conversation.js";

export interface EventTailEntry {
  id: string;
  atMs: number;
  label: string;
}

const MAX_ENTRIES = 200;

let entries: EventTailEntry[] = [];
let paused = false;
let sessionStart = performance.now();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): readonly EventTailEntry[] {
  return entries;
}

export function useEventTail(): {
  entries: readonly EventTailEntry[];
  paused: boolean;
} {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { entries: snapshot, paused };
}

export function isEventTailPaused(): boolean {
  return paused;
}

export function appendDebugEvent(event: ChatEvent | RunFrame): void {
  if (!isDebugMode() || paused) return;
  const entry: EventTailEntry = {
    id: nanoid(8),
    atMs: performance.now() - sessionStart,
    label: formatDebugEvent(event),
  };
  entries = [...entries, entry].slice(-MAX_ENTRIES);
  emit();
}

export function clearDebugEvents(): void {
  entries = [];
  emit();
}

export function setEventTailPaused(next: boolean): void {
  paused = next;
  emit();
}

export function resetEventTailSession(): void {
  sessionStart = performance.now();
}
