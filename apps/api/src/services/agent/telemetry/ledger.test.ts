import { describe, expect, test } from "bun:test";
import { TokenLedger } from "./ledger.js";
import { normalizeTokenUsage } from "./normalize.js";

describe("TokenLedger", () => {
  test("records labeled calls and rolls up totals", () => {
    const ledger = new TokenLedger();
    ledger.record("planner", { inputTokens: 100, outputTokens: 50, totalTokens: 150 });
    ledger.record("stepper", { inputTokens: 200, outputTokens: 80, totalTokens: 280 }, {
      meta: { chapterIndex: 0 },
    });
    ledger.record("narrator", { inputTokens: 30, outputTokens: 20, totalTokens: 50 });

    const report = ledger.report();
    expect(report.calls).toHaveLength(3);
    expect(report.totals).toEqual({
      inputTokens: 330,
      outputTokens: 150,
      totalTokens: 480,
    });
    expect(report.byLabel.planner).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      calls: 1,
    });
    expect(report.byLabel.stepper?.calls).toBe(1);
    expect(report.calls[1]?.meta).toEqual({ chapterIndex: 0 });
  });

  test("infers totalTokens when omitted", () => {
    const ledger = new TokenLedger();
    ledger.record("planner", { inputTokens: 10, outputTokens: 5 });
    expect(ledger.report().totals.totalTokens).toBe(15);
  });
});

describe("normalizeTokenUsage", () => {
  test("handles LangChain and OpenAI field names", () => {
    expect(normalizeTokenUsage({ input_tokens: 1, output_tokens: 2, total_tokens: 3 })).toEqual({
      inputTokens: 1,
      outputTokens: 2,
      totalTokens: 3,
    });
    expect(normalizeTokenUsage({ prompt_tokens: 4, completion_tokens: 6 })).toEqual({
      inputTokens: 4,
      outputTokens: 6,
      totalTokens: 10,
    });
  });
});
