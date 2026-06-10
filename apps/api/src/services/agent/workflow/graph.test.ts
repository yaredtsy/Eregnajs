import { describe, expect, test } from "bun:test";
// Regression: LangGraph invokes each channel's default() at module load.
// A throwing default makes this import itself crash, so the import IS the test.
import { buildGraph, GraphAnnotation } from "./graph.js";

describe("workflow graph", () => {
  test("module imports without channel defaults throwing", () => {
    expect(GraphAnnotation).toBeDefined();
  });

  test("graph compiles", () => {
    const compiled = buildGraph();
    expect(compiled).toBeDefined();
  });
});
