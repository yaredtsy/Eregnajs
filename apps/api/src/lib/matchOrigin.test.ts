import { describe, expect, test } from "bun:test";
import { matchOrigin } from "./matchOrigin.js";

describe("matchOrigin", () => {
  test("exact origin with scheme", () => {
    expect(matchOrigin(["https://acme.com"], "https://acme.com")).toBe(true);
    expect(matchOrigin(["https://acme.com"], "http://acme.com")).toBe(false);
    expect(matchOrigin(["https://acme.com"], "https://evil.com")).toBe(false);
    expect(matchOrigin(["https://acme.com:8443"], "https://acme.com:8443")).toBe(true);
  });

  test("host-only pattern matches any scheme", () => {
    expect(matchOrigin(["acme.com"], "https://acme.com")).toBe(true);
    expect(matchOrigin(["acme.com"], "http://acme.com")).toBe(true);
    expect(matchOrigin(["acme.com"], "https://sub.acme.com")).toBe(false);
    expect(matchOrigin(["acme.com"], "https://notacme.com")).toBe(false);
  });

  test("wildcard subdomain", () => {
    expect(matchOrigin(["*.acme.com"], "https://app.acme.com")).toBe(true);
    expect(matchOrigin(["*.acme.com"], "https://deep.app.acme.com")).toBe(true);
    expect(matchOrigin(["*.acme.com"], "https://acme.com")).toBe(false);
    expect(matchOrigin(["*.acme.com"], "https://evilacme.com")).toBe(false);
  });

  test("localhost:* matches any port on localhost", () => {
    expect(matchOrigin(["localhost:*"], "http://localhost:5173")).toBe(true);
    expect(matchOrigin(["localhost:*"], "http://localhost")).toBe(true);
    expect(matchOrigin(["localhost:*"], "http://127.0.0.1:3000")).toBe(true);
    expect(matchOrigin(["localhost:*"], "https://localhost.evil.com")).toBe(false);
  });

  test("garbage origins and empty patterns are rejected", () => {
    expect(matchOrigin(["acme.com"], "not-an-origin")).toBe(false);
    expect(matchOrigin([""], "https://acme.com")).toBe(false);
    expect(matchOrigin([], "https://acme.com")).toBe(false);
  });

  test("case and trailing-slash insensitive", () => {
    expect(matchOrigin(["https://Acme.com/"], "https://acme.com")).toBe(true);
  });
});
