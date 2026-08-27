"use client";

import { useEffect, useState } from "react";

export function Counter({
  startedAt,
  active,
  finalMs,
}: {
  startedAt: number | null;
  active: boolean;
  finalMs?: number;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active || startedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 50);
    return () => clearInterval(id);
  }, [active, startedAt]);

  const elapsed =
    typeof finalMs === "number"
      ? finalMs
      : startedAt !== null
        ? Math.max(0, now - startedAt)
        : 0;

  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        color: "var(--text-dim)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {elapsed.toFixed(0).padStart(5, "0")} ms
    </span>
  );
}
