// Stores state that the host page injects via window.eregna.setState().
// The widget reads it when building the request body.

let _state: Record<string, unknown> = {};

export function setState(partial: Record<string, unknown>): void {
  _state = { ..._state, ...partial };
}

export function getState(): Record<string, unknown> {
  return _state;
}
