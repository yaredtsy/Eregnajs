import { describe, expect, test } from "bun:test";
import { buildManifest, elementKey, elementSelectors } from "./elementKey.js";
import type { ElementRow } from "../types.js";

function row(partial: Partial<ElementRow>): ElementRow {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    page_id: "p1",
    path: "root",
    parent_id: null,
    label: "Export button",
    dom_id: null,
    css_selector: null,
    xpath: null,
    description: null,
    notes: null,
    embedding: null,
    key: undefined as unknown as string, // simulates a pre-migration row
    selectors: [],
    sort_order: 0,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

describe("elementKey", () => {
  test("prefers key, falls back to dom_id, then short id", () => {
    expect(elementKey(row({ key: "billing.export" }))).toBe("billing.export");
    expect(elementKey(row({ dom_id: "export-btn" }))).toBe("export-btn");
    expect(elementKey(row({}))).toBe("00000000");
  });
});

describe("elementSelectors", () => {
  test("uses stored selectors when present, ignoring malformed entries", () => {
    const sels = elementSelectors(
      row({ selectors: [{ kind: "css", value: ".export" }, { kind: "nope" }, "junk"] as never }),
    );
    expect(sels).toEqual([{ kind: "css", value: ".export" }]);
  });

  test("builds from legacy columns in order dom-id then css", () => {
    const sels = elementSelectors(row({ dom_id: "export-btn", css_selector: ".export" }));
    expect(sels).toEqual([
      { kind: "dom-id", value: "export-btn" },
      { kind: "css", value: ".export" },
    ]);
  });

  test("falls back to a text match on the label as last resort", () => {
    expect(elementSelectors(row({}))).toEqual([{ kind: "text", value: "Export button" }]);
  });
});

describe("buildManifest", () => {
  test("maps keys to labels and selectors", () => {
    const manifest = buildManifest([
      row({ key: "orders.export", dom_id: "export-btn", label: "Export" }),
    ]);
    expect(manifest["orders.export"]).toEqual({
      label: "Export",
      selectors: [{ kind: "dom-id", value: "export-btn" }],
    });
  });
});
