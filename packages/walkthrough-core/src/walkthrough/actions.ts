export type WalkthroughAction =
  | { type: "scroll-to"; elementId: string }
  | { type: "highlight"; elementId: string }
  | { type: "wait"; ms: number }
  | { type: "wait-for-click"; elementId: string; timeoutMs?: number }
  | { type: "call-tool"; toolName: string; args: Record<string, unknown> };
