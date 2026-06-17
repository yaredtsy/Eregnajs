export type PlaybackMode = "live" | "on-demand";

export interface HostConfig {
  redactKeys: string[];
  defaultPlayback: PlaybackMode;
}

let config: HostConfig = {
  redactKeys: [],
  defaultPlayback: "live",
};

export function configure(partial: {
  redactKeys?: string[];
  defaultPlayback?: PlaybackMode;
}): void {
  if (partial.redactKeys) config = { ...config, redactKeys: [...partial.redactKeys] };
  if (partial.defaultPlayback) {
    config = { ...config, defaultPlayback: partial.defaultPlayback };
  }
}

export function getConfig(): HostConfig {
  return config;
}

export function applyRedaction(state: Record<string, unknown>): Record<string, unknown> {
  if (!config.redactKeys.length) return state;
  const out = { ...state };
  for (const key of config.redactKeys) {
    if (key in out) delete out[key];
  }
  return out;
}
