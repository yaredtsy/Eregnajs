import type { ToolCallUiState } from "../../../chat/tools/types.js";
import { ToolCallCard } from "../ToolCallCard/index.js";

const FIXTURES: ToolCallUiState[] = [
  {
    toolCallId: "tc-pending",
    messageId: "msg-1",
    name: "addToCart",
    args: { productId: "sku-blue-mug", quantity: 1 },
    status: "pending",
    display: { icon: "🛒", label: "Add to cart" },
  },
  {
    toolCallId: "tc-running",
    messageId: "msg-1",
    name: "searchCatalog",
    args: { query: "blue ceramic mug", limit: 10 },
    status: "running",
    display: { icon: "🔍", label: "Search catalog" },
  },
  {
    toolCallId: "tc-done",
    messageId: "msg-1",
    name: "addToCart",
    args: { productId: "sku-blue-mug", quantity: 1 },
    status: "done",
    result: { cartCount: 3, itemId: "line-42" },
    elapsedMs: 197,
    display: { icon: "🛒", label: "Add to cart" },
  },
  {
    toolCallId: "tc-error",
    messageId: "msg-1",
    name: "checkout",
    args: { paymentToken: "secret-token-value", email: "user@example.com" },
    status: "error",
    error: "Payment declined — card expired",
    elapsedMs: 842,
    display: { icon: "💳", label: "Checkout", showResult: false },
  },
  {
    toolCallId: "tc-hidden",
    messageId: "msg-1",
    name: "internalSync",
    args: { sessionId: "abc" },
    status: "done",
    result: { ok: true },
    elapsedMs: 12,
    display: { label: "Internal sync", showArgs: false, showResult: false },
  },
];

export function ToolCallCardFixturePage() {
  return (
    <main className="eregna-tool-call-fixtures">
      <h1>Tool call cards</h1>
      <p>All states for M5 — pending, running, done, error, and hidden args/result.</p>
      <div className="eregna-tool-call-fixtures__grid">
        {FIXTURES.map((call) => (
          <section key={call.toolCallId} className="eregna-tool-call-fixtures__cell">
            <h2>{call.status}</h2>
            <ToolCallCard call={call} />
          </section>
        ))}
      </div>
    </main>
  );
}
