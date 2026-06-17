import { createPortal } from "react-dom";

interface Props {
  onRegenerate: () => void;
  onStop: () => void;
}

export function DriftDialog({ onRegenerate, onStop }: Props) {
  return createPortal(
    <div
      className="eregna-drift-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="eregna-drift-title"
    >
      <div className="eregna-drift-dialog">
        <h2 id="eregna-drift-title" className="eregna-drift-dialog__title">
          This page has changed
        </h2>
        <p className="eregna-drift-dialog__body">
          This guide was recorded on a different version of the page. Some components
          no longer match what&apos;s here now.
        </p>
        <div className="eregna-drift-dialog__actions">
          <button type="button" className="eregna-drift-dialog__primary" onClick={onRegenerate}>
            ⟳ Generate a fresh walkthrough
          </button>
          <button type="button" className="eregna-drift-dialog__secondary" onClick={onStop}>
            Stop
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
