"use client";

import { useEffect, useState } from "react";

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function formatClock(d: Date) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}Z`;
}

export interface StatusLineProps {
  network: string;
  indexer: string;
  build: string;
}

export function StatusLine({ network, indexer, build }: StatusLineProps) {
  const [now, setNow] = useState<string>("---- -- -- --:--:--Z");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setNow(formatClock(new Date()));
    const id = setInterval(() => setNow(formatClock(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        borderTop: "1px solid var(--rule)",
        background: "var(--bg)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--type-12)",
        color: "var(--text-mute)",
        zIndex: 10,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          padding: "8px clamp(16px, 4vw, 48px)",
          gap: "var(--space-4)",
        }}
      >
        <div style={{ display: "flex", gap: "var(--space-5)", flexWrap: "wrap" }}>
          <span>
            <span style={{ color: "var(--text-mute)" }}>NET </span>
            <span style={{ color: "var(--text-dim)" }}>{network.toUpperCase()}</span>
          </span>
          <span>
            <span style={{ color: "var(--text-mute)" }}>INDEXER </span>
            <span style={{ color: "var(--text-dim)" }}>{indexer}</span>
          </span>
          <span>
            <span style={{ color: "var(--text-mute)" }}>BUILD </span>
            <span style={{ color: "var(--text-dim)" }}>{build}</span>
          </span>
        </div>
        <div suppressHydrationWarning style={{ color: mounted ? "var(--text-dim)" : "var(--text-mute)" }}>
          {now}
        </div>
      </div>
    </div>
  );
}
