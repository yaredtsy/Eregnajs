import type { ToolCallStatus } from "../../../chat/tools/types.js";

const STATUS_LABEL: Record<ToolCallStatus, string> = {
  pending: "Pending",
  running: "Running",
  done: "Done",
  error: "Error",
};

export function Status({ status }: { status: ToolCallStatus }) {
  return (
    <span className="eregna-tool-call-card__status" data-status={status}>
      {STATUS_LABEL[status]}
    </span>
  );
}
