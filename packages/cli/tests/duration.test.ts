import { describe, expect, it } from "vitest";

import { formatDuration, parseDuration } from "../src/duration.js";

describe("parseDuration", () => {
  it("handles all the common suffixes", () => {
    expect(parseDuration("500ms")).toBe(500);
    expect(parseDuration("30s")).toBe(30_000);
    expect(parseDuration("5m")).toBe(5 * 60_000);
    expect(parseDuration("2h")).toBe(2 * 3_600_000);
    expect(parseDuration("1d")).toBe(86_400_000);
  });

  it("treats a bare number as seconds", () => {
    expect(parseDuration("60")).toBe(60_000);
  });

  it("maps 0 / none to 0", () => {
    expect(parseDuration("0")).toBe(0);
    expect(parseDuration("none")).toBe(0);
  });

  it("maps inf / forever to Infinity", () => {
    expect(parseDuration("inf")).toBe(Infinity);
    expect(parseDuration("infinite")).toBe(Infinity);
    expect(parseDuration("forever")).toBe(Infinity);
  });

  it("accepts decimals", () => {
    expect(parseDuration("1.5s")).toBe(1500);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(parseDuration("  30S  ")).toBe(30_000);
  });

  it("throws on garbage", () => {
    expect(() => parseDuration("")).toThrow(/Empty duration/);
    expect(() => parseDuration("abc")).toThrow(/Cannot parse/);
    expect(() => parseDuration("5w")).toThrow(/Cannot parse/);
  });
});

describe("formatDuration", () => {
  it("renders with the biggest fitting unit", () => {
    expect(formatDuration(500)).toBe("500ms");
    expect(formatDuration(30_000)).toBe("30s");
    expect(formatDuration(5 * 60_000)).toBe("5m");
    expect(formatDuration(2 * 3_600_000)).toBe("2h");
  });

  it("handles edge cases", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(Infinity)).toBe("forever");
  });
});
