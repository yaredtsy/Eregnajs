import type { PatchFrame } from "@repo/walkthrough-core";

export type { PatchFrame };

export interface PatcherInstance {
  emit(): Promise<void>;
  getLog(): PatchFrame[];
}
