/**
 * Parse a human-friendly duration string into milliseconds.
 *
 * Accepts:
 *   - A bare integer ("60") — interpreted as seconds for backwards-compat with
 *     simple --timeout numbers.
 *   - A number followed by `ms`, `s`, `m`, `h`, or `d`.
 *   - `"0"` and `"none"` → `0` (unbounded).
 *   - `"inf"` / `"infinite"` / `"forever"` → `Infinity`.
 *
 * Throws if the input doesn't parse — fail loudly rather than silently
 * applying the wrong default.
 */
export function parseDuration(input: string): number {
  const trimmed = input.trim().toLowerCase();
  if (trimmed === "") {
    throw new Error("Empty duration. Try 30s, 5m, 1h, none, or forever.");
  }
  if (trimmed === "0" || trimmed === "none") return 0;
  if (trimmed === "inf" || trimmed === "infinite" || trimmed === "forever") {
    return Infinity;
  }

  const match = trimmed.match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)?$/);
  if (!match) {
    throw new Error(
      `Cannot parse duration "${input}". Use forms like 500ms, 30s, 5m, 1h.`,
    );
  }

  const value = Number(match[1]);
  const unit = match[2] ?? "s";
  const multiplier = {
    ms: 1,
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  }[unit];
  if (multiplier === undefined) {
    throw new Error(`Unknown duration unit "${unit}".`);
  }
  return value * multiplier;
}

/**
 * Inverse of `parseDuration` for friendly log lines. Picks the largest unit
 * that yields a small integer-ish number.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return "forever";
  if (ms <= 0) return "0s";
  const units: Array<[number, string]> = [
    [86_400_000, "d"],
    [3_600_000, "h"],
    [60_000, "m"],
    [1_000, "s"],
    [1, "ms"],
  ];
  for (const [step, label] of units) {
    if (ms >= step) {
      const value = ms / step;
      return `${Number.isInteger(value) ? value : value.toFixed(1)}${label}`;
    }
  }
  return `${ms}ms`;
}
