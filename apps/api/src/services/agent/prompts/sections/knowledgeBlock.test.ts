import { describe, expect, test } from "bun:test";
import { renderKnowledgeEntries } from "./knowledgeBlock.js";
import type { KnowledgeEntry } from "../../context/types.js";

const entry = (i: number, source: "dashboard" | "page", size = 80): KnowledgeEntry => ({
  title: `Fact ${i}`,
  content: "x".repeat(size),
  source,
});

describe("renderKnowledgeEntries", () => {
  test("small sets render fully with source tags, no marker", () => {
    const out = renderKnowledgeEntries([entry(1, "page"), entry(2, "dashboard")]);
    expect(out).toContain("(source: page) **Fact 1**");
    expect(out).toContain("(source: dashboard) **Fact 2**");
    expect(out).not.toContain("truncated");
  });

  test("overflow drops bodies before titles and leaves a visible marker", () => {
    const entries = Array.from({ length: 30 }, (_, i) => entry(i, "dashboard", 400));
    const out = renderKnowledgeEntries(entries);
    expect(out.length).toBeLessThan(7000);
    expect(out).toContain("truncated");
    // Early entries keep bodies; late surviving entries are title-only.
    expect(out).toContain("**Fact 0**");
    const titleOnly = out.split("\n").filter((l) => /\(source: dashboard\) Fact \d+$/.test(l));
    expect(titleOnly.length).toBeGreaterThan(0);
  });
});
